import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react'
import { useEffect } from 'react'
import { clock, currentStep, useStore } from '../lib/store'
import { utcDate, utcTime } from '../lib/format'

const SPEEDS = [0.5, 1, 2, 4]

export function PlaybackBar({ compact = false }: { compact?: boolean }) {
  const dataset = useStore((s) => s.dataset)!
  const time = useStore((s) => s.time)
  const playing = useStore((s) => s.playing)
  const speed = useStore((s) => s.speed)
  const interpolate = useStore((s) => s.interpolate)
  const { seek, play, setSpeed, setInterpolate } = useStore.getState()

  const frames = dataset.meta.frames
  const max = dataset.steps - 1
  const step = currentStep(time, dataset.steps)
  const frac = time - step
  const between = interpolate && frac > 0.001 && step < max
  const label = utcTime(frames[step].timestamp, between ? frac * dataset.meta.step_seconds : 0)

  // Keyboard: space play/pause, arrows step.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') return
      if (e.code === 'Space') {
        e.preventDefault()
        play()
      } else if (e.key === 'ArrowRight') {
        play(false)
        seek(Math.floor(clock.t + 1e-6) + 1)
      } else if (e.key === 'ArrowLeft') {
        play(false)
        seek(Math.ceil(clock.t - 1e-6) - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [play, seek])

  return (
    <div className="rounded-lg border border-seam bg-hull/92 px-3 py-2 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="flex items-center gap-1">
          <IconButton label="Reset to the first snapshot" onClick={() => { play(false); seek(0) }}>
            <RotateCcw size={16} />
          </IconButton>
          <IconButton label="Previous snapshot" onClick={() => { play(false); seek(Math.ceil(clock.t - 1e-6) - 1) }}>
            <ChevronLeft size={18} />
          </IconButton>
          <button
            type="button"
            onClick={() => play()}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-signal text-void hover:bg-[#6fe1fa]"
            aria-label={playing ? 'Pause' : 'Play'}
            title={playing ? 'Pause (space)' : 'Play (space)'}
          >
            {playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" className="translate-x-px" />}
          </button>
          <IconButton label="Next snapshot" onClick={() => { play(false); seek(Math.floor(clock.t + 1e-6) + 1) }}>
            <ChevronRight size={18} />
          </IconButton>
        </div>

        <div className="min-w-[150px]">
          <div className="readout text-[17px] leading-none text-ink">
            Step {step + 1}
            <span className="text-ink-faint"> / {dataset.steps}</span>
          </div>
          <div className="readout mt-0.5 text-[13px] leading-none text-ink-dim">
            {label}
            {between && <span className="ml-1 font-sans text-[11.5px] text-ink-faint">interpolated</span>}
          </div>
        </div>

        {!compact && (
          <div className="ml-auto flex items-center gap-3 text-[13px] text-ink-dim">
            <label className="flex items-center gap-1.5">
              Speed
              <select
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="rounded border border-seam bg-hull-2 px-1.5 py-0.5 text-ink"
              >
                {SPEEDS.map((s) => (
                  <option key={s} value={s}>
                    {s} step{s === 1 ? '' : 's'}/s
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5" title="Move satellites smoothly between saved snapshots. Eclipse states and routes still change only at saved steps.">
              <input type="checkbox" checked={interpolate} onChange={(e) => setInterpolate(e.target.checked)} className="accent-[var(--color-signal)]" />
              Smooth motion
            </label>
          </div>
        )}
      </div>

      <div className="relative mt-1">
        <input
          type="range"
          className="timeline"
          min={0}
          max={max}
          step={interpolate ? 0.01 : 1}
          value={time}
          aria-label="Simulation time"
          onChange={(e) => {
            play(false)
            seek(Number(e.target.value))
          }}
        />
        {/* One tick per saved snapshot; route-change steps are marked. */}
        <div className="pointer-events-none absolute inset-x-[7px] top-[19px] h-2">
          {frames.map((f, i) => (
            <span
              key={i}
              className={`absolute h-2 w-px ${f.route_changed ? 'bg-signal/80' : 'bg-ink-faint/50'}`}
              style={{ left: `${(i / max) * 100}%` }}
            />
          ))}
        </div>
      </div>
      {!compact && (
        <div className="mt-0.5 flex justify-between text-[11.5px] text-ink-faint">
          <span>{utcDate(frames[0].timestamp)}, {utcTime(frames[0].timestamp)}</span>
          <span className="hidden sm:inline">{dataset.meta.step_seconds} s between snapshots; blue ticks mark a GNN route change</span>
          <span>{utcTime(frames[max].timestamp)}</span>
        </div>
      )}
    </div>
  )
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-md text-ink-dim hover:bg-hull-2 hover:text-ink"
    >
      {children}
    </button>
  )
}
