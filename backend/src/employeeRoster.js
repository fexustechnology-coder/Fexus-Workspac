// Phase 6 — AI Employees. Every entry is ONE employee with ONE fixed
// responsibility. No employee has chat, CEO, or Director capability — see
// routes/employeeRoster.js and EMPLOYEE RULES in the project README.
//
// departmentKey matches the existing Department rows seeded in Phase 2
// (backend/src/constants.js DEPARTMENTS) — "Project Department" here maps
// to the existing 'deployment' department key, same precedent Phase 5 used
// for the Project Director.

const EMPLOYEE_ROSTER = [
  // Marketing Department
  { name: 'Instagram Employee', departmentKey: 'marketing', responsibility: 'Instagram content and posting planning' },
  { name: 'Facebook Employee', departmentKey: 'marketing', responsibility: 'Facebook content and posting planning' },
  { name: 'LinkedIn Employee', departmentKey: 'marketing', responsibility: 'LinkedIn content and posting planning' },
  { name: 'Twitter Employee', departmentKey: 'marketing', responsibility: 'Twitter/X content and posting planning' },
  { name: 'YouTube Employee', departmentKey: 'marketing', responsibility: 'YouTube content and upload planning' },
  { name: 'Content Writer Employee', departmentKey: 'marketing', responsibility: 'Long-form content writing' },
  { name: 'Caption Writer Employee', departmentKey: 'marketing', responsibility: 'Social post caption writing' },
  { name: 'Hashtag Employee', departmentKey: 'marketing', responsibility: 'Hashtag research and sets' },
  { name: 'Meta Ads Employee', departmentKey: 'marketing', responsibility: 'Meta (Facebook/Instagram) ad planning' },
  { name: 'Google Ads Employee', departmentKey: 'marketing', responsibility: 'Google ad planning' },

  // Sales Department
  { name: 'Lead Finder Employee', departmentKey: 'sales', responsibility: 'Lead sourcing' },
  { name: 'Cold Email Employee', departmentKey: 'sales', responsibility: 'Cold email outreach drafting' },
  { name: 'Instagram Outreach Employee', departmentKey: 'sales', responsibility: 'Instagram DM outreach' },
  { name: 'LinkedIn Outreach Employee', departmentKey: 'sales', responsibility: 'LinkedIn outreach' },
  { name: 'CRM Employee', departmentKey: 'sales', responsibility: 'CRM record upkeep' },
  { name: 'Proposal Employee', departmentKey: 'sales', responsibility: 'Proposal drafting' },
  { name: 'Quotation Employee', departmentKey: 'sales', responsibility: 'Quotation drafting' },
  { name: 'Follow-up Employee', departmentKey: 'sales', responsibility: 'Client follow-up scheduling' },
  { name: 'Closer Employee', departmentKey: 'sales', responsibility: 'Deal closing support' },

  // Website Department
  { name: 'UI Designer Employee', departmentKey: 'website', responsibility: 'UI design' },
  { name: 'UX Employee', departmentKey: 'website', responsibility: 'UX planning' },
  { name: 'Frontend Developer Employee', departmentKey: 'website', responsibility: 'Frontend development' },
  { name: 'Backend Developer Employee', departmentKey: 'website', responsibility: 'Backend development' },
  { name: 'Database Engineer Employee', departmentKey: 'website', responsibility: 'Database engineering' },
  { name: 'QA Tester Employee', departmentKey: 'website', responsibility: 'QA testing' },
  { name: 'Deployment Employee', departmentKey: 'website', responsibility: 'Deployment planning' },
  { name: 'Documentation Employee', departmentKey: 'website', responsibility: 'Technical documentation' },

  // SEO Department
  { name: 'On Page SEO Employee', departmentKey: 'seo', responsibility: 'On-page SEO' },
  { name: 'Off Page SEO Employee', departmentKey: 'seo', responsibility: 'Off-page SEO' },
  { name: 'Technical SEO Employee', departmentKey: 'seo', responsibility: 'Technical SEO' },
  { name: 'AEO Employee', departmentKey: 'seo', responsibility: 'Answer Engine Optimization' },
  { name: 'GEO Employee', departmentKey: 'seo', responsibility: 'Generative Engine Optimization' },
  { name: 'SEO Reporting Employee', departmentKey: 'seo', responsibility: 'SEO reporting' },

  // Finance Department
  { name: 'Invoice Employee', departmentKey: 'finance', responsibility: 'Invoice preparation' },
  { name: 'Payments Employee', departmentKey: 'finance', responsibility: 'Payment tracking' },
  { name: 'Expenses Employee', departmentKey: 'finance', responsibility: 'Expense tracking' },
  { name: 'Forecast Employee', departmentKey: 'finance', responsibility: 'Financial forecasting' },
  { name: 'Tax Employee', departmentKey: 'finance', responsibility: 'Tax preparation support' },

  // Support Department
  { name: 'Ticket Employee', departmentKey: 'support', responsibility: 'Support ticket handling' },
  { name: 'Email Support Employee', departmentKey: 'support', responsibility: 'Email support' },
  { name: 'Chat Support Employee', departmentKey: 'support', responsibility: 'Chat support' },
  { name: 'Review Employee', departmentKey: 'support', responsibility: 'Review monitoring and responses' },
  { name: 'Renewal Employee', departmentKey: 'support', responsibility: 'Renewal follow-up' },

  // Project Department (maps to the existing 'deployment' department)
  { name: 'Task Manager Employee', departmentKey: 'deployment', responsibility: 'Task management' },
  { name: 'Meeting Employee', departmentKey: 'deployment', responsibility: 'Meeting scheduling and notes' },
  { name: 'Timeline Employee', departmentKey: 'deployment', responsibility: 'Timeline tracking' },
  { name: 'Quality Employee', departmentKey: 'deployment', responsibility: 'Quality checks' },
  { name: 'Delivery Employee', departmentKey: 'deployment', responsibility: 'Delivery coordination' },

  // Automation Department
  { name: 'Workflow Employee', departmentKey: 'automation', responsibility: 'Workflow design' },
  { name: 'API Employee', departmentKey: 'automation', responsibility: 'API integration planning' },
  { name: 'Integration Employee', departmentKey: 'automation', responsibility: 'Third-party integration planning' },
  { name: 'Automation Employee', departmentKey: 'automation', responsibility: 'Automation build planning' },

  // Analytics Department
  { name: 'Reporting Employee', departmentKey: 'analytics', responsibility: 'Report generation' },
  { name: 'Dashboard Employee', departmentKey: 'analytics', responsibility: 'Dashboard upkeep' },
  { name: 'KPI Employee', departmentKey: 'analytics', responsibility: 'KPI tracking' },
  { name: 'Growth Employee', departmentKey: 'analytics', responsibility: 'Growth analysis' },

  // Phase 18 — the two employees the simplified MVP office actually
  // centers on. Added here (additive, no existing rows changed) rather
  // than relabeling an unrelated existing employee for display purposes,
  // so their name and responsibility are accurate everywhere they appear
  // (Employee Office, CEO dashboards, Workflow assignments), not just in
  // the Robot Office view.
  { id: 'emp-email-campaign-specialist', name: 'Hira', departmentKey: 'marketing', responsibility: 'Runs multi-sender email campaigns end-to-end — imports contacts, drafts messages, and manages sender rotation and delivery.' },
  { id: 'emp-website-specialist', name: 'Shanza', departmentKey: 'website', responsibility: 'Builds and ships client websites end-to-end — from Website AI plans through generated code, preview, and publish.' }
]

module.exports = { EMPLOYEE_ROSTER }
