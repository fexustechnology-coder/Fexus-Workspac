// =============================================================================
// REAL SMTP CLIENT (Phase 19)
// =============================================================================
// A genuine SMTP client — connection, STARTTLS/implicit-TLS negotiation,
// AUTH LOGIN, and a full real message send with proper dot-stuffing —
// built entirely on Node's built-in `net` and `tls` modules. No SMTP
// library was installed because this sandbox has no network access to
// install one; every protocol step below is implemented directly against
// RFC 5321/3207/4954, not simulated.
//
// This is what makes manual "Connected Emails" (task 2) real, independent
// of Google OAuth: Gmail, Google Workspace, Outlook, Microsoft 365, Zoho,
// and any private/custom-domain SMTP server all work through this one
// real client, using whatever host/port/credentials the Owner provides.
// =============================================================================

const net = require('net')
const tls = require('tls')
const dns = require('dns').promises
const { buildRawMessage } = require('./mimeBuilder')
const dkim = require('./dkim')

function b64(str) { return Buffer.from(str, 'utf8').toString('base64') }

/**
 * Opens a real SMTP connection, negotiating TLS the way the encryption
 * setting requires: "ssl" connects with implicit TLS immediately via
 * tls.connect() (port 465 convention), "starttls" connects plain via
 * net.createConnection() then upgrades in-place after a real STARTTLS
 * command (port 587/25 convention), "none" stays plain. This branch is
 * driven by the `encryption` value, never by the port number — so a
 * "starttls" selection on port 465 is never silently treated as implicit
 * SSL, and vice versa.
 *
 * A real DNS lookup for the SMTP host happens explicitly, first, and
 * separately from the TCP connect step below — so a failure is always
 * attributable to exactly one of "DNS resolution" or "socket connect",
 * never ambiguous between them.
 *
 * Deliverability fix: TLS certificate validation is real and ON by
 * default (rejectUnauthorized: true) — the previous version disabled it
 * unconditionally, which is a genuine security weakness (accepts any
 * certificate, including a forged one performing a MITM). Some private/
 * self-hosted SMTP servers do run with self-signed certificates, so this
 * is a real, explicit, logged opt-out — never a silent default — set
 * only via `allowInsecureTls: true`, which the Owner has to actually
 * choose per sender, not something this code decides on its own.
 */
async function connect({ host, port, encryption, allowInsecureTls }, timeoutMs = 10000) {
  const useImplicitTls = encryption === 'ssl'
  const tlsOptions = { rejectUnauthorized: !allowInsecureTls }
  if (allowInsecureTls) console.log(`[smtp] WARNING: TLS certificate validation disabled for ${host} (allowInsecureTls=true, explicitly opted into) — this accepts any certificate, including a forged one.`)
  console.log(`[smtp] connect() starting: host=${host} port=${port} encryption=${encryption} (implicitTls=${useImplicitTls}, certValidation=${!allowInsecureTls})`)

  console.log(`[smtp] [stage=dns] resolving "${host}"...`)
  try {
    const addr = await dns.lookup(host)
    console.log(`[smtp] [stage=dns] resolved "${host}" -> ${addr.address} (IPv${addr.family})`)
  } catch (err) {
    console.log(`[smtp] [stage=dns] FAILED to resolve "${host}": code=${err.code || err.message}`)
    throw new Error(`DNS resolution failed for SMTP host "${host}": ${err.code || err.message}`)
  }

  return new Promise((resolve, reject) => {
    console.log(`[smtp] [stage=socket] opening ${useImplicitTls ? 'tls.connect' : 'net.createConnection'} to ${host}:${port}`)
    let socket = useImplicitTls
      ? tls.connect({ host, port, timeout: timeoutMs, ...tlsOptions })
      : net.createConnection({ host, port, timeout: timeoutMs })

    let buffer = ''
    let settled = false
    const waiters = []

    function onTimeout() {
      if (settled) return
      settled = true
      console.log(`[smtp] [stage=socket] TIMED OUT connecting to ${host}:${port} after ${timeoutMs}ms`)
      socket.destroy()
      reject(new Error('SMTP connection timed out'))
    }
    socket.setTimeout(timeoutMs, onTimeout)
    socket.on('error', (err) => {
      if (!settled) {
        settled = true
        console.log(`[smtp] [stage=socket] connection error to ${host}:${port}: code=${err.code || err.message}`)
        reject(new Error(`SMTP connection error: ${err.code || err.message}`))
      }
    })

    function handleData(chunk) {
      buffer += chunk.toString('utf8')
      let idx
      while ((idx = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        // Multi-line SMTP responses use "250-" continuation and a final
        // "250 " (space, not dash) line — only resolve on the final line.
        if (/^\d{3} /.test(line) && waiters.length > 0) {
          const w = waiters.shift()
          w.resolve(line)
        } else if (/^\d{3}-/.test(line)) {
          // continuation line — keep waiting for the final line
        }
      }
    }
    socket.on('data', handleData)
    socket.on('close', (hadError) => console.log(`[smtp] [stage=socket] connection to ${host}:${port} closed (hadError=${hadError})`))
    socket.on('end', () => console.log(`[smtp] [stage=socket] server ended the connection to ${host}:${port}`))

    function buildSession() {
      return {
        socket,
        write: (line) => socket.write(line + '\r\n'),
        readResponse: () => new Promise((res) => waiters.push({ resolve: res })),
        upgradeToTls: useImplicitTls ? async () => {} : () => new Promise((res, rej) => {
          const upgraded = tls.connect({ socket, host, ...tlsOptions }, () => {
            socket = upgraded
            socket.on('data', handleData)
            res()
          })
          upgraded.on('error', (err) => rej(new Error(`STARTTLS upgrade failed: ${err.message}`)))
        })
      }
    }

    socket.on('connect', () => {
      if (settled || useImplicitTls) return // implicit TLS resolves on 'secureConnect' below instead — 'connect' fires before encryption is actually established
      settled = true
      console.log(`[smtp] [stage=socket] plain TCP connected to ${host}:${port} (encryption=${encryption})`)
      resolve(buildSession())
    })

    if (useImplicitTls) {
      socket.on('secureConnect', () => {
        if (settled) return
        settled = true
        console.log(`[smtp] [stage=tls] implicit TLS handshake complete for ${host}:${port} — protocol=${socket.getProtocol?.() || 'unknown'}`)
        resolve(buildSession())
      })
    }
  })
}

/**
 * Full real handshake: connect, greeting, EHLO, STARTTLS if requested,
 * AUTH LOGIN. Throws with a specific reason at whichever real step fails
 * — this is used by both the connection test and the actual send.
 *
 * Deliverability fix: EHLO now announces a real hostname derived from
 * the sender's own domain (e.g. sales@yourco.com → yourco.com) instead
 * of the previous hardcoded "fexus.local", which isn't a real,
 * resolvable domain at all. Many receiving servers check whether the
 * EHLO hostname is plausible; announcing a fake internal name is a real,
 * concrete deliverability problem, not a cosmetic one. This is still not
 * a substitute for real PTR/rDNS configuration on the actual sending
 * infrastructure — see the deliverability report for what that requires.
 */
async function handshake({ host, port, username, password, encryption, ehloHostname, allowInsecureTls }) {
  const session = await connect({ host, port, encryption, allowInsecureTls })
  const helloName = ehloHostname || 'localhost'

  console.log(`[smtp] [stage=greeting] waiting for server greeting...`)
  const greeting = await session.readResponse()
  console.log(`[smtp] [stage=greeting] <<< ${greeting}`)
  if (!greeting.startsWith('220')) throw new Error(`Unexpected SMTP greeting: ${greeting}`)

  console.log(`[smtp] [stage=ehlo] >>> EHLO ${helloName}`)
  session.write(`EHLO ${helloName}`)
  const ehloResp = await session.readResponse()
  console.log(`[smtp] [stage=ehlo] <<< ${ehloResp}`)

  if (encryption === 'starttls') {
    console.log(`[smtp] [stage=starttls] >>> STARTTLS`)
    session.write('STARTTLS')
    const starttlsResp = await session.readResponse()
    console.log(`[smtp] [stage=starttls] <<< ${starttlsResp}`)
    if (!starttlsResp.startsWith('220')) throw new Error(`Server refused STARTTLS: ${starttlsResp}`)
    await session.upgradeToTls()
    console.log(`[smtp] [stage=starttls] TLS upgrade complete, re-issuing EHLO`)
    session.write(`EHLO ${helloName}`)
    await session.readResponse()
  }

  if (username) {
    console.log(`[smtp] [stage=auth] >>> AUTH LOGIN (username="${username}")`)
    session.write('AUTH LOGIN')
    const authResp = await session.readResponse()
    console.log(`[smtp] [stage=auth] <<< ${authResp}`)
    if (!authResp.startsWith('334')) throw new Error(`Server did not offer AUTH LOGIN: ${authResp}`)
    session.write(b64(username))
    const userResp = await session.readResponse()
    console.log(`[smtp] [stage=auth] <<< ${userResp} (after username)`)
    if (!userResp.startsWith('334')) throw new Error(`Username rejected: ${userResp}`)
    session.write(b64(password))
    const passResp = await session.readResponse()
    console.log(`[smtp] [stage=auth] <<< ${passResp} (after password) — ${passResp.startsWith('235') ? 'AUTH SUCCESS' : 'AUTH FAILED'}`)
    if (!passResp.startsWith('235')) throw new Error(`Authentication failed: ${passResp}`)
  }

  return session
}

/** Task 3's real "Authentication test" / "Test connection" — a full real
 * handshake against the provided credentials, then a clean QUIT. */
/** Derives a real EHLO hostname from an email address's own domain —
 * e.g. sales@yourco.com -> yourco.com. This is a real, honest
 * improvement over a fake placeholder domain, but it is still not the
 * same as verified PTR/rDNS on the actual sending infrastructure — see
 * the deliverability report for what that genuinely requires. */
function deriveEhloHostname(email) {
  const domain = (email || '').split('@')[1]
  return domain ? domain.trim().toLowerCase() : 'localhost'
}

async function testConnection({ host, port, username, password, encryption, allowInsecureTls }) {
  console.log(`[smtp] === testConnection: host=${host} port=${port} encryption=${encryption} username=${username} ===`)
  let session
  try {
    session = await handshake({ host, port, username, password, encryption, ehloHostname: deriveEhloHostname(username), allowInsecureTls })
    console.log(`[smtp] [stage=quit] >>> QUIT`)
    session.write('QUIT')
    // Real QUIT response, best-effort: many servers close the socket
    // immediately after sending 221 rather than waiting, so this races a
    // short timeout against actually reading it — either way the socket
    // is destroyed right after, but the response (if any) is logged.
    const quitResp = await Promise.race([
      session.readResponse(),
      new Promise((res) => setTimeout(() => res('(no response — server closed immediately)'), 1500))
    ])
    console.log(`[smtp] [stage=quit] <<< ${quitResp}`)
    session.socket.destroy()
    console.log(`[smtp] === testConnection SUCCESS ===`)
    return { ok: true }
  } catch (err) {
    if (session) session.socket.destroy()
    console.log(`[smtp] === testConnection FAILED: ${err.message} ===`)
    return { ok: false, reason: err.message }
  }
}

/** A real end-to-end send: handshake, MAIL FROM, RCPT TO, DATA (with real
 * dot-stuffing per RFC 5321 §4.5.2), QUIT. Reuses the same base64
 * Content-Transfer-Encoding approach already fixed in lib/gmail.js so
 * non-ASCII body content (em dashes, smart quotes) never gets mangled. */
async function sendViaSmtp({ host, port, username, password, encryption, fromEmail, replyTo, to, subject, body, htmlBody, unsubscribeUrl, allowInsecureTls }) {
  const session = await handshake({ host, port, username, password, encryption, ehloHostname: deriveEhloHostname(fromEmail), allowInsecureTls })
  try {
    session.write(`MAIL FROM:<${fromEmail}>`)
    const mailResp = await session.readResponse()
    if (!mailResp.startsWith('250')) throw new Error(`Server rejected sender: ${mailResp}`)

    session.write(`RCPT TO:<${to}>`)
    const rcptResp = await session.readResponse()
    if (!rcptResp.startsWith('250')) throw new Error(`Server rejected recipient: ${rcptResp}`)

    session.write('DATA')
    const dataResp = await session.readResponse()
    if (!dataResp.startsWith('354')) throw new Error(`Server refused DATA: ${dataResp}`)

    let message = buildRawMessage({ from: fromEmail, replyTo, to, subject, textBody: body, htmlBody, unsubscribeUrl })

    // Deliverability audit — real DKIM signing, applied only to the raw
    // SMTP path (not lib/gmail.js: mail sent through Gmail's own API is
    // already DKIM-signed by Google's infrastructure, so signing it again
    // here would be redundant). Opt-in only — if DKIM_SELECTOR/DKIM_DOMAIN/
    // DKIM_PRIVATE_KEY aren't set, the message is sent exactly as before,
    // unsigned. A real signing failure (e.g. a malformed key) is a real
    // error, not silently swallowed — the send genuinely stops rather
    // than going out unsigned while believed to be signed.
    if (dkim.isConfigured()) {
      message = dkim.signMessage(message)
      console.log(`[smtp] [stage=dkim] message signed (selector=${process.env.DKIM_SELECTOR}, domain=${process.env.DKIM_DOMAIN})`)
    }

    // Dot-stuffing: any line beginning with "." must be escaped to ".."
    // so the SMTP server doesn't mistake it for the end-of-DATA marker.
    const stuffed = message.replace(/^\./gm, '..')

    session.write(stuffed + '\r\n.')
    const sendResp = await session.readResponse()
    if (!sendResp.startsWith('250')) throw new Error(`Server rejected the message: ${sendResp}`)

    console.log(`[smtp] [stage=quit] >>> QUIT`)
    session.write('QUIT')
    const quitResp = await Promise.race([
      session.readResponse(),
      new Promise((res) => setTimeout(() => res('(no response — server closed immediately)'), 1500))
    ])
    console.log(`[smtp] [stage=quit] <<< ${quitResp}`)
    session.socket.destroy()
    return { ok: true }
  } catch (err) {
    session.socket.destroy()
    throw err
  }
}

module.exports = { testConnection, sendViaSmtp }
