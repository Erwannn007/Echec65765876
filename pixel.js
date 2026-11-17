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
   x = bois, o = gravure (trait sombre), e = œil, g = or (croix, perles)
   Le contour, la lumière (à gauche) et l'ombre (à droite)
   sont calculés automatiquement, puis on ajoute le veinage. */
const SHAPES = {
  // Pion : tête ronde sur un socle large
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
  // Tour : créneaux bien découpés, corps droit et massif
  r: [
    '................',
    '................',
    '..xxx.xxxx.xxx..',
    '..xxx.xxxx.xxx..',
    '..xxxxxxxxxxxx..',
    '..xxxxxxxxxxxx..',
    '...xxxxxxxxxx...',
    '....xxxxxxxx....',
    '....xxxxxxxx....',
    '....xoooooox....',
    '....xxxxxxxx....',
    '....xxxxxxxx....',
    '...xxxxxxxxxx...',
    '..xxxxxxxxxxxx..',
    '..xxxxxxxxxxxx..',
    '................',
  ],
  // Cavalier : tête de cheval avec crinière
  n: [
    '................',
    '.......xx.......',
    '......xxxxx.....',
    '.....xxxxxxxx...',
    '....xxxxxxxxxx..',
    '...xxxexxxxxoxx.',
    '..xxxxxxxxxxxox.',
    '..xoxxxxxxxxxox.',
    '..xxxxx.xxxxxox.',
    '...xxx..xxxxxxx.',
    '.......xxxxxxx..',
    '......xxxxxxxx..',
    '.....xxxxxxxxx..',
    '...xxxxxxxxxxxx.',
    '...xxxxxxxxxxxx.',
    '................',
  ],
  // Fou : grande mitre pointue avec une entaille en diagonale
  b: [
    '.......gg.......',
    '.......xx.......',
    '......xxxx......',
    '.....xxxxxx.....',
    '....xxxxx.xx....',
    '....xxxx.xxx....',
    '....xxxxxxxx....',
    '....xxxxxxxx....',
    '.....xxxxxx.....',
    '......xxxx......',
    '....xxxxxxxx....',
    '......xxxx......',
    '.....xxxxxx.....',
    '...xxxxxxxxxx...',
    '...xxxxxxxxxx...',
    '................',
  ],
  // Dame : couronne à pointes fines surmontées de perles dorées
  q: [
    '..g..g.gg.g..g..',
    '..x..x.xx.x..x..',
    '..xx.xxxxxx.xx..',
    '..xxxxxxxxxxxx..',
    '...xxxxxxxxxx...',
    '...xoooooooox...',
    '....xxxxxxxx....',
    '.....xxxxxx.....',
    '......xxxx......',
    '.....xxxxxx.....',
    '......xxxx......',
    '.....xxxxxx.....',
    '....xxxxxxxx....',
    '..xxxxxxxxxxxx..',
    '..xxxxxxxxxxxx..',
    '................',
  ],
  // Roi : grande croix dorée sur un dôme arrondi
  k: [
    '.......gg.......',
    '.....gggggg.....',
    '.......gg.......',
    '......xxxx......',
    '....xxxxxxxx....',
    '...xxxxxxxxxx...',
    '..xxxxxxxxxxxx..',
    '..xxxxxxxxxxxx..',
    '...xoooooooox...',
    '....xxxxxxxx....',
    '.....xxxxxx.....',
    '....xxxxxxxx....',
    '.....xxxxxx.....',
    '..xxxxxxxxxxxx..',
    '..xxxxxxxxxxxx..',
    '................',
  ],
};

const WOOD = {
  w: { line: '#3b2412', dark: '#b88b55', base: '#e6c793', grain: '#d9b680', light: '#fbeccb', gold: '#c9932e', goldHi: '#f2c94c' },
  b: { line: '#120a05', dark: '#2a170c', base: '#4d2e1a', grain: '#3f2414', light: '#82573a', gold: '#c9932e', goldHi: '#f2c94c' },
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
      if (ch === 'g') col = (y === 0 || at(x, y - 1) === '.') ? pal.goldHi : pal.gold;
      else if (ch === 'o' || ch === 'e' || isEdge(x, y)) col = pal.line;
      else if (isEdge(x - 1, y) || (isEdge(x, y - 1) && x < 8)) col = pal.light;
      else if (isEdge(x + 1, y) || isEdge(x, y + 1) || isEdge(x + 1, y + 1)) col = pal.dark;
      else {
        const g = Math.round(y + Math.sin(x * 0.8 + phase) * 1.3);
        col = g % 3 === 0 ? pal.grain : pal.base;
      }
      px(ctx, x, y, col);
    }
  }
  // ombre portée sous le socle pour bien poser la pièce sur la case
  let x0 = 16, x1 = -1;
  for (let x = 0; x < 16; x++) if (isFill(at(x, 14))) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  if (x1 >= 0) px(ctx, x0 + 1, 15, 'rgba(0,0,0,0.35)', x1 - x0, 1);
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
    rect(5, 6, 6, 1, gc); set(5, 7, gc); set(7, 7, gc); set(8, 7, gc); set(10, 7, gc);
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
  left:   ['.....o...', '....oo...', '...ooo...', '..oooo...', '.ooooo...', '..oooo...', '...ooo...', '....oo...', '.....o...'],
  right:  ['...o.....', '...oo....', '...ooo...', '...oooo..', '...ooooo.', '...oooo..', '...ooo...', '...oo....', '...o.....'],
  dice:   ['ooooooooo', 'o.ooooo.o', 'ooooooooo', 'ooooooooo', 'oooo.oooo', 'ooooooooo', 'ooooooooo', 'o.ooooo.o', 'ooooooooo'],
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

/* Tapis de feutre (tuile 32×32) */
export function feltTexture() {
  const [c, ctx] = canvas(32, 32);
  const R = rng(4242);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const n = R();
    px(ctx, x, y, n < 0.10 ? '#2a5230' : n < 0.17 ? '#356a3a' : n < 0.2 ? '#244828' : '#2f5d34');
  }
  return c.toDataURL();
}

/* Titre « ÉCHECS » en lettres pixel 5×7 dorées */
const LETTERS = {
  A: ['.xxx.', 'x...x', 'x...x', 'xxxxx', 'x...x', 'x...x', 'x...x'],
  B: ['xxxx.', 'x...x', 'x...x', 'xxxx.', 'x...x', 'x...x', 'xxxx.'],
  C: ['.xxxx', 'x....', 'x....', 'x....', 'x....', 'x....', '.xxxx'],
  D: ['xxxx.', 'x...x', 'x...x', 'x...x', 'x...x', 'x...x', 'xxxx.'],
  E: ['xxxxx', 'x....', 'x....', 'xxxx.', 'x....', 'x....', 'xxxxx'],
  F: ['xxxxx', 'x....', 'x....', 'xxxx.', 'x....', 'x....', 'x....'],
  G: ['.xxxx', 'x....', 'x....', 'x.xxx', 'x...x', 'x...x', '.xxxx'],
  H: ['x...x', 'x...x', 'x...x', 'xxxxx', 'x...x', 'x...x', 'x...x'],
  I: ['xxxxx', '..x..', '..x..', '..x..', '..x..', '..x..', 'xxxxx'],
  L: ['x....', 'x....', 'x....', 'x....', 'x....', 'x....', 'xxxxx'],
  M: ['x...x', 'xx.xx', 'x.x.x', 'x.x.x', 'x...x', 'x...x', 'x...x'],
  N: ['x...x', 'xx..x', 'x.x.x', 'x..xx', 'x...x', 'x...x', 'x...x'],
  O: ['.xxx.', 'x...x', 'x...x', 'x...x', 'x...x', 'x...x', '.xxx.'],
  P: ['xxxx.', 'x...x', 'x...x', 'xxxx.', 'x....', 'x....', 'x....'],
  R: ['xxxx.', 'x...x', 'x...x', 'xxxx.', 'x.x..', 'x..x.', 'x...x'],
  S: ['.xxxx', 'x....', 'x....', '.xxx.', '....x', '....x', 'xxxx.'],
  T: ['xxxxx', '..x..', '..x..', '..x..', '..x..', '..x..', '..x..'],
  U: ['x...x', 'x...x', 'x...x', 'x...x', 'x...x', 'x...x', '.xxx.'],
  V: ['x...x', 'x...x', 'x...x', 'x...x', '.x.x.', '.x.x.', '..x..'],
  ' ': ['...', '...', '...', '...', '...', '...', '...'],
  '!': ['x', 'x', 'x', 'x', 'x', '.', 'x'],
};
const ACCENT = { 'É': 'E' };

/* Texte pixel doré avec contour et ombre (titres) */
export function pixelTitle(text) {
  const chars = [...text.toUpperCase()];
  const widths = chars.map((ch) => (LETTERS[ACCENT[ch] || ch] || LETTERS[' '])[0].length);
  const W = widths.reduce((a, b) => a + b + 1, -1), H = 10;
  const M = Array.from({ length: H }, () => Array(W).fill(0));
  let ox = 0;
  chars.forEach((ch, i) => {
    const g = LETTERS[ACCENT[ch] || ch] || LETTERS[' '];
    g.forEach((row, y) => [...row].forEach((v, x) => { if (v === 'x') M[y + 3][ox + x] = 1; }));
    if (ACCENT[ch]) { M[0][ox + 3] = 1; M[1][ox + 2] = 1; }
    ox += widths[i] + 1;
  });
  const pad = 2;
  const [c, ctx] = canvas(W + pad * 2 + 1, H + pad * 2 + 2);
  const on = (x, y) => M[y]?.[x] === 1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (on(x, y)) px(ctx, x + pad + 1, y + pad + 3, '#1a0c04');
  for (let y = -1; y <= H; y++) for (let x = -1; x <= W; x++) {
    if (on(x, y)) continue;
    let n = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (on(x + dx, y + dy)) n = true;
    if (n) { px(ctx, x + pad, y + pad, '#3a1e08'); px(ctx, x + pad, y + pad + 1, '#3a1e08'); }
  }
  const ramp = ['#ffe9a0', '#ffe9a0', '#ffd56a', '#ffd56a', '#f2b134', '#f2b134', '#f2b134', '#d99520', '#b07a18', '#b07a18'];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (on(x, y)) px(ctx, x + pad, y + pad, ramp[y]);
  return c.toDataURL();
}

export const wordmark = () => pixelTitle('ÉCHECS');

/* =========================================================
   AMBIANCE : lianes, lampe, plantes en pot, feuilles
   ========================================================= */
const LEAF_R = ['.GGG.', 'GgggG', '.GG..'];
const GREENS = { G: '#2f6b2a', g: '#6fb84a', h: '#9be06a', s: '#1e4a1c' };
function stamp(ctx, pattern, x, y, map, mirror = false) {
  pattern.forEach((row, j) => [...row].forEach((ch, i) => {
    if (map[ch]) px(ctx, x + (mirror ? row.length - 1 - i : i), y + j, map[ch]);
  }));
}

/* Liane suspendue : tige ondulante, feuilles alternées, parfois une fleur */
export function vine(seed, h) {
  const R = rng('vine' + seed);
  const W = 20;
  const [c, ctx] = canvas(W, h);
  const ph = R() * 6;
  const xs = [];
  for (let y = 0; y < h; y++) {
    const x = Math.round(W / 2 + Math.sin(y * 0.16 + ph) * 3 + Math.sin(y * 0.05) * 1.5);
    xs.push(x);
    px(ctx, x, y, '#2a5a1e');
    px(ctx, x + 1, y, y % 5 === 0 ? '#3f7a2a' : '#2a5a1e');
  }
  let side = R() < 0.5;
  for (let y = 3 + Math.floor(R() * 3); y < h - 3; y += 4 + Math.floor(R() * 4)) {
    const x = xs[y];
    const map = { G: GREENS.G, g: R() < 0.3 ? GREENS.h : GREENS.g };
    if (side) stamp(ctx, LEAF_R, x + 2, y - 1, map);
    else stamp(ctx, LEAF_R, x - 5, y - 1, map, true);
    side = !side;
  }
  // bout recourbé
  const xe = xs[h - 1];
  px(ctx, xe - 1, h - 2, GREENS.G); px(ctx, xe - 2, h - 3, GREENS.g);
  // petites fleurs
  if (R() < 0.7) {
    const fy = Math.floor(h * (0.4 + R() * 0.4)), fx = xs[fy] + (R() < 0.5 ? -3 : 3);
    const col = ['#f29ab8', '#f2e06a', '#d0a0ff', '#ffffff'][Math.floor(R() * 4)];
    px(ctx, fx, fy - 1, col); px(ctx, fx - 1, fy, col); px(ctx, fx + 1, fy, col); px(ctx, fx, fy + 1, col); px(ctx, fx, fy, '#f2b134');
  }
  return c.toDataURL();
}

/* Feuille qui tombe */
export function leafSprite(light = false) {
  const [c, ctx] = canvas(5, 3);
  stamp(ctx, LEAF_R, 0, 0, { G: GREENS.G, g: light ? GREENS.h : GREENS.g });
  return c.toDataURL();
}

/* Lampe suspendue (abat-jour vert, rebord laiton, ampoule chaude) */
export function lamp() {
  const W = 40, H = 24;
  const [c, ctx] = canvas(W, H);
  const cx = W / 2;
  px(ctx, cx - 3, 0, '#8a6a2a', 6, 3);           // douille
  px(ctx, cx - 3, 0, '#c9932e', 2, 3);
  for (let y = 3; y < 16; y++) {
    const half = Math.round(5 + (y - 3) * 1.15);
    for (let x = cx - half; x < cx + half; x++) {
      const t = (x - (cx - half)) / (half * 2);
      let col = t < 0.15 ? '#5f9a6a' : t < 0.35 ? '#3f7a4a' : t > 0.85 ? '#1c3a24' : '#2d5a3a';
      if (x === cx - half || x === cx + half - 1) col = '#0f2414';
      px(ctx, x, y, col);
    }
  }
  px(ctx, cx - 5, 3, '#0f2414', 10, 1);
  for (let x = 0; x < W; x++) { // rebord laiton
    const inShade = Math.abs(x + 0.5 - cx) < 20;
    if (!inShade) continue;
    px(ctx, x, 16, x < cx - 10 ? '#ffd56a' : '#c9932e');
    px(ctx, x, 17, '#8a5a1a');
  }
  // ampoule
  px(ctx, cx - 4, 18, '#ffd56a', 8, 1);
  px(ctx, cx - 5, 19, '#fff4c0', 10, 2);
  px(ctx, cx - 4, 21, '#fff4c0', 8, 1);
  px(ctx, cx - 3, 22, '#ffd56a', 6, 1);
  px(ctx, cx - 3, 19, '#ffffff', 3, 1);
  return c.toDataURL();
}

/* Plante en pot (pour l'étagère) */
export function pottedPlant(seed = 1) {
  const R = rng('pot' + seed);
  const [c, ctx] = canvas(18, 22);
  // feuilles en éventail
  const stems = 5 + Math.floor(R() * 3);
  for (let i = 0; i < stems; i++) {
    const ang = -Math.PI / 2 + (i / (stems - 1) - 0.5) * 2.3;
    const len = 7 + R() * 5;
    for (let t = 0; t < len; t++) {
      const x = Math.round(9 + Math.cos(ang) * t), y = Math.round(13 + Math.sin(ang) * t + (t * t) / 28);
      px(ctx, x, y, t > len - 3 ? GREENS.h : t % 3 === 0 ? GREENS.G : GREENS.g);
      if (t > 2 && t < len - 1) px(ctx, x + (ang < -Math.PI / 2 ? -1 : 1), y, GREENS.G);
    }
  }
  // pot en terre cuite
  px(ctx, 4, 13, '#3a1a0a', 10, 1);
  px(ctx, 4, 14, '#e08a5a', 10, 2);
  px(ctx, 4, 14, '#f2a67a', 2, 2);
  for (let y = 16; y < 22; y++) {
    const inset = Math.floor((y - 16) / 3);
    px(ctx, 5 + inset, y, '#c0643a', 8 - inset * 2, 1);
    px(ctx, 5 + inset, y, '#d9824e', 2, 1);
    px(ctx, 11 - inset, y, '#8a4024', 2, 1);
  }
  return c.toDataURL();
}

/* Faisceau de lumière en pixel art : cône tramé (Bayer 4×4) + rayons */
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
export function lightBeam() {
  const W = 110, H = 180;
  const [c, ctx] = canvas(W, H);
  const levels = ['', '#ffe0a01a', '#ffe0a033', '#ffe6b04d', '#fff0c870'];
  const cx = W / 2;
  for (let y = 0; y < H; y++) {
    const half = 4 + y * 0.29;                        // le cône s'élargit en descendant
    const fadeY = Math.pow(1 - y / H, 1.4);           // et s'éteint vers le bas
    for (let x = 0; x < W; x++) {
      const d = Math.abs(x + 0.5 - cx) / half;
      if (d > 1.15) continue;
      const edge = d < 0.55 ? 1 : Math.max(0, 1 - (d - 0.55) / 0.6);
      const ang = Math.atan2(x + 0.5 - cx, y + 6);
      const ray = Math.pow(Math.max(0, Math.sin(ang * 23 + 1.3)), 8) * 0.35 + Math.pow(Math.max(0, Math.sin(ang * 9)), 10) * 0.25;
      const hot = y < 14 ? (14 - y) / 14 * 0.5 : 0;   // plus vif près de l'ampoule
      const v = Math.min(1, (edge * (0.62 + ray) + hot) * fadeY) * (levels.length - 1);
      let lv = Math.floor(v);
      if ((v - lv) * 16 > BAYER[y % 4][x % 4]) lv++;
      if (lv > 0) px(ctx, x, y, levels[Math.min(lv, levels.length - 1)]);
    }
  }
  return c.toDataURL();
}
