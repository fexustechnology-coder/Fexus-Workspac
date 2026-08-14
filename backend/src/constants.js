// Departments seeded for the Robot Office (Company Office / CEO Brain /
// Director Brains / Employee Office all reference these keys).
//
// NOTE: prior to the Phase 6.5.1 consolidation, this file also exported a
// 10-stage `STAGES` list and `nextStage()` helper that drove the old `Task`
// model's CEO/Director/Employee escalation animation. That model was
// merged into the Workflow Engine (see schema.prisma) — the equivalent
// lifecycle now lives in backend/src/workflowConstants.js (LIFECYCLE).
const DEPARTMENTS = [
  { key: 'website', name: 'Website Director' },
  { key: 'marketing', name: 'Marketing Director' },
  { key: 'sales', name: 'Sales Director' },
  { key: 'seo', name: 'SEO Director' },
  { key: 'deployment', name: 'Deployment Director' },
  { key: 'finance', name: 'Finance Director' },
  { key: 'support', name: 'Support Director' },
  { key: 'analytics', name: 'Analytics Director' },
  { key: 'automation', name: 'Automation Director' }
]

module.exports = { DEPARTMENTS }
