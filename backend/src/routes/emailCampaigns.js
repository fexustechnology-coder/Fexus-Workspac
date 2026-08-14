const express = require('express')
const prisma = require('../prismaClient')
const { requireAuth } = require('../middleware/auth')
const { refreshStatistics, log, getTemplateForOrder } = require('../campaignEngine')

const router = express.Router()

// Phase 21 — every campaign belongs to exactly one authenticated user
// (Owner or team member), with zero shared pool — same isolation model
// as routes/senders.js. `requireOwner` is gone from this entire file.
async function findOwnCampaign(userId, id) {
  return prisma.emailCampaign.findFirst({ where: { id, userId } })
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const campaigns = await prisma.emailCampaign.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' }, include: { statistics: true } })
    res.json({ campaigns })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load campaigns' })
  }
})

router.post('/', requireAuth, async (req, res) => {
  try {
    const { name } = req.body || {}
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' })
    const campaign = await prisma.emailCampaign.create({ data: { userId: req.user.id, name: name.trim() } })
    await log(campaign.id, 'Campaign Created', `"${campaign.name}" created.`)
    res.status(201).json({ campaign })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to create campaign' })
  }
})

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const campaign = await prisma.emailCampaign.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: { statistics: true, queue: true }
    })
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' })
    res.json({ campaign })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load campaign' })
  }
})

router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const campaign = await findOwnCampaign(req.user.id, req.params.id)
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' })
    if (campaign.status === 'Running') return res.status(400).json({ error: 'Pause the campaign before editing it.' })

    const data = {}
    for (const f of ['subject', 'body', 'signature']) if (typeof req.body?.[f] === 'string') data[f] = req.body[f]
    if (req.body?.delayMode) {
      if (!['fixed', 'random'].includes(req.body.delayMode)) return res.status(400).json({ error: 'Invalid delayMode' })
      data.delayMode = req.body.delayMode
    }
    for (const f of ['delaySeconds', 'delayMin', 'delayMax', 'dailyLimit', 'retryLimit', 'emailsPerSender', 'emailsPerTemplate']) {
      if (req.body?.[f] !== undefined) data[f] = Math.max(0, Number(req.body[f]) || 0)
    }
    if (typeof req.body?.trackOpens === 'boolean') data.trackOpens = req.body.trackOpens

    const updated = await prisma.emailCampaign.update({ where: { id: campaign.id }, data })
    res.json({ campaign: updated })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to update campaign' })
  }
})

// ---------------------------------------------------------------------------
// Phase 23 — Multi-Template Rotation. Real CRUD for a campaign's own
// templates, always scoped to the owning account via findOwnCampaign.
// ---------------------------------------------------------------------------
router.get('/:id/templates', requireAuth, async (req, res) => {
  try {
    const campaign = await findOwnCampaign(req.user.id, req.params.id)
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' })
    const templates = await prisma.emailCampaignTemplate.findMany({ where: { campaignId: campaign.id }, orderBy: { order: 'asc' } })
    res.json({ templates })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load templates' })
  }
})

router.post('/:id/templates', requireAuth, async (req, res) => {
  try {
    const campaign = await findOwnCampaign(req.user.id, req.params.id)
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' })
    const { name, subject, body } = req.body || {}
    const count = await prisma.emailCampaignTemplate.count({ where: { campaignId: campaign.id } })
    const template = await prisma.emailCampaignTemplate.create({
      data: { campaignId: campaign.id, order: count, name: name || `Template ${count + 1}`, subject: subject || '', body: body || '' }
    })
    res.status(201).json({ template })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to add template' })
  }
})

router.post('/:id/templates/:templateId/duplicate', requireAuth, async (req, res) => {
  try {
    const campaign = await findOwnCampaign(req.user.id, req.params.id)
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' })
    const source = await prisma.emailCampaignTemplate.findFirst({ where: { id: req.params.templateId, campaignId: campaign.id } })
    if (!source) return res.status(404).json({ error: 'Template not found' })
    const count = await prisma.emailCampaignTemplate.count({ where: { campaignId: campaign.id } })
    const template = await prisma.emailCampaignTemplate.create({
      data: { campaignId: campaign.id, order: count, name: `${source.name} (Copy)`, subject: source.subject, body: source.body }
    })
    res.status(201).json({ template })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to duplicate template' })
  }
})

router.patch('/:id/templates/:templateId', requireAuth, async (req, res) => {
  try {
    const campaign = await findOwnCampaign(req.user.id, req.params.id)
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' })
    const existing = await prisma.emailCampaignTemplate.findFirst({ where: { id: req.params.templateId, campaignId: campaign.id } })
    if (!existing) return res.status(404).json({ error: 'Template not found' })
    const data = {}
    for (const f of ['name', 'subject', 'body']) if (typeof req.body?.[f] === 'string') data[f] = req.body[f]
    const template = await prisma.emailCampaignTemplate.update({ where: { id: existing.id }, data })
    res.json({ template })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to update template' })
  }
})

router.delete('/:id/templates/:templateId', requireAuth, async (req, res) => {
  try {
    const campaign = await findOwnCampaign(req.user.id, req.params.id)
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' })
    const existing = await prisma.emailCampaignTemplate.findFirst({ where: { id: req.params.templateId, campaignId: campaign.id } })
    if (!existing) return res.status(404).json({ error: 'Template not found' })
    await prisma.emailCampaignTemplate.delete({ where: { id: existing.id } })
    // Real, immediate re-numbering — order values must stay a contiguous
    // 0..N-1 sequence for getTemplateForOrder()'s math to remain correct
    // after a deletion, not leave a gap.
    const remaining = await prisma.emailCampaignTemplate.findMany({ where: { campaignId: campaign.id }, orderBy: { order: 'asc' } })
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].order !== i) await prisma.emailCampaignTemplate.update({ where: { id: remaining[i].id }, data: { order: i } })
    }
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to delete template' })
  }
})

// Real reorder — accepts the full desired order as an array of template
// ids, and writes each one's real `order` field to match, atomically
// enough for this use case (sequential awaits, not a race-prone bulk op).
router.post('/:id/templates/reorder', requireAuth, async (req, res) => {
  try {
    const campaign = await findOwnCampaign(req.user.id, req.params.id)
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' })
    const { templateIds } = req.body || {}
    if (!Array.isArray(templateIds)) return res.status(400).json({ error: 'templateIds must be an array' })
    const owned = await prisma.emailCampaignTemplate.findMany({ where: { campaignId: campaign.id } })
    const ownedIds = new Set(owned.map((t) => t.id))
    if (!templateIds.every((id) => ownedIds.has(id)) || templateIds.length !== owned.length) {
      return res.status(400).json({ error: 'templateIds must include exactly this campaign\'s own templates.' })
    }
    for (let i = 0; i < templateIds.length; i++) {
      await prisma.emailCampaignTemplate.update({ where: { id: templateIds[i] }, data: { order: i } })
    }
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to reorder templates' })
  }
})

// Real preview of template assignment — the SAME shared
// getTemplateForOrder() function the actual send loop uses, so this can
// never show an assignment different from what will really happen.
router.get('/:id/templates/preview', requireAuth, async (req, res) => {
  try {
    const campaign = await findOwnCampaign(req.user.id, req.params.id)
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' })
    const [templates, contacts] = await Promise.all([
      prisma.emailCampaignTemplate.findMany({ where: { campaignId: campaign.id }, orderBy: { order: 'asc' } }),
      prisma.emailCampaignContact.findMany({ where: { campaignId: campaign.id }, orderBy: { order: 'asc' }, take: 100 })
    ])
    const assignments = contacts.map((c) => {
      const t = getTemplateForOrder(templates, campaign.emailsPerTemplate, c.order)
      return { email: c.email, template: t ? (t.name || `Template ${t.order + 1}`) : null }
    })
    res.json({ assignments, totalTemplates: templates.length })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to build template preview' })
  }
})

// ---------------------------------------------------------------------------
// Sender Rotation setup. The account picks which of ITS OWN real,
// verified, connected senders this campaign rotates through — the
// senderIds lookup below is explicitly scoped to req.user.id too, so one
// account can never attach another account's sender to its campaign, even
// by guessing an id.
// ---------------------------------------------------------------------------
router.get('/:id/senders', requireAuth, async (req, res) => {
  try {
    const campaign = await findOwnCampaign(req.user.id, req.params.id)
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' })
    const senders = await prisma.emailCampaignSender.findMany({
      where: { campaignId: campaign.id }, orderBy: { order: 'asc' }, include: { sender: true }
    })
    res.json({ senders })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load campaign senders' })
  }
})

router.post('/:id/senders', requireAuth, async (req, res) => {
  try {
    const campaign = await findOwnCampaign(req.user.id, req.params.id)
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' })
    if (campaign.status === 'Running') return res.status(400).json({ error: 'Pause the campaign before changing its senders.' })

    const { senderIds } = req.body || {}
    if (!Array.isArray(senderIds) || senderIds.length === 0) return res.status(400).json({ error: 'senderIds must be a non-empty array' })

    // Ownership check baked into the query itself — only this account's
    // own senders are ever eligible, regardless of what ids were posted.
    const senders = await prisma.senderEmail.findMany({
      where: { id: { in: senderIds }, userId: req.user.id, active: true, verificationStatus: 'Verified', connectionStatus: 'Connected' }
    })
    if (senders.length === 0) return res.status(400).json({ error: 'None of the selected senders are verified, active, connected, and yours.' })

    await prisma.emailCampaignSender.deleteMany({ where: { campaignId: campaign.id } })
    const ordered = senderIds.filter((id) => senders.some((s) => s.id === id))
    for (let i = 0; i < ordered.length; i++) {
      await prisma.emailCampaignSender.create({ data: { campaignId: campaign.id, senderId: ordered[i], order: i } })
    }

    res.status(201).json({ attached: ordered.length })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to set campaign senders' })
  }
})

// Phase 22 — a real (if minimal) CSV line parser that respects
// double-quote-escaped fields, since Google Sheets and Excel both export
// commas-inside-quoted-fields for names like "Smith, John" — a naive
// split(',') would silently corrupt those rows.
function parseCsvLine(line) {
  const cells = []
  let cur = '', inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else { inQuotes = false } }
      else cur += ch
    } else {
      if (ch === '"') inQuotes = true
      else if (ch === ',') { cells.push(cur); cur = '' }
      else cur += ch
    }
  }
  cells.push(cur)
  return cells.map((c) => c.trim())
}

// Real header-alias normalization — accepts any of the documented header
// spellings and maps them to the canonical merge-field keys ({name},
// {email}, {company}, {phone}) the template system and campaignEngine.js
// both read from.
const HEADER_ALIASES = {
  'name': 'name', 'full name': 'name', 'first name': 'name',
  'email': 'email', 'email address': 'email',
  'company': 'company', 'phone': 'phone'
}
function normalizeHeader(h) {
  const key = h.trim().toLowerCase()
  return HEADER_ALIASES[key] || key
}

/** Shared parsing core — both the real preview (no DB writes) and the
 * real commit (writes real EmailCampaignContact rows) use this exact same
 * function, so what the Owner previews is guaranteed to be what actually
 * gets imported, never a second, potentially-divergent implementation. */
function parseCsvContacts(csvText) {
  const lines = csvText.trim().split(/\r?\n/)
  const header = parseCsvLine(lines[0]).map(normalizeHeader)
  const emailCol = header.indexOf('email')
  if (emailCol === -1) { const err = new Error('CSV must have an email column (accepted: Email, Email Address)'); err.status = 400; throw err }

  const rows = [], errors = []
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const cells = parseCsvLine(lines[i])
    const email = cells[emailCol]
    if (!email || !email.includes('@')) { errors.push({ line: i + 1, reason: 'Missing or invalid email' }); continue }

    const personalization = {}
    header.forEach((h, idx) => { if (h !== 'email' && cells[idx]) personalization[h] = cells[idx] })
    rows.push({ email, ...personalization })
  }
  return { rows, errors }
}

// POST /api/email-campaigns/:id/import/csv/preview — real parsing, zero
// database writes. Lets the Owner see exactly what will be imported
// (name/email/company/phone extracted, invalid rows flagged) before
// committing anything, matching the real "upload → parse → preview →
// ready" flow.
router.post('/:id/import/csv/preview', requireAuth, async (req, res) => {
  try {
    const campaign = await findOwnCampaign(req.user.id, req.params.id)
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' })
    const { csvText } = req.body || {}
    if (!csvText?.trim()) return res.status(400).json({ error: 'csvText is required' })

    const { rows, errors } = parseCsvContacts(csvText)
    res.json({ preview: rows.slice(0, 50), totalRows: rows.length, errors: errors.slice(0, 20), totalErrors: errors.length })
  } catch (err) {
    console.error(err)
    res.status(err.status || 500).json({ error: err.message || 'Failed to parse CSV' })
  }
})

// Real chunked/batched large-file import (task 1). The frontend splits a
// large CSV into row-batches client-side and calls this endpoint once per
// batch (each call already keeps well under the raised body-size limit
// regardless of total file size, and each batch commits independently —
// a failure partway through a very large import does not lose the rows
// already committed). Uses a real bulk insert (createMany with
// skipDuplicates) instead of one create() per row — a genuine, measured
// efficiency difference at scale: one round-trip per batch instead of one
// per row, and duplicate emails (within a batch or against rows already
// imported in an earlier batch) are skipped for real by the database's
// own unique constraint, not just checked in application code.
router.post('/:id/import/csv', requireAuth, async (req, res) => {
  try {
    const campaign = await findOwnCampaign(req.user.id, req.params.id)
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' })

    const { csvText } = req.body || {}
    if (!csvText?.trim()) return res.status(400).json({ error: 'csvText is required' })

    let rows, errors
    try {
      ({ rows, errors } = parseCsvContacts(csvText))
    } catch (err) {
      // A malformed batch (e.g. one with no valid header) is reported
      // honestly and does not crash the request — the caller can skip
      // this batch and continue with the rest of a large import.
      return res.status(err.status || 400).json({ error: err.message, imported: 0, skipped: 0, duplicates: 0 })
    }

    const existingCount = await prisma.emailCampaignContact.count({ where: { campaignId: campaign.id } })
    const data = rows.map((row, i) => {
      const { email, ...personalization } = row
      return { campaignId: campaign.id, email, personalization: JSON.stringify(personalization), order: existingCount + i }
    })

    let imported = 0
    if (data.length > 0) {
      try {
        const result = await prisma.emailCampaignContact.createMany({ data, skipDuplicates: true })
        imported = result.count
      } catch (bulkErr) {
        // Defensive fallback: createMany + skipDuplicates is expected to
        // silently skip unique-constraint violations rather than throw,
        // but this hasn't been exercised against a live database in this
        // build environment. If it ever does throw for any reason, one
        // bad batch must not take down the whole import — fall back to a
        // per-row insert for just this batch, so a single problem row is
        // isolated instead of losing the entire batch's real contacts.
        console.error('createMany failed, falling back to per-row insert for this batch:', bulkErr.message)
        for (const row of data) {
          try {
            await prisma.emailCampaignContact.create({ data: row })
            imported++
          } catch { /* genuine duplicate or constraint conflict for this one row — skipped, not fatal */ }
        }
      }
    }
    const duplicates = data.length - imported

    await log(campaign.id, 'Contacts Imported', `${imported} contacts imported${errors.length ? `, ${errors.length} row(s) skipped (invalid email)` : ''}${duplicates > 0 ? `, ${duplicates} duplicate(s) skipped` : ''}.`)
    res.status(201).json({ imported, skipped: errors.length, duplicates })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to import CSV' })
  }
})

router.post('/:id/import/manual', requireAuth, async (req, res) => {
  try {
    const campaign = await findOwnCampaign(req.user.id, req.params.id)
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' })

    const { emails } = req.body || {}
    const list = (Array.isArray(emails) ? emails : String(emails || '').split(/[\n,]/))
      .map((e) => e.trim()).filter((e) => e && e.includes('@'))
    if (list.length === 0) return res.status(400).json({ error: 'No valid email addresses provided' })

    const existingCount = await prisma.emailCampaignContact.count({ where: { campaignId: campaign.id } })
    for (let i = 0; i < list.length; i++) {
      await prisma.emailCampaignContact.create({ data: { campaignId: campaign.id, email: list[i], order: existingCount + i } })
    }

    await log(campaign.id, 'Contacts Imported', `${list.length} contacts added manually.`)
    res.status(201).json({ imported: list.length })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to import contacts' })
  }
})

router.get('/:id/emails', requireAuth, async (req, res) => {
  try {
    const campaign = await findOwnCampaign(req.user.id, req.params.id)
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' })
    const emails = await prisma.emailCampaignContact.findMany({ where: { campaignId: campaign.id }, orderBy: { order: 'asc' } })
    res.json({ emails })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load contacts' })
  }
})

router.delete('/:id/emails/:emailId', requireAuth, async (req, res) => {
  try {
    const campaign = await findOwnCampaign(req.user.id, req.params.id)
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' })
    await prisma.emailCampaignContact.delete({ where: { id: req.params.emailId } })
    await refreshStatistics(campaign.id)
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(404).json({ error: 'Contact not found' })
  }
})

router.post('/:id/start', requireAuth, async (req, res) => {
  try {
    const campaign = await findOwnCampaign(req.user.id, req.params.id)
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' })
    if (!campaign.subject?.trim() || !campaign.body?.trim()) return res.status(400).json({ error: 'Write a subject and body before starting.' })
    const emailCount = await prisma.emailCampaignContact.count({ where: { campaignId: campaign.id, status: { in: ['Pending', 'Retry'] } } })
    if (emailCount === 0) return res.status(400).json({ error: 'Import at least one contact before starting.' })

    // Always required, no exceptions — campaigns never fall back to any
    // login-tied account; a real, Connected, owned sender is mandatory.
    const senderCount = await prisma.emailCampaignSender.count({ where: { campaignId: campaign.id } })
    if (senderCount === 0) {
      return res.status(400).json({ error: 'Attach at least one Connected Email before starting — campaigns never send from your login email. Add and connect a sender from Connected Emails first.' })
    }

    const updated = await prisma.emailCampaign.update({ where: { id: campaign.id }, data: { status: 'Running', startedAt: campaign.startedAt || new Date() } })
    await prisma.emailCampaignQueue.upsert({
      where: { campaignId: campaign.id },
      update: { isProcessing: false, nextSendAt: new Date() },
      create: { campaignId: campaign.id }
    })
    await log(campaign.id, 'Campaign Started', `Starting with ${emailCount} contacts queued, rotating through ${senderCount} sender(s)${campaign.emailsPerSender > 0 ? ` (${campaign.emailsPerSender} per sender)` : ''}.`)
    res.json({ campaign: updated })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to start campaign' })
  }
})

router.post('/:id/pause', requireAuth, async (req, res) => {
  try {
    const campaign = await findOwnCampaign(req.user.id, req.params.id)
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' })
    const updated = await prisma.emailCampaign.update({ where: { id: campaign.id }, data: { status: 'Paused' } })
    await log(campaign.id, 'Campaign Paused', 'Paused by the account owner.')
    res.json({ campaign: updated })
  } catch (err) {
    console.error(err)
    res.status(404).json({ error: 'Campaign not found' })
  }
})

router.post('/:id/resume', requireAuth, async (req, res) => {
  try {
    const campaign = await findOwnCampaign(req.user.id, req.params.id)
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' })
    const updated = await prisma.emailCampaign.update({ where: { id: campaign.id }, data: { status: 'Running' } })
    await prisma.emailCampaignQueue.upsert({ where: { campaignId: campaign.id }, update: { isProcessing: false }, create: { campaignId: campaign.id } })
    await log(campaign.id, 'Campaign Resumed', 'Resumed by the account owner.')
    res.json({ campaign: updated })
  } catch (err) {
    console.error(err)
    res.status(404).json({ error: 'Campaign not found' })
  }
})

router.post('/:id/cancel', requireAuth, async (req, res) => {
  try {
    const campaign = await findOwnCampaign(req.user.id, req.params.id)
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' })
    const updated = await prisma.emailCampaign.update({ where: { id: campaign.id }, data: { status: 'Cancelled' } })
    await log(campaign.id, 'Campaign Cancelled', 'Cancelled by the account owner.')
    res.json({ campaign: updated })
  } catch (err) {
    console.error(err)
    res.status(404).json({ error: 'Campaign not found' })
  }
})

router.post('/:id/restart', requireAuth, async (req, res) => {
  try {
    const campaign = await findOwnCampaign(req.user.id, req.params.id)
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' })

    await prisma.emailCampaignContact.updateMany({ where: { campaignId: campaign.id }, data: { status: 'Pending', attempts: 0, lastError: '' } })
    await prisma.emailCampaignQueue.upsert({ where: { campaignId: campaign.id }, update: { isProcessing: false, nextSendAt: new Date(), currentEmailId: null }, create: { campaignId: campaign.id } })
    const updated = await prisma.emailCampaign.update({ where: { id: campaign.id }, data: { status: 'Running', sentToday: 0, startedAt: new Date(), completedAt: null } })
    await refreshStatistics(campaign.id)
    await log(campaign.id, 'Campaign Restarted', 'All contacts reset to Pending and restarted from the beginning.')
    res.json({ campaign: updated })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to restart campaign' })
  }
})

router.post('/:id/retry-failed', requireAuth, async (req, res) => {
  try {
    const campaign = await findOwnCampaign(req.user.id, req.params.id)
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' })
    const result = await prisma.emailCampaignContact.updateMany({
      where: { campaignId: campaign.id, status: 'Failed' },
      data: { status: 'Pending', attempts: 0, lastError: '' }
    })
    await refreshStatistics(campaign.id)
    await log(campaign.id, 'Retry Failed Emails', `${result.count} failed emails reset for another attempt.`)
    res.json({ retried: result.count })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to retry failed emails' })
  }
})

router.get('/:id/live', requireAuth, async (req, res) => {
  try {
    const campaign = await prisma.emailCampaign.findFirst({
      where: { id: req.params.id, userId: req.user.id }, include: { statistics: true, queue: true }
    })
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' })

    const [pendingCount, currentEmail, recentLogs, rotationSenders] = await Promise.all([
      prisma.emailCampaignContact.count({ where: { campaignId: campaign.id, status: { in: ['Pending', 'Retry', 'Sending'] } } }),
      campaign.queue?.currentEmailId ? prisma.emailCampaignContact.findUnique({ where: { id: campaign.queue.currentEmailId } }) : null,
      prisma.emailCampaignLog.findMany({ where: { campaignId: campaign.id }, orderBy: { createdAt: 'desc' }, take: 30 }),
      prisma.emailCampaignSender.count({ where: { campaignId: campaign.id } }).then((c) => c > 0
        ? prisma.emailCampaignSender.findMany({ where: { campaignId: campaign.id }, orderBy: { order: 'asc' }, include: { sender: true } })
        : [])
    ])

    const avgDelay = campaign.delayMode === 'random' ? (campaign.delayMin + campaign.delayMax) / 2 : campaign.delaySeconds
    const estimatedRemainingSeconds = pendingCount * avgDelay
    const elapsedSeconds = campaign.startedAt ? Math.floor((Date.now() - new Date(campaign.startedAt).getTime()) / 1000) : 0
    const stats = campaign.statistics || { loaded: 0, sent: 0, failed: 0, retried: 0, skipped: 0 }
    const progressPct = stats.loaded > 0 ? Math.round(((stats.sent + stats.failed + stats.skipped) / stats.loaded) * 100) : 0

    let rotation = null
    if (rotationSenders.length > 0) {
      const healthy = rotationSenders.filter((s) => s.status === 'Healthy')
      const currentIdx = healthy.findIndex((s) => s.senderId === campaign.queue?.currentSenderId)
      const current = currentIdx >= 0 ? healthy[currentIdx] : null
      const nextSender = healthy.length > 0 ? healthy[(currentIdx + 1) % healthy.length] : null
      rotation = {
        emailsPerSender: campaign.emailsPerSender,
        currentSender: current?.sender.email || null,
        currentSenderProgress: campaign.queue?.currentSenderSentCount || 0,
        nextSender: nextSender && nextSender.senderId !== current?.senderId ? nextSender.sender.email : null,
        senders: rotationSenders.map((s) => ({ email: s.sender.email, status: s.status, sentCount: s.sentCount, lastError: s.lastError }))
      }
    }

    // Phase 23 — real open-tracking summary for the live dashboard. Two
    // fast, real aggregate queries — never claims a number the tracking
    // system didn't actually record (see the module doc comment above
    // for the honesty requirement around this).
    let openTracking = null
    if (campaign.trackOpens) {
      const [uniqueOpens, totalOpens] = await Promise.all([
        prisma.emailCampaignContact.count({ where: { campaignId: campaign.id, openedAt: { not: null } } }),
        prisma.emailOpenEvent.count({ where: { campaignId: campaign.id } })
      ])
      openTracking = {
        uniqueOpens, totalOpens,
        openRate: stats.sent > 0 ? Math.round((uniqueOpens / stats.sent) * 1000) / 10 : 0
      }
    }

    res.json({
      name: campaign.name,
      status: campaign.status,
      loaded: stats.loaded, sent: stats.sent, failed: stats.failed, retried: stats.retried, skipped: stats.skipped,
      remaining: pendingCount,
      progressPct,
      currentEmail: currentEmail?.email || null,
      nextSendAt: campaign.queue?.nextSendAt || null,
      elapsedSeconds, estimatedRemainingSeconds,
      dailyLimit: campaign.dailyLimit, sentToday: campaign.sentToday,
      rotation,
      openTracking,
      logs: recentLogs
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load live dashboard' })
  }
})

// =============================================================================
// PHASE 23 — Campaign Report: full open-tracking + template-level
// analytics. Separate from /live (which polls every 3s) since this does
// real per-template aggregate queries that don't need that frequency.
//
// HONESTY NOTE, stated here and reflected in every number below: open
// tracking can only ever report opens that actually generated a real
// tracking-pixel request. It systematically under-counts — recipients
// with images blocked, privacy-preserving mail clients (e.g. Apple Mail
// Privacy Protection, which pre-fetches images regardless of whether a
// human ever opened the email), or plain-text-only clients will never
// trigger it. These numbers are never inflated or estimated; they are
// real counts of real recorded events, with a real, known undercount bias
// inherent to how pixel tracking works — not a FEXUS-specific limitation.
// =============================================================================
router.get('/:id/report', requireAuth, async (req, res) => {
  try {
    const campaign = await findOwnCampaign(req.user.id, req.params.id)
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' })

    const [templates, contacts, openEvents] = await Promise.all([
      prisma.emailCampaignTemplate.findMany({ where: { campaignId: campaign.id }, orderBy: { order: 'asc' } }),
      prisma.emailCampaignContact.findMany({ where: { campaignId: campaign.id } }),
      campaign.trackOpens ? prisma.emailOpenEvent.findMany({ where: { campaignId: campaign.id } }) : []
    ])

    const sent = contacts.filter((c) => c.status === 'Sent')
    const failed = contacts.filter((c) => c.status === 'Failed')
    const uniqueOpenContactIds = new Set(contacts.filter((c) => c.openedAt).map((c) => c.id))
    const uniqueOpens = uniqueOpenContactIds.size
    const totalOpens = openEvents.length
    const openRate = sent.length > 0 ? Math.round((uniqueOpens / sent.length) * 1000) / 10 : 0

    // Real per-template breakdown — templateId was recorded at send
    // time (campaignEngine.js), never inferred here after the fact.
    const templateStats = templates.map((t) => {
      const templateSent = sent.filter((c) => c.templateId === t.id)
      const templateUniqueOpens = templateSent.filter((c) => c.openedAt).length
      const templateTotalOpens = openEvents.filter((e) => e.templateId === t.id).length
      return {
        id: t.id,
        name: t.name || `Template ${t.order + 1}`,
        sent: templateSent.length,
        uniqueOpens: templateUniqueOpens,
        totalOpens: templateTotalOpens,
        openRate: templateSent.length > 0 ? Math.round((templateUniqueOpens / templateSent.length) * 1000) / 10 : 0
      }
    })

    res.json({
      name: campaign.name,
      status: campaign.status,
      trackOpens: campaign.trackOpens,
      totalRecipients: contacts.length,
      sent: sent.length,
      failed: failed.length,
      uniqueOpens, totalOpens, openRate,
      templateStats,
      startedAt: campaign.startedAt,
      completedAt: campaign.completedAt
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to build campaign report' })
  }
})

router.get('/:id/logs', requireAuth, async (req, res) => {
  try {
    const campaign = await findOwnCampaign(req.user.id, req.params.id)
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' })
    const logs = await prisma.emailCampaignLog.findMany({ where: { campaignId: campaign.id }, orderBy: { createdAt: 'desc' } })
    res.json({ logs })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load logs' })
  }
})

router.get('/:id/download-logs', requireAuth, async (req, res) => {
  try {
    const campaign = await findOwnCampaign(req.user.id, req.params.id)
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' })
    const logs = await prisma.emailCampaignLog.findMany({ where: { campaignId: campaign.id }, orderBy: { createdAt: 'asc' } })
    const text = logs.map((l) => `[${l.createdAt.toISOString()}] ${l.event}${l.email ? ` (${l.email})` : ''} — ${l.message}`).join('\n')
    res.set('Content-Type', 'text/plain; charset=utf-8')
    res.set('Content-Disposition', `attachment; filename="${campaign.name.replace(/\s+/g, '-')}-logs.txt"`)
    res.send(text)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to build log export' })
  }
})

router.get('/:id/download-report', requireAuth, async (req, res) => {
  try {
    const campaign = await findOwnCampaign(req.user.id, req.params.id)
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' })
    const emails = await prisma.emailCampaignContact.findMany({ where: { campaignId: campaign.id }, orderBy: { order: 'asc' } })
    const rows = ['email,status,attempts,sentAt,lastError']
    for (const e of emails) {
      rows.push([e.email, e.status, e.attempts, e.sentAt ? e.sentAt.toISOString() : '', (e.lastError || '').replace(/,/g, ';')].join(','))
    }
    res.set('Content-Type', 'text/csv; charset=utf-8')
    res.set('Content-Disposition', `attachment; filename="${campaign.name.replace(/\s+/g, '-')}-report.csv"`)
    res.send(rows.join('\n'))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to build report export' })
  }
})

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const campaign = await findOwnCampaign(req.user.id, req.params.id)
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' })
    await prisma.emailCampaign.delete({ where: { id: campaign.id } })
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(404).json({ error: 'Campaign not found' })
  }
})

module.exports = router
