import { useEffect, useState } from 'react'
import { Plus, Loader2, Trash2 } from 'lucide-react'
import Badge from './Badge'
import Modal from './Modal'
import { api } from '../../lib/api'

// =============================================================================
// CONNECTED EMAILS MANAGER (Phase 21)
// =============================================================================
// Shared, isolated per authenticated account (Owner or team member alike —
// the backend scopes every query to req.user.id, never a shared pool).
// Rendered directly in both OwnerSettings.jsx and UserSettings.jsx — one
// real implementation, not two copies.
// =============================================================================

const HEALTH_TONE = { Healthy: 'success', Degraded: 'warning', Unavailable: 'danger', Unknown: 'neutral' }
const VERIFICATION_TONE = { Verified: 'success', Failed: 'danger', Pending: 'warning' }

const CONNECTED_TONE = { Connected: 'success', Disconnected: 'neutral', Error: 'danger' }

const PROVIDER_PRESETS = {
  'Gmail': { host: 'smtp.gmail.com', port: 587, encryption: 'starttls' },
  'Google Workspace': { host: 'smtp.gmail.com', port: 587, encryption: 'starttls' },
  'Outlook': { host: 'smtp-mail.outlook.com', port: 587, encryption: 'starttls' },
  'Microsoft 365': { host: 'smtp.office365.com', port: 587, encryption: 'starttls' },
  'Zoho': { host: 'smtp.zoho.com', port: 587, encryption: 'starttls' },
  'Custom SMTP': { host: '', port: 587, encryption: 'starttls' }
}

function SendersPanel() {
  const [senders, setSenders] = useState(null)
  const [error, setError] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [testResults, setTestResults] = useState({})

  function load() {
    setError('')
    api.senders.list().then(({ senders }) => setSenders(senders)).catch((err) => setError(err.message || 'Failed to load connected emails.'))
  }
  useEffect(load, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('senders')) {
      load()
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  async function toggleActive(s) {
    setError('')
    try {
      await api.senders.update(s.id, { active: !s.active })
      load()
    } catch (err) {
      setError(err.message || 'Failed to update sender.')
    }
  }

  async function editName(s) {
    const name = window.prompt('Display name for this sender', s.displayName || '')
    if (name === null) return
    const replyTo = window.prompt('Reply-To email (leave blank for none — customer replies go here instead of the sending address)', s.replyToEmail || '')
    if (replyTo === null) return
    setError('')
    try {
      await api.senders.update(s.id, { displayName: name, replyToEmail: replyTo })
      load()
    } catch (err) {
      setError(err.message || 'Failed to update sender.')
    }
  }

  async function reconnect(id) {
    setError('')
    try {
      await api.senders.reconnect(id)
      load()
    } catch (err) {
      setError(err.message || 'Failed to reconnect sender.')
    }
  }

  async function remove(id) {
    if (!window.confirm('Remove this sender email? This cannot be undone.')) return
    setError('')
    try {
      await api.senders.remove(id)
      load()
    } catch (err) {
      setError(err.message || 'Failed to remove sender.')
    }
  }

  async function sendTest(id) {
    setTestResults((r) => ({ ...r, [id]: { loading: true } }))
    try {
      const res = await api.senders.test(id)
      setTestResults((r) => ({ ...r, [id]: { ok: true, message: `Sent to ${res.sentTo}` } }))
    } catch (err) {
      setTestResults((r) => ({ ...r, [id]: { ok: false, message: err.message } }))
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="font-display font-semibold">Connected Emails</p>
          <p className="text-xs text-ink/45 mt-0.5">The permanent, enterprise-grade home for every sender address — unlimited, always independent of your login. Campaigns only ever send from these.</p>
        </div>
        <button onClick={() => setAddOpen(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-ink text-white text-xs font-semibold hover:bg-ferozi-deep transition-colors">
          <Plus className="w-3.5 h-3.5" /> Add Connected Email
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={load} className="mt-3 px-5 py-2 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors">Try again</button>
        </div>
      ) : !senders ? (
        <div className="flex items-center gap-2 text-sm text-ink/40 py-10 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>
      ) : senders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-mist p-10 text-center text-sm text-ink/50">
          No sender emails connected yet — e.g. sales@, info@, marketing@, support@.
        </div>
      ) : (
        <div className="rounded-2xl border border-line bg-white shadow-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                {['Email', 'Provider', 'Verified', 'Connection', 'Health', 'Last Used', 'Daily Usage', 'Status', ''].map((h) => (
                  <th key={h} className="px-4 py-3 font-mono text-[10px] tracking-wideish uppercase text-ink/40 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {senders.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-ink">{s.displayName || s.email}</p>
                    {s.displayName && <p className="text-xs text-ink/40">{s.email}</p>}
                    {s.replyToEmail && <p className="text-xs text-ink/35">Reply-To: {s.replyToEmail}</p>}
                    {s.lastError && <p className="text-xs text-red-500 mt-0.5">{s.lastError}</p>}
                    {testResults[s.id] && (
                      <p className={`text-xs mt-0.5 ${testResults[s.id].ok ? 'text-ferozi-deep' : 'text-red-500'}`}>
                        {testResults[s.id].loading ? 'Sending test...' : testResults[s.id].message}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink/60">{s.provider || (s.connectionMethod === 'oauth' ? 'Google OAuth' : '—')}</td>
                  <td className="px-4 py-3"><Badge tone={VERIFICATION_TONE[s.verificationStatus]}>{s.verificationStatus}</Badge></td>
                  <td className="px-4 py-3"><Badge tone={CONNECTED_TONE[s.connectionStatus]}>{s.connectionStatus}</Badge></td>
                  <td className="px-4 py-3"><Badge tone={HEALTH_TONE[s.health]}>{s.health}</Badge></td>
                  <td className="px-4 py-3 text-ink/50 whitespace-nowrap">{s.lastUsedAt ? new Date(s.lastUsedAt).toLocaleString() : 'Never'}</td>
                  <td className="px-4 py-3 text-ink/50">{s.dailyUsage}</td>
                  <td className="px-4 py-3">
                    {s.connectionStatus === 'Connected' ? (
                      <button onClick={() => toggleActive(s)} className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${s.active ? 'border-ferozi text-ferozi-deep' : 'border-line text-ink/50'}`}>
                        {s.active ? 'Active' : 'Disabled'}
                      </button>
                    ) : (
                      <span className="text-xs text-ink/35">Not connected</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end flex-wrap">
                      <button onClick={() => editName(s)} className="px-2.5 py-1 rounded-full border border-line text-xs font-semibold hover:border-ferozi">Edit</button>
                      {s.connectionStatus === 'Connected' && (
                        <>
                          <button onClick={() => sendTest(s.id)} className="px-2.5 py-1 rounded-full border border-line text-xs font-semibold hover:border-ferozi">Test Email</button>
                          <button onClick={() => reconnect(s.id)} className="px-2.5 py-1 rounded-full border border-line text-xs font-semibold hover:border-ferozi">Reconnect</button>
                        </>
                      )}
                      <button onClick={() => remove(s.id)} className="text-ink/25 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddConnectedEmailModal open={addOpen} onClose={() => setAddOpen(false)} onDone={() => { setAddOpen(false); load() }} />
    </div>
  )
}

function AddConnectedEmailModal({ open, onClose, onDone }) {
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [replyToEmail, setReplyToEmail] = useState('')
  const [provider, setProvider] = useState('Gmail')
  const [smtpHost, setSmtpHost] = useState(PROVIDER_PRESETS['Gmail'].host)
  const [smtpPort, setSmtpPort] = useState(PROVIDER_PRESETS['Gmail'].port)
  const [smtpEncryption, setSmtpEncryption] = useState(PROVIDER_PRESETS['Gmail'].encryption)
  const [smtpUsername, setSmtpUsername] = useState('')
  const [smtpPassword, setSmtpPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [busyLabel, setBusyLabel] = useState('')
  const [error, setError] = useState('')
  const [verified, setVerified] = useState(false)

  useEffect(() => {
    if (!open) {
      setEmail(''); setDisplayName(''); setReplyToEmail(''); setProvider('Gmail')
      const preset = PROVIDER_PRESETS['Gmail']
      setSmtpHost(preset.host); setSmtpPort(preset.port); setSmtpEncryption(preset.encryption)
      setSmtpUsername(''); setSmtpPassword(''); setError(''); setVerified(false)
    }
  }, [open])

  function selectProvider(p) {
    setProvider(p)
    const preset = PROVIDER_PRESETS[p]
    if (preset) { setSmtpHost(preset.host); setSmtpPort(preset.port); setSmtpEncryption(preset.encryption) }
    setVerified(false)
  }

  async function verifyConnection() {
    setBusy(true); setBusyLabel('Verifying connection...'); setError('')
    try {
      await api.senders.connect({
        email, displayName, replyToEmail, provider,
        smtpHost, smtpPort, smtpUsername, smtpPassword, smtpEncryption,
        testOnly: true
      })
      setVerified(true)
    } catch (err) {
      setError(err.message)
      setVerified(false)
    } finally {
      setBusy(false)
    }
  }

  async function save(e) {
    e.preventDefault()
    setBusy(true); setBusyLabel('Saving...'); setError('')
    try {
      await api.senders.connect({ email, displayName, replyToEmail, provider, smtpHost, smtpPort, smtpUsername, smtpPassword, smtpEncryption })
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Connected Email">
      <form onSubmit={save} className="space-y-4">
        <p className="text-xs text-ink/45">A real address check (syntax, MX records, disposable-provider rejection) and a real SMTP handshake + authentication test both run before this is ever saved — nothing becomes Active on a format check alone.</p>

        <div>
          <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Email Address</label>
          <input type="email" required value={email} onChange={(e) => { setEmail(e.target.value); setVerified(false) }} placeholder="sales@yourcompany.com" className="mt-2 w-full rounded-lg border border-line px-4 py-2.5 text-sm outline-none focus:border-ferozi" />
        </div>

        <div>
          <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Reply-To Email (optional)</label>
          <input type="email" value={replyToEmail} onChange={(e) => { setReplyToEmail(e.target.value); setVerified(false) }} placeholder="support@yourcompany.com" className="mt-2 w-full rounded-lg border border-line px-4 py-2.5 text-sm outline-none focus:border-ferozi" />
          <p className="text-xs text-ink/35 mt-1">Customer replies land here instead of the sending address — e.g. sales@ sends, support@ receives replies.</p>
        </div>

        <div>
          <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Provider</label>
          <select value={provider} onChange={(e) => selectProvider(e.target.value)} className="mt-2 w-full rounded-lg border border-line px-4 py-2.5 text-sm outline-none focus:border-ferozi bg-white">
            {Object.keys(PROVIDER_PRESETS).map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">SMTP Host</label>
            <input required value={smtpHost} onChange={(e) => { setSmtpHost(e.target.value); setVerified(false) }} placeholder="smtp.yourprovider.com" className="mt-2 w-full rounded-lg border border-line px-4 py-2.5 text-sm outline-none focus:border-ferozi" />
          </div>
          <div>
            <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Port</label>
            <input type="number" required value={smtpPort} onChange={(e) => { setSmtpPort(e.target.value); setVerified(false) }} className="mt-2 w-full rounded-lg border border-line px-4 py-2.5 text-sm outline-none focus:border-ferozi" />
          </div>
        </div>

        <div>
          <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Encryption</label>
          <div className="flex gap-2 mt-2">
            {[['starttls', 'STARTTLS'], ['ssl', 'SSL/TLS'], ['none', 'None']].map(([v, l]) => (
              <button key={v} type="button" onClick={() => { setSmtpEncryption(v); setVerified(false) }} className={`px-3 py-2 rounded-full text-xs font-semibold border ${smtpEncryption === v ? 'bg-ink text-white border-ink' : 'border-line text-ink/60'}`}>{l}</button>
            ))}
          </div>
        </div>

        <div>
          <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Username</label>
          <input required value={smtpUsername} onChange={(e) => { setSmtpUsername(e.target.value); setVerified(false) }} placeholder={email || 'username'} className="mt-2 w-full rounded-lg border border-line px-4 py-2.5 text-sm outline-none focus:border-ferozi" />
        </div>

        <div>
          <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Password / App Password</label>
          <input type="password" required value={smtpPassword} onChange={(e) => { setSmtpPassword(e.target.value); setVerified(false) }} className="mt-2 w-full rounded-lg border border-line px-4 py-2.5 text-sm outline-none focus:border-ferozi" />
          <p className="text-xs text-ink/35 mt-1">Encrypted before storage (AES-256-GCM) — never stored or shown as plain text.</p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {verified && <p className="text-sm text-ferozi-deep">Connection verified — ready to save.</p>}

        <div className="flex items-center gap-3">
          <button type="button" onClick={verifyConnection} disabled={busy || !email || !smtpHost || !smtpUsername || !smtpPassword} className="flex-1 px-6 py-3 rounded-full border border-line text-sm font-semibold hover:border-ferozi transition-colors disabled:opacity-40">
            {busy && busyLabel === 'Verifying connection...' ? 'Verifying...' : 'Verify Connection'}
          </button>
          <button type="submit" disabled={busy || !email || !smtpHost || !smtpUsername || !smtpPassword} className="flex-1 px-6 py-3 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors disabled:opacity-40">
            {busy && busyLabel === 'Saving...' ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  )
}


export default function ConnectedEmailsManager() {
  return <SendersPanel />
}
