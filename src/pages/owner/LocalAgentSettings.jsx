import { useEffect, useState } from 'react'
import PageHeader from '../../components/ui/PageHeader'
import Badge from '../../components/ui/Badge'
import { api } from '../../lib/api'
import { Copy, RefreshCw, Wifi, WifiOff } from 'lucide-react'

const DIRECTORY_PERMS = [
  ['allowDesktop', 'Desktop'],
  ['allowFexusWorkspace', 'FEXUS Workspace'],
  ['allowDocuments', 'Documents'],
  ['allowDownloads', 'Downloads']
]
const CAPABILITY_PERMS = [
  ['allowOpenFiles', 'Open files'],
  ['allowOpenFolders', 'Open folders'],
  ['allowOpenApplications', 'Open applications'],
  ['allowOpenUrls', 'Open URLs / browser search'],
  ['allowReadMetadata', 'Read approved file metadata'],
  ['allowMouseControl', 'Mouse control'],
  ['allowWriteFiles', 'Create/write files (for saving reports)'],
  ['allowKeyboardControl', 'Keyboard control'],
  ['allowShutdown', 'Shutdown (requires confirmation)'],
  ['allowRestart', 'Restart (requires confirmation)']
]

export default function LocalAgentSettings() {
  const [pairing, setPairing] = useState(null)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)

  function load() {
    setError('')
    api.localAgent.get().then(({ pairing }) => setPairing(pairing)).catch((err) => setError(err.message || 'Failed to load Local Agent settings.'))
  }
  useEffect(load, [])

  async function toggle(field) {
    setError('')
    try {
      const { pairing: updated } = await api.localAgent.updatePermissions({ [field]: !pairing.permissions[field] })
      setPairing(updated)
    } catch (err) {
      setError(err.message)
    }
  }

  async function regenerate() {
    if (!window.confirm('Regenerate the pairing token? Your Local Agent will need the new token before it can connect again.')) return
    setError('')
    try {
      const { pairing: updated } = await api.localAgent.regenerateToken()
      setPairing(updated)
    } catch (err) {
      setError(err.message)
    }
  }

  async function checkConnection() {
    setChecking(true); setError('')
    try {
      const { pairing: updated, error: connError } = await api.localAgent.checkConnection()
      setPairing(updated)
      if (connError) setError(connError)
    } catch (err) {
      setError(err.message)
    } finally {
      setChecking(false)
    }
  }

  if (!pairing) {
    return (
      <div>
        <PageHeader eyebrow="Voice Agent" title="Local PC Agent" description="Loading..." />
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        eyebrow="Voice Agent"
        title="Local PC Agent"
        description="Lets FEXUS perform real, explicitly-approved actions on your own computer through voice — opening files, folders, and applications. Runs entirely on your machine; nothing here is a browser permission."
      />

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="rounded-2xl border border-line bg-white shadow-card p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {pairing.connected ? <Wifi className="w-4 h-4 text-ferozi-deep" /> : <WifiOff className="w-4 h-4 text-ink/30" />}
            <p className="font-semibold text-sm">FEXUS Local Agent</p>
            <Badge tone={pairing.connected ? 'success' : 'neutral'}>{pairing.connected ? 'Connected' : 'Disconnected'}</Badge>
          </div>
          <button onClick={checkConnection} disabled={checking} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-line text-xs font-semibold hover:border-ferozi disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} /> {checking ? 'Checking...' : 'Check Connection'}
          </button>
        </div>
        {pairing.lastSeenAt && <p className="text-xs text-ink/40 mb-4">Last seen: {new Date(pairing.lastSeenAt).toLocaleString()}</p>}

        <div className="rounded-lg bg-mist p-4">
          <p className="text-xs font-semibold text-ink/60 mb-2">Setup — run this on your own Windows computer:</p>
          <ol className="text-xs text-ink/60 space-y-1.5 list-decimal list-inside">
            <li>Download/copy the <code className="font-mono bg-white px-1 py-0.5 rounded">local-agent</code> folder from your FEXUS project.</li>
            <li>Inside it, run <code className="font-mono bg-white px-1 py-0.5 rounded">npm install</code>.</li>
            <li>Create a <code className="font-mono bg-white px-1 py-0.5 rounded">.env</code> file with this exact pairing token:</li>
          </ol>
          <div className="flex items-center gap-2 mt-2">
            <code className="flex-1 font-mono text-xs bg-white rounded-lg px-3 py-2 break-all">LOCAL_AGENT_PAIRING_TOKEN={pairing.pairingToken}</code>
            <button onClick={() => navigator.clipboard?.writeText(`LOCAL_AGENT_PAIRING_TOKEN=${pairing.pairingToken}`)} className="px-3 py-2 rounded-lg border border-line text-xs font-semibold hover:border-ferozi shrink-0"><Copy className="w-3.5 h-3.5" /></button>
          </div>
          <ol start="4" className="text-xs text-ink/60 space-y-1.5 list-decimal list-inside mt-2">
            <li>Run <code className="font-mono bg-white px-1 py-0.5 rounded">npm start</code> — it listens on localhost only.</li>
            <li>Click "Check Connection" above once it's running.</li>
          </ol>
          <button onClick={regenerate} className="mt-3 text-xs text-red-500 hover:underline">Regenerate token (disconnects the current agent)</button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-line bg-white shadow-card p-6">
          <p className="font-semibold text-sm mb-4">Permitted Directories</p>
          <div className="space-y-3">
            {DIRECTORY_PERMS.map(([field, label]) => (
              <label key={field} className="flex items-center justify-between text-sm">
                <span>{label}</span>
                <input type="checkbox" checked={pairing.permissions[field]} onChange={() => toggle(field)} />
              </label>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-white shadow-card p-6">
          <p className="font-semibold text-sm mb-4">Capabilities</p>
          <div className="space-y-3">
            {CAPABILITY_PERMS.map(([field, label]) => (
              <label key={field} className="flex items-center justify-between text-sm">
                <span>{label}</span>
                <input type="checkbox" checked={pairing.permissions[field]} onChange={() => toggle(field)} />
              </label>
            ))}
          </div>
        </div>
      </div>

      <p className="text-xs text-ink/35 mt-6">Every permission here defaults to off. The Local Agent also independently enforces its own directory allowlist — two real checks, not one.</p>
    </div>
  )
}
