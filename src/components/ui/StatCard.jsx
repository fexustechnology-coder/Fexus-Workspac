import { motion } from 'framer-motion'
import { ArrowUpRight, ArrowDownRight } from 'lucide-react'

export default function StatCard({ label, value, delta, trend = 'up', icon: Icon, delay = 0 }) {
  const positive = trend === 'up'
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -6, rotateX: 4, rotateY: -3, scale: 1.015 }}
      style={{ transformPerspective: 1000 }}
      className="rounded-2xl border border-line bg-white p-6 shadow-card hover:shadow-card-hover transition-shadow duration-300"
    >
      <div className="flex items-start justify-between">
        <span className="font-mono text-[11px] tracking-wideish uppercase text-ink/45">{label}</span>
        {Icon && (
          <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-electric to-aqua flex items-center justify-center">
            <Icon className="w-4 h-4 text-white" />
          </span>
        )}
      </div>
      <div className="mt-4 font-display font-bold text-3xl tracking-tight text-ink">{value}</div>
      {delta && (
        <div className={`mt-2 inline-flex items-center gap-1 text-xs font-semibold ${positive ? 'text-green-600' : 'text-red-500'}`}>
          {positive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
          {delta}
        </div>
      )}
    </motion.div>
  )
}
