const express = require('express')
const prisma = require('../prismaClient')
const payments = require('../lib/payments')

const router = express.Router()

async function logWebhookEvent(transactionId, event, raw) {
  const tx = await prisma.paymentTransaction.findUnique({ where: { id: transactionId } })
  if (!tx) return
  let log = []
  try { log = JSON.parse(tx.webhookLog || '[]') } catch { log = [] }
  log.push({ event, receivedAt: new Date().toISOString(), raw })
  await prisma.paymentTransaction.update({ where: { id: tx.id }, data: { webhookLog: JSON.stringify(log) } })
}

router.post('/stripe', async (req, res) => {
  let event
  try {
    event = payments.verifyStripeWebhookSignature(req.body.toString('utf8'), req.headers['stripe-signature'])
  } catch (err) {
    console.error('Stripe webhook rejected:', err.message)
    return res.status(400).json({ error: err.message })
  }

  try {
    const session = event.data?.object
    const transactionId = session?.metadata?.transactionId
    if (!transactionId) return res.json({ received: true })

    if (event.type === 'checkout.session.completed') {
      await prisma.paymentTransaction.update({ where: { id: transactionId }, data: { status: 'Success' } })
      const tx = await prisma.paymentTransaction.findUnique({ where: { id: transactionId } })
      if (tx?.kind === 'subscription') {
        await prisma.subscription.upsert({
          where: { id: 'singleton' },
          update: { planKey: tx.planKey, billingCycle: tx.billingCycle, status: 'Active', provider: 'stripe', stripeSubscriptionId: session.subscription || '', stripeCustomerId: session.customer || '' },
          create: { id: 'singleton', planKey: tx.planKey, billingCycle: tx.billingCycle, status: 'Active', provider: 'stripe', stripeSubscriptionId: session.subscription || '', stripeCustomerId: session.customer || '' }
        })
      }
    } else if (event.type === 'checkout.session.expired') {
      await prisma.paymentTransaction.update({ where: { id: transactionId }, data: { status: 'Cancelled' } })
    } else if (event.type === 'charge.refunded') {
      await prisma.paymentTransaction.update({ where: { id: transactionId }, data: { status: 'Refunded' } })
    } else if (event.type === 'invoice.payment_failed') {
      await prisma.paymentTransaction.update({ where: { id: transactionId }, data: { status: 'Failed' } })
    }

    await logWebhookEvent(transactionId, event.type, event)
    res.json({ received: true })
  } catch (err) {
    console.error('Stripe webhook processing error:', err)
    res.status(500).json({ error: 'Webhook processing failed' })
  }
})

router.post('/payfast', async (req, res) => {
  const postData = req.body
  try {
    await payments.verifyPayfastITN(postData)
  } catch (err) {
    console.error('PayFast ITN rejected:', err.message)
    return res.status(400).send('invalid')
  }

  try {
    const transactionId = postData.m_payment_id
    if (!transactionId) return res.send('ok')

    const statusMap = { COMPLETE: 'Success', FAILED: 'Failed', PENDING: 'Pending' }
    const status = statusMap[postData.payment_status] || 'Pending'
    await prisma.paymentTransaction.update({ where: { id: transactionId }, data: { status, externalId: postData.pf_payment_id || '' } })
    await logWebhookEvent(transactionId, `payfast:${postData.payment_status}`, postData)

    res.send('ok')
  } catch (err) {
    console.error('PayFast ITN processing error:', err)
    res.status(500).send('error')
  }
})

module.exports = router
