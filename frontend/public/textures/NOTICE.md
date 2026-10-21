# Texture sources

These images are visual approximations used only for rendering. They are not
data inputs to any OrbitNet computation.

| File | Content |
|---|---|
| earth-blue-marble.jpg | Daytime Earth, equirectangular, 4096 × 2048, longitude −180° at the left edge |
| earth-night.jpg | City lights at night, same projection |
| earth-water.png | Ocean mask, used for sun glint |
| night-sky.png | Star field background (decorative; not aligned to real stars) |

All four are copied unchanged from the example images of the `three-globe`
npm package, version 2.45.6 (`example/img/`), which is MIT-licensed
(© 2019 Vasco Asturiano). They are bundled so the dashboard runs offline.

The package does not state the original source of the imagery. The day and
night maps look like NASA's Blue Marble and Black Marble products, which NASA
publishes for free use, but that has not been confirmed. For anything beyond
an academic presentation, replace them with imagery downloaded directly from
NASA Visible Earth, keeping the same file names and projection.
