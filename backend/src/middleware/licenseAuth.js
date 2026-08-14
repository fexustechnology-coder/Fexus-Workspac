// =============================================================================
// LICENSED CLIENT AUTHENTICATION (Phase 23)
// =============================================================================
// Deliberately separate from middleware/auth.js's Owner/User session system
// — different cookie name (fexus_license_session, not fexus_session),
// different JWT payload shape (references a License row, never a User
// row). This is intentional isolation: a licensed client's session can
// never be misread as a User id by any Owner/User-scoped route, and vice
// versa. middleware/auth.js itself was not modified at all.
// =============================================================================

const jwt = require('jsonwebtoken')

const JWT_SECRET = process.env.JWT_SECRET || 'fexus-dev-secret-change-me'
const COOKIE_NAME = 'fexus_license_session'

function signLicenseToken(license) {
  return jwt.sign({ sub: license.id, licenseId: license.licenseId, email: license.assignedEmail, kind: 'licensed_client' }, JWT_SECRET, { expiresIn: '7d' })
}

function setLicenseSessionCookie(res, license) {
  const token = signLicenseToken(license)
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // true behind HTTPS in production, same as the Owner/User cookie
    maxAge: 7 * 24 * 60 * 60 * 1000
  })
}

function clearLicenseSessionCookie(res) {
  res.clearCookie(COOKIE_NAME)
}

function requireLicenseAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME]
  if (!token) return res.status(401).json({ error: 'Not signed in' })
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    if (payload.kind !== 'licensed_client') return res.status(401).json({ error: 'Invalid session' })
    req.license = { id: payload.sub, licenseId: payload.licenseId, email: payload.email }
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Session expired — please sign in again' })
  }
}

module.exports = { requireLicenseAuth, setLicenseSessionCookie, clearLicenseSessionCookie, COOKIE_NAME }
