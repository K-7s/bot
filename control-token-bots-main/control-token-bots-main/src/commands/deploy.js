require('dotenv').config();
const { REST, Routes, SlashCommandBuilder, ChannelType } = require('discord.js');

const commands = [
  new SlashCommandBuilder().setName('panel').setDescription('Open Control Tokens Tool panel'),
  new SlashCommandBuilder()
    .setName('setup-logs')
    .setDescription('Set the Discord channel used for logs')
    .addChannelOption((o) => o.setName('channel').setDescription('Logs text channel').setRequired(true).addChannelTypes(ChannelType.GuildText)),
].map((c) => c.toJSON());

(async () => {
  const token = process.env.MAIN_TOKEN;
  const clientId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID;
  if (!token || !clientId) throw new Error('MAIN_TOKEN و CLIENT_ID لازم يكونوا في .env');

  const rest = new REST({ version: '10' }).setToken(token);

  if ((process.env.DEPLOY_MODE || 'guild').toLowerCase() === 'global') {
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log('Global commands deployed (ممكن تاخد لحد ساعة تظهر).');
  } else {
    if (!guildId) throw new Error('GUILD_ID لازم يكون موجود عشان guild deploy');
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    console.log(`Guild commands deployed to ${guildId} (فورية).`);
  }
})().catch((e) => {
  console.error('Deploy failed:', e.message);
  process.exit(1);
});
