import { useEffect, useState, useMemo } from 'react'
import { Search, Save, Loader2, CheckCircle2, History, RotateCcw, ChevronDown } from 'lucide-react'
import { api } from '../../lib/api'

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function OperatingManual() {
  const [sections, setSections] = useState([])
  const [query, setQuery] = useState('')
  const [loadingList, setLoadingList] = useState(true)
  const [selectedKey, setSelectedKey] = useState(null)
  const [detail, setDetail] = useState(null)
  const [content, setContent] = useState('')
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [expandedVersion, setExpandedVersion] = useState(null)

  function loadList(q) {
    setLoadingList(true)
    api.listBrainSections(q)
      .then(({ sections }) => setSections(sections))
      .catch((err) => setError(err.message))
      .finally(() => setLoadingList(false))
  }

  useEffect(() => {
    const id = setTimeout(() => loadList(query), 250)
    return () => clearTimeout(id)
  }, [query])

  function openSection(key) {
    setSelectedKey(key)
    setLoadingDetail(true)
    setSaved(false)
    setHistoryOpen(false)
    setExpandedVersion(null)
    api.getBrainSection(key)
      .then(({ section, versions }) => {
        setDetail({ ...section, versions })
        setContent(section.content || '')
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingDetail(false))
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const { section } = await api.updateBrainSection(selectedKey, content)
      const versions = await api.getBrainSection(selectedKey)
      setDetail({ ...section, versions: versions.versions })
      setSaved(true)
      loadList(query)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function restoreVersion(oldContent) {
    setContent(oldContent)
    setSaving(true)
    try {
      const { section } = await api.updateBrainSection(selectedKey, oldContent)
      const versions = await api.getBrainSection(selectedKey)
      setDetail({ ...section, versions: versions.versions })
      setSaved(true)
      loadList(query)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const grouped = useMemo(() => {
    const map = {}
    for (const s of sections) {
      if (!map[s.group]) map[s.group] = []
      map[s.group].push(s)
    }
    return map
  }, [sections])

  const dirty = detail && content !== (detail.content || '')

  return (
    <div className="grid lg:grid-cols-[320px_1fr] gap-6">
      {/* left: search + grouped list */}
      <div className="rounded-2xl border border-line bg-white shadow-card overflow-hidden flex flex-col max-h-[70vh]">
        <div className="p-3 border-b border-line">
          <div className="relative">
            <Search className="w-4 h-4 text-ink/30 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the manual..."
              className="w-full rounded-lg border border-line pl-9 pr-3 py-2 text-sm outline-none focus:border-ferozi focus:ring-2 focus:ring-ferozi/20 transition-all"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loadingList ? (
            <div className="flex items-center gap-2 text-sm text-ink/40 py-8 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading...
            </div>
          ) : sections.length === 0 ? (
            <p className="text-sm text-ink/35 text-center py-8">No sections match "{query}".</p>
          ) : (
            Object.entries(grouped).map(([group, items]) => (
              <div key={group} className="mb-3">
                <p className="px-2 mb-1 font-mono text-[10px] tracking-wideish uppercase text-ink/35">{group}</p>
                {items.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => openSection(s.key)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between gap-2 ${
                      selectedKey === s.key ? 'bg-ink text-white' : 'text-ink/75 hover:bg-mist'
                    }`}
                  >
                    <span className="truncate">{s.title}</span>
                    {s.content && (
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${selectedKey === s.key ? 'bg-ferozi-glow' : 'bg-ferozi'}`} />
                    )}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {/* right: editor */}
      <div className="rounded-2xl border border-line bg-white shadow-card p-6 sm:p-8 min-h-[70vh]">
        {!selectedKey ? (
          <div className="h-full flex items-center justify-center text-center text-sm text-ink/35 py-20">
            Pick a section on the left to read or edit it.
          </div>
        ) : loadingDetail ? (
          <div className="flex items-center gap-2 text-sm text-ink/40 py-20 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading section...
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between gap-4 mb-1">
              <h3 className="font-display font-semibold text-xl">{detail.title}</h3>
              <button
                onClick={() => setHistoryOpen((v) => !v)}
                className="flex items-center gap-1.5 text-xs font-semibold text-ink/50 hover:text-ferozi-deep transition-colors shrink-0"
              >
                <History className="w-3.5 h-3.5" />
                {detail.versionCount || 0} version{detail.versionCount === 1 ? '' : 's'}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${historyOpen ? 'rotate-180' : ''}`} />
              </button>
            </div>
            <p className="text-xs text-ink/40 mb-5">Last updated {timeAgo(detail.updatedAt)}</p>

            {historyOpen && (
              <div className="mb-5 rounded-xl border border-line bg-mist p-3 space-y-2 max-h-64 overflow-y-auto">
                {(!detail.versions || detail.versions.length === 0) && (
                  <p className="text-xs text-ink/40 px-2 py-2">No edits yet — this is the first version.</p>
                )}
                {detail.versions?.map((v) => (
                  <div key={v.id} className="rounded-lg bg-white border border-line p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-ink/50">
                        {timeAgo(v.createdAt)}{v.editedByEmail ? ` · ${v.editedByEmail}` : ''}
                      </p>
                      <div className="flex items-center gap-3 shrink-0">
                        <button
                          onClick={() => setExpandedVersion(expandedVersion === v.id ? null : v.id)}
                          className="text-xs font-semibold text-ink/50 hover:text-ink"
                        >
                          {expandedVersion === v.id ? 'Hide' : 'View'}
                        </button>
                        <button
                          onClick={() => restoreVersion(v.content)}
                          className="flex items-center gap-1 text-xs font-semibold text-ferozi-deep hover:underline"
                        >
                          <RotateCcw className="w-3 h-3" /> Restore
                        </button>
                      </div>
                    </div>
                    {expandedVersion === v.id && (
                      <p className="mt-2 text-xs text-ink/60 whitespace-pre-wrap border-t border-line pt-2">
                        {v.content || <span className="italic text-ink/30">Empty</span>}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            <textarea
              rows={16}
              value={content}
              onChange={(e) => { setContent(e.target.value); setSaved(false) }}
              placeholder={`Write ${detail.title} here...`}
              className="w-full rounded-lg border border-line px-4 py-3 text-sm outline-none focus:border-ferozi focus:ring-2 focus:ring-ferozi/20 transition-all resize-y font-mono leading-relaxed"
            />

            <div className="mt-4 flex items-center justify-between gap-4">
              <div className="text-sm text-ink/50">
                {error ? <span className="text-red-600">{error}</span>
                  : saved ? <span className="flex items-center gap-1.5 text-green-600"><CheckCircle2 className="w-4 h-4" /> Saved</span>
                  : dirty ? 'Unsaved changes' : 'No changes'}
              </div>
              <button
                onClick={handleSave}
                disabled={!dirty || saving}
                className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Saving...' : 'Save section'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
