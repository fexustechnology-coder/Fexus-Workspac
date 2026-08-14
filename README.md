# FEXUS Workspace — AI Agency Operating System

The FEXUS Workspace is a real, working operating-system foundation for an
AI-run agency: authenticated Owner/Company User workspaces, a persisted
Company Brain, real CRUD for every business module (Clients, Projects,
Invoices, Marketing, Sales, SEO, Website Builder, Automation), and a
Company Office where robot animations reflect an actual `WorkflowStage` row moving
through the database. No AI decision-making yet, anywhere — that's Phase 3.

Frontend: React, Vite, Tailwind CSS, Framer Motion, React Router, Recharts.
Backend: Express, Prisma, SQLite.

## Running both together

```bash
# Terminal 1 — backend
cd backend
npm install
# IMPORTANT: open .env and set OWNER_EMAIL to your real email first —
# whichever account signs up with that exact address becomes Owner.
npx prisma generate
npx prisma migrate dev --name init
npm run seed
npm run dev            # http://localhost:4000

# Terminal 2 — frontend
npm install
npm run dev             # http://localhost:5174
```

Then open the frontend and **sign up** with the email you set as
`OWNER_EMAIL` — that account becomes Owner and sees the full nav (Owner
Dashboard, Analytics, Company Office, Company Brain, Settings). Any other
email that signs up becomes a Company User, restricted to the Workspace nav
(Dashboard, Projects, Clients, Invoices, Marketing, Sales, SEO, Website
Builder, Analytics, Automation).

Start by adding a Client on the **Clients** page — Projects and Invoices
both reference a real client record. As Owner, visit **Company Office**,
submit a task, then hit **Advance** to watch the CEO and the relevant
Director/Employee robot move through the real workflow stages. Visit
**Company Brain** to persist real business information and see a live
snapshot of your data. See `backend/README.md` for the full data model,
auth model, and API reference.

## What's included

**Universal shell**
- Collapsible/expandable sidebar with an Owner ↔ Workspace mode switch
  (hidden entirely for non-owners), smooth animations, and a mobile drawer.
- Glass-effect topbar with search, a real signed-out-you profile menu, and
  a working keyboard-shortcuts modal.
- A `Cmd/Ctrl + K` command palette for jumping to any page.
- A slide-in notification center driven by real data (overdue invoices,
  projects in Review) with real read/unread state.

**Authentication**
- Split-screen Login (illustration right) and Signup (illustration left).
- Real signup/login/logout: bcrypt password hashing, JWT session cookie.
- Exactly one email becomes Owner — set via `OWNER_EMAIL` in `backend/.env`.

**Owner Workspace**
- Dashboard: MRR, ARR, burn rate, team accounts, active projects, and a
  live AI Workforce status feed — every number computed from real data.
- Analytics: live distribution charts (invoices by status, projects by
  status, deals by stage, clients active vs. churned).
- Company Brain: a real, persisted, fully editable business-context record,
  plus a live snapshot of real client/project/invoice/MRR counts.
- Settings: Company, Workspace, Appearance, Security, Notifications, Users
  (real invite flow), Billing (real plan switch), Packages, and API Keys
  (real key generation) — all functional, with clear notes on what's
  session-only vs. persisted.

**Workspace (Company User + Owner)**
- Clients, Projects, Invoices, Marketing, Sales, SEO, Website Builder, and
  Automation — every one backed by a real Prisma model with full CRUD
  (create, read, update via inline status changes, delete).

**Company Office**
- A live, backend-driven Robot Office: CEO desk (black + gold), 9 Director
  desks, 9 Employee desks, real task submission, and a 10-stage workflow
  machine (`submitted → ... → completed`) where every robot animation
  reflects the real `stage` of its assigned task.

**Future-phase modules**
- CEO AI, Finance, and Customer Success each get a polished "Coming in
  Future Phase" page that genuinely fetches and displays real Company
  Brain context — not blank, not broken, just staged for Phase 3.

## Getting started (frontend only)

```bash
npm install
npm run dev
```

Open the local URL Vite prints (typically `http://localhost:5174`). Most
pages require the backend running too — see "Running both together" above.

## Build for production

```bash
npm run build
npm run preview
```

## Project structure

```
backend/
  prisma/
    schema.prisma          User, CompanyBrain, Department, Employee,
                              Client, Project, Invoice, Campaign, Deal,
                              SeoAudit, Site, Automation, Expense, Meeting,
                              Lead, SupportTicket, BrainMemory, Workflow,
                              WorkflowStage (+ 6 more Workflow Engine
                              models — see backend/README.md) (SQLite, no enums)
    seed.js                  Seeds 1 CEO, 9 Directors, 9 Employees, 9 Departments
  src/
    server.js               Express app entry, route mounting + protection
    constants.js              STAGES workflow state machine + DEPARTMENTS
    prismaClient.js            Prisma client singleton
    middleware/
      auth.js                  requireAuth, requireOwner, session cookie helpers
    lib/
      crudFactory.js             Generic CRUD router builder for flat resources
    routes/
      auth.js                  signup, login, logout, me
      companyBrain.js            GET (any user) / PUT (Owner only)
      departments.js, employees.js, tasks.js   Owner-only Company Office API
      clients.js, projects.js, invoices.js       Custom CRUD (relations)
      campaigns.js, deals.js, seoAudits.js,
        sites.js, automations.js, expenses.js     Generic CRUD via crudFactory
      metrics.js                  Real, live-computed dashboard numbers
      brain.js                   Phase 3 architecture stub (unrelated to CompanyBrain)

src/
  components/
    auth/
      AuthIllustration.jsx     Shared split-screen illustration panel
      ProtectedRoute.jsx        Redirects to /login if signed out
      OwnerRoute.jsx             Redirects non-owners to /dashboard
      RoleHome.jsx               Sends "/" to the right dashboard by role
    layout/
      AppLayout.jsx          Shell: sidebar + topbar + command bar + drawer + outlet
      Sidebar.jsx             Universal sidebar — owner/workspace mode is
                                 forced and hidden for non-owners
      Topbar.jsx               Universal topbar — real sign-out, shortcuts modal
      CommandBar.jsx            Cmd/Ctrl+K command palette
      NotificationDrawer.jsx     Notification center with real read/unread state
    ui/
      FexusRobot.jsx          Reusable animated FEXUS AI Employee illustration.
                                 7 state-driven variants: idle, walk, typing,
                                 monitor (reading), thinking, reporting,
                                 completed. accent="gold" for the CEO.
      DeskScene.jsx             Robot + desk + monitor scene (CEO/Director/Employee)
      StatCard.jsx             Metric card (MRR, ARR, burn rate, etc.)
      ChartCard.jsx            Recharts wrapper (area/line/bar)
      DataTable.jsx             Reusable table
      Badge.jsx                 Status pill
      PageHeader.jsx            Page title + description + actions
      FutureModule.jsx          "Coming in Future Phase" template — fetches
                                   and displays real Company Brain context
      Modal.jsx                  Generic dialog wrapper
      QuickAddForm.jsx            Configurable form used inside Modal for
                                     "add" flows across every module
      Reveal.jsx                 Entry animation wrapper
  lib/
    nav.js                  Sidebar + command palette navigation config
    robotAnimation.js        Maps Workflow Engine status → robot variant
    departments.js             Shared department list
    api.js                     Fetch client for the backend (credentials: 'include'),
                                  including a `crud(resource)` helper factory
    AuthContext.jsx             Current user, login/signup/logout, isOwner
    WorkspaceContext.jsx        Shared UI state (sidebar, command bar, mode,
                                   real notifications derived from real data)
  pages/
    auth/
      Login.jsx                Split-screen, illustration right
      Signup.jsx                 Split-screen, illustration left
    owner/                  OwnerDashboard, OwnerAnalytics, OwnerSettings
                                (all real: metrics, live workforce status,
                                 functional invite/key/plan flows)
    user/                     UserDashboard, Projects, Clients, Invoices,
                                Marketing, Sales, SEO, WebsiteBuilder,
                                Analytics, Automation — every page does
                                real CRUD against the backend
    future/                    CompanyBrain (real + persisted, with a live
                                  business snapshot), CEOAI, Finance,
                                  CustomerSuccess (staged, reading real
                                  Company Brain context)
    CompanyOffice.jsx           Live, backend-driven Robot Office
    NotFound.jsx                404 page
  App.jsx                  Route tree: public auth routes, ProtectedRoute,
                              nested OwnerRoute for Owner-only pages
  main.jsx                  Entry point (BrowserRouter)
```

## Scope note — what's real vs. what's still ahead

**Real and backend-driven, no demo data anywhere:**
- Authentication — signup/login/logout with bcrypt + JWT session cookie;
  exactly one email (`OWNER_EMAIL`) becomes Owner, enforced server-side.
- Every business module (Clients, Projects, Invoices, Marketing, Sales,
  SEO, Website Builder, Automation) — real Prisma models, real CRUD, real
  relations (Projects/Invoices reference actual Client records).
- Every dashboard number (MRR, ARR, burn rate, project/invoice/deal
  breakdowns) — computed live from those tables via `GET /api/metrics`,
  not stored fake history.
- Company Brain — a real, persisted, fully editable record of business
  context, now with a live snapshot of real business counts.
- The Company Office — CEO office, 9 Director offices, 9 Employee desks,
  task submission, and the `submitted → ... → completed` workflow stage
  machine, all read from SQLite via polling, not timed or faked.
- Notifications — derived from real overdue invoices and projects in
  Review, not an invented feed.

**Phase 3 architecture prepared, not implemented:** a `BrainMemory` table
and a `GET /api/brain` stub route exist so a future AI Brain has somewhere
to land — nothing reads from or writes to them yet, no AI decisions run.
`FutureModule` pages (CEO AI, Finance, Customer Success) genuinely fetch
`GET /api/company-brain` and display what they read.

**Still foundation-level, by design:**
- Advancing a Company Office task is a manual button, not automatic or
  AI-driven — that arrives once the Company Brain makes real decisions.
- No payment provider, no real invite emails — both are clearly labeled as
  local-only in the Owner Settings UI itself.
- No refresh-token rotation — a single 7-day JWT session cookie is enough
  for a local single-tenant foundation; hardening is a later step.

See `CHANGELOG.md` for the full version-by-version history.
