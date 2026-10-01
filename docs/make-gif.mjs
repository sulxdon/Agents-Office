// Assemble docs/assets/office-live.gif from docs/assets/frames/*.png.
// Pure JS (UPNG decode -> gifenc encode). Usage: `node docs/make-gif.mjs`.
import fs from "node:fs";
import UPNG from "upng-js";
import gifenc from "gifenc";

const { GIFEncoder, quantize, applyPalette } = gifenc;

const FRAMES = "docs/assets/frames";
const files = fs.readdirSync(FRAMES).filter((f) => f.endsWith(".png")).sort();
if (files.length === 0) throw new Error("no frames — run docs/capture.mjs first");

const first = UPNG.decode(fs.readFileSync(`${FRAMES}/${files[0]}`));
const { width, height } = first;
const gif = GIFEncoder();
const delay = 750; // ms per frame, matches capture cadence

for (const f of files) {
  const img = UPNG.decode(fs.readFileSync(`${FRAMES}/${f}`));
  const rgba = new Uint8Array(UPNG.toRGBA8(img)[0]);
  const palette = quantize(rgba, 256, { format: "rgba4444" });
  const index = applyPalette(rgba, palette, "rgba4444");
  gif.writeFrame(index, width, height, { palette, delay });
}
gif.finish();
fs.writeFileSync("docs/assets/office-live.gif", Buffer.from(gif.bytes()));
const kb = Math.round(fs.statSync("docs/assets/office-live.gif").size / 1024);
console.log(`GIF_OK frames=${files.length} size=${kb}KB`);
