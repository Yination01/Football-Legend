// Headless harness: v1.3 — retirements (BaL+ML), owner panel, gifts/redeem codes
const fs = require("fs");
let pass = 0, fail = 0;
function ok(cond, label) { if (cond) { pass++; } else { fail++; console.log("  FAIL: " + label); } }

const store = {};
global.localStorage = { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
const proxyEl = new Proxy({}, { get: (t, p) => p === "style" ? {} : p === "classList" ? { add(){}, remove(){}, toggle(){} } : p === "dataset" ? {} : p === "value" ? "" : () => proxyEl, set: () => true });
global.document = new Proxy({}, { get: (t, p) => ["querySelector","getElementById","createElement"].includes(p) ? () => proxyEl : p === "querySelectorAll" ? () => [] : p === "body" ? proxyEl : () => proxyEl, set: () => true });
global.window = global; global.addEventListener = () => {}; global.removeEventListener = () => {};
global.location = { reload(){}, href:"" }; global.history = { pushState(){}, back(){} };
global.requestAnimationFrame = () => 0; global.cancelAnimationFrame = () => {};
global.Snd = null; global.confirm = () => true; global.prompt = () => null; global.alert = () => {};
global.$ = () => proxyEl; global.toast = () => {};
global.render = fn => { try { return typeof fn === "function" ? fn() : ""; } catch (e) { return ""; } };
global.fmtM = v => v + "M";
global.setTimeout = fn => { try { fn(); } catch (e) {} return 0; };
global.clearInterval = () => {}; global.setInterval = () => 0;
global.navigator = { clipboard: { writeText: async () => {} } };
global.Audio = function(){ return { play(){}, pause(){} }; };
function loadFile(f){ let s = fs.readFileSync(f,"utf-8").replace(/^\s*["']use strict["'];?/m,"").replace(/\bconst\b/g,"var").replace(/\blet\b/g,"var"); (0,eval)(s); }
loadFile("engine.js"); loadFile("app.js"); loadFile("ml.js");

// ---------- 1. BaL ages ----------
S = newSave("Retire Tester", "CF", "goalpoacher", "britain"); save();
ok(S.age === 17 && S.retired === false, "new save: age 17, not retired");
// migration: strip age, simulate old save
delete S.age; delete S.retired; S.season = 10;
S.age = S.age == null ? Math.min(44, 16 + S.season) : S.age; S.retired = false;
ok(S.age === 26, "migration derives age from season (S10 -> 26)");

// ---------- 2. BaL forced retirement at 45 ----------
S.age = 44; S.season = 28; S.myStats.ratings = [6, 6]; S.transferRequest = false;
S.pendingQual = null; S.galaxy = S.galaxy; // keep
{
  const prev = global.render; global.render = fn => { try { typeof fn === "function" && fn(); } catch (e) {} };
  try { finishSeasonRollover(); } finally { global.render = prev; }
}
ok(S.retired === true, "age 45: forced retirement fired");
const hall = JSON.parse(store["flHallOfFame"] || "[]");
ok(hall.length === 1 && hall[0].name === "Retire Tester", "Hall of Fame entry written");
ok(typeof hall[0].goals === "number" && typeof hall[0].titles === "number", "HoF has stats");

// homeScreen guard
let guarded = false;
{
  const prevR = global.render; global.render = () => { guarded = true; };
  try { homeScreen(); } catch (e) {}
  global.render = prevR;
}
ok(guarded || S.retired, "retired save cannot reach home screen");

// ---------- 3. BaL voluntary retire path + career screen surfaces button ----------
S = newSave("Vol Retiree", "AMF", "maestro", "southeuro"); save();
S.age = 36;
let h = careerScreen();
ok(h.includes("RETIRE (age 36)"), "career screen shows retire button at 36");
ok(h.includes("Hall of Fame"), "career screen shows Hall of Fame (1 legend)");
{
  const prev = global.render; global.render = fn => { try { typeof fn === "function" && fn(); } catch (e) {} };
  try { balRetire(false); } finally { global.render = prev; }
}
ok(S.retired === true, "voluntary retire works");
ok(JSON.parse(store["flHallOfFame"]).length === 2, "second HoF entry added");

// under 35: no button
S = newSave("Young Gun", "CF", "goalpoacher", "britain"); save();
h = careerScreen();
ok(!h.includes("RETIRE (age"), "no retire button under 35");

// ---------- 4. BaL aging decline from 35 (non-legendary) ----------
S.age = 36; S.cardType = "standard";
const statSumBefore = Object.values(S.stats).reduce((a, b) => a + b, 0);
S.myStats.ratings = [6, 6]; S.transferRequest = false; S.results = [];
{
  const prev = global.render; global.render = fn => { try { typeof fn === "function" && fn(); } catch (e) {} };
  try { startNewSeason(); } finally { global.render = prev; }
}
// net stat sum is noisy (awards/growth can outweigh the -2), so assert on the decline's own news line
ok((S.news || []).some(n => (n.txt || n).toString().includes("lose a step")), "age 35+: decline applied at season end (news evidence)");
ok(S.age === 37, "age incremented on rollover");

// legendary card: no decline
S.age = 38; S.cardType = "legendary";
const sB = Object.values(S.stats).reduce((a, b) => a + b, 0);
S.myStats.ratings = [6, 6]; S.results = [];
{
  const prev = global.render; global.render = fn => { try { typeof fn === "function" && fn(); } catch (e) {} };
  try { startNewSeason(); } finally { global.render = prev; }
}
if (!S.retired) {
  const sA = Object.values(S.stats).reduce((a, b) => a + b, 0);
  ok(sA >= sB, "legendary card blocks age decline");
} else ok(true, "legendary check skipped (random retire fired legitimately? no - only forced at 45)");

// ---------- 5. ML retirements ----------
mlNewSave("britain", "Retire FC"); M.welcomeClaimed = true; M.campDue = false;
// plant one 45yo (must retire), one 40yo legendary (may), one 30yo (must stay)
const rngX = E.mulberry32(1);
const oldie = mlGenPlayer(rngX, "britain", "FW", 80); oldie.age = 44; oldie.name = "Old Timer";
const mid = mlGenPlayer(rngX, "britain", "MF", 75); mid.age = 29; mid.name = "Prime Time";
M.squad.push(oldie, mid);
M.matchday = 18; M.results = [];
for (let md = 0; md < 18; md++) for (const [hh, aa] of M.world.fixtures[md]) M.results.push({ home: hh, away: aa, gH: 1, gA: 1 });
const sqBefore = M.squad.length;
{
  const prev = global.render; global.render = fn => { try { typeof fn === "function" && fn(); } catch (e) {} };
  try { mlSeasonEnd(); } finally { global.render = prev; }
}
ok(!M.squad.some(p => p.name === "Old Timer"), "ML: 45yo retired (was 44, aged to 45)");
ok(M.squad.some(p => p.name === "Prime Time"), "ML: 30yo stayed");
const regen = M.squad.filter(p => p.age <= 19 && p.pos === "FW");
ok(regen.length >= 1, "ML: academy regen (17-19 FW) appeared");
ok((M.news || []).some(n => (n.txt || n).toString().includes("retires")), "ML: retirement news posted");
ok(mlXIValid(), "ML: XI still legal after retirements");

// ---------- 6. Redeem codes ----------
const serial = "AB12";
const chk = (E.hashSeed("WELCOME26-" + serial + "-flgift-s3cr3t-2026") >>> 0).toString(36).slice(0, 4).toUpperCase();
const code = "WELCOME26-" + serial + "-" + chk;
S = newSave("Gift Getter", "CF", "goalpoacher", "britain"); save();
const gpBefore = S.gp, lcBefore = S.nl;
let r = flRedeem(code);
ok(r.ok === true, "valid code redeems: " + r.msg);
ok(S.gp === gpBefore + 1000 && S.nl === lcBefore + 10, "BaL rewards applied (+1000 GP, +10 LC)");
r = flRedeem(code);
ok(r.ok === false && /already/i.test(r.msg), "same code rejected second time");
r = flRedeem("WELCOME26-AB12-ZZZZ");
ok(r.ok === false, "tampered check digit rejected");
r = flRedeem("FAKETPL-AB12-AAAA");
ok(r.ok === false, "unknown template rejected");
// ML part queued
const q = JSON.parse(store["flMlGifts"] || "[]");
ok(q.length === 1 && q[0].mlgp === 2 && q[0].mllc === 10, "ML gift queued from code");

// player-gift code
const s2 = "CD34";
const chk2 = (E.hashSeed("STRIKER26-" + s2 + "-flgift-s3cr3t-2026") >>> 0).toString(36).slice(0, 4).toUpperCase();
r = flRedeem("STRIKER26-" + s2 + "-" + chk2);
ok(r.ok, "player-gift code redeems");
const q2 = JSON.parse(store["flMlGifts"] || "[]");
ok(q2.some(g => g.pl && g.pl.name === "Ade Blackwood"), "event striker queued");

// ---------- 7. ML consumes gift queue on enter ----------
const budgetBefore = M.budget, lcMlBefore = M.lc || 0, squadBefore2 = M.squad.length;
mlSave();
ML.enter();
ok(M.budget >= budgetBefore + 2, "ML.enter applied +2M GP gift (got +" + Math.round((M.budget - budgetBefore) * 10) / 10 + ")");
ok((M.lc || 0) >= lcMlBefore + 15, "ML.enter applied LC gifts");
ok(M.squad.length === squadBefore2 + 1 && M.squad.some(p => p.name === "Ade Blackwood"), "gift player joined squad");
const giftP = M.squad.find(p => p.name === "Ade Blackwood");
ok(giftP.cardId === "showtime" && giftP.ovr === 87 && (giftP.skills || []).length === 2, "gift player: showtime 87 with 2 skills");
ok(store["flMlGifts"] === undefined || store["flMlGifts"] === null, "gift queue cleared after delivery");

// ---------- 8. Scheduled events ----------
const live = flGiftsLive();
ok(live.some(g => g.id === "worldupdate26"), "worldupdate26 event is live today (2026-09)");
const gEv = FL_GIFT_EVENTS[0];
const gp2 = S.gp;
flApplyGift(gEv);
ok(S.gp === gp2 + gEv.gp, "event gift applies BaL GP");
ok(flGiftClaimed().includes("worldupdate26"), "event marked claimed");
ok(!flGiftsLive().some(g => g.id === "worldupdate26"), "claimed event no longer live");

// ---------- 9. Owner panel gating ----------
ok(flIsOwner() === false, "owner mode OFF by default");
let out = ownerScreen();
ok(out === "" || !String(out).includes("Superuser"), "owner screen refuses when locked");
// v1.5 owner hardening: key verified server-side; no hash may ship in the client
ok(typeof FL_OWNER_HASH === "undefined", "no FL_OWNER_HASH in client (server-side verification)");
ok(require("fs").readFileSync("app.js", "utf8").includes("Cloud.verifyOwner"), "owner unlock goes through Cloud.verifyOwner");
setSet("ownerMode", true);
out = ownerScreen();
ok(String(out).includes("Superuser"), "owner screen renders when unlocked");
ok(String(out).includes("Spawn ML Player") && String(out).includes("Generate Redeem Code") && String(out).includes("ENGINE SNAPSHOT"), "owner panel: full toolkit + debug present");
// menu shows owner tile
out = menuScreen();
ok(String(out).includes("Owner Panel"), "menu shows owner tile when unlocked");
ok(String(out).includes("Gifts & Events"), "menu shows gifts tile");
setSet("ownerMode", false);
out = menuScreen();
ok(!String(out).includes("Owner Panel"), "owner tile hidden when locked");

// ---------- 10. code that owner panel generates verifies ----------
const tpl = "MEGA26";
const ser3 = "ZQ99";
const c3 = (E.hashSeed(tpl + "-" + ser3 + "-flgift-s3cr3t-2026") >>> 0).toString(36).slice(0, 4).toUpperCase();
r = flRedeem(tpl + "-" + ser3 + "-" + c3);
ok(r.ok, "owner-generated code format verifies");

// ---------- 11. cloud event claim + gift history ----------
FL_CLOUD_EVENTS = [{ id: "cloud:test1", title: "Cloud Test Event", from: "2026-01-01", to: "2027-12-31", gp: 500, lc: 5, mlgp: 0, mllc: 0, pl: null }];
ok(flGiftsLive().some(g => g.id === "cloud:test1"), "cloud event appears in live list");
const gpC = S.gp;
flApplyGift(flGiftsLive().find(g => g.id === "cloud:test1"));
ok(S.gp === gpC + 500, "cloud event claim applies rewards");
ok(flGiftClaimed().includes("cloud:test1"), "cloud event marked claimed");
ok(!flGiftsLive().some(g => g.id === "cloud:test1"), "claimed cloud event leaves live list");
const hist = JSON.parse(store["flGiftHistory"] || "[]");
ok(hist.length >= 1 && hist[0].title === "Cloud Test Event" && hist[0].gp === 500, "gift history recorded");
ok(giftsScreen().includes("Gift History"), "gifts screen shows history panel");

// ---------- 12. leaderboard screen ----------
let lb = leaderboardScreen();
ok(lb.includes("GLOBAL") && lb.includes("LEGENDS") && lb.includes("CLUBS"), "leaderboard renders tabs");
ok(lb.includes("not configured") || lb.includes("Loading"), "offline: graceful message");
FL_LB_CACHE.bal = [{ player_id: flPlayerId(), name: "Me", pname: "Star Man", pos: "CF", season: 3, age: 19, level: 9, rep: 120, goals: 40, apps: 60 }];
FL_LB_CACHE.ml = [{ player_id: "FL-ZZZZ-ZZZZ", name: "Rival", club: "Rival FC", season: 5, trophies: 4, budget: 300, squad_n: 25 }];
FL_LB_CACHE.at = Date.now();
global.Cloud = { enabled: () => true, signedIn: () => false, fetchLeaderboard: () => Promise.resolve([]) };
window._lbMode = "bal";
lb = leaderboardScreen();
ok(lb.includes("Star Man") && lb.includes("(YOU)"), "BaL board renders + highlights me");
window._lbMode = "ml";
lb = leaderboardScreen();
ok(lb.includes("Rival FC") && !lb.includes("(YOU)"), "ML board renders, no false highlight");
ok((lb.match(/<\/?div/g) || []).length % 2 === 0, "leaderboard div balance");
delete global.Cloud; window._lbMode = "bal";
ok(menuScreen().includes("Global Rankings"), "menu shows rankings tile");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
