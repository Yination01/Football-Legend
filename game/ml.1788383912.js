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
  possession: { label: "\ud83d\udd35 Possession", beats: "longball",   losesTo: "highpress" },
  highpress:  { label: "\u26a1 High Press",  beats: "possession", losesTo: "counter" },
  counter:    { label: "\ud83d\udde1 Counter",     beats: "highpress",  losesTo: "longball" },
  longball:   { label: "\ud83c\udfaf Long Ball",   beats: "counter",    losesTo: "possession" }
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
const ML_CARDS = [
  { id:"showtime", label:"SHOW TIME", boost: 3 },
  { id:"bigtime",  label:"BIG TIME",  boost: 4 },
  { id:"legendary",label:"LEGENDARY", boost: 6 }
];

// ---------- save ----------
function mlSave() { const v = JSON.stringify(M); localStorage.setItem(ML_KEY, v); if (window.flMirror) window.flMirror(ML_KEY, v); }
function mlLoad() { try { const d = localStorage.getItem(ML_KEY); if (d) M = JSON.parse(d); } catch (e) { M = null; } if (M) { try { mlEnsureTrainers(); } catch (e) {} } }
function mlMode(on) { localStorage.setItem("flMode", on ? "ml" : "bal"); }

// ---------- players ----------
const ML_BUCKET_POS = { GK: ["GK"], DF: ["CB", "CB", "LB", "RB"], MF: ["DMF", "CMF", "CMF", "AMF"], FW: ["CF", "SS", "LWF", "RWF"] };
function mlGenPlayer(rng, region, bucket, ovr) {
  const age = 18 + Math.floor(rng() * 17);
  const pot = Math.min(94, ovr + (age < 22 ? 6 + Math.floor(rng() * 8) : age < 27 ? 2 + Math.floor(rng() * 5) : 0));
  const opts = ML_BUCKET_POS[bucket];
  const rpos = opts[Math.floor(rng() * opts.length)];
  return { id: Math.floor(rng() * 1e9), name: E.genPlayerName(rng, region), pos: bucket, rpos, age, ovr, pot,
           fit: 100, value: mlValue(ovr, age), wage: Math.round(4 + Math.pow(Math.max(0, ovr - 50), 1.6) * 0.55), card: null };
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
function mlEnsureTrainers() {
  M.trainers = M.trainers || { bronze: 2, silver: 1, gold: 0 };
  const mig = E.mulberry32(E.hashSeed(M.seed + ":posmig"));
  for (const p of M.squad) {
    p.exp = p.exp || 0;
    if (!p.rpos) { const o = ML_BUCKET_POS[p.pos] || ["CMF"]; p.rpos = o[Math.floor(mig() * o.length)]; }
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
  const world = E.makeWorld(0, seed, region);
  // your club takes the weakest slot and becomes YOURS: name, colors, identity — forever
  let clubIdx = 0; let weakest = 1e9;
  world.clubs.forEach((c, i) => { if (c.str < weakest) { weakest = c.str; clubIdx = i; } });
  const shortName = (clubName.replace(/[^A-Za-z]/g, "") || "LEG").slice(0, 3).toUpperCase();
  Object.assign(world.clubs[clubIdx], { name: clubName, short: shortName, col1: "#e8c15a", col2: "#131a14", founded: true });
  const rng = E.mulberry32(E.hashSeed(seed + ":squad"));
  const squad = mlGenSquad(rng, region, world.clubs[clubIdx].str);
  M = { seed, region, tier: 0, clubIdx, season: 1, matchday: 0,
        world, results: [], squad, formation: "4-4-2", mentality: "balanced",
        xi: [], budget: 8.0, news: [], cup: { round: 0, alive: true, done: false },
        career: [], sacked: false, packsBought: 0, soldIds: [], boughtBal: false,
        trainers: { bronze: 2, silver: 1, gold: 0 } };
  mlAutoXI();
  M.clubName = clubName; M.clubShort = shortName; M.trophies = []; M.style = "possession"; M.scouted = []; M.evDone = "";
  mlNews("\ud83c\udff3\ufe0f " + clubName + " is founded! Your club, your dynasty \u2014 build it season by season. Budget: " + fmtM(M.budget));
  mlSave();
}
function mlClub() { return M.world.clubs[M.clubIdx]; }
function fmtM(x) { return (x >= 1 ? x.toFixed(1) + "M" : Math.round(x * 1000) + "K") + " GP"; }

// ---------- XI & strength ----------
function effOvr(p, fitOverride) {
  const f = fitOverride != null ? fitOverride : p.fit;
  return p.ovr * (0.80 + 0.20 * Math.max(0, f) / 100);
}
function mlAutoXI() {
  const need = ML_FORMS[M.formation];
  const xi = [];
  for (const bucket of ["GK", "DF", "MF", "FW"]) {
    const pool = M.squad.filter(p => p.pos === bucket && !xi.includes(p.id))
      .sort((a, b) => effOvr(b) - effOvr(a));
    for (let i = 0; i < need[bucket] && i < pool.length; i++) xi.push(pool[i].id);
  }
  M.xi = xi;
}
function mlXIPlayers() { return M.xi.map(id => M.squad.find(p => p.id === id)).filter(Boolean); }
function mlTeamStr(minPlayed) {
  const ps = mlXIPlayers();
  if (!ps.length) return 40;
  const fatigue = minPlayed ? 25 * (minPlayed / 90) : 0;
  const avg = ps.reduce((s, p) => s + effOvr(p, p.fit - fatigue), 0) / ps.length;
  return Math.round(avg * 10) / 10;
}
function mlEffClub(ment) {
  return Object.assign({}, mlClub(), { str: mlTeamStr(0) + ML_MENT[ment || M.mentality].you });
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
    <div class="wallet"><span class="chip">\ud83d\udcb0 ${fmtM(M.budget)}</span></div></div>`;
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

function mlHome() {
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
      ${seasonOver
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
function mlSquadScreen() {
  mlEnsureTrainers();
  setTimeout(() => {
    document.querySelectorAll("[data-sell]").forEach(b => b.onclick = () => {
      const p = M.squad.find(x => x.id === +b.dataset.sell);
      if (!p) return;
      if (M.squad.length <= 15) { toast("Squad too small to sell (min 15)"); return; }
      const fee = Math.round(p.value * 0.85 * 10) / 10;
      if (!confirm("Sell " + p.name + " for " + fmtM(fee) + "?")) return;
      M.budget = Math.round((M.budget + fee) * 10) / 10;
      M.squad = M.squad.filter(x => x.id !== p.id);
      M.soldIds.push(p.id);
      mlAutoXI(); mlNews("SOLD: " + p.name + " (" + fmtM(fee) + ")"); mlSave();
      render(mlSquadScreen);
    });
    const ax = $("#autoxi"); if (ax) ax.onclick = () => { mlAutoXI(); mlSave(); render(mlSquadScreen); toast("Best XI picked"); };
    document.querySelectorAll("[data-trainp]").forEach(b => b.onclick = () => {
      const p = M.squad.find(x => x.id === +b.dataset.trainp);
      if (p) render(() => mlTrainScreen(p.id));
    });
    document.querySelectorAll("[data-conv]").forEach(b => b.onclick = () => {
      const p = M.squad.find(x => x.id === +b.dataset.conv);
      if (!p) return;
      if (M.squad.length <= 15) { toast("Squad too small (min 15)"); return; }
      const tier = mlTrainerFor(p.ovr);
      if (!confirm("Convert " + p.name + " (OVR " + p.ovr + ") into a " + ML_TRAINERS[tier].label + "? No transfer fee.")) return;
      M.squad = M.squad.filter(x => x.id !== p.id);
      M.trainers[tier]++;
      mlNews("CONVERTED: " + p.name + " \u2192 " + ML_TRAINERS[tier].label);
      mlAutoXI(); mlSave(); render(mlSquadScreen);
    });
  }, 0);
  const rows = ["GK", "DF", "MF", "FW"].map(bucket => M.squad.filter(p => p.pos === bucket)
    .sort((a, b) => b.ovr - a.ovr).map(p => {
      const inXI = M.xi.includes(p.id);
      const trainable = p.ovr < p.pot;
      const expPct = trainable ? Math.round(100 * (p.exp || 0) / mlExpNeed(p)) : 0;
      return `<div class="kv"><span>${inXI ? "\u2b50" : ""} <b>${mlRpos(p)}</b> ${p.name}${p.card ? ` <span class="badge gold">${p.card}</span>` : ""}<br>
        <span class="sub">age ${p.age} \u00b7 fit ${Math.round(p.fit)}% \u00b7 ${fmtM(p.value)}${trainable ? ` \u00b7 \ud83d\udcc8 ${expPct}% to ${p.ovr + 1}` : " \u00b7 MAX"}</span></span>
        <b>${p.ovr}${p.pot > p.ovr ? `<span class="sub">/${p.pot}</span>` : ""}
        ${trainable ? `<button class="btn gold" data-trainp="${p.id}" style="padding:4px 6px;font-size:.6rem;margin-left:4px">\u2b06 TRAIN</button>` : ""}
        <button class="btn secondary" data-conv="${p.id}" style="padding:4px 6px;font-size:.6rem;margin-left:4px">\u267b</button>
        <button class="btn secondary" data-sell="${p.id}" style="padding:4px 6px;font-size:.6rem;margin-left:4px">SELL</button></b></div>`;
    }).join("")).join("");
  return `<div class="screen">${mlTopbar()}
    <div class="panel"><h2>Squad (${M.squad.length}) <button class="btn secondary" id="autoxi" style="float:right;padding:6px 10px;font-size:.7rem">\u2b50 AUTO BEST XI</button></h2>
    <p class="sub">\u2b50 = in starting XI (${M.formation}). XI strength: <b>${mlTeamStr(0)}</b></p>
    <p class="sub">Trainers owned: \ud83e\udd49${M.trainers.bronze} \ud83e\udd48${M.trainers.silver} \ud83e\udd47${M.trainers.gold}</p>
    <div class="kv"><span>\u2b06 TRAIN</span><span class="sub">spend trainer cards \u2192 EXP toward +1 OVR (up to potential)</span></div>
    <div class="kv"><span>\u267b</span><span class="sub">retire player into a trainer card \u2014 no fee, better player = better trainer</span></div>
    <div class="kv"><span>SELL</span><span class="sub">instant sale at 85% of value (squad must stay \u2265 15)</span></div>
    <div class="kv"><span>\u2b50 AUTO BEST XI</span><span class="sub">auto-picks the strongest lineup for ${M.formation}</span></div>${rows}</div>
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
    document.querySelectorAll("[data-use]").forEach(b => b.onclick = () => {
      const tier = b.dataset.use;
      if (M.trainers[tier] <= 0) { toast("None left \u2014 win matches or buy in Card Draws"); return; }
      if (p.ovr >= p.pot) { toast("At full potential"); return; }
      M.trainers[tier]--;
      p.exp = (p.exp || 0) + ML_TRAINERS[tier].exp;
      let ups = 0;
      while (p.exp >= mlExpNeed(p) && p.ovr < p.pot) { p.exp -= mlExpNeed(p); p.ovr++; ups++; }
      if (p.ovr >= p.pot) p.exp = 0;
      p.value = mlValue(p.ovr, p.age);
      if (ups) { mlNews("LEVELED UP: " + p.name + " \u2192 OVR " + p.ovr); toast("\ud83d\udcaa " + p.name + " \u2192 OVR " + p.ovr); }
      mlAutoXI(); mlSave(); render(() => mlTrainScreen(pid));
    });
    $("#trback").onclick = () => render(mlSquadScreen);
  }, 0);
  const pct = maxed ? 100 : Math.round(100 * (p.exp || 0) / need);
  return `<div class="screen">${mlTopbar()}
    <div class="panel">
      <h2>\ud83d\udcaa Training: ${p.name}</h2>
      <div class="kv"><span>${mlRpos(p)} \u00b7 age ${p.age}${p.card ? " \u00b7 " + p.card : ""}</span><b>OVR ${p.ovr}${p.pot > p.ovr ? " / " + p.pot + " potential" : " (MAX)"}</b></div>
      ${maxed ? '<p class="sub">At full potential \u2014 trainers would be wasted.</p>' : `
      <div class="mombar" style="margin:8px 0"><div class="momfill" style="width:${pct}%"></div></div>
      <p class="sub center">${p.exp || 0} / ${need} EXP to OVR ${p.ovr + 1}</p>`}
      ${Object.entries(ML_TRAINERS).map(([id, t]) =>
        `<div class="kv"><span>${t.label}<br><span class="sub">+${t.exp} EXP \u00b7 you have ${M.trainers[id]}</span></span>
         <button class="btn ${id === "gold" ? "gold" : "secondary"}" data-use="${id}" ${M.trainers[id] <= 0 || maxed ? "disabled" : ""}>USE</button></div>`).join("")}
      <p class="sub">Earn trainers by winning matches & events, buy them in Card Draws, or \u267b convert surplus players.</p>
      <button class="btn secondary" id="trback">\u2b05 SQUAD</button>
    </div>
  </div>`;
}

// ---------- tactics ----------
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
  }, 0);
  return `<div class="screen">${mlTopbar()}
    <div class="panel"><h2>Formation</h2>
      <div class="optrow">${Object.keys(ML_FORMS).map(f =>
        `<div class="opt ${M.formation === f ? "sel" : ""}" data-form="${f}" style="flex:1 1 45%">${f}<br>
         <span class="sub">${Object.entries(ML_FORMS[f]).map(([k, v]) => v + k).join(" ")}</span></div>`).join("")}</div>
      <p class="sub">Changing formation re-picks your best XI automatically.</p></div>
    <div class="panel"><h2>Mentality</h2>
      <div class="optrow">${Object.entries(ML_MENT).map(([id, m]) =>
        `<div class="opt ${M.mentality === id ? "sel" : ""}" data-ment="${id}" style="flex:1 1 30%">${m.label}<br><span class="sub">${m.desc}</span></div>`).join("")}</div>
      <p class="sub">Honest modifiers, shown exactly as applied to team strength. XI now: <b>${mlTeamStr(0) + ML_MENT[M.mentality].you}</b> effective.</p></div>
    <div class="panel"><h2>Playing Style</h2>
      <div class="optrow">${Object.entries(ML_STYLES).map(([id, st]) =>
        `<div class="opt ${(M.style || "possession") === id ? "sel" : ""}" data-styl="${id}" style="flex:1 1 45%">${st.label}<br><span class="sub">beats ${ML_STYLES[st.beats].label} \u00b7 loses to ${ML_STYLES[st.losesTo].label}</span></div>`).join("")}</div>
      <p class="sub">One pick, honest numbers: counter their style for <b>+1.0 str</b> (baked into the shown odds). Opponents\u2019 styles are hidden until you\u2019ve played them \u2014 or scout on the match preview.</p></div>
    ${mlNav()}</div>`;
}

// ---------- market ----------
function mlMarketPool() {
  const rng = E.mulberry32(E.hashSeed(M.seed + ":mkt:" + M.season + ":" + M.matchday));
  const pool = [];
  for (let i = 0; i < 6; i++) {
    const bucket = ["GK", "DF", "DF", "MF", "MF", "FW"][i];
    const p = mlGenPlayer(rng, M.region, bucket, 56 + Math.floor(rng() * 25));
    if (rng() < 0.25) { // eFootball-style special cards appear in the market too
      const card = ML_CARDS[Math.floor(rng() * ML_CARDS.length)];
      p.card = card.label; p.ovr = Math.min(93, p.ovr + card.boost);
      p.value = mlValue(p.ovr, p.age) * 1.25;
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
      const price = Math.round(p.value * 10) / 10;
      if (M.budget < price) { toast("Not enough budget"); return; }
      if (M.squad.length >= 24) { toast("Squad full (24)"); return; }
      M.budget = Math.round((M.budget - price) * 10) / 10;
      M.squad.push(Object.assign({}, p));
      if (p.bal) M.boughtBal = true;
      mlAutoXI(); mlNews("SIGNED: " + p.name + " for " + fmtM(price)); mlSave();
      toast("\u2705 " + p.name + " signs!"); render(mlMarketScreen);
    });
  }, 0);
  const row = (p) => `<div class="kv"><span><b>${mlRpos(p)}</b> ${p.name}${p.card ? ` <span class="badge gold">${p.card}</span>` : ""}<br>
    <span class="sub">age ${p.age} \u00b7 OVR ${p.ovr}${p.pot > p.ovr ? "/" + p.pot : ""} \u00b7 ${p.wage}K/wk</span></span>
    <button class="btn ${p.card ? "gold" : "secondary"}" data-buy="${p.id}" style="padding:6px 10px;font-size:.7rem">${fmtM(Math.round(p.value * 10) / 10)}</button></div>`;
  return `<div class="screen">${mlTopbar()}
    ${star ? `<div class="panel"><h2>\u2b50 Available: your Legend</h2><p class="sub">Your Become a Legend player, exported to this market.</p>${row(star)}</div>` : ""}
    <div class="panel"><h2>Transfer Market</h2><p class="sub">Pool refreshes every matchday. Sell from the Squad screen (85% of value).</p>
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
      const cost = kind === "std" ? 3 : 9;
      if (M.budget < cost) { toast("Not enough budget"); return; }
      if (M.squad.length >= 24) { toast("Squad full"); return; }
      M.budget = Math.round((M.budget - cost) * 10) / 10;
      M.packsBought++;
      const rng = E.mulberry32(E.hashSeed(M.seed + ":pack:" + M.packsBought));
      const bucket = ["GK", "DF", "MF", "MF", "FW"][Math.floor(rng() * 5)];
      let p;
      if (kind === "std") {
        p = mlGenPlayer(rng, M.region, bucket, 62 + Math.floor(rng() * 13));
      } else {
        p = mlGenPlayer(rng, M.region, bucket, 74 + Math.floor(rng() * 11));
        const card = ML_CARDS[Math.floor(rng() * ML_CARDS.length)];
        p.card = card.label; p.ovr = Math.min(93, p.ovr + (rng() < 0.35 ? card.boost : Math.ceil(card.boost / 2)));
        p.value = mlValue(p.ovr, p.age);
      }
      M.squad.push(p); mlAutoXI(); mlNews("DRAW: " + p.name + " (" + p.ovr + " " + p.pos + (p.card ? " \u00b7 " + p.card : "") + ")");
      mlSave(); toast("\ud83c\udccf " + p.name + " \u00b7 OVR " + p.ovr + (p.card ? " \u00b7 " + p.card : ""));
      render(mlPacksScreen);
    });
  }, 0);
  return `<div class="screen">${mlTopbar()}
    <div class="panel"><h2>\ud83c\udccf Card Draws</h2>
      <p class="sub">Funded from your transfer budget. Odds are the generation ranges shown \u2014 nothing hidden.</p>
      <div class="kv"><span><b>Standard Draw</b><br><span class="sub">OVR 62\u201374, any position</span></span><button class="btn secondary" data-pack="std">3.0M</button></div>
      <div class="kv"><span><b>\u2b50 Star Draw</b><br><span class="sub">OVR 74\u201384 + SHOW TIME / BIG TIME / LEGENDARY card (up to +6)</span></span><button class="btn gold" data-pack="star">9.0M</button></div>
    </div>
    <div class="panel"><h2>\ud83d\udcaa Trainer Cards</h2>
      <p class="sub">EXP material \u2014 apply to any player from the Squad screen. You have: \ud83e\udd49${M.trainers.bronze} \ud83e\udd48${M.trainers.silver} \ud83e\udd47${M.trainers.gold}</p>
      ${Object.entries(ML_TRAINERS).map(([id, t]) =>
        `<div class="kv"><span>${t.label}<br><span class="sub">+${t.exp} EXP</span></span>
         <button class="btn ${id === "gold" ? "gold" : "secondary"}" data-buytr="${id}">${t.price.toFixed(1)}M</button></div>`).join("")}
    </div>
    ${mlNav()}</div>`;
}

// ---------- table & news ----------
function mlTableScreen() {
  const table = E.computeTable(M.world.clubs, M.results);
  return `<div class="screen">${mlTopbar()}
    <div class="panel"><h2>${M.tier === 0 ? (E.REGION_LEAGUES[M.region] || "National League") : "Continental Super League"}</h2>
    ${table.map((t, i) => `<div class="kv" ${t.i === M.clubIdx ? 'style="color:var(--gold)"' : ""}>
      <span>${i + 1}. ${M.world.clubs[t.i].name}${t.i === M.clubIdx ? " (YOU)" : ""}${mlManagerOf(M.world.clubs[t.i]) ? ` <span class="sub">\ud83c\udfae ${mlManagerOf(M.world.clubs[t.i])}</span>` : ""}</span>
      <b>${t.Pts} pts \u00b7 ${t.GF}-${t.GA}</b></div>`).join("")}</div>
    ${mlNav()}</div>`;
}
function mlNewsScreen() {
  return `<div class="screen">${mlTopbar()}
    <div class="panel"><h2>\ud83d\udcf0 Club News</h2>
    ${M.news.map(n => `<div class="kv"><span class="sub">S${n.s} MD${n.md}</span><span>${n.txt}</span></div>`).join("") || '<p class="sub">Quiet so far.</p>'}</div>
    ${mlNav()}</div>`;
}

// ============================ MATCHDAY ============================
function mlGoMatch() {
  if (M.matchday >= 18 && !mlCupPending()) { render(mlHome); return; }
  render(mlPreview);
}
function mlFixtureNow() {
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
  const meHome = fx.home === M.clubIdx;
  const oppClub = M.world.clubs[meHome ? fx.away : fx.home];
  const oppStyle = mlStyleOf(oppClub);
  const duel = mlStyleDuel(M.style || "possession", oppStyle);
  const scouted = (M.scouted || []).includes(oppClub.name);
  const myEff = mlEffClub();
  myEff.str = Math.round((myEff.str + duel.you) * 10) / 10;
  const oppEff = Object.assign({}, oppClub, { str: oppClub.str + duel.opp });
  const Hc = meHome ? myEff : oppEff;
  const Ac = meHome ? oppEff : myEff;
  const probs = E.winProbs(Hc, Ac, 600);
  setTimeout(() => {
    $("#mlkick").onclick = () => render(() => mlMatchScreen(fx, probs));
    const tw = $("#mltweak"); if (tw) tw.onclick = () => render(mlTacticsScreen);
    const sc = $("#mlscout"); if (sc) sc.onclick = () => {
      if (M.budget < 0.3) { toast("\u274c Not enough GP (0.3M needed)"); return; }
      M.budget = Math.round((M.budget - 0.3) * 100) / 100;
      M.scouted = M.scouted || []; M.scouted.push(oppClub.name); mlSave(); render(mlPreview);
    };
  }, 0);
  return `<div class="screen">${mlTopbar()}
    <div class="panel">
      <h2>${fx.cup ? "\ud83c\udfc6 CUP \u00b7 " + ML_CUP_ROUNDS[M.cup.round] : "Match Preview \u00b7 MD " + (M.matchday + 1)}</h2>
      <div class="vsrow">
        <div class="vsteam"><div class="tname">${M.world.clubs[fx.home].name}</div><div class="sub">str ${(meHome ? myEff : oppEff).str}</div></div>
        <div class="vsx">VS</div>
        <div class="vsteam"><div class="tname">${M.world.clubs[fx.away].name}</div><div class="sub">str ${(meHome ? oppEff : myEff).str}</div></div>
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
      <button class="btn secondary" id="mltweak">\ud83d\udccb ADJUST TACTICS / XI</button>
      <button class="btn" id="mlkick">KICK OFF \u26bd</button>
    </div>
  </div>`;
}

function mlMatchScreen(fx, displayedProbs) {
  const meHome = fx.home === M.clubIdx;
  const Hc = M.world.clubs[fx.home], Ac = M.world.clubs[fx.away];
  const seed = E.hashSeed(M.seed + ":s" + M.season + ":md" + M.matchday + (fx.cup ? ":cup" + M.cup.round : ""));
  const duel = mlStyleDuel(M.style || "possession", mlStyleOf(meHome ? Ac : Hc));
  let ment = M.mentality;
  let subsLeft = 3, subbedOnIds = [], windowsShown = { 45: false, 65: false };
  const myStart = mlEffClub(ment).str + duel.you;
  const match = E.createMatch(
    meHome ? Object.assign({}, Hc, { str: myStart }) : Hc,
    meHome ? Ac : Object.assign({}, Ac, { str: myStart }),
    { seed });
  // opponent mentality effect applies to their side too (ML_MENT.opp)
  applyStrengths(0);
  let timer = null, speed = 1, over = false;

  function applyStrengths(minPlayed) {
    const mm = ML_MENT[ment];
    const mine = mlTeamStr(minPlayed) + mm.you + duel.you;
    const theirs = (meHome ? Ac.str : Hc.str) + mm.opp + duel.opp;
    if (meHome) match.setStrengths(mine + 4, theirs);
    else match.setStrengths(theirs + 4, mine);
  }
  setTimeout(() => {
    const clockEl = $("#mlclock"), scoreEl = $("#mlscore"), tickEl = $("#mlticker"), momEl = $("#mlmom");
    const decEl = $("#mldec");
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
      const bench = M.squad.filter(p => !M.xi.includes(p.id) && !subbedOnIds.includes(p.id))
        .sort((a, b) => effOvr(b) - effOvr(a)).slice(0, 6);
      const tired = mlXIPlayers().map(p => ({ p, cur: p.fit - 25 * (match.state.min / 90) }))
        .sort((a, b) => a.cur - b.cur).slice(0, 6);
      decEl.style.display = "block";
      decEl.innerHTML = `<div class="scenline">${kind === "ht" ? "\ud83d\udde3 HALF-TIME TEAM TALK" : "\ud83d\udccb TACTICAL WINDOW \u2014 " + match.state.min + "'"} \u00b7 ${match.state.gH}-${match.state.gA}</div>
        <p class="sub" style="margin:4px 0">Mentality (honest str mods):</p>
        <div class="optrow">${Object.entries(ML_MENT).map(([id, m]) =>
          `<div class="opt ${ment === id ? "sel" : ""}" data-wment="${id}" style="flex:1 1 30%;font-size:.7rem">${m.label}</div>`).join("")}</div>
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
    function endM() {
      if (over) return; over = true;
      clearInterval(timer);
      const r = match.result();
      addTick(90, `<b>FULL TIME.</b> ${Hc.short} ${r.gH} - ${r.gA} ${Ac.short}`, "goal");
      if (window.Snd) Snd.fulltime();
      decEl.style.display = "block";
      decEl.innerHTML = `<div class="scenline">\ud83c\udfc1 FULL TIME \u00b7 ${Hc.short} ${r.gH} - ${r.gA} ${Ac.short}</div>
        <button class="btn" id="mlft">CONTINUE \u2794</button>`;
      $("#mlft").onclick = () => mlFinish(fx, r, displayedProbs);
    }
    function step() {
      const s = match.step();
      clockEl.textContent = s.min + "'";
      scoreEl.textContent = match.state.gH + " - " + match.state.gA;
      momEl.style.width = (meHome ? match.state.momentum : 100 - match.state.momentum) + "%";
      for (const ev of s.events) describe(ev);
      if (s.min === 45 && !windowsShown[45] && speed < 3) { windowsShown[45] = true; addTick(45, "Half-time.", ""); showWindow("ht"); return; }
      if (s.min === 65 && !windowsShown[65] && speed < 3) { windowsShown[65] = true; showWindow("win"); return; }
      if (s.done || match.state.done) endM();
    }
    function runClock() {
      clearInterval(timer);
      timer = setInterval(step, speed === 0.5 ? 560 : speed === 1 ? 260 : speed === 2 ? 100 : 15);
    }
    document.querySelectorAll("[data-mlspeed]").forEach(b => b.onclick = () => {
      speed = +b.dataset.mlspeed;
      document.querySelectorAll("[data-mlspeed]").forEach(x => x.classList.toggle("on", +x.dataset.mlspeed === speed));
      if (timer) runClock();
    });
    if (window.Snd) Snd.kickoff();
    addTick(0, `Kick off! ${M.formation} \u00b7 ${ML_MENT[ment].label}. Odds were ${displayedProbs.home}/${displayedProbs.draw}/${displayedProbs.away}.`, "");
    runClock();
  }, 0);
  return `<div class="screen">${mlTopbar()}
    <div class="panel">
      <div class="scoreline"><span>${Hc.short}</span><b id="mlscore">0 - 0</b><span>${Ac.short}</span></div>
      <div class="center"><span class="badge" id="mlclock">0'</span></div>
      <div class="mombar"><div class="momfill" id="mlmom" style="width:50%"></div></div>
      <div class="momlabels"><span>us</span><span>momentum</span><span>them</span></div>
      <div id="mldec" class="decisionbox" style="display:none"></div>
      <div class="ticker" id="mlticker" style="height:240px"></div>
      <div class="speedrow">
        <button class="btn secondary" data-mlspeed="0.5">\ud83d\udc22 \u00bdx</button>
        <button class="btn secondary on" data-mlspeed="1">\u25b6 1x</button>
        <button class="btn secondary" data-mlspeed="2">\u23e9 2x</button>
        <button class="btn secondary" data-mlspeed="3">\u23ed SKIP</button>
      </div>
    </div>
  </div>`;
}

function mlFinish(fx, r, probs) {
  const meHome = fx.home === M.clubIdx;
  const oppNm = M.world.clubs[meHome ? fx.away : fx.home].name;
  M.scouted = M.scouted || []; if (!M.scouted.includes(oppNm)) M.scouted.push(oppNm);
  const myG = meHome ? r.gH : r.gA, opG = meHome ? r.gA : r.gH;
  const res = myG > opG ? "W" : myG === opG ? "D" : "L";
  // finances
  const wages = M.squad.reduce((s, p) => s + p.wage, 0) / 1000; // M per MD
  let prize = res === "W" ? 0.6 : res === "D" ? 0.3 : 0.1; // net profit AFTER gate receipts cover the wage bill
  if (fx.cup) {
    if (res === "W" || (res === "D" && E.mulberry32(E.hashSeed(M.seed + "pens" + M.matchday))() < 0.5)) {
      prize += ML_CUP_PRIZE[M.cup.round];
      mlNews("\ud83c\udfc6 " + ML_CUP_ROUNDS[M.cup.round] + " WON! " + (M.cup.round === 3 ? "CUP CHAMPIONS!" : "Through to the " + ML_CUP_ROUNDS[M.cup.round + 1] + "."));
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
      <div class="kv"><span>Matchday profit</span><b style="color:var(--green)">+${fmtM(prize)}</b></div>
      ${evGp ? `<div class="kv"><span>\ud83c\udfaf Events</span><b style="color:var(--green)">+${fmtM(evGp)}</b></div>` : ""}
      ${drops.length ? `<div class="kv"><span>\ud83c\udf81 Trainers</span><b style="color:var(--gold)">${drops.join(" + ")}</b></div>` : ""}
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
function mlSeasonEnd() {
  const table = E.computeTable(M.world.clubs, M.results);
  const pos = table.findIndex(t => t.i === M.clubIdx) + 1;
  const strRank = M.world.clubs.map((c, i) => ({ i, s: i === M.clubIdx ? mlTeamStr(0) : c.str }))
    .sort((a, b) => b.s - a.s).findIndex(x => x.i === M.clubIdx) + 1;
  const prize = [8, 6, 4.5, 3.5, 3, 2.5, 2, 1.5, 1.2, 1][pos - 1] || 1;
  M.budget = Math.round((M.budget + prize) * 10) / 10;
  const sacked = pos > strRank + 3;
  const promoted = M.tier === 0 && pos <= 2;
  const relegated = M.tier === 1 && pos >= 8;
  M.career.push({ season: M.season, tier: M.tier, pos, cup: M.cup.done ? "WON" : M.cup.alive ? "-" : "out R" + (M.cup.round + 1) });
  // aging & growth
  for (const p of M.squad) {
    p.age++;
    if (p.age <= 23 && p.ovr < p.pot) p.ovr += 1 + (Math.random() < 0.5 ? 1 : 0);
    else if (p.age <= 29 && p.ovr < p.pot && Math.random() < 0.5) p.ovr += 1;
    else if (p.age >= 33) p.ovr -= 2;
    else if (p.age >= 31) p.ovr -= 1;
    p.ovr = Math.max(40, Math.min(94, p.ovr));
    p.value = mlValue(p.ovr, p.age);
    p.fit = 100;
  }
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
  if (promoted) {
    M.tier = 1;
    M.world = E.makeWorld(1, M.seed + ":s" + (M.season + 1), M.region);
    M.clubIdx = reattach(M.world);
    txt += " \ud83c\udf89 PROMOTED \u2014 " + (M.clubName || "your club") + " reach the Continental Super League!";
  } else if (relegated) {
    M.tier = 0;
    M.world = E.makeWorld(0, M.seed + ":s" + (M.season + 1), M.region);
    M.clubIdx = reattach(M.world);
    txt += " \ud83d\udcc9 Relegated \u2014 back to the national league. The dynasty continues.";
  } else {
    M.world = E.makeWorld(M.tier, M.seed + ":s" + (M.season + 1), M.region);
    M.clubIdx = reattach(M.world);
  }
  M.season++; M.matchday = 0; M.results = [];
  M.cup = { round: 0, alive: true, done: false };
  mlAutoXI(); mlNews(txt); mlSave();
  render(mlHome);
}

// ---------- entry ----------
window.ML = {
  enter() {
    mlLoad();
    mlMode(true);
    if (M && M.sacked) { M.sacked = false; M.pressure = 2; mlSave(); } // migrate old sacked saves: club survives, heavy pressure
    if (M && !M.style) { M.style = "possession"; M.scouted = M.scouted || []; mlSave(); } // migrate: playing styles update
    if (M && M.evDone === undefined) { M.evDone = ""; mlSave(); } // migrate: event matches update
    render(M ? mlHome : mlCreate);
  }
};
// entry is always the main menu (app.js menuScreen); ML.enter() is the only door in.
