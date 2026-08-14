// Phase 7 — Automation Engine. This file is the single source of truth for
// the 8 modules and their capabilities, exactly as specified. Every
// "capability" here is a named job TYPE, not executable code — there is no
// function anywhere that posts to Instagram, sends an email, buys a
// domain, or deploys anything. See routes/automationEngine.js.

const AUTOMATION_MODULES = [
  {
    key: 'website',
    name: 'Website Automation',
    capabilities: [
      'Generate Website Job', 'Track Build Status', 'Prepare Deployment',
      'Prepare Domain Assignment', 'Prepare Hosting Assignment',
      'Prepare SSL Assignment', 'Prepare Go Live'
    ]
  },
  {
    key: 'marketing',
    name: 'Marketing Automation',
    capabilities: [
      'Prepare Instagram Post', 'Prepare Facebook Post', 'Prepare LinkedIn Post',
      'Prepare X Post', 'Prepare Email Campaign', 'Prepare Meta Campaign', 'Prepare Google Campaign'
    ]
  },
  {
    key: 'seo',
    name: 'SEO Automation',
    capabilities: [
      'Prepare Audit', 'Prepare Technical SEO', 'Prepare On Page',
      'Prepare Off Page', 'Prepare AEO', 'Prepare GEO', 'Prepare Reports'
    ]
  },
  {
    key: 'sales',
    name: 'Sales Automation',
    capabilities: [
      'Prepare Outreach', 'Prepare CRM Update', 'Prepare Proposal',
      'Prepare Quote', 'Prepare Follow-up', 'Prepare Closing Pipeline'
    ]
  },
  {
    key: 'finance',
    name: 'Finance Automation',
    capabilities: ['Prepare Invoice', 'Prepare Payment', 'Prepare Expense', 'Prepare Financial Report']
  },
  {
    key: 'support',
    name: 'Support Automation',
    capabilities: ['Prepare Ticket', 'Prepare Reply', 'Prepare Review Request', 'Prepare Renewal Reminder']
  },
  {
    key: 'analytics',
    name: 'Analytics Automation',
    // Not explicitly itemized in the brief beyond being listed as a module
    // — no capabilities were given for it, so none are invented here.
    capabilities: []
  },
  {
    key: 'deployment',
    name: 'Deployment Automation',
    capabilities: ['Prepare Domain', 'Prepare Hosting', 'Prepare SSL', 'Prepare DNS', 'Prepare Deployment']
  }
]

const QUEUE_STATUSES = ['Queued', 'Preparing', 'Ready', 'Executing', 'Completed', 'Failed', 'Cancelled']

function findModule(key) {
  return AUTOMATION_MODULES.find((m) => m.key === key)
}

module.exports = { AUTOMATION_MODULES, QUEUE_STATUSES, findModule }
