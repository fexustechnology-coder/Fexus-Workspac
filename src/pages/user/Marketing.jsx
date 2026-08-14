import { useEffect, useState } from 'react'
import PageHeader from '../../components/ui/PageHeader'
import Badge from '../../components/ui/Badge'
import Reveal from '../../components/ui/Reveal'
import Modal from '../../components/ui/Modal'
import QuickAddForm from '../../components/ui/QuickAddForm'
import { Plus, Megaphone, Trash2, Loader2 } from 'lucide-react'
import { api } from '../../lib/api'

const TONE = { Live: 'success', Scheduled: 'ferozi', Draft: 'neutral' }
const STATUSES = ['Draft', 'Scheduled', 'Live']

export default function Marketing() {
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')

  function load() {
    setLoading(true)
    api.campaigns.list()
      .then(({ items }) => setCampaigns(items))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function addCampaign(values) {
    try {
      await api.campaigns.create({ name: values.name, channel: values.channel, status: values.status, reach: '—' })
      setOpen(false)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function removeCampaign(id) {
    await api.campaigns.remove(id)
    load()
  }

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Marketing"
        description="Campaigns and content, organized in one place. Marketing AI connects here in a future phase."
        actions={
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors"
          >
            <Plus className="w-4 h-4" /> New Campaign
          </button>
        }
      />

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-ink/40 py-12 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading campaigns...
        </div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line p-12 text-center text-sm text-ink/40">
          No campaigns yet. Create your first one to see it here.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {campaigns.map((c, i) => (
            <Reveal key={c.id} delay={0.05 * i}>
              <div className="rounded-2xl border border-line bg-white p-6 shadow-card hover:shadow-card-hover transition-shadow h-full relative group">
                <button
                  onClick={() => removeCampaign(c.id)}
                  className="absolute top-4 right-4 text-ink/20 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <span className="w-10 h-10 rounded-xl bg-ferozi-soft flex items-center justify-center">
                  <Megaphone className="w-5 h-5 text-ferozi-deep" />
                </span>
                <h3 className="mt-4 font-display font-semibold">{c.name}</h3>
                <p className="mt-1 text-sm text-ink/50">{c.channel}</p>
                <div className="mt-4 flex items-center justify-between">
                  <Badge tone={TONE[c.status]} dot>{c.status}</Badge>
                  <span className="text-xs text-ink/40">Reach: {c.reach}</span>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New Campaign">
        <QuickAddForm
          submitLabel="Create Campaign"
          onSubmit={addCampaign}
          fields={[
            { key: 'name', label: 'Campaign name', placeholder: 'e.g. Winter Sale Push' },
            { key: 'channel', label: 'Channel', placeholder: 'e.g. Email + Social' },
            { key: 'status', label: 'Status', type: 'select', options: STATUSES }
          ]}
        />
      </Modal>
    </div>
  )
}
