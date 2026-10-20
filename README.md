# OrbitNet — dashboard and 3D satellite viewer

OrbitNet routes traffic across a low-Earth-orbit constellation (10,706 Starlink
orbits) with a graph neural network that learns to avoid eclipsed,
energy-depleted satellites. This branch adds a web dashboard on top of the
team's existing work:

- **Overview** – network state at each saved step, data warnings.
- **Network viewer** – interactive 3D Earth, all satellites and the saved
  link sample, selectable satellites with their full neighbour sets, and the
  saved GNN / Dijkstra routes, with smooth playback of the 20 saved snapshots.
- **Routing lab** – route between any two satellites at any saved step with
  the project's own code (GNN, Dijkstra, energy-aware optimum,
  eclipse-avoiding reference), shown on the globe.
- **Performance** – charts of the saved simulation and of Member 2's
  evaluation.
- **Simulation** – replay of the saved run with a step log.
- **About** – objective, architecture, assumptions, limitations.

The members' code and results are **not modified**. The dashboard lives in
`backend/` and `frontend/` and reaches the existing code by importing it.

## Requirements

- Python 3.10 or newer (tested with 3.13) with the packages the project
  already uses: Skyfield, NetworkX, NumPy, SciPy, PyTorch, PyTorch Geometric.
- Node.js 20 or newer (tested with 22) for the frontend.
- About 2 GB of free RAM for the API when the Routing Lab is used.
- No paid services, API keys or internet access at run time.

## Run it

Two terminals, both starting in the project root (the folder containing
`member_1(Lakshay)`).

**1. API (FastAPI, port 8000)**

```bash
pip install -r backend/requirements.txt
uvicorn orbitnet_api.app:app --app-dir backend --port 8000
```

If PyTorch is not installed yet, the CPU build is enough:
`pip install torch --index-url https://download.pytorch.org/whl/cpu`, then
`pip install torch_geometric`.

The API loads `results/member3/simulation_snapshots.pkl` in about 2 seconds.
It never starts the simulation by itself.

**2. Frontend (Vite, port 5173)**

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. The dev server forwards `/api` to port 8000.

For the presentation, use the optimised build instead of the dev server:

```bash
cd frontend
npm run build
npm run preview      # http://localhost:4173
```

To use a different API address: `ORBITNET_API=http://127.0.0.1:9000 npm run dev`
(PowerShell: `$env:ORBITNET_API="http://127.0.0.1:9000"; npm run dev`).

## Check the integration

```bash
python backend/scripts/verify_integration.py --step 1
```

It rebuilds the chosen step with Member 1's `get_network`, and confirms:

- positions and link count equal the saved snapshot and CSV;
- the dashboard's neighbour lookup equals the full graph;
- routing the simulation's own pair through the dashboard reproduces the
  saved GNN route, its cost, and the saved Dijkstra route exactly;
- no member files or results have changes.

It takes 1–2 minutes and exits non-zero if any check fails. Run on this
branch: 9 of 9 checks pass at steps 1, 5 and 13.

## How it works

```
data/starlink.tle ─► Member 1: get_network(t) ─┐
                                               ├─► Member 3: simulation ─► results/member3/*.pkl, *.csv
Member 2: V5 GNN, energy model, link cost ─────┘                                  │
                                                                                  ▼
                       backend/ (FastAPI) ── reads saved results; calls Member 1/2/3 code for new routes
                                                                                  │
                       frontend/ (React, three.js) ◄──────── JSON + binary arrays ┘
```

**Backend** (`backend/orbitnet_api/`)

| File | Role |
|---|---|
| `project.py` | Puts the three member folders on the import path and switches to the project root (Member 1 opens its data files by relative path). Also adds the correctly-cased `member_2(Krishna)` folder so Member 3's imports work on Linux. |
| `snapshots.py` | Loads the saved snapshots into arrays. Adds per-step Sun direction and Earth orientation, computed from the saved timestamps with Member 1's Skyfield objects, for rendering. |
| `neighbors.py` | A satellite's full neighbour list using Member 1's own `check_los` and `MAX_LINK_DISTANCE` on the saved positions (the snapshots keep only 1 % of links). |
| `routing.py` | Background jobs: rebuild the step with `get_network`, restore the energy the simulation's router saw, then route with `router_adapter.GNNRouter`, `router_adapter.dijkstra_route`, Member 2's `add_routing_costs` (teacher), and `scenario_tests.eclipse_avoiding_reference`. One full graph is cached at a time. |
| `results.py` | Reads `simulation_results.csv`, `summary.txt`, Member 2's `evaluation_results_v5.csv` and the scenario CSV; recomputes averages from the rows. |
| `app.py` | FastAPI endpoints (below). |

**API**

| Endpoint | Returns |
|---|---|
| `GET /api/health` | Load status, missing inputs, model checkpoint present |
| `GET /api/meta` | Steps, timestamps, Sun direction and Earth orientation per step, saved routes, counts, TLE epochs |
| `GET /api/satellites` | Satellite IDs (index order) and implausible-position flags |
| `GET /api/snapshots/positions.bin` | float32 [steps × satellites × 3], km, GCRS |
| `GET /api/snapshots/eclipse.bin`, `energy.bin`, `links.bin` | Eclipse flags, energy, saved link sample per step |
| `GET /api/satellites/{id}?step=k` | Details and full neighbour list at step k |
| `POST /api/routes` | Start a route job `{step, source, target, algorithms}` |
| `GET /api/routes/{job}` | Job progress and result |
| `GET /api/routing/status` | Model loaded, which step's full graph is in memory |
| `GET /api/results/simulation`, `/gnn-evaluation`, `/scenarios` | Saved results with recomputed averages |
| `GET /api/results/files/{name}` | Download a saved CSV, summary or plot |

Errors come back as JSON with a readable `detail`: unknown satellite IDs,
steps out of range, identical endpoints, no route, a missing model or missing
snapshot file.

**Frontend** (`frontend/src/`): the 3D view is in `scene/`, the pages in
`pages/`. See `frontend/README.md`.

### Rendering and playback

The old Plotly animation sends whole traces through Plotly for every frame. The
new viewer uploads geometry to the GPU once and draws all 10,706 satellites in
one call and the link sample in another. Both read two position buffers (this
snapshot and the next) and the GPU blends them, so each frame changes one
number. A new snapshot uploads about 260 KB. The full 1.3-million-link graph
is never sent to the browser; the viewer draws the 1 % sample Member 3 saved,
and routing always uses the full graph on the server.

Between snapshots, satellites move along their arc for display (turn off
**Smooth motion** to see only saved positions). Eclipse states and routes
change only at saved steps, and the readout marks interpolated times.

Measured frame rates are in `docs/dashboard/BENCHMARK.md`. To measure a given
machine, use **Benchmark** in the bottom-right corner of the Network viewer.

## Scientific assumptions

- Links: within 2,000 km with Earth-clearing line of sight. The 2,000 km figure
  is a prototype assumption, not a verified Starlink specification.
- Eclipse: cylindrical shadow of Earth's radius, no penumbra.
- Positions: SGP4 propagation of TLEs dated 5–7 Sep 2026 to 20 Oct 2026
  (about 43 days), so geometry is representative, not exact. This is not live
  tracking.
- Earth imagery, city lights, stars, Sun glow and atmosphere are visual
  approximations; Earth orientation and Sun direction are computed per
  snapshot so day/night matches the eclipse flags.

Data issues found while integrating are listed in
`docs/dashboard/FINDINGS.md`. They include a stale `summary.txt`, decayed-TLE
satellites used as Dijkstra relays, and a Linux path-case issue. The full list
of added files is in `docs/dashboard/CHANGES.md`.

## Troubleshooting

- **"The OrbitNet API is not reachable"**: start the API (step 1) from the
  project root, on port 8000.
- **"Saved snapshots not found"**: run `python "Member_3(Pavitra)/main.py"`
  once; note it overwrites `results/member3/`.
- **"The GNN model could not be loaded"**: install PyTorch and PyTorch
  Geometric; check `member_2(Krishna)/orbitnet_gnn_v5.pth` exists.
- **Routing Lab is slow the first time**: expected. The first request for a step
  rebuilds 1.3 million links (~20 s) and scores them with the GNN (~40 s).
  Later requests on that step take a few seconds.
- **3D view is slow**: close other GPU-heavy tabs; turn off **Link sample**
  under Layers; make sure the browser uses hardware acceleration.
