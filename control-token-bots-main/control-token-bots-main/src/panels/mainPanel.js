const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
} = require('discord.js');
const { COLOR, DARK, BRAND_FOOTER, BRAND_NAME } = require('../utils/constants');

/**
 * All panels share the same visual language:
 *   • Dark background embed with purple accent
 *   • Consistent iconography (dot markers, small emoji)
 *   • Native Discord components only (buttons, select menus, modals)
 *
 * The main goal is that every screen feels like part of ONE product built
 * by a real, careful developer — no random emoji spam, no color soup.
 */

const DOT = { on: '🟢', off: '⚪', warn: '🟡', err: '🔴', voice: '🎙️', purple: '🟣' };

function mainPanel(store) {
  const db = store.read();
  const bots = db.bots || [];
  const online = bots.filter((b) => b.status === 'Online').length;
  const inVoice = bots.filter((b) => b.voice?.channelId).length;
  const paused = bots.filter((b) => b.voice?.paused).length;
  const autoRestartOn = bots.filter((b) => b.autoRestart !== false).length;

  const desc = [
    '**بانل واحد يتحكم في كل البوتات — Voice، Status، Reactions، وLogs.**',
    '',
    'كل بوت عنده اتصال Voice مستقل بالكامل — تقدر تحط ٦ بوتات في نفس السيرفر ونفس الروم من غير أي تعارض.',
  ].join('\n');

  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setAuthor({ name: BRAND_NAME })
    .setTitle('Control Panel')
    .setDescription(desc)
    .addFields(
      { name: `${DOT.on} Online`, value: `**${online}** / ${bots.length}`, inline: true },
      { name: `${DOT.voice} In Voice`, value: `**${inVoice}**`, inline: true },
      { name: `${DOT.warn} Paused`, value: `**${paused}**`, inline: true },
      { name: '♻️ Auto Restart', value: `**${autoRestartOn}** بوت شغال عليه`, inline: true },
      { name: '📋 Logs Channel', value: db.settings?.logChannelId ? `<#${db.settings.logChannelId}>` : 'مش متحدد', inline: true },
      { name: '🕒 Last Update', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
    )
    .setFooter({ text: BRAND_FOOTER })
    .setTimestamp();

  // Row 1 — primary actions
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ct:add_bot').setStyle(ButtonStyle.Success).setLabel('Add Bot').setEmoji('➕'),
    new ButtonBuilder().setCustomId('ct:refresh').setStyle(ButtonStyle.Secondary).setLabel('Refresh').setEmoji('🔄'),
    new ButtonBuilder().setCustomId('ct:voice_overview').setStyle(ButtonStyle.Primary).setLabel('Voice Overview').setEmoji('🎙️'),
    new ButtonBuilder().setCustomId('ct:logs').setStyle(ButtonStyle.Secondary).setLabel('Logs').setEmoji('📋')
  );

  // Row 2 — bulk actions
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ct:start_all').setStyle(ButtonStyle.Success).setLabel('Start All').setEmoji('▶️'),
    new ButtonBuilder().setCustomId('ct:stop_all').setStyle(ButtonStyle.Danger).setLabel('Stop All').setEmoji('⏹️'),
    new ButtonBuilder().setCustomId('ct:join_all').setStyle(ButtonStyle.Primary).setLabel('Join All → Voice').setEmoji('📞')
  );

  const options = bots.slice(0, 25).map((b) => {
    const marker = b.status === 'Online' ? DOT.on : b.status === 'Error' ? DOT.err : b.status === 'Connecting' ? DOT.warn : DOT.off;
    const voice = b.voice?.channelId ? ' • in voice' : '';
    return {
      label: (b.label || b.username || b.id).slice(0, 100),
      description: `${b.status || 'Offline'}${voice}`.slice(0, 100),
      value: b.id,
      emoji: marker,
    };
  });

  const rows = [row1, row2];
  if (options.length) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('ct:select_bot')
          .setPlaceholder(`اختار بوت من ${options.length} بوت لإدارته`)
          .addOptions(options)
      )
    );
  }
  return { embeds: [embed], components: rows };
}

/**
 * Per-bot panel — split into logical rows so nothing feels crowded and
 * every button has a clear purpose. Discord caps us at 5 rows × 5 buttons.
 */
function botPanel(bot, invite) {
  const status = bot.status || 'Offline';
  const statusEmoji = status === 'Online' ? DOT.on : status === 'Error' ? DOT.err : status === 'Connecting' ? DOT.warn : DOT.off;

  const voiceLine = bot.voice?.channelId
    ? `<#${bot.voice.channelId}>${bot.voice.paused ? ` ${DOT.warn} paused` : ''}${bot.voice.selfMute ? ' • 🔇 muted' : ''}${bot.voice.selfDeaf ? ' • 🙉 deafened' : ''}`
    : 'مش متصل';

  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setAuthor({ name: bot.username || bot.label || 'Managed Bot' })
    .setTitle(bot.label || bot.username || bot.id)
    .addFields(
      { name: `${statusEmoji} Status`, value: `**${status}**`, inline: true },
      { name: '🆔 Client ID', value: bot.clientId ? `\`${bot.clientId}\`` : 'شغّله الأول', inline: true },
      { name: '♻️ Auto Restart', value: bot.autoRestart === false ? `${DOT.off} Off` : `${DOT.on} On`, inline: true },
      { name: `${DOT.voice} Voice`, value: voiceLine, inline: false },
      { name: '🎭 Rotating Status', value: bot.statusConfig?.enabled ? `شغال — ${bot.statusConfig.items.length} حالة` : 'متوقف', inline: true },
      { name: '🔗 Invite', value: invite ? `[فتح رابط الدعوة](${invite})` : 'شغّله الأول عشان يظهر الرابط', inline: true }
    )
    .setFooter({ text: BRAND_FOOTER })
    .setTimestamp();

  if (bot.error) embed.addFields({ name: `${DOT.err} Last Error`, value: `\`${String(bot.error).slice(0, 400)}\`` });

  // Row 1 — lifecycle
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ct:start:${bot.id}`).setStyle(ButtonStyle.Success).setLabel('Start').setEmoji('▶️'),
    new ButtonBuilder().setCustomId(`ct:stop:${bot.id}`).setStyle(ButtonStyle.Danger).setLabel('Stop').setEmoji('⏹️'),
    new ButtonBuilder().setCustomId(`ct:restart:${bot.id}`).setStyle(ButtonStyle.Primary).setLabel('Restart').setEmoji('🔁'),
    new ButtonBuilder()
      .setCustomId(`ct:autorestart:${bot.id}`)
      .setStyle(bot.autoRestart === false ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setLabel(bot.autoRestart === false ? 'Auto Restart: Off' : 'Auto Restart: On')
      .setEmoji('♻️'),
    new ButtonBuilder().setCustomId(`ct:invite:${bot.id}`).setStyle(ButtonStyle.Link ? ButtonStyle.Secondary : ButtonStyle.Secondary).setLabel('Invite Link').setEmoji('🔗')
  );

  // Row 2 — voice controls
  const inVoice = !!bot.voice?.channelId;
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ct:voice:${bot.id}`).setStyle(ButtonStyle.Primary).setLabel('Join Voice').setEmoji('🎙️'),
    new ButtonBuilder().setCustomId(`ct:voice_move:${bot.id}`).setStyle(ButtonStyle.Primary).setLabel('Move').setEmoji('↔️').setDisabled(!inVoice),
    new ButtonBuilder().setCustomId(`ct:voice_reconnect:${bot.id}`).setStyle(ButtonStyle.Primary).setLabel('Reconnect Now').setEmoji('⚡').setDisabled(!inVoice),
    new ButtonBuilder().setCustomId(`ct:voice_leave:${bot.id}`).setStyle(ButtonStyle.Danger).setLabel('Disconnect').setEmoji('⏏️').setDisabled(!inVoice)
  );

  // Row 3 — mute / deafen toggles
  const muteLabel = bot.voice?.selfMute ? 'Unmute' : 'Mute';
  const deafLabel = bot.voice?.selfDeaf ? 'Undeafen' : 'Deafen';
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ct:voice_mute:${bot.id}`)
      .setStyle(bot.voice?.selfMute ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setLabel(muteLabel)
      .setEmoji(bot.voice?.selfMute ? '🔈' : '🔇')
      .setDisabled(!inVoice),
    new ButtonBuilder()
      .setCustomId(`ct:voice_deafen:${bot.id}`)
      .setStyle(bot.voice?.selfDeaf ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setLabel(deafLabel)
      .setEmoji(bot.voice?.selfDeaf ? '🙈' : '🙉')
      .setDisabled(!inVoice)
  );

  // Row 4 — appearance / presence
  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ct:presence:${bot.id}`).setStyle(ButtonStyle.Secondary).setLabel('Status').setEmoji('🎭'),
    new ButtonBuilder().setCustomId(`ct:rotation:${bot.id}`).setStyle(ButtonStyle.Secondary).setLabel('Rotating Status').setEmoji('🔀'),
    new ButtonBuilder().setCustomId(`ct:edit:${bot.id}`).setStyle(ButtonStyle.Secondary).setLabel('Name / Avatar').setEmoji('🎨')
  );

  // Row 5 — reactions + remove
  const row5 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ct:reaction:${bot.id}`).setStyle(ButtonStyle.Secondary).setLabel('Add Reaction').setEmoji('💬'),
    new ButtonBuilder().setCustomId(`ct:reaction_list:${bot.id}`).setStyle(ButtonStyle.Secondary).setLabel('Reaction Rules').setEmoji('📜'),
    new ButtonBuilder().setCustomId(`ct:remove:${bot.id}`).setStyle(ButtonStyle.Danger).setLabel('Remove Bot').setEmoji('🗑️')
  );

  return { embeds: [embed], components: [row1, row2, row3, row4, row5], ephemeral: true };
}

/** Voice channel picker for a specific bot. */
function voiceRoomSelect(botId, action = 'voice_select') {
  const row = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(`ct:${action}:${botId}`)
      .setPlaceholder('اختار الروم')
      .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
  );
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('🎙️ اختيار روم الفويس')
    .setDescription('اختار الروم اللي عايز البوت يدخله. الاتصال مستقل تمامًا عن باقي البوتات.')
    .setFooter({ text: BRAND_FOOTER });
  return { embeds: [embed], components: [row], ephemeral: true };
}

/** Voice channel picker for Join All. */
function joinAllRoomSelect() {
  const row = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId('ct:join_all_select')
      .setPlaceholder('اختار الروم اللي كل البوتات هتدخله')
      .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
  );
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('📞 Join All')
    .setDescription('كل البوتات الـ Online هيدخلوا الروم اللي هتختاره — كل واحد بـ Voice Connection مستقل.')
    .setFooter({ text: BRAND_FOOTER });
  return { embeds: [embed], components: [row], ephemeral: true };
}

/** Text channel picker for setting up an auto-reaction rule. */
function reactionChannelSelect(botId) {
  const row = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(`ct:reaction_channel_select:${botId}`)
      .setPlaceholder('اختار الروم')
      .addChannelTypes(ChannelType.GuildText)
  );
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('💬 Auto Reaction')
    .setDescription('اختار الروم اللي عايز الرياكشن التلقائي يشتغل فيه.')
    .setFooter({ text: BRAND_FOOTER });
  return { embeds: [embed], components: [row], ephemeral: true };
}

function reactionListPanel(botId, rules) {
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('📜 Reaction Rules')
    .setDescription(
      rules.length
        ? rules.map((r) => `${r.enabled ? DOT.on : DOT.off} \`${r.id}\` — <#${r.channelId}> — ${r.emoji}`).join('\n')
        : 'مفيش قواعد رياكشن للبوت ده لسه.'
    )
    .setFooter({ text: BRAND_FOOTER });

  const rows = rules.slice(0, 4).map((r) =>
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ct:reaction_toggle:${r.id}:${botId}`)
        .setStyle(r.enabled ? ButtonStyle.Secondary : ButtonStyle.Success)
        .setLabel(r.enabled ? `Disable ${r.emoji}` : `Enable ${r.emoji}`),
      new ButtonBuilder()
        .setCustomId(`ct:reaction_delete:${r.id}:${botId}`)
        .setStyle(ButtonStyle.Danger)
        .setLabel('Delete')
        .setEmoji('🗑️')
    )
  );
  return { embeds: [embed], components: rows, ephemeral: true };
}

function voiceOverviewPanel(store) {
  const bots = (store.read().bots || []).filter((b) => b.voice?.channelId);
  const lines = bots.length
    ? bots.map((b) => {
        const flags = [];
        if (b.voice.paused) flags.push('⏸️ paused');
        if (b.voice.selfMute) flags.push('🔇 muted');
        if (b.voice.selfDeaf) flags.push('🙉 deaf');
        const suffix = flags.length ? ` — ${flags.join(' • ')}` : '';
        return `${DOT.voice} **${b.label || b.id}** — <#${b.voice.channelId}>${suffix}`;
      }).join('\n')
    : 'مفيش بوتات متصلة بأي فويس دلوقتي.';

  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('🎙️ Voice Overview')
    .setDescription(lines)
    .setFooter({ text: BRAND_FOOTER })
    .setTimestamp();
  return { embeds: [embed], ephemeral: true };
}

function logsPanel(store) {
  const audit = (store.read().audit || []).slice(0, 15);
  const desc = audit.length
    ? audit.map((l) => `${l.emoji || '🟣'} **${l.type}** — ${l.message}`).join('\n')
    : 'مفيش لوجات لسه.';
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setAuthor({ name: '📋 Latest Logs' })
    .setTitle('آخر ١٥ حدث')
    .setDescription(desc.slice(0, 4000))
    .setFooter({ text: BRAND_FOOTER })
    .setTimestamp();
  return { embeds: [embed], ephemeral: true };
}

module.exports = {
  mainPanel,
  botPanel,
  voiceRoomSelect,
  joinAllRoomSelect,
  reactionChannelSelect,
  reactionListPanel,
  voiceOverviewPanel,
  logsPanel,
};
