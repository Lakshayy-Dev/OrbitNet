
"""OrbitNet interactive 3D visualization — dark mission-control style."""

from __future__ import annotations

import math
from pathlib import Path

import numpy as np
import plotly.graph_objects as go


EARTH_RADIUS_KM = 6378.137

BG = "#050914"
PANEL = "#0B1220"
TEXT = "#DCE8F8"
CYAN = "#42D9FF"
VIOLET = "#B47AFF"
SUNLIT = "#FFB45C"
ECLIPSED = "#64748B"
LINK = "#29445F"


def earth_surface(resolution=100):
    """Create a spherical Earth with stylized ocean and land coloring."""
    lat = np.linspace(-math.pi / 2, math.pi / 2, resolution)
    lon = np.linspace(-math.pi, math.pi, resolution)

    lo, la = np.meshgrid(lon, lat)

    r = EARTH_RADIUS_KM
    x = r * np.cos(la) * np.cos(lo)
    y = r * np.cos(la) * np.sin(lo)
    z = r * np.sin(la)

    # Procedural continent-like regions for a textured appearance.
    # These are decorative, not a geographically accurate Earth map.
    land = np.zeros_like(la)

    continents = [
        (-1.75, 0.60, 0.48, 0.45),
        (-1.20, 0.15, 0.38, 0.55),
        (-0.35, 0.75, 0.60, 0.25),
        (0.25, 0.10, 0.42, 0.62),
        (1.05, 0.50, 0.65, 0.30),
        (1.85, -0.20, 0.42, 0.45),
        (2.55, 0.25, 0.45, 0.38),
        (-2.65, -0.35, 0.36, 0.43),
        (0.75, -0.70, 0.35, 0.30),
    ]

    for lon0, lat0, lon_width, lat_width in continents:
        lon_delta = np.angle(np.exp(1j * (lo - lon0)))
        blob = np.exp(
            -(
                (lon_delta / lon_width) ** 2
                + ((la - lat0) / lat_width) ** 2
            )
        )
        land = np.maximum(land, blob)

    # Subtle variation in ocean and land colors.
    texture = (
        0.5
        + 0.18 * np.sin(5 * lo + 2 * la)
        + 0.10 * np.cos(8 * la - 3 * lo)
    )

    surface_color = np.where(
        land > 0.43,
        0.72 + 0.18 * texture,
        0.12 + 0.16 * texture,
    )

    return x, y, z, surface_color


def _xyz(G, nodes):
    return (
        [float(G.nodes[n]["x"]) for n in nodes],
        [float(G.nodes[n]["y"]) for n in nodes],
        [float(G.nodes[n]["z"]) for n in nodes],
    )


def _line_trace(G, edges, name, color, width, opacity):
    xs, ys, zs = [], [], []

    for u, v in edges:
        if u not in G or v not in G:
            continue

        xs.extend([G.nodes[u]["x"], G.nodes[v]["x"], None])
        ys.extend([G.nodes[u]["y"], G.nodes[v]["y"], None])
        zs.extend([G.nodes[u]["z"], G.nodes[v]["z"], None])

    return go.Scatter3d(
        x=xs,
        y=ys,
        z=zs,
        mode="lines",
        line=dict(color=color, width=width),
        opacity=opacity,
        name=name,
        hoverinfo="skip",
    )


def _earth_traces():
    ex, ey, ez, colors = earth_surface()

    earth = go.Surface(
        x=ex,
        y=ey,
        z=ez,
        surfacecolor=colors,
        colorscale=[
            [0.0, "#07172C"],
            [0.35, "#103B69"],
            [0.50, "#165A91"],
            [0.68, "#27765C"],
            [0.82, "#57946D"],
            [1.0, "#A7B98A"],
        ],
        cmin=0,
        cmax=1,
        showscale=False,
        opacity=1,
        name="Earth",
        hoverinfo="skip",
        lighting=dict(
            ambient=0.40,
            diffuse=0.85,
            specular=0.35,
            roughness=0.75,
            fresnel=0.15,
        ),
        lightposition=dict(x=100000, y=30000, z=50000),
    )

    # A larger translucent shell gives the globe a soft atmospheric edge.
    r = EARTH_RADIUS_KM * 1.025
    lat = np.linspace(-math.pi / 2, math.pi / 2, 42)
    lon = np.linspace(-math.pi, math.pi, 64)
    lo, la = np.meshgrid(lon, lat)

    atmosphere = go.Surface(
        x=r * np.cos(la) * np.cos(lo),
        y=r * np.cos(la) * np.sin(lo),
        z=r * np.sin(la),
        surfacecolor=np.ones_like(la),
        colorscale=[[0, "#238BFD"], [1, "#238BFD"]],
        showscale=False,
        opacity=0.10,
        name="Atmosphere",
        hoverinfo="skip",
        lighting=dict(ambient=1, diffuse=0, specular=0, roughness=1),
    )

    return [earth, atmosphere]


def snapshot_figure(snapshot, show_links=True):
    G = snapshot["graph"]
    route = snapshot.get("gnn_route") or []

    route_edges = {
        frozenset((u, v))
        for u, v in zip(route[:-1], route[1:])
    }

    fig = go.Figure()
    for trace in _earth_traces():
        fig.add_trace(trace)

    sunlit = [
        n for n in G.nodes
        if not G.nodes[n].get("eclipsed", False)
    ]
    eclipsed = [
        n for n in G.nodes
        if G.nodes[n].get("eclipsed", False)
    ]

    for nodes, name, color in (
        (sunlit, "Sunlit satellites", SUNLIT),
        (eclipsed, "Eclipsed satellites", ECLIPSED),
    ):
        x, y, z = _xyz(G, nodes)

        fig.add_trace(go.Scatter3d(
            x=x,
            y=y,
            z=z,
            mode="markers",
            marker=dict(
                size=3.2,
                color=color,
                opacity=0.92,
                line=dict(color="#FFFFFF", width=0.3),
            ),
            name=name,
            text=nodes,
            customdata=[
                G.nodes[n].get("energy", None) for n in nodes
            ],
            hovertemplate=(
                "<b>%{text}</b>"
                "<br>Energy: %{customdata}"
                "<extra></extra>"
            ),
        ))

    if show_links:
        normal_edges = [
            (u, v)
            for u, v in G.edges
            if frozenset((u, v)) not in route_edges
        ]

        fig.add_trace(_line_trace(
            G,
            normal_edges,
            "Communication links",
            LINK,
            1.1,
            0.42,
        ))

    if route:
        route_edges_list = list(zip(route[:-1], route[1:]))

        fig.add_trace(_line_trace(
            G,
            route_edges_list,
            "Selected GNN route",
            VIOLET,
            6,
            1,
        ))

        # Larger endpoint markers make the selected path easy to follow.
        endpoints = [route[0], route[-1]]
        x, y, z = _xyz(G, endpoints)

        fig.add_trace(go.Scatter3d(
            x=x,
            y=y,
            z=z,
            mode="markers+text",
            marker=dict(
                size=7,
                color=[CYAN, VIOLET],
                line=dict(color="white", width=1.2),
            ),
            text=["SOURCE", "DESTINATION"],
            textposition="top center",
            textfont=dict(color=TEXT, size=10),
            name="Route endpoints",
            hovertemplate="%{text}<extra></extra>",
        ))

    # Use the actual coordinate scale; do not distort satellite positions.
    coords = [
        abs(float(G.nodes[n][axis]))
        for n in G.nodes
        for axis in ("x", "y", "z")
        if G.nodes[n].get(axis) is not None
    ]
    max_coord = max(coords, default=EARTH_RADIUS_KM * 2)
    axis_limit = max(max_coord * 1.08, EARTH_RADIUS_KM * 1.4)

    timestamp = snapshot.get("timestamp", "")
    step = snapshot.get("step", 0)

    fig.update_layout(
        title=dict(
            text=(
                f"<b>ORBITNET</b>  <sup>LEO ROUTING SIMULATION</sup>"
                f"<br><span style='font-size:12px;color:#91A7C5'>"
                f"STEP {step}  ·  {timestamp}</span>"
            ),
            x=0.04,
            xanchor="left",
            font=dict(size=22, color=TEXT),
        ),
        paper_bgcolor=BG,
        plot_bgcolor=BG,
        font=dict(
            family="Arial, sans-serif",
            color=TEXT,
            size=12,
        ),
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=0.02,
            xanchor="center",
            x=0.5,
            bgcolor="rgba(11,18,32,0.75)",
            bordercolor="#263850",
            borderwidth=1,
        ),
        scene=dict(
            bgcolor=BG,
            aspectmode="data",
            xaxis=dict(
                title="X (km)",
                range=[-axis_limit, axis_limit],
                backgroundcolor=BG,
                gridcolor="#1C2B40",
                zerolinecolor="#30435D",
                color="#8FA6C4",
                showbackground=True,
            ),
            yaxis=dict(
                title="Y (km)",
                range=[-axis_limit, axis_limit],
                backgroundcolor=BG,
                gridcolor="#1C2B40",
                zerolinecolor="#30435D",
                color="#8FA6C4",
                showbackground=True,
            ),
            zaxis=dict(
                title="Z (km)",
                range=[-axis_limit, axis_limit],
                backgroundcolor=BG,
                gridcolor="#1C2B40",
                zerolinecolor="#30435D",
                color="#8FA6C4",
                showbackground=True,
            ),
            camera=dict(
                eye=dict(x=1.65, y=1.65, z=1.15),
                projection=dict(type="perspective"),
            ),
        ),
        margin=dict(l=0, r=0, t=100, b=35),
        height=850,
        showlegend=True,
    )

    return fig


def save_snapshot(snapshot, path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    fig = snapshot_figure(snapshot)
    fig.write_html(
        str(path),
        include_plotlyjs="cdn",
        full_html=True,
        config={
            "responsive": True,
            "displaylogo": False,
            "scrollZoom": True,
        },
    )
