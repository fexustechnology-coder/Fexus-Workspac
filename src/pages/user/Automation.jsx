import { useEffect, useState } from 'react'
import PageHeader from '../../components/ui/PageHeader'
import DataTable from '../../components/ui/DataTable'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import QuickAddForm from '../../components/ui/QuickAddForm'
import { Plus, Trash2, Loader2 } from 'lucide-react'
import { api } from '../../lib/api'

export default function Automation() {
  const [automations, setAutomations] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')

  function load() {
    setLoading(true)
    api.automations.list()
      .then(({ items }) => setAutomations(items))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function addAutomation(values) {
    try {
      await api.automations.create({ name: values.name, trigger: values.trigger, runs: 0, status: 'Active' })
      setOpen(false)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function toggleStatus(a) {
    await api.automations.update(a.id, { status: a.status === 'Active' ? 'Paused' : 'Active' })
    load()
  }

  async function removeAutomation(id) {
    await api.automations.remove(id)
    load()
  }

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Automation"
        description="Workflows connecting your tools. Automation AI connects here in a future phase."
        actions={
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors"
          >
            <Plus className="w-4 h-4" /> New Workflow
          </button>
        }
      />

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-ink/40 py-12 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading workflows...
        </div>
      ) : automations.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line p-12 text-center text-sm text-ink/40">
          No workflows yet. Create your first one to see it here.
        </div>
      ) : (
        <DataTable
          keyField="id"
          rows={automations}
          columns={[
            { key: 'name', label: 'Workflow', render: (r) => <span className="font-medium text-ink">{r.name}</span> },
            { key: 'trigger', label: 'Trigger' },
            { key: 'runs', label: 'Runs' },
            {
              key: 'status',
              label: 'Status',
              render: (r) => (
                <button onClick={() => toggleStatus(r)}>
                  <Badge tone={r.status === 'Active' ? 'success' : 'neutral'} dot>{r.status}</Badge>
                </button>
              )
            },
            {
              key: 'actions',
              label: '',
              render: (r) => (
                <button onClick={() => removeAutomation(r.id)} className="text-ink/30 hover:text-red-500 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              )
            }
          ]}
        />
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New Workflow">
        <QuickAddForm
          submitLabel="Create Workflow"
          onSubmit={addAutomation}
          fields={[
            { key: 'name', label: 'Workflow name', placeholder: 'e.g. New lead → CRM sync' },
            { key: 'trigger', label: 'Trigger', placeholder: 'e.g. Form submission' }
          ]}
        />
      </Modal>
    </div>
  )
}
