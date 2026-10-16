import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { readFrontendCss } from "./helpers/frontend-css.mjs";

function luminance(hex) {
  assert.match(hex, /^#[\da-f]{6}$/i, `Expected an opaque sRGB token, got ${hex}`);
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels.reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}
function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("WCAG sRGB contrast calculation matches reference extremes and linear segment", () => {
  assert.equal(contrast("#000000", "#FFFFFF"), 21);
  assert.equal(contrast("#656259", "#656259"), 1);
  assert.ok(Math.abs(luminance("#0A0A0A") - 10 / 255 / 12.92) < 1e-12);
});

test("all paper-facing text tokens meet WCAG AA normal-text contrast on every paper", async () => {
  const source = await readFile(new URL("../../frontend/tokens.css", import.meta.url), "utf8");
  const tokens = new Map([...source.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]));
  const textTokens = new Set(["--ink", "--ink-2", "--ink-3", "--muted", "--accent-ink", "--warn-ink", "--ok-ink", "--info"]);
  const css = await readFrontendCss();
  // Dockview's paper-facing text variables must alias our tested text inks.
  // Resolve those aliases without excluding vendor text from the AA gate.
  for (const match of css.matchAll(/(--dv-[\w-]+)\s*:\s*var\((--[\w-]+)\)\s*;/g)) {
    if (tokens.has(match[2])) tokens.set(match[1], tokens.get(match[2]));
  }
  for (const match of css.matchAll(/(?:^|[;{])\s*color\s*:\s*var\((--[\w-]+)\)/g)) {
    // Paper-coloured text is the explicit inverse treatment on dark buttons.
    if (!match[1].startsWith("--paper")) textTokens.add(match[1]);
  }
  for (const name of textTokens) {
    assert.ok(tokens.has(name), `Missing text token ${name}`);
    for (const paper of ["--paper", "--paper-raised", "--paper-sunk"]) {
      const ratio = contrast(tokens.get(name), tokens.get(paper));
      assert.ok(ratio >= 4.5, `${name} on ${paper}: ${ratio.toFixed(3)}:1; normal text needs 4.5:1`);
    }
  }
});
