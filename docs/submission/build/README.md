# Submission build scripts

All outputs land in `docs/submission/`. Run from the repository root.

| Script | Output |
|---|---|
| `screenshots.mjs <baseUrl> [issueId stationId]` | `assets/*.png` from a running app (use a scratch preview with the month seed, paused, providers forced off). |
| `build-deck.py` | `ResponseCompass-deck.pptx` and `ResponseCompass-deck.pdf` from one slide spec. |
| `render-pdf.mjs <pdf> <outDir>` | PNG per PDF page, for visual checks. |
| `record-video.mjs <baseUrl> <issueId> <stationId>` | `ResponseCompass-demo.webm` (1920×1080, burned-in captions). `FRAMES=<dir>` also saves a still per caption for checking. |
| `wall-screens.mjs <baseUrl>` | `assets/screen-*.png`: each wall-display screen at 1600×900, read-only. |
| `record-shots.mjs <baseUrl> <issueId> <stationId>` | `assets/compass-record.png`, `fix-record.png`, `staffing.png` (needs a pending staffing recommendation), read-only. |

`build-deck.py` needs python-pptx, lxml, Pillow and reportlab. This host has no pip, so the
wheels were unpacked into the git-ignored `.cache/pylib`:
`PYTHONPATH=.cache/pylib python3 docs/submission/build/build-deck.py`.
`render-pdf.mjs` needs pdf.js: `npm install --prefix .cache/pdfjs pdfjs-dist@4.10.38`.

The architecture diagram (slide 4) uses native shapes; every arrow is a straight connector
glued to connection sites on both nodes (`a:stCxn` / `a:endCxn`), so moving a node in
PowerPoint keeps its arrows attached. The PDF is drawn from the same geometry with
reportlab (DejaVu Sans); for a pixel-exact PDF with Inter, export the .pptx from PowerPoint.

Screenshots and the video were taken from a paused scratch copy of the 3200 app's
e8-aura-p1 room after a live AMD capture (preview on port 3013, `NODE_ENV=test`, both
`COMPASS_*_MODE=force-failure`, no key), featuring ISS-3642 at EQ-03. Playwright's bundled
encoder writes VP8 WebM only, with no audio.
