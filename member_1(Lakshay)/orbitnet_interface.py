import networkx as nx

from network_builder import build_network_at_time
from eclipse_detector import ts


# ==========================================
# ORBITNET NETWORK INTERFACE
# ==========================================
def get_network(timestamp=None):

    """
    Generate the OrbitNet LEO network.

    Parameters
    ----------
    timestamp : Skyfield Time, optional
        Simulation timestamp.
        If None, current time is used.

    Returns
    -------
    G : NetworkX Graph
        Satellite communication network.

    states : list
        Physical state of every satellite.
    """

    # Use current time if no timestamp supplied
    if timestamp is None:
        timestamp = ts.now()

    # Build network
    G, states = build_network_at_time(
        timestamp
    )

    return G, states


# ==========================================
# Test Interface
# ==========================================
if __name__ == "__main__":

    print(
        "\n========== ORBITNET INTERFACE TEST =========="
    )

    # Generate network
    G, states = get_network()

    # --------------------------------------
    # Basic information
    # --------------------------------------
    print(
        "\nTimestamp:",
        ts.now().utc_strftime()
    )

    print(
        "Satellite states:",
        len(states)
    )

    print(
        "Network nodes:",
        G.number_of_nodes()
    )

    print(
        "Network edges:",
        G.number_of_edges()
    )

    print(
        "Connected components:",
        nx.number_connected_components(G)
    )

    # --------------------------------------
    # Example node
    # --------------------------------------
    if len(states) > 0:

        satellite_id = states[0]["id"]

        print(
            "\nExample satellite:",
            satellite_id
        )

        print(
            "Node data:"
        )

        print(
            G.nodes[satellite_id]
        )

    print(
        "\nOrbitNet interface test successful! ✅"
    )