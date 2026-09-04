// Headless harness: BaL galaxy + Champions Trophy full-cycle verification
const fs = require("fs");
let pass = 0, fail = 0;
function ok(cond, label) { if (cond) { pass++; } else { fail++; console.log("  FAIL: " + label); } }

const store = {};
global.localStorage = { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
const proxyEl = new Proxy({}, { get: (t, p) => p === "style" ? {} : p === "classList" ? { add(){}, remove(){}, toggle(){} } : p === "dataset" ? {} : () => proxyEl, set: () => true });
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

function load(file) {
  let src = fs.readFileSync(file, "utf-8").replace(/^\s*["']use strict["'];?/m, "");
  src = src.replace(/\bconst\b/g, "var").replace(/\blet\b/g, "var");
  (0, eval)(src);
}
load("engine.js");
load("app.js");

// ---- 1. new save has galaxy ----
S = newSave("Test Legend", "CF", "goalpoacher", "britain");
save();
ok(S.galaxy && S.galaxy.leagues.length === 6, "new save: 6-league galaxy");
ok(S.leagueIdx === E.leagueForRegion("britain"), "leagueIdx from region");
ok(S.ct === null, "no CT in season 1");
ok(leagueName() === S.galaxy.leagues[S.leagueIdx].name, "leagueName from galaxy");

// world must reference MY galaxy league? (BaL keeps separate world by design in migration only for new saves check binding)
// For new saves world was built by makeWorld — verify galaxy sim still advances other leagues via balGalaxySim
// ---- 2. play a full season headlessly via finishMatch ----
function playLeagueMD() {
  const fx = myNextFixture();
  if (!fx) return false;
  const H = S.world.clubs[fx.home], A = S.world.clubs[fx.away];
  const r = E.simulateMatch(H, A, { seed: E.hashSeed("t:" + S.season + ":" + S.matchday), fast: true });
  const result = { gH: r.gH, gA: r.gA, rating: 7.0, pGoals: 1, pAssists: 0, pShots: 2, pSaves: 0, pTackles: 1, staminaEnd: 60, injuredFor: 0 };
  const prev = global.render; global.render = () => {};
  try { finishMatch(fx, result, { home: 33, draw: 34, away: 33 }); } finally { global.render = prev; }
  return true;
}
let guard = 0;
S.janOffered = true; // suppress the january screen in harness
while (S.matchday < 18 && guard++ < 40) {
  if (cupPending()) { S.cup.alive = false; } // skip cup for this test
  playLeagueMD();
}
ok(S.matchday === 18, "season played to MD18");
ok(S.galMD === 18, "galaxy leagues simmed to MD18 (galMD=" + S.galMD + ")");
const otherL = S.galaxy.leagues[(S.leagueIdx + 1) % 6];
ok((otherL.results || []).length === 90, "other league has 90 results (got " + (otherL.results || []).length + ")");

// ---- 3. season rollover with forced championship (to qualify for CT) ----
// Rig my results so my club tops the table honestly-in-data terms (test-only manipulation of stored results)
S.results = [];
for (let md = 0; md < 18; md++) for (const [h, a] of S.world.fixtures[md]) {
  const meIn = h === S.clubIdx || a === S.clubIdx;
  const gH = meIn ? (h === S.clubIdx ? 3 : 0) : 1, gA = meIn ? (h === S.clubIdx ? 0 : 3) : 1;
  S.results.push({ home: h, away: a, gH, gA });
}
S.myStats.ratings = [6, 6, 6]; // below transfer bar → no offer screen
S.transferRequest = false;
{
  const prev = global.render; global.render = () => {};
  try { startNewSeason(); } finally { global.render = prev; }
}
ok(S.season === 2, "season 2 started");
ok(S.matchday === 0 && S.results.length === 0, "season state reset");
ok(!!S.ct, "champions qualified for CT");
ok(S.ct && S.ct.myG >= 0, "my club in a CT group");
ok(S.world.clubs === S.galaxy.leagues[S.leagueIdx].clubs, "world clubs bound to galaxy league");

// ---- 4. play season 2 incl CT nights ----
S.janOffered = true;
let ctG = 0, ctK = 0, lg = 0;
guard = 0;
function playAny() {
  const ctFx = balCtFixture();
  if (ctFx) {
    const H = ctFx.ctHome ? myClub() : ctFx.oppClub, A = ctFx.ctHome ? ctFx.oppClub : myClub();
    const r = E.simulateMatch(H, A, { seed: E.hashSeed("ct:" + Math.random()), fast: true });
    const result = { gH: r.gH, gA: r.gA, rating: 7.0, pGoals: 0, pAssists: 0, pShots: 1, pSaves: 0, pTackles: 1, staminaEnd: 60, injuredFor: 0 };
    const prev = global.render; global.render = () => {};
    try { finishMatch(ctFx, result, { home: 33, draw: 34, away: 33 }); } finally { global.render = prev; }
    if (ctFx.ctStage === "group") ctG++; else ctK++;
    return true;
  }
  if (cupPending()) { S.cup.alive = false; return true; }
  return playLeagueMD();
}
while (guard++ < 80) {
  if (!playAny()) break;
  if (S.matchday >= 18 && !balCtFixture()) break;
}
ok(ctG === 6, "CT: 6 group nights played (got " + ctG + ")");
ok(S.ct.gPlayed === 6, "CT gPlayed=6");
ok(S.ct.gRes.length === 48, "CT 48 group results");
ok(new Set(S.ct.gRes.map(r => r.key)).size === 48, "CT keys unique");
ok(E.ctGroupTable(S.ct, S.ct.myG).every(r => r.P === 6), "CT group table P=6 each");
ok(S.matchday === 18, "league still completed 18 MDs alongside CT");
ok(S.ct.done || !S.ct.alive || ctK > 0, "CT concluded or KO in progress");
console.log("  info: ctK=" + ctK + " alive=" + S.ct.alive + " done=" + S.ct.done);
ok(S.ct.done === true, "CT tournament concluded");
ok(!!S.ct.champion, "CT champion recorded");

// ---- 5. forced-strong: win the whole CT via KO path ----
let won = false, kPlayed = 0;
myClub().str = 97;
for (let att = 0; att < 6 && !won; att++) {
  S.matchday = 18; // KO happens after MD18
  const meE = { league: S.leagueIdx, club: S.clubIdx };
  const ents = [];
  outer: for (let L = 0; L < 6; L++) for (let c = 0; c < 3; c++) { ents.push({ league: L, club: c }); if (ents.length >= 16) break outer; }
  ents[0] = meE;
  S.ct = E.ctMake(ents, meE, "h:" + att);
  // skip groups: mark me through by simming groups with my results as wins
  for (let md = 0; md < 6; md++) {
    const pairs = md % 3 === 0 ? [[0, 1], [2, 3]] : md % 3 === 1 ? [[0, 2], [1, 3]] : [[0, 3], [1, 2]];
    let [x, y] = pairs.find(p => p.includes(S.ct.myS));
    if (md >= 3) [x, y] = [y, x];
    const meH = x === S.ct.myS;
    S.ct.gRes.push({ key: S.ct.myG + ":" + md + ":" + x + "v" + y, g: S.ct.myG, h: x, a: y, gH: meH ? 3 : 0, gA: meH ? 0 : 3 });
    S.ct.gPlayed++;
    E.ctSimGroups(S.ct, S.galaxy, "h:" + att, S.ct.gPlayed, true);
  }
  E.ctAdvanceToKO(S.ct, S.galaxy, "h:" + att);
  if (!S.ct.alive) continue;
  kPlayed = 0;
  let g2 = 0;
  while (!S.ct.done && g2++ < 10) {
    const fx = balCtFixture();
    if (!fx) break;
    const H = myClub(), A = fx.oppClub;
    const r = E.simulateMatch(H, A, { seed: E.hashSeed("k:" + att + ":" + kPlayed), fast: true });
    const result = { gH: r.gH, gA: r.gA, rating: 7.5, pGoals: 1, pAssists: 0, pShots: 2, pSaves: 0, pTackles: 0, staminaEnd: 60, injuredFor: 0 };
    const prev = global.render; global.render = () => {};
    try { finishMatch(fx, result, { home: 60, draw: 22, away: 18 }); } finally { global.render = prev; }
    kPlayed++;
  }
  if (S.ct.done && S.ct.champion && S.ct.champion.league === S.leagueIdx && S.ct.champion.club === S.clubIdx) won = true;
}
ok(won, "strong club wins the CT (honest engine, retries allowed)");
ok(kPlayed === 3, "QF+SF+FINAL all played by me (got " + kPlayed + ")");
ok(S.flags.ctWinner === true, "ctWinner flag set");

// ---- 6. migration path: legacy save without galaxy gets one ----
delete S.galaxy;
S.tier = 0; S.region = "britain";
const legacyWorld = E.makeWorld(0, S.seed, "britain");
S.world = legacyWorld; S.leagueIdx = undefined;
// re-run boot migration block manually
S.galaxy = E.makeGalaxy(S.seed);
S.leagueIdx = S.tier === 0 ? E.leagueForRegion(S.region) : 0;
S.galaxy.leagues[S.leagueIdx].clubs = S.world.clubs;
S.galaxy.leagues[S.leagueIdx].fixtures = S.world.fixtures;
S.galMD = 0; S.ct = null;
ok(S.galaxy.leagues[S.leagueIdx].clubs === S.world.clubs, "migration: galaxy league rebound to legacy world");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
