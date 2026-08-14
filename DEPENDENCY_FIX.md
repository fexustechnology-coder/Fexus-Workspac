# Backend Startup Fix — iconv-lite MODULE_NOT_FOUND

## An honest limitation, stated first

This sandbox has no Windows, and I confirmed directly (not assumed) that
it has **no network access to the real npm registry either** —
attempting `npm install` here returns a real `403 Forbidden` from
`registry.npmjs.org`. That means I cannot run `npm install`, generate a
real `package-lock.json`, or watch `npm run dev` actually succeed on
your machine. Everything below is a real diagnosis grounded in how
npm/Node module resolution actually works, and real, concrete changes to
the project files I do have access to — not a claim that I reproduced
and fixed this live.

---

## 1. Root cause — most likely, ranked by probability

**#1 (most likely): a corrupted or incomplete `node_modules` install.**

This is the classic signature of the exact symptom you described:
`npm ls iconv-lite` shows the package because `npm ls` builds its report
from `package.json`/the dependency tree metadata and the presence of
each package's own `package.json` — **it does not verify that every
individual file inside a package (like `lib/index.js`) actually exists
on disk.** So a package can be "present" from `npm ls`'s point of view
while genuinely missing files, if the install that wrote it was
interrupted or partially failed. Common real causes on Windows
specifically:
- **Path length limits.** If this project lives somewhere deeply nested
  (inside OneDrive, several folders deep, etc.), Windows' historical
  260-character path limit can silently truncate/skip writing some
  nested files during `npm install`, especially inside deeply-nested
  `node_modules` trees — while the parent package directory and its
  `package.json` still get created.
- **Antivirus/Windows Defender interference** — real-time scanning can
  lock or quarantine files mid-write during a large `npm install`.
- **An interrupted install** — closing the terminal, a network blip, or
  running another npm command in a second terminal during the same
  install.
- **npm cache corruption** — a corrupted cached copy of `iconv-lite` gets
  reused by every subsequent install until the cache itself is cleared.

**#2 (a real, secondary risk factor, not ruled out): Node.js v24.**

Node 24 is very new. Whether or not it's the direct cause of this
specific error, running a brand-new major version against a dependency
tree that was mostly validated against Node 18/20/22-era tooling is a
real, legitimate source of subtle incompatibilities — and per your own
instruction, migrating to a mature LTS is a reasonable stabilization
step regardless of whether it's the exact root cause here. **I want to
be honest that I can't confirm from this sandbox whether Node 24 is
directly implicated** — I don't have that Node version available to
test against, and the missing-file symptom you described is much more
commonly an install-corruption issue than a Node-version compatibility
issue for a package as simple as `iconv-lite` (it's a plain CommonJS
module with no native bindings).

**#3, confirmed and fixed regardless of the above: no `package-lock.json` existed in this project at all.**

I checked directly — neither the backend nor the root project had a
lock file. This means every `npm install` you've run has been resolving
the entire dependency tree fresh against whatever's currently on the
registry, which is inherently less reproducible than an installs pinned
to exact, tested versions. It also means `npm ci` (which your own brief
correctly identifies as the more reliable install command) **would
fail outright** with no lock file to install from — it requires one to
exist. I cannot generate a real one from this sandbox (no registry
access), but the fix procedure below produces one on your machine as a
natural side effect of `npm install`, which you should then commit.

---

## 2. Node version — what I changed, and why

Added a real `engines` field (`"node": ">=20.0.0 <21.0.0"`) to
`package.json`, `backend/package.json`, and `local-agent/package.json`,
plus a `.nvmrc` file (`20`) in each of those three directories.

This does not, by itself, fix a corrupted install — it's a real,
standard safeguard so `npm install` will warn (or `nvm use` will
auto-select) Node 20 going forward, reducing the chance of this
specific class of "very new Node version + large dependency tree"
risk recurring. **Whether Node 20 was strictly required to fix your
current error is something I cannot confirm from here** — the clean
reinstall procedure below is the more direct fix for the exact symptom
you reported, and I'd recommend trying it on Node 20 as the more
conservative, tested combination rather than assuming Node 24 was
definitely the cause.

---

## 3. The exact fix procedure — run this on your Windows machine

```powershell
# 1. Confirm/switch to Node 20 (install nvm-windows first if you don't have it: https://github.com/coreybutler/nvm-windows)
nvm install 20
nvm use 20
node --version    # should print v20.x.x
npm --version

# 2. From the backend folder — a genuinely clean slate, not a partial fix
cd backend
rmdir /s /q node_modules
del package-lock.json
npm cache clean --force

# 3. Fresh install — this is where a real package-lock.json gets created
npm install

# 4. Verify the exact file that was missing now genuinely exists
dir node_modules\iconv-lite\lib\index.js

# 5. Confirm npm's own view is now backed by real files
npm ls iconv-lite

# 6. Try starting the backend
npm run dev
```

If step 4 shows the file exists and step 6 stays running without the
`MODULE_NOT_FOUND` error, the corrupted-install theory was correct and
this is resolved. If it still fails on Node 20 with a clean install,
that's real, useful information — it would mean the problem is more
likely path-length or antivirus interference specific to where this
project lives on your disk, and moving the project to a short path
(e.g. `C:\fexus\` instead of somewhere deeply nested under Documents or
OneDrive) is the next real thing to try.

**Please commit the resulting `backend/package-lock.json`** once this
succeeds — that's what makes `npm ci` (a faster, more reproducible
install) usable going forward, and prevents future installs from
silently resolving different transitive dependency versions.

---

## 4. CORS / frontend port — checked, already correct

Read the actual code rather than assuming: backend CORS
(`backend/src/server.js`) defaults `FRONTEND_ORIGIN` to
`http://localhost:5174`; the frontend's `vite.config.js` runs on port
`5174`; the frontend's API client defaults `BASE_URL` to
`http://localhost:4000`; the backend's own `PORT` defaults to `4000`.
**These already agree — no change was needed or made here.**

## 5. Local Agent URL — checked, already correct

`LocalAgentPairing.agentUrl` defaults to `http://localhost:9911`,
matching your Local Agent's own default port (`local-agent/config.js`'s
`LOCAL_AGENT_PORT` default is `9911`). `localhost` and `127.0.0.1`
resolve to the same place, so your reported `http://127.0.0.1:9911` is
consistent with this. No change needed.

## 6. Confirmed unrelated to Task Engine / Voice Agent / Local Agent / Computer-Use work

`iconv-lite` is a low-level text-encoding library pulled in transitively
by `body-parser`/`raw-body` (Express's own JSON body parsing) — nothing
in any of the systems built in prior sessions imports it directly or
depends on its specific behavior. None of those systems were touched in
this fix.

---

## Final Report

1. **Root cause**: most likely a corrupted/incomplete `node_modules`
   install (`npm ls` reports package presence without verifying every
   file exists on disk) — not confirmed live due to no Windows/network
   access from this sandbox, but this matches the exact reported symptom
   precisely. A missing `package-lock.json` (confirmed, real, fixed via
   this procedure) is a real contributing factor to non-reproducible
   installs, and separately would have made `npm ci` fail outright.
2. **Was Node 20 required?** — Not confirmed either way from this
   sandbox. Recommended as a real stabilization step regardless (Node 24
   is very new), but the clean-reinstall procedure is the more likely
   direct fix for the specific symptom.
3. **Exact Node version to use**: 20.x (LTS) — pinned via new `.nvmrc`
   and `package.json` `engines` fields.
4. **Dependencies changed**: none — no package version was modified.
   This is deliberate, matching "do not blindly modify dependencies."
5. **Files changed**: `package.json`, `backend/package.json`,
   `local-agent/package.json` (added `engines`), plus new `.nvmrc` in
   each of the three directories.
6. **Commands executed by me**: `npm install --dry-run` in this sandbox,
   which returned a real `403 Forbidden` — confirming, not assuming,
   that I cannot install packages from here. No commands were run on
   your Windows machine, because I have no access to it.
7. **Backend startup result**: not verified — requires the procedure
   above run on your machine.
8. **Prisma result**: not verified — `npx prisma generate` and
   `npx prisma migrate status` should be run after the clean reinstall
   succeeds; no schema change was made in this session, so no new
   migration should be needed.
9. **Signup result**: not verified — requires a running backend first.
10. **Login result**: not verified — same reason.
11. **Local Agent connection result**: not verified — the configuration
    was confirmed consistent by reading the code, but the actual
    "Check Connection" click requires your running backend + running
    Local Agent.
12. **Remaining issue**: whether the clean reinstall alone resolves this,
    or whether it's specifically a path-length/antivirus issue requiring
    the project to move to a shorter path, can only be determined by
    actually running the procedure above and reporting back what
    happens at step 4/6.
