// v1.5 feature tests (headless)
"use strict";
const fs = require("fs");
const path = require("path");
const E = require("./engine.js");

const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
global.window = global;
global.Engine = E;
global.E = E;
global.addEventListener = () => {};
global.removeEventListener = () => {};
const stubEl = () => {
  const el = {
    style: {}, classList: { toggle(){}, add(){}, remove(){}, contains(){ return false; } },
    value: "", innerHTML: "", textContent: "", children: [], parentNode: null,
    prepend(){}, appendChild(){}, remove(){}, focus(){}, select(){}, blur(){},
    getContext(){ return new Proxy({}, { get: () => () => ({ addColorStop(){} }) }); },
    addEventListener(){}, removeEventListener(){}, setAttribute(){}, getAttribute(){ return null; },
    querySelector(){ return stubEl(); }, querySelectorAll(){ return []; },
    getBoundingClientRect(){ return { top:0,left:0,width:100,height:100 }; }
  };
  return new Proxy(el, {
    get: (t, k) => (k in t ? t[k] : null),
    set: (t, k, v) => { t[k] = v; return true; }
  });
};
global.document = {
  body: stubEl(), documentElement: stubEl(),
  getElementById: () => stubEl(),
  querySelector: () => stubEl(),
  querySelectorAll: () => [],
  createElement: () => stubEl(),
  addEventListener(){}, removeEventListener(){}
};
try { Object.defineProperty(global, "navigator", { value: { userAgent: "node-test", clipboard: null }, configurable: true }); } catch (e) {}
try { Object.defineProperty(global, "location", { value: { href: "http://localhost/", origin: "http://localhost", pathname: "/", hash: "", search: "", reload(){} }, configurable: true }); } catch (e) {}
global.history = { pushState(){}, replaceState(){} };
global.requestAnimationFrame = cb => setTimeout(cb, 0);
global.cancelAnimationFrame = id => clearTimeout(id);
global.btoa = s => Buffer.from(String(s), "binary").toString("base64");
global.atob = s => Buffer.from(String(s), "base64").toString("binary");
global.confirm = () => true;
global.prompt = () => null;
global.alert = () => {};
global.toast = () => {};
global.render = (fn) => { try { if (typeof fn === "function") return fn(); } catch (e) {} };
global.S = null;
global.Snd = { goalUs(){}, fulltime(){}, whistle(){}, tap(){}, crowdStart(){}, crowdStop(){}, ui(){} };
global.Capacitor = undefined;
global.supabase = {
  createClient() {
    return {
      auth: {
        onAuthStateChange(){},
        getSession(){ return Promise.resolve({ data: { session: null } }); },
        signInWithOAuth(){ return Promise.resolve({ data: {} }); },
        signOut(){ return Promise.resolve(); },
        exchangeCodeForSession(){ return Promise.resolve(); }
      }
    };
  }
};

let fails = [], pass = 0;
function check(name, cond, detail) {
  if (cond) pass++;
  else fails.push(name + (detail ? " [" + detail + "]" : ""));
}

// ---- static file assertions (always run) ----
const appTxt = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const cloudTxt = fs.readFileSync(path.join(__dirname, "cloud.js"), "utf8");
const sqlTxt = fs.readFileSync(path.join(__dirname, "supabase/leaderboard.sql"), "utf8");
const voTxt = fs.readFileSync(path.join(__dirname, "supabase/functions/verify-owner/index.ts"), "utf8");
const cgTxt = fs.readFileSync(path.join(__dirname, "../app/copy-game.js"), "utf8");
const adminTxt = fs.readFileSync(path.join(__dirname, "admin/admin.js"), "utf8");

check("no FL_OWNER_HASH in app.js", !appTxt.includes("FL_OWNER_HASH"));
check("no client-side flown hash compare", !appTxt.includes('hashSeed("flown:"'));
check("owner unlock calls verifyOwner", appTxt.includes("Cloud.verifyOwner"));
check("ghost screen present", appTxt.includes("function ghostScreen") && appTxt.includes("function startGhostMatch") && appTxt.includes("function ghostMyClub"));
check("news inbox present", appTxt.includes("function newsInboxScreen") && appTxt.includes("flNewsUnread"));
check("menu Ghost tile", appTxt.includes("goghost") && appTxt.includes("Ghost PvP"));
check("menu News tile", appTxt.includes("gonews") && appTxt.includes("News Inbox"));
check("gift history 30", appTxt.includes("h.slice(0, 30)"));
check("leaderboard seasons UI", appTxt.includes("_lbSeason") && appTxt.includes("fetchSeasonBoard"));
check("FR_STYLES before ghost section", appTxt.indexOf("const FR_STYLES") < appTxt.indexOf("GHOST PvP") && appTxt.indexOf("const FR_STYLES") > 0);
check("cloud fetchBroadcasts", cloudTxt.includes("function fetchBroadcasts"));
check("cloud fetchGhosts", cloudTxt.includes("function fetchGhosts"));
check("cloud fetchSeasons", cloudTxt.includes("function fetchSeasons"));
check("cloud verifyOwner", cloudTxt.includes("function verifyOwner"));
check("cloud exports ghosts", cloudTxt.includes("fetchGhosts: fetchGhosts"));
check("cloud exports verifyOwner", cloudTxt.includes("verifyOwner: verifyOwner"));
check("sql ghosts rpc", sqlTxt.includes("leaderboard_ghosts"));
check("sql season_close", sqlTxt.includes("season_close"));
check("sql leaderboard_season", sqlTxt.includes("leaderboard_season"));
check("sql seasons table", /create table if not exists seasons/i.test(sqlTxt));
check("verify-owner engine hash constants", voTxt.includes("1779033703") && voTxt.includes("3432918353"));
check("verify-owner default legacy hash", voTxt.includes("1728818593"));
check("copy-game points at game/", cgTxt.includes('"game"') && !cgTxt.includes("naija-legend"));
check("admin seasons page", adminTxt.includes("seasons:") && adminTxt.includes("closeSeason"));
check("admin seasons nav", adminTxt.includes('["seasons"'));

// hashSeed lockstep
function hashSeedVO(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h ^= h >>> 16) >>> 0;
}
check("hashSeed lockstep", hashSeedVO("flown:abc") === E.hashSeed("flown:abc"));
check("hashSeed empty lockstep", hashSeedVO("") === E.hashSeed(""));

// ---- load cloud.js ----
(0, eval)(cloudTxt.replace('"use strict";', ""));
check("Cloud object", typeof Cloud === "object");
check("Cloud.enabled", Cloud.enabled() === true);
check("Cloud APIs", typeof Cloud.fetchGhosts === "function" && typeof Cloud.verifyOwner === "function"
  && typeof Cloud.fetchBroadcasts === "function" && typeof Cloud.fetchSeasons === "function");

// ---- load app.js ----
let appSrc = appTxt.replace('"use strict";', "").replace(/^(const|let) /gm, "var ");
let appOk = true;
try {
  (0, eval)(appSrc);
} catch (e) {
  appOk = false;
  fails.push("app.js eval: " + e.message);
}
check("app.js loads headless", appOk);

if (appOk) {
  check("ghostMyClub fn", typeof ghostMyClub === "function");
  check("ghostScreen fn", typeof ghostScreen === "function");
  check("startGhostMatch fn", typeof startGhostMatch === "function");
  check("newsInboxScreen fn", typeof newsInboxScreen === "function");
  check("flIsOwner default false", flIsOwner() === false);
  check("FR_STYLES runtime", typeof FR_STYLES === "object" && !!FR_STYLES.highpress);
  check("frDuel highpress beats possession", frDuel("highpress", "possession").h === 1);
  check("frDuel neutral", frDuel("possession", "possession").h === 0);

  const me = ghostMyClub();
  check("ghostMyClub starter fallback", me && me.name && me.str > 0 && me.source === "starter");

  const prevS = S;
  S = newSave("Marco Test", "CF", "poacher", "southeuro");
  const cardHtml = playerCardHTML(true);
  check("bal card stats always on", cardHtml.includes("PAC") && cardHtml.includes("SHO") && cardHtml.includes("pcard-foil"));
  check("bal card compact class", cardHtml.includes("compact") && cardHtml.includes("pcard-kit"));
  check("bal card ovr present", /class="ovr"/.test(cardHtml));
  S = prevS;

  const fakeMl = {
    clubName: "Test United", clubShort: "TST", mentality: "attacking", style: "highpress",
    squad: [], xi: [], season: 3, matchday: 4,
    world: { clubs: [{ name: "Test United", short: "TST", str: 70 }] }, clubIdx: 0
  };
  for (let i = 0; i < 14; i++) {
    fakeMl.squad.push({ id: "p" + i, name: "P" + i, pos: i === 0 ? "GK" : i < 5 ? "DF" : i < 9 ? "MF" : "FW", ovr: 70 + (i % 10), age: 24 });
    if (i < 11) fakeMl.xi.push("p" + i);
  }
  localStorage.setItem("footballLegendML_v1", JSON.stringify(fakeMl));
  const me2 = ghostMyClub();
  check("ghostMyClub uses ML", me2.source === "ml" && me2.name === "Test United");
  check("ghostMyClub str from OVR", me2.str > 60 && me2.str < 100, String(me2.str));

  FL_NEWS_CACHE = [
    { id: "a1", message: "Hello", starts_at: "2020-01-01", ends_at: "2099-01-01", created_at: "2026-01-01" },
    { id: "a2", message: "World", starts_at: "2020-01-01", ends_at: "2099-01-01", created_at: "2026-01-02" }
  ];
  check("unread 2", flNewsUnread() === 2);
  flNewsMark("a1");
  check("unread 1", flNewsUnread() === 1);
  flNewsMark("a2");
  check("unread 0", flNewsUnread() === 0);

  let captured = null;
  const realRender = render;
  global.render = (fn) => { captured = fn; };
  try {
    startGhostMatch(me2, {
      player_id: "FL-TEST-0001", name: "Rival", club: "Rival FC",
      str: 72, mentality: "balanced", style: "possession", season: 2, trophies: 1
    });
    check("startGhostMatch renders", typeof captured === "function");
  } catch (e) {
    fails.push("startGhostMatch threw: " + e.message);
  }
  global.render = realRender;
}

// verifyOwner without session
Cloud.verifyOwner("x").then(r => {
  check("verifyOwner requires sign-in", r && r.ok === false && /sign in/i.test(r.msg || ""));
  done();
}).catch(e => { fails.push("vo: " + e.message); done(); });

function done() {
  console.log(pass + " passed, " + fails.length + " failed");
  fails.forEach(f => console.log("FAIL  " + f));
  process.exit(fails.length ? 1 : 0);
}
