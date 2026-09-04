// POST /functions/v1/sync-save  (auth: user JWT)
// Body: { mode: "bal"|"ml", save: {...} }  — validates then stores; rejects cheats.
// Also: { mode: "pull" } — returns both cloud saves + unclaimed inbox + touch profile.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { validateBal, validateMl } from "../_shared/validate.ts";

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
