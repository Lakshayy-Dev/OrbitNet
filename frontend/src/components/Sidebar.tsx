import { BarChart3, Clock3, Gauge, Globe2, Info, Route } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useStore } from '../lib/store'
import { utcTime } from '../lib/format'

const NAV = [
  { to: '/', label: 'Overview', icon: Gauge },
  { to: '/viewer', label: 'Network viewer', icon: Globe2 },
  { to: '/routing', label: 'Routing lab', icon: Route },
  { to: '/performance', label: 'Performance', icon: BarChart3 },
  { to: '/simulation', label: 'Simulation', icon: Clock3 },
  { to: '/about', label: 'About', icon: Info },
]

export function Sidebar() {
  const dataset = useStore((s) => s.dataset)
  const time = useStore((s) => s.time)
  const step = dataset ? Math.min(Math.floor(time + 1e-6), dataset.steps - 1) : 0

  return (
    <nav className="flex shrink-0 border-seam bg-hull md:w-[212px] md:flex-col md:border-r max-md:border-b" aria-label="Main">
      <div className="hidden px-5 pb-5 pt-6 md:block">
        <Wordmark />
        <p className="mt-2 text-[12.5px] leading-snug text-ink-dim">
          Energy-aware routing in a LEO constellation with graph neural networks
        </p>
      </div>
      <ul className="flex flex-1 gap-0.5 overflow-x-auto px-2 py-1.5 md:flex-col md:overflow-visible md:py-0">
        {NAV.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 whitespace-nowrap rounded-md px-3 py-2 text-[14.5px] transition-colors ${
                  isActive ? 'bg-hull-2 text-ink shadow-[inset_2px_0_0_var(--color-signal)]' : 'text-ink-dim hover:bg-hull-2/60 hover:text-ink'
                }`
              }
            >
              <Icon size={17} strokeWidth={1.75} aria-hidden />
              <span className="max-sm:sr-only">{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
      {dataset && (
        <div className="hidden border-t border-seam px-5 py-4 text-[12.5px] text-ink-dim md:block">
          <div className="readout text-[15px] text-ink">
            Step {step + 1} of {dataset.steps}
          </div>
          <div className="readout">{utcTime(dataset.meta.frames[step].timestamp)}</div>
          <div className="mt-1 text-ink-faint">Saved snapshots, not live tracking</div>
        </div>
      )}
    </nav>
  )
}

function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
        <circle cx="16" cy="16" r="7" fill="#1d4f8a" />
        <ellipse cx="16" cy="16" rx="14" ry="5.5" fill="none" stroke="#38d3f5" strokeWidth="2" transform="rotate(-28 16 16)" />
        <circle cx="28" cy="10" r="2.4" fill="#ffb45c" />
      </svg>
      <span className="font-display text-[23px] font-semibold tracking-wide">OrbitNet</span>
    </div>
  )
}
