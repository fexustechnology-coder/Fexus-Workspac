// The Executive Leadership Team. Each director is an expert in one
// department: reads Company Brain + their own department's real data,
// plans and advises, and NEVER executes work or writes data. Employees
// (who would actually execute tasks) are a future phase.
//
// `reads` is documentation shown in the UI, not enforcement — the actual
// data scoping happens in routes/directors.js's gatherDirectorContext().

const DIRECTORS = [
  {
    key: 'marketing',
    title: 'Marketing Director',
    departmentKey: 'marketing',
    responsibilities: [
      'Content Strategy', 'Social Media', 'Campaign Planning', 'Brand Growth',
      'Email Marketing', 'Ads Planning', 'Marketing Reports'
    ],
    reads: ['Company Brain', 'Campaign Database']
  },
  {
    key: 'sales',
    title: 'Sales Director',
    departmentKey: 'sales',
    responsibilities: [
      'Lead Management', 'CRM', 'Sales Pipeline', 'Quotations', 'Deals',
      'Client Follow-up', 'Revenue Planning'
    ],
    reads: ['Company Brain', 'Clients', 'Leads', 'Invoices', 'Deals']
  },
  {
    key: 'website',
    title: 'Website Director',
    departmentKey: 'website',
    responsibilities: [
      'Website Planning', 'UI', 'UX', 'Pages', 'Features',
      'Development Strategy', 'Website Reports'
    ],
    reads: ['Company Brain', 'Projects', 'Website Database (Sites)']
  },
  {
    key: 'seo',
    title: 'SEO Director',
    departmentKey: 'seo',
    responsibilities: [
      'SEO Planning', 'On Page', 'Off Page', 'Technical SEO', 'AEO', 'GEO',
      'SEO Reports'
    ],
    reads: ['Company Brain', 'SEO Database (Audits)', 'Website Data (Sites)']
  },
  {
    key: 'finance',
    title: 'Finance Director',
    departmentKey: 'finance',
    responsibilities: [
      'Revenue', 'Expenses', 'Burn Rate', 'MRR', 'ARR', 'Invoices',
      'Payments', 'Financial Reports'
    ],
    reads: ['Finance Database (Invoices, Expenses)', 'Company Brain']
  },
  {
    key: 'project',
    title: 'Project Director',
    departmentKey: 'deployment',
    responsibilities: ['Projects', 'Deadlines', 'Meetings', 'Employees', 'Progress', 'Resources'],
    reads: ['Projects', 'Meetings', 'Tasks', 'Company Brain']
  },
  {
    key: 'support',
    title: 'Support Director',
    departmentKey: 'support',
    responsibilities: [
      'Support', 'Tickets', 'Reviews', 'Customer Success', 'Renewals', 'Complaints'
    ],
    reads: ['Support Database (Tickets)', 'Clients', 'Company Brain']
  },
  {
    key: 'analytics',
    title: 'Analytics Director',
    departmentKey: 'analytics',
    responsibilities: ['KPIs', 'Charts', 'Reports', 'Performance', 'Growth', 'Forecasts'],
    reads: ['Everything (read-only)'],
    readOnly: true
  },
  {
    key: 'automation',
    title: 'Automation Director',
    departmentKey: 'automation',
    // NOTE: the source brief cut off after "Workflow Planning" with no
    // further responsibilities and no "Reads:" list. This entry is
    // intentionally minimal rather than padded with invented scope —
    // "reads" below is an inference from the pattern every other director
    // follows (their own department's table + Company Brain), flagged for
    // confirmation rather than treated as given.
    responsibilities: ['Workflow Planning'],
    reads: ['Automation Database', 'Company Brain'],
    inferredReads: true
  }
]

module.exports = { DIRECTORS }
