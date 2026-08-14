import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { User, Mail, Lock, ArrowRight, ShieldCheck, RefreshCw } from 'lucide-react'
import { useAuth } from '../../lib/AuthContext'
import { api } from '../../lib/api'
import AuthIllustration from '../../components/auth/AuthIllustration'

export default function Signup() {
  const { signup } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Real, new step — set once a genuine, non-Owner signup succeeds but
  // still needs real email verification before it's usable.
  const [pendingVerification, setPendingVerification] = useState(false) // real, current, plain boolean — not the message text, so the UI never has to re-parse a sentence to know what step it's on
  const [infoMessage, setInfoMessage] = useState('')
  const [emailSent, setEmailSent] = useState(true) // real, honest tracking — drives whether the info box shows as a success or a real warning
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [resending, setResending] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const result = await signup(name, email, password)
      if (result.user) {
        // Real, unchanged Owner path — signup logs them in immediately,
        // exactly as before.
        navigate(result.user.role === 'owner' ? '/owner/dashboard' : '/dashboard', { replace: true })
        return
      }
      // Real, new Company User path — account exists, but needs real
      // email verification (and, after that, a real Owner-issued
      // License) before it can ever log in.
      setPendingVerification(true)
      setInfoMessage(result.message || 'Check your email for a verification code.')
      setEmailSent(result.emailSent !== false) // real, honest — only false when the backend explicitly said the send failed
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleVerify(e) {
    e.preventDefault()
    setError('')
    setVerifying(true)
    try {
      const result = await api.verifyEmail(email.trim().toLowerCase(), code.trim())
      setInfoMessage(result.message || 'Email verified.')
      // Real, deliberate: does NOT log the person in — a real Company
      // User account still needs a real License from the Owner before
      // login works at all, per the explicit requirement. Sends them
      // to Login, where that real flow continues.
      setTimeout(() => navigate('/login', { replace: true }), 1800)
    } catch (err) {
      setError(err.message)
    } finally {
      setVerifying(false)
    }
  }

  async function handleResend() {
    setError('')
    setResending(true)
    try {
      const result = await api.resendVerification(email.trim().toLowerCase())
      setInfoMessage(result.message || 'A new code has been sent.')
      setEmailSent(true) // resend only ever resolves (not throws) on a real, successful send — a failed send throws instead, caught below
    } catch (err) {
      setError(err.message)
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-white">
      <AuthIllustration
        heading="Your AI Workforce is waiting."
        subheading="Create your account to start submitting tasks and watching the Company Office come alive."
      />

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

          {!pendingVerification ? (
            <>
              <span className="font-mono text-[11px] tracking-wideish uppercase text-ferozi-deep">Get started</span>
              <h1 className="mt-3 font-display font-bold text-3xl tracking-tightest">Create your Workspace account</h1>
              <p className="mt-2 text-ink/50">Only one email becomes Owner — everyone else is a Company User.</p>

              <form onSubmit={handleSubmit} className="mt-8 space-y-4">
                <div>
                  <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Full name</label>
                  <div className="mt-2 relative">
                    <User className="w-4 h-4 text-ink/30 absolute left-4 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Alex Rivera"
                      className="w-full rounded-lg border border-line pl-11 pr-4 py-3 text-sm outline-none focus:border-ferozi focus:ring-2 focus:ring-ferozi/20 transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Email</label>
                  <div className="mt-2 relative">
                    <Mail className="w-4 h-4 text-ink/30 absolute left-4 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      className="w-full rounded-lg border border-line pl-11 pr-4 py-3 text-sm outline-none focus:border-ferozi focus:ring-2 focus:ring-ferozi/20 transition-all"
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
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      className="w-full rounded-lg border border-line pl-11 pr-4 py-3 text-sm outline-none focus:border-ferozi focus:ring-2 focus:ring-ferozi/20 transition-all"
                    />
                  </div>
                </div>

                {error && <p className="text-sm text-red-600">{error}</p>}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Creating account...' : 'Create account'} <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              <p className="mt-8 text-center text-sm text-ink/50">
                Already have an account?{' '}
                <Link to="/login" className="font-semibold text-ferozi-deep hover:underline">Sign in</Link>
              </p>
            </>
          ) : (
            <>
              <span className="font-mono text-[11px] tracking-wideish uppercase text-ferozi-deep">Verify your email</span>
              <h1 className="mt-3 font-display font-bold text-3xl tracking-tightest">Enter your code</h1>
              <p className="mt-2 text-ink/50">
                {emailSent ? (
                  <>A 6-digit code was sent to <span className="font-semibold text-ink">{email}</span>. It expires in 15 minutes.</>
                ) : (
                  <>We couldn't send a code to <span className="font-semibold text-ink">{email}</span> yet — see below.</>
                )}
              </p>

              {infoMessage && (
                <div className={`mt-4 flex items-start gap-2 rounded-lg border px-4 py-3 ${
                  emailSent ? 'bg-ferozi-soft border-ferozi/30' : 'bg-amber-50 border-amber-300'
                }`}>
                  <ShieldCheck className={`w-4 h-4 shrink-0 mt-0.5 ${emailSent ? 'text-ferozi-deep' : 'text-amber-700'}`} />
                  <p className={`text-sm ${emailSent ? 'text-ferozi-deep' : 'text-amber-800'}`}>{infoMessage}</p>
                </div>
              )}

              <form onSubmit={handleVerify} className="mt-6 space-y-4">
                <div>
                  <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Verification code</label>
                  <input
                    type="text"
                    required
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    className="mt-2 w-full rounded-lg border border-line px-4 py-3 text-center text-2xl tracking-[0.5em] font-mono outline-none focus:border-ferozi focus:ring-2 focus:ring-ferozi/20 transition-all"
                  />
                </div>

                {error && <p className="text-sm text-red-600">{error}</p>}

                <button
                  type="submit"
                  disabled={verifying || code.length !== 6}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors disabled:opacity-50"
                >
                  {verifying ? 'Verifying...' : 'Verify email'} <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              <button
                onClick={handleResend}
                disabled={resending}
                className="mt-4 w-full flex items-center justify-center gap-2 text-sm text-ink/50 hover:text-ferozi-deep transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${resending ? 'animate-spin' : ''}`} />
                {resending ? 'Resending...' : 'Resend code'}
              </button>
            </>
          )}
        </motion.div>
      </div>
    </div>
  )
}
