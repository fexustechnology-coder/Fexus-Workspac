const TONES = {
  neutral: 'bg-mist text-ink/60 border-line',
  ferozi: 'bg-ferozi-soft text-ferozi-deep border-ferozi/30',
  electric: 'bg-electric-soft text-electric-deep border-electric/30',
  success: 'bg-green-50 text-green-700 border-green-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  danger: 'bg-red-50 text-red-700 border-red-200',
  dark: 'bg-ink text-white border-ink'
}

export default function Badge({ children, tone = 'neutral', dot = false, className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-mono text-[10px] tracking-wideish uppercase ${TONES[tone]} ${className}`}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  )
}
