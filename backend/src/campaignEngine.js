// =============================================================================
// REAL CAMPAIGN ENGINE (Phase 17, corrected Phase 19)
// =============================================================================
// Phase 19 fix (tasks 1 & 10): campaigns now ALWAYS send through a real,
// Connected sender email — never through the Owner's own login-tied
// Gmail account. The previous version fell back to lib/gmail.js's
// singleton sendEmail() (the same account used for login/Settings) any
// time a campaign didn't have rotation explicitly configured — that was
// exactly the bug reported: login email and sender email must be
// completely independent, and now they are, unconditionally.
//
// Sends dispatch to one of two real, equally-first-class connection
// methods per sender (lib/gmail.js for OAuth, lib/smtp.js for manual
// SMTP) — see sendFromSender() below.
// =============================================================================

const prisma = require('./prismaClient')
const crypto = require('crypto')
const gmail = require('./lib/gmail')
const smtp = require('./lib/smtp')
const encryption = require('./lib/encryption')
const { textToBasicHtml } = require('./lib/mimeBuilder')

const TICK_MS = 5000
let started = false

// Phase 22 — supports both {{key}} (the original syntax) and {key} (the
// merge-field syntax the template library uses) so existing campaigns
// that already use double braces keep working unchanged, no regression.
function replacePlaceholders(text, email, personalization) {
  const data = { email, date: new Date().toLocaleDateString(), ...personalization }
  const withDouble = (text || '').replace(/\{\{(\w+)\}\}/g, (match, key) => (data[key] !== undefined ? String(data[key]) : match))
  return withDouble.replace(/\{(\w+)\}/g, (match, key) => (data[key] !== undefined ? String(data[key]) : match))
}

/**
 * Phase 23 — the ONE real, shared template-selection function. Both the
 * actual sending engine below and the campaign-preview endpoint
 * (routes/emailCampaigns.js) call this exact function, so a preview can
 * never show a different assignment than what actually gets sent.
 *
 * Deliberately a pure function of (templates, emailsPerTemplate, order) —
 * no separate mutable "current template" pointer exists anywhere. This is
 * what makes pause/resume automatically correct with zero extra recovery
 * logic: contact #37 maps to the same template whether it's sent now or
 * after a 3-day pause, because the inputs to this function never change
 * once a campaign's templates and emailsPerTemplate are set.
 *
 * Returns null when there are no templates at all (the campaign uses its
 * own top-level subject/body instead — fully backward compatible with
 * every campaign created before this phase).
 */
function getTemplateForOrder(templates, emailsPerTemplate, order) {
  if (!templates || templates.length === 0) return null
  if (!emailsPerTemplate || emailsPerTemplate <= 0) return templates[0]
  const idx = Math.min(Math.floor(order / emailsPerTemplate), templates.length - 1)
  return templates[idx]
}

/** Real, non-predictable tracking token — crypto.randomBytes, not a
 * sequential or guessable id, per the explicit requirement that tracking
 * IDs must never be enumerable. */
function generateTrackingId() {
  return crypto.randomBytes(24).toString('hex')
}

/** Dispatches a real send through whichever real connection method this
 * specific sender actually uses — the one place that decision is made. */
async function sendFromSender(sender, { to, subject, body, htmlBody, unsubscribeUrl }) {
  const replyTo = sender.replyToEmail || undefined
  if (sender.connectionMethod === 'smtp') {
    // Real decryption, happening only here, only for the moment of an
    // actual send — the plaintext password is never persisted or logged.
    return smtp.sendViaSmtp({
      host: sender.smtpHost, port: sender.smtpPort, username: sender.smtpUsername,
      password: encryption.decrypt(sender.smtpPassword), encryption: sender.smtpEncryption,
      fromEmail: sender.email, replyTo, to, subject, body, htmlBody, unsubscribeUrl,
      allowInsecureTls: sender.allowInsecureTls
    })
  }
  return gmail.sendEmailFromSender(sender.id, { to, subject, body, replyTo, htmlBody, unsubscribeUrl })
}

function randomDelaySeconds(min, max) {
  const lo = Math.min(min, max), hi = Math.max(min, max)
  return Math.floor(Math.random() * (hi - lo + 1)) + lo
}

async function log(campaignId, event, message, email) {
  return prisma.emailCampaignLog.create({ data: { campaignId, event, message: message || event, email: email || '' } })
}

async function refreshStatistics(campaignId) {
  const emails = await prisma.emailCampaignContact.findMany({ where: { campaignId } })
  const data = {
    loaded: emails.length,
    sent: emails.filter((e) => e.status === 'Sent').length,
    failed: emails.filter((e) => e.status === 'Failed').length,
    retried: emails.reduce((sum, e) => sum + (e.attempts > 0 ? 1 : 0), 0),
    skipped: emails.filter((e) => e.status === 'Skipped').length
  }
  return prisma.emailCampaignStatistics.upsert({
    where: { campaignId }, update: data, create: { campaignId, ...data }
  })
}

function isDifferentDay(a, b) {
  if (!a) return true
  return new Date(a).toDateString() !== new Date(b).toDateString()
}

async function processCampaign(campaign) {
  const queue = await prisma.emailCampaignQueue.upsert({
    where: { campaignId: campaign.id }, update: {}, create: { campaignId: campaign.id }
  })

  if (queue.isProcessing) return
  if (queue.nextSendAt && new Date(queue.nextSendAt) > new Date()) return

  let sentToday = campaign.sentToday
  if (isDifferentDay(campaign.lastSendDate, new Date())) sentToday = 0
  if (sentToday >= campaign.dailyLimit) {
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(0, 5, 0, 0)
    await prisma.emailCampaignQueue.update({ where: { campaignId: campaign.id }, data: { nextSendAt: tomorrow } })
    return
  }

  // Phase 19 — every campaign now ALWAYS resolves a real Connected Sender.
  // There is no more legacy "no rotation configured" path that quietly
  // used the login-tied Gmail account — resolveRotationSender() treats
  // emailsPerSender <= 0 as "never switch" (an unlimited quota on
  // whichever sender is current), not as "skip rotation entirely."
  const activeSender = await resolveRotationSender(campaign, queue)
  if (!activeSender) {
    await prisma.emailCampaign.update({ where: { id: campaign.id }, data: { status: 'Paused' } })
    await log(campaign.id, 'Campaign Paused', 'No healthy Connected Sender is available for this campaign — attach and connect at least one real sender email, then resume.')
    return
  }

  // Deliverability audit — real, persistent, cross-campaign suppression
  // check. Any contact whose email previously hard-bounced or
  // unsubscribed (in ANY campaign, not just this one) is skipped before
  // it's ever considered for sending — this is what makes "never
  // repeatedly send to a permanently-bounced address" actually true.
  const suppressedRows = await prisma.suppressedEmail.findMany({ where: { userId: campaign.userId }, select: { email: true } })
  if (suppressedRows.length > 0) {
    const suppressedSet = new Set(suppressedRows.map((s) => s.email.toLowerCase()))
    const pendingContacts = await prisma.emailCampaignContact.findMany({
      where: { campaignId: campaign.id, status: { in: ['Pending', 'Retry'] } }, select: { id: true, email: true }
    })
    const toSuppress = pendingContacts.filter((c) => suppressedSet.has(c.email.toLowerCase()))
    if (toSuppress.length > 0) {
      await prisma.emailCampaignContact.updateMany({
        where: { id: { in: toSuppress.map((c) => c.id) } },
        data: { status: 'Skipped', lastError: 'Suppressed — previously hard-bounced or unsubscribed' }
      })
      await log(campaign.id, 'Contacts Suppressed', `${toSuppress.length} contact(s) skipped — on the suppression list.`)
      await refreshStatistics(campaign.id)
    }
  }

  const next = await prisma.emailCampaignContact.findFirst({
    where: { campaignId: campaign.id, status: { in: ['Pending', 'Retry'] } },
    orderBy: { order: 'asc' }
  })

  if (!next) {
    await prisma.emailCampaign.update({ where: { id: campaign.id }, data: { status: 'Completed', completedAt: new Date() } })
    await log(campaign.id, 'Campaign Completed', 'All emails processed.')
    await refreshStatistics(campaign.id)
    return
  }

  await prisma.emailCampaignQueue.update({ where: { campaignId: campaign.id }, data: { isProcessing: true, currentEmailId: next.id } })
  await prisma.emailCampaignContact.update({ where: { id: next.id }, data: { status: 'Sending' } })

  // Phase 23 — real, deterministic template selection. Same function the
  // preview endpoint uses; `template` is null for any campaign with no
  // templates attached, in which case behavior is byte-for-byte what it
  // was before this phase (campaign.subject/body).
  const templates = await prisma.emailCampaignTemplate.findMany({ where: { campaignId: campaign.id }, orderBy: { order: 'asc' } })
  const template = getTemplateForOrder(templates, campaign.emailsPerTemplate, next.order)

  const personalization = JSON.parse(next.personalization || '{}')
  const rawSubject = template ? template.subject : campaign.subject
  const rawBody = template ? template.body : campaign.body
  const subject = replacePlaceholders(rawSubject, next.email, personalization)
  const body = replacePlaceholders(rawBody, next.email, personalization) + (campaign.signature ? `\n\n${campaign.signature}` : '')

  // Deliverability audit — real, per-recipient unsubscribe token and
  // List-Unsubscribe header, generated at send time for every real send
  // (not just tracked ones — Phase 9's "marketing emails need a clear
  // unsubscribe mechanism" applies regardless of whether open tracking
  // is on). A non-predictable token, never the contact's own row id.
  const unsubscribeToken = generateTrackingId()
  await prisma.emailCampaignContact.update({ where: { id: next.id }, data: { unsubscribeToken } })
  const baseUrl = process.env.PUBLIC_PREVIEW_BASE_URL || 'http://localhost:4000'
  const unsubscribeUrl = `${baseUrl}/api/unsubscribe/${unsubscribeToken}`

  // Phase 23 — real open tracking, opt-in. A fresh, non-predictable
  // tracking id is generated and saved BEFORE sending — so even if the
  // recipient's mail client fetches the pixel before this function's own
  // "mark as Sent" write completes, the tracking row already exists to
  // record against. Never the campaignId or recipient email in the URL.
  let trackingId = null, htmlBody = null
  if (campaign.trackOpens) {
    trackingId = generateTrackingId()
    await prisma.emailCampaignContact.update({ where: { id: next.id }, data: { trackingId } })
    const pixelUrl = `${baseUrl}/api/email-tracking/open/${trackingId}`
    htmlBody = textToBasicHtml(body) + `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none;border:0;" />`
  }

  try {
    await sendFromSender(activeSender.sender, { to: next.email, subject, body, htmlBody, unsubscribeUrl })
    await prisma.emailCampaignSender.update({ where: { id: activeSender.id }, data: { sentCount: { increment: 1 } } })
    await prisma.senderEmail.update({
      where: { id: activeSender.senderId },
      data: {
        lastUsedAt: new Date(), health: 'Healthy',
        dailyUsage: activeSender.sender.dailyUsageDate && new Date(activeSender.sender.dailyUsageDate).toDateString() === new Date().toDateString()
          ? { increment: 1 } : 1,
        dailyUsageDate: new Date()
      }
    })
    await log(campaign.id, 'Email Sent', `Sent to ${next.email} via ${activeSender.sender.email}${template ? ` (template: ${template.name || `#${template.order + 1}`})` : ''}`, next.email)
    // templateId recorded HERE, at send time, exactly once — never
    // inferred after the fact from order/emailsPerTemplate later, per
    // the brief's explicit requirement.
    await prisma.emailCampaignContact.update({ where: { id: next.id }, data: { status: 'Sent', sentAt: new Date(), templateId: template?.id || null } })
    await prisma.emailCampaign.update({ where: { id: campaign.id }, data: { sentToday: sentToday + 1, lastSendDate: new Date() } })
  } catch (err) {
    const msg = err.message || 'Unknown error'
    const isFatal = /\b(401|403|429)\b/.test(msg) || /unauthor|forbidden|rate.?limit|quota|smtp|timed? ?out|timeout|connection (error|refused|failed)|auth/i.test(msg)
    // Deliverability audit — a real, specific hard-bounce signal: the
    // SMTP client's own error text for a rejected RCPT TO (see
    // lib/smtp.js) or Gmail's equivalent recipient-rejection message.
    // This is a RECIPIENT problem, not a sender problem — retrying it
    // never helps (the mailbox doesn't exist), and it must never
    // silently keep being sent to in future campaigns either.
    const isHardBounce = /rejected recipient|mailbox unavailable|user unknown|no such user|recipient address rejected|invalid recipient/i.test(msg)

    if (isHardBounce) {
      await prisma.suppressedEmail.upsert({
        where: { userId_email: { userId: campaign.userId, email: next.email.toLowerCase() } },
        update: { detail: msg },
        create: { userId: campaign.userId, email: next.email.toLowerCase(), reason: 'hard_bounce', detail: msg }
      })
      await prisma.emailCampaignContact.update({ where: { id: next.id }, data: { status: 'Failed', attempts: next.attempts + 1, lastError: msg } })
      await log(campaign.id, 'Hard Bounce', `${next.email} permanently bounced and added to the suppression list — will not be emailed again in any future campaign: ${msg}`, next.email)
    } else if (isFatal) {
      // Task 7 — a failed SENDER never stops the campaign on its own; it's
      // benched and the next healthy sender picks up the contact.
      await prisma.emailCampaignSender.update({ where: { id: activeSender.id }, data: { status: 'Unavailable', lastError: msg } })
      await prisma.senderEmail.update({ where: { id: activeSender.senderId }, data: { health: 'Unavailable', lastError: msg } })
      await prisma.emailCampaignContact.update({ where: { id: next.id }, data: { status: 'Pending' } })
      await log(campaign.id, 'Sender Unavailable', `${activeSender.sender.email} marked unavailable and skipped: ${msg}`, next.email)
    } else {
      const attempts = next.attempts + 1
      if (attempts <= campaign.retryLimit) {
        await prisma.emailCampaignContact.update({ where: { id: next.id }, data: { status: 'Retry', attempts, lastError: msg } })
        await log(campaign.id, 'Email Failed', `Failed (attempt ${attempts}/${campaign.retryLimit}), will retry: ${msg}`, next.email)
      } else {
        await prisma.emailCampaignContact.update({ where: { id: next.id }, data: { status: 'Failed', attempts, lastError: msg } })
        await log(campaign.id, 'Email Failed', `Failed permanently after ${attempts} attempts: ${msg}`, next.email)
      }
    }
  }

  const stats = await refreshStatistics(campaign.id)

  // Deliverability audit (Phase 11/12) — a real safety control, not a
  // deliverability guarantee: if a meaningful share of real sends are
  // hard-bouncing or failing, that's a strong signal something is wrong
  // (a bad list, a broken sender, or a real reputation problem already
  // in progress) — continuing to blast the rest of the list would make
  // it worse. Requires a minimum real sample (20 sends) before judging,
  // so early noise from 1-2 bad addresses in a large campaign doesn't
  // trigger a false pause.
  const totalAttempted = stats.sent + stats.failed
  if (totalAttempted >= 20) {
    const failureRate = stats.failed / totalAttempted
    if (failureRate > 0.2) {
      const stillActive = await prisma.emailCampaign.findUnique({ where: { id: campaign.id } })
      if (stillActive.status === 'Running') {
        await prisma.emailCampaign.update({ where: { id: campaign.id }, data: { status: 'Paused' } })
        await log(campaign.id, 'Campaign Auto-Paused', `Paused automatically — ${stats.failed}/${totalAttempted} sends (${Math.round(failureRate * 100)}%) have failed or hard-bounced. This usually means a list-quality or sender problem; review the failures before resuming.`)
      }
    }
  }

  const stillRunning = await prisma.emailCampaign.findUnique({ where: { id: campaign.id } })
  if (stillRunning.status === 'Running') {
    const seconds = campaign.delayMode === 'random' ? randomDelaySeconds(campaign.delayMin, campaign.delayMax) : campaign.delaySeconds
    const nextSendAt = new Date(Date.now() + seconds * 1000)
    await log(campaign.id, 'Waiting', `Waiting ${seconds}s before the next email.`)
    await prisma.emailCampaignQueue.update({
      where: { campaignId: campaign.id },
      data: { isProcessing: false, nextSendAt, currentEmailId: null, currentSenderSentCount: { increment: 1 } }
    })
  } else {
    await prisma.emailCampaignQueue.update({ where: { campaignId: campaign.id }, data: { isProcessing: false } })
  }
}

/**
 * Real round-robin resolution — task 6, explicitly NOT random. Advances
 * to the next healthy sender in fixed `order` once the current one hits
 * its real emailsPerSender quota (0/unset means "never switch on quota" —
 * it only rotates away on a real failure), wrapping back to the first
 * healthy sender after the last. Returns null only when no healthy
 * sender remains at all.
 */
async function resolveRotationSender(campaign, queue) {
  const senders = await prisma.emailCampaignSender.findMany({
    where: { campaignId: campaign.id, status: 'Healthy' },
    orderBy: { order: 'asc' },
    include: { sender: true }
  })
  if (senders.length === 0) return null

  let current = queue.currentSenderId ? senders.find((s) => s.senderId === queue.currentSenderId) : null

  if (!current) {
    current = senders[0]
    await prisma.emailCampaignQueue.update({ where: { campaignId: campaign.id }, data: { currentSenderId: current.senderId, currentSenderSentCount: 0 } })
    await log(campaign.id, 'Sender Rotation', `Rotation starting with ${current.sender.email}.`)
    return current
  }

  if (campaign.emailsPerSender > 0 && queue.currentSenderSentCount >= campaign.emailsPerSender) {
    const idx = senders.findIndex((s) => s.senderId === current.senderId)
    const next = senders[(idx + 1) % senders.length]
    await prisma.emailCampaignQueue.update({ where: { campaignId: campaign.id }, data: { currentSenderId: next.senderId, currentSenderSentCount: 0 } })
    await log(campaign.id, 'Sender Rotation', `${current.sender.email} reached its quota (${campaign.emailsPerSender}) — switching to ${next.sender.email}.`)
    return next
  }

  return current
}

async function tick() {
  const running = await prisma.emailCampaign.findMany({ where: { status: 'Running' } })
  for (const campaign of running) {
    try {
      await processCampaign(campaign)
    } catch (err) {
      console.error(`[campaign-engine] Error processing campaign ${campaign.id}:`, err)
    }
  }
}

async function recoverOnStartup() {
  const stuckQueues = await prisma.emailCampaignQueue.findMany({ where: { isProcessing: true } })
  for (const q of stuckQueues) {
    await prisma.emailCampaignQueue.update({ where: { campaignId: q.campaignId }, data: { isProcessing: false } })
    if (q.currentEmailId) {
      await prisma.emailCampaignContact.updateMany({ where: { id: q.currentEmailId, status: 'Sending' }, data: { status: 'Pending' } })
    }
    await log(q.campaignId, 'Campaign Resumed', 'Backend restarted — resuming automatically, no progress lost.')
  }
}

function startCampaignEngine() {
  if (started) return
  started = true
  recoverOnStartup()
    .then(() => console.log('[campaign-engine] Recovery check complete — resuming any in-progress campaigns.'))
    .catch((err) => console.error('[campaign-engine] Recovery failed:', err))
  console.log(`[campaign-engine] Started — checking for due sends every ${TICK_MS / 1000}s`)
  setInterval(() => { tick().catch((err) => console.error('[campaign-engine] tick error:', err)) }, TICK_MS)
}

module.exports = { startCampaignEngine, replacePlaceholders, refreshStatistics, log, sendFromSender, getTemplateForOrder }
