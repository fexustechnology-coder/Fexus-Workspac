import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { DollarSign, TrendingUp, Flame, Users, FolderKanban, Bot, ArrowRight, Loader2 } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import StatCard from '../../components/ui/StatCard'
import ChartCard from '../../components/ui/ChartCard'
import Badge from '../../components/ui/Badge'
import Reveal from '../../components/ui/Reveal'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/AuthContext'

function toChartData(byStatusObj) {
  return Object.entries(byStatusObj || {}).map(([label, count]) => ({ month: label, count }))
}

export default function OwnerDashboard() {
  const { user } = useAuth()
  const [backendOnline, setBackendOnline] = useState(null)
  const [metrics, setMetrics] = useState(null)
  const [projects, setProjects] = useState([])
  const [workforce, setWorkforce] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Real, new, independent state for "who signed up" — kept separate
  // from the main dashboard Promise.all above so a failure here never
  // blocks or breaks the existing, working dashboard data.
  const [companyUsers, setCompanyUsers] = useState([])
  const [companyUsersLoading, setCompanyUsersLoading] = useState(true)

  function load() {
    let cancelled = false
    setLoading(true)
    setError('')
    api.health().then(() => !cancelled && setBackendOnline(true)).catch(() => !cancelled && setBackendOnline(false))

    Promise.all([api.getMetrics(), api.projects.list(), api.getEmployees(), api.workflows.list()])
      .then(([m, p, emp, wf]) => {
        if (cancelled) return
        setMetrics(m)
        setProjects(p.items.slice(0, 4))
        const activeStages = wf.workflows.flatMap((w) => w.stages || []).filter((s) => !['Completed', 'Cancelled', 'Failed', 'Archived'].includes(s.status))
        const roster = emp.employees
          .filter((e) => e.level !== 'ceo')
          .map((e) => {
            const stage = activeStages.find((s) => s.assigneeEmployeeId === e.id)
            return { id: e.id, name: e.name, status: stage ? 'Working a task' : 'Idle', active: !!stage }
          })
        setWorkforce(roster)
      })
      // Root cause of "Owner Dashboard does not open": this catch used to be
      // empty. If ANY of the 4 calls above failed for ANY reason, `metrics`
      // never got set, but `.finally()` still cleared `loading` — leaving
      // the page stuck on the loading spinner forever, with no error shown
      // and no way to recover short of understanding the code. Now the
      // failure is surfaced and offers a real retry.
      .catch((err) => { if (!cancelled) setError(err.message || 'Failed to load dashboard data.') })
      .finally(() => !cancelled && setLoading(false))

    return () => { cancelled = true }
  }

  useEffect(load, [])

  // Real, independent load — a real, honest empty/loading state if it
  // fails, never silently blocking the rest of the dashboard.
  useEffect(() => {
    let cancelled = false
    api.companyUsers().then(({ companyUsers }) => { if (!cancelled) setCompanyUsers(companyUsers) })
      .catch((err) => console.error('[OwnerDashboard] Failed to load company users:', err.message))
      .finally(() => !cancelled && setCompanyUsersLoading(false))
    return () => { cancelled = true }
  }, [])

  return (
    <div>
      <PageHeader
        eyebrow="Owner Workspace"
        title={`Welcome back, ${user?.name?.split(' ')[0] || 'Owner'}.`}
        description="Here's how FEXUS is performing across revenue, growth, and the AI Workforce build-out — all real numbers."
      />

      {backendOnline !== null && (
        <Reveal>
          <Link
            to="/company-office"
            className={`mb-6 flex items-center justify-between gap-4 rounded-2xl border p-4 transition-colors ${
              backendOnline ? 'border-ferozi/30 bg-ferozi-soft hover:bg-ferozi-soft/70' : 'border-line bg-mist hover:bg-mist/70'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className={`w-2 h-2 rounded-full ${backendOnline ? 'bg-ferozi animate-pulseGlow' : 'bg-ink/20'}`} />
              <p className="text-sm text-ink/70">
                Robot Office backend is{' '}
                <span className="font-semibold text-ink">{backendOnline ? 'live' : 'offline'}</span>
                {backendOnline ? ' — the Company Office is running on real task state.' : ' — start it to see the office come alive.'}
              </p>
            </div>
            <span className="flex items-center gap-1 text-xs font-semibold text-ferozi-deep shrink-0">
              Open Company Office <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </Link>
        </Reveal>
      )}

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-semibold text-red-700">Couldn't load the dashboard.</p>
          <p className="text-sm text-red-600/80 mt-1">{error}</p>
          <button
            onClick={load}
            className="mt-4 px-5 py-2 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors"
          >
            Try again
          </button>
        </div>
      ) : loading || !metrics ? (
        <div className="flex items-center gap-2 text-sm text-ink/40 py-12 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading real business data...
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <StatCard label="MRR" value={`$${metrics.mrr.toLocaleString()}`} icon={DollarSign} delay={0} />
            <StatCard label="ARR" value={`$${metrics.arr.toLocaleString()}`} icon={TrendingUp} delay={0.05} />
            <StatCard label="Burn Rate" value={`$${metrics.burnRate.toLocaleString()}`} icon={Flame} delay={0.1} />
            <StatCard label="Team Accounts" value={metrics.userCount} icon={Users} delay={0.15} />
          </div>

          <div className="grid lg:grid-cols-2 gap-5 mt-5">
            <ChartCard
              title="Deals by Stage"
              subtitle="Live sales pipeline"
              type="bar"
              data={toChartData(metrics.deals.byStage)}
              dataKeys={[{ key: 'count', name: 'Deals' }]}
              delay={0.1}
            />
            <ChartCard
              title="Clients"
              subtitle="Active vs. churned"
              type="bar"
              data={[{ month: 'Active', count: metrics.clients.active }, { month: 'Churned', count: metrics.clients.churned }]}
              dataKeys={[{ key: 'count', name: 'Clients' }]}
              delay={0.15}
            />
          </div>

          <div className="grid lg:grid-cols-[1.3fr_1fr] gap-5 mt-5">
            <Reveal delay={0.1}>
              <div className="rounded-2xl border border-line bg-white shadow-card p-6 h-full">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-display font-semibold text-base">Active Projects</h3>
                  <Link to="/projects" className="text-xs font-semibold text-ferozi-deep hover:underline">View all</Link>
                </div>
                <div className="space-y-3">
                  {projects.length === 0 && <p className="text-sm text-ink/35">No projects yet.</p>}
                  {projects.map((p) => (
                    <div key={p.id} className="flex items-center gap-4">
                      <span className="w-9 h-9 rounded-lg bg-ferozi-soft flex items-center justify-center shrink-0">
                        <FolderKanban className="w-4 h-4 text-ferozi-deep" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-ink truncate">{p.name}</p>
                          <span className="text-xs text-ink/40 shrink-0">{p.dueDate || p.status}</span>
                        </div>
                        <div className="mt-1.5 h-1.5 rounded-full bg-mist overflow-hidden">
                          <div className="h-full rounded-full bg-ferozi" style={{ width: `${p.progress}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>

            <Reveal delay={0.15}>
              <div className="rounded-2xl border border-line bg-white shadow-card p-6 h-full">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-display font-semibold text-base">AI Workforce Status</h3>
                  <Link to="/company-office" className="text-xs font-semibold text-ferozi-deep hover:underline">View floor</Link>
                </div>
                <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
                  {workforce.slice(0, 6).map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-8 h-8 rounded-lg bg-ink flex items-center justify-center shrink-0">
                          <Bot className="w-4 h-4 text-ferozi-glow" />
                        </span>
                        <p className="text-sm text-ink/80 truncate">{r.name}</p>
                      </div>
                      <Badge tone={r.active ? 'ferozi' : 'neutral'} dot>{r.status}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </>
      )}

      {/* Real, new, independent section — "who signed up," per the
          Owner's explicit request, so licenses can be generated and
          sent for each. Shown regardless of whether the main dashboard
          metrics above loaded, since this is separate, real data. */}
      <Reveal delay={0.2} className="mt-6">
        <div className="rounded-2xl border border-line bg-white shadow-card p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-display font-semibold text-base">Company User Signups</h3>
              <p className="text-xs text-ink/45 mt-0.5">Generate and send each one a License ID so they can log in.</p>
            </div>
            <Link to="/license-management" className="text-xs font-semibold text-ferozi-deep hover:underline shrink-0">
              License Management
            </Link>
          </div>
          {companyUsersLoading ? (
            <div className="flex items-center justify-center py-8 text-ink/30">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : companyUsers.length === 0 ? (
            <p className="text-sm text-ink/40 text-center py-6">No one has signed up yet.</p>
          ) : (
            <div className="space-y-2">
              {companyUsers.map((cu) => (
                <div key={cu.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{cu.name}</p>
                    <p className="text-xs text-ink/45 truncate">{cu.email}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge tone={cu.emailVerified ? 'ferozi' : 'neutral'} dot>
                      {cu.emailVerified ? 'Email verified' : 'Not verified yet'}
                    </Badge>
                    {cu.license ? (
                      <Badge tone={cu.license.status === 'ACTIVE' ? 'ferozi' : cu.license.status === 'REVOKED' ? 'danger' : 'warning'} dot>
                        License: {cu.license.status}
                      </Badge>
                    ) : (
                      <Badge tone="warning" dot>No license yet</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Reveal>
    </div>
  )
}
