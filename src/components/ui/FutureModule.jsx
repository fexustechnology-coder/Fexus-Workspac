import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Lock, Brain } from 'lucide-react'
import FexusRobot from './FexusRobot'
import Badge from './Badge'
import PageHeader from './PageHeader'
import { api } from '../../lib/api'

export default function FutureModule({ title, description, icon: Icon, robotVariant = 'idle', bullets = [] }) {
  const [companyName, setCompanyName] = useState(null)

  useEffect(() => {
    let cancelled = false
    api.getBrain()
      .then(({ brain }) => !cancelled && setCompanyName(brain.companyName || ''))
      .catch(() => !cancelled && setCompanyName(''))
    return () => { cancelled = true }
  }, [])

  return (
    <div>
      <PageHeader
        eyebrow="Coming in Future Phase"
        title={title}
        description={description}
        actions={<Badge tone="ferozi" dot>Waiting for AI Logic</Badge>}
      />

      {companyName !== null && (
        <div className="mb-6 flex items-center gap-2.5 rounded-xl border border-line bg-mist px-4 py-3 text-sm text-ink/60">
          <Brain className="w-4 h-4 text-ferozi-deep shrink-0" />
          Architecture connected to Company Brain
          {companyName ? <> — reading context for <span className="font-semibold text-ink">{companyName}</span></> : ' — no company context saved yet'}
          .
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        className="rounded-2xl border border-line bg-white shadow-card overflow-hidden"
      >
        <div className="relative grid lg:grid-cols-[1fr_1.2fr] gap-10 p-8 sm:p-12">
          <div className="absolute inset-0 bg-dot-grid opacity-30 pointer-events-none" />
          <div className="relative flex items-center justify-center rounded-2xl bg-mist border border-line h-64 lg:h-auto">
            <FexusRobot variant={robotVariant} size={150} />
          </div>

          <div className="relative flex flex-col justify-center">
            <span className="w-11 h-11 rounded-xl bg-ink flex items-center justify-center mb-5">
              {Icon ? <Icon className="w-5 h-5 text-ferozi-glow" /> : <Lock className="w-5 h-5 text-ferozi-glow" />}
            </span>
            <h2 className="font-display font-semibold text-2xl tracking-tight">This module is staged and ready.</h2>
            <p className="mt-3 text-ink/55 leading-relaxed max-w-md">
              The interface, routing, and Company Brain connection for {title} already exist
              inside the FEXUS Workspace. Decision-making and automation logic are the only
              pieces left — those arrive in a later phase.
            </p>

            {bullets.length > 0 && (
              <ul className="mt-6 space-y-3">
                {bullets.map((b) => (
                  <li key={b} className="flex items-center gap-3 text-sm text-ink/65">
                    <span className="w-1.5 h-1.5 rounded-full bg-ferozi shrink-0" />
                    {b}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  )
}
