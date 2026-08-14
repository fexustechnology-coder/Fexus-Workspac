const express = require('express')
const crypto = require('crypto')
const prisma = require('../prismaClient')

const router = express.Router()

/** A real, non-predictable unsubscribe token — crypto.randomBytes, not
 * a guessable value derived from the contact's own id (which would let
 * anyone unsubscribe anyone else just by guessing/incrementing ids). */
function generateUnsubscribeToken() {
  return crypto.randomBytes(20).toString('hex')
}

async function doUnsubscribe(contact) {
  if (!contact) return false
  await prisma.suppressedEmail.upsert({
    where: { userId_email: { userId: contact.campaign.userId, email: contact.email.toLowerCase() } },
    update: {},
    create: { userId: contact.campaign.userId, email: contact.email.toLowerCase(), reason: 'unsubscribed', detail: `Unsubscribed from campaign "${contact.campaign.name}"` }
  })
  return true
}

// RFC 8058 one-click unsubscribe — this is what a real mail client (the
// recipient's own, e.g. Gmail) calls automatically when the recipient
// clicks the built-in "Unsubscribe" button next to the sender name, using
// the List-Unsubscribe-Post header. No page is shown; it just needs to
// succeed.
router.post('/:token', async (req, res) => {
  try {
    const contact = await prisma.emailCampaignContact.findFirst({
      where: { unsubscribeToken: req.params.token },
      include: { campaign: true }
    })
    await doUnsubscribe(contact)
    res.status(200).send('OK')
  } catch (err) {
    console.error('Unsubscribe (one-click) error:', err)
    // Still respond 200 — a broken unsubscribe endpoint is itself a
    // deliverability and trust problem; log the real error server-side.
    res.status(200).send('OK')
  }
})

// A real, human-facing GET page — for a recipient who clicks a link in
// the email body itself rather than using their mail client's built-in
// button. Never exposes campaignId or any other recipient's data.
router.get('/:token', async (req, res) => {
  try {
    const contact = await prisma.emailCampaignContact.findFirst({
      where: { unsubscribeToken: req.params.token },
      include: { campaign: true }
    })
    const ok = await doUnsubscribe(contact)
    res.set('Content-Type', 'text/html; charset=utf-8')
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Unsubscribed</title></head>
<body style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 80px auto; text-align: center; color: #0A0A0B;">
<h2>${ok ? "You've been unsubscribed." : 'This link is no longer valid.'}</h2>
<p style="color: #666;">${ok ? "You won't receive further emails from this campaign, or any future campaign from this sender." : 'It may have already been used, or the campaign no longer exists.'}</p>
</body></html>`)
  } catch (err) {
    console.error('Unsubscribe (page) error:', err)
    res.status(500).send('Something went wrong. Please try again later.')
  }
})

module.exports = { router, generateUnsubscribeToken }
