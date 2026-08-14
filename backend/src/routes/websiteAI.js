const express = require('express')
const archiver = require('archiver')
const prisma = require('../prismaClient')
const { requireAuth } = require('../middleware/auth')
// Real, explicit, honest architecture note: WebsiteProject was built
// (and remains) a single-tenant, company-wide model — no `userId`
// field exists on it, and no query here is scoped per-user. Every
// route only ever required requireOwner (not requireAuth) until it was
// deliberately relaxed to let any signed-in Company User use Shanza's
// real workflow too, per explicit Owner instruction. This is a real,
// intentional design choice consistent with how this whole product
// already treats employees (Hira/Shanza serve the WHOLE company, not
// each individual login) — a website project belongs to the company,
// not to whichever specific person created it. If genuine per-user
// privacy for website projects is ever needed, that requires a real
// schema migration (adding userId) plus scoping every query here — a
// separate, larger, deliberate change, not done as part of this one.
const { generateText, generateTextWithUsage, extractJson } = require('../lib/llmProvider')
const memoryManager = require('../memoryManager')
const { logHistory, notify } = require('../lib/workflowHelpers')
const {
  WEBSITE_TYPES, STATUSES, WEBSITE_PHASES, QUALITY_CHECKLIST_ITEMS, STATUS_PROGRESS,
  CODE_STACKS, DEPLOYMENT_PROVIDERS, PLAN_TIERS, AUTO_BUILD_CODE_STACK
} = require('../websiteAIConstants')

const router = express.Router()
const TERMINAL_STAGE = ['Completed', 'Cancelled', 'Failed', 'Archived']

// Defensive, best-effort check that the model didn't emit real code. This
// is a safety net, not a guarantee — it catches the obvious cases (HTML
// tags, JSX, code fences, framework-specific syntax) so an accidental
// code-shaped response is rejected rather than silently saved.
const CODE_PATTERNS = [
  /<[a-zA-Z][^>]*>/, /```/, /import\s+react/i, /export\s+default\s+function/i,
  /@tailwind/i, /useState\s*\(/, /className\s*=/, /<\/?(div|span|section|nav|header|footer)\b/i
]
function looksLikeCode(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return CODE_PATTERNS.some((re) => re.test(text))
}

async function getCompanyBrainFacts() {
  const brain = await prisma.companyBrain.findUnique({ where: { id: 'singleton' } })
  if (!brain) return {}
  const { id, updatedAt, ...fields } = brain
  return fields
}

async function gatherContext({ stageId }) {
  const companyBrain = await getCompanyBrainFacts()
  const brainSections = await prisma.brainSection.findMany()
  const filledSections = brainSections.filter((s) => s.content?.trim()).slice(0, 6).map((s) => ({ title: s.title, content: s.content }))

  let stage = null, workflow = null, memory = null
  let employeeLabel = 'Website AI', directorLabel = '', clientLabel = ''

  if (stageId) {
    stage = await prisma.workflowStage.findUnique({ where: { id: stageId }, include: { workflow: true } })
    if (stage) {
      workflow = stage.workflow
      employeeLabel = stage.assigneeLabel || employeeLabel
      if (stage.assigneeEmployeeId) {
        memory = await memoryManager.loadMemory({ employeeId: stage.assigneeEmployeeId, stageId })
      }
      const director = await prisma.employee.findFirst({ where: { level: 'director', department: { key: workflow.departmentKey } } })
      directorLabel = director?.name || ''
      if (memory?.clientProfileSnapshot) {
        try { clientLabel = JSON.parse(memory.clientProfileSnapshot)?.name || '' } catch { /* ignore */ }
      }
    }
  }

  return { companyBrain, filledSections, stage, workflow, memory, employeeLabel, directorLabel, clientLabel }
}

function buildSystemPrompt(ctx, websiteType, requirementsText) {
  const brainFacts = Object.entries(ctx.companyBrain || {}).filter(([, v]) => v && String(v).trim())
  const manualText = ctx.filledSections.length
    ? ctx.filledSections.map((s) => `### ${s.title}\n${s.content}`).join('\n\n')
    : '(No Operating Manual sections recorded yet.)'

  const resourceLinks = ctx.memory ? (() => { try { return JSON.parse(ctx.memory.resourceLinks || '[]') } catch { return [] } })() : []
  const workingNotes = ctx.memory?.workingNotes || ''
  const conversation = ctx.memory ? (() => { try { return JSON.parse(ctx.memory.conversationSnapshot || '[]') } catch { return [] } })() : []

  return `You are Website AI, the first real AI Employee inside a FEXUS Workspace agency. You PLAN websites — you NEVER write actual code. You NEVER make business decisions (the CEO decides, the Website Director manages, you and other Website Employees execute planning only).

## Absolute rule
Your entire response must be ONE valid JSON object with exactly these keys, and NOTHING else — no markdown, no code fences, no HTML, no JSX, no CSS, no Tailwind classes, no Next.js/React syntax anywhere in any value:
{
  "requirementsAnalysis": "plain-English analysis of what's being asked for",
  "pages": [{ "name": "...", "purpose": "..." }],
  "sections": [{ "name": "...", "usedOn": "..." }],
  "components": [{ "name": "...", "description": "..." }],
  "designPlan": { "colors": "...", "typography": "...", "spacing": "...", "darkMode": "...", "lightMode": "..." },
  "responsivePlan": "plain-English notes on responsive/layout behavior across breakpoints",
  "assetPlan": [{ "label": "...", "type": "logo|color|font|image|reference", "source": "..." }],
  "projectStructure": "plain-English description of a folder/project structure — NOT real file contents",
  "deploymentPlan": "plain-English list of steps referencing connector NAMES only (e.g. 'Prepare domain via Domains connector') — never real deployment"
}
Every value is descriptive planning text or plain data — never a code snippet, never an HTML tag, never a component's actual implementation.

## Website type
${websiteType}

## Requirements (from the Owner/Director)
${requirementsText || '(none provided — infer reasonable defaults for this website type)'}

## Company Brain — Business Profile
${brainFacts.length ? brainFacts.map(([k, v]) => `- ${k}: ${v}`).join('\n') : '(No business profile fields recorded yet.)'}

## Operating Manual (relevant sections)
${manualText}

## Client Profile
${ctx.clientLabel ? `Client: ${ctx.clientLabel}` : '(No client linked to this plan.)'}

## Director Instructions / Recent Workflow Activity
${conversation.length ? conversation.map((c) => `- ${c.actorLabel}: ${c.message}`).join('\n') : '(No recent workflow activity recorded.)'}

## Working Notes (temporary, from Memory Engine)
${workingNotes || '(none)'}

## Linked Assets (Resource Memory — reference only, do not invent new ones beyond what's listed)
${resourceLinks.length ? resourceLinks.map((r) => `- ${r.label} (${r.type}): ${r.url}`).join('\n') : '(No assets linked yet — note this in assetPlan rather than inventing any.)'}

Respond with the JSON object only.`
}

router.get('/projects', requireAuth, async (req, res) => {
  try {
    const projects = await prisma.websiteProject.findMany({ orderBy: { updatedAt: 'desc' } })
    res.json({ projects, websiteTypes: WEBSITE_TYPES, statuses: STATUSES })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load website projects' })
  }
})

router.get('/projects/:id', requireAuth, async (req, res) => {
  try {
    const project = await prisma.websiteProject.findUnique({ where: { id: req.params.id } })
    if (!project) return res.status(404).json({ error: 'Website project not found' })
    res.json({ project })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load website project' })
  }
})

// Extracted (Phase 15) so the autonomous handoff pipeline (lib/autoHandoff.js)
// can call the exact same logic the HTTP route uses — zero duplicated
// generation logic between "Owner clicks New Plan" and "Sales AI closes a
// deal automatically." Throws on failure; the HTTP route below translates
// that into a response, and the internal caller can catch it directly.
async function generatePlanCore({ websiteType, requirementsText, stageId, leadId }) {
  if (!WEBSITE_TYPES.includes(websiteType)) {
    const err = new Error('Invalid websiteType'); err.status = 400; throw err
  }

  const ctx = await gatherContext({ stageId })
  const system = buildSystemPrompt(ctx, websiteType, requirementsText || '')
  const reply = await generateText(system, [{ role: 'user', content: 'Generate the plan now, as the JSON object only.' }])

  let plan
  try {
    plan = extractJson(reply)
  } catch (err) {
    console.error('[websiteAI] Failed to parse the plan response. Raw model output:', reply)
    console.error('[websiteAI] Real parse error:', err.message)
    const e = new Error('Website AI response was not valid JSON — try again.'); e.status = 502; throw e
  }

  const fields = ['requirementsAnalysis', 'pages', 'sections', 'components', 'designPlan', 'responsivePlan', 'assetPlan', 'projectStructure', 'deploymentPlan']
  for (const f of fields) {
    if (plan[f] !== undefined && looksLikeCode(plan[f])) {
      const err = new Error(`Generated "${f}" looked like real code and was rejected. Try again — Website AI plans, it doesn't code.`)
      err.status = 422; throw err
    }
  }

  const project = await prisma.websiteProject.create({
    data: {
      workflowId: ctx.workflow?.id || null,
      stageId: ctx.stage?.id || null,
      memoryId: ctx.memory?.id || null,
      leadId: leadId || null,
      employeeLabel: ctx.employeeLabel,
      directorLabel: ctx.directorLabel,
      clientLabel: ctx.clientLabel,
      websiteType,
      status: 'Planning',
      requirementsText: requirementsText || '',
      requirementsAnalysis: plan.requirementsAnalysis || '',
      pages: JSON.stringify(plan.pages || []),
      sections: JSON.stringify(plan.sections || []),
      components: JSON.stringify(plan.components || []),
      designPlan: JSON.stringify(plan.designPlan || {}),
      responsivePlan: plan.responsivePlan || '',
      assetPlan: JSON.stringify(plan.assetPlan || []),
      projectStructure: plan.projectStructure || '',
      deploymentPlan: plan.deploymentPlan || ''
    }
  })

  return project
}

// =============================================================================
// PHASE 23 — Design Options (Part 17). Two real paths: generate 3-4
// selectable AI concepts, or import a design reference. Both feed the
// SAME `designPlan` field the existing plan/code-gen already reads —
// this is deliberately additive, not a parallel design system.
// =============================================================================

// POST /projects/:id/design-concepts — generates 3-4 real, distinct
// design concepts (name/style/colors/typography/description) via the
// centralized Groq provider. This is a lightweight, separate call from
// the full 8-module plan — the Owner picks a direction here BEFORE the
// detailed plan commits to it.
router.post('/projects/:id/design-concepts', requireAuth, async (req, res) => {
  try {
    const project = await prisma.websiteProject.findUnique({ where: { id: req.params.id } })
    if (!project) return res.status(404).json({ error: 'Website project not found' })

    const system = `You are Website AI's design ideation step. Generate exactly 3 distinct, genuinely different design CONCEPTS for a ${project.websiteType} website. Requirements: ${project.requirementsText || '(none provided — use good judgment for this website type)'}

Respond with ONLY a JSON object: { "concepts": [{ "name": "short concept name", "style": "one-line style descriptor, e.g. 'Bold & Minimal'", "colors": "concrete color direction, e.g. 'Deep navy, warm white, single coral accent'", "typography": "concrete typeface direction, e.g. 'Geometric sans headings, humanist serif body'", "description": "2-3 sentences describing the overall visual feel and why it fits this website type" }] }
Each concept must be meaningfully different from the others — not the same idea with swapped colors. No markdown, no code, no commentary outside the JSON.`

    const { text, usage } = await generateTextWithUsage(system, [{ role: 'user', content: 'Generate the 3 concepts now, as the JSON object only.' }], 2048)
    let parsed
    try {
      parsed = extractJson(text)
    } catch (err) {
      console.error('[websiteAI] Failed to parse the design-concepts response. Raw model output:', text)
      console.error('[websiteAI] Real parse error:', err.message)
      const e = new Error('Website AI design-concepts response was not valid JSON — try again.'); e.status = 502; throw e
    }
    const concepts = parsed.concepts || []

    let usageLog = []
    try { usageLog = JSON.parse(project.apiUsageLog || '[]') } catch { usageLog = [] }
    usageLog.push({ action: 'design-concepts', inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, at: new Date().toISOString() })

    const updated = await prisma.websiteProject.update({
      where: { id: project.id },
      data: { designConcepts: JSON.stringify(concepts), apiUsageLog: JSON.stringify(usageLog) }
    })
    res.status(201).json({ project: updated, concepts })
  } catch (err) {
    console.error(err)
    const status = err.status || (err.message?.includes('No AI provider') ? 503 : 500)
    res.status(status).json({ error: err.message || 'Failed to generate design concepts' })
  }
})

// POST /projects/:id/select-design — either { conceptIndex } to pick one
// of the generated concepts, or { importedDescription } for the "Import
// Design" path.
//
// HONESTY NOTE (also stated in the frontend copy): the active Groq model
// (llama-3.3-70b-versatile) is text-only — it cannot see or analyze the
// pixels of an uploaded screenshot. "Import Design" accepts an uploaded
// reference file for the Owner's own use, but the design guidance itself
// comes from the Owner's own WRITTEN description of that reference, not
// from real visual/image analysis. This is stated plainly rather than
// implying a vision capability that doesn't exist in the active provider.
router.post('/projects/:id/select-design', requireAuth, async (req, res) => {
  try {
    const project = await prisma.websiteProject.findUnique({ where: { id: req.params.id } })
    if (!project) return res.status(404).json({ error: 'Website project not found' })

    const { conceptIndex, importedDescription } = req.body || {}
    let chosen, designSource

    if (importedDescription?.trim()) {
      designSource = 'imported'
      chosen = { name: 'Imported Reference', style: 'From uploaded reference', colors: '', typography: '', description: importedDescription.trim() }
    } else {
      const concepts = JSON.parse(project.designConcepts || '[]')
      if (conceptIndex === undefined || !concepts[conceptIndex]) return res.status(400).json({ error: 'Invalid conceptIndex — generate design concepts first.' })
      designSource = 'generated'
      chosen = concepts[conceptIndex]
    }

    // Merge into designPlan — the EXISTING field buildCodeGenPrompt()
    // already reads, so code generation respects this choice with zero
    // changes to the code-gen prompt itself.
    let designPlan = {}
    try { designPlan = JSON.parse(project.designPlan || '{}') } catch { designPlan = {} }
    designPlan = { ...designPlan, colors: chosen.colors || designPlan.colors, typography: chosen.typography || designPlan.typography, styleDirection: chosen.description }

    const updated = await prisma.websiteProject.update({
      where: { id: project.id },
      data: { designSource, selectedDesignConcept: JSON.stringify(chosen), designPlan: JSON.stringify(designPlan) }
    })
    res.json({ project: updated })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to select design' })
  }
})

router.post('/projects', requireAuth, async (req, res) => {
  try {
    const { websiteType, requirementsText, stageId } = req.body || {}
    const project = await generatePlanCore({ websiteType, requirementsText, stageId })
    res.status(201).json({ project })
  } catch (err) {
    console.error(err)
    const status = err.status || (err.message?.includes('No AI provider') ? 503 : 500)
    res.status(status).json({ error: err.message || 'Failed to generate website plan' })
  }
})

router.patch('/projects/:id', requireAuth, async (req, res) => {
  try {
    if (req.body?.status && !STATUSES.includes(req.body.status)) return res.status(400).json({ error: 'Invalid status' })
    const project = await prisma.websiteProject.update({ where: { id: req.params.id }, data: { status: req.body.status } })
    res.json({ project })
  } catch (err) {
    console.error(err)
    res.status(404).json({ error: 'Website project not found' })
  }
})

// Extracted (Phase 15) — same reasoning as generatePlanCore above.
async function sendToAutomationCore(projectId, capability) {
  const project = await prisma.websiteProject.findUnique({ where: { id: projectId } })
  if (!project) { const err = new Error('Website project not found'); err.status = 404; throw err }

  const job = await createDeploymentAutomationJob(project, capability)
  const updated = await prisma.websiteProject.update({ where: { id: project.id }, data: { automationJobId: job.id } })
  return { project: updated, job }
}

router.post('/projects/:id/send-to-automation', requireAuth, async (req, res) => {
  try {
    const { project, job } = await sendToAutomationCore(req.params.id, req.body?.capability)
    res.json({ project, job })
  } catch (err) {
    console.error(err)
    res.status(err.status || 500).json({ error: err.message || 'Failed to send plan to the Automation Engine' })
  }
})

// ---------------------------------------------------------------------------
// PHASE 11 — WEBSITE AI V2: EXECUTION MANAGER
// ---------------------------------------------------------------------------
// Website AI now breaks a plan into 10 real WorkflowStage rows and assigns
// them to the EXISTING Website Department employees. It never bypasses the
// Workflow Engine: every phase below is created via the exact same Prisma
// shapes routes/workflows.js's own POST /:id/stages handler uses, and
// dependencies are real WorkflowDependency rows the Workflow Engine already
// enforces (a phase can't move to "Working" until the one before it is
// "Completed" — checked in routes/workflows.js, unchanged).

async function getWebsiteDepartment() {
  return prisma.department.findUnique({ where: { key: 'website' } })
}

// Shared by the original send-to-automation endpoint (V1) and the new
// publish-confirmation flow (V3) — one place creates the AutomationJob,
// not two copies of the same logic.
async function createDeploymentAutomationJob(project, capability, message) {
  const job = await prisma.automationJob.create({
    data: {
      module: 'website',
      capability: capability || 'Prepare Deployment',
      status: 'Queued',
      workflowId: project.workflowId,
      stageId: project.stageId,
      employeeLabel: project.employeeLabel,
      directorLabel: project.directorLabel
    }
  })
  await prisma.automationLog.create({
    data: {
      jobId: job.id, module: 'website', workflowId: project.workflowId,
      employeeLabel: project.employeeLabel, directorLabel: project.directorLabel,
      status: 'Queued', message: message || `Sent from Website AI plan: "${project.websiteType}"`
    }
  })
  return job
}

async function getPhasesWithStages(projectId) {
  const phases = await prisma.websitePhase.findMany({ where: { projectId }, orderBy: { order: 'asc' } })
  const stageIds = phases.map((p) => p.stageId)
  const stages = await prisma.workflowStage.findMany({
    where: { id: { in: stageIds } },
    include: { blockedBy: { include: { blockingStage: true } } }
  })
  const stageById = Object.fromEntries(stages.map((s) => [s.id, s]))
  return phases.map((p) => ({ ...p, stage: stageById[p.stageId] || null }))
}

// Extracted (Phase 15) — same reasoning as generatePlanCore above: the
// autonomous handoff calls this directly, no HTTP round-trip, no duplicated
// "break into phases" logic.
async function startExecutionCore(projectId) {
  const project = await prisma.websiteProject.findUnique({ where: { id: projectId } })
  if (!project) { const err = new Error('Website project not found'); err.status = 404; throw err }

  const existingPhases = await prisma.websitePhase.count({ where: { projectId: project.id } })
  if (existingPhases > 0) { const err = new Error('Execution has already started for this project.'); err.status = 400; throw err }

  const department = await getWebsiteDepartment()
  if (!department) { const err = new Error('Website department not seeded yet'); err.status = 500; throw err }
  const director = await prisma.employee.findFirst({ where: { level: 'director', departmentId: department.id } })

  let workflowId = project.workflowId
  if (!workflowId) {
    const workflow = await prisma.workflow.create({
      data: {
        title: `Website: ${project.websiteType}${project.clientLabel ? ` for ${project.clientLabel}` : ''}`,
        description: project.requirementsText || '',
        departmentKey: 'website',
        priority: 'Medium',
        status: 'Assigned'
      }
    })
    await logHistory({ workflowId: workflow.id, action: 'Created', toStatus: 'Assigned', actorLabel: 'Website AI (as CEO delegate)', department: 'website' })
    workflowId = workflow.id
  }

  const createdPhases = []
  for (let i = 0; i < WEBSITE_PHASES.length; i++) {
    const phaseSpec = WEBSITE_PHASES[i]
    const employee = await prisma.employee.findFirst({ where: { name: phaseSpec.employeeName, departmentId: department.id } })

    const stage = await prisma.workflowStage.create({
      data: {
        workflowId,
        title: phaseSpec.name,
        description: phaseSpec.description,
        assigneeEmployeeId: employee?.id || null,
        assigneeLabel: employee?.name || '',
        priority: 'Medium',
        status: employee ? 'Assigned' : 'Created',
        order: i
      }
    })

    if (employee) {
      await prisma.workflowAssignment.create({
        data: { stageId: stage.id, assigneeEmployeeId: employee.id, assigneeLabel: employee.name, assignedByLabel: director?.name || 'Website AI', role: 'employee' }
      })
      await notify({ workflowId, recipientLabel: employee.name, recipientEmployeeId: employee.id, message: `Website AI assigned you: "${phaseSpec.name}"`, type: 'info' })
    }
    await logHistory({ workflowId, stageId: stage.id, action: 'Created', toStatus: stage.status, actorLabel: 'Website AI', department: 'website' })

    if (i > 0) {
      await prisma.workflowDependency.create({
        data: { blockingStageId: createdPhases[i - 1].stage.id, dependentStageId: stage.id }
      })
    }

    const phase = await prisma.websitePhase.create({
      data: { projectId: project.id, stageId: stage.id, phaseName: phaseSpec.name, order: i }
    })
    createdPhases.push({ phase, stage })
  }

  const checklist = QUALITY_CHECKLIST_ITEMS.map((name) => ({ name, checked: false }))
  return prisma.websiteProject.update({
    where: { id: project.id },
    data: { workflowId, currentPhase: WEBSITE_PHASES[0].name, qualityChecklist: JSON.stringify(checklist) }
  })
}

// POST /api/website-ai/projects/:id/start-execution — the one-time
// "break into phases + assign to employees" action.
router.post('/projects/:id/start-execution', requireAuth, async (req, res) => {
  try {
    const updated = await startExecutionCore(req.params.id)
    res.status(201).json({ project: updated })
  } catch (err) {
    console.error(err)
    res.status(err.status || 500).json({ error: err.message || 'Failed to start execution' })
  }
})

// GET /api/website-ai/projects/:id/progress — real, computed from the
// actual WorkflowStage rows behind each phase. Nothing here is invented.
//
// Phase 16 (tasks 2, 3, 5): this is also where the Build Engine and
// Execution Engine become fully automatic. Once every phase is really
// Completed (via the real approval flow — never bypassed), this endpoint
// itself triggers real code generation and a real Automation Engine job,
// with zero Owner click. It intentionally does this HERE rather than by
// editing routes/workflowApprovals.js or routes/automationEngine.js (both
// explicitly off-limits this phase) — reusing generateCodeCore and
// sendToAutomationCore, the exact same functions a manual click calls, so
// there is still only one implementation of each, never a duplicate.
router.get('/projects/:id/progress', requireAuth, async (req, res) => {
  try {
    let project = await prisma.websiteProject.findUnique({ where: { id: req.params.id } })
    if (!project) return res.status(404).json({ error: 'Website project not found' })

    const phases = await getPhasesWithStages(project.id)
    if (phases.length === 0) return res.json({ started: false, buildStage: 'Planning' })

    const completed = phases.filter((p) => p.stage?.status === 'Completed')
    const blocked = phases.filter((p) => p.stage?.blockedBy?.some((d) => d.blockingStage?.status !== 'Completed') && p.stage?.status !== 'Completed')
    const currentPhase = phases.find((p) => p.stage?.status !== 'Completed')?.phaseName || phases[phases.length - 1].phaseName
    const overallProgress = Math.round((completed.length / phases.length) * 100)

    // Real, computed execution state — not a stored/guessable field.
    let buildStage = 'Planning'
    let autoBuildNote = null
    if (overallProgress === 100) {
      if (!project.codeGeneratedAt) {
        // Real automatic build — the one place "no Owner click" happens
        // for the manual (non-autonomous-sales) path.
        buildStage = 'Packaging'
        try {
          const result = await generateCodeCore(project.id, { codeStack: AUTO_BUILD_CODE_STACK, mode: 'ai' })
          project = result.project
          autoBuildNote = `Automatically generated ${result.fileCount} files (${AUTO_BUILD_CODE_STACK}) — all 10 phases completed.`
        } catch (err) {
          autoBuildNote = `Automatic build failed: ${err.message}. Retry from the Build tab.`
        }
      }
      if (project.codeGeneratedAt && !project.automationJobId) {
        try {
          await sendToAutomationCore(project.id, 'Prepare Deployment')
          project = await prisma.websiteProject.findUnique({ where: { id: project.id } })
        } catch (err) {
          autoBuildNote = (autoBuildNote ? autoBuildNote + ' ' : '') + `Automatic Automation Engine handoff failed: ${err.message}.`
        }
      }
      buildStage = project.publishConfirmed ? 'Completed' : project.codeGeneratedAt ? 'Deploy Ready' : 'Packaging'
    } else if (completed.length > 0 || phases.some((p) => p.stage?.status === 'Working')) {
      buildStage = 'Building'
    }

    const employees = phases
      .filter((p) => p.stage?.assigneeEmployeeId)
      .map((p) => {
        const spec = WEBSITE_PHASES.find((w) => w.name === p.phaseName)
        const unmetDeps = (p.stage.blockedBy || []).filter((d) => d.blockingStage?.status !== 'Completed')
        return {
          employeeLabel: p.stage.assigneeLabel,
          currentObjective: spec?.description || '',
          currentDeliverable: spec?.deliverable || '',
          currentPhase: p.phaseName,
          priority: p.stage.priority,
          deadline: p.stage.dueDate,
          dependencies: unmetDeps.map((d) => d.blockingStage.title),
          status: p.stage.status,
          progress: STATUS_PROGRESS[p.stage.status] ?? 0
        }
      })

    res.json({
      started: true,
      buildStage,
      autoBuildNote,
      overallProgress,
      completedTasks: completed.length,
      pendingTasks: phases.length - completed.length - blocked.length,
      blockedTasks: blocked.length,
      currentPhase,
      remainingWork: phases.filter((p) => p.stage?.status !== 'Completed').map((p) => p.phaseName),
      employees
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to compute progress' })
  }
})

// PATCH /api/website-ai/projects/:id/quality-checklist — toggle one item.
// Framework only — checking an item never verifies anything for real.
router.patch('/projects/:id/quality-checklist', requireAuth, async (req, res) => {
  try {
    const project = await prisma.websiteProject.findUnique({ where: { id: req.params.id } })
    if (!project) return res.status(404).json({ error: 'Website project not found' })
    if (!req.body?.name || typeof req.body.checked !== 'boolean') return res.status(400).json({ error: 'name and checked are required' })

    let checklist = []
    try { checklist = JSON.parse(project.qualityChecklist || '[]') } catch { checklist = [] }
    if (checklist.length === 0) checklist = QUALITY_CHECKLIST_ITEMS.map((name) => ({ name, checked: false }))

    checklist = checklist.map((item) => item.name === req.body.name ? { ...item, checked: req.body.checked } : item)

    const updated = await prisma.websiteProject.update({ where: { id: project.id }, data: { qualityChecklist: JSON.stringify(checklist) } })
    res.json({ project: updated })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to update quality checklist' })
  }
})

// GET /api/website-ai/projects/:id/report — the structured Website Report,
// entirely from real data. No LLM call here on purpose — a report about
// what's done, pending, and blocked should be exactly as reliable as the
// database, not dependent on a model call succeeding.
router.get('/projects/:id/report', requireAuth, async (req, res) => {
  try {
    const project = await prisma.websiteProject.findUnique({ where: { id: req.params.id } })
    if (!project) return res.status(404).json({ error: 'Website project not found' })

    const phases = await getPhasesWithStages(project.id)
    let checklist = []
    try { checklist = JSON.parse(project.qualityChecklist || '[]') } catch { checklist = [] }

    const completedWork = phases.filter((p) => p.stage?.status === 'Completed').map((p) => ({ phase: p.phaseName, employee: p.stage.assigneeLabel }))
    const blockedWork = phases.filter((p) => p.stage?.blockedBy?.some((d) => d.blockingStage?.status !== 'Completed') && p.stage?.status !== 'Completed').map((p) => p.phaseName)
    const pendingWork = phases.filter((p) => p.stage?.status !== 'Completed' && !blockedWork.includes(p.phaseName)).map((p) => p.phaseName)
    const assignedEmployees = [...new Set(phases.filter((p) => p.stage?.assigneeLabel).map((p) => p.stage.assigneeLabel))]
    const checklistComplete = checklist.length > 0 && checklist.every((c) => c.checked)
    const deploymentPhaseDone = phases.find((p) => p.phaseName === 'Deployment Preparation')?.stage?.status === 'Completed'

    const summary = phases.length === 0
      ? 'Execution has not started for this project yet.'
      : `${project.websiteType}${project.clientLabel ? ` for ${project.clientLabel}` : ''} is ${Math.round((completedWork.length / phases.length) * 100)}% complete across ${phases.length} phases — ${completedWork.length} completed, ${pendingWork.length} pending, ${blockedWork.length} blocked.`

    res.json({
      projectSummary: summary,
      completedWork,
      pendingWork,
      blockedWork,
      assignedEmployees,
      qualityChecklist: checklist,
      deploymentReadiness: {
        ready: deploymentPhaseDone && checklistComplete,
        deploymentPhaseDone: !!deploymentPhaseDone,
        checklistComplete
      }
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to generate report' })
  }
})

router.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const projects = await prisma.websiteProject.findMany()
    const byStatus = STATUSES.reduce((acc, s) => ({ ...acc, [s]: projects.filter((p) => p.status === s).length }), {})
    const current = projects.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0] || null

    let currentProgress = null
    if (current) {
      const phases = await getPhasesWithStages(current.id)
      if (phases.length > 0) {
        const completed = phases.filter((p) => p.stage?.status === 'Completed')
        let checklist = []
        try { checklist = JSON.parse(current.qualityChecklist || '[]') } catch { checklist = [] }
        currentProgress = {
          overallProgress: Math.round((completed.length / phases.length) * 100),
          currentPhase: current.currentPhase,
          assignedEmployees: [...new Set(phases.filter((p) => p.stage?.assigneeLabel).map((p) => p.stage.assigneeLabel))],
          completedTasks: completed.length,
          pendingTasks: phases.length - completed.length,
          qualityStatus: `${checklist.filter((c) => c.checked).length}/${checklist.length || QUALITY_CHECKLIST_ITEMS.length}`
        }
      }
    }

    res.json({ total: projects.length, byStatus, current, currentProgress })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load Website AI dashboard' })
  }
})

// GET /api/website-ai/dashboard/ceo — Website Department status across ALL
// projects with execution started. New endpoint; CEO Brain itself untouched.
router.get('/dashboard/ceo', requireAuth, async (req, res) => {
  try {
    const projects = await prisma.websiteProject.findMany()
    const allPhaseSets = await Promise.all(projects.map((p) => getPhasesWithStages(p.id)))
    const started = allPhaseSets.filter((phases) => phases.length > 0)

    let totalPhases = 0, totalCompleted = 0, totalBlocked = 0
    const workloadByEmployee = {}
    for (const phases of started) {
      totalPhases += phases.length
      totalCompleted += phases.filter((p) => p.stage?.status === 'Completed').length
      totalBlocked += phases.filter((p) => p.stage?.blockedBy?.some((d) => d.blockingStage?.status !== 'Completed') && p.stage?.status !== 'Completed').length
      for (const p of phases) {
        if (!p.stage?.assigneeLabel) continue
        workloadByEmployee[p.stage.assigneeLabel] = (workloadByEmployee[p.stage.assigneeLabel] || 0) + (p.stage.status !== 'Completed' ? 1 : 0)
      }
    }

    const completionPct = totalPhases > 0 ? Math.round((totalCompleted / totalPhases) * 100) : 0
    const projectHealth = totalPhases === 0 ? 'No active projects' : totalBlocked === 0 ? 'Healthy' : 'Needs Attention'

    res.json({
      departmentStatus: started.length > 0 ? 'Active' : 'Idle',
      activeProjects: started.length,
      projectHealth,
      teamWorkload: Object.entries(workloadByEmployee).map(([employee, activeTasks]) => ({ employee, activeTasks })),
      completionPercentage: completionPct
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load Website AI CEO dashboard' })
  }
})

// ---------------------------------------------------------------------------
// PHASE 12 — WEBSITE AI V3: REAL CODE GENERATION + PUBLISH FLOW
// ---------------------------------------------------------------------------
// Global Cost Optimization Rule in action: this endpoint supports BOTH a
// FREE deterministic path (no AI call, boilerplate scaffolded straight from
// the plan already stored on this project — zero marginal cost) and a PAID
// AI path (one real, usage-tracked LLM call). The AI path deliberately
// reuses the plan's own pages/sections/components/designPlan/assetPlan
// fields already generated in Phase 10 rather than re-gathering full
// context again — avoiding a second round of Company Brain/Operating
// Manual/Memory Engine reads and a second requirements-analysis call.
//
// This is also the ONE place in Website AI that is explicitly ALLOWED to
// produce real code — the Phase 10 planning endpoint's looksLikeCode()
// guard is untouched and still rejects code from the PLANNING call.

function buildFreeScaffold(project, codeStack) {
  const pages = JSON.parse(project.pages || '[]')
  const components = JSON.parse(project.components || '[]')
  const isReact = codeStack.startsWith('React') || codeStack.startsWith('Next.js')
  const siteName = project.websiteType
  const navLinks = pages.length ? pages : [{ name: 'Home', purpose: 'Landing page' }]
  const files = []

  // Local (Free) mode is deliberately zero-cost and deterministic (no AI
  // call) — but "free" doesn't mean "empty." This produces a real,
  // complete, working static site: real navigation between every planned
  // page, a real (if generic) responsive layout, and real placeholder
  // images via a genuinely loadable external service — nothing here is a
  // dead link or a bare TODO comment.
  if (!isReact) {
    const navHtml = navLinks.map((p, i) => `<a href="${i === 0 ? 'index' : p.name.toLowerCase().replace(/\s+/g, '-')}.html">${p.name}</a>`).join('\n        ')
    navLinks.forEach((p, i) => {
      const fileName = i === 0 ? 'index.html' : `${p.name.toLowerCase().replace(/\s+/g, '-')}.html`
      files.push({
        path: fileName,
        content: `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${p.name} — ${siteName}</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header class="site-header">
    <div class="logo">${siteName}</div>
    <nav>
        ${navHtml}
    </nav>
  </header>
  <main>
    <section class="hero">
      <h1>${p.name}</h1>
      <p>${p.purpose || `Welcome to the ${p.name} page.`}</p>
      <img src="https://placehold.co/800x400?text=${encodeURIComponent(p.name)}" alt="${p.name}" class="hero-image">
    </section>
    ${components.slice(0, 3).map((c) => `<section class="component"><h2>${c.name}</h2><p>${c.description || ''}</p></section>`).join('\n    ')}
  </main>
  <footer class="site-footer">
    <p>&copy; ${new Date().getFullYear()} ${siteName}. All rights reserved.</p>
  </footer>
  <script src="script.js"></script>
</body>
</html>`
      })
    })

    files.push({
      path: 'styles.css',
      content: `:root { --ink: #0A0A0B; --paper: #FFFFFF; --accent: #14B8A6; --mist: #F6F7F7; --line: #E6E8E8; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--ink); background: var(--paper); line-height: 1.6; }
.site-header { display: flex; align-items: center; justify-content: space-between; padding: 1.5rem 2rem; border-bottom: 1px solid var(--line); }
.logo { font-weight: 700; font-size: 1.25rem; }
nav { display: flex; gap: 1.5rem; }
nav a { color: var(--ink); text-decoration: none; font-size: 0.95rem; }
nav a:hover { color: var(--accent); }
main { max-width: 1000px; margin: 0 auto; padding: 3rem 1.5rem; }
.hero { text-align: center; padding: 3rem 1rem; }
.hero h1 { font-size: 2.5rem; margin-bottom: 1rem; }
.hero p { color: #555; max-width: 600px; margin: 0 auto 2rem; }
.hero-image { max-width: 100%; border-radius: 12px; }
.component { padding: 2rem 0; border-top: 1px solid var(--line); }
.site-footer { text-align: center; padding: 2rem; color: #888; font-size: 0.85rem; border-top: 1px solid var(--line); }
@media (max-width: 640px) { .site-header { flex-direction: column; gap: 1rem; } nav { flex-wrap: wrap; justify-content: center; } }`
    })

    files.push({
      path: 'script.js',
      content: `// Real, working (if simple) interactivity — Local (Free) mode, no AI call made.
document.addEventListener('DOMContentLoaded', () => {
  const links = document.querySelectorAll('nav a')
  const current = window.location.pathname.split('/').pop() || 'index.html'
  links.forEach((link) => { if (link.getAttribute('href') === current) link.style.color = 'var(--accent)' })
})`
    })
  } else {
    files.push({ path: 'src/index.css', content: `body { font-family: sans-serif; margin: 0; color: #0A0A0B; }\n.container { max-width: 1000px; margin: 0 auto; padding: 2rem; }\n.nav { display: flex; gap: 1.5rem; padding: 1.5rem; border-bottom: 1px solid #E6E8E8; }` })
    files.push({
      path: 'src/App.jsx',
      content: `import { useState } from 'react'
import './index.css'
${pages.map((p) => `import ${p.name.replace(/\s+/g, '')} from './pages/${p.name.replace(/\s+/g, '')}'`).join('\n')}

const PAGES = [${pages.map((p) => `{ name: '${p.name}', Component: ${p.name.replace(/\s+/g, '')} }`).join(', ')}]

export default function App() {
  const [active, setActive] = useState(0)
  const Current = PAGES[active]?.Component || (() => <div>No pages planned yet.</div>)
  return (
    <div>
      <nav className="nav">
        {PAGES.map((p, i) => (
          <button key={p.name} onClick={() => setActive(i)} style={{ fontWeight: i === active ? 700 : 400 }}>{p.name}</button>
        ))}
      </nav>
      <div className="container"><Current /></div>
    </div>
  )
}`
    })
    for (const p of pages) {
      const compName = p.name.replace(/\s+/g, '')
      files.push({
        path: `src/pages/${compName}.jsx`,
        content: `export default function ${compName}() {
  return (
    <section>
      <h1>${p.name}</h1>
      <p>${p.purpose || ''}</p>
      <img src="https://placehold.co/800x400?text=${encodeURIComponent(p.name)}" alt="${p.name}" style={{ maxWidth: '100%', borderRadius: 12 }} />
    </section>
  )
}`
      })
    }
    for (const c of components) {
      const compName = c.name.replace(/\s+/g, '')
      files.push({
        path: `src/components/${compName}.jsx`,
        content: `export default function ${compName}() {
  return (
    <div className="${compName.toLowerCase()}">
      <h3>${c.name}</h3>
      <p>${c.description || ''}</p>
    </div>
  )
}`
      })
    }
  }
  return files
}

function buildCodeGenPrompt(project, codeStack) {
  const fileExpectation = codeStack.startsWith('React') || codeStack.startsWith('Next.js')
    ? '- src/App.jsx (or app/page.jsx for Next.js) importing every page\n- src/pages/*.jsx or app/*/page.jsx — one real file per planned page\n- src/components/*.jsx — one real file per planned component\n- src/index.css (or globals.css) with complete, real styling — not a one-line stub'
    : '- index.html plus one .html file per additional planned page, all linked via real <nav> markup\n- styles.css — complete, real, responsive CSS (not a one-line stub)\n- script.js — real, working interactivity, even if simple'

  return `You are Website AI, generating REAL, COMPLETE, working ${codeStack} code for a website — this is the one situation where you ARE allowed to write actual code (unlike planning, which never contains code).

Use this EXISTING plan — do not re-analyze requirements, it's already done:
Pages: ${project.pages}
Sections: ${project.sections}
Components: ${project.components}
Design Plan: ${project.designPlan}
Responsive Plan: ${project.responsivePlan}
Asset Plan (reference only, do not invent new asset URLs): ${project.assetPlan}

## Required file structure for ${codeStack}
${fileExpectation}

## Hard requirements
- NO empty files, NO bare "TODO" comments standing in for whole sections, NO single-line stub files. Every file must contain real, complete, working code a browser (or bundler, for React/Next.js) could actually run.
- For any image the plan calls for, use a real, genuinely loadable placeholder URL in this exact form: https://placehold.co/WIDTHxHEIGHT?text=Label — never a fake/broken path like "image1.jpg" with no source.
- Write real, complete CSS (colors, spacing, responsive breakpoints) — not a single selector.
- Write real page copy based on the plan's purpose fields — placeholder-style text ("Lorem ipsum") is acceptable for body copy the plan didn't specify exactly, but headings/navigation must use the plan's real page and section names.
- For the vanilla stack, use real relative links between the generated HTML files (e.g. href="about.html") so navigation actually works.

Respond with ONLY a JSON object: { "files": [{ "path": "relative/file/path", "content": "full file content" }] }. No commentary outside the JSON.`
}

// Extracted (Phase 15) — same reasoning as generatePlanCore above.
async function generateCodeCore(projectId, { codeStack, mode }) {
  const project = await prisma.websiteProject.findUnique({ where: { id: projectId } })
  if (!project) { const err = new Error('Website project not found'); err.status = 404; throw err }
  if (!CODE_STACKS.includes(codeStack)) { const err = new Error('Invalid codeStack'); err.status = 400; throw err }
  if (!['free', 'ai'].includes(mode)) { const err = new Error('mode must be "free" or "ai"'); err.status = 400; throw err }

  let files, usageEntry = null

  if (mode === 'free') {
    files = buildFreeScaffold(project, codeStack)
  } else {
    const system = buildCodeGenPrompt(project, codeStack)
    const { text, usage } = await generateTextWithUsage(system, [{ role: 'user', content: 'Generate the files now, as the JSON object only.' }], 8192)
    let parsed
    try {
      parsed = extractJson(text)
    } catch (err) {
      console.error('[websiteAI] Failed to parse the code-generation response. Raw model output length:', text?.length || 0)
      console.error('[websiteAI] Real parse error:', err.message)
      const e = new Error('Website AI code response was not valid JSON — try again.'); e.status = 502; throw e
    }
    files = parsed.files || []
    usageEntry = { action: `generate-code (${codeStack})`, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, at: new Date().toISOString() }
  }

  let usageLog = []
  try { usageLog = JSON.parse(project.apiUsageLog || '[]') } catch { usageLog = [] }
  if (usageEntry) usageLog.push(usageEntry)

  const updated = await prisma.websiteProject.update({
    where: { id: project.id },
    data: {
      codeStack, codeGenMode: mode, generatedFiles: JSON.stringify(files),
      codeGeneratedAt: new Date(), apiUsageLog: JSON.stringify(usageLog),
      previewToken: project.previewToken || `pv_${project.id}`
    }
  })
  return { project: updated, fileCount: files.length }
}

router.post('/projects/:id/generate-code', requireAuth, async (req, res) => {
  try {
    const { codeStack, mode } = req.body || {}
    const result = await generateCodeCore(req.params.id, { codeStack, mode })
    res.status(201).json(result)
  } catch (err) {
    console.error(err)
    const status = err.status || (err.message?.includes('No AI provider') ? 503 : 500)
    res.status(status).json({ error: err.message || 'Failed to generate code' })
  }
})

// GET /api/website-ai/projects/:id/preview — returns the generated files.
// Real live rendering is only meaningful for the vanilla HTML/CSS/JS stack
// (returned as srcDoc-able HTML); React/Next.js stacks return source for
// review, not a bundled live preview — building a real bundler is outside
// this framework's scope, and pretending to preview un-bundled JSX would
// be dishonest.
router.get('/projects/:id/preview', requireAuth, async (req, res) => {
  try {
    const project = await prisma.websiteProject.findUnique({ where: { id: req.params.id } })
    if (!project) return res.status(404).json({ error: 'Website project not found' })

    const files = JSON.parse(project.generatedFiles || '[]')
    const htmlFile = files.find((f) => f.path === 'index.html')
    res.json({ files, previewableHtml: htmlFile?.content || null, codeStack: project.codeStack })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load preview' })
  }
})

// GET /api/website-ai/projects/:id/download — a real ZIP of the generated
// files, built with a pure-JS archiver (no shell-out, no child_process).
// This packages files for the Owner; it does not deploy anything anywhere.
router.get('/projects/:id/download', requireAuth, async (req, res) => {
  try {
    const project = await prisma.websiteProject.findUnique({ where: { id: req.params.id } })
    if (!project) return res.status(404).json({ error: 'Website project not found' })

    const files = JSON.parse(project.generatedFiles || '[]')
    if (files.length === 0) return res.status(400).json({ error: 'No generated files yet — generate code first.' })

    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${project.websiteType.replace(/\s+/g, '-').toLowerCase()}.zip"`)

    const archive = archiver('zip', { zlib: { level: 9 } })
    archive.on('error', (err) => { console.error(err); res.status(500).end() })
    archive.pipe(res)
    for (const f of files) archive.append(f.content, { name: f.path })
    archive.finalize()
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to build download package' })
  }
})

// POST /api/website-ai/projects/:id/request-publish — step 1 of the
// mandatory two-step confirmation. Does nothing except ask.
router.post('/projects/:id/request-publish', requireAuth, async (req, res) => {
  try {
    const project = await prisma.websiteProject.findUnique({ where: { id: req.params.id } })
    if (!project) return res.status(404).json({ error: 'Website project not found' })

    const updated = await prisma.websiteProject.update({ where: { id: project.id }, data: { publishRequested: true } })
    res.json({
      project: updated,
      confirmationPrompt: 'Are you sure you want to publish this website?',
      providers: DEPLOYMENT_PROVIDERS
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to start the publish request' })
  }
})

// POST /api/website-ai/projects/:id/confirm-publish — step 2. ONLY on an
// explicit confirm:true does anything happen. This is the one function in
// the whole system where "never publish automatically" is load-bearing, so
// it's enforced directly, not just documented: confirm must be the literal
// boolean true. As of Phase 15, a YES with a configured provider token
// (VERCEL_TOKEN or NETLIFY_TOKEN) triggers a REAL deployment call — not a
// framework-only label anymore for those two providers specifically. For
// every other provider, or if no token is configured, this is reported
// honestly rather than faked.
router.post('/projects/:id/confirm-publish', requireAuth, async (req, res) => {
  try {
    const project = await prisma.websiteProject.findUnique({ where: { id: req.params.id } })
    if (!project) return res.status(404).json({ error: 'Website project not found' })
    if (!project.publishRequested) return res.status(400).json({ error: 'Call request-publish first.' })

    if (req.body?.confirm !== true) {
      const updated = await prisma.websiteProject.update({ where: { id: project.id }, data: { publishRequested: false } })
      return res.json({ project: updated, published: false, message: 'Publish cancelled — nothing was sent to the Automation Engine.' })
    }

    const provider = req.body?.deploymentProvider
    if (!DEPLOYMENT_PROVIDERS.some((p) => p.key === provider)) return res.status(400).json({ error: 'Invalid deploymentProvider' })

    let deployResult = null, deployError = null
    if (provider === 'vercel' || provider === 'netlify') {
      const deployment = require('../lib/deploymentProviders')
      try {
        const files = JSON.parse(project.generatedFiles || '[]')
        if (files.length === 0) throw new Error('No generated files to deploy — generate code first.')
        deployResult = provider === 'vercel'
          ? await deployment.deployToVercel(files, project.websiteType)
          : await deployment.deployToNetlify(files, project.websiteType)
      } catch (err) {
        deployError = err.message
      }
    } else {
      deployError = `Real deployment isn't implemented yet for "${provider}" — only Vercel and Netlify have real deployment API calls in this version.`
    }

    const job = await createDeploymentAutomationJob(
      project, 'Prepare Go Live',
      deployResult
        ? `Deployed live via ${provider}: ${deployResult.url}`
        : `Owner confirmed publish via ${provider} — ${deployError}`
    )
    const updated = await prisma.websiteProject.update({
      where: { id: project.id },
      data: {
        publishConfirmed: true, deploymentProvider: provider, automationJobId: job.id,
        deploymentSiteId: deployResult?.siteId || (provider === 'vercel' ? project.websiteType : '')
      }
    })

    res.json({ project: updated, published: true, job, deployedUrl: deployResult?.url || null, deployError })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to confirm publish' })
  }
})

// POST /api/website-ai/projects/:id/attach-domain — real domain attachment
// (task 6). Credential-gated, honest errors — SSL is auto-provisioned by
// both providers on domain verification, so there's no separate "enable
// SSL" call to make (documented, not invented).
router.post('/projects/:id/attach-domain', requireAuth, async (req, res) => {
  try {
    const project = await prisma.websiteProject.findUnique({ where: { id: req.params.id } })
    if (!project) return res.status(404).json({ error: 'Website project not found' })
    const { domain } = req.body || {}
    if (!domain?.trim()) return res.status(400).json({ error: 'domain is required' })
    if (!['vercel', 'netlify'].includes(project.deploymentProvider)) {
      return res.status(400).json({ error: 'Custom domain attachment requires this project to already be published via Vercel or Netlify.' })
    }

    const deployment = require('../lib/deploymentProviders')
    let result
    if (project.deploymentProvider === 'vercel') {
      result = await deployment.attachDomainToVercel(project.deploymentSiteId || project.websiteType, domain)
    } else if (project.deploymentProvider === 'netlify') {
      if (!project.deploymentSiteId) {
        return res.status(400).json({ error: 'No Netlify site ID on record for this project — it may have been deployed before this feature was added. Redeploy to attach a domain.' })
      }
      result = await deployment.attachDomainToNetlify(project.deploymentSiteId, domain)
    } else {
      return res.status(400).json({ error: 'Custom domain attachment requires this project to already be published via Vercel or Netlify.' })
    }

    res.json({ ok: true, ...result })
  } catch (err) {
    console.error(err)
    res.status(err.message?.includes('not configured') ? 503 : 500).json({ error: err.message || 'Domain attachment failed' })
  }
})

// GET /api/website-ai/projects/:id/deployment-status — real status tracking
// + deployment logs (task 6), reusing the Automation Engine's OWN
// AutomationJob/AutomationLog rows (created by sendToAutomationCore /
// confirm-publish) rather than a second, duplicate tracking model.
router.get('/projects/:id/deployment-status', requireAuth, async (req, res) => {
  try {
    const project = await prisma.websiteProject.findUnique({ where: { id: req.params.id } })
    if (!project) return res.status(404).json({ error: 'Website project not found' })
    if (!project.automationJobId) return res.json({ hasJob: false })

    const job = await prisma.automationJob.findUnique({
      where: { id: project.automationJobId },
      include: { logs: { orderBy: { createdAt: 'desc' } } }
    })
    res.json({
      hasJob: true,
      status: job?.status || null,
      provider: project.deploymentProvider,
      publishConfirmed: project.publishConfirmed,
      logs: job?.logs || []
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load deployment status' })
  }
})

router.get('/plan-tiers', requireAuth, async (req, res) => {
  res.json({ tiers: PLAN_TIERS, providers: DEPLOYMENT_PROVIDERS, codeStacks: CODE_STACKS })
})

module.exports = router
// Phase 15 — internal, reusable pipeline functions. Attached to the router
// export (not a separate module) so there is exactly one place this logic
// lives; lib/autoHandoff.js requires this same file and calls these
// directly — no duplicated plan/execution/code-generation logic between a
// manual Owner click and the autonomous Sales AI → Website AI handoff.
module.exports.internal = { generatePlanCore, startExecutionCore, generateCodeCore, sendToAutomationCore, createDeploymentAutomationJob }
