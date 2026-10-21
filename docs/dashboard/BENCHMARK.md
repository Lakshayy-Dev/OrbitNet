# Rendering benchmark

## What was measured

`benchmark/compare_render.py` loads Member 3's existing Plotly animation
(`results/member3/orbitnet_simulation.html`) and the new viewer in the same
Chromium build, at 1440 × 900, and measures both the same way:

- load time until the plot or 3D view is ready;
- browser frame rate (requestAnimationFrame intervals) while each plays its
  animation;
- time to advance through all saved snapshots, one by one, with rendering.

The new viewer also has a built-in benchmark (**Benchmark** in the Network
viewer): 20 s of playback at 2 snapshots/s while the camera orbits, reporting
average, median and 1 %-low frame rates, the 95th-percentile frame time, draw
calls and the GPU name. It can save the result as JSON.

## Results so far: cloud VM, software rendering

Recorded on 20 Oct 2026 on a 2-CPU Linux VM **with no GPU**: Chromium 141
headless, SwiftShader software rendering. Raw output:
`benchmark/sandbox-swiftshader-2026-10-20.json`.

| | Plotly (existing) | WebGL viewer (new) | Ratio |
|---|---|---|---|
| Load until ready | 35.8 s | 7.0 s | 5.1× faster |
| Frame rate while playing | 0.58 fps | 1.84 fps (built-in benchmark, camera orbiting) | 3.2× |
| Median time per snapshot change | 3.33 s | 1.03 s | 3.2× faster |
| Draw calls per frame | n/a | 11 | |
| Satellites / links / triangles drawn | 10,706 points, 1,876 links (sampled for Plotly) | 10,706 points, 13,099 links, 36,602 triangles | |

**These absolute numbers are not what a laptop will show.** Every pixel here
is computed on two CPU cores. The comparison is fair, with the same browser,
machine and resolution, and the WebGL viewer draws seven times more links than
the Plotly version while still running about three times faster. On the VM the
WebGL frame time is dominated by software rasterisation, not by the
application's own work: per frame the JavaScript updates one uniform and about
15 route points.

## Still to measure: a typical laptop

The ~30 fps target has **not** been measured on real hardware yet. To measure:

1. Run the API and `npm run build && npm run preview` (see the project README).
2. Open <http://localhost:4173/viewer> in Chrome or Edge with hardware
   acceleration on. Plug in the laptop's power supply.
3. Click **Benchmark → Run benchmark** and keep the tab in front for 20 s.
4. Click **Save result as JSON** and add the file to `docs/dashboard/benchmark/`.

Or run the comparison against the real GPU:

```bash
pip install playwright && python -m playwright install chromium
python docs/dashboard/benchmark/compare_render.py results/member3/orbitnet_simulation.html --gpu --headed
```

## Why it is faster

| Plotly animation | WebGL viewer |
|---|---|
| Each frame passes full trace data through Plotly's update and layout pipeline. | Earth, textures and geometry are uploaded once. |
| Points and lines are separate traces rebuilt per frame. | All satellites: one `Points` draw; link sample: one `LineSegments` draw. Both share the same GPU position buffers. |
| Motion only at snapshots (frame duration 1.1 s). | Satellites move between snapshots on the GPU (one uniform per frame); a new snapshot uploads ~260 KB. |
| Background links sampled to 1,876. | The 13,000-link saved sample is drawn; picking is done on demand on the CPU. |
