import { useState, type ReactNode } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

// Chart palette: same hues as the 3D routes, stepped into the readable
// lightness band for flat marks on the dark panel. Validated with the dataviz
// palette checker (dark mode, surface #0a1322): lightness band, chroma floor,
// CVD separation (all pairs), normal-vision floor and contrast all pass.
export const CHART = {
  gnn: '#08a4c6',
  dijkstra: '#b12b6e',
  teacher: '#6b9e1f',
  avoid: '#6e65c2',
  sunlit: '#c7852a',
  eclipsed: '#3d6daa',
  grid: '#1b2b45',
  axis: '#5f7090',
  surface: '#0a1322',
}

export interface Series {
  key: string
  label: string
  color: string
}

const axisProps = {
  stroke: CHART.axis,
  tick: { fill: CHART.axis, fontSize: 12, fontFamily: 'Barlow Condensed' },
  tickLine: false,
  axisLine: { stroke: CHART.grid },
}

function TooltipBox({ active, payload, label, unit, labelFormat }: {
  active?: boolean
  payload?: { name: string; value: number; color: string; dataKey: string }[]
  label?: string | number
  unit?: string
  labelFormat?: (l: string | number) => string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-seam bg-void/95 px-2.5 py-1.5 text-[12.5px] shadow-xl">
      <div className="mb-0.5 text-ink-dim">{labelFormat ? labelFormat(label ?? '') : label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-ink-dim">{p.name}</span>
          <span className="readout ml-auto pl-3 text-[13.5px] text-ink">
            {typeof p.value === 'number' ? p.value.toLocaleString('en-US', { maximumFractionDigits: 2 }) : p.value}
            {unit ? ` ${unit}` : ''}
          </span>
        </div>
      ))}
    </div>
  )
}

export function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-dim">
      {series.map((s) => (
        <span key={s.key} className="flex items-center gap-1.5">
          <span className="h-[3px] w-4 rounded" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  )
}

/** Values per simulation step, one line per series, shared y-axis. */
export function StepLines({
  data, series, unit, height = 210, yDomain, highlightStep, xLabel = (s) => `Step ${Number(s) + 1}`,
}: {
  data: Record<string, number | null>[]
  series: Series[]
  unit?: string
  height?: number
  yDomain?: [number | 'auto' | 'dataMin' | 'dataMax', number | 'auto' | 'dataMin' | 'dataMax']
  highlightStep?: number
  xLabel?: (s: string | number) => string
}) {
  return (
    <div>
      <Legend series={series} />
      <div style={{ height }} className="mt-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -6 }}>
            <CartesianGrid stroke={CHART.grid} vertical={false} />
            <XAxis dataKey="step" {...axisProps} tickFormatter={(s) => String(Number(s) + 1)} interval={1} />
            <YAxis {...axisProps} domain={yDomain ?? ['auto', 'auto']} width={56}
              tickFormatter={(v) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 1 })} />
            <Tooltip content={<TooltipBox unit={unit} labelFormat={xLabel} />} cursor={{ stroke: CHART.axis, strokeDasharray: '3 3' }} />
            {highlightStep !== undefined && <ReferenceLine x={highlightStep} stroke="#93a4bf" strokeOpacity={0.5} />}
            {series.map((s) => (
              <Line key={s.key} type="linear" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2}
                dot={{ r: 3, fill: s.color, stroke: CHART.surface, strokeWidth: 2 }}
                activeDot={{ r: 5, stroke: CHART.surface, strokeWidth: 2 }} isAnimationActive={false} connectNulls={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/** One bar per category; bars above `clipAt` are drawn to the edge and labelled. */
export function SimpleBars({
  data, valueKey, categoryKey, color, unit, height = 200, clipAt, categoryFormat, highlight,
}: {
  data: Record<string, number | string | null>[]
  valueKey: string
  categoryKey: string
  color: string
  unit?: string
  height?: number
  clipAt?: number
  categoryFormat?: (c: string | number) => string
  highlight?: (row: Record<string, number | string | null>) => boolean
}) {
  const shown = data.map((d) => {
    const v = Number(d[valueKey])
    return { ...d, __v: clipAt !== undefined && v > clipAt ? clipAt : v, __clipped: clipAt !== undefined && v > clipAt }
  })
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={shown} margin={{ top: 8, right: 12, bottom: 0, left: -6 }} barCategoryGap={2}>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis dataKey={categoryKey} {...axisProps} tickFormatter={categoryFormat} interval={categoryFormat ? 1 : 'preserveStartEnd'} />
          <YAxis {...axisProps} width={56} domain={[0, clipAt ?? 'auto']} />
          <Tooltip
            cursor={{ fill: '#ffffff', fillOpacity: 0.04 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              const row = payload[0].payload as Record<string, number>
              return (
                <div className="rounded-md border border-seam bg-void/95 px-2.5 py-1.5 text-[12.5px]">
                  <div className="text-ink-dim">{categoryFormat ? categoryFormat(label as string) : label}</div>
                  <div className="readout text-[14px] text-ink">
                    {Number(row[valueKey]).toLocaleString('en-US', { maximumFractionDigits: 2 })}{unit ? ` ${unit}` : ''}
                  </div>
                </div>
              )
            }}
          />
          <Bar dataKey="__v" name={valueKey} radius={[4, 4, 0, 0]} isAnimationActive={false}
            label={clipAt !== undefined ? (props: { x?: number | string; y?: number | string; width?: number | string; index?: number }) =>
              shown[props.index ?? 0]?.__clipped ? (
                <text x={Number(props.x ?? 0) + Number(props.width ?? 0) / 2} y={Number(props.y ?? 0) + 14} textAnchor="middle" fill="#e3ebf7" fontSize={11} fontFamily="Barlow Condensed">
                  off scale
                </text>
              ) : <g />
              : undefined}>
            {shown.map((d, i) => (
              <Cell key={i} fill={color} fillOpacity={highlight && !highlight(d as unknown as Record<string, number | string | null>) ? 0.45 : 1} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** A chart with an optional data-table view (accessibility and checking). */
export function ChartBlock({ title, caption, children, table }: { title: ReactNode; caption?: ReactNode; children: ReactNode; table?: { head: string[]; rows: (string | number)[][] } }) {
  const [showTable, setShowTable] = useState(false)
  return (
    <figure className="min-w-0">
      <figcaption className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-[14.5px] font-medium text-ink">{title}</span>
        {table && (
          <button type="button" className="text-[12.5px] text-ink-dim hover:text-signal" onClick={() => setShowTable((v) => !v)}>
            {showTable ? 'Show chart' : 'Show table'}
          </button>
        )}
      </figcaption>
      {showTable && table ? (
        <div className="scroll-quiet max-h-[240px] overflow-auto rounded border border-seam">
          <table className="w-full text-[12.5px]">
            <thead className="sticky top-0 bg-hull-2 text-left text-ink-dim">
              <tr>{table.head.map((h) => <th key={h} className="px-2 py-1 font-normal">{h}</th>)}</tr>
            </thead>
            <tbody className="readout text-[13px]">
              {table.rows.map((r, i) => (
                <tr key={i} className="border-t border-seam/50">{r.map((c, j) => <td key={j} className="px-2 py-0.5">{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
      {caption && <p className="mt-1.5 text-[12.5px] leading-snug text-ink-faint">{caption}</p>}
    </figure>
  )
}
