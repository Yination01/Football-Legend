// POST /functions/v1/sync-save  (auth: user JWT)
// Body: { mode: "bal"|"ml", save: {...} }  — validates then stores; rejects cheats.
// Also: { mode: "pull" } — returns both cloud saves + unclaimed inbox + touch profile.
import { createClient } from "jsr:@supabase/supabase-js@2";

// ---- inlined validators (from _shared/validate.ts) ----
// Server-side save validation — the anti-cheat gate.
// A save that fails hard checks is REJECTED (not stored) and the player is flagged.

type Verdict = { ok: boolean; reasons: string[] };

const STAT_KEYS = ["spd","sho","pas","dri","def","phy"]; // superset; missing keys ignored

function num(x: unknown): number { return typeof x === "number" && isFinite(x) ? x : NaN; }

// ---------- Become a Legend ----------
function validateBal(s: any, prev: any | null): Verdict {
  const r: string[] = [];
  if (!s || typeof s !== "object") return { ok: false, reasons: ["not an object"] };

  const season = num(s.season), gp = num(s.gp), lc = num(s.nl), age = num(s.age);
  if (!(season >= 1 && season <= 60)) r.push("season out of range");
  if (!(age >= 16 && age <= 45)) r.push("age out of range");
  if (!isNaN(season) && !isNaN(age) && age > 16 + season + 1) r.push("age/season mismatch");

  // stat caps: nothing above 99, nothing below 1
  const stats = s.stats || {};
  for (const k of Object.keys(stats)) {
    const v = num(stats[k]);
    if (!(v >= 1 && v <= 99)) { r.push("stat " + k + " out of range"); break; }
  }

  // currency ceiling: generous theoretical max per season played
  // (league + cup + CT + awards + gifts + transfers can't plausibly exceed this)
  const MAX_GP_PER_SEASON = 60000, MAX_LC_PER_SEASON = 600;
  if (gp > 20000 + season * MAX_GP_PER_SEASON) r.push("GP exceeds theoretical max");
  if (lc > 300 + season * MAX_LC_PER_SEASON) r.push("LC exceeds theoretical max");

  // apps can't exceed matches available per season (league 18 + cup ~5 + CT ~6 + friendlies slack)
  const apps = num(s.myStats?.apps ?? s.apps);
  if (!isNaN(apps) && !isNaN(season) && apps > season * 40) r.push("apps exceed possible matches");
  const goals = num(s.myStats?.goals ?? s.goals);
  if (!isNaN(goals) && !isNaN(apps) && goals > apps * 6 + 10) r.push("goals-per-app impossible");

  // monotonic progression vs previous cloud save
  if (prev && typeof prev === "object") {
    if (num(prev.season) > season) r.push("season went backwards");
    const pApps = num(prev.myStats?.apps ?? prev.apps);
    if (!isNaN(pApps) && !isNaN(apps) && apps < pApps) r.push("career apps went backwards");
  }
  return { ok: r.length === 0, reasons: r };
}

// ---------- Master League ----------
function validateMl(m: any, prev: any | null): Verdict {
  const r: string[] = [];
  if (!m || typeof m !== "object") return { ok: false, reasons: ["not an object"] };

  const season = num(m.season), budget = num(m.budget), lc = num(m.lc);
  if (!(season >= 1 && season <= 60)) r.push("season out of range");

  // budget ceiling (gate receipts + prizes + sales per season, generous)
  const MAX_M_PER_SEASON = 400;
  if (budget > 100 + season * MAX_M_PER_SEASON) r.push("budget exceeds theoretical max");
  if (lc > 200 + season * 400) r.push("LC exceeds theoretical max");

  const squad = Array.isArray(m.squad) ? m.squad : [];
  if (squad.length > 60) r.push("squad too large");
  for (const p of squad) {
    const ovr = num(p?.ovr), pAge = num(p?.age);
    if (!(ovr >= 40 && ovr <= 99)) { r.push("player OVR out of range"); break; }
    if (!(pAge >= 15 && pAge <= 45)) { r.push("player age out of range"); break; }
    if (Array.isArray(p?.skills) && p.skills.length > 4) { r.push("player has >4 skills"); break; }
  }

  if (prev && typeof prev === "object") {
    if (num(prev.season) > season) r.push("season went backwards");
  }
  return { ok: r.length === 0, reasons: r };
}

// ---- end validators ----


const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const J = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("authorization") ?? "";
    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { authorization: auth } },
    });
    const { data: { user } } = await anon.auth.getUser();
    if (!user) return J({ error: "unauthenticated" }, 401);

    // service client bypasses RLS — all writes flow through here so validation can't be skipped
    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: prof } = await svc.from("profiles").select("banned").eq("uid", user.id).maybeSingle();
    if (prof?.banned) return J({ error: "banned" }, 403);

    const body = await req.json();
    const now = new Date().toISOString();

    if (body.mode === "pull") {
      await svc.from("profiles").update({ last_seen: now }).eq("uid", user.id);
      await svc.rpc("bump_stat", { col: "dau" }); // approximation: one pull per session
      const { data: save } = await svc.from("saves").select("*").eq("uid", user.id).maybeSingle();
      const { data: gifts } = await svc.from("inbox").select("id,gift,created_at")
        .eq("uid", user.id).eq("claimed", false).order("created_at");
      return J({ save: save ?? null, gifts: gifts ?? [] });
    }

    if (body.mode === "claim") { // mark inbox gifts consumed (client applies them locally)
      const ids: string[] = Array.isArray(body.ids) ? body.ids.slice(0, 50) : [];
      if (ids.length) {
        await svc.from("inbox").update({ claimed: true, claimed_at: now })
          .in("id", ids).eq("uid", user.id);
      }
      return J({ ok: true });
    }

    if (body.mode === "register") { // first sign-in: bind Player ID
      const pid = String(body.playerId ?? "").trim();
      const name = String(body.name ?? "Legend").slice(0, 24);
      if (!/^FL-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(pid)) return J({ error: "bad player id" }, 400);
      const { error } = await svc.from("profiles")
        .upsert({ uid: user.id, player_id: pid, name, last_seen: now }, { onConflict: "uid" });
      if (error) return J({ error: "player id taken" }, 409);
      await svc.from("saves").upsert({ uid: user.id }, { onConflict: "uid" });
      await svc.rpc("bump_stat", { col: "new_users" });
      return J({ ok: true });
    }

    if (body.mode === "bal" || body.mode === "ml") {
      const { data: row } = await svc.from("saves").select("*").eq("uid", user.id).maybeSingle();
      const prev = body.mode === "bal" ? row?.bal_save : row?.ml_save;
      const v = body.mode === "bal" ? validateBal(body.save, prev) : validateMl(body.save, prev);
      if (!v.ok) {
        await svc.from("flags").insert({ uid: user.id, reason: "save rejected (" + body.mode + ")", detail: { reasons: v.reasons } });
        await svc.from("saves").upsert(
          { uid: user.id, flag_count: (row?.flag_count ?? 0) + 1 }, { onConflict: "uid" });
        return J({ error: "save failed validation", reasons: v.reasons }, 422);
      }
      const patch: Record<string, unknown> = { uid: user.id };
      if (body.mode === "bal") { patch.bal_save = body.save; patch.bal_updated = now; }
      else { patch.ml_save = body.save; patch.ml_updated = now; }
      await svc.from("saves").upsert(patch, { onConflict: "uid" });
      await svc.rpc("bump_stat", { col: "syncs" });
      return J({ ok: true, at: now });
    }

    return J({ error: "unknown mode" }, 400);
  } catch (e) {
    return J({ error: String(e) }, 500);
  }
});
