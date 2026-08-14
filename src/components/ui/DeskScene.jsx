import FexusRobot from './FexusRobot'

/**
 * DeskScene — a robot seated at a desk with a monitor, used for CEO and
 * Director offices. `tone` controls the desk accent (gold for CEO, ferozi
 * for everyone else) to match the brief's black/white/gold CEO styling.
 */
export default function DeskScene({ robot, name, subtitle, tone = 'ferozi', size = 118 }) {
  const isGold = tone === 'gold'
  return (
    <div
      className={`relative rounded-2xl border overflow-hidden ${
        isGold ? 'border-[#C9962C]/40 bg-ink' : 'border-line bg-mist'
      }`}
    >
      <div className={`absolute inset-0 bg-dot-grid ${isGold ? 'opacity-[0.08]' : 'opacity-30'}`} />

      {/* monitor */}
      <div className="relative pt-6 flex justify-center">
        <div className={`w-24 h-16 rounded-t-lg border-2 flex items-center justify-center ${
          isGold ? 'border-[#C9962C]/50 bg-black/40' : 'border-line bg-white'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full animate-pulseGlow ${isGold ? 'bg-[#C9962C]' : 'bg-ferozi'}`} />
        </div>
      </div>
      <div className={`relative mx-auto w-8 h-3 ${isGold ? 'bg-[#C9962C]/30' : 'bg-line'}`} />

      {/* desk */}
      <div className={`relative mx-6 h-2 rounded-full mb-2 ${isGold ? 'bg-[#C9962C]/40' : 'bg-line'}`} />

      {/* robot seated at the desk */}
      <div className="relative flex justify-center -mt-2 pb-4">
        <FexusRobot variant={robot.variant} flip={robot.flip} accent={isGold ? 'gold' : 'ferozi'} size={size} />
      </div>

      <div className={`relative text-center pb-4 px-3`}>
        <p className={`font-display font-semibold text-sm ${isGold ? 'text-white' : 'text-ink'}`}>{name}</p>
        {subtitle && (
          <p className={`text-xs mt-0.5 ${isGold ? 'text-white/45' : 'text-ink/45'}`}>{subtitle}</p>
        )}
      </div>
    </div>
  )
}
