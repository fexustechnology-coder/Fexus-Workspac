const BASE_URL = import.meta.env.VITE_API_URL || 'https://fexus-space.onrender.com'

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    // Real, additive fix: the real response body can carry extra,
    // meaningful fields beyond just an error message (e.g. auth's
    // requiresVerification/requiresLicense flags) — attaching the full
    // real data object onto the thrown Error lets specific callers read
    // those when they need to, while every existing caller that only
    // reads err.message keeps working completely unchanged.
    const err = new Error(data.error || `Request to ${path} failed (${res.status})`)
    err.data = data
    err.status = res.status
    throw err
  }
  return data
}

function crud(resource) {
  return {
    list: () => request(`/api/${resource}`),
    create: (fields) => request(`/api/${resource}`, { method: 'POST', body: JSON.stringify(fields) }),
    update: (id, fields) => request(`/api/${resource}/${id}`, { method: 'PATCH', body: JSON.stringify(fields) }),
    remove: (id) => request(`/api/${resource}/${id}`, { method: 'DELETE' })
  }
}

export const api = {
  health: () => request('/api/health'),

  // Auth
  signup: (name, email, password) =>
    request('/api/auth/signup', { method: 'POST', body: JSON.stringify({ name, email, password }) }),
  verifyEmail: (email, code) =>
    request('/api/auth/verify-email', { method: 'POST', body: JSON.stringify({ email, code }) }),
  resendVerification: (email) =>
    request('/api/auth/resend-verification', { method: 'POST', body: JSON.stringify({ email }) }),
  login: (email, password, licenseId) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password, licenseId }) }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  me: () => request('/api/auth/me'),
  companyUsers: () => request('/api/auth/company-users'),

  // Company Brain
  getBrain: () => request('/api/company-brain'),
  updateBrain: (fields) => request('/api/company-brain', { method: 'PUT', body: JSON.stringify(fields) }),

  // Company Operating Manual — 30 permanent, versioned, searchable sections
  listBrainSections: (q = '') => request(`/api/brain-sections${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  getBrainSection: (key) => request(`/api/brain-sections/${key}`),
  updateBrainSection: (key, content) =>
    request(`/api/brain-sections/${key}`, { method: 'PUT', body: JSON.stringify({ content }) }),

  // Company Office — reads the Workflow Engine for anything task-related
  // (the old Task/EmployeeTask models were merged into it and removed).
  getDepartments: () => request('/api/departments'),
  getEmployees: () => request('/api/employees'),
  getCeo: () => request('/api/employees/ceo'),

  // Business Foundation — real CRUD, one set of methods per resource
  clients: crud('clients'),
  projects: crud('projects'),
  invoices: crud('invoices'),
  campaigns: crud('campaigns'),
  deals: crud('deals'),
  seoAudits: crud('seo-audits'),
  sites: crud('sites'),
  automations: crud('automations'),
  expenses: crud('expenses'),

  // Real dashboard/analytics numbers, computed live from the tables above
  getMetrics: () => request('/api/metrics'),

  // Meetings (minimal Business Foundation extension for the CEO Dashboard)
  meetings: crud('meetings'),
  leads: crud('leads'),
  supportTickets: crud('support-tickets'),

  // CEO Brain — Owner only. Always grounded in Company Brain + Business
  // Foundation; never bypasses them (see backend/src/routes/ceo.js).
  getCeoDashboard: () => request('/api/ceo/dashboard'),
  ceoChat: (message, history) =>
    request('/api/ceo/chat', { method: 'POST', body: JSON.stringify({ message, history }) }),

  // Director Brains — Owner only. Each director reads only its own
  // department's data + Company Brain (see backend/src/routes/directors.js).
  getDirectors: () => request('/api/directors'),
  getDirectorDashboard: (key) => request(`/api/directors/${key}/dashboard`),
  directorChat: (key, message, history) =>
    request(`/api/directors/${key}/chat`, { method: 'POST', body: JSON.stringify({ message, history }) }),

  // AI Employees — Owner only. Read-only roster; their task queue is now
  // the Workflow Engine's WorkflowStage (see workflows.* below). No
  // employee has chat capability (see PHASE 6 EMPLOYEE RULES).
  getEmployeeRoster: () => request('/api/employee-roster'),
  getEmployeeDetail: (id) => request(`/api/employee-roster/${id}`),

  // Workflow Engine — Owner only, and the SINGLE task system for the whole
  // app (Company Office, CEO Brain, Director Brains, and the Employee
  // Office all read/write this — see backend CHANGELOG.md for the
  // Phase 6.5.1 consolidation that merged the old Task/EmployeeTask models
  // into it).
  workflows: {
    list: () => request('/api/workflows'),
    get: (id) => request(`/api/workflows/${id}`),
    create: (fields) => request('/api/workflows', { method: 'POST', body: JSON.stringify(fields) }),
    update: (id, fields) => request(`/api/workflows/${id}`, { method: 'PATCH', body: JSON.stringify(fields) }),
    addStage: (id, fields) => request(`/api/workflows/${id}/stages`, { method: 'POST', body: JSON.stringify(fields) }),
    updateStage: (stageId, fields) => request(`/api/workflows/stages/${stageId}`, { method: 'PATCH', body: JSON.stringify(fields) }),
    addDependency: (blockingStageId, dependentStageId) =>
      request('/api/workflows/dependencies', { method: 'POST', body: JSON.stringify({ blockingStageId, dependentStageId }) }),
    removeDependency: (id) => request(`/api/workflows/dependencies/${id}`, { method: 'DELETE' }),
    addActivity: (id, message, stageId) =>
      request(`/api/workflows/${id}/activity`, { method: 'POST', body: JSON.stringify({ message, stageId }) }),
    ceoDashboard: () => request('/api/workflows/dashboard/ceo'),
    directorDashboard: (departmentKey) => request(`/api/workflows/dashboard/director/${departmentKey}`),
    employeeDashboard: (employeeId) => request(`/api/workflows/dashboard/employee/${employeeId}`)
  },
  workflowApprovals: {
    submit: (stageId) => request(`/api/workflow-approvals/submit/${stageId}`, { method: 'POST' }),
    approve: (approvalId, notes) => request(`/api/workflow-approvals/${approvalId}/approve`, { method: 'POST', body: JSON.stringify({ notes }) }),
    reject: (approvalId, notes) => request(`/api/workflow-approvals/${approvalId}/reject`, { method: 'POST', body: JSON.stringify({ notes }) })
  },
  workflowNotifications: {
    list: (unreadOnly) => request(`/api/workflow-notifications${unreadOnly ? '?unread=true' : ''}`),
    markRead: (id) => request(`/api/workflow-notifications/${id}/read`, { method: 'PATCH' }),
    markAllRead: () => request('/api/workflow-notifications/mark-all-read', { method: 'POST' })
  },

  // Automation Engine — Owner only. The execution layer downstream of the
  // Workflow Engine. Framework only: no external API is ever called from
  // here — every capability is a named job type, "prepared" not executed.
  automationJobs: {
    list: (module) => request(`/api/automation-jobs${module ? `?module=${module}` : ''}`),
    get: (id) => request(`/api/automation-jobs/${id}`),
    create: (fields) => request('/api/automation-jobs', { method: 'POST', body: JSON.stringify(fields) }),
    update: (id, fields) => request(`/api/automation-jobs/${id}`, { method: 'PATCH', body: JSON.stringify(fields) }),
    ownerDashboard: () => request('/api/automation-jobs/dashboard/owner'),
    ceoDashboard: () => request('/api/automation-jobs/dashboard/ceo')
  },

  // Memory Engine — Owner only. Temporary employee working memory, framework
  // only (no vector DB/RAG/embeddings/LLM memory). See backend/src/memoryManager.js.
  memory: {
    list: () => request('/api/memory'),
    get: (id) => request(`/api/memory/${id}`),
    load: (employeeId, stageId) => request('/api/memory', { method: 'POST', body: JSON.stringify({ employeeId, stageId }) }),
    update: (id, fields) => request(`/api/memory/${id}`, { method: 'PATCH', body: JSON.stringify(fields) }),
    refreshConversation: (id) => request(`/api/memory/${id}/refresh-conversation`, { method: 'POST' }),
    expire: (id) => request(`/api/memory/${id}/expire`, { method: 'POST' }),
    remove: (id) => request(`/api/memory/${id}`, { method: 'DELETE' }),
    cleanup: () => request('/api/memory/cleanup', { method: 'POST' }),
    ownerDashboard: () => request('/api/memory/dashboard/owner'),
    ceoDashboard: () => request('/api/memory/dashboard/ceo')
  },

  // Integration Layer — Owner only. A connector REGISTRY only — no real API
  // is ever called, no OAuth flow runs, no credential is stored.
  connectors: {
    list: (category) => request(`/api/connectors${category ? `?category=${category}` : ''}`),
    get: (id) => request(`/api/connectors/${id}`),
    update: (id, fields) => request(`/api/connectors/${id}`, { method: 'PATCH', body: JSON.stringify(fields) }),
    ownerDashboard: () => request('/api/connectors/dashboard/owner'),
    ceoDashboard: () => request('/api/connectors/dashboard/ceo')
  },

  // Website AI — Owner only. The first real AI Employee: plans websites,
  // never generates real code, never deploys. See backend/src/routes/websiteAI.js.
  websiteAI: {
    list: () => request('/api/website-ai/projects'),
    get: (id) => request(`/api/website-ai/projects/${id}`),
    generate: (fields) => request('/api/website-ai/projects', { method: 'POST', body: JSON.stringify(fields) }),
    updateStatus: (id, status) => request(`/api/website-ai/projects/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    sendToAutomation: (id, capability) => request(`/api/website-ai/projects/${id}/send-to-automation`, { method: 'POST', body: JSON.stringify({ capability }) }),
    dashboard: () => request('/api/website-ai/dashboard'),
    ceoDashboard: () => request('/api/website-ai/dashboard/ceo'),
    startExecution: (id) => request(`/api/website-ai/projects/${id}/start-execution`, { method: 'POST' }),
    progress: (id) => request(`/api/website-ai/projects/${id}/progress`),
    toggleChecklist: (id, name, checked) => request(`/api/website-ai/projects/${id}/quality-checklist`, { method: 'PATCH', body: JSON.stringify({ name, checked }) }),
    report: (id) => request(`/api/website-ai/projects/${id}/report`),

    // Phase 12 — real code generation, download, and the mandatory
    // two-step publish confirmation. Deployment is never automatic.
    planTiers: () => request('/api/website-ai/plan-tiers'),
    generateCode: (id, codeStack, mode) => request(`/api/website-ai/projects/${id}/generate-code`, { method: 'POST', body: JSON.stringify({ codeStack, mode }) }),
    // Phase 23 — Design Options
    generateDesignConcepts: (id) => request(`/api/website-ai/projects/${id}/design-concepts`, { method: 'POST' }),
    selectDesign: (id, fields) => request(`/api/website-ai/projects/${id}/select-design`, { method: 'POST', body: JSON.stringify(fields) }),
    preview: (id) => request(`/api/website-ai/projects/${id}/preview`),
    downloadUrl: (id) => `${BASE_URL}/api/website-ai/projects/${id}/download`,
    requestPublish: (id) => request(`/api/website-ai/projects/${id}/request-publish`, { method: 'POST' }),
    confirmPublish: (id, confirm, deploymentProvider) =>
      request(`/api/website-ai/projects/${id}/confirm-publish`, { method: 'POST', body: JSON.stringify({ confirm, deploymentProvider }) })
  },

  // Growth AI Department (Phase 13) — Marketing + Sales combined. Groq
  // Flash only. No AI for CRUD/dashboards/analytics — see backend/src/routes/growth.js.
  growth: {
    config: () => request('/api/growth/config'),
    searchPublicLists: () => request('/api/growth/leads/search-public-lists', { method: 'POST' }),
    searchMaps: (query) => request('/api/growth/leads/search-maps', { method: 'POST', body: JSON.stringify({ query }) }),
    importCsv: (csvText) => request('/api/growth/leads/import-csv', { method: 'POST', body: JSON.stringify({ csvText }) }),
    content: {
      list: (params) => request(`/api/growth/content${params ? `?${new URLSearchParams(params)}` : ''}`),
      get: (id) => request(`/api/growth/content/${id}`),
      generate: (fields) => request('/api/growth/content', { method: 'POST', body: JSON.stringify(fields) }),
      update: (id, fields) => request(`/api/growth/content/${id}`, { method: 'PATCH', body: JSON.stringify(fields) }),
      remove: (id) => request(`/api/growth/content/${id}`, { method: 'DELETE' }),
      submitForApproval: (id) => request(`/api/growth/content/${id}/submit-for-approval`, { method: 'POST' }),
      approve: (id, approve) => request(`/api/growth/content/${id}/approve`, { method: 'POST', body: JSON.stringify({ approve }) }),
      markSent: (id) => request(`/api/growth/content/${id}/mark-sent`, { method: 'POST' })
    },
    analytics: () => request('/api/growth/analytics'),

    // Phase 15 — Real Autonomous AI Company
    createLead: (fields) => request('/api/growth/leads', { method: 'POST', body: JSON.stringify(fields) }),
    portalLink: (leadId) => request(`/api/growth/leads/${leadId}/portal-link`),
    scheduleFollowup: (leadId, sendAt) => request(`/api/growth/leads/${leadId}/schedule-followup`, { method: 'POST', body: JSON.stringify({ sendAt }) }),
    scheduledEmails: {
      list: () => request('/api/growth/scheduled-emails'),
      cancel: (id) => request(`/api/growth/scheduled-emails/${id}`, { method: 'DELETE' })
    },
    autonomousSettings: {
      get: () => request('/api/growth/autonomous-settings'),
      update: (fields) => request('/api/growth/autonomous-settings', { method: 'PATCH', body: JSON.stringify(fields) })
    }
  },

  // Phase 15 — real Gmail OAuth2 connection (Owner-only actions).
  gmail: {
    status: () => request('/api/gmail/status'),
    connectUrl: () => `${BASE_URL}/api/gmail/connect`,
    disconnect: () => request('/api/gmail/disconnect', { method: 'POST' }),
    sendTest: (to) => request('/api/gmail/send-test', { method: 'POST', body: JSON.stringify({ to }) })
  },

  // Phase 15 — the PUBLIC Sales Portal a real client uses. No auth, no
  // cookies required — secured only by the unguessable token in the URL.
  salesPortal: {
    get: (token) => request(`/api/public/sales/${token}`),
    sendMessage: (token, message) => request(`/api/public/sales/${token}/message`, { method: 'POST', body: JSON.stringify({ message }) }),
    accept: (token) => request(`/api/public/sales/${token}/accept`, { method: 'POST' })
  },

  // Phase 16 — real payment infrastructure (Stripe + PayFast).
  payments: {
    config: () => request('/api/payments/config'),
    plans: () => request('/api/payments/plans'),
    subscription: () => request('/api/payments/subscription'),
    subscribe: (planKey, billingCycle) => request('/api/payments/subscribe', { method: 'POST', body: JSON.stringify({ planKey, billingCycle }) }),
    createProjectPayment: (leadId, amount, provider, description) =>
      request('/api/payments/project-payment', { method: 'POST', body: JSON.stringify({ leadId, amount, provider, description }) }),
    transactions: (params) => request(`/api/payments/transactions${params ? `?${new URLSearchParams(params)}` : ''}`)
  },

  // Phase 16 — real deployment status/logs + domain attachment.
  deployment: {
    status: (projectId) => request(`/api/website-ai/projects/${projectId}/deployment-status`),
    attachDomain: (projectId, domain) => request(`/api/website-ai/projects/${projectId}/attach-domain`, { method: 'POST', body: JSON.stringify({ domain }) })
  },

  // Phase 16 — Growth AI's real autonomous "Get Me More Clients" pipeline.
  getMoreClients: (query, location, count) =>
    request('/api/growth/get-more-clients', { method: 'POST', body: JSON.stringify({ query, location, count }) }),

  // Phase 17 — real, persistent Settings.
  settings: {
    get: () => request('/api/settings'),
    update: (fields) => request('/api/settings', { method: 'PATCH', body: JSON.stringify(fields) }),
    team: () => request('/api/settings/team'),
    invite: (email, role) => request('/api/settings/team/invite', { method: 'POST', body: JSON.stringify({ email, role }) }),
    revokeInvite: (id) => request(`/api/settings/team/invite/${id}`, { method: 'DELETE' }),
    apiKeys: {
      list: () => request('/api/settings/api-keys'),
      create: (name) => request('/api/settings/api-keys', { method: 'POST', body: JSON.stringify({ name }) }),
      revoke: (id) => request(`/api/settings/api-keys/${id}`, { method: 'DELETE' })
    }
  },

  // Phase 17 — the Advanced Gmail Campaign System, built on the existing
  // Gmail integration. Mounted separately from the Business Foundation's
  // `campaigns` CRUD (see api.campaigns above) to avoid any confusion.
  emailCampaigns: {
    list: () => request('/api/email-campaigns'),
    get: (id) => request(`/api/email-campaigns/${id}`),
    create: (name) => request('/api/email-campaigns', { method: 'POST', body: JSON.stringify({ name }) }),
    campaignSenders: (id) => request(`/api/email-campaigns/${id}/senders`),
    setSenders: (id, senderIds) => request(`/api/email-campaigns/${id}/senders`, { method: 'POST', body: JSON.stringify({ senderIds }) }),
    // Phase 23 — Multi-Template Rotation
    listTemplates: (id) => request(`/api/email-campaigns/${id}/templates`),
    addTemplate: (id, fields) => request(`/api/email-campaigns/${id}/templates`, { method: 'POST', body: JSON.stringify(fields) }),
    duplicateTemplate: (id, templateId) => request(`/api/email-campaigns/${id}/templates/${templateId}/duplicate`, { method: 'POST' }),
    updateTemplate: (id, templateId, fields) => request(`/api/email-campaigns/${id}/templates/${templateId}`, { method: 'PATCH', body: JSON.stringify(fields) }),
    removeTemplate: (id, templateId) => request(`/api/email-campaigns/${id}/templates/${templateId}`, { method: 'DELETE' }),
    reorderTemplates: (id, templateIds) => request(`/api/email-campaigns/${id}/templates/reorder`, { method: 'POST', body: JSON.stringify({ templateIds }) }),
    previewTemplateAssignment: (id) => request(`/api/email-campaigns/${id}/templates/preview`),
    report: (id) => request(`/api/email-campaigns/${id}/report`),
    update: (id, fields) => request(`/api/email-campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(fields) }),
    remove: (id) => request(`/api/email-campaigns/${id}`, { method: 'DELETE' }),
    importCsv: (id, csvText) => request(`/api/email-campaigns/${id}/import/csv`, { method: 'POST', body: JSON.stringify({ csvText }) }),
    previewCsv: (id, csvText) => request(`/api/email-campaigns/${id}/import/csv/preview`, { method: 'POST', body: JSON.stringify({ csvText }) }),
    importManual: (id, emails) => request(`/api/email-campaigns/${id}/import/manual`, { method: 'POST', body: JSON.stringify({ emails }) }),
    emails: (id) => request(`/api/email-campaigns/${id}/emails`),
    removeEmail: (id, emailId) => request(`/api/email-campaigns/${id}/emails/${emailId}`, { method: 'DELETE' }),
    start: (id) => request(`/api/email-campaigns/${id}/start`, { method: 'POST' }),
    pause: (id) => request(`/api/email-campaigns/${id}/pause`, { method: 'POST' }),
    resume: (id) => request(`/api/email-campaigns/${id}/resume`, { method: 'POST' }),
    cancel: (id) => request(`/api/email-campaigns/${id}/cancel`, { method: 'POST' }),
    restart: (id) => request(`/api/email-campaigns/${id}/restart`, { method: 'POST' }),
    retryFailed: (id) => request(`/api/email-campaigns/${id}/retry-failed`, { method: 'POST' }),
    live: (id) => request(`/api/email-campaigns/${id}/live`),
    logs: (id) => request(`/api/email-campaigns/${id}/logs`),
    downloadLogsUrl: (id) => `${BASE_URL}/api/email-campaigns/${id}/download-logs`,
    downloadReportUrl: (id) => `${BASE_URL}/api/email-campaigns/${id}/download-report`
  },

  // Phase 18 — the multi-sender Company Email System.
  senders: {
    list: () => request('/api/senders'),
    add: (email, displayName) => request('/api/senders', { method: 'POST', body: JSON.stringify({ email, displayName }) }),
    connect: (fields) => request('/api/senders/connect', { method: 'POST', body: JSON.stringify(fields) }),
    reverify: (id) => request(`/api/senders/${id}/reverify`, { method: 'POST' }),
    reconnect: (id) => request(`/api/senders/${id}/reconnect`, { method: 'POST' }),
    test: (id, to) => request(`/api/senders/${id}/test`, { method: 'POST', body: JSON.stringify({ to }) }),
    connectSmtp: (id, fields) => request(`/api/senders/${id}/connect-smtp`, { method: 'POST', body: JSON.stringify(fields) }),
    connectUrl: (id) => `${BASE_URL}/api/senders/${id}/connect`,
    update: (id, fields) => request(`/api/senders/${id}`, { method: 'PATCH', body: JSON.stringify(fields) }),
    remove: (id) => request(`/api/senders/${id}`, { method: 'DELETE' })
  },

  // Phase 22 — the real Email Template library.
  emailTemplates: {
    categories: () => request('/api/email-templates/categories'),
    list: () => request('/api/email-templates'),
    create: (fields) => request('/api/email-templates', { method: 'POST', body: JSON.stringify(fields) }),
    duplicate: (id) => request(`/api/email-templates/${id}/duplicate`, { method: 'POST' }),
    update: (id, fields) => request(`/api/email-templates/${id}`, { method: 'PATCH', body: JSON.stringify(fields) }),
    remove: (id) => request(`/api/email-templates/${id}`, { method: 'DELETE' }),
    preview: (subject, body, sample) => request('/api/email-templates/preview', { method: 'POST', body: JSON.stringify({ subject, body, sample }) })
  },

  // Phase 23 — License System
  license: {
    list: () => request('/api/license'),
    generate: (fields) => request('/api/license', { method: 'POST', body: JSON.stringify(fields) }),
    activate: (id) => request(`/api/license/${id}/activate`, { method: 'POST' }),
    deactivate: (id) => request(`/api/license/${id}/deactivate`, { method: 'POST' }),
    revoke: (id) => request(`/api/license/${id}/revoke`, { method: 'POST' }),
    remove: (id) => request(`/api/license/${id}`, { method: 'DELETE' }),
    clientSignup: (fields) => request('/api/license/client-signup', { method: 'POST', body: JSON.stringify(fields) }),
    clientLogin: (email, password, licenseId) => request('/api/license/client-login', { method: 'POST', body: JSON.stringify({ email, password, licenseId }) }),
    clientMe: () => request('/api/license/client/me'),
    clientLogout: () => request('/api/license/client-logout', { method: 'POST' }),
    resendEmail: (id) => request(`/api/license/${id}/resend-email`, { method: 'POST' })
  },

  // Voice Agent + Local PC Agent
  voice: {
    command: (transcript, conversationHistory, confirmed) => request('/api/voice/command', { method: 'POST', body: JSON.stringify({ transcript, conversationHistory, confirmed }) })
  },
  localAgent: {
    get: () => request('/api/local-agent'),
    regenerateToken: () => request('/api/local-agent/regenerate-token', { method: 'POST' }),
    updatePermissions: (fields) => request('/api/local-agent/permissions', { method: 'PATCH', body: JSON.stringify(fields) }),
    checkConnection: () => request('/api/local-agent/check-connection', { method: 'POST' })
  },

  // Master Computer-Use — real, persistent multi-step tasks
  tasks: {
    list: () => request('/api/tasks'),
    live: (id) => request(`/api/tasks/${id}/live`),
    pause: (id) => request(`/api/tasks/${id}/pause`, { method: 'POST' }),
    stop: (id) => request(`/api/tasks/${id}/stop`, { method: 'POST' }),
    resume: (id) => request(`/api/tasks/${id}/resume`, { method: 'POST' }),
    approve: (id) => request(`/api/tasks/${id}/approve`, { method: 'POST' })
  }
}
