import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, LayoutDashboard, MessageSquare, Loader2, Crown } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Badge from '../../components/ui/Badge'
import StatCard from '../../components/ui/StatCard'
import FexusRobot from '../../components/ui/FexusRobot'
import ChatPanel from '../../components/ui/ChatPanel'
import { api } from '../../lib/api'

function humanize(key) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())
}

const CURRENCY_KEYS = new Set(['mrr', 'arr', 'burnRate'])

function DataSummary({ data }) {
  const entries = Object.entries(data || {})
  if (entries.length === 0) return <p className="text-sm text-ink/35">No department data recorded yet.</p>

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
      {entries.map(([key, value], i) => {
        if (Array.isArray(value)) {
          return <StatCard key={key} label={humanize(key)} value={value.length} delay={0.05 * i} />
        }
        if (typeof value === 'number') {
          const isCurrency = CURRENCY_KEYS.has(key)
          return <StatCard key={key} label={humanize(key)} value={isCurrency ? `$${value.toLocaleString()}` : value} delay={0.05 * i} />
        }
        return null
      })}
    </div>
  )
}

export default function DirectorDetail() {
  const { key } = useParams()
  const [tab, setTab] = useState('dashboard')
  const [director, setDirector] = useState(null)
  const [deptStatus, setDeptStatus] = useState(null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setTab('dashboard')
    api.getDirectorDashboard(key)
      .then((res) => { setDirector(res.director); setDeptStatus(res.deptStatus); setData(res.data) })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [key])

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-ink/40 py-16 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading director...
      </div>
    )
  }

  if (error || !director) {
    return (
      <div>
        <Link to="/directors" className="inline-flex items-center gap-1.5 text-sm text-ferozi-deep mb-4 hover:underline">
          <ArrowLeft className="w-4 h-4" /> Back to Directors
        </Link>
        <p className="text-sm text-red-600">{error || 'Director not found.'}</p>
      </div>
    )
  }

  return (
    <div>
      <Link to="/directors" className="inline-flex items-center gap-1.5 text-sm text-ferozi-deep mb-4 hover:underline">
        <ArrowLeft className="w-4 h-4" /> Back to Directors
      </Link>

      <div className="flex items-start gap-5 mb-6">
        <FexusRobot variant="idle" size={80} />
        <div className="flex-1">
          <PageHeader
            eyebrow="Executive Leadership Team"
            title={director.title}
            description={`Reads: ${director.reads.join(', ')}. Never executes work — plans, advises, and reports only.`}
            actions={
              <Badge tone={deptStatus?.activeWorkflows ? 'ferozi' : 'neutral'} dot>
                {deptStatus?.activeWorkflows ? `${deptStatus.activeWorkflows} active task${deptStatus.activeWorkflows === 1 ? '' : 's'}` : 'Idle'}
              </Badge>
            }
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {director.responsibilities.map((r) => (
          <Badge key={r} tone="neutral">{r}</Badge>
        ))}
      </div>

      {director.inferredReads && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          The original brief cut off before listing what this director reads — the scope above is an
          inference from the pattern every other director follows, not a confirmed instruction.
        </div>
      )}

      <div className="flex items-center gap-1 p-1 rounded-lg bg-mist border border-line mb-6 w-fit">
        <button
          onClick={() => setTab('dashboard')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-colors ${
            tab === 'dashboard' ? 'bg-white shadow-sm text-ink' : 'text-ink/45 hover:text-ink/70'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" /> Dashboard
        </button>
        <button
          onClick={() => setTab('chat')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-colors ${
            tab === 'chat' ? 'bg-white shadow-sm text-ink' : 'text-ink/45 hover:text-ink/70'
          }`}
        >
          <MessageSquare className="w-4 h-4" /> Chat
        </button>
      </div>

      {tab === 'dashboard' ? (
        <DataSummary data={data} />
      ) : (
        <ChatPanel
          sendFn={(message, history) => api.directorChat(key, message, history).then((r) => r.reply)}
          emptyIcon={Crown}
          emptyText={`Ask the ${director.title} about ${director.responsibilities[0]?.toLowerCase() || 'their department'} — answers come only from real department data and Company Brain.`}
          placeholder={`Ask the ${director.title}...`}
        />
      )}
    </div>
  )
}
