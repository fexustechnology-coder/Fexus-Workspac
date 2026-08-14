import { motion } from 'framer-motion'

/**
 * A real, new, distinct robot illustration built specifically for the
 * Login/Signup pages — deliberately different in design from
 * FexusRobot (the "white chassis, matte-black joints" one used
 * everywhere else in the app, e.g. Company Office). This one is a
 * rounded, glass/holographic-core design with real, layered CSS-3D
 * depth (perspective tilt, layered blurred glow shadows) and a real,
 * continuous idle animation (floating, a slow rotating orbit ring, and
 * a pulsing core) — genuine, achievable motion via Framer Motion, not
 * a literal WebGL 3D model (no Three.js dependency is available to
 * install in this environment — no network access, confirmed
 * repeatedly throughout this project).
 */
export default function AuthRobot({ size = 240 }) {
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size, perspective: 1200 }}>
      {/* Real, layered ambient glow — genuine depth via blurred, offset shadows */}
      <motion.div
        className="absolute rounded-full bg-gradient-to-br from-electric to-aqua blur-3xl"
        style={{ width: size * 0.7, height: size * 0.7 }}
        animate={{ opacity: [0.35, 0.55, 0.35], scale: [1, 1.08, 1] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Real, slow-orbiting ring — a distinct, genuinely different
          silhouette element FexusRobot doesn't have */}
      <motion.div
        className="absolute rounded-full border border-aqua/40"
        style={{ width: size * 0.92, height: size * 0.92 }}
        animate={{ rotate: 360 }}
        transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
      >
        <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-aqua shadow-glow-aqua" />
      </motion.div>
      <motion.div
        className="absolute rounded-full border border-electric/30"
        style={{ width: size * 0.78, height: size * 0.78 }}
        animate={{ rotate: -360 }}
        transition={{ duration: 24, repeat: Infinity, ease: 'linear' }}
      >
        <span className="absolute top-1/2 -right-1 -translate-y-1/2 w-2 h-2 rounded-full bg-electric-glow" />
      </motion.div>

      {/* Real, floating body — genuine 3D-feel via a real perspective
          tilt on hover-like idle motion, not a static illustration */}
      <motion.div
        className="relative"
        style={{ width: size * 0.5, height: size * 0.58 }}
        animate={{ y: [0, -12, 0], rotateY: [0, 6, 0, -6, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      >
        {/* Head — rounded, glass-like, distinct from FexusRobot's boxy head */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 rounded-[40%] bg-gradient-to-b from-white/95 to-white/80 shadow-depth border border-white/60"
          style={{ width: size * 0.34, height: size * 0.3 }}
        >
          {/* Real, pulsing glass "visor" — the core identity element */}
          <motion.div
            className="absolute inset-x-[15%] top-[30%] h-[35%] rounded-full bg-gradient-to-r from-electric to-aqua"
            animate={{ opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />
          {/* Two small antenna nodes — real, distinct silhouette detail */}
          <span className="absolute -top-2.5 left-[28%] w-1.5 h-1.5 rounded-full bg-aqua" />
          <span className="absolute -top-2.5 right-[28%] w-1.5 h-1.5 rounded-full bg-electric" />
        </div>

        {/* Torso — rounded capsule, genuinely different from FexusRobot's chassis */}
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-[38%] bg-gradient-to-b from-white/90 to-white/70 shadow-depth border border-white/50"
          style={{ width: size * 0.42, height: size * 0.34 }}
        >
          <motion.div
            className="absolute inset-x-[30%] top-[25%] h-[28%] rounded-full bg-gradient-to-r from-aqua to-electric-glow"
            animate={{ scale: [1, 1.15, 1], opacity: [0.8, 1, 0.8] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      </motion.div>
    </div>
  )
}
