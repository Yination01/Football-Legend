// Position-conscious skills & playstyles — GKs never get Outside Curler, etc.
"use strict";
const E = require("./engine.js");
const fs = require("fs");

let pass = 0, fails = [];
function check(name, cond, detail) {
  if (cond) pass++;
  else fails.push(name + (detail ? " [" + detail + "]" : ""));
}

// ---- Engine maps ----
check("skillsFor exported", typeof E.skillsFor === "function");
check("skillLegal exported", typeof E.skillLegal === "function");
check("skillsActive exported", typeof E.skillsActive === "function");
check("SKILL_POS covers every SKILL", Object.keys(E.SKILLS).every(s => E.SKILL_POS[s]));

const POS = Object.keys(E.POSITIONS);
for (const pos of POS) {
  const pool = E.skillsFor(pos);
  check(pos + " has skills", pool.length >= 3, String(pool.length));
  check(pos + " pool all legal", pool.every(s => E.skillLegal(s, pos)));
  check(pos + " has playstyles", E.stylesFor(pos).length >= 1);
  check(pos + " has roles", Object.keys(E.rolesFor(pos)).length >= 1);
}

// GK must never see outfield finishing skills
const gkBan = ["Outside Curler", "Long Range Drive", "First-time Shot", "Chip Shot Control",
  "Heading", "Acrobatic Finishing", "Through Passing", "Pinpoint Crossing", "One-touch Pass",
  "Penalty Specialist", "Super-sub", "Track Back"];
const gkPool = E.skillsFor("GK");
for (const s of gkBan) check("GK bans " + s, !gkPool.includes(s) && !E.skillLegal(s, "GK"));
const gkNeed = ["Reflexes", "Penalty Saver", "Command of Area", "High Claim", "Captaincy"];
for (const s of gkNeed) check("GK has " + s, gkPool.includes(s));

// CF never gets GK skills
for (const s of ["Reflexes", "Penalty Saver", "Command of Area", "High Claim", "GK Long Ball"]) {
  check("CF bans " + s, !E.skillLegal(s, "CF"));
}

// skillsActive filters
check("skillsActive strips Outside Curler from GK",
  E.skillsActive(["Outside Curler", "Reflexes", "Captaincy"], "GK").join(",") === "Reflexes,Captaincy");
check("skillsActive keeps Outside Curler on AMF",
  E.skillsActive(["Outside Curler", "Reflexes"], "AMF").join(",") === "Outside Curler");

// Playstyle position gates
check("GK styles only GK", E.stylesFor("GK").every(s => s.pos.includes("GK")));
check("CF styles never GK-only", E.stylesFor("CF").every(s => !s.pos || s.pos.includes("CF") || s.pos.includes("SS")));
check("poacher not for GK", !E.stylesFor("GK").some(s => s.id === "poacher"));
check("shotstopper only GK", E.PLAYSTYLES.shotstopper.pos.includes("GK") && !E.PLAYSTYLES.shotstopper.pos.includes("CF"));

// Roles position gates
check("GK roles are gk_*", Object.keys(E.rolesFor("GK")).every(id => id.startsWith("gk_")));
check("CF roles not gk_*", Object.keys(E.rolesFor("CF")).every(id => !id.startsWith("gk_")));
check("CB roles are df_*", Object.keys(E.rolesFor("CB")).every(id => id.startsWith("df_")));

// Free-kick taker list is outfield attackers/mids only (engine hardcode)
const eng = fs.readFileSync(__dirname + "/engine.js", "utf8");
check("FK takers exclude GK", /playerTakes[\s\S]*?\["CF","SS","AMF","LWF","RWF","CMF"\]/.test(eng.replace(/\s/g, " ")) ||
  eng.includes('["CF","SS","AMF","LWF","RWF","CMF"]'));

// Match: GK with illegal skills must not get FK curler bonus in odds
const gkPlayer = {
  pos: "GK", playstyle: "shotstopper",
  // mid DEF so Reflexes (×1.08) has headroom under the 0.85 save-rate cap
  eff: { PAC: 50, SHO: 20, PAS: 40, DRI: 40, DEF: 70, PHY: 80 },
  skills: ["Outside Curler", "Reflexes", "Penalty Saver"] // Outside Curler illegally present
};
const dec = { type: "gk", conv: 0.3, stam: 100, scen: { stayAdj: 0, rushAdj: 0, blunder: 0.12 }, skctx: {} };
const odds = E.decisionOdds(dec, gkPlayer, "gk_line");
const oddsClean = E.decisionOdds(dec, Object.assign({}, gkPlayer, { skills: ["Reflexes", "Penalty Saver"] }), "gk_line");
check("illegal Outside Curler does not change GK odds",
  odds.stay === oddsClean.stay && odds.rush === oddsClean.rush,
  odds.stay + "/" + oddsClean.stay);

// Reflexes actually improves GK stay% (use raw-ish mid DEF)
const oddsNoRef = E.decisionOdds(dec, Object.assign({}, gkPlayer, { skills: [] }), "gk_line");
check("Reflexes raises GK save%", oddsClean.stay > oddsNoRef.stay, oddsClean.stay + " vs " + oddsNoRef.stay);

// Outfield: Outside Curler raises FK curler%
const amf = {
  pos: "AMF", playstyle: "classic10",
  eff: { PAC: 70, SHO: 80, PAS: 85, DRI: 80, DEF: 40, PHY: 70 },
  skills: ["Outside Curler"]
};
const amf0 = Object.assign({}, amf, { skills: [] });
const fk = { type: "freekick", stam: 100, skctx: {} };
const o1 = E.decisionOdds(fk, amf, "balanced");
const o0 = E.decisionOdds(fk, amf0, "balanced");
check("Outside Curler raises FK curler%", o1.curler > o0.curler, o1.curler + " vs " + o0.curler);

// Same skill on GK must NOT raise anything if somehow asked for freekick odds
const gkFk = E.decisionOdds(fk, gkPlayer, "gk_line");
const gkFk0 = E.decisionOdds(fk, Object.assign({}, gkPlayer, { skills: [] }), "gk_line");
check("GK Outside Curler ignored on FK odds", gkFk.curler === gkFk0.curler);

// BaL UI uses skillsFor
const app = fs.readFileSync(__dirname + "/app.js", "utf8");
check("BaL balSkillPool uses E.skillsFor", app.includes("function balSkillPool") && app.includes("E.skillsFor"));
check("BaL no hardcoded BAL_SKILL_POOL GK Outside", !app.includes('GK:  ["Track Back"'));
check("BaL learn checks skillLegal", app.includes("E.skillLegal"));
check("BaL boot sanitizes skills", app.includes("E.skillsActive(S.skills"));
check("pickpos re-gates playstyle", app.includes("E.stylesFor(S.pos)"));

// ML uses skillsFor
const ml = fs.readFileSync(__dirname + "/ml.js", "utf8");
check("ML mlGiveSkills uses E.skillsFor", ml.includes("E.skillsFor") && ml.includes("mlRpos"));
check("ML sanitize on load", ml.includes("mlSanitizeSkills"));
check("ML no flat global ML_SKILLS roll", !/const ML_SKILLS = \[/.test(ml));

// Headless ML: generate legendary GK never has Outside Curler
const store = {};
global.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => store[k] = v, removeItem: k => delete store[k] };
global.window = global;
const stubEl = new Proxy({}, { get: (t, k) => k === "style" ? {} : k === "classList" ? { toggle(){}, add(){}, remove(){} } : null, set: () => true });
global.$ = () => stubEl;
global.document = { querySelectorAll: () => [], querySelector: () => stubEl, createElement: () => stubEl };
global.render = () => {};
global.toast = () => {};
global.confirm = () => true;
global.E = E;
let src = fs.readFileSync(__dirname + "/ml.js", "utf8").replace('"use strict";', "").replace(/^(const|let) /gm, "var ");
(0, eval)(src);
mlNewSave("britain", "Skill FC");
// force legendary on a GK
const gk = M.squad.find(p => p.pos === "GK");
check("squad has GK", !!gk);
const rng = E.mulberry32(1);
gk.cardId = "legendary"; gk.card = "LEGENDARY";
mlGiveSkills(gk, rng);
check("legendary GK skills all legal", (gk.skills || []).every(s => E.skillLegal(s, "GK")), (gk.skills || []).join(","));
check("legendary GK no Outside Curler", !(gk.skills || []).includes("Outside Curler"));
// FW legendary can get Outside Curler
const fw = M.squad.find(p => p.pos === "FW");
if (fw) {
  fw.cardId = "legendary";
  // force many rolls
  let sawCurl = false, allLegal = true;
  for (let i = 0; i < 40; i++) {
    mlGiveSkills(fw, E.mulberry32(i + 9));
    if ((fw.skills || []).includes("Outside Curler")) sawCurl = true;
    if (!(fw.skills || []).every(s => E.skillLegal(s, mlRpos(fw)))) allLegal = false;
  }
  check("FW legendary skills always legal across rolls", allLegal);
  check("FW can roll Outside Curler sometimes", sawCurl || mlRpos(fw) === "CF"); // CF pool has no Outside Curler!
  // CF cannot — SS/LWF/RWF can. Check by rpos
  fw.rpos = "LWF";
  sawCurl = false;
  for (let i = 0; i < 50; i++) {
    mlGiveSkills(fw, E.mulberry32(100 + i));
    if ((fw.skills || []).includes("Outside Curler")) sawCurl = true;
  }
  check("LWF legendary can roll Outside Curler", sawCurl);
  fw.rpos = "GK"; fw.pos = "GK";
  mlGiveSkills(fw, E.mulberry32(999));
  check("forced GK rpos never Outside Curler", !(fw.skills || []).includes("Outside Curler"));
}

// Fairness still: decisionOdds mirrors resolve for GK with new skills — spot check
const gkp = {
  pos: "GK", playstyle: "shotstopper",
  eff: { PAC: 40, SHO: 10, PAS: 50, DRI: 40, DEF: 85, PHY: 75 },
  skills: ["Reflexes", "Command of Area"]
};
let saves = 0, N = 800;
for (let i = 0; i < N; i++) {
  const m = E.createMatch(
    { name: "H", short: "H", str: 70, col1: "#000", col2: "#fff" },
    { name: "A", short: "A", str: 70, col1: "#000", col2: "#fff" },
    { seed: 5000 + i, player: gkp, playerTeam: 0, role: "gk_line", fast: true }
  );
  // drive to a gk decision if any — just ensure no throw over a match
  while (!m.state.done) {
    const st = m.step();
    if (st.decision) m.decide("auto");
  }
  saves++;
}
check("GK match with new skills completes x" + N, saves === N);

console.log(pass + " passed, " + fails.length + " failed");
fails.forEach(f => console.log("FAIL  " + f));
process.exit(fails.length ? 1 : 0);
