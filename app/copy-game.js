// Copies the game (de-versioned) into www/ for Capacitor.
const fs = require("fs"), path = require("path");
const SRC = path.join(__dirname, "..", "game");
const OUT = path.join(__dirname, "www");
fs.mkdirSync(OUT, { recursive: true });
for (const f of ["engine.js", "app.js", "ml.js", "cloud.js", "vendor-supabase.js", "style.css", "appicon.png", "splash.png"]) {
  const src = path.join(SRC, f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(OUT, f));
}
// index.html: reference plain filenames (no cache-busting needed inside an app bundle)
let html = fs.readFileSync(path.join(SRC, "index.html"), "utf8")
  .replace(/engine\.\d+\.js/g, "engine.js")
  .replace(/app\.\d+\.js/g, "app.js")
  .replace(/ml\.\d+\.js/g, "ml.js")
  .replace(/cloud\.\d+\.js/g, "cloud.js")
  .replace(/style\.\d+\.css/g, "style.css");
fs.writeFileSync(path.join(OUT, "index.html"), html);
console.log("game copied to www/ from ../game");
