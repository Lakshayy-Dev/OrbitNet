import os
import sys

import networkx as nx
import torch
from torch_geometric.utils import from_networkx


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

MODEL_PATH = os.path.join(
    PROJECT_ROOT,
    "member_2(Krishna)",
    "orbitnet_gnn_v5.pth"
)

SOURCE = None
TARGET = None


# ============================================================
# GET NETWORK
# ============================================================

print("=" * 60)
print("ORBITNET V5 ROUTING")
print("=" * 60)

print("\nGetting NetworkX graph...")

G, states = get_network()

print("\nNetwork received!")
print("Satellites:", G.number_of_nodes())
print("Edges:", G.number_of_edges())


# ============================================================
# ENERGY
# ============================================================

print("\nInitializing satellite energy...")

G = initialize_energy(G)

print("Simulating energy changes...")

for _ in range(5):
    G = update_energy(G)
G = add_routing_costs(G)


# ============================================================
# PYTORCH GEOMETRIC CONVERSION
# ============================================================

print("\nConverting graph to PyTorch Geometric...")

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

print(
    "\nNode feature shape:",
    x.shape
)

print(
    "Edge index shape:",
    edge_index.shape
)


# ============================================================
# LOAD V5 MODEL
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
# CALCULATE GNN EDGE COSTS
# ============================================================

print("\nCalculating GNN edge costs...")

processed = 0

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

        processed += 1

        if processed % 250000 == 0:

            print(
                "Processed edges:",
                processed
            )


print(
    "\nGNN edge costs calculated:",
    processed
)


# ============================================================
# SELECT SOURCE AND TARGET
# ============================================================

if SOURCE is None:

    SOURCE = input(
        "\nEnter source satellite ID: "
    ).strip()


if TARGET is None:

    TARGET = input(
        "Enter target satellite ID: "
    ).strip()


# ============================================================
# VALIDATE SOURCE / TARGET
# ============================================================

if SOURCE not in G:

    print(
        "\nERROR: Source satellite not found."
    )

    print(
        "Example satellite IDs:"
    )

    for node in list(G.nodes())[:10]:

        print(
            " ",
            node
        )

    sys.exit()


if TARGET not in G:

    print(
        "\nERROR: Target satellite not found."
    )

    sys.exit()


if SOURCE == TARGET:

    print(
        "\nERROR: Source and target "
        "cannot be the same."
    )

    sys.exit()


# ============================================================
# FIND GNN ROUTE
# ============================================================

print("\nFinding V5 GNN route...")

try:

    gnn_path = nx.shortest_path(
        G,
        source=SOURCE,
        target=TARGET,
        weight="gnn_cost"
    )

except nx.NetworkXNoPath:

    print(
        "\nERROR: No route exists "
        "between source and target."
    )

    sys.exit()


# ============================================================
# CALCULATE ROUTE INFORMATION
# ============================================================

total_distance = 0.0
total_gnn_cost = 0.0
total_true_cost = 0.0

for u, v in zip(
    gnn_path[:-1],
    gnn_path[1:]
):

    total_distance += (
        G[u][v]["distance"]
    )

    total_gnn_cost += (
        G[u][v]["gnn_cost"]
    )

    if "routing_cost" in G[u][v]:

        total_true_cost += (
            G[u][v]["routing_cost"]
        )


total_hops = len(gnn_path) - 1


# ============================================================
# DISPLAY RESULT
# ============================================================

print("\n")
print("=" * 60)
print("V5 GNN ROUTING RESULT")
print("=" * 60)

print(
    "\nSource satellite :",
    SOURCE
)

print(
    "Target satellite :",
    TARGET
)

print("\nRecommended route:")

for i, node in enumerate(gnn_path):

    if i == len(gnn_path) - 1:

        print(
            "  ",
            node
        )

    else:

        print(
            "  ",
            node,
            "↓"
        )


print("\n--- ROUTE INFORMATION ---")

print(
    "Total hops       :",
    total_hops
)

print(
    f"Total distance   : "
    f"{total_distance:.2f} km"
)

print(
    f"GNN route cost   : "
    f"{total_gnn_cost:.4f}"
)

print(
    f"True routing cost: "
    f"{total_true_cost:.4f}"
)


print("\n" + "=" * 60)
print("V5 ROUTING COMPLETE")
print("=" * 60)