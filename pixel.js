/* =========================================================
   PIXEL ART — tout est dessiné ici, pixel par pixel, en code.
   Pièces en bois sculpté, échiquier en marqueterie, avatars,
   drapeaux, badges de rang et fond en planches.
   ========================================================= */

// Petit générateur pseudo-aléatoire déterministe (même graine = même dessin)
export function rng(seed) {
  let s = (typeof seed === 'string' ? hashStr(seed) : seed) >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
export function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}
const px = (ctx, x, y, col, w = 1, h = 1) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };

/* ---------------- PIÈCES (silhouettes 16×16) ----------------
   x = bois, o = gravure (trait sombre), e = œil
   Le contour, la lumière (à gauche) et l'ombre (à droite)
   sont calculés automatiquement, puis on ajoute le veinage. */
const SHAPES = {
  p: [
    '................',
    '................',
    '................',
    '......xxxx......',
    '.....xxxxxx.....',
    '.....xxxxxx.....',
    '.....xxxxxx.....',
    '......xxxx......',
    '.....xxxxxx.....',
    '......xxxx......',
    '......xxxx......',
    '.....xxxxxx.....',
    '....xxxxxxxx....',
    '...xxxxxxxxxx...',
    '...xxxxxxxxxx...',
    '................',
  ],
  r: [
    '................',
    '................',
    '...xx.xxxx.xx...',
    '...xx.xxxx.xx...',
    '...xxxxxxxxxx...',
    '...xxxxxxxxxx...',
    '....xxxxxxxx....',
    '.....xxxxxx.....',
    '.....xxoxxx.....',
    '.....xxxxxx.....',
    '.....xxxxox.....',
    '....xxxxxxxx....',
    '...xxxxxxxxxx...',
    '..xxxxxxxxxxxx..',
    '..xxxxxxxxxxxx..',
    '................',
  ],
  n: [
    '................',
    '........xx......',
    '.......xxxx.....',
    '......xxxxxxx...',
    '.....xxxxxxxxx..',
    '....xxxexxxxxx..',
    '...xxxxxxxxxxx..',
    '..xoxxxxxxxxxx..',
    '..xxxxx.xxxxxx..',
    '...xxx..xxxxxx..',
    '.......xxxxxxx..',
    '......xxxxxxxx..',
    '.....xxxxxxxxx..',
    '...xxxxxxxxxxxx.',
    '...xxxxxxxxxxxx.',
    '................',
  ],
  b: [
    '................',
    '.......xx.......',
    '......xxxx......',
    '.....xxxxxx.....',
    '.....xxxoxx.....',
    '....xxxoxxxx....',
    '....xxxxxxxx....',
    '.....xxxxxx.....',
    '......xxxx......',
    '.....xxxxxx.....',
    '......xxxx......',
    '.....xxxxxx.....',
    '....xxxxxxxx....',
    '...xxxxxxxxxx...',
    '...xxxxxxxxxx...',
    '................',
  ],
  q: [
    '................',
    '..x....xx....x..',
    '..xx..xxxx..xx..',
    '..xxx.xxxx.xxx..',
    '..xxxxxxxxxxxx..',
    '...xxxxxxxxxx...',
    '....xxxxxxxx....',
    '.....xxxxxx.....',
    '....xoooooox....',
    '.....xxxxxx.....',
    '.....xxxxxx.....',
    '....xxxxxxxx....',
    '...xxxxxxxxxx...',
    '..xxxxxxxxxxxx..',
    '..xxxxxxxxxxxx..',
    '................',
  ],
  k: [
    '.......xx.......',
    '......xxxx......',
    '.......xx.......',
    '..xxx..xx..xxx..',
    '.xxxxxxxxxxxxxx.',
    '.xxxxxxxxxxxxxx.',
    '..xxxxxxxxxxxx..',
    '...xxxxxxxxxx...',
    '...xoooooooox...',
    '.....xxxxxx.....',
    '.....xxxxxx.....',
    '....xxxxxxxx....',
    '...xxxxxxxxxx...',
    '..xxxxxxxxxxxx..',
    '..xxxxxxxxxxxx..',
    '................',
  ],
};

const WOOD = {
  w: { line: '#3b2412', dark: '#b88b55', base: '#e6c793', grain: '#d9b680', light: '#fbeccb', gold: '#c9932e' },
  b: { line: '#120a05', dark: '#2a170c', base: '#4d2e1a', grain: '#3f2414', light: '#82573a', gold: '#a8742a' },
};

const pieceCache = new Map();
export function pieceSprite(color, type) {
  const key = color + type;
  if (pieceCache.has(key)) return pieceCache.get(key);
  const shape = SHAPES[type];
  const pal = WOOD[color];
  const [c, ctx] = canvas(16, 16);
  const at = (x, y) => (y < 0 || y > 15 || x < 0 || x > 15 ? '.' : shape[y][x]);
  const isFill = (ch) => ch !== '.';
  const isEdge = (x, y) => {
    if (!isFill(at(x, y))) return false;
    return !isFill(at(x - 1, y)) || !isFill(at(x + 1, y)) || !isFill(at(x, y - 1)) || !isFill(at(x, y + 1));
  };
  const phase = type.charCodeAt(0) * 0.7 + (color === 'b' ? 2 : 0);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const ch = at(x, y);
      if (!isFill(ch)) continue;
      let col;
      if (ch === 'o' || ch === 'e' || isEdge(x, y)) col = pal.line;
      else if (isEdge(x - 1, y) || (isEdge(x, y - 1) && x < 8)) col = pal.light;
      else if (isEdge(x + 1, y) || isEdge(x, y + 1) || isEdge(x + 1, y + 1)) col = pal.dark;
      else {
        const g = Math.round(y + Math.sin(x * 0.8 + phase) * 1.3);
        col = g % 3 === 0 ? pal.grain : pal.base;
      }
      px(ctx, x, y, col);
    }
  }
  // petit reflet doré sur la dame et le roi
  if (type === 'k') { px(ctx, 7, 1, pal.gold, 2, 1); }
  if (type === 'q') { px(ctx, 7, 2, pal.gold, 2, 1); }
  const url = c.toDataURL();
  pieceCache.set(key, url);
  return url;
}

/* ---------------- Mini police 3×5 pour les coordonnées ---------------- */
const GLYPHS = {
  1: ['.x.', 'xx.', '.x.', '.x.', 'xxx'], 2: ['xx.', '..x', '.x.', 'x..', 'xxx'],
  3: ['xx.', '..x', '.x.', '..x', 'xx.'], 4: ['x.x', 'x.x', 'xxx', '..x', '..x'],
  5: ['xxx', 'x..', 'xx.', '..x', 'xx.'], 6: ['.xx', 'x..', 'xxx', 'x.x', 'xxx'],
  7: ['xxx', '..x', '.x.', '.x.', '.x.'], 8: ['xxx', 'x.x', 'xxx', 'x.x', 'xxx'],
  a: ['.x.', 'x.x', 'xxx', 'x.x', 'x.x'], b: ['xx.', 'x.x', 'xx.', 'x.x', 'xx.'],
  c: ['.xx', 'x..', 'x..', 'x..', '.xx'], d: ['xx.', 'x.x', 'x.x', 'x.x', 'xx.'],
  e: ['xxx', 'x..', 'xx.', 'x..', 'xxx'], f: ['xxx', 'x..', 'xx.', 'x..', 'x..'],
  g: ['.xx', 'x..', 'x.x', 'x.x', '.xx'], h: ['x.x', 'x.x', 'xxx', 'x.x', 'x.x'],
};
function glyph(ctx, ch, x, y, col) {
  const g = GLYPHS[ch];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (g[r][c] === 'x') px(ctx, x + c, y + r, col);
}

/* ---------------- Veinage du bois ---------------- */
function woodPatch(ctx, ox, oy, w, h, tones, seed, vertical = false) {
  const R = rng(seed);
  const p1 = R() * 10, p2 = R() * 10, freq = 0.25 + R() * 0.2, skew = R() * 0.4 - 0.2;
  const knot = R() < 0.18 ? { x: R() * w, y: R() * h, r: 1.5 + R() * 1.5 } : null;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const u = vertical ? j : i, v = vertical ? i : j;
      let t = v + Math.sin(u * freq + p1) * 1.4 + Math.sin(u * 0.9 + p2) * 0.5 + u * skew;
      if (knot) {
        const d = Math.hypot(i - knot.x, j - knot.y);
        if (d < knot.r * 3) t += (knot.r * 3 - d) * 0.9;
        if (d < knot.r * 0.7) { px(ctx, ox + i, oy + j, tones[2]); continue; }
      }
      const band = Math.floor(t * 0.75);
      let idx = [0, 0, 1, 0, 2, 0, 1][((band % 7) + 7) % 7];
      const n = R();
      if (n < 0.05) idx = 3; else if (n < 0.08) idx = 1;
      px(ctx, ox + i, oy + j, tones[idx]);
    }
  }
}

const LIGHT_SQ = ['#e8c796', '#dcb682', '#cfa66f', '#f2d8ad'];
const DARK_SQ = ['#9f6338', '#8f5530', '#7d4827', '#b07446'];
const FRAME = ['#5b3420', '#4e2b1a', '#3f2214', '#6c4129'];

/* Échiquier complet 144×144 : cadre 8 px + 8×8 cases de 16 px */
export function boardImage(orientation = 'w') {
  const [c, ctx] = canvas(144, 144);
  woodPatch(ctx, 0, 0, 144, 144, FRAME, 777);
  // biseau du cadre
  px(ctx, 0, 0, '#1d0f07', 144, 1); px(ctx, 0, 143, '#1d0f07', 144, 1);
  px(ctx, 0, 0, '#1d0f07', 1, 144); px(ctx, 143, 0, '#1d0f07', 1, 144);
  px(ctx, 1, 1, '#7d4d30', 142, 1); px(ctx, 1, 1, '#7d4d30', 1, 142);
  px(ctx, 1, 142, '#2e180c', 142, 1); px(ctx, 142, 1, '#2e180c', 1, 142);
  px(ctx, 7, 7, '#24130a', 130, 1); px(ctx, 7, 7, '#24130a', 1, 130);
  px(ctx, 7, 136, '#8a5a39', 130, 1); px(ctx, 136, 7, '#8a5a39', 1, 130);

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const light = (r + f) % 2 === 1;
      const x = 8 + (orientation === 'w' ? f : 7 - f) * 16;
      const y = 8 + (orientation === 'w' ? 7 - r : r) * 16;
      woodPatch(ctx, x, y, 16, 16, light ? LIGHT_SQ : DARK_SQ, 1000 + r * 8 + f, (r + f) % 4 === 0);
    }
  }
  // coordonnées gravées dans le cadre
  const files = 'abcdefgh';
  for (let i = 0; i < 8; i++) {
    const file = orientation === 'w' ? files[i] : files[7 - i];
    const rank = orientation === 'w' ? 8 - i : i + 1;
    glyph(ctx, file, 8 + i * 16 + 7, 138, '#2a160b');
    glyph(ctx, file, 8 + i * 16 + 6, 137, '#d9a877');
    glyph(ctx, String(rank), 3, 8 + i * 16 + 6, '#2a160b');
    glyph(ctx, String(rank), 2, 8 + i * 16 + 5, '#d9a877');
  }
  return c.toDataURL();
}

/* Fond : planches de bois sombre (tuile 64×64) */
export function tableTexture(tones = ['#2b1a10', '#25160d', '#20120a', '#33200f']) {
  const [c, ctx] = canvas(64, 64);
  for (let i = 0; i < 4; i++) {
    woodPatch(ctx, 0, i * 16, 64, 16, tones, 50 + i);
    px(ctx, 0, i * 16 + 15, '#140b05', 64, 1);
    px(ctx, ((i * 37) % 48) + 8, i * 16, '#140b05', 1, 15);
  }
  return c.toDataURL();
}

/* Panneau parchemin (tuile 32×32) */
export function paperTexture() {
  const [c, ctx] = canvas(32, 32);
  const R = rng(9);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const n = R();
    px(ctx, x, y, n < 0.08 ? '#d9c08f' : n < 0.14 ? '#efdcb3' : '#e6d0a1');
  }
  return c.toDataURL();
}

/* ---------------- AVATARS 16×16 générés ---------------- */
const SKINS = [['#f6d2b4', '#dba98a'], ['#eec09a', '#cf9a73'], ['#d29b6c', '#b07a4f'], ['#a8714a', '#8a5735'], ['#7a4b2c', '#5f3820'], ['#f3dcc6', '#d6b49a']];
const HAIRS = ['#2b1a10', '#5a3418', '#a0612b', '#d9a441', '#e8e0c8', '#b83a26', '#1c1c2a', '#6b6b78'];
const BGS = ['#5a8a4a', '#4a6f9a', '#9a5a4a', '#7a5a9a', '#9a8a4a', '#4a8a8a', '#8a4a6a', '#6a6a6a'];
const SHIRTS = ['#c0392b', '#2e86c1', '#27ae60', '#8e44ad', '#d68910', '#34495e', '#16a085', '#e67e22'];

const avatarCache = new Map();
export function avatar(seed) {
  const key = String(seed);
  if (avatarCache.has(key)) return avatarCache.get(key);
  const R = rng('av' + key);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const G = Array.from({ length: 16 }, () => Array(16).fill(null));
  const set = (x, y, c) => { if (x >= 0 && x < 16 && y >= 0 && y < 16) G[y][x] = c; };
  const rect = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(x + i, y + j, c); };

  const [skin, skinD] = pick(SKINS);
  const hair = pick(HAIRS);
  const shirt = pick(SHIRTS);
  const bg = pick(BGS);
  const hairStyle = Math.floor(R() * 6);
  const glasses = R() < 0.25;
  const beard = R() < 0.22;
  const hat = R() < 0.18;

  // épaules
  rect(2, 13, 12, 3, shirt); rect(3, 12, 10, 1, shirt);
  rect(6, 12, 4, 1, skinD); rect(7, 13, 2, 1, skinD);
  // tête
  rect(4, 4, 8, 8, skin); rect(5, 3, 6, 1, skin); rect(5, 12, 6, 0, skin);
  rect(3, 7, 1, 2, skin); rect(12, 7, 1, 2, skin); // oreilles
  rect(11, 5, 1, 6, skinD); rect(5, 11, 6, 1, skinD);
  // cheveux
  if (hairStyle === 0) { rect(4, 2, 8, 2, hair); rect(4, 4, 1, 2, hair); rect(11, 4, 1, 2, hair); }
  if (hairStyle === 1) { rect(3, 2, 10, 3, hair); rect(3, 5, 1, 7, hair); rect(12, 5, 1, 7, hair); rect(2, 8, 1, 5, hair); rect(13, 8, 1, 5, hair); }
  if (hairStyle === 2) { rect(7, 0, 2, 4, hair); }
  if (hairStyle === 3) { rect(4, 2, 8, 2, hair); rect(6, 0, 4, 2, hair); }
  if (hairStyle === 4) { rect(4, 3, 8, 1, hair); rect(5, 2, 6, 1, hair); rect(4, 4, 3, 1, hair); }
  if (hairStyle === 5) { rect(3, 2, 10, 2, hair); rect(3, 4, 2, 3, hair); rect(11, 4, 2, 3, hair); rect(5, 4, 2, 1, hair); }
  if (hat) { const hc = pick(SHIRTS); rect(4, 1, 8, 3, hc); rect(3, 3, 11, 1, hc); rect(5, 2, 2, 1, shade(hc, 40)); }
  // yeux
  const eyeY = 7;
  set(6, eyeY, '#1a1010'); set(9, eyeY, '#1a1010');
  if (R() < 0.5) { set(5, eyeY - 1, hair); set(6, eyeY - 1, hair); set(9, eyeY - 1, hair); set(10, eyeY - 1, hair); }
  if (glasses) {
    const gc = R() < 0.5 ? '#1a1010' : '#c9932e';
    rect(5, 6, 3, 1, gc); rect(8, 6, 3, 1, gc); set(5, 7, gc); set(7, 7, gc); set(8, 7, gc); set(10, 7, gc); rect(5, 8, 3, 1, gc); rect(8, 8, 3, 1, gc);
    set(6, 7, '#1a1010'); set(9, 7, '#1a1010');
  }
  // joues + bouche
  set(5, 9, skinD); set(10, 9, skinD);
  const mouth = Math.floor(R() * 3);
  if (mouth === 0) rect(7, 10, 2, 1, '#7a2a20');
  if (mouth === 1) { set(6, 9, '#7a2a20'); rect(7, 10, 2, 1, '#7a2a20'); set(9, 9, '#7a2a20'); }
  if (mouth === 2) rect(6, 10, 4, 1, '#7a2a20');
  if (beard) { rect(4, 9, 1, 3, hair); rect(11, 9, 1, 3, hair); rect(5, 10, 1, 2, hair); rect(10, 10, 1, 2, hair); rect(6, 11, 4, 1, hair); rect(7, 10, 2, 1, '#7a2a20'); }

  const [c, ctx] = canvas(16, 16);
  // fond avec léger dégradé pixel
  for (let y = 0; y < 16; y++) px(ctx, 0, y, y < 8 ? bg : shade(bg, -12), 16, 1);
  // contour automatique
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (G[y][x]) continue;
    const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => G[y + dy]?.[x + dx]);
    if (n) px(ctx, x, y, shade(bg, -45));
  }
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (G[y][x]) px(ctx, x, y, G[y][x]);
  const url = c.toDataURL();
  avatarCache.set(key, url);
  return url;
}

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1, 7), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

/* ---------------- DRAPEAUX 10×7 ---------------- */
const FLAGS = {
  FR: { v: ['#2a4fa0', '#f4f4f4', '#d0343a'] },
  BE: { v: ['#1a1a1a', '#f2c418', '#d0343a'] },
  IT: { v: ['#2a8a4a', '#f4f4f4', '#d0343a'] },
  IE: { v: ['#2a8a4a', '#f4f4f4', '#e8892a'] },
  CI: { v: ['#e8892a', '#f4f4f4', '#2a8a4a'] },
  DE: { h: ['#1a1a1a', '#d0343a', '#f2c418'] },
  NL: { h: ['#c0303a', '#f4f4f4', '#2a4fa0'] },
  AT: { h: ['#d0343a', '#f4f4f4', '#d0343a'] },
  UA: { h: ['#2a6ad0', '#2a6ad0', '#f2c418', '#f2c418'] },
  ES: { h: ['#c0303a', '#f2c418', '#f2c418', '#c0303a'] },
  JP: { jp: true },
  CH: { ch: true },
  CA: { ca: true },
  MA: { ma: true },
  SN: { v: ['#2a8a4a', '#f2c418', '#d0343a'], star: true },
};
export const FLAG_CODES = Object.keys(FLAGS);
const flagCache = new Map();
export function flag(code) {
  if (flagCache.has(code)) return flagCache.get(code);
  const f = FLAGS[code] || FLAGS.FR;
  const [c, ctx] = canvas(10, 7);
  if (f.v) { const w = [3, 4, 3]; let x = 0; f.v.forEach((col, i) => { px(ctx, x, 0, col, w[i], 7); x += w[i]; }); }
  if (f.h) { const n = f.h.length; f.h.forEach((col, i) => px(ctx, 0, Math.round(i * 7 / n), col, 10, Math.ceil(7 / n))); }
  if (f.jp) { px(ctx, 0, 0, '#f4f4f4', 10, 7); px(ctx, 4, 2, '#d0343a', 2, 3); px(ctx, 3, 3, '#d0343a', 4, 1); }
  if (f.ch) { px(ctx, 0, 0, '#d0343a', 10, 7); px(ctx, 4, 1, '#f4f4f4', 2, 5); px(ctx, 2, 3, '#f4f4f4', 6, 1); }
  if (f.ca) { px(ctx, 0, 0, '#d0343a', 3, 7); px(ctx, 3, 0, '#f4f4f4', 4, 7); px(ctx, 7, 0, '#d0343a', 3, 7); px(ctx, 4, 2, '#d0343a', 2, 3); px(ctx, 3, 3, '#d0343a', 4, 1); }
  if (f.ma) { px(ctx, 0, 0, '#c0303a', 10, 7); px(ctx, 4, 2, '#2a8a4a', 2, 1); px(ctx, 3, 3, '#2a8a4a', 1, 1); px(ctx, 6, 3, '#2a8a4a', 1, 1); px(ctx, 4, 4, '#2a8a4a', 2, 1); }
  if (f.star) px(ctx, 4, 3, '#2a8a4a', 2, 1);
  const url = c.toDataURL();
  flagCache.set(code, url);
  return url;
}

/* ---------------- BADGES DE RANG (écusson 12×12) ---------------- */
export const RANKS = [
  { min: 0,    name: 'Bois',        col: '#8a5a32' },
  { min: 600,  name: 'Bronze',      col: '#c07a3a' },
  { min: 900,  name: 'Argent',      col: '#b8c0c8' },
  { min: 1200, name: 'Or',          col: '#f2b134' },
  { min: 1500, name: 'Platine',     col: '#5fd0c0' },
  { min: 1800, name: 'Diamant',     col: '#6aa8ff' },
  { min: 2100, name: 'Maître',      col: '#c070e8' },
  { min: 2400, name: 'Grand Maître', col: '#ff5a5a' },
];
export const rankOf = (elo) => [...RANKS].reverse().find((r) => elo >= r.min);

const SHIELD = [
  '.oooooooooo.',
  'oHHHHHHHHHBo',
  'oHBBBBBBBBSo',
  'oHBBBBBBBBSo',
  'oHBBBsBBBBSo',
  'oHBBsssBBBSo',
  'oHBBBsBBBBSo',
  '.oHBBBBBBSo.',
  '.oHBBBBBBSo.',
  '..oHBBBBSo..',
  '...oHBBSo...',
  '....oooo....',
];
const badgeCache = new Map();
export function badge(elo) {
  const r = rankOf(elo);
  if (badgeCache.has(r.name)) return badgeCache.get(r.name);
  const [c, ctx] = canvas(12, 12);
  const map = { o: '#1a0f08', H: shade(r.col, 50), B: r.col, S: shade(r.col, -45), s: '#fff7e0' };
  SHIELD.forEach((row, y) => [...row].forEach((ch, x) => { if (map[ch]) px(ctx, x, y, map[ch]); }));
  const url = c.toDataURL();
  badgeCache.set(r.name, url);
  return url;
}

/* ---------------- Petites icônes 9×9 ---------------- */
const ICONS = {
  back:   ['....o....', '...oo....', '..ooooooo', '.oooooooo', '..ooooooo', '...oo....', '....o....', '.........', '.........'],
  flag:   ['oo.......', 'ooooooo..', 'oooooooo.', 'ooooooo..', 'oo.......', 'o........', 'o........', 'o........', 'o........'],
  flip:   ['..o...o..', '.ooo..o..', 'ooooo.o..', '..o...o..', '..o...o..', '..o..oooo', '..o...ooo', '..o....o.', '.........'],
  undo:   ['...o.....', '..oo.....', '.oooooo..', '..oo...o.', '...o....o', '........o', '.......o.', '....ooo..', '.........'],
  bulb:   ['...ooo...', '..o...o..', '.o.....o.', '.o.....o.', '..o...o..', '...ooo...', '...ooo...', '....o....', '.........'],
  hand:   ['.........', '..o.o.o..', '..o.o.o.o', '..ooooo.o', '.oooooooo', '.oooooooo', '..ooooooo', '...ooooo.', '.........'],
  sound:  ['....o....', '...oo..o.', 'ooooo...o', 'ooooo.o.o', 'ooooo...o', '...oo..o.', '....o....', '.........', '.........'],
  mute:   ['....o....', '...oo....', 'ooooo.o.o', 'ooooo..o.', 'ooooo.o.o', '...oo....', '....o....', '.........', '.........'],
  sword:  ['.......oo', '......ooo', '.....ooo.', 'o...ooo..', '.o.ooo...', '..ooo....', '.ooo.....', 'oo.o.....', 'o...o....'],
  heart:  ['.........', '.oo...oo.', 'oooo.oooo', 'ooooooooo', 'ooooooooo', '.ooooooo.', '..ooooo..', '...ooo...', '....o....'],
  pencil: ['......oo.', '.....oooo', '....oooo.', '...oooo..', '..oooo...', '.oooo....', '.ooo.....', 'oo.......', '.........'],
};
const iconCache = new Map();
export function icon(name, col = '#f3e2c0') {
  const key = name + col;
  if (iconCache.has(key)) return iconCache.get(key);
  const [c, ctx] = canvas(9, 9);
  ICONS[name].forEach((row, y) => [...row].forEach((ch, x) => { if (ch === 'o') px(ctx, x, y, col); }));
  const url = c.toDataURL();
  iconCache.set(key, url);
  return url;
}
