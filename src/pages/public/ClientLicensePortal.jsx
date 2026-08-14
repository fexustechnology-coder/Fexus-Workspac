import { useEffect, useState } from 'react'
import { api } from '../../lib/api'

// Phase 23 (revised) — real client accounts, separate from Owner/User
// login. Signing up creates an account only — it grants no access on its
// own. Signing in requires email + password + a real, active License ID
// (emailed automatically to the client's Gmail once the Owner activates
// their license) — all three checked server-side together.
export default function ClientLicensePortal() {
  const [checking, setChecking] = useState(true)
  const [session, setSession] = useState(null)
  const [mode, setMode] = useState('login') // 'login' | 'signup'

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [licenseId, setLicenseId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.license.clientMe()
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setChecking(false))
  }, [])

  async function submitSignup(e) {
    e.preventDefault()
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await api.license.clientSignup({ email: email.trim(), password, name: name.trim() })
      setNotice(result.message || 'Account created — sign in once your license is active.')
      setMode('login')
      setPassword('')
    } catch (err) {
      setError(err.message || 'Failed to create account.')
    } finally {
      setBusy(false)
    }
  }

  async function submitLogin(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const result = await api.license.clientLogin(email.trim(), password, licenseId.trim())
      setSession(result)
    } catch (err) {
      // The backend deliberately returns one generic message for every
      // real denial reason (no account, wrong password, no license,
      // wrong license, revoked, inactive, expired) — shown exactly as
      // received, not reinterpreted into something more specific here.
      setError(err.message || 'Invalid email, password, or license ID.')
    } finally {
      setBusy(false)
    }
  }

  async function logout() {
    try {
      await api.license.clientLogout()
    } catch (err) {
      console.error('License logout request failed:', err.message)
    }
    setSession(null)
  }

  if (checking) {
    return <div className="min-h-screen flex items-center justify-center bg-mist"><p className="text-sm text-ink/40">Loading...</p></div>
  }

  if (session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-mist px-4">
        <div className="w-full max-w-md rounded-2xl border border-line bg-white shadow-card p-8 text-center">
          <p className="font-display text-xl font-semibold mb-1">Welcome back{session.name ? `, ${session.name}` : ''}.</p>
          <p className="text-sm text-ink/50 mb-1">{session.email}</p>
          {session.plan && <p className="text-xs text-ink/40 mb-6">Plan: {session.plan}</p>}
          <p className="text-sm text-ink/40 mb-6">You're signed in with an active license.</p>
          <button onClick={logout} className="px-6 py-2.5 rounded-full border border-line text-sm font-semibold hover:border-ferozi transition-colors">Sign out</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-mist px-4">
      <div className="w-full max-w-md rounded-2xl border border-line bg-white shadow-card p-8">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-mist border border-line w-fit mb-6">
          <button onClick={() => { setMode('login'); setError(''); setNotice('') }} className={`px-4 py-2 rounded-md text-sm font-semibold ${mode === 'login' ? 'bg-white shadow-sm' : 'text-ink/45'}`}>Sign In</button>
          <button onClick={() => { setMode('signup'); setError(''); setNotice('') }} className={`px-4 py-2 rounded-md text-sm font-semibold ${mode === 'signup' ? 'bg-white shadow-sm' : 'text-ink/45'}`}>Create Account</button>
        </div>

        {notice && <p className="text-sm text-ferozi-deep bg-ferozi-soft border border-ferozi/20 rounded-lg px-4 py-3 mb-4">{notice}</p>}

        {mode === 'signup' ? (
          <form onSubmit={submitSignup} className="space-y-4">
            <p className="text-sm text-ink/50 -mt-2 mb-2">Create your account first. Your License ID will be emailed to you once it's activated.</p>
            <div>
              <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Name</label>
              <input required value={name} onChange={(e) => setName(e.target.value)} className="mt-2 w-full rounded-lg border border-line px-4 py-2.5 text-sm outline-none focus:border-ferozi" />
            </div>
            <div>
              <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Gmail / Email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 w-full rounded-lg border border-line px-4 py-2.5 text-sm outline-none focus:border-ferozi" />
            </div>
            <div>
              <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Password</label>
              <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 w-full rounded-lg border border-line px-4 py-2.5 text-sm outline-none focus:border-ferozi" />
              <p className="text-xs text-ink/35 mt-1">At least 8 characters.</p>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={busy} className="w-full px-6 py-3 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors disabled:opacity-50">
              {busy ? 'Creating account...' : 'Create Account'}
            </button>
          </form>
        ) : (
          <form onSubmit={submitLogin} className="space-y-4">
            <div>
              <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 w-full rounded-lg border border-line px-4 py-2.5 text-sm outline-none focus:border-ferozi" />
            </div>
            <div>
              <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Password</label>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 w-full rounded-lg border border-line px-4 py-2.5 text-sm outline-none focus:border-ferozi" />
            </div>
            <div>
              <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">License ID</label>
              <input required value={licenseId} onChange={(e) => setLicenseId(e.target.value)} placeholder="LIC-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" className="mt-2 w-full rounded-lg border border-line px-4 py-2.5 text-sm font-mono outline-none focus:border-ferozi" />
              <p className="text-xs text-ink/35 mt-1">Sent to your email once your license is activated.</p>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={busy} className="w-full px-6 py-3 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors disabled:opacity-50">
              {busy ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
