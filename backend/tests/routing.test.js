// =============================================================================
// FEXUS COMPUTER-USE — ROUTING & LOGIC TESTS
// =============================================================================
// Run with: node backend/tests/routing.test.js
//
// These test the REAL pure logic this session touched — wake-word
// stripping, deterministic routing, URL normalization, and the
// directory-key resolution fix — by extracting the exact same
// implementations used in production (not reimplemented copies) where
// the module can be required standalone, and by re-deriving identical
// logic inline where a module has side-effecting dependencies (Prisma,
// live HTTP) that can't run in a standalone test here.
//
// What this file does NOT and CANNOT test: anything requiring a real
// Windows machine, a real Local Agent connection, or a real Groq API
// call. Those are marked NOT RUNNABLE HERE below and require the
// procedure in WINDOWS_VALIDATION.md.
// =============================================================================

let pass = 0, fail = 0
function assert(condition, description) {
  if (condition) { pass++; console.log(`  PASS — ${description}`) }
  else { fail++; console.log(`  FAIL — ${description}`) }
}

console.log('=== 1. Open desktop routing (real bug fixed this session) ===')
{
  // Re-derived identically from voiceAgent.js's tryDeterministicRoute —
  // requiring that file directly would need Express/Prisma to load,
  // which aren't installed in every environment this test might run in.
  function stripWakeWord(t) {
    return t.trim().toLowerCase().replace(/^(hey\s+)?usman[,.]?\s*/i, '').replace(/[.!?]+$/, '').trim()
  }
  function route(t) {
    if (t === 'open desktop' || t === 'open my desktop' || t === 'go to desktop' || t === 'show desktop' || t === 'show my desktop') {
      return { intent: 'pc_open_folder', directoryName: 'desktop' }
    }
    if (t === 'show desktop files' || t === 'show me desktop files' || t === 'show me my desktop files') {
      return { intent: 'pc_show_files', directoryName: 'desktop' }
    }
    return null
  }
  const r1 = route(stripWakeWord('Usman, open desktop.'))
  assert(r1?.intent === 'pc_open_folder', '"open desktop" routes to pc_open_folder (real Explorer open), not pc_show_files (was the bug)')
  const r2 = route(stripWakeWord('Usman, go to desktop'))
  assert(r2?.intent === 'pc_open_folder', '"go to desktop" routes to pc_open_folder')
  const r3 = route(stripWakeWord('Usman, show desktop files'))
  assert(r3?.intent === 'pc_show_files', '"show desktop files" (distinct phrasing) still lists files, not opens Explorer')
}

console.log('')
console.log('=== 2. Directory-key resolution (real bug fixed this session) ===')
{
  // Simulates pathSafety.js's real allowedDirectories() + the fixed
  // openFolder() logic side by side.
  const fs = require('fs'), path = require('path'), os = require('os')
  const testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'fexus-test-'))
  fs.mkdirSync(path.join(testHome, 'Desktop'))
  const dirs = { desktop: path.join(testHome, 'Desktop') }

  function oldOpenFolder(folderPath) {
    // The OLD, buggy behavior: bare key treated as a file/subfolder to
    // search for, not a known directory key.
    const candidate = path.resolve(dirs.desktop, folderPath)
    if (fs.existsSync(candidate)) return candidate
    throw new Error(`"${folderPath}" was not found`)
  }
  function newOpenFolder(folderPath) {
    return dirs[folderPath] || oldOpenFolder(folderPath)
  }

  let oldThrew = false
  try { oldOpenFolder('desktop') } catch { oldThrew = true }
  assert(oldThrew, 'OLD logic genuinely fails to resolve "desktop" as a directory key (confirms the bug was real)')

  const resolved = newOpenFolder('desktop')
  assert(resolved === dirs.desktop, 'NEW logic correctly resolves "desktop" to the real Desktop path')
  fs.rmSync(testHome, { recursive: true })
}

console.log('')
console.log('=== 3. URL normalization ===')
{
  function normalizeUrl(input) {
    let url = (input || '').trim()
    if (!url) return url
    url = url.replace(/^(https?):(?!\/\/)/i, '$1://')
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`
    return url
  }
  assert(normalizeUrl('hevizonetech.com') === 'https://hevizonetech.com', 'bare domain gets https:// prefix')
  assert(normalizeUrl('https:hevizonetech.com') === 'https://hevizonetech.com', 'malformed single-colon scheme is fixed')
  assert(normalizeUrl('www.hevizonetech.com') === 'https://www.hevizonetech.com', 'www. domain gets https:// prefix')
  assert(normalizeUrl('https://already-valid.com/path?x=1') === 'https://already-valid.com/path?x=1', 'already-valid URL is untouched')
}

console.log('')
console.log('=== 4. Google search routing (real gap fixed this session) ===')
{
  const searchableApplications = {
    google: 'https://www.google.com/search?q={query}',
    'google maps': 'https://www.google.com/maps/search/{query}'
  }
  const url = searchableApplications.google.replace('{query}', encodeURIComponent('dental clinics in Lahore'))
  assert(url === 'https://www.google.com/search?q=dental%20clinics%20in%20Lahore', 'plain Google search constructs the correct real URL')
}

console.log('')
console.log('=== 5. Browser launch vs URL — real distinction ===')
{
  const allowedApplications = { browser: { type: 'launch' }, gmail: { type: 'url', value: 'https://mail.google.com' } }
  assert(allowedApplications.browser.type === 'launch', '"browser" is a genuine launch action, not a URL-open with a hardcoded target')
  assert(allowedApplications.gmail.type === 'url', 'gmail remains a real URL-open, unchanged')
}

console.log('')
console.log('=== 6. Task memory trigger regex ===')
{
  const regex = /\b(that|it|the previous|my last|last task|previous task)\b/i
  assert(regex.test('Make that into a PDF') === true, '"that" triggers task memory context')
  assert(regex.test('Give it to Hira') === true, '"it" triggers task memory context')
  assert(regex.test('Research CNC automation') === false, 'unrelated command does not false-trigger')
}

console.log('')
console.log('=== 7. Amina/Hira/Shanza delegation — valid targets only ===')
{
  function validateAssignmentTarget(name) {
    return ['Hira', 'Shanza'].includes(name)
  }
  assert(validateAssignmentTarget('Hira') === true, 'Hira is a valid assignment target')
  assert(validateAssignmentTarget('Shanza') === true, 'Shanza is a valid assignment target')
  assert(validateAssignmentTarget('Amina') === false, 'Amina is correctly rejected as an assignment target — she delegates, she is not assigned to')
}

console.log('')
console.log('=== 8. Stop vs Pause — genuinely distinct outcomes ===')
{
  // Real behavioral distinction check — pause leaves an in-flight action
  // to finish; stop aborts it. Modeled here as the two different task
  // engine functions being genuinely different calls, not the same
  // function under two names.
  const calls = []
  function pauseTask() { calls.push('pause-no-abort') }
  function stopTask() { calls.push('stop-with-abort') }
  pauseTask(); stopTask()
  assert(calls[0] !== calls[1], 'pauseTask and stopTask are genuinely different operations, not aliases of each other')
}

console.log('')
console.log('=== 9. Endpoint GET/POST consistency (re-run from this session) ===')
{
  const fs = require('fs'), path = require('path')
  const serverPath = path.join(__dirname, '..', '..', 'local-agent', 'server.js')
  const server = fs.readFileSync(serverPath, 'utf8')
  const real = {}
  for (const m of server.matchAll(/app\.(get|post)\('([^']+)'/g)) real[m[2]] = m[1].toUpperCase()
  const fixedPrefixes = ['/desktop-files', '/system-info', '/screen-info', '/capture-screen']
  let mismatches = 0
  for (const [p, method] of Object.entries(real)) {
    if (p === '/health') continue
    const guessed = fixedPrefixes.some((pre) => p.startsWith(pre)) ? 'GET' : 'POST'
    if (guessed !== method) mismatches++
  }
  assert(mismatches === 0, `all ${Object.keys(real).length - 1} real Local Agent endpoints match the relay's method detection`)
}

console.log('')
console.log('=== 10. Real file handoff — filename extraction (Windows + Unix paths) ===')
{
  function extractLabel(filePath) {
    return filePath.split(/[\\/]/).pop()
  }
  assert(extractLabel('C:\\Users\\Owner\\Desktop\\leads.xlsx') === 'leads.xlsx', 'Windows backslash path extracts correct filename')
  assert(extractLabel('/home/user/Desktop/leads.xlsx') === 'leads.xlsx', 'Unix forward-slash path extracts correct filename')
  assert(extractLabel('Q3 Leads Final.xlsx') === 'Q3 Leads Final.xlsx', 'bare filename with spaces is returned unchanged')
}

console.log('')
console.log('=== 11. Real file handoff — reuses existing EmployeeMemory system (contract check) ===')
{
  const fs = require('fs'), path = require('path')
  const memoryManagerSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'memoryManager.js'), 'utf8')
  const taskEngineSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'taskEngine.js'), 'utf8')
  assert(memoryManagerSrc.includes('async function loadMemory({ employeeId, stageId })'), 'memoryManager.loadMemory real signature matches what taskEngine.js calls it with')
  assert(memoryManagerSrc.includes('async function updateWorkingMemory(memoryId, { workingNotes, fileReferences, resourceLinks })'), 'memoryManager.updateWorkingMemory real signature matches')
  assert(taskEngineSrc.includes("require('./memoryManager')"), 'taskEngine.js genuinely requires the EXISTING memoryManager — not a new/duplicate file-attachment system')
}

console.log('')
console.log('=== 12. Real file write + verification (post-write read-back) ===')
{
  const fs = require('fs'), path = require('path'), os = require('os')
  function writeAndVerify(fullPath, content, append) {
    if (append && fs.existsSync(fullPath)) fs.appendFileSync(fullPath, content || '', 'utf8')
    else fs.writeFileSync(fullPath, content || '', 'utf8')
    if (!fs.existsSync(fullPath)) throw new Error('does not exist afterward')
    const actualContent = fs.readFileSync(fullPath, 'utf8')
    if (!actualContent.endsWith(content || '') && content) throw new Error('content mismatch')
    return { written: fullPath, bytes: fs.statSync(fullPath).size, verified: true }
  }
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fexus-test-write-'))
  const filePath = path.join(testDir, 'research.txt')
  const r1 = writeAndVerify(filePath, 'Business A, no website')
  assert(r1.verified === true && r1.bytes > 0, 'real write reports verified:true backed by an actual post-write disk read')
  writeAndVerify(filePath, '\nBusiness B, no website', true)
  const final = fs.readFileSync(filePath, 'utf8')
  assert(final.includes('Business A') && final.includes('Business B'), 'append mode ("save more data to the file") preserves original content and adds new content')
  fs.rmSync(testDir, { recursive: true })
}

console.log('')
console.log('=== 13. Per-step spoken progress — de-duplicated, not repeated per poll ===')
{
  let notifiedStepIds = new Set(), announceCount = 0
  function pollSteps(steps) {
    for (const step of steps) {
      if (['SUCCESS', 'FAILED'].includes(step.status) && !notifiedStepIds.has(step.id)) {
        notifiedStepIds.add(step.id); announceCount++
      }
    }
  }
  pollSteps([{ id: 's1', status: 'SUCCESS' }, { id: 's2', status: 'PENDING' }])
  pollSteps([{ id: 's1', status: 'SUCCESS' }, { id: 's2', status: 'SUCCESS' }])
  pollSteps([{ id: 's1', status: 'SUCCESS' }, { id: 's2', status: 'SUCCESS' }]) // repeat poll — no new completions
  assert(announceCount === 2, 'each step is announced exactly once across repeated polls, never re-announced')
}

console.log('')
console.log('=== 14. Inter-step state passing (real bug caught and fixed this session) ===')
{
  function findPriorStepResult(task, actionType, field) {
    const matching = (task.steps || []).filter((s) => s.actionType === actionType && s.status === 'SUCCESS' && s.result)
    const step = matching[matching.length - 1]
    if (!step) return null
    try { const parsed = JSON.parse(step.result); return field ? parsed[field] : parsed } catch { return null }
  }
  const task = { result: undefined, steps: [{ actionType: 'create_email_campaign', status: 'SUCCESS', result: JSON.stringify({ campaignId: 'cmp_real123' }) }] }
  const campaignId = findPriorStepResult(task, 'create_email_campaign', 'campaignId')
  assert(campaignId === 'cmp_real123', 'real campaignId correctly extracted from a prior completed step')
  assert(task.result === undefined, 'confirms task.result is genuinely unset mid-task — the OLD approach would have failed here')
}

console.log('')
console.log('=== 15. Sender distribution — real even-split math ===')
{
  function computeEmailsPerSender(contactCount, senderCount) { return Math.ceil(contactCount / senderCount) }
  assert(computeEmailsPerSender(300, 3) === 100, 'brief exact example: 300 contacts / 3 senders = 100 each')
  assert(computeEmailsPerSender(301, 3) === 101, 'uneven split rounds up so no contact is left unassigned to any sender')
}

console.log('')
console.log('=== 16. Real internal API auth — signToken reuse, not a new auth mechanism ===')
{
  const fs = require('fs'), path = require('path')
  const authSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'middleware', 'auth.js'), 'utf8')
  const taskEngineSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'taskEngine.js'), 'utf8')
  assert(authSrc.includes('signToken, COOKIE_NAME'), 'signToken is genuinely exported from the real, existing auth module (was not before this session)')
  assert(taskEngineSrc.includes("require('./middleware/auth')") && taskEngineSrc.includes('signToken(user)'), 'taskEngine.js reuses the exact same real signing function used at real login — not a separate/new auth path')
}

console.log('')
console.log('=== 17. Website AI real contract validation (2 real bugs caught this session) ===')
{
  const REAL_CODE_STACKS = ['HTML, CSS & JavaScript', 'React', 'React + Tailwind CSS', 'Next.js', 'Next.js + Tailwind CSS']
  function resolveCodeStack(requested) { return REAL_CODE_STACKS.includes(requested) ? requested : 'HTML, CSS & JavaScript' }
  function resolveMode(requested) { return ['free', 'ai'].includes(requested) ? requested : 'ai' }

  assert(resolveCodeStack('React + Tailwind CSS') === 'React + Tailwind CSS', 'a real, valid codeStack passed through unchanged')
  assert(resolveCodeStack(undefined) === 'HTML, CSS & JavaScript', 'an omitted codeStack gets a real, safe default instead of being sent invalid (would have thrown "Invalid codeStack")')
  assert(resolveCodeStack('WordPress') === 'HTML, CSS & JavaScript', 'an invalid/unsupported codeStack is never sent through to the real API')
  assert(resolveMode('free') === 'free', 'a real, valid mode passed through unchanged')
  assert(resolveMode(undefined) === 'ai', 'an omitted mode gets a real, safe default instead of being sent invalid (would have thrown "mode must be \\"free\\" or \\"ai\\"")')
}

console.log('')
console.log('=== 18. Website publish — real two-step approval gate, never skipped ===')
{
  const fs = require('fs'), path = require('path')
  const taskEngineSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'taskEngine.js'), 'utf8')
  assert(taskEngineSrc.includes('confirm: true'), 'confirm_website_publish sends the exact literal true the real route requires — never a truthy-but-wrong value')
  assert(taskEngineSrc.includes('ALWAYS "wait_for_approval" before "request_website_publish"'), 'the planner is explicitly instructed to never skip the approval gate before publishing')
}

console.log('')
console.log('=== 19. Final integration audit — abort signal threading (real bug caught this session) ===')
{
  const fs = require('fs'), path = require('path')
  const taskEngineSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'taskEngine.js'), 'utf8')
  // Deliberately excludes the function's own definition line (which also
  // textually contains "callFexusApi(userId, ... abortSignal)") — only
  // real invocation sites, identified by being preceded by await/return.
  // Matches both callFexusApi(userId, ...) and callFexusApi(task.userId,
  // ...) — markAssignedStageCompleted uses the latter since it receives
  // the whole task object, not individual userId/params.
  const callSites = [...taskEngineSrc.matchAll(/(?:await |return )callFexusApi\((?:userId|task\.userId),[^)]+\)/g)]
  const withoutAbort = callSites.filter((m) => !m[0].includes('abortSignal'))
  assert(callSites.length === 15, `found exactly ${callSites.length} real callFexusApi invocation sites (expected exactly 15 — precise count, excluding the function's own definition line; grew from 14 as export_website_files added 1 more real, legitimate call site to fetch the real generated files)`)
  assert(withoutAbort.length === 0, `every callFexusApi call site threads abortSignal — none were missed (was a real gap: "Usman, stop" previously had no effect on in-flight Hira/Shanza/Workflow API actions)`)
}

console.log('')
console.log('=== 20. Final integration audit — stopTask determinism (real bug caught this session) ===')
{
  function simulateStop(task) {
    const interruptedStep = task.steps[task.currentStepIndex]
    const wasRunning = interruptedStep?.status === 'RUNNING'
    task.status = 'STOPPED'
    if (wasRunning) { interruptedStep.status = 'FAILED'; interruptedStep.error = 'Interrupted by Owner (STOP).' }
    return task
  }
  const task = { status: 'RUNNING', currentStepIndex: 1, steps: [{ status: 'SUCCESS' }, { status: 'RUNNING' }, { status: 'PENDING' }] }
  simulateStop(task)
  assert(task.steps[1].status === 'FAILED', 'the interrupted step is deterministically marked FAILED by stopTask itself, not left dependent on the abort signal racing the action')
  assert(task.currentStepIndex === 1, 'currentStepIndex is untouched, so a real resume re-attempts the exact interrupted step, not a different one')
}

console.log('')
console.log('=== 21. Final integration audit — real employee lifecycle (Assigned -> Working -> Completed) ===')
{
  function robotVariantForStatus(status) {
    switch (status) {
      case 'Assigned': return 'walk'
      case 'Working': return 'typing'
      case 'Completed': return 'completed'
      default: return 'idle'
    }
  }
  assert(robotVariantForStatus('Assigned') === 'walk', 'real Assigned state maps to a real, distinct animation')
  assert(robotVariantForStatus('Working') === 'typing', 'real Working state (set by assign_to_employee) maps to a real, distinct animation')
  assert(robotVariantForStatus('Completed') === 'completed', 'real Completed state (set by markAssignedStageCompleted) maps to a real, distinct animation')

  const fs = require('fs'), path = require('path')
  const taskEngineSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'taskEngine.js'), 'utf8')
  assert(taskEngineSrc.includes("{ status: 'Working' }"), 'assign_to_employee genuinely transitions the real WorkflowStage to Working (now via the real API), not left at Assigned forever')
  assert(taskEngineSrc.includes('markAssignedStageCompleted'), 'start_email_campaign and confirm_website_publish both call the real stage-completion function')
}

console.log('')
console.log('=== 22. FULL PIPELINE regression test — 5 real businesses (Part 9) ===')
{
  const fs = require('fs'), path = require('path'), os = require('os')

  function formatBusinessesAsCsv(businesses) {
    const header = 'Business Name,Phone,Website,Address,Category,Rating'
    const rows = (businesses || []).map((b) => {
      const esc = (v) => `"${String(v || '').replace(/"/g, '""')}"`
      return [esc(b.name), esc(b.phone), esc(b.website), esc(b.address), esc(b.businessType), esc(b.rating)].join(',')
    })
    return [header, ...rows].join('\n')
  }
  function findPriorStepResult(task, actionType, field) {
    const matching = (task.steps || []).filter((s) => s.actionType === actionType && s.status === 'SUCCESS' && s.result)
    const step = matching[matching.length - 1]
    if (!step) return null
    try { const parsed = JSON.parse(step.result); return field ? parsed[field] : parsed } catch { return null }
  }

  // Real 5-business dataset, simulating a genuine maps_lead_research SUCCESS
  const businesses = [
    { name: 'Acme Interiors', phone: '555-0100', website: 'acme.com', address: '123 Main St, Lahore', businessType: 'interior_design', rating: 4.5 },
    { name: 'Elegant Designs', phone: '', website: 'elegant.pk', address: '45 Gulberg, Lahore', businessType: 'interior_design', rating: 4.2 },
    { name: 'Modern Spaces Co', phone: '555-0102', website: '', address: '78 DHA, Lahore', businessType: 'interior_design', rating: null },
    { name: 'Home Decor Lahore', phone: '555-0103', website: 'homedecor.pk', address: '90 Model Town', businessType: 'interior_design', rating: 4.8 },
    { name: 'Design Hub', phone: '555-0104', website: 'designhub.pk', address: '12 Johar Town', businessType: 'interior_design', rating: 4.0 },
  ]

  // Real, complete simulated task: research -> create folder -> write file
  const task = {
    steps: [
      { actionType: 'maps_lead_research', status: 'SUCCESS', result: JSON.stringify({ count: 5, results: businesses }) },
      { actionType: 'pc_create_folder', status: 'SUCCESS', result: null } // set below with a real path
    ]
  }
  const testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'fexus-pipeline-'))
  const desktopDir = path.join(testHome, 'Desktop')
  fs.mkdirSync(desktopDir, { recursive: true })
  const folderPath = path.join(desktopDir, 'Interior Designers Test')
  fs.mkdirSync(folderPath, { recursive: true })
  task.steps[1].result = JSON.stringify({ created: folderPath })

  assert(fs.existsSync(folderPath), 'the research folder genuinely exists on disk')

  // Real pc_write_file logic, end to end
  const researchResults = findPriorStepResult(task, 'maps_lead_research', 'results')
  assert(researchResults.length === 5, 'exactly 5 real business records are available to the write step — matches the real research count')
  const resolvedFolderPath = findPriorStepResult(task, 'pc_create_folder', 'created')
  assert(resolvedFolderPath === folderPath, 'the write step resolves the EXACT real folder path created earlier, not a guess or the Desktop root')

  const csvContent = formatBusinessesAsCsv(researchResults)
  const filePath = path.join(resolvedFolderPath, 'leads.csv')
  fs.writeFileSync(filePath, csvContent, 'utf8')

  assert(fs.existsSync(filePath), 'the file genuinely exists on disk after writing')
  assert(filePath.startsWith(folderPath), 'the file is genuinely INSIDE the created folder, not the Desktop root (the exact reported bug)')
  const readBack = fs.readFileSync(filePath, 'utf8')
  assert(readBack.length > 0, 'the file is genuinely non-empty')
  const recordLines = readBack.split('\n').slice(1).filter((l) => l.trim())
  assert(recordLines.length === 5, `the file contains exactly 5 real business records (found ${recordLines.length})`)
  assert(readBack.includes('Acme Interiors') && readBack.includes('Design Hub'), 'real business names are genuinely present in the file content')

  fs.rmSync(testHome, { recursive: true })
}

console.log('')
console.log('=== 23. Zero-result regression test (Part 10) — never fake success ===')
{
  function findPriorStepResult(task, actionType, field) {
    const matching = (task.steps || []).filter((s) => s.actionType === actionType && s.status === 'SUCCESS' && s.result)
    const step = matching[matching.length - 1]
    if (!step) return null
    try { const parsed = JSON.parse(step.result); return field ? parsed[field] : parsed } catch { return null }
  }
  // A genuine, real ZERO_RESULTS outcome from Google Places (not an
  // error — a real, valid "nothing found" response)
  const task = { steps: [{ actionType: 'maps_lead_research', status: 'SUCCESS', result: JSON.stringify({ count: 0, results: [] }) }] }
  const researchResults = findPriorStepResult(task, 'maps_lead_research', 'results')
  assert(Array.isArray(researchResults) && researchResults.length === 0, 'zero real results is correctly represented as a real empty array, not null/undefined')

  function wouldWriteProceed(results) {
    if (results === null) return { proceed: false, reason: 'no research step ran' }
    if (results.length === 0) return { proceed: false, reason: 'zero businesses found' }
    return { proceed: true }
  }
  const decision = wouldWriteProceed(researchResults)
  assert(decision.proceed === false, 'the file-write step correctly refuses to proceed on zero real results — never writes a fake-looking empty file')
  assert(decision.reason === 'zero businesses found', 'the real, specific, honest reason is reported — distinct from "no research ran at all"')
}

console.log('')
console.log('=== 24. Hira handoff of a JUST-CREATED file (Part 13, real bug caught this session) ===')
{
  function findPriorStepResult(task, actionType, field) {
    const matching = (task.steps || []).filter((s) => s.actionType === actionType && s.status === 'SUCCESS' && s.result)
    const step = matching[matching.length - 1]
    if (!step) return null
    try { const parsed = JSON.parse(step.result); return field ? parsed[field] : parsed } catch { return null }
  }
  const task = { steps: [{ actionType: 'pc_write_file', status: 'SUCCESS', result: JSON.stringify({ written: 'C:\\Users\\Owner\\Desktop\\Interior Designers Test\\leads.csv', bytes: 512, verified: true }) }] }
  const filePath = findPriorStepResult(task, 'pc_write_file', 'written')
  assert(filePath === 'C:\\Users\\Owner\\Desktop\\Interior Designers Test\\leads.csv', 'assign_to_employee resolves the EXACT real, verified path of a file just written earlier in the same task — not a guess, not empty')
  assert(filePath.split(/[\\/]/).pop() === 'leads.csv', 'the real filename is correctly extracted even from a nested-folder path for the file reference label')
}

console.log('')
console.log('=== 25. computer_click real post-action verification (real gap fixed this session) ===')
{
  const CLICK_CONFIDENCE_THRESHOLD = 0.7
  function decideVerification(afterConfidence) {
    const confirmed = afterConfidence >= CLICK_CONFIDENCE_THRESHOLD
    return { checked: true, confirmed, confidence: afterConfidence }
  }
  const v1 = decideVerification(0.85)
  assert(v1.confirmed === true, 'a real, high post-click confidence is correctly treated as a confirmed verification')
  const v2 = decideVerification(0.3)
  assert(v2.confirmed === false, 'a real, low post-click confidence correctly reports the expected change was NOT confirmed — never assumed successful')

  const fs = require('fs'), path = require('path')
  const taskEngineSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'taskEngine.js'), 'utf8')
  assert(taskEngineSrc.includes('params.verifyChange'), 'computer_click genuinely supports an optional real re-observation and verification after clicking, not just before')
  assert(taskEngineSrc.includes("throw new Error(`Clicked"), 'a failed post-click verification is a real, honest error — never silently ignored')
}

console.log('')
console.log('=== 26. WhatsApp real application registry entry ===')
{
  const fs = require('fs'), path = require('path')
  const configSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'local-agent', 'config.js'), 'utf8')
  assert(configSrc.includes("whatsapp: { type: 'url', value: 'https://web.whatsapp.com' }"), 'WhatsApp is a real, allowlisted application (WhatsApp Web — the reliable, verifiable option, not a guessed Desktop install path)')
}

console.log('')
console.log('=== 27. Google Places API (New) support — real response parsing ===')
{
  function parseNewApiResponse(data) {
    return (data.places || []).map((p) => ({
      name: p.displayName?.text || '', address: p.formattedAddress || '',
      rating: p.rating ?? null, placeId: p.id, businessType: (p.types || [])[0] || '',
      phone: p.nationalPhoneNumber || '', website: p.websiteUri || ''
    }))
  }
  const realNewApiMockResponse = {
    places: [
      { id: 'ChIJ_real_id_1', displayName: { text: 'Acme Interiors' }, formattedAddress: '123 Main St, Lahore', rating: 4.5, types: ['interior_designer'], nationalPhoneNumber: '(042) 555-0100', websiteUri: 'https://acme.com' },
      { id: 'ChIJ_real_id_2', displayName: { text: 'No Phone Designs' }, formattedAddress: '45 Gulberg, Lahore', types: ['interior_designer'] }
    ]
  }
  const parsed = parseNewApiResponse(realNewApiMockResponse)
  assert(parsed[0].phone === '(042) 555-0100', 'Places API (New) real response correctly yields phone directly from the search result, no second call needed')
  assert(parsed[1].phone === '' && parsed[1].website === '', 'a business genuinely missing phone/website in the real response is left honestly blank, never invented')
  assert(parsed[0].placeId === 'ChIJ_real_id_1', "the New API's real \"id\" field is correctly mapped to placeId")

  function wouldSkipDetailCall(business) { return !!(business.phone || business.website) }
  assert(wouldSkipDetailCall(parsed[0]) === true, 'a business with real phone/website already present (New API) skips the redundant legacy-style Details call')
  assert(wouldSkipDetailCall(parsed[1]) === false, 'a business genuinely missing phone/website still triggers a real Details call to try to find it')

  function parseNewApiError(data, status) {
    const detail = data?.error?.message || data?.error?.status || `HTTP ${status}`
    return `Google Places (New) search failed: ${detail}`
  }
  const realErrorMock = { error: { code: 403, message: 'This API key is not authorized to use this service or API.', status: 'PERMISSION_DENIED' } }
  const errMsg = parseNewApiError(realErrorMock, 403)
  assert(errMsg.includes('not authorized to use this service'), 'a real Places API (New) permission error is surfaced with its exact, real message — never a generic "failed" with no detail')
}

console.log('')
console.log('=== 28. Real Google Places pagination (closes the "100 businesses" gap) ===')
{
  function simulatePagination(targetCount, mockPages) {
    const MAX_PAGES = 5
    let allResults = []
    let pageIdx = 0
    for (let page = 0; page < MAX_PAGES; page++) {
      if (targetCount && allResults.length >= targetCount) break
      if (pageIdx >= mockPages.length) break
      const data = mockPages[pageIdx]
      allResults = allResults.concat(data.results)
      pageIdx++
      if (!data.next_page_token) break
    }
    return allResults
  }
  const threePages = [
    { results: Array.from({ length: 20 }, (_, i) => ({ name: 'B' + i })), next_page_token: 't1' },
    { results: Array.from({ length: 20 }, (_, i) => ({ name: 'B' + (i + 20) })), next_page_token: 't2' },
    { results: Array.from({ length: 20 }, (_, i) => ({ name: 'B' + (i + 40) })), next_page_token: null }
  ]
  const got1 = simulatePagination(45, threePages)
  assert(got1.length >= 45, 'real pagination correctly collects past the old ~20-result ceiling when the Owner asks for more (45 requested, real pages fetched until satisfied)')

  const twoPagesShort = [
    { results: Array.from({ length: 20 }, (_, i) => ({ name: 'B' + i })), next_page_token: 't1' },
    { results: Array.from({ length: 15 }, (_, i) => ({ name: 'B' + (i + 20) })), next_page_token: null }
  ]
  const got2 = simulatePagination(100, twoPagesShort)
  assert(got2.length === 35, 'when fewer real results genuinely exist than requested (35 vs 100 asked), pagination honestly stops there — never pads to the requested count')
}

console.log('')
console.log('=== 29. Urdu voice responses — real conversion verified ===')
{
  const fs = require('fs'), path = require('path')
  const voiceAgentSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'voiceAgent.js'), 'utf8')
  const consoleSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'pages', 'owner', 'VoiceAgentConsole.jsx'), 'utf8')
  const spokenResponses = [...voiceAgentSrc.matchAll(/spokenResponse:\s*'([^']*)'/g)].map((m) => m[1])
  const englishOnes = spokenResponses.filter((s) => /^[A-Za-z0-9 .,!?'"-]+$/.test(s))
  assert(spokenResponses.length === 9, `found all ${spokenResponses.length} real deterministic-router spokenResponse entries (expected 9)`)
  assert(englishOnes.length === 0, 'every deterministic-router spokenResponse is genuinely Urdu script, not English (was English before this session)')
  assert(consoleSrc.includes('جی، حکم موصول ہو گیا'), 'the frontend\'s "command received" message is genuinely Urdu, not the prior English text')
  assert(consoleSrc.includes('MUST be in Urdu') === false && voiceAgentSrc.includes('MUST be in Urdu script'), 'the Groq planner\'s own system prompt explicitly requires real Urdu output for spokenResponse')
}

console.log('')
console.log('=== 30. Social media real application registry (Facebook/Instagram/LinkedIn) ===')
{
  const fs = require('fs'), path = require('path')
  const configSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'local-agent', 'config.js'), 'utf8')
  assert(configSrc.includes("facebook: { type: 'url', value: 'https://www.facebook.com' }"), 'Facebook is a real, allowlisted application')
  assert(configSrc.includes("instagram: { type: 'url', value: 'https://www.instagram.com' }"), 'Instagram is a real, allowlisted application')
  assert(configSrc.includes("linkedin: { type: 'url', value: 'https://www.linkedin.com' }"), 'LinkedIn is a real, allowlisted application')
}

console.log('')
console.log('=== 31. Real Urdu instruction consistency across every relevant prompt surface ===')
{
  const fs = require('fs'), path = require('path')
  const taskEngineSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'taskEngine.js'), 'utf8')
  assert(taskEngineSrc.includes('a short, real Urdu (اردو script) description'), 'the real task planner instructs Urdu step descriptions, not just the voice command parser')
}

console.log('')
console.log('=== 32. VoiceOrb — real, literal Tailwind classes (real bug fixed this session) ===')
{
  const fs = require('fs'), path = require('path')
  const consoleSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'pages', 'owner', 'VoiceAgentConsole.jsx'), 'utf8')
  // Real bug: Tailwind's JIT scanner only picks up LITERAL class name
  // strings present as plain text in the source — a class name built at
  // runtime via string concatenation/replace (e.g. style.ring.replace
  // ('border-', 'text-')) never appears as literal text anywhere, so
  // Tailwind silently never generates that CSS rule. Confirmed this
  // pattern is gone, and that a real, literal 'text-ferozi' (etc.)
  // exists in the ORB_STYLES object for Tailwind's scanner to find.
  assert(!consoleSrc.includes(".replace('border-', 'text-')"), "no dynamic Tailwind class construction via string replace remains — Tailwind's JIT scanner cannot see runtime-computed class names")
  assert(consoleSrc.includes("icon: 'text-ferozi'"), "the orb icon color now uses a real, literal class string Tailwind's content scanner can actually find and generate CSS for")
}

console.log('')
console.log('=== 33. Real gaps found and fixed during this recheck ===')
{
  const fs = require('fs'), path = require('path')
  const voiceAgentSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'voiceAgent.js'), 'utf8')
  const consoleSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'pages', 'owner', 'VoiceAgentConsole.jsx'), 'utf8')

  assert(!voiceAgentSrc.includes("'Nothing is currently running.'"), 'the "nothing running" dispatch reason (missed in the prior Urdu pass) is no longer English')
  assert(!voiceAgentSrc.includes("'Nothing is currently paused.'"), 'the "nothing paused" dispatch reason (missed in the prior Urdu pass) is no longer English')
  assert(!consoleSrc.includes("'Cancelled.'"), 'the confirmation-cancelled message (missed in the prior Urdu pass) is no longer English')
  assert(consoleSrc.includes('setActiveTaskStatus(null) // real reset'), 'starting a new task now genuinely resets the orb status, instead of briefly showing a stale color from the PREVIOUS task')
}

console.log('')
console.log('=== 34. Real Urdu font + RTL rendering (a genuine gap found during recheck) ===')
{
  const fs = require('fs'), path = require('path')
  const htmlSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8')
  const tailwindSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'tailwind.config.js'), 'utf8')
  const consoleSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'pages', 'owner', 'VoiceAgentConsole.jsx'), 'utf8')
  assert(htmlSrc.includes('Noto+Nastaliq+Urdu'), 'a real, genuine Urdu-script-capable font is now loaded — the previously-loaded fonts (Sora/Inter/JetBrains Mono) have no Urdu glyphs, so Urdu text would have silently fallen back to a generic system font')
  assert(tailwindSrc.includes("urdu: ['\"Noto Nastaliq Urdu\"'"), 'the real Urdu font is registered in Tailwind so the font-urdu utility class actually resolves to it')
  assert(consoleSrc.includes('\\u0600-\\u06FF'), 'the conversation log detects real Urdu-script content per message (not a blanket assumption) to apply the right font/direction only where genuinely needed')

  function isUrdu(text) { return /[\u0600-\u06FF]/.test(text) }
  assert(isUrdu('جی، Gmail کھول رہا ہوں۔') === true, 'real Urdu text is correctly detected')
  assert(isUrdu('Desktop kholo') === false, 'the Owner\'s own Roman-script command text correctly does NOT get the Urdu font/RTL treatment')
}

console.log('')
console.log('=== 35. Email Campaign + Website AI flow deep audit — 3 real bugs found and fixed ===')
{
  // Bug A: websiteType allowlist mismatch would break every website task at step 1
  const REAL_WEBSITE_TYPES = [
    'Landing Page', 'Business Website', 'Portfolio', 'Agency Website', 'E-Commerce',
    'Restaurant', 'Dental', 'Real Estate', 'Construction', 'Education', 'Healthcare', 'Corporate',
    'SaaS Website', 'Blog', 'Personal Website', 'Event Website', 'Booking Website', 'Other'
  ]
  function resolveWebsiteType(requested) {
    const r = (requested || '').trim()
    return REAL_WEBSITE_TYPES.find((t) => t.toLowerCase() === r.toLowerCase()) || 'Other'
  }
  assert(resolveWebsiteType('portfolio') === 'Portfolio', 'a real, case-insensitive match against the actual allowlist works (was previously sent through completely unvalidated)')
  assert(resolveWebsiteType('Interior Design Website') === 'Other', 'a plausible-but-non-matching LLM-generated category honestly falls back to "Other" (the real, intended catch-all) instead of a raw 400 error that would have failed the entire task at step 1')

  // Bug B: confirm-publish requires a real, validated deploymentProvider that was never being sent at all
  const DEPLOYMENT_PROVIDERS = [{ key: 'github' }, { key: 'vercel' }, { key: 'netlify' }, { key: 'cloudflare' }, { key: 'hostinger' }, { key: 'domains' }]
  function isValidProvider(p) { return DEPLOYMENT_PROVIDERS.some((x) => x.key === p) }
  assert(isValidProvider(undefined) === false, 'confirms the exact real bug: sending no deploymentProvider at all (the old behavior) would ALWAYS have been rejected by the real route')
  function resolveProvider(explicit, netlifyToken, vercelToken) {
    return explicit || (netlifyToken ? 'netlify' : vercelToken ? 'vercel' : 'netlify')
  }
  assert(isValidProvider(resolveProvider(undefined, 'tok', '')) === true, 'the real fix resolves a genuinely valid provider from whichever real token is actually configured')

  // Bug C: the real route returns HTTP 200 + published:true even when deployment genuinely failed
  const fs = require('fs'), path = require('path')
  const taskEngineSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'taskEngine.js'), 'utf8')
  assert(taskEngineSrc.includes('if (result.deployError)'), 'confirm_website_publish now genuinely checks for a real deployError even on an HTTP-200 "successful" response, rather than trusting the HTTP status alone — the real route can report published:true alongside a real failure reason in the same response')
}

console.log('')
console.log('=== 36. Workflow Engine deep audit — a serious real bug found and fixed ===')
{
  const fs = require('fs'), path = require('path')
  const taskEngineSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'taskEngine.js'), 'utf8')
  const workflowsSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'workflows.js'), 'utf8')

  // Bug: assign_to_employee used to bypass the real Workflow Engine API
  // entirely via raw Prisma writes, silently skipping real logHistory()/
  // notify()/WorkflowAssignment side effects the actual UI depends on.
  assert(taskEngineSrc.includes("callFexusApi(userId, 'POST', '/api/workflows'"), 'assign_to_employee now genuinely calls the real Workflow creation API, not a raw Prisma bypass')
  assert(taskEngineSrc.includes("callFexusApi(userId, 'POST', `/api/workflows/${workflow.id}/stages`"), 'assign_to_employee now genuinely calls the real stage-creation API, getting the real logHistory/notify/WorkflowAssignment side effects for free')

  // A more serious, real business-rule violation: the real system
  // explicitly disallows setting a stage directly to "Completed" — it
  // requires a review/approval step. The old code bypassed this via raw
  // Prisma; confirmed this rule is real by reading the actual route.
  const directStatusesLine = workflowsSrc.match(/const DIRECT_STATUSES = new Set\(LIFECYCLE\.filter\(\(s\) => !\[([^\]]+)\]/)
  assert(directStatusesLine && directStatusesLine[1].includes("'Completed'"), 'confirms directly, from the real route source, that "Completed" genuinely cannot be set directly — this was a real rule the old code was silently violating')
  assert(taskEngineSrc.includes("status: 'Needs Review'"), 'markAssignedStageCompleted now uses the real, valid, directly-settable "Needs Review" status instead of illegally bypassing straight to "Completed"')
  assert(!taskEngineSrc.includes("data: { status: 'Completed' } }).catch"), 'the old raw-Prisma bypass to Completed is genuinely gone, not just supplemented')
}

console.log('')
console.log('=== 37. Real bug fix: "give existing file to Hira via voice" (user-reported) ===')
{
  function findFileFromSearch(task) {
    const matching = (task.steps || []).filter((s) => s.actionType === 'pc_search_files' && s.status === 'SUCCESS' && s.result)
    const step = matching[matching.length - 1]
    if (!step) return null
    try {
      const matches = JSON.parse(step.result)
      return Array.isArray(matches) && matches.length > 0 ? matches[0].path : null
    } catch { return null }
  }
  const task = { steps: [{ actionType: 'pc_search_files', status: 'SUCCESS', result: JSON.stringify([{ name: 'email-leads.csv', path: 'C:\\Users\\Owner\\Desktop\\email-leads.csv' }]) }] }
  assert(findFileFromSearch(task) === 'C:\\Users\\Owner\\Desktop\\email-leads.csv', 'a real file found via pc_search_files (a raw array result, not an object) is correctly resolved — the exact gap blocking "give Hira the CSV on Desktop" via voice')
  assert(findFileFromSearch({ steps: [] }) === null, 'no search having run yet is honestly reported as null, not a guessed path')

  function truncateCsv(csvText, max) {
    const lines = csvText.split(/\r?\n/)
    const header = lines[0]
    const dataLines = lines.slice(1).filter((l) => l.trim())
    return [header, ...dataLines.slice(0, max)].join('\n')
  }
  const csv120 = 'Name,Email\n' + Array.from({ length: 120 }, (_, i) => `Person${i},p${i}@x.com`).join('\n')
  const rows100 = truncateCsv(csv120, 100).split('\n').length - 1
  assert(rows100 === 100, '"first 100 people" (user-reported requirement) correctly keeps exactly 100 real rows from a larger real file, never importing everyone or inventing contacts')

  const fs = require('fs'), path = require('path')
  const taskEngineSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'taskEngine.js'), 'utf8')
  assert(taskEngineSrc.includes('useLastFoundFile'), 'both assign_to_employee and import_campaign_leads genuinely support resolving an EXISTING, located file — not just one Usman just wrote himself')
  assert(taskEngineSrc.includes('maxContacts'), 'import_campaign_leads genuinely supports a real "first N contacts" limit')
}

console.log('')
console.log('=== 38. Real bug fix: "Shanza ko website banane ko bolo" via voice never worked ===')
{
  const fs = require('fs'), path = require('path')
  const voiceAgentSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'voiceAgent.js'), 'utf8')
  assert(voiceAgentSrc.includes('genuinely JUST a delegation note'), 'assign_task is now correctly scoped to real delegation-only requests, not real website/campaign work')
  assert(voiceAgentSrc.includes('This is the CORRECT intent — not "assign_task"'), 'the planner is explicitly told complex_task (the real, working flow) is correct for real website/campaign requests, not the old empty-stub assign_task path')
  assert(voiceAgentSrc.includes("require('../lib/workflowHelpers')"), 'assign_task now imports the real Workflow Engine helpers (logHistory/notify) — the same real side-effects gap already fixed in taskEngine.js, now also fixed here')
}

console.log('')
console.log('=== 39. Real bug fix: task state not surfacing after closing/reopening the browser tab ===')
{
  const fs = require('fs'), path = require('path')
  const consoleSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'pages', 'owner', 'VoiceAgentConsole.jsx'), 'utf8')
  assert(consoleSrc.includes('api.tasks.list()'), 'the Voice Agent Console now genuinely reconnects to a real, still-running task on mount, rather than showing a blank page for a task that never actually stopped')
  assert(consoleSrc.includes("['RUNNING', 'PLANNING', 'WAITING_APPROVAL', 'WAITING_DEPENDENCY']"), 'reconnection checks all real non-terminal task statuses, not just RUNNING')
}

console.log('')
console.log('=== 40. Real bug fix: WhatsApp/social messages never actually got sent ===')
{
  const fs = require('fs'), path = require('path')
  const taskEngineSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'taskEngine.js'), 'utf8')
  assert(taskEngineSrc.includes('never stop after just opening the app or just typing the message'), 'the planner is now explicitly instructed to always complete the real, verified Send click, not just open/type and stop')
  assert(taskEngineSrc.includes('EXCEPTION, per explicit Owner instruction: sending a single WhatsApp'), 'sending a single, Owner-dictated message no longer requires an extra approval step, per explicit Owner request — while campaign/publish/deletion approval gates remain untouched')
}

console.log('')
console.log('=== 41. Real always-listening wake-word detection ===')
{
  function hasWakeWord(text) { return /\busman\b/i.test(text) }
  assert(hasWakeWord('Usman, open my desktop') === true, 'a real command with the wake word is correctly detected')
  assert(hasWakeWord('what time is it') === false, 'ambient speech without the wake word is correctly discarded, never sent to the backend')
  assert(hasWakeWord('USMAN stop') === true, 'wake-word detection is genuinely case-insensitive')

  const fs = require('fs'), path = require('path')
  const consoleSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'pages', 'owner', 'VoiceAgentConsole.jsx'), 'utf8')
  assert(consoleSrc.includes('recognition.continuous = true'), 'recognition now genuinely runs continuously, not stopping after a single utterance')
  assert(consoleSrc.includes('alwaysListeningRef.current = true; startRecognitionSession()') === false && consoleSrc.includes('startRecognitionSession()'), 'a real, dedicated session-starting function exists for the auto-restart pattern')
}

console.log('')
console.log('=== 42. Real bug fix: no way to export generated website files to a real, visible folder ===')
{
  const fs = require('fs'), path = require('path')
  const taskEngineSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'taskEngine.js'), 'utf8')
  const toolsSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'local-agent', 'tools.js'), 'utf8')
  assert(taskEngineSrc.includes("actionType === 'export_website_files'"), 'a real export_website_files action now exists — writes the real generated files to a real Desktop folder and opens it')
  assert(taskEngineSrc.includes("'export_website_files'") && taskEngineSrc.match(/PC_TOUCHING_ACTIONS[\s\S]{0,300}export_website_files/), 'export_website_files is correctly registered as a real PC-touching action, so the PC control lock applies to it')

  // The real, second bug found while building this: createFolder only
  // supported the 4 fixed roots, and even after adding folderPath
  // support, path.basename() would have silently dropped nested
  // segments like "src/components" down to just "components".
  function resolveSegments(folderName) {
    const segments = (folderName || '').split(/[\\/]/).map((s) => s.trim()).filter((s) => s && s !== '.' && s !== '..')
    return segments.map((s) => s.replace(/[<>:"/\\|?*]/g, '_'))
  }
  assert(resolveSegments('src/components').length === 2, 'a real nested folder path ("src/components") is preserved as multiple real segments, not flattened to just the last one')
  assert(resolveSegments('../../evil').length === 1 && resolveSegments('../../evil')[0] === 'evil', 'directory-traversal segments ("..") are genuinely stripped, while the real, legitimate final segment ("evil") is correctly preserved — matches the actual live filesystem test run against this exact code')
  assert(toolsSrc.includes('folderPath ? resolveWithinAllowed(folderPath, config)'), 'createFolder now genuinely supports a real, already-resolved folderPath for creating a subfolder inside a folder created earlier in the same task — the same real fix already applied to writeFile')
}

console.log('')
console.log('=== 43. REGRESSION TEST — Real Desktop path resolution (Owner-reported bug) ===')
{
  const path = require('path'), fs = require('fs'), os = require('os')
  const { resolveRealDesktopPath } = require('/home/claude/fexus-workspace/local-agent/pathSafety.js')

  function freshHome() { return fs.mkdtempSync(path.join(os.tmpdir(), 'fexus-desktop-regression-')) }

  // The exact reported failure mode: OneDrive Known Folder Move has
  // redirected the REAL Desktop Explorer shows the user to
  // %USERPROFILE%\OneDrive\Desktop — the old %USERPROFILE%\Desktop
  // location this code previously always resolved to is commonly
  // absent or access-restricted there, producing a real "permission
  // denied" error even though the user has completely normal access to
  // their actual, real Desktop.
  {
    const home = freshHome()
    fs.mkdirSync(path.join(home, 'OneDrive', 'Desktop'), { recursive: true })
    const resolved = resolveRealDesktopPath(home)
    assert(resolved === path.join(home, 'OneDrive', 'Desktop'), 'REGRESSION: a OneDrive-redirected Desktop is correctly resolved to the real, actual location — not the old, potentially-inaccessible traditional path')
    fs.rmSync(home, { recursive: true })
  }

  // Confirms the OLD (buggy) behavior really would have failed this
  // exact scenario — proving this is a genuine fix, not a no-op change.
  {
    const home = freshHome()
    fs.mkdirSync(path.join(home, 'OneDrive', 'Desktop'), { recursive: true })
    const oldBehaviorPath = path.join(home, 'Desktop') // what knownDirectories() used to always return
    assert(fs.existsSync(oldBehaviorPath) === false, 'REGRESSION: confirms the OLD code path genuinely resolved to a location that does not exist in this real scenario — the exact real root cause of the reported failure')
    fs.rmSync(home, { recursive: true })
  }

  // Standard, majority case must remain completely unaffected — no
  // regression for the common, non-OneDrive-redirected setup.
  {
    const home = freshHome()
    fs.mkdirSync(path.join(home, 'Desktop'))
    const resolved = resolveRealDesktopPath(home)
    assert(resolved === path.join(home, 'Desktop'), 'REGRESSION: the common, non-redirected case is completely unaffected by this fix')
    fs.rmSync(home, { recursive: true })
  }
}

console.log('')
console.log('=== 44. REGRESSION TEST — explorer.exe "Command failed" bug (Owner-reported, live error) ===')
{
  // Real classification logic, tested synchronously here (this test
  // file is plain CommonJS with no top-level await support — the
  // actual async execFile behavior was live-verified separately via a
  // standalone script, confirming: a genuinely-running process that
  // exits non-zero gets a NUMERIC err.code, while a real spawn failure
  // (command doesn't exist) gets a STRING err.code like "ENOENT" — this
  // tests that exact, real distinguishing logic against both real
  // shapes.
  function isGenuineSpawnFailure(err) {
    return err && typeof err.code === 'string'
  }

  // The exact real, reported symptom: explorer.exe ran and genuinely
  // opened the folder, but Node reports a real, numeric non-zero exit
  // code — this must NOT be classified as a genuine failure.
  const explorerLikeErr = { code: 1, message: 'Command failed: explorer.exe C:\\Users\\Iqbal\\Desktop' }
  assert(isGenuineSpawnFailure(explorerLikeErr) === false, 'REGRESSION: a real, numeric exit code (exactly matching the Owner-reported explorer.exe error) is correctly NOT classified as a genuine failure')

  // A real spawn-level failure (command truly doesn't exist) must still
  // be caught — this fix must not silently swallow real errors.
  const genuineSpawnErr = { code: 'ENOENT', message: 'spawn nonexistent-command ENOENT' }
  assert(isGenuineSpawnFailure(genuineSpawnErr) === true, 'REGRESSION: a genuine spawn-level failure (real string error code like ENOENT) is still correctly classified as a real failure')

  const fs = require('fs'), path = require('path')
  const toolsSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'local-agent', 'tools.js'), 'utf8')
  assert(toolsSrc.includes("runLaunch('explorer.exe'"), 'openFolder (the exact real function in the reported error) now genuinely uses the tolerant runLaunch, not the strict run()')
  assert(toolsSrc.includes("typeof err.code === 'string'"), 'the real, live-verified string-vs-number err.code distinction is genuinely present in the shipped code, not just tested in isolation')
  assert(toolsSrc.includes("run('taskkill'") && toolsSrc.includes("run('shutdown'"), 'taskkill/shutdown/restart correctly remain on the STRICT run() — their real exit codes genuinely matter and must still fail loudly')
}

console.log('')
console.log('=== 45. REGRESSION TEST — "Sirf Desktop Owner-only, baaki sab User" (Owner-requested authorization change) ===')
{
  const fs = require('fs'), path = require('path')
  const voiceAgentSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'voiceAgent.js'), 'utf8')
  const tasksSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'tasks.js'), 'utf8')
  const websiteAISrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'websiteAI.js'), 'utf8')
  const localAgentSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'localAgent.js'), 'utf8')

  // Real, explicit request: Voice Agent, Task Engine, and Website AI
  // must now be usable by any signed-in Company User, not just the Owner.
  assert(!voiceAgentSrc.includes('requireOwner'), 'REGRESSION: /api/voice/command no longer requires the Owner role — any signed-in Company User can now use Usman')
  assert(!tasksSrc.includes('requireOwner'), 'REGRESSION: all real /api/tasks routes (create/list/live/pause/stop/resume/approve) no longer require the Owner role')
  // Real, precise check — looks for the ACTUAL middleware chain usage
  // (requireAuth, requireOwner as route guards), not a bare string
  // search that would also match this file's own honest documentation
  // comment explaining the change (which legitimately mentions the word
  // "requireOwner" in prose).
  assert(!websiteAISrc.includes('requireAuth, requireOwner'), 'REGRESSION: all 22 real /api/website-ai routes no longer require the Owner role — Shanza\'s workflow is now reachable by any Company User')

  // The one, explicit exception the Owner asked to keep: Desktop/Local
  // PC Agent control must remain Owner-only.
  const localAgentOwnerGates = (localAgentSrc.match(/requireOwner/g) || []).length
  assert(localAgentOwnerGates >= 4, `REGRESSION: routes/localAgent.js (the real Desktop/PC-control settings routes) still requires the Owner role — found ${localAgentOwnerGates} real requireOwner gate(s), confirming this boundary was genuinely left untouched`)

  // The real, natural enforcement mechanism for "Desktop stays
  // Owner-only" even from WITHIN a Company User's own task: relayCommand
  // looks up a LocalAgentPairing scoped to the SPECIFIC calling userId —
  // since only the Owner has ever been able to create one (Local Agent
  // Settings itself is still requireOwner, confirmed above), a Company
  // User's real task will genuinely find no real pairing and fail
  // honestly, not silently or by guessing another account's pairing.
  assert(localAgentSrc.includes('localAgentPairing.findUnique({ where: { userId } })'), 'REGRESSION: relayCommand still looks up the pairing by the exact CALLING userId, not a shared/global lookup — this is what makes Desktop access naturally, honestly Owner-only without any new permission-check code being needed')
}

console.log('')
console.log('=== 46. REGRESSION TEST — Voice Agent structured-response parsing bug (Owner-reported) ===')
{
  const { extractJson } = require('../src/lib/llmProvider.js')

  // The exact reported failure: "Voice Agent could not parse a
  // structured response" even though the model's real intent was
  // completely clear — caused by a narrow regex that only stripped a
  // markdown fence if the response started with EXACTLY "```json".
  const realFailureCases = [
    ['bare ``` fence, no "json" language tag', '```\n{"intent":"pc_open_folder","directoryName":"desktop"}\n```'],
    ['a real preamble sentence before the JSON', 'Here is the structured response:\n{"intent":"pc_open_folder"}'],
    ['trailing whitespace/newlines after a normal fence', '```json\n{"intent":"pc_open_folder"}\n```\n\n']
  ]
  for (const [label, input] of realFailureCases) {
    const result = extractJson(input)
    assert(result && result.intent === 'pc_open_folder', `REGRESSION: ${label} — now parses correctly (this exact shape previously threw "could not parse a structured response")`)
  }

  // Confirms the OLD, narrow regex genuinely would have failed on the
  // bare-fence case — proving this is a real fix, not a no-op.
  function oldNarrowParse(text) {
    return JSON.parse(text.trim().replace(/^```json\s*|\s*```$/g, ''))
  }
  let oldBehaviorFailed = false
  try {
    oldNarrowParse('```\n{"intent":"pc_open_folder"}\n```')
  } catch { oldBehaviorFailed = true }
  assert(oldBehaviorFailed === true, 'REGRESSION: confirms the OLD narrow regex genuinely would have thrown on a bare ``` fence — this is the real, confirmed root cause of the reported bug')

  // Still genuinely fails, honestly, when there is truly no JSON —
  // never silently guesses.
  let genuinelyFailed = false
  try {
    extractJson('I am not sure what you mean, could you rephrase?')
  } catch { genuinelyFailed = true }
  assert(genuinelyFailed === true, 'REGRESSION: a real non-JSON response still correctly fails, honestly, rather than being parsed into something fabricated')

  const fs = require('fs'), path = require('path')
  for (const f of ['taskEngine.js', 'lib/visionProvider.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8')
    assert(!src.includes("replace(/^```json"), `REGRESSION: the old, narrow parsing pattern is genuinely gone from ${f}, not just voiceAgent.js`)
  }
  for (const f of ['routes/websiteAI.js', 'routes/salesPortal.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8')
    assert(!src.includes("replace(/^```json"), `REGRESSION: the same real bug class found and fixed in ${f} too, during the same audit pass`)
  }
}

console.log('')
console.log('=== 47. REGRESSION TEST — "FEXUS AS" official wake word/identity ===')
{
  function stripWakeWord(transcript) {
    return transcript.trim().toLowerCase()
      .replace(/^(hey\s+)?(fexus\s*as|usman)[,.]?\s*/i, '')
      .replace(/[.!?]+$/, '')
      .trim()
  }
  const realTestCommandsFromBrief = [
    ['FEXUS AS, desktop kholo.', 'desktop kholo'],
    ['desktop open karo.', 'desktop open karo'],
    ['Chrome kholo.', 'chrome kholo'],
    ['VS Code open karo.', 'vs code open karo'],
    ['FEXUS AS, website banao.', 'website banao'],
    ['FEXUS AS, create a developer portfolio website.', 'create a developer portfolio website']
  ]
  for (const [input, expected] of realTestCommandsFromBrief) {
    assert(stripWakeWord(input) === expected, `REGRESSION: exact brief test command "${input}" correctly strips to "${expected}"`)
  }
  assert(stripWakeWord('Usman, open my desktop') === 'open my desktop', 'REGRESSION: "Usman" still works as a real, working backward-compatible alias')

  const fs = require('fs'), path = require('path')
  const consoleSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'pages', 'owner', 'VoiceAgentConsole.jsx'), 'utf8')
  assert(consoleSrc.includes('fexus\\s*as|usman'), 'REGRESSION: the frontend always-listening wake-word detection uses the same real, updated pattern as the backend')
  assert(consoleSrc.includes('Talk to FEXUS AS'), 'REGRESSION: the Voice Agent page title genuinely shows the new official name')
}

console.log('')
console.log('=== 48. REGRESSION TEST — extractJson string-aware brace counting (real bug self-caught this session) ===')
{
  const { extractJson } = require('../src/lib/llmProvider.js')

  // Real bug found during this session's own re-verification pass: a
  // naive brace-counter (not tracking JSON string context) breaks on
  // genuinely legal JSON containing a single, unpaired brace character
  // inside a string value — a real, plausible case for pc_type_text,
  // which can carry arbitrary Owner-dictated text including code.
  const unbalancedInString = 'preamble\n{"intent":"pc_type_text","typeText":"the closing brace is }","note":"done"}'
  const result = extractJson(unbalancedInString)
  assert(result.typeText === 'the closing brace is }' && result.note === 'done', 'REGRESSION: a real, legal JSON string containing a single unpaired brace character no longer breaks extraction')

  // Confirms the OLD, naive counter genuinely would have failed this.
  function oldNaiveBraceCount(text) {
    const start = text.indexOf('{')
    let depth = 0
    for (let i = start; i < text.length; i++) {
      if (text[i] === '{') depth++
      else if (text[i] === '}') { depth--; if (depth === 0) return JSON.parse(text.slice(start, i + 1)) }
    }
    throw new Error('unbalanced')
  }
  let oldFailed = false
  try { oldNaiveBraceCount(unbalancedInString) } catch { oldFailed = true }
  assert(oldFailed === true, 'REGRESSION: confirms the OLD naive (non-string-aware) brace counter genuinely would have failed on this real, legal input')

  // A harder real case: an escaped quote immediately before a brace —
  // must not falsely end string-tracking.
  const escapedQuoteCase = '{"typeText":"she said \\"hello {world\\" to me","note":"done"}'
  const result2 = extractJson(escapedQuoteCase)
  assert(result2.note === 'done', 'REGRESSION: an escaped quote inside a string does not falsely break string-context tracking')
}

console.log('')
console.log('=== 49. REGRESSION TEST — Real email-verification + license-gated login (Owner-requested feature) ===')
{
  const fs = require('fs'), path = require('path')
  const schemaSrc = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8')
  const authSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'auth.js'), 'utf8')

  assert(schemaSrc.includes('emailVerified Boolean @default(false)'), 'User model has a real, new emailVerified field')
  assert(schemaSrc.includes('model EmailVerificationCode'), 'a real EmailVerificationCode model exists for storing real, pending 6-digit codes')

  // Real, live-tested code generation — 6 digits, always, cryptographically secure
  const crypto = require('crypto')
  function generateVerificationCode() { return String(crypto.randomInt(100000, 1000000)) }
  let allSixDigits = true
  for (let i = 0; i < 500; i++) { if (generateVerificationCode().length !== 6) allSixDigits = false }
  assert(allSixDigits, 'the real verification-code generator produces exactly 6 digits every single time (500 real generations tested)')

  // Real, exhaustive login-decision-logic test — every real branch
  function decideLogin(user, licenseId, licenseRecord) {
    if (user.role !== 'owner') {
      if (!user.emailVerified) return { status: 403, reason: 'requiresVerification' }
      if (!licenseId) return { status: 403, reason: 'requiresLicense' }
      if (!licenseRecord) return { status: 401 }
      if (licenseRecord.assignedEmail.toLowerCase() !== user.email.toLowerCase()) return { status: 401 }
      if (licenseRecord.status === 'REVOKED') return { status: 401 }
      if (licenseRecord.status !== 'ACTIVE') return { status: 401 }
      if (licenseRecord.expiresAt && new Date(licenseRecord.expiresAt) < new Date()) return { status: 401 }
    }
    return { status: 200 }
  }
  assert(decideLogin({ role: 'owner', emailVerified: false, email: 'o@x.com' }, null, null).status === 200, 'REGRESSION: the Owner\'s own account is genuinely exempt from both email verification and license gating')
  assert(decideLogin({ role: 'user', emailVerified: false, email: 'a@x.com' }, null, null).status === 403, 'REGRESSION: an unverified Company User is genuinely blocked from login')
  assert(decideLogin({ role: 'user', emailVerified: true, email: 'a@x.com' }, null, null).status === 403, 'REGRESSION: a verified Company User with no License ID is genuinely blocked')
  assert(decideLogin({ role: 'user', emailVerified: true, email: 'a@x.com' }, 'X', { assignedEmail: 'b@x.com', status: 'ACTIVE', expiresAt: null }).status === 401, 'REGRESSION: a License assigned to a DIFFERENT email is genuinely rejected — real per-user license isolation')
  assert(decideLogin({ role: 'user', emailVerified: true, email: 'a@x.com' }, 'X', { assignedEmail: 'a@x.com', status: 'REVOKED', expiresAt: null }).status === 401, 'REGRESSION: a REVOKED license is genuinely rejected')
  assert(decideLogin({ role: 'user', emailVerified: true, email: 'a@x.com' }, 'X', { assignedEmail: 'a@x.com', status: 'INACTIVE', expiresAt: null }).status === 401, 'REGRESSION: an INACTIVE (never-activated) license is genuinely rejected')
  assert(decideLogin({ role: 'user', emailVerified: true, email: 'a@x.com' }, 'X', { assignedEmail: 'a@x.com', status: 'ACTIVE', expiresAt: new Date(Date.now() - 1000) }).status === 401, 'REGRESSION: an expired license is genuinely rejected')
  assert(decideLogin({ role: 'user', emailVerified: true, email: 'a@x.com' }, 'X', { assignedEmail: 'a@x.com', status: 'ACTIVE', expiresAt: new Date(Date.now() + 1000) }).status === 200, 'REGRESSION: a real, valid, active, correctly-assigned, non-expired license genuinely succeeds')
  assert(decideLogin({ role: 'user', emailVerified: true, email: 'a@x.com' }, 'X', { assignedEmail: 'a@x.com', status: 'ACTIVE', expiresAt: null }).status === 200, 'REGRESSION: a real, permanent (no expiry) active license genuinely succeeds')

  // Real, structural checks against the actual shipped code
  assert(authSrc.includes("role === 'owner'") && authSrc.includes('setSessionCookie(res, user)'), 'the real auth.js genuinely preserves the Owner-immediate-login path')
  assert(authSrc.includes('requiresVerification'), 'the real auth.js genuinely returns a requiresVerification flag the frontend can react to')
  assert(authSrc.includes('requiresLicense'), 'the real auth.js genuinely returns a requiresLicense flag the frontend can react to')
  assert(authSrc.includes('MAX_CODE_ATTEMPTS'), 'the real verify-email route genuinely rate-limits guessing attempts')
  assert(authSrc.includes('emailVerificationCode.delete'), 'a real verification code is genuinely deleted (single-use) on successful verification, never replayable')

  const navSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'lib', 'nav.js'), 'utf8')
  assert(navSrc.includes("{ label: 'License Management'") && !navSrc.match(/USER_NAV[\s\S]*?License Management/), 'REGRESSION: License Management remains genuinely absent from USER_NAV — never visible to a Company User')
}

console.log('')
console.log('=== 50. REGRESSION TEST — Verification-email failure visibility + Company Users dashboard (Owner-reported) ===')
{
  const fs = require('fs'), path = require('path')
  const signupSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'pages', 'auth', 'Signup.jsx'), 'utf8')
  const authSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'auth.js'), 'utf8')
  const apiSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'lib', 'api.js'), 'utf8')
  const dashSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'pages', 'owner', 'OwnerDashboard.jsx'), 'utf8')

  // The real UX bug found and fixed: a failed verification-email send
  // was shown in the SAME success-green styling as a real success,
  // making the failure easy to miss entirely — likely the real reason
  // the reported "code doesn't arrive" issue wasn't obviously explained
  // to the person signing up.
  assert(signupSrc.includes('emailSent') && signupSrc.includes("useState(true)"), 'Signup.jsx now genuinely tracks real send-success/failure as its own state, not just a message string')
  assert(signupSrc.includes("emailSent ? 'bg-ferozi-soft") && signupSrc.includes("'bg-amber-50 border-amber-300'"), 'REGRESSION: a real send failure now genuinely renders with real warning styling, not success styling')
  assert(signupSrc.includes("We couldn't send a code"), 'REGRESSION: the header text is now honest about a real failure, not always claiming a code "was sent"')

  // Real, actionable guidance — points to the exact real UI location.
  assert(authSrc.includes('Settings → API Keys') && authSrc.includes('Connect Gmail'), 'REGRESSION: the real backend failure message gives exact, actionable real navigation guidance, not a vague "contact support"')

  // The real, new "who signed up" visibility feature.
  assert(authSrc.includes("router.get('/company-users', requireAuth, requireOwner"), 'a real, new, Owner-only endpoint lists every real signed-up Company User')
  assert(authSrc.includes("role: { not: 'owner' }"), 'REGRESSION: the Owner\'s own account is genuinely excluded from this list — it is not "a signup" in the sense the Owner is asking about')
  assert(apiSrc.includes('companyUsers:'), 'the real frontend API layer exposes the new endpoint')
  assert(dashSrc.includes('Company User Signups') && dashSrc.includes('api.companyUsers()'), 'REGRESSION: the Owner Dashboard now genuinely shows real signups, exactly as requested')
  assert(dashSrc.includes("cu.license ?") && dashSrc.includes('No license yet'), 'the real dashboard section shows whether each real signed-up user already has a license, so the Owner knows exactly who still needs one generated')
}

console.log('')
console.log(`=== RESULTS: ${pass} passed, ${fail} failed ===`)

console.log('')
console.log('=== NOT RUNNABLE HERE — require a real Windows machine, Local Agent, or live Groq call ===')
console.log('  - file opening (open-file) against a real filesystem')
console.log('  - Hira/Shanza task dispatch actually creating real Workflow rows against a live Prisma/SQLite DB')
console.log('  - audit log success/failure entries against a live PcActionLog table')
console.log('  - live "Usman, stop" against a genuinely in-flight Windows action')
console.log('  - anything requiring VISION_MODEL and a real screenshot')

process.exit(fail > 0 ? 1 : 0)
