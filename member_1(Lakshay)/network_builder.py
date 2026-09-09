import networkx as nx
import numpy as np
from scipy.spatial import cKDTree

from eclipse_detector import get_satellite_states, ts


MAX_LINK_DISTANCE = 2000.0
EARTH_RADIUS = 6378.137


def check_los(position_a, position_b):
    """
    Check whether two satellites have direct line-of-sight
    without Earth blocking the communication path.
    """

    AB = position_b - position_a

    denominator = np.dot(AB, AB)

    if denominator == 0:
        return False

    projection = (
        -np.dot(position_a, AB)
        / denominator
    )

    projection = np.clip(
        projection,
        0.0,
        1.0
    )

    closest_point = (
        position_a
        + projection * AB
    )

    minimum_distance = np.linalg.norm(
        closest_point
    )

    return minimum_distance >= EARTH_RADIUS


def build_network_at_time(t):
    """
    Build the satellite communication network at a given time.

    Satellites with invalid position values (NaN or infinity)
    are automatically skipped.
    """

    # ---------------------------------------------------------
    # STEP 1: Get physical state of all satellites
    # ---------------------------------------------------------

    states = get_satellite_states(t)

    # ---------------------------------------------------------
    # STEP 2: Remove satellites with invalid positions
    # ---------------------------------------------------------

    valid_states = []
    invalid_satellites = []

    for satellite in states:

        position = np.array(
            [
                satellite["x"],
                satellite["y"],
                satellite["z"]
            ],
            dtype=float
        )

        if np.isfinite(position).all():

            valid_states.append(satellite)

        else:

            invalid_satellites.append(
                satellite["id"]
            )

    if invalid_satellites:

        print(
            "\nWARNING: Skipping satellites "
            "with invalid positions:"
        )

        for satellite_id in invalid_satellites:
            print(" -", satellite_id)

    states = valid_states

    # ---------------------------------------------------------
    # STEP 3: Create NetworkX graph
    # ---------------------------------------------------------

    G = nx.Graph()

    positions = []

    for satellite in states:

        position = np.array(
            [
                satellite["x"],
                satellite["y"],
                satellite["z"]
            ],
            dtype=float
        )

        positions.append(position)

        G.add_node(
            satellite["id"],

            x=satellite["x"],
            y=satellite["y"],
            z=satellite["z"],

            distance_from_earth=
                satellite["distance"],

            eclipsed=
                satellite["eclipsed"]
        )

    # ---------------------------------------------------------
    # STEP 4: Convert positions to NumPy array
    # ---------------------------------------------------------

    positions = np.array(
        positions,
        dtype=float
    )

    # Safety check
    if len(positions) == 0:

        return G, states

    # ---------------------------------------------------------
    # STEP 5: Build spatial search tree
    # ---------------------------------------------------------

    tree = cKDTree(positions)

    # ---------------------------------------------------------
    # STEP 6: Find satellite pairs within communication range
    # ---------------------------------------------------------

    candidate_pairs = tree.query_pairs(
        r=MAX_LINK_DISTANCE
    )

    # ---------------------------------------------------------
    # STEP 7: Check LOS and create edges
    # ---------------------------------------------------------

    for i, j in candidate_pairs:

        position_a = positions[i]
        position_b = positions[j]

        # Check whether Earth blocks the link
        if not check_los(
            position_a,
            position_b
        ):
            continue

        sat_a = states[i]
        sat_b = states[j]

        distance = np.linalg.norm(
            position_a - position_b
        )

        G.add_edge(
            sat_a["id"],
            sat_b["id"],

            distance=float(distance)
        )

    return G, states


# =============================================================
# TEST
# =============================================================

if __name__ == "__main__":

    print(
        "\n========== NETWORK BUILDER TEST =========="
    )

    t = ts.now()

    print(
        "Time:",
        t.utc_strftime()
    )

    print(
        "\nBuilding network..."
    )

    G, states = build_network_at_time(t)

    print(
        "\n========== NETWORK SUMMARY =========="
    )

    print(
        "Valid satellite states:",
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