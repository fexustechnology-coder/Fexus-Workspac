// =============================================================================
// AUTONOMOUS HANDOFF PIPELINE (Phase 15)
// =============================================================================
// The moment a deal closes (client clicks Accept in their portal — see
// routes/salesPortal.js), this runs the entire chain with zero Owner
// interaction: Website AI plan → real Workflow + Stages + Employee
// assignments → real code generation → Automation Engine job → (if
// autonomous + Gmail connected) a real "preview ready" email to the client.
//
// This calls the EXACT SAME internal functions the Owner's own manual
// clicks call (routes/websiteAI.js's `internal` export) — there is no
// second, duplicated implementation of plan generation, execution
// start-up, or code generation for the "automatic" path.
// =============================================================================

const prisma = require('./prismaClient')
const websiteAI = require('./routes/websiteAI')
const gmail = require('./lib/gmail')
const { AUTO_BUILD_CODE_STACK } = require('./websiteAIConstants')

// Deliberately the same shared constant routes/websiteAI.js's own
// progress-endpoint auto-build uses — one choice of default stack, not two.
const AUTO_CODE_STACK = AUTO_BUILD_CODE_STACK

function websiteTypeFromBusinessType(businessType) {
  const known = [
    'Landing Page', 'Business Website', 'Portfolio', 'Agency Website', 'E-Commerce',
    'Restaurant', 'Dental', 'Real Estate', 'Construction', 'Education', 'Healthcare', 'Corporate'
  ]
  const match = known.find((t) => businessType?.toLowerCase().includes(t.toLowerCase()))
  return match || 'Business Website'
}

function buildRequirementsText(lead) {
  const parts = []
  if (lead.businessType) parts.push(`Business type: ${lead.businessType}.`)
  if (lead.pages) parts.push(`Pages needed: ${lead.pages}.`)
  if (lead.style) parts.push(`Preferred style: ${lead.style}.`)
  if (lead.targetAudience) parts.push(`Target audience: ${lead.targetAudience}.`)
  if (lead.country) parts.push(`Country: ${lead.country}.`)
  if (lead.budget) parts.push(`Budget: ${lead.budget}.`)
  if (lead.deadline) parts.push(`Deadline: ${new Date(lead.deadline).toDateString()}.`)
  if (lead.notes) parts.push(lead.notes)
  return parts.join(' ') || `Website for ${lead.company || lead.name}.`
}

/**
 * Runs the full autonomous chain for one Lead whose deal just closed.
 * Returns a report of exactly what happened at each step, including any
 * step that failed or was skipped and why — this function never silently
 * swallows a failure; it records it in the returned report and keeps going
 * where it safely can, or stops and reports where it can't.
 */
async function runAutoHandoff(leadId) {
  const report = { leadId, steps: [] }
  const log = (step, ok, detail) => report.steps.push({ step, ok, detail })

  const lead = await prisma.lead.findUnique({ where: { id: leadId } })
  if (!lead) { log('load-lead', false, 'Lead not found'); return report }
  log('load-lead', true, `Loaded lead ${lead.name}`)

  // 1. Website AI plan — reads Company Brain + Operating Manual fresh (see
  // gatherContext() in routes/websiteAI.js), grounded in the lead's
  // collected requirements.
  let project
  try {
    project = await websiteAI.internal.generatePlanCore({
      websiteType: websiteTypeFromBusinessType(lead.businessType),
      requirementsText: buildRequirementsText(lead),
      leadId: lead.id
    })
    log('generate-plan', true, `Plan created (${project.id})`)
  } catch (err) {
    log('generate-plan', false, err.message)
    return report // nothing downstream can happen without a plan
  }

  // 2. Real Workflow + Stages + Employee assignments — never bypasses the
  // Workflow Engine (see startExecutionCore).
  try {
    project = await websiteAI.internal.startExecutionCore(project.id)
    log('start-execution', true, `Workflow ${project.workflowId} created with 10 real stages`)
  } catch (err) {
    log('start-execution', false, err.message)
  }

  // 3. Real code generation (AI mode — a real Groq call, grounded in the
  // plan above), using the one stack this system can actually preview live.
  try {
    const result = await websiteAI.internal.generateCodeCore(project.id, { codeStack: AUTO_CODE_STACK, mode: 'ai' })
    project = result.project
    log('generate-code', true, `${result.fileCount} files generated (${AUTO_CODE_STACK}, AI mode)`)
  } catch (err) {
    log('generate-code', false, err.message)
  }

  // 4. Automation Engine job — framework-only, per every prior phase; this
  // step only ever creates a tracked, labeled job, never a real deployment.
  try {
    const { job } = await websiteAI.internal.sendToAutomationCore(project.id, 'Prepare Deployment')
    log('automation-job', true, `AutomationJob ${job.id} queued`)
  } catch (err) {
    log('automation-job', false, err.message)
  }

  // 5. Payment Ready — real checkout creation (Stripe preferred, PayFast
  // fallback), only if lead.budget is a real parseable amount and at
  // least one provider is actually configured. Never faked: if neither
  // provider is configured, this is reported honestly and the pipeline
  // still continues (the client still gets their preview either way).
  let paymentUrl = null
  try {
    const amount = parseFloat(String(lead.budget || '').replace(/[^0-9.]/g, ''))
    if (!amount || amount <= 0) {
      log('payment-ready', false, 'No parseable budget on file for this lead — skipped')
    } else {
      const paymentsLib = require('./lib/payments')
      const providers = paymentsLib.configuredProviders()
      const provider = providers.stripe ? 'stripe' : providers.payfast ? 'payfast' : null
      if (!provider) {
        log('payment-ready', false, 'Neither Stripe nor PayFast is configured — skipped')
      } else {
        const count = await prisma.paymentTransaction.count()
        const transaction = await prisma.paymentTransaction.create({
          data: { kind: 'project', provider, amount, currency: provider === 'payfast' ? 'zar' : 'usd', leadId: lead.id, status: 'Pending', invoiceNumber: `INV-${String(count + 1).padStart(6, '0')}` }
        })
        if (provider === 'stripe') {
          const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5174'
          const checkout = await paymentsLib.createStripeCheckout({
            mode: 'payment', amount, currency: 'usd', productName: `${project.websiteType} project`,
            successUrl: `${frontendOrigin}/growth-ai?payment=success`, cancelUrl: `${frontendOrigin}/growth-ai?payment=cancelled`,
            customerEmail: lead.email || undefined, metadata: { transactionId: transaction.id, kind: 'project', leadId: lead.id }
          })
          paymentUrl = checkout.url
          await prisma.paymentTransaction.update({ where: { id: transaction.id }, data: { externalId: checkout.sessionId, checkoutUrl: checkout.url } })
        } else {
          const result = paymentsLib.createPayfastPayment({ amount, itemName: `${project.websiteType} project`, metadata: { transactionId: transaction.id } })
          paymentUrl = result.url
          await prisma.paymentTransaction.update({ where: { id: transaction.id }, data: { checkoutUrl: paymentUrl } })
        }
        log('payment-ready', true, `Real ${provider} checkout created: ${transaction.invoiceNumber}`)
      }
    }
  } catch (err) {
    log('payment-ready', false, err.message)
  }

  // 6. Email the client their real preview link (and payment link, if one
  // was created) — only if autonomous mode is on AND Gmail is actually
  // connected. If either isn't true, this step is honestly reported as
  // skipped, not silently pretended.
  const settings = await prisma.autonomousSettings.findUnique({ where: { id: 'singleton' } })
  const previewToken = project.previewToken || `pv_${project.id}`
  const previewUrl = `${process.env.PUBLIC_PREVIEW_BASE_URL || `http://localhost:${process.env.PORT || 4000}`}/preview/${previewToken}`

  if (!project.previewToken) {
    await prisma.websiteProject.update({ where: { id: project.id }, data: { previewToken } })
  }

  if (settings?.salesAutonomous && lead.email) {
    try {
      const connected = await gmail.isConnected()
      if (!connected) throw new Error('Gmail not connected')
      await gmail.sendEmail({
        to: lead.email,
        subject: `Your website preview is ready, ${lead.name}`,
        body: `Hi ${lead.name},\n\nGreat news — your website is ready to preview: ${previewUrl}\n\nTake a look and let us know what you think.${paymentUrl ? `\n\nWhen you're happy with it, you can complete payment here: ${paymentUrl}` : ''}\n\nBest,\nThe team`
      })
      log('email-preview-link', true, `Sent to ${lead.email}`)
    } catch (err) {
      log('email-preview-link', false, err.message)
    }
  } else {
    log('email-preview-link', false, !settings?.salesAutonomous ? 'Autonomous mode is off' : 'Lead has no email on file')
  }

  report.previewUrl = previewUrl
  report.paymentUrl = paymentUrl
  report.projectId = project.id
  return report
}

module.exports = { runAutoHandoff }
