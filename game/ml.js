"use strict";
// ============ FOOTBALL LEGEND — MASTER LEAGUE (v2) ============
// Separate career save. Same honest engine. Manager decisions, never rigged.
const ML_KEY = "footballLegendML_v1";
let M = null;

const ML_FORMS = {
  "4-4-2":  { GK:1, DF:4, MF:4, FW:2 },
  "4-3-3":  { GK:1, DF:4, MF:3, FW:3 },
  "4-2-3-1":{ GK:1, DF:4, MF:5, FW:1 },
  "5-3-2":  { GK:1, DF:5, MF:3, FW:2 }
};
const ML_MENT = {
  defensive: { label: "\ud83d\udee1 Defensive", you: -1.5, opp: -3.0, desc: "You -1.5 · Them -3.0 (kills the game)" },
  balanced:  { label: "\u2696 Balanced",  you: 0,    opp: 0,    desc: "No modifiers" },
  attacking: { label: "\u2694 Attacking", you: +2.0, opp: +1.2, desc: "You +2.0 · Them +1.2 (open game)" }
};
const ML_STYLES = {
  possession: { label: "\ud83d\udd35 Possession", short: "Possession", beats: "longball",   losesTo: "highpress" },
  highpress:  { label: "\u26a1 High Press",  short: "High Press", beats: "possession", losesTo: "counter" },
  counter:    { label: "\ud83d\udde1 Counter",     short: "Counter",    beats: "highpress",  losesTo: "longball" },
  longball:   { label: "\ud83c\udfaf Long Ball",   short: "Long Ball",  beats: "counter",    losesTo: "possession" }
};
function mlStyleOf(club) {
  if (club.founded) return M.style || "possession";
  const ids = Object.keys(ML_STYLES);
  return ids[E.hashSeed((M ? M.seed : "") + ":style:" + club.name) % 4];
}
function mlStyleDuel(mine, theirs) {
  if (ML_STYLES[mine].beats === theirs) return { you: 1, opp: 0, txt: ML_STYLES[mine].label + " counters " + ML_STYLES[theirs].label + " \u2014 you +1.0 str" };
  if (ML_STYLES[theirs].beats === mine) return { you: 0, opp: 1, txt: ML_STYLES[theirs].label + " counters " + ML_STYLES[mine].label + " \u2014 them +1.0 str" };
  return { you: 0, opp: 0, txt: "Neutral \u2014 no bonus" };
}

// ---------- AI manager accounts (honest: always labelled AI) ----------
const ML_MGR_TAGS = ["Matteo_ITA","R9Fernando","KenjiTakeda","LuchoDiez","DaniMadrid","MaxPower77","JoaoVfx","SergioLaLiga","YunusEmre61","PabloNueve","LeoVintage","OldTraffordRed","KaiserFranz5","MidfieldMaestro","CafuFlanks","TikiTakaTom","GegenpressGuru","CatenaccioKid","SambaSkills","NordicWall","DesertFoxFC","AndesCondor","BosphorusBlue","PragueDynamo"];
const ML_MGR_TEAMS = ["Real Phantoms","Dream XI","Galaxy Eleven","Iron Wolves","Royal Falcons","Thunder United","Crimson Tide FC","Velvet Strikers","Storm Riders","Golden Anchors","Night Owls FC","Atlas Titans"];
function mlEvKey() { return M.season + ":" + M.matchday; }
function mlEventAvailable() { return M.matchday < 18 && M.evDone !== mlEvKey(); }
function mlGenManager(md) {
  const rng = E.mulberry32(E.hashSeed(M.seed + ":evmgr:" + M.season + ":" + md));
  const tag = ML_MGR_TAGS[Math.floor(rng() * ML_MGR_TAGS.length)];
  const team = ML_MGR_TEAMS[Math.floor(rng() * ML_MGR_TEAMS.length)];
  const style = Object.keys(ML_STYLES)[Math.floor(rng() * 4)];
  const str = Math.round((mlTeamStr(0) + (rng() * 6 - 2.5)) * 10) / 10;
  return { tag, style, club: { name: team, short: (team.replace(/[^A-Z]/g, "").slice(0, 3) || team.slice(0, 3)).toUpperCase(), str, col1: "#5a3a7a", col2: "#fff" } };
}
function mlManagerOf(club) {
  if (!club || club.founded) return null;
  const h = E.hashSeed(M.seed + ":mgrclub:" + M.season + ":" + club.name);
  if (h % 3 !== 0) return null;
  return ML_MGR_TAGS[h % ML_MGR_TAGS.length];
}
const ML_POSMAP = { GK:"GK", CB:"DF", LB:"DF", RB:"DF", DMF:"MF", CMF:"MF", AMF:"MF", LWF:"FW", RWF:"FW", SS:"FW", CF:"FW" };
// Card tiers: better tier = more skills + a real ability. Specials are LC-only.
const ML_CARDS = {
  standard:  { label: "STANDARD",  skills: 0, cls: "cardstd",  desc: "No ability" },
  trending:  { label: "TRENDING",  skills: 1, cls: "cardtrend", boost: 2, desc: "+2 OVR always", lc: 25 },
  showtime:  { label: "SHOW TIME", skills: 2, cls: "cardshow",  boost: 4, desc: "+4 OVR while your team is attacking", lc: 40 },
  bigtime:   { label: "BIG TIME",  skills: 3, cls: "cardbig",   boost: 4, desc: "+4 OVR in cup ties, vs top-3 clubs & final 3 MDs", lc: 40 },
  legendary: { label: "LEGENDARY", skills: 4, cls: "cardleg",   boost: 3, desc: "+3 OVR always \u00b7 never ages down \u00b7 form never negative", lc: 80 }
};
// Skills are position-gated via Engine.skillsFor(rpos). GKs get Reflexes/Penalty Saver/etc — never Outside Curler.
function mlGiveSkills(p, rng) { // skill count follows card tier
  const n = p.cardId ? ML_CARDS[p.cardId].skills : 0;
  const rpos = mlRpos(p);
  const pool = (E.skillsFor ? E.skillsFor(rpos) : []).slice();
  p.skills = [];
  for (let i = 0; i < n && pool.length; i++) p.skills.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
}
function mlSanitizeSkills(p) {
  if (!p) return;
  const rpos = mlRpos(p);
  if (E.skillsActive) p.skills = E.skillsActive(p.skills || [], rpos);
  else p.skills = p.skills || [];
}
function mlCardChip(p) { // unmistakable tier visuals
  if (!p.cardId && !p.card) return "";
  const id = p.cardId || "standard";
  const c = ML_CARDS[id] || ML_CARDS.standard;
  return ` <span class="cardchip ${c.cls}">${c.label}</span>`;
}
function mlCardBoost(p, ctx) { // ctx: { attacking, big } — honest, deterministic
  if (!p.cardId) return 0;
  if (p.cardId === "trending") return 2;
  if (p.cardId === "legendary") return 3;
  if (p.cardId === "showtime") return ctx && ctx.attacking ? 4 : 0;
  if (p.cardId === "bigtime") return ctx && ctx.big ? 4 : 0;
  return 0;
}

// ---------- save ----------
function mlSave() { const v = JSON.stringify(M); localStorage.setItem(ML_KEY, v); if (window.flMirror) window.flMirror(ML_KEY, v); if (window.Cloud) try { Cloud.push("ml"); } catch (e) {} }
function mlLoad() {
  try { const d = localStorage.getItem(ML_KEY); if (d) M = JSON.parse(d); } catch (e) { M = null; }
  if (M) {
    try { mlEnsureTrainers(); } catch (e) {}
    if (M.lc === undefined) M.lc = 20; // migration: starter LC grant
    // migrate old flat-boost cards to the new tier system
    const rng = E.mulberry32(E.hashSeed(M.seed + ":cardmig"));
    for (const p of M.squad || []) {
      if (p.form === undefined) p.form = 0;
      if (p.cardId === undefined) {
        p.cardId = p.card ? (p.card.includes("LEGEND") ? "legendary" : p.card.includes("BIG") ? "bigtime" : p.card.includes("SHOW") ? "showtime" : null) : null;
        if (p.cardId && p.card && p.card.includes("SHOW")) p.ovr = Math.max(40, p.ovr - 3); // old flat +3 now dynamic
        if (p.cardId && p.card && p.card.includes("BIG")) p.ovr = Math.max(40, p.ovr - 4);  // old flat +4 now dynamic
        if (p.cardId === "legendary") p.ovr = Math.max(40, p.ovr - 3); // keep +3 of old +6 as the always-on
        if (p.skills === undefined) mlGiveSkills(p, rng);
      }
      if (p.skills === undefined) { p.skills = []; }
      mlSanitizeSkills(p);
    }
  }
}
function mlMode(on) { localStorage.setItem("flMode", on ? "ml" : "bal"); }

// ---------- players ----------
const ML_BUCKET_POS = { GK: ["GK"], DF: ["CB", "CB", "LB", "RB"], MF: ["DMF", "CMF", "CMF", "AMF"], FW: ["CF", "SS", "LWF", "RWF"] };
function mlGenPlayer(rng, region, bucket, ovr) {
  const age = 18 + Math.floor(rng() * 17);
  const pot = Math.min(99, Math.max(ovr + 3, ovr + (age < 23 ? 8 + Math.floor(rng() * 8) : age < 28 ? 4 + Math.floor(rng() * 5) : 3)));
  const opts = ML_BUCKET_POS[bucket];
  const rpos = opts[Math.floor(rng() * opts.length)];
  return { id: Math.floor(rng() * 1e9), name: E.genPlayerName(rng, region), pos: bucket, rpos, age, ovr, pot,
           fit: 100, value: mlValue(ovr, age), wage: Math.round(4 + Math.pow(Math.max(0, ovr - 50), 1.6) * 0.55), card: null };
}
function mlApplySpecialTier(p, cardId, rng) {
  p.cardId = cardId;
  p.card = (ML_CARDS[cardId] && ML_CARDS[cardId].label) || cardId.toUpperCase();
  if (cardId === "trending") {
    p.ovr = Math.max(p.ovr, 83 + Math.floor(rng() * 5));
    p.pot = Math.max(p.pot, Math.min(94, p.ovr + 4 + Math.floor(rng() * 4)));
  } else if (cardId === "showtime") {
    p.ovr = Math.max(p.ovr, 87 + Math.floor(rng() * 5));
    p.pot = Math.max(p.pot, Math.min(97, p.ovr + 4 + Math.floor(rng() * 4)));
  } else if (cardId === "bigtime") {
    p.ovr = Math.max(p.ovr, 89 + Math.floor(rng() * 5));
    p.pot = Math.max(p.pot, Math.min(98, p.ovr + 4 + Math.floor(rng() * 4)));
  } else if (cardId === "legendary") {
    p.ovr = Math.max(p.ovr, 92 + Math.floor(rng() * 5));
    p.pot = Math.max(p.pot, Math.min(99, p.ovr + 3 + Math.floor(rng() * 4)));
  }
  mlGiveSkills(p, rng);
  p.value = mlValue(p.ovr, p.age) * (cardId === "legendary" ? 1.6 : 1.3);
  p.wage = Math.round(4 + Math.pow(Math.max(0, p.ovr - 50), 1.6) * 0.55);
}
function mlRpos(p) { return p.rpos || (ML_BUCKET_POS[p.pos] ? ML_BUCKET_POS[p.pos][0] : p.pos); }
// eFootball-style trainer cards: EXP material earned from matches/events, bought in shop, or converted from surplus players
const ML_TRAINERS = {
  bronze: { label: "\ud83e\udd49 Bronze Trainer", exp: 30,  price: 0.3 },
  silver: { label: "\ud83e\udd48 Silver Trainer", exp: 80,  price: 0.7 },
  gold:   { label: "\ud83e\udd47 Gold Trainer",   exp: 200, price: 1.6 }
};
function mlExpNeed(p) { return 60 + Math.max(0, p.ovr - 50) * 8; } // EXP for next OVR point
function mlTrainerFor(ovr) { return ovr < 65 ? "bronze" : ovr < 75 ? "silver" : "gold"; }
function mlEnsurePlayerStats() { // #17: per-player season log used by MOTM + the awards gala
  M.motmHistory = M.motmHistory || [];
  M.honours = M.honours || [];
  for (const p of (M.squad || [])) {
    if (p.apps == null) p.apps = 0;
    if (p.goals == null) p.goals = 0;
    if (p.assists == null) p.assists = 0;
    if (p.motm == null) p.motm = 0;
  }
}
function mlEnsureTrainers() {
  M.trainers = M.trainers || { bronze: 2, silver: 1, gold: 0 };
  const mig = E.mulberry32(E.hashSeed(M.seed + ":posmig"));
  for (const p of M.squad) {
    p.exp = p.exp || 0;
    if (!p.rpos) { const o = ML_BUCKET_POS[p.pos] || ["CMF"]; p.rpos = o[Math.floor(mig() * o.length)]; }
    if (p.cardId) {
      if (p.cardId === "showtime" && (p.ovr < 86 || p.pot <= 80)) {
        p.ovr = Math.max(p.ovr, 88); p.pot = Math.max(p.pot, 94); p.value = mlValue(p.ovr, p.age) * 1.3;
      } else if (p.cardId === "bigtime" && (p.ovr < 88 || p.pot <= 82)) {
        p.ovr = Math.max(p.ovr, 90); p.pot = Math.max(p.pot, 96); p.value = mlValue(p.ovr, p.age) * 1.3;
      } else if (p.cardId === "legendary" && (p.ovr < 90 || p.pot <= 85)) {
        p.ovr = Math.max(p.ovr, 93); p.pot = Math.max(p.pot, 98); p.value = mlValue(p.ovr, p.age) * 1.6;
      } else if (p.cardId === "trending" && (p.ovr < 82 || p.pot <= 78)) {
        p.ovr = Math.max(p.ovr, 84); p.pot = Math.max(p.pot, 91); p.value = mlValue(p.ovr, p.age) * 1.3;
      }
    }
  }
}
function mlValue(ovr, age) {
  const base = Math.pow(Math.max(1, ovr - 45), 2.1) * 0.004;
  const af = age <= 23 ? 1.35 : age <= 28 ? 1.0 : age <= 31 ? 0.6 : 0.35;
  return Math.max(0.1, Math.round(base * af * 10) / 10);
}
function mlGenSquad(rng, region, str) {
  const sq = [];
  const mk = (bucket, n, lo, hi) => { for (let i = 0; i < n; i++) sq.push(mlGenPlayer(rng, region, bucket, Math.round(str + lo + rng() * (hi - lo)))); };
  mk("GK", 2, -4, 3); mk("DF", 6, -5, 5); mk("MF", 6, -5, 5); mk("FW", 4, -5, 6);
  return sq;
}
function mlNewSave(region, clubName) {
  const seed = "ml_" + Date.now().toString(36);
  const galaxy = E.makeGalaxy(seed);
  const leagueIdx = E.leagueForRegion(region);
  const world = { tier: 0, clubs: galaxy.leagues[leagueIdx].clubs, fixtures: galaxy.leagues[leagueIdx].fixtures, h2h: {} };
  // your club takes the weakest slot and becomes YOURS: name, colors, identity — forever
  let clubIdx = 0; let weakest = 1e9;
  world.clubs.forEach((c, i) => { if (c.str < weakest) { weakest = c.str; clubIdx = i; } });
  const shortName = (clubName.replace(/[^A-Za-z]/g, "") || "LEG").slice(0, 3).toUpperCase();
  Object.assign(world.clubs[clubIdx], { name: clubName, short: shortName, col1: "#e8c15a", col2: "#131a14", founded: true });
  const rng = E.mulberry32(E.hashSeed(seed + ":squad"));
  const squad = mlGenSquad(rng, region, world.clubs[clubIdx].str);
  M = { seed, region, tier: 0, clubIdx, season: 1, matchday: 0, galaxy, leagueIdx,
        ct: null, ctQual: false,
        world, results: [], squad, formation: "4-4-2", mentality: "balanced",
        xi: [], budget: 8.0, news: [], cup: { round: 0, alive: true, done: false },
        career: [], sacked: false, packsBought: 0, soldIds: [], boughtBal: false,
        trainers: { bronze: 2, silver: 1, gold: 0 }, lc: 20, welcomeClaimed: false };
  for (const p of M.squad) { p.form = 0; p.cardId = null; p.skills = []; }
  mlAutoXI();
  M.clubName = clubName; M.clubShort = shortName; M.trophies = []; M.style = "possession"; M.scouted = []; M.evDone = "";
  mlNews("\ud83c\udff3\ufe0f " + clubName + " is founded! Your club, your dynasty \u2014 build it season by season. Budget: " + fmtM(M.budget));
  mlSave();
}
function mlClub() { return M.world.clubs[M.clubIdx]; }
function fmtM(x) { return (x >= 1 ? x.toFixed(1) + "M" : Math.round(x * 1000) + "K") + " GP"; }

// ---------- XI & strength ----------
function effOvr(p, fitOverride, ctx) {
  const f = fitOverride != null ? fitOverride : p.fit;
  const form = p.form || 0; // -2..+2 -> -3..+3 OVR
  return (p.ovr + mlCardBoost(p, ctx) + form * 1.5) * (0.80 + 0.20 * Math.max(0, f) / 100);
}
// ---------- FORM: classic 5-direction PES condition arrows (#8) ----------
// form is an integer -2..+2; every step is worth 1.5 OVR in effOvr(). PES rules:
// arrows describe real, engine-applied condition - they are never decorative.
const ML_FORM_DIRS = [
  { form: -2, glyph: "\u2b07", label: "Terrible"  }, // down
  { form: -1, glyph: "\u2198", label: "Poor"      }, // down-right
  { form:  0, glyph: "\u27a1", label: "Normal"    }, // level
  { form:  1, glyph: "\u2197", label: "Good"      }, // up-right
  { form:  2, glyph: "\u2b06", label: "Excellent" }  // up
];
function mlFormDir(p) { return ML_FORM_DIRS[Math.max(-2, Math.min(2, (p && p.form) || 0)) + 2]; }
function mlFormArrow(p) {
  const d = mlFormDir(p);
  return '<b class="formarrow fd' + (d.form + 2) + '" title="' + d.label + ' form (' + (d.form > 0 ? "+" : "") + d.form + ' OVR)">' + d.glyph + '</b>';
}
function mlFormLegend() {
  return ML_FORM_DIRS.slice().reverse().map(d => '<b class="formarrow fd' + (d.form + 2) + '">' + d.glyph + '</b> <span class="sub">' + d.label + '</span>').join(' \u00b7 ');
}
function mlDriftForm() { // once per matchday result: seeded, so the same save+season+MD always drifts the same way
  const rng = E.mulberry32(E.hashSeed(M.seed + ":form:s" + M.season + ":md" + M.matchday));
  const ids = M.squad.map(p => p.id).slice().sort((a, b) => (a > b ? 1 : a < b ? -1 : 0));
  for (const id of ids) {
    const p = M.squad.find(x => x.id === id);
    if (!p) continue;
    p.form = p.form || 0;
    const inXI = M.xi.includes(p.id);
    const stay = rng() < 0.45;                                     // 45% of players hold their arrow
    const upChance = (inXI ? 0.55 : 0.45) - (p.age >= 33 ? 0.07 : 0); // minutes help, age hurts
    const drift = stay ? 0 : (rng() < upChance ? 1 : -1);
    p.form = Math.max(-2, Math.min(2, p.form + drift));
    if (p.cardId === "legendary" && p.form < 0) p.form = 0; // card ability: form floor
  }
}
function mlAutoXI(byFitness) {
  const need = ML_FORMS[M.formation];
  const xi = [];
  const score = (p) => {
    if (byFitness) {
      const fitBonus = p.fit >= 70 ? 200 : (p.fit >= 40 ? 50 : 0);
      return fitBonus + effOvr(p);
    }
    return effOvr(p);
  };
  for (const bucket of ["GK", "DF", "MF", "FW"]) {
    const pool = M.squad.filter(p => p.pos === bucket && !xi.includes(p.id))
      .sort((a, b) => score(b) - score(a));
    for (let i = 0; i < need[bucket] && i < pool.length; i++) xi.push(pool[i].id);
  }
  // enforce a full XI: fill outfield shortfalls with best remaining outfielders (out of position)
  if (xi.length < 11) {
    const rest = M.squad.filter(p => !xi.includes(p.id) && p.pos !== "GK").sort((a, b) => score(b) - score(a));
    while (xi.length < 11 && rest.length) xi.push(rest.shift().id);
  }
  M.xi = xi;
}
function mlAutoBench(mode) {
  const nonXI = M.squad.filter(p => !M.xi.includes(p.id));
  const bench = [];
  if (mode === "ovr") {
    // Pure highest OVR reserves
    const sorted = nonXI.slice().sort((a, b) => (b.ovr * 0.7 + b.fit * 0.3) - (a.ovr * 0.7 + a.fit * 0.3));
    for (const p of sorted) {
      if (bench.length >= 10) break;
      bench.push(p.id);
    }
  } else {
    // Positionally balanced: 1 GK, up to 3 DF, up to 4 MF, up to 2 FW
    const gk = nonXI.filter(p => p.pos === "GK").sort((a, b) => (b.fit * 0.3 + b.ovr) - (a.fit * 0.3 + a.ovr))[0];
    if (gk) bench.push(gk.id);
    const dfs = nonXI.filter(p => p.pos === "DF" && !bench.includes(p.id)).sort((a, b) => (b.ovr * 0.6 + b.fit * 0.4) - (a.ovr * 0.6 + a.fit * 0.4)).slice(0, 3);
    dfs.forEach(p => bench.push(p.id));
    const mfs = nonXI.filter(p => p.pos === "MF" && !bench.includes(p.id)).sort((a, b) => (b.ovr * 0.6 + b.fit * 0.4) - (a.ovr * 0.6 + a.fit * 0.4)).slice(0, 4);
    mfs.forEach(p => bench.push(p.id));
    const fws = nonXI.filter(p => p.pos === "FW" && !bench.includes(p.id)).sort((a, b) => (b.ovr * 0.6 + b.fit * 0.4) - (a.ovr * 0.6 + a.fit * 0.4)).slice(0, 2);
    fws.forEach(p => bench.push(p.id));
    const rem = nonXI.filter(p => !bench.includes(p.id)).sort((a, b) => (b.ovr * 0.6 + b.fit * 0.4) - (a.ovr * 0.6 + a.fit * 0.4));
    while (bench.length < 10 && rem.length) bench.push(rem.shift().id);
  }
  M.bench = bench;
  mlSave();
  return M.bench;
}
function mlXIValid() { // hard rule: 11 players INCLUDING exactly >=1 GK
  const ps = mlXIPlayers();
  return ps.length === 11 && ps.some(p => p.pos === "GK");
}
function mlBucketCount(bucket, excludeId) {
  return M.squad.filter(p => p.pos === bucket && p.id !== excludeId).length;
}
function mlCanRemove(p) { // selling/converting cannot leave the squad unable to field a legal XI
  const need = ML_FORMS[M.formation];
  const min = { GK: Math.max(1, need.GK), DF: need.DF, MF: need.MF, FW: need.FW };
  if (mlBucketCount(p.pos, p.id) < min[p.pos]) return "Can't remove your last " + p.pos + "s — a legal XI needs " + min[p.pos] + "+";
  if (M.squad.length <= 15) return "Squad too small (min 15)";
  return null;
}
function mlXIPlayers() { return M.xi.map(id => M.squad.find(p => p.id === id)).filter(Boolean); }
function mlTeamStr(minPlayed, ctx) {
  const ps = mlXIPlayers();
  if (!ps.length) return 40;
  const fatigue = minPlayed ? 25 * (minPlayed / 90) : 0;
  const avg = ps.reduce((s, p) => s + effOvr(p, p.fit - fatigue, ctx), 0) / ps.length;
  // depth bonus: every good signing counts — best 5 non-XI players add up to +2.5
  const bench = M.squad.filter(p => !M.xi.includes(p.id)).sort((a, b) => b.ovr - a.ovr).slice(0, 5);
  let depth = 0;
  for (const b of bench) depth += Math.max(0, Math.min(0.5, (b.ovr - (avg - 8)) * 0.05));
  // Captaincy skill in XI: +0.6 team-wide (once)
  const cap = ps.some(p => (p.skills || []).includes("Captaincy")) ? 0.6 : 0;
  return Math.round((avg + Math.min(2.5, depth) + cap) * 10) / 10;
}
function mlBigMatch(fx) { // BIG TIME trigger: cup, CT, top-3 opponent, or final 3 MDs
  if (!fx) return false;
  if (fx.cup || fx.ct) return true;
  if (M.matchday >= 15) return true;
  try {
    const t = E.computeTable(M.world.clubs, M.results).slice(0, 3).map(r => r.i);
    const opp = fx.home === M.clubIdx ? fx.away : fx.home;
    return t.includes(opp);
  } catch (e) { return false; }
}
function mlEffClub(ment, ctx) {
  return Object.assign({}, mlClub(), { str: mlTeamStr(0, ctx) + ML_MENT[ment || M.mentality].you });
}

// ---------- news ----------
function mlNews(txt) { M.news.unshift({ s: M.season, md: M.matchday, txt }); M.news = M.news.slice(0, 40); }

// ---------- fixtures ----------
const ML_EVENTS = [
  { id: "win",   label: "Win the match",        gp: 0.4, chk: (my, op) => my > op },
  { id: "score3",label: "Score 3+ goals",       gp: 0.5, chk: (my, op) => my >= 3 },
  { id: "clean", label: "Keep a clean sheet",   gp: 0.5, chk: (my, op) => op === 0 },
  { id: "win2",  label: "Win by 2+ goals",      gp: 0.6, chk: (my, op) => my - op >= 2 }
];
function mlCurrentEvents() {
  const rng = E.mulberry32(E.hashSeed(M.seed + ":ev:" + M.season + ":" + M.matchday));
  const picks = [];
  const idxs = [0, 1, 2, 3].sort(() => rng() - 0.5).slice(0, 2);
  for (const i of idxs) picks.push(ML_EVENTS[i]);
  return picks;
}
function mlNextFixture() {
  if (M.matchday >= M.world.fixtures.length) return null;
  const md = M.world.fixtures[M.matchday];
  for (const [h, a] of md) if (h === M.clubIdx || a === M.clubIdx) return { home: h, away: a };
  return null;
}
function mlCupPending() {
  return M.cup.alive && !M.cup.done && [4, 8, 12, 16].includes(M.matchday) && M.cup.round === [4, 8, 12, 16].indexOf(M.matchday);
}
const ML_CUP_ROUNDS = ["Round of 16", "Quarter-Final", "Semi-Final", "FINAL"];
const ML_CUP_PRIZE = [0.8, 1.2, 2.0, 4.0];

// ============================ SCREENS ============================
function mlTopbar() {
  return `<div class="topbar"><div class="logo"><span class="brand1">MASTER</span> <span class="legend">LEAGUE</span></div>
    <div class="wallet"><span class="chip">\ud83d\udcb0 ${fmtM(M.budget)}</span><span class="chip gold">\ud83e\ude99 ${M.lc || 0} LC</span></div></div>`;
}
function mlNav() {
  setTimeout(() => {
    document.querySelectorAll("[data-mlnav]").forEach(b => b.onclick = () => {
      const v = b.dataset.mlnav;
      if (v === "home") render(mlHome);
      if (v === "squad") render(mlSquadScreen);
      if (v === "tactics") render(mlTacticsScreen);
      if (v === "market") render(mlMarketScreen);
      if (v === "match") mlGoMatch();
    });
  }, 0);
  return `<div class="nav">
    <button data-mlnav="home"><span class="nico">\ud83c\udfe0</span>Club</button>
    <button data-mlnav="squad"><span class="nico">\ud83d\udc65</span>Squad</button>
    <button data-mlnav="match"><span class="nico">\u26bd</span>Matchday</button>
    <button data-mlnav="tactics"><span class="nico">\ud83d\udccb</span>Tactics</button>
    <button data-mlnav="market"><span class="nico">\ud83d\udcb1</span>Market</button>
  </div>`;
}

function mlWelcomeLegends() { // one-time free Legendary pick (new AND existing saves)
  const rng = E.mulberry32(E.hashSeed(M.seed + ":welcome"));
  const out = [];
  for (const bucket of ["GK", "DF", "MF", "FW"]) {
    const p = mlGenPlayer(rng, M.region, bucket, 82 + Math.floor(rng() * 5));
    p.cardId = "legendary"; p.card = ML_CARDS.legendary.label; mlGiveSkills(p, rng);
    p.age = 24 + Math.floor(rng() * 5); p.value = mlValue(p.ovr, p.age) * 1.3;
    out.push(p);
  }
  return out;
}
function mlWelcomeScreen() {
  const legends = mlWelcomeLegends();
  setTimeout(() => {
    document.querySelectorAll("[data-wleg]").forEach(b => b.onclick = () => {
      const p = legends[+b.dataset.wleg];
      M.squad.push(p); M.welcomeClaimed = true;
      mlAutoXI(); mlNews("\ud83d\udc51 WELCOME LEGEND: " + p.name + " joins for free!");
      mlSave(); toast("\ud83d\udc51 " + p.name + " is yours!"); render(mlHome);
    });
  }, 0);
  return `<div class="screen">${mlTopbar()}
    <div class="panel center"><h1>\ud83d\udc51 Welcome Gift</h1>
      <p class="sub">Every manager starts with a star. Pick <b>ONE</b> Legendary player \u2014 free, forever.</p></div>
    ${legends.map((p, i) => `<div class="panel" style="cursor:pointer">
      <div class="kv"><span><b>${mlRpos(p)}</b> ${p.name}${mlCardChip(p)}<br>
        <span class="sub">age ${p.age} \u00b7 OVR ${p.ovr} \u00b7 \ud83c\udfaf ${p.skills.join(", ")}</span></span>
        <button class="btn gold" data-wleg="${i}">TAKE</button></div></div>`).join("")}
    <p class="sub center">Choose carefully \u2014 the other three walk away.</p></div>`;
}
function mlCampScreen() {
  const picks = M.campSel || [];
  setTimeout(() => {
    document.querySelectorAll("[data-camp]").forEach(b => b.onclick = () => {
      const id = +b.dataset.camp;
      M.campSel = M.campSel || [];
      if (M.campSel.includes(id)) M.campSel = M.campSel.filter(x => x !== id);
      else if (M.campSel.length < 3) M.campSel.push(id);
      render(mlCampScreen);
    });
    const go = $("#campgo");
    if (go) go.onclick = () => {
      M.campPicks = (M.campSel || []).slice(); M.campSel = null; M.campDue = false;
      mlNews("\ud83c\udfd5 Pre-season camp: " + M.campPicks.length + " players get special attention this year.");
      mlSave(); render(mlHome);
    };
  }, 0);
  const rows = M.squad.slice().sort((a, b) => b.ovr - a.ovr).map(p =>
    `<div class="kv" style="cursor:pointer${picks.includes(p.id) ? ";color:var(--gold)" : ""}" >
      <span>${picks.includes(p.id) ? "\u2705" : "\u25cb"} <b>${mlRpos(p)}</b> ${p.name}${mlCardChip(p)}<br>
      <span class="sub">age ${p.age} \u00b7 OVR ${p.ovr}${p.pot > p.ovr ? "/" + p.pot : ""}</span></span>
      <button class="btn secondary" data-camp="${p.id}" style="padding:5px 10px;font-size:.68rem">${picks.includes(p.id) ? "DROP" : "PICK"}</button></div>`).join("");
  return `<div class="screen">${mlTopbar()}
    <div class="panel"><h2>\ud83c\udfd5 Pre-season Training Camp</h2>
      <p class="sub">Pick up to <b>3 players</b> for special attention this season: young players gain +1 extra OVR, 32+ players are protected from decline next rollover. Chosen: <b>${picks.length}/3</b></p>
      <button class="btn" id="campgo">${picks.length ? "CONFIRM CAMP \u2794" : "SKIP THIS YEAR \u2794"}</button></div>
    <div class="panel">${rows}</div></div>`;
}
function mlHome() {
  if (mlResolveAbandoned()) toast("\u26a0\ufe0f Abandoned match resolved by simulation.");
  if (M && !M.welcomeClaimed) return mlWelcomeScreen();
  if (M && M.campDue) return mlCampScreen();
  if (M) mlAutoXI0Fix();
  const table = E.computeTable(M.world.clubs, M.results);
  const myRow = table.findIndex(t => t.i === M.clubIdx) + 1;
  const fx = mlNextFixture();
  const opp = fx ? M.world.clubs[fx.home === M.clubIdx ? fx.away : fx.home] : null;
  const seasonOver = M.matchday >= 18;
  setTimeout(() => {
    const b = $("#mlplay"); if (b) b.onclick = () => mlGoMatch();
    const se = $("#mlseason"); if (se) se.onclick = () => { mlSeasonEnd(); };
    const sw = $("#mlswitch"); if (sw) sw.onclick = () => { mlMode(false); render(menuScreen); };
    const nw = $("#mlnews"); if (nw) nw.onclick = () => render(mlNewsScreen);
    const tb = $("#mltable"); if (tb) tb.onclick = () => render(mlTableScreen);
    const pk = $("#mlpacks"); if (pk) pk.onclick = () => render(mlPacksScreen);
    const ev = $("#mlevent"); if (ev) ev.onclick = () => render(mlEventPreview);
    const rc = $("#mlrevclose"); if (rc) rc.onclick = () => { M.review = null; mlSave(); render(mlHome); };

  }, 0);
  return `<div class="screen">${mlTopbar()}
    <div class="panel center">
      <div class="pclub">${mlClub().name} \u00b7 Season ${M.season} \u00b7 ${M.tier === 0 ? (E.REGION_LEAGUES[M.region] || "National League") : "Continental Super League"}</div>
      <h2 style="margin:6px 0">${myRow ? "#" + myRow + " in league" : ""} \u00b7 MD ${Math.min(M.matchday + 1, 18)}/18 ${M.cup.alive && !M.cup.done ? "\u00b7 \ud83c\udfc6 in cup" : ""}</h2>
      <div class="kv"><span>Squad strength (XI, fresh)</span><b>${mlTeamStr(0)}</b></div>
      <div class="kv"><span>Transfer budget</span><b style="color:var(--gold)">${fmtM(M.budget)}</b></div>
      ${(M.pressure || 0) > 0 ? `<div class="kv"><span>\u26a0\ufe0f Board pressure</span><b style="color:var(--red)">${M.pressure}/3</b></div>` : ""}
      <div class="kv"><span>Weekly wages</span><b>${Math.round(M.squad.reduce((s, p) => s + p.wage, 0))}K</b></div>
      ${M.matchday < 18 ? `<div class="kv"><span>\ud83c\udfaf MD events</span><b>${mlCurrentEvents().map(e => e.label + " +" + fmtM(e.gp)).join(" \u00b7 ")}</b></div>` : ""}
      ${mlCtFixture()
        ? `<button class="btn gold" id="mlplay">\ud83c\udf0d CHAMPIONS TROPHY: ${mlCtFixture().ctStage === "group" ? "Group MD " + (mlCtFixture().ctMD + 1) + "/6" : E.CT_ROUNDS[M.ct.koRound]} \u2192</button>`
        : seasonOver
        ? `<button class="btn gold" id="mlseason">\ud83c\udfc1 END SEASON \u2192</button>`
        : mlCupPending()
          ? `<button class="btn gold" id="mlplay">\ud83c\udfc6 CUP: ${ML_CUP_ROUNDS[M.cup.round]} \u2192</button>`
          : opp ? `<button class="btn" id="mlplay">NEXT: ${fx.home === M.clubIdx ? "vs" : "@"} ${opp.name} \u2192</button>` : ""}
    </div>
    <div class="tiles">
      <div class="tile" id="mltable"><span class="tileico">\ud83d\udcca</span><span>League</span></div>
      <div class="tile" id="mlpacks"><span class="tileico">\ud83c\udccf</span><span>Card Draws</span></div>
      <div class="tile" id="mlevent"><span class="tileico">\ud83c\udfae</span><span>Event${M.matchday < 18 && M.evDone !== M.season + ":" + M.matchday ? "" : " \u2713"}</span></div>
      <div class="tile" id="mlnews"><span class="tileico">\ud83d\udcf0</span><span>Club News</span></div>
      <div class="tile" id="mlswitch"><span class="tileico">\ud83c\udfe0</span><span>Main Menu</span></div>
    </div>
    ${M.review ? `<div class="panel"><h2>\ud83d\udccb Season ${M.review.season} Review</h2>
      <div class="kv"><span>Finish</span><b>#${M.review.pos} \u00b7 ${M.review.pts} pts (${M.review.w}W ${M.review.d}D ${M.review.l}L)</b></div>
      <div class="kv"><span>Goals</span><b>${M.review.gf}:${M.review.ga} \u00b7 GD ${M.review.gd > 0 ? "+" : ""}${M.review.gd} \u00b7 ${M.review.cs} clean sheets</b></div>
      <div class="kv"><span>Board target</span><b>${M.review.target === "met" ? "\u2705 Achieved" : "\u26a0\ufe0f Missed"} <span class="sub">(squad rank #${M.review.strRank})</span></b></div>
      <div class="kv"><span>Settlement</span><b>+${fmtM(M.review.prize)}${M.review.lc ? " \u00b7 +" + M.review.lc + " LC" : ""}</b></div>
      ${M.review.improved ? `<div class="kv"><span>\ud83c\udf1f Most improved</span><b>${M.review.improved.name} +${M.review.improved.up} OVR \u2192 ${M.review.improved.ovr}</b></div>` : ""}
      ${M.review.gala ? `<div class="panel" style="margin:8px 0 0;border-color:rgba(255,215,110,.35)">
        <h2>\ud83c\udfc5 Awards Gala \u00b7 Season ${M.review.season}</h2>
        ${M.review.gala.mvp ? `<div class="kv"><span>\ud83e\uddc1 Player of the Season</span><b>${M.review.gala.mvp.name} <span class="sub">${M.review.gala.mvp.pos} \u00b7 OVR ${M.review.gala.mvp.ovr} \u00b7 ${M.review.gala.mvp.goals}G ${M.review.gala.mvp.assists}A \u00b7 score ${M.review.gala.mvp.score}</span></b></div>` : ""}
        ${M.review.gala.boot ? `<div class="kv"><span>\ud83d\udc5f Club Golden Boot</span><b>${M.review.gala.boot.name} \u00b7 ${M.review.gala.boot.goals} goals <span class="sub">${M.review.gala.boot.assists} assists</span></b></div>` : ""}
        ${M.review.gala.manager ? `<div class="kv"><span>\ud83c\udf96 Manager of the Season</span><b>${M.review.gala.manager.club} <span class="sub">${M.review.gala.manager.points} pts${M.review.gala.manager.mine ? " \u2014 that's you!" : ""}</span></b></div>` : ""}
        <div class="kv"><span>\ud83c\udf1f Man of the Match awards</span><b>${M.review.gala.motm}${M.review.gala.topMotm ? ` <span class="sub">best: ${M.review.gala.topMotm.name} (${M.review.topMotm ? "" : ""}${M.review.gala.topMotm.score.toFixed(2)})</span>` : ""}</b></div>
        <p class="sub" style="margin:6px 0 2px"><b>Best XI</b> (tracked contributions + OVR):</p>
        <p class="sub">${M.review.gala.bestXI.map(p => `${p.pos} ${p.name} (${p.ovr})`).join(" \u00b7 ")}</p>
      </div>` : ""}
      ${M.review.retirements ? `<div class="kv"><span>\ud83d\udc4b Retirements</span><b>${M.review.retirements}</b></div>` : ""}
      ${M.review.promoted ? `<div class="kv"><span>\ud83c\udf89 Promoted</span><b>Continental Super League</b></div>` : ""}
      ${M.review.relegated ? `<div class="kv"><span>\ud83d\udcc9 Relegated</span><b>National league</b></div>` : ""}
      ${M.review.qualified ? `<div class="kv"><span>\ud83c\udfc6 Champions Trophy</span><b>Qualified</b></div>` : ""}
      <button class="btn secondary" id="mlrevclose">DISMISS REVIEW</button>
    </div>` : ""}
    ${(M.trophies && M.trophies.length) ? `<div class="panel"><h2>\ud83c\udfc6 Trophy Cabinet</h2>
      ${M.trophies.map(t => `<div class="kv"><span>Season ${t.s}</span><b>${t.t}</b></div>`).join("")}</div>` : ""}
    ${mlNav()}
  </div>`;
}

function mlCreate() {
  setTimeout(() => {
    let region = "britain";
    function prevName() {
      const v = ($("#clubname").value || "").trim();
      return v || "Legend FC";
    }
    document.querySelectorAll("[data-mlreg]").forEach(o => o.onclick = () => {
      region = o.dataset.mlreg;
      document.querySelectorAll("[data-mlreg]").forEach(x => x.classList.toggle("sel", x.dataset.mlreg === region));
    });
    $("#mlgo").onclick = () => {
      mlNewSave(region, prevName());
      mlMode(true); render(mlHome);
    };
    const back = $("#mlback"); if (back) back.onclick = () => { mlMode(false); render(menuScreen); };
  }, 0);
  return `<div class="screen">
    <div class="topbar"><div class="logo"><span class="brand1">MASTER</span> <span class="legend">LEAGUE</span></div></div>
    <div class="panel center"><h1>Found Your Club</h1>
      <p class="sub" style="margin:8px 0">One club. One save. Forever \u2014 just like eFootball. You start small and build a dynasty: squad, trophies and history all carry season to season.</p></div>
    <div class="panel">
      <h2>Club name</h2>
      <input type="text" id="clubname" placeholder="Legend FC" value="Legend FC"/>
      <h2 style="margin-top:12px">Home region (league you'll climb)</h2>
      <div class="optrow">${Object.entries(E.REGIONS).map(([id, r]) =>
        `<div class="opt ${id === "britain" ? "sel" : ""}" data-mlreg="${id}" style="flex:1 1 45%">${r.flag} ${r.label}</div>`).join("")}</div>
      <button class="btn" id="mlgo">\u26bd FOUND THE CLUB \u2192</button>
      <p class="sub center" style="margin-top:8px;cursor:pointer" id="mlback">\u2b05 Main Menu</p>
    </div>
  </div>`;
}

// ---------- squad ----------
var ML_SQ_FLT = "all";
var ML_SQ_SORT = "ovr";
function mlSquadScreen() {
  mlEnsureTrainers();
  setTimeout(() => {
    document.querySelectorAll("[data-sell]").forEach(b => b.onclick = (ev) => {
      ev.stopPropagation();
      const p = M.squad.find(x => x.id === +b.dataset.sell);
      if (!p) return;
      const block = mlCanRemove(p); if (block) { toast(block); return; }
      const fee = Math.round(p.value * 0.85 * 10) / 10;
      if (!confirm("Sell " + p.name + " for " + fmtM(fee) + "?")) return;
      M.budget = Math.round((M.budget + fee) * 10) / 10;
      M.squad = M.squad.filter(x => x.id !== p.id);
      M.soldIds.push(p.id);
      M._sqOpen = null;
      mlAutoXI(); mlNews("SOLD: " + p.name + " (" + fmtM(fee) + ")"); mlSave();
      render(mlSquadScreen);
    });
    const ax = $("#autoxi"); if (ax) ax.onclick = () => { mlAutoXI(false); mlSave(); render(mlSquadScreen); toast("★ Best XI picked"); };
    const axFit = $("#autoxifit"); if (axFit) axFit.onclick = () => { mlAutoXI(true); mlSave(); render(mlSquadScreen); toast("⚡ Best XI picked (prioritizing high fitness)"); };
    
    document.querySelectorAll("[data-sqflt]").forEach(b => b.onclick = () => {
      ML_SQ_FLT = b.dataset.sqflt;
      render(mlSquadScreen);
    });
    const sortSel = $("#sqsortsel");
    if (sortSel) sortSel.onchange = () => {
      ML_SQ_SORT = sortSel.value;
      render(mlSquadScreen);
    };

    document.querySelectorAll("[data-trainp]").forEach(b => b.onclick = (ev) => {
      ev.stopPropagation();
      const p = M.squad.find(x => x.id === +b.dataset.trainp);
      if (p) render(() => mlTrainScreen(p.id));
    });
    document.querySelectorAll("[data-conv]").forEach(b => b.onclick = (ev) => {
      ev.stopPropagation();
      const p = M.squad.find(x => x.id === +b.dataset.conv);
      if (!p) return;
      const block = mlCanRemove(p); if (block) { toast(block); return; }
      const tier = mlTrainerFor(p.ovr);
      if (!confirm("Convert " + p.name + " (OVR " + p.ovr + ") into a " + ML_TRAINERS[tier].label + "? No transfer fee.")) return;
      M.squad = M.squad.filter(x => x.id !== p.id);
      M.trainers[tier]++;
      M._sqOpen = null;
      mlNews("CONVERTED: " + p.name + " → " + ML_TRAINERS[tier].label);
      mlAutoXI(); mlSave(); render(mlSquadScreen);
    });
    document.querySelectorAll("[data-sqrow]").forEach(b => b.onclick = () => {
      const id = +b.dataset.sqrow;
      M._sqOpen = M._sqOpen === id ? null : id;
      render(mlSquadScreen);
    });
  }, 0);
  const openId = M._sqOpen || null;
  const fitBar = (p) => `<span class="fitbar"><i style="width:${Math.round(p.fit)}%;background:${p.fit > 70 ? "var(--green)" : p.fit > 40 ? "var(--gold)" : "var(--red)"}"></i></span>`;
  
  // Filter squad
  let filteredSquad = M.squad.filter(p => {
    if (ML_SQ_FLT === "all") return true;
    if (["GK", "DF", "MF", "FW"].includes(ML_SQ_FLT)) return p.pos === ML_SQ_FLT;
    if (ML_SQ_FLT === "xi") return M.xi.includes(p.id);
    if (ML_SQ_FLT === "bench") return (M.bench || []).includes(p.id);
    if (ML_SQ_FLT === "fit") return p.fit >= 70;
    if (ML_SQ_FLT === "tired") return p.fit < 70;
    return true;
  });

  // Sort squad
  filteredSquad.sort((a, b) => {
    if (ML_SQ_SORT === "fit") return b.fit - a.fit || b.ovr - a.ovr;
    if (ML_SQ_SORT === "age") return a.age - b.age || b.ovr - a.ovr;
    if (ML_SQ_SORT === "val") return b.value - a.value;
    return b.ovr - a.ovr;
  });

  const renderPlayerRow = (p) => {
    const inXI = M.xi.includes(p.id);
    const inBench = (M.bench || []).includes(p.id);
    const open = openId === p.id;
    const trainable = p.ovr < p.pot;
    const expPct = trainable ? Math.round(100 * (p.exp || 0) / mlExpNeed(p)) : 0;
    return `<div class="sqrow${inXI ? " xi" : ""}${open ? " open" : ""}">
      <div class="sqmain" data-sqrow="${p.id}">
        <span class="sqid">${inXI ? "★" : inBench ? "🪑" : ""}${mlRpos(p)}</span>
        <span class="sqname">${p.name}${mlCardChip(p)} ${mlFormArrow(p)}</span>
        <span class="sqovr">${p.ovr}${p.pot > p.ovr ? `<span class="sub">/${p.pot}</span>` : ""}</span>
      </div>
      <div class="sqsub">${fitBar(p)}<span class="sub">fit ${Math.round(p.fit)}% · age ${p.age} · ${fmtM(p.value)}${trainable ? ` · ${expPct}%` : ""}</span></div>
      ${open ? `<div class="sqact">
        ${trainable ? `<button class="btn gold" data-trainp="${p.id}">TRAIN</button>` : `<span class="sub" style="padding:6px">MAX POTENTIAL</span>`}
        <button class="btn secondary" data-conv="${p.id}">♻ TRAINER</button>
        <button class="btn secondary" data-sell="${p.id}">SELL 85%</button>
      </div>` : ""}
    </div>`;
  };

  const rows = ["GK", "DF", "MF", "FW"].map(bucket => {
    const ps = filteredSquad.filter(p => p.pos === bucket);
    if (!ps.length) return "";
    const body = ps.map(renderPlayerRow).join("");
    return `<div class="sqsec">${bucket} · ${ps.length}</div>${body}`;
  }).join("") || '<p class="sub" style="padding:16px 0;text-align:center">No players match current filter.</p>';

  const fltTabs = [
    { id: "all", label: "All (" + M.squad.length + ")" },
    { id: "xi", label: "★ Starting XI" },
    { id: "bench", label: "🪑 Bench" },
    { id: "GK", label: "GK" },
    { id: "DF", label: "DF" },
    { id: "MF", label: "MF" },
    { id: "FW", label: "FW" },
    { id: "fit", label: "⚡ Fit (70%+)" },
    { id: "tired", label: "😴 Tired (<70%)" }
  ];

  return `<div class="screen">${mlTopbar()}
    <div class="panel">
      <h2>Squad (${M.squad.length})</h2>
      <div class="optrow" style="gap:6px;margin-bottom:8px">
        <button class="btn secondary" id="autoxi" style="flex:1;padding:7px 10px;font-size:.72rem">★ AUTO XI (BEST)</button>
        <button class="btn gold" id="autoxifit" style="flex:1;padding:7px 10px;font-size:.72rem">⚡ AUTO XI (FITNESS)</button>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin:6px 0">
        <span class="sub" style="font-weight:700">Filter & Sort</span>
        <select id="sqsortsel" style="padding:4px 8px;background:#101812;color:var(--gold);border:1px solid var(--line);border-radius:6px;font-size:.72rem">
          <option value="ovr" ${ML_SQ_SORT === "ovr" ? "selected" : ""}>Sort: OVR (High)</option>
          <option value="fit" ${ML_SQ_SORT === "fit" ? "selected" : ""}>Sort: Fitness (High)</option>
          <option value="age" ${ML_SQ_SORT === "age" ? "selected" : ""}>Sort: Age (Young)</option>
          <option value="val" ${ML_SQ_SORT === "val" ? "selected" : ""}>Sort: Value (High)</option>
        </select>
      </div>
      <div class="filter-bar">
        ${fltTabs.map(t => `<button class="filter-pill ${ML_SQ_FLT === t.id ? "active" : ""}" data-sqflt="${t.id}">${t.label}</button>`).join("")}
      </div>
            <p class="sub" style="margin:4px 0">Form (PES condition): ${mlFormLegend()}</p>
<p class="sub" style="margin-top:6px">★ XI · ${M.formation} · str <b>${mlTeamStr(0)}</b> · tap a player for TRAIN / SELL. Trainers: 🥉${M.trainers.bronze} 🥈${M.trainers.silver} 🥇${M.trainers.gold}</p>
<p class="sub">Season log (real): ${(M.squad || []).filter(p => (p.goals || 0) + (p.assists || 0) > 0).sort((a, b) => (b.goals || 0) - (a.goals || 0)).slice(0, 4).map(p => `${p.name} ${p.goals || 0}G ${p.assists || 0}A`).join(" · ") || "no goals logged yet"}</p>
      ${rows}
    </div>
    ${mlNav()}</div>`;
}

// ---------- player training (eFootball trainer cards) ----------
function mlTrainScreen(pid) {
  mlEnsureTrainers();
  const p = M.squad.find(x => x.id === pid);
  if (!p) { render(mlSquadScreen); return ""; }
  const need = mlExpNeed(p);
  const maxed = p.ovr >= p.pot;
  setTimeout(() => {
    // Single card use
    document.querySelectorAll("[data-use]").forEach(b => b.onclick = () => {
      const tier = b.dataset.use;
      if (M.trainers[tier] <= 0) { toast("None left — win matches or buy in Card Draws"); return; }
      if (p.ovr >= p.pot) { toast("At full potential"); return; }
      M.trainers[tier]--;
      p.exp = (p.exp || 0) + ML_TRAINERS[tier].exp;
      let ups = 0;
      while (p.exp >= mlExpNeed(p) && p.ovr < p.pot) { p.exp -= mlExpNeed(p); p.ovr++; ups++; }
      if (p.ovr >= p.pot) p.exp = 0;
      p.value = mlValue(p.ovr, p.age);
      if (ups) { mlNews("LEVELED UP: " + p.name + " → OVR " + p.ovr); toast("💪 " + p.name + " → OVR " + p.ovr); }
      mlAutoXI(); mlSave(); render(() => mlTrainScreen(pid));
    });

    // Auto-Train: applies minimum trainers to level up 1 OVR
    const at = $("#trauto");
    if (at) at.onclick = () => {
      if (maxed) { toast("At full potential"); return; }
      const totalTrainers = M.trainers.bronze + M.trainers.silver + M.trainers.gold;
      if (totalTrainers <= 0) { toast("No trainer cards left"); return; }
      let needed = mlExpNeed(p) - (p.exp || 0);
      let ups = 0;
      while (needed > 0 && p.ovr < p.pot) {
        let tier = null;
        if (needed >= 160 && M.trainers.gold > 0) tier = "gold";
        else if (needed >= 60 && M.trainers.silver > 0) tier = "silver";
        else if (M.trainers.bronze > 0) tier = "bronze";
        else if (M.trainers.silver > 0) tier = "silver";
        else if (M.trainers.gold > 0) tier = "gold";
        if (!tier) break;
        M.trainers[tier]--;
        p.exp = (p.exp || 0) + ML_TRAINERS[tier].exp;
        while (p.exp >= mlExpNeed(p) && p.ovr < p.pot) {
          p.exp -= mlExpNeed(p); p.ovr++; ups++;
        }
        needed = mlExpNeed(p) - (p.exp || 0);
        if (ups > 0) break; // leveled up by 1 point!
      }
      if (p.ovr >= p.pot) p.exp = 0;
      p.value = mlValue(p.ovr, p.age);
      if (ups) mlNews("LEVELED UP: " + p.name + " → OVR " + p.ovr);
      mlAutoXI(); mlSave();
      toast(ups ? `⚡ Leveled up to OVR ${p.ovr}!` : "Trainers applied!");
      render(() => mlTrainScreen(pid));
    };

    // Max-Train: trains up to pot using available cards
    const mt = $("#trmax");
    if (mt) mt.onclick = () => {
      if (maxed) { toast("At full potential"); return; }
      let ups = 0;
      while (p.ovr < p.pot) {
        let tier = null;
        if (M.trainers.gold > 0) tier = "gold";
        else if (M.trainers.silver > 0) tier = "silver";
        else if (M.trainers.bronze > 0) tier = "bronze";
        if (!tier) break;
        M.trainers[tier]--;
        p.exp = (p.exp || 0) + ML_TRAINERS[tier].exp;
        while (p.exp >= mlExpNeed(p) && p.ovr < p.pot) {
          p.exp -= mlExpNeed(p); p.ovr++; ups++;
        }
      }
      if (p.ovr >= p.pot) p.exp = 0;
      p.value = mlValue(p.ovr, p.age);
      if (ups) mlNews("LEVELED UP: " + p.name + " → OVR " + p.ovr);
      mlAutoXI(); mlSave();
      toast(ups ? `★ Max-trained: +${ups} OVR (now OVR ${p.ovr})!` : "No trainers available");
      render(() => mlTrainScreen(pid));
    };

    $("#trback").onclick = () => render(mlSquadScreen);
  }, 0);
  const pct = maxed ? 100 : Math.round(100 * (p.exp || 0) / need);
  return `<div class="screen">${mlTopbar()}
    <div class="panel">
      <h2>💪 Training: ${p.name}</h2>
      <div class="kv"><span>${mlRpos(p)} · age ${p.age}${p.card ? " · " + p.card : ""}</span><b>OVR ${p.ovr}${p.pot > p.ovr ? " / " + p.pot + " potential" : " (MAX)"}</b></div>
      ${maxed ? '<p class="sub">At full potential — trainers would be wasted.</p>' : `
      <div class="mombar" style="margin:8px 0"><div class="momfill" style="width:${pct}%"></div></div>
      <p class="sub center">${p.exp || 0} / ${need} EXP to OVR ${p.ovr + 1}</p>
      <div class="optrow" style="margin:8px 0;gap:8px">
        <button class="btn secondary" id="trauto" ${maxed ? "disabled" : ""} style="flex:1">⚡ AUTO-TRAIN (+1 OVR)</button>
        <button class="btn gold" id="trmax" ${maxed ? "disabled" : ""} style="flex:1">★ MAX-TRAIN</button>
      </div>`}
      ${Object.entries(ML_TRAINERS).map(([id, t]) =>
        `<div class="kv"><span>${t.label}<br><span class="sub">+${t.exp} EXP · you have ${M.trainers[id]}</span></span>
         <button class="btn ${id === "gold" ? "gold" : "secondary"}" data-use="${id}" ${M.trainers[id] <= 0 || maxed ? "disabled" : ""}>USE</button></div>`).join("")}
      <p class="sub">Earn trainers by winning matches & events, buy them in Card Draws, or ♻ convert surplus players.</p>
      <button class="btn secondary" id="trback">⬅ SQUAD</button>
    </div>
  </div>`;
}

// ---------- tactics ----------
// ---------- TACTICAL COUNTER SYSTEM (#7): one honest rock-paper-scissors ring ----------
// beats / losesTo are read straight off ML_STYLES; the duel bonus is the same +1.0 str the
// engine bakes into mlPreview odds. Nothing hidden, nothing rigged.
function mlCounterDuel(mine, theirs) {
  if (!ML_STYLES[mine] || !ML_STYLES[theirs]) return { v: 0, cls: "cn", txt: "Unknown styles \u2014 neutral" };
  if (ML_STYLES[mine].beats === theirs) return { v: 1, cls: "cw", txt: ML_STYLES[mine].short + " counters " + ML_STYLES[theirs].short + " \u2014 you +1.0" };
  if (ML_STYLES[theirs].beats === mine) return { v: -1, cls: "cl", txt: ML_STYLES[theirs].short + " counters " + ML_STYLES[mine].short + " \u2014 them +1.0" };
  return { v: 0, cls: "cn", txt: "Neutral \u2014 no bonus either way" };
}
function mlCounterMatrixHTML() {
  const ids = Object.keys(ML_STYLES);
  const mine = M.style || "possession";
  const head = ids.map(t => `<th>vs ${ML_STYLES[t].short}</th>`).join("");
  const body = ids.map(r => {
    const cells = ids.map(c => {
      const d = mlCounterDuel(r, c);
      const v = d.v > 0 ? "+1" : d.v < 0 ? "\u22121" : "0";
      return `<td class="${d.cls}${c === mine ? " cur" : ""}">${v}</td>`;
    }).join("");
    return `<tr class="${r === mine ? "mine" : ""}"><th>${ML_STYLES[r].short}${r === mine ? " \u2605" : ""}</th>${cells}</tr>`;
  }).join("");
  return `<table class="cmatrix"><tr><th>You \u2193 / Them \u2192</th>${head}</tr>${body}</table>`;
}

function mlTacticsScreen() {
  setTimeout(() => {
    document.querySelectorAll("[data-form]").forEach(o => o.onclick = () => {
      M.formation = o.dataset.form; mlAutoXI(); mlSave(); render(mlTacticsScreen);
    });
    document.querySelectorAll("[data-ment]").forEach(o => o.onclick = () => {
      M.mentality = o.dataset.ment; mlSave(); render(mlTacticsScreen);
    });
    document.querySelectorAll("[data-styl]").forEach(o => o.onclick = () => {
      M.style = o.dataset.styl; mlSave(); render(mlTacticsScreen);
    });
    const ax = $("#tacautoxi"); if (ax) ax.onclick = () => { mlAutoXI(false); mlSave(); toast("★ Best XI picked"); render(mlTacticsScreen); };
    const axFit = $("#tacfitxi"); if (axFit) axFit.onclick = () => { mlAutoXI(true); mlSave(); toast("⚡ Fresh XI picked (fit >= 70%)"); render(mlTacticsScreen); };
  }, 0);
  const xiPlayers = mlXIPlayers();
  const avgFit = Math.round(xiPlayers.reduce((a, b) => a + b.fit, 0) / (xiPlayers.length || 1));
  const tiredN = xiPlayers.filter(p => p.fit < 70).length;
  return `<div class="screen">${mlTopbar()}
    <div class="panel"><h2>Tactical XI & Squad Rotation</h2>
      <div class="kv"><span>XI Average Fitness</span><b style="color:${avgFit >= 70 ? 'var(--green)' : 'var(--gold)'}">${avgFit}% ${tiredN ? `(${tiredN} tired)` : '· Fresh'}</b></div>
      <div class="optrow" style="gap:6px;margin:8px 0">
        <button class="btn secondary" id="tacautoxi" style="flex:1;padding:8px 10px;font-size:.72rem">★ AUTO XI (BEST)</button>
        <button class="btn gold" id="tacfitxi" style="flex:1;padding:8px 10px;font-size:.72rem">⚡ AUTO XI (FITNESS)</button>
      </div>
      <div class="sub" style="line-height:1.4">Auto-Pick (Fitness) rotates fatigued players to the bench, allowing them to rest and recover stamina while fielding your freshest available lineup.</div>
    </div>
    <div class="panel"><h2>Formation</h2>
      <div class="optrow">${Object.keys(ML_FORMS).map(f =>
        `<div class="opt ${M.formation === f ? "sel" : ""}" data-form="${f}" style="flex:1 1 45%">${f}<br>
         <span class="sub">${Object.entries(ML_FORMS[f]).map(([k, v]) => v + k).join(" ")}</span></div>`).join("")}</div>
      <p class="sub">Changing formation re-picks your best XI automatically.</p></div>
    <div class="panel"><h2>Mentality</h2>
      <div class="optrow">${Object.entries(ML_MENT).map(([id, m]) =>
        `<div class="opt ${M.mentality === id ? "sel" : ""}" data-ment="${id}" style="flex:1 1 45%">${m.label}<br><span class="sub">${m.desc}</span></div>`).join("")}</div>
      <p class="sub">Honest modifiers, shown exactly as applied to team strength. XI now: <b>${mlTeamStr(0) + ML_MENT[M.mentality].you}</b> effective.</p></div>
    <div class="panel"><h2>Playing Style</h2>
      <div class="optrow">${Object.entries(ML_STYLES).map(([id, st]) =>
        `<div class="opt ${(M.style || "possession") === id ? "sel" : ""}" data-styl="${id}" style="flex:1 1 45%">${st.label}<br><span class="sub">beats ${ML_STYLES[st.beats].label} · loses to ${ML_STYLES[st.losesTo].label}</span></div>`).join("")}</div>
      <p class="sub">One pick, honest numbers: counter their style for <b>+1.0 str</b> (baked into the shown odds). Opponents’ styles are hidden until you’ve played them — or scout on the match preview.</p></div>
        <div class="panel"><h2>♻️ Tactical Counter Matrix</h2>
      ${mlCounterMatrixHTML()}
      <p class="sub">Your row (★) against their column. <b>+1</b> = you get +1.0 effective strength, <b>−1</b> = they do, <b>0</b> = neutral. Every duel resolves through the honest engine — these are the exact numbers applied at kickoff.</p>
    </div>
${mlNav()}</div>`;
}

// ---------- market ----------
function mlMarketWeek() { // real-world weekly cycle (eFootball-style Thursday-ish updates)
  return Math.floor(Date.now() / (7 * 864e5));
}
function mlMarketPool() {
  const week = mlMarketWeek();
  const rng = E.mulberry32(E.hashSeed(M.seed + ":mkt:w" + week));
  const pool = [];
  for (let i = 0; i < 6; i++) {
    const bucket = ["GK", "DF", "DF", "MF", "MF", "FW"][i];
    const p = mlGenPlayer(rng, M.region, bucket, 66 + Math.floor(rng() * 12));
    if (rng() < 0.35) { // special cards appear in the market too — LC-priced
      const roll = rng();
      const cardId = roll < 0.08 ? "legendary" : roll < 0.38 ? "bigtime" : roll < 0.72 ? "showtime" : "trending";
      mlApplySpecialTier(p, cardId, rng);
      p.lcPrice = ML_CARDS[cardId].lc + Math.round(Math.max(0, p.ovr - 80) * 1.5);
    }
    pool.push(p);
  }
  return pool.filter(p => !M.soldIds.includes(p.id) && !M.squad.some(q => q.id === p.id));
}
function mlBalStar() {
  if (M.boughtBal) return null;
  try {
    const bal = JSON.parse(localStorage.getItem("footballLegendSave_v1"));
    if (!bal || !bal.stats) return null;
    const bonus = { standard: 0, trending: 2, showtime: 4, bigtime: 3, legendary: 6 }[bal.cardType] || 0;
    const ovr = Math.min(94, E.calcOVR(bal.stats, bal.pos) + bonus);
    return { id: 999999001, name: bal.name, pos: ML_POSMAP[bal.pos] || "FW", age: 24, ovr, pot: Math.min(96, ovr + 2),
             fit: 100, value: mlValue(ovr, 24) * 1.4, wage: Math.round(8 + Math.pow(Math.max(0, ovr - 50), 1.6) * 0.7),
             card: "\u2b50 BaL LEGEND", bal: true };
  } catch (e) { return null; }
}
function mlMarketScreen() {
  const pool = mlMarketPool();
  const star = mlBalStar();
  setTimeout(() => {
    document.querySelectorAll("[data-buy]").forEach(b => b.onclick = () => {
      const id = +b.dataset.buy;
      const p = (star && star.id === id) ? star : pool.find(x => x.id === id);
      if (!p) return;
      if (M.squad.length >= 26) { toast("Squad full (26)"); return; }

      const price = p.lcPrice ? p.lcPrice : Math.round(p.value * 10) / 10;
      const costStr = p.lcPrice ? (p.lcPrice + " LC") : fmtM(price);

      if (p.lcPrice) {
        if ((M.lc || 0) < p.lcPrice) { toast("Special cards cost LC — not enough LC"); return; }
      } else {
        if (M.budget < price) { toast("Not enough GP budget"); return; }
      }

      // Confirmation dialog before purchase
      const modal = document.createElement("div");
      modal.className = "fl-modal-overlay";
      modal.innerHTML = `
        <div class="fl-modal-box">
          <div class="fl-modal-title">Confirm Transfer</div>
          <div class="fl-modal-desc">
            Sign <b>${p.name}</b> (${mlRpos(p)} · OVR ${p.ovr}${p.card ? ' · ' + p.card : ''})<br>
            Transfer Fee: <b style="color:var(--gold)">${costStr}</b><br>
            Wage: ${p.wage}K/week
          </div>
          <div class="fl-modal-actions">
            <button class="btn secondary" id="mktcancel">Cancel</button>
            <button class="btn gold" id="mktconfirm">Sign Player</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const closeModal = () => modal.remove();
      modal.querySelector("#mktcancel").onclick = closeModal;
      modal.querySelector("#mktconfirm").onclick = () => {
        closeModal();
        if (p.lcPrice) {
          if ((M.lc || 0) < p.lcPrice) { toast("Not enough LC"); return; }
          M.lc -= p.lcPrice;
        } else {
          if (M.budget < price) { toast("Not enough GP budget"); return; }
          M.budget = Math.round((M.budget - price) * 10) / 10;
        }
        M.squad.push(Object.assign({}, p));
        if (p.bal) M.boughtBal = true;
        M.soldIds.push(p.id);
        mlAutoXI();
        mlNews("SIGNED: " + p.name + " (" + mlRpos(p) + " " + p.ovr + ") for " + costStr);
        mlSave();

        // Reactive DOM update: instant feedback without full page refresh
        const rowEl = b.closest(".kv");
        if (rowEl) {
          b.disabled = true;
          b.className = "badge green";
          b.style.cursor = "default";
          b.textContent = "✓ SIGNED";
          rowEl.style.opacity = "0.7";
        }
        // Update topbar budget display reactively
        const topEl = document.querySelector(".topbar");
        if (topEl) topEl.outerHTML = mlTopbar();

        toast(`✅ ${p.name} signed to your squad!`);
      };
    });
  }, 0);
  const row = (p) => `<div class="kv"><span><b>${mlRpos(p)}</b> ${p.name}${mlCardChip(p)}<br>
    <span class="sub">age ${p.age} · OVR ${p.ovr}${p.pot > p.ovr ? "/" + p.pot : ""} · ${p.wage}K/wk${(p.skills || []).length ? " · 🎯 " + p.skills.join(", ") : ""}</span></span>
    <button class="btn ${p.card ? "gold" : "secondary"}" data-buy="${p.id}">${p.lcPrice ? p.lcPrice + " LC" : fmtM(Math.round(p.value * 10) / 10)}</button></div>`;
  return `<div class="screen">${mlTopbar()}
    ${star ? `<div class="panel"><h2>⭐ Available: your Legend</h2><p class="sub">Your Become a Legend player, exported to this market.</p>${row(star)}</div>` : ""}
    <div class="panel"><h2>Transfer Market <span class="badge gold">WEEK ${mlMarketWeek() % 52 + 1}</span></h2>
    <p class="sub">🆕 New players every real-world week (next refresh: ${(() => { const d = new Date((mlMarketWeek() + 1) * 7 * 864e5); return d.toLocaleDateString(); })()}). Special cards cost LC. Sell from the Squad screen (85% of value).</p>
    ${pool.map(row).join("") || '<p class="sub">No targets this week.</p>'}</div>
    ${mlNav()}</div>`;
}

// ---------- packs ----------
function mlPacksScreen() {
  mlEnsureTrainers();
  setTimeout(() => {
    document.querySelectorAll("[data-buytr]").forEach(b => b.onclick = () => {
      const tier = b.dataset.buytr, t = ML_TRAINERS[tier];
      if (M.budget < t.price) { toast("Not enough GP"); return; }
      M.budget = Math.round((M.budget - t.price) * 10) / 10;
      mlEnsureTrainers(); M.trainers[tier]++;
      mlSave(); toast(t.label + " added"); render(mlPacksScreen);
    });
    document.querySelectorAll("[data-pack]").forEach(b => b.onclick = () => {
      const kind = b.dataset.pack;
      if (M.squad.length >= 26) { toast("Squad full"); return; }
      if (kind === "std") {
        if (M.budget < 3) { toast("Not enough GP budget"); return; }
        M.budget = Math.round((M.budget - 3) * 10) / 10;
      } else {
        const lcCost = kind === "star" ? 30 : 60;
        if ((M.lc || 0) < lcCost) { toast("Not enough LC \u2014 earn it from cups, trophies & big performances"); return; }
        M.lc -= lcCost;
      }
      M.packsBought++;
      const rng = E.mulberry32(E.hashSeed(M.seed + ":pack:" + M.packsBought));
      const bucket = ["GK", "DF", "MF", "MF", "FW"][Math.floor(rng() * 5)];
      let p;
      if (kind === "std") {
        p = mlGenPlayer(rng, M.region, bucket, 66 + Math.floor(rng() * 11));
        p.cardId = null; p.card = null; p.skills = [];
      } else if (kind === "star") {
        p = mlGenPlayer(rng, M.region, bucket, 78 + Math.floor(rng() * 6));
        const roll = rng();
        const cardId = roll < 0.08 ? "legendary" : roll < 0.38 ? "bigtime" : roll < 0.68 ? "showtime" : "trending";
        mlApplySpecialTier(p, cardId, rng);
      } else { // "leg" — Legend Draw: guaranteed showtime+, big legendary chance
        p = mlGenPlayer(rng, M.region, bucket, 86 + Math.floor(rng() * 6));
        const roll = rng();
        const cardId = roll < 0.30 ? "legendary" : roll < 0.70 ? "bigtime" : "showtime";
        mlApplySpecialTier(p, cardId, rng);
      }
      M.squad.push(p); mlAutoXI(); mlNews("DRAW: " + p.name + " (" + p.ovr + " " + p.pos + (p.card ? " \u00b7 " + p.card : "") + ")");
      mlSave(); toast("\ud83c\udccf " + p.name + " \u00b7 OVR " + p.ovr + (p.card ? " \u00b7 " + p.card : ""));
      render(mlPacksScreen);
    });
  }, 0);
  return `<div class="screen">${mlTopbar()}
    <div class="panel"><h2>\ud83c\udccf Card Draws</h2>
      <p class="sub">Funded from your transfer budget. Odds are the generation ranges shown \u2014 nothing hidden.</p>
      <div class="kv"><span><b>Standard Draw</b><br><span class="sub">OVR 66\u201377 \u00b7 STANDARD card \u00b7 no skills</span></span><button class="btn secondary" data-pack="std">3.0M GP</button></div>
      <div class="kv"><span><b>\u2b50 Star Draw</b><br><span class="sub">OVR 83\u201391 \u00b7 TRENDING 32% / SHOW TIME 30% / BIG TIME 30% / LEGENDARY 8%</span></span><button class="btn gold" data-pack="star">30 LC</button></div>
      <div class="kv"><span><b>\ud83d\udc51 Legend Draw</b><br><span class="sub">OVR 87\u201396 \u00b7 SHOW TIME 30% / BIG TIME 40% / LEGENDARY 30%</span></span><button class="btn gold" data-pack="leg">60 LC</button></div>
      <p class="sub">\ud83e\ude99 LC comes from cup runs, trophies, top-3 finishes, star performances and daily logins \u2014 or Become a Legend awards.</p>
    </div>
    <div class="panel"><h2>💪 Trainer Cards</h2>
      <p class="sub">EXP material — apply to any player from the Squad screen. You have: 🥉${M.trainers.bronze} 🥈${M.trainers.silver} 🥇${M.trainers.gold}</p>
      ${Object.entries(ML_TRAINERS).map(([id, t]) =>
        `<div class="kv"><span>${t.label}<br><span class="sub">+${t.exp} EXP</span></span>
         <button class="btn ${id === "gold" ? "gold" : "secondary"}" data-buytr="${id}">${t.price.toFixed(1)}M</button></div>`).join("")}
    </div>
    ${mlNav()}</div>`;
}

// ---------- table & news ----------
function mlTableScreen() {
  // competitions hub: My League | other galaxy leagues | Champions Trophy panel
  const worldView = M._worldLg != null && M.galaxy && M._worldLg !== M.leagueIdx;
  setTimeout(() => {
    document.querySelectorAll("[data-mlworldlg]").forEach(b => b.onclick = () => { M._worldLg = +b.dataset.mlworldlg; render(mlTableScreen); });
  }, 0);
  const worldTabs = M.galaxy ? `<div class="viewrow" style="flex-wrap:wrap;gap:4px;margin-bottom:6px">
    ${M.galaxy.leagues.map((L, li) => `<button class="btn secondary ${((M._worldLg == null ? M.leagueIdx : M._worldLg) === li) ? "on" : ""}" data-mlworldlg="${li}" style="flex:1 1 30%;font-size:.72rem;padding:6px 4px">${L.name.split(" ")[0]}${li === M.leagueIdx ? " \u2b50" : ""}</button>`).join("")}
  </div>` : "";
  if (worldView) {
    const L = M.galaxy.leagues[M._worldLg];
    const wt = E.computeTable(L.clubs, L.results || []);
    return `<div class="screen">${mlTopbar()}
      <div class="panel"><h2>\ud83c\udf0d ${L.name} \u00b7 Season ${M.season}</h2>
        ${worldTabs}
        ${wt.map((r, i) => `<div class="kv"><span>${i + 1}. ${r.name}</span><b>${r.Pts} pts \u00b7 ${r.GF}-${r.GA}</b></div>`).join("")}
        <p class="sub" style="margin-top:6px">League champions qualify for next season's \ud83c\udf0d Champions Trophy (top-3 leagues send two).</p>
      </div>
      ${mlNav()}</div>`;
  }
  const table = E.computeTable(M.world.clubs, M.results);
  const ctPanel = (M.ct && M.ct.myG >= 0) ? (() => {
    const gt = E.ctGroupTable(M.ct, M.ct.myG);
    const meE = M.ct.groups[M.ct.myG][M.ct.myS];
    return `<div class="panel">
      <h2>\ud83c\udf0d Champions Trophy \u00b7 Group ${"ABCD"[M.ct.myG]}</h2>
      ${M.ct.stage === "group" ? gt.map((r, i) => {
          const e2 = M.ct.groups[M.ct.myG][r.s]; const c = E.ctClub(M.galaxy, e2);
          const isMe = e2.league === meE.league && e2.club === meE.club;
          return `<div class="kv" ${isMe ? 'style="color:var(--gold)"' : ""}><span>${i + 1}. ${c.name}${isMe ? " (YOU)" : ""}</span><b>${r.Pts} pts \u00b7 GD ${r.GD > 0 ? "+" : ""}${r.GD}</b></div>`;
        }).join("") + `<p class="sub" style="margin-top:6px">Top two advance \u00b7 group matches ${M.ct.gPlayed}/6 played \u00b7 CT nights follow league MDs ${ML_CT_NIGHTS.join(", ")}.</p>`
      : M.ct.done ? `<p class="sub">${M.ct.champion ? E.ctClub(M.galaxy, M.ct.champion).name + " won the trophy." : "Tournament complete."}</p>`
      : `<p class="sub">Knockout stage \u00b7 ${E.CT_ROUNDS[M.ct.koRound]} ${M.ct.alive ? "\u2014 you're still in it!" : "\u2014 you're out."}</p>`}
    </div>`;
  })() : "";
  return `<div class="screen">${mlTopbar()}
    <div class="panel"><h2>${M.tier === 0 ? (E.REGION_LEAGUES[M.region] || "National League") : "Continental Super League"}</h2>
    ${worldTabs}
    ${table.map((t, i) => `<div class="kv" ${t.i === M.clubIdx ? 'style="color:var(--gold)"' : ""}>
      <span>${i + 1}. ${M.world.clubs[t.i].name}${t.i === M.clubIdx ? " (YOU)" : ""}${mlManagerOf(M.world.clubs[t.i]) ? ` <span class="sub">\ud83c\udfae ${mlManagerOf(M.world.clubs[t.i])}</span>` : ""}</span>
      <b>${t.Pts} pts \u00b7 ${t.GF}-${t.GA}</b></div>`).join("")}</div>
    ${ctPanel}
    ${mlNav()}</div>`;
}
var ML_NEWS_CAT = "all";
function mlNewsScreen() {
  setTimeout(() => {
    document.querySelectorAll("[data-newscat]").forEach(b => b.onclick = () => {
      ML_NEWS_CAT = b.dataset.newscat;
      render(mlNewsScreen);
    });
  }, 0);

  const getCat = (txt) => {
    const t = (txt || "").toUpperCase();
    if (t.includes("SIGNED") || t.includes("SOLD") || t.includes("DRAW:") || t.includes("CONVERTED")) return "transfers";
    if (t.includes("LEVELED UP") || t.includes("POTENTIAL") || t.includes("TRAINER")) return "training";
    if (t.includes("MATCH") || t.includes("WIN") || t.includes("DEFEAT") || t.includes("CUP") || t.includes("CHAMPIONS") || t.includes("ABANDONED")) return "matches";
    return "general";
  };

  const cats = [
    { id: "all", label: "All News" },
    { id: "transfers", label: "🔄 Transfers" },
    { id: "matches", label: "⚽ Matches" },
    { id: "training", label: "💪 Training" }
  ];

  const filtered = M.news.filter(n => {
    if (ML_NEWS_CAT === "all") return true;
    return getCat(n.txt) === ML_NEWS_CAT;
  });

  const getBadge = (txt) => {
    const cat = getCat(txt);
    if (cat === "transfers") return '<span class="badge gold" style="font-size:.65rem">TRANSFER</span>';
    if (cat === "training") return '<span class="badge green" style="font-size:.65rem">DEVELOPMENT</span>';
    if (cat === "matches") return '<span class="badge blue" style="font-size:.65rem">MATCH</span>';
    return '<span class="badge" style="font-size:.65rem">CLUB</span>';
  };

  return `<div class="screen">${mlTopbar()}
    <div class="panel">
      <h2>📰 Club Newsroom</h2>
      <div class="filter-bar" style="margin-bottom:10px">
        ${cats.map(c => `<button class="filter-pill ${ML_NEWS_CAT === c.id ? "active" : ""}" data-newscat="${c.id}">${c.label}</button>`).join("")}
      </div>
      ${filtered.map(n => `
        <div class="news-card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            ${getBadge(n.txt)}
            <span class="sub" style="font-size:.68rem">Season ${n.s} · MD ${n.md}</span>
          </div>
          <div style="font-size:.82rem;line-height:1.35">${n.txt}</div>
        </div>`).join("") || '<p class="sub" style="text-align:center;padding:20px 0">No news in this category yet.</p>'}
    </div>
    ${mlNav()}</div>`;
}

// ============================ MATCHDAY ============================
function mlResolveAbandoned() {
  if (!M || !M.mdLock) return false;
  const L = M.mdLock; M.mdLock = null;
  let fx, r;
  if (L.ct) {
    fx = { ct: true, ctStage: L.ctStage, ctMD: L.ctMD, ctX: L.ctX, ctY: L.ctY, ctHome: L.ctHome, opp: L.opp,
           oppClub: E.ctClub(M.galaxy, L.opp), koPre: L.koPre, home: L.ctHome ? M.clubIdx : -1, away: L.ctHome ? -1 : M.clubIdx };
    const Hc = L.ctHome ? mlClub() : fx.oppClub, Ac = L.ctHome ? fx.oppClub : mlClub();
    r = E.simulateMatch(Hc, Ac, { seed: E.hashSeed(M.seed + ":aband:" + L.key), fast: true });
  } else {
    fx = { home: L.home, away: L.away, cup: L.cup };
    r = E.simulateMatch(M.world.clubs[fx.home], M.world.clubs[fx.away],
      { seed: E.hashSeed(M.seed + ":aband:" + L.key), fast: true });
  }
  mlNews("\u26a0\ufe0f Abandoned match resolved by simulation: " + r.gH + "-" + r.gA + ".");
  mlFinishSilent(fx, r);
  return true;
}
function mlFinishSilent(fx, r) { // apply a result without rendering the review screen
  const prevRender = window.render; let captured = null;
  window.render = (s) => { captured = s; };
  try { mlFinish(fx, r, { home: 0, draw: 0, away: 0 }); } finally { window.render = prevRender; }
}
function mlGoMatch() {
  if (mlResolveAbandoned()) toast("\u26a0\ufe0f Abandoned match resolved.");
  mlAutoXI0Fix();
  if (M.matchday >= 18 && !mlCupPending() && !mlCtFixture()) { render(mlHome); return; }
  render(mlPreview);
}
function mlAutoXI0Fix() { // heal any historic illegal XI (e.g. saved before enforcement existed)
  if (!mlXIValid()) { mlAutoXI(); mlSave(); }
}
const ML_CT_NIGHTS = [3, 6, 9, 12, 15, 17]; // after these many league MDs, a CT group MD is due
function mlCtGroupMDDue() { // which CT group MD (0-5) is due, or -1
  if (!M.ct || !M.ct.alive || M.ct.stage !== "group") return -1;
  const due = ML_CT_NIGHTS.filter(n => M.matchday >= n).length;
  return M.ct.gPlayed < due ? M.ct.gPlayed : -1;
}
function mlCtKODue() {
  return !!(M.ct && M.ct.alive && M.ct.stage === "ko" && M.matchday >= 18 && !M.ct.done);
}
function mlCtMyEntry() { return M.ct && M.ct.myG >= 0 ? M.ct.groups[M.ct.myG][M.ct.myS] : null; }
function mlCtFixture() { // build the CT fixture (group or KO) as a pseudo-fixture
  const gmd = mlCtGroupMDDue();
  if (gmd >= 0) {
    // canonical pairing (must mirror engine ctSimGroups exactly so result keys dedupe)
    const pairs = gmd % 3 === 0 ? [[0, 1], [2, 3]] : gmd % 3 === 1 ? [[0, 2], [1, 3]] : [[0, 3], [1, 2]];
    let [x, y] = pairs.find(p => p.includes(M.ct.myS));
    if (gmd >= 3) [x, y] = [y, x];
    const home = x === M.ct.myS;
    const opp = M.ct.groups[M.ct.myG][home ? y : x];
    return { ct: true, ctStage: "group", ctMD: gmd, opp, ctX: x, ctY: y, oppClub: E.ctClub(M.galaxy, opp), ctHome: home,
             home: home ? M.clubIdx : -1, away: home ? -1 : M.clubIdx };
  }
  if (mlCtKODue()) {
    const meE = mlCtMyEntry();
    const r = E.ctSimKORound(M.ct, M.galaxy, M.seed + ":s" + M.season, true, meE);
    if (!r.myFx) return null;
    const opp = (r.myFx.A.league === meE.league && r.myFx.A.club === meE.club) ? r.myFx.B : r.myFx.A;
    return { ct: true, ctStage: "ko", opp, oppClub: E.ctClub(M.galaxy, opp), ctHome: true, home: M.clubIdx, away: -1, koPre: r };
  }
  return null;
}
function mlSubsAllowed(fx) { // league rule: 5 standard, 6 in Campeonato/Nordisk; continental & cup 5
  if (fx && (fx.ct || fx.cup)) return 5;
  if (M.tier === 1) return 5; // Continental Super League rule
  const def = (E.LEAGUE_DEFS && E.LEAGUE_DEFS[M.leagueIdx]) || null;
  return def ? def.subs : 5;
}
function mlBench() { // pre-picked bench of up to 10; auto-heal invalid entries
  const nonXI = M.squad.filter(p => !M.xi.includes(p.id));
  let b = (M.bench || []).filter(id => nonXI.some(p => p.id === id));
  if (!b.length) b = nonXI.sort((a, b2) => b2.ovr - a.ovr).slice(0, 10).map(p => p.id);
  M.bench = b.slice(0, 10);
  return M.bench;
}
function mlBenchScreen() {
  mlBench();
  const nonXI = M.squad.filter(p => !M.xi.includes(p.id)).sort((a, b) => b.ovr - a.ovr);
  setTimeout(() => {
    document.querySelectorAll("[data-btog]").forEach(el => el.onclick = () => {
      const id = +el.dataset.btog;
      if (M.bench.includes(id)) M.bench = M.bench.filter(x => x !== id);
      else if (M.bench.length >= 10) { toast("Bench is full (10) — remove someone first."); return; }
      else M.bench.push(id);
      mlSave(); render(mlBenchScreen);
    });
    const ab = $("#mlautobench");
    if (ab) ab.onclick = () => {
      mlAutoBench("balanced");
      mlSave();
      toast("★ Bench auto-picked (balanced)");
      render(mlBenchScreen);
    };
    const abBal = $("#mlautobench_bal");
    if (abBal) abBal.onclick = () => {
      mlAutoBench("balanced");
      mlSave();
      toast("⚖ Bench auto-picked: Balanced (1 GK + Def/Mid/Fwd)");
      render(mlBenchScreen);
    };
    const abOvr = $("#mlautobench_ovr");
    if (abOvr) abOvr.onclick = () => {
      mlAutoBench("ovr");
      mlSave();
      toast("★ Bench auto-picked: Highest Rating (Top 10 Reserves)");
      render(mlBenchScreen);
    };
    const bk = $("#mlbback"); if (bk) bk.onclick = () => render(mlPreview);
  }, 0);
  return `<div class="screen">${mlTopbar()}
    <div class="panel">
      <h2>🪑 Match Bench <span class="badge gold" style="float:right">${M.bench.length}/10</span></h2>
      <p class="sub">Pick up to 10 substitutes. Only benched players can come on during the match.</p>
      <div class="optrow" style="gap:6px;margin-bottom:8px">
        <button class="btn secondary" id="mlautobench_bal" style="flex:1;padding:7px 8px;font-size:.72rem">⚖ AUTO (BALANCED)</button>
        <button class="btn gold" id="mlautobench_ovr" style="flex:1;padding:7px 8px;font-size:.72rem">★ AUTO (HIGHEST OVR)</button>
      </div>
      <button id="mlautobench" style="display:none"></button>
      ${nonXI.map(p => `<div class="opt ${M.bench.includes(p.id) ? "sel" : ""}" data-btog="${p.id}" style="font-size:.72rem;margin:3px 0">
        ${M.bench.includes(p.id) ? "✅" : "⬜"} ${mlRpos(p)} ${p.name} · OVR ${p.ovr} · fit ${Math.round(p.fit)}%</div>`).join("") || '<p class="sub">Every fit player is in the XI.</p>'}
      <button class="btn" id="mlbback">DONE ➔</button>
    </div>
  </div>`;
}
function mlFixtureNow() {
  const ctFx = mlCtFixture();
  if (ctFx) return ctFx;
  if (mlCupPending()) {
    const rng = E.mulberry32(E.hashSeed(M.seed + ":cupdraw:" + M.season + ":" + M.cup.round));
    let oppIdx = Math.floor(rng() * M.world.clubs.length);
    if (oppIdx === M.clubIdx) oppIdx = (oppIdx + 1) % M.world.clubs.length;
    const home = rng() < 0.5;
    return { home: home ? M.clubIdx : oppIdx, away: home ? oppIdx : M.clubIdx, cup: true };
  }
  return mlNextFixture();
}
function mlPreview() {
  const fx = mlFixtureNow();
  if (!fx) { render(mlHome); return ""; }
  const meHome = fx.ct ? fx.ctHome : fx.home === M.clubIdx;
  const oppClub = fx.ct ? fx.oppClub : M.world.clubs[meHome ? fx.away : fx.home];
  const oppStyle = mlStyleOf(oppClub);
  const duel = mlStyleDuel(M.style || "possession", oppStyle);
  const scouted = (M.scouted || []).includes(oppClub.name);
  const big = mlBigMatch(fx);
  const myEff = mlEffClub(null, { big }); // BIG TIME cards fire in big matches — included in shown odds
  myEff.str = Math.round((myEff.str + duel.you) * 10) / 10;
  const oppEff = Object.assign({}, oppClub, { str: oppClub.str + duel.opp });
  const Hc = meHome ? myEff : oppEff;
  const Ac = meHome ? oppEff : myEff;
  const probs = E.winProbs(Hc, Ac, 600);
  setTimeout(() => {
    $("#mlkick").onclick = () => {
      if (!mlXIValid()) { toast("\u26a0\ufe0f Your XI has no goalkeeper! Fix your squad first."); return; }
      render(() => mlMatchScreen(fx, probs));
    };
    const tw = $("#mltweak"); if (tw) tw.onclick = () => render(mlTacticsScreen);
    const bn = $("#mlbench"); if (bn) bn.onclick = () => render(mlBenchScreen);
    const sc = $("#mlscout"); if (sc) sc.onclick = () => {
      if (M.budget < 0.3) { toast("\u274c Not enough GP (0.3M needed)"); return; }
      M.budget = Math.round((M.budget - 0.3) * 100) / 100;
      M.scouted = M.scouted || []; M.scouted.push(oppClub.name); mlSave(); render(mlPreview);
    };
  }, 0);
  return `<div class="screen">${mlTopbar()}
    <div class="panel">
      <h2>${fx.ct ? (fx.ctStage === "group" ? "\ud83c\udf0d CHAMPIONS TROPHY \u00b7 Group MD " + (fx.ctMD + 1) + "/6" : "\ud83c\udf0d CHAMPIONS TROPHY \u00b7 " + E.CT_ROUNDS[M.ct.koRound]) : fx.cup ? "\ud83c\udfc6 CUP \u00b7 " + ML_CUP_ROUNDS[M.cup.round] : "Match Preview \u00b7 MD " + (M.matchday + 1)}</h2>
      <div class="vsrow">
        <div class="vsteam"><div class="tname">${fx.ct ? (meHome ? mlClub().name : oppClub.name) : M.world.clubs[fx.home].name}</div><div class="sub">str ${(meHome ? myEff : oppEff).str}</div></div>
        <div class="vsx">VS</div>
        <div class="vsteam"><div class="tname">${fx.ct ? (meHome ? oppClub.name : mlClub().name) : M.world.clubs[fx.away].name}</div><div class="sub">str ${(meHome ? oppEff : myEff).str}</div></div>
      </div>
      <p class="sub center" style="margin-bottom:4px">Win probability (true engine odds \u2014 never rigged)</p>
      <div class="probbar"><div class="pb-h" style="flex:${probs.home}">${probs.home}%</div>
        <div class="pb-d" style="flex:${probs.draw}">${probs.draw}%</div>
        <div class="pb-a" style="flex:${probs.away}">${probs.away}%</div></div>
      <div class="kv"><span>Formation \u00b7 Mentality</span><b>${M.formation} \u00b7 ${ML_MENT[M.mentality].label}</b></div>
      <div class="kv"><span>Your style</span><b>${ML_STYLES[M.style || "possession"].label}</b></div>
      <div class="kv"><span>Their style</span><b>${scouted ? ML_STYLES[oppStyle].label : "\u2753 Unknown"}</b></div>
      ${scouted ? `<div class="kv"><span>Style duel</span><b>${duel.txt}</b></div>` : `<button class="btn secondary" id="mlscout">\ud83d\udd0e SCOUT THEIR STYLE \u00b7 0.3M GP</button>`}
      ${mlManagerOf(oppClub) ? `<div class="kv"><span>Their manager</span><b>\ud83c\udfae ${mlManagerOf(oppClub)} <span class="sub">(AI-controlled)</span></b></div>` : ""}
      <div class="kv"><span>XI effective strength</span><b>${myEff.str}</b></div>
      ${big ? `<div class="kv"><span>\ud83d\udd25 Big match</span><b class="sub">BIG TIME cards active${mlXIPlayers().some(p => p.cardId === "bigtime") ? " (+4 for yours!)" : ""}</b></div>` : ""}
      <div class="kv"><span>\ud83d\udd01 Subs allowed</span><b>${mlSubsAllowed(fx)}${!fx.ct && !fx.cup && mlSubsAllowed(fx) === 6 ? " <span class='sub'>(league rule)</span>" : fx.ct ? " <span class='sub'>(continental rule)</span>" : ""}</b></div>
      <div class="kv"><span>\ud83e\ude91 Bench</span><b>${mlBench().length}/10 picked</b></div>
      <p class="sub">Strength = XI (form, fitness, cards) + depth bonus + captaincy + mentality + style duel. Same number the engine uses \u2014 tweak tactics and watch the odds move.</p>
      <button class="btn secondary" id="mlbench">\ud83e\ude91 PICK BENCH (10)</button>
      <button class="btn secondary" id="mltweak">\ud83d\udccb ADJUST TACTICS / XI</button>
      <button class="btn" id="mlkick">KICK OFF \u26bd</button>
    </div>
  </div>`;
}

function mlMatchScreen(fx, displayedProbs) {
  const meHome = fx.ct ? fx.ctHome : fx.home === M.clubIdx;
  const mKey = fx.ct ? (fx.ctStage === "group" ? `s${M.season}:ctg${fx.ctMD}` : `s${M.season}:ctko${M.ct.koRound}`)
             : fx.cup ? `s${M.season}:cup${M.cup.round}` : `s${M.season}:md${M.matchday}`;
  const Hc = fx.ct ? (meHome ? mlClub() : fx.oppClub) : M.world.clubs[fx.home];
  const Ac = fx.ct ? (meHome ? fx.oppClub : mlClub()) : M.world.clubs[fx.away];
  const seed = E.hashSeed(M.seed + ":s" + M.season + ":md" + M.matchday + (fx.cup ? ":cup" + M.cup.round : "") + (fx.ct ? ":" + (fx.ctStage === "group" ? "ctg" + fx.ctMD : "ctko" + M.ct.koRound) : ""));
  const duel = mlStyleDuel(M.style || "possession", mlStyleOf(meHome ? Ac : Hc));
  let ment = M.mentality;
  let subsLeft = mlSubsAllowed(fx), subbedOnIds = [], windowsShown = { 45: false, 65: false };
  const benchIds = mlBench().slice();
  const bigMatch = mlBigMatch(fx);
  function applyStrengths(minPlayed, attacking) {
    const mm = ML_MENT[ment];
    const ctx = { big: bigMatch, attacking: !!attacking };
    const mine = mlTeamStr(minPlayed, ctx) + mm.you + duel.you;
    const theirs = (meHome ? Ac.str : Hc.str) + mm.opp + duel.opp;
    if (meHome) match.setStrengths(mine + 4, theirs);
    else match.setStrengths(theirs + 4, mine);
  }
  const myStart = mlEffClub(ment, { big: bigMatch }).str + duel.you;
  const match = E.createMatch(
    meHome ? Object.assign({}, Hc, { str: myStart }) : Hc,
    meHome ? Ac : Object.assign({}, Ac, { str: myStart }),
    { seed, ko: !!(fx.cup || (fx.ct && fx.ctStage === "ko")) }); // #3: knockout night -> extra time + penalties
  // opponent mentality effect applies to their side too (ML_MENT.opp)
  applyStrengths(0);
  let timer = null, speed = 1, over = false;
  setTimeout(() => {
    // ---- anti-replay: consumed at kickoff ----
    M.playedKeys = M.playedKeys || [];
    if (M.playedKeys.includes(mKey)) { toast("\u26a0\ufe0f That match is already in the books."); render(mlHome); return; }
    M.playedKeys.push(mKey); if (M.playedKeys.length > 60) M.playedKeys.shift();
    M.mdLock = fx.ct ? { key: mKey, ct: true, ctStage: fx.ctStage, ctMD: fx.ctMD, ctX: fx.ctX, ctY: fx.ctY, ctHome: fx.ctHome, opp: fx.opp, koPre: fx.koPre || null }
              : { key: mKey, home: fx.home, away: fx.away, cup: !!fx.cup };
    mlSave();
    const clockEl = $("#mlclock"), scoreEl = $("#mlscore"), tickEl = $("#mlticker"), momEl = $("#mlmom");
    const decEl = $("#mldec");
    // ---------- ML 2D live view ----------
    let mlView = (typeof M.viewMode === "string" ? M.viewMode : "ticker");
    const mlv = { raf: null, ball: { x: 50, y: 50 }, tgt: { x: 50, y: 50 }, flash: null, players: [], last: 0, heat: 0 };
    function formSlots(form, home) { // x mirrored for away
      const rows = [];
      const f = ML_FORMS[form] || ML_FORMS["4-4-2"];
      const lines = [["GK", 6], ["DF", 24], ["MF", 48], ["FW", 72]];
      for (const [ln, bx] of lines) {
        const n = f[ln];
        for (let i = 0; i < n; i++) {
          const y = n === 1 ? 50 : 14 + (72 * i) / (n - 1);
          rows.push({ x: home ? bx : 100 - bx, y, ln });
        }
      }
      return rows;
    }
    function mlvInit() {
      const homeForm = meHome ? M.formation : "4-4-2";
      const awayForm = meHome ? "4-4-2" : M.formation;
      mlv.players = [
        ...formSlots(homeForm, true).map(s => ({ ...s, team: 0, ox: s.x, oy: s.y })),
        ...formSlots(awayForm, false).map(s => ({ ...s, team: 1, ox: s.x, oy: s.y }))
      ];
    }
    function mlvEvent(ev) {
      const homeSide = ev.team === 0;
      mlv.tgt = { x: homeSide ? 88 : 12, y: 38 + Math.random() * 24 };
      if (["goal", "save", "miss", "setpiece"].includes(ev.type)) {
        mlv.heat = 3;
        mlv.flash = { type: ev.type, team: ev.team, until: Date.now() + (ev.type === "goal" ? 2200 : 1200) };
      }
    }
    function mlvAtk() {
      const mom = match.state.momentum, domHome = mom >= 50, dom = domHome ? mom : 100 - mom;
      if (mlv.heat > 0) mlv.heat -= 0.008;
      const st2 = dom >= 74 || mlv.heat > 1.5 ? "DANGEROUS ATTACK" : dom >= 60 ? "ATTACKING" : dom >= 53 ? "BUILD-UP" : "MIDFIELD BATTLE";
      return { st: st2, T: domHome ? Hc.short : Ac.short, danger: st2 === "DANGEROUS ATTACK", attacking: st2 !== "MIDFIELD BATTLE", dirRight: domHome };
    }
    function drawML(ts) {
      if (mlView !== "live2d") { mlv.raf = null; return; }
      const cv2 = $("#mlpitch"); if (!cv2) { mlv.raf = null; return; }
      const g = cv2.getContext("2d"), W = cv2.width, Hh = cv2.height;
      const dt = mlv.last ? Math.min(50, ts - mlv.last) : 16; mlv.last = ts;
      // pitch
      g.fillStyle = "#14351c"; g.fillRect(0, 0, W, Hh);
      for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? "#153a1e" : "#14351c"; g.fillRect((W / 8) * i, 0, W / 8, Hh); }
      g.strokeStyle = "rgba(255,255,255,.35)"; g.lineWidth = 2;
      g.strokeRect(10, 10, W - 20, Hh - 20);
      g.beginPath(); g.moveTo(W / 2, 10); g.lineTo(W / 2, Hh - 10); g.stroke();
      g.beginPath(); g.arc(W / 2, Hh / 2, 52, 0, 7); g.stroke();
      g.strokeRect(10, Hh * 0.24, 88, Hh * 0.52); g.strokeRect(W - 98, Hh * 0.24, 88, Hh * 0.52);
      const px = (x) => 10 + (x / 100) * (W - 20), py = (y) => 10 + (y / 100) * (Hh - 20);
      // ball drift toward momentum zone + event targets
      const mom = match.state.momentum;
      const zoneX = 26 + (mom / 100) * 48;
      const wobble = Math.sin(ts / 900) * 9;
      const bx = mlv.flash ? mlv.tgt.x : zoneX + wobble, by = mlv.flash ? mlv.tgt.y : 50 + Math.sin(ts / 1300) * 16;
      mlv.ball.x += (bx - mlv.ball.x) * 0.04 * (dt / 16);
      mlv.ball.y += (by - mlv.ball.y) * 0.04 * (dt / 16);
      // players: hold formation, lean toward ball
      for (const p of mlv.players) {
        const lean = p.ln === "GK" ? 0.04 : p.ln === "DF" ? 0.12 : p.ln === "MF" ? 0.2 : 0.26;
        const tx = p.ox + (mlv.ball.x - 50) * lean, ty = p.oy + (mlv.ball.y - p.oy) * lean * 0.5;
        p.x += (tx - p.x) * 0.03 * (dt / 16); p.y += (ty - p.y) * 0.03 * (dt / 16);
        g.beginPath(); g.arc(px(p.x), py(p.y), 7, 0, 7);
        g.fillStyle = p.team === 0 ? (Hc.col1 || "#e8c15a") : (Ac.col1 || "#5a3a7a"); g.fill();
        g.strokeStyle = "rgba(0,0,0,.4)"; g.stroke();
      }
      // ball
      g.beginPath(); g.arc(px(mlv.ball.x), py(mlv.ball.y), 5, 0, 7);
      g.fillStyle = "#fff"; g.fill(); g.strokeStyle = "#333"; g.stroke();
      // event flash text
      if (mlv.flash) {
        if (Date.now() > mlv.flash.until) mlv.flash = null;
        else {
          const f = mlv.flash;
          g.font = "bold 30px system-ui"; g.textAlign = "center";
          g.fillStyle = f.type === "goal" ? "#ffd75e" : "#fff";
          g.fillText(f.type === "goal" ? "\u26bd GOAL!" : f.type === "save" ? "\ud83e\udd24 SAVE!" : f.type === "miss" ? "WIDE!" : "SET PIECE", W / 2, Hh / 2 - 60);
        }
      }
      // attack banner + arrows + danger tint
      const L = mlvAtk();
      if (L.attacking) {
        const col = L.danger ? "#ff5a4e" : "#ffd75e";
        g.font = "bold 14px system-ui"; g.textAlign = "right";
        g.fillStyle = "rgba(0,0,0,.55)"; g.fillRect(W - 210, Hh - 40, 200, 26);
        g.fillStyle = col; g.fillText(L.T + " \u00b7 " + L.st, W - 18, Hh - 22);
        const pulse = (Date.now() / 300) % 3, dir = L.dirRight ? 1 : -1;
        const bx0 = L.dirRight ? W - 250 : 250, by0 = Hh - 27;
        for (let i = 0; i < 3; i++) {
          const alpha = 0.25 + (((i - pulse + 3) % 3) < 1 ? 0.65 : 0);
          g.fillStyle = L.danger ? `rgba(255,90,78,${alpha})` : `rgba(255,215,94,${alpha})`;
          g.beginPath();
          const cx = bx0 - dir * i * 14;
          g.moveTo(cx, by0 - 7); g.lineTo(cx + dir * 8, by0); g.lineTo(cx, by0 + 7);
          g.closePath(); g.fill();
        }
        if (L.danger) {
          const usDefending = (L.dirRight && !meHome) || (!L.dirRight && meHome);
          const gx = L.dirRight ? W : 0;
          const gr2 = g.createLinearGradient(gx, 0, gx + (L.dirRight ? -110 : 110), 0);
          gr2.addColorStop(0, `rgba(255,70,60,${usDefending ? 0.30 : 0.16})`); gr2.addColorStop(1, "rgba(255,70,60,0)");
          g.fillStyle = gr2; g.fillRect(L.dirRight ? W - 110 : 0, 0, 110, Hh);
        }
      }
      // scoreboard
      g.font = "bold 15px system-ui"; g.textAlign = "left";
      g.fillStyle = "rgba(0,0,0,.55)"; g.fillRect(10, Hh - 40, 190, 26);
      g.fillStyle = "#fff"; g.fillText(`${Hc.short} ${match.state.gH} - ${match.state.gA} ${Ac.short}  ${match.state.min}'`, 18, Hh - 22);
      mlv.raf = requestAnimationFrame(drawML);
    }
    function mlSetView(v) {
      mlView = v; M.viewMode = v; mlSave();
      const cv2 = $("#mlpitch"), tk = $("#mlticker");
      if (cv2) cv2.style.display = v === "live2d" ? "block" : "none";
      if (tk) tk.style.display = v === "live2d" ? "none" : "block";
      document.querySelectorAll("[data-mlview]").forEach(b => b.classList.toggle("on", b.dataset.mlview === v));
      if (v === "live2d" && !mlv.raf) { mlv.last = 0; mlv.raf = requestAnimationFrame(drawML); }
    }
    mlvInit();
    document.querySelectorAll("[data-mlview]").forEach(b => b.onclick = () => mlSetView(b.dataset.mlview));
    setTimeout(() => mlSetView(mlView), 0);
    function addTick(min, txt, cls) {
      const d = document.createElement("div");
      d.className = "tick " + (cls || "");
      d.innerHTML = `<b>${min}'</b> ${txt}`;
      tickEl.prepend(d);
    }
    function describe(ev) {
      const mine = (ev.team === 0) === meHome;
      if (window.Snd) { if (ev.type === "goal") { mine ? Snd.goalUs() : Snd.goalThem(); } else if (ev.type === "save") Snd.save(); else if (ev.type === "setpiece") Snd.chance(); }
      if (ev.type === "goal") addTick(ev.min, `<b>${mine ? "\u26bd GOAL " + mlClub().short + "!" : "\u26a0 Goal " + (meHome ? Ac.short : Hc.short)}</b> ${ev.score[0]}-${ev.score[1]}${ev.via ? " (" + ev.via + ")" : ""}`, mine ? "you" : "goal");
      else if (ev.type === "save") addTick(ev.min, mine ? "Our effort is saved!" : "Big save by our keeper!", "");
      else if (ev.type === "miss") addTick(ev.min, mine ? "We go close \u2014 just wide!" : "They miss the target. Let off.", "");
      else if (ev.type === "card") addTick(ev.min, "\ud83d\udfe8 Booking.", "");
      else if (ev.type === "setpiece") addTick(ev.min, (mine ? "We win" : "They win") + (ev.pen ? " a PENALTY!" : " a free kick in range..."), mine ? "you" : "goal");
    }
    function showWindow(kind) {
      clearInterval(timer); timer = null;
      const bench = M.squad.filter(p => benchIds.includes(p.id) && !M.xi.includes(p.id) && !subbedOnIds.includes(p.id))
        .sort((a, b) => effOvr(b) - effOvr(a)).slice(0, 10);
      const tired = mlXIPlayers().map(p => ({ p, cur: p.fit - 25 * (match.state.min / 90) }))
        .sort((a, b) => a.cur - b.cur).slice(0, 6);
      decEl.style.display = "block";
      decEl.innerHTML = `<div class="scenline">${kind === "ht" ? "\ud83d\udde3 HALF-TIME TEAM TALK" : "\ud83d\udccb TACTICAL WINDOW \u2014 " + match.state.min + "'"} \u00b7 ${match.state.gH}-${match.state.gA}</div>
        <p class="sub" style="margin:4px 0">Mentality (honest str mods):</p>
        <div class="optrow">${Object.entries(ML_MENT).map(([id, m]) =>
          `<div class="opt ${ment === id ? "sel" : ""}" data-wment="${id}" style="flex:1 1 45%;font-size:.7rem">${m.label}</div>`).join("")}</div>
        <p class="sub" style="margin:6px 0 2px">Subs left: <b>${subsLeft}</b> \u00b7 tap tired \u2192 pick fresh:</p>
        <div id="mlsubui">${tired.map(t => `<div class="opt" data-tired="${t.p.id}" style="font-size:.68rem;margin:2px 0">OFF: ${mlRpos(t.p)} ${t.p.name} \u00b7 fit ${Math.max(0, Math.round(t.cur))}%</div>`).join("")}</div>
        <button class="btn" id="mlresume">RESUME \u25b6</button>`;
      document.querySelectorAll("[data-wment]").forEach(o => o.onclick = () => {
        ment = o.dataset.wment;
        document.querySelectorAll("[data-wment]").forEach(x => x.classList.toggle("sel", x.dataset.wment === ment));
        applyStrengths(match.state.min);
        addTick(match.state.min, "Mentality \u2192 " + ML_MENT[ment].label, "you");
      });
      document.querySelectorAll("[data-tired]").forEach(o => o.onclick = () => {
        if (subsLeft <= 0) { toast("No subs left"); return; }
        const offId = +o.dataset.tired;
        const ui = $("#mlsubui");
        ui.innerHTML = bench.map(b2 => `<div class="opt" data-fresh="${b2.id}" data-off="${offId}" style="font-size:.68rem;margin:2px 0">ON: ${mlRpos(b2)} ${b2.name} \u00b7 OVR ${b2.ovr} \u00b7 fit ${Math.round(b2.fit)}%</div>`).join("") || '<p class="sub">Bench empty.</p>';
        document.querySelectorAll("[data-fresh]").forEach(f => f.onclick = () => {
          const onP = M.squad.find(p => p.id === +f.dataset.fresh);
          const offP = M.squad.find(p => p.id === +f.dataset.off);
          if (!onP || !offP) return;
          if (offP.pos === "GK" && onP.pos !== "GK") { toast("\u26a0\ufe0f You can only replace a goalkeeper with a goalkeeper."); return; }
          M.xi = M.xi.map(id => id === offP.id ? onP.id : id);
          subbedOnIds.push(onP.id); subsLeft--;
          offP._sub = "off"; onP._sub = "on";
          applyStrengths(match.state.min * 0.35); // fresh legs lift effective strength
          addTick(match.state.min, `\ud83d\udd01 SUB: ${onP.name} ON for ${offP.name}`, "you");
          showWindow(kind); // re-render window
        });
      });
      $("#mlresume").onclick = () => { decEl.style.display = "none"; runClock(); };
    }
    let mlMomentActive = false;
    function mlPlayMoment(ev, done) { // compact cinematic port of the BaL moment player (same projection)
      const cv3 = $("#mlpitch");
      if (!cv3 || mlMomentActive) { done(); return; }
      mlMomentActive = true;
      const wasHidden = cv3.style.display === "none";
      cv3.style.display = "block";
      const CW = 800, CH = 480; cv3.width = CW; cv3.height = CH;
      const g = cv3.getContext("2d");
      const attCol = ev.team === 0 ? (Hc.col1 || "#e8c15a") : (Ac.col1 || "#d34f4f");
      const defCol = ev.team === 0 ? (Ac.col1 || "#d34f4f") : (Hc.col1 || "#e8c15a");
      const outcome = ev.type; // "goal" | "save"
      const HORIZON = 74, NEARY = 470, FARY = 96, NEARW = 900, FARW = 420;
      const ease0 = t => 1 - Math.pow(1 - t, 1.35);
      const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      function proj(wx, wy, wz) {
        const d = wx / 100;
        const sy = NEARY + (FARY - NEARY) * ease0(d);
        const w = NEARW + (FARW - NEARW) * ease0(d);
        return { x: CW / 2 + (wy / 100 - 0.5) * w, y: sy - (wz || 0) * (0.55 + (1 - d) * 0.75) * 2.2, s: 0.55 + (1 - d) * 0.75, gy: sy };
      }
      const side = Math.random() < .5 ? -1 : 1;
      const shotW = outcome === "goal" ? { x: 100, y: 50 + side * 9 } : { x: 97, y: 50 + side * 5 };
      const segs = [
        { a: { x: 30, y: 50 + side * 22 }, b: { x: 62, y: 50 - side * 8 }, t0: 4, t1: 30 },
        { a: { x: 62, y: 50 - side * 8 }, b: { x: 80, y: 50 + side * 4 }, t0: 34, t1: 56 },
        { a: { x: 80, y: 50 + side * 4 }, b: shotW, t0: 64, t1: 80 }
      ];
      const IMPACT = 80, TOTAL = outcome === "goal" ? 150 : 116;
      const crowd = []; for (let i = 0; i < 140; i++) crowd.push({ x: Math.random() * CW, y: 8 + Math.random() * (HORIZON - 20), c: Math.random(), ph: Math.random() * 7 });
      const trail = [];
      let f = 0, finished = false, raf = null;
      function finish() {
        if (finished) return; finished = true;
        mlMomentActive = false;
        if (raf) cancelAnimationFrame(raf);
        if (wasHidden) cv3.style.display = "none";
        done();
      }
      const failsafe = setTimeout(finish, TOTAL * 17 + 1500); // freeze-proof: wall-clock failsafe
      function ballW() {
        for (const sg of segs) if (f >= sg.t0 && f <= sg.t1) {
          const t = ease((f - sg.t0) / (sg.t1 - sg.t0));
          return { x: sg.a.x + (sg.b.x - sg.a.x) * t, y: sg.a.y + (sg.b.y - sg.a.y) * t, z: Math.sin(t * Math.PI) * (sg === segs[2] ? 6 : 10) };
        }
        if (f < segs[0].t0) return { x: segs[0].a.x, y: segs[0].a.y, z: 0 };
        for (let i = 1; i < segs.length; i++) if (f < segs[i].t0) return { x: segs[i].a.x, y: segs[i].a.y, z: 0 };
        return { x: shotW.x, y: shotW.y, z: 0 };
      }
      function frame() {
        try {
          f++;
          g.fillStyle = "#101c2a"; g.fillRect(0, 0, CW, HORIZON);
          const goalBounce = outcome === "goal" && f > IMPACT;
          for (const cd of crowd) {
            const b = goalBounce ? Math.abs(Math.sin(f / 4 + cd.ph)) * 3 : Math.sin(f / 15 + cd.ph);
            g.fillStyle = cd.c < .3 ? attCol : cd.c < .45 ? defCol : `hsl(${cd.c * 360},25%,${40 + cd.c * 25}%)`;
            g.fillRect(cd.x, cd.y - b, 2.6, 2.6);
          }
          for (let i = 0; i < 9; i++) {
            const p00 = proj(i / 9 * 100, 0, 0), p01 = proj(i / 9 * 100, 100, 0), p10 = proj((i + 1) / 9 * 100, 0, 0), p11 = proj((i + 1) / 9 * 100, 100, 0);
            g.fillStyle = i % 2 ? "#0e6a30" : "#13883d";
            g.beginPath(); g.moveTo(p00.x, p00.gy); g.lineTo(p01.x, p01.gy); g.lineTo(p11.x, p11.gy); g.lineTo(p10.x, p10.gy); g.closePath(); g.fill();
          }
          g.strokeStyle = "rgba(255,255,255,.7)"; g.lineWidth = 2;
          const line = (x1, y1, x2, y2) => { const a = proj(x1, y1, 0), b = proj(x2, y2, 0); g.beginPath(); g.moveTo(a.x, a.gy); g.lineTo(b.x, b.gy); g.stroke(); };
          line(0, 2, 0, 98); line(0, 2, 100, 2); line(0, 98, 100, 98); line(100, 2, 100, 98);
          line(78, 22, 100, 22); line(78, 78, 100, 78); line(78, 22, 78, 78);
          const gl = proj(100, 38, 0), gr = proj(100, 62, 0), barH = 34;
          g.lineWidth = 4; g.strokeStyle = "#f2f2f2";
          g.beginPath(); g.moveTo(gl.x, gl.gy); g.lineTo(gl.x, gl.gy - barH); g.lineTo(gr.x, gr.gy - barH); g.lineTo(gr.x, gr.gy); g.stroke();
          g.lineWidth = 1; g.strokeStyle = "rgba(255,255,255,.35)";
          const rip = (outcome === "goal" && f > IMPACT) ? f - IMPACT : 0;
          for (let i = 1; i < 7; i++) { const nx = gl.x + (gr.x - gl.x) * i / 7 + (rip ? Math.sin(rip / 2 + i) * 2 : 0); g.beginPath(); g.moveTo(nx, gl.gy - barH + 2); g.lineTo(nx + 4, gl.gy - 2); g.stroke(); }
          const bw = ballW();
          const atk = proj(Math.max(10, bw.x - 8), bw.y + side * 4, 0);
          const kpx = outcome === "save" && f > IMPACT - 8 ? 50 + side * 10 : 50;
          const kp = proj(98, kpx, 0);
          const fig = (p, col, dive) => {
            const sc = p.s, gy = p.gy, bh = 26 * sc;
            g.beginPath(); g.ellipse(p.x, gy + 2, 10 * sc, 3.5 * sc, 0, 0, 7); g.fillStyle = "rgba(0,0,0,.4)"; g.fill();
            g.strokeStyle = "#1a1a1a"; g.lineWidth = 3 * sc; g.lineCap = "round";
            const sw = Math.sin(f / 3.2) * 5 * sc;
            g.beginPath(); g.moveTo(p.x, gy - bh * .38); g.lineTo(p.x - 3 * sc + sw, gy); g.stroke();
            g.beginPath(); g.moveTo(p.x, gy - bh * .38); g.lineTo(p.x + 3 * sc - sw, gy); g.stroke();
            g.fillStyle = col; g.beginPath(); g.roundRect(p.x - 6 * sc, gy - bh, 12 * sc, bh * .62, 4 * sc); g.fill();
            if (dive) { g.strokeStyle = col; g.lineWidth = 3.4 * sc; g.beginPath(); g.moveTo(p.x, gy - bh * .8); g.lineTo(p.x + dive * 16 * sc, gy - bh * 1.05); g.stroke(); }
            g.beginPath(); g.arc(p.x, gy - bh - 1.6 * sc, 5.5 * sc, 0, 7); g.fillStyle = "#c8956c"; g.fill();
          };
          fig(kp, "#e8b820", outcome === "save" && f > IMPACT - 8 ? side : 0);
          fig(atk, attCol, 0);
          const bp = proj(bw.x, bw.y, bw.z);
          for (let i = 0; i < trail.length; i++) { const a2 = (i + 1) / trail.length; g.beginPath(); g.arc(trail[i].x, trail[i].y, (2 + a2 * 3) * bp.s, 0, 7); g.fillStyle = `rgba(255,255,255,${a2 * .3})`; g.fill(); }
          g.beginPath(); g.arc(bp.x, bp.y, 5.5 * bp.s, 0, 7); g.fillStyle = "#fff"; g.fill();
          trail.push({ x: bp.x, y: bp.y }); if (trail.length > 10) trail.shift();
          if (f > IMPACT) {
            g.textAlign = "center"; g.font = "800 46px system-ui";
            g.fillStyle = outcome === "goal" ? "#ffd75e" : "#9fe3ff";
            g.fillText(outcome === "goal" ? "\u26bd GOAL!" : "\ud83e\udd24 SAVE!", CW / 2, 220);
          }
          if (f >= TOTAL) { clearTimeout(failsafe); finish(); return; }
          raf = requestAnimationFrame(frame);
        } catch (e) { clearTimeout(failsafe); finish(); }
      }
      raf = requestAnimationFrame(frame);
    }
    function endM() {
      if (over) return; over = true;
      clearInterval(timer);
      const r = match.result();
      const isKO = !!(fx.cup || (fx.ct && fx.ctStage === "ko"));
      let sol = null;
      if (isKO && r.level) { // #3: level after extra time -> honest shootout, no coin flip
        sol = E.penaltyShootout(Hc, Ac, { seed: E.hashSeed(seed + ":pens") });
        r.pens = true; r.penWinner = sol.winner; r.penScore = [sol.scoredH, sol.scoredA];
        addTick(120, "\ud83e\udd85 Level after extra time \u2014 penalties it is.", "goal");
      }
      addTick(r.et ? 120 : 90, `<b>${r.et ? "END OF EXTRA TIME" : "FULL TIME"}.</b> ${Hc.short} ${r.gH} - ${r.gA} ${Ac.short}${sol ? ` \u00b7 pens ${sol.scoredH}-${sol.scoredA}` : ""}`, "goal");
      if (window.Snd) Snd.fulltime();
      function panel() {
        decEl.style.display = "block";
        decEl.innerHTML = `<div class="scenline">\ud83c\udfc1 ${r.et ? "AFTER EXTRA TIME" : "FULL TIME"} \u00b7 ${Hc.short} ${r.gH} - ${r.gA} ${Ac.short}${sol ? ` (${sol.scoredH}-${sol.scoredA} pens)` : ""}</div>
          ${sol ? `<p class="sub" style="margin:4px 0 8px"><b>${sol.winner === 0 ? Hc.short : Ac.short} win the shootout.</b> Every kick was the engine's own conversion roll.</p>` : ""}
          <button class="btn" id="mlft">CONTINUE \u2794</button>`;
        $("#mlft").onclick = () => mlFinish(fx, r, displayedProbs);
      }
      if (!sol) { panel(); return; }
      decEl.style.display = "block";
      decEl.innerHTML = `<div class="scenline">\ud83e\udd85 PENALTY SHOOTOUT \u00b7 ${Hc.short} vs ${Ac.short}</div>
        <div class="sotrow" id="mlsot"></div><div class="sub" id="mlsotline" style="margin-top:6px">The run-ups begin...</div>`;
      const row = $("#mlsot");
      let i = 0;
      (function kick() {
        if (i >= sol.kicks.length) {
          $("#mlsotline").innerHTML = `<b>${sol.winner === 0 ? Hc.short : Ac.short} win ${Math.max(sol.scoredH, sol.scoredA)}-${Math.min(sol.scoredH, sol.scoredA)}</b>${sol.suddenDeath ? " after sudden death" : ""}.`;
          setTimeout(panel, 1000);
          return;
        }
        const k = sol.kicks[i++];
        const d = document.createElement("span");
        d.className = "sotdot " + (k.scored ? "ok" : "no");
        d.textContent = k.scored ? "\u26bd" : "\u2715";
        d.title = (k.side === 0 ? Hc.short : Ac.short) + " \u00b7 " + k.p + "% conversion";
        row.appendChild(d);
        $("#mlsotline").textContent = `${k.side === 0 ? Hc.short : Ac.short} ${k.scored ? "SCORE" : "MISS"} \u00b7 ${k.p}% conversion \u00b7 ${sol.scoredH}-${sol.scoredA}`;
        setTimeout(kick, 620);
      })();
    }
    function step() {
      const s = match.step();
      clockEl.textContent = s.min + "'";
      scoreEl.textContent = match.state.gH + " - " + match.state.gA;
      momEl.style.width = (meHome ? match.state.momentum : 100 - match.state.momentum) + "%";
      const big = speed < 3 ? s.events.find(ev => ev.type === "goal" || ev.type === "save") : null;
      if (big && !mlMomentActive) { // cinematic replay, then resume — BaL parity
        clearInterval(timer);
        for (const ev of s.events) { describe(ev); mlvEvent(ev); }
        mlPlayMoment(big, () => { if (s.done || match.state.done) endM(); else runClock(); });
        return;
      }
      for (const ev of s.events) { describe(ev); mlvEvent(ev); }
      { // SHOW TIME ability: recompute strengths as our attacking state changes
        const mom = match.state.momentum;
        const usAttacking = meHome ? mom >= 60 : mom <= 40;
        if (usAttacking !== window._mlAtkPrev) { window._mlAtkPrev = usAttacking; applyStrengths(match.state.min, usAttacking); }
      }
      { // attack strip (text mode)
        const el2 = $("#mlatk");
        if (el2) {
          const L = mlvAtk();
          el2.innerHTML = `<span class="atkarrows ${L.danger ? "danger" : ""}" style="${L.dirRight ? "" : "transform:scaleX(-1)"}">${L.attacking ? "\u25b6\u25b6\u25b6" : "\u25c6"}</span> ${L.T} \u00b7 ${L.st}`;
          el2.className = "atkstrip" + (L.danger ? " danger" : L.attacking ? " on" : "");
        }
      }
      if (s.min === 45 && !windowsShown[45] && speed < 3) { windowsShown[45] = true; addTick(45, "Half-time.", ""); showWindow("ht"); return; }
      if (s.min === 65 && !windowsShown[65] && speed < 3) { windowsShown[65] = true; showWindow("win"); return; }
      if (s.done || match.state.done) endM();
    }
    function runClock() {
      clearInterval(timer);
      timer = setInterval(step, speed === 0.5 ? 560 : speed === 1 ? 260 : speed === 2 ? 100 : 15);
    }
    function mlPause() { // #1: manual pause -> the existing tactical window (clock really stops)
      if (over || match.state.done) return;
      clearInterval(timer); timer = null;
      addTick(match.state.min, "\u23f8 Paused \u2014 clock stopped, tactical window open.", "");
      showWindow("win");
    }
    const mlp = $("#mlpaus"); if (mlp) mlp.onclick = () => mlPause();
    document.querySelectorAll("[data-mlspeed]").forEach(b => b.onclick = () => {
      speed = +b.dataset.mlspeed;
      document.querySelectorAll("[data-mlspeed]").forEach(x => x.classList.toggle("on", +x.dataset.mlspeed === speed));
      if (timer) runClock();
    });
    try { if (window.Snd && typeof Snd.kickoff === "function") Snd.kickoff(); } catch (e) { console.warn("Audio kickoff failed:", e); }
    addTick(0, `Kick off! ${M.formation} \u00b7 ${ML_MENT[ment].label}. Odds were ${displayedProbs.home}/${displayedProbs.draw}/${displayedProbs.away}.`, "");
    runClock();
  }, 0);
  return `<div class="screen">${mlTopbar()}
    <div class="panel">
      <div class="scoreline"><span>${Hc.short}</span><b id="mlscore">0 - 0</b><span>${Ac.short}</span></div>
      <div class="center"><span class="badge" id="mlclock">0'</span></div>
      <div class="mombar"><div class="momfill" id="mlmom" style="width:50%"></div></div>
      <div class="momlabels"><span>us</span><span>momentum</span><span>them</span></div>
      <div class="viewrow">
        <button class="btn secondary" data-mlview="ticker">\ud83d\udcfb Commentary</button>
        <button class="btn secondary" data-mlview="live2d">\ud83c\udfae 2D Live</button>
      </div>
      <canvas id="mlpitch" width="800" height="520" style="display:none;width:100%;border-radius:10px;margin:6px 0"></canvas>
      <div id="mldec" class="decisionbox" style="display:none"></div>
      <div class="atkstrip" id="mlatk"></div>
      <div class="ticker" id="mlticker" style="height:240px"></div>
      <div class="speedrow hudbar">
        <button class="btn secondary" data-mlspeed="0.5">\ud83d\udc22 \u00bdx</button>
        <button class="btn secondary on" data-mlspeed="1">\u25b6 1x</button>
        <button class="btn secondary" data-mlspeed="2">\u23e9 2x</button>
        <button class="btn secondary" data-mlspeed="3">\u23ed SKIP</button>
        <button class="btn secondary" id="mlpaus">\u23f8 PAUSE</button>
      </div>
    </div>
  </div>`;
}

function mlFinish(fx, r, probs) {
  M.mdLock = null; // committed
  const mKey0 = (fx.ct ? "ct" + (fx.ctMD != null ? fx.ctMD : M.ct.koRound) : fx.cup ? "cup" + M.cup.round : "md" + M.matchday);
  const meHome = fx.ct ? fx.ctHome : fx.home === M.clubIdx;
  const oppNm = fx.ct ? fx.oppClub.name : M.world.clubs[meHome ? fx.away : fx.home].name;
  M.scouted = M.scouted || []; if (!M.scouted.includes(oppNm)) M.scouted.push(oppNm);
  const myG = meHome ? r.gH : r.gA, opG = meHome ? r.gA : r.gH;
  let res = myG > opG ? "W" : myG === opG ? "D" : "L";
  let pensTb = false;
  if ((fx.cup || (fx.ct && fx.ctStage === "ko")) && myG === opG) { // #3: knockout ties are decided by penalties, never a coin flip
    let iWin;
    if (r.penWinner != null) {
      iWin = (r.penWinner === 0) === meHome; // same kick list the player watched
    } else {
      const oppC = fx.ct ? fx.oppClub : M.world.clubs[meHome ? fx.away : fx.home];
      const so = E.penaltyShootout({ str: mlClub().str }, { str: oppC.str },
        { seed: E.hashSeed(M.seed + ":pens:" + (fx.cup ? "cup" + M.cup.round : "ctko" + M.ct.koRound)) });
      iWin = so.winner === 0;
      r.penScore = [so.scoredH, so.scoredA];
    }
    res = iWin ? "W" : "L";
    pensTb = true;
  }
  if (M.galaxy && !fx.cup && !fx.ct) { // other 5 leagues play their matchday too
    // tier 0: I AM that league's matchday -> skip it. tier 1: my national league carries on without me.
    try { E.galaxySimMD(M.galaxy, M.tier === 0 ? M.leagueIdx : -1, M.matchday, M.seed, M.season); } catch (e) {}
  }
  mlDriftForm(); // form moves every matchday
  if (res === "W" && Math.abs(myG - opG) >= 3) { M.lc = (M.lc || 0) + 1; mlNews("\ud83e\ude99 Statement win! +1 LC."); }
  if (fx.cup && res === "W") { M.lc = (M.lc || 0) + 2; }
  // finances
  const wages = M.squad.reduce((s, p) => s + p.wage, 0) / 1000; // M per MD
  let prize = res === "W" ? 0.6 : res === "D" ? 0.3 : 0.1; // net profit AFTER gate receipts cover the wage bill
  if (fx.ct) { // ---- Champions Trophy result routing ----
    prize += res === "W" ? 0.8 : res === "D" ? 0.4 : 0.2; // continental gates pay more
    if (fx.ctStage === "group") {
      const gi = M.ct.myG;
      const key = gi + ":" + fx.ctMD + ":" + fx.ctX + "v" + fx.ctY; // canonical — dedupes vs ctSimGroups
      M.ct.gRes.push({ key, g: gi, h: fx.ctX, a: fx.ctY, gH: r.gH, gA: r.gA });
      M.ct.gPlayed++;
      // sim the other match of my group + all other groups for this CT matchday
      E.ctSimGroups(M.ct, M.galaxy, M.seed + ":s" + M.season, M.ct.gPlayed, true);
      if (M.ct.gPlayed >= 6) {
        E.ctAdvanceToKO(M.ct, M.galaxy, M.seed + ":s" + M.season);
        mlNews(M.ct.alive ? "\ud83c\udf0d GROUP STAGE COMPLETE \u2014 you're in the QUARTER-FINALS! (+3 LC)" : "\ud83c\udf0d Group stage over \u2014 eliminated. The Trophy moves on without us.");
        if (M.ct.alive) M.lc = (M.lc || 0) + 3;
        else { // sim the rest of the tournament to a champion
          while (M.ct.ko.length > 1 && M.ct.koRound <= 2) {
            const rr = E.ctSimKORound(M.ct, M.galaxy, M.seed + ":s" + M.season, false, null);
            M.ct.ko = rr.next; M.ct.koRound++;
          }
          M.ct.done = true; M.ct.champion = M.ct.ko[0] || null;
          if (M.ct.champion) mlNews("\ud83c\udf0d " + E.ctClub(M.galaxy, M.ct.champion).name + " win the Champions Trophy.");
        }
      }
    } else { // KO
      const meE = mlCtMyEntry();
      const win = res === "W"; // #3: the tie-break already happened above (honest shootout)
      const pre = fx.koPre;
      const next = pre.next.map(x => x === null ? (win ? meE : fx.opp) : x);
      if (win) {
        M.lc = (M.lc || 0) + [3, 5, 15][M.ct.koRound];
        prize += [1.5, 2.5, 6][M.ct.koRound];
        mlNews("\ud83c\udf0d " + E.CT_ROUNDS[M.ct.koRound] + " WON" + (pensTb ? " on penalties (" + (r.penScore ? r.penScore.join("-") : "shootout") + ")" : "") + "! +" + [3, 5, 15][M.ct.koRound] + " LC");
        if (M.ct.koRound >= 2) {
          M.ct.done = true; M.ct.champion = meE;
          mlNews("\ud83c\udf0d\ud83c\udfc6 CHAMPIONS TROPHY WINNERS! " + (M.clubName || mlClub().name) + " rule the continent!");
          M.ctWins = (M.ctWins || 0) + 1;
        }
      } else {
        M.ct.alive = false;
        mlNews("\ud83c\udf0d Knocked out of the Champions Trophy at the " + E.CT_ROUNDS[M.ct.koRound] + ".");
        // sim the rest of the tournament so the world names a champion
        M.ct.ko = next; M.ct.koRound++;
        while (M.ct.ko.length > 1 && M.ct.koRound <= 2) {
          const rr = E.ctSimKORound(M.ct, M.galaxy, M.seed + ":s" + M.season, false, null);
          M.ct.ko = rr.next; M.ct.koRound++;
        }
        M.ct.done = true; M.ct.champion = M.ct.ko[0];
        if (M.ct.champion) mlNews("\ud83c\udf0d " + E.ctClub(M.galaxy, M.ct.champion).name + " win the Champions Trophy.");
      }
      if (!M.ct.done && win) {
        M.ct.ko = next; M.ct.koRound++;
      }
    }
    M.budget = Math.round((M.budget + prize) * 10) / 10;
    // CT fitness cost mirrors league matches
    for (const p of M.squad) {
      if (M.xi.includes(p.id)) p.fit = Math.max(0, p.fit - 25);
      else p.fit = Math.min(100, p.fit + 30);
      delete p._sub;
    }
    mlNews("\ud83c\udf0d CT " + (res === "W" ? "WIN" : res === "D" ? "DRAW" : "LOSS") + " " + myG + "-" + opG + (pensTb ? " (pens " + (r.penScore ? r.penScore.join("-") : "shootout") + ")" : "") + " vs " + fx.oppClub.short + ". Net +" + fmtM(prize) + ".");
    mlSave();
    render(() => `<div class="screen">${mlTopbar()}
      <div class="panel center">
        <h1>${res === "W" ? "\ud83c\udf0d\ud83c\udf89 VICTORY" : res === "D" ? "\ud83e\udd1d DRAW" : "\ud83d\ude24 DEFEAT"}</h1>
        <h2>${meHome ? mlClub().short : fx.oppClub.short} ${r.gH} - ${r.gA} ${meHome ? fx.oppClub.short : mlClub().short}</h2>
        ${pensTb ? `<p class="sub"><b>Decided on penalties ${r.penScore ? r.penScore.join("-") : ""}</b> \u2014 every kick was the engine's own conversion roll.</p>` : ""}
        <p class="sub">\ud83c\udf0d Champions Trophy \u00b7 ${fx.ctStage === "group" ? "Group stage" : "Knockout"}</p>
        <div class="kv"><span>Continental gate profit</span><b style="color:var(--green)">+${fmtM(prize)}</b></div>
        <div class="kv"><span>Budget</span><b style="color:var(--gold)">${fmtM(M.budget)}</b></div>
        <p class="sub">Pre-match odds ${probs.home}%/${probs.draw}%/${probs.away}% \u2014 honest engine, upsets included.</p>
        <button class="btn" onclick="render(mlHome)">CONTINUE \u2794</button>
      </div>
    </div>`);
    return;
  }
  if (fx.cup) {
    if (res === "W") { // #3: decided above by the honest shootout when level
      prize += ML_CUP_PRIZE[M.cup.round];
      mlNews("\ud83c\udfc6 " + ML_CUP_ROUNDS[M.cup.round] + " WON" + (pensTb ? " ON PENALTIES" : "") + "! " + (M.cup.round === 3 ? "CUP CHAMPIONS!" : "Through to the " + ML_CUP_ROUNDS[M.cup.round + 1] + "."));
      M.cup.round++;
      if (M.cup.round >= 4) M.cup.done = true;
    } else {
      M.cup.alive = false;
      mlNews("Cup exit at the " + ML_CUP_ROUNDS[M.cup.round] + ".");
    }
  } else {
    M.results.push({ home: fx.home, away: fx.away, gH: r.gH, gA: r.gA });
    // sim rest of matchday
    for (const [h, a2] of (M.world.fixtures[M.matchday] || [])) {
      if (h === M.clubIdx || a2 === M.clubIdx) continue;
      const sim = E.simulateMatch(M.world.clubs[h], M.world.clubs[a2], { seed: E.hashSeed(M.seed + M.season + "md" + M.matchday + h + a2), fast: true });
      M.results.push({ home: h, away: a2, gH: sim.gH, gA: sim.gA });
    }
    M.matchday++;
  }
  // ---- #17 MOTM + real per-player attribution (the goals came from the engine; we only name them) ----
  mlEnsurePlayerStats();
  const myGoalsNow = meHome ? r.gH : r.gA;
  const xiPlayers = mlXIPlayers();
  const att = E.attributeGoals(xiPlayers, myGoalsNow, M.seed + ":attr:" + M.season + ":" + M.matchday + ":" + mKey0);
  const tally = {};
  for (const p of xiPlayers) { p.apps = (p.apps || 0) + 1; tally[p.id] = { goals: 0, assists: 0 }; }
  for (const a of att) {
    if (tally[a.scorer]) { tally[a.scorer].goals++; (M.squad.find(p => p.id === a.scorer) || {}).goals = ((M.squad.find(p => p.id === a.scorer) || {}).goals || 0) + 1; }
    if (a.assist && tally[a.assist]) { tally[a.assist].assists++; const q = M.squad.find(p => p.id === a.assist); if (q) q.assists = (q.assists || 0) + 1; }
  }
  let motm = null;
  if (xiPlayers.length) {
    const cands = xiPlayers.map(p => {
      const t2 = tally[p.id] || { goals: 0, assists: 0 };
      return { id: p.id, name: p.name, pos: p.pos, mins: p._sub === "on" ? 30 : 90,
               rating: 6 + t2.goals * 0.9 + t2.assists * 0.6,
               score: E.motmScore({ goals: t2.goals, assists: t2.assists, minutes: p._sub === "on" ? 30 : 90 }, { result: res }) };
    });
    const best = E.pickMOTM(cands);
    if (best && best.score >= E.motmThreshold()) {
      const winner = M.squad.find(p => p.id === best.id);
      if (winner) winner.motm = (winner.motm || 0) + 1;
      motm = { season: M.season, md: M.matchday, name: best.name, score: best.score, goals: (tally[best.id] || {}).goals || 0 };
      M.motmHistory.push(motm);
      if (M.motmHistory.length > 40) M.motmHistory.shift();
      mlNews("\ud83c\udf1f MOTM: " + best.name + " (" + best.score.toFixed(2) + " contribution) \u00b7 " + (tally[best.id] || {}).goals + " goal(s).");
    }
  }
  let evGp = 0, evWon = [];
  if (!fx.cup) for (const ev2 of mlCurrentEvents()) {
    if (ev2.chk(myG, opG)) { evGp += ev2.gp; evWon.push(ev2.label); }
  }
  if (evWon.length) mlNews("\ud83c\udfaf EVENT" + (evWon.length > 1 ? "S" : "") + " COMPLETE: " + evWon.join(" + ") + " (+" + fmtM(evGp) + ")");
  // trainer drops (eFootball loop): win = trainer chance, events = guaranteed silver, cup progress = gold
  mlEnsureTrainers();
  let drops = [];
  const drng = E.mulberry32(E.hashSeed(M.seed + ":drop:" + M.season + ":" + M.matchday + ":" + myG + opG));
  if (res === "W") { const t = drng() < 0.30 ? "silver" : "bronze"; M.trainers[t]++; drops.push(ML_TRAINERS[t].label); }
  if (evWon.length) { M.trainers.silver++; drops.push(ML_TRAINERS.silver.label); }
  if (fx.cup && (res === "W")) { M.trainers.gold++; drops.push(ML_TRAINERS.gold.label); }
  if (drops.length) mlNews("\ud83c\udf81 TRAINERS EARNED: " + drops.join(" + "));
  M.budget = Math.round((M.budget + prize + evGp) * 10) / 10; // wages covered by matchday gate receipts
  // fitness bookkeeping
  for (const p of M.squad) {
    if (p._sub === "off") p.fit = Math.max(0, p.fit - 15);
    else if (p._sub === "on") p.fit = Math.max(0, p.fit - 10);
    else if (M.xi.includes(p.id)) p.fit = Math.max(0, p.fit - 25);
    else p.fit = Math.min(100, p.fit + 30);
    delete p._sub;
  }
  mlNews((fx.cup ? "\ud83c\udfc6 " : "") + `${res === "W" ? "WIN" : res === "D" ? "DRAW" : "LOSS"} ${myG}-${opG} vs ${M.world.clubs[meHome ? fx.away : fx.home].short}. Net +${fmtM(prize)} (gate receipts covered ${fmtM(wages)} wages).`);
  mlSave();
  render(() => `<div class="screen">${mlTopbar()}
    <div class="panel center">
      <h1>${res === "W" ? "\ud83c\udf89 VICTORY" : res === "D" ? "\ud83e\udd1d DRAW" : "\ud83d\ude24 DEFEAT"}</h1>
      <h2>${M.world.clubs[fx.home].short} ${r.gH} - ${r.gA} ${M.world.clubs[fx.away].short}</h2>
      ${pensTb ? `<p class="sub"><b>${fx.cup ? "Cup tie" : "Match"} decided on penalties ${r.penScore ? r.penScore.join("-") : ""}</b> \u2014 honest shootout, no coin flip.</p>` : ""}
      <div class="kv"><span>Matchday profit</span><b style="color:var(--green)">+${fmtM(prize)}</b></div>
      ${evGp ? `<div class="kv"><span>\ud83c\udfaf Events</span><b style="color:var(--green)">+${fmtM(evGp)}</b></div>` : ""}
      ${drops.length ? `<div class="kv"><span>\ud83c\udf81 Trainers</span><b style="color:var(--gold)">${drops.join(" + ")}</b></div>` : ""}
      ${(M.motmHistory && M.motmHistory.length && M.motmHistory[M.motmHistory.length - 1].md === M.matchday - 1) ? `<div class="kv"><span>\ud83c\udf1f Man of the match</span><b>${M.motmHistory[M.motmHistory.length - 1].name} <span class="sub">(${M.motmHistory[M.motmHistory.length - 1].score.toFixed(2)})</span></b></div>` : ""}
      <div class="kv"><span>Wages (${fmtM(wages)})</span><b style="color:var(--green)">covered by gate receipts \u2713</b></div>
      <div class="kv"><span>Budget</span><b style="color:var(--gold)">${fmtM(M.budget)}</b></div>
      <p class="sub">Pre-match odds ${probs.home}%/${probs.draw}%/${probs.away}% \u2014 honest engine, upsets included.</p>
      <button class="btn" onclick="render(mlHome)">CONTINUE \u2794</button>
    </div>
  </div>`);
}

// ---------- event match screens ----------
function mlEventPreview() {
  if (M.matchday >= 18) { toast("Season over \u2014 events return next season"); render(mlHome); return ""; }
  const mgr = mlGenManager(M.matchday);
  const done = !mlEventAvailable();
  const duel = mlStyleDuel(M.style || "possession", mgr.style);
  const me = { name: M.clubName || mlClub().name, short: M.clubShort || mlClub().short, str: Math.round((mlTeamStr(0) + ML_MENT[M.mentality].you + duel.you) * 10) / 10, col1: "#e8c15a", col2: "#131a14" };
  const oppc = Object.assign({}, mgr.club, { str: Math.round((mgr.club.str + duel.opp) * 10) / 10 });
  const probs = E.winProbs(me, oppc, 600);
  setTimeout(() => {
    const b = $("#evgo"); if (b) b.onclick = () => render(() => mlEventMatch(mgr, me, oppc, probs));
    const h = $("#evhome"); if (h) h.onclick = () => render(mlHome);
  }, 0);
  return `<div class="screen">${mlTopbar()}
    <div class="panel">
      <h2>\ud83c\udfae EVENT MATCH \u00b7 MD ${M.matchday + 1}</h2>
      <p class="sub">A rival manager account challenges you. <b>AI-controlled</b> \u2014 no servers, no tricks, same honest engine.</p>
      <div class="vsrow">
        <div class="vsteam"><div class="tname">${me.name}</div><div class="sub">str ${me.str}</div></div>
        <div class="vsx">VS</div>
        <div class="vsteam"><div class="tname">${oppc.name}</div><div class="sub">str ${oppc.str}</div></div>
      </div>
      <p class="sub center" style="margin-bottom:4px">Win probability (true engine odds \u2014 never rigged)</p>
      <div class="probbar"><div class="pb-h" style="flex:${probs.home}">${probs.home}%</div>
        <div class="pb-d" style="flex:${probs.draw}">${probs.draw}%</div>
        <div class="pb-a" style="flex:${probs.away}">${probs.away}%</div></div>
      <div class="kv"><span>Their manager</span><b>\ud83c\udfae ${mgr.tag} <span class="sub">(AI)</span></b></div>
      <div class="kv"><span>Their style</span><b>${ML_STYLES[mgr.style].label}</b></div>
      <div class="kv"><span>Style duel</span><b>${duel.txt}</b></div>
      <div class="kv"><span>Rewards</span><b>W +0.6M \u00b7 D +0.25M \u00b7 L +0.1M GP</b></div>
      <div class="kv"><span>Bonus</span><b>35% \ud83e\udd48 Silver Trainer on a win</b></div>
      <div class="kv"><span>Cost</span><b style="color:var(--red)">XI \u221215 fitness \u00b7 once per matchday</b></div>
      ${done ? `<p class="sub center" style="margin-top:8px">\u2713 Played this matchday \u2014 next event unlocks after your league game.</p>
        <button class="btn" id="evhome">BACK</button>`
      : `<button class="btn" id="evgo">PLAY EVENT \u26bd</button>
        <button class="btn secondary" id="evhome">BACK</button>`}
    </div>
  ${mlNav()}</div>`;
}
function mlEventMatch(mgr, me, oppc, probs) {
  const seed = E.hashSeed(M.seed + ":evm:" + M.season + ":" + M.matchday);
  const match = E.createMatch(me, oppc, { seed });
  let timer = null, speed = 1, over = false;
  setTimeout(() => {
    const clockEl = $("#evclock"), scoreEl = $("#evscore"), tickEl = $("#evticker"), momEl = $("#evmom");
    function addTick(min, txt, cls) {
      const d = document.createElement("div");
      d.className = "tick " + (cls || "");
      d.innerHTML = `<b>${min}'</b> ${txt}`;
      tickEl.prepend(d);
    }
    function describe(ev) {
      const side = ev.team === 0 ? me.short : oppc.short;
      if (ev.type === "goal") { if (window.Snd) Snd.goalUs(); addTick(ev.min, `<b>\u26bd GOAL ${side}!</b> ${ev.score[0]}-${ev.score[1]}`, "goal"); }
      else if (ev.type === "save") addTick(ev.min, `${side} denied by the keeper!`, "");
      else if (ev.type === "miss") addTick(ev.min, `${side} off target.`, "");
      else if (ev.type === "setpiece") addTick(ev.min, `${side} win ${ev.pen ? "a PENALTY!" : "a free kick in range..."}`, "goal");
    }
    function endM() {
      if (over) return; over = true;
      clearInterval(timer);
      const r = match.result();
      addTick(90, `<b>FULL TIME.</b> ${me.short} ${r.gH} - ${r.gA} ${oppc.short}`, "goal");
      if (window.Snd) Snd.fulltime();
      setTimeout(() => mlEventFinish(mgr, r, probs), 700);
    }
    function step() {
      const s2 = match.step();
      clockEl.textContent = s2.min + "'";
      scoreEl.textContent = match.state.gH + " - " + match.state.gA;
      momEl.style.width = match.state.momentum + "%";
      for (const ev of s2.events) describe(ev);
      if (s2.min === 45) addTick(45, "Half-time.", "");
      if (s2.done || match.state.done) endM();
    }
    document.querySelectorAll("[data-evspeed]").forEach(bn => bn.onclick = () => {
      speed = +bn.dataset.evspeed;
      document.querySelectorAll("[data-evspeed]").forEach(x => x.classList.toggle("on", +x.dataset.evspeed === speed));
      clearInterval(timer);
      timer = setInterval(step, speed === 0.5 ? 520 : speed === 1 ? 240 : speed === 2 ? 90 : 15);
    });
    if (window.Snd) Snd.kickoff();
    addTick(0, `Event match vs \ud83c\udfae ${mgr.tag} (AI). Odds ${probs.home}/${probs.draw}/${probs.away}.`, "");
    timer = setInterval(step, 240);
  }, 0);
  return `<div class="screen">${mlTopbar()}
    <div class="panel">
      <div class="scoreline"><span>${me.short}</span><b id="evscore">0 - 0</b><span>${oppc.short}</span></div>
      <div class="center"><span class="badge" id="evclock">0'</span></div>
      <div class="mombar"><div class="momfill" id="evmom" style="width:50%"></div></div>
      <div class="momlabels"><span>${me.short}</span><span>momentum</span><span>${oppc.short}</span></div>
      <div class="ticker" id="evticker" style="height:260px"></div>
      <div class="speedrow">
        <button class="btn secondary" data-evspeed="0.5">\ud83d\udc22 \u00bdx</button>
        <button class="btn secondary on" data-evspeed="1">\u25b6 1x</button>
        <button class="btn secondary" data-evspeed="2">\u23e9 2x</button>
        <button class="btn secondary" data-evspeed="3">\u23ed SKIP</button>
      </div>
    </div>
  </div>`;
}
function mlEventFinish(mgr, r, probs) {
  mlEnsureTrainers();
  const res = r.gH > r.gA ? "W" : r.gH === r.gA ? "D" : "L";
  const prize = res === "W" ? 0.6 : res === "D" ? 0.25 : 0.1;
  let drop = null;
  const drng = E.mulberry32(E.hashSeed(M.seed + ":evdrop:" + M.season + ":" + M.matchday));
  if (res === "W" && drng() < 0.35) { M.trainers.silver++; drop = ML_TRAINERS.silver.label; }
  for (const p of M.squad) if (M.xi.includes(p.id)) p.fit = Math.max(0, p.fit - 15);
  M.evDone = mlEvKey();
  M.budget = Math.round((M.budget + prize) * 10) / 10;
  mlNews(`\ud83c\udfae EVENT ${res === "W" ? "WIN" : res === "D" ? "DRAW" : "LOSS"} ${r.gH}-${r.gA} vs ${mgr.tag}. +${fmtM(prize)}${drop ? " + " + drop : ""}.`);
  mlSave();
  render(() => `<div class="screen">${mlTopbar()}
    <div class="panel center">
      <h1>${res === "W" ? "\ud83c\udf89 EVENT WON" : res === "D" ? "\ud83e\udd1d EVENT DRAW" : "\ud83d\ude24 EVENT LOST"}</h1>
      <h2>${r.gH} - ${r.gA} vs \ud83c\udfae ${mgr.tag}</h2>
      <div class="kv"><span>Prize</span><b style="color:var(--green)">+${fmtM(prize)}</b></div>
      ${drop ? `<div class="kv"><span>\ud83c\udf81 Trainer</span><b style="color:var(--gold)">${drop}</b></div>` : ""}
      <div class="kv"><span>XI fitness</span><b style="color:var(--red)">\u221215 each</b></div>
      <div class="kv"><span>Budget</span><b style="color:var(--gold)">${fmtM(M.budget)}</b></div>
      <p class="sub">Pre-match odds ${probs.home}%/${probs.draw}%/${probs.away}% \u2014 honest engine.</p>
      <button class="btn" onclick="render(mlHome)">CONTINUE \u2794</button>
    </div>
  </div>`);
}

// ---------- season end ----------
// ---------- v1.6 #10: END-OF-SEASON PIPELINE (awards \u00b7 settle \u00b7 rollover) ----------
// The Season-2 bug had one root cause: the game re-generated a *brand new* national league
// every summer (E.makeWorld) and then bolted the galaxy's fixture list onto it, so from S2 on
// your table, your opponents and the galaxy tables described different clubs, and a promoted
// club kept writing Super-League results into a national league. Fix: my tier-0 world IS the
// galaxy league (one array, one table), and a promoted club's old slot reverts to a plain club.
function mlNationalIdx() { return E.leagueForRegion(M.region); }
function mlAttachNational(preferIdx) { // tier 0: bind the world to the galaxy league itself
  const L = M.galaxy.leagues[M.leagueIdx];
  let idx = (preferIdx != null && L.clubs[preferIdx]) ? preferIdx : -1; // keep my slot: CT entry lists depend on it
  if (idx < 0) { let weakest = 1e9; L.clubs.forEach((c, i) => { if (c.str < weakest) { weakest = c.str; idx = i; } }); }
  Object.assign(L.clubs[idx], { name: M.clubName || "Your FC", short: M.clubShort || "YOU",
    col1: "#e8c15a", col2: "#131a14", founded: true });
  M.clubIdx = idx;
  M.world = { tier: 0, clubs: L.clubs, fixtures: L.fixtures, h2h: M.world ? (M.world.h2h || {}) : {} };
}
function mlVacateNational() { // promoted: my old national slot becomes an ordinary club again
  if (!M.galaxy) return;
  const L = M.galaxy.leagues[M.leagueIdx]; if (!L) return;
  const c = L.clubs[M.clubIdx]; if (!c) return;
  M.nationalIdx = M.clubIdx; // remember the slot so relegation can walk straight back in
  const rng = E.mulberry32(E.hashSeed(M.seed + ":vacate:" + M.season + ":" + M.clubIdx));
  const repl = E.genStarterClubs(M.region || "britain", rng)[0];
  Object.assign(c, { name: repl.name, short: repl.short, col1: repl.col1, col2: repl.col2 });
  delete c.founded;
  c.str = Math.max(58, Math.min(88, c.str + Math.round((rng() - 0.45) * 4)));
}
function mlSuperFixtures() { // tier 1 always owns a full fixture list (never a stale national one)
  if (M.tier !== 1) return;
  if (!M.world.fixtures || M.world.fixtures.length !== 18) {
    const rng = E.mulberry32(E.hashSeed(M.seed + ":t1fix:s" + (M.season + 1)));
    M.world.fixtures = E.makeFixtures(M.world.clubs.map((_, i) => i), rng);
  }
}
function mlSeasonAwards(table, pos, strRank, prize, lcAward, clubIdx) { // honest awards: only real stored data
  if (clubIdx == null) clubIdx = M.clubIdx;
  let w = 0, d = 0, l = 0, gf = 0, ga = 0, cs = 0, biggest = 0;
  for (const r of (M.results || [])) {
    if (r.home !== clubIdx && r.away !== clubIdx) continue; // matchday logs carry every fixture - only mine count
    const meHome = r.home === clubIdx;
    const my = meHome ? r.gH : r.gA, op = meHome ? r.gA : r.gH;
    gf += my; ga += op;
    if (my > op) w++; else if (my === op) d++; else l++;
    if (op === 0) cs++;
    if (my - op > biggest) biggest = my - op;
  }
  const row = (table || []).find(t => t.i === clubIdx) || { Pts: w * 3 + d, GF: gf, GA: ga, GD: gf - ga };
  if (row.GF != null) { gf = row.GF; ga = row.GA; } // official table totals when available
  const improved = (M.squad || []).map(p => ({ p, up: p.ovr - (p.ovrStart != null ? p.ovrStart : p.ovr) }))
    .sort((a, b) => b.up - a.up)[0];
  // ---- #17: the gala. Every award below reads tracked data only (per-player goals/assists/MOTM/apps,
  //      or the official league table). Nothing is invented; league-wide player stats are not tracked
  //      by the engine, so club-level awards are labelled as such instead of faked.
  mlEnsurePlayerStats();
  const squad = (M.squad || []);
  const bySeason = squad.slice().sort((a, b) => (E.seasonScore(b) - E.seasonScore(a)) || (b.ovr - a.ovr) || a.name.localeCompare(b.name));
  const mvp = bySeason[0] || null;
  const boot = squad.slice().sort((a, b) => (b.goals || 0) - (a.goals || 0) || (b.assists || 0) - (a.assists || 0) || a.name.localeCompare(b.name))[0] || null;
  const need = { GK: 1, DF: 4, MF: 4, FW: 2 };
  const grp = (p) => p.pos === "GK" ? "GK" : ["CB", "LB", "RB"].includes(p.pos) ? "DF" : ["DMF", "CMF", "AMF"].includes(p.pos) ? "MF" : "FW";
  const bestXI = [];
  for (const g of ["GK", "DF", "MF", "FW"]) {
    for (const p of bySeason.filter(x => grp(x) === g).slice(0, need[g])) bestXI.push(p);
  }
  for (const p of bySeason) { if (bestXI.length >= 11) break; if (!bestXI.includes(p)) bestXI.push(p); }
  const topPoints = (table || []).slice().sort((a, b) => (b.Pts - a.Pts) || ((b.GF - b.GA) - (a.GF - a.GA)))[0];
  const manager = topPoints && topPoints.i === clubIdx ? (M.clubName || mlClub().name) : (topPoints ? (M.world.clubs[topPoints.i] || {}).name : null);
  const motmCount = M.motmHistory.filter(x => x.season === M.season).length;
  const gala = {
    mvp: mvp ? { name: mvp.name, pos: mvp.pos, ovr: mvp.ovr, goals: mvp.goals || 0, assists: mvp.assists || 0, motm: mvp.motm || 0, score: E.seasonScore(mvp) } : null,
    boot: boot && (boot.goals || 0) > 0 ? { name: boot.name, goals: boot.goals || 0, assists: boot.assists || 0 } : null,
    bestXI: bestXI.map(p => ({ name: p.name, pos: p.pos, ovr: p.ovr, g: p.goals || 0, a: p.assists || 0 })),
    manager: manager ? { club: manager, points: topPoints.Pts, mine: !!(topPoints && topPoints.i === clubIdx) } : null,
    motm: motmCount,
    topMotm: M.motmHistory.filter(x => x.season === M.season).sort((a, b) => b.score - a.score)[0] || null
  };
  M.honours.push({ season: M.season, pos, mvp: gala.mvp ? gala.mvp.name : null, boot: gala.boot ? gala.boot.name : null, bootGoals: gala.boot ? gala.boot.goals : 0, motm: motmCount });
  if (M.honours.length > 30) M.honours.shift();
  for (const p of squad) { p._seasonEnd = { goals: p.goals || 0, assists: p.assists || 0, motm: p.motm || 0, apps: p.apps || 0 }; } // snapshot for the review panel
  return { season: M.season, pos, strRank, tier: M.tier, pts: row.Pts, w, d, l,
    gf, ga, gd: gf - ga, cs, biggest, target: pos <= strRank ? "met" : "missed",
    prize, lc: lcAward, budget: M.budget,
    improved: (improved && improved.up > 0) ? { name: improved.p.name, up: improved.up, ovr: improved.p.ovr } : null,
    gala,
    retirements: 0, promoted: false, relegated: false, qualified: false };
}

function mlSeasonEnd() {
  if (M.ct && M.ct.alive && !M.ct.done && mlCtFixture()) { toast("\ud83c\udf0d Champions Trophy still in progress \u2014 play your CT tie first!"); render(mlPreview); return; }
  const table = E.computeTable(M.world.clubs, M.results);
  const pos = table.findIndex(t => t.i === M.clubIdx) + 1;
  const strRank = M.world.clubs.map((c, i) => ({ i, s: i === M.clubIdx ? mlTeamStr(0) : c.str }))
    .sort((a, b) => b.s - a.s).findIndex(x => x.i === M.clubIdx) + 1;
  const seasonClubIdx = M.clubIdx; // every award/qualification below reads THIS club, not next season's re-brand
  const prize = [8, 6, 4.5, 3.5, 3, 2.5, 2, 1.5, 1.2, 1][pos - 1] || 1;
  M.budget = Math.round((M.budget + prize) * 10) / 10;
  const lcAward = (pos <= 3 ? 5 : 0) + (pos === 1 ? 5 : 0) + (M.cup.done ? 10 : 0);
  if (lcAward) { M.lc = (M.lc || 0) + lcAward; mlNews("\ud83e\ude99 Season LC awards: +" + lcAward + " LC."); }
  const sacked = pos > strRank + 3;
  const promoted = M.tier === 0 && pos <= 2;
  const relegated = M.tier === 1 && pos >= 8;
  M.career.push({ season: M.season, tier: M.tier, pos, cup: M.cup.done ? "WON" : M.cup.alive ? "-" : "out R" + (M.cup.round + 1) });
  // aging & growth (v1.2 rebalance: peak lasts, decline is gentle, camp protects)
  const camped = M.campPicks || [];
  const retirees = [];
  for (const p of M.squad) {
    p.age++;
    const inCamp = camped.includes(p.id);
    if (p.age <= 21 && p.ovr < p.pot) p.ovr += 2 + (Math.random() < 0.5 ? 1 : 0);       // +2..3
    else if (p.age <= 23 && p.ovr < p.pot) p.ovr += 1 + (Math.random() < 0.5 ? 1 : 0);  // +1..2
    else if (p.age <= 29 && p.ovr < p.pot && Math.random() < 0.5) p.ovr += 1;           // peak
    else if (p.age >= 35) p.ovr -= (p.cardId === "legendary" ? 0 : (inCamp ? 1 : 2));   // legendary never declines
    else if (p.age >= 33) p.ovr -= (p.cardId === "legendary" ? 0 : (inCamp ? 0 : 1));
    else if (p.age === 32 && Math.random() < 0.5) p.ovr -= (p.cardId === "legendary" || inCamp ? 0 : 1);
    if (inCamp && p.age <= 29 && p.ovr < p.pot) p.ovr += 1; // camp = extra growth for the young
    p.ovr = Math.max(40, Math.min(94, p.ovr));
    p.value = mlValue(p.ovr, p.age);
    p.fit = 100; p.form = 0;
    // retirement window 35-45: chance ramps yearly; legendary cards play on until 38+; 45 = boots hung up, no exceptions
    const retFrom = p.cardId === "legendary" ? 38 : 35;
    const retChance = p.age >= 45 ? 1 : p.age >= retFrom ? (p.age - retFrom + 1) * 0.14 : 0;
    if (retChance > 0 && Math.random() < retChance) retirees.push(p);
  }
  for (const p of retirees) { // farewell payout + academy regen steps up (same position)
    M.squad = M.squad.filter(x => x.id !== p.id);
    M.xi = (M.xi || []).filter(id => id !== p.id);
    M.bench = (M.bench || []).filter(id => id !== p.id);
    const payout = Math.max(0.2, Math.round(p.value * 0.25 * 10) / 10);
    M.budget = Math.round((M.budget + payout) * 10) / 10;
    const rng = E.mulberry32(E.hashSeed(M.seed + ":regen:" + M.season + ":" + p.id));
    const kid = mlGenPlayer(rng, M.region, p.pos, 52 + Math.floor(rng() * 10));
    kid.age = 17 + Math.floor(rng() * 3);
    kid.pot = Math.max(kid.pot, Math.min(92, p.ovr - 2 + Math.floor(rng() * 7)));
    M.squad.push(kid);
    mlNews("\ud83d\udc4b " + p.name + " retires at " + p.age + " (" + (p.card ? p.card + ", " : "") + "OVR " + p.ovr + "). Farewell payout +" + fmtM(payout) + ". Academy youth " + kid.name + " (" + kid.age + ", pot " + kid.pot + ") steps up.");
  }
  if (retirees.length) mlAutoXI(); // rebuild a legal XI after departures
  M.campPicks = null; M.campDue = true; // next season prep: pick 3 for camp
  // ONE SAVE FOREVER (eFootball model): no sacking-reset. Bad seasons = board pressure + budget cuts.
  let txt = "Season " + M.season + " done: #" + pos + ". Prize " + fmtM(prize) + ".";
  if (sacked) {
    M.pressure = (M.pressure || 0) + 1;
    M.budget = Math.round(M.budget * 0.85 * 10) / 10;
    txt += " \u26a0\ufe0f Board unhappy (#" + pos + " with the #" + strRank + " squad) \u2014 budget cut 15%. Pressure: " + M.pressure + "/3.";
    if (M.pressure >= 3) txt += " One more bad season and senior players will start leaving.";
  } else if (M.pressure) { M.pressure = 0; txt += " Board satisfied \u2014 pressure reset."; }
  if ((M.pressure || 0) > 3) {
    const leavers = M.squad.filter(p => p.ovr >= 70).slice(0, 2);
    for (const l of leavers) { M.squad = M.squad.filter(x => x.id !== l.id); mlNews("\ud83d\udeaa " + l.name + " walks out \u2014 no faith in the project."); }
  }
  if (pos === 1) { M.trophies = M.trophies || []; M.trophies.push({ s: M.season, t: M.tier === 0 ? "\ud83c\udfc6 League Title" : "\ud83c\udf0d Continental Title" }); }
  if (M.cup.done) { M.trophies = M.trophies || []; M.trophies.push({ s: M.season, t: "\ud83c\udfc6 Cup" }); }
  function reattach(world) {
    // your founded club replaces the weakest slot in any new world — identity persists
    let idx = 0, weakest = 1e9;
    world.clubs.forEach((c, i) => { if (c.str < weakest) { weakest = c.str; idx = i; } });
    Object.assign(world.clubs[idx], { name: M.clubName || mlClub().name, short: M.clubShort || mlClub().short, col1: "#e8c15a", col2: "#131a14", founded: true });
    return idx;
  }
  // ---- promote / relegate / stay: the next world is rebuilt from the galaxy, never a clone ----
  const nextSeed = M.seed + ":s" + (M.season + 1);
  if (promoted) {
    M.tier = 1;
    mlVacateNational();                            // no ghost copy of my club left behind
    M.world = E.makeWorld(1, nextSeed, M.region);  // Continental Super League (own clubs + fixtures)
    M.clubIdx = reattach(M.world);
    mlSuperFixtures();
    txt += " \ud83c\udf89 PROMOTED \u2014 " + (M.clubName || "your club") + " reach the Continental Super League!";
  } else if (relegated) {
    M.tier = 0;
    if (M.galaxy) { mlAttachNational(M.nationalIdx != null ? M.nationalIdx : seasonClubIdx); } else { M.world = E.makeWorld(0, nextSeed, M.region); M.clubIdx = reattach(M.world); }
    txt += " \ud83d\udcc9 Relegated \u2014 back to the national league. The dynasty continues.";
  } else if (M.tier === 0 && M.galaxy) {
    mlAttachNational(seasonClubIdx);               // THE S2 FIX: my league IS the galaxy league, same clubs
  } else {
    M.world = E.makeWorld(M.tier, nextSeed, M.region);
    M.clubIdx = reattach(M.world);
    mlSuperFixtures();
  }
  // ---- galaxy bookkeeping (tier-aware) ----
  if (M.galaxy) {
    if (M.tier === 0) M.galaxy.leagues[M.leagueIdx].results = M.results.slice(); // my results ARE the league's
    const q = E.galaxyRollover(M.galaxy, M.seed, M.season);
    if (M.tier === 0) { // season 2+: my fixtures come from the galaxy the results live in
      M.world.clubs = M.galaxy.leagues[M.leagueIdx].clubs;
      M.world.fixtures = M.galaxy.leagues[M.leagueIdx].fixtures;
    }
    // qualification: national leagues qualify through the galaxy; a Super League club
    // qualifies on its own top-4 finish (same trophy, honest route).
    let qualified = q.cl.some(e2 => e2.league === M.leagueIdx && e2.club === seasonClubIdx);
    if (M.tier === 1) qualified = pos <= 4;
    if (qualified) {
      const entrants = (M.tier === 1) ? q.cl.concat([{ league: M.leagueIdx, club: M.clubIdx }]) : q.cl;
      M.ct = E.ctMake(entrants.slice(0, 16), { league: M.leagueIdx, club: M.clubIdx }, M.seed + ":ct:s" + (M.season + 1));
      M.lc = (M.lc || 0) + 5;
      txt += " \ud83c\udfc6 QUALIFIED for the Champions Trophy! (+5 LC)";
    } else {
      M.ct = null;
      txt += " (Champions Trophy: finish top of the league to qualify.)";
    }
  }
  // ---- season review (awards + settle summary, shown once on the home screen) ----
  const rev = mlSeasonAwards(table, pos, strRank, prize, lcAward, seasonClubIdx);
  rev.retirements = retirees.length;
  rev.promoted = promoted; rev.relegated = relegated; rev.qualified = !!M.ct;
  M.review = rev;
  txt += " Board target " + (rev.target === "met" ? "achieved \u2705" : "missed \u26a0\ufe0f") + " (finished #" + pos + ", squad rank #" + strRank + ").";
  M.season++; M.matchday = 0; M.results = [];
  M.cup = { round: 0, alive: true, done: false };
  for (const p of M.squad) { p.ovrStart = p.ovr; p.apps = 0; p.goals = 0; p.assists = 0; p.motm = 0; } // new season, clean log
  M.motmHistory = M.motmHistory.filter(x => x.season !== M.season - 1); // keep only the current season's MOTM list
  mlAutoXI(); mlNews(txt); mlSave();
  render(mlHome);
}

// ---------- entry ----------
function mlApplyGift(g) {
  if (g.mlgp) M.budget = Math.round((M.budget + g.mlgp) * 10) / 10;
  if (g.mllc) M.lc = (M.lc || 0) + g.mllc;
  if (g.pl) {
    const rng = E.mulberry32(E.hashSeed("gift:" + (g.id || g.pl.name || Math.random())));
    const p = mlGenPlayer(rng, M.region, g.pl.pos || "FW", Math.min(94, g.pl.ovr || 84));
    if (g.pl.name) p.name = g.pl.name;
    p.age = 23 + Math.floor(rng() * 5);
    p.cardId = ML_CARDS[g.pl.card] ? g.pl.card : "showtime";
    p.card = ML_CARDS[p.cardId].label;
    mlGiveSkills(p, rng);
    p.gift = g.id || true;
    p.value = mlValue(p.ovr, p.age) * 1.2;
    M.squad.push(p);
    mlNews("\ud83c\udf81 GIFT PLAYER: " + p.name + " (" + p.card + " " + p.ovr + ") joins the squad \u2014 free!");
  }
  if (g.mlgp || g.mllc) mlNews("\ud83c\udf81 Gift" + (g.title ? " \u00b7 " + g.title : "") + ":" + (g.mlgp ? " +" + g.mlgp + "M GP" : "") + (g.mllc ? " +" + g.mllc + " LC" : "") + ".");
}
window.ML = {
  // #14: true while a match is live (from kickoff lock to the final whistle) so the app can
  // never reload/restore on top of it.
  inMatch() { return !!(M && M.mdLock); },
  enter() {
    mlLoad();
    mlMode(true);
    if (M) { // consume gift queue (events, redeem codes, owner grants)
      try {
        const q = JSON.parse(localStorage.getItem("flMlGifts") || "[]");
        if (q.length) {
          for (const g of q) mlApplyGift(g);
          localStorage.removeItem("flMlGifts"); if (window.flMirror) flMirror("flMlGifts", null);
          mlSave(); toast("\ud83c\udf81 " + q.length + " gift" + (q.length > 1 ? "s" : "") + " delivered \u2014 check News!");
        }
      } catch (e) {}
    }
    if (M && M.sacked) { M.sacked = false; M.pressure = 2; mlSave(); } // migrate old sacked saves: club survives, heavy pressure
    if (M && !M.style) { M.style = "possession"; M.scouted = M.scouted || []; mlSave(); } // migrate: playing styles update
    if (M && M.evDone === undefined) { M.evDone = ""; mlSave(); } // migrate: event matches update
    if (M && !M.galaxy) { // migrate: 6-league world update
      M.galaxy = E.makeGalaxy(M.seed);
      M.leagueIdx = E.leagueForRegion(M.region);
      const L = M.galaxy.leagues[M.leagueIdx];
      // your founded club takes the weakest slot in your new league
      let idx = 0, weakest = 1e9;
      L.clubs.forEach((c, i) => { if (c.str < weakest) { weakest = c.str; idx = i; } });
      Object.assign(L.clubs[idx], { name: M.clubName || (M.world.clubs[M.clubIdx] || {}).name || "Your FC",
        short: M.clubShort || (M.world.clubs[M.clubIdx] || {}).short || "YOU", col1: "#e8c15a", col2: "#131a14", founded: true });
      M.clubIdx = idx;
      M.world = { tier: 0, clubs: L.clubs, fixtures: L.fixtures, h2h: {} };
      M.results = []; M.matchday = Math.min(M.matchday, 17); M.ct = null; M.ctQual = false;
      mlNews("\ud83c\udf0d THE WORLD OPENS UP: your league is now the " + L.name + " \u2014 5 more leagues run alongside, with the \ud83c\udfc6 Champions Trophy for the best.");
      mlSave();
    }
    render(M ? mlHome : mlCreate);
  }
};
// entry is always the main menu (app.js menuScreen); ML.enter() is the only door in.
