// Server-side save validation — the anti-cheat gate.
// A save that fails hard checks is REJECTED (not stored) and the player is flagged.

export type Verdict = { ok: boolean; reasons: string[] };

const STAT_KEYS = ["spd","sho","pas","dri","def","phy"]; // superset; missing keys ignored

function num(x: unknown): number { return typeof x === "number" && isFinite(x) ? x : NaN; }

// ---------- Become a Legend ----------
export function validateBal(s: any, prev: any | null): Verdict {
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
export function validateMl(m: any, prev: any | null): Verdict {
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
