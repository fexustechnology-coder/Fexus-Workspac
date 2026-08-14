// Phase 6.5 — Workflow Engine constants. Single source of truth for the
// lifecycle used by both Workflow and WorkflowStage records.

const LIFECYCLE = [
  'Draft', 'Created', 'Assigned', 'Accepted', 'Working', 'Waiting',
  'Needs Review', 'Waiting Approval', 'Approved', 'Completed',
  'Cancelled', 'Failed', 'Archived'
]

const PRIORITIES = ['Critical', 'High', 'Medium', 'Low']

// Groups the 13 granular states into the ~6 columns a premium Kanban board
// actually shows (Notion/Linear/ClickUp all do this — nobody ships a
// 13-column board). The exact status is still stored and shown per-card.
const LIFECYCLE_GROUPS = {
  'Not Started': ['Draft', 'Created'],
  Assigned: ['Assigned', 'Accepted'],
  'In Progress': ['Working', 'Waiting'],
  Review: ['Needs Review', 'Waiting Approval'],
  Done: ['Approved', 'Completed'],
  Stopped: ['Cancelled', 'Failed', 'Archived']
}

function groupForStatus(status) {
  for (const [group, statuses] of Object.entries(LIFECYCLE_GROUPS)) {
    if (statuses.includes(status)) return group
  }
  return 'Not Started'
}

// Employees cannot self-complete a stage — the approval system is what
// moves a stage from "Needs Review"/"Waiting Approval" into "Approved" or
// "Completed". This is enforced in routes/workflows.js, not just documented.
const EMPLOYEE_FORBIDDEN_STATUSES = new Set(['Approved', 'Completed'])

module.exports = { LIFECYCLE, PRIORITIES, LIFECYCLE_GROUPS, groupForStatus, EMPLOYEE_FORBIDDEN_STATUSES }
