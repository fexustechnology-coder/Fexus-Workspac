import { useEffect, useState } from 'react'
import { Loader2, Plus, Globe, Send, Sparkles, ShieldOff, PlayCircle, CheckSquare, Square, FileText, Users, Code2, Download, Eye, Rocket } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Badge from '../../components/ui/Badge'
import StatCard from '../../components/ui/StatCard'
import Reveal from '../../components/ui/Reveal'
import Modal from '../../components/ui/Modal'
import QuickAddForm from '../../components/ui/QuickAddForm'
import { api } from '../../lib/api'

const WEBSITE_TYPES = [
  'Landing Page', 'Business Website', 'Portfolio', 'Agency Website', 'E-Commerce',
  'Restaurant', 'Dental', 'Real Estate', 'Construction', 'Education', 'Healthcare', 'Corporate'
]
const STATUSES = ['Planning', 'Design Ready', 'Components Ready', 'Assets Ready', 'Deployment Ready']
const STATUS_TONE = { Planning: 'neutral', 'Design Ready': 'ferozi', 'Components Ready': 'ferozi', 'Assets Ready': 'ferozi', 'Deployment Ready': 'success' }
const CODE_STACKS = ['HTML, CSS & JavaScript', 'React', 'React + Tailwind CSS', 'Next.js', 'Next.js + Tailwind CSS']

function parseJson(str, fallback) {
  try { return JSON.parse(str || '') } catch { return fallback }
}

function NewPlanModal({ open, onClose, onCreated }) {
  const [stages, setStages] = useState([])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    api.workflows.list().then(({ workflows }) => {
      const list = []
      for (const w of workflows) {
        if (w.departmentKey !== 'website') continue
        for (const s of w.stages || []) {
          if (!['Completed', 'Cancelled', 'Failed', 'Archived'].includes(s.status)) {
            list.push({ id: s.id, label: `${s.assigneeLabel || 'Unassigned'} — ${s.title} (${w.title})` })
          }
        }
      }
      setStages(list)
    }).catch((err) => setError(err.message || 'Failed to load available stages.'))
  }, [open])

  async function handleSubmit(values) {
    setSubmitting(true)
    setError('')
    try {
      const { project } = await api.websiteAI.generate({
        websiteType: values.websiteType,
        requirementsText: values.requirementsText,
        stageId: values.stageId || undefined
      })
      onCreated(project)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New Website Plan">
      <QuickAddForm
        submitLabel={submitting ? 'Generating...' : 'Generate Plan'}
        onSubmit={handleSubmit}
        fields={[
          { key: 'websiteType', label: 'Website Type', type: 'select', options: WEBSITE_TYPES },
          { key: 'requirementsText', label: 'Requirements', placeholder: 'e.g. 5-page site for a dental clinic, warm and trustworthy tone...', required: false },
          {
            key: 'stageId', label: 'Link to active Website Stage (optional)', type: 'select', required: false,
            options: [{ value: '', label: '— Not linked —' }, ...stages.map((s) => ({ value: s.id, label: s.label }))]
          }
        ]}
      />
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <p className="mt-3 text-xs text-ink/35 text-center">
        Website AI plans only — it never writes real HTML/React/Tailwind code and never deploys anything.
      </p>
    </Modal>
  )
}

function ExecutionPanel({ project, onChanged }) {
  const [progress, setProgress] = useState(null)
  const [report, setReport] = useState(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const [view, setView] = useState('progress')

  function load() {
    setError('')
    api.websiteAI.progress(project.id).then(setProgress)
      // Same bug class as the Owner Dashboard fix: this used to swallow
      // failures silently, leaving `progress` null forever and the UI
      // stuck on the spinner below with no way out. Now it surfaces.
      .catch((err) => setError(err.message || 'Failed to load execution progress.'))
  }

  useEffect(load, [project.id])

  async function startExecution() {
    setStarting(true)
    setError('')
    try {
      await api.websiteAI.startExecution(project.id)
      load()
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setStarting(false)
    }
  }

  async function toggleItem(name, checked) {
    try {
      await api.websiteAI.toggleChecklist(project.id, name, checked)
      onChanged()
    } catch (err) {
      setError(err.message)
    }
  }

  async function viewReport() {
    try {
      const r = await api.websiteAI.report(project.id)
      setReport(r)
      setView('report')
    } catch (err) {
      setError(err.message)
    }
  }

  const checklist = parseJson(project.qualityChecklist, [])

  if (!progress) {
    return error ? (
      <div className="text-center py-8">
        <p className="text-sm text-red-600 mb-3">{error}</p>
        <button onClick={load} className="px-5 py-2 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors">
          Try again
        </button>
      </div>
    ) : (
      <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-ink/30" /></div>
    )
  }

  if (!progress.started) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-ink/50 mb-4">
          Break this plan into 10 real Workflow Engine stages and assign them to the existing Website Department employees.
        </p>
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <button
          onClick={startExecution}
          disabled={starting}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors disabled:opacity-50"
        >
          <PlayCircle className="w-4 h-4" /> {starting ? 'Starting...' : 'Start Execution'}
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-1 p-1 rounded-lg bg-mist border border-line mb-4 w-fit">
        <button onClick={() => setView('progress')} className={`px-3 py-1.5 rounded-md text-xs font-semibold ${view === 'progress' ? 'bg-white shadow-sm text-ink' : 'text-ink/45'}`}>Progress</button>
        <button onClick={() => setView('checklist')} className={`px-3 py-1.5 rounded-md text-xs font-semibold ${view === 'checklist' ? 'bg-white shadow-sm text-ink' : 'text-ink/45'}`}>Quality Checklist</button>
        <button onClick={viewReport} className={`px-3 py-1.5 rounded-md text-xs font-semibold ${view === 'report' ? 'bg-white shadow-sm text-ink' : 'text-ink/45'}`}>Report</button>
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      {view === 'progress' && (
        <div className="space-y-4">
          {progress.buildStage && (
            <div className="flex items-center gap-2 flex-wrap">
              {['Planning', 'Building', 'Packaging', 'Deploy Ready', 'Completed'].map((s) => (
                <Badge key={s} tone={s === progress.buildStage ? 'ferozi' : 'neutral'} dot={s === progress.buildStage}>{s}</Badge>
              ))}
            </div>
          )}
          {progress.autoBuildNote && (
            <p className="text-xs text-ferozi-deep bg-ferozi-soft rounded-lg px-3 py-2">{progress.autoBuildNote}</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-mist p-3">
              <p className="text-xs text-ink/40">Overall Progress</p>
              <p className="font-display font-bold text-xl">{progress.overallProgress}%</p>
            </div>
            <div className="rounded-lg bg-mist p-3">
              <p className="text-xs text-ink/40">Current Phase</p>
              <p className="font-display font-semibold text-sm mt-1">{progress.currentPhase}</p>
            </div>
            <div className="rounded-lg bg-mist p-3">
              <p className="text-xs text-ink/40">Completed / Pending / Blocked</p>
              <p className="font-display font-semibold text-sm mt-1">{progress.completedTasks} / {progress.pendingTasks} / {progress.blockedTasks}</p>
            </div>
            <div className="rounded-lg bg-mist p-3">
              <p className="text-xs text-ink/40 flex items-center gap-1"><Users className="w-3 h-3" /> Assigned Employees</p>
              <p className="text-xs text-ink/60 mt-1">{[...new Set(progress.employees.map((e) => e.employeeLabel))].join(', ')}</p>
            </div>
          </div>

          <div className="space-y-2">
            {progress.employees.map((e, i) => (
              <div key={i} className="rounded-lg border border-line p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-ink">{e.employeeLabel}</p>
                  <Badge tone={e.status === 'Completed' ? 'success' : 'ferozi'} dot>{e.currentPhase}</Badge>
                </div>
                <p className="text-xs text-ink/50 mt-1">Objective: {e.currentObjective}</p>
                <p className="text-xs text-ink/50">Deliverable: {e.currentDeliverable}</p>
                {e.dependencies.length > 0 && <p className="text-xs text-amber-600 mt-1">Blocked by: {e.dependencies.join(', ')}</p>}
                <div className="mt-2 h-1.5 rounded-full bg-mist overflow-hidden">
                  <div className="h-full rounded-full bg-ferozi" style={{ width: `${e.progress}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'checklist' && (
        <div className="space-y-2">
          {checklist.map((item) => (
            <button
              key={item.name}
              onClick={() => toggleItem(item.name, !item.checked)}
              className="w-full flex items-center gap-2.5 text-left px-3 py-2.5 rounded-lg hover:bg-mist transition-colors"
            >
              {item.checked ? <CheckSquare className="w-4 h-4 text-ferozi-deep shrink-0" /> : <Square className="w-4 h-4 text-ink/30 shrink-0" />}
              <span className={`text-sm ${item.checked ? 'text-ink' : 'text-ink/60'}`}>{item.name}</span>
            </button>
          ))}
          <p className="text-xs text-ink/35 pt-2">Framework checklist only — checking an item doesn't verify anything for real.</p>
        </div>
      )}

      {view === 'report' && report && (
        <div className="space-y-4">
          <p className="text-sm text-ink/70 bg-mist rounded-lg p-3">{report.projectSummary}</p>
          <div>
            <p className="font-mono text-[10px] tracking-wideish uppercase text-ink/40 mb-1">Completed Work</p>
            {report.completedWork.length === 0 && <p className="text-xs text-ink/35">None yet.</p>}
            {report.completedWork.map((w, i) => <p key={i} className="text-xs text-ink/60">{w.phase} — {w.employee}</p>)}
          </div>
          <div>
            <p className="font-mono text-[10px] tracking-wideish uppercase text-ink/40 mb-1">Pending / Blocked</p>
            <p className="text-xs text-ink/60">Pending: {report.pendingWork.join(', ') || 'none'}</p>
            <p className="text-xs text-amber-600">Blocked: {report.blockedWork.join(', ') || 'none'}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={report.deploymentReadiness.ready ? 'success' : 'neutral'} dot>
              {report.deploymentReadiness.ready ? 'Deployment Ready' : 'Not Deployment Ready'}
            </Badge>
          </div>
        </div>
      )}
    </div>
  )
}

function DeploymentPanel({ projectId }) {
  const [status, setStatus] = useState(null)
  const [error, setError] = useState('')
  const [domain, setDomain] = useState('')
  const [attaching, setAttaching] = useState(false)
  const [attachResult, setAttachResult] = useState(null)

  function load() {
    setError('')
    api.deployment.status(projectId).then(setStatus).catch((err) => setError(err.message || 'Failed to load deployment status.'))
  }
  useEffect(load, [projectId])

  async function attachDomain(e) {
    e.preventDefault()
    if (!domain.trim()) return
    setAttaching(true)
    setAttachResult(null)
    try {
      const result = await api.deployment.attachDomain(projectId, domain.trim())
      setAttachResult({ ok: true, ...result })
    } catch (err) {
      setAttachResult({ ok: false, error: err.message })
    } finally {
      setAttaching(false)
    }
  }

  if (error) {
    return (
      <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-center">
        <p className="text-sm text-red-700">{error}</p>
        <button onClick={load} className="mt-2 text-xs font-semibold text-red-700 underline">Try again</button>
      </div>
    )
  }
  if (!status?.hasJob) return null

  return (
    <div className="mt-4 rounded-xl border border-line bg-white p-4">
      <p className="text-xs font-mono uppercase tracking-wideish text-ink/40 mb-2">Deployment Status & Logs</p>
      <Badge tone={status.status === 'Completed' ? 'success' : 'neutral'} dot>{status.status}</Badge>
      <div className="mt-3 space-y-1.5 max-h-32 overflow-y-auto">
        {(status.logs || []).map((l) => (
          <p key={l.id} className="text-xs text-ink/55"><span className="font-semibold text-ink/75">{l.status}</span> — {l.message}</p>
        ))}
      </div>

      {(status.provider === 'vercel' || status.provider === 'netlify') && (
        <form onSubmit={attachDomain} className="mt-4 flex items-center gap-2">
          <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="yourdomain.com" className="flex-1 rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-ferozi" />
          <button type="submit" disabled={attaching} className="px-4 py-2 rounded-full bg-ink text-white text-xs font-semibold hover:bg-ferozi-deep transition-colors shrink-0 disabled:opacity-50">
            {attaching ? 'Attaching...' : 'Attach Domain'}
          </button>
        </form>
      )}
      {attachResult && (
        <p className={`mt-2 text-xs ${attachResult.ok ? 'text-ferozi-deep' : 'text-red-600'}`}>
          {attachResult.ok ? `Domain attached${attachResult.sslNote ? ` — ${attachResult.sslNote}` : ''}` : attachResult.error}
        </p>
      )}
    </div>
  )
}

// Phase 23 — Design Options (Part 17). Real generate-3-concepts or
// import-a-reference flow, shown before code generation. Honest about
// the active Groq model's real limitation: it cannot analyze an
// uploaded image's pixels, so "Import" collects a written description,
// not a claimed visual analysis.
function DesignOptionsPanel({ project, onSelected }) {
  const [mode, setMode] = useState('generate') // 'generate' | 'import'
  const [concepts, setConcepts] = useState(parseJson(project.designConcepts, []))
  const [generating, setGenerating] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [importText, setImportText] = useState('')
  const [error, setError] = useState('')

  async function generate() {
    setGenerating(true); setError('')
    try {
      const { concepts } = await api.websiteAI.generateDesignConcepts(project.id)
      setConcepts(concepts)
    } catch (err) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  async function pick(index) {
    setSelecting(true); setError('')
    try {
      const { project: updated } = await api.websiteAI.selectDesign(project.id, { conceptIndex: index })
      onSelected(updated)
    } catch (err) {
      setError(err.message)
    } finally {
      setSelecting(false)
    }
  }

  async function submitImport(e) {
    e.preventDefault()
    if (!importText.trim()) return
    setSelecting(true); setError('')
    try {
      const { project: updated } = await api.websiteAI.selectDesign(project.id, { importedDescription: importText.trim() })
      onSelected(updated)
    } catch (err) {
      setError(err.message)
    } finally {
      setSelecting(false)
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-white shadow-card p-8 space-y-5">
      <div>
        <p className="font-display font-semibold text-lg mb-1">Design Direction</p>
        <p className="text-sm text-ink/50">Choose a design concept, or import a reference — this shapes the actual generated code, not just this plan.</p>
      </div>

      <div className="flex items-center gap-1 p-1 rounded-lg bg-mist border border-line w-fit">
        <button onClick={() => setMode('generate')} className={`px-4 py-2 rounded-md text-sm font-semibold ${mode === 'generate' ? 'bg-white shadow-sm' : 'text-ink/45'}`}>Generate Designs</button>
        <button onClick={() => setMode('import')} className={`px-4 py-2 rounded-md text-sm font-semibold ${mode === 'import' ? 'bg-white shadow-sm' : 'text-ink/45'}`}>Import Design</button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {mode === 'generate' ? (
        concepts.length === 0 ? (
          <button onClick={generate} disabled={generating} className="px-6 py-3 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors disabled:opacity-50">
            {generating ? 'Generating concepts...' : 'Generate 3 Design Concepts'}
          </button>
        ) : (
          <div className="grid sm:grid-cols-3 gap-4">
            {concepts.map((c, i) => (
              <div key={i} className="rounded-xl border border-line p-4 flex flex-col">
                <p className="font-semibold text-sm mb-1">{c.name}</p>
                <p className="text-xs text-ferozi-deep font-semibold mb-2">{c.style}</p>
                <p className="text-xs text-ink/45 mb-1"><span className="font-semibold">Colors:</span> {c.colors}</p>
                <p className="text-xs text-ink/45 mb-2"><span className="font-semibold">Type:</span> {c.typography}</p>
                <p className="text-xs text-ink/50 flex-1">{c.description}</p>
                <button onClick={() => pick(i)} disabled={selecting} className="mt-3 px-4 py-2 rounded-full bg-ink text-white text-xs font-semibold hover:bg-ferozi-deep transition-colors disabled:opacity-50">Select This</button>
              </div>
            ))}
          </div>
        )
      ) : (
        <form onSubmit={submitImport} className="space-y-3">
          <div className="rounded-lg bg-mist p-3">
            <p className="text-xs text-ink/50">The active AI model can't visually analyze an uploaded image's pixels — describe what you want the reference to guide (colors, layout, mood, typography) and Website AI will use that description as real design grounding.</p>
          </div>
          <input type="file" accept="image/*" className="w-full text-xs text-ink/50" />
          <textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={4} placeholder="e.g. Dark navy background, bold serif headings, lots of whitespace, minimal and premium feeling like an Apple product page..." className="w-full rounded-lg border border-line px-4 py-3 text-sm outline-none focus:border-ferozi" />
          <button type="submit" disabled={selecting || !importText.trim()} className="px-6 py-3 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors disabled:opacity-50">
            {selecting ? 'Saving...' : 'Use This Description'}
          </button>
        </form>
      )}
    </div>
  )
}

function BuildPanel({ project, onChanged }) {
  const [codeStack, setCodeStack] = useState('HTML, CSS & JavaScript')
  const [mode, setMode] = useState('free')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [current, setCurrent] = useState(project)
  const [view, setView] = useState('setup') // setup | choice | preview | publish-confirm | published
  const [previewData, setPreviewData] = useState(null)
  const [providers, setProviders] = useState([])
  const [provider, setProvider] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [deployResult, setDeployResult] = useState(null)

  useEffect(() => {
    setCurrent(project)
    setView(project.generatedFiles && project.generatedFiles !== '[]' ? 'choice' : (project.selectedDesignConcept ? 'setup' : 'design'))
  }, [project.id])

  useEffect(() => {
    api.websiteAI.planTiers().then(({ providers }) => { setProviders(providers); if (providers[0]) setProvider(providers[0].key) })
      .catch((err) => setError(err.message || 'Failed to load deployment providers.'))
  }, [])

  const files = parseJson(current.generatedFiles, [])
  const usageLog = parseJson(current.apiUsageLog, [])
  const totalTokens = usageLog.reduce((sum, u) => sum + (u.inputTokens || 0) + (u.outputTokens || 0), 0)

  async function generate() {
    setGenerating(true)
    setError('')
    try {
      const { project: updated } = await api.websiteAI.generateCode(project.id, codeStack, mode)
      setCurrent(updated)
      setView('choice')
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  function download() {
    const a = document.createElement('a')
    a.href = api.websiteAI.downloadUrl(project.id)
    a.click()
  }

  async function openPreview() {
    try {
      const data = await api.websiteAI.preview(project.id)
      setPreviewData(data)
      setView('preview')
    } catch (err) {
      setError(err.message)
    }
  }

  async function startPublish() {
    try {
      await api.websiteAI.requestPublish(project.id)
      setView('publish-confirm')
    } catch (err) {
      setError(err.message)
    }
  }

  async function confirmPublish(confirm) {
    setPublishing(true)
    setError('')
    try {
      const res = await api.websiteAI.confirmPublish(project.id, confirm, confirm ? provider : undefined)
      setCurrent(res.project)
      setDeployResult(confirm ? { url: res.deployedUrl, error: res.deployError } : null)
      setView(confirm ? 'published' : 'choice')
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge tone="warning">Paid (AI mode) / Free (Local mode)</Badge>
        {totalTokens > 0 && <Badge tone="neutral">{totalTokens.toLocaleString()} tokens used so far</Badge>}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {view === 'design' && (
        <div>
          <DesignOptionsPanel
            project={current}
            onSelected={(updated) => { setCurrent(updated); setView('setup'); onChanged() }}
          />
          <button onClick={() => setView('setup')} className="mt-3 text-xs text-ink/35 hover:underline">Skip — use the plan's own design defaults</button>
        </div>
      )}

      {view === 'setup' && (
        <div className="space-y-4">
          <div>
            <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Code Stack</label>
            <select value={codeStack} onChange={(e) => setCodeStack(e.target.value)} className="mt-2 w-full rounded-lg border border-line px-4 py-2.5 text-sm outline-none bg-white">
              {CODE_STACKS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Generation Mode</label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                onClick={() => setMode('free')}
                className={`rounded-lg border p-3 text-left transition-colors ${mode === 'free' ? 'border-ferozi bg-ferozi-soft' : 'border-line'}`}
              >
                <p className="text-sm font-semibold">Local (Free)</p>
                <p className="text-xs text-ink/50 mt-0.5">Deterministic boilerplate from the existing plan. No AI call, no cost.</p>
              </button>
              <button
                onClick={() => setMode('ai')}
                className={`rounded-lg border p-3 text-left transition-colors ${mode === 'ai' ? 'border-ferozi bg-ferozi-soft' : 'border-line'}`}
              >
                <p className="text-sm font-semibold">AI Generation (Paid)</p>
                <p className="text-xs text-ink/50 mt-0.5">One real, tailored LLM call — reuses the existing plan, tracked by real token usage.</p>
              </button>
            </div>
          </div>
          <button
            onClick={generate}
            disabled={generating}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors disabled:opacity-50"
          >
            <Code2 className="w-4 h-4" /> {generating ? 'Generating...' : 'Generate Code'}
          </button>
        </div>
      )}

      {view === 'choice' && (
        <div className="space-y-3">
          <div className="rounded-xl bg-mist p-4 text-center">
            <p className="text-sm font-semibold text-ink">Your website is complete.</p>
            <p className="text-xs text-ink/50 mt-1">{files.length} files generated ({current.codeStack}, {current.codeGenMode === 'ai' ? 'AI' : 'Local (Free)'} mode). What would you like to do?</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={download} className="flex flex-col items-center gap-1.5 rounded-lg border border-line p-3 hover:border-ferozi transition-colors">
              <Download className="w-4 h-4 text-ink/60" /> <span className="text-xs font-semibold">Download ZIP</span>
              <Badge tone="neutral">Free</Badge>
            </button>
            <button onClick={openPreview} className="flex flex-col items-center gap-1.5 rounded-lg border border-line p-3 hover:border-ferozi transition-colors">
              <Eye className="w-4 h-4 text-ink/60" /> <span className="text-xs font-semibold">View Preview</span>
              <Badge tone="neutral">Free</Badge>
            </button>
            <button onClick={startPublish} className="flex flex-col items-center gap-1.5 rounded-lg border border-line p-3 hover:border-ferozi transition-colors">
              <Rocket className="w-4 h-4 text-ink/60" /> <span className="text-xs font-semibold">Publish Website</span>
              <Badge tone="warning">Premium</Badge>
            </button>
          </div>
          <button onClick={() => setView('setup')} className="text-xs text-ink/40 hover:text-ink/60">Regenerate with different settings</button>
        </div>
      )}

      {view === 'preview' && previewData && (
        <div>
          <button onClick={() => setView('choice')} className="text-xs text-ferozi-deep hover:underline mb-3">← Back</button>
          {previewData.previewableHtml ? (
            <iframe title="Website preview" srcDoc={previewData.previewableHtml} className="w-full h-80 rounded-lg border border-line bg-white" />
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {previewData.files.map((f) => (
                <div key={f.path} className="rounded-lg bg-mist p-3">
                  <p className="font-mono text-xs font-semibold text-ink/70">{f.path}</p>
                  <pre className="text-[10px] text-ink/50 mt-1 overflow-x-auto whitespace-pre-wrap">{f.content.slice(0, 400)}{f.content.length > 400 ? '...' : ''}</pre>
                </div>
              ))}
              <p className="text-xs text-ink/35">React/Next.js output is shown as source — this framework doesn't bundle a live preview for compiled stacks.</p>
            </div>
          )}
        </div>
      )}

      {view === 'publish-confirm' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-center space-y-4">
          <p className="text-sm font-semibold text-ink">Are you sure you want to publish this website?</p>
          <div>
            <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Deployment Provider</label>
            <select value={provider} onChange={(e) => setProvider(e.target.value)} className="mt-2 w-full rounded-lg border border-line px-4 py-2.5 text-sm outline-none bg-white">
              {providers.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
            </select>
          </div>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => confirmPublish(true)}
              disabled={publishing}
              className="px-6 py-2.5 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors disabled:opacity-50"
            >
              YES
            </button>
            <button
              onClick={() => confirmPublish(false)}
              disabled={publishing}
              className="px-6 py-2.5 rounded-full border border-line text-sm font-semibold text-ink/60 hover:border-ferozi disabled:opacity-50"
            >
              NO
            </button>
          </div>
          <p className="text-xs text-amber-700">Deployment still remains framework only — this creates an Automation Engine job describing intent, nothing is actually deployed.</p>
        </div>
      )}

      {view === 'published' && (
        <div className="rounded-xl bg-ferozi-soft p-5 text-center">
          {deployResult?.url ? (
            <>
              <p className="text-sm font-semibold text-ink">Deployed live via {providers.find((p) => p.key === current.deploymentProvider)?.name}.</p>
              <a href={deployResult.url} target="_blank" rel="noreferrer" className="text-xs text-ferozi-deep hover:underline mt-1 inline-block break-all">{deployResult.url}</a>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-ink">Sent to the Automation Engine via {providers.find((p) => p.key === current.deploymentProvider)?.name}.</p>
              <p className="text-xs text-ink/50 mt-1">{deployResult?.error || 'Framework only — no real deployment happened. Manage the job in the Automation Engine.'}</p>
            </>
          )}
        </div>
      )}
      {view === 'published' && <DeploymentPanel projectId={project.id} />}
    </div>
  )
}

function PlanDetailModal({ projectId, onClose, onChanged }) {
  const [project, setProject] = useState(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('plan')

  function load() {
    if (!projectId) return
    setError('')
    api.websiteAI.get(projectId).then(({ project }) => setProject(project))
      .catch((err) => setError(err.message || 'Failed to load this plan.'))
  }

  useEffect(() => { load(); setTab('plan') }, [projectId])

  if (!projectId) return null

  async function setStatus(status) {
    try {
      await api.websiteAI.updateStatus(projectId, status)
      load()
      onChanged()
    } catch (err) {
      setError(err.message)
    }
  }

  async function sendToAutomation() {
    setSending(true)
    try {
      await api.websiteAI.sendToAutomation(projectId)
      load()
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  if (!project) {
    return (
      <Modal open={!!projectId} onClose={onClose} title={error ? 'Error' : 'Loading...'}>
        {error ? (
          <div className="text-center py-8">
            <p className="text-sm text-red-600 mb-3">{error}</p>
            <button onClick={load} className="px-5 py-2 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors">Try again</button>
          </div>
        ) : (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-ink/30" /></div>
        )}
      </Modal>
    )
  }

  const pages = parseJson(project.pages, [])
  const sections = parseJson(project.sections, [])
  const components = parseJson(project.components, [])
  const design = parseJson(project.designPlan, {})
  const assets = parseJson(project.assetPlan, [])

  return (
    <Modal open={!!projectId} onClose={onClose} title={`${project.websiteType} Plan`}>
      <div className="flex items-center gap-1 p-1 rounded-lg bg-mist border border-line mb-4 w-fit">
        <button onClick={() => setTab('plan')} className={`px-3 py-1.5 rounded-md text-xs font-semibold ${tab === 'plan' ? 'bg-white shadow-sm text-ink' : 'text-ink/45'}`}>Plan (8 Modules)</button>
        <button onClick={() => setTab('execution')} className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1 ${tab === 'execution' ? 'bg-white shadow-sm text-ink' : 'text-ink/45'}`}>
          <FileText className="w-3 h-3" /> Execution
        </button>
        <button onClick={() => setTab('build')} className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1 ${tab === 'build' ? 'bg-white shadow-sm text-ink' : 'text-ink/45'}`}>
          <Code2 className="w-3 h-3" /> Build
        </button>
      </div>

      <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge tone={STATUS_TONE[project.status]} dot>{project.status}</Badge>
          {project.clientLabel && <Badge tone="neutral">{project.clientLabel}</Badge>}
          {project.employeeLabel && <Badge tone="neutral">{project.employeeLabel}</Badge>}
        </div>

        {tab === 'plan' ? (
          <>
            <section>
              <h4 className="font-mono text-[10px] tracking-wideish uppercase text-ink/40 mb-2">1. Requirements Analyzer</h4>
              <p className="text-sm text-ink/70 bg-mist rounded-lg p-3">{project.requirementsAnalysis || '—'}</p>
            </section>

            <section>
              <h4 className="font-mono text-[10px] tracking-wideish uppercase text-ink/40 mb-2">2. Page Planner</h4>
              <div className="bg-mist rounded-lg p-3 space-y-1">
                {pages.length === 0 && <p className="text-sm text-ink/35">No pages planned yet.</p>}
                {pages.map((p, i) => <p key={i} className="text-sm text-ink/70"><span className="font-semibold">{p.name}</span> — {p.purpose}</p>)}
              </div>
            </section>

            <section>
              <h4 className="font-mono text-[10px] tracking-wideish uppercase text-ink/40 mb-2">3. Section Planner</h4>
              <div className="flex flex-wrap gap-1.5">
                {sections.map((s, i) => <Badge key={i} tone="neutral">{s.name}</Badge>)}
                {sections.length === 0 && <p className="text-sm text-ink/35">No sections planned yet.</p>}
              </div>
            </section>

            <section>
              <h4 className="font-mono text-[10px] tracking-wideish uppercase text-ink/40 mb-2">4. Component Planner</h4>
              <div className="flex flex-wrap gap-1.5">
                {components.map((c, i) => <Badge key={i} tone="ferozi">{c.name}</Badge>)}
                {components.length === 0 && <p className="text-sm text-ink/35">No components planned yet.</p>}
              </div>
            </section>

            <section>
              <h4 className="font-mono text-[10px] tracking-wideish uppercase text-ink/40 mb-2">5. Design Planner</h4>
              <div className="bg-mist rounded-lg p-3 text-sm space-y-1 text-ink/70">
                {Object.entries(design).map(([k, v]) => <p key={k}><span className="font-semibold capitalize">{k}:</span> {v}</p>)}
                {Object.keys(design).length === 0 && <p className="text-ink/35">No design plan yet.</p>}
              </div>
            </section>

            <section>
              <h4 className="font-mono text-[10px] tracking-wideish uppercase text-ink/40 mb-2">6. Responsive Planner</h4>
              <p className="text-sm text-ink/70 bg-mist rounded-lg p-3">{project.responsivePlan || '—'}</p>
            </section>

            <section>
              <h4 className="font-mono text-[10px] tracking-wideish uppercase text-ink/40 mb-2">7. Asset Manager (linked only)</h4>
              <div className="bg-mist rounded-lg p-3 space-y-1">
                {assets.length === 0 && <p className="text-sm text-ink/35">No assets linked yet.</p>}
                {assets.map((a, i) => <p key={i} className="text-sm text-ink/70">{a.label} <span className="text-ink/40">({a.type})</span></p>)}
              </div>
            </section>

            <section>
              <h4 className="font-mono text-[10px] tracking-wideish uppercase text-ink/40 mb-2">8. Deployment Planner</h4>
              <p className="text-xs text-ink/40 mb-1">Project Structure:</p>
              <p className="text-sm text-ink/70 bg-mist rounded-lg p-3 mb-2">{project.projectStructure || '—'}</p>
              <p className="text-xs text-ink/40 mb-1">Deployment Plan:</p>
              <p className="text-sm text-ink/70 bg-mist rounded-lg p-3">{project.deploymentPlan || '—'}</p>
            </section>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div>
              <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Website Status</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    disabled={s === project.status}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors disabled:opacity-40 ${
                      s === project.status ? 'border-ink bg-ink text-white' : 'border-line text-ink/60 hover:border-ferozi'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={sendToAutomation}
              disabled={sending || !!project.automationJobId}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors disabled:opacity-50"
            >
              <Send className="w-4 h-4" /> {project.automationJobId ? 'Already sent to Automation Engine' : sending ? 'Sending...' : 'Send to Automation Engine'}
            </button>
          </>
        ) : tab === 'execution' ? (
          <ExecutionPanel project={project} onChanged={load} />
        ) : (
          <BuildPanel project={project} onChanged={load} />
        )}

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
          <ShieldOff className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">Framework only — no code was generated and nothing will be deployed.</p>
        </div>
      </div>
    </Modal>
  )
}

export default function WebsiteAI() {
  const [projects, setProjects] = useState([])
  const [dashboard, setDashboard] = useState(null)
  const [ceoDash, setCeoDash] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newOpen, setNewOpen] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [view, setView] = useState('owner')

  function load() {
    setLoading(true)
    Promise.all([api.websiteAI.list(), api.websiteAI.dashboard(), api.websiteAI.ceoDashboard()])
      .then(([p, d, c]) => { setProjects(p.projects); setDashboard(d); setCeoDash(c) })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  return (
    <div>
      <PageHeader
        eyebrow="Website AI"
        title="The Website Department's execution manager."
        description="Owner → CEO → Website Director → Website AI → Website Employees → Workflow Engine → Automation Engine. Manages execution only — no code, no deployment."
        actions={
          <button
            onClick={() => setNewOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors"
          >
            <Plus className="w-4 h-4" /> New Plan
          </button>
        }
      />

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="flex items-center gap-1 p-1 rounded-lg bg-mist border border-line mb-6 w-fit">
        <button onClick={() => setView('owner')} className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${view === 'owner' ? 'bg-white shadow-sm text-ink' : 'text-ink/45 hover:text-ink/70'}`}>Owner View</button>
        <button onClick={() => setView('ceo')} className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${view === 'ceo' ? 'bg-white shadow-sm text-ink' : 'text-ink/45 hover:text-ink/70'}`}>CEO View</button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-ink/40 py-16 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading Website AI...
        </div>
      ) : (
        <>
          {view === 'owner' && dashboard && (
            <div className="mb-8">
              <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-5 mb-5">
                <StatCard label="Total Plans" value={dashboard.total} icon={Globe} />
                {STATUSES.slice(0, 4).map((s, i) => (
                  <StatCard key={s} label={s} value={dashboard.byStatus[s]} delay={0.05 * (i + 1)} />
                ))}
              </div>
              {dashboard.currentProgress && (
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
                  <StatCard label="Website Progress" value={`${dashboard.currentProgress.overallProgress}%`} />
                  <StatCard label="Current Phase" value={dashboard.currentProgress.currentPhase} delay={0.05} />
                  <StatCard label="Completed / Pending" value={`${dashboard.currentProgress.completedTasks} / ${dashboard.currentProgress.pendingTasks}`} delay={0.1} />
                  <StatCard label="Quality Status" value={dashboard.currentProgress.qualityStatus} delay={0.15} />
                </div>
              )}
            </div>
          )}

          {view === 'ceo' && ceoDash && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
              <StatCard label="Department Status" value={ceoDash.departmentStatus} />
              <StatCard label="Project Health" value={ceoDash.projectHealth} delay={0.05} />
              <StatCard label="Completion %" value={`${ceoDash.completionPercentage}%`} delay={0.1} />
              <StatCard label="Active Projects" value={ceoDash.activeProjects} delay={0.15} />
            </div>
          )}

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects.length === 0 && (
              <p className="text-sm text-ink/35 py-10 text-center rounded-2xl border border-dashed border-line sm:col-span-2 lg:col-span-3">
                No website plans yet. Create one to see Website AI in action.
              </p>
            )}
            {projects.map((p, i) => (
              <Reveal key={p.id} delay={0.03 * i}>
                <button
                  onClick={() => setSelectedId(p.id)}
                  className="w-full text-left rounded-2xl border border-line bg-white p-5 shadow-card hover:shadow-card-hover transition-shadow"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="w-9 h-9 rounded-lg bg-ferozi-soft flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-ferozi-deep" />
                    </span>
                    <Badge tone={STATUS_TONE[p.status]} dot>{p.status}</Badge>
                  </div>
                  <p className="font-display font-semibold text-sm">{p.websiteType}</p>
                  <p className="text-xs text-ink/45 mt-1 truncate">{p.requirementsText || 'No requirements noted'}</p>
                  {p.clientLabel && <p className="text-xs text-ink/35 mt-1">Client: {p.clientLabel}</p>}
                </button>
              </Reveal>
            ))}
          </div>
        </>
      )}

      <NewPlanModal open={newOpen} onClose={() => setNewOpen(false)} onCreated={() => load()} />
      <PlanDetailModal projectId={selectedId} onClose={() => setSelectedId(null)} onChanged={() => load()} />
    </div>
  )
}
