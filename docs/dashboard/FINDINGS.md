# Findings from integrating the dashboard

Issues found in the existing code and data while building the dashboard. None
have been fixed in the members' files, since those changes need the team's
approval. The dashboard works around each one and states it in the UI where it
affects what is shown.

## 1. `results/member3/summary.txt` does not match `simulation_results.csv`

The CSV and the saved snapshots come from the same run (identical timestamps,
routes and edge counts; the backend reproduces its routes exactly). The PNG
plots in `results/member3/` match the CSV. `summary.txt` does not:

| Average | summary.txt | from the CSV |
|---|---|---|
| GNN route distance | 18,149 km | 21,549 km |
| Dijkstra route distance | 17,089 km | 20,599 km |
| GNN hops | 9.35 | 11.0 |
| Dijkstra hops | 11.3 | 13.4 |
| GNN eclipsed satellites on route | 2.65 | 1.40 |
| Dijkstra eclipsed satellites on route | 3.8 | 6.95 |
| GNN compute time | 42,354 ms | 178,519 ms (median 39,862 ms) |

It appears to be left over from an earlier run. The dashboard computes all
averages from the CSV and shows a warning. **Suggested fix (needs approval):**
regenerate `summary.txt` from the CSV, or rerun `main.py`.

## 2. One step's GNN time is a 47-minute outlier

Step 8 (index 7) logged 2,808,800 ms; every other step took 39–43 s. This
usually means the computer slept or was busy during that step. The mean
(178.5 s) is therefore misleading; the dashboard reports the median (39.9 s)
and draws that bar cut off at the top of the chart, marked "off scale".

## 3. Satellites with impossible positions stay in the graph and carry routes

All 10,717 TLEs in `data/starlink.tle` date from 5–7 Sep 2026; the snapshots are
for 20 Oct 2026, about 43 days later. Member 1's `network_builder` removes only
non-finite positions, so 182–183 satellites per step (184 across the run) remain with altitudes
below 100 km (many inside the Earth) or above 2,000 km (up to ~118,000 km).

- Those inside the Earth get no links (the line-of-sight check rejects them).
- Those 8–95 km above the surface **do** get links (up to ~335 each).
- The saved **Dijkstra** routes relay through such satellites at 8 of 20
  steps (steps 1, 3, 5, 12, 13, 14, 18, 19, 1-based). The saved GNN routes
  never do.

This flatters the shortest-distance baseline in the GNN-vs-Dijkstra
comparison. The dashboard flags these satellites and routes, and can hide them
from the 3D view (display only). **Suggested fix (needs approval, changes
results):** filter by altitude in Member 1's builder (e.g. keep 150–2,000 km),
or refresh the TLE file closer to the simulated date, then rerun the
simulation.

## 4. Member 3's imports fail on Linux (folder-name case)

`Member_3(Pavitra)/router_adapter.py`, `router_adapter_v2.py` and
`simulation.py` add `Member_2(Krishna)` (capital M) to `sys.path`; the folder
is `member_2(Krishna)`. This works on Windows and macOS (case-insensitive file
systems) but fails on Linux with `ModuleNotFoundError: gnn_model_v5`. The
dashboard adds the correct path itself, so it works everywhere without editing
those files. **Suggested fix (needs approval):** change the three paths to
`member_2(Krishna)`.

## 5. `member_1(Lakshay)/validate_network.py` crashes

`build_network_at_time` returns `(G, states)`, but the script assigns the
tuple to `G` and fails at `G.number_of_nodes()` with
`AttributeError: 'tuple' object has no attribute 'number_of_nodes'`.
`backend/scripts/verify_integration.py` performs equivalent checks.
**Suggested fix (needs approval):** `G, _ = build_network_at_time(t)`.

## 6. Results worth knowing before presenting

From the team's own saved results (not new experiments):

- In the 20-step simulation the GNN route is 4.6 % longer than the
  shortest-distance route on average, uses 2.4 fewer hops, and passes through
  1.40 eclipsed satellites against 6.95 for Dijkstra.
- The GNN route changes at all 19 step-to-step transitions and keeps on
  average 0.8 of its 10 relays, so it is not stable over 30-second steps.
- In Member 2's 100-pair evaluation the GNN's routes cost on average 8.1 %
  more than the energy-aware optimum (teacher), while the shortest-distance
  baseline cost 3.3 % more; the GNN was cheaper than the baseline on 24 of 100
  pairs.
- In Member 3's synthetic "difficult routing" scenario an eclipse-free path
  exists, but the GNN takes the same eclipsed route as Dijkstra.

## Checks that passed

- `get_network` rebuilds the saved steps exactly (position difference
  ~2×10⁻⁸ km; link counts equal the CSV).
- The backend reproduces the saved GNN route, its GNN cost (to 9 decimal
  places), and the saved Dijkstra route at the steps tested.
- Unmodified member scripts still run in this environment:
  `orbitnet_interface.py`, `gnn_routing_v5.py` (inputs on stdin),
  `scenario_tests.py` (output identical to the committed CSV apart from line
  endings) and `rebuild_visualization.py`. Scripts that write files were run
  in a scratch copy so the committed results stay untouched.
