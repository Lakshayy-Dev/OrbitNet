"""Build an interactive Plotly animation from simulation snapshots."""

from __future__ import annotations

from pathlib import Path
from visualization import EARTH_RADIUS_KM, earth_surface
import plotly.graph_objects as go


def build_animation(snapshots, output_path):
    if not snapshots:
        raise ValueError("No snapshots supplied.")

    ex, ey, ez = earth_surface()
    first = snapshots[0]
    G = first["graph"]

    def satellite_trace(G, eclipsed):
        nodes = [
            n for n in G.nodes
            if bool(G.nodes[n].get("eclipsed", False)) == eclipsed
        ]
        return go.Scatter3d(
            x=[G.nodes[n]["x"] for n in nodes],
            y=[G.nodes[n]["y"] for n in nodes],
            z=[G.nodes[n]["z"] for n in nodes],
            mode="markers",
            marker=dict(size=4),
            text=nodes,
            name="Eclipsed" if eclipsed else "Sunlit",
        )

    earth = go.Surface(x=ex, y=ey, z=ez, opacity=0.55, showscale=False)

    def route_trace(G, route):
        route = route or []
        return go.Scatter3d(
            x=[G.nodes[n]["x"] for n in route],
            y=[G.nodes[n]["y"] for n in route],
            z=[G.nodes[n]["z"] for n in route],
            mode="lines+markers",
            line=dict(width=7),
            marker=dict(size=5),
            name="GNN route",
        )

    fig = go.Figure(
        data=[
            earth,
            satellite_trace(G, False),
            satellite_trace(G, True),
            route_trace(G, first["gnn_route"]),
        ]
    )

    frames = []
    for s in snapshots:
        G = s["graph"]
        frames.append(go.Frame(
            name=str(s["step"]),
            data=[
                earth,
                satellite_trace(G, False),
                satellite_trace(G, True),
                route_trace(G, s["gnn_route"]),
            ],
            layout=go.Layout(
                title=f"OrbitNet — {s['timestamp']}"
            ),
        ))

    fig.frames = frames
    fig.update_layout(
        title="OrbitNet Dynamic Simulation",
        scene=dict(
            xaxis_title="X (km)",
            yaxis_title="Y (km)",
            zaxis_title="Z (km)",
            aspectmode="data",
        ),
        updatemenus=[{
            "type": "buttons",
            "buttons": [
                {
                    "label": "Play",
                    "method": "animate",
                    "args": [None, {"frame": {"duration": 400, "redraw": True}}],
                },
                {
                    "label": "Pause",
                    "method": "animate",
                    "args": [[None], {"frame": {"duration": 0, "redraw": False}}],
                },
            ],
        }],
        sliders=[{
            "steps": [
                {
                    "label": str(s["step"]),
                    "method": "animate",
                    "args": [[str(s["step"])], {"mode": "immediate"}],
                }
                for s in snapshots
            ]
        }],
    )
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    fig.write_html(str(output_path), include_plotlyjs="cdn")
