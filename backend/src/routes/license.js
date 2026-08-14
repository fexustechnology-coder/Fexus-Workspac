const express = require('express')
const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const prisma = require('../prismaClient')
const { requireAuth, requireOwner } = require('../middleware/auth')
const { requireLicenseAuth, setLicenseSessionCookie, clearLicenseSessionCookie } = require('../middleware/licenseAuth')
const gmail = require('../lib/gmail')

const router = express.Router()

/** Real cryptographic randomness — crypto.randomBytes, never a
 * sequential or predictable value. Formatted for readability, but the
 * entropy is what matters: 16 random bytes = 128 bits, hex-encoded. */
function generateLicenseId() {
  const raw = crypto.randomBytes(16).toString('hex').toUpperCase()
  return `LIC-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20, 24)}-${raw.slice(24, 28)}-${raw.slice(28, 32)}`
}

function toSafeLicense(l) {
  // licenseId IS returned here — but ONLY from Owner-authenticated
  // endpoints (requireOwner on every route below except the client-facing
  // ones at the bottom of this file). Never returned from any
  // public/client-facing endpoint.
  return {
    id: l.id, licenseId: l.licenseId, assignedEmail: l.assignedEmail,
    status: l.status, plan: l.plan, createdAt: l.createdAt,
    activatedAt: l.activatedAt, deactivatedAt: l.deactivatedAt, revokedAt: l.revokedAt,
    expiresAt: l.expiresAt, emailSentAt: l.emailSentAt
  }
}

/** Real email delivery via the existing, already-connected Gmail
 * integration (lib/gmail.js's singleton sendEmail() — the same real
 * account used for Sales AI/invites/follow-ups elsewhere in this app,
 * not a new send mechanism). Never throws past this function — a failed
 * send is recorded honestly (emailSentAt stays null) rather than
 * silently pretended to have worked, and the Owner can retry via
 * Resend Email in the License Management UI.
 */
async function sendLicenseEmail(license) {
  try {
    await gmail.sendEmail({
      to: license.assignedEmail,
      subject: 'Your access License ID',
      body: `Hi,\n\nYour account has been activated. Here is your License ID — you'll need it, along with your email and password, every time you sign in:\n\n${license.licenseId}\n\nKeep this safe. If you didn't request this, you can ignore this email.\n\n— FEXUS`
    })
    await prisma.license.update({ where: { id: license.id }, data: { emailSentAt: new Date() } })
    return true
  } catch (err) {
    console.error(`[license] Failed to send license email to ${license.assignedEmail}:`, err.message)
    return false
  }
}

// ---------------------------------------------------------------------------
// OWNER MANAGEMENT — every route below requires the Owner specifically,
// per the brief's explicit "Do not expose license generation to clients."
// ---------------------------------------------------------------------------

router.get('/', requireAuth, requireOwner, async (req, res) => {
  try {
    const licenses = await prisma.license.findMany({ orderBy: { createdAt: 'desc' } })
    res.json({ licenses: licenses.map(toSafeLicense) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load licenses' })
  }
})

router.post('/', requireAuth, requireOwner, async (req, res) => {
  try {
    const { assignedEmail, plan, expiresAt } = req.body || {}
    if (!assignedEmail?.trim()) return res.status(400).json({ error: 'assignedEmail is required' })

    // Generated as INACTIVE — Activate is a real, separate, explicit
    // Owner action, matching this codebase's established pattern of never
    // auto-enabling something with real access consequences. The license
    // email is sent on Activate (below), not here — sending an ID for a
    // license that can't be used yet would just be confusing.
    const license = await prisma.license.create({
      data: {
        licenseId: generateLicenseId(),
        assignedEmail: assignedEmail.trim().toLowerCase(),
        plan: plan || '',
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        status: 'INACTIVE'
      }
    })
    res.status(201).json({ license: toSafeLicense(license) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to generate license' })
  }
})

router.post('/:id/activate', requireAuth, requireOwner, async (req, res) => {
  try {
    const license = await prisma.license.findUnique({ where: { id: req.params.id } })
    if (!license) return res.status(404).json({ error: 'License not found' })
    if (license.status === 'REVOKED') return res.status(400).json({ error: 'This license was revoked and cannot be reactivated — generate a new one.' })

    const updated = await prisma.license.update({ where: { id: license.id }, data: { status: 'ACTIVE', activatedAt: license.activatedAt || new Date() } })
    // Real send, right when the license actually becomes usable — not
    // faked, not assumed to have worked. emailSent reflects the real
    // outcome for the frontend to show honestly.
    const emailSent = await sendLicenseEmail(updated)
    const final = await prisma.license.findUnique({ where: { id: license.id } })
    res.json({ license: toSafeLicense(final), emailSent })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to activate license' })
  }
})

router.post('/:id/resend-email', requireAuth, requireOwner, async (req, res) => {
  try {
    const license = await prisma.license.findUnique({ where: { id: req.params.id } })
    if (!license) return res.status(404).json({ error: 'License not found' })
    if (license.status !== 'ACTIVE') return res.status(400).json({ error: 'Only an ACTIVE license can be resent.' })
    const emailSent = await sendLicenseEmail(license)
    if (!emailSent) return res.status(502).json({ error: 'Gmail send failed — check your Gmail connection in Settings.' })
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to resend license email' })
  }
})

router.post('/:id/deactivate', requireAuth, requireOwner, async (req, res) => {
  try {
    const license = await prisma.license.findUnique({ where: { id: req.params.id } })
    if (!license) return res.status(404).json({ error: 'License not found' })
    if (license.status === 'REVOKED') return res.status(400).json({ error: 'This license was already revoked.' })
    const updated = await prisma.license.update({ where: { id: license.id }, data: { status: 'INACTIVE', deactivatedAt: new Date() } })
    res.json({ license: toSafeLicense(updated) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to deactivate license' })
  }
})

router.post('/:id/revoke', requireAuth, requireOwner, async (req, res) => {
  try {
    const license = await prisma.license.findUnique({ where: { id: req.params.id } })
    if (!license) return res.status(404).json({ error: 'License not found' })
    const updated = await prisma.license.update({ where: { id: license.id }, data: { status: 'REVOKED', revokedAt: new Date() } })
    res.json({ license: toSafeLicense(updated) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to revoke license' })
  }
})

router.delete('/:id', requireAuth, requireOwner, async (req, res) => {
  try {
    await prisma.license.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(404).json({ error: 'License not found' })
  }
})

// ---------------------------------------------------------------------------
// CLIENT ACCOUNT + AUTHENTICATION
// ---------------------------------------------------------------------------
// Real two-part model:
//   1. Sign up — a real ClientAccount (email + hashed password + name).
//      This alone grants NO access to anything — it's just an account.
//   2. Sign in — requires the ClientAccount's email + password AND a
//      real, active License whose assignedEmail matches. Having an
//      account is not enough; having a license is not enough; both are
//      required together, checked server-side, every time.
//
// Every real denial reason (no account, wrong password, no license,
// wrong license, revoked, inactive, expired) returns the SAME generic
// message — deliberately, so the response itself can never become a way
// to enumerate valid accounts or licenses. The specific true reason is
// logged server-side only.
// ---------------------------------------------------------------------------

router.post('/client-signup', async (req, res) => {
  try {
    const { email, password, name } = req.body || {}
    if (!email?.trim() || !password || !name?.trim()) return res.status(400).json({ error: 'Name, email, and password are all required.' })
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' })

    const normalizedEmail = email.trim().toLowerCase()
    const existing = await prisma.clientAccount.findUnique({ where: { email: normalizedEmail } })
    if (existing) return res.status(400).json({ error: 'An account already exists for this email.' })

    const passwordHash = await bcrypt.hash(password, 10)
    await prisma.clientAccount.create({ data: { email: normalizedEmail, passwordHash, name: name.trim() } })

    // Deliberately NOT logged in here — sign-in still requires the real
    // License ID, which the client doesn't have yet at this point unless
    // the Owner already activated one for them.
    res.status(201).json({ ok: true, message: 'Account created. Sign in once you have your License ID (sent by email once your license is activated).' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to create account' })
  }
})

router.post('/client-login', async (req, res) => {
  const GENERIC_DENY = { error: 'Invalid email, password, or license ID.' }
  try {
    const { email, password, licenseId } = req.body || {}
    if (!email?.trim() || !password || !licenseId?.trim()) {
      console.log('[license] client-login denied: missing email, password, or licenseId')
      return res.status(401).json(GENERIC_DENY)
    }
    const normalizedEmail = email.trim().toLowerCase()

    const account = await prisma.clientAccount.findUnique({ where: { email: normalizedEmail } })
    if (!account) {
      console.log('[license] client-login denied: no account for this email')
      return res.status(401).json(GENERIC_DENY)
    }
    const passwordOk = await bcrypt.compare(password, account.passwordHash)
    if (!passwordOk) {
      console.log(`[license] client-login denied: wrong password for ${normalizedEmail}`)
      return res.status(401).json(GENERIC_DENY)
    }

    const license = await prisma.license.findUnique({ where: { licenseId: licenseId.trim().toUpperCase() } })
    if (!license) {
      console.log('[license] client-login denied: no license matches the provided licenseId')
      return res.status(401).json(GENERIC_DENY)
    }
    if (license.assignedEmail.toLowerCase() !== normalizedEmail) {
      console.log(`[license] client-login denied: email does not match licenseId ${license.licenseId}`)
      return res.status(401).json(GENERIC_DENY)
    }
    if (license.status === 'REVOKED') {
      console.log(`[license] client-login denied: licenseId ${license.licenseId} is REVOKED`)
      return res.status(401).json(GENERIC_DENY)
    }
    if (license.status !== 'ACTIVE') {
      console.log(`[license] client-login denied: licenseId ${license.licenseId} is ${license.status}, not ACTIVE`)
      return res.status(401).json(GENERIC_DENY)
    }
    if (license.expiresAt && new Date(license.expiresAt) < new Date()) {
      console.log(`[license] client-login denied: licenseId ${license.licenseId} expired at ${license.expiresAt}`)
      return res.status(401).json(GENERIC_DENY)
    }

    setLicenseSessionCookie(res, license)
    console.log(`[license] client-login SUCCESS for licenseId ${license.licenseId}`)
    res.json({ ok: true, email: account.email, name: account.name, plan: license.plan })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Login failed — try again.' })
  }
})

router.get('/client/me', requireLicenseAuth, async (req, res) => {
  try {
    const [license, account] = await Promise.all([
      prisma.license.findUnique({ where: { id: req.license.id } }),
      prisma.clientAccount.findUnique({ where: { email: req.license.email } })
    ])
    // Real-time re-check — a session issued while ACTIVE must stop
    // working the moment the Owner revokes or deactivates it server-side,
    // not just at next-login. This is what makes "Revoke" actually mean
    // something immediately, not just for future login attempts.
    if (!license || license.status !== 'ACTIVE') {
      clearLicenseSessionCookie(res)
      return res.status(401).json({ error: 'This license is no longer active.' })
    }
    res.json({ email: license.assignedEmail, name: account?.name || '', plan: license.plan, activatedAt: license.activatedAt })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load session' })
  }
})

router.post('/client-logout', (req, res) => {
  clearLicenseSessionCookie(res)
  res.json({ ok: true })
})

module.exports = router
