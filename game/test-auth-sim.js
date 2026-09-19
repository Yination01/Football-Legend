// ============================================================================
// test-auth-sim.js — End-to-end SIGN-IN simulation (headless, hermetic)
//
// Boots the REAL vendored supabase-js client + the REAL game/admin JS (the only
// change: the Supabase project URL constant is swapped to a local fake server)
// inside vm "browser pages", and drives every OAuth journey against a fake
// Supabase backend + a fake "Google / hosted authorize" redirector that models
// the Dashboard → URL Configuration allow-list semantics:
//
//   S1  web game sign-in (full page reload through the OAuth redirect)
//   S2  native app sign-in via com.footballlegend.game://callback deep link
//   S3  native sign-in with the deep link NOT allow-listed — the exact bug
//       "sign-in only works on web": Supabase silently falls back to Site URL
//   S4  OAuth error deep link (error_code= must not be mistaken for a PKCE code)
//   S5  implicit #access_token= deep-link fallback
//   S6  superuser: admin accounts auto-unlock the Owner Panel; non-admins can
//       still open it via the 7-tap owner-key flow (real hash check server-side)
//   S7  admin console: gate for admin/non-admin, exact-uid grant SQL, URL errors
// ============================================================================
"use strict";
const http = require("http");
const vm = require("vm");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const E = require("./engine.js");
const SB_REAL = "https://cdrcibinjssyqdufeqmk.supabase.co";

// ---- cast ----
const OWNER = { id: "1a2b3c4d-0000-4000-8000-aaaaaaaaaaaa", email: "owner@example.com" };
const PLAYER = { id: "9f8e7d6c-0000-4000-8000-bbbbbbbbbbbb", email: "player@example.com" };
const ADMINS = new Set([OWNER.id]);                 // the `admins` table content
const OWNER_KEY = "s3cr3t";                          // sim owner key (non-admin fallback)
const OWNER_KEY_HASH = E.hashSeed("flown:" + OWNER_KEY) >>> 0;

const SITE_URL = "https://yination01.github.io/Football-Legend/game/";
// Mirrors supabase/SETUP.md step 3b (the fixed state) and the pre-fix broken state:
const ALLOWLIST_FIXED = [
  "https://yination01.github.io/Football-Legend/game/**",
  "http://localhost:8000/**",
  "com.footballlegend.game://callback",
];
const ALLOWLIST_BROKEN = ["https://yination01.github.io/Football-Legend/game/"]; // deep link missing + no wildcard (today's bug)

// ---- fake Supabase server ----
const issuedCodes = new Map();   // code -> user
const accessTokens = new Map();  // access_token -> user
const hits = { token: 0, user: 0, admins: 0, syncRegister: 0, verifyOwner: 0 };

function b64u(x) { return Buffer.from(JSON.stringify(x)).toString("base64url"); }
function mintAccess(user) {
  const now = Math.floor(Date.now() / 1000);
  const t = b64u({ alg: "HS256", typ: "JWT" }) + "." + b64u({
    sub: user.id, email: user.email, aud: "authenticated", role: "authenticated",
    iat: now, exp: now + 3600,
  }) + ".sim-sig";
  accessTokens.set(t, user);
  return t;
}
function sessionJson(user) {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: mintAccess(user), refresh_token: "rt-" + crypto.randomBytes(8).toString("hex"),
    token_type: "bearer", expires_in: 3600, expires_at: now + 3600,
    user: {
      id: user.id, aud: "authenticated", role: "authenticated", email: user.email,
      email_confirmed_at: "2026-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z",
      app_metadata: { provider: "google" }, user_metadata: {},
    },
  };
}
function json(res, status, body, extraHeaders) {
  res.writeHead(status, Object.assign({
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type, apikey, prefer, accept-profile",
    "access-control-allow-methods": "GET, POST, HEAD, OPTIONS",
  }, extraHeaders || {}));
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve) => {
    let b = "";
    req.on("data", (c) => { b += c; });
    req.on("end", () => { try { resolve(JSON.parse(b || "{}")); } catch (e) { resolve({}); } });
  });
}
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  const p = u.pathname;
  if (req.method === "OPTIONS") return json(res, 200, "ok");
  const body = req.method === "POST" ? await readBody(req) : {};
  const bearer = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const who = accessTokens.get(bearer) || null;

  // --- goTrue ---
  if (p === "/auth/v1/token" && req.method === "POST") {
    hits.token++;
    const grant = u.searchParams.get("grant_type");
    if (grant === "pkce" && body.auth_code && issuedCodes.has(body.auth_code)) {
      const user = issuedCodes.get(body.auth_code); issuedCodes.delete(body.auth_code);
      return json(res, 200, sessionJson(user));
    }
    return json(res, 400, { error: "invalid_grant", error_description: "Invalid auth code" });
  }
  if (p === "/auth/v1/user" && req.method === "GET") {
    hits.user++;
    if (!who) return json(res, 401, { message: "invalid jwt" });
    return json(res, 200, { id: who.id, aud: "authenticated", role: "authenticated", email: who.email });
  }

  // --- PostgREST ---
  if (p === "/rest/v1/admins" && (req.method === "GET" || req.method === "HEAD")) {
    hits.admins++;
    const uidEq = u.searchParams.get("uid") || "";
    const uid = uidEq.replace(/^eq\./, "");
    const match = ADMINS.has(uid) ? { uid } : null;
    const wantObject = String(req.headers.accept || "").includes("vnd.pgrst.object+json");
    if (wantObject) {
      // real PostgREST + supabase-js maybeSingle(): 406 PGRST116 maps to { data: null, error: null }
      if (!match) return json(res, 406, { code: "PGRST116", details: "The result contains 0 rows", hint: null, message: "Cannot coerce the result to a single JSON object" });
      return json(res, 200, match);
    }
    return json(res, 200, match ? [match] : []);
  }
  if (p.startsWith("/rest/v1/rpc/")) return json(res, 200, []);
  if (p.startsWith("/rest/v1/")) return json(res, 200, [], { "content-range": "*/0" });

  // --- edge functions ---
  if (p === "/functions/v1/sync-save" && req.method === "POST") {
    if (!who) return json(res, 401, { error: "Sign in first" });
    if (body.mode === "register") { hits.syncRegister++; return json(res, 200, { ok: true }); }
    if (body.mode === "pull") return json(res, 200, { gifts: [], save: null });
    return json(res, 200, { ok: true });
  }
  if (p === "/functions/v1/verify-owner" && req.method === "POST") {
    if (!who) return json(res, 401, { error: "Sign in first" });
    hits.verifyOwner++;
    const got = E.hashSeed("flown:" + String(body.key || "").trim()) >>> 0;
    if (got === OWNER_KEY_HASH) return json(res, 200, { ok: true, token: "owner:" + who.id.slice(0, 8) });
    return json(res, 403, { error: "Wrong key" });
  }
  return json(res, 404, { message: "not found: " + p });
});

// ---- "Google / hosted authorize page" simulator: allow-list semantics ----
function globToRe(glob) {
  const esc = glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("^" + esc.replace(/\*\*/g, "").replace(/\*/g, "[^/?#]*").replace(//g, ".*") + "$");
}
function supabaseRedirect(authorizeUrl, email, allowlist) { // models Authentication → URL Configuration
  const u = new URL(authorizeUrl);
  const rt = u.searchParams.get("redirect_to");
  const allowed = allowlist.some((g) => globToRe(g).test(rt));
  if (allowed) {
    const code = "ac-" + crypto.randomBytes(6).toString("hex");
    issuedCodes.set(code, email === OWNER.email ? OWNER : PLAYER);
    return rt + (rt.includes("?") ? "&" : "?") + "code=" + code;
  }
  // NOT allow-listed: Supabase silently falls back to the Site URL (no deep link!).
  return SITE_URL + "?error=server_error&error_description=" + encodeURIComponent("redirect_to " + rt + " is not allowed");
}

// ---- headless "browser page" (vm context with DOM/localStorage stubs) ----
function makeStore(backing) {
  const store = backing || {};
  return {
    _data: store,
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
}
function makeDom(toastSink) {
  const cache = new Map();
  function stubEl(sel) {
    let txt = "";
    return {
      _sel: sel, style: {}, value: "", innerHTML: "", outerHTML: "", onclick: null,
      children: [], parentNode: null,
      // both toast() implementations (app.js: fresh div textContent; admin.js: #toast
      // textContent) funnel through this setter — that makes every toast observable:
      get textContent() { return txt; },
      set textContent(v) { txt = String(v); if (v && toastSink) toastSink(String(v)); },
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      prepend() {}, appendChild() {}, remove() {}, focus() {}, select() {}, blur() {},
      addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute() { return null; },
      querySelector(q) { return elFor(sel + " " + q); }, querySelectorAll() { return []; },
      getContext() { return new Proxy({}, { get: () => () => ({ addColorStop() {} }) }); },
      getBoundingClientRect() { return { top: 0, left: 0, width: 100, height: 100 }; },
    };
  }
  function elFor(sel) { if (!cache.has(sel)) cache.set(sel, stubEl(sel)); return cache.get(sel); }
  const document = {
    body: stubEl("body"), documentElement: stubEl("html"), title: "sim",
    getElementById: (id) => elFor("#" + id),
    querySelector: (q) => elFor(q), querySelectorAll: () => [],
    createElement: () => stubEl("dyn"), addEventListener() {}, removeEventListener() {},
  };
  return { document, elFor };
}
let GAME_SRC = null, ADMIN_SRC = null, VENDOR_SRC = null;
function src(rel) { return fs.readFileSync(path.join(__dirname, rel), "utf8"); }
function swapUrl(text) { return text.split(SB_REAL).join("http://127.0.0.1:" + PORT); }
let PORT = 0;

function makePage(opts) {
  const url = new URL(opts.url);
  const toasts = [];
  const { document, elFor } = makeDom((m) => toasts.push(m));
  const listeners = {};   // Capacitor plugin listeners by event name
  const browserCalls = { open: [], closed: 0 };
  const page = {
    toasts, listeners, browserCalls, elFor,
    promptValue: null,
    location: null, sandbox: null,
    html(sel) { return String(elFor(sel).innerHTML); },
    run(name, code) { return vm.runInContext(code, this.sandbox, { filename: name }); },
  };
  const location = {
    href: opts.url, origin: url.origin, protocol: url.protocol, host: url.host, hostname: url.hostname,
    pathname: url.pathname, search: url.search, hash: url.hash, port: url.port,
    assign(u) { this.href = u; }, replace(u) { this.href = u; }, reload() {},
  };
  page.location = location;
  const sandbox = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
    // vm contexts get language intrinsics but NOT Node's web runtime globals:
    URL, URLSearchParams, Headers, Request, Response, FormData, Blob,
    fetch: (a, b) => fetch(a, b), crypto: crypto.webcrypto, performance,
    AbortController, AbortSignal, TextEncoder, TextDecoder,
    structuredClone: (x) => JSON.parse(JSON.stringify(x)),
    WebSocket: typeof WebSocket !== "undefined" ? WebSocket : undefined,
    localStorage: makeStore(opts.store),
    navigator: { userAgent: "fl-auth-sim", locks: { request: (name, o, cb) => { const f = typeof o === "function" ? o : cb; return Promise.resolve().then(() => f({ name })); } } },
    document, location, history: { pushState() {}, replaceState() {} },
    alert() {}, confirm: () => true, prompt: () => page.promptValue,
    toast: (m) => toasts.push(String(m)),
    addEventListener() {}, removeEventListener() {},
    btoa: (s) => Buffer.from(String(s), "binary").toString("base64"),
    atob: (s) => Buffer.from(String(s), "base64").toString("binary"),
    requestAnimationFrame: (cb) => setTimeout(cb, 0), cancelAnimationFrame: (id) => clearTimeout(id),
    Snd: { goalUs() {}, fulltime() {}, whistle() {}, tap() {}, crowdStart() {}, crowdStop() {}, ui() {} },
  };
  sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
  if (opts.native) {
    sandbox.Capacitor = {
      isNativePlatform: () => true,
      Plugins: {
        App: { addListener: (ev, cb) => { (listeners[ev] = listeners[ev] || []).push(cb); }, minimizeApp() {} },
        Browser: { open: (o) => { browserCalls.open.push(o.url); return Promise.resolve(); }, close: () => { browserCalls.closed++; return Promise.resolve(); } },
        Preferences: { set: () => Promise.resolve(), get: () => Promise.resolve({ value: null }), remove: () => Promise.resolve() },
        Filesystem: { checkPermissions: () => Promise.resolve({ publicStorage: "granted" }), requestPermissions: () => Promise.resolve({ publicStorage: "granted" }), writeFile: () => Promise.resolve(), readFile: () => Promise.reject(new Error("no file")) },
        SplashScreen: { hide: () => Promise.resolve() },
      },
    };
  }
  vm.createContext(sandbox);
  page.sandbox = sandbox;
  page.run("vendor-supabase.js", VENDOR_SRC);
  return page;
}
function bootGame(page) { // scripts as in game/index.html (ml.js not needed for auth)
  page.run("engine.js", src("engine.js"));
  page.run("cloud.js", swapUrl(GAME_SRC.cloud));
  page.run("app.js", GAME_SRC.app);
}
function bootAdmin(page) {
  page.run("admin.js", swapUrl(ADMIN_SRC));
}

// ---- tiny test framework ----
let pass = 0; const fails = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log("  \u2713 " + name); }
  else { fails.push(name + (detail ? " [" + detail + "]" : "")); console.log("  \u2717 " + name); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, timeout, what) {
  const t0 = Date.now();
  while (Date.now() - t0 < (timeout || 4000)) { try { if (fn()) return true; } catch (e) {} await sleep(25); }
  fails.push("timeout: " + what);
  return false;
}
const enc = encodeURIComponent;

async function main() {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  PORT = server.address().port;
  VENDOR_SRC = src("vendor-supabase.js");
  GAME_SRC = { cloud: src("cloud.js"), app: src("app.js") };
  ADMIN_SRC = src("admin/admin.js");

  // ==================== S1: web game sign-in (redirect + reload) ====================
  {
    const store = {}; // browser localStorage persists across the redirect
    const p1 = makePage({ url: SITE_URL, store });
    bootGame(p1);
    p1.sandbox.Cloud.signIn();
    await until(() => p1.location.href.includes("/auth/v1/authorize"), 3000, "authorize redirect");
    const authUrl = p1.location.href;
    check("S1 authorize URL hits fake Supabase", authUrl.startsWith("http://127.0.0.1:" + PORT + "/auth/v1/authorize?"));
    check("S1 PKCE challenge present", /code_challenge=.+&code_challenge_method=s256/.test(authUrl));
    check("S1 redirect_to is the game page", authUrl.includes("redirect_to=" + enc("https://yination01.github.io/Football-Legend/game/")), authUrl);

    // Google account chooser → Supabase callback → allowed redirect back to the game with ?code=
    const back = supabaseRedirect(authUrl, OWNER.email, ALLOWLIST_FIXED);
    check("S1 allow-listed redirect comes back to the game", back.startsWith("https://yination01.github.io/Football-Legend/game/?code="));

    const p2 = makePage({ url: back, store }); // "page reload" at the callback URL
    bootGame(p2);
    const ok = await until(() => p2.sandbox.Cloud.signedIn(), 4000, "web session established");
    check("S1 web sign-in completes", ok);
    check("S1 account email visible", p2.sandbox.Cloud.accountEmail() === OWNER.email);
    await until(() => /Owner Panel/.test(p2.html("#app")), 3000, "owner tile on menu");
    check("S1 admin auto-unlocks Owner Panel (superuser)", /Owner Panel/.test(p2.html("#app")));
    check("S1 ownerMode persisted", (store.flSettings || "").includes("\"ownerMode\":true"));
    check("S1 admin toast shown", p2.toasts.some((t) => t.includes("Admin account")));
    check("S1 cloud register+pull ran", hits.syncRegister >= 1);
    // settings screen shows the connected account immediately (UI hook fired)
    p2.sandbox.render(p2.sandbox.settingsScreen);
    await sleep(20);
    check("S1 settings shows signed-in state", p2.html("#app").includes(OWNER.email) && p2.html("#app").includes("SIGN OUT"), p2.html("#app").slice(0, 200));
  }

  // ==================== S2: native app sign-in via deep link ====================
  {
    const store = {};
    const app = makePage({ url: "https://localhost/", native: true, store });
    bootGame(app);
    await until(() => (app.listeners.appUrlOpen || []).length > 0, 2000, "appUrlOpen listener registered");
    app.sandbox.Cloud.signIn();
    const opened = await until(() => app.browserCalls.open.length === 1, 3000, "Browser.open");
    check("S2 system browser opened with OAuth URL", opened);
    const authUrl = app.browserCalls.open[0] || "";
    check("S2 redirect_to is the app deep link", authUrl.includes("redirect_to=" + enc("com.footballlegend.game://callback")), authUrl);
    check("S2 progress toast", app.toasts.some((t) => /Opening Google sign-in/.test(t)));

    const tokenHitsBefore = hits.token;
    const back = supabaseRedirect(authUrl, OWNER.email, ALLOWLIST_FIXED); // fixed allow-list (SETUP 3b)
    check("S2 fixed allow-list returns the deep link", back.startsWith("com.footballlegend.game://callback?code="));
    app.listeners.appUrlOpen.forEach((cb) => cb({ url: back })); // Android delivers the VIEW intent
    const ok = await until(() => app.sandbox.Cloud.signedIn(), 4000, "native session established");
    check("S2 app sign-in completes via deep link", ok);
    check("S2 exactly one code exchange", hits.token - tokenHitsBefore === 1, String(hits.token - tokenHitsBefore));
    check("S2 custom tab closed", (await until(() => app.browserCalls.closed >= 1, 2000, "browser closed")) || app.browserCalls.closed >= 1);
    check("S2 signed-in toast", app.toasts.some((t) => t.includes("Signed in")));
    await until(() => /Owner Panel/.test(app.html("#app")), 3000, "owner tile after native sign-in");
    check("S2 admin auto-unlocks Owner Panel in app", /Owner Panel/.test(app.html("#app")));
    check("S2 settings UI refreshed without reload", app.html("#app").length > 50);

    // S4 (on this signed-in app): error deep links must NEVER be exchanged as codes
    const beforeErr = hits.token;
    app.listeners.appUrlOpen.forEach((cb) => cb({ url: "com.footballlegend.game://callback?error=server_error&error_code=unexpected_failure&error_description=" + enc("redirect_to not allowed") }));
    await sleep(80);
    check("S4 error deep link not exchanged as auth code", hits.token === beforeErr, String(hits.token - beforeErr));
    check("S4 error deep link surfaces a toast", app.toasts.filter((t) => /sign-in failed/i.test(t)).length >= 1, app.toasts.join("|").slice(-160));

    // S5: implicit fragment fallback on a fresh, signed-out app page
    const app5 = makePage({ url: "https://localhost/", native: true, store: {} });
    bootGame(app5);
    await until(() => (app5.listeners.appUrlOpen || []).length > 0, 2000, "app5 listener");
    app5.listeners.appUrlOpen.forEach((cb) => cb({ url: "com.footballlegend.game://callback#access_token=" + mintAccess(PLAYER) + "&refresh_token=rt-sim&token_type=bearer&expires_in=3600" }));
    const ok5 = await until(() => app5.sandbox.Cloud.signedIn(), 4000, "implicit session established");
    check("S5 implicit #access_token deep link signs in", ok5);
    check("S5 implicit identity correct", app5.sandbox.Cloud.accountEmail() === PLAYER.email);
  }

  // ==================== S3: TODAY'S BUG — deep link missing from allow-list ====================
  {
    const store = {};
    const app = makePage({ url: "https://localhost/", native: true, store });
    bootGame(app);
    await until(() => (app.listeners.appUrlOpen || []).length > 0, 2000, "S3 listener");
    app.sandbox.Cloud.signIn();
    await until(() => app.browserCalls.open.length === 1, 3000, "S3 Browser.open");
    const back = supabaseRedirect(app.browserCalls.open[0], OWNER.email, ALLOWLIST_BROKEN);
    check("S3 non-allow-listed redirect falls back to the web Site URL", back.startsWith(SITE_URL), back);
    const tokenHitsBefore = hits.token;
    // What really happens on the phone: the session page opens in the external tab;
    // even IF a stray URL reached the app, non-scheme URLs must be ignored:
    app.listeners.appUrlOpen.forEach((cb) => cb({ url: back }));
    await sleep(120);
    check("S3 app stays signed out (the reported bug)", !app.sandbox.Cloud.signedIn());
    check("S3 no code exchange happened", hits.token === tokenHitsBefore);
    app.sandbox.render(app.sandbox.settingsScreen);
    await sleep(20);
    check("S3 settings still offers sign-in (not fake-connected)", app.html("#app").includes("SIGN IN WITH GOOGLE"));

    // ...while the WEB page that received the fallback shows the error instead of failing silently
    const web = makePage({ url: back, store: {} });
    bootGame(web);
    await sleep(60);
    check("S3 fallback web page surfaces the OAuth error", web.toasts.some((t) => /Google sign-in failed/i.test(t)), web.toasts.join("|"));

    // THE FIX: add the deep link to the allow-list (SETUP step 3b) and the very same flow works
    const backFixed = supabaseRedirect(app.browserCalls.open[0], OWNER.email, ALLOWLIST_FIXED);
    check("S3 fix check: with 3b applied the deep link is honored", backFixed.startsWith("com.footballlegend.game://callback?code="));
  }

  // ==================== S6: superuser — admin auto-unlock + owner-key fallback ====================
  {
    // non-admin player signs in on the app: NO auto owner panel...
    const store = {};
    const app = makePage({ url: "https://localhost/", native: true, store });
    bootGame(app);
    await until(() => (app.listeners.appUrlOpen || []).length > 0, 2000, "S6 listener");
    app.sandbox.Cloud.signIn();
    await until(() => app.browserCalls.open.length === 1, 3000, "S6 Browser.open");
    const back = supabaseRedirect(app.browserCalls.open[0], PLAYER.email, ALLOWLIST_FIXED);
    app.listeners.appUrlOpen.forEach((cb) => cb({ url: back }));
    await until(() => app.sandbox.Cloud.signedIn(), 4000, "S6 player session");
    await sleep(120);
    check("S6 non-admin does NOT auto-unlock", !(store.flSettings || "").includes("\"ownerMode\":true"));
    check("S6 menu hides Owner Panel for players", !/Owner Panel/.test(app.html("#app")));

    // ...7 hidden taps on the Player ID + wrong owner key → rejected by the server
    app.sandbox.render(app.sandbox.settingsScreen);
    await sleep(30);
    const pidrow = () => app.elFor("#pidrow").onclick;
    const wrongPrompt = "WRONGKEY";
    app.promptValue = wrongPrompt;
    for (let i = 0; i < 7; i++) pidrow()();
    await sleep(150);
    check("S6 wrong owner key rejected server-side", app.toasts.some((t) => t.includes("Wrong key")), app.toasts.join("|").slice(-200));
    check("S6 still not owner after wrong key", !(store.flSettings || "").includes("\"ownerMode\":true"));

    // ...7 taps again with the RIGHT key (verify-owner does the real hashSeed check)
    app.promptValue = OWNER_KEY;
    app.sandbox.render(app.sandbox.settingsScreen); // fresh render resets the tap counter honestly
    await sleep(30);
    for (let i = 0; i < 7; i++) pidrow()();
    const okKey = await until(() => (store.flSettings || "").includes("\"ownerMode\":true"), 3000, "owner key accepted");
    check("S6 correct owner key unlocks superuser", okKey);
    check("S6 verify-owner function was hit (twice incl. wrong key)", hits.verifyOwner === 2, String(hits.verifyOwner));
    check("S6 owner-mode toast", app.toasts.some((t) => t.includes("Owner mode ON")));
    await until(() => /Owner Panel/.test(app.html("#app")), 2000, "owner tile after key unlock");
    check("S6 Owner Panel visible after key unlock", /Owner Panel/.test(app.html("#app")));
  }

  // ==================== S7: admin console gating ====================
  {
    // admin account → Overview with SUPERUSER pill
    const storeA = {};
    const a1 = makePage({ url: "https://yination01.github.io/Football-Legend/game/admin/", store: storeA });
    bootAdmin(a1);
    await sleep(40);
    check("S7 console shows sign-in when logged out", a1.html("#app").includes("Sign in with Google"));
    a1.sandbox.signIn();
    await until(() => a1.location.href.includes("/auth/v1/authorize"), 3000, "S7 authorize");
    check("S7 redirect_to stays on the console", a1.location.href.includes("redirect_to=" + enc("https://yination01.github.io/Football-Legend/game/admin/")), a1.location.href);
    const backA = supabaseRedirect(a1.location.href, OWNER.email, ALLOWLIST_FIXED); // /game/** covers /game/admin/
    const a2 = makePage({ url: backA, store: storeA });
    bootAdmin(a2);
    // overview content renders into #main inside the shell; shell+nav live in #app
    const consoleHtml = () => a2.html("#app") + "|" + a2.html("#main");
    const overviewOk = await until(() => consoleHtml().includes("SUPERUSER"), 4000, "console overview for admin");
    check("S7 admin lands on Overview (SUPERUSER)", overviewOk, consoleHtml().slice(0, 200));
    check("S7 overview shows admin email", consoleHtml().includes(OWNER.email), consoleHtml().slice(0, 200));
    check("S7 console nav rendered", consoleHtml().includes("Players") && consoleHtml().includes("Broadcast"));

    // non-admin → lock screen with the EXACT uid grant SQL (no guessing the email)
    const storeP = {}; // PKCE code-verifier lives in browser storage — the callback page needs it
    const a3 = makePage({ url: "https://yination01.github.io/Football-Legend/game/admin/", store: storeP });
    bootAdmin(a3);
    a3.sandbox.signIn();
    await until(() => a3.location.href.includes("/auth/v1/authorize"), 3000, "S7b authorize");
    const backB = supabaseRedirect(a3.location.href, PLAYER.email, ALLOWLIST_FIXED);
    const a4 = makePage({ url: backB, store: storeP });
    bootAdmin(a4);
    const lockOk = await until(() => a4.html("#app").includes("no admin rights"), 4000, "lock screen for non-admin");
    check("S7 non-admin sees the lock screen", lockOk);
    check("S7 lock offers EXACT uid grant SQL", a4.html("#app").includes("insert into admins (uid) values ('" + PLAYER.id + "')"), a4.html("#app").slice(0, 240));

    // OAuth error coming back in the console URL is surfaced, never silent
    const a5 = makePage({ url: "https://yination01.github.io/Football-Legend/game/admin/?error=server_error&error_description=" + enc("redirect_to mismatch"), store: {} });
    bootAdmin(a5);
    await sleep(60);
    check("S7 console URL error is toasted", a5.toasts.some((t) => /Google sign-in failed/i.test(t)), a5.toasts.join("|"));
  }

  console.log(pass + " passed, " + fails.length + " failed");
  fails.forEach((f) => console.log("FAIL  " + f));
  server.close(() => process.exit(fails.length ? 1 : 0));
  setTimeout(() => process.exit(fails.length ? 1 : 0), 1500).unref(); // gotrue refresh timers keep the loop alive otherwise
}

process.on("unhandledRejection", (e) => { fails.push("unhandledRejection: " + (e && e.message)); });
main().catch((e) => { console.log("FATAL " + (e && e.stack || e)); process.exit(1); });
