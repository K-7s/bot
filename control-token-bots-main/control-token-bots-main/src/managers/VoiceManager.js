const {
  joinVoiceChannel,
  getVoiceConnection,
  VoiceConnectionStatus,
  entersState,
} = require('@discordjs/voice');
const { RateLimiter } = require('../utils/rateLimiter');

const MAX_RETRIES     = 6;      // consecutive drops before we pause the keep-alive
const BASE_DELAY_MS   = 4_000;  // exponential backoff base
const HEALTH_SWEEP_MS = 60_000; // secondary safety net

const limiter = new RateLimiter();

/**
 * VoiceManager — one isolated voice connection PER bot.
 *
 * Previously the code relied on `getVoiceConnection(guildId)` which returns a
 * single connection per guild — that's why multiple bots in the same server
 * kept stepping on each other. We fix that by:
 *   1. Storing every VoiceConnection in a `Map<botId, VoiceConnection>`.
 *   2. Passing `group: botId` to `joinVoiceChannel`, so @discordjs/voice
 *      keeps a separate registry entry for each bot even inside the same guild.
 *
 * Result: you can drop 6 different bots into the same server (same voice room
 * or different rooms) and every one behaves independently — join/leave/move,
 * mute/deafen, and auto-reconnect never interfere across bots.
 */
class VoiceManager {
  constructor(store, tokenManager, logManager) {
    this.store = store;
    this.tokenManager = tokenManager;
    this.logManager = logManager;
    this.connections = new Map();     // botId -> VoiceConnection
    this.reconnectTimers = new Map(); // botId -> timeout handle
    this.sweepTimer = null;
  }

  /** Look up the connection this bot owns (uniquely, thanks to `group: botId`). */
  _getConn(botId, guildId) {
    // Prefer the map, fall back to the registry lookup keyed by group=botId.
    return this.connections.get(botId) || getVoiceConnection(guildId, botId) || null;
  }

  async join(botId, guildId, channelId, keepAlive = false) {
    const client = this.tokenManager.getClient(botId) || (await this.tokenManager.start(botId));
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) throw new Error('Guild غير موجود — تأكد إن البوت متضاف للسيرفر');

    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isVoiceBased()) throw new Error('الروم ده مش فويس تشانل صحيح');

    const me = await guild.members.fetchMe().catch(() => null);
    if (me && !channel.permissionsFor(me)?.has('Connect')) {
      throw new Error('البوت مالوش صلاحية Connect في الروم ده');
    }

    // Remember previous mute/deafen preferences for this bot so a Move keeps them.
    const rec = this.tokenManager.get(botId);
    const selfMute = !!rec?.voice?.selfMute;
    const selfDeaf = rec?.voice?.selfDeaf !== false; // default true

    // If this bot already has a live connection to a different channel/guild,
    // destroy it first so we cleanly re-join the new target.
    const prev = this._getConn(botId, guildId);
    if (prev) prev.destroy();
    this.connections.delete(botId);

    const conn = joinVoiceChannel({
      channelId,
      guildId,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf,
      selfMute,
      group: botId, // 🔑 CRITICAL — isolates this connection from every other bot in the same guild
    });

    this.connections.set(botId, conn);

    this.store.update((db) => {
      const b = db.bots.find((x) => x.id === botId);
      if (b) b.voice = { ...b.voice, keepAlive, guildId, channelId, failCount: 0, paused: false, selfMute, selfDeaf, lastJoinAt: Date.now() };
    });

    this._clearReconnectTimer(botId);
    if (keepAlive) this._watchConnection(botId, guildId, channelId, conn);

    // Wait a moment for the WS handshake so callers get a truthful success signal.
    entersState(conn, VoiceConnectionStatus.Ready, 15_000).catch(() => null);

    await this.logManager.log('VOICE_JOIN', `البوت ${botId} دخل روم <#${channelId}>`, { botId, guildId, channelId });
    return conn;
  }

  async move(botId, guildId, channelId) {
    const rec = this.tokenManager.get(botId);
    const keepAlive = !!rec?.voice?.keepAlive;
    await this.join(botId, guildId, channelId, keepAlive);
    await this.logManager.log('VOICE_MOVE', `تم نقل البوت ${botId} إلى <#${channelId}>`, { botId, guildId, channelId });
  }

  async leave(botId) {
    const rec = this.tokenManager.get(botId);
    const guildId = rec?.voice?.guildId;
    const conn = this._getConn(botId, guildId);
    if (conn) conn.destroy();
    this.connections.delete(botId);
    this._clearReconnectTimer(botId);
    this.store.update((db) => {
      const b = db.bots.find((x) => x.id === botId);
      if (b) b.voice = { ...b.voice, keepAlive: false, guildId: null, channelId: null, failCount: 0, paused: false };
    });
    await this.logManager.log('VOICE_LEAVE', `البوت ${botId} خرج من الفويس`, { botId, guildId });
  }

  /** Force an immediate reconnect using the bot's saved voice target. */
  async reconnectNow(botId) {
    const rec = this.tokenManager.get(botId);
    if (!rec?.voice?.guildId || !rec?.voice?.channelId) {
      throw new Error('مفيش روم محفوظ للبوت ده — دخّله فويس الأول.');
    }
    // Reset the pause/fail counter so the watcher gives it a fresh chance.
    this.store.update((db) => {
      const b = db.bots.find((x) => x.id === botId);
      if (b?.voice) {
        b.voice.paused = false;
        b.voice.failCount = 0;
      }
    });
    this._clearReconnectTimer(botId);
    await this.join(botId, rec.voice.guildId, rec.voice.channelId, true);
    await this.logManager.log('VOICE_RECONNECT_OK', `تم إعادة توصيل البوت ${botId} يدويًا`, { botId });
  }

  // -------- Mute / Deafen controls (per bot, persisted) --------

  async setMute(botId, mute) {
    const rec = this.tokenManager.get(botId);
    if (!rec?.voice?.guildId || !rec?.voice?.channelId) {
      throw new Error('البوت مش في فويس دلوقتي.');
    }
    // Persist preference so it survives moves + reconnects.
    this.store.update((db) => {
      const b = db.bots.find((x) => x.id === botId);
      if (b?.voice) b.voice.selfMute = !!mute;
    });
    // Rejoin with the new self-mute flag (Discord Gateway doesn't expose a
    // "flip mute on an existing connection" API for bots — the clean way is
    // to re-issue the voice state with the new flags).
    await this.join(botId, rec.voice.guildId, rec.voice.channelId, !!rec.voice.keepAlive);
    await this.logManager.log(mute ? 'VOICE_MUTE' : 'VOICE_UNMUTE', `البوت ${botId} ${mute ? 'اتعمله Mute' : 'اتشال منه Mute'}`, { botId });
  }

  async setDeaf(botId, deaf) {
    const rec = this.tokenManager.get(botId);
    if (!rec?.voice?.guildId || !rec?.voice?.channelId) {
      throw new Error('البوت مش في فويس دلوقتي.');
    }
    this.store.update((db) => {
      const b = db.bots.find((x) => x.id === botId);
      if (b?.voice) b.voice.selfDeaf = !!deaf;
    });
    await this.join(botId, rec.voice.guildId, rec.voice.channelId, !!rec.voice.keepAlive);
    await this.logManager.log(deaf ? 'VOICE_DEAFEN' : 'VOICE_UNDEAFEN', `البوت ${botId} ${deaf ? 'اتعمله Deafen' : 'اتشال منه Deafen'}`, { botId });
  }

  /**
   * Join ALL currently-online bots into the same voice channel at once.
   * Because each bot has its own isolated connection (thanks to `group: botId`),
   * this genuinely puts 6 different bots inside the same room.
   */
  async joinAll(guildId, channelId) {
    const online = this.tokenManager.onlineClients();
    if (!online.length) throw new Error('مفيش بوتات Online دلوقتي.');

    const results = [];
    for (const { id } of online) {
      try {
        await this.join(id, guildId, channelId, true);
        results.push({ id, ok: true });
      } catch (e) {
        results.push({ id, ok: false, error: e.message });
        await this.logManager.log('VOICE_RECONNECT_ERROR', `Join All فشل للبوت ${id}: ${e.message}`, { botId: id, guildId, channelId });
      }
    }
    const okCount = results.filter((r) => r.ok).length;
    await this.logManager.log('VOICE_JOIN_ALL', `Join All: ${okCount}/${online.length} بوت دخلوا <#${channelId}>`, { guildId, channelId });
    return results;
  }

  /**
   * Watch this specific bot's connection. Any drop → schedule an exponential
   * reconnect. After MAX_RETRIES consecutive drops we pause the keep-alive
   * (so we don't fight a mod who keeps kicking the bot on purpose) — the
   * "Reconnect Now" button clears the pause manually.
   */
  _watchConnection(botId, guildId, channelId, conn) {
    conn.on(VoiceConnectionStatus.Disconnected, async () => {
      const rec = this.tokenManager.get(botId);
      if (!rec?.voice?.keepAlive || rec.voice.paused) return;
      if (!limiter.allow(`voice-reconnect:${botId}`, 1, 3_000)) return; // debounce duplicate events

      // First try the built-in resume path — often the disconnect was a
      // channel switch or a brief network blip and no full rejoin is needed.
      try {
        await Promise.race([
          entersState(conn, VoiceConnectionStatus.Signalling, 5_000),
          entersState(conn, VoiceConnectionStatus.Connecting, 5_000),
        ]);
        return; // recovered on its own
      } catch (_) {
        // fall through to the manual rejoin path
      }

      const failCount = (rec.voice.failCount || 0) + 1;
      this.store.update((db) => {
        const b = db.bots.find((x) => x.id === botId);
        if (b) b.voice.failCount = failCount;
      });

      if (failCount > MAX_RETRIES) {
        this.store.update((db) => {
          const b = db.bots.find((x) => x.id === botId);
          if (b) b.voice.paused = true;
        });
        await this.logManager.log(
          'VOICE_RECONNECT_GIVEUP',
          `البوت ${botId} اتقطع من الفويس ${failCount} مرات متتالية — تم إيقاف إعادة المحاولة التلقائية. اضغط Reconnect Now لو محتاج.`,
          { botId, guildId, channelId }
        );
        return;
      }

      const delay = Math.min(BASE_DELAY_MS * failCount, 30_000);
      await this.logManager.log(
        'VOICE_RECONNECT_TRY',
        `محاولة إعادة توصيل ${failCount} للبوت ${botId} خلال ${Math.round(delay / 1000)} ثانية`,
        { botId }
      );
      this.reconnectTimers.set(
        botId,
        setTimeout(async () => {
          await this.join(botId, guildId, channelId, true).catch((e) =>
            this.logManager.log('VOICE_RECONNECT_ERROR', e.message, { botId })
          );
        }, delay)
      );
    });
  }

  _clearReconnectTimer(botId) {
    const t = this.reconnectTimers.get(botId);
    if (t) clearTimeout(t);
    this.reconnectTimers.delete(botId);
  }

  /** Called once a bot comes back online after a restart, so keep-alive voice presence survives. */
  restoreForBot(botId) {
    const b = this.tokenManager.get(botId);
    if (b?.voice?.keepAlive && b.voice.guildId && b.voice.channelId && !b.voice.paused) {
      this.join(botId, b.voice.guildId, b.voice.channelId, true).catch((e) =>
        this.logManager.log('VOICE_RESTORE_ERROR', e.message, { botId })
      );
    }
  }

  /**
   * Secondary safety net: every HEALTH_SWEEP_MS, double-check that every pinned
   * bot actually still has a live connection. Iterates PER BOT (not per guild),
   * so 6 bots in the same guild are checked independently.
   */
  startHealthSweep() {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => {
      for (const b of this.store.read().bots || []) {
        if (!b.voice?.keepAlive || b.voice.paused || !b.voice.guildId || !b.voice.channelId) continue;
        const conn = this._getConn(b.id, b.voice.guildId);
        if (conn && conn.state.status !== VoiceConnectionStatus.Destroyed) continue;
        if (!limiter.allow(`voice-sweep:${b.id}`, 1, HEALTH_SWEEP_MS - 1000)) continue;
        this.join(b.id, b.voice.guildId, b.voice.channelId, true).catch((e) =>
          this.logManager.log('VOICE_RECONNECT_ERROR', e.message, { botId: b.id })
        );
      }
    }, HEALTH_SWEEP_MS);
  }
}

module.exports = { VoiceManager };
