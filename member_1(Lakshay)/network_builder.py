import networkx as nx
import numpy as np
from scipy.spatial import cKDTree

from eclipse_detector import get_satellite_states, ts


# ==========================================
# Configuration
# ==========================================
MAX_LINK_DISTANCE = 2000.0   # km
EARTH_RADIUS = 6378.137      # km


# ==========================================
# Function: Check Line of Sight
# ==========================================
def check_los(position_a, position_b):

    # Vector from satellite A to satellite B
    AB = position_b - position_a

    denominator = np.dot(AB, AB)

    # Safety check
    if denominator == 0:
        return False

    # Projection of Earth center onto
    # the satellite-to-satellite line
    projection = -np.dot(
        position_a,
        AB
    ) / denominator

    # Keep projection inside line segment
    projection = np.clip(
        projection,
        0.0,
        1.0
    )

    # Closest point on the link
    closest_point = (
        position_a
        + projection * AB
    )

    # Minimum distance of link from
    # Earth's center
    minimum_distance = np.linalg.norm(
        closest_point
    )

    # LOS exists if Earth does not
    # intersect the link
    return minimum_distance >= EARTH_RADIUS


# ==========================================
# Function: Build Network at a Timestamp
# ==========================================
def build_network_at_time(t):

    # --------------------------------------
    # Get satellite physical states
    # --------------------------------------
    states = get_satellite_states(t)

    # --------------------------------------
    # Create NetworkX graph
    # --------------------------------------
    G = nx.Graph()

    # --------------------------------------
    # Store satellite positions
    # --------------------------------------
    positions = []

    # --------------------------------------
    # Add satellites as nodes
    # --------------------------------------
    for satellite in states:

        position = np.array([
            satellite["x"],
            satellite["y"],
            satellite["z"]
        ])

        positions.append(position)

        G.add_node(
            satellite["id"],
            x=satellite["x"],
            y=satellite["y"],
            z=satellite["z"],
            distance_from_earth=satellite["distance"],
            eclipsed=satellite["eclipsed"]
        )

    positions = np.array(positions)

    # --------------------------------------
    # Build KD-tree
    # --------------------------------------
    tree = cKDTree(positions)

    # --------------------------------------
    # Find nearby satellite pairs
    # --------------------------------------
    candidate_pairs = tree.query_pairs(
        r=MAX_LINK_DISTANCE
    )

    # --------------------------------------
    # Check LOS and create edges
    # --------------------------------------
    for i, j in candidate_pairs:

        position_a = positions[i]
        position_b = positions[j]

        # Earth obstruction check
        if not check_los(
            position_a,
            position_b
        ):
            continue

        sat_a = states[i]
        sat_b = states[j]

        # Satellite-to-satellite distance
        distance = np.linalg.norm(
            position_a - position_b
        )

        # Add communication link
        G.add_edge(
            sat_a["id"],
            sat_b["id"],
            distance=float(distance)
        )

    # --------------------------------------
    # Return both graph and satellite states
    # --------------------------------------
    return G, states


# ==========================================
# Test
# ==========================================
if __name__ == "__main__":

    print(
        "\n========== NETWORK BUILDER TEST =========="
    )

    # Current timestamp
    t = ts.now()

    print(
        "Time:",
        t.utc_strftime()
    )

    print(
        "\nBuilding network..."
    )

    # IMPORTANT:
    # Function now returns G AND states
    G, states = build_network_at_time(t)

    # --------------------------------------
    # Network summary
    # --------------------------------------
    print(
        "\n========== NETWORK SUMMARY =========="
    )

    print(
        "Satellite states:",
        len(states)
    )

    print(
        "Nodes:",
        G.number_of_nodes()
    )

    print(
        "Edges:",
        G.number_of_edges()
    )

    print(
        "Connected components:",
        nx.number_connected_components(G)
    )

    # --------------------------------------
    # Degree statistics
    # --------------------------------------
    degrees = [
        degree
        for _, degree in G.degree()
    ]

    if degrees:

        print(
            "Average node degree:",
            f"{np.mean(degrees):.2f}"
        )

        print(
            "Minimum node degree:",
            min(degrees)
        )

        print(
            "Maximum node degree:",
            max(degrees)
        )

    # --------------------------------------
    # Eclipse statistics
    # --------------------------------------
    eclipsed_count = sum(
        state["eclipsed"]
        for state in states
    )

    sunlight_count = (
        len(states)
        - eclipsed_count
    )

    print(
        "\nSunlight satellites:",
        sunlight_count
    )

    print(
        "Eclipsed satellites:",
        eclipsed_count
    )

    print(
        "\nNetwork builder test successful! ✅"
    )