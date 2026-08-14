import { useEffect, useState } from 'react'
import { Brain, Save, Loader2, CheckCircle2, Contact, FolderKanban, Receipt, TrendingUp, FileText, Building2 } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Badge from '../../components/ui/Badge'
import Reveal from '../../components/ui/Reveal'
import { api } from '../../lib/api'
import { useWorkspace } from '../../lib/WorkspaceContext'
import OperatingManual from './OperatingManual'

const SECTIONS = [
  {
    title: 'Identity',
    fields: [
      { key: 'companyName', label: 'Company Name', type: 'input' },
      { key: 'industry', label: 'Industry', type: 'input' },
      { key: 'mission', label: 'Mission', type: 'textarea' },
      { key: 'vision', label: 'Vision', type: 'textarea' },
      { key: 'goals', label: 'Goals', type: 'textarea' },
      { key: 'coreValues', label: 'Core Values', type: 'textarea' }
    ]
  },
  {
    title: 'Voice & Style',
    fields: [
      { key: 'brandVoice', label: 'Brand Voice', type: 'textarea' },
      { key: 'tone', label: 'Tone', type: 'textarea' },
      { key: 'writingStyle', label: 'Writing Style', type: 'textarea' }
    ]
  },
  {
    title: 'Offer & Audience',
    fields: [
      { key: 'services', label: 'Services', type: 'textarea' },
      { key: 'products', label: 'Products', type: 'textarea' },
      { key: 'targetAudience', label: 'Target Audience', type: 'textarea' },
      { key: 'pricing', label: 'Pricing', type: 'textarea' },
      { key: 'packages', label: 'Packages', type: 'textarea' }
    ]
  },
  {
    title: 'Operations',
    fields: [
      { key: 'workingHours', label: 'Working Hours', type: 'input' },
      { key: 'processes', label: 'Processes', type: 'textarea' },
      { key: 'rules', label: 'Business Rules', type: 'textarea' },
      { key: 'employeesNotes', label: 'Employees — Notes', type: 'textarea' },
      { key: 'clientsNotes', label: 'Clients — Notes', type: 'textarea' }
    ]
  },
  {
    title: 'Custom',
    fields: [
      { key: 'customInstructions', label: 'Custom Instructions', type: 'textarea' },
      { key: 'businessInfo', label: 'Other Business Information', type: 'textarea' }
    ]
  }
]

const EMPTY = SECTIONS.flatMap((s) => s.fields).reduce((acc, f) => ({ ...acc, [f.key]: '' }), {})

export default function CompanyBrain() {
  const { collapsed } = useWorkspace()
  const [tab, setTab] = useState('profile')
  const [form, setForm] = useState(EMPTY)
  const [original, setOriginal] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [metrics, setMetrics] = useState(null)

  useEffect(() => {
    api.getBrain()
      .then(({ brain }) => {
        const { id, updatedAt, ...fields } = brain
        setForm(fields)
        setOriginal(fields)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))

    // Secondary, decorative panel only (the main form's own error handling
    // above is unaffected) — degrades gracefully by simply not showing the
    // snapshot, but still logs so a real failure isn't invisible in devtools.
    api.getMetrics().then(setMetrics).catch((err) => console.error('Company Brain: failed to load business snapshot:', err))
  }, [])

  const dirty = JSON.stringify(form) !== JSON.stringify(original)

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const { brain } = await api.updateBrain(form)
      const { id, updatedAt, ...fields } = brain
      setForm(fields)
      setOriginal(fields)
      setSaved(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Company Brain"
        title="The business context every future AI module reads from."
        description="Real and persisted — not AI logic yet. This is the structured record future modules (Marketing AI, Sales AI, and eventually CEO AI) will read once they're built."
        actions={<Badge tone="ferozi" dot><Brain className="w-3 h-3 mr-1 inline" />Persisted</Badge>}
      />

      {metrics && (
        <Reveal>
          <div className="mb-6 rounded-2xl border border-line bg-mist p-5">
            <div className="flex items-center gap-2 mb-4">
              <Brain className="w-4 h-4 text-ferozi-deep" />
              <p className="text-sm font-medium text-ink">
                Live Business Snapshot — what Company Brain will summarize once it becomes the single source of truth
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="rounded-xl bg-white border border-line p-4">
                <Contact className="w-4 h-4 text-ferozi-deep mb-2" />
                <p className="font-display font-bold text-xl">{metrics.clients.total}</p>
                <p className="text-xs text-ink/45">Clients on file</p>
              </div>
              <div className="rounded-xl bg-white border border-line p-4">
                <FolderKanban className="w-4 h-4 text-ferozi-deep mb-2" />
                <p className="font-display font-bold text-xl">{metrics.projects.total}</p>
                <p className="text-xs text-ink/45">Projects tracked</p>
              </div>
              <div className="rounded-xl bg-white border border-line p-4">
                <Receipt className="w-4 h-4 text-ferozi-deep mb-2" />
                <p className="font-display font-bold text-xl">{metrics.invoices.total}</p>
                <p className="text-xs text-ink/45">Invoices issued</p>
              </div>
              <div className="rounded-xl bg-white border border-line p-4">
                <TrendingUp className="w-4 h-4 text-ferozi-deep mb-2" />
                <p className="font-display font-bold text-xl">${metrics.mrr.toLocaleString()}</p>
                <p className="text-xs text-ink/45">Current MRR</p>
              </div>
            </div>
            <p className="mt-4 text-xs text-ink/40">
              These counts are read live from the real Clients/Projects/Invoices/Deals tables via{' '}
              <code className="font-mono">GET /api/metrics</code> — proving the data Company Brain will need to reason
              over already exists and is queryable. No summarization or decision-making happens yet.
            </p>
          </div>
        </Reveal>
      )}

      <div className="flex items-center gap-1 p-1 rounded-lg bg-mist border border-line mb-6 w-fit">
        <button
          onClick={() => setTab('profile')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-colors ${
            tab === 'profile' ? 'bg-white shadow-sm text-ink' : 'text-ink/45 hover:text-ink/70'
          }`}
        >
          <Building2 className="w-4 h-4" /> Business Profile
        </button>
        <button
          onClick={() => setTab('manual')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-colors ${
            tab === 'manual' ? 'bg-white shadow-sm text-ink' : 'text-ink/45 hover:text-ink/70'
          }`}
        >
          <FileText className="w-4 h-4" /> Operating Manual
        </button>
      </div>

      {tab === 'manual' ? (
        <OperatingManual />
      ) : loading ? (
        <div className="flex items-center gap-2 text-sm text-ink/40 py-12 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading Company Brain...
        </div>
      ) : (
        <div className="space-y-6 pb-24">
          {SECTIONS.map((section, si) => (
            <Reveal key={section.title} delay={0.05 * si}>
              <div className="rounded-2xl border border-line bg-white shadow-card p-6 sm:p-8">
                <h3 className="font-display font-semibold text-lg mb-5">{section.title}</h3>
                <div className="grid sm:grid-cols-2 gap-5">
                  {section.fields.map((field) => (
                    <div key={field.key} className={field.type === 'textarea' ? 'sm:col-span-2' : ''}>
                      <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">{field.label}</label>
                      {field.type === 'textarea' ? (
                        <textarea
                          rows={3}
                          value={form[field.key] || ''}
                          onChange={(e) => update(field.key, e.target.value)}
                          className="mt-2 w-full rounded-lg border border-line px-4 py-2.5 text-sm outline-none focus:border-ferozi focus:ring-2 focus:ring-ferozi/20 transition-all resize-y"
                        />
                      ) : (
                        <input
                          type="text"
                          value={form[field.key] || ''}
                          onChange={(e) => update(field.key, e.target.value)}
                          className="mt-2 w-full rounded-lg border border-line px-4 py-2.5 text-sm outline-none focus:border-ferozi focus:ring-2 focus:ring-ferozi/20 transition-all"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      )}

      {!loading && tab === 'profile' && (
        <div className={`fixed bottom-0 left-0 right-0 z-20 transition-all duration-300 ${collapsed ? 'lg:left-[76px]' : 'lg:left-64'}`}>
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pb-6">
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-white shadow-panel px-5 py-3.5">
              <div className="text-sm text-ink/50">
                {error ? <span className="text-red-600">{error}</span>
                  : saved ? <span className="flex items-center gap-1.5 text-green-600"><CheckCircle2 className="w-4 h-4" /> Saved</span>
                  : dirty ? 'Unsaved changes' : 'All changes saved'}
              </div>
              <button
                onClick={handleSave}
                disabled={!dirty || saving}
                className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
