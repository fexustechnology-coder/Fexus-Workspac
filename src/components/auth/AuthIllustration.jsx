import { motion } from 'framer-motion'
import AuthRobot from './AuthRobot'

export default function AuthIllustration({ heading, subheading }) {
  return (
    <div className="relative hidden lg:flex flex-col justify-between h-full bg-void text-white overflow-hidden px-12 py-14">
      <div className="absolute inset-0 bg-mesh opacity-60" />
      <div className="absolute -top-32 -right-24 w-[420px] h-[420px] rounded-full bg-electric/15 blur-3xl" />
      <div className="absolute -bottom-32 -left-24 w-[380px] h-[380px] rounded-full bg-aqua/10 blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative flex items-center gap-2.5"
      >
        <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-electric to-aqua flex items-center justify-center">
          <span className="w-2 h-2 rounded-full bg-white" />
        </span>
        <span className="font-display font-bold text-lg tracking-tightest">FEXUS</span>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        className="relative flex items-center justify-center py-10"
      >
        <AuthRobot size={240} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
        className="relative"
      >
        <h2 className="font-display font-bold text-3xl tracking-tightest leading-tight max-w-sm">{heading}</h2>
        <p className="mt-3 text-white/50 max-w-sm leading-relaxed">{subheading}</p>
      </motion.div>
    </div>
  )
}
