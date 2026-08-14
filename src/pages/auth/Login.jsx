import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mail, Lock, ArrowRight, KeyRound } from 'lucide-react'
import { useAuth } from '../../lib/AuthContext'
import AuthIllustration from '../../components/auth/AuthIllustration'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [licenseId, setLicenseId] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Real, progressive reveal — set only when the real backend responds
  // that this specific email+password is genuinely correct AND belongs
  // to a real, non-Owner account, so a License ID is now required. The
  // Owner's own login never sees this field at all.
  const [needsLicense, setNeedsLicense] = useState(false)
  const [needsVerification, setNeedsVerification] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setNeedsVerification(false)
    setSubmitting(true)
    try {
      const user = await login(email, password, needsLicense ? licenseId.trim().toUpperCase() : undefined)
      const redirectTo = location.state?.from || (user.role === 'owner' ? '/owner/dashboard' : '/dashboard')
      navigate(redirectTo, { replace: true })
    } catch (err) {
      if (err.data?.requiresLicense) {
        // Real, correct email+password for a real Company User — just
        // needs the real License ID the Owner sends them, nothing wrong yet.
        setNeedsLicense(true)
        setError('')
      } else if (err.data?.requiresVerification) {
        setNeedsVerification(true)
        setError('')
      } else {
        setError(err.message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-white">
      <div className="flex items-center justify-center px-6 sm:px-12 py-16">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-sm"
        >
          <div className="lg:hidden flex items-center gap-2.5 mb-10">
            <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-electric to-aqua flex items-center justify-center">
              <span className="w-2 h-2 rounded-full bg-white" />
            </span>
            <span className="font-display font-bold text-lg tracking-tightest">FEXUS</span>
          </div>

          <span className="font-mono text-[11px] tracking-wideish uppercase text-ferozi-deep">Welcome back</span>
          <h1 className="mt-3 font-display font-bold text-3xl tracking-tightest">Sign in to your Workspace</h1>
          <p className="mt-2 text-ink/50">Pick up right where your AI Workforce left off.</p>

          {needsVerification && (
            <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
              <p className="text-sm text-amber-800">
                Please verify your email first. If you signed up recently and never entered your code,{' '}
                <Link to="/signup" className="font-semibold underline">go back to Signup</Link> to resend it.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div>
              <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Email</label>
              <div className="mt-2 relative">
                <Mail className="w-4 h-4 text-ink/30 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  disabled={needsLicense}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full rounded-lg border border-line pl-11 pr-4 py-3 text-sm outline-none focus:border-ferozi focus:ring-2 focus:ring-ferozi/20 transition-all disabled:bg-mist disabled:text-ink/50"
                />
              </div>
            </div>
            <div>
              <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Password</label>
              <div className="mt-2 relative">
                <Lock className="w-4 h-4 text-ink/30 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  disabled={needsLicense}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-line pl-11 pr-4 py-3 text-sm outline-none focus:border-ferozi focus:ring-2 focus:ring-ferozi/20 transition-all disabled:bg-mist disabled:text-ink/50"
                />
              </div>
            </div>

            {needsLicense && (
              <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">License ID</label>
                <p className="text-xs text-ink/45 mt-0.5 mb-2">Ask the Owner for the License ID sent to your email.</p>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-ink/30 absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    autoFocus
                    value={licenseId}
                    onChange={(e) => setLicenseId(e.target.value)}
                    placeholder="LIC-XXXX-XXXX-XXXX-..."
                    className="w-full rounded-lg border border-line pl-11 pr-4 py-3 text-sm font-mono outline-none focus:border-ferozi focus:ring-2 focus:ring-ferozi/20 transition-all"
                  />
                </div>
              </motion.div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors disabled:opacity-50"
            >
              {submitting ? 'Signing in...' : needsLicense ? 'Confirm License ID' : 'Sign in'} <ArrowRight className="w-4 h-4" />
            </button>

            {needsLicense && (
              <button
                type="button"
                onClick={() => { setNeedsLicense(false); setLicenseId(''); setError('') }}
                className="w-full text-center text-xs text-ink/40 hover:text-ink/70 transition-colors"
              >
                Use a different account
              </button>
            )}
          </form>

          <p className="mt-8 text-center text-sm text-ink/50">
            Don't have a workspace account?{' '}
            <Link to="/signup" className="font-semibold text-ferozi-deep hover:underline">Create one</Link>
          </p>
        </motion.div>
      </div>

      <AuthIllustration
        heading="Watch your company operate, live."
        subheading="One dashboard for the Owner. A focused workspace for everyone else. Same login, the right view for each."
      />
    </div>
  )
}
