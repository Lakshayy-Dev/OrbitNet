import os
import sys
import random
import csv

import networkx as nx
import torch

# ============================================================
# PATH SETUP
# ============================================================

PROJECT_ROOT = os.path.dirname(
    os.path.dirname(os.path.abspath(__file__))
)

os.chdir(PROJECT_ROOT)

sys.path.insert(
    0,
    os.path.join(PROJECT_ROOT, "member_1(Lakshay)")
)

sys.path.insert(
    0,
    os.path.join(PROJECT_ROOT, "member_2(Krishna)")
)

from orbitnet_interface import get_network
from energy_model import initialize_energy, update_energy
from routing_cost import add_routing_costs
from gnn_model_v5 import OrbitNetGNNv5


# ============================================================
# SETTINGS
# ============================================================

random.seed(42)
torch.manual_seed(42)

NUM_TESTS = 100

MODEL_PATH = os.path.join(
    PROJECT_ROOT,
    "member_2(Krishna)",
    "orbitnet_gnn_v5.pth"
)

CSV_PATH = os.path.join(
    PROJECT_ROOT,
    "member_2(Krishna)",
    "evaluation_results_v5.csv"
)


# ============================================================
# START
# ============================================================

print("=" * 60)
print("ORBITNET GNN V5 EVALUATION")
print("=" * 60)


# ============================================================
# GET NETWORK
# ============================================================

print("\nGetting NetworkX graph...")

G, states = get_network()

print("\nNetwork received!")
print("Satellites:", G.number_of_nodes())
print("Edges:", G.number_of_edges())


# ============================================================
# ENERGY SIMULATION
# ============================================================

print("\nInitializing satellite energy...")

G = initialize_energy(G)

print("Simulating energy changes...")

for _ in range(5):
    G = update_energy(G)


# ============================================================
# ROUTING COST
# ============================================================

print("\nCalculating energy-aware routing costs...")

G = add_routing_costs(G)


# ============================================================
# CONNECTED COMPONENT
# ============================================================

components = list(
    nx.connected_components(G)
)

largest_component = max(
    components,
    key=len
)

nodes = list(largest_component)

print(
    "Largest connected component:",
    len(nodes)
)


# ============================================================
# PYTORCH GEOMETRIC CONVERSION
# ============================================================

print("\nConverting graph to PyTorch Geometric...")

from torch_geometric.utils import from_networkx

data = from_networkx(G)

node_ids = list(G.nodes())

node_to_index = {
    node_id: index
    for index, node_id in enumerate(node_ids)
}


# ============================================================
# NODE FEATURES
# ============================================================

node_features = []

for node in node_ids:

    x_pos = G.nodes[node]["x"]
    y_pos = G.nodes[node]["y"]
    z_pos = G.nodes[node]["z"]

    distance_from_earth = (
        G.nodes[node]["distance_from_earth"]
    )

    eclipsed = float(
        G.nodes[node]["eclipsed"]
    )

    energy = G.nodes[node]["energy"]

    node_features.append([
        x_pos / 7000.0,
        y_pos / 7000.0,
        z_pos / 7000.0,
        distance_from_earth / 7000.0,
        eclipsed,
        energy / 100.0
    ])


x = torch.tensor(
    node_features,
    dtype=torch.float
)

edge_index = data.edge_index

print("\nNode feature shape:", x.shape)
print("Edge index shape:", edge_index.shape)


# ============================================================
# CREATE MODEL
# ============================================================

print("\nLoading V5 GNN model...")

model = OrbitNetGNNv5(
    in_channels=6,
    hidden_channels=32,
    embedding_channels=16
)

model.load_state_dict(
    torch.load(
        MODEL_PATH,
        map_location="cpu"
    )
)

model.eval()

print("V5 model loaded successfully!")


# ============================================================
# GENERATE EMBEDDINGS
# ============================================================

print("\nGenerating GNN embeddings...")

with torch.no_grad():

    embeddings = model(
        x,
        edge_index
    )

print(
    "Embedding shape:",
    embeddings.shape
)


# ============================================================
# ADD GNN COST TO GRAPH
# ============================================================

print("\nCalculating GNN edge costs...")

gnn_cost_count = 0

with torch.no_grad():

    for u, v in G.edges():

        u_index = node_to_index[u]
        v_index = node_to_index[v]

        distance = G[u][v]["distance"]

        edge_distance = torch.tensor(
            [[distance / 2000.0]],
            dtype=torch.float
        )

        source_index = torch.tensor(
            [u_index],
            dtype=torch.long
        )

        target_index = torch.tensor(
            [v_index],
            dtype=torch.long
        )

        predicted_cost = model.edge_cost(
            embeddings,
            source_index,
            target_index,
            edge_distance,
            x
        )

        G[u][v]["gnn_cost"] = (
            predicted_cost.item()
        )

        gnn_cost_count += 1

        if gnn_cost_count % 250000 == 0:

            print(
                "Processed edges:",
                gnn_cost_count
            )


print(
    "\nGNN edge costs calculated:",
    gnn_cost_count
)


# ============================================================
# TEST ROUTES
# ============================================================

print("\n" + "=" * 60)
print("RUNNING TEST ROUTES")
print("=" * 60)

results = []

exact_match = 0
within_5 = 0
within_10 = 0
within_20 = 0

teacher_costs = []
gnn_costs = []
baseline_costs = []

teacher_distances = []
gnn_distances = []
baseline_distances = []

teacher_hops = []
gnn_hops = []
baseline_hops = []

successful_tests = 0
attempts = 0


while successful_tests < NUM_TESTS:

    attempts += 1

    source = random.choice(nodes)
    target = random.choice(nodes)

    if source == target:
        continue

    try:

        # ====================================================
        # TEACHER ROUTE
        # ====================================================

        teacher_path = nx.shortest_path(
            G,
            source=source,
            target=target,
            weight="routing_cost"
        )

        # ====================================================
        # GNN ROUTE
        # ====================================================

        gnn_path = nx.shortest_path(
            G,
            source=source,
            target=target,
            weight="gnn_cost"
        )

        # ====================================================
        # BASELINE ROUTE
        # ====================================================

        baseline_path = nx.shortest_path(
            G,
            source=source,
            target=target,
            weight="distance"
        )


        # ====================================================
        # TRUE COST FUNCTION
        # ====================================================

        def calculate_true_cost(path):

            total = 0.0

            for u, v in zip(
                path[:-1],
                path[1:]
            ):

                total += G[u][v]["routing_cost"]

            return total


        # ====================================================
        # DISTANCE FUNCTION
        # ====================================================

        def calculate_distance(path):

            total = 0.0

            for u, v in zip(
                path[:-1],
                path[1:]
            ):

                total += G[u][v]["distance"]

            return total


        # ====================================================
        # COSTS
        # ====================================================

        teacher_cost = calculate_true_cost(
            teacher_path
        )

        gnn_cost = calculate_true_cost(
            gnn_path
        )

        baseline_cost = calculate_true_cost(
            baseline_path
        )


        # ====================================================
        # DISTANCES
        # ====================================================

        teacher_distance = calculate_distance(
            teacher_path
        )

        gnn_distance = calculate_distance(
            gnn_path
        )

        baseline_distance = calculate_distance(
            baseline_path
        )


        # ====================================================
        # HOPS
        # ====================================================

        teacher_hop_count = len(
            teacher_path
        ) - 1

        gnn_hop_count = len(
            gnn_path
        ) - 1

        baseline_hop_count = len(
            baseline_path
        ) - 1


        # ====================================================
        # ROUTE QUALITY
        # ====================================================

        ratio = (
            gnn_cost / teacher_cost
        )

        percentage_difference = (
            (gnn_cost - teacher_cost)
            / teacher_cost
        ) * 100.0


        # ====================================================
        # MATCH COUNTS
        # ====================================================

        if gnn_path == teacher_path:

            exact_match += 1

        if ratio <= 1.05:

            within_5 += 1

        if ratio <= 1.10:

            within_10 += 1

        if ratio <= 1.20:

            within_20 += 1


        # ====================================================
        # SAVE RESULTS
        # ====================================================

        results.append({
            "source": source,
            "target": target,
            "teacher_cost": teacher_cost,
            "gnn_cost": gnn_cost,
            "baseline_cost": baseline_cost,
            "gnn_teacher_ratio": ratio,
            "gnn_difference_percent": percentage_difference,
            "teacher_distance": teacher_distance,
            "gnn_distance": gnn_distance,
            "baseline_distance": baseline_distance,
            "teacher_hops": teacher_hop_count,
            "gnn_hops": gnn_hop_count,
            "baseline_hops": baseline_hop_count
        })


        teacher_costs.append(
            teacher_cost
        )

        gnn_costs.append(
            gnn_cost
        )

        baseline_costs.append(
            baseline_cost
        )

        teacher_distances.append(
            teacher_distance
        )

        gnn_distances.append(
            gnn_distance
        )

        baseline_distances.append(
            baseline_distance
        )

        teacher_hops.append(
            teacher_hop_count
        )

        gnn_hops.append(
            gnn_hop_count
        )

        baseline_hops.append(
            baseline_hop_count
        )


        successful_tests += 1


        if successful_tests % 20 == 0:

            print(
                f"Completed "
                f"{successful_tests}/{NUM_TESTS}"
            )


    except nx.NetworkXNoPath:

        continue


# ============================================================
# AVERAGES
# ============================================================

avg_teacher_cost = (
    sum(teacher_costs)
    / len(teacher_costs)
)

avg_gnn_cost = (
    sum(gnn_costs)
    / len(gnn_costs)
)

avg_baseline_cost = (
    sum(baseline_costs)
    / len(baseline_costs)
)

avg_teacher_distance = (
    sum(teacher_distances)
    / len(teacher_distances)
)

avg_gnn_distance = (
    sum(gnn_distances)
    / len(gnn_distances)
)

avg_baseline_distance = (
    sum(baseline_distances)
    / len(baseline_distances)
)

avg_teacher_hops = (
    sum(teacher_hops)
    / len(teacher_hops)
)

avg_gnn_hops = (
    sum(gnn_hops)
    / len(gnn_hops)
)

avg_baseline_hops = (
    sum(baseline_hops)
    / len(baseline_hops)
)


# ============================================================
# RATIOS
# ============================================================

gnn_teacher_ratio = (
    avg_gnn_cost
    / avg_teacher_cost
)

baseline_teacher_ratio = (
    avg_baseline_cost
    / avg_teacher_cost
)


# ============================================================
# SAVE CSV
# ============================================================

with open(
    CSV_PATH,
    "w",
    newline="",
    encoding="utf-8"
) as file:

    writer = csv.DictWriter(
        file,
        fieldnames=results[0].keys()
    )

    writer.writeheader()

    writer.writerows(results)


# ============================================================
# FINAL RESULTS
# ============================================================

print("\n")
print("=" * 60)
print("V5 EVALUATION RESULTS")
print("=" * 60)

print("\n--- TEST INFORMATION ---")

print(
    f"Successful test routes : "
    f"{successful_tests}/{NUM_TESTS}"
)

print(
    "Total attempts         :",
    attempts
)


print("\n--- ROUTE QUALITY ---")

print(
    f"Exact match            : "
    f"{exact_match}/{NUM_TESTS} "
    f"({exact_match / NUM_TESTS * 100:.2f}%)"
)

print(
    f"Within 5%              : "
    f"{within_5}/{NUM_TESTS} "
    f"({within_5 / NUM_TESTS * 100:.2f}%)"
)

print(
    f"Within 10%             : "
    f"{within_10}/{NUM_TESTS} "
    f"({within_10 / NUM_TESTS * 100:.2f}%)"
)

print(
    f"Within 20%             : "
    f"{within_20}/{NUM_TESTS} "
    f"({within_20 / NUM_TESTS * 100:.2f}%)"
)


print(
    "\n--- TRUE ENERGY-AWARE ROUTING COST ---"
)

print(
    f"Teacher / Optimal cost : "
    f"{avg_teacher_cost:.4f}"
)

print(
    f"GNN route cost         : "
    f"{avg_gnn_cost:.4f}"
)

print(
    f"Baseline route cost    : "
    f"{avg_baseline_cost:.4f}"
)

print(
    f"GNN / Teacher ratio    : "
    f"{gnn_teacher_ratio:.4f}"
)

print(
    f"Baseline / Teacher     : "
    f"{baseline_teacher_ratio:.4f}"
)


print("\n--- AVERAGE DISTANCE ---")

print(
    f"Teacher distance       : "
    f"{avg_teacher_distance:.2f} km"
)

print(
    f"GNN distance           : "
    f"{avg_gnn_distance:.2f} km"
)

print(
    f"Baseline distance      : "
    f"{avg_baseline_distance:.2f} km"
)


print("\n--- AVERAGE HOPS ---")

print(
    f"Teacher hops           : "
    f"{avg_teacher_hops:.2f}"
)

print(
    f"GNN hops               : "
    f"{avg_gnn_hops:.2f}"
)

print(
    f"Baseline hops          : "
    f"{avg_baseline_hops:.2f}"
)


# ============================================================
# INTERPRETATION
# ============================================================

print("\n--- INTERPRETATION ---")

if (
    avg_gnn_cost
    < avg_baseline_cost
):

    print(
        "SUCCESS: V5 GNN beats "
        "the shortest-distance baseline!"
    )

else:

    print(
        "V5 GNN does NOT beat "
        "the shortest-distance baseline."
    )


if gnn_teacher_ratio <= 1.05:

    print(
        "Excellent: GNN is within 5% "
        "of optimal."
    )

elif gnn_teacher_ratio <= 1.10:

    print(
        "Good: GNN is within 10% "
        "of optimal."
    )

elif gnn_teacher_ratio <= 1.20:

    print(
        "Acceptable: GNN is within 20% "
        "of optimal."
    )

else:

    print(
        "GNN is more than 20% worse "
        "than optimal on average."
    )


print("\nDetailed results saved to:")
print(CSV_PATH)

print("\n" + "=" * 60)
print("V5 EVALUATION COMPLETE")
print("=" * 60)