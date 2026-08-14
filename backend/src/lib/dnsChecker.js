// =============================================================================
// REAL DNS DELIVERABILITY CHECKER (Deliverability Audit — Phase 15)
// =============================================================================
// Real DNS TXT/MX lookups via Node's built-in `dns` module — no invented
// or assumed results. Every check distinguishes three real outcomes:
//   - a genuine, confirmed record was found (pass)
//   - the DNS server definitively answered "no such record" (fail)
//   - the lookup itself couldn't be completed from here — no network
//     access, timeout, resolver unreachable (unknown — NEVER reported
//     as a pass or a fail, exactly as required)
// =============================================================================

const dns = require('dns').promises

const INFRASTRUCTURE_ERRORS = new Set(['ECONNREFUSED', 'ETIMEOUT', 'ESERVFAIL', 'EREFUSED', 'ECONNRESET'])

function classify(err) {
  if (err.code === 'ENOTFOUND' || err.code === 'ENODATA') return 'not_found'
  if (INFRASTRUCTURE_ERRORS.has(err.code)) return 'unavailable'
  return 'unavailable'
}

async function checkSpf(domain) {
  try {
    const records = await dns.resolveTxt(domain)
    const flat = records.map((r) => r.join(''))
    const spfRecords = flat.filter((r) => r.toLowerCase().startsWith('v=spf1'))
    if (spfRecords.length === 0) return { status: 'fail', detail: 'No SPF (v=spf1) TXT record found at the domain root.' }
    if (spfRecords.length > 1) return { status: 'fail', detail: `Multiple SPF records found (${spfRecords.length}) — this is invalid per RFC 7208 and will cause SPF to fail entirely. Only one is allowed.`, records: spfRecords }
    return { status: 'pass', detail: 'Exactly one SPF record found.', record: spfRecords[0] }
  } catch (err) {
    const kind = classify(err)
    if (kind === 'not_found') return { status: 'fail', detail: 'No TXT records found at the domain root at all.' }
    return { status: 'unknown', detail: `Unable to verify from this environment (${err.code || err.message}).` }
  }
}

async function checkDkim(domain, selector) {
  if (!selector) return { status: 'unknown', detail: 'No DKIM selector configured (DKIM_SELECTOR) — nothing to check yet.' }
  try {
    const records = await dns.resolveTxt(`${selector}._domainkey.${domain}`)
    const flat = records.map((r) => r.join(''))
    const dkimRecord = flat.find((r) => r.toLowerCase().includes('v=dkim1') || r.toLowerCase().includes('p='))
    if (!dkimRecord) return { status: 'fail', detail: `No valid DKIM TXT record found at ${selector}._domainkey.${domain}.` }
    return { status: 'pass', detail: 'DKIM public key record found.', record: dkimRecord.length > 80 ? dkimRecord.slice(0, 80) + '... (truncated)' : dkimRecord }
  } catch (err) {
    const kind = classify(err)
    if (kind === 'not_found') return { status: 'fail', detail: `No DKIM record found at ${selector}._domainkey.${domain}.` }
    return { status: 'unknown', detail: `Unable to verify from this environment (${err.code || err.message}).` }
  }
}

async function checkDmarc(domain) {
  try {
    const records = await dns.resolveTxt(`_dmarc.${domain}`)
    const flat = records.map((r) => r.join(''))
    const dmarcRecord = flat.find((r) => r.toLowerCase().startsWith('v=dmarc1'))
    if (!dmarcRecord) return { status: 'fail', detail: 'No DMARC (v=DMARC1) TXT record found at _dmarc.' + domain }
    const policyMatch = dmarcRecord.match(/p=(\w+)/i)
    return { status: 'pass', detail: `DMARC record found (policy: ${policyMatch ? policyMatch[1] : 'unknown'}).`, record: dmarcRecord }
  } catch (err) {
    const kind = classify(err)
    if (kind === 'not_found') return { status: 'fail', detail: 'No DMARC record found at _dmarc.' + domain }
    return { status: 'unknown', detail: `Unable to verify from this environment (${err.code || err.message}).` }
  }
}

async function checkMx(domain) {
  try {
    const records = await dns.resolveMx(domain)
    if (records.length === 0) return { status: 'fail', detail: 'No MX records found.' }
    return { status: 'pass', detail: `${records.length} MX record(s) found.`, records: records.sort((a, b) => a.priority - b.priority) }
  } catch (err) {
    const kind = classify(err)
    if (kind === 'not_found') return { status: 'fail', detail: 'No MX records found — this domain cannot receive mail.' }
    return { status: 'unknown', detail: `Unable to verify from this environment (${err.code || err.message}).` }
  }
}

async function runFullCheck(domain) {
  const selector = process.env.DKIM_SELECTOR || ''
  const [spf, dkim, dmarc, mx] = await Promise.all([
    checkSpf(domain), checkDkim(domain, selector), checkDmarc(domain), checkMx(domain)
  ])
  return { domain, checkedAt: new Date().toISOString(), spf, dkim, dmarc, mx }
}

module.exports = { checkSpf, checkDkim, checkDmarc, checkMx, runFullCheck }
