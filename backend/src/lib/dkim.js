// =============================================================================
// REAL DKIM SIGNING (Deliverability Audit — Phase 3)
// =============================================================================
// A genuine RFC 6376 implementation — relaxed/relaxed canonicalization,
// RSA-SHA256 — using only Node's built-in `crypto` module. This does NOT
// invent, generate, or guess a DKIM selector or key: both come from real
// environment variables the Owner must set themselves, after generating
// a real keypair on their own and publishing the real public key in DNS.
// If those environment variables aren't set, signing is skipped entirely
// — no fake or placeholder signature is ever attached to a message.
//
// What the Owner still has to do outside this code (documented in the
// final deliverability report, not glossed over here):
//   1. Generate a real RSA keypair (e.g. `openssl genrsa -out dkim.pem 2048`
//      then derive the public key with
//      `openssl rsa -in dkim.pem -pubout -outform der | openssl base64 -A`).
//   2. Publish the public key at `<selector>._domainkey.<domain>` as a TXT
//      record — this code cannot create that DNS record for you.
//   3. Set DKIM_SELECTOR, DKIM_DOMAIN, and DKIM_PRIVATE_KEY (the PEM
//      contents, real newlines can be encoded as \n in a single env var
//      line) in backend/.env.
// =============================================================================

const crypto = require('crypto')

function isConfigured() {
  return !!(process.env.DKIM_SELECTOR && process.env.DKIM_DOMAIN && process.env.DKIM_PRIVATE_KEY)
}

/** RFC 6376 §3.4.2 relaxed header canonicalization: lowercase the header
 * name, unfold continuation lines, collapse runs of WSP to a single SP,
 * and trim leading/trailing WSP from the value. */
function canonicalizeHeader(name, value) {
  const unfolded = value.replace(/\r\n[ \t]+/g, ' ')
  const collapsed = unfolded.replace(/[ \t]+/g, ' ').trim()
  return `${name.toLowerCase()}:${collapsed}`
}

/** RFC 6376 §3.4.4 relaxed body canonicalization: collapse WSP runs
 * within each line, remove trailing WSP per line, and remove all trailing
 * empty lines (a single trailing CRLF is kept, per the spec's "an empty
 * body... is represented as a single 'CRLF'" rule). */
function canonicalizeBody(body) {
  let lines = (body || '').split('\r\n').map((line) => line.replace(/[ \t]+$/, '').replace(/[ \t]+/g, ' '))
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines.join('\r\n') + '\r\n'
}

/** Parses a raw RFC 5322 message (as produced by lib/mimeBuilder.js) into
 * its header block and body, and the individual headers as a map —
 * assumes unfolded, single-line headers, which is what buildRawMessage()
 * always produces. */
function parseMessage(rawMessage) {
  const idx = rawMessage.indexOf('\r\n\r\n')
  const headerBlock = idx === -1 ? rawMessage : rawMessage.slice(0, idx)
  const body = idx === -1 ? '' : rawMessage.slice(idx + 4)
  const headers = {}
  for (const line of headerBlock.split('\r\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const name = line.slice(0, colonIdx).trim().toLowerCase()
    const value = line.slice(colonIdx + 1).trim()
    headers[name] = value
  }
  return { headerBlock, body, headers }
}

/**
 * Signs a raw message and returns it with a real DKIM-Signature header
 * prepended. Signs the standard, widely-recommended header set (From,
 * To, Subject, Date, Message-ID) plus the body hash. Throws if not
 * configured or if the private key is malformed — callers should check
 * isConfigured() first and treat a signing failure as real, not
 * swallow it silently (see lib/gmail.js / lib/smtp.js call sites).
 */
function signMessage(rawMessage) {
  if (!isConfigured()) throw new Error('DKIM is not configured (DKIM_SELECTOR/DKIM_DOMAIN/DKIM_PRIVATE_KEY not set)')

  const selector = process.env.DKIM_SELECTOR
  const domain = process.env.DKIM_DOMAIN
  const privateKeyPem = process.env.DKIM_PRIVATE_KEY.replace(/\\n/g, '\n')

  const { body, headers } = parseMessage(rawMessage)
  const signedHeaderNames = ['from', 'to', 'subject', 'date', 'message-id'].filter((h) => headers[h] !== undefined)
  if (signedHeaderNames.length === 0) throw new Error('DKIM signing found no signable headers in this message')

  const bodyHash = crypto.createHash('sha256').update(canonicalizeBody(body)).digest('base64')

  const dkimFieldsNoSig = [
    'v=1', 'a=rsa-sha256', 'c=relaxed/relaxed', `d=${domain}`, `s=${selector}`,
    `h=${signedHeaderNames.join(':')}`, `bh=${bodyHash}`, 'b='
  ].join('; ')

  const canonicalizedHeaders = signedHeaderNames.map((h) => canonicalizeHeader(h, headers[h])).join('\r\n')
  const canonicalizedDkimHeader = canonicalizeHeader('dkim-signature', dkimFieldsNoSig)
  const stringToSign = `${canonicalizedHeaders}\r\n${canonicalizedDkimHeader}`

  const signer = crypto.createSign('RSA-SHA256')
  signer.update(stringToSign)
  const signature = signer.sign(privateKeyPem, 'base64')

  const finalDkimHeader = `DKIM-Signature: ${dkimFieldsNoSig}${signature}`
  return `${finalDkimHeader}\r\n${rawMessage}`
}

module.exports = { isConfigured, signMessage, canonicalizeHeader, canonicalizeBody }
