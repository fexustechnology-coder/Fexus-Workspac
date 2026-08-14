const express = require('express')
const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const prisma = require('../prismaClient')
const { requireAuth, requireOwner } = require('../middleware/auth')

const router = express.Router()

async function getSettings() {
  return prisma.workspaceSettings.upsert({ where: { id: 'singleton' }, update: {}, create: { id: 'singleton' } })
}

const BOOLEAN_FIELDS = [
  'defaultLandingPage', 'compactSidebar', 'showComingSoonPages',
  'twoFactorEnabled', 'ssoEnabled', 'sessionTimeoutEnabled',
  'billingAlerts', 'projectUpdates', 'aiWorkforceUpdates', 'weeklySummaryEmail'
]
const STRING_FIELDS = ['companyName', 'companyWebsite', 'companyIndustry', 'companySize', 'theme']

router.get('/', requireAuth, requireOwner, async (req, res) => {
  try {
    const settings = await getSettings()
    res.json({ settings })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load settings' })
  }
})

router.patch('/', requireAuth, requireOwner, async (req, res) => {
  try {
    const data = {}
    for (const f of STRING_FIELDS) if (typeof req.body?.[f] === 'string') data[f] = req.body[f]
    for (const f of BOOLEAN_FIELDS) if (typeof req.body?.[f] === 'boolean') data[f] = req.body[f]
    if (req.body?.theme && !['light', 'dark', 'system'].includes(req.body.theme)) {
      return res.status(400).json({ error: 'Invalid theme' })
    }

    const settings = await prisma.workspaceSettings.upsert({
      where: { id: 'singleton' }, update: data, create: { id: 'singleton', ...data }
    })
    res.json({ settings })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to save settings' })
  }
})

router.get('/team', requireAuth, requireOwner, async (req, res) => {
  try {
    const [users, invites] = await Promise.all([
      prisma.user.findMany({ select: { id: true, name: true, email: true, role: true, createdAt: true } }),
      prisma.teamInvite.findMany({ where: { status: 'Pending' }, orderBy: { createdAt: 'desc' } })
    ])
    res.json({
      members: [
        ...users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role === 'owner' ? 'Owner' : 'Member', status: 'Active' })),
        ...invites.map((i) => ({ id: i.id, name: i.email.split('@')[0], email: i.email, role: i.role, status: 'Pending', emailSent: i.emailSent }))
      ]
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load team members' })
  }
})

router.post('/team/invite', requireAuth, requireOwner, async (req, res) => {
  try {
    const { email, role } = req.body || {}
    if (!email?.trim()) return res.status(400).json({ error: 'email is required' })

    const existingUser = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } })
    if (existingUser) return res.status(400).json({ error: 'This person already has an account.' })

    const invite = await prisma.teamInvite.create({
      data: { email: email.trim().toLowerCase(), role: role || 'Member', token: crypto.randomBytes(24).toString('hex') }
    })

    let emailSent = false
    try {
      const gmail = require('../lib/gmail')
      const connected = await gmail.isConnected()
      if (connected) {
        const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5174'
        await gmail.sendEmail({
          to: invite.email,
          subject: 'You\'ve been invited to FEXUS Workspace',
          body: `Hi,\n\nYou've been invited to join a FEXUS Workspace as a ${invite.role}.\n\nSign up here using this email address to get access: ${frontendOrigin}/signup\n\nSee you there!`
        })
        emailSent = true
        await prisma.teamInvite.update({ where: { id: invite.id }, data: { emailSent: true } })
      }
    } catch (err) {
      console.error('Invite email failed to send:', err.message)
    }

    res.status(201).json({ invite, emailSent })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to create invite' })
  }
})

router.delete('/team/invite/:id', requireAuth, requireOwner, async (req, res) => {
  try {
    await prisma.teamInvite.update({ where: { id: req.params.id }, data: { status: 'Revoked' } })
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(404).json({ error: 'Invite not found' })
  }
})

router.get('/api-keys', requireAuth, requireOwner, async (req, res) => {
  try {
    const keys = await prisma.apiKey.findMany({ where: { revoked: false }, orderBy: { createdAt: 'desc' } })
    res.json({ keys: keys.map((k) => ({ id: k.id, name: k.name, keyPrefix: k.keyPrefix, createdAt: k.createdAt, lastUsedAt: k.lastUsedAt })) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load API keys' })
  }
})

router.post('/api-keys', requireAuth, requireOwner, async (req, res) => {
  try {
    const { name } = req.body || {}
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' })

    const raw = crypto.randomBytes(24).toString('hex')
    const fullKey = `fx_live_${raw}`
    const keyPrefix = `fx_live_${raw.slice(0, 6)}...${raw.slice(-4)}`
    const keyHash = await bcrypt.hash(fullKey, 10)

    const key = await prisma.apiKey.create({ data: { name: name.trim(), keyPrefix, keyHash } })
    res.status(201).json({ key: { id: key.id, name: key.name, keyPrefix: key.keyPrefix, createdAt: key.createdAt }, fullKey })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to generate API key' })
  }
})

router.delete('/api-keys/:id', requireAuth, requireOwner, async (req, res) => {
  try {
    await prisma.apiKey.update({ where: { id: req.params.id }, data: { revoked: true } })
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(404).json({ error: 'API key not found' })
  }
})

module.exports = router
