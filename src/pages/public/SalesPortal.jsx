import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2, Send, CheckCircle2, Sparkles } from 'lucide-react'
import { api } from '../../lib/api'

const FIELD_LABELS = {
  businessType: 'Business type', pages: 'Pages', style: 'Style',
  targetAudience: 'Target audience', country: 'Country', budget: 'Budget', deadline: 'Deadline'
}

export default function SalesPortal() {
  const { token } = useParams()
  const [state, setState] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const bottomRef = useRef(null)

  function load() {
    setLoading(true)
    setError('')
    api.salesPortal.get(token)
      .then(setState)
      .catch((err) => setError(err.message || 'This link isn\u2019t valid.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [token])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [state?.conversation?.length])

  async function send(e) {
    e.preventDefault()
    if (!input.trim() || sending) return
    setSending(true)
    setError('')
    const message = input
    setInput('')
    try {
      await api.salesPortal.sendMessage(token, message)
      load()
    } catch (err) {
      setError(err.message || 'Something went wrong sending that.')
    } finally {
      setSending(false)
    }
  }

  async function acceptProposal() {
    setAccepting(true)
    try {
      await api.salesPortal.accept(token)
      setAccepted(true)
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setAccepting(false)
    }
  }

  if (loading && !state) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-mist">
        <Loader2 className="w-6 h-6 animate-spin text-ink/30" />
      </div>
    )
  }

  if (error && !state) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-mist px-4">
        <div className="text-center max-w-sm">
          <p className="font-display font-semibold text-lg mb-2">This link isn't valid</p>
          <p className="text-sm text-ink/50">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-mist flex flex-col">
      <header className="border-b border-line bg-white px-6 py-4 flex items-center gap-3">
        <span className="w-9 h-9 rounded-xl bg-ferozi-soft flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-ferozi-deep" />
        </span>
        <div>
          <p className="font-display font-semibold">Sales AI</p>
          <p className="text-xs text-ink/40">Talking with {state?.name}{state?.company ? ` \u00b7 ${state.company}` : ''}</p>
        </div>
      </header>

      <div className="flex-1 max-w-2xl w-full mx-auto px-4 py-6 flex flex-col">
        {state?.missingFields?.length > 0 && (
          <div className="mb-4 rounded-xl border border-line bg-white p-3 text-xs text-ink/50">
            Still need: {state.missingFields.map((f) => FIELD_LABELS[f] || f).join(', ')}
          </div>
        )}

        <div className="flex-1 space-y-3 mb-4">
          {(state?.conversation || []).length === 0 && (
            <div className="rounded-xl border border-dashed border-line bg-white p-4 text-sm text-ink/45 text-center">
              Say hello to get started — tell us a bit about the website you need.
            </div>
          )}
          {(state?.conversation || []).map((m, i) => (
            <div key={i} className={`flex ${m.sender === 'client' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${m.sender === 'client' ? 'bg-ink text-white' : 'bg-white border border-line text-ink/80'}`}>
                {m.content}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {state?.dealClosed || accepted ? (
          <div className="rounded-2xl border border-ferozi/30 bg-ferozi-soft p-5 text-center">
            <CheckCircle2 className="w-6 h-6 text-ferozi-deep mx-auto mb-2" />
            <p className="font-semibold text-sm">You're all set — we're getting started on your project right away.</p>
          </div>
        ) : (
          <>
            {state?.missingFields?.length === 0 && (
              <button
                onClick={acceptProposal}
                disabled={accepting}
                className="mb-3 w-full flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" /> {accepting ? 'Confirming...' : 'Accept Proposal & Get Started'}
              </button>
            )}
            <form onSubmit={send} className="flex items-center gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 rounded-full border border-line px-4 py-3 text-sm outline-none focus:border-ferozi focus:ring-2 focus:ring-ferozi/20 bg-white"
              />
              <button
                type="submit"
                disabled={sending}
                className="w-11 h-11 rounded-full bg-ink text-white flex items-center justify-center hover:bg-ferozi-deep transition-colors disabled:opacity-50 shrink-0"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </form>
          </>
        )}
        {error && <p className="mt-2 text-xs text-red-600 text-center">{error}</p>}
      </div>
    </div>
  )
}
