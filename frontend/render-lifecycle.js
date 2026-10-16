/**
 * Idempotent panel writes for the polled control room.
 *
 * The control room re-renders every 1.5s. Reassigning `innerHTML` destroys
 * whatever the operator is in the middle of doing — most visibly it wipes a
 * half-made override `<select>` choice and re-disables its confirm button — even
 * when the markup produced is byte-identical to what is already on screen.
 *
 * During idle polling the panel markup IS deterministic given state: the
 * evidence table reads a frozen candidate snapshot, and the agent result and
 * disagreement are frozen too. So a content dirty-check skips essentially every
 * destructive rewrite, and the select, its value, the enabled button, and their
 * handlers simply survive.
 *
 * This module must never touch the global `document` — it reaches the document
 * through `element.ownerDocument` — so it can be imported and exercised under
 * `node --test` against a stub element, with no browser.
 */

const rendered = new WeakMap();

/**
 * Write `html` into `element` only if that exact string is not already the last
 * thing written to it. Preserves the value of any identified `<select>` and
 * restores focus when a write does happen.
 *
 * @returns {boolean} true if it wrote, false if the write was skipped.
 */
export function setHtml(element, html) {
  if (rendered.get(element) === html) return false;

  const doc = element.ownerDocument ?? null;
  const active = doc && element.contains(doc.activeElement) ? doc.activeElement : null;
  const activeId = active?.id ?? null;
  const selectValues = [...element.querySelectorAll("select[id]")].map((select) => [select.id, select.value]);

  element.innerHTML = html;
  rendered.set(element, html);

  for (const [id, value] of selectValues) {
    const next = element.querySelector(`#${id}`);
    // Only restore a value the rebuilt select can still represent; otherwise the
    // caller's `disabled = !select.value` correctly re-disables the control.
    if (next && value && [...next.options].some((option) => option.value === value)) next.value = value;
  }
  if (activeId) element.querySelector(`#${activeId}`)?.focus?.();

  return true;
}
