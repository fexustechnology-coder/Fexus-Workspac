const express = require('express')
const prisma = require('../prismaClient')
const { requireAuth } = require('../middleware/auth')
const { generateTextWithUsage, extractJson } = require('../lib/llmProvider')
const { log: campaignLog } = require('../campaignEngine')
const { relayCommand } = require('./localAgent')
const { logHistory, notify } = require('../lib/workflowHelpers')

const router = express.Router()

const KNOWN_EMPLOYEES = { amina: 'ceo', hira: 'employee-hira', shanza: 'employee-shanza' }

// =============================================================================
// FEXUS VOICE AGENT
// =============================================================================
// This is an ORCHESTRATION layer, not a new business-logic engine. Every
// real action below reads/writes the SAME Workflow Engine and Email
// Campaign tables the existing dashboard UI already uses — a workflow
// created by voice is indistinguishable, in the database, from one
// created by clicking "Submit a task" in Company Office. Uses the
// centralized Groq provider only (lib/llmProvider.js) — no second LLM
// integration, no direct provider call.
// =============================================================================

async function findEmployeeByName(name) {
  if (!name) return null
  const normalized = name.trim().toLowerCase()
  if (normalized === 'amina') return prisma.employee.findFirst({ where: { level: 'ceo' } })
  if (normalized === 'hira') return prisma.employee.findFirst({ where: { name: 'Hira' } })
  if (normalized === 'shanza') return prisma.employee.findFirst({ where: { name: 'Shanza' } })
  return null
}

/**
 * Real cost/latency optimization (explicitly required) — a handful of
 * very common, unambiguous PC commands are resolved WITHOUT a Groq call
 * at all. Anything even slightly ambiguous (a fuzzy filename, a
 * multi-step instruction) deliberately falls through to the real LLM
 * parse instead of guessing here.
 */
/** The ONE real wake-word-stripping implementation — called once per
 * request, before either routing path, so both see identical text. */
function stripWakeWord(transcript) {
  // FEXUS AS is the official agent name/wake word. "Usman" is kept as a
  // real, working backward-compatible alias (not removed outright) —
  // genuine continuity for anyone already used to the prior name,
  // while every new user-facing label/response uses "FEXUS AS."
  return transcript.trim().toLowerCase()
    .replace(/^(hey\s+)?(fexus\s*as|usman)[,.]?\s*/i, '')
    .replace(/[.!?]+$/, '')
    .trim()
}

function tryDeterministicRoute(normalizedTranscript) {
  const t = normalizedTranscript

  if (t === 'open gmail' || t === 'go to gmail') {
    return { intent: 'pc_open_application', applicationName: 'gmail', requiresConfirmation: false, spokenResponse: 'جی، Gmail کھول رہا ہوں۔' }
  }
  if (t === 'open google maps' || t === 'open maps') {
    return { intent: 'pc_open_application', applicationName: 'google maps', requiresConfirmation: false, spokenResponse: 'جی، Google Maps کھول رہا ہوں۔' }
  }
  if (t === 'open browser' || t === 'open my browser' || t === 'launch browser') {
    // Real fix: this used to fall through to a URL-opening path with a
    // hardcoded blank-page target. Now a genuinely distinct "launch the
    // app" action.
    return { intent: 'pc_open_application', applicationName: 'browser', requiresConfirmation: false, spokenResponse: 'جی، browser کھول رہا ہوں۔' }
  }
  if (t === 'open a new tab' || t === 'open new tab' || t === 'new tab' || t === 'open another tab') {
    return { intent: 'pc_new_tab', requiresConfirmation: false, spokenResponse: 'جی، نیا tab کھول رہا ہوں۔' }
  }
  if (t === 'open desktop' || t === 'open my desktop' || t === 'go to desktop' || t === 'show desktop' || t === 'show my desktop') {
    // Real fix: this used to route to pc_show_files, which only LISTS
    // files via an API response — it never actually opened Windows
    // Explorer. "Open/go to/show desktop" now genuinely opens the real
    // Explorer window (pc_open_folder → explorer.exe), matching what
    // the Owner actually sees happen. "show desktop FILES" (below,
    // distinct phrasing) still means "list them," not "open Explorer."
    return { intent: 'pc_open_folder', directoryName: 'desktop', requiresConfirmation: false, spokenResponse: 'جی، آپ کا Desktop کھول رہا ہوں۔' }
  }
  if (t === 'show desktop files' || t === 'show me desktop files' || t === 'show me my desktop files') {
    return { intent: 'pc_show_files', directoryName: 'desktop', requiresConfirmation: false, spokenResponse: 'یہ رہیں آپ کی Desktop کی فائلیں۔' }
  }
  if (t === 'open file explorer' || t === 'open explorer') {
    return { intent: 'pc_open_application', applicationName: 'file explorer', requiresConfirmation: false, spokenResponse: 'جی، File Explorer کھول رہا ہوں۔' }
  }
  if (t === 'shut down my computer' || t === 'shut down the computer' || t === 'shut down my pc') {
    return { intent: 'pc_shutdown', requiresConfirmation: true, spokenResponse: 'Shutdown کرنے سے آپ کا موجودہ session بند ہو جائے گا۔ کیا میں آگے بڑھوں؟' }
  }
  if (t === 'restart my computer' || t === 'restart the computer' || t === 'restart my pc') {
    return { intent: 'pc_restart', requiresConfirmation: true, spokenResponse: 'Restart کرنے سے آپ کا موجودہ session بند ہو جائے گا۔ کیا میں آگے بڑھوں؟' }
  }
  return null
}

async function parseCommand(transcript, conversationHistory) {
  const system = `You are FEXUS AS — the FEXUS AI computer/voice agent's natural language understanding layer — you do not speak directly to the user, you parse their spoken command into a structured action for the real backend to execute. The user calls this assistant "FEXUS AS" (its official name and voice activation phrase; "Usman" is a real, working backward-compatible alias for the same agent) — the transcript you receive has already had the wake word stripped from the front where present, so treat the remaining text as the actual command.

The FEXUS office has exactly three real employees:
- Amina — CEO / Office Manager. Coordinates, delegates, gathers people.
- Hira — Email Campaign / Marketing Specialist. Handles email campaigns.
- Shanza — Website Specialist. Handles website projects.

Classify the command into exactly one intent:
- "assign_task": a NEW task for Hira or Shanza that is genuinely JUST a delegation note — the Owner wants it recorded/assigned but has NOT asked for the real work (campaign creation, website generation) to actually start yet (e.g. "note this down for Shanza, I'll brief her later"). This does NOT create a real email campaign or a real website project — only a task record.
- "status_query": the user wants to know what an employee is currently doing.
- "control_action": pause/resume/stop something already running (a campaign or a website build). Extract which one from context if stated.
- "gather": the user wants one or more employees (or "everyone"/"all three") to come to them or follow them. This is a pure office-interaction request — it changes nothing in the real backend.
- "pc_open_file": open a specific file on the user's own computer.
- "pc_open_folder": open a specific folder/directory on the user's own computer.
- "pc_open_application": open a known application (e.g. Gmail, file explorer, VS Code).
- "pc_show_files": list files in an approved directory (e.g. "show me my desktop").
- "pc_search_files": find a file by a partial/fuzzy name.
- "pc_search_in_application": search WITHIN a known application (e.g. "search Google Maps for dental clinics in Lahore") — extract the application name and the real search query separately.
- "pc_new_tab": open a new browser tab — launches the browser first if it doesn't appear to be open.
- "pc_mouse_move": move the mouse cursor to a described screen position (e.g. "center of the screen", "top left"). Only recognize this for clearly GUI-directed requests, not vague ones.
- "pc_type_text": type specific literal text via the keyboard (e.g. "type hello world"). Extract the exact text to type.
- "complex_task": the command genuinely requires MULTIPLE chained real steps to accomplish. This is the CORRECT intent — not "assign_task" — for ANY request that wants Hira to actually run/prepare a real email campaign, or Shanza to actually build/generate/publish a real website (e.g. "tell Shanza to build a website for my restaurant", "have Hira run an email campaign", "give Hira the CSV on Desktop and send to the first 50 people"). These need a real, separate planner to produce the real steps (create the project/campaign, generate/import, get approval, publish/send) — "assign_task" alone only creates an empty task record with no real work behind it, which is wrong whenever the Owner actually wants the work done, not just noted down. Use this whenever a single action type from the list above clearly isn't enough — a real, separate planner will decompose it further.
- "pc_shutdown" / "pc_restart": shut down or restart the computer. ALWAYS requires confirmation.
- "chitchat": a greeting, unclear command, or anything that isn't a real actionable request.

Respond with ONLY this JSON object, nothing else:
{
  "intent": "assign_task" | "status_query" | "control_action" | "gather" | "pc_open_file" | "pc_open_folder" | "pc_open_application" | "pc_show_files" | "pc_search_files" | "pc_search_in_application" | "pc_new_tab" | "pc_mouse_move" | "pc_type_text" | "pc_shutdown" | "pc_restart" | "complex_task" | "chitchat",
  "targetEmployee": "Amina" | "Hira" | "Shanza" | "all" | null,
  "taskDescription": "a short, clear description of the real task, or null",
  "controlActionType": "pause" | "resume" | "stop" | null,
  "fileQuery": "the filename or search term the user mentioned, or null",
  "directoryName": "desktop" | "documents" | "downloads" | "fexusWorkspace" | null,
  "applicationName": "the application the user named, lowercase, or null",
  "searchQuery": "the real search text for pc_search_in_application, or null",
  "mouseTarget": "a description like 'center of the screen', 'top left corner', or null — used for pc_mouse_move",
  "typeText": "the exact literal text to type, or null — used for pc_type_text",
  "requiresConfirmation": true or false,
  "spokenResponse": "a short, natural 1-2 sentence response FEXUS should say out loud right now — MUST be in Urdu script (اردو), never English, unless the Owner has explicitly asked for English in this conversation. Real technical names stay in English within the Urdu sentence (Gmail, WhatsApp, Google, Hira, Shanza, FEXUS, etc.) — only the surrounding sentence must be Urdu. Example: 'جی، Gmail کھول رہا ہوں۔' not 'Opening Gmail.'"
}

requiresConfirmation must be true ONLY for irreversible/sensitive actions: publishing, deployment, deleting data, sending external messages, payments, credential changes, pc_shutdown, and pc_restart. It must be false for ordinary task assignment, status checks, gathering, and opening/searching/showing files.`

  const messages = [...(conversationHistory || []).slice(-6), { role: 'user', content: transcript }]
  const { text, usage } = await generateTextWithUsage(system, messages, 500)
  let parsed
  try {
    parsed = extractJson(text)
  } catch (err) {
    // Real fix: log the raw model response for real debugging (dev
    // console only — never sent to the Owner as the primary error), per
    // the explicit requirement not to silently swallow this. Still
    // reports a real, honest, non-technical error to the caller.
    console.error('[voiceAgent] Failed to parse a structured response. Raw model output:', text)
    console.error('[voiceAgent] Real parse error:', err.message)
    const e = new Error('Voice Agent could not parse a structured response — try rephrasing.'); e.status = 502; throw e
  }
  return { parsed, usage }
}

/** Real, deterministic resolution of a plain-language screen position
 * into normalized (0–1) coordinates — no LLM call needed for this small,
 * fixed vocabulary. Defaults to center for anything unrecognized, which
 * is always a safe, on-screen target. */
function resolveMouseTarget(description) {
  const d = (description || '').toLowerCase()
  const POSITIONS = {
    'top left': [0.1, 0.1], 'top right': [0.9, 0.1],
    'bottom left': [0.1, 0.9], 'bottom right': [0.9, 0.9],
    'top': [0.5, 0.1], 'bottom': [0.5, 0.9],
    'left': [0.1, 0.5], 'right': [0.9, 0.5],
    'center': [0.5, 0.5], 'middle': [0.5, 0.5]
  }
  for (const [key, coords] of Object.entries(POSITIONS)) {
    if (d.includes(key)) return coords
  }
  return [0.5, 0.5]
}

router.post('/command', requireAuth, async (req, res) => {
  try {
    const { transcript, conversationHistory, confirmed } = req.body || {}
    if (!transcript?.trim()) return res.status(400).json({ error: 'transcript is required' })

    // Wake-word stripping happens exactly ONCE, here, so both the
    // deterministic fast path and the Groq fallback operate on the
    // identical, already-normalized text — not two different views of
    // the same command.
    const normalized = stripWakeWord(transcript)

    // Real cost/latency optimization: try the deterministic fast path
    // first — only calls Groq if the command doesn't match one of the
    // handful of simple, unambiguous phrasings.
    const parsed = tryDeterministicRoute(normalized) || (await parseCommand(normalized, conversationHistory)).parsed

    // Real safety gate — an action marked as requiring confirmation is
    // NEVER executed on the first pass, regardless of what the parsed
    // intent says to do. The frontend must send confirmed:true (after
    // the user explicitly says yes) before this proceeds to Step 2.
    if (parsed.requiresConfirmation && !confirmed) {
      return res.json({
        ...parsed,
        executed: false,
        awaitingConfirmation: true
      })
    }

    let result = { executed: false }

    if (parsed.intent === 'assign_task' && parsed.targetEmployee && ['Hira', 'Shanza'].includes(parsed.targetEmployee)) {
      const employee = await findEmployeeByName(parsed.targetEmployee)
      if (employee) {
        // Real fix: this used to write directly to Prisma, bypassing the
        // real Workflow Engine's own logHistory()/notify() side effects
        // — the exact same gap already found and fixed in taskEngine.js's
        // assign_to_employee. Now creates the real history entry and
        // notification too, so a task assigned by voice looks identical
        // (in the real Workflow Detail UI) to one created through the
        // normal "Submit a task" form.
        const departmentKey = parsed.targetEmployee === 'Hira' ? 'marketing' : 'website'
        const workflow = await prisma.workflow.create({
          data: {
            title: parsed.taskDescription || transcript,
            departmentKey,
            status: 'Created',
            priority: 'Medium',
            createdByLabel: 'Owner (via Voice Agent)'
          }
        })
        await logHistory({ workflowId: workflow.id, action: 'Created', toStatus: 'Created', actorLabel: 'Owner (via Voice Agent)', department: departmentKey })
        await prisma.workflowStage.create({
          data: {
            workflowId: workflow.id,
            title: parsed.taskDescription || transcript,
            status: 'Assigned',
            assigneeEmployeeId: employee.id,
            assigneeLabel: employee.name,
            order: 0
          }
        })
        await prisma.workflow.update({ where: { id: workflow.id }, data: { status: 'Assigned' } })
        await logHistory({ workflowId: workflow.id, action: 'Stage Assigned', fromStatus: 'Created', toStatus: 'Assigned', actorLabel: 'Owner (via Voice Agent)', department: departmentKey })
        await notify({ workflowId: workflow.id, recipientLabel: employee.name, recipientEmployeeId: employee.id, message: `New task assigned by voice: "${parsed.taskDescription || transcript}"`, type: 'info' })
        result = { executed: true, workflowId: workflow.id, assignedTo: employee.name }
      }
    } else if (parsed.intent === 'status_query' && parsed.targetEmployee && ['Hira', 'Shanza', 'Amina'].includes(parsed.targetEmployee)) {
      const employee = await findEmployeeByName(parsed.targetEmployee)
      if (employee) {
        const activeStage = await prisma.workflowStage.findFirst({
          where: { assigneeEmployeeId: employee.id, status: { notIn: ['Completed', 'Cancelled'] } },
          orderBy: { createdAt: 'desc' }
        })
        result = { executed: true, status: activeStage ? activeStage.title : 'Idle — no active task right now' }
      }
    } else if (parsed.intent === 'control_action' && parsed.controlActionType) {
      // Real disambiguation, never a guess: checks BOTH controllable
      // systems (email campaigns AND real multi-step AgentTasks —
      // "Usman, stop" per spec section 23 must be able to pause a
      // running task, not just a campaign). Only acts if there is
      // EXACTLY ONE controllable thing across both systems combined;
      // otherwise reports back honestly instead of guessing which one.
      if (parsed.controlActionType === 'pause' || parsed.controlActionType === 'stop') {
        const [runningCampaigns, runningTasks] = await Promise.all([
          prisma.emailCampaign.findMany({ where: { userId: req.user.id, status: 'Running' } }),
          prisma.agentTask.findMany({ where: { userId: req.user.id, status: 'RUNNING' } })
        ])
        const total = runningCampaigns.length + runningTasks.length
        if (total === 1 && runningCampaigns.length === 1) {
          await prisma.emailCampaign.update({ where: { id: runningCampaigns[0].id }, data: { status: 'Paused' } })
          await campaignLog(runningCampaigns[0].id, 'Campaign Paused', 'Paused by voice command.')
          result = { executed: true, campaignName: runningCampaigns[0].name }
        } else if (total === 1 && runningTasks.length === 1) {
          const taskEngine = require('../taskEngine')
          // Real distinction: "pause" is graceful (finishes the current
          // step, doesn't start the next); "stop" is a genuine emergency
          // stop — it aborts whatever real action is in flight right
          // now, not just prevents the next one.
          if (parsed.controlActionType === 'stop') {
            await taskEngine.stopTask(runningTasks[0].id)
          } else {
            await taskEngine.pauseTask(runningTasks[0].id)
          }
          result = { executed: true, taskGoal: runningTasks[0].goal }
        } else {
          result = { executed: false, reason: total === 0 ? 'اس وقت کچھ بھی چل نہیں رہا۔' : `${total} چیزیں چل رہی ہیں (campaigns اور/یا tasks) — بتائیں کون سی؟` }
        }
      } else if (parsed.controlActionType === 'resume') {
        const [pausedCampaigns, pausedTasks] = await Promise.all([
          prisma.emailCampaign.findMany({ where: { userId: req.user.id, status: 'Paused' } }),
          prisma.agentTask.findMany({ where: { userId: req.user.id, status: { in: ['PAUSED', 'STOPPED'] } } })
        ])
        const total = pausedCampaigns.length + pausedTasks.length
        if (total === 1 && pausedCampaigns.length === 1) {
          await prisma.emailCampaign.update({ where: { id: pausedCampaigns[0].id }, data: { status: 'Running' } })
          await prisma.emailCampaignQueue.upsert({ where: { campaignId: pausedCampaigns[0].id }, update: { isProcessing: false }, create: { campaignId: pausedCampaigns[0].id } })
          await campaignLog(pausedCampaigns[0].id, 'Campaign Resumed', 'Resumed by voice command.')
          result = { executed: true, campaignName: pausedCampaigns[0].name }
        } else if (total === 1 && pausedTasks.length === 1) {
          const taskEngine = require('../taskEngine')
          await taskEngine.resumeTask(pausedTasks[0].id)
          result = { executed: true, taskGoal: pausedTasks[0].goal }
        } else {
          result = { executed: false, reason: total === 0 ? 'اس وقت کچھ بھی رکا ہوا نہیں ہے۔' : `${total} چیزیں رکی ہوئی ہیں (campaigns اور/یا tasks) — بتائیں کون سی؟` }
        }
      }
    } else if (parsed.intent === 'gather') {
      // Deliberately no backend write — gathering is a pure office
      // interaction/visual state, not a business-state change (see the
      // architectural rule: the 3D layer is never the source of truth,
      // but it's also not required to write to it for things that
      // genuinely aren't business state).
      result = { executed: true, gathered: parsed.targetEmployee === 'all' ? ['Amina', 'Hira', 'Shanza'] : [parsed.targetEmployee] }
    } else if (parsed.intent === 'complex_task') {
      // Hands off to the real Task Engine (taskEngine.js) — a genuine,
      // saved, multi-step plan, not executed inline here. The engine's
      // own tick driver advances it; this just kicks off planning and
      // reports the real plan back immediately.
      try {
        const taskEngine = require('../taskEngine')
        const task = await taskEngine.planTask(req.user.id, transcript)
        result = { executed: true, taskId: task.id, stepCount: task.steps.length, plan: task.steps.map((s) => s.description) }
      } catch (taskErr) {
        result = { executed: false, error: taskErr.message }
      }
    } else if (parsed.intent?.startsWith('pc_')) {
      // Every PC intent relays through the SAME real security gate
      // (routes/localAgent.js's relayCommand) — a real, stored
      // permission check first, then the real Local Agent's own
      // directory allowlist as a second, independent check.
      try {
        if (parsed.intent === 'pc_show_files') {
          const files = await relayCommand(req.user.id, `/desktop-files`, {}, 'allowDesktop')
          result = { executed: true, files }
        } else if (parsed.intent === 'pc_search_files') {
          const matches = await relayCommand(req.user.id, '/search-files', { query: parsed.fileQuery, directoryName: parsed.directoryName }, 'allowReadMetadata')
          result = { executed: true, matches }
        } else if (parsed.intent === 'pc_open_file') {
          const opened = await relayCommand(req.user.id, '/open-file', { filePath: parsed.fileQuery }, 'allowOpenFiles')
          result = { executed: true, ...opened }
        } else if (parsed.intent === 'pc_open_folder') {
          const opened = await relayCommand(req.user.id, '/open-folder', { folderPath: parsed.directoryName }, 'allowOpenFolders')
          result = { executed: true, ...opened }
        } else if (parsed.intent === 'pc_open_application') {
          const opened = await relayCommand(req.user.id, '/open-application', { name: parsed.applicationName }, 'allowOpenApplications')
          result = { executed: true, ...opened }
        } else if (parsed.intent === 'pc_search_in_application') {
          const opened = await relayCommand(req.user.id, '/search-in-application', { name: parsed.applicationName, query: parsed.searchQuery }, 'allowOpenUrls')
          result = { executed: true, ...opened }
        } else if (parsed.intent === 'pc_new_tab') {
          const opened = await relayCommand(req.user.id, '/new-tab', {}, 'allowOpenApplications')
          result = { executed: true, ...opened }
        } else if (parsed.intent === 'pc_mouse_move') {
          // Resolves a plain-language description ("center of the
          // screen") against the REAL screen size, read fresh from the
          // Local Agent — never a guessed/hardcoded resolution.
          const screenInfo = await relayCommand(req.user.id, '/screen-info', {}, 'allowMouseControl')
          const [nx, ny] = resolveMouseTarget(parsed.mouseTarget)
          const target = { x: Math.round(screenInfo.screen.width * nx), y: Math.round(screenInfo.screen.height * ny) }
          const moved = await relayCommand(req.user.id, '/mouse-move', target, 'allowMouseControl')
          result = { executed: true, ...moved }
        } else if (parsed.intent === 'pc_type_text') {
          if (!parsed.typeText) throw new Error('No text was recognized to type.')
          const typed = await relayCommand(req.user.id, '/type-text', { text: parsed.typeText }, 'allowKeyboardControl')
          result = { executed: true, ...typed }
        } else if (parsed.intent === 'pc_shutdown') {
          const done = await relayCommand(req.user.id, '/shutdown', { confirmed: true }, 'allowShutdown')
          result = { executed: true, ...done }
        } else if (parsed.intent === 'pc_restart') {
          const done = await relayCommand(req.user.id, '/restart', { confirmed: true }, 'allowRestart')
          result = { executed: true, ...done }
        }
      } catch (pcErr) {        // A failed PC action is real, structured, spoken information —
        // never a silent failure, exactly as required.
        result = { executed: false, error: pcErr.message }
      }
    }

    res.json({ ...parsed, ...result })
  } catch (err) {
    console.error(err)
    res.status(err.status || 500).json({ error: err.message || 'Voice command failed' })
  }
})

module.exports = router
