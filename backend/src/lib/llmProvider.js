// =============================================================================
// CENTRALIZED LLM PROVIDER LAYER (Phase 13, provider swapped in Phase 14)
// =============================================================================
// EVERY AI call in the application goes through this file. As of Phase 14,
// Groq is the ACTIVE provider (Gemini Flash's free-tier quota returned
// "limit: 0" — unusable for the MVP, even though the integration itself
// was correct). Gemini and Anthropic implementations are both kept as
// inactive architecture — reachable only by explicitly setting
// LLM_PROVIDER to "gemini" or "anthropic" in .env, which nothing in this
// codebase does by default.
//
// generateText()/generateTextWithUsage() are provider-agnostic — callers
// (CEO Brain, Director Brains, Website AI, Growth AI) never touch Groq,
// Gemini, or Anthropic specifics directly, and none of their files were
// touched to make this swap — only this one module changed.
//
//   LLM Provider Layer
//        |
//   CEO AI -> Director AI -> Website AI -> Growth AI -> future agents
//
// All of them call generateText()/generateTextWithUsage() the same way
// regardless of which provider is active underneath.
// =============================================================================

const ACTIVE_PROVIDER = (process.env.LLM_PROVIDER || 'groq').toLowerCase()

// Groq — OpenAI-compatible chat completions API. Active provider as of
// Phase 14: excellent free tier, fast, stable, and OpenAI-compatible,
// which is exactly why it's suitable for Website AI, Growth AI, and every
// future agent that plugs into this same layer.
const GROQ_API_KEY = process.env.GROQ_API_KEY || ''
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'

// Inactive architecture — kept so switching back is a one-line env change,
// not a rewrite. Neither is used while ACTIVE_PROVIDER is "groq".
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ''
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash'
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6'

function hasApiKey() {
  if (ACTIVE_PROVIDER === 'anthropic') return !!ANTHROPIC_API_KEY
  if (ACTIVE_PROVIDER === 'gemini') return !!GEMINI_API_KEY
  return !!GROQ_API_KEY
}

// Active provider as of Phase 14.
async function callGroq(system, messages, maxTokens) {
  if (!GROQ_API_KEY) {
    throw new Error('No AI provider connected. Set GROQ_API_KEY in backend/.env to enable this feature.')
  }

  // OpenAI-compatible chat format: system prompt is just another message.
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'system', content: system }, ...messages],
      max_tokens: maxTokens || 1024
    })
  })

  const data = await response.json()
  if (!response.ok) {
    throw new Error(data?.error?.message || 'The Groq API request failed')
  }

  const text = data.choices?.[0]?.message?.content || ''
  const usage = {
    inputTokens: data.usage?.prompt_tokens || 0,
    outputTokens: data.usage?.completion_tokens || 0
  }
  return { text, usage }
}

// Inactive architecture — kept, not deleted, per the standing "keep prior
// providers in architecture only" pattern from Phase 13.
async function callGemini(system, messages, maxTokens) {
  if (!GEMINI_API_KEY) {
    throw new Error('No AI provider connected. Set GEMINI_API_KEY in backend/.env to enable this feature.')
  }

  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }))

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: system }] },
        generationConfig: { maxOutputTokens: maxTokens || 1024 }
      })
    }
  )

  const data = await response.json()
  if (!response.ok) {
    throw new Error(data?.error?.message || 'The Gemini API request failed')
  }

  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text).join('\n')
  const usage = {
    inputTokens: data.usageMetadata?.promptTokenCount || 0,
    outputTokens: data.usageMetadata?.candidatesTokenCount || 0
  }
  return { text, usage }
}

// Inactive architecture — kept, not deleted.
async function callAnthropic(system, messages, maxTokens) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('No AI provider connected. Set ANTHROPIC_API_KEY in backend/.env to enable this feature.')
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: maxTokens || 1024, system, messages })
  })

  const data = await response.json()
  if (!response.ok) {
    throw new Error(data?.error?.message || 'The Anthropic API request failed')
  }

  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n')
  const usage = { inputTokens: data.usage?.input_tokens || 0, outputTokens: data.usage?.output_tokens || 0 }
  return { text, usage }
}

function activeImpl() {
  if (ACTIVE_PROVIDER === 'anthropic') return callAnthropic
  if (ACTIVE_PROVIDER === 'gemini') return callGemini
  return callGroq
}

/** Provider-agnostic — returns just the text, for callers that don't need usage. */
async function generateText(system, messages, maxTokens) {
  const { text } = await activeImpl()(system, messages, maxTokens)
  return text
}

/** Provider-agnostic — returns { text, usage: { inputTokens, outputTokens } }. */
async function generateTextWithUsage(system, messages, maxTokens) {
  return activeImpl()(system, messages, maxTokens)
}

/**
 * Real, shared, robust JSON extraction for every caller in this
 * codebase that asks a model to respond with structured JSON (Voice
 * Agent intent parsing, the Task Engine planner, etc.) — one real
 * implementation, reused everywhere, not duplicated per-caller.
 *
 * Real fix for a reported bug: the previous per-caller regex
 * (`/^```json\s*|\s*```$/g`) only stripped a markdown fence if the
 * response literally STARTED with "```json" — a real, common LLM
 * response variant (a bare ``` fence with no "json" tag, or the model
 * adding even a few words of preamble before the fence) would leave
 * that text in front of the JSON, and JSON.parse() would then fail on
 * the whole thing — producing exactly the reported "could not parse a
 * structured response" error even though the model's real intent was
 * completely clear.
 *
 * This still requires the final result to be genuine, valid JSON
 * (parsed via the real JSON.parse(), never eval or a loose parser) —
 * deliberately not "dangerously permissive," per the explicit
 * requirement not to weaken validation.
 */
function extractJson(rawText) {
  const text = (rawText || '').trim()

  // Real fix, step 1: strip a real markdown code fence wherever it
  // appears at the very start/end — case-insensitive language tag,
  // tolerant of "```json", "```JSON", or a bare "```" with no tag.
  const fenceStripped = text
    .replace(/^```[a-zA-Z]*\s*/, '')
    .replace(/\s*```\s*$/, '')
    .trim()

  try {
    return JSON.parse(fenceStripped)
  } catch {
    // Real fix, step 2: fall back to extracting a real, balanced
    // {...} substring. A real bug was found and fixed here during
    // testing: a naive brace-counter that doesn't track whether it's
    // currently inside a JSON string literal breaks on genuinely legal
    // JSON containing a single, unpaired brace character inside a
    // string value (e.g. a real typeText field like "the closing brace
    // is }") — a real, plausible case for this codebase specifically,
    // since pc_type_text can carry arbitrary Owner-dictated text,
    // including code snippets. This scanner is now genuinely
    // string-aware: it tracks whether it's inside a string (and
    // correctly skips escaped characters like \" so an escaped quote
    // doesn't wrongly end string-tracking), and only counts brace depth
    // for braces that are real JSON structure, not string content.
    const start = fenceStripped.indexOf('{')
    if (start === -1) throw new Error('No JSON object found in the model response.')
    let depth = 0
    let inString = false
    let escaped = false
    for (let i = start; i < fenceStripped.length; i++) {
      const ch = fenceStripped[i]
      if (escaped) { escaped = false; continue }
      if (ch === '\\') { escaped = true; continue }
      if (ch === '"') { inString = !inString; continue }
      if (inString) continue
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) {
          const candidate = fenceStripped.slice(start, i + 1)
          return JSON.parse(candidate) // real parse — throws naturally (uncaught here) if this candidate isn't genuinely valid JSON, surfacing a real, honest error to the caller
        }
      }
    }
    throw new Error('No complete, balanced JSON object found in the model response.')
  }
}

module.exports = { generateText, generateTextWithUsage, extractJson, hasApiKey, ACTIVE_PROVIDER }
