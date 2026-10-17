> **Superseded by [Modern light](modern-light.md).** Retained as the historical design reference.

# ResponseCompass visual design — "Engineering print"

Every agent restyling the frontend follows this page so the views look like one product.
The product is **ResponseCompass**; **Compass** remains the name of the recommendation
agent inside it ("Compass recommendation", "Compass vs baselines").

## Idea

The app should read like a technical drawing or a plant schematic printed on warm paper:
ink-black text, hairline rules, square corners, monospaced figures, and **one** strong
accent (safety orange) reserved for things that need attention. It is a deliberate break
from the old dark navy/cyan glass dashboard.

## Tokens

All colours, fonts, and rule weights are CSS custom properties in `frontend/tokens.css`.
**Use the tokens; never hard-code a hex value in an area stylesheet.** If you need a value
that has no token, add the token in `tokens.css` (main agent's file — ask under
"Questions for main" in `handover.md`).

| Token | Value | Use |
|---|---|---|
| `--paper` | `#F4F1EA` | Page background. |
| `--paper-raised` | `#FBFAF6` | Panels, cards, inputs, table bodies. |
| `--paper-sunk` | `#EAE6DC` | Hover, selected rows, table headers, wells. |
| `--ink` | `#141414` | Primary text, strong rules, primary buttons. |
| `--ink-2` | `#4A4843` | Secondary text. |
| `--ink-3` | `#656259` | Tertiary text, labels, axis text. |
| `--rule` | `#141414` at 18% (`rgba(20,20,20,.18)`) | Hairline dividers and panel borders. |
| `--rule-strong` | `#141414` | Section frames, the header rule, focused outlines. |
| `--accent` | `#FF5A1F` | Issue / alert marks, rules and fills; use `--accent-ink` for text. |
| `--accent-ink` | `#B8370A` | Accent-coloured text on paper (meets contrast). |
| `--accent-wash` | `#FFE4D6` | Background tint behind an accent item. |
| `--ok` | `#1E7A4C` | Available / resolved / strong-evidence dots, rules and fills. |
| `--ok-ink` | `#196D43` | Available, resolved and strong-evidence text; AA on all three papers. |
| `--info` | `#1F4FD8` | Offered, in-progress, links. |
| `--warn` | `#B7791F` | Assigned / moderate / partial-data dots, rules and fills. |
| `--warn-ink` | `#8A5A13` | Assigned, moderate evidence and partial-data text; AA on all three papers. |
| `--muted` | `#666660` | Unavailable, off-shift, insufficient data. |
| `--font-sans` | `"IBM Plex Sans", "Helvetica Neue", Arial, sans-serif` | Body text and headings. |
| `--font-mono` | `"IBM Plex Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace` | Numbers, IDs, times, labels. |
| `--radius` | `0` | Corners are square everywhere. `2px` is the maximum, for inputs only. |

Fonts are system/local only. **Do not load web fonts or any external asset**: the app must
work offline and the E2E suite asserts that the page makes no outbound requests.

## Rules

1. **Square, flat, ruled.** No shadows, gradients, glows, blur, or rounded cards. Group
   with hairline rules (`1px solid var(--rule)`) and whitespace, not filled boxes.
2. **Mono for data.** IDs (`ISS-105`, `Engr028`), times, counts, percentages, and table
   figures use `--font-mono` with `font-variant-numeric: tabular-nums`.
3. **Labels look like drawing annotations.** Small labels (the old `.eyebrow`) are
   uppercase `--font-mono`, `.68rem`, letter-spacing `.08em`, colour `--ink-3`.
4. **Headings are plain and heavy.** `--font-sans`, weight 600–700, tight letter-spacing,
   `--ink`. No coloured headings.
5. **One accent.** `--accent` marks issues and the single primary action of a view. Do not
   use it decoratively. Status colours (`--ok`, `--info`, `--warn`, `--muted`) appear only
   on small marks (dots, chips, a left rule) or text, never as large fills.
6. **Buttons.** Primary: `--ink` background, `--paper` text, square. Secondary: transparent,
   `1px solid var(--rule-strong)`, `--ink` text. Hover darkens/fills with `--paper-sunk`;
   never glows. The accent button style is for the one urgent action only.
7. **Tables.** Header row in `--paper-sunk`, mono uppercase labels; hairline row rules; no
   zebra striping; numbers right-aligned.
8. **Charts.** Ink strokes on paper, hairline gridlines in `--rule`, accent only for the
   series or point that needs attention. Thin strokes (1.5px), no area fills over 12% opacity.
9. **Focus is visible.** `outline: 2px solid var(--ink); outline-offset: 2px` on keyboard
   focus. Never remove focus outlines.
10. **Keep behaviour.** Restyle only. Do not change element IDs, class names that JS or
    tests use, ARIA attributes, or layout mechanics (the map's 3D scene, the bounded
    workstation layout in `layout.css`). If a test asserts a colour, update the test to the
    new token value and say so in your handoff.

## Files and ownership

| File | Area | Owner during the redesign |
|---|---|---|
| `tokens.css` | Tokens above | main agent |
| `base.css` | Elements, header, tabs, simulation bar, search palette | main agent |
| `floor.css` | Map, legend, issue list, event feed | main agent |
| `panel.css` | Station status, baselines, recommendation, evidence, staffing, audit | main agent |
| `ops.css` | Settings, Demo controls, Control Rooms | main agent |
| `analytics.css` | Analytics view (+ chart colours in `app.js` `renderAnalytics`) | **codex** |
| `layout.css` | Responsive/workstation layout | main agent; others only with a note in their handoff |
