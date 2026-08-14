import { useEffect, useMemo, useState } from 'react'
import { Loader2, Plug, ShieldOff, Building2 } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Badge from '../../components/ui/Badge'
import StatCard from '../../components/ui/StatCard'
import Reveal from '../../components/ui/Reveal'
import Modal from '../../components/ui/Modal'
import { api } from '../../lib/api'

const STATUS_TONE = { Connected: 'success', Disconnected: 'neutral', 'Coming Soon': 'warning' }
const HEALTH_TONE = { Healthy: 'success', Unavailable: 'danger', Unknown: 'neutral' }
const STATUSES = ['Connected', 'Disconnected', 'Coming Soon']
const HEALTH_STATES = ['Healthy', 'Unavailable', 'Unknown']

function ConnectorDetailModal({ connectorId, onClose, onChanged }) {
  const [connector, setConnector] = useState(null)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')

  function load() {
    if (!connectorId) return
    setLoadError('')
    api.connectors.get(connectorId).then(({ connector }) => setConnector(connector))
      .catch((err) => setLoadError(err.message || 'Failed to load connector.'))
  }

  useEffect(load, [connectorId])

  if (!connectorId) return null

  async function setStatus(status) {
    setSaving(true)
    try {
      await api.connectors.update(connectorId, { status })
      load()
      onChanged()
    } finally {
      setSaving(false)
    }
  }

  async function setHealth(health) {
    setSaving(true)
    try {
      await api.connectors.update(connectorId, { health })
      load()
      onChanged()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={!!connectorId} onClose={onClose} title={connector?.name || 'Connector'}>
      {!connector ? (
        loadError ? (
          <div className="text-center py-8">
            <p className="text-sm text-red-600 mb-3">{loadError}</p>
            <button onClick={load} className="px-5 py-2 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors">Try again</button>
          </div>
        ) : (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-ink/30" /></div>
        )
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge tone="neutral">{connector.category}</Badge>
            <Badge tone={STATUS_TONE[connector.status]} dot>{connector.status}</Badge>
            <Badge tone={HEALTH_TONE[connector.health]} dot>{connector.health}</Badge>
          </div>

          <div className="rounded-xl bg-mist p-3 text-sm space-y-1.5">
            <p><span className="text-ink/40">Version:</span> {connector.version}</p>
            <p><span className="text-ink/40">Authentication:</span> {connector.authKind} <span className="text-ink/35">(placeholder — not connected, no credential stored)</span></p>
          </div>

          <div>
            <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Status</label>
            <div className="mt-2 flex gap-2 flex-wrap">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  disabled={saving || s === connector.status}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors disabled:opacity-40 ${
                    s === connector.status ? 'border-ink bg-ink text-white' : 'border-line text-ink/60 hover:border-ferozi'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Health</label>
            <div className="mt-2 flex gap-2 flex-wrap">
              {HEALTH_STATES.map((h) => (
                <button
                  key={h}
                  onClick={() => setHealth(h)}
                  disabled={saving || h === connector.health}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors disabled:opacity-40 ${
                    h === connector.health ? 'border-ink bg-ink text-white' : 'border-line text-ink/60 hover:border-ferozi'
                  }`}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Configuration (placeholder)</label>
            <pre className="mt-2 rounded-lg bg-mist p-3 text-xs text-ink/50 overflow-x-auto">{connector.configuration}</pre>
          </div>

          <div>
            <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Log</label>
            <div className="mt-2 space-y-1.5 max-h-32 overflow-y-auto">
              {connector.logs?.length === 0 && <p className="text-xs text-ink/35">No changes logged yet.</p>}
              {connector.logs?.map((l) => (
                <p key={l.id} className="text-xs text-ink/55"><span className="font-semibold text-ink/75">{l.action}</span> — {l.message}</p>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
            <ShieldOff className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">
              No real connection exists. This panel only changes a label — no API is called, no token is requested,
              and there is no field here that stores a credential.
            </p>
          </div>
        </div>
      )}
    </Modal>
  )
}

export default function IntegrationLayer() {
  const [connectors, setConnectors] = useState([])
  const [categories, setCategories] = useState([])
  const [ownerDash, setOwnerDash] = useState(null)
  const [ceoDash, setCeoDash] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('owner')
  const [selectedId, setSelectedId] = useState(null)

  function load() {
    setLoading(true)
    Promise.all([api.connectors.list(), api.connectors.ownerDashboard(), api.connectors.ceoDashboard()])
      .then(([c, o, ce]) => { setConnectors(c.connectors); setCategories(c.categories); setOwnerDash(o); setCeoDash(ce) })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const grouped = useMemo(() => {
    const map = {}
    for (const cat of categories) map[cat.key] = { name: cat.name, items: [] }
    for (const c of connectors) {
      if (!map[c.category]) map[c.category] = { name: c.category, items: [] }
      map[c.category].items.push(c)
    }
    return map
  }, [categories, connectors])

  return (
    <div>
      <PageHeader
        eyebrow="Integration Layer"
        title="The connector registry."
        description="Owner → CEO → Director → Employees → Automation Engine → Integration Layer → External Services. Every connector here is a placeholder — no real API is connected."
        actions={<Badge tone="neutral" dot><Plug className="w-3 h-3 mr-1 inline" />{connectors.length} Connectors</Badge>}
      />

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="flex items-center gap-1 p-1 rounded-lg bg-mist border border-line mb-6 w-fit">
        <button onClick={() => setTab('owner')} className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${tab === 'owner' ? 'bg-white shadow-sm text-ink' : 'text-ink/45 hover:text-ink/70'}`}>Owner View</button>
        <button onClick={() => setTab('ceo')} className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${tab === 'ceo' ? 'bg-white shadow-sm text-ink' : 'text-ink/45 hover:text-ink/70'}`}>CEO View</button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-ink/40 py-16 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading the Integration Layer...
        </div>
      ) : tab === 'owner' && ownerDash ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          <StatCard label="Connected" value={ownerDash.byStatus.Connected} />
          <StatCard label="Disconnected" value={ownerDash.byStatus.Disconnected} delay={0.05} />
          <StatCard label="Coming Soon" value={ownerDash.byStatus['Coming Soon']} delay={0.1} />
          <StatCard label="Healthy" value={ownerDash.byHealth.Healthy} delay={0.15} />
        </div>
      ) : tab === 'ceo' && ceoDash ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
          <StatCard label="Integration Health" value={ceoDash.integrationHealth} />
          <StatCard label="Available Services" value={ceoDash.availableServices} delay={0.05} />
          <StatCard label="Unavailable Services" value={ceoDash.unavailableServices} delay={0.1} />
        </div>
      ) : null}

      <div className="space-y-10">
        {Object.entries(grouped).map(([key, group], gi) => (
          <div key={key}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display font-semibold text-lg flex items-center gap-2">
                <Building2 className="w-4 h-4 text-ink/30" /> {group.name}
              </h2>
              <span className="font-mono text-[10px] tracking-wideish uppercase text-ink/35">{group.items.length} connectors</span>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {group.items.map((c, i) => (
                <Reveal key={c.id} delay={0.02 * (gi * 4 + i)}>
                  <button
                    onClick={() => setSelectedId(c.id)}
                    className="w-full text-left rounded-2xl border border-line bg-white p-4 shadow-card hover:shadow-card-hover transition-shadow"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold text-ink truncate">{c.name}</p>
                      <Badge tone={STATUS_TONE[c.status]} dot>{c.status}</Badge>
                    </div>
                    <p className="text-xs text-ink/40">{c.authKind}</p>
                    <div className="mt-2">
                      <Badge tone={HEALTH_TONE[c.health]}>{c.health}</Badge>
                    </div>
                  </button>
                </Reveal>
              ))}
            </div>
          </div>
        ))}
      </div>

      <ConnectorDetailModal connectorId={selectedId} onClose={() => setSelectedId(null)} onChanged={() => load()} />
    </div>
  )
}
