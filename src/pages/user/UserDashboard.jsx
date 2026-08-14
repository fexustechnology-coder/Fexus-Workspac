import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import PageHeader from '../../components/ui/PageHeader'
import StatCard from '../../components/ui/StatCard'
import Reveal from '../../components/ui/Reveal'
import { FolderKanban, Receipt, Contact, TrendingUp, Loader2 } from 'lucide-react'
import { USER_NAV } from '../../lib/nav'
import { api } from '../../lib/api'

export default function UserDashboard() {
  const [metrics, setMetrics] = useState(null)
  const [projects, setProjects] = useState([])
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  function load() {
    setLoading(true)
    setError('')
    Promise.all([api.getMetrics(), api.projects.list(), api.invoices.list()])
      .then(([m, p, i]) => {
        setMetrics(m)
        setProjects(p.items.slice(0, 3))
        setInvoices(i.items.slice(0, 3))
      })
      // Same bug class fixed on the Owner Dashboard: this had no .catch at
      // all, so a failure here was an unhandled rejection AND left `metrics`
      // null forever while `.finally` still cleared `loading` — a permanent
      // stuck spinner with zero feedback.
      .catch((err) => setError(err.message || 'Failed to load your workspace.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Your workspace at a glance."
        description="Jump into any module below — every page is fully routed and backed by real data."
      />

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-semibold text-red-700">Couldn't load your workspace.</p>
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
          <Loader2 className="w-4 h-4 animate-spin" /> Loading your workspace...
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <StatCard label="Active Projects" value={metrics.projects.total} icon={FolderKanban} />
            <StatCard
              label="Outstanding Invoices"
              value={`$${metrics.invoices.outstanding.toLocaleString()}`}
              icon={Receipt}
              delay={0.05}
            />
            <StatCard label="Active Clients" value={metrics.clients.active} icon={Contact} delay={0.1} />
            <StatCard label="Open Pipeline" value={`$${metrics.deals.openPipeline.toLocaleString()}`} icon={TrendingUp} delay={0.15} />
          </div>

          <Reveal delay={0.1} className="mt-8">
            <h2 className="font-display font-semibold text-lg mb-4">Quick access</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {USER_NAV.filter((n) => n.to !== '/dashboard').map((item, i) => {
                const Icon = item.icon
                return (
                  <motion.div
                    key={item.to}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.15 + i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                    whileHover={{ y: -6, rotateX: 5, rotateY: -4, scale: 1.02 }}
                    style={{ transformPerspective: 900 }}
                  >
                    <Link
                      to={item.to}
                      className="group block rounded-2xl border border-line bg-white p-5 shadow-card hover:shadow-card-hover hover:border-electric/40 transition-shadow duration-300"
                    >
                      <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-electric to-aqua flex items-center justify-center group-hover:shadow-glow-electric transition-shadow">
                        <Icon className="w-5 h-5 text-white" />
                      </span>
                      <p className="mt-3 font-medium text-sm text-ink">{item.label}</p>
                    </Link>
                  </motion.div>
                )
              })}
            </div>
          </Reveal>

          <div className="grid lg:grid-cols-2 gap-5 mt-8">
            <Reveal delay={0.15}>
              <div className="rounded-2xl border border-line bg-white shadow-card p-6 h-full">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-display font-semibold text-base">Recent Projects</h3>
                  <Link to="/projects" className="text-xs font-semibold text-ferozi-deep hover:underline">View all</Link>
                </div>
                <div className="space-y-3">
                  {projects.length === 0 && <p className="text-sm text-ink/35">No projects yet.</p>}
                  {projects.map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-sm">
                      <span className="text-ink/80 truncate">{p.name}</span>
                      <span className="text-ink/40 shrink-0">{p.dueDate || p.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
            <Reveal delay={0.2}>
              <div className="rounded-2xl border border-line bg-white shadow-card p-6 h-full">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-display font-semibold text-base">Recent Invoices</h3>
                  <Link to="/invoices" className="text-xs font-semibold text-ferozi-deep hover:underline">View all</Link>
                </div>
                <div className="space-y-3">
                  {invoices.length === 0 && <p className="text-sm text-ink/35">No invoices yet.</p>}
                  {invoices.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between text-sm">
                      <span className="text-ink/80">{inv.client?.name}</span>
                      <span className="text-ink/40">${inv.amount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </>
      )}
    </div>
  )
}
