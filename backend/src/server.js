require('dotenv').config()
const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')

const authRouter = require('./routes/auth')
const departmentsRouter = require('./routes/departments')
const employeesRouter = require('./routes/employees')
const brainRouter = require('./routes/brain')
const companyBrainRouter = require('./routes/companyBrain')
const brainSectionsRouter = require('./routes/brainSections')
const meetingsRouter = require('./routes/meetings')
const leadsRouter = require('./routes/leads')
const supportTicketsRouter = require('./routes/supportTickets')
const ceoRouter = require('./routes/ceo')
const directorsRouter = require('./routes/directors')
const employeeRosterRouter = require('./routes/employeeRoster')
const workflowsRouter = require('./routes/workflows')
const workflowApprovalsRouter = require('./routes/workflowApprovals')
const workflowNotificationsRouter = require('./routes/workflowNotifications')
const automationEngineRouter = require('./routes/automationEngine')
const memoryEngineRouter = require('./routes/memoryEngine')
const integrationLayerRouter = require('./routes/integrationLayer')
const websiteAIRouter = require('./routes/websiteAI')
const growthRouter = require('./routes/growth')
const gmailAuthRouter = require('./routes/gmailAuth')
const sendersRouter = require('./routes/senders')
const salesPortalRouter = require('./routes/salesPortal')
const previewRouter = require('./routes/preview')
const paymentsRouter = require('./routes/payments')
const settingsRouter = require('./routes/settings')
const emailCampaignsRouter = require('./routes/emailCampaigns')
const emailTemplatesRouter = require('./routes/emailTemplates')
const emailTrackingRouter = require('./routes/emailTracking')
const licenseRouter = require('./routes/license')
const { router: unsubscribeRouter } = require('./routes/unsubscribe')
const voiceAgentRouter = require('./routes/voiceAgent')
const localAgentRouter = require('./routes/localAgent')
const tasksRouter = require('./routes/tasks')
const paymentWebhooksRouter = require('./routes/paymentWebhooks')
const { startEmailScheduler } = require('./emailScheduler')
const { startCampaignEngine } = require('./campaignEngine')
const { startTaskEngine } = require('./taskEngine')
const clientsRouter = require('./routes/clients')
const projectsRouter = require('./routes/projects')
const invoicesRouter = require('./routes/invoices')
const campaignsRouter = require('./routes/campaigns')
const dealsRouter = require('./routes/deals')
const seoAuditsRouter = require('./routes/seoAudits')
const sitesRouter = require('./routes/sites')
const automationsRouter = require('./routes/automations')
const expensesRouter = require('./routes/expenses')
const metricsRouter = require('./routes/metrics')
const { requireAuth, requireOwner } = require('./middleware/auth')

const app = express()
const PORT = process.env.PORT || 4000
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5174'

app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }))

// Phase 16 — payment webhooks MUST be mounted before express.json() below.
// Stripe's signature verification needs the exact raw request bytes
// (express.json() would parse-and-reformat the body, silently breaking
// signature checks), and PayFast posts real form-urlencoded data, not
// JSON. Both routes are otherwise public — a webhook call isn't a logged-in
// browser session, it's the payment provider's own server calling us; the
// signature/ITN validation IS the authentication for these two routes.
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }))
app.use('/api/webhooks/payfast', express.urlencoded({ extended: false }))
app.use('/api/webhooks', paymentWebhooksRouter)

// Root cause of "large CSV imports fail": express.json() with no options
// falls back to Express's own default body-size limit of 100KB — a CSV of
// even a couple thousand rows exceeds that easily, and Express rejects
// the request with a 413 before any route handler ever runs. Raised to a
// real, explicit, documented limit — not "unlimited" (no such thing
// genuinely exists; Node still has to hold the parsed body in memory),
// but generous enough that a single request is no longer the practical
// constraint. The real fix for very large files is the batched CSV
// import below (routes/emailCampaigns.js), which keeps any one request
// small regardless of total file size — this limit is a safety margin,
// not the primary mechanism.
app.use(express.json({ limit: '25mb' }))
app.use(cookieParser())

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'fexus-workspace-backend' })
})

// Public — signup/login/logout/me
app.use('/api/auth', authRouter)

// Any signed-in Company User can read the Company Brain; only the Owner can edit it.
app.use('/api/company-brain', companyBrainRouter)
app.use('/api/brain-sections', brainSectionsRouter)

// Phase 3 architecture placeholder — any signed-in user, read-only, no logic.
app.use('/api/brain', requireAuth, brainRouter)

// Company Office is an Owner-only view. Reads the Workflow Engine (below)
// for anything task-related — the old Task model was removed in the
// Phase 6.5.1 consolidation.
app.use('/api/departments', requireAuth, requireOwner, departmentsRouter)
app.use('/api/employees', requireAuth, requireOwner, employeesRouter)

// Business Foundation — real CRUD data, open to any signed-in Company User
// (auth is enforced inside each router too, so this is defense in depth).
app.use('/api/clients', clientsRouter)
app.use('/api/projects', projectsRouter)
app.use('/api/invoices', invoicesRouter)
app.use('/api/campaigns', campaignsRouter)
app.use('/api/deals', dealsRouter)
app.use('/api/seo-audits', seoAuditsRouter)
app.use('/api/sites', sitesRouter)
app.use('/api/automations', automationsRouter)
app.use('/api/expenses', expensesRouter)
app.use('/api/metrics', metricsRouter)
app.use('/api/meetings', meetingsRouter)
app.use('/api/leads', leadsRouter)
app.use('/api/support-tickets', supportTicketsRouter)

// CEO Brain — Owner only, always reads Company Brain + Business Foundation
// (including the Workflow Engine) live; never bypasses them.
app.use('/api/ceo', ceoRouter)

// Director Brains — Owner only. Each director reads only its own
// department's data + Company Brain; no director executes work or writes data.
app.use('/api/directors', directorsRouter)

// AI Employees — Owner only. Read-only roster; their task queue is now the
// Workflow Engine's WorkflowStage model (the old EmployeeTask model was
// removed in the Phase 6.5.1 consolidation — see CHANGELOG.md).
app.use('/api/employee-roster', employeeRosterRouter)

// Workflow Engine — Owner only, and as of the Phase 6.5.1 consolidation,
// the SINGLE task system for the whole app (Company Office, CEO Brain,
// Director Brains, and the Employee Office all read/write this). No
// automation: every transition here is a manual API call.
app.use('/api/workflows', workflowsRouter)
app.use('/api/workflow-approvals', workflowApprovalsRouter)
app.use('/api/workflow-notifications', workflowNotificationsRouter)

// Automation Engine — Owner only. The execution layer downstream of the
// Workflow Engine: reads Workflow/WorkflowStage read-only to link jobs to
// real completed work, never writes to them. Framework only — no external
// API, no real execution, every capability is "Prepare X"/"Track X".
app.use('/api/automation-jobs', automationEngineRouter)

// Memory Engine — Owner only. Temporary working memory for Employees,
// read-only against Company Brain/Operating Manual/Workflow Engine (never
// writes to them). Framework only — no vector DB, no embeddings, no RAG,
// no LLM memory, no autonomous agents. See memoryManager.js.
app.use('/api/memory', memoryEngineRouter)

// Integration Layer — Owner only. A registry of connector PLACEHOLDERS for
// external services. No real API is ever called, no OAuth flow runs, no
// token is requested, and no credential is stored anywhere in this system.
app.use('/api/connectors', integrationLayerRouter)

// Website AI — Owner only. The first real AI Employee: reads Company
// Brain, the Operating Manual, Business Foundation, the Workflow Engine,
// and the Memory Engine (all read-only, via their own existing functions)
// to produce a structured website PLAN. Never generates real code, never
// deploys — see routes/websiteAI.js.
app.use('/api/website-ai', websiteAIRouter)

// Growth AI Department (Phase 13) — Marketing + Sales combined. Groq
// Flash only, via the centralized LLM Provider Layer. No AI for CRUD,
// dashboards, or analytics — see routes/growth.js.
app.use('/api/growth', growthRouter)

// Phase 16 — real payment infrastructure (Stripe + PayFast). Owner-only
// for creating checkouts/viewing transactions; the actual webhooks are
// mounted separately above, before express.json().
app.use('/api/payments', paymentsRouter)

// Phase 17 — real Settings persistence, and the Advanced Gmail Campaign
// System, built entirely on the existing Gmail integration above. Mounted
// at /api/email-campaigns (not /api/campaigns) specifically to avoid any
// collision with the existing Business Foundation Campaign CRUD.
app.use('/api/settings', settingsRouter)
app.use('/api/email-campaigns', emailCampaignsRouter)
app.use('/api/email-templates', emailTemplatesRouter)
// Phase 23 — deliberately public, no requireAuth: a recipient's mail
// client calls this directly, with no FEXUS session of its own. Security
// comes from the tracking token itself (see routes/emailTracking.js).
app.use('/api/email-tracking', emailTrackingRouter)
// Phase 23 — License System. Owner-management routes require the Owner
// (requireOwner); client-login is public with its own separate session
// mechanism (middleware/licenseAuth.js), fully isolated from the
// Owner/User cookie above.
app.use('/api/license', licenseRouter)
// Deliverability audit — public, real one-click unsubscribe (RFC 8058).
app.use('/api/unsubscribe', unsubscribeRouter)
// Phase 24 — the FEXUS Voice Agent orchestration layer.
app.use('/api/voice', voiceAgentRouter)
// Phase 24 (extension) — Local PC Agent pairing/permissions/relay.
app.use('/api/local-agent', localAgentRouter)
// Master Computer-Use spec — real, persistent multi-step task orchestration.
app.use('/api/tasks', tasksRouter)

// Phase 15 — Real Autonomous AI Company.
// Gmail OAuth2 — Owner only (the connect/status/disconnect actions), except
// the callback, which Google itself redirects to.
app.use('/api/gmail', gmailAuthRouter)

// Phase 18 — the multi-sender Company Email System, built on the same
// real OAuth mechanism as /api/gmail above, applied per address.
app.use('/api/senders', sendersRouter)

// The Sales Portal — PUBLIC, no auth. Meant to be opened directly by a real
// client using their own unique link (routes/salesPortal.js explains the
// token-based trust model). This is the one place in the entire backend
// that intentionally has no requireAuth/requireOwner at all.
app.use('/api/public/sales', salesPortalRouter)

// The real preview route — also PUBLIC by design, same reasoning as above.
// Deliberately mounted outside /api since it serves raw HTML directly.
app.use('/preview', previewRouter)

app.use((req, res) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}` })
})

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`FEXUS Workspace backend running at http://localhost:${PORT}`)
  startEmailScheduler()
  startCampaignEngine()
  startTaskEngine()
})
