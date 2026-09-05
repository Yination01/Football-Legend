/* FOOTBALL LEGEND — app/UI layer. Uses Engine (engine.js). */
const E = window.Engine;
const $ = (s) => document.querySelector(s);
const SAVE_KEY = "footballLegendSave_v1";
// ---- settings ----
function getSet() { try { return JSON.parse(localStorage.getItem("flSettings")) || {}; } catch (e) { return {}; } }
function setSet(k, v) { const o = getSet(); o[k] = v; const j = JSON.stringify(o); localStorage.setItem("flSettings", j); if (window.flMirror) flMirror("flSettings", j); }
// ---- synthesized sound (no assets, $0) ----
const Snd = (() => {
  let ctx = null, crowdSrc = null, crowdGain = null;
  const on = () => getSet().sound !== false;
  function ac() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (ctx && ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  function noise(c, secs) {
    const b = c.createBuffer(1, c.sampleRate * secs, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function crowdStart() {
    const c = ac(); if (!c || !on() || crowdSrc) return;
    crowdSrc = c.createBufferSource(); crowdSrc.buffer = noise(c, 2); crowdSrc.loop = true;
    const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 420; f.Q.value = 0.6;
    crowdGain = c.createGain(); crowdGain.gain.value = 0.055;
    crowdSrc.connect(f); f.connect(crowdGain); crowdGain.connect(c.destination);
    crowdSrc.start();
  }
  function crowdStop() { try { if (crowdSrc) crowdSrc.stop(); } catch (e) {} crowdSrc = null; }
  function swell(peak, secs) { // roar
    const c = ac(); if (!c || !on()) return;
    const src = c.createBufferSource(); src.buffer = noise(c, secs); 
    const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 700; f.Q.value = 0.4;
    const g = c.createGain();
    g.gain.setValueAtTime(0.001, c.currentTime);
    g.gain.exponentialRampToValueAtTime(peak, c.currentTime + 0.12);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + secs);
    src.connect(f); f.connect(g); g.connect(c.destination); src.start();
  }
  function whistle(n) {
    const c = ac(); if (!c || !on()) return;
    for (let i = 0; i < (n || 1); i++) {
      const o = c.createOscillator(); o.type = "square"; o.frequency.value = 2350;
      const v = c.createOscillator(); v.type = "sine"; v.frequency.value = 40; // trill
      const vg = c.createGain(); vg.gain.value = 300;
      v.connect(vg); vg.connect(o.frequency);
      const g = c.createGain(); const t0 = c.currentTime + i * 0.45;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.06, t0 + 0.03);
      g.gain.setValueAtTime(0.06, t0 + (n > 1 && i === n - 1 ? 0.6 : 0.25));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + (n > 1 && i === n - 1 ? 0.7 : 0.32));
      o.connect(g); g.connect(c.destination);
      o.start(t0); o.stop(t0 + 0.9); v.start(t0); v.stop(t0 + 0.9);
    }
  }
  return {
    kickoff() { crowdStart(); whistle(1); },
    fulltime() { whistle(3); setTimeout(crowdStop, 1200); },
    stop: crowdStop,
    goalUs() { swell(0.32, 2.2); },
    goalThem() { swell(0.09, 1.1); },
    chance() { swell(0.14, 0.8); },
    save() { swell(0.12, 0.9); },
    tap() {
      const c = ac(); if (!c || !on()) return;
      const o = c.createOscillator(); o.type = "sine"; o.frequency.value = 1250;
      const g = c.createGain();
      g.gain.setValueAtTime(0.03, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.05);
      o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + 0.06);
    }
  };
})();
window.Snd = Snd;

// ---- $0 crash diagnostics: ring-buffer error log (view/copy in Settings) ----
function flLogErr(kind, msg, src, line) {
  try {
    const log = JSON.parse(localStorage.getItem("flErrLog") || "[]");
    log.unshift({ t: new Date().toISOString(), k: kind, m: String(msg).slice(0, 300), s: String(src || "").split("/").pop().slice(0, 60), l: line || 0 });
    localStorage.setItem("flErrLog", JSON.stringify(log.slice(0, 30)));
  } catch (e) {}
}
window.addEventListener("error", (e) => flLogErr("err", e.message, e.filename, e.lineno));
window.addEventListener("unhandledrejection", (e) => flLogErr("rej", (e.reason && e.reason.message) || e.reason));

document.addEventListener("click", (e) => {
  if (e.target.closest(".btn, .opt, .tile, .nav > div")) { try { Snd.tap(); } catch (x) {} }
}, true);

// ---------- State ----------
let S = null; // save state

function newSave(name, pos, playstyle, region) {
  const seed = "save-" + Date.now();
  const world = E.makeWorld(0, seed, region);
  const galaxy0 = E.makeGalaxy(seed);
  const li0 = E.leagueForRegion(region);
  galaxy0.leagues[li0].clubs = world.clubs;       // my starting league IS a galaxy league
  galaxy0.leagues[li0].fixtures = world.fixtures; // same clubs, same fixtures, one world
  const stats = E.baseStats(pos);
  return {
    seed, name, pos, playstyle, region, stats,
    age: 17, retired: false,
    xp: 0, sp: 0, level: 1,
    cardType: "standard", cardTimer: 0,
    form: 0, // -2..+2 rolling
    gp: 500, nl: 10,
    clubIdx: 0, tier: 0,
    season: 1, matchday: 0,
    world,
    results: [],       // played fixtures this season {home,away,gH,gA}
    myStats: { apps: 0, goals: 0, assists: 0, ratings: [] },
    career: { seasons: [], totalGoals: 0, totalApps: 0 },
    skills: [], // PES-style learned skills
    trainedToday: false,
    lastFive: [],      // my club results W/D/L
    role: "balanced",
    rep: 10,
    buff: null,            // e.g. { stats: 2, matches: 1 } from Scout Report
    transferRequest: false, // LC purchase: agent pushes for a move at season end
    flags: { wins: 0, bestRating: 0, hatTrick: false, cleanSheets: 0 },
    objectives: {},        // claimed objective ids
    news: [],              // rolling headlines
    scorers: {},           // golden boot race: name -> goals
    cosmetics: {},
    cup: { round: 0, alive: true },
    galaxy: galaxy0, leagueIdx: li0, galMD: 0, ct: null,
    janOffered: false, janOffer: null,
    lastLogin: null, loginStreak: 0,
    condition: 100, injury: 0,        // matches remaining out
    upgrades: { fitness: 0, medical: 0, agentNet: 0 }
  };
}
function flMirror(key, val) { // survives WebView storage eviction in the wrapped app
  try {
    const P = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Preferences;
    if (P) { val === null ? P.remove({ key }) : P.set({ key, value: val }); }
  } catch (e) {}
  flFileBackupSoon(); // uninstall-proof layer: Documents/FootballLegend-backup
}
window.flMirror = flMirror;
// ---- uninstall-proof backup: one JSON file in shared Documents, refreshed after every save ----
let flBakTimer = null;
function flFileBackupSoon() { // debounce so bursts of saves = one write
  clearTimeout(flBakTimer);
  flBakTimer = setTimeout(flFileBackupNow, 1500);
}
let flFsPermOk = null;
async function flFsPerm(F) { // Android <= 10 needs storage permission for Documents; 11+ auto-grants
  if (flFsPermOk !== null) return flFsPermOk;
  try {
    let st = await F.checkPermissions();
    if (st.publicStorage !== "granted") st = await F.requestPermissions();
    flFsPermOk = st.publicStorage === "granted";
  } catch (e) { flFsPermOk = true; } // web impl has no permissions
  return flFsPermOk;
}
async function flFileBackupNow() {
  try {
    const F = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem;
    if (!F) return;
    if (!(await flFsPerm(F))) return;
    const pack = { v: 1, at: Date.now(),
      bal: localStorage.getItem(SAVE_KEY) || null,
      ml: localStorage.getItem("footballLegendML_v1") || null,
      set: localStorage.getItem("flSettings") || null };
    if (!pack.bal && !pack.ml) return;
    F.writeFile({ path: "FootballLegend/backup.json", data: JSON.stringify(pack),
      directory: "DOCUMENTS", encoding: "utf8", recursive: true }).catch(() => {});
  } catch (e) {}
}
async function flFileRestoreCheck() { // fresh install w/ no saves: offer the Documents backup
  try {
    const F = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem;
    if (!F) return false;
    if (localStorage.getItem(SAVE_KEY) || localStorage.getItem("footballLegendML_v1")) return false;
    if (!(await flFsPerm(F))) return false;
    const r = await F.readFile({ path: "FootballLegend/backup.json", directory: "DOCUMENTS", encoding: "utf8" });
    const pack = JSON.parse(r.data);
    if (!pack || pack.v !== 1 || (!pack.bal && !pack.ml)) return false;
    const when = pack.at ? new Date(pack.at).toLocaleDateString() : "unknown date";
    if (!confirm("\ud83d\udcbe Found a Football Legend backup from " + when + " on this device.\n\nRestore your careers?")) return false;
    if (pack.bal) localStorage.setItem(SAVE_KEY, pack.bal);
    if (pack.ml) localStorage.setItem("footballLegendML_v1", pack.ml);
    if (pack.set) localStorage.setItem("flSettings", pack.set);
    return true;
  } catch (e) { return false; }
}
async function flRestoreFromNative() { // boot: localStorage wiped but native copy exists -> restore
  try {
    const P = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Preferences;
    if (!P) return;
    for (const key of [SAVE_KEY, "footballLegendML_v1", "flSettings"]) {
      if (!localStorage.getItem(key)) {
        const r = await P.get({ key });
        if (r && r.value) localStorage.setItem(key, r.value);
      }
    }
  } catch (e) {}
}
function save() { const v = JSON.stringify(S); localStorage.setItem(SAVE_KEY, v); flMirror(SAVE_KEY, v); if (window.Cloud) try { Cloud.push("bal"); } catch (e) {} }
function load() {
  try { const d = localStorage.getItem(SAVE_KEY); if (d) S = JSON.parse(d); } catch (e) { S = null; }
}

// ---------- Helpers ----------
function myClub() { return S.world.clubs[S.clubIdx]; }
function leagueName() {
  if (S.galaxy && S.galaxy.leagues[S.leagueIdx]) return S.galaxy.leagues[S.leagueIdx].name;
  return S.tier === 0 ? (E.REGION_LEAGUES[S.region] || "National League") : "Continental Super League";
}
function ovr() { return E.calcOVR(S.stats, S.pos); }
function effStats() {
  // card type + form + consumable buffs give honest, visible modifiers
  const bonus = { standard: 0, trending: 2, showtime: 4, bigtime: 3, legendary: 6 }[S.cardType] || 0;
  const buff = (S.buff && S.buff.matches > 0) ? S.buff.stats : 0;
  const eff = {};
  for (const k in S.stats) eff[k] = Math.min(99, S.stats[k] + bonus + S.form + buff);
  return eff;
}
function cardLabel() {
  return { standard: "STANDARD", trending: "TRENDING", showtime: "SHOW TIME", bigtime: "BIG TIME", legendary: "LEGENDARY" }[S.cardType];
}
function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}
function fmtRating(r) {
  return `<div class="bigrating ${r >= 8.5 ? "r-great" : r >= 7 ? "r-good" : r >= 6 ? "r-ok" : "r-bad"}">${r.toFixed(1)}</div>`;
}
function crest(c) {
  return `<div class="crest" style="background:${c.col1};color:${c.col2}">${c.short}</div>`;
}
const CUP_ROUNDS = ["Quarter-Final", "Semi-Final", "FINAL"];
const CUP_AFTER_MD = [6, 12, 16];
// ---------- Galaxy (6-league world) + Champions Trophy ----------
const BAL_CT_NIGHTS = [3, 6, 9, 12, 15, 17]; // CT group nights unlock after these league MDs
function balGalaxySim() { // sim other 5 leagues up to my current matchday (dedupe via counter)
  if (!S.galaxy) return;
  S.galMD = S.galMD || 0;
  while (S.galMD < S.matchday && S.galMD < 18) {
    try { E.galaxySimMD(S.galaxy, S.leagueIdx, S.galMD, S.seed, S.season); } catch (e) {}
    S.galMD++;
  }
}
function balCtMyEntry() { return S.ct && S.ct.myG >= 0 ? S.ct.groups[S.ct.myG][S.ct.myS] : null; }
function balCtGroupMDDue() {
  if (!S.galaxy || !S.ct || !S.ct.alive || S.ct.stage !== "group") return -1;
  const due = BAL_CT_NIGHTS.filter(n => S.matchday >= n).length;
  return S.ct.gPlayed < due ? S.ct.gPlayed : -1;
}
function balCtKODue() {
  return !!(S.galaxy && S.ct && S.ct.alive && S.ct.stage === "ko" && S.matchday >= 18 && !S.ct.done);
}
function balCtFixture() { // pseudo-fixture for a Champions Trophy night
  const gmd = balCtGroupMDDue();
  if (gmd >= 0) {
    const pairs = gmd % 3 === 0 ? [[0, 1], [2, 3]] : gmd % 3 === 1 ? [[0, 2], [1, 3]] : [[0, 3], [1, 2]];
    let [x, y] = pairs.find(p => p.includes(S.ct.myS));
    if (gmd >= 3) [x, y] = [y, x];
    const home = x === S.ct.myS;
    const opp = S.ct.groups[S.ct.myG][home ? y : x];
    return { ct: true, ctStage: "group", ctMD: gmd, opp, ctX: x, ctY: y, oppClub: E.ctClub(S.galaxy, opp), ctHome: home,
             home: home ? S.clubIdx : -1, away: home ? -1 : S.clubIdx };
  }
  if (balCtKODue()) {
    const meE = balCtMyEntry();
    const r = E.ctSimKORound(S.ct, S.galaxy, S.seed + ":bal:s" + S.season, true, meE);
    if (!r.myFx) return null;
    const opp = (r.myFx.A.league === meE.league && r.myFx.A.club === meE.club) ? r.myFx.B : r.myFx.A;
    return { ct: true, ctStage: "ko", opp, oppClub: E.ctClub(S.galaxy, opp), ctHome: true, home: S.clubIdx, away: -1, koPre: r };
  }
  return null;
}
function balCtRecord(fx, gH, gA) { // shared by finishMatch, injured sim-out and abandoned resolver
  const my = fx.ctHome ? gH : gA, op = fx.ctHome ? gA : gH;
  const res = my > op ? "W" : my === op ? "D" : "L";
  let gp = 0, lc = 0;
  if (fx.ctStage === "group") {
    const gi = S.ct.myG;
    const key = gi + ":" + fx.ctMD + ":" + fx.ctX + "v" + fx.ctY;
    S.ct.gRes.push({ key, g: gi, h: fx.ctX, a: fx.ctY, gH, gA });
    S.ct.gPlayed++;
    E.ctSimGroups(S.ct, S.galaxy, S.seed + ":bal:s" + S.season, S.ct.gPlayed, true);
    if (res === "W") gp += 400;
    if (S.ct.gPlayed >= 6) {
      E.ctAdvanceToKO(S.ct, S.galaxy, S.seed + ":bal:s" + S.season);
      if (S.ct.alive) { lc += 10; pushNews("\ud83c\udf0d " + myClub().name + " reach the CHAMPIONS TROPHY quarter-finals! (+10 LC)"); }
      else {
        pushNews("\ud83c\udf0d Champions Trophy group-stage exit for " + myClub().name + ".");
        while (S.ct.ko.length > 1 && S.ct.koRound <= 2) { const rr = E.ctSimKORound(S.ct, S.galaxy, S.seed + ":bal:s" + S.season, false, null); S.ct.ko = rr.next; S.ct.koRound++; }
        S.ct.done = true; S.ct.champion = S.ct.ko[0] || null;
        if (S.ct.champion) pushNews("\ud83c\udf0d " + E.ctClub(S.galaxy, S.ct.champion).name + " win the Champions Trophy.");
      }
    }
  } else { // KO
    const meE = balCtMyEntry();
    let win = my > op || (my === op && Math.random() < 0.5); // pens usually resolved by caller; safety
    if (my !== op) win = my > op;
    const pre = fx.koPre;
    const next = pre.next.map(x => x === null ? (win ? meE : fx.opp) : x);
    if (win) {
      gp += [800, 1200, 2500][S.ct.koRound]; lc += [5, 8, 25][S.ct.koRound];
      pushNews("\ud83c\udf0d " + E.CT_ROUNDS[S.ct.koRound] + " won! " + myClub().name + " march on.");
      if (S.ct.koRound >= 2) {
        S.ct.done = true; S.ct.champion = meE;
        S.flags.ctWinner = true; S.flags.ctsWon = (S.flags.ctsWon || 0) + 1;
        pushNews("\ud83c\udf0d\ud83c\udfc6 " + myClub().name + " are CHAMPIONS TROPHY WINNERS! " + S.name + " conquers the continent!");
      } else { S.ct.ko = next; S.ct.koRound++; }
    } else {
      S.ct.alive = false;
      pushNews("\ud83c\udf0d Champions Trophy exit at the " + E.CT_ROUNDS[S.ct.koRound] + " stage.");
      S.ct.ko = next; S.ct.koRound++;
      while (S.ct.ko.length > 1 && S.ct.koRound <= 2) { const rr = E.ctSimKORound(S.ct, S.galaxy, S.seed + ":bal:s" + S.season, false, null); S.ct.ko = rr.next; S.ct.koRound++; }
      S.ct.done = true; S.ct.champion = S.ct.ko[0] || null;
      if (S.ct.champion) pushNews("\ud83c\udf0d " + E.ctClub(S.galaxy, S.ct.champion).name + " win the Champions Trophy.");
    }
  }
  S.gp += gp; S.nl += lc;
  return { res, gp, lc };
}
function cupPending() {
  return S.cup.alive && S.cup.round < 3 && S.matchday >= CUP_AFTER_MD[S.cup.round];
}
function cupOpponent(rnd) {
  // deterministic: strong-ish club not yours, different per round
  if (rnd == null) rnd = S.cup.round;
  const rng = E.mulberry32(E.hashSeed(S.seed + ":cup:" + S.season + ":" + rnd));
  let idx = 1 + Math.floor(rng() * (S.world.clubs.length - 1));
  if (idx === S.clubIdx) idx = (idx + 1) % S.world.clubs.length || 1;
  return idx;
}
function myNextFixture() {
  if (S.matchday >= S.world.fixtures.length) return null;
  const md = S.world.fixtures[S.matchday];
  for (const [h, a] of md) if (h === S.clubIdx || a === S.clubIdx) return { home: h, away: a };
  return null;
}
function walletHTML() {
  return `<div class="wallet">
    <div class="chip"><span class="ico ico-gp"></span>${S.gp.toLocaleString()} GP</div>
    <div class="chip"><span class="ico ico-nl"></span>${S.nl} LC</div>
  </div>`;
}
function playerCardHTML(small) {
  const eff = effStats();
  const club = myClub();
  const kit = club.col1, kit2 = club.col2 || "#fff";
  const o = E.calcOVR(eff, S.pos);
  const trim = S.cosmetics && S.cosmetics.trim;
  const boots = S.cosmetics && S.cosmetics.boots;
  const formTxt = S.form > 0 ? "+" + S.form : String(S.form);
  const stats = ["PAC","SHO","PAS","DRI","DEF","PHY"].map(k =>
    `<div class="stat"><b>${eff[k]}</b><span>${k}</span>${eff[k] > S.stats[k] ? `<span class="up">▲${eff[k]-S.stats[k]}</span>` : ""}</div>`).join("");
  return `<div class="pcard ${S.cardType}${small ? " compact" : ""}" style="--kit:${kit};--kit2:${kit2};${trim ? "box-shadow:0 0 18px rgba(242,201,76,.5);border-color:var(--gold);" : ""}">
    <div class="pcard-foil"></div>
    <span class="ctype">${cardLabel()}</span>
    <div class="pcard-top">
      <div class="pcard-ovrcol"><div class="ovr">${o}</div><div class="pos">${S.pos}</div></div>
      <div class="avatar"></div>
    </div>
    <div class="pname">${S.name}${boots ? " \ud83d\udc5f" : ""}</div>
    <div class="pclub">${club.name} \u00b7 S${S.season} \u00b7 Lv ${S.level}</div>
    <div class="pcard-meta"><span>${(E.PLAYSTYLES[S.playstyle]||{}).label || E.POSITIONS[S.pos].label}</span><span>form ${formTxt}</span></div>
    <div class="statgrid">${stats}</div>
    <div class="pcard-kit"></div>
  </div>`;
}

// ---------- Screens ----------
let FL_STACK = [];
let FL_CUR = null;
function render(screen, isBack) {
  const app = $("#app");
  const sameScreen = FL_CUR === screen; // re-render of the same screen (e.g. buying in shop): keep scroll position
  if (!isBack && FL_CUR && !sameScreen) {
    FL_STACK.push(FL_CUR);
    if (FL_STACK.length > 25) FL_STACK.shift();
    try { history.pushState({ fl: FL_STACK.length }, ""); } catch (e) {}
  }
  const keepY = sameScreen ? (window.scrollY || 0) : 0;
  FL_CUR = screen;
  app.innerHTML = screen();
  bindNav();
  try { window.scrollTo(0, keepY); } catch (e) {}
}
function flBack() {
  // never back out of a live match by accident — matches/screens with timers confirm via their own UI
  const prev = FL_STACK.pop();
  if (prev) { render(prev, true); return true; }
  if (typeof menuScreen === "function" && FL_CUR !== menuScreen) { render(menuScreen, true); return true; }
  return false; // at root: let the OS handle it (minimize/exit)
}
window.flBack = flBack;
window.addEventListener("popstate", () => { flBack(); });
// Capacitor native back button (wrapped app)
try {
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
    window.Capacitor.Plugins.App.addListener("backButton", () => {
      if (!flBack()) window.Capacitor.Plugins.App.minimizeApp();
    });
  }
} catch (e) {}
// one-time audio unlock on first real gesture (Android WebView autoplay policy)
(function () {
  const unlock = () => { try { if (window.Snd) { /* creating/resuming ctx needs gesture */ } } catch (e) {}
    document.removeEventListener("touchstart", unlock); document.removeEventListener("click", unlock); };
  document.addEventListener("touchstart", unlock, { once: true });
  document.addEventListener("click", unlock, { once: true });
})();
function topbar() {
  return `<div class="topbar"><div class="logo"><span class="brand1">FOOTBALL</span> <span class="legend">LEGEND</span></div>${walletHTML()}</div>`;
}
function navHTML(on) {
  const items = [["home","\ud83c\udfe0","Home"],["match","\u26bd","Matchday"],["cal","\ud83d\udcc5","Season"]];
  return `<div class="nav">${items.map(([id, ico, label]) =>
    `<button data-nav="${id}" class="${on === id ? "on" : ""}"><span class="nico">${ico}</span>${label}</button>`).join("")}</div>`;
}
function bindNav() {
  document.querySelectorAll("[data-nav]").forEach(b => b.onclick = () => {
    const v = b.dataset.nav;
    if (v === "home") render(homeScreen);
    if (v === "match") render(previewScreen);
    if (v === "cal") render(calendarScreen);
    if (v === "table") render(tableScreen);
    if (v === "train") render(trainScreen);
    if (v === "shop") render(shopScreen);
    if (v === "career") render(careerScreen);
  });
}

// ---- PES-style skills: hybrid acquisition (2 milestone slots + 3 purchasable) ----
// Pool is ALWAYS position-gated via Engine.skillsFor — never hand-roll a GK Outside Curler.
function balSkillPool(pos) {
  return (E.skillsFor && E.skillsFor(pos || (S && S.pos) || "CF")) || [];
}
function balSkillSlots() {
  let slots = 0;
  if (S.career.totalApps >= 20) slots++;
  if ((S.flags.cupsWon || 0) > 0 || S.career.seasons.some(x => x.award)) slots++;
  slots += (S.skillSlotsBought || 0);
  return Math.min(5, slots);
}
const BAL_SKILL_SLOT_COST = [{ gp: 5000 }, { gp: 15000 }, { lc: 30 }];
function skillsScreen() {
  const slots = balSkillSlots();
  const pool = balSkillPool(S.pos);
  // Drop any illegal leftovers (e.g. old saves that learned Long Range Drive as GK)
  if (E.skillsActive) {
    const cleaned = E.skillsActive(S.skills || [], S.pos);
    if (cleaned.length !== (S.skills || []).length) { S.skills = cleaned; save(); }
  }
  const learned = S.skills || [];
  const nextBuy = (S.skillSlotsBought || 0) < 3 ? BAL_SKILL_SLOT_COST[S.skillSlotsBought || 0] : null;
  setTimeout(() => {
    document.querySelectorAll("[data-learn]").forEach(b => b.onclick = () => {
      const sk = b.dataset.learn;
      if ((S.skills || []).length >= balSkillSlots()) { toast("No free skill slots"); return; }
      if (S.skills.includes(sk)) return;
      if (E.skillLegal && !E.skillLegal(sk, S.pos)) { toast("\u274c Not available for " + S.pos); return; }
      S.skills.push(sk); save(); toast("\ud83c\udfaf Learned: " + sk); render(skillsScreen);
    });
    const buy = $("#buyslot");
    if (buy) buy.onclick = () => {
      const cost = BAL_SKILL_SLOT_COST[S.skillSlotsBought || 0];
      if (!cost) return;
      if (cost.gp) { if (S.gp < cost.gp) { toast("Not enough GP"); return; } S.gp -= cost.gp; }
      else { if (S.nl < cost.lc) { toast("Not enough LC"); return; } S.nl -= cost.lc; }
      S.skillSlotsBought = (S.skillSlotsBought || 0) + 1;
      save(); toast("\ud83d\udd13 Skill slot unlocked!"); render(skillsScreen);
    };
    $("#backhome2").onclick = () => render(homeScreen);
  }, 0);
  const effects = { "Outside Curler": "FK curler +18%, shots +4%", "Long Range Drive": "shots +6%, FK power +10%",
    "First-time Shot": "shots +8%", "Chip Shot Control": "panenka +25%", "Heading": "shots +5%",
    "Acrobatic Finishing": "shots +7%", "Through Passing": "passes +10%", "Pinpoint Crossing": "FK cross +15%, passes +5%",
    "One-touch Pass": "passes +8%", "Captaincy": "leadership \u2014 team lift", "Fighting Spirit": "+12% when losing after 70'",
    "Super-sub": "boost when subbed on", "Track Back": "tackle success +4%", "Penalty Specialist": "penalties +12%",
    "Reflexes": "saves +8%", "Penalty Saver": "penalty saves +18%", "Command of Area": "rush saves +6%, fewer blunders",
    "High Claim": "stay-big +3%", "GK Long Ball": "distribution +10%" };
  return `<div class="screen">
    <div class="topbar"><div class="logo"><span class="brand1">PLAYER</span> <span class="legend">SKILLS</span></div>
      <div class="wallet"><span class="chip">\ud83d\udfe2 ${S.gp} GP</span><span class="chip gold">\ud83e\ude99 ${S.nl} LC</span></div></div>
    <div class="panel"><h2>\ud83c\udfaf Skills \u00b7 ${S.pos} \u00b7 ${learned.length}/${slots} slots used</h2>
      <p class="sub">Only skills legal for <b>${S.pos}</b> appear here (a GK never learns Outside Curler). Boosts are baked into the odds you see in matches.
      Slot 1: 20 career apps ${S.career.totalApps >= 20 ? "\u2705" : "(" + S.career.totalApps + "/20)"} \u00b7 Slot 2: first trophy/award ${((S.flags.cupsWon || 0) > 0 || S.career.seasons.some(x => x.award)) ? "\u2705" : "\u23f3"} \u00b7 3 more purchasable.</p>
      ${nextBuy ? `<button class="btn secondary" id="buyslot">\ud83d\udd13 UNLOCK SLOT \u00b7 ${nextBuy.gp ? nextBuy.gp + " GP" : nextBuy.lc + " LC"}</button>` : ""}
    </div>
    <div class="panel"><h2>${S.pos} skill pool</h2>
      ${pool.map(sk => `<div class="kv"><span><b>${sk}</b>${learned.includes(sk) ? ' <span class="badge gold">LEARNED</span>' : ""}<br>
        <span class="sub">${effects[sk] || ""}</span></span>
        ${learned.includes(sk) ? "" : `<button class="btn secondary" data-learn="${sk}" ${learned.length >= slots ? "disabled" : ""}>LEARN</button>`}</div>`).join("")}
    </div>
    <button class="btn secondary" id="backhome2">\u2b05 BACK</button></div>`;
}

// ---- Season calendar (FIFA-style: league + cup in one view) ----
function calendarScreen() {
  const fxs = S.world.fixtures;
  let rows = "";
  for (let md = 0; md < fxs.length; md++) {
    let mine = null;
    for (const [h, a] of fxs[md]) if (h === S.clubIdx || a === S.clubIdx) { mine = [h, a]; break; }
    if (mine) {
      const home = mine[0] === S.clubIdx;
      const opp = S.world.clubs[home ? mine[1] : mine[0]];
      const r = S.results.find(q => q.home === mine[0] && q.away === mine[1]);
      let right;
      if (r) {
        const myG = home ? r.gH : r.gA, opG = home ? r.gA : r.gH;
        const col = myG > opG ? "var(--green)" : myG === opG ? "var(--gold)" : "var(--red)";
        right = `<b style="color:${col}">${r.gH} - ${r.gA}</b>`;
      } else right = md === S.matchday ? `<b style="color:var(--green)">\u25b6 NEXT</b>` : `<span class="sub">${home ? "\ud83c\udfdf HOME" : "\u2708\ufe0f AWAY"}</span>`;
      rows += `<div class="kv"><span><b>MD ${md + 1}</b> ${home ? "vs" : "@"} ${opp.name}</span>${right}</div>`;
    }
    for (let cr = 0; cr < 3; cr++) if (md + 1 === CUP_AFTER_MD[cr]) {
      let right, oppNm = "";
      if (S.cup.round > cr) right = `<b style="color:var(--green)">${cr === 2 ? "\ud83c\udfc6 WON" : "\u2713 THROUGH"}</b>`;
      else if (!S.cup.alive) right = `<span class="sub">\u2014 eliminated</span>`;
      else {
        oppNm = " vs " + S.world.clubs[cupOpponent(cr)].name;
        right = S.cup.round === cr && S.matchday >= CUP_AFTER_MD[cr] ? `<b style="color:var(--gold)">\u25b6 NEXT</b>` : `<span class="sub">upcoming</span>`;
      }
      rows += `<div class="kv" style="background:rgba(232,193,90,.07);border-radius:6px"><span>\ud83c\udfc6 <b>National Cup \u00b7 ${CUP_ROUNDS[cr]}</b>${oppNm}</span>${right}</div>`;
    }
  }
  return `<div class="screen">
    <div class="topbar"><div class="logo"><span class="brand1">SEASON</span> <span class="legend">${S.season}</span></div></div>
    <div class="panel"><h2>\ud83d\udcc5 ${myClub().name} \u2014 Season Calendar</h2>
      <p class="sub">All competitions in one view: ${fxs.length} league matchdays + National Cup rounds (slotted after MD ${CUP_AFTER_MD.join(", MD ")}).</p>
      ${rows}</div>
    ${navHTML("cal")}
  </div>`;
}

// ---- Create player (region -> position -> playstyle) ----
function createScreen() {
  setTimeout(() => {
    let region = "southeuro", pos = "CF", style = "poacher";
    function styleOpts() {
      const styles = E.stylesFor(pos);
      if (!styles.some(x => x.id === style)) style = styles[0].id;
      return styles.map(s =>
        `<div class="opt ${s.id === style ? "sel" : ""}" data-style="${s.id}" style="flex:1 1 45%">${s.label}<br><span class="sub">${s.desc}</span></div>`).join("");
    }
    function bindStyles() {
      document.querySelectorAll("[data-style]").forEach(o => o.onclick = () => {
        style = o.dataset.style;
        document.querySelectorAll("[data-style]").forEach(x => x.classList.toggle("sel", x.dataset.style === style));
      });
    }
    function regionPreview() {
      const rng = E.mulberry32(E.hashSeed("preview:" + region));
      const clubs = E.genStarterClubs(region, rng);
      $("#pname").value = E.genPlayerName(E.mulberry32(Date.now() & 0xffffffff), region);
      $("#leagueprev").textContent = (E.REGION_LEAGUES[region] || "National League") + " \u00b7 18 matchdays \u00b7 Season 1";
      $("#start").textContent = "Sign for " + clubs[0].name + " \u2192";
    }
    document.querySelectorAll("[data-reg]").forEach(o => o.onclick = () => {
      region = o.dataset.reg;
      document.querySelectorAll("[data-reg]").forEach(x => x.classList.toggle("sel", x.dataset.reg === region));
      regionPreview();
    });
    regionPreview();
    document.querySelectorAll("[data-pos]").forEach(o => o.onclick = () => {
      pos = o.dataset.pos;
      document.querySelectorAll("[data-pos]").forEach(x => x.classList.toggle("sel", x.dataset.pos === pos));
      document.getElementById("stylebox").innerHTML = styleOpts();
      bindStyles();
    });
    document.getElementById("stylebox").innerHTML = styleOpts();
    bindStyles();
    $("#rand").onclick = () => {
      const rng = E.mulberry32(Date.now() & 0xffffffff);
      $("#pname").value = E.genPlayerName(rng, region);
    };
    $("#start").onclick = () => {
      const name = $("#pname").value.trim() || E.genPlayerName(E.mulberry32(Date.now() & 0xffffffff), region);
      S = newSave(name, pos, style, region);
      save();
      toast("Welcome to " + S.world.clubs[0].name + "!");
      render(homeScreen);
    };
  }, 0);
  return `<div class="screen">
    ${`<div class="topbar"><div class="logo"><span class="brand1">FOOTBALL</span> <span class="legend">LEGEND</span></div></div>`}
    <div class="panel center">
      <h1>Become a Legend</h1>
      <p class="sub" style="margin:8px 0 4px">From lower-league trials to the top of world football.</p>
    </div>
    <div class="panel">
      <h2>Create Your Player</h2>
      <p class="sub">Region</p>
      <div class="optrow">
        ${Object.entries(E.REGIONS).map(([id, r]) =>
          `<div class="opt ${id === "southeuro" ? "sel" : ""}" data-reg="${id}" style="flex:1 1 45%">${r.flag} ${r.label}</div>`).join("")}
      </div>
      <input type="text" id="pname" placeholder="Player name" value="Marco Delgado"/>
      <button class="btn secondary" id="rand" style="margin-top:4px">🎲 Random Name (from region)</button>
      <p class="sub" style="margin-top:12px">Position</p>
      <div class="optrow">
        ${Object.keys(E.POSITIONS).map(p =>
          `<div class="opt ${p === "CF" ? "sel" : ""}" data-pos="${p}" style="flex:1 1 22%;padding:8px 2px">${p}<br><span class="sub" style="font-size:.58rem">${E.POSITIONS[p].label}</span></div>`).join("")}
      </div>
      <p class="sub" style="margin-top:12px">Playstyle</p>
      <div class="optrow" id="stylebox"></div>
      <button class="btn" id="start">Sign <span id="clubprev"></span> →</button>
      <p class="sub center" style="margin-top:8px" id="leagueprev">National League · 18 matchdays · Season 1</p>
    </div>
  </div>`;
}

// ---- Objectives ----
// Tiered achievement chains: next tier unlocks when previous is claimed.
// Rewards escalate per tier; LC appears at higher tiers.
function objectiveChains() {
  const pos = S.pos;
  const isGK = pos === "GK";
  const isDef = ["CB","LB","RB","DMF"].includes(pos);
  const isMid = ["CMF","AMF"].includes(pos);
  const isAtt = ["LWF","RWF","SS","CF"].includes(pos);
  const ps = E.PLAYSTYLES[S.playstyle] || {};
  const F = S.flags;

  const chains = [
    { id: "apps",  icon: "\ud83d\udc5f", label: "Appearances", unit: "career apps",
      val: () => S.career.totalApps,
      tiers: [1, 5, 10, 20, 35, 50, 75, 100],
      reward: (i) => i < 2 ? { gp: 50 + i * 50 } : i < 5 ? { gp: 150 + i * 100 } : { lc: 3 + (i - 4) * 2 } },
    { id: "wins",  icon: "\ud83c\udfc6", label: "Winner", unit: "wins",
      val: () => F.wins || 0,
      tiers: [1, 3, 7, 12, 20, 30, 45],
      reward: (i) => i < 2 ? { gp: 100 + i * 100 } : i < 4 ? { gp: 250 + i * 100 } : { lc: 4 + (i - 3) * 2 } },
    { id: "level", icon: "\ud83d\udcc8", label: "Development", unit: "level",
      val: () => S.level,
      tiers: [2, 3, 5, 8, 12, 16, 20, 25],
      reward: (i) => i < 3 ? { gp: 150 + i * 75 } : i < 6 ? { gp: 350 + i * 100 } : { lc: 5 + (i - 5) * 3 } },
    { id: "rate8", icon: "\u2b50", label: "Consistency", unit: "matches rated 7.5+",
      val: () => F.hi75 || 0,
      tiers: [1, 3, 7, 12, 20, 30],
      reward: (i) => i < 2 ? { gp: 150 + i * 50 } : i < 4 ? { gp: 300 } : { lc: 4 + (i - 3) * 2 } },
    { id: "rep",   icon: "\ud83c\udf1f", label: "Reputation", unit: "reputation",
      val: () => S.rep,
      tiers: [25, 50, 100, 175, 275, 400],
      reward: (i) => i < 2 ? { gp: 200 + i * 100 } : i < 4 ? { gp: 400 } : { lc: 6 + (i - 3) * 3 } }
  ];
  if (isAtt || isMid) chains.push(
    { id: "goals", icon: "\u26bd", label: "Goalscorer", unit: "career goals",
      val: () => S.career.totalGoals,
      tiers: isAtt ? [1, 3, 7, 12, 20, 30, 45, 60] : [1, 2, 5, 9, 15, 22, 30],
      reward: (i) => i < 2 ? { gp: 100 + i * 100 } : i < 4 ? { gp: 300 + i * 100 } : { lc: 3 + (i - 3) * 2 } },
    { id: "assists", icon: "\ud83c\udd70\ufe0f", label: "Provider", unit: "career assists",
      val: () => F.careerAssists || 0,
      tiers: isMid ? [1, 3, 7, 12, 20, 30, 42] : [1, 2, 5, 9, 15, 22],
      reward: (i) => i < 2 ? { gp: 100 + i * 100 } : i < 4 ? { gp: 300 + i * 100 } : { lc: 3 + (i - 3) * 2 } });
  if (isAtt) chains.push(
    { id: "shots", icon: "\ud83d\udca5", label: "Shot Machine", unit: "career shots",
      val: () => F.shots || 0,
      tiers: [5, 12, 25, 45, 70, 100],
      reward: (i) => i < 3 ? { gp: 150 + i * 75 } : { lc: 3 + (i - 2) * 2 } },
    { id: "hatty", icon: "\ud83c\udfa9", label: "Treble Threat", unit: "hat-tricks",
      val: () => F.hatTricks || 0,
      tiers: [1, 2, 4, 7],
      reward: (i) => ({ lc: 5 + i * 3 }) });
  if (isDef || isGK) chains.push(
    { id: "cleans", icon: "\ud83e\uddf1", label: "Fortress", unit: "clean sheets",
      val: () => F.cleanSheets || 0,
      tiers: [1, 3, 6, 10, 16, 24],
      reward: (i) => i < 2 ? { gp: 150 + i * 100 } : i < 4 ? { gp: 350 } : { lc: 4 + (i - 3) * 2 } });
  if (isDef) chains.push(
    { id: "tackles", icon: "\ud83d\udee1\ufe0f", label: "Gatekeeper", unit: "tackles won",
      val: () => F.tackles || 0,
      tiers: [3, 8, 16, 28, 45, 65],
      reward: (i) => i < 3 ? { gp: 150 + i * 75 } : { lc: 3 + (i - 2) * 2 } });
  if (isGK) chains.push(
    { id: "saves", icon: "\ud83e\udde4", label: "Wall of Hands", unit: "saves",
      val: () => F.saves || 0,
      tiers: [5, 15, 30, 55, 85, 120],
      reward: (i) => i < 3 ? { gp: 150 + i * 75 } : { lc: 3 + (i - 2) * 2 } });
  if ((ps.assist || 1) >= 1.2 && !isGK) chains.push(
    { id: "psassist", icon: "\ud83c\udfa8", label: ps.label + " Special", unit: "matches with an assist",
      val: () => F.assistMatches || 0,
      tiers: [2, 5, 9, 15],
      reward: (i) => i < 2 ? { gp: 250 + i * 100 } : { lc: 4 + (i - 1) * 2 } });
  if ((ps.shoot || 1) >= 1.2 && !isGK) chains.push(
    { id: "psshoot", icon: "\ud83c\udfaf", label: ps.label + " Instinct", unit: "matches with 2+ shots",
      val: () => F.multiShotMatches || 0,
      tiers: [2, 5, 9, 15],
      reward: (i) => i < 2 ? { gp: 250 + i * 100 } : { lc: 4 + (i - 1) * 2 } });
  // milestone one-offs
  chains.push(
    { id: "r9", icon: "\ud83c\udf1f", label: "World Class", unit: "9.0+ ratings",
      val: () => F.count9 || 0,
      tiers: [1, 3, 6],
      reward: (i) => ({ lc: 3 + i * 3 }) },
    { id: "cup", icon: "\ud83c\udfc6", label: "Cup Glory", unit: "cup wins",
      val: () => F.cupsWon || 0,
      tiers: [1, 2, 3],
      reward: (i) => ({ lc: 8 + i * 6 }) });
  return chains;
}
// Flatten chains into display objectives: for each chain show the LOWEST unclaimed tier.
function objectiveList() {
  const out = [];
  for (const c of objectiveChains()) {
    const claimed = S.objectives[c.id] || 0; // number of tiers claimed
    if (claimed >= c.tiers.length) continue;  // chain complete
    const tierIdx = claimed;
    const target = c.tiers[tierIdx];
    const cur = c.val();
    const rw = c.reward(tierIdx);
    out.push({
      id: c.id, tierIdx, icon: c.icon,
      label: c.label + " " + "\u2160\u2161\u2162\u2163\u2164\u2165\u2166\u2167".charAt(tierIdx),
      desc: `Reach ${target} ${c.unit} (${Math.min(cur, target)}/${target})`,
      gp: rw.gp, lc: rw.lc,
      met: () => c.val() >= target,
      progress: Math.min(1, cur / target)
    });
  }
  // sort: claimable first, then by progress
  out.sort((a, b) => (b.met() - a.met()) || (b.progress - a.progress));
  return out;
}
function claimableCount() {
  return objectiveList().filter(o => o.met()).length;
}
function objectivesScreen() {
  setTimeout(() => {
    function claimOne(o) {
      if (!o || !o.met()) return null;
      S.objectives[o.id] = (S.objectives[o.id] || 0) + 1;
      if (o.gp) S.gp += o.gp;
      if (o.lc) S.nl += o.lc;
      return o;
    }
    document.querySelectorAll("[data-claim]").forEach(b => b.onclick = () => {
      const o = objectiveList().find(x => x.id === b.dataset.claim && x.met());
      if (claimOne(o)) {
        save();
        toast(`Claimed: +${o.gp ? o.gp + " GP" : o.lc + " LC"}`);
        render(objectivesScreen);
      }
    });
    const ca = $("#claimall");
    if (ca) ca.onclick = () => {
      let gp = 0, lc = 0, n = 0;
      // loop: claiming a tier may immediately expose the next met tier
      let safety = 100;
      while (safety-- > 0) {
        const claimables = objectiveList().filter(o => o.met());
        if (!claimables.length) break;
        for (const o of claimables) { claimOne(o); gp += o.gp || 0; lc += o.lc || 0; n++; }
      }
      if (n) {
        save();
        toast(`Claimed ${n} rewards: +${gp} GP${lc ? ", +" + lc + " LC" : ""}`);
        render(objectivesScreen);
      } else toast("Nothing to claim yet");
    };
    $("#backhome").onclick = () => render(homeScreen);
  }, 0);
  const list = objectiveList();
  const nClaim = list.filter(o => o.met()).length;
  return `<div class="screen">${topbar()}
    <div class="panel">
      <h2>\ud83c\udfaf Objectives ${nClaim ? `<span class="badge gold">${nClaim} ready</span>` : ""}</h2>
      ${nClaim ? `<button class="btn gold" id="claimall" style="margin-bottom:10px">\u2728 CLAIM ALL (${nClaim})</button>` : ""}
      ${list.map(o => {
        const done = o.met();
        return `<div class="trainrow" style="align-items:flex-start">
          <span style="flex:1">${o.icon} <b>${o.label}</b><br><span class="sub">${o.desc}</span>
            <div class="objbar"><div class="objfill" style="width:${Math.round(o.progress * 100)}%"></div></div>
          </span>
          ${done ? `<button class="btn gold" data-claim="${o.id}" style="width:auto;margin:0;padding:8px 14px;font-size:.8rem">+${o.gp ? o.gp + " GP" : o.lc + " LC"}</button>`
            : `<span class="sub" style="white-space:nowrap;padding-top:6px">${o.gp ? o.gp + " GP" : o.lc + " LC"}</span>`}
        </div>`;
      }).join("")}
    </div>
    <button class="btn secondary" id="backhome">← Home</button>
    ${navHTML("home")}
  </div>`;
}

// ---- News ----
function titleRaceNews() {
  if (S.matchday !== 12 && S.matchday !== 15) return;
  const t = E.computeTable(S.world.clubs, S.results);
  const me = t.findIndex(r => r.i === S.clubIdx) + 1;
  const leader = S.world.clubs[t[0].i];
  const gap = t[0].Pts - t[me - 1].Pts;
  if (me === 1) pushNews("\ud83d\udd25 TITLE RACE: " + myClub().name + " top with " + (18 - S.matchday) + " to play \u2014 " + (t[0].Pts - t[1].Pts) + " pts clear.");
  else if (me <= 4) pushNews("\ud83d\udd25 TITLE RACE: " + gap + " pts behind " + leader.name + " with " + (18 - S.matchday) + " to play. Every match a final.");
}
function pushNews(txt, tag) {
  S.news.unshift({ s: S.season, md: S.matchday, txt, tag: tag || "" });
  S.news = S.news.slice(0, 14);
}
function rivalName(clubIdx, slot) {
  return E.genPlayerName(E.mulberry32(E.hashSeed(S.seed + ":t" + S.tier + ":c" + clubIdx + ":f" + slot)));
}
function newsScreen() {
  setTimeout(() => { $("#backhome").onclick = () => render(homeScreen); }, 0);
  return `<div class="screen">${topbar()}
    <div class="panel">
      <h2>📰 League News</h2>
      ${S.news.length ? S.news.map(n =>
        `<div class="newsitem"><span class="sub">S${n.s} · MD${n.md}</span><br>${n.txt}</div>`).join("")
        : '<p class="sub">No headlines yet — play your first match.</p>'}
    </div>
    <button class="btn secondary" id="backhome">← Home</button>
    ${navHTML("home")}
  </div>`;
}

// ---- Home hub (eFootball-style) ----
function homeScreen() {
  if (S && S.retired) { balRetire(true); return ""; } // enshrined careers don't play on
  if (balResolveAbandoned()) toast("\u26a0\ufe0f Abandoned match resolved by simulation.");
  if (S && janWindowDue()) return janOfferScreen();
  const fx = myNextFixture();
  const claimable = claimableCount();
  setTimeout(() => {
    const go = $("#gomatch"); if (go) go.onclick = () => render(previewScreen);
    const gc = $("#gocup"); if (gc) gc.onclick = () => render(previewScreen);
    const gt = $("#goct"); if (gt) gt.onclick = () => render(previewScreen);
    const ns = $("#newseason"); if (ns) ns.onclick = startNewSeason;
    document.querySelectorAll("[data-tile]").forEach(t => t.onclick = () => {
      const v = t.dataset.tile;
      if (v === "obj") render(objectivesScreen);
      if (v === "news") render(newsScreen);
      if (v === "train") render(trainScreen);
      if (v === "skills") render(skillsScreen);
      if (v === "shop") render(shopScreen);
      if (v === "table") render(tableScreen);
      if (v === "career") render(careerScreen);
      if (v === "ml") { if (window.ML) ML.enter(); else toast("Loading..."); }
      if (v === "menu") render(menuScreen);
    });
  }, 0);
  let hero;
  const ctFxH = balCtFixture();
  if (ctFxH) {
    hero = `<div class="hero cup" id="goct">
      <div class="hero-label">\ud83c\udf0d CHAMPIONS TROPHY \u00b7 ${ctFxH.ctStage === "group" ? "GROUP MD " + (ctFxH.ctMD + 1) + "/6" : E.CT_ROUNDS[S.ct.koRound].toUpperCase()}</div>
      <div class="hero-vs">${crest(myClub())}<span class="hero-x">VS</span>${crest(ctFxH.oppClub)}</div>
      <div class="hero-opp">${ctFxH.oppClub.name}</div>
      <div class="hero-cta">TAP TO PLAY \u25b6</div>
    </div>`;
  } else if (cupPending()) {
    const opp = S.world.clubs[cupOpponent()];
    hero = `<div class="hero cup" id="gocup">
      <div class="hero-label">\ud83c\udfc6 NATIONAL CUP \u00b7 ${CUP_ROUNDS[S.cup.round]}</div>
      <div class="hero-vs">${crest(myClub())}<span class="hero-x">VS</span>${crest(opp)}</div>
      <div class="hero-opp">${opp.name}</div>
      <div class="hero-cta">TAP TO PLAY \u25b6</div>
    </div>`;
  } else if (fx) {
    const home = fx.home === S.clubIdx;
    const opp = S.world.clubs[home ? fx.away : fx.home];
    hero = `<div class="hero" id="gomatch">
      <div class="hero-label">MATCHDAY ${S.matchday + 1} / ${S.world.fixtures.length} · ${home ? "🏟 HOME" : "✈️ AWAY"}</div>
      <div class="hero-vs">${crest(myClub())}<span class="hero-x">VS</span>${crest(opp)}</div>
      <div class="hero-opp">${opp.name}</div>
      <div class="hero-cta">TAP TO PLAY ▶</div>
    </div>`;
  } else {
    hero = `<div class="hero done">
      <div class="hero-label">🏁 SEASON ${S.season} COMPLETE</div>
      <button class="btn gold" id="newseason" style="margin-top:8px">Start Season ${S.season + 1} →</button>
    </div>`;
  }
  const avg = S.myStats.ratings.length ? (S.myStats.ratings.reduce((a, b) => a + b, 0) / S.myStats.ratings.length).toFixed(2) : "—";
  const table = E.computeTable(S.world.clubs, S.results);
  const myPos = S.results.length ? table.findIndex(t => t.i === S.clubIdx) + 1 : "—";
  const tile = (id, ico, label, badge) =>
    `<div class="tile" data-tile="${id}">${badge ? `<span class="tilebadge">${badge}</span>` : ""}<span class="tileico">${ico}</span><span>${label}</span></div>`;
  return `<div class="screen">${topbar()}
    ${playerCardHTML(true)}
    ${hero}
    <div class="tiles">
      ${tile("obj", "🎯", "Objectives", claimable || "")}
      ${tile("news", "📰", "News")}
      ${tile("train", "💪", "Training", S.sp || "")}
      ${tile("skills", "🎯", "Skills", (S.skills || []).length < balSkillSlots() ? "!" : "")}
      ${tile("shop", "🛒", "Shop", (S.buff && S.buff.matches) ? "⚡" : "")}
      ${tile("table", "📊", "League")}
      ${tile("career", "⭐", "Career")}
    ${tile("ml", "\ud83c\udfdf\ufe0f", "Master League")}
      ${tile("menu", "\ud83c\udfe0", "Main Menu")}
    </div>
    <div class="panel">
      <div class="kv"><span>League position</span><b>${myPos !== "—" ? "#" + myPos : "—"}</b></div>
      <div class="kv"><span>Apps / Goals / Assists</span><b>${S.myStats.apps} / ${S.myStats.goals} / ${S.myStats.assists}</b></div>
      <div class="kv"><span>Average rating</span><b>${avg}</b></div>
      <div class="kv"><span>Form ${S.form > 0 ? "📈" : S.form < 0 ? "📉" : ""}</span><b>${S.form > 0 ? "+" + S.form : S.form}</b></div>
      <div class="kv"><span>Condition</span><b style="color:${S.condition > 60 ? 'var(--green)' : 'var(--red)'}">${S.condition}%${S.injury ? " \ud83e\ude79 OUT " + S.injury : ""}</b></div>
    </div>
    ${navHTML("home")}
  </div>`;
}

// ---- Injured: sit out the matchday ----
function injuredScreen() {
  setTimeout(() => {
    $("#simout").onclick = () => {
      const ctFx = balCtFixture();
      if (ctFx) { // CT night plays without you
        const Hc = ctFx.ctHome ? myClub() : ctFx.oppClub, Ac = ctFx.ctHome ? ctFx.oppClub : myClub();
        const r = E.simulateMatch(Hc, Ac, { seed: E.hashSeed(S.seed + ":ctout:" + S.season + ":" + (ctFx.ctStage === "group" ? "g" + ctFx.ctMD : "k" + S.ct.koRound)), fast: true });
        let gH = r.gH, gA = r.gA;
        if (ctFx.ctStage === "ko" && gH === gA) { if (Math.random() < 0.5) gH++; else gA++; }
        balCtRecord(ctFx, gH, gA);
        pushNews("\ud83c\udf0d CT night without the injured " + S.name + ": " + gH + "-" + gA + ".");
        S.injury--;
        S.condition = Math.min(100, S.condition + 30);
        S.trainedToday = false;
        save();
        toast(S.injury > 0 ? `Recovering: ${S.injury} more match${S.injury > 1 ? "es" : ""} out` : "\u2705 Fit again!");
        render(homeScreen);
        return;
      }
      const isCup = cupPending();
      if (isCup) { // team plays cup without you
        const oppIdx = cupOpponent();
        const home = Math.random() < 0.5;
        const Hc = home ? myClub() : S.world.clubs[oppIdx];
        const Ac = home ? S.world.clubs[oppIdx] : myClub();
        const r = E.simulateMatch(Hc, Ac, { seed: E.hashSeed(S.seed + ":cupout:" + S.season + S.cup.round), fast: true });
        let my = home ? r.gH : r.gA, op = home ? r.gA : r.gH;
        if (my === op) { if (Math.random() < 0.5) my++; else op++; }
        if (my > op) { S.cup.round++; pushNews(`\ud83c\udfc6 ${myClub().name} advance without the injured ${S.name}.`); if (S.cup.round >= 3) { S.flags.cupWinner = true; S.flags.cupsWon = (S.flags.cupsWon||0)+1; } }
        else { S.cup.alive = false; pushNews(`\ud83d\udc94 Cup exit while ${S.name} watched from the stands.`); }
      } else {
        for (const [h, a] of S.world.fixtures[S.matchday]) {
          const r = E.simulateMatch(S.world.clubs[h], S.world.clubs[a], { seed: E.hashSeed(S.seed + S.season + "mdout" + S.matchday + h + a), fast: true });
          S.results.push({ home: h, away: a, gH: r.gH, gA: r.gA });
          if (h === S.clubIdx || a === S.clubIdx) {
            const my = h === S.clubIdx ? r.gH : r.gA, op = h === S.clubIdx ? r.gA : r.gH;
            S.lastFive.push(my > op ? "W" : my === op ? "D" : "L"); if (S.lastFive.length > 5) S.lastFive.shift();
          }
        }
        S.matchday++;
        balGalaxySim();
      }
      S.injury--;
      S.condition = Math.min(100, S.condition + 30); // rest while out
      S.trainedToday = false;
      save();
      toast(S.injury > 0 ? `Recovering: ${S.injury} more match${S.injury > 1 ? "es" : ""} out` : "\u2705 Fit again!");
      render(homeScreen);
    };
  }, 0);
  return `<div class="screen">${topbar()}
    <div class="panel center">
      <h2>\ud83e\ude79 Injured</h2>
      <p class="sub" style="margin:8px 0">You're out for <b>${S.injury}</b> more match${S.injury > 1 ? "es" : ""}. The team plays on without you.</p>
      <button class="btn" id="simout">Sim Matchday (rest & recover) \u2192</button>
    </div>
    ${navHTML("match")}
  </div>`;
}

// ---- Match preview (head-to-head, honest win chances) ----
function previewScreen() {
  if (S.injury > 0) return injuredScreen();
  ensureRole();
  const ctFx = balCtFixture();
  const isCup = !ctFx && cupPending();
  const fx = ctFx ? ctFx : isCup
    ? (S.clubIdx === 0 || Math.random() < 0.5 ? { home: S.clubIdx, away: cupOpponent(), cup: true } : { home: cupOpponent(), away: S.clubIdx, cup: true })
    : myNextFixture();
  if (fx && isCup) fx.cup = true;
  if (!fx) return homeScreen();
  const capLift = (S.skills || []).includes("Captaincy") ? 0.6 : 0; // must mirror matchScreen exactly
  const H0 = fx.ct ? (fx.ctHome ? myClub() : fx.oppClub) : S.world.clubs[fx.home];
  const A0 = fx.ct ? (fx.ctHome ? fx.oppClub : myClub()) : S.world.clubs[fx.away];
  const meIsHome = fx.ct ? fx.ctHome : fx.home === S.clubIdx;
  const H = meIsHome && capLift ? Object.assign({}, H0, { str: H0.str + capLift }) : H0;
  const A = !meIsHome && capLift ? Object.assign({}, A0, { str: A0.str + capLift }) : A0;
  const probs = E.winProbs(H, A, 600);
  const oppIdx = fx.ct ? -1 : fx.home === S.clubIdx ? fx.away : fx.home;
  const key = "0v" + oppIdx;
  const hist = fx.ct ? [] : (S.world.h2h[key] || []).slice(-5);
  const pills = hist.map(m => {
    const myGoals = m.home === S.clubIdx ? m.gH : m.gA;
    const opGoals = m.home === S.clubIdx ? m.gA : m.gH;
    const cls = myGoals > opGoals ? "W" : myGoals === opGoals ? "D" : "L";
    return `<span class="h2hpill ${cls}" title="${m.gH}-${m.gA}">${cls} ${myGoals}-${opGoals}</span>`;
  }).join("");
  const table = E.computeTable(S.world.clubs, S.results);
  const posOf = (i) => { const r = table.findIndex(t => t.i === i); return r >= 0 ? r + 1 : "—"; };
  const lastFive = S.lastFive.slice(-5).map(r => `<span class="h2hpill ${r}">${r}</span>`).join("") || `<span class="sub">No matches yet</span>`;

  setTimeout(() => {
    document.querySelectorAll(".opt").forEach(o => o.onclick = () => {
      document.querySelectorAll(".opt").forEach(x => x.classList.remove("sel"));
      o.classList.add("sel"); S.role = o.dataset.role; save();
    });
    document.querySelectorAll("[data-pickpos]").forEach(p => p.onclick = () => {
      S.pos = p.dataset.pickpos;
      // Keep playstyle legal for the new position (GK styles vs outfield)
      const styles = E.stylesFor(S.pos) || [];
      if (styles.length && !styles.some(s => s.id === S.playstyle)) {
        S.playstyle = styles[0].id;
        toast("Playstyle set to " + styles[0].label + " (fits " + S.pos + ")");
      }
      // Game plan roles are position-gated too
      const roles = E.rolesFor(S.pos) || {};
      if (!roles[S.role]) {
        S.role = Object.keys(roles)[0] || "balanced";
      }
      save();
      render(previewScreen); // re-render: OVR + odds + plan update
    });
    $("#kickoff").onclick = () => { render(() => matchScreen(fx, probs)); };
  }, 0);

  return `<div class="screen">${topbar()}
    <div class="panel">
      <h2>${fx.ct ? (fx.ctStage === "group" ? "\ud83c\udf0d CHAMPIONS TROPHY \u00b7 Group MD " + (fx.ctMD + 1) + "/6" : "\ud83c\udf0d CHAMPIONS TROPHY \u00b7 " + E.CT_ROUNDS[S.ct.koRound]) : fx.cup ? "\ud83c\udfc6 CUP " + CUP_ROUNDS[S.cup.round] : "Match Preview \u00b7 MD " + (S.matchday + 1)}</h2>
      <div class="vsrow">
        <div class="vsteam">${crest(H)}<div class="tname">${H.name}</div><div class="sub">${fx.ct ? "str " + H.str : posOf(fx.home) + " in league"}</div></div>
        <div class="vsx">VS</div>
        <div class="vsteam">${crest(A)}<div class="tname">${A.name}</div><div class="sub">${fx.ct ? "str " + A.str : posOf(fx.away) + " in league"}</div></div>
      </div>
      <p class="sub center" style="margin-bottom:4px">Win probability (live engine odds — never rigged)</p>
      <div class="probbar">
        <div class="pb-h" style="flex:${probs.home}">${probs.home}%</div>
        <div class="pb-d" style="flex:${probs.draw}">${probs.draw}%</div>
        <div class="pb-a" style="flex:${probs.away}">${probs.away}%</div>
      </div>
      <div class="problabels"><span>${H.short} win</span><span>Draw</span><span>${A.short} win</span></div>
    </div>
    <div class="panel">
      <h2>Head to Head vs ${fx.ct ? fx.oppClub.short : S.world.clubs[oppIdx].short}</h2>
      <div class="h2hrow">${pills || '<span class="sub">First meeting</span>'}</div>
      <div class="kv"><span>Your team form</span><b>${lastFive}</b></div>
      <div class="kv"><span>Venue</span><b>${fx.ct && fx.ctStage === "ko" ? "🌍 Neutral ground" : meIsHome ? "🏟 Home" : "✈️ Away"}</b></div>
      <div class="kv"><span>Team strength</span><b>${H.short} ${H.str} · ${A.short} ${A.str}</b></div>
    </div>
    <div class="panel">
      <h2>Position & Playability <span class="badge gold" style="float:right">OVR ${ovr()}</span></h2>
      <p class="sub" style="margin-bottom:6px">Your rating at each position (honest \u2014 same stats, different weights). Tap to switch for this match.</p>
      <div class="posgrid">
        ${(() => {
          const eff = effStats();
          const isGKnat = S.natPos ? S.natPos === "GK" : S.pos === "GK";
          const list = Object.keys(E.POSITIONS).filter(p => isGKnat ? p === "GK" : p !== "GK");
          const ovrs = list.map(p => ({ p, o: E.calcOVR(eff, p) }));
          const best = Math.max(...ovrs.map(x => x.o));
          return ovrs.map(({ p, o }) => {
            const g = o >= best - 1 ? ["A", "var(--green)"] : o >= best - 4 ? ["B", "#ffd75e"] : o >= best - 8 ? ["C", "#ffaa66"] : ["D", "var(--red)"];
            return `<div class="poscell ${S.pos === p ? "sel" : ""}" data-pickpos="${p}">
              <b>${p}</b><span class="posovr">${o}</span><span class="posgrade" style="color:${g[1]}">${g[0]}</span></div>`;
          }).join("");
        })()}
      </div>
      <p class="sub" style="margin-top:6px">Playing today: <b>${S.pos} \u00b7 ${E.POSITIONS[S.pos].label}</b> \u2014 decisions, involvement and OVR all follow this position.</p>
    </div>
    <div class="panel">
      <h2>Your Game Plan</h2>
      <div class="optrow">
        ${Object.entries(E.rolesFor(S.pos)).map(([id, r]) =>
          `<div class="opt ${S.role === id ? "sel" : ""}" data-role="${id}" style="flex:1 1 45%">${r.label}<br><span class="sub">${r.desc}</span></div>`).join("")}
      </div>
      <button class="btn" id="kickoff">KICK OFF ⚽</button>
    </div>
    ${navHTML("match")}
  </div>`;
}

// ---- Matchday (ticker + 2D big moments) ----
const COMMENT = {
  chanceUs: ["A slick move down the flank!", "They carve an opening through midfield!", "Quick one-two on the edge of the box!"],
  chanceOpp: ["Danger at the other end!", "The opposition break at pace!", "A cross whipped into our box!"],
  save: ["The keeper stands tall and denies it!", "Fingertip save! Corner.", "Straight at the goalkeeper."],
  miss: ["Blazed over the bar!", "Just wide of the post!", "The last touch lets them down."],
  goalUs: ["GOOOOAL! The stadium erupts! 🎉", "IT'S IN! What a finish!", "GOAL! Sensational stuff!"],
  goalOpp: ["They score. Silence in the stands.", "A blow — the opposition strike.", "Goal against the run of play."]
};
function ensureRole() {
  const valid = E.rolesFor(S.pos);
  if (!valid[S.role]) S.role = Object.keys(valid)[0];
}
function matchScreen(fx, displayedProbs) {
  ensureRole();
  const capLift = (S.skills || []).includes("Captaincy") ? 0.6 : 0;
  const H0 = fx.ct ? (fx.ctHome ? myClub() : fx.oppClub) : S.world.clubs[fx.home];
  const A0 = fx.ct ? (fx.ctHome ? fx.oppClub : myClub()) : S.world.clubs[fx.away];
  const isHome = fx.ct ? fx.ctHome : fx.home === S.clubIdx;
  const H = isHome && capLift ? Object.assign({}, H0, { str: H0.str + capLift }) : H0;
  const A = !isHome && capLift ? Object.assign({}, A0, { str: A0.str + capLift }) : A0;
  const seed = E.hashSeed(S.seed + ":s" + S.season + ":md" + S.matchday + (fx.ct ? (fx.ctStage === "group" ? ":ctg" + fx.ctMD : ":ctko" + S.ct.koRound) : ""));
  const isGK = S.pos === "GK";
  const match = E.createMatch(H, A, {
    seed, player: { pos: S.pos, playstyle: S.playstyle, eff: effStats(), skills: S.skills || [] }, playerTeam: isHome ? 0 : 1, role: S.role,
    condition: S.condition, fitLvl: S.upgrades.fitness, medLvl: S.upgrades.medical
  });

  const matchKey = fx.ct ? (fx.ctStage === "group" ? `s${S.season}:ctg${fx.ctMD}` : `s${S.season}:ctko${S.ct.koRound}`)
                 : fx.cup ? `s${S.season}:cup${S.cup.round}` : `s${S.season}:md${S.matchday}`;
  let speed = 1, timer = null, decisionTimer = null;
  let momentActive = false;
  let viewMode = S.viewMode || "ticker"; // "ticker" | "live2d"
  const mstat = { shotsH: 0, shotsA: 0, sotH: 0, sotA: 0 };

  setTimeout(() => {
    // ---- anti-replay: a match is consumed the moment it kicks off ----
    S.playedKeys = S.playedKeys || [];
    if (S.playedKeys.includes(matchKey)) { // back-navigation into an already-played match
      toast("\u26a0\ufe0f That match is already in the books.");
      render(homeScreen); return;
    }
    S.playedKeys.push(matchKey); if (S.playedKeys.length > 60) S.playedKeys.shift();
    S.mdLock = fx.ct ? { key: matchKey, ct: true, ctStage: fx.ctStage, ctMD: fx.ctMD, ctX: fx.ctX, ctY: fx.ctY, ctHome: fx.ctHome, opp: fx.opp, koPre: fx.koPre || null }
              : { key: matchKey, home: fx.home, away: fx.away, cup: !!fx.cup };
    save();
    const tickEl = $("#ticker"), clockEl = $("#clock"), scoreEl = $("#score"), momEl = $("#momfill");
    const decEl = $("#decision");
    const canvas = $("#pitch"), ctx = canvas.getContext("2d");
    canvas.width = 800; canvas.height = 480;

    function addTick(min, text, cls) {
      const d = document.createElement("div");
      d.className = "tick " + (cls || "");
      d.innerHTML = `<span class="m">${min}'</span>${text}`;
      tickEl.prepend(d);
    }
    function rngc(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    function playMoment(ev, done) {
      if (momentActive) { done(); return; } // never stack animations
      momentActive = true;
      canvas.style.display = "block";
      const CW = 800, CH = 480;
      canvas.width = CW; canvas.height = CH;
      const attCol = ev.team === 0 ? H.col1 : A.col1;
      const defCol = ev.team === 0 ? A.col1 : H.col1;
      const youIn = ev.by === "you" || ev.assist === "you" || ev.keypass === "you" || !!ev.gk; // gk events are always YOUR keeper moments
      const outcome = ev.type;

      function ease(t) { return t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2; }
      function easeOutBack(t) { const c = 1.70158; return 1 + (c+1)*Math.pow(t-1,3) + c*Math.pow(t-1,2); }
      function lighten(hex, amt) {
        const n = parseInt(hex.slice(1), 16);
        return `rgb(${Math.min(255,(n>>16)+amt)},${Math.min(255,((n>>8)&255)+amt)},${Math.min(255,(n&255)+amt)})`;
      }

      /* ---- 3D top-down perspective projection ----
         World space: x 0..100 (toward goal), y 0..100 (across pitch), z = height.
         Camera tilted behind attack: far edge compressed & raised. */
      const HORIZON = 74, NEARY = 470, FARY = 96, NEARW = 900, FARW = 420;
      function proj(wx, wy, wz) {
        const d = wx / 100;                       // 0 near .. 1 far (toward goal)
        const sy = NEARY + (FARY - NEARY) * ease0(d);
        const w = NEARW + (FARW - NEARW) * ease0(d);
        const sx = CW / 2 + (wy / 100 - 0.5) * w;
        const scale = 0.55 + (1 - d) * 0.75;      // near objects bigger
        return { x: sx, y: sy - (wz || 0) * scale * 2.2, s: scale, gy: sy };
      }
      function ease0(t) { return 1 - Math.pow(1 - t, 1.35); } // perspective foreshortening

      const crowd = [];
      for (let i = 0; i < 200; i++) crowd.push({ x: Math.random() * CW, y: 8 + Math.random() * (HORIZON - 20), c: Math.random(), ph: Math.random() * 7 });
      let confetti = null;
      let f = 0;

      function drawScene(ballW, actors, keeper) {
        // sky/stand
        const sky = ctx.createLinearGradient(0, 0, 0, HORIZON);
        sky.addColorStop(0, "#0a1220"); sky.addColorStop(1, "#1a2a38");
        ctx.fillStyle = sky; ctx.fillRect(0, 0, CW, HORIZON);
        for (const cd of crowd) {
          const bounce = confetti ? Math.abs(Math.sin(f / 4 + cd.ph)) * 3 : Math.sin(f / 15 + cd.ph);
          ctx.fillStyle = cd.c < .3 ? attCol : cd.c < .45 ? defCol : `hsl(${cd.c * 360},25%,${40 + cd.c * 25}%)`;
          ctx.fillRect(cd.x, cd.y - bounce, 2.6, 2.6);
        }
        ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(0, HORIZON - 4, CW, 6);

        // pitch trapezoid with perspective stripes
        for (let i = 0; i < 9; i++) {
          const d0 = i / 9, d1 = (i + 1) / 9;
          const p00 = proj(d0 * 100, 0, 0), p01 = proj(d0 * 100, 100, 0);
          const p10 = proj(d1 * 100, 0, 0), p11 = proj(d1 * 100, 100, 0);
          ctx.fillStyle = i % 2 ? "#0e6a30" : "#13883d";
          ctx.beginPath();
          ctx.moveTo(p00.x, p00.gy); ctx.lineTo(p01.x, p01.gy);
          ctx.lineTo(p11.x, p11.gy); ctx.lineTo(p10.x, p10.gy);
          ctx.closePath(); ctx.fill();
        }
        // side vignette
        const vg = ctx.createLinearGradient(0, HORIZON, 0, CH);
        vg.addColorStop(0, "rgba(0,0,0,.30)"); vg.addColorStop(.4, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,.22)");
        ctx.fillStyle = vg; ctx.fillRect(0, HORIZON, CW, CH - HORIZON);

        // markings in world space
        ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = 2; ctx.lineJoin = "round";
        function line(x1, y1, x2, y2) {
          const a = proj(x1, y1, 0), b = proj(x2, y2, 0);
          ctx.beginPath(); ctx.moveTo(a.x, a.gy); ctx.lineTo(b.x, b.gy); ctx.stroke();
        }
        line(0, 2, 0, 98); line(0, 2, 100, 2); line(0, 98, 100, 98); line(100, 2, 100, 98);
        line(78, 22, 100, 22); line(78, 78, 100, 78); line(78, 22, 78, 78);   // box
        line(91, 36, 100, 36); line(91, 64, 100, 64); line(91, 36, 91, 64);   // 6-yard
        // penalty arc
        ctx.beginPath();
        for (let t = 0; t <= 20; t++) {
          const ang = Math.PI * (0.62 + 0.76 * t / 20);
          const p = proj(83 + Math.cos(ang) * -9, 50 + Math.sin(ang) * 16, 0);
          t === 0 ? ctx.moveTo(p.x, p.gy) : ctx.lineTo(p.x, p.gy);
        }
        ctx.stroke();
        const spot = proj(88, 50, 0);
        ctx.beginPath(); ctx.arc(spot.x, spot.gy, 3, 0, 7); ctx.fillStyle = "rgba(255,255,255,.8)"; ctx.fill();

        // GOAL: 3D frame at far end
        const gl = proj(100, 38, 0), gr = proj(100, 62, 0);
        const barH = 34;
        ctx.lineWidth = 4; ctx.strokeStyle = "#f2f2f2";
        ctx.beginPath();
        ctx.moveTo(gl.x, gl.gy); ctx.lineTo(gl.x, gl.gy - barH);
        ctx.lineTo(gr.x, gr.gy - barH); ctx.lineTo(gr.x, gr.gy);
        ctx.stroke();
        // net
        ctx.lineWidth = 1; ctx.strokeStyle = "rgba(255,255,255,.35)";
        const ripple = (outcome === "goal" && f > IMPACT) ? (f - IMPACT) : 0;
        for (let i = 1; i < 7; i++) {
          const nx = gl.x + (gr.x - gl.x) * i / 7 + (ripple ? Math.sin(ripple / 2 + i) * 2 : 0);
          ctx.beginPath(); ctx.moveTo(nx, gl.gy - barH + 2); ctx.lineTo(nx + 4, gl.gy - 2); ctx.stroke();
        }
        for (let j = 1; j < 4; j++) {
          const ny = gl.gy - barH + barH * j / 4;
          ctx.beginPath(); ctx.moveTo(gl.x + 1, ny); ctx.lineTo(gr.x - 1, ny + 3); ctx.stroke();
        }

        // depth-sort actors + keeper + ball, draw far-to-near
        const drawables = actors.map(ac => ({ ...ac, p: proj(ac.wx, ac.wy, 0) }));
        drawables.push({ ...keeper, p: proj(keeper.wx, keeper.wy, 0), isGK: true });
        drawables.sort((m, n) => m.p.gy - n.p.gy);
        const bp = proj(ballW.x, ballW.y, ballW.z || 0);
        let ballDrawn = false;
        for (const dbl of drawables) {
          if (!ballDrawn && bp.gy < dbl.p.gy) { drawBall3d(bp); ballDrawn = true; }
          drawFigure(dbl);
        }
        if (!ballDrawn) drawBall3d(bp);
      }

      function drawFigure(d) {
        const { x } = d.p, sc = d.p.s;
        const gy = d.p.gy - (d.jump || 0) * 6 * sc;
        const bodyH = 26 * sc, headR = 5.5 * sc;
        // shadow
        ctx.beginPath(); ctx.ellipse(x, gy + 2, 10 * sc, 3.5 * sc, 0, 0, 7);
        ctx.fillStyle = "rgba(0,0,0,.42)"; ctx.fill();
        // legs: run cycle, or slide-tackle pose (both legs extended toward the ball)
        ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 3 * sc; ctx.lineCap = "round";
        if (d.slide) {
          ctx.beginPath(); ctx.moveTo(x, gy - bodyH * .30); ctx.lineTo(x + d.slide * 14 * sc, gy + 1); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x, gy - bodyH * .34); ctx.lineTo(x + d.slide * 10 * sc, gy - 3 * sc); ctx.stroke();
        } else {
          const swing = Math.sin(f / 3.2 + (d.ph || 0)) * 5 * sc;
          ctx.beginPath(); ctx.moveTo(x, gy - bodyH * .38); ctx.lineTo(x - 3 * sc + swing, gy); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x, gy - bodyH * .38); ctx.lineTo(x + 3 * sc - swing, gy); ctx.stroke();
        }
        // torso
        const col = d.isGK ? "#e8b820" : d.col;
        const tg = ctx.createLinearGradient(x - 6 * sc, gy - bodyH, x + 6 * sc, gy - bodyH * .3);
        tg.addColorStop(0, lighten(col, 55)); tg.addColorStop(1, col);
        ctx.fillStyle = tg;
        ctx.beginPath();
        ctx.roundRect(x - 6 * sc, gy - bodyH, 12 * sc, bodyH * .62, 4 * sc);
        ctx.fill();
        if (d.ring) { ctx.lineWidth = 2; ctx.strokeStyle = "#f2c94c"; ctx.stroke(); }
        // arms (dive pose for GK on save)
        if (d.dive) {
          ctx.strokeStyle = col; ctx.lineWidth = 3.4 * sc;
          ctx.beginPath(); ctx.moveTo(x, gy - bodyH * .8); ctx.lineTo(x + d.dive * 16 * sc, gy - bodyH * 1.05); ctx.stroke();
        }
        // head
        ctx.beginPath(); ctx.arc(x, gy - bodyH - headR * .3, headR, 0, 7);
        ctx.fillStyle = "#c8956c"; ctx.fill();
      }
      const ballTrail = [];
      const t0 = performance.now();
      let finished = false;
      function finishMoment() {
        if (finished) return;
        finished = true;
        momentActive = false;
        canvas.style.display = "none";
        if (viewMode === "live2d" && !live.raf) { live.last = 0; live.raf = requestAnimationFrame(drawLive); }
        done();
      }
      function drawBall3d(bp) {
        for (let i = 0; i < ballTrail.length; i++) {
          const a = (i + 1) / ballTrail.length;
          ctx.beginPath(); ctx.arc(ballTrail[i].x, ballTrail[i].y, (2 + a * 3) * bp.s, 0, 7);
          ctx.fillStyle = `rgba(255,255,255,${a * .3})`; ctx.fill();
        }
        ctx.beginPath(); ctx.ellipse(bp.x, bp.gy + 2, 5 * bp.s, 2 * bp.s, 0, 0, 7);
        ctx.fillStyle = "rgba(0,0,0,.4)"; ctx.fill();
        const rg = ctx.createRadialGradient(bp.x - 2, bp.y - 2, 1, bp.x, bp.y, 6 * bp.s);
        rg.addColorStop(0, "#fff"); rg.addColorStop(1, "#c4c4c4");
        ctx.beginPath(); ctx.arc(bp.x, bp.y, 5.5 * bp.s, 0, 7); ctx.fillStyle = rg; ctx.fill();
        ballTrail.push({ x: bp.x, y: bp.y }); if (ballTrail.length > 10) ballTrail.shift();
      }

      // ---- choreography in world coords (variant-aware) ----
      const side = Math.random() < .5 ? -1 : 1;
      const SCEN_VARIANT = { header: "header", cross: "header", rebound: "rebound", counter: "counter",
                             solo: "solo", oneonone: "solo", longshot: "longshot", edge: "longshot",
                             gk1v1: "gk1v1", gkcross: "gkclaim", gkfree: "header", gkback: "gk1v1" };
      const variant = ev.via === "penalty" ? "penalty"
        : ev.via === "freekick" ? "freekick"
        : ev.type === "tackle" ? "tackle"
        : (ev.gk && SCEN_VARIANT[ev.scen]) ? SCEN_VARIANT[ev.scen]
        : ev.gk ? "gkreflex"
        : SCEN_VARIANT[ev.scen] || "openplay";
      let shotW;
      if (outcome === "goal") shotW = { x: 100, y: 50 + side * 9 };
      else if (outcome === "save") shotW = { x: 97, y: 50 + side * 5 };
      else if (outcome === "tackle") shotW = { x: 58, y: 50 - side * 22 };
      else shotW = { x: 104, y: 50 + side * 17 };
      let segs, curve = 0;
      const fkSpot = { x: 70, y: 50 + side * 16 };
      const penSpot = { x: 88, y: 50 };
      if (variant === "penalty") {
        const slow = ev.choice === "panenka";
        if (slow) shotW = { x: outcome === "goal" ? 100 : 97, y: 50 };
        segs = [
          { a: penSpot, b: penSpot, t0: 0, t1: 66, hold: true },
          { a: penSpot, b: shotW, t0: 66, t1: slow ? 100 : (ev.choice === "blast" ? 76 : 84), z: slow ? 16 : 3 }
        ];
      } else if (variant === "freekick") {
        curve = (ev.choice === "power") ? side * 3 : side * 11;
        segs = [
          { a: fkSpot, b: fkSpot, t0: 0, t1: 60, hold: true },
          { a: fkSpot, b: shotW, t0: 60, t1: 92, z: ev.choice === "cross" ? 13 : 9 }
        ];
      } else if (variant === "header") {
        // cross from the wing, met in the air at the far post
        const wing = { x: 62, y: side > 0 ? 88 : 12 };
        const met = { x: 90, y: 50 + side * 4 };
        segs = [
          { a: { x: 30, y: wing.y - side * 10 }, b: wing, t0: 6, t1: 34 },
          { a: wing, b: met, t0: 44, t1: 74, z: 15 },
          { a: met, b: shotW, t0: 78, t1: 94, z: 9 }
        ];
      } else if (variant === "counter") {
        // long clearance, sprint through the middle, early strike
        segs = [
          { a: { x: 8, y: 50 - side * 20 }, b: { x: 46, y: 44 + side * 14 }, t0: 4, t1: 30, z: 14 },
          { a: { x: 46, y: 44 + side * 14 }, b: { x: 76, y: 50 - side * 6 }, t0: 36, t1: 66 },
          { a: { x: 76, y: 50 - side * 6 }, b: shotW, t0: 76, t1: 92 }
        ];
      } else if (variant === "solo") {
        // dribbler weaves through — zig-zag carry, then finish
        segs = [
          { a: { x: 40, y: 50 + side * 24 }, b: { x: 58, y: 50 - side * 8 }, t0: 6, t1: 34 },
          { a: { x: 58, y: 50 - side * 8 }, b: { x: 74, y: 50 + side * 10 }, t0: 36, t1: 62 },
          { a: { x: 74, y: 50 + side * 10 }, b: { x: 84, y: 50 - side * 2 }, t0: 64, t1: 84 },
          { a: { x: 84, y: 50 - side * 2 }, b: shotW, t0: 92, t1: 106 }
        ];
      } else if (variant === "rebound") {
        // first shot parried, poacher pounces
        const spill = { x: 90, y: 50 + side * 12 };
        segs = [
          { a: { x: 55, y: 42 }, b: { x: 72, y: 50 - side * 8 }, t0: 6, t1: 30 },
          { a: { x: 72, y: 50 - side * 8 }, b: { x: 97, y: 50 - side * 4 }, t0: 38, t1: 56 },
          { a: { x: 97, y: 50 - side * 4 }, b: spill, t0: 56, t1: 70, z: 5 },
          { a: spill, b: shotW, t0: 80, t1: 92 }
        ];
      } else if (variant === "longshot") {
        // struck from distance — long dipping flight
        const spot = { x: 68, y: 50 + side * 8 };
        segs = [
          { a: { x: 40, y: 50 - side * 16 }, b: spot, t0: 8, t1: 40 },
          { a: spot, b: shotW, t0: 56, t1: 96, z: 14 }
        ];
      } else if (variant === "gk1v1") {
        // striker bearing down on YOUR goal — keeper rushes or stands
        segs = [
          { a: { x: 30, y: 50 + side * 18 }, b: { x: 62, y: 50 + side * 6 }, t0: 6, t1: 36 },
          { a: { x: 62, y: 50 + side * 6 }, b: { x: 82, y: 50 }, t0: 40, t1: 70 },
          { a: { x: 82, y: 50 }, b: shotW, t0: 80, t1: 96 }
        ];
      } else if (variant === "gkclaim") {
        // high cross into YOUR box — keeper attacks the ball
        const wing = { x: 70, y: side > 0 ? 86 : 14 };
        segs = [
          { a: { x: 44, y: wing.y - side * 8 }, b: wing, t0: 6, t1: 32 },
          { a: wing, b: { x: 94, y: 50 + side * 5 }, t0: 42, t1: 84, z: 17 }
        ];
      } else if (variant === "gkreflex") {
        // scramble: deflected strike from close range
        segs = [
          { a: { x: 60, y: 50 - side * 14 }, b: { x: 80, y: 50 + side * 10 }, t0: 8, t1: 34 },
          { a: { x: 80, y: 50 + side * 10 }, b: { x: 86, y: 50 - side * 6 }, t0: 40, t1: 54 },
          { a: { x: 86, y: 50 - side * 6 }, b: shotW, t0: 62, t1: 76 }
        ];
      } else if (variant === "tackle") {
        // attacker surges, YOUR defender times the challenge — ball breaks clear
        segs = [
          { a: { x: 34, y: 50 + side * 16 }, b: { x: 58, y: 50 + side * 6 }, t0: 6, t1: 38 },
          { a: { x: 58, y: 50 + side * 6 }, b: { x: 74, y: 50 }, t0: 44, t1: 72 },
          { a: { x: 74, y: 50 }, b: { x: 58, y: 50 - side * 22 }, t0: 76, t1: 100, z: 8 }
        ];
      } else {
        const W1 = { x: 18, y: 30 }, W2 = { x: 42, y: 72 }, W3 = { x: 68, y: 38 };
        segs = [
          { a: W1, b: W2, t0: 8,  t1: 40 },
          { a: W2, b: W3, t0: 50, t1: 80 },
          { a: W3, b: shotW, t0: 96, t1: 114 }
        ];
      }
      const IMPACT = segs[segs.length - 1].t1;
      const TOTAL = outcome === "goal" ? IMPACT + 80 : IMPACT + 36;
      let deflectW = null;
      // FAILSAFE: the moment ALWAYS completes on wall-clock time, even if rAF stalls or a draw throws
      const failsafe = setTimeout(finishMoment, TOTAL * 17 + 1500);

      function ballWorld() {
        for (const sg of segs) {
          if (f >= sg.t0 && f <= sg.t1) {
            if (sg.hold) return { x: sg.a.x, y: sg.a.y, z: 0 };
            const t = ease((f - sg.t0) / (sg.t1 - sg.t0));
            const isShot = sg === segs[segs.length - 1];
            const zmax = sg.z != null ? sg.z : (isShot ? 6 : 10);
            let y = sg.a.y + (sg.b.y - sg.a.y) * t;
            if (isShot && curve) y += Math.sin(t * Math.PI) * curve;
            return { x: sg.a.x + (sg.b.x - sg.a.x) * t, y, z: Math.sin(t * Math.PI) * zmax };
          }
        }
        if (f < segs[0].t0) return { x: segs[0].a.x, y: segs[0].a.y, z: 0 };
        for (let i = 1; i < segs.length; i++) if (f < segs[i].t0) return { x: segs[i].a.x + Math.sin(f) * .4, y: segs[i].a.y, z: 0 };
        if (outcome === "tackle") return { x: 58 - (f - IMPACT) * .3, y: shotW.y, z: 0 };
        if (outcome === "goal") return { x: 101, y: shotW.y, z: 3 };
        if (outcome === "save") {
          if (!deflectW) deflectW = { x: 84, y: shotW.y + side * 26 };
          const t = Math.min(1, (f - IMPACT) / 24);
          return { x: shotW.x + (deflectW.x - shotW.x) * t, y: shotW.y + (deflectW.y - shotW.y) * t, z: Math.sin(t * Math.PI) * 8 };
        }
        return { x: Math.min(112, shotW.x + (f - IMPACT) * .5), y: shotW.y + side * (f - IMPACT) * .3, z: 0 };
      }

      function cast(bw, prog) {
        let actors = [];
        let keeper = { wx: 98.5, wy: 50 + Math.max(-9, Math.min(9, (bw.y - 50) * .5)), col: "#e8b820", ph: 6 };
        if (variant === "penalty") {
          // taker walks up, stops, strikes; everyone else frozen on box edge
          const runT = Math.max(0, Math.min(1, (f - 46) / 20));
          actors = [
            { wx: 80 + runT * 6.5, wy: 50, col: attCol, ph: 0, ring: youIn },
            { wx: 77, wy: 32, col: attCol, ph: 2 },
            { wx: 77, wy: 68, col: attCol, ph: 3 },
            { wx: 76.5, wy: 42, col: defCol, ph: 1 },
            { wx: 76.5, wy: 58, col: defCol, ph: 4 }
          ];
          keeper.wy = 50 + Math.sin(f / 5) * 2.5; // sway on the line
          if (f >= IMPACT - 5) {
            keeper.dive = outcome === "goal" ? -side : side; // wrong way on goals
            keeper.wy = 50 + (outcome === "goal" ? -side : side) * 6 * Math.min(1, (f - (IMPACT - 5)) / 6);
          }
        } else if (variant === "freekick") {
          // wall of three jumps at impact; taker runs in; runners attack the box
          const jump = f >= IMPACT - 3 && f <= IMPACT + 6 ? 2.2 : 0;
          const runT = Math.max(0, Math.min(1, (f - 42) / 18));
          const wallY = 50 + side * 9;
          actors = [
            { wx: fkSpot.x - 4 + runT * 3.6, wy: fkSpot.y + 2 - runT * 2, col: attCol, ph: 0, ring: youIn },
            { wx: 84 + prog * 5, wy: 36 + prog * 6, col: attCol, ph: 2 },
            { wx: 84 + prog * 5, wy: 64 - prog * 6, col: attCol, ph: 3 },
            { wx: 79, wy: wallY - 4, col: defCol, ph: 1, jump },
            { wx: 79, wy: wallY, col: defCol, ph: 1, jump },
            { wx: 79, wy: wallY + 4, col: defCol, ph: 1, jump }
          ];
          if (outcome === "save" && f >= IMPACT - 6) { keeper.dive = side; keeper.wy = 50 + side * 5 * Math.min(1, (f - (IMPACT - 6)) / 6); }
        } else if (variant === "header") {
          const jumpT = f >= segs[segs.length - 1].t0 - 4 && f <= segs[segs.length - 1].t0 + 8 ? 3.0 : 0;
          actors = [
            { wx: 62, wy: side > 0 ? 86 : 14, col: attCol, ph: 0 },                             // crosser
            { wx: 84 + prog * 5, wy: 50 + side * 4, col: attCol, ph: 2, jump: jumpT, ring: youIn }, // header man attacks it
            { wx: 82 + prog * 4, wy: 50 - side * 10, col: attCol, ph: 3 },
            { wx: 86, wy: 50 + side * 9, col: defCol, ph: 1, jump: jumpT * 0.7 },               // marker challenges
            { wx: 80, wy: 50 - side * 4, col: defCol, ph: 4 }
          ];
          if (outcome === "save" && f >= IMPACT - 6) { keeper.dive = side; keeper.wy = 50 + side * 5 * Math.min(1, (f - (IMPACT - 6)) / 6); }
        } else if (variant === "counter") {
          actors = [
            { wx: 8 + prog * 70, wy: 50 - side * 6 + Math.sin(f / 6) * 2, col: attCol, ph: 0, ring: youIn },  // sprinter with the ball
            { wx: 4 + prog * 62, wy: 50 + side * 16, col: attCol, ph: 2 },                                    // support runner
            { wx: 30 - prog * 14, wy: 50 + side * 4, col: defCol, ph: 1 },                                    // chasing back
            { wx: 44 - prog * 10, wy: 50 - side * 12, col: defCol, ph: 3 },
            { wx: 70, wy: 50 + side * 8, col: defCol, ph: 5 }
          ];
          if (outcome === "save" && f >= IMPACT - 8) { keeper.dive = side; keeper.wy = 50 + side * 5 * Math.min(1, (f - (IMPACT - 8)) / 6); }
        } else if (variant === "solo") {
          const weave = Math.sin(f / 5) * 3;
          actors = [
            { wx: 40 + prog * 46, wy: 50 + weave, col: attCol, ph: 0, ring: youIn },   // the dribbler
            { wx: 56, wy: 50 - side * 10, col: defCol, ph: 1 },                        // beaten man 1
            { wx: 70, wy: 50 + side * 12, col: defCol, ph: 3 },                        // beaten man 2
            { wx: 82, wy: 50 - side * 4, col: defCol, ph: 5 },                         // last defender lunges
            { wx: 36 + prog * 30, wy: 50 + side * 20, col: attCol, ph: 2 }
          ];
          if (outcome === "save" && f >= IMPACT - 8) { keeper.dive = side; keeper.wy = 50 + side * 5 * Math.min(1, (f - (IMPACT - 8)) / 6); }
        } else if (variant === "rebound") {
          const pounceT = Math.max(0, Math.min(1, (f - 62) / 24));
          actors = [
            { wx: 72, wy: 50 - side * 8, col: attCol, ph: 0 },                                  // first shooter
            { wx: 80 + pounceT * 10, wy: 50 + side * (12 - pounceT * 4), col: attCol, ph: 2, ring: youIn }, // poacher pounces
            { wx: 84, wy: 50 - side * 12, col: defCol, ph: 1 },
            { wx: 78, wy: 50 + side * 2, col: defCol, ph: 3 }
          ];
          if (f >= 52 && f <= 66) keeper.dive = -side;   // parry the first shot
          if (outcome === "save" && f >= IMPACT - 5) { keeper.dive = side; }
        } else if (variant === "longshot") {
          actors = [
            { wx: 68, wy: 50 + side * 8, col: attCol, ph: 0, ring: youIn },  // striker from range
            { wx: 74, wy: 50 - side * 14, col: attCol, ph: 2 },
            { wx: 74, wy: 50 + side * 2, col: defCol, ph: 1 },               // closing down late
            { wx: 80, wy: 50 - side * 6, col: defCol, ph: 3 }
          ];
          if (outcome !== "miss" && f >= IMPACT - 10) { keeper.dive = outcome === "goal" ? -side : side; keeper.wy = 50 + (outcome === "goal" ? -side : side) * 6 * Math.min(1, (f - (IMPACT - 10)) / 8); }
        } else if (variant === "gk1v1") {
          // YOU are the keeper: striker in att colours bears down, keeper (ringed) rushes or stands
          const rushT = ev.choice === "rush" ? Math.max(0, Math.min(1, (f - 60) / 24)) : 0;
          keeper = { wx: 98.5 - rushT * 13, wy: 50 + (bw.y - 50) * 0.5, col: "#e8b820", ph: 6, ring: youIn };
          actors = [
            { wx: 30 + prog * 54, wy: 50 + side * (18 - prog * 16), col: attCol, ph: 0 },  // striker clean through
            { wx: 22 + prog * 44, wy: 50 - side * 12, col: defCol, ph: 1 },                // defender chasing
            { wx: 26 + prog * 40, wy: 50 + side * 26, col: defCol, ph: 3 }
          ];
          if (f >= IMPACT - 6) keeper.dive = outcome === "goal" ? -side : side;
        } else if (variant === "gkclaim") {
          // YOU are the keeper: come for the cross through traffic
          const claimT = Math.max(0, Math.min(1, (f - 56) / 22));
          keeper = { wx: 98.5 - claimT * 6, wy: 50 + side * 5 * claimT, col: "#e8b820", ph: 6, ring: youIn,
                     jump: f >= IMPACT - 6 && f <= IMPACT + 6 ? 3.2 : 0 };
          actors = [
            { wx: 70, wy: side > 0 ? 86 : 14, col: attCol, ph: 0 },                          // crosser
            { wx: 90, wy: 50 + side * 7, col: attCol, ph: 2, jump: f >= IMPACT - 4 && f <= IMPACT + 5 ? 2.4 : 0 }, // target man
            { wx: 92, wy: 50 - side * 6, col: defCol, ph: 1 },
            { wx: 87, wy: 50 + side * 1, col: defCol, ph: 3 }
          ];
        } else if (variant === "gkreflex") {
          // YOU are the keeper: point-blank reaction stop
          keeper = { wx: 98.5, wy: 50 + (bw.y - 50) * 0.6, col: "#e8b820", ph: 6, ring: youIn };
          actors = [
            { wx: 80, wy: 50 + side * 10, col: attCol, ph: 0 },
            { wx: 86, wy: 50 - side * 6, col: attCol, ph: 2 },
            { wx: 88, wy: 50 + side * 3, col: defCol, ph: 1 },
            { wx: 84, wy: 50 - side * 12, col: defCol, ph: 3 }
          ];
          if (f >= IMPACT - 4) keeper.dive = outcome === "goal" ? -side : side;  // pure reflex, late dive
        } else if (variant === "tackle") {
          // YOUR defender (ringed, def colours=our att side here) times the challenge
          const slideT = Math.max(0, Math.min(1, (f - 62) / 14));
          actors = [
            { wx: 34 + prog * 40, wy: 50 + side * (16 - prog * 14), col: defCol, ph: 0 },              // runner (opposition)
            { wx: 66 + slideT * 8, wy: 50 + side * 8 - slideT * side * 8, col: attCol, ph: 2, ring: youIn, slide: slideT > 0 ? side : 0 }, // YOU sliding in
            { wx: 50 + prog * 16, wy: 50 - side * 14, col: defCol, ph: 1 },
            { wx: 40 + prog * 20, wy: 50 + side * 26, col: attCol, ph: 3 }
          ];
        } else {
          actors = [
            { wx: 18 + prog * 30, wy: 30 + Math.sin(f / 9) * 2, col: attCol, ph: 0, ring: youIn && f < segs[0].t1 },
            { wx: 42 + prog * 26, wy: 72 + Math.sin(f / 8 + 2) * 2, col: attCol, ph: 2, ring: youIn && f >= segs[0].t1 && f < segs[1].t1 },
            { wx: 68 + prog * 22, wy: 38 + Math.sin(f / 7 + 4) * 2, col: attCol, ph: 4, ring: youIn && f >= segs[1].t1 },
            { wx: 62 - prog * 6, wy: 26 + prog * 10, col: defCol, ph: 1 },
            { wx: 70 - prog * 4, wy: 66 - prog * 8, col: defCol, ph: 3 },
            { wx: 80 - prog * 3, wy: 46 + Math.sin(f / 10) * 4, col: defCol, ph: 5 }
          ];
          if (outcome === "save" && f >= IMPACT - 8) { keeper.dive = side; keeper.wy = 50 + side * 5 * Math.min(1, (f - (IMPACT - 8)) / 6); }
        }
        return { actors, keeper };
      }

      function frame() {
        if (finished) return;
        try {
        f = Math.min(TOTAL, (performance.now() - t0) / 16.7);
        const prog = Math.min(1, f / IMPACT);
        const bw = ballWorld();

        ctx.save();
        if (outcome === "goal" && f > IMPACT && f < IMPACT + 14) {
          ctx.translate((Math.random() - .5) * 8, (Math.random() - .5) * 8);
        }
        const acast = cast(bw, prog);
        const actors = acast.actors, keeper = acast.keeper;

        drawScene(bw, actors, keeper);

        // confetti
        if (outcome === "goal" && f > IMPACT && !confetti) {
          confetti = [];
          for (let i = 0; i < 90; i++) confetti.push({
            x: CW / 2 + (Math.random() - .5) * 320, y: -10 - Math.random() * 50,
            vy: 2 + Math.random() * 3, vx: (Math.random() - .5) * 2,
            c: `hsl(${Math.random() * 360},90%,60%)`, r: 2 + Math.random() * 3, sp: Math.random() * 7
          });
        }
        if (confetti) for (const cf of confetti) {
          cf.y += cf.vy; cf.x += cf.vx + Math.sin(f / 6 + cf.sp) * 1.2;
          ctx.fillStyle = cf.c;
          ctx.fillRect(cf.x, cf.y, cf.r, cf.r * (0.6 + Math.abs(Math.sin(f / 5 + cf.sp)) * 0.8));
        }
        // outcome text
        if (f > IMPACT + 4) {
          const t = Math.min(1, (f - IMPACT - 4) / 14);
          const sc = easeOutBack(t);
          ctx.save();
          ctx.translate(CW / 2, CH / 2 - 40);
          ctx.scale(sc, sc);
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          if (outcome === "goal") {
            ctx.font = "900 92px system-ui, sans-serif";
            ctx.lineWidth = 10; ctx.strokeStyle = "rgba(0,0,0,.55)";
            ctx.strokeText("GOAL!", 0, 0);
            ctx.fillStyle = "#f2c94c"; ctx.fillText("GOAL!", 0, 0);
          } else {
            ctx.font = "900 54px system-ui, sans-serif";
            ctx.lineWidth = 7; ctx.strokeStyle = "rgba(0,0,0,.5)";
            const word = outcome === "tackle" ? "WON IT!" : outcome === "save" ? "SAVED!" : "WIDE!";
            ctx.strokeText(word, 0, 0);
            ctx.fillStyle = "#ffffff"; ctx.fillText(word, 0, 0);
          }
          ctx.restore();
        }
        ctx.restore();
        } catch (e) { clearTimeout(failsafe); finishMoment(); return; }

        if (f < TOTAL) requestAnimationFrame(frame);
        else { clearTimeout(failsafe); setTimeout(finishMoment, outcome === "goal" ? 500 : 250); }
      }
      frame();
    }

    function updateMstat(ev) {
      const evUs = (ev.team === 0) === isHome;
      if (ev.type === "goal") { evUs ? Snd.goalUs() : Snd.goalThem(); }
      else if (ev.type === "save") Snd.save();
      else if (ev.type === "setpiece") Snd.chance();
      if (!["goal", "save", "miss"].includes(ev.type)) return;
      if (ev.team === 0) { mstat.shotsH++; if (ev.type !== "miss") mstat.sotH++; }
      else { mstat.shotsA++; if (ev.type !== "miss") mstat.sotA++; }
      renderMstats();
    }
    function renderMstats() {
      const el = $("#mstats");
      if (!el) return;
      const st = match.state;
      const momH = Math.round(st.momentum), momA = 100 - momH;
      const stamPct = Math.round(st.stamina);
      const myLine = isGK
        ? `${st.pSaves} saves \u00b7 ${st.pTackles || 0} claims`
        : `${st.pGoals}G ${st.pAssists}A \u00b7 ${st.pShots} shots`;
      el.innerHTML = `
        <div class="mstat-row"><span>${mstat.shotsH}</span><span class="mstat-label">Shots</span><span>${mstat.shotsA}</span></div>
        <div class="mstat-row"><span>${mstat.sotH}</span><span class="mstat-label">On target</span><span>${mstat.sotA}</span></div>
        <div class="mstat-row"><span>${momH}%</span><span class="mstat-label">Momentum</span><span>${momA}%</span></div>
        <div class="mstat-row"><span>${st.cards.h}</span><span class="mstat-label">\ud83d\udfe8 Cards</span><span>${st.cards.a}</span></div>
        <div class="mstat-you">
          <span><b>${S.name.split(" ").pop()}</b> \u00b7 ${myLine}</span>
          <span>\u2b50 ${st.rating.toFixed(1)}</span>
        </div>
        <div class="sparkwrap"><span class="mstat-label">last 10'</span><svg class="spark" viewBox="0 0 100 22" preserveAspectRatio="none">${(() => {
          const h = atk.momHist.slice(-30);
          if (h.length < 2) return "";
          const pts = h.map((m, i) => `${(i / (h.length - 1)) * 100},${22 - (isHome ? m : 100 - m) * 0.2 - 1}`).join(" ");
          return `<polyline points="${pts}" fill="none" stroke="var(--gold)" stroke-width="1.6"/><line x1="0" y1="11" x2="100" y2="11" stroke="rgba(255,255,255,.25)" stroke-width="0.6" stroke-dasharray="3 3"/>`;
        })()}</svg></div>
        <div class="stambar"><div class="stamfill" style="width:${stamPct}%;background:${stamPct > 55 ? "var(--green)" : stamPct > 30 ? "var(--gold)" : "var(--red)"}"></div></div>
        <div class="momlabels"><span>stamina ${stamPct}%${st.playerOut ? (st.subbed ? " \ud83d\udd01 SUBBED OFF" : " \ud83e\ude79 OFF INJURED") : ""}</span><span>rating</span></div>`;
    }
    // ---- 2D live view: full 11v11 ambient simulation view ----
    const live = { players: [], ball: { x: 50, y: 50 }, carrier: null, pass_: null, dwell: 400,
                   possHome: true, seq: null, seqPoss: true, script: null, flash: null, raf: null, last: 0,
                   replay: null };
    // ---- attack-state tracker (live-score style): who is pressing, and how hard ----
    const atk = { state: "BUILD-UP", team: 0, heat: 0, momHist: [] };
    function updateAtkState(evts) {
      const mom = match.state.momentum; // 0-100, high = home pressing
      const domHome = mom >= 50;
      atk.team = domHome ? 0 : 1;
      const dom = domHome ? mom : 100 - mom;
      for (const ev of (evts || [])) {
        if (["goal", "save", "miss", "setpiece"].includes(ev.type)) atk.heat = 3; // real chance just happened
      }
      if (atk.heat > 0) atk.heat -= 0.05;
      atk.state = dom >= 74 || atk.heat > 1.5 ? "DANGEROUS ATTACK" : dom >= 60 ? "ATTACKING" : dom >= 53 ? "BUILD-UP" : "MIDFIELD BATTLE";
    }
    function atkLabel() {
      const T = atk.team === 0 ? H.short : A.short;
      return { txt: T + " \u00b7 " + atk.state, danger: atk.state === "DANGEROUS ATTACK", attacking: atk.state !== "MIDFIELD BATTLE", dirRight: atk.team === 0 };
    }
    function initLive() {
      live.players = [];
      const form = [[4,50],[18,20],[16,40],[16,60],[18,80],[36,30],[34,50],[36,70],[56,22],[58,50],[56,78]];
      const YOU_SLOT = { GK: 0, CB: 3, LB: 2, RB: 4, DMF: 6, CMF: 6, AMF: 6, LWF: 8, RWF: 10, SS: 9, CF: 9 };
      const youTeam = isHome ? 0 : 1, youIdx = YOU_SLOT[S.pos] != null ? YOU_SLOT[S.pos] : 9;
      for (let t = 0; t < 2; t++) for (let i = 0; i < 11; i++) {
        const [fx, fy] = form[i];
        const hx = t === 0 ? fx : 100 - fx;
        live.players.push({ team: t, gk: i === 0, hx, hy: fy, x: hx, y: fy, you: t === youTeam && i === youIdx });
      }
      live.possHome = true; live.carrier = null; live.pass_ = null; live.seq = null;
      live.ball.x = 50; live.ball.y = 50;
    }
    function nearestPlayer(homeTeam, pt, allowGK) {
      let best = null, bd = 1e9;
      for (const p of live.players) {
        if (p.team !== (homeTeam ? 0 : 1)) continue;
        if (p.gk && !allowGK) continue;
        const d = (p.x - pt.x) ** 2 + (p.y - pt.y) ** 2;
        if (d < bd) { bd = d; best = p; }
      }
      return best;
    }
    function drawLive(now) {
      if (viewMode !== "live2d" || momentActive) { live.raf = null; return; }
      const c2 = $("#live2d");
      if (!c2) { live.raf = null; return; }
      const g = c2.getContext("2d");
      const W = c2.width, Hh = c2.height;
      let dt = Math.min(50, live.last ? now - live.last : 16);
      live.last = now;
      if (match.state.pending && !live.seq) dt = 0; // \u23f8 decision pending: freeze the pitch with the match clock
      const spdMul = speed === 0.5 ? 0.65 : speed === 1 ? 1 : speed === 2 ? 1.7 : 2.4;
      const mom = match.state.momentum;
      const B = live.ball;
      let arc = 0;

      // ---------- goal mini-replay: slow-motion zoomed re-run of the strike ----------
      if (live.replay && !live.replay.pending) {
        const R = live.replay;
        R.t += dt;
        const t = Math.min(1, R.t / R.dur);
        // slow-mo ball path: edge of box -> goal
        const sx = R.T ? 78 : 22, gx = R.T ? 99 : 1;
        const bx = sx + (gx - sx) * t, by = 50 + (R.y - 50) * t;
        // zoomed viewport around the attacking box
        const zx0 = R.T ? 55 : 0, zx1 = R.T ? 100 : 45;
        const zpx = (wx) => 6 + ((wx - zx0) / (zx1 - zx0)) * (W - 12);
        const zpy = (wy) => 6 + ((wy - 20) / 60) * (Hh - 12);
        for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? "#0d5c2b" : "#107a36"; g.fillRect(i * W / 6, 0, W / 6 + 1, Hh); }
        g.strokeStyle = "rgba(255,255,255,.55)"; g.lineWidth = 2;
        // box + goal at the zoom end
        const bxl = R.T ? zpx(78) : zpx(22);
        g.strokeRect(Math.min(bxl, zpx(R.T ? 100 : 0)), zpy(30), Math.abs(zpx(R.T ? 100 : 0) - bxl), zpy(70) - zpy(30));
        g.fillStyle = "#eee"; g.fillRect(R.T ? W - 8 : 2, zpy(44), 6, zpy(56) - zpy(44));
        // shooter + keeper silhouettes
        g.beginPath(); g.arc(zpx(sx - (R.T ? 3 : -3)), zpy(50 + (R.y - 50) * 0.2), 9, 0, 7); g.fillStyle = R.T ? H.col1 : A.col1; g.fill();
        g.lineWidth = 2; g.strokeStyle = "#fff"; g.stroke();
        const kx = R.T ? 97 : 3, kdive = t > 0.55 ? (R.y > 50 ? -1 : 1) * (t - 0.55) * 20 : 0;
        g.save(); g.translate(zpx(kx), zpy(50 + kdive)); g.rotate(t > 0.55 ? (R.T ? 1 : -1) * 0.9 * Math.min(1, (t - 0.55) * 3) : 0);
        g.beginPath(); g.ellipse(0, 0, 10, 4.5, 0, 0, 7); g.fillStyle = "#e8b820"; g.fill(); g.strokeStyle = "#fff"; g.stroke(); g.restore();
        // slow-mo ball + trail
        for (let i = 1; i <= 5; i++) {
          const tt = Math.max(0, t - i * 0.05);
          g.beginPath(); g.arc(zpx(sx + (gx - sx) * tt), zpy(50 + (R.y - 50) * tt), 4 - i * 0.5, 0, 7);
          g.fillStyle = `rgba(255,255,255,${0.4 - i * 0.07})`; g.fill();
        }
        g.beginPath(); g.arc(zpx(bx), zpy(by), 5.5, 0, 7); g.fillStyle = "#fff"; g.fill(); g.strokeStyle = "rgba(0,0,0,.4)"; g.stroke();
        // REPLAY tag
        g.font = "bold 18px system-ui"; g.textAlign = "left";
        g.fillStyle = "rgba(0,0,0,.6)"; g.fillRect(10, 10, 110, 28);
        g.fillStyle = "#ffd75e"; g.fillText("\u25b6 REPLAY", 18, 30);
        if (t >= 1) live.replay = null;
        live.raf = requestAnimationFrame(drawLive);
        return;
      }

      // ---------- ball logic: seq (event) > script (decision) > ambient possession ----------
      if (live.seq && live.seq.length) {
        const st = live.seq[0];
        if (!st.started) { st.started = true; st.fx = B.x; st.fy = B.y; st.t = 0; }
        st.t += dt;
        const prog = Math.min(1, st.t / st.dur);
        B.x = st.fx + (st.to.x - st.fx) * prog;
        B.y = st.fy + (st.to.y - st.fy) * prog;
        arc = Math.sin(prog * Math.PI) * 2.2;
        if (prog >= 1) {
          if (st.flash && !st.flashed) { st.flashed = true; live.flash = { txt: st.flash.txt, col: st.flash.col, until: Date.now() + st.flash.ms }; }
          if (st.t >= st.dur + (st.wait || 0)) {
            live.seq.shift();
            if (!live.seq.length) {
              live.seq = null;
              live.possHome = live.seqPoss;
              live.carrier = nearestPlayer(live.possHome, B, true);
              live.dwell = 350;
              if (live.replay && live.replay.pending) { live.replay.pending = false; live.replay.t = 0; }
            }
          }
        }
      } else if (live.script && live.script.until > Date.now()) {
        // decision pending: ball held at the spot, carrier stands over it
        B.x += (live.script.x - B.x) * Math.min(1, dt / 90);
        B.y += (live.script.y - B.y) * Math.min(1, dt / 90);
        live.carrier = nearestPlayer(live.script.home, B, false) || live.carrier;
      } else {
        if (live.script) live.script = null;
        // ambient: possession passing, tempo scales with match speed
        if (live.pass_) {
          const p_ = live.pass_;
          p_.t += dt;
          const prog = Math.min(1, p_.t / p_.dur);
          B.x = p_.fx + (p_.tp.x - p_.fx) * prog;
          B.y = p_.fy + (p_.tp.y - p_.fy) * prog;
          arc = Math.sin(prog * Math.PI) * 1.6;
          if (prog >= 1) { live.carrier = p_.tp; live.pass_ = null; live.dwell = (260 + Math.random() * 320) / spdMul; }
        } else {
          if (!live.carrier || live.carrier.team !== (live.possHome ? 0 : 1)) live.carrier = nearestPlayer(live.possHome, B, false);
          if (live.carrier) { B.x = live.carrier.x; B.y = live.carrier.y - 1.2; }
          live.dwell -= dt;
          if (live.dwell <= 0 && live.carrier) {
            // turnover chance follows true momentum -> possession share matches commentary
            const keepP = live.possHome ? 0.42 + (mom / 100) * 0.42 : 0.42 + ((100 - mom) / 100) * 0.42;
            if (Math.random() > keepP) {
              live.possHome = !live.possHome;
              live.carrier = nearestPlayer(live.possHome, B, false);
              live.dwell = (200 + Math.random() * 200) / spdMul;
            } else {
              // pick a forward-ish teammate to receive
              const dir = live.possHome ? 1 : -1;
              const mates = live.players.filter(p => p.team === live.carrier.team && p !== live.carrier && !p.gk);
              // zone pressure: the dominant team probes deeper — bias pass targets toward their attacking third
              const domBias = live.possHome ? (mom - 50) / 50 : (50 - mom) / 50;
              const zoneX = live.possHome ? 50 + Math.max(0, domBias) * 28 : 50 - Math.max(0, domBias) * 28;
              const cands = mates.map(p => ({ p, w: Math.max(0.1, 3 + (p.x - live.carrier.x) * dir * 0.8 - Math.abs(p.x - zoneX) * 0.05 - Math.abs(p.y - live.carrier.y) * 0.03 + Math.random() * 3) }));
              cands.sort((a, b2) => b2.w - a.w);
              const tgt = cands[Math.floor(Math.random() * Math.min(3, cands.length))].p;
              const dist = Math.hypot(tgt.x - B.x, tgt.y - B.y);
              live.pass_ = { fx: B.x, fy: B.y, tp: tgt, t: 0, dur: Math.max(140, dist * 11 / spdMul) };
              live.carrier = null;
            }
          }
        }
      }
      if (live.flash && live.flash.until <= Date.now()) live.flash = null;

      // ---------- players: team shape slides with the ball, closest defenders press ----------
      const shift = (B.x - 50) * 0.32;
      const k = 1 - Math.pow(0.90, dt / 16);
      // two nearest opponents press the ball
      const defTeam = live.possHome ? 1 : 0;
      const pressers = live.players.filter(p => p.team === defTeam && !p.gk)
        .sort((a, b2) => (Math.hypot(a.x - B.x, a.y - B.y)) - (Math.hypot(b2.x - B.x, b2.y - B.y))).slice(0, 2);
      const momLean = ((mom - 50) / 50) * 5; // pitch visibly tilts toward the dominant team
      for (const p of live.players) {
        let tx = Math.max(2, Math.min(98, p.hx + (p.gk ? shift * 0.06 : shift + (p.team === 0 ? momLean : momLean))));
        let ty = p.hy + (B.y - 50) * (p.gk ? 0.25 : 0.10);
        if (p.gk) { // keeper reads the danger: tracks ball line when it enters his quarter
          const danger = p.team === 0 ? B.x < 26 : B.x > 74;
          if (danger) ty = 50 + (B.y - 50) * 0.6;
        }
        if (pressers.includes(p)) { tx = B.x + (p.team === 0 ? -2.5 : 2.5); ty = B.y + (p === pressers[0] ? 0 : 5); }
        if (p === live.carrier) { tx = B.x; ty = B.y + 1.2; }
        let spd = pressers.includes(p) ? 2.2 : 1;
        if (p.diveUntil && p.diveUntil > Date.now()) { tx = p.diveTo.x; ty = p.diveTo.y; spd = 3.2; }
        else if (p.diveUntil) { p.diveUntil = 0; }
        p.x += (tx - p.x) * k * spd;
        p.y += (ty - p.y) * k * spd;
      }

      // ---------- draw ----------
      for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? "#0f6a31" : "#128a3e"; g.fillRect(i * W / 6, 0, W / 6 + 1, Hh); }
      // attack-direction shading: dominant team's target third glows softly
      if (mom > 58) { const gr = g.createLinearGradient(W * 0.6, 0, W, 0); gr.addColorStop(0, "rgba(255,215,94,0)"); gr.addColorStop(1, `rgba(255,215,94,${Math.min(0.16, (mom - 58) / 260)})`); g.fillStyle = gr; g.fillRect(W * 0.6, 0, W * 0.4, Hh); }
      else if (mom < 42) { const gr = g.createLinearGradient(W * 0.4, 0, 0, 0); gr.addColorStop(0, "rgba(255,215,94,0)"); gr.addColorStop(1, `rgba(255,215,94,${Math.min(0.16, (42 - mom) / 260)})`); g.fillStyle = gr; g.fillRect(0, 0, W * 0.4, Hh); }
      g.strokeStyle = "rgba(255,255,255,.6)"; g.lineWidth = 2;
      g.strokeRect(6, 6, W - 12, Hh - 12);
      g.beginPath(); g.moveTo(W / 2, 6); g.lineTo(W / 2, Hh - 6); g.stroke();
      g.beginPath(); g.arc(W / 2, Hh / 2, 40, 0, 7); g.stroke();
      g.strokeRect(6, Hh / 2 - 70, 60, 140); g.strokeRect(W - 66, Hh / 2 - 70, 60, 140);
      g.fillStyle = "#eee"; g.fillRect(2, Hh / 2 - 26, 4, 52); g.fillRect(W - 6, Hh / 2 - 26, 4, 52);
      const px = (wx) => 6 + wx / 100 * (W - 12), py = (wy) => 6 + wy / 100 * (Hh - 12);
      // possession indicator strip
      g.fillStyle = live.possHome ? H.col1 : A.col1;
      g.globalAlpha = 0.85; g.fillRect(live.possHome ? 10 : W - 60, Hh - 16, 50, 6); g.globalAlpha = 1;
      for (const p of live.players) {
        g.beginPath(); g.ellipse(px(p.x), py(p.y) + 4, 5, 2, 0, 0, 7); g.fillStyle = "rgba(0,0,0,.35)"; g.fill();
        const diving = p.gk && p.diveUntil && p.diveUntil > Date.now();
        g.beginPath();
        if (diving) { // keeper at full stretch toward the ball
          const ang = Math.atan2(py(B.y) - py(p.y), px(B.x) - px(p.x));
          g.ellipse(px(p.x), py(p.y), 8.5, 3.2, ang, 0, 7);
        } else {
          g.arc(px(p.x), py(p.y), p === live.carrier ? 6.2 : 5.5, 0, 7);
        }
        g.fillStyle = p.team === 0 ? H.col1 : A.col1; g.fill();
        g.lineWidth = p === live.carrier || diving ? 2.2 : 1.5;
        g.strokeStyle = p === live.carrier || diving ? "#fff" : "rgba(255,255,255,.7)"; g.stroke();
        if (p.you) { // YOU: gold ring + name chevron
          g.beginPath(); g.arc(px(p.x), py(p.y), 9, 0, 7);
          g.lineWidth = 2; g.strokeStyle = "#ffd75e"; g.stroke();
          g.font = "bold 10px system-ui"; g.textAlign = "center";
          g.fillStyle = "#ffd75e"; g.fillText("\u25bc", px(p.x), py(p.y) - 12);
        }
      }
      const br = 3.4 + arc;
      g.beginPath(); g.arc(px(B.x), py(B.y) - arc * 3, br, 0, 7);
      g.fillStyle = "#fff"; g.fill(); g.strokeStyle = "rgba(0,0,0,.4)"; g.lineWidth = 1; g.stroke();
      if (live.flash) {
        g.font = "bold 22px system-ui"; g.textAlign = "center";
        g.fillStyle = "rgba(0,0,0,.55)"; g.fillRect(W / 2 - 150, 14, 300, 34);
        g.fillStyle = live.flash.col; g.fillText(live.flash.txt, W / 2, 38);
      }
      // scoreboard: canvas always mirrors the real match state
      g.font = "bold 15px system-ui"; g.textAlign = "left";
      g.fillStyle = "rgba(0,0,0,.55)"; g.fillRect(10, Hh - 40, 190, 26);
      g.fillStyle = "#fff"; g.fillText(`${H.short} ${match.state.gH} - ${match.state.gA} ${A.short}  ${match.state.min}'`, 18, Hh - 22);
      // attack-state banner + pulsing direction arrows (live-score style)
      {
        const L = atkLabel();
        if (L.attacking) {
          const col = L.danger ? "#ff5a4e" : "#ffd75e";
          g.font = "bold 14px system-ui"; g.textAlign = "right";
          g.fillStyle = "rgba(0,0,0,.55)"; g.fillRect(W - 210, Hh - 40, 200, 26);
          g.fillStyle = col; g.fillText(L.txt, W - 18, Hh - 22);
          // three pulsing chevrons marching toward the goal under attack
          const pulse = (Date.now() / 300) % 3;
          const dir = L.dirRight ? 1 : -1;
          const bx0 = L.dirRight ? W - 250 : 250, by0 = Hh - 27;
          for (let i = 0; i < 3; i++) {
            const alpha = 0.25 + (((i - pulse + 3) % 3) < 1 ? 0.65 : 0);
            g.fillStyle = L.danger ? `rgba(255,90,78,${alpha})` : `rgba(255,215,94,${alpha})`;
            g.beginPath();
            const cx = bx0 - dir * i * 14;
            g.moveTo(cx, by0 - 7); g.lineTo(cx + dir * 8, by0); g.lineTo(cx, by0 + 7);
            g.closePath(); g.fill();
          }
          // danger: tint the defended goal edge red (extra alarm when the defending side is YOURS)
          if (L.danger) {
            const defendingUs = (L.dirRight && !isHome) || (!L.dirRight && isHome);
            const gx = L.dirRight ? W : 0;
            const gr2 = g.createLinearGradient(gx, 0, gx + (L.dirRight ? -110 : 110), 0);
            gr2.addColorStop(0, `rgba(255,70,60,${defendingUs ? 0.30 : 0.16})`); gr2.addColorStop(1, "rgba(255,70,60,0)");
            g.fillStyle = gr2; g.fillRect(L.dirRight ? W - 110 : 0, 0, 110, Hh);
          }
        }
      }
      live.raf = requestAnimationFrame(drawLive);
    }
    function syncView() {
      const c2 = $("#live2d"), tk = $("#ticker");
      if (viewMode === "live2d") {
        c2.style.display = "block"; tk.classList.add("compact");
        if (!live.players.length) initLive();
        if (!live.raf) { live.last = 0; live.raf = requestAnimationFrame(drawLive); }
      } else {
        c2.style.display = "none"; tk.classList.remove("compact");
        if (live.raf) { cancelAnimationFrame(live.raf); live.raf = null; }
      }
      document.querySelectorAll("[data-view]").forEach(b => b.classList.toggle("on", b.dataset.view === viewMode));
    }
    function liveEvent(ev) {
      const T = ev.team === 0;
      const box = (h) => ({ x: h ? 86 : 14, y: 38 + Math.random() * 24 });
      const mid = (h) => ({ x: h ? 62 : 38, y: 30 + Math.random() * 40 });
      const FL = (txt, col, ms) => ({ flash: { txt, col: col || "#fff", ms: ms || 1800 } });
      const seq = (steps, endPoss) => { live.seq = steps; live.seqPoss = endPoss; live.script = null; live.pass_ = null; live.carrier = null; };
      const gkDive = (defHome, gotIt) => {
        const gk = live.players.find(p => p.gk && p.team === (defHome ? 0 : 1));
        if (gk) { gk.diveUntil = Date.now() + 750; gk.diveTo = { x: defHome ? 4 : 96, y: 46 + Math.random() * 8 + (gotIt ? 0 : 7) }; }
      };
      switch (ev.type) {
        case "goal": gkDive(!(ev.team === 0), false);
          seq([{ to: box(T), dur: 240 },
               { to: { x: T ? 99 : 1, y: 46 + Math.random() * 8 }, dur: 200, ...FL("\u26bd GOAL!", "#ffd75e", 2400), wait: 1400 },
               { to: { x: 50, y: 50 }, dur: 500 }], !T);
          live.replay = { pending: true, T, y: 46 + Math.random() * 8, t: 0, dur: 2000 };
          break;
        case "save": gkDive(!(ev.team === 0), true);
          seq([{ to: box(T), dur: 240 },
               { to: { x: T ? 97 : 3, y: 47 + Math.random() * 6 }, dur: 180, ...FL("SAVED!", "#9ad0ff"), wait: 700 }], !T);
          break;
        case "miss":
          seq([{ to: box(T), dur: 240 },
               { to: { x: T ? 103 : -3, y: Math.random() < .5 ? 26 : 74 }, dur: 200, ...FL("WIDE!", "#ffb0a0"), wait: 600 },
               { to: { x: T ? 94 : 6, y: 50 }, dur: 350 }], !T);
          break;
        case "hold":
          seq([{ to: { x: T ? 68 : 32, y: 35 + Math.random() * 30 }, dur: 220, ...FL("\ud83d\udee1\ufe0f HOLDING IT UP", "#8ef0a8", 2000), wait: 1100 }], T);
          break;
        case "dispossessed":
          seq([{ to: mid(!T), dur: 260, ...FL("LOST IT \u2014 THEY BREAK!", "#ff9a8a", 1800), wait: 400 }], !T);
          break;
        case "tackle":
          seq([{ to: mid(!T), dur: 240, ...FL("WON BACK!", "#8ef0a8", 1500), wait: 300 }], !T);
          break;
        case "setpiece":
          seq([{ to: ev.pen ? { x: T ? 88 : 12, y: 50 } : { x: T ? 72 : 28, y: 25 + Math.random() * 50 }, dur: 280, ...FL(ev.pen ? "PENALTY!" : "FREE KICK", "#ffd75e", 2000), wait: 1400 }], T);
          break;
        case "card": live.flash = { txt: "\ud83d\udfe8 BOOKING", col: "#ffd75e", until: Date.now() + 1500 }; break;
        case "injury": live.flash = { txt: "\ud83e\ude79 INJURY", col: "#ff9a8a", until: Date.now() + 2000 }; break;
        case "sub": live.flash = { txt: "\ud83d\udd01 SUBBED OFF", col: "#9ad0ff", until: Date.now() + 2000 }; break;
      }
    }
    function describe(ev) {
      updateMstat(ev);
      liveEvent(ev);
      const evIsUs = (ev.team === 0) === isHome;
      const who = ev.team === 0 ? H.short : A.short;
      if (ev.type === "sub") {
        addTick(ev.min, `\ud83d\udd01 <b>${S.name} is substituted off.</b> A nod from the bench \u2014 job done for today. Stamina preserved.`, "you");
        return;
      }
      if (ev.type === "hold") {
        addTick(ev.min, `\ud83d\udee1\ufe0f ${S.name} shields the ball brilliantly \u2014 possession kept, teammates surging forward... <b>next chance boosted!</b>`, "you");
        return;
      }
      if (ev.type === "dispossessed") {
        addTick(ev.min, `${S.name} tries to hold it up but gets muscled off the ball.`, "");
        return;
      }
      if (ev.type === "injury") {
        addTick(ev.min, `\ud83e\ude79 ${S.name.toUpperCase()} IS DOWN... and can't continue. Out for ${ev.matches} match${ev.matches > 1 ? "es" : ""}.`, "goal opp");
        return;
      }
      if (ev.type === "card") {
        const flavors = ["Tempers flare after a late challenge \u2014 yellow card shown.",
          "Players square up! The ref restores order with a booking.",
          "Cynical shirt-pull stops the counter. Into the book."];
        addTick(ev.min, `\ud83d\udfe8 ${who}: ${flavors[ev.flavor || 0]}`, "");
        return;
      }
      if (ev.type === "setpiece") {
        if (ev.gk) addTick(ev.min, `\ud83d\udea8 HANDBALL! Penalty against your side \u2014 ${S.name} faces it...`, "you");
        else if (ev.by === "you") addTick(ev.min, ev.pen ? `\ud83d\udea8 PENALTY to ${who}! ${S.name} grabs the ball...` : `Free kick in range \u2014 ${S.name} stands over it...`, "you");
        else addTick(ev.min, ev.pen ? `\ud83d\udea8 Penalty awarded to ${who}!` : `Free kick in a dangerous spot for ${who}...`, "");
        return;
      }
      if (ev.type === "tackle") {
        addTick(ev.min, `${S.name.toUpperCase()} WINS IT BACK! Crunching challenge, danger averted.`, "you");
        return;
      }
      if (ev.type === "goal") {
        scoreEl.textContent = ev.score[0] + " - " + ev.score[1];
        let txt = evIsUs ? rngc(COMMENT.goalUs) : rngc(COMMENT.goalOpp);
        if (ev.by === "you") txt = `${S.name.toUpperCase()} SCORES! ` + rngc(COMMENT.goalUs);
        if (ev.assist === "you") txt = `GOAL! Teed up by ${S.name} — what a ball in!`;
        if (ev.via === "penalty" && ev.by === "you") txt = `${S.name.toUpperCase()} ${ev.choice === "panenka" ? "PANENKAS IT IN \u2014 OUTRAGEOUS!" : "BURIES THE PENALTY!"}`;
        if (ev.via === "freekick" && ev.by === "you") txt = `${S.name.toUpperCase()} ${ev.choice === "curler" ? "CURLS THE FREE KICK INTO THE TOP CORNER!" : "SMASHES THE FREE KICK HOME!"}`;
        if (ev.via && ev.ai) txt = (ev.via === "penalty" ? "Converted from the spot." : "Direct from the free kick!") + " " + txt;
        if (ev.gk === "blunder") txt = `Disaster — ${S.name} rushed out and got caught! They tap into an empty net.`;
        if (ev.gk === "beaten") txt = `Beaten. Nothing ${S.name} could do about that one.`;
        addTick(ev.min, `<b>${who}</b> ${txt}`, "goal" + (evIsUs ? "" : " opp"));
        return;
      }
      // save / miss
      let txt = (evIsUs ? rngc(COMMENT.chanceUs) : rngc(COMMENT.chanceOpp)) + " " + rngc(COMMENT[ev.type]);
      if (ev.by === "you") txt = `${S.name} lets fly — ` + rngc(COMMENT[ev.type]);
      if (ev.keypass === "you") txt = `${S.name} slides a killer pass through — ` + rngc(COMMENT[ev.type]);
      if (ev.gk === "save") txt = `${S.name.toUpperCase()} SAVES! ` + (ev.choice === "rush" ? "Off the line in a flash to smother it!" : "Strong hands, danger gone.");
      if (ev.gk === "pensave") txt = `\ud83e\uddb8 ${S.name.toUpperCase()} SAVES THE PENALTY! Guessed right and clawed it away!`;
      if (ev.gk === "penmiss") txt = `The penalty flies over the bar \u2014 let off for ${S.name}!`;
      if (ev.via === "penalty" && ev.by === "you") txt = `${S.name}'s penalty is ${Math.random() < .5 ? "saved by the keeper!" : "off target! A big moment missed."}`;
      if (ev.via === "freekick" && ev.by === "you") txt = `${S.name}'s free kick ${Math.random() < .5 ? "clips the wall and away." : "is tipped over by the keeper!"}`;
      addTick(ev.min, txt, (ev.by === "you" || ev.keypass === "you" || ev.gk === "save" || ev.gk === "pensave") ? "you" : "");
    }

    function handleEvents(evts, thenResume) {
      let big = null;
      const SHOT_TYPES = ["goal", "save", "miss"]; // real shot outcomes always eligible
      for (const ev of evts) {
        if (ev.type === "tackle" && ev.by === "you" && speed < 3 && Math.random() < 0.3) { big = big || ev; continue; } // your crunching tackles: occasional cutscene
        if (!SHOT_TYPES.includes(ev.type)) continue; // hold/dispossessed/card/setpiece/injury = ticker only
        if (ev.type === "goal" || ((ev.by === "you" || ev.gk) && speed < 3 && Math.random() < 0.6)) big = ev;
      }
      if (big && speed < 3 && getSet().cutscenes !== false) {
        clearInterval(timer);
        playMoment(big, () => { evts.forEach(describe); if (match.state.done) endMatch(); else runClock(); });
      } else {
        evts.forEach(describe);
        if (thenResume) { /* clock already running */ }
      }
    }

    function showDecision(dec) {
      if (viewMode === "live2d") {
        const T = dec.isHome;
        live.seq = null; live.pass_ = null;
        live.possHome = T;
        live.script = { x: T ? 86 : 14, y: 42 + Math.random() * 16, home: T, until: Date.now() + 120000 };
      }
      if (!getSet().sawDecTut) {
        setSet("sawDecTut", 1);
        setTimeout(() => toast("\u23f8 Match is PAUSED \u2014 take your time. Every % is the true probability. \ud83d\udee1 HOLD trades this chance for a better one."), 300);
      }
      clearInterval(timer); timer = null; // HARD PAUSE — match time frozen until player chooses
      const odds = E.decisionOdds(dec, { pos: S.pos, playstyle: S.playstyle, eff: effStats(), skills: S.skills || [] }, S.role);
      let scenLabel, buttons;
      if (dec.type === "penalty") {
        scenLabel = "\u26a0\ufe0f PENALTY! You step up to the spot...";
        buttons = [["place", "\ud83c\udfaf PLACE IT \u00b7 SHO", odds.place + "% goal"],
                   ["blast", "\ud83d\udca5 BLAST IT \u00b7 PHY", odds.blast + "% goal"],
                   ["panenka", "\ud83e\ude76 PANENKA \u00b7 DRI", odds.panenka + "% goal \u00b7 style"]];
      } else if (dec.type === "freekick") {
        scenLabel = "\ud83e\uddf1 Free kick in shooting range \u2014 wall set...";
        buttons = [["curler", "\ud83c\udf00 CURL IT \u00b7 SHO", odds.curler + "% goal"],
                   ["power", "\ud83d\udca5 POWER \u00b7 SHO+PHY", odds.power + "% goal"],
                   ["cross", "\ud83c\udd70\ufe0f CROSS \u00b7 PAS", odds.cross + "% assist"]];
      } else if (dec.type === "gkpen") {
        scenLabel = "\u26a0\ufe0f PENALTY AGAINST \u2014 pick your moment, keeper!";
        buttons = [["left", "\u2b05\ufe0f DIVE LEFT", "~" + odds.dive + "% save"],
                   ["right", "\u27a1\ufe0f DIVE RIGHT", "~" + odds.dive + "% save"],
                   ["stay", "\ud83e\uddcd STAND TALL", "~" + odds.stay + "% save"]];
      } else if (isGK) {
        scenLabel = dec.scen ? dec.scen.label : "Shot incoming!";
        buttons = [["stay", "\ud83e\udde4 STAY BIG", odds.stay + "% save"],
                   ["rush", "\ud83c\udfc3 RUSH OUT", odds.rush + "% save \u00b7 " + odds.blunder + "% blunder"]];
      } else {
        scenLabel = (dec.held ? "\ud83d\udee1\ufe0f\u2794 HOLD BONUS ACTIVE \u2014 " : "") + (dec.scen ? dec.scen.label : "A chance opens up");
        if (dec.held) {
          // show the boost honestly: same chance without the hold multiplier
          const pre = E.decisionOdds(Object.assign({}, dec, { conv: dec.conv / 1.30 }), { pos: S.pos, playstyle: S.playstyle, eff: effStats(), skills: S.skills || [] }, S.role);
          buttons = [["shoot", "\ud83c\udfaf SHOOT \u00b7 SHO", `<b style="color:var(--gold)">${odds.shoot}%</b> goal <s style="opacity:.6">${pre.shoot}%</s>`],
                     ["pass", "\ud83c\udd70\ufe0f PASS \u00b7 PAS", `<b style="color:var(--gold)">${odds.pass}%</b> assist <s style="opacity:.6">${pre.pass}%</s>`],
                     ["hold", "\ud83d\udee1\ufe0f HOLD \u00b7 DRI+PHY", odds.hold + "% keep again"]];
        } else {
          buttons = [["shoot", "\ud83c\udfaf SHOOT \u00b7 SHO", odds.shoot + "% goal"],
                     ["pass", "\ud83c\udd70\ufe0f PASS \u00b7 PAS", odds.pass + "% assist"],
                     ["hold", "\ud83d\udee1\ufe0f HOLD \u00b7 DRI+PHY", odds.hold + `% keep \u2794 next chance \u00d71.3 quality, guaranteed yours`]];
        }
      }
      const stamNote = odds.stam != null ? ` \u00b7 stamina ${odds.stam}%${odds.stam < 55 ? " \ud83e\udd75" : ""}` : "";
      decEl.style.display = "block";
      decEl.innerHTML = `
        <div class="decision-head">\u23f8 ${match.state.min}' \u2014 ${scenLabel}</div>
        <div class="sub center" style="margin-bottom:8px">${odds.xg ? `Chance quality: <b>${odds.xg}%</b>` : "Dead-ball situation"}${stamNote} \u00b7 match paused</div>
        <div class="btnrow decgrid">
          ${buttons.map(([id, label, sub]) => `<button class="btn ${id === "shoot" || id === "stay" ? "" : "secondary"} decbtn" data-dec="${id}">${label}<span class="decodds">${sub}</span></button>`).join("")}
        </div>`;
      function choose(c) {
        decEl.style.display = "none";
        decEl.innerHTML = "";
        const res = match.decide(c);
        handleEvents(res.events, true);
        if (res.done || match.state.done) { setTimeout(function w(){ momentActive ? setTimeout(w, 200) : endMatch(); }, 100); }
        else runClock();
      }
      decEl.querySelectorAll("[data-dec]").forEach(b => b.onclick = () => choose(b.dataset.dec));
    }

    let matchOver = false;
    function endMatch() {
      if (matchOver) return;
      matchOver = true;
      clearInterval(timer); clearInterval(decisionTimer);
      const r = match.result();
      addTick(90, `<b>FULL TIME.</b> ${H.short} ${r.gH} - ${r.gA} ${A.short}`, "goal");
      Snd.fulltime();
      renderMstats();
      decEl.style.display = "block";
      decEl.innerHTML = `<div class="scenline">\ud83c\udfc1 FULL TIME \u00b7 ${H.short} ${r.gH} - ${r.gA} ${A.short}</div>
        <p class="sub" style="margin:4px 0 8px">Scroll the ticker to review the match events, then continue when ready.</p>
        <button class="btn" id="ftcontinue">CONTINUE \u2794 MATCH SUMMARY</button>`;
      document.querySelector("#ftcontinue").onclick = () => finishMatch(fx, r, displayedProbs);
    }

    let momentSince = 0;
    function step() {
      if (momentActive) {
        momentSince++;
        if (momentSince > 40) { momentActive = false; canvas.style.display = "none"; momentSince = 0; } // watchdog: never wedge the match
        else { return; }
      } else momentSince = 0;
      if (match.state.pending) { clearInterval(timer); timer = null; return; }
      const s = match.step();
      clockEl.textContent = s.min + "'";
      if (s.min === 45) addTick(45, "Half-time. Catch your breath.", "");
      momEl.style.width = (isHome ? match.state.momentum : 100 - match.state.momentum) + "%";
      updateAtkState(s.events);
      atk.momHist.push(match.state.momentum); if (atk.momHist.length > 40) atk.momHist.shift();
      const stripEl = $("#atkstrip");
      if (stripEl) {
        const L = atkLabel();
        stripEl.innerHTML = `<span class="atkarrows ${L.danger ? "danger" : ""}" style="${L.dirRight ? "" : "transform:scaleX(-1)"}">${L.attacking ? "\u25b6\u25b6\u25b6" : "\u25c6"}</span> ${L.txt}`;
        stripEl.className = "atkstrip" + (L.danger ? " danger" : L.attacking ? " on" : "");
      }
      if (s.min % 3 === 0) renderMstats();
      if (s.events.length) handleEvents(s.events, true);
      if (s.decision) {
        if (speed === 3) { // skip mode: auto everything
          const res = match.decide("auto");
          res.events.forEach(describe);
          if (res.done || match.state.done) { endMatch(); return; }
        } else { showDecision(s.decision); return; } // clock stopped inside showDecision
      }
      if (s.done || match.state.done) endMatch();
    }
    function runClock() {
      clearInterval(timer);
      if (match.state.pending) return; // decision owns the flow
      timer = setInterval(step, speed === 0.5 ? 640 : speed === 1 ? 320 : speed === 2 ? 120 : 20);
    }
    $("#subbtn").onclick = () => {
      const sev = match.requestSub && match.requestSub();
      if (!sev) { toast("Can't sub right now"); return; }
      describe(sev);
      renderMstats();
      $("#subbtn").disabled = true; $("#subbtn").style.opacity = .4;
      toast("\ud83d\udd01 Subbed off \u2014 stamina preserved for next match");
    };
    document.querySelectorAll("[data-view]").forEach(b => b.onclick = () => {
      viewMode = b.dataset.view;
      S.viewMode = viewMode; save();
      syncView();
    });
    setTimeout(syncView, 50);
    document.querySelectorAll("[data-speed]").forEach(b => b.onclick = () => {
      speed = +b.dataset.speed;
      document.querySelectorAll("[data-speed]").forEach(x => x.classList.toggle("on", +x.dataset.speed === speed));
      if (!match.state.pending) runClock();
    });
    Snd.kickoff();
    addTick(0, `Kick off! Displayed odds were ${displayedProbs.home}/${displayedProbs.draw}/${displayedProbs.away}. ${isGK ? "Between the sticks today — stay sharp." : "Your moment — take your chances when they come."}`, "");
    runClock();
  }, 0);

  return `<div class="screen">
    <div class="scorehud">
      <span class="tm" style="color:${H.col1 === "#000000" ? "#fff" : H.col1}">${H.short}</span>
      <span class="score" id="score">0 - 0</span>
      <span class="clock" id="clock">0'</span>
      <span class="tm" style="color:${A.col1 === "#000000" ? "#fff" : A.col1}">${A.short}</span>
    </div>
    <div class="viewrow">
      <button class="btn secondary" data-view="ticker">\ud83d\udcfb Commentary</button>
      <button class="btn secondary" data-view="live2d">\ud83c\udfae 2D Live</button>
    </div>
    <canvas id="live2d" width="800" height="520" style="display:none"></canvas>
    <canvas id="pitch"></canvas>
    <div id="decision" class="decisionbox" style="display:none"></div>
    <div class="momwrap">
      <div class="mombar"><div class="momfill" id="momfill" style="width:50%"></div></div>
      <div class="momlabels"><span>${isHome ? "US" : H.short}</span><span>momentum</span><span>${isHome ? A.short : "US"}</span></div>
    </div>
    <div class="panel mstats" id="mstats"></div>
    <div class="atkstrip" id="atkstrip"></div>
    <div class="ticker" id="ticker"></div>
    <div class="speedrow">
      <button class="btn secondary" data-speed="0.5">\ud83d\udc22 \u00bdx</button>
      <button class="btn secondary on" data-speed="1">▶ 1x</button>
      <button class="btn secondary" data-speed="2">⏩ 2x</button>
      <button class="btn secondary" data-speed="3">\ud83e\udd16 AUTO</button>
      <button class="btn secondary" id="subbtn" style="border-color:rgba(255,170,80,.5)">\ud83d\udd01 SUB</button>
    </div>
  </div>`;
}

// ---- Post-match: rewards, card events, progression ----
function finishMatch(fx, result, displayedProbs) {
  S.mdLock = null; // committed: quitting/back can no longer touch this result
  const isHome = fx.ct ? fx.ctHome : fx.home === S.clubIdx;
  let my = isHome ? result.gH : result.gA, op = isHome ? result.gA : result.gH;
  if ((fx.cup || (fx.ct && fx.ctStage === "ko")) && my === op) { // ties go to penalties (honest, strength-weighted)
    const meStr = myClub().str, opStr = fx.ct ? fx.oppClub.str : S.world.clubs[isHome ? fx.away : fx.home].str;
    const pWin = meStr / (meStr + opStr);
    if (Math.random() < pWin) my++; else op++;
    result.pens = true;
  }
  const res = my > op ? "W" : my === op ? "D" : "L";
  S.lastFive.push(res); if (S.lastFive.length > 5) S.lastFive.shift();

  let ctReward = null;
  if (fx.ct) { // Champions Trophy night — does not touch the league calendar
    const gH2 = isHome ? my : op, gA2 = isHome ? op : my; // pens-adjusted for KO
    ctReward = balCtRecord(fx, gH2, gA2);
  }
  if (fx.cup) {
    if (res === "W") {
      const rw = [[300, 0], [500, 5], [1000, 15]][S.cup.round];
      S.gp += rw[0]; S.nl += rw[1];
      pushNews(`\ud83c\udfc6 CUP: ${myClub().name} advance past the ${CUP_ROUNDS[S.cup.round]}${result.pens ? " on penalties" : ""}! (+${rw[0]} GP${rw[1] ? ", +" + rw[1] + " LC" : ""})`);
      S.cup.round++;
      if (S.cup.round >= 3) { pushNews(`\ud83c\udfc6\ud83c\udfc6 ${myClub().name} WIN THE NATIONAL CUP! ${S.name} is a cup winner!`); S.flags.cupWinner = true; S.flags.cupsWon = (S.flags.cupsWon || 0) + 1; }
    } else {
      S.cup.alive = false;
      pushNews(`\ud83d\udc94 Cup exit: ${myClub().name} fall in the ${CUP_ROUNDS[S.cup.round]}${result.pens ? " on penalties" : ""}.`);
    }
  }
  // record my club result + sim rest of the matchday (league only)
  if (!fx.cup && !fx.ct) S.results.push({ home: fx.home, away: fx.away, gH: result.gH, gA: result.gA });
  const oppIdx = fx.ct ? -1 : isHome ? fx.away : fx.home;
  if (!fx.cup && !fx.ct) {
    const key = "0v" + oppIdx;
    (S.world.h2h[key] = S.world.h2h[key] || []).push({ home: fx.home, away: fx.away, gH: result.gH, gA: result.gA });
    for (const [h, a] of S.world.fixtures[S.matchday]) {
      if (h === S.clubIdx || a === S.clubIdx) continue;
      const r = E.simulateMatch(S.world.clubs[h], S.world.clubs[a], { seed: E.hashSeed(S.seed + S.season + "md" + S.matchday + h + a), fast: true });
      S.results.push({ home: h, away: a, gH: r.gH, gA: r.gA });
    }
    S.matchday++;
    balGalaxySim(); // the other five leagues play their matchday too
  }

  // player progression
  const r = result.rating;
  S.myStats.apps++; S.myStats.goals += result.pGoals; S.myStats.assists += result.pAssists;
  S.myStats.ratings.push(r);
  S.career.totalApps++; S.career.totalGoals += result.pGoals;
  const xpGain = Math.round(20 + (r - 5) * 18 + result.pGoals * 25 + result.pAssists * 15);
  S.xp += Math.max(5, xpGain);
  let spGained = 0;
  while (S.xp >= S.level * 100) { S.xp -= S.level * 100; S.level++; S.sp += 2; spGained += 2; }
  const gpGain = Math.round(80 + (res === "W" ? 120 : res === "D" ? 50 : 20) + (r - 5) * 30 + result.pGoals * 60 + (result.pSaves || 0) * 15 + (result.pTackles || 0) * 10);
  S.gp += gpGain;
  let nlGain = 0;
  if (result.pGoals >= 3) { nlGain = 5; }        // hat-trick: rare NL drip
  else if (r >= 9.0) { nlGain = 2; }
  S.nl += nlGain;
  S.condition = Math.max(20, Math.min(100, (result.staminaEnd != null ? result.staminaEnd : 60) + 25 + S.upgrades.fitness * 5));
  if (result.injuredFor > 0) {
    S.injury = result.injuredFor;
    pushNews(`\ud83e\ude79 Injury blow: ${S.name} out for ${result.injuredFor} match${result.injuredFor > 1 ? "es" : ""}.`);
  }
  S.form = Math.max(-2, Math.min(2, S.form + (r >= 7.5 ? 1 : r < 6 ? -1 : 0)));
  if (S.buff && S.buff.matches > 0) { S.buff.matches--; if (S.buff.matches <= 0) S.buff = null; }
  S.rep += Math.max(0, Math.round((r - 6) * 2));

  // card type events (earned, per spec)
  let cardEvent = null;
  if (S.cardTimer > 0) { S.cardTimer--; if (S.cardTimer === 0 && (S.cardType === "trending" || S.cardType === "showtime")) S.cardType = "standard"; }
  if (result.pGoals >= 3) { S.cardType = "showtime"; S.cardTimer = 3; cardEvent = "🎬 SHOW TIME CARD UNLOCKED — hat-trick hero! (+4 all stats, 3 matches)"; }
  else if (S.cardType === "standard") {
    const recent = S.myStats.ratings.slice(-3);
    if (recent.length === 3 && recent.every(x => x >= 7.5)) { S.cardType = "trending"; S.cardTimer = 3; cardEvent = "📈 TRENDING CARD — three straight 7.5+ ratings! (+2 all stats, 3 matches)"; }
  }
  S.trainedToday = false;

  // flags for objectives
  if (res === "W") S.flags.wins++;
  if (r > S.flags.bestRating) S.flags.bestRating = r;
  if (result.pGoals >= 3) S.flags.hatTrick = true;
  if (["GK","CB","LB","RB","DMF"].includes(S.pos)) { if (op === 0) S.flags.cleanSheets++; }
  S.flags.saves = (S.flags.saves || 0) + (result.pSaves || 0);
  S.flags.careerAssists = (S.flags.careerAssists || 0) + result.pAssists;
  if (r >= 7.5) S.flags.hi75 = (S.flags.hi75 || 0) + 1;
  if (r >= 9) S.flags.count9 = (S.flags.count9 || 0) + 1;
  if (result.pGoals >= 3) S.flags.hatTricks = (S.flags.hatTricks || 0) + 1;
  if (result.pShots >= 2) S.flags.multiShotMatches = (S.flags.multiShotMatches || 0) + 1;
  S.flags.tackles = (S.flags.tackles || 0) + (result.pTackles || 0);
  S.flags.shots = (S.flags.shots || 0) + (result.pShots || 0);
  if (result.pAssists > 0) S.flags.assistMatches = (S.flags.assistMatches || 0) + 1;

  // golden boot race: my goals + generated rival strikers score alongside
  S.scorers[S.name] = (S.scorers[S.name] || 0) + result.pGoals;
  try { titleRaceNews(); } catch (e) {}
  for (const rr of (fx.ct ? [] : S.results.slice(-(S.world.fixtures[S.matchday - 1] || []).length))) {
    const total = rr.gH + rr.gA;
    for (let g = 0; g < total; g++) {
      if (Math.random() < 0.4) {
        const club = Math.random() < 0.5 ? rr.home : rr.away;
        if (club === S.clubIdx) continue;
        const n = rivalName(club, Math.floor(Math.random() * 3));
        S.scorers[n] = (S.scorers[n] || 0) + 1;
      }
    }
  }

  // news headlines
  const oppName = fx.ct ? fx.oppClub.name : S.world.clubs[oppIdx].name;
  if (result.pGoals >= 3) pushNews(`🎩 ${S.name} destroys ${oppName} with a HAT-TRICK!`);
  else if (result.pGoals >= 1 && res === "W") pushNews(`⚽ ${S.name} strikes as ${myClub().name} beat ${oppName} ${Math.max(my, op)}-${Math.min(my, op)}.`);
  else if (r >= 8.5) pushNews(`🌟 ${r.toFixed(1)}-rated masterclass from ${S.name} against ${oppName}.`);
  else if (res === "L" && r < 5.5) pushNews(`📉 Rough day: ${S.name} struggles in defeat to ${oppName}.`);
  const t = E.computeTable(S.world.clubs, S.results);
  if (t[0]) pushNews(`📊 ${t[0].name} ${t[0].i === S.clubIdx ? "— YOUR club —" : ""} top the table with ${t[0].Pts} pts.`);

  save();

  render(() => {
    setTimeout(() => { $("#cont").onclick = () => render(homeScreen); }, 0);
    const H = fx.ct ? (fx.ctHome ? myClub() : fx.oppClub) : S.world.clubs[fx.home];
    const A = fx.ct ? (fx.ctHome ? fx.oppClub : myClub()) : S.world.clubs[fx.away];
    return `<div class="screen">${topbar()}
      <div class="panel center">
        <h2>Full Time</h2>
        <div class="vsrow">
          <div class="vsteam">${crest(H)}</div>
          <div class="vsx" style="font-size:2rem;color:var(--text)">${result.gH} - ${result.gA}</div>
          <div class="vsteam">${crest(A)}</div>
        </div>
        <p class="sub">Pre-match odds ${displayedProbs.home}% / ${displayedProbs.draw}% / ${displayedProbs.away}% — honest engine, upsets included.</p>
      </div>
      <div class="panel center">
        <h2>Your Performance</h2>
        ${fmtRating(r)}
        <div class="rewardrow">
          ${S.pos === "GK"
            ? `<div><b>${result.pSaves}</b><span>SAVES</span></div><div><b>${(isHome ? result.gA : result.gH) === 0 ? "YES" : "NO"}</b><span>CLEAN SHEET</span></div>`
            : `<div><b>${result.pGoals}</b><span>GOALS</span></div><div><b>${result.pAssists}</b><span>ASSISTS</span></div><div><b>${result.pShots}</b><span>SHOTS</span></div>`}
          ${result.pTackles ? `<div><b>${result.pTackles}</b><span>TACKLES</span></div>` : ""}
        </div>
        ${cardEvent ? `<div class="cardevent">${cardEvent}</div>` : ""}
        ${fx.ct && ctReward && (ctReward.gp || ctReward.lc) ? `<div class="cardevent">\ud83c\udf0d Champions Trophy: +${ctReward.gp} GP${ctReward.lc ? " \u00b7 +" + ctReward.lc + " LC" : ""}</div>` : ""}
        <div class="rewardrow">
          <div><b style="color:${S.condition > 60 ? 'var(--green)' : 'var(--red)'}">${S.condition}%</b><span>CONDITION</span></div>
          <div><b style="color:var(--green)">+${gpGain}</b><span>GP</span></div>
          <div><b style="color:var(--gold)">+${nlGain}</b><span>LEGEND COINS</span></div>
          <div><b>+${Math.max(5, xpGain)}</b><span>XP${spGained ? " (LEVEL UP! +" + spGained + " SP)" : ""}</span></div>
        </div>
        <button class="btn" id="cont">Continue →</button>
      </div>
    </div>`;
  });
}

// ---- League table ----
function tableScreen() {
  const t = E.computeTable(S.world.clubs, S.results);
  const worldView = S._worldLg != null && S.galaxy && S._worldLg !== S.leagueIdx;
  setTimeout(() => {
    document.querySelectorAll("[data-worldlg]").forEach(b => b.onclick = () => { S._worldLg = +b.dataset.worldlg; render(tableScreen); });
  }, 0);
  const worldTabs = S.galaxy ? `<div class="viewrow" style="flex-wrap:wrap;gap:4px;margin-bottom:6px">
    ${S.galaxy.leagues.map((L, li) => `<button class="btn secondary ${((S._worldLg == null ? S.leagueIdx : S._worldLg) === li) ? "on" : ""}" data-worldlg="${li}" style="flex:1 1 30%;font-size:.72rem;padding:6px 4px">${L.name.split(" ")[0]}${li === S.leagueIdx ? " ⭐" : ""}</button>`).join("")}
  </div>` : "";
  if (worldView) {
    const L = S.galaxy.leagues[S._worldLg];
    const wt = E.computeTable(L.clubs, L.results || []);
    return `<div class="screen">${topbar()}
      <div class="panel">
        <h2>🌍 ${L.name} · Season ${S.season}</h2>
        ${worldTabs}
        <table class="league">
          <tr><th>#</th><th>Club</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr>
          ${wt.map((r, i) => `<tr><td>${i + 1}</td><td>${r.name}</td><td>${r.P}</td><td>${r.W}</td><td>${r.D}</td><td>${r.L}</td><td>${r.GF - r.GA}</td><td><b>${r.Pts}</b></td></tr>`).join("")}
        </table>
        <p class="sub" style="margin-top:6px">League champions qualify for next season's 🌍 Champions Trophy (top-3 leagues send two).</p>
      </div>
      ${navHTML("table")}
    </div>`;
  }
  const ctPanel = (S.ct && S.ct.myG >= 0) ? (() => {
    const gt = E.ctGroupTable(S.ct, S.ct.myG);
    const meE = balCtMyEntry();
    return `<div class="panel">
      <h2>🌍 Champions Trophy · Group ${"ABCD"[S.ct.myG]}</h2>
      ${S.ct.stage === "group" ? `<table class="league">
        <tr><th>#</th><th>Club</th><th>P</th><th>GD</th><th>Pts</th></tr>
        ${gt.map((r, i) => { const e2 = S.ct.groups[S.ct.myG][r.s]; const c = E.ctClub(S.galaxy, e2); const isMe = e2.league === meE.league && e2.club === meE.club;
          return `<tr class="${isMe ? "you" : ""}"><td>${i + 1}</td><td>${c.name}</td><td>${r.P}</td><td>${r.GD}</td><td><b>${r.Pts}</b></td></tr>`; }).join("")}
      </table><p class="sub" style="margin-top:6px">Top two advance · group matches ${S.ct.gPlayed}/6 played.</p>`
      : S.ct.done ? `<p class="sub">${S.ct.champion ? E.ctClub(S.galaxy, S.ct.champion).name + " won the trophy." : "Tournament complete."}</p>`
      : `<p class="sub">Knockout stage · ${E.CT_ROUNDS[S.ct.koRound]} ${S.ct.alive ? "— you're still in it!" : "— you're out."}</p>`}
    </div>`;
  })() : "";
  return `<div class="screen">${topbar()}
    <div class="panel">
      <h2>${leagueName()} · Season ${S.season}</h2>
      ${worldTabs}
      <table class="league">
        <tr><th>#</th><th>Club</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr>
        ${t.map((r, i) => `<tr class="${r.i === S.clubIdx ? "you" : ""}">
          <td>${i + 1}</td><td>${r.name}</td><td>${r.P}</td><td>${r.W}</td><td>${r.D}</td><td>${r.L}</td><td>${r.GF - r.GA}</td><td><b>${r.Pts}</b></td>
        </tr>`).join("")}
      </table>
    </div>
    ${ctPanel}
    <div class="panel">
      <h2>👑 Golden Boot Race</h2>
      ${Object.entries(S.scorers).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([n, g], i) =>
        `<div class="kv"><span>${i + 1}. ${n === S.name ? "<b style='color:var(--gold)'>" + n + " (YOU)</b>" : n}</span><b>${g}</b></div>`).join("") || '<p class="sub">No goals scored yet this season.</p>'}
    </div>
    ${navHTML("table")}
  </div>`;
}

// ---- Training (GP economy + stat points) ----
function trainScreen() {
  setTimeout(() => {
    document.querySelectorAll("[data-train]").forEach(b => b.onclick = () => {
      const k = b.dataset.train;
      if (S.sp <= 0) { toast("No stat points — earn XP in matches!"); return; }
      if (S.stats[k] >= 99) { toast("Maxed!"); return; }
      S.sp--; S.stats[k]++; save(); render(trainScreen);
    });
    const drill = $("#drill");
    if (drill) drill.onclick = () => {
      if (S.trainedToday) return;
      if (S.gp < 150) { toast("Not enough GP"); return; }
      S.gp -= 150; S.xp += 40; S.trainedToday = true;
      let leveled = false;
      while (S.xp >= S.level * 100) { S.xp -= S.level * 100; S.level++; S.sp += 2; leveled = true; }
      save(); toast(leveled ? "Level up! +2 stat points" : "+40 XP from training");
      render(trainScreen);
    };
    const boost = $("#boost");
    if (boost) boost.onclick = () => {
      if (S.nl < 8) { toast("Not enough Legend Coins"); return; }
      S.nl -= 8; S.sp += 1; save();
      toast("Premium session: +1 stat point (accelerator, never a gate)");
      render(trainScreen);
    };
  }, 0);
  return `<div class="screen">${topbar()}
    <div class="panel">
      <h2>Training Ground <span class="badge gold" style="float:right;font-size:.9rem">OVR ${ovr()}</span></h2>
      <p class="sub" style="margin-bottom:6px">OVR weights stats by position \u2014 train what your role rewards. ${E.POSITIONS[S.pos].label}s live on ${(() => { const w = E.POSITIONS[S.pos].weights; return Object.entries(w).sort((x,y)=>y[1]-x[1]).slice(0,2).map(e=>e[0]).join(" + "); })()}.</p>
      <div class="kv"><span>Level ${S.level}</span><b>${S.xp}/${S.level * 100} XP</b></div>
      <div class="kv"><span>Stat points</span><b style="color:var(--gold)">${S.sp}</b></div>
      ${(() => {
        const w = E.POSITIONS[S.pos].weights;
        const maxW = Math.max(...Object.values(w));
        const USES = {
          PAC: "match rating drift \u00b7 involvement in attacks",
          SHO: "\u26bd SHOOT odds \u00b7 pen PLACE \u00b7 FK CURL & POWER",
          PAS: "\ud83c\udd70\ufe0f PASS/assist odds \u00b7 FK CROSS \u00b7 rating drift",
          DRI: "\ud83d\udee1\ufe0f HOLD success \u00b7 PANENKA \u00b7 rating drift",
          DEF: "tackles won \u00b7 GK saves & pen dives",
          PHY: "\ud83d\udee1\ufe0f HOLD success \u00b7 pen BLAST \u00b7 FK POWER \u00b7 stamina resist"
        };
        return ["PAC","SHO","PAS","DRI","DEF","PHY"].map(k => {
          const wt = w[k] || 0;
          const impact = wt >= maxW * 0.8 ? ["KEY", "var(--gold)"] : wt >= 0.15 ? ["GOOD", "var(--green)"] : wt >= 0.06 ? ["minor", "var(--muted)"] : ["~none", "var(--red)"];
          const gain = (wt).toFixed(2);
          return `<div class="trainrow">
          <span><b>${k}</b> \u00b7 ${S.stats[k]}
            <span class="badge" style="background:rgba(0,0,0,.3);color:${impact[1]};margin-left:6px">${impact[0]}</span><br>
            <span class="sub">${USES[k]}</span><br>
            <span class="sub" style="opacity:.7">+1 \u2248 +${gain} OVR for a ${S.pos}</span></span>
          <button class="btn secondary" data-train="${k}" ${S.sp <= 0 || S.stats[k] >= 99 ? "disabled" : ""}>+1 (1 SP)</button>
        </div>`;
        }).join("");
      })()}
    </div>
    <div class="panel">
      <h2>Sessions</h2>
      <div class="trainrow">
        <span>Daily drill<br><span class="sub">+40 XP · once per matchday</span></span>
        <button class="btn" id="drill" ${S.trainedToday ? "disabled" : ""}>150 GP</button>
      </div>
      <div class="trainrow">
        <span>Elite session <span class="badge gold">LC</span><br><span class="sub">+1 stat point instantly</span></span>
        <button class="btn gold" id="boost">8 LC</button>
      </div>
      <p class="sub" style="margin-top:8px">Legend Coins accelerate progress — they never buy anything GP can't eventually earn.</p>
    </div>
    ${navHTML("train")}
  </div>`;
}

// ---- Shop (dual-currency uses) ----
function shopScreen() {
  S.cosmetics = S.cosmetics || {};
  setTimeout(() => {
    const buy = (id, fn) => { const el = $("#" + id); if (el) el.onclick = fn; };
    buy("scout", () => {
      if (S.buff) { toast("A boost is already active"); return; }
      if (S.gp < 250) { toast("Not enough GP"); return; }
      S.gp -= 250; S.buff = { stats: 2, matches: 1 }; save();
      toast("Scout report studied: +2 all stats next match"); render(shopScreen);
    });
    buy("scout3", () => {
      if (S.buff) { toast("A boost is already active"); return; }
      if (S.gp < 600) { toast("Not enough GP"); return; }
      S.gp -= 600; S.buff = { stats: 2, matches: 3 }; save();
      toast("Bulk scout prep: +2 all stats for 3 matches (saved 150 GP)"); render(shopScreen);
    });
    buy("energy", () => {
      if (S.condition >= 95) { toast("Already fresh"); return; }
      if (S.gp < 200) { toast("Not enough GP"); return; }
      S.gp -= 200; S.condition = Math.min(100, S.condition + 25); save();
      toast("Energy drink: +25 condition"); render(shopScreen);
    });
    buy("physio", () => {
      if (S.form >= 2) { toast("Form is already maxed"); return; }
      if (S.gp < 300) { toast("Not enough GP"); return; }
      S.gp -= 300; S.form = Math.min(2, S.form + 1); save();
      toast("Recovery session: +1 form"); render(shopScreen);
    });
    buy("boots", () => {
      if (S.cosmetics.boots) { toast("Already owned"); return; }
      if (S.gp < 800) { toast("Not enough GP"); return; }
      S.gp -= 800; S.cosmetics.boots = true; save();
      toast("Golden boots equipped ✨"); render(shopScreen);
    });
    buy("megaboost", () => {
      if (S.buff) { toast("A boost is already active"); return; }
      if (S.nl < 12) { toast("Not enough Legend Coins"); return; }
      S.nl -= 12; S.buff = { stats: 4, matches: 3 }; save();
      toast("Elite prep: +4 all stats for 3 matches"); render(shopScreen);
    });
    buy("showtrial", () => {
      if (S.cardType !== "standard") { toast("You already hold a special card"); return; }
      if (S.nl < 20) { toast("Not enough Legend Coins"); return; }
      S.nl -= 20; S.cardType = "showtime"; S.cardTimer = 3; save();
      toast("🎬 SHOW TIME activated for 3 matches!"); render(shopScreen);
    });
    buy("agent", () => {
      if (S.transferRequest) { toast("Your agent is already on it"); return; }
      if (S.tier === 1) { toast("You're already at the top tier"); return; }
      if (S.nl < 25) { toast("Not enough Legend Coins"); return; }
      S.nl -= 25; S.transferRequest = true; save();
      toast("Agent hired — he'll push for a move at season's end"); render(shopScreen);
    });
    const lcPack = (amount, label) => () => {
      // PROTOTYPE: simulated purchase — real rails (Play Billing / regional providers) at launch
      S.nl += amount; save();
      toast(`Purchase simulated: +${amount} LC (${label})`);
      render(shopScreen);
    };
    buy("lcp1", lcPack(40, "Starter"));
    buy("lcp2", lcPack(230, "Pro"));
    buy("lcp3", lcPack(650, "Legend"));
    const upgrade = (key, costs, label) => () => {
      const lvl = S.upgrades[key];
      if (lvl >= costs.length) { toast("Max level"); return; }
      if (S.nl < costs[lvl]) { toast("Not enough Legend Coins"); return; }
      S.nl -= costs[lvl]; S.upgrades[key]++; save();
      toast(`${label} upgraded to Lv.${S.upgrades[key]}`); render(shopScreen);
    };
    buy("upfit", upgrade("fitness", [15, 30], "Fitness Coach"));
    buy("upmed", upgrade("medical", [15, 30], "Medical Staff"));
    buy("upagent", upgrade("agentNet", [20], "Agent Network"));
    buy("trim", () => {
      if (S.cosmetics.trim) { toast("Already owned"); return; }
      if (S.nl < 15) { toast("Not enough Legend Coins"); return; }
      S.nl -= 15; S.cosmetics.trim = true; save();
      toast("Gold card trim unlocked ✨"); render(shopScreen);
    });
  }, 0);
  const row = (id, icon, title, sub, cost, cls, owned) => `
    <div class="trainrow">
      <span>${icon} <b>${title}</b>${owned ? ' <span class="badge gold">OWNED</span>' : ""}<br><span class="sub">${sub}</span></span>
      <button class="btn ${cls}" id="${id}" ${owned ? "disabled" : ""}>${cost}</button>
    </div>`;
  return `<div class="screen">${topbar()}
    <div class="panel">
      <h2>🟢 GP Store <span class="sub">— earn by playing</span></h2>
      ${row("scout", "🔍", "Scout Report", "+2 all stats for the next match", "250 GP", "secondary", false)}
      ${row("physio", "🧊", "Recovery Session", "+1 form (max +2)", "300 GP", "secondary", false)}
      ${row("energy", "\u26a1", "Energy Drink", "+25 condition instantly", "200 GP", "secondary", false)}
      ${row("scout3", "\ud83d\udd0d", "Scout Bundle \u00d73", "+2 all stats, 3 matches (bulk saves 150 GP)", "600 GP", "secondary", false)}
      ${row("boots", "👟", "Golden Boots", "Cosmetic — shine on your card", "800 GP", "secondary", S.cosmetics.boots)}
    </div>
    <div class="panel">
      <h2>🟡 Legend Coin Store <span class="sub">— rare currency</span></h2>
      ${row("megaboost", "⚡", "Elite Match Prep", "+4 all stats for 3 matches", "12 LC", "gold", false)}
      ${row("showtrial", "🎬", "Show Time Trial", "Show Time card for 3 matches (standard card only)", "20 LC", "gold", false)}
      ${row("agent", "🤵", "Hire Super-Agent", "Guarantees transfer talks at season end", "25 LC", "gold", S.transferRequest)}
      ${row("trim", "✨", "Gold Card Trim", "Permanent cosmetic card upgrade", "15 LC", "gold", S.cosmetics.trim)}
    </div>
    <div class="panel">
      <h2>\ud83c\udfd7\ufe0f Permanent Upgrades <span class="sub">\u2014 Legend Coins</span></h2>
      <div class="trainrow">
        <span>\ud83c\udfc3 <b>Fitness Coach</b> <span class="badge gold">Lv.${S.upgrades.fitness}/2</span><br><span class="sub">\u221215% stamina drain/level, better recovery (max 2)</span></span>
        <button class="btn gold" id="upfit" style="width:auto;margin:0;padding:8px 14px;font-size:.8rem" ${S.upgrades.fitness >= 2 ? "disabled" : ""}>${S.upgrades.fitness >= 2 ? "MAX" : (S.upgrades.fitness ? "30" : "15") + " LC"}</button>
      </div>
      <div class="trainrow">
        <span>\u2695\ufe0f <b>Medical Staff</b> <span class="badge gold">Lv.${S.upgrades.medical}/2</span><br><span class="sub">\u221230% injury risk/level, faster recovery (max 2)</span></span>
        <button class="btn gold" id="upmed" style="width:auto;margin:0;padding:8px 14px;font-size:.8rem" ${S.upgrades.medical >= 2 ? "disabled" : ""}>${S.upgrades.medical >= 2 ? "MAX" : (S.upgrades.medical ? "30" : "15") + " LC"}</button>
      </div>
      <div class="trainrow">
        <span>\ud83c\udf10 <b>Agent Network</b> <span class="badge gold">Lv.${S.upgrades.agentNet}/1</span><br><span class="sub">Transfer interest one season earlier (max 1)</span></span>
        <button class="btn gold" id="upagent" style="width:auto;margin:0;padding:8px 14px;font-size:.8rem" ${S.upgrades.agentNet >= 1 ? "disabled" : ""}>${S.upgrades.agentNet >= 1 ? "MAX" : "20 LC"}</button>
      </div>
    </div>
    <div class="panel">
      <h2>\u{1F4B3} Get Legend Coins</h2>
      <div class="trainrow">
        <span>\u{1FA99} <b>Starter Pack</b><br><span class="sub">40 LC</span></span>
        <button class="btn gold" id="lcp1" style="width:auto;margin:0;padding:8px 14px;font-size:.8rem">$0.99</button>
      </div>
      <div class="trainrow">
        <span>\u{1F4B0} <b>Pro Pack</b> <span class="badge gold">+15% BONUS</span><br><span class="sub">230 LC</span></span>
        <button class="btn gold" id="lcp2" style="width:auto;margin:0;padding:8px 14px;font-size:.8rem">$4.99</button>
      </div>
      <div class="trainrow">
        <span>\u{1F48E} <b>Legend Pack</b> <span class="badge gold">+30% BONUS</span><br><span class="sub">650 LC</span></span>
        <button class="btn gold" id="lcp3" style="width:auto;margin:0;padding:8px 14px;font-size:.8rem">$12.99</button>
      </div>
      <p class="sub" style="margin-top:6px">Prototype: purchases are simulated free (no real payment rails yet).</p>
    </div>
    <div class="panel">
      <p class="sub">Active effects: ${S.buff ? `+${S.buff.stats} all stats (${S.buff.matches} match${S.buff.matches > 1 ? "es" : ""} left)` : "none"}${S.transferRequest ? " · Agent negotiating" : ""}</p>
      <p class="sub" style="margin-top:6px">Everything LC buys, patience earns. Accelerators, never gates.</p>
    </div>
    ${navHTML("shop")}
  </div>`;
}

// ---- Career ----
function balRetire(forced) {
  const avg = S.career.seasons.length ? (S.career.seasons.reduce((a, s2) => a + (+s2.avg || 0), 0) / S.career.seasons.length).toFixed(2) : "\u2014";
  const hof = { v: 1, t: Date.now(), name: S.name, pos: S.pos, region: S.region, age: S.age,
    seasons: S.career.seasons.length, apps: S.career.totalApps, goals: S.career.totalGoals,
    avg, level: S.level, rep: S.rep,
    titles: S.career.seasons.filter(s2 => s2.pos === 1).length,
    cups: S.flags.cupsWon || 0, cts: S.flags.ctsWon || 0,
    boots: S.career.seasons.filter(s2 => (s2.award || "").includes("GOLDEN BOOT")).length,
    lastClub: myClub().name };
  const hall = (() => { try { return JSON.parse(localStorage.getItem("flHallOfFame") || "[]"); } catch (e) { return []; } })();
  if (!S.retired) { // enshrine exactly once — re-rendering the farewell screen must not duplicate
    hall.unshift(hof);
    localStorage.setItem("flHallOfFame", JSON.stringify(hall.slice(0, 20)));
    if (window.flMirror) flMirror("flHallOfFame", JSON.stringify(hall.slice(0, 20)));
  }
  S.retired = true; save();
  render(() => {
    setTimeout(() => {
      const nb = $("#hofnew"); if (nb) nb.onclick = () => { localStorage.removeItem(SAVE_KEY); flMirror(SAVE_KEY, null); S = null; render(createScreen); };
      const mb = $("#hofmenu"); if (mb) mb.onclick = () => render(menuScreen);
    }, 0);
    return `<div class="screen">
      <div class="topbar"><div class="logo"><span class="brand1">HALL OF</span> <span class="legend">FAME</span></div></div>
      <div class="panel center">
        <h1>\ud83c\udfdf\ufe0f ${forced ? "THE FINAL WHISTLE" : "A LEGEND BOWS OUT"}</h1>
        <p class="sub" style="margin:8px 0">${S.name} retires at <b>${S.age}</b>${forced ? " \u2014 the body says enough" : " \u2014 on their own terms"}. The crowd rises as one.</p>
      </div>
      <div class="panel">
        <h2>\ud83d\udcdc Career of ${S.name}</h2>
        <div class="kv"><span>Seasons</span><b>${hof.seasons}</b></div>
        <div class="kv"><span>Apps / Goals</span><b>${hof.apps} / ${hof.goals}</b></div>
        <div class="kv"><span>Career avg rating</span><b>${hof.avg}</b></div>
        <div class="kv"><span>\ud83c\udfc6 League titles</span><b>${hof.titles}</b></div>
        <div class="kv"><span>\ud83c\udfc6 Cups</span><b>${hof.cups}</b></div>
        <div class="kv"><span>\ud83c\udf0d Champions Trophies</span><b>${hof.cts}</b></div>
        <div class="kv"><span>\ud83d\udc5f Golden Boots</span><b>${hof.boots}</b></div>
        <div class="kv"><span>Final club</span><b>${hof.lastClub}</b></div>
        <p class="sub" style="margin-top:6px">Enshrined in the Hall of Fame forever \u2014 view retired legends from the Career screen of any future save.</p>
        <button class="btn" id="hofnew">\u2b50 START A NEW LEGEND</button>
        <button class="btn secondary" id="hofmenu">MAIN MENU</button>
      </div>
    </div>`;
  });
}
function careerScreen() {
  setTimeout(() => {
    const nc = $("#newcareer");
    if (nc) nc.onclick = () => {
      if (nc.dataset.armed) {
        localStorage.removeItem(SAVE_KEY); S = null;
        render(createScreen);
      } else {
        nc.dataset.armed = "1"; nc.textContent = "⚠️ Tap again to confirm — erases this career";
        nc.classList.remove("secondary");
        setTimeout(() => { if ($("#newcareer")) { $("#newcareer").dataset.armed = ""; $("#newcareer").textContent = "🔄 Start New Career"; $("#newcareer").classList.add("secondary"); } }, 4000);
      }
    };
  }, 0);
  const avg = S.myStats.ratings.length ? (S.myStats.ratings.reduce((a, b) => a + b, 0) / S.myStats.ratings.length).toFixed(2) : "—";
  const hall = (() => { try { return JSON.parse(localStorage.getItem("flHallOfFame") || "[]"); } catch (e) { return []; } })();
  setTimeout(() => {
    const rb = $("#retirebtn");
    if (rb) rb.onclick = () => {
      if (rb.dataset.armed) { balRetire(false); }
      else {
        rb.dataset.armed = "1"; rb.textContent = "\u26a0\ufe0f Tap again \u2014 " + S.name + " retires FOREVER";
        setTimeout(() => { const b = $("#retirebtn"); if (b) { b.dataset.armed = ""; b.textContent = "\ud83d\udc4b RETIRE (age " + S.age + ")"; } }, 4000);
      }
    };
  }, 0);
  return `<div class="screen">${topbar()}
    ${playerCardHTML(true)}
    <div class="panel">
      <h2>Career</h2>
      <div class="kv"><span>Age</span><b>${S.age || "?"}${(S.age || 17) >= 41 ? " \u23f3 (forced retirement at 45)" : ""}</b></div>
      <div class="kv"><span>Reputation</span><b>${S.rep}</b></div>
      <div class="kv"><span>Career apps / goals</span><b>${S.career.totalApps} / ${S.career.totalGoals}</b></div>
      <div class="kv"><span>Season ${S.season} avg rating</span><b>${avg}</b></div>
      <div class="kv"><span>Card</span><b>${cardLabel()}${S.cardTimer ? ` (${S.cardTimer} matches left)` : ""}</b></div>
      ${(S.age || 17) >= 35 ? `<button class="btn secondary" id="retirebtn" style="margin-top:6px">\ud83d\udc4b RETIRE (age ${S.age})</button>
      <p class="sub">From 35 the choice is yours \u2014 at 45 it's made for you.</p>` : ""}
    </div>
    ${hall.length ? `<div class="panel">
      <h2>\ud83c\udfdb Hall of Fame</h2>
      ${hall.map(h => `<div class="kv"><span>\u2b50 ${h.name} <span class="sub">(${h.pos}, retired ${h.age})</span></span><b>${h.goals} goals \u00b7 ${h.titles}\ud83c\udfc6 ${h.cts ? h.cts + "\ud83c\udf0d" : ""}</b></div>`).join("")}
    </div>` : ""}
    ${S.career.seasons.map(s => `<div class="panel">
      <h2>Season ${s.n} · ${s.club}</h2>
      <div class="kv"><span>Finished</span><b>#${s.pos}</b></div>
      <div class="kv"><span>Goals / Assists</span><b>${s.goals} / ${s.assists}</b></div>
      <div class="kv"><span>Avg rating</span><b>${s.avg}</b></div>
      ${s.award ? `<div class="cardevent">${s.award}</div>` : ""}
    </div>`).join("")}
    <div class="panel">
      <h2>Manage Career</h2>
      <button class="btn secondary" id="newcareer">🔄 Start New Career</button>
      <p class="sub" style="margin-top:6px">Try a different position, playstyle, or region. Current career is erased after confirmation.</p>
    </div>
    ${navHTML("career")}
  </div>`;
}

// ---- abandoned match resolution (quit mid-match => sim result stands, no rewards) ----
function balResolveAbandoned() {
  if (!S || !S.mdLock) return false;
  const L = S.mdLock; S.mdLock = null;
  if (L.ct) { // abandoned Champions Trophy match — simulated, result stands
    const fx = { ct: true, ctStage: L.ctStage, ctMD: L.ctMD, ctX: L.ctX, ctY: L.ctY, ctHome: L.ctHome, opp: L.opp,
                 oppClub: E.ctClub(S.galaxy, L.opp), koPre: L.koPre };
    const Hc = L.ctHome ? myClub() : fx.oppClub, Ac = L.ctHome ? fx.oppClub : myClub();
    const r = E.simulateMatch(Hc, Ac, { seed: E.hashSeed(S.seed + ":aband:" + L.key), fast: true });
    let gH = r.gH, gA = r.gA;
    if (L.ctStage === "ko" && gH === gA) { if (Math.random() < 0.5) gH++; else gA++; } // pens
    balCtRecord(fx, gH, gA);
    const my2 = L.ctHome ? gH : gA, op2 = L.ctHome ? gA : gH;
    S.lastFive.push(my2 > op2 ? "W" : my2 === op2 ? "D" : "L"); if (S.lastFive.length > 5) S.lastFive.shift();
    pushNews("\u26a0\ufe0f You left the touchline mid-match. The CT tie finished " + gH + "-" + gA + " without your input.");
    save();
    return true;
  }
  const fx = { home: L.home, away: L.away, cup: L.cup };
  const r = E.simulateMatch(S.world.clubs[fx.home], S.world.clubs[fx.away],
    { seed: E.hashSeed(S.seed + ":aband:" + L.key), fast: true });
  const isHome = fx.home === S.clubIdx;
  let my = isHome ? r.gH : r.gA, op = isHome ? r.gA : r.gH;
  if (fx.cup) {
    if (my === op) { if (Math.random() < 0.5) my++; else op++; }
    if (my > op) S.cup.round++; else S.cup.alive = false;
    if (S.cup.round >= 3 && S.cup.alive) { S.flags.cupWinner = true; S.flags.cupsWon = (S.flags.cupsWon || 0) + 1; }
  } else {
    S.results.push({ home: fx.home, away: fx.away, gH: r.gH, gA: r.gA });
    for (const [h, a2] of (S.world.fixtures[S.matchday] || [])) {
      if (h === S.clubIdx || a2 === S.clubIdx) continue;
      const rr = E.simulateMatch(S.world.clubs[h], S.world.clubs[a2], { seed: E.hashSeed(S.seed + S.season + "md" + S.matchday + h + a2), fast: true });
      S.results.push({ home: h, away: a2, gH: rr.gH, gA: rr.gA });
    }
    S.matchday++;
    balGalaxySim();
  }
  S.lastFive.push(my > op ? "W" : my === op ? "D" : "L"); if (S.lastFive.length > 5) S.lastFive.shift();
  pushNews("\u26a0\ufe0f You left the touchline mid-match. It finished " + r.gH + "-" + r.gA + " without your input.");
  save();
  return true;
}

// ---- Season rollover + transfers ----
function balSwitchLeague(li, ci, midSeason) { // cross-league move within the galaxy
  if (!S.galaxy) return;
  S.galaxy.leagues[S.leagueIdx].results = (S.results || []).slice(); // hand my league back to the sim
  S.leagueIdx = li; S.clubIdx = ci;
  const L = S.galaxy.leagues[li];
  S.world = { tier: S.tier, clubs: L.clubs, fixtures: L.fixtures, h2h: {} };
  if (midSeason) { S.results = (L.results || []).slice(); S.lastFive = []; }
}
function startNewSeason() {
  if (S.galaxy && S.ct && S.ct.alive && !S.ct.done && balCtFixture()) { toast("\ud83c\udf0d Champions Trophy still live \u2014 play your CT tie first!"); render(previewScreen); return; }
  if (S.galaxy) { // close out the world season BEFORE transfers/rollover
    balGalaxySim();
    S.galaxy.leagues[S.leagueIdx].results = (S.results || []).slice();
    S.pendingQual = E.galaxyRollover(S.galaxy, S.seed, S.season);
  }
  const t = E.computeTable(S.world.clubs, S.results);
  const myPos = t.findIndex(r => r.i === S.clubIdx) + 1;
  const avg = S.myStats.ratings.length ? S.myStats.ratings.reduce((a, b) => a + b, 0) / S.myStats.ratings.length : 6;
  let award = null;
  if (avg >= 7.6) { S.cardType = "bigtime"; S.cardTimer = 0; award = "🏆 BIG TIME CARD — league Best XI season! (+3 all stats, permanent until upgraded)"; }
  const boot = Object.entries(S.scorers).sort((x, y) => y[1] - x[1])[0];
  const wonBoot = boot && boot[0] === S.name;
  const champion = myPos === 1;
  if (champion) { S.gp += 500; pushNews("\ud83c\udfc6 CHAMPIONS! " + myClub().name + " win the league! (+500 GP)"); }
  if (wonBoot) { S.gp += 300; pushNews("\ud83d\udc5f GOLDEN BOOT: " + S.name + " with " + boot[1] + " goals! (+300 GP)"); }
  if (avg >= 7.3 && !award) pushNews("\ud83c\udf1f " + S.name + " named in the league's Team of the Season.");
  S.career.seasons.push({
    n: S.season, club: myClub().name, pos: myPos,
    goals: S.myStats.goals, assists: S.myStats.assists, avg: avg.toFixed(2),
    award: award || (champion ? "\ud83c\udfc6 LEAGUE CHAMPION" : wonBoot ? "\ud83d\udc5f GOLDEN BOOT" : null)
  });
  // transfer offer: strong season in tier 0 → move to Euro league
  const transferBar = S.transferRequest ? (avg >= 6.6 || S.myStats.goals >= 9) : (avg >= 7.2 || S.myStats.goals >= 15);
  // aging: gentle decline from 35 (−1 to two random stats/season), legendary card holds the line
  if ((S.age || 17) >= 35 && S.cardType !== "legendary") {
    const keys = Object.keys(S.stats);
    for (let i = 0; i < 2; i++) {
      const k = keys[Math.floor(Math.random() * keys.length)];
      S.stats[k] = Math.max(40, S.stats[k] - 1);
    }
    pushNews("\u23f3 Age " + (S.age + 1) + " next season \u2014 the legs lose a step (\u22121 to two stats). Training can fight it.");
  }
  if (S.galaxy && transferBar && (S.season >= (S.upgrades.agentNet ? 1 : 2) || S.transferRequest)) {
    render(() => transferOfferScreen(avg, myPos));
    return;
  }
  if (award) toast("Big Time season!");
  finishSeasonRollover();
}

// ============================ GIFTS: scheduled events + redeem codes ============================
const FL_GIFT_EVENTS = [ // date-based, offline, same for every player (shipped in updates)
  { id: "worldupdate26", from: "2026-09-01", to: "2026-09-30", title: "\ud83c\udf0d World Update Celebration",
    gp: 1500, lc: 15, mlgp: 3, mllc: 15 },
  { id: "xmas26", from: "2026-12-18", to: "2027-01-05", title: "\ud83c\udf84 Festive Gift",
    gp: 2000, lc: 20, mlgp: 4, mllc: 20, pl: { name: "Noel Santana", pos: "FW", ovr: 86, card: "showtime" } }
];
function flGiftClaimed() { try { return JSON.parse(localStorage.getItem("flGiftsClaimed") || "[]"); } catch (e) { return []; } }
function flGiftMarkClaimed(id) {
  const c = flGiftClaimed(); if (!c.includes(id)) c.push(id);
  localStorage.setItem("flGiftsClaimed", JSON.stringify(c)); if (window.flMirror) flMirror("flGiftsClaimed", JSON.stringify(c));
}
var FL_CLOUD_EVENTS = []; // refreshed from the server when online; [] offline
var FL_CLOUD_EVENTS_AT = 0;
function flRefreshCloudEvents(cb) {
  if (!window.Cloud || !Cloud.enabled()) return;                 // offline: nothing to do, no cb
  if (Date.now() - FL_CLOUD_EVENTS_AT < 5 * 60 * 1000) return;   // 5-min cache stops re-render loops
  FL_CLOUD_EVENTS_AT = Date.now();
  Cloud.fetchEvents().then(ev => { FL_CLOUD_EVENTS = ev || []; if (cb) cb(); }).catch(() => {});
}
function flGiftsLive() {
  const now = new Date().toISOString().slice(0, 10);
  const all = FL_GIFT_EVENTS.concat(FL_CLOUD_EVENTS.filter(c => !FL_GIFT_EVENTS.some(g => g.id === c.id)));
  return all.filter(g => now >= g.from && now <= g.to && !flGiftClaimed().includes(g.id));
}
function flQueueMlGift(g) { // ML applies it on next ML.enter()
  try {
    const q = JSON.parse(localStorage.getItem("flMlGifts") || "[]");
    q.push(g);
    localStorage.setItem("flMlGifts", JSON.stringify(q)); if (window.flMirror) flMirror("flMlGifts", JSON.stringify(q));
  } catch (e) {}
}
function flApplyGift(g) { // BaL part instantly, ML part queued
  if (S && !S.retired) {
    if (g.gp) S.gp += g.gp;
    if (g.lc) S.nl += g.lc;
    if (g.gp || g.lc) pushNews("\ud83c\udf81 " + (g.title || "Gift") + ": +" + (g.gp || 0) + " GP, +" + (g.lc || 0) + " LC!");
    save();
  }
  if (g.mlgp || g.mllc || g.pl) flQueueMlGift({ id: g.id, title: g.title, mlgp: g.mlgp, mllc: g.mllc, pl: g.pl });
  flGiftMarkClaimed(g.id);
  flGiftLog(g);
}
function flGiftLog(g) { // rolling history for the Gifts screen (cap 30)
  try {
    const h = JSON.parse(localStorage.getItem("flGiftHistory") || "[]");
    h.unshift({ t: Date.now(), title: g.title || g.note || "Gift", gp: g.gp || 0, lc: g.lc || 0, mlgp: g.mlgp || 0, mllc: g.mllc || 0, pl: g.pl ? g.pl.name + " (" + g.pl.ovr + ")" : null });
    const v = JSON.stringify(h.slice(0, 30));
    localStorage.setItem("flGiftHistory", v); if (window.flMirror) flMirror("flGiftHistory", v);
  } catch (e) {}
}
// Redeem codes: TEMPLATE-SERIAL-CHECK, verified offline via hash; single-use per save
const FL_CODE_SECRET = "flgift-s3cr3t-2026";
const FL_CODE_TEMPLATES = {
  WELCOME26: { title: "Welcome Pack", gp: 1000, lc: 10, mlgp: 2, mllc: 10 },
  STRIKER26: { title: "\ud83c\udf81 Event Striker", mllc: 5, pl: { name: "Ade Blackwood", pos: "FW", ovr: 87, card: "showtime" } },
  KEEPER26:  { title: "\ud83c\udf81 Event Keeper", mllc: 5, pl: { name: "Viktor Hale", pos: "GK", ovr: 86, card: "bigtime" } },
  MEGA26:    { title: "\ud83d\udc8e Mega Pack", gp: 3000, lc: 30, mlgp: 6, mllc: 30 }
};
function flRedeem(codeRaw) {
  const code = (codeRaw || "").trim().toUpperCase();
  const parts = code.split("-");
  if (parts.length !== 3) return { ok: false, msg: "Format: TEMPLATE-SERIAL-CHECK" };
  const [tpl, serial, chk] = parts;
  const t = FL_CODE_TEMPLATES[tpl];
  if (!t) return { ok: false, msg: "Unknown code" };
  const want = (E.hashSeed(tpl + "-" + serial + "-" + FL_CODE_SECRET) >>> 0).toString(36).slice(0, 4).toUpperCase();
  if (chk !== want) return { ok: false, msg: "Invalid code" };
  const used = (() => { try { return JSON.parse(localStorage.getItem("flCodesUsed") || "[]"); } catch (e) { return []; } })();
  if (used.includes(code)) return { ok: false, msg: "Code already redeemed on this device" };
  used.push(code);
  localStorage.setItem("flCodesUsed", JSON.stringify(used)); if (window.flMirror) flMirror("flCodesUsed", JSON.stringify(used));
  flApplyGift(Object.assign({ id: "code:" + code }, t));
  return { ok: true, msg: t.title };
}
function giftsScreen() {
  flRefreshCloudEvents(() => { /* re-render if new events arrived */
    if (FL_CLOUD_EVENTS.length && document.querySelector("#redeemin")) render(giftsScreen);
  });
  const live = flGiftsLive();
  setTimeout(() => {
    document.querySelectorAll("[data-claimg]").forEach(b => b.onclick = () => {
      const g = flGiftsLive().find(x => x.id === b.dataset.claimg); // merged: built-in + cloud events
      if (!g) return;
      flApplyGift(g);
      toast("\ud83c\udf81 " + g.title + " claimed!" + (g.pl || g.mlgp || g.mllc ? " ML rewards arrive when you open Master League." : ""));
      render(giftsScreen);
    });
    const rd = $("#redeembtn"); if (rd) rd.onclick = () => {
      const codeVal = $("#redeemin").value;
      if (window.Cloud && Cloud.signedIn()) {
        Cloud.redeemOnline(codeVal).then(rr => {
          const r2 = rr || flRedeem(codeVal); // null = unknown online -> fall back to built-in codes
          toast(r2.msg); if (r2.ok) { render(giftsScreen); }
        });
        return;
      }
      const r = flRedeem($("#redeemin").value);
      toast(r.ok ? "\u2705 Redeemed: " + r.msg : "\u274c " + r.msg);
      if (r.ok) { $("#redeemin").value = ""; render(giftsScreen); }
    };
    $("#giftback").onclick = () => render(menuScreen);
  }, 0);
  return `<div class="screen">
    <div class="topbar"><div class="logo"><span class="brand1">GIFTS &</span> <span class="legend">EVENTS</span></div></div>
    <div class="panel">
      <h2>\ud83c\udf81 Live Events</h2>
      ${live.length ? live.map(g => `<div class="kv"><span>${g.title}<br><span class="sub">until ${g.to}${g.pl ? " \u00b7 includes " + g.pl.name + " (" + g.pl.ovr + ")" : ""}</span></span><button class="btn" data-claimg="${g.id}">CLAIM</button></div>`).join("")
        : '<p class="sub">No live events right now \u2014 new gifts arrive with updates and special dates. Check back!</p>'}
      ${flGiftClaimed().length ? `<p class="sub" style="margin-top:6px">\u2705 Claimed: ${flGiftClaimed().filter(i => !i.startsWith("code:")).length} event${flGiftClaimed().length > 1 ? "s" : ""}</p>` : ""}
    </div>
    <div class="panel">
      <h2>\ud83c\udff7 Redeem a Code</h2>
      <p class="sub">Codes are shared on our WhatsApp/social channels \u2014 free players, GP and Legend Coins.</p>
      <input id="redeemin" placeholder="e.g. WELCOME26-AB12-XXXX" style="width:100%;padding:10px;border-radius:8px;border:1px solid #333;background:#101812;color:#e8e8e8;margin:6px 0" />
      <button class="btn" id="redeembtn">REDEEM \ud83c\udf81</button>
    </div>
    ${(() => { try {
      const h = JSON.parse(localStorage.getItem("flGiftHistory") || "[]");
      if (!h.length) return "";
      return `<div class="panel"><h2>\ud83d\udcdc Gift History</h2>${h.slice(0, 30).map(x => {
        const parts = [];
        if (x.gp) parts.push("+" + x.gp + " GP"); if (x.lc) parts.push("+" + x.lc + " LC");
        if (x.mlgp) parts.push("+" + x.mlgp + "M ML"); if (x.mllc) parts.push("+" + x.mllc + " ML LC");
        if (x.pl) parts.push("\u2b50 " + x.pl);
        return `<div class="kv"><span>${x.title}<br><span class="sub">${new Date(x.t).toLocaleDateString()}</span></span><b class="sub">${parts.join(" \u00b7 ") || "\u2014"}</b></div>`;
      }).join("")}</div>`;
    } catch (e) { return ""; } })()}
    <button class="btn secondary" id="giftback">\u2b05 Main Menu</button>
  </div>`;
}
// ============================ LEADERBOARDS (cloud) ============================
var FL_LB_CACHE = { bal: null, ml: null, at: 0, seasons: null, season: null, seasonRows: null };
function leaderboardScreen() {
  const mode = window._lbMode || "bal";
  const seasonId = window._lbSeason || "live"; // "live" | "2026-09" | ...
  const fresh = Date.now() - FL_LB_CACHE.at < 3 * 60 * 1000;
  if (window.Cloud && Cloud.enabled() && !fresh) {
    FL_LB_CACHE.at = Date.now();
    const jobs = [
      Cloud.fetchLeaderboard("bal"),
      Cloud.fetchLeaderboard("ml"),
      Cloud.fetchSeasons ? Cloud.fetchSeasons() : Promise.resolve([])
    ];
    Promise.all(jobs).then(([b, m, seasons]) => {
      FL_LB_CACHE.bal = b; FL_LB_CACHE.ml = m; FL_LB_CACHE.seasons = seasons || [];
      if (document.querySelector("#lbback")) render(leaderboardScreen);
    });
  }
  // season board fetch (separate cache key)
  if (window.Cloud && Cloud.enabled() && seasonId !== "live" &&
      (FL_LB_CACHE.season !== seasonId + ":" + mode || FL_LB_CACHE.seasonRows == null)) {
    FL_LB_CACHE.season = seasonId + ":" + mode;
    FL_LB_CACHE.seasonRows = null;
    Cloud.fetchSeasonBoard(mode, seasonId).then(res => {
      FL_LB_CACHE.seasonRows = (res && res.rows) || [];
      if (document.querySelector("#lbback")) render(leaderboardScreen);
    });
  }
  setTimeout(() => {
    const tb = $("#lbbal"); if (tb) tb.onclick = () => { window._lbMode = "bal"; FL_LB_CACHE.seasonRows = null; render(leaderboardScreen); };
    const tm = $("#lbml"); if (tm) tm.onclick = () => { window._lbMode = "ml"; FL_LB_CACHE.seasonRows = null; render(leaderboardScreen); };
    document.querySelectorAll("[data-lbs]").forEach(o => o.onclick = () => {
      window._lbSeason = o.dataset.lbs; FL_LB_CACHE.seasonRows = null; FL_LB_CACHE.season = null; render(leaderboardScreen);
    });
    $("#lbback").onclick = () => render(menuScreen);
  }, 0);
  const myPid = flPlayerId();
  const seasons = FL_LB_CACHE.seasons || [];
  let rows, body;
  if (seasonId === "live") rows = FL_LB_CACHE[mode];
  else rows = FL_LB_CACHE.seasonRows;

  if (!window.Cloud || !Cloud.enabled()) body = '<p class="sub">Leaderboards need the online service \u2014 not configured in this build.</p>';
  else if (rows == null) body = '<p class="sub">\u23f3 Loading global rankings\u2026</p>';
  else if (!rows.length) body = '<p class="sub">No ranked players yet \u2014 sign in and play to claim the #1 spot!</p>';
  else if (mode === "bal") {
    body = rows.map((r, i) => {
      const rank = r.rank || (i + 1);
      const pname = r.pname || (r.detail && r.detail.pname) || r.name;
      const pos = r.pos || (r.detail && r.detail.pos) || "?";
      const rep = r.rep != null ? r.rep : (r.detail && r.detail.rep) || 0;
      const level = r.level != null ? r.level : (r.detail && r.detail.level) || 0;
      const goals = r.goals != null ? r.goals : (r.detail && r.detail.goals) || 0;
      const apps = r.apps != null ? r.apps : (r.detail && r.detail.apps) || 0;
      const season = r.season != null ? r.season : (r.detail && r.detail.season) || "?";
      return `<div class="kv" ${r.player_id === myPid ? 'style="color:var(--gold)"' : ""}>
      <span>${rank}. ${pname} <span class="sub">(${pos})</span>${r.player_id === myPid ? " (YOU)" : ""}<br>
      <span class="sub">${r.name} \u00b7 S${season} \u00b7 ${goals} goals / ${apps} apps</span></span>
      <b>\u2b50 ${rep} rep \u00b7 Lv ${level}</b></div>`;
    }).join("");
  } else {
    body = rows.map((r, i) => {
      const rank = r.rank || (i + 1);
      const club = r.club || (r.detail && r.detail.club) || "?";
      const trophies = r.trophies != null ? r.trophies : (r.detail && r.detail.trophies) || 0;
      const budget = r.budget != null ? r.budget : (r.detail && r.detail.budget) || 0;
      const squad = r.squad_n != null ? r.squad_n : (r.detail && r.detail.squad_n) || 0;
      const season = r.season != null ? r.season : (r.detail && r.detail.season) || "?";
      return `<div class="kv" ${r.player_id === myPid ? 'style="color:var(--gold)"' : ""}>
      <span>${rank}. ${club}${r.player_id === myPid ? " (YOU)" : ""}<br>
      <span class="sub">${r.name} \u00b7 S${season} \u00b7 ${squad} players</span></span>
      <b>\ud83c\udfc6 ${trophies} \u00b7 ${Math.round(budget)}M</b></div>`;
    }).join("");
  }
  const seasonChips = [`<div class="opt ${seasonId === "live" ? "sel" : ""}" data-lbs="live" style="flex:0 0 auto;padding:6px 10px;font-size:.7rem">LIVE</div>`]
    .concat(seasons.slice(0, 6).map(s =>
      `<div class="opt ${seasonId === s.id ? "sel" : ""}" data-lbs="${s.id}" style="flex:0 0 auto;padding:6px 10px;font-size:.7rem">${s.label || s.id}${s.closed ? "" : " \u00b7 open"}</div>`
    )).join("");
  return `<div class="screen">
    <div class="topbar"><div class="logo"><span class="brand1">GLOBAL</span> <span class="legend">RANKINGS</span></div></div>
    <div class="viewrow" style="gap:6px;margin-bottom:8px">
      <button class="btn secondary ${mode === "bal" ? "on" : ""}" id="lbbal" style="flex:1">\u2b50 LEGENDS</button>
      <button class="btn secondary ${mode === "ml" ? "on" : ""}" id="lbml" style="flex:1">\ud83c\udfc6 CLUBS</button>
    </div>
    <div class="optrow" style="flex-wrap:nowrap;overflow-x:auto;margin-bottom:8px">${seasonChips}</div>
    <div class="panel">
      <h2>${mode === "bal" ? "\u2b50 Top Legends \u00b7 by reputation" : "\ud83c\udfc6 Top Clubs \u00b7 by trophies"}${seasonId !== "live" ? " \u00b7 " + seasonId : ""}</h2>
      ${body}
      <p class="sub" style="margin-top:8px">Live boards update from cloud saves. Closed seasons are snapshots \u2014 top 3 earn auto-gifts via inbox. Cheated saves never make it here.</p>
    </div>
    <button class="btn secondary" id="lbback">\u2b05 Main Menu</button>
  </div>`;
}
// ============================ OWNER PANEL (superuser) ============================
// Owner key is verified SERVER-SIDE (edge fn verify-owner). No hash ships in the APK.
// Offline/dev fallback: only accounts that already had ownerMode=true keep it locally.
function flIsOwner() { return getSet().ownerMode === true; }
function ownerScreen() {
  if (!flIsOwner()) { render(menuScreen); return ""; }
  const mlS = (() => { try { return JSON.parse(localStorage.getItem("footballLegendML_v1")); } catch (e) { return null; } })();
  setTimeout(() => {
    const grant = (fn) => { fn(); save && S && save(); toast("\u2705 Done"); render(ownerScreen); };
    const g1 = $("#owbalgp"); if (g1) g1.onclick = () => grant(() => { if (S) S.gp += 10000; });
    const g2 = $("#owballc"); if (g2) g2.onclick = () => grant(() => { if (S) S.nl += 100; });
    const g3 = $("#owmlgp"); if (g3) g3.onclick = () => { flQueueMlGift({ id: "own:" + Date.now(), title: "Owner grant", mlgp: 50 }); toast("\u2705 Queued \u2014 open ML"); };
    const g4 = $("#owmllc"); if (g4) g4.onclick = () => { flQueueMlGift({ id: "own:" + Date.now(), title: "Owner grant", mllc: 100 }); toast("\u2705 Queued \u2014 open ML"); };
    const ge = $("#owevents"); if (ge) ge.onclick = () => { FL_CLOUD_EVENTS_AT = 0; flRefreshCloudEvents(() => { toast("\ud83c\udf81 " + FL_CLOUD_EVENTS.length + " cloud event(s) loaded"); render(ownerScreen); }); toast("Refreshing\u2026"); };
    const sp = $("#owspawn"); if (sp) sp.onclick = () => {
      const pos = $("#owpos").value, ovr = Math.max(60, Math.min(94, +($("#owovr").value || 88))), card = $("#owcard").value;
      flQueueMlGift({ id: "own:" + Date.now(), title: "Owner spawn", pl: { pos, ovr, card } });
      toast("\u2705 " + card + " " + pos + " " + ovr + " queued \u2014 open ML");
    };
    const sk = $("#owskills"); if (sk) sk.onclick = () => grant(() => { if (S) { S.skillSlotsBought = 3; } });
    const cd = $("#owcamp"); if (cd) cd.onclick = () => { try { const M2 = JSON.parse(localStorage.getItem("footballLegendML_v1")); if (M2) { M2.campDue = true; localStorage.setItem("footballLegendML_v1", JSON.stringify(M2)); if (window.flMirror) flMirror("footballLegendML_v1", JSON.stringify(M2)); } toast("\u2705 Camp reset"); } catch (e) {} };
    const js = $("#owjump"); if (js) js.onclick = () => grant(() => { if (S) { S.matchday = 18; } });
    const co = $("#owcode"); if (co) co.onclick = () => {
      const tpl = $("#owtpl").value;
      const serial = Math.random().toString(36).slice(2, 6).toUpperCase();
      const chk = (E.hashSeed(tpl + "-" + serial + "-" + FL_CODE_SECRET) >>> 0).toString(36).slice(0, 4).toUpperCase();
      $("#owcodeout").value = tpl + "-" + serial + "-" + chk;
      $("#owcodeout").style.display = "block";
    };
    const dbgB = $("#owdbg"); if (dbgB) dbgB.onclick = () => {
      const fx = S && !S.retired ? myNextFixture() : null;
      let txt = "seed: " + (S ? S.seed : "-") + "\nseason/md: " + (S ? S.season + "/" + S.matchday : "-");
      if (fx) {
        const H = S.world.clubs[fx.home], A = S.world.clubs[fx.away];
        const p = E.winProbs(H, A, 2000);
        txt += "\nnext: " + H.short + " (str " + H.str + ") v " + A.short + " (str " + A.str + ")\nodds@2000 sims: " + p.home + "/" + p.draw + "/" + p.away;
      }
      if (mlS) txt += "\nML: s" + mlS.season + " md" + mlS.matchday + " budget " + mlS.budget + "M lc " + (mlS.lc || 0) + " squad " + (mlS.squad || []).length;
      txt += "\ngifts queued: " + (localStorage.getItem("flMlGifts") || "[]");
      $("#owdbgout").value = txt; $("#owdbgout").style.display = "block";
    };
    const off = $("#owoff"); if (off) off.onclick = () => { setSet("ownerMode", false); toast("Owner mode OFF"); render(menuScreen); };
    $("#owback").onclick = () => render(menuScreen);
  }, 0);
  return `<div class="screen">
    <div class="topbar"><div class="logo"><span class="brand1">OWNER</span> <span class="legend">PANEL</span></div></div>
    <div class="panel"><h2>\ud83d\udc51 Superuser \u00b7 ${flPlayerId()}</h2>
      <p class="sub">Testing & content tools. Owner-only \u2014 gated by Player ID + key.</p></div>
    <div class="panel"><h2>\ud83d\udcb0 Currency</h2>
      <div class="optrow">
        <button class="btn secondary" id="owbalgp" style="flex:1">BaL +10,000 GP</button>
        <button class="btn secondary" id="owballc" style="flex:1">BaL +100 LC</button>
      </div>
      <div class="optrow">
        <button class="btn secondary" id="owmlgp" style="flex:1">ML +50M GP</button>
        <button class="btn secondary" id="owmllc" style="flex:1">ML +100 LC</button>
      </div>
    </div>
    <div class="panel"><h2>\ud83c\udfad Spawn ML Player</h2>
      <div class="optrow">
        <select id="owpos" style="flex:1;padding:8px;background:#101812;color:#e8e8e8;border:1px solid #333;border-radius:8px"><option>FW</option><option>MF</option><option>DF</option><option>GK</option></select>
        <input id="owovr" value="88" style="flex:1;padding:8px;background:#101812;color:#e8e8e8;border:1px solid #333;border-radius:8px" />
        <select id="owcard" style="flex:1;padding:8px;background:#101812;color:#e8e8e8;border:1px solid #333;border-radius:8px"><option>legendary</option><option>bigtime</option><option>showtime</option><option>trending</option></select>
      </div>
      <button class="btn secondary" id="owspawn">SPAWN \u2192 queued for ML</button>
    </div>
    <div class="panel"><h2>\ud83d\udee0 Utilities</h2>
      <div class="optrow">
        <button class="btn secondary" id="owskills" style="flex:1">Unlock BaL skill slots</button>
        <button class="btn secondary" id="owcamp" style="flex:1">Reset ML camp</button>
        <button class="btn secondary" id="owjump" style="flex:1">Jump to season end</button>
      </div>
    </div>
    <div class="panel"><h2>\ud83c\udff7 Generate Redeem Code</h2>
      <select id="owtpl" style="width:100%;padding:8px;background:#101812;color:#e8e8e8;border:1px solid #333;border-radius:8px">${Object.keys(FL_CODE_TEMPLATES).map(t => `<option>${t}</option>`).join("")}</select>
      <button class="btn secondary" id="owcode" style="margin-top:6px">GENERATE</button>
      <textarea id="owcodeout" readonly style="width:100%;height:44px;display:none;margin-top:6px" onclick="this.select()"></textarea>
      <p class="sub">Each generated code is unique & single-use per device. Share on WhatsApp/social.</p>
    </div>
    <div class="panel"><h2>\ud83e\udde0 Debug</h2>
      <button class="btn secondary" id="owdbg">ENGINE SNAPSHOT (seeds, true odds, state)</button>
    </div>
    <div class="panel"><h2>\u2601\ufe0f Cloud</h2>
      <div class="kv"><span>Status</span><b>${window.Cloud && Cloud.enabled() ? (Cloud.signedIn() ? "\u2705 " + Cloud.accountEmail() : "configured, not signed in") : "not configured"}</b></div>
      <p class="sub">Full remote management (all players, live events, codes, bans, analytics) lives in the web Admin Console \u2014 open <b>/admin/</b> on the game's web address and sign in with an admin Google account.</p>
      <button class="btn secondary" id="owevents">\ud83d\udd04 FORCE-REFRESH CLOUD EVENTS</button>
      <textarea id="owdbgout" readonly style="width:100%;height:120px;display:none;margin-top:6px" onclick="this.select()"></textarea>
    </div>
    <button class="btn secondary" id="owoff">\ud83d\udd12 Turn owner mode OFF</button>
    <button class="btn secondary" id="owback">\u2b05 Main Menu</button>
  </div>`;
}

// ---------- Boot ----------
load();
if (S) {
  S.flags = S.flags || { wins: 0, bestRating: 0, hatTrick: false, cleanSheets: 0 };
  if (S.age == null) { S.age = Math.min(44, 16 + S.season); S.retired = false; save(); } // v1.3: ages arrive
  if (!S.galaxy) { // v1.2 world update migration: existing careers get the 6-league galaxy
    try {
      S.galaxy = E.makeGalaxy(S.seed);
      S.leagueIdx = S.tier === 0 ? E.leagueForRegion(S.region) : 0;
      S.galaxy.leagues[S.leagueIdx].clubs = S.world.clubs;
      S.galaxy.leagues[S.leagueIdx].fixtures = S.world.fixtures;
      S.galMD = 0; S.ct = null; S.janOffered = false; S.janOffer = null;
      balGalaxySim();
      pushNews("\ud83c\udf0d WORLD UPDATE: five more leagues now play alongside yours \u2014 win yours to reach the Champions Trophy.");
      save();
    } catch (e) {}
  }
  S.objectives = S.objectives || {};
  for (const k in S.objectives) if (S.objectives[k] === true) S.objectives[k] = 1;
  S.news = S.news || [];
  S.scorers = S.scorers || {};
  S.cosmetics = S.cosmetics || {};
  S.cup = S.cup || { round: 0, alive: true };
  S.natPos = S.natPos || S.pos;
  if (S.condition === undefined) S.condition = 100;
  if (S.injury === undefined) S.injury = 0;
  S.upgrades = S.upgrades || { fitness: 0, medical: 0, agentNet: 0 };
  S.skills = S.skills || []; S.skillSlotsBought = S.skillSlotsBought || 0;
  if (S.loginStreak === undefined) { S.lastLogin = null; S.loginStreak = 0; }
  // Strip skills illegal for current position (e.g. old GK saves with Outside Curler)
  if (E.skillsActive) {
    const cleaned = E.skillsActive(S.skills, S.pos);
    if (cleaned.length !== S.skills.length) { S.skills = cleaned; try { save(); } catch (e) {} }
  }
  // Ensure playstyle still legal for pos
  if (E.stylesFor) {
    const st = E.stylesFor(S.pos) || [];
    if (st.length && !st.some(x => x.id === S.playstyle)) { S.playstyle = st[0].id; try { save(); } catch (e) {} }
  }
}
// migration: older saves used positions/fields that no longer exist
if (S && (!E.POSITIONS[S.pos] || !S.playstyle)) { S = null; localStorage.removeItem(SAVE_KEY); }
if (S && S.name) {
  const today = new Date().toDateString();
  if (S.lastLogin !== today) {
    S.loginStreak = (S.lastLogin === new Date(Date.now() - 864e5).toDateString()) ? (S.loginStreak || 0) + 1 : 1;
    S.lastLogin = today;
    const gp = 100 + Math.min(6, S.loginStreak) * 25;
    const lc = S.loginStreak % 7 === 0 ? 5 : 0;
    S.gp += gp; S.nl += lc; save();
    setTimeout(() => toast(`\ud83d\udcc5 Day ${S.loginStreak} login: +${gp} GP${lc ? " +" + lc + " LC" : ""}`), 600);
  }
  render(menuScreen);
} else render(menuScreen);
// native save restore (wrapped app only): if localStorage was evicted, pull from Preferences and reboot
if (window.Capacitor) {
  flRestoreFromNative().then(async () => {
    if (!S && localStorage.getItem(SAVE_KEY)) { location.reload(); return; }
    const restored = await flFileRestoreCheck(); // uninstall-proof: Documents backup prompt
    if (restored) { toast("\u2705 Careers restored!"); setTimeout(() => location.reload(), 900); }
  });
}


// ============================ MAIN MENU ============================
var FL_BROADCAST = null, FL_BROADCAST_AT = 0;
var FL_NEWS_CACHE = null, FL_NEWS_AT = 0;
function flNewsRead() { try { return JSON.parse(localStorage.getItem("flNewsRead") || "[]"); } catch (e) { return []; } }
function flNewsMark(id) {
  try {
    const s = new Set(flNewsRead()); s.add(String(id));
    const v = JSON.stringify([...s].slice(-80));
    localStorage.setItem("flNewsRead", v); if (window.flMirror) flMirror("flNewsRead", v);
  } catch (e) {}
}
function flNewsUnread() {
  if (!FL_NEWS_CACHE || !FL_NEWS_CACHE.length) return 0;
  const read = new Set(flNewsRead());
  return FL_NEWS_CACHE.filter(n => n && n.id && !read.has(String(n.id))).length;
}
function newsInboxScreen() {
  if (window.Cloud && Cloud.enabled() && Date.now() - FL_NEWS_AT > 3 * 60 * 1000) {
    FL_NEWS_AT = Date.now();
    Cloud.fetchBroadcasts().then(rows => {
      FL_NEWS_CACHE = rows || [];
      // keep banner in sync with newest live message
      const today = new Date().toISOString().slice(0, 10);
      const live = (FL_NEWS_CACHE || []).find(n => n.starts_at <= today && n.ends_at >= today);
      if (live) FL_BROADCAST = live.message;
      if (document.querySelector("#newsback")) render(newsInboxScreen);
    }).catch(() => {});
  }
  setTimeout(() => {
    document.querySelectorAll("[data-news]").forEach(el => el.onclick = () => {
      flNewsMark(el.dataset.news);
      el.style.opacity = "0.7";
    });
    const mark = $("#newsmark"); if (mark) mark.onclick = () => {
      (FL_NEWS_CACHE || []).forEach(n => flNewsMark(n.id));
      toast("\u2705 All marked read"); render(newsInboxScreen);
    };
    $("#newsback").onclick = () => render(menuScreen);
  }, 0);
  const rows = FL_NEWS_CACHE;
  let body;
  if (!window.Cloud || !Cloud.enabled()) body = '<p class="sub">News inbox needs the online service.</p>';
  else if (rows == null) body = '<p class="sub">\u23f3 Loading announcements\u2026</p>';
  else if (!rows.length) body = '<p class="sub">No announcements yet. When the admin publishes a broadcast, it lands here.</p>';
  else {
    const read = new Set(flNewsRead());
    const today = new Date().toISOString().slice(0, 10);
    body = rows.map(n => {
      const live = n.starts_at <= today && n.ends_at >= today;
      const isNew = n.id && !read.has(String(n.id));
      return `<div class="panel" data-news="${n.id || ""}" style="cursor:pointer${isNew ? ";border-color:var(--gold)" : ""}">
        <div class="kv"><span>${live ? "\ud83d\udce2 LIVE" : "\ud83d\udccb"} ${isNew ? '<b style="color:var(--gold)">NEW</b> ' : ""}
        <span class="sub">${n.created_at ? new Date(n.created_at).toLocaleDateString() : (n.starts_at || "")}${n.ends_at ? " \u2192 " + n.ends_at : ""}</span></span></div>
        <p style="margin:4px 0 0;line-height:1.45">${String(n.message || "").replace(/</g, "&lt;")}</p>
      </div>`;
    }).join("");
  }
  return `<div class="screen">
    <div class="topbar"><div class="logo"><span class="brand1">NEWS</span> <span class="legend">INBOX</span></div></div>
    <div class="panel"><h2>\ud83d\udce2 Announcements</h2>
      <p class="sub">Every admin broadcast, newest first. Tap to mark read.</p></div>
    ${body}
    <div class="optrow">
      <button class="btn secondary" id="newsmark" style="flex:1">Mark all read</button>
      <button class="btn secondary" id="newsback" style="flex:1">\u2b05 Main Menu</button>
    </div>
  </div>`;
}
function menuScreen() {
  // pull admin broadcast + news list (cached 10 min); re-render banner when it first arrives
  if (window.Cloud && Cloud.enabled() && Date.now() - FL_BROADCAST_AT > 10 * 60 * 1000) {
    FL_BROADCAST_AT = Date.now();
    Cloud.fetchBroadcast().then(msg => {
      if (msg && msg !== FL_BROADCAST) { FL_BROADCAST = msg; if (document.querySelector("#gobal")) render(menuScreen); }
    }).catch(() => {});
    if (Cloud.fetchBroadcasts) {
      Cloud.fetchBroadcasts().then(rows => { FL_NEWS_CACHE = rows || []; FL_NEWS_AT = Date.now();
        if (document.querySelector("#gobal") && flNewsUnread()) render(menuScreen);
      }).catch(() => {});
    }
  }
  let mlInfo = null;
  try { const m = JSON.parse(localStorage.getItem("footballLegendML_v1")); if (m && !m.sacked) mlInfo = m; } catch (e) {}
  setTimeout(() => {
    $("#gobal").onclick = () => { localStorage.setItem("flMode", "bal"); render(S ? homeScreen : createScreen); };
    $("#goml").onclick = () => { if (window.ML) ML.enter(); else toast("Loading..."); };
    if (!getSet().seenIntro) {
      const ov = document.createElement("div");
      ov.id = "introov";
      ov.style.cssText = "position:fixed;inset:0;background:rgba(6,10,8,.94);z-index:99;display:flex;align-items:center;justify-content:center;padding:20px";
      ov.innerHTML = `<div style="max-width:420px">
        <h1 style="margin:0 0 4px">\u26bd Welcome, gaffer.</h1>
        <p class="sub" style="margin:0 0 14px">60 seconds, three things to know:</p>
        <div class="panel" style="margin:8px 0"><b>\u2b50 Become a Legend</b><p class="sub" style="margin:4px 0 0">Create ONE player, live their whole career. During matches YOU make the big calls \u2014 shoot, pass, hold \u2014 with honest odds shown for every choice.</p></div>
        <div class="panel" style="margin:8px 0"><b>\ud83c\udfc6 Master League</b><p class="sub" style="margin:4px 0 0">Build a squad from card packs, set tactics, climb the leagues. One save \u2014 your club's story is permanent.</p></div>
        <div class="panel" style="margin:8px 0"><b>\ud83e\udd1d Friend Match</b><p class="sub" style="margin:4px 0 0">Export your squad as a code. Friends import it and try to beat you.</p></div>
        <p class="sub" style="margin:10px 0">The engine is never scripted \u2014 the odds you see are the odds you get. Good luck.</p>
        <button class="btn" id="introgo" style="width:100%">LET'S GO \u2794</button>
      </div>`;
      document.body.appendChild(ov);
      $("#introgo").onclick = () => { setSet("seenIntro", true); ov.remove(); };
    }
    $("#gofr").onclick = () => render(friendlyScreen);
    $("#goset").onclick = () => render(settingsScreen);
    $("#gohow").onclick = () => render(howScreen);
    const gg = $("#gogifts"); if (gg) gg.onclick = () => render(giftsScreen);
    const gl = $("#golb"); if (gl) gl.onclick = () => render(leaderboardScreen);
    const gn = $("#gonews"); if (gn) gn.onclick = () => render(newsInboxScreen);
    const gh = $("#goghost"); if (gh) gh.onclick = () => render(ghostScreen);
    const go2 = $("#goowner"); if (go2) go2.onclick = () => render(ownerScreen);
  }, 0);
  const liveGifts = flGiftsLive().length;
  const newsN = flNewsUnread();
  return `<div class="screen">
    <div class="topbar"><div class="logo"><span class="brand1">FOOTBALL</span> <span class="legend">LEGEND</span></div></div>
    ${FL_BROADCAST ? `<div class="panel" style="border:1px solid #e8c35a;background:#1c180c"><b style="color:#e8c35a">\ud83d\udce2 ANNOUNCEMENT</b><p class="sub" style="margin-top:4px">${FL_BROADCAST.replace(/</g, "&lt;")}</p></div>` : ""}
    <div class="panel center"><h1>\u26bd FOOTBALL LEGEND</h1>
      <p class="sub" style="margin-top:6px">Honest engine. Real odds. No scripts.</p></div>
    <div class="panel" style="cursor:pointer" id="gobal">
      <h2>\u2b50 Become a Legend</h2>
      <p class="sub">${S ? `Continue: <b>${S.name}</b> \u00b7 ${S.pos} \u00b7 ${cardLabel()} \u00b7 Season ${S.season}` : "Create your player and rise from the lower leagues."}</p>
    </div>
    <div class="panel" style="cursor:pointer" id="goml">
      <h2>\ud83c\udfdf\ufe0f Master League</h2>
      <p class="sub">${mlInfo ? `Continue: <b>${mlInfo.clubName || mlInfo.world.clubs[mlInfo.clubIdx].name}</b> \u00b7 Season ${mlInfo.season}${(mlInfo.trophies && mlInfo.trophies.length) ? " \u00b7 \ud83c\udfc6" + mlInfo.trophies.length : ""} \u00b7 budget ${(mlInfo.budget || 0).toFixed(1)}M GP` : "Found your own club and build a dynasty \u2014 one save, forever, like eFootball."}</p>
    </div>
    ${!S && !localStorage.getItem("footballLegendML_v1") ? `<div class="panel" style="border-color:var(--gold)">
      <p class="sub">\ud83d\udc4b <b>New here?</b> This game's promise: every % you see is the engine's true probability \u2014 matches are never scripted. Read <b style="color:var(--gold)">How it works</b> below, then create your legend.</p>
    </div>` : ""}
    <div class="panel" style="cursor:pointer" id="gofr">
      <h2>\ud83c\udfae Friend Match (Challenge Codes)</h2>
      <p class="sub">Set up a match, send the code. Your friend plays the identical honest match on their own phone \u2014 then sends the result code back so you can watch it too.</p>
    </div>
    <div class="panel" style="cursor:pointer" id="goghost">
      <h2>\ud83d\udc7b Ghost PvP</h2>
      <p class="sub">Challenge real players' cloud clubs \u2014 async, AI-controlled, same honest engine. No matchmaking server needed.</p>
    </div>
    <div class="panel" style="cursor:pointer${newsN ? ";border-color:var(--gold)" : ""}" id="gonews">
      <h2>\ud83d\udce2 News Inbox${newsN ? ` <span class="badge gold" style="float:right">${newsN} NEW</span>` : ""}</h2>
      <p class="sub">Every announcement from the admin console \u2014 history, not just the banner.</p>
    </div>
    <div class="panel" style="cursor:pointer${liveGifts ? ";border-color:var(--gold)" : ""}" id="gogifts">
      <h2>\ud83c\udf81 Gifts & Events${liveGifts ? ` <span class="badge gold" style="float:right">${liveGifts} LIVE</span>` : ""}</h2>
      <p class="sub">Free players, GP and Legend Coins \u2014 event drops and redeem codes. Everything a gift, nothing pay-to-win.</p>
    </div>
    <div class="panel" style="cursor:pointer" id="golb">
      <h2>\ud83c\udf10 Global Rankings</h2>
      <p class="sub">Top legends and clubs worldwide \u2014 signed-in players only. Where do you stand?</p>
    </div>
    ${flIsOwner() ? `<div class="panel" style="cursor:pointer;border-color:var(--gold)" id="goowner">
      <h2>\ud83d\udc51 Owner Panel</h2>
      <p class="sub">Superuser tools \u2014 grants, spawns, code generator, engine debug.</p>
    </div>` : ""}
    <div class="optrow" style="margin-top:2px">
      <div class="opt" id="gohow" style="flex:1;text-align:center">\ud83d\udcd6 How it works</div>
      <div class="opt" id="goset" style="flex:1;text-align:center">\u2699\ufe0f Settings & Backup</div>
    </div>
  </div>`;
}

const FR_MENTS = { defensive: ["\ud83d\udee1 Defensive", -1.5], balanced: ["\u2696 Balanced", 0], attacking: ["\u2694 Attacking", 2] };
const FR_STYLES = {
  possession: { label: "\ud83d\udd35 Possession", beats: "longball" },
  highpress:  { label: "\u26a1 High Press",  beats: "possession" },
  counter:    { label: "\ud83d\udde1 Counter",     beats: "highpress" },
  longball:   { label: "\ud83c\udfaf Long Ball",   beats: "counter" }
};
function frDuel(hstl, astl) {
  if (!hstl || !astl || !FR_STYLES[hstl] || !FR_STYLES[astl]) return { h: 0, a: 0, txt: "" };
  if (FR_STYLES[hstl].beats === astl) return { h: 1, a: 0, txt: " " + FR_STYLES[hstl].label + " counters " + FR_STYLES[astl].label + " \u2014 home +1.0 str." };
  if (FR_STYLES[astl].beats === hstl) return { h: 0, a: 1, txt: " " + FR_STYLES[astl].label + " counters " + FR_STYLES[hstl].label + " \u2014 away +1.0 str." };
  return { h: 0, a: 0, txt: " Styles neutral \u2014 no bonus." };
}

// ============================ GHOST PvP (async vs cloud clubs) ============================
// Challenge real players' validated ML cloud teams. Opponent is AI-controlled with their
// sealed mentality/style/formation-derived strength. Same honest engine as Friend Match.
var FL_GHOST_CACHE = null, FL_GHOST_AT = 0;
function ghostMyClub() {
  // Prefer the player's own ML club; else BaL club; else a national starter.
  try {
    const m = JSON.parse(localStorage.getItem("footballLegendML_v1") || "null");
    if (m && m.squad && m.squad.length >= 11) {
      // compute local strength the same way the cloud RPC does (avg OVR of XI)
      const xi = Array.isArray(m.xi) && m.xi.length ? m.xi : null;
      const pool = xi ? m.squad.filter(p => xi.includes(p.id)) : m.squad;
      const avg = pool.reduce((s, p) => s + (p.ovr || 60), 0) / Math.max(1, pool.length);
      const ment = m.mentality || "balanced";
      const mentB = (FR_MENTS[ment] || FR_MENTS.balanced)[1];
      return {
        name: m.clubName || (m.world && m.world.clubs[m.clubIdx] && m.world.clubs[m.clubIdx].name) || "My Club",
        short: m.clubShort || "YOU",
        str: Math.min(92, Math.max(45, Math.round(avg * 10) / 10)) + mentB,
        mentality: ment,
        style: m.style || "possession",
        col1: "#e8c15a", col2: "#131a14",
        source: "ml"
      };
    }
  } catch (e) {}
  if (S && S.world && S.world.clubs && S.clubIdx != null) {
    const c = S.world.clubs[S.clubIdx];
    return { name: c.name, short: c.short, str: c.str, mentality: "balanced", style: "possession",
             col1: c.col1 || "#2b7a4b", col2: c.col2 || "#fff", source: "bal" };
  }
  const c = E.STARTER_CLUBS[0];
  return { name: c.name, short: c.short, str: c.str, mentality: "balanced", style: "possession",
           col1: c.col1 || "#2b7a4b", col2: c.col2 || "#fff", source: "starter" };
}
function ghostScreen() {
  if (window.Cloud && Cloud.enabled() && (!FL_GHOST_CACHE || Date.now() - FL_GHOST_AT > 3 * 60 * 1000)) {
    FL_GHOST_AT = Date.now();
    Cloud.fetchGhosts().then(rows => {
      FL_GHOST_CACHE = rows;
      if (document.querySelector("#ghback")) render(ghostScreen);
    });
  }
  const me = ghostMyClub();
  setTimeout(() => {
    document.querySelectorAll("[data-gh]").forEach(b => b.onclick = () => {
      const g = (FL_GHOST_CACHE || [])[+b.dataset.gh];
      if (!g) return;
      startGhostMatch(me, g);
    });
    $("#ghback").onclick = () => render(menuScreen);
    const rf = $("#ghref"); if (rf) rf.onclick = () => { FL_GHOST_AT = 0; FL_GHOST_CACHE = null; render(ghostScreen); };
  }, 0);
  let body;
  if (!window.Cloud || !Cloud.enabled()) body = '<p class="sub">Ghost PvP needs the online service.</p>';
  else if (FL_GHOST_CACHE == null) body = '<p class="sub">\u23f3 Scouting cloud clubs\u2026</p>';
  else if (!FL_GHOST_CACHE.length) body = '<p class="sub">No cloud clubs yet \u2014 opponents appear once signed-in managers sync a Master League save.</p>';
  else {
    const myPid = flPlayerId();
    body = FL_GHOST_CACHE.filter(g => g.player_id !== myPid).map((g, i) => {
      // re-index against full cache for data-gh
      const idx = FL_GHOST_CACHE.indexOf(g);
      const ment = FR_MENTS[g.mentality] || FR_MENTS.balanced;
      const st = FR_STYLES[g.style];
      return `<div class="kv">
        <span><b>${g.club}</b> <span class="sub">· ${g.name}</span><br>
        <span class="sub">str ${g.str} · ${ment[0]} · ${st ? st.label : g.style} · S${g.season} · \ud83c\udfc6${g.trophies}</span></span>
        <button class="btn" data-gh="${idx}" style="width:auto;padding:8px 14px">PLAY</button>
      </div>`;
    }).join("") || '<p class="sub">Only your own club is online \u2014 wait for other managers to sync.</p>';
  }
  return `<div class="screen">
    <div class="topbar"><div class="logo"><span class="brand1">GHOST</span> <span class="legend">PvP</span></div></div>
    <div class="panel"><h2>\ud83d\udc7b Async vs real clubs</h2>
      <p class="sub">You play as <b>${me.name}</b> (str ${me.str}${me.source === "ml" ? " · your ML club" : me.source === "bal" ? " · your BaL club" : ""}).
      Opponents are AI-run with their cloud tactics sealed. Odds = engine truth.</p>
      <p class="sub">Tip: open Master League and play a matchday while signed in so YOUR club appears for others.</p>
    </div>
    <div class="panel"><h2>\ud83c\udf10 Cloud opponents</h2>${body}</div>
    <div class="optrow">
      <button class="btn secondary" id="ghref" style="flex:1">\ud83d\udd04 Refresh</button>
      <button class="btn secondary" id="ghback" style="flex:1">\u2b05 Main Menu</button>
    </div>
  </div>`;
}
function startGhostMatch(me, g) {
  const mentB = (FR_MENTS[g.mentality] || FR_MENTS.balanced)[1];
  const duel = frDuel(me.style, g.style);
  // Ghost is always away; you are home (home lift is honest and visible in odds)
  const Hc = { name: me.name, short: me.short, str: me.str + duel.h, col1: me.col1 || "#e8c15a", col2: me.col2 || "#131a14" };
  const Ac = { name: g.club, short: (g.club || "GHOST").slice(0, 3).toUpperCase(),
               str: Number(g.str) + mentB + duel.a, col1: "#5a3a7a", col2: "#fff" };
  const seed = E.hashSeed(["ghost", me.name, me.str, g.player_id, g.club, g.str, g.mentality, g.style, Math.floor(Date.now() / 60000)].join("~"));
  const probs = E.winProbs(Hc, Ac, 600);
  const R = { v: 4, hn: Hc.name, hshort: Hc.short, hs: Hc.str, hm: me.mentality || "balanced", hstl: me.style,
              an: Ac.name, ashort: Ac.short, as: Ac.str, am: g.mentality, astl: g.style,
              hf: 0, af: 0, hh: true, sb: 5, x: seed,
              ghost: true, gpid: g.player_id, gname: g.name };
  render(() => friendlyMatch(Hc, Ac, probs, {
    seed, R, mode: "ghost",
    duelTxt: (duel.txt || "") + " · Ghost of " + g.name + " (AI)"
  }));
}

// ============================ FRIENDLY MATCH ============================
function friendlyPool() {
  const pool = [];
  if (S) for (const c of S.world.clubs) pool.push(Object.assign({}, c, { tag: "Your league" }));
  else {
    const rng = E.mulberry32(E.hashSeed("frpool"));
    for (const c of E.genStarterClubs("britain", rng)) pool.push(Object.assign({}, c, { tag: "National" }));
  }
  for (const c of E.EURO_CLUBS) pool.push(Object.assign({}, c, { tag: "Continental elite" }));
  return pool;
}
function frEnc(o) { return btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/=+$/, ""); }
function frDec(c) { try { return JSON.parse(decodeURIComponent(escape(atob((c || "").trim())))); } catch (e) { return null; } }
function friendlyScreen() {
  const pool = friendlyPool();
  let tab = "create", myClubI = -1, myMent = "balanced", myStyl = "possession", ch = null, code = "";
  let myForm = 0, hostHome = true, frSubs = 5; // editable match settings (sealed into the code)
  setTimeout(() => {
    function clubGrid(sel) {
      return `<div class="optrow">${pool.map((c, i) =>
        `<div class="opt ${sel === i ? "sel" : ""}" data-frc="${i}" style="flex:1 1 45%;font-size:.7rem">${c.name}<br><span class="sub">str ${c.str} \u00b7 ${c.tag}</span></div>`).join("")}</div>`;
    }
    function mentRow(sel) {
      return `<div class="optrow">${Object.entries(FR_MENTS).map(([id, m]) =>
        `<div class="opt ${sel === id ? "sel" : ""}" data-frm="${id}" style="flex:1 1 30%;font-size:.7rem">${m[0]}<br><span class="sub">${m[1] >= 0 ? "+" : ""}${m[1]} str</span></div>`).join("")}</div>`;
    }
    function styleRow(sel) {
      return `<div class="optrow">${Object.entries(FR_STYLES).map(([id, st]) =>
        `<div class="opt ${sel === id ? "sel" : ""}" data-frs="${id}" style="flex:1 1 45%;font-size:.7rem">${st.label}<br><span class="sub">beats ${FR_STYLES[st.beats].label}</span></div>`).join("")}</div>`;
    }
    function draw() {
      let body = "";
      if (tab === "create") {
        body = `<h2>\ud83d\udce4 Create a Challenge</h2>
          <p class="sub">Pick your club and sealed tactics. Send the code to your friend.</p>
          ${clubGrid(myClubI)}<p class="sub" style="margin-top:8px">Your mentality (sealed into the code)</p>${mentRow(myMent)}
          <p class="sub" style="margin-top:8px">Your playing style (sealed \u00b7 counters give +1.0 str)</p>${styleRow(myStyl)}
          <p class="sub" style="margin-top:8px">Match settings (sealed \u00b7 shown to your friend)</p>
          <div class="optrow">
            <div class="opt ${hostHome ? "sel" : ""}" data-frhh="1" style="flex:1;font-size:.7rem">\ud83c\udfdf I'm home<br><span class="sub">+home lift</span></div>
            <div class="opt ${!hostHome ? "sel" : ""}" data-frhh="0" style="flex:1;font-size:.7rem">\u2708\ufe0f I'm away<br><span class="sub">they get it</span></div>
          </div>
          <div class="optrow">${[3, 4, 5, 6].map(n => `<div class="opt ${frSubs === n ? "sel" : ""}" data-frsb="${n}" style="flex:1;font-size:.7rem">${n} subs</div>`).join("")}</div>
          <p class="sub" style="margin-top:8px">Your form override (\u25b2\u25bc \u00b7 honest \u00b1str, visible in the odds)</p>
          <div class="optrow">${[-2, -1, 0, 1, 2].map(fv => `<div class="opt ${myForm === fv ? "sel" : ""}" data-frf="${fv}" style="flex:1;font-size:.7rem">${fv > 0 ? "\u25b2".repeat(fv) : fv < 0 ? "\u25bc".repeat(-fv) : "\u2014"}</div>`).join("")}</div>
          <button class="btn" id="frgen" ${myClubI < 0 ? "disabled" : ""}>GET CHALLENGE CODE</button>
          ${code ? `<p class="sub" style="margin-top:8px">Send this to your friend:</p><textarea readonly style="width:100%;height:70px" onclick="this.select()">${code}</textarea>` : ""}`;
      } else if (tab === "accept") {
        if (!ch) {
          body = `<h2>\ud83d\udce5 Accept a Challenge</h2>
            <p class="sub">Paste the code your friend sent you:</p>
            <textarea id="frin" style="width:100%;height:70px" placeholder="paste code here"></textarea>
            <button class="btn" id="frdecode">DECODE \u2794</button>`;
        } else {
          body = `<h2>\ud83d\udce5 Challenge from <b>${ch.hn}</b></h2>
            <p class="sub">Their club: <b>${ch.hn}</b> (str ${ch.hs}) \u00b7 tactics SEALED \ud83d\udd12 \u00b7 they get home advantage</p>
            <p class="sub" style="margin-top:8px">Pick YOUR club:</p>${clubGrid(myClubI)}
            <p class="sub" style="margin-top:8px">Your mentality</p>${mentRow(myMent)}
            ${ch.hstl ? `<p class="sub" style="margin-top:8px">Your playing style (theirs is SEALED \ud83d\udd12 \u00b7 counter it for +1.0)</p>${styleRow(myStyl)}` : ""}
            ${ch.v >= 3 ? `<p class="sub" style="margin-top:8px">Match rules: <b>${ch.hh ? "they are home" : "YOU are home"}</b> \u00b7 ${ch.sb || 5} subs \u00b7 their form ${ch.hf > 0 ? "\u25b2".repeat(ch.hf) : ch.hf < 0 ? "\u25bc".repeat(-ch.hf) : "\u2014"}</p>
            <p class="sub" style="margin-top:8px">Your form override (honest \u00b1str)</p>
            <div class="optrow">${[-2, -1, 0, 1, 2].map(fv => `<div class="opt ${myForm === fv ? "sel" : ""}" data-frf="${fv}" style="flex:1;font-size:.7rem">${fv > 0 ? "\u25b2".repeat(fv) : fv < 0 ? "\u25bc".repeat(-fv) : "\u2014"}</div>`).join("")}</div>` : ""}
            <button class="btn" id="frplay" ${myClubI < 0 ? "disabled" : ""}>\u26bd PLAY THE MATCH</button>`;
        }
      } else {
        body = `<h2>\ud83d\udcfa Watch a Result</h2>
          <p class="sub">Your friend played your challenge? Paste the result code they sent back \u2014 you'll watch the exact same match.</p>
          <textarea id="frin" style="width:100%;height:70px" placeholder="paste result code"></textarea>
          <button class="btn" id="frwatch">WATCH \u2794</button>
          <div class="panel" style="margin-top:10px">
            <h2 style="font-size:.85rem">\ud83d\udcf1 How to connect</h2>
            <p class="sub">1\ufe0f\u20e3 CREATE a challenge \u2192 copy the code.<br>
            2\ufe0f\u20e3 Send it over WhatsApp/SMS \u2014 any messenger works, no internet needed in the game.<br>
            3\ufe0f\u20e3 Your friend hits ACCEPT, pastes it, picks their side, plays.<br>
            4\ufe0f\u20e3 They send back the RESULT code \u2014 paste it here to watch the identical match.<br>
            \ud83d\udd12 Tactics are sealed in the code \u2014 nobody can peek, and both phones simulate the exact same honest match.</p>
          </div>`;
      }
      $("#frbox").innerHTML = `
        <div class="optrow" style="margin-bottom:10px">
          <div class="opt ${tab === "create" ? "sel" : ""}" data-frtab="create" style="flex:1">\ud83d\udce4 Create</div>
          <div class="opt ${tab === "accept" ? "sel" : ""}" data-frtab="accept" style="flex:1">\ud83d\udce5 Accept</div>
          <div class="opt ${tab === "replay" ? "sel" : ""}" data-frtab="replay" style="flex:1">\ud83d\udcfa Watch</div>
        </div>${body}
        <p class="sub center" style="margin-top:10px;cursor:pointer" id="frback">\u2b05 Main Menu</p>`;
      bind();
    }
    function bind() {
      document.querySelectorAll("[data-frtab]").forEach(o => o.onclick = () => { tab = o.dataset.frtab; myClubI = -1; code = ""; ch = null; draw(); });
      document.querySelectorAll("[data-frc]").forEach(o => o.onclick = () => { myClubI = +o.dataset.frc; code = ""; draw(); });
      document.querySelectorAll("[data-frm]").forEach(o => o.onclick = () => { myMent = o.dataset.frm; code = ""; draw(); });
      document.querySelectorAll("[data-frs]").forEach(o => o.onclick = () => { myStyl = o.dataset.frs; code = ""; draw(); });
      document.querySelectorAll("[data-frhh]").forEach(o => o.onclick = () => { hostHome = o.dataset.frhh === "1"; code = ""; draw(); });
      document.querySelectorAll("[data-frsb]").forEach(o => o.onclick = () => { frSubs = +o.dataset.frsb; code = ""; draw(); });
      document.querySelectorAll("[data-frf]").forEach(o => o.onclick = () => { myForm = +o.dataset.frf; code = ""; draw(); });
      $("#frback").onclick = () => render(menuScreen);
      const g = $("#frgen"); if (g) g.onclick = () => {
        const c = pool[myClubI];
        code = frEnc({ v: 3, hn: c.name, hshort: c.short, hs: c.str, hm: myMent, hstl: myStyl, hf: myForm, hh: hostHome, sb: frSubs, x: Math.floor(Math.random() * 1e6) });
        draw();
      };
      const d = $("#frdecode"); if (d) d.onclick = () => {
        const o = frDec($("#frin").value);
        if (!o || ![1, 2, 3].includes(o.v) || !o.hn) { toast("\u274c Invalid code"); return; }
        ch = o; myClubI = -1; draw();
      };
      const p = $("#frplay"); if (p) p.onclick = () => {
        const mine = pool[myClubI];
        const R = Object.assign({}, ch, { an: mine.name, ashort: mine.short, as: mine.str, am: myMent, af: myForm }, ch.hstl ? { astl: myStyl } : {});
        startFrMatch(R, "accept");
      };
      const w = $("#frwatch"); if (w) w.onclick = () => {
        const o = frDec($("#frin").value);
        if (!o || !o.an) { toast("\u274c Not a result code"); return; }
        startFrMatch(o, "replay");
      };
    }
    draw();
  }, 0);
  return `<div class="screen">
    <div class="topbar"><div class="logo"><span class="brand1">FRIEND</span> <span class="legend">MATCH</span></div></div>
    <div class="panel" id="frbox"></div>
  </div>`;
}

function startFrMatch(R, mode) {
  const parts = [R.hn, R.hs, R.hm, R.x, R.an, R.as, R.am];
  if (R.hstl || R.astl) parts.push(R.hstl || "", R.astl || "");
  if (R.v >= 3) parts.push(R.hf || 0, R.af || 0, R.hh ? 1 : 0, R.sb || 5);
  const seed = E.hashSeed(parts.join("~"));
  const duel = frDuel(R.hstl, R.astl);
  const hForm = (R.hf || 0) * 0.75, aForm = (R.af || 0) * 0.75; // honest form \u00b1str, visible in odds
  // hh=false means the CREATOR chose away — swap who is listed as the home team
  const creator = { name: R.hn, short: R.hshort, str: R.hs + FR_MENTS[R.hm][1] + duel.h + hForm, col1: "#2b7a4b", col2: "#fff" };
  const acceptor = { name: R.an, short: R.ashort, str: R.as + FR_MENTS[R.am][1] + duel.a + aForm, col1: "#7a2b2b", col2: "#fff" };
  const Hc = (R.v >= 3 && R.hh === false) ? acceptor : creator;
  const Ac = (R.v >= 3 && R.hh === false) ? creator : acceptor;
  const probs = E.winProbs(Hc, Ac, 600);
  const ruleTxt = R.v >= 3 ? ` \u00b7 ${R.sb || 5} subs \u00b7 form ${R.hf > 0 ? "\u25b2".repeat(R.hf) : R.hf < 0 ? "\u25bc".repeat(-(R.hf)) : "\u2014"}/${(R.af || 0) > 0 ? "\u25b2".repeat(R.af) : (R.af || 0) < 0 ? "\u25bc".repeat(-(R.af)) : "\u2014"}` : "";
  render(() => friendlyMatch(Hc, Ac, probs, { seed, R, mode, duelTxt: duel.txt + ruleTxt }));
}

function friendlyMatch(Hc, Ac, probs, ctx) {
  const match = E.createMatch(Hc, Ac, { seed: ctx.seed });
  let timer = null, speed = 1, over = false;
  setTimeout(() => {
    const clockEl = $("#frclock"), scoreEl = $("#frscore"), tickEl = $("#frticker"), momEl = $("#frmom"), decEl = $("#frdec");
    function addTick(min, txt, cls) {
      const d = document.createElement("div");
      d.className = "tick " + (cls || "");
      d.innerHTML = `<b>${min}'</b> ${txt}`;
      tickEl.prepend(d);
    }
    function describe(ev) {
      const side = ev.team === 0 ? Hc.short : Ac.short;
      if (ev.type === "goal") { Snd.goalUs(); addTick(ev.min, `<b>\u26bd GOAL ${side}!</b> ${ev.score[0]}-${ev.score[1]}${ev.via ? " (" + ev.via + ")" : ""}`, "goal"); }
      else if (ev.type === "save") addTick(ev.min, `${side} denied by the keeper!`, "");
      else if (ev.type === "miss") addTick(ev.min, `${side} off target.`, "");
      else if (ev.type === "setpiece") addTick(ev.min, `${side} win ${ev.pen ? "a PENALTY!" : "a free kick in range..."}`, "goal");
      else if (ev.type === "card") addTick(ev.min, "\ud83d\udfe8 Booking.", "");
    }
    function endM() {
      if (over) return; over = true;
      clearInterval(timer);
      const r = match.result();
      addTick(90, `<b>FULL TIME.</b> ${Hc.short} ${r.gH} - ${r.gA} ${Ac.short}`, "goal");
      Snd.fulltime();
      const winner = r.gH > r.gA ? "\ud83c\udfc6 " + Hc.name + " WINS!" : r.gA > r.gH ? "\ud83c\udfc6 " + Ac.name + " WINS!" : "\ud83e\udd1d DRAW";
      const resCode = ctx.mode === "accept" ? frEnc(ctx.R) : "";
      const isGhost = ctx.mode === "ghost";
      decEl.style.display = "block";
      decEl.innerHTML = `<div class="scenline">\ud83c\udfc1 ${winner}</div>
        <p class="sub" style="margin:4px 0"><b>${Hc.short} ${r.gH} - ${r.gA} ${Ac.short}</b> \u00b7 odds were ${probs.home}%/${probs.draw}%/${probs.away}% \u2014 honest engine${isGhost ? " \u00b7 Ghost PvP (AI ran their tactics)" : ", both phones see the identical match"}.</p>
        ${ctx.duelTxt ? `<p class="sub">${ctx.duelTxt}</p>` : ""}
        ${resCode ? `<p class="sub">\ud83d\udce4 Send this RESULT CODE back so they can watch:</p><textarea readonly style="width:100%;height:64px" onclick="this.select()">${resCode}</textarea>` : ""}
        <button class="btn" id="fragain">${isGhost ? "\u2b05 GHOST PvP" : "\u2b05 FRIEND MATCH HUB"}</button>
        <button class="btn secondary" id="frmenu">MAIN MENU</button>`;
      $("#fragain").onclick = () => render(isGhost ? ghostScreen : friendlyScreen);
      $("#frmenu").onclick = () => render(menuScreen);
    }
    function step() {
      const st = match.step();
      { // attack-state strip (live-score style)
        const fs2 = $("#fratk");
        if (fs2) {
          const mom = match.state.momentum, domHome = mom >= 50, dom = domHome ? mom : 100 - mom;
          const T = domHome ? Hc.short : Ac.short;
          const st2 = dom >= 74 ? "DANGEROUS ATTACK" : dom >= 60 ? "ATTACKING" : dom >= 53 ? "BUILD-UP" : "MIDFIELD BATTLE";
          const danger = st2 === "DANGEROUS ATTACK", attacking = st2 !== "MIDFIELD BATTLE";
          fs2.innerHTML = `<span class="atkarrows ${danger ? "danger" : ""}" style="${domHome ? "" : "transform:scaleX(-1)"}">${attacking ? "\u25b6\u25b6\u25b6" : "\u25c6"}</span> ${T} \u00b7 ${st2}`;
          fs2.className = "atkstrip" + (danger ? " danger" : attacking ? " on" : "");
        }
      }
      clockEl.textContent = st.min + "'";
      scoreEl.textContent = match.state.gH + " - " + match.state.gA;
      momEl.style.width = match.state.momentum + "%";
      for (const ev of st.events) describe(ev);
      if (st.min === 45) addTick(45, "Half-time.", "");
      if (st.done || match.state.done) endM();
    }
    document.querySelectorAll("[data-frspeed]").forEach(bn => bn.onclick = () => {
      speed = +bn.dataset.frspeed;
      document.querySelectorAll("[data-frspeed]").forEach(x => x.classList.toggle("on", +x.dataset.frspeed === speed));
      clearInterval(timer);
      timer = setInterval(step, speed === 0.5 ? 520 : speed === 1 ? 240 : speed === 2 ? 90 : 15);
    });
    Snd.kickoff();
    addTick(0, `${Hc.name} (home) vs ${Ac.name}. Sealed tactics applied.${ctx.duelTxt || ""} Odds ${probs.home}/${probs.draw}/${probs.away}.`, "");
    timer = setInterval(step, 240);
  }, 0);
  return `<div class="screen">
    <div class="topbar"><div class="logo"><span class="brand1">FRIEND</span> <span class="legend">MATCH</span></div></div>
    <div class="panel">
      <div class="scoreline"><span>${Hc.short}</span><b id="frscore">0 - 0</b><span>${Ac.short}</span></div>
      <div class="center"><span class="badge" id="frclock">0'</span></div>
      <div class="mombar"><div class="momfill" id="frmom" style="width:50%"></div></div>
      <div class="momlabels"><span>${Hc.short}</span><span>momentum</span><span>${Ac.short}</span></div>
      <div class="atkstrip" id="fratk"></div>
      <div id="frdec" class="decisionbox" style="display:none"></div>
      <div class="ticker" id="frticker" style="height:260px"></div>
      <div class="speedrow">
        <button class="btn secondary" data-frspeed="0.5">\ud83d\udc22 \u00bdx</button>
        <button class="btn secondary on" data-frspeed="1">\u25b6 1x</button>
        <button class="btn secondary" data-frspeed="2">\u23e9 2x</button>
        <button class="btn secondary" data-frspeed="3">\u23ed SKIP</button>
      </div>
    </div>
  </div>`;
}


// ============================ TRANSFER OFFERS ============================
function janWindowDue() { // January window: one mid-season offer chance around MD9
  if (!S.galaxy || S.janOffered || S.matchday < 9 || S.matchday > 11) return false;
  const avg = S.myStats.ratings.length ? S.myStats.ratings.reduce((a, b) => a + b, 0) / S.myStats.ratings.length : 6;
  return avg >= 7.0 || S.myStats.goals >= 7 || S.transferRequest;
}
function janOfferScreen() {
  S.janOffered = true; save();
  const rng = E.mulberry32(E.hashSeed(S.seed + ":jan:" + S.season));
  const cands = [];
  S.galaxy.leagues.forEach((L, li) => {
    if (li === S.leagueIdx) return;
    const sorted = L.clubs.map((c, i) => ({ c, i })).sort((x, y) => y.c.str - x.c.str);
    cands.push({ li, i: sorted[Math.floor(rng() * 4)].i, lg: L.name });
  });
  const pick = cands[Math.floor(rng() * cands.length)];
  const club = S.galaxy.leagues[pick.li].clubs[pick.i];
  setTimeout(() => {
    const acc = $("#janacc"); if (acc) acc.onclick = () => {
      if (S.ct && !S.ct.done) { // CT place belongs to the old club — sim it out without you
        S.ct.alive = false;
        if (S.ct.stage === "group") {
          E.ctSimGroups(S.ct, S.galaxy, S.seed + ":bal:s" + S.season, 6, false);
          S.ct.gPlayed = 6;
          E.ctAdvanceToKO(S.ct, S.galaxy, S.seed + ":bal:s" + S.season);
          S.ct.alive = false;
        }
        while (S.ct.ko && S.ct.ko.length > 1 && S.ct.koRound <= 2) { const rr = E.ctSimKORound(S.ct, S.galaxy, S.seed + ":bal:s" + S.season, false, null); S.ct.ko = rr.next; S.ct.koRound++; }
        S.ct.done = true; S.ct.champion = (S.ct.ko && S.ct.ko[0]) || null;
        pushNews("\ud83c\udf0d Your Champions Trophy campaign stays behind with your old club.");
      }
      S.cup = { round: S.cup.round, alive: false }; // domestic cup run also ends
      balSwitchLeague(pick.li, pick.i, true);
      S.gp += 600;
      pushNews("\u2708\ufe0f JANUARY MOVE! " + S.name + " joins " + club.name + " (" + pick.lg + ") mid-season (+600 GP).");
      toast("\u2708\ufe0f Welcome to " + club.name + "!");
      save(); render(homeScreen);
    };
    const dec = $("#jandec"); if (dec) dec.onclick = () => {
      pushNews("\ud83d\udcf0 " + S.name + " turns down a January move \u2014 staying loyal to " + myClub().name + ".");
      save(); render(homeScreen);
    };
  }, 0);
  return `<div class="screen">${topbar()}
    <div class="panel center">
      <h1>\ud83e\udd1d January Window</h1>
      <p class="sub" style="margin:8px 0">Your form has attracted a mid-season bid.</p>
    </div>
    <div class="panel">
      <h2>${club.name} <span class="badge gold" style="float:right">str ${club.str}</span></h2>
      <p class="sub">${pick.lg} \u00b7 mid-season switch \u00b7 <b style="color:var(--gold)">+600 GP signing bonus</b></p>
      <p class="sub">You inherit their league position and fixtures. Your cup run${S.ct ? " and Champions Trophy place" : ""} stay${S.ct ? "" : "s"} with your old club \u2014 a real cost of moving.</p>
      <button class="btn" id="janacc">ACCEPT THE MOVE \u2708\ufe0f</button>
      <button class="btn secondary" id="jandec">STAY \ud83c\udfe0</button>
    </div>
  </div>`;
}
function transferOfferScreen(avg, myPos) {
  const rng = E.mulberry32(E.hashSeed(S.seed + ":offers:" + S.season));
  // cross-league offers from the galaxy: one giant from a stronger league, one stepping stone
  const stronger = [0, 1, 2].filter(li => li !== S.leagueIdx);
  const li1 = stronger[Math.floor(rng() * stronger.length)];
  let li2 = stronger.find(x => x !== li1); if (li2 == null) li2 = (S.leagueIdx + 3) % 6;
  const pick2 = (li, band) => {
    const L = S.galaxy.leagues[li];
    const sorted = L.clubs.map((c, i) => ({ c, i })).sort((x, y) => y.c.str - x.c.str);
    const s = sorted[band + Math.floor(rng() * 3)];
    return { li, i: s.i, c: s.c, lg: L.name };
  };
  const top = pick2(li1, 0), mid = pick2(li2, 4);
  const offers = [
    { key: "top", club: top, tag: "\ud83c\udfc6 Title challenger \u00b7 " + top.lg, note: "Biggest stage, biggest pressure.", gp: 800 },
    { key: "mid", club: mid, tag: "\ud83d\udcc8 Stepping stone \u00b7 " + mid.lg, note: "Guaranteed starter, room to be the main man.", gp: 500 }
  ];
  setTimeout(() => {
    document.querySelectorAll("[data-offer]").forEach(o => o.onclick = () => {
      const pick = o.dataset.offer;
      if (pick === "stay") {
        pushNews("\ud83d\udcf0 " + S.name + " rejects the moves \u2014 loyalty! One more season at " + myClub().name + ".");
        toast("Staying home. Deliver again and they'll return.");
      } else {
        const off = offers.find(x => x.key === pick);
        S.tier = 1;
        balSwitchLeague(off.club.li, off.club.i, false);
        S.gp += off.gp;
        pushNews("\u2708\ufe0f TRANSFER! " + S.name + " signs for " + off.club.c.name + " in the " + off.club.lg + " (+" + off.gp + " GP bonus).");
        toast("\u2708\ufe0f Welcome to " + off.club.c.name + "! +" + off.gp + " GP");
      }
      finishSeasonRollover();
    });
  }, 0);
  return `<div class="screen">
    <div class="topbar"><div class="logo"><span class="brand1">TRANSFER</span> <span class="legend">WINDOW</span></div></div>
    <div class="panel center"><h1>\ud83d\udcde The agent calls</h1>
      <p class="sub" style="margin:8px 0">Your season (avg ${avg.toFixed(2)}, ${S.myStats.goals} goals, #${myPos} finish) turned heads. Offers:</p></div>
    ${offers.map(o => `<div class="panel" style="cursor:pointer" data-offer="${o.key}">
      <h2>${o.club.c.name} <span class="badge gold" style="float:right">str ${o.club.c.str}</span></h2>
      <p class="sub">${o.tag} \u00b7 ${o.note} \u00b7 <b style="color:var(--gold)">+${o.gp} GP signing bonus</b></p>
    </div>`).join("")}
    <div class="panel" style="cursor:pointer" data-offer="stay">
      <h2>\ud83c\udfe0 Stay at ${myClub().name}</h2>
      <p class="sub">Another season home \u2014 the offers return if you deliver again.</p>
    </div>
  </div>`;
}
function finishSeasonRollover() {
  if (S.galaxy) {
    const L = S.galaxy.leagues[S.leagueIdx]; // rollover regenerated fixtures & cleared results
    S.world = { tier: S.tier, clubs: L.clubs, fixtures: L.fixtures, h2h: S.world.h2h || {} };
    S.galMD = 0; S.janOffered = false; S.janOffer = null;
    const me = { league: S.leagueIdx, club: S.clubIdx };
    const q = S.pendingQual; S.pendingQual = null;
    if (q && q.cl.some(e => e.league === me.league && e.club === me.club)) {
      S.ct = E.ctMake(q.cl, me, S.seed + ":balct:s" + (S.season + 1));
      S.nl += 10;
      pushNews("\ud83c\udf0d " + myClub().name + " QUALIFY for the CHAMPIONS TROPHY! Continental nights ahead (+10 LC).");
    } else {
      S.ct = null;
      if (q) pushNews("\ud83c\udf0d No Champions Trophy football this season \u2014 finish top of the league to qualify.");
    }
  }
  S.season++; S.matchday = 0; S.results = [];
  S.age = (S.age || 17) + 1;
  if (S.age >= 45) { balRetire(true); return; } // 45: the boots come off, no exceptions
  if (S.age >= 41) pushNews("\u23f3 " + S.name + " is " + S.age + " \u2014 every season now could be the last. Retirement is forced at 45.");
  S.myStats = { apps: 0, goals: 0, assists: 0, ratings: [] };
  S.scorers = {};
  S.cup = { round: 0, alive: true };
  S.condition = 100; S.injury = 0;
  pushNews(`\ud83d\uddd3 Season ${S.season} kicks off \u2014 ${S.name} (age ${S.age}) and ${myClub().name} dream big.`);
  S.lastFive = []; S.transferRequest = false; S.gp += 300; S.nl += 10;
  save();
  render(homeScreen);
}

// ============================ SETTINGS & BACKUP ============================
function flPlayerId() { // stable ID, future-ready for cloud saves / online PvP
  let id = getSet().playerId;
  if (!id) {
    id = "FL-" + Math.random().toString(36).slice(2, 6).toUpperCase() + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
    setSet("playerId", id);
  }
  return id;
}
function settingsScreen() {
  const st = getSet();
  const mlS = (() => { try { return JSON.parse(localStorage.getItem("footballLegendML_v1")); } catch (e) { return null; } })();
  const lifeApps = (S ? S.career.totalApps : 0);
  const lifeGoals = (S ? S.career.totalGoals : 0);
  const mlSeasons = mlS ? (mlS.career || []).length : 0;
  const mlTrophies = mlS ? (mlS.career || []).filter(c => c.pos === 1 || c.cup === "WON").length : 0;
  setTimeout(() => {
    $("#tgsnd").onclick = () => { setSet("sound", !(getSet().sound !== false)); render(settingsScreen); };
    $("#errcopy").onclick = () => {
      const log = localStorage.getItem("flErrLog") || "[]";
      const diag = "Football Legend diagnostics\n" + (navigator.userAgent || "") + "\n" + log;
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(diag).then(() => toast("Diagnostics copied")); }
      else { prompt("Copy this:", diag); }
    };
    $("#errclear").onclick = () => { localStorage.removeItem("flErrLog"); toast("Log cleared"); render(settingsScreen); };
    $("#tgcut").onclick = () => { setSet("cutscenes", !(getSet().cutscenes !== false)); render(settingsScreen); };
    $("#mkbak").onclick = () => {
      const pack = { v: 1, t: Date.now(), bal: localStorage.getItem(SAVE_KEY), ml: localStorage.getItem("footballLegendML_v1") };
      $("#bakout").value = btoa(unescape(encodeURIComponent(JSON.stringify(pack))));
      $("#bakout").style.display = "block";
      toast("\ud83d\udcbe Backup code generated \u2014 copy it somewhere safe");
    };
    $("#rsbak").onclick = () => {
      try {
        const pack = JSON.parse(decodeURIComponent(escape(atob($("#bakin").value.trim()))));
        if (!pack || pack.v !== 1) throw 0;
        if (!confirm("Restore will OVERWRITE current careers. Continue?")) return;
        if (pack.bal) localStorage.setItem(SAVE_KEY, pack.bal); 
        if (pack.ml) localStorage.setItem("footballLegendML_v1", pack.ml);
        toast("\u2705 Restored! Reloading...");
        setTimeout(() => location.reload(), 800);
      } catch (e) { toast("\u274c Invalid backup code"); }
    };
    $("#setback").onclick = () => render(menuScreen);
    let idTaps = 0;
    const ci = $("#cloudin"); if (ci) ci.onclick = () => Cloud.signIn();
    const co = $("#cloudout"); if (co) co.onclick = () => { Cloud.signOut(); render(settingsScreen); };
    const idRow = $("#pidrow");
    if (idRow) idRow.onclick = () => {
      idTaps++;
      if (idTaps >= 7) {
        idTaps = 0;
        const key = prompt("Owner key:");
        if (key === null) return;
        if (window.Cloud && Cloud.enabled() && Cloud.signedIn() && Cloud.verifyOwner) {
          toast("Verifying\u2026");
          Cloud.verifyOwner(key.trim()).then(r => {
            if (r && r.ok) { setSet("ownerMode", true); toast("\ud83d\udc51 Owner mode ON"); render(menuScreen); }
            else toast("\u274c " + ((r && r.msg) || "Wrong key"));
          });
        } else {
          toast("\u274c Sign in with Google first \u2014 owner unlock is server-verified");
        }
      }
    };
    const rb = $("#rstbal"); if (rb) rb.onclick = () => { if (confirm("Delete Become a Legend career? (ML untouched)")) { localStorage.removeItem(SAVE_KEY); S = null; flMirror(SAVE_KEY, null); flFileBackupSoon(); toast("BaL career deleted"); render(settingsScreen); } };
    const rm = $("#rstml"); if (rm) rm.onclick = () => { if (confirm("Delete Master League career? (BaL untouched)")) { localStorage.removeItem("footballLegendML_v1"); flMirror("footballLegendML_v1", null); flFileBackupSoon(); toast("ML career deleted"); render(settingsScreen); } };
  }, 0);
  const kb = (x) => Math.round((x || "").length / 1024 * 10) / 10;
  return `<div class="screen">
    <div class="topbar"><div class="logo"><span class="brand1">SETTINGS</span> <span class="legend">& BACKUP</span></div></div>
    <div class="panel"><h2>\u2699\ufe0f Settings</h2>
      </div>
    <div class="panel"><h2>\ud83d\udc64 Account</h2>
      <div class="kv" id="pidrow" style="cursor:pointer"><span>Player ID</span><b>${flPlayerId()}</b></div>
      ${window.Cloud && Cloud.enabled() ? (Cloud.signedIn()
        ? `<div class="kv"><span>\u2601\ufe0f Cloud</span><b style="color:#7fd67f">\u2705 ${Cloud.accountEmail()}</b></div>
           <p class="sub">Saves sync automatically after matchdays. Sign in on any device to restore.</p>
           <button class="btn secondary" id="cloudout">SIGN OUT</button>`
        : `<div class="kv"><span>\u2601\ufe0f Cloud</span><b style="color:#caa">not connected</b></div>
           <p class="sub">Optional: connect Google to back up your careers online and play across devices. The game works fully offline without it.</p>
           <button class="btn" id="cloudin">\ud83d\udd11 SIGN IN WITH GOOGLE</button>`)
        : `<p class="sub">Your permanent ID \u2014 cloud saves attach to it once online services are configured.</p>`}
      <div class="kv"><span>\u2b50 BaL career</span><b>${S ? S.name + " \u00b7 " + lifeApps + " apps \u00b7 " + lifeGoals + " goals" : "\u2014"}</b></div>
      <div class="kv"><span>\ud83c\udfc6 ML club</span><b>${mlS ? (mlS.clubName || "founded") + " \u00b7 " + mlSeasons + " seasons \u00b7 " + mlTrophies + " trophies" : "\u2014"}</b></div>
      <div class="kv"><span>\ud83d\udcbe Backup protection</span><b>${window.Capacitor ? "\u2705 Auto (file + Android)" : "\u26a0\ufe0f Browser \u2014 use backup codes"}</b></div>
    </div>
    <div class="panel"><h2>\u2699\ufe0f Preferences</h2>
    <div class="kv"><span>\ud83d\udd0a Sound (crowd, whistle, goals)</span><button class="btn secondary" id="tgsnd">${st.sound !== false ? "ON" : "OFF"}</button></div>
      <div class="kv"><span>\ud83e\ude7a Error log (${(() => { try { return JSON.parse(localStorage.getItem("flErrLog") || "[]").length; } catch (e) { return 0; } })()} entries)</span><span><button class="btn secondary" id="errcopy">COPY</button> <button class="btn secondary" id="errclear">CLEAR</button></span></div>
      <p class="sub">If something breaks, tap COPY and send the text to the developer.</p>
      <div class="kv"><span>\ud83c\udfac 3D cutscenes</span><button class="btn secondary" id="tgcut">${st.cutscenes !== false ? "ON" : "OFF"}</button></div>
    </div>
    <div class="panel"><h2>\ud83d\udcbe Backup & Restore</h2>
      <p class="sub">In the app, saves are protected automatically: a backup file in your phone's <b>Documents/FootballLegend</b> folder (survives uninstall \u2014 you'll be offered a restore on reinstall) plus Android's own app backup. The code below is a third option for moving between devices.</p>
      <div class="kv"><span>BaL save</span><b>${localStorage.getItem(SAVE_KEY) ? kb(localStorage.getItem(SAVE_KEY)) + " KB" : "none"}</b></div>
      <div class="kv"><span>ML save</span><b>${localStorage.getItem("footballLegendML_v1") ? kb(localStorage.getItem("footballLegendML_v1")) + " KB" : "none"}</b></div>
      <button class="btn" id="mkbak">\ud83d\udce4 GET BACKUP CODE</button>
      <textarea id="bakout" readonly style="width:100%;height:64px;display:none;margin-top:6px" onclick="this.select()"></textarea>
      <p class="sub" style="margin-top:10px">Restore from a code:</p>
      <textarea id="bakin" style="width:100%;height:64px" placeholder="paste backup code"></textarea>
      <button class="btn secondary" id="rsbak">\ud83d\udce5 RESTORE</button>
    </div>
    <div class="panel"><h2>\u26a0\ufe0f Danger zone</h2>
      ${localStorage.getItem(SAVE_KEY) ? '<button class="btn secondary" id="rstbal">Delete BaL career</button>' : ""}
      ${localStorage.getItem("footballLegendML_v1") ? '<button class="btn secondary" id="rstml">Delete ML club (dynasty & trophies lost!)</button>' : ""}
    </div>
    <button class="btn" id="setback" style="margin:0 14px 14px">\u2b05 MAIN MENU</button>
  </div>`;
}

// ============================ HOW IT WORKS ============================
function howScreen() {
  setTimeout(() => { $("#howback").onclick = () => render(menuScreen); }, 0);
  const sec = (t, b) => `<div class="panel"><h2>${t}</h2><p class="sub" style="line-height:1.55">${b}</p></div>`;
  return `<div class="screen">
    <div class="topbar"><div class="logo"><span class="brand1">HOW IT</span> <span class="legend">WORKS</span></div></div>
    ${sec("\ud83c\udfb2 The honesty law", "Every percentage you see \u2014 win odds, shot odds, free kick conversion \u2014 is the engine's <b>true probability</b>, verified by automated tests on every build. No scripted comebacks, no rubber-banding, no hidden difficulty. If it says 72%, it happens 72% of the time.")}
    ${sec("\u2b50 Become a Legend", "You are one player. During matches the game <b>hard-pauses</b> at your big moments: SHOOT / PASS / HOLD each show real odds. HOLD (\ud83d\udee1) sacrifices the chance to lock possession and guarantees a better one (\u00d71.3 quality). Set pieces have techniques driven by different stats \u2014 they're shown on each button (CURL \u00b7 SHO). Stamina drains and honestly lowers your odds; use SUB when protecting fitness matters. Your pre-match Game Plan is position-specific \u2014 keepers pick how they command the box, defenders how they defend, attackers how they attack \u2014 and it genuinely changes the engine (each plan says how). Train stats your position actually rewards \u2014 the Training screen shows exactly what each point does.")}
    ${sec("\ud83c\udfdf\ufe0f Master League", "You are the manager. Set formation, mentality & playing style (all modifiers shown, applied literally; styles duel \u2014 counter theirs for +1.0 str, scout opponents to reveal it). Pick your XI, then make calls at half-time and the 65' window \u2014 subs and mentality shifts wire straight into the live engine. Between fixtures, take on \ud83c\udfae Event Matches vs AI-controlled rival manager teams (extra GP & trainers, \u221215 XI fitness) \u2014 some league clubs are run by AI manager accounts too (\ud83c\udfae tag in the table). Gate receipts always cover your wage bill: results decide profit, never losses. Build the squad via the market, card draws and \ud83d\udcaa trainer cards; surplus players \u267b convert into trainers. One club, one save, forever \u2014 bad seasons bring board pressure and budget cuts, never a reset.")}
    ${sec("\ud83d\udcb0 Economy", "BaL: GP (earned everywhere) + rare Legend Coins (upgrades, cosmetics). ML: one GP budget \u2014 transfers, wages, draws, trainers all pull from it. Nothing is pay-to-win because there is nothing to pay \u2014 it's your game.")}
    ${sec("\ud83d\udcbe Your saves", "Careers live in this device's browser storage. <b>Make a backup code in Settings</b> \u2014 clearing browser data deletes careers permanently.")}
    <button class="btn" id="howback" style="margin:0 14px 14px">\u2b05 MAIN MENU</button>
  </div>`;
}
