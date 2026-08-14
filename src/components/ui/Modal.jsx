import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'

export default function Modal({ open, onClose, title, children }) {
  return (
    <AnimatePresence>
      {open && (
        // Centering strategy: ONE fixed, full-viewport flex container does
        // the centering (items-center justify-center), and the dialog is a
        // normal flex child — not itself positioned with fixed+translate
        // math. This is deliberately more robust than "top:50%/left:50%
        // + translate", which silently breaks (and looks "shifted") if any
        // ancestor ever gains a CSS transform/filter/perspective, since
        // that creates a new containing block for fixed descendants. The
        // outer container is the only "fixed" element; the backdrop and
        // dialog are both normal children positioned by flexbox, so there's
        // nothing for an ancestor transform to interfere with.
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-[70] w-full max-w-[480px] max-h-[85vh] overflow-y-auto rounded-2xl border border-line bg-white shadow-panel p-6"
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display font-semibold text-lg">{title}</h3>
              <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-mist shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

