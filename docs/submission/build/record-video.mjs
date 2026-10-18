// Records the demo walkthrough as a 1920×1080 WebM with burned-in captions.
// Run against a paused scratch copy of the room with providers forced off, so the
// footage shows saved records only and nothing changes while recording.
//
// Usage: node docs/submission/build/record-video.mjs <baseUrl> <issueId> <stationId>
//   issueId: a resolved issue whose responder ranking (modelInfo.provider "amd") and fix
//   ranking (fixRecommendation.source "AMD_MODEL") both came from AMD. The room must have a
//   pending staffing recommendation for the overtime segment.
import { chromium } from "@playwright/test";
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const [base = "http://127.0.0.1:3013", issueId, stationId] = process.argv.slice(2);
if (!issueId || !stationId) throw new Error("Usage: record-video.mjs <baseUrl> <issueId> <stationId>");
const outDir = fileURLToPath(new URL("../", import.meta.url));
const tmpDir = join(outDir, ".video-tmp");
await rm(tmpDir, { recursive: true, force: true });
await mkdir(tmpDir, { recursive: true });

const size = { width: 1920, height: 1080 };
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: size, recordVideo: { dir: tmpDir, size } });
const page = await context.newPage();
const wait = (seconds) => page.waitForTimeout(seconds * 1000);

const CAPTION_CSS = `
  #rc-caption { position: fixed; left: 50%; bottom: 36px; transform: translateX(-50%); z-index: 2147483647;
    max-width: 1500px; padding: 16px 28px; border-radius: 14px; background: rgba(22,33,62,.92); color: #fff;
    font: 500 28px/1.35 Inter, system-ui, sans-serif; text-align: center; box-shadow: 0 8px 30px rgba(0,0,0,.25);
    transition: opacity .25s; }
  #rc-caption:empty { opacity: 0; }`;
async function caption(text) {
  await page.evaluate(({ text, css }) => {
    let el = document.getElementById("rc-caption");
    if (!el) {
      const style = document.createElement("style"); style.textContent = css; document.head.append(style);
      el = document.createElement("div"); el.id = "rc-caption"; document.body.append(el);
    }
    el.textContent = text;
  }, { text, css: CAPTION_CSS });
  // Rehearsal: FRAMES=<dir> saves a still per caption, for checking without a video decoder.
  if (process.env.FRAMES) {
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(process.env.FRAMES, `caption-${String(++captionCount).padStart(2, "0")}.png`) });
  }
}
let captionCount = 0;

function card(title, lines) {
  return `<!doctype html><html><body style="margin:0;height:100vh;display:flex;align-items:center;background:#F7F8FA;font-family:Inter,system-ui,sans-serif">
    <div style="margin-left:140px;border-left:14px solid #0F8B8D;padding-left:48px">
      <div style="font-size:120px;font-weight:800;color:#16213E;letter-spacing:-2px">${title}</div>
      ${lines.map(([text, color, weight]) => `<div style="font-size:48px;font-weight:${weight};color:${color};margin-top:18px">${text}</div>`).join("")}
    </div></body></html>`;
}

// Start from Live mode even if an earlier take stopped inside the Offline segment.
await page.request.post(`${base}/api/control-rooms/plant-1/mode`, { data: { mode: "LIVE" } });

// 1. Opening card
await page.setContent(card("ResponseCompass", [["The right responder. The right fix.", "#0F8B8D", 700], ["Learned from every past repair.", "#5B6474", 400], ["Runs autonomously. Supervised by your control room.", "#16213E", 600]]));
await wait(4);

// 2. The control-room wall: every display screen, live, one panel per monitor
const SCREENS = ["map", "issues", "dispatch", "events", "pareto", "analytics"];
await page.setContent(`<!doctype html><html><body style="margin:0;background:#0B1220;height:100vh;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(2,1fr);gap:18px;padding:40px 40px 150px;box-sizing:border-box">
  ${SCREENS.map((screen) => `<div style="position:relative;overflow:hidden;border:6px solid #1F2A44;border-radius:8px;background:#fff"><iframe src="${base}/rooms/plant-1/display/${screen}" style="position:absolute;left:0;top:0;width:1822px;height:1321px;border:0;transform:scale(.33);transform-origin:0 0"></iframe></div>`).join("")}
</body></html>`);
await wait(3);
await caption("Compass runs dispatch on its own. The control room watches it on wall screens, one panel per monitor, and steps in when it matters.");
await wait(7);

// 3. The operator console
await page.goto(`${base}/rooms/plant-1`);
await page.locator(".building").waitFor();
await caption("The operator console keeps the controls. This synthetic plant has three floors, seventy-two machines and twenty-four responders.");
await wait(3);
for (const floor of [2, 1]) { await page.locator(`[data-select-floor="${floor}"]`).click(); await wait(1.3); }
await page.locator("#view-iso").click(); await wait(2);
await page.locator("#view-2d").click(); await wait(1);

// Search palette and tiled layout
await page.keyboard.press("/");
await page.locator("#control-search-input").pressSequentially("Engr370", { delay: 90 });
await caption("Find any issue, station or responder from the keyboard, and arrange the floor, issues, feed and context as tiles.");
await wait(1.5);
await page.keyboard.press("Enter"); await wait(2);

// 3. One live AMD record: the right responder, then the right fix
await page.getByRole("button", { name: "Maximise Dispatch / context" }).click();
await page.locator("#stations-tab").click();
// The panel re-renders on every poll, so click from inside the page once each row exists.
const clickInPage = async (selector) => {
  await page.waitForSelector(selector, { state: "attached" });
  await page.evaluate((sel) => { const el = document.querySelector(sel); el.scrollIntoView({ block: "center" }); el.click(); }, selector);
};
await clickInPage(`[data-station-id="${stationId}"]`);
await wait(1);
await clickInPage(`[data-station-history-issue-id="${issueId}"]`);
await page.locator(".fix-panel").first().waitFor();
await caption("A live record. Code establishes eligibility, travel time and observed history; Compass, on AMD Token Factory with MiMo-V2.6-Flash, ranks only the eligible responders it is given.");
await wait(6);
const scrollTo = async (text) => { await page.getByText(text).first().evaluate((node) => node.scrollIntoView({ behavior: "smooth", block: "start" })); await wait(1.2); };
await scrollTo("Initial assignment Compass analysis");
await caption("The nearest responder has a thin record on this fault. Compass ranked Engr370 first: a hundred and ten similar cases, the same half-minute away, and explained why.");
await wait(8);
await page.locator(".fix-panel").first().evaluate((node) => node.scrollIntoView({ behavior: "smooth", block: "start" }));
await wait(1.2);
await caption("Compass then ranks the troubleshooting procedures for the observed symptom, from what actually worked on comparable repairs. Code supplies the procedures and the evidence.");
await wait(7);
await page.locator(".fix-panel details").first().evaluate((node) => { node.open = true; node.scrollIntoView({ behavior: "smooth", block: "start" }); });
await wait(1.2);
await caption("Each procedure's observed success on this symptom is shown. The most common fix is the baseline, and any disagreement is recorded.");
await wait(6);
await scrollTo("Applied fixes by attempt");
await caption("Engr370 applied the top-ranked procedure and fixed it first time, in seven minutes. If an attempt fails, the issue reopens and the next procedure is tried.");
await wait(7);
await page.getByRole("button", { name: "Restore Dispatch / context" }).click();

// 4. Overtime, decided by central command
await page.getByRole("button", { name: "Maximise Staffing" }).click();
await page.getByRole("button", { name: "Approve top option" }).waitFor();
await caption("When the backlog outgrows the shift, code lists only the legal overtime options. Compass ranks them; nothing changes until central command decides.");
await wait(7);
await page.locator("#staffing-tile details").first().evaluate((node) => { node.open = true; node.scrollIntoView({ behavior: "smooth", block: "start" }); });
await wait(1.2);
await caption("Each option shows duty and rest hours and observed coverage of the backlog. Unanswered recommendations expire; they are never applied by default.");
await wait(6);
await page.getByRole("button", { name: "Approve top option" }).evaluate((node) => node.scrollIntoView({ behavior: "smooth", block: "center" }));
await wait(1);
await page.getByRole("button", { name: "Approve top option" }).click();
// Show the recorded decision, not the in-flight button state.
await page.locator("#staffing-tile .staffing-decisions").getByText(/approved/i).first().waitFor({ timeout: 30_000 });
await page.locator("#staffing-tile").getByText("Recent decisions").first().evaluate((node) => node.scrollIntoView({ behavior: "smooth", block: "start" }));
await wait(1.2);
await caption("Central command approves the extension. The decision, and who made it, goes into the audit trail.");
await wait(6);
await page.getByRole("button", { name: "Restore Staffing" }).click();

// Offline Demo: the full dispatch loop on a fixed scenario, API-free
await page.getByRole("button", { name: "Offline Demo" }).click();
await page.getByRole("button", { name: "Reset Offline" }).click();
await page.getByRole("button", { name: "Maximise Dispatch / context" }).click();
await caption("Offline Demo replays a fixed scenario through the same dispatch path with no API calls, for training or when the model is unavailable.");
await wait(3);
await page.getByRole("button", { name: "Raise Scenario A issue" }).click();
// Resolves once the panel shows any of the given states (later states count too).
const panelText = (texts, timeout = 30_000) => page.waitForFunction((needles) => {
  const content = document.querySelector("#recommendation-panel")?.textContent ?? "";
  return needles.some((needle) => content.includes(needle));
}, [].concat(texts), { timeout, polling: 200 });
// The fixed scenario moves on its own clock (offer, acceptance, support, outcome in about
// nine seconds), so each caption follows the state it describes.
await panelText(["Offer sent to", "Support offer sent", "Issue Reopened", "Issue Resolved"]);
await caption("Baselines and Compass's ranking drive an automatic offer; central command can override it.");
await panelText(["Support offer sent", "Issue Reopened", "Issue Resolved"]);
await caption("The responder accepts. This work is complex, so a second responder is offered support.");
await panelText(["Issue Reopened", "Issue Resolved"]);
await caption("Here the first attempt fails, so the issue reopens for another try, using the same resolution math as Live.");
await wait(4);
await page.getByRole("button", { name: "Restore Dispatch / context" }).click();
await page.getByRole("button", { name: "Live Simulation" }).click();
await page.locator(".building").waitFor();
await wait(1);

// 4. Analytics
await page.locator("#analytics-tab").click();
await page.locator("[data-analytics-level=MONTH]").click();
await page.locator("[data-analytics-level=MONTH][aria-selected=true]").waitFor();
await caption("A full simulated month: nearly three thousand issues in September, with a seventy-three percent first-time fix rate.");
await wait(5);
await page.locator("[data-analytics-level=WEEK]").click(); await wait(2);
const scrollToHeading = async (text) => {
  await page.getByRole("heading", { name: text }).first().evaluate((node) => window.scrollTo({ top: node.getBoundingClientRect().top + window.scrollY - 120, behavior: "smooth" }));
  await wait(1.2);
};
await scrollToHeading("Compass vs Baselines");
await caption("Every Compass ranking is compared with the nearest and naive-score baselines, and each disagreement can be inspected record by record.");
await wait(5);
await page.locator("#pareto-heading").evaluate((node) => window.scrollTo({ top: node.getBoundingClientRect().top + window.scrollY - 40, behavior: "smooth" }));
await page.locator(".pareto-svg").waitFor();
await wait(1.2);
await caption("The Issue Pareto shows which few problems cause most of the work: here, two of three issue classes account for eighty percent of September's issues.");
await wait(5);
await page.locator(".pareto-bar.drillable rect").first().click(); await wait(2.5);
await caption("Drill down from issue class to observed symptom to the fix that was applied, and switch to downtime or failed attempts.");
await page.locator(".pareto-bar.drillable rect").first().click(); await wait(2);
await page.locator('[data-pareto-measure="failedAttempts"]').click(); await wait(3);

// 5. Settings: one AMD model per role
await page.locator("#settings-tab").click();
await page.locator('[data-model-role="compass"]').waitFor();
// Keep the credential area out of frame (the recording copy has no key, and a real one
// must never be shown): hide everything above the Provider field for this shot.
await page.evaluate(() => {
  const provider = document.querySelector("#settings-provider");
  const section = provider.closest("section");
  for (const child of section.children) { if (child.contains(provider)) break; child.style.display = "none"; }
});
await caption("Ranking and event planning each run on their own AMD Token Factory model. Rate limits, bounded retries and a circuit breaker control requests.");
await wait(6);
await caption("If a model is slow or fails, dispatch falls back deterministically, and the simulation clock keeps moving.");
await wait(4);

// 6. Closing card
await page.setContent(card("ResponseCompass", [["The right responder. The right fix.", "#0F8B8D", 700], ["Runs autonomously. Supervised by your control room.", "#5B6474", 400], ["Built on AMD Token Factory.", "#5B6474", 400]]));
await wait(5);

await context.close();
await browser.close();
const [file] = (await readdir(tmpDir)).filter((name) => name.endsWith(".webm"));
await rename(join(tmpDir, file), join(outDir, "ResponseCompass-demo.webm"));
await rm(tmpDir, { recursive: true, force: true });
console.log("wrote docs/submission/ResponseCompass-demo.webm");
