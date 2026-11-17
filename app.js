import { Chess } from './lib/chess.js';

/* =========================================================
   BOTS — tous propulsés par Stockfish 19 (open source).
   Les niveaux faibles choisissent parmi plusieurs coups
   candidats (avec un peu de hasard) pour jouer « humain ».
   ========================================================= */
const BOTS = [
  { id: 'leo',    name: 'Léo',       desc: 'Découvre le jeu',       elo: 250,  piece: 'wP', color: '#6bb5e8', random: 0.45, temp: 600, search: { depth: 1, multipv: 10, skill: 0 } },
  { id: 'mila',   name: 'Mila',      desc: 'Débutante',             elo: 500,  piece: 'wN', color: '#e8a06b', random: 0.22, temp: 260, search: { depth: 2, multipv: 8, skill: 0 } },
  { id: 'hugo',   name: 'Hugo',      desc: 'Joue pour le plaisir',  elo: 800,  piece: 'wB', color: '#c78be0', random: 0.09, temp: 120, search: { depth: 3, multipv: 6, skill: 2 } },
  { id: 'sara',   name: 'Sara',      desc: 'Joueuse de club',       elo: 1100, piece: 'wR', color: '#e86b8a', random: 0.03, temp: 55,  search: { depth: 5, multipv: 5, skill: 5 } },
  { id: 'victor', name: 'Victor',    desc: 'Intermédiaire',         elo: 1400, piece: 'bN', color: '#5fb88a', search: { elo: 1400, movetime: 500 } },
  { id: 'elena',  name: 'Elena',     desc: 'Confirmée',             elo: 1700, piece: 'bB', color: '#d9b44a', search: { elo: 1700, movetime: 700 } },
  { id: 'orion',  name: 'Orion',     desc: 'Expert',                elo: 2000, piece: 'bR', color: '#5a7bd6', search: { elo: 2000, movetime: 900 } },
  { id: 'athena', name: 'Athéna',    desc: 'Maître',                elo: 2400, piece: 'bQ', color: '#b85454', search: { elo: 2400, movetime: 1200 } },
  { id: 'sf',     name: 'Stockfish', desc: 'Puissance maximale',    elo: 3000, piece: 'bK', color: '#3a3f4b', search: { skill: 20, movetime: 2000 } },
];

/* ---------------- Moteur (Web Worker UCI) ---------------- */
class Engine {
  constructor() {
    this.listeners = new Set();
    this.queue = Promise.resolve();
    this.worker = new Worker('engine/stockfish-19-lite-single.js');
    this.worker.onmessage = (e) => {
      const line = typeof e.data === 'string' ? e.data : '';
      for (const f of [...this.listeners]) f(line);
    };
    this.ready = this.init();
  }
  send(cmd) { this.worker.postMessage(cmd); }
  waitFor(pred) {
    return new Promise((resolve) => {
      const f = (l) => { if (pred(l)) { this.listeners.delete(f); resolve(l); } };
      this.listeners.add(f);
    });
  }
  async init() {
    this.send('uci');
    await this.waitFor((l) => l === 'uciok');
    this.send('setoption name Hash value 32');
    this.send('isready');
    await this.waitFor((l) => l === 'readyok');
  }
  stop() { this.send('stop'); }
  newGame() { this.queue = this.queue.then(() => { this.send('ucinewgame'); }); }

  search(fen, { multipv = 1, depth, movetime, skill = 20, elo } = {}) {
    const run = async () => {
      await this.ready;
      this.send(`setoption name MultiPV value ${multipv}`);
      this.send(`setoption name Skill Level value ${skill}`);
      if (elo) {
        this.send('setoption name UCI_LimitStrength value true');
        this.send(`setoption name UCI_Elo value ${Math.max(1320, Math.min(3190, elo))}`);
      } else {
        this.send('setoption name UCI_LimitStrength value false');
      }
      this.send('isready');
      await this.waitFor((l) => l === 'readyok');

      const lines = new Map();
      const onInfo = (l) => {
        if (!l.startsWith('info') || !l.includes(' pv ')) return;
        const mpv = +(l.match(/ multipv (\d+)/)?.[1] ?? 1);
        const cp = l.match(/ score cp (-?\d+)/);
        const mate = l.match(/ score mate (-?\d+)/);
        const move = l.match(/ pv (\S+)/)[1];
        let score = 0;
        if (cp) score = +cp[1];
        else if (mate) { const n = +mate[1]; score = n > 0 ? 100000 - n * 100 : -100000 - n * 100; }
        lines.set(mpv, { move, score });
      };
      this.listeners.add(onInfo);
      this.send(`position fen ${fen}`);
      this.send(depth ? `go depth ${depth}` : `go movetime ${movetime || 1000}`);
      const bm = await this.waitFor((l) => l.startsWith('bestmove'));
      this.listeners.delete(onInfo);
      return { best: bm.split(' ')[1], lines: [...lines.values()] };
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }
}

/* ---------------- Sons (Web Audio, aucun fichier) ---------------- */
const Sound = {
  ctx: null,
  on: true,
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  },
  tone(freq, dur, type = 'sine', vol = 0.15, delay = 0) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t); o.stop(t + dur);
  },
  knock(vol = 0.5, len = 0.05) {
    if (!this.on || !this.ctx) return;
    const n = Math.floor(this.ctx.sampleRate * len);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 4);
    const src = this.ctx.createBufferSource();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 1400;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.buffer = buf; src.connect(f).connect(g).connect(this.ctx.destination);
    src.start();
  },
  move() { this.knock(0.6); },
  capture() { this.knock(0.9, 0.08); this.tone(180, 0.08, 'triangle', 0.15); },
  check() { this.knock(0.6); this.tone(880, 0.12, 'sine', 0.12, 0.02); },
  win() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.12, i * 0.11)); },
  lose() { [392, 330, 262].forEach((f, i) => this.tone(f, 0.4, 'sine', 0.12, i * 0.15)); },
};

/* ---------------- Stockage local ---------------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

/* ---------------- État ---------------- */
const $ = (id) => document.getElementById(id);
const engine = new Engine();
let game = new Chess();
let bot = BOTS.find((b) => b.id === store.get('chess.bot', 'hugo')) || BOTS[2];
let colorPref = store.get('chess.color', 'w');
let playerColor = 'w';
let orientation = 'w';
let selected = null;
let targets = [];
let lastMove = null;
let hintMove = null;
let over = null;          // { title, text, kind }
let resultSaved = false;
let gen = 0;              // jeton pour annuler une réflexion en cours
let thinking = false;
Sound.on = store.get('chess.sound', true);

const FILES = 'abcdefgh';
const VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const START_COUNT = { p: 8, n: 2, b: 2, r: 2, q: 1 };
const pieceUrl = (color, type) => `pieces/${color}${type.toUpperCase()}.svg`;

/* =========================================================
   MENU
   ========================================================= */
function renderMenu() {
  const stats = store.get('chess.stats', {});
  $('botList').innerHTML = '';
  for (const b of BOTS) {
    const s = stats[b.id];
    const el = document.createElement('button');
    el.className = 'bot' + (b.id === bot.id ? ' on' : '');
    el.innerHTML = `
      <div class="avatar" style="background:${b.color}"><img src="pieces/${b.piece}.svg" alt=""></div>
      <div class="meta">
        <div class="name">${b.name}</div>
        <div class="desc">${b.desc}</div>
        ${s ? `<div class="rec">${s.w} V · ${s.d} N · ${s.l} D</div>` : ''}
      </div>
      <div class="badge">${b.id === 'sf' ? '3000+' : '~' + b.elo}</div>`;
    el.onclick = () => { bot = b; store.set('chess.bot', b.id); renderMenu(); };
    $('botList').appendChild(el);
  }
  document.querySelectorAll('#colorSeg button').forEach((btn) => {
    btn.classList.toggle('on', btn.dataset.color === colorPref);
  });

  const save = store.get('chess.save', null);
  const sb = save && BOTS.find((b) => b.id === save.bot);
  if (save && sb && !save.over && save.moves.length) {
    $('resumeBtn').classList.remove('hidden');
    $('resumeInfo').textContent = `contre ${sb.name} · ${Math.ceil(save.moves.length / 2)} coups`;
  } else {
    $('resumeBtn').classList.add('hidden');
  }
}

document.querySelectorAll('#colorSeg button').forEach((btn) => {
  btn.onclick = () => { colorPref = btn.dataset.color; store.set('chess.color', colorPref); renderMenu(); };
});
$('playBtn').onclick = () => startGame();
$('resumeBtn').onclick = () => resumeGame();

function show(screen) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === screen));
}

/* =========================================================
   PARTIE
   ========================================================= */
function resetCommon() {
  gen++;
  engine.stop();
  engine.newGame();
  selected = null; targets = []; hintMove = null; over = null; resultSaved = false;
  setThinking(false);
  $('overlay').classList.add('hidden');
  $('promo').classList.add('hidden');
}

function setupPlayers() {
  $('oppName').textContent = bot.name;
  $('oppElo').textContent = bot.id === 'sf' ? '(3000+)' : `(~${bot.elo})`;
  $('oppAvatar').style.background = bot.color;
  $('oppAvatar').innerHTML = `<img src="pieces/${bot.piece}.svg" alt="">`;
  $('meAvatar').innerHTML = `<img src="pieces/${playerColor}K.svg" alt="">`;
}

function startGame() {
  resetCommon();
  game = new Chess();
  playerColor = colorPref === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : colorPref;
  orientation = playerColor;
  lastMove = null;
  setupPlayers();
  buildBoard();
  show('game');
  persist();
  render();
  maybeBotMove();
}

function resumeGame() {
  const save = store.get('chess.save', null);
  if (!save) return;
  resetCommon();
  bot = BOTS.find((b) => b.id === save.bot) || bot;
  playerColor = save.color;
  orientation = playerColor;
  game = new Chess();
  for (const m of save.moves) game.move(uciToObj(m));
  const h = game.history({ verbose: true });
  lastMove = h.length ? { from: h.at(-1).from, to: h.at(-1).to } : null;
  setupPlayers();
  buildBoard();
  show('game');
  render();
  maybeBotMove();
}

function persist() {
  const moves = game.history({ verbose: true }).map((m) => m.from + m.to + (m.promotion || ''));
  store.set('chess.save', { bot: bot.id, color: playerColor, moves, over: !!over });
}

const uciToObj = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });

/* ---------------- Échiquier ---------------- */
const squares = new Map();

function buildBoard() {
  const board = $('board');
  board.innerHTML = '';
  squares.clear();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const file = orientation === 'w' ? c : 7 - c;
      const rank = orientation === 'w' ? 7 - r : r;
      const sq = FILES[file] + (rank + 1);
      const el = document.createElement('div');
      el.className = 'sq ' + ((file + rank) % 2 ? 'l' : 'd');
      el.dataset.sq = sq;
      if (r === 7) el.insertAdjacentHTML('beforeend', `<span class="coord f">${FILES[file]}</span>`);
      if (c === 0) el.insertAdjacentHTML('beforeend', `<span class="coord r">${rank + 1}</span>`);
      board.appendChild(el);
      squares.set(sq, el);
    }
  }
}

function render() {
  const checkSq = game.inCheck() ? findKing(game.turn()) : null;
  for (const [sq, el] of squares) {
    const p = game.get(sq);
    let pc = el.querySelector('.pc');
    if (p) {
      if (!pc) { pc = document.createElement('div'); pc.className = 'pc'; el.appendChild(pc); }
      const url = `url(${pieceUrl(p.color, p.type)})`;
      if (pc.style.backgroundImage !== url) pc.style.backgroundImage = url;
      pc.classList.remove('dragging');
    } else if (pc) pc.remove();

    el.classList.toggle('sel', sq === selected);
    el.classList.toggle('last', !!lastMove && (sq === lastMove.from || sq === lastMove.to));
    el.classList.toggle('hint', !!hintMove && (sq === hintMove.from || sq === hintMove.to));
    el.classList.toggle('check', sq === checkSq);
    const t = targets.includes(sq);
    el.classList.toggle('dot', t && !p);
    el.classList.toggle('cap', t && !!p);
  }
  renderCaptured();
  renderMoves();
  renderStatus();
  $('undoBtn').disabled = game.history().length === 0;
  $('hintBtn').disabled = !!over || game.turn() !== playerColor;
  $('resignBtn').disabled = !!over;
  $('soundBtn').classList.toggle('muted', !Sound.on);
}

function findKing(color) {
  for (const row of game.board()) for (const p of row) if (p && p.type === 'k' && p.color === color) return p.square;
  return null;
}

function renderCaptured() {
  const count = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
  let material = { w: 0, b: 0 };
  for (const row of game.board()) for (const p of row) {
    if (!p) continue;
    if (p.type !== 'k') count[p.color][p.type]++;
    material[p.color] += VALUES[p.type];
  }
  const html = (capturer) => {
    const victim = capturer === 'w' ? 'b' : 'w';
    let s = '';
    for (const t of ['q', 'r', 'b', 'n', 'p']) {
      const missing = Math.max(0, START_COUNT[t] - count[victim][t]);
      for (let i = 0; i < missing; i++) s += `<img src="${pieceUrl(victim, t)}" alt="">`;
    }
    const adv = material[capturer] - material[victim];
    if (adv > 0) s += `<span class="adv">+${adv}</span>`;
    return s;
  };
  const botColor = playerColor === 'w' ? 'b' : 'w';
  $('meCaptured').innerHTML = html(playerColor);
  $('oppCaptured').innerHTML = html(botColor);
}

function renderMoves() {
  const h = game.history();
  let s = '';
  h.forEach((m, i) => {
    if (i % 2 === 0) s += `<span class="n">${i / 2 + 1}.</span>`;
    s += `<span class="m${i === h.length - 1 ? ' cur' : ''}">${m}</span>`;
  });
  const el = $('moves');
  el.innerHTML = s || '<span class="n">Aucun coup joué</span>';
  el.scrollLeft = el.scrollWidth;
}

function renderStatus() {
  let txt;
  if (over) txt = over.title;
  else if (thinking) txt = `${bot.name} réfléchit…`;
  else if (game.turn() === playerColor) txt = game.inCheck() ? 'Échec ! À toi' : 'À toi de jouer';
  else txt = `Au tour de ${bot.name}`;
  $('status').textContent = txt;
}

function setThinking(v) {
  thinking = v;
  $('thinking').classList.toggle('on', v);
  renderStatus();
}

/* ---------------- Interaction (toucher + glisser) ---------------- */
let drag = null;

function sqFromPoint(x, y) {
  const el = document.elementFromPoint(x, y)?.closest('.sq');
  return el && el.dataset.sq;
}

function canInteract() {
  return !over && !thinking && game.turn() === playerColor && $('promo').classList.contains('hidden');
}

function select(sq) {
  selected = sq;
  targets = sq ? game.moves({ square: sq, verbose: true }).map((m) => m.to) : [];
}

$('board').addEventListener('pointerdown', (e) => {
  Sound.unlock();
  const sq = sqFromPoint(e.clientX, e.clientY);
  if (!sq || !canInteract()) return;
  const p = game.get(sq);

  if (selected && targets.includes(sq)) {
    const from = selected;
    select(null);
    tryMove(from, sq, true);
    return;
  }
  if (p && p.color === playerColor) {
    const wasSelected = selected === sq;
    select(sq);
    render();
    const pc = squares.get(sq).querySelector('.pc');
    const rect = squares.get(sq).getBoundingClientRect();
    drag = { from: sq, wasSelected, startX: e.clientX, startY: e.clientY, moved: false, ghost: null, pc, size: rect.width };
    $('board').setPointerCapture(e.pointerId);
  } else {
    select(null);
    render();
  }
});

$('board').addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 6) return;
  if (!drag.moved) {
    drag.moved = true;
    const g = document.createElement('div');
    g.className = 'ghost-piece';
    g.style.width = g.style.height = drag.size + 'px';
    g.style.backgroundImage = drag.pc.style.backgroundImage;
    document.body.appendChild(g);
    drag.ghost = g;
    drag.pc.classList.add('dragging');
  }
  drag.ghost.style.left = e.clientX + 'px';
  drag.ghost.style.top = e.clientY + 'px';
});

function endDrag(e) {
  if (!drag) return;
  const d = drag;
  drag = null;
  d.ghost?.remove();
  d.pc?.classList.remove('dragging');
  const to = e ? sqFromPoint(e.clientX, e.clientY) : null;
  if (d.moved && to && to !== d.from && targets.includes(to)) {
    select(null);
    tryMove(d.from, to, false);
    return;
  }
  if (!d.moved && d.wasSelected) select(null);
  render();
}
$('board').addEventListener('pointerup', endDrag);
$('board').addEventListener('pointercancel', () => endDrag(null));

async function tryMove(from, to, animate) {
  const piece = game.get(from);
  let promotion;
  if (piece.type === 'p' && (to[1] === '8' || to[1] === '1')) {
    promotion = await askPromotion(piece.color);
    if (!promotion) { render(); return; }
  }
  doMove({ from, to, promotion }, animate);
  maybeBotMove();
}

function askPromotion(color) {
  return new Promise((resolve) => {
    const box = $('promo');
    box.innerHTML = '';
    for (const t of ['q', 'r', 'b', 'n']) {
      const b = document.createElement('button');
      b.style.backgroundImage = `url(${pieceUrl(color, t)})`;
      b.onclick = (ev) => { ev.stopPropagation(); box.classList.add('hidden'); resolve(t); };
      box.appendChild(b);
    }
    box.onclick = () => { box.classList.add('hidden'); resolve(null); };
    box.classList.remove('hidden');
  });
}

function doMove(m, animate) {
  let mv;
  try { mv = game.move(m); } catch { return null; }
  lastMove = { from: mv.from, to: mv.to };
  hintMove = null;
  render();
  if (animate) animatePiece(mv.from, mv.to);
  if (game.inCheck()) Sound.check();
  else if (mv.captured) Sound.capture();
  else Sound.move();
  checkGameOver();
  persist();
  return mv;
}

function animatePiece(from, to) {
  const a = squares.get(from), b = squares.get(to);
  const pc = b?.querySelector('.pc');
  if (!a || !pc) return;
  const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
  pc.style.transition = 'none';
  pc.style.transform = `translate(${ra.left - rb.left}px, ${ra.top - rb.top}px)`;
  pc.getBoundingClientRect();
  pc.style.transition = 'transform .2s ease-out';
  pc.style.transform = '';
  pc.style.zIndex = 5;
  setTimeout(() => { pc.style.transition = ''; pc.style.zIndex = ''; }, 220);
}

/* ---------------- Coup du bot ---------------- */
function pickMove(result) {
  const legal = game.moves({ verbose: true });
  if (bot.random && Math.random() < bot.random) {
    const r = legal[Math.floor(Math.random() * legal.length)];
    return r.from + r.to + (r.promotion || '');
  }
  if (bot.temp && result.lines.length > 1) {
    const best = Math.max(...result.lines.map((l) => l.score));
    const w = result.lines.map((l) => Math.exp((l.score - best) / bot.temp));
    let x = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < w.length; i++) { x -= w[i]; if (x <= 0) return result.lines[i].move; }
  }
  return result.best;
}

async function maybeBotMove() {
  if (over || game.turn() === playerColor) return;
  const token = ++gen;
  setThinking(true);
  const t0 = Date.now();
  let result;
  try { result = await engine.search(game.fen(), bot.search); } catch { result = null; }
  if (token !== gen) return;
  const uci = result && result.best && result.best !== '(none)' ? pickMove(result) : null;
  const minDelay = 450 + Math.random() * 500;
  const wait = minDelay - (Date.now() - t0);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  if (token !== gen) return;
  setThinking(false);
  if (uci) doMove(uciToObj(uci), true);
}

/* ---------------- Fin de partie ---------------- */
function checkGameOver() {
  if (!game.isGameOver()) return;
  let title, text, kind;
  if (game.isCheckmate()) {
    const iWon = game.turn() !== playerColor;
    kind = iWon ? 'w' : 'l';
    title = iWon ? 'Victoire !' : 'Défaite';
    text = iWon ? `Échec et mat, tu as battu ${bot.name} !` : `${bot.name} t'a mis échec et mat.`;
  } else {
    kind = 'd';
    title = 'Partie nulle';
    text = game.isStalemate() ? 'Pat : aucun coup légal.'
      : game.isThreefoldRepetition() ? 'Triple répétition.'
      : game.isInsufficientMaterial() ? 'Matériel insuffisant.'
      : 'Règle des 50 coups.';
  }
  finish({ title, text, kind });
}

function finish(res) {
  over = res;
  gen++;
  setThinking(false);
  select(null);
  render();
  persist();
  if (!resultSaved) {
    resultSaved = true;
    const stats = store.get('chess.stats', {});
    const s = stats[bot.id] || { w: 0, l: 0, d: 0 };
    s[res.kind]++;
    stats[bot.id] = s;
    store.set('chess.stats', stats);
  }
  setTimeout(() => {
    if (res.kind === 'w') Sound.win(); else if (res.kind === 'l') Sound.lose();
    $('resultIcon').innerHTML = res.kind === 'w' ? '🏆' : res.kind === 'l' ? `<img src="pieces/${bot.piece}.svg" alt="">` : '🤝';
    $('resultTitle').textContent = res.title;
    $('resultText').textContent = res.text;
    $('overlay').classList.remove('hidden');
  }, 500);
}

/* ---------------- Boutons ---------------- */
$('backBtn').onclick = () => { gen++; engine.stop(); setThinking(false); renderMenu(); show('menu'); };

$('undoBtn').onclick = () => {
  if (!game.history().length) return;
  const wasThinking = thinking;
  gen++;
  engine.stop();
  setThinking(false);
  over = null;
  $('overlay').classList.add('hidden');
  if (wasThinking || game.turn() !== playerColor) {
    game.undo();
  } else {
    game.undo();
    if (game.history().length && game.turn() !== playerColor) game.undo();
  }
  const h = game.history({ verbose: true });
  lastMove = h.length ? { from: h.at(-1).from, to: h.at(-1).to } : null;
  select(null);
  hintMove = null;
  persist();
  render();
  maybeBotMove();
};

$('hintBtn').onclick = async () => {
  if (!canInteract()) return;
  const token = ++gen;
  $('hintBtn').disabled = true;
  $('status').textContent = 'Recherche du meilleur coup…';
  const r = await engine.search(game.fen(), { depth: 14, skill: 20 });
  if (token !== gen) return;
  if (r.best && r.best !== '(none)') hintMove = uciToObj(r.best);
  render();
};

$('flipBtn').onclick = () => {
  orientation = orientation === 'w' ? 'b' : 'w';
  buildBoard();
  render();
};

$('soundBtn').onclick = () => {
  Sound.unlock();
  Sound.on = !Sound.on;
  store.set('chess.sound', Sound.on);
  render();
};

function confirmBox(title) {
  return new Promise((resolve) => {
    $('confirmTitle').textContent = title;
    $('confirm').classList.remove('hidden');
    $('confirmYes').onclick = () => { $('confirm').classList.add('hidden'); resolve(true); };
    $('confirmNo').onclick = () => { $('confirm').classList.add('hidden'); resolve(false); };
  });
}

$('resignBtn').onclick = async () => {
  if (over) return;
  if (!(await confirmBox('Abandonner la partie ?'))) return;
  finish({ title: 'Abandon', text: `${bot.name} gagne par abandon.`, kind: 'l' });
};

$('againBtn').onclick = () => startGame();
$('reviewBtn').onclick = () => $('overlay').classList.add('hidden');
$('menuBtn').onclick = () => { $('overlay').classList.add('hidden'); renderMenu(); show('menu'); };

/* ---------------- Démarrage ---------------- */
renderMenu();
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
