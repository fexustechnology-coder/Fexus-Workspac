const express = require('express')
const prisma = require('../prismaClient')

const router = express.Router()

// GET /api/brain — architecture placeholder only.
// This intentionally does NOT make decisions, read Task state, or call any
// AI logic. It exists so Phase 3 has a real endpoint and table to build on
// top of, per the "prepare the foundation, do not implement the AI" scope.
router.get('/', async (req, res) => {
  try {
    const entryCount = await prisma.brainMemory.count()
    res.json({
      status: 'not_implemented',
      message: 'The Company Brain is architecture-only in this phase. No AI decision-making runs here yet.',
      memoryEntries: entryCount
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to read Company Brain placeholder state' })
  }
})

module.exports = router
