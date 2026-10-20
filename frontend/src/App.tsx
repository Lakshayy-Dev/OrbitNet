import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import { LoadingPanel } from './components/ui'
import { loadDataset } from './lib/data'
import { useStore } from './lib/store'

const Overview = lazy(() => import('./pages/Overview'))
const NetworkViewer = lazy(() => import('./pages/NetworkViewer'))
const RoutingLab = lazy(() => import('./pages/RoutingLab'))
const Performance = lazy(() => import('./pages/Performance'))
const Simulation = lazy(() => import('./pages/Simulation'))
const About = lazy(() => import('./pages/About'))

export default function App() {
  const dataset = useStore((s) => s.dataset)
  const loadError = useStore((s) => s.loadError)
  const loadStage = useStore((s) => s.loadStage)
  const set = useStore((s) => s.set)

  useEffect(() => {
    if (dataset) return
    let cancelled = false
    loadDataset((label) => !cancelled && set({ loadStage: label }))
      .then((d) => {
        if (cancelled) return
        const f0 = d.meta.frames[0]
        set({
          dataset: d,
          loadError: null,
          labSource: f0.source ?? '',
          labTarget: f0.target ?? '',
        })
      })
      .catch((e: Error) => !cancelled && set({ loadError: e.message }))
    return () => {
      cancelled = true
    }
  }, [dataset, set])

  return (
    <div className="flex h-full flex-col bg-void text-ink md:flex-row">
      <Sidebar />
      <main className="relative min-h-0 min-w-0 flex-1">
        {!dataset ? (
          <LoadingPanel stage={loadStage} error={loadError} onRetry={() => set({ loadError: null, dataset: null, loadStage: 'Retrying' })} />
        ) : (
          <Suspense fallback={<LoadingPanel stage="Opening page" />}>
            <Routes>
              <Route path="/" element={<Overview />} />
              <Route path="/viewer" element={<NetworkViewer />} />
              <Route path="/routing" element={<RoutingLab />} />
              <Route path="/performance" element={<Performance />} />
              <Route path="/simulation" element={<Simulation />} />
              <Route path="/about" element={<About />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        )}
      </main>
    </div>
  )
}
