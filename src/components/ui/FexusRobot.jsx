import { useId } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const ACCENTS = {
  ferozi: { glowStart: '#5EEAD4', glowEnd: '#14B8A6', solid: '#14B8A6', chestGlow: 'bg-ferozi/30' },
  gold: { glowStart: '#FDE7A8', glowEnd: '#C9962C', solid: '#C9962C', chestGlow: 'bg-[#C9962C]/25' }
}

// Arm rotation ranges per variant: [back-arm range, front-arm range, cycle seconds]
const ARM_MOTION = {
  idle: { back: [-3, 3, -3], front: [3, -3, 3], duration: 3.4 },
  walk: { back: [-24, 24, -24], front: [24, -24, 24], duration: 0.7 },
  typing: { back: [-7, 9, -7], front: [7, -9, 7], duration: 0.4 },
  monitor: { back: [-4, 2, -4], front: [4, -2, 4], duration: 2.6 },
  thinking: { back: [-70, -62, -70], front: [3, -3, 3], duration: 2.2 },
  reporting: { back: [-30, 10, -30], front: [30, -10, 30], duration: 1.1 },
  completed: { back: [-3, 3, -3], front: [3, -3, 3], duration: 3.4 }
}

const HEAD_MOTION = {
  // A wider, slower "looks around the room" sweep instead of a tight
  // back-and-forth — reads as alert/aware rather than a nervous twitch,
  // with an occasional longer pause (the last two keyframes) so it
  // doesn't feel metronomic.
  idle: { rotate: [-4, 4, -14, 8, -4, -4], duration: 7.5 },
  walk: { rotate: [-2, 2, -2], duration: 0.7 },
  typing: { rotate: [-2, 2, -2], duration: 1.6 },
  monitor: { rotate: [0, -8, 0], duration: 3.2 },
  thinking: { rotate: [-10, -4, -10], duration: 2.6 },
  reporting: { rotate: [-6, 6, -6], duration: 1.3 },
  completed: { rotate: [-3, 3, -3], duration: 2.4 }
}

/**
 * FexusRobot — the official FEXUS AI Employee figure.
 * White chassis, matte-black joints, glow accents, "FEXUS" on the chest.
 *
 * variant: 'idle' | 'walk' | 'typing' | 'monitor' | 'thinking' | 'reporting' | 'completed'
 *   - 'monitor'   → reading / looking at a screen
 *   - 'thinking'  → reviewing, hand raised in a thinking pose
 *   - 'reporting' → mid-conversation, explaining/gesturing
 *   - 'completed' → idle stance with a confirmation badge overhead
 * accent: 'ferozi' (default) | 'gold' — gold is reserved for the CEO robot.
 * flip: mirrors the figure — used to tell "walking out" from "returning".
 */
export default function FexusRobot({ variant = 'idle', size = 220, className = '', flip = false, accent = 'ferozi' }) {
  const uid = useId().replace(/[:]/g, '')
  const chassisId = `chassis-${uid}`
  const glowId = `eyeGlow-${uid}`
  const a = ACCENTS[accent] || ACCENTS.ferozi
  const arms = ARM_MOTION[variant] || ARM_MOTION.idle
  const head = HEAD_MOTION[variant] || HEAD_MOTION.idle
  const isWalking = variant === 'walk'
  const isBreathing = variant === 'idle' || variant === 'completed'
  const eyeDim = variant === 'thinking'

  return (
    <div
      className={`relative select-none ${className}`}
      style={{ width: size, height: size * 1.25, transform: flip ? 'scaleX(-1)' : 'none' }}
    >
      <div className={`absolute inset-x-6 bottom-2 h-6 rounded-full blur-xl animate-pulseGlow ${a.chestGlow}`} />

      {/* completed badge */}
      <AnimatePresence>
        {variant === 'completed' && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.6 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="absolute -top-1 left-1/2 -translate-x-1/2 w-7 h-7 rounded-full bg-ferozi flex items-center justify-center shadow-glow z-10"
            style={{ transform: flip ? 'translateX(-50%) scaleX(-1)' : 'translateX(-50%)' }}
          >
            <svg viewBox="0 0 20 20" className="w-4 h-4">
              <path d="M4 10.5l3.5 3.5L16 5.5" stroke="white" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.svg
        viewBox="0 0 200 260"
        className="relative w-full h-full drop-shadow-[0_18px_28px_rgba(10,10,11,0.14)]"
        animate={isWalking ? { y: [0, -4, 0] } : isBreathing ? { y: [0, -6, 0] } : { y: 0 }}
        transition={{ duration: isWalking ? 0.7 : 5, repeat: Infinity, ease: 'easeInOut' }}
      >
        <defs>
          <linearGradient id={chassisId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#F1F3F3" />
          </linearGradient>
          <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={a.glowStart} />
            <stop offset="100%" stopColor={a.glowEnd} />
          </radialGradient>
        </defs>

        {/* legs + feet */}
        <motion.rect
          x="108" y="182" width="20" height="52" rx="9" fill={`url(#${chassisId})`} stroke="#15161A" strokeWidth="2"
          animate={isWalking ? { y: [0, -11, 0] } : {}}
          transition={{ duration: 0.7, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.rect
          x="72" y="182" width="20" height="52" rx="9" fill={`url(#${chassisId})`} stroke="#15161A" strokeWidth="2"
          animate={isWalking ? { y: [0, 11, 0] } : {}}
          transition={{ duration: 0.7, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.rect
          x="66" y="228" width="32" height="10" rx="5" fill="#15161A"
          animate={isWalking ? { x: [0, -4, 0] } : {}}
          transition={{ duration: 0.7, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.rect
          x="102" y="228" width="32" height="10" rx="5" fill="#15161A"
          animate={isWalking ? { x: [0, 4, 0] } : {}}
          transition={{ duration: 0.7, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* torso */}
        <motion.g
          animate={
            isBreathing ? { scaleY: [1, 1.018, 1] }
            : isWalking ? { rotate: [-2, 2, -2] }
            : {}
          }
          style={{ transformOrigin: '100px 160px' }}
          transition={{ duration: isWalking ? 0.7 : 4, repeat: Infinity, ease: 'easeInOut' }}
        >
          <rect x="58" y="108" width="84" height="82" rx="18" fill={`url(#${chassisId})`} stroke="#15161A" strokeWidth="2.5" />
          <rect x="72" y="126" width="56" height="40" rx="8" fill="#FFFFFF" stroke={a.solid} strokeWidth="1.6" />
          <text x="100" y="150" textAnchor="middle" fontFamily="'JetBrains Mono', monospace" fontSize="10.5" fontWeight="600" fill="#0A0A0B" letterSpacing="1.5">
            FEXUS
          </text>
          <motion.circle
            cx="100" cy="160" r="3.4" fill={a.solid}
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <circle cx="58" cy="118" r="7" fill="#15161A" />
          <circle cx="142" cy="118" r="7" fill="#15161A" />
        </motion.g>

        {/* back arm */}
        <motion.rect
          x="136" y="120" width="16" height="54" rx="8" fill={`url(#${chassisId})`} stroke="#15161A" strokeWidth="2"
          style={{ transformOrigin: '144px 122px' }}
          animate={{ rotate: arms.back }}
          transition={{ duration: arms.duration, repeat: Infinity, ease: 'easeInOut' }}
        />
        {/* front arm */}
        <motion.rect
          x="48" y="120" width="16" height="54" rx="8" fill={`url(#${chassisId})`} stroke="#15161A" strokeWidth="2"
          style={{ transformOrigin: '56px 122px' }}
          animate={{ rotate: arms.front }}
          transition={{ duration: arms.duration, repeat: Infinity, ease: 'easeInOut' }}
        />
        {/* thinking hand — a small circle riding the raised back arm, near the chin */}
        {variant === 'thinking' && (
          <motion.circle
            cx="150" cy="80" r="6" fill={`url(#${chassisId})`} stroke="#15161A" strokeWidth="1.6"
            animate={{ y: [0, -2, 0] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}

        <rect x="92" y="96" width="16" height="16" fill="#15161A" />

        {/* head */}
        <motion.g
          style={{ transformOrigin: '100px 96px' }}
          animate={{ rotate: head.rotate }}
          transition={{ duration: head.duration, repeat: Infinity, ease: 'easeInOut' }}
        >
          <rect x="66" y="48" width="68" height="52" rx="20" fill={`url(#${chassisId})`} stroke="#15161A" strokeWidth="2.5" />
          <rect x="80" y="68" width="40" height="10" rx="5" fill="#0A0A0B" />
          <motion.rect
            x="83" y="70.5" width="34" height="5" rx="2.5" fill={`url(#${glowId})`}
            animate={{ opacity: eyeDim ? [0.5, 0.75, 0.5] : [1, 1, 0.15, 1, 1] }}
            transition={
              eyeDim
                ? { duration: 2.4, repeat: Infinity }
                : { duration: 3.6, repeat: Infinity, times: [0, 0.85, 0.9, 0.95, 1] }
            }
          />
          <line x1="100" y1="48" x2="100" y2="34" stroke="#15161A" strokeWidth="2.4" />
          <motion.circle
            cx="100" cy="30" r="5" fill={a.solid}
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.8, repeat: Infinity }}
          />
        </motion.g>
      </motion.svg>
    </div>
  )
}
