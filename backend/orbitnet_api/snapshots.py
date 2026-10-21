"""Read Member 3's saved simulation snapshots into compact arrays.

The pickle written by ``Member_3(Pavitra)/main.py`` holds, per step:

* ``graph`` – every satellite with its saved position (km), eclipse flag and
  energy, plus a 1 % sample of the communication links (every 100th edge of
  Member 1's full graph) and the edges of that step's GNN route;
* ``gnn_route`` / ``dijkstra_route`` – the routes Member 3's simulation found;
* ``timestamp`` – the UTC time of the step.

Nothing here recomputes positions, eclipses, links or routes. The only new
values are rendering helpers derived from the saved timestamps with Member 1's
own Skyfield objects: the Sun direction (same expression Member 1's eclipse
detector uses) and the Earth-orientation matrix used to rotate the Earth
texture into the same inertial frame as the satellite positions.
"""

from __future__ import annotations

import csv
import ast
import pickle
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import numpy as np

from . import project

# Altitude limits outside which a propagated position is not physically
# plausible for a Starlink satellite (inside/skimming Earth, or far beyond any
# Starlink shell). Such positions come from stale or decayed TLEs. They are
# flagged for display only; the graph and routing are never changed.
PLAUSIBLE_MIN_ALT_KM = 100.0
PLAUSIBLE_MAX_ALT_KM = 2000.0


@dataclass
class StepFrame:
    step: int
    timestamp: str
    sun_direction: list[float]
    itrs_to_gcrs: list[list[float]]
    gnn_route: list[int] | None
    dijkstra_route: list[int] | None
    gnn_implausible: list[int]
    dijkstra_implausible: list[int]
    sampled_edge_count: int
    eclipsed_count: int
    implausible_count: int
    csv_row: dict[str, Any] | None


@dataclass
class SnapshotStore:
    ids: list[str]
    index_of: dict[str, int]
    timestamps: list[str]
    positions_km: np.ndarray        # (T, N, 3) float64, GCRS, km
    eclipsed: np.ndarray            # (T, N) bool
    energy: np.ndarray              # (T, N) float64, saved post-routing energy
    radius_km: np.ndarray           # (T, N) float64
    plausible: np.ndarray           # (T, N) bool
    sampled_edges: list[np.ndarray]  # per step (E, 2) int32
    sampled_edge_attrs: list[dict[tuple[int, int], dict[str, float]]]
    frames: list[StepFrame]
    step_seconds: float
    earth_radius_km: float
    link_distance_km: float
    _trees: dict[int, Any] = field(default_factory=dict)

    @property
    def steps(self) -> int:
        return len(self.timestamps)

    @property
    def count(self) -> int:
        return len(self.ids)


def _read_simulation_csv() -> list[dict[str, Any]]:
    if not project.SIMULATION_CSV.exists():
        return []
    rows = []
    with project.SIMULATION_CSV.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            rows.append(row)
    return rows


def _route_indices(route, index_of) -> list[int] | None:
    if not route:
        return None
    return [index_of[n] for n in route if n in index_of]


def load_store() -> SnapshotStore:
    """Load the saved snapshots. Raises FileNotFoundError if missing."""
    project.configure()

    if not project.SNAPSHOTS_PATH.exists():
        raise FileNotFoundError(
            f"Saved snapshots not found: {project.SNAPSHOTS_PATH}. "
            "Run Member_3(Pavitra)/main.py once to create them."
        )

    # Member 1 modules: reuse their time scale, ephemeris and constants.
    from eclipse_detector import ts, sun, earth  # noqa: E402
    from network_builder import MAX_LINK_DISTANCE, EARTH_RADIUS  # noqa: E402
    from skyfield.framelib import itrs

    # The snapshot file is produced by this project's own simulation.
    with project.SNAPSHOTS_PATH.open("rb") as f:
        snapshots = pickle.load(f)

    if not snapshots:
        raise ValueError("The saved snapshot collection is empty.")

    ids = list(snapshots[0]["graph"].nodes())
    index_of = {sat_id: i for i, sat_id in enumerate(ids)}
    T, N = len(snapshots), len(ids)

    positions = np.full((T, N, 3), np.nan, dtype=np.float64)
    eclipsed = np.zeros((T, N), dtype=bool)
    energy = np.full((T, N), np.nan, dtype=np.float64)
    radius = np.full((T, N), np.nan, dtype=np.float64)

    sampled_edges: list[np.ndarray] = []
    sampled_attrs: list[dict] = []
    timestamps: list[str] = []

    for k, snap in enumerate(snapshots):
        G = snap["graph"]
        timestamps.append(snap["timestamp"])
        for sat_id, data in G.nodes(data=True):
            i = index_of.get(sat_id)
            if i is None:
                continue
            positions[k, i] = (data["x"], data["y"], data["z"])
            eclipsed[k, i] = bool(data.get("eclipsed", False))
            energy[k, i] = float(data.get("energy", np.nan))
            radius[k, i] = float(data.get("distance_from_earth", np.nan))

        pairs = []
        attrs = {}
        for u, v, data in G.edges(data=True):
            a, b = index_of.get(u), index_of.get(v)
            if a is None or b is None:
                continue
            key = (min(a, b), max(a, b))
            pairs.append(key)
            attrs[key] = {
                k2: float(v2) for k2, v2 in data.items()
                if isinstance(v2, (int, float))
            }
        sampled_edges.append(np.asarray(pairs, dtype=np.int32).reshape(-1, 2))
        sampled_attrs.append(attrs)

    altitude = radius - EARTH_RADIUS
    plausible = (altitude >= PLAUSIBLE_MIN_ALT_KM) & (altitude <= PLAUSIBLE_MAX_ALT_KM)

    parsed = [datetime.fromisoformat(s) for s in timestamps]
    if len(parsed) > 1:
        step_seconds = (parsed[1] - parsed[0]).total_seconds()
    else:
        step_seconds = 0.0

    csv_rows = _read_simulation_csv()
    csv_by_step = {int(r["step"]): r for r in csv_rows if r.get("step")}

    frames: list[StepFrame] = []
    for k, snap in enumerate(snapshots):
        t = ts.from_datetime(parsed[k])

        # Same Sun vector Member 1's eclipse detector uses: (sun - earth).
        sun_vec = (sun - earth).at(t).position.km
        sun_dir = sun_vec / np.linalg.norm(sun_vec)

        # Skyfield gives GCRS -> ITRS; the Earth mesh needs ITRS -> GCRS.
        gcrs_to_itrs = itrs.rotation_at(t)
        itrs_to_gcrs = np.asarray(gcrs_to_itrs).T

        gnn_idx = _route_indices(snap.get("gnn_route"), index_of)
        dij_idx = _route_indices(snap.get("dijkstra_route"), index_of)
        frames.append(
            StepFrame(
                step=int(snap.get("step", k)),
                timestamp=timestamps[k],
                sun_direction=[float(c) for c in sun_dir],
                itrs_to_gcrs=[[float(c) for c in row] for row in itrs_to_gcrs],
                gnn_route=gnn_idx,
                dijkstra_route=dij_idx,
                gnn_implausible=[i for i in (gnn_idx or []) if not plausible[k, i]],
                dijkstra_implausible=[i for i in (dij_idx or []) if not plausible[k, i]],
                sampled_edge_count=int(len(sampled_edges[k])),
                eclipsed_count=int(eclipsed[k].sum()),
                implausible_count=int((~plausible[k]).sum()),
                csv_row=_parse_csv_row(csv_by_step.get(k)),
            )
        )

    return SnapshotStore(
        ids=ids,
        index_of=index_of,
        timestamps=timestamps,
        positions_km=positions,
        eclipsed=eclipsed,
        energy=energy,
        radius_km=radius,
        plausible=plausible,
        sampled_edges=sampled_edges,
        sampled_edge_attrs=sampled_attrs,
        frames=frames,
        step_seconds=step_seconds,
        earth_radius_km=float(EARTH_RADIUS),
        link_distance_km=float(MAX_LINK_DISTANCE),
    )


_INT = {
    "step", "nodes", "edges", "eclipsed_count", "gnn_hops", "dijkstra_hops",
    "gnn_eclipsed", "dijkstra_eclipsed",
}
_FLOAT = {"gnn_distance_km", "dijkstra_distance_km", "gnn_cost", "gnn_compute_ms"}
_BOOL = {"route_changed", "path_available"}
_LIST = {"gnn_route", "dijkstra_route"}


def _parse_csv_row(row: dict[str, str] | None) -> dict[str, Any] | None:
    """Convert one simulation_results.csv row to typed values."""
    if row is None:
        return None
    out: dict[str, Any] = {}
    for key, value in row.items():
        if value is None or value == "":
            out[key] = None
        elif key in _INT or key in _FLOAT:
            try:
                number = float(value)
                out[key] = int(number) if key in _INT else number
            except ValueError:
                out[key] = None
        elif key in _BOOL:
            out[key] = value.strip().lower() == "true"
        elif key in _LIST:
            try:
                out[key] = ast.literal_eval(value)
            except (ValueError, SyntaxError):
                out[key] = None
        else:
            out[key] = value
    return out
