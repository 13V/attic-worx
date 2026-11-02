// Render the promo frame by frame from promo.html.
//   node render.cjs <fmt 1x1|9x16|4x5> <master.mp4> --work <dir> [--cta web|ad]   near-lossless master, no sound
//   node render.cjs <fmt> --stills <outdir> --work <dir> <t> [<t> ...]            PNG stills at those seconds
// <dir> holds prep.py's frames. The edit list (edl.json, next to this file) is injected as window.EDL.
// build.sh runs this and then adds the voice and makes the delivery files. Needs Playwright.
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const args = process.argv.slice(2);
const fmt = args[0];
const SIZE = { "1x1": [1080, 1080], "9x16": [1080, 1920], "4x5": [1080, 1350] }[fmt];
if (!SIZE) throw new Error("format must be 1x1, 9x16 or 4x5");
const opt = name => { const i = args.indexOf(name); if (i < 0) return ""; const v = args[i + 1]; args.splice(i, 2); return v; };
const cta = opt("--cta");
const work = path.resolve(opt("--work") || "");
const EDL = JSON.parse(fs.readFileSync(path.join(__dirname, "edl.json"), "utf8"));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: SIZE[0], height: SIZE[1] }, deviceScaleFactor: 1 });
  await page.addInitScript(([edl, work]) => { window.EDL = edl; window.WORK = work; }, [EDL, work]);
  await page.goto("file://" + path.join(__dirname, "promo.html") + `?fmt=${fmt}` + (cta ? `&cta=${cta}` : ""));
  await page.evaluate(() => window.ready);
  const total = await page.evaluate(() => window.TOTAL);

  if (args[1] === "--stills") {
    const dir = args[2];
    fs.mkdirSync(dir, { recursive: true });
    for (const t of args.slice(3)) {
      await page.evaluate(t => window.renderAt(t), +t);
      await page.screenshot({ path: path.join(dir, `${fmt}-${t}.png`) });
    }
    await browser.close();
    return;
  }

  const out = args[1];
  const n = Math.round(total * EDL.fps);
  const ff = spawn("ffmpeg", [
    "-v", "error", "-y", "-f", "image2pipe", "-framerate", String(EDL.fps), "-c:v", "png", "-i", "-",
    "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
    "-c:v", "libx264", "-preset", "fast", "-crf", "8", "-g", "30",
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
    "-map_metadata", "-1", out,
  ], { stdio: ["pipe", "inherit", "inherit"] });

  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    await page.evaluate(t => window.renderAt(t), i / EDL.fps);
    const buf = await page.screenshot({ type: "png" });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once("drain", r));
    if (i % 60 === 0) console.log(`${fmt} frame ${i}/${n} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on("close", r));
  await browser.close();
  console.log("done", out, n, "frames");
})();
