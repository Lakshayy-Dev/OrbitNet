
"""OrbitNet: presentation-focused 3D satellite routing animation."""

from __future__ import annotations

from itertools import islice
from math import ceil
from pathlib import Path

import plotly.graph_objects as go

from visualization import (
    BG,
    TEXT,
    CYAN,
    VIOLET,
    SUNLIT,
    ECLIPSED,
    LINK,
    _earth_traces,
    _line_trace,
)

# Keep the rendered scene lightweight enough for browser playback.
MAX_BACKGROUND_LINKS = 2000
SATELLITE_MARKER_SIZE = 2.3


def build_animation(snapshots, output_path):
    if not snapshots:
        raise ValueError("No snapshots supplied.")

    def satellite_trace(graph, eclipsed):
        nodes = [
            node for node, data in graph.nodes(data=True)
            if bool(data.get("eclipsed", False)) == eclipsed
        ]

        return go.Scatter3d(
            x=[graph.nodes[n]["x"] for n in nodes],
            y=[graph.nodes[n]["y"] for n in nodes],
            z=[graph.nodes[n]["z"] for n in nodes],
            mode="markers",
            marker=dict(
                size=SATELLITE_MARKER_SIZE,
                color=ECLIPSED if eclipsed else SUNLIT,
                opacity=0.82,
            ),
            text=[str(n) for n in nodes],
            name="Eclipsed satellites" if eclipsed else "Sunlit satellites",
            hovertemplate="%{text}<extra></extra>",
        )

    def route_trace(graph, route):
        route = route or []
        edges = list(zip(route[:-1], route[1:]))

        trace = _line_trace(
            graph,
            edges,
            "Selected GNN route",
            CYAN,
            8,
            1.0,
        )

        return trace

    def endpoint_trace(graph, route):
        route = route or []
        if not route:
            return go.Scatter3d(
                x=[], y=[], z=[],
                mode="markers",
                name="Source and destination",
            )

        endpoints = [route[0], route[-1]]
        return go.Scatter3d(
            x=[graph.nodes[n]["x"] for n in endpoints],
            y=[graph.nodes[n]["y"] for n in endpoints],
            z=[graph.nodes[n]["z"] for n in endpoints],
            mode="markers+text",
            marker=dict(
                size=7,
                color=[CYAN, VIOLET],
                symbol=["circle", "diamond"],
                line=dict(color="#FFFFFF", width=1),
            ),
            text=["SOURCE", "DESTINATION"],
            textposition="top center",
            textfont=dict(size=11, color="#FFFFFF"),
            name="Source / destination",
            hovertemplate="%{text}<extra></extra>",
        )

    first = snapshots[0]
    first_graph = first["graph"]
    first_route = first.get("gnn_route") or []

    # The Earth and atmosphere are static; they are not rebuilt each frame.
    earth_traces = _earth_traces()

    # Build the background communication network once. It is a faint visual
    # reference, not a replacement for the actual graph used by the routers.
    total_edges = first_graph.number_of_edges()
    stride = max(1, ceil(total_edges / MAX_BACKGROUND_LINKS))

    background_edges = list(
        islice(first_graph.edges, 0, None, stride)
    )

    background_links = _line_trace(
        first_graph,
        background_edges,
        "Background communication links (sampled)",
        LINK,
        0.8,
        0.12,
    )

    # Keep fixed scene indices:
    # 0..1 Earth/atmosphere, 2 background links,
    # 3 sunlit satellites, 4 eclipsed satellites,
    # 5 selected route, 6 endpoints.
    base_traces = earth_traces + [
        background_links,
        satellite_trace(first_graph, False),
        satellite_trace(first_graph, True),
        route_trace(first_graph, first_route),
        endpoint_trace(first_graph, first_route),
    ]

    fig = go.Figure(data=base_traces)
    frames = []

    # Update only the satellites and selected route.
    # Earth, atmosphere and background links remain fixed, reducing redraw cost.
    for snapshot in snapshots:
        graph = snapshot["graph"]
        route = snapshot.get("gnn_route") or []

        frames.append(
            go.Frame(
                name=str(snapshot["step"]),
                data=[
                    satellite_trace(graph, False),
                    satellite_trace(graph, True),
                    route_trace(graph, route),
                    endpoint_trace(graph, route),
                ],
                traces=[3, 4, 5, 6],
                layout=go.Layout(
                    title=dict(
                        text=(
                            "<b>ORBITNET</b>  "
                            "<span style='font-size:14px'>"
                            "LEO SATELLITE ROUTING</span>"
                            f"<br><span style='font-size:12px;color:#9CB4D0'>"
                            f"STEP {snapshot['step']} · "
                            f"{snapshot['timestamp']}</span>"
                        )
                    )
                ),
            )
        )

    fig.frames = frames

    # Use equal axis ranges so the 3D scene doesn't stretch the globe.
    max_coordinate = 0.0
    for snapshot in snapshots:
        for _, data in snapshot["graph"].nodes(data=True):
            for axis in ("x", "y", "z"):
                value = data.get(axis)
                if value is not None:
                    max_coordinate = max(
                        max_coordinate, abs(float(value))
                    )

    axis_limit = max(max_coordinate * 1.04, 9000)

    fig.update_layout(
        title=dict(
            text=(
                "<b>ORBITNET</b>  "
                "<span style='font-size:14px'>"
                "LEO SATELLITE ROUTING</span>"
                f"<br><span style='font-size:12px;color:#9CB4D0'>"
                f"STEP {first['step']} · {first['timestamp']}</span>"
            ),
            x=0.035,
            xanchor="left",
            font=dict(size=22, color=TEXT),
        ),
        paper_bgcolor=BG,
        plot_bgcolor=BG,
        font=dict(family="Arial, sans-serif", color=TEXT, size=12),
        scene=dict(
            bgcolor=BG,
            aspectmode="cube",
            xaxis=dict(
                title="X (km)",
                range=[-axis_limit, axis_limit],
                backgroundcolor=BG,
                gridcolor="#1C2B40",
                zerolinecolor="#30445F",
                color="#8FA6C4",
                showbackground=True,
            ),
            yaxis=dict(
                title="Y (km)",
                range=[-axis_limit, axis_limit],
                backgroundcolor=BG,
                gridcolor="#1C2B40",
                zerolinecolor="#30445F",
                color="#8FA6C4",
                showbackground=True,
            ),
            zaxis=dict(
                title="Z (km)",
                range=[-axis_limit, axis_limit],
                backgroundcolor=BG,
                gridcolor="#1C2B40",
                zerolinecolor="#30445F",
                color="#8FA6C4",
                showbackground=True,
            ),
            camera=dict(
                eye=dict(x=1.25, y=1.25, z=0.90),
                projection=dict(type="orthographic"),
            ),
            dragmode="orbit",
        ),
        updatemenus=[
            dict(
                type="buttons",
                direction="left",
                x=0.035,
                y=0.96,
                bgcolor="#101C2D",
                bordercolor="#30445F",
                font=dict(color=TEXT),
                buttons=[
                    dict(
                        label="▶ Play",
                        method="animate",
                        args=[
                            None,
                            dict(
                                mode="immediate",
                                frame=dict(duration=1100, redraw=True),
                                transition=dict(duration=250),
                                fromcurrent=True,
                            ),
                        ],
                    ),
                    dict(
                        label="Ⅱ Pause",
                        method="animate",
                        args=[
                            [None],
                            dict(
                                mode="immediate",
                                frame=dict(duration=0, redraw=False),
                                transition=dict(duration=0),
                            ),
                        ],
                    ),
                ],
            )
        ],
        sliders=[
            dict(
                active=0,
                x=0.08,
                len=0.86,
                y=0.035,
                currentvalue=dict(
                    prefix="Simulation step: ",
                    font=dict(color=TEXT),
                ),
                font=dict(color=TEXT),
                steps=[
                    dict(
                        label=str(snapshot["step"]),
                        method="animate",
                        args=[
                            [str(snapshot["step"])],
                            dict(
                                mode="immediate",
                                frame=dict(duration=0, redraw=True),
                                transition=dict(duration=0),
                            ),
                        ],
                    )
                    for snapshot in snapshots
                ],
            )
        ],
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=0.085,
            xanchor="center",
            x=0.5,
            bgcolor="rgba(11,18,32,0.85)",
            bordercolor="#263850",
            borderwidth=1,
            font=dict(size=11),
        ),
        margin=dict(l=0, r=0, t=100, b=45),
        height=850,
    )

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    fig.write_html(
        str(output_path),
        include_plotlyjs=True,
        full_html=True,
        config={
            "responsive": True,
            "displaylogo": False,
            "scrollZoom": True,
        },
    )

    print(f"Animation saved to: {output_path}")
    print(f"Snapshots animated: {len(snapshots)}")
    print(f"Background links rendered: {len(background_edges)}")
