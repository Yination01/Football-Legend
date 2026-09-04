// POST /functions/v1/redeem-code  (auth: user JWT)
// Body: { code: "TEMPLATE-SERIAL-CHECK" }
// Server-authoritative redemption: global single/multi-use, expiry, per-user dedupe.
// Payout is written to the user's inbox; the game drains it like any other gift.
import { createClient } from "jsr:@supabase/supabase-js@2";

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

    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: prof } = await svc.from("profiles").select("banned").eq("uid", user.id).maybeSingle();
    if (prof?.banned) return J({ error: "banned" }, 403);

    const code = String((await req.json()).code ?? "").trim().toUpperCase();
    if (!/^[A-Z0-9]{3,16}-[A-Z0-9]{2,8}-[A-Z0-9]{2,8}$/.test(code)) return J({ error: "Invalid code format" }, 400);

    const { data: c } = await svc.from("codes").select("*").eq("code", code).maybeSingle();
    if (!c) return J({ error: "Unknown code" }, 404);
    if (c.expires_at && new Date(c.expires_at) < new Date()) return J({ error: "Code expired" }, 410);
    if (c.uses >= c.max_uses) return J({ error: "Code fully used" }, 410);

    // per-user dedupe (PK on code+uid makes this race-safe)
    const { error: dup } = await svc.from("code_redemptions").insert({ code, uid: user.id });
    if (dup) return J({ error: "You already used this code" }, 409);

    // atomic global counter guard
    const { data: bumped } = await svc.from("codes")
      .update({ uses: c.uses + 1 }).eq("code", code).eq("uses", c.uses).select().maybeSingle();
    if (!bumped) {
      await svc.from("code_redemptions").delete().eq("code", code).eq("uid", user.id);
      return J({ error: "Code fully used" }, 410);
    }

    await svc.from("inbox").insert({ uid: user.id, gift: { ...c.payload, note: "Code " + code } });
    return J({ ok: true, gift: c.payload });
  } catch (e) {
    return J({ error: String(e) }, 500);
  }
});
