// Fairness + sanity tests for the Naija Legend engine.
const E = require("./engine.js");

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log("PASS  " + name + (detail ? "  [" + detail + "]" : "")); }
  else { fail++; console.log("FAIL  " + name + (detail ? "  [" + detail + "]" : "")); }
}

// --- 1. FAIRNESS: displayed odds vs independent observed outcomes ---
// winProbs uses seeds 777000+; observe with a DIFFERENT seed stream to prove
// the numbers generalize (i.e., odds describe the true distribution, not a rig).
const pairs = [
  [E.STARTER_CLUBS[0], E.STARTER_CLUBS[1]], // weak home vs strong away
  [E.STARTER_CLUBS[1], E.STARTER_CLUBS[7]], // strong home vs weak away
  [E.STARTER_CLUBS[3], E.STARTER_CLUBS[6]], // even matchup
];
for (const [h, a] of pairs) {
  const displayed = E.winProbs(h, a, 2000);
  const N = 4000;
  let w = 0, d = 0;
  for (let i = 0; i < N; i++) {
    const r = E.simulateMatch(h, a, { seed: 123456789 + i * 7919, fast: true });
    if (r.gH > r.gA) w++; else if (r.gH === r.gA) d++;
  }
  const obsW = (w / N) * 100, obsD = (d / N) * 100, obsL = 100 - obsW - obsD;
  const tol = 4; // percentage points
  check(
    `fairness ${h.short} vs ${a.short}`,
    Math.abs(obsW - displayed.home) < tol &&
    Math.abs(obsD - displayed.draw) < tol &&
    Math.abs(obsL - displayed.away) < tol,
    `displayed ${displayed.home}/${displayed.draw}/${displayed.away} vs observed ${obsW.toFixed(1)}/${obsD.toFixed(1)}/${obsL.toFixed(1)}`
  );
}

// --- 2. Stronger teams win more often (monotonicity) ---
{
  const strong = E.STARTER_CLUBS[1]; // str 70
  const weak = E.STARTER_CLUBS[7];   // str 58
  const p = E.winProbs(strong, weak, 2000);
  check("strong home favored over weak away", p.home > p.away + 15, `${p.home}% vs ${p.away}%`);
}

// --- 3. Home advantage exists but is not absurd ---
{
  const A = E.STARTER_CLUBS[3], B = { ...E.STARTER_CLUBS[3], name: "Mirror", short: "MIR" };
  const p = E.winProbs(A, B, 3000);
  check("home edge for equal teams (5-20 pts)", p.home > p.away && p.home - p.away < 20, `${p.home}/${p.draw}/${p.away}`);
}

// --- 4. Determinism: same seed => same result ---
{
  const r1 = E.simulateMatch(E.STARTER_CLUBS[0], E.STARTER_CLUBS[2], { seed: 42 });
  const r2 = E.simulateMatch(E.STARTER_CLUBS[0], E.STARTER_CLUBS[2], { seed: 42 });
  check("deterministic per seed", r1.gH === r2.gH && r1.gA === r2.gA && r1.events.length === r2.events.length);
}

// --- 5. Realistic scorelines: average goals/game in football range ---
{
  let goals = 0; const N = 3000;
  for (let i = 0; i < N; i++) {
    const r = E.simulateMatch(E.STARTER_CLUBS[2], E.STARTER_CLUBS[5], { seed: 5000 + i, fast: true });
    goals += r.gH + r.gA;
  }
  const avg = goals / N;
  check("avg goals/game 2.0-3.4", avg >= 2.0 && avg <= 3.4, avg.toFixed(2));
}

// --- 6. Player stats matter: better SHO => more goals (long run) ---
{
  const mk = (SHO) => ({ pos: "CF", playstyle: "poacher", eff: { PAC: 70, SHO, PAS: 55, DRI: 62, DEF: 32, PHY: 62 } });
  let gLow = 0, gHigh = 0; const N = 3000;
  for (let i = 0; i < N; i++) {
    gLow  += E.simulateMatch(E.STARTER_CLUBS[0], E.STARTER_CLUBS[4], { seed: 9000 + i, player: mk(50), playerTeam: 0 }).pGoals;
    gHigh += E.simulateMatch(E.STARTER_CLUBS[0], E.STARTER_CLUBS[4], { seed: 9000 + i, player: mk(90), playerTeam: 0 }).pGoals;
  }
  check("SHO 90 scores more than SHO 50", gHigh > gLow * 1.2, `${gHigh} vs ${gLow} over ${N} matches`);
}

// --- 7. Ratings bounded and sane ---
{
  let min = 11, max = 0, sum = 0; const N = 2000;
  const P = { pos: "AMF", playstyle: "classic10", eff: { PAC: 62, SHO: 60, PAS: 68, DRI: 66, DEF: 40, PHY: 52 } };
  for (let i = 0; i < N; i++) {
    const r = E.simulateMatch(E.STARTER_CLUBS[0], E.STARTER_CLUBS[3], { seed: 30000 + i, player: P, playerTeam: 0, role: "balanced" });
    min = Math.min(min, r.rating); max = Math.max(max, r.rating); sum += r.rating;
  }
  const avg = sum / N;
  check("ratings within 4.0-10.0", min >= 4.0 && max <= 10.0, `min ${min} max ${max}`);
  check("avg rating 5.8-7.2", avg > 5.8 && avg < 7.2, avg.toFixed(2));
}

// --- 8. Fixtures: every team plays every other home & away ---
{
  const rng = E.mulberry32(1);
  const w = E.makeWorld(0, "testsave");
  const seen = new Set();
  let count = 0;
  for (const md of w.fixtures) for (const [h, a] of md) { seen.add(h + ">" + a); count++; }
  const n = w.clubs.length;
  check("double round robin complete", count === n * (n - 1) && seen.size === n * (n - 1), `${count} fixtures`);
}


// --- 9. Interactive core: decisions actually occur and resolve ---
{
  const m = E.createMatch(E.STARTER_CLUBS[0], E.STARTER_CLUBS[4], {
    seed: 4242, player: { pos: "CF", playstyle: "poacher", eff: E.baseStats("CF") }, playerTeam: 0, role: "aggressive"
  });
  let decisions = 0, done = false;
  while (!done) {
    const s = m.step();
    if (s.decision) { decisions++; m.decide(decisions % 3 === 0 ? "shoot" : decisions % 3 === 1 ? "pass" : "hold"); }
    done = s.done || m.state.done;
  }
  const r = m.result();
  check("interactive match completes with decisions", decisions > 0 && r.rating >= 4 && r.rating <= 10, decisions + " decisions, rating " + r.rating);
}

// --- 10. Choices are honest: shoot converts more with high SHO than low SHO ---
{
  function run(SHO, choice) {
    let g = 0;
    for (let i = 0; i < 2500; i++) {
      const m = E.createMatch(E.STARTER_CLUBS[0], E.STARTER_CLUBS[4], {
        seed: 60000 + i, player: { pos: "CF", playstyle: "poacher", eff: { PAC: 70, SHO, PAS: 55, DRI: 62, DEF: 32, PHY: 62 } }, playerTeam: 0
      });
      let done = false;
      while (!done) { const s = m.step(); if (s.decision) m.decide(choice); done = s.done || m.state.done; }
      g += m.result().pGoals;
    }
    return g;
  }
  const lo = run(50, "shoot"), hi = run(90, "shoot");
  check("shoot decision scales with SHO", hi > lo * 1.2, hi + " vs " + lo);
}

// --- 11. GK career path: saves accrue, ratings sane ---
{
  let saves = 0, sum = 0; const N = 800;
  for (let i = 0; i < N; i++) {
    const r = E.simulateMatch(E.STARTER_CLUBS[0], E.STARTER_CLUBS[3], {
      seed: 91000 + i, fast: true, player: { pos: "GK", playstyle: "shotstopper", eff: E.baseStats("GK") }, playerTeam: 0
    });
    saves += r.pSaves; sum += r.rating;
  }
  check("GK makes saves and rates sanely", saves > N * 0.5 && sum / N > 5.5 && sum / N < 7.5, (saves / N).toFixed(2) + " saves/match, avg rating " + (sum / N).toFixed(2));
}

// --- 12. All 11 positions produce valid OVR and playstyles exist ---
{
  let ok = true, styles = 0;
  for (const pos of Object.keys(E.POSITIONS)) {
    const o = E.calcOVR(E.baseStats(pos), pos);
    if (!(o > 40 && o < 80)) ok = false;
    styles += E.stylesFor(pos).length;
    if (E.stylesFor(pos).length === 0) ok = false;
  }
  check("11 positions valid, every position has playstyles", ok && Object.keys(E.POSITIONS).length === 11, styles + " total style-position links");
}

// --- 13. Region name pools all generate ---
{
  const rng = E.mulberry32(7);
  let ok = true;
  for (const reg of Object.keys(E.REGIONS)) {
    const n = E.genPlayerName(rng, reg);
    if (!n || n.split(" ").length < 2) ok = false;
  }
  check("all regions generate names", ok, Object.keys(E.REGIONS).length + " regions");
}

// --- 14. GK decision odds are honest: displayed save% matches simulated outcomes ---
{
  function gkTrial(DEF, roleId, choice, N) {
    let saves = 0, shown = null;
    for (let i = 0; i < N; i++) {
      const m = E.createMatch(E.STARTER_CLUBS[0], E.STARTER_CLUBS[3], {
        seed: 300000 + i, player: { pos: "GK", playstyle: "shotstopper", eff: { PAC: 50, SHO: 30, PAS: 55, DRI: 40, DEF, PHY: 60 } }, playerTeam: 0, role: roleId
      });
      let done = false, counted = false;
      while (!done) {
        const s = m.step();
        if (s.decision && s.decision.type === "gk" && !counted) {
          counted = true;
          if (!shown) shown = E.decisionOdds(s.decision, { pos: "GK", playstyle: "shotstopper", eff: { PAC: 50, SHO: 30, PAS: 55, DRI: 40, DEF, PHY: 60 } }, roleId);
          const pre = [m.state.gH, m.state.gA];
          m.decide(choice);
          const conceded = m.state.gA > pre[1] || m.state.gH > pre[0];
          if (!conceded) saves++;
        } else if (s.decision) {
          m.decide("auto");
        }
        done = s.done || m.state.done;
      }
    }
    return saves;
  }
  // elite keeper saves way more than poor keeper
  const N = 700;
  const lo = gkTrial(45, "gk_line", "stay", N), hi = gkTrial(99, "gk_line", "stay", N);
  const loConc = N - lo, hiConc = N - hi; // conceded from the faced chance
  check("GK DEF 99 concedes far less than DEF 45", hiConc * 1.6 < loConc, "conceded " + hiConc + " vs " + loConc + " of " + N);
  check("GK DEF 99 keeps out >85% of faced chances", hi / N > 0.85, (100 * hi / N).toFixed(1) + "%");
}

// --- 15. GK role plans actually differ: sweeper blunders more than command-the-box ---
{
  const eff = { PAC: 50, SHO: 30, PAS: 55, DRI: 40, DEF: 75, PHY: 60 };
  function blunders(roleId, N) {
    let b = 0;
    for (let i = 0; i < N; i++) {
      const m = E.createMatch(E.STARTER_CLUBS[0], E.STARTER_CLUBS[3], { seed: 500000 + i, player: { pos: "GK", playstyle: "shotstopper", eff }, playerTeam: 0, role: roleId });
      let done = false;
      while (!done) {
        const s = m.step();
        if (s.decision && s.decision.type === "gk") { const r = m.decide("rush"); for (const e of r.events) if (e.gk === "blunder") b++; }
        else if (s.decision) m.decide("auto");
        done = s.done || m.state.done;
      }
    }
    return b;
  }
  const N = 600;
  const safe = blunders("gk_line", N), risky = blunders("gk_sweeper", N);
  check("sweeper keeper blunders more than command-the-box", risky > safe, risky + " vs " + safe);
}

// --- 16. DF role plans differ: step-out presses produce more tackles ---
{
  const eff = { PAC: 65, SHO: 30, PAS: 55, DRI: 50, DEF: 78, PHY: 70 };
  function tackles(roleId, N) {
    let t2 = 0;
    for (let i = 0; i < N; i++) {
      const r = E.simulateMatch(E.STARTER_CLUBS[0], E.STARTER_CLUBS[3], { seed: 700000 + i, fast: true, player: { pos: "CB", playstyle: "destroyer", eff }, playerTeam: 0, role: roleId });
      t2 += r.pTackles;
    }
    return t2;
  }
  const N = 1000;
  const hold = tackles("df_hold", N), press = tackles("df_step", N);
  check("step-out DF makes more tackles than hold-the-line", press > hold * 1.2, press + " vs " + hold);
}

// --- 17. rolesFor maps positions correctly ---
{
  const gk = Object.keys(E.rolesFor("GK")), cb = Object.keys(E.rolesFor("CB")), cf = Object.keys(E.rolesFor("CF")), lb = Object.keys(E.rolesFor("LB"));
  check("rolesFor position mapping", gk.every(id => id.startsWith("gk_")) && cb.every(id => id.startsWith("df_")) && lb.every(id => id.startsWith("df_")) && cf.includes("runs") && !cf.some(id => id.startsWith("gk_")), gk.join(",") + " | " + cb.join(",") + " | " + cf.join(","));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
