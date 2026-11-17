import { Chess } from './lib/chess.js';
import {
  pieceSprite, boardImage, tableTexture, paperTexture, feltTexture, wordmark, avatar, flag, FLAG_CODES,
  badge, rankOf, RANKS, icon, rng,
} from './pixel.js';

/* =========================================================
   MOTEUR — Stockfish 19 (Web Worker, protocole UCI)
   ========================================================= */
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
  newGame() { this.queue = this.queue.then(() => this.send('ucinewgame')); }

  search(fen, { multipv = 1, depth, movetime, skill = 20, elo } = {}) {
    const run = async () => {
      await this.ready;
      this.send(`setoption name MultiPV value ${multipv}`);
      this.send(`setoption name Skill Level value ${skill}`);
      if (elo) {
        this.send('setoption name UCI_LimitStrength value true');
        this.send(`setoption name UCI_Elo value ${Math.max(1320, Math.min(3190, Math.round(elo)))}`);
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
        let score = 0;
        if (cp) score = +cp[1];
        else if (mate) { const n = +mate[1]; score = n > 0 ? 100000 - n * 100 : -100000 - n * 100; }
        lines.set(mpv, { move: l.match(/ pv (\S+)/)[1], score });
      };
      this.listeners.add(onInfo);
      this.send(`position fen ${fen}`);
      this.send(depth ? `go depth ${depth}` : `go movetime ${Math.max(80, Math.round(movetime || 1000))}`);
      const bm = await this.waitFor((l) => l.startsWith('bestmove'));
      this.listeners.delete(onInfo);
      const arr = [...lines.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
      return { best: bm.split(' ')[1], lines: arr, score: arr[0]?.score ?? 0 };
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }
}

/* Force du bot selon son Elo : en dessous de ~1350 on choisit parmi
   plusieurs coups candidats avec du hasard (erreurs « humaines »),
   au-dessus on utilise le limiteur d'Elo officiel de Stockfish. */
const WEAK = [ // elo, hasard, température, profondeur, multipv, skill
  [100, 0.55, 800, 1, 12, 0],
  [400, 0.30, 380, 1, 10, 0],
  [700, 0.13, 160, 2, 7, 1],
  [1000, 0.05, 75, 4, 5, 4],
  [1350, 0.012, 32, 7, 4, 8],
];
function strength(elo) {
  if (elo >= 2900) return { search: { skill: 20, movetime: 1600 } };
  if (elo >= 1350) return { search: { elo, movetime: 300 + elo / 3 } };
  let i = 0;
  while (i < WEAK.length - 2 && elo > WEAK[i + 1][0]) i++;
  const [a, b] = [WEAK[i], WEAK[i + 1]];
  const t = Math.max(0, Math.min(1, (elo - a[0]) / (b[0] - a[0])));
  const L = (k) => a[k] + (b[k] - a[k]) * t;
  return {
    random: L(1), temp: L(2),
    search: { depth: Math.round(L(3)), multipv: Math.round(L(4)), skill: Math.round(L(5)) },
  };
}

/* =========================================================
   SONS — bois qui claque, synthétisés (aucun fichier)
   ========================================================= */
const Sound = {
  ctx: null, on: true,
  unlock() {
    if (!this.ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) this.ctx = new AC(); }
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  },
  tone(freq, dur, type = 'square', vol = 0.06, delay = 0) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur);
  },
  knock(vol = 0.5, len = 0.05, freq = 1300) {
    if (!this.on || !this.ctx) return;
    const n = Math.floor(this.ctx.sampleRate * len);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 4);
    const src = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2; g.gain.value = vol * 2;
    src.buffer = buf; src.connect(f).connect(g).connect(this.ctx.destination); src.start();
  },
  move() { this.knock(0.6, 0.05, 900 + Math.random() * 300); },
  capture() { this.knock(0.9, 0.09, 700); this.knock(0.4, 0.04, 2000); },
  check() { this.knock(0.6); this.tone(988, 0.1, 'square', 0.04, 0.03); this.tone(1319, 0.12, 'square', 0.04, 0.1); },
  found() { [523, 784].forEach((f, i) => this.tone(f, 0.12, 'square', 0.05, i * 0.1)); },
  tick() { this.tone(1800, 0.03, 'square', 0.02); },
  win() { [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.18, 'square', 0.05, i * 0.09)); },
  lose() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.08, i * 0.14)); },
  draw() { [523, 523, 440].forEach((f, i) => this.tone(f, 0.15, 'square', 0.04, i * 0.12)); },
};

/* =========================================================
   DONNÉES
   ========================================================= */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

const TCS = [
  { id: '3+2', base: 180, inc: 2, label: 'Blitz', col: '#ff9a4a' },
  { id: '5+0', base: 300, inc: 0, label: 'Blitz', col: '#f2d03a' },
  { id: '10+0', base: 600, inc: 0, label: 'Rapide', col: '#8fd65a' },
  { id: '∞', base: 0, inc: 0, label: 'Libre', col: '#7ab4ee' },
];

let profile = store.get('px.profile', null);
let history = store.get('px.history', []);
let tcId = store.get('px.tc', '5+0');
let frColor = store.get('px.frColor', 'w');
Sound.on = store.get('px.sound', true);

/* ---------- Adversaires générés ---------- */
const A = ['Pion', 'Fou', 'Roi', 'Tour', 'Cavalier', 'Dame', 'Gambit', 'Roque', 'Blitz', 'Zugzwang', 'Fianchetto', 'Echec', 'Pat', 'Sicilien', 'Mat', 'Pendule'];
const B = ['Masque', 'Fou', 'Sauvage', 'Noir', 'Dore', 'Rapide', 'Royal', 'Furtif', 'Tranquille', 'Perdu', 'Volant', 'Givre', 'Ruse', 'Zen', 'Brutal'];
const FIRST = ['lucas', 'ines', 'maxime', 'yanis', 'chloe', 'theo', 'sarah', 'nathan', 'lea', 'hugo', 'emma', 'karim', 'julie', 'tom', 'manon', 'enzo', 'camille', 'rayan', 'zoe', 'adam', 'nina', 'mehdi', 'lina', 'sacha', 'jules', 'amir', 'clara', 'noah'];
const FLAG_WEIGHTS = { FR: 10, BE: 3, CH: 2, CA: 2, MA: 2, SN: 1, CI: 1, ES: 1, IT: 1, DE: 1, NL: 1, UA: 1, JP: 1, IE: 1, AT: 1 };

function makeOpponent(elo, seed = Math.floor(Math.random() * 1e9)) {
  const R = rng(seed);
  const p = (a) => a[Math.floor(R() * a.length)];
  const n = Math.floor(R() * 99) + 1;
  const style = Math.floor(R() * 6);
  const name = [
    () => p(A) + p(B),
    () => `${p(FIRST)}_${n}`,
    () => `${p(FIRST)}${1990 + Math.floor(R() * 22)}`,
    () => `Le${p(A)}${p(B)}`,
    () => `${p(FIRST)}.${p(A).toLowerCase()}`,
    () => `xX${p(A)}Xx`,
  ][style]().slice(0, 16);
  const total = Object.values(FLAG_WEIGHTS).reduce((a, b) => a + b, 0);
  let x = R() * total, fl = 'FR';
  for (const [k, w] of Object.entries(FLAG_WEIGHTS)) { x -= w; if (x <= 0) { fl = k; break; } }
  return { name, seed: String(seed), flag: fl, elo: Math.round(elo) };
}

/* =========================================================
   OUTILS DOM
   ========================================================= */
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function show(id) { document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id)); }
function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((img) => { img.src = icon(img.dataset.icon); });
  root.querySelectorAll('[data-piece]').forEach((img) => { img.src = pieceSprite(img.dataset.piece[0], img.dataset.piece[1]); });
}
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/* Textures générées une fois */
document.documentElement.style.setProperty('--table', `url(${tableTexture()})`);
document.documentElement.style.setProperty('--plank', `url(${tableTexture(['#5b3420', '#52301d', '#4a2a19', '#66402a'])})`);
document.documentElement.style.setProperty('--paper', `url(${paperTexture()})`);
document.documentElement.style.setProperty('--felt', `url(${feltTexture()})`);
$('wordmark').src = wordmark();
$('shelf').innerHTML = [['b', 'p'], ['w', 'n'], ['b', 'q'], ['w', 'k'], ['b', 'b'], ['w', 'r'], ['b', 'p']]
  .map(([c, t]) => `<img src="${pieceSprite(c, t)}" alt="">`).join('');
hydrateIcons();

/* =========================================================
   ACCUEIL
   ========================================================= */
function renderHome() {
  if (!profile) return;
  const rank = rankOf(profile.elo);
  const next = RANKS.find((r) => r.min > profile.elo);
  $('meAvatarHome').src = avatar(profile.seed);
  $('meFlagHome').src = flag(profile.flag);
  $('meNameHome').textContent = profile.name;
  $('meBadge').src = badge(profile.elo);
  $('meRank').textContent = rank.name;
  $('home').style.setProperty('--rank', rank.col);
  $('meElo').textContent = profile.elo;
  const pct = next ? ((profile.elo - rank.min) / (next.min - rank.min)) * 100 : 100;
  $('xpFill').style.width = Math.max(4, Math.min(100, pct)) + '%';
  $('xpLeft').textContent = rank.name;
  $('xpRight').textContent = next ? `${next.name} dans ${next.min - profile.elo} pts` : 'Rang maximum !';
  $('stW').textContent = profile.w; $('stD').textContent = profile.d; $('stL').textContent = profile.l;
  $('stPeak').textContent = profile.peak;
  $('homeSoundIcon').src = icon(Sound.on ? 'sound' : 'mute');
  drawSpark();

  $('tcChips').innerHTML = TCS.map((t) =>
    `<button class="chip${t.id === tcId ? ' on' : ''}" style="--c:${t.col}" data-tc="${t.id}">${t.id}<small>${t.label}</small></button>`).join('');
  $('tcChips').querySelectorAll('.chip').forEach((b) => {
    b.onclick = () => { tcId = b.dataset.tc; store.set('px.tc', tcId); Sound.unlock(); Sound.tick(); renderHome(); };
  });

  const save = store.get('px.save', null);
  if (save && !save.over && save.moves.length) {
    $('resumeBtn').classList.remove('hidden');
    $('resumeInfo').textContent = `${save.mode === 'ranked' ? 'Classée' : 'Amicale'} contre ${save.opp.name} · coup ${Math.ceil(save.moves.length / 2)}`;
  } else $('resumeBtn').classList.add('hidden');

  const last = history.slice(0, 8).reverse();
  $('lastDots').innerHTML = last.length ? last.map((h) => `<i class="${h.kind}"></i>`).join('') : '<em>aucune</em>';

  const rec = $('recent');
  if (!history.length) { rec.innerHTML = '<div class="empty">Aucune partie pour l\'instant. Lance-toi !</div>'; return; }
  rec.innerHTML = history.map((h) => `
    <div class="rg">
      <img class="av" src="${avatar(h.seed)}" alt="">
      <div class="who"><img class="flag" src="${flag(h.flag)}" alt=""> ${esc(h.name)} <small>(${h.elo})</small><br>
        <small>${h.mode === 'ranked' ? 'Classée' : 'Amicale'} · ${h.tc} · ${timeAgo(h.t)}</small></div>
      <span class="res ${h.kind}">${{ w: 'GAGNÉ', l: 'PERDU', d: 'NULLE' }[h.kind]}</span>
      <span class="dl ${h.delta > 0 ? 'up' : h.delta < 0 ? 'down' : ''}">${h.delta == null ? '' : (h.delta > 0 ? '+' : '') + h.delta}</span>
    </div>`).join('');
}

$('historyBtn').onclick = () => { Sound.unlock(); Sound.tick(); $('historyModal').classList.remove('hidden'); };
$('historyClose').onclick = () => $('historyModal').classList.add('hidden');
$('homeSoundBtn').onclick = () => { Sound.unlock(); Sound.on = !Sound.on; store.set('px.sound', Sound.on); renderHome(); };

function timeAgo(t) {
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
}

function drawSpark() {
  const c = $('spark'), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  const r = profile.ratings.slice(-24);
  if (r.length < 2) return;
  const min = Math.min(...r) - 10, max = Math.max(...r) + 10;
  const W = c.width, H = c.height, step = Math.max(2, Math.floor(W / (r.length - 1)));
  const ys = r.map((v) => Math.round(H - 3 - ((v - min) / (max - min)) * (H - 6)));
  const up = r.at(-1) >= r[0];
  ctx.fillStyle = up ? '#b8f08a' : '#ff9a8a';
  for (let i = 0; i < r.length - 1; i++) {
    const x0 = i * step, x1 = (i + 1) * step;
    for (let x = x0; x <= x1; x += 2) {
      const y = Math.round(ys[i] + ((ys[i + 1] - ys[i]) * (x - x0)) / step);
      ctx.fillRect(x, y, 2, 2);
    }
  }
  ctx.fillStyle = '#fff4dc';
  ctx.fillRect((r.length - 1) * step - 2, ys.at(-1) - 2, 4, 4);
}

/* joueurs « en ligne » qui bougent doucement */
let online = 9000 + Math.floor(Math.random() * 5000);
setInterval(() => { online += Math.floor(Math.random() * 41) - 20; $('onlineCount').textContent = online.toLocaleString('fr-FR'); }, 2500);
$('onlineCount').textContent = online.toLocaleString('fr-FR');

/* =========================================================
   PROFIL
   ========================================================= */
const LEVELS = [
  { elo: 400, t: 'Débutant', s: 'Je découvre' },
  { elo: 800, t: 'Amateur', s: 'Je connais les règles' },
  { elo: 1200, t: 'Club', s: 'Je joue souvent' },
  { elo: 1600, t: 'Confirmé', s: 'Je suis fort' },
];
let pfDraft = null;

function openProfile(first) {
  pfDraft = profile ? { ...profile } : { name: '', seed: String(Math.floor(Math.random() * 1e9)), flag: 'FR', elo: 800 };
  $('profileTitle').textContent = first ? 'Bienvenue !' : 'Ton profil';
  $('pfLevel').classList.toggle('hidden', !first);
  $('pfSave').textContent = first ? "C'est parti" : 'Enregistrer';
  $('pfName').value = pfDraft.name;
  renderProfileDraft();
  $('profileModal').classList.remove('hidden');
}
function renderProfileDraft() {
  $('pfAv').src = avatar(pfDraft.seed);
  $('pfFlags').innerHTML = FLAG_CODES.map((c) => `<button data-f="${c}" class="${c === pfDraft.flag ? 'on' : ''}"><img src="${flag(c)}" alt="${c}"></button>`).join('');
  $('pfFlags').querySelectorAll('button').forEach((b) => { b.onclick = () => { pfDraft.flag = b.dataset.f; renderProfileDraft(); }; });
  $('pfLevels').innerHTML = LEVELS.map((l) => `<button data-e="${l.elo}" class="${l.elo === pfDraft.elo ? 'on' : ''}"><b>${l.t}</b>${l.s}</button>`).join('');
  $('pfLevels').querySelectorAll('button').forEach((b) => { b.onclick = () => { pfDraft.elo = +b.dataset.e; renderProfileDraft(); }; });
}
$('pfReroll').onclick = () => { Sound.unlock(); Sound.tick(); pfDraft.seed = String(Math.floor(Math.random() * 1e9)); renderProfileDraft(); };
$('pfSave').onclick = () => {
  Sound.unlock();
  const name = $('pfName').value.trim().slice(0, 16) || 'Joueur' + Math.floor(Math.random() * 900 + 100);
  if (!profile) {
    profile = { name, seed: pfDraft.seed, flag: pfDraft.flag, elo: pfDraft.elo, peak: pfDraft.elo, games: 0, w: 0, l: 0, d: 0, ratings: [pfDraft.elo] };
  } else {
    Object.assign(profile, { name, seed: pfDraft.seed, flag: pfDraft.flag });
  }
  store.set('px.profile', profile);
  $('profileModal').classList.add('hidden');
  renderHome();
};
$('meAvatarBtn').onclick = () => openProfile(false);

/* =========================================================
   ÉTAT DE PARTIE
   ========================================================= */
const engine = new Engine();
let G = null;              // partie en cours (sauvegardée)
let game = new Chess();
let orientation = 'w';
let selected = null, targets = [], lastMove = null, hintMove = null;
let gen = 0, thinking = false, paused = true, clockLast = 0;
let botBad = 0, lastDrawOffer = -99;
let strengthCfg = null;

const myColor = () => G.color;
const botColor = () => (G.color === 'w' ? 'b' : 'w');
const VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const START_COUNT = { p: 8, n: 2, b: 2, r: 2, q: 1 };
const uciToObj = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });

function persist() {
  if (!G) return;
  commitClock();
  G.moves = game.history({ verbose: true }).map((m) => m.from + m.to + (m.promotion || ''));
  store.set('px.save', G);
}

/* ---------- Pendules ---------- */
const clockRunning = () => G && G.tc && !G.over && !paused && game.history().length >= 2;
function commitClock() {
  const now = performance.now();
  if (clockRunning()) G.clock[game.turn()] -= now - clockLast;
  clockLast = now;
}
function remaining(color) {
  if (!G.tc) return Infinity;
  let t = G.clock[color];
  if (clockRunning() && game.turn() === color) t -= performance.now() - clockLast;
  return t;
}
function fmt(ms) {
  ms = Math.max(0, ms);
  const s = ms / 1000;
  if (s < 10) return `0:0${s.toFixed(1)}`;
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}
function renderClocks() {
  if (!G) return;
  for (const [el, color] of [[$('meClock'), myColor()], [$('oppClock'), botColor()]]) {
    el.classList.toggle('none', !G.tc);
    if (!G.tc) continue;
    const t = remaining(color);
    el.textContent = fmt(t);
    el.classList.toggle('on', !G.over && game.turn() === color && game.history().length >= 2);
    el.classList.toggle('low', t < 20000);
  }
}
setInterval(() => {
  if (!G || G.over || paused || !G.tc) return;
  renderClocks();
  const c = game.turn();
  if (clockRunning() && remaining(c) <= 0) {
    commitClock();
    G.clock[c] = 0;
    if (c === myColor()) finish({ kind: 'l', title: 'Temps écoulé', text: 'Ta pendule est tombée.' });
    else finish({ kind: 'w', title: 'Victoire !', text: `${G.opp.name} a perdu au temps.` });
  }
}, 100);

document.addEventListener('visibilitychange', () => {
  if (!G || G.over) return;
  if (document.hidden) { commitClock(); paused = true; persist(); }
  else if ($('game').classList.contains('active')) { paused = false; clockLast = performance.now(); }
});

/* ---------- Lancement ---------- */
function newGame({ mode, opp, color, tc }) {
  G = {
    mode, opp, color, tc: tc.base ? { base: tc.base, inc: tc.inc } : null, tcId: tc.id,
    clock: { w: tc.base * 1000, b: tc.base * 1000 }, moves: [], over: null,
  };
  game = new Chess();
  enterGame();
  store.set('px.save', G);
  setTimeout(() => chat(['salut !', 'bonne chance', 'gl hf', 'bon match', 'hello', 'yo', 'bonne partie !']), 700);
}

function resumeGame() {
  const save = store.get('px.save', null);
  if (!save) return;
  G = save;
  game = new Chess();
  try { for (const m of G.moves) game.move(uciToObj(m)); } catch {}
  enterGame();
}

function enterGame() {
  gen++;
  engine.stop();
  engine.newGame();
  strengthCfg = strength(G.opp.elo);
  orientation = G.color;
  selected = null; targets = []; hintMove = null; botBad = 0; lastDrawOffer = -99;
  const h = game.history({ verbose: true });
  lastMove = h.length ? { from: h.at(-1).from, to: h.at(-1).to } : null;
  thinking = false;
  $('thinking').classList.remove('on');
  ['resultModal', 'confirmModal', 'friendlyModal'].forEach((id) => $(id).classList.add('hidden'));
  $('promo').classList.add('hidden');
  $('bubble').classList.add('hidden');

  const ranked = G.mode === 'ranked';
  $('modeLabel').innerHTML = `${ranked ? '<b>Classée</b>' : '<b>Amicale</b>'} · ${G.tcId === '∞' ? 'sans pendule' : G.tcId}`;
  $('undoBtn').classList.toggle('hidden', ranked);
  $('hintBtn').classList.toggle('hidden', ranked);

  $('oppAv').src = avatar(G.opp.seed);
  $('oppFlag').src = flag(G.opp.flag);
  $('oppName').textContent = G.opp.name;
  $('oppElo').textContent = `(${G.opp.elo})`;
  $('oppBadge').src = badge(G.opp.elo);
  $('meAv').src = avatar(profile.seed);
  $('meFlag').src = flag(profile.flag);
  $('meName').textContent = profile.name;
  $('meEloGame').textContent = ranked ? `(${profile.elo})` : '';
  $('meBadgeGame').src = badge(profile.elo);

  buildBoard();
  show('game');
  paused = false;
  clockLast = performance.now();
  render();
  maybeBotMove();
}

/* =========================================================
   ÉCHIQUIER
   ========================================================= */
const squares = new Map();
const boardCache = {};
function buildBoard() {
  boardCache[orientation] ||= boardImage(orientation);
  $('boardImg').src = boardCache[orientation];
  const board = $('board');
  board.innerHTML = '';
  squares.clear();
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const file = orientation === 'w' ? c : 7 - c;
    const rank = orientation === 'w' ? 7 - r : r;
    const sq = 'abcdefgh'[file] + (rank + 1);
    const el = document.createElement('div');
    el.className = 'sq';
    el.dataset.sq = sq;
    board.appendChild(el);
    squares.set(sq, el);
  }
}

function findKing(color) {
  for (const row of game.board()) for (const p of row) if (p && p.type === 'k' && p.color === color) return p.square;
  return null;
}

function render() {
  const checkSq = game.inCheck() ? findKing(game.turn()) : null;
  for (const [sq, el] of squares) {
    const p = game.get(sq);
    let pc = el.querySelector('.pc');
    if (p) {
      if (!pc) { pc = document.createElement('div'); pc.className = 'pc'; el.appendChild(pc); }
      const url = `url("${pieceSprite(p.color, p.type)}")`;
      if (pc.dataset.k !== p.color + p.type) { pc.style.backgroundImage = url; pc.dataset.k = p.color + p.type; }
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
  renderClocks();
  const myTurn = !G.over && game.turn() === myColor();
  $('undoBtn').disabled = game.history().length === 0;
  $('hintBtn').disabled = !myTurn || thinking;
  $('drawBtn').disabled = !myTurn || thinking;
  $('resignBtn').disabled = !!G.over;
  $('soundIcon').src = icon(Sound.on ? 'sound' : 'mute');
}

function renderCaptured() {
  const count = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
  const mat = { w: 0, b: 0 };
  for (const row of game.board()) for (const p of row) {
    if (!p) continue;
    if (p.type !== 'k') count[p.color][p.type]++;
    mat[p.color] += VALUES[p.type];
  }
  const html = (cap) => {
    const vic = cap === 'w' ? 'b' : 'w';
    let s = '';
    for (const t of ['q', 'r', 'b', 'n', 'p']) {
      const miss = Math.max(0, START_COUNT[t] - count[vic][t]);
      for (let i = 0; i < miss; i++) s += `<img src="${pieceSprite(vic, t)}" alt="">`;
    }
    const adv = mat[cap] - mat[vic];
    if (adv > 0) s += `<span class="adv">+${adv}</span>`;
    return s;
  };
  $('meCaptured').innerHTML = html(myColor());
  $('oppCaptured').innerHTML = html(botColor());
}

function renderMoves() {
  const h = game.history();
  let s = '';
  h.forEach((m, i) => {
    if (i % 2 === 0) s += `<span class="n">${i / 2 + 1}.</span>`;
    s += `<span class="m${i === h.length - 1 ? ' cur' : ''}">${m}</span>`;
  });
  const el = $('moves');
  el.innerHTML = s || '<span class="n">La partie commence…</span>';
  el.scrollLeft = el.scrollWidth;
}

/* ---------- Effets organiques ---------- */
function animatePiece(from, to) {
  const a = squares.get(from), b = squares.get(to);
  const pc = b?.querySelector('.pc');
  if (!a || !pc) return;
  const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
  const dx = ra.left - rb.left, dy = ra.top - rb.top;
  const dist = Math.hypot(dx, dy);
  pc.style.zIndex = 6;
  const anim = pc.animate([
    { transform: `translate(${dx}px, ${dy}px)` },
    { transform: `translate(${dx / 2}px, ${dy / 2 - Math.min(18, dist * 0.12)}px) scale(1.08)`, offset: 0.5 },
    { transform: 'translate(0, 0)' },
  ], { duration: 170 + Math.min(130, dist * 0.6), easing: 'ease-in-out' });
  anim.onfinish = () => { pc.style.zIndex = ''; land(pc); };
}
function land(pc) { pc.classList.remove('land'); void pc.offsetWidth; pc.classList.add('land'); }

function dust(sq, color, n = 10) {
  const el = squares.get(sq);
  if (!el) return;
  const fx = $('fx');
  const box = fx.getBoundingClientRect(), r = el.getBoundingClientRect();
  const cx = ((r.left + r.width / 2 - box.left) / box.width) * 100;
  const cy = ((r.top + r.height * 0.8 - box.top) / box.height) * 100;
  const cols = color === 'w' ? ['#e6c793', '#fbeccb', '#b88b55'] : ['#4d2e1a', '#82573a', '#2a170c'];
  for (let i = 0; i < n; i++) {
    const d = document.createElement('i');
    d.className = 'dust';
    d.style.left = cx + '%'; d.style.top = cy + '%';
    d.style.background = cols[i % cols.length];
    const ang = Math.random() * Math.PI * 2, sp = 14 + Math.random() * 26;
    d.style.setProperty('--dx', Math.cos(ang) * sp + 'px');
    d.style.setProperty('--dy', Math.sin(ang) * sp * 0.6 - 10 + 'px');
    fx.appendChild(d);
    setTimeout(() => d.remove(), 600);
  }
}

let bubbleTimer;
function chat(lines, chance = 0.7) {
  if (Math.random() > chance) return;
  const msg = Array.isArray(lines) ? lines[Math.floor(Math.random() * lines.length)] : lines;
  const b = $('bubble');
  b.textContent = msg;
  b.classList.remove('hidden');
  b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => b.classList.add('hidden'), 2600);
}

/* =========================================================
   INTERACTION (toucher + glisser)
   ========================================================= */
let drag = null;
const sqFromPoint = (x, y) => document.elementFromPoint(x, y)?.closest('.sq')?.dataset.sq;
const canInteract = () => G && !G.over && !thinking && game.turn() === myColor() && $('promo').classList.contains('hidden');
function select(sq) { selected = sq; targets = sq ? game.moves({ square: sq, verbose: true }).map((m) => m.to) : []; }

$('board').addEventListener('pointerdown', (e) => {
  Sound.unlock();
  const sq = sqFromPoint(e.clientX, e.clientY);
  if (!sq || !canInteract()) return;
  const p = game.get(sq);
  if (selected && targets.includes(sq)) { const from = selected; select(null); tryMove(from, sq, true); return; }
  if (p && p.color === myColor()) {
    const wasSelected = selected === sq;
    select(sq);
    render();
    Sound.tick();
    const el = squares.get(sq);
    drag = { from: sq, wasSelected, x: e.clientX, y: e.clientY, moved: false, ghost: null, pc: el.querySelector('.pc'), size: el.getBoundingClientRect().width };
    $('board').setPointerCapture(e.pointerId);
  } else { select(null); render(); }
});

$('board').addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
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
  const d = drag; drag = null;
  d.ghost?.remove();
  d.pc?.classList.remove('dragging');
  const to = e ? sqFromPoint(e.clientX, e.clientY) : null;
  if (d.moved && to && to !== d.from && targets.includes(to)) { select(null); tryMove(d.from, to, false); return; }
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
  if (doMove({ from, to, promotion }, animate)) maybeBotMove();
}

function askPromotion(color) {
  return new Promise((resolve) => {
    const box = $('promo');
    box.innerHTML = '';
    for (const t of ['q', 'r', 'b', 'n']) {
      const b = document.createElement('button');
      b.style.backgroundImage = `url("${pieceSprite(color, t)}")`;
      b.onclick = (ev) => { ev.stopPropagation(); box.classList.add('hidden'); resolve(t); };
      box.appendChild(b);
    }
    box.onclick = () => { box.classList.add('hidden'); resolve(null); };
    box.classList.remove('hidden');
  });
}

function doMove(m, animate) {
  const before = game.history().length;
  commitClock();
  let mv;
  try { mv = game.move(m); } catch { return null; }
  if (G.tc && before >= 2) G.clock[mv.color] += G.tc.inc * 1000;
  clockLast = performance.now();
  lastMove = { from: mv.from, to: mv.to };
  hintMove = null;
  render();
  const pc = squares.get(mv.to)?.querySelector('.pc');
  if (animate) animatePiece(mv.from, mv.to); else if (pc) land(pc);
  if (mv.captured) setTimeout(() => dust(mv.to, mv.color === 'w' ? 'b' : 'w'), animate ? 180 : 0);
  if (game.inCheck()) Sound.check(); else if (mv.captured) Sound.capture(); else Sound.move();
  persist();
  checkGameOver();
  return mv;
}

/* =========================================================
   LE BOT JOUE
   ========================================================= */
function pickMove(result) {
  const cfg = strengthCfg;
  const legal = game.moves({ verbose: true });
  if (cfg.random && Math.random() < cfg.random) {
    const r = legal[Math.floor(Math.random() * legal.length)];
    return r.from + r.to + (r.promotion || '');
  }
  if (cfg.temp && result.lines.length > 1) {
    const best = Math.max(...result.lines.map((l) => l.score));
    const w = result.lines.map((l) => Math.exp((l.score - best) / cfg.temp));
    let x = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < w.length; i++) { x -= w[i]; if (x <= 0) return result.lines[i].move; }
  }
  return result.best;
}

function humanThinkTime() {
  const ply = game.history().length;
  let t;
  if (!G.tc) t = 0.5 + Math.random() * 1.2;
  else {
    const rem = G.clock[botColor()] / 1000;
    t = rem / 38 + G.tc.inc * 0.7;
    if (ply < 10) t *= 0.3;
    t *= 0.45 + Math.random() * 1.1;
    if (rem < 15) t = Math.min(t, 0.6);
  }
  if (game.moves().length === 1) t = 0.4;
  return Math.max(0.25, Math.min(14, t)) * 1000;
}

async function maybeBotMove() {
  if (!G || G.over || game.turn() === myColor()) return;
  const token = ++gen;
  thinking = true;
  $('thinking').classList.add('on');
  render();
  const t0 = performance.now();
  const target = humanThinkTime();
  const search = { ...strengthCfg.search };
  if (search.movetime) search.movetime = Math.min(search.movetime, target * 0.85);
  let result = null;
  try { result = await engine.search(game.fen(), search); } catch {}
  if (token !== gen) return;

  // le bot abandonne quand c'est vraiment perdu (comme un humain)
  if (result && G.mode === 'ranked' && game.history().length > 30 && G.opp.elo > 900) {
    botBad = result.score < -900 ? botBad + 1 : 0;
    if (botBad >= 2 && Math.random() < 0.6) {
      await sleep(900);
      if (token !== gen) return;
      thinking = false; $('thinking').classList.remove('on');
      chat(['gg', "j'abandonne, bien joué", 'gg wp', 'ok tu gères'], 1);
      finish({ kind: 'w', title: 'Victoire !', text: `${G.opp.name} abandonne.` });
      return;
    }
  }
  const uci = result && result.best && result.best !== '(none)' ? pickMove(result) : null;
  const wait = target - (performance.now() - t0);
  if (wait > 0) await sleep(wait);
  if (token !== gen) return;
  thinking = false;
  $('thinking').classList.remove('on');
  if (uci) doMove(uciToObj(uci), true);
  else render();
}

/* =========================================================
   FIN DE PARTIE + ELO
   ========================================================= */
function checkGameOver() {
  if (!game.isGameOver()) return;
  if (game.isCheckmate()) {
    const won = game.turn() !== myColor();
    finish(won
      ? { kind: 'w', title: 'Victoire !', text: `Échec et mat contre ${G.opp.name} !` }
      : { kind: 'l', title: 'Défaite', text: `${G.opp.name} t'a maté.` });
  } else {
    const why = game.isStalemate() ? 'Pat : plus aucun coup légal.'
      : game.isThreefoldRepetition() ? 'Triple répétition.'
      : game.isInsufficientMaterial() ? 'Matériel insuffisant.' : 'Règle des 50 coups.';
    finish({ kind: 'd', title: 'Nulle', text: why });
  }
}

function applyResult(g, kind) {
  const before = profile.elo;
  let delta = null;
  if (g.mode === 'ranked') {
    const K = profile.games < 15 ? 40 : profile.elo > 2000 ? 16 : 24;
    const exp = 1 / (1 + Math.pow(10, (g.opp.elo - profile.elo) / 400));
    const score = { w: 1, d: 0.5, l: 0 }[kind];
    delta = Math.round(K * (score - exp));
    if (kind === 'w' && delta < 1) delta = 1;
    if (kind === 'l' && delta > -1) delta = -1;
    profile.elo = Math.max(100, profile.elo + delta);
    profile.peak = Math.max(profile.peak, profile.elo);
    profile.games++;
    profile[kind]++;
    profile.ratings.push(profile.elo);
    if (profile.ratings.length > 100) profile.ratings.shift();
    store.set('px.profile', profile);
  }
  history.unshift({ name: g.opp.name, seed: g.opp.seed, flag: g.opp.flag, elo: g.opp.elo, kind, delta, mode: g.mode, tc: g.tcId, t: Date.now() });
  history = history.slice(0, 40);
  store.set('px.history', history);
  return { before, after: profile.elo, delta };
}

function finish(res) {
  if (G.over) return;
  commitClock();
  G.over = res.kind;
  gen++;
  engine.stop();
  thinking = false;
  $('thinking').classList.remove('on');
  select(null);
  persist();
  render();
  const r = applyResult(G, res.kind);
  if (res.kind === 'l') chat(['gg', 'gg wp', 'bien joué quand même', 'merci pour la partie'], 0.8);
  if (res.kind === 'w' && !res.text.includes('abandonne')) chat(['gg', 'bien joué !', 'wow gg', "j'ai rien vu venir"], 0.7);
  if (res.kind === 'd') chat(['gg', 'bien défendu', 'serré !'], 0.6);
  setTimeout(() => showResult(res, r), 900);
}

function showResult(res, r) {
  ({ w: () => Sound.win(), l: () => Sound.lose(), d: () => Sound.draw() })[res.kind]();
  const rb = $('resultRibbon');
  rb.textContent = res.title;
  rb.style.setProperty('--rb', { w: 'var(--green)', l: 'var(--red)', d: '#8a7a64' }[res.kind]);
  $('resultText').textContent = res.text;
  const ranked = G.mode === 'ranked';
  $('eloChange').classList.toggle('hidden', !ranked);
  $('rankUp').classList.add('hidden');
  $('newGameBtn').textContent = ranked ? 'Nouvel adversaire' : 'Changer de niveau';
  $('resultModal').classList.remove('hidden');
  if (!ranked) return;
  $('resBadge').src = badge(r.before);
  const d = $('resDelta');
  d.textContent = (r.delta > 0 ? '+' : '') + r.delta;
  d.className = 'delta ' + (r.delta >= 0 ? 'up' : 'down');
  const steps = 16;
  let i = 0;
  const iv = setInterval(() => {
    i++;
    $('resElo').textContent = Math.round(r.before + ((r.after - r.before) * i) / steps);
    if (i >= steps) {
      clearInterval(iv);
      $('resBadge').src = badge(r.after);
      const a = rankOf(r.before), b = rankOf(r.after);
      if (a.name !== b.name) {
        $('rankUp').textContent = r.after > r.before ? `Promotion : ${b.name} !` : `Rétrogradé : ${b.name}`;
        $('rankUp').classList.remove('hidden');
        if (r.after > r.before) Sound.win();
      }
    }
  }, 45);
  $('resElo').textContent = r.before;
}

/* =========================================================
   BOUTONS PARTIE
   ========================================================= */
function leaveGame() {
  gen++;
  engine.stop();
  commitClock();
  paused = true;
  thinking = false;
  $('thinking').classList.remove('on');
  persist();
  renderHome();
  show('home');
}
$('backBtn').onclick = leaveGame;

$('undoBtn').onclick = () => {
  if (G.mode === 'ranked' || !game.history().length) return;
  const wasThinking = thinking;
  gen++; engine.stop();
  thinking = false; $('thinking').classList.remove('on');
  G.over = null;
  $('resultModal').classList.add('hidden');
  game.undo();
  if (!wasThinking && game.history().length && game.turn() !== myColor()) game.undo();
  const h = game.history({ verbose: true });
  lastMove = h.length ? { from: h.at(-1).from, to: h.at(-1).to } : null;
  select(null); hintMove = null;
  persist(); render();
  maybeBotMove();
};

$('hintBtn').onclick = async () => {
  if (G.mode === 'ranked' || !canInteract()) return;
  const token = ++gen;
  $('hintBtn').disabled = true;
  const r = await engine.search(game.fen(), { depth: 14, skill: 20 });
  if (token !== gen) return;
  if (r.best && r.best !== '(none)') hintMove = uciToObj(r.best);
  render();
};

$('drawBtn').onclick = async () => {
  if (!canInteract()) return;
  const ply = game.history().length;
  if (ply - lastDrawOffer < 10) { chat(['tu viens de demander…', 'non toujours pas'], 1); return; }
  lastDrawOffer = ply;
  if (ply < 20) { chat(['trop tôt pour une nulle', 'non, on joue !', 'nan on vient de commencer'], 1); return; }
  const token = ++gen;
  thinking = true; $('thinking').classList.add('on'); render();
  const r = await engine.search(game.fen(), { depth: 10, skill: 20 });
  await sleep(700);
  if (token !== gen) return;
  thinking = false; $('thinking').classList.remove('on');
  const botScore = -r.score;            // le score est du point de vue du joueur au trait
  const accept = botScore <= 20 || (G.opp.elo < 1000 && botScore < 120 && Math.random() < 0.3);
  if (accept) {
    chat(['ok nulle', 'ça marche', 'nulle acceptée'], 1);
    finish({ kind: 'd', title: 'Nulle', text: `${G.opp.name} accepte la nulle.` });
  } else {
    chat(['non merci', 'je joue encore', 'nan je sens bien ma position'], 1);
    render();
  }
};

$('flipBtn').onclick = () => { orientation = orientation === 'w' ? 'b' : 'w'; buildBoard(); render(); };
$('soundBtn').onclick = () => { Sound.unlock(); Sound.on = !Sound.on; store.set('px.sound', Sound.on); render(); };

function confirmBox(title, text = '') {
  return new Promise((resolve) => {
    $('confirmTitle').textContent = title;
    $('confirmText').textContent = text;
    $('confirmModal').classList.remove('hidden');
    $('confirmYes').onclick = () => { $('confirmModal').classList.add('hidden'); resolve(true); };
    $('confirmNo').onclick = () => { $('confirmModal').classList.add('hidden'); resolve(false); };
  });
}

$('resignBtn').onclick = async () => {
  if (G.over) return;
  const ok = await confirmBox('Abandonner ?', G.mode === 'ranked' ? 'Tu vas perdre des points Elo.' : '');
  if (ok) finish({ kind: 'l', title: 'Abandon', text: `${G.opp.name} gagne par abandon.` });
};

$('rematchBtn').onclick = () => {
  const tc = TCS.find((t) => t.id === G.tcId) || TCS[1];
  newGame({ mode: G.mode, opp: G.opp, color: G.color === 'w' ? 'b' : 'w', tc });
};
$('newGameBtn').onclick = () => {
  $('resultModal').classList.add('hidden');
  if (G.mode === 'ranked') startRanked(); else { leaveGame(); openFriendly(); }
};
$('reviewBtn').onclick = () => $('resultModal').classList.add('hidden');
$('homeBtn').onclick = () => { $('resultModal').classList.add('hidden'); leaveGame(); };

/* =========================================================
   MATCHMAKING (classé)
   ========================================================= */
let searchToken = 0;
async function abandonPending() {
  const save = store.get('px.save', null);
  if (!save || save.over || !save.moves.length) return true;
  const ok = await confirmBox('Partie en cours', save.mode === 'ranked' ? 'Elle comptera comme une défaite.' : 'Elle sera abandonnée.');
  if (!ok) return false;
  applyResult(save, 'l');
  store.del('px.save');
  return true;
}

async function startRanked() {
  if (!(await abandonPending())) return;
  Sound.unlock();
  const token = ++searchToken;
  show('search');
  $('spinner').style.backgroundImage = `url("${pieceSprite('w', 'n')}")`;
  $('searchTitle').textContent = "Recherche d'un adversaire…";
  $('searchSub').textContent = `Elo ${profile.elo - 100} – ${profile.elo + 100} · ${tcId}`;
  $('versus').classList.add('hidden');
  const kinds = ['n', 'b', 'r', 'q', 'k', 'p'];
  let k = 0;
  const spin = setInterval(() => { $('spinner').style.backgroundImage = `url("${pieceSprite(k % 2 ? 'b' : 'w', kinds[k++ % 6])}")`; }, 450);
  await sleep(1300 + Math.random() * 2200);
  clearInterval(spin);
  if (token !== searchToken) return;

  const g = (Math.random() + Math.random() + Math.random() - 1.5) * 90;
  const opp = makeOpponent(Math.max(100, Math.min(3200, profile.elo + g)));
  Sound.found();
  $('searchTitle').textContent = 'Adversaire trouvé !';
  $('searchSub').textContent = '';
  $('vsMeAv').src = avatar(profile.seed); $('vsMeName').textContent = profile.name; $('vsMeElo').textContent = profile.elo;
  $('vsOppAv').src = avatar(opp.seed); $('vsOppName').textContent = opp.name; $('vsOppElo').textContent = opp.elo;
  $('versus').classList.remove('hidden');
  await sleep(1700);
  if (token !== searchToken) return;
  const tc = TCS.find((t) => t.id === tcId) || TCS[1];
  newGame({ mode: 'ranked', opp, color: Math.random() < 0.5 ? 'w' : 'b', tc });
}
$('rankedBtn').onclick = startRanked;
$('cancelSearch').onclick = () => { searchToken++; renderHome(); show('home'); };
$('resumeBtn').onclick = () => { Sound.unlock(); resumeGame(); };

/* =========================================================
   PARTIE AMICALE
   ========================================================= */
let frOpp = null;
function frPreview() {
  const elo = +$('frElo').value;
  frOpp = makeOpponent(elo, hashFromElo(elo));
  $('frAv').src = avatar(frOpp.seed);
  $('frName').textContent = frOpp.name;
  $('frRank').innerHTML = `<img class="badge sm" src="${badge(elo)}" alt=""> ${rankOf(elo).name}`;
  $('frEloVal').textContent = elo;
}
const hashFromElo = (e) => 4242 + e * 7;
function openFriendly() {
  $('frElo').value = store.get('px.frElo', Math.round(profile.elo / 50) * 50);
  frPreview();
  document.querySelectorAll('#frColor button').forEach((b) => b.classList.toggle('on', b.dataset.c === frColor));
  $('friendlyModal').classList.remove('hidden');
}
$('frElo').oninput = () => { frPreview(); Sound.unlock(); Sound.tick(); };
document.querySelectorAll('#frColor button').forEach((b) => {
  b.onclick = () => { frColor = b.dataset.c; store.set('px.frColor', frColor); document.querySelectorAll('#frColor button').forEach((x) => x.classList.toggle('on', x === b)); };
});
$('friendlyBtn').onclick = async () => { if (await abandonPending()) openFriendly(); };
$('frCancel').onclick = () => $('friendlyModal').classList.add('hidden');
$('frPlay').onclick = () => {
  Sound.unlock();
  store.set('px.frElo', +$('frElo').value);
  $('friendlyModal').classList.add('hidden');
  const tc = TCS.find((t) => t.id === tcId) || TCS[3];
  const color = frColor === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : frColor;
  newGame({ mode: 'friendly', opp: { ...frOpp }, color, tc });
};

/* =========================================================
   DÉMARRAGE
   ========================================================= */
if (!profile) openProfile(true);
else renderHome();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
