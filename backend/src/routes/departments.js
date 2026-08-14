const express = require('express')
const prisma = require('../prismaClient')

const router = express.Router()
const TERMINAL = ['Completed', 'Cancelled', 'Failed', 'Archived']

// GET /api/departments — every department with its roster and the most
// recently updated non-terminal Workflow assigned to it (so the frontend
// knows who to animate). Reads the Workflow Engine — the single task
// system as of the Phase 6.5.1 consolidation. Auth is applied at the
// server.js mount point (requireAuth, requireOwner), same as before.
router.get('/', async (req, res) => {
  try {
    const departments = await prisma.department.findMany({
      include: { employees: true },
      orderBy: { name: 'asc' }
    })

    const withWorkflows = await Promise.all(
      departments.map(async (dept) => {
        const activeWorkflow = await prisma.workflow.findFirst({
          where: { departmentKey: dept.key, status: { notIn: TERMINAL } },
          orderBy: { updatedAt: 'desc' },
          include: { stages: true }
        })
        return { ...dept, activeWorkflow: activeWorkflow || null }
      })
    )

    res.json({ departments: withWorkflows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load departments' })
  }
})

module.exports = router
