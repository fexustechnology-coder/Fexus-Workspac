const express = require('express')
const prisma = require('../prismaClient')
const { requireAuth, requireOwner } = require('../middleware/auth')
const payments = require('../lib/payments')

const router = express.Router()

const DEFAULT_PLANS = [
  { key: 'free', name: 'Free', priceMonthly: 0, priceYearly: 0, features: ['Planning', 'Preview', 'Download'] },
  { key: 'pro', name: 'Pro', priceMonthly: 49, priceYearly: 490, features: ['Everything in Free', 'AI Code Generation', 'Advanced Features'] },
  { key: 'premium', name: 'Premium', priceMonthly: 149, priceYearly: 1490, features: ['Everything in Pro', 'One-click Publish', 'Domain Connection', 'SSL', 'GitHub', 'Hosting'] }
]

async function ensurePlansSeeded() {
  const count = await prisma.paymentPlan.count()
  if (count > 0) return
  for (const p of DEFAULT_PLANS) {
    await prisma.paymentPlan.create({ data: { ...p, features: JSON.stringify(p.features) } })
  }
}

function invoiceNumber(n) {
  return `INV-${String(n).padStart(6, '0')}`
}

router.get('/config', requireAuth, requireOwner, async (req, res) => {
  res.json({ providers: payments.configuredProviders() })
})

router.get('/plans', requireAuth, requireOwner, async (req, res) => {
  try {
    await ensurePlansSeeded()
    const plans = await prisma.paymentPlan.findMany({ where: { active: true } })
    res.json({ plans: plans.map((p) => ({ ...p, features: JSON.parse(p.features || '[]') })) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load plans' })
  }
})

router.get('/subscription', requireAuth, requireOwner, async (req, res) => {
  try {
    const sub = await prisma.subscription.upsert({ where: { id: 'singleton' }, update: {}, create: { id: 'singleton' } })
    res.json({ subscription: sub })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load subscription' })
  }
})

router.post('/subscribe', requireAuth, requireOwner, async (req, res) => {
  try {
    const { planKey, billingCycle } = req.body || {}
    const plan = await prisma.paymentPlan.findUnique({ where: { key: planKey } })
    if (!plan) return res.status(400).json({ error: 'Unknown plan' })
    if (!['monthly', 'yearly'].includes(billingCycle)) return res.status(400).json({ error: 'billingCycle must be "monthly" or "yearly"' })

    const amount = billingCycle === 'yearly' ? plan.priceYearly : plan.priceMonthly
    const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5174'

    const count = await prisma.paymentTransaction.count()
    const transaction = await prisma.paymentTransaction.create({
      data: {
        kind: 'subscription', provider: 'stripe', amount, currency: plan.currency,
        planKey, billingCycle, status: 'Pending', invoiceNumber: invoiceNumber(count + 1)
      }
    })

    const checkout = await payments.createStripeCheckout({
      mode: 'subscription',
      amount, currency: plan.currency,
      productName: `FEXUS ${plan.name} Plan (${billingCycle})`,
      successUrl: `${frontendOrigin}/owner/settings?payment=success`,
      cancelUrl: `${frontendOrigin}/owner/settings?payment=cancelled`,
      recurringInterval: billingCycle === 'yearly' ? 'year' : 'month',
      metadata: { transactionId: transaction.id, kind: 'subscription', planKey, billingCycle }
    })

    const updated = await prisma.paymentTransaction.update({ where: { id: transaction.id }, data: { externalId: checkout.sessionId, checkoutUrl: checkout.url } })
    res.status(201).json({ transaction: updated, checkoutUrl: checkout.url })
  } catch (err) {
    console.error(err)
    res.status(err.message?.includes('not configured') ? 503 : 500).json({ error: err.message || 'Failed to start subscription checkout' })
  }
})

router.post('/project-payment', requireAuth, requireOwner, async (req, res) => {
  try {
    const { leadId, amount, provider, description } = req.body || {}
    if (!amount || amount <= 0) return res.status(400).json({ error: 'A positive amount is required' })
    if (!['stripe', 'payfast'].includes(provider)) return res.status(400).json({ error: 'provider must be "stripe" or "payfast"' })

    const lead = leadId ? await prisma.lead.findUnique({ where: { id: leadId } }) : null
    const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5174'
    const count = await prisma.paymentTransaction.count()

    const transaction = await prisma.paymentTransaction.create({
      data: {
        kind: 'project', provider, amount, currency: provider === 'payfast' ? 'zar' : 'usd',
        leadId: leadId || null, status: 'Pending', invoiceNumber: invoiceNumber(count + 1)
      }
    })

    let checkoutUrl
    if (provider === 'stripe') {
      const checkout = await payments.createStripeCheckout({
        mode: 'payment', amount, currency: 'usd',
        productName: description || `Project payment${lead ? ` — ${lead.name}` : ''}`,
        successUrl: `${frontendOrigin}/growth-ai?payment=success`,
        cancelUrl: `${frontendOrigin}/growth-ai?payment=cancelled`,
        customerEmail: lead?.email || undefined,
        metadata: { transactionId: transaction.id, kind: 'project', leadId: leadId || '' }
      })
      checkoutUrl = checkout.url
      await prisma.paymentTransaction.update({ where: { id: transaction.id }, data: { externalId: checkout.sessionId, checkoutUrl } })
    } else {
      const result = payments.createPayfastPayment({
        amount, itemName: description || `Project payment${lead ? ` — ${lead.name}` : ''}`,
        metadata: { transactionId: transaction.id }
      })
      checkoutUrl = result.url
      await prisma.paymentTransaction.update({ where: { id: transaction.id }, data: { checkoutUrl } })
    }

    res.status(201).json({ transaction, checkoutUrl })
  } catch (err) {
    console.error(err)
    res.status(err.message?.includes('not configured') ? 503 : 500).json({ error: err.message || 'Failed to create project payment' })
  }
})

router.get('/transactions', requireAuth, requireOwner, async (req, res) => {
  try {
    const where = {}
    if (req.query.leadId) where.leadId = req.query.leadId
    if (req.query.status) where.status = req.query.status
    const items = await prisma.paymentTransaction.findMany({ where, orderBy: { createdAt: 'desc' } })
    res.json({ items })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load transactions' })
  }
})

module.exports = router
module.exports.internal = { invoiceNumber, ensurePlansSeeded }
