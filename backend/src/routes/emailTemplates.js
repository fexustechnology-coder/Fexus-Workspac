const express = require('express')
const prisma = require('../prismaClient')
const { requireAuth } = require('../middleware/auth')
const { replacePlaceholders } = require('../campaignEngine')
const { BUILT_IN_TEMPLATES, TEMPLATE_CATEGORIES } = require('../emailTemplates')

const router = express.Router()

router.get('/categories', requireAuth, (req, res) => {
  res.json({ categories: TEMPLATE_CATEGORIES })
})

// GET / — the built-in library (read-only, shared) plus this account's
// own real custom/duplicated templates (isolated, same per-user model as
// Connected Emails — Phase 21).
router.get('/', requireAuth, async (req, res) => {
  try {
    const custom = await prisma.emailTemplate.findMany({ where: { userId: req.user.id }, orderBy: { updatedAt: 'desc' } })
    res.json({
      builtIn: BUILT_IN_TEMPLATES.map((t) => ({ ...t, isBuiltIn: true })),
      custom: custom.map((t) => ({ ...t, isBuiltIn: false }))
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load templates' })
  }
})

// POST /:id/duplicate — real copy of a built-in template into this
// account's own editable EmailTemplate row. Also works on another of the
// account's own custom templates (a real "Save As" / clone).
router.post('/:id/duplicate', requireAuth, async (req, res) => {
  try {
    let source = BUILT_IN_TEMPLATES.find((t) => t.id === req.params.id)
    if (!source) {
      source = await prisma.emailTemplate.findFirst({ where: { id: req.params.id, userId: req.user.id } })
    }
    if (!source) return res.status(404).json({ error: 'Template not found' })

    const created = await prisma.emailTemplate.create({
      data: {
        userId: req.user.id,
        category: source.category,
        name: `${source.name} (Copy)`,
        subject: source.subject,
        body: source.body
      }
    })
    res.status(201).json({ template: { ...created, isBuiltIn: false } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to duplicate template' })
  }
})

// POST / — a real new custom template, from scratch (not a duplicate).
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, category, subject, body } = req.body || {}
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' })
    const created = await prisma.emailTemplate.create({
      data: { userId: req.user.id, name: name.trim(), category: category || 'Custom', subject: subject || '', body: body || '' }
    })
    res.status(201).json({ template: { ...created, isBuiltIn: false } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to create template' })
  }
})

router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const existing = await prisma.emailTemplate.findFirst({ where: { id: req.params.id, userId: req.user.id } })
    if (!existing) return res.status(404).json({ error: 'Template not found (built-in templates cannot be edited directly — duplicate it first).' })
    const data = {}
    for (const f of ['name', 'category', 'subject', 'body']) if (typeof req.body?.[f] === 'string') data[f] = req.body[f]
    const updated = await prisma.emailTemplate.update({ where: { id: existing.id }, data })
    res.json({ template: { ...updated, isBuiltIn: false } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to update template' })
  }
})

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const existing = await prisma.emailTemplate.findFirst({ where: { id: req.params.id, userId: req.user.id } })
    if (!existing) return res.status(404).json({ error: 'Template not found (built-in templates cannot be deleted).' })
    await prisma.emailTemplate.delete({ where: { id: existing.id } })
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to delete template' })
  }
})

// POST /preview — real "Preview as Recipient": renders subject + body
// through the EXACT SAME replacePlaceholders() function
// campaignEngine.js uses at actual send time, so what's previewed can
// never silently diverge from what would really be sent.
router.post('/preview', requireAuth, (req, res) => {
  try {
    const { subject, body, sample } = req.body || {}
    const personalization = sample || {}
    const email = personalization.email || 'recipient@example.com'
    res.json({
      subject: replacePlaceholders(subject || '', email, personalization),
      body: replacePlaceholders(body || '', email, personalization)
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to render preview' })
  }
})

module.exports = router
