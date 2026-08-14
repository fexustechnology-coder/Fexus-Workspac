import { useEffect, useState } from 'react'
import PageHeader from '../../components/ui/PageHeader'
import StatCard from '../../components/ui/StatCard'
import ChartCard from '../../components/ui/ChartCard'
import { FolderKanban, Contact, TrendingUp, Receipt, Loader2 } from 'lucide-react'
import { api } from '../../lib/api'

function toChartData(byStatusObj) {
  return Object.entries(byStatusObj || {}).map(([status, count]) => ({ month: status, count }))
}

export default function Analytics() {
  const [metrics, setMetrics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getMetrics()
      .then(setMetrics)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Analytics"
        description="Performance across your projects, clients, and revenue — computed live from real records. Analytics AI connects here in a future phase."
      />

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {loading || !metrics ? (
        <div className="flex items-center gap-2 text-sm text-ink/40 py-12 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading analytics...
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-5">
            <StatCard label="Monthly Revenue (MRR)" value={`$${metrics.mrr.toLocaleString()}`} icon={TrendingUp} />
            <StatCard label="Active Projects" value={metrics.projects.total} icon={FolderKanban} delay={0.05} />
            <StatCard label="Active Clients" value={metrics.clients.active} icon={Contact} delay={0.1} />
            <StatCard label="Outstanding Invoices" value={`$${metrics.invoices.outstanding.toLocaleString()}`} icon={Receipt} delay={0.15} />
          </div>

          <div className="grid lg:grid-cols-2 gap-5">
            <ChartCard
              title="Projects by Status"
              subtitle="Live counts from real project records"
              type="bar"
              data={toChartData(metrics.projects.byStatus)}
              dataKeys={[{ key: 'count', name: 'Projects' }]}
            />
            <ChartCard
              title="Invoices by Status"
              subtitle="Live counts from real invoice records"
              type="bar"
              data={toChartData(metrics.invoices.byStatus)}
              dataKeys={[{ key: 'count', name: 'Invoices' }]}
              delay={0.05}
            />
          </div>
        </>
      )}
    </div>
  )
}
