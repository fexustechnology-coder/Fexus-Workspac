// =============================================================================
// FEXUS LOCAL PC AGENT — ALLOWLISTED TOOLS
// =============================================================================
// Every function here does exactly one real, narrow thing. None of them
// accept or construct an arbitrary shell command from user input — every
// external process invocation uses execFile() (which does NOT spawn a
// shell to interpret the arguments, unlike exec()) with a fixed
// executable and validated arguments only.
//
// Windows-first, as specified. Each function checks process.platform and
// returns an honest "not implemented on this platform" error rather than
// silently doing nothing on macOS/Linux.
// =============================================================================

const { execFile } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { resolveWithinAllowed, allowedDirectories } = require('./pathSafety')
const gui = require('./gui')

function run(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true, timeout: 15000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr?.toString().trim() || err.message))
      resolve(stdout?.toString().trim() || '')
    })
  })
}

/**
 * Real fix for a reported failure: "Command failed: explorer.exe
 * C:\Users\...\Desktop" — even though Explorer genuinely opened the
 * folder. Root cause, confirmed directly (not assumed) by testing
 * Node's real execFile behavior: GUI-launching commands like
 * explorer.exe and `cmd.exe /c start` are real, well-documented Windows
 * quirks — they frequently exit with a non-zero code even on complete
 * success, because they hand the real request off to an existing shell
 * process rather than tracking it themselves. run()'s strict
 * "any non-zero exit is an error" check was treating this expected,
 * normal behavior as a real failure every single time.
 *
 * This helper only rejects on a GENUINE spawn-level failure — verified
 * directly: Node sets err.code to a real STRING (e.g. "ENOENT" if the
 * command truly doesn't exist) when the process never even started,
 * versus a NUMBER (the exit code) when it ran and merely returned
 * non-zero. Only the string case is treated as a real error here.
 * taskkill/shutdown/restart are NOT routed through this — their exit
 * codes are genuinely meaningful and must keep failing strictly.
 */
function runLaunch(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true, timeout: 15000 }, (err) => {
      if (err && typeof err.code === 'string') {
        // A real spawn-level failure — the command genuinely could not
        // be started at all (e.g. ENOENT). This is not swallowed.
        return reject(new Error(`Could not launch "${command}": ${err.message}`))
      }
      // Any numeric exit code (including non-zero) is real, expected
      // GUI-launcher behavior — not treated as failure.
      resolve()
    })
  })
}

function requireWindows(actionName) {
  if (process.platform !== 'win32') {
    const err = new Error(`${actionName} is only implemented for Windows in this MVP — this agent is currently running on ${process.platform}, not Windows. This is an honest platform limitation, not a bug.`)
    err.platformUnsupported = true
    throw err
  }
}

async function getDesktopFiles(config) {
  const dirs = allowedDirectories(config)
  if (!dirs.desktop) throw new Error('Desktop permission is not enabled. Enable it in FEXUS Local Agent Settings.')
  const entries = fs.readdirSync(dirs.desktop, { withFileTypes: true })
  return entries.map((e) => ({ name: e.name, type: e.isDirectory() ? 'folder' : 'file' }))
}

async function searchFiles(config, { query, directoryName }) {
  if (!query?.trim()) throw new Error('search_files requires a query')
  const dirs = allowedDirectories(config)
  const searchDirs = directoryName ? [dirs[directoryName]].filter(Boolean) : Object.values(dirs)
  if (searchDirs.length === 0) throw new Error('No permitted directories to search — enable at least one in Local Agent Settings.')

  const normalizedQuery = query.trim().toLowerCase()
  const matches = []
  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.toLowerCase().includes(normalizedQuery)) {
        matches.push({ name: entry.name, path: path.join(dir, entry.name) })
      }
    }
  }
  return matches
}

async function openFile(config, { filePath }) {
  const resolved = resolveWithinAllowed(filePath, config)
  requireWindows('open_file')
  // "start" is a cmd.exe builtin, not a real executable — invoked via
  // cmd.exe /c, with the file path as a real, separate argument (never
  // string-concatenated into a shell command), so a filename containing
  // spaces or special characters can't break out of the intended command.
  await runLaunch('cmd.exe', ['/c', 'start', '', resolved])
  return { opened: resolved }
}

/**
 * Real file writing — for report/research-output creation (Master
 * Computer-Use spec, section 17). A NEW file, so it can't be validated
 * via resolveWithinAllowed's existence check the way opening an
 * existing file is; instead the target directory is looked up directly
 * from the real, configured allowlist, and the filename is sanitized to
 * strip any path separators or ".." before joining — so a filename like
 * "../../evil.txt" can never escape the intended directory.
 */
async function writeFile(config, { directoryName, folderPath, fileName, content, append }) {
  const dirs = allowedDirectories(config)
  // Real fix for a confirmed live bug: writing into a folder CREATED
  // earlier in the same task (e.g. "create a folder, then save research
  // into it") previously had no real path — directoryName only ever
  // resolved one of the 4 fixed roots (desktop/documents/downloads/
  // fexusWorkspace), so a step targeting a brand-new subfolder like
  // "Interior Designers Test" would either throw "not a permitted
  // directory" or, if the planner fell back to a fixed key, silently
  // write to the Desktop ROOT instead of inside the new folder — the
  // exact "folder created but empty" symptom reported. folderPath is a
  // real, already-resolved absolute path (from a prior real
  // createFolder() call) — still validated against the real allowlist
  // via resolveWithinAllowed(), so a manufactured path still can't
  // escape the permitted directories.
  const dir = folderPath ? resolveWithinAllowed(folderPath, config) : dirs[directoryName]
  if (!dir) throw new Error(`"${directoryName || folderPath}" is not a permitted directory. Enable it in Local Agent Settings.`)
  const safeName = path.basename(fileName || '').replace(/[<>:"/\\|?*]/g, '_')
  if (!safeName) throw new Error('A valid file name is required.')
  const fullPath = path.join(dir, safeName)

  if (append && fs.existsSync(fullPath)) {
    fs.appendFileSync(fullPath, content || '', 'utf8')
  } else {
    fs.writeFileSync(fullPath, content || '', 'utf8')
  }

  // Real verification — re-reads the actual file back from disk rather
  // than trusting that fs.writeFileSync not throwing means the real
  // content landed correctly. This is what makes "file saved" an
  // actually-verified claim, not an assumed one.
  if (!fs.existsSync(fullPath)) throw new Error(`Write appeared to succeed but "${fullPath}" does not exist afterward — not reporting success.`)
  const actualContent = fs.readFileSync(fullPath, 'utf8')
  const expectedTail = content || ''
  if (!actualContent.endsWith(expectedTail) && expectedTail.length > 0) {
    throw new Error(`File exists but its real content does not match what was written — write may have been corrupted or intercepted.`)
  }
  const stat = fs.statSync(fullPath)
  return { written: fullPath, bytes: stat.size, verified: true }
}

/** Real folder creation, same directory-allowlist + filename-sanitizing
 * safety as writeFile above. */
async function createFolder(config, { directoryName, folderPath, folderName }) {
  const dirs = allowedDirectories(config)
  // Real fix: matches the same real fix already applied to writeFile()
  // — a nested subfolder inside an already-created folder (e.g.
  // generated website files with a real "src/components" path) needs a
  // real, already-resolved folderPath, not just one of the 4 fixed
  // roots. Still validated through the real allowlist via
  // resolveWithinAllowed(), so a manufactured path still can't escape
  // permitted directories.
  const dir = folderPath ? resolveWithinAllowed(folderPath, config) : dirs[directoryName]
  if (!dir) throw new Error(`"${directoryName || folderPath}" is not a permitted directory. Enable it in Local Agent Settings.`)
  // Real fix: folderName can be a genuine multi-level real path (e.g.
  // "src/components" from a generated website's real file structure)
  // — sanitizing via path.basename() alone would silently DROP every
  // segment but the last. Each real segment is sanitized individually
  // (still blocking "..") and rejoined, preserving genuine nested
  // structure without allowing directory traversal.
  const segments = (folderName || '').split(/[\\/]/).map((s) => s.trim()).filter((s) => s && s !== '.' && s !== '..')
  const safeSegments = segments.map((s) => s.replace(/[<>:"/\\|?*]/g, '_'))
  if (safeSegments.length === 0) throw new Error('A valid folder name is required.')
  const fullPath = path.join(dir, ...safeSegments)
  fs.mkdirSync(fullPath, { recursive: true })
  return { created: fullPath }
}

async function openFolder(config, { folderPath }) {
  // Real fix: a known directory KEY ("desktop", "documents",
  // "downloads", "fexusWorkspace") must resolve directly to its real
  // configured path — routing it through resolveWithinAllowed's
  // bare-filename search would instead look for a FILE/subfolder
  // literally named "desktop" inside an allowed root, which doesn't
  // exist, and would incorrectly fail. Only an actual sub-path (e.g.
  // "Desktop/Research") goes through the general resolver.
  const dirs = allowedDirectories(config)
  const resolved = dirs[folderPath] || resolveWithinAllowed(folderPath, config)
  requireWindows('open_folder')
  await runLaunch('explorer.exe', [resolved])
  return { opened: resolved }
}

async function openApplication(appConfig, { name }) {
  const key = (name || '').trim().toLowerCase()
  const entry = appConfig.allowedApplications[key]
  if (!entry) throw new Error(`"${name}" is not in the allowed applications list. Only these are supported: ${Object.keys(appConfig.allowedApplications).join(', ')}`)
  if (entry.type === 'url') return openUrl(appConfig, { url: entry.value })
  if (entry.type === 'launch') {
    // Real "just launch the app, no target" — distinct from opening a
    // specific URL. `start ""` with no further argument opens the OS
    // default browser to its own configured home/new-tab page.
    requireWindows('open_application')
    await runLaunch('cmd.exe', ['/c', 'start', ''])
    return { launched: name }
  }
  requireWindows('open_application')
  await runLaunch(entry.value, entry.args || [])
  return { opened: name }
}

/** Real "new tab" — if the browser isn't the foreground application yet,
 * launch it for real first (a genuine app launch, not a guess); either
 * way, follow with a real Ctrl+T keystroke, the standard Windows/Chrome/
 * Edge/Firefox shortcut for a new tab. This is the honest fallback the
 * brief itself asks for when direct tab-creation isn't otherwise
 * available: real keyboard input, not a fabricated success. */
async function newBrowserTab(appConfig) {
  const activeWindow = await gui.getActiveWindowTitle().catch(() => '')
  const browserLikelyOpen = /chrome|edge|firefox|browser/i.test(activeWindow)
  if (!browserLikelyOpen) {
    await openApplication(appConfig, { name: 'browser' })
    await new Promise((resolve) => setTimeout(resolve, 1200)) // real, brief wait for the real window to actually appear before sending a keystroke to it
  }
  await gui.pressKey('ctrl+t')
  return { newTab: true, launchedBrowserFirst: !browserLikelyOpen }
}

/** Real URL normalization — the exact gap the brief describes. Before
 * this, openUrl() rejected anything not already starting with a real
 * http(s):// scheme, meaning a bare "hevizonetech.com" would fail
 * outright rather than being normalized. Leaves already-valid URLs
 * completely untouched. */
function normalizeUrl(input) {
  let url = (input || '').trim()
  if (!url) return url
  // Fix a malformed single-colon scheme ("https:example.com") before
  // the general check below, since it would otherwise look like it
  // already has a scheme and get left broken.
  url = url.replace(/^(https?):(?!\/\/)/i, '$1://')
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`
  return url
}

async function openUrl(config, { url }) {
  const normalized = normalizeUrl(url)
  if (!/^https?:\/\/[^\s]+\.[^\s]+/i.test(normalized)) throw new Error(`"${url}" does not look like a valid URL, even after normalization.`)
  requireWindows('open_url')
  await runLaunch('cmd.exe', ['/c', 'start', '', normalized])
  return { opened: normalized }
}

/** Real, reliable search — builds the correct search URL for the named
 * application (Google Maps, Gmail) with the query properly URL-encoded,
 * then opens it. This is the honest alternative to blind coordinate
 * clicking into a search box whose real screen position this agent has
 * no way to know without actual computer vision. */
async function searchInApplication(appConfig, { name, query }) {
  const key = (name || '').trim().toLowerCase()
  const template = appConfig.searchableApplications[key]
  if (!template) throw new Error(`"${name}" does not support search. Supported: ${Object.keys(appConfig.searchableApplications).join(', ')}`)
  if (!query?.trim()) throw new Error('search requires a query')
  const url = template.replace('{query}', encodeURIComponent(query.trim()))
  return openUrl(appConfig, { url })
}

async function closeApplication(appConfig, { name }) {
  const key = (name || '').trim().toLowerCase()
  const entry = appConfig.allowedApplications[key]
  if (!entry || entry.type !== 'exe') throw new Error(`"${name}" is not a closeable allowed application.`)
  requireWindows('close_application')
  const exeName = entry.value.endsWith('.exe') ? entry.value : `${entry.value}.exe`
  await run('taskkill', ['/IM', exeName, '/F'])
  return { closed: name }
}

async function getSystemInfo() {
  // Real, non-sensitive system info only — no credentials, no network
  // config, no installed-software inventory.
  return {
    platform: os.platform(),
    hostname: os.hostname(),
    uptimeSeconds: Math.round(os.uptime()),
    totalMemoryMb: Math.round(os.totalmem() / 1024 / 1024),
    freeMemoryMb: Math.round(os.freemem() / 1024 / 1024)
  }
}

// Real GUI automation — thin wrappers over gui.js, kept here so every
// tool this server exposes is listed in one place.
async function mouseMove({ x, y, durationMs }) {
  if (typeof x !== 'number' || typeof y !== 'number') throw new Error('mouse_move requires numeric x and y')
  return gui.moveMouse(x, y, durationMs)
}
async function mouseClick({ button }) { return gui.clickMouse(button) }
async function typeText({ text, delayMs }) {
  if (!text) throw new Error('type_text requires text')
  return gui.typeText(text, delayMs)
}
async function pressKey({ key }) { return gui.pressKey(key) }
async function getScreenInfo() {
  const [cursor, screen, activeWindow] = await Promise.all([gui.getCursorPosition(), gui.getScreenSize(), gui.getActiveWindowTitle()])
  return { cursor, screen, activeWindowTitle: activeWindow }
}
async function captureScreen() { return gui.captureScreen() }

async function shutdown() {
  requireWindows('shutdown')
  // 30-second grace period, matching the confirmation copy shown to the
  // user ("shutting down will close your current session") — gives a
  // real window to cancel via `shutdown /a` if triggered by mistake.
  await run('shutdown', ['/s', '/t', '30'])
  return { scheduled: true, delaySeconds: 30 }
}

async function restart() {
  requireWindows('restart')
  await run('shutdown', ['/r', '/t', '30'])
  return { scheduled: true, delaySeconds: 30 }
}

module.exports = {
  getDesktopFiles, searchFiles, openFile, writeFile, createFolder, openFolder, openApplication,
  openUrl, searchInApplication, closeApplication, getSystemInfo, shutdown, restart,
  mouseMove, mouseClick, typeText, pressKey, getScreenInfo, captureScreen, newBrowserTab, normalizeUrl
}
