import { useEffect, useState } from 'react'
import {
  Loader2, Plus, Workflow as WorkflowIcon, Clock, CheckCircle2, XCircle, Building2
} from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Badge from '../../components/ui/Badge'
import StatCard from '../../components/ui/StatCard'
import Reveal from '../../components/ui/Reveal'
import Modal from '../../components/ui/Modal'
import { api } from '../../lib/api'
import { DEPARTMENTS } from '../../lib/departments'
import { AUTOMATION_MODULES, QUEUE_STATUSES, STATUS_TONE, findModule } from '../../lib/automationEngineConstants'

function timeAgo(iso) {
  if (!iso) return null
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function deptName(key) {
  return DEPARTMENTS.find((d) => d.key === key)?.name || key
}

function NewJobModal({ open, onClose, onCreated }) {
  const [moduleKey, setModuleKey] = useState(AUTOMATION_MODULES[0].key)
  const [capability, setCapability] = useState(AUTOMATION_MODULES[0].capabilities[0] || '')
  const [completedStages, setCompletedStages] = useState([])
  const [stageId, setStageId] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    api.workflows.list().then(({ workflows }) => {
      const stages = workflows.flatMap((w) => (w.stages || []).filter((s) => s.status === 'Completed').map((s) => ({ ...s, workflowTitle: w.title })))
      setCompletedStages(stages)
    }).catch((err) => setError(err.message || 'Failed to load completed stages.'))
  }, [open])

  const mod = findModule(moduleKey)

  function handleModuleChange(key) {
    setModuleKey(key)
    setCapability(findModule(key)?.capabilities[0] || '')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!capability) return setError('This module has no capabilities defined yet.')
    setSubmitting(true)
    setError('')
    try {
      const { job } = await api.automationJobs.create({ module: moduleKey, capability, stageId: stageId || undefined })
      onCreated(job)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New Automation Job">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Module</label>
          <select
            value={moduleKey}
            onChange={(e) => handleModuleChange(e.target.value)}
            className="mt-2 w-full rounded-lg border border-line px-4 py-2.5 text-sm outline-none focus:border-ferozi focus:ring-2 focus:ring-ferozi/20 bg-white"
          >
            {AUTOMATION_MODULES.map((m) => <option key={m.key} value={m.key}>{m.name}</option>)}
          </select>
        </div>
        <div>
          <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Capability</label>
          {mod.capabilities.length === 0 ? (
            <p className="mt-2 text-sm text-amber-600">No capabilities were specified for this module in the brief.</p>
          ) : (
            <select
              value={capability}
              onChange={(e) => setCapability(e.target.value)}
              className="mt-2 w-full rounded-lg border border-line px-4 py-2.5 text-sm outline-none focus:border-ferozi focus:ring-2 focus:ring-ferozi/20 bg-white"
            >
              {mod.capabilities.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>
        <div>
          <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Link to completed work (optional)</label>
          <select
            value={stageId}
            onChange={(e) => setStageId(e.target.value)}
            className="mt-2 w-full rounded-lg border border-line px-4 py-2.5 text-sm outline-none focus:border-ferozi focus:ring-2 focus:ring-ferozi/20 bg-white"
          >
            <option value="">— Not linked —</option>
            {completedStages.map((s) => (
              <option key={s.id} value={s.id}>{s.workflowTitle} — {s.title} ({s.assigneeLabel || 'Unassigned'})</option>
            ))}
          </select>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full px-6 py-3 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors disabled:opacity-50"
        >
          {submitting ? 'Creating...' : 'Create Job'}
        </button>
        <p className="text-xs text-ink/35 text-center">
          Framework only — this prepares a job record. No external API is called.
        </p>
      </form>
    </Modal>
  )
}

function JobDetailModal({ job, onClose, onUpdated }) {
  const [detail, setDetail] = useState(null)
  const [result, setResult] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')

  function load() {
    if (!job) return
    setLoadError('')
    api.automationJobs.get(job.id).then(({ job }) => { setDetail(job); setResult(job.result || '') })
      .catch((err) => setLoadError(err.message || 'Failed to load job detail.'))
  }

  useEffect(load, [job])

  if (!job) return null

  async function setStatus(status) {
    setSaving(true)
    try {
      const { job: updated } = await api.automationJobs.update(job.id, { status })
      onUpdated(updated)
      const { job: full } = await api.automationJobs.get(job.id)
      setDetail(full)
    } finally {
      setSaving(false)
    }
  }

  async function saveResult() {
    setSaving(true)
    try {
      const { job: updated } = await api.automationJobs.update(job.id, { result })
      onUpdated(updated)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={!!job} onClose={onClose} title={job.capability}>
      {!detail ? (
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
            <Badge tone="neutral">{findModule(detail.module)?.name}</Badge>
            <Badge tone={STATUS_TONE[detail.status]} dot>{detail.status}</Badge>
            {detail.departmentKey && <Badge tone="neutral">{deptName(detail.departmentKey)}</Badge>}
          </div>
          {detail.employeeLabel && <p className="text-sm text-ink/60">Linked to work by <span className="font-semibold">{detail.employeeLabel}</span></p>}

          <div>
            <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Move to</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {QUEUE_STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  disabled={saving || s === detail.status}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors disabled:opacity-40 ${
                    s === detail.status ? 'border-ink bg-ink text-white' : 'border-line text-ink/60 hover:border-ferozi'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Result (what was prepared)</label>
            <textarea
              rows={3}
              value={result}
              onChange={(e) => setResult(e.target.value)}
              placeholder="e.g. Website build job prepared; deployment not executed (framework only)."
              className="mt-2 w-full rounded-lg border border-line px-4 py-2.5 text-sm outline-none focus:border-ferozi focus:ring-2 focus:ring-ferozi/20 resize-y"
            />
            <button onClick={saveResult} disabled={saving} className="mt-2 px-5 py-2 rounded-full bg-ink text-white text-xs font-semibold hover:bg-ferozi-deep transition-colors disabled:opacity-50">
              Save result
            </button>
          </div>

          <div>
            <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Log</label>
            <div className="mt-2 space-y-2 max-h-52 overflow-y-auto">
              {detail.logs?.map((l) => (
                <div key={l.id} className="text-xs text-ink/60 flex items-center gap-2">
                  <Clock className="w-3 h-3 text-ink/25 shrink-0" />
                  <span className="font-semibold text-ink/80">{l.status}</span>
                  <span>· {l.message}</span>
                  <span className="text-ink/30 ml-auto shrink-0">{timeAgo(l.createdAt)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

export default function AutomationEngine() {
  const [jobs, setJobs] = useState([])
  const [ownerDash, setOwnerDash] = useState(null)
  const [ceoDash, setCeoDash] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [moduleFilter, setModuleFilter] = useState('')
  const [newJobOpen, setNewJobOpen] = useState(false)
  const [selectedJob, setSelectedJob] = useState(null)
  const [tab, setTab] = useState('owner')

  function load() {
    setLoading(true)
    Promise.all([
      api.automationJobs.list(moduleFilter || undefined),
      api.automationJobs.ownerDashboard(),
      api.automationJobs.ceoDashboard()
    ])
      .then(([j, o, c]) => { setJobs(j.jobs); setOwnerDash(o); setCeoDash(c) })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [moduleFilter])

  const jobsByStatus = QUEUE_STATUSES.reduce((acc, s) => ({ ...acc, [s]: jobs.filter((j) => j.status === s) }), {})

  return (
    <div>
      <PageHeader
        eyebrow="Automation Engine"
        title="The execution layer."
        description="Owner → CEO → Director → Workflow Engine → Employees → Automation Engine → Result. Framework only — nothing here calls a real external service."
        actions={
          <button
            onClick={() => setNewJobOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors"
          >
            <Plus className="w-4 h-4" /> New Job
          </button>
        }
      />

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="flex items-center gap-1 p-1 rounded-lg bg-mist border border-line mb-6 w-fit">
        <button onClick={() => setTab('owner')} className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-colors ${tab === 'owner' ? 'bg-white shadow-sm text-ink' : 'text-ink/45 hover:text-ink/70'}`}>
          Owner View
        </button>
        <button onClick={() => setTab('ceo')} className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-colors ${tab === 'ceo' ? 'bg-white shadow-sm text-ink' : 'text-ink/45 hover:text-ink/70'}`}>
          CEO View
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-ink/40 py-16 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading the Automation Engine...
        </div>
      ) : tab === 'owner' && ownerDash ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          <StatCard label="Pending Automation" value={ownerDash.pending} icon={WorkflowIcon} />
          <StatCard label="Completed Automation" value={ownerDash.completed} icon={CheckCircle2} delay={0.05} />
          <StatCard label="Failed Automation" value={ownerDash.failed} icon={XCircle} trend="down" delay={0.1} />
          <StatCard label="Avg. Processing Time" value={`${ownerDash.avgProcessingMinutes}m`} icon={Clock} delay={0.15} />
        </div>
      ) : tab === 'ceo' && ceoDash ? (
        <div className="mb-8">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-6">
            <StatCard label="Automation Status" value={ceoDash.automationStatus} icon={WorkflowIcon} />
            <StatCard label="Pending Jobs" value={ceoDash.pendingJobs} delay={0.05} />
            <StatCard label="Completed Jobs" value={ceoDash.completedJobs} delay={0.1} />
          </div>
          <Reveal delay={0.15}>
            <div className="rounded-2xl border border-line bg-white shadow-card p-6">
              <h3 className="font-display font-semibold text-base mb-4">Department Automation</h3>
              {ceoDash.departmentAutomation.length === 0 ? (
                <p className="text-sm text-ink/35">No automation jobs linked to a department yet.</p>
              ) : (
                <div className="space-y-3">
                  {ceoDash.departmentAutomation.map((d) => (
                    <div key={d.departmentKey} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-ink/75"><Building2 className="w-3.5 h-3.5 text-ink/30" /> {deptName(d.departmentKey)}</span>
                      <span className="text-ink/40">{d.completed}/{d.total} completed</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Reveal>
        </div>
      ) : null}

      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-semibold text-lg">Automation Queue</h3>
        <select
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          className="rounded-lg border border-line px-3 py-2 text-sm outline-none bg-white"
        >
          <option value="">All Modules</option>
          {AUTOMATION_MODULES.map((m) => <option key={m.key} value={m.key}>{m.name}</option>)}
        </select>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        {QUEUE_STATUSES.map((status, i) => (
          <Reveal key={status} delay={0.03 * i}>
            <div className="rounded-2xl border border-line bg-mist/60 p-3 min-h-[280px]">
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="font-mono text-[10px] tracking-wideish uppercase text-ink/45">{status}</span>
                <span className="text-xs font-semibold text-ink/40">{jobsByStatus[status].length}</span>
              </div>
              <div className="space-y-2.5">
                {jobsByStatus[status].map((j) => (
                  <button
                    key={j.id}
                    onClick={() => setSelectedJob(j)}
                    className="w-full text-left rounded-xl bg-white border border-line p-3 shadow-card hover:shadow-card-hover transition-shadow"
                  >
                    <p className="text-xs font-semibold text-ink truncate">{j.capability}</p>
                    <p className="text-[10px] text-ink/40 mt-1">{findModule(j.module)?.name}</p>
                    {j.employeeLabel && <p className="text-[10px] text-ink/35 mt-0.5 truncate">{j.employeeLabel}</p>}
                  </button>
                ))}
                {jobsByStatus[status].length === 0 && <p className="text-xs text-ink/30 px-1">Empty</p>}
              </div>
            </div>
          </Reveal>
        ))}
      </div>

      <NewJobModal open={newJobOpen} onClose={() => setNewJobOpen(false)} onCreated={() => load()} />
      <JobDetailModal job={selectedJob} onClose={() => setSelectedJob(null)} onUpdated={() => load()} />
    </div>
  )
}
