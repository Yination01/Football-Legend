"use strict";
// ============================ FOOTBALL LEGEND \u00b7 CLOUD (Supabase) ============================
// Optional Google sign-in + validated cloud save sync + server gifts/codes/events.
// The game NEVER requires this: every function degrades to offline behaviour.

// Filled in from FIREBASE/SUPABASE setup (see supabase/SETUP.md). Empty = cloud disabled.
var FL_CLOUD_URL = "https://cdrcibinjssyqdufeqmk.supabase.co";
var FL_CLOUD_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNkcmNpYmluanNzeXFkdWZlcW1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1NDgzNzUsImV4cCI6MjEwNDEyNDM3NX0.BjU1Kxs-ekhGziInrAKUQ4TDrR6Iy4btwTyjMtkHuAI"; // anon key: safe to ship, RLS enforces security

var ML_CLOUD_KEY = "footballLegendML_v1";

// Native deep link used by Google OAuth in the Android app. This exact URL MUST be
// allow-listed in Supabase → Authentication → URL Configuration → Redirect URLs
// (see supabase/SETUP.md step 3b). If it is missing, Supabase does NOT error — it
// silently falls back to the Site URL, which is exactly why "sign-in only works on
// web": the browser gets the session and the app never receives the callback.
var FL_DEEP_SCHEME = "com.footballlegend.game";
var FL_DEEP_LINK = FL_DEEP_SCHEME + "://callback";

var Cloud = (function () {
  var sb = null;            // supabase client
  var session = null;       // current auth session
  var lastSync = { bal: 0, ml: 0 };
  var SYNC_COOLDOWN = 90 * 1000; // min ms between pushes per mode (quota safety)

  function enabled() { return !!(FL_CLOUD_URL && FL_CLOUD_ANON && window.supabase); }
  function signedIn() { return !!(session && session.user); }

  function init() {
    if (!enabled()) return false;
    if (!sb) {
      sb = window.supabase.createClient(FL_CLOUD_URL, FL_CLOUD_ANON, { auth: { flowType: "pkce", detectSessionInUrl: true } });
      // Native app: OAuth must run in the system browser (Google blocks WebViews); the deep link returns here.
      if (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.App) {
        Capacitor.Plugins.App.addListener("appUrlOpen", function (ev) {
          var u = ev && ev.url ? String(ev.url) : "";
          if (u.indexOf(FL_DEEP_SCHEME + "://") === 0) handleAuthDeepLink(u);
        });
      }
      sb.auth.onAuthStateChange(function (_ev, s) {
        session = s;
        if (s && s.user) {
          onSignedIn();
          if (_ev === "SIGNED_IN") maybeAutoOwner(); // fresh sign-in: admins get the Owner Panel automatically
        }
        notifyAuthUi();
      });
      sb.auth.getSession().then(function (r) {
        session = r.data.session;
        if (session) onSignedIn();
        // OAuth failures are returned in the URL; do not fail silently.
        var params = new URLSearchParams(location.search);
        var oauthError = params.get("error_description") || params.get("error");
        if (oauthError) {
          toast("Google sign-in failed: " + authError({ message: oauthError }));
          if (window.history && window.history.replaceState) window.history.replaceState({}, document.title, location.pathname);
        }
      });
    }
    return true;
  }

  function authError(err) {
    var msg = err && (err.message || err.error_description || err.error);
    if (!msg) return "please try again";
    if (/redirect|uri/i.test(msg)) return "redirect is not configured for this app (see supabase/SETUP.md step 3b)";
    if (/popup|block/i.test(msg)) return "your browser blocked the sign-in window";
    return msg;
  }

  // Refresh the game UI the moment sign-in state changes. On the web the OAuth
  // redirect reloads the page anyway; in the native app nothing reloads, so without
  // this hook Settings keeps saying "not connected" and the Owner Panel tile never
  // appears even though sign-in actually succeeded.
  function notifyAuthUi() {
    if (window.flOnCloudAuth) { try { window.flOnCloudAuth(signedIn()); } catch (e) {} }
  }

  function closeBrowser() {
    try {
      if (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Browser && Capacitor.Plugins.Browser.close) {
        Capacitor.Plugins.Browser.close().catch(function () {});
      }
    } catch (_) {}
  }

  // Handle "com.footballlegend.game://callback?code=…" (PKCE), "#access_token=…" (implicit)
  // and "?error=…&error_code=…&error_description=…" deep links from Supabase.
  // NOTE: error URLs carry `error_code`, whose name contains the substring "code=" —
  // the old naive string-split could mistake it for an auth code and try to exchange
  // garbage. Always parse real query params.
  function handleAuthDeepLink(u) {
    var params = {};
    try {
      var query = "";
      var qi = u.indexOf("?");
      var fi = u.indexOf("#");
      if (qi !== -1) query = u.slice(qi + 1, (fi !== -1 && fi > qi) ? fi : undefined);
      if (fi !== -1) query += (query ? "&" : "") + u.slice(fi + 1);
      new URLSearchParams(query).forEach(function (v, k) { params[k] = v; });
    } catch (_) {}

    if (params.error || params.error_description) {
      closeBrowser();
      toast("Google sign-in failed: " + authError({ message: params.error_description || params.error }));
      return;
    }
    if (params.code) {
      sb.auth.exchangeCodeForSession(params.code).then(function (r) {
        if (r && r.error) throw r.error;
        closeBrowser();
        toast("\u2705 Signed in! Your cloud career is being restored.");
      }).catch(function (err) {
        closeBrowser();
        toast("Sign-in failed: " + authError(err));
      });
      return;
    }
    if (params.access_token && sb.auth.setSession) { // implicit-flow fallback
      sb.auth.setSession({ access_token: params.access_token, refresh_token: params.refresh_token || "" }).then(function (r) {
        if (r && r.error) throw r.error;
        closeBrowser();
        toast("\u2705 Signed in! Your cloud career is being restored.");
      }).catch(function (err) {
        closeBrowser();
        toast("Sign-in failed: " + authError(err));
      });
    }
  }

  // Superuser convenience: a Google account listed in the server-side `admins` table
  // gets the in-game Owner Panel automatically on sign-in — no owner key needed.
  // RLS returns your own row only when you ARE an admin; everyone else gets an empty
  // list. The 7×-tap owner-key flow (Cloud.verifyOwner) remains as the fallback for
  // non-admin testers.
  function maybeAutoOwner() {
    if (!signedIn()) return Promise.resolve(false);
    return fetch(FL_CLOUD_URL + "/rest/v1/admins?select=uid&uid=eq." + session.user.id, {
      headers: { apikey: FL_CLOUD_ANON, authorization: "Bearer " + session.access_token },
    }).then(function (r) { return r.ok ? r.json() : null; }).then(function (rows) {
      var ok = !!(rows && rows.length);
      if (ok) {
        if (window.flOwnerUnlock) { try { window.flOwnerUnlock(); } catch (e) {} }
        toast("\ud83d\udc51 Admin account \u2014 Owner Panel unlocked (main menu)");
      }
      return ok;
    }).catch(function () { return false; });
  }

  function signIn() {
    if (!init()) { toast("Cloud not configured"); return; }
    var isNative = !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());
    if (isNative) {
      toast("Opening Google sign-in\u2026 complete it in the browser \u2014 you'll return to the app automatically");
      sb.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: FL_DEEP_LINK, skipBrowserRedirect: true },
      }).then(function (r) {
        if (r && r.error) throw r.error;
        var url = r && r.data && r.data.url;
        if (!url) { toast("Google sign-in is unavailable. Check your connection."); return; }
        if (Capacitor.Plugins && Capacitor.Plugins.Browser && Capacitor.Plugins.Browser.open) {
          return Capacitor.Plugins.Browser.open({ url: url }).catch(function () { window.open(url, "_system"); });
        }
        window.open(url, "_system");
      }).catch(function (err) { toast("Google sign-in failed: " + authError(err)); });
      return;
    }
    sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: location.origin + location.pathname },
    }).then(function (r) {
      if (r && r.error) throw r.error;
    }).catch(function (err) { toast("Google sign-in failed: " + authError(err)); });
  }

  function signOut() {
    if (sb) sb.auth.signOut();
    session = null;
    notifyAuthUi();
    toast("Signed out \u2014 game continues offline");
  }

  function fn(name, body) { // call an edge function with the user's JWT
    return fetch(FL_CLOUD_URL + "/functions/v1/" + name, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + session.access_token,
        apikey: FL_CLOUD_ANON,
      },
      body: JSON.stringify(body),
    }).then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); });
  }

  function onSignedIn() {
    // register (idempotent) then pull cloud state
    fn("sync-save", { mode: "register", playerId: flPlayerId(), name: (S && S.name) || "Legend" })
      .then(function () { return fn("sync-save", { mode: "pull" }); })
      .then(function (r) {
        if (r.status !== 200) { if (r.body && r.body.error === "banned") toast("Account suspended"); return; }
        handlePull(r.body);
      })
      .catch(function () { /* offline: fine */ });
  }

  function handlePull(data) {
    // 1) cloud gifts -> local gift pipeline (BaL instant / ML queue), then ack
    var gifts = (data && data.gifts) || [];
    if (gifts.length) {
      var ids = [];
      gifts.forEach(function (g) {
        try { flApplyGift(g.gift); ids.push(g.id); } catch (e) {}
      });
      if (ids.length) {
        fn("sync-save", { mode: "claim", ids: ids });
        toast("\ud83c\udf81 " + ids.length + " cloud gift" + (ids.length > 1 ? "s" : "") + " delivered!");
      }
    }
    // 2) newer cloud save -> offer restore (never silently overwrite local)
    var sv = data && data.save;
    if (sv && sv.bal_save && sv.bal_updated) {
      var localSeason = (S && !S.retired) ? (S.season * 100 + S.matchday) : -1;
      var cloudSeason = sv.bal_save.season * 100 + (sv.bal_save.matchday || 0);
      if (cloudSeason > localSeason) {
        if (confirm("A newer cloud save was found (Season " + sv.bal_save.season + "). Restore it on this device?")) {
          S = sv.bal_save; save(); location.reload();
          return;
        }
      }
    }
    if (sv && sv.ml_save && sv.ml_updated && window.ML) {
      try {
        var localM = JSON.parse(localStorage.getItem(ML_CLOUD_KEY) || "null");
        var lms = localM ? localM.season * 100 + (localM.matchday || 0) : -1;
        var cms = sv.ml_save.season * 100 + (sv.ml_save.matchday || 0);
        if (cms > lms && confirm("Newer Master League cloud save found (Season " + sv.ml_save.season + "). Restore?")) {
          localStorage.setItem(ML_CLOUD_KEY, JSON.stringify(sv.ml_save));
          if (window.flMirror) flMirror(ML_CLOUD_KEY, JSON.stringify(sv.ml_save));
          location.reload();
        }
      } catch (e) {}
    }
  }

  function push(mode) { // called after matchdays / season ends; silent, throttled
    if (!signedIn()) return;
    var now = Date.now();
    if (now - lastSync[mode] < SYNC_COOLDOWN) return;
    lastSync[mode] = now;
    var payload = null;
    if (mode === "bal" && window.S && !S.retired) payload = S;
    if (mode === "ml") { try { payload = JSON.parse(localStorage.getItem(ML_CLOUD_KEY) || "null"); } catch (e) {} }
    if (!payload) return;
    fn("sync-save", { mode: mode, save: payload }).then(function (r) {
      if (r.status === 422) console.warn("cloud rejected save:", r.body.reasons); // flagged server-side
    }).catch(function () {});
  }

  function redeemOnline(code) { // server-first; caller falls back to offline flRedeem
    if (!signedIn()) return Promise.resolve(null);
    return fn("redeem-code", { code: code }).then(function (r) {
      if (r.status === 200) return { ok: true, msg: "Code redeemed! Check your gifts." };
      if (r.status === 404) return null; // unknown to server -> try offline codes
      return { ok: false, msg: (r.body && r.body.error) || "Redeem failed" };
    }).catch(function () { return null; });
  }

  function fetchEvents() { // live-ops events; merged with built-in FL_GIFT_EVENTS
    if (!enabled()) return Promise.resolve([]);
    return fetch(FL_CLOUD_URL + "/rest/v1/events?active=eq.true&select=*", {
      headers: { apikey: FL_CLOUD_ANON, authorization: "Bearer " + FL_CLOUD_ANON },
    }).then(function (r) { return r.json(); }).then(function (rows) {
      if (!Array.isArray(rows)) return [];
      return rows.map(function (e) {
        var p = e.payload || {};
        return { id: "cloud:" + e.id, title: e.title, from: e.starts_at, to: e.ends_at,
                 gp: p.gp || 0, lc: p.lc || 0, mlgp: p.mlgp || 0, mllc: p.mllc || 0, pl: p.pl || null };
      });
    }).catch(function () { return []; });
  }

  function fetchBroadcast() {
    if (!enabled()) return Promise.resolve(null);
    var today = new Date().toISOString().slice(0, 10);
    return fetch(FL_CLOUD_URL + "/rest/v1/broadcasts?starts_at=lte." + today + "&ends_at=gte." + today +
      "&select=message&order=created_at.desc&limit=1", {
      headers: { apikey: FL_CLOUD_ANON, authorization: "Bearer " + FL_CLOUD_ANON },
    }).then(function (r) { return r.json(); })
      .then(function (rows) { return rows && rows[0] ? rows[0].message : null; })
      .catch(function () { return null; });
  }

  // full news inbox (last 30 announcements, active or recent)
  function fetchBroadcasts() {
    if (!enabled()) return Promise.resolve([]);
    return fetch(FL_CLOUD_URL + "/rest/v1/broadcasts?select=id,message,starts_at,ends_at,created_at&order=created_at.desc&limit=30", {
      headers: { apikey: FL_CLOUD_ANON, authorization: "Bearer " + FL_CLOUD_ANON },
    }).then(function (r) { return r.json(); })
      .then(function (rows) { return Array.isArray(rows) ? rows : []; })
      .catch(function () { return []; });
  }

  function fetchLeaderboard(mode) { // "bal" | "ml" — public RPC, works signed-out
    if (!enabled()) return Promise.resolve(null);
    return fetch(FL_CLOUD_URL + "/rest/v1/rpc/leaderboard_" + mode, {
      method: "POST",
      headers: { apikey: FL_CLOUD_ANON, authorization: "Bearer " + FL_CLOUD_ANON, "content-type": "application/json" },
      body: JSON.stringify({ lim: 50 }),
    }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }

  // Ghost PvP opponents: sanitized public cards from validated ML cloud saves
  function fetchGhosts() {
    if (!enabled()) return Promise.resolve(null);
    return fetch(FL_CLOUD_URL + "/rest/v1/rpc/leaderboard_ghosts", {
      method: "POST",
      headers: { apikey: FL_CLOUD_ANON, authorization: "Bearer " + FL_CLOUD_ANON, "content-type": "application/json" },
      body: JSON.stringify({ lim: 40 }),
    }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }

  // season boards (monthly snapshots)
  function fetchSeasonBoard(mode, seasonId) {
    if (!enabled()) return Promise.resolve(null);
    return fetch(FL_CLOUD_URL + "/rest/v1/rpc/leaderboard_season", {
      method: "POST",
      headers: { apikey: FL_CLOUD_ANON, authorization: "Bearer " + FL_CLOUD_ANON, "content-type": "application/json" },
      body: JSON.stringify({ mode: mode, season_id: seasonId || null, lim: 50 }),
    }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }

  function fetchSeasons() {
    if (!enabled()) return Promise.resolve([]);
    return fetch(FL_CLOUD_URL + "/rest/v1/seasons?select=id,label,starts_at,ends_at,closed&order=starts_at.desc&limit=24", {
      headers: { apikey: FL_CLOUD_ANON, authorization: "Bearer " + FL_CLOUD_ANON },
    }).then(function (r) { return r.json(); })
      .then(function (rows) { return Array.isArray(rows) ? rows : []; })
      .catch(function () { return []; });
  }

  // Owner-key verification is SERVER-SIDE. The hash never ships in the APK.
  // Requires signed-in Google account. Falls back to null offline.
  function verifyOwner(key) {
    if (!signedIn()) return Promise.resolve({ ok: false, msg: "Sign in first (Settings) to unlock owner mode" });
    return fn("verify-owner", { key: String(key || "") }).then(function (r) {
      if (r.status === 200 && r.body && r.body.ok) return { ok: true, token: r.body.token || true };
      return { ok: false, msg: (r.body && r.body.error) || "Wrong key" };
    }).catch(function () { return { ok: false, msg: "Network error" }; });
  }

  function accountEmail() { return signedIn() ? (session.user.email || "Google account") : null; }

  return { init: init, enabled: enabled, signedIn: signedIn, signIn: signIn, signOut: signOut,
           push: push, redeemOnline: redeemOnline, fetchEvents: fetchEvents,
           fetchBroadcast: fetchBroadcast, fetchBroadcasts: fetchBroadcasts,
           fetchLeaderboard: fetchLeaderboard, fetchGhosts: fetchGhosts,
           fetchSeasonBoard: fetchSeasonBoard, fetchSeasons: fetchSeasons,
           verifyOwner: verifyOwner, checkAdmin: maybeAutoOwner, accountEmail: accountEmail };
})();

// boot: harmless when unconfigured
try { Cloud.init(); } catch (e) {}
