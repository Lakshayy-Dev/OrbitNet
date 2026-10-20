"""
Member 3 adapter for the OrbitNet V5 GNN router.

This module turns Krishna's interactive V5 routing script into a reusable
component for dynamic simulation. It keeps the V5 feature definition and
model/edge-cost logic, but removes interactive input.
"""

from __future__ import annotations

import os
import sys
from typing import Any, Dict, Optional, Tuple

import networkx as nx
import torch
from torch_geometric.utils import from_networkx


PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
M1_DIR = os.path.join(PROJECT_ROOT, "member_1(Lakshay)")
M2_DIR = os.path.join(PROJECT_ROOT, "Member_2(Krishna)")

for path in (M1_DIR, M2_DIR):
    if path not in sys.path:
        sys.path.insert(0, path)

from gnn_model_v5 import OrbitNetGNNv5


DEFAULT_MODEL_PATH = os.path.join(M2_DIR, "orbitnet_gnn_v5.pth")


class GNNRouter:
    """Reusable implementation of the Member 2 V5 routing pipeline."""

    def __init__(
        self,
        model_path: str = DEFAULT_MODEL_PATH,
        device: str = "cpu",
    ):
        self.device = torch.device(device)
        self.model_path = model_path

        self.model = OrbitNetGNNv5(
            in_channels=6,
            hidden_channels=32,
            embedding_channels=16,
        )
        self.model.load_state_dict(
            torch.load(self.model_path, map_location=self.device)
        )
        self.model.to(self.device)
        self.model.eval()

    @staticmethod
    def add_energy(
        G: nx.Graph,
        initial_energy: float = 100.0,
    ) -> nx.Graph:
        """Ensure every node has an energy attribute."""
        for node in G.nodes:
            if "energy" not in G.nodes[node]:
                G.nodes[node]["energy"] = float(initial_energy)
        return G

    @staticmethod
    def build_features(G: nx.Graph) -> torch.Tensor:
        """Build the exact six V5 node features used by Member 2."""
        features = []

        for node in G.nodes:
            attrs = G.nodes[node]

            features.append([
                attrs["x"] / 7000.0,
                attrs["y"] / 7000.0,
                attrs["z"] / 7000.0,
                attrs["distance_from_earth"] / 7000.0,
                float(attrs["eclipsed"]),
                float(attrs["energy"]) / 100.0,
            ])

        return torch.tensor(features, dtype=torch.float, device="cpu")

    def prepare_graph(self, G: nx.Graph) -> Tuple[torch.Tensor, Dict[str, int]]:
        """Convert NetworkX graph and generate V5 GNN embeddings."""
        G = self.add_energy(G)

        # Keep node ordering identical between NetworkX and PyG.
        node_ids = list(G.nodes())
        node_to_index = {
            node_id: index for index, node_id in enumerate(node_ids)
        }

        data = from_networkx(G)
        x = self.build_features(G)
        edge_index = data.edge_index

        with torch.no_grad():
            embeddings = self.model(
                x.to(self.device),
                edge_index.to(self.device),
            )

        return embeddings, node_to_index

    def add_gnn_costs(
        self,
        G: nx.Graph,
    ) -> Tuple[nx.Graph, Dict[str, Any]]:
        """Calculate V5 GNN costs for every graph edge."""
        embeddings, node_to_index = self.prepare_graph(G)
        features = self.build_features(G).to(self.device)

        processed = 0

        with torch.no_grad():
            for u, v in G.edges():
                u_index = node_to_index[u]
                v_index = node_to_index[v]

                distance = G[u][v]["distance"]

                edge_distance = torch.tensor(
                    [[distance / 2000.0]],
                    dtype=torch.float,
                    device=self.device,
                )

                source_index = torch.tensor(
                    [u_index],
                    dtype=torch.long,
                    device=self.device,
                )

                target_index = torch.tensor(
                    [v_index],
                    dtype=torch.long,
                    device=self.device,
                )

                predicted_cost = self.model.edge_cost(
                    embeddings,
                    source_index,
                    target_index,
                    edge_distance,
                    features,
                )

                G[u][v]["gnn_cost"] = float(predicted_cost.item())
                processed += 1

        return G, {
            "processed_edges": processed,
            "node_count": G.number_of_nodes(),
            "edge_count": G.number_of_edges(),
        }

    def route(
        self,
        G: nx.Graph,
        source: str,
        target: str,
    ) -> Tuple[list, Dict[str, Any]]:
        """Return the V5 GNN route between source and target."""
        if source not in G:
            raise ValueError(f"Source satellite not found: {source}")
        if target not in G:
            raise ValueError(f"Target satellite not found: {target}")
        if source == target:
            raise ValueError("Source and target cannot be the same.")

        G, stats = self.add_gnn_costs(G)

        try:
            path = nx.shortest_path(
                G,
                source=source,
                target=target,
                weight="gnn_cost",
            )
        except nx.NetworkXNoPath as exc:
            raise ValueError(
                f"No GNN route exists between {source} and {target}."
            ) from exc

        total_distance = 0.0
        total_gnn_cost = 0.0
        eclipsed_nodes = 0

        for node in path:
            if G.nodes[node].get("eclipsed", False):
                eclipsed_nodes += 1

        for u, v in zip(path[:-1], path[1:]):
            total_distance += float(G[u][v]["distance"])
            total_gnn_cost += float(G[u][v]["gnn_cost"])

        info = {
            **stats,
            "hops": len(path) - 1,
            "distance_km": total_distance,
            "gnn_cost": total_gnn_cost,
            "eclipsed_nodes": eclipsed_nodes,
        }

        return path, info


def dijkstra_route(
    G: nx.Graph,
    source: str,
    target: str,
) -> Tuple[list, Dict[str, Any]]:
    """Distance-weighted shortest path baseline."""
    path = nx.shortest_path(
        G,
        source=source,
        target=target,
        weight="distance",
    )

    total_distance = sum(
        float(G[u][v]["distance"])
        for u, v in zip(path[:-1], path[1:])
    )

    eclipsed_nodes = sum(
        bool(G.nodes[node].get("eclipsed", False))
        for node in path
    )

    return path, {
        "hops": len(path) - 1,
        "distance_km": total_distance,
        "eclipsed_nodes": eclipsed_nodes,
    }
