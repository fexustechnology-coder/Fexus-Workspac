// =============================================================================
// REAL CREDENTIAL ENCRYPTION (Phase 20)
// =============================================================================
// AES-256-GCM via Node's built-in `crypto` module — no new dependency.
// This is what makes "SMTP passwords must never be stored as plain text"
// literally true: routes/senders.js encrypts before every write, and the
// only place a decrypted password ever exists is briefly in memory inside
// campaignEngine.js/smtp.js at the moment of an actual send.
//
// Requires SMTP_ENCRYPTION_KEY in backend/.env. Until it's set, encrypt()
// throws a specific, honest error rather than silently storing plaintext
// or silently using a hardcoded fallback key (either of which would defeat
// the entire point).
// =============================================================================

const crypto = require('crypto')

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // recommended for GCM

function getKey() {
  const raw = process.env.SMTP_ENCRYPTION_KEY || ''
  if (!raw) {
    throw new Error('SMTP_ENCRYPTION_KEY is not set in backend/.env — generate one with `node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"` and set it before connecting any sender email.')
  }
  // Accepts any length input and derives a real, fixed 32-byte AES-256 key
  // from it — so a person can use any passphrase, not just a raw 32-byte
  // hex string, without weakening the actual cipher key material.
  return crypto.createHash('sha256').update(raw, 'utf8').digest()
}

/** Returns a single self-contained string: base64(iv).base64(authTag).base64(ciphertext) */
function encrypt(plaintext) {
  const key = getKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join('.')
}

function decrypt(encrypted) {
  if (!encrypted) return ''
  const key = getKey()
  const [ivB64, authTagB64, dataB64] = encrypted.split('.')
  if (!ivB64 || !authTagB64 || !dataB64) throw new Error('Malformed encrypted credential — cannot decrypt.')
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'))
  const plaintext = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()])
  return plaintext.toString('utf8')
}

function isConfigured() {
  return !!process.env.SMTP_ENCRYPTION_KEY
}

module.exports = { encrypt, decrypt, isConfigured }
