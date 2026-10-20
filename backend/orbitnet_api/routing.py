"""Run the project's real routing code for a chosen snapshot step.

Pipeline for one request (all heavy work runs in a single worker thread):

1. Rebuild the full network for the step's saved timestamp with Member 1's
   ``orbitnet_interface.get_network`` — the same call Member 3's simulation
   makes. The rebuilt positions are checked against the saved snapshot.
2. Give every satellite the energy level the simulation's router saw at that
   step (see ``pre_routing_energy``).
3. Route with the algorithms the project already implements:

   * ``gnn``       – Member 3's ``router_adapter.GNNRouter`` (Member 2's V5
                     model and checkpoint), shortest path on ``gnn_cost``.
   * ``dijkstra``  – Member 3's ``router_adapter.dijkstra_route``
                     (shortest total distance).
   * ``teacher``   – Member 2's energy-aware cost ``routing_cost.add_routing_costs``
                     with a shortest path on ``routing_cost``, exactly as the
                     "teacher" in ``evaluate_gnn_v5.py``.
   * ``eclipse_avoiding`` – Member 3's evaluation reference
                     ``scenario_tests.eclipse_avoiding_reference``.

Only one full graph is kept in memory at a time (a 1.3M-edge NetworkX graph
needs roughly 1–2 GB of RAM).
"""

from __future__ import annotations

import gc
import inspect
import threading
import time
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable

import numpy as np

from . import project
from .snapshots import SnapshotStore

ALGORITHMS = {
    "gnn": {
        "label": "GNN (V5)",
        "source": "Member 2 model via Member 3 router_adapter.GNNRouter",
        "weight": "gnn_cost",
    },
    "dijkstra": {
        "label": "Shortest distance (Dijkstra)",
        "source": "Member 3 router_adapter.dijkstra_route",
        "weight": "distance",
    },
    "teacher": {
        "label": "Energy-aware optimum (teacher)",
        "source": "Member 2 routing_cost.add_routing_costs + shortest path",
        "weight": "routing_cost",
    },
    "eclipse_avoiding": {
        "label": "Eclipse-avoiding reference",
        "source": "Member 3 scenario_tests.eclipse_avoiding_reference",
        "weight": "distance + 10,000 per eclipsed hop",
    },
}


class RoutingError(Exception):
    """A request that cannot be served, with a user-facing message."""


@dataclass
class Job:
    id: str
    step: int
    source: str
    target: str
    algorithms: list[str]
    status: str = "queued"          # queued | running | done | error
    stage: str = "Waiting for the routing worker"
    progress: float = 0.0
    created: float = field(default_factory=time.time)
    finished: float | None = None
    result: dict[str, Any] | None = None
    error: str | None = None

    def public(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "step": self.step,
            "source": self.source,
            "target": self.target,
            "algorithms": self.algorithms,
            "status": self.status,
            "stage": self.stage,
            "progress": round(self.progress, 3),
            "elapsed_s": round((self.finished or time.time()) - self.created, 2),
            "result": self.result,
            "error": self.error,
        }


@dataclass
class PreparedStep:
    step: int
    graph: Any
    rebuild_seconds: float
    position_check: dict[str, Any]
    components: int | None = None
    largest_component: int | None = None
    gnn_ready: bool = False
    gnn_seconds: float | None = None
    teacher_ready: bool = False
    teacher_seconds: float | None = None


class RoutingService:
    def __init__(self, store: SnapshotStore):
        self.store = store
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="routing")
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()
        self._prepared: PreparedStep | None = None
        self._router = None
        self._router_error: str | None = None
        self._communication_cost: float | None = None

    # ------------------------------------------------------------------ status
    def status(self) -> dict[str, Any]:
        prepared = self._prepared
        return {
            "model_path": str(project.GNN_MODEL_PATH.relative_to(project.ROOT)),
            "model_present": project.GNN_MODEL_PATH.exists(),
            "router_loaded": self._router is not None,
            "router_error": self._router_error,
            "algorithms": ALGORITHMS,
            "prepared_step": None if prepared is None else {
                "step": prepared.step,
                "nodes": prepared.graph.number_of_nodes(),
                "edges": prepared.graph.number_of_edges(),
                "rebuild_seconds": round(prepared.rebuild_seconds, 2),
                "position_check": prepared.position_check,
                "components": prepared.components,
                "largest_component": prepared.largest_component,
                "gnn_ready": prepared.gnn_ready,
                "gnn_seconds": prepared.gnn_seconds,
                "teacher_ready": prepared.teacher_ready,
            },
        }

    def prepared_graph(self, step: int):
        prepared = self._prepared
        if prepared is not None and prepared.step == step:
            return prepared.graph
        return None

    # -------------------------------------------------------------------- jobs
    def submit(self, step: int, source: str, target: str, algorithms: list[str]) -> Job:
        if not 0 <= step < self.store.steps:
            raise RoutingError(f"Step {step} does not exist. Choose 0–{self.store.steps - 1}.")
        for sat in (source, target):
            if sat not in self.store.index_of:
                raise RoutingError(f"Unknown satellite ID: {sat!r}.")
        if source == target:
            raise RoutingError("Source and destination must be different satellites.")
        unknown = [a for a in algorithms if a not in ALGORITHMS]
        if unknown:
            raise RoutingError(f"Unknown algorithm(s): {', '.join(unknown)}.")
        if not algorithms:
            raise RoutingError("Choose at least one algorithm.")

        job = Job(id=uuid.uuid4().hex[:12], step=step, source=source,
                  target=target, algorithms=list(dict.fromkeys(algorithms)))
        with self._lock:
            self._jobs[job.id] = job
            # Keep the job table small.
            if len(self._jobs) > 50:
                for old in sorted(self._jobs.values(), key=lambda j: j.created)[:10]:
                    self._jobs.pop(old.id, None)
        self._executor.submit(self._run, job)
        return job

    def job(self, job_id: str) -> Job | None:
        return self._jobs.get(job_id)

    def _run(self, job: Job) -> None:
        job.status = "running"
        try:
            job.result = self._route(job)
            job.status = "done"
            job.stage = "Done"
            job.progress = 1.0
        except RoutingError as exc:
            job.status, job.error = "error", str(exc)
        except Exception as exc:  # report, don't crash the worker
            traceback.print_exc()
            job.status = "error"
            job.error = f"{type(exc).__name__}: {exc}"
        finally:
            job.finished = time.time()

    # ----------------------------------------------------------------- helpers
    def _get_router(self):
        if self._router is not None:
            return self._router
        project.configure()
        try:
            from router_adapter import GNNRouter  # Member 3

            class CachedGNNRouter(GNNRouter):
                """GNNRouter that scores a graph's edges once, then reuses them.

                ``GNNRouter.route`` re-runs ``add_gnn_costs`` on every call,
                which takes tens of seconds on the full graph. When the same
                graph object is routed again, the costs already stored on its
                edges are reused. All model logic stays in Member 3's class.
                """

                _costed_graph_id: int | None = None

                def add_gnn_costs(self, G):
                    if self._costed_graph_id == id(G):
                        return G
                    G = super().add_gnn_costs(G)
                    self._costed_graph_id = id(G)
                    return G

            self._router = CachedGNNRouter(str(project.GNN_MODEL_PATH))
            self._router_error = None
        except Exception as exc:
            self._router_error = f"{type(exc).__name__}: {exc}"
            raise RoutingError(
                "The GNN model could not be loaded "
                f"({self._router_error}). Check that PyTorch, PyTorch Geometric "
                f"and {project.GNN_MODEL_PATH.name} are available."
            ) from exc
        return self._router

    def communication_cost(self) -> float:
        """The per-satellite communication cost the simulation used."""
        if self._communication_cost is None:
            project.configure()
            from simulation import OrbitNetSimulation  # Member 3
            default = inspect.signature(OrbitNetSimulation.__init__).parameters[
                "communication_cost"
            ].default
            self._communication_cost = float(default)
        return self._communication_cost

    def pre_routing_energy(self, step: int) -> np.ndarray:
        """Energy each satellite had when the simulation routed this step.

        The snapshot saves energy *after* the step's communication cost was
        charged to the satellites on that step's GNN route (Member 2's
        ``consume_communication_energy``). Adding that cost back to exactly
        those satellites recovers the energy the router saw. This is exact
        unless a satellite had been drained to zero (not the case in the
        saved run: the minimum saved energy is far above zero).
        """
        energy = self.store.energy[step].copy()
        route = self.store.frames[step].gnn_route or []
        cost = self.communication_cost()
        for i in route:
            energy[i] = min(100.0, energy[i] + cost)
        return energy

    def _prepare(self, job: Job) -> PreparedStep:
        if self._prepared is not None and self._prepared.step == job.step:
            return self._prepared

        # Free the previous graph before building a new one.
        self._prepared = None
        gc.collect()

        project.configure()
        from orbitnet_interface import get_network  # Member 1
        from eclipse_detector import ts  # Member 1

        job.stage = (
            f"Rebuilding the full network for step {job.step} with Member 1's "
            "get_network (typically 20–60 s)"
        )
        job.progress = 0.05
        t0 = time.perf_counter()
        when = datetime.fromisoformat(self.store.timestamps[job.step])
        G, _states = get_network(ts.from_datetime(when))
        rebuild_seconds = time.perf_counter() - t0

        # Check the rebuild against the saved snapshot positions.
        diffs = []
        missing = 0
        for sat_id, data in G.nodes(data=True):
            i = self.store.index_of.get(sat_id)
            if i is None:
                missing += 1
                continue
            saved = self.store.positions_km[job.step, i]
            diffs.append(np.linalg.norm(np.array([data["x"], data["y"], data["z"]]) - saved))
        max_diff = float(max(diffs)) if diffs else None
        position_check = {
            "nodes_rebuilt": G.number_of_nodes(),
            "nodes_in_snapshot": self.store.count,
            "nodes_not_in_snapshot": missing,
            "max_position_difference_km": max_diff,
            "matches_snapshot": (
                missing == 0
                and G.number_of_nodes() == self.store.count
                and max_diff is not None
                and max_diff < 1e-6
            ),
        }

        energy = self.pre_routing_energy(job.step)
        for sat_id in G.nodes:
            i = self.store.index_of.get(sat_id)
            G.nodes[sat_id]["energy"] = float(energy[i]) if i is not None else 100.0

        job.stage = "Counting connected components"
        job.progress = 0.35
        import networkx as nx
        components = list(nx.connected_components(G))
        prepared = PreparedStep(
            step=job.step,
            graph=G,
            rebuild_seconds=rebuild_seconds,
            position_check=position_check,
            components=len(components),
            largest_component=max((len(c) for c in components), default=0),
        )
        self._prepared = prepared
        return prepared

    def _ensure_gnn(self, job: Job, prepared: PreparedStep):
        router = self._get_router()
        if not prepared.gnn_ready:
            job.stage = (
                "Scoring all links with the V5 GNN "
                "(Member 3's GNNRouter; about 40 s per step in the saved run)"
            )
            job.progress = 0.45
            t0 = time.perf_counter()
            router.add_gnn_costs(prepared.graph)
            prepared.gnn_seconds = round(time.perf_counter() - t0, 2)
            prepared.gnn_ready = True
        return router

    def _ensure_teacher(self, job: Job, prepared: PreparedStep):
        if not prepared.teacher_ready:
            project.configure()
            from routing_cost import add_routing_costs  # Member 2
            job.stage = "Computing Member 2's energy-aware link costs"
            t0 = time.perf_counter()
            add_routing_costs(prepared.graph)
            prepared.teacher_seconds = round(time.perf_counter() - t0, 2)
            prepared.teacher_ready = True

    def _route(self, job: Job) -> dict[str, Any]:
        import networkx as nx

        prepared = self._prepare(job)
        G = prepared.graph

        for sat in (job.source, job.target):
            if sat not in G:
                raise RoutingError(
                    f"{sat} is not part of the network at step {job.step}."
                )

        # Energy-aware cost is reported for every route, so compute it once.
        self._ensure_teacher(job, prepared)

        results: dict[str, Any] = {}
        n_algos = len(job.algorithms)
        for n, algo in enumerate(job.algorithms):
            job.progress = 0.5 + 0.5 * n / n_algos
            meta = ALGORITHMS[algo]
            try:
                if algo == "gnn":
                    router = self._ensure_gnn(job, prepared)
                    job.stage = "Finding the GNN route"
                    t0 = time.perf_counter()
                    path, info = router.route(G, job.source, job.target)
                    elapsed = time.perf_counter() - t0
                elif algo == "dijkstra":
                    from router_adapter import dijkstra_route  # Member 3
                    job.stage = "Finding the shortest-distance route"
                    t0 = time.perf_counter()
                    path, info = dijkstra_route(G, job.source, job.target)
                    elapsed = time.perf_counter() - t0
                elif algo == "teacher":
                    job.stage = "Finding the energy-aware optimum route"
                    t0 = time.perf_counter()
                    # Identical to the teacher route in evaluate_gnn_v5.py.
                    path = nx.shortest_path(
                        G, source=job.source, target=job.target,
                        weight="routing_cost",
                    )
                    elapsed = time.perf_counter() - t0
                    info = {}
                elif algo == "eclipse_avoiding":
                    from scenario_tests import eclipse_avoiding_reference  # Member 3
                    job.stage = "Finding the eclipse-avoiding reference route"
                    t0 = time.perf_counter()
                    path = eclipse_avoiding_reference(G, job.source, job.target)
                    elapsed = time.perf_counter() - t0
                    info = {}
                else:  # pragma: no cover - validated in submit()
                    raise RoutingError(f"Unknown algorithm {algo}")
            except (nx.NetworkXNoPath, ValueError) as exc:
                results[algo] = {
                    "algorithm": algo,
                    **meta,
                    "available": False,
                    "message": (
                        f"No route exists between {job.source} and {job.target} "
                        f"at step {job.step}."
                        if isinstance(exc, nx.NetworkXNoPath) or "No " in str(exc)
                        else str(exc)
                    ),
                }
                continue

            results[algo] = {
                "algorithm": algo,
                **meta,
                "available": True,
                **self._describe_route(G, path, prepared),
                "route_seconds": round(elapsed, 4),
                "adapter_info": {
                    k: v for k, v in info.items()
                    if isinstance(v, (int, float, str, bool))
                },
            }

        saved = self.store.frames[job.step]
        saved_pair = None
        if saved.csv_row:
            saved_pair = {
                "source": saved.csv_row.get("source"),
                "target": saved.csv_row.get("target"),
            }

        return {
            "step": job.step,
            "timestamp": self.store.timestamps[job.step],
            "source": job.source,
            "target": job.target,
            "routes": results,
            "network": {
                "nodes": G.number_of_nodes(),
                "edges": G.number_of_edges(),
                "components": prepared.components,
                "largest_component": prepared.largest_component,
                "rebuild_seconds": round(prepared.rebuild_seconds, 2),
                "gnn_scoring_seconds": prepared.gnn_seconds,
                "teacher_cost_seconds": prepared.teacher_seconds,
                "position_check": prepared.position_check,
            },
            "energy_state": (
                "Energy each satellite had when the saved simulation routed "
                "this step (saved post-routing energy with that step's "
                f"communication cost of {self.communication_cost()} restored "
                "on its GNN-route satellites)."
            ),
            "saved_simulation_pair": saved_pair,
        }

    def _describe_route(self, G, path: list[str], prepared: PreparedStep) -> dict[str, Any]:
        hops = len(path) - 1
        distance = 0.0
        routing_cost = 0.0
        gnn_cost = 0.0 if prepared.gnn_ready else None
        links = []
        for u, v in zip(path[:-1], path[1:]):
            edge = G[u][v]
            distance += float(edge["distance"])
            if "routing_cost" in edge:
                routing_cost += float(edge["routing_cost"])
            if gnn_cost is not None and "gnn_cost" in edge:
                gnn_cost += float(edge["gnn_cost"])
            links.append({
                "from": u,
                "to": v,
                "distance_km": float(edge["distance"]),
                "routing_cost": float(edge.get("routing_cost")) if "routing_cost" in edge else None,
                "gnn_cost": float(edge.get("gnn_cost")) if "gnn_cost" in edge else None,
            })
        nodes = []
        for sat in path:
            data = G.nodes[sat]
            i = self.store.index_of.get(sat)
            nodes.append({
                "id": sat,
                "index": i,
                "eclipsed": bool(data.get("eclipsed", False)),
                "energy": float(data.get("energy", float("nan"))),
                "altitude_km": float(data.get("distance_from_earth", float("nan")))
                - self.store.earth_radius_km,
                "plausible": bool(self.store.plausible[prepared.step, i]) if i is not None else None,
            })
        eclipsed = sum(1 for n in nodes if n["eclipsed"])
        cost = self.communication_cost()
        return {
            "path": path,
            "indices": [n["index"] for n in nodes],
            "nodes": nodes,
            "links": links,
            "hops": hops,
            "distance_km": distance,
            "eclipsed_satellites": eclipsed,
            "energy_aware_cost": routing_cost if prepared.teacher_ready else None,
            "gnn_cost": gnn_cost,
            "min_energy_on_route": min((n["energy"] for n in nodes), default=None),
            "implausible_satellites": [n["id"] for n in nodes if n["plausible"] is False],
            "communication_energy": cost * len(path),
        }
