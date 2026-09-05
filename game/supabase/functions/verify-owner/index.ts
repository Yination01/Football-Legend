// POST /functions/v1/verify-owner  (auth: user JWT)
// Body: { key: "..." }
// Owner key is NEVER shipped in the client. Server holds OWNER_KEY_HASH
// (set in Supabase → Edge Functions → Secrets: OWNER_KEY_HASH = hashSeed("flown:"+key) as decimal string).
// Default hash matches the legacy offline key so existing unlocks keep working after deploy.
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const J = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });

// Same algorithm as engine.js hashSeed — must stay in lockstep.
function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h ^= h >>> 16) >>> 0;
}

// Legacy default = hashSeed("flown:" + <original owner key>). Override via secret.
const DEFAULT_HASH = 1728818593;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("authorization") ?? "";
    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { authorization: auth } },
    });
    const { data: { user } } = await anon.auth.getUser();
    if (!user) return J({ error: "Sign in first" }, 401);

    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: prof } = await svc.from("profiles").select("banned").eq("uid", user.id).maybeSingle();
    if (prof?.banned) return J({ error: "banned" }, 403);

    const body = await req.json();
    const key = String(body.key ?? "").trim();
    if (!key || key.length > 64) return J({ error: "Wrong key" }, 403);

    const want = Number(Deno.env.get("OWNER_KEY_HASH") || DEFAULT_HASH) >>> 0;
    const got = hashSeed("flown:" + key) >>> 0;
    if (got !== want) {
      // soft rate-limit signal into flags (not a ban)
      await svc.from("flags").insert({ uid: user.id, reason: "owner key rejected", detail: { at: new Date().toISOString() } });
      return J({ error: "Wrong key" }, 403);
    }

    // mark profile as owner-verified (optional column; ignore if missing)
    try {
      await svc.from("profiles").update({ last_seen: new Date().toISOString() }).eq("uid", user.id);
    } catch (_) { /* ok */ }

    return J({ ok: true, token: "owner:" + user.id.slice(0, 8) });
  } catch (e) {
    return J({ error: String(e) }, 500);
  }
});
