# Submission build scripts

All outputs land in `docs/submission/`. Run from the repository root.

| Script | Output |
|---|---|
| `screenshots.mjs <baseUrl>` | `assets/*.png` from a running app (use a scratch preview with the month seed, paused, providers forced off). |
| `build-deck.py` | `ResponseCompass-deck.pptx` and `ResponseCompass-deck.pdf` from one slide spec. |
| `render-pdf.mjs <pdf> <outDir>` | PNG per PDF page, for visual checks. |

`build-deck.py` needs python-pptx, lxml, Pillow and reportlab. This host has no pip, so the
wheels were unpacked into the git-ignored `.cache/pylib`:
`PYTHONPATH=.cache/pylib python3 docs/submission/build/build-deck.py`.
`render-pdf.mjs` needs pdf.js: `npm install --prefix .cache/pdfjs pdfjs-dist@4.10.38`.

The architecture diagram (slide 4) uses native shapes; every arrow is a straight connector
glued to connection sites on both nodes (`a:stCxn` / `a:endCxn`), so moving a node in
PowerPoint keeps its arrows attached. The PDF is drawn from the same geometry with
reportlab (DejaVu Sans); for a pixel-exact PDF with Inter, export the .pptx from PowerPoint.
