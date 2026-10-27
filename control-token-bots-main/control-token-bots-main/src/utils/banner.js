const { BRAND_FOOTER, BRAND_USER, BRAND_NAME } = require('./constants');

// Small purple ANSI helper — falls back to plain text on TTYs without color.
const P = (s) => (process.stdout.isTTY ? `\x1b[35m${s}\x1b[0m` : s);
const B = (s) => (process.stdout.isTTY ? `\x1b[1m${s}\x1b[0m` : s);
const D = (s) => (process.stdout.isTTY ? `\x1b[2m${s}\x1b[0m` : s);

function printBanner() {
  const line = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  console.log(P(line));
  console.log(B(`  ${BRAND_NAME}`));
  console.log(`  ${BRAND_FOOTER}`);
  console.log(D(`  User: ${BRAND_USER}`));
  console.log(D('  Official Discord Bot Tokens only • No selfbot • No user tokens'));
  console.log(D('  🟢 Voice   🔴 Error   🟡 Restart   🔵 Login'));
  console.log(P(line));
}

module.exports = { printBanner };
