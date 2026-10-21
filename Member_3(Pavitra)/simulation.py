
"""OrbitNet Member 3 dynamic simulation engine."""

from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from pathlib import Path
import sys

import networkx as nx

# Project paths
PROJECT_ROOT = Path(__file__).resolve().parent.parent
M1 = PROJECT_ROOT / "member_1(Lakshay)"
M2 = PROJECT_ROOT / "Member_2(Krishna)"

for directory in (M1, M2):
    if str(directory) not in sys.path:
        sys.path.insert(0, str(directory))

from router_adapter import GNNRouter, dijkstra_route, DEFAULT_MODEL_PATH
from orbitnet_interface import get_network
from eclipse_detector import ts
from energy_model import update_energy, consume_communication_energy


@dataclass
class StepResult:
    step: int
    timestamp_utc: str
    source: str
    target: str
    nodes: int
    edges: int
    eclipsed_count: int
    gnn_route: Optional[List[str]]
    dijkstra_route: Optional[List[str]]
    gnn_distance_km: Optional[float]
    dijkstra_distance_km: Optional[float]
    gnn_hops: Optional[int]
    dijkstra_hops: Optional[int]
    gnn_eclipsed: Optional[int]
    dijkstra_eclipsed: Optional[int]
    gnn_cost: Optional[float]
    route_changed: bool
    gnn_compute_ms: Optional[float]
    path_available: bool


class OrbitNetSimulation:
    def __init__(
        self,
        source: Optional[str] = None,
        target: Optional[str] = None,
        step_seconds: float = 30.0,
        steps: int = 20,
        initial_energy: float = 100.0,
        communication_cost: float = 0.5,
        model_path=DEFAULT_MODEL_PATH,
    ):
        self.source = source
        self.target = target
        self.step_seconds = step_seconds
        self.steps = steps
        self.initial_energy = initial_energy
        self.communication_cost = communication_cost

        self.router = GNNRouter(model_path)
        self.energy = {}
        self.previous_route = None
        self.results: List[StepResult] = []
        self.snapshots = []

    def _timestamp(self, start, step):
        return start + timedelta(seconds=step * self.step_seconds)

    def _choose_endpoints(self, G):
        nodes = list(G.nodes())

        if len(nodes) < 2:
            raise RuntimeError(
                "Current network has fewer than two satellites."
            )

        # Keep the requested endpoints when they exist.
        if (
            self.source in G
            and self.target in G
            and self.source != self.target
        ):
            return self.source, self.target

        # Deterministic fallback: choose endpoints far apart
        # in the network, measured by hop count.
        source = nodes[0]
        lengths = nx.single_source_shortest_path_length(G, source)
        candidates = [
            (hops, node)
            for node, hops in lengths.items()
            if node != source
        ]

        target = max(candidates)[1] if candidates else nodes[-1]

        self.source = source
        self.target = target

        return source, target

    def _apply_energy_state(self, G):
        # Restore energy from the previous simulation step.
        for node in G.nodes:
            if node not in self.energy:
                self.energy[node] = self.initial_energy

            G.nodes[node]["energy"] = self.energy[node]

        # Sunlight charges satellites; eclipses drain energy.
        G = update_energy(
            G,
            sunlight_gain=2.0 * (self.step_seconds / 60.0),
            eclipse_loss=1.0 * (self.step_seconds / 60.0),
        )

        self.energy = {
            node: float(G.nodes[node]["energy"])
            for node in G.nodes
        }

        return G

    def _make_lightweight_snapshot_graph(self, G, gnn_path):
        """Keep all satellite data but sample communication links.

        Every 100th graph edge is retained for visualization.
        All edges belonging to the GNN route are also retained.
        The original graph used for routing is not modified.
        """
        snapshot_graph = nx.Graph()

        # Preserve all nodes and their attributes, including coordinates,
        # eclipse state and energy.
        for node, data in G.nodes(data=True):
            snapshot_graph.add_node(node, **data)

        route_edges = set()

        if gnn_path:
            route_edges = {
                frozenset((u, v))
                for u, v in zip(gnn_path[:-1], gnn_path[1:])
            }

        # Sample links to reduce memory used by saved snapshots.
        for index, (u, v, data) in enumerate(G.edges(data=True)):
            if (
                index % 100 == 0
                or frozenset((u, v)) in route_edges
            ):
                snapshot_graph.add_edge(u, v, **data)

        return snapshot_graph

    def run(self, start_datetime=None):
        if start_datetime is None:
            start_datetime = datetime.now(timezone.utc)

        self.results.clear()
        self.snapshots.clear()
        self.previous_route = None
        self.energy.clear()

        for step in range(self.steps):
            dt = self._timestamp(start_datetime, step)
            sky_time = ts.from_datetime(dt)

            # Rebuild the time-dependent satellite network.
            step_start = time.perf_counter()
            G, states = get_network(sky_time)

            # Carry energy levels across changing network topologies.
            G = self._apply_energy_state(G)

            source, target = self._choose_endpoints(G)

            eclipsed_count = sum(
                int(bool(G.nodes[node].get("eclipsed", False)))
                for node in G.nodes
            )

            gnn_path = None
            dijkstra_path = None
            gnn_info = {}
            dijkstra_info = {}
            available = True

            # Measure GNN routing separately from graph construction
            # and Dijkstra routing.
            gnn_start = time.perf_counter()

            try:
                gnn_path, gnn_info = self.router.route(
                    G, source, target
                )
            except (nx.NetworkXNoPath, ValueError):
                available = False

            gnn_elapsed_ms = (
                time.perf_counter() - gnn_start
            ) * 1000.0

            try:
                dijkstra_path, dijkstra_info = dijkstra_route(
                    G, source, target
                )
            except (nx.NetworkXNoPath, ValueError):
                dijkstra_path = None

            # Count a route change only if a previous successful
            # route exists and the current route differs from it.
            # The initial route selection is not a route change.
            changed = (
                self.previous_route is not None
                and gnn_path is not None
                and gnn_path != self.previous_route
            )

            # Apply communication energy consumption after routing.
            if gnn_path:
                G = consume_communication_energy(
                    G,
                    gnn_path,
                    self.communication_cost,
                )

                self.energy = {
                    node: float(G.nodes[node]["energy"])
                    for node in G.nodes
                }

            gnn_eclipsed = (
                sum(
                    int(bool(G.nodes[node].get("eclipsed", False)))
                    for node in gnn_path
                )
                if gnn_path
                else None
            )

            self.results.append(
                StepResult(
                    step=step,
                    timestamp_utc=dt.isoformat(),
                    source=source,
                    target=target,
                    nodes=G.number_of_nodes(),
                    edges=G.number_of_edges(),
                    eclipsed_count=eclipsed_count,
                    gnn_route=gnn_path,
                    dijkstra_route=dijkstra_path,
                    gnn_distance_km=gnn_info.get("distance_km"),
                    dijkstra_distance_km=dijkstra_info.get(
                        "distance_km"
                    ),
                    gnn_hops=gnn_info.get("hops"),
                    dijkstra_hops=dijkstra_info.get("hops"),
                    gnn_eclipsed=gnn_eclipsed,
                    dijkstra_eclipsed=dijkstra_info.get(
                        "eclipsed_satellites"
                    ),
                    gnn_cost=gnn_info.get("gnn_cost"),
                    route_changed=changed,
                    gnn_compute_ms=gnn_elapsed_ms,
                    path_available=available,
                )
            )

            # Store a lightweight graph for visualization instead of
            # deep-copying all 1.3 million edges at every time step.
            snapshot_graph = self._make_lightweight_snapshot_graph(
                G, gnn_path
            )

            self.snapshots.append(
                {
                    "step": step,
                    "timestamp": dt.isoformat(),
                    "graph": snapshot_graph,
                    # Current visualization and animation modules do
                    # not use the full Member 1 states object.
                    "states": None,
                    "gnn_route": (
                        list(gnn_path) if gnn_path else None
                    ),
                    "dijkstra_route": (
                        list(dijkstra_path)
                        if dijkstra_path
                        else None
                    ),
                }
            )

            # Retain the current successful route for the next step.
            # If routing fails, keep the previous successful route so
            # a later recovery can be compared against it.
            if gnn_path is not None:
                self.previous_route = list(gnn_path)

            total_step_seconds = time.perf_counter() - step_start

            print(
                f"Step {step + 1}/{self.steps} complete | "
                f"Nodes: {G.number_of_nodes()} | "
                f"Edges: {G.number_of_edges()} | "
                f"GNN time: {gnn_elapsed_ms / 1000.0:.2f} s | "
                f"Total step time: {total_step_seconds:.2f} s",
                flush=True,
            )

        return self.results
