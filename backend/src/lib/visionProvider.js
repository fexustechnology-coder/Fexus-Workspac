// =============================================================================
// FEXUS VISION PROVIDER (Computer-Use Observation Engine)
// =============================================================================
// A real, separate capability check — this NEVER assumes the active
// text model (GROQ_MODEL, confirmed text-only: llama-3.3-70b-versatile)
// can see images. Screen analysis only runs if VISION_MODEL is
// explicitly configured; otherwise isConfigured() returns false and
// every caller must treat that as "screen understanding did not occur,"
// never silently degrade to a guess.
//
// Uses the same real Groq OpenAI-compatible chat completions endpoint
// lib/llmProvider.js already calls for text, with an image content
// block added — the real, standard vision request shape, not a
// custom/invented API.
// =============================================================================

const { extractJson } = require('./llmProvider')

const GROQ_API_KEY = process.env.GROQ_API_KEY
const VISION_MODEL = process.env.VISION_MODEL || ''

function isConfigured() {
  return !!(GROQ_API_KEY && VISION_MODEL)
}

/**
 * Real screen analysis. Takes a real base64 PNG (from the Local Agent's
 * captureScreen()) and a real question, returns a structured
 * description with a genuine confidence score per identified element —
 * never a fabricated coordinate. Throws a real, explicit configuration
 * error if isConfigured() is false — callers must not proceed as if
 * observation happened.
 */
async function analyzeScreen(imageBase64, question) {
  if (!isConfigured()) {
    const err = new Error('Screen observation is not configured — set VISION_MODEL (and confirm GROQ_API_KEY) in backend/.env to a real vision-capable model. Text-only models cannot be used for this.')
    err.visionNotConfigured = true
    throw err
  }

  const system = `You are FEXUS's Computer-Use Observation Engine. You are shown a real screenshot of the Owner's actual Windows screen. Describe ONLY what is genuinely visible — never invent an element, a coordinate, or a piece of text that isn't really there.

Respond with ONLY this JSON object:
{
  "application": "the application/window that appears to be in focus, or null",
  "pageTitle": "visible page/window title if any, or null",
  "url": "a visible URL if the browser's address bar is visible, or null",
  "visibleText": "a short summary of the meaningfully visible text",
  "elements": [
    { "label": "e.g. 'Search box', 'Compose button'", "kind": "button|input|link|menu|dialog", "approxX": 0, "approxY": 0, "confidence": 0.0 }
  ],
  "targetElement": null,
  "targetConfidence": 0.0
}

approxX/approxY are your best real estimate of the element's center in screen pixels, based on what's actually visible in the image — never a placeholder or default value. confidence is a real 0.0-1.0 estimate of how sure you are that element is genuinely present and correctly located — a low number is expected and correct when you're not sure, not a failure.

If the question asks you to find a SPECIFIC target element, also set targetElement to the matching entry from "elements" and targetConfidence to your real confidence in that specific match — never above 0.85 unless the element is unambiguous and clearly visible.`

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: [
          { type: 'text', text: question || 'Describe what is visible on this screen.' },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } }
        ] }
      ],
      max_tokens: 1500
    })
  })

  const data = await response.json()
  if (!response.ok) throw new Error(data?.error?.message || 'Vision API request failed')

  const text = data.choices?.[0]?.message?.content || ''
  let parsed
  try {
    parsed = extractJson(text)
  } catch (err) {
    console.error('[visionProvider] Failed to parse a structured observation. Raw model output:', text)
    console.error('[visionProvider] Real parse error:', err.message)
    throw new Error('Vision model did not return a valid structured observation.')
  }
  return parsed
}

module.exports = { isConfigured, analyzeScreen }
