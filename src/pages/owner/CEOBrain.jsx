import { useEffect, useRef, useState } from 'react'
import {
  Crown, LayoutDashboard, MessageSquare, Loader2, FolderKanban, Contact, Bot,
  DollarSign, Flame, ListTodo, CalendarClock, Megaphone, Receipt, HeartPulse,
  Activity, Send, Plus, Trash2
} from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Badge from '../../components/ui/Badge'
import StatCard from '../../components/ui/StatCard'
import Reveal from '../../components/ui/Reveal'
import Modal from '../../components/ui/Modal'
import QuickAddForm from '../../components/ui/QuickAddForm'
import { api } from '../../lib/api'

function healthTone(health) {
  if (health === 'Healthy') return 'success'
  if (health === 'At Risk') return 'danger'
  return 'neutral'
}

function ExecutiveDashboard() {
  const [dashboard, setDashboard] = useState(null)
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)

  function load() {
    setLoading(true)
    Promise.all([api.getCeoDashboard(), api.meetings.list()])
      .then(([d, m]) => { setDashboard(d.dashboard); setMeetings(m.items) })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function addMeeting(values) {
    try {
      await api.meetings.create({ title: values.title, withWhom: values.withWhom, scheduledAt: new Date(values.scheduledAt).toISOString() })
      setOpen(false)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function removeMeeting(id) {
    await api.meetings.remove(id)
    load()
  }

  if (loading || !dashboard) {
    return (
      <div className="flex items-center gap-2 text-sm text-ink/40 py-16 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Reading Company Brain and live business data...
      </div>
    )
  }

  return (
    <div>
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-ink/50">
          Today's Overview — <span className="font-semibold text-ink">{dashboard.today}</span>
        </p>
        <div className="flex items-center gap-2">
          <Badge tone={dashboard.systemHealth === 'Online' ? 'success' : 'danger'} dot>System {dashboard.systemHealth}</Badge>
          <Badge tone={healthTone(dashboard.companyHealth)} dot>Company {dashboard.companyHealth}</Badge>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard label="Projects Running" value={dashboard.projects.running} icon={FolderKanban} />
        <StatCard label="Projects Waiting" value={dashboard.projects.waiting} icon={FolderKanban} delay={0.05} />
        <StatCard label="Projects Completed" value={dashboard.projects.completed} icon={FolderKanban} delay={0.1} />
        <StatCard label="Active Clients" value={dashboard.clients.active} icon={Contact} delay={0.15} />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-5">
        <StatCard label="MRR" value={`$${dashboard.revenue.mrr.toLocaleString()}`} icon={DollarSign} />
        <StatCard label="Burn Rate" value={`$${dashboard.burnRate.toLocaleString()}`} icon={Flame} delay={0.05} />
        <StatCard label="Pending Tasks" value={dashboard.pendingTasks} icon={ListTodo} delay={0.1} />
        <StatCard label="Employees (AI Workforce)" value={dashboard.employees.total} icon={Bot} delay={0.15} />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-5">
        <StatCard label="Active Campaigns" value={dashboard.campaigns.active} icon={Megaphone} />
        <StatCard
          label="Outstanding Invoices"
          value={`$${dashboard.invoices.outstandingTotal.toLocaleString()}`}
          delta={`${dashboard.invoices.outstandingCount} invoice${dashboard.invoices.outstandingCount === 1 ? '' : 's'}`}
          trend="down"
          icon={Receipt}
          delay={0.05}
        />
        <StatCard label="Upcoming Meetings" value={dashboard.meetings.upcoming} icon={CalendarClock} delay={0.1} />
        <StatCard label="Robots Active" value={`${dashboard.robotStatus.active}/${dashboard.robotStatus.total}`} icon={Activity} delay={0.15} />
      </div>

      <div className="grid lg:grid-cols-2 gap-5 mt-5">
        <Reveal delay={0.1}>
          <div className="rounded-2xl border border-line bg-white shadow-card p-6 h-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-semibold text-base">Department Status</h3>
              <HeartPulse className="w-4 h-4 text-ferozi-deep" />
            </div>
            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
              {dashboard.departmentStatus.map((d) => (
                <div key={d.name} className="flex items-center justify-between text-sm">
                  <span className="text-ink/75">{d.name}</span>
                  <Badge tone={d.status === 'Idle' ? 'neutral' : 'ferozi'} dot>{d.status}</Badge>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.15}>
          <div className="rounded-2xl border border-line bg-white shadow-card p-6 h-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-semibold text-base">Meetings</h3>
              <button
                onClick={() => setOpen(true)}
                className="flex items-center gap-1.5 text-xs font-semibold text-ferozi-deep hover:underline"
              >
                <Plus className="w-3.5 h-3.5" /> Schedule
              </button>
            </div>
            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
              {meetings.length === 0 && <p className="text-sm text-ink/35">No upcoming meetings.</p>}
              {meetings.map((m) => (
                <div key={m.id} className="flex items-center justify-between text-sm gap-2">
                  <div className="min-w-0">
                    <p className="text-ink/80 truncate">{m.title}</p>
                    <p className="text-xs text-ink/40">{m.withWhom} · {new Date(m.scheduledAt).toLocaleString()}</p>
                  </div>
                  <button onClick={() => removeMeeting(m.id)} className="text-ink/25 hover:text-red-500 transition-colors shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Schedule Meeting">
        <QuickAddForm
          submitLabel="Schedule"
          onSubmit={addMeeting}
          fields={[
            { key: 'title', label: 'Meeting title', placeholder: 'e.g. Weekly ops review' },
            { key: 'withWhom', label: 'With', placeholder: 'e.g. Jordan Blake', required: false },
            { key: 'scheduledAt', label: 'Date & time', type: 'datetime-local' }
          ]}
        />
      </Modal>
    </div>
  )
}

function CEOChat() {
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
      const { reply } = await api.ceoChat(text, messages)
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
            <Crown className="w-8 h-8 text-ink/15 mb-3" />
            Ask the CEO Brain about your company — it answers only from what's
            recorded in Company Brain and your live business data.
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
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Reading Company Brain...
            </div>
          </div>
        )}
      </div>

      {error && <p className="px-6 text-sm text-red-600">{error}</p>}

      <form onSubmit={send} className="p-4 border-t border-line flex items-center gap-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about projects, revenue, clients, SOPs..."
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

export default function CEOBrain() {
  const [tab, setTab] = useState('dashboard')

  return (
    <div>
      <PageHeader
        eyebrow="CEO Brain"
        title="The Executive Operating System."
        description="Reads Company Brain and live business data before saying anything — never the other way around. Not a general chatbot."
        actions={<Badge tone="ferozi" dot><Crown className="w-3 h-3 mr-1 inline" />Owner Only</Badge>}
      />

      <div className="flex items-center gap-1 p-1 rounded-lg bg-mist border border-line mb-6 w-fit">
        <button
          onClick={() => setTab('dashboard')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-colors ${
            tab === 'dashboard' ? 'bg-white shadow-sm text-ink' : 'text-ink/45 hover:text-ink/70'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" /> Executive Dashboard
        </button>
        <button
          onClick={() => setTab('chat')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-colors ${
            tab === 'chat' ? 'bg-white shadow-sm text-ink' : 'text-ink/45 hover:text-ink/70'
          }`}
        >
          <MessageSquare className="w-4 h-4" /> CEO Chat
        </button>
      </div>

      {tab === 'dashboard' ? <ExecutiveDashboard /> : <CEOChat />}
    </div>
  )
}
