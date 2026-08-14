import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import { api } from './api'

const WorkspaceContext = createContext(null)

/**
 * Builds real notifications from actual data instead of a static fake feed:
 * overdue invoices and projects currently in Review. No invented events.
 */
function deriveNotifications(invoices, projects) {
  const items = []

  for (const inv of invoices.filter((i) => i.status === 'Overdue')) {
    items.push({
      id: `invoice-${inv.id}`,
      title: `${inv.client?.name || 'A client'}'s invoice ${inv.number} is overdue`,
      time: inv.date || 'Recently',
      type: 'warning'
    })
  }

  for (const p of projects.filter((p) => p.status === 'Review')) {
    items.push({
      id: `project-${p.id}`,
      title: `${p.name} is ready for review`,
      time: p.dueDate || 'Recently',
      type: 'info'
    })
  }

  return items
}

export function WorkspaceProvider({ children }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [mode, setMode] = useState('owner') // 'owner' | 'user'
  const [notifications, setNotifications] = useState([])
  const [readIds, setReadIds] = useState(() => new Set())

  const refreshNotifications = useCallback(() => {
    Promise.all([api.invoices.list(), api.projects.list()])
      .then(([inv, proj]) => setNotifications(deriveNotifications(inv.items, proj.items)))
      .catch(() => setNotifications([]))
  }, [])

  useEffect(() => {
    refreshNotifications()
  }, [refreshNotifications])

  useEffect(() => {
    function onKeyDown(e) {
      const isK = e.key === 'k' || e.key === 'K'
      if ((e.metaKey || e.ctrlKey) && isK) {
        e.preventDefault()
        setCommandOpen((v) => !v)
      }
      if (e.key === 'Escape') {
        setCommandOpen(false)
        setNotifOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const notificationsWithRead = useMemo(
    () => notifications.map((n) => ({ ...n, read: readIds.has(n.id) })),
    [notifications, readIds]
  )
  const unreadCount = useMemo(() => notificationsWithRead.filter((n) => !n.read).length, [notificationsWithRead])

  function markAllNotificationsRead() {
    setReadIds(new Set(notifications.map((n) => n.id)))
  }

  function markNotificationRead(id) {
    setReadIds((prev) => new Set(prev).add(id))
  }

  const value = {
    collapsed, setCollapsed,
    mobileOpen, setMobileOpen,
    commandOpen, setCommandOpen,
    notifOpen, setNotifOpen,
    mode, setMode,
    notifications: notificationsWithRead, unreadCount, markAllNotificationsRead, markNotificationRead, refreshNotifications
  }

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used within a WorkspaceProvider')
  return ctx
}
