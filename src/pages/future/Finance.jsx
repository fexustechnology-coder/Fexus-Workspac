import { Wallet } from 'lucide-react'
import FutureModule from '../../components/ui/FutureModule'

export default function Finance() {
  return (
    <FutureModule
      title="Finance"
      description="Books, forecasting, and financial guardrails, run by Finance AI."
      icon={Wallet}
      robotVariant="typing"
      bullets={[
        'Automated bookkeeping and reconciliation',
        'Cash flow forecasting and burn-rate alerts',
        'Audit-ready reporting on demand'
      ]}
    />
  )
}
