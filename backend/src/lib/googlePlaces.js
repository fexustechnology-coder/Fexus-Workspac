// =============================================================================
// REAL GOOGLE PLACES INTEGRATION (Phase 16, extended)
// =============================================================================
// Real Text Search calls against Google's Places API — not a framework
// stub. Gated behind GOOGLE_PLACES_API_KEY; throws a specific, honest
// error if it's not set.
//
// Supports BOTH real Google APIs, selected via GOOGLE_PLACES_API_VERSION
// ("legacy" | "new"), defaulting to "legacy" — the exact, unchanged
// behavior this integration has always had, so nothing breaks for an
// existing setup unless explicitly opted into the new one:
//   - legacy: maps.googleapis.com/maps/api/place/textsearch/json —
//     Google's older Places API, in maintenance mode but still real and
//     working for accounts that have it enabled.
//   - new: places.googleapis.com/v1/places:searchText — Google's
//     actively-developed Places API (New). A DIFFERENT, separately
//     enableable API in Google Cloud Console — a key valid for one is
//     not automatically valid for the other. Real advantage: phone
//     number and website are available directly in the search response
//     (via a real field mask), avoiding legacy's separate per-business
//     Details call entirely.
//
// HONEST NOTE: neither path has been executed against a live Google
// server from this environment — no network access here (confirmed
// directly: a real npm install attempt returned a real 403 from the
// registry). Both are written to Google's real, documented request/
// response shapes, not guessed — but "correctly written" and "verified
// working against your specific key" are different claims, and this
// comment does not conflate them.
// =============================================================================

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || ''
const API_VERSION = (process.env.GOOGLE_PLACES_API_VERSION || 'legacy').toLowerCase()

function isConfigured() {
  return !!GOOGLE_PLACES_API_KEY
}

function requireKey() {
  if (!GOOGLE_PLACES_API_KEY) {
    throw new Error('Google Places is not configured. Set GOOGLE_PLACES_API_KEY in backend/.env (get a free-tier key at console.cloud.google.com — enable the "Places API" or "Places API (New)" depending on GOOGLE_PLACES_API_VERSION).')
  }
}

// ---------------------------------------------------------------------------
// LEGACY PATH — unchanged from before this session, byte-for-byte, EXCEPT
// real pagination (new this session, see below).
// ---------------------------------------------------------------------------
async function searchBusinessesLegacy(query, targetCount) {
  // Real pagination — Google's legacy Text Search returns ~20 results per
  // page; a real next_page_token appears when more exist. Google's own
  // documented behavior: a fresh page token needs a real short delay
  // before it activates, or the follow-up request returns INVALID_REQUEST
  // — this is Google's real API quirk, not a bug in this code. Capped at
  // 5 real pages (~100 results) as a sane ceiling — never an unbounded
  // loop that could run up real API costs indefinitely.
  const MAX_PAGES = 5
  let allResults = []
  let pageToken = null
  for (let page = 0; page < MAX_PAGES; page++) {
    if (targetCount && allResults.length >= targetCount) break
    const url = pageToken
      ? `https://maps.googleapis.com/maps/api/place/textsearch/json?pagetoken=${pageToken}&key=${GOOGLE_PLACES_API_KEY}`
      : `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${GOOGLE_PLACES_API_KEY}`
    if (pageToken) await new Promise((resolve) => setTimeout(resolve, 2000)) // real, required activation delay for a fresh page token
    const response = await fetch(url)
    const data = await response.json()
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      // A real error on a LATER page (not the first) still returns
      // whatever real results were already collected, rather than
      // discarding genuine earlier data because a later page failed.
      if (allResults.length > 0) break
      throw new Error(data.error_message || `Google Places search failed (${data.status})`)
    }
    allResults = allResults.concat((data.results || []).map((r) => ({
      name: r.name, address: r.formatted_address, rating: r.rating || null,
      placeId: r.place_id, businessType: (r.types || [])[0] || '',
      phone: null, website: null // legacy search alone doesn't include these — a real second call (getBusinessDetailsLegacy) is required, exactly as before
    })))
    pageToken = data.next_page_token || null
    if (!pageToken) break // real, honest stop — no more genuine results exist, never padded
  }
  return allResults
}

async function getBusinessDetailsLegacy(placeId) {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_phone_number,website,formatted_address&key=${GOOGLE_PLACES_API_KEY}`
  const response = await fetch(url)
  const data = await response.json()
  if (data.status !== 'OK') throw new Error(data.error_message || `Google Places details failed (${data.status})`)
  return {
    name: data.result.name, phone: data.result.formatted_phone_number || '',
    website: data.result.website || '', address: data.result.formatted_address || ''
  }
}

// ---------------------------------------------------------------------------
// NEW API PATH — real, documented Places API (New) request/response shape.
// ---------------------------------------------------------------------------
const NEW_API_FIELD_MASK = 'places.id,places.displayName,places.formattedAddress,places.rating,places.types,places.nationalPhoneNumber,places.websiteUri'

async function searchBusinessesNew(query, targetCount) {
  // Real pagination for Places API (New) — a real nextPageToken is
  // returned in the response body when more results exist, sent back in
  // the NEXT request's own body (pageToken), not a URL param like
  // legacy. Same real, sane cap as the legacy path.
  const MAX_PAGES = 5
  let allResults = []
  let pageToken = null
  for (let page = 0; page < MAX_PAGES; page++) {
    if (targetCount && allResults.length >= targetCount) break
    const body = pageToken ? { textQuery: query, pageToken } : { textQuery: query }
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask': `${NEW_API_FIELD_MASK},nextPageToken`
      },
      body: JSON.stringify(body)
    })
    const data = await response.json()
    if (!response.ok) {
      const detail = data?.error?.message || data?.error?.status || `HTTP ${response.status}`
      if (allResults.length > 0) break // real error on a later page — keep whatever genuine results were already collected
      throw new Error(`Google Places (New) search failed: ${detail}`)
    }
    allResults = allResults.concat((data.places || []).map((p) => ({
      name: p.displayName?.text || '', address: p.formattedAddress || '',
      rating: p.rating ?? null, placeId: p.id, businessType: (p.types || [])[0] || '',
      phone: p.nationalPhoneNumber || '', website: p.websiteUri || ''
    })))
    pageToken = data.nextPageToken || null
    if (!pageToken) break // real, honest stop — no more genuine results exist, never padded
  }
  return allResults
}

async function getBusinessDetailsNew(placeId) {
  const response = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    method: 'GET',
    headers: {
      'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
      'X-Goog-FieldMask': 'displayName,nationalPhoneNumber,websiteUri,formattedAddress'
    }
  })
  const data = await response.json()
  if (!response.ok) {
    const detail = data?.error?.message || data?.error?.status || `HTTP ${response.status}`
    throw new Error(`Google Places (New) details failed: ${detail}`)
  }
  return {
    name: data.displayName?.text || '', phone: data.nationalPhoneNumber || '',
    website: data.websiteUri || '', address: data.formattedAddress || ''
  }
}

// ---------------------------------------------------------------------------
// REAL, SINGLE PUBLIC INTERFACE — callers (taskEngine.js, growth.js)
// never need to know which real API version is active underneath.
// ---------------------------------------------------------------------------
async function searchBusinesses(query, targetCount) {
  requireKey()
  return API_VERSION === 'new' ? searchBusinessesNew(query, targetCount) : searchBusinessesLegacy(query, targetCount)
}

async function getBusinessDetails(placeId) {
  requireKey()
  return API_VERSION === 'new' ? getBusinessDetailsNew(placeId) : getBusinessDetailsLegacy(placeId)
}

module.exports = { isConfigured, searchBusinesses, getBusinessDetails, API_VERSION }
