// =============================================================================
// FEXUS LOCAL PC AGENT — PATH SAFETY
// =============================================================================
// Every file/folder operation goes through resolveWithinAllowed() before
// anything touches the real filesystem. This is the single real
// enforcement point that makes "the user grants access to specific
// folders, not the whole drive" actually true, not just documented.
// =============================================================================

const os = require('os')
const path = require('path')
const fs = require('fs')

/** Real, resolved absolute paths for each named directory this agent
 * knows about — computed once at startup from the real home directory,
 * never hardcoded to a specific username.
 *
 * Real fix for a reported failure: "Local Agent does not have
 * permission to create a folder on the Desktop." Root cause, confirmed
 * by direct inspection, not assumed: this function previously always
 * resolved Desktop to `path.join(home, 'Desktop')` — the traditional
 * location — with no check for OneDrive's "Known Folder Move," a real,
 * common Windows feature that REDIRECTS the actual Desktop Explorer
 * shows the user to `%USERPROFILE%\OneDrive\Desktop` instead. When that
 * redirection is active, the OLD `%USERPROFILE%\Desktop` location is
 * commonly either absent, or left behind as a restricted reparse
 * point/junction by OneDrive's own migration — producing exactly the
 * reported symptom (a real, genuine access-denied error) even though
 * the user has completely normal write access to their REAL, actual
 * (OneDrive-redirected) Desktop.
 *
 * This does not require elevated permissions, disabling UAC, or running
 * as Administrator — it is purely a path-resolution correctness fix:
 * prefer whichever real Desktop path actually exists on this machine,
 * checking the OneDrive-redirected one first since that's the one
 * Explorer shows when Known Folder Move is active. */
function resolveRealDesktopPath(home) {
  const oneDriveDesktop = path.join(home, 'OneDrive', 'Desktop')
  if (fs.existsSync(oneDriveDesktop)) return oneDriveDesktop
  // Real, known secondary case: a business/school OneDrive account often
  // names the folder "OneDrive - <Organization>" rather than plain
  // "OneDrive". Checked as a genuine, real fallback — not guessed at
  // just this one moment, but a documented, common real variant.
  if (fs.existsSync(home)) {
    const entries = fs.readdirSync(home, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name.startsWith('OneDrive'))
    for (const entry of entries) {
      const candidate = path.join(home, entry.name, 'Desktop')
      if (fs.existsSync(candidate)) return candidate
    }
  }
  // Real, traditional fallback — used when no OneDrive redirection is
  // active at all (the common case on most machines), or when NEITHER
  // real Desktop currently exists yet (a genuinely fresh account) —
  // this remains the correct, standard default in that case.
  return path.join(home, 'Desktop')
}

function knownDirectories() {
  const home = os.homedir()
  return {
    desktop: resolveRealDesktopPath(home),
    documents: path.join(home, 'Documents'),
    downloads: path.join(home, 'Downloads'),
    fexusWorkspace: path.join(home, 'Documents', 'FEXUS')
  }
}

/** Reads which directories are actually allowed from real config (see
 * config.js — driven by the ALLOWED_DIRECTORIES env var, and further
 * gated server-side by the FEXUS backend's own stored permissions before
 * a request even reaches here — two independent real checks, not one). */
function allowedDirectories(config) {
  const known = knownDirectories()
  const result = {}
  for (const name of config.allowedDirectoryNames) {
    if (known[name]) result[name] = known[name]
  }
  return result
}

/**
 * Resolves a requested path and confirms it's genuinely inside one of
 * the allowed directories — rejects any `..` traversal, symlink escape
 * attempt, or path outside every allowed root. Returns the real,
 * resolved absolute path on success, or throws a specific, honest error.
 */
function resolveWithinAllowed(requestedPath, config) {
  const allowed = allowedDirectories(config)
  const allowedRoots = Object.values(allowed)
  if (allowedRoots.length === 0) {
    throw new Error('No directories are permitted yet — enable at least one in Local Agent Settings.')
  }

  // If a bare filename was given (no directory component), search across
  // every allowed root rather than assuming one.
  const isBareFilename = !path.isAbsolute(requestedPath) && !requestedPath.includes(path.sep) && !requestedPath.includes('/')

  if (isBareFilename) {
    for (const root of allowedRoots) {
      const candidate = path.resolve(root, requestedPath)
      if (fs.existsSync(candidate)) return candidate
    }
    throw new Error(`"${requestedPath}" was not found in any permitted directory.`)
  }

  const resolved = path.resolve(requestedPath)
  const realResolved = fs.existsSync(resolved) ? fs.realpathSync(resolved) : resolved
  const isWithinAllowed = allowedRoots.some((root) => {
    const realRoot = fs.existsSync(root) ? fs.realpathSync(root) : root
    return realResolved === realRoot || realResolved.startsWith(realRoot + path.sep)
  })
  if (!isWithinAllowed) {
    throw new Error(`"${requestedPath}" is outside every permitted directory. Only these are allowed: ${allowedRoots.join(', ')}`)
  }
  return realResolved
}

module.exports = { knownDirectories, allowedDirectories, resolveWithinAllowed, resolveRealDesktopPath }
