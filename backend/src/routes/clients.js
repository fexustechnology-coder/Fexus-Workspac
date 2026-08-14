const express = require('express')
const prisma = require('../prismaClient')
const { requireAuth } = require('../middleware/auth')

const router = express.Router()
const ALLOWED = ['name', 'contact', 'email', 'mrr', 'status']

router.get('/', requireAuth, async (req, res) => {
  try {
    const items = await prisma.client.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { projects: true, invoices: true } } }
    })
    res.json({ items })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load clients' })
  }
})

router.post('/', requireAuth, async (req, res) => {
  try {
    if (!req.body?.name?.trim()) return res.status(400).json({ error: 'Client name is required' })
    const data = {}
    for (const f of ALLOWED) if (req.body[f] !== undefined) data[f] = req.body[f]
    if (data.mrr !== undefined) data.mrr = Number(data.mrr) || 0
    const item = await prisma.client.create({ data })
    res.status(201).json({ item })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to create client' })
  }
})

router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const data = {}
    for (const f of ALLOWED) if (req.body[f] !== undefined) data[f] = req.body[f]
    if (data.mrr !== undefined) data.mrr = Number(data.mrr) || 0
    const item = await prisma.client.update({ where: { id: req.params.id }, data })
    res.json({ item })
  } catch (err) {
    console.error(err)
    res.status(404).json({ error: 'Client not found' })
  }
})

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    // Cascades to that client's invoices, unlinks (SetNull) their projects — see schema.prisma.
    await prisma.client.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(404).json({ error: 'Client not found' })
  }
})

module.exports = router
