const express = require('express')
const prisma = require('../prismaClient')
const { requireAuth } = require('../middleware/auth')
const taskEngine = require('../taskEngine')

const router = express.Router()

router.post('/', requireAuth, async (req, res) => {
  try {
    const { goal, dependsOnTaskId } = req.body || {}
    if (!goal?.trim()) return res.status(400).json({ error: 'goal is required' })
    const task = await taskEngine.planTask(req.user.id, goal.trim())
    if (dependsOnTaskId) {
      await prisma.agentTask.update({ where: { id: task.id }, data: { status: 'WAITING_DEPENDENCY', dependsOnTaskId } })
    }
    res.status(201).json({ task })
  } catch (err) {
    console.error(err)
    res.status(err.status || 500).json({ error: err.message || 'Failed to plan task' })
  }
})

router.get('/', requireAuth, async (req, res) => {
  try {
    const tasks = await prisma.agentTask.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { steps: { orderBy: { order: 'asc' } } }
    })
    res.json({ tasks })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load tasks' })
  }
})

// The real live-timeline endpoint — the frontend polls this, not a
// websocket, matching the same polling pattern already used by
// EmailCampaigns' live dashboard elsewhere in this app.
router.get('/:id/live', requireAuth, async (req, res) => {
  try {
    const task = await prisma.agentTask.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: { steps: { orderBy: { order: 'asc' } }, checkpoints: { orderBy: { createdAt: 'desc' }, take: 5 } }
    })
    if (!task) return res.status(404).json({ error: 'Task not found' })
    const completedSteps = task.steps.filter((s) => s.status === 'SUCCESS').length
    res.json({ task, progressPct: task.steps.length > 0 ? Math.round((completedSteps / task.steps.length) * 100) : 0 })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load task' })
  }
})

router.post('/:id/pause', requireAuth, async (req, res) => {
  try {
    const task = await prisma.agentTask.findFirst({ where: { id: req.params.id, userId: req.user.id } })
    if (!task) return res.status(404).json({ error: 'Task not found' })
    res.json({ task: await taskEngine.pauseTask(task.id) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to pause task' })
  }
})

// Real emergency stop — distinct from pause. Aborts whatever real
// action is currently in flight for this task, not just prevents the
// next one.
router.post('/:id/stop', requireAuth, async (req, res) => {
  try {
    const task = await prisma.agentTask.findFirst({ where: { id: req.params.id, userId: req.user.id } })
    if (!task) return res.status(404).json({ error: 'Task not found' })
    res.json({ task: await taskEngine.stopTask(task.id) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to stop task' })
  }
})

router.post('/:id/resume', requireAuth, async (req, res) => {
  try {
    const task = await prisma.agentTask.findFirst({ where: { id: req.params.id, userId: req.user.id } })
    if (!task) return res.status(404).json({ error: 'Task not found' })
    res.json({ task: await taskEngine.resumeTask(task.id) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to resume task' })
  }
})

// Real approval — only advances a task genuinely sitting at
// WAITING_APPROVAL; never a generic "unpause" for anything else.
router.post('/:id/approve', requireAuth, async (req, res) => {
  try {
    const task = await prisma.agentTask.findFirst({ where: { id: req.params.id, userId: req.user.id } })
    if (!task) return res.status(404).json({ error: 'Task not found' })
    if (task.status !== 'WAITING_APPROVAL') return res.status(400).json({ error: 'This task is not waiting for approval.' })
    res.json({ task: await taskEngine.approveTask(task.id) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to approve task' })
  }
})

module.exports = router
