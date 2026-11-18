/* =========================================================
   CROISADE — mode roguelike
   Logique pure (sans DOM) : armées, positions, marché, butin.
   Les pièces gardent leurs déplacements classiques (Stockfish
   joue l'ennemi), c'est la composition des armées qui change.
   ========================================================= */
import { Chess, validateFen } from './lib/chess.js';
import { rng } from './pixel.js';

export const FLOORS = 8;
export const MAX_UNITS = 15;            // sans compter le roi
export const PIECE_NAMES = { p: 'Pion', n: 'Cavalier', b: 'Fou', r: 'Tour', q: 'Dame', k: 'Roi' };
export const PIECE_PRICES = { p: 3, n: 8, b: 8, r: 12, q: 22 };
const PTS = { p: 1, n: 3, b: 3, r: 5, q: 9 };

/* Techniques : pouvoirs à charges, utilisables pendant ton tour */
export const TECHS = {
  undo:   { name: 'Retour', icon: 'undo', col: '#7ab4ee', price: 6, desc: 'Annule ton dernier coup et la réponse ennemie.' },
  hint:   { name: 'Clairvoyance', icon: 'bulb', col: '#f2d03a', price: 5, desc: 'Montre le meilleur coup possible.' },
  freeze: { name: 'Gel', icon: 'snow', col: '#a8e4ff', price: 10, desc: "Après ton prochain coup, l'ennemi passe son tour." },
  pawn:   { name: 'Renfort', icon: 'plus', col: '#8fd65a', price: 7, desc: 'Pose un pion sur une case vide de tes rangées 2 à 4.' },
  knight: { name: 'Adoubement', icon: 'up', col: '#ff9a4a', price: 9, desc: 'Transforme un de tes pions en cavalier.' },
  swap:   { name: 'Rocade', icon: 'swap', col: '#c89aff', price: 7, desc: 'Échange la place de deux de tes pièces.' },
  smite:  { name: 'Foudre', icon: 'bolt', col: '#ff8a7a', price: 12, desc: 'Détruit un pion ennemi.' },
};

/* Reliques : bonus passifs pour toute la croisade */
export const RELICS = {
  purse:     { name: 'Bourse de cuir', icon: 'bag', col: '#d9a877', price: 18, desc: "+50 % d'or après chaque victoire." },
  spy:       { name: 'Longue-vue', icon: 'eye', col: '#7ab4ee', price: 24, desc: 'Les ennemis jouent 150 Elo plus faiblement.' },
  barracks:  { name: 'Caserne', icon: 'tent', col: '#8fd65a', price: 18, desc: 'Un pion gratuit rejoint ton armée après chaque victoire.' },
  loot:      { name: 'Pillage', icon: 'coin', col: '#f2c94c', price: 14, desc: 'Chaque pièce ennemie capturée rapporte 1 or.' },
  hourglass: { name: 'Sablier', icon: 'hourglass', col: '#e6c793', price: 20, desc: 'Un Retour gratuit au début de chaque combat.' },
  merchant:  { name: 'Marchand', icon: 'tag', col: '#ff9a4a', price: 16, desc: 'Le marché est 25 % moins cher.' },
  sabotage:  { name: 'Saboteur', icon: 'bomb', col: '#ff8a7a', price: 22, desc: 'Les armées ennemies ont 4 points de moins.' },
};

/* ---------------- Création d'une croisade ---------------- */
export function newRun(playerElo) {
  const R = {
    seed: Math.floor(Math.random() * 1e9),
    elo: Math.max(250, Math.min(2600, Math.round(playerElo - 250))),
    floor: 0,                // étage actuel (0 = premier combat)
    gold: 10,
    nextId: 1,
    army: [{ id: 0, t: 'k', sq: 'e1' }],
    techs: { undo: 1, hint: 2 },
    relics: [],
    shop: [],
    fight: null,             // combat en cours
    pending: null,           // butin à choisir
    stats: { wins: 0, captures: 0, lost: 0 },
    over: null,
  };
  for (const [t, sq] of [['p', 'c2'], ['p', 'd2'], ['p', 'e2'], ['p', 'f2'], ['n', 'g1'], ['b', 'c1'], ['r', 'a1']]) {
    R.army.push({ id: R.nextId++, t, sq });
  }
  R.shop = makeShop(R);
  R.foes = makeFoes(R);
  return R;
}

export const isBoss = (floor) => floor === FLOORS - 1;

/* ---------------- Formation ---------------- */
const RANK1_ORDER = ['d1', 'c1', 'f1', 'b1', 'g1', 'a1', 'h1', 'e1'];
const RANK2_ORDER = ['d2', 'e2', 'c2', 'f2', 'b2', 'g2', 'a2', 'h2'];
export const FORMATION_SQS = [...'abcdefgh'].flatMap((f) => [f + '1', f + '2']);

export function canRecruit(R, t) {
  if (R.army.length - 1 >= MAX_UNITS) return 'Ton armée est complète (15 pièces).';
  if (t === 'p' && R.army.filter((u) => u.t === 'p').length >= 8) return 'Tu as déjà 8 pions.';
  return null;
}

/* Place une nouvelle pièce dans la formation (renvoie false si impossible) */
export function autoPlace(R, unit) {
  const taken = new Set(R.army.map((u) => u.sq));
  const free = (sq) => !taken.has(sq);
  if (unit.t === 'p') {
    let sq = RANK2_ORDER.find(free);
    if (!sq) {
      // rangée 2 pleine : on recule une pièce (pas un pion) en rangée 1
      const mover = R.army.find((u) => u.t !== 'p' && u.t !== 'k' && u.sq[1] === '2');
      const back = RANK1_ORDER.find(free);
      if (!mover || !back) return false;
      sq = mover.sq;
      mover.sq = back;
    }
    unit.sq = sq;
  } else {
    const sq = RANK1_ORDER.find(free) || RANK2_ORDER.find(free);
    if (!sq) return false;
    unit.sq = sq;
  }
  R.army.push(unit);
  return true;
}

export function recruit(R, t) {
  if (canRecruit(R, t)) return false;
  return autoPlace(R, { id: R.nextId++, t, sq: null });
}

/* Échange deux cases de la formation (les pions restent en rangée 2) */
export function swapFormation(R, a, b) {
  const ua = R.army.find((u) => u.sq === a), ub = R.army.find((u) => u.sq === b);
  if ((ua?.t === 'p' && b[1] === '1') || (ub?.t === 'p' && a[1] === '1')) return false;
  if (ua) ua.sq = b;
  if (ub) ub.sq = a;
  return true;
}

/* ---------------- Ennemis ---------------- */
const BUDGET = [6, 10, 14, 18, 22, 26, 30, 39];
const BACK_SLOTS = { r: ['a8', 'h8'], n: ['b8', 'g8'], b: ['c8', 'f8'], q: ['d8'] };
const PAWN_SLOTS = ['d7', 'e7', 'c7', 'f7', 'b7', 'g7', 'a7', 'h7'];
const SPARE_SLOTS = ['d8', 'c8', 'f8', 'b8', 'g8', 'a8', 'h8', 'd7', 'e7', 'c7', 'f7', 'b7', 'g7', 'a7', 'h7'];

export function enemyArmy(R, floor, kind, seed) {
  const rand = rng('foe:' + seed);
  if (kind === 'boss') {
    const units = [{ t: 'k', sq: 'e8' }];
    for (const [t, sqs] of Object.entries(BACK_SLOTS)) for (const sq of sqs) units.push({ t, sq });
    for (const sq of PAWN_SLOTS) units.push({ t: 'p', sq });
    if (R.relics.includes('sabotage')) units.splice(units.findIndex((u) => u.t === 'b'), 1);
    return units;
  }
  let budget = BUDGET[floor] + (kind === 'elite' ? 6 : 0) - (R.relics.includes('sabotage') ? 4 : 0);
  budget = Math.max(4, budget);
  const pieces = [];
  let pawns = Math.max(2, Math.min(8, Math.round(budget * (0.3 + rand() * 0.15))));
  budget -= pawns;
  const max = { q: floor >= 3 ? 1 : 0, r: 2, b: 2, n: 2 };
  const count = { q: 0, r: 0, b: 0, n: 0 };
  for (let guard = 0; guard < 40 && budget >= 3; guard++) {
    const opts = Object.keys(max).filter((t) => count[t] < max[t] && PTS[t] <= budget);
    if (!opts.length) break;
    const t = opts[Math.floor(rand() * opts.length)];
    count[t]++; pieces.push(t); budget -= PTS[t];
  }
  pawns = Math.min(8, pawns + budget);
  const units = [{ t: 'k', sq: 'e8' }];
  const taken = new Set(['e8']);
  for (const t of pieces) {
    const sq = BACK_SLOTS[t].find((s) => !taken.has(s)) || SPARE_SLOTS.find((s) => !taken.has(s));
    taken.add(sq); units.push({ t, sq });
  }
  for (let i = 0; i < pawns; i++) {
    const sq = PAWN_SLOTS.find((s) => !taken.has(s));
    if (!sq) break;
    taken.add(sq); units.push({ t: 'p', sq });
  }
  return units;
}

export function foeElo(R, floor, kind) {
  let e = R.elo + floor * 60 + (kind === 'elite' ? 120 : kind === 'boss' ? 220 : 0);
  if (R.relics.includes('spy')) e -= 150;
  return Math.max(100, Math.round(e));
}

export function foeReward(R, floor, kind) {
  let g = 6 + floor * 2;
  if (kind === 'elite') g = Math.round(g * 1.7);
  if (R.relics.includes('purse')) g = Math.round(g * 1.5);
  return g;
}

/* Les adversaires proposés pour l'étage en cours (normal + élite, ou le boss) */
export function makeFoes(R) {
  const kinds = isBoss(R.floor) ? ['boss'] : ['normal', 'elite'];
  return kinds.map((kind, i) => ({ kind, seed: (R.seed + R.floor * 101 + i * 7919) >>> 0 }));
}

export function armyPoints(units) {
  return units.reduce((s, u) => s + (PTS[u.t] || 0), 0);
}

/* ---------------- Position de départ ---------------- */
export function buildFen(mine, theirs) {
  const grid = Array.from({ length: 8 }, () => Array(8).fill(null));
  const put = (sq, ch) => { grid[8 - +sq[1]][sq.charCodeAt(0) - 97] = ch; };
  for (const u of mine) put(u.sq, u.t.toUpperCase());
  for (const u of theirs) put(u.sq, u.t);
  const rows = grid.map((row) => {
    let s = '', n = 0;
    for (const c of row) { if (!c) n++; else { if (n) s += n; n = 0; s += c; } }
    return s + (n ? n : '');
  });
  return `${rows.join('/')} w - - 0 1`;
}

/* La position est-elle jouable après une technique ? (c'est toujours à toi de jouer) */
export function positionOk(fen) {
  if (!validateFen(fen).ok) return false;
  const parts = fen.split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  parts[3] = '-';
  try {
    const other = new Chess(parts.join(' '));
    if (other.inCheck()) return false;       // le camp qui attend ne peut pas être en échec
    const me = new Chess(fen);
    if (me.inCheck()) return false;          // on ne se met pas soi-même en échec
    return !me.isGameOver();
  } catch { return false; }
}

/* ---------------- Marché & butin ---------------- */
function pickWeighted(rand, entries) {
  const total = entries.reduce((s, e) => s + e[1], 0);
  let x = rand() * total;
  for (const [v, w] of entries) { x -= w; if (x <= 0) return v; }
  return entries[0][0];
}
function randomPiece(rand, floor) {
  return pickWeighted(rand, [['p', 5], ['n', 3], ['b', 3], ['r', 2], ['q', floor >= 2 ? 1 : 0.3]]);
}
const randomTech = (rand) => pickWeighted(rand, [['undo', 3], ['hint', 3], ['freeze', 2], ['pawn', 3], ['knight', 2], ['swap', 2], ['smite', 2]]);
function randomRelic(rand, R, exclude = []) {
  const left = Object.keys(RELICS).filter((k) => !R.relics.includes(k) && !exclude.includes(k));
  return left.length ? left[Math.floor(rand() * left.length)] : null;
}

export function priceOf(R, item) {
  const base = item.kind === 'piece' ? PIECE_PRICES[item.id] : item.kind === 'tech' ? TECHS[item.id].price : RELICS[item.id].price;
  return R.relics.includes('merchant') ? Math.max(1, Math.round(base * 0.75)) : base;
}

export function makeShop(R) {
  const rand = rng(`shop:${R.seed}:${R.floor}`);
  const items = [];
  for (let i = 0; i < 3; i++) items.push({ kind: 'piece', id: randomPiece(rand, R.floor) });
  const t1 = randomTech(rand);
  let t2 = randomTech(rand);
  if (t2 === t1) t2 = randomTech(rand);
  items.push({ kind: 'tech', id: t1 }, { kind: 'tech', id: t2 });
  const rel = randomRelic(rand, R);
  if (rel) items.push({ kind: 'relic', id: rel });
  return items.map((it) => ({ ...it, sold: false }));
}

export function makeLoot(R, kind) {
  const rand = rng(`loot:${R.seed}:${R.floor}`);
  const out = [{ kind: 'piece', id: randomPiece(rand, R.floor + 1) }, { kind: 'tech', id: randomTech(rand) }];
  const rel = (kind === 'elite' || rand() < 0.25) ? randomRelic(rand, R, R.shop.filter((s) => s.kind === 'relic').map((s) => s.id)) : null;
  if (rel) out.push({ kind: 'relic', id: rel });
  else {
    let t = randomTech(rand);
    if (t === out[1].id) t = randomTech(rand);
    out.push({ kind: 'tech', id: t });
  }
  return out;
}

export function itemName(item) {
  return item.kind === 'piece' ? PIECE_NAMES[item.id] : item.kind === 'tech' ? TECHS[item.id].name : RELICS[item.id].name;
}
export function itemDesc(item) {
  if (item.kind === 'piece') return 'Rejoint ton armée pour toute la croisade.';
  return item.kind === 'tech' ? TECHS[item.id].desc : RELICS[item.id].desc;
}

/* Donne un objet (acheté ou gagné). Renvoie un message d'erreur, ou null. */
export function grant(R, item) {
  if (item.kind === 'piece') {
    const why = canRecruit(R, item.id);
    if (why) return why;
    if (!recruit(R, item.id)) return 'Plus de place dans ta formation.';
  } else if (item.kind === 'tech') {
    R.techs[item.id] = (R.techs[item.id] || 0) + 1;
  } else {
    if (R.relics.includes(item.id)) return 'Tu as déjà cette relique.';
    R.relics.push(item.id);
  }
  return null;
}
