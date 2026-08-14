import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Loader2, Plus, CheckCircle2, XCircle, Send, Link2, MessageSquare, History } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import QuickAddForm from '../../components/ui/QuickAddForm'
import { api } from '../../lib/api'
import { DIRECT_STATUSES, PRIORITIES, PRIORITY_TONE } from '../../lib/workflowEngineConstants'

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function WorkflowDetail() {
  const { id } = useParams()
  const [workflow, setWorkflow] = useState(null)
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [stageModalOpen, setStageModalOpen] = useState(false)
  const [depModal, setDepModal] = useState(null) // stageId to add a dependency FOR
  const [note, setNote] = useState('')
  const [tab, setTab] = useState('stages')

  function load() {
    setLoading(true)
    Promise.all([api.workflows.get(id), api.getEmployeeRoster()])
      .then(([w, e]) => { setWorkflow(w.workflow); setEmployees(e.employees) })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [id])

  async function addStage(values) {
    try {
      await api.workflows.addStage(id, {
        title: values.title,
        assigneeEmployeeId: values.assignee || undefined,
        priority: values.priority,
        dueDate: values.dueDate || undefined
      })
      setStageModalOpen(false)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function setStageStatus(stage, status) {
    try {
      await api.workflows.updateStage(stage.id, { status })
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function submitForReview(stageId) {
    try {
      await api.workflowApprovals.submit(stageId)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function approve(approvalId) {
    try {
      await api.workflowApprovals.approve(approvalId, '')
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function reject(approvalId) {
    try {
      await api.workflowApprovals.reject(approvalId, 'Please revise and resubmit.')
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function addDependency(values) {
    try {
      await api.workflows.addDependency(values.blockingStageId, depModal)
      setDepModal(null)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function postActivity(e) {
    e.preventDefault()
    if (!note.trim()) return
    try {
      await api.workflows.addActivity(id, note.trim())
      setNote('')
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-ink/40 py-16 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading workflow...
      </div>
    )
  }

  if (!workflow) {
    return (
      <div>
        <Link to="/workflow-engine" className="inline-flex items-center gap-1.5 text-sm text-ferozi-deep mb-4 hover:underline">
          <ArrowLeft className="w-4 h-4" /> Back to Workflow Engine
        </Link>
        <p className="text-sm text-red-600">{error || 'Workflow not found.'}</p>
      </div>
    )
  }

  const deptEmployees = employees.filter((e) => e.department?.key === workflow.departmentKey)
  const otherStages = (stageId) => workflow.stages.filter((s) => s.id !== stageId)

  return (
    <div>
      <Link to="/workflow-engine" className="inline-flex items-center gap-1.5 text-sm text-ferozi-deep mb-4 hover:underline">
        <ArrowLeft className="w-4 h-4" /> Back to Workflow Engine
      </Link>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <PageHeader
        eyebrow={workflow.departmentKey}
        title={workflow.title}
        description={workflow.description || 'No description provided.'}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={PRIORITY_TONE[workflow.priority]}>{workflow.priority}</Badge>
            <Badge tone="ferozi" dot>{workflow.status}</Badge>
          </div>
        }
      />

      <div className="flex items-center gap-1 p-1 rounded-lg bg-mist border border-line mb-6 w-fit">
        {['stages', 'history', 'activity'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-md text-sm font-semibold capitalize transition-colors ${
              tab === t ? 'bg-white shadow-sm text-ink' : 'text-ink/45 hover:text-ink/70'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'stages' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-lg">Stages</h3>
            <button
              onClick={() => setStageModalOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors"
            >
              <Plus className="w-4 h-4" /> Break into Stage
            </button>
          </div>

          <div className="space-y-3">
            {workflow.stages.length === 0 && (
              <p className="text-sm text-ink/35 py-6 text-center rounded-2xl border border-dashed border-line">
                No stages yet — break this task down for a Director or Employee.
              </p>
            )}
            {workflow.stages.map((stage) => {
              const pendingApproval = stage.approvals?.find((a) => a.status === 'Pending')
              const unmetDeps = (stage.blockedBy || []).filter((d) => d.blockingStage?.status !== 'Completed')
              return (
                <div key={stage.id} className="rounded-2xl border border-line bg-white shadow-card p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-ink">{stage.title}</p>
                        <Badge tone={PRIORITY_TONE[stage.priority]}>{stage.priority}</Badge>
                      </div>
                      <p className="text-xs text-ink/45 mt-1">
                        {stage.assigneeLabel || 'Unassigned'} · {stage.dueDate ? new Date(stage.dueDate).toLocaleDateString() : 'No due date'}
                      </p>
                      {unmetDeps.length > 0 && (
                        <p className="text-xs text-amber-600 mt-1.5">
                          Blocked by: {unmetDeps.map((d) => d.blockingStage?.title).join(', ')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        value={DIRECT_STATUSES.includes(stage.status) ? stage.status : stage.status}
                        onChange={(e) => setStageStatus(stage, e.target.value)}
                        className="font-mono text-[10px] uppercase tracking-wideish border border-line rounded-lg px-2 py-1.5 outline-none bg-white"
                      >
                        {DIRECT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                        {!DIRECT_STATUSES.includes(stage.status) && <option value={stage.status}>{stage.status}</option>}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mt-3 flex-wrap">
                    {stage.status === 'Working' && (
                      <button
                        onClick={() => submitForReview(stage.id)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-ferozi-deep hover:underline"
                      >
                        <Send className="w-3.5 h-3.5" /> Submit for Review
                      </button>
                    )}
                    {pendingApproval && (
                      <>
                        <button onClick={() => approve(pendingApproval.id)} className="flex items-center gap-1.5 text-xs font-semibold text-green-600 hover:underline">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                        </button>
                        <button onClick={() => reject(pendingApproval.id)} className="flex items-center gap-1.5 text-xs font-semibold text-red-500 hover:underline">
                          <XCircle className="w-3.5 h-3.5" /> Reject
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => setDepModal(stage.id)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-ink/40 hover:text-ink"
                    >
                      <Link2 className="w-3.5 h-3.5" /> Add Dependency
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="rounded-2xl border border-line bg-white shadow-card p-6">
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {workflow.history.length === 0 && <p className="text-sm text-ink/35">No history yet.</p>}
            {workflow.history.map((h) => (
              <div key={h.id} className="flex items-start gap-3 text-sm">
                <History className="w-4 h-4 text-ink/25 mt-0.5 shrink-0" />
                <div>
                  <p className="text-ink/80">
                    <span className="font-semibold">{h.actorLabel}</span> — {h.action}
                    {h.fromStatus && h.toStatus && <span className="text-ink/40"> ({h.fromStatus} → {h.toStatus})</span>}
                  </p>
                  <p className="text-xs text-ink/35">{timeAgo(h.createdAt)}{h.reason ? ` · ${h.reason}` : ''}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'activity' && (
        <div className="rounded-2xl border border-line bg-white shadow-card p-6">
          <form onSubmit={postActivity} className="flex items-center gap-3 mb-5">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note..."
              className="flex-1 rounded-full border border-line px-4 py-2.5 text-sm outline-none focus:border-ferozi focus:ring-2 focus:ring-ferozi/20 transition-all"
            />
            <button type="submit" className="w-10 h-10 rounded-full bg-ink text-white flex items-center justify-center hover:bg-ferozi-deep transition-colors shrink-0">
              <MessageSquare className="w-4 h-4" />
            </button>
          </form>
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {workflow.activities.length === 0 && <p className="text-sm text-ink/35">No activity yet.</p>}
            {workflow.activities.map((a) => (
              <div key={a.id} className="text-sm">
                <p className="text-ink/80"><span className="font-semibold">{a.actorLabel}</span>: {a.message}</p>
                <p className="text-xs text-ink/35">{timeAgo(a.createdAt)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal open={stageModalOpen} onClose={() => setStageModalOpen(false)} title="Break into Stage">
        <QuickAddForm
          submitLabel="Add Stage"
          onSubmit={addStage}
          fields={[
            { key: 'title', label: 'Stage title', placeholder: 'e.g. Design the landing page' },
            { key: 'assignee', label: 'Assign to', type: 'select', options: [{ value: '', label: '— Unassigned —' }, ...deptEmployees.map((e) => ({ value: e.id, label: e.name }))], required: false },
            { key: 'priority', label: 'Priority', type: 'select', options: PRIORITIES },
            { key: 'dueDate', label: 'Due date', type: 'date', required: false }
          ]}
        />
        {deptEmployees.length > 0 && (
          <p className="mt-3 text-xs text-ink/35">
            Employees in this department: {deptEmployees.map((e) => e.name).join(', ')}
          </p>
        )}
      </Modal>

      <Modal open={!!depModal} onClose={() => setDepModal(null)} title="Add Dependency">
        <QuickAddForm
          submitLabel="Add Dependency"
          onSubmit={addDependency}
          fields={[
            {
              key: 'blockingStageId', label: 'Cannot start until this stage is Completed:', type: 'select',
              options: depModal ? otherStages(depModal).map((s) => ({ value: s.id, label: s.title })) : []
            }
          ]}
        />
        {depModal && otherStages(depModal).length === 0 && (
          <p className="mt-3 text-xs text-amber-600">No other stages exist yet to depend on.</p>
        )}
      </Modal>
    </div>
  )
}
