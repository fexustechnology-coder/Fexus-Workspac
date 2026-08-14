const express = require('express')
const prisma = require('../prismaClient')
const { requireAuth, requireOwner } = require('../middleware/auth')
const { EMPLOYEE_ROSTER } = require('../employeeRoster')
const { groupForStatus } = require('../workflowConstants')

const router = express.Router()
const TERMINAL = ['Completed', 'Cancelled', 'Failed', 'Archived']

const NAMED_IDS = new Set(
  EMPLOYEE_ROSTER.map((e) => `emp-${e.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`)
)

// Reads the Workflow Engine's WorkflowStage model — the single task system
// as of the Phase 6.5.1 consolidation (this used to read a separate
// EmployeeTask model; that model was removed).
function summarize(employee, stages) {
  const working = stages.find((s) => s.status === 'Working')
  const queueCounts = {}
  for (const s of stages) {
    const g = groupForStatus(s.status)
    queueCounts[g] = (queueCounts[g] || 0) + 1
  }

  const lastActivity = stages.reduce(
    (latest, s) => (!latest || s.updatedAt > latest ? s.updatedAt : latest),
    employee.createdAt
  )

  return {
    id: employee.id,
    name: employee.name,
    responsibility: employee.responsibility,
    department: employee.department ? { key: employee.department.key, name: employee.department.name } : null,
    currentTask: working ? { id: working.id, title: working.title, status: working.status } : null,
    queueLength: stages.filter((s) => !TERMINAL.includes(s.status)).length,
    queueCounts,
    lastActivity
  }
}

// GET /api/employee-roster — all 56 named employees with a live summary of
// their WorkflowStage queue.
router.get('/', requireAuth, requireOwner, async (req, res) => {
  try {
    const employees = await prisma.employee.findMany({
      where: { id: { in: [...NAMED_IDS] } },
      include: { department: true }
    })
    const stages = await prisma.workflowStage.findMany({ where: { assigneeEmployeeId: { in: [...NAMED_IDS] } } })

    const directors = await prisma.employee.findMany({ where: { level: 'director' }, include: { department: true } })
    const directorByDeptKey = Object.fromEntries(directors.map((d) => [d.department?.key, d.name]))

    const roster = employees.map((e) => ({
      ...summarize(e, stages.filter((s) => s.assigneeEmployeeId === e.id)),
      director: directorByDeptKey[e.department?.key] || null
    }))

    res.json({ employees: roster })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load the Employee roster' })
  }
})

// GET /api/employee-roster/:id — one employee + their full WorkflowStage queue.
router.get('/:id', requireAuth, requireOwner, async (req, res) => {
  try {
    const employee = await prisma.employee.findUnique({
      where: { id: req.params.id },
      include: { department: true }
    })
    if (!employee || !NAMED_IDS.has(employee.id)) return res.status(404).json({ error: 'Employee not found' })

    const stages = await prisma.workflowStage.findMany({
      where: { assigneeEmployeeId: employee.id },
      orderBy: { updatedAt: 'desc' }
    })

    const director = employee.department
      ? await prisma.employee.findFirst({ where: { level: 'director', departmentId: employee.departmentId } })
      : null

    res.json({
      ...summarize(employee, stages),
      director: director?.name || null,
      tasks: stages
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load employee' })
  }
})

module.exports = router
