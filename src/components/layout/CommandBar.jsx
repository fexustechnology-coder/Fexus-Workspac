import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, CornerDownLeft } from 'lucide-react'
import { useWorkspace } from '../../lib/WorkspaceContext'
import { ALL_COMMANDS } from '../../lib/nav'

export default function CommandBar() {
  const { commandOpen, setCommandOpen } = useWorkspace()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const navigate = useNavigate()

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return ALL_COMMANDS
    return ALL_COMMANDS.filter((c) => c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q))
  }, [query])

  useEffect(() => {
    if (!commandOpen) {
      setQuery('')
      setActive(0)
    }
  }, [commandOpen])

  useEffect(() => setActive(0), [query])

  function go(item) {
    if (!item) return
    navigate(item.to)
    setCommandOpen(false)
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      go(results[active])
    }
  }

  return (
    <AnimatePresence>
      {commandOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setCommandOpen(false)}
            className="fixed inset-0 z-[60] bg-ink/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed z-[70] left-1/2 top-24 -translate-x-1/2 w-[min(560px,92vw)] rounded-2xl border border-line bg-white shadow-panel overflow-hidden"
          >
            <div className="flex items-center gap-3 px-5 h-14 border-b border-line">
              <Search className="w-4 h-4 text-ink/35 shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Type a command or search..."
                className="flex-1 bg-transparent outline-none text-sm placeholder:text-ink/35"
              />
              <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-line bg-mist text-ink/40">ESC</kbd>
            </div>

            <div className="max-h-80 overflow-y-auto p-2">
              {results.length === 0 && (
                <p className="px-3 py-8 text-center text-sm text-ink/40">No matching commands.</p>
              )}
              {results.map((item, i) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.to + item.group}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(item)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                      i === active ? 'bg-ink text-white' : 'text-ink/75 hover:bg-mist'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${i === active ? 'text-ferozi-glow' : 'text-ink/40'}`} />
                    <span className="flex-1 text-left">Open {item.label}</span>
                    <span className={`font-mono text-[10px] uppercase tracking-wideish ${i === active ? 'text-white/50' : 'text-ink/30'}`}>
                      {item.group}
                    </span>
                    {i === active && <CornerDownLeft className="w-3.5 h-3.5 text-white/60" />}
                  </button>
                )
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
