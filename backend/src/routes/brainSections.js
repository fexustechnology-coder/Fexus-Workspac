const express = require('express')
const prisma = require('../prismaClient')
const { requireAuth, requireOwner } = require('../middleware/auth')
const { BRAIN_SECTIONS } = require('../brainSections')

const router = express.Router()

// Ensures all 30 sections exist as rows (creates any missing ones with
// empty content). Safe to call on every request — cheap upserts.
async function ensureSectionsSeeded() {
  await Promise.all(
    BRAIN_SECTIONS.map((s) =>
      prisma.brainSection.upsert({
        where: { key: s.key },
        update: { title: s.title, group: s.group },
        create: {
          key: s.key,
          title: s.title,
          group: s.group,
          content: '',
          contentLower: '',
          titleLower: s.title.toLowerCase()
        }
      })
    )
  )
}

function serialize(section) {
  return {
    id: section.id,
    key: section.key,
    title: section.title,
    group: section.group,
    content: section.content,
    updatedAt: section.updatedAt,
    versionCount: section._count?.versions ?? undefined
  }
}

// GET /api/brain-sections?q=search — list all 30 sections (auto-seeding any
// missing ones). Optional `q` filters by title or content, case-insensitive.
router.get('/', requireAuth, async (req, res) => {
  try {
    await ensureSectionsSeeded()

    const q = (req.query.q || '').trim().toLowerCase()
    const where = q
      ? { OR: [{ titleLower: { contains: q } }, { contentLower: { contains: q } }] }
      : {}

    const sections = await prisma.brainSection.findMany({
      where,
      include: { _count: { select: { versions: true } } },
      orderBy: { title: 'asc' }
    })

    res.json({ sections: sections.map(serialize) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load Operating Manual sections' })
  }
})

// GET /api/brain-sections/:key — a single section plus its version history.
router.get('/:key', requireAuth, async (req, res) => {
  try {
    await ensureSectionsSeeded()

    const section = await prisma.brainSection.findUnique({
      where: { key: req.params.key },
      include: { versions: { orderBy: { createdAt: 'desc' } } }
    })
    if (!section) return res.status(404).json({ error: 'Unknown Operating Manual section' })

    res.json({
      section: serialize(section),
      versions: section.versions.map((v) => ({ id: v.id, content: v.content, editedByEmail: v.editedByEmail, createdAt: v.createdAt }))
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load section' })
  }
})

// PUT /api/brain-sections/:key — update content. Owner-only, like the rest
// of Company Brain. Archives the previous content as a version first, so
// nothing is ever silently overwritten.
router.put('/:key', requireAuth, requireOwner, async (req, res) => {
  try {
    if (typeof req.body?.content !== 'string') {
      return res.status(400).json({ error: 'content (string) is required' })
    }

    await ensureSectionsSeeded()
    const existing = await prisma.brainSection.findUnique({ where: { key: req.params.key } })
    if (!existing) return res.status(404).json({ error: 'Unknown Operating Manual section' })

    if (existing.content !== req.body.content) {
      await prisma.brainSectionVersion.create({
        data: {
          sectionId: existing.id,
          content: existing.content,
          editedByEmail: req.user.email
        }
      })
    }

    const updated = await prisma.brainSection.update({
      where: { key: req.params.key },
      data: {
        content: req.body.content,
        contentLower: req.body.content.toLowerCase()
      },
      include: { _count: { select: { versions: true } } }
    })

    res.json({ section: serialize(updated) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to save section' })
  }
})

module.exports = router
