const { Client, GatewayIntentBits, Partials, ActivityType } = require('discord.js');
const { encrypt, decrypt, maskToken, looksLikeBotToken } = require('../utils/crypto');

const ACTIVITY_MAP = {
  Playing: ActivityType.Playing,
  Watching: ActivityType.Watching,
  Listening: ActivityType.Listening,
  Competing: ActivityType.Competing,
};

// ---- Auto restart tuning ----
const AUTO_RESTART_BASE_DELAY_MS = 5_000;   // first retry delay
const AUTO_RESTART_MAX_DELAY_MS  = 60_000;  // capped exponential backoff
const AUTO_RESTART_MAX_TRIES     = 8;       // give up after N consecutive failures
const AUTO_RESTART_COOLDOWN_MS   = 5 * 60_000; // reset failure counter after this much stability

/**
 * TokenManager owns the full lifecycle of every managed bot:
 *   add → start → (auto-restart on offline) → stop → remove
 *
 * Each managed bot has its own isolated Discord Client — nothing is shared
 * across bots, so a single crashing token can never affect any other bot.
 */
class TokenManager {
  constructor(store, logManager) {
    this.store = store;
    this.logManager = logManager;
    this.clients = new Map();          // botId -> Client
    this.autoRestartTimers = new Map(); // botId -> timeout
    this.autoRestartTries  = new Map(); // botId -> consecutive failure count
    this.stableSince       = new Map(); // botId -> timestamp of last successful ready
    /** called with (botId, client) right after a managed bot's client fires 'ready' */
    this.onBotReady = [];
  }

  list() {
    return this.store.read().bots || [];
  }

  get(id) {
    return this.list().find((b) => b.id === id);
  }

  async add(token, label = 'Managed Bot') {
    if (!looksLikeBotToken(token)) {
      throw new Error('التوكن ده مش شكله توكن Bot رسمي. الأداة بتدعم Official Discord Bot Tokens بس — ممنوع User Tokens/Selfbot.');
    }
    const id = `bot_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    this.store.update((db) => {
      db.bots.push({
        id,
        label,
        tokenEnc: encrypt(token),
        status: 'Offline',
        error: null,
        clientId: null,
        username: null,
        // Each bot has its OWN voice slot — including which guild/channel it should
        // stay pinned to, plus its mute/deafen state so it survives restarts.
        voice: {
          keepAlive: false,
          guildId: null,
          channelId: null,
          failCount: 0,
          paused: false,
          selfMute: false,
          selfDeaf: true,
        },
        statusConfig: { enabled: false, items: [] },
        autoRestart: true, // default ON — matches user's "if offline, restart automatically"
        createdAt: Date.now(),
      });
    });
    await this.logManager.log('BOT_ADDED', `تمت إضافة بوت جديد باسم ${label}`, { id, token: maskToken(token) });
    return id;
  }

  async remove(id) {
    this._clearAutoRestartTimer(id);
    await this.stop(id, /*disableAutoRestart*/ true);
    this.store.update((db) => {
      db.bots = db.bots.filter((b) => b.id !== id);
      db.reactions = (db.reactions || []).filter((r) => r.botId !== id);
    });
    await this.logManager.log('BOT_REMOVED', `تم حذف البوت ${id}`, { botId: id });
  }

  async start(id) {
    const rec = this.get(id);
    if (!rec) throw new Error('البوت ده مش موجود');
    if (this.clients.has(id)) return this.clients.get(id);

    this._setStatus(id, 'Connecting');
    const token = decrypt(rec.tokenEnc);

    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent,
      ],
      partials: [Partials.Channel],
    });

    client.once('ready', async () => {
      this.stableSince.set(id, Date.now());
      this.autoRestartTries.set(id, 0);
      this.store.update((db) => {
        const bot = db.bots.find((b) => b.id === id);
        if (bot) {
          bot.status = 'Online';
          bot.error = null;
          bot.clientId = client.user.id;
          bot.username = client.user.tag;
          bot.lastReadyAt = Date.now();
        }
      });
      await this.logManager.log('BOT_ONLINE', `${client.user.tag} بقى Online`, { botId: id, clientId: client.user.id });
      for (const cb of this.onBotReady) {
        try {
          await cb(id, client);
        } catch (e) {
          await this.logManager.log('RESTORE_ERROR', e.message, { botId: id });
        }
      }
    });

    // If Discord fully disconnects the shard and it can't come back on its
    // own → schedule an auto-restart (unless the owner disabled it).
    client.on('shardDisconnect', () => {
      this._maybeScheduleAutoRestart(id, 'shardDisconnect');
    });

    client.on('error', (e) => this.logManager.log('BOT_ERROR', e.message, { botId: id }));
    client.on('shardError', (e) => this.logManager.log('BOT_SHARD_ERROR', e.message, { botId: id }));

    try {
      await client.login(token);
      this.clients.set(id, client);
      return client;
    } catch (err) {
      this._setStatus(id, 'Error', err.message);
      await this.logManager.log('TOKEN_LOGIN_ERROR', `فشل تسجيل دخول بوت ${rec.label}: ${err.message}`, { botId: id });
      client.destroy();
      // A login failure is also worth an auto-restart attempt (e.g. temporary Discord outage).
      this._maybeScheduleAutoRestart(id, 'loginError');
      throw err;
    }
  }

  /**
   * @param {string} id
   * @param {boolean} disableAutoRestart when true, this stop is user-initiated and we
   *   should NOT auto-restart afterwards (Stop button, Remove, Stop All).
   */
  async stop(id, disableAutoRestart = false) {
    if (disableAutoRestart) this._clearAutoRestartTimer(id);
    const client = this.clients.get(id);
    if (client) {
      client.destroy();
      this.clients.delete(id);
    }
    this._setStatus(id, 'Offline');
    await this.logManager.log('BOT_STOPPED', `تم إيقاف ${id}`, { botId: id });
    if (!disableAutoRestart) this._maybeScheduleAutoRestart(id, 'stop');
  }

  async restart(id) {
    await this.stop(id, /*disableAutoRestart*/ true);
    await this.logManager.log('BOT_RESTARTED', `جاري إعادة تشغيل ${id}`, { botId: id });
    return this.start(id);
  }

  async startAll() {
    for (const b of this.list()) {
      await this.start(b.id).catch(() => null);
    }
  }

  async stopAll() {
    for (const b of this.list()) {
      await this.stop(b.id, /*disableAutoRestart*/ true).catch(() => null);
    }
  }

  setAutoRestart(id, enabled) {
    this.store.update((db) => {
      const b = db.bots.find((x) => x.id === id);
      if (b) b.autoRestart = !!enabled;
    });
    if (!enabled) this._clearAutoRestartTimer(id);
    this.logManager.log(
      enabled ? 'AUTO_RESTART_ENABLED' : 'AUTO_RESTART_DISABLED',
      `Auto Restart ${enabled ? 'اتفعل' : 'اتوقف'} للبوت ${id}`,
      { botId: id }
    );
  }

  /**
   * Schedule an auto-restart with exponential backoff.
   * We reset the counter after AUTO_RESTART_COOLDOWN_MS of stable uptime,
   * so a bot that dies once a week doesn't slowly march toward giving up.
   */
  _maybeScheduleAutoRestart(id, reason) {
    const rec = this.get(id);
    if (!rec || rec.autoRestart === false) return;
    if (this.autoRestartTimers.has(id)) return; // already scheduled

    // If it stayed stable for a long stretch, forgive previous failures.
    const stableFor = Date.now() - (this.stableSince.get(id) || 0);
    if (stableFor > AUTO_RESTART_COOLDOWN_MS) this.autoRestartTries.set(id, 0);

    const tries = (this.autoRestartTries.get(id) || 0) + 1;
    this.autoRestartTries.set(id, tries);

    if (tries > AUTO_RESTART_MAX_TRIES) {
      this.logManager.log(
        'BOT_AUTO_RESTART_GIVEUP',
        `البوت ${id} فشل يرجع online بعد ${AUTO_RESTART_MAX_TRIES} محاولات — Auto Restart اتوقف مؤقتًا. راجع التوكن.`,
        { botId: id, reason }
      );
      return;
    }

    const delay = Math.min(AUTO_RESTART_BASE_DELAY_MS * tries, AUTO_RESTART_MAX_DELAY_MS);
    this.logManager.log(
      'BOT_AUTO_RESTART',
      `Auto Restart رقم ${tries} للبوت ${id} خلال ${Math.round(delay / 1000)} ثانية (السبب: ${reason})`,
      { botId: id }
    );

    const t = setTimeout(async () => {
      this.autoRestartTimers.delete(id);
      try {
        await this.start(id);
      } catch (_) {
        // start() already logs + reschedules on failure
      }
    }, delay);
    this.autoRestartTimers.set(id, t);
  }

  _clearAutoRestartTimer(id) {
    const t = this.autoRestartTimers.get(id);
    if (t) clearTimeout(t);
    this.autoRestartTimers.delete(id);
    this.autoRestartTries.set(id, 0);
  }

  _setStatus(id, status, error = null) {
    this.store.update((db) => {
      const b = db.bots.find((x) => x.id === id);
      if (b) {
        b.status = status;
        b.error = error;
        b.updatedAt = Date.now();
      }
    });
  }

  getClient(id) {
    return this.clients.get(id);
  }

  /** All currently-online bot clients. Used by Join All. */
  onlineClients() {
    return [...this.clients.entries()]
      .filter(([, c]) => c?.isReady?.())
      .map(([id, c]) => ({ id, client: c }));
  }

  getInvite(id) {
    const bot = this.get(id);
    const clientId = bot?.clientId;
    if (!clientId) return null;
    // Sensible default perms: view/send/embed/react/connect+speak voice. Owner can widen from Developer Portal if needed.
    const permissions = '3165184';
    return `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=${permissions}&scope=bot%20applications.commands`;
  }

  async setUsername(id, name) {
    const c = this.getClient(id);
    if (!c) throw new Error('البوت لازم يكون Online الأول');
    await c.user.setUsername(name);
    await this.logManager.log('BOT_USERNAME_CHANGED', `تم تغيير اسم البوت إلى ${name}`, { botId: id });
  }

  async setAvatar(id, url) {
    const c = this.getClient(id);
    if (!c) throw new Error('البوت لازم يكون Online الأول');
    await c.user.setAvatar(url);
    await this.logManager.log('BOT_AVATAR_CHANGED', 'تم تغيير صورة البوت', { botId: id });
  }

  async setPresence(id, type, text) {
    const c = this.getClient(id);
    if (!c) throw new Error('البوت لازم يكون Online الأول');
    if (!ACTIVITY_MAP[type]) throw new Error('Type لازم يكون واحد من: Playing, Watching, Listening, Competing');
    c.user.setPresence({ activities: [{ name: text, type: ACTIVITY_MAP[type] }], status: 'online' });
    await this.logManager.log('STATUS_CHANGED', `${id} => ${type} ${text}`, { botId: id });
  }
}

module.exports = { TokenManager, ACTIVITY_MAP };
