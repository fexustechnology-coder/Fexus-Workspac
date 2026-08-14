const prisma = require('../prismaClient')

async function logHistory({ workflowId, stageId, action, fromStatus, toStatus, actorLabel, department, reason }) {
  return prisma.workflowHistory.create({
    data: {
      workflowId,
      stageId: stageId || null,
      action,
      fromStatus: fromStatus || '',
      toStatus: toStatus || '',
      actorLabel,
      department: department || '',
      reason: reason || ''
    }
  })
}

async function notify({ workflowId, recipientLabel, recipientEmployeeId, message, type = 'info' }) {
  return prisma.workflowNotification.create({
    data: { workflowId, recipientLabel, recipientEmployeeId: recipientEmployeeId || null, message, type }
  })
}

module.exports = { logHistory, notify }
