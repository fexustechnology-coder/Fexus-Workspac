import { HeartHandshake } from 'lucide-react'
import FutureModule from '../../components/ui/FutureModule'

export default function CustomerSuccess() {
  return (
    <FutureModule
      title="Customer Success"
      description="Support, retention, and account health, run by Customer Success AI."
      icon={HeartHandshake}
      robotVariant="idle"
      bullets={[
        'Instant ticket triage and resolution',
        'Proactive churn-risk detection',
        'Always-on customer support coverage'
      ]}
    />
  )
}
