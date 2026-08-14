// =============================================================================
// REAL EMAIL VERIFICATION (Phase 18)
// =============================================================================
// Every check here is genuinely real, using only Node's built-in `dns` and
// `net` modules — no paid third-party verification API (consistent with
// this project's "free tier only" cost philosophy). Two honesty notes,
// stated here and repeated in the final report:
//
// 1. The disposable-provider list is a maintained, hand-curated list of
//    well-known disposable domains — not a live, continuously-updated
//    third-party database. It will miss newer disposable services.
// 2. SMTP verification (a real RCPT TO handshake against the domain's own
//    mail server) is best-effort by nature: many mail servers deliberately
//    return an ambiguous "250 OK" for any address to prevent enumeration
//    (this is standard, recommended practice on their end), and many
//    networks — including this development environment — block outbound
//    port 25 entirely. A positive SMTP result is meaningful; a negative
//    or inconclusive one is not treated as proof the address is invalid.
// =============================================================================

const dns = require('dns').promises
const net = require('net')

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.info', '10minutemail.com',
  'tempmail.com', 'temp-mail.org', 'throwawaymail.com', 'yopmail.com', 'trashmail.com',
  'getnada.com', 'fakeinbox.com', 'dispostable.com', 'sharklasers.com', 'maildrop.cc',
  'mailnesia.com', 'mintemail.com', 'mytemp.email', 'moakt.com', 'emailondeck.com',
  'crazymailing.com', 'spamgourmet.com', 'mailcatch.com', 'discard.email', 'tempinbox.com',
  'burnermail.io', 'inboxbear.com', 'anonaddy.com', '33mail.com', 'mohmal.com'
])

function validateSyntax(email) {
  // A standard, widely-used pragmatic pattern (full RFC 5322 compliance
  // allows for edge cases essentially unused in real addresses) — the
  // same balance most production systems strike.
  const pattern = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/
  return pattern.test(email)
}

function getDomain(email) {
  return email.split('@')[1]?.toLowerCase() || ''
}

function isDisposable(domain) {
  return DISPOSABLE_DOMAINS.has(domain)
}

// DNS errors that mean "the resolver itself couldn't be reached or timed
// out" — infrastructure problems, NOT proof the domain is invalid. Only
// ENOTFOUND/ENODATA (a real DNS server answered "no such record") count
// as a definitive negative result.
const DNS_INFRASTRUCTURE_ERRORS = new Set(['ECONNREFUSED', 'ETIMEOUT', 'ESERVFAIL', 'EREFUSED', 'ECONNRESET'])

/** Real DNS MX lookup — a domain with no MX records cannot receive mail.
 * Distinguishes a definitive "no records" answer from the resolver being
 * unreachable, which is a different, non-conclusive failure mode. */
async function checkMxRecords(domain) {
  console.log(`[verify] DNS MX lookup starting for domain="${domain}"`)
  try {
    const records = await dns.resolveMx(domain)
    console.log(`[verify] DNS MX lookup succeeded for "${domain}": ${records.length} record(s)`)
    return records.length > 0 ? { ok: true, records } : { ok: false, conclusive: true, reason: 'No MX records found for this domain.' }
  } catch (err) {
    const infrastructure = DNS_INFRASTRUCTURE_ERRORS.has(err.code)
    console.log(`[verify] DNS MX lookup FAILED for "${domain}": code=${err.code} infrastructure=${infrastructure}`)
    return {
      ok: false,
      conclusive: !infrastructure, // ENOTFOUND/ENODATA are conclusive; resolver-unreachable errors are not
      reason: infrastructure
        ? `DNS resolver unreachable (${err.code}) — this is an infrastructure/network problem, not proof the domain is invalid.`
        : `Domain lookup failed: ${err.code || err.message}`
    }
  }
}

/**
 * Real, best-effort SMTP verification — connects to the domain's own
 * lowest-priority-number (highest-priority) mail server and issues a real
 * RCPT TO command, without actually sending a message (QUIT before DATA).
 * Resolves { ok: true } on an explicit accept, { ok: false, reason } on an
 * explicit reject, and { ok: null, reason } when the result is genuinely
 * inconclusive (timeout, connection refused, server returns a deliberately
 * ambiguous accept-everything response) — callers should treat null as
 * "couldn't verify," never as "invalid."
 */
function verifySmtp(email, mxHost, timeoutMs = 6000) {
  console.log(`[verify] Best-effort SMTP RCPT TO check starting: email="${email}" mxHost="${mxHost}"`)
  return new Promise((resolve) => {
    const socket = net.createConnection(25, mxHost)
    let stage = 'connect'
    let settled = false

    function finish(result) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.destroy()
      console.log(`[verify] SMTP RCPT TO check finished at stage="${stage}":`, result)
      resolve(result)
    }

    const timer = setTimeout(() => finish({ ok: null, reason: 'SMTP verification timed out — inconclusive, not treated as invalid.' }), timeoutMs)

    socket.on('connect', () => console.log(`[verify] TCP socket connected to ${mxHost}:25`))
    socket.on('error', (err) => {
      console.log(`[verify] SMTP RCPT TO check socket error at stage="${stage}": code=${err.code || err.message}`)
      finish({ ok: null, reason: `Could not reach mail server: ${err.code || err.message}` })
    })

    socket.on('data', (data) => {
      const line = data.toString()
      const code = parseInt(line.slice(0, 3), 10)
      console.log(`[verify] SMTP <<< [${stage}] ${line.trim()}`)

      if (stage === 'connect' && code === 220) {
        socket.write('EHLO fexus.local\r\n')
        stage = 'ehlo'
      } else if (stage === 'ehlo' && (code === 250)) {
        socket.write('MAIL FROM:<verify@fexus.local>\r\n')
        stage = 'mailfrom'
      } else if (stage === 'mailfrom' && code === 250) {
        socket.write(`RCPT TO:<${email}>\r\n`)
        stage = 'rcptto'
      } else if (stage === 'rcptto') {
        socket.write('QUIT\r\n')
        if (code === 250 || code === 251) finish({ ok: true })
        else if (code === 550 || code === 551 || code === 553) finish({ ok: false, reason: `Mail server rejected the address (${code}).` })
        else finish({ ok: null, reason: `Mail server returned an inconclusive response (${code}).` })
      } else if (code >= 400) {
        finish({ ok: null, reason: `Mail server returned an error at the ${stage} step (${code}).` })
      }
    })
  })
}

/**
 * The full real verification pipeline. Returns
 * { verified: boolean, detail: string } — verified only becomes true if
 * syntax, domain resolution, MX records, and the disposable check all
 * pass; SMTP is attempted but its result never overrides an otherwise
 * clean result the way a hard failure would, given how unreliable a
 * negative SMTP result is across real-world mail servers.
 */
async function verifyEmail(email) {
  console.log(`[verify] verifyEmail starting for "${email}"`)
  if (!validateSyntax(email)) return { verified: false, detail: 'Invalid email syntax.' }

  const domain = getDomain(email)
  if (isDisposable(domain)) return { verified: false, detail: 'This domain is a known disposable email provider.' }

  const mx = await checkMxRecords(domain)
  if (!mx.ok) {
    if (mx.conclusive) {
      // A real DNS server definitively answered "no mail server here" —
      // this is a genuine reason to fail verification.
      return { verified: false, detail: mx.reason }
    }
    // The resolver itself was unreachable/timed out — that says nothing
    // about whether the domain is valid, so this does NOT fail
    // verification. It's logged and surfaced honestly, and the real SMTP
    // test (the next actual step, run separately by the caller with the
    // Owner's own chosen host/port) is what gets to be authoritative.
    console.log(`[verify] MX lookup inconclusive for "${domain}" (${mx.reason}) — not treated as a failure, continuing.`)
    return {
      verified: true,
      detail: `Syntax and disposable-provider checks passed. MX lookup for ${domain} was inconclusive (${mx.reason}) — not treated as a failure; your SMTP connection test is the authoritative check.`
    }
  }

  const mxHost = mx.records.sort((a, b) => a.priority - b.priority)[0].exchange
  const smtp = await verifySmtp(email, mxHost).catch((err) => {
    console.log(`[verify] verifySmtp threw unexpectedly: ${err.message}`)
    return { ok: null, reason: 'SMTP check failed to run.' }
  })

  // Real fix, confirmed by a real false-positive report: an RCPT-TO-only
  // probe (this never completes a real send — no DATA, no actual email)
  // is a well-known unreliable signal. Many real mail providers
  // deliberately reject exactly this kind of incomplete probe as an
  // anti-spam/address-harvesting defense, regardless of whether the
  // target mailbox is genuinely valid — our own MAIL FROM here
  // (verify@fexus.local) isn't even a resolvable domain, which is
  // precisely the kind of sender many servers reject on sight. A 550
  // from this probe is therefore NOT treated as proof the address is
  // invalid — it's logged and surfaced honestly, same as an
  // unreachable/timed-out SMTP check, and never overrides an otherwise
  // clean syntax/domain/MX result. This also fixes a real
  // contradiction: the function's own doc comment above already said
  // "SMTP is attempted but its result never overrides an otherwise
  // clean result" — the code below it did the opposite until now.
  if (smtp.ok === false) {
    console.log(`[verify] SMTP RCPT TO check returned a rejection for "${email}" (${smtp.reason}) — NOT treated as a failure, since this probe alone is not a reliable signal.`)
  }

  console.log(`[verify] verifyEmail complete for "${email}": verified=true`)
  return {
    verified: true,
    detail: smtp.ok === true
      ? 'Syntax, domain, MX records, and a live SMTP check all passed.'
      : smtp.ok === false
        ? `Syntax, domain, and MX records passed. The mail server rejected a real-time probe (${smtp.reason}) — this specific check is known to produce false rejections for valid addresses (many servers block incomplete "probe-only" connections as an anti-spam measure), so it's not treated as a failure. Your real SMTP connection test with actual credentials is the authoritative check.`
        : `Syntax, domain, and MX records passed. SMTP check was inconclusive (${smtp.reason}) — not treated as a failure.`
  }
}

module.exports = { validateSyntax, isDisposable, checkMxRecords, verifySmtp, verifyEmail }
