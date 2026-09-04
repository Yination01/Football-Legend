"use strict";
// ============================ FOOTBALL LEGEND \u00b7 CLOUD (Supabase) ============================
// Optional Google sign-in + validated cloud save sync + server gifts/codes/events.
// The game NEVER requires this: every function degrades to offline behaviour.

// Filled in from FIREBASE/SUPABASE setup (see supabase/SETUP.md). Empty = cloud disabled.
var FL_CLOUD_URL = "https://cdrcibinjssyqdufeqmk.supabase.co";
var FL_CLOUD_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNkcmNpYmluanNzeXFkdWZlcW1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1NDgzNzUsImV4cCI6MjEwNDEyNDM3NX0.BjU1Kxs-ekhGziInrAKUQ4TDrR6Iy4btwTyjMtkHuAI"; // anon key: safe to ship, RLS enforces security

var ML_CLOUD_KEY = "footballLegendML_v1";
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
      // Native app: OAuth must run in the system browser (Google blocks WebViews); deep link returns here
      if (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.App) {
        Capacitor.Plugins.App.addListener("appUrlOpen", function (ev) {
          var u = ev && ev.url ? ev.url : "";
          if (u.indexOf("://callback") !== -1 && u.indexOf("code=") !== -1) {
            var code = (u.split("code=")[1] || "").split("&")[0];
            sb.auth.exchangeCodeForSession(code).then(function () {
              if (Capacitor.Plugins.Browser) Capacitor.Plugins.Browser.close().catch(function () {});
              toast("\u2705 Signed in!");
            }).catch(function () { toast("Sign-in failed \u2014 try again"); });
          }
        });
      }
      sb.auth.onAuthStateChange(function (_ev, s) {
        session = s;
        if (s && s.user) onSignedIn();
      });
      sb.auth.getSession().then(function (r) {
        session = r.data.session;
        if (session) onSignedIn();
      });
    }
    return true;
  }

  function signIn() {
    if (!init()) { toast("Cloud not configured"); return; }
    var isNative = !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());
    if (isNative) {
      sb.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: "com.footballlegend.game://callback", skipBrowserRedirect: true },
      }).then(function (r) {
        var url = r && r.data && r.data.url;
        if (!url) { toast("Sign-in unavailable"); return; }
        if (Capacitor.Plugins && Capacitor.Plugins.Browser) Capacitor.Plugins.Browser.open({ url: url });
        else window.open(url, "_system");
      });
      return;
    }
    sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: location.origin + location.pathname },
    });
  }

  function signOut() {
    if (sb) sb.auth.signOut();
    session = null;
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

  function accountEmail() { return signedIn() ? (session.user.email || "Google account") : null; }

  return { init: init, enabled: enabled, signedIn: signedIn, signIn: signIn, signOut: signOut,
           push: push, redeemOnline: redeemOnline, fetchEvents: fetchEvents,
           fetchBroadcast: fetchBroadcast, accountEmail: accountEmail };
})();

// boot: harmless when unconfigured
try { Cloud.init(); } catch (e) {}
