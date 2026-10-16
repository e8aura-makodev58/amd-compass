# 2.5D building: centering, zoom, bubbles, and a 2D top view

**Branch:** `feat/multi-floor-layout` · **Scope:** frontend view only · **Dependencies added:** none

> Implementation status, 2026-09-05: the shared camera lifecycle, default 2D view, 2.5D toggle, manufacturing-floor selector, wheel/button/keyboard zoom, reset, and poll-safe mouse/touch pan are implemented. The proposed floating info card (WI-3) remains unimplemented because it was not requested. Drag-to-pan was promoted from the original non-goals at the operator's explicit direction.
>
> **Update, 2026-09-06 — WI-3's conclusions are superseded; its premise no longer holds.** Node text now lives in a screen-space overlay layer (`.map-label-layer`, `frontend/map-label-layout.js`) that re-measures the browser's projection of each node on every camera change. Because a label is recomputed rather than frozen, the three things WI-3 designed out — leader lines, collision avoidance, and `requestAnimationFrame` — are the correct mechanisms here, not defects: a recomputed leader line is never stale, and persistent per-node labels genuinely can collide. The rule WI-3 was protecting still stands for a *click-placed info card*, which remains unimplemented. WI-3's `doesNotMatch(app, /requestAnimationFrame/)` test was therefore never added.
>
> With text out of the scene, map geometry no longer counter-rotates: machines, responders, and floor signage lie in the floor plane and share its axes. This is deliberately **step one toward a full 3D floor**, so prefer changes that keep world geometry in the scene and text in screen space — the split a real 3D renderer would need anyway. The non-goal "any 3D library, animation library, or WebGL" in §8 is a statement of the current build, not a permanent constraint on that direction.

## 1. Current state vs target

| Capability | Today | Where | Target |
|---|---|---|---|
| Manual rotation | Exists, ±45° | `app.js:120-122` | Kept, demoted, disabled in 2D |
| Auto-rotate on select | Exists, shortest path | `app.js:143-155` | Kept, becomes one part of a composite camera move |
| Floor emphasis | Exists, visual only | `app.js:118`, `styles.css:29-30` | Kept, plus actual geometric centering |
| Rotation/fade animation | **Declared but dead** (see below) | `styles.css:28,29` | Made real by WI-0 |
| Centre the active floor | Does not exist | — | WI-1 |
| Zoom | Does not exist | — | WI-2 |
| Info bubble | Inline `.node-copy` only | `app.js:97`, `styles.css:38-39` | WI-3 — a screen-space card placed once, not an anchored callout |
| 2D top view | Does not exist | — | WI-4 |

### The dead-animation finding (drives everything)

`renderFloor` embeds camera state in markup: `style="--yaw:${buildingYaw}deg;--pitch:${BUILDING_PITCH}deg;"` (`app.js:120`) and `.active-floor` / `.focused` classes (`app.js:106,113,118`). `setHtml` only skips *byte-identical* writes (`render-lifecycle.js:30`); any camera change changes the string, so `element.innerHTML = html` (`render-lifecycle.js:37`) destroys and rebuilds 72 buttons plus `.building`. CSS transitions require an element that existed with a prior value. Therefore:

- rotation does not glide, it teleports;
- the floor cross-fade does not cross-fade;
- every rotation is a 75-element DOM rebuild.

**Measured, not inferred.** A probe tagged `.building` with `data-probe="original"`, clicked `#rotate-right`, and read the computed transform 120ms later — well inside the declared `.55s`. The tag was gone (element replaced) and the transform was already at its settled value, byte-identical to the value 900ms later.

No amount of new CSS fixes this. **The camera must leave the markup string.** That is WI-0, and it is a hard prerequisite for WI-1 through WI-4.

### A second bug found on the way

`frontend/index.html:26` declares `<div id="floor" role="img">`. `role="img"` prunes the entire subtree from the accessibility tree, so the 72 `<button>` nodes are already invisible to screen readers despite being real buttons. Fixed in WI-0.

### A dead branch

`app.js:96`: `const focusId = kind === "equipment" ? item.id : item.id;` — both arms identical. Delete in WI-0.

---

## 2. Work items

Order differs from the original brief's numbering, deliberately: **WI-0 → centering → zoom → bubble → 2D toggle.** Rationale — zoom about the scene origin is only meaningful once the thing you care about *is* at the origin (WI-1 before WI-2); the card's placement rules reference camera moves that only exist after WI-1/WI-2; and the 2D toggle's job is largely to define what happens to yaw, centering and zoom when the mode flips, so it must be specified last, not first. Each item is independently shippable and leaves the suite green.

---

### WI-0 — Split scene markup from camera state (prerequisite, no new user-facing feature)

**Touch points:** `app.js:95-126` (`nodeMarkup`, `renderFloor`), `app.js:24-25` (module state), `styles.css:27-34`, `index.html:26`.

**Approach.** Extend the existing render-lifecycle contract with a third rule, stated in a comment above `renderFloor`:

> Every panel write goes through `setHtml`; handlers are re-assigned on every pass even when the write is skipped; **and camera/selection state is applied imperatively after every pass, never embedded in the markup string.**

Concretely:

1. `renderFloor` emits **state-derived markup only** — floors, nodes, names, statuses, `data-focus-id`, `data-focus-kind`, `data-floor`, `data-x`, `data-y`. No `--yaw`, no `.active-floor`, no `.focused`, no `Floor N` hint text.
2. After the `setHtml` call, an `applyCamera()` function runs unconditionally — exactly like the handler re-assignment at `app.js:121-125` — and does:
   - `camera.style.setProperty("--zoom", mapZoom)` on `.building-stage`
   - `building.style.setProperty("--yaw-user", ...)`, `--focus-x`, `--focus-y`, `--focus-level`
   - `classList.toggle("active-floor", ...)` per plane, `classList.toggle("focused", ...)` per node
   - `elements.floor.classList.toggle("view-2d", viewMode === "2d")`
   - `hintEl.textContent = \`Floor ${focusFloor}\``, `aria-pressed` on the toggle buttons
3. `applyCamera()` is also the entry point for every camera mutation (rotate buttons, zoom, mode toggle), so a wheel event costs a handful of `setProperty` calls rather than a full `render(currentState)`.

**Why this is a strict improvement, not just a refactor.** During idle polling the scene string now depends only on equipment status, responder availability and names — which change on the order of once per issue, not once per tick. `setHtml` skips essentially every write, `.building` survives, and the transitions at `styles.css:28-29` start working for the first time. Rotation cost drops from "rebuild 75 elements" to "set one custom property".

**Bindings rule to keep the two lifecycles straight.** `#floor` and `#map-overlay` are *persistent* elements that `setHtml` never replaces, so listeners on them use `addEventListener` once at module scope alongside `app.js:385-388`. Anything *inside* a `setHtml`-managed subtree (nodes, rotate/zoom/mode buttons) uses property assignment (`.onclick`) re-applied every pass — the rule from `decisions.md:298`.

**Also in WI-0:** `index.html:26` `role="img"` → `role="group"` with the same `aria-label`; delete the dead ternary at `app.js:96`; guard `focusedFloor` (`app.js:132`) with `?? 1` for a legacy record missing `floor`; clear `focusedNodeId` in `renderFloor` when it no longer resolves against state.

**Rejected:** keeping camera in markup and giving `.building` a stable `key`-like identity by mutating only its `style` attribute after the fact — that is what this item does, minus the pretence that markup can carry it. Rejected also: DOM-diffing the scene, which is the same rewrite-the-render-layer objection recorded at `decisions.md:297`.

---

### WI-1 — Animate the selected floor to the viewport centre

**Touch points:** `styles.css:28-29` (`.building`, `.floor-plane`), `app.js:128-135` (`focusedFloor`), new `applyCamera()`.

**The maths.** The scene composes `translateY(30px) rotateX(--pitch) rotateZ(--yaw)` on `.building` (`styles.css:28`), and each plane sits at `translateZ(calc(var(--level) * 175px))` (`styles.css:29`). Rather than compute screen-space pixel offsets with trig, cancel the plane's own offset **inside the rotated local space** by appending a translate to the camera's function list:

```css
:root, .building { --storey: 175px; }
.building {
  --yaw:   var(--yaw-user, -35deg);
  --pitch: var(--pitch-user, 58deg);
  --focus-z: calc(var(--focus-level, 0) * var(--storey) * -1);
  transform:
    translateY(var(--lift, 30px))
    rotateX(var(--pitch))
    rotateZ(var(--yaw))
    translate3d(calc(var(--focus-x, 0) * -1%), calc(var(--focus-y, 0) * -1%), var(--focus-z));
}
```

`--focus-level` is `activeFloor - 1`, so `--focus-z` exactly negates the active plane's `translateZ` and lands it at the scene origin **at any yaw and pitch, with no trigonometry**. `--focus-x` / `--focus-y` are the in-plane offset in percent — `(x / FLOOR_WIDTH) * 100 - 50` and `(y / FLOOR_HEIGHT) * 100 - 50`, reusing the exact expressions already in `positionStyle` (`app.js:29`). Percentages in `translate3d` resolve against the element's own border box, and `.floor-plane` is `inset: 0` of `.building` (`styles.css:29`), so a node's percent coordinates and the camera's percent offset share one coordinate system for free. The Z component must be a length, which `--focus-z` is.

**Two CSS details that are load-bearing.**

- *Named indirection.* Inline styles beat class rules. If JS set `--yaw` directly, WI-4 could never override it from a `.view-2d` class rule. So JS writes `--yaw-user` / `--pitch-user`, and `.building` derives `--yaw` / `--pitch` from them. Mode rules then override the *derived* names. Bonus: `.floor-tag` and `.map-node` counter-rotate on `var(--yaw)`/`var(--pitch)` (`styles.css:33-34`) and inherit from `.building`, so counter-rotation automatically becomes identity in 2D with zero extra code.
- *Fixed function list.* Never conditionally add or drop a transform function. A stable list interpolates per-function; a changed list degrades to matrix interpolation and the building visibly skews mid-move. All modes vary only the variables.

**Interaction.** `focusedFloor` (`app.js:129-135`) becomes `focusedNode?.floor ?? pinnedFloor ?? issueEquipmentFloor ?? 1`. A new segmented floor control (`Floor 1 / 2 / 3`) in `.building-controls` sets `pinnedFloor` and clears `focusedNodeId`; selecting a node clears `pinnedFloor`. One `.55s` transition carries yaw, focus-x, focus-y and focus-z together, so a cross-floor selection reads as a single camera move.

**Rejected:** (a) computing screen-space `translate(x,y)` in JS from `sin/cos` of yaw and pitch — duplicates the CSS transform maths in JS and silently drifts the moment `--storey` or `--pitch` changes; (b) animating each `.floor-plane`'s own `translateZ` toward zero — three transitions instead of one, and it compresses the building into a pancake instead of moving the camera; (c) scrolling the container — the subtree is transformed, so layout boxes bear no relation to visual position.

---

### WI-2 — Zoom to a selected machine or responder

**Touch points:** new `.building-stage` wrapper in `renderFloor`'s markup, `styles.css:27-28`, `app.js:10-14` (constants), `app.js:143-155` (`focusBuildingOn`), module-scope listener block near `app.js:385-388`.

**The model, and why it is not `scale()` on `.building`.** `scale(n)` is `scale3d(n, n, 1)` — it scales X and Y but leaves Z alone. Applied to `.building`, storey separation would stay at 175px while floor plans doubled in width, so **the isometric proportions would silently change with zoom**. `scale3d(n,n,n)` fixes proportions but drives the near plane toward the 3200px `perspective` origin (`styles.css:27`), producing distortion and, at high zoom on floor 3, potential inversion.

The correct model is: **zoom scales the rendered image, not the 3D scene.** Insert a plain 2D wrapper *outside* the perspective context:

```
#floor  >  .building-stage      transform: scale(var(--zoom))   (no preserve-3d)
        >  .building-viewport   perspective: 3200px
        >  .building            the 3D camera from WI-1
        >  .floor-plane × 3
```

`.building-stage` has no `transform-style: preserve-3d`, so it flattens the finished isometric render and scales that flat result. Projection, storey proportions and perspective are exactly preserved at every zoom level, and there is no near-plane hazard. `.building-viewport` is already `display: grid; place-items: center` (`styles.css:27`), so the scale is about the scene centre — which, thanks to WI-1, is exactly where the selected node is. **This is why centering must ship before zoom: without it, zooming magnifies the building's geometric centre, not the operator's target.**

`.floor-plane:nth-child(n)` in `building-view.spec.mjs:19` is unaffected — the new wrapper is an ancestor of `.building`, and the planes remain its only children.

**Constants** (add near `app.js:10-14`): `ZOOM_MIN = 0.6`, `ZOOM_MAX = 3`, `ZOOM_STEP = 1.25` (multiplicative), `ZOOM_ON_SELECT = 1.9`, `STOREY_DEPTH = 175`.

**Zoom sources.**
- *Selection-driven:* `focusBuildingOn` (`app.js:143`) sets `mapZoom = Math.max(mapZoom, ZOOM_ON_SELECT)` — it never zooms *out* to then zoom back in, so a machine-to-machine hop on the same floor is one smooth glide.
- *Buttons:* `+` / `−` / `⤢ Reset view` in `.building-controls` (`styles.css:43-45` already styles this bar). Real `<button>`s, so keyboard-reachable by construction.
- *Keyboard:* `+` / `-` / `0` / `Escape` on `#floor` (`tabindex="0"`), documented in the bar's `title`.
- *Wheel:* on `#floor`, `{ passive: false }`, `preventDefault()`, plus `overscroll-behavior: contain` on `.floor` (`styles.css:24`). Owning the call: plain wheel zooms rather than requiring ctrl+wheel, because `#floor` is a bounded 600px surface in a short dashboard page and every other zoom affordance already exists; the page-scroll-trapping complaint is real but here it costs one scroll gesture routed around a fixed-height box.
- Wheel handlers call `applyCamera()` only — never `render(currentState)` — and add a `camera-instant` class to `.building-stage` that zeroes the transition duration, cleared on a 120ms idle timer. A `.55s` ease on every wheel notch feels broken.

**Zoom out.** Clicking the focused node again already toggles focus off (`app.js:147`); extend that path, `Escape`, and `⤢` to reset `mapZoom = 1`, `--focus-x/-y = 0`, and `pinnedFloor = null`. **Yaw is deliberately not reset** — snapping back to `DEFAULT_YAW` would fight a manual rotation the operator just made, which is the behaviour `building-view.spec.mjs:41-51` exists to protect in spirit.

**Label legibility.** `--zoom` is a custom property on an ancestor, so it inherits into the scene. Set `.node-copy { font-size: calc(.72rem / var(--zoom)) }` so inline labels hold a constant screen size while wireframes grow. Screenshot-judged; drop it if it reads worse.

**Rejected:** animating `perspective` (a dolly, not a zoom — it changes the projection, so the isometric look drifts as you zoom, and it interacts badly with the fixed pitch); a JS "camera object" with per-frame matrix maths (that is re-implementing a 3D engine, against the zero-dependency constraint in spirit as well as letter); `zoom` the CSS property (legacy, does not transition well, and reflows layout instead of compositing).

---

### WI-3 — Info card: placed once at selection, fixed in screen space

**Design rule from the operator, and it drives the whole item.** The card is **not** anchored to its node and does **not** track it. It is placed once, at the moment of selection, from the node's then-current screen rectangle, and thereafter stays at that screen location through rotation, zoom, floor-centering and everything else. It is cleared by closing it, by selecting another node, or by anything else that clears selection.

**Touch points:** `index.html:24-28` (wrap `#floor` in `.floor-stage`, add `#map-overlay`), `app.js:3-9` (elements map), `app.js:143-155` (`focusBuildingOn` gains the one placement call), new `renderBubble`, `styles.css` new `.map-overlay` / `.map-bubble` block.

**Structure.** `#map-overlay` is a **sibling of `#floor`**, inside a new `.floor-stage { position: relative }` wrapper. It is never a descendant of `.building` or `.floor-plane`, so it inherits none of the scene transform: no `rotateZ(calc(-1 * var(--yaw)))` compensation, no counter-pitch, no image scale from `.building-stage`. That counter-rotation machinery (`styles.css:33-34`) stays where it belongs — on the small node labels that remain inside the scene.

**Placement — exactly two triggers, never a loop.**

```js
// Called ONLY from focusBuildingOn (new selection) and from the mode toggle's
// one-shot settle callback. Never from render, applyCamera, wheel, or the poll.
function placeBubble(nodeEl) {
  const anchor = nodeEl.getBoundingClientRect();
  const frame  = elements.floor.getBoundingClientRect();
  bubbleAnchor = { x: anchor.left + anchor.width / 2 - frame.left,
                   y: anchor.top - frame.top };
}
```

`getBoundingClientRect()` returns the post-transform box, so the initial placement is correct at any yaw, pitch and zoom. `bubbleAnchor` is stored as **plain module state in unclamped map-local pixels**; every subsequent render reads those two numbers. Clamping to the viewport is applied **at render time**, not at placement time, against the current `#floor` box with 8px padding — so a window resize needs no listener at all: the next render (at worst 1.5s later) re-clamps for free, and the stored raw coordinates are never corrupted by a clamp.

**Consequences, stated plainly because they are intentional:**

- **After a rotation, zoom or floor change the card will no longer sit on top of its node.** That is the accepted trade for a card that never jitters, never chases the camera, and costs nothing to maintain.
- **Therefore: no leader line, no tail, no stem, no arrow.** A pointer would be wrong the instant the scene moved, and a wrong pointer is worse than none. A plain floating card is correct here.
- **Therefore: the card must be self-identifying.** It leads with the machine or responder name as its heading, with the id and `Floor N` immediately under it, so it is unambiguous what it describes once it is no longer adjacent to anything. This is a hard content requirement, not styling.

**Contents.**
- *Equipment:* `<h4>` name → id · `Floor N` · status label → if an issue is open: issue id, class, status, and the offered/assigned responder's display name. One action: **Show issue**, which sets `selectedIssueId` exactly as `app.js:171` does. No assignment, offer or override control, so the boundary in `docs/floor-layout/README.md` is untouched.
- *Responder:* `<h4>` name → id · `Floor N` · availability → the issue they are currently offered or assigned, derived from `state.issues`. **Only fields present in the public snapshot.** `app.js` contains no reference to `skill` today; WI-3 must keep it that way (AGENTS.md rule 4), with a grep test below.

**Not swallowing clicks** — the defect class from `decisions.md:399`. `.map-overlay { position: absolute; inset: 0; pointer-events: none; }`; `pointer-events: auto` only on `.map-bubble` and its close button. No zoom capture surface is added; the wheel listener sits on `#floor`, which already exists.

**One card at a time.** The card is open **iff** a node is focused, so there is no separate open/closed variable to desync, and the "many nodes near each other" problem dissolves — there is nothing to collide with. No collision-avoidance system is planned or needed. Hover keeps the cheap inline `.node-copy` (`styles.css:39`) and never opens a card.

**Dismissal:** `×`, `Escape`, re-clicking the node, clicking empty floor, or selecting another node (which clears and re-places fresh).

**Mode toggle — the call.** A 2D↔2.5D switch **keeps the selection and re-places the card once**, on a one-shot `transitionend` on `.building` (with a 700ms `setTimeout` fallback in case the event is dropped). Justification: this is the one camera change where the node moves so far — pitch 58°→0°, and in 2D the other two floors vanish — that a stale card position stops being merely offset and starts being misleading, and it is an explicit operator command to re-frame everything rather than an incremental nudge. Re-placing here is a single one-shot call to the same `placeBubble`, identical in kind to a fresh selection; it is not tracking, and no loop is introduced. Everything else — rotate, zoom, wheel, floor pin, poll — leaves the card exactly where it was.

**Lifecycle.** `renderBubble` writes through `setHtml(elements["map-overlay"], html)` — its own `WeakMap` cache entry (`render-lifecycle.js:20`) — so card churn never rewrites the scene and vice versa. The clamped `left`/`top` are applied imperatively afterward, same discipline as `applyCamera`.

**A11y.** The focused node carries `aria-expanded="true"` and `aria-describedby="map-bubble"`; `#map-overlay` is `aria-live="polite"` so content is announced without stealing focus from the node button. `Escape` closes and returns nothing (focus never left).

**Rejected:** a node-anchored callout with a rAF tracker, a `transitionrun`/`transitionend` loop and a watchdog — the operator's rule removes all of it; an SVG leader-line layer (a second coordinate system to keep in sync, and wrong the moment the scene moves); an in-scene bubble counter-rotated like `.node-copy` (inherits the WI-2 image scale, so text renders at 0.6×–3×, and it can be occluded by the floor above); a fixed card in the panel corner (loses the spatial link entirely); hover-triggered cards (72 nodes, guaranteed thrash).

---

### WI-4 — 2D top view / 2.5D isometric toggle

**Touch points:** `renderFloor` control bar markup, `styles.css:27-34` mode rules, `app.js:24-25` (module state), new `readViewMode` / `writeViewMode`.

**What 2D shows: one floor at a time — the active one.** Three floors side by side in a 600px box (`styles.css:24`) puts 24 machines each into ~200px of width; stacked-with-all-visible reintroduces exactly the occlusion that 2D exists to remove. One floor, full-bleed, with the same `Floor 1 / 2 / 3` segmented control from WI-1 doing the switching.

**Same DOM, different variables.** No second renderer. A `view-2d` class on `#floor`:

```css
.floor.view-2d .building { --yaw: 0deg; --pitch: 0deg; --focus-z: 0px; --lift: 0px; }
.floor.view-2d .floor-plane { transform: translateZ(0); }
.floor.view-2d .floor-plane:not(.active-floor) { opacity: 0; visibility: hidden; pointer-events: none; }
.floor.view-2d .building-viewport { perspective: none; }
```

Because the class overrides the *derived* `--yaw`/`--pitch` (never the inline `--yaw-user`), `buildingYaw` is preserved untouched while in 2D and the operator's rotation is restored for free on switching back. Node and floor-tag counter-rotation (`styles.css:33-34`) becomes identity automatically. `visibility: hidden` rather than `display: none` keeps the `.floor-plane`×3 and 72-node counts in `building-view.spec.mjs:16-20` stable and lets the hide cross-fade.

**Transition feel.** The mode switch is one interpolated transform on a single surviving `.building` element (WI-0 made that possible): pitch 58°→0°, yaw → 0°, focus-z → 0, `.55s`, the same easing as everything else. It reads as the camera rising to look straight down, which is the correct mental model and costs nothing extra.

**Rotation is disabled in 2D.** `#rotate-left` / `#rotate-right` get `disabled` plus `title="Rotation is available in the 3D view"`.

**What the toggle does to an open bubble.** Keep the selection, and **re-place the bubble at the node's new screen position** after the mode switch completes. This is the one exception to the frozen-position rule, and it is justified: a mode switch is not a camera nudge, it is a change of projection in which the node genuinely relocates, and leaving the card at a position derived from the old projection would strand it with no relationship to anything on screen. Re-placing on mode switch only — never on rotate, zoom or centre — keeps the operator's rule intact where it matters.

**Toggle presentation and persistence.** Two `aria-pressed` buttons (`2D` / `3D`) in `.building-controls`. Mode persists to `localStorage["compass.map.view"]`, read once at module load into `viewMode`, wrapped in `try/catch` (storage can throw in private mode / with cookies blocked) with an `"iso"` default. **Nothing else persists to storage** — yaw, zoom, focused node and pinned floor are transient navigation state, and a reload that restored the camera pointed at a machine whose issue closed twenty minutes ago would be actively misleading.

**Rejected:** a separate 2D renderer or template (two renderers to keep in sync, and the toggle could never animate); all three floors side by side (illegible at this density); a stacked exploded 2D view (occlusion returns, which defeats the purpose); persisting the whole camera to `localStorage`.

---

## 3. The rotation decision

**Keep rotation, demote it, disable it entirely in 2D.** Reading the code strengthens rather than weakens this position.

- The occlusion argument is concrete here. `.map-node` has no depth sorting; it relies on `z-index: 1` / `3` on hover and focus (`styles.css:34,40`). At 24 machines per plane with `pitch: 58deg`, machines genuinely stack behind one another and hover is the only escape. Rotation is the cheapest fix for that in 2.5D and costs one CSS variable.
- Auto-rotate-on-select (`app.js:143-155`) earns its keep for a *different* reason than navigation: it makes the selection legible by turning the target toward the viewer before centering and zoom arrive. It also becomes visually much better once WI-0 makes the transition actually run.
- But once 2D exists, occlusion is gone by construction, and centering plus zoom answer "show me this machine" directly. Rotation stops being how you *find* something and becomes how you *look around* something. So in the interaction order it sits below centering and zoom, and its manual buttons move to the right of the mode and floor controls in the bar.
- In 2D, rotating a floor plan spins the labels' frame of reference and buys nothing, because nothing is hidden. Disabled, with a `title` explaining why rather than a silently inert control.

One refinement, not a disagreement: `focusBuildingOn` (`app.js:149`) computes `atan2` from the floor centre, which is degenerate for a node sitting at the exact centre. Guard it — if the node is within a few units of centre, leave yaw alone. Otherwise the shortest-path arithmetic at `app.js:152` is correct and stays.

---

## 4. The single interaction model

One state machine, five variables, four rules. Designed as a whole precisely because designing these features in isolation is how they end up fighting.

**Camera state**

| Variable | Meaning | Default |
|---|---|---|
| `viewMode` | `"iso"` \| `"2d"` | `"iso"`, from `localStorage` |
| `buildingYaw` | camera yaw, degrees (existing, `app.js:24`) | `DEFAULT_YAW` |
| `mapZoom` | image scale, clamped `[0.6, 3]` | `1` |
| `focusedNodeId` | selected machine/responder (existing, `app.js:25`) | `null` |
| `pinnedFloor` | explicit floor-button override | `null` |
| `bubbleAnchor` | frozen `{x, y}` screen position of the open bubble | `null` |

**Rule 1 — one derivation for the active floor.** `focusedNode?.floor ?? pinnedFloor ?? selectedIssueEquipmentFloor ?? 1`. There is no separate "active floor" variable to desync. Selecting a node clears `pinnedFloor`; pinning a floor clears `focusedNodeId` (and therefore the bubble).

**Rule 2 — one composite move, never a sequence.** Selecting a node **on another floor while already zoomed into a different node** produces exactly one `.55s` transition in which yaw, `--focus-x`, `--focus-y` and `--focus-z` all interpolate simultaneously, and `mapZoom` is *held* if it is already ≥ `ZOOM_ON_SELECT`, raised to it otherwise. The camera never zooms out, travels, and zooms back in. This needs no sequencing code, no timers, and no chance of a poll tick landing between two stages — it is a single CSS transition on two surviving elements.

**Rule 3 — what resets what.**

| Action | `viewMode` | `buildingYaw` | `mapZoom` | `focusedNodeId` + bubble | `pinnedFloor` |
|---|---|---|---|---|---|
| Select a node | — | → faces node | ↑ to ≥1.9 | → that node, `bubbleAnchor` frozen now | cleared |
| Re-click focused node / `Escape` | — | **unchanged** | → 1 | cleared | cleared |
| `⤢ Reset view` | — | **unchanged** | → 1 | cleared | cleared |
| Pin a floor | — | unchanged | unchanged | cleared | → that floor |
| Rotate ± | — | ±45° | unchanged | **unchanged, `bubbleAnchor` frozen** | unchanged |
| Wheel / ± buttons | — | unchanged | changed | **unchanged, `bubbleAnchor` frozen** | unchanged |
| Toggle 2D ↔ 3D | flipped | **preserved** (masked by class in 2D) | preserved | preserved, `bubbleAnchor` **re-placed** | preserved |
| Poll tick (1.5s) | — | — | — | — | — |
| Select an issue card (`app.js:171`) | — | unchanged | unchanged | unchanged | unchanged |

Yaw is never auto-reset by anything except an explicit node selection. That is the one rule that keeps manual rotation from feeling like it is being undone behind the operator's back, and it is what `building-view.spec.mjs:48-50` is really asserting.

**Rule 4 — the poll is inert by construction.** A tick runs `render` → `renderFloor` → `setHtml` (skipped, markup is camera-free) → `applyCamera()` re-applies byte-identical inline values → no style change, so no transition restarts and no frame is dropped. This is the same "handlers are re-assigned even when the write is skipped" discipline from `decisions.md:298`, extended to camera state, and it is why none of these features need to touch the `setInterval` at `app.js:488` or the pointer guard at `app.js:478-485`.

All of this applies in Offline mode too — `renderOffline` calls the same `renderFloor` (`app.js:338`) — with no API call added.

---

## 5. State and persistence

**Added module variables** (beside `buildingYaw` / `focusedNodeId` at `app.js:24-25`): `viewMode`, `mapZoom`, `pinnedFloor`, `bubbleAnchor`.

**Added constants** (beside `app.js:10-14`): `STOREY_DEPTH = 175`, `ZOOM_MIN`, `ZOOM_MAX`, `ZOOM_STEP`, `ZOOM_ON_SELECT`, `VIEW_MODE_KEY = "compass.map.view"`.

| | Survives poll tick | Survives reload | Survives mode switch |
|---|---|---|---|
| `viewMode` | yes | **yes** (`localStorage`) | n/a |
| `buildingYaw` | yes | no | yes (masked, not cleared) |
| `mapZoom` | yes | no | yes |
| `focusedNodeId` | yes | no | yes |
| `pinnedFloor` | yes | no | yes |
| `bubbleAnchor` | yes | no | yes, but recomputed once |

Nothing camera-related is sent to or stored on the backend. `localStorage` access is `try/catch`-wrapped in both directions.

---

## 6. Test plan

**New unit file `backend/tests/wp18-building-camera.test.mjs`** (new rather than growing `wp10-control-room-ui.test.mjs`, which is about the control-room shell):

- WI-0: `assert.doesNotMatch(app, /class="building"[^`]*style=/)` and `assert.doesNotMatch(app, /--yaw:\$\{/)` — the camera is not in the markup string. `assert.match(app, /function applyCamera/)`. `assert.doesNotMatch(app, /const focusId = kind === "equipment" \? item\.id : item\.id/)`.
- WI-1: `styles.css` contains `--focus-z`, `--focus-level`, `--storey`, and `.building { ... --yaw: var(--yaw-user` (the indirection is what makes WI-4 possible; assert it explicitly so nobody "simplifies" it away).
- WI-2: `app.js` contains `ZOOM_MIN`/`ZOOM_MAX` and clamps; `styles.css` has `.building-stage` with `scale(var(--zoom))` and **no** `preserve-3d` on it; `wheel` listener present with `passive: false`.
- WI-3: `styles.css` has `.map-overlay` with `pointer-events: none` and `.map-bubble` with `pointer-events: auto`; **`assert.doesNotMatch(app, /requestAnimationFrame/)`** — locks in the no-tracker design, inverting what a tracking implementation would need; assert the stylesheet declares no `.map-bubble` stem/tail pseudo-element, so a leader line cannot creep back; **`assert.doesNotMatch(app, /skill/i)`** (AGENTS.md rule 4 — currently true, and the card is the first surface that could break it); `index.html` has `id="map-overlay"` and no longer has `role="img"` on `#floor`.
- WI-4: `app.js` references `localStorage` inside a `try`; `styles.css` has `.floor.view-2d .building`; `@media (prefers-reduced-motion: reduce)` present.

**Extend `backend/tests/wp15-render-lifecycle.test.mjs`** (the static block at its end) with `assert.doesNotMatch(app, /elements\["map-overlay"\]\.innerHTML\s*=/)`, alongside the existing `elements.floor.innerHTML` assertion, so the new panel joins the same contract.

**New e2e `e2e/map-camera.spec.mjs`:**

1. *Centering* — click a floor-3 machine; assert `.floor-plane.active-floor .floor-tag` reads Floor 3 **and** `.building` inline style carries `--focus-level: 2`.
2. *Zoom on select* — after that click, `.building-stage` style shows `--zoom` ≥ 1.9; `⤢` returns it to 1; the `.building` `--yaw-user` is unchanged by the reset (guards Rule 3).
3. *Camera survives the poll* — set a non-default zoom and floor, wait 3.5s, assert both `.building` and `.building-stage` style attributes are byte-identical (the WI-0 payoff, and the direct analogue of `building-view.spec.mjs:48-50`).
4. *Bubble opens, contains the machine name, closes on `Escape`.*
5. ***The card does not track*** — open a card, record its `left`/`top`, click `Rotate building right`, wait 800ms, assert `left`/`top` are **identical** and the card is still open. This is the direct assertion of the operator's rule, and it is what a regression back to an anchored callout would break.
6. *Card re-places on mode toggle* — open a card, toggle to 2D, wait 800ms, assert it is still open, still shows the same node's name, and its `left`/`top` **have** changed.
7. *Overlay does not swallow clicks* — open a bubble, then click a **different** node whose screen position overlaps the bubble's rectangle, and assert the bubble content changed to the second node. Regression guard for the defect class at `decisions.md:399`.
8. *2D toggle* — click `2D`; assert `#floor.view-2d`, both rotate buttons `disabled`, exactly one visible `.floor-plane`, and `.floor-plane` count still 3; reload; assert still 2D.
9. *Keyboard* — `Tab` to the zoom-in button and `Enter`; assert `--zoom` changed. No mouse.

**Existing tests — what changes:**

- `e2e/building-view.spec.mjs` — all six assertions still hold. `.building` still carries an inline style attribute (custom properties written via `style.setProperty` land in it), still differs after a rotation (line 38, 47), and still survives the poll (line 50). Planes remain the only children of `.building` so `:nth-child` at line 19 is unaffected. **One hardening edit recommended:** at line 43, `await expect(page.locator(".building")).toHaveAttribute("style", /--yaw-user/)` before capturing `before`, since the inline style is now written by JS on the first render rather than arriving inside the HTML string.
- `backend/tests/wp10-control-room-ui.test.mjs` — unchanged. Its `setInterval` grep (line 14) and four `styles.css` greps (lines 15-18) touch nothing here.
- `backend/tests/wp6-recommendation-ui.test.mjs` — unchanged; no literal it greps lives in the map code. (Note for anyone working from older notes: this file greps `top.tradeoff`, `Offer sent to`, `Central command override`, `Override dispatch`, `A rejection automatically advances`, `is-loading`, and two `styles.css` cursor rules. It does **not** grep `Confirm assignment —` or `Choose someone else`; those literals were removed with the confirmation gate.)
- No backend test changes. No backend changes at all.

**Screenshot-only judgements** (state plainly in the handover — these cannot be asserted):

whether a centred floor *reads* as centred against the viewport frame; whether `ZOOM_ON_SELECT = 1.9` frames a single machine usefully or too tightly; whether a bubble left behind by a rotation still reads as belonging to its node, or whether the name alone is insufficient; whether the 2D plan is legible with 24 machines and their labels; whether the pitch 58°→0° mode transition reads as a camera move or as a collapse; whether the counter-scaled `.node-copy` font looks right across the zoom range. Run both suites first, then a manual pass at yaw ∈ {−35°, 45°, 135°}, zoom ∈ {0.6, 1, 1.9, 3}, floors 1 and 3, in both modes.

---

## 7. Risks, each with the check that catches it

| Risk | Check |
|---|---|
| A custom property feeding `transform` fails to interpolate, so moves snap | e2e 3 plus a mid-transition screenshot at ~250ms. Fallback: compose the full transform string in JS and set `style.transform` — still zero dependencies |
| Someone reintroduces camera state into the markup string, silently killing every animation again | `wp18` grep for `class="building"[^]*style=`; the failure is otherwise invisible to tests, which is exactly how it survived this long |
| Overlay swallows node clicks (the `decisions.md:399` defect class) | e2e 6, plus the `pointer-events` greps |
| Someone "fixes" the card drifting off its node by adding a tracker, reintroducing rAF and jitter | `wp18` `doesNotMatch(app, /requestAnimationFrame/)`, and e2e 5 which asserts the card *must not* move on rotation |
| A leader line or tail creeps back and points at nothing after a camera move | `wp18` stylesheet assertion that `.map-bubble` declares no stem pseudo-element; visual check in the screenshot pass |
| The mode-toggle `transitionend` one-shot is dropped, leaving the card un-re-placed | 700ms `setTimeout` fallback; e2e 6 asserts the position actually changed. Note the reduced-motion rule below can suppress `transitionend`, which the same fallback covers |
| Zoom distorts isometric proportions or blows through the near plane | Guaranteed away by the flattened `.building-stage` model; verify with a screenshot at `ZOOM_MAX` on floor 3 near a corner, and a `wp18` assertion that `.building-stage` has no `preserve-3d` |
| Jank: 72 nodes × transform | `will-change: transform` on `.building-stage` and `.building`; never animate per-node; judged by screenshot pass and Playwright step timings |
| `localStorage` throws (private mode, blocked cookies) and takes the whole app down at module load | `try/catch` both directions with an `"iso"` default; grep test |
| A `view-2d` preference leaks between Playwright tests and breaks the 72-node counts in `building-view.spec.mjs` | Playwright gives each test a fresh context, and 2D keeps all planes/nodes in the DOM anyway; confirm by running the e2e suite twice back to back |
| The mode toggle changes DOM order and breaks `.floor-plane:nth-child` | Keep planes the only children of `.building`; `building-view.spec.mjs:19` is the guard |
| `prefers-reduced-motion` users get 550ms of unwanted motion | `@media (prefers-reduced-motion: reduce)` zeroing transition durations on `.building`, `.building-stage`, `.floor-plane`, `.map-node`, `.map-bubble`, and pausing `pulse-node` (`styles.css:42,46`); verify with Playwright's `reducedMotion: "reduce"` emulation |
| A responder field added later leaks hidden `ResponderSkill` through the bubble | `assert.doesNotMatch(app, /skill/i)` in `wp18` |
| A merge with `agent/two-responder-build` conflicts | This work touches `renderFloor`/`nodeMarkup`/`focusBuildingOn`/`focusedFloor` and the `.building*` CSS block — the same regions `docs/floor-layout/README.md` already tells the other agent to keep from both sides. Add `index.html` and `#map-overlay` to that note |

---

## 8. Non-goals

- **Any backend change.** No route, schema, seed, context-engine, ranking, candidate-packet or assignment change.
- **A node-tracking bubble, a leader line, a tail, or any collision-avoidance system.** Explicitly designed out. One card, placed once, no pointer.
- **Any assignment affordance in the card.** It is read-only; offers and overrides stay in the decision panel.
- **Drag-to-pan.** `--focus-x` / `--focus-y` are already the pan channel, so it is a ~20-line follow-on, but for pass 1 panning is done by selecting a different node. Deferring it keeps the reset rules in §4 simple.
- **Pinch and touch gestures.** Wheel, buttons and keyboard cover every user; two-pointer tracking interacts with the pointer poll-guard (`app.js:478-485`) for little gain on a desktop control room.
- **Free orbit / operator-controlled pitch.** Pitch stays fixed at `BUILDING_PITCH` in 2.5D and 0° in 2D. Two mode presets are comprehensible; a continuous pitch axis is not.
- **Depth-sorted node occlusion, walls, rooms, doors, stairwells.** Stairwell geometry is explicitly out — `decisions.md` chose a flat per-floor transit cost precisely so routing is not a hidden determinant.
- **Any 3D library, animation library, or WebGL.** Zero dependencies, still zero.
- **Persisting the camera to the server, or to `localStorage` beyond `viewMode`.**
- **A mobile-first rework of the map.** The existing breakpoints (`styles.css:49-50`) keep working; the new controls wrap into the same bar.

---

## Critical files for implementation

- `frontend/app.js`
- `frontend/styles.css`
- `frontend/index.html`
- `e2e/building-view.spec.mjs`
- `backend/tests/wp15-render-lifecycle.test.mjs`
