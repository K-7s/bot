const express = require('express');
const helmet = require('helmet');
const { BRAND_FOOTER, BRAND_NAME } = require('../utils/constants');

/**
 * Read-only dashboard for Railway / Pterodactyl uptime pings.
 * Dark theme with purple accents — visually consistent with the Discord panel.
 * No control endpoints, no uploads, no code execution. Everything actionable
 * lives inside the Discord /panel interface.
 */
function createDashboard(store) {
  if (String(process.env.DASHBOARD_ENABLED || 'true') !== 'true') return null;

  const app = express();
  app.use(helmet({ contentSecurityPolicy: false }));

  app.get('/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

  app.get('/api/stats', (req, res) => {
    const db = store.read();
    const bots = db.bots || [];
    res.json({
      total: bots.length,
      online: bots.filter((b) => b.status === 'Online').length,
      inVoice: bots.filter((b) => b.voice?.channelId).length,
      autoRestart: bots.filter((b) => b.autoRestart !== false).length,
    });
  });

  app.get('/', (req, res) => {
    const db = store.read();
    const bots = db.bots || [];
    const online = bots.filter((b) => b.status === 'Online').length;
    const inVoice = bots.filter((b) => b.voice?.channelId).length;

    const cards = bots.length
      ? bots.map((b) => {
          const statusClass = b.status === 'Online' ? 'ok' : b.status === 'Error' ? 'err' : b.status === 'Connecting' ? 'warn' : 'off';
          const voice = b.voice?.channelId ? `<div class="chip">🎙️ in voice</div>` : '';
          const autoR = b.autoRestart !== false ? `<div class="chip alt">♻️ auto-restart</div>` : '';
          return `<div class="card">
            <div class="card-head">
              <span class="dot ${statusClass}"></span>
              <b>${escapeHtml(b.label || b.id)}</b>
            </div>
            <div class="muted">${escapeHtml(b.username || 'Not ready')}</div>
            <div class="row">
              <div class="chip ${statusClass}">${escapeHtml(b.status || 'Offline')}</div>
              ${voice}
              ${autoR}
            </div>
          </div>`;
        }).join('')
      : '<div class="card empty">لسه مفيش بوتات. ضيفهم من Discord <code>/panel</code>.</div>';

    res.send(`<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(BRAND_NAME)}</title>
<style>
  :root {
    --bg: #0a0713;
    --surface: #14101f;
    --surface-2: #1c1730;
    --border: #2a2140;
    --border-hi: #8b5cf655;
    --purple: #8b5cf6;
    --purple-deep: #6d28d9;
    --text: #f5f3ff;
    --muted: #a1a1aa;
    --ok: #22c55e;
    --err: #ef4444;
    --warn: #f59e0b;
    --off: #6b7280;
    --info: #3b82f6;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: radial-gradient(1200px 600px at 20% -10%, #2a1a55 0%, transparent 60%),
                radial-gradient(1000px 500px at 90% 10%, #4c1d95 0%, transparent 55%),
                var(--bg);
    color: var(--text);
    font-family: 'Segoe UI', system-ui, -apple-system, 'Cairo', 'Tajawal', Arial, sans-serif;
    min-height: 100vh;
    padding: 32px 24px;
  }
  .wrap { max-width: 1200px; margin: 0 auto; }
  .hero {
    background: linear-gradient(140deg, var(--surface) 0%, var(--surface-2) 100%);
    border: 1px solid var(--border-hi);
    border-radius: 22px;
    padding: 28px;
    box-shadow: 0 20px 60px #0009, inset 0 1px 0 #ffffff08;
    position: relative;
    overflow: hidden;
  }
  .hero::before {
    content: ''; position: absolute; inset: 0;
    background: radial-gradient(600px 200px at 100% 0%, #8b5cf633 0%, transparent 70%);
    pointer-events: none;
  }
  .hero h1 {
    margin: 0 0 8px; font-size: 28px; letter-spacing: 0.3px;
    background: linear-gradient(90deg, #c4b5fd, #8b5cf6);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .hero p { margin: 4px 0; color: var(--muted); }
  .stats {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 12px; margin-top: 20px;
  }
  .stat {
    background: #ffffff08; border: 1px solid var(--border);
    border-radius: 14px; padding: 14px 16px;
  }
  .stat b { font-size: 24px; color: var(--purple); }
  .stat span { display: block; font-size: 12px; color: var(--muted); margin-top: 4px; }

  .section-title {
    margin: 28px 4px 12px; font-size: 14px; letter-spacing: 1px;
    color: var(--muted); text-transform: uppercase;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 14px;
  }
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 18px;
    padding: 18px;
    display: flex; flex-direction: column; gap: 10px;
    transition: transform .15s ease, border-color .15s ease, box-shadow .15s ease;
  }
  .card:hover {
    transform: translateY(-2px);
    border-color: var(--border-hi);
    box-shadow: 0 10px 30px #0008;
  }
  .card.empty { align-items: center; text-align: center; color: var(--muted); }
  .card-head { display: flex; align-items: center; gap: 10px; }
  .card-head b { font-size: 15px; }
  .muted { color: var(--muted); font-size: 13px; }
  .row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
  .dot {
    width: 10px; height: 10px; border-radius: 50%; display: inline-block;
    box-shadow: 0 0 0 3px #ffffff10;
  }
  .dot.ok   { background: var(--ok); }
  .dot.err  { background: var(--err); }
  .dot.warn { background: var(--warn); }
  .dot.off  { background: var(--off); }
  .chip {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 4px 10px; border-radius: 999px;
    background: #ffffff0a; border: 1px solid var(--border);
    font-size: 12px; color: var(--text);
  }
  .chip.ok   { border-color: #22c55e55; color: #86efac; background: #22c55e10; }
  .chip.err  { border-color: #ef444455; color: #fca5a5; background: #ef444410; }
  .chip.warn { border-color: #f59e0b55; color: #fcd34d; background: #f59e0b10; }
  .chip.off  { border-color: #6b728055; color: #d4d4d8; background: #6b728010; }
  .chip.alt  { border-color: var(--border-hi); color: #c4b5fd; background: #8b5cf610; }

  .footer {
    margin-top: 32px; padding-top: 20px;
    border-top: 1px solid var(--border);
    color: var(--muted); font-size: 13px; text-align: center;
  }
  code {
    background: #ffffff10; padding: 2px 6px; border-radius: 6px;
    font-family: 'JetBrains Mono', Consolas, monospace; color: #c4b5fd;
  }
</style>
</head>
<body>
<div class="wrap">
  <div class="hero">
    <h1>${escapeHtml(BRAND_NAME)}</h1>
    <p>لوحة صحة (Health / Uptime) للـ hosting — كل التحكم من Discord <code>/panel</code>.</p>
    <p>كل بوت عنده Voice Connection مستقل، وAuto Restart تلقائي لو وقع.</p>
    <div class="stats">
      <div class="stat"><b>${bots.length}</b><span>Total Bots</span></div>
      <div class="stat"><b>${online}</b><span>Online Right Now</span></div>
      <div class="stat"><b>${inVoice}</b><span>In Voice</span></div>
      <div class="stat"><b>${Math.floor(process.uptime() / 60)}m</b><span>Process Uptime</span></div>
    </div>
  </div>

  <div class="section-title">Managed Bots</div>
  <div class="grid">${cards}</div>

  <div class="footer">${escapeHtml(BRAND_FOOTER)}</div>
</div>
</body>
</html>`);
  });

  const port = Number(process.env.DASHBOARD_PORT || 3000);
  const bind = process.env.DASHBOARD_BIND || '0.0.0.0';
  app.listen(port, bind, () => console.log(`🔵 Dashboard: http://${bind}:${port} (health check for Railway/Pterodactyl)`));
  return app;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = { createDashboard };
