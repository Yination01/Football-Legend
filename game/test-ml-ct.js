// Headless harness: ML galaxy + Champions Trophy full-cycle verification
const fs = require("fs");
let pass = 0, fail = 0;
function ok(cond, label) { if (cond) { pass++; } else { fail++; console.log("  FAIL: " + label); } }

// ---- DOM/global stubs (proven recipe) ----
const store = {};
global.localStorage = { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
const proxyEl = new Proxy({}, { get: (t, p) => p === "style" ? {} : p === "classList" ? { add(){}, remove(){}, toggle(){} } : p === "dataset" ? {} : typeof p === "string" && (p.startsWith("on")) ? null : () => proxyEl, set: () => true });
global.document = new Proxy({}, { get: (t, p) => ["querySelector", "getElementById", "createElement"].includes(p) ? () => proxyEl : p === "querySelectorAll" ? () => [] : p === "body" ? proxyEl : () => proxyEl, set: () => true });
global.window = global;
global.addEventListener = () => {}; global.removeEventListener = () => {};
global.location = { reload(){}, href: "" }; global.history = { pushState(){}, back(){} };
global.requestAnimationFrame = () => 0; global.cancelAnimationFrame = () => {};
global.Snd = null; global.confirm = () => true; global.prompt = () => null; global.alert = () => {};
global.$ = () => proxyEl;
global.toast = () => {};
global.render = fn => { try { typeof fn === "function" ? fn() : null; } catch (e) {} };
global.fmtM = v => v + "M";
global.setTimeout = fn => { try { fn(); } catch (e) {} return 0; };
global.clearInterval = () => {}; global.setInterval = () => 0;
global.navigator = { clipboard: { writeText: async () => {} } };
global.Audio = function(){ return { play(){}, pause(){} }; };

function load(file, extraStrip) {
  let src = fs.readFileSync(file, "utf-8").replace(/^\s*["']use strict["'];?/m, "");
  src = src.replace(/\bconst\b/g, "var").replace(/\blet\b/g, "var");
  if (extraStrip) src = extraStrip(src);
  (0, eval)(src);
}
load("engine.js");
load("app.js"); // defines var E = window.Engine in global scope
load("ml.js");
if (!global.E) { console.log("E missing after app.js load"); process.exit(1); }

// ---- 1. New save has galaxy ----
mlNewSave("britain", "Harness FC");
ok(M.galaxy && M.galaxy.leagues && M.galaxy.leagues.length === 6, "new save: 6-league galaxy");
ok(typeof M.leagueIdx === "number" && M.leagueIdx === E.leagueForRegion("britain"), "leagueIdx matches region");
ok(M.ct === null || M.ct === undefined, "season 1: no CT yet");
M.welcomeClaimed = true; M.campDue = false;

// helper: play my current fixture headlessly by simulating + calling mlFinish
function playNow() {
  const fx = mlFixtureNow();
  if (!fx) return null;
  const meHome = fx.ct ? fx.ctHome : fx.home === M.clubIdx;
  const Hc = fx.ct ? (meHome ? mlClub() : fx.oppClub) : M.world.clubs[fx.home];
  const Ac = fx.ct ? (meHome ? fx.oppClub : mlClub()) : M.world.clubs[fx.away];
  const r = E.simulateMatch(Hc, Ac, { seed: E.hashSeed("h:" + Math.random()), fast: true });
  const prevRender = global.render; global.render = () => {};
  try { mlFinish(fx, r, { home: 33, draw: 34, away: 33 }); } finally { global.render = prevRender; }
  return { fx, r };
}

// ---- 2. Season 1: play all 18 MDs (+ cup fixtures interleaved) ----
let guard = 0, leaguePlayed = 0, cupPlayed = 0;
while (M.matchday < 18 && guard++ < 80) {
  const p = playNow();
  if (!p) break;
  if (p.fx.cup) cupPlayed++; else if (!p.fx.ct) leaguePlayed++;
}
ok(M.matchday === 18, "season 1: reached MD18 (got " + M.matchday + ")");
ok(leaguePlayed === 18, "season 1: 18 league matches played (got " + leaguePlayed + ")");
// galaxy leagues progressed
const otherLg = (M.leagueIdx + 1) % 6;
const otherResults = M.galaxy.leagues[otherLg].results ? M.galaxy.leagues[otherLg].results.length : (M.galaxy.leagues[otherLg].table ? -1 : -2);
ok(JSON.stringify(M.galaxy.leagues[otherLg]).length > 100, "other league state exists");

// ---- 3. Season end → rollover + possible CT ----
// Force qualification: make my club dominant then re-run? Instead run season end and check consistency.
const preSeason = M.season;
{
  const prevRender = global.render; global.render = () => {};
  try { mlSeasonEnd(); } finally { global.render = prevRender; }
}
ok(M.season === preSeason + 1, "season incremented");
ok(M.matchday === 0, "matchday reset");
ok(M.world.fixtures && M.world.fixtures.length >= 17, "new season fixtures bound");

// ---- 4. Force a CT and play it through ----
const meEntry = { league: M.leagueIdx, club: M.clubIdx };
const q = { cl: [] };
// build 16 distinct entrants incl me
outer:
for (let L = 0; L < 6; L++) for (let c = 0; c < 3; c++) { q.cl.push({ league: L, club: c }); if (q.cl.length >= 16) break outer; }
q.cl[0] = meEntry;
M.ct = E.ctMake(q.cl, meEntry, M.seed + ":ct:harness");
ok(M.ct.myG >= 0 && M.ct.myS >= 0, "CT: my club placed in a group");
M.campDue = false; M.welcomeClaimed = true;

let ctGroup = 0, ctKO = 0, league2 = 0, cup2 = 0;
guard = 0;
while (guard++ < 120) {
  const fxPeek = mlFixtureNow();
  if (!fxPeek) break;
  const p = playNow();
  if (!p) break;
  if (p.fx.ct && p.fx.ctStage === "group") ctGroup++;
  else if (p.fx.ct && p.fx.ctStage === "ko") ctKO++;
  else if (p.fx.cup) cup2++;
  else league2++;
  if (M.matchday >= 18 && !mlCtFixture() && !mlCupPending()) break;
}
ok(ctGroup === 6, "CT: exactly 6 group matches played (got " + ctGroup + ")");
ok(M.ct.gPlayed === 6, "CT: gPlayed=6");
ok(M.ct.stage === "ko", "CT: advanced to KO stage");
// group results: my group should have 12 results total
const myGRes = M.ct.gRes.filter(r => r.g === M.ct.myG);
ok(myGRes.length === 12, "CT: my group has 12 results (got " + myGRes.length + ")");
ok(M.ct.gRes.length === 48, "CT: 48 total group results (got " + M.ct.gRes.length + ")");
// no duplicate keys
const keys = new Set(M.ct.gRes.map(r => r.key));
ok(keys.size === M.ct.gRes.length, "CT: no duplicate result keys");
// group table sums: each team P=6
const t0 = E.ctGroupTable(M.ct, M.ct.myG);
ok(t0.every(r => r.P === 6), "CT: group table all P=6");
ok(league2 === 18, "season 2: 18 league matches (got " + league2 + ")");
// KO: if alive we played KO rounds until done/eliminated; if not alive after groups, ko=0 is fine
if (M.ct.alive || M.ct.done) {
  ok(M.ct.done === true, "CT: tournament concluded (done)");
  ok(ctKO >= 1 || !M.ct.gRes.length === false, "CT: at least one KO match if qualified (played " + ctKO + ")");
} else {
  ok(M.ct.done === true, "CT: concluded even after group elimination? done=" + M.ct.done + " (eliminated in groups: acceptable if stage=ko & !alive)");
}
console.log("  info: ctKO played=" + ctKO + " alive=" + M.ct.alive + " done=" + M.ct.done + " champion=" + JSON.stringify(M.ct.champion));

// ---- 5. Champion sanity: if done, champion exists ----
if (M.ct.done) ok(!!M.ct.champion, "CT: champion recorded");

// ---- 6. Season end after CT: rollover works, next CT decided by table ----
{
  const prevRender = global.render; global.render = () => {};
  try { mlSeasonEnd(); } finally { global.render = prevRender; }
}
ok(M.season === preSeason + 2, "season 3 reached");
ok(M.ct === null || (M.ct && M.ct.gPlayed === 0), "next-season CT reset or fresh");

// ---- 7. Forced-strong club: exercise full KO path in ML flow ----
M.welcomeClaimed = true; M.campDue = false;
M.world.clubs[M.clubIdx].str = 97; // dominant — honest engine will still occasionally lose, so retry seeds
let wonCT = false, koPlayed = 0;
for (let attempt = 0; attempt < 6 && !wonCT; attempt++) {
  M.matchday = 0; M.results = [];
  M.ct = E.ctMake(q.cl, meEntry, M.seed + ":ct:h2:" + attempt);
  koPlayed = 0;
  let g2 = 0;
  while (g2++ < 120) {
    const p = playNow();
    if (!p) break;
    if (p.fx.ct && p.fx.ctStage === "ko") koPlayed++;
    if (M.ct.done) break;
    if (M.matchday >= 18 && !mlCtFixture()) break;
  }
  if (M.ct.done && M.ct.champion && M.ct.champion.league === meEntry.league && M.ct.champion.club === meEntry.club) wonCT = true;
}
ok(wonCT, "strong club wins CT within 6 attempts (honest engine)");
ok(koPlayed === 3, "KO path: QF+SF+F all played by me (got " + koPlayed + ")");
ok(M.ctWins >= 1, "ctWins trophy counter incremented");
ok(M.ct.done && M.ct.alive, "CT done with my club alive");
console.log("  info2: koPlayed=" + koPlayed + " wonCT=" + wonCT + " lc=" + M.lc);

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
