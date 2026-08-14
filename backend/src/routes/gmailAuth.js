const express = require('express')
const prisma = require('../prismaClient')
const { requireAuth, requireOwner } = require('../middleware/auth')
const gmail = require('../lib/gmail')

const router = express.Router()

router.get('/status', requireAuth, requireOwner, async (req, res) => {
  try {
    const account = await prisma.gmailAccount.findUnique({ where: { id: 'singleton' } })
    res.json({
      configured: gmail.isConfigured(),
      connected: !!(account && account.refreshToken),
      email: account?.email || null
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to check Gmail status' })
  }
})

router.get('/connect', requireAuth, requireOwner, (req, res) => {
  try {
    res.redirect(gmail.getAuthUrl())
  } catch (err) {
    res.status(503).json({ error: err.message })
  }
})

router.get('/callback', async (req, res) => {
  const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5174'
  try {
    if (req.query.error) {
      return res.redirect(`${frontendOrigin}/owner/settings?gmail=denied`)
    }
    if (!req.query.code) {
      return res.redirect(`${frontendOrigin}/owner/settings?gmail=error`)
    }
    const { email } = await gmail.exchangeCodeForTokens(req.query.code)
    res.redirect(`${frontendOrigin}/owner/settings?gmail=connected&email=${encodeURIComponent(email)}`)
  } catch (err) {
    console.error('Gmail OAuth callback error:', err)
    res.redirect(`${frontendOrigin}/owner/settings?gmail=error`)
  }
})

router.post('/disconnect', requireAuth, requireOwner, async (req, res) => {
  try {
    await prisma.gmailAccount.deleteMany({ where: { id: 'singleton' } })
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to disconnect Gmail' })
  }
})

router.post('/send-test', requireAuth, requireOwner, async (req, res) => {
  try {
    const { to } = req.body || {}
    if (!to) return res.status(400).json({ error: 'to is required' })
    const result = await gmail.sendEmail({ to, subject: 'FEXUS test email', body: 'This is a real test email sent through your connected Gmail account.' })
    res.json({ ok: true, messageId: result.messageId })
  } catch (err) {
    console.error(err)
    res.status(502).json({ error: err.message })
  }
})

module.exports = router
