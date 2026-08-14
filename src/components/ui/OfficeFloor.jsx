import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import FexusRobot from './FexusRobot'

// =============================================================================
// OFFICE FLOOR (Phase 18)
// =============================================================================
// The piece that was actually missing from the existing robot system: real
// POSITION movement across a shared floor, not just an in-place animation
// swapped between desk cards. Everything below is still driven entirely by
// real backend state (a robot's variant, and now whether it's away from its
// desk) — nothing here is decorative or random.
//
// A robot is "at the CEO's desk" whenever its real current variant is
// 'walk' (receiving a newly assigned task) or 'reporting' (delivering
// finished work / reporting up for approval) — both already meant exactly
// that semantically before this phase (see lib/robotAnimation.js), so this
// reuses that existing mapping rather than inventing a new one. Every other
// variant (idle, typing, thinking, monitor, completed) means "at my own
// desk, working or waiting."
// =============================================================================

const AT_CEO_VARIANTS = ['walk', 'reporting']

function DeskLabel({ name, subtitle, tone }) {
  return (
    <div className="text-center mt-2">
      <p className={`font-display font-semibold text-sm ${tone === 'gold' ? 'text-white' : 'text-ink'}`}>{name}</p>
      {subtitle && <p className={`text-xs mt-0.5 ${tone === 'gold' ? 'text-white/45' : 'text-ink/45'}`}>{subtitle}</p>}
    </div>
  )
}

/**
 * One employee robot that physically walks to the CEO's desk and back,
 * rather than teleporting between two static positions. `home` and
 * `ceoDesk` are { x, y } in percent, relative to the shared floor
 * container both robots and the CEO share.
 */
function WalkingEmployee({ name, subtitle, variant, home, ceoDesk }) {
  const atCeo = AT_CEO_VARIANTS.includes(variant)
  const target = atCeo ? ceoDesk : home
  // Facing direction follows real travel direction — walking toward the
  // CEO desk faces one way, walking back faces the other. No teleporting:
  // this is the same motion.div moving continuously between the two points.
  const [facingRight, setFacingRight] = useState(ceoDesk.x >= home.x)
  useEffect(() => { setFacingRight(atCeo ? ceoDesk.x >= home.x : home.x >= ceoDesk.x) }, [atCeo, ceoDesk.x, home.x])

  return (
    <motion.div
      className="absolute flex flex-col items-center"
      style={{ width: 110 }}
      animate={{ left: `${target.x}%`, top: `${target.y}%` }}
      transition={{ duration: 1.6, ease: [0.45, 0, 0.2, 1] }}
    >
      <FexusRobot variant={variant} size={100} flip={!facingRight} accent="ferozi" />
      <DeskLabel name={name} subtitle={subtitle} />
    </motion.div>
  )
}

/**
 * OfficeFloor — the simplified, 3-robot MVP office (Phase 18): CEO, Email
 * Campaign Specialist, Website Specialist. A fixed-position floor plan
 * with two real desks (rendered as static markers) plus the CEO's desk at
 * the top — employees leave their desk and return to it for real,
 * whenever their real task state says they should.
 */
export default function OfficeFloor({ ceo, ceoSubtitle, employees }) {
  const ceoDesk = { x: 50, y: 12 }
  const positions = [
    { x: 22, y: 62 },
    { x: 78, y: 62 }
  ]

  return (
    <div className="relative rounded-[2rem] border border-ink/10 bg-ink overflow-hidden" style={{ minHeight: 460 }}>
      <div className="absolute inset-0 bg-dot-grid opacity-[0.08]" />
      <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[420px] h-[420px] rounded-full bg-[#C9962C]/10 blur-3xl" />

      {/* Floor markers — subtle, so the two fixed desks read as real places
          robots return to, not just floating labels. */}
      <div className="absolute rounded-2xl border border-white/10" style={{ left: `${positions[0].x - 8}%`, top: `${positions[0].y - 6}%`, width: '16%', height: '30%' }} />
      <div className="absolute rounded-2xl border border-white/10" style={{ left: `${positions[1].x - 8}%`, top: `${positions[1].y - 6}%`, width: '16%', height: '30%' }} />
      <div className="absolute rounded-2xl border border-[#C9962C]/25" style={{ left: `${ceoDesk.x - 10}%`, top: `${ceoDesk.y - 8}%`, width: '20%', height: '28%' }} />

      {/* CEO — stationed, gold accent, unchanged from the existing DeskScene treatment */}
      <div className="absolute flex flex-col items-center" style={{ left: `${ceoDesk.x}%`, top: `${ceoDesk.y}%`, width: 130, transform: 'translateX(-50%)' }}>
        {ceo ? (
          <>
            <FexusRobot variant={ceo.variant} size={120} accent="gold" />
            <DeskLabel name={ceo.name} subtitle={ceoSubtitle} tone="gold" />
          </>
        ) : (
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-center text-xs text-white/40">CEO not seeded yet</div>
        )}
      </div>

      {employees.map((e, i) => (
        <WalkingEmployee
          key={e.id || e.name}
          name={e.name}
          subtitle={e.subtitle}
          variant={e.variant}
          home={{ x: positions[i].x - 6.5, y: positions[i].y }}
          ceoDesk={{ x: ceoDesk.x - 6.5, y: ceoDesk.y + 20 }}
        />
      ))}
    </div>
  )
}
