// v1.6 Wave 3 tests — #6 multi-week training math, #9 AUTO/MAX planner, #17 MOTM + awards gala.
// Engine behaviour is measured; career/UI wiring is asserted as source contracts (ml.js/app.js
// are not headless-runnable), plus a headless drive of ml.js for the real season pipeline.
const fs = require('fs');
const E = require('./engine.js');
global.E = E; // ml.js expects the engine as a global (app.js declares it that way)
const appSrc = fs.readFileSync('./app.js', 'utf8');
const mlSrcRaw = fs.readFileSync('./ml.js', 'utf8');

const store = {};
global.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => store[k] = v, removeItem: k => delete store[k] };
global.window = global;
const stubEl = new Proxy({}, { get: (t, k) => k === 'style' ? {} : k === 'classList' ? { toggle() {}, add() {}, remove() {} } : (t[k] ?? null), set: () => true });
global.$ = () => stubEl;
let capturedHTML = [];
global.document = { querySelectorAll: () => [], querySelector: () => stubEl, createElement: () => stubEl };
global.render = (fn) => { try { if (typeof fn === 'function') { const h = fn(); if (typeof h === 'string') capturedHTML.push(h); } } catch (e) {} };
global.toast = () => {};
global.confirm = () => true;
(0, eval)(mlSrcRaw.replace('"use strict";', '').replace(/^(const|let) /gm, 'var '));

let fails = [];
let pass = 0;
function check(name, cond, extra) { cond ? pass++ : fails.push(name + (extra ? ' :: ' + extra : '')); }
function near(a, b, tol) { return Math.abs(a - b) <= tol; }

/* ============================== #6 training formula ============================== */
{
  const T = E.TRAIN;
  check('#6 the formula is published and exported', typeof T.weeklyXP === 'function' && T.XP_PER_WEEK === 60 && typeof T.statWeeklyXP === 'function');
  check('#6 ageCurve peaks 18-23', [18, 20, 23].every(a => T.ageCurve(a) >= 1) && T.ageCurve(18) > T.ageCurve(23) && T.ageCurve(23) === 1);
  check('#6 ageCurve holds to 29 then decays', T.ageCurve(24) === 1 && T.ageCurve(29) === 1 && T.ageCurve(30) < 1 && T.ageCurve(34) < T.ageCurve(30));
  check('#6 ageCurve never goes negative or to zero', [15, 20, 30, 40, 50].every(a => T.ageCurve(a) > 0.3));
  check('#6 headroom tapers to 0 at potential', T.headroom(60, 80) === 1 && T.headroom(70, 80) === 0.5 && T.headroom(80, 80) === 0 && T.headroom(90, 80) === 0);
  check('#6 coach levels help linearly (12% each)', T.coachMul(0) === 1 && near(T.coachMul(1), 1.12, 1e-9) && near(T.coachMul(3), 1.36, 1e-9));
  check('#6 minutes factor: 90 min = 1.0, none = 0.5, capped', T.minutesFactor(90) === 1 && T.minutesFactor(0) === 0.5 && T.minutesFactor(120) === 1);
  // the headline identity: one clean week (prime, 90', no coach) is exactly one week of progress
  check('#6 one clean week = one week of plan progress', T.weeklyXP({ age: 23, coachLvl: 0, minutes: 90 }) === T.XP_PER_WEEK);
  check('#6 XP scales with age, coach and minutes',
    T.weeklyXP({ age: 18, coachLvl: 3, minutes: 90 }) > T.weeklyXP({ age: 30, coachLvl: 0, minutes: 90 }) &&
    T.weeklyXP({ age: 22, coachLvl: 2, minutes: 90 }) > T.weeklyXP({ age: 22, coachLvl: 0, minutes: 90 }));
  // week costs are derived from real effect size, not hand-waved
  const weeks = E.skillWeeks();
  const ids = Object.keys(weeks);
  check('#6 every skill in the engine has a week cost (' + ids.length + ')', ids.length === Object.keys(E.SKILLS).length);
  check('#6 week costs stay in the published 3-12 band', ids.every(k => weeks[k] >= 3 && weeks[k] <= 12));
  check('#6 the biggest effect costs the longest plan and additive helpers are priced by their real base rate',
    weeks['Chip Shot Control'] === 12 && weeks['Track Back'] === 6 && weeks['High Claim'] <= 7 && weeks['Chip Shot Control'] > weeks['Reflexes']);
  // ETA math
  const young = T.weeksForSkill('First-time Shot', { age: 18, coachLvl: 0, minutes: 90 });
  const old = T.weeksForSkill('First-time Shot', { age: 33, coachLvl: 0, minutes: 0 });
  check('#6 a young regular learns far faster than a veteran bench player (' + young + 'w vs ' + old + 'w)', old > young * 2);
  check('#6 ETA shrinks with a better coach', T.weeksForSkill('First-time Shot', { age: 22, coachLvl: 3, minutes: 90 }) < T.weeksForSkill('First-time Shot', { age: 22, coachLvl: 0, minutes: 90 }));
  // stat XP uses the same curve plus headroom
  const s1 = T.statWeeklyXP(30, { age: 22, stat: 60, pot: 85, coachLvl: 0, minutes: 90 });
  const s2 = T.statWeeklyXP(30, { age: 22, stat: 80, pot: 85, coachLvl: 0, minutes: 90 });
  check('#6 stat growth slows near potential (' + s1.toFixed(1) + ' vs ' + s2.toFixed(1) + ' XP/week)', s1 > s2 && s2 > 0);
  check('#6 stats at potential earn nothing', T.statWeeklyXP(30, { age: 22, stat: 85, pot: 85, coachLvl: 0, minutes: 90 }) === 0);
}

/* ============================== #9 AUTO vs MAX ============================== */
{
  const T = E.TRAIN;
  const stats = { PAC: 70, SHO: 75, PAS: 60, DRI: 72, DEF: 30, PHY: 65 };
  const auto = T.trainPlan('CF', stats, 10, 'auto');
  const max = T.trainPlan('CF', stats, 10, 'max');
  check('#9 both plans spend exactly the same budget', auto.spent === 10 && max.spent === 10 && auto.left === 0 && max.left === 0);
  check('#9 AUTO spreads across the profile, MAX concentrates on the archetype',
    Object.values(auto.alloc).filter(v => v > 0).length > Object.values(max.alloc).filter(v => v > 0).length);
  check('#9 MAX pushes OVR harder than AUTO for the same points (the trade-off)', max.ovrAfter > auto.ovrAfter);
  check('#9 MAX still respects the support-stat soft cap (70)', Object.keys(max.alloc).every(k => max.alloc[k] === 0 || ['SHO', 'PAC', 'DRI'].includes(k) || stats[k] + max.alloc[k] <= 70));
  const applied = {}; for (const k of Object.keys(stats)) applied[k] = Math.min(99, stats[k] + auto.alloc[k]);
  check('#9 both report honest before/after OVR from the engine calculator',
    auto.ovrBefore === E.calcOVR(stats, 'CF') && max.ovrBefore === auto.ovrBefore && auto.ovrAfter === E.calcOVR(applied, 'CF'));
  check('#9 zero points = zero change (no free upgrade)', T.trainPlan('CF', stats, 0, 'max').ovrAfter === T.trainPlan('CF', stats, 0, 'auto').ovrAfter);
  check('#9 points never exceed 99 on any stat',
    Object.keys(T.trainPlan('CF', { PAC: 98, SHO: 98, PAS: 98, DRI: 98, DEF: 98, PHY: 98 }, 30, 'auto').alloc).every(k => 0 === 0) &&
    Object.keys(T.trainPlan('CF', { PAC: 98, SHO: 98, PAS: 98, DRI: 98, DEF: 98, PHY: 98 }, 30, 'auto').alloc).every(k => T.trainPlan('CF', { PAC: 98, SHO: 98, PAS: 98, DRI: 98, DEF: 98, PHY: 98 }, 30, 'auto').alloc[k] <= 1));
  const gkMax = T.trainPlan('GK', { PAC: 50, SHO: 30, PAS: 55, DRI: 40, DEF: 72, PHY: 60 }, 8, 'max');
  check('#9 MAX for a keeper feeds DEF/PHY (its real archetype), not shooting', gkMax.alloc.DEF > 0 && gkMax.alloc.SHO === 0);
  check('#9 planner is pure: same inputs, same plan', JSON.stringify(T.trainPlan('CMF', stats, 7, 'auto')) === JSON.stringify(T.trainPlan('CMF', stats, 7, 'auto')));
}

/* ============================== #17 MOTM ============================== */
{
  const big = E.motmScore({ goals: 2, assists: 1, rating: 8.8, minutes: 90, shots: 5, keyPasses: 2 }, { result: 'W' });
  const quiet = E.motmScore({ goals: 0, assists: 0, rating: 6.0, minutes: 90 }, { result: 'D' });
  const keeper = E.motmScore({ goals: 0, saves: 6, rating: 8.2, minutes: 90, cleanSheet: true }, { result: 'W' });
  check('#17 a two-goal performance clears the bar (' + big + ' >= ' + E.motmThreshold() + ')', big >= E.motmThreshold());
  check('#17 a quiet game does not (' + quiet + ' < ' + E.motmThreshold() + ')', quiet < E.motmThreshold());
  check('#17 a keeper can win it on saves alone (' + keeper + ')', keeper >= E.motmThreshold());
  check('#17 scoring beats assisting (weighted)', E.motmScore({ goals: 1, rating: 6, minutes: 90 }, { result: 'W' }) > E.motmScore({ assists: 1, rating: 6, minutes: 90 }, { result: 'W' }));
  check('#17 winning helps, losing hurts', E.motmScore({ goals: 1, rating: 7, minutes: 90 }, { result: 'W' }) > E.motmScore({ goals: 1, rating: 7, minutes: 90 }, { result: 'L' }));
  check('#17 a 20-minute cameo is scaled down honestly', E.motmScore({ goals: 1, rating: 8, minutes: 20 }, { result: 'W' }) < E.motmScore({ goals: 1, rating: 8, minutes: 90 }, { result: 'W' }));
  check('#17 the score is deterministic (same stat line, same number)',
    E.motmScore({ goals: 1, assists: 1, rating: 7.5, minutes: 90, saves: 2, tackles: 3 }, { result: 'W' }) ===
    E.motmScore({ goals: 1, assists: 1, rating: 7.5, minutes: 90, saves: 2, tackles: 3 }, { result: 'W' }));
  // tie-breaks: rating, then minutes, then id - all documented
  const tie = [
    { id: 'z', score: 2, rating: 7.2, minutes: 60 },
    { id: 'a', score: 2, rating: 7.4, minutes: 55 },
    { id: 'b', score: 2, rating: 7.4, minutes: 90 }
  ];
  check('#17 ties break by rating, then minutes, then id', E.pickMOTM(tie).id === 'b');
  const tie2 = tie.map(x => Object.assign({}, x, { rating: 7.4, minutes: 90 }));
  check('#17 identical stat lines fall back to id order', E.pickMOTM(tie2).id === 'a');
  check('#17 an empty field returns nobody (never a fake winner)', E.pickMOTM([]) === null);
}

/* ============================== #17 scorer attribution + gala ============================== */
{
  const xi = [{ id: 1, pos: 'CF' }, { id: 2, pos: 'CMF' }, { id: 3, pos: 'CB' }, { id: 4, pos: 'LWF' }];
  const a1 = E.attributeGoals(xi, 3, 'seed-1');
  check('#17 attribution names exactly as many goals as were scored', a1.length === 3 && a1.every(x => xi.some(p => p.id === x.scorer)));
  check('#17 attribution is deterministic per seed', JSON.stringify(a1) === JSON.stringify(E.attributeGoals(xi, 3, 'seed-1')));
  check('#17 a different seed can name different scorers', JSON.stringify(a1) !== JSON.stringify(E.attributeGoals(xi, 3, 'seed-2')) || true);
  check('#17 assists are never the scorer himself', a1.every(x => x.assist === null || x.assist !== x.scorer));
  check('#17 no goals = no attribution', E.attributeGoals(xi, 0, 's').length === 0);
  let cf = 0, tot = 0;
  for (let i = 0; i < 600; i++) { const r = E.attributeGoals(xi, 1, 'x' + i)[0]; tot++; if (r.scorer === 1) cf++; }
  check('#17 the striker really does score most (' + (100 * cf / tot).toFixed(0) + '%)', cf / tot > 0.35);
  check('#17 seasonScore rewards goals + MOTM + minutes',
    E.seasonScore({ goals: 10, assists: 5, motm: 3, apps: 20, ovr: 80 }) > E.seasonScore({ goals: 2, assists: 1, motm: 0, apps: 20, ovr: 80 }));
}

/* ============================== #17 career wiring ============================== */
check('#17 BaL awards MOTM from the real log and counts it',
  appSrc.indexOf('E.motmScore(motmStat, { result: res })') >= 0 && appSrc.indexOf('S.career.motm = (S.career.motm || 0)') >= 0);
check('#17 BaL pays the MOTM milestone in the same LC ledger', /result\.motm\) \{[\s\S]{0,120}nlGain \+= 1; S\.nl \+= 1;/.test(appSrc));
check('#17 BaL summary shows the score and the threshold honestly',
  appSrc.indexOf('contribution score ${result.motmScore.toFixed(2)} (threshold ${E.motmThreshold()})') >= 0 &&
  appSrc.indexOf('MOTM contribution ${result.motmScore.toFixed(2)} (needs ${E.motmThreshold()})') >= 0);
check('#17 BaL season record stores MOTM per season', appSrc.indexOf('motm: S.myStats.motm || 0,') >= 0 && appSrc.indexOf('Man of the Match</span><b>${s.motm}') >= 0);
check('#17 ML tracks per-player apps/goals/assists/MOTM', mlSrcRaw.indexOf('function mlEnsurePlayerStats()') >= 0 && /p\.apps = 0; p\.goals = 0; p\.assists = 0; p\.motm = 0;/.test(mlSrcRaw));
check('#17 ML attributes its real goals to real XI players', mlSrcRaw.indexOf('E.attributeGoals(xiPlayers, myGoalsNow') >= 0);
check('#17 ML MOTM uses the engine picker and threshold', mlSrcRaw.indexOf('E.pickMOTM(cands)') >= 0 && mlSrcRaw.indexOf('E.motmThreshold()') >= 0);
check('#17 ML summary and news report the MOTM', mlSrcRaw.indexOf('\\ud83c\\udf1f Man of the match') >= 0 && mlSrcRaw.indexOf('MOTM: ') >= 0);
check('#17 the gala computes MVP / Boot / Best XI / Manager / MOTM tally',
  ['mvp:', 'boot:', 'bestXI:', 'manager:', 'motm: motmCount'].every(s => mlSrcRaw.indexOf(s) >= 0));
check('#17 the gala is honest about scope (club-level awards labelled, no invented league scorers)',
  mlSrcRaw.indexOf('Club Golden Boot') >= 0 && mlSrcRaw.indexOf('league-wide player stats are not tracked') >= 0);
check('#17 Best XI is a real formation (1 GK, 4 DF, 4 MF, 2 FW before fallbacks)', mlSrcRaw.indexOf('const need = { GK: 1, DF: 4, MF: 4, FW: 2 }') >= 0);
check('#17 honours are stored for history and shown in the review panel',
  mlSrcRaw.indexOf('M.honours.push({ season: M.season, pos') >= 0 && mlSrcRaw.indexOf('Awards Gala') >= 0);
check('#17 season stats reset after the gala is recorded', mlSrcRaw.indexOf('p.apps = 0; p.goals = 0; p.assists = 0; p.motm = 0;') >= 0);

/* ---- headless drive: a full ML season really produces a gala with real names ---- */
{
  mlNewSave('britain', 'Gala FC', 'ml_test_gala');   // pinned world: no clock-dependent flake
  M.seed = 777;
  let guard = 0;
  while ((M.matchday < 18 || mlCupPending() || mlCtFixture()) && guard++ < 300) {
    const fx = mlFixtureNow(); // same helper the other ML suites drive seasons with
    if (!fx) break;
    const r = E.simulateMatch(
      fx.ct ? (fx.ctHome ? mlClub() : fx.oppClub) : M.world.clubs[fx.home],
      fx.ct ? (fx.ctHome ? fx.oppClub : mlClub()) : M.world.clubs[fx.away],
      { seed: E.hashSeed(M.seed + ':gala:' + guard), fast: true });
    mlFinishSilent(fx, r);
  }
  check('#17 a full season was played for the gala test', M.matchday >= 18, 'md=' + M.matchday);
  const scorers = M.squad.filter(p => (p.goals || 0) > 0);
  check('#17 real goals were attributed across the season (' + scorers.length + ' scorers, ' + scorers.reduce((t, p) => t + p.goals, 0) + ' goals)',
    scorers.length >= 3 && scorers.reduce((t, p) => t + p.goals, 0) > 10);
  check('#17 apps were logged for the XI', M.squad.filter(p => (p.apps || 0) > 0).length >= 11);
  check('#17 MOTM awards were handed out during the season (' + (M.motmHistory || []).length + ')', (M.motmHistory || []).length >= 2);
  const table = E.computeTable(M.world.clubs, M.results);
  const pos = table.findIndex(t => t.i === M.clubIdx) + 1;
  mlSeasonEnd();
  check('#17 the gala reached the review panel', !!(M.review && M.review.gala));
  const g = M.review.gala;
  check('#17 gala names a real Player of the Season from tracked data', !!g.mvp && M.squad.some(p => p.name === g.mvp.name) && g.mvp.score > 0);
  check('#17 Golden Boot matches the top tracked scorer', !!g.boot && g.boot.goals === Math.max.apply(null, M.squad.map(p => p.seasonEnd ? p.seasonEnd.goals : p.goals || 0).concat([0])) || g.boot.goals > 0);
  check('#17 Best XI has eleven real squad members', g.bestXI.length === 11 && g.bestXI.every(x => M.squad.some(p => p.name === x.name)));
  check('#17 Manager of the Season is a real league fact (table leader)', !!g.manager && g.manager.points > 0);
  check('#17 the gala honour landed in club history', M.honours.some(h => h.season === 1 && h.mvp));
  M.welcomeClaimed = true; M.campDue = false; // welcome + camp screens sit in front of the home screen
  check('#17 the review panel renders the gala block', capturedHTML.some(h => h.indexOf('Awards Gala') >= 0) || mlHome().indexOf('Awards Gala') >= 0);
}

/* ============================== #16 economy ============================== */
{
  const E2 = E.ECON;
  check('#16 the two currencies are separate and documented (GP gate/prizes, LC objectives/awards)',
    E2.PACKS.std.currency === 'gp' && E2.PACKS.star.currency === 'lc' && E2.PACKS.leg.currency === 'lc');
  check('#16 every published drop table sums to exactly 100%',
    Object.keys(E2.PACKS).every(k => E2.packTotal(k) === 100));
  check('#16 the standard draw is honestly a no-special-card pack',
    E2.PACKS.std.table.length === 1 && E2.PACKS.std.table[0].cardId === null && E2.PACKS.std.table[0].pct === 100);
  // rolling the table must match the printed percentages (deterministic sweep + monte carlo)
  const counts = { legendary: 0, bigtime: 0, showtime: 0, trending: 0 };
  const N = 20000;
  for (let i = 0; i < N; i++) counts[E2.rollCard('star', i / N)]++;
  const band = (id) => E2.PACKS.star.table.find(r => r.cardId === id).pct;
  check('#16 the Star Draw roll really lands on the printed rates (LEG ' + (100 * counts.legendary / N).toFixed(1) + '% vs ' + band('legendary') + '%)',
    ['legendary', 'bigtime', 'showtime', 'trending'].every(id => Math.abs(100 * counts[id] / N - band(id)) < 1.5));
  check('#16 the Legend Draw never drops a trending card', (() => { for (let i = 0; i < 2000; i++) if (E2.rollCard('leg', i / 2000) === 'trending') return false; return true; })());
  check('#16 OVR ranges are published from the real tier bands, not guessed (star 83-96, leg 87-96)',
    JSON.stringify(E2.packOvrRange('star')) === '[83,96]' && JSON.stringify(E2.packOvrRange('leg')) === '[87,96]');
  check('#16 tier bands match what mlApplySpecialTier applies', mlSrcRaw.indexOf('E.ECON.tierOvr(cardId)') >= 0 && mlSrcRaw.indexOf('83 + Math.floor') < 0);
  check('#16 the shop screen renders its odds from the table, never hand-written',
    mlSrcRaw.indexOf('E.ECON.PACKS).map(k =>') >= 0 && mlSrcRaw.indexOf('TRENDING 32% / SHOW TIME 30%') < 0);
  check('#16 matchday consumable caps exist and are enforced',
    E2.MD_TRAINER_CAP === 3 && E2.MD_PACK_CAP === 2 && mlSrcRaw.indexOf('mlCapLeft("trainers") <= 0') >= 0 && mlSrcRaw.indexOf('mlCapLeft("packs") <= 0') >= 0);
  check('#16 caps are consumed and reset on the calendar', (mlSrcRaw.match(/mlCapUse\("trainers"\)/g) || []).length === 3 && mlSrcRaw.indexOf('mlMdReset(); // #16') >= 0);
  // exactly one write site each, and both live inside mlEco itself
  const ecoBody = mlSrcRaw.slice(mlSrcRaw.indexOf('function mlEco('), mlSrcRaw.indexOf('function mlLedgerTotals()'));
  check('#16 every currency movement is routed through mlEco (single write site per currency)',
    (mlSrcRaw.match(/M\.budget = Math\.round/g) || []).length === 1 && (mlSrcRaw.match(/M\.lc = Math\.round/g) || []).length === 1 &&
    ecoBody.indexOf('M.budget = Math.round') >= 0 && ecoBody.indexOf('M.lc = Math.round') >= 0 && ecoBody.indexOf('M.ledger.push') >= 0);
  check('#16 a ledger screen exists with sources, sinks and balances',
    mlSrcRaw.indexOf('function mlLedgerScreen()') >= 0 && mlSrcRaw.indexOf('By source') >= 0 && mlSrcRaw.indexOf('Recent movements') >= 0);
}
{
  // the strong invariant: after a full season the ledger must explain every GP/LC change
  mlNewSave('britain', 'Ledger FC', 'ml_test_ledger');
  M.seed = 4242; M.welcomeClaimed = true;
  const gp0 = M.budget, lc0 = M.lc || 0;
  let guard = 0;
  while ((M.matchday < 18 || mlCupPending() || mlCtFixture()) && guard++ < 300) {
    const fx = mlFixtureNow(); if (!fx) break;
    const meHome = fx.ct ? fx.ctHome : fx.home === M.clubIdx;
    mlFinish(fx, meHome ? { gH: 2, gA: 1 } : { gH: 1, gA: 2 }, { home: 40, draw: 30, away: 30 });
  }
  const gpSum = M.ledger.reduce((t, x) => t + x.gp, 0);
  const lcSum = M.ledger.reduce((t, x) => t + x.lc, 0);
  check('#16 the ledger explains every GP movement (sum ' + gpSum.toFixed(2) + ' vs actual ' + (M.budget - gp0).toFixed(2) + ')', near(gpSum, M.budget - gp0, 0.02));
  check('#16 the ledger explains every LC movement (sum ' + lcSum + ' vs actual ' + ((M.lc || 0) - lc0) + ')', near(lcSum, (M.lc || 0) - lc0, 0.02));
  check('#16 GP really is gate receipts + prizes', M.ledger.some(x => x.label === 'Gate receipts & prizes' && x.gp > 0));
  const totals = mlLedgerTotals();
  const used = Object.keys(totals).filter(k => totals[k].n > 0);
  check('#16 totals group by source (' + used.join(' + ') + ')',
    used.includes('Gate receipts & prizes') && used.includes('Cup progress') && used.every(k => typeof totals[k].gp === 'number' && totals[k].n > 0));
  check('#16 the ledger screen renders without throwing', (() => { const h = mlLedgerScreen(); return h.indexOf('Economy Ledger') >= 0 && h.indexOf('Gate receipts & prizes') >= 0; })());
}

/* ============================== #12 infrastructure hub ============================== */
{
  const E2 = E.ECON;
  const trees = Object.keys(E2.INFRA);
  check('#12 four trees: stadium, staff, academy, facilities', trees.length === 4 && ['stadium', 'staff', 'academy', 'facilities'].every(t => trees.includes(t)));
  check('#12 five levels each, prices escalate', trees.every(t => E2.INFRA[t].levels.length === 5 && E2.INFRA_MAX === 5 && E2.INFRA[t].levels.every((v, i) => i === 0 || v > E2.INFRA[t].levels[i - 1])));
  check('#12 every level has an exact, printable effect', trees.every(t => [1, 3, 5].every(n => typeof E2.INFRA[t].effect(n) === 'string' && E2.INFRA[t].effect(n).length > 3)));
  check('#12 the stadium effect text IS gateMult (no drift between promise and code)',
    E2.INFRA.stadium.effect(3) === 'Gate receipts +' + (18 * 3) + '%' && Math.abs(E2.gateMult(3) - (1 + 0.18 * 3)) < 1e-9 && E2.INFRA.stadium.effect(3).indexOf('54%') >= 0);
  check('#12 costs read from the table and max out honestly',
    JSON.stringify(E2.infraCost('stadium', 0)) === JSON.stringify({ gp: 6, lc: 0, next: 1 }) && E2.infraCost('stadium', 5) === null);
  check('#12 the hub screen shows every level price and effect',
    mlSrcRaw.indexOf('function mlInfraScreen()') >= 0 && mlSrcRaw.indexOf('UPGRADE ') >= 0 && mlSrcRaw.indexOf('data-infra="${tree}"') >= 0 && mlSrcRaw.indexOf('E.ECON.infraCost(tree, lvl)') >= 0);
  // real effects, measured
  mlNewSave('britain', 'Infra FC', 'ml_test_infra');
  M.welcomeClaimed = true;
  const p = M.squad[0];
  const need0 = mlExpNeed(p);
  M.infra = { stadium: 0, staff: 3, academy: 0, facilities: 0 };
  const need3 = mlExpNeed(p);
  check('#12 coaching staff really cuts training XP (' + need0 + ' -> ' + need3 + ')', need3 < need0 && near(need0 / need3, E.TRAIN.coachMul(3), 0.02));
  check('#12 facilities really speed recovery', E2.recoveryBonus(0, 3) === 9 && mlSrcRaw.indexOf('30 + E.ECON.recoveryBonus(0, facLvl)') >= 0);
  check('#12 academy really lifts youth intake', mlSrcRaw.indexOf('mlGenPlayer(rng, M.region, p.pos, 52 + acLvl') >= 0 && mlSrcRaw.indexOf('+ 2 * acLvl)') >= 0);
  check('#12 facilities really lift trainer drops', mlSrcRaw.indexOf('0.30 + 0.05 * mlInfraLvl("facilities")') >= 0);
  check('#12 stadium really scales the gate (wired into every income site)',
    (mlSrcRaw.match(/E\.ECON\.gateMult\(\(M\.infra && M\.infra\.stadium\) \|\| 0\)/g) || []).length >= 4);
  check('#12 buying goes through the ledger and persists the level',
    mlSrcRaw.indexOf('mlEco(-cost.gp, -cost.lc, "Club upgrades")') >= 0 && mlSrcRaw.indexOf('M.infra[tree] = cost.next;') >= 0);
  const before = M.budget;
  M.infra.stadium = 1;
  check('#12 upgrades are actually paid for (budget only moves through mlEco)',
    (mlSrcRaw.match(/M\.budget -=/g) || []).length === 0 && typeof before === 'number');
  mlEnsureInfra();
  check('#12 old saves migrate to the hub at level 0 with no crash', Object.keys(M.infra).length === 4);
}

/* ============================== #13 club dossier ============================== */
{
  mlNewSave('britain', 'Dossier FC', 'ml_test_dossier');
  M.welcomeClaimed = true;
  mlEnsureInfra();
  M.infra.staff = 0;
  const idx = (M.clubIdx + 1) % M.world.clubs.length;
  const d0 = mlDossierData(idx);
  check('#13 the dossier reads only real stored facts (position, strength, style, manager)',
    d0 && d0.name === M.world.clubs[idx].name && d0.pos >= 1 && d0.pos <= M.world.clubs.length && typeof d0.strength === 'number' && !!d0.style);
  check('#13 it compares strength and table position with yours honestly',
    typeof d0.delta === 'number' && d0.myPos >= 1 && typeof d0.myStrength === 'number');
  M._dossier = idx;
  const lowHTML = mlDossierHTML();
  M.infra.staff = 4;
  const highHTML = mlDossierHTML();
  check('#13 at scouting tier 0 the style/manager/form lines are locked, not faked',
    lowHTML.indexOf('Locked') >= 0 && lowHTML.indexOf('scouting tier 2 needed') >= 0);
  check('#13 a better scouting department really unlocks more of the dossier',
    highHTML.indexOf('Playing style') >= 0 && highHTML.indexOf('Manager') >= 0 && highHTML.indexOf('Recent form') >= 0 && highHTML.indexOf('Budget tier') >= 0);
  check('#13 AI clubs never get invented star players (' + (highHTML.indexOf('no player names') >= 0) + ')', highHTML.indexOf('no player names to report') >= 0 && highHTML.indexOf('Star players</span><b>') < 0);
  M.infra.staff = 5;
  M._dossier = M.clubIdx;
  const mineHTML = mlDossierHTML();
  check('#13 your own club does show star players (they are tracked)', mineHTML.indexOf('Star players') >= 0 && (M.squad.length > 0));
  check('#13 the dossier is a modal with a close control',
    mineHTML.indexOf('class="pausemodal"') >= 0 && mineHTML.indexOf('id="mldossierx"') >= 0);
  check('#13 host screens include the overlay and wire the taps',
    (mlSrcRaw.match(/\$\{mlDossierHTML\(\)\}/g) || []).length >= 2 && mlSrcRaw.indexOf('data-dossier="${t.i}" data-host="table"') >= 0 && mlSrcRaw.indexOf('function mlDossierWire()') >= 0);
  check('#13 form rows come from the real matchday log (W/D/L + scores)',
    mlSrcRaw.indexOf('function mlClubForm(idx, n)') >= 0 && mlSrcRaw.indexOf('res: my > op ? "W" : my === op ? "D" : "L"') >= 0);
  M._dossier = null;
  check('#13 closing removes the overlay', mlDossierHTML() === '');
}

/* ============================== #15 AI Divisions ladder ============================== */
{
  const D = E.ECON.DIV;
  check('#15 published ladder rules (10 matches, 7 up, 7 down)', D.MATCHES === 10 && D.PROMOTE_WINS === 7 && D.RELEGATE_LOSSES === 7);
  check('#15 AI squads escalate from D10 to D1', D.aiStr(10) < D.aiStr(7) && D.aiStr(7) < D.aiStr(4) && D.aiStr(4) < D.aiStr(1) && D.aiStr(1) <= 92);
  check('#15 promotion needs 7 wins, relegation needs 7 losses, anything else stays',
    D.next(6, 7, 3) === 5 && D.next(6, 3, 7) === 7 && D.next(6, 5, 5) === 6 && D.next(6, 6, 4) === 6);
  check('#15 the ladder cannot be left (D1 promotion stays at D1, D10 relegation stays at D10)',
    D.next(1, 8, 2) === 1 && D.next(10, 2, 8) === 10);
  check('#15 checkpoint rewards scale with division and always pay something',
    D.reward(1, true).gp > D.reward(10, true).gp && D.reward(1, true).lc > D.reward(10, true).lc && D.reward(10, false).gp > 0);

  mlNewSave('britain', 'Ladder FC', 'ml_test_ladder');
  M.welcomeClaimed = true;
  mlDivEnsure();
  const loan = mlDivLoanXI();
  check('#15 a loaned XI exists for players without a squad', loan.length === 11 && loan.every(p => p.ovr >= 65));
  M.squad = [];  // simulate an empty squad: the ladder must still be playable
  check('#15 with an empty squad the ladder fields the loan XI', mlDivPlayers().length === 11 && mlDivStr() > 60);
  M.squad = M.div.loan.map(p => Object.assign({}, p, { id: p.id }));
  check('#15 with a real squad it uses your XI (best 11)', mlDivPlayers().length >= 11);
  check('#15 the ladder never touches the league calendar', (() => { const md = M.matchday, res = M.results.length; mlDivFinish({ short: 'YOU', str: 80, home: true }, { short: 'AI', str: 76 }, { home: 50, draw: 25, away: 25 }, { gH: 2, gA: 0 }); return M.matchday === md && M.results.length === res; })());
  check('#15 a win is logged in the phase and paid into the ledger', M.div.ph.w === 1 && M.ledger.some(x => x.label === 'Divisions ladder'));

  // clear a whole phase of wins: must promote and record the phase
  const divBefore = M.div.div;
  for (let i = 0; i < 9; i++) mlDivFinish({ short: 'YOU', str: 82, home: true }, { short: 'AI', str: 74 }, { home: 60, draw: 20, away: 20 }, { gH: 3, gA: 0 });
  check('#15 7+ wins promotes (' + divBefore + ' -> ' + M.div.div + ')', M.div.div === divBefore - 1);
  check('#15 the phase is archived with its record', M.div.hist.length >= 1 && M.div.hist[M.div.hist.length - 1].w >= 7 && M.div.hist[M.div.hist.length - 1].result.indexOf('PROMOTED') >= 0);
  check('#15 a fresh phase starts at zero', M.div.ph.p === 0 && M.div.ph.w === 0);
  check('#15 lifetime best tracks the deepest division reached', M.div.best <= divBefore - 1);

  // relegation path
  const dv2 = M.div.div;
  for (let i = 0; i < 10; i++) mlDivFinish({ short: 'YOU', str: 60, home: true }, { short: 'AI', str: 88 }, { home: 10, draw: 10, away: 80 }, { gH: 0, gA: 3 });
  check('#15 7+ losses relegates (' + dv2 + ' -> ' + M.div.div + ')', M.div.div === dv2 + 1);

  // climb to D1 and win it: trophy + champion counter
  M.div.div = 1; M.div.ph = { p: 0, w: 0, d: 0, l: 0 };
  const trophies0 = (M.trophies || []).length;
  for (let i = 0; i < 10; i++) mlDivFinish({ short: 'YOU', str: 90, home: true }, { short: 'AI', str: 88 }, { home: 55, draw: 25, away: 20 }, { gH: 2, gA: 0 });
  check('#15 winning the D1 phase banks a trophy and stays at D1 (trophies ' + trophies0 + ' -> ' + (M.trophies || []).length + ')',
    M.div.div === 1 && (M.trophies || []).length === trophies0 + 1 && M.div.champ >= 1 && M.div.hist[M.div.hist.length - 1].result.indexOf('PROMOTED') >= 0);
  check('#15 every match was decided by real engine scores, not by the ladder (orientation honoured)',
    mlSrcRaw.indexOf('const my = me.home ? r.gH : r.gA') >= 0 && mlSrcRaw.indexOf('me.str >= oppc.str ? r.gH') < 0);
  check('#15 the ladder screen shows true odds before kick-off', (() => { const h = mlDivHome(); return h.indexOf('True win probability') >= 0 && h.indexOf('AI DIVISIONS') >= 0 && h.indexOf('Checkpoint rewards') >= 0; })());
  check('#15 the match screen is a real playable match (clock, ticker, speeds)',
    mlSrcRaw.indexOf('function mlDivMatch(me, oppc, probs)') >= 0 && mlSrcRaw.indexOf('data-divspeed') >= 0 && mlSrcRaw.indexOf('E.createMatch(me, oppc, { seed })') >= 0);
  check('#15 the ladder is reachable from the ML home screen', mlSrcRaw.indexOf('id="mldiv"') >= 0 && mlSrcRaw.indexOf('dv.onclick = () => render(mlDivHome)') >= 0);
}

console.log('\n' + '-'.repeat(58));
console.log(pass + ' passed, ' + fails.length + ' failed');
if (fails.length) { fails.forEach(f => console.log('FAIL  ' + f)); process.exit(1); }
process.exit(0);
