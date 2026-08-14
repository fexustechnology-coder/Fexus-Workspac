import { useEffect, useState } from 'react'
import PageHeader from '../../components/ui/PageHeader'
import DataTable from '../../components/ui/DataTable'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import QuickAddForm from '../../components/ui/QuickAddForm'
import { Plus, Trash2, Loader2 } from 'lucide-react'
import { api } from '../../lib/api'

export default function Clients() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')

  function load() {
    setLoading(true)
    api.clients.list()
      .then(({ items }) => setClients(items))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function addClient(values) {
    try {
      await api.clients.create({ name: values.name, contact: values.contact, email: values.email, mrr: Number(values.mrr) || 0 })
      setOpen(false)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function toggleStatus(client) {
    await api.clients.update(client.id, { status: client.status === 'Active' ? 'Churned' : 'Active' })
    load()
  }

  async function removeClient(id) {
    await api.clients.remove(id)
    load()
  }

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Clients"
        description="Every company you work with — real records, stored in the database."
        actions={
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Client
          </button>
        }
      />

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-ink/40 py-12 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading clients...
        </div>
      ) : clients.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line p-12 text-center text-sm text-ink/40">
          No clients yet. Add your first one to see it here.
        </div>
      ) : (
        <DataTable
          keyField="id"
          rows={clients}
          columns={[
            { key: 'name', label: 'Company', render: (r) => <span className="font-medium text-ink">{r.name}</span> },
            { key: 'contact', label: 'Contact' },
            { key: 'email', label: 'Email' },
            { key: 'mrr', label: 'MRR', render: (r) => `$${r.mrr.toLocaleString()}` },
            { key: 'projects', label: 'Projects', render: (r) => r._count?.projects ?? 0 },
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
                <button onClick={() => removeClient(r.id)} className="text-ink/30 hover:text-red-500 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              )
            }
          ]}
        />
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Add Client">
        <QuickAddForm
          submitLabel="Add Client"
          onSubmit={addClient}
          fields={[
            { key: 'name', label: 'Company name', placeholder: 'e.g. Cascade Interiors' },
            { key: 'contact', label: 'Primary contact', placeholder: 'e.g. Jamie Fox', required: false },
            { key: 'email', label: 'Email', type: 'email', placeholder: 'jamie@cascade.co', required: false },
            { key: 'mrr', label: 'Monthly value ($)', type: 'number', placeholder: '2500', required: false }
          ]}
        />
      </Modal>
    </div>
  )
}
