import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Users } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Badge from '../../components/ui/Badge'
import Reveal from '../../components/ui/Reveal'
import FexusRobot from '../../components/ui/FexusRobot'
import { api } from '../../lib/api'

export default function Directors() {
  const [directors, setDirectors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getDirectors()
      .then(({ directors }) => setDirectors(directors))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <PageHeader
        eyebrow="Executive Leadership Team"
        title="Directors."
        description="Each director is an expert in one department — reads Company Brain and their own department's real data, plans and advises, and never executes work themselves."
        actions={<Badge tone="ferozi" dot><Users className="w-3 h-3 mr-1 inline" />9 Directors</Badge>}
      />

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-ink/40 py-16 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading the leadership team...
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {directors.map((d, i) => (
            <Reveal key={d.key} delay={0.04 * i}>
              <Link
                to={`/directors/${d.key}`}
                className="group block rounded-2xl border border-line bg-white p-6 shadow-card hover:shadow-card-hover hover:border-ferozi/50 transition-all duration-300"
              >
                <div className="flex items-start justify-between">
                  <FexusRobot variant="idle" size={64} />
                  <Badge tone={d.deptStatus?.activeWorkflows ? 'ferozi' : 'neutral'} dot>
                    {d.deptStatus?.activeWorkflows ? `${d.deptStatus.activeWorkflows} active` : 'Idle'}
                  </Badge>
                </div>
                <h3 className="mt-3 font-display font-semibold text-lg">{d.title}</h3>
                <p className="mt-1 text-xs text-ink/45">
                  {d.responsibilities.slice(0, 3).join(' · ')}
                  {d.responsibilities.length > 3 ? ` +${d.responsibilities.length - 3} more` : ''}
                </p>
                {d.inferredReads && (
                  <p className="mt-2 text-[10px] font-mono uppercase tracking-wideish text-amber-600">
                    Data scope inferred — brief cut off
                  </p>
                )}
              </Link>
            </Reveal>
          ))}
        </div>
      )}
    </div>
  )
}
