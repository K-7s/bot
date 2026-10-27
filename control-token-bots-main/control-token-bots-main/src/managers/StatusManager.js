const { ACTIVITY_MAP } = require('./TokenManager');

/**
 * Rotates a bot's presence between multiple activities on a per-bot timer.
 * Each bot has its own timer — none of them share state.
 */
class StatusManager {
  constructor(store, tokenManager, logManager) {
    this.store = store;
    this.tokenManager = tokenManager;
    this.logManager = logManager;
    this.timers = new Map(); // botId -> timeout handle
  }

  /**
   * items: [{ type: 'Playing'|'Watching'|'Listening'|'Competing', text: string, seconds: number }, ...]
   */
  startRotation(botId, items) {
    this.stopRotation(botId, false);
    if (!Array.isArray(items) || !items.length) {
      throw new Error('لازم تحط سطر واحد على الأقل. الصيغة: Type|النص|الثواني');
    }

    const clean = items.map((it) => ({
      type: ACTIVITY_MAP[it.type] ? it.type : 'Playing',
      text: String(it.text || '').slice(0, 128),
      seconds: Math.max(5, Number(it.seconds) || 10),
    }));

    this.store.update((db) => {
      const b = db.bots.find((x) => x.id === botId);
      if (b) b.statusConfig = { enabled: true, items: clean };
    });

    let index = 0;
    const apply = () => {
      const client = this.tokenManager.getClient(botId);
      if (client?.user) {
        const item = clean[index % clean.length];
        index++;
        client.user.setPresence({
          status: 'online',
          activities: [{ name: item.text, type: ACTIVITY_MAP[item.type] }],
        });
        this.timers.set(botId, setTimeout(apply, item.seconds * 1000));
      } else {
        // client not ready yet (e.g. still connecting) — retry shortly without hammering anything
        this.timers.set(botId, setTimeout(apply, 5000));
      }
    };
    apply();
    this.logManager.log('STATUS_ROTATION_ON', `تم تشغيل تبديل الحالات للبوت ${botId} (${clean.length} حالة)`, { botId });
  }

  stopRotation(botId, persist = true) {
    const t = this.timers.get(botId);
    if (t) clearTimeout(t);
    this.timers.delete(botId);
    if (persist) {
      this.store.update((db) => {
        const b = db.bots.find((x) => x.id === botId);
        if (b?.statusConfig) b.statusConfig.enabled = false;
      });
      this.logManager.log('STATUS_ROTATION_OFF', `تم إيقاف تبديل الحالات للبوت ${botId}`, { botId });
    }
  }

  /** Called automatically once a specific bot comes online, so rotation survives restarts. */
  restoreForBot(botId) {
    const b = this.tokenManager.get(botId);
    if (b?.statusConfig?.enabled && b.statusConfig.items?.length) {
      this.startRotation(botId, b.statusConfig.items);
    }
  }
}

module.exports = { StatusManager };
