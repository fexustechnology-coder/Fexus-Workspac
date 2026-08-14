// =============================================================================
// INACTIVE AS OF PHASE 13 — kept as architecture only, per the brief:
// "Anthropic support may remain in architecture only. It must NOT be used."
// Nothing in this codebase imports this file anymore (verified by grep).
// All AI calls now go through the provider-agnostic
// backend/src/lib/llmProvider.js, whose active provider is Google Gemini
// Flash. This file is left in place for reference/history only.
// =============================================================================

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6'

function hasApiKey() {
  return !!ANTHROPIC_API_KEY
}

/**
 * Calls the real Anthropic API. Throws a plain Error with a clear message on
 * any failure — callers decide the HTTP status to return.
 */
async function callClaude(system, messages) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('No AI provider connected. Set ANTHROPIC_API_KEY in backend/.env to enable this chat.')
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 1024, system, messages })
  })

  const data = await response.json()
  if (!response.ok) {
    throw new Error(data?.error?.message || 'The AI provider request failed')
  }

  return (data.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
}

/**
 * Same as callClaude(), but also returns real token usage from the
 * Anthropic API response — used only by NEW, explicitly-paid AI actions
 * (Phase 12's code generation) so their real cost impact can be shown
 * honestly, without changing callClaude()'s existing return shape and
 * breaking CEO Brain / Director Brains, which already depend on it
 * returning a plain string.
 */
async function callClaudeWithUsage(system, messages, maxTokens = 1024) {
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
    body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: maxTokens, system, messages })
  })

  const data = await response.json()
  if (!response.ok) {
    throw new Error(data?.error?.message || 'The AI provider request failed')
  }

  const text = (data.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')

  return { text, usage: { inputTokens: data.usage?.input_tokens || 0, outputTokens: data.usage?.output_tokens || 0 } }
}

module.exports = { callClaude, callClaudeWithUsage, hasApiKey }
