# Dockview

Vendored `dockview-core@8.3.1` (MIT), from the pinned npm dependency.

- `dockview.js`: `node_modules/dockview-core/dist/package/main.esm.min.mjs`, renamed to `.js` for the static server's JavaScript MIME type.
- `dockview.css`: the exact CSS string injected by `node_modules/dockview-core/dist/dockview-core.js`, extracted without running that bundle. The ESM build does not inject CSS.
- `LICENCE.md`: copied from the package.

Regenerate with `npm ci && npm run vendor`. Only `frontend/tiling.js` imports the library.
Upstream: https://github.com/dockview/dockview
