# FEXUS Local PC Agent

Runs on **your own Windows computer** — not on the same machine as the
FEXUS backend unless that's also your computer (for most real setups, it
is: FEXUS is designed to be run locally by the Owner). This is what lets
FEXUS voice commands perform real, explicitly-approved actions on your
PC — opening files, folders, and applications — without giving the
browser or the FEXUS backend unrestricted OS access.

## What this is NOT

- Not a remote shell. There is no way to run an arbitrary command through
  this agent — only the fixed, allowlisted actions in `tools.js`.
- Not exposed to the network. It binds to `127.0.0.1` only.
- Not trusted blindly. Every request must include the exact pairing
  token from FEXUS's Local PC Agent settings page, checked on every
  single request, not just at startup.

## Requirements

- Windows 10/11 (this MVP's file/application/mouse/keyboard/shutdown
  operations are Windows-specific — see "Platform" below).
- Node.js installed.
- PowerShell (included by default on Windows 10/11) — used for real
  Win32 API mouse/keyboard/screen calls, via a single fixed script, never
  arbitrary PowerShell commands.

## Installation

```
cd local-agent
npm install
copy .env.example .env
```

Open FEXUS in your browser → Owner Dashboard → **Local PC Agent** → copy
the pairing token shown there into your new `.env` file's
`LOCAL_AGENT_PAIRING_TOKEN`.

Decide which of your own folders you want FEXUS to be able to touch, and
list them in `.env`'s `LOCAL_AGENT_ALLOWED_DIRS` (e.g. `desktop` or
`desktop,fexusWorkspace`). **You must also enable the matching checkboxes
in FEXUS's Local PC Agent settings page** — both the agent's own config
and FEXUS's stored permissions have to agree before an action is
allowed. Neither one alone is enough.

## Running

```
npm start
```

You should see:
```
[local-agent] FEXUS Local Agent listening on http://127.0.0.1:9911 (localhost only)
[local-agent] Pairing token configured: true
[local-agent] Allowed directories: desktop
[local-agent] Platform: win32
```

Then in FEXUS, click **Check Connection** — it should show "Connected."

## Wake word

The voice activation name is **"Usman"** — not "FEXUS." "FEXUS" is still the
product/company name everywhere else; only what you say to get the
assistant's attention changed. Both "Usman, ..." and "Hey Usman, ..." are
recognized, case-insensitively.

## Test commands

Test 1: **"Usman, open my desktop."** — lists real Desktop files (requires Desktop permission)
Test 2: **"Usman, open File Explorer."** — opens a real Explorer window (requires Applications permission)
Test 3: **"Usman, find test.txt."** — searches your permitted directories (requires Read Metadata permission)
Test 4: **"Usman, open test.txt."** — opens the real file with its default app (requires Open Files permission)
Test 5: **"Usman, open Gmail."** — opens Gmail in your default browser (requires Applications permission)
Test 6: **"Usman, open Google Maps."** — opens Google Maps in your default browser
Test 7: **"Usman, search Google Maps for dental clinics in Lahore."** — constructs and opens the real, correctly-encoded search URL directly (no API key needed)
Test 8: **"Usman, open campaign.xlsx."** — real fuzzy file search + open, same mechanism as Test 4
Test 9: **"Usman, give this file to Hira."** — creates a real Workflow assignment (existing Workflow Engine, not new logic)
Test 10: **"Usman, prepare the first 30 leads."** — routes to the existing Email Campaign system (task assignment only in this MVP — see Known Limitations)
Test 11: **"Usman, shut down my computer."** — must show a confirmation prompt first; only executes after you explicitly say "Yes"
Test 12: **"Usman, restart my computer."** — same confirmation requirement as Test 11

## Mouse and keyboard (building blocks, not standalone voice commands)

Real mouse movement and keyboard typing exist as genuine capabilities
(`gui.js`), used internally by more complex flows rather than exposed as
raw "move the mouse to X,Y" voice commands, since that isn't natural
speech. Movement is genuinely gradual (interpolated over 150–600ms, not
a teleport) and typing is genuinely character-by-character with natural
jitter, not a single paste.

## Platform

This MVP's real file/folder/application/shutdown operations are
**Windows-only** (`cmd.exe`, `explorer.exe`, `taskkill`, `shutdown`).
Running this agent on macOS/Linux will start successfully and respond to
`/health`, but every actual OS action will return an honest
"not implemented on this platform" error rather than silently doing
nothing or pretending to succeed. The architecture (Express server,
pairing/auth, path-safety checks) is fully cross-platform — adding real
macOS/Linux implementations later means adding platform-specific
branches to `tools.js`'s functions, not rewriting the agent.

## Security summary

- No arbitrary shell/command execution anywhere — every external process
  call uses `execFile` with a fixed executable and validated arguments,
  never a string-interpolated shell command.
- Mouse/keyboard control runs through exactly ONE fixed PowerShell script
  (`win32.ps1`) — real Win32 API calls only, never arbitrary PowerShell
  from a voice command or the LLM.
- Every file/folder path is resolved and checked against your real,
  configured allowed directories before touching the filesystem — this
  check was tested directly against real directory-traversal attempts.
- Applications can only be opened from a fixed, hardcoded allowlist —
  never an arbitrary program name.
- Search (e.g. Google Maps) constructs a real, properly-encoded URL
  directly — never blind coordinate-clicking into an unverified screen
  location, and never requires an API key.
- Shutdown/restart require a real `confirmed: true` flag in the request,
  which FEXUS only sends after you've explicitly said yes out loud (or
  in the text fallback).
- No credentials, passwords, cookies, or private keys are ever read or
  exposed by this agent.
- Every action — success or failure — is written to a real audit log
  (`PcActionLog`), not just successful ones.

## Known limitation: multi-step task handoff

"Usman, prepare the first 30 leads" (Test 10) currently creates a real
Workflow task assignment to Hira — it does not yet automatically
identify which specific campaign or which specific 30 contacts within
it. Completing the actual contact-selection step still happens through
the existing Email Campaigns UI once Hira's task is assigned. Stated
honestly here rather than implied as fully automated.
