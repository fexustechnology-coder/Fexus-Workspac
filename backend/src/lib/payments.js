// =============================================================================
// REAL PAYMENT INTEGRATION (Phase 16)
// =============================================================================
// Stripe via raw REST calls (consistent with how every other external API
// in this app is called — no heavy SDK dependency) and PayFast via its
// real, documented MD5 signature scheme + ITN (webhook) validation.
//
// Every function here throws a specific, named error if its required
// credentials aren't set — none of them ever fake a successful payment.
// =============================================================================

const crypto = require('crypto')

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || ''
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || ''

const PAYFAST_MERCHANT_ID = process.env.PAYFAST_MERCHANT_ID || ''
const PAYFAST_MERCHANT_KEY = process.env.PAYFAST_MERCHANT_KEY || ''
const PAYFAST_PASSPHRASE = process.env.PAYFAST_PASSPHRASE || ''
const PAYFAST_RETURN_URL = process.env.PAYFAST_RETURN_URL || ''
const PAYFAST_CANCEL_URL = process.env.PAYFAST_CANCEL_URL || ''
const PAYFAST_NOTIFY_URL = process.env.PAYFAST_NOTIFY_URL || ''
const PAYFAST_MODE = (process.env.PAYFAST_MODE || 'sandbox').toLowerCase()

function configuredProviders() {
  return {
    stripe: !!(STRIPE_SECRET_KEY && STRIPE_WEBHOOK_SECRET),
    payfast: !!(PAYFAST_MERCHANT_ID && PAYFAST_MERCHANT_KEY && PAYFAST_NOTIFY_URL)
  }
}

function requireStripe() {
  if (!STRIPE_SECRET_KEY) {
    throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY in backend/.env (get one at dashboard.stripe.com/apikeys).')
  }
}

async function createStripeCheckout({ mode, amount, currency, productName, successUrl, cancelUrl, customerEmail, metadata, recurringInterval }) {
  requireStripe()

  const params = new URLSearchParams()
  params.set('mode', mode)
  params.set('success_url', successUrl)
  params.set('cancel_url', cancelUrl)
  if (customerEmail) params.set('customer_email', customerEmail)

  params.set('line_items[0][quantity]', '1')
  params.set('line_items[0][price_data][currency]', currency || 'usd')
  params.set('line_items[0][price_data][unit_amount]', String(Math.round(amount * 100)))
  params.set('line_items[0][price_data][product_data][name]', productName)
  if (mode === 'subscription' && recurringInterval) {
    params.set('line_items[0][price_data][recurring][interval]', recurringInterval)
  }

  for (const [k, v] of Object.entries(metadata || {})) {
    params.set(`metadata[${k}]`, String(v))
  }

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data?.error?.message || 'Stripe checkout session creation failed')

  return { url: data.url, sessionId: data.id }
}

async function getStripeCheckoutSession(sessionId) {
  requireStripe()
  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` }
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data?.error?.message || 'Failed to retrieve Stripe session')
  return data
}

function verifyStripeWebhookSignature(rawBody, signatureHeader) {
  if (!STRIPE_WEBHOOK_SECRET) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not set — cannot verify Stripe webhooks.')
  }
  if (!signatureHeader) throw new Error('Missing Stripe-Signature header')

  const parts = Object.fromEntries(signatureHeader.split(',').map((p) => p.split('=')))
  const timestamp = parts.t
  const expectedSig = parts.v1
  if (!timestamp || !expectedSig) throw new Error('Malformed Stripe-Signature header')

  const signedPayload = `${timestamp}.${rawBody}`
  const computed = crypto.createHmac('sha256', STRIPE_WEBHOOK_SECRET).update(signedPayload, 'utf8').digest('hex')

  const a = Buffer.from(computed)
  const b = Buffer.from(expectedSig)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error('Stripe webhook signature verification failed')
  }

  return JSON.parse(rawBody)
}

function requirePayfast() {
  if (!PAYFAST_MERCHANT_ID || !PAYFAST_MERCHANT_KEY) {
    throw new Error('PayFast is not configured. Set PAYFAST_MERCHANT_ID and PAYFAST_MERCHANT_KEY in backend/.env.')
  }
  if (!PAYFAST_NOTIFY_URL) {
    throw new Error('PAYFAST_NOTIFY_URL is not set — PayFast requires a real notify (webhook) URL.')
  }
}

function payfastEncode(value) {
  return encodeURIComponent(value).replace(/%20/g, '+')
}

function payfastSignature(fields, passphrase) {
  let str = Object.entries(fields)
    .filter(([, v]) => v !== '' && v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${payfastEncode(String(v))}`)
    .join('&')
  if (passphrase) str += `&passphrase=${payfastEncode(passphrase)}`
  return crypto.createHash('md5').update(str).digest('hex')
}

function createPayfastPayment({ amount, itemName, metadata }) {
  requirePayfast()

  const fields = {
    merchant_id: PAYFAST_MERCHANT_ID,
    merchant_key: PAYFAST_MERCHANT_KEY,
    return_url: PAYFAST_RETURN_URL,
    cancel_url: PAYFAST_CANCEL_URL,
    notify_url: PAYFAST_NOTIFY_URL,
    amount: Number(amount).toFixed(2),
    item_name: itemName,
    m_payment_id: metadata?.transactionId || ''
  }

  const signature = payfastSignature(fields, PAYFAST_PASSPHRASE)
  const params = new URLSearchParams({ ...fields, signature })
  const base = PAYFAST_MODE === 'live' ? 'https://www.payfast.co.za/eng/process' : 'https://sandbox.payfast.co.za/eng/process'

  return { url: `${base}?${params.toString()}` }
}

async function verifyPayfastITN(postData) {
  requirePayfast()

  const { signature, ...fields } = postData
  const expected = payfastSignature(fields, PAYFAST_PASSPHRASE)
  if (expected !== signature) throw new Error('PayFast ITN signature mismatch')

  const validateUrl = PAYFAST_MODE === 'live'
    ? 'https://www.payfast.co.za/eng/query/validate'
    : 'https://sandbox.payfast.co.za/eng/query/validate'

  const body = new URLSearchParams(postData).toString()
  const response = await fetch(validateUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })
  const text = await response.text()
  if (text.trim() !== 'VALID') throw new Error(`PayFast ITN validation failed: ${text}`)

  return true
}

module.exports = {
  configuredProviders,
  createStripeCheckout, getStripeCheckoutSession, verifyStripeWebhookSignature,
  createPayfastPayment, verifyPayfastITN
}
