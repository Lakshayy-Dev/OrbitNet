
"""Run lightweight controlled scenario tests for Member 3."""

import csv
import sys
from pathlib import Path

import networkx as nx

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from scenarios import get_scenarios
from router_adapter import GNNRouter, dijkstra_route, DEFAULT_MODEL_PATH


def route_distance(G, path):
    """Calculate total physical distance of a route."""
    if not path:
        return None

    return sum(
        float(G[u][v]["distance"])
        for u, v in zip(path[:-1], path[1:])
    )


def eclipsed_on_route(G, path):
    """Count eclipsed satellites on a route, including endpoints."""
    if not path:
        return None

    return sum(
        int(bool(G.nodes[node].get("eclipsed", False)))
        for node in path
    )


def eclipse_avoiding_reference(G, source, target):
    """Find a route that penalizes entering eclipsed satellites.

    This is an evaluation reference, not a change to either router.
    """
    def adjusted_weight(u, v, data):
        # Penalize an eclipsed destination node.
        penalty = (
            10000.0
            if G.nodes[v].get("eclipsed", False)
            else 0.0
        )
        return float(data["distance"]) + penalty

    return nx.shortest_path(
        G,
        source=source,
        target=target,
        weight=adjusted_weight,
    )


def main():
    scenarios = get_scenarios()
    router = GNNRouter(DEFAULT_MODEL_PATH)
    rows = []

    # Check whether the controlled topology actually changes.
    before = scenarios["topology_before"]["graph"]
    after = scenarios["topology_after"]["graph"]
    topology_changed = set(before.edges()) != set(after.edges())

    # Verify the difficult-routing scenario.
    difficult = scenarios["difficult_routing"]["graph"]
    source = scenarios["difficult_routing"]["source"]
    target = scenarios["difficult_routing"]["target"]

    shortest_path = nx.shortest_path(
        difficult,
        source=source,
        target=target,
        weight="distance",
    )

    shortest_uses_eclipse = (
        eclipsed_on_route(difficult, shortest_path) > 0
    )

    eclipse_free_paths = [
        path
        for path in nx.all_simple_paths(difficult, source, target)
        if eclipsed_on_route(difficult, path) == 0
    ]
    alternative_exists = bool(eclipse_free_paths)

    reference_path = None
    if alternative_exists:
        reference_path = eclipse_avoiding_reference(
            difficult, source, target
        )

    reference_is_eclipse_free = (
        reference_path is not None
        and eclipsed_on_route(difficult, reference_path) == 0
    )

    print("\n=== CONTROLLED SCENARIO TESTS ===")
    print(f"Topology changes between graphs: {topology_changed}")
    print(f"Shortest route uses eclipse: {shortest_uses_eclipse}")
    print(f"Eclipse-free alternative exists: {alternative_exists}")
    print(
        "Reference route avoids eclipses: "
        f"{reference_is_eclipse_free}"
    )

    for name, case in scenarios.items():
        G = case["graph"]
        source, target = case["source"], case["target"]

        d_path = None
        g_path = None

        try:
            d_path, d_info = dijkstra_route(G, source, target)
        except Exception as exc:
            d_info = {}
            print(f"{name}: Dijkstra failed: {exc}")

        try:
            g_path, g_info = router.route(G, source, target)
        except Exception as exc:
            g_info = {}
            print(f"{name}: GNN failed: {exc}")

        scenario_reference = (
            reference_path if name == "difficult_routing" else None
        )

        row = {
            "scenario": name,
            "nodes": G.number_of_nodes(),
            "edges": G.number_of_edges(),
            "eclipsed_nodes": sum(
                int(bool(data.get("eclipsed", False)))
                for _, data in G.nodes(data=True)
            ),
            "dijkstra_distance": route_distance(G, d_path),
            "dijkstra_hops": len(d_path) - 1 if d_path else None,
            "dijkstra_eclipsed": eclipsed_on_route(G, d_path),
            "gnn_distance": route_distance(G, g_path),
            "gnn_hops": len(g_path) - 1 if g_path else None,
            "gnn_eclipsed": eclipsed_on_route(G, g_path),
            "gnn_route": " -> ".join(g_path) if g_path else "",
            "dijkstra_route": " -> ".join(d_path) if d_path else "",
            "eclipse_avoiding_reference_route": (
                " -> ".join(scenario_reference)
                if scenario_reference
                else ""
            ),
            "reference_route_distance": (
                route_distance(G, scenario_reference)
                if scenario_reference
                else None
            ),
            "reference_route_eclipsed": (
                eclipsed_on_route(G, scenario_reference)
                if scenario_reference
                else None
            ),
        }

        rows.append(row)

        print(f"\n{name}")
        print(f"  Dijkstra: {row['dijkstra_route'] or 'No route'}")
        print(f"  GNN:      {row['gnn_route'] or 'No route'}")

        if scenario_reference:
            print(
                "  Eclipse-avoiding reference: "
                + " -> ".join(scenario_reference)
            )
            print(
                "  Reference eclipsed satellites: "
                f"{row['reference_route_eclipsed']}"
            )

    output = ROOT / "results" / "member3" / "scenario_results.csv"
    output.parent.mkdir(parents=True, exist_ok=True)

    if rows:
        with output.open("w", newline="", encoding="utf-8") as file:
            writer = csv.DictWriter(
                file,
                fieldnames=list(rows[0].keys()),
            )
            writer.writeheader()
            writer.writerows(rows)

    checks = {
        "topology_change_detected": topology_changed,
        "shortest_route_uses_eclipsed_node": shortest_uses_eclipse,
        "eclipse_free_alternative_exists": alternative_exists,
        "reference_route_avoids_eclipses": reference_is_eclipse_free,
    }

    print("\n=== CHECK RESULTS ===")
    for name, passed in checks.items():
        print(f"{name}: {'PASS' if passed else 'FAIL'}")

    print(f"\nCSV saved to: {output}")


if __name__ == "__main__":
    main()
