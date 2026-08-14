// The Company Operating Manual — 30 permanent, versioned, searchable
// sections inside Company Brain. This list is the single source of truth
// for section keys/titles/groups on both the API and the seed-on-read logic
// in routes/brainSections.js. Adding a new section later means adding one
// entry here — nothing else needs to change.

const BRAIN_SECTIONS = [
  // Processes
  { key: 'sops', title: 'Standard Operating Procedures (SOPs)', group: 'Processes' },
  { key: 'sales_process', title: 'Sales Process', group: 'Processes' },
  { key: 'marketing_process', title: 'Marketing Process', group: 'Processes' },
  { key: 'website_dev_process', title: 'Website Development Process', group: 'Processes' },
  { key: 'seo_process', title: 'SEO Process', group: 'Processes' },
  { key: 'project_delivery_process', title: 'Project Delivery Process', group: 'Processes' },
  { key: 'employee_workflow', title: 'Employee Workflow', group: 'Processes' },
  { key: 'approval_workflow', title: 'Approval Workflow', group: 'Processes' },

  // Policies & Rules
  { key: 'internal_policies', title: 'Internal Policies', group: 'Policies & Rules' },
  { key: 'department_rules', title: 'Department Rules', group: 'Policies & Rules' },
  { key: 'client_handling_rules', title: 'Client Handling Rules', group: 'Policies & Rules' },
  { key: 'security_policies', title: 'Security Policies', group: 'Policies & Rules' },

  // Standards
  { key: 'quality_control_standards', title: 'Quality Control Standards', group: 'Standards' },
  { key: 'communication_standards', title: 'Communication Standards', group: 'Standards' },
  { key: 'design_standards', title: 'Design Standards', group: 'Standards' },
  { key: 'coding_standards', title: 'Coding Standards', group: 'Standards' },
  { key: 'documentation_standards', title: 'Documentation Standards', group: 'Standards' },

  // Brand & Templates
  { key: 'brand_guidelines', title: 'Brand Guidelines', group: 'Brand & Templates' },
  { key: 'proposal_templates', title: 'Proposal Templates', group: 'Brand & Templates' },
  { key: 'email_templates', title: 'Email Templates', group: 'Brand & Templates' },
  { key: 'message_templates', title: 'Message Templates', group: 'Brand & Templates' },

  // Knowledge Base
  { key: 'faq', title: 'Frequently Asked Questions', group: 'Knowledge Base' },
  { key: 'common_problems', title: 'Common Problems', group: 'Knowledge Base' },
  { key: 'common_solutions', title: 'Common Solutions', group: 'Knowledge Base' },
  { key: 'best_practices', title: 'Best Practices', group: 'Knowledge Base' },
  { key: 'lessons_learned', title: 'Lessons Learned', group: 'Knowledge Base' },

  // Company Direction
  { key: 'company_history', title: 'Company History', group: 'Company Direction' },
  { key: 'future_goals', title: 'Future Goals', group: 'Company Direction' },
  { key: 'vision_roadmap', title: 'Vision Roadmap', group: 'Company Direction' },
  { key: 'ai_global_instructions', title: 'AI Global Instructions', group: 'Company Direction' }
]

module.exports = { BRAIN_SECTIONS }
