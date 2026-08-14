const express = require('express')
const prisma = require('../prismaClient')
const { generateText, extractJson } = require('../lib/llmProvider')
const { runAutoHandoff } = require('../autoHandoff')

const router = express.Router()

async function loadLeadByToken(token) {
  const lead = await prisma.lead.findUnique({ where: { publicToken: token } })
  if (!lead) { const err = new Error('Not found'); err.status = 404; throw err }
  return lead
}

function parseLog(lead) {
  try { return JSON.parse(lead.conversationLog || '[]') } catch { return [] }
}

async function appendLog(leadId, entry) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } })
  const log = parseLog(lead)
  log.push({ ...entry, at: new Date().toISOString() })
  return prisma.lead.update({ where: { id: leadId }, data: { conversationLog: JSON.stringify(log) } })
}

const REQUIRED_FIELDS = ['businessType', 'pages', 'style', 'targetAudience', 'country', 'budget', 'deadline']

function missingFields(lead) {
  return REQUIRED_FIELDS.filter((f) => !lead[f])
}

async function getCompanyBrainFacts() {
  const brain = await prisma.companyBrain.findUnique({ where: { id: 'singleton' } })
  if (!brain) return {}
  const { id, updatedAt, ...fields } = brain
  return fields
}

function buildSalesSystemPrompt(lead, brain) {
  const brainFacts = Object.entries(brain).filter(([, v]) => v && String(v).trim())
  const missing = missingFields(lead)
  return `You are Sales AI, a real sales representative for this agency, talking directly with a prospective client named ${lead.name}${lead.company ? ` from ${lead.company}` : ''}.

Your job in this conversation:
1. Answer any question the client asks, honestly and helpfully, using only the business facts below — never invent a policy, price, or promise not stated here.
2. Collect these specific facts about their project, naturally, one or two at a time — don't interrogate them with a checklist: business type, pages needed, preferred style, target audience, country, budget, and deadline.
3. Still missing from this lead: ${missing.length ? missing.join(', ') : 'nothing — all fields are collected'}.
4. Once ALL of those facts are collected, tell them you're preparing a formal quotation and proposal, and that it will arrive shortly.
5. If they push back on price or scope, negotiate reasonably within what's described in the business facts below — never invent a specific discount policy that isn't stated.
6. You cannot yourself mark a deal "closed" — only the client's own click on the real "Accept Proposal" button in their portal does that. Don't claim to have closed anything.

## Business facts (Company Brain)
${brainFacts.length ? brainFacts.map(([k, v]) => `- ${k}: ${v}`).join('\n') : '(No business profile recorded yet — be honest that you don\u2019t have specifics yet.)'}

Respond with ONLY your reply to the client — no notes, no meta-commentary, just what you'd actually say.`
}

async function extractFields(lead, latestClientMessage) {
  const system = `Extract any of these fields the client just revealed, from their message: businessType, pages, style, targetAudience, country, budget, deadline (as an ISO date if a real date is implied, otherwise omit it). Respond with ONLY a JSON object containing any of those keys that are newly mentioned — omit keys not mentioned. If nothing is mentioned, respond with {}.`
  try {
    const reply = await generateText(system, [{ role: 'user', content: latestClientMessage }], 300)
    const parsed = extractJson(reply)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

router.get('/:token', async (req, res) => {
  try {
    const lead = await loadLeadByToken(req.params.token)
    res.json({
      name: lead.name, company: lead.company, status: lead.status,
      conversation: parseLog(lead),
      collected: {
        businessType: lead.businessType, pages: lead.pages, style: lead.style,
        targetAudience: lead.targetAudience, country: lead.country, budget: lead.budget,
        deadline: lead.deadline
      },
      missingFields: missingFields(lead),
      dealClosed: !!lead.dealClosedAt
    })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.post('/:token/message', async (req, res) => {
  try {
    const lead = await loadLeadByToken(req.params.token)
    const { message } = req.body || {}
    if (!message?.trim()) return res.status(400).json({ error: 'message is required' })
    if (lead.dealClosedAt) return res.status(400).json({ error: 'This deal is already closed.' })

    await appendLog(lead.id, { sender: 'client', content: message })

    const extracted = await extractFields(lead, message)
    const updateData = {}
    for (const [k, v] of Object.entries(extracted)) {
      if (k === 'deadline') { const d = new Date(v); if (!isNaN(d)) updateData.deadline = d; continue }
      if (REQUIRED_FIELDS.includes(k) && v) updateData[k] = String(v)
    }
    let updatedLead = lead
    if (Object.keys(updateData).length > 0) {
      updatedLead = await prisma.lead.update({ where: { id: lead.id }, data: updateData })
    }
    if (updatedLead.status === 'New') {
      updatedLead = await prisma.lead.update({ where: { id: lead.id }, data: { status: 'Contacted' } })
    }

    const brain = await getCompanyBrainFacts()
    const system = buildSalesSystemPrompt(updatedLead, brain)
    const history = parseLog(updatedLead).slice(-12).map((m) => ({ role: m.sender === 'client' ? 'user' : 'assistant', content: m.content }))
    const reply = await generateText(system, history, 500)

    await appendLog(lead.id, { sender: 'sales_ai', content: reply })

    let quotationSent = false
    if (missingFields(updatedLead).length === 0 && updatedLead.status !== 'Proposal') {
      quotationSent = await autoGenerateAndSendQuotation(updatedLead)
    }

    res.json({ reply, collected: extracted, quotationSent })
  } catch (err) {
    console.error(err)
    const status = err.status || (err.message?.includes('No AI provider') ? 503 : 500)
    res.status(status).json({ error: err.message || 'Sales AI could not respond' })
  }
})

async function autoGenerateAndSendQuotation(lead) {
  const growth = require('./growth')
  try {
    await growth.internal.generateAndMaybeSendForLead(lead, 'quotation')
    await growth.internal.generateAndMaybeSendForLead(lead, 'proposal')
    await prisma.lead.update({ where: { id: lead.id }, data: { status: 'Proposal' } })
    return true
  } catch (err) {
    console.error('Auto-quotation failed:', err.message)
    return false
  }
}

router.post('/:token/accept', async (req, res) => {
  try {
    const lead = await loadLeadByToken(req.params.token)
    if (lead.dealClosedAt) return res.status(400).json({ error: 'Already closed.' })

    const updated = await prisma.lead.update({ where: { id: lead.id }, data: { status: 'Won', dealClosedAt: new Date() } })
    await appendLog(lead.id, { sender: 'client', content: '[Accepted the proposal]' })

    const report = await runAutoHandoff(lead.id)
    res.json({ ok: true, lead: updated, handoff: report })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to process acceptance' })
  }
})

module.exports = router
