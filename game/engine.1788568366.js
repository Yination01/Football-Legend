/* ============================================================
   FOOTBALL LEGEND — match/career engine (pure logic, no DOM)
   Fairness rule: winProbs() runs the SAME match core the game
   uses (auto decisions). Displayed odds ARE the engine's odds.
   No rigging.
   ============================================================ */

// ---------- Seeded RNG ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h ^= h >>> 16) >>> 0;
}
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

// ---------- Regions & name pools (realistic fictional combos) ----------
const REGIONS = {
  britain: { label: "British Isles", flag: "🇬🇧",
    first: ["Callum","Harry","Jack","Oliver","George","Lewis","Mason","Reece","Jordan","Kieran","Declan","Conor","Liam","Nathan","Owen","Rhys"],
    last: ["Whitfield","Harrington","Bexley","Crowther","Aldridge","Fenwick","Marsden","Holloway","Pemberton","Radcliffe","Stanton","Draycott","Farnsworth","Grantham","Hartwell","Larkin"] },
  westeuro: { label: "Western Europe", flag: "🇫🇷",
    first: ["Antoine","Hugo","Theo","Mathis","Enzo","Jules","Noah","Leo","Timo","Luc","Yanis","Romain","Bastien","Florian","Maxime","Kevin"],
    last: ["Lemaire","Rousseau","Girard","Fontaine","Moreau","Dubois","Marchand","Perrin","Baptiste","Carpentier","Vasseur","Leroux","Chastain","Delacroix","Berger","Weiss"] },
  southeuro: { label: "Southern Europe", flag: "🇪🇸",
    first: ["Diego","Mateo","Santiago","Alejandro","Nicolas","Sergio","Pablo","Javier","Andres","Marco","Matteo","Lorenzo","Alessandro","Federico","Davide","Riccardo"],
    last: ["Delgado","Herrera","Cabrera","Montoya","Valdez","Reyes","Ibarra","Salazar","Fuentes","Navarro","Moretti","Ricci","Greco","Marino","Ferraro","Santoro"] },
  northeuro: { label: "Northern Europe", flag: "🇸🇪",
    first: ["Lukas","Finn","Jonas","Niklas","Lars","Sven","Erik","Emil","Mikkel","Anders","Kasper","Henrik","Oskar","Viktor","Jesper","Rasmus"],
    last: ["Keller","Brandt","Vogel","Lindqvist","Sorensen","Bakker","Visser","Holm","Nyberg","Dahl","Eriksen","Falk","Gundersen","Hoffmann","Jensen","Kruger"] },
  easteuro: { label: "Eastern Europe", flag: "🇵🇱",
    first: ["Luka","Marko","Nikola","Andrej","Milan","Piotr","Jakub","Tomas","Matej","Dario","Bartosz","Filip","Ivan","Szymon","Petar","Zoran"],
    last: ["Kovac","Novak","Petrovic","Horvat","Zielinski","Dvorak","Marek","Jovanovic","Kowalczyk","Vukovic","Babic","Sokolov","Wojcik","Novotny","Stankovic","Kral"] },
  southam: { label: "South America", flag: "🇧🇷",
    first: ["Thiago","Rafael","Bruno","Gustavo","Vinicius","Joao","Pedro","Lucas","Caio","Renan","Facundo","Agustin","Joaquin","Emiliano","Matias","Franco"],
    last: ["Marinho","Cardoso","Teixeira","Barbosa","Moreira","Batista","Correia","Azevedo","Peixoto","Sarmiento","Quintero","Villalba","Escobar","Palacios","Benitez","Roldan"] },
  africa: { label: "Africa", flag: "🌍",
    first: ["Sadio","Kwame","Yaya","Emeka","Amadou","Idrissa","Tariq","Youssef","Karim","Moussa","Cheikh","Abdou","Kofi","Sekou","Femi","Malik"],
    last: ["Diallo","Mensah","Traore","Ndiaye","Keita","Osei","Cisse","Toure","Sarr","Kamara","Coulibaly","Doumbia","Gueye","Bakayoko","Konate","Fofana"] },
  asia: { label: "Asia", flag: "🌏",
    first: ["Takumi","Kaoru","Ritsu","Daichi","Sora","Minjae","Jisung","Hyeon","Woo-jin","Akram","Sardar","Mehdi","Arif","Rizky","Zhen","Wei"],
    last: ["Tanaka","Morita","Hayashi","Nakamura","Fujimoto","Kang","Baek","Seo","Hwang","Azizi","Rahimi","Farhan","Wirawan","Zhang","Liu","Nakajima"] }
};
function genPlayerName(rng, region) {
  const r = REGIONS[region] || REGIONS[pick(rng, Object.keys(REGIONS))];
  return pick(rng, r.first) + " " + pick(rng, r.last);
}

// ---------- Region leagues & club generation ----------
const REGION_LEAGUES = {
  britain: "Premier National League", westeuro: "Ligue Nationale", southeuro: "Liga Nacional",
  northeuro: "Nordisk Ligaen", easteuro: "Vostok Liga", southam: "Campeonato Nacional",
  africa: "Continental Premier League", asia: "Pan-Asian League"
};
const REGION_CITY = {
  britain: ["Ashworth","Bramfield","Clayton Vale","Dunmere","Eastwick","Farnley","Grimsdale","Harrowden","Kelsford","Norbury","Stanmoor","Ludcross"],
  westeuro: ["Beaumont","Rochefort","Saint-Arnaud","Villeneuve","Aubierre","Montclair","Ferrand","Luneville","Bressac","Clairmont","Vandenberg","Roosdaal"],
  southeuro: ["Castelmar","Valdorra","Torresol","Miraflor","San Rocco","Montefiore","Alcabria","Verdana","Lucerna","Ostia Nova","Peralvo","Serravalle"],
  northeuro: ["Vikstad","Norrhamn","Eskilsberg","Fjellheim","Sundvik","Brygge","Halmvik","Storendal","Lysfjord","Tornedal","Kolsnes","Aspevik"],
  easteuro: ["Novagrad","Petrovac","Zelengrad","Starobor","Kraslav","Dubravka","Velidar","Morzansk","Belgorje","Ostrovan","Tarnopol","Zlatibor"],
  southam: ["Rio Verde","Santa Elena","Puerto Alto","Villa Rosario","Monte Azul","Lago Blanco","San Tadeo","Cerro Grande","Costa Dorada","El Mirador","Tres Palmas","Valle Hondo"],
  africa: ["Zanari","Bakoto","Mwanzi","Kelemba","Sundoro","Ashati","Limpara","Korogo","Bandale","Mesewa","Tigrai Falls","Juba Heights"],
  asia: ["Kanzaki","Toyohama","Sakuradai","Haeundo","Cheonwol","Tanjung Emas","Surakerta","Jinshui","Baihe","Nagatori","Songpa Bay","Mekong Vista"]
};
const REGION_PATTERNS = {
  britain: ["{c} United","{c} City","{c} Rovers","{c} Athletic","{c} Town","{c} Wanderers"],
  westeuro: ["Olympique {c}","Racing {c}","Stade {c}","AS {c}","{c} FC","SC {c}"],
  southeuro: ["Real {c}","Atlético {c}","Deportivo {c}","{c} CF","AC {c}","US {c}"],
  northeuro: ["{c} IF","FC {c}","{c} BK","IK {c}","{c} Fotboll","SK {c}"],
  easteuro: ["Dinamo {c}","FK {c}","Lokomotiv {c}","Zvezda {c}","{c} Metallurg","Rapid {c}"],
  southam: ["CA {c}","SC {c}","{c} FC","Club {c}","Atlético {c}","Union {c}"],
  africa: ["{c} FC","{c} United","{c} Stars","{c} Warriors","{c} Rangers","Young {c}"],
  asia: ["{c} FC","{c} SC","{c} Dynamos","{c} Phoenix","{c} Diamonds","United {c}"]
};
const CLUB_PALETTE = [
  ["#0a7d33","#ffffff"],["#c8102e","#ffffff"],["#1d3f8f","#f2c94c"],["#e2231a","#000000"],["#6a1b9a","#ffffff"],
  ["#00695c","#f2c94c"],["#b71c1c","#ffffff"],["#37474f","#ff8f00"],["#01579b","#ffffff"],["#33691e","#ffffff"]
];
function genStarterClubs(region, rng) {
  const reg = REGION_CITY[region] ? region : "britain";
  const cities = REGION_CITY[reg].slice();
  const pats = REGION_PATTERNS[reg];
  const strs = [61, 70, 67, 68, 63, 62, 66, 58, 59, 60];
  const clubs = [], used = new Set();
  for (let i = 0; i < 10; i++) {
    const city = cities.splice(Math.floor(rng() * cities.length), 1)[0];
    const name = pats[Math.floor(rng() * pats.length)].replace("{c}", city);
    let short = city.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
    while (used.has(short)) short = short.slice(0, 2) + "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[Math.floor(rng() * 26)];
    used.add(short);
    clubs.push({ name, short, city, str: strs[i], col1: CLUB_PALETTE[i][0], col2: CLUB_PALETTE[i][1] });
  }
  return clubs;
}

// ---------- Club sets ----------
const STARTER_CLUBS = [
  { name: "Oakfield Rovers",      short: "OAK", city: "Oakfield",    str: 61, col1: "#0a7d33", col2: "#ffffff" },
  { name: "Ferndale United",      short: "FER", city: "Ferndale",    str: 70, col1: "#c8102e", col2: "#ffffff" },
  { name: "Lakewood City",        short: "LAK", city: "Lakewood",    str: 67, col1: "#1d3f8f", col2: "#f2c94c" },
  { name: "Ironbridge Rangers",   short: "IRB", city: "Ironbridge",  str: 68, col1: "#e2231a", col2: "#000000" },
  { name: "Westhaven Warriors",   short: "WHW", city: "Westhaven",   str: 63, col1: "#6a1b9a", col2: "#ffffff" },
  { name: "Roystone Royals",      short: "ROY", city: "Roystone",    str: 62, col1: "#00695c", col2: "#f2c94c" },
  { name: "Carbrook Athletic",    short: "CAR", city: "Carbrook",    str: 66, col1: "#b71c1c", col2: "#ffffff" },
  { name: "Glenmoor Highlanders", short: "GLE", city: "Glenmoor",    str: 58, col1: "#37474f", col2: "#ff8f00" },
  { name: "Porthaven Mariners",   short: "POR", city: "Porthaven",   str: 59, col1: "#01579b", col2: "#ffffff" },
  { name: "Duncastle Giants",     short: "DUN", city: "Duncastle",   str: 60, col1: "#33691e", col2: "#ffffff" }
];
const EURO_CLUBS = [
  { name: "Millbrook United",   short: "MIL", city: "Millbrook",   str: 74, col1: "#7b1113", col2: "#ffffff" },
  { name: "Ashford City",       short: "ASH", city: "Ashford",     str: 79, col1: "#5cb3e6", col2: "#ffffff" },
  { name: "Weston Rovers",      short: "WES", city: "Weston",      str: 72, col1: "#003366", col2: "#ffd700" },
  { name: "Kingsport Athletic", short: "KSA", city: "Kingsport",   str: 76, col1: "#8b0000", col2: "#87ceeb" },
  { name: "Redhill Wanderers",  short: "RED", city: "Redhill",     str: 71, col1: "#d32f2f", col2: "#000000" },
  { name: "Northgate FC",       short: "NOR", city: "Northgate",   str: 75, col1: "#000000", col2: "#ffffff" },
  { name: "Brackenford Town",   short: "BRA", city: "Brackenford", str: 70, col1: "#f57f17", col2: "#000000" },
  { name: "Silverton FC",       short: "SIL", city: "Silverton",   str: 73, col1: "#9e9e9e", col2: "#0d47a1" },
  { name: "Eastvale United",    short: "EAS", city: "Eastvale",    str: 72, col1: "#004d40", col2: "#ffffff" },
  { name: "Harrowgate Rangers", short: "HAR", city: "Harrowgate",  str: 77, col1: "#1a237e", col2: "#c62828" }
];

// ---------- Positions (regular football set) ----------
const POSITIONS = {
  GK:  { label: "Goalkeeper",           weights: { PAC:.05, SHO:0,   PAS:.15, DRI:.05, DEF:.50, PHY:.25 }, shootBias:0,    assistBias:.05, defBias:0,   gk:true },
  CB:  { label: "Centre Back",          weights: { PAC:.12, SHO:.02, PAS:.12, DRI:.05, DEF:.45, PHY:.24 }, shootBias:.06,  assistBias:.10, defBias:.85 },
  LB:  { label: "Left Back",            weights: { PAC:.22, SHO:.04, PAS:.18, DRI:.12, DEF:.28, PHY:.16 }, shootBias:.12,  assistBias:.50, defBias:.55 },
  RB:  { label: "Right Back",           weights: { PAC:.22, SHO:.04, PAS:.18, DRI:.12, DEF:.28, PHY:.16 }, shootBias:.12,  assistBias:.50, defBias:.55 },
  DMF: { label: "Defensive Midfielder", weights: { PAC:.08, SHO:.06, PAS:.26, DRI:.10, DEF:.30, PHY:.20 }, shootBias:.15,  assistBias:.50, defBias:.60 },
  CMF: { label: "Central Midfielder",   weights: { PAC:.10, SHO:.10, PAS:.35, DRI:.15, DEF:.15, PHY:.15 }, shootBias:.30,  assistBias:.75, defBias:.35 },
  AMF: { label: "Attacking Midfielder", weights: { PAC:.15, SHO:.20, PAS:.30, DRI:.25, DEF:0,   PHY:.10 }, shootBias:.55,  assistBias:.90, defBias:.10 },
  LWF: { label: "Left Winger",          weights: { PAC:.30, SHO:.20, PAS:.15, DRI:.25, DEF:0,   PHY:.10 }, shootBias:.70,  assistBias:.70, defBias:.05 },
  RWF: { label: "Right Winger",         weights: { PAC:.30, SHO:.20, PAS:.15, DRI:.25, DEF:0,   PHY:.10 }, shootBias:.70,  assistBias:.70, defBias:.05 },
  SS:  { label: "Second Striker",       weights: { PAC:.20, SHO:.30, PAS:.20, DRI:.20, DEF:0,   PHY:.10 }, shootBias:.85,  assistBias:.60, defBias:0 },
  CF:  { label: "Centre Forward",       weights: { PAC:.20, SHO:.35, PAS:.10, DRI:.20, DEF:0,   PHY:.15 }, shootBias:1.0,  assistBias:.35, defBias:0 }
};
function baseStats(pos) {
  const t = {
    GK:  { PAC: 48, SHO: 30, PAS: 56, DRI: 42, DEF: 68, PHY: 66 },
    CB:  { PAC: 60, SHO: 36, PAS: 56, DRI: 46, DEF: 69, PHY: 69 },
    LB:  { PAC: 68, SHO: 44, PAS: 60, DRI: 58, DEF: 62, PHY: 60 },
    RB:  { PAC: 68, SHO: 44, PAS: 60, DRI: 58, DEF: 62, PHY: 60 },
    DMF: { PAC: 58, SHO: 50, PAS: 64, DRI: 56, DEF: 64, PHY: 64 },
    CMF: { PAC: 60, SHO: 54, PAS: 68, DRI: 60, DEF: 56, PHY: 60 },
    AMF: { PAC: 62, SHO: 60, PAS: 68, DRI: 66, DEF: 40, PHY: 52 },
    LWF: { PAC: 71, SHO: 60, PAS: 60, DRI: 68, DEF: 34, PHY: 54 },
    RWF: { PAC: 71, SHO: 60, PAS: 60, DRI: 68, DEF: 34, PHY: 54 },
    SS:  { PAC: 66, SHO: 65, PAS: 62, DRI: 65, DEF: 34, PHY: 56 },
    CF:  { PAC: 66, SHO: 68, PAS: 55, DRI: 62, DEF: 32, PHY: 62 }
  }[pos];
  return Object.assign({}, t);
}
function calcOVR(stats, pos) {
  const w = POSITIONS[pos].weights;
  let s = 0;
  for (const k in w) s += (stats[k] || 0) * w[k];
  return Math.round(s);
}

// ---------- Playstyles (position-gated, eFootball-inspired) ----------
const PLAYSTYLES = {
  poacher:     { label: "Goal Poacher",         pos: ["CF","SS"],            shoot:1.30, assist:.85, def:1,    hold:.8,  desc: "Lives in the box. Shoot first." },
  targetman:   { label: "Target Man",           pos: ["CF"],                 shoot:1.10, assist:1.0, def:1,    hold:1.3, desc: "Hold up play, bring others in." },
  deeplying:   { label: "Deep-Lying Forward",   pos: ["CF","SS"],            shoot:.90,  assist:1.30,def:1,    hold:1.1, desc: "Drop deep, create for others." },
  prolific:    { label: "Prolific Winger",      pos: ["LWF","RWF"],          shoot:1.30, assist:.90, def:1,    hold:.9,  desc: "Cut inside and finish." },
  crosser:     { label: "Cross Specialist",     pos: ["LWF","RWF","LB","RB"],shoot:.80,  assist:1.40,def:1,    hold:1,   desc: "Get to the byline, deliver." },
  roaming:     { label: "Roaming Flank",        pos: ["LWF","RWF"],          shoot:1.05, assist:1.15,def:1,    hold:1,   desc: "Drift anywhere to hurt them." },
  classic10:   { label: "Classic No. 10",       pos: ["AMF","SS"],           shoot:1.0,  assist:1.30,def:.9,   hold:1.15,desc: "The playmaker's playmaker." },
  creative:    { label: "Creative Playmaker",   pos: ["AMF","CMF","LWF","RWF"],shoot:.85,assist:1.45,def:1,    hold:1.1, desc: "The killer final pass." },
  hole:        { label: "Hole Player",          pos: ["AMF","SS","CMF"],     shoot:1.20, assist:1.05,def:1,    hold:.9,  desc: "Arrive late in the box." },
  b2b:         { label: "Box-to-Box",           pos: ["CMF"],                shoot:1.15, assist:1.10,def:1.15, hold:1,   desc: "Everywhere, all match long." },
  orchestrator:{ label: "Orchestrator",         pos: ["DMF","CMF"],          shoot:.80,  assist:1.35,def:1.05, hold:1.2, desc: "Dictate the tempo from deep." },
  anchor:      { label: "Anchor Man",           pos: ["DMF"],                shoot:.60,  assist:.90, def:1.40, hold:1.1, desc: "Shield the back line." },
  destroyer:   { label: "The Destroyer",        pos: ["DMF","CB"],           shoot:.60,  assist:.80, def:1.45, hold:.9,  desc: "Win the ball. By any means." },
  buildup:     { label: "Build Up",             pos: ["CB"],                 shoot:.70,  assist:1.20,def:1.20, hold:1.2, desc: "Play out from the back." },
  extrafront:  { label: "Extra Frontman",       pos: ["CB"],                 shoot:1.25, assist:.90, def:1.05, hold:.9,  desc: "Push up for set pieces." },
  attackfb:    { label: "Attacking Full-back",  pos: ["LB","RB"],            shoot:1.0,  assist:1.30,def:.90,  hold:1,   desc: "Overlap relentlessly." },
  defencefb:   { label: "Defensive Full-back",  pos: ["LB","RB"],            shoot:.70,  assist:.90, def:1.35, hold:1.1, desc: "Safety first, no way past." },
  sweeperkeeper:{label: "Offensive Goalkeeper", pos: ["GK"],                 shoot:1,    assist:1,   def:1.0,  hold:1,   rush:1.25, desc: "Rush out, sweep behind the line." },
  shotstopper: { label: "Defensive Goalkeeper", pos: ["GK"],                 shoot:1,    assist:1,   def:1.1,  hold:1,   rush:.8,  desc: "Own the goalmouth." }
};
function stylesFor(pos) {
  return Object.entries(PLAYSTYLES).filter(([, s]) => s.pos.includes(pos)).map(([id, s]) => ({ id, ...s }));
}

// ---------- Match roles (per-match game plan) ----------
const ROLES = {
  // midfielders & forwards
  balanced:   { label: "Balanced",         desc: "Play your natural game.",             involve: 1.0,  risk: 1.0 },
  aggressive: { label: "Get Involved",     desc: "Demand the ball more often.",         involve: 1.25, risk: 1.15 },
  runs:       { label: "Runs In Behind",   desc: "Exploit space with pace.",            involve: 1.15, risk: 1.2 },
  discipline: { label: "Stay Disciplined", desc: "Safe, consistent performance.",       involve: 0.85, risk: 0.7 },
  // goalkeepers
  gk_line:    { label: "Command The Box",  desc: "Stay big, organize. Safer saves, \u221230% blunder risk.", involve: 1.0, risk: 0.8,  gkStay: 0.05,  gkRush: -0.03, gkBlunderMul: 0.7 },
  gk_sweeper: { label: "Sweeper Keeper",   desc: "Rush out fast: better rush saves, +25% blunder risk.",     involve: 1.0, risk: 1.1,  gkStay: -0.02, gkRush: 0.06,  gkBlunderMul: 1.25 },
  gk_calm:    { label: "Calm Hands",       desc: "Play it simple. Steady ratings, \u221215% blunder risk.",  involve: 1.0, risk: 0.65, gkStay: 0.02,  gkRush: 0,     gkBlunderMul: 0.85 },
  // defenders
  df_hold:    { label: "Hold The Line",    desc: "Position first: fewer duels, +10% duel win rate.",         involve: 0.85, risk: 0.7,  tackleFreq: 0.85, tackleAdj: 0.10 },
  df_step:    { label: "Step Out & Press", desc: "Hunt the ball: ~40% more duels, slightly riskier.",        involve: 1.1,  risk: 1.15, tackleFreq: 1.4,  tackleAdj: -0.03 },
  df_sweep:   { label: "No-Nonsense",      desc: "Clear danger early. Solid, safe, reliable.",               involve: 0.9,  risk: 0.85, tackleFreq: 1.1,  tackleAdj: 0.04 }
};
function rolesFor(pos) {
  const ids = pos === "GK" ? ["gk_line", "gk_sweeper", "gk_calm"]
    : (pos === "CB" || pos === "LB" || pos === "RB") ? ["df_hold", "df_step", "df_sweep"]
    : ["balanced", "aggressive", "runs", "discipline"];
  const out = {};
  for (const id of ids) out[id] = ROLES[id];
  return out;
}

// ---------- Chance scenarios (variety in decision moments) ----------
const CHANCE_SCENARIOS = [
  { id: "openplay", label: "Space opens up in the final third",              conv: 0,     shoot: 1.0,  pass: 1.0,  w: 3 },
  { id: "counter",  label: "Lightning counter \u2014 their defence is backpedalling!", conv: 0.06, shoot: 1.10, pass: 1.10, w: 2 },
  { id: "oneonone", label: "You're clean through \u2014 only the keeper to beat!",     conv: 0.12, shoot: 1.25, pass: 0.80, w: 1 },
  { id: "edge",     label: "The ball breaks to you on the edge of the box",  conv: -0.04, shoot: 0.90, pass: 1.12, w: 2 },
  { id: "cross",    label: "The cross hangs in the air \u2014 you attack it!",         conv: 0.03,  shoot: 1.05, pass: 0.70, w: 2 },
  { id: "cutback",  label: "Cut-back arrives at your feet inside the box",   conv: 0.08,  shoot: 1.15, pass: 1.00, w: 2 },
  { id: "header",   label: "Corner swings in \u2014 you rise highest!",          conv: 0.02,  shoot: 1.08, pass: 0.60, w: 2 },
  { id: "rebound",  label: "Keeper spills it \u2014 rebound at your feet!",       conv: 0.15,  shoot: 1.30, pass: 0.70, w: 1 },
  { id: "solo",     label: "You've beaten your marker \u2014 the lane opens!",    conv: 0.05,  shoot: 1.10, pass: 1.05, w: 2 },
  { id: "longshot", label: "They stand off you 25 yards out...",                  conv: -0.08, shoot: 0.85, pass: 1.15, w: 2 }
];
const GK_SCENARIOS = [
  { id: "gk1v1",    label: "Striker clean through on you!",                  conv: 0.10,  stayAdj: 0,     rushAdj: 0.04, blunder: 0.15, w: 2 },
  { id: "gklong",   label: "They wind up from distance...",                  conv: -0.06, stayAdj: 0.06,  rushAdj: -0.05, blunder: 0.10, w: 2 },
  { id: "gkscram",  label: "Chaos in your box \u2014 the ball breaks loose!", conv: 0.04, stayAdj: -0.02, rushAdj: 0.03, blunder: 0.12, w: 1 },
  { id: "gkcross",  label: "Dangerous cross whipped to the far post!",           conv: 0.00,  stayAdj: 0.04,  rushAdj: 0.05,  blunder: 0.14, w: 2 },
  { id: "gkdefl",   label: "Deflected strike \u2014 it's changed direction!",     conv: 0.06,  stayAdj: -0.05, rushAdj: -0.02, blunder: 0.10, w: 1 },
  { id: "gkback",   label: "Backpass under pressure \u2014 striker closing fast!", conv: -0.10, stayAdj: 0.05,  rushAdj: 0.02,  blunder: 0.18, w: 1 },
  { id: "gkfree",   label: "Free header from the corner \u2014 point-blank!",     conv: 0.12,  stayAdj: -0.03, rushAdj: -0.06, blunder: 0.10, w: 1 }
];
function pickWeighted(rng, arr) {
  const total = arr.reduce((t, x) => t + x.w, 0);
  let r = rng() * total;
  for (const x of arr) { r -= x.w; if (r <= 0) return x; }
  return arr[arr.length - 1];
}

/* ============================================================
   INTERACTIVE MATCH CORE
   createMatch() steps one minute at a time. When the user's
   player is on the ball (or facing a shot as GK), step() returns
   a `decision`; the UI (or auto-resolver) calls decide(choice).
   Choices — outfield: 'shoot' | 'pass' | 'hold' | 'auto'
             GK:       'stay'  | 'rush' | 'auto'
   All outcomes are honest functions of stats + probabilities.
   ============================================================ */
function createMatch(home, away, opts) {
  const o = opts || {};
  const rng = mulberry32(o.seed != null ? o.seed : Math.floor(Math.random() * 2 ** 31));
  const role = ROLES[o.role || "balanced"] || ROLES.balanced;
  const P = o.player || null;
  const ps = P ? (PLAYSTYLES[P.playstyle] || null) : null;
  // Only skills legal for the match position apply (GK never gets Outside Curler bonus etc.)
  const pskills = P ? skillsActive(P.skills, P.pos) : [];
  const skM = (k) => skillMul(pskills, k, { losing70: st && st.min >= 70 && (pTeam === 0 ? st.gH < st.gA : st.gA < st.gH) });
  const pTeam = o.playerTeam; // 0 home, 1 away, null
  const posInfo = P ? POSITIONS[P.pos] : null;

  let strH = home.str + 4, strA = away.str;
  let powH = Math.pow(strH, 1.7), powA = Math.pow(strA, 1.7);
  let shareH = powH / (powH + powA);
  function setStrengths(hs, as) { // ML: mid-match tactics — absolute strengths incl. any home adv
    strH = hs; strA = as;
    powH = Math.pow(strH, 1.7); powA = Math.pow(strA, 1.7);
    shareH = powH / (powH + powA);
  }
  const CHANCE_PER_MIN = 0.115;

  const st = {
    min: 0, gH: 0, gA: 0, momentum: 50, done: false,
    pGoals: 0, pAssists: 0, pShots: 0, pKeyPasses: 0, pSaves: 0, pTackles: 0,
    rating: 6.0, pending: null, recycle: 0, possHome: null,
    stamina: Math.max(30, Math.min(100, o.condition != null ? o.condition : 100)),
    injuredFor: 0, playerOut: false, cards: { h: 0, a: 0 }, holdBoost: 0
  };
  const fitLvl = o.fitLvl || 0, medLvl = o.medLvl || 0;
  const DRAIN = (0.42 * role.risk) * (1 - 0.15 * fitLvl);
  // fatigue-scaled stat: full value at 100 stamina, 75% floor at 0
  function eS(k) { return P.eff[k] * (0.75 + 0.25 * (st.stamina / 100)); }

  function clampConv(c) { return Math.max(0.05, Math.min(0.62, c)); }
  function baseConv(isHome) {
    const att = isHome ? strH : strA, def = isHome ? strA : strH;
    return Math.max(0.12, Math.min(0.48, 0.27 * Math.pow(att / def, 1.5)));
  }
  function ev(type, isHome, extra) {
    return Object.assign({ min: st.min, team: isHome ? 0 : 1, type, score: [st.gH, st.gA], momentum: Math.round(st.momentum) }, extra || {});
  }

  // --- decision resolvers (honest math; 'auto' rolls weighted random) ---
  function resolveChance(choice, ctx) {
    const out = [];
    const base = ctx.conv;
    if (choice === "auto") {
      const wShoot = (posInfo.shootBias + .15) * (ps ? ps.shoot : 1);
      const wPass = (posInfo.assistBias + .15) * (ps ? ps.assist : 1);
      const wHold = 0.35 * (ps ? ps.hold : 1);
      const total = wShoot + wPass + wHold, r = rng() * total;
      choice = r < wShoot ? "shoot" : r < wShoot + wPass ? "pass" : "hold";
    }
    const sm = ctx.scen || { shoot: 1, pass: 1 };
    if (choice === "shoot") {
      st.pShots++;
      const conv = clampConv(base * (0.55 + (eS("SHO") / 100) * 0.9) * (ps ? ps.shoot : 1) * sm.shoot * skM("shoot"));
      if (rng() < conv) {
        if (ctx.isHome) st.gH++; else st.gA++;
        st.pGoals++; st.rating += 1.35;
        out.push(ev("goal", ctx.isHome, { by: "you", choice, scen: ctx.scen && ctx.scen.id }));
      } else {
        st.rating -= 0.10;
        out.push(ev(rng() < .5 ? "save" : "miss", ctx.isHome, { by: "you", choice, scen: ctx.scen && ctx.scen.id }));
      }
    } else if (choice === "pass") {
      const conv = clampConv(base * (0.70 + (eS("PAS") / 100) * 0.65) * (ps ? ps.assist : 1) * sm.pass * skM("pass"));
      if (rng() < conv) {
        if (ctx.isHome) st.gH++; else st.gA++;
        st.pAssists++; st.rating += 0.9;
        out.push(ev("goal", ctx.isHome, { assist: "you", choice, scen: ctx.scen && ctx.scen.id }));
      } else {
        st.pKeyPasses++; st.rating += 0.12;
        out.push(ev(rng() < .5 ? "save" : "miss", ctx.isHome, { keypass: "you", choice, scen: ctx.scen && ctx.scen.id }));
      }
    } else { // hold — success rolls on DRI/PHY (fatigue-scaled)
      const keepP = Math.min(0.95, 0.45 + eS("DRI") / 220 + eS("PHY") / 300 + (ps ? (ps.hold - 1) * 0.15 : 0));
      if (rng() < keepP) {
        st.rating += 0.06;
        st.momentum += ctx.isHome === (pTeam === 0) ? (pTeam === 0 ? 4 : -4) : 0;
        st.recycle = 3;
        st.possHome = pTeam === 0; // possession locked to YOUR team for the window
        st.holdBoost = 0.30; // next chance: +30% quality, guaranteed to come to YOU
        out.push(ev("hold", ctx.isHome, { by: "you", choice }));
      } else {
        st.rating -= 0.15;
        st.recycle = 2;
        st.possHome = pTeam !== 0; // lost it -> THEY break
        st.holdBoost = 0;
        out.push(ev("dispossessed", ctx.isHome, { by: "you", choice }));
      }
    }
    st.stamina = Math.max(0, st.stamina - 1.5);
    return out;
  }
  function resolveGK(choice, ctx) {
    const out = [];
    if (choice === "auto") choice = rng() < (ps && ps.rush ? ps.rush * 0.4 : 0.35) ? "rush" : "stay";
    const gs = ctx.scen || { stayAdj: 0, rushAdj: 0, blunder: 0.12 };
    const base = 0.28 + Math.pow(eS("DEF") / 100, 1.5) * 0.62; // elite keepers save like elite keepers (85-cap like FK)
    const gkSaveM = skM("gkSave");
    const claim = pskills.includes("High Claim") ? 0.03 : 0;
    let saveP = choice === "stay"
      ? Math.max(0.10, Math.min(0.85, (base + gs.stayAdj + (role.gkStay || 0) + claim) * gkSaveM))
      : Math.max(0.10, Math.min(0.85, (base + 0.06 + gs.rushAdj + (role.gkRush || 0)) * gkSaveM * skM("gkRush")));
    const blMul = skM("gkBlunder"); // <1 = fewer blunders (Command of Area)
    const blunder = choice === "rush" && rng() < Math.min(0.5, gs.blunder * (role.gkBlunderMul || 1) * blMul);
    const scoredInitially = rng() < ctx.conv;
    let conceded;
    if (blunder) { conceded = true; st.rating -= 1.1; }
    else if (scoredInitially) { conceded = !(rng() < saveP * 0.85); } // chance to overturn a scoring shot
    else { conceded = false; }
    if (conceded) {
      if (ctx.isHome) st.gH++; else st.gA++;
      st.rating -= 0.3;
      out.push(ev("goal", ctx.isHome, { gk: blunder ? "blunder" : "beaten", choice, scen: ctx.scen && ctx.scen.id }));
    } else {
      st.pSaves++; st.rating += 0.35;
      out.push(ev("save", ctx.isHome, { gk: "save", choice, scen: ctx.scen && ctx.scen.id }));
    }
    return out;
  }

  function resolveSetPiece(choice, ctx) {
    const out = [];
    const isPen = ctx.type === "penalty";
    if (choice === "auto") {
      if (isPen) choice = rng() < .5 ? "place" : (rng() < .7 ? "blast" : "panenka");
      else choice = rng() < .45 ? "curler" : (rng() < .6 ? "power" : "cross");
    }
    st.pShots += (choice !== "cross") ? 1 : 0;
    let scoreP, isAssist = false;
    if (isPen) {
      scoreP = (choice === "place" ? 0.62 + Math.pow(eS("SHO") / 100, 2) * 0.32
             : choice === "blast" ? 0.60 + Math.pow(eS("PHY") / 100, 2) * 0.32
             : (0.30 + Math.pow(eS("DRI") / 100, 2) * 0.55) * skM("panenka")) * skM("penalty"); // panenka: risky, DRI-driven
    } else {
      scoreP = choice === "curler" ? (0.05 + Math.pow(eS("SHO") / 100, 2) * 0.82) * skM("fkCurler")
             : choice === "power" ? (0.05 + Math.pow((eS("SHO") * 0.6 + eS("PHY") * 0.4) / 100, 2) * 0.75) * skM("fkPower")
             : 0; // cross resolves as assist chance
      if (choice === "cross") { isAssist = true; scoreP = (0.06 + Math.pow(eS("PAS") / 100, 2) * 0.72) * skM("fkCross"); }
    }
    const scored = rng() < Math.min(0.94, scoreP);
    if (scored) {
      if (ctx.isHome) st.gH++; else st.gA++;
      if (isAssist) { st.pAssists++; st.rating += 0.9; }
      else { st.pGoals++; st.rating += isPen ? 1.0 : 1.5; if (choice === "panenka") st.rating += 0.4; }
      out.push(ev("goal", ctx.isHome, { by: isAssist ? undefined : "you", assist: isAssist ? "you" : undefined, via: ctx.type, choice }));
    } else {
      st.rating -= isPen ? 0.5 : 0.1;
      out.push(ev(rng() < .6 ? "save" : "miss", ctx.isHome, { by: "you", via: ctx.type, choice }));
    }
    st.stamina = Math.max(0, st.stamina - 1);
    return out;
  }
  function resolveGKPen(choice, ctx) {
    const out = [];
    if (choice === "auto") choice = pick(rng, ["left", "right", "stay"]);
    const shooterDir = pick(rng, ["left", "right", "middle"]);
    const penM = skM("gkPen");
    let saveP = 0.06 * Math.min(1.2, penM); // wrong guess still low
    if ((choice === "left" && shooterDir === "left") || (choice === "right" && shooterDir === "right"))
      saveP = (0.34 + eS("DEF") * 0.004) * penM;
    if (choice === "stay" && shooterDir === "middle") saveP = 0.72 * penM;
    const saved = rng() < saveP;
    if (saved) {
      st.pSaves++; st.rating += 1.2;
      out.push(ev("save", ctx.isHome, { gk: "pensave", choice }));
    } else if (rng() < 0.12) { // shooter misses on his own
      out.push(ev("miss", ctx.isHome, { gk: "penmiss", choice }));
    } else {
      if (ctx.isHome) st.gH++; else st.gA++;
      st.rating -= 0.15;
      out.push(ev("goal", ctx.isHome, { gk: "beaten", via: "penalty", choice }));
    }
    return out;
  }
  function step() {
    if (st.pending || st.done) return { min: st.min, events: [], decision: st.pending, done: st.done };
    st.min++;
    const out = [];
    st.momentum += (shareH * 100 - st.momentum) * 0.03 + (rng() - 0.5) * 8;
    st.momentum = Math.max(5, Math.min(95, st.momentum));
    if (P && !st.playerOut) {
      st.stamina = Math.max(0, st.stamina - DRAIN);
      // injury risk rises with fatigue; medical staff reduces it
      const injP = 0.0007 * (1 + 2.2 * (1 - st.stamina / 100)) * (1 - 0.3 * medLvl);
      if (rng() < injP) {
        st.playerOut = true;
        st.injuredFor = Math.max(1, 1 + Math.floor(rng() * 3) - (medLvl > 0 ? 1 : 0));
        st.rating -= 0.3;
        out.push(ev("injury", pTeam === 0, { by: "you", matches: st.injuredFor }));
      }
    }
    // disputes & cards (flavor + momentum swings)
    if (rng() < 0.012) {
      const cardHome = rng() < 0.5;
      if (cardHome) st.cards.h++; else st.cards.a++;
      st.momentum += cardHome ? -6 : 6;
      out.push(ev("card", cardHome, { flavor: Math.floor(rng() * 3) }));
    }
    // set pieces: fouls -> free kicks; handballs -> penalties
    if (rng() < 0.022) {
      const isHome = (st.recycle > 0 && st.possHome !== null) ? st.possHome : rng() < shareH;
      const isPen = rng() < 0.18; // handball / foul in the box
      const playerTakes = P && !st.playerOut && !posInfo.gk &&
        ((isHome && pTeam === 0) || (!isHome && pTeam === 1)) &&
        ["CF","SS","AMF","LWF","RWF","CMF"].includes(P.pos);
      const gkFaces = P && !st.playerOut && posInfo.gk && isPen &&
        ((isHome && pTeam === 1) || (!isHome && pTeam === 0));
      if (playerTakes) {
        st.pending = { type: isPen ? "penalty" : "freekick", isHome, conv: 0, stam: st.stamina };
        out.push(ev("setpiece", isHome, { pen: isPen, by: "you" }));
        return { min: st.min, events: out, decision: st.pending, done: false };
      }
      if (gkFaces) {
        st.pending = { type: "gkpen", isHome, conv: 0, stam: st.stamina };
        out.push(ev("setpiece", isHome, { pen: true, gk: true }));
        return { min: st.min, events: out, decision: st.pending, done: false };
      }
      // AI set piece
      const p = isPen ? 0.76 : 0.11;
      const scored = rng() < p;
      if (scored) { if (isHome) st.gH++; else st.gA++; }
      out.push(ev(scored ? "goal" : (rng() < .5 ? "save" : "miss"), isHome, { via: isPen ? "penalty" : "freekick", ai: true }));
      return finishStep(out);
    }

    let chanceP = CHANCE_PER_MIN;
    let lockHome = null;
    if (st.recycle > 0) {
      chanceP += 0.10; lockHome = st.possHome; st.recycle--;
      if (st.holdBoost > 0) chanceP = st.recycle === 0 ? 1 : 0.55; // hold payoff: chance GUARANTEED by window end
      if (st.recycle === 0) st.possHome = null;
    }

    if (rng() < chanceP) {
      const isHome = lockHome !== null ? lockHome : rng() < shareH;
      const conv = baseConv(isHome);
      const playerAttacking = P && !st.playerOut && !posInfo.gk && ((isHome && pTeam === 0) || (!isHome && pTeam === 1));
      const playerDefending = P && !st.playerOut && ((isHome && pTeam === 1) || (!isHome && pTeam === 0));

      // defensive involvement: tackles for def-biased positions (auto, honest DEF roll)
      if (playerDefending && !posInfo.gk && posInfo.defBias > 0 && rng() < 0.30 * posInfo.defBias * (ps ? ps.def : 1) * (role.tackleFreq || 1)) {
        st.pTackles = st.pTackles || 0;
        const tbBump = pskills.includes("Track Back") ? 0.04 : 0;
        if (rng() < 0.35 + (P.eff.DEF / 100) * 0.45 + (role.tackleAdj || 0) + tbBump) {
          st.pTackles++; st.rating += 0.22;
          out.push(ev("tackle", isHome, { by: "you" }));
          return finishStep(out); // chance snuffed out
        } else {
          st.rating -= 0.08;
        }
      }
      // GK decision on opponent chance
      if (playerDefending && posInfo.gk) {
        const scen = pickWeighted(rng, GK_SCENARIOS);
        st.pending = { type: "gk", conv: Math.max(0.05, Math.min(0.62, conv + scen.conv)), isHome, scen, stam: st.stamina };
        return { min: st.min, events: out, decision: st.pending, done: false };
      }
      // player on the ball: decision point
      if (playerAttacking) {
        const boosted = st.holdBoost > 0;
        const involveP = boosted ? 1 : Math.min(0.8, (0.30 * posInfo.shootBias + 0.26 * posInfo.assistBias) * role.involve + 0.08);
        if (rng() < involveP) {
          const scen = pickWeighted(rng, CHANCE_SCENARIOS);
          let cv = Math.max(0.05, Math.min(0.62, conv + scen.conv));
          if (boosted) { cv = Math.min(0.62, cv * (1 + st.holdBoost)); }
          st.pending = { type: "chance", conv: cv, isHome, scen, stam: st.stamina, held: boosted };
          if (boosted) st.holdBoost = 0; // consumed
          return { min: st.min, events: out, decision: st.pending, done: false };
        }
      }
      // AI attempt
      const scored = rng() < clampConv(conv);
      if (scored) { if (isHome) st.gH++; else st.gA++; }
      const aiScen = CHANCE_SCENARIOS[(st.min * 7 + Math.round(conv * 100)) % CHANCE_SCENARIOS.length].id;
      out.push(ev(scored ? "goal" : (rng() < 0.5 ? "save" : "miss"), isHome, { scen: aiScen }));
    }
    // passive rating drift from stats vs opposition
    if (P && st.min % 10 === 0) {
      const oppStr = pTeam === 0 ? strA : strH;
      const eff = (P.eff.PAC + P.eff.DRI + P.eff.PAS + P.eff.PHY) / 4;
      st.rating += ((eff - oppStr) / 100) * 0.35 + (rng() - 0.48) * 0.22 * role.risk;
    }
    return finishStep(out);
  }
  function finishStep(out) {
    if (st.min >= 90) {
      st.done = true;
      if (P != null && pTeam != null) {
        const won = (pTeam === 0 && st.gH > st.gA) || (pTeam === 1 && st.gA > st.gH);
        const lost = (pTeam === 0 && st.gH < st.gA) || (pTeam === 1 && st.gA < st.gH);
        st.rating += won ? 0.45 : lost ? -0.5 : 0;
        if (posInfo && posInfo.gk) {
          const conceded = pTeam === 0 ? st.gA : st.gH;
          if (conceded === 0) st.rating += 1.0; // clean sheet
        }
      }
      st.rating = Math.max(4.0, Math.min(10.0, Math.round(st.rating * 10) / 10));
    }
    return { min: st.min, events: out, decision: null, done: st.done };
  }
  function decide(choice) {
    if (!st.pending) return { events: [] };
    const ctx = st.pending; st.pending = null;
    const events = ctx.type === "gk" ? resolveGK(choice, ctx)
      : ctx.type === "gkpen" ? resolveGKPen(choice, ctx)
      : (ctx.type === "penalty" || ctx.type === "freekick") ? resolveSetPiece(choice, ctx)
      : resolveChance(choice, ctx);
    const res = finishStep(events);
    return { events: res.events, done: res.done };
  }
  function requestSub() {
    if (st.done || st.playerOut || st.pending) return null;
    st.playerOut = true;
    st.subbed = true;
    st.rating += st.min >= 60 ? 0 : -0.15; // very early subs read poorly
    return ev("sub", pTeam === 0, { by: "you" });
  }
  function result() {
    return { gH: st.gH, gA: st.gA, rating: st.rating, pGoals: st.pGoals, pAssists: st.pAssists,
             pShots: st.pShots, pKeyPasses: st.pKeyPasses, pSaves: st.pSaves, pTackles: st.pTackles || 0,
             staminaEnd: Math.round(st.stamina), injuredFor: st.injuredFor, subbed: !!st.subbed };
  }
  return { step, decide, result, requestSub, setStrengths, state: st };
}

// Honest decision odds — EXACT mirrors of resolveChance/resolveGK math.
// PES/eFootball-style player skills — multipliers applied IDENTICALLY in decisionOdds and resolve math.
// Every skill is position-gated via SKILL_POS / skillsFor(pos). GKs never roll Outside Curler etc.
const SKILLS = {
  // ---- outfield finishing / set pieces ----
  "Outside Curler":      { fkCurler: 1.18, shoot: 1.04 },
  "Long Range Drive":    { shoot: 1.06, fkPower: 1.10 },
  "First-time Shot":     { shoot: 1.08 },
  "Chip Shot Control":   { panenka: 1.25 },
  "Heading":             { shoot: 1.05 },
  "Acrobatic Finishing": { shoot: 1.07 },
  "Through Passing":     { pass: 1.10 },
  "Pinpoint Crossing":   { fkCross: 1.15, pass: 1.05 },
  "One-touch Pass":      { pass: 1.08 },
  "Captaincy":           {}, // team-wide: handled at team-strength level
  "Fighting Spirit":     { losing70: 1.12 }, // shoot+pass (outfield) or saves (GK) when losing after 70'
  "Super-sub":           {}, // handled by UI (sub context)
  "Track Back":          { defBump: 0.02 }, // outfield DEF involvement bump
  "Penalty Specialist":  { penalty: 1.12 },
  // ---- goalkeeper-only ----
  "Reflexes":            { gkSave: 1.08 },            // stay & rush save rate
  "Penalty Saver":       { gkPen: 1.18 },             // facing penalties
  "Command of Area":     { gkRush: 1.06, gkBlunder: 0.82 }, // better rush, fewer blunders
  "High Claim":          { gkStay: 0.03 },            // stay-big bonus (crosses/claims)
  "GK Long Ball":        { gkDist: 1.10 }             // reserved for distribution moments
};
// Legal positions per skill. Keep in lockstep with BaL UI + ML pack rolls.
const SKILL_POS = {
  "Outside Curler":      ["CMF","AMF","LWF","RWF","SS"],
  "Long Range Drive":    ["DMF","CMF","AMF","LWF","RWF","SS","CF"],
  "First-time Shot":     ["CB","AMF","LWF","RWF","SS","CF"],
  "Chip Shot Control":   ["AMF","LWF","RWF","SS","CF"],
  "Heading":             ["CB","CF","SS"],
  "Acrobatic Finishing": ["LWF","RWF","SS","CF"],
  "Through Passing":     ["DMF","CMF","AMF","LB","RB"],
  "Pinpoint Crossing":   ["LB","RB","LWF","RWF"],
  "One-touch Pass":      ["LB","RB","DMF","CMF","AMF"],
  "Captaincy":           ["GK","CB","LB","RB","DMF","CMF","AMF","LWF","RWF","SS","CF"],
  "Fighting Spirit":     ["GK","CB","DMF","CMF","SS","CF"],
  "Super-sub":           ["CB","LB","RB","DMF","CMF","AMF","LWF","RWF","SS","CF"],
  "Track Back":          ["CB","LB","RB","DMF","CMF","LWF","RWF"],
  "Penalty Specialist":  ["AMF","SS","CF","LWF","RWF"],
  "Reflexes":            ["GK"],
  "Penalty Saver":       ["GK"],
  "Command of Area":     ["GK"],
  "High Claim":          ["GK"],
  "GK Long Ball":        ["GK"]
};
function skillsFor(pos) {
  const p = pos || "CF";
  return Object.keys(SKILL_POS).filter(s => (SKILL_POS[s] || []).includes(p));
}
function skillLegal(skill, pos) {
  return !!(SKILL_POS[skill] && SKILL_POS[skill].includes(pos));
}
// Filter a skill list down to those legal for pos (match-time + migration).
function skillsActive(skills, pos) {
  return (skills || []).filter(s => skillLegal(s, pos));
}
function skillMul(skills, key, ctx2) {
  let m = 1;
  for (const s of skills || []) {
    const def = SKILLS[s]; if (!def) continue;
    if (def[key]) m *= def[key];
    if (key === "shoot" || key === "pass" || key === "gkSave") {
      if (def.losing70 && ctx2 && ctx2.losing70) m *= def.losing70;
    }
  }
  return m;
}
function decisionOdds(dec, player, roleId) {
  const P = player, ps = PLAYSTYLES[P.playstyle] || null;
  const activeSk = skillsActive(P.skills, P.pos);
  const sk = (k) => skillMul(activeSk, k, dec.skctx);
  const clamp = (c) => Math.max(0.05, Math.min(0.62, c));
  const fat = 0.75 + 0.25 * ((dec.stam != null ? dec.stam : 100) / 100);
  const eS = (k) => P.eff[k] * fat;
  if (dec.type === "penalty") return { type: "penalty", stam: Math.round(dec.stam || 100),
    place: Math.round(Math.min(94, (0.62 + Math.pow(eS("SHO") / 100, 2) * 0.32) * sk("penalty") * 100)),
    blast: Math.round(Math.min(94, (0.60 + Math.pow(eS("PHY") / 100, 2) * 0.32) * sk("penalty") * 100)),
    panenka: Math.round(Math.min(94, (0.30 + Math.pow(eS("DRI") / 100, 2) * 0.55) * sk("panenka") * sk("penalty") * 100)) };
  if (dec.type === "freekick") return { type: "freekick", stam: Math.round(dec.stam || 100),
    curler: Math.round(Math.min(94, (0.05 + Math.pow(eS("SHO") / 100, 2) * 0.82) * sk("fkCurler") * 100)),
    power: Math.round(Math.min(94, (0.05 + Math.pow((eS("SHO") * 0.6 + eS("PHY") * 0.4) / 100, 2) * 0.75) * sk("fkPower") * 100)),
    cross: Math.round(Math.min(94, (0.06 + Math.pow(eS("PAS") / 100, 2) * 0.72) * sk("fkCross") * 100)) };
  if (dec.type === "gkpen") {
    const gsk = (k) => skillMul(skillsActive(P.skills, P.pos || "GK"), k, dec.skctx);
    const penM = gsk("gkPen");
    return { type: "gkpen", stam: Math.round(dec.stam || 100),
      dive: Math.round((0.34 + eS("DEF") * 0.004) * penM * 33 + 6),
      stay: Math.round(0.72 * penM * 33 + 4) };
  }
  if (dec.type === "gk") {
    const role = ROLES[roleId] || ROLES.balanced;
    const gs = dec.scen || { stayAdj: 0, rushAdj: 0, blunder: 0.12 };
    const base = 0.28 + Math.pow(eS("DEF") / 100, 1.5) * 0.62;
    // Position-filter first so a mis-assigned outfield skill never leaks into GK odds
    const gsk = (k) => skillMul(skillsActive(P.skills, P.pos || "GK"), k, dec.skctx);
    const claim = skillsActive(P.skills, P.pos || "GK").includes("High Claim") ? 0.03 : 0;
    const spStay = Math.max(0.10, Math.min(0.85, (base + gs.stayAdj + (role.gkStay || 0) + claim) * gsk("gkSave")));
    const spRush = Math.max(0.10, Math.min(0.85, (base + 0.06 + gs.rushAdj + (role.gkRush || 0)) * gsk("gkSave") * gsk("gkRush")));
    const bl = Math.min(0.5, gs.blunder * (role.gkBlunderMul || 1) * gsk("gkBlunder"));
    const stayConcede = dec.conv * (1 - 0.85 * spStay);
    const rushConcede = bl + (1 - bl) * dec.conv * (1 - 0.85 * spRush);
    return { type: "gk", xg: Math.round(dec.conv * 100),
      stay: Math.round((1 - stayConcede) * 100), rush: Math.round((1 - rushConcede) * 100),
      blunder: Math.round(bl * 100) };
  }
  const sm = dec.scen || { shoot: 1, pass: 1 };
  const shoot = clamp(dec.conv * (0.55 + (eS("SHO") / 100) * 0.9) * (ps ? ps.shoot : 1) * sm.shoot * sk("shoot"));
  const pass = clamp(dec.conv * (0.70 + (eS("PAS") / 100) * 0.65) * (ps ? ps.assist : 1) * sm.pass * sk("pass"));
  const hold = Math.min(0.95, 0.45 + eS("DRI") / 220 + eS("PHY") / 300 + (ps ? (ps.hold - 1) * 0.15 : 0));
  return { type: "chance", xg: Math.round(dec.conv * 100), stam: Math.round(dec.stam != null ? dec.stam : 100),
    shoot: Math.round(shoot * 100), pass: Math.round(pass * 100), hold: Math.round(hold * 100) };
}

// Batch runner (auto decisions) — used by odds, AI matchdays, and tests.
function simulateMatch(home, away, opts) {
  const m = createMatch(home, away, opts);
  const events = [];
  while (true) {
    const s = m.step();
    for (const e of s.events) events.push(e);
    if (s.decision) { const d = m.decide("auto"); for (const e of d.events) events.push(e); }
    if (s.done || m.state.done) break;
  }
  const r = m.result();
  return Object.assign({ events: (opts && opts.fast) ? [] : events }, r);
}

// ---------- Honest odds: Monte Carlo over the REAL engine ----------
function winProbs(home, away, n) {
  n = n || 500;
  let w = 0, d = 0, l = 0;
  for (let i = 0; i < n; i++) {
    const r = simulateMatch(home, away, { seed: 777000 + i * 13, fast: true });
    if (r.gH > r.gA) w++; else if (r.gH === r.gA) d++; else l++;
  }
  return { home: Math.round((w / n) * 100), draw: Math.round((d / n) * 100), away: Math.round((l / n) * 100) };
}

// ---------- Fixtures ----------
function makeFixtures(clubIdxs, rng) {
  const teams = clubIdxs.slice();
  if (teams.length % 2) teams.push(-1);
  const n = teams.length, rounds = n - 1, half = n / 2;
  const first = [];
  let arr = teams.slice();
  for (let r = 0; r < rounds; r++) {
    const md = [];
    for (let i = 0; i < half; i++) {
      const a = arr[i], b = arr[n - 1 - i];
      if (a !== -1 && b !== -1) md.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    first.push(md);
    arr = [arr[0]].concat([arr[n - 1]], arr.slice(1, n - 1));
  }
  const second = first.map(md => md.map(([a, b]) => [b, a]));
  const all = first.concat(second);
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all;
}

// ---------- World generation ----------
function makeWorld(tier, saveSeed, region) {
  const rng = mulberry32(hashSeed(saveSeed + ":world:" + tier));
  const base = tier === 0 ? genStarterClubs(region || "britain", rng) : EURO_CLUBS.map(c => Object.assign({}, c));
  const clubs = base.map(c => Object.assign({}, c, { str: c.str + Math.round((rng() - 0.5) * 4) }));
  const fixtures = makeFixtures(clubs.map((_, i) => i), rng);
  const h2h = {};
  for (let i = 1; i < clubs.length; i++) {
    const key = "0v" + i;
    h2h[key] = [];
    for (let k = 0; k < 4; k++) {
      const homeFirst = k % 2 === 0;
      const A = homeFirst ? clubs[0] : clubs[i];
      const B = homeFirst ? clubs[i] : clubs[0];
      const r = simulateMatch(A, B, { seed: hashSeed(saveSeed + key + k), fast: true });
      h2h[key].push({ home: homeFirst ? 0 : i, away: homeFirst ? i : 0, gH: r.gH, gA: r.gA, past: true });
    }
  }
  return { tier, clubs, fixtures, h2h };
}

// ---------- Galaxy: the 6-league world ----------
const LEAGUE_DEFS = [
  { id: "pnl",  name: "Premier National League", region: "britain",
    strs: [86, 83, 80, 78, 74, 72, 70, 68, 66, 64], subs: 5 }, // 4 elite, deep
  { id: "liga", name: "Liga Nacional", region: "southeuro",
    strs: [86, 83, 74, 72, 70, 68, 67, 66, 64, 62], subs: 5 }, // 2 giants
  { id: "ligue", name: "Ligue Nationale", region: "westeuro",
    strs: [85, 75, 73, 71, 70, 68, 67, 66, 65, 64], subs: 5 }, // 1 dominant
  { id: "vostok", name: "Vostok Liga", region: "easteuro",
    strs: [75, 74, 70, 68, 66, 64, 62, 60, 59, 58], subs: 5 },
  { id: "camp", name: "Campeonato Nacional", region: "southam",
    strs: [78, 75, 72, 70, 68, 66, 64, 63, 62, 61], subs: 6 }, // volatile, 6 subs
  { id: "nordisk", name: "Nordisk Ligaen", region: "northeuro",
    strs: [72, 70, 69, 68, 66, 65, 64, 62, 61, 60], subs: 6 }  // flat, 6 subs
];
function leagueForRegion(region) {
  const i = LEAGUE_DEFS.findIndex(d => d.region === region);
  return i >= 0 ? i : 5; // africa/asia careers start in the flat Nordisk-profile league
}
function makeGalaxy(saveSeed) {
  const leagues = LEAGUE_DEFS.map((def, li) => {
    const rng = mulberry32(hashSeed(saveSeed + ":gal:" + def.id));
    const base = genStarterClubs(def.region, rng);
    const clubs = base.map((c, i) => Object.assign({}, c, { str: def.strs[i] + Math.round((rng() - 0.5) * 2) }));
    return { id: def.id, name: def.name, subs: def.subs, clubs,
             fixtures: makeFixtures(clubs.map((_, i) => i), rng), results: [], h2h: {} };
  });
  return { leagues, season: 1 };
}
function galaxySimMD(gal, leagueSkip, md, saveSeed, season) {
  // sim one matchday of every league except leagueSkip (yours is played/simmed by the game)
  gal.leagues.forEach((L, li) => {
    if (li === leagueSkip) return;
    const mdFx = L.fixtures[md]; if (!mdFx) return;
    for (const [h, a] of mdFx) {
      const r = simulateMatch(L.clubs[h], L.clubs[a], { seed: hashSeed(saveSeed + ":g" + li + ":s" + season + ":md" + md + ":" + h + "v" + a), fast: true });
      L.results.push({ home: h, away: a, gH: r.gH, gA: r.gA });
    }
  });
}
function galaxyRollover(gal, saveSeed, season) {
  // returns continental qualifiers from final tables, then resets league results/fixtures
  const cl = [], shield = [];
  gal.leagues.forEach((L, li) => {
    const t = computeTable(L.clubs, L.results);
    const strong = li <= 2; // top-3 leagues send 2 to the Champions Trophy
    cl.push({ league: li, club: t[0].i });
    if (strong && t[1]) cl.push({ league: li, club: t[1].i });
    if (t[strong ? 2 : 1]) shield.push({ league: li, club: t[strong ? 2 : 1].i });
    const rng = mulberry32(hashSeed(saveSeed + ":refix:" + li + ":" + (season + 1)));
    L.results = [];
    L.fixtures = makeFixtures(L.clubs.map((_, i) => i), rng);
  });
  gal.season = season + 1;
  return { cl: cl.slice(0, 16), shield: shield.slice(0, 8) };
}

// ---------- Continental: Champions Trophy + Continental Shield ----------
// Entrants: [{league, club}] resolved against a galaxy. State machine is mode-agnostic.
function ctMake(entrants, myEntry, seed) {
  const rng = mulberry32(hashSeed(seed + ":ctdraw"));
  const pool = entrants.slice();
  // guarantee my club is included
  const meIn = myEntry && pool.some(x => x.league === myEntry.league && x.club === myEntry.club);
  if (myEntry && !meIn) pool[0] = myEntry;
  // shuffle & 4 groups of 4 (pad with best-effort if short)
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  while (pool.length < 16) pool.push(pool[Math.floor(rng() * pool.length)]);
  const groups = [0, 1, 2, 3].map(g => pool.slice(g * 4, g * 4 + 4));
  let myG = -1, myS = -1;
  if (myEntry) groups.forEach((g, gi) => g.forEach((e2, si) => { if (e2.league === myEntry.league && e2.club === myEntry.club) { myG = gi; myS = si; } }));
  return { groups, myG, myS, gRes: [], gPlayed: 0, stage: "group", ko: null, koRound: 0, alive: myG >= 0, done: false, champion: null };
}
function ctClub(gal, e2) { return gal.leagues[e2.league].clubs[e2.club]; }
function ctGroupFixtures(slot) { // 6 MDs of a 4-team double round-robin, from one slot's perspective
  const others = [0, 1, 2, 3].filter(x => x !== slot);
  return [
    { opp: others[0], home: true }, { opp: others[1], home: false }, { opp: others[2], home: true },
    { opp: others[0], home: false }, { opp: others[1], home: true }, { opp: others[2], home: false }
  ];
}
function ctSimGroups(ct, gal, seed, uptoMD, skipMine) {
  // sim all group matches for matchdays < uptoMD that are not mine (mine come from real play)
  const fxAll = [[0,1,2,3].map(()=>null)]; // placeholder — we sim pairwise directly
  for (let md = 0; md < uptoMD; md++) {
    ct.groups.forEach((g, gi) => {
      const pairs = md % 3 === 0 ? [[0, 1], [2, 3]] : md % 3 === 1 ? [[0, 2], [1, 3]] : [[0, 3], [1, 2]];
      const swap = md >= 3;
      for (let [x, y] of pairs) {
        if (swap) [x, y] = [y, x];
        if (skipMine && gi === ct.myG && (x === ct.myS || y === ct.myS)) continue;
        const key = gi + ":" + md + ":" + x + "v" + y;
        if (ct.gRes.some(r => r.key === key)) continue;
        const r = simulateMatch(ctClub(gal, ct.groups[gi][x]), ctClub(gal, ct.groups[gi][y]), { seed: hashSeed(seed + ":ctg:" + key), fast: true });
        ct.gRes.push({ key, g: gi, h: x, a: y, gH: r.gH, gA: r.gA });
      }
    });
  }
}
function ctGroupTable(ct, gi) {
  const rows = [0, 1, 2, 3].map(s => ({ s, P: 0, Pts: 0, GD: 0, GF: 0 }));
  for (const r of ct.gRes) {
    if (r.g !== gi) continue;
    const h = rows[r.h], a = rows[r.a];
    h.P++; a.P++; h.GF += r.gH; a.GF += r.gA; h.GD += r.gH - r.gA; a.GD += r.gA - r.gH;
    if (r.gH > r.gA) h.Pts += 3; else if (r.gH < r.gA) a.Pts += 3; else { h.Pts++; a.Pts++; }
  }
  rows.sort((x, y) => y.Pts - x.Pts || y.GD - x.GD || y.GF - x.GF);
  return rows;
}
function ctAdvanceToKO(ct, gal, seed) {
  const qual = [];
  ct.groups.forEach((g, gi) => {
    const t = ctGroupTable(ct, gi);
    qual.push(ct.groups[gi][t[0].s], ct.groups[gi][t[1].s]);
  });
  const rng = mulberry32(hashSeed(seed + ":ctko"));
  for (let i = qual.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [qual[i], qual[j]] = [qual[j], qual[i]]; }
  ct.stage = "ko"; ct.ko = qual; ct.koRound = 0;
  ct.alive = ct.alive && qual.some(e2 => ct.myG >= 0 && e2.league === ct.groups[ct.myG][ct.myS].league && e2.club === ct.groups[ct.myG][ct.myS].club);
}
function ctSimKORound(ct, gal, seed, skipMine, myEntry) {
  // pairs [0,1],[2,3]... winner advances; returns my fixture if skipped
  const next = []; let myFx = null;
  for (let i = 0; i < ct.ko.length; i += 2) {
    const A = ct.ko[i], B = ct.ko[i + 1];
    const mine = myEntry && [A, B].some(e2 => e2.league === myEntry.league && e2.club === myEntry.club);
    if (skipMine && mine) { myFx = { A, B, slot: next.length }; next.push(null); continue; }
    const r = simulateMatch(ctClub(gal, A), ctClub(gal, B), { seed: hashSeed(seed + ":ctko:" + ct.koRound + ":" + i), fast: true });
    let w = r.gH > r.gA ? A : r.gH < r.gA ? B : (mulberry32(hashSeed(seed + "p" + i))() < 0.5 ? A : B);
    next.push(w);
  }
  return { next, myFx };
}
const CT_ROUNDS = ["Quarter-final", "Semi-final", "FINAL"];
const CT_GROUP_AFTER_MD = [2, 5, 8, 11, 14, 16]; // continental nights after these league MDs

// ---------- Table ----------
function computeTable(clubs, results) {
  const rows = clubs.map((c, i) => ({ i, name: c.name, short: c.short, P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, Pts: 0 }));
  for (const r of results) {
    const h = rows[r.home], a = rows[r.away];
    h.P++; a.P++; h.GF += r.gH; h.GA += r.gA; a.GF += r.gA; a.GA += r.gH;
    if (r.gH > r.gA) { h.W++; h.Pts += 3; a.L++; }
    else if (r.gH < r.gA) { a.W++; a.Pts += 3; h.L++; }
    else { h.D++; a.D++; h.Pts++; a.Pts++; }
  }
  rows.sort((x, y) => y.Pts - x.Pts || (y.GF - y.GA) - (x.GF - x.GA) || y.GF - x.GF);
  return rows;
}

const Engine = {
  mulberry32, hashSeed, pick, genPlayerName, REGIONS,
  POSITIONS, PLAYSTYLES, stylesFor, ROLES, rolesFor, baseStats, calcOVR,
  createMatch, simulateMatch, winProbs, makeWorld, computeTable, decisionOdds,
  REGION_LEAGUES, genStarterClubs,
  STARTER_CLUBS, EURO_CLUBS, SKILLS, SKILL_POS, skillsFor, skillLegal, skillsActive, skillMul,
  LEAGUE_DEFS, leagueForRegion, makeGalaxy, galaxySimMD, galaxyRollover,
  ctMake, ctClub, ctGroupFixtures, ctSimGroups, ctGroupTable, ctAdvanceToKO, ctSimKORound, CT_ROUNDS, CT_GROUP_AFTER_MD
};
if (typeof module !== "undefined") module.exports = Engine;
if (typeof window !== "undefined") window.Engine = Engine;
