const express = require('express')
const prisma = require('../prismaClient')
const { requireAuth } = require('../middleware/auth')

const router = express.Router()

function groupCount(rows, key) {
  const out = {}
  for (const r of rows) out[r[key]] = (out[r[key]] || 0) + 1
  return out
}

// GET /api/metrics — every number here is computed live from real tables.
// No historical time-series is stored, so this reflects current state only
// (no fake trend lines pretending to be history).
router.get('/', requireAuth, async (req, res) => {
  try {
    const [clients, projects, invoices, deals, expenses, userCount] = await Promise.all([
      prisma.client.findMany(),
      prisma.project.findMany(),
      prisma.invoice.findMany(),
      prisma.deal.findMany(),
      prisma.expense.findMany(),
      prisma.user.count()
    ])

    const activeClients = clients.filter((c) => c.status === 'Active')
    const mrr = activeClients.reduce((sum, c) => sum + c.mrr, 0)
    const arr = mrr * 12

    const outstandingInvoices = invoices
      .filter((i) => i.status === 'Pending' || i.status === 'Overdue')
      .reduce((sum, i) => sum + i.amount, 0)
    const paidInvoices = invoices.filter((i) => i.status === 'Paid').reduce((sum, i) => sum + i.amount, 0)

    const burnRate = expenses.reduce((sum, e) => sum + e.amount, 0)

    const openPipeline = deals.filter((d) => d.stage !== 'Closed Won').reduce((sum, d) => sum + d.value, 0)
    const closedWonValue = deals.filter((d) => d.stage === 'Closed Won').reduce((sum, d) => sum + d.value, 0)

    res.json({
      mrr,
      arr,
      burnRate,
      userCount,
      clients: { total: clients.length, active: activeClients.length, churned: clients.length - activeClients.length },
      projects: { total: projects.length, byStatus: groupCount(projects, 'status') },
      invoices: { total: invoices.length, outstanding: outstandingInvoices, paid: paidInvoices, byStatus: groupCount(invoices, 'status') },
      deals: { total: deals.length, openPipeline, closedWonValue, byStage: groupCount(deals, 'stage') }
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to compute metrics' })
  }
})

module.exports = router
