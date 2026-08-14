// Mirrors backend/src/workflowConstants.js

export const LIFECYCLE = [
  'Draft', 'Created', 'Assigned', 'Accepted', 'Working', 'Waiting',
  'Needs Review', 'Waiting Approval', 'Approved', 'Completed',
  'Cancelled', 'Failed', 'Archived'
]

export const PRIORITIES = ['Critical', 'High', 'Medium', 'Low']

export const PRIORITY_TONE = { Critical: 'danger', High: 'warning', Medium: 'ferozi', Low: 'neutral' }

export const LIFECYCLE_GROUPS = {
  'Not Started': ['Draft', 'Created'],
  Assigned: ['Assigned', 'Accepted'],
  'In Progress': ['Working', 'Waiting'],
  Review: ['Needs Review', 'Waiting Approval'],
  Done: ['Approved', 'Completed'],
  Stopped: ['Cancelled', 'Failed', 'Archived']
}

export const GROUP_ORDER = ['Not Started', 'Assigned', 'In Progress', 'Review', 'Done', 'Stopped']

export function groupForStatus(status) {
  for (const [group, statuses] of Object.entries(LIFECYCLE_GROUPS)) {
    if (statuses.includes(status)) return group
  }
  return 'Not Started'
}

// Statuses settable via a plain dropdown — Waiting Approval/Approved/Completed
// only happen through the submit/approve/reject actions.
export const DIRECT_STATUSES = LIFECYCLE.filter((s) => !['Waiting Approval', 'Approved', 'Completed'].includes(s))
