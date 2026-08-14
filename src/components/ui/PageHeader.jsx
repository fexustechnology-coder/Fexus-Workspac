import { motion } from 'framer-motion'

export default function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 mb-8"
    >
      <div>
        {eyebrow && (
          <span className="font-mono text-[11px] tracking-wideish uppercase bg-gradient-to-r from-electric-deep to-ferozi-deep bg-clip-text text-transparent font-semibold">{eyebrow}</span>
        )}
        <h1 className="mt-2 font-display font-bold text-3xl tracking-tightest text-ink">{title}</h1>
        {description && <p className="mt-2 text-ink/55 max-w-xl leading-relaxed">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-3 shrink-0">{actions}</div>}
    </motion.div>
  )
}
