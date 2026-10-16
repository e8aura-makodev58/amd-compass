/**
 * Place projected 3D labels in screen space. Labels use vertical lanes above
 * and below their anchor before any other compromise, so dense clusters remain
 * readable without stacking bubbles on top of one another.
 */
export function layoutProjectedLabels(candidates, bounds, options = {}) {
  const clearance = options.clearance ?? 44;
  const gap = options.gap ?? 7;
  const padding = options.padding ?? 8;
  const placed = [];

  const ordered = [...candidates].sort((left, right) =>
    left.anchorY - right.anchorY || left.anchorX - right.anchorX || left.id.localeCompare(right.id));

  for (const candidate of ordered) {
    const width = Math.min(candidate.width, Math.max(1, bounds.width - padding * 2));
    const height = candidate.height;
    const left = Math.min(
      Math.max(candidate.anchorX - width / 2, padding),
      Math.max(padding, bounds.width - padding - width),
    );
    const optionsByDistance = [];
    for (let lane = 0; lane < ordered.length * 2; lane += 1) {
      const distance = clearance + lane * (height + gap);
      const above = candidate.anchorY - distance - height;
      const below = candidate.anchorY + distance;
      if (above >= padding) optionsByDistance.push({ top: above, placement: "above", distance });
      if (below + height <= bounds.height - padding) optionsByDistance.push({ top: below, placement: "below", distance });
    }
    // Keep labels above their anchors whenever any collision-free upper lane
    // remains. Below-anchor placement is the deliberate overflow path.
    optionsByDistance.sort((a, b) => (a.placement === b.placement ? a.distance - b.distance : a.placement === "above" ? -1 : 1));

    const collides = (rectangle) => placed.some((other) => !(
      rectangle.right + gap <= other.left
      || rectangle.left >= other.right + gap
      || rectangle.bottom + gap <= other.top
      || rectangle.top >= other.bottom + gap
    ));
    let position = optionsByDistance.find((option) => !collides({ left, right: left + width, top: option.top, bottom: option.top + height }));

    // A very dense column can exhaust its anchor-relative lanes. Scan the
    // remaining Y positions before allowing any overlap; this preserves the
    // vertical-first behaviour while making collision avoidance absolute.
    if (!position) {
      for (let top = padding; top + height <= bounds.height - padding; top += Math.max(1, gap)) {
        if (!collides({ left, right: left + width, top, bottom: top + height })) {
          position = { top, placement: top + height / 2 < candidate.anchorY ? "above" : "below", distance: Math.abs(candidate.anchorY - (top + height / 2)) };
          break;
        }
      }
    }
    // Bounds that physically cannot fit all labels are rare (and only occur in
    // an extremely short viewport). Keep the bubble in bounds rather than
    // generating invalid geometry; normal workstation and mobile layouts use
    // one of the collision-free positions above.
    position ??= { top: Math.max(padding, Math.min(bounds.height - padding - height, candidate.anchorY - clearance - height)), placement: "above", distance: clearance };

    const positioned = {
      ...candidate,
      width,
      left,
      top: position.top,
      placement: position.placement,
      leaderX: Math.min(Math.max(candidate.anchorX - left, 7), Math.max(7, width - 7)),
      leaderHeight: Math.max(18, position.placement === "above" ? candidate.anchorY - position.top - height : position.top - candidate.anchorY),
    };
    placed.push({ left, right: left + width, top: positioned.top, bottom: positioned.top + height });
    candidate.position = positioned;
  }

  return candidates.map((candidate) => candidate.position);
}
