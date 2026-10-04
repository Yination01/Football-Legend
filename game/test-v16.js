// v1.6 Wave 1 tests — #7 tactical counters, #8 PES form arrows, #10 season-2 rollover,
// #14 safe reload / native storage race. Headless: stubs DOM + localStorage like test-ml.js.
const store = {};
global.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => store[k] = v, removeItem: k => delete store[k] };
global.window = global;
const stubEl = new Proxy({}, { get: (t, k) => k === 'style' ? {} : k === 'classList' ? { toggle() {}, add() {}, remove() {} } : (t[k] ?? null), set: () => true });
global.$ = () => stubEl;
global.document = { querySelectorAll: () => [], querySelector: () => stubEl, createElement: () => stubEl };
let fails = [];
global.render = (fn) => { try { typeof fn === 'function' && fn(); } catch (e) { fails.push('render threw: ' + e.message); } };
global.toast = () => {};
global.confirm = () => true;
global.E = require('./engine.js');
let mlSrc = require('fs').readFileSync('./ml.js', 'utf8').replace('"use strict";', '').replace(/^(const|let) /gm, 'var ');
(0, eval)(mlSrc);

let pass = 0;
function check(name, cond) { cond ? pass++ : fails.push(name); }

/* ============================== #8 — PES 5-direction form arrows ============================== */
check('#8 five form directions', ML_FORM_DIRS.length === 5 && ML_FORM_DIRS.map(d => d.form).join(',') === '-2,-1,0,1,2');
check('#8 classic PES glyph set', ML_FORM_DIRS.map(d => d.glyph).join('') === '\u2b07\u2198\u27a1\u2197\u2b06');
check('#8 direction labels', ML_FORM_DIRS.map(d => d.label).join('/') === 'Terrible/Poor/Normal/Good/Excellent');
check('#8 out-of-range form clamps to an arrow', mlFormDir({ form: 99 }).glyph === '\u2b06' && mlFormDir({ form: -99 }).glyph === '\u2b07' && mlFormDir({}).glyph === '\u27a1');

mlNewSave('britain', 'Arrow FC');
{
  const p = M.squad[0];
  p.form = 2; const hi = effOvr(p), hiMarkup = mlFormArrow(p);
  p.form = 0; const mid = effOvr(p);
  p.form = -2; const lo = effOvr(p);
  check('#8 form is worth 1.5 OVR per arrow step', Math.abs((hi - mid) - 3) < 1e-9 && Math.abs((mid - lo) - 3) < 1e-9);
  check('#8 arrow markup is real engine condition', hiMarkup.includes('\u2b06') && hiMarkup.includes('formarrow'));
  const legend = mlFormLegend();
  check('#8 legend shows all five arrows', ['\u2b07', '\u2198', '\u27a1', '\u2197', '\u2b06'].every(g => legend.includes(g)));
  check('#8 squad screen carries the arrow + legend', (() => { const h = mlSquadScreen(); return h.includes('formarrow') && h.includes('PES condition'); })());

  // deterministic drift: same save + season + matchday => same arrows, every time
  M.season = 4; M.matchday = 7;
  const before = M.squad.map(p2 => p2.form);
  mlDriftForm(); const first = M.squad.map(p2 => p2.id + ':' + p2.form).join(',');
  M.squad.forEach((p2, i) => { p2.form = before[i]; });
  mlDriftForm(); const second = M.squad.map(p2 => p2.id + ':' + p2.form).join(',');
  check('#8 drift is deterministic per save/season/MD', first === second);
  M.matchday = 8; mlDriftForm();
  check('#8 drift stays inside the five arrows', M.squad.every(p2 => p2.form >= -2 && p2.form <= 2));
  check('#8 drift actually moves the squad', M.squad.some(p2 => p2.form !== 0));
  M.squad.forEach(p2 => { if (p2.cardId === 'legendary') check('#8 legendary form floor holds', p2.form >= 0); });
}

/* ============================== #7 — tactical counter system ============================== */
{
  const ids = Object.keys(ML_STYLES);
  check('#7 four playing styles', ids.length === 4);
  let total = true, antisym = true, ring = true;
  for (const a of ids) {
    let beats = 0, loses = 0;
    for (const b of ids) {
      const v = mlCounterDuel(a, b).v;
      if (![1, -1, 0].includes(v)) total = false;
      if (v !== -mlCounterDuel(b, a).v) antisym = false;
      if (a !== b) { if (ML_STYLES[a].beats === b) beats++; if (ML_STYLES[a].losesTo === b) loses++; }
    }
    if (beats !== 1 || loses !== 1) ring = false;
  }
  check('#7 every duel resolves (+1 / 0 / -1)', total);
  check('#7 matrix is antisymmetric', antisym);
  check('#7 rock-paper-scissors ring: each style beats one, loses to one', ring);
  check('#7 duel copy states the real bonus', mlCounterDuel('possession', 'longball').txt.includes('+1.0') && mlCounterDuel('longball', 'possession').txt.includes('+1.0'));

  let consistent = true;
  for (const a of ids) for (const b of ids) {
    const d = mlStyleDuel(a, b), m = mlCounterDuel(a, b);
    if ((d.you > 0) !== (m.v > 0)) consistent = false;
    if ((d.opp > 0) !== (m.v < 0)) consistent = false;
  }
  check('#7 matrix matches the numbers baked into the shown odds', consistent);

  const html = mlCounterMatrixHTML();
  check('#7 matrix renders all 16 cells', (html.match(/<td/g) || []).length === 16);
  check('#7 matrix highlights the current pick', html.includes('class="mine"') && html.includes('\u2605'));
  check('#7 tactics screen surfaces the matrix', (() => { const h = mlTacticsScreen(); return h.includes('cmatrix') && h.includes('Tactical Counter Matrix'); })());
}

/* ============================== #10 — season 2 transition / end-of-season pipeline ============================== */
function playSeason(fabricate) {
  let guard = 0;
  while (guard++ < 400) {
    const seasonOver = M.matchday >= 18;
    if (seasonOver && !mlCtFixture() && !mlCupPending()) break;
    const fx = mlFixtureNow();
    if (!fx) break;
    const meHome = fx.ct ? fx.ctHome : fx.home === M.clubIdx;
    mlFinish(fx, fabricate(meHome), { home: 40, draw: 30, away: 30 });
  }
}

mlNewSave('britain', 'Rollover FC');
{
  const anchor = E.leagueForRegion('britain');
  check('#10 fresh save: my world IS my galaxy league (one club array)', M.world.clubs === M.galaxy.leagues[M.leagueIdx].clubs && M.leagueIdx === anchor);

  playSeason(meHome => meHome ? { gH: 5, gA: 0 } : { gH: 0, gA: 5 }); // win everything -> promotion
  mlSeasonEnd();

  check('#10 season 1 rolls over into season 2', M.season === 2 && M.matchday === 0);
  check('#10 promotion is applied (Continental Super League)', M.tier === 1);
  check('#10 national-league anchor survives promotion', M.leagueIdx === anchor);
  check('#10 S2 owns a full 18-matchday fixture list', M.world.fixtures.length === 18);
  check('#10 S2 world is the Super League, not a clone of my old league', M.world.clubs !== M.galaxy.leagues[M.leagueIdx].clubs && M.world.clubs.every(c => c.str >= 68));
  check('#10 my old national slot is vacated (no ghost club)', !M.galaxy.leagues[M.leagueIdx].clubs.some(c => c.founded));
  check('#10 exactly one of my clubs exists in the world', M.world.clubs.filter(c => c.founded).length === 1 && !!M.world.clubs[M.clubIdx].founded);
  check('#10 season state fully reset (results, cup, reviews)', M.results.length === 0 && M.cup.alive === true && M.cup.done === false && M.season === 2);
  check('#10 career log + trophy cabinet updated', M.career.length === 1 && M.career[0].season === 1 && M.career[0].pos <= 2 && (M.trophies || []).some(t => t.s === 1));
  check('#10 season review built from real data', !!M.review && M.review.pos <= 2 && M.review.target === 'met' &&
    M.review.w >= 18 && M.review.gf >= 90 && M.review.cs >= 18 && M.review.prize > 0 && M.review.budget > 0);
  check('#10 review records the promotion', M.review.promoted === true && M.review.relegated === false);
  check('#10 continental subs rule', mlSubsAllowed({}) === 5);
  check('#10 review panel renders on the home screen', (() => { const due = M.campDue, wc = M.welcomeClaimed; M.campDue = false; M.welcomeClaimed = true; const h = mlHome(); M.campDue = due; M.welcomeClaimed = wc; return h.includes('mlrevclose') && h.includes('Board target') && h.includes('Season 1 Review'); })());

  // the national league must keep playing while I am away (the old bug left it frozen / desynced)
  const natBefore = M.galaxy.leagues[anchor].results.length;
  let lg = 0; // play until one *league* matchday is in the books (cup ties can come first)
  while (lg++ < 4) {
    const fx2 = mlFixtureNow();
    if (!fx2) break;
    const meHome2 = fx2.ct ? fx2.ctHome : fx2.home === M.clubIdx;
    mlFinish(fx2, meHome2 ? { gH: 2, gA: 1 } : { gH: 1, gA: 2 }, { home: 40, draw: 30, away: 30 });
    if (!fx2.ct && !fx2.cup) break;
  }
  check('#10 national league simulates on without me (tier 1)', M.galaxy.leagues[anchor].results.length >= natBefore + 5);
  check('#10 my S2 results stay in my own table', M.results.length === 5 && M.results.some(r => r.home === M.clubIdx || r.away === M.clubIdx));
  check('#10 national table has no ghost of my club', !M.galaxy.leagues[anchor].clubs.some(c => c.founded));

  // relegate: lose everything in the Super League, then roll over into season 3
  playSeason(meHome => meHome ? { gH: 0, gA: 4 } : { gH: 4, gA: 0 });
  mlSeasonEnd();
  check('#10 season 2 rolls into season 3', M.season === 3 && M.matchday === 0);
  check('#10 relegation returns me to the national league', M.tier === 0);
  check('#10 S3 world rebinds to the galaxy (identity restored)', M.world.clubs === M.galaxy.leagues[M.leagueIdx].clubs && M.world.fixtures === M.galaxy.leagues[M.leagueIdx].fixtures);
  check('#10 S3 fixtures are a fresh 18-matchday list', M.world.fixtures.length === 18 && M.results.length === 0);
  check('#10 galaxy never holds two copies of my club', M.galaxy.leagues.every(L => L.clubs.filter(c => c.founded).length <= 1) && !!M.world.clubs[M.clubIdx].founded);
  check('#10 awards baseline snapshotted for next season', M.squad.every(p => p.ovrStart === p.ovr));
}

/* ============================== #14 — safe reload / native storage race ============================== */
{
  check('#14 ML exposes a live-match probe', typeof ML.inMatch === 'function');
  M.mdLock = { key: 'x' };
  check('#14 kickoff lock reads as a live match', ML.inMatch() === true);
  M.mdLock = null;
  check('#14 finished match is not a live match', ML.inMatch() === false);

  const fsx = require('fs'), vm = require('vm');
  const appSrc = fsx.readFileSync('./app.js', 'utf8');
  const i0 = appSrc.indexOf('function flInMatch()');
  const i1 = appSrc.indexOf('window.flApplyCloudRestore');
  check('#14 reload guard exists in app.js', i0 > 0 && i1 > i0);
  const guardCode = appSrc.slice(i0, i1);
  check('#14 exactly one raw reload statement (inside the guard)', (appSrc.match(/location\.reload\(\);/g) || []).length === 1 && guardCode.includes('location.reload()'));
  check('#14 boot no longer reboots after a restore', !/if \(!S && localStorage\.getItem\(SAVE_KEY\)\) \{ location\.reload\(\); return; \}/.test(appSrc) && appSrc.includes('flRepaintAfterRestore'));

  const ctx = {
    localStorage: { _s: {}, getItem(k) { return this._s[k] ?? null; }, setItem(k, v) { this._s[k] = v; } },
    location: { n: 0, reload() { this.n++; } }, setTimeout(f) { f(); }, toast() {}, console
  };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext('var S = null; ' + guardCode + '; this.__t = { inMatch: () => flInMatch(), safe: (w) => flSafeReload(w), pending: () => flReloadPending };', ctx);
  const t = ctx.__t;
  t.safe('idle');
  check('#14 idle session reloads normally', ctx.location.n === 1);
  ctx.window.ML = { inMatch: () => true };
  const before = ctx.location.n;
  const ok = t.safe('mid-match');
  check('#14 live match defers the reload instead of firing it', ok === false && ctx.location.n === before && t.pending() === 'mid-match');
  vm.runInContext('S = { mdLock: { key: "bal" } }; window.ML = { inMatch: () => false };', ctx);
  check('#14 BaL kickoff lock also blocks a reload', t.inMatch() === true);
  vm.runInContext('S = { mdLock: null };', ctx);
  check('#14 clean session is reloadable', t.inMatch() === false);

  const cloudSrc = fsx.readFileSync('./cloud.js', 'utf8');
  const sites = cloudSrc.split('location.reload()').length - 1;
  let guarded = sites === 2, at = cloudSrc.indexOf('location.reload()');
  while (at >= 0) {
    if (cloudSrc.slice(Math.max(0, at - 300), at).indexOf('flApplyCloudRestore') < 0) guarded = false;
    at = cloudSrc.indexOf('location.reload()', at + 1);
  }
  check('#14 cloud restores swap in place (reload only as fallback)', guarded);
}

console.log('\n' + '-'.repeat(58));
console.log(pass + ' passed, ' + fails.length + ' failed');
if (fails.length) { fails.forEach(f => console.log('FAIL  ' + f)); process.exit(1); }
process.exit(0);
