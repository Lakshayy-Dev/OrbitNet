"""Locate the OrbitNet project and make the members' modules importable.

Nothing in the member folders is modified. This module only:

* puts the three member folders on ``sys.path`` so their modules import
  exactly as they do when the members run their own scripts, and
* switches the working directory to the project root, because Member 1's
  modules open ``data/starlink.tle`` and ``de421.bsp`` with relative paths.

Member 3's modules add ``Member_2(Krishna)`` (capital M) to ``sys.path``.
That works on Windows and macOS, whose file systems ignore case, but not on
Linux, where the folder is ``member_2(Krishna)``. Adding the real folder name
here makes the same imports work everywhere without editing their files.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

MEMBER_1_DIR = ROOT / "member_1(Lakshay)"
MEMBER_2_DIR = ROOT / "member_2(Krishna)"
MEMBER_3_DIR = ROOT / "Member_3(Pavitra)"

RESULTS_DIR = ROOT / "results" / "member3"
SNAPSHOTS_PATH = RESULTS_DIR / "simulation_snapshots.pkl"
SIMULATION_CSV = RESULTS_DIR / "simulation_results.csv"
SUMMARY_TXT = RESULTS_DIR / "summary.txt"
SCENARIO_CSV = RESULTS_DIR / "scenario_results.csv"
GNN_EVAL_CSV = MEMBER_2_DIR / "evaluation_results_v5.csv"
GNN_MODEL_PATH = MEMBER_2_DIR / "orbitnet_gnn_v5.pth"
TLE_PATH = ROOT / "data" / "starlink.tle"
EPHEMERIS_PATH = ROOT / "de421.bsp"

_configured = False


def configure() -> None:
    """Make member modules importable. Safe to call more than once."""
    global _configured
    if _configured:
        return

    # Don't write __pycache__ folders into the members' directories.
    sys.dont_write_bytecode = True

    # Same order the members' own scripts use: Member 1 first, then Member 2,
    # then Member 3 (so `router_adapter`, `simulation`, … resolve to Member 3).
    for directory in (MEMBER_3_DIR, MEMBER_2_DIR, MEMBER_1_DIR):
        path = str(directory)
        if path not in sys.path:
            sys.path.insert(0, path)

    # Member 1 loads its TLE and ephemeris files relative to the project root.
    os.chdir(ROOT)
    _configured = True


def missing_inputs() -> list[str]:
    """List required files that are not present, as project-relative paths."""
    required = [SNAPSHOTS_PATH, TLE_PATH, EPHEMERIS_PATH]
    return [str(p.relative_to(ROOT)) for p in required if not p.exists()]
