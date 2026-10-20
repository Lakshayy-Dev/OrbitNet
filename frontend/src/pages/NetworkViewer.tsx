import { useNavigate } from 'react-router-dom'
import { PlaybackBar } from '../components/PlaybackBar'
import { SatelliteInspector, useSatelliteDetail } from '../components/SatelliteInspector'
import { BenchmarkControl, FindSatellite, HoverTooltip, LayersMenu, Legend, SavedRouteCard } from '../components/ViewerOverlays'
import { useStore } from '../lib/store'
import { GlobeScene } from '../scene/GlobeScene'

export default function NetworkViewer() {
  useSatelliteDetail()
  const navigate = useNavigate()
  const set = useStore((s) => s.set)
  const labResult = useStore((s) => s.labResult)

  return (
    <div className="relative h-full w-full overflow-hidden">
      <GlobeScene />
      <HoverTooltip />

      {/* Top-left: what the colours mean and the route at this step.
          On narrow screens it sits below the search row and the legend is hidden. */}
      <div className="pointer-events-none absolute left-3 right-3 top-[104px] flex max-w-[360px] flex-col gap-2 sm:right-auto sm:top-3 [&>*]:pointer-events-auto [&>*:last-child]:max-sm:hidden">
        <SavedRouteCard />
        {labResult && (
          <div className="rounded-lg border border-seam bg-hull/90 px-3 py-2 text-[12.5px] text-ink-dim backdrop-blur-sm">
            Routing Lab routes for step {labResult.step + 1} are also shown; they are drawn faintly at other steps.
            <button type="button" className="ml-1 text-signal hover:underline"
              onClick={() => { set({ labResult: null }); useStore.getState().setLayer('savedGnn', true) }}>
              Clear them
            </button>
          </div>
        )}
        <Legend />
      </div>

      {/* Top-right: search, layers, inspector. */}
      <div className="pointer-events-none absolute bottom-[132px] right-3 top-3 z-10 flex w-[340px] max-w-[calc(100%-24px)] flex-col items-end gap-2 [&>*]:pointer-events-auto">
        <div className="flex flex-wrap justify-end gap-2">
          <FindSatellite />
          <LayersMenu />
        </div>
        <div className="min-h-0 w-full flex-1">
          <SatelliteInspector
            onUseInRouting={(role, id) => {
              set(role === 'source' ? { labSource: id } : { labTarget: id })
              navigate('/routing')
            }}
          />
        </div>
      </div>

      {/* Bottom: playback. */}
      <div className="absolute inset-x-3 bottom-3 flex flex-col gap-2">
        <div className="flex justify-end">
          <BenchmarkControl />
        </div>
        <PlaybackBar />
      </div>
    </div>
  )
}
