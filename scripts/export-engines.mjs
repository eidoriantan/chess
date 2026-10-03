import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { loadEnv } from 'vite'
import { engines, resolveEngine } from './engines.mjs'

const uploadToR2 = process.argv.includes('--upload-r2')
const projectRoot = path.resolve(import.meta.dirname, '..')
const fileEnv = loadEnv('production', projectRoot, '')
const cdn = uploadToR2
  ? (process.env.VITE_ENGINE_CDN || fileEnv.VITE_ENGINE_CDN || '').replace(/\/+$/, '')
  : ''
const bucket = process.env.R2_BUCKET_NAME || fileEnv.R2_BUCKET_NAME
if (uploadToR2 && (!bucket || !cdn)) {
  throw new Error('Production engine export requires R2_BUCKET_NAME and VITE_ENGINE_CDN')
}
if (uploadToR2) {
  let cdnUrl
  try {
    cdnUrl = new URL(cdn)
  } catch {
    throw new Error('VITE_ENGINE_CDN must be an absolute http(s) URL')
  }
  if (!['http:', 'https:'].includes(cdnUrl.protocol) || !cdnUrl.host) {
    throw new Error('VITE_ENGINE_CDN must be an absolute http(s) URL')
  }
}
if (cdn) console.log(`[export] using CDN ${cdn}`)

const out = path.join(projectRoot, 'engine-export')
const jsOut = path.join(projectRoot, 'public/engines')
fs.rmSync(out, { recursive: true, force: true })
fs.rmSync(jsOut, { recursive: true, force: true })

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const manifest = []
for (const e of engines) {
  const r = resolveEngine(e)
  if (!r) {
    console.warn(`[export] skipped ${e.id}: files not found`)
    continue
  }

  const jsDest = path.join(jsOut, e.id)
  const dest = uploadToR2 ? path.join(out, 'engines', e.id) : jsDest
  fs.mkdirSync(dest, { recursive: true })
  if (uploadToR2) fs.mkdirSync(jsDest, { recursive: true })

  const files = []
  for (const f of r.files) {
    let key = ''
    let target = ''
    if (f.toLowerCase().endsWith('.js')) {
      key = `/engines/${e.id}/${f}`
      target = path.join(jsDest, f)
      fs.copyFileSync(path.join(r.dir, f), target)
    } else {
      key = `${cdn}/engines/${e.id}/${f}`
      target = path.join(dest, f)
      fs.copyFileSync(path.join(r.dir, f), target)
    }

    files.push({
      key: key || `/engines/${e.id}/${f}`,
      bytes: fs.statSync(target).size,
      sha256: sha256(target)
    })

    if (uploadToR2 && !f.toLowerCase().endsWith('.js')) {
      const objectKey = `engines/${e.id}/${f}`
      const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
      execFileSync(npx, [
        'wrangler', 'r2', 'object', 'put', `${bucket}/${objectKey}`,
        '--file', target,
        '--content-type', 'application/wasm',
        '--remote',
      ], { cwd: projectRoot, stdio: 'inherit' })
    }
  }

  const parts = files.filter((f) => /-part-\d+\.wasm$/.test(f.key)).length
  manifest.push({
    id: e.id,
    label: e.label,
    note: e.note,
    threads: e.threads,
    path: `/engines/${e.id}/${r.main}`,
    wasm: `/engines/${e.id}/${r.base}.wasm`,
    contentType: 'application/wasm',
    // Split builds have no file at `wasm`; the loader appends -part-0..N-1 to that name.
    ...(parts && { wasmParts: parts }),
    files,
  })
}

fs.writeFileSync(path.join(jsOut, 'manifest.json'), JSON.stringify(manifest, null, 2))
