// =============================================================================
// FEXUS LOCAL PC AGENT — SERVER
// =============================================================================
// Run this on the SAME Windows machine as the person using FEXUS —
// `npm install && npm start` inside this folder. It listens on
// 127.0.0.1 ONLY (never 0.0.0.0), so it is never reachable from the
// network, even accidentally. The FEXUS backend (running on the same
// machine) talks to it over plain localhost HTTP, authenticated by a
// real shared token — never trusted just because the request came from
// FEXUS's own frontend or backend process.
// =============================================================================

const express = require('express')
const config = require('./config')
const tools = require('./tools')
const pathSafety = require('./pathSafety')

const app = express()
app.use(express.json())

function requireToken(req, res, next) {
  const token = req.headers['x-fexus-pairing-token']
  if (!config.pairingToken) {
    return res.status(503).json({ error: 'This Local Agent has no pairing token configured yet — set LOCAL_AGENT_PAIRING_TOKEN in local-agent/.env to the token shown in FEXUS Local Agent Settings.' })
  }
  if (!token || token !== config.pairingToken) {
    console.log(`[local-agent] Rejected request with invalid/missing pairing token.`)
    return res.status(401).json({ error: 'Invalid or missing pairing token.' })
  }
  next()
}

app.get('/health', (req, res) => {
  res.json({ ok: true, platform: process.platform, pairingConfigured: !!config.pairingToken })
})

app.use(requireToken)

// Every route below wraps its tool call the same way: real success data,
// or a real, specific error message — never a silent failure, never a
// fake success.
function wrap(fn) {
  return async (req, res) => {
    try {
      const result = await fn(req.body || {})
      console.log(`[local-agent] ${req.path} OK`)
      res.json({ ok: true, result })
    } catch (err) {
      console.log(`[local-agent] ${req.path} FAILED: ${err.message}`)
      res.status(err.platformUnsupported ? 501 : 400).json({ ok: false, error: err.message })
    }
  }
}

app.get('/desktop-files', wrap(() => tools.getDesktopFiles(config)))
app.post('/search-files', wrap((body) => tools.searchFiles(config, body)))
app.post('/open-file', wrap((body) => tools.openFile(config, body)))
app.post('/write-file', wrap((body) => tools.writeFile(config, body)))
app.post('/create-folder', wrap((body) => tools.createFolder(config, body)))
app.post('/open-folder', wrap((body) => tools.openFolder(config, body)))
app.post('/open-application', wrap((body) => tools.openApplication(config, body)))
app.post('/new-tab', wrap(() => tools.newBrowserTab(config)))
app.post('/open-url', wrap((body) => tools.openUrl(config, body)))
app.post('/search-in-application', wrap((body) => tools.searchInApplication(config, body)))
app.post('/close-application', wrap((body) => tools.closeApplication(config, body)))
app.get('/system-info', wrap(() => tools.getSystemInfo()))
app.get('/screen-info', wrap(() => tools.getScreenInfo()))
app.get('/capture-screen', wrap(() => tools.captureScreen()))
app.post('/mouse-move', wrap((body) => tools.mouseMove(body)))
app.post('/mouse-click', wrap((body) => tools.mouseClick(body)))
app.post('/type-text', wrap((body) => tools.typeText(body)))
app.post('/press-key', wrap((body) => tools.pressKey(body)))

// Shutdown/restart require BOTH a true `confirmed` flag in the request
// body (the FEXUS backend only sends this after the user has explicitly
// said yes) AND arriving through this same token-checked path — two real
// gates, not one.
app.post('/shutdown', wrap((body) => {
  if (!body.confirmed) throw new Error('Shutdown requires explicit confirmation — confirmed:true was not set.')
  return tools.shutdown()
}))
app.post('/restart', wrap((body) => {
  if (!body.confirmed) throw new Error('Restart requires explicit confirmation — confirmed:true was not set.')
  return tools.restart()
}))

app.listen(config.port, '127.0.0.1', () => {
  console.log(`[local-agent] FEXUS Local Agent listening on http://127.0.0.1:${config.port} (localhost only)`)
  console.log(`[local-agent] Pairing token configured: ${!!config.pairingToken}`)
  console.log(`[local-agent] Allowed directories: ${config.allowedDirectoryNames.join(', ') || '(none — configure LOCAL_AGENT_ALLOWED_DIRS)'}`)
  console.log(`[local-agent] Platform: ${process.platform}${process.platform !== 'win32' ? ' — file/app operations will honestly report as unsupported until run on Windows' : ''}`)
  // Real diagnostic logging, added while fixing a real reported Desktop
  // permission failure — the REAL, resolved path for each known
  // directory is now printed at startup, so a future path-resolution
  // issue (e.g. a different OneDrive folder-naming variant) is visible
  // immediately in the log, not something that has to be re-diagnosed
  // from scratch by reading the source code again.
  const dirs = pathSafety.knownDirectories()
  console.log(`[local-agent] Resolved real directory paths:`)
  for (const [name, resolvedPath] of Object.entries(dirs)) {
    console.log(`[local-agent]   ${name}: ${resolvedPath}${require('fs').existsSync(resolvedPath) ? '' : ' (does not exist yet — will be created on first use)'}`)
  }
})
