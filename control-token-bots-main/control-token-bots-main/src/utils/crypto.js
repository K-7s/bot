const crypto = require('crypto');

function getKey() {
  const raw = process.env.ENCRYPTION_KEY || '';
  if (!/^[a-fA-F0-9]{64}$/.test(raw)) {
    throw new Error(
      "ENCRYPTION_KEY لازم يكون 64 حرف hex بالظبط. ولّده بالأمر: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  return Buffer.from(raw, 'hex');
}

/** AES-256-GCM encrypt -> "iv:tag:data" (all hex) */
function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(payload) {
  const [ivHex, tagHex, dataHex] = String(payload).split(':');
  if (!ivHex || !tagHex || !dataHex) throw new Error('Corrupted encrypted payload');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
}

/** Never expose a full token — only used for local debug lines, and even then it's optional. */
function maskToken(token) {
  if (!token) return 'empty';
  const t = String(token);
  return `${t.slice(0, 6)}...${t.slice(-4)}`;
}

/** Basic guard: bot tokens (not user/selfbot tokens) always contain two dots and are reasonably long. */
function looksLikeBotToken(token) {
  const t = String(token || '').trim();
  return t.length > 45 && t.split('.').length === 3;
}

module.exports = { encrypt, decrypt, maskToken, looksLikeBotToken };
