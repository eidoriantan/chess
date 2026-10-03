// White's winning chances mapped from centipawns to 0-100%.
export const whitePercent = (cp: number) => 50 + 50 * (2 / (1 + Math.exp(-0.004 * cp)) - 1)

export default function EvalBar({ cp, label, flipped }: { cp: number; label: string; flipped: boolean }) {
  const pct = whitePercent(cp)
  const whiteLeads = cp >= 0
  return (
    <div className="relative w-8 shrink-0 overflow-hidden rounded-sm bg-[#262d33]" role="img" aria-label={`Evaluation ${label}`}>
      <div className={`absolute inset-x-0 bg-chalk transition-[height] duration-300 ${flipped ? 'top-0' : 'bottom-0'}`} style={{ height: `${pct}%` }} />
      <span
        className={`absolute inset-x-0 text-center text-[11px] font-semibold leading-none ${whiteLeads === flipped ? 'top-1.5' : 'bottom-1.5'} ${whiteLeads ? 'text-ink' : 'text-chalk'}`}
      >
        {label}
      </span>
    </div>
  )
}
