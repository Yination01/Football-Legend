"use strict";
// ============ FOOTBALL LEGEND · ADMIN DASHBOARD ============
// Poise-style live-ops console. Auth: Google via Supabase; access: admins table (RLS-enforced).
var SB_URL = "https://cdrcibinjssyqdufeqmk.supabase.co";
var SB_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNkcmNpYmluanNzeXFkdWZlcW1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1NDgzNzUsImV4cCI6MjEwNDEyNDM3NX0.BjU1Kxs-ekhGziInrAKUQ4TDrR6Iy4btwTyjMtkHuAI";

var sb = window.supabase.createClient(SB_URL, SB_ANON);
var session = null, isAdmin = false, page = "overview";
var $ = function (q) { return document.querySelector(q); };

function toast(msg) {
  var t = $("#toast"); t.textContent = msg; t.classList.add("show");
  setTimeout(function () { t.classList.remove("show"); }, 2600);
}
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function fmtDate(d) { return d ? new Date(d).toISOString().slice(0, 10) : "\u2014"; }
function fmtAgo(d) {
  if (!d) return "never";
  var h = (Date.now() - new Date(d).getTime()) / 3600000;
  if (h < 1) return "just now"; if (h < 24) return Math.floor(h) + "h ago";
  return Math.floor(h / 24) + "d ago";
}

// ---------- auth ----------
sb.auth.onAuthStateChange(function (_e, s) { session = s; gate(); });
sb.auth.getSession().then(function (r) { session = r.data.session; gate(); });

function gate() {
  if (!session) { renderLock(false); return; }
  sb.from("admins").select("uid").eq("uid", session.user.id).maybeSingle().then(function (r) {
    isAdmin = !!r.data;
    if (isAdmin) { render(); } else { renderLock(true); }
  });
}

function renderLock(signedButNotAdmin) {
  $("#app").innerHTML =
    '<div class="lock"><div class="logo">\u26bd FOOTBALL <span style="color:var(--gold)">LEGEND</span></div>' +
    '<p class="muted" style="margin-bottom:18px">Admin Console</p>' +
    (signedButNotAdmin
      ? '<div class="panel"><p>Signed in as <b>' + esc(session.user.email) + '</b>, but this account has no admin rights.</p>' +
        '<p class="muted" style="margin-top:8px">In Supabase SQL Editor run:<br><code style="color:var(--gold)">insert into admins (uid) select id from auth.users where email = \'' + esc(session.user.email) + '\';</code><br>then hard-reload. (Profile-based grants fail if you have not signed in inside the game yet — see grant-admin.sql)</p>' +
        '<button class="btn ghost" style="margin-top:14px" onclick="signOut()">Sign out</button></div>'
      : '<button class="btn gold" onclick="signIn()">\ud83d\udd11 Sign in with Google</button>') +
    '</div>';
}
function signIn() { sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.href.split("#")[0].split("?")[0] } }); }
function signOut() { sb.auth.signOut().then(function () { location.reload(); }); }

// ---------- shell ----------
var NAV = [
  ["overview", "\ud83d\udcca", "Overview"],
  ["players", "\ud83d\udc65", "Players"],
  ["events", "\ud83c\udf81", "Gifts & Events"],
  ["codes", "\ud83c\udfab", "Codes"],
  ["broadcast", "\ud83d\udce2", "Broadcast"],
  ["seasons", "\ud83c\udfc6", "Seasons"],
  ["flags", "\ud83d\udea9", "Flagged"],
  ["admins", "\ud83d\udd10", "Admins"],
];
function render() {
  var nav = NAV.map(function (n) {
    return '<button class="' + (page === n[0] ? "on" : "") + '" onclick="go(\'' + n[0] + '\')">' + n[1] + ' <span>' + n[2] + "</span></button>";
  }).join("");
  $("#app").innerHTML =
    '<div class="layout"><div class="side">' +
    '<div class="brand"><div><span class="b1">\u26bd FOOTBALL</span> <span class="b2">LEGEND</span></div><div class="sub">Admin Console</div></div>' +
    '<div class="nav">' + nav + '</div>' +
    '<div class="me">' + esc(session.user.email) + '<button onclick="signOut()">Sign out</button></div>' +
    '</div><div class="main" id="main">Loading\u2026</div></div>';
  PAGES[page]();
}
function go(p) { page = p; render(); }

// ---------- pages ----------
var PAGES = {
  overview: function () {
    Promise.all([
      sb.from("profiles").select("uid", { count: "exact", head: true }),
      sb.from("profiles").select("uid", { count: "exact", head: true }).gte("last_seen", new Date(Date.now() - 864e5).toISOString()),
      sb.from("profiles").select("uid", { count: "exact", head: true }).eq("banned", true),
      sb.from("flags").select("id", { count: "exact", head: true }),
      sb.from("stats_daily").select("*").order("day", { ascending: false }).limit(14),
      sb.from("codes").select("code,uses,max_uses"),
    ]).then(function (r) {
      var days = (r[4].data || []).slice().reverse();
      var max = Math.max.apply(null, [1].concat(days.map(function (d) { return d.dau; })));
      var bars = days.map(function (d) {
        return '<div class="bar" style="height:' + Math.max(2, (d.dau / max) * 100) + '%"><span>' + d.dau + '</span><i>' + d.day.slice(5) + "</i></div>";
      }).join("") || '<p class="muted">No activity yet \u2014 charts appear once players sign in.</p>';
      var codeUses = (r[5].data || []).reduce(function (a, c) { return a + c.uses; }, 0);
      $("#main").innerHTML =
        "<h1>Overview</h1><div class='crumb'>Live view of the player base</div>" +
        '<div class="cards">' +
        card("Registered players", r[0].count || 0, "all time") +
        card("Active (24h)", r[1].count || 0, "signed-in sessions") +
        card("Code redemptions", codeUses, "server-side") +
        card("Banned", r[2].count || 0, (r[3].count || 0) + " anti-cheat flags") +
        "</div>" +
        '<div class="panel"><h2>Daily active users \u00b7 last 14 days</h2><div class="bars" style="margin-bottom:20px">' + bars + "</div></div>" +
        '<div class="panel"><h2>\ud83c\udf10 Top players right now</h2><div id="ov_lb" class="grid2"><p class="muted">loading\u2026</p></div></div>' +
        '<div class="panel"><h2>Quota safety (Supabase free tier)</h2><p class="muted">Auth: 50,000 monthly users \u00b7 DB: 500MB \u00b7 Functions: 500K calls/month. Current usage is far below all limits \u2014 the sync throttle (90s) keeps it that way.</p></div>';
    });
    function card(k, v, d) { return '<div class="card"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="d">' + d + "</div></div>"; }
    Promise.all([sb.rpc("leaderboard_bal", { lim: 5 }), sb.rpc("leaderboard_ml", { lim: 5 })]).then(function (r) {
      var el = $("#ov_lb"); if (!el) return;
      var b = r[0].data || [], m = r[1].data || [];
      var mk = function (title, rows, fmt) {
        return "<div><h2>" + title + "</h2>" + (rows.length ? rows.map(fmt).join("") : "<p class='muted'>no entries yet</p>") + "</div>";
      };
      el.outerHTML = '<div class="grid2">' +
        mk("\u2b50 Legends", b, function (x, i) { return "<p>" + (i + 1) + ". <b>" + esc(x.pname) + "</b> <span class='muted'>" + esc(x.name) + " \u00b7 rep " + x.rep + "</span></p>"; }) +
        mk("\ud83c\udfc6 Clubs", m, function (x, i) { return "<p>" + (i + 1) + ". <b>" + esc(x.club) + "</b> <span class='muted'>" + esc(x.name) + " \u00b7 " + x.trophies + " trophies</span></p>"; }) +
        "</div>";
    }).catch(function () {});
  },

  players: function () {
    $("#main").innerHTML =
      "<h1>Players</h1><div class='crumb'>Search, inspect, gift, ban</div>" +
      '<div class="panel"><div class="row">' +
      '<div><label>Search by Player ID or name</label><input id="q" placeholder="FL-XXXX-XXXX or name" onkeydown="if(event.key===\'Enter\')searchPlayers()"></div>' +
      '<div style="flex:0 0 auto"><button class="btn" onclick="searchPlayers()">SEARCH</button> <button class="btn ghost" onclick="listRecent()">RECENT</button></div>' +
      "</div></div><div id='results'></div>";
    listRecent();
  },

  events: function () {
    sb.from("events").select("*").order("starts_at", { ascending: false }).then(function (r) {
      var rows = (r.data || []).map(function (e) {
        var p = e.payload || {};
        var live = e.active && e.starts_at <= today() && e.ends_at >= today();
        return "<tr><td><b>" + esc(e.title) + "</b><br><span class='muted'>" + esc(e.id) + "</span></td>" +
          "<td>" + e.starts_at + " \u2192 " + e.ends_at + "</td>" +
          "<td>" + payloadDesc(p) + "</td>" +
          "<td>" + (live ? '<span class="pill g">LIVE</span>' : e.active ? '<span class="pill y">scheduled</span>' : '<span class="pill r">off</span>') + "</td>" +
          '<td><button class="btn sm ghost" onclick="toggleEvent(\'' + e.id + "'," + !e.active + ')">' + (e.active ? "Disable" : "Enable") + "</button> " +
          '<button class="btn sm red" onclick="delEvent(\'' + e.id + "')\">Delete</button></td></tr>";
      }).join("");
      $("#main").innerHTML =
        "<h1>Gifts & Events</h1><div class='crumb'>Live-ops \u2014 changes reach every player without an app update</div>" +
        '<div class="panel"><h2>Create event</h2>' +
        '<div class="row"><div><label>ID (no spaces)</label><input id="ev_id" placeholder="eid26"></div>' +
        '<div><label>Title</label><input id="ev_title" placeholder="Eid Celebration Gift"></div></div>' +
        '<div class="row"><div><label>Starts</label><input id="ev_from" type="date"></div><div><label>Ends</label><input id="ev_to" type="date"></div></div>' +
        '<div class="row"><div><label>BaL GP</label><input id="ev_gp" type="number" value="1000"></div>' +
        '<div><label>BaL LC</label><input id="ev_lc" type="number" value="10"></div>' +
        '<div><label>ML GP (M)</label><input id="ev_mlgp" type="number" value="2"></div>' +
        '<div><label>ML LC</label><input id="ev_mllc" type="number" value="10"></div></div>' +
        '<div class="row"><div><label>Gift player (optional) \u2014 name</label><input id="ev_pname" placeholder="leave empty for currency only"></div>' +
        '<div><label>Pos</label><select id="ev_ppos"><option>FW</option><option>MF</option><option>DF</option><option>GK</option></select></div>' +
        '<div><label>OVR</label><input id="ev_povr" type="number" value="86"></div>' +
        '<div><label>Card</label><select id="ev_pcard"><option>showtime</option><option>bigtime</option><option>trending</option><option>legendary</option></select></div></div>' +
        '<button class="btn gold" style="margin-top:14px" onclick="createEvent()">CREATE EVENT</button></div>' +
        '<div class="panel"><h2>All events</h2><table><tr><th>Event</th><th>Window</th><th>Payload</th><th>Status</th><th></th></tr>' + (rows || "<tr><td colspan=5 class='muted'>none yet</td></tr>") + "</table></div>";
    });
  },

  codes: function () {
    sb.from("codes").select("*").order("created_at", { ascending: false }).limit(50).then(function (r) {
      var rows = (r.data || []).map(function (c) {
        return "<tr><td><code>" + esc(c.code) + "</code></td><td>" + payloadDesc(c.payload || {}) + "</td>" +
          "<td>" + c.uses + " / " + c.max_uses + "</td><td>" + (c.expires_at ? fmtDate(c.expires_at) : "never") + "</td>" +
          '<td><button class="btn sm ghost" onclick="copyText(\'' + esc(c.code) + "')\">Copy</button> " +
          '<button class="btn sm red" onclick="delCode(\'' + esc(c.code) + "')\">Delete</button></td></tr>";
      }).join("");
      $("#main").innerHTML =
        "<h1>Redeem Codes</h1><div class='crumb'>Server-verified \u2014 globally limited, race-safe</div>" +
        '<div class="panel"><h2>Generate codes</h2>' +
        '<div class="row"><div><label>Prefix</label><input id="cd_tpl" placeholder="EID26" value="GIFT26"></div>' +
        '<div><label>How many codes</label><input id="cd_n" type="number" value="1"></div>' +
        '<div><label>Max uses per code</label><input id="cd_uses" type="number" value="1"></div>' +
        '<div><label>Expires</label><input id="cd_exp" type="date"></div></div>' +
        '<div class="row"><div><label>BaL GP</label><input id="cd_gp" type="number" value="1000"></div>' +
        '<div><label>BaL LC</label><input id="cd_lc" type="number" value="10"></div>' +
        '<div><label>ML GP (M)</label><input id="cd_mlgp" type="number" value="2"></div>' +
        '<div><label>ML LC</label><input id="cd_mllc" type="number" value="10"></div></div>' +
        '<button class="btn gold" style="margin-top:14px" onclick="genCodes()">GENERATE</button>' +
        '<div id="gen_out" style="margin-top:10px"></div></div>' +
        '<div class="panel"><h2>Existing codes</h2><table><tr><th>Code</th><th>Payload</th><th>Uses</th><th>Expires</th><th></th></tr>' + (rows || "<tr><td colspan=5 class='muted'>none yet</td></tr>") + "</table></div>";
    });
  },

  broadcast: function () {
    sb.from("broadcasts").select("*").order("created_at", { ascending: false }).limit(20).then(function (r) {
      var rows = (r.data || []).map(function (b) {
        var live = b.starts_at <= today() && b.ends_at >= today();
        return "<tr><td>" + esc(b.message) + "</td><td>" + b.starts_at + " \u2192 " + b.ends_at + "</td>" +
          "<td>" + (live ? '<span class="pill g">LIVE</span>' : '<span class="pill r">off</span>') + "</td>" +
          '<td><button class="btn sm red" onclick="delBroadcast(\'' + b.id + "')\">Delete</button></td></tr>";
      }).join("");
      $("#main").innerHTML =
        "<h1>Broadcast</h1><div class='crumb'>A message every player sees in-game</div>" +
        '<div class="panel"><h2>New broadcast</h2>' +
        '<label>Message</label><textarea id="bc_msg" placeholder="\u26bd Server maintenance tonight \u2014 gifts for everyone tomorrow!"></textarea>' +
        '<div class="row"><div><label>Show from</label><input id="bc_from" type="date" value="' + today() + '"></div>' +
        '<div><label>Until</label><input id="bc_to" type="date"></div></div>' +
        '<button class="btn gold" style="margin-top:14px" onclick="sendBroadcast()">PUBLISH</button></div>' +
        '<div class="panel"><h2>History</h2><table><tr><th>Message</th><th>Window</th><th>Status</th><th></th></tr>' + (rows || "<tr><td colspan=4 class='muted'>none yet</td></tr>") + "</table></div>";
    });
  },

  seasons: function () {
    Promise.all([
      sb.from("seasons").select("*").order("starts_at", { ascending: false }).limit(24),
      sb.rpc("leaderboard_bal", { lim: 3 }),
      sb.rpc("leaderboard_ml", { lim: 3 })
    ]).then(function (res) {
      var seasons = res[0].data || [];
      var topB = res[1].data || [];
      var topM = res[2].data || [];
      var now = new Date();
      var defId = now.getUTCFullYear() + "-" + String(now.getUTCMonth() + 1).padStart(2, "0");
      var defLab = now.toLocaleString("en", { month: "long", year: "numeric" });
      var rows = seasons.map(function (s) {
        return "<tr><td><b>" + esc(s.id) + "</b><br><span class='muted'>" + esc(s.label) + "</span></td>" +
          "<td>" + s.starts_at + " \u2192 " + s.ends_at + "</td>" +
          "<td>" + (s.closed ? '<span class="pill r">closed</span>' : '<span class="pill g">open</span>') + "</td>" +
          '<td><button class="btn sm" onclick="viewSeason(\'' + esc(s.id) + '\')">View</button></td></tr>';
      }).join("") || "<tr><td colspan='4' class='muted'>No seasons closed yet.</td></tr>";
      var liveB = topB.map(function (r, i) {
        return (i + 1) + ". " + esc(r.pname) + " (" + r.rep + " rep)";
      }).join("<br>") || "\u2014";
      var liveM = topM.map(function (r, i) {
        return (i + 1) + ". " + esc(r.club) + " (\ud83c\udfc6" + r.trophies + ")";
      }).join("<br>") || "\u2014";
      $("#main").innerHTML =
        "<h1>Seasons</h1><div class='crumb'>Monthly snapshots + auto-gifts for top 3</div>" +
        '<div class="panel"><h2>Close current season</h2>' +
        '<p class="muted">Snapshots LIVE Legends + Clubs boards, writes season_ranks, and drops inbox gifts for #1\u2013#3. Idempotent per season id.</p>' +
        '<label>Season ID</label><input id="sz_id" value="' + defId + '" />' +
        '<label>Label</label><input id="sz_lab" value="' + esc(defLab) + '" />' +
        '<button class="btn gold" style="margin-top:14px" onclick="closeSeason()">CLOSE & REWARD TOP 3</button></div>' +
        '<div class="grid2"><div class="panel"><h2>Live top 3 · Legends</h2><p>' + liveB + "</p></div>" +
        '<div class="panel"><h2>Live top 3 · Clubs</h2><p>' + liveM + "</p></div></div>" +
        '<div class="panel"><h2>Past seasons</h2><table><thead><tr><th>Season</th><th>Window</th><th>Status</th><th></th></tr></thead><tbody>' +
        rows + "</tbody></table></div>" +
        '<div class="panel" id="sz_view" style="display:none"></div>';
    });
  },
  flags: function () {
    Promise.all([
      sb.from("flags").select("*").order("created_at", { ascending: false }).limit(100),
      sb.from("saves").select("uid,flag_count").gt("flag_count", 0),
    ]).then(function (r) {
      var byUid = {};
      (r[1].data || []).forEach(function (s) { byUid[s.uid] = s.flag_count; });
      var rows = (r[0].data || []).map(function (f) {
        return "<tr><td class='muted'>" + fmtAgo(f.created_at) + "</td><td><code>" + esc(f.uid.slice(0, 8)) + "\u2026</code></td>" +
          "<td class='flagged'>" + esc(f.reason) + "</td><td class='muted'>" + esc(JSON.stringify((f.detail || {}).reasons || [])) + "</td>" +
          '<td><button class="btn sm ghost" onclick="inspectUid(\'' + f.uid + "')\">Inspect</button> " +
          '<button class="btn sm red" onclick="setBanUid(\'' + f.uid + "',true)\">Ban</button></td></tr>";
      }).join("");
      $("#main").innerHTML =
        "<h1>Flagged</h1><div class='crumb'>Anti-cheat: rejected save uploads \u2014 the save never entered the cloud</div>" +
        '<div class="panel"><table><tr><th>When</th><th>User</th><th>Reason</th><th>Detail</th><th></th></tr>' +
        (rows || "<tr><td colspan=5 class='muted'>\ud83c\udf89 No cheating attempts detected</td></tr>") + "</table></div>";
    });
  },

  admins: function () {
    Promise.all([sb.from("admins").select("uid"), sb.from("profiles").select("uid,player_id,name")]).then(function (r) {
      var profs = {};
      (r[1].data || []).forEach(function (p) { profs[p.uid] = p; });
      var rows = (r[0].data || []).map(function (a) {
        var p = profs[a.uid] || {};
        return "<tr><td><code>" + esc(a.uid.slice(0, 12)) + "\u2026</code></td><td>" + esc(p.player_id || "?") + "</td><td>" + esc(p.name || "?") + "</td>" +
          "<td>" + (a.uid === session.user.id ? '<span class="pill g">you</span>' : '<button class="btn sm red" onclick="removeAdmin(\'' + a.uid + "')\">Remove</button>") + "</td></tr>";
      }).join("");
      $("#main").innerHTML =
        "<h1>Admins</h1><div class='crumb'>Accounts with full console access</div>" +
        '<div class="panel"><h2>Add admin</h2><div class="row">' +
        '<div><label>Player ID of the account</label><input id="ad_pid" placeholder="FL-XXXX-XXXX"></div>' +
        '<div style="flex:0 0 auto"><button class="btn" onclick="addAdmin()">GRANT ADMIN</button></div></div>' +
        '<p class="muted" style="margin-top:8px">The person must have signed into the game with Google at least once.</p></div>' +
        '<div class="panel"><h2>Current admins</h2><table><tr><th>UID</th><th>Player ID</th><th>Name</th><th></th></tr>' + rows + "</table></div>";
    });
  },
};

// ---------- helpers & actions ----------
function today() { return new Date().toISOString().slice(0, 10); }
function payloadDesc(p) {
  var parts = [];
  if (p.gp) parts.push(p.gp + " GP");
  if (p.lc) parts.push(p.lc + " LC");
  if (p.mlgp) parts.push(p.mlgp + "M ML");
  if (p.mllc) parts.push(p.mllc + " ML-LC");
  if (p.pl) parts.push("\u2b50 " + esc(p.pl.name) + " (" + p.pl.pos + " " + p.pl.ovr + ")");
  return parts.join(" \u00b7 ") || "\u2014";
}
function copyText(t) { navigator.clipboard.writeText(t).then(function () { toast("Copied: " + t); }); }
function payloadFromInputs(prefix) {
  var g = function (id) { return Number(($("#" + prefix + id) || {}).value || 0); };
  var p = { gp: g("_gp"), lc: g("_lc"), mlgp: g("_mlgp"), mllc: g("_mllc") };
  var nameEl = $("#" + prefix + "_pname");
  if (nameEl && nameEl.value.trim()) {
    p.pl = { name: nameEl.value.trim(), pos: $("#" + prefix + "_ppos").value, ovr: Number($("#" + prefix + "_povr").value || 85), card: $("#" + prefix + "_pcard").value };
  }
  return p;
}

// players
function listRecent() {
  sb.from("profiles").select("*").order("last_seen", { ascending: false }).limit(25).then(function (r) { renderPlayers(r.data || []); });
}
function searchPlayers() {
  var q = $("#q").value.trim();
  if (!q) return listRecent();
  sb.from("profiles").select("*").or("player_id.ilike.%" + q + "%,name.ilike.%" + q + "%").limit(25).then(function (r) { renderPlayers(r.data || []); });
}
function renderPlayers(list) {
  var rows = list.map(function (p) {
    return "<tr><td><code>" + esc(p.player_id) + "</code></td><td>" + esc(p.name) + "</td>" +
      "<td class='muted'>" + fmtAgo(p.last_seen) + "</td>" +
      "<td>" + (p.banned ? '<span class="pill r">BANNED</span>' : '<span class="pill g">active</span>') + "</td>" +
      '<td><button class="btn sm ghost" onclick="inspectUid(\'' + p.uid + "')\">Inspect</button> " +
      '<button class="btn sm gold" onclick="giftUid(\'' + p.uid + "','" + esc(p.player_id) + "')\">Gift</button> " +
      '<button class="btn sm ' + (p.banned ? "" : "red") + '" onclick="setBanUid(\'' + p.uid + "'," + !p.banned + ')">' + (p.banned ? "Unban" : "Ban") + "</button></td></tr>";
  }).join("");
  $("#results").innerHTML = '<div class="panel"><table><tr><th>Player ID</th><th>Name</th><th>Last seen</th><th>Status</th><th>Actions</th></tr>' +
    (rows || "<tr><td colspan=5 class='muted'>no players found</td></tr>") + "</table></div>";
}
function inspectUid(uid) {
  Promise.all([
    sb.from("profiles").select("*").eq("uid", uid).maybeSingle(),
    sb.from("saves").select("*").eq("uid", uid).maybeSingle(),
    sb.from("inbox").select("*").eq("uid", uid).order("created_at", { ascending: false }).limit(10),
  ]).then(function (r) {
    var p = r[0].data || {}, s = r[1].data || {}, inb = r[2].data || [];
    var bal = s.bal_save, ml = s.ml_save;
    var html = '<div class="panel"><h2>\ud83d\udd0e ' + esc(p.player_id) + " \u00b7 " + esc(p.name) + "</h2>" +
      "<p class='muted'>Joined " + fmtDate(p.created_at) + " \u00b7 last seen " + fmtAgo(p.last_seen) +
      (s.flag_count ? ' \u00b7 <span class="flagged">' + s.flag_count + " anti-cheat flags</span>" : "") + "</p><div class='grid2' style='margin-top:12px'>";
    html += "<div><h2>\u2b50 Become a Legend</h2>" + (bal
      ? "<p>" + esc(bal.name) + " \u00b7 " + esc(bal.pos) + " \u00b7 Season " + bal.season + " \u00b7 Age " + (bal.age || "?") + "</p><p class='muted'>" + (bal.gp || 0) + " GP \u00b7 " + (bal.nl || 0) + " LC \u00b7 synced " + fmtAgo(s.bal_updated) + "</p>"
      : "<p class='muted'>no cloud save</p>") + "</div>";
    html += "<div><h2>\ud83c\udfc6 Master League</h2>" + (ml
      ? "<p>" + esc(ml.clubName || "club") + " \u00b7 Season " + ml.season + " \u00b7 " + (ml.squad || []).length + " players</p><p class='muted'>" + (ml.budget || 0) + "M \u00b7 " + (ml.lc || 0) + " LC \u00b7 synced " + fmtAgo(s.ml_updated) + "</p>"
      : "<p class='muted'>no cloud save</p>") + "</div></div>";
    if (inb.length) {
      html += "<h2 style='margin-top:14px'>\ud83d\udce5 Inbox (last 10)</h2><table><tr><th>Gift</th><th>Sent</th><th>Status</th></tr>" +
        inb.map(function (g) { return "<tr><td>" + payloadDesc(g.gift || {}) + "</td><td class='muted'>" + fmtAgo(g.created_at) + "</td><td>" + (g.claimed ? '<span class="pill g">claimed</span>' : '<span class="pill y">waiting</span>') + "</td></tr>"; }).join("") + "</table>";
    }
    html += "</div>";
    $("#results").innerHTML = html + $("#results").innerHTML;
    window.scrollTo(0, 0);
  });
}
function giftUid(uid, pid) {
  var gp = Number(prompt("BaL GP for " + pid + "?", "1000") || 0);
  var lc = Number(prompt("BaL Legend Coins?", "10") || 0);
  var mlgp = Number(prompt("ML budget (M)?", "2") || 0);
  var mllc = Number(prompt("ML Legend Coins?", "10") || 0);
  var note = prompt("Note shown to the player?", "A gift from the developers!") || "";
  var gift = { gp: gp, lc: lc, mlgp: mlgp, mllc: mllc, note: note };
  sb.from("inbox").insert({ uid: uid, gift: gift }).then(function (r) {
    toast(r.error ? "Failed: " + r.error.message : "\ud83c\udf81 Gift queued \u2014 delivered on their next sign-in session");
  });
}
function setBanUid(uid, ban) {
  if (ban && !confirm("Ban this player? They lose cloud access (local game keeps working).")) return;
  sb.from("profiles").update({ banned: ban }).eq("uid", uid).then(function (r) {
    toast(r.error ? "Failed: " + r.error.message : ban ? "\ud83d\udeab Banned" : "\u2705 Unbanned");
    if (page === "players") listRecent();
  });
}

// events
function createEvent() {
  var id = $("#ev_id").value.trim(), title = $("#ev_title").value.trim();
  var from = $("#ev_from").value, to = $("#ev_to").value;
  if (!id || !title || !from || !to) return toast("Fill id, title and both dates");
  sb.from("events").insert({ id: id, title: title, starts_at: from, ends_at: to, payload: payloadFromInputs("ev"), active: true }).then(function (r) {
    if (r.error) return toast("Failed: " + r.error.message);
    toast("\ud83c\udf81 Event live \u2014 players see it within 5 minutes");
    PAGES.events();
  });
}
function toggleEvent(id, on) { sb.from("events").update({ active: on }).eq("id", id).then(function () { PAGES.events(); }); }
function delEvent(id) { if (confirm("Delete event " + id + "?")) sb.from("events").delete().eq("id", id).then(function () { PAGES.events(); }); }

// codes
function genCodes() {
  var tpl = ($("#cd_tpl").value.trim().toUpperCase() || "GIFT26").replace(/[^A-Z0-9]/g, "").slice(0, 12);
  var n = Math.min(100, Math.max(1, Number($("#cd_n").value || 1)));
  var maxUses = Math.max(1, Number($("#cd_uses").value || 1));
  var exp = $("#cd_exp").value || null;
  var payload = payloadFromInputs("cd");
  var alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  var rows = [], list = [];
  for (var i = 0; i < n; i++) {
    var ser = "", chk = "";
    for (var j = 0; j < 4; j++) ser += alpha[Math.floor(Math.random() * alpha.length)];
    for (var k = 0; k < 4; k++) chk += alpha[Math.floor(Math.random() * alpha.length)];
    var code = tpl + "-" + ser + "-" + chk;
    rows.push({ code: code, payload: payload, max_uses: maxUses, expires_at: exp, created_by: session.user.id });
    list.push(code);
  }
  sb.from("codes").insert(rows).then(function (r) {
    if (r.error) return toast("Failed: " + r.error.message);
    $("#gen_out").innerHTML = '<div class="panel" style="margin:0"><b>' + n + " code" + (n > 1 ? "s" : "") + " created:</b><br>" +
      list.map(function (c) { return "<code>" + c + "</code>"; }).join(" ") +
      ' <button class="btn sm ghost" onclick="copyText(\'' + list.join("\\n") + "')\">Copy all</button></div>";
    toast("\ud83c\udfab " + n + " codes generated");
    setTimeout(function () { PAGES.codes(); }, 1800);
  });
}
function delCode(code) { if (confirm("Delete code " + code + "?")) sb.from("codes").delete().eq("code", code).then(function () { PAGES.codes(); }); }

// broadcast
function sendBroadcast() {
  var msg = $("#bc_msg").value.trim(), from = $("#bc_from").value, to = $("#bc_to").value;
  if (!msg || !from || !to) return toast("Fill message and both dates");
  sb.from("broadcasts").insert({ message: msg, starts_at: from, ends_at: to }).then(function (r) {
    toast(r.error ? "Failed: " + r.error.message : "\ud83d\udce2 Broadcast published");
    PAGES.broadcast();
  });
}
function delBroadcast(id) { sb.from("broadcasts").delete().eq("id", id).then(function () { PAGES.broadcast(); }); }

// seasons
function closeSeason() {
  var id = ($("#sz_id").value || "").trim();
  var lab = ($("#sz_lab").value || "").trim();
  if (!id) return toast("Season ID required");
  if (!confirm("Close season " + id + " and gift top 3 on both boards?")) return;
  sb.rpc("season_close", { p_id: id, p_label: lab || id }).then(function (r) {
    if (r.error) toast("Failed: " + r.error.message);
    else toast("\ud83c\udfc6 Season closed · BaL " + (r.data && r.data.bal) + " · ML " + (r.data && r.data.ml));
    PAGES.seasons();
  });
}
function viewSeason(id) {
  Promise.all([
    sb.rpc("leaderboard_season", { mode: "bal", season_id: id, lim: 10 }),
    sb.rpc("leaderboard_season", { mode: "ml", season_id: id, lim: 10 })
  ]).then(function (res) {
    var b = (res[0].data && res[0].data.rows) || [];
    var m = (res[1].data && res[1].data.rows) || [];
    function list(rows, mode) {
      return rows.map(function (r) {
        if (mode === "bal") return r.rank + ". " + esc(r.pname || r.name) + " \u00b7 " + (r.rep || 0) + " rep";
        return r.rank + ". " + esc(r.club || r.name) + " \u00b7 \ud83c\udfc6" + (r.trophies || 0);
      }).join("<br>") || "\u2014";
    }
    var el = $("#sz_view");
    el.style.display = "block";
    el.innerHTML = "<h2>Season " + esc(id) + "</h2>" +
      '<div class="grid2"><div><b>Legends</b><p>' + list(b, "bal") + "</p></div>" +
      "<div><b>Clubs</b><p>" + list(m, "ml") + "</p></div></div>";
  });
}

// admins
function addAdmin() {
  var pid = $("#ad_pid").value.trim().toUpperCase();
  sb.from("profiles").select("uid").eq("player_id", pid).maybeSingle().then(function (r) {
    if (!r.data) return toast("No account with that Player ID has signed in yet");
    sb.from("admins").insert({ uid: r.data.uid }).then(function (r2) {
      toast(r2.error ? "Failed: " + r2.error.message : "\ud83d\udd10 Admin granted");
      PAGES.admins();
    });
  });
}
function removeAdmin(uid) {
  if (confirm("Remove this admin?")) sb.from("admins").delete().eq("uid", uid).then(function () { PAGES.admins(); });
}
