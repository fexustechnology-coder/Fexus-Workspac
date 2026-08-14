import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Loader2, Clock, Send, ExternalLink } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Badge from '../../components/ui/Badge'
import FexusRobot from '../../components/ui/FexusRobot'
import { api } from '../../lib/api'
import { robotVariantForStatus } from '../../lib/robotAnimation'
import { DIRECT_STATUSES, GROUP_ORDER, groupForStatus } from '../../lib/workflowEngineConstants'

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function EmployeeDetail() {
  const { id } = useParams()
  const [employee, setEmployee] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  function load() {
    setLoading(true)
    api.getEmployeeDetail(id)
      .then(setEmployee)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [id])

  async function setStatus(stage, status) {
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

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-ink/40 py-16 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading employee...
      </div>
    )
  }

  if (error || !employee) {
    return (
      <div>
        <Link to="/employees" className="inline-flex items-center gap-1.5 text-sm text-ferozi-deep mb-4 hover:underline">
          <ArrowLeft className="w-4 h-4" /> Back to Employee Office
        </Link>
        <p className="text-sm text-red-600">{error || 'Employee not found.'}</p>
      </div>
    )
  }

  const variant = robotVariantForStatus(employee.currentTask?.status)
  const tasksByGroup = GROUP_ORDER.reduce((acc, g) => ({ ...acc, [g]: employee.tasks.filter((t) => groupForStatus(t.status) === g) }), {})

  return (
    <div>
      <Link to="/employees" className="inline-flex items-center gap-1.5 text-sm text-ferozi-deep mb-4 hover:underline">
        <ArrowLeft className="w-4 h-4" /> Back to Employee Office
      </Link>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="flex items-start gap-5 mb-6">
        <FexusRobot variant={variant} size={80} />
        <div className="flex-1">
          <PageHeader
            eyebrow={employee.department?.name || 'Unassigned'}
            title={employee.name}
            description={`Current Objective: ${employee.responsibility}`}
            actions={<Badge tone={employee.currentTask ? 'ferozi' : 'neutral'} dot>{employee.currentTask ? 'Working' : 'Idle'}</Badge>}
          />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <div className="rounded-2xl border border-line bg-white shadow-card p-5">
          <p className="font-mono text-[10px] tracking-wideish uppercase text-ink/40">Department</p>
          <p className="mt-1.5 font-display font-semibold">{employee.department?.name || '—'}</p>
        </div>
        <div className="rounded-2xl border border-line bg-white shadow-card p-5">
          <p className="font-mono text-[10px] tracking-wideish uppercase text-ink/40">Director</p>
          <p className="mt-1.5 font-display font-semibold">{employee.director || '—'}</p>
        </div>
        <div className="rounded-2xl border border-line bg-white shadow-card p-5">
          <p className="font-mono text-[10px] tracking-wideish uppercase text-ink/40">Current Task</p>
          <p className="mt-1.5 font-display font-semibold truncate">{employee.currentTask?.title || 'None'}</p>
          {employee.currentTask && <Badge tone="ferozi" className="mt-2">{employee.currentTask.status}</Badge>}
        </div>
        <div className="rounded-2xl border border-line bg-white shadow-card p-5">
          <p className="font-mono text-[10px] tracking-wideish uppercase text-ink/40">Last Activity</p>
          <p className="mt-1.5 font-display font-semibold flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-ink/30" /> {timeAgo(employee.lastActivity)}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-semibold text-lg">Task Queue</h3>
        <p className="text-xs text-ink/40">
          New assignments are created from the{' '}
          <Link to="/workflow-engine" className="text-ferozi-deep hover:underline inline-flex items-center gap-1">
            Workflow Engine <ExternalLink className="w-3 h-3" />
          </Link>
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {GROUP_ORDER.map((group) => (
          <div key={group} className="rounded-2xl border border-line bg-mist/60 p-4 min-h-[200px]">
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="font-mono text-[10px] tracking-wideish uppercase text-ink/45">{group}</span>
              <span className="text-xs font-semibold text-ink/40">{tasksByGroup[group].length}</span>
            </div>
            <div className="space-y-2.5">
              {tasksByGroup[group].map((t) => (
                <div key={t.id} className="rounded-xl bg-white border border-line p-3">
                  <select
                    value={t.status}
                    onChange={(e) => setStatus(t, e.target.value)}
                    className="font-mono text-[9px] uppercase tracking-wideish bg-transparent outline-none text-ink/40"
                  >
                    {DIRECT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    {!DIRECT_STATUSES.includes(t.status) && <option value={t.status}>{t.status}</option>}
                  </select>
                  <p className="text-sm text-ink/80 mt-1">{t.title}</p>
                  {t.status === 'Working' && (
                    <button
                      onClick={() => submitForReview(t.id)}
                      className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-ferozi-deep hover:underline"
                    >
                      <Send className="w-3 h-3" /> Submit for Review
                    </button>
                  )}
                </div>
              ))}
              {tasksByGroup[group].length === 0 && <p className="text-xs text-ink/30 px-1">Empty</p>}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-6 text-xs text-ink/35">
        Moving a task between columns is a manual action — nothing is executed automatically. This employee has no chat
        interface and cannot approve or complete their own work — see the Director in the Workflow Engine for that.
      </p>
    </div>
  )
}
