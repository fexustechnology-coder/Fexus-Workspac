import { AnimatePresence, motion } from 'framer-motion'
import { X, Info, CheckCircle2, AlertTriangle } from 'lucide-react'
import { useWorkspace } from '../../lib/WorkspaceContext'

const ICONS = {
  info: { Icon: Info, cls: 'text-ink/50 bg-mist' },
  success: { Icon: CheckCircle2, cls: 'text-green-600 bg-green-50' },
  warning: { Icon: AlertTriangle, cls: 'text-amber-600 bg-amber-50' }
}

export default function NotificationDrawer() {
  const { notifOpen, setNotifOpen, notifications, unreadCount, markAllNotificationsRead, markNotificationRead } = useWorkspace()

  return (
    <AnimatePresence>
      {notifOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setNotifOpen(false)}
            className="fixed inset-0 z-[60] bg-ink/20 backdrop-blur-[2px]"
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-y-0 right-0 z-[70] w-full max-w-sm bg-white border-l border-line shadow-panel flex flex-col"
          >
            <div className="flex items-center justify-between px-5 h-16 border-b border-line shrink-0">
              <h3 className="font-display font-semibold text-lg">
                Notifications {unreadCount > 0 && <span className="text-ferozi-deep">({unreadCount})</span>}
              </h3>
              <button onClick={() => setNotifOpen(false)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-mist">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {notifications.length === 0 && (
                <p className="text-sm text-ink/35 text-center py-10">You're all caught up — no overdue invoices or projects in review.</p>
              )}
              {notifications.map((n, i) => {
                const { Icon, cls } = ICONS[n.type] || ICONS.info
                return (
                  <motion.button
                    key={n.id}
                    onClick={() => markNotificationRead(n.id)}
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 * i, duration: 0.35 }}
                    className={`w-full flex items-start gap-3 p-3 rounded-xl text-left hover:bg-mist transition-colors ${
                      n.read ? 'opacity-50' : ''
                    }`}
                  >
                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${cls}`}>
                      <Icon className="w-4 h-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-ink/85 leading-snug">{n.title}</p>
                      <p className="text-xs text-ink/40 mt-1">{n.time}</p>
                    </div>
                    {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-ferozi mt-1.5 shrink-0" />}
                  </motion.button>
                )
              })}
            </div>

            <div className="p-4 border-t border-line shrink-0">
              <button
                onClick={markAllNotificationsRead}
                disabled={unreadCount === 0}
                className="w-full py-2.5 rounded-full border border-line text-sm font-semibold text-ink/70 hover:border-ferozi hover:text-ferozi-deep transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Mark all as read
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
