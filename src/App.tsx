import { useCallback, useEffect, useMemo, useState } from 'react'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'

import EvalBar from './components/EvalBar'
import { EngineDef, pvToSan, scoreLabel, useEngine } from './lib/engine'

type Pos = { fen: string; san?: string; from?: string; to?: string }
const START = new Chess().fen()

export default function App() {
  const [engines, setEngines] = useState<EngineDef[]>([])
  const [engineId, setEngineId] = useState('')
  const [depth, setDepth] = useState(18)
  const [multiPv, setMultiPv] = useState(3)
  const [flipped, setFlipped] = useState(false)
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null)
  const [positions, setPositions] = useState<Pos[]>([{ fen: START }])
  const [cursor, setCursor] = useState(0)
  const [meta, setMeta] = useState<Record<string, string>>({})
  const [pgn, setPgn] = useState('')
  const [importError, setImportError] = useState('')

  useEffect(() => {
    fetch('/engines/manifest.json')
      .then((r) => r.json())
      .then((m: EngineDef[]) => {
        setEngines(m)
        setEngineId(m[0]?.id ?? '')
      })
      .catch(() => {})
  }, [])

  const def = engines.find((e) => e.id === engineId)
  const { ready, lines, error, analyze } = useEngine(def, multiPv, depth)
  const cur = positions[cursor]
  const turn = cur.fen.split(' ')[1] as 'w' | 'b'
  const isolated = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated

  useEffect(() => { if (ready) analyze(cur.fen) }, [ready, cur.fen, multiPv, depth, analyze])

  const go = useCallback((i: number) => {
    setCursor(Math.max(0, Math.min(positions.length - 1, i)))
    setSelectedSquare(null)
  }, [positions.length])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/TEXTAREA|SELECT|INPUT/.test((e.target as HTMLElement).tagName)) return
      if (e.key === 'ArrowLeft') go(cursor - 1)
      if (e.key === 'ArrowRight') go(cursor + 1)
      if (e.key === 'Home') go(0)
      if (e.key === 'End') go(positions.length - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cursor, go, positions.length])

  const movePiece = useCallback((sourceSquare: string, targetSquare: string) => {
    try {
      const m = new Chess(cur.fen).move({ from: sourceSquare, to: targetSquare, promotion: 'q' })
      setPositions((p) => [...p.slice(0, cursor + 1), { fen: m.after, san: m.san, from: m.from, to: m.to }])
      setCursor(cursor + 1)
      setSelectedSquare(null)
      return true
    } catch { return false }
  }, [cur.fen, cursor])

  const onDrop = ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) => {
    if (!targetSquare) return false
    return movePiece(sourceSquare, targetSquare)
  }

  const onSquareClick = ({ piece, square }: { piece: { pieceType: string } | null; square: string }) => {
    if (!selectedSquare) {
      if (piece?.pieceType[0] === turn) setSelectedSquare(square)
      return
    }
    if (piece?.pieceType[0] === turn) {
      setSelectedSquare(square)
      return
    }
    movePiece(selectedSquare, square)
  }

  const importPgn = () => {
    try {
      const c = new Chess()
      c.loadPgn(pgn.trim())
      const h = c.history({ verbose: true })
      setPositions([
        {fen: h.length ? h[0].before : c.fen() },
        ...h.map((m) => ({ fen: m.after, san: m.san, from: m.from, to: m.to }))
      ])
      setMeta(c.header() as Record<string, string>)
      setCursor(0); setSelectedSquare(null); setImportError('')
    } catch (e) { setImportError('Could not read that PGN. Paste the full game text, including the moves.') }
  }

  const reset = () => { setPositions([{ fen: START }]); setCursor(0); setSelectedSquare(null); setMeta({}) }

  const best = lines[0]
  const bestUci = best?.pv[0]
  const squareStyles = useMemo(() => {
    const s: Record<string, React.CSSProperties> = {}
    if (cur.from && cur.to) s[cur.from] = s[cur.to] = { background: 'rgba(233,180,76,0.38)' }
    if (selectedSquare) s[selectedSquare] = { background: 'rgba(233,180,76,0.55)' }
    return s
  }, [cur.from, cur.to, selectedSquare])

  const rows = useMemo(() => {
    const out: { n: number; w?: number; b?: number }[] = []
    positions.slice(1).forEach((p, i) => {
      const ply = i + 1
      const startsBlack = positions[0].fen.split(' ')[1] === 'b'
      const idx = ply - 1 + (startsBlack ? 1 : 0)
      const row = (out[Math.floor(idx / 2)] ??= { n: Math.floor(idx / 2) + 1 })
      if (idx % 2 === 0) row.w = ply; else row.b = ply
      void p
    })
    return out
  }, [positions])

  const btn = 'rounded-md border border-line px-3 py-1.5 text-sm hover:bg-line disabled:opacity-40'
  const field = 'w-full rounded-md border border-line bg-ink px-2 py-1.5 text-sm'

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 p-4 lg:flex-row lg:items-start">
      <section className="flex flex-col gap-3 lg:flex-1">
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-extrabold tracking-tight">{meta.White ? `${meta.White} vs ${meta.Black ?? '?'}` : 'Analysis board'}</h1>
          <span className="text-sm text-dim">{meta.Result ?? ''}</span>
        </div>
        <div className="mx-auto flex w-full gap-2" style={{ maxWidth: 'min(100%, calc(100vh - 11rem))' }}>
          <EvalBar cp={best?.cp ?? 0} label={best ? scoreLabel(best, turn) : '0.00'} flipped={flipped} />
          <div className="aspect-square flex-1">
            <Chessboard
              options={{
                id: 'analysis',
                position: cur.fen,
                boardOrientation: flipped ? 'black' : 'white',
                onPieceDrop: onDrop,
                onSquareClick,
                squareStyles,
                arrows: bestUci ? [{ startSquare: bestUci.slice(0, 2), endSquare: bestUci.slice(2, 4), color: '#e9b44c' }] : [],
                darkSquareStyle: { backgroundColor: '#5f7d6b' },
                lightSquareStyle: { backgroundColor: '#dfe4d2' },
              }}
            />
          </div>
        </div>
        <div className="mx-auto flex flex-wrap justify-center gap-2">
          <button className={btn} onClick={() => go(0)} disabled={cursor === 0} aria-label="First move">⏮</button>
          <button className={btn} onClick={() => go(cursor - 1)} disabled={cursor === 0} aria-label="Previous move">◀</button>
          <button className={btn} onClick={() => go(cursor + 1)} disabled={cursor === positions.length - 1} aria-label="Next move">▶</button>
          <button className={btn} onClick={() => go(positions.length - 1)} disabled={cursor === positions.length - 1} aria-label="Last move">⏭</button>
          <button className={btn} onClick={() => setFlipped((f) => !f)}>Flip board</button>
        </div>
      </section>

      <aside className="flex flex-col gap-4 lg:w-[24rem]">
        <div className="space-y-3 rounded-lg bg-panel p-4">
          <label className="block text-sm text-dim">Engine
            <select className={`${field} mt-1 text-chalk`} value={engineId} onChange={(e) => setEngineId(e.target.value)}>
              {engines.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
            </select>
          </label>
          {def && <p className="text-xs text-dim">{def.note}</p>}
          <div className="flex gap-3">
            <label className="flex-1 text-sm text-dim">Depth
              <select className={`${field} mt-1 text-chalk`} value={depth} onChange={(e) => setDepth(+e.target.value)}>
                {[12, 16, 18, 22, 26].map((d) => <option key={d}>{d}</option>)}
              </select>
            </label>
            <label className="flex-1 text-sm text-dim">Lines
              <select className={`${field} mt-1 text-chalk`} value={multiPv} onChange={(e) => setMultiPv(+e.target.value)}>
                {[1, 2, 3, 4].map((d) => <option key={d}>{d}</option>)}
              </select>
            </label>
          </div>
          {def?.threads && !isolated && <p className="text-xs text-amber">Cross-origin isolation is off, so multi-threaded engines may not start. Pick Stockfish 11 or serve with COOP/COEP headers.</p>}
          {error && <p className="text-xs text-amber">{error}</p>}
          {!ready && !error && def && <p className="text-xs text-dim">Loading engine…</p>}
        </div>

        <div className="rounded-lg bg-panel p-4">
          <h2 className="mb-2 text-sm font-semibold">Best lines {best && <span className="font-normal text-dim">depth {best.depth}</span>}</h2>
          <ul className="space-y-2">
            {lines.map((l) => (
              <li key={l.multipv} className="flex gap-3 text-sm">
                <span className="w-14 shrink-0 font-semibold tabular-nums text-amber">{scoreLabel(l, turn)}</span>
                <span className="text-chalk/90">{pvToSan(cur.fen, l.pv)}</span>
              </li>
            ))}
            {!lines.length && <li className="text-sm text-dim">Waiting for the engine.</li>}
          </ul>
        </div>

        <div className="rounded-lg bg-panel p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Moves</h2>
            <button className="text-xs text-dim underline" onClick={reset}>New game</button>
          </div>
          <div className="max-h-56 overflow-y-auto text-sm">
            {rows.length === 0 && <p className="text-dim">Move a piece or import a game.</p>}
            {rows.map((r) => (
              <div key={r.n} className="grid grid-cols-[2rem_1fr_1fr] items-center">
                <span className="text-dim">{r.n}.</span>
                {[r.w, r.b].map((ply, i) => ply ? (
                  <button key={i} onClick={() => go(ply)} className={`rounded px-2 py-0.5 text-left ${ply === cursor ? 'bg-amber text-ink' : 'hover:bg-line'}`}>{positions[ply].san}</button>
                ) : <span key={i} />)}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg bg-panel p-4">
          <label htmlFor="pgn" className="mb-2 block text-sm font-semibold">Import PGN</label>
          <textarea id="pgn" className={`${field} h-28 font-mono text-xs`} value={pgn} onChange={(e) => setPgn(e.target.value)} placeholder="Paste a PGN, e.g. 1. e4 e5 2. Nf3 Nc6 …" />
          {importError && <p className="mt-1 text-xs text-amber">{importError}</p>}
          <button className={`${btn} mt-2`} onClick={importPgn} disabled={!pgn.trim()}>Import game</button>
        </div>
      </aside>
    </div>
  )
}
