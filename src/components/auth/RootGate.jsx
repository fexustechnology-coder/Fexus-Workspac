import { Navigate } from 'react-router-dom'
import { useAuth } from '../../lib/AuthContext'
import Landing from '../../pages/public/Landing'
import FexusRobot from '../ui/FexusRobot'

// Replaces the old, always-protected index route. "/" is now genuinely
// public: a signed-out visitor sees the real marketing Landing page; a
// signed-in Owner/Company User is redirected to their real dashboard,
// using the exact same role-check RoleHome already used elsewhere.
export default function RootGate() {
  const { user, loading, isOwner } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-void">
        <FexusRobot variant="idle" size={100} />
        <p className="text-sm text-white/40">Loading...</p>
      </div>
    )
  }

  if (user) return <Navigate to={isOwner ? '/owner/dashboard' : '/dashboard'} replace />

  return <Landing />
}
