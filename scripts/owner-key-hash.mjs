#!/usr/bin/env node
/**
 * owner-key-hash.mjs — compute the OWNER_KEY_HASH secret for the verify-owner edge function.
 *
 * The in-game Owner Panel key is verified server-side: Supabase → Edge Functions → Secrets
 * holds OWNER_KEY_HASH = hashSeed("flown:" + yourKey) as a decimal string. The client never
 * ships the key. Setting the secret wrong (or not deploying verify-owner) is the classic
 * reason the Owner Panel cannot be unlocked.
 *
 * Usage:
 *   node scripts/owner-key-hash.mjs <your-secret-owner-key>
 *
 * Then paste the printed number into:
 *   Supabase Dashboard → Edge Functions → verify-owner → Secrets → OWNER_KEY_HASH
 *
 * Lovingly lockstep with hashSeed() in game/engine.js and in
 * game/supabase/functions/verify-owner/index.ts — enforced by game/test-v15.js
 * ("hashSeed lockstep").
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const E = require("../game/engine.js");

const key = (process.argv[2] || "").trim();

if (!key) {
  console.error("usage: node scripts/owner-key-hash.mjs <your-secret-owner-key>");
  console.error("");
  console.error("Pick any key only you know (e.g. a short passphrase). The game asks for it");
  console.error("after 7 taps on the Player ID row in Settings — while signed in with Google.");
  console.error("NOTE: accounts in the `admins` table unlock the Owner Panel automatically at");
  console.error("sign-in and never need this key.");
  process.exit(1);
}

const hash = E.hashSeed("flown:" + key) >>> 0;
console.log(String(hash));
console.error(`\nOWNER_KEY_HASH for key "${key}" is ${hash}`);
console.error("Set it: Supabase → Edge Functions → Secrets → OWNER_KEY_HASH = " + hash);
console.error("(If unset on the server, verify-owner falls back to the legacy default 1728818593.)");
