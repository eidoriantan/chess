import { useCallback, useEffect, useRef, useState } from 'react'
import { Chess } from 'chess.js'

export type EngineDef = { id: string; label: string; note: string; path: string; wasm: string; threads: boolean }
// Scores are from White's point of view. `mate` is moves to mate (0 = checkmated side to move).
export const CDN = import.meta.env.PROD
  ? (import.meta.env.VITE_ENGINE_CDN as string | undefined)?.replace(/\/+$/, '')
  : undefined

// The loader script must stay same-origin (Workers can't load cross-origin scripts), but it reads the
// wasm location from the URL hash, so the large files can come from R2. 17.1 full also derives its
// "-part-N.wasm" URLs from that path.
const workerUrl = (d: EngineDef) => (CDN ? `${d.path}#${CDN}${d.wasm}` : d.path)

export type Line = { multipv: number; depth: number; cp: number; mate?: number; pv: string[] }

export function scoreLabel(l: Line, turn: 'w' | 'b') {
  if (l.mate !== undefined) return l.mate === 0 ? (turn === 'w' ? '0-1' : '1-0') : `${l.cp > 0 ? '+' : '-'}M${Math.abs(l.mate)}`
  return `${l.cp > 0 ? '+' : ''}${(l.cp / 100).toFixed(2)}`
}

export function pvToSan(fen: string, pv: string[], n = 7) {
  const c = new Chess(fen)
  const num = parseInt(fen.split(' ')[5], 10)
  const white = fen.split(' ')[1] === 'w'
  const out: string[] = []
  for (let i = 0; i < Math.min(n, pv.length); i++) {
    const u = pv[i]
    try {
      const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })
      const w = white ? i % 2 === 0 : i % 2 === 1
      const moveNo = num + Math.floor((i + (white ? 0 : 1)) / 2)
      out.push(w ? `${moveNo}. ${m.san}` : i === 0 ? `${moveNo}… ${m.san}` : m.san)
    } catch { break }
  }
  return out.join(' ')
}

export function useEngine(def: EngineDef | undefined, multiPv: number, depth: number) {
  const worker = useRef<Worker | null>(null)
  const armed = useRef(false)
  const turn = useRef<'w' | 'b'>('w')
  const pending = useRef('')
  const opts = useRef({ multiPv, depth })
  opts.current = { multiPv, depth }
  const [ready, setReady] = useState(false)
  const [lines, setLines] = useState<Line[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    setReady(false); setLines([]); setError('')
    if (!def) return
    let booted = false
    const w = new Worker(workerUrl(def))
    worker.current = w
    const send = (s: string) => w.postMessage(s)
    w.onerror = () => setError('This engine failed to load. Multi-threaded builds need cross-origin isolation (COOP/COEP headers)' + (CDN ? ', and the R2 bucket needs CORS for this origin.' : '.'))
    w.onmessage = (e) => {
      const msg = String(e.data)
      if (msg === 'uciok') {
        const threads = def.threads ? Math.min(4, navigator.hardwareConcurrency || 2) : 1
        if (def.threads) send(`setoption name Threads value ${threads}`)
        send('setoption name Hash value 64')
        send('isready')
      } else if (msg === 'readyok') {
        if (!booted) { booted = true; setReady(true); return }
        if (!pending.current) return
        const fen = pending.current
        pending.current = ''
        turn.current = fen.split(' ')[1] as 'w' | 'b'
        send(`setoption name MultiPV value ${opts.current.multiPv}`)
        send(`position fen ${fen}`)
        send(`go depth ${opts.current.depth}`)
        armed.current = true
      } else if (armed.current && msg.startsWith('info') && msg.includes(' pv ') && !/bound/.test(msg)) {
        const m = msg.match(/depth (\d+).*?(?:multipv (\d+))?.*?score (cp|mate) (-?\d+).*? pv (.+)$/)
        const mp = msg.match(/multipv (\d+)/)
        if (!m) return
        const sign = turn.current === 'w' ? 1 : -1
        const raw = parseInt(m[4], 10)
        const isMate = m[3] === 'mate'
        const cp = isMate ? (raw === 0 ? -sign : sign * Math.sign(raw)) * (100000 - Math.abs(raw)) : sign * raw
        const line: Line = { multipv: mp ? parseInt(mp[1], 10) : 1, depth: parseInt(m[1], 10), cp, mate: isMate ? sign * raw : undefined, pv: m[5].trim().split(' ') }
        setLines((prev) => { const n = [...prev]; n[line.multipv - 1] = line; return n })
      }
    }
    send('uci')
    return () => { w.terminate(); worker.current = null; armed.current = false }
  }, [def?.id])

  // Stop the current search, wait for the engine to flush it (readyok), then start the new one.
  const analyze = useCallback((fen: string) => {
    const w = worker.current
    if (!w) return
    armed.current = false
    pending.current = fen
    setLines([])
    w.postMessage('stop')
    w.postMessage('isready')
  }, [])

  return { ready, lines: lines.filter(Boolean), error, analyze, turn: turn.current }
}
