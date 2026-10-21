# OrbitNet dashboard frontend

React + TypeScript + Vite + Tailwind CSS, with three.js (React Three Fiber) for
the 3D view and Recharts for charts. Setup and run commands are in the
project-level `README.md`.

```
npm install
npm run dev        # http://localhost:5173 (expects the API on port 8000)
npm run build      # production build in dist/
npm run preview    # serve the build on http://localhost:4173
npm run typecheck
```

Layout:

- `src/scene/` – the 3D view: Earth and Sun (`Earth.tsx`), all satellites and
  the link sample on the GPU (`Constellation.tsx`, `shaders.ts`), routes
  (`RoutePath.tsx`), picking, labels, playback and the benchmark driver
  (`GlobeScene.tsx`, `perf.ts`).
- `src/pages/` – Overview, Network viewer, Routing lab, Performance,
  Simulation, About.
- `src/lib/` – API client and types, data loading, playback state.
- `public/textures/` – bundled Earth and star imagery (see `NOTICE.md`).
