const express = require('express')
const prisma = require('../prismaClient')

const router = express.Router()
const TERMINAL = ['Completed', 'Cancelled', 'Failed', 'Archived']

// GET /api/employees — full roster (CEO, directors, employees)
router.get('/', async (req, res) => {
  try {
    const employees = await prisma.employee.findMany({
      include: { department: true },
      orderBy: [{ level: 'asc' }, { name: 'asc' }]
    })
    res.json({ employees })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load employees' })
  }
})

// GET /api/employees/ceo — the CEO record plus the most recently updated
// non-terminal Workflow anywhere in the company (what the CEO is currently
// focused on). Reads the Workflow Engine — the single task system as of
// the Phase 6.5.1 consolidation.
router.get('/ceo', async (req, res) => {
  try {
    const ceo = await prisma.employee.findFirst({ where: { level: 'ceo' } })
    if (!ceo) return res.status(404).json({ error: 'CEO not seeded yet' })

    const activeWorkflow = await prisma.workflow.findFirst({
      where: { status: { notIn: TERMINAL } },
      orderBy: { updatedAt: 'desc' }
    })

    res.json({ ceo, activeWorkflow: activeWorkflow || null })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load CEO' })
  }
})

module.exports = router
