
"""Controlled network scenarios for Member 3 evaluation.

These are synthetic test graphs, not real orbital simulation outputs.
"""

import networkx as nx


def make_network(edges, eclipsed_nodes=()):
    """Build a graph with the attributes expected by router_adapter."""
    G = nx.Graph()
    eclipsed_nodes = set(eclipsed_nodes)

    # Simple synthetic coordinates for testing only.
    positions = {
        "S": (7000.0, 0.0, 0.0),
        "A": (7100.0, 300.0, 0.0),
        "B": (7200.0, 600.0, 0.0),
        "E": (7100.0, -300.0, 0.0),
        "T": (7300.0, 0.0, 0.0),
        "C": (7200.0, 900.0, 0.0),
    }

    for node, (x, y, z) in positions.items():
        G.add_node(
            node,
            x=x,
            y=y,
            z=z,
            distance_from_earth=7000.0,
            eclipsed=node in eclipsed_nodes,
            energy=100.0,
        )

    for u, v, distance in edges:
        G.add_edge(u, v, distance=float(distance))

    return G


def get_scenarios():
    """Return named scenarios and their routing endpoints."""

    normal = make_network(
        [
            ("S", "A", 800),
            ("A", "B", 800),
            ("B", "T", 800),
            ("S", "E", 900),
            ("E", "T", 900),
            ("B", "C", 500),
            ("C", "T", 700),
        ],
        eclipsed_nodes=(),
    )

    heavy_eclipse = make_network(
        [
            ("S", "A", 800),
            ("A", "B", 800),
            ("B", "T", 800),
            ("S", "E", 900),
            ("E", "T", 900),
            ("B", "C", 500),
            ("C", "T", 700),
        ],
        eclipsed_nodes=("A", "B", "C", "E"),
    )

    # Two successive graphs represent a topology change.
    topology_before = make_network(
        [
            ("S", "A", 800),
            ("A", "B", 800),
            ("B", "T", 800),
        ]
    )

    topology_after = make_network(
        [
            ("S", "E", 900),
            ("E", "T", 900),
            ("S", "A", 800),
            ("A", "B", 800),
        ]
    )

    difficult_routing = make_network(
        [
            ("S", "E", 500),
            ("E", "T", 500),
            ("S", "A", 700),
            ("A", "B", 700),
            ("B", "T", 700),
        ],
        eclipsed_nodes=("E",),
    )

    return {
        "normal": {
            "graph": normal, "source": "S", "target": "T"
        },
        "heavy_eclipse": {
            "graph": heavy_eclipse, "source": "S", "target": "T"
        },
        "topology_before": {
            "graph": topology_before, "source": "S", "target": "T"
        },
        "topology_after": {
            "graph": topology_after, "source": "S", "target": "T"
        },
        "difficult_routing": {
            "graph": difficult_routing, "source": "S", "target": "T"
        },
    }
