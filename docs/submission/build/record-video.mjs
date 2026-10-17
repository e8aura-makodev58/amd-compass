// Records the demo walkthrough as a 1920×1080 WebM with burned-in captions.
// Run against a paused scratch copy of the room with providers forced off, so the
// footage shows saved records only and nothing changes while recording.
//
// Usage: node docs/submission/build/record-video.mjs <baseUrl> <issueId> <stationId>
//   issueId: a resolved issue whose Compass ranking came from AMD (modelInfo.provider "amd").
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
    await page.waitForTimeout(1500);
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

// 1. Opening card
await page.setContent(card("ResponseCompass", [["The right responder. The right fix.", "#0F8B8D", 700], ["Learned from every past repair.", "#5B6474", 400]]));
await wait(5);

// 2. Room picker and Live Floor
await page.goto(base);
await caption("When equipment fails, the nearest technician may not be the best match. ResponseCompass helps a control room choose who to send, and shows why.");
await wait(7);
await page.goto(`${base}/rooms/plant-1`);
await page.locator(".building").waitFor();
await caption("This synthetic plant has three floors, seventy-two machines and twenty-four responders. Each control room keeps its own clock and history.");
await wait(4);
for (const floor of [2, 3, 1]) { await page.locator(`[data-select-floor="${floor}"]`).click(); await wait(1.6); }
await page.locator("#view-iso").click(); await wait(3.5);
await page.locator("#view-2d").click(); await wait(1.5);

// 3. A saved AMD ranking, opened from the station's issue history
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
await caption("Code establishes eligibility, travel time and observed history. Compass, running live on AMD Token Factory with MiMo-V2.6-Flash, ranks only the eligible candidates it is given.");
await wait(7);
const scrollTo = async (text) => { await page.getByText(text).first().evaluate((node) => node.scrollIntoView({ behavior: "smooth", block: "start" })); await wait(1.2); };
await scrollTo("Initial assignment Compass analysis");
await caption("The nearest responder is under a minute away but has little history with this fault. Compass ranked Engr370 first and explained why; both baselines chose someone else.");
await wait(10);
await scrollTo("Response and resolution");
await caption("Engr370 accepted the offer and resolved the issue first time, in eleven minutes. Every step, and the action taken, is in the audit trail.");
await wait(8);
await page.getByRole("button", { name: "Restore Dispatch / context" }).click();

// 4. Analytics
await page.locator("#analytics-tab").click();
await page.locator("[data-analytics-level=MONTH]").click();
await page.locator("[data-analytics-level=MONTH][aria-selected=true]").waitFor();
await caption("A full simulated month: nearly three thousand issues raised in September. Charts show activity and equipment downtime.");
await wait(7);
await page.locator("[data-analytics-level=WEEK]").click(); await wait(3);
await page.locator("[data-analytics-level=DAY]").click(); await wait(3);
await caption("Summaries show denominators, suppress thin samples and never rank people.");
await page.mouse.wheel(0, 900); await wait(5);
await page.mouse.wheel(0, 900); await wait(4);

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
await wait(7);
await caption("If a model is slow or fails, dispatch falls back deterministically, and the simulation clock keeps moving.");
await wait(6);

// 6. Closing card
await page.setContent(card("ResponseCompass", [["Next: recommending the fix from past resolutions.", "#5B6474", 400], ["The right responder. The right fix.", "#0F8B8D", 700]]));
await wait(6);

await context.close();
await browser.close();
const [file] = (await readdir(tmpDir)).filter((name) => name.endsWith(".webm"));
await rename(join(tmpDir, file), join(outDir, "ResponseCompass-demo.webm"));
await rm(tmpDir, { recursive: true, force: true });
console.log("wrote docs/submission/ResponseCompass-demo.webm");
