#!/usr/bin/env node
// Sync game assets -> cache-busted twins + stamp index.html / play.html.
// The wrapped Android build uses the plain filenames (see app/copy-game.js), so both must
// always hold identical bytes. Run after any change to app/engine/ml/cloud/style:
//   node scripts/sync-assets.js            # version = current unix seconds
//   node scripts/sync-assets.js 1790971400 # explicit version
const fs = require("fs"), path = require("path");
const GAME = path.join(__dirname, "..", "game");
const FILES = ["app.js", "engine.js", "ml.js", "cloud.js", "style.css"];
const version = process.argv[2] || String(Math.floor(Date.now() / 1000));

for (const f of FILES) {
  const ext = path.extname(f);
  const out = f.slice(0, -ext.length) + "." + version + ext;
  fs.copyFileSync(path.join(GAME, f), path.join(GAME, out));
  console.log("game/" + f + "  ->  game/" + out);
}

for (const page of ["index.html", "play.html"]) {
  const p = path.join(GAME, page);
  if (!fs.existsSync(p)) continue;
  const html = fs.readFileSync(p, "utf8")
    .replace(/(app|engine|ml|cloud)\.\d+\.js/g, "$1." + version + ".js")
    .replace(/style\.\d+\.css/g, "style." + version + ".css");
  fs.writeFileSync(p, html);
  console.log("stamped " + page + " @ " + version);
}

// sanity: twins must match their sources byte-for-byte
let bad = 0;
for (const f of FILES) {
  const ext = path.extname(f);
  const twin = f.slice(0, -ext.length) + "." + version + ext;
  const a = fs.readFileSync(path.join(GAME, f));
  const b = fs.readFileSync(path.join(GAME, twin));
  if (!a.equals(b)) { console.error("MISMATCH: " + twin); bad++; }
}
console.log(bad ? "asset sync FAILED" : "asset twins verified identical");
process.exit(bad ? 1 : 0);
