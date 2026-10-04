// v1.6 Wave 4 tests — #18 Supabase RLS fix + auto-sync on match finish.
// Two halves:
//   1. SQL contracts: the RLS/privilege rules are asserted against the shipped .sql files
//      (there is no database in CI and the project runs on $0, so contracts are the gate).
//   2. Client behaviour: cloud.js is evaluated headlessly against a virtual clock, a fake
//      Supabase session and a scriptable fetch, so debounce / queue / backoff / retry are
//      measured, not assumed.
const fs = require('fs');

let pass = 0;
const fails = [];
function check(name, cond) { cond ? pass++ : fails.push(name); }
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const cloudSrc = fs.readFileSync('./cloud.js', 'utf8');
const appSrc = fs.readFileSync('./app.js', 'utf8');
const mlSrc = fs.readFileSync('./ml.js', 'utf8');
const schemaSql = fs.readFileSync('./supabase/schema.sql', 'utf8');
const boardSql = fs.readFileSync('./supabase/leaderboard.sql', 'utf8');
const fixSql = fs.existsSync('./supabase/wave4-rls-fix.sql') ? fs.readFileSync('./supabase/wave4-rls-fix.sql', 'utf8') : '';
const setupMd = fs.readFileSync('./supabase/SETUP.md', 'utf8');
const stripSql = sql => sql.split('\n').filter(l => l.trim().indexOf('--') !== 0).join('\n'); // comments quote the old bugs
const schemaCode = stripSql(schemaSql), boardCode = stripSql(boardSql), fixCode = stripSql(fixSql);

/* ============================ 1. SQL / server contracts ============================ */
{
  check('#18 the RLS fix ships as its own idempotent migration', fixSql.length > 500 && (fixSql.match(/drop policy if exists/g) || []).length >= 1 &&
    fixSql.indexOf('safer to re-run') > -1 || fixSql.indexOf('Idempotent') > -1);

  // the recursive policy was the production bug: it must be gone from both files
  check('#18 the self-referencing policy expression is gone (it recursed with 42P17)',
    schemaCode.indexOf('banned = (select banned from profiles') < 0 && fixCode.indexOf('banned = (select banned from profiles') < 0 &&
    /create policy p_profiles_own_u on profiles for update[\s\S]{0,160}fl_is_banned\(auth\.uid\(\)\) = false/.test(schemaCode));
  check('#18 profiles reads ban state through a SECURITY DEFINER helper instead',
    /create or replace function fl_is_banned\(p_uid uuid\)[\s\S]{0,220}security definer set search_path = public/.test(schemaSql) &&
    /drop policy if exists p_profiles_own_u on profiles;[\s\S]{0,200}create policy p_profiles_own_u on profiles for update[\s\S]{0,200}fl_is_banned\(auth\.uid\(\)\) = false/.test(fixSql));
  check('#18 the migration documents why (the real error, not a vague "RLS fix")', /42P17|infinite recursion/.test(fixSql));

  // select-only for anon, at the privilege level
  const revokeAll = /revoke insert, update, delete, truncate, references, trigger on all tables in schema public from anon, authenticated;/;
  check('#18 anon/authenticated lose write privileges on every public table', revokeAll.test(fixSql) && revokeAll.test(schemaSql));
  check('#18 future tables inherit the same rule (default privileges)',
    /alter default privileges in schema public revoke insert, update, delete, truncate, references, trigger on tables from anon, authenticated;/.test(fixSql));
  check('#18 anon is granted SELECT only where the game reads public data',
    /grant select on public\.events,\s+public\.broadcasts, public\.seasons, public\.season_ranks to anon, authenticated;/.test(fixSql) &&
    fixSql.indexOf('grant insert') < 0);
  check('#18 saves/profiles/inbox are readable by signed-in owners only (RLS filters the rows)',
    /grant select on public\.profiles,\s+public\.saves,\s+public\.inbox  to authenticated;/.test(fixSql));
  check('#18 internal counters are not callable by players',
    /revoke execute on function bump_stat\(text\) from anon, authenticated;/.test(fixSql));
  check('#18 writes stay inside the validated edge functions (stated where a reader will look)',
    /owner READ ONLY \(writes go through the sync-save edge function, which validates\)/.test(schemaSql) &&
    /writes go through the[\s\S]{0,80}sync-save`? edge function's service-role client/.test(fixSql));

  // saves: select policy only, ever
  const savePolicies = (schemaSql.match(/create policy p_saves\w* on saves for (\w+)/g) || []);
  check('#18 `saves` has a SELECT policy and nothing else', savePolicies.length === 1 && /for select/.test(savePolicies[0]));
  check('#18 the migration tells the owner how to verify (two queries, both empty on success)',
    fixSql.indexOf("'anon' = any(roles) and cmd <> 'SELECT'") > 0 && fixSql.indexOf("table_name = 'saves' and grantee in ('anon','authenticated')") > 0);

  // leaderboards: server-computed, banned excluded, no raw save leakage
  check('#18 all three public boards are SECURITY DEFINER (server-computed, RLS-independent)',
    (boardSql.match(/language sql stable security definer set search_path = public/g) || []).length === 3);
  check('#18 every board excludes banned players (3 boards + 2 season-reward guards)',
    (boardCode.match(/not p\.banned/g) || []).length === 5 &&
    (boardCode.match(/where s\.(bal|ml)_save is not null and not p\.banned/g) || []).length === 3);
  check('#18 boards read only validated cloud saves (saves join profiles, never client input)',
    (boardSql.match(/from saves s join profiles p/g) || []).length === 3 && boardSql.indexOf('jsonb_array_length(s.ml_save') > 0);
  const ghostReturn = boardSql.slice(boardSql.indexOf('create or replace function leaderboard_ghosts'), boardSql.indexOf('with base as'));
  check('#18 the ghost board returns strength + tactics only, never squad JSON',
    ghostReturn.indexOf('ml_save') < 0 && /str numeric/.test(ghostReturn) && /formation text/.test(ghostReturn));
  check('#18 anon may execute only the four read-only boards',
    (boardCode.match(/to anon, authenticated;/g) || []).length === 4 &&
    /grant execute on function leaderboard_bal\(int\) to anon, authenticated;/.test(boardCode) &&
    /grant execute on function leaderboard_ghosts\(int\) to anon, authenticated;/.test(boardCode) &&
    /grant execute on function season_close\(text, text\) to authenticated;/.test(boardCode));
  check('#18 the owner setup lists the new step', setupMd.indexOf('wave4-rls-fix.sql') > 0 && /both must return zero rows|both must return zero rows/i.test(setupMd));
}

/* ============================ 2. client auto-sync harness ============================ */
const realSetImmediate = setImmediate;
let clock = Date.UTC(2026, 9, 4, 12, 0, 0);
let timers = [];
let tseq = 1;

async function settle(n) { for (let i = 0; i < (n || 8); i++) await new Promise(r => realSetImmediate(r)); }
async function advance(ms) {
  const target = clock + ms;
  for (;;) {
    let best = null;
    for (const t of timers) if (t.at <= target && (!best || t.at < best.at)) best = t;
    if (!best) break;
    timers = timers.filter(t => t !== best);
    clock = Math.max(clock, best.at);
    try { best.fn(); } catch (e) {}
    await settle(4);
  }
  clock = target;
  await settle(4);
}

function makeHarness(opts) {
  opts = opts || {};
  timers = []; tseq = 1;
  const store = opts.store || {};
  const calls = [];
  const logs = [];
  const winHandlers = {}, docHandlers = {};
  let user = opts.signedIn === false ? null : { id: 'u-1', email: 'legend@example.com' };
  let verdicts = opts.fetch || (() => 200);

  const session = () => (user ? { user: user, access_token: 'jwt-1' } : null);
  global.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  };
  global.window = global;
  global.navigator = { onLine: opts.online !== false };
  global.location = { search: '', pathname: '/game/', href: 'https://example.com/game/' };
  global.document = { hidden: false, title: 'FL', addEventListener: (e, f) => { docHandlers[e] = f; } };
  global.addEventListener = (e, f) => { winHandlers[e] = f; };
  global.alert = () => {}; global.confirm = () => false; global.toast = () => {};
  global.flPlayerId = () => 'FL-TEST-0001';
  global.flMirror = () => {};
  global.flApplyGift = () => {};
  global.S = opts.bal || null;
  const realWarn = console.warn;
  console.warn = function () { logs.push(Array.prototype.join.call(arguments, ' ')); };
  global.fetch = function (url, init) {
    const body = init && init.body ? JSON.parse(init.body) : {};
    calls.push({ url: url, mode: body.mode, save: body.save, auth: (init && init.headers && init.headers.authorization) || '' });
    const v = verdicts(url, body);
    if (v === 'throw') return Promise.reject(new Error('network down'));
    const payload = body.mode === 'pull' ? { save: null, gifts: [] } : (body.mode === 'register' ? { ok: true } : { ok: true });
    return Promise.resolve({ status: v, text: () => Promise.resolve(JSON.stringify(v === 200 ? payload : { error: 'forced', reasons: ['forced'] })) });
  };
  global.setTimeout = function (fn, ms) { const t = { id: tseq++, at: clock + Math.max(0, ms || 0), fn: fn }; timers.push(t); return t.id; };
  global.clearTimeout = function (id) { timers = timers.filter(t => t.id !== id); };
  global.Date.now = () => clock;

  const fakeSb = {
    auth: {
      onAuthStateChange: cb => { winHandlers.authChange = cb; },
      getSession: () => Promise.resolve({ data: { session: session() } }),
      getUser: () => Promise.resolve({ data: { user: user } }),
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }),
  };
  global.window.supabase = { createClient: () => fakeSb };
  delete global.Cloud;
  (0, eval)(cloudSrc.replace('"use strict";', '').replace(/^(const|let) /gm, 'var ')); // eslint-disable-line no-eval
  return {
    Cloud: global.Cloud, calls: calls, store: store, logs: logs,
    docHandlers: docHandlers, winHandlers: winHandlers,
    setFetch: f => { verdicts = f; },
    setUser: u => { user = u; },
    signIn: u => { user = u; if (winHandlers.authChange) winHandlers.authChange('SIGNED_IN', { user: u }); },
    timerCount: () => timers.length,
    restoreWarn: () => { console.warn = realWarn; },
  };
}

(async function () {
  /* -------- burst after a finished match: debounced, coalesced -------- */
  const h = makeHarness({ bal: { name: 'Testman', season: 2, matchday: 5 } });
  await settle(12);
  h.calls.length = 0; // ignore the boot handshake (register + pull)

  for (let i = 0; i < 50; i++) h.Cloud.autoSync('bal');
  check('#18 50 saves in a burst leave exactly one pending upload', h.Cloud.pendingSync().bal > 0 && h.timerCount() === 1);
  await advance(5000);
  check('#18 nothing is uploaded inside the debounce window', h.calls.length === 0);
  await advance(2000);
  check('#18 exactly one upload fires after the debounce', h.calls.length === 1 && h.calls[0].mode === 'bal');
  check('#18 the upload carries the live save and the user JWT',
    !!h.calls[0].save && h.calls[0].save.name === 'Testman' && h.calls[0].auth === 'Bearer jwt-1');
  check('#18 the queue clears after a 200 and the failure counter resets',
    h.Cloud.pendingSync().bal === 0 && h.Cloud.pendingSync().tries === 0);

  /* -------- both modes, quota gap, never dropped -------- */
  localStorage.setItem('footballLegendML_v1', JSON.stringify({ clubName: 'Harbour FC', season: 3, squad: [] }));
  h.Cloud.autoSync('ml');
  await advance(6000);
  check('#18 an ML finish uploads mode "ml" with the ML save',
    h.calls.length === 2 && h.calls[1].mode === 'ml' && h.calls[1].save.clubName === 'Harbour FC');

  await advance(1000);
  h.Cloud.autoSync('ml');
  await advance(7000);
  check('#18 a second finish immediately after an upload is delayed by the quota gap, not dropped',
    h.Cloud.pendingSync().ml > 0 && h.calls.length === 2);
  await advance(45000);
  check('#18 ...and it uploads as soon as the gap passes', h.Cloud.pendingSync().ml === 0 && h.calls.length === 3);

  /* -------- a match with no live career: entry cleared, nothing sent -------- */
  const callsBefore = h.calls.length;
  global.S = { retired: true };
  h.Cloud.autoSync('bal');
  await advance(7000);
  check('#18 a retired/no-payload mode clears its queue entry without a wasted upload',
    h.calls.length === callsBefore && h.Cloud.pendingSync().bal === 0);

  /* -------- offline: queue persists, backoff, retried next session -------- */
  const h2 = makeHarness({ store: {}, bal: { name: 'Offlineman', season: 1 } });
  await settle(12);
  h2.calls.length = 0;
  h2.setFetch(() => 'throw');
  global.navigator.onLine = false;
  h2.Cloud.autoSync('bal');
  await advance(7000);
  check('#18 offline: the upload is attempted anyway and the save stays queued',
    h2.calls.length === 1 && h2.Cloud.pendingSync().bal > 0);
  check('#18 a failed upload grows the backoff counter and re-arms a retry',
    h2.Cloud.pendingSync().tries === 1 && h2.timerCount() === 1);
  const queued = JSON.parse(h2.store['footballLegendAutoSync_v1']);
  check('#18 the queue is persisted and contains only modes + timestamps (no save data)',
    queued.bal > 0 && !/name|squad|clubName|budget/.test(JSON.stringify(queued)));

  const h3 = makeHarness({ store: h2.store, bal: { name: 'Offlineman', season: 1 } }); // "restart the app"
  await settle(12);
  await advance(1000);
  check('#18 the queue left by a killed app uploads on the next session by itself',
    h3.calls.some(c => c.mode === 'bal') && h3.Cloud.pendingSync().bal === 0);

  /* -------- a rejected save is dropped once (no infinite retry loop) -------- */
  const h4 = makeHarness({ store: {}, bal: { name: 'Rejected' }, fetch: () => 422 });
  await settle(12);
  h4.calls.length = 0;
  h4.Cloud.autoSync('bal');
  await advance(7000);
  check('#18 a server-rejected save is dropped once, in the error log, and never retried',
    h4.Cloud.pendingSync().bal === 0 && h4.timerCount() === 0 && h4.logs.some(l => /rejected save/.test(l)));
  h4.restoreWarn();

  /* -------- an expired session keeps the career queued -------- */
  const h5 = makeHarness({ store: {}, fetch: () => 401 });
  await settle(12);
  h5.calls.length = 0;
  localStorage.setItem('footballLegendML_v1', JSON.stringify({ clubName: 'Expiry FC', season: 2, squad: [] }));
  h5.Cloud.autoSync('ml');
  await advance(7000);
  check('#18 an expired session keeps the save queued for the next session instead of losing it',
    h5.Cloud.pendingSync().ml > 0 && h5.Cloud.pendingSync().tries === 1);

  /* -------- signed out: nothing sent, nothing lost, flushed on sign-in -------- */
  const h6 = makeHarness({ store: {}, signedIn: false, bal: { name: 'Later' } });
  await settle(12);
  h6.Cloud.autoSync('bal');
  await advance(10000);
  check('#18 signed out: no traffic, and the finished match stays queued',
    h6.calls.length === 0 && h6.Cloud.pendingSync().bal > 0);
  h6.signIn({ id: 'u-9', email: 'later@example.com' });
  await advance(1000);
  check('#18 signing in flushes what was queued while signed out',
    h6.calls.some(c => c.mode === 'bal') && h6.Cloud.pendingSync().bal === 0);

  /* -------- lifecycle events: leaving the app, coming back online -------- */
  const h7 = makeHarness({ store: {}, bal: { name: 'Events' } });
  await settle(12);
  h7.calls.length = 0;
  h7.Cloud.autoSync('bal');
  global.document.hidden = true;
  h7.docHandlers.visibilitychange();
  await settle(8);
  check('#18 leaving the app flushes pending work immediately (no debounce wait)',
    h7.calls.length === 1 && h7.Cloud.pendingSync().bal === 0);

  h7.setFetch(() => 'throw');
  localStorage.setItem('footballLegendML_v1', JSON.stringify({ clubName: 'Net FC', season: 1, squad: [] }));
  h7.Cloud.autoSync('ml');
  await advance(7000);
  check('#18 a network drop leaves the career queued', h7.Cloud.pendingSync().ml > 0);
  h7.setFetch(() => 200);
  h7.winHandlers.online();
  await advance(1000);
  check('#18 coming back online retries at once, without waiting for the next match',
    h7.Cloud.pendingSync().ml === 0 && h7.calls[h7.calls.length - 1].mode === 'ml');

  /* -------- API surface / no-throw guarantees -------- */
  check('#18 unknown modes are refused and never throw', h7.Cloud.autoSync('bogus') === false);
  check('#18 the auto-sync API is exported for the game to call',
    typeof h7.Cloud.autoSync === 'function' && typeof h7.Cloud.flushAutoSync === 'function' &&
    typeof h7.Cloud.pendingSync === 'function' && typeof h7.Cloud.autoBoot === 'function' && typeof h7.Cloud.push === 'function');
  const empty = await h7.Cloud.flushAutoSync();
  check('#18 flushing with nothing queued is a no-op (resolves false)', empty === false);
  h7.restoreWarn();
})().then(function () {

/* ============================ 3. game wiring ============================ */
{
  check('#18 a BaL match finish marks the mode dirty (explicit, guarded hook)',
    /save\(\);\n(\s*\/\/ #18[^\n]*\n)?\s*if \(window\.Cloud && Cloud\.autoSync\) \{ try \{ Cloud\.autoSync\("bal"\); \} catch \(e\) \{\} \}/.test(appSrc));
  check('#18 an ML match finish does the same for mode "ml"',
    /mlSave\(\);\n(\s*\/\/ #18[^\n]*\n)?\s*if \(window\.Cloud && Cloud\.autoSync\) \{ try \{ Cloud\.autoSync\("ml"\); \} catch \(e\) \{\} \}/.test(mlSrc));
  check('#18 both hooks are guarded, so the game runs identically with cloud disabled',
    (appSrc.match(/if \(window\.Cloud && Cloud\.autoSync\)/g) || []).length >= 1 &&
    (mlSrc.match(/if \(window\.Cloud && Cloud\.autoSync\)/g) || []).length >= 1);
  check('#18 the old drop-on-cooldown throttle is gone',
    cloudSrc.indexOf('SYNC_COOLDOWN') < 0 && /function autoSync\(mode\)/.test(cloudSrc));
  check('#18 the queue is restored before the first render', /Cloud\.autoBoot\(\)[\s\S]{0,120}Cloud\.init\(\)/.test(cloudSrc));
  check('#18 the client never writes any table directly (reads are owner-select; writes go through sync-save)',
    !/\.insert\(|\.update\(|\.upsert\(|\.delete\(/.test(cloudSrc) &&
    cloudSrc.indexOf('/rest/v1/saves') < 0 && cloudSrc.indexOf('fn("sync-save"') > 0);
  check('#18 backoff is bounded (a queue cannot hammer the server forever)',
    /AUTO_BACKOFF = \[30e3, 60e3, 120e3, 300e3, 900e3\]/.test(cloudSrc) &&
    /Math\.min\(auto\.tries - 1, AUTO_BACKOFF\.length - 1\)/.test(cloudSrc));
  check('#18 a manual sync also clears the auto queue it just satisfied',
    /if \(balPayload\) \{ auto\.bal = 0; auto\.lastPush\.bal = Date\.now\(\); \}/.test(cloudSrc) &&
    /if \(mlPayload\) \{ auto\.ml = 0; auto\.lastPush\.ml = Date\.now\(\); \}/.test(cloudSrc));
}

/* ============================ report ============================ */
console.log('\n' + '-'.repeat(58));
console.log(`${pass} passed, ${fails.length} failed`);
for (const f of fails) console.log('FAIL  ' + f);
process.exit(fails.length ? 1 : 0);

});
