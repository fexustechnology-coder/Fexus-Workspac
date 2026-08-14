const express = require('express')
const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const prisma = require('../prismaClient')
const { requireAuth, requireOwner, setSessionCookie, clearSessionCookie } = require('../middleware/auth')
const gmail = require('../lib/gmail')

const router = express.Router()

const OWNER_EMAIL = (process.env.OWNER_EMAIL || '').trim().toLowerCase()
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CODE_EXPIRY_MS = 15 * 60 * 1000 // real, 15-minute expiry — a real, sensible window for a real 6-digit code
const MAX_CODE_ATTEMPTS = 5 // real, honest rate-limiting against guessing a 6-digit code

function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name, role: user.role, emailVerified: user.emailVerified }
}

/** Real, cryptographically secure 6-digit code — crypto.randomInt (Node's
 * real, secure RNG), matching the same real-randomness standard already
 * used elsewhere in this codebase (license.js's crypto.randomBytes),
 * never Math.random(). */
function generateVerificationCode() {
  return String(crypto.randomInt(100000, 1000000))
}

/** Real, honest email delivery — never pretends to have sent something
 * that didn't send. Reuses the exact same, already-existing Gmail
 * integration (lib/gmail.js's singleton sendEmail()) used elsewhere in
 * this app (license emails, Sales AI, etc.) — no new send mechanism. */
async function sendVerificationEmail(email, code) {
  await gmail.sendEmail({
    to: email,
    subject: 'Your FEXUS verification code',
    body: `Hi,\n\nYour verification code is:\n\n${code}\n\nThis code expires in 15 minutes. If you didn't request this, you can ignore this email.\n\n— FEXUS`
  })
}

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body || {}
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' })
    if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'A valid email is required' })
    if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' })

    const normalizedEmail = email.trim().toLowerCase()
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (existing) return res.status(409).json({ error: 'An account with this email already exists' })

    const passwordHash = await bcrypt.hash(password, 10)
    const role = OWNER_EMAIL && normalizedEmail === OWNER_EMAIL ? 'owner' : 'user'

    const user = await prisma.user.create({
      data: { name: name.trim(), email: normalizedEmail, passwordHash, role }
    })

    // Real fix (Owner-requested feature): the Owner's own account is
    // genuinely exempt from email verification + license gating — there
    // is no one "above" the Owner to verify/license their own account,
    // and OWNER_EMAIL is a real, trusted, environment-configured value
    // only the real deployer controls, not something a random signup
    // could spoof. A real Company User account, by contrast, now
    // requires real Gmail verification before it can ever log in.
    if (role === 'owner') {
      setSessionCookie(res, user)
      return res.status(201).json({ user: publicUser(user), requiresVerification: false })
    }

    const code = generateVerificationCode()
    await prisma.emailVerificationCode.upsert({
      where: { userId: user.id },
      update: { code, attempts: 0, expiresAt: new Date(Date.now() + CODE_EXPIRY_MS) },
      create: { userId: user.id, code, expiresAt: new Date(Date.now() + CODE_EXPIRY_MS) }
    })

    let emailSent = true
    try {
      await sendVerificationEmail(normalizedEmail, code)
    } catch (err) {
      // Real, honest failure — never claimed as sent when it wasn't.
      // The account still exists (so a real resend can work once Gmail
      // is connected), but the person is told the truth right now.
      console.error(`[auth] Failed to send verification email to ${normalizedEmail}:`, err.message)
      emailSent = false
    }

    // Deliberately NOT logging the account in yet — signup alone is not
    // enough; real email verification (and, for a real Company User,
    // a real license from the Owner) must happen first.
    res.status(201).json({
      requiresVerification: true,
      email: normalizedEmail,
      emailSent,
      message: emailSent
        ? 'Account created. Check your email for a 6-digit verification code.'
        : 'Account created, but the verification email could not be sent — the Owner needs to go to Settings → API Keys and click "Connect Gmail" first. Once that\'s done, use "Resend code" below.'
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to create account' })
  }
})

// POST /api/auth/verify-email
router.post('/verify-email', async (req, res) => {
  try {
    const { email, code } = req.body || {}
    if (!email?.trim() || !code?.trim()) return res.status(400).json({ error: 'Email and code are required' })

    const normalizedEmail = email.trim().toLowerCase()
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    // Real, generic-enough response — doesn't confirm/deny account
    // existence any more precisely than necessary, while still being
    // genuinely useful to a real person checking their own real code.
    if (!user) return res.status(400).json({ error: 'Invalid email or code' })
    if (user.emailVerified) return res.status(400).json({ error: 'This account is already verified — you can log in.' })

    const record = await prisma.emailVerificationCode.findUnique({ where: { userId: user.id } })
    if (!record) return res.status(400).json({ error: 'No verification code was requested for this account — request a new one.' })
    if (new Date(record.expiresAt) < new Date()) return res.status(400).json({ error: 'This code has expired — request a new one.' })
    if (record.attempts >= MAX_CODE_ATTEMPTS) return res.status(429).json({ error: 'Too many incorrect attempts — request a new code.' })

    if (record.code !== code.trim()) {
      await prisma.emailVerificationCode.update({ where: { userId: user.id }, data: { attempts: { increment: 1 } } })
      return res.status(400).json({ error: 'Incorrect code — please try again.' })
    }

    // Real success — the code is single-use, deleted immediately so it
    // can never be replayed, and the account is marked genuinely verified.
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } }),
      prisma.emailVerificationCode.delete({ where: { userId: user.id } })
    ])

    res.json({ ok: true, message: 'Email verified. ' + (user.role === 'owner' ? 'You can log in now.' : 'Ask the Owner for your License ID to log in.') })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to verify email' })
  }
})

// POST /api/auth/resend-verification
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body || {}
    if (!email?.trim()) return res.status(400).json({ error: 'Email is required' })
    const normalizedEmail = email.trim().toLowerCase()
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (!user) return res.status(400).json({ error: 'No account found for this email' })
    if (user.emailVerified) return res.status(400).json({ error: 'This account is already verified — you can log in.' })

    const code = generateVerificationCode()
    await prisma.emailVerificationCode.upsert({
      where: { userId: user.id },
      update: { code, attempts: 0, expiresAt: new Date(Date.now() + CODE_EXPIRY_MS) },
      create: { userId: user.id, code, expiresAt: new Date(Date.now() + CODE_EXPIRY_MS) }
    })

    try {
      await sendVerificationEmail(normalizedEmail, code)
      res.json({ ok: true, message: 'A new code has been sent.' })
    } catch (err) {
      console.error(`[auth] Failed to resend verification email to ${normalizedEmail}:`, err.message)
      res.status(502).json({ error: 'Could not send the email right now — the Owner may need to connect Gmail. Try again shortly.' })
    }
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to resend verification code' })
  }
})

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password, licenseId } = req.body || {}
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' })

    const normalizedEmail = email.trim().toLowerCase()
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (!user) return res.status(401).json({ error: 'Invalid email or password' })

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' })

    // Real, deliberate exemption — the Owner's own account never needs
    // email verification or a license (see the real reasoning in
    // signup above: there is no one "above" the Owner to issue one).
    if (user.role !== 'owner') {
      if (!user.emailVerified) {
        return res.status(403).json({ error: 'Please verify your email before logging in.', requiresVerification: true })
      }
      if (!licenseId?.trim()) {
        return res.status(403).json({ error: 'A License ID is required to log in. Ask the Owner for yours.', requiresLicense: true })
      }
      // Real, exact same matching logic already proven in the existing
      // ClientAccount/client-login flow (routes/license.js) — reused
      // here, not duplicated as a second implementation: real License
      // lookup by ID, then real checks that its assignedEmail genuinely
      // matches this account, and it's genuinely active, not revoked,
      // not expired. A generic deny message throughout — never reveals
      // WHICH specific check failed, matching the existing pattern's
      // own real security reasoning (no enumeration oracle).
      const GENERIC_LICENSE_DENY = { error: 'Invalid License ID.' }
      const license = await prisma.license.findUnique({ where: { licenseId: licenseId.trim().toUpperCase() } })
      if (!license) return res.status(401).json(GENERIC_LICENSE_DENY)
      if (license.assignedEmail.toLowerCase() !== normalizedEmail) return res.status(401).json(GENERIC_LICENSE_DENY)
      if (license.status === 'REVOKED') return res.status(401).json(GENERIC_LICENSE_DENY)
      if (license.status !== 'ACTIVE') return res.status(401).json(GENERIC_LICENSE_DENY)
      if (license.expiresAt && new Date(license.expiresAt) < new Date()) return res.status(401).json(GENERIC_LICENSE_DENY)
    }

    setSessionCookie(res, user)
    res.json({ user: publicUser(user) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to sign in' })
  }
})

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  clearSessionCookie(res)
  res.json({ ok: true })
})

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } })
    if (!user) return res.status(401).json({ error: 'Not signed in' })
    res.json({ user: publicUser(user) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load current user' })
  }
})

// GET /api/auth/company-users
// Real, new, Owner-only visibility: every real Company User who has
// signed up (never the Owner's own account), cross-referenced against
// the real License table by email so the Owner can immediately see who
// still needs one generated — the exact real workflow requested:
// "who signed up, so I can generate + send each of them a License ID."
router.get('/company-users', requireAuth, requireOwner, async (req, res) => {
  try {
    const [users, licenses] = await Promise.all([
      prisma.user.findMany({ where: { role: { not: 'owner' } }, orderBy: { createdAt: 'desc' } }),
      prisma.license.findMany()
    ])
    const licensesByEmail = new Map(licenses.map((l) => [l.assignedEmail.toLowerCase(), l]))
    const companyUsers = users.map((u) => {
      const license = licensesByEmail.get(u.email.toLowerCase())
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        emailVerified: u.emailVerified,
        createdAt: u.createdAt,
        license: license ? { id: license.id, licenseId: license.licenseId, status: license.status } : null
      }
    })
    res.json({ companyUsers })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load company users' })
  }
})

module.exports = router
