import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import CommandBar from './CommandBar'
import NotificationDrawer from './NotificationDrawer'
import { useWorkspace } from '../../lib/WorkspaceContext'

export default function AppLayout() {
  const { collapsed } = useWorkspace()

  return (
    <div className="min-h-screen bg-canvas">
      <Sidebar />
      <div className={`transition-all duration-300 ${collapsed ? 'lg:pl-[76px]' : 'lg:pl-64'}`}>
        <Topbar />
        <main className="px-4 sm:px-6 lg:px-8 py-8 max-w-[1400px] mx-auto">
          <Outlet />
        </main>
      </div>
      <CommandBar />
      <NotificationDrawer />
    </div>
  )
}
