# FEXUS Workspace Backend — Robot Office Foundation

A real Express + Prisma (SQLite) backend. No fake state: every robot
animation in the frontend Company Office page is driven by a `Task` row
moving through an actual workflow stage in this database.

## Setup

```bash
cd backend
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run seed
npm run dev
```

The API runs at `http://localhost:4000`. Health check: `GET /api/health`.

## Why no enums

SQLite has no native enum type, so `stage`, `level`, and `status` are plain
strings validated in the API layer (`src/constants.js`) rather than Prisma
enums — this avoids the classic "Prisma + SQLite enum" migration failure.

## Data model

- **Department** — one of the 9 director departments (website, marketing,
  sales, seo, deployment, finance, support, analytics, automation).
- **Employee** — CEO (1), Director (1 per department), Employee (1 per
  department for now — full department rosters are future work).
- **Task** — created by the Owner, moves through `STAGES` in
  `src/constants.js`:

  ```
  submitted → ceo_review → director_called → director_briefing →
  director_returning → employee_called → employee_working →
  employee_reporting → director_reporting → completed
  ```

  Each stage updates `assignedToId` to whichever employee is currently
  holding the task, so the frontend always knows exactly who to animate.
- **BrainMemory** — Phase 3 architecture only (see below). No reads/writes
  happen against it yet.

## Endpoints

| Method | Path                        | Description                          |
|--------|-----------------------------|---------------------------------------|
| GET    | /api/health                  | Service check (public)                |
| POST   | /api/auth/signup             | `{ name, email, password }` → creates account, sets session cookie |
| POST   | /api/auth/login               | `{ email, password }` → signs in, sets session cookie |
| POST   | /api/auth/logout              | Clears the session cookie             |
| GET    | /api/auth/me                  | Current signed-in user (requires auth) |
| GET    | /api/company-brain            | Read the Company Brain (any signed-in user) |
| PUT    | /api/company-brain            | Update the Company Brain (Owner only) |
| GET    | /api/departments             | All departments + active task (Owner only) |
| GET    | /api/employees               | Full roster (Owner only)              |
| GET    | /api/employees/ceo           | CEO + current active task (Owner only) |
| GET    | /api/tasks                   | All tasks (Owner only)                |
| POST   | /api/tasks                   | `{ title, departmentKey }` → create (Owner only) |
| POST   | /api/tasks/:id/advance        | Move a task to its next real stage (Owner only) |
| GET    | /api/brain                   | Phase 3 architecture placeholder (any signed-in user) |
| GET/POST/PATCH/DELETE | /api/clients            | Client CRUD (any signed-in user) |
| GET/POST/PATCH/DELETE | /api/projects            | Project CRUD, optionally linked to a client |
| GET/POST/PATCH/DELETE | /api/invoices            | Invoice CRUD; `number` is server-generated |
| GET/POST/PATCH/DELETE | /api/campaigns           | Marketing campaign CRUD |
| GET/POST/PATCH/DELETE | /api/deals               | Sales deal CRUD |
| GET/POST/PATCH/DELETE | /api/seo-audits          | SEO audit CRUD |
| GET/POST/PATCH/DELETE | /api/sites               | Website Builder site CRUD |
| GET/POST/PATCH/DELETE | /api/automations         | Automation workflow CRUD |
| GET/POST/PATCH/DELETE | /api/expenses            | Expense CRUD (feeds Burn Rate) |
| GET    | /api/metrics                  | Real, live-computed MRR/ARR/burn rate/status breakdowns (any signed-in user) |
| GET/POST/DELETE | /api/meetings                  | Meeting list/create/delete (any signed-in user) |
| GET    | /api/ceo/dashboard             | Real-time Executive Dashboard data (Owner only) |
| POST   | /api/ceo/chat                  | CEO Chat — grounded in Company Brain + live data (Owner only, requires `ANTHROPIC_API_KEY`) |

## Business Foundation — real CRUD, no demo data

Every Workspace module (Clients, Projects, Invoices, Marketing, Sales, SEO,
Website Builder, Automation) now reads and writes real Prisma-backed tables.
`Client`, `Project`, and `Invoice` have custom routes (`routes/clients.js`,
`routes/projects.js`, `routes/invoices.js`) because they carry relations —
Projects and Invoices link to a Client, and Invoice numbers (`INV-XXXX`) are
generated server-side rather than trusted from the client. The other five
resources share a generic builder, `src/lib/crudFactory.js`, since they're
simple flat records with no relations to manage.

`GET /api/metrics` (`routes/metrics.js`) computes MRR, ARR, burn rate, and
status/stage breakdowns live from these tables on every request — there is
no stored historical time-series, so nothing is presented as a trend that
isn't real. Dashboards show current-state distributions instead (e.g. deals
by stage) rather than invented month-over-month lines.

## Authentication

Real session-based auth: `bcryptjs` for password hashing, a JWT stored in an
`httpOnly` cookie (`fexus_session`) for the session itself. No JWT is ever
exposed to frontend JS — the cookie is the only thing crossing the wire, sent
automatically by the browser on every request (`credentials: 'include'` on
the frontend, `cors({ origin: FRONTEND_ORIGIN, credentials: true })` here).

**Exactly one email becomes Owner.** Set `OWNER_EMAIL` in `.env` to your real
email *before* your first signup — whichever account signs up with that
exact email (case-insensitive) gets `role: "owner"`. Every other email
becomes `role: "user"`. This is enforced server-side in `routes/auth.js`; it
cannot be changed from the frontend.

## Global Cost Optimization Rule (Phase 12, applies retroactively)

From this phase on, the whole system is designed around: **AI only where
real reasoning or generation is required; everything else deterministic.**

### Where this already held true, audited not assumed
Before writing any new code this phase, every existing AI call site was
checked against this rule:
- **CRUD, dashboards, workflow management, calculations, notifications,
  task routing** — zero AI calls anywhere in any of these across Phases
  1–11. Every dashboard number, every status transition, every
  notification is deterministic code reading real data.
- **The only 3 places AI was ever called**: CEO Chat (Phase 4), Director
  Chat (Phase 5), and Website AI's plan generation (Phase 10) — all three
  are genuine reasoning/generation tasks a rule-based system couldn't do,
  which is exactly what this rule says AI should be reserved for.

### What Phase 12 adds: a real Free/Paid split, not just a label
Website AI's new code-generation feature is the first place in the whole
system with a genuine choice between free and paid execution:
- **Local (Free)** — `buildFreeScaffold()` in `routes/websiteAI.js`
  deterministically assembles boilerplate files straight from the
  project's already-stored plan (page/component names) — **zero API
  calls, works with no `ANTHROPIC_API_KEY` at all**.
- **AI Generation (Paid)** — one real, usage-tracked LLM call via the new
  `callClaudeWithUsage()` (an additive export in `lib/llm.js` — the
  existing `callClaude()` used by CEO/Director Chat is byte-for-byte
  unchanged, verified after the edit).

### Avoiding duplicate AI calls — reuse, not re-derive
The paid code-generation prompt feeds in the **already-generated** plan
fields (`pages`, `sections`, `components`, `designPlan`, `responsivePlan`,
`assetPlan` — all produced once, back in Phase 10's planning call) instead
of re-running requirements analysis or re-fetching Company Brain/Operating
Manual/Memory Engine context a second time. One reasoning pass produces
the plan; code generation only has to translate it, not re-think it.

### Real, honest cost visibility — not a guessed dollar figure
Every paid AI call appends a real entry to `WebsiteProject.apiUsageLog`:
`{ action, inputTokens, outputTokens, at }`, using the **actual** `usage`
object the Anthropic API returns — not an estimate. The UI sums these into
a running token count. No dollar amount is shown, since pricing changes
and hardcoding a rate risks being wrong; token counts are the honest,
stable number to report.

## LLM Provider Layer — Google Gemini Flash only (Phase 13)

As of this phase, **every** AI call in the application goes through one
provider-agnostic module: `backend/src/lib/llmProvider.js`. Google Gemini
Flash is the only active provider. Anthropic's implementation is kept in
the same file, fully functional code, but genuinely unreachable unless
`LLM_PROVIDER=anthropic` is explicitly set in `.env` — nothing in this
codebase sets that, so it stays inactive by default, exactly matching the
brief: "Anthropic support may remain in architecture only. It must NOT be
used."

### What changed, and why it required touching previously-protected files
Three existing AI call sites predated this centralized layer:
- `routes/ceo.js` had its **own inline `fetch()`** directly to
  `api.anthropic.com` (it predated `lib/llm.js` entirely, a quirk noted
  back in Phase 5's docs).
- `routes/directors.js` called `lib/llm.js`'s `callClaude()`.
- `routes/websiteAI.js` called `lib/llm.js`'s `callClaude()` and
  `callClaudeWithUsage()`.

Earlier phases explicitly protected `ceo.js` and `directors.js` from
modification. This phase's brief doesn't repeat that protection list and
explicitly requires "the entire application must now use the centralized
LLM Provider Layer" — so all three were surgically migrated: only the
import line and the actual API call were changed in each file; context
gathering, prompt building, and error handling were left untouched. `lib/llm.js`
itself is now imported by nothing (verified by grep) — left in place,
labeled inactive, rather than deleted, since the brief says Anthropic
architecture "may remain."

### Verification, not assumption
After the migration: grepped the entire backend for `api.anthropic.com` —
the only two matches are `lib/llmProvider.js` (Anthropic kept as an
inactive branch) and the now-unimported `lib/llm.js`. Grepped for anything
still requiring `lib/llm.js` — zero matches.

### Configuration
```bash
# backend/.env
LLM_PROVIDER="gemini"                # the only supported value in this phase
GEMINI_API_KEY=""                     # get one free at https://aistudio.google.com/apikey
GEMINI_MODEL="gemini-2.0-flash"
```
CEO Chat, Director Chat, Website AI generation, and Growth AI content
generation all read this same configuration — set the key once.

## Growth AI Department (Phase 13) — Marketing + Sales combined

One department page covering all 12 modules the brief asks for: Marketing
AI, Sales AI, Lead Finder, CRM, Campaign Manager, Proposal Generator, Cold
Email Generator, LinkedIn/Instagram Outreach, Follow-up Manager, Meeting
Scheduler, and Growth Analytics.

### Data model — one unified table instead of fourteen
`GrowthContent` (`type` discriminator) covers all 14 generation
capabilities (8 marketing + 6 sales) — campaigns, posts, captions,
hashtags, ads, email campaigns, content calendars, strategy, proposals,
quotations, outreach, follow-ups, meeting agendas/notes/reminders, closing
messages. Fourteen near-identical tables would have been worse schema
design than one table with a type field and the same shape everywhere.

`Lead` (extended from Phase 5) now has the exact structure specified:
Company, Owner (the original `name` field), Email, Phone, Website,
Industry, Status, Priority, Notes. The CRM pipeline **is** the Lead's
`status` field moving through `New → Contacted → Interested → Meeting →
Proposal → Won → Lost` — not a separate "CRM record" model, since that
would just be a second copy of the same entity.

### Lead Finder — real where it can be, honest where it can't
- **CSV Import**: real, deterministic, no AI — parses a header row and
  creates `Lead` rows.
- **Search public business lists / Search Google Maps**: framework only,
  exactly as specified. Rather than fake results, both endpoints return an
  explicit message saying no provider is connected yet — Google Maps
  search would eventually go through the Integration Layer's existing
  "Google Business" connector (Phase 9), not a new one.

### Marketing AI + Sales AI — the Free/Paid split, applied consistently
Every one of the 14 content types supports both:
- **Local (Free)**: `freeTemplate()` — a real, usable deterministic draft
  built from Company Brain + the linked Lead's data, zero API calls.
- **AI (Paid)**: `buildAIPrompt()` — one real Gemini call, grounded in
  Company Brain, the relevant Operating Manual sections, and the linked
  Lead — same reuse pattern Website AI established in Phase 10/12.

### The approval gate — structurally enforced, not just documented
"Approve Campaign? YES/NO. Without approval, nothing executes." —
`POST /api/growth/content/:id/approve` checks `req.body.approve !== true`
explicitly; anything other than the literal boolean `true` rejects the
content instead of approving it. This is the exact same pattern Website
AI's `confirm-publish` used in Phase 12 for the same reason.

### No real sending, anywhere
Once Approved, `POST /api/growth/content/:id/mark-sent` only sets a
timestamp — it does not call Instagram, LinkedIn, Facebook, Email,
WhatsApp, or X in any way. There is no messaging API integration
anywhere in this phase's code.

### Growth Analytics — entirely deterministic
`GET /api/growth/analytics` computes Leads (by stage), Conversion Rate,
Win Rate, Revenue (from real paid Invoices), ROI (revenue vs. real
Expenses), Campaign Performance, Meetings, and Pipeline Value — all
`Array.filter`/`.reduce` over real Business Foundation + Lead +
GrowthContent data. Zero AI calls anywhere in this endpoint.

### Integration with the rest of the system
- **Company Brain / Operating Manual**: read-only, same pattern as every
  other AI feature in this app.
- **Workflow Engine**: content generation optionally accepts a
  `workflowStageId` to link generated work to a real stage.
- **Memory Engine**: if a `workflowStageId` is linked to an employee,
  `memoryManager.loadMemory()` (the existing, unmodified function) is
  called to load temporary context for that generation.
- **Automation Engine, Integration Layer, CEO Brain, Director Brain,
  Employee System**: these systems already surface Business Foundation
  data (Campaigns, Deals, Invoices) that Growth AI now populates more
  richly — no code changes were needed in any of them for that visibility
  to exist, so none were touched.

### Endpoints
| Method | Path | AI? |
|---|---|---|
| POST | /api/growth/leads/search-public-lists, /search-maps | No — framework-only stub |
| POST | /api/growth/leads/import-csv | No — deterministic |
| POST/GET/PATCH/DELETE | /api/growth/content(/:id) | POST is AI-or-Free depending on `mode`; everything else is CRUD |
| POST | /api/growth/content/:id/submit-for-approval, /approve, /mark-sent | No |
| GET | /api/growth/analytics | No — fully deterministic |
| GET | /api/growth/config | No |

## Website AI V3 (Phase 12) — real code generation, never auto-published

Website AI now generates real, working code — but only through one new,
explicitly-paid path. The Phase 10 planning endpoint's `looksLikeCode()`
guard is **completely unchanged** and still rejects any code from a
planning response; code is only ever produced by the new
`generate-code` endpoint, which exists specifically to produce it.

### Website Generation Architecture
`POST /api/website-ai/projects/:id/generate-code` — `{ codeStack, mode }`.
`codeStack` is one of 5 options (`backend/src/websiteAIConstants.js`
`CODE_STACKS`) covering the brief's HTML/CSS/JS/React/Next.js/Tailwind
list — Tailwind is offered paired with React/Next.js (how it's actually
used), not as a meaningless standalone choice. `mode` is `"free"` or
`"ai"`, per the cost-optimization rule above.

### Code Generation Flow
1. **Free mode**: `buildFreeScaffold()` — deterministic, reads the
   project's stored plan, writes placeholder files (e.g.
   `src/pages/Home.jsx` per planned page). No network call.
2. **AI mode**: `buildCodeGenPrompt()` builds a prompt from the stored
   plan (not re-gathered context), explicitly instructs the model that
   THIS response — unlike planning — is allowed to contain real code, and
   requires a JSON `{ files: [{ path, content }] }` response.
3. Either way, `generatedFiles` (JSON) is saved on `WebsiteProject`,
   alongside `codeStack`, `codeGenMode`, and `codeGeneratedAt`.

### Download Flow
`GET /api/website-ai/projects/:id/download` streams a real ZIP built with
`archiver` (a pure-JS zip-writing library — no shell-out, no
`child_process`, keeping that "zero matches" audit result intact) directly
from `generatedFiles`. This packages files for the Owner; it is not
deployment.

### Publish Flow — the two-step confirmation is structurally enforced
Exactly as specified:
```
"Your website is complete. What would you like to do?
 1. Download ZIP  2. View Preview  3. Publish Website"
```
Choosing Publish calls `POST .../request-publish` (sets
`publishRequested: true`, returns the confirmation question), which the
UI must then follow with `POST .../confirm-publish`. **The route checks
`req.body.confirm !== true` explicitly** — nothing happens on any value
other than the literal boolean `true`, and if the Owner says NO,
`publishRequested` resets and the function returns without creating
anything. Only on YES does it call `createDeploymentAutomationJob()` —
the exact same helper `send-to-automation` (Phase 10) already used,
extracted so both callers share one implementation instead of two copies.
**This still only creates an `AutomationJob` row** — no Git call, no
hosting API call, no domain registration, nothing executed.

### Deployment providers — reuse the Integration Layer, don't reinvent it
`DEPLOYMENT_PROVIDERS` in `websiteAIConstants.js` uses the **same keys**
as the existing Phase 9 connectors (`github`, `vercel`, `netlify`,
`cloudflare`, `hostinger`, `domains`) — "Custom Domain" maps to the
existing `domains` connector rather than inventing a new one.
`routes/integrationLayer.js` was not touched.

### Package Architecture — Free / Pro / Premium, labels only, no billing
`PLAN_TIERS` in `websiteAIConstants.js` maps each action to a tier
(Planning/Preview/Download → Free, Code Generation → Pro, Publish/Domain/
SSL/One-Click → Premium) and the UI shows these as badges next to each
button. **No enforcement exists** — clicking a "Premium" action still
works, because there is no billing system to actually gate it, and the
brief says "do not implement billing, only prepare architecture." The
labeling *is* the architecture: it's what a future billing system would
read to decide what to charge for.

### Endpoints added this phase
| Method | Path | Free/Paid |
|---|---|---|
| POST | /api/website-ai/projects/:id/generate-code | Both — `mode` selects which |
| GET | /api/website-ai/projects/:id/preview | Free |
| GET | /api/website-ai/projects/:id/download | Free |
| POST | /api/website-ai/projects/:id/request-publish | Free (asks; does nothing else) |
| POST | /api/website-ai/projects/:id/confirm-publish | Free (creates a framework-only job, not a real deployment) |
| GET | /api/website-ai/plan-tiers | Free |

### Confirmed
- **Publish never happens automatically** — enforced by the explicit
  `confirm !== true` check in `confirm-publish`, not just documented.
- **Owner confirmation is mandatory** — the two-step
  request-publish/confirm-publish sequence is the only path to creating a
  deployment `AutomationJob`; there is no other code path that does.
- **AI cost minimized wherever possible** — Free mode exists and requires
  zero API calls; Paid mode reuses the existing plan instead of
  re-deriving it; real token usage is tracked and shown, not estimated.

## Website AI V2 (Phase 11) — Execution Manager for the Website Department

Website AI is no longer only a planner — it now breaks a plan into 10 real
phases, assigns them to the **existing** Website Department employees, and
tracks progress. It still never writes production code and never deploys.
The critical constraint this phase adds — "never bypasses the Workflow
Engine" — is enforced structurally: every phase is a real `WorkflowStage`
row, created with the exact same Prisma shape `routes/workflows.js`'s own
`POST /:id/stages` handler uses, and every dependency between phases is a
real `WorkflowDependency` row the Workflow Engine already enforces (a phase
can't move to "Working" until the one before it is "Completed" — checked
in `routes/workflows.js`, which this phase did not touch).

### Website Execution Flow
```
Owner → CEO → Website Director → Website AI → Website Employees →
Workflow Engine → Automation Engine
```

### The 10 phases, mapped to the EXISTING 8 Website Department employees
`backend/src/websiteAIConstants.js` — `WEBSITE_PHASES`. Website AI doesn't
invent new employees; it assigns to the same 8 named ones Phase 6 already
created (UI Designer, UX, Frontend Developer, Backend Developer, Database
Engineer, QA Tester, Deployment, Documentation), several of them across
multiple phases:

| Phase | Employee |
|---|---|
| Requirement Analysis | Documentation Employee |
| Planning | UX Employee |
| Wireframe Planning | UX Employee |
| UI Planning | UI Designer Employee |
| Component Planning | Frontend Developer Employee |
| Page Planning | Frontend Developer Employee |
| Asset Planning | UI Designer Employee |
| Responsive Planning | Frontend Developer Employee |
| Quality Review | QA Tester Employee |
| Deployment Preparation | Deployment Employee |

### How "never bypasses the Workflow Engine" is enforced, not just claimed
`POST /api/website-ai/projects/:id/start-execution`:
1. Ensures a real `Workflow` exists (creates one, `departmentKey: "website"`,
   using the same shape `routes/workflows.js` uses — if the plan wasn't
   already linked to one).
2. Creates 10 `WorkflowStage` rows, one per phase, each assigned to the
   employee above — plus a `WorkflowAssignment` row and a
   `WorkflowHistory` entry for each, using the Workflow Engine's own
   **existing, unmodified** `logHistory()`/`notify()` helpers from
   `lib/workflowHelpers.js` (imported, not duplicated).
3. Chains them with real `WorkflowDependency` rows — phase *N* depends on
   phase *N-1*.
4. Records which phase maps to which stage in a new model,
   **`WebsitePhase`** — this is Website AI's own model (extending Website
   AI, not the Workflow Engine), needed only because `WorkflowStage`
   itself (protected) has no "phase name" field.

### Progress Tracking — computed live, nothing stored as a fake number
`GET /api/website-ai/projects/:id/progress` reads the real
`WorkflowStage`/`WorkflowDependency` state behind each phase: overall
progress (% of phases `Completed`), completed/pending/blocked counts, the
current phase, remaining work, and per-employee assignment detail (Current
Objective, Current Deliverable, Current Phase, Priority, Deadline,
Dependencies, Progress — the last derived from a simple status→percentage
table in `websiteAIConstants.js`, not a stored field, since adding one to
`WorkflowStage` would have meant modifying a protected model).

### Quality Checklist — the exact 7 items, framework only
Brand Colors Verified, Typography Verified, Responsive Verified,
Accessibility Checked, Performance Checklist Ready, SEO Checklist Ready,
Deployment Checklist Ready — stored as JSON on `WebsiteProject` (Website
AI's own model), toggled via `PATCH /api/website-ai/projects/:id/quality-checklist`.
Checking an item never verifies anything for real.

### Website Report — real data, deliberately no LLM call
`GET /api/website-ai/projects/:id/report` assembles Project Summary,
Completed/Pending/Blocked Work, Assigned Employees, the Quality Checklist,
and Deployment Readiness — **entirely from real database state**, with a
templated (not AI-generated) summary sentence. A report about what's
actually done should be exactly as reliable as the database, not
dependent on a model call succeeding — an intentional choice to not use
the LLM here, unlike plan generation in Phase 10.

### Dashboards
- **Owner** (`GET /api/website-ai/dashboard`, extended from Phase 10):
  now also returns the current project's live progress, current phase,
  assigned employees, completed/pending counts, and quality status.
- **CEO** (`GET /api/website-ai/dashboard/ceo`, new): Website Department
  status, project health (a plain rule — healthy if nothing's blocked),
  team workload (active task count per employee across all projects), and
  overall completion percentage.

### Endpoints added this phase
| Method | Path | Description |
|---|---|---|
| POST | /api/website-ai/projects/:id/start-execution | Breaks the plan into 10 real Workflow Engine stages, assigned to existing employees |
| GET | /api/website-ai/projects/:id/progress | Real, computed progress + employee assignment detail |
| PATCH | /api/website-ai/projects/:id/quality-checklist | Toggle one of the 7 checklist items |
| GET | /api/website-ai/projects/:id/report | The structured Website Report |
| GET | /api/website-ai/dashboard/ceo | CEO-facing Website Department dashboard |

### Confirmed: management and orchestration only
- **No production code generated** — this phase adds zero new code-emitting
  paths; the Phase 10 `looksLikeCode()` guard still protects plan
  generation, and nothing added here generates HTML/CSS/JS/React/Next.js/
  Tailwind.
- **No deployment executed** — "Deployment Preparation" is a `WorkflowStage`
  like any other; completing it only changes a status label.
- **Website AI now manages execution only** — it creates and assigns real
  Workflow Engine work, it doesn't do the work itself.
- All 10 protected systems (Company Brain, Operating Manual, CEO Brain,
  Director Brains, Employees, Workflow Engine, Automation Engine, Memory
  Engine, Integration Layer, Authentication) verified untouched by
  grepping every one of their route files for this phase's new code —
  zero matches.

## Website AI V1 (Phase 10) — the first real AI Employee, planning only

Website AI is the first system in this project that genuinely reasons —
it's an AI Employee, not just a framework, and the brief doesn't forbid AI
reasoning here the way it explicitly did for the Memory Engine. What it
forbids instead is real **code** and real **deployment**: no HTML, React,
Tailwind, or Next.js is ever generated, and nothing is ever committed or
deployed. Everything it produces is a structured planning document.

### Architecture
```
Owner → CEO → Website Director → Workflow Engine → Website Employees →
Memory Engine → Automation Engine → Integration Layer → Website Output
```

### It reads 5 systems, read-only, using each one's OWN existing code
- **Company Brain** — `prisma.companyBrain.findUnique()`, same query CEO
  Brain and Director Brains already use.
- **Operating Manual** — up to 6 non-empty `BrainSection` rows.
- **Business Foundation** — client profile, via the Memory Engine's own
  snapshot (see below), not a separate lookup.
- **Workflow Engine** — the linked `WorkflowStage`/`Workflow`, if any.
- **Memory Engine** — calls `memoryManager.loadMemory()` **directly, the
  same exported function `routes/memoryEngine.js` itself calls** — Website
  AI does not reimplement memory loading, it reuses the one centralized
  Memory Manager exactly as designed. This is also how "Website AI uses
  Memory Engine only, never stores permanent memory, always reloads
  Company Brain" is literally true: every generation call re-runs both
  queries fresh, nothing is cached across requests.

None of the 5 systems above had a single line changed to support this —
verified by grepping all of them (plus every other protected file) for
Website AI references after building it.

### The 8 modules — one generation call, not eight
Requirements Analyzer, Page Planner, Section Planner, Component Planner,
Design Planner, Responsive Planner, Asset Manager, Deployment Planner.
Rather than 8 separate LLM calls (slower, harder to keep consistent with
each other, and 8x the surface area for something to slip past the
no-code rule), one grounded call returns a single JSON object with all 8
sections. `backend/src/routes/websiteAI.js`'s `buildSystemPrompt()`
explicitly instructs the model to output only that JSON — no markdown, no
code fences, no HTML/JSX/Tailwind/Next.js syntax anywhere in any value.

### The no-code-generation guard — a real check, honestly scoped
After generation, `looksLikeCode()` scans every field against a pattern
list (HTML tags, code fences, `import React`, `export default function`,
`@tailwind`, `useState(`, `className=`, common tag names). If anything
matches, the **entire generation is rejected** with a 422 and nothing is
saved — the person has to try again. This is a best-effort safety net, not
a formal guarantee that no LLM could ever phrase something in a
code-adjacent way; it's documented as exactly that, not oversold.

### Website Types — all 12, exactly as specified
Landing Page, Business Website, Portfolio, Agency Website, E-Commerce,
Restaurant, Dental, Real Estate, Construction, Education, Healthcare,
Corporate — `backend/src/websiteAIConstants.js`.

### Website Dashboard — the exact 5-state lifecycle specified
`Planning → Design Ready → Components Ready → Assets Ready → Deployment
Ready`. A manual label the Owner advances; nothing automatic happens at
any transition.

### Sending finished work to the Automation Engine
`POST /api/website-ai/projects/:id/send-to-automation` creates a real
`AutomationJob` row (`module: "website"`) — **the exact same shape**
`routes/automationEngine.js`'s own `POST /api/automation-jobs` creates.
This is Website AI acting as a normal consumer of the Automation Engine's
existing data model (which Phase 7 designed specifically to receive
"completed employee work" from exactly this kind of source) — not a
modification of `routes/automationEngine.js`, which was not touched.
Deployment itself remains framework-only, per Phase 7 and per this phase's
own rules.

### Endpoints
| Method | Path | Description |
|---|---|---|
| GET/POST | /api/website-ai/projects | List / generate a new plan (reads 5 systems, calls the LLM, saves if code-guard passes) |
| GET/PATCH | /api/website-ai/projects/:id | Detail / advance the dashboard status label |
| POST | /api/website-ai/projects/:id/send-to-automation | Creates a real `AutomationJob`, linked back to this plan |
| GET | /api/website-ai/dashboard | Current plan + counts by status |

### Confirmed: framework only
- **No website code generated** — enforced by explicit prompt instruction
  *and* a defensive post-generation scan that rejects anything code-shaped
  before it's ever saved.
- **No deployment executed** — `send-to-automation` only creates a
  database row describing intent; it does not call Git, a hosting
  provider, a domain registrar, or anything else. Grepped the entire
  backend for `child_process`, `exec(`, `octokit`, CLI tool names (Vercel,
  Netlify), and build commands — zero matches.
- **Framework only** — verified, not assumed, same as every phase before it.

## Integration Layer V1 (Phase 9) — connector registry, framework only

A centralized registry of 46 external-service connector **placeholders**
across 7 categories. No AI Employee, Director, or Automation job talks to
an external service directly — the architectural intent is that anything
that would eventually need one goes through here. Today, nothing here
actually does: no HTTP call to a real provider exists anywhere in this
phase's code.

### Architecture
```
Owner → CEO → Director → Employees → Automation Engine → Integration Layer → External Services
```
This phase does not wire the Automation Engine to the Integration Layer
with any code — no field on `AutomationJob` references a `Connector`, and
`routes/automationEngine.js` was not touched. The architecture is
documented, not implemented, since implementing it would mean real
connections, which are explicitly forbidden.

### All 46 connectors, exactly as specified
`backend/src/integrationConnectors.js` — 7 categories (Website: 13,
Marketing: 8, Sales: 6, SEO: 5, Finance: 5, Support: 4, Automation: 5).
Every entry has a `key`, a `name`, a `category`, and an `authKind` — a
**descriptive label** of what kind of auth it would eventually need
("OAuth 2.0", "API Token", etc.), never an actual credential field.

### Every connector has exactly the 7 things specified
Connection Status (`Connected`/`Disconnected`/`Coming Soon` — a label),
Provider (`name`), Version (a static placeholder string,
`v0.1.0-framework`), Configuration (a JSON placeholder — descriptive, not
functional), Authentication Placeholder (`authKind`), Health
(`Healthy`/`Unavailable`/`Unknown` — a label, no real health check is ever
performed), and Logs (`ConnectorLog`, one entry per status/health/config
change).

### No real connections — enforced by omission, not just by rule
There is no input field anywhere in the UI or API that accepts an API key,
OAuth token, or any other credential. `PATCH /api/connectors/:id` only
accepts `status`, `health`, and free-text `configuration` notes — there is
no field to even attempt storing a secret in, so "no credentials stored"
isn't a policy being followed, it's a capability that doesn't exist.

### Dashboards — new endpoints, no existing dashboard touched
- **Owner**: `GET /api/connectors/dashboard/owner` — counts by status
  (Connected/Disconnected/Coming Soon) and by health.
- **CEO**: `GET /api/connectors/dashboard/ceo` — integration health (a
  plain rule: healthy if nothing is marked Unavailable), available vs.
  unavailable services.

### Endpoints
| Method | Path | Description |
|---|---|---|
| GET | /api/connectors?category=... | List the registry, optionally filtered |
| GET/PATCH | /api/connectors/:id | Detail + logs / update status, health, or configuration notes |
| GET | /api/connectors/dashboard/{owner,ceo} | The two dashboards above |

### Confirmed: framework only
- **No real API connected** — grepped the entire backend for OAuth flows,
  `client_secret`, hardcoded API keys, and access-token handling related
  to any of the 46 connectors; the only matches were descriptive
  `authKind` label strings (e.g. `"OAuth 2.0"` as plain text) and the
  pre-existing, already-approved Anthropic key from Phase 4's CEO Chat,
  which predates and is unrelated to this phase.
- **No credentials stored** — no field in `Connector` or `ConnectorLog`
  is capable of holding one; `configuration` is free-text placeholder
  notes, not a secrets store.
- **Framework only** — verified, not assumed.

## Memory Engine V1 (Phase 8) — temporary working memory, framework only

Every AI Employee gets temporary working memory that exists **only** while
they're actively assigned to one `WorkflowStage`. It is not permanent —
permanent knowledge always stays in Company Brain, the Operating Manual,
Business Foundation, and the Workflow Engine, none of which were modified
or written to by this system.

### Architecture
```
Owner → CEO → Director → Workflow → Employee → Memory Engine → Work → Memory Deleted
```

### The centralized Memory Manager
`backend/src/memoryManager.js` is the one place that loads, updates,
expires, and deletes memory — every route in `routes/memoryEngine.js` is a
thin HTTP wrapper around it, per the brief's "one centralized Memory
Manager" requirement. Its five responsibilities map directly to the brief:
`loadMemory()`, `updateWorkingMemory()`, `checkAndAutoExpire()` /
`expireMemory()`, `deleteMemory()`, and `cleanupCompleted()` (bulk expire +
delete).

### The 5 memory types, on one `EmployeeMemory` row
1. **Task Memory** — current task, objective, director, priority, deadline.
   A snapshot taken at load time.
2. **Context Memory** — a small Company Brain subset, up to 5 non-empty
   Operating Manual sections, and a client profile if the linked workflow
   has one. All **read-only snapshots** — there is no route anywhere that
   lets this data flow back into Company Brain, the Operating Manual, or
   Business Foundation.
3. **Conversation Memory** — the last 5 `WorkflowHistory` entries + 5
   `WorkflowActivity` notes for the linked workflow, snapshotted (and
   refreshable via `POST /:id/refresh-conversation`).
4. **Working Memory** — free-form notes and file references. **The only
   part an employee (or the Owner, standing in for one) can write to** —
   enforced simply by which fields `PATCH /api/memory/:id` accepts.
5. **Resource Memory** — labeled links only (logos, brand colors, fonts,
   assets, website references) — "linked, never duplicated," per the
   brief. No file upload or asset storage exists in this framework.

### Memory Lifecycle
`Created → Loaded → Updated → Saved Temporarily → Expired`, then physical
deletion. "Deleted" isn't a status the row sits in — it's the row being
removed via `DELETE /api/memory/:id`, logged to `MemoryLog` *first* so an
audit trail survives even after the memory itself is gone (mirroring how
Workflow history outlives an individual task).

### No autonomous expiry — every transition is triggered by an explicit request
A memory auto-expires when its linked `WorkflowStage`/`Workflow` has
reached a terminal status (`Completed`/`Cancelled`/`Failed`/`Archived`) —
but this check runs **inside** `GET /api/memory` and `GET /api/memory/:id`
(an explicit request a person made by loading the page), not on a
background timer or cron job, which the brief explicitly prohibits
("no autonomous agents"). `POST /api/memory/cleanup` is the Owner-triggered
bulk action that actually deletes everything that's expired.

### Director Memory and CEO Memory — deliberately not built as storage
Per the brief, Directors "do NOT keep permanent memory — they only receive
temporary summaries," and "CEO NEVER stores company knowledge — CEO always
reloads Company Brain." Both are already true of the existing Director
Brain and CEO Brain routes (neither was touched, and neither has ever
stored anything of its own — see their respective sections above). No new
storage was added for either; there was nothing to build.

### Dashboards — new endpoints, no existing dashboard touched
- **Owner**: `GET /api/memory/dashboard/owner` — memory status, active
  memories, expired memories, current context size (in KB, computed from
  actual snapshot field lengths — a real number, not estimated).
- **CEO**: `GET /api/memory/dashboard/ceo` — current active employees,
  current memory usage, memory health (a plain rule: healthy if expired
  memory isn't outpacing active memory — not a judgment call).

### Endpoints
| Method | Path | Description |
|---|---|---|
| GET/POST | /api/memory | List (auto-expiring stale rows) / load memory for an employee+stage |
| GET/PATCH/DELETE | /api/memory/:id | Detail+logs / update Working+Resource memory only / delete |
| POST | /api/memory/:id/refresh-conversation | Re-pull recent workflow history/activity |
| POST | /api/memory/:id/expire | Manually expire |
| POST | /api/memory/cleanup | Bulk expire + delete everything whose work is done |
| GET | /api/memory/dashboard/{owner,ceo} | The two dashboards above |

### Confirmed: framework only
- **No AI reasoning added** — every field is plain structured data (JSON-
  encoded strings), populated by direct database reads. There is no model
  call, no prompt, no generation anywhere in `memoryManager.js` or
  `routes/memoryEngine.js`.
- **No permanent employee memory added** — every `EmployeeMemory` row is
  designed to be deleted (`cleanupCompleted()` / manual delete); nothing
  about an employee's memory persists past their active assignment except
  the `MemoryLog` audit trail, which records that memory existed and was
  removed, not its contents.
- **No vector database, no embeddings, no RAG, no LangChain, no LLM
  memory, no autonomous agents** — grepped the entire backend for all of
  these terms; the only match was this file's own documentation of their
  absence.

## Automation Engine V1 (Phase 7) — the execution layer, framework only

Sits downstream of the Workflow Engine. Reads `Workflow`/`WorkflowStage`
**read-only** (to link a job to real completed employee work) — neither
those models nor their routes (`routes/workflows.js`,
`routes/workflowApprovals.js`, `routes/workflowNotifications.js`) were
touched to build this. Verified after the fact by grepping every one of
them for automation-related code, not just assumed clean.

### Architecture
```
Owner → CEO → Director → Workflow Engine → Employees → Automation Engine → Result
```
The Automation Engine never decides anything — it only receives a
reference to completed work, and a person manually moves it through a
queue and records a `result` describing what was *prepared*.

### The 8 modules, exactly as specified — with one honest gap flagged
`backend/src/automationModules.js` holds the fixed taxonomy: Website,
Marketing, SEO, Sales, Finance, Support, Analytics, Deployment — each with
its exact capability list from the brief (all "Prepare X" / "Track X"
named job types, not executable functions). **Analytics Automation has no
capabilities** — the brief listed it as a module but never gave it a
capabilities section (unlike the other 7, each of which got one). Rather
than invent plausible-sounding ones ("Prepare Report", "Prepare Dashboard"),
its `capabilities` array is intentionally empty, and the frontend shows
"No capabilities were specified for this module in the brief" if selected.

### Automation Queue — 7 states, exactly as specified
`Queued → Preparing → Ready → Executing → Completed / Failed / Cancelled`.
All transitions are manual (a person clicking a status button) — nothing
here has a scheduler, webhook, or cron job. `startedAt` is set on first
entering `Executing`; `completedAt` on first entering any terminal state —
used only to compute Average Processing Time, not to trigger anything.

### Automation Logs
Every status change writes an `AutomationLog` row: timestamp, module,
linked workflow, employee, director, result-at-that-point, and status —
exactly the fields specified.

### Dashboards — new endpoints, no existing dashboard touched
- **Owner**: `GET /api/automation-jobs/dashboard/owner` — queue counts by
  status, pending, completed, failed, average processing time.
- **CEO**: `GET /api/automation-jobs/dashboard/ceo` — automation status,
  department breakdown, pending/completed jobs. This is a new tab on the
  Automation Engine page itself (not added into `CEOBrain.jsx`, which was
  explicitly off-limits) — same pattern used for the Workflow Engine's own
  CEO-facing dashboard in Phase 6.5.

### Endpoints
| Method | Path | Description |
|---|---|---|
| GET/POST | /api/automation-jobs | List (optional `?module=`) / create a job, optionally linked to a completed `WorkflowStage` |
| GET/PATCH | /api/automation-jobs/:id | Detail + logs / status or result update |
| GET | /api/automation-jobs/dashboard/{owner,ceo} | The two dashboards above |

### Confirmed: framework only
- **No external API has been connected** — no HTTP call to Meta, Instagram,
  LinkedIn, X, Google, any email provider, any hosting/domain/SSL/DNS
  provider, or any payment gateway exists anywhere in this code.
- **No real automation has been executed** — every capability is a named
  job type; moving a job to "Executing" or "Completed" only updates a
  database row and asks a person to type a `result` sentence. Nothing
  generates a website, writes code, deploys anything, or sends a message.
- Every transition is the direct result of an explicit API call triggered
  by a person in the UI — no scheduler, queue worker, or cron job anywhere.

## Phase 6.5.1 — Task system consolidation (Workflow Engine is now the ONLY one)

The Phase 6.5 changelog entry above flagged a real problem: three parallel
task systems existed (`Task` for CEO/Director escalation, `EmployeeTask`
for the employee queue, and the new `Workflow`/`WorkflowStage`), none of
which shared data. This consolidation removed the duplication entirely.

### What was removed
- The `Task` model and `routes/tasks.js` — the old CEO → Director →
  Employee escalation, 10-stage `stage` field.
- The `EmployeeTask` model and `routes/employeeTasks.js` — the old
  per-employee `Ready/Working/Waiting/Completed/Blocked` queue.
- Their relation fields on `Employee`/`Department`.
- `backend/src/constants.js`'s `STAGES`/`nextStage` (Task-specific) —
  `DEPARTMENTS` stays, still needed for seeding.
- Frontend: `lib/workflowConstants.js` (old Company-Office-specific
  `STAGES`/`STAGE_LABELS`/`robotVariantFor`) and `lib/employeeAnimation.js`
  (old `EmployeeTask`-specific animation mapping) — both deleted.

### What replaced them
- **`Workflow` / `WorkflowStage`** (from Phase 6.5) is now the single task
  system everywhere. Company Office, CEO Brain, Director Brains, and the
  Employee Office all read and write it.
- **`lib/robotAnimation.js`** (frontend) — one function,
  `robotVariantForStatus(status)`, mapping the Workflow Engine's 13-state
  lifecycle to a `FexusRobot` variant. Replaces the two prior duplicate
  mappings.
- **`lib/departments.js`** (frontend) — the department list, extracted
  since its old home (`workflowConstants.js`) was deleted.

### Every consumer that was touched, and how
- `routes/departments.js` — "active task for this department" is now "most
  recently updated non-terminal `Workflow` with this `departmentKey`."
- `routes/employees.js` (`GET /employees/ceo`) — "CEO's active task" is now
  the most recently updated non-terminal `Workflow` company-wide.
- `routes/directors.js` — `getDeptStatus()` now counts active `Workflow`
  rows instead of `Task` rows; the Project Director's data gathering reads
  `Workflow`/`WorkflowStage` instead of `Task`.
- `routes/ceo.js` (`gatherExecutiveContext()`) — pending-task count,
  department status, and robot active/idle counts now derive from
  `Workflow`/`WorkflowStage` instead of `Task`.
- `routes/employeeRoster.js` — an employee's current task, queue, and last
  activity now come from `WorkflowStage` (grouped via the same
  `LIFECYCLE_GROUPS` the Kanban board uses) instead of `EmployeeTask`.
- `pages/CompanyOffice.jsx` — fully rewritten. Robots animate from real
  `Workflow`/`WorkflowStage` status. The old custom "Advance" button (which
  duplicated status-management logic already in the Workflow Engine) was
  removed — Company Office now visualizes and creates workflows; managing
  stages/dependencies/approvals happens in one place, the Workflow Engine,
  linked directly from each active workflow card.
- `pages/owner/EmployeeDetail.jsx` — rewritten. Its old standalone
  "Add to Queue" flow (a second, parallel way to create task items) was
  removed in favor of a link to the Workflow Engine, since that's now the
  only place assignments are created. Status changes and "Submit for
  Review" still work directly from this page — that's the same underlying
  `PATCH /api/workflows/stages/:id` / `POST /api/workflow-approvals/submit/:id`
  endpoints the Workflow Engine page itself calls, just a second UI entry
  point to one API, not duplicate logic.
- `pages/owner/OwnerDashboard.jsx` — the "AI Workforce Status" widget now
  derives active/idle from `Workflow`'s stage list instead of `Task`.

### Required action before running this version
**Run `npx prisma migrate dev` again** — this migration *removes* two
tables (`Task`, `EmployeeTask`) rather than adding new ones. If you have
existing data in either table, it will be lost; nothing else is affected.

## Workflow Engine V1 (Phase 6.5) — a genuinely separate system (superseded, see above)

**Historical note:** at the time this phase was built, the brief asked for
a proper workflow engine while explicitly forbidding modification of
Company Brain, CEO Brain, Director Brains, or Employee Brains — and those
existing systems already had their own task mechanisms (`Task` for
CEO/Director escalation, `EmployeeTask` for the per-employee queue). Given
that constraint, this phase built the Workflow Engine as a genuinely
separate, parallel system rather than consolidating everything onto one
model. **That duplication no longer exists** — see "Phase 6.5.1 — Task
system consolidation" above, where `Task` and `EmployeeTask` were removed
and every consumer migrated onto `Workflow`/`WorkflowStage`. The section
below is left as-is for historical accuracy about what this phase
originally built; treat "Workflow Engine" as simply "the task system" now.

### The 8 models, exactly as named in the brief
`Workflow`, `WorkflowStage`, `WorkflowHistory`, `WorkflowActivity`,
`WorkflowAssignment`, `WorkflowDependency`, `WorkflowApproval`,
`WorkflowNotification`. None of them add fields to `Employee`, `User`,
`Department`, or any Business Foundation model — every actor/assignee
reference is a plain string (id + denormalized display label), not a
Prisma relation, so this phase adds zero fields anywhere outside its own
new tables.

### Task lifecycle — all 13 states, exactly as specified
`Draft → Created → Assigned → Accepted → Working → Waiting → Needs Review
→ Waiting Approval → Approved → Completed`, plus `Cancelled`, `Failed`,
`Archived`. Stored as validated strings (`backend/src/workflowConstants.js`
— same no-enum pattern used everywhere else in this schema). The Kanban UI
groups these into 6 columns (a 13-column board isn't how Notion/Linear/
ClickUp actually present this) but every card still shows its exact status.

### Task routing, enforced not just described
CEO (Owner) creates a `Workflow` and assigns it to one department.
Directors break it into `WorkflowStage` rows, each assigned to one
Director or Employee. **Employees cannot reach `Approved` or `Completed`
directly** — `PATCH /api/workflows/stages/:id` explicitly rejects those
two statuses; the only path there is `POST /api/workflow-approvals/submit/:stageId`
→ a Director's `approve`/`reject`. This is real server-side enforcement,
not a UI convention that could be bypassed.

### Dependencies, enforced not just recorded
`WorkflowDependency` records "X blocks Y." Attempting to set a stage to
`Working` while any blocking stage isn't `Completed` returns a `409` with
the specific blocker named — checked in code on every status-change
request, not just displayed as a warning.

### Notification engine — real, not fake
Every meaningful event creates a real `WorkflowNotification` row: a
Workflow assigned to a department, a stage assigned to an employee, an
employee submitting for review, a Director approving/rejecting, a
Workflow completing. Nothing is a static/seeded notification.

### Dashboards
- **CEO**: `GET /api/workflows/dashboard/ceo` — company-wide progress,
  department progress, completed/delayed/critical task counts.
- **Director**: `GET /api/workflows/dashboard/director/:departmentKey` —
  department queue, employee status, pending reviews, blocked work,
  completed today.
- **Employee**: `GET /api/workflows/dashboard/employee/:employeeId` —
  current/upcoming/completed/blocked tasks, queue length.

These are new endpoints under `/api/workflows/dashboard/*` — the existing
CEO Brain, Director Brain, and Employee Office dashboards were not touched
or extended; this is separate reporting for the separate Workflow Engine.

### Frontend
`pages/owner/WorkflowEngine.jsx` — a Kanban board (Notion/Linear-style,
6 grouped columns) plus CEO-level stats, with a "New Company Task" flow.
`pages/owner/WorkflowDetail.jsx` — stages (status control, submit/approve/
reject, dependency picker), a history timeline, and an activity/notes feed.
New Owner-only nav entry and routes (`/workflow-engine`,
`/workflow-engine/:id`) — no existing page, nav item, or route was altered.

One small, safe extension to a shared component: `QuickAddForm` (used by
many pages already) only supported plain-string select options; several
Workflow Engine dropdowns needed to show a name while submitting an id
(e.g. picking an employee). Added optional `{ value, label }` option
objects, fully backward compatible — every existing caller still passes
plain strings and is unaffected (verified by grep across all usages).

### Endpoints
| Method | Path | Description |
|---|---|---|
| GET/POST | /api/workflows | List / create company tasks |
| GET/PATCH | /api/workflows/:id | Detail / status-priority-date updates |
| POST | /api/workflows/:id/stages | Director breaks a workflow into a stage |
| PATCH | /api/workflows/stages/:id | Stage status/priority updates (dependency-checked) |
| POST/DELETE | /api/workflows/dependencies(/:id) | Create/remove a blocking relationship |
| POST | /api/workflows/:id/activity | Add a note to the activity feed |
| GET | /api/workflows/dashboard/{ceo,director/:key,employee/:id} | The three dashboards above |
| POST | /api/workflow-approvals/submit/:stageId | Employee submits for review |
| POST | /api/workflow-approvals/:id/approve | Director approves → stage Completed |
| POST | /api/workflow-approvals/:id/reject | Director rejects → stage back to Working |
| GET | /api/workflow-notifications | List (optional `?unread=true`, `?recipient=`) |
| PATCH | /api/workflow-notifications/:id/read | Mark one read |
| POST | /api/workflow-notifications/mark-all-read | Mark all read |

### Confirmed: no automation implemented
Every transition in this system happens because a person clicked something
in the UI, which called one of the endpoints above. There is no scheduler,
no queue worker, no webhook, no cron job, and no code path that changes a
Workflow or WorkflowStage's state without an explicit API call triggered by
the Owner. Dependency-blocking and the approval gate are deterministic
rule checks (if/then conditions on stored data), not AI decision-making.

## AI Employees — the execution framework, not execution itself (Phase 6)

56 named employees across the 9 departments, each with exactly one fixed
`responsibility` (a new field on the existing `Employee` model — additive,
not a schema rewrite). No employee has chat capability, CEO/Director
powers, or any path to the Owner — this is deliberate, per the brief's
"No Employee becomes a chatbot" / "No CEO Features" rules.

### Department → Employee counts
| Department | Employees |
|---|---|
| Marketing | 10 (Instagram, Facebook, LinkedIn, Twitter, YouTube, Content Writer, Caption Writer, Hashtag, Meta Ads, Google Ads) |
| Sales | 9 (Lead Finder, Cold Email, Instagram/LinkedIn Outreach, CRM, Proposal, Quotation, Follow-up, Closer) |
| Website | 8 (UI Designer, UX, Frontend/Backend Dev, Database Engineer, QA Tester, Deployment, Documentation) |
| SEO | 6 (On/Off Page, Technical, AEO, GEO, Reporting) |
| Finance | 5 (Invoice, Payments, Expenses, Forecast, Tax) |
| Support | 5 (Ticket, Email Support, Chat Support, Review, Renewal) |
| Project | 5 (Task Manager, Meeting, Timeline, Quality, Delivery) |
| Automation | 4 (Workflow, API, Integration, Automation) |
| Analytics | 4 (Reporting, Dashboard, KPI, Growth) |

Full list with each one's exact responsibility text lives in
`backend/src/employeeRoster.js`.

### The generic per-department employee from Phase 2 is untouched
Phase 2 seeded one generic `"{Department} Employee"` per department to
serve the CEO → Director → Employee escalation workflow in Company Office
(`Task.assignedToId`). That workflow and those rows are **completely
unmodified** — the 56 named employees here are new, additional rows for a
separate framework (the Employee Office below). Nothing about Company
Office, CEO Brain, or Director Brain data flow changed.

### Two separate task-state-machines, on purpose
- The existing `Task` model (Phase 2/CEO Brain) drives the escalation
  workflow: `submitted → ... → completed`, one active task moving between
  CEO/Director/Employee.
- The new `EmployeeTask` model (this phase) is a per-employee **queue**:
  `Ready → Working → Waiting/Blocked → Completed`. This is what "Task
  Queue" in the brief means — many items sitting in front of one employee,
  not a single item escalating up a chain. Conflating the two would have
  broken the existing Company Office workflow, so they're kept separate.

### Endpoints
| Method | Path | Description |
|---|---|---|
| GET | /api/employee-roster | All 56 employees + live queue summary (Owner only) |
| GET | /api/employee-roster/:id | One employee + full task queue |
| GET/POST/PATCH/DELETE | /api/employee-tasks | Task queue CRUD, scoped by `?employeeId=` |

### Robot animation mapping (reuses existing FexusRobot variants — no redesign)
No task → `idle` (or `thinking`/`monitor` if something's Waiting/Blocked).
A task in Working → `typing`. Walking and Reporting stay reserved for the
CEO/Director escalation workflow, since employees don't walk to anyone in
this framework — they work at their own desk or they don't.

### How Directors communicate with Employees (V1 — data flow, not AI logic)
There is no autonomous Director → Employee task assignment yet — that
would be automation/AI decision-making, explicitly out of scope. In this
phase, "communication" is the Owner manually adding an item to an
employee's queue via `POST /api/employee-tasks`, which is visible under
that employee's Director in the roster and detail views. The data model
(`Employee.departmentId` linking every employee to their Director's
department) is what a future Director Brain would use to assign tasks
directly — the framework is in place, the automation is not.

### Confirmed: no automation implemented
No employee posts to social media, sends an email, writes code, deploys
anything, generates an SEO report, or performs any real-world action.
Every "responsibility" is descriptive metadata; every task queue change is
a manual database update triggered by a person clicking a dropdown. There
is no scheduler, no webhook, no integration credential anywhere in this
phase's code.

### Confirmed: Employees are execution-only, not planning/strategy
Employees have no chat interface, cannot be asked open-ended questions,
and have no access to CEO Brain, Director chat, Company Brain edits, or
Business Rules. Their entire surface area is: view responsibility, view
queue, move a queue item between fixed states. That boundary is enforced
by what UI and endpoints exist for them, not by a permission check that
could be bypassed — there is simply no chat/edit route for an employee to
call even if someone tried.

### Required action before running this version
**Run `npx prisma migrate dev` again** — one new field (`Employee.responsibility`)
and one new table (`EmployeeTask`). Run `npm run seed` again too — it's
idempotent (upserts by a stable id derived from each employee's name), so
re-running it is safe and adds the 56 new employees without touching
anything that already existed.

## Director Brains — the Executive Leadership Team (Phase 5)

Nine department directors, each an expert in exactly one domain. Like CEO
Brain, they have **no tables of their own** — `gatherDirectorContext(key)`
in `routes/directors.js` re-reads Company Brain plus that director's own
department tables live, on every request. The actual data-scoping is
enforced in code (each director's `case` in the switch statement only
queries its own tables); the `reads` list in `src/directors.js` is
UI-facing documentation of that same boundary, not the enforcement itself.

| Director | Reads |
|---|---|
| Marketing | Company Brain, Campaigns |
| Sales | Company Brain, Clients, Leads, Invoices, Deals |
| Website | Company Brain, Projects, Sites |
| SEO | Company Brain, SEO Audits, Sites |
| Finance | Company Brain, Invoices, Expenses |
| Project | Company Brain, Projects, Meetings, Tasks |
| Support | Company Brain, Support Tickets, Clients |
| Analytics | Everything, read-only |
| Automation | Company Brain, Automations *(inferred — see below)* |

**On the Automation Director:** the source brief cut off after "Workflow
Planning" with no responsibilities list completed and no "Reads:" section
at all. Rather than block on it or invent scope, `src/directors.js` marks
this entry `inferredReads: true` and the frontend surfaces a visible amber
notice on that director's page — the inference (reads the Automation table
+ Company Brain) follows the pattern every other director uses, but is
flagged as an inference, not treated as confirmed.

### Two small Business Foundation extensions
Sales needed real lead data and Support needed real ticket data to read —
neither existed. `Lead` (name, email, source, status) and `SupportTicket`
(subject, clientId as a plain reference — not a Prisma relation, so the
existing `Client` model didn't need a back-relation field added) were
added, same precedent as `Meeting` in Phase 4. Directors only read these;
nothing writes to them except the CRUD endpoints below.

### Endpoints
| Method | Path | Description |
|---|---|---|
| GET | /api/directors | Roster of all 9 + live department status (Owner only) |
| GET | /api/directors/:key/dashboard | Real, domain-scoped data for one director (Owner only) |
| POST | /api/directors/:key/chat | Grounded chat, scoped to that director's data (Owner only, requires `ANTHROPIC_API_KEY`) |
| GET/POST/PATCH/DELETE | /api/leads | Lead CRUD |
| GET/POST/PATCH/DELETE | /api/support-tickets | Support ticket CRUD |

CEO Chat and Director Chat share the same Anthropic integration
(`src/lib/llm.js`), extracted as a new shared helper rather than modifying
`routes/ceo.js` — CEO Brain's existing file was not touched.

## CEO Brain — Executive Operating System (Phase 4)

CEO Brain is not a general chatbot and has **no tables of its own**. Every
request — dashboard load or chat message — re-reads Company Brain and the
Business Foundation tables live (`gatherExecutiveContext()` in
`routes/ceo.js`), then either returns that data directly (dashboard) or
hands it to a real language model as grounding context (chat). It never
stores permanent business information; Company Brain remains the single
source of truth.

### Executive Dashboard — `GET /api/ceo/dashboard` (Owner only)
Real numbers only: projects running/waiting/completed, active clients,
AI Workforce employee count, MRR, burn rate, pending Company Office tasks,
upcoming meetings, active campaigns, outstanding invoices, a simple
transparent Company Health heuristic (`Healthy` if MRR ≥ burn rate,
`At Risk` otherwise — a readable rule, not a model's judgment), System
Health, robot active/idle counts, and per-department status.

### CEO Chat — `POST /api/ceo/chat` (Owner only)
This is the one place in the whole system that calls a real LLM (the
Anthropic API). It requires **your own API key**:

```bash
# backend/.env
ANTHROPIC_API_KEY="sk-ant-..."     # get one at https://console.anthropic.com
ANTHROPIC_MODEL="claude-sonnet-4-6" # optional, this is the default
```

Without a key, `POST /api/ceo/chat` returns a clear 503 explaining that CEO
Brain has no AI provider connected — the Executive Dashboard still works
fully without it, since it doesn't need the LLM.

**How grounding works:** every chat request rebuilds a system prompt from
the live Company Brain business profile, every non-empty Operating Manual
section, and the same dashboard/recent-records data the Executive Dashboard
shows — then explicitly instructs the model to answer only from that
context and say so when something hasn't been recorded, rather than
inventing facts. Chat history is passed from the frontend on each request
and is **not persisted server-side** — this is a deliberate design choice
so CEO Brain truly stores nothing of its own; refreshing the page clears
the conversation.

### Meetings — a small, honest Business Foundation extension
The dashboard needed real meeting data to report on rather than a
hardcoded zero, so a minimal `Meeting` model (`title`, `withWhom`,
`scheduledAt`) was added alongside Client/Project/Invoice — CEO Brain only
reads it, same as everything else.

## Company Operating Manual — 30 permanent, versioned, searchable sections

Phase 3 continued: rather than 30 more flat text columns (which can't
support version history or search well), this is modeled properly:

- **`BrainSection`** — one row per manual section (SOPs, Sales Process,
  Brand Guidelines, FAQ, etc. — the full list of 30 lives in
  `src/brainSections.js`, grouped into Processes / Policies & Rules /
  Standards / Brand & Templates / Knowledge Base / Company Direction).
  Holds the *current* content plus lowercased mirrors (`titleLower`,
  `contentLower`) for search, since SQLite's Prisma provider doesn't
  support case-insensitive `contains`.
- **`BrainSectionVersion`** — every time a section's content changes, the
  *previous* content is archived here first, with who edited it and when.
  Nothing is ever silently overwritten.
- All 30 sections are seeded lazily (`ensureSectionsSeeded()`) on first
  request — no manual seed script needed, and adding a 31st section later
  is a one-line addition to `brainSections.js`.

### Endpoints

| Method | Path | Description |
|---|---|---|
| GET | /api/brain-sections?q=... | List all 30 (auto-seeding), optional case-insensitive search over title+content |
| GET | /api/brain-sections/:key | One section + its full version history |
| PUT | /api/brain-sections/:key | Update content (Owner only) — archives the previous content as a version first |

### Frontend

The Company Brain page now has two tabs: **Business Profile** (the
structured fields from the previous phase) and **Operating Manual** (this
new searchable, grouped, versioned editor). Same page, same module, no new
route — nothing about existing architecture or navigation changed.

## Company Brain — real and persisted (Task 4, extended in Phase 3)

`CompanyBrain` is a real Prisma model (singleton row) holding every field
requested across both passes: company name, industry, mission, vision,
goals, core values, brand voice, tone, writing style, services, products,
pricing, packages, employee/client notes, working hours, processes,
business rules, custom instructions, and a general business-info field.
`GET /api/company-brain` auto-creates the row on first read. `PUT` is
Owner-only, matching how it's presented in the UI (a Settings-adjacent page,
not a workspace module everyone edits).

**Schema change note:** Phase 3 added `coreValues`, `tone`, `writingStyle`,
and `packages` as new columns on the existing `CompanyBrain` table. Run
`npx prisma migrate dev` again after pulling this version — Prisma will
generate a new migration for these columns without touching any existing
data or other tables.

This is explicitly **not** AI logic — it's structured data entry, the same
category of feature as Owner Settings. Task 5 ("every future module should
already connect") is satisfied by `FutureModule.jsx` on the frontend: it
fetches `GET /api/company-brain` and displays what it read, proving the wire
is connected without any module making decisions from it.

## Endpoints — access summary

| Owner only | Any signed-in user | Public |
|---|---|---|
| Company Office (departments/employees/tasks), `PUT /company-brain` | `GET /company-brain`, `GET /brain` | `/auth/*`, `/health` |

## Phase 3 prep — Company Brain architecture (not implemented)

A `BrainMemory` model and a `GET /api/brain` route exist as a foundation
only. Neither makes decisions, reads Task state to act on it, or runs any AI
logic — `/api/brain` just reports how many memory rows exist (always 0 until
Phase 3 starts writing to it). This satisfies "prepare the architecture,
don't implement the AI" without pretending intelligence exists yet.

## What's intentionally NOT here yet

- Refresh tokens — sessions last 7 days via a single JWT cookie; refresh
  rotation is a hardening step for later, not required for a local
  single-tenant foundation.
- Automatic stage progression — advancing is a manual `POST .../advance`
  call for now (triggered from the Company Office UI's "Advance" button).
  Automatic, timed, or AI-driven progression is future-phase work once the
  Company Brain connects to real AI logic (not just data).
- Full department rosters — one employee per department is the foundation;
  more employee robots per department come later.
- Team invites are UI-only (added to a local list) — no real invite email
  or multi-user-per-account system is wired up yet.
- No payment provider — Billing/Packages in Owner Settings update local
  state only.
