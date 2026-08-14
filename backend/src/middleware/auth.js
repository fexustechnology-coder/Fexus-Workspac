const jwt = require('jsonwebtoken')

const JWT_SECRET = process.env.JWT_SECRET || 'fexus-dev-secret-change-me'
const COOKIE_NAME = 'fexus_session'

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' })
}

function setSessionCookie(res, user) {
  const token = signToken(user)

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000
  })
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME)
}

function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME]
  if (!token) return res.status(401).json({ error: 'Not signed in' })
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    req.user = { id: payload.sub, email: payload.email, role: payload.role }
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Session expired — please sign in again' })
  }
}

function requireOwner(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not signed in' })
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Owner access only' })
  next()
}

module.exports = { requireAuth, requireOwner, setSessionCookie, clearSessionCookie, signToken, COOKIE_NAME }
