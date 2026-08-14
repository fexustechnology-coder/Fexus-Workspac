// Phase 13 — Growth AI Department (Marketing + Sales combined).

// The CRM pipeline, exactly as specified.
const PIPELINE_STAGES = ['New', 'Contacted', 'Interested', 'Meeting', 'Proposal', 'Won', 'Lost']

const LEAD_PRIORITIES = ['Critical', 'High', 'Medium', 'Low']

// Outreach channels — framework only, no real sending on any of them.
const OUTREACH_CHANNELS = ['Instagram', 'LinkedIn', 'Facebook', 'Email', 'WhatsApp', 'X']

// Marketing AI's 8 generation capabilities, exactly as specified.
const MARKETING_CONTENT_TYPES = [
  { key: 'campaign', label: 'Campaign' },
  { key: 'post', label: 'Post' },
  { key: 'caption', label: 'Caption' },
  { key: 'hashtags', label: 'Hashtags' },
  { key: 'ad', label: 'Ad' },
  { key: 'email_campaign', label: 'Email Campaign' },
  { key: 'content_calendar', label: 'Content Calendar' },
  { key: 'strategy', label: 'Strategy' }
]

// Sales AI's 6 generation capabilities, exactly as specified.
const SALES_CONTENT_TYPES = [
  { key: 'outreach', label: 'Personalized Outreach' },
  { key: 'proposal', label: 'Proposal' },
  { key: 'quotation', label: 'Quotation' },
  { key: 'follow_up', label: 'Follow-up Message' },
  { key: 'meeting_agenda', label: 'Meeting Request / Agenda' },
  { key: 'closing_message', label: 'Closing Message' }
]

// Meeting-support content, exactly as specified under "Meetings."
const MEETING_CONTENT_TYPES = [
  { key: 'meeting_agenda', label: 'Meeting Agenda' },
  { key: 'meeting_notes', label: 'Meeting Notes' },
  { key: 'meeting_reminder', label: 'Meeting Reminder' }
]

const ALL_CONTENT_TYPES = [...MARKETING_CONTENT_TYPES, ...SALES_CONTENT_TYPES, ...MEETING_CONTENT_TYPES]
  .filter((t, i, arr) => arr.findIndex((x) => x.key === t.key) === i) // de-dupe meeting_agenda appearing in both lists

const CONTENT_STATUSES = ['Draft', 'Pending Approval', 'Approved', 'Rejected']

// Proposal-specific structure, exactly as specified under "Proposals."
const PROPOSAL_SECTIONS = ['Scope', 'Deliverables', 'Timeline', 'Pricing', 'Terms']

module.exports = {
  PIPELINE_STAGES, LEAD_PRIORITIES, OUTREACH_CHANNELS,
  MARKETING_CONTENT_TYPES, SALES_CONTENT_TYPES, MEETING_CONTENT_TYPES, ALL_CONTENT_TYPES,
  CONTENT_STATUSES, PROPOSAL_SECTIONS
}
