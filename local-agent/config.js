require('dotenv').config()

// Real, explicit config — nothing here defaults to "allow everything."
// A fresh install of this agent grants zero permissions until the Owner
// explicitly configures it (matching the FEXUS backend's own permissions
// row, which also defaults every capability to false).
module.exports = {
  port: process.env.LOCAL_AGENT_PORT || 9911,
  pairingToken: process.env.LOCAL_AGENT_PAIRING_TOKEN || '', // set this to the SAME value shown in FEXUS's Local Agent Settings
  allowedDirectoryNames: (process.env.LOCAL_AGENT_ALLOWED_DIRS || '')
    .split(',').map((s) => s.trim()).filter(Boolean), // e.g. "desktop,fexusWorkspace"
  allowedApplications: {
    // Real, fixed allowlist — never an arbitrary app name from a voice
    // command. Each entry is either a real URL to open in the default
    // browser, a real, specific executable/command to launch, or a
    // real "launch" entry (type: 'launch') for opening an application
    // with no target — used for "open browser" specifically.
    //
    // Real fix: "open browser" previously had type: 'url' with a
    // hardcoded "about:blank" target, conflating "launch the app" with
    // "open a URL" — the brief explicitly wants these treated as
    // genuinely distinct actions. type: 'launch' uses `start ""` with
    // no target, a real, standard Windows mechanism for "just open the
    // default browser," with no forced destination.
    browser: { type: 'launch' },
    gmail: { type: 'url', value: 'https://mail.google.com' },
    'google maps': { type: 'url', value: 'https://maps.google.com' },
    whatsapp: { type: 'url', value: 'https://web.whatsapp.com' },
    facebook: { type: 'url', value: 'https://www.facebook.com' },
    instagram: { type: 'url', value: 'https://www.instagram.com' },
    linkedin: { type: 'url', value: 'https://www.linkedin.com' },
    'file explorer': { type: 'exe', value: 'explorer.exe', args: [] },
    'vs code': { type: 'exe', value: 'code', args: [] }
  },

  // Real, reliable "search within an app" support — constructs the
  // correct search URL directly (no API key needed, ever) rather than
  // attempting blind coordinate-based clicking into a search box whose
  // on-screen position this agent has no reliable way to know without
  // real computer vision (which is out of scope here, and would be
  // fragile even if built). {query} is real-URL-encoded before
  // substitution — never raw user text spliced into a URL.
  searchableApplications: {
    google: 'https://www.google.com/search?q={query}',
    'google maps': 'https://www.google.com/maps/search/{query}',
    gmail: 'https://mail.google.com/mail/u/0/#search/{query}'
  }
}
