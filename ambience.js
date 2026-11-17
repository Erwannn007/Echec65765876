/* =========================================================
   AMBIANCE VIVANTE
   Calques superposés, du fond vers l'avant :
   planches → lianes du fond → (contenu) → faisceau de lumière,
   poussières, lucioles, lianes du premier plan, feuilles qui tombent.
   ========================================================= */
import { vine, lamp, leafSprite, lightBeam } from './pixel.js';

const rand = (a, b) => a + Math.random() * (b - a);

export function initAmbience() {
  const back = document.getElementById('ambBack');
  const front = document.getElementById('ambFront');

  /* --- lianes du fond (plus sombres, floues de profondeur) --- */
  const backVines = [
    { side: 'left', x: 46, h: 34, s: 11 }, { side: 'right', x: 52, h: 40, s: 12 },
    { side: 'left', x: 92, h: 22, s: 13 }, { side: 'right', x: 104, h: 26, s: 14 },
  ];
  for (const v of backVines) back.appendChild(vineEl(v, 'vine back-vine'));

  /* --- faisceau de lumière + lampe --- */
  // la lumière vit dans son propre calque (mode « screen ») pour vraiment éclairer
  // ce qui est dessous ; elle se balance exactement comme la lampe.
  const light = document.getElementById('ambLight');
  light.innerHTML = `
    <div class="top-glow"></div>
    <div class="beam-wrap"><img class="beam-img" src="${lightBeam()}" alt=""><i class="bulb-glow"></i></div>`;
  front.insertAdjacentHTML('beforeend', `
    <div class="lamp"><i class="cord"></i><img src="${lamp()}" alt=""></div>`);

  /* --- poussières qui flottent dans la lumière --- */
  const motes = document.createElement('div');
  motes.className = 'motes';
  for (let i = 0; i < 26; i++) {
    const m = document.createElement('i');
    const y = rand(8, 85);                      // plus on descend, plus le faisceau est large
    const spread = 6 + y * 0.42;
    m.style.left = `calc(50% + ${rand(-spread, spread)}vw)`;
    m.style.top = y + '%';
    m.style.setProperty('--d', rand(9, 20) + 's');
    m.style.setProperty('--dl', -rand(0, 20) + 's');
    m.style.setProperty('--dx', rand(-30, 30) + 'px');
    m.style.setProperty('--dy', rand(-60, 40) + 'px');
    m.style.setProperty('--o', rand(0.35, 0.9).toFixed(2));
    if (Math.random() < 0.3) m.classList.add('big');
    motes.appendChild(m);
  }
  front.appendChild(motes);

  /* --- lucioles près de la verdure --- */
  const flies = document.createElement('div');
  flies.className = 'flies';
  for (let i = 0; i < 7; i++) {
    const f = document.createElement('i');
    const left = i % 2 ? rand(2, 18) : rand(82, 97);
    f.style.left = left + '%';
    f.style.top = rand(10, 92) + '%';
    f.style.setProperty('--d', rand(5, 11) + 's');
    f.style.setProperty('--b', rand(1.4, 3.2) + 's');
    f.style.setProperty('--dl', -rand(0, 10) + 's');
    f.style.setProperty('--x', rand(-40, 40) + 'px');
    f.style.setProperty('--y', rand(-50, 50) + 'px');
    flies.appendChild(f);
  }
  front.appendChild(flies);

  /* --- lianes du premier plan (devant le contenu) --- */
  const frontVines = [
    { side: 'left', x: -6, h: 58, s: 1 }, { side: 'left', x: 14, h: 30, s: 2 },
    { side: 'right', x: -6, h: 64, s: 3 }, { side: 'right', x: 16, h: 36, s: 4 },
  ];
  for (const v of frontVines) front.appendChild(vineEl(v, 'vine front-vine'));

  /* --- feuilles qui se détachent de temps en temps --- */
  const leaves = [leafSprite(false), leafSprite(true)];
  const drop = () => {
    if (!document.hidden && document.body.dataset.screen !== 'game') {
      const l = document.createElement('img');
      l.className = 'falling-leaf';
      l.src = leaves[Math.random() < 0.3 ? 1 : 0];
      const left = Math.random() < 0.5;
      l.style[left ? 'left' : 'right'] = rand(2, 50) + 'px';
      l.style.top = rand(40, 170) + 'px';
      l.style.setProperty('--sx', (left ? 1 : -1) * rand(30, 110) + 'px');
      l.style.setProperty('--d', rand(6, 10) + 's');
      front.appendChild(l);
      setTimeout(() => l.remove(), 10500);
    }
    setTimeout(drop, rand(2500, 6500));
  };
  setTimeout(drop, 1800);
}

function vineEl({ side, x, h, s }, cls) {
  const img = document.createElement('img');
  img.className = cls;
  img.src = vine(s, h);
  img.style[side] = x + 'px';
  img.style.height = h * 3 + 'px';
  img.style.width = 20 * 3 + 'px';
  img.style.setProperty('--d', rand(3.5, 6) + 's');
  img.style.setProperty('--dl', -rand(0, 5) + 's');
  img.style.setProperty('--r', rand(1.5, 3.5) + 'deg');
  return img;
}

export function setAmbience(screen) {
  document.body.dataset.screen = screen;
}
