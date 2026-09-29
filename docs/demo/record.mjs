// Drives the F.O.D. Hunter operator and worker consoles and records a video.
import { chromium } from "playwright";

const W = 1600, H = 900;
const browser = await chromium.launch({ channel: "msedge" });
const context = await browser.newContext({
  viewport: { width: W, height: H },
  recordVideo: { dir: "out", size: { width: W, height: H } },
});

// Recordings don't include the OS cursor, so draw one.
await context.addInitScript(() => {
  addEventListener("DOMContentLoaded", () => {
    const c = document.createElement("div");
    c.style.cssText = "position:fixed;z-index:2147483647;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgba(226,35,26,.85);box-shadow:0 0 0 3px rgba(255,255,255,.7);pointer-events:none;transition:transform .12s;left:-50px;top:-50px";
    document.body.appendChild(c);
    addEventListener("mousemove", e => { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; }, true);
    addEventListener("mousedown", () => (c.style.transform = "scale(.7)"), true);
    addEventListener("mouseup", () => (c.style.transform = "scale(1)"), true);
  });
});

const page = await context.newPage();
const pause = ms => page.waitForTimeout(ms);
async function glide(locator) {
  const b = await locator.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 28 });
  await pause(250);
}
async function clickOn(locator) { await glide(locator); await locator.click(); }

const logged = [];
async function logTrack(desc, priority) {
  let card;
  for (;;) {
    const cards = page.locator(".cue-card:not(.ghost)");
    const n = await cards.count();
    for (let i = 0; i < n && !card; i++) {
      const id = (await cards.nth(i).locator(".track-id").textContent()).trim();
      if (!logged.includes(id)) { card = cards.nth(i); logged.push(id); }
    }
    if (card) break;
    await pause(200);
  }
  await clickOn(card.locator(".track-id"));
  await pause(500);
  const text = page.locator("textarea.description-input");
  await clickOn(text);
  await text.pressSequentially(desc, { delay: 38 });
  await pause(300);
  await clickOn(page.locator("select.priority-select"));
  await page.locator("select.priority-select").selectOption(priority);
  await pause(400);
  await clickOn(page.locator(".commit-btn"));
  await pause(1800);
}

await page.goto("http://localhost:5173/");
await page.mouse.move(W / 2, H / 2);
await pause(5500);                       // drone feed + live detections
await logTrack("Claw hammer on the flight deck", "CRITICAL");
await pause(2500);
await logTrack("Second hammer, same lane", "HIGH");
await pause(2000);

await page.goto("http://localhost:5173/worker");
await page.mouse.move(W / 2, H / 3);
await pause(2000);
await clickOn(page.locator(".resolve-btn").first());
await pause(1600);
await clickOn(page.locator(".resolve-btn").first());
await page.mouse.move(W / 2, H * 0.6, { steps: 20 });
await pause(2200);

await context.close();
await browser.close();
