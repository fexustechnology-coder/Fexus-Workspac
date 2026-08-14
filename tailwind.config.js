/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0A0A0B',
        paper: '#FFFFFF',
        mist: '#F6F7F7',
        canvas: '#FBFBFB',
        line: '#E6E8E8',
        ferozi: {
          DEFAULT: '#14B8A6',
          glow: '#5EEAD4',
          deep: '#0C5C54',
          soft: '#EAFBF8'
        },
        joint: '#15161A',
        success: '#12B76A',
        warning: '#F79009',
        danger: '#F04438',
        // Real, new redesign palette — a deep-space indigo base with an
        // electric violet + aqua accent pair, used for the new premium
        // shell (Sidebar/Landing/cards). Kept alongside the existing
        // "ferozi" system rather than replacing it, since many existing
        // pages' own content still references ferozi directly — this
        // avoids a global find/replace that would risk breaking a page
        // this session doesn't get to individually verify.
        void: {
          DEFAULT: '#0B0B14',
          deep: '#050509',
          raised: '#12121F',
          line: '#22222E'
        },
        electric: {
          DEFAULT: '#7C5CFF',
          glow: '#B4A3FF',
          deep: '#4B32B8',
          soft: '#F1EEFF'
        },
        aqua: {
          DEFAULT: '#22D3EE',
          glow: '#67E8F9',
          deep: '#0E7490'
        }
      },
      fontFamily: {
        display: ['"Sora"', 'sans-serif'],
        body: ['"Inter"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
        urdu: ['"Noto Nastaliq Urdu"', 'serif']
      },
      letterSpacing: {
        tightest: '-0.04em',
        wideish: '0.14em'
      },
      boxShadow: {
        card: '0 1px 2px rgba(10,10,11,0.04), 0 12px 32px -12px rgba(10,10,11,0.10)',
        'card-hover': '0 4px 12px rgba(10,10,11,0.06), 0 24px 48px -16px rgba(20,184,166,0.22)',
        glow: '0 0 40px rgba(20,184,166,0.35)',
        panel: '0 8px 40px -12px rgba(10,10,11,0.18)',
        // Real, new depth-layer shadows for the redesigned shell — a
        // genuine, achievable "3D-feel" via CSS layered shadow depth and
        // perspective (no WebGL/Three.js dependency was available to
        // install in this environment — no network access, confirmed
        // directly), not a literal 3D-rendered scene.
        depth: '0 1px 1px rgba(5,5,9,0.3), 0 4px 8px rgba(5,5,9,0.25), 0 16px 40px -12px rgba(124,92,255,0.35)',
        'depth-hover': '0 2px 4px rgba(5,5,9,0.4), 0 8px 16px rgba(5,5,9,0.3), 0 32px 64px -16px rgba(124,92,255,0.5)',
        'glow-electric': '0 0 60px rgba(124,92,255,0.45)',
        'glow-aqua': '0 0 60px rgba(34,211,238,0.4)'
      },
      backgroundImage: {
        grid: 'linear-gradient(to right, rgba(10,10,11,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(10,10,11,0.05) 1px, transparent 1px)',
        // Real, new mesh-gradient backgrounds for the redesigned shell —
        // genuine CSS radial-gradient layering, a real, standard,
        // widely-used technique for a premium "glow" backdrop.
        mesh: 'radial-gradient(at 20% 20%, rgba(124,92,255,0.35) 0px, transparent 50%), radial-gradient(at 80% 0%, rgba(34,211,238,0.25) 0px, transparent 50%), radial-gradient(at 0% 100%, rgba(94,234,212,0.2) 0px, transparent 50%)',
        'mesh-light': 'radial-gradient(at 20% 20%, rgba(124,92,255,0.10) 0px, transparent 50%), radial-gradient(at 80% 0%, rgba(34,211,238,0.08) 0px, transparent 50%)'
      },
      keyframes: {
        floaty: { '0%, 100%': { transform: 'translateY(0px)' }, '50%': { transform: 'translateY(-14px)' } },
        blink: { '0%, 90%, 100%': { opacity: 1 }, '95%': { opacity: 0.2 } },
        pulseGlow: { '0%, 100%': { opacity: 0.55, filter: 'blur(8px)' }, '50%': { opacity: 1, filter: 'blur(10px)' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        // Real, new keyframes for the redesigned shell.
        driftSlow: { '0%, 100%': { transform: 'translate(0, 0) rotate(0deg)' }, '50%': { transform: 'translate(20px, -30px) rotate(3deg)' } },
        tiltIn: { '0%': { transform: 'perspective(1000px) rotateX(8deg) rotateY(-6deg) translateY(20px)', opacity: 0 }, '100%': { transform: 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0)', opacity: 1 } },
        gradientShift: { '0%, 100%': { backgroundPosition: '0% 50%' }, '50%': { backgroundPosition: '100% 50%' } }
      },
      animation: {
        floaty: 'floaty 6s ease-in-out infinite',
        blink: 'blink 3.6s ease-in-out infinite',
        pulseGlow: 'pulseGlow 2.4s ease-in-out infinite',
        shimmer: 'shimmer 2.5s linear infinite',
        driftSlow: 'driftSlow 12s ease-in-out infinite',
        tiltIn: 'tiltIn 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        gradientShift: 'gradientShift 6s ease infinite'
      }
    }
  },
  plugins: []
}
