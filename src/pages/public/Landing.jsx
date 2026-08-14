import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, Sparkles, ShieldCheck, Zap, ArrowRight, CheckCircle2 } from 'lucide-react'
import FexusRobot from '../../components/ui/FexusRobot'

// The signature moment — a real, scripted sequence tied to the actual
// product (say "FEXUS AS", watch a real multi-step task execute, see it
// verified) rather than a generic stat-and-gradient hero. The robot's
// own real, existing animation states (idle/thinking/typing/reporting/
// completed) drive this, not a new, separate animation system.
const SEQUENCE = [
  { robot: 'idle', headline: 'جی، FEXUS AS...', sub: 'Listening for your voice.', duration: 1800 },
  { robot: 'thinking', headline: '"Research 50 interior designers in Lahore, save the leads, and start an email campaign."', sub: 'Planning the real steps.', duration: 2400 },
  { robot: 'typing', headline: 'Researching businesses. Writing the file. Verifying it exists.', sub: 'Step 3 of 7 — real, checkpointed progress.', duration: 2400 },
  { robot: 'reporting', headline: 'Handing the file to Hira. Preparing the campaign.', sub: 'Step 6 of 7.', duration: 2200 },
  { robot: 'completed', headline: '"جی، مکمل ہو گیا — 47 leads found, campaign ready for your approval."', sub: 'Verified. Not assumed.', duration: 2600 }
]

function useSequence() {
  const [step, setStep] = useState(0)
  useEffect(() => {
    const timer = setTimeout(() => setStep((s) => (s + 1) % SEQUENCE.length), SEQUENCE[step].duration)
    return () => clearTimeout(timer)
  }, [step])
  return SEQUENCE[step]
}

const FEATURES = [
  {
    icon: Mic,
    title: 'Talk to your team',
    body: 'Say "FEXUS AS" and give a real instruction in your own words — Urdu or English. No forms, no dashboards to learn first.'
  },
  {
    icon: Sparkles,
    title: 'Real employees, real work',
    body: 'Hira runs your email campaigns. Shanza builds and publishes real websites. Every action calls the real system underneath — never a simulated click.'
  },
  {
    icon: ShieldCheck,
    title: 'Verified, not assumed',
    body: 'Every file is read back and checked. Every send is confirmed by the real provider. If something didn\u2019t work, you hear that too — honestly, immediately.'
  },
  {
    icon: Zap,
    title: 'Stop and resume, mid-task',
    body: 'Say "stop" and it stops for real, mid-step. Say "resume" and it picks up exactly where it left off — nothing repeated, nothing lost.'
  }
]

function GlowOrb({ className }) {
  return <div className={`absolute rounded-full blur-3xl opacity-60 animate-driftSlow ${className}`} />
}

export default function Landing() {
  const current = useSequence()

  return (
    <div className="min-h-screen bg-void text-white overflow-x-hidden">
      {/* ============================================================ */}
      {/* NAV */}
      {/* ============================================================ */}
      <nav className="relative z-10 flex items-center justify-between px-6 md:px-12 py-6 max-w-7xl mx-auto">
        <div className="font-display font-bold text-xl tracking-tight">FEXUS</div>
        <div className="flex items-center gap-3">
          <Link to="/login" className="text-sm text-white/70 hover:text-white transition-colors px-4 py-2">
            Log in
          </Link>
          <Link
            to="/signup"
            className="text-sm font-semibold bg-white text-void px-5 py-2.5 rounded-full hover:bg-electric-glow hover:text-void transition-colors"
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* ============================================================ */}
      {/* HERO — the signature sequence */}
      {/* ============================================================ */}
      <section className="relative">
        <GlowOrb className="w-[500px] h-[500px] bg-electric top-[-100px] left-[-150px]" />
        <GlowOrb className="w-[400px] h-[400px] bg-aqua top-[100px] right-[-100px]" style={{ animationDelay: '-4s' }} />

        <div className="relative max-w-7xl mx-auto px-6 md:px-12 pt-16 md:pt-24 pb-24 grid md:grid-cols-2 gap-16 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/15 bg-white/5 text-xs font-mono tracking-wideish uppercase text-white/60 mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-aqua animate-pulse" />
              Real computer-use. Real employees.
            </div>
            <h1 className="font-display text-5xl md:text-6xl font-bold leading-[1.05] tracking-tightest mb-6">
              An office you
              <br />
              <span className="bg-gradient-to-r from-electric-glow via-aqua to-ferozi-glow bg-clip-text text-transparent bg-[length:200%_auto] animate-gradientShift">
                talk to.
              </span>
            </h1>
            <p className="text-lg text-white/60 leading-relaxed max-w-md mb-10">
              FEXUS is a small, real AI workforce — Hira runs your email
              campaigns, Shanza builds your websites, and FEXUS AS is the
              voice that runs the whole office. You speak. They actually do
              the work.
            </p>
            <div className="flex items-center gap-4">
              <Link
                to="/signup"
                className="group inline-flex items-center gap-2 bg-white text-void font-semibold px-6 py-3.5 rounded-full hover:bg-electric-glow transition-all hover:shadow-glow-electric"
              >
                Start free
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link to="/login" className="text-sm text-white/50 hover:text-white transition-colors">
                I already have an account
              </Link>
            </div>
          </div>

          {/* The real, on-brand signature moment */}
          <div className="relative">
            <motion.div
              initial={{ opacity: 0, rotateX: 8, rotateY: -6, y: 20 }}
              animate={{ opacity: 1, rotateX: 0, rotateY: 0, y: 0 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              style={{ perspective: 1000 }}
              className="relative rounded-3xl border border-white/10 bg-void-raised/80 backdrop-blur-xl p-8 shadow-depth"
            >
              <div className="flex items-center gap-2 mb-6 text-xs font-mono text-white/40">
                <span className="w-2.5 h-2.5 rounded-full bg-danger/70" />
                <span className="w-2.5 h-2.5 rounded-full bg-warning/70" />
                <span className="w-2.5 h-2.5 rounded-full bg-success/70" />
                <span className="ml-2">Voice Agent — live</span>
              </div>

              <div className="flex justify-center mb-6">
                <FexusRobot variant={current.robot} size={140} accent="ferozi" />
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={current.headline}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.35 }}
                  className="text-center"
                >
                  <p className="font-display text-base font-medium leading-snug mb-2 min-h-[3rem] flex items-center justify-center" dir={/[\u0600-\u06FF]/.test(current.headline) ? 'rtl' : 'ltr'}>
                    {current.headline}
                  </p>
                  <p className="text-xs font-mono text-aqua/80 uppercase tracking-wideish">{current.sub}</p>
                </motion.div>
              </AnimatePresence>

              <div className="flex justify-center gap-1.5 mt-6">
                {SEQUENCE.map((s, i) => (
                  <div key={i} className={`h-1 rounded-full transition-all duration-300 ${s === current ? 'w-6 bg-aqua' : 'w-1.5 bg-white/15'}`} />
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* FEATURES */}
      {/* ============================================================ */}
      <section className="relative max-w-7xl mx-auto px-6 md:px-12 py-20 md:py-28">
        <div className="max-w-2xl mb-16">
          <p className="text-xs font-mono tracking-wideish uppercase text-aqua/70 mb-3">What actually happens</p>
          <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tightest">
            Not a chatbot. Not a demo.
          </h2>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="group relative rounded-2xl border border-white/10 bg-void-raised/60 p-7 hover:border-electric/40 transition-colors hover:shadow-depth-hover"
              style={{ perspective: 800 }}
            >
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-electric to-aqua flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <f.icon className="w-5 h-5 text-white" strokeWidth={2} />
              </div>
              <h3 className="font-display font-semibold text-lg mb-2">{f.title}</h3>
              <p className="text-sm text-white/55 leading-relaxed">{f.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ============================================================ */}
      {/* ============================================================ */}
      {/* MEET FEXUS AS — a real, dedicated flagship section */}
      {/* ============================================================ */}
      <section className="relative border-t border-white/10 bg-void-deep/40">
        <GlowOrb className="w-[450px] h-[450px] bg-ferozi/50 bottom-0 right-[-150px]" style={{ animationDelay: '-6s' }} />
        <div className="relative max-w-7xl mx-auto px-6 md:px-12 py-24 md:py-32">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <p className="text-xs font-mono tracking-wideish uppercase text-aqua/70 mb-3">Meet FEXUS AS</p>
              <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tightest mb-6">
                Your AI Agent for Work.
              </h2>
              <p className="text-white/60 leading-relaxed mb-8 max-w-md">
                FEXUS is the operating system for a small, real AI workforce.
                FEXUS AS is the intelligent voice/computer agent that lets you
                actually run it — in plain language, not forms and dashboards.
              </p>
              <ul className="space-y-3">
                {[
                  'Understands natural language — English, Urdu, and Roman Urdu',
                  'Asks for whatever is missing before it starts, instead of guessing',
                  'Works across the whole FEXUS workspace — research, files, employees',
                  'Helps create websites and run marketing campaigns',
                  'Executes real, supported computer actions — never a fake click',
                  'Automates the repetitive parts so you only handle the decisions'
                ].map((line) => (
                  <li key={line} className="flex items-start gap-3 text-sm text-white/70">
                    <span className="w-1.5 h-1.5 rounded-full bg-aqua mt-2 shrink-0" />
                    {line}
                  </li>
                ))}
              </ul>
            </div>

            {/* Real, storytelling example conversation — the exact
                interaction pattern FEXUS AS actually supports (ask for
                missing requirements before starting), not a generic
                chat mockup. */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-100px' }}
              transition={{ duration: 0.6 }}
              className="rounded-3xl border border-white/10 bg-void-raised/70 backdrop-blur-xl p-6 md:p-8 shadow-depth"
            >
              <div className="flex items-center gap-2 mb-6 text-xs font-mono text-white/40">
                <Sparkles className="w-3.5 h-3.5 text-aqua" />
                Example — gathering real requirements
              </div>
              <div className="space-y-3">
                {[
                  { from: 'user', text: 'FEXUS AS, create a portfolio website.' },
                  { from: 'agent', text: 'What type of portfolio?' },
                  { from: 'user', text: 'Developer portfolio.' },
                  { from: 'agent', text: 'What information should I include?' },
                  { from: 'user', text: 'My projects, GitHub, and a contact form.' },
                  { from: 'agent', text: 'Got it — building the plan now, then generating real code for you to review before anything publishes.' }
                ].map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: msg.from === 'user' ? 20 : -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, margin: '-100px' }}
                    transition={{ duration: 0.4, delay: i * 0.12 }}
                    className={`flex ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                      msg.from === 'user' ? 'bg-gradient-to-br from-electric to-aqua text-white' : 'bg-white/10 text-white/85 border border-white/10'
                    }`}>
                      {msg.text}
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* HONEST PROOF STRIP — real, verifiable claims, no invented stats */}
      {/* ============================================================ */}
      <section className="relative border-y border-white/10 bg-void-deep/60">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-14 grid sm:grid-cols-3 gap-8">
          {[
            'Every file write is read back and verified before it\u2019s reported done',
            'Every send is confirmed by the real email/deployment provider',
            'Say "stop" mid-task — it stops, remembers exactly where, and resumes'
          ].map((claim) => (
            <div key={claim} className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-aqua shrink-0 mt-0.5" />
              <p className="text-sm text-white/70 leading-relaxed">{claim}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ============================================================ */}
      {/* CTA */}
      {/* ============================================================ */}
      <section className="relative max-w-4xl mx-auto px-6 md:px-12 py-24 md:py-32 text-center">
        <GlowOrb className="w-[600px] h-[300px] bg-electric/60 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        <h2 className="relative font-display text-3xl md:text-5xl font-bold tracking-tightest mb-6">
          Say the word. See it done.
        </h2>
        <p className="relative text-white/55 mb-10 max-w-md mx-auto">
          Set up your workspace in a few minutes, connect your first sender, and give FEXUS AS your first real instruction.
        </p>
        <Link
          to="/signup"
          className="relative inline-flex items-center gap-2 bg-white text-void font-semibold px-8 py-4 rounded-full hover:bg-electric-glow transition-all hover:shadow-glow-electric text-base"
        >
          Start free
          <ArrowRight className="w-4 h-4" />
        </Link>
      </section>

      <footer className="relative border-t border-white/10 py-10">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex items-center justify-between text-xs text-white/35">
          <span>© {new Date().getFullYear()} FEXUS</span>
          <div className="flex gap-6">
            <Link to="/login" className="hover:text-white/70 transition-colors">Log in</Link>
            <Link to="/signup" className="hover:text-white/70 transition-colors">Sign up</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
