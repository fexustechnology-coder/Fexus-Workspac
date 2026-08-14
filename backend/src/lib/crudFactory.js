const express = require('express')
const prisma = require('../prismaClient')
const { requireAuth } = require('../middleware/auth')

/**
 * Builds a full CRUD router (GET list, POST create, PATCH update, DELETE)
 * for a simple Prisma model with no relations to manage. Every route
 * requires a signed-in Company User — this is real business data, not a
 * public API.
 *
 * @param {string} modelKey - the Prisma client accessor, e.g. 'campaign'
 * @param {string[]} allowedFields - fields writable via POST/PATCH
 */
function makeCrudRouter(modelKey, allowedFields) {
  const router = express.Router()

  router.get('/', requireAuth, async (req, res) => {
    try {
      const items = await prisma[modelKey].findMany({ orderBy: { createdAt: 'desc' } })
      res.json({ items })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: `Failed to load ${modelKey} records` })
    }
  })

  router.post('/', requireAuth, async (req, res) => {
    try {
      const data = {}
      for (const field of allowedFields) {
        if (req.body?.[field] !== undefined) data[field] = req.body[field]
      }
      const item = await prisma[modelKey].create({ data })
      res.status(201).json({ item })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: `Failed to create ${modelKey} record` })
    }
  })

  router.patch('/:id', requireAuth, async (req, res) => {
    try {
      const data = {}
      for (const field of allowedFields) {
        if (req.body?.[field] !== undefined) data[field] = req.body[field]
      }
      const item = await prisma[modelKey].update({ where: { id: req.params.id }, data })
      res.json({ item })
    } catch (err) {
      console.error(err)
      res.status(404).json({ error: `${modelKey} record not found` })
    }
  })

  router.delete('/:id', requireAuth, async (req, res) => {
    try {
      await prisma[modelKey].delete({ where: { id: req.params.id } })
      res.json({ ok: true })
    } catch (err) {
      console.error(err)
      res.status(404).json({ error: `${modelKey} record not found` })
    }
  })

  return router
}

module.exports = { makeCrudRouter }
