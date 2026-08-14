import { useEffect, useState } from 'react'
import PageHeader from '../../components/ui/PageHeader'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import { api } from '../../lib/api'
import { Plus, Copy, KeyRound } from 'lucide-react'

const STATUS_TONE = { ACTIVE: 'success', INACTIVE: 'neutral', REVOKED: 'danger' }

export default function LicenseManagement() {
  const [licenses, setLicenses] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newPlan, setNewPlan] = useState('')
  const [busy, setBusy] = useState(false)
  const [revealed, setRevealed] = useState(null) // the just-generated license, shown once prominently

  function load() {
    setError('')
    api.license.list().then(({ licenses }) => setLicenses(licenses)).catch((err) => setError(err.message || 'Failed to load licenses.'))
  }
  useEffect(load, [])

  async function generate(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const { license } = await api.license.generate({ assignedEmail: newEmail.trim(), plan: newPlan.trim() })
      setNewEmail(''); setNewPlan(''); setAddOpen(false)
      setRevealed(license)
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function act(action, id) {
    setError(''); setNotice('')
    try {
      const result = await api.license[action](id)
      if (action === 'activate') {
        setNotice(result.emailSent ? 'License activated — the License ID was emailed to the client.' : 'License activated, but the email failed to send — check your Gmail connection in Settings, then use Resend Email below.')
      }
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function resend(id) {
    setError(''); setNotice('')
    try {
      await api.license.resendEmail(id)
      setNotice('License email resent.')
    } catch (err) {
      setError(err.message)
    }
  }

  async function remove(id) {
    if (!window.confirm('Permanently delete this license record? This cannot be undone.')) return
    setError('')
    try {
      await api.license.remove(id)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Owner Dashboard"
        title="License Management"
        description="Generate, activate, deactivate, and revoke client licenses. Never exposed to clients for generation — only the Owner can create a license."
        actions={
          <button onClick={() => setAddOpen(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors">
            <Plus className="w-4 h-4" /> Generate License
          </button>
        }
      />

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      {notice && <p className="text-sm text-ferozi-deep bg-ferozi-soft border border-ferozi/20 rounded-lg px-4 py-3 mb-4">{notice}</p>}

      {revealed && (
        <div className="rounded-2xl border border-ferozi/30 bg-ferozi-soft p-6 mb-6">
          <p className="text-sm font-semibold text-ferozi-deep mb-2">License generated — this is shown once here for your records:</p>
          <div className="flex items-center gap-2 flex-wrap">
            <code className="font-mono text-sm bg-white rounded-lg px-4 py-2.5 break-all">{revealed.licenseId}</code>
            <button onClick={() => navigator.clipboard?.writeText(revealed.licenseId)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-line text-xs font-semibold hover:border-ferozi"><Copy className="w-3.5 h-3.5" /> Copy</button>
          </div>
          <p className="text-xs text-ink/50 mt-2">Assigned to <span className="font-semibold">{revealed.assignedEmail}</span> — status is <span className="font-semibold">INACTIVE</span>. Click Activate below to make it usable — the client's License ID is emailed to them automatically at that point.</p>
          <button onClick={() => setRevealed(null)} className="mt-3 text-xs text-ink/40 hover:underline">Dismiss</button>
        </div>
      )}

      {!licenses ? (
        <p className="text-sm text-ink/40 py-10 text-center">Loading...</p>
      ) : licenses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-mist p-10 text-center text-sm text-ink/50">
          No licenses yet. After a client pays (handled manually — no online payment gate in this MVP), generate their license here.
        </div>
      ) : (
        <div className="rounded-2xl border border-line bg-white shadow-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                {['License ID', 'Email', 'Plan', 'Status', 'Created', ''].map((h) => (
                  <th key={h} className="px-4 py-3 font-mono text-[10px] tracking-wideish uppercase text-ink/40 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {licenses.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-3"><code className="text-xs font-mono">{l.licenseId}</code></td>
                  <td className="px-4 py-3 text-ink/70">{l.assignedEmail}</td>
                  <td className="px-4 py-3 text-ink/50">{l.plan || '—'}</td>
                  <td className="px-4 py-3"><Badge tone={STATUS_TONE[l.status]}>{l.status}</Badge></td>
                  <td className="px-4 py-3 text-ink/40 whitespace-nowrap">{new Date(l.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end flex-wrap">
                      {l.status !== 'ACTIVE' && l.status !== 'REVOKED' && <button onClick={() => act('activate', l.id)} className="px-2.5 py-1 rounded-full bg-ink text-white text-xs font-semibold hover:bg-ferozi-deep">Activate</button>}
                      {l.status === 'ACTIVE' && <button onClick={() => act('deactivate', l.id)} className="px-2.5 py-1 rounded-full border border-line text-xs font-semibold hover:border-ferozi">Deactivate</button>}
                      {l.status === 'ACTIVE' && <button onClick={() => resend(l.id)} className="px-2.5 py-1 rounded-full border border-line text-xs font-semibold hover:border-ferozi">Resend Email</button>}
                      {l.status !== 'REVOKED' && <button onClick={() => act('revoke', l.id)} className="px-2.5 py-1 rounded-full border border-red-200 text-red-600 text-xs font-semibold hover:border-red-400">Revoke</button>}
                      <button onClick={() => remove(l.id)} className="text-ink/25 hover:text-red-500 text-xs">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Generate License">
        <form onSubmit={generate} className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg bg-mist p-3">
            <KeyRound className="w-4 h-4 text-ink/40 mt-0.5 shrink-0" />
            <p className="text-xs text-ink/50">A real, cryptographically random License ID is generated — never a guessable or sequential value. It starts INACTIVE; activate it separately once you're ready to grant access.</p>
          </div>
          <div>
            <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Client Email</label>
            <input type="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="client@company.com" className="mt-2 w-full rounded-lg border border-line px-4 py-2.5 text-sm outline-none focus:border-ferozi" />
          </div>
          <div>
            <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Plan (optional)</label>
            <input value={newPlan} onChange={(e) => setNewPlan(e.target.value)} placeholder="e.g. Standard" className="mt-2 w-full rounded-lg border border-line px-4 py-2.5 text-sm outline-none focus:border-ferozi" />
          </div>
          <button type="submit" disabled={busy} className="w-full px-6 py-3 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors disabled:opacity-50">
            {busy ? 'Generating...' : 'Generate License'}
          </button>
        </form>
      </Modal>
    </div>
  )
}
