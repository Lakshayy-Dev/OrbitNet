import os
import sys


def calculate_edge_cost(
    G,
    source,
    target,
    alpha=0.3,
    beta=0.2
):
    """
    Calculate energy-aware routing cost for one satellite link.
    """

    # Distance cost
    distance = G.edges[source, target]["distance"]
    distance_cost = distance / 2000.0

    # Energy penalty
    source_energy = G.nodes[source]["energy"]
    target_energy = G.nodes[target]["energy"]

    average_energy = (source_energy + target_energy) / 2.0

    energy_penalty = 1.0 - (average_energy / 100.0)

    # Eclipse penalty
    source_eclipse = bool(G.nodes[source]["eclipsed"])
    target_eclipse = bool(G.nodes[target]["eclipsed"])

    eclipse_penalty = 0.0

    if source_eclipse:
        eclipse_penalty += 0.5

    if target_eclipse:
        eclipse_penalty += 0.5

    # Final cost
    cost = (
        distance_cost
        + alpha * energy_penalty
        + beta * eclipse_penalty
    )

    return cost


def add_routing_costs(G, alpha=0.3, beta=0.2):
    """
    Calculate routing cost for every edge.
    """

    for source, target in G.edges:

        cost = calculate_edge_cost(
            G,
            source,
            target,
            alpha,
            beta
        )

        G.edges[source, target]["routing_cost"] = cost

    return G


# ============================================================
# TEST
# ============================================================

if __name__ == "__main__":

    # Go to project root
    os.chdir(
        os.path.dirname(
            os.path.dirname(
                os.path.abspath(__file__)
            )
        )
    )

    # Add Member 1 folder
    sys.path.insert(
        0,
        r".\member_1(Lakshay)"
    )

    from orbitnet_interface import get_network
    from energy_model import initialize_energy

    print("Getting NetworkX graph...")

    G, states = get_network()

    print("Network received!")
    print("Satellites:", G.number_of_nodes())
    print("Edges:", G.number_of_edges())

    # Initialize satellite energy
    G = initialize_energy(G)

    # --------------------------------------------------------
    # Test one edge
    # --------------------------------------------------------

    source, target = list(G.edges)[0]

    cost = calculate_edge_cost(
        G,
        source,
        target
    )

    print("\nTest link:")
    print("Source:", source)
    print("Target:", target)

    print(
        "Distance:",
        G.edges[source, target]["distance"],
        "km"
    )

    print(
        "Source energy:",
        G.nodes[source]["energy"]
    )

    print(
        "Target energy:",
        G.nodes[target]["energy"]
    )

    print(
        "Source eclipsed:",
        G.nodes[source]["eclipsed"]
    )

    print(
        "Target eclipsed:",
        G.nodes[target]["eclipsed"]
    )

    print("Routing cost:", cost)

    # --------------------------------------------------------
    # Calculate cost for ALL edges
    # --------------------------------------------------------

    print("\nCalculating routing costs for all edges...")

    G = add_routing_costs(G)

    # Check first edge
    source, target = list(G.edges)[0]

    print(
        "First edge routing cost:",
        G.edges[source, target]["routing_cost"]
    )

    print("\nRouting costs successfully added!")