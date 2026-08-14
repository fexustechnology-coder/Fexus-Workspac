const express = require('express')
const prisma = require('../prismaClient')
const { requireAuth, requireOwner } = require('../middleware/auth')
const { CATEGORIES, STATUSES, HEALTH_STATES } = require('../integrationConnectors')

const router = express.Router()

function validStatus(s) { return STATUSES.includes(s) }
function validHealth(h) { return HEALTH_STATES.includes(h) }

async function log(connectorId, action, message) {
  return prisma.connectorLog.create({ data: { connectorId, action, message: message || action } })
}

router.get('/', requireAuth, requireOwner, async (req, res) => {
  try {
    const where = req.query.category ? { category: req.query.category } : {}
    const connectors = await prisma.connector.findMany({ where, orderBy: { name: 'asc' } })
    res.json({ connectors, categories: CATEGORIES })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load connectors' })
  }
})

router.get('/:id', requireAuth, requireOwner, async (req, res) => {
  try {
    const connector = await prisma.connector.findUnique({
      where: { id: req.params.id },
      include: { logs: { orderBy: { createdAt: 'desc' } } }
    })
    if (!connector) return res.status(404).json({ error: 'Connector not found' })
    res.json({ connector })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load connector' })
  }
})

router.patch('/:id', requireAuth, requireOwner, async (req, res) => {
  try {
    const connector = await prisma.connector.findUnique({ where: { id: req.params.id } })
    if (!connector) return res.status(404).json({ error: 'Connector not found' })

    const data = {}
    if (req.body?.status !== undefined) {
      if (!validStatus(req.body.status)) return res.status(400).json({ error: 'Invalid status' })
      data.status = req.body.status
    }
    if (req.body?.health !== undefined) {
      if (!validHealth(req.body.health)) return res.status(400).json({ error: 'Invalid health value' })
      data.health = req.body.health
    }
    if (req.body?.configuration !== undefined) data.configuration = req.body.configuration

    const updated = await prisma.connector.update({ where: { id: connector.id }, data })

    if (data.status && data.status !== connector.status) await log(connector.id, 'Status changed', `${connector.status} → ${data.status}`)
    if (data.health && data.health !== connector.health) await log(connector.id, 'Health updated', `${connector.health} → ${data.health}`)
    if (data.configuration !== undefined) await log(connector.id, 'Configuration updated', 'Placeholder configuration notes changed')

    res.json({ connector: updated })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to update connector' })
  }
})

router.get('/dashboard/owner', requireAuth, requireOwner, async (req, res) => {
  try {
    const connectors = await prisma.connector.findMany()
    const byStatus = STATUSES.reduce((acc, s) => ({ ...acc, [s]: connectors.filter((c) => c.status === s).length }), {})
    const byHealth = HEALTH_STATES.reduce((acc, h) => ({ ...acc, [h]: connectors.filter((c) => c.health === h).length }), {})

    res.json({ total: connectors.length, byStatus, byHealth })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load Owner integration dashboard' })
  }
})

router.get('/dashboard/ceo', requireAuth, requireOwner, async (req, res) => {
  try {
    const connectors = await prisma.connector.findMany()
    const available = connectors.filter((c) => c.status === 'Connected').length
    const unavailable = connectors.filter((c) => c.status !== 'Connected').length
    const unhealthy = connectors.filter((c) => c.health === 'Unavailable').length

    const integrationHealth = connectors.length === 0 ? 'Unknown' : unhealthy === 0 ? 'Healthy' : 'Needs Attention'

    res.json({ integrationHealth, availableServices: available, unavailableServices: unavailable })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load CEO integration dashboard' })
  }
})

module.exports = router
