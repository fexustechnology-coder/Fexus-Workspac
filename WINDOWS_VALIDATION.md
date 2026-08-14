# FEXUS Computer-Use — Windows Setup & Validation Procedure

Everything in this document is written as a real procedure for **you**
to run on your actual Windows machine. Nothing in it has been executed
by Claude — this sandbox has no Windows, no display, no microphone, and
no way to reach the real Groq vision endpoint. That has been true since
the Local Agent was first introduced, and remains true here. What
changed this session is the code the procedure below exercises is real,
and — where the logic doesn't require Windows to test — has been
verified directly (see `CHANGELOG.md`'s entries for exact details of
what was actually run).

---

## 1. Windows Setup

**Requirements**: Windows 10/11, Node.js (LTS), PowerShell (built in).

```
cd local-agent
npm install
copy .env.example .env
```

Open FEXUS in your browser → **Owner Dashboard → Local PC Agent** → copy
the pairing token into `local-agent/.env`'s `LOCAL_AGENT_PAIRING_TOKEN`.
Set `LOCAL_AGENT_ALLOWED_DIRS` (e.g. `desktop,fexusWorkspace`), then:

```
npm start
```

You should see real startup output confirming the platform is `win32`,
the pairing token is configured, and which directories are allowed. If
platform shows anything other than `win32`, every file/mouse/keyboard/
screen action will honestly report "not implemented on this platform"
rather than silently doing nothing — this is intentional.

Back in FEXUS, click **Check Connection** — it should show "Connected."
Enable the specific permission checkboxes for whatever you intend to
test (Desktop, Mouse control, Keyboard control, etc.) — everything
defaults to off.

## 2. Vision Configuration (optional — only needed for computer_click/observe)

In `backend/.env`, set `VISION_MODEL` to a real vision-capable model
name available on your Groq account. **This project cannot tell you the
current exact model name** — check `console.groq.com/docs/models`
yourself, since availability changes over time. Leave it blank and the
task planner will never generate a step that requires screen vision —
it uses honest `manual_step` entries instead.

## 3. Microphone

Open **Owner Dashboard → Voice Agent**, click "Start Listening." Chrome
will show a real microphone permission prompt — allow it. If you see
"Speech recognition is not available in this browser," you're not in
Chrome/Edge; use the text box instead (identical behavior either way).

---

## Real Tests To Run Yourself

For each, the **exact command to say or type**, and **what a correct
result looks like**. None of these have been run by Claude.

### Test 1 — Screenshot
Say or type: *(no voice command triggers a bare screenshot by itself —
use the browser console instead once signed in)*
```js
fetch('/api/local-agent', {credentials:'include'}) // confirms pairing/connection first
```
Then trigger any `computer_observe` step via a complex task, or call the
Local Agent directly: `POST http://localhost:9911/capture-screen` with
your pairing token header. **Confirm**: response contains a real,
sizeable base64 string; decoding it produces a real PNG matching your
actual desktop at that moment.

### Test 2 — Vision
Requires `VISION_MODEL` configured (Test 2 above). Say: **"Usman, open
Google."** then a follow-up complex command that would trigger
`computer_observe`, e.g. **"Usman, describe what's on my screen."**
**Confirm**: the response's `application`/`visibleText` genuinely
matches what's on screen, not a generic answer.

### Test 3 — Mouse
Say: **"Usman, open Notepad."** then a task requiring `computer_click`
on a safe, non-destructive target. **Confirm**: you visually see the
real Windows cursor move gradually (not teleport) and click.

### Test 4 — Keyboard
After Test 3, a step using `computer_type` with safe text (e.g. "hello
fexus"). **Confirm**: text appears character-by-character in Notepad,
not pasted instantly.

### Test 5 — Browser
Say: **"Usman, open browser."** → **"Open Google."** → **"Search CNC
automation."** **Confirm** each step's real result before the next
proceeds — this is enforced by the executor's own real
observe-before-act design, not something you need to manually pace.

### Test 6 — Google Maps (start small)
Say: **"Usman, find 5 dental clinics in Lahore that appear to have no
website. Save the results to Desktop."** **Do not start with 30** — the
directive that requested this explicitly asked for a small test first.
**Confirm**: a real file appears on your Desktop, and its contents are
businesses that genuinely exist (spot-check 1-2 on Google yourself).

### Test 6b — Full research → folder → file pipeline (real bug fixed this session)
Say exactly: **"Usman, Google Places se Lahore mein interior designers
search karo. Pehle 5 businesses research karo. Desktop par Interior
Designers Test naam ka folder banao. Research ka data us folder mein CSV
file mein save karo. File verify karo."**

1. Watch the actual screen for any real browser/window activity — there
   should be none for the research step itself (it's a real, direct
   Google Places API call, not browser automation).
2. Confirm a real folder named "Interior Designers Test" appears on your
   Desktop.
3. Open that folder manually in Explorer.
4. **Confirm a CSV file exists INSIDE that folder** — not on the Desktop
   root. This is the exact bug this session fixed: the file was
   previously written to the wrong location or left empty.
5. Open the CSV file.
6. Confirm it contains real business records (name, phone, website,
   address, category, rating columns) — not a header-only empty file.
7. Confirm the record count matches what Usman reported out loud.
8. Say **"Usman, give this file to Hira."** and confirm (via Owner
   Dashboard → Memory Engine, or Company Office) that Hira's task now
   references this exact real file path.

### Test 7 — Hira handoff
Say: **"Usman, give this test leads file to Hira."** **Confirm** in
**Company Office**: Hira's visual state changes to reflect a real,
active `WorkflowStage` — this was verified by reading the actual
`robotVariantForStatus()`/`stageForEmployee()` code in an earlier
session, not re-verified live this session.

### Test 8 — Email campaign (never real recipients on a first run)
Use a test list of addresses you control. Confirm the flow reaches
**WAITING_APPROVAL** and does **not** send until you explicitly say
"send" and the system asks you to confirm again.

### Test 9 — STOP (the specific fix from this session)
Start any task with multiple real PC-touching steps. While a step is
genuinely mid-execution, say **"Usman, stop."** **Confirm**: the task's
status becomes `STOPPED` (not `PAUSED`), and the *next* queued step does
not begin. Whether the *specific in-flight* HTTP call was aborted before
it would have finished anyway depends on timing — the abort signal is
real, but if the Local Agent had already returned its response in the
same moment, there's nothing left to cancel. This is an honest
limitation, not a claim that every possible race is eliminated.

### Test 10 — Resume
After Test 9, say: **"Usman, resume."** **Confirm**: the task continues
from the interrupted step (re-attempting it), not from the beginning.

### Test 11 — Confidence gate
With `VISION_MODEL` configured, try a task requiring `computer_click` on
something genuinely ambiguous or absent from the screen. **Confirm**:
the step fails with a message citing an actual confidence number below
0.7, not a wrong click.

### Test 12 — WhatsApp computer-use (new this session)
Say: **"Usman, open WhatsApp."** — this opens WhatsApp Web (a real,
verifiable URL, not a guessed Desktop app path). **Confirm** you see
either your real chat list (if already logged in) or a real QR login
screen — the system will honestly report whichever is actually visible,
never assume you're logged in.

Then, only if logged in, try: **"Usman, open my chat with [a real
contact name] and reply: I'll call you tomorrow."** This chains real
`computer_observe` → `computer_click` (find the chat) →
`computer_click` (find the message box, with real post-click
verification that it's focused) → `computer_type` → `computer_click`
(Send, with real post-click verification the message appears in the
chat). **This is genuinely confidence-gated, not guaranteed** — if the
vision model can't confidently identify a specific chat or button on
your actual screen, the step will honestly fail and tell you why, rather
than click the wrong thing.

### Test 13 — Full numbered test list (as requested)
For a complete Windows validation pass, run these in order and record
RECEIVED / EXECUTED / VERIFIED for each, exactly as earlier entries in
this document describe:
1. "Usman, open desktop."
2. "Usman, create test.txt on Desktop."
3. "Usman, open Chrome and search Google."
4. "Usman, open WhatsApp."
5. "Usman, open [contact]'s chat and reply."
6. "Usman, open Gmail and read latest email." *(requires computer_observe/click — real, confidence-gated, not guaranteed on an unfamiliar inbox layout)*
7. "Usman, open Google Maps and search interior designers."
8. "Usman, collect 5 businesses and save them to CSV."
9. "Usman, research a topic and create a report." *(the "research/read pages" part is honestly a manual_step unless VISION_MODEL is configured — see Known Limitations)*
10. "Usman, assign the research file to Hira."
11. "Usman, create and prepare the Hira campaign."
12. "Usman, stop." (mid-task)
13. "Usman, resume."
14. One full end-to-end task combining several of the above in one sentence.

---

### Test 14 — Urdu voice responses (new this session)
Say any command, e.g. **"Usman, Desktop kholo."** **Confirm**: Usman's
spoken and on-screen response is genuinely in Urdu script (e.g. "جی، آپ
کا Desktop کھول رہا ہوں۔"), not English — including for multi-step task
progress updates and the final completion message. Technical names
(Gmail, Hira, CSV, etc.) may stay in English inside the Urdu sentence —
that's expected, not a bug.

### Test 15 — Google Places pagination (new this session)
Say: **"Usman, Google Places se Lahore mein interior designers, pehle 50
research karo."** **Confirm**: if your account/key genuinely has that
many results available, Usman reports a real count meaningfully above
20 (the old ceiling) — up to the real number that actually exists,
never padded. If fewer than 50 genuinely exist, Usman should honestly
report the real, smaller number.

### Test 16 — Social media application launch (new this session)
Say: **"Usman, WhatsApp kholo."** then separately **"Usman, LinkedIn
kholo."** and **"Usman, Instagram kholo."** **Confirm**: each opens the
real web version of that platform in your browser — not a generic
search, not a guessed Desktop app path.

---

## Known, Stated Limitations (unchanged from prior entries unless noted)

- No headless browser, no DOM/accessibility-tree reading — only
  vision-based element identification (when configured) or direct URL
  navigation. This is a genuine, current limitation of this sandbox
  environment (no network access to install a browser automation
  library) — stated once, clearly, here, not repeated as a hedge on
  every feature. Vision-based interaction (computer_observe/click/type)
  is real and built, with real confidence gating and real post-action
  verification — but it is inherently probabilistic on an unfamiliar or
  cluttered screen, the same real constraint any vision-based
  computer-use system has, not something specific to this codebase.
- In-flight cancellation (new this session) aborts the HTTP request this
  backend made to the Local Agent — it cannot reach into an
  already-issued Win32 API call the Local Agent's own process is
  mid-way through.
- Vision model availability/naming cannot be verified by this codebase
  — you must check your own Groq account.
- Every Windows-specific claim in this document is a **procedure**, not
  a result — the "Confirm" lines are what YOU check, not something
  already confirmed here.

