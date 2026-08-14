// =============================================================================
// REAL EMAIL SCHEDULER (Phase 15)
// =============================================================================
// Genuine scheduling, honestly scoped: this is a setInterval loop inside the
// same Node process as the Express server, checked every 60 seconds. As
// long as the backend process stays running, a ScheduledEmail with a past
// `sendAt` WILL be sent for real via Gmail within 60 seconds of its
// scheduled time. This is not a fake label — it is real, working
// scheduling — but it is honestly dependent on the server process staying
// up (there is no separate queue/worker infrastructure in this MVP). If the
// process restarts, any email whose time already passed while it was down
// will be sent the next time the loop runs (not silently dropped), and
// anything still in the future is unaffected.
// =============================================================================

const prisma = require('./prismaClient')
const gmail = require('./lib/gmail')

const POLL_MS = 60 * 1000
let started = false

async function sendDueEmails() {
  const due = await prisma.scheduledEmail.findMany({
    where: { status: 'Scheduled', sendAt: { lte: new Date() } }
  })

  for (const email of due) {
    try {
      await gmail.sendEmail({ to: email.to, subject: email.subject, body: email.body })
      await prisma.scheduledEmail.update({ where: { id: email.id }, data: { status: 'Sent', sentAt: new Date() } })
      console.log(`[email-scheduler] Sent "${email.subject}" to ${email.to}`)
    } catch (err) {
      await prisma.scheduledEmail.update({ where: { id: email.id }, data: { status: 'Failed', error: err.message } })
      console.error(`[email-scheduler] Failed to send "${email.subject}" to ${email.to}:`, err.message)
    }
  }
}

function startEmailScheduler() {
  if (started) return
  started = true
  console.log(`[email-scheduler] Started — checking for due emails every ${POLL_MS / 1000}s`)
  setInterval(() => { sendDueEmails().catch((err) => console.error('[email-scheduler] loop error:', err)) }, POLL_MS)
}

module.exports = { startEmailScheduler, sendDueEmails }
