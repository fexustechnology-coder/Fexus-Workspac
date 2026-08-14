const express = require('express')
const prisma = require('../prismaClient')
const { requireAuth, requireOwner } = require('../middleware/auth')
const { generateText } = require('../lib/llmProvider')
const { DIRECTORS } = require('../directors')

const router = express.Router()

function findDirector(key) {
  return DIRECTORS.find((d) => d.key === key)
}

async function getCompanyBrainFacts() {
  const brain = await prisma.companyBrain.findUnique({ where: { id: 'singleton' } })
  if (!brain) return {}
  const { id, updatedAt, ...fields } = brain
  return fields
}

async function getDeptStatus(departmentKey) {
  if (!departmentKey) return null
  const department = await prisma.department.findUnique({
    where: { key: departmentKey },
    include: { employees: true }
  })
  if (!department) return null
  const activeWorkflows = await prisma.workflow.findMany({
    where: { departmentKey, status: { notIn: ['Completed', 'Cancelled', 'Failed', 'Archived'] } }
  })
  return { name: department.name, activeWorkflows: activeWorkflows.length, employees: department.employees.length }
}

// Each director only ever queries their own department's tables — this is
// the actual data scoping (the `reads` field in directors.js is UI-facing
// documentation of the same boundary enforced here).
async function gatherDirectorContext(key) {
  const director = findDirector(key)
  if (!director) return null

  const companyBrain = await getCompanyBrainFacts()
  const deptStatus = await getDeptStatus(director.departmentKey)
  let data = {}

  switch (key) {
    case 'marketing': {
      const campaigns = await prisma.campaign.findMany()
      data = { campaigns }
      break
    }
    case 'sales': {
      const [clients, leads, invoices, deals] = await Promise.all([
        prisma.client.findMany(), prisma.lead.findMany(), prisma.invoice.findMany({ include: { client: true } }), prisma.deal.findMany()
      ])
      data = { clients, leads, invoices, deals }
      break
    }
    case 'website': {
      const [projects, sites] = await Promise.all([prisma.project.findMany({ include: { client: true } }), prisma.site.findMany()])
      data = { projects, sites }
      break
    }
    case 'seo': {
      const [seoAudits, sites] = await Promise.all([prisma.seoAudit.findMany(), prisma.site.findMany()])
      data = { seoAudits, sites }
      break
    }
    case 'finance': {
      const [invoices, expenses, clients] = await Promise.all([
        prisma.invoice.findMany({ include: { client: true } }), prisma.expense.findMany(), prisma.client.findMany()
      ])
      const mrr = clients.filter((c) => c.status === 'Active').reduce((s, c) => s + c.mrr, 0)
      const burnRate = expenses.reduce((s, e) => s + e.amount, 0)
      data = { invoices, expenses, mrr, arr: mrr * 12, burnRate }
      break
    }
    case 'project': {
      const [projects, meetings, workflows] = await Promise.all([
        prisma.project.findMany({ include: { client: true } }),
        prisma.meeting.findMany({ orderBy: { scheduledAt: 'asc' } }),
        prisma.workflow.findMany({ where: { departmentKey: director.departmentKey }, include: { stages: true } })
      ])
      const activeWorkflows = workflows.filter((w) => !['Completed', 'Cancelled', 'Failed', 'Archived'].includes(w.status))
      data = { projects, meetings, activeWorkflows }
      break
    }
    case 'support': {
      const [tickets, clients] = await Promise.all([prisma.supportTicket.findMany(), prisma.client.findMany()])
      data = { tickets, clients }
      break
    }
    case 'analytics': {
      // Read-only, everything — same idea as CEO Brain's dashboard, scoped
      // to reporting rather than action.
      const [projects, clients, invoices, deals, campaigns, expenses] = await Promise.all([
        prisma.project.findMany(), prisma.client.findMany(), prisma.invoice.findMany(),
        prisma.deal.findMany(), prisma.campaign.findMany(), prisma.expense.findMany()
      ])
      data = { projects, clients, invoices, deals, campaigns, expenses }
      break
    }
    case 'automation': {
      const automations = await prisma.automation.findMany()
      data = { automations }
      break
    }
    default:
      data = {}
  }

  return { director, companyBrain, deptStatus, data }
}

// GET /api/directors — the roster, with live department status for each.
router.get('/', requireAuth, requireOwner, async (req, res) => {
  try {
    const roster = await Promise.all(
      DIRECTORS.map(async (d) => ({ ...d, deptStatus: await getDeptStatus(d.departmentKey) }))
    )
    res.json({ directors: roster })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load the Executive Leadership Team' })
  }
})

// GET /api/directors/:key/dashboard — real, domain-scoped data only.
router.get('/:key/dashboard', requireAuth, requireOwner, async (req, res) => {
  try {
    const ctx = await gatherDirectorContext(req.params.key)
    if (!ctx) return res.status(404).json({ error: 'Unknown director' })
    res.json({ director: ctx.director, deptStatus: ctx.deptStatus, data: ctx.data })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load director dashboard' })
  }
})

function buildDirectorSystemPrompt(ctx) {
  const { director, companyBrain, deptStatus, data } = ctx
  const brainFacts = Object.entries(companyBrain || {}).filter(([, v]) => v && String(v).trim())

  return `You are the ${director.title} inside a FEXUS Workspace agency. You are a department expert reporting to the CEO Brain and, ultimately, the Owner — not a general chatbot.

Your responsibilities are strictly: ${director.responsibilities.join(', ')}.
You NEVER execute work, write data, or take actions from this chat — you only plan, advise, and report. Task execution belongs to Employees, a future phase that does not exist yet.
You only read: ${director.reads.join(', ')}. Do not answer questions about other departments' data you don't have access to here — say it's outside your department and suggest the right director instead.
You answer strictly from the context below. If something isn't in it, say plainly that it hasn't been recorded yet rather than inventing it.

## Company Brain — Business Profile (shared context every director reads)
${brainFacts.length ? brainFacts.map(([k, v]) => `- ${k}: ${v}`).join('\n') : '(No business profile fields have been filled in yet.)'}

## Department Status
${deptStatus ? JSON.stringify(deptStatus, null, 2) : '(No live department status available.)'}

## Your Department Data
${JSON.stringify(data, null, 2)}

Respond concisely and directly, like a sharp department head would in a status update — cite the real data above when relevant.`
}

// POST /api/directors/:key/chat — grounded, department-scoped, never persisted server-side.
router.post('/:key/chat', requireAuth, requireOwner, async (req, res) => {
  try {
    const { message, history } = req.body || {}
    if (!message || !message.trim()) return res.status(400).json({ error: 'message is required' })

    const ctx = await gatherDirectorContext(req.params.key)
    if (!ctx) return res.status(404).json({ error: 'Unknown director' })

    const system = buildDirectorSystemPrompt(ctx)
    const priorTurns = Array.isArray(history)
      ? history.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').slice(-10)
      : []

    const reply = await generateText(system, [...priorTurns, { role: 'user', content: message }])
    res.json({ reply })
  } catch (err) {
    console.error(err)
    const status = err.message?.includes('No AI provider') ? 503 : 502
    res.status(status).json({ error: err.message || 'The director could not respond' })
  }
})

module.exports = router
