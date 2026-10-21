"""Check that the dashboard backend reproduces the team's saved results.

Run from the project root (takes about 1–2 minutes and ~1.6 GB of RAM):

    python backend/scripts/verify_integration.py            # step 1
    python backend/scripts/verify_integration.py --step 5   # any saved step (1-based)

Checks, all against the saved files and the members' own code:

1. Member 1's ``get_network`` rebuilds the saved step: same satellites, same
   positions, same link count as ``simulation_results.csv``.
2. The neighbour lookup used by the dashboard (Member 1's link rule on the
   saved positions) gives exactly the rebuilt graph's adjacency.
3. Every link stored in the snapshot exists in the rebuilt graph with the
   same length.
4. Routing the simulation's own pair through the dashboard's routing service
   (Member 3's GNNRouter / dijkstra_route) gives the saved routes.
5. The member folders and saved results have no uncommitted changes.

Exit code 0 when every check passes.
"""

from __future__ import annotations

import argparse
import random
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve()
sys.path.insert(0, str(HERE.parents[1]))  # backend/

from orbitnet_api import project  # noqa: E402

results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""), flush=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--step", type=int, default=1, help="saved step to check, 1-based (default 1)")
    parser.add_argument("--samples", type=int, default=200, help="satellites to compare neighbours for")
    args = parser.parse_args()

    project.configure()
    from orbitnet_api.snapshots import load_store
    from orbitnet_api.neighbors import neighbours_from_link_rule, neighbours_from_graph
    from orbitnet_api.routing import RoutingService, Job

    t0 = time.perf_counter()
    store = load_store()
    k = args.step - 1
    if not 0 <= k < store.steps:
        print(f"Step must be between 1 and {store.steps}.")
        return 2
    frame = store.frames[k]
    print(f"Loaded {store.count} satellites x {store.steps} steps in {time.perf_counter() - t0:.1f} s; checking step {args.step}.")

    # 1. Rebuild with Member 1 and compare.
    service = RoutingService(store)
    row = frame.csv_row or {}
    job = Job(id="verify", step=k, source=row.get("source") or "", target=row.get("target") or "",
              algorithms=["gnn", "dijkstra"])
    t0 = time.perf_counter()
    prepared = service._prepare(job)
    G = prepared.graph
    pc = prepared.position_check
    check("Member 1 rebuild has the snapshot's satellites",
          pc["nodes_rebuilt"] == store.count and pc["nodes_not_in_snapshot"] == 0,
          f"{pc['nodes_rebuilt']} rebuilt, {store.count} saved")
    check("Rebuilt positions equal the saved positions",
          pc["matches_snapshot"], f"largest difference {pc['max_position_difference_km']:.2e} km")
    if row.get("edges") is not None:
        check("Rebuilt link count equals simulation_results.csv",
              G.number_of_edges() == row["edges"], f"{G.number_of_edges():,} vs {row['edges']:,}")
    print(f"    rebuild took {time.perf_counter() - t0:.1f} s; {prepared.components} connected components")

    # 2. Neighbour rule vs. full adjacency on a random sample (plus route satellites).
    rng = random.Random(42)
    sample = rng.sample(range(store.count), min(args.samples, store.count))
    sample += [i for i in (frame.gnn_route or [])]
    mismatched = []
    for i in sample:
        a = {j for j, _ in neighbours_from_link_rule(store, k, i)}
        b = {j for j, _ in neighbours_from_graph(G, store, store.ids[i])}
        if a != b:
            mismatched.append(store.ids[i])
    check("Dashboard neighbour lookup equals the rebuilt graph",
          not mismatched, f"{len(sample)} satellites compared" + (f"; differ: {mismatched[:5]}" if mismatched else ""))

    # 3. Saved link sample is a subset of the rebuilt graph.
    missing = 0
    worst = 0.0
    for (a, b), attrs in store.sampled_edge_attrs[k].items():
        u, v = store.ids[a], store.ids[b]
        if not G.has_edge(u, v):
            missing += 1
            continue
        worst = max(worst, abs(G[u][v]["distance"] - attrs.get("distance", float("nan"))))
    check("Saved snapshot links exist in the rebuilt graph",
          missing == 0 and worst < 1e-6,
          f"{len(store.sampled_edge_attrs[k]):,} links, {missing} missing, largest length difference {worst:.1e} km")

    # 4. Reproduce the saved routes.
    if job.source and job.target:
        t0 = time.perf_counter()
        out = service._route(job)
        gnn = out["routes"].get("gnn", {})
        dij = out["routes"].get("dijkstra", {})
        saved_gnn = [store.ids[i] for i in (frame.gnn_route or [])]
        saved_dij = [store.ids[i] for i in (frame.dijkstra_route or [])]
        check("GNN route equals the saved simulation route",
              gnn.get("path") == saved_gnn, f"{len(saved_gnn) - 1} hops")
        if row.get("gnn_cost") is not None and gnn.get("gnn_cost") is not None:
            check("GNN route cost equals simulation_results.csv",
                  abs(gnn["gnn_cost"] - row["gnn_cost"]) < 1e-6, f"{gnn['gnn_cost']:.9f} vs {row['gnn_cost']:.9f}")
        check("Dijkstra route equals the saved simulation route",
              dij.get("path") == saved_dij, f"{len(saved_dij) - 1} hops")
        print(f"    routing took {time.perf_counter() - t0:.1f} s")

    # 5. Member code and results untouched.
    try:
        protected = ["member_1(Lakshay)", "member_2(Krishna)", "Member_3(Pavitra)", "results", "data", "de421.bsp"]
        diff = subprocess.run(["git", "status", "--porcelain", "--", *protected],
                              cwd=project.ROOT, capture_output=True, text=True, check=True).stdout.strip()
        check("Member folders, data and results have no changes", diff == "", diff.replace("\n", "; ")[:300])
    except (OSError, subprocess.CalledProcessError) as exc:
        check("Member folders, data and results have no changes", False, f"git not available: {exc}")

    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)} of {len(results)} checks passed.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
