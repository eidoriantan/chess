// Shared engine table + file resolution for copy-engines.mjs and export-engines.mjs.
import fs from 'node:fs'
import path from 'node:path'

export const engines = [
  { id: 'sf19-lite', label: 'Stockfish 19 lite', note: 'NNUE, multi-thread', pkg: 'stockfish19', re: /^stockfish-19-lite\.js$/, threads: true },
  { id: 'sf19-full', label: 'Stockfish 19 full', note: 'Full NNUE, multi-thread (~99 MB download)', pkg: 'stockfish19', re: /^stockfish-19\.js$/, threads: true },
  { id: 'sf17-full', label: 'Stockfish 17.1 full', note: 'Full NNUE, multi-thread (~76 MB download)', pkg: 'stockfish17', re: /^stockfish-17\.1-[0-9a-f]{7}\.js$/, threads: true },
  { id: 'sf17-lite', label: 'Stockfish 17.1 lite', note: 'NNUE, multi-thread', pkg: 'stockfish17', re: /^stockfish-17\.1-lite-[0-9a-f]+\.js$/, threads: true },
  { id: 'sf11', label: 'Stockfish 11 classic', note: 'Handcrafted eval, single-thread', pkg: 'stockfish11', re: /^stockfish\.js$/, threads: false },
]

export function resolveEngine(e) {
  const root = path.resolve('node_modules', e.pkg)
  const dir = ['bin', 'src', '.'].map((d) => path.join(root, d)).find((d) => fs.existsSync(d) && fs.readdirSync(d).some((f) => e.re.test(f)))
  if (!dir) return null
  const main = fs.readdirSync(dir).find((f) => e.re.test(f))
  const base = main.replace(/\.js$/, '')
  const files = fs.readdirSync(dir).filter((f) => (f === `${base}.js` || f === `${base}.wasm` || f.startsWith(`${base}-part-`)))
  return { dir, main, base, files }
}
