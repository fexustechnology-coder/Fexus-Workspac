const express = require('express')
const prisma = require('../prismaClient')
const { requireAuth, requireOwner } = require('../middleware/auth')
const memoryManager = require('../memoryManager')

const router = express.Router()
const ACTIVE_STATUSES = ['Created', 'Loaded', 'Updated', 'Saved Temporarily']

// GET /api/memory — every active/expired memory row, auto-expiring any
// whose linked work has reached a terminal status (see memoryManager.js —
// this is a synchronous check inside an explicit request, not a scheduler).
router.get('/', requireAuth, requireOwner, async (req, res) => {
  try {
    const memories = await prisma.employeeMemory.findMany({ orderBy: { updatedAt: 'desc' } })
    const checked = await Promise.all(memories.map((m) => memoryManager.checkAndAutoExpire(m)))
    res.json({ memories: checked })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load memory' })
  }
})

router.get('/:id', requireAuth, requireOwner, async (req, res) => {
  try {
    const memory = await prisma.employeeMemory.findUnique({ where: { id: req.params.id } })
    if (!memory) return res.status(404).json({ error: 'Memory not found' })
    const checked = await memoryManager.checkAndAutoExpire(memory)
    const logs = await prisma.memoryLog.findMany({ where: { memoryId: memory.id }, orderBy: { createdAt: 'desc' } })
    res.json({ memory: checked, logs })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load memory' })
  }
})

// POST /api/memory — "Load Memory" for an employee working one stage.
router.post('/', requireAuth, requireOwner, async (req, res) => {
  try {
    const { employeeId, stageId } = req.body || {}
    if (!employeeId) return res.status(400).json({ error: 'employeeId is required' })
    const memory = await memoryManager.loadMemory({ employeeId, stageId })
    res.status(201).json({ memory })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message || 'Failed to load memory' })
  }
})

// PATCH /api/memory/:id — updates ONLY Working Memory + Resource Memory.
// There is no route anywhere that lets this update the Task/Context/
// Conversation snapshot fields, Company Brain, the Operating Manual, or
// Business Foundation — enforced by simply not exposing those fields here.
router.patch('/:id', requireAuth, requireOwner, async (req, res) => {
  try {
    const { workingNotes, fileReferences, resourceLinks } = req.body || {}
    const memory = await memoryManager.updateWorkingMemory(req.params.id, { workingNotes, fileReferences, resourceLinks })
    res.json({ memory })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message || 'Failed to update memory' })
  }
})

router.post('/:id/refresh-conversation', requireAuth, requireOwner, async (req, res) => {
  try {
    const memory = await memoryManager.refreshConversation(req.params.id)
    res.json({ memory })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message || 'Failed to refresh conversation memory' })
  }
})

router.post('/:id/expire', requireAuth, requireOwner, async (req, res) => {
  try {
    const memory = await memoryManager.expireMemory(req.params.id)
    res.json({ memory })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message || 'Failed to expire memory' })
  }
})

router.delete('/:id', requireAuth, requireOwner, async (req, res) => {
  try {
    await memoryManager.deleteMemory(req.params.id)
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message || 'Failed to delete memory' })
  }
})

// POST /api/memory/cleanup — bulk expire+delete everything whose linked
// work is done. Manual, Owner-triggered — "when workflow completes,
// temporary memory deleted" without a background job doing it silently.
router.post('/cleanup', requireAuth, requireOwner, async (req, res) => {
  try {
    const result = await memoryManager.cleanupCompleted()
    res.json(result)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to run memory cleanup' })
  }
})

router.get('/dashboard/owner', requireAuth, requireOwner, async (req, res) => {
  try {
    const memories = await prisma.employeeMemory.findMany()
    const checked = await Promise.all(memories.map((m) => memoryManager.checkAndAutoExpire(m)))
    const active = checked.filter((m) => ACTIVE_STATUSES.includes(m.status))
    const expired = checked.filter((m) => m.status === 'Expired')

    const contextSizeBytes = checked.reduce((sum, m) =>
      sum + (m.companyBrainSnapshot?.length || 0) + (m.operatingManualSnapshot?.length || 0) +
      (m.conversationSnapshot?.length || 0) + (m.workingNotes?.length || 0), 0)

    res.json({
      memoryStatus: active.length > 0 ? 'Active' : 'Idle',
      activeMemories: active.length,
      expiredMemories: expired.length,
      currentContextSizeKb: Math.round((contextSizeBytes / 1024) * 10) / 10
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load Owner memory dashboard' })
  }
})

router.get('/dashboard/ceo', requireAuth, requireOwner, async (req, res) => {
  try {
    const memories = await prisma.employeeMemory.findMany()
    const checked = await Promise.all(memories.map((m) => memoryManager.checkAndAutoExpire(m)))
    const active = checked.filter((m) => ACTIVE_STATUSES.includes(m.status))
    const activeEmployees = new Set(active.map((m) => m.employeeId)).size

    // A simple, transparent rule — not AI judgment: healthy if expired
    // memory isn't piling up faster than active memory exists.
    const expired = checked.filter((m) => m.status === 'Expired').length
    const memoryHealth = checked.length === 0 ? 'Unknown' : expired <= active.length ? 'Healthy' : 'Needs Cleanup'

    res.json({
      currentActiveEmployees: activeEmployees,
      currentMemoryUsage: active.length,
      memoryHealth
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load CEO memory dashboard' })
  }
})

module.exports = router
