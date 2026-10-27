/**
 * Central branding + design tokens.
 * Purple accents on dark background — matches the professional aesthetic
 * used across every panel, embed, and log line.
 */
module.exports = {
  BRAND_NAME: process.env.BRAND_NAME || 'Control Tokens Tool',
  BRAND_FOOTER: process.env.BRAND_FOOTER || 'Developed by 7am.o',
  BRAND_USER: 'Hamo',

  // ---- Unified purple / dark palette ----
  COLOR: 0x8b5cf6,       // primary purple (brand)
  COLOR_DEEP: 0x6d28d9,  // deeper purple for hover/active-like states
  DARK: 0x1e1b2e,        // background surface
  MUTED: 0xa1a1aa,       // neutral text

  // ---- Semantic log colors ----
  LOG_VOICE:   0x22c55e, // 🟢 Green  — voice-related activity
  LOG_ERROR:   0xef4444, // 🔴 Red    — errors / failures
  LOG_RESTART: 0xf59e0b, // 🟡 Amber  — restarts / retries / recovery
  LOG_LOGIN:   0x3b82f6, // 🔵 Blue   — login / connection lifecycle
  LOG_INFO:    0x8b5cf6, // 🟣 Purple — generic info / brand default

  // ---- Log emoji + color per category ----
  // Each event code maps to { emoji, color, category }.
  // Anything not in the map falls back to LOG_INFO (purple).
  LOG_STYLE: {
    // Voice — 🟢
    VOICE_JOIN:            { emoji: '🟢', color: 0x22c55e, category: 'Voice' },
    VOICE_LEAVE:           { emoji: '🟢', color: 0x22c55e, category: 'Voice' },
    VOICE_MOVE:            { emoji: '🟢', color: 0x22c55e, category: 'Voice' },
    VOICE_MUTE:            { emoji: '🟢', color: 0x22c55e, category: 'Voice' },
    VOICE_UNMUTE:          { emoji: '🟢', color: 0x22c55e, category: 'Voice' },
    VOICE_DEAFEN:          { emoji: '🟢', color: 0x22c55e, category: 'Voice' },
    VOICE_UNDEAFEN:        { emoji: '🟢', color: 0x22c55e, category: 'Voice' },
    VOICE_JOIN_ALL:        { emoji: '🟢', color: 0x22c55e, category: 'Voice' },
    VOICE_RECONNECT_OK:    { emoji: '🟢', color: 0x22c55e, category: 'Voice' },

    // Error — 🔴
    BOT_ERROR:             { emoji: '🔴', color: 0xef4444, category: 'Error' },
    BOT_SHARD_ERROR:       { emoji: '🔴', color: 0xef4444, category: 'Error' },
    TOKEN_LOGIN_ERROR:     { emoji: '🔴', color: 0xef4444, category: 'Error' },
    VOICE_RECONNECT_ERROR: { emoji: '🔴', color: 0xef4444, category: 'Error' },
    VOICE_RESTORE_ERROR:   { emoji: '🔴', color: 0xef4444, category: 'Error' },
    VOICE_RECONNECT_GIVEUP:{ emoji: '🔴', color: 0xef4444, category: 'Error' },
    REACTION_ERROR:        { emoji: '🔴', color: 0xef4444, category: 'Error' },
    UNCAUGHT_EXCEPTION:    { emoji: '🔴', color: 0xef4444, category: 'Error' },
    UNHANDLED_REJECTION:   { emoji: '🔴', color: 0xef4444, category: 'Error' },
    INTERACTION_ERROR:     { emoji: '🔴', color: 0xef4444, category: 'Error' },
    RESTORE_ERROR:         { emoji: '🔴', color: 0xef4444, category: 'Error' },

    // Restart — 🟡
    BOT_STOPPED:           { emoji: '🟡', color: 0xf59e0b, category: 'Restart' },
    BOT_RESTARTED:         { emoji: '🟡', color: 0xf59e0b, category: 'Restart' },
    BOT_AUTO_RESTART:      { emoji: '🟡', color: 0xf59e0b, category: 'Restart' },
    BOT_AUTO_RESTART_GIVEUP:{ emoji: '🟡', color: 0xf59e0b, category: 'Restart' },
    VOICE_RECONNECT_TRY:   { emoji: '🟡', color: 0xf59e0b, category: 'Restart' },

    // Login — 🔵
    CONTROLLER_READY:      { emoji: '🔵', color: 0x3b82f6, category: 'Login' },
    BOT_ONLINE:            { emoji: '🔵', color: 0x3b82f6, category: 'Login' },
    BOT_ADDED:             { emoji: '🔵', color: 0x3b82f6, category: 'Login' },
    BOT_REMOVED:           { emoji: '🔵', color: 0x3b82f6, category: 'Login' },
    LOG_CHANNEL_SET:       { emoji: '🔵', color: 0x3b82f6, category: 'Login' },
    BOT_USERNAME_CHANGED:  { emoji: '🔵', color: 0x3b82f6, category: 'Login' },
    BOT_AVATAR_CHANGED:    { emoji: '🔵', color: 0x3b82f6, category: 'Login' },
    STATUS_CHANGED:        { emoji: '🔵', color: 0x3b82f6, category: 'Login' },
    STATUS_ROTATION_ON:    { emoji: '🔵', color: 0x3b82f6, category: 'Login' },
    STATUS_ROTATION_OFF:   { emoji: '🔵', color: 0x3b82f6, category: 'Login' },
    REACTION_RULE_ADDED:   { emoji: '🔵', color: 0x3b82f6, category: 'Login' },
    AUTO_RESTART_ENABLED:  { emoji: '🔵', color: 0x3b82f6, category: 'Login' },
    AUTO_RESTART_DISABLED: { emoji: '🔵', color: 0x3b82f6, category: 'Login' },
  },

  SAFE_REACTION_NOTE:
    'Auto Reaction بيشتغل بس في الروم اللي اتفعّل فيه، جوه سيرفر عندك فيه صلاحية Manage Server.',
  VOICE_SAFETY_NOTE:
    'كل بوت عنده Voice Connection مستقل بالكامل — يعني تقدر تحط 6 بوتات في نفس السيرفر (نفس الروم أو رومات مختلفة) من غير أي تعارض.',
  ACTIVITY_TYPES: ['Playing', 'Watching', 'Listening', 'Competing'],
};
