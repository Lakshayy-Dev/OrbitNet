import sys
import os

os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

sys.path.insert(0, r".\member_1(Lakshay)")

from orbitnet_interface import get_network
import torch
from torch_geometric.utils import from_networkx

print("Getting NetworkX graph...")

G, states = get_network()
data = from_networkx(G)
edge_features = []

for source, target in G.edges:
    distance = G.edges[source, target]["distance"]

    edge_features.append([distance])
    edge_features.append([distance])

data.edge_attr = torch.tensor(edge_features, dtype=torch.float)
# Normalize edge distances
data.edge_attr = data.edge_attr / 2000.0
print("Edge feature shape:", data.edge_attr.shape)
print("PyG edge count:", data.edge_index.shape[1]) 
features = []

for node in G.nodes:
    features.append([
        G.nodes[node]["x"],
        G.nodes[node]["y"],
        G.nodes[node]["z"],
        G.nodes[node]["distance_from_earth"],
        float(G.nodes[node]["eclipsed"])
    ])

data.x = torch.tensor(features, dtype=torch.float)
# Normalize continuous node features
data.x[:, 0:4] = data.x[:, 0:4] / 7000.0
print("Normalized node features:", data.x[0])
print("Normalized edge feature:", data.edge_attr[0])
print("Edge features created!")
print("Edge feature shape:", data.edge_attr.shape)
print("First edge distance:", data.edge_attr[0])
print("Node features created!")
print("Feature shape:", data.x.shape)
print("First satellite features:", data.x[0])
print("PyG conversion successful!")
print("PyG nodes:", data.num_nodes)
print("PyG edges:", data.num_edges)

print("Network received successfully!")
print("Nodes:", G.number_of_nodes())
print("Edges:", G.number_of_edges())