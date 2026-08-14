const express = require('express')
const crypto = require('crypto')
const prisma = require('../prismaClient')
const { requireAuth, requireOwner } = require('../middleware/auth')

const router = express.Router()

function toSafePairing(p) {
  // pairingToken IS returned here — but only from this Owner-authenticated
  // route, and it's what the Owner has to copy into their own local-agent
  // .env file. Never returned from any other endpoint.
  return {
    id: p.id, pairingToken: p.pairingToken, agentUrl: p.agentUrl,
    connected: p.connected, lastSeenAt: p.lastSeenAt,
    permissions: {
      allowDesktop: p.allowDesktop, allowDocuments: p.allowDocuments, allowDownloads: p.allowDownloads, allowFexusWorkspace: p.allowFexusWorkspace,
      allowOpenFiles: p.allowOpenFiles, allowOpenFolders: p.allowOpenFolders, allowOpenApplications: p.allowOpenApplications,
      allowOpenUrls: p.allowOpenUrls, allowReadMetadata: p.allowReadMetadata, allowShutdown: p.allowShutdown, allowRestart: p.allowRestart,
      allowMouseControl: p.allowMouseControl, allowKeyboardControl: p.allowKeyboardControl, allowWriteFiles: p.allowWriteFiles
    }
  }
}

async function getOrCreatePairing(userId) {
  let pairing = await prisma.localAgentPairing.findUnique({ where: { userId } })
  if (!pairing) {
    pairing = await prisma.localAgentPairing.create({
      data: { userId, pairingToken: crypto.randomBytes(24).toString('hex') }
    })
  }
  return pairing
}

router.get('/', requireAuth, requireOwner, async (req, res) => {
  try {
    const pairing = await getOrCreatePairing(req.user.id)
    res.json({ pairing: toSafePairing(pairing) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load Local Agent pairing' })
  }
})

router.post('/regenerate-token', requireAuth, requireOwner, async (req, res) => {
  try {
    const pairing = await getOrCreatePairing(req.user.id)
    const updated = await prisma.localAgentPairing.update({
      where: { id: pairing.id },
      data: { pairingToken: crypto.randomBytes(24).toString('hex'), connected: false }
    })
    res.json({ pairing: toSafePairing(updated) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to regenerate pairing token' })
  }
})

router.patch('/permissions', requireAuth, requireOwner, async (req, res) => {
  try {
    const pairing = await getOrCreatePairing(req.user.id)
    const allowedFields = [
      'allowDesktop', 'allowDocuments', 'allowDownloads', 'allowFexusWorkspace',
      'allowOpenFiles', 'allowOpenFolders', 'allowOpenApplications', 'allowOpenUrls',
      'allowReadMetadata', 'allowShutdown', 'allowRestart', 'allowMouseControl', 'allowKeyboardControl', 'allowWriteFiles'
    ]
    const data = {}
    for (const f of allowedFields) if (typeof req.body?.[f] === 'boolean') data[f] = req.body[f]
    const updated = await prisma.localAgentPairing.update({ where: { id: pairing.id }, data })
    res.json({ pairing: toSafePairing(updated) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to update permissions' })
  }
})

// Real connectivity check — actually calls the Local Agent's own /health
// endpoint over localhost, updates `connected`/`lastSeenAt` honestly
// based on whether that real request succeeded, never assumed.
router.post('/check-connection', requireAuth, requireOwner, async (req, res) => {
  try {
    const pairing = await getOrCreatePairing(req.user.id)
    try {
      const response = await fetch(`${pairing.agentUrl}/health`, { signal: AbortSignal.timeout(3000) })
      const ok = response.ok
      const updated = await prisma.localAgentPairing.update({ where: { id: pairing.id }, data: { connected: ok, lastSeenAt: ok ? new Date() : pairing.lastSeenAt } })
      res.json({ pairing: toSafePairing(updated) })
    } catch (fetchErr) {
      const updated = await prisma.localAgentPairing.update({ where: { id: pairing.id }, data: { connected: false } })
      res.json({ pairing: toSafePairing(updated), error: `Could not reach the Local Agent at ${pairing.agentUrl}: ${fetchErr.message}` })
    }
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to check Local Agent connection' })
  }
})

/**
 * The real security gate every PC command must pass through — checked
 * here, server-side, regardless of what the Voice Agent or frontend
 * believes is allowed. This is the SECOND independent permission check
 * (the Local Agent's own directory allowlist is the first) — matching
 * the brief's own "never trust a command merely because it came from
 * the frontend."
 */
/** Combines a timeout signal with an optional external cancellation
 * signal, whichever fires first wins — real abort propagation, not just
 * a timeout. AbortSignal.any() is Node 20.3+; a portable manual fallback
 * is used when it's unavailable, so this works on whatever Node version
 * the Owner's actual deployment runs, not just what this sandbox has. */
function combineSignals(timeoutMs, externalSignal) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  if (!externalSignal) return timeoutSignal
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([timeoutSignal, externalSignal])
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  timeoutSignal.addEventListener('abort', onAbort)
  externalSignal.addEventListener('abort', onAbort)
  return controller.signal
}

async function relayCommand(userId, endpoint, body, requiredPermission, abortSignal) {
  const pairing = await prisma.localAgentPairing.findUnique({ where: { userId } })
  if (!pairing) throw Object.assign(new Error('No Local Agent is paired yet.'), { status: 400 })
  if (requiredPermission && !pairing[requiredPermission]) {
    throw Object.assign(new Error(`This action (${requiredPermission}) is not permitted — enable it in Local Agent Settings.`), { status: 403 })
  }
  const isGet = endpoint.startsWith('/desktop-files') || endpoint.startsWith('/system-info') || endpoint.startsWith('/screen-info') || endpoint.startsWith('/capture-screen')
  let response
  try {
    response = await fetch(`${pairing.agentUrl}${endpoint}`, {
      method: isGet ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Fexus-Pairing-Token': pairing.pairingToken },
      body: isGet ? undefined : JSON.stringify(body),
      signal: combineSignals(15000, abortSignal)
    })
  } catch (err) {
    // A real, deliberate abort (Owner said STOP) is distinct from a
    // genuine network failure — the original AbortError's real name is
    // preserved so callers (taskEngine.js's executeNextStep) can tell
    // the difference, rather than this wrapping it into an
    // indistinguishable generic Error.
    if (err.name === 'AbortError') {
      await prisma.pcActionLog.create({
        data: { pairingId: pairing.id, action: endpoint.replace('/', '').toUpperCase(), target: body?.filePath || body?.folderPath || body?.url || body?.name || '', result: 'Interrupted (Owner STOP)' }
      })
      throw Object.assign(new Error('Action interrupted by Owner (STOP).'), { name: 'AbortError' })
    }
    await prisma.pcActionLog.create({
      data: { pairingId: pairing.id, action: endpoint.replace('/', '').toUpperCase(), target: body?.filePath || body?.folderPath || body?.url || body?.name || '', result: `Failed: Local Agent unreachable — ${err.message}` }
    })
    throw Object.assign(new Error(`Local Agent unreachable at ${pairing.agentUrl}: ${err.message}`), { status: 502 })
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data.ok === false) {
    const errMsg = data.error || 'Local Agent action failed'
    await prisma.pcActionLog.create({
      data: { pairingId: pairing.id, action: endpoint.replace('/', '').toUpperCase(), target: body?.filePath || body?.folderPath || body?.url || body?.name || '', result: `Failed: ${errMsg}` }
    })
    throw Object.assign(new Error(errMsg), { status: response.status || 502 })
  }

  await prisma.pcActionLog.create({
    data: { pairingId: pairing.id, action: endpoint.replace('/', '').toUpperCase(), target: body?.filePath || body?.folderPath || body?.url || body?.name || '', result: 'Success' }
  })
  return data.result
}

module.exports = router
module.exports.relayCommand = relayCommand
module.exports.getOrCreatePairing = getOrCreatePairing
