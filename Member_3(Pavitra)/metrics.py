"""Metrics and CSV export for OrbitNet simulations."""

from __future__ import annotations
import csv
from dataclasses import asdict
from pathlib import Path


def results_to_dicts(results):
    return [asdict(r) for r in results]


def save_results_csv(results, path):
    rows = results_to_dicts(results)
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        return
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def summarize(results):
    valid = [r for r in results if r.path_available]
    if not valid:
        return {"steps": len(results), "available_steps": 0}

    route_changes = sum(r.route_changed for r in valid)
    return {
        "steps": len(results),
        "available_steps": len(valid),
        "path_availability_pct": 100 * len(valid) / len(results),
        "route_changes": route_changes,
        "avg_gnn_distance_km": _avg([r.gnn_distance_km for r in valid]),
        "avg_dijkstra_distance_km": _avg([r.dijkstra_distance_km for r in valid]),
        "avg_gnn_hops": _avg([r.gnn_hops for r in valid]),
        "avg_dijkstra_hops": _avg([r.dijkstra_hops for r in valid]),
        "avg_gnn_eclipsed": _avg([r.gnn_eclipsed for r in valid]),
        "avg_dijkstra_eclipsed": _avg([r.dijkstra_eclipsed for r in valid]),
        "avg_gnn_compute_ms": _avg([r.gnn_compute_ms for r in valid]),
    }


def _avg(values):
    values = [v for v in values if v is not None]
    return sum(values) / len(values) if values else None
