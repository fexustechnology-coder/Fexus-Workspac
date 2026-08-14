import { Navigate } from 'react-router-dom'
import { useAuth } from '../../lib/AuthContext'

export default function RoleHome() {
  const { isOwner } = useAuth()
  return <Navigate to={isOwner ? '/owner/dashboard' : '/dashboard'} replace />
}
