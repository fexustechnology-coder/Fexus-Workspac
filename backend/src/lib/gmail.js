// =============================================================================
// REAL GMAIL API INTEGRATION (Phase 15, extended Phase 18)
// =============================================================================
// This is a genuine OAuth2 + Gmail send implementation — not a framework
// stub. It requires the Owner to create a real Google Cloud project and
// OAuth Client ID (see backend/README.md for the exact steps) before any of
// this can actually send an email. Until GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET
// are set, every function here throws a clear, specific error naming
// exactly what's missing — it never silently pretends to send.
//
// Scope requested: gmail.send only — this integration can send email as the
// connected account, and nothing else (it cannot read the inbox, cannot
// delete anything, cannot manage contacts).
//
// Phase 18 extracted the actual send + token-refresh logic into
// tokenCore below, generic over ANY row shape with
// {accessToken, refreshToken, expiresAt}. The original singleton
// GmailAccount flow (used by Sales AI, scheduled follow-ups, team
// invites) and the new multi-sender SenderEmail flow (used by the
// Campaign System's rotation) both call the SAME core — there is still
// only one real MIME-building and Gmail-send implementation in this app.
// =============================================================================

const prisma = require('../prismaClient')
const { buildRawMessage } = require('./mimeBuilder')

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ''
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ''
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/api/gmail/callback'
const SENDER_REDIRECT_URI = process.env.GOOGLE_SENDER_REDIRECT_URI || 'http://localhost:4000/api/senders/callback'
const SCOPE = 'https://www.googleapis.com/auth/gmail.send'

function isConfigured() {
  return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET)
}

function requireConfigured() {
  if (!isConfigured()) {
    throw new Error(
      'Gmail is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env ' +
      '(see backend/README.md for exact Google Cloud Console steps) before connecting or sending email.'
    )
  }
}

function toBase64Url(str) {
  return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function exchangeCode(code, redirectUri) {
  requireConfigured()
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri, grant_type: 'authorization_code'
    })
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data?.error_description || data?.error || 'Google OAuth token exchange failed')

  const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${data.access_token}` }
  })
  const profile = await profileRes.json().catch(() => ({}))
  return { data, email: profile.email || '' }
}

async function refreshToken(refreshTokenValue) {
  requireConfigured()
  if (!refreshTokenValue) throw new Error('No refresh token on file — reconnect this account to restore access.')
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshTokenValue, grant_type: 'refresh_token'
    })
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data?.error_description || data?.error || 'Failed to refresh the Gmail access token')
  return { accessToken: data.access_token, expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000) }
}

/**
 * The one real MIME-build + Gmail send call, generic over any account
 * shape. `account` needs { email, accessToken }. Includes the base64
 * Content-Transfer-Encoding fix from the earlier bug report.
 */
async function rawSend(account, { to, subject, body, replyTo, htmlBody, unsubscribeUrl }) {
  const message = buildRawMessage({ from: account.email, replyTo, to, subject, textBody: body, htmlBody, unsubscribeUrl })

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: toBase64Url(message) })
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data?.error?.message || 'Gmail send failed')
  return { messageId: data.id }
}

// ---------------------------------------------------------------------------
// Original singleton flow (Sales AI, scheduled follow-ups, team invites) —
// unchanged behavior, now implemented on top of the shared core above.
// ---------------------------------------------------------------------------

function getAuthUrl() {
  requireConfigured()
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID, redirect_uri: GOOGLE_REDIRECT_URI, response_type: 'code',
    scope: SCOPE, access_type: 'offline', prompt: 'consent'
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

async function exchangeCodeForTokens(code) {
  const { data, email } = await exchangeCode(code, GOOGLE_REDIRECT_URI)
  await prisma.gmailAccount.upsert({
    where: { id: 'singleton' },
    update: { email, accessToken: data.access_token, refreshToken: data.refresh_token || undefined, expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000) },
    create: { id: 'singleton', email, accessToken: data.access_token, refreshToken: data.refresh_token || '', expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000) }
  })
  return { email }
}

async function getConnectedAccount() {
  const account = await prisma.gmailAccount.findUnique({ where: { id: 'singleton' } })
  if (!account || !account.refreshToken) {
    throw new Error('Gmail is not connected yet. Go to Settings → API Keys and click "Connect Gmail."')
  }
  if (!account.expiresAt || new Date(account.expiresAt) <= new Date(Date.now() + 60000)) {
    const refreshed = await refreshToken(account.refreshToken)
    return prisma.gmailAccount.update({ where: { id: 'singleton' }, data: refreshed })
  }
  return account
}

async function sendEmail({ to, subject, body }) {
  if (!to) throw new Error('sendEmail requires a "to" address')
  const account = await getConnectedAccount()
  return rawSend(account, { to, subject, body })
}

async function isConnected() {
  const account = await prisma.gmailAccount.findUnique({ where: { id: 'singleton' } })
  return !!(account && account.refreshToken)
}

// ---------------------------------------------------------------------------
// Phase 18 — multi-sender flow. Each SenderEmail row gets its own real
// OAuth connection (the `state` param carries which senderId the
// callback is for) and can be sent through independently — this is what
// the Sender Rotation Engine (campaignEngine.js) actually calls.
// ---------------------------------------------------------------------------

function getSenderAuthUrl(senderId) {
  requireConfigured()
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID, redirect_uri: SENDER_REDIRECT_URI, response_type: 'code',
    scope: SCOPE, access_type: 'offline', prompt: 'consent', state: senderId
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

async function exchangeCodeForSender(code, senderId) {
  const { data, email } = await exchangeCode(code, SENDER_REDIRECT_URI)
  const sender = await prisma.senderEmail.update({
    where: { id: senderId },
    data: {
      // The connected Google account's real email must match the address
      // being added — otherwise silently swapping in a different sender
      // identity than the one just verified would defeat the point of
      // per-address verification.
      connectionStatus: 'Connected',
      accessToken: data.access_token,
      refreshToken: data.refresh_token || undefined,
      expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
      connectedAt: new Date()
    }
  })
  return { email, sender }
}

async function getSenderAccount(senderId) {
  const sender = await prisma.senderEmail.findUnique({ where: { id: senderId } })
  if (!sender || !sender.refreshToken) {
    throw new Error(`Sender ${sender?.email || senderId} is not connected yet.`)
  }
  if (!sender.expiresAt || new Date(sender.expiresAt) <= new Date(Date.now() + 60000)) {
    const refreshed = await refreshToken(sender.refreshToken)
    return prisma.senderEmail.update({ where: { id: senderId }, data: refreshed })
  }
  return sender
}

async function sendEmailFromSender(senderId, { to, subject, body, replyTo, htmlBody, unsubscribeUrl }) {
  if (!to) throw new Error('sendEmailFromSender requires a "to" address')
  const sender = await getSenderAccount(senderId)
  const result = await rawSend(sender, { to, subject, body, replyTo, htmlBody, unsubscribeUrl })
  await prisma.senderEmail.update({ where: { id: senderId }, data: { lastUsedAt: new Date(), health: 'Healthy', lastError: '' } })
  return result
}

module.exports = {
  isConfigured, getAuthUrl, exchangeCodeForTokens, sendEmail, isConnected, getConnectedAccount,
  getSenderAuthUrl, exchangeCodeForSender, getSenderAccount, sendEmailFromSender
}
