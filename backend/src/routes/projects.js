const express = require('express')
const prisma = require('../prismaClient')
const { requireAuth } = require('../middleware/auth')

const router = express.Router()
const ALLOWED = ['name', 'clientId', 'status', 'progress', 'dueDate']

router.get('/', requireAuth, async (req, res) => {
  try {
    const items = await prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
      include: { client: true }
    })
    res.json({ items })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load projects' })
  }
})

router.post('/', requireAuth, async (req, res) => {
  try {
    if (!req.body?.name?.trim()) return res.status(400).json({ error: 'Project name is required' })
    const data = {}
    for (const f of ALLOWED) if (req.body[f] !== undefined) data[f] = req.body[f]
    if (data.clientId === '') delete data.clientId
    if (data.progress !== undefined) data.progress = Number(data.progress) || 0
    const item = await prisma.project.create({ data, include: { client: true } })
    res.status(201).json({ item })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to create project' })
  }
})

router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const data = {}
    for (const f of ALLOWED) if (req.body[f] !== undefined) data[f] = req.body[f]
    if (data.clientId === '') data.clientId = null
    if (data.progress !== undefined) data.progress = Number(data.progress) || 0
    const item = await prisma.project.update({ where: { id: req.params.id }, data, include: { client: true } })
    res.json({ item })
  } catch (err) {
    console.error(err)
    res.status(404).json({ error: 'Project not found' })
  }
})

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await prisma.project.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(404).json({ error: 'Project not found' })
  }
})

module.exports = router
