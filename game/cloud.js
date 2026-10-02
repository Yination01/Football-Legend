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
  var admin = false;        // server-confirmed membership in public.admins
  var authCallbackBusy = false;
  var lastSync = { bal: 0, ml: 0 };
  var SYNC_COOLDOWN = 90 * 1000; // min ms between pushes per mode (quota safety)

  function enabled() { return !!(FL_CLOUD_URL && FL_CLOUD_ANON && window.supabase); }
  function signedIn() { return !!(session && session.user); }

  function init() {
    if (!enabled()) return false;
    if (!sb) {
      sb = window.supabase.createClient(FL_CLOUD_URL, FL_CLOUD_ANON, { auth: { flowType: "pkce", detectSessionInUrl: true } });
      // Native app: OAuth must run in the system browser (Google blocks WebViews).
      // Handle both a warm return and a cold start caused by the callback.
      if (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.App) {
        Capacitor.Plugins.App.addListener("appUrlOpen", function (ev) {
          processAuthUrl(ev && ev.url);
        });
        if (Capacitor.Plugins.App.getLaunchUrl) {
          Capacitor.Plugins.App.getLaunchUrl().then(function (r) {
            if (r && r.url) processAuthUrl(r.url);
          }).catch(function () {});
        }
      }
      sb.auth.onAuthStateChange(function (_ev, s) {
        session = s;
        if (s && s.user) onSignedIn();
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

  function processAuthUrl(rawUrl) {
    if (!rawUrl || authCallbackBusy || !sb) return;
    var u;
    try { u = new URL(rawUrl); } catch (_) { toast("Google sign-in returned an invalid callback."); return; }
    if (u.protocol !== "com.footballlegend.game:" || u.hostname !== "callback") return;
    var oauthError = u.searchParams.get("error_description") || u.searchParams.get("error");
    if (oauthError) { toast("Google sign-in failed: " + authError({ message: oauthError })); return; }
    var code = u.searchParams.get("code");
    if (!code) { toast("Google sign-in returned without an authorization code."); return; }
    authCallbackBusy = true;
    sb.auth.exchangeCodeForSession(code).then(function (r) {
      if (r && r.error) throw r.error;
      if (Capacitor.Plugins && Capacitor.Plugins.Browser) Capacitor.Plugins.Browser.close().catch(function () {});
      toast("\u2705 Signed in! Your cloud career is being restored.");
    }).catch(function (err) {
      toast("Sign-in failed: " + authError(err));
    }).then(function () { authCallbackBusy = false; });
  }

  function authError(err) {
    var msg = err && (err.message || err.error_description || err.error);
    if (!msg) return "please try again";
    if (/redirect|uri/i.test(msg)) return "redirect is not configured for this app";
    if (/popup|block/i.test(msg)) return "your browser blocked the sign-in window";
    return msg;
  }

  function signIn() {
    if (!init()) { toast("Cloud not configured"); return; }
    var isNative = !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());
    if (isNative) {
      sb.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: "com.footballlegend.game://callback", skipBrowserRedirect: true },
      }).then(function (r) {
        if (r && r.error) throw r.error;
        var url = r && r.data && r.data.url;
        if (!url) { toast("Google sign-in is unavailable. Check your connection."); return; }
        if (Capacitor.Plugins && Capacitor.Plugins.Browser) return Capacitor.Plugins.Browser.open({ url: url });
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
    admin = false;
    if (typeof getSet === "function" && typeof setSet === "function" && getSet().ownerSource === "admin") {
      setSet("ownerMode", false);
      setSet("ownerSource", null);
    }
    toast("Signed out \u2014 game continues offline");
  }

  function ensureSession() {
    if (!sb) return Promise.resolve(session);
    return sb.auth.getSession().then(function (r) {
      if (r && r.data && r.data.session) {
        session = r.data.session;
      }
      return session;
    }).catch(function () {
      return session;
    });
  }

  function fn(name, body) { // call an edge function with the user's JWT
    return ensureSession().then(function (sess) {
      var token = (sess && sess.access_token) ? sess.access_token : "";
      return fetch(FL_CLOUD_URL + "/functions/v1/" + name, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer " + token,
          apikey: FL_CLOUD_ANON,
        },
        body: JSON.stringify(body),
      }).then(function (r) {
        return r.text().then(function (t) {
          var j = null;
          try { j = JSON.parse(t); } catch (_) {}
          return { status: r.status, body: j, raw: t };
        });
      });
    });
  }

  function checkAdmin() {
    if (!signedIn() || !sb) return Promise.resolve(false);
    return sb.from("admins").select("uid").eq("uid", session.user.id).maybeSingle().then(function (r) {
      admin = !r.error && !!r.data;
      if (admin && typeof setSet === "function") {
        setSet("ownerMode", true);
        setSet("ownerSource", "admin");
        if (typeof render === "function" && typeof menuScreen === "function") render(menuScreen);
      }
      return admin;
    }).catch(function () { admin = false; return false; });
  }

  function onSignedIn() {
    // Server-confirmed admins receive the in-app owner surface automatically.
    checkAdmin();
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
    // 2) cloud save found -> offer restore (never silently overwrite local)
    var sv = data && data.save;
    if (sv && (sv.bal_save || sv.ml_save)) {
      var localSeason = (window.S && !S.retired) ? (S.season * 100 + (S.matchday || 0)) : -1;
      var cloudSeason = sv.bal_save ? (sv.bal_save.season * 100 + (sv.bal_save.matchday || 0)) : -1;
      var isFreshLocal = !window.S || S.retired || (S.season === 1 && (S.matchday || 0) <= 2);
      if (cloudSeason > localSeason || isFreshLocal) {
        var balName = sv.bal_save ? sv.bal_save.name : "Player";
        var balSeason = sv.bal_save ? sv.bal_save.season : 1;
        var msg = "\u2601\ufe0f Cloud save found: " + balName + " (Season " + balSeason + ").\n\nRestore this career on this device?";
        if (confirm(msg)) {
          if (sv.bal_save) {
            window.S = sv.bal_save;
            if (typeof save === "function") save();
            else localStorage.setItem(SAVE_KEY, JSON.stringify(sv.bal_save));
            if (window.flMirror) flMirror(SAVE_KEY, JSON.stringify(sv.bal_save));
          }
          if (sv.ml_save) {
            localStorage.setItem(ML_CLOUD_KEY, JSON.stringify(sv.ml_save));
            if (window.flMirror) flMirror(ML_CLOUD_KEY, JSON.stringify(sv.ml_save));
          }
          toast("\u2705 Cloud career restored! Reloading...");
          setTimeout(function () { location.reload(); }, 600);
          return;
        }
      }
    }
  }

  function checkCloudStatus() {
    if (!signedIn()) return Promise.resolve({ ok: false, msg: "Not signed in" });
    return ensureSession().then(function () {
      return sb.from("saves").select("bal_save, ml_save, bal_updated, ml_updated").eq("uid", session.user.id).maybeSingle()
        .then(function (res) {
          if (res.error) return { ok: false, error: res.error.message };
          var sv = res.data;
          if (!sv || (!sv.bal_save && !sv.ml_save)) {
            return { ok: true, found: false };
          }
          var parts = [];
          if (sv.bal_save) parts.push("BaL (S" + (sv.bal_save.season || 1) + ")");
          if (sv.ml_save) parts.push("ML (S" + (sv.ml_save.season || 1) + ")");
          return { ok: true, found: true, summary: parts.join(" · ") || "Cloud save on file" };
        });
    }).catch(function (err) {
      return { ok: false, error: (err && err.message) || "Connection error" };
    });
  }

  function restoreCloudSave() {
    if (!signedIn()) {
      alert("⚠️ Not Signed In\n\nPlease sign in with your Google account in Settings > Account before attempting to restore a cloud save.");
      return Promise.resolve(false);
    }
    toast("⏳ Checking cloud save...");
    return ensureSession().then(function () {
      return sb.from("saves").select("bal_save, ml_save, bal_updated, ml_updated").eq("uid", session.user.id).maybeSingle()
        .then(function (res) {
          if (!res.error && res.data) {
            return res.data;
          }
          return fn("sync-save", { mode: "pull" }).then(function (r) {
            if (r.status === 401) throw new Error("session_expired");
            if (r.status !== 200) {
              var errDetail = (r.body && r.body.error) || ("Server HTTP " + r.status);
              throw new Error(errDetail);
            }
            return (r.body && r.body.save) || null;
          });
        });
    }).then(function (sv) {
      var email = accountEmail() || "Google account";
      var bal = sv && sv.bal_save;
      var ml = sv && sv.ml_save;

      if (!sv || (!bal && !ml)) {
        alert("ℹ️ No Cloud Save on File\n\nConnected Account: " + email + "\n\nThere is currently no saved career in the cloud for this Google account.\n\nWhy this happens:\n• If your save is on another device: open Football Legend on that device and tap 'SYNC TO CLOUD' to upload it first.\n• If you started a career on this device: tap 'SYNC TO CLOUD' to create your cloud backup.\n• If you have multiple Google accounts: check if you signed into the right one.");
        return false;
      }

      var parts = [];
      if (bal) {
        var balDate = sv.bal_updated ? (" · Saved: " + new Date(sv.bal_updated).toLocaleDateString()) : "";
        parts.push("⚽ BaL Player: " + (bal.name || "Legend") + " (Season " + (bal.season || 1) + ", Matchday " + (bal.matchday || 1) + ", " + (bal.pos || "") + " OVR " + (bal.ovr || "?") + balDate + ")");
      }
      if (ml) {
        var mlDate = sv.ml_updated ? (" · Saved: " + new Date(sv.ml_updated).toLocaleDateString()) : "";
        var trophies = (ml.career || []).filter(function (c) { return c.pos === 1 || c.cup === "WON"; }).length;
        parts.push("🏆 Master League: " + (ml.clubName || "Club") + " (Season " + (ml.season || 1) + ", Trophies: " + trophies + mlDate + ")");
      }

      var msg = "☁️ Cloud Save Found!\n\nAccount: " + email + "\n\n" + parts.join("\n\n") + "\n\n⚠️ OVERWRITE WARNING:\nRestoring will replace your current local progress on this device with the cloud save.\n\nDo you want to restore this career?";
      if (confirm(msg)) {
        if (bal) {
          window.S = bal;
          if (typeof save === "function") save();
          else localStorage.setItem(SAVE_KEY, JSON.stringify(bal));
          if (window.flMirror) flMirror(SAVE_KEY, JSON.stringify(bal));
        }
        if (ml) {
          localStorage.setItem(ML_CLOUD_KEY, JSON.stringify(ml));
          if (window.flMirror) flMirror(ML_CLOUD_KEY, JSON.stringify(ml));
        }
        toast("✅ Cloud save restored! Reloading...");
        setTimeout(function () { location.reload(); }, 600);
        return true;
      }
      return false;
    }).catch(function (err) {
      var msg = (err && err.message) || String(err || "");
      if (msg === "session_expired" || /jwt|unauthenticated|token/i.test(msg)) {
        alert("🔒 Session Expired\n\nYour Google account authentication has expired.\n\nPlease tap 'SIGN OUT' in Settings > Account, then tap 'SIGN IN WITH GOOGLE' to refresh your session.");
      } else if (!navigator.onLine || /network|fetch|offline/i.test(msg)) {
        alert("📡 Connection Error\n\nCould not reach cloud servers. Please check your internet connection and try again.");
      } else {
        alert("❌ Cloud Restore Error\n\nCould not restore cloud save.\nReason: " + msg + "\n\nPlease check your internet connection or try signing out and signing in again.");
      }
      return false;
    });
  }

  function syncNow() {
    if (!signedIn()) {
      alert("⚠️ Not Signed In\n\nPlease sign in with your Google account in Settings > Account before syncing to cloud.");
      return Promise.resolve(false);
    }
    var balPayload = (window.S && !S.retired) ? S : null;
    var mlPayload = null;
    try { mlPayload = JSON.parse(localStorage.getItem(ML_CLOUD_KEY) || "null"); } catch (e) {}
    if (!balPayload && !mlPayload) {
      alert("⚠️ Nothing to Sync\n\nNo active BaL player or Master League club found on this phone to upload. Start a career first!");
      return Promise.resolve(false);
    }
    toast("⏳ Backing up career to cloud...");
    return ensureSession().then(function () {
      var promises = [];
      if (balPayload) promises.push(fn("sync-save", { mode: "bal", save: balPayload }));
      if (mlPayload) promises.push(fn("sync-save", { mode: "ml", save: mlPayload }));
      return Promise.all(promises).then(function (results) {
        for (var i = 0; i < results.length; i++) {
          var r = results[i];
          if (r.status === 422) {
            var reasons = (r.body && r.body.reasons) ? r.body.reasons.join(", ") : "Validation failed";
            alert("❌ Cloud Sync Rejected\n\nThe server rejected your career:\n" + reasons);
            return false;
          }
          if (r.status === 401) {
            alert("🔒 Session Expired\n\nYour sign-in session expired. Please sign out and sign in again.");
            return false;
          }
          if (r.status !== 200) {
            var err = (r.body && r.body.error) || ("HTTP " + r.status);
            alert("❌ Cloud Sync Failed\n\nServer returned: " + err);
            return false;
          }
        }
        lastSync.bal = Date.now();
        lastSync.ml = Date.now();
        var email = accountEmail() || "Google account";
        var items = [];
        if (balPayload) items.push("BaL: " + balPayload.name + " (Season " + balPayload.season + ")");
        if (mlPayload) items.push("ML: " + (mlPayload.clubName || "Club") + " (Season " + mlPayload.season + ")");
        alert("✅ Cloud Backup Successful!\n\nUploaded to " + email + ":\n• " + items.join("\n• ") + "\n\nYour career is now securely saved online and can be restored on any device.");
        return true;
      });
    }).catch(function (err) {
      var msg = (err && err.message) || String(err || "");
      if (!navigator.onLine || /network|fetch|offline/i.test(msg)) {
        alert("📡 Connection Error\n\nCould not reach cloud servers. Please check your internet connection.");
      } else {
        alert("❌ Cloud Sync Failed\n\nError: " + msg);
      }
      return false;
    });
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
  function isAdmin() { return admin; }

  return { init: init, enabled: enabled, signedIn: signedIn, signIn: signIn, signOut: signOut,
           push: push, redeemOnline: redeemOnline, fetchEvents: fetchEvents,
           fetchBroadcast: fetchBroadcast, fetchBroadcasts: fetchBroadcasts,
           fetchLeaderboard: fetchLeaderboard, fetchGhosts: fetchGhosts,
           fetchSeasonBoard: fetchSeasonBoard, fetchSeasons: fetchSeasons,
           verifyOwner: verifyOwner, checkAdmin: checkAdmin, isAdmin: isAdmin,
           accountEmail: accountEmail, restoreCloudSave: restoreCloudSave, syncNow: syncNow,
           checkCloudStatus: checkCloudStatus };
})();

// boot: harmless when unconfigured
try { Cloud.init(); } catch (e) {}
