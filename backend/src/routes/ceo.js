const express = require('express')
const prisma = require('../prismaClient')
const { requireAuth, requireOwner } = require('../middleware/auth')
const { generateText, hasApiKey } = require('../lib/llmProvider')

const router = express.Router()

// ---------------------------------------------------------------------------
// Shared aggregation — the CEO Brain has no tables of its own. Everything
// here is read live from Company Brain and the Business Foundation tables.
// This same function powers both the dashboard endpoint and the context
// the CEO Chat is grounded in, so the two are always consistent.
// ---------------------------------------------------------------------------
async function gatherExecutiveContext() {
  const [
    projects, clients, employees, workflows, meetings, campaigns, invoices, expenses, departments, companyBrain, brainSections
  ] = await Promise.all([
    prisma.project.findMany({ include: { client: true } }),
    prisma.client.findMany(),
    prisma.employee.findMany({ include: { department: true } }),
    prisma.workflow.findMany({ include: { stages: true } }),
    prisma.meeting.findMany({ where: { scheduledAt: { gte: new Date() } }, orderBy: { scheduledAt: 'asc' } }),
    prisma.campaign.findMany(),
    prisma.invoice.findMany({ include: { client: true } }),
    prisma.expense.findMany(),
    prisma.department.findMany({ include: { employees: true } }),
    prisma.companyBrain.findUnique({ where: { id: 'singleton' } }),
    prisma.brainSection.findMany()
  ])

  const TERMINAL = ['Completed', 'Cancelled', 'Failed', 'Archived']
  const activeClients = clients.filter((c) => c.status === 'Active')
  const mrr = activeClients.reduce((sum, c) => sum + c.mrr, 0)
  const burnRate = expenses.reduce((sum, e) => sum + e.amount, 0)
  const outstandingInvoices = invoices.filter((i) => i.status === 'Pending' || i.status === 'Overdue')
  const outstandingTotal = outstandingInvoices.reduce((sum, i) => sum + i.amount, 0)
  const paidTotal = invoices.filter((i) => i.status === 'Paid').reduce((sum, i) => sum + i.amount, 0)
  const activeWorkflows = workflows.filter((w) => !TERMINAL.includes(w.status))
  const activeStages = workflows.flatMap((w) => w.stages).filter((s) => !TERMINAL.includes(s.status))
  const activeCampaigns = campaigns.filter((c) => c.status === 'Live' || c.status === 'Scheduled')

  const projectsRunning = projects.filter((p) => p.status === 'In Progress')
  const projectsWaiting = projects.filter((p) => p.status === 'Planning' || p.status === 'Review')
  const projectsCompleted = projects.filter((p) => p.status === 'Completed')

  // A simple, transparent heuristic — not AI judgment, just a rule anyone
  // can read: healthy if recurring revenue currently covers burn rate.
  const companyHealth = burnRate === 0 ? 'Unknown' : mrr >= burnRate ? 'Healthy' : 'At Risk'

  const departmentStatus = departments.map((d) => {
    const deptActive = activeWorkflows.some((w) => w.departmentKey === d.key) || activeStages.some((s) => d.employees.some((e) => e.id === s.assigneeEmployeeId))
    return { name: d.name, status: deptActive ? 'Active work in progress' : 'Idle' }
  })

  const robotStatus = {
    total: employees.length,
    active: employees.filter((e) => activeStages.some((s) => s.assigneeEmployeeId === e.id)).length,
    idle: employees.filter((e) => !activeStages.some((s) => s.assigneeEmployeeId === e.id)).length
  }

  const filledSections = brainSections.filter((s) => s.content && s.content.trim())

  return {
    dashboard: {
      today: new Date().toISOString().slice(0, 10),
      projects: { running: projectsRunning.length, waiting: projectsWaiting.length, completed: projectsCompleted.length, total: projects.length },
      clients: { total: clients.length, active: activeClients.length },
      employees: { total: employees.length },
      revenue: { mrr, arr: mrr * 12, paidTotal },
      burnRate,
      pendingTasks: activeWorkflows.length + activeStages.length,
      meetings: { upcoming: meetings.length, next: meetings[0] || null },
      campaigns: { active: activeCampaigns.length, total: campaigns.length },
      invoices: { outstandingCount: outstandingInvoices.length, outstandingTotal, total: invoices.length },
      systemHealth: 'Online',
      companyHealth,
      robotStatus,
      departmentStatus
    },
    companyBrain,
    filledSections: filledSections.map((s) => ({ title: s.title, content: s.content })),
    recentProjects: projects.slice(0, 8).map((p) => ({ name: p.name, status: p.status, client: p.client?.name })),
    recentInvoices: invoices.slice(0, 8).map((i) => ({ number: i.number, client: i.client?.name, amount: i.amount, status: i.status }))
  }
}

// GET /api/ceo/dashboard — Owner only, real numbers only.
router.get('/dashboard', requireAuth, requireOwner, async (req, res) => {
  try {
    const ctx = await gatherExecutiveContext()
    res.json({ dashboard: ctx.dashboard })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load the Executive Dashboard' })
  }
})

function buildSystemPrompt(ctx) {
  const brain = ctx.companyBrain || {}
  const brainFacts = [
    ['Company Name', brain.companyName], ['Industry', brain.industry], ['Mission', brain.mission],
    ['Vision', brain.vision], ['Goals', brain.goals], ['Core Values', brain.coreValues],
    ['Brand Voice', brain.brandVoice], ['Tone', brain.tone], ['Writing Style', brain.writingStyle],
    ['Services', brain.services], ['Products', brain.products], ['Target Audience', brain.targetAudience],
    ['Pricing', brain.pricing], ['Packages', brain.packages], ['Working Hours', brain.workingHours],
    ['Processes', brain.processes], ['Business Rules', brain.rules], ['Custom Instructions', brain.customInstructions],
    ['Other Business Info', brain.businessInfo]
  ].filter(([, v]) => v && String(v).trim())

  const manualText = ctx.filledSections.length
    ? ctx.filledSections.map((s) => `### ${s.title}\n${s.content}`).join('\n\n')
    : '(No Operating Manual sections have been filled in yet.)'

  return `You are the CEO Brain of a FEXUS Workspace agency — the executive operating layer, not a general chatbot. You answer strictly from the Company Brain context and live business data provided below. You never invent facts, employees, clients, numbers, or policies that are not present in this context. If something isn't in the context, say plainly that it hasn't been recorded in Company Brain yet, and suggest which Company Brain section it should be added to.

## Company Brain — Business Profile
${brainFacts.length ? brainFacts.map(([k, v]) => `- ${k}: ${v}`).join('\n') : '(No business profile fields have been filled in yet.)'}

## Company Brain — Operating Manual (sections with content)
${manualText}

## Live Business Snapshot (real-time, from the Business Foundation database)
${JSON.stringify(ctx.dashboard, null, 2)}

## Recent Projects
${JSON.stringify(ctx.recentProjects, null, 2)}

## Recent Invoices
${JSON.stringify(ctx.recentInvoices, null, 2)}

Respond as a sharp, concise executive assistant would — direct, no filler, cite the real numbers above when relevant. Do not perform actions (you cannot create, edit, or delete anything from this chat) — you can only report and advise based on what's recorded.`
}

// POST /api/ceo/chat — Owner only. Always re-reads Company Brain + live data
// on every request (no caching, no memory of its own) before calling the
// model, so it can never drift from or bypass Company Brain.
router.post('/chat', requireAuth, requireOwner, async (req, res) => {
  try {
    const { message, history } = req.body || {}
    if (!message || !message.trim()) return res.status(400).json({ error: 'message is required' })

    if (!hasApiKey()) {
      return res.status(503).json({
        error: 'CEO Brain has no AI provider connected yet. Set GROQ_API_KEY in backend/.env to enable CEO Chat.'
      })
    }

    const ctx = await gatherExecutiveContext()
    const system = buildSystemPrompt(ctx)

    const priorTurns = Array.isArray(history)
      ? history
          .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
          .slice(-10)
      : []

    let reply
    try {
      reply = await generateText(system, [...priorTurns, { role: 'user', content: message }])
    } catch (aiErr) {
      console.error('LLM provider error:', aiErr)
      return res.status(502).json({ error: aiErr.message || 'CEO Brain could not reach the AI provider' })
    }

    res.json({ reply })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'CEO Brain failed to respond' })
  }
})

module.exports = router
