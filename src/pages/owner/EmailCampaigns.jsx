import { useEffect, useRef, useState } from 'react'
import {
  Plus, Upload, Users, Send, Pause, Play, Square, RotateCcw, RefreshCw,
  Download, Loader2, ChevronRight, ChevronLeft, X, Trash2, Eye, CheckCircle2, Sparkles
} from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import ConnectedEmailsManager from '../../components/ui/ConnectedEmailsManager'
import { api } from '../../lib/api'

const STATUS_TONE = { Draft: 'neutral', Running: 'ferozi', Paused: 'warning', Completed: 'success', Cancelled: 'neutral', Failed: 'danger' }
const DELAY_PRESETS = [30, 45, 60, 90, 120]
const RANDOM_PRESETS = [[30, 45], [45, 60], [60, 90]]
const LIMIT_PRESETS = [50, 100, 150, 200, 300]

function StatusBadge({ status }) {
  return <Badge tone={STATUS_TONE[status] || 'neutral'} dot={status === 'Running'}>{status}</Badge>
}

// ============================= LIST =============================
function CampaignList({ onOpen, onCreate }) {
  const [campaigns, setCampaigns] = useState(null)
  const [error, setError] = useState('')

  function load() {
    setError('')
    api.emailCampaigns.list().then(({ campaigns }) => setCampaigns(campaigns)).catch((err) => setError(err.message || 'Failed to load campaigns.'))
  }
  useEffect(load, [])

  return (
    <div>
      <PageHeader
        eyebrow="Growth AI — Email"
        title="Campaigns"
        description="Real, sequential, rate-limited sending through your connected Gmail account — not a simulation."
        actions={
          <button onClick={onCreate} className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors">
            <Plus className="w-4 h-4" /> Create Campaign
          </button>
        }
      />

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={load} className="mt-3 px-5 py-2 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors">Try again</button>
        </div>
      ) : !campaigns ? (
        <div className="flex items-center gap-2 text-sm text-ink/40 py-16 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-mist p-12 text-center">
          <p className="text-sm text-ink/50">No campaigns yet.</p>
          <button onClick={onCreate} className="mt-4 px-5 py-2 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors">Create your first campaign</button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map((c) => {
            const stats = c.statistics || { loaded: 0, sent: 0, failed: 0 }
            return (
              <button key={c.id} onClick={() => onOpen(c.id)} className="text-left rounded-2xl border border-line bg-white shadow-card p-5 hover:border-ferozi/50 transition-colors">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-display font-semibold">{c.name}</p>
                  <StatusBadge status={c.status} />
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div><p className="text-lg font-bold">{stats.loaded}</p><p className="text-[10px] text-ink/40 uppercase">Loaded</p></div>
                  <div><p className="text-lg font-bold text-ferozi-deep">{stats.sent}</p><p className="text-[10px] text-ink/40 uppercase">Sent</p></div>
                  <div><p className="text-lg font-bold text-red-500">{stats.failed}</p><p className="text-[10px] text-ink/40 uppercase">Failed</p></div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ============================= CREATION WIZARD =============================
function CampaignWizard({ onClose, onCreated }) {
  const [step, setStep] = useState(1)
  const [campaignId, setCampaignId] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const [name, setName] = useState('')
  const [importMode, setImportMode] = useState('csv')
  const [csvText, setCsvText] = useState('')
  const [csvPreview, setCsvPreview] = useState(null)
  const [importProgress, setImportProgress] = useState(null)
  const [manualEmails, setManualEmails] = useState('')
  const [importedCount, setImportedCount] = useState(0)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [signature, setSignature] = useState('')
  const [showTemplates, setShowTemplates] = useState(false)
  const [multiTemplateMode, setMultiTemplateMode] = useState(false)
  const [trackOpens, setTrackOpens] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [delayMode, setDelayMode] = useState('fixed')
  const [delaySeconds, setDelaySeconds] = useState(45)
  const [delayRange, setDelayRange] = useState([30, 45])
  const [dailyLimit, setDailyLimit] = useState(100)
  const [retryLimit, setRetryLimit] = useState(2)
  const [emailsPerSender, setEmailsPerSender] = useState(10)
  const [availableSenders, setAvailableSenders] = useState([])
  const [selectedSenderIds, setSelectedSenderIds] = useState([])

  async function step1Next() {
    if (!name.trim()) return setError('Give the campaign a name.')
    setBusy(true); setError('')
    try {
      const { campaign } = await api.emailCampaigns.create(name.trim())
      setCampaignId(campaign.id)
      setStep(2)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  async function previewImport() {
    setBusy(true); setError(''); setCsvPreview(null)
    try {
      if (importMode === 'csv') {
        if (!csvText.trim()) throw new Error('Upload a CSV file or paste CSV text first.')
        const result = await api.emailCampaigns.previewCsv(campaignId, csvText)
        if (result.totalRows === 0) throw new Error('No valid rows found — check that your CSV has an email column.')
        setCsvPreview(result)
      } else {
        const list = manualEmails.split(/[\n,]/).map((e) => e.trim()).filter((e) => e.includes('@'))
        if (list.length === 0) throw new Error('Enter at least one valid email address.')
        setCsvPreview({ preview: list.map((email) => ({ email })), totalRows: list.length, errors: [], totalErrors: 0 })
      }
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  function handleFileUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => { setCsvText(evt.target.result); setCsvPreview(null); setError('') }
    reader.onerror = () => setError('Failed to read the file — try again or paste the CSV text instead.')
    reader.readAsText(file)
  }

  const CHUNK_SIZE = 1000 // rows per real batch — keeps every request small regardless of total file size

  async function step2Next() {
    setBusy(true); setError(''); setImportProgress(null)
    try {
      if (importMode === 'csv') {
        const lines = csvText.trim().split(/\r?\n/)
        const header = lines[0]
        const dataLines = lines.slice(1).filter((l) => l.trim())
        if (dataLines.length === 0) throw new Error('No data rows found in the CSV.')

        const chunks = []
        for (let i = 0; i < dataLines.length; i += CHUNK_SIZE) chunks.push(dataLines.slice(i, i + CHUNK_SIZE))

        let totalImported = 0, totalSkipped = 0, totalDuplicates = 0, chunkFailures = 0
        for (let c = 0; c < chunks.length; c++) {
          setImportProgress({ processed: c * CHUNK_SIZE, total: dataLines.length, chunk: c + 1, totalChunks: chunks.length })
          try {
            const chunkCsv = [header, ...chunks[c]].join('\n')
            const result = await api.emailCampaigns.importCsv(campaignId, chunkCsv)
            totalImported += result.imported
            totalSkipped += result.skipped || 0
            totalDuplicates += result.duplicates || 0
          } catch (err) {
            // A single bad batch is logged and skipped — it does not
            // abort an otherwise-valid large import, matching the
            // requirement that one bad chunk can't destroy the rest.
            chunkFailures++
            console.error(`Batch ${c + 1}/${chunks.length} failed:`, err.message)
          }
        }
        setImportProgress({ processed: dataLines.length, total: dataLines.length, chunk: chunks.length, totalChunks: chunks.length })

        if (totalImported === 0) throw new Error('No valid emails were found to import.')
        setImportedCount(totalImported)
        if (chunkFailures > 0 || totalSkipped > 0 || totalDuplicates > 0) {
          setError(`Imported ${totalImported} contacts.${chunkFailures ? ` ${chunkFailures} batch(es) failed and were skipped.` : ''}${totalSkipped ? ` ${totalSkipped} row(s) had an invalid email.` : ''}${totalDuplicates ? ` ${totalDuplicates} duplicate email(s) skipped.` : ''} You can still continue.`)
        }
      } else {
        const result = await api.emailCampaigns.importManual(campaignId, manualEmails)
        if (result.imported === 0) throw new Error('No valid emails were found to import.')
        setImportedCount(result.imported)
      }
      setStep(3)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  async function step3Next() {
    if (!multiTemplateMode && (!subject.trim() || !body.trim())) return setError('Write both a subject and a body.')
    setBusy(true); setError('')
    try {
      if (!multiTemplateMode) {
        await api.emailCampaigns.update(campaignId, { subject, body, signature, emailsPerTemplate: 0, trackOpens })
      } else {
        const { templates } = await api.emailCampaigns.listTemplates(campaignId)
        if (templates.length === 0) throw new Error('Add at least one template, or switch back to Single Message.')
        if (templates.some((t) => !t.subject?.trim() || !t.body?.trim())) throw new Error('Every template needs both a subject and a body.')
        await api.emailCampaigns.update(campaignId, { signature, trackOpens })
      }
      setStep(4)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  async function step4Next() {
    setBusy(true); setError('')
    try {
      const data = delayMode === 'fixed' ? { delayMode, delaySeconds } : { delayMode, delayMin: delayRange[0], delayMax: delayRange[1] }
      await api.emailCampaigns.update(campaignId, data)
      setStep(5)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  async function step5Next() {
    setBusy(true); setError('')
    try {
      await api.emailCampaigns.update(campaignId, { dailyLimit, retryLimit })
      try {
        const { senders } = await api.senders.list()
        setAvailableSenders(senders.filter((s) => s.active && s.verificationStatus === 'Verified' && s.connectionStatus === 'Connected'))
      } catch { /* sender list is optional here — rotation step just shows none available */ }
      setStep(6)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  function toggleSender(id) {
    setSelectedSenderIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  async function step6Next() {
    setBusy(true); setError('')
    try {
      if (selectedSenderIds.length === 0) throw new Error('Select at least one Connected Email to send from.')
      await api.emailCampaigns.update(campaignId, { emailsPerSender: selectedSenderIds.length > 1 ? emailsPerSender : 0 })
      await api.emailCampaigns.setSenders(campaignId, selectedSenderIds)
      setStep(7)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  async function launch() {
    setBusy(true); setError('')
    try {
      await api.emailCampaigns.start(campaignId)
      onCreated(campaignId)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const STEP_LABELS = ['Name', 'Recipients', 'Message', 'Delay', 'Daily Limit', 'Senders', 'Launch']

  return (
    <div>
      <button onClick={onClose} className="flex items-center gap-1 text-sm font-semibold text-ink/50 hover:text-ink mb-4"><ChevronLeft className="w-4 h-4" /> Cancel</button>
      <PageHeader eyebrow={`Step ${step} of 7`} title={STEP_LABELS[step - 1]} description="Full-page campaign setup — every field has room to breathe." />

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8 flex-wrap">
        {STEP_LABELS.map((label, i) => (
          <div key={label} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${i + 1 === step ? 'bg-ink text-white' : i + 1 < step ? 'bg-ferozi-soft text-ferozi-deep' : 'bg-mist text-ink/35'}`}>
            {i + 1 < step && <CheckCircle2 className="w-3 h-3" />} {label}
          </div>
        ))}
      </div>

      <div className="max-w-4xl">
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-6">{error}</p>}

        {step === 1 && (
          <div className="rounded-2xl border border-line bg-white shadow-card p-8 max-w-xl">
            <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Campaign Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Q3 Agency Outreach" className="mt-2 w-full rounded-lg border border-line px-4 py-3 text-base outline-none focus:border-ferozi" />
          </div>
        )}

        {step === 2 && (
          <div className="rounded-2xl border border-line bg-white shadow-card p-8 space-y-5">
            <div className="flex items-center gap-1 p-1 rounded-lg bg-mist border border-line w-fit">
              <button onClick={() => { setImportMode('csv'); setCsvPreview(null) }} className={`px-4 py-2 rounded-md text-sm font-semibold ${importMode === 'csv' ? 'bg-white shadow-sm' : 'text-ink/45'}`}>CSV Upload</button>
              <button onClick={() => { setImportMode('manual'); setCsvPreview(null) }} className={`px-4 py-2 rounded-md text-sm font-semibold ${importMode === 'manual' ? 'bg-white shadow-sm' : 'text-ink/45'}`}>Manual Entry</button>
            </div>

            {importMode === 'csv' ? (
              <div className="space-y-3">
                <div>
                  <label className="flex items-center justify-center gap-2 w-full rounded-xl border-2 border-dashed border-line hover:border-ferozi transition-colors py-8 cursor-pointer text-sm text-ink/50">
                    <Upload className="w-4 h-4" /> Upload a CSV file (from Google Sheets, Excel, etc.)
                    <input type="file" accept=".csv,text/csv" onChange={handleFileUpload} className="hidden" />
                  </label>
                </div>
                <div>
                  <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Or paste CSV text</label>
                  <textarea value={csvText} onChange={(e) => { setCsvText(e.target.value); setCsvPreview(null) }} rows={6} className="mt-2 w-full rounded-lg border border-line px-4 py-3 text-xs font-mono outline-none focus:border-ferozi" placeholder={'Name,Email,Company,Phone\nJohn Smith,john@company.com,Acme Co,555-1234'} />
                  <p className="text-xs text-ink/40 mt-1">Accepted headers: Name / Full Name / First Name, Email / Email Address, Company, Phone.</p>
                </div>
              </div>
            ) : (
              <textarea value={manualEmails} onChange={(e) => { setManualEmails(e.target.value); setCsvPreview(null) }} rows={6} className="w-full rounded-lg border border-line px-4 py-3 text-sm outline-none focus:border-ferozi" placeholder={'one@company.com\ntwo@company.com'} />
            )}

            <button onClick={previewImport} disabled={busy} className="px-5 py-2.5 rounded-full border border-line text-sm font-semibold hover:border-ferozi transition-colors disabled:opacity-50">
              {busy ? 'Parsing...' : 'Preview Recipients'}
            </button>

            {csvPreview && (
              <div>
                <p className="text-sm font-semibold mb-2">{csvPreview.totalRows} recipient{csvPreview.totalRows === 1 ? '' : 's'} ready{csvPreview.totalErrors > 0 ? ` · ${csvPreview.totalErrors} row(s) skipped` : ''}</p>
                <div className="rounded-xl border border-line overflow-x-auto max-h-72 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-mist sticky top-0">
                      <tr>
                        {Object.keys(csvPreview.preview[0] || { email: '' }).map((k) => (
                          <th key={k} className="px-3 py-2 text-left font-mono uppercase text-[10px] text-ink/40">{k}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {csvPreview.preview.map((row, i) => (
                        <tr key={i}>
                          {Object.keys(csvPreview.preview[0] || { email: '' }).map((k) => (
                            <td key={k} className="px-3 py-2 text-ink/70">{row[k] || '—'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {csvPreview.totalRows > csvPreview.preview.length && <p className="text-xs text-ink/35 mt-1">Showing first {csvPreview.preview.length} of {csvPreview.totalRows}.</p>}
              </div>
            )}
          </div>
        )}

        {step === 3 && !showTemplates && (
          <div className="space-y-5">
            <div className="flex items-center gap-1 p-1 rounded-lg bg-mist border border-line w-fit">
              <button onClick={() => setMultiTemplateMode(false)} className={`px-4 py-2 rounded-md text-sm font-semibold ${!multiTemplateMode ? 'bg-white shadow-sm' : 'text-ink/45'}`}>Single Message</button>
              <button onClick={() => setMultiTemplateMode(true)} className={`px-4 py-2 rounded-md text-sm font-semibold ${multiTemplateMode ? 'bg-white shadow-sm' : 'text-ink/45'}`}>Multiple Templates</button>
            </div>

            {!multiTemplateMode ? (
              <div className="rounded-2xl border border-line bg-white shadow-card p-8 space-y-5">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <p className="text-sm text-ink/50">{importedCount} contacts imported. Use {'{name}'}, {'{email}'}, {'{company}'}, {'{phone}'}, or any CSV column as a merge field.</p>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setShowTemplates(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-line text-xs font-semibold hover:border-ferozi transition-colors"><Sparkles className="w-3.5 h-3.5" /> Browse Templates</button>
                    <button onClick={() => setPreviewOpen(true)} disabled={!subject && !body} className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-line text-xs font-semibold hover:border-ferozi transition-colors disabled:opacity-40"><Eye className="w-3.5 h-3.5" /> Preview as Recipient</button>
                  </div>
                </div>
                <div>
                  <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Subject</label>
                  <input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-2 w-full rounded-lg border border-line px-4 py-3 text-base outline-none focus:border-ferozi" />
                </div>
                <div>
                  <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Body</label>
                  <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} className="mt-2 w-full rounded-lg border border-line px-4 py-3 text-sm outline-none focus:border-ferozi font-mono" />
                </div>
                <div>
                  <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Signature (optional)</label>
                  <textarea value={signature} onChange={(e) => setSignature(e.target.value)} rows={3} className="mt-2 w-full rounded-lg border border-line px-4 py-3 text-sm outline-none focus:border-ferozi" />
                </div>
              </div>
            ) : (
              <TemplateManager campaignId={campaignId} importedCount={importedCount} />
            )}

            <div className="rounded-2xl border border-line bg-white shadow-card p-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Track opens</p>
                <p className="text-xs text-ink/40 mt-0.5">Adds a real, invisible tracking pixel to each email. Depends on the recipient's mail client loading it — never 100% accurate (image blocking, privacy-preserving clients).</p>
              </div>
              <button onClick={() => setTrackOpens(!trackOpens)} className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${trackOpens ? 'bg-ferozi' : 'bg-line'}`}>
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${trackOpens ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>
        )}

        {step === 3 && showTemplates && (
          <TemplateLibraryPicker
            onBack={() => setShowTemplates(false)}
            onUse={(t) => { setSubject(t.subject); setBody(t.body); setShowTemplates(false) }}
          />
        )}

        {step === 4 && (
          <div className="rounded-2xl border border-line bg-white shadow-card p-8 space-y-5 max-w-xl">
            <div className="flex items-center gap-1 p-1 rounded-lg bg-mist border border-line w-fit">
              <button onClick={() => setDelayMode('fixed')} className={`px-4 py-2 rounded-md text-sm font-semibold ${delayMode === 'fixed' ? 'bg-white shadow-sm' : 'text-ink/45'}`}>Fixed Delay</button>
              <button onClick={() => setDelayMode('random')} className={`px-4 py-2 rounded-md text-sm font-semibold ${delayMode === 'random' ? 'bg-white shadow-sm' : 'text-ink/45'}`}>Random Delay</button>
            </div>
            {delayMode === 'fixed' ? (
              <div className="flex flex-wrap gap-2">
                {DELAY_PRESETS.map((s) => (
                  <button key={s} onClick={() => setDelaySeconds(s)} className={`px-4 py-2 rounded-full text-sm font-semibold border ${delaySeconds === s ? 'bg-ink text-white border-ink' : 'border-line text-ink/60'}`}>{s} sec</button>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {RANDOM_PRESETS.map(([lo, hi]) => (
                  <button key={lo} onClick={() => setDelayRange([lo, hi])} className={`px-4 py-2 rounded-full text-sm font-semibold border ${delayRange[0] === lo && delayRange[1] === hi ? 'bg-ink text-white border-ink' : 'border-line text-ink/60'}`}>{lo}–{hi} sec</button>
                ))}
              </div>
            )}
            <p className="text-sm text-ink/40">A real random or fixed wait between each send — this is what keeps sending looking natural instead of instantaneous.</p>
          </div>
        )}

        {step === 5 && (
          <div className="rounded-2xl border border-line bg-white shadow-card p-8 space-y-5 max-w-xl">
            <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Daily Sending Limit</label>
            <div className="flex flex-wrap gap-2">
              {LIMIT_PRESETS.map((n) => (
                <button key={n} onClick={() => setDailyLimit(n)} className={`px-4 py-2 rounded-full text-sm font-semibold border ${dailyLimit === n ? 'bg-ink text-white border-ink' : 'border-line text-ink/60'}`}>{n}/day</button>
              ))}
            </div>
            <p className="text-sm text-ink/40">The campaign never exceeds this in one day — it pauses automatically and resumes the next day, with no action needed from you.</p>
            <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Retry Failed Emails</label>
            <div className="flex gap-2">
              {[1, 2, 3].map((n) => (
                <button key={n} onClick={() => setRetryLimit(n)} className={`px-4 py-2 rounded-full text-sm font-semibold border ${retryLimit === n ? 'bg-ink text-white border-ink' : 'border-line text-ink/60'}`}>{n}x</button>
              ))}
            </div>
          </div>
        )}

        {step === 6 && (
          <div className="rounded-2xl border border-line bg-white shadow-card p-8 space-y-5 max-w-xl">
            <div>
              <p className="text-sm font-semibold">Which Connected Emails should send this campaign?</p>
              <p className="text-sm text-ink/40 mt-0.5">Campaigns only ever send from real Connected Emails — never from your own login email. Select one or more.</p>
            </div>

            <div>
              <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Select Senders</label>
              {availableSenders.length === 0 ? (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mt-2">
                  No connected, verified senders available yet — go to the "Connected Emails" tab and connect at least one via SMTP or Google first.
                </p>
              ) : (
                <div className="mt-2 space-y-2 max-h-52 overflow-y-auto">
                  {availableSenders.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={selectedSenderIds.includes(s.id)} onChange={() => toggleSender(s.id)} />
                      {s.displayName || s.email}
                    </label>
                  ))}
                </div>
              )}
            </div>

            {selectedSenderIds.length > 1 && (
              <div>
                <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Emails Per Sender</label>
                <input type="number" min="1" value={emailsPerSender} onChange={(e) => setEmailsPerSender(Number(e.target.value))} className="mt-2 w-full rounded-lg border border-line px-4 py-3 text-sm outline-none focus:border-ferozi" />
                <p className="text-sm text-ink/40 mt-1">Example: {importedCount || 500} recipients, {selectedSenderIds.length} senders, {emailsPerSender} per sender — real round-robin rotation, not random.</p>
              </div>
            )}
          </div>
        )}

        {step === 7 && (
          <div className="rounded-2xl border border-line bg-white shadow-card p-8 space-y-4 max-w-xl">
            <p className="text-base font-semibold">Ready to launch.</p>
            <div className="rounded-xl bg-mist p-5 text-sm space-y-2 text-ink/60">
              <p><span className="font-semibold text-ink">{importedCount}</span> contacts queued</p>
              <p>Delay: <span className="font-semibold text-ink">{delayMode === 'fixed' ? `${delaySeconds}s fixed` : `${delayRange[0]}–${delayRange[1]}s random`}</span></p>
              <p>Daily limit: <span className="font-semibold text-ink">{dailyLimit}</span> · Retries: <span className="font-semibold text-ink">{retryLimit}x</span></p>
              <p>Senders: <span className="font-semibold text-ink">{selectedSenderIds.length} Connected Email{selectedSenderIds.length === 1 ? '' : 's'}{selectedSenderIds.length > 1 ? `, ${emailsPerSender} each before rotating` : ''}</span></p>
            </div>
            <p className="text-sm text-ink/40">Sending is real, sequential, and rate-limited starting the moment you click Launch.</p>
          </div>
        )}

        {step === 2 && importProgress && (
          <div className="max-w-xl mb-4">
            <div className="w-full h-2 rounded-full bg-mist overflow-hidden mb-1.5">
              <div className="h-full bg-ferozi transition-all" style={{ width: `${Math.round((importProgress.processed / importProgress.total) * 100)}%` }} />
            </div>
            <p className="text-xs text-ink/45">
              Importing batch {importProgress.chunk} of {importProgress.totalChunks} — {importProgress.processed.toLocaleString()} / {importProgress.total.toLocaleString()} rows processed
            </p>
          </div>
        )}

        {!(step === 3 && showTemplates) && (
          <div className="flex items-center justify-between pt-6 max-w-xl">
            {step > 1 && step < 7 ? (
              <button onClick={() => setStep(step - 1)} className="flex items-center gap-1 text-sm font-semibold text-ink/50 hover:text-ink"><ChevronLeft className="w-4 h-4" /> Back</button>
            ) : <span />}
            <button
              onClick={step === 1 ? step1Next : step === 2 ? step2Next : step === 3 ? step3Next : step === 4 ? step4Next : step === 5 ? step5Next : step === 6 ? step6Next : launch}
              disabled={busy}
              className="flex items-center gap-2 px-7 py-3 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors disabled:opacity-50"
            >
              {busy ? (step === 2 && importProgress ? `Importing... (${importProgress.processed.toLocaleString()}/${importProgress.total.toLocaleString()})` : 'Working...') : step === 7 ? 'Launch Campaign' : 'Next'} {step < 7 && <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        )}
      </div>

      <PreviewAsRecipientModal open={previewOpen} onClose={() => setPreviewOpen(false)} subject={subject} body={body} />
    </div>
  )
}

// Phase 23 — real multi-template management: add/remove/reorder/
// duplicate/edit/preview, all backed by real EmailCampaignTemplate rows,
// never local-only state that could drift from what the send engine
// actually reads.
function TemplateManager({ campaignId, importedCount }) {
  const [templates, setTemplates] = useState(null)
  const [emailsPerTemplate, setEmailsPerTemplate] = useState(50)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null) // template being edited inline
  const [previewAssignment, setPreviewAssignment] = useState(null)

  function load() {
    setError('')
    Promise.all([api.emailCampaigns.listTemplates(campaignId), api.emailCampaigns.get(campaignId)])
      .then(([t, c]) => { setTemplates(t.templates); if (c.campaign.emailsPerTemplate > 0) setEmailsPerTemplate(c.campaign.emailsPerTemplate) })
      .catch((err) => setError(err.message || 'Failed to load templates.'))
  }
  useEffect(load, [campaignId])

  async function saveEmailsPerTemplate(value) {
    setEmailsPerTemplate(value)
    try {
      await api.emailCampaigns.update(campaignId, { emailsPerTemplate: value })
    } catch (err) {
      setError(err.message)
    }
  }

  async function addTemplate() {
    setError('')
    try {
      const { template } = await api.emailCampaigns.addTemplate(campaignId, { name: `Template ${(templates?.length || 0) + 1}` })
      setTemplates((prev) => [...(prev || []), template])
      setEditing(template)
    } catch (err) { setError(err.message) }
  }

  async function duplicateTemplate(id) {
    setError('')
    try {
      const { template } = await api.emailCampaigns.duplicateTemplate(campaignId, id)
      setTemplates((prev) => [...(prev || []), template])
    } catch (err) { setError(err.message) }
  }

  async function removeTemplate(id) {
    if (!window.confirm('Remove this template?')) return
    setError('')
    try {
      await api.emailCampaigns.removeTemplate(campaignId, id)
      load() // reload — deleting re-numbers the remaining templates' order server-side
    } catch (err) { setError(err.message) }
  }

  async function move(id, direction) {
    if (!templates) return
    const idx = templates.findIndex((t) => t.id === id)
    const swapWith = idx + direction
    if (swapWith < 0 || swapWith >= templates.length) return
    const reordered = [...templates]
    ;[reordered[idx], reordered[swapWith]] = [reordered[swapWith], reordered[idx]]
    setTemplates(reordered)
    try {
      await api.emailCampaigns.reorderTemplates(campaignId, reordered.map((t) => t.id))
    } catch (err) {
      setError(err.message)
      load() // real state may have diverged from the optimistic reorder — reload to be sure
    }
  }

  async function saveEdit() {
    setError('')
    try {
      const { template } = await api.emailCampaigns.updateTemplate(campaignId, editing.id, { name: editing.name, subject: editing.subject, body: editing.body })
      setTemplates((prev) => prev.map((t) => (t.id === template.id ? template : t)))
      setEditing(null)
    } catch (err) { setError(err.message) }
  }

  async function loadPreview() {
    setPreviewAssignment('loading')
    try {
      const result = await api.emailCampaigns.previewTemplateAssignment(campaignId)
      setPreviewAssignment(result)
    } catch (err) {
      setError(err.message)
      setPreviewAssignment(null)
    }
  }

  if (error && !templates) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm text-red-700">{error}</p>
        <button onClick={load} className="mt-3 px-5 py-2 rounded-full bg-ink text-white text-sm font-semibold">Try again</button>
      </div>
    )
  }
  if (!templates) return <div className="flex items-center gap-2 text-sm text-ink/40 py-10 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>

  return (
    <div className="rounded-2xl border border-line bg-white shadow-card p-8 space-y-5">
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm font-semibold">Templates</p>
        <button onClick={loadPreview} className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-line text-xs font-semibold hover:border-ferozi transition-colors"><Eye className="w-3.5 h-3.5" /> Preview Assignment</button>
      </div>

      <div className="space-y-3">
        {templates.map((t, i) => {
          const rangeStart = i * emailsPerTemplate + 1
          const rangeEnd = i === templates.length - 1 ? (importedCount || '…') : (i + 1) * emailsPerTemplate
          return (
            <div key={t.id} className="rounded-xl border border-line p-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-sm font-semibold">{t.name || `Template ${i + 1}`}</p>
                  <p className="text-xs text-ink/40">Emails: {rangeStart}–{rangeEnd}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => move(t.id, -1)} disabled={i === 0} className="px-2 py-1 rounded-lg border border-line text-xs disabled:opacity-30">↑</button>
                  <button onClick={() => move(t.id, 1)} disabled={i === templates.length - 1} className="px-2 py-1 rounded-lg border border-line text-xs disabled:opacity-30">↓</button>
                  <button onClick={() => setEditing(t)} className="px-2.5 py-1 rounded-full border border-line text-xs font-semibold hover:border-ferozi">Edit</button>
                  <button onClick={() => duplicateTemplate(t.id)} className="px-2.5 py-1 rounded-full border border-line text-xs font-semibold hover:border-ferozi">Duplicate</button>
                  <button onClick={() => removeTemplate(t.id)} className="text-ink/25 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              {t.subject && <p className="text-xs text-ink/45 mt-2 truncate">Subject: {t.subject}</p>}
            </div>
          )
        })}
      </div>

      <button onClick={addTemplate} className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-dashed border-line text-sm font-semibold text-ink/60 hover:border-ferozi transition-colors">
        <Plus className="w-4 h-4" /> Add Template
      </button>

      {templates.length > 1 && (
        <div>
          <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Change template after</label>
          <div className="flex items-center gap-2 mt-2">
            <input type="number" min="1" value={emailsPerTemplate} onChange={(e) => saveEmailsPerTemplate(Math.max(1, Number(e.target.value)))} className="w-32 rounded-lg border border-line px-4 py-2.5 text-sm outline-none focus:border-ferozi" />
            <span className="text-sm text-ink/50">emails</span>
          </div>
        </div>
      )}

      {previewAssignment === 'loading' && <p className="text-xs text-ink/40">Loading preview...</p>}
      {previewAssignment && previewAssignment !== 'loading' && (
        <div className="rounded-xl border border-line bg-mist p-4 max-h-56 overflow-y-auto">
          <p className="text-xs font-mono uppercase text-ink/40 mb-2">Template Assignment Preview {previewAssignment.assignments.length < (importedCount || 0) ? `(first ${previewAssignment.assignments.length})` : ''}</p>
          {previewAssignment.assignments.map((a, i) => (
            <p key={i} className="text-xs text-ink/60">{a.email} → <span className="font-semibold text-ink">{a.template || '(no template — using default message)'}</span></p>
          ))}
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit Template">
        {editing && (
          <div className="space-y-4">
            <div>
              <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Name</label>
              <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="mt-2 w-full rounded-lg border border-line px-4 py-2.5 text-sm outline-none focus:border-ferozi" />
            </div>
            <div>
              <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Subject</label>
              <input value={editing.subject} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} className="mt-2 w-full rounded-lg border border-line px-4 py-2.5 text-sm outline-none focus:border-ferozi" />
            </div>
            <div>
              <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Body</label>
              <textarea value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} rows={8} className="mt-2 w-full rounded-lg border border-line px-4 py-2.5 text-sm outline-none focus:border-ferozi font-mono" />
            </div>
            <button onClick={saveEdit} className="w-full px-6 py-3 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors">Save Template</button>
          </div>
        )}
      </Modal>
    </div>
  )
}

function TemplateLibraryPicker({ onBack, onUse }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [category, setCategory] = useState('All')
  const [previewTemplate, setPreviewTemplate] = useState(null)

  function load() {
    setError('')
    api.emailTemplates.list().then(setData).catch((err) => setError(err.message || 'Failed to load templates.'))
  }
  useEffect(load, [])

  async function duplicate(id) {
    try {
      await api.emailTemplates.duplicate(id)
      load()
    } catch (err) { setError(err.message) }
  }

  async function remove(id) {
    if (!window.confirm('Delete this template?')) return
    try {
      await api.emailTemplates.remove(id)
      load()
    } catch (err) { setError(err.message) }
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm text-red-700">{error}</p>
        <button onClick={load} className="mt-3 px-5 py-2 rounded-full bg-ink text-white text-sm font-semibold">Try again</button>
      </div>
    )
  }
  if (!data) return <div className="flex items-center gap-2 text-sm text-ink/40 py-10 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Loading templates...</div>

  const all = [...data.builtIn, ...data.custom]
  const categories = ['All', ...new Set(all.map((t) => t.category))]
  const filtered = category === 'All' ? all : all.filter((t) => t.category === category)

  return (
    <div className="rounded-2xl border border-line bg-white shadow-card p-8">
      <div className="flex items-center justify-between mb-5">
        <button onClick={onBack} className="flex items-center gap-1 text-sm font-semibold text-ink/50 hover:text-ink"><ChevronLeft className="w-4 h-4" /> Back to editor</button>
        <p className="text-sm text-ink/40">{all.length} templates ({data.builtIn.length} built-in, {data.custom.length} yours)</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-5">
        {categories.map((c) => (
          <button key={c} onClick={() => setCategory(c)} className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${category === c ? 'bg-ink text-white border-ink' : 'border-line text-ink/60'}`}>{c}</button>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((t) => (
          <div key={t.id} className="rounded-xl border border-line p-4 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <Badge tone="neutral">{t.category}</Badge>
              {t.isBuiltIn ? <Badge tone="ferozi">Built-in</Badge> : <Badge tone="success">Yours</Badge>}
            </div>
            <p className="font-semibold text-sm mb-1">{t.name}</p>
            <p className="text-xs text-ink/45 line-clamp-3 flex-1">{t.body}</p>
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <button onClick={() => onUse(t)} className="px-3 py-1.5 rounded-full bg-ink text-white text-xs font-semibold hover:bg-ferozi-deep transition-colors">Use This</button>
              <button onClick={() => setPreviewTemplate(t)} className="px-3 py-1.5 rounded-full border border-line text-xs font-semibold hover:border-ferozi">Preview</button>
              <button onClick={() => duplicate(t.id)} className="px-3 py-1.5 rounded-full border border-line text-xs font-semibold hover:border-ferozi">Duplicate</button>
              {!t.isBuiltIn && <button onClick={() => remove(t.id)} className="text-ink/25 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>}
            </div>
          </div>
        ))}
      </div>

      <PreviewAsRecipientModal open={!!previewTemplate} onClose={() => setPreviewTemplate(null)} subject={previewTemplate?.subject} body={previewTemplate?.body} />
    </div>
  )
}

function PreviewAsRecipientModal({ open, onClose, subject, body }) {
  const [sampleName, setSampleName] = useState('John Smith')
  const [sampleCompany, setSampleCompany] = useState('Acme Co')
  const [rendered, setRendered] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) { setRendered(null); setError(''); return }
    // Real fix: without this guard, rapid typing in Sample Name/Company
    // fires a new request per keystroke with no cancellation — if an
    // earlier request's response arrives after a later one (which
    // genuinely happens under real network variance), the preview would
    // briefly show stale data. `cancelled` ensures only the most recent
    // request's result is ever applied.
    let cancelled = false
    api.emailTemplates.preview(subject, body, { name: sampleName, company: sampleCompany, email: 'john@acmeco.com' })
      .then((result) => { if (!cancelled) setRendered(result) })
      .catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [open, subject, body, sampleName, sampleCompany])

  return (
    <Modal open={open} onClose={onClose} title="Preview as Recipient">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Sample Name</label>
            <input value={sampleName} onChange={(e) => setSampleName(e.target.value)} className="mt-2 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-ferozi" />
          </div>
          <div>
            <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Sample Company</label>
            <input value={sampleCompany} onChange={(e) => setSampleCompany(e.target.value)} className="mt-2 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-ferozi" />
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {rendered && (
          <div className="rounded-xl border border-line bg-mist p-4">
            <p className="text-xs font-mono uppercase text-ink/40 mb-1">Subject</p>
            <p className="text-sm font-semibold mb-3">{rendered.subject}</p>
            <p className="text-xs font-mono uppercase text-ink/40 mb-1">Body</p>
            <p className="text-sm whitespace-pre-wrap">{rendered.body}</p>
          </div>
        )}
      </div>
    </Modal>
  )
}

// ============================= LIVE DASHBOARD =============================
function CampaignDetail({ campaignId, onBack }) {
  const [live, setLive] = useState(null)
  const [error, setError] = useState('')
  const [acting, setActing] = useState('')
  const [report, setReport] = useState(null)
  const [showReport, setShowReport] = useState(false)
  const bottomRef = useRef(null)

  function load() {
    api.emailCampaigns.live(campaignId).then((data) => { setLive(data); setError('') }).catch((err) => setError(err.message || 'Failed to load campaign.'))
  }

  function loadReport() {
    api.emailCampaigns.report(campaignId).then(setReport).catch((err) => setError(err.message || 'Failed to load report.'))
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 3000)
    return () => clearInterval(interval)
  }, [campaignId])

  async function act(action) {
    setActing(action)
    try {
      await api.emailCampaigns[action](campaignId)
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setActing('')
    }
  }

  if (error && !live) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm text-red-700">{error}</p>
        <button onClick={load} className="mt-3 px-5 py-2 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors">Try again</button>
      </div>
    )
  }
  if (!live) return <div className="flex items-center gap-2 text-sm text-ink/40 py-16 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>

  function fmtSeconds(s) {
    if (!s || s < 0) return '0s'
    const m = Math.floor(s / 60), sec = Math.round(s % 60)
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`
  }

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-sm font-semibold text-ink/50 hover:text-ink mb-4"><ChevronLeft className="w-4 h-4" /> All Campaigns</button>
      <PageHeader
        eyebrow="Live Campaign"
        title={live.name}
        description={`Elapsed ${fmtSeconds(live.elapsedSeconds)} · Est. remaining ${fmtSeconds(live.estimatedRemainingSeconds)}`}
        actions={<StatusBadge status={live.status} />}
      />

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="rounded-2xl border border-line bg-white shadow-card p-6 mb-6">
        <div className="w-full h-3 rounded-full bg-mist overflow-hidden mb-2">
          <div className="h-full bg-ferozi transition-all" style={{ width: `${live.progressPct}%` }} />
        </div>
        <p className="text-xs text-ink/40 mb-5">{live.progressPct}% complete</p>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
          <div className="rounded-lg bg-mist p-3 text-center"><p className="text-xl font-bold">{live.loaded}</p><p className="text-[10px] text-ink/40 uppercase">Loaded</p></div>
          <div className="rounded-lg bg-mist p-3 text-center"><p className="text-xl font-bold text-ferozi-deep">{live.sent}</p><p className="text-[10px] text-ink/40 uppercase">Sent</p></div>
          <div className="rounded-lg bg-mist p-3 text-center"><p className="text-xl font-bold text-red-500">{live.failed}</p><p className="text-[10px] text-ink/40 uppercase">Failed</p></div>
          <div className="rounded-lg bg-mist p-3 text-center"><p className="text-xl font-bold">{live.remaining}</p><p className="text-[10px] text-ink/40 uppercase">Remaining</p></div>
          <div className="rounded-lg bg-mist p-3 text-center"><p className="text-xl font-bold">{live.sentToday}/{live.dailyLimit}</p><p className="text-[10px] text-ink/40 uppercase">Today</p></div>
        </div>

        {live.currentEmail && <p className="text-xs text-ink/50 mb-4">Currently sending: <span className="font-semibold text-ink">{live.currentEmail}</span></p>}

        {live.openTracking && (
          <div className="rounded-xl bg-mist p-4 mb-4">
            <p className="font-mono text-[11px] tracking-wideish uppercase text-ink/45 mb-2">Campaign Performance</p>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div><p className="text-lg font-bold">{live.sent}</p><p className="text-[10px] text-ink/40 uppercase">Emails Sent</p></div>
              <div><p className="text-lg font-bold text-ferozi-deep">{live.openTracking.uniqueOpens}</p><p className="text-[10px] text-ink/40 uppercase">Unique Opens</p></div>
              <div><p className="text-lg font-bold">{live.openTracking.openRate}%</p><p className="text-[10px] text-ink/40 uppercase">Open Rate</p></div>
            </div>
            <p className="text-[10px] text-ink/35 text-center mt-2">{live.openTracking.totalOpens} total open events · depends on the recipient's mail client loading the tracking pixel — not 100% accurate</p>
          </div>
        )}

        {live.rotation && (
          <div className="rounded-xl bg-mist p-4 mb-4">
            <p className="font-mono text-[11px] tracking-wideish uppercase text-ink/45 mb-2">Sender Rotation</p>
            <div className="grid sm:grid-cols-3 gap-3 mb-3 text-xs">
              <div><p className="text-ink/40">Current Sender</p><p className="font-semibold text-ink mt-0.5">{live.rotation.currentSender || '—'}</p></div>
              <div><p className="text-ink/40">Progress</p><p className="font-semibold text-ink mt-0.5">{live.rotation.currentSenderProgress}/{live.rotation.emailsPerSender}</p></div>
              <div><p className="text-ink/40">Next Sender</p><p className="font-semibold text-ink mt-0.5">{live.rotation.nextSender || '—'}</p></div>
            </div>
            <div className="space-y-1">
              {live.rotation.senders.map((s) => (
                <div key={s.email} className="flex items-center justify-between text-xs">
                  <span className="text-ink/60">{s.email}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-ink/40">{s.sentCount} sent</span>
                    <Badge tone={s.status === 'Healthy' ? 'success' : 'danger'}>{s.status}</Badge>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {live.status === 'Running' && <button onClick={() => act('pause')} disabled={acting} className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-line text-xs font-semibold hover:border-ferozi"><Pause className="w-3.5 h-3.5" /> Pause</button>}
          {live.status === 'Paused' && <button onClick={() => act('resume')} disabled={acting} className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-ink text-white text-xs font-semibold hover:bg-ferozi-deep"><Play className="w-3.5 h-3.5" /> Resume</button>}
          {['Running', 'Paused'].includes(live.status) && <button onClick={() => act('cancel')} disabled={acting} className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-line text-xs font-semibold hover:border-red-400 hover:text-red-500"><Square className="w-3.5 h-3.5" /> Cancel</button>}
          {['Completed', 'Cancelled', 'Failed'].includes(live.status) && <button onClick={() => act('restart')} disabled={acting} className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-ink text-white text-xs font-semibold hover:bg-ferozi-deep"><RotateCcw className="w-3.5 h-3.5" /> Restart</button>}
          {live.failed > 0 && <button onClick={() => act('retryFailed')} disabled={acting} className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-line text-xs font-semibold hover:border-ferozi"><RefreshCw className="w-3.5 h-3.5" /> Retry Failed</button>}
          <a href={api.emailCampaigns.downloadLogsUrl(campaignId)} className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-line text-xs font-semibold hover:border-ferozi"><Download className="w-3.5 h-3.5" /> Download Logs</a>
          <a href={api.emailCampaigns.downloadReportUrl(campaignId)} className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-line text-xs font-semibold hover:border-ferozi"><Download className="w-3.5 h-3.5" /> Download CSV Report</a>
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-white shadow-card p-6">
        <p className="font-mono text-[11px] tracking-wideish uppercase text-ink/45 mb-3">Live Logs</p>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {live.logs.map((l) => (
            <div key={l.id} className="flex items-start gap-3 text-xs">
              <span className="font-mono text-ink/30 shrink-0">{new Date(l.createdAt).toLocaleTimeString()}</span>
              <span className="text-ink/70"><span className="font-semibold">{l.event}</span>{l.email ? ` — ${l.email}` : ''}{l.message && l.message !== l.event ? `: ${l.message}` : ''}</span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-white shadow-card p-6 mt-6">
        <button onClick={() => { setShowReport(!showReport); if (!report) loadReport() }} className="flex items-center justify-between w-full">
          <p className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">Campaign Report{report ? ` — Template Performance` : ''}</p>
          <span className="text-xs text-ink/40">{showReport ? 'Hide' : 'Show'}</span>
        </button>
        {showReport && (
          !report ? (
            <div className="flex items-center gap-2 text-sm text-ink/40 py-6 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Loading report...</div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg bg-mist p-3 text-center"><p className="text-lg font-bold">{report.totalRecipients}</p><p className="text-[10px] text-ink/40 uppercase">Recipients</p></div>
                <div className="rounded-lg bg-mist p-3 text-center"><p className="text-lg font-bold text-ferozi-deep">{report.sent}</p><p className="text-[10px] text-ink/40 uppercase">Sent</p></div>
                <div className="rounded-lg bg-mist p-3 text-center"><p className="text-lg font-bold">{report.uniqueOpens}</p><p className="text-[10px] text-ink/40 uppercase">Unique Opens</p></div>
                <div className="rounded-lg bg-mist p-3 text-center"><p className="text-lg font-bold">{report.openRate}%</p><p className="text-[10px] text-ink/40 uppercase">Open Rate</p></div>
              </div>
              {report.trackOpens && report.templateStats.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-ink/60 mb-2">Template Performance</p>
                  <div className="space-y-2">
                    {report.templateStats.map((t) => (
                      <div key={t.id} className="rounded-lg border border-line p-3 flex items-center justify-between flex-wrap gap-2">
                        <p className="text-sm font-semibold">{t.name}</p>
                        <div className="flex items-center gap-4 text-xs text-ink/60">
                          <span>Sent: <span className="font-semibold text-ink">{t.sent}</span></span>
                          <span>Opened: <span className="font-semibold text-ink">{t.uniqueOpens}</span></span>
                          <span>Rate: <span className="font-semibold text-ink">{t.openRate}%</span></span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {!report.trackOpens && <p className="text-xs text-ink/40">Open tracking wasn't enabled for this campaign, so open/rate figures aren't available — sent/recipient counts are still real.</p>}
            </div>
          )
        )}
      </div>
    </div>
  )
}

// ============================= ROOT =============================
export default function EmailCampaigns() {
  const [tab, setTab] = useState('campaigns')
  const [selectedId, setSelectedId] = useState(null)
  const [wizardOpen, setWizardOpen] = useState(false)

  return (
    <div>
      {!selectedId && !wizardOpen && (
        <div className="flex items-center gap-1 p-1 rounded-lg bg-mist border border-line mb-6 w-fit">
          <button onClick={() => setTab('campaigns')} className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${tab === 'campaigns' ? 'bg-white shadow-sm text-ink' : 'text-ink/45 hover:text-ink/70'}`}>Campaigns</button>
          <button onClick={() => setTab('senders')} className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${tab === 'senders' ? 'bg-white shadow-sm text-ink' : 'text-ink/45 hover:text-ink/70'}`}>Connected Emails</button>
        </div>
      )}

      {wizardOpen ? (
        // Phase 22 — the creation flow is now its own full page, not a
        // small modal, replacing the whole view exactly like
        // CampaignDetail does — real page width and height, not a
        // cramped overlay.
        <CampaignWizard
          onClose={() => setWizardOpen(false)}
          onCreated={(id) => { setWizardOpen(false); setSelectedId(id) }}
        />
      ) : selectedId ? (
        <CampaignDetail campaignId={selectedId} onBack={() => setSelectedId(null)} />
      ) : tab === 'senders' ? (
        <ConnectedEmailsManager />
      ) : (
        <CampaignList onOpen={setSelectedId} onCreate={() => setWizardOpen(true)} />
      )}
    </div>
  )
}
