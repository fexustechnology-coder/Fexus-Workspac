// =============================================================================
// DEPLOYMENT PROVIDERS (Phase 15)
// =============================================================================
// Real implementations of Vercel's and Netlify's documented deployment
// APIs — not placeholders. Both are gated behind an env var that doesn't
// exist until the Owner supplies it; until then, calling either throws a
// specific, honest error rather than pretending to deploy.
//
// HONESTY NOTE, stated here and repeated in the final report: this code
// has been written to match each provider's documented request/response
// shape as accurately as possible, but has NOT been executed against a
// live Vercel or Netlify account in this environment (no credentials, no
// network access here). Test it with real credentials before depending on
// it for a real client deployment.
// =============================================================================

const VERCEL_TOKEN = process.env.VERCEL_TOKEN || ''
const NETLIFY_TOKEN = process.env.NETLIFY_TOKEN || ''

function slugify(name) {
  return (name || 'fexus-site').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 50) || 'fexus-site'
}

async function deployToVercel(files, projectName) {
  if (!VERCEL_TOKEN) {
    throw new Error('Vercel is not configured. Set VERCEL_TOKEN in backend/.env (create one at vercel.com/account/tokens) to enable real deployment.')
  }
  const name = slugify(projectName)
  const response = await fetch('https://api.vercel.com/v13/deployments', {
    method: 'POST',
    headers: { Authorization: `Bearer ${VERCEL_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      files: files.map((f) => ({ file: f.path, data: f.content })),
      target: 'production'
    })
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data?.error?.message || 'Vercel deployment request failed')
  return { url: data.url ? `https://${data.url}` : null, id: data.id, raw: data }
}

async function deployToNetlify(files, projectName) {
  if (!NETLIFY_TOKEN) {
    throw new Error('Netlify is not configured. Set NETLIFY_TOKEN in backend/.env (create one at app.netlify.com/user/applications) to enable real deployment.')
  }
  const name = slugify(projectName)

  // Netlify's site-creation + file-digest deploy flow (documented API):
  // 1. Create (or reuse) a site.
  const siteRes = await fetch('https://api.netlify.com/api/v1/sites', {
    method: 'POST',
    headers: { Authorization: `Bearer ${NETLIFY_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  })
  const site = await siteRes.json()
  if (!siteRes.ok) throw new Error(site?.message || 'Netlify site creation failed')

  // 2. Deploy via the file-digest endpoint (base64 file contents keyed by path).
  const fileMap = {}
  for (const f of files) fileMap[`/${f.path}`] = f.content
  const deployRes = await fetch(`https://api.netlify.com/api/v1/sites/${site.id}/deploys`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${NETLIFY_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: fileMap })
  })
  const deploy = await deployRes.json()
  if (!deployRes.ok) throw new Error(deploy?.message || 'Netlify deployment request failed')

  return { url: site.ssl_url || site.url, id: deploy.id, siteId: site.id, raw: deploy }
}

async function attachDomainToVercel(projectName, domain) {
  if (!VERCEL_TOKEN) {
    throw new Error('Vercel is not configured. Set VERCEL_TOKEN in backend/.env to enable domain attachment.')
  }
  const response = await fetch(`https://api.vercel.com/v10/projects/${encodeURIComponent(slugify(projectName))}/domains`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${VERCEL_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: domain })
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data?.error?.message || 'Vercel domain attachment failed')
  // SSL note: Vercel auto-provisions a Let's Encrypt certificate once DNS
  // verification succeeds — there is no separate "enable SSL" call to make.
  return { domain: data.name, verified: !!data.verified, sslNote: 'Vercel auto-provisions SSL once DNS verification completes.' }
}

async function attachDomainToNetlify(siteId, domain) {
  if (!NETLIFY_TOKEN) {
    throw new Error('Netlify is not configured. Set NETLIFY_TOKEN in backend/.env to enable domain attachment.')
  }
  const response = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${NETLIFY_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ custom_domain: domain })
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data?.message || 'Netlify domain attachment failed')
  // SSL note: Netlify auto-provisions SSL (Let's Encrypt) for verified
  // custom domains — no separate "enable SSL" call exists in their API.
  return { domain: data.custom_domain, sslNote: 'Netlify auto-provisions SSL once the domain is verified.' }
}

function configuredProviders() {
  return { vercel: !!VERCEL_TOKEN, netlify: !!NETLIFY_TOKEN }
}

module.exports = { deployToVercel, deployToNetlify, attachDomainToVercel, attachDomainToNetlify, configuredProviders }
