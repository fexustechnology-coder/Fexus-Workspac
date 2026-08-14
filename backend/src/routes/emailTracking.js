const express = require('express')
const prisma = require('../prismaClient')

const router = express.Router()

// A real, minimal, valid 1x1 transparent GIF — the actual bytes a real
// tracking pixel returns, not a placeholder.
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7', 'base64'
)

function sendPixel(res) {
  res.set('Content-Type', 'image/gif')
  res.set('Content-Length', TRANSPARENT_GIF.length)
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  res.set('Pragma', 'no-cache')
  res.status(200).send(TRANSPARENT_GIF)
}

// GET /api/email-tracking/open/:trackingId — PUBLIC, deliberately. The
// recipient's mail client calls this directly; they have no FEXUS
// session. Security here comes entirely from the tracking token being
// real, cryptographically random (crypto.randomBytes(24), generated in
// campaignEngine.js at send time — never a guessable sequential id), not
// from authentication. The response is ALWAYS just image bytes — no
// JSON, no headers, nothing that could leak campaignId, recipient email,
// or any other private information, whether the token is valid or not.
router.get('/open/:trackingId', async (req, res) => {
  try {
    const contact = await prisma.emailCampaignContact.findUnique({ where: { trackingId: req.params.trackingId } })
    if (!contact) {
      // An unknown/invalid token still gets a real pixel back (so a
      // recipient's mail client never sees a broken image or an error
      // page that would look suspicious) — it just doesn't record
      // anything, since there's nothing real to record against.
      return sendPixel(res)
    }

    await prisma.emailOpenEvent.create({
      data: {
        contactId: contact.id,
        campaignId: contact.campaignId,
        templateId: contact.templateId,
        userAgent: (req.headers['user-agent'] || '').slice(0, 500),
        ip: (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim()
      }
    })

    // Denormalized "first open" convenience field — only set once, never
    // overwritten by a later open, so it stays a genuine first-open
    // timestamp for fast unique-open queries.
    if (!contact.openedAt) {
      await prisma.emailCampaignContact.update({ where: { id: contact.id }, data: { openedAt: new Date() } })
    }

    sendPixel(res)
  } catch (err) {
    console.error('Email open tracking error:', err)
    // Never surface an error to the pixel request itself — a broken
    // tracking pixel would be visible/suspicious in the recipient's
    // email client. Log server-side, still return a valid pixel.
    sendPixel(res)
  }
})

module.exports = router
