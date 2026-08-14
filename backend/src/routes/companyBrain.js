const express = require('express')
const prisma = require('../prismaClient')
const { requireAuth, requireOwner } = require('../middleware/auth')

const router = express.Router()

const FIELDS = [
  'companyName', 'industry', 'services', 'products', 'targetAudience',
  'mission', 'vision', 'goals', 'coreValues', 'brandVoice', 'tone',
  'writingStyle', 'pricing', 'packages', 'employeesNotes',
  'clientsNotes', 'workingHours', 'processes', 'rules', 'customInstructions',
  'businessInfo'
]

async function getOrCreateBrain() {
  const existing = await prisma.companyBrain.findUnique({ where: { id: 'singleton' } })
  if (existing) return existing
  return prisma.companyBrain.create({ data: { id: 'singleton' } })
}

// GET /api/company-brain — any signed-in company user can read it, since
// future AI modules (and human teammates) both need this context.
router.get('/', requireAuth, async (req, res) => {
  try {
    const brain = await getOrCreateBrain()
    res.json({ brain })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load Company Brain' })
  }
})

// PUT /api/company-brain — owner-only, like editing company settings.
router.put('/', requireAuth, requireOwner, async (req, res) => {
  try {
    const data = {}
    for (const field of FIELDS) {
      if (typeof req.body?.[field] === 'string') data[field] = req.body[field]
    }

    await getOrCreateBrain() // ensure the row exists before updating
    const brain = await prisma.companyBrain.update({ where: { id: 'singleton' }, data })
    res.json({ brain })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to save Company Brain' })
  }
})

module.exports = router
