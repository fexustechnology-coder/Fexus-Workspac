const express = require('express')
const prisma = require('../prismaClient')
const { requireAuth, requireOwner } = require('../middleware/auth')
const { logHistory, notify } = require('../lib/workflowHelpers')
const { LIFECYCLE, PRIORITIES, groupForStatus } = require('../workflowConstants')

const router = express.Router()

const DIRECT_STATUSES = new Set(LIFECYCLE.filter((s) => !['Waiting Approval', 'Approved', 'Completed'].includes(s)))

function validPriority(p) { return PRIORITIES.includes(p) }

async function departmentDirectorLabel(departmentKey) {
  const dept = await prisma.department.findUnique({ where: { key: departmentKey } })
  if (!dept) return { label: departmentKey, departmentId: null }
  const director = await prisma.employee.findFirst({ where: { level: 'director', departmentId: dept.id } })
  return { label: director?.name || dept.name, departmentId: dept.id, directorId: director?.id || null }
}

router.get('/', requireAuth, requireOwner, async (req, res) => {
  try {
    const workflows = await prisma.workflow.findMany({ include: { stages: true }, orderBy: { createdAt: 'desc' } })
    res.json({
      workflows: workflows.map((w) => ({
        ...w,
        group: groupForStatus(w.status),
        stageCount: w.stages.length,
        completedStages: w.stages.filter((s) => s.status === 'Completed').length,
        stages: w.stages.map((s) => ({
          id: s.id, title: s.title, status: s.status, assigneeEmployeeId: s.assigneeEmployeeId, assigneeLabel: s.assigneeLabel
        }))
      }))
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load workflows' })
  }
})

router.get('/:id', requireAuth, requireOwner, async (req, res) => {
  try {
    const workflow = await prisma.workflow.findUnique({
      where: { id: req.params.id },
      include: {
        stages: { include: { blockedBy: true, blocks: true, approvals: true }, orderBy: { order: 'asc' } },
        history: { orderBy: { createdAt: 'desc' } },
        activities: { orderBy: { createdAt: 'desc' } }
      }
    })
    if (!workflow) return res.status(404).json({ error: 'Workflow not found' })
    res.json({ workflow })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load workflow' })
  }
})

router.post('/', requireAuth, requireOwner, async (req, res) => {
  try {
    const { title, description, departmentKey, priority, startDate, dueDate, estimatedHours } = req.body || {}
    if (!title?.trim()) return res.status(400).json({ error: 'title is required' })
    if (!departmentKey) return res.status(400).json({ error: 'departmentKey is required' })
    if (priority && !validPriority(priority)) return res.status(400).json({ error: 'Invalid priority' })

    const { label: directorLabel } = await departmentDirectorLabel(departmentKey)

    const workflow = await prisma.workflow.create({
      data: {
        title: title.trim(),
        description: description || '',
        departmentKey,
        priority: priority || 'Medium',
        status: 'Created',
        startDate: startDate ? new Date(startDate) : null,
        dueDate: dueDate ? new Date(dueDate) : null,
        estimatedHours: Number(estimatedHours) || 0
      }
    })

    await logHistory({ workflowId: workflow.id, action: 'Created', toStatus: 'Created', actorLabel: 'Owner (as CEO)', department: departmentKey })
    await notify({ workflowId: workflow.id, recipientLabel: directorLabel, message: `New company task assigned to your department: "${workflow.title}"`, type: 'info' })

    res.status(201).json({ workflow })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to create workflow' })
  }
})

router.patch('/:id', requireAuth, requireOwner, async (req, res) => {
  try {
    const workflow = await prisma.workflow.findUnique({ where: { id: req.params.id } })
    if (!workflow) return res.status(404).json({ error: 'Workflow not found' })

    const data = {}
    if (req.body?.status !== undefined) {
      if (!DIRECT_STATUSES.has(req.body.status)) {
        return res.status(400).json({ error: `"${req.body.status}" can't be set directly — use the approval flow for review/approval states.` })
      }
      data.status = req.body.status
    }
    if (req.body?.priority !== undefined) {
      if (!validPriority(req.body.priority)) return res.status(400).json({ error: 'Invalid priority' })
      data.priority = req.body.priority
    }
    if (req.body?.dueDate !== undefined) data.dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null
    if (req.body?.actualHours !== undefined) data.actualHours = Number(req.body.actualHours) || 0

    const updated = await prisma.workflow.update({ where: { id: req.params.id }, data })

    if (data.status && data.status !== workflow.status) {
      await logHistory({
        workflowId: workflow.id, action: data.status, fromStatus: workflow.status, toStatus: data.status,
        actorLabel: 'Owner', department: workflow.departmentKey
      })
    }

    res.json({ workflow: updated })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to update workflow' })
  }
})

router.post('/:id/stages', requireAuth, requireOwner, async (req, res) => {
  try {
    const workflow = await prisma.workflow.findUnique({ where: { id: req.params.id } })
    if (!workflow) return res.status(404).json({ error: 'Workflow not found' })

    const { title, description, assigneeEmployeeId, priority, dueDate, estimatedHours } = req.body || {}
    if (!title?.trim()) return res.status(400).json({ error: 'title is required' })
    if (priority && !validPriority(priority)) return res.status(400).json({ error: 'Invalid priority' })

    let assigneeLabel = ''
    let role = 'employee'
    if (assigneeEmployeeId) {
      const emp = await prisma.employee.findUnique({ where: { id: assigneeEmployeeId } })
      assigneeLabel = emp?.name || ''
      role = emp?.level === 'director' ? 'director' : 'employee'
    }

    const { label: directorLabel } = await departmentDirectorLabel(workflow.departmentKey)
    const count = await prisma.workflowStage.count({ where: { workflowId: workflow.id } })

    const stage = await prisma.workflowStage.create({
      data: {
        workflowId: workflow.id,
        title: title.trim(),
        description: description || '',
        assigneeEmployeeId: assigneeEmployeeId || null,
        assigneeLabel,
        priority: priority || workflow.priority,
        status: assigneeEmployeeId ? 'Assigned' : 'Created',
        order: count,
        dueDate: dueDate ? new Date(dueDate) : null,
        estimatedHours: Number(estimatedHours) || 0
      }
    })

    if (assigneeEmployeeId) {
      await prisma.workflowAssignment.create({
        data: { stageId: stage.id, assigneeEmployeeId, assigneeLabel, assignedByLabel: directorLabel, role }
      })
      await notify({
        workflowId: workflow.id, recipientLabel: assigneeLabel, recipientEmployeeId: assigneeEmployeeId,
        message: `${directorLabel} assigned you a task: "${stage.title}"`, type: 'info'
      })
    }

    await logHistory({
      workflowId: workflow.id, stageId: stage.id, action: 'Created', toStatus: stage.status,
      actorLabel: directorLabel, department: workflow.departmentKey
    })

    if (workflow.status === 'Created') {
      await prisma.workflow.update({ where: { id: workflow.id }, data: { status: 'Assigned' } })
      await logHistory({ workflowId: workflow.id, action: 'Assigned', fromStatus: 'Created', toStatus: 'Assigned', actorLabel: directorLabel, department: workflow.departmentKey })
    }

    res.status(201).json({ stage })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to create stage' })
  }
})

router.patch('/stages/:id', requireAuth, requireOwner, async (req, res) => {
  try {
    const stage = await prisma.workflowStage.findUnique({
      where: { id: req.params.id },
      include: { blockedBy: { include: { blockingStage: true } }, workflow: true }
    })
    if (!stage) return res.status(404).json({ error: 'Stage not found' })

    const data = {}
    if (req.body?.status !== undefined) {
      const nextStatus = req.body.status
      if (!DIRECT_STATUSES.has(nextStatus)) {
        return res.status(400).json({ error: `"${nextStatus}" can't be set directly — submit for review instead.` })
      }
      if (nextStatus === 'Working') {
        const unmet = stage.blockedBy.filter((d) => d.blockingStage.status !== 'Completed')
        if (unmet.length > 0) {
          return res.status(409).json({
            error: `Blocked by dependency: "${unmet[0].blockingStage.title}" must be Completed first.`,
            blockedBy: unmet.map((d) => d.blockingStage.title)
          })
        }
      }
      data.status = nextStatus
    }
    if (req.body?.priority !== undefined) {
      if (!validPriority(req.body.priority)) return res.status(400).json({ error: 'Invalid priority' })
      data.priority = req.body.priority
    }
    if (req.body?.actualHours !== undefined) data.actualHours = Number(req.body.actualHours) || 0

    const updated = await prisma.workflowStage.update({ where: { id: stage.id }, data })

    if (data.status && data.status !== stage.status) {
      await logHistory({
        workflowId: stage.workflowId, stageId: stage.id, action: data.status, fromStatus: stage.status,
        toStatus: data.status, actorLabel: stage.assigneeLabel || 'Owner', department: stage.workflow.departmentKey
      })
    }

    res.json({ stage: updated })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to update stage' })
  }
})

router.post('/dependencies', requireAuth, requireOwner, async (req, res) => {
  try {
    const { blockingStageId, dependentStageId } = req.body || {}
    if (!blockingStageId || !dependentStageId) return res.status(400).json({ error: 'blockingStageId and dependentStageId are required' })
    if (blockingStageId === dependentStageId) return res.status(400).json({ error: 'A stage cannot depend on itself' })

    const dependency = await prisma.workflowDependency.create({ data: { blockingStageId, dependentStageId } })
    res.status(201).json({ dependency })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to create dependency (it may already exist)' })
  }
})

router.delete('/dependencies/:id', requireAuth, requireOwner, async (req, res) => {
  try {
    await prisma.workflowDependency.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(404).json({ error: 'Dependency not found' })
  }
})

router.post('/:id/activity', requireAuth, requireOwner, async (req, res) => {
  try {
    if (!req.body?.message?.trim()) return res.status(400).json({ error: 'message is required' })
    const activity = await prisma.workflowActivity.create({
      data: {
        workflowId: req.params.id,
        stageId: req.body.stageId || null,
        actorLabel: req.body.actorLabel || 'Owner',
        message: req.body.message.trim()
      }
    })
    res.status(201).json({ activity })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to add activity' })
  }
})

router.get('/dashboard/ceo', requireAuth, requireOwner, async (req, res) => {
  try {
    const [workflows, stages] = await Promise.all([prisma.workflow.findMany(), prisma.workflowStage.findMany()])
    const now = new Date()
    const departments = [...new Set(workflows.map((w) => w.departmentKey))]

    const departmentProgress = departments.map((key) => {
      const deptStages = stages.filter((s) => workflows.find((w) => w.id === s.workflowId)?.departmentKey === key)
      const completed = deptStages.filter((s) => s.status === 'Completed').length
      return { departmentKey: key, total: deptStages.length, completed, progressPct: deptStages.length ? Math.round((completed / deptStages.length) * 100) : 0 }
    })

    const delayed = [...workflows, ...stages].filter((w) => w.dueDate && new Date(w.dueDate) < now && w.status !== 'Completed' && w.status !== 'Cancelled')
    const critical = [...workflows, ...stages].filter((w) => w.priority === 'Critical' && w.status !== 'Completed' && w.status !== 'Cancelled')
    const totalStages = stages.length
    const completedStages = stages.filter((s) => s.status === 'Completed').length

    res.json({
      totalWorkflows: workflows.length,
      byGroup: workflows.reduce((acc, w) => { const g = groupForStatus(w.status); acc[g] = (acc[g] || 0) + 1; return acc }, {}),
      departmentProgress,
      completedTasks: completedStages,
      delayedTasks: delayed.length,
      criticalTasks: critical.length,
      overallProgressPct: totalStages ? Math.round((completedStages / totalStages) * 100) : 0
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load CEO workflow dashboard' })
  }
})

router.get('/dashboard/director/:departmentKey', requireAuth, requireOwner, async (req, res) => {
  try {
    const { departmentKey } = req.params
    const workflows = await prisma.workflow.findMany({
      where: { departmentKey },
      include: { stages: { include: { approvals: true, blockedBy: { include: { blockingStage: true } } } } }
    })
    const stages = workflows.flatMap((w) => w.stages)

    const today = new Date(); today.setHours(0, 0, 0, 0)
    const employeeIds = [...new Set(stages.map((s) => s.assigneeEmployeeId).filter(Boolean))]
    const employees = await prisma.employee.findMany({ where: { id: { in: employeeIds } } })

    const employeeStatus = employees.map((e) => {
      const empStages = stages.filter((s) => s.assigneeEmployeeId === e.id)
      const working = empStages.find((s) => s.status === 'Working')
      return { id: e.id, name: e.name, currentTask: working?.title || null, queueLength: empStages.filter((s) => !['Completed', 'Cancelled', 'Failed', 'Archived'].includes(s.status)).length }
    })

    res.json({
      departmentQueue: stages.filter((s) => !['Completed', 'Cancelled', 'Failed', 'Archived'].includes(s.status)).length,
      employeeStatus,
      taskProgress: { total: stages.length, completed: stages.filter((s) => s.status === 'Completed').length },
      pendingReviews: stages.flatMap((s) => s.approvals).filter((a) => a.status === 'Pending').length,
      blockedWork: stages.filter((s) => s.blockedBy.some((d) => d.blockingStage.status !== 'Completed')).length,
      completedToday: stages.filter((s) => s.status === 'Completed' && new Date(s.updatedAt) >= today).length
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load director workflow dashboard' })
  }
})

router.get('/dashboard/employee/:employeeId', requireAuth, requireOwner, async (req, res) => {
  try {
    const stages = await prisma.workflowStage.findMany({
      where: { assigneeEmployeeId: req.params.employeeId },
      include: { blockedBy: { include: { blockingStage: true } } }
    })

    res.json({
      currentTasks: stages.filter((s) => s.status === 'Working').map((s) => ({ id: s.id, title: s.title })),
      upcomingTasks: stages.filter((s) => ['Assigned', 'Accepted'].includes(s.status)).map((s) => ({ id: s.id, title: s.title })),
      completedTasks: stages.filter((s) => s.status === 'Completed').length,
      blockedTasks: stages.filter((s) => s.blockedBy.some((d) => d.blockingStage.status !== 'Completed')).length,
      queueLength: stages.filter((s) => !['Completed', 'Cancelled', 'Failed', 'Archived'].includes(s.status)).length
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load employee workload' })
  }
})

module.exports = router
