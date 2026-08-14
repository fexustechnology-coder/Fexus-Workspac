// =============================================================================
// SHARED MIME MESSAGE BUILDER (Phase 23, extended for deliverability audit)
// =============================================================================
// Both lib/gmail.js and lib/smtp.js need to build the exact same kind of
// raw RFC 5322 message. This is the one real implementation both call.
//
// Deliverability audit additions:
// - Message-ID: previously absent entirely. Its absence is unusual and
//   can itself be a spam signal — every legitimate mail system generates
//   one. Real, unique, domain-scoped (crypto.randomBytes, not a counter).
// - Date: previously absent. Now a real RFC 5322-compliant timestamp.
// - List-Unsubscribe / List-Unsubscribe-Post: added only when a real
//   unsubscribe URL is provided by the caller — never fabricated, and
//   never added to a message that doesn't actually have a working
//   unsubscribe path behind that URL (see routes/unsubscribe.js).
// =============================================================================

const crypto = require('crypto')

/** Real Message-ID generation — RFC 5322 §3.6.4 format:
 * <unique-string@domain>. Domain is derived from the From address so the
 * Message-ID's right-hand side actually matches something about the
 * real sender, not a fabricated or unrelated domain. */
function generateMessageId(fromEmail) {
  const domain = (fromEmail || '').split('@')[1] || 'localhost'
  const unique = crypto.randomBytes(16).toString('hex')
  return `<${unique}@${domain}>`
}

function buildRawMessage({ from, replyTo, to, subject, textBody, htmlBody, unsubscribeUrl }) {
  const headers = [
    `From: ${from}`,
    ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject || '').toString('base64')}?=`,
    `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: ${generateMessageId(from)}`,
    ...(unsubscribeUrl ? [
      `List-Unsubscribe: <${unsubscribeUrl}>`,
      // RFC 8058 one-click unsubscribe — what lets Gmail/Outlook show a
      // real, built-in "Unsubscribe" button next to the sender name,
      // rather than requiring the recipient to find a link in the body.
      `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
    ] : []),
    'MIME-Version: 1.0'
  ]

  if (!htmlBody) {
    const encodedBody = Buffer.from(textBody || '', 'utf8').toString('base64')
    return [
      ...headers,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      encodedBody
    ].join('\r\n')
  }

  const boundary = `fexus-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const encodedText = Buffer.from(textBody || '', 'utf8').toString('base64')
  const encodedHtml = Buffer.from(htmlBody, 'utf8').toString('base64')

  return [
    ...headers,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    encodedText,
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    encodedHtml,
    `--${boundary}--`
  ].join('\r\n')
}

/** Escapes plain text for safe HTML embedding, then converts line breaks
 * to real <br> tags — used to build the HTML alternative from the exact
 * same body text the plain-text part already sends, so both parts show
 * the same content, just formatted differently. */
function textToBasicHtml(text) {
  const escaped = (text || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  return escaped.replace(/\n/g, '<br>\n')
}

module.exports = { buildRawMessage, textToBasicHtml, generateMessageId }
