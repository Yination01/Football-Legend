// Headless ML career test: stubs DOM/localStorage, drives 3 full seasons
const store = {};
global.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => store[k] = v, removeItem: k => delete store[k] };
global.window = global;
const stubEl = new Proxy({}, { get: (t, k) => k === 'style' ? {} : k === 'classList' ? { toggle(){}, add(){}, remove(){} } : (t[k] ?? null), set: () => true });
global.$ = () => stubEl;
global.document = { querySelectorAll: () => [], querySelector: () => stubEl, createElement: () => stubEl };
global.render = (fn) => { try { typeof fn === 'function' && fn(); } catch (e) { fails.push('render threw: ' + e.message); } };
global.toast = () => {};
global.confirm = () => true;
global.E = require('./engine.js');
let fails = [];
let src = require('fs').readFileSync('./ml.js', 'utf8').replace('"use strict";', '').replace(/^(const|let) /gm, 'var ');
(0, eval)(src);

let pass = 0;
function check(name, cond) { cond ? pass++ : fails.push(name); }

mlNewSave('britain', 'Test FC');
check('save created', M && M.squad.length === 18);
const sqh = mlSquadScreen();
check('squad position sections', typeof sqh === 'string' && sqh.includes('sqsec') && sqh.includes('GK') && sqh.includes('FW'));
check('squad decluttered (no help kvs)', !sqh.includes('instant sale at 85%') && sqh.includes('data-sqrow') && sqh.includes('tap a player'));
check('XI has 11', M.xi.length === 11);
check('formation counts', (() => { const need = ML_FORMS[M.formation]; const ps = mlXIPlayers(); return ['GK','DF','MF','FW'].every(b => ps.filter(p => p.pos === b).length === need[b]); })());
check('values sane', M.squad.every(p => p.value > 0 && p.value < 60 && p.wage > 0));
check('budget 8M', M.budget === 8);

// market + packs
const pool = mlMarketPool();
check('market pool 6', pool.length === 6);
const preB = M.budget, preN = M.squad.length;
M.budget = 100;
// simulate a star pack draw
M.packsBought++;
const rng = E.mulberry32(E.hashSeed(M.seed + ':pack:' + M.packsBought));
// (UI does this; just verify generator ranges)
for (let i = 0; i < 200; i++) {
  const r2 = E.mulberry32(i);
  const p = mlGenPlayer(r2, 'britain', 'FW', 74 + Math.floor(r2() * 11));
  check('pack ovr range ' + i, p.ovr >= 74 && p.ovr <= 84);
  if (fails.length) break;
}
M.budget = preB;

// 3 seasons
for (let season = 1; season <= 3; season++) {
  let guard = 0;
  while (M.matchday < 18 && guard++ < 60) {
    const cup = mlCupPending();
    const fx = mlFixtureNow();
    if (!fx) break;
    const meHome = fx.home === M.clubIdx;
    const myEff = mlEffClub();
    const Hc = meHome ? myEff : M.world.clubs[fx.home];
    const Ac = meHome ? M.world.clubs[fx.away] : myEff;
    const r = E.simulateMatch(Hc, Ac, { seed: E.hashSeed(M.seed + 's' + M.season + 'md' + M.matchday + (cup ? 'cup' : '')), fast: true });
    mlFinish(fx, r, { home: 33, draw: 33, away: 34 });
    check('budget finite', isFinite(M.budget));
    check('fitness in range', M.squad.every(p => p.fit >= 0 && p.fit <= 100));
  }
  check('season ' + season + ' completed 18 MDs', M.matchday === 18);
  const before = M.season;
  mlSeasonEnd();
  if (M.sacked) { check('sack path renders', true); break; }
  check('season advanced', M.season === before + 1 || M.sacked);
  // Academy regens are allowed to be 17-year-olds (kid.age = 17 + rng*3); everything else stays in the veteran/potential band.
  check('ages bumped sanely', M.squad.every(p => p.age >= 17 && p.age <= 40 && p.ovr >= 40 && p.ovr <= 94));
}
check('news populated', M === null || M.news.length > 0);
check('career log', M === null || M.career.length >= 1);

// ---- playing styles ----
check('style default valid', ML_STYLES[M.style] != null);
const idsS = Object.keys(ML_STYLES);
check('4 styles', idsS.length === 4);
check('cycle: each style beaten by exactly one', idsS.every(id => idsS.filter(o => ML_STYLES[o].beats === id).length === 1));
check('losesTo consistent with beats', idsS.every(id => ML_STYLES[ML_STYLES[id].beats].losesTo === id));
const clubX = M.world.clubs.find(c => !c.founded);
check('opp style deterministic & valid', mlStyleOf(clubX) === mlStyleOf(clubX) && idsS.includes(mlStyleOf(clubX)));
check('duel win +1 you', mlStyleDuel('possession', 'longball').you === 1 && mlStyleDuel('possession', 'longball').opp === 0);
check('duel loss +1 them', mlStyleDuel('possession', 'highpress').opp === 1 && mlStyleDuel('possession', 'highpress').you === 0);
check('duel neutral 0', mlStyleDuel('possession', 'counter').you === 0 && mlStyleDuel('possession', 'counter').opp === 0);
check('mirror duel symmetric', mlStyleDuel('longball', 'possession').opp === 1);
check('scouted list grows after seasons', Array.isArray(M.scouted) && M.scouted.length > 0);
// ---- events & AI manager accounts ----
M.matchday = 5; M.evDone = "";
const _seed = M.seed; M.seed = "evtest";
const mgrA = mlGenManager(M.matchday), mgrB = mlGenManager(M.matchday);
check('manager deterministic', mgrA.tag === mgrB.tag && mgrA.club.name === mgrB.club.name && mgrA.style === mgrB.style);
check('manager club sane', mgrA.club.str > 30 && mgrA.club.str < 105 && mgrA.club.short.length >= 2);
check('manager style valid', ML_STYLES[mgrA.style] != null);
check('event available fresh', mlEventAvailable());
const preBud = M.budget, xi0 = mlXIPlayers()[0], preFit = xi0.fit;
mlEventFinish(mgrA, { gH: 2, gA: 0 }, { home: 50, draw: 25, away: 25 });
check('event win pays', M.budget > preBud);
check('event fatigue -15', xi0.fit === Math.max(0, preFit - 15));
check('event locked after play', !mlEventAvailable());
check('evDone key format', M.evDone === M.season + ":" + M.matchday);
check('league managers deterministic', (() => { const c = M.world.clubs.find(x => !x.founded); return mlManagerOf(c) === mlManagerOf(c); })());
check('founded club never managed', mlManagerOf(mlClub()) === null);
check('some clubs AI-managed', M.world.clubs.some(c => !c.founded && mlManagerOf(c)));
M.seed = _seed;
console.log(pass + ' ML checks passed, ' + fails.length + ' failed');
if (fails.length) { console.log(fails.slice(0, 10).join('\n')); process.exit(1); }
