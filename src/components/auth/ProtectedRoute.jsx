import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../lib/AuthContext'
import FexusRobot from '../ui/FexusRobot'

function FullScreenLoader() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <FexusRobot variant="idle" size={100} />
      <p className="text-sm text-ink/40">Loading your workspace...</p>
    </div>
  )
}

export default function ProtectedRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <FullScreenLoader />
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />

  return <Outlet />
}
