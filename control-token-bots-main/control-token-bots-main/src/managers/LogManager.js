const { EmbedBuilder } = require('discord.js');
const { BRAND_FOOTER, LOG_STYLE, LOG_INFO } = require('../utils/constants');

/**
 * Colored/iconified logger.
 *
 * Every log entry maps to a semantic category:
 *   🟢 Voice   — voice join/leave/move/mute/deafen
 *   🔴 Error   — anything that failed
 *   🟡 Restart — restarts, retries, auto-recovery
 *   🔵 Login   — connection lifecycle, config changes
 *   🟣 Info    — fallback (brand purple)
 *
 * Instead of plain text lines in the log channel, we now push a real
 * Discord embed with the right color + emoji title, so you can visually
 * scan a long log channel and immediately spot what happened.
 */
class LogManager {
  constructor(store, controllerClient) {
    this.store = store;
    this.controllerClient = controllerClient;
  }

  _style(type) {
    return LOG_STYLE[type] || { emoji: '🟣', color: LOG_INFO, category: 'Info' };
  }

  /** type: short event code, message: human text (Arabic ok), meta: small object (never put raw tokens in here) */
  async log(type, message, meta = {}) {
    const style = this._style(type);
    const safeMeta = JSON.stringify(meta, (k, v) => (k.toLowerCase().includes('token') ? '[hidden]' : v));

    // Console: colored prefix so tailing logs on the server is readable too.
    console.log(`${style.emoji} [${new Date().toISOString()}] [${style.category}] [${type}] ${message} ${safeMeta}`);

    // Persist to the local audit log (bounded to 300 entries).
    this.store.update((db) => {
      db.audit = db.audit || [];
      db.audit.unshift({
        at: Date.now(),
        type,
        category: style.category,
        emoji: style.emoji,
        message,
        meta: JSON.parse(safeMeta),
      });
      db.audit = db.audit.slice(0, 300);
    });

    // Discord channel embed — only if the owner has configured one.
    const channelId = this.store.read().settings?.logChannelId;
    if (!channelId || !this.controllerClient?.isReady?.()) return;
    const ch = await this.controllerClient.channels.fetch(channelId).catch(() => null);
    if (!ch || !ch.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setColor(style.color)
      .setAuthor({ name: `${style.emoji} ${style.category}` })
      .setTitle(type)
      .setDescription(String(message).slice(0, 4000))
      .setFooter({ text: BRAND_FOOTER })
      .setTimestamp();

    // Small hint fields (bot / guild / channel) if provided — makes long log
    // channels searchable without dumping the whole meta JSON as noise.
    const hintFields = [];
    if (meta.botId) hintFields.push({ name: 'Bot', value: `\`${meta.botId}\``, inline: true });
    if (meta.guildId) hintFields.push({ name: 'Guild', value: `\`${meta.guildId}\``, inline: true });
    if (meta.channelId) hintFields.push({ name: 'Channel', value: `<#${meta.channelId}>`, inline: true });
    if (hintFields.length) embed.addFields(hintFields);

    await ch.send({ embeds: [embed] }).catch(() => null);
  }
}

module.exports = { LogManager };
