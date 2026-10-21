# Changes on `feature/orbitnet-dashboard-ui`

Branched from `feature/orbitnet-dashboard` (commit `7e185cf`).

## Existing files modified

**None.** Nothing in `member_1(Lakshay)/`, `member_2(Krishna)/`,
`Member_3(Pavitra)/`, `data/`, `results/`, `de421.bsp` or the root
`.gitignore` was changed, moved or reformatted. `backend/scripts/verify_integration.py`
checks this with `git status`. The backend also turns off Python bytecode
caching, so it does not write `__pycache__` folders into the member folders.

## Fixes proposed but not made (need approval)

See `FINDINGS.md` for evidence.

| File | Proposed change | Why |
|---|---|---|
| `Member_3(Pavitra)/router_adapter.py`, `router_adapter_v2.py`, `simulation.py` | `Member_2(Krishna)` → `member_2(Krishna)` in the path setup | Imports fail on Linux (case-sensitive). The dashboard works around it. |
| `member_1(Lakshay)/validate_network.py` | `G, _ = build_network_at_time(t)` | Currently crashes with `AttributeError`. |
| `results/member3/summary.txt` | Regenerate from `simulation_results.csv` | Its averages come from a different run. |
| `member_1(Lakshay)/network_builder.py` | Optional altitude filter for decayed TLEs | Saved Dijkstra routes relay through satellites 8–95 km above the surface. Changes results, so it is a team decision. |

## Files added

### Project root

| File | Purpose |
|---|---|
| `README.md` | Installation, exact run commands, architecture, API, assumptions, troubleshooting. |

### `backend/` – FastAPI service over the existing code

| File | Purpose |
|---|---|
| `orbitnet_api/__init__.py` | Package marker. |
| `orbitnet_api/project.py` | Paths; puts member folders on `sys.path` (including the correctly-cased Member 2 folder) and changes to the project root, as the members' scripts do. |
| `orbitnet_api/snapshots.py` | Loads `simulation_snapshots.pkl` into arrays; Sun direction and Earth orientation per step from Member 1's Skyfield objects; flags implausible altitudes. |
| `orbitnet_api/neighbors.py` | Full neighbour lists using Member 1's `check_los` and `MAX_LINK_DISTANCE` on the saved positions, or the full graph when it is in memory. |
| `orbitnet_api/routing.py` | Routing jobs: `get_network` rebuild with position check, energy-state restore, then Member 3's `GNNRouter` (subclassed only to reuse link scores) and `dijkstra_route`, Member 2's `add_routing_costs` (teacher), Member 3's `eclipse_avoiding_reference`. |
| `orbitnet_api/results.py` | Reads the saved CSVs and summary; recomputes averages; detects `summary.txt` mismatches. |
| `orbitnet_api/app.py` | FastAPI app and endpoints. |
| `requirements.txt` | Dashboard dependencies plus the members' existing ones. |
| `scripts/verify_integration.py` | Re-runnable end-to-end check against the saved results. |

### `frontend/` – React + TypeScript + Vite + Tailwind + three.js

| File | Purpose |
|---|---|
| `package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig*.json`, `index.html`, `.gitignore`, `.oxlintrc.json` | Project setup (Vite template, `/api` proxy to port 8000). |
| `README.md` | Frontend commands and layout. |
| `public/favicon.svg` | Icon. |
| `public/textures/*` + `NOTICE.md` | Bundled Earth, night-lights, ocean-mask and star images, with their source. |
| `src/main.tsx`, `src/App.tsx`, `src/index.css` | Entry, routes, design tokens. |
| `src/lib/api.ts` | Typed API client. |
| `src/lib/data.ts` | Loads the binary snapshot arrays; arc interpolation between snapshots (mirrors the shader). |
| `src/lib/store.ts` | Playback clock and UI state. |
| `src/lib/format.ts`, `src/lib/useResource.ts` | Number/time formatting; cached fetching. |
| `src/scene/frame.ts` | GCRS → scene coordinates, interpolated Sun direction and Earth orientation. |
| `src/scene/shaders.ts` | GLSL for satellites, links, Earth and atmosphere. |
| `src/scene/Earth.tsx` | Earth in the Earth-fixed frame, atmosphere, Sun, stars, optional shadow-cylinder overlay. |
| `src/scene/Constellation.tsx` | All satellites (one draw) and the link sample (one draw) sharing GPU buffers; per-step uploads; selection/neighbour/route highlighting. |
| `src/scene/RoutePath.tsx` | Route rendering: core, glow, moving direction dashes, chevrons, relay markers, see-through ghost behind Earth, fade/reveal on route change. |
| `src/scene/labels.tsx` | DOM labels for route endpoints and hops, projected each frame. |
| `src/scene/Picking.tsx` | Click and hover picking with Earth occlusion. |
| `src/scene/GlobeScene.tsx` | Canvas, camera rig, playback driver, FPS counter and benchmark driver. |
| `src/scene/perf.ts` | Frame statistics and benchmark state. |
| `src/components/*` | Sidebar, playback bar, satellite inspector, satellite picker, viewer overlays (legend, route card, layers, search, benchmark), charts, assumptions, UI primitives. |
| `src/pages/*` | Overview, NetworkViewer, RoutingLab, Performance, Simulation, About. |

### `docs/dashboard/`

| File | Purpose |
|---|---|
| `CHANGES.md` | This list. |
| `FINDINGS.md` | Data and code issues found during integration, and results worth knowing. |
| `BENCHMARK.md` | Rendering benchmark method and results. |
| `benchmark/compare_render.py` | Plotly vs WebGL comparison script (Playwright). |
| `benchmark/sandbox-swiftshader-2026-10-20.json` | Raw results from the software-rendering run. |
