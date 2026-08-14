// Mirrors backend/src/automationModules.js

export const AUTOMATION_MODULES = [
  { key: 'website', name: 'Website Automation', capabilities: ['Generate Website Job', 'Track Build Status', 'Prepare Deployment', 'Prepare Domain Assignment', 'Prepare Hosting Assignment', 'Prepare SSL Assignment', 'Prepare Go Live'] },
  { key: 'marketing', name: 'Marketing Automation', capabilities: ['Prepare Instagram Post', 'Prepare Facebook Post', 'Prepare LinkedIn Post', 'Prepare X Post', 'Prepare Email Campaign', 'Prepare Meta Campaign', 'Prepare Google Campaign'] },
  { key: 'seo', name: 'SEO Automation', capabilities: ['Prepare Audit', 'Prepare Technical SEO', 'Prepare On Page', 'Prepare Off Page', 'Prepare AEO', 'Prepare GEO', 'Prepare Reports'] },
  { key: 'sales', name: 'Sales Automation', capabilities: ['Prepare Outreach', 'Prepare CRM Update', 'Prepare Proposal', 'Prepare Quote', 'Prepare Follow-up', 'Prepare Closing Pipeline'] },
  { key: 'finance', name: 'Finance Automation', capabilities: ['Prepare Invoice', 'Prepare Payment', 'Prepare Expense', 'Prepare Financial Report'] },
  { key: 'support', name: 'Support Automation', capabilities: ['Prepare Ticket', 'Prepare Reply', 'Prepare Review Request', 'Prepare Renewal Reminder'] },
  { key: 'analytics', name: 'Analytics Automation', capabilities: [] }, // no capabilities were specified in the brief
  { key: 'deployment', name: 'Deployment Automation', capabilities: ['Prepare Domain', 'Prepare Hosting', 'Prepare SSL', 'Prepare DNS', 'Prepare Deployment'] }
]

export const QUEUE_STATUSES = ['Queued', 'Preparing', 'Ready', 'Executing', 'Completed', 'Failed', 'Cancelled']

export const STATUS_TONE = {
  Queued: 'neutral',
  Preparing: 'warning',
  Ready: 'ferozi',
  Executing: 'ferozi',
  Completed: 'success',
  Failed: 'danger',
  Cancelled: 'neutral'
}

export function findModule(key) {
  return AUTOMATION_MODULES.find((m) => m.key === key)
}
