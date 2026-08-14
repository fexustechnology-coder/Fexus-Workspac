const express = require('express')
const prisma = require('../prismaClient')
const { requireAuth, requireOwner } = require('../middleware/auth')
const { logHistory, notify } = require('../lib/workflowHelpers')

const router = express.Router()

async function departmentDirectorLabel(departmentKey) {
  const dept = await prisma.department.findUnique({ where: { key: departmentKey } })
  if (!dept) return departmentKey
  const director = await prisma.employee.findFirst({ where: { level: 'director', departmentId: dept.id } })
  return director?.name || dept.name
}

// POST /api/workflow-approvals/submit/:stageId — Employee submits work for
// review. This is the ONLY way a stage leaves "Working" toward completion —
// it cannot be marked Completed directly (see routes/workflows.js PATCH guard).
router.post('/submit/:stageId', requireAuth, requireOwner, async (req, res) => {
  try {
    const stage = await prisma.workflowStage.findUnique({ where: { id: req.params.stageId }, include: { workflow: true } })
    if (!stage) return res.status(404).json({ error: 'Stage not found' })

    const approval = await prisma.workflowApproval.create({
      data: { stageId: stage.id, submittedByLabel: stage.assigneeLabel || 'Owner', status: 'Pending' }
    })
    await prisma.workflowStage.update({ where: { id: stage.id }, data: { status: 'Waiting Approval' } })

    const directorLabel = await departmentDirectorLabel(stage.workflow.departmentKey)
    await logHistory({
      workflowId: stage.workflowId, stageId: stage.id, action: 'Submitted for Review', fromStatus: stage.status,
      toStatus: 'Waiting Approval', actorLabel: stage.assigneeLabel || 'Owner', department: stage.workflow.departmentKey
    })
    await notify({
      workflowId: stage.workflowId, recipientLabel: directorLabel,
      message: `${stage.assigneeLabel || 'An employee'} submitted "${stage.title}" for your review`, type: 'review_requested'
    })

    res.status(201).json({ approval })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to submit for review' })
  }
})

// POST /api/workflow-approvals/:id/approve — Director approves. Moves the
// stage straight to Completed (Approved is the review verdict; Completed is
// the resulting state the CEO's dashboard reflects) and notifies upward.
router.post('/:id/approve', requireAuth, requireOwner, async (req, res) => {
  try {
    const approval = await prisma.workflowApproval.findUnique({
      where: { id: req.params.id },
      include: { stage: { include: { workflow: true } } }
    })
    if (!approval) return res.status(404).json({ error: 'Approval not found' })
    if (approval.status !== 'Pending') return res.status(400).json({ error: 'This approval has already been reviewed' })

    const directorLabel = await departmentDirectorLabel(approval.stage.workflow.departmentKey)

    await prisma.workflowApproval.update({
      where: { id: approval.id },
      data: { status: 'Approved', reviewedByLabel: directorLabel, reviewedAt: new Date(), notes: req.body?.notes || '' }
    })
    await prisma.workflowStage.update({ where: { id: approval.stageId }, data: { status: 'Completed' } })

    await logHistory({
      workflowId: approval.stage.workflowId, stageId: approval.stageId, action: 'Approved',
      fromStatus: 'Waiting Approval', toStatus: 'Approved', actorLabel: directorLabel, department: approval.stage.workflow.departmentKey
    })
    await logHistory({
      workflowId: approval.stage.workflowId, stageId: approval.stageId, action: 'Completed',
      fromStatus: 'Approved', toStatus: 'Completed', actorLabel: directorLabel, department: approval.stage.workflow.departmentKey
    })

    // Notify upward — the CEO layer (the Owner) sees completion via the workflow itself.
    await notify({
      workflowId: approval.stage.workflowId, recipientLabel: 'CEO',
      message: `${directorLabel} approved "${approval.stage.title}" — completed`, type: 'approved'
    })

    // If every stage under this workflow is now Completed, complete the workflow too.
    const stages = await prisma.workflowStage.findMany({ where: { workflowId: approval.stage.workflowId } })
    if (stages.length > 0 && stages.every((s) => s.status === 'Completed')) {
      await prisma.workflow.update({ where: { id: approval.stage.workflowId }, data: { status: 'Completed' } })
      await logHistory({ workflowId: approval.stage.workflowId, action: 'Completed', toStatus: 'Completed', actorLabel: directorLabel, department: approval.stage.workflow.departmentKey })
      await notify({ workflowId: approval.stage.workflowId, recipientLabel: 'CEO', message: `All work on "${approval.stage.workflow.title}" is complete`, type: 'approved' })
    }

    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to approve' })
  }
})

// POST /api/workflow-approvals/:id/reject — sends the work back to Working.
router.post('/:id/reject', requireAuth, requireOwner, async (req, res) => {
  try {
    const approval = await prisma.workflowApproval.findUnique({
      where: { id: req.params.id },
      include: { stage: { include: { workflow: true } } }
    })
    if (!approval) return res.status(404).json({ error: 'Approval not found' })
    if (approval.status !== 'Pending') return res.status(400).json({ error: 'This approval has already been reviewed' })

    const directorLabel = await departmentDirectorLabel(approval.stage.workflow.departmentKey)

    await prisma.workflowApproval.update({
      where: { id: approval.id },
      data: { status: 'Rejected', reviewedByLabel: directorLabel, reviewedAt: new Date(), notes: req.body?.notes || '' }
    })
    await prisma.workflowStage.update({ where: { id: approval.stageId }, data: { status: 'Working' } })

    await logHistory({
      workflowId: approval.stage.workflowId, stageId: approval.stageId, action: 'Rejected',
      fromStatus: 'Waiting Approval', toStatus: 'Working', actorLabel: directorLabel,
      department: approval.stage.workflow.departmentKey, reason: req.body?.notes || ''
    })
    await notify({
      workflowId: approval.stage.workflowId, recipientLabel: approval.stage.assigneeLabel || 'Employee',
      recipientEmployeeId: approval.stage.assigneeEmployeeId,
      message: `${directorLabel} sent "${approval.stage.title}" back for changes${req.body?.notes ? `: ${req.body.notes}` : ''}`,
      type: 'rejected'
    })

    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to reject' })
  }
})

module.exports = router
