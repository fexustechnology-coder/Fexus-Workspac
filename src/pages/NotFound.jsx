import { Link } from 'react-router-dom'
import FexusRobot from '../components/ui/FexusRobot'

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-6">
      <FexusRobot variant="idle" size={140} />
      <h1 className="mt-6 font-display font-bold text-3xl tracking-tightest">Page not found</h1>
      <p className="mt-2 text-ink/55 max-w-sm">
        This part of the FEXUS Workspace doesn't exist yet, or the link is out of date.
      </p>
      <Link
        to="/owner/dashboard"
        className="mt-6 px-6 py-2.5 rounded-full bg-ink text-white text-sm font-semibold hover:bg-ferozi-deep transition-colors"
      >
        Back to Dashboard
      </Link>
    </div>
  )
}
