import { useState } from 'react'
import PageHeader from '../../components/ui/PageHeader'
import ConnectedEmailsManager from '../../components/ui/ConnectedEmailsManager'
import { Mail } from 'lucide-react'

// Phase 21 — every authenticated account (Owner or team member) gets its
// own fully isolated Connected Emails system. This is the User side of
// exactly the same real backend and the same shared component
// OwnerSettings.jsx uses — never a shared pool, never an owner dependency.
export default function UserSettings() {
  const [tab, setTab] = useState('connected-emails')

  return (
    <div>
      <PageHeader
        eyebrow="Workspace Settings"
        title="Your Connected Emails."
        description="Your own sender pool, completely separate from everyone else's — connect real accounts here, then use them from Email Campaigns."
      />

      <div className="flex items-center gap-1 p-1 rounded-lg bg-mist border border-line mb-6 w-fit">
        <button
          onClick={() => setTab('connected-emails')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold transition-colors ${tab === 'connected-emails' ? 'bg-white shadow-sm text-ink' : 'text-ink/45 hover:text-ink/70'}`}
        >
          <Mail className="w-3.5 h-3.5" /> Connected Emails
        </button>
      </div>

      {tab === 'connected-emails' && <ConnectedEmailsManager />}
    </div>
  )
}
