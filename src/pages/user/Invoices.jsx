import { useEffect, useState } from 'react'
import PageHeader from '../../components/ui/PageHeader'
import DataTable from '../../components/ui/DataTable'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import QuickAddForm from '../../components/ui/QuickAddForm'
import { Plus, Trash2, Loader2, CheckCircle2 } from 'lucide-react'
import { api } from '../../lib/api'

const TONE = { Paid: 'success', Pending: 'warning', Overdue: 'danger' }

export default function Invoices() {
  const [invoices, setInvoices] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')

  function load() {
    setLoading(true)
    Promise.all([api.invoices.list(), api.clients.list()])
      .then(([i, c]) => { setInvoices(i.items); setClients(c.items) })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function addInvoice(values) {
    const client = clients.find((c) => c.name === values.client)
    if (!client) return setError('Pick a client for this invoice')
    try {
      await api.invoices.create({ clientId: client.id, amount: Number(values.amount) || 0, date: values.date })
      setOpen(false)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function markPaid(inv) {
    await api.invoices.update(inv.id, { status: 'Paid' })
    load()
  }

  async function removeInvoice(id) {
    await api.invoices.remove(id)
    load()
  }

  if (!loading && clients.length === 0) {
    return (
      <div>
        <PageHeader eyebrow="Workspace" title="Invoices" description="Track billing status across every client." />
        <div className="rounded-2xl border border-dashed border-line p-12 text-center text-sm text-ink/40">
          Add a client on the Clients page first — invoices need a client to bill.
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Invoices"
        description="Track billing status across every client — real records."
        actions={
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors"
          >
            <Plus className="w-4 h-4" /> New Invoice
          </button>
        }
      />

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-ink/40 py-12 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading invoices...
        </div>
      ) : invoices.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line p-12 text-center text-sm text-ink/40">
          No invoices yet. Create your first one to see it here.
        </div>
      ) : (
        <DataTable
          keyField="id"
          rows={invoices}
          columns={[
            { key: 'number', label: 'Invoice', render: (r) => <span className="font-mono text-xs text-ink/60">{r.number}</span> },
            { key: 'client', label: 'Client', render: (r) => <span className="font-medium text-ink">{r.client?.name}</span> },
            { key: 'amount', label: 'Amount', render: (r) => `$${r.amount.toLocaleString()}` },
            { key: 'date', label: 'Date' },
            { key: 'status', label: 'Status', render: (r) => <Badge tone={TONE[r.status]} dot>{r.status}</Badge> },
            {
              key: 'actions',
              label: '',
              render: (r) => (
                <div className="flex items-center gap-3">
                  {r.status !== 'Paid' && (
                    <button onClick={() => markPaid(r)} className="text-ink/40 hover:text-green-600 transition-colors" title="Mark Paid">
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={() => removeInvoice(r.id)} className="text-ink/25 hover:text-red-500 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )
            }
          ]}
        />
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New Invoice">
        <QuickAddForm
          submitLabel="Create Invoice"
          onSubmit={addInvoice}
          fields={[
            { key: 'client', label: 'Client', type: 'select', options: clients.map((c) => c.name) },
            { key: 'amount', label: 'Amount ($)', type: 'number', placeholder: '3200' },
            { key: 'date', label: 'Date', placeholder: 'e.g. Aug 10', required: false }
          ]}
        />
      </Modal>
    </div>
  )
}
