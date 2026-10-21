"""Read the evaluation results the team already produced.

Sources (read-only):

* ``results/member3/simulation_results.csv`` and ``summary.txt`` – Member 3's
  20-step dynamic simulation, GNN vs shortest-distance (Dijkstra).
* ``member_2(Krishna)/evaluation_results_v5.csv`` – Member 2's 100 random
  source/destination tests at one time instant: teacher (energy-aware
  optimum), GNN and shortest-distance baseline.
* ``results/member3/scenario_results.csv`` – Member 3's synthetic six-node
  scenario tests (not orbital data).

Aggregates are computed here from those rows with plain averages and counts,
and each is labelled with the file it came from.
"""

from __future__ import annotations

import csv
from pathlib import Path
from statistics import mean, median
from typing import Any

from . import project
from .snapshots import _parse_csv_row


def _read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _num(value: str | None) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except ValueError:
        return None


def _avg(values) -> float | None:
    values = [v for v in values if v is not None]
    return mean(values) if values else None


def simulation_results() -> dict[str, Any]:
    rows = [_parse_csv_row(r) for r in _read_csv(project.SIMULATION_CSV)]
    summary: dict[str, Any] = {}
    if project.SUMMARY_TXT.exists():
        for line in project.SUMMARY_TXT.read_text(encoding="utf-8").splitlines():
            if ":" in line:
                key, value = line.split(":", 1)
                value = value.strip()
                number = _num(value)
                summary[key.strip()] = number if number is not None else value

    steps = []
    for r in rows:
        if r is None:
            continue
        steps.append({
            "step": r["step"],
            "timestamp": r["timestamp_utc"],
            "source": r["source"],
            "target": r["target"],
            "nodes": r["nodes"],
            "edges": r["edges"],
            "network_eclipsed": r["eclipsed_count"],
            "gnn_distance_km": r["gnn_distance_km"],
            "dijkstra_distance_km": r["dijkstra_distance_km"],
            "gnn_hops": r["gnn_hops"],
            "dijkstra_hops": r["dijkstra_hops"],
            "gnn_eclipsed": r["gnn_eclipsed"],
            "dijkstra_eclipsed": r["dijkstra_eclipsed"],
            "gnn_cost": r["gnn_cost"],
            "route_changed": r["route_changed"],
            "gnn_compute_ms": r["gnn_compute_ms"],
            "path_available": r["path_available"],
            "gnn_route": r["gnn_route"],
            "dijkstra_route": r["dijkstra_route"],
        })

    # How much of each GNN route survives into the next step (by satellite).
    for prev, cur in zip(steps, steps[1:]):
        a, b = prev.get("gnn_route") or [], cur.get("gnn_route") or []
        inner_a, inner_b = set(a[1:-1]), set(b[1:-1])
        cur["relays_kept_from_previous"] = len(inner_a & inner_b)
        cur["relays_total"] = len(inner_b)
    if steps:
        steps[0]["relays_kept_from_previous"] = None
        steps[0]["relays_total"] = len((steps[0].get("gnn_route") or [])[1:-1])

    # Averages recomputed from the CSV rows (the CSV matches the snapshots).
    valid = [s for s in steps if s.get("path_available")]
    compute = [s["gnn_compute_ms"] for s in valid if s.get("gnn_compute_ms") is not None]
    derived = {
        "steps": len(steps),
        "available_steps": len(valid),
        "path_availability_pct": 100 * len(valid) / len(steps) if steps else None,
        "route_changes": sum(1 for s in valid if s.get("route_changed")),
        "avg_gnn_distance_km": _avg(s["gnn_distance_km"] for s in valid),
        "avg_dijkstra_distance_km": _avg(s["dijkstra_distance_km"] for s in valid),
        "avg_gnn_hops": _avg(s["gnn_hops"] for s in valid),
        "avg_dijkstra_hops": _avg(s["dijkstra_hops"] for s in valid),
        "avg_gnn_eclipsed": _avg(s["gnn_eclipsed"] for s in valid),
        "avg_dijkstra_eclipsed": _avg(s["dijkstra_eclipsed"] for s in valid),
        "avg_gnn_compute_ms": _avg(compute),
        "median_gnn_compute_ms": median(compute) if compute else None,
        "max_gnn_compute_ms": max(compute) if compute else None,
        "avg_relays_kept": _avg(s.get("relays_kept_from_previous") for s in steps[1:]),
    }

    # Does summary.txt agree with the CSV it is supposed to summarise?
    mismatches = []
    for key, value in summary.items():
        if key in derived and isinstance(value, (int, float)) and derived[key] is not None:
            ref = derived[key]
            if abs(value - ref) > max(1e-6, 1e-3 * abs(ref)):
                mismatches.append({"key": key, "summary_txt": value, "from_csv": ref})

    notes = [
        "Dijkstra computation time was not logged by the simulation, so "
        "only GNN computation time is shown per step.",
        "GNN computation time covers scoring all ~1.3 million links with "
        "the model plus the shortest-path search, on the machine that ran "
        "the simulation.",
    ]
    if derived["max_gnn_compute_ms"] and derived["median_gnn_compute_ms"] and (
        derived["max_gnn_compute_ms"] > 10 * derived["median_gnn_compute_ms"]
    ):
        notes.append(
            "One step's GNN time is more than ten times the median; this "
            "usually means the computer was busy or asleep during that step, "
            "so the median is the better typical value."
        )

    return {
        "source_files": [
            "results/member3/simulation_results.csv",
            "results/member3/summary.txt",
        ],
        "summary": summary,
        "derived": derived,
        "summary_mismatches": mismatches,
        "steps": steps,
        "notes": notes,
    }


def gnn_evaluation() -> dict[str, Any]:
    raw = _read_csv(project.GNN_EVAL_CSV)
    rows = []
    for r in raw:
        rows.append({k: (_num(v) if k not in ("source", "target") else v) for k, v in r.items()})

    ratios = [r["gnn_teacher_ratio"] for r in rows if r.get("gnn_teacher_ratio") is not None]
    n = len(ratios)

    def share(limit):
        return (sum(1 for x in ratios if x <= limit) / n) if n else None

    teacher = _avg(r["teacher_cost"] for r in rows)
    gnn = _avg(r["gnn_cost"] for r in rows)
    baseline = _avg(r["baseline_cost"] for r in rows)
    derived = {
        "tests": n,
        "avg_teacher_cost": teacher,
        "avg_gnn_cost": gnn,
        "avg_baseline_cost": baseline,
        "gnn_over_teacher": (gnn / teacher) if gnn and teacher else None,
        "baseline_over_teacher": (baseline / teacher) if baseline and teacher else None,
        "median_ratio": median(ratios) if ratios else None,
        "exact_match": None,  # route lists were not saved, so cannot be recomputed
        "within_5pct": share(1.05),
        "within_10pct": share(1.10),
        "within_20pct": share(1.20),
        "gnn_cheaper_than_baseline": (
            sum(1 for r in rows if r["gnn_cost"] < r["baseline_cost"]) / n if n else None
        ),
        "avg_teacher_distance_km": _avg(r["teacher_distance"] for r in rows),
        "avg_gnn_distance_km": _avg(r["gnn_distance"] for r in rows),
        "avg_baseline_distance_km": _avg(r["baseline_distance"] for r in rows),
        "avg_teacher_hops": _avg(r["teacher_hops"] for r in rows),
        "avg_gnn_hops": _avg(r["gnn_hops"] for r in rows),
        "avg_baseline_hops": _avg(r["baseline_hops"] for r in rows),
    }
    return {
        "source_files": ["member_2(Krishna)/evaluation_results_v5.csv"],
        "rows": rows,
        "derived": derived,
        "notes": [
            "100 random source/destination pairs in the largest connected "
            "component at a single time instant, with energy after 5 simulated "
            "update steps (evaluate_gnn_v5.py).",
            "Costs are Member 2's energy-aware routing cost (distance/2000 + "
            "0.3·energy penalty + 0.2·eclipse penalty), summed along each route.",
            "Exact-match counts are printed by the script but the routes "
            "themselves are not saved in the CSV, so they are not shown here.",
        ],
    }


def scenario_results() -> dict[str, Any]:
    rows = []
    for r in _read_csv(project.SCENARIO_CSV):
        rows.append({k: (_num(v) if _num(v) is not None else v) for k, v in r.items()})
    return {
        "source_files": ["results/member3/scenario_results.csv"],
        "rows": rows,
        "notes": [
            "Synthetic six-node test graphs from Member 3's scenarios.py, "
            "not orbital data.",
        ],
    }


DOWNLOADABLE = {
    "simulation_results.csv": project.SIMULATION_CSV,
    "summary.txt": project.SUMMARY_TXT,
    "scenario_results.csv": project.SCENARIO_CSV,
    "evaluation_results_v5.csv": project.GNN_EVAL_CSV,
    "route_distance.png": project.RESULTS_DIR / "route_distance.png",
    "route_hops.png": project.RESULTS_DIR / "route_hops.png",
    "eclipse_usage.png": project.RESULTS_DIR / "eclipse_usage.png",
    "network_eclipse_count.png": project.RESULTS_DIR / "network_eclipse_count.png",
}
