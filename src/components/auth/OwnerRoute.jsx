import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../lib/AuthContext'

export default function OwnerRoute() {
  const { user, isOwner } = useAuth()

  if (!user) return <Navigate to="/login" replace />
  if (!isOwner) return <Navigate to="/dashboard" replace />

  return <Outlet />
}
