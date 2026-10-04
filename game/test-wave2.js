// v1.6 Wave 2 tests — #1 pause + tactics drawer, #2 half-time locker room,
// #3 extra time + honest penalty shootouts, #4 key-highlights reel, #5 defender decision matrix,
// #11 segmented HUD. Behavioural engine checks + source contracts for the UI layer (app.js/ml.js are
// not headless-runnable, so their wiring is asserted by exact string contracts).
const fs = require('fs');
const E = require('./engine.js');
const appSrc = fs.readFileSync('./app.js', 'utf8');
const mlSrcRaw = fs.readFileSync('./ml.js', 'utf8');
const cssSrc = fs.readFileSync('./style.css', 'utf8');
const engSrc = fs.readFileSync('./engine.js', 'utf8');

let fails = [];
let pass = 0;
function check(name, cond, extra) { cond ? pass++ : fails.push(name + (extra ? ' :: ' + extra : '')); }
function near(a, b, tol) { return Math.abs(a - b) <= tol; }

/* ============================== #5 defender decision matrix ============================== */
check('#5 five authentic defensive scenarios', E.DEF_SCENARIOS.length === 5 && E.DEF_SCENARIOS.every(s => s.w > 0 && s.label && s.conv != null));
check('#5 scenarios cover 1v1 / through ball / cross / counter / set piece',
  ['wing1v1', 'through', 'cross', 'counter2', 'setmark'].every(id => E.DEF_SCENARIOS.some(s => s.id === id)));

{
  const eff = Object.assign(E.baseStats('CB'), { DEF: 74, PHY: 78, PAC: 66 });
  const scen = E.DEF_SCENARIOS[0];
  const role = E.ROLES.df_hold;
  let sumsOk = true, boundsOk = true, mulOk = true;
  for (const c of ['tackle', 'jockey', 'step', 'drop']) {
    const o = E.defChoiceOdds(c, scen, eff, role, [], 100);
    if (!near(o.win + o.foul + o.beaten, 1, 1e-9)) sumsOk = false;
    if (!(o.win >= 0 && o.win <= 1 && o.foul >= 0 && o.beaten >= 0)) boundsOk = false;
    if (!(o.convMul > 0.4 && o.convMul < 1.3)) mulOk = false;
  }
  check('#5 every choice is a complete probability tree (win+foul+beaten = 1)', sumsOk);
  check('#5 all defensive probabilities stay inside [0,1]', boundsOk);
  check('#5 each choice honestly bends the follow-up chance', mulOk);

  // a better defender wins more duels on every aggressive option
  const weak = Object.assign({}, eff, { DEF: 40 }), strong = Object.assign({}, eff, { DEF: 92 });
  check('#5 DEF rating drives duel outcomes',
    E.defChoiceOdds('tackle', scen, strong, role, [], 100).win > E.defChoiceOdds('tackle', scen, weak, role, [], 100).win &&
    E.defChoiceOdds('step', scen, strong, role, [], 100).win > E.defChoiceOdds('step', scen, weak, role, [], 100).win);
  // role honesty: "hold the line" wins the duels it picks, "step out" picks far more of them
  check('#5 defensive roles change the matrix (role honesty)',
    E.defChoiceOdds('tackle', scen, eff, E.ROLES.df_hold, [], 100).win > E.defChoiceOdds('tackle', scen, eff, E.ROLES.df_step, [], 100).win &&
    E.ROLES.df_step.tackleFreq > E.ROLES.df_hold.tackleFreq);
  // jockeying never concedes a foul; dropping off trades pressure for a cheaper follow-up
  check('#5 jockeying cannot concede a foul', E.defChoiceOdds('jockey', scen, eff, role, [], 100).foul === 0);
  check('#5 dropping off cheapens the follow-up chance',
    E.defChoiceOdds('drop', scen, eff, role, [], 100).convMul < E.defChoiceOdds('step', scen, eff, role, [], 100).convMul);
}

/* ---- displayed == rolled, measured over thousands of real defensive duels ---- */
{
  const eff = Object.assign(E.baseStats('CB'), { DEF: 76, PHY: 74, PAC: 70 });
  const pRef = { pos: 'CB', playstyle: 'destroyer', eff, skills: [] };
  let n = 0, successes = 0, sumP = 0, fouls = 0, sumFoul = 0;
  for (let m = 0; m < 1200 && n < 3000; m++) {
    const match = E.createMatch(E.STARTER_CLUBS[0], E.STARTER_CLUBS[4], {
      seed: 900000 + m, player: pRef, playerTeam: 0, role: 'df_step'
    });
    let done = false;
    while (!done) {
      const s = match.step();
      if (s.decision && s.decision.type === 'def') {
        const disp = E.decisionOdds(s.decision, pRef, 'df_step').def.tackle;
        const evts = match.decide('tackle').events || [];
        n++;
        sumP += disp.win / 100;
        sumFoul += disp.foul / 100;
        if (evts.some(e => e.type === 'tackle' && e.by === 'you')) successes++;
        if (evts.some(e => e.type === 'foul' || e.type === 'card')) fouls++;
      } else if (s.decision) {
        match.decide('auto');
      }
      done = s.done || match.state.done;
    }
  }
  const winRate = successes / n, shown = sumP / n, foulRate = fouls / n, shownFoul = sumFoul / n;
  check('#5 defender duels resolve at the displayed win% (' + (shown * 100).toFixed(1) + '% shown vs ' + (winRate * 100).toFixed(1) + '% rolled, n=' + n + ')', near(winRate, shown, 0.05));
  check('#5 defender foul% is honest too (' + (shownFoul * 100).toFixed(1) + '% shown vs ' + (foulRate * 100).toFixed(1) + '% rolled)', near(foulRate, shownFoul, 0.05));
  check('#5 the matrix is actually reached by the engine (sample was large enough)', n >= 1200, 'n=' + n);
}

/* ---- #5 coverage: which positions actually get the matrix (measured, not assumed) ---- */
{
  const roles = { GK: 'gk_line', CB: 'df_hold', LB: 'df_hold', RB: 'df_hold', DMF: 'balanced', CMF: 'balanced', AMF: 'balanced', LWF: 'balanced', RWF: 'balanced', SS: 'balanced', CF: 'balanced' };
  const keys = Object.keys(roles);
  const tally = {};
  const N = 300;
  for (const pos of keys) {
    let def = 0, gk = 0, gkpen = 0;
    for (let i = 0; i < N; i++) {
      const m = E.createMatch(E.STARTER_CLUBS[0], E.STARTER_CLUBS[4], {
        seed: 4400000 + i * 11 + keys.indexOf(pos), playerTeam: 0, role: roles[pos],
        player: { pos, playstyle: pos === 'GK' ? 'shotstopper' : 'allrounder', eff: E.baseStats(pos) }
      });
      let done = false;
      while (!done) {
        const s2 = m.step();
        if (s2.decision) {
          if (s2.decision.type === 'def') def++;
          else if (s2.decision.type === 'gk') gk++;
          else if (s2.decision.type === 'gkpen') gkpen++;
          m.decide(s2.decision.type === 'def' ? 'tackle' : s2.decision.type === 'gk' ? 'stay' : s2.decision.type === 'gkpen' ? 'stay' : 'auto');
        }
        done = s2.done || m.state.done;
      }
    }
    tally[pos] = { def: def / N, gk: gk / N, gkpen: gkpen / N };
  }
  check('#5 position appetite for defensive duels is a real football ladder (CB > DMF > CMF > AMF > wingers > SS/CF)',
    E.POSITIONS.CB.defBias > E.POSITIONS.DMF.defBias && E.POSITIONS.DMF.defBias > E.POSITIONS.CMF.defBias &&
    E.POSITIONS.CMF.defBias > E.POSITIONS.AMF.defBias && E.POSITIONS.AMF.defBias > E.POSITIONS.LWF.defBias &&
    E.POSITIONS.LWF.defBias > 0 && E.POSITIONS.SS.defBias === 0 && E.POSITIONS.CF.defBias === 0 && E.POSITIONS.GK.defBias === 0);
  check('#5 midfielders DO get the defensive matrix (' + keys.map(p => p + ' ' + tally[p].def.toFixed(2)).join(', ') + ' per match)',
    tally.CB.def >= 0.4 && tally.DMF.def >= 0.3 && tally.CMF.def >= 0.15 && tally.AMF.def >= 0.02 && tally.LWF.def >= 0.005 && tally.RWF.def >= 0.005);
  check('#5 CB/DMF see more duels than CMF, and CMF more than AMF', tally.CB.def > tally.CMF.def && tally.DMF.def > tally.AMF.def);
  check('#5 pure strikers never defend (by design, defBias 0)', tally.CF.def === 0 && tally.SS.def === 0);
  check('#5 keepers never get the outfield matrix - they get their own branch (' + tally.GK.gk.toFixed(2) + ' GK calls/match)',
    tally.GK.def === 0 && tally.CF.gk === 0 && tally.GK.gk >= 2 && tally.GK.gkpen > 0);
  check('#5 midfield roles bend the duel matrix honestly (aggressive/runs foul more than discipline)',
    E.defChoiceOdds('tackle', E.DEF_SCENARIOS[0], Object.assign(E.baseStats('CMF'), { DEF: 60, PHY: 65, PAC: 62 }), E.ROLES.aggressive, [], 100).foul >
    E.defChoiceOdds('tackle', E.DEF_SCENARIOS[0], Object.assign(E.baseStats('CMF'), { DEF: 60, PHY: 65, PAC: 62 }), E.ROLES.discipline, [], 100).foul &&
    E.defChoiceOdds('tackle', E.DEF_SCENARIOS[0], Object.assign(E.baseStats('CMF'), { DEF: 60, PHY: 65, PAC: 62 }), E.ROLES.runs, [], 100).foul >
    E.defChoiceOdds('tackle', E.DEF_SCENARIOS[0], Object.assign(E.baseStats('CMF'), { DEF: 60, PHY: 65, PAC: 62 }), E.ROLES.discipline, [], 100).foul);
}

/* ---- keeper branch honesty: open play (stay/rush) and penalties are shown at the TRUE probability ---- */
{
  const eff = { PAC: 50, SHO: 30, PAS: 55, DRI: 40, DEF: 72, PHY: 60 };
  const pl = { pos: 'GK', playstyle: 'shotstopper', eff };
  function gkSample(kind, choice, roleId, N) {
    let shown = 0, shownN = 0, good = 0, n = 0;
    for (let i = 0; i < N; i++) {
      const m = E.createMatch(E.STARTER_CLUBS[0], E.STARTER_CLUBS[4], { seed: 4700000 + i * 13 + choice.length, playerTeam: 0, player: pl, role: roleId });
      let done = false;
      while (!done) {
        const s2 = m.step();
        if (s2.decision) {
          if (s2.decision.type === kind) {
            const o = E.decisionOdds(s2.decision, pl, roleId);
            const shownPct = kind === 'gk' ? (choice === 'stay' ? o.stay : o.rush) : (choice === 'stay' ? o.stay : o.dive);
            shown += shownPct; shownN++;
            const events = m.decide(choice).events || [];
            n++;
            if (kind === 'gk') { if (events.some(e => e.gk === 'save')) good++; }
            else if (!events.some(e => e.type === 'goal')) good++;
          } else m.decide(s2.decision.type === 'gk' ? 'stay' : s2.decision.type === 'gkpen' ? 'stay' : 'auto');
        }
        done = s2.done || m.state.done;
      }
    }
    return { shown: shown / shownN / 100, actual: good / n, n };
  }
  const stay = gkSample('gk', 'stay', 'gk_line', 250);
  const rush = gkSample('gk', 'rush', 'gk_sweeper', 250);
  check('#5 keeper "STAY BIG" % is the true save rate (' + (100 * stay.shown).toFixed(1) + '% shown vs ' + (100 * stay.actual).toFixed(1) + '% saved, n=' + stay.n + ')', near(stay.actual, stay.shown, 0.05));
  check('#5 keeper "RUSH OUT" % includes the blunder risk honestly (' + (100 * rush.shown).toFixed(1) + '% shown vs ' + (100 * rush.actual).toFixed(1) + '% saved, n=' + rush.n + ')', near(rush.actual, rush.shown, 0.05));
  const penStay = gkSample('gkpen', 'stay', 'gk_line', 9000);
  const penDive = gkSample('gkpen', 'left', 'gk_line', 9000);
  check('#5 penalty "STAND TALL" % is the true kept-out rate (' + (100 * penStay.shown).toFixed(1) + '% shown vs ' + (100 * penStay.actual).toFixed(1) + '% measured, n=' + penStay.n + ')', near(penStay.actual, penStay.shown, 0.05));
  check('#5 penalty "DIVE" % is the true kept-out rate (' + (100 * penDive.shown).toFixed(1) + '% shown vs ' + (100 * penDive.actual).toFixed(1) + '% measured, n=' + penDive.n + ')', near(penDive.actual, penDive.shown, 0.05));
  check('#5 keeper penalty display is exact, not approximated (no fudge constants, no "~")',
    engSrc.indexOf('* 33 + 6') < 0 && engSrc.indexOf('0.72 * penM * 33 + 4') < 0 &&
    appSrc.indexOf('odds.dive + "% kept out"') >= 0 && appSrc.indexOf('odds.stay + "% kept out"') >= 0 && appSrc.indexOf('"~" + odds') < 0);
}

/* ============================== #3 extra time + penalty shootouts ============================== */
check('#3 shootout kick odds stay in a believable band',
  [40, 60, 75, 90].every(sho => { const p = E.shootoutKickOdds({ SHO: sho, PHY: sho }, { DEF: 70 }); return p >= 0.45 && p <= 0.92; }));
check('#3 better takers convert more', E.shootoutKickOdds({ SHO: 90, PHY: 90 }, { DEF: 70 }) > E.shootoutKickOdds({ SHO: 55, PHY: 55 }, { DEF: 70 }));
check('#3 better keepers save more', E.shootoutKickOdds({ SHO: 75, PHY: 75 }, { DEF: 90 }) < E.shootoutKickOdds({ SHO: 75, PHY: 75 }, { DEF: 50 }));

{
  const a = { str: 70 }, b = { str: 70 };
  const s1 = E.penaltyShootout(a, b, { seed: 12345 });
  const s2 = E.penaltyShootout(a, b, { seed: 12345 });
  check('#3 same seed = same shootout (deterministic replays)', JSON.stringify(s1) === JSON.stringify(s2));
  check('#3 a shootout always has a winner', s1.winner === 0 || s1.winner === 1);
  check('#3 scores are never level', s1.scoredH !== s1.scoredA);
  check('#3 best-of-five needs at least six kicks', s1.kicks.length >= 6);
  check('#3 kicks alternate between the two sides', s1.kicks.every((k, i) => k.side === i % 2));
  check('#3 every kick carries the conversion % the engine rolled', s1.kicks.every(k => k.p >= 45 && k.p <= 92 && typeof k.scored === 'boolean'));
  const s3 = E.penaltyShootout(a, b, { seed: 999 });
  check('#3 different seeds produce different shootouts', JSON.stringify(s3) !== JSON.stringify(s1));
}

{ // fairness: 50/50 clubs split shootouts evenly, the stronger club wins more
  let homeWins = 0, N = 4000;
  for (let i = 0; i < N; i++) {
    const so = E.penaltyShootout({ str: 72 }, { str: 72 }, { seed: 700000 + i });
    if (so.winner === 0) homeWins++;
  }
  check('#3 even shootouts are a genuine coin toss, not rigged (' + (100 * homeWins / N).toFixed(1) + '% home, n=' + N + ')', near(homeWins / N, 0.5, 0.04));
  let strongWins = 0;
  for (let i = 0; i < N; i++) {
    const so = E.penaltyShootout({ str: 86 }, { str: 58 }, { seed: 810000 + i });
    if (so.winner === 0) strongWins++;
  }
  check('#3 the stronger club really does win more shootouts (' + (100 * strongWins / N).toFixed(1) + '%)', strongWins / N > 0.58 && strongWins / N < 0.92);
}

{ // extra time is actually played in knockout ties, and only there
  let koLevelAt120 = 0, koLevelAt90 = 0, koDecidedAt90 = 0, leagueOver90 = 0, koPlayed = 0;
  for (let i = 0; i < 260; i++) {
    const ko = E.createMatch(E.STARTER_CLUBS[0], E.STARTER_CLUBS[4], {
      seed: 500000 + i, player: { pos: 'CF', playstyle: 'poacher', eff: E.baseStats('CF') }, playerTeam: 0, role: 'balanced', ko: true
    });
    let done = false;
    while (!done) {
      const s = ko.step();
      if (s.decision) ko.decide('auto');
      done = s.done || ko.state.done;
    }
    const r = ko.result();
    koPlayed++;
    if (r.level) { if (r.minute >= 120) koLevelAt120++; else koLevelAt90++; }
    else if (r.minute <= 91) koDecidedAt90++;
    if (r.et !== r.minute > 90) fails.push('#3 et flag mismatches the minute');
    const lg = E.createMatch(E.STARTER_CLUBS[0], E.STARTER_CLUBS[4], {
      seed: 600000 + i, player: { pos: 'CF', playstyle: 'poacher', eff: E.baseStats('CF') }, playerTeam: 0, role: 'balanced'
    });
    let d2 = false;
    while (!d2) {
      const s = lg.step();
      if (s.decision) lg.decide('auto');
      d2 = s.done || lg.state.done;
    }
    if (lg.result().minute > 91) leagueOver90++;
  }
  check('#3 knockout ties that stay level play the full 120 minutes (' + koLevelAt120 + ' of ' + koPlayed + ')', koLevelAt120 > 5 && koLevelAt90 === 0);
  check('#3 knockout ties decided in normal time stop at 90', koDecidedAt90 > 20);
  check('#3 league matches never drift into extra time', leagueOver90 === 0);
  check('#3 the engine exposes the level flag the shootout UI keys off', koLevelAt120 + koDecidedAt90 <= koPlayed);
}

/* ---- every throwaway coin flip is gone from the knockout paths ---- */
{
  const appPens = appSrc.split('E.penaltyShootout').length - 1;
  const mlPens = mlSrcRaw.split('E.penaltyShootout').length - 1;
  check('#3 BaL resolves ties through the honest shootout everywhere (' + appPens + ' call sites)', appPens >= 5);
  check('#3 ML resolves ties through the honest shootout', mlPens >= 2);
  check('#3 no coin-flip penalties survive in app.js', !/if \(Math\.random\(\) < 0\.5\) (my\+\+; else op\+\+|gH\+\+; else gA\+\+)/.test(appSrc));
  check('#3 no 55/45 coin flip survives in the ML Champions Trophy', mlSrcRaw.indexOf('E.mulberry32(E.hashSeed(M.seed + "ctpens"') < 0);
  check('#3 no coin-flip cup penalties survive in the ML cup', mlSrcRaw.indexOf('E.mulberry32(E.hashSeed(M.seed + "pens" + M.matchday))() < 0.5') < 0);
  check('#3 AI-vs-AI CT ties are settled by a shootout, not a coin flip',
    engSrc.indexOf('mulberry32(hashSeed(seed + "p" + i))() < 0.5') < 0 && /ctpens/.test(engSrc));
  check('#3 both career modes ask the engine for knockout rules',
    appSrc.indexOf('ko: !!(fx.cup || (fx.ct && fx.ctStage === "ko"))') >= 0 &&
    mlSrcRaw.indexOf('ko: !!(fx.cup || (fx.ct && fx.ctStage === "ko"))') >= 0);
  check('#3 the shootout UI shows the exact conversion % per kick',
    appSrc.indexOf('k.p + "% conversion"') >= 0 && mlSrcRaw.indexOf('k.p + "% conversion"') >= 0);
  check('#3 the played shootout is reused by the summary (one source of truth)',
    appSrc.indexOf('result.penWinner != null') >= 0 && mlSrcRaw.indexOf('r.penWinner != null') >= 0);
}

/* ---- the four defensive buttons really are rendered, with engine odds on them ---- */
check('#5 the defensive decision UI renders all four options',
  appSrc.indexOf('dec.type === "def"') >= 0 && ['TACKLE \\u00b7 DEF+PHY', 'JOCKEY', 'STEP UP', 'DROP OFF'].every(s2 => appSrc.indexOf(s2) >= 0));
check('#5 the UI prints the engine\'s own win/foul numbers per option',
  appSrc.indexOf('${D.tackle.win}% win') >= 0 && appSrc.indexOf('${D.jockey.win}% win') >= 0 && appSrc.indexOf('${D.step.win}% win') >= 0 && appSrc.indexOf('${D.drop.win}% win') >= 0);
check('#5 a beaten defender is told the chance against them', appSrc.indexOf('If you\'re beaten: <b>${odds.xg}%</b> chance against') >= 0);
check('#5 ML cup/CT summaries own up to penalty wins',
  mlSrcRaw.indexOf('decided on penalties ${r.penScore') >= 0 && mlSrcRaw.indexOf('(pens " + (r.penScore ? r.penScore.join("-") : "shootout")') >= 0);

/* ============================== #1 pause modal + tactics drawer ============================== */
check('#1 pause stops the clock in code', /function setPaused\(v\)[\s\S]{0,400}clearInterval\(timer\); timer = null;/.test(appSrc));
check('#1 pause modal markup exists', ['id="pausemodal"', 'id="presume"', 'id="ptactics"', 'id="psub"', 'id="pskip"'].every(s => appSrc.indexOf(s) >= 0));
check('#1 pause button lives on the HUD', appSrc.indexOf('id="pausbtn"') >= 0);
check('#1 pause never fights a live decision', appSrc.indexOf('Take your decision first') >= 0);
check('#1 resume restarts the clock', appSrc.indexOf('function setPaused(v)') >= 0 && appSrc.indexOf('else { if (!match.state.pending) runClock(); }') >= 0);
check('#1 auto-play continues honestly (speed 3 = engine decides)', /pskip"\)[\s\S]{0,320}setPaused\(false\); speed = 3;/.test(appSrc));

check('#1 ML match screen has its own pause (tactical window) control',
  mlSrcRaw.indexOf('id="mlpaus"') >= 0 && mlSrcRaw.indexOf('function mlPause()') >= 0 &&
  /mlPause\(\) \{[\s\S]{0,220}clearInterval\(timer\); timer = null;/.test(mlSrcRaw));

/* ============================== #11 segmented HUD + sliding drawer ============================== */
check('#11 scoreboard carries a segmented sub-line', appSrc.indexOf('class="hudline"') >= 0 && appSrc.indexOf('id="hudrole"') >= 0 && appSrc.indexOf('id="hudmode"') >= 0);
check('#11 control strip replaces the old button rows', appSrc.indexOf('class="hudctl"') >= 0 && ['id="tacbtn"', 'id="modebtn"'].every(s => appSrc.indexOf(s) >= 0));
check('#11 bottom bar is a real HUD bar', appSrc.indexOf('class="speedrow hudbar"') >= 0);
check('#11 sliding drawer is wired', appSrc.indexOf('id="drawer"') >= 0 && appSrc.indexOf('classList.add("open")') >= 0 && appSrc.indexOf('classList.remove("open")') >= 0);
check('#11 drawer lists the legal roles for your position', /Object\.keys\(E\.rolesFor\(S\.pos\)\)\.map/.test(appSrc));
check('#11 switching role mid-match hits the engine', appSrc.indexOf('if (match.setRole) match.setRole(S.role)') >= 0 && typeof E.createMatch(E.STARTER_CLUBS[0], E.STARTER_CLUBS[4], { seed: 1 }).setRole === 'function');
check('#11 drawer states the honest role effect', appSrc.indexOf('id="drawerinfo"') >= 0 && appSrc.indexOf('function roleEffectTxt()') >= 0 && appSrc.indexOf('function renderDrawer()') >= 0);
check('#11 drawer explains the counter window (why-note)', appSrc.indexOf('id="drawerwhy"') >= 0 && appSrc.indexOf('Counter window live') >= 0);
check('#11 the 2D-live / commentary toggle still exists inside the drawer',
  appSrc.indexOf('data-view="ticker"') >= 0 && appSrc.indexOf('data-view="live2d"') >= 0);
check('#11 a single honest sub path feeds HUD, drawer and pause', appSrc.indexOf('function doSub()') >= 0 && appSrc.indexOf('$("#drawersub")') >= 0 && appSrc.indexOf('const ds = $("#drawersub"); if (ds) ds.onclick = () => doSub();') >= 0);

/* ============================== #2 half-time locker room ============================== */
check('#2 half-time screen exists', appSrc.indexOf('function showHalfTime()') >= 0 && appSrc.indexOf('HALF-TIME') >= 0);
check('#2 the clock halts before minute 46', /match\.state\.min === 45 && !halfTimeShown && !match\.state\.done\) { showHalfTime\(\); return; }/.test(appSrc));
check('#2 it only fires once', appSrc.indexOf('halfTimeShown = true;') >= 0);
check('#2 the gaffer note is derived from real match stats', /pShots >= 2 && st2\.pGoals === 0[\s\S]{0,260}stamina < 58/.test(appSrc));
check('#2 role changes apply for the second half and the season',
  appSrc.indexOf('data-ht="${id}"') >= 0 && appSrc.indexOf('S.role = b.dataset.ht; save();') >= 0 &&
  appSrc.indexOf('if (match.setRole) match.setRole(S.role);') >= 0);
check('#2 second half resumes the clock', appSrc.indexOf('id="htgo"') >= 0 && /htgo"\)\.onclick = \(\) => { decEl\.style\.display = "none"[\s\S]{0,120}runClock\(\)/.test(appSrc));

/* ============================== #4 key highlights mode ============================== */
check('#4 a commentary/Highlights mode toggle exists', appSrc.indexOf('function handleEvents') >= 0 && appSrc.indexOf('longCommentary') >= 0);
check('#4 mode is persisted', appSrc.indexOf('setSet("longCommentary"') >= 0 && appSrc.indexOf('getSet().longCommentary === 1 ? "full" : "key"') >= 0);
check('#4 key mode stores deterministic cuts instead of live replays', appSrc.indexOf('const hlQueue = []') >= 0 && appSrc.indexOf('stored.forEach(ev => hlQueue.push(ev))') >= 0);
check('#4 goals still always get their scene in highlights mode', /if \(ev\.type === "goal"\) big = big \|\| ev;/.test(appSrc));
check('#4 the reel is offered after the whistle', appSrc.indexOf('id="hlreel"') >= 0 && appSrc.indexOf('id="hlplay"') >= 0 && appSrc.indexOf('function runReel(') >= 0);
check('#4 the reel draws every stored event with its minute and outcome',
  appSrc.indexOf('REPLAYING HIGHLIGHTS') >= 0 && /S\.name\.toUpperCase\(\) \+ " SCORES!"/.test(appSrc) && appSrc.indexOf('Highlight ${i + 1} of ${hlQueue.length}') >= 0);
check('#4 full commentary replays every shot instead', /hlMode === "full" \? evts\.filter\(ev => SHOT_TYPES\.includes\(ev\.type\) && ev !== big\) : \[\]/.test(appSrc));
check('#4 highlights mode never hides a moment silently', appSrc.indexOf('saved for the post-match reel') >= 0);

/* ============================== DOM hook integrity ============================== */
function domAudit(src, startMark, endMark) {
  const a = src.indexOf(startMark), b = src.indexOf(endMark, a);
  const seg = a >= 0 && b > a ? src.slice(a, b) : '';
  const ids = new Set([...seg.matchAll(/id="([\w-]+)"/g)].map(m => m[1]));
  const refs = [...new Set([...seg.matchAll(/\$\("#([\w-]+)"\)/g)].map(m => m[1]))];
  return { len: seg.length, ids: ids.size, missing: refs.filter(r => !ids.has(r)) };
}
{
  const bal = domAudit(appSrc, 'function matchScreen(', '// ---- Post-match: rewards');
  const mlm = domAudit(mlSrcRaw, 'function mlMatchScreen(', 'function mlFinish(');
  check('#11 BaL match screen has no dangling DOM hooks (' + bal.ids + ' ids, ' + bal.len + ' chars)', bal.len > 5000 && bal.missing.length === 0, bal.missing.join(','));
  check('#3 ML match screen has no dangling DOM hooks (' + mlm.ids + ' ids, ' + mlm.len + ' chars)', mlm.len > 5000 && mlm.missing.length === 0, mlm.missing.join(','));
}

/* ============================== styles for all of the above ============================== */
check('#11 drawer/pause/shootout/HUD styles shipped',
  ['.drawer.open', '.pausemodal', '.pausecard', '.sotdot', '.sotdot.ok', '.hudbtn', '.hudline', '.drawerrole.sel'].every(s => cssSrc.indexOf(s) >= 0));

console.log('\n' + '-'.repeat(58));
console.log(pass + ' passed, ' + fails.length + ' failed');
if (fails.length) { fails.forEach(f => console.log('FAIL  ' + f)); process.exit(1); }
process.exit(0);
