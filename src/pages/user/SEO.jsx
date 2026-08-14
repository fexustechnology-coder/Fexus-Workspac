import { useEffect, useState } from 'react'
import PageHeader from '../../components/ui/PageHeader'
import Reveal from '../../components/ui/Reveal'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import QuickAddForm from '../../components/ui/QuickAddForm'
import { Plus, Trash2, Loader2 } from 'lucide-react'
import { api } from '../../lib/api'

function scoreTone(score) {
  if (score >= 90) return 'success'
  if (score >= 80) return 'ferozi'
  return 'warning'
}

export default function SEO() {
  const [audits, setAudits] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')

  function load() {
    setLoading(true)
    api.seoAudits.list()
      .then(({ items }) => setAudits(items))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function addAudit(values) {
    try {
      await api.seoAudits.create({ page: values.page, score: Number(values.score) || 0, issues: Number(values.issues) || 0 })
      setOpen(false)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function removeAudit(id) {
    await api.seoAudits.remove(id)
    load()
  }

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="SEO"
        description="Page-by-page health checks across your site. SEO AI connects here in a future phase."
        actions={
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors"
          >
            <Plus className="w-4 h-4" /> Log Audit
          </button>
        }
      />

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-ink/40 py-12 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading audits...
        </div>
      ) : audits.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line p-12 text-center text-sm text-ink/40">
          No audits logged yet. Log your first page's score to see it here.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {audits.map((a, i) => (
            <Reveal key={a.id} delay={0.05 * i}>
              <div className="rounded-2xl border border-line bg-white p-6 shadow-card hover:shadow-card-hover transition-shadow relative group">
                <button
                  onClick={() => removeAudit(a.id)}
                  className="absolute top-4 right-4 text-ink/20 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <p className="font-mono text-xs text-ink/45">{a.page}</p>
                <div className="mt-4 flex items-end gap-2">
                  <span className="font-display font-bold text-4xl text-ink">{a.score}</span>
                  <span className="text-ink/35 text-sm mb-1">/100</span>
                </div>
                <div className="mt-3 h-1.5 rounded-full bg-mist overflow-hidden">
                  <div className="h-full rounded-full bg-ferozi" style={{ width: `${a.score}%` }} />
                </div>
                <div className="mt-4">
                  <Badge tone={scoreTone(a.score)} dot>{a.issues} issue{a.issues !== 1 ? 's' : ''}</Badge>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Log SEO Audit">
        <QuickAddForm
          submitLabel="Log Audit"
          onSubmit={addAudit}
          fields={[
            { key: 'page', label: 'Page path', placeholder: 'e.g. /pricing' },
            { key: 'score', label: 'Score (0-100)', type: 'number', placeholder: '92' },
            { key: 'issues', label: 'Issues found', type: 'number', placeholder: '1', required: false }
          ]}
        />
      </Modal>
    </div>
  )
}
