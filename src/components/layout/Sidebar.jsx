import { useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronsLeft, ChevronsRight, X, Building2 } from 'lucide-react'
import { OWNER_NAV, USER_NAV, FUTURE_NAV } from '../../lib/nav'
import { useWorkspace } from '../../lib/WorkspaceContext'
import { useAuth } from '../../lib/AuthContext'

function NavItem({ item, collapsed, onClick, muted = false }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      onClick={onClick}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
          isActive
            ? 'bg-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
            : muted
            ? 'text-white/30 hover:text-white/60 hover:bg-white/5'
            : 'text-white/60 hover:text-white hover:bg-white/[0.07]'
        }`
      }
      title={collapsed ? item.label : undefined}
    >
      {({ isActive }) => (
        <>
          <Icon className={`w-[18px] h-[18px] shrink-0 transition-colors ${isActive ? 'text-aqua' : 'group-hover:text-aqua/70'}`} />
          {!collapsed && <span className="truncate">{item.label}</span>}
          {isActive && (
            <motion.span
              layoutId="sidebar-active"
              className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-gradient-to-b from-electric to-aqua shadow-glow-aqua"
            />
          )}
        </>
      )}
    </NavLink>
  )
}

function SidebarContent({ collapsed, onNavigate }) {
  const { mode, setMode } = useWorkspace()
  const { isOwner, user } = useAuth()

  // Non-owners can only ever see the Workspace nav — force it, and hide the toggle.
  useEffect(() => {
    if (!isOwner && mode !== 'user') setMode('user')
  }, [isOwner, mode, setMode])

  const effectiveMode = isOwner ? mode : 'user'

  return (
    <div className="flex flex-col h-full">
      <div className={`flex items-center gap-2.5 px-4 h-16 shrink-0 ${collapsed ? 'justify-center px-0' : ''}`}>
        <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-electric to-aqua flex items-center justify-center shrink-0 shadow-glow-electric">
          <span className="w-2 h-2 rounded-full bg-white" />
        </span>
        {!collapsed && <span className="font-display font-bold text-lg tracking-tightest text-white">FEXUS</span>}
      </div>

      {!collapsed && isOwner && (
        <div className="px-4 mb-4">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-white/5 border border-white/10">
            {['owner', 'user'].map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-1.5 rounded-md text-xs font-semibold capitalize transition-colors ${
                  effectiveMode === m ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'
                }`}
              >
                {m === 'owner' ? 'Owner' : 'Workspace'}
              </button>
            ))}
          </div>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-3 space-y-6">
        <div className="space-y-1">
          {!collapsed && (
            <p className="px-3 mb-1.5 font-mono text-[10px] tracking-wideish uppercase text-white/25">
              {effectiveMode === 'owner' ? 'Owner' : 'Workspace'}
            </p>
          )}
          {(effectiveMode === 'owner' ? OWNER_NAV : USER_NAV).filter((item) => !item.hidden).map((item) => (
            <NavItem key={item.to} item={item} collapsed={collapsed} onClick={onNavigate} />
          ))}
        </div>

        <div className="space-y-1">
          {!collapsed && (
            <p className="px-3 mb-1.5 font-mono text-[10px] tracking-wideish uppercase text-white/25">
              Coming Soon
            </p>
          )}
          {FUTURE_NAV.map((item) => (
            <NavItem key={item.to} item={item} collapsed={collapsed} onClick={onNavigate} muted />
          ))}
        </div>
      </nav>

      <div className={`p-3 border-t border-white/10 ${collapsed ? 'flex justify-center' : ''}`}>
        <div className={`flex items-center gap-2.5 rounded-xl bg-white/5 p-2.5 ${collapsed ? 'w-11 h-11 justify-center' : ''}`}>
          <span className="w-8 h-8 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center shrink-0">
            <Building2 className="w-4 h-4 text-white/50" />
          </span>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">FEXUS Technologies</p>
              <p className="text-[11px] text-white/40 truncate">{isOwner ? 'Owner' : user?.name || 'Company User'}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Sidebar() {
  const { collapsed, setCollapsed, mobileOpen, setMobileOpen } = useWorkspace()

  return (
    <>
      {/* desktop sidebar */}
      <aside
        className={`hidden lg:flex flex-col fixed inset-y-0 left-0 z-40 border-r border-white/10 bg-void transition-all duration-300 ${
          collapsed ? 'w-[76px]' : 'w-64'
        }`}
      >
        <SidebarContent collapsed={collapsed} />
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-void-raised border border-white/10 shadow-depth flex items-center justify-center text-white/50 hover:border-aqua/50 hover:text-aqua transition-colors"
        >
          {collapsed ? <ChevronsRight className="w-3.5 h-3.5" /> : <ChevronsLeft className="w-3.5 h-3.5" />}
        </button>
      </aside>

      {/* mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="lg:hidden fixed inset-0 z-40 bg-void-deep/60 backdrop-blur-sm"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="lg:hidden fixed inset-y-0 left-0 z-50 w-72 bg-void border-r border-white/10"
            >
              <button
                onClick={() => setMobileOpen(false)}
                className="absolute right-3 top-4 w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
              <SidebarContent collapsed={false} onNavigate={() => setMobileOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
