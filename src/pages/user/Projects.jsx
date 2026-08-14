import { useEffect, useState } from 'react'
import PageHeader from '../../components/ui/PageHeader'
import Badge from '../../components/ui/Badge'
import Reveal from '../../components/ui/Reveal'
import Modal from '../../components/ui/Modal'
import QuickAddForm from '../../components/ui/QuickAddForm'
import { Plus, Calendar, Trash2, Loader2 } from 'lucide-react'
import { api } from '../../lib/api'

const STATUSES = ['Planning', 'In Progress', 'Review', 'Completed']
const STATUS_TONE = { Planning: 'neutral', 'In Progress': 'ferozi', Review: 'warning', Completed: 'success' }

export default function Projects() {
  const [projects, setProjects] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')

  function load() {
    setLoading(true)
    Promise.all([api.projects.list(), api.clients.list()])
      .then(([p, c]) => { setProjects(p.items); setClients(c.items) })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function addProject(values) {
    try {
      await api.projects.create({
        name: values.name,
        clientId: values.clientId || undefined,
        status: values.status,
        dueDate: values.dueDate
      })
      setOpen(false)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function setStatus(project, status) {
    await api.projects.update(project.id, { status })
    load()
  }

  async function removeProject(id) {
    await api.projects.remove(id)
    load()
  }

  const clientOptions = ['— No client —', ...clients.map((c) => c.name)]

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Projects"
        description="Track every engagement from planning to delivery — real records."
        actions={
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors"
          >
            <Plus className="w-4 h-4" /> New Project
          </button>
        }
      />

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-ink/40 py-12 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading projects...
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {STATUSES.map((status, colIdx) => {
            const items = projects.filter((p) => p.status === status)
            return (
              <Reveal key={status} delay={0.05 * colIdx}>
                <div className="rounded-2xl border border-line bg-mist/60 p-4 h-full min-h-[420px]">
                  <div className="flex items-center justify-between mb-4 px-1">
                    <span className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">{status}</span>
                    <span className="text-xs font-semibold text-ink/40">{items.length}</span>
                  </div>
                  <div className="space-y-3">
                    {items.map((p) => (
                      <div key={p.id} className="rounded-xl bg-white border border-line p-4 shadow-card hover:shadow-card-hover transition-shadow">
                        <div className="flex items-center justify-between mb-2">
                          <select
                            value={p.status}
                            onChange={(e) => setStatus(p, e.target.value)}
                            className="font-mono text-[10px] uppercase tracking-wideish bg-transparent outline-none text-ink/50"
                          >
                            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <button onClick={() => removeProject(p.id)} className="text-ink/25 hover:text-red-500 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <p className="text-sm font-semibold text-ink">{p.name}</p>
                        <p className="text-xs text-ink/45 mt-1">{p.client?.name || 'No client'}</p>
                        <div className="mt-3 h-1.5 rounded-full bg-mist overflow-hidden">
                          <div className="h-full rounded-full bg-ferozi" style={{ width: `${p.progress}%` }} />
                        </div>
                        {p.dueDate && (
                          <div className="mt-3 flex items-center gap-1.5 text-xs text-ink/40">
                            <Calendar className="w-3.5 h-3.5" /> Due {p.dueDate}
                          </div>
                        )}
                      </div>
                    ))}
                    {items.length === 0 && <p className="text-xs text-ink/30 px-1">Nothing here.</p>}
                  </div>
                </div>
              </Reveal>
            )
          })}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New Project">
        <QuickAddForm
          submitLabel="Add Project"
          onSubmit={(values) => {
            const client = clients.find((c) => c.name === values.client)
            addProject({ ...values, clientId: client?.id })
          }}
          fields={[
            { key: 'name', label: 'Project name', placeholder: 'e.g. Q4 Rebrand' },
            { key: 'client', label: 'Client', type: 'select', options: clientOptions, required: false },
            { key: 'status', label: 'Status', type: 'select', options: STATUSES },
            { key: 'dueDate', label: 'Due date', placeholder: 'e.g. Sep 30', required: false }
          ]}
        />
      </Modal>
    </div>
  )
}
