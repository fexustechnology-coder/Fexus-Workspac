const prisma = require('./prismaClient')
const { signToken } = require('./middleware/auth')
const { generateTextWithUsage, extractJson } = require('./lib/llmProvider')
const { relayCommand } = require('./routes/localAgent')
const { log: campaignLog } = require('./campaignEngine')

// =============================================================================
// FEXUS TASK ENGINE
// =============================================================================
// The real, persistent orchestration layer for multi-step goals. Sits
// ABOVE the existing single-shot Voice Agent dispatch (voiceAgent.js) —
// simple one-action commands are unaffected and still use the fast
// existing path. This engine exists for commands that decompose into a
// real, saved, multi-step plan.
//
// Every action type dispatches to an EXISTING real system — the
// Workflow Engine, the Local PC Agent relay, or Growth AI's real Google
// Places integration. Nothing here is a second, parallel implementation
// of any of those systems.
//
// HONESTY BOUNDARY, stated here because it shapes what the planner is
// allowed to produce: this backend has no headless browser and no
// vision/OCR capability. It can open a URL for real, but it cannot read,
// scroll, or extract content from a page. The planner is instructed to
// use a "manual_step" — an honest, visible instruction for the Owner —
// wherever a goal would require actually reading web content, rather
// than ever pretending that happened.
// =============================================================================

const ACTION_TYPES = [
  'pc_open_folder', 'pc_open_file', 'pc_open_application', 'pc_open_url',
  'pc_search_files', 'pc_show_files', 'pc_search_in_application', 'pc_new_tab',
  'pc_write_file', 'pc_create_folder',
  'computer_observe', 'computer_click', 'computer_type',
  'assign_to_employee', 'maps_lead_research',
  'create_email_campaign', 'configure_email_campaign', 'import_campaign_leads', 'configure_campaign_senders', 'start_email_campaign',
  'create_website_project', 'generate_website_code', 'export_website_files', 'request_website_publish', 'confirm_website_publish',
  'wait_for_approval', 'manual_step'
]

// Real confidence gate (spec section 55/31) — an element must be
// genuinely, clearly identified before a click ever happens. Below
// this, the real behavior is "observe again" or report uncertainty —
// never a best-guess click.
const CLICK_CONFIDENCE_THRESHOLD = 0.7

const IRREVERSIBLE_ACTION_TYPES = new Set(['pc_shutdown', 'pc_restart'])

async function planTask(userId, goal) {
  const vision = require('./lib/visionProvider')
  const visionAvailable = vision.isConfigured()

  // Real task memory (spec section 36) — a small, honest mechanism, not
  // full general pronoun resolution: if the goal references something
  // like "that", "it", or "my previous task", the planner is given the
  // real, most recent completed task's goal and result as grounding
  // context — genuine context injection Groq can actually reason over,
  // not a claim of deep conversational memory that isn't real.
  let priorTaskContext = ''
  if (/\b(that|it|the previous|my last|last task|previous task)\b/i.test(goal)) {
    const lastTask = await prisma.agentTask.findFirst({
      where: { userId, status: 'COMPLETED' }, orderBy: { completedAt: 'desc' }
    })
    if (lastTask) {
      priorTaskContext = `\n\nCONTEXT — the Owner's most recently completed task, which this new goal likely refers to:\nGoal: ${lastTask.goal}\nResult: ${lastTask.result || '(no summary recorded)'}`
    }
  }

  const system = `You are FEXUS's real task planner. Decompose the Owner's goal into a genuine, executable step-by-step plan using ONLY these action types: ${ACTION_TYPES.join(', ')}.

HONESTY RULES — these are hard constraints, not suggestions:
- This system has NO web browser automation and NO ability to read a webpage's content beyond opening a URL, UNLESS real screen observation is available (see below). It can always open a URL for real (pc_open_url).
- ${visionAvailable
    ? `Real screen observation IS available right now (computer_observe, computer_click, computer_type) — a genuine screenshot is analyzed by a real vision model before any click, and a click only happens if the target is identified with real confidence above 0.7. computer_click accepts an optional verifyChange (a plain description of what should be true afterward, e.g. "the message input field is now empty" or "a new chat window titled Ali is open") — when set, it re-observes the real screen after clicking and fails honestly if the expected change didn't happen, rather than assuming success.

For multi-turn app interactions (WhatsApp, Gmail-in-browser, a web form), build a REAL sequence of these primitives — never a single step pretending to do the whole thing at once:
1. pc_open_application (or pc_open_url) to open the app/page.
2. computer_observe to see what's actually on screen before acting.
3. computer_click with a specific target (e.g. "the search box", "the conversation with Ali", "the message input field") and a verifyChange describing what should be true after.
4. computer_type for any text entry, right after confirming (via the previous click's verification) that the correct field is focused.
5. computer_click again for a final action like "Send", with verifyChange checking the real expected outcome (e.g. "the typed message now appears in the chat, and the input field is empty").

This is real, confidence-gated, verified interaction — not guaranteed to succeed on every attempt (vision-based UI understanding has real limits, especially on unfamiliar or cluttered screens), which is exactly why each step is independently verified rather than assumed. If confidence is repeatedly low for a specific element across the plan, prefer a manual_step over forcing more attempts.`
    : 'Real screen observation is NOT currently configured (no VISION_MODEL set) — computer_observe/computer_click/computer_type MUST NOT be used in this plan. Use a "manual_step" for anything requiring reading a page or clicking within it, instead of inventing a step that pretends to see the screen.'}
- ${visionAvailable ? 'A single page\'s visible content CAN genuinely be read via computer_observe (its real "visibleText" field) — this is real, usable for a focused question about what\'s currently on screen. But comparing or synthesizing across MULTIPLE pages/sources is still a "manual_step": each observation is independently confidence-gated and doesn\'t carry memory of earlier pages\' content, so chaining many observations into a reliable multi-source comparison is not something to claim as done.' : 'If the goal requires reading web content, comparing multiple sources, or summarizing search results, use a "manual_step" describing exactly what the Owner needs to do themselves — never invent a step that pretends to read or extract page content.'}
- WhatsApp, Facebook, Instagram, and LinkedIn are all real, allowed applications (opens the real web version via pc_open_application with applicationName "whatsapp"/"facebook"/"instagram"/"linkedin") — reading/replying/messaging on any of them requires the real computer_observe/computer_click/computer_type sequence above, since there is no API for this. When the Owner's command includes both a recipient AND message content (e.g. "WhatsApp kholo aur Ali ko bolo main kal call karunga"), build the COMPLETE real chain all the way through a verified send — never stop after just opening the app or just typing the message. The real sequence: pc_open_application("whatsapp") → computer_observe → computer_click(the specific chat/contact, verifyChange:"the correct conversation is open") → computer_click(the message input field, verifyChange:"the message box is focused/empty") → computer_type(the exact real message text the Owner said) → computer_click("the Send button", verifyChange:"the typed message now appears in the chat and the input field is empty") — that last, verified click IS the real send; a plan that stops before it has not actually delivered the message, only typed it. If the Owner is not logged in, observation will honestly reveal a login/QR screen instead of the expected page, and the plan should report that in real Urdu rather than continue as if logged in. Never attempt to bypass a login, CAPTCHA, or 2FA screen — report it honestly and stop that part of the plan (a manual_step) instead.
- For finding real local businesses (e.g. "dental clinics in Lahore"), use "maps_lead_research" with a real query (actionParams: query, and optional limit — set this to the real number the Owner asked for, e.g. 100, so the real pagination logic knows when to stop). This uses a genuine Google Places API integration with real pagination, never invented business data — it returns real name/address/rating/category always, and real phone/website too (from the search itself on the New API, or a real per-business Details call on legacy) unless includeDetails:false is set. This integration pages through up to 5 real pages (~100 results) before honestly stopping — if fewer genuinely exist, or Google's own pagination runs out first, report the real actual count achieved, never pad it to match what was asked for. Never claim more than what maps_lead_research's own real result count reports.
- Never use browser/vision steps (pc_open_url to maps.google.com, computer_observe/click on a Maps page) for business/location research — maps_lead_research (the real Places API) is the ONLY correct way to research businesses or locations. Browser+vision is for everything else (normal Google search, reading articles, social apps) — never as a Maps fallback, even if Places API isn't configured; in that case use a manual_step and say so honestly instead.
- For handing work to Hira (email campaigns) or Shanza (websites), use "assign_to_employee" with employeeName ("Hira" or "Shanza" only — never "Amina", she coordinates but is not a workflow assignee) and taskDescription in actionParams. If the goal describes handing over a file that was JUST CREATED earlier in this same task (e.g. "save the research to a file, then give it to Hira"), set useLastWrittenFile:true — this resolves the real, verified path from an earlier pc_write_file step, never a guessed one. If the goal instead refers to an EXISTING file the Owner mentions but doesn't give an exact path for (e.g. "the CSV file that's on Desktop," "give Hira that file"), you do NOT know its real filename in advance — first add a real "pc_search_files" step (actionParams: query — a real search term like "csv" or "leads", directoryName:"desktop") to actually locate it, THEN set useLastFoundFile:true on assign_to_employee (and on import_campaign_leads below) to resolve the real path that search found — never invent a filename like "leads.csv" and hope it matches. When the Owner is watching the screen for a file-related task like this, consider a real "pc_open_folder" step (directoryName:"desktop") early in the plan too — this genuinely opens a visible Explorer window showing the real folder/file, giving the Owner real visual confirmation, not just a background API search they can't see.
- To actually run an email campaign end-to-end using an EXISTING file the Owner refers to (not one you just created), the real sequence is: "pc_search_files" (find it for real) → "create_email_campaign" → "configure_email_campaign" (subject/body — write real, relevant content for what the Owner described, e.g. a genuine web-development-services outreach email if that's what they asked for) → "import_campaign_leads" (actionParams: useLastFoundFile:true — resolves the real file the search found; set maxContacts to a real number if the Owner said "first 50" or "first 100" — this keeps only that many real rows from the real file, never invents contacts to pad the count) → "configure_campaign_senders" → a real "wait_for_approval" → "start_email_campaign" only after that approval, unless the Owner already explicitly said to send without asking again.
- To actually run an email campaign end-to-end using a file created earlier in THIS task (not an existing one found via search — see the pc_search_files guidance above for that case), the real steps in order, each calling FEXUS's own real, existing Email Campaign API — never simulated UI clicking: "create_email_campaign" (actionParams: campaignName), "configure_email_campaign" (actionParams: subject, body), "import_campaign_leads" (actionParams: useLastWrittenFile:true to resolve a file you just wrote with pc_write_file, OR useLastFoundFile:true to resolve one located with pc_search_files — never a literal filePath guessed at plan time; optional maxContacts to import only the first N real rows if the Owner asked for a specific number), "configure_campaign_senders" (actionParams: EITHER senderIds — a real array, only if the Owner named specific senders you can reasonably infer — OR useAllSenders:true when the Owner said "divide across all configured senders," which looks up the real active sender list itself rather than guessing IDs), "start_email_campaign" (no params — this is followed by a wait_for_approval unless the Owner already explicitly said to send).
- To actually build and (if approved) deploy a website end-to-end for Shanza, use these REAL steps in order, each calling FEXUS's own real, existing Website AI API — never simulated UI clicking: "create_website_project" (actionParams: websiteType — MUST be one of these exact real categories: "Landing Page"|"Business Website"|"Portfolio"|"Agency Website"|"E-Commerce"|"Restaurant"|"Dental"|"Real Estate"|"Construction"|"Education"|"Healthcare"|"Corporate"|"SaaS Website"|"Blog"|"Personal Website"|"Event Website"|"Booking Website"|"Other" — pick the closest real match, or "Other" if genuinely nothing fits; requirementsText — a real, detailed description built from what the Owner actually said, never invented details), "generate_website_code" (actionParams: optional codeStack from the real supported list — "HTML, CSS & JavaScript"|"React"|"React + Tailwind CSS"|"Next.js"|"Next.js + Tailwind CSS" — and optional mode "ai"|"free"; both have real, safe defaults if omitted), then ALWAYS "wait_for_approval" before "request_website_publish" and "confirm_website_publish" — deployment is real and irreversible-feeling, never skip the approval gate even if the Owner sounds enthusiastic. "confirm_website_publish" resolves the real deployment provider (netlify/vercel) from whichever real token is actually configured on the backend — you don't need to and can't know which one at plan time, so never specify deploymentProvider yourself unless the Owner explicitly named a specific provider.
- Any step that would send a real email campaign, publish a website, delete data, or otherwise be hard to reverse must be preceded by a "wait_for_approval" step. EXCEPTION, per explicit Owner instruction: sending a single WhatsApp/Facebook/Instagram/LinkedIn message does NOT need a wait_for_approval — when the Owner directly dictates the message content in their own command (e.g. "message Ali: I'll call tomorrow"), that dictation IS their explicit authorization to send it; the real send-and-verify computer_click (with verifyChange) still applies as normal, just without an extra approval step first.
- For pc_create_folder, actionParams needs directoryName (one of the 4 fixed roots above) and folderName — the real created path is available to a LATER pc_write_file step via useLastCreatedFolder (see below).
- For pc_write_file, actionParams needs EITHER directoryName (one of the 4 fixed roots) OR useLastCreatedFolder:true (when the goal is "create a folder, then save data INSIDE it" — this resolves the real path from an earlier pc_create_folder step in this same task, never a guessed path), plus fileName and a content template (use {{research}} as a placeholder — this resolves to a real, properly-formatted CSV of the actual maps_lead_research results from earlier in this task, never invented or left blank). Set append:true when the goal is to ADD to an existing file (e.g. "save more data to the file we just created") rather than replace it — the real file content is verified either way after writing, never assumed.${priorTaskContext}

Respond with ONLY this JSON: { "steps": [{ "description": "a short, real Urdu (اردو script) description of this step, spoken aloud to the Owner as each step completes — e.g. 'ریسرچ فولڈر بن گیا۔' not 'Research folder created.' Real technical names (Gmail, Hira, CSV, etc.) may stay in English inside the Urdu sentence.", "actionType": "...", "actionParams": {} }] }`

  const { text } = await generateTextWithUsage(system, [{ role: 'user', content: goal }], 1800)
  let parsed
  try {
    parsed = extractJson(text)
  } catch (err) {
    console.error('[taskEngine] Failed to parse the planner\'s structured response. Raw model output:', text)
    console.error('[taskEngine] Real parse error:', err.message)
    const e = new Error('Task planning failed — the planner did not return a valid structured plan.'); e.status = 502; throw e
  }
  if (!parsed.steps?.length) throw new Error('Task planning produced an empty plan.')

  const task = await prisma.agentTask.create({
    data: { userId, goal, status: 'RUNNING', plan: JSON.stringify(parsed.steps) }
  })
  for (let i = 0; i < parsed.steps.length; i++) {
    const s = parsed.steps[i]
    await prisma.agentTaskStep.create({
      data: { taskId: task.id, order: i, description: s.description, actionType: s.actionType, actionParams: JSON.stringify(s.actionParams || {}) }
    })
  }
  return prisma.agentTask.findUnique({ where: { id: task.id }, include: { steps: { orderBy: { order: 'asc' } } } })
}

// ---------------------------------------------------------------------------
// PC CONTROL LOCK — real mutex. Only one task may control the physical
// PC at a time (section 45/46 of the spec). A step that needs PC control
// but can't acquire the lock is left PENDING (not silently skipped or
// run anyway) until the engine retries after the holder releases it.
// ---------------------------------------------------------------------------
const PC_TOUCHING_ACTIONS = new Set([
  'pc_open_folder', 'pc_open_file', 'pc_open_application', 'pc_open_url',
  'pc_search_in_application', 'pc_new_tab', 'pc_write_file', 'pc_create_folder',
  'computer_observe', 'computer_click', 'computer_type', 'export_website_files'
])

/**
 * Real internal API calls to FEXUS's own existing, tested endpoints —
 * this is deliberately NOT vision-based UI clicking through the Email
 * Campaigns page. Hira's work happens inside FEXUS's own backend, whose
 * exact API is already real and verified; calling it directly is more
 * reliable than simulating a human clicking through a browser, and
 * produces the identical real result (a real campaign, really created,
 * really started) — matching the brief's own "Reality Rule" (never
 * claim something happened that didn't) more faithfully than fragile
 * coordinate-based automation would. A real, short-lived JWT is signed
 * for the specific Owner this task belongs to — the exact same signing
 * function used at real login, not a separate auth mechanism.
 */
/** Real inter-step state passing — task.result is only ever set once
 * the WHOLE task completes, not mid-task, so it can't carry a value
 * like campaignId between steps. This looks up the most recent
 * successful step of a given actionType and extracts a real field from
 * its own, already-persisted result — genuine data from a real prior
 * action, never assumed or re-derived. */
/** Real formatting of maps_lead_research's actual results into a real
 * CSV — matching the exact real fields googlePlaces.js's own functions
 * return (name/phone/website/address/rating/category), never invented
 * columns. Missing fields (e.g. no phone found) are left genuinely
 * blank, never fabricated. */
function formatBusinessesAsCsv(businesses) {
  const header = 'Business Name,Phone,Website,Address,Category,Rating'
  const rows = (businesses || []).map((b) => {
    const esc = (v) => `"${String(v || '').replace(/"/g, '""')}"`
    return [esc(b.name), esc(b.phone), esc(b.website), esc(b.address), esc(b.businessType), esc(b.rating)].join(',')
  })
  return [header, ...rows].join('\n')
}

/** Real fix for a genuine, reported gap: pc_search_files' own real
 * result is a raw ARRAY of matches ([{name, path}, ...]), not an
 * object — so findPriorStepResult's generic {field} lookup can't
 * extract a single file's path from it directly (arrays don't have a
 * .path property). This finds the most recent pc_search_files step and
 * returns its first real match's real path — the exact, already-
 * verified-to-exist file the search actually found, never a guessed
 * filename. Returns null if no search ran, or it found nothing. */
function findFileFromSearch(task) {
  const matching = (task.steps || []).filter((s) => s.actionType === 'pc_search_files' && s.status === 'SUCCESS' && s.result)
  const step = matching[matching.length - 1]
  if (!step) return null
  try {
    const matches = JSON.parse(step.result)
    return Array.isArray(matches) && matches.length > 0 ? matches[0].path : null
  } catch {
    return null
  }
}

function findPriorStepResult(task, actionType, field) {
  const matching = (task.steps || []).filter((s) => s.actionType === actionType && s.status === 'SUCCESS' && s.result)
  const step = matching[matching.length - 1]
  if (!step) return null
  try {
    const parsed = JSON.parse(step.result)
    return field ? parsed[field] : parsed
  } catch {
    return null
  }
}

/** Real completion of the employee's Company Office lifecycle — if this
 * SAME task earlier used assign_to_employee (real, optional — a task
 * might run a campaign/website workflow without ever explicitly
 * "assigning" it), the associated real WorkflowStage transitions to
 * Completed ('completed' animation via robotVariantForStatus()) once
 * the actual underlying work genuinely finishes. A no-op, not an error,
 * when no such assignment exists in this task. */
/** Real completion of the employee's Company Office lifecycle — if this
 * SAME task earlier used assign_to_employee (real, optional — a task
 * might run a campaign/website workflow without ever explicitly
 * "assigning" it), the associated real WorkflowStage transitions once
 * the actual underlying work genuinely finishes. Real fix, found during
 * a Workflow Engine audit: the real system's own PATCH /stages/:id
 * route explicitly REJECTS setting status directly to "Completed" (its
 * own DIRECT_STATUSES allowlist excludes Completed/Approved/Waiting
 * Approval — those require a real review/approval step, by design).
 * The earlier version of this function bypassed that real rule via raw
 * Prisma. Now uses the real, valid, directly-settable "Needs Review"
 * status instead — genuinely honest given Usman's automated
 * verification isn't the same as a human review/approval, and calls
 * the real PATCH endpoint so the real logHistory() audit trail entry
 * is created too. A no-op, not an error, when no such assignment
 * exists in this task. */
async function markAssignedStageCompleted(task, abortSignal) {
  const stageId = findPriorStepResult(task, 'assign_to_employee', 'stageId')
  if (!stageId) return
  await callFexusApi(task.userId, 'PATCH', `/api/workflows/stages/${stageId}`, { status: 'Needs Review' }, abortSignal).catch((err) => {
    console.error(`[taskEngine] Failed to mark stage ${stageId} Needs Review:`, err.message)
  })
}

async function callFexusApi(userId, method, path, body, abortSignal) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error('Task owner account not found — cannot make an authenticated internal request.')
  const token = signToken(user)
  const port = process.env.PORT || 4000
  const response = await fetch(`http://localhost:${port}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: `fexus_session=${token}` },
    body: body ? JSON.stringify(body) : undefined,
    signal: abortSignal
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `Internal request to ${path} failed (${response.status})`)
  return data
}

async function acquirePcLock(userId, taskId) {
  const lock = await prisma.pcControlLock.upsert({
    where: { userId }, update: {}, create: { userId }
  })
  if (lock.heldByTaskId && lock.heldByTaskId !== taskId) {
    const holder = await prisma.agentTask.findUnique({ where: { id: lock.heldByTaskId } })
    if (holder && !['COMPLETED', 'FAILED', 'PAUSED'].includes(holder.status)) {
      return false // genuinely held by another still-active task
    }
  }
  await prisma.pcControlLock.update({ where: { userId }, data: { heldByTaskId: taskId, acquiredAt: new Date() } })
  return true
}

async function releasePcLock(userId, taskId) {
  const lock = await prisma.pcControlLock.findUnique({ where: { userId } })
  if (lock?.heldByTaskId === taskId) {
    await prisma.pcControlLock.update({ where: { userId }, data: { heldByTaskId: null, acquiredAt: null } })
  }
}

// ---------------------------------------------------------------------------
// REAL ACTION DISPATCH — every branch calls an EXISTING system. Throws a
// real error on genuine failure; there is no success path that doesn't
// come from the underlying system's own real response.
// ---------------------------------------------------------------------------
async function executeAction(userId, actionType, params, task, abortSignal) {
  if (actionType === 'pc_open_folder') return relayCommand(userId, '/open-folder', { folderPath: params.directoryName }, 'allowOpenFolders', abortSignal)
  if (actionType === 'pc_open_file') return relayCommand(userId, '/open-file', { filePath: params.fileName }, 'allowOpenFiles', abortSignal)
  if (actionType === 'pc_open_application') return relayCommand(userId, '/open-application', { name: params.applicationName }, 'allowOpenApplications', abortSignal)
  if (actionType === 'pc_open_url') return relayCommand(userId, '/open-url', { url: params.url }, 'allowOpenUrls', abortSignal)
  if (actionType === 'pc_search_files') return relayCommand(userId, '/search-files', { query: params.query, directoryName: params.directoryName }, 'allowReadMetadata', abortSignal)
  if (actionType === 'pc_show_files') return relayCommand(userId, '/desktop-files', {}, 'allowDesktop', abortSignal)
  if (actionType === 'pc_search_in_application') return relayCommand(userId, '/search-in-application', { name: params.applicationName, query: params.query }, 'allowOpenUrls', abortSignal)
  if (actionType === 'pc_new_tab') return relayCommand(userId, '/new-tab', {}, 'allowOpenApplications', abortSignal)
  if (actionType === 'pc_write_file') {
    // Real fix for the confirmed live "folder created but file empty"
    // bug: {{research}} previously substituted from task.result, which
    // — exactly like the earlier campaignId/projectId bug — is only
    // ever set once the WHOLE task completes, not mid-task. During real
    // execution (research step already succeeded, write step running
    // next), task.result was always empty, so the file's content was
    // always blank regardless of whether the path was even correct.
    // Now pulls the REAL research results from the maps_lead_research
    // step's own persisted result and formats them as a real CSV.
    let content = params.content || ''
    if (content.includes('{{research}}')) {
      const researchResults = findPriorStepResult(task, 'maps_lead_research', 'results')
      // Real distinction (Part 10's explicit requirement): "no earlier
      // research step ran at all" (null) is a different, real failure
      // from "research genuinely ran and found zero businesses" (a real
      // empty array) — both must be reported honestly rather than
      // silently producing a header-only file that could pass for
      // having real data.
      if (researchResults === null) throw new Error('No research results are available from an earlier step to write into this file.')
      if (researchResults.length === 0) throw new Error('Research found zero businesses — there is no real data to write into this file.')
      content = content.replace('{{research}}', formatBusinessesAsCsv(researchResults))
    }
    // Real fix for the confirmed live bug: writing into a folder
    // created earlier in this SAME task ("create a folder, then save
    // research into it"), the real path comes from that prior
    // pc_create_folder step's own persisted result — never re-derived
    // or guessed. This is the same real inter-step state pattern
    // already used for campaignId/projectId/stageId.
    const folderPath = params.useLastCreatedFolder ? findPriorStepResult(task, 'pc_create_folder', 'created') : null
    if (params.useLastCreatedFolder && !folderPath) throw new Error('No folder was created earlier in this task to write into.')
    return relayCommand(userId, '/write-file', { directoryName: params.directoryName, folderPath, fileName: params.fileName, content, append: !!params.append }, 'allowWriteFiles', abortSignal)
  }
  if (actionType === 'pc_create_folder') return relayCommand(userId, '/create-folder', { directoryName: params.directoryName, folderName: params.folderName }, 'allowWriteFiles', abortSignal)

  if (actionType === 'create_email_campaign') {
    const result = await callFexusApi(userId, 'POST', '/api/email-campaigns', { name: params.campaignName || 'Untitled Campaign' }, abortSignal)
    return { campaignId: result.campaign.id, name: result.campaign.name }
  }

  if (actionType === 'configure_email_campaign') {
    const campaignId = findPriorStepResult(task, 'create_email_campaign', 'campaignId')
    if (!campaignId) throw new Error('No campaign has been created yet in this task.')
    return callFexusApi(userId, 'PATCH', `/api/email-campaigns/${campaignId}`, { subject: params.subject, body: params.body }, abortSignal)
  }

  if (actionType === 'import_campaign_leads') {
    const campaignId = findPriorStepResult(task, 'create_email_campaign', 'campaignId')
    if (!campaignId) throw new Error('No campaign has been created yet in this task.')
    // Real fix for a genuinely reported gap: filePath previously had to
    // be a literal path the planner already knew at PLAN time — but for
    // "the CSV that's on Desktop" (a file Usman has to locate first),
    // the planner cannot know the real filename in advance. Now
    // resolves the same way assign_to_employee does: from a real
    // pc_write_file step (useLastWrittenFile) or a real pc_search_files
    // match (useLastFoundFile), falling back to a literal filePath only
    // when the planner genuinely already knows it.
    const filePath = params.useLastWrittenFile ? findPriorStepResult(task, 'pc_write_file', 'written')
      : params.useLastFoundFile ? findFileFromSearch(task)
      : params.filePath
    const fs = require('fs')
    if (!filePath || !fs.existsSync(filePath)) throw new Error(`Lead file not found: ${filePath || '(no real file path was resolved)'}`)
    let csvText = fs.readFileSync(filePath, 'utf8')
    // Real "first N contacts only" support — a genuine, explicit
    // request ("pehle 50 ya 100 logon ko email karo") is honored by
    // keeping the real header row plus only the first N real data
    // rows, never inventing rows or silently importing everyone when a
    // specific limit was asked for.
    if (params.maxContacts) {
      const lines = csvText.split(/\r?\n/)
      const header = lines[0]
      const dataLines = lines.slice(1).filter((l) => l.trim())
      csvText = [header, ...dataLines.slice(0, params.maxContacts)].join('\n')
    }
    return callFexusApi(userId, 'POST', `/api/email-campaigns/${campaignId}/import/csv`, { csvText }, abortSignal)
  }

  if (actionType === 'configure_campaign_senders') {
    const campaignId = findPriorStepResult(task, 'create_email_campaign', 'campaignId')
    if (!campaignId) throw new Error('No campaign has been created yet in this task.')
    // Real fallback: the planner (an LLM with no live database access)
    // genuinely cannot know real sender IDs in advance. When the Owner
    // says "divide across all configured senders" rather than naming
    // specific ones, useAllSenders queries the REAL, active, verified
    // sender list for this account — never a guessed/invented ID.
    let senderIds = params.senderIds
    if (!senderIds?.length && params.useAllSenders) {
      const activeSenders = await prisma.senderEmail.findMany({
        where: { userId, active: true, verificationStatus: 'Verified', connectionStatus: 'Connected' }, select: { id: true }
      })
      if (activeSenders.length === 0) throw new Error('No active, verified, connected senders are configured for this account.')
      senderIds = activeSenders.map((s) => s.id)
    }
    if (!senderIds?.length) throw new Error('No senders specified.')
    await callFexusApi(userId, 'POST', `/api/email-campaigns/${campaignId}/senders`, { senderIds }, abortSignal)
    // Real even distribution (spec: "300 contacts across 3 senders = 100
    // each") — reuses the EXISTING rotation mechanism (emailsPerSender)
    // rather than a new distribution system: setting it to
    // ceil(totalContacts / senderCount) makes the existing round-robin
    // rotate through exactly that many per sender before switching,
    // producing a genuine even split with zero new logic.
    const contactCount = await prisma.emailCampaignContact.count({ where: { campaignId } })
    const emailsPerSender = Math.ceil(contactCount / senderIds.length)
    return callFexusApi(userId, 'PATCH', `/api/email-campaigns/${campaignId}`, { emailsPerSender }, abortSignal)
  }

  if (actionType === 'start_email_campaign') {
    const campaignId = findPriorStepResult(task, 'create_email_campaign', 'campaignId')
    if (!campaignId) throw new Error('No campaign has been created yet in this task.')
    const result = await callFexusApi(userId, 'POST', `/api/email-campaigns/${campaignId}/start`, {}, abortSignal)
    await markAssignedStageCompleted(task, abortSignal)
    return result
  }

  if (actionType === 'create_website_project') {
    // Real fix: websiteType is validated by the real route against a
    // fixed allowlist (generatePlanCore throws a real 400 "Invalid
    // websiteType" otherwise) — an earlier draft passed the planner's
    // value through completely unvalidated, exactly the same class of
    // gap already found and fixed for codeStack/mode below. A real,
    // case-insensitive match against the actual allowlist first (an
    // LLM might reasonably say "portfolio" or "e-commerce" instead of
    // the exact "Portfolio"/"E-Commerce"), falling back to "Other" —
    // the real, intended catch-all already in the schema for exactly
    // this situation — rather than guessing a possibly-wrong specific
    // category.
    const REAL_WEBSITE_TYPES = [
      'Landing Page', 'Business Website', 'Portfolio', 'Agency Website', 'E-Commerce',
      'Restaurant', 'Dental', 'Real Estate', 'Construction', 'Education', 'Healthcare', 'Corporate',
      'SaaS Website', 'Blog', 'Personal Website', 'Event Website', 'Booking Website', 'Other'
    ]
    const requested = (params.websiteType || '').trim()
    const websiteType = REAL_WEBSITE_TYPES.find((t) => t.toLowerCase() === requested.toLowerCase()) || 'Other'
    // Reuses the REAL, existing Website AI plan generator — never a
    // second implementation. requirementsText is the exact real field
    // generatePlanCore() already expects.
    const result = await callFexusApi(userId, 'POST', '/api/website-ai/projects', { websiteType, requirementsText: params.requirementsText }, abortSignal)
    return { projectId: result.project.id, websiteType: result.project.websiteType }
  }

  if (actionType === 'generate_website_code') {
    const projectId = findPriorStepResult(task, 'create_website_project', 'projectId')
    if (!projectId) throw new Error('No website project has been created yet in this task.')
    // Real fix: codeStack is REQUIRED and validated by generateCodeCore()
    // against a real, fixed allowlist — it is not optional/defaultable
    // as an earlier draft of this code assumed. A real, sensible default
    // (the one stack this system can fully live-preview with no build
    // step, per the existing code's own comments) is used only when the
    // planner didn't specify one; an invalid stack name is never sent.
    const REAL_CODE_STACKS = ['HTML, CSS & JavaScript', 'React', 'React + Tailwind CSS', 'Next.js', 'Next.js + Tailwind CSS']
    const codeStack = REAL_CODE_STACKS.includes(params.codeStack) ? params.codeStack : 'HTML, CSS & JavaScript'
    // Real fix (a third real gap caught the same way as codeStack above):
    // mode is ALSO required and validated by generateCodeCore() against
    // exactly ['free', 'ai'] — an earlier draft passed params.mode
    // through unvalidated, which would have thrown "mode must be 'free'
    // or 'ai'" whenever the planner omitted or mis-specified it.
    const mode = ['free', 'ai'].includes(params.mode) ? params.mode : 'ai'
    const result = await callFexusApi(userId, 'POST', `/api/website-ai/projects/${projectId}/generate-code`, { codeStack, mode }, abortSignal)
    // Real fix: the actual route returns { project, fileCount }, not
    // { project: { generatedFiles } } as an earlier draft assumed —
    // verified directly against generateCodeCore()'s real return value.
    return { projectId, codeStack, fileCount: result.fileCount || 0 }
  }

  if (actionType === 'export_website_files') {
    // Real fix for a genuinely reported gap: the real generated website
    // code lives only in the database (WebsiteProject.generatedFiles,
    // a real [{path, content}] array) — there was no way to actually
    // see it as real files on disk. This fetches the real project,
    // creates a real folder on Desktop, writes every real generated
    // file into it (reusing the existing, already-tested write-and-
    // verify Local Agent mechanism, one real relayCommand per file),
    // then opens the real folder so the Owner genuinely sees it.
    const projectId = findPriorStepResult(task, 'create_website_project', 'projectId')
    if (!projectId) throw new Error('No website project has been created yet in this task.')
    const result = await callFexusApi(userId, 'GET', `/api/website-ai/projects/${projectId}`, null, abortSignal)
    const project = result.project
    let files
    try {
      files = JSON.parse(project.generatedFiles || '[]')
    } catch {
      files = []
    }
    if (files.length === 0) throw new Error('This website project has no real generated files yet — generate_website_code must succeed first.')

    const folderName = (params.folderName || project.websiteType || 'Website Project').replace(/[<>:"/\\|?*]/g, '_')
    const created = await relayCommand(userId, '/create-folder', { directoryName: 'desktop', folderName }, 'allowWriteFiles', abortSignal)

    let written = 0
    for (const file of files) {
      if (!file.path || typeof file.content !== 'string') continue
      // Real nested-path support — a generated file like
      // "src/components/Hero.jsx" becomes real nested subfolders,
      // never flattened or silently dropped.
      const relativeDir = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : ''
      const fileName = file.path.includes('/') ? file.path.slice(file.path.lastIndexOf('/') + 1) : file.path
      if (relativeDir) {
        // Real error visibility: unlike a plain fs.mkdirSync (which
        // this real endpoint uses internally, recursive:true — so it
        // doesn't error for an already-existing directory), any GENUINE
        // failure here (permissions, an invalid path) is now logged
        // rather than silently discarded, so it's visible if the
        // subsequent write-file call for this same subfolder fails for
        // a related reason.
        await relayCommand(userId, '/create-folder', { folderPath: created.created, folderName: relativeDir }, 'allowWriteFiles', abortSignal)
          .catch((err) => console.error(`[taskEngine] export_website_files: real error creating subfolder "${relativeDir}":`, err.message))
      }
      await relayCommand(userId, '/write-file', { folderPath: relativeDir ? `${created.created}/${relativeDir}` : created.created, fileName, content: file.content }, 'allowWriteFiles', abortSignal)
      written++
    }

    // Real, visible confirmation — genuinely opens the real folder so
    // the Owner sees the actual files, not just a database record.
    await relayCommand(userId, '/open-folder', { folderPath: created.created }, 'allowOpenFolders', abortSignal)

    return { folderPath: created.created, filesWritten: written, totalFiles: files.length }
  }

  if (actionType === 'request_website_publish') {
    const projectId = findPriorStepResult(task, 'create_website_project', 'projectId')
    if (!projectId) throw new Error('No website project has been created yet in this task.')
    const result = await callFexusApi(userId, 'POST', `/api/website-ai/projects/${projectId}/request-publish`, {}, abortSignal)
    return { projectId, confirmationPrompt: result.confirmationPrompt }
  }

  if (actionType === 'confirm_website_publish') {
    const projectId = findPriorStepResult(task, 'create_website_project', 'projectId')
    if (!projectId) throw new Error('No website project has been created yet in this task.')
    // Real fix (a second, related gap found in the same audit pass as
    // websiteType above): confirm-publish ALSO requires a real,
    // validated deploymentProvider — an earlier draft only sent
    // {confirm:true} with no provider at all, which the real route
    // rejects outright with "Invalid deploymentProvider" every single
    // time, meaning no publish attempted this way could ever have
    // succeeded. Only "vercel" and "netlify" trigger a real deployment
    // (confirmed directly in the route's own code/comments) — resolved
    // here by checking which real token is actually configured in this
    // same backend process, never guessed or left to the planner (which
    // has no way to know which token exists at plan time).
    const deploymentProvider = params.deploymentProvider
      || (process.env.NETLIFY_TOKEN ? 'netlify' : process.env.VERCEL_TOKEN ? 'vercel' : 'netlify')
    // Real, explicit confirm:true — the exact literal the route itself
    // requires before it will touch a real deployment provider. This
    // step must always be preceded by a real wait_for_approval in the
    // plan; the planner is instructed accordingly below.
    const result = await callFexusApi(userId, 'POST', `/api/website-ai/projects/${projectId}/confirm-publish`, { confirm: true, deploymentProvider }, abortSignal)
    // Real fix (a third gap found in this same audit pass): the real
    // route returns HTTP 200 with published:true EVEN WHEN the actual
    // deployment genuinely failed (e.g. no token configured) — the
    // failure is only visible in a separate deployError field within an
    // otherwise-"successful" response. callFexusApi only throws on a
    // real non-2xx HTTP status, so this step would previously have been
    // marked SUCCESS — and the employee's stage marked Completed —
    // even when nothing was actually deployed. This directly violates
    // this project's own standing rule: never claim "deployed" unless
    // the provider genuinely confirmed it.
    if (result.deployError) {
      throw new Error(`Publish was confirmed but the real deployment failed: ${result.deployError}`)
    }
    await markAssignedStageCompleted(task, abortSignal)
    return result
  }

  if (actionType === 'computer_observe') {
    const vision = require('./lib/visionProvider')
    if (!vision.isConfigured()) {
      // Real, explicit, honest failure — never a silent "assume it
      // worked." This is the exact case spec section 5 requires: return
      // a configuration error, don't pretend screen understanding
      // occurred.
      throw new Error('Screen observation requires VISION_MODEL to be configured in backend/.env — the active text model cannot see images.')
    }
    const capture = await relayCommand(userId, '/capture-screen', {}, 'allowMouseControl', abortSignal)
    const observation = await vision.analyzeScreen(capture.imageBase64, params.question || 'Describe what is visible.')
    return { observation }
  }

  if (actionType === 'computer_click') {
    const vision = require('./lib/visionProvider')
    if (!vision.isConfigured()) throw new Error('Clicking requires real screen observation, which requires VISION_MODEL to be configured.')
    const capture = await relayCommand(userId, '/capture-screen', {}, 'allowMouseControl', abortSignal)
    const observation = await vision.analyzeScreen(capture.imageBase64, `Find this element: ${params.target}`)
    const confidence = observation.targetConfidence || 0
    if (!observation.targetElement || confidence < CLICK_CONFIDENCE_THRESHOLD) {
      // Real refusal to guess (spec section 55) — reported back
      // honestly as a real result the executor can act on (e.g. mark
      // the step FAILED with a clear reason), not a silent no-op.
      throw new Error(`Could not confidently locate "${params.target}" on screen (confidence ${confidence.toFixed(2)}, threshold ${CLICK_CONFIDENCE_THRESHOLD}) — will not guess-click.`)
    }
    await relayCommand(userId, '/mouse-move', { x: observation.targetElement.approxX, y: observation.targetElement.approxY }, 'allowMouseControl', abortSignal)
    const clicked = await relayCommand(userId, '/mouse-click', { button: params.button || 'left' }, 'allowMouseControl', abortSignal)

    // Real fix: the click previously had no post-action verification at
    // all — OBSERVE→ACT with no re-OBSERVE, despite that being the
    // explicit, repeated requirement across this whole computer-use
    // layer ("click Send → screenshot → verify the message was actually
    // sent"). A brief, real wait for the UI to settle, then a second
    // real screenshot + vision call checking specifically for the
    // expected change — only when the caller specifies one to check
    // for (verifyChange), since not every click has a checkable
    // expected outcome, and a generic "did anything change" question
    // isn't a meaningful verification.
    let verification = { checked: false }
    if (params.verifyChange) {
      await new Promise((resolve) => setTimeout(resolve, 800))
      const afterCapture = await relayCommand(userId, '/capture-screen', {}, 'allowMouseControl', abortSignal)
      const afterObservation = await vision.analyzeScreen(afterCapture.imageBase64, `After clicking "${params.target}", is this true: ${params.verifyChange}? Set targetConfidence to your real confidence that this is true (0 if clearly false).`)
      verification = { checked: true, confirmed: (afterObservation.targetConfidence || 0) >= CLICK_CONFIDENCE_THRESHOLD, confidence: afterObservation.targetConfidence || 0 }
      if (!verification.confirmed) {
        // Honest failure, not a silent "probably worked" — matches Part
        // 2's explicit "if not: retry safely or report failure. Do not
        // blindly continue."
        throw new Error(`Clicked "${params.target}", but could not verify the expected result ("${params.verifyChange}") afterward (confidence ${verification.confidence.toFixed(2)}).`)
      }
    }

    return { clicked: params.target, confidence, verification, ...clicked }
  }

  if (actionType === 'computer_type') {
    if (!params.text) throw new Error('computer_type requires text to type.')
    return relayCommand(userId, '/type-text', { text: params.text }, 'allowKeyboardControl', abortSignal)
  }

  if (actionType === 'assign_to_employee') {
    // Real, valid targets only — matches the exact same constraint
    // voiceAgent.js's existing single-shot assign_task intent already
    // enforces. Amina is the coordinator who delegates work, not a
    // Workflow assignee in the same governance sense — and there is no
    // real "executive" department key (the real list is website,
    // marketing, sales, seo, deployment, finance, support, analytics,
    // automation), so inventing one here would create a workflow no
    // real Director dashboard would ever surface.
    if (!['Hira', 'Shanza'].includes(params.employeeName)) {
      throw new Error(`"${params.employeeName}" is not a valid assignment target — only Hira or Shanza.`)
    }
    const employee = await prisma.employee.findFirst({ where: { name: params.employeeName } })
    if (!employee) throw new Error(`No employee named "${params.employeeName}" was found.`)
    const departmentKey = params.employeeName === 'Hira' ? 'marketing' : 'website'

    // Real fix, found during a Workflow Engine audit: this previously
    // wrote directly to Prisma, bypassing the real workflow API
    // entirely — skipping its real logHistory() audit-trail entries,
    // real notify() notifications, and the real WorkflowAssignment
    // record the actual UI's Workflow Detail page expects to see. A
    // workflow created this way had no creation history at all,
    // visually inconsistent with one created through the normal UI.
    // Now genuinely goes through the same real, existing endpoints.
    const workflowResult = await callFexusApi(userId, 'POST', '/api/workflows', {
      title: params.taskDescription || task.goal, departmentKey, priority: 'Medium'
    }, abortSignal)
    const workflow = workflowResult.workflow
    const stageResult = await callFexusApi(userId, 'POST', `/api/workflows/${workflow.id}/stages`, {
      title: params.taskDescription || task.goal, assigneeEmployeeId: employee.id
    }, abortSignal)
    const stage = stageResult.stage
    // Real transition to WORKING — matches the brief's own explicit
    // requirement ("Hira should transition to WORKING in Company
    // Office"). 'Working' is a real, directly-settable status (checked
    // against the real route's own DIRECT_STATUSES allowlist) — unlike
    // 'Completed' below, which the real system does NOT allow to be set
    // directly.
    await callFexusApi(userId, 'PATCH', `/api/workflows/stages/${stage.id}`, { status: 'Working' }, abortSignal)

    // Real file handoff — reuses the EXISTING Employee Memory system
    // (memoryManager.js's real, pre-existing fileReferences mechanism),
    // never a second, invented file-attachment system. If an earlier
    // plan step opened/found a real file, its path is threaded here as
    // params.fileLabel/filePath — the employee's own real memory row
    // now genuinely carries the reference, not just a text description
    // in the task title.
    // Real fix (Part 13 — Hira/Shanza handoff of a file Usman JUST
    // created, not only one found via search): filePath can now also
    // resolve from a real pc_write_file step earlier in this same task
    // — the exact real path that step's own write-and-verify logic
    // confirmed exists on disk — never a guessed or planner-invented
    // path. Falls back to params.filePath directly when the planner
    // already knows a real, pre-existing file's path (e.g. from
    // pc_open_file/pc_search_files).
    // Real fix (a genuinely reported gap): useLastFoundFile resolves
    // from a real pc_search_files step's actual first match — for
    // handing off an EXISTING file the Owner referred to ("the CSV
    // that's on Desktop") which Usman had to locate first, rather than
    // one he just wrote himself.
    const filePath = params.useLastWrittenFile ? findPriorStepResult(task, 'pc_write_file', 'written')
      : params.useLastFoundFile ? findFileFromSearch(task)
      : params.filePath
    if (filePath) {
      const memoryManager = require('./memoryManager')
      const memory = await memoryManager.loadMemory({ employeeId: employee.id, stageId: stage.id })
      await memoryManager.updateWorkingMemory(memory.id, {
        fileReferences: [{ label: params.fileLabel || filePath.split(/[\\/]/).pop(), url: filePath }]
      })
    }

    return { workflowId: workflow.id, stageId: stage.id, assignedTo: employee.name, fileAttached: !!filePath }
  }

  if (actionType === 'maps_lead_research') {
    // Reuses the REAL, existing Google Places integration — never a
    // second, fabricated implementation of business search.
    // searchBusinesses() itself throws its own real, correct error if
    // not configured — no need to duplicate that check here.
    const places = require('./lib/googlePlaces')
    // Real pagination now threaded through — params.limit tells the real
    // search function when it has genuinely collected enough (stopping
    // early rather than always fetching every available page), matching
    // the earlier "100 businesses" gap this session closes for real.
    const results = await places.searchBusinesses(params.query, params.limit)
    // The real API call has no limit parameter — applied client-side
    // against the real returned results, never inflating a shorter list.
    const limited = params.limit ? results.slice(0, params.limit) : results

    // Real fix, found during a capability audit: legacy Places search
    // results don't include phone number or website at all — a second,
    // real call (getBusinessDetails) is required per business to get
    // those. The New Places API path (GOOGLE_PLACES_API_VERSION=new)
    // returns them directly from a real field mask in the SAME search
    // call, so re-fetching per business there would be a genuinely
    // wasteful, redundant real API call for data already present — this
    // is skipped when it's already real and non-empty. Fetched by
    // default on the legacy path, since a "collect phone numbers"
    // request is meaningless without it — can be skipped with
    // includeDetails:false when only names/addresses are needed. A
    // single business's detail lookup failing does not fail the whole
    // batch — it's left with real, honestly-blank phone/website fields
    // rather than invented ones or an aborted task.
    if (params.includeDetails !== false) {
      for (const business of limited) {
        if (business.phone || business.website) continue // already real, from the New API's own search response — no redundant call
        try {
          const details = await places.getBusinessDetails(business.placeId)
          business.phone = details.phone
          business.website = details.website
        } catch (err) {
          business.phone = ''
          business.website = ''
          business.detailsError = err.message
        }
      }
    }

    return { count: limited.length, results: limited }
  }

  if (actionType === 'wait_for_approval') {
    return { message: params.message || 'Waiting for Owner approval before continuing.' }
  }

  if (actionType === 'manual_step') {
    // Honest, real limitation surfaced directly — never silently
    // skipped or pretended to have been done automatically.
    return { requiresManualAction: true, instructions: params.instructions || 'This step requires the Owner to do it manually — FEXUS cannot read web page content.' }
  }

  throw new Error(`Unknown action type: ${actionType}`)
}

function isRetryable(err) {
  return /timed? ?out|timeout|connection (error|refused|failed)|unreachable/i.test(err.message || '')
}

/** Advances a task by exactly one real step. Called explicitly (by the
 * task-tick driver below, or by an API call), never in a tight loop —
 * this is what keeps LLM/PC-action calls bounded and visible, not a
 * silent background flood. */
// Real per-task cancellation registry — an in-memory Map from taskId to
// the AbortController for whatever action is currently in flight for
// that task. This is what makes "Usman STOP" able to abort a real,
// already-sent HTTP request to the Local Agent, not just prevent the
// next one from starting.
const activeControllers = new Map()

async function executeNextStep(taskId) {
  const task = await prisma.agentTask.findUnique({ where: { id: taskId }, include: { steps: { orderBy: { order: 'asc' } } } })
  if (!task) throw new Error('Task not found')
  if (['COMPLETED', 'FAILED', 'PAUSED', 'STOPPED', 'WAITING_APPROVAL', 'WAITING_DEPENDENCY'].includes(task.status)) {
    return task // never auto-advance a task that's deliberately not running
  }

  if (task.dependsOnTaskId) {
    const dep = await prisma.agentTask.findUnique({ where: { id: task.dependsOnTaskId } })
    if (dep && dep.status !== 'COMPLETED') {
      await prisma.agentTask.update({ where: { id: task.id }, data: { status: 'WAITING_DEPENDENCY' } })
      return prisma.agentTask.findUnique({ where: { id: task.id } })
    }
  }

  const step = task.steps[task.currentStepIndex]
  if (!step) {
    await prisma.agentTask.update({ where: { id: task.id }, data: { status: 'COMPLETED', completedAt: new Date(), result: 'All planned steps completed.' } })
    return prisma.agentTask.findUnique({ where: { id: task.id } })
  }

  let lockAcquired = false
  if (PC_TOUCHING_ACTIONS.has(step.actionType)) {
    lockAcquired = await acquirePcLock(task.userId, task.id)
    if (!lockAcquired) return task // real wait — another task genuinely holds PC control right now
  }

  await prisma.agentTaskStep.update({ where: { id: step.id }, data: { status: 'RUNNING', startedAt: new Date() } })

  const controller = new AbortController()
  activeControllers.set(task.id, controller)

  try {
    const params = JSON.parse(step.actionParams || '{}')
    const result = await executeAction(task.userId, step.actionType, params, task, controller.signal)

    await prisma.agentTaskStep.update({ where: { id: step.id }, data: { status: 'SUCCESS', result: JSON.stringify(result).slice(0, 4000), completedAt: new Date() } })
    await prisma.agentTaskCheckpoint.create({
      data: { taskId: task.id, stepIndex: task.currentStepIndex, description: step.description, output: JSON.stringify(result).slice(0, 2000), currentUrl: params.url || '', currentFile: params.fileName || '' }
    })

    if (step.actionType === 'wait_for_approval') {
      await prisma.agentTask.update({ where: { id: task.id }, data: { status: 'WAITING_APPROVAL', retryCount: 0 } })
    } else {
      await prisma.agentTask.update({ where: { id: task.id }, data: { currentStepIndex: task.currentStepIndex + 1, retryCount: 0 } })
    }
  } catch (err) {
    // A real abort (Owner said STOP while this exact action was in
    // flight) is a genuinely different outcome from a normal failure —
    // recorded honestly as interrupted, never silently merged into the
    // ordinary retry/fail path, and never retried automatically.
    if (err.name === 'AbortError') {
      await prisma.agentTaskStep.update({ where: { id: step.id }, data: { status: 'FAILED', error: 'Interrupted by Owner (STOP).', completedAt: new Date() } })
      // Task status was almost certainly already set to STOPPED by
      // stopTask() itself — this is just a safety net if somehow it
      // wasn't (e.g. a race between the abort firing and the DB write).
      const current = await prisma.agentTask.findUnique({ where: { id: task.id } })
      if (current && current.status !== 'STOPPED') {
        await prisma.agentTask.update({ where: { id: task.id }, data: { status: 'STOPPED', error: `Interrupted during: ${step.description}` } })
      }
    } else {
      const attempts = task.retryCount + 1
      if (attempts <= 2 && isRetryable(err)) {
        await prisma.agentTask.update({ where: { id: task.id }, data: { retryCount: attempts } })
        await prisma.agentTaskStep.update({ where: { id: step.id }, data: { status: 'PENDING' } }) // real retry — same step, next tick
      } else {
        await prisma.agentTaskStep.update({ where: { id: step.id }, data: { status: 'FAILED', error: err.message, completedAt: new Date() } })
        await prisma.agentTask.update({ where: { id: task.id }, data: { status: 'FAILED', error: err.message } })
      }
    }
  } finally {
    activeControllers.delete(task.id)
    if (lockAcquired) await releasePcLock(task.userId, task.id)
  }

  return prisma.agentTask.findUnique({ where: { id: task.id } })
}

async function pauseTask(taskId) {
  return prisma.agentTask.update({ where: { id: taskId }, data: { status: 'PAUSED' } })
}

/**
 * Real emergency stop (spec section 1 of this entry, section 49 of the
 * one before it). Distinct from pauseTask() — this immediately:
 *   1. Marks the task STOPPED right now, before anything else, so the
 *      next tick (and any check anywhere else) sees it instantly.
 *   2. Aborts the real, currently in-flight action's AbortController if
 *      one is registered for this task — a genuine, not merely
 *      claimed, cancellation of the pending HTTP request to the Local
 *      Agent.
 *   3. Records which step was interrupted, honestly distinguishing
 *      "we told it to stop and it hadn't started the next thing yet"
 *      from "we interrupted something already in progress."
 *
 * HONEST LIMIT, unchanged from before: this can abort the HTTP request
 * this backend made to the Local Agent. It cannot reach back into an
 * already-issued Win32 API call the Local Agent's own PowerShell
 * process is mid-way through (e.g. a mouse_event that already fired) —
 * no cancellation token exists for that at the OS level. What this
 * *does* guarantee is that no FURTHER action in the plan executes.
 */
async function stopTask(taskId) {
  const task = await prisma.agentTask.findUnique({ where: { id: taskId }, include: { steps: { orderBy: { order: 'asc' } } } })
  if (!task) throw new Error('Task not found')

  const interruptedStep = task.steps[task.currentStepIndex]
  const wasRunning = interruptedStep?.status === 'RUNNING'

  await prisma.agentTask.update({
    where: { id: taskId },
    data: { status: 'STOPPED', error: wasRunning ? `Stopped by Owner during: ${interruptedStep.description}` : 'Stopped by Owner.' }
  })

  // Real, deterministic fix: the interrupted step's OWN status is set
  // here directly, not left to depend on the abort signal successfully
  // racing the in-flight action's own completion. Without this, a step
  // whose action had no real cancellation point at the exact moment of
  // abort (e.g. a brief synchronous check before its first real await)
  // could be left stuck at RUNNING forever — this makes the step-level
  // state consistent immediately, regardless of that race's outcome.
  // executeNextStep's own AbortError handler still runs too and is
  // harmless if it writes the same real outcome a moment later.
  if (wasRunning) {
    await prisma.agentTaskStep.update({
      where: { id: interruptedStep.id },
      data: { status: 'FAILED', error: 'Interrupted by Owner (STOP).', completedAt: new Date() }
    })
  }

  const controller = activeControllers.get(taskId)
  if (controller) {
    controller.abort() // real abort — propagates into relayCommand's/callFexusApi's fetch() via the combined signal, when there's still something in flight to abort
  }

  return prisma.agentTask.findUnique({ where: { id: taskId } })
}

/** Resumes from the real, last saved state — currentStepIndex was never
 * reset on pause, so this continues exactly where it left off, not from
 * step 0. */
async function resumeTask(taskId) {
  return prisma.agentTask.update({ where: { id: taskId }, data: { status: 'RUNNING' } })
}

async function approveTask(taskId) {
  const task = await prisma.agentTask.update({ where: { id: taskId }, data: { status: 'RUNNING', currentStepIndex: { increment: 1 } } })
  return task
}

// ---------------------------------------------------------------------------
// TICK DRIVER — same real, existing setInterval pattern already used by
// campaignEngine.js, reused rather than inventing a second background
// job mechanism.
// ---------------------------------------------------------------------------
let started = false
function startTaskEngine() {
  if (started) return
  started = true
  setInterval(async () => {
    try {
      const runningTasks = await prisma.agentTask.findMany({ where: { status: 'RUNNING' } })
      for (const t of runningTasks) {
        await executeNextStep(t.id).catch((err) => console.error(`[taskEngine] tick failed for task ${t.id}:`, err.message))
      }
    } catch (err) {
      console.error('[taskEngine] tick error:', err.message)
    }
  }, 4000)
}

module.exports = {
  planTask, executeNextStep, pauseTask, resumeTask, stopTask, approveTask,
  startTaskEngine, ACTION_TYPES, acquirePcLock, releasePcLock
}
