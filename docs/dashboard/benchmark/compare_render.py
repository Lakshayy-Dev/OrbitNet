"""Compare the existing Plotly animation with the new WebGL viewer in the
same browser, measured the same way.

Requires: pip install playwright && python -m playwright install chromium
Start the API and `npm run preview` first, then from the project root:

    python docs/dashboard/benchmark/compare_render.py results/member3/orbitnet_simulation.html
    python docs/dashboard/benchmark/compare_render.py results/member3/orbitnet_simulation.html --gpu --headed

Without --gpu the browser uses software rendering (SwiftShader), which makes
absolute numbers far lower than on a laptop GPU but keeps the comparison fair
on machines without one.

Metrics, both measured the same way:
* Plotly: time to advance through all 20 snapshot frames as fast as Plotly
  can (Plotly.animate with zero frame and transition duration), plus the
  browser frame rate (requestAnimationFrame) while its own Play button runs.
* WebGL viewer: the built-in 20 s benchmark (playback at 2 steps/s while the
  camera orbits), plus the time to step through all 20 snapshots with
  rendering in between.
"""
import argparse
import json
import os
import sys

from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument("plotly_html", help="path to Member 3's orbitnet_simulation.html")
ap.add_argument("--app", default="http://127.0.0.1:4173", help="dashboard URL (npm run preview)")
ap.add_argument("--gpu", action="store_true", help="use the real GPU instead of SwiftShader")
ap.add_argument("--headed", action="store_true", help="show the browser window")
opts = ap.parse_args()
PLOTLY_HTML = os.path.abspath(opts.plotly_html)
APP = opts.app
ARGS = ["--ignore-gpu-blocklist"] if opts.gpu else [
    "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
VIEW = {"width": 1440, "height": 900}

RAF_PROBE = """
(seconds) => new Promise(res => {
  const t = []; const start = performance.now();
  function f(now) { t.push(now); if (now - start < seconds * 1000) requestAnimationFrame(f); else {
    const d = []; for (let i = 1; i < t.length; i++) d.push(t[i] - t[i-1]); d.sort((a,b)=>a-b);
    const avg = d.reduce((a,b)=>a+b,0)/d.length;
    res({ frames: d.length, avgFps: 1000/avg, medianFps: 1000/d[Math.floor(d.length/2)], low1Fps: 1000/d[Math.min(d.length-1, Math.floor(d.length*0.99))], maxFrameMs: d[d.length-1] });
  }}
  requestAnimationFrame(f);
})
"""

out = {}
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS, headless=not opts.headed)

    # ---------------- Plotly (existing) ----------------
    pg = b.new_page(viewport=VIEW)
    import time
    t0 = time.time()
    pg.goto(f"file://{PLOTLY_HTML}", wait_until="load", timeout=300000)
    pg.wait_for_function("() => document.querySelector('.js-plotly-plot') && document.querySelector('.js-plotly-plot')._fullLayout", timeout=300000)
    out["plotly_load_s"] = round(time.time() - t0, 1)
    pg.wait_for_timeout(3000)
    out["plotly_idle"] = pg.evaluate(RAF_PROBE, 5)
    # As fast as possible through all frames.
    res = pg.evaluate("""
    () => new Promise(async (resolve) => {
      const gd = document.querySelector('.js-plotly-plot');
      const names = gd._transitionData._frames.map(f => f.name);
      const t0 = performance.now(); const per = [];
      for (const n of names) {
        const s = performance.now();
        await Plotly.animate(gd, [n], {frame: {duration: 0, redraw: true}, transition: {duration: 0}, mode: 'immediate'});
        await new Promise(r => requestAnimationFrame(() => r()));
        per.push(performance.now() - s);
      }
      per.sort((a,b)=>a-b);
      resolve({ frames: names.length, total_ms: performance.now() - t0, median_ms_per_snapshot: per[Math.floor(per.length/2)], max_ms_per_snapshot: per[per.length-1] });
    })
    """)
    out["plotly_step_all"] = res
    # Frame rate while the page's own Play animation runs.
    pg.evaluate("""() => { const gd = document.querySelector('.js-plotly-plot');
      Plotly.animate(gd, null, {frame: {duration: 1100, redraw: true}, transition: {duration: 250}, fromcurrent: false, mode: 'immediate'}); }""")
    out["plotly_playing"] = pg.evaluate(RAF_PROBE, 10)
    pg.close()

    # ---------------- WebGL viewer (new) ----------------
    pg = b.new_page(viewport=VIEW)
    t0 = time.time()
    pg.goto(f"{APP}/viewer", wait_until="networkidle", timeout=120000)
    pg.wait_for_selector("text=Benchmark", timeout=120000)
    pg.wait_for_timeout(4000)
    out["webgl_load_s"] = round(time.time() - t0, 1)
    out["webgl_idle"] = pg.evaluate(RAF_PROBE, 5)
    # Step through all 20 snapshots with the arrow key, rendering each.
    res = pg.evaluate("""
    () => new Promise(async (resolve) => {
      const per = []; const t0 = performance.now();
      for (let i = 0; i < 19; i++) {
        const s = performance.now();
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
        per.push(performance.now() - s);
      }
      per.sort((a,b)=>a-b);
      resolve({ frames: 19, total_ms: performance.now() - t0, median_ms_per_snapshot: per[Math.floor(per.length/2)], max_ms_per_snapshot: per[per.length-1] });
    })
    """)
    out["webgl_step_all"] = res
    pg.click("button:has-text('Benchmark')")
    pg.click("button:has-text('Run benchmark')")
    pg.wait_for_function("() => localStorage.getItem('orbitnet-benchmark')", timeout=120000)
    out["webgl_benchmark"] = json.loads(pg.evaluate("localStorage.getItem('orbitnet-benchmark')"))
    pg.close()
    b.close()

print(json.dumps(out, indent=1))
