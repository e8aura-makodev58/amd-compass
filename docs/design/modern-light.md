# ResponseCompass visual design — Modern light

This is the current visual system, replacing [Engineering print](engineering-print.md).
ResponseCompass is the product; Compass is the recommendation agent. The theme changes
presentation only: existing IDs, classes, ARIA attributes and application behavior stay.

## Tokens

`frontend/tokens.css` is the source of truth. Existing `--paper*` and `--ink*` names remain
for compatibility with the area stylesheets and Dockview; their colours now describe
cool-grey backgrounds and white surfaces. Do not hard-code colours or fonts in area CSS.

| Token | Value | Use |
|---|---|---|
| `--paper` | `#F4F6FA` | Cool-grey page background. |
| `--paper-raised` | `#FFFFFF` | Cards, panels, inputs and tables. |
| `--paper-sunk` | `#EDF0F5` | Recessed controls, table headings and hover. |
| `--ink` | `#111827` | Primary text. |
| `--ink-2` | `#475467` | Secondary text. |
| `--ink-3` | `#566274` | Labels, axes and inactive tabs. |
| `--muted` | `#5B6677` | Off-shift, unavailable and insufficient-data text. |
| `--rule` | `#E3E7EE` | Subtle dividers and card borders. |
| `--rule-strong` | `#C8CFDB` | Input and control borders. |
| `--accent` | `#4F46E5` | Indigo primary actions, selected controls and focus. |
| `--accent-ink` | `#4338CA` | Indigo text and primary-button hover. |
| `--accent-wash` | `#EEF0FF` | Selection tint. |
| `--on-accent` | `#FFFFFF` | Text on solid accent / accent-ink buttons only. |
| `--danger`, `--danger-ink`, `--danger-wash` | `#DC3545`, `#B42330`, `#FDECEE` | Issues and alerts: marks, text and background respectively. |
| `--ok`, `--ok-ink` | `#16A34A`, `#0F7A3C` | Available/resolved marks and text. |
| `--info` | `#0369A1` | Offered / in-progress text and marks. |
| `--warn`, `--warn-ink` | `#D97706`, `#8F4A0B` | Assigned/moderate/partial marks and text. |
| `--font-sans` | Inter Variable, system sans fallbacks | UI copy, headings and labels. |
| `--font-mono` | JetBrains Mono Variable, system mono fallbacks | Figures, IDs, times and tabular evidence. |
| `--radius`, `--radius-sm` | `10px`, `6px` | Cards and ordinary controls. |
| `--radius-pill` | `999px` | Chips and segmented controls. |
| `--shadow-sm` | `0 1px 2px rgba(16,24,40,.06)` | Subtle card elevation. |
| `--shadow-md` | `0 8px 24px rgba(16,24,40,.12)` | Search palette / map controls. |
| `--focus-ring` | `0 0 0 3px rgba(79,70,229,.3)` | Input focus halo, paired with a solid accent border. |

## Rules

1. **White surfaces on cool grey.** Group related content with spacing, soft 1px borders
   and restrained shadows. Use 6–10px corners for cards and controls; pills for segments.
2. **One primary accent.** Indigo means a forward action, a selected control or focus.
   Status red/green/blue/amber carries operational meaning and does not compete as a
   decorative large fill. Keep issue indicators visibly distinct from selection.
3. **Type has a purpose.** Inter is the UI face, including normal-case labels and headings.
   JetBrains Mono carries numbers, IDs and times with tabular figures. Avoid dense uppercase
   drawing annotations. Headings use clear weight and a compact letter spacing.
4. **Modern controls.** Mode, settings and sidebar choices use segmented tracks with a
   clear active pill. Inputs/selects share borders, rounded corners and visible focus.
   Secondary buttons stay outlined; primary actions use accent with `--on-accent` text.
5. **AA contrast.** Paper-facing text must reach 4.5:1 on every page/card/recessed/selection/
   status surface. The test covers all five light surfaces plus white inverse text on both
   primary-button backgrounds. Use status `-ink` tokens for text. Disabled controls are
   visually quiet; do not fade ordinary labels to convey missing evidence.
6. **Tables and charts.** Tables have recessed headings, row dividers and right-aligned
   figures. Charts stay token-driven and retain dates, completeness labels and sample-size
   safeguards. Long series/tables scroll locally rather than stretching the page.
7. **Keyboard focus stays visible.** Buttons and map nodes use a solid accent outline.
   Inputs use an accent border plus the focus halo. Dockview retains its focusable splitters.
8. **Shared behavior.** Live and Offline use the same styling. The 3D scene, tiling engine,
   narrow-screen document flow, DOM identities and render lifecycle remain intact.
9. **Assets are local.** Inter and JetBrains Mono come from pinned Fontsource packages
   (`5.3.0`, SIL OFL 1.1). `scripts/vendor/fonts.mjs` copies only Latin variable-weight normal
   and italic WOFF2 faces and their CSS/licences into `frontend/vendor/fonts/`. `tokens.css`
   imports that CSS. `npm run vendor` regenerates them alongside Dockview; no CDN or remote
   font request is allowed. Static `.woff2` files are served as `font/woff2`.

## Ownership

| Files | Owner during this round |
|---|---|
| `tokens.css`, `base.css`, `floor.css`, `panel.css`, `ops.css`, `analytics.css` | Gemini theme task (completed by Codex at the user's request). |
| `vendor/fonts/`, `scripts/vendor/fonts.mjs`, this spec | Gemini theme task. |
| `layout.css`, `tiling.*`, `index.html`, Dockview vendor module | Codex tiling task; theme consumes their shared-token interfaces. |
| Static MIME types, vendor runner, dependency pins | Main agent's integration scaffold. |
