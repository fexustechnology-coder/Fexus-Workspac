import { useEffect, useRef, useState } from 'react'
import { Loader2, Send } from 'lucide-react'

/**
 * ChatPanel — a self-contained chat UI. `sendFn(message, history)` should
 * return a Promise resolving to the assistant's reply text. History is kept
 * in component state only (never persisted), matching the "no memory of its
 * own" design used across every Brain chat in this app.
 */
export default function ChatPanel({ sendFn, emptyIcon: EmptyIcon, emptyText, placeholder = 'Ask a question...' }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const scrollRef = useRef(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  async function send(e) {
    e.preventDefault()
    const text = input.trim()
    if (!text || sending) return

    const nextMessages = [...messages, { role: 'user', content: text }]
    setMessages(nextMessages)
    setInput('')
    setSending(true)
    setError('')

    try {
      const reply = await sendFn(text, messages)
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }])
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-white shadow-card flex flex-col h-[70vh]">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center text-sm text-ink/35">
            {EmptyIcon && <EmptyIcon className="w-8 h-8 text-ink/15 mb-3" />}
            {emptyText}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${
                m.role === 'user' ? 'bg-ink text-white' : 'bg-mist text-ink/85'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-4 py-3 bg-mist text-ink/50 text-sm flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Reading department data...
            </div>
          </div>
        )}
      </div>

      {error && <p className="px-6 text-sm text-red-600">{error}</p>}

      <form onSubmit={send} className="p-4 border-t border-line flex items-center gap-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          className="flex-1 rounded-full border border-line px-4 py-2.5 text-sm outline-none focus:border-ferozi focus:ring-2 focus:ring-ferozi/20 transition-all"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="w-10 h-10 rounded-full bg-ink text-white flex items-center justify-center hover:bg-ferozi-deep transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  )
}
