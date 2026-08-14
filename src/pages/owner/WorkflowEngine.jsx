import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Plus, Workflow as WorkflowIcon, Bell, AlertTriangle, Flame } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Badge from '../../components/ui/Badge'
import Reveal from '../../components/ui/Reveal'
import StatCard from '../../components/ui/StatCard'
import Modal from '../../components/ui/Modal'
import QuickAddForm from '../../components/ui/QuickAddForm'
import { api } from '../../lib/api'
import { DEPARTMENTS } from '../../lib/departments'
import { GROUP_ORDER, PRIORITY_TONE, PRIORITIES } from '../../lib/workflowEngineConstants'

export default function WorkflowEngine() {
  const [workflows, setWorkflows] = useState([])
  const [dashboard, setDashboard] = useState(null)
  const [notifCount, setNotifCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)

  function load() {
    setLoading(true)
    Promise.all([api.workflows.list(), api.workflows.ceoDashboard(), api.workflowNotifications.list(true)])
      .then(([w, d, n]) => { setWorkflows(w.workflows); setDashboard(d); setNotifCount(n.notifications.length) })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function createWorkflow(values) {
    try {
      await api.workflows.create({
        title: values.title,
        departmentKey: values.departmentKey,
        priority: values.priority,
        description: values.description,
        dueDate: values.dueDate || undefined
      })
      setOpen(false)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  const grouped = GROUP_ORDER.reduce((acc, g) => ({ ...acc, [g]: workflows.filter((w) => w.group === g) }), {})

  return (
    <div>
      <PageHeader
        eyebrow="Workflow Engine"
        title="Company Workflow."
        description="Owner → CEO → Director → Employees → Director → CEO → Owner. Every task moves through here manually — nothing executes automatically."
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={notifCount > 0 ? 'ferozi' : 'neutral'} dot>
              <Bell className="w-3 h-3 mr-1 inline" />{notifCount} unread
            </Badge>
            <button
              onClick={() => setOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors"
            >
              <Plus className="w-4 h-4" /> New Company Task
            </button>
          </div>
        }
      />

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-ink/40 py-16 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading the Workflow Engine...
        </div>
      ) : (
        <>
          {dashboard && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
              <StatCard label="Overall Progress" value={`${dashboard.overallProgressPct}%`} icon={WorkflowIcon} />
              <StatCard label="Completed Tasks" value={dashboard.completedTasks} delay={0.05} />
              <StatCard label="Delayed Tasks" value={dashboard.delayedTasks} icon={AlertTriangle} trend="down" delay={0.1} />
              <StatCard label="Critical Tasks" value={dashboard.criticalTasks} icon={Flame} trend="down" delay={0.15} />
            </div>
          )}

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {GROUP_ORDER.map((group, gi) => (
              <Reveal key={group} delay={0.04 * gi}>
                <div className="rounded-2xl border border-line bg-mist/60 p-3 min-h-[420px]">
                  <div className="flex items-center justify-between mb-3 px-1">
                    <span className="font-mono text-[10px] tracking-wideish uppercase text-ink/45">{group}</span>
                    <span className="text-xs font-semibold text-ink/40">{grouped[group].length}</span>
                  </div>
                  <div className="space-y-2.5">
                    {grouped[group].map((w) => (
                      <Link
                        key={w.id}
                        to={`/workflow-engine/${w.id}`}
                        className="block rounded-xl bg-white border border-line p-3 shadow-card hover:shadow-card-hover transition-shadow"
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <Badge tone={PRIORITY_TONE[w.priority]}>{w.priority}</Badge>
                          <span className="text-[10px] text-ink/35">{w.completedStages}/{w.stageCount}</span>
                        </div>
                        <p className="text-sm font-semibold text-ink truncate">{w.title}</p>
                        <p className="text-xs text-ink/40 mt-1 truncate">{w.departmentKey}</p>
                      </Link>
                    ))}
                    {grouped[group].length === 0 && <p className="text-xs text-ink/30 px-1">Empty</p>}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New Company Task">
        <QuickAddForm
          submitLabel="Create Task"
          onSubmit={createWorkflow}
          fields={[
            { key: 'title', label: 'Task title', placeholder: 'e.g. Launch autumn product line' },
            { key: 'departmentKey', label: 'Department', type: 'select', options: DEPARTMENTS.map((d) => ({ value: d.key, label: d.name })) },
            { key: 'priority', label: 'Priority', type: 'select', options: PRIORITIES },
            { key: 'description', label: 'Description', required: false, placeholder: 'Optional detail' },
            { key: 'dueDate', label: 'Due date', type: 'date', required: false }
          ]}
        />
      </Modal>
    </div>
  )
}
