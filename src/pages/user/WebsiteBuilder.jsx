import { useEffect, useState } from 'react'
import PageHeader from '../../components/ui/PageHeader'
import Reveal from '../../components/ui/Reveal'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import QuickAddForm from '../../components/ui/QuickAddForm'
import { Plus, Globe, Trash2, Loader2 } from 'lucide-react'
import { api } from '../../lib/api'

export default function WebsiteBuilder() {
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')

  function load() {
    setLoading(true)
    api.sites.list()
      .then(({ items }) => setSites(items))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function addSite(values) {
    try {
      await api.sites.create({ name: values.name, domain: values.domain, status: 'Draft' })
      setOpen(false)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function toggleStatus(site) {
    await api.sites.update(site.id, { status: site.status === 'Live' ? 'Draft' : 'Live' })
    load()
  }

  async function removeSite(id) {
    await api.sites.remove(id)
    load()
  }

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Website Builder"
        description="Manage every site your team maintains. Website AI connects here in a future phase."
        actions={
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors"
          >
            <Plus className="w-4 h-4" /> New Site
          </button>
        }
      />

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-ink/40 py-12 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading sites...
        </div>
      ) : sites.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line p-12 text-center text-sm text-ink/40">
          No sites yet. Add your first one to see it here.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {sites.map((s, i) => (
            <Reveal key={s.id} delay={0.05 * i}>
              <div className="rounded-2xl border border-line bg-white shadow-card overflow-hidden hover:shadow-card-hover transition-shadow group relative">
                <button
                  onClick={() => removeSite(s.id)}
                  className="absolute top-3 right-3 z-10 w-7 h-7 rounded-lg bg-white/90 flex items-center justify-center text-ink/30 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <div className="h-32 bg-mist flex items-center justify-center border-b border-line">
                  <Globe className="w-8 h-8 text-ink/20" />
                </div>
                <div className="p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display font-semibold">{s.name}</h3>
                    <button onClick={() => toggleStatus(s)}>
                      <Badge tone={s.status === 'Live' ? 'success' : 'neutral'} dot>{s.status}</Badge>
                    </button>
                  </div>
                  <p className="text-sm text-ink/45 mt-1 font-mono">{s.domain}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New Site">
        <QuickAddForm
          submitLabel="Create Site"
          onSubmit={addSite}
          fields={[
            { key: 'name', label: 'Site name', placeholder: 'e.g. Careers Page' },
            { key: 'domain', label: 'Domain', placeholder: 'e.g. careers.fexus.ai' }
          ]}
        />
      </Modal>
    </div>
  )
}
