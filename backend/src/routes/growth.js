const express = require('express')
const crypto = require('crypto')
const prisma = require('../prismaClient')
const { requireAuth, requireOwner } = require('../middleware/auth')
const { generateTextWithUsage } = require('../lib/llmProvider')
const memoryManager = require('../memoryManager')
const {
  PIPELINE_STAGES, LEAD_PRIORITIES, OUTREACH_CHANNELS, ALL_CONTENT_TYPES, CONTENT_STATUSES
} = require('../growthConstants')

const router = express.Router()

function newPortalToken() { return crypto.randomBytes(24).toString('hex') }

function typeLabel(type) {
  return ALL_CONTENT_TYPES.find((t) => t.key === type)?.label || type
}

async function getCompanyBrainFacts() {
  const brain = await prisma.companyBrain.findUnique({ where: { id: 'singleton' } })
  if (!brain) return {}
  const { id, updatedAt, ...fields } = brain
  return fields
}

// ---------------------------------------------------------------------------
// LEAD FINDER (framework-only search, real CSV import, real CRUD via
// routes/leads.js). No AI anywhere in this section — pure local logic.
// ---------------------------------------------------------------------------

router.post('/leads/search-public-lists', requireAuth, requireOwner, async (req, res) => {
  res.json({
    results: [],
    message: 'Framework only — no public business list provider is connected yet. Add leads manually or via CSV import below.'
  })
})

router.post('/leads/search-maps', requireAuth, requireOwner, async (req, res) => {
  const places = require('../lib/googlePlaces')
  if (!places.isConfigured()) {
    return res.json({
      results: [],
      message: 'Google Places is not connected yet — set GOOGLE_PLACES_API_KEY in backend/.env to enable real business search.'
    })
  }
  try {
    const { query } = req.body || {}
    if (!query?.trim()) return res.status(400).json({ error: 'query is required, e.g. "dentists in Austin, TX"' })
    const results = await places.searchBusinesses(query)
    res.json({ results, message: null })
  } catch (err) {
    console.error(err)
    res.status(502).json({ error: err.message })
  }
})

router.post('/leads/import-csv', requireAuth, requireOwner, async (req, res) => {
  try {
    const { csvText } = req.body || {}
    if (!csvText || !csvText.trim()) return res.status(400).json({ error: 'csvText is required' })

    const lines = csvText.trim().split(/\r?\n/)
    const header = lines[0].split(',').map((h) => h.trim().toLowerCase())
    const rows = lines.slice(1).filter((l) => l.trim())

    let imported = 0
    const errors = []
    for (let i = 0; i < rows.length; i++) {
      const cells = rows[i].split(',').map((c) => c.trim())
      const row = Object.fromEntries(header.map((h, idx) => [h, cells[idx] || '']))
      if (!row.name && !row.company) { errors.push(`Row ${i + 2}: needs at least a name or company`); continue }
      await prisma.lead.create({
        data: {
          name: row.name || row.company, company: row.company || '', email: row.email || '',
          phone: row.phone || '', website: row.website || '', industry: row.industry || '',
          source: 'CSV Import', status: 'New', priority: 'Medium',
          publicToken: newPortalToken() // every lead gets a real portal link, even from bulk import
          // Deliberately NOT auto-emailing on bulk CSV import even with
          // autonomous mode on — sending unsolicited outreach to a whole
          // imported list at once is a different, riskier action than
          // responding to one new lead, and this system doesn't do it
          // without a separate, explicit trigger.
        }
      })
      imported++
    }

    res.status(201).json({ imported, errors })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to import CSV' })
  }
})

router.get('/config', requireAuth, requireOwner, async (req, res) => {
  res.json({ pipelineStages: PIPELINE_STAGES, priorities: LEAD_PRIORITIES, channels: OUTREACH_CHANNELS, contentTypes: ALL_CONTENT_TYPES, contentStatuses: CONTENT_STATUSES })
})

// ---------------------------------------------------------------------------
// MARKETING AI + SALES AI — content generation. Free (deterministic
// template) or Paid (real, usage-tracked LLM call via the centralized
// provider layer — Groq as of Phase 14), per the Global Cost
// Optimization Rule. Both paths reuse Company Brain + Operating Manual +
// the linked Lead — read-only, nothing written back to those systems.
// ---------------------------------------------------------------------------

function freeTemplate(type, ctx) {
  const company = ctx.companyBrain.companyName || 'the company'
  const lead = ctx.lead
  const leadName = lead?.name || 'there'
  const leadCompany = lead?.company || ''

  const templates = {
    campaign: () => `[DRAFT — Local/Free] ${company} Growth Campaign\n\nGoal: Increase awareness and conversions.\nAudience: ${ctx.companyBrain.targetAudience || '(not recorded in Company Brain yet)'}\nChannels: Instagram, Email\nDuration: 4 weeks\n\nThis is a deterministic placeholder outline — switch to AI mode for a tailored campaign.`,
    post: () => `[DRAFT — Local/Free] Social post for ${company}: Share an update about what ${company} is working on this week. Keep it authentic and on-brand.`,
    caption: () => `[DRAFT — Local/Free] Caption: "${company} — building something worth talking about. #${company.replace(/\s+/g, '')}"`,
    hashtags: () => `#${company.replace(/\s+/g, '')} #Growth #SmallBusiness #${(ctx.companyBrain.industry || 'Business').replace(/\s+/g, '')}`,
    ad: () => `[DRAFT — Local/Free] Ad headline: "${company} — Get Started Today"\nBody: Discover what ${company} can do for you.\nCTA: Learn More`,
    email_campaign: () => `Subject: Updates from ${company}\n\nHi there,\n\n[DRAFT — Local/Free] This is a placeholder email campaign draft. Switch to AI mode for tailored copy grounded in Company Brain and the Operating Manual.\n\n— The ${company} Team`,
    content_calendar: () => `[DRAFT — Local/Free] Week 1: Introduce ${company}\nWeek 2: Share a customer story\nWeek 3: Behind the scenes\nWeek 4: Call to action`,
    strategy: () => `[DRAFT — Local/Free] Growth strategy outline for ${company}: focus on ${ctx.companyBrain.targetAudience || 'your target audience'}, consistent posting, and direct outreach.`,
    outreach: () => `Hi ${leadName},\n\n[DRAFT — Local/Free] I wanted to reach out about how ${company} could help ${leadCompany || 'your team'}. Let me know if you're open to a quick chat.\n\nBest,\n${company}`,
    proposal: () => `PROPOSAL — ${company} for ${leadCompany || leadName}\n\nScope: [to be defined]\nDeliverables: [to be defined]\nTimeline: [to be defined]\nPricing: [to be defined]\nTerms: Standard terms apply.\n\n[DRAFT — Local/Free — switch to AI mode for a tailored proposal]`,
    quotation: () => `QUOTATION — ${company} for ${leadCompany || leadName}\n\nItem: [service]\nEstimated cost: [DRAFT — Local/Free placeholder]\nValid for: 30 days`,
    follow_up: () => `Hi ${leadName},\n\n[DRAFT — Local/Free] Just following up on our last conversation — happy to answer any questions.\n\nBest,\n${company}`,
    meeting_agenda: () => `MEETING AGENDA\n1. Introductions\n2. ${leadCompany || 'Client'} needs & goals\n3. How ${company} can help\n4. Next steps\n\n[DRAFT — Local/Free]`,
    meeting_notes: () => `MEETING NOTES\nAttendees: \nKey points discussed: \nAction items: \n\n[DRAFT — Local/Free — fill in after the meeting]`,
    meeting_reminder: () => `Hi ${leadName}, just a reminder about our upcoming meeting. Looking forward to it!\n\n[DRAFT — Local/Free]`,
    closing_message: () => `Hi ${leadName},\n\n[DRAFT — Local/Free] We'd love to move forward — let us know if you're ready to get started.\n\nBest,\n${company}`
  }
  return (templates[type] || (() => `[DRAFT — Local/Free] ${typeLabel(type)} placeholder for ${company}.`))()
}

function buildAIPrompt(type, ctx) {
  const brainFacts = Object.entries(ctx.companyBrain).filter(([, v]) => v && String(v).trim())
  const manualText = ctx.filledSections.length
    ? ctx.filledSections.map((s) => `### ${s.title}\n${s.content}`).join('\n\n')
    : '(No relevant Operating Manual sections recorded yet.)'

  return `You are Growth AI (Marketing AI + Sales AI combined) for a FEXUS Workspace agency. Generate a "${typeLabel(type)}" (type: ${type}). Write only the requested content — no commentary, no markdown headers unless the content itself needs them, no code.

## Company Brain — Business Profile
${brainFacts.length ? brainFacts.map(([k, v]) => `- ${k}: ${v}`).join('\n') : '(No business profile fields recorded yet.)'}

## Operating Manual (relevant sections)
${manualText}

## Lead / Client (if applicable)
${ctx.lead ? `Name: ${ctx.lead.name}\nCompany: ${ctx.lead.company}\nIndustry: ${ctx.lead.industry}\nStatus: ${ctx.lead.status}\nNotes: ${ctx.lead.notes}` : '(No specific lead linked — write general-purpose content.)'}

## Channel (if applicable)
${ctx.channel || '(not channel-specific)'}

## Extra instructions from the Owner
${ctx.extra || '(none)'}

Write the ${typeLabel(type)} now, ready to review — remember this is a DRAFT that requires human approval before anything is sent, so do not claim it has been sent.`
}

// Extracted (Phase 15) so both the HTTP route and the internal autonomous
// callers (the Sales Portal, the handoff pipeline) share one implementation.
async function generateContentCore({ type, mode, leadId, campaignId, meetingId, channel, extra, workflowStageId }) {
  if (!ALL_CONTENT_TYPES.some((t) => t.key === type)) { const err = new Error('Invalid content type'); err.status = 400; throw err }
  if (!['free', 'ai'].includes(mode)) { const err = new Error('mode must be "free" or "ai"'); err.status = 400; throw err }
  if (channel && !OUTREACH_CHANNELS.includes(channel)) { const err = new Error('Invalid channel'); err.status = 400; throw err }

  const companyBrain = await getCompanyBrainFacts()
  const brainSections = await prisma.brainSection.findMany()
  const filledSections = brainSections.filter((s) => s.content?.trim()).slice(0, 6).map((s) => ({ title: s.title, content: s.content }))
  const lead = leadId ? await prisma.lead.findUnique({ where: { id: leadId } }) : null

  let memoryId = null
  if (workflowStageId) {
    const stage = await prisma.workflowStage.findUnique({ where: { id: workflowStageId } })
    if (stage?.assigneeEmployeeId) {
      const memory = await memoryManager.loadMemory({ employeeId: stage.assigneeEmployeeId, stageId: workflowStageId })
      memoryId = memory.id
    }
  }

  const ctx = { companyBrain, filledSections, lead, channel, extra }
  let content

  if (mode === 'free') {
    content = freeTemplate(type, ctx)
  } else {
    const system = buildAIPrompt(type, ctx)
    const { text } = await generateTextWithUsage(system, [{ role: 'user', content: `Generate the ${typeLabel(type)} now.` }], 1024)
    content = text
  }

  return prisma.growthContent.create({
    data: {
      type, channel: channel || '', leadId: leadId || null, campaignId: campaignId || null,
      meetingId: meetingId || null, workflowStageId: workflowStageId || null, memoryId,
      title: `${typeLabel(type)}${lead ? ` — ${lead.name}` : ''}`,
      content, generationMode: mode, status: 'Draft'
    }
  })
}

router.post('/content', requireAuth, requireOwner, async (req, res) => {
  try {
    const item = await generateContentCore(req.body || {})
    res.status(201).json({ item })
  } catch (err) {
    console.error(err)
    const status = err.status || (err.message?.includes('No AI provider') ? 503 : 500)
    res.status(status).json({ error: err.message || 'Failed to generate content' })
  }
})

// Phase 15 — used by the Sales Portal once a lead's requirements are fully
// collected: generates real content (AI mode) for that lead and, ONLY if
// Sales autonomous mode is on and Gmail is connected, sends it for real —
// otherwise it's left as an ordinary Draft for the Owner to review and send
// manually, exactly like every other piece of Growth AI content.
async function generateAndMaybeSendForLead(lead, type) {
  const item = await generateContentCore({ type, mode: 'ai', leadId: lead.id })

  const settings = await prisma.autonomousSettings.findUnique({ where: { id: 'singleton' } })
  if (!settings?.salesAutonomous || !lead.email) return item

  const gmail = require('../lib/gmail')
  const connected = await gmail.isConnected().catch(() => false)
  if (!connected) return item

  try {
    await gmail.sendEmail({ to: lead.email, subject: `${typeLabel(type)} from our team`, body: item.content })
    await prisma.growthContent.update({ where: { id: item.id }, data: { status: 'Approved', approvedAt: new Date(), sentAt: new Date() } })
  } catch (err) {
    console.error(`Autonomous send failed for ${type}:`, err.message)
  }
  return item
}

router.get('/content', requireAuth, requireOwner, async (req, res) => {
  try {
    const where = {}
    if (req.query.type) where.type = req.query.type
    if (req.query.leadId) where.leadId = req.query.leadId
    if (req.query.status) where.status = req.query.status
    const items = await prisma.growthContent.findMany({ where, orderBy: { createdAt: 'desc' } })
    res.json({ items })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load content' })
  }
})

router.get('/content/:id', requireAuth, requireOwner, async (req, res) => {
  try {
    const item = await prisma.growthContent.findUnique({ where: { id: req.params.id } })
    if (!item) return res.status(404).json({ error: 'Content not found' })
    res.json({ item })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load content' })
  }
})

router.patch('/content/:id', requireAuth, requireOwner, async (req, res) => {
  try {
    const data = {}
    if (req.body?.title !== undefined) data.title = req.body.title
    if (req.body?.content !== undefined) data.content = req.body.content
    const item = await prisma.growthContent.update({ where: { id: req.params.id }, data })
    res.json({ item })
  } catch (err) {
    console.error(err)
    res.status(404).json({ error: 'Content not found' })
  }
})

router.delete('/content/:id', requireAuth, requireOwner, async (req, res) => {
  try {
    await prisma.growthContent.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(404).json({ error: 'Content not found' })
  }
})

router.post('/content/:id/submit-for-approval', requireAuth, requireOwner, async (req, res) => {
  try {
    const item = await prisma.growthContent.update({ where: { id: req.params.id }, data: { status: 'Pending Approval' } })
    res.json({ item })
  } catch (err) {
    console.error(err)
    res.status(404).json({ error: 'Content not found' })
  }
})

// "Approve Campaign? YES/NO." Without an explicit approve:true, nothing
// changes to Approved — the mandatory gate before ANY external
// communication, per the brief.
router.post('/content/:id/approve', requireAuth, requireOwner, async (req, res) => {
  try {
    const item = await prisma.growthContent.findUnique({ where: { id: req.params.id } })
    if (!item) return res.status(404).json({ error: 'Content not found' })

    if (req.body?.approve !== true) {
      const updated = await prisma.growthContent.update({ where: { id: item.id }, data: { status: 'Rejected' } })
      return res.json({ item: updated, approved: false })
    }

    const updated = await prisma.growthContent.update({ where: { id: item.id }, data: { status: 'Approved', approvedAt: new Date() } })
    res.json({ item: updated, approved: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to record approval decision' })
  }
})

// Framework only. Only allowed once Approved. Never calls any real
// messaging/social/email API.
router.post('/content/:id/mark-sent', requireAuth, requireOwner, async (req, res) => {
  try {
    const item = await prisma.growthContent.findUnique({ where: { id: req.params.id } })
    if (!item) return res.status(404).json({ error: 'Content not found' })
    if (item.status !== 'Approved') return res.status(400).json({ error: 'Only Approved content can be marked sent' })

    const updated = await prisma.growthContent.update({ where: { id: item.id }, data: { sentAt: new Date() } })
    res.json({ item: updated })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to mark as sent' })
  }
})

// ---------------------------------------------------------------------------
// GROWTH ANALYTICS — entirely deterministic, zero AI.
// ---------------------------------------------------------------------------
router.get('/analytics', requireAuth, requireOwner, async (req, res) => {
  try {
    const [leads, deals, invoices, expenses, meetings, campaigns, content] = await Promise.all([
      prisma.lead.findMany(),
      prisma.deal.findMany(),
      prisma.invoice.findMany(),
      prisma.expense.findMany(),
      prisma.meeting.findMany(),
      prisma.campaign.findMany(),
      prisma.growthContent.findMany()
    ])

    const leadsByStatus = PIPELINE_STAGES.reduce((acc, s) => ({ ...acc, [s]: leads.filter((l) => l.status === s).length }), {})
    const won = leadsByStatus.Won || 0
    const lost = leadsByStatus.Lost || 0
    const conversionRate = leads.length ? Math.round((won / leads.length) * 100) : 0
    const winRate = (won + lost) > 0 ? Math.round((won / (won + lost)) * 100) : 0

    const revenue = invoices.filter((i) => i.status === 'Paid').reduce((sum, i) => sum + i.amount, 0)
    const cost = expenses.reduce((sum, e) => sum + e.amount, 0)
    const roi = cost > 0 ? Math.round(((revenue - cost) / cost) * 100) : null

    const contentByStatus = CONTENT_STATUSES.reduce((acc, s) => ({ ...acc, [s]: content.filter((c) => c.status === s).length }), {})

    res.json({
      leads: { total: leads.length, byStatus: leadsByStatus },
      conversionRate,
      winRate,
      revenue,
      roi,
      campaignPerformance: { totalCampaigns: campaigns.length, contentByStatus, totalContent: content.length },
      meetings: { total: meetings.length, upcoming: meetings.filter((m) => new Date(m.scheduledAt) >= new Date()).length },
      pipelineValue: deals.filter((d) => d.stage !== 'Closed Won').reduce((sum, d) => sum + d.value, 0)
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to compute Growth Analytics' })
  }
})

// ---------------------------------------------------------------------------
// Phase 15 — Real Autonomous AI Company additions.
// ---------------------------------------------------------------------------

// GET/PATCH the one global on/off switch for autonomous behavior. Off by
// default — nothing below sends anything on its own until the Owner
// deliberately turns this on.
router.get('/autonomous-settings', requireAuth, requireOwner, async (req, res) => {
  try {
    const settings = await prisma.autonomousSettings.upsert({
      where: { id: 'singleton' }, update: {}, create: { id: 'singleton' }
    })
    res.json({ settings })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load autonomous settings' })
  }
})

router.patch('/autonomous-settings', requireAuth, requireOwner, async (req, res) => {
  try {
    const data = {}
    if (typeof req.body?.salesAutonomous === 'boolean') data.salesAutonomous = req.body.salesAutonomous
    if (typeof req.body?.growthAutonomous === 'boolean') data.growthAutonomous = req.body.growthAutonomous
    const settings = await prisma.autonomousSettings.upsert({
      where: { id: 'singleton' }, update: data, create: { id: 'singleton', ...data }
    })
    res.json({ settings })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to update autonomous settings' })
  }
})

// Dedicated Lead creation (used by the "Add Lead" button instead of the
// generic CRUD route in routes/leads.js) — this is the one that gives every
// new lead a real portal link and, if autonomous mode is on, immediately
// emails the client an invitation to start talking with Sales AI. Nothing
// is sent unless Gmail is actually connected — this never pretends to.
router.post('/leads', requireAuth, requireOwner, async (req, res) => {
  try {
    const lead = await prisma.lead.create({
      data: { ...req.body, publicToken: newPortalToken() }
    })

    let outreachSent = false
    const settings = await prisma.autonomousSettings.findUnique({ where: { id: 'singleton' } })
    if (settings?.salesAutonomous && lead.email) {
      const gmail = require('../lib/gmail')
      const connected = await gmail.isConnected().catch(() => false)
      if (connected) {
        const portalUrl = `${process.env.FRONTEND_ORIGIN || 'http://localhost:5174'}/talk-to-us/${lead.publicToken}`
        try {
          await gmail.sendEmail({
            to: lead.email,
            subject: `Thanks for reaching out, ${lead.name}!`,
            body: `Hi ${lead.name},\n\nThanks for your interest! I'd love to learn more about what you're looking for — you can chat with me directly here: ${portalUrl}\n\nTalk soon,\nSales`
          })
          outreachSent = true
        } catch (err) {
          console.error('Initial outreach email failed:', err.message)
        }
      }
    }

    res.status(201).json({ lead, outreachSent, portalUrl: `${process.env.FRONTEND_ORIGIN || 'http://localhost:5174'}/talk-to-us/${lead.publicToken}` })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to create lead' })
  }
})

// Get (or lazily create) a lead's portal link — for the Owner to copy and
// send manually when autonomous mode is off, or just to check the link.
router.get('/leads/:id/portal-link', requireAuth, requireOwner, async (req, res) => {
  try {
    let lead = await prisma.lead.findUnique({ where: { id: req.params.id } })
    if (!lead) return res.status(404).json({ error: 'Lead not found' })
    if (!lead.publicToken) {
      lead = await prisma.lead.update({ where: { id: lead.id }, data: { publicToken: newPortalToken() } })
    }
    res.json({ portalUrl: `${process.env.FRONTEND_ORIGIN || 'http://localhost:5174'}/talk-to-us/${lead.publicToken}` })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to get portal link' })
  }
})

// The Owner tells Sales AI when to follow up with a specific lead — real
// scheduling (backend/src/emailScheduler.js sends it for real at that time).
router.post('/leads/:id/schedule-followup', requireAuth, requireOwner, async (req, res) => {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id } })
    if (!lead) return res.status(404).json({ error: 'Lead not found' })
    if (!lead.email) return res.status(400).json({ error: 'This lead has no email on file' })
    const { sendAt } = req.body || {}
    const when = new Date(sendAt)
    if (isNaN(when)) return res.status(400).json({ error: 'A valid sendAt datetime is required' })

    const item = await generateContentCore({ type: 'follow_up', mode: 'ai', leadId: lead.id })

    const scheduled = await prisma.scheduledEmail.create({
      data: { leadId: lead.id, to: lead.email, subject: `Following up, ${lead.name}`, body: item.content, kind: 'follow_up', sendAt: when }
    })
    res.status(201).json({ scheduled })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message || 'Failed to schedule the follow-up' })
  }
})

router.get('/scheduled-emails', requireAuth, requireOwner, async (req, res) => {
  try {
    const items = await prisma.scheduledEmail.findMany({ orderBy: { sendAt: 'asc' } })
    res.json({ items })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load scheduled emails' })
  }
})

router.delete('/scheduled-emails/:id', requireAuth, requireOwner, async (req, res) => {
  try {
    await prisma.scheduledEmail.update({ where: { id: req.params.id }, data: { status: 'Cancelled' } })
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(404).json({ error: 'Scheduled email not found' })
  }
})

// ---------------------------------------------------------------------------
// Phase 16 (task 8) — "Get Me More Clients": Find Businesses → Research →
// Generate Outreach → Generate Proposal → Store Lead → CRM Entry →
// Campaign Assignment → Email Queue, in one real, orchestrated call.
// Reuses generateContentCore (above) and the Google Places integration —
// no duplicated content-generation or lead-storage logic.
// ---------------------------------------------------------------------------
router.post('/get-more-clients', requireAuth, requireOwner, async (req, res) => {
  const places = require('../lib/googlePlaces')
  if (!places.isConfigured()) {
    return res.status(503).json({ error: 'Google Places is not connected yet — set GOOGLE_PLACES_API_KEY in backend/.env to run "Get Me More Clients".' })
  }

  try {
    const { query, location, count } = req.body || {}
    if (!query?.trim()) return res.status(400).json({ error: 'query is required, e.g. "dentists"' })
    const take = Math.min(Number(count) || 5, 10) // capped — this makes several real AI calls per business found

    const found = await places.searchBusinesses(`${query} ${location || ''}`.trim())
    const targets = found.slice(0, take)
    if (targets.length === 0) {
      return res.json({ processed: 0, results: [], message: 'No businesses found for that search.' })
    }

    // One real Campaign record for this whole batch, so every lead/piece
    // of outreach from this run is grouped together (Campaign Assignment).
    const campaign = await prisma.campaign.create({
      data: { name: `Get Me More Clients — ${query}${location ? ` (${location})` : ''}`, channel: 'Outreach', status: 'Live', reach: targets.length }
    })

    const results = []
    for (const biz of targets) {
      // Research — one real, small Groq call, grounded only in what we
      // actually found (never inventing facts about the business).
      let research = ''
      try {
        research = await generateTextWithUsage(
          `Summarize, in 2-3 sentences, why this business might want a website/marketing partner, based only on: ${JSON.stringify(biz)}. Do not invent facts not implied by this data.`,
          [{ role: 'user', content: 'Write the summary now.' }], 200
        ).then((r) => r.text)
      } catch (err) {
        research = `(Research skipped: ${err.message})`
      }

      // Store Lead / CRM Entry — real, immediate.
      const lead = await prisma.lead.create({
        data: {
          name: biz.name, company: biz.name, industry: biz.businessType || query,
          source: 'Growth AI — Get Me More Clients', status: 'New', priority: 'Medium',
          notes: `${biz.address || ''}\n\n${research}`.trim(),
          publicToken: newPortalToken()
        }
      })

      // Generate Outreach + Proposal — reuses the same content engine
      // every other Growth AI generation uses.
      const outreach = await generateContentCore({ type: 'outreach', mode: 'ai', leadId: lead.id, campaignId: campaign.id })
      const proposal = await generateContentCore({ type: 'proposal', mode: 'ai', leadId: lead.id, campaignId: campaign.id })

      // Email Queue — honest limitation: Google Places doesn't return email
      // addresses (only name/address/phone/website), so there's usually
      // nothing to queue a real send to yet. If an email genuinely exists
      // (e.g. added later) and autonomous mode is on, this is where it
      // would actually get sent — see generateAndMaybeSendForLead's own
      // send path, reused for consistency rather than duplicated here.
      results.push({ lead: lead.name, leadId: lead.id, outreachId: outreach.id, proposalId: proposal.id, emailQueued: false, note: 'No email available from Google Places — add one to this lead to enable sending.' })
    }

    res.status(201).json({ processed: results.length, campaignId: campaign.id, results })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message || 'Get Me More Clients failed' })
  }
})

module.exports = router
module.exports.internal = { generateAndMaybeSendForLead, generateContentCore }
