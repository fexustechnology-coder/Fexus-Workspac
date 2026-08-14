import { useEffect, useState } from 'react'
import PageHeader from '../../components/ui/PageHeader'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import QuickAddForm from '../../components/ui/QuickAddForm'
import ConnectedEmailsManager from '../../components/ui/ConnectedEmailsManager'
import { api } from '../../lib/api'
import {
  Building2, Layers, Palette, ShieldCheck, Bell, Users2, CreditCard, Package, KeyRound, Mail, CheckCircle2
} from 'lucide-react'

const TABS = [
  { id: 'company', label: 'Company', icon: Building2 },
  { id: 'workspace', label: 'Workspace', icon: Layers },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'security', label: 'Security', icon: ShieldCheck },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'users', label: 'Users', icon: Users2 },
  { id: 'billing', label: 'Billing', icon: CreditCard },
  { id: 'packages', label: 'Packages', icon: Package },
  // Phase 21 — its own prominent tab, not buried inside API Keys. Google
  // OAuth is only one provider option within it, never the whole page.
  { id: 'connected-emails', label: 'Connected Emails', icon: Mail },
  { id: 'api', label: 'API Keys', icon: KeyRound }
]

const PLANS = [
  { name: 'Starter', desc: '3 AI Employees', price: '$99/month' },
  { name: 'Growth', desc: '6 AI Employees', price: '$249/month' },
  { name: 'Scale', desc: 'Full AI Workforce', price: '$599/month' }
]

// Phase 16 — the real Billing tab. Replaces the old session-only plan
// selector: this reads real plans/subscription state from the backend and,
// on subscribe, creates a REAL Stripe Checkout Session and redirects to it.
function BillingCard() {
  const [config, setConfig] = useState(null)
  const [plans, setPlans] = useState([])
  const [subscription, setSubscription] = useState(null)
  const [error, setError] = useState('')
  const [cycle, setCycle] = useState('monthly')
  const [subscribing, setSubscribing] = useState('')

  function load() {
    setError('')
    Promise.all([api.payments.config(), api.payments.plans(), api.payments.subscription()])
      .then(([c, p, s]) => { setConfig(c); setPlans(p.plans); setSubscription(s.subscription) })
      .catch((err) => setError(err.message || 'Failed to load billing information.'))
  }
  useEffect(load, [])

  async function subscribe(planKey) {
    setSubscribing(planKey)
    try {
      const { checkoutUrl } = await api.payments.subscribe(planKey, cycle)
      window.location.href = checkoutUrl
    } catch (err) {
      setError(err.message)
      setSubscribing('')
    }
  }

  if (error) {
    return (
      <SettingsCard title="Billing" description="Real subscription billing via Stripe.">
        <p className="text-sm text-red-600">{error}</p>
        <button onClick={load} className="mt-3 text-xs font-semibold underline">Try again</button>
      </SettingsCard>
    )
  }
  if (!config) return <SettingsCard title="Billing" description="Loading..."><p className="text-sm text-ink/40">Loading...</p></SettingsCard>

  return (
    <SettingsCard title="Billing" description="Real subscription billing — Stripe Checkout, not a session-only label.">
      {!config.providers.stripe && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
          Stripe isn't configured yet — set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in backend/.env to enable real checkout.
        </p>
      )}

      {subscription && (
        <div className="rounded-xl border border-ferozi/30 bg-ferozi-soft p-4 mb-5 flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="font-display font-semibold">Current plan: {subscription.planKey}</p>
            <p className="text-xs text-ink/50 mt-0.5">Status: {subscription.status}{subscription.currentPeriodEnd ? ` · renews ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}` : ''}</p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-1 p-1 rounded-lg bg-mist border border-line mb-4 w-fit">
        <button onClick={() => setCycle('monthly')} className={`px-3 py-1.5 rounded-md text-xs font-semibold ${cycle === 'monthly' ? 'bg-white shadow-sm' : 'text-ink/45'}`}>Monthly</button>
        <button onClick={() => setCycle('yearly')} className={`px-3 py-1.5 rounded-md text-xs font-semibold ${cycle === 'yearly' ? 'bg-white shadow-sm' : 'text-ink/45'}`}>Yearly</button>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        {plans.map((p) => (
          <div key={p.key} className={`rounded-xl border p-5 ${subscription?.planKey === p.key ? 'border-ferozi bg-ferozi-soft' : 'border-line'}`}>
            <p className="font-display font-semibold">{p.name}</p>
            <p className="text-2xl font-bold mt-1">${cycle === 'yearly' ? p.priceYearly : p.priceMonthly}<span className="text-sm font-normal text-ink/40">/{cycle === 'yearly' ? 'yr' : 'mo'}</span></p>
            <ul className="mt-3 space-y-1 mb-4">
              {p.features.map((f) => <li key={f} className="text-xs text-ink/55">• {f}</li>)}
            </ul>
            <button
              onClick={() => subscribe(p.key)}
              disabled={!config.providers.stripe || subscribing === p.key || subscription?.planKey === p.key}
              className="w-full px-4 py-2 rounded-full bg-ink text-white text-xs font-semibold hover:bg-ferozi-deep transition-colors disabled:opacity-40"
            >
              {subscription?.planKey === p.key ? 'Current Plan' : subscribing === p.key ? 'Redirecting...' : 'Subscribe'}
            </button>
          </div>
        ))}
      </div>
    </SettingsCard>
  )
}

// Phase 15 — the real Gmail OAuth2 connect/disconnect card. Unlike the
// session-only "API Keys" list below it, this one is backed by a real
// integration (backend/src/lib/gmail.js) — connecting here is what lets
// Sales AI and scheduled follow-ups actually send email.
function GmailIntegrationCard() {
  const [status, setStatus] = useState(null)
  const [error, setError] = useState('')
  const [testTo, setTestTo] = useState('')
  const [testResult, setTestResult] = useState('')

  function load() {
    api.gmail.status().then(setStatus).catch((err) => setError(err.message))
  }
  useEffect(load, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('gmail')) {
      load()
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  async function disconnect() {
    setError('')
    try {
      await api.gmail.disconnect()
      load()
    } catch (err) {
      setError(err.message || 'Failed to disconnect.')
    }
  }

  async function sendTest() {
    setTestResult('')
    try {
      await api.gmail.sendTest(testTo)
      setTestResult('Sent — check the inbox.')
    } catch (err) {
      setTestResult(err.message)
    }
  }

  return (
    <SettingsCard title="System Email (Sales AI & Notifications)" description="A single account used only for automated system messages — Sales AI's autonomous replies, scheduled follow-ups, and team invites. This is intentionally separate from Connected Emails below.">
      <p className="text-sm text-ink/60 bg-mist rounded-lg px-3 py-2.5 mb-4">
        Campaigns never use this account, even if it's connected — every campaign send comes only from the
        {' '}<span className="text-ferozi-deep font-semibold">Connected Emails</span> tab, the permanent, unlimited, per-account sender system.
      </p>
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      {!status ? (
        <p className="text-sm text-ink/40">Loading...</p>
      ) : !status.configured ? (
        <p className="text-sm text-ink/60">
          Not configured yet. Set <code className="font-mono bg-mist px-1 rounded">GOOGLE_CLIENT_ID</code> and{' '}
          <code className="font-mono bg-mist px-1 rounded">GOOGLE_CLIENT_SECRET</code> in <code className="font-mono bg-mist px-1 rounded">backend/.env</code> —
          see backend/README.md for the exact Google Cloud Console steps.
        </p>
      ) : status.connected ? (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="w-4 h-4 text-ferozi-deep" />
            <p className="text-sm">Connected as <span className="font-semibold">{status.email}</span></p>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="Send a real test email to..." className="flex-1 rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-ferozi" />
            <button onClick={sendTest} className="px-4 py-2 rounded-full bg-ink text-white text-xs font-semibold hover:bg-ferozi-deep transition-colors shrink-0">Send Test</button>
          </div>
          {testResult && <p className="text-xs text-ink/50 mb-3">{testResult}</p>}
          <button onClick={disconnect} className="text-xs font-semibold text-red-500 hover:underline">Disconnect Gmail</button>
        </div>
      ) : (
        <a
          href={api.gmail.connectUrl()}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors"
        >
          <Mail className="w-4 h-4" /> Connect Gmail
        </a>
      )}
    </SettingsCard>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">{label}</label>
      <div className="mt-2">{children}</div>
    </div>
  )
}

function TextInput(props) {
  return (
    <input
      {...props}
      className="w-full rounded-lg border border-line px-4 py-2.5 text-sm outline-none focus:border-ferozi focus:ring-2 focus:ring-ferozi/20 transition-all"
    />
  )
}

function Toggle({ label, description, checked, onChange, defaultChecked = false }) {
  // Phase 17 — supports BOTH a controlled mode (checked + onChange, backed
  // by real persistence) and the original uncontrolled mode (defaultChecked
  // only), so this one component still works for any future toggle that
  // genuinely has nothing to persist yet.
  const [localChecked, setLocalChecked] = useState(defaultChecked)
  const isControlled = checked !== undefined
  const value = isControlled ? checked : localChecked
  function toggle() {
    if (isControlled) onChange(!value)
    else setLocalChecked((v) => !v)
  }
  return (
    <div className="flex items-center justify-between py-3 border-b border-line last:border-0">
      <div>
        <p className="text-sm font-medium text-ink">{label}</p>
        {description && <p className="text-xs text-ink/45 mt-0.5">{description}</p>}
      </div>
      <button
        onClick={toggle}
        className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${value ? 'bg-ferozi' : 'bg-line'}`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            value ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  )
}

function SettingsCard({ title, description, children }) {
  return (
    <div className="rounded-2xl border border-line bg-white shadow-card p-6 sm:p-8">
      <h3 className="font-display font-semibold text-lg">{title}</h3>
      {description && <p className="text-sm text-ink/50 mt-1 mb-6">{description}</p>}
      {!description && <div className="mb-6" />}
      {children}
    </div>
  )
}

// Phase 17 — real, persistent Company tab. Uses local buffered state so
// typing doesn't fire a save on every keystroke — only "Save changes" (or
// blur) commits to the backend.
function CompanyTab({ settings, settingsError, onSave, saved }) {
  const [form, setForm] = useState(null)

  useEffect(() => {
    if (settings && !form) {
      setForm({ companyName: settings.companyName, companyWebsite: settings.companyWebsite, companyIndustry: settings.companyIndustry, companySize: settings.companySize })
    }
  }, [settings])

  if (settingsError) {
    return <SettingsCard title="Company profile" description="Basic information about your workspace."><p className="text-sm text-red-600">{settingsError}</p></SettingsCard>
  }
  if (!form) return <SettingsCard title="Company profile" description="Loading..."><p className="text-sm text-ink/40">Loading...</p></SettingsCard>

  return (
    <SettingsCard title="Company profile" description="Basic information about your workspace.">
      <div className="grid sm:grid-cols-2 gap-5">
        <Field label="Company Name"><TextInput value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} /></Field>
        <Field label="Website"><TextInput value={form.companyWebsite} onChange={(e) => setForm({ ...form, companyWebsite: e.target.value })} /></Field>
        <Field label="Industry"><TextInput value={form.companyIndustry} onChange={(e) => setForm({ ...form, companyIndustry: e.target.value })} /></Field>
        <Field label="Company Size"><TextInput value={form.companySize} onChange={(e) => setForm({ ...form, companySize: e.target.value })} /></Field>
      </div>
      <p className="mt-3 text-xs text-ink/40">
        For persisted business context (mission, brand voice, pricing, etc.), use{' '}
        <span className="font-semibold text-ink/60">Company Brain</span> in the sidebar — this tab is
        lightweight account info only.
      </p>
      <button
        onClick={() => onSave(form)}
        className="mt-4 px-6 py-2.5 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors"
      >
        {saved ? 'Saved ✓' : 'Save changes'}
      </button>
    </SettingsCard>
  )
}

export default function OwnerSettings() {
  const [active, setActive] = useState('company')

  // Phase 17 — one real WorkspaceSettings row backing Company, Workspace,
  // Appearance, Security, and Notifications all at once.
  const [settings, setSettings] = useState(null)
  const [settingsError, setSettingsError] = useState('')
  const [saved, setSaved] = useState(false)

  function loadSettings() {
    setSettingsError('')
    api.settings.get().then(({ settings }) => setSettings(settings)).catch((err) => setSettingsError(err.message || 'Failed to load settings.'))
  }
  useEffect(loadSettings, [])

  async function saveSettings(patch) {
    const merged = { ...settings, ...patch }
    setSettings(merged) // optimistic — feels instant
    try {
      const { settings: real } = await api.settings.update(patch)
      setSettings(real)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setSettingsError(err.message || 'Failed to save.')
      loadSettings() // roll back to the real persisted value on failure
    }
  }

  const [members, setMembers] = useState([])
  const [teamError, setTeamError] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteError, setInviteError] = useState('')

  function loadTeam() {
    setTeamError('')
    api.settings.team().then(({ members }) => setMembers(members)).catch((err) => setTeamError(err.message || 'Failed to load team.'))
  }
  useEffect(loadTeam, [])

  const [apiKeys, setApiKeys] = useState([])
  const [apiKeysError, setApiKeysError] = useState('')
  const [newKeyReveal, setNewKeyReveal] = useState(null)

  function loadApiKeys() {
    setApiKeysError('')
    api.settings.apiKeys.list().then(({ keys }) => setApiKeys(keys)).catch((err) => setApiKeysError(err.message || 'Failed to load API keys.'))
  }
  useEffect(loadApiKeys, [])

  const [plan, setPlan] = useState('Growth')
  const [planOpen, setPlanOpen] = useState(false)

  async function inviteMember(values) {
    setInviteError('')
    try {
      const { invite, emailSent } = await api.settings.invite(values.email, values.role)
      setMembers((prev) => [...prev, { id: invite.id, name: invite.email.split('@')[0], email: invite.email, role: invite.role, status: 'Pending', emailSent }])
      setInviteOpen(false)
    } catch (err) {
      setInviteError(err.message || 'Failed to send invite.')
    }
  }

  async function generateKey(name) {
    setApiKeysError('')
    try {
      const { key, fullKey } = await api.settings.apiKeys.create(name)
      setApiKeys((prev) => [{ id: key.id, name: key.name, keyPrefix: key.keyPrefix, createdAt: key.createdAt }, ...prev])
      setNewKeyReveal(fullKey) // shown exactly once — never retrievable again after this
    } catch (err) {
      setApiKeysError(err.message || 'Failed to generate key.')
    }
  }

  async function revokeKey(id) {
    setApiKeysError('')
    try {
      await api.settings.apiKeys.revoke(id)
      setApiKeys((prev) => prev.filter((k) => k.id !== id))
    } catch (err) {
      setApiKeysError(err.message || 'Failed to revoke key.')
    }
  }

  function panelFor(id) {
    switch (id) {
      case 'company':
        return <CompanyTab settings={settings} settingsError={settingsError} onSave={saveSettings} saved={saved} />
      case 'workspace':
        return (
          <SettingsCard title="Workspace preferences" description="Defaults applied across the FEXUS Workspace.">
            {settingsError && <p className="text-sm text-red-600 mb-3">{settingsError}</p>}
            {!settings ? <p className="text-sm text-ink/40">Loading...</p> : (
              <>
                <Toggle label="Default landing page" description="Open Owner Dashboard on sign-in" checked={settings.defaultLandingPage} onChange={(v) => saveSettings({ defaultLandingPage: v })} />
                <Toggle label="Compact sidebar" description="Start collapsed by default" checked={settings.compactSidebar} onChange={(v) => saveSettings({ compactSidebar: v })} />
                <Toggle label="Show Coming Soon modules" description="Keep future-phase pages visible in navigation" checked={settings.showComingSoonPages} onChange={(v) => saveSettings({ showComingSoonPages: v })} />
              </>
            )}
          </SettingsCard>
        )
      case 'appearance':
        return (
          <SettingsCard title="Appearance" description="Visual preferences for your workspace.">
            {settingsError && <p className="text-sm text-red-600 mb-3">{settingsError}</p>}
            <div className="grid sm:grid-cols-3 gap-4">
              {['light', 'dark', 'system'].map((t) => (
                <button
                  key={t}
                  onClick={() => saveSettings({ theme: t })}
                  disabled={!settings}
                  className={`rounded-xl border p-4 text-left transition-colors ${
                    settings?.theme === t ? 'border-ferozi bg-ferozi-soft' : 'border-line hover:border-ink/20'
                  }`}
                >
                  <div className={`h-16 rounded-lg mb-3 ${t === 'dark' ? 'bg-ink' : 'bg-mist border border-line'}`} />
                  <p className="text-sm font-medium capitalize">{t}</p>
                </button>
              ))}
            </div>
            <p className="mt-4 text-xs text-ink/40">
              Your choice is saved — a full Dark theme visual treatment across every screen is
              still planned, so selecting Dark saves the preference without yet changing every
              screen's colors.
            </p>
          </SettingsCard>
        )
      case 'security':
        return (
          <SettingsCard title="Security" description="Protect access to your FEXUS Workspace.">
            {settingsError && <p className="text-sm text-red-600 mb-3">{settingsError}</p>}
            {!settings ? <p className="text-sm text-ink/40">Loading...</p> : (
              <>
                <Toggle label="Two-factor authentication" description="Require a verification code on sign-in" checked={settings.twoFactorEnabled} onChange={(v) => saveSettings({ twoFactorEnabled: v })} />
                <Toggle label="Single sign-on (SSO)" description="Allow team members to sign in with SSO" checked={settings.ssoEnabled} onChange={(v) => saveSettings({ ssoEnabled: v })} />
                <Toggle label="Session timeout" description="Automatically sign out after 30 minutes idle" checked={settings.sessionTimeoutEnabled} onChange={(v) => saveSettings({ sessionTimeoutEnabled: v })} />
              </>
            )}
            <p className="mt-4 text-xs text-ink/40">
              Sign-in itself is real (JWT session cookie). The toggles above are now saved for
              real, but 2FA/SSO enforcement isn't wired up yet — turning them on records the
              preference without yet requiring it at login.
            </p>
          </SettingsCard>
        )
      case 'notifications':
        return (
          <SettingsCard title="Notifications" description="Choose what shows up in your notification center.">
            {settingsError && <p className="text-sm text-red-600 mb-3">{settingsError}</p>}
            {!settings ? <p className="text-sm text-ink/40">Loading...</p> : (
              <>
                <Toggle label="Billing alerts" description="Overdue invoices and payment failures" checked={settings.billingAlerts} onChange={(v) => saveSettings({ billingAlerts: v })} />
                <Toggle label="Project updates" description="Status changes on projects you follow" checked={settings.projectUpdates} onChange={(v) => saveSettings({ projectUpdates: v })} />
                <Toggle label="AI Workforce updates" description="Status changes for AI Employees" checked={settings.aiWorkforceUpdates} onChange={(v) => saveSettings({ aiWorkforceUpdates: v })} />
                <Toggle label="Weekly summary email" description="A digest every Monday morning" checked={settings.weeklySummaryEmail} onChange={(v) => saveSettings({ weeklySummaryEmail: v })} />
              </>
            )}
          </SettingsCard>
        )
      case 'users':
        return (
          <SettingsCard title="Team members" description="Manage who has access to this workspace.">
            {teamError && <p className="text-sm text-red-600 mb-3">{teamError}</p>}
            <div className="divide-y divide-line">
              {members.map((u) => (
                <div key={u.email} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-full bg-ink text-white text-xs font-semibold flex items-center justify-center">
                      {u.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-ink">{u.name}</p>
                      <p className="text-xs text-ink/45">{u.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {u.status === 'Pending' && (
                      <>
                        <Badge tone="warning">{u.emailSent ? 'Invited' : 'Pending — email not sent'}</Badge>
                        <button onClick={async () => { await api.settings.revokeInvite(u.id); loadTeam() }} className="text-xs text-red-500 hover:underline">Revoke</button>
                      </>
                    )}
                    <Badge tone={u.role === 'Owner' ? 'dark' : 'neutral'}>{u.role}</Badge>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => setInviteOpen(true)}
              className="mt-5 px-6 py-2.5 rounded-full border border-line text-sm font-semibold hover:border-ferozi hover:text-ferozi-deep transition-colors"
            >
              Invite member
            </button>
            <p className="mt-3 text-xs text-ink/35">
              If Gmail is connected (API Keys tab), invites are sent as a real email. Otherwise
              the invite is still created for real, but you'll need to share the sign-up link yourself.
            </p>
          </SettingsCard>
        )
      case 'billing':
        return <BillingCard />
      case 'packages':
        return (
          <SettingsCard title="Packages" description="AI Employee packages available to this workspace.">
            <div className="grid sm:grid-cols-3 gap-4">
              {PLANS.map((p) => (
                <button
                  key={p.name}
                  onClick={() => setPlan(p.name)}
                  className={`text-left rounded-xl border p-5 transition-colors ${plan === p.name ? 'border-ferozi bg-ferozi-soft' : 'border-line hover:border-ink/20'}`}
                >
                  <p className="font-display font-semibold">{p.name}</p>
                  <p className="text-sm text-ink/50 mt-1">{p.desc}</p>
                  {plan === p.name && <Badge tone="ferozi" className="mt-3" dot>Current</Badge>}
                </button>
              ))}
            </div>
          </SettingsCard>
        )
      case 'connected-emails':
        return <ConnectedEmailsManager />
      case 'api':
        return (
          <>
          <GmailIntegrationCard />
          <SettingsCard title="API Keys" description="Real keys — the full value is shown exactly once, right after you generate it.">
            {apiKeysError && <p className="text-sm text-red-600 mb-3">{apiKeysError}</p>}
            {newKeyReveal && (
              <div className="rounded-xl border border-ferozi/30 bg-ferozi-soft p-4 mb-4">
                <p className="text-xs font-semibold text-ferozi-deep mb-2">Copy this now — you won't be able to see it again:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 font-mono text-xs bg-white rounded-lg px-3 py-2 break-all">{newKeyReveal}</code>
                  <button onClick={() => { navigator.clipboard?.writeText(newKeyReveal); }} className="px-3 py-2 rounded-lg border border-line text-xs font-semibold hover:border-ferozi shrink-0">Copy</button>
                </div>
                <button onClick={() => setNewKeyReveal(null)} className="mt-2 text-xs text-ink/45 hover:underline">Done, I've saved it</button>
              </div>
            )}
            <div className="divide-y divide-line">
              {apiKeys.map((k) => (
                <div key={k.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium text-ink">{k.name}</p>
                    <p className="text-xs font-mono text-ink/45 mt-0.5">{k.keyPrefix}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-ink/35">Created {new Date(k.createdAt).toLocaleDateString()}</span>
                    <button onClick={() => revokeKey(k.id)} className="text-xs font-semibold text-red-500 hover:underline">Revoke</button>
                  </div>
                </div>
              ))}
              {apiKeys.length === 0 && <p className="text-sm text-ink/40 py-3">No API keys yet.</p>}
            </div>
            <button
              onClick={() => { const name = window.prompt('Name this key (e.g. "Production")'); if (name?.trim()) generateKey(name.trim()) }}
              className="mt-5 px-6 py-2.5 rounded-full border border-line text-sm font-semibold hover:border-ferozi hover:text-ferozi-deep transition-colors"
            >
              Generate new key
            </button>
            <p className="mt-3 text-xs text-ink/35">
              Only a bcrypt hash of each key is stored — the same real pattern used for account
              passwords. Revoking a key here is real and immediate.
            </p>
          </SettingsCard>
          </>
        )
      default:
        return null
    }
  }

  return (
    <div>
      <PageHeader eyebrow="Owner Workspace" title="Settings" description="Configure your company, workspace, and account." />

      <div className="grid lg:grid-cols-[220px_1fr] gap-6">
        <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
          {TABS.map((t) => {
            const Icon = t.icon
            return (
              <button
                key={t.id}
                onClick={() => setActive(t.id)}
                className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                  active === t.id ? 'bg-ink text-white' : 'text-ink/60 hover:bg-mist hover:text-ink'
                }`}
              >
                <Icon className={`w-4 h-4 ${active === t.id ? 'text-ferozi-glow' : ''}`} />
                {t.label}
              </button>
            )
          })}
        </nav>

        <div>{panelFor(active)}</div>
      </div>

      <Modal open={inviteOpen} onClose={() => { setInviteOpen(false); setInviteError('') }} title="Invite member">
        <QuickAddForm
          submitLabel="Send invite"
          onSubmit={inviteMember}
          fields={[
            { key: 'email', label: 'Email', type: 'email', placeholder: 'teammate@company.com' },
            { key: 'role', label: 'Role', type: 'select', options: ['Member', 'Admin'] }
          ]}
        />
        {inviteError && <p className="mt-3 text-sm text-red-600">{inviteError}</p>}
      </Modal>

      <Modal open={planOpen} onClose={() => setPlanOpen(false)} title="Manage plan">
        <div className="space-y-3">
          {PLANS.map((p) => (
            <button
              key={p.name}
              onClick={() => { setPlan(p.name); setPlanOpen(false) }}
              className={`w-full text-left rounded-xl border p-4 transition-colors ${
                plan === p.name ? 'border-ferozi bg-ferozi-soft' : 'border-line hover:border-ink/20'
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="font-display font-semibold">{p.name}</p>
                <p className="text-sm text-ink/50">{p.price}</p>
              </div>
              <p className="text-sm text-ink/50 mt-1">{p.desc}</p>
            </button>
          ))}
        </div>
        <p className="mt-4 text-xs text-ink/35 text-center">No payment provider connected — this updates the plan shown locally.</p>
      </Modal>
    </div>
  )
}
