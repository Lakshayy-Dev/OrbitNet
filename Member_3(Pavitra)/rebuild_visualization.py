
"""Rebuild OrbitNet HTML visualizations from saved snapshots."""

from pathlib import Path
import pickle
import sys

ROOT = Path(__file__).resolve().parent.parent

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from visualization import save_snapshot
from animation import build_animation


def main():
    results_dir = ROOT / "results" / "member3"
    snapshots_path = results_dir / "simulation_snapshots.pkl"

    if not snapshots_path.exists():
        raise FileNotFoundError(
            f"Saved snapshots not found: {snapshots_path}\n"
            "Run main.py once to generate them."
        )

    # Only load snapshot files created by your own trusted project.
    with snapshots_path.open("rb") as file:
        snapshots = pickle.load(file)

    if not snapshots:
        raise ValueError("The saved snapshot collection is empty.")

    save_snapshot(
        snapshots[0],
        results_dir / "snapshot_000.html",
    )

    build_animation(
        snapshots,
        results_dir / "orbitnet_simulation.html",
    )

    print("Visualization rebuild complete.")
    print(f"Snapshots loaded: {len(snapshots)}")
    print(f"Output directory: {results_dir}")


if __name__ == "__main__":
    main()
