import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Menu, Search, Bell, Keyboard, ChevronDown, LogOut, X } from 'lucide-react'
import { useWorkspace } from '../../lib/WorkspaceContext'
import { useAuth } from '../../lib/AuthContext'

const SHORTCUTS = [
  { keys: ['⌘', 'K'], label: 'Open the command palette' },
  { keys: ['Esc'], label: 'Close any open panel' },
  { keys: ['↑', '↓'], label: 'Move through command results' },
  { keys: ['Enter'], label: 'Jump to the highlighted result' }
]

function ShortcutsModal({ open, onClose }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-ink/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed z-[70] left-1/2 top-24 -translate-x-1/2 w-[min(420px,92vw)] rounded-2xl border border-line bg-white shadow-panel p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-semibold text-base">Keyboard shortcuts</h3>
              <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-mist">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              {SHORTCUTS.map((s) => (
                <div key={s.label} className="flex items-center justify-between text-sm">
                  <span className="text-ink/70">{s.label}</span>
                  <span className="flex items-center gap-1">
                    {s.keys.map((k) => (
                      <kbd key={k} className="font-mono text-[11px] px-2 py-1 rounded border border-line bg-mist text-ink/60">{k}</kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

export default function Topbar() {
  const { setMobileOpen, setCommandOpen, notifOpen, setNotifOpen, mode, unreadCount } = useWorkspace()
  const { user, isOwner, logout } = useAuth()
  const navigate = useNavigate()
  const [profileOpen, setProfileOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const profileRef = useRef(null)

  useEffect(() => {
    function onClick(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  async function handleSignOut() {
    await logout()
    navigate('/login', { replace: true })
  }

  const initial = (user?.name || '?').trim().charAt(0).toUpperCase()

  return (
    <header className="sticky top-0 z-30 glass border-b border-line">
      <div className="flex items-center justify-between gap-4 h-16 px-4 lg:px-6">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden w-9 h-9 rounded-lg flex items-center justify-center hover:bg-mist shrink-0"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="hidden sm:flex items-center gap-2 text-sm text-ink/40 min-w-0">
            <span className="font-medium text-ink/70 truncate">FEXUS Technologies</span>
            <span className="text-ink/20">/</span>
            <span className="capitalize truncate">{isOwner && mode === 'owner' ? 'Owner Workspace' : 'Workspace'}</span>
          </div>
        </div>

        <button
          onClick={() => setCommandOpen(true)}
          className="hidden md:flex items-center gap-2.5 w-full max-w-sm rounded-full border border-line bg-white/70 px-4 py-2 text-sm text-ink/40 hover:border-aqua/50 transition-colors"
        >
          <Search className="w-4 h-4" />
          <span className="flex-1 text-left">Search or jump to...</span>
          <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-line bg-mist text-ink/40">⌘K</kbd>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setCommandOpen(true)}
            className="md:hidden w-9 h-9 rounded-lg flex items-center justify-center hover:bg-mist"
          >
            <Search className="w-[18px] h-[18px]" />
          </button>

          <button
            onClick={() => setShortcutsOpen(true)}
            className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-mist transition-colors"
            title="Keyboard shortcuts"
          >
            <Keyboard className="w-[18px] h-[18px]" />
          </button>

          <button
            onClick={() => setNotifOpen(!notifOpen)}
            className="relative w-9 h-9 rounded-lg flex items-center justify-center hover:bg-mist transition-colors"
          >
            <Bell className="w-[18px] h-[18px]" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-aqua border-2 border-white" />
            )}
          </button>

          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setProfileOpen((v) => !v)}
              className="flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-full hover:bg-mist transition-colors"
            >
              <span className="w-7 h-7 rounded-full bg-ink flex items-center justify-center text-white text-xs font-semibold">
                {initial}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-ink/40 hidden sm:block" />
            </button>

            {profileOpen && (
              <div className="absolute right-0 mt-2 w-52 rounded-xl border border-line bg-white shadow-card-hover p-1.5">
                <div className="px-3 py-2 border-b border-line mb-1">
                  <p className="text-sm font-semibold text-ink truncate">{user?.name}</p>
                  <p className="text-xs text-ink/40 truncate">{user?.email}</p>
                  <p className="text-[10px] font-mono uppercase tracking-wideish text-ferozi-deep mt-1">
                    {isOwner ? 'Owner' : 'Company User'}
                  </p>
                </div>
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm rounded-lg text-ink/70 hover:bg-mist hover:text-ink transition-colors"
                >
                  <LogOut className="w-4 h-4" /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </header>
  )
}
