# Vendor modules

One module per third-party browser library: `scripts/vendor/<name>.mjs`, whose default
export is `async (helpers) => { … }`. `npm run vendor` runs every module in name order.
Helpers (see `scripts/vendor-frontend.mjs`): `copy(pkg, from, to)`, `writeText(to, text)`,
`readText(pkg, path)`, `packageVersion(pkg)`, `packageDir(pkg)`, `clean(dir)`; destination
paths are relative to `frontend/vendor/`. Each module writes `frontend/vendor/<name>/README.md`
(version, source paths, licence) and copies the package licence alongside the files.
