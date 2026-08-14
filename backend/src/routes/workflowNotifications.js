const express = require('express')
const prisma = require('../prismaClient')
const { requireAuth, requireOwner } = require('../middleware/auth')

const router = express.Router()

router.get('/', requireAuth, requireOwner, async (req, res) => {
  try {
    const where = {}
    if (req.query.recipient) where.recipientLabel = req.query.recipient
    if (req.query.unread === 'true') where.read = false

    const notifications = await prisma.workflowNotification.findMany({
      where, orderBy: { createdAt: 'desc' }, take: 100, include: { workflow: { select: { title: true } } }
    })
    res.json({ notifications })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load workflow notifications' })
  }
})

router.patch('/:id/read', requireAuth, requireOwner, async (req, res) => {
  try {
    const notification = await prisma.workflowNotification.update({ where: { id: req.params.id }, data: { read: true } })
    res.json({ notification })
  } catch (err) {
    console.error(err)
    res.status(404).json({ error: 'Notification not found' })
  }
})

router.post('/mark-all-read', requireAuth, requireOwner, async (req, res) => {
  try {
    await prisma.workflowNotification.updateMany({ where: { read: false }, data: { read: true } })
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to mark all as read' })
  }
})

module.exports = router
