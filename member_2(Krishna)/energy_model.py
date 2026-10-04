def initialize_energy(G, initial_energy=100.0):
    """
    Assign an initial energy level to every satellite.

    Energy range:
    0 = empty
    100 = full
    """

    for node in G.nodes:
        G.nodes[node]["energy"] = initial_energy

    return G


def update_energy(G, sunlight_gain=2.0, eclipse_loss=1.0):
    """
    Update satellite energy according to eclipse state.

    eclipsed = False → sunlight → recharge
    eclipsed = True  → eclipse → energy consumption
    """

    for node in G.nodes:

        eclipsed = G.nodes[node]["eclipsed"]
        energy = G.nodes[node]["energy"]

        if eclipsed == False:
            energy += sunlight_gain
        else:
            energy -= eclipse_loss

        # Keep energy between 0 and 100
        energy = max(0.0, min(100.0, energy))

        G.nodes[node]["energy"] = energy

    return G


def consume_communication_energy(G, route, communication_cost=0.5):
    """
    Reduce energy of satellites used for communication.

    route = list of satellite IDs forming a path.
    """

    for node in route:

        if node in G.nodes:

            energy = G.nodes[node]["energy"]

            energy -= communication_cost

            # Energy cannot go below 0
            energy = max(0.0, energy)

            G.nodes[node]["energy"] = energy

    return G


# ============================================================
# TEST
# ============================================================

if __name__ == "__main__":

    import os
    import sys

    # Go to project root
    os.chdir(
        os.path.dirname(
            os.path.dirname(
                os.path.abspath(__file__)
            )
        )
    )

    # Add Member 1 folder
    sys.path.insert(0, r".\member_1(Lakshay)")

    from orbitnet_interface import get_network

    print("Getting NetworkX graph...")

    G, states = get_network()

    print("Network received!")
    print("Satellites:", G.number_of_nodes())

    # Initialize energy
    G = initialize_energy(G)

    # --------------------------------------------------------
    # Find eclipse satellite
    # --------------------------------------------------------

    eclipse_node = None

    for node in G.nodes:

        if G.nodes[node]["eclipsed"]:
            eclipse_node = node
            break

    if eclipse_node is not None:

        print("\nEclipse satellite:")
        print("ID:", eclipse_node)
        print("Eclipse:", G.nodes[eclipse_node]["eclipsed"])
        print("Initial energy:",
              G.nodes[eclipse_node]["energy"])

        # Update energy
        G = update_energy(G)

        print("Energy after 1 time step:",
              G.nodes[eclipse_node]["energy"])

    # --------------------------------------------------------
    # Find sunlight satellite
    # --------------------------------------------------------

    sunlight_node = None

    for node in G.nodes:

        if not G.nodes[node]["eclipsed"]:
            sunlight_node = node
            break

    if sunlight_node is not None:

        print("\nSunlight satellite:")
        print("ID:", sunlight_node)
        print("Eclipse:", G.nodes[sunlight_node]["eclipsed"])
        print("Initial energy:",
              G.nodes[sunlight_node]["energy"])

        # Update energy
        G = update_energy(G)

        print("Energy after 1 time step:",
              G.nodes[sunlight_node]["energy"])

        # Communication test
        test_route = [sunlight_node]

        print("\nCommunication energy test:")
        print("Energy before communication:",
              G.nodes[sunlight_node]["energy"])

        G = consume_communication_energy(
            G,
            test_route,
            communication_cost=0.5
        )

        print("Energy after communication:",
              G.nodes[sunlight_node]["energy"])