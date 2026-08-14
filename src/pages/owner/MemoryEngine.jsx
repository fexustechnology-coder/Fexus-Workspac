import { useEffect, useState } from 'react'
import {
  Loader2, Plus, Brain, Clock, Trash2, RefreshCw, Sparkles, Link2, Users
} from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Badge from '../../components/ui/Badge'
import StatCard from '../../components/ui/StatCard'
import Reveal from '../../components/ui/Reveal'
import Modal from '../../components/ui/Modal'
import { api } from '../../lib/api'

function timeAgo(iso) {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function parseJson(str, fallback) {
  try { return JSON.parse(str || '') } catch { return fallback }
}

const STATUS_TONE = { Created: 'neutral', Loaded: 'ferozi', Updated: 'ferozi', 'Saved Temporarily': 'warning', Expired: 'danger' }

function LoadMemoryModal({ open, onClose, onLoaded }) {
  const [candidates, setCandidates] = useState([])
  const [selected, setSelected] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    api.workflows.list().then(({ workflows }) => {
      const list = []
      for (const w of workflows) {
        for (const s of w.stages || []) {
          if (s.assigneeEmployeeId && !['Completed', 'Cancelled', 'Failed', 'Archived'].includes(s.status)) {
            list.push({ stageId: s.id, employeeId: s.assigneeEmployeeId, label: `${s.assigneeLabel} — ${s.title} (${w.title})` })
          }
        }
      }
      setCandidates(list)
      if (list.length) setSelected(list[0].stageId)
    }).catch((err) => setError(err.message || 'Failed to load active assignments.'))
  }, [open])

  async function handleSubmit(e) {
    e.preventDefault()
    const candidate = candidates.find((c) => c.stageId === selected)
    if (!candidate) return setError('No active assignment selected.')
    setSubmitting(true)
    setError('')
    try {
      const { memory } = await api.memory.load(candidate.employeeId, candidate.stageId)
      onLoaded(memory)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Load Memory">
      <form onSubmit={handleSubmit} className="space-y-4">
        {candidates.length === 0 ? (
          <p className="text-sm text-ink/40 py-4 text-center">
            No employees currently have an active Workflow Stage to load memory for.
          </p>
        ) : (
          <div>
            <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Employee working on...</label>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="mt-2 w-full rounded-lg border border-line px-4 py-2.5 text-sm outline-none focus:border-ferozi focus:ring-2 focus:ring-ferozi/20 bg-white"
            >
              {candidates.map((c) => <option key={c.stageId} value={c.stageId}>{c.label}</option>)}
            </select>
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting || candidates.length === 0}
          className="w-full px-6 py-3 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors disabled:opacity-50"
        >
          {submitting ? 'Loading...' : 'Load Memory'}
        </button>
        <p className="text-xs text-ink/35 text-center">
          Pulls a temporary snapshot of Task, Context, and Conversation memory. Nothing is written back to Company Brain,
          the Operating Manual, or the Workflow Engine.
        </p>
      </form>
    </Modal>
  )
}

function MemoryDetailModal({ memoryId, onClose, onChanged }) {
  const [memory, setMemory] = useState(null)
  const [logs, setLogs] = useState([])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function load() {
    if (!memoryId) return
    setError('')
    api.memory.get(memoryId).then(({ memory, logs }) => { setMemory(memory); setLogs(logs); setNotes(memory.workingNotes || '') })
      .catch((err) => setError(err.message || 'Failed to load memory.'))
  }

  useEffect(load, [memoryId])

  if (!memoryId) return null

  async function saveNotes() {
    setSaving(true)
    try {
      await api.memory.update(memoryId, { workingNotes: notes })
      load()
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function refreshConversation() {
    setSaving(true)
    try {
      await api.memory.refreshConversation(memoryId)
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function expire() {
    setSaving(true)
    try {
      await api.memory.expire(memoryId)
      load()
      onChanged()
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    await api.memory.remove(memoryId)
    onChanged()
    onClose()
  }

  const brain = memory ? parseJson(memory.companyBrainSnapshot, {}) : {}
  const manual = memory ? parseJson(memory.operatingManualSnapshot, []) : []
  const client = memory ? parseJson(memory.clientProfileSnapshot, {}) : {}
  const conversation = memory ? parseJson(memory.conversationSnapshot, []) : []

  return (
    <Modal open={!!memoryId} onClose={onClose} title={memory?.taskTitle || 'Memory'}>
      {!memory ? (
        error ? (
          <div className="text-center py-8">
            <p className="text-sm text-red-600 mb-3">{error}</p>
            <button onClick={load} className="px-5 py-2 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors">Try again</button>
          </div>
        ) : (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-ink/30" /></div>
        )
      ) : (
        <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge tone={STATUS_TONE[memory.status]} dot>{memory.status}</Badge>
            <Badge tone="neutral">{memory.employeeLabel}</Badge>
            {memory.priority && <Badge tone="neutral">{memory.priority}</Badge>}
          </div>

          <section>
            <h4 className="font-mono text-[10px] tracking-wideish uppercase text-ink/40 mb-2">1. Task Memory</h4>
            <div className="rounded-xl bg-mist p-3 text-sm space-y-1">
              <p><span className="text-ink/40">Objective:</span> {memory.taskObjective || '—'}</p>
              <p><span className="text-ink/40">Director:</span> {memory.directorLabel || '—'}</p>
              <p><span className="text-ink/40">Due:</span> {memory.dueDate ? new Date(memory.dueDate).toLocaleDateString() : '—'}</p>
            </div>
          </section>

          <section>
            <h4 className="font-mono text-[10px] tracking-wideish uppercase text-ink/40 mb-2">2. Context Memory</h4>
            <div className="rounded-xl bg-mist p-3 text-sm space-y-2">
              <p><span className="text-ink/40">Company:</span> {brain.companyName || '(not recorded)'}</p>
              {brain.brandVoice && <p><span className="text-ink/40">Brand Voice:</span> {brain.brandVoice}</p>}
              {client.name && <p><span className="text-ink/40">Client:</span> {client.name}</p>}
              {manual.length > 0 && (
                <div>
                  <p className="text-ink/40 mb-1">Operating Manual sections:</p>
                  {manual.map((s) => <p key={s.title} className="text-xs text-ink/60">• {s.title}</p>)}
                </div>
              )}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-mono text-[10px] tracking-wideish uppercase text-ink/40">3. Conversation Memory</h4>
              <button onClick={refreshConversation} disabled={saving} className="flex items-center gap-1 text-xs font-semibold text-ferozi-deep hover:underline">
                <RefreshCw className="w-3 h-3" /> Refresh
              </button>
            </div>
            <div className="rounded-xl bg-mist p-3 text-sm space-y-1.5 max-h-32 overflow-y-auto">
              {conversation.length === 0 && <p className="text-ink/35">No recent workflow activity.</p>}
              {conversation.map((c, i) => (
                <p key={i} className="text-xs text-ink/65"><span className="font-semibold">{c.actorLabel}</span>: {c.message}</p>
              ))}
            </div>
          </section>

          <section>
            <h4 className="font-mono text-[10px] tracking-wideish uppercase text-ink/40 mb-2">4. Working Memory (editable)</h4>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Temporary notes for this task..."
              className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-ferozi focus:ring-2 focus:ring-ferozi/20 resize-y"
            />
            <button onClick={saveNotes} disabled={saving} className="mt-2 px-4 py-1.5 rounded-full bg-ink text-white text-xs font-semibold hover:bg-ferozi-deep transition-colors disabled:opacity-50">
              Save notes
            </button>
          </section>

          <section>
            <h4 className="font-mono text-[10px] tracking-wideish uppercase text-ink/40 mb-2">5. Resource Memory</h4>
            <p className="text-xs text-ink/40 flex items-center gap-1.5"><Link2 className="w-3 h-3" /> Linked only — no assets duplicated in this framework yet.</p>
          </section>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center gap-3 pt-2 border-t border-line">
            <button onClick={expire} disabled={saving || memory.status === 'Expired'} className="text-xs font-semibold text-amber-600 hover:underline disabled:opacity-40">
              Mark Expired
            </button>
            <button onClick={remove} className="flex items-center gap-1 text-xs font-semibold text-red-500 hover:underline">
              <Trash2 className="w-3 h-3" /> Delete Now
            </button>
          </div>

          <div>
            <h4 className="font-mono text-[10px] tracking-wideish uppercase text-ink/40 mb-2">Memory Log</h4>
            <div className="space-y-1.5 max-h-28 overflow-y-auto">
              {logs.map((l) => (
                <p key={l.id} className="text-xs text-ink/50 flex items-center gap-2">
                  <Clock className="w-3 h-3 text-ink/25" /> <span className="font-semibold text-ink/70">{l.action}</span> {l.message} <span className="text-ink/30 ml-auto">{timeAgo(l.createdAt)}</span>
                </p>
              ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

export default function MemoryEngine() {
  const [memories, setMemories] = useState([])
  const [ownerDash, setOwnerDash] = useState(null)
  const [ceoDash, setCeoDash] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('owner')
  const [loadOpen, setLoadOpen] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [cleaning, setCleaning] = useState(false)

  function load() {
    setLoading(true)
    Promise.all([api.memory.list(), api.memory.ownerDashboard(), api.memory.ceoDashboard()])
      .then(([m, o, c]) => { setMemories(m.memories); setOwnerDash(o); setCeoDash(c) })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function runCleanup() {
    setCleaning(true)
    try {
      await api.memory.cleanup()
      load()
    } finally {
      setCleaning(false)
    }
  }

  const active = memories.filter((m) => m.status !== 'Expired')
  const expired = memories.filter((m) => m.status === 'Expired')

  return (
    <div>
      <PageHeader
        eyebrow="Memory Engine"
        title="Temporary working memory."
        description="Owner → CEO → Director → Workflow → Employee → Memory Engine → Work → Memory Deleted. Exists only while an employee is actively working — permanent knowledge always stays in Company Brain."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={runCleanup}
              disabled={cleaning}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-line text-sm font-semibold text-ink/60 hover:border-ferozi hover:text-ferozi-deep transition-colors disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" /> {cleaning ? 'Cleaning...' : 'Run Cleanup'}
            </button>
            <button
              onClick={() => setLoadOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors"
            >
              <Plus className="w-4 h-4" /> Load Memory
            </button>
          </div>
        }
      />

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="flex items-center gap-1 p-1 rounded-lg bg-mist border border-line mb-6 w-fit">
        <button onClick={() => setTab('owner')} className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${tab === 'owner' ? 'bg-white shadow-sm text-ink' : 'text-ink/45 hover:text-ink/70'}`}>Owner View</button>
        <button onClick={() => setTab('ceo')} className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${tab === 'ceo' ? 'bg-white shadow-sm text-ink' : 'text-ink/45 hover:text-ink/70'}`}>CEO View</button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-ink/40 py-16 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading the Memory Engine...
        </div>
      ) : tab === 'owner' && ownerDash ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          <StatCard label="Memory Status" value={ownerDash.memoryStatus} icon={Brain} />
          <StatCard label="Active Memories" value={ownerDash.activeMemories} delay={0.05} />
          <StatCard label="Expired Memories" value={ownerDash.expiredMemories} trend="down" delay={0.1} />
          <StatCard label="Current Context Size" value={`${ownerDash.currentContextSizeKb} KB`} delay={0.15} />
        </div>
      ) : tab === 'ceo' && ceoDash ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
          <StatCard label="Active Employees" value={ceoDash.currentActiveEmployees} icon={Users} />
          <StatCard label="Memory Usage" value={ceoDash.currentMemoryUsage} delay={0.05} />
          <StatCard label="Memory Health" value={ceoDash.memoryHealth} trend={ceoDash.memoryHealth === 'Needs Cleanup' ? 'down' : 'up'} delay={0.1} />
        </div>
      ) : null}

      <div className="grid lg:grid-cols-2 gap-6">
        <div>
          <h3 className="font-display font-semibold text-lg mb-4">Active Memory</h3>
          <div className="space-y-3">
            {active.length === 0 && <p className="text-sm text-ink/35 py-6 text-center rounded-2xl border border-dashed border-line">No active memory. Load one to see it here.</p>}
            {active.map((m, i) => (
              <Reveal key={m.id} delay={0.03 * i}>
                <button onClick={() => setSelectedId(m.id)} className="w-full text-left rounded-xl border border-line bg-white p-4 shadow-card hover:shadow-card-hover transition-shadow">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-ink truncate">{m.taskTitle || 'Untitled task'}</p>
                    <Badge tone={STATUS_TONE[m.status]} dot>{m.status}</Badge>
                  </div>
                  <p className="text-xs text-ink/45 mt-1">{m.employeeLabel} · updated {timeAgo(m.updatedAt)}</p>
                </button>
              </Reveal>
            ))}
          </div>
        </div>

        <div>
          <h3 className="font-display font-semibold text-lg mb-4">Expired Memory</h3>
          <div className="space-y-3">
            {expired.length === 0 && <p className="text-sm text-ink/35 py-6 text-center rounded-2xl border border-dashed border-line">Nothing expired yet.</p>}
            {expired.map((m, i) => (
              <Reveal key={m.id} delay={0.03 * i}>
                <button onClick={() => setSelectedId(m.id)} className="w-full text-left rounded-xl border border-line bg-mist/60 p-4 opacity-70 hover:opacity-100 transition-opacity">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-ink truncate">{m.taskTitle || 'Untitled task'}</p>
                    <Badge tone="danger" dot>Expired</Badge>
                  </div>
                  <p className="text-xs text-ink/45 mt-1">{m.employeeLabel} · updated {timeAgo(m.updatedAt)}</p>
                </button>
              </Reveal>
            ))}
          </div>
        </div>
      </div>

      <LoadMemoryModal open={loadOpen} onClose={() => setLoadOpen(false)} onLoaded={() => load()} />
      <MemoryDetailModal memoryId={selectedId} onClose={() => setSelectedId(null)} onChanged={() => load()} />
    </div>
  )
}
