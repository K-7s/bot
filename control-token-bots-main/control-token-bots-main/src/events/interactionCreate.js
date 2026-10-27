const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { guardInteraction, assertManagesGuild } = require('../utils/permissions');
const {
  mainPanel,
  botPanel,
  voiceRoomSelect,
  joinAllRoomSelect,
  reactionChannelSelect,
  reactionListPanel,
  voiceOverviewPanel,
  logsPanel,
} = require('../panels/mainPanel');

function textInput(id, label, style = TextInputStyle.Short, required = true, placeholder = '', value = '') {
  const t = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setPlaceholder(placeholder);
  if (value) t.setValue(value);
  return t;
}
function modal(id, title, inputs) {
  const m = new ModalBuilder().setCustomId(id).setTitle(title);
  for (const input of inputs) m.addComponents(new ActionRowBuilder().addComponents(input));
  return m;
}

/** "Playing|Developed by 7am.o|5\nWatching|Lavender Server|10" -> items[] */
function parseRotationText(raw) {
  return String(raw || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [type, text, seconds] = line.split('|').map((v) => (v || '').trim());
      return { type: type || 'Playing', text: text || 'Developed by 7am.o', seconds: Number(seconds) || 10 };
    });
}

function setupInteractions(client, ctx) {
  client.on('interactionCreate', async (interaction) => {
    try {
      // ---- slash commands ----
      if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'panel') {
          if (!(await guardInteraction(interaction))) return;
          return interaction.reply({ ...mainPanel(ctx.store), ephemeral: true });
        }
        if (interaction.commandName === 'setup-logs') {
          if (!(await guardInteraction(interaction))) return;
          const ch = interaction.options.getChannel('channel');
          ctx.store.update((db) => {
            db.settings.logChannelId = ch.id;
          });
          await ctx.log.log('LOG_CHANNEL_SET', `تم تحديد روم اللوجات: #${ch.name}`, { channelId: ch.id });
          return interaction.reply({ content: `تم. اللوجات هتنزل في ${ch}`, ephemeral: true });
        }
      }

      // ---- string select menus ----
      if (interaction.isStringSelectMenu() && interaction.customId === 'ct:select_bot') {
        if (!(await guardInteraction(interaction))) return;
        const id = interaction.values[0];
        const bot = ctx.tokens.get(id);
        if (!bot) return interaction.reply({ content: 'البوت ده مش موجود، اعمل Refresh.', ephemeral: true });
        return interaction.reply(botPanel(bot, ctx.tokens.getInvite(id)));
      }

      // ---- channel select menus ----
      if (interaction.isChannelSelectMenu()) {
        if (!(await guardInteraction(interaction))) return;
        const [ns, action, id] = interaction.customId.split(':');
        if (ns !== 'ct') return;
        const channelId = interaction.values[0];

        if (action === 'voice_select') {
          await interaction.deferUpdate();
          await ctx.voice.join(id, interaction.guildId, channelId, true);
          await interaction.editReply({ content: `تم توصيل البوت بـ <#${channelId}>.`, embeds: [], components: [] });
          return;
        }

        if (action === 'voice_move_select') {
          await interaction.deferUpdate();
          await ctx.voice.move(id, interaction.guildId, channelId);
          await interaction.editReply({ content: `تم نقل البوت إلى <#${channelId}>.`, embeds: [], components: [] });
          return;
        }

        if (action === 'join_all_select') {
          await interaction.deferUpdate();
          const results = await ctx.voice.joinAll(interaction.guildId, channelId);
          const ok = results.filter((r) => r.ok).length;
          const fail = results.length - ok;
          const summary = `دخل الروم: **${ok}** بوت${fail ? ` — فشل: **${fail}**` : ''}`;
          await interaction.editReply({ content: summary, embeds: [], components: [] });
          return;
        }

        if (action === 'reaction_channel_select') {
          await assertManagesGuild(interaction);
          return interaction.showModal(
            modal(`ctm:reaction_emoji:${id}:${channelId}`, 'Auto Reaction', [
              textInput('emoji', 'الإيموجي', TextInputStyle.Short, true, 'الصق الإيموجي هنا'),
            ])
          );
        }
      }

      // ---- buttons ----
      if (interaction.isButton()) {
        if (!(await guardInteraction(interaction))) return;
        const [ns, action, ...rest] = interaction.customId.split(':');
        if (ns !== 'ct') return;
        const id = rest[0];

        // ---- main panel level ----
        if (action === 'refresh') return interaction.update(mainPanel(ctx.store));
        if (action === 'voice_overview') return interaction.reply(voiceOverviewPanel(ctx.store));
        if (action === 'logs') return interaction.reply(logsPanel(ctx.store));

        if (action === 'add_bot') {
          return interaction.showModal(
            modal('ctm:add_bot', 'Add Bot Token', [
              textInput('label', 'اسم مميز للبوت', TextInputStyle.Short, true, 'Voice Bot 1'),
              textInput('token', 'Official Discord Bot Token', TextInputStyle.Paragraph, true, 'الصق التوكن الرسمي هنا'),
            ])
          );
        }

        if (action === 'start_all') {
          await interaction.deferReply({ ephemeral: true });
          await ctx.tokens.startAll();
          return interaction.editReply('تم تشغيل كل البوتات.');
        }
        if (action === 'stop_all') {
          await interaction.deferReply({ ephemeral: true });
          await ctx.tokens.stopAll();
          return interaction.editReply('تم إيقاف كل البوتات.');
        }
        if (action === 'join_all') {
          return interaction.reply(joinAllRoomSelect());
        }

        // ---- per-bot lifecycle ----
        if (['start', 'stop', 'restart', 'invite'].includes(action)) {
          await interaction.deferReply({ ephemeral: true });
          if (action === 'start') await ctx.tokens.start(id);
          if (action === 'stop') await ctx.tokens.stop(id, /*disableAutoRestart*/ true);
          if (action === 'restart') await ctx.tokens.restart(id);
          if (action === 'invite') return interaction.editReply(ctx.tokens.getInvite(id) || 'شغل البوت الأول عشان يظهر رابط الدعوة.');
          return interaction.editReply(`تم تنفيذ ${action}.`);
        }

        if (action === 'autorestart') {
          await interaction.deferReply({ ephemeral: true });
          const bot = ctx.tokens.get(id);
          const next = !(bot?.autoRestart !== false); // toggle
          ctx.tokens.setAutoRestart(id, next);
          return interaction.editReply(`Auto Restart ${next ? 'اتفعل' : 'اتوقف'} للبوت ده.`);
        }

        if (action === 'remove') {
          await interaction.deferReply({ ephemeral: true });
          await ctx.tokens.remove(id);
          return interaction.editReply('تم حذف البوت من الأداة.');
        }

        // ---- presence / rotation / edit ----
        if (action === 'presence') {
          return interaction.showModal(
            modal(`ctm:presence:${id}`, 'Set Bot Status', [
              textInput('type', 'Playing / Watching / Listening / Competing', TextInputStyle.Short, true, 'Playing'),
              textInput('text', 'نص الحالة', TextInputStyle.Short, true, 'Developed by 7am.o'),
            ])
          );
        }

        if (action === 'rotation') {
          const bot = ctx.tokens.get(id);
          const existing = (bot?.statusConfig?.items || []).map((i) => `${i.type}|${i.text}|${i.seconds}`).join('\n');
          return interaction.showModal(
            modal(`ctm:rotation:${id}`, 'Rotating Status', [
              textInput(
                'items',
                'سطر لكل حالة: Type|النص|الثواني',
                TextInputStyle.Paragraph,
                true,
                'Playing|Developed by 7am.o|5\nWatching|Lavender Server|10',
                existing
              ),
            ])
          );
        }

        if (action === 'edit') {
          return interaction.showModal(
            modal(`ctm:edit:${id}`, 'Edit Bot Profile', [
              textInput('name', 'Username جديد (اختياري)', TextInputStyle.Short, false),
              textInput('avatar', 'رابط صورة (اختياري)', TextInputStyle.Short, false),
              textInput('nickname', 'نيك في السيرفر ده (اختياري)', TextInputStyle.Short, false),
            ])
          );
        }

        // ---- voice controls (per bot) ----
        if (action === 'voice') return interaction.reply(voiceRoomSelect(id, 'voice_select'));
        if (action === 'voice_move') return interaction.reply(voiceRoomSelect(id, 'voice_move_select'));

        if (action === 'voice_leave') {
          await interaction.deferReply({ ephemeral: true });
          await ctx.voice.leave(id);
          return interaction.editReply('تم إخراج البوت من الفويس.');
        }

        if (action === 'voice_reconnect') {
          await interaction.deferReply({ ephemeral: true });
          await ctx.voice.reconnectNow(id);
          return interaction.editReply('تم إعادة توصيل البوت.');
        }

        if (action === 'voice_mute') {
          await interaction.deferReply({ ephemeral: true });
          const bot = ctx.tokens.get(id);
          await ctx.voice.setMute(id, !bot?.voice?.selfMute);
          return interaction.editReply(bot?.voice?.selfMute ? 'تم شيل الـ Mute.' : 'تم عمل Mute للبوت.');
        }

        if (action === 'voice_deafen') {
          await interaction.deferReply({ ephemeral: true });
          const bot = ctx.tokens.get(id);
          await ctx.voice.setDeaf(id, !bot?.voice?.selfDeaf);
          return interaction.editReply(bot?.voice?.selfDeaf ? 'تم شيل الـ Deafen.' : 'تم عمل Deafen للبوت.');
        }

        // ---- reactions ----
        if (action === 'reaction') {
          await assertManagesGuild(interaction);
          return interaction.reply(reactionChannelSelect(id));
        }

        if (action === 'reaction_list') return interaction.reply(reactionListPanel(id, ctx.reactions.list(id)));

        if (action === 'reaction_toggle') {
          const [ruleId, botId] = rest;
          const rule = ctx.reactions.list(botId).find((r) => r.id === ruleId);
          ctx.reactions.toggle(ruleId, !rule?.enabled);
          return interaction.update(reactionListPanel(botId, ctx.reactions.list(botId)));
        }

        if (action === 'reaction_delete') {
          const [ruleId, botId] = rest;
          ctx.reactions.removeRule(ruleId);
          return interaction.update(reactionListPanel(botId, ctx.reactions.list(botId)));
        }
      }

      // ---- modal submits ----
      if (interaction.isModalSubmit()) {
        if (!(await guardInteraction(interaction))) return;

        if (interaction.customId === 'ctm:add_bot') {
          await interaction.deferReply({ ephemeral: true });
          const id = await ctx.tokens.add(interaction.fields.getTextInputValue('token'), interaction.fields.getTextInputValue('label'));
          await ctx.tokens.start(id).catch(() => null);
          return interaction.editReply(`تمت الإضافة. ID: \`${id}\``);
        }

        const parts = interaction.customId.split(':');
        const action = parts[1];
        const id = parts[2];
        await interaction.deferReply({ ephemeral: true });

        if (action === 'presence') {
          await ctx.tokens.setPresence(id, interaction.fields.getTextInputValue('type'), interaction.fields.getTextInputValue('text'));
          return interaction.editReply('تم تغيير الحالة.');
        }

        if (action === 'rotation') {
          const items = parseRotationText(interaction.fields.getTextInputValue('items'));
          ctx.status.startRotation(id, items);
          return interaction.editReply(`تم تشغيل تبديل الحالات (${items.length}).`);
        }

        if (action === 'edit') {
          const name = interaction.fields.getTextInputValue('name');
          const avatar = interaction.fields.getTextInputValue('avatar');
          const nick = interaction.fields.getTextInputValue('nickname');
          if (name) await ctx.tokens.setUsername(id, name);
          if (avatar) await ctx.tokens.setAvatar(id, avatar);
          if (nick && interaction.guild) {
            const bot = ctx.tokens.get(id);
            const member = await interaction.guild.members.fetch(bot.clientId).catch(() => null);
            if (member) await member.setNickname(nick);
          }
          return interaction.editReply('تم تحديث بيانات البوت.');
        }

        if (action === 'reaction_emoji') {
          const channelId = parts[3];
          await assertManagesGuild(interaction);
          const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
          if (!channel || !channel.isTextBased()) throw new Error('الروم ده مش تشانل نصي في نفس السيرفر.');
          ctx.reactions.addRule({
            botId: id,
            guildId: interaction.guildId,
            channelId,
            emoji: interaction.fields.getTextInputValue('emoji'),
          });
          return interaction.editReply('تمت إضافة قاعدة الرياكشن.');
        }
      }
    } catch (err) {
      await ctx.log.log('INTERACTION_ERROR', err.message, { customId: interaction.customId, command: interaction.commandName });
      const msg = { content: `حصل خطأ: ${err.message}`, ephemeral: true };
      if (interaction.deferred || interaction.replied) await interaction.followUp(msg).catch(() => null);
      else await interaction.reply(msg).catch(() => null);
    }
  });
}

module.exports = { setupInteractions };
