const express = require('express')
const prisma = require('../prismaClient')
const { requireAuth, requireOwner } = require('../middleware/auth')
const { AUTOMATION_MODULES, QUEUE_STATUSES, findModule } = require('../automationModules')

const router = express.Router()
const TERMINAL = ['Completed', 'Failed', 'Cancelled']

function validStatus(s) { return QUEUE_STATUSES.includes(s) }

async function logStep(job, status, message) {
  return prisma.automationLog.create({
    data: {
      jobId: job.id,
      module: job.module,
      workflowId: job.workflowId,
      employeeLabel: job.employeeLabel,
      directorLabel: job.directorLabel,
      status,
      result: job.result,
      message: message || `Moved to ${status}`
    }
  })
}

router.get('/', requireAuth, requireOwner, async (req, res) => {
  try {
    const where = req.query.module ? { module: req.query.module } : {}
    const jobs = await prisma.automationJob.findMany({ where, orderBy: { createdAt: 'desc' } })
    res.json({ jobs, modules: AUTOMATION_MODULES })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load automation jobs' })
  }
})

router.get('/:id', requireAuth, requireOwner, async (req, res) => {
  try {
    const job = await prisma.automationJob.findUnique({
      where: { id: req.params.id },
      include: { logs: { orderBy: { createdAt: 'desc' } } }
    })
    if (!job) return res.status(404).json({ error: 'Automation job not found' })
    res.json({ job })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load automation job' })
  }
})

router.post('/', requireAuth, requireOwner, async (req, res) => {
  try {
    const { module, capability, stageId } = req.body || {}
    const mod = findModule(module)
    if (!mod) return res.status(400).json({ error: 'Unknown automation module' })
    if (!capability || !mod.capabilities.includes(capability)) {
      return res.status(400).json({ error: `capability must be one of: ${mod.capabilities.join(', ') || '(none defined for this module)'}` })
    }

    let workflowId = null, departmentKey = '', employeeLabel = '', directorLabel = ''

    if (stageId) {
      const stage = await prisma.workflowStage.findUnique({ where: { id: stageId }, include: { workflow: true } })
      if (!stage) return res.status(404).json({ error: 'Linked stage not found' })
      workflowId = stage.workflowId
      departmentKey = stage.workflow.departmentKey
      employeeLabel = stage.assigneeLabel
      const director = await prisma.employee.findFirst({
        where: { level: 'director', department: { key: stage.workflow.departmentKey } }
      })
      directorLabel = director?.name || ''
    }

    const job = await prisma.automationJob.create({
      data: { module, capability, status: 'Queued', workflowId, stageId: stageId || null, departmentKey, employeeLabel, directorLabel }
    })
    await logStep(job, 'Queued', `Job created for "${capability}"`)

    res.status(201).json({ job })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to create automation job' })
  }
})

router.patch('/:id', requireAuth, requireOwner, async (req, res) => {
  try {
    const job = await prisma.automationJob.findUnique({ where: { id: req.params.id } })
    if (!job) return res.status(404).json({ error: 'Automation job not found' })

    const data = {}
    if (req.body?.status !== undefined) {
      if (!validStatus(req.body.status)) return res.status(400).json({ error: 'Invalid status' })
      data.status = req.body.status
      if (req.body.status === 'Executing' && !job.startedAt) data.startedAt = new Date()
      if (TERMINAL.includes(req.body.status) && !job.completedAt) data.completedAt = new Date()
    }
    if (req.body?.result !== undefined) data.result = req.body.result

    const updated = await prisma.automationJob.update({ where: { id: job.id }, data })

    if (data.status && data.status !== job.status) {
      await logStep(updated, data.status, req.body?.message)
    }

    res.json({ job: updated })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to update automation job' })
  }
})

router.get('/dashboard/owner', requireAuth, requireOwner, async (req, res) => {
  try {
    const jobs = await prisma.automationJob.findMany()
    const byStatus = QUEUE_STATUSES.reduce((acc, s) => ({ ...acc, [s]: jobs.filter((j) => j.status === s).length }), {})
    const pending = jobs.filter((j) => !TERMINAL.includes(j.status)).length
    const completed = jobs.filter((j) => j.status === 'Completed')
    const failed = jobs.filter((j) => j.status === 'Failed').length

    const durations = completed.filter((j) => j.startedAt && j.completedAt).map((j) => new Date(j.completedAt) - new Date(j.startedAt))
    const avgMs = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0

    res.json({
      totalJobs: jobs.length,
      byStatus,
      pending,
      completed: completed.length,
      failed,
      avgProcessingMinutes: Math.round(avgMs / 60000)
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load Owner automation dashboard' })
  }
})

router.get('/dashboard/ceo', requireAuth, requireOwner, async (req, res) => {
  try {
    const jobs = await prisma.automationJob.findMany()
    const departments = [...new Set(jobs.map((j) => j.departmentKey).filter(Boolean))]

    const departmentAutomation = departments.map((key) => {
      const deptJobs = jobs.filter((j) => j.departmentKey === key)
      return {
        departmentKey: key,
        total: deptJobs.length,
        pending: deptJobs.filter((j) => !TERMINAL.includes(j.status)).length,
        completed: deptJobs.filter((j) => j.status === 'Completed').length
      }
    })

    res.json({
      automationStatus: jobs.length ? 'Active' : 'Idle',
      departmentAutomation,
      pendingJobs: jobs.filter((j) => !TERMINAL.includes(j.status)).length,
      completedJobs: jobs.filter((j) => j.status === 'Completed').length
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load CEO automation dashboard' })
  }
})

module.exports = router
