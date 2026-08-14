const express = require('express')
const prisma = require('../prismaClient')

const router = express.Router()

const CONTENT_TYPES = {
  html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'application/javascript; charset=utf-8',
  json: 'application/json', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml',
  gif: 'image/gif', webp: 'image/webp', ico: 'image/x-icon', txt: 'text/plain; charset=utf-8'
}

function contentTypeFor(path) {
  const ext = path.split('.').pop().toLowerCase()
  return CONTENT_TYPES[ext] || 'application/octet-stream'
}

// Injects <base href="/preview/:token/"> so every relative CSS/JS/asset
// reference in the generated HTML resolves against this token's own
// "directory" — this is what makes multi-file projects (separate
// styles.css/script.js, not everything inline) actually load correctly,
// without needing to know or rewrite the AI's exact generated paths.
function withBaseTag(html, token) {
  const baseTag = `<base href="/preview/${token}/">`
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`)
  }
  return `<!doctype html><html><head>${baseTag}</head><body>${html}</body></html>`
}

async function loadProject(token) {
  const project = await prisma.websiteProject.findUnique({ where: { previewToken: token } })
  if (!project) { const err = new Error('not_found'); throw err }
  return project
}

function honestFallback(project) {
  const files = JSON.parse(project.generatedFiles || '[]')
  const fileListHtml = files.map((f) => `<li><strong>${f.path}</strong><pre style="white-space:pre-wrap;background:#f6f7f7;padding:12px;border-radius:8px;">${f.content.replace(/</g, '&lt;')}</pre></li>`).join('')
  return `<html><body style="font-family:sans-serif;max-width:800px;margin:40px auto;">
    <h1>${project.websiteType}</h1>
    <p>This project uses ${project.codeStack}, which this preview system doesn't live-render (no build step is run) — here are the real generated source files instead.</p>
    <ul>${fileListHtml}</ul>
  </body></html>`
}

// GET /preview/:token — the entry point a client actually opens. Serves the
// real generated index.html, with a <base> tag so its own relative
// stylesheet/script/image references resolve to the routes below.
router.get('/:token', async (req, res) => {
  try {
    const project = await loadProject(req.params.token)
    const files = JSON.parse(project.generatedFiles || '[]')
    if (files.length === 0) return res.status(404).send('<h1>Not ready yet</h1><p>Code has not been generated for this project yet.</p>')

    const htmlFile = files.find((f) => f.path === 'index.html')
    if (!htmlFile) {
      res.set('Content-Type', 'text/html; charset=utf-8')
      return res.send(honestFallback(project))
    }

    res.set('Content-Type', 'text/html; charset=utf-8')
    res.send(withBaseTag(htmlFile.content, project.previewToken))
  } catch (err) {
    if (err.message === 'not_found') return res.status(404).send('<h1>Preview not found</h1><p>This preview link is invalid or has been deleted.</p>')
    console.error(err)
    res.status(500).send('<h1>Preview error</h1>')
  }
})

// GET /preview/:token/* — real static-file serving for every OTHER
// generated file (styles.css, script.js, assets/logo.svg, and so on) —
// this is what the <base> tag above makes actually reachable. Without
// this route, any project with separate CSS/JS files (i.e., almost all of
// them) would 404 on every asset even though the HTML itself loaded fine.
router.get('/:token/*', async (req, res) => {
  try {
    const project = await loadProject(req.params.token)
    const files = JSON.parse(project.generatedFiles || '[]')
    const requestedPath = req.params[0]

    const file = files.find((f) => f.path === requestedPath || f.path === requestedPath.replace(/^\/+/, ''))
    if (!file) return res.status(404).send(`/* Not found in this preview: ${requestedPath} */`)

    res.set('Content-Type', contentTypeFor(file.path))
    res.send(file.content)
  } catch (err) {
    if (err.message === 'not_found') return res.status(404).send('Preview not found')
    console.error(err)
    res.status(500).send('Preview asset error')
  }
})

module.exports = router
