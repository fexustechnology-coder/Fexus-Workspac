// Single mapping from a WorkflowStage/Workflow status to a FexusRobot
// animation variant. Used everywhere a robot needs to reflect real task
// state: Company Office, the Employee Office, and anywhere else.
//
// This replaces two prior duplicate mappings that existed before the
// Phase 6.5.1 consolidation: the old lib/workflowConstants.js
// robotVariantFor() (Task.stage-specific, 10 states) and
// lib/employeeAnimation.js employeeRobotVariant() (EmployeeTask.status-
// specific, 5 states). Both are gone — this is the one function now.

export function robotVariantForStatus(status) {
  switch (status) {
    case 'Draft':
    case 'Created':
      return 'idle'
    case 'Assigned':
    case 'Accepted':
      return 'walk' // being handed off / moving to receive the work
    case 'Working':
      return 'typing'
    case 'Waiting':
      return 'thinking'
    case 'Needs Review':
    case 'Waiting Approval':
      return 'reporting' // reporting up for review/approval
    case 'Approved':
    case 'Completed':
      return 'completed'
    default: // Cancelled | Failed | Archived | no active work
      return 'idle'
  }
}
