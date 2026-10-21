"""OrbitNet dashboard API (FastAPI).

Start from the project root:

    uvicorn orbitnet_api.app:app --app-dir backend --port 8000

The API serves saved data only; nothing expensive runs at startup. A route
request rebuilds one step's full network with Member 1's code and routes with
Member 2/3's code in a background worker (see ``routing.py``).
"""

from __future__ import annotations

import math
import platform
import struct
import time
from contextlib import asynccontextmanager
from typing import Any

import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field

from . import project, results
from .neighbors import neighbours_from_graph, neighbours_from_link_rule
from .routing import ALGORITHMS, RoutingError, RoutingService
from .snapshots import PLAUSIBLE_MAX_ALT_KM, PLAUSIBLE_MIN_ALT_KM, SnapshotStore, load_store


class State:
    store: SnapshotStore | None = None
    routing: RoutingService | None = None
    load_error: str | None = None
    load_seconds: float | None = None
    binary_cache: dict[str, bytes] = {}


state = State()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    project.configure()
    t0 = time.perf_counter()
    try:
        state.store = load_store()
        state.routing = RoutingService(state.store)
    except Exception as exc:  # the API still starts and reports the problem
        state.load_error = f"{type(exc).__name__}: {exc}"
    state.load_seconds = round(time.perf_counter() - t0, 2)
    yield


app = FastAPI(title="OrbitNet Dashboard API", version="1.0.0", lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=2048)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173",
                   "http://localhost:4173", "http://127.0.0.1:4173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _store() -> SnapshotStore:
    if state.store is None:
        raise HTTPException(
            status_code=503,
            detail=state.load_error or "Snapshots are still loading.",
        )
    return state.store


def _routing() -> RoutingService:
    _store()
    assert state.routing is not None
    return state.routing


def _check_step(store: SnapshotStore, step: int) -> None:
    if not 0 <= step < store.steps:
        raise HTTPException(404, f"Step {step} does not exist. Choose 0–{store.steps - 1}.")


def _clean(value: Any) -> Any:
    """Make NaN/inf JSON-safe."""
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, dict):
        return {k: _clean(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_clean(v) for v in value]
    return value


# ---------------------------------------------------------------------- meta
@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "ok": state.store is not None,
        "error": state.load_error,
        "load_seconds": state.load_seconds,
        "missing_inputs": project.missing_inputs(),
        "model_present": project.GNN_MODEL_PATH.exists(),
        "python": platform.python_version(),
    }


def _tle_epochs() -> dict[str, Any] | None:
    """Epoch range of the TLE file Member 1 propagates (read-only)."""
    if not project.TLE_PATH.exists():
        return None
    from datetime import datetime, timedelta, timezone

    epochs = []
    with project.TLE_PATH.open(encoding="utf-8", errors="replace") as f:
        for line in f:
            if line.startswith("1 ") and len(line) >= 32:
                try:
                    yy, doy = int(line[18:20]), float(line[20:32])
                except ValueError:
                    continue
                year = 2000 + yy if yy < 57 else 1900 + yy
                epochs.append(datetime(year, 1, 1, tzinfo=timezone.utc) + timedelta(days=doy - 1))
    if not epochs:
        return None
    epochs.sort()
    return {
        "file": str(project.TLE_PATH.relative_to(project.ROOT)),
        "records": len(epochs),
        "earliest": epochs[0].isoformat(),
        "latest": epochs[-1].isoformat(),
    }


def _simulation_config() -> dict[str, Any] | None:
    """Defaults of Member 3's OrbitNetSimulation, read from its signature."""
    try:
        import inspect
        from simulation import OrbitNetSimulation  # Member 3

        params = inspect.signature(OrbitNetSimulation.__init__).parameters
        return {
            name: params[name].default
            for name in ("step_seconds", "steps", "initial_energy", "communication_cost")
            if name in params and isinstance(params[name].default, (int, float))
        }
    except Exception as exc:  # torch missing, etc.
        return {"error": f"{type(exc).__name__}: {exc}"}


@app.get("/api/meta")
def meta() -> dict[str, Any]:
    store = _store()
    frames = []
    for f in store.frames:
        row = f.csv_row or {}
        frames.append({
            "step": f.step,
            "timestamp": f.timestamp,
            "sun_direction": f.sun_direction,
            "itrs_to_gcrs": f.itrs_to_gcrs,
            "gnn_route": f.gnn_route,
            "dijkstra_route": f.dijkstra_route,
            # Route satellites whose saved altitude is implausible (< 100 km or > 2,000 km).
            "gnn_implausible": f.gnn_implausible,
            "dijkstra_implausible": f.dijkstra_implausible,
            "sampled_links": f.sampled_edge_count,
            "eclipsed": f.eclipsed_count,
            "sunlit": store.count - f.eclipsed_count,
            "implausible": f.implausible_count,
            "full_graph_nodes": row.get("nodes"),
            "full_graph_edges": row.get("edges"),
            "source": row.get("source"),
            "target": row.get("target"),
            "gnn_distance_km": row.get("gnn_distance_km"),
            "dijkstra_distance_km": row.get("dijkstra_distance_km"),
            "gnn_hops": row.get("gnn_hops"),
            "dijkstra_hops": row.get("dijkstra_hops"),
            "gnn_eclipsed": row.get("gnn_eclipsed"),
            "dijkstra_eclipsed": row.get("dijkstra_eclipsed"),
            "route_changed": row.get("route_changed"),
            "gnn_compute_ms": row.get("gnn_compute_ms"),
            "path_available": row.get("path_available"),
        })

    implausible_any = (~store.plausible).any(axis=0)
    return _clean({
        "satellites": store.count,
        "steps": store.steps,
        "step_seconds": store.step_seconds,
        "start": store.timestamps[0],
        "end": store.timestamps[-1],
        "frame": "GCRS (Earth-centred inertial), km — Skyfield satellite.at(t).position.km",
        "earth_radius_km": store.earth_radius_km,
        "link_distance_km": store.link_distance_km,
        "plausible_altitude_km": [PLAUSIBLE_MIN_ALT_KM, PLAUSIBLE_MAX_ALT_KM],
        "implausible_satellites_any_step": int(implausible_any.sum()),
        "frames": frames,
        "snapshot_file": str(project.SNAPSHOTS_PATH.relative_to(project.ROOT)),
        "load_seconds": state.load_seconds,
        "tle": _tle_epochs(),
        "simulation_defaults": _simulation_config(),
    })


@app.get("/api/satellites")
def satellites() -> dict[str, Any]:
    store = _store()
    return {
        "ids": store.ids,
        # 1 if the propagated position is implausible at any step.
        "implausible": (~store.plausible).any(axis=0).astype(int).tolist(),
    }


# -------------------------------------------------------------- binary data
def _binary(key: str, build) -> Response:
    data = state.binary_cache.get(key)
    if data is None:
        data = build()
        state.binary_cache[key] = data
    return Response(
        content=data,
        media_type="application/octet-stream",
        headers={"Cache-Control": "no-cache"},
    )


@app.get("/api/snapshots/positions.bin")
def positions_bin() -> Response:
    """Float32 [steps × satellites × 3], km, GCRS, satellite order of /api/satellites."""
    store = _store()
    return _binary("positions", lambda: store.positions_km.astype("<f4").tobytes())


@app.get("/api/snapshots/eclipse.bin")
def eclipse_bin() -> Response:
    """Uint8 [steps × satellites], 1 = eclipsed (Member 1's cylindrical model)."""
    store = _store()
    return _binary("eclipse", lambda: store.eclipsed.astype("<u1").tobytes())


@app.get("/api/snapshots/energy.bin")
def energy_bin() -> Response:
    """Float32 [steps × satellites], saved energy level (0–100)."""
    store = _store()
    return _binary("energy", lambda: store.energy.astype("<f4").tobytes())


@app.get("/api/snapshots/links.bin")
def links_bin() -> Response:
    """Saved link sample per step.

    Layout: uint32 count T, then T+1 uint32 offsets (in pairs), then uint32
    pairs (a, b) of satellite indices. These are the links Member 3 stored in
    each snapshot: every 100th edge of the full graph plus the GNN route edges.
    """
    store = _store()

    def build() -> bytes:
        offsets = [0]
        for e in store.sampled_edges:
            offsets.append(offsets[-1] + len(e))
        head = struct.pack("<I", store.steps) + np.asarray(offsets, dtype="<u4").tobytes()
        body = b"".join(e.astype("<u4").tobytes() for e in store.sampled_edges)
        return head + body

    return _binary("links", build)


# --------------------------------------------------------------- satellites
@app.get("/api/satellites/{sat_id}")
def satellite(sat_id: str, step: int = Query(0, ge=0)) -> dict[str, Any]:
    store = _store()
    _check_step(store, step)
    index = store.index_of.get(sat_id)
    if index is None:
        raise HTTPException(404, f"Unknown satellite ID: {sat_id!r}.")

    pos = store.positions_km[step, index]
    radius = float(store.radius_km[step, index])
    frame = store.frames[step]

    # Geocentric latitude/longitude (spherical) from the Earth-fixed vector.
    itrs_to_gcrs = np.asarray(frame.itrs_to_gcrs)
    r_itrs = itrs_to_gcrs.T @ pos
    lat = math.degrees(math.asin(max(-1.0, min(1.0, r_itrs[2] / np.linalg.norm(r_itrs)))))
    lon = math.degrees(math.atan2(r_itrs[1], r_itrs[0]))

    G = state.routing.prepared_graph(step) if state.routing else None
    if G is not None and sat_id in G:
        neighbours = neighbours_from_graph(G, store, sat_id)
        neighbour_source = "full Member 1 graph rebuilt for this step"
    else:
        neighbours = neighbours_from_link_rule(store, step, index)
        neighbour_source = (
            "Member 1 link rule (network_builder.check_los within "
            f"{store.link_distance_km:.0f} km) applied to the saved positions"
        )

    on_routes = []
    if frame.gnn_route and index in frame.gnn_route:
        on_routes.append({"route": "gnn", "hop": frame.gnn_route.index(index)})
    if frame.dijkstra_route and index in frame.dijkstra_route:
        on_routes.append({"route": "dijkstra", "hop": frame.dijkstra_route.index(index)})

    eclipsed_neighbours = sum(1 for j, _ in neighbours if store.eclipsed[step, j])
    return _clean({
        "id": sat_id,
        "index": index,
        "step": step,
        "timestamp": frame.timestamp,
        "position_km": [float(c) for c in pos],
        "radius_km": radius,
        "altitude_km": radius - store.earth_radius_km,
        "geocentric_lat_deg": lat,
        "geocentric_lon_deg": lon,
        "eclipsed": bool(store.eclipsed[step, index]),
        "energy": float(store.energy[step, index]),
        "plausible": bool(store.plausible[step, index]),
        "neighbour_count": len(neighbours),
        "eclipsed_neighbours": eclipsed_neighbours,
        "neighbour_source": neighbour_source,
        "neighbours": [
            {"index": j, "id": store.ids[j], "distance_km": d,
             "eclipsed": bool(store.eclipsed[step, j])}
            for j, d in neighbours
        ],
        "on_saved_routes": on_routes,
    })


# ------------------------------------------------------------------ routing
class RouteRequest(BaseModel):
    step: int = Field(..., ge=0)
    source: str
    target: str
    algorithms: list[str] = Field(default_factory=lambda: ["gnn", "dijkstra"])


@app.get("/api/routing/status")
def routing_status() -> dict[str, Any]:
    return _clean(_routing().status())


@app.get("/api/routing/algorithms")
def routing_algorithms() -> dict[str, Any]:
    return ALGORITHMS


@app.post("/api/routes")
def create_route(req: RouteRequest) -> dict[str, Any]:
    try:
        job = _routing().submit(req.step, req.source.strip(), req.target.strip(), req.algorithms)
    except RoutingError as exc:
        raise HTTPException(400, str(exc)) from exc
    return job.public()


@app.get("/api/routes/{job_id}")
def route_job(job_id: str) -> dict[str, Any]:
    job = _routing().job(job_id)
    if job is None:
        raise HTTPException(404, f"No routing job {job_id!r}. It may have expired.")
    return _clean(job.public())


# ------------------------------------------------------------------ results
@app.get("/api/results/simulation")
def results_simulation() -> dict[str, Any]:
    return _clean(results.simulation_results())


@app.get("/api/results/gnn-evaluation")
def results_gnn() -> dict[str, Any]:
    return _clean(results.gnn_evaluation())


@app.get("/api/results/scenarios")
def results_scenarios() -> dict[str, Any]:
    return _clean(results.scenario_results())


@app.get("/api/results/files/{name}")
def results_file(name: str):
    path = results.DOWNLOADABLE.get(name)
    if path is None or not path.exists():
        raise HTTPException(404, f"No result file named {name!r}.")
    return FileResponse(path, filename=name)
