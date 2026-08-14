import {
  LayoutDashboard, BarChart3, Settings,
  Contact, Receipt, TrendingUp,
  Brain, Crown, Wallet, HeartHandshake, Workflow, Briefcase, Users, Bot, Zap, Cpu, Plug, Sparkles, Mail, KeyRound, Mic
} from 'lucide-react'

export const OWNER_NAV = [
  { label: 'Dashboard', to: '/owner/dashboard', icon: LayoutDashboard },
  { label: 'CEO Brain', to: '/ceo-brain', icon: Crown },
  // Phase 18 — MVP Simplification. These three stay fully in the
  // architecture (routes, backend, data — nothing deleted) but are hidden
  // from the sidebar so the visible product matches the simplified
  // Owner -> CEO -> 2 Employees narrative. Set hidden: false (or delete
  // the flag) to bring any of them back — no other code change needed.
  { label: 'Directors', to: '/directors', icon: Users, hidden: true },
  { label: 'Employees', to: '/employees', icon: Bot },
  { label: 'Website AI', to: '/website-ai', icon: Sparkles },
  { label: 'Growth AI', to: '/growth-ai', icon: TrendingUp },
  { label: 'License Management', to: '/license-management', icon: KeyRound },
  { label: 'Local PC Agent', to: '/local-agent', icon: Plug },
  { label: 'Voice Agent', to: '/voice-agent', icon: Mic },
  { label: 'Email Campaigns', to: '/email-campaigns', icon: Mail },
  { label: 'Workflow Engine', to: '/workflow-engine', icon: Workflow },
  { label: 'Automation Engine', to: '/automation-engine', icon: Zap },
  { label: 'Memory Engine', to: '/memory-engine', icon: Cpu, hidden: true },
  { label: 'Integration Layer', to: '/integration-layer', icon: Plug, hidden: true },
  { label: 'Analytics', to: '/owner/analytics', icon: BarChart3 },
  { label: 'Company Office', to: '/company-office', icon: Briefcase },
  { label: 'Company Brain', to: '/company-brain', icon: Brain },
  { label: 'Settings', to: '/owner/settings', icon: Settings }
]

export const USER_NAV = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Clients', to: '/clients', icon: Contact },
  { label: 'Invoices', to: '/invoices', icon: Receipt },
  // Phase 21 — real, fully isolated per account, not Owner-only anymore.
  { label: 'Email Campaigns', to: '/email-campaigns', icon: Mail },
  // Real, existing Owner-built pages, reused directly (not duplicated)
  // at a new, User-panel path. Real backend authorization was updated
  // (per explicit Owner instruction) so any signed-in Company User can
  // genuinely use both — Voice Agent/Task Engine and Website AI's real
  // routes now require only requireAuth, not requireOwner. The one,
  // explicit exception: real Desktop/Local PC Agent control remains
  // Owner-only (routes/localAgent.js, untouched) — a Company User's own
  // task will naturally, honestly fail to reach the real PC (no
  // LocalAgentPairing exists under their account), never a guess or a
  // shared pairing.
  { label: 'Website AI', to: '/user/website-ai', icon: Sparkles },
  { label: 'Voice Agent', to: '/user/voice-agent', icon: Mic },
  { label: 'Settings', to: '/settings', icon: Settings }
]

export const FUTURE_NAV = [
  { label: 'Finance', to: '/finance', icon: Wallet },
  { label: 'Customer Success', to: '/customer-success', icon: HeartHandshake }
]

export const ALL_COMMANDS = [
  ...OWNER_NAV.filter((n) => !n.hidden).map((n) => ({ ...n, group: 'Owner' })),
  ...USER_NAV.map((n) => ({ ...n, group: 'Workspace' })),
  ...FUTURE_NAV.map((n) => ({ ...n, group: 'Coming Soon' }))
]
