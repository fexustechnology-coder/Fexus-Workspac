import { useEffect, useState } from 'react'
import PageHeader from '../../components/ui/PageHeader'
import ChartCard from '../../components/ui/ChartCard'
import StatCard from '../../components/ui/StatCard'
import { DollarSign, Contact, Flame, Loader2 } from 'lucide-react'
import { api } from '../../lib/api'

function toChartData(byStatusObj) {
  return Object.entries(byStatusObj || {}).map(([label, count]) => ({ month: label, count }))
}

export default function OwnerAnalytics() {
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
        eyebrow="Owner Workspace"
        title="Analytics"
        description="Revenue, pipeline, and burn — computed live from real Clients, Invoices, Deals, and Expenses. No demo data."
      />

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {loading || !metrics ? (
        <div className="flex items-center gap-2 text-sm text-ink/40 py-12 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Computing metrics...
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-5">
            <StatCard label="MRR" value={`$${metrics.mrr.toLocaleString()}`} icon={DollarSign} />
            <StatCard label="ARR" value={`$${metrics.arr.toLocaleString()}`} icon={DollarSign} delay={0.05} />
            <StatCard label="Active Clients" value={metrics.clients.active} icon={Contact} delay={0.1} />
            <StatCard label="Burn Rate" value={`$${metrics.burnRate.toLocaleString()}`} icon={Flame} delay={0.15} />
          </div>

          <div className="grid lg:grid-cols-2 gap-5">
            <ChartCard
              title="Invoices by Status"
              subtitle={`$${metrics.invoices.outstanding.toLocaleString()} outstanding, $${metrics.invoices.paid.toLocaleString()} paid`}
              type="bar"
              data={toChartData(metrics.invoices.byStatus)}
              dataKeys={[{ key: 'count', name: 'Invoices' }]}
            />
            <ChartCard
              title="Projects by Status"
              subtitle="Live pipeline of work"
              type="bar"
              data={toChartData(metrics.projects.byStatus)}
              dataKeys={[{ key: 'count', name: 'Projects' }]}
              delay={0.05}
            />
            <ChartCard
              title="Deals by Stage"
              subtitle={`$${metrics.deals.openPipeline.toLocaleString()} open, $${metrics.deals.closedWonValue.toLocaleString()} closed won`}
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
        </>
      )}
    </div>
  )
}
