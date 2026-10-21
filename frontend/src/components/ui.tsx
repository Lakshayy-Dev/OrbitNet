import type { ReactNode } from 'react'

export function Panel({ title, aside, children, className = '' }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-seam bg-hull/90 ${className}`}>
      {(title || aside) && (
        <header className="flex items-baseline justify-between gap-3 border-b border-seam/70 px-4 py-2.5">
          {title && <h2 className="font-display text-[17px] font-semibold tracking-wide text-ink">{title}</h2>}
          {aside && <div className="text-[13px] text-ink-dim">{aside}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

/** A label/value row for readouts. */
export function Field({ label, value, hint, tone }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <dt className="text-[13px] text-ink-dim">{label}</dt>
      <dd className={`readout text-right text-[15px] ${tone ?? 'text-ink'}`}>
        {value}
        {hint && <span className="ml-1 font-sans text-[12px] text-ink-faint">{hint}</span>}
      </dd>
    </div>
  )
}

export function Button({
  children, onClick, kind = 'secondary', disabled, title, type = 'button', className = '',
}: {
  children: ReactNode; onClick?: () => void; kind?: 'primary' | 'secondary' | 'ghost'
  disabled?: boolean; title?: string; type?: 'button' | 'submit'; className?: string
}) {
  const styles = {
    primary: 'bg-signal text-void hover:bg-[#6fe1fa] font-semibold',
    secondary: 'border border-seam bg-hull-2 text-ink hover:border-ink-faint',
    ghost: 'text-ink-dim hover:text-ink hover:bg-hull-2',
  }[kind]
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[14px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${className}`}
    >
      {children}
    </button>
  )
}

export function Toggle({ label, checked, onChange, swatch, hint }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; swatch?: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 py-1 text-[14px] text-ink" title={hint}>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="relative h-4 w-7 shrink-0 rounded-full bg-seam transition-colors peer-checked:bg-signal/70 peer-focus-visible:outline-2 peer-focus-visible:outline-signal after:absolute after:left-0.5 after:top-0.5 after:h-3 after:w-3 after:rounded-full after:bg-ink after:transition-transform peer-checked:after:translate-x-3" />
      {swatch && <span className="h-0.5 w-4 shrink-0 rounded" style={{ background: swatch }} />}
      <span className="leading-tight">{label}</span>
    </label>
  )
}

export function Note({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' | 'error' }) {
  const styles = {
    info: 'border-seam bg-hull-2/60 text-ink-dim',
    warn: 'border-warn/40 bg-warn/5 text-[#f2dca0]',
    error: 'border-danger/50 bg-danger/10 text-[#ffc1c1]',
  }[tone]
  return <div className={`rounded-md border px-3 py-2 text-[13px] leading-snug ${styles}`}>{children}</div>
}

export function LoadingPanel({ stage, error, onRetry }: { stage: string; error?: string | null; onRetry?: () => void }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md">
        {error ? (
          <>
            <h1 className="font-display text-2xl font-semibold">The dashboard could not load its data</h1>
            <p className="mt-2 text-ink-dim">{error}</p>
            <p className="mt-4 text-[13px] text-ink-faint">
              From the project root, start the API with
              <code className="mx-1 rounded bg-hull-2 px-1.5 py-0.5 text-ink">uvicorn orbitnet_api.app:app --app-dir backend --port 8000</code>
              then try again.
            </p>
            {onRetry && (
              <Button className="mt-4" onClick={() => window.location.reload()}>
                Try again
              </Button>
            )}
          </>
        ) : (
          <div className="flex items-center gap-3 text-ink-dim">
            <span className="h-3 w-3 animate-pulse rounded-full bg-signal" />
            <span>{stage}…</span>
          </div>
        )}
      </div>
    </div>
  )
}

export function Swatch({ color, shape = 'dot' }: { color: string; shape?: 'dot' | 'line' }) {
  return shape === 'dot' ? (
    <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
  ) : (
    <span className="inline-block h-[3px] w-4 shrink-0 rounded" style={{ background: color }} />
  )
}
