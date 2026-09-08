import numpy as np
import networkx as nx

from network_builder import build_network_at_time
from eclipse_detector import ts


# ==========================================
# Configuration
# ==========================================
MAX_LINK_DISTANCE = 2000.0
EARTH_RADIUS = 6378.137


# ==========================================
# Build network
# ==========================================
t = ts.now()

print("Building network for validation...")

G = build_network_at_time(t)


# ==========================================
# Basic checks
# ==========================================

print("\n========== VALIDATION ==========")

# Check 1: Nodes
print("\n1. Node count:")
print("Nodes:", G.number_of_nodes())


# Check 2: Self loops
self_loops = list(nx.selfloop_edges(G))

print("\n2. Self-loops:")
print("Count:", len(self_loops))


# Check 3: Connected components
components = nx.number_connected_components(G)

print("\n3. Connected components:")
print("Count:", components)


# ==========================================
# Edge validation
# ==========================================

invalid_distance_edges = 0
invalid_los_edges = 0

for source, target, data in G.edges(data=True):

    distance = data["distance"]

    # --------------------------------------
    # Distance check
    # --------------------------------------
    if distance > MAX_LINK_DISTANCE:
        invalid_distance_edges += 1

    # --------------------------------------
    # Position data
    # --------------------------------------
    position_a = np.array([
        G.nodes[source]["x"],
        G.nodes[source]["y"],
        G.nodes[source]["z"]
    ])

    position_b = np.array([
        G.nodes[target]["x"],
        G.nodes[target]["y"],
        G.nodes[target]["z"]
    ])

    # --------------------------------------
    # LOS check
    # --------------------------------------
    AB = position_b - position_a

    denominator = np.dot(AB, AB)

    if denominator == 0:
        invalid_los_edges += 1
        continue

    projection = -np.dot(
        position_a,
        AB
    ) / denominator

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

    if minimum_distance < EARTH_RADIUS:
        invalid_los_edges += 1


# ==========================================
# Display edge validation
# ==========================================

print("\n4. Edge distance validation:")
print(
    "Invalid distance edges:",
    invalid_distance_edges
)

print("\n5. Edge LOS validation:")
print(
    "Invalid LOS edges:",
    invalid_los_edges
)


# ==========================================
# Node attribute validation
# ==========================================

missing_position = 0
missing_eclipse = 0

for node, data in G.nodes(data=True):

    if not all(
        key in data
        for key in ["x", "y", "z"]
    ):
        missing_position += 1

    if "eclipsed" not in data:
        missing_eclipse += 1


print("\n6. Node position validation:")
print(
    "Nodes with missing position:",
    missing_position
)

print("\n7. Eclipse attribute validation:")
print(
    "Nodes with missing eclipse state:",
    missing_eclipse
)


# ==========================================
# Final result
# ==========================================

if (
    len(self_loops) == 0
    and invalid_distance_edges == 0
    and invalid_los_edges == 0
    and missing_position == 0
    and missing_eclipse == 0
):

    print(
        "\n✅ NETWORK VALIDATION PASSED"
    )

else:

    print(
        "\n❌ NETWORK VALIDATION FAILED"
    )