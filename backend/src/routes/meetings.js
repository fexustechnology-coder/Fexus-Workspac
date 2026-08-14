const express = require('express')
const prisma = require('../prismaClient')
const { requireAuth } = require('../middleware/auth')

const router = express.Router()

router.get('/', requireAuth, async (req, res) => {
  try {
    const items = await prisma.meeting.findMany({ orderBy: { scheduledAt: 'asc' } })
    res.json({ items })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load meetings' })
  }
})

router.post('/', requireAuth, async (req, res) => {
  try {
    if (!req.body?.title?.trim()) return res.status(400).json({ error: 'Meeting title is required' })
    if (!req.body?.scheduledAt) return res.status(400).json({ error: 'scheduledAt is required' })

    const item = await prisma.meeting.create({
      data: {
        title: req.body.title.trim(),
        withWhom: req.body.withWhom || '',
        scheduledAt: new Date(req.body.scheduledAt)
      }
    })
    res.status(201).json({ item })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to create meeting' })
  }
})

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await prisma.meeting.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(404).json({ error: 'Meeting not found' })
  }
})

module.exports = router
