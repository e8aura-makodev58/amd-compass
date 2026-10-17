# Local UI fonts

Inter Variable and JetBrains Mono Variable, each from the pinned Fontsource package version 5.3.0 (SIL Open Font License 1.1).

Only Latin variable-weight WOFF2 normal and italic faces are copied from each package's files/ directory. fonts.css extracts the matching @font-face blocks from wght.css and wght-italic.css, rewriting their URLs to this folder. The two LICENSE-*.txt files are copied verbatim from the packages.

Regenerate with npm ci and npm run vendor (scripts/vendor/fonts.mjs). tokens.css imports fonts.css; no CDN, remote font URL or runtime provider call is needed.
