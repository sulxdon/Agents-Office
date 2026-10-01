// Full README capture: drives the real app and screenshots it.
// Usage: npm run dev (port 3000), then `node docs/capture.mjs`.
// Output: docs/assets/*.png + docs/assets/frames/*.png (GIF source).
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const OUT = "docs/assets";
const FRAMES = `${OUT}/frames`;
fs.mkdirSync(FRAMES, { recursive: true });
for (const f of fs.readdirSync(FRAMES)) fs.rmSync(path.join(FRAMES, f));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto("http://localhost:3000", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(3500);

// 1. Welcome tour (fresh profile).
await page.screenshot({ path: `${OUT}/welcome.png` });
console.log("shot welcome.png");

// 2. Walk the tour, fire the sample goal through the real pipeline.
await page.getByRole("button", { name: "Next" }).click();
await page.getByRole("button", { name: "Next" }).click();
await page.getByRole("button", { name: "Next" }).click();
await page.getByRole("button", { name: "Send sample goal" }).click();
await page.waitForTimeout(1500);
await page.getByRole("button", { name: "Start managing" }).click();

// 3. Let planning finish and workers get mid-run (tasks + bubbles visible).
await page.waitForTimeout(22000);
await page.screenshot({ path: `${OUT}/office-working.png` });
console.log("shot office-working.png");

// 4. GIF frames of the live canvas while the crew works.
const box = await page.locator("main canvas").boundingBox();
if (!box) throw new Error("canvas not found");
const clip = { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) };
for (let i = 0; i < 16; i++) {
  await page.screenshot({ path: `${FRAMES}/frame-${String(i).padStart(2, "0")}.png`, clip });
  await page.waitForTimeout(750);
}
console.log("frames done");

// 5. Wait for the run to finish, reset the camera, capture workspace views.
await page.waitForTimeout(40000);
await page.getByRole("button", { name: "Reset view" }).click();
await page.waitForTimeout(800);
const right = page.locator("aside").nth(1);
await right.getByRole("button", { name: "artifacts" }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/artifacts.png` });
console.log("shot artifacts.png");
await page.getByTitle("Open the manager brief").click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/brief.png` });
console.log("shot brief.png");
await right.getByRole("button", { name: "usage" }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/usage.png` });
console.log("shot usage.png");

// 6. Agent card last (roster click flies the camera).
const left = page.locator("aside").first();
await left.getByRole("button", { name: /maya/i }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/agent-card.png` });
console.log("shot agent-card.png");

// 7. Settings page.
await page.goto("http://localhost:3000/settings", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/settings.png` });
console.log("shot settings.png");

await browser.close();
console.log("CAPTURE_DONE");
