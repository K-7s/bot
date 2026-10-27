const { RateLimiter } = require('../utils/rateLimiter');

/**
 * Auto-Reaction rules — scoped strictly to (botId, guildId, channelId).
 * Each managed bot has its own listener; rules never leak across bots.
 */
class ReactionManager {
  constructor(store, tokenManager, logManager) {
    this.store = store;
    this.tokenManager = tokenManager;
    this.logManager = logManager;
    this.limiter = new RateLimiter();
    this.attached = new Set(); // botIds we've already attached the messageCreate listener to
  }

  list(botId = null) {
    const rules = this.store.read().reactions || [];
    return botId ? rules.filter((r) => r.botId === botId) : rules;
  }

  addRule({ botId, guildId, channelId, emoji, enabled = true }) {
    const id = `rx_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`;
    this.store.update((db) => {
      db.reactions = db.reactions || [];
      db.reactions.push({ id, botId, guildId, channelId, emoji, enabled, createdAt: Date.now() });
    });
    this.logManager.log('REACTION_RULE_ADDED', 'تمت إضافة رول Auto Reaction آمنة', { id, botId, guildId, channelId, emoji });
    return id;
  }

  removeRule(ruleId) {
    this.store.update((db) => {
      db.reactions = (db.reactions || []).filter((r) => r.id !== ruleId);
    });
  }

  toggle(ruleId, enabled) {
    this.store.update((db) => {
      const r = (db.reactions || []).find((x) => x.id === ruleId);
      if (r) r.enabled = enabled;
    });
  }

  /** Attach the listener once per bot client. Safe to call multiple times. */
  attach(client, botId) {
    if (this.attached.has(botId)) return;
    this.attached.add(botId);

    client.on('messageCreate', async (message) => {
      if (!message.guild || message.author.bot) return;
      const rules = (this.store.read().reactions || []).filter(
        (r) => r.enabled && r.botId === botId && r.guildId === message.guild.id && r.channelId === message.channel.id
      );
      if (!rules.length) return;

      // Global per-bot cap: no more than 20 reactions per 10s, regardless of how many rules match.
      if (!this.limiter.allow(`bot:${botId}`, 20, 10_000)) return;

      for (const r of rules) {
        // Per-rule cooldown so a busy channel doesn't get double/triple reacted in a burst.
        if (!this.limiter.allow(`rule:${r.id}`, 1, 3_000)) continue;
        await message.react(r.emoji).catch((e) => this.logManager.log('REACTION_ERROR', e.message, { ruleId: r.id }));
      }
    });
  }
}

module.exports = { ReactionManager };
