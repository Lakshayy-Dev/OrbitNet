
"""Reusable adapter for Member 2's V5 GNN routing model."""

from __future__ import annotations

import os
import sys
from itertools import islice
from pathlib import Path
from typing import Dict, List, Tuple

import networkx as nx
import torch
from torch_geometric.utils import from_networkx


# Project directories: match the actual folder names.
HERE = Path(__file__).resolve().parent
PROJECT_ROOT = HERE.parent

M1 = PROJECT_ROOT / "member_1(Lakshay)"
M2 = PROJECT_ROOT / "Member_2(Krishna)"

for directory in (M1, M2):
    if str(directory) not in sys.path:
        sys.path.insert(0, str(directory))

from gnn_model_v5 import OrbitNetGNNv5


DEFAULT_MODEL_PATH = M2 / "orbitnet_gnn_v5.pth"


class GNNRouter:
    """Load the V5 model and calculate GNN-based routes."""

    def __init__(
        self,
        model_path: str | os.PathLike = DEFAULT_MODEL_PATH,
    ):
        self.model_path = Path(model_path)

        if not self.model_path.is_file():
            raise FileNotFoundError(
                f"GNN model checkpoint not found: {self.model_path}"
            )

        self.model = OrbitNetGNNv5(
            in_channels=6,
            hidden_channels=32,
            embedding_channels=16,
        )

        state_dict = torch.load(
            self.model_path,
            map_location="cpu",
        )
        self.model.load_state_dict(state_dict)
        self.model.eval()

    @staticmethod
    def build_features(G: nx.Graph):
        """Build the six node features expected by Member 2's model."""
        node_ids = list(G.nodes())
        node_to_index = {
            node_id: index
            for index, node_id in enumerate(node_ids)
        }

        features = []

        for node in node_ids:
            data = G.nodes[node]

            features.append([
                float(data["x"]) / 7000.0,
                float(data["y"]) / 7000.0,
                float(data["z"]) / 7000.0,
                float(data["distance_from_earth"]) / 7000.0,
                float(bool(data.get("eclipsed", False))),
                float(data.get("energy", 100.0)) / 100.0,
            ])

        x = torch.tensor(features, dtype=torch.float32)
        graph_data = from_networkx(G)

        return x, graph_data.edge_index, node_ids, node_to_index

    def add_gnn_costs(self, G: nx.Graph) -> nx.Graph:
        """Predict edge costs in batches to reduce Python overhead."""
        if G.number_of_edges() == 0:
            return G

        x, edge_index, _, node_to_index = self.build_features(G)

        # Moderate batches limit extra memory use on large graphs.
        batch_size = 16384

        with torch.no_grad():
            embeddings = self.model(x, edge_index)

            edge_iterator = iter(G.edges(data=True))

            while True:
                batch = list(islice(edge_iterator, batch_size))
                if not batch:
                    break

                source_indices = torch.tensor(
                    [node_to_index[u] for u, v, data in batch],
                    dtype=torch.long,
                )
                target_indices = torch.tensor(
                    [node_to_index[v] for u, v, data in batch],
                    dtype=torch.long,
                )
                edge_distances = torch.tensor(
                    [
                        [float(data["distance"]) / 2000.0]
                        for u, v, data in batch
                    ],
                    dtype=torch.float32,
                )

                predicted_costs = self.model.edge_cost(
                    embeddings,
                    source_indices,
                    target_indices,
                    edge_distances,
                    x,
                )

                costs = predicted_costs.reshape(-1).tolist()

                for (u, v, data), cost in zip(batch, costs):
                    data["gnn_cost"] = float(cost)

        return G

    def route(
        self,
        G: nx.Graph,
        source: str,
        target: str,
    ) -> Tuple[List[str], Dict]:
        """Find a route using the learned GNN edge costs."""
        if source not in G or target not in G:
            raise ValueError(
                "Source or target is not present in the current graph."
            )

        if source == target:
            return [source], {
                "hops": 0,
                "distance_km": 0.0,
                "gnn_cost": 0.0,
                "eclipsed_nodes": int(
                    bool(G.nodes[source].get("eclipsed", False))
                ),
                "processed_edges": 0,
                "node_count": G.number_of_nodes(),
                "edge_count": G.number_of_edges(),
            }

        self.add_gnn_costs(G)

        path = nx.shortest_path(
            G,
            source=source,
            target=target,
            weight="gnn_cost",
        )

        distance = sum(
            float(G[u][v]["distance"])
            for u, v in zip(path[:-1], path[1:])
        )

        cost = sum(
            float(G[u][v]["gnn_cost"])
            for u, v in zip(path[:-1], path[1:])
        )

        eclipsed_nodes = sum(
            int(bool(G.nodes[node].get("eclipsed", False)))
            for node in path
        )

        return path, {
            "hops": len(path) - 1,
            "distance_km": distance,
            "gnn_cost": cost,
            "eclipsed_nodes": eclipsed_nodes,
            "processed_edges": G.number_of_edges(),
            "node_count": G.number_of_nodes(),
            "edge_count": G.number_of_edges(),
        }


def dijkstra_route(
    G: nx.Graph,
    source: str,
    target: str,
) -> Tuple[List[str], Dict]:
    """Conventional shortest-distance baseline for comparison."""
    if source not in G or target not in G:
        raise ValueError(
            "Source or target is not present in the current graph."
        )

    if source == target:
        return [source], {
            "hops": 0,
            "distance_km": 0.0,
            "eclipsed_satellites": int(
                bool(G.nodes[source].get("eclipsed", False))
            ),
        }

    path = nx.shortest_path(
        G,
        source=source,
        target=target,
        weight="distance",
    )

    distance = sum(
        float(G[u][v]["distance"])
        for u, v in zip(path[:-1], path[1:])
    )

    eclipsed = sum(
        int(bool(G.nodes[node].get("eclipsed", False)))
        for node in path
    )

    return path, {
        "hops": len(path) - 1,
        "distance_km": distance,
        "eclipsed_satellites": eclipsed,
    }
