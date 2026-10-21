"""Answer "which satellites are linked to X at step k?" without rebuilding
the full 1.3-million-edge graph.

The saved snapshots keep every satellite's position but only 1 % of the
links. To list a satellite's complete neighbour set we apply Member 1's own
link rule from ``network_builder`` to the saved positions:

* candidate pairs within ``MAX_LINK_DISTANCE`` (Member 1 uses the same
  ``cKDTree`` radius query), then
* ``network_builder.check_los`` to drop pairs whose link passes through Earth.

These are Member 1's functions and constant, imported, not copied. For the
same positions they give exactly the edge set ``build_network_at_time``
produces; ``backend/scripts/verify_integration.py`` checks this against a
full rebuild. When the full graph for a step is already in memory (after a
Routing Lab request), its real adjacency is used instead.
"""

from __future__ import annotations

import numpy as np
from scipy.spatial import cKDTree

from . import project
from .snapshots import SnapshotStore


def _tree(store: SnapshotStore, step: int) -> cKDTree:
    tree = store._trees.get(step)
    if tree is None:
        pos = store.positions_km[step]
        # Same tree Member 1 builds (all valid, finite positions).
        tree = cKDTree(pos)
        store._trees[step] = tree
        # Keep at most a few trees in memory.
        if len(store._trees) > 4:
            oldest = next(iter(store._trees))
            if oldest != step:
                store._trees.pop(oldest, None)
    return tree


def neighbours_from_link_rule(store: SnapshotStore, step: int, index: int):
    """Return [(neighbour_index, distance_km)] using Member 1's link rule."""
    project.configure()
    from network_builder import check_los, MAX_LINK_DISTANCE  # Member 1

    positions = store.positions_km[step]
    origin = positions[index]
    candidates = _tree(store, step).query_ball_point(origin, r=MAX_LINK_DISTANCE)

    result = []
    for j in candidates:
        if j == index:
            continue
        other = positions[j]
        if not check_los(origin, other):
            continue
        result.append((int(j), float(np.linalg.norm(origin - other))))

    result.sort(key=lambda item: item[1])
    return result


def neighbours_from_graph(G, store: SnapshotStore, sat_id: str):
    """Return [(neighbour_index, distance_km)] from a full Member 1 graph."""
    result = []
    for other in G.neighbors(sat_id):
        j = store.index_of.get(other)
        if j is None:
            continue
        result.append((j, float(G[sat_id][other]["distance"])))
    result.sort(key=lambda item: item[1])
    return result
