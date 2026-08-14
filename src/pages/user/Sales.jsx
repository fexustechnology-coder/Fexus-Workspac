import { useEffect, useState } from 'react'
import PageHeader from '../../components/ui/PageHeader'
import Reveal from '../../components/ui/Reveal'
import Modal from '../../components/ui/Modal'
import QuickAddForm from '../../components/ui/QuickAddForm'
import { Plus, Trash2, Loader2 } from 'lucide-react'
import { api } from '../../lib/api'

const STAGES = ['Discovery', 'Proposal Sent', 'Negotiation', 'Closed Won']

export default function Sales() {
  const [deals, setDeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const total = deals.reduce((s, d) => s + d.value, 0)

  function load() {
    setLoading(true)
    api.deals.list()
      .then(({ items }) => setDeals(items))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function addDeal(values) {
    try {
      await api.deals.create({ name: values.name, stage: values.stage, value: Number(values.value) || 0, owner: values.owner })
      setOpen(false)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function setStage(deal, stage) {
    await api.deals.update(deal.id, { stage })
    load()
  }

  async function removeDeal(id) {
    await api.deals.remove(id)
    load()
  }

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Sales"
        description={`Pipeline value: $${total.toLocaleString()} across ${deals.length} active deals. Sales AI connects here in a future phase.`}
        actions={
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors"
          >
            <Plus className="w-4 h-4" /> New Deal
          </button>
        }
      />

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-ink/40 py-12 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading deals...
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {STAGES.map((stage, colIdx) => {
            const items = deals.filter((d) => d.stage === stage)
            return (
              <Reveal key={stage} delay={0.05 * colIdx}>
                <div className="rounded-2xl border border-line bg-mist/60 p-4 h-full min-h-[300px]">
                  <div className="flex items-center justify-between mb-4 px-1">
                    <span className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">{stage}</span>
                    <span className="text-xs font-semibold text-ink/40">{items.length}</span>
                  </div>
                  <div className="space-y-3">
                    {items.map((d) => (
                      <div key={d.id} className="rounded-xl bg-white border border-line p-4 shadow-card">
                        <div className="flex items-center justify-between">
                          <select
                            value={d.stage}
                            onChange={(e) => setStage(d, e.target.value)}
                            className="font-mono text-[9px] uppercase tracking-wideish bg-transparent outline-none text-ink/40"
                          >
                            {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <button onClick={() => removeDeal(d.id)} className="text-ink/25 hover:text-red-500 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <p className="text-sm font-semibold text-ink mt-1">{d.name}</p>
                        <p className="text-xs text-ink/45 mt-1">{d.owner}</p>
                        <p className="mt-3 font-display font-semibold text-ferozi-deep">${d.value.toLocaleString()}</p>
                      </div>
                    ))}
                    {items.length === 0 && <p className="text-xs text-ink/35 px-1">No deals in this stage.</p>}
                  </div>
                </div>
              </Reveal>
            )
          })}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New Deal">
        <QuickAddForm
          submitLabel="Add Deal"
          onSubmit={addDeal}
          fields={[
            { key: 'name', label: 'Deal name', placeholder: 'e.g. Solstice Group' },
            { key: 'stage', label: 'Stage', type: 'select', options: STAGES },
            { key: 'value', label: 'Value ($)', type: 'number', placeholder: '12000' },
            { key: 'owner', label: 'Owner', placeholder: 'e.g. J. Blake', required: false }
          ]}
        />
      </Modal>
    </div>
  )
}
