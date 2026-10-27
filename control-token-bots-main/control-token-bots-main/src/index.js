require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { printBanner } = require('./utils/banner');
const { JsonStore } = require('./utils/store');
const { LogManager } = require('./managers/LogManager');
const { TokenManager } = require('./managers/TokenManager');
const { StatusManager } = require('./managers/StatusManager');
const { VoiceManager } = require('./managers/VoiceManager');
const { ReactionManager } = require('./managers/ReactionManager');
const { setupInteractions } = require('./events/interactionCreate');
const { createDashboard } = require('./dashboard/server');

function assertEnv() {
  const required = ['MAIN_TOKEN', 'CLIENT_ID', 'OWNER_IDS', 'ENCRYPTION_KEY'];
  const missing = required.filter((k) => !process.env[k] || String(process.env[k]).startsWith('PUT_'));
  if (missing.length) throw new Error(`الإعدادات دي ناقصة في .env: ${missing.join(', ')}`);
}

(async () => {
  printBanner();
  assertEnv();

  const store = new JsonStore();
  const controller = new Client({ intents: [GatewayIntentBits.Guilds], partials: [Partials.Channel] });

  // Managers are wired in dependency order:
  //   log <- (everyone else needs logging)
  //   tokens (owns the client lifecycle)
  //   status / voice / reactions (per-bot features)
  const log = new LogManager(store, controller);
  const tokens = new TokenManager(store, log);
  const status = new StatusManager(store, tokens, log);
  const voice = new VoiceManager(store, tokens, log);
  const reactions = new ReactionManager(store, tokens, log);

  // Whenever a managed bot comes online, restore its rotating status, its keep-alive
  // voice presence (with its own isolated connection), and attach the safe reaction
  // listener — all independently per bot, so one broken bot never affects the others.
  tokens.onBotReady.push(async (id, client) => {
    status.restoreForBot(id);
    voice.restoreForBot(id);
    reactions.attach(client, id);
  });

  const ctx = { store, log, tokens, status, voice, reactions };
  setupInteractions(controller, ctx);

  controller.once('ready', async () => {
    await log.log('CONTROLLER_READY', `${controller.user.tag} جاهز`);
    createDashboard(store);
    voice.startHealthSweep();
    await tokens.startAll(); // bring back every managed bot that was saved from a previous run
  });

  // A broken token or a crashing managed bot must never take down the whole process.
  process.on('uncaughtException', (e) => log.log('UNCAUGHT_EXCEPTION', e.stack || e.message));
  process.on('unhandledRejection', (e) => log.log('UNHANDLED_REJECTION', e?.stack || e?.message || String(e)));

  await controller.login(process.env.MAIN_TOKEN);
})().catch((e) => {
  console.error('فشل تشغيل الأداة:', e.message);
  process.exit(1);
});
