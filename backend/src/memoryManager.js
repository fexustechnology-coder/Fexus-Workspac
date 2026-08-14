const prisma = require('./prismaClient')

const TERMINAL_STAGE_STATUSES = ['Completed', 'Cancelled', 'Failed', 'Archived']

async function log(memoryId, employeeLabel, action, message) {
  return prisma.memoryLog.create({ data: { memoryId, employeeLabel, action, message: message || action } })
}

/**
 * Loads memory for one employee working one WorkflowStage. This is a
 * read-only pull from Company Brain / the Operating Manual / the Workflow
 * Engine into a temporary snapshot — nothing is written back to any of
 * those systems, and no employee-level row is created there.
 */
async function loadMemory({ employeeId, stageId }) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } })
  if (!employee) throw new Error('Employee not found')

  let stage = null, workflow = null
  if (stageId) {
    stage = await prisma.workflowStage.findUnique({ where: { id: stageId }, include: { workflow: true } })
    workflow = stage?.workflow || null
  }

  const [companyBrain, brainSections] = await Promise.all([
    prisma.companyBrain.findUnique({ where: { id: 'singleton' } }),
    prisma.brainSection.findMany()
  ])

  // Context Memory — a small, relevant subset, not the whole Brain.
  const brainSubset = companyBrain
    ? {
        companyName: companyBrain.companyName, mission: companyBrain.mission,
        brandVoice: companyBrain.brandVoice, tone: companyBrain.tone, rules: companyBrain.rules
      }
    : {}
  const filledSections = brainSections.filter((s) => s.content?.trim()).slice(0, 5).map((s) => ({ title: s.title, content: s.content }))

  let clientProfile = {}
  if (workflow) {
    const project = await prisma.project.findFirst({ where: { name: workflow.title }, include: { client: true } })
    if (project?.client) clientProfile = { name: project.client.name, email: project.client.email, status: project.client.status }
  }

  // Conversation Memory — recent activity/history for this workflow only.
  let conversation = []
  if (workflow) {
    const [history, activities] = await Promise.all([
      prisma.workflowHistory.findMany({ where: { workflowId: workflow.id }, orderBy: { createdAt: 'desc' }, take: 5 }),
      prisma.workflowActivity.findMany({ where: { workflowId: workflow.id }, orderBy: { createdAt: 'desc' }, take: 5 })
    ])
    conversation = [
      ...history.map((h) => ({ actorLabel: h.actorLabel, message: `${h.action}${h.toStatus ? ` → ${h.toStatus}` : ''}`, at: h.createdAt })),
      ...activities.map((a) => ({ actorLabel: a.actorLabel, message: a.message, at: a.createdAt }))
    ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 8)
  }

  let directorLabel = ''
  if (workflow) {
    const director = await prisma.employee.findFirst({ where: { level: 'director', department: { key: workflow.departmentKey } } })
    directorLabel = director?.name || ''
  }

  const memory = await prisma.employeeMemory.create({
    data: {
      employeeId,
      employeeLabel: employee.name,
      workflowId: workflow?.id || null,
      stageId: stage?.id || null,
      status: 'Loaded',
      taskTitle: stage?.title || workflow?.title || '',
      taskObjective: employee.responsibility || '',
      directorLabel,
      priority: stage?.priority || workflow?.priority || '',
      dueDate: stage?.dueDate || workflow?.dueDate || null,
      companyBrainSnapshot: JSON.stringify(brainSubset),
      operatingManualSnapshot: JSON.stringify(filledSections),
      clientProfileSnapshot: JSON.stringify(clientProfile),
      conversationSnapshot: JSON.stringify(conversation)
    }
  })

  await log(memory.id, employee.name, 'Created', 'Memory created')
  await log(memory.id, employee.name, 'Loaded', 'Task, Context, and Conversation memory loaded')

  return memory
}

/** Employees only ever write to Working Memory (and link Resource Memory) — never the snapshot fields. */
async function updateWorkingMemory(memoryId, { workingNotes, fileReferences, resourceLinks }) {
  const memory = await prisma.employeeMemory.findUnique({ where: { id: memoryId } })
  if (!memory) throw new Error('Memory not found')

  const data = { status: 'Updated' }
  if (workingNotes !== undefined) data.workingNotes = workingNotes
  if (fileReferences !== undefined) data.fileReferences = JSON.stringify(fileReferences)
  if (resourceLinks !== undefined) data.resourceLinks = JSON.stringify(resourceLinks)

  const updated = await prisma.employeeMemory.update({ where: { id: memoryId }, data })
  await log(memory.id, memory.employeeLabel, 'Updated', 'Working memory updated')
  return updated
}

async function refreshConversation(memoryId) {
  const memory = await prisma.employeeMemory.findUnique({ where: { id: memoryId } })
  if (!memory || !memory.workflowId) throw new Error('Memory not linked to a workflow')

  const [history, activities] = await Promise.all([
    prisma.workflowHistory.findMany({ where: { workflowId: memory.workflowId }, orderBy: { createdAt: 'desc' }, take: 5 }),
    prisma.workflowActivity.findMany({ where: { workflowId: memory.workflowId }, orderBy: { createdAt: 'desc' }, take: 5 })
  ])
  const conversation = [
    ...history.map((h) => ({ actorLabel: h.actorLabel, message: `${h.action}${h.toStatus ? ` → ${h.toStatus}` : ''}`, at: h.createdAt })),
    ...activities.map((a) => ({ actorLabel: a.actorLabel, message: a.message, at: a.createdAt }))
  ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 8)

  const updated = await prisma.employeeMemory.update({
    where: { id: memoryId },
    data: { conversationSnapshot: JSON.stringify(conversation), status: 'Updated' }
  })
  await log(memory.id, memory.employeeLabel, 'Updated', 'Conversation memory refreshed')
  return updated
}

/**
 * Checks whether a memory's linked WorkflowStage/Workflow has reached a
 * terminal status, and if so, marks the memory Expired. This runs inline
 * during explicit read requests (GET /api/memory) — not a background
 * timer or scheduler, which the brief prohibits ("no autonomous agents").
 */
async function checkAndAutoExpire(memory) {
  if (memory.status === 'Expired') return memory
  if (!memory.stageId && !memory.workflowId) return memory

  let terminal = false
  if (memory.stageId) {
    const stage = await prisma.workflowStage.findUnique({ where: { id: memory.stageId } })
    terminal = stage ? TERMINAL_STAGE_STATUSES.includes(stage.status) : true // stage gone entirely also counts
  } else if (memory.workflowId) {
    const workflow = await prisma.workflow.findUnique({ where: { id: memory.workflowId } })
    terminal = workflow ? TERMINAL_STAGE_STATUSES.includes(workflow.status) : true
  }

  if (!terminal) return memory

  const expired = await prisma.employeeMemory.update({ where: { id: memory.id }, data: { status: 'Expired' } })
  await log(memory.id, memory.employeeLabel, 'Expired', 'Linked workflow/stage reached a terminal status')
  return expired
}

async function expireMemory(memoryId) {
  const memory = await prisma.employeeMemory.findUnique({ where: { id: memoryId } })
  if (!memory) throw new Error('Memory not found')
  const updated = await prisma.employeeMemory.update({ where: { id: memoryId }, data: { status: 'Expired' } })
  await log(memory.id, memory.employeeLabel, 'Expired', 'Manually expired')
  return updated
}

async function deleteMemory(memoryId) {
  const memory = await prisma.employeeMemory.findUnique({ where: { id: memoryId } })
  if (!memory) throw new Error('Memory not found')
  await log(memory.id, memory.employeeLabel, 'Deleted', 'Memory deleted — only MemoryLog entries remain')
  await prisma.employeeMemory.delete({ where: { id: memoryId } })
  return { ok: true }
}

/** Bulk cleanup: expire + delete every memory whose linked work is done. */
async function cleanupCompleted() {
  const memories = await prisma.employeeMemory.findMany({ where: { status: { not: 'Expired' } } })
  let deleted = 0
  for (const memory of memories) {
    const checked = await checkAndAutoExpire(memory)
    if (checked.status === 'Expired') {
      await deleteMemory(memory.id)
      deleted++
    }
  }
  return { deleted }
}

module.exports = {
  loadMemory, updateWorkingMemory, refreshConversation,
  checkAndAutoExpire, expireMemory, deleteMemory, cleanupCompleted
}
