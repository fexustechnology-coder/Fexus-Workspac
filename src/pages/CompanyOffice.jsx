import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/ui/PageHeader'
import Badge from '../components/ui/Badge'
import Reveal from '../components/ui/Reveal'
import OfficeFloor from '../components/ui/OfficeFloor'
import { api } from '../lib/api'
import { robotVariantForStatus } from '../lib/robotAnimation'
import { PRIORITY_TONE } from '../lib/workflowEngineConstants'
import { Send, ArrowRight, WifiOff } from 'lucide-react'

const POLL_MS = 2500
const TERMINAL = ['Completed', 'Cancelled', 'Failed', 'Archived']
// Phase 18 — MVP Simplification: the Robot Office shows exactly these two
// real employees (seeded in employeeRoster.js) alongside the CEO. The
// other 54 seeded employees still exist and still do real work assigned
// through Website AI/Growth AI — they're just not part of this simplified
// visual, matching the brief's "hide, don't delete" instruction.
const SIMPLIFIED_EMPLOYEE_NAMES = ['Hira', 'Shanza']

export default function CompanyOffice() {
  const [employees, setEmployees] = useState([])
  const [workflows, setWorkflows] = useState([])
  const [offline, setOffline] = useState(false)
  const [title, setTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [emp, wf] = await Promise.all([api.getEmployees(), api.workflows.list()])
      setEmployees(emp.employees || [])
      setWorkflows(wf.workflows || [])
      setOffline(false)
    } catch (e) {
      setOffline(true)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, POLL_MS)
    return () => clearInterval(id)
  }, [load])

  const ceo = employees.find((e) => e.level === 'ceo')
  const activeWorkflows = workflows.filter((w) => !TERMINAL.includes(w.status))

  function stageForEmployee(employeeId) {
    for (const w of activeWorkflows) {
      const stage = w.stages?.find((s) => s.assigneeEmployeeId === employeeId && !TERMINAL.includes(s.status))
      if (stage) return { stage, workflow: w }
    }
    return null
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) return
    setSubmitting(true)
    setError('')
    try {
      // Every task submitted from the simplified office goes to the
      // Marketing department by default (home of the Email Campaign
      // Specialist) — Website work is still created normally from
      // Website AI's own "New Plan" flow, which already assigns the
      // Website department for real.
      await api.workflows.create({ title: title.trim(), departmentKey: 'marketing' })
      setTitle('')
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const mostRecentActive = activeWorkflows[0] || null
  const simplifiedEmployees = SIMPLIFIED_EMPLOYEE_NAMES
    .map((name) => employees.find((e) => e.name === name))
    .filter(Boolean)
    .map((e) => {
      const found = stageForEmployee(e.id)
      return {
        id: e.id,
        name: e.name,
        subtitle: found?.stage.title || 'Idle',
        variant: found ? robotVariantForStatus(found.stage.status) : 'idle'
      }
    })

  return (
    <div>
      <PageHeader
        eyebrow="Robot Office"
        title="Watch the company operate, live."
        description="Owner → CEO → 2 Employees. Every robot here reflects a real Workflow row in the database — nothing animates or moves unless the backend says it should."
        actions={<Badge tone={offline ? 'danger' : 'ferozi'} dot>{offline ? 'Backend Offline' : 'Live'}</Badge>}
      />

      {offline && (
        <Reveal>
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-5 flex items-start gap-3">
            <WifiOff className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-700">Can't reach the backend.</p>
              <p className="text-sm text-red-600/80 mt-1">
                Start it with <code className="font-mono bg-red-100 px-1.5 py-0.5 rounded">cd backend && npm run dev</code> (after
                running Prisma generate/migrate/seed). This page will reconnect automatically.
              </p>
            </div>
          </div>
        </Reveal>
      )}

      <Reveal delay={0.05} className="mb-10">
        {employees.length > 0 && simplifiedEmployees.length === 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
            "Hira" and "Shanza" weren't found in the seeded roster — re-run{' '}
            <code className="font-mono bg-amber-100 px-1.5 py-0.5 rounded">npm run seed</code> in <code className="font-mono bg-amber-100 px-1.5 py-0.5 rounded">backend/</code> to add them (safe to re-run, adds only what's missing).
          </div>
        ) : (
          <OfficeFloor
            ceo={ceo ? { name: ceo.name, variant: robotVariantForStatus(mostRecentActive?.status) } : null}
            ceoSubtitle={mostRecentActive?.title || 'No active task — idle'}
            employees={simplifiedEmployees}
          />
        )}
      </Reveal>

      {/* Workflow console */}
      <div className="grid lg:grid-cols-[1fr_1.3fr] gap-6">
        <Reveal>
          <div className="rounded-2xl border border-line bg-white shadow-card p-6">
            <h3 className="font-display font-semibold text-base mb-1">Owner: Submit a task</h3>
            <p className="text-sm text-ink/50 mb-5">Creates a real Workflow, assigned to the CEO first.</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Task</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Launch the autumn email campaign"
                  className="mt-2 w-full rounded-lg border border-line px-4 py-2.5 text-sm outline-none focus:border-ferozi focus:ring-2 focus:ring-ferozi/20 transition-all"
                />
              </div>
              <p className="text-xs text-ink/35">
                For a website request, use <Link to="/website-ai" className="text-ferozi-deep hover:underline">Website AI</Link>'s
                own "New Plan" instead — it assigns Shanza directly.
              </p>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={submitting || offline}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" /> Submit to CEO
              </button>
            </form>
          </div>
        </Reveal>

        <Reveal delay={0.05}>
          <div className="rounded-2xl border border-line bg-white shadow-card p-6">
            <h3 className="font-display font-semibold text-base mb-1">Active workflows</h3>
            <p className="text-sm text-ink/50 mb-5">
              Manage stages, dependencies, and approvals in the{' '}
              <Link to="/workflow-engine" className="text-ferozi-deep hover:underline">Workflow Engine</Link>.
            </p>
            <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
              {activeWorkflows.length === 0 && (
                <p className="text-sm text-ink/35 py-6 text-center">No active workflows. Submit one to see the office come alive.</p>
              )}
              {activeWorkflows.map((w) => (
                <Link key={w.id} to={`/workflow-engine/${w.id}`} className="block rounded-xl border border-line p-4 hover:border-ferozi/50 hover:shadow-card transition-all">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-ink truncate">{w.title}</p>
                    <Badge tone={PRIORITY_TONE[w.priority]}>{w.priority}</Badge>
                  </div>
                  <p className="text-xs text-ink/45 mt-1.5">{w.status} · {w.completedStages}/{w.stageCount} stages complete</p>
                  <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-ferozi-deep">
                    Manage in Workflow Engine <ArrowRight className="w-3 h-3" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  )
}
