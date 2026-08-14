// Phase 10 — Website AI, the first real AI Employee. This file is
// documentation of the 8 planning modules and 12 supported website types —
// the modules aren't separate services, they're the 8 sections of the one
// structured plan produced by routes/websiteAI.js's generatePlan(). See
// that file for why: one grounded generation call, not eight, is both more
// reliable and easier to keep honest about never emitting real code.

const MODULES = [
  'Requirements Analyzer', 'Page Planner', 'Section Planner', 'Component Planner',
  'Design Planner', 'Responsive Planner', 'Asset Manager', 'Deployment Planner'
]

const WEBSITE_TYPES = [
  'Landing Page', 'Business Website', 'Portfolio', 'Agency Website', 'E-Commerce',
  'Restaurant', 'Dental', 'Real Estate', 'Construction', 'Education', 'Healthcare', 'Corporate',
  // Phase 23 — added, not replaced. The 6 categories explicitly requested
  // that weren't already covered by an equivalent existing type.
  'SaaS Website', 'Blog', 'Personal Website', 'Event Website', 'Booking Website', 'Other'
]

// The Website Dashboard's lifecycle, exactly as specified.
const STATUSES = ['Planning', 'Design Ready', 'Components Ready', 'Assets Ready', 'Deployment Ready']

// ---------------------------------------------------------------------------
// Phase 11 — Website AI V2, the Execution Manager. Every project is
// automatically organized into these 10 phases, in order. Each phase maps
// to one of the EXISTING named Website Department employees (Phase 6's
// EMPLOYEE_ROSTER) — Website AI assigns to them, it doesn't invent new
// ones. `deliverable` is descriptive metadata only, not a stored field.
// ---------------------------------------------------------------------------
const WEBSITE_PHASES = [
  { name: 'Requirement Analysis', employeeName: 'Documentation Employee', deliverable: 'Requirements Document', description: 'Analyze and document client requirements.' },
  { name: 'Planning', employeeName: 'UX Employee', deliverable: 'Project Plan', description: 'Plan overall site structure and approach.' },
  { name: 'Wireframe Planning', employeeName: 'UX Employee', deliverable: 'Wireframe Set', description: 'Plan wireframes for each page.' },
  { name: 'UI Planning', employeeName: 'UI Designer Employee', deliverable: 'UI Design Plan', description: 'Plan the visual design system for the site.' },
  { name: 'Component Planning', employeeName: 'Frontend Developer Employee', deliverable: 'Component List', description: 'Plan reusable UI components needed.' },
  { name: 'Page Planning', employeeName: 'Frontend Developer Employee', deliverable: 'Page Structure Plan', description: 'Plan each page\'s layout and content sections.' },
  { name: 'Asset Planning', employeeName: 'UI Designer Employee', deliverable: 'Asset Plan', description: 'Plan required assets — logos, images, fonts (linked only).' },
  { name: 'Responsive Planning', employeeName: 'Frontend Developer Employee', deliverable: 'Responsive Behavior Plan', description: 'Plan responsive behavior across breakpoints.' },
  { name: 'Quality Review', employeeName: 'QA Tester Employee', deliverable: 'Quality Checklist', description: 'Review the plan against the quality checklist.' },
  { name: 'Deployment Preparation', employeeName: 'Deployment Employee', deliverable: 'Deployment Readiness Report', description: 'Prepare (not execute) deployment steps.' }
]

// The 7 quality checkpoints, exactly as specified — framework checklists
// only. Checking one of these never verifies anything for real.
const QUALITY_CHECKLIST_ITEMS = [
  'Brand Colors Verified', 'Typography Verified', 'Responsive Verified',
  'Accessibility Checked', 'Performance Checklist Ready', 'SEO Checklist Ready',
  'Deployment Checklist Ready'
]

// A simple, transparent mapping from real WorkflowStage status to a
// progress percentage — not a stored field, computed on read. Deliberately
// coarse and readable rather than a fake precise-looking number.
const STATUS_PROGRESS = {
  Draft: 0, Created: 0, Assigned: 10, Accepted: 20, Working: 50, Waiting: 50,
  'Needs Review': 75, 'Waiting Approval': 85, Approved: 95, Completed: 100,
  Cancelled: 0, Failed: 0, Archived: 0
}

// ---------------------------------------------------------------------------
// Phase 12 — Website AI V3: real code generation, a publish flow that must
// never run automatically, and the FREE/PAID split the Global Cost
// Optimization Rule requires.
// ---------------------------------------------------------------------------

// The code stacks Website AI can generate, exactly covering the brief's
// HTML/CSS/JS/React/Next.js/Tailwind list (Tailwind is offered paired with
// React/Next.js, which is how it's actually used in practice, rather than
// as a meaningless standalone option).
const CODE_STACKS = [
  'HTML, CSS & JavaScript', 'React', 'React + Tailwind CSS', 'Next.js', 'Next.js + Tailwind CSS'
]

// The one stack this system's real preview route (routes/preview.js) can
// fully render live with no build step — used as the default whenever
// code generation is triggered automatically (no Owner picking a stack),
// so an auto-generated preview always actually renders. Shared by
// lib/autoHandoff.js and routes/websiteAI.js's own auto-build trigger —
// one constant, not two copies of the same choice.
const AUTO_BUILD_CODE_STACK = 'HTML, CSS & JavaScript'

// Deployment providers — deliberately the SAME keys as the existing
// Integration Layer connectors (Phase 9), not a new parallel list. "Custom
// Domain" maps to the existing "domains" connector.
const DEPLOYMENT_PROVIDERS = [
  { key: 'github', name: 'GitHub' },
  { key: 'vercel', name: 'Vercel' },
  { key: 'netlify', name: 'Netlify' },
  { key: 'cloudflare', name: 'Cloudflare' },
  { key: 'hostinger', name: 'Hostinger' },
  { key: 'domains', name: 'Custom Domain' }
]

// Architecture-only feature tiers — no billing exists, this is purely a
// label so the UI can honestly show "this would be a paid feature" per the
// brief's "prepare architecture for future packages, do not implement
// billing." Nothing in the code actually blocks a Free-tier action.
const PLAN_TIERS = {
  planning: 'Free', preview: 'Free', download: 'Free',
  codeGeneration: 'Pro',
  publish: 'Premium', domainConnection: 'Premium', ssl: 'Premium', oneClickPublish: 'Premium'
}

module.exports = {
  MODULES, WEBSITE_TYPES, STATUSES, WEBSITE_PHASES, QUALITY_CHECKLIST_ITEMS, STATUS_PROGRESS,
  CODE_STACKS, DEPLOYMENT_PROVIDERS, PLAN_TIERS, AUTO_BUILD_CODE_STACK
}

