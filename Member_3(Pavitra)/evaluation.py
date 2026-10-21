"""Evaluation helpers and plots for OrbitNet Member 3."""

from __future__ import annotations

from pathlib import Path
import matplotlib.pyplot as plt


def plot_results(results, output_dir):
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    steps = [r.step for r in results]

    def save(y1, y2, ylabel, name, label1="GNN", label2="Dijkstra"):
        plt.figure(figsize=(9, 5))
        plt.plot(steps, y1, marker="o", label=label1)
        plt.plot(steps, y2, marker="o", label=label2)
        plt.xlabel("Simulation step")
        plt.ylabel(ylabel)
        plt.legend()
        plt.grid(True, alpha=0.3)
        plt.tight_layout()
        plt.savefig(output_dir / name, dpi=180)
        plt.close()

    save(
        [r.gnn_distance_km or float("nan") for r in results],
        [r.dijkstra_distance_km or float("nan") for r in results],
        "Route distance (km)",
        "route_distance.png",
    )
    save(
        [r.gnn_hops or float("nan") for r in results],
        [r.dijkstra_hops or float("nan") for r in results],
        "Hops",
        "route_hops.png",
    )
    save(
        [r.gnn_eclipsed or float("nan") for r in results],
        [r.dijkstra_eclipsed or float("nan") for r in results],
        "Eclipsed satellites in route",
        "eclipse_usage.png",
    )

    plt.figure(figsize=(9, 5))
    plt.plot(
        steps,
        [r.eclipsed_count for r in results],
        marker="o",
    )
    plt.xlabel("Simulation step")
    plt.ylabel("Eclipsed satellites in network")
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(output_dir / "network_eclipse_count.png", dpi=180)
    plt.close()
