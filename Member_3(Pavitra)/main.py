
"""Run the OrbitNet Member 3 simulation and save reusable snapshots."""

from pathlib import Path
import sys
import pickle

ROOT = Path(__file__).resolve().parent.parent

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from simulation import OrbitNetSimulation
from metrics import save_results_csv, summarize
from evaluation import plot_results
from visualization import save_snapshot
from animation import build_animation


def main():
    results_dir = ROOT / "results" / "member3"
    results_dir.mkdir(parents=True, exist_ok=True)

    sim = OrbitNetSimulation(
        step_seconds=30,
        steps=20,
    )

    # Run the simulation.
    results = sim.run()

    # Save numerical results.
    save_results_csv(
        results,
        results_dir / "simulation_results.csv",
    )

    plot_results(results, results_dir)

    # Save all snapshot graphs for future visualization rebuilds.
    snapshots_path = results_dir / "simulation_snapshots.pkl"
    temporary_path = results_dir / "simulation_snapshots.tmp"

    with temporary_path.open("wb") as file:
        pickle.dump(
            sim.snapshots,
            file,
            protocol=pickle.HIGHEST_PROTOCOL,
        )

    # Replace the previous snapshot file only after saving succeeds.
    temporary_path.replace(snapshots_path)

    # Save the first frame and full animation.
    save_snapshot(
        sim.snapshots[0],
        results_dir / "snapshot_000.html",
    )

    build_animation(
        sim.snapshots,
        results_dir / "orbitnet_simulation.html",
    )

    # Save summary metrics.
    summary = summarize(results)

    with (results_dir / "summary.txt").open(
        "w",
        encoding="utf-8",
    ) as file:
        for key, value in summary.items():
            file.write(f"{key}: {value}\n")

    print("\nOrbitNet Member 3 simulation complete.")
    print(f"Results: {results_dir}")
    print(f"Saved snapshots: {snapshots_path}")

    for key, value in summary.items():
        print(f"{key}: {value}")


if __name__ == "__main__":
    main()
