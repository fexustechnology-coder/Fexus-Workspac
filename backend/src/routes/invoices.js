const express = require('express')
const prisma = require('../prismaClient')
const { requireAuth } = require('../middleware/auth')

const router = express.Router()
const ALLOWED = ['clientId', 'amount', 'status', 'date']

async function nextInvoiceNumber() {
  const count = await prisma.invoice.count()
  return `INV-${2041 + count}`
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const items = await prisma.invoice.findMany({
      orderBy: { createdAt: 'desc' },
      include: { client: true }
    })
    res.json({ items })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load invoices' })
  }
})

router.post('/', requireAuth, async (req, res) => {
  try {
    if (!req.body?.clientId) return res.status(400).json({ error: 'clientId is required' })
    if (req.body.amount === undefined) return res.status(400).json({ error: 'amount is required' })

    const data = { clientId: req.body.clientId, amount: Number(req.body.amount) || 0 }
    if (req.body.status !== undefined) data.status = req.body.status
    if (req.body.date !== undefined) data.date = req.body.date
    data.number = await nextInvoiceNumber()

    const item = await prisma.invoice.create({ data, include: { client: true } })
    res.status(201).json({ item })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to create invoice' })
  }
})

router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const data = {}
    for (const f of ALLOWED) if (req.body[f] !== undefined) data[f] = req.body[f]
    if (data.amount !== undefined) data.amount = Number(data.amount) || 0
    const item = await prisma.invoice.update({ where: { id: req.params.id }, data, include: { client: true } })
    res.json({ item })
  } catch (err) {
    console.error(err)
    res.status(404).json({ error: 'Invoice not found' })
  }
})

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await prisma.invoice.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(404).json({ error: 'Invoice not found' })
  }
})

module.exports = router
