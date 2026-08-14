import { useEffect, useState } from 'react'
import {
  Loader2, Plus, Upload, Search, TrendingUp, Users, DollarSign, Target,
  Sparkles, CheckCircle2, XCircle, Send, Trash2, Megaphone
} from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Badge from '../../components/ui/Badge'
import StatCard from '../../components/ui/StatCard'
import Reveal from '../../components/ui/Reveal'
import Modal from '../../components/ui/Modal'
import QuickAddForm from '../../components/ui/QuickAddForm'
import { api } from '../../lib/api'

const PIPELINE_STAGES = ['New', 'Contacted', 'Interested', 'Meeting', 'Proposal', 'Won', 'Lost']
const PRIORITIES = ['Critical', 'High', 'Medium', 'Low']
const CHANNELS = ['Instagram', 'LinkedIn', 'Facebook', 'Email', 'WhatsApp', 'X']
const CONTENT_TYPES = [
  { key: 'campaign', label: 'Campaign' }, { key: 'post', label: 'Post' }, { key: 'caption', label: 'Caption' },
  { key: 'hashtags', label: 'Hashtags' }, { key: 'ad', label: 'Ad' }, { key: 'email_campaign', label: 'Email Campaign' },
  { key: 'content_calendar', label: 'Content Calendar' }, { key: 'strategy', label: 'Strategy' },
  { key: 'outreach', label: 'Personalized Outreach' }, { key: 'proposal', label: 'Proposal' }, { key: 'quotation', label: 'Quotation' },
  { key: 'follow_up', label: 'Follow-up Message' }, { key: 'meeting_agenda', label: 'Meeting Agenda' },
  { key: 'meeting_notes', label: 'Meeting Notes' }, { key: 'meeting_reminder', label: 'Meeting Reminder' },
  { key: 'closing_message', label: 'Closing Message' }
]
const CONTENT_STATUS_TONE = { Draft: 'neutral', 'Pending Approval': 'warning', Approved: 'success', Rejected: 'danger' }
const PRIORITY_TONE = { Critical: 'danger', High: 'warning', Medium: 'ferozi', Low: 'neutral' }

function AddLeadModal({ open, onClose, onSaved }) {
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  async function handleSubmit(values) {
    try {
      const res = await api.growth.createLead({ ...values, status: 'New' })
      setResult(res)
      onSaved()
    } catch (err) { setError(err.message) }
  }
  return (
    <Modal open={open} onClose={() => { setResult(null); onClose() }} title="Add Lead">
      {result ? (
        <div className="space-y-3">
          <p className="text-sm text-ink/70">
            {result.outreachSent
              ? `Autonomous mode is on — an initial outreach email was just sent for real.`
              : `Lead created. ${result.lead.email ? 'Copy their portal link to send manually, or turn on Autonomous Mode to have Sales AI reach out automatically.' : 'No email on file, so no outreach can be sent.'}`}
          </p>
          <div className="rounded-lg bg-mist p-3 text-xs font-mono break-all">{result.portalUrl}</div>
          <button onClick={() => { setResult(null); onClose() }} className="w-full px-6 py-2.5 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors">Done</button>
        </div>
      ) : (
        <QuickAddForm
          submitLabel="Add Lead"
          onSubmit={handleSubmit}
          fields={[
            { key: 'name', label: 'Contact / Owner name', placeholder: 'e.g. Jamie Fox' },
            { key: 'company', label: 'Company', placeholder: 'e.g. Cascade Interiors', required: false },
            { key: 'email', label: 'Email', type: 'email', required: false },
            { key: 'phone', label: 'Phone', required: false },
            { key: 'website', label: 'Website', required: false },
            { key: 'industry', label: 'Industry', required: false },
            { key: 'priority', label: 'Priority', type: 'select', options: PRIORITIES }
          ]}
        />
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </Modal>
  )
}

function ImportCsvModal({ open, onClose, onSaved }) {
  const [csvText, setCsvText] = useState('name,company,email,phone,website,industry\n')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)

  async function handleImport() {
    setImporting(true)
    setError('')
    try {
      const res = await api.growth.importCsv(csvText)
      setResult(res)
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setImporting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Import Leads from CSV">
      <p className="text-xs text-ink/45 mb-3">Header row required: name,company,email,phone,website,industry</p>
      <textarea
        rows={8}
        value={csvText}
        onChange={(e) => setCsvText(e.target.value)}
        className="w-full rounded-lg border border-line px-3 py-2 text-xs font-mono outline-none focus:border-ferozi focus:ring-2 focus:ring-ferozi/20"
      />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {result && <p className="mt-2 text-sm text-green-600">Imported {result.imported} leads.{result.errors.length > 0 && ` ${result.errors.length} rows skipped.`}</p>}
      <button
        onClick={handleImport}
        disabled={importing}
        className="mt-3 w-full px-6 py-3 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors disabled:opacity-50"
      >
        {importing ? 'Importing...' : 'Import'}
      </button>
    </Modal>
  )
}

function CRMTab({ onNotify }) {
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [csvOpen, setCsvOpen] = useState(false)
  const [searchMsg, setSearchMsg] = useState('')
  const [selectedLeadId, setSelectedLeadId] = useState(null)
  const [moreClientsOpen, setMoreClientsOpen] = useState(false)

  function load() {
    setLoading(true)
    setError('')
    api.leads.list().then(({ items }) => setLeads(items))
      .catch((err) => setError(err.message || 'Failed to load leads.'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  async function setStatus(lead, status) {
    await api.leads.update(lead.id, { status })
    load()
  }
  async function removeLead(id) {
    await api.leads.remove(id)
    load()
  }
  async function runStubSearch(fn, needsQuery) {
    if (needsQuery) {
      const q = window.prompt('Search for what kind of business? (e.g. "dentists in Austin, TX")')
      if (!q?.trim()) return
      const res = await fn(q)
      setSearchMsg(res.message || `Found ${res.results.length} real businesses via Google Places — use "Get Me More Clients" to turn them into leads with outreach + proposals.`)
      return
    }
    const res = await fn()
    setSearchMsg(res.message)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setMoreClientsOpen(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-ink text-white text-xs font-semibold hover:bg-ferozi-deep transition-colors">
            <Sparkles className="w-3.5 h-3.5" /> Get Me More Clients
          </button>
          <button onClick={() => runStubSearch(api.growth.searchPublicLists)} className="flex items-center gap-1.5 px-3 py-2 rounded-full border border-line text-xs font-semibold text-ink/60 hover:border-ferozi transition-colors">
            <Search className="w-3.5 h-3.5" /> Search Public Lists
          </button>
          <button onClick={() => runStubSearch(api.growth.searchMaps, true)} className="flex items-center gap-1.5 px-3 py-2 rounded-full border border-line text-xs font-semibold text-ink/60 hover:border-ferozi transition-colors">
            <Search className="w-3.5 h-3.5" /> Search Google Maps
          </button>
          <button onClick={() => setCsvOpen(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-full border border-line text-xs font-semibold text-ink/60 hover:border-ferozi transition-colors">
            <Upload className="w-3.5 h-3.5" /> Import CSV
          </button>
        </div>
        <button onClick={() => setAddOpen(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors">
          <Plus className="w-4 h-4" /> Add Lead
        </button>
      </div>

      {searchMsg && <p className="text-xs text-amber-600 mb-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">{searchMsg}</p>}
      {error && (
        <p className="text-xs text-red-600 mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 flex items-center justify-between">
          {error}
          <button onClick={load} className="font-semibold underline shrink-0 ml-3">Retry</button>
        </p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-ink/40 py-16 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Loading CRM...</div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          {PIPELINE_STAGES.map((stage) => {
            const items = leads.filter((l) => l.status === stage)
            return (
              <div key={stage} className="rounded-2xl border border-line bg-mist/60 p-3 min-h-[240px]">
                <div className="flex items-center justify-between mb-3 px-1">
                  <span className="font-mono text-[10px] tracking-wideish uppercase text-ink/45">{stage}</span>
                  <span className="text-xs font-semibold text-ink/40">{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.map((l) => (
                    <button key={l.id} onClick={() => setSelectedLeadId(l.id)} className="w-full text-left rounded-lg bg-white border border-line p-2.5 hover:border-ferozi/50 transition-colors">
                      <div className="flex items-center justify-between mb-1">
                        <select value={l.status} onChange={(e) => { e.stopPropagation(); setStatus(l, e.target.value) }} onClick={(e) => e.stopPropagation()} className="font-mono text-[9px] uppercase bg-transparent outline-none text-ink/40">
                          {PIPELINE_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <button onClick={(e) => { e.stopPropagation(); removeLead(l.id) }} className="text-ink/20 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                      </div>
                      <p className="text-xs font-semibold text-ink">{l.name}</p>
                      {l.company && <p className="text-[10px] text-ink/45">{l.company}</p>}
                      <div className="flex items-center gap-1 mt-1">
                        <Badge tone={PRIORITY_TONE[l.priority]}>{l.priority}</Badge>
                        {l.dealClosedAt && <Badge tone="success">Closed</Badge>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <AddLeadModal open={addOpen} onClose={() => setAddOpen(false)} onSaved={load} />
      <ImportCsvModal open={csvOpen} onClose={() => setCsvOpen(false)} onSaved={load} />
      <LeadDetailModal leadId={selectedLeadId} onClose={() => setSelectedLeadId(null)} onChanged={load} />
      <GetMoreClientsModal open={moreClientsOpen} onClose={() => setMoreClientsOpen(false)} onDone={load} />
    </div>
  )
}

function GetMoreClientsModal({ open, onClose, onDone }) {
  const [query, setQuery] = useState('')
  const [location, setLocation] = useState('')
  const [count, setCount] = useState(5)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  async function run(e) {
    e.preventDefault()
    setRunning(true)
    setError('')
    setResult(null)
    try {
      const res = await api.getMoreClients(query, location, count)
      setResult(res)
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <Modal open={open} onClose={() => { setResult(null); setError(''); onClose() }} title="Get Me More Clients">
      {!result ? (
        <form onSubmit={run} className="space-y-4">
          <p className="text-xs text-ink/45">Real pipeline: finds real businesses via Google Places, researches each with AI, generates real outreach + a real proposal, and stores everything in your CRM under one Campaign.</p>
          <div>
            <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">What kind of business?</label>
            <input value={query} onChange={(e) => setQuery(e.target.value)} required placeholder="e.g. dentists" className="mt-2 w-full rounded-lg border border-line px-4 py-2.5 text-sm outline-none focus:border-ferozi" />
          </div>
          <div>
            <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Location</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Austin, TX" className="mt-2 w-full rounded-lg border border-line px-4 py-2.5 text-sm outline-none focus:border-ferozi" />
          </div>
          <div>
            <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">How many (max 10)</label>
            <input type="number" min="1" max="10" value={count} onChange={(e) => setCount(e.target.value)} className="mt-2 w-full rounded-lg border border-line px-4 py-2.5 text-sm outline-none focus:border-ferozi" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={running} className="w-full px-6 py-3 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors disabled:opacity-50">
            {running ? 'Finding and researching businesses...' : 'Run Pipeline'}
          </button>
        </form>
      ) : (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-ferozi-deep">Processed {result.processed} businesses.</p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {result.results.map((r) => (
              <div key={r.leadId} className="rounded-lg bg-mist p-3 text-xs">
                <p className="font-semibold text-ink">{r.lead}</p>
                <p className="text-ink/45 mt-0.5">{r.note}</p>
              </div>
            ))}
          </div>
          <button onClick={() => { setResult(null); onClose() }} className="w-full px-6 py-2.5 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors">Done</button>
        </div>
      )}
    </Modal>
  )
}

function LeadDetailModal({ leadId, onClose, onChanged }) {
  const [lead, setLead] = useState(null)
  const [portalUrl, setPortalUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [sendAt, setSendAt] = useState('')
  const [error, setError] = useState('')
  const [scheduling, setScheduling] = useState(false)
  const [scheduled, setScheduled] = useState(false)

  useEffect(() => {
    if (!leadId) return
    setError(''); setCopied(false); setScheduled(false); setSendAt('')
    api.leads.list().then(({ items }) => setLead(items.find((l) => l.id === leadId) || null)).catch((err) => setError(err.message))
    api.growth.portalLink(leadId).then(({ portalUrl }) => setPortalUrl(portalUrl)).catch((err) => setError(err.message))
  }, [leadId])

  if (!leadId) return null

  function copyLink() {
    navigator.clipboard?.writeText(portalUrl)
    setCopied(true)
  }

  async function submitSchedule(e) {
    e.preventDefault()
    if (!sendAt) return
    setScheduling(true)
    setError('')
    try {
      await api.growth.scheduleFollowup(leadId, new Date(sendAt).toISOString())
      setScheduled(true)
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setScheduling(false)
    }
  }

  const conversation = (() => { try { return JSON.parse(lead?.conversationLog || '[]') } catch { return [] } })()

  return (
    <Modal open={!!leadId} onClose={onClose} title={lead?.name || 'Lead'}>
      {!lead ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-ink/30" /></div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge tone={PRIORITY_TONE[lead.priority]}>{lead.priority}</Badge>
            <Badge tone="neutral">{lead.status}</Badge>
            {lead.dealClosedAt && <Badge tone="success">Deal Closed</Badge>}
          </div>

          <div>
            <p className="font-mono text-[11px] tracking-wideish uppercase text-ink/45 mb-2">Client Portal Link</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-lg bg-mist px-3 py-2 text-xs font-mono break-all">{portalUrl || 'Loading...'}</div>
              <button onClick={copyLink} className="px-3 py-2 rounded-lg border border-line text-xs font-semibold hover:border-ferozi shrink-0">{copied ? 'Copied' : 'Copy'}</button>
            </div>
            <p className="text-xs text-ink/35 mt-1">This is the real link Sales AI uses to talk with this client — share it directly, or let autonomous mode send it automatically.</p>
          </div>

          {conversation.length > 0 && (
            <div>
              <p className="font-mono text-[11px] tracking-wideish uppercase text-ink/45 mb-2">Conversation</p>
              <div className="space-y-1.5 max-h-40 overflow-y-auto rounded-lg bg-mist p-3">
                {conversation.map((m, i) => (
                  <p key={i} className="text-xs text-ink/60"><span className="font-semibold">{m.sender === 'client' ? lead.name : 'Sales AI'}:</span> {m.content}</p>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="font-mono text-[11px] tracking-wideish uppercase text-ink/45 mb-2">Schedule a Follow-up</p>
            {!lead.email ? (
              <p className="text-xs text-ink/40">This lead has no email on file — add one to schedule a follow-up.</p>
            ) : scheduled ? (
              <p className="text-xs text-ferozi-deep">Scheduled — Email AI will send it for real at that time, no further action needed.</p>
            ) : (
              <form onSubmit={submitSchedule} className="flex items-center gap-2">
                <input type="datetime-local" value={sendAt} onChange={(e) => setSendAt(e.target.value)} className="flex-1 rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-ferozi" />
                <button type="submit" disabled={scheduling} className="px-4 py-2 rounded-full bg-ink text-white text-xs font-semibold hover:bg-ferozi-deep transition-colors shrink-0 disabled:opacity-50">
                  {scheduling ? 'Scheduling...' : 'Schedule'}
                </button>
              </form>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </Modal>
  )
}

function GenerateContentModal({ open, onClose, onCreated }) {
  const [leads, setLeads] = useState([])
  const [error, setError] = useState('')
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    if (!open) return
    api.leads.list().then(({ items }) => setLeads(items))
      .catch((err) => setError(err.message || 'Failed to load leads for linking.'))
  }, [open])

  async function handleSubmit(values) {
    setGenerating(true)
    setError('')
    try {
      const { item } = await api.growth.content.generate({
        type: values.type, mode: values.mode, channel: values.channel || undefined,
        leadId: values.leadId || undefined, extra: values.extra
      })
      onCreated(item)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Generate Growth Content">
      <QuickAddForm
        submitLabel={generating ? 'Generating...' : 'Generate'}
        onSubmit={handleSubmit}
        fields={[
          { key: 'type', label: 'Content Type', type: 'select', options: CONTENT_TYPES.map((t) => ({ value: t.key, label: t.label })) },
          {
            key: 'mode', label: 'Mode', type: 'select',
            options: [{ value: 'free', label: 'Local (Free)' }, { value: 'ai', label: 'AI — Groq (Paid)' }]
          },
          { key: 'channel', label: 'Channel (optional)', type: 'select', required: false, options: [{ value: '', label: '— None —' }, ...CHANNELS.map((c) => ({ value: c, label: c }))] },
          { key: 'leadId', label: 'Link to Lead (optional)', type: 'select', required: false, options: [{ value: '', label: '— None —' }, ...leads.map((l) => ({ value: l.id, label: `${l.name}${l.company ? ` (${l.company})` : ''}` }))] },
          { key: 'extra', label: 'Extra instructions (optional)', required: false }
        ]}
      />
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </Modal>
  )
}

function ContentTab() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [genOpen, setGenOpen] = useState(false)
  const [selected, setSelected] = useState(null)

  function load() {
    setLoading(true)
    setError('')
    api.growth.content.list().then(({ items }) => setItems(items))
      .catch((err) => setError(err.message || 'Failed to load content.'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  async function submitForApproval(id) {
    await api.growth.content.submitForApproval(id)
    load()
    if (selected) setSelected((s) => ({ ...s, status: 'Pending Approval' }))
  }

  async function decide(id, approve) {
    const { item } = await api.growth.content.approve(id, approve)
    load()
    setSelected(item)
  }

  async function markSent(id) {
    const { item } = await api.growth.content.markSent(id)
    load()
    setSelected(item)
  }

  async function removeItem(id) {
    await api.growth.content.remove(id)
    setSelected(null)
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-ink/50">Marketing AI + Sales AI content — every item requires explicit approval before it could ever be sent.</p>
        <button onClick={() => setGenOpen(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors shrink-0">
          <Sparkles className="w-4 h-4" /> Generate Content
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-ink/40 py-16 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Loading content...</div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={load} className="mt-3 px-5 py-2 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors">Try again</button>
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-ink/35 py-10 text-center rounded-2xl border border-dashed border-line">No content generated yet.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item, i) => (
            <Reveal key={item.id} delay={0.02 * i}>
              <button onClick={() => setSelected(item)} className="w-full text-left rounded-2xl border border-line bg-white p-4 shadow-card hover:shadow-card-hover transition-shadow">
                <div className="flex items-center justify-between mb-2">
                  <Badge tone={item.generationMode === 'ai' ? 'warning' : 'neutral'}>{item.generationMode === 'ai' ? 'AI' : 'Free'}</Badge>
                  <Badge tone={CONTENT_STATUS_TONE[item.status]} dot>{item.status}</Badge>
                </div>
                <p className="text-sm font-semibold text-ink truncate">{item.title}</p>
                <p className="text-xs text-ink/45 mt-1 line-clamp-2">{item.content.slice(0, 100)}</p>
              </button>
            </Reveal>
          ))}
        </div>
      )}

      <GenerateContentModal open={genOpen} onClose={() => setGenOpen(false)} onCreated={load} />

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.title || ''}>
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge tone={CONTENT_STATUS_TONE[selected.status]} dot>{selected.status}</Badge>
              <Badge tone="neutral">{selected.generationMode === 'ai' ? 'AI — Groq' : 'Local (Free)'}</Badge>
              {selected.channel && <Badge tone="neutral">{selected.channel}</Badge>}
            </div>
            <pre className="text-sm text-ink/75 bg-mist rounded-lg p-4 whitespace-pre-wrap font-sans">{selected.content}</pre>

            <div className="flex flex-wrap gap-2">
              {selected.status === 'Draft' && (
                <button onClick={() => submitForApproval(selected.id)} className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-line text-xs font-semibold hover:border-ferozi">
                  <Send className="w-3.5 h-3.5" /> Submit for Approval
                </button>
              )}
              {selected.status === 'Pending Approval' && (
                <>
                  <p className="w-full text-sm font-semibold text-ink">Approve Campaign?</p>
                  <button onClick={() => decide(selected.id, true)} className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-ink text-white text-xs font-semibold hover:bg-ferozi-deep">
                    <CheckCircle2 className="w-3.5 h-3.5" /> YES
                  </button>
                  <button onClick={() => decide(selected.id, false)} className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-line text-xs font-semibold hover:border-red-400 text-red-500">
                    <XCircle className="w-3.5 h-3.5" /> NO
                  </button>
                </>
              )}
              {selected.status === 'Approved' && !selected.sentAt && (
                <button onClick={() => markSent(selected.id)} className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-ferozi-deep text-white text-xs font-semibold">
                  Mark Sent (Framework Only)
                </button>
              )}
              {selected.sentAt && <Badge tone="success" dot>Marked Sent (framework only — nothing was really sent)</Badge>}
              <button onClick={() => removeItem(selected.id)} className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold text-red-500 hover:underline ml-auto">
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function AnalyticsTab() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  function load() {
    setError('')
    api.growth.analytics().then(setData).catch((err) => setError(err.message || 'Failed to compute analytics.'))
  }
  useEffect(load, [])

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm text-red-700">{error}</p>
        <button onClick={load} className="mt-3 px-5 py-2 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors">Try again</button>
      </div>
    )
  }
  if (!data) return <div className="flex items-center gap-2 text-sm text-ink/40 py-16 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Computing analytics...</div>

  return (
    <div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-5">
        <StatCard label="Total Leads" value={data.leads.total} icon={Users} />
        <StatCard label="Conversion Rate" value={`${data.conversionRate}%`} icon={Target} delay={0.05} />
        <StatCard label="Win Rate" value={`${data.winRate}%`} icon={TrendingUp} delay={0.1} />
        <StatCard label="Revenue" value={`$${data.revenue.toLocaleString()}`} icon={DollarSign} delay={0.15} />
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <StatCard label="ROI" value={data.roi === null ? 'N/A' : `${data.roi}%`} />
        <StatCard label="Pipeline Value" value={`$${data.pipelineValue.toLocaleString()}`} delay={0.05} />
        <StatCard label="Meetings" value={data.meetings.total} delay={0.1} />
        <StatCard label="Content Generated" value={data.campaignPerformance.totalContent} icon={Megaphone} delay={0.15} />
      </div>
      <Reveal delay={0.1}>
        <div className="rounded-2xl border border-line bg-white shadow-card p-6">
          <h3 className="font-display font-semibold text-base mb-4">Leads by Stage</h3>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-3">
            {PIPELINE_STAGES.map((s) => (
              <div key={s} className="text-center">
                <p className="font-display font-bold text-xl">{data.leads.byStatus[s] || 0}</p>
                <p className="text-[10px] text-ink/40 mt-1">{s}</p>
              </div>
            ))}
          </div>
        </div>
      </Reveal>
    </div>
  )
}

function AutonomousModeToggle() {
  const [settings, setSettings] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function load() {
    setError('')
    api.growth.autonomousSettings.get().then(({ settings }) => setSettings(settings))
      .catch((err) => setError(err.message || 'Failed to load autonomous mode settings.'))
  }
  useEffect(load, [])

  async function toggle(key) {
    setSaving(true)
    try {
      const { settings: updated } = await api.growth.autonomousSettings.update({ [key]: !settings[key] })
      setSettings(updated)
    } finally {
      setSaving(false)
    }
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 mb-6 flex items-center justify-between text-sm text-red-700">
        {error}
        <button onClick={load} className="font-semibold underline shrink-0 ml-3">Retry</button>
      </div>
    )
  }
  if (!settings) return null

  return (
    <div className="rounded-2xl border border-line bg-white shadow-card p-5 mb-6 flex flex-wrap items-center gap-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => toggle('salesAutonomous')}
          disabled={saving}
          className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${settings.salesAutonomous ? 'bg-ferozi' : 'bg-line'}`}
        >
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${settings.salesAutonomous ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
        <div>
          <p className="text-sm font-semibold">Sales AI Autonomous Mode</p>
          <p className="text-xs text-ink/45">When on, Sales AI emails proposals, quotations, and outreach for real via Gmail — no approval click.</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => toggle('growthAutonomous')}
          disabled={saving}
          className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${settings.growthAutonomous ? 'bg-ferozi' : 'bg-line'}`}
        >
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${settings.growthAutonomous ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
        <div>
          <p className="text-sm font-semibold">Growth AI Autonomous Mode</p>
          <p className="text-xs text-ink/45">Reserved for future automatic campaign/content generation on demand.</p>
        </div>
      </div>
    </div>
  )
}

export default function GrowthAI() {
  const [tab, setTab] = useState('crm')

  return (
    <div>
      <PageHeader
        eyebrow="Growth AI Department"
        title="Marketing + Sales, combined."
        description="Lead Finder, CRM, Marketing AI, Sales AI, Proposals, Follow-ups, Meetings, and Analytics — powered by Groq, with a Local (Free) mode everywhere."
        actions={<Badge tone="ferozi" dot>Groq</Badge>}
      />

      <AutonomousModeToggle />

      <div className="flex items-center gap-1 p-1 rounded-lg bg-mist border border-line mb-6 w-fit">
        <button onClick={() => setTab('crm')} className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${tab === 'crm' ? 'bg-white shadow-sm text-ink' : 'text-ink/45 hover:text-ink/70'}`}>Leads & CRM</button>
        <button onClick={() => setTab('content')} className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${tab === 'content' ? 'bg-white shadow-sm text-ink' : 'text-ink/45 hover:text-ink/70'}`}>Content Studio</button>
        <button onClick={() => setTab('analytics')} className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${tab === 'analytics' ? 'bg-white shadow-sm text-ink' : 'text-ink/45 hover:text-ink/70'}`}>Analytics</button>
      </div>

      {tab === 'crm' && <CRMTab />}
      {tab === 'content' && <ContentTab />}
      {tab === 'analytics' && <AnalyticsTab />}
    </div>
  )
}
