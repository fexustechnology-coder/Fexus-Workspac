import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Users } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Badge from '../../components/ui/Badge'
import Reveal from '../../components/ui/Reveal'
import FexusRobot from '../../components/ui/FexusRobot'
import { api } from '../../lib/api'
import { robotVariantForStatus } from '../../lib/robotAnimation'

export default function EmployeeOffice() {
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getEmployeeRoster()
      .then(({ employees }) => setEmployees(employees))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const grouped = useMemo(() => {
    const map = {}
    for (const e of employees) {
      const key = e.department?.name || 'Unassigned'
      if (!map[key]) map[key] = []
      map[key].push(e)
    }
    return map
  }, [employees])

  return (
    <div>
      <PageHeader
        eyebrow="AI Employees"
        title="The Employee Office."
        description="Every employee performs one fixed responsibility, reports to their Director, and never executes work on its own — this is the framework only."
        actions={<Badge tone="ferozi" dot><Users className="w-3 h-3 mr-1 inline" />{employees.length} Employees</Badge>}
      />

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-ink/40 py-16 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading the Employee Office...
        </div>
      ) : (
        <div className="space-y-10">
          {Object.entries(grouped).map(([deptName, items], gi) => (
            <div key={deptName}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display font-semibold text-lg">{deptName}</h2>
                <span className="font-mono text-[10px] tracking-wideish uppercase text-ink/35">{items.length} employees</span>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {items.map((e, i) => {
                  const variant = robotVariantForStatus(e.currentTask?.status)
                  return (
                    <Reveal key={e.id} delay={0.02 * (gi * 5 + i)}>
                      <Link
                        to={`/employees/${e.id}`}
                        className="group block rounded-2xl border border-line bg-white p-4 shadow-card hover:shadow-card-hover hover:border-ferozi/50 transition-all duration-300 text-center"
                      >
                        <FexusRobot variant={variant} size={64} className="mx-auto" />
                        <p className="mt-2 font-display font-semibold text-sm truncate">{e.name}</p>
                        <p className="mt-0.5 text-[11px] text-ink/40 truncate">{e.responsibility}</p>
                        <Badge tone={e.currentTask ? 'ferozi' : 'neutral'} dot className="mt-2">
                          {e.currentTask ? 'Working' : 'Idle'}
                        </Badge>
                      </Link>
                    </Reveal>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
