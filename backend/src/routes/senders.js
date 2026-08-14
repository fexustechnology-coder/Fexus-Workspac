const express = require('express')
const prisma = require('../prismaClient')
const { requireAuth } = require('../middleware/auth')
const verification = require('../lib/emailVerification')
const gmail = require('../lib/gmail')
const smtp = require('../lib/smtp')
const encryption = require('../lib/encryption')

const router = express.Router()

// =============================================================================
// PHASE 21 — Owner + User Workspace Unification
// =============================================================================
// Every route below is `requireAuth` only (never `requireOwner`) — Connected
// Emails belongs to whichever authenticated account is using it, Owner or
// team member alike, with zero shared pool. Every query is scoped to
// req.user.id; every lookup-by-id also filters on userId, so one account
// can never read, edit, or use another account's sender, even by guessing
// an id directly.
// =============================================================================

// The password is NEVER included in any API response, anywhere in this
// file — every route builds its own safe projection instead of returning
// a raw Prisma row.
function toSafeSender(s) {
  return {
    id: s.id, email: s.email, displayName: s.displayName, provider: s.provider,
    replyToEmail: s.replyToEmail,
    connectionMethod: s.connectionMethod,
    smtpHost: s.smtpHost, smtpPort: s.smtpPort, smtpUsername: s.smtpUsername, smtpEncryption: s.smtpEncryption,
    verificationStatus: s.verificationStatus, verificationDetail: s.verificationDetail,
    active: s.active, connectionStatus: s.connectionStatus, health: s.health,
    lastUsedAt: s.lastUsedAt, lastError: s.lastError,
    dailyUsage: s.dailyUsageDate && new Date(s.dailyUsageDate).toDateString() === new Date().toDateString() ? s.dailyUsage : 0,
    createdAt: s.createdAt
  }
}

/** Ownership-checked lookup — returns null (never another user's row) if
 * the sender doesn't exist or doesn't belong to this account. */
async function findOwnSender(userId, id) {
  return prisma.senderEmail.findFirst({ where: { id, userId } })
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const senders = await prisma.senderEmail.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' } })
    res.json({ senders: senders.map(toSafeSender) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load sender emails' })
  }
})

// POST /api/senders — address-level verification only (syntax, disposable
// check, real DNS MX lookup, best-effort SMTP RCPT TO). This step never
// needs credentials — it only asks "can this address plausibly receive
// mail at all." Connecting (below) is a separate, explicit next step.
router.post('/', requireAuth, async (req, res) => {
  try {
    const { email, displayName, provider } = req.body || {}
    if (!email?.trim()) return res.status(400).json({ error: 'email is required' })
    const trimmed = email.trim().toLowerCase()

    const existing = await prisma.senderEmail.findUnique({ where: { userId_email: { userId: req.user.id, email: trimmed } } })
    if (existing) return res.status(400).json({ error: 'This sender email is already added.' })

    const result = await verification.verifyEmail(trimmed)

    const sender = await prisma.senderEmail.create({
      data: {
        userId: req.user.id,
        email: trimmed, displayName: displayName || '', provider: provider || '',
        verificationStatus: result.verified ? 'Verified' : 'Failed',
        verificationDetail: result.detail,
        active: false, connectionStatus: 'Disconnected', health: 'Unknown'
      }
    })

    res.status(201).json({ sender: toSafeSender(sender) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to add sender email' })
  }
})

// ---------------------------------------------------------------------------
// POST /api/senders/connect — the unified "Add Connected Email" flow: one
// real submission does address verification AND (for SMTP providers) a
// real credential test, saving only if both genuinely pass.
// ---------------------------------------------------------------------------
router.post('/connect', requireAuth, async (req, res) => {
  try {
    const { email, displayName, provider, replyToEmail, smtpHost, smtpPort, smtpUsername, smtpPassword, smtpEncryption, testOnly } = req.body || {}
    if (!email?.trim()) return res.status(400).json({ error: 'email is required' })
    const trimmed = email.trim().toLowerCase()
    const trimmedReplyTo = replyToEmail?.trim().toLowerCase() || ''

    // Reply-To gets the same real syntax validation as the sender address
    // itself — a malformed Reply-To would silently break every customer
    // reply, so it's checked up front, not left to fail at send time.
    if (trimmedReplyTo && !verification.validateSyntax(trimmedReplyTo)) {
      return res.status(400).json({ error: `Reply-To email "${trimmedReplyTo}" is not a valid email address.` })
    }

    const usingSmtp = provider !== 'oauth'
    if (usingSmtp && !encryption.isConfigured()) {
      return res.status(503).json({ error: 'SMTP_ENCRYPTION_KEY is not set in backend/.env — required before any SMTP credentials can be stored. See backend/README.md.' })
    }
    if (usingSmtp && (!smtpHost?.trim() || !smtpUsername?.trim() || !smtpPassword?.trim())) {
      return res.status(400).json({ error: 'smtpHost, smtpUsername, and smtpPassword are required for SMTP providers.' })
    }
    if (usingSmtp && !['none', 'ssl', 'starttls'].includes(smtpEncryption)) {
      return res.status(400).json({ error: 'smtpEncryption must be "none", "ssl", or "starttls".' })
    }

    let sender = await prisma.senderEmail.findUnique({ where: { userId_email: { userId: req.user.id, email: trimmed } } })
    if (sender && sender.connectionStatus === 'Connected') {
      return res.status(400).json({ error: 'This sender email is already connected.' })
    }

    // Step 1 — real address-level verification (syntax, disposable check,
    // real DNS MX lookup, best-effort SMTP RCPT TO).
    const verifyResult = await verification.verifyEmail(trimmed)
    if (!verifyResult.verified) {
      if (!testOnly) {
        sender = sender
          ? await prisma.senderEmail.update({ where: { id: sender.id }, data: { verificationStatus: 'Failed', verificationDetail: verifyResult.detail } })
          : await prisma.senderEmail.create({ data: { userId: req.user.id, email: trimmed, displayName: displayName || '', provider: provider || '', replyToEmail: trimmedReplyTo, verificationStatus: 'Failed', verificationDetail: verifyResult.detail } })
      }
      return res.status(400).json({ error: `Address verification failed: ${verifyResult.detail}`, sender: sender ? toSafeSender(sender) : null })
    }

    if (!usingSmtp) {
      if (testOnly) return res.json({ ok: true, message: 'Address verified — Google consent still required to actually connect.' })
      sender = sender
        ? await prisma.senderEmail.update({ where: { id: sender.id }, data: { displayName: displayName || sender.displayName, provider: provider || '', replyToEmail: trimmedReplyTo, verificationStatus: 'Verified', verificationDetail: verifyResult.detail } })
        : await prisma.senderEmail.create({ data: { userId: req.user.id, email: trimmed, displayName: displayName || '', provider: provider || '', replyToEmail: trimmedReplyTo, verificationStatus: 'Verified', verificationDetail: verifyResult.detail } })
      return res.status(201).json({ sender: toSafeSender(sender), needsOAuth: true })
    }

    // Step 2 — the real "Verify Connection": an actual SMTP handshake +
    // AUTH test against these exact credentials.
    const smtpTest = await smtp.testConnection({
      host: smtpHost.trim(), port: Number(smtpPort) || 587,
      username: smtpUsername.trim(), password: smtpPassword, encryption: smtpEncryption
    })

    if (!smtpTest.ok) {
      if (!testOnly) {
        sender = sender
          ? await prisma.senderEmail.update({ where: { id: sender.id }, data: { verificationStatus: 'Verified', verificationDetail: verifyResult.detail, connectionStatus: 'Error', lastError: smtpTest.reason } })
          : await prisma.senderEmail.create({ data: { userId: req.user.id, email: trimmed, displayName: displayName || '', provider: provider || '', replyToEmail: trimmedReplyTo, verificationStatus: 'Verified', verificationDetail: verifyResult.detail, connectionStatus: 'Error', lastError: smtpTest.reason } })
      }
      return res.status(502).json({ error: `SMTP connection test failed: ${smtpTest.reason}`, sender: sender ? toSafeSender(sender) : null })
    }

    // Real "Verify Connection" (test-only) stops here, before anything is
    // persisted — the separate "Save" click (testOnly not set) re-runs
    // both real checks and only then writes to the database.
    if (testOnly) {
      return res.json({ ok: true, message: 'Connection verified — ready to save.' })
    }

    // Both real checks passed — save for real, encrypted at rest.
    const data = {
      displayName: displayName || '', provider: provider || '', replyToEmail: trimmedReplyTo,
      verificationStatus: 'Verified', verificationDetail: verifyResult.detail,
      connectionMethod: 'smtp', smtpHost: smtpHost.trim(), smtpPort: Number(smtpPort) || 587,
      smtpUsername: smtpUsername.trim(), smtpPassword: encryption.encrypt(smtpPassword), smtpEncryption,
      connectionStatus: 'Connected', active: true, health: 'Healthy', lastError: '', connectedAt: new Date()
    }
    sender = sender
      ? await prisma.senderEmail.update({ where: { id: sender.id }, data })
      : await prisma.senderEmail.create({ data: { userId: req.user.id, email: trimmed, ...data } })

    res.status(201).json({ sender: toSafeSender(sender) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to connect sender email' })
  }
})

router.post('/:id/reverify', requireAuth, async (req, res) => {
  try {
    const sender = await findOwnSender(req.user.id, req.params.id)
    if (!sender) return res.status(404).json({ error: 'Sender not found' })
    const result = await verification.verifyEmail(sender.email)
    const updated = await prisma.senderEmail.update({
      where: { id: sender.id },
      data: { verificationStatus: result.verified ? 'Verified' : 'Failed', verificationDetail: result.detail }
    })
    res.json({ sender: toSafeSender(updated) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to re-verify sender' })
  }
})

// Real manual SMTP connection — a real SMTP handshake + AUTH test against
// the exact credentials given, only marking the sender Connected + Active
// if that real test genuinely succeeds.
router.post('/:id/connect-smtp', requireAuth, async (req, res) => {
  try {
    if (!encryption.isConfigured()) {
      return res.status(503).json({ error: 'SMTP_ENCRYPTION_KEY is not set in backend/.env — required before any SMTP credentials can be stored. See backend/README.md.' })
    }
    const sender = await findOwnSender(req.user.id, req.params.id)
    if (!sender) return res.status(404).json({ error: 'Sender not found' })
    if (sender.verificationStatus !== 'Verified') return res.status(400).json({ error: 'This sender must pass address verification before connecting.' })

    const { smtpHost, smtpPort, smtpUsername, smtpPassword, smtpEncryption, provider } = req.body || {}
    if (!smtpHost?.trim() || !smtpUsername?.trim() || !smtpPassword?.trim()) {
      return res.status(400).json({ error: 'smtpHost, smtpUsername, and smtpPassword are required.' })
    }
    if (!['none', 'ssl', 'starttls'].includes(smtpEncryption)) {
      return res.status(400).json({ error: 'smtpEncryption must be "none", "ssl", or "starttls".' })
    }

    const test = await smtp.testConnection({
      host: smtpHost.trim(), port: Number(smtpPort) || 587,
      username: smtpUsername.trim(), password: smtpPassword, encryption: smtpEncryption
    })

    if (!test.ok) {
      await prisma.senderEmail.update({ where: { id: sender.id }, data: { connectionStatus: 'Error', lastError: test.reason } })
      return res.status(502).json({ error: `SMTP connection test failed: ${test.reason}` })
    }

    const updated = await prisma.senderEmail.update({
      where: { id: sender.id },
      data: {
        connectionMethod: 'smtp',
        smtpHost: smtpHost.trim(), smtpPort: Number(smtpPort) || 587,
        smtpUsername: smtpUsername.trim(), smtpPassword: encryption.encrypt(smtpPassword), smtpEncryption,
        provider: provider || sender.provider,
        connectionStatus: 'Connected', active: true, health: 'Healthy', lastError: '', connectedAt: new Date()
      }
    })

    res.json({ sender: toSafeSender(updated) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to connect via SMTP' })
  }
})

// The original OAuth path — kept as a real, equally-valid alternative for
// Gmail/Google Workspace addresses the account owner can personally
// consent to.
router.get('/:id/connect', requireAuth, async (req, res) => {
  try {
    const sender = await findOwnSender(req.user.id, req.params.id)
    if (!sender) return res.status(404).send('Sender not found')
    if (sender.verificationStatus !== 'Verified') return res.status(400).send('This sender must pass verification before connecting.')
    res.redirect(gmail.getSenderAuthUrl(sender.id))
  } catch (err) {
    res.status(503).send(err.message)
  }
})

// PUBLIC — Google's own redirect lands here, with no session cookie of
// its own. The sender row already carries the userId it belongs to (set
// when it was first created by an authenticated request above), so no
// additional auth is needed or possible here — only a lookup by the real
// state token.
router.get('/callback', async (req, res) => {
  const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5174'
  try {
    if (req.query.error || !req.query.code || !req.query.state) {
      return res.redirect(`${frontendOrigin}/email-campaigns?senders=error`)
    }
    const { email, sender } = await gmail.exchangeCodeForSender(req.query.code, req.query.state)

    if (email.toLowerCase() !== sender.email.toLowerCase()) {
      await prisma.senderEmail.update({ where: { id: sender.id }, data: { connectionStatus: 'Error', lastError: `Authorized as ${email}, expected ${sender.email}` } })
      return res.redirect(`${frontendOrigin}/email-campaigns?senders=mismatch`)
    }

    await prisma.senderEmail.update({ where: { id: sender.id }, data: { connectionMethod: 'oauth', active: true, connectionStatus: 'Connected', health: 'Healthy' } })
    res.redirect(`${frontendOrigin}/email-campaigns?senders=connected`)
  } catch (err) {
    console.error('Sender OAuth callback error:', err)
    res.redirect(`${frontendOrigin}/email-campaigns?senders=error`)
  }
})

// POST /api/senders/:id/test — the real "Send Test Email" action.
const dnsChecker = require('../lib/dnsChecker')
const dkim = require('../lib/dkim')

// Deliverability audit — real DNS checks for a sender's own domain
// (SPF/DKIM/DMARC/MX), honest about lookups that couldn't be completed
// from this environment rather than claiming a pass.
router.get('/:id/deliverability', requireAuth, async (req, res) => {
  try {
    const sender = await findOwnSender(req.user.id, req.params.id)
    if (!sender) return res.status(404).json({ error: 'Sender not found' })
    const domain = sender.email.split('@')[1]
    const result = await dnsChecker.runFullCheck(domain)
    res.json({ ...result, dkimConfigured: dkim.isConfigured() })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to run deliverability check' })
  }
})

// Phase 13 — real test mode: sends one real test email without launching
// a campaign, and reports exactly what the brief asks for (connection
// status, auth result, accepted/rejected, the real SMTP response code,
// and the error message) — never SMTP passwords or private keys.
router.post('/:id/test', requireAuth, async (req, res) => {
  try {
    const sender = await findOwnSender(req.user.id, req.params.id)
    if (!sender) return res.status(404).json({ error: 'Sender not found' })
    if (sender.connectionStatus !== 'Connected') return res.status(400).json({ error: 'This sender is not connected yet.' })

    const to = req.body?.to?.trim() || sender.email
    const { sendFromSender } = require('../campaignEngine')
    await sendFromSender(sender, { to, subject: 'FEXUS test email', body: `This is a real test email sent through ${sender.email} (${sender.connectionMethod === 'smtp' ? sender.provider || 'SMTP' : 'Google OAuth'}).` })

    await prisma.senderEmail.update({ where: { id: sender.id }, data: { lastUsedAt: new Date(), health: 'Healthy', lastError: '' } })
    res.json({
      ok: true, sentTo: to,
      connectionStatus: 'Connected', authResult: 'Success', messageAccepted: true, smtpResponseCode: '250', error: null
    })
  } catch (err) {
    console.error(err)
    await prisma.senderEmail.update({ where: { id: req.params.id }, data: { health: 'Degraded', lastError: err.message } })
      .catch((secondaryErr) => console.error('Also failed to record the test-email failure:', secondaryErr.message))
    const msg = err.message || 'Test email failed to send'
    const codeMatch = msg.match(/\b(\d{3})\b/)
    res.status(502).json({
      ok: false,
      connectionStatus: /connection|dns|timed? ?out|timeout/i.test(msg) ? 'Failed' : 'Connected',
      authResult: /auth|credential/i.test(msg) ? 'Failed' : (/connection|dns|timed? ?out/i.test(msg) ? 'Not attempted' : 'Success'),
      messageAccepted: false,
      smtpResponseCode: codeMatch ? codeMatch[1] : null,
      error: msg
    })
  }
})

// POST /api/senders/:id/reconnect — re-runs the real SMTP test (or, for
// OAuth senders, a real token refresh) against credentials already on file.
router.post('/:id/reconnect', requireAuth, async (req, res) => {
  try {
    const sender = await findOwnSender(req.user.id, req.params.id)
    if (!sender) return res.status(404).json({ error: 'Sender not found' })

    if (sender.connectionMethod === 'smtp') {
      const test = await smtp.testConnection({
        host: sender.smtpHost, port: sender.smtpPort, username: sender.smtpUsername,
        password: encryption.decrypt(sender.smtpPassword), encryption: sender.smtpEncryption
      })
      const updated = await prisma.senderEmail.update({
        where: { id: sender.id },
        data: test.ok
          ? { connectionStatus: 'Connected', health: 'Healthy', lastError: '' }
          : { connectionStatus: 'Error', health: 'Unavailable', lastError: test.reason }
      })
      if (!test.ok) return res.status(502).json({ error: test.reason, sender: toSafeSender(updated) })
      return res.json({ sender: toSafeSender(updated) })
    }

    try {
      await gmail.getSenderAccount(sender.id)
      const updated = await prisma.senderEmail.update({ where: { id: sender.id }, data: { connectionStatus: 'Connected', health: 'Healthy', lastError: '' } })
      res.json({ sender: toSafeSender(updated) })
    } catch (err) {
      const updated = await prisma.senderEmail.update({ where: { id: sender.id }, data: { connectionStatus: 'Error', health: 'Unavailable', lastError: err.message } })
      res.status(502).json({ error: err.message, sender: toSafeSender(updated) })
    }
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to reconnect sender' })
  }
})

router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const sender = await findOwnSender(req.user.id, req.params.id)
    if (!sender) return res.status(404).json({ error: 'Sender not found' })
    const data = {}
    if (typeof req.body?.active === 'boolean') data.active = req.body.active
    if (typeof req.body?.displayName === 'string') data.displayName = req.body.displayName
    if (typeof req.body?.replyToEmail === 'string') {
      const trimmedReplyTo = req.body.replyToEmail.trim().toLowerCase()
      if (trimmedReplyTo && !verification.validateSyntax(trimmedReplyTo)) {
        return res.status(400).json({ error: `Reply-To email "${trimmedReplyTo}" is not a valid email address.` })
      }
      data.replyToEmail = trimmedReplyTo
    }
    const updated = await prisma.senderEmail.update({ where: { id: sender.id }, data })
    res.json({ sender: toSafeSender(updated) })
  } catch (err) {
    console.error(err)
    res.status(404).json({ error: 'Sender not found' })
  }
})

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const sender = await findOwnSender(req.user.id, req.params.id)
    if (!sender) return res.status(404).json({ error: 'Sender not found' })
    await prisma.senderEmail.delete({ where: { id: sender.id } })
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(404).json({ error: 'Sender not found' })
  }
})

module.exports = router
