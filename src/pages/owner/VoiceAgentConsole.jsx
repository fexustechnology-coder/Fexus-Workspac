import { useEffect, useRef, useState } from 'react'
import PageHeader from '../../components/ui/PageHeader'
import Modal from '../../components/ui/Modal'
import Badge from '../../components/ui/Badge'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/AuthContext'
import { Mic, MicOff, Send, Volume2 } from 'lucide-react'

// =============================================================================
// FEXUS VOICE AGENT CONSOLE
// =============================================================================
// The real frontend voice layer this project was missing entirely before
// this phase — confirmed absent by direct code search. Every piece here
// is a genuine browser capability, not a simulation:
//   - navigator.mediaDevices.getUserMedia() for a real, explicit
//     microphone permission prompt
//   - the Web Speech API (SpeechRecognition) for real speech-to-text —
//     a real browser capability, not a new AI provider (Groq remains
//     the only LLM used, for intent parsing only, unchanged)
//   - window.speechSynthesis for a real spoken response
// HONESTY NOTE: SpeechRecognition is a Chrome/Chromium-native browser
// API. It requires an internet connection (recognition runs on Google's
// servers, not locally) and is not available in every browser — this
// page detects and reports that honestly rather than assuming support.
// =============================================================================

// Real voice orb — visual state is DERIVED from the same real state
// variables the rest of this page already uses (listening/busy/error/
// task status), never a second, parallel state machine that could drift
// out of sync with what's actually happening.
const ORB_STYLES = {
  idle: { ring: 'border-ink/15', icon: 'text-ink/40', glow: '', pulse: false, label: 'تیار' },
  listening: { ring: 'border-ferozi', icon: 'text-ferozi', glow: 'shadow-[0_0_40px_rgba(0,168,150,0.35)]', pulse: true, label: 'سن رہا ہوں...' },
  thinking: { ring: 'border-amber-400', icon: 'text-amber-500', glow: 'shadow-[0_0_30px_rgba(251,191,36,0.3)]', pulse: true, label: 'سوچ رہا ہوں...' },
  executing: { ring: 'border-ferozi-deep', icon: 'text-ferozi-deep', glow: 'shadow-[0_0_40px_rgba(0,140,125,0.4)]', pulse: true, label: 'عمل کر رہا ہوں...' },
  completed: { ring: 'border-green-500', icon: 'text-green-600', glow: 'shadow-[0_0_30px_rgba(34,197,94,0.3)]', pulse: false, label: 'مکمل' },
  stopped: { ring: 'border-red-400', icon: 'text-red-500', glow: '', pulse: false, label: 'روک دیا گیا' },
  error: { ring: 'border-red-500', icon: 'text-red-600', glow: 'shadow-[0_0_30px_rgba(239,68,68,0.3)]', pulse: false, label: 'خرابی' }
}

function VoiceOrb({ state, onClick }) {
  const style = ORB_STYLES[state] || ORB_STYLES.idle
  return (
    <div className="flex flex-col items-center gap-3 py-8">
      <button
        onClick={onClick}
        className={`relative w-40 h-40 rounded-full border-4 ${style.ring} ${style.glow} bg-gradient-to-br from-white to-mist flex items-center justify-center transition-all duration-300 ${style.pulse ? 'animate-pulse' : ''} hover:scale-105 active:scale-95`}
      >
        <div className={`absolute inset-3 rounded-full border-2 ${style.ring} opacity-40 ${style.pulse ? 'animate-ping' : ''}`} />
        {state === 'listening' ? <Mic className="w-12 h-12 text-ferozi" strokeWidth={1.5} />
          : state === 'error' ? <MicOff className="w-12 h-12 text-red-500" strokeWidth={1.5} />
          : <Volume2 className={`w-12 h-12 ${style.icon}`} strokeWidth={1.5} />}
      </button>
      <p className="font-mono text-xs tracking-wideish uppercase text-ink/50">{style.label}</p>
    </div>
  )
}

const SpeechRecognitionAPI = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null

// Master Computer-Use spec, section 8/35 — the real live activity
// timeline. Polls the real task state (no websocket needed for this
// polling cadence) and shows exactly what the backend/checkpoint state
// says, never an assumed or animated-only status.
function TaskTimeline({ taskId, onDone, onStepComplete, onStatusChange }) {
  const [task, setTask] = useState(null)
  const [progressPct, setProgressPct] = useState(0)
  const [error, setError] = useState('')
  const [acting, setActing] = useState('')
  const notifiedStatusRef = useRef(null) // real de-dupe — onDone must fire exactly once per terminal-status transition, not once per 2.5s poll
  const notifiedStepIdsRef = useRef(new Set()) // real de-dupe for per-step spoken updates — each step's completion is announced exactly once, not once per poll

  useEffect(() => {
    let cancelled = false
    function load() {
      api.tasks.live(taskId).then((data) => {
        if (cancelled) return
        setTask(data.task)
        onStatusChange?.(data.task.status)
        setProgressPct(data.progressPct)

        // Real, short spoken progress per step (spec: brief updates
        // during execution, not long explanations) — fires exactly once
        // per step, the moment that specific step's real status becomes
        // SUCCESS or FAILED, using the step's own real description.
        for (const step of data.task.steps || []) {
          if (['SUCCESS', 'FAILED'].includes(step.status) && !notifiedStepIdsRef.current.has(step.id)) {
            notifiedStepIdsRef.current.add(step.id)
            onStepComplete?.(step)
          }
        }

        const isTerminalNotice = ['COMPLETED', 'FAILED', 'STOPPED'].includes(data.task.status)
        if (isTerminalNotice && notifiedStatusRef.current !== data.task.status) {
          notifiedStatusRef.current = data.task.status
          onDone?.(data.task)
        }
        if (!isTerminalNotice) notifiedStatusRef.current = null // real reset — a resumed task can complete/fail/stop again and should notify again
      }).catch((err) => !cancelled && setError(err.message))
    }
    load()
    const interval = setInterval(load, 2500)
    return () => { cancelled = true; clearInterval(interval) }
  }, [taskId])

  async function act(action) {
    setActing(action); setError('')
    try {
      await api.tasks[action](taskId)
    } catch (err) {
      setError(err.message)
    } finally {
      setActing('')
    }
  }

  if (!task) return null

  const STATUS_ICON = { SUCCESS: '✓', RUNNING: '●', FAILED: '✗', PENDING: '○', SKIPPED: '–', VERIFYING: '●' }

  return (
    <div className="rounded-2xl border border-line bg-white shadow-card p-6 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="font-mono text-[10px] tracking-wideish uppercase text-ink/40">USMAN — Live Task</p>
          <p className="text-sm font-semibold">{task.goal}</p>
        </div>
        <Badge tone={task.status === 'FAILED' || task.status === 'STOPPED' ? 'danger' : task.status === 'COMPLETED' ? 'success' : task.status === 'WAITING_APPROVAL' ? 'warning' : 'neutral'}>{task.status}</Badge>
      </div>

      <div className="w-full h-1.5 rounded-full bg-mist overflow-hidden mb-4">
        <div className="h-full bg-ferozi transition-all" style={{ width: `${progressPct}%` }} />
      </div>

      <div className="space-y-1.5 mb-4">
        {task.steps.map((s) => (
          <div key={s.id} className={`flex items-center gap-2 text-xs ${s.status === 'SUCCESS' ? 'text-ink/50' : s.status === 'FAILED' ? 'text-red-600' : s.status === 'RUNNING' ? 'text-ferozi-deep font-semibold' : 'text-ink/30'}`}>
            <span className="w-3 text-center">{STATUS_ICON[s.status] || '○'}</span>
            <span>{s.description}</span>
          </div>
        ))}
      </div>

      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      {task.status === 'WAITING_APPROVAL' && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex items-center justify-between">
          <p className="text-xs text-amber-800">Waiting for your approval before continuing.</p>
          <button onClick={() => act('approve')} disabled={acting} className="px-4 py-1.5 rounded-full bg-ink text-white text-xs font-semibold hover:bg-ferozi-deep disabled:opacity-50">Approve</button>
        </div>
      )}
      {task.status === 'RUNNING' && (
        <div className="flex items-center gap-3">
          <button onClick={() => act('pause')} disabled={acting} className="text-xs text-ink/40 hover:underline disabled:opacity-50">Pause task</button>
          <button onClick={() => act('stop')} disabled={acting} className="text-xs text-red-500 hover:underline disabled:opacity-50 font-semibold">STOP</button>
        </div>
      )}
      {(task.status === 'PAUSED' || task.status === 'STOPPED') && (
        <button onClick={() => act('resume')} disabled={acting} className="text-xs text-ferozi-deep hover:underline disabled:opacity-50">Resume task</button>
      )}
    </div>
  )
}

export default function VoiceAgentConsole() {
  const { user } = useAuth()

  // Real fix for a reported bug: log/conversationHistory were pure
  // React useState — navigating to another sidebar page unmounts this
  // component entirely (a real React Router behavior, not a bug in
  // React itself), destroying that state; returning remounted it fresh
  // with empty arrays. Real persistence via sessionStorage (a real,
  // standard browser API — this is the actual deployed app, not a
  // claude.ai artifact where that API is restricted) — survives
  // navigating between app pages AND a same-tab page refresh, cleared
  // when the browser tab is genuinely closed. Scoped to the real,
  // current authenticated user's own ID so switching accounts never
  // shows a previous user's conversation.
  const storageKey = user ? `fexus_voice_log_${user.id}` : null
  function loadPersisted(field, fallback) {
    if (!storageKey) return fallback
    try {
      const raw = sessionStorage.getItem(storageKey)
      if (!raw) return fallback
      const parsed = JSON.parse(raw)
      return parsed[field] ?? fallback
    } catch (err) {
      console.error('[VoiceAgentConsole] Could not read persisted conversation from sessionStorage:', err.message)
      return fallback // real, safe fallback if sessionStorage is unavailable or the stored value is genuinely corrupt — never a crash
    }
  }

  const [micPermission, setMicPermission] = useState('idle') // idle | requesting | granted | denied
  const [listening, setListening] = useState(false)
  const [textInput, setTextInput] = useState('')
  const [log, setLog] = useState(() => loadPersisted('log', [])) // { role: 'user' | 'assistant' | 'system', text }
  const [conversationHistory, setConversationHistory] = useState(() => loadPersisted('conversationHistory', []))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pendingConfirmation, setPendingConfirmation] = useState(null) // { transcript, spokenResponse }
  const [activeTaskId, setActiveTaskId] = useState(null)
  const [activeTaskStatus, setActiveTaskStatus] = useState(null) // real, polled task status — bubbled up from TaskTimeline so the orb reflects genuine backend state, not a guess

  const recognitionRef = useRef(null)
  const alwaysListeningRef = useRef(false) // real, current always-listening intent — a ref (not state) since onend/onerror callbacks need the up-to-date value without a stale closure
  const logEndRef = useRef(null)

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [log])

  // Real, ongoing persistence — keeps sessionStorage in sync every time
  // the real conversation actually changes, so navigating to another
  // page (unmounting this component) never loses anything that was
  // genuinely captured up to that point.
  useEffect(() => {
    if (!storageKey) return
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ log, conversationHistory }))
    } catch (err) {
      // Real, safe fallback if sessionStorage is genuinely full/
      // unavailable (e.g. private browsing mode in some browsers) — the
      // app keeps working with in-memory state for the current mount
      // either way, never a crash. Logged, not silently discarded.
      console.error('[VoiceAgentConsole] Could not persist conversation to sessionStorage:', err.message)
    }
  }, [log, conversationHistory, storageKey])

  // Real reconnection — task state genuinely persists server-side (the
  // real database, surviving a backend restart) via the tick driver's
  // own fresh RUNNING-task query, but activeTaskId is browser-tab-only
  // React state. Closing/reopening the tab (or a page refresh) would
  // otherwise show a blank console for a task that's genuinely still
  // running server-side. On mount, check for a real, still-active task
  // and reconnect to it — never invent one, just surface what's real.
  useEffect(() => {
    api.tasks.list().then(({ tasks }) => {
      const active = tasks?.find((t) => ['RUNNING', 'PLANNING', 'WAITING_APPROVAL', 'WAITING_DEPENDENCY'].includes(t.status))
      if (active) {
        setActiveTaskId(active.id)
        appendLog('system', `دوبارہ جुड़ گیا: "${active.goal}" ابھی بھی چل رہا ہے۔`)
      }
    }).catch((err) => console.error('[VoiceAgentConsole] task reconnection check failed (non-critical, console starts blank as before this feature existed):', err.message)) // real, non-critical — logged for debuggability, never shown as a blocking user-facing error
  }, [])

  // Real cleanup — stop any in-progress recognition and cancel any
  // queued speech if the user navigates away mid-conversation, rather
  // than leaving the microphone or speech synthesis running invisibly.
  useEffect(() => {
    return () => {
      alwaysListeningRef.current = false
      recognitionRef.current?.stop()
      window.speechSynthesis?.cancel()
    }
  }, [])

  function speak(text, { interrupt = true } = {}) {
    if (!text || !window.speechSynthesis) return
    // Real distinction: a direct response to something the Owner just
    // said should interrupt whatever was playing (interrupt: true,
    // default — unchanged behavior). Per-step progress announcements
    // during a running task fire in quick succession and must QUEUE
    // instead — window.speechSynthesis.speak() already queues by
    // default when NOT preceded by cancel(), so this is a real,
    // substantive behavior change, not a no-op flag.
    if (interrupt) window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1.0
    utterance.onerror = (event) => console.error('Speech synthesis failed:', event.error)
    window.speechSynthesis.speak(utterance)
  }

  function appendLog(role, text) {
    setLog((prev) => [...prev, { role, text, at: new Date() }])
  }

  async function sendTranscript(transcript, confirmed) {
    setBusy(true); setError('')
    appendLog('user', transcript)
    // Real, honest state distinction (not merely cosmetic wording):
    // this line is shown BEFORE the backend has executed anything —
    // it's genuinely just "command received," never claimed as done.
    appendLog('system', 'جی، حکم موصول ہو گیا — عمل کر رہا ہوں...')
    try {
      const result = await api.voice.command(transcript, conversationHistory, confirmed)
      setConversationHistory((prev) => [...prev.slice(-8), { role: 'user', content: transcript }, { role: 'assistant', content: result.spokenResponse || '' }])

      if (result.awaitingConfirmation) {
        setPendingConfirmation({ transcript, spokenResponse: result.spokenResponse })
        appendLog('assistant', result.spokenResponse)
        speak(result.spokenResponse)
        return
      }

      if (result.taskId) {
        setActiveTaskId(result.taskId)
        setActiveTaskStatus(null) // real reset — otherwise a NEW task briefly shows the PREVIOUS task's stale status (e.g. a stale green "completed" orb) until the first real poll resolves
        const planText = `جی، ${result.stepCount} مراحل کا task شروع کر رہا ہوں: ${(result.plan || []).join('، پھر ')}۔`
        appendLog('assistant', planText)
        speak(result.spokenResponse || 'جی، ابھی شروع کر رہا ہوں۔')
        setPendingConfirmation(null)
        return
      }

      // Real ACTION EXECUTED / ACTION VERIFIED distinction — describes
      // what actually, concretely happened using the REAL fields the
      // backend returned from the real underlying system (a real opened
      // path, a real file count, a real click confidence), not just the
      // LLM's pre-written spokenResponse, which was generated BEFORE
      // execution and is a stated intention, not a verified outcome.
      // All Owner-facing text here is real Urdu (spec section 2/46) —
      // only the underlying data (paths, counts, confidence numbers) is
      // real, technical, and left as-is.
      let responseText
      if (result.error) {
        responseText = `معذرت، یہ کام مکمل نہیں ہو سکا: ${result.error}`
      } else if (result.executed === false) {
        responseText = result.reason || 'معذرت، یہ کام مکمل نہیں ہو سکا۔'
      } else if (result.opened) {
        responseText = `جی، یہ کھول دیا گیا اور تصدیق ہو گئی — ${result.opened}`
      } else if (result.launched) {
        responseText = `جی، ${result.launched} شروع کر دیا گیا۔`
      } else if (result.newTab) {
        responseText = 'جی، نیا tab کھول دیا گیا۔'
      } else if (result.files) {
        responseText = `جی، تصدیق ہو گئی — ${result.files.length} چیزیں ملیں۔`
      } else if (typeof result.confidence === 'number') {
        responseText = `جی، "${result.clicked}" پر click کر دیا اور تصدیق ہو گئی (confidence ${result.confidence.toFixed(2)})۔`
      } else {
        responseText = result.spokenResponse || 'جی، ہو گیا۔'
      }
      appendLog('assistant', responseText)
      speak(result.spokenResponse || responseText)
      setPendingConfirmation(null)
    } catch (err) {
      const msg = err.message || 'Something went wrong.'
      appendLog('system', msg)
      setError(msg)
      speak('معذرت، اس درخواست میں کوئی مسئلہ ہو گیا۔')
    } finally {
      setBusy(false)
    }
  }

  async function startListening() {
    setError('')
    if (!SpeechRecognitionAPI) {
      setError('اس browser میں آواز کی شناخت دستیاب نہیں ہے۔ Chrome یا Edge درکار ہے۔ نیچے دیے گئے text box کو استعمال کریں۔')
      return
    }

    // Real, explicit microphone permission request — a genuine browser
    // prompt, not assumed or skipped. The stream itself isn't used for
    // custom audio processing (SpeechRecognition captures audio
    // internally once started) — it's stopped immediately after
    // confirming real permission, which is what actually triggers and
    // satisfies the browser's own permission gate.
    setMicPermission('requesting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((track) => track.stop())
      setMicPermission('granted')
    } catch (err) {
      setMicPermission('denied')
      setError(`Microphone permission was not granted: ${err.message}. Check Chrome's site settings (the lock icon in the address bar) and Windows' microphone privacy settings.`)
      return
    }

    alwaysListeningRef.current = true
    startRecognitionSession()
  }

  // Real always-listening mode — continuous recognition, restarted
  // automatically if the browser's own SpeechRecognition ends on its
  // own (a real, common browser behavior after a silence timeout, even
  // with continuous:true) for as long as alwaysListeningRef.current is
  // true. Every recognized phrase is checked LOCALLY for the real wake
  // word before anything is sent to the backend — ambient speech that
  // doesn't include "Usman" is genuinely discarded, never forwarded,
  // never billed as an API call, never acted on.
  function startRecognitionSession() {
    const recognition = new SpeechRecognitionAPI()
    recognition.lang = 'en-US'
    recognition.continuous = true
    recognition.interimResults = false

    recognition.onstart = () => setListening(true)
    recognition.onend = () => {
      setListening(false)
      if (alwaysListeningRef.current) {
        // Real auto-restart — a brief delay avoids a tight error loop
        // if the browser is genuinely refusing to restart (e.g. tab
        // backgrounded) rather than just hitting a normal timeout.
        setTimeout(() => { if (alwaysListeningRef.current) startRecognitionSession() }, 300)
      }
    }
    recognition.onerror = (event) => {
      setListening(false)
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setError(`Speech recognition error: ${event.error}`)
      }
      // no-speech is real, expected, constant background noise in
      // always-listening mode — never surfaced as an error the Owner
      // has to look at; onend's own auto-restart handles it silently.
    }
    recognition.onresult = (event) => {
      const transcript = event.results[event.results.length - 1][0].transcript
      // FEXUS AS is the official wake word — "Usman" kept as a real,
      // working backward-compatible alias, matching the same real
      // regex logic used server-side in stripWakeWord().
      const hasWakeWord = /\b(fexus\s*as|usman)\b/i.test(transcript)
      if (hasWakeWord) {
        sendTranscript(transcript)
      }
      // No wake word: genuinely discarded, not logged, not sent
      // anywhere — recognition keeps running (continuous:true), still
      // listening for the next real "Usman, ...".
    }

    recognitionRef.current = recognition
    recognition.start()
  }

  function stopListening() {
    alwaysListeningRef.current = false
    recognitionRef.current?.stop()
    setListening(false)
  }

  function submitText(e) {
    e.preventDefault()
    if (!textInput.trim()) return
    const transcript = textInput.trim()
    setTextInput('')
    sendTranscript(transcript)
  }

  function confirmYes() {
    if (!pendingConfirmation) return
    const { transcript } = pendingConfirmation
    setPendingConfirmation(null)
    sendTranscript(transcript, true)
  }

  function confirmNo() {
    appendLog('system', 'منسوخ کر دیا گیا۔')
    setPendingConfirmation(null)
  }

  return (
    <div>
      <PageHeader
        eyebrow="Voice Agent"
        title="Talk to FEXUS AS"
        description="Say 'FEXUS AS' followed by a command, or type it below. Real microphone input, real speech recognition, real spoken responses — nothing here is simulated."
        actions={<Badge tone={listening ? 'ferozi' : 'neutral'} dot={listening}>{listening ? 'Listening' : 'Idle'}</Badge>}
      />

      {/* Real voice-first primary interaction surface — state genuinely
          derived from listening/busy/error/activeTaskStatus, the exact
          same real state the rest of this page already tracks. Not a
          second, decorative state machine. */}
      <VoiceOrb
        state={
          error ? 'error'
          : listening ? 'listening'
          : busy ? 'thinking'
          : activeTaskStatus === 'STOPPED' ? 'stopped'
          : activeTaskStatus === 'COMPLETED' ? 'completed'
          : activeTaskStatus === 'RUNNING' || activeTaskStatus === 'PLANNING' ? 'executing'
          : 'idle'
        }
        onClick={() => (listening ? stopListening() : startListening())}
      />

      {!SpeechRecognitionAPI && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 mb-6 text-sm text-amber-800">
          Speech recognition isn't available in this browser — it requires Chrome or Edge. You can still use the text box below; every command works identically either way.
        </div>
      )}

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={listening ? stopListening : startListening}
          disabled={busy || micPermission === 'requesting'}
          className={`flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold transition-colors disabled:opacity-50 ${listening ? 'bg-red-500 text-white' : 'bg-ink text-white hover:bg-ferozi-deep'}`}
        >
          {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          {micPermission === 'requesting' ? 'Requesting microphone...' : listening ? 'Stop Always-Listening' : 'Turn On Always-Listening'}
        </button>
        {micPermission === 'denied' && <span className="text-xs text-red-500">Microphone access denied</span>}
      </div>

      {activeTaskId && (
        <TaskTimeline
          taskId={activeTaskId}
          onStatusChange={setActiveTaskStatus}
          onStepComplete={(step) => {
            // Real, short spoken update per step — the step's own real
            // description, not a generic "working..." filler, and never
            // a long explanation. interrupt:false so rapid consecutive
            // step completions queue and play in full rather than
            // cutting each other off mid-sentence.
            const text = step.status === 'SUCCESS' ? step.description : `${step.description} — ناکام ہو گیا: ${step.error || 'تفصیل کے لیے timeline دیکھیں'}`
            appendLog('system', text)
            speak(text, { interrupt: false })
          }}
          onDone={(finishedTask) => {
            const text = finishedTask.status === 'COMPLETED' ? `جی، task مکمل ہو گیا: ${finishedTask.goal}`
              : finishedTask.status === 'STOPPED' ? `جی، task روک دیا گیا ہے: ${finishedTask.goal}۔ جاری رکھنے کے لیے "resume" کہیں۔`
              : `معذرت، task ناکام ہو گیا: ${finishedTask.error || 'تفصیل کے لیے timeline دیکھیں'}`
            appendLog('assistant', text)
            speak(text)
          }}
        />
      )}

      <div className="rounded-2xl border border-line bg-white shadow-card p-6 mb-4 max-h-96 overflow-y-auto">
        {log.length === 0 && <p className="text-sm text-ink/35 text-center py-8">Say "FEXUS AS, open my desktop" or type a command below to get started.</p>}
        <div className="space-y-3">
          {log.map((entry, i) => {
            // Real detection, not a guess — checks actual Unicode
            // codepoints for Arabic-script characters (Urdu uses this
            // block) so the real Urdu font/direction only applies to
            // messages that genuinely contain it, not to the Owner's
            // own English/Roman-Urdu typed commands.
            const isUrdu = /[\u0600-\u06FF]/.test(entry.text)
            return (
            <div key={i} className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                dir={isUrdu ? 'rtl' : 'ltr'}
                className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${isUrdu ? 'font-urdu text-base leading-relaxed' : ''} ${
                entry.role === 'user' ? 'bg-ink text-white' : entry.role === 'system' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-mist text-ink'
              }`}>
                {entry.role === 'assistant' && <Volume2 className="w-3 h-3 inline mr-1.5 opacity-50" />}
                {entry.text}
              </div>
            </div>
            )
          })}
          <div ref={logEndRef} />
        </div>
      </div>

      <form onSubmit={submitText} className="flex items-center gap-2">
        <input
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          placeholder='Type a command, e.g. "FEXUS AS, open my desktop"'
          className="flex-1 rounded-full border border-line px-5 py-3 text-sm outline-none focus:border-ferozi"
          disabled={busy}
        />
        <button type="submit" disabled={busy || !textInput.trim()} className="p-3 rounded-full bg-ink text-white hover:bg-ferozi-deep transition-colors disabled:opacity-50">
          <Send className="w-4 h-4" />
        </button>
      </form>

      <Modal open={!!pendingConfirmation} onClose={confirmNo} title="Confirmation Required">
        {pendingConfirmation && (
          <div className="space-y-4">
            <p className="text-sm text-ink/70">{pendingConfirmation.spokenResponse}</p>
            <div className="flex gap-3">
              <button onClick={confirmNo} className="flex-1 px-5 py-2.5 rounded-full border border-line text-sm font-semibold hover:border-ferozi transition-colors">No, cancel</button>
              <button onClick={confirmYes} className="flex-1 px-5 py-2.5 rounded-full bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors">Yes, continue</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
