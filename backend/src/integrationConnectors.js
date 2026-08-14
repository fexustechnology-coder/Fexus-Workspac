// Phase 9 — Integration Layer. The full connector catalog, exactly as
// specified. Every entry here is a PLACEHOLDER definition — a name, a
// category, and a description of what auth it would eventually need. None
// of this code calls an external API, requests a token, or stores a real
// credential anywhere. See routes/integrationLayer.js.

const CONNECTORS = [
  // Website Connectors
  { key: 'github', name: 'GitHub', category: 'website', authKind: 'OAuth 2.0' },
  { key: 'gitlab', name: 'GitLab', category: 'website', authKind: 'OAuth 2.0' },
  { key: 'bitbucket', name: 'Bitbucket', category: 'website', authKind: 'OAuth 2.0' },
  { key: 'vercel', name: 'Vercel', category: 'website', authKind: 'API Token' },
  { key: 'netlify', name: 'Netlify', category: 'website', authKind: 'API Token' },
  { key: 'cloudflare', name: 'Cloudflare', category: 'website', authKind: 'API Token' },
  { key: 'hostinger', name: 'Hostinger', category: 'website', authKind: 'API Token' },
  { key: 'digitalocean', name: 'DigitalOcean', category: 'website', authKind: 'API Token' },
  { key: 'aws', name: 'AWS', category: 'website', authKind: 'IAM Credentials' },
  { key: 'ssl', name: 'SSL', category: 'website', authKind: 'Certificate Authority Account' },
  { key: 'dns', name: 'DNS', category: 'website', authKind: 'Registrar API Token' },
  { key: 'domains', name: 'Domains', category: 'website', authKind: 'Registrar API Token' },
  { key: 'deployment', name: 'Deployment', category: 'website', authKind: 'Provider API Token' },

  // Marketing Connectors
  { key: 'instagram', name: 'Instagram', category: 'marketing', authKind: 'OAuth 2.0 (Meta)' },
  { key: 'facebook', name: 'Facebook', category: 'marketing', authKind: 'OAuth 2.0 (Meta)' },
  { key: 'linkedin', name: 'LinkedIn', category: 'marketing', authKind: 'OAuth 2.0' },
  { key: 'x', name: 'X', category: 'marketing', authKind: 'OAuth 2.0' },
  { key: 'youtube', name: 'YouTube', category: 'marketing', authKind: 'OAuth 2.0 (Google)' },
  { key: 'tiktok', name: 'TikTok', category: 'marketing', authKind: 'OAuth 2.0' },
  { key: 'meta_ads', name: 'Meta Ads', category: 'marketing', authKind: 'OAuth 2.0 (Meta)' },
  { key: 'google_ads', name: 'Google Ads', category: 'marketing', authKind: 'OAuth 2.0 (Google)' },

  // Sales Connectors
  { key: 'smtp', name: 'SMTP', category: 'sales', authKind: 'Server Credentials' },
  { key: 'gmail', name: 'Gmail', category: 'sales', authKind: 'OAuth 2.0 (Google)' },
  { key: 'outlook', name: 'Outlook', category: 'sales', authKind: 'OAuth 2.0 (Microsoft)' },
  { key: 'calendly', name: 'Calendly', category: 'sales', authKind: 'API Token' },
  { key: 'crm', name: 'CRM', category: 'sales', authKind: 'API Token' },
  { key: 'whatsapp', name: 'WhatsApp', category: 'sales', authKind: 'Business API Token' },

  // SEO Connectors
  { key: 'google_search_console', name: 'Google Search Console', category: 'seo', authKind: 'OAuth 2.0 (Google)' },
  { key: 'google_analytics', name: 'Google Analytics', category: 'seo', authKind: 'OAuth 2.0 (Google)' },
  { key: 'google_business', name: 'Google Business', category: 'seo', authKind: 'OAuth 2.0 (Google)' },
  { key: 'bing_webmaster', name: 'Bing Webmaster', category: 'seo', authKind: 'API Key' },
  { key: 'pagespeed', name: 'PageSpeed', category: 'seo', authKind: 'API Key' },

  // Finance Connectors
  { key: 'stripe', name: 'Stripe', category: 'finance', authKind: 'API Key' },
  { key: 'paypal', name: 'PayPal', category: 'finance', authKind: 'OAuth 2.0' },
  { key: 'wise', name: 'Wise', category: 'finance', authKind: 'API Key' },
  { key: 'invoices', name: 'Invoices', category: 'finance', authKind: 'Provider API Token' },
  { key: 'accounting', name: 'Accounting', category: 'finance', authKind: 'OAuth 2.0' },

  // Support Connectors
  { key: 'support_email', name: 'Email', category: 'support', authKind: 'OAuth 2.0 / IMAP' },
  { key: 'chat', name: 'Chat', category: 'support', authKind: 'API Token' },
  { key: 'helpdesk', name: 'Helpdesk', category: 'support', authKind: 'API Token' },
  { key: 'reviews', name: 'Reviews', category: 'support', authKind: 'API Token' },

  // Automation Connectors
  { key: 'webhook', name: 'Webhook', category: 'automation', authKind: 'Signing Secret' },
  { key: 'rest_api', name: 'REST API', category: 'automation', authKind: 'API Key' },
  { key: 'graphql', name: 'GraphQL', category: 'automation', authKind: 'API Key' },
  { key: 'file_storage', name: 'File Storage', category: 'automation', authKind: 'Access Key' },
  { key: 'cloud_storage', name: 'Cloud Storage', category: 'automation', authKind: 'Access Key' }
]

const CATEGORIES = [
  { key: 'website', name: 'Website Connectors' },
  { key: 'marketing', name: 'Marketing Connectors' },
  { key: 'sales', name: 'Sales Connectors' },
  { key: 'seo', name: 'SEO Connectors' },
  { key: 'finance', name: 'Finance Connectors' },
  { key: 'support', name: 'Support Connectors' },
  { key: 'automation', name: 'Automation Connectors' }
]

const STATUSES = ['Connected', 'Disconnected', 'Coming Soon']
const HEALTH_STATES = ['Healthy', 'Unavailable', 'Unknown']

module.exports = { CONNECTORS, CATEGORIES, STATUSES, HEALTH_STATES }
