'use strict';
// Hollow Pines: top-down flashlight horror. Everything is drawn into a small pixel buffer, then lit
// per pixel by the flashlight cone (with tree shadows), fires, the trailhead lamp and moonlight pools.
const $ = id => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wrapA = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const R = () => Math.random();
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash2(x, y) { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) | 0; h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; }
function vnoise(x, y) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
const C = hex => { const n = parseInt(hex.slice(1), 16); return (0xff000000 | ((n & 255) << 16) | (n & 0xff00) | (n >> 16)) >>> 0; };
const BLACK = 0xff000000 >>> 0;

// ---------------- screen ----------------
const PPM = 9;                 // pixels per meter
let W = 320, H = 180, img, out32, ob, LX, LY, LF;
let rotated = false;
const VW = () => rotated ? innerHeight : innerWidth, VH = () => rotated ? innerWidth : innerHeight;
function ptL(e) { return rotated ? { x: e.clientY, y: innerWidth - e.clientX } : { x: e.clientX, y: e.clientY }; }
function resize() {
  rotated = innerHeight > innerWidth;
  document.documentElement.classList.toggle('rot', rotated);
  const asp = VW() > 0 && VH() > 0 ? VW() / VH() : 16 / 9;
  H = 180; W = clamp(Math.round(H * asp), 240, 440) || 320;
  cv.width = W; cv.height = H;
  img = ctx.createImageData(W, H); out32 = new Uint32Array(img.data.buffer); ob = new Uint32Array(W * H); LX = new Float32Array(W * H); LY = new Float32Array(W * H); LF = new Uint8Array(W * H);
}
addEventListener('resize', resize);
resize();

// ---------------- world ----------------
const WX0 = -76, WX1 = 76, WY0 = -462, WY1 = 26, TEX = 4;
const GW = (WX1 - WX0) * TEX, GH = (WY1 - WY0) * TEX;
const ROADY = -440, PY0 = 8;
const ground = new Uint32Array(GW * GH);
const HC = 6, HGX = Math.ceil((WX1 - WX0) / HC), HGY = Math.ceil((WY1 - WY0) / HC);
let PX = [], solidG, decorG, trees, reflectors, decoys, moons, fires, lights, logs, rocks, ferns, bushes;
let CAR, LAMP, TENT, CAMP, FALLEN;
let rnd = mulberry32(1);

const PAL = {
  needle: ['#5e452c', '#6b4f33', '#4f3a26'].map(C), leaf: ['#7a5530', '#8a6236', '#6b3f24'].map(C),
  moss: ['#45512a', '#535f31', '#3a4524'].map(C), dirt: ['#8f7a5a', '#9c8763', '#7f6b4e'].map(C),
  gravel: ['#77726a', '#86817a', '#67625b'].map(C), ash: C('#4a4540'), twig: C('#a08f70'),
  pine: ['#5b4433', '#4a372a', '#33261c'].map(C), oak: ['#544538', '#463a2f', '#2e261f'].map(C),
  birch: ['#d9d5ca', '#c4c0b4', '#8d897f'].map(C), birchMark: C('#2a2724'),
  rock: ['#86837b', '#6f6c65', '#55534d'].map(C), fern: ['#4f6b33', '#5f7c3a', '#3e5628'].map(C),
  bush: ['#3d5a2c', '#4a6833', '#2f4622', '#55703a'].map(C),
  skin: C('#b8b2a6'), skin2: C('#938d82'), sock: C('#1e1b19'), stump: ['#a39c8e', '#8a8477', '#6a655b'].map(C),
  deer: ['#7d5b3c', '#6a4b30', '#d8cdb8'].map(C), jacket: C('#3f4a5c'), hair: C('#3a2a20'), hand: C('#c9a98a'), torch: C('#d0d0cc'),
  tent: ['#8a5a32', '#6e4626', '#a87444'].map(C), car: ['#56616c', '#434c55', '#1d2227', '#a8b0b8'].map(C), refl: C('#cfe6f2'),
  stone: ['#7d7a72', '#5f5c56'].map(C), log: ['#5a4230', '#7c6248', '#3c2c20'].map(C), post: C('#3a3a3a'),
};

function pathX(y) {
  let k = (PY0 - y) / 2; const n = PX.length - 1;
  if (k < 0) k = 0; if (k > n) k = n;
  const i = Math.floor(k), f = k - i; return PX[i] + (PX[Math.min(n, i + 1)] - PX[i]) * f;
}
function distPath(x, y) {
  if (y > PY0) return Math.hypot(x - PX[0], y - PY0);
  if (y < ROADY) return 99;
  const s = (pathX(y - 1) - pathX(y + 1)) / 2;
  return Math.abs(x - pathX(y)) / Math.sqrt(1 + s * s);
}
function gridAdd(G, o, x0, y0, x1, y1) {
  const a = clamp(Math.floor((x0 - WX0) / HC), 0, HGX - 1), b = clamp(Math.floor((x1 - WX0) / HC), 0, HGX - 1);
  const c = clamp(Math.floor((y0 - WY0) / HC), 0, HGY - 1), d = clamp(Math.floor((y1 - WY0) / HC), 0, HGY - 1);
  for (let gy = c; gy <= d; gy++) for (let gx = a; gx <= b; gx++) G[gy * HGX + gx].push(o);
}
let stamp = 1;
function near(G, x, y, r, cb) {
  stamp++;
  const a = clamp(Math.floor((x - r - WX0) / HC), 0, HGX - 1), b = clamp(Math.floor((x + r - WX0) / HC), 0, HGX - 1);
  const c = clamp(Math.floor((y - r - WY0) / HC), 0, HGY - 1), d = clamp(Math.floor((y + r - WY0) / HC), 0, HGY - 1);
  for (let gy = c; gy <= d; gy++) for (let gx = a; gx <= b; gx++) {
    const L = G[gy * HGX + gx];
    for (let i = 0; i < L.length; i++) { const o = L[i]; if (o._s === stamp) continue; o._s = stamp; cb(o); }
  }
}
function addSolid(o) {
  if (o.t === 'log') gridAdd(solidG, o, Math.min(o.x1, o.x2) - o.r, Math.min(o.y1, o.y2) - o.r, Math.max(o.x1, o.x2) + o.r, Math.max(o.y1, o.y2) + o.r);
  else gridAdd(solidG, o, o.x - o.r, o.y - o.r, o.x + o.r, o.y + o.r);
}
function addDecor(o) { gridAdd(decorG, o, o.x - o.r, o.y - o.r, o.x + o.r, o.y + o.r); }
function blocked(x, y, r) {
  let hit = false;
  if (x < WX0 + 3 || x > WX1 - 3 || y < WY0 + 3 || y > WY1 - 3) return true;
  near(solidG, x, y, r + 1.5, o => {
    if (hit) return;
    if (o.t === 'log') { if (segDist(x, y, o) < o.r + r) hit = true; }
    else if (Math.hypot(x - o.x, y - o.y) < o.r + r) hit = true;
  });
  return hit;
}
function segDist(x, y, o) {
  const dx = o.x2 - o.x1, dy = o.y2 - o.y1, L2 = dx * dx + dy * dy;
  const t = clamp(((x - o.x1) * dx + (y - o.y1) * dy) / L2, 0, 1);
  return Math.hypot(x - (o.x1 + dx * t), y - (o.y1 + dy * t));
}

function buildWorld(seed) {
  rnd = mulberry32(seed);
  // the trail: wanders north from camp to the trailhead road
  const off = rnd() * 1000; PX = [];
  const f = t => Math.sin(t * 0.012 + off) * 24 + Math.sin(t * 0.029 + off * 1.7) * 10 + Math.sin(t * 0.071 + off * 2.3) * 3;
  const f0 = f(0);
  for (let y = PY0; y >= ROADY - 2; y -= 2) { const t = PY0 - y; PX.push(clamp((f(t) - f0) * sstep(0, 40, t), -52, 52)); }
  solidG = Array.from({ length: HGX * HGY }, () => []); decorG = Array.from({ length: HGX * HGY }, () => []);
  trees = []; reflectors = []; decoys = []; moons = []; fires = []; logs = []; rocks = []; ferns = []; bushes = [];

  // places
  CAMP = { x: 0, y: 9.5 };
  TENT = { x: 3.2, y: 12, a: 0.25, w: 2.2, h: 1.6 };
  const clear = [{ x: 0, y: 10, r: 7.5 }];
  for (const fr of [0.36, 0.69]) {
    const y = PY0 + (ROADY - PY0) * fr, side = rnd() < 0.5 ? -1 : 1, x = pathX(y) + side * 3.6;
    fires.push({ x, y, r: 6.8, safe: 4.2, i: 0.95, c: [1, 0.55, 0.22], ph: rnd() * 9 });
    clear.push({ x, y, r: 6.2 });
  }
  const ex = pathX(ROADY + 1);
  CAR = { x: ex + 3.5, y: ROADY - 2.6, a: 0, w: 4.4, h: 1.9 };
  LAMP = { x: ex - 5, y: ROADY - 4.5 };
  lights = [
    { x: CAMP.x, y: CAMP.y, r: 1.7, i: 0.28, c: [1, 0.33, 0.1], ph: 0, ember: true },
    { x: LAMP.x, y: LAMP.y, r: 15, i: 0.95, c: [1, 0.66, 0.32], ph: 0, lamp: true },
    ...fires,
  ];
  // moonlight through gaps in the canopy
  for (let i = 0; i < 11; i++) {
    const y = -25 - rnd() * 395, x = pathX(y) + (rnd() - 0.5) * 16;
    moons.push({ x, y, r: 2.4 + rnd() * 2.2, i: 0.07 + rnd() * 0.04 });
  }
  const inClear = (x, y, pad = 0) => clear.some(c => Math.hypot(x - c.x, y - c.y) < c.r + pad);
  const roadBand = y => y < ROADY + 2.5 && y > ROADY - 7;

  // props as solids
  addSolid({ t: 'prop', x: TENT.x - 0.6, y: TENT.y, r: 0.9 }); addSolid({ t: 'prop', x: TENT.x + 0.6, y: TENT.y + 0.15, r: 0.9 });
  addSolid({ t: 'prop', x: CAMP.x, y: CAMP.y, r: 0.55, low: true });
  for (const fr of fires) addSolid({ t: 'prop', x: fr.x, y: fr.y, r: 0.6, low: true });
  addSolid({ t: 'prop', x: CAR.x - 1.3, y: CAR.y, r: 1.0 }); addSolid({ t: 'prop', x: CAR.x + 1.3, y: CAR.y, r: 1.0 });
  addSolid({ t: 'prop', x: LAMP.x, y: LAMP.y, r: 0.15 });
  // seat logs by the fires
  for (const fr of fires) {
    const a = rnd() * TAU, x = fr.x + Math.cos(a) * 2.2, y = fr.y + Math.sin(a) * 2.2, b = a + Math.PI / 2;
    const lg = { t: 'log', x1: x - Math.cos(b) * 1.2, y1: y - Math.sin(b) * 1.2, x2: x + Math.cos(b) * 1.2, y2: y + Math.sin(b) * 1.2, r: 0.22, low: true };
    lg.x = x; lg.y = y; logs.push(lg); addSolid(lg);
  }

  // trees, rocks, undergrowth on a jittered grid
  const CELL = 3.3;
  for (let gy = WY0; gy < WY1; gy += CELL) for (let gx = WX0; gx < WX1; gx += CELL) {
    const tx = gx + rnd() * CELL, ty = gy + rnd() * CELL;
    const edge = tx < WX0 + 7 || tx > WX1 - 7 || ty < WY0 + 7 || ty > WY1 - 7;
    const dp = distPath(tx, ty);
    const nf = (rnd() * 2.6) | 0;
    for (let k = 0; k < nf; k++) {
      const fx = gx + rnd() * CELL, fy = gy + rnd() * CELL;
      if (distPath(fx, fy) > 1.1 && !roadBand(fy) && !inClear(fx, fy, -2)) { const o = { x: fx, y: fy, r: 0.35 + rnd() * 0.5, s: rnd() * TAU }; ferns.push(o); addDecor(o); }
    }
    if (!edge && (inClear(tx, ty) || roadBand(ty) || dp < 1.7)) continue;
    const roll = rnd();
    if (edge || roll < (dp < 4.2 ? 0.42 : 0.7)) {
      const k = rnd(), r = edge ? 0.35 + rnd() * 0.35 : 0.15 + Math.pow(rnd(), 2) * 0.4;
      const o = { t: 'tree', x: tx, y: ty, r, k: k < 0.12 ? 2 : k < 0.58 ? 0 : 1, s: rnd() };
      trees.push(o); addSolid(o);
      if (edge && rnd() < 0.7) { const o2 = { t: 'tree', x: tx + (rnd() - 0.5) * 2, y: ty + (rnd() - 0.5) * 2, r: 0.3 + rnd() * 0.3, k: 0, s: rnd() }; trees.push(o2); addSolid(o2); }
    } else if (roll < 0.79) {
      const o = { t: 'rock', x: tx, y: ty, r: 0.3 + rnd() * 0.55, s: rnd() };
      rocks.push(o); addSolid(o);
    } else if (roll < 0.92 && dp > 2.2) {
      const o = { x: tx, y: ty, r: 0.8 + rnd() * 0.7, s: rnd(), bush: true };
      bushes.push(o); addDecor(o);
    }
  }
  // fallen logs (kept off the trail)
  for (let i = 0; i < 60; i++) {
    const x = WX0 + 10 + rnd() * (WX1 - WX0 - 20), y = WY0 + 10 + rnd() * (WY1 - WY0 - 30);
    const a = rnd() * TAU, L = 2.5 + rnd() * 4;
    const x1 = x - Math.cos(a) * L / 2, y1 = y - Math.sin(a) * L / 2, x2 = x + Math.cos(a) * L / 2, y2 = y + Math.sin(a) * L / 2;
    if (distPath(x1, y1) < 2.4 || distPath(x2, y2) < 2.4 || distPath(x, y) < 2.4 || inClear(x, y, 1) || roadBand(y1) || roadBand(y2)) continue;
    const o = { t: 'log', x, y, x1, y1, x2, y2, r: 0.2 + rnd() * 0.13 }; logs.push(o); addSolid(o);
  }
  // trail reflectors nailed to trees beside the path. One stretch has lost its markers.
  const gap0 = -235 - rnd() * 30, gap1 = gap0 - 38;
  let side = 1;
  for (let y = -4; y > ROADY + 8; y -= 11 + rnd() * 4) {
    if (y < gap0 && y > gap1) continue;
    const px = pathX(y); let best = null, bd = 1e9;
    near(solidG, px, y, 6, o => {
      if (o.t !== 'tree' || o.refl) return;
      const dp = distPath(o.x, o.y); if (dp < 1.6 || dp > 5) return;
      const sgn = Math.sign(o.x - pathX(o.y));
      const sc = Math.abs(o.y - y) + (sgn === side ? 0 : 2.5) + dp * 0.3;
      if (sc < bd) { bd = sc; best = o; }
    });
    if (!best) continue;
    best.refl = true;
    const qx = pathX(best.y) - best.x, qy = 0, ql = Math.hypot(qx, qy) || 1;
    reflectors.push({ x: best.x + qx / ql * (best.r + 0.03), y: best.y + qy / ql * (best.r + 0.03), tree: best });
    side = -side;
  }
  const fy = (gap0 + gap1) / 2;
  FALLEN = { x: pathX(fy) + 0.4, y: fy };
  // pale stumps with branch arms: they look a lot like it
  for (let i = 0; i < 18; i++) {
    const y = -20 - rnd() * 400, side2 = rnd() < 0.5 ? -1 : 1, x = pathX(y) + side2 * (3 + rnd() * 6);
    if (blocked(x, y, 0.5) || inClear(x, y)) continue;
    const o = { x, y, r: 0.6, a: rnd() * TAU, s: rnd(), decoy: true }; decoys.push(o); addDecor(o);
  }
  bakeGround();
}

function bakeGround() {
  const ashes = [CAMP, ...fires];
  for (let gy = 0; gy < GH; gy++) {
    const wy = WY0 + (gy + 0.5) / TEX;
    const inPath = wy <= PY0 + 2 && wy >= ROADY;
    const px = inPath ? pathX(wy) : 0, s = inPath ? (pathX(wy - 1) - pathX(wy + 1)) / 2 : 0, sl = Math.sqrt(1 + s * s);
    const road = wy < ROADY + 2.5 && wy > ROADY - 7;
    for (let gx = 0; gx < GW; gx++) {
      const wx = WX0 + (gx + 0.5) / TEX;
      const n1 = vnoise(wx * 0.28, wy * 0.28) * 0.7 + vnoise(wx * 0.9 + 40, wy * 0.9) * 0.3;
      const n2 = vnoise(wx * 2.3, wy * 2.3), h = hash2(gx, gy);
      const pal = n1 > 0.6 ? PAL.moss : n1 < 0.36 ? PAL.leaf : PAL.needle;
      let col = pal[n2 < 0.33 ? 2 : n2 < 0.66 ? 0 : 1];
      if (h > 0.93) col = pal[1];
      if (h > 0.988) col = PAL.twig;
      if (inPath) {
        const dp = Math.abs(wx - px) / sl, edge = 0.72 + (n2 - 0.5) * 0.5;
        if (dp < edge) col = PAL.dirt[h < 0.2 ? 2 : h > 0.85 ? 1 : 0];
        else if (dp < edge + 0.4 && h < 0.45) col = PAL.dirt[2];
      }
      if (wy > PY0 - 1) { const dc = Math.hypot(wx - CAMP.x, wy - CAMP.y); if (dc < 5 && h < 0.5 * (1 - dc / 5)) col = PAL.dirt[2]; }
      if (road) col = PAL.gravel[h < 0.3 ? 2 : h > 0.8 ? 1 : 0];
      for (let i = 0; i < ashes.length; i++) { const a = ashes[i]; const d = Math.abs(wx - a.x) + Math.abs(wy - a.y); if (d < 1.6 && Math.hypot(wx - a.x, wy - a.y) < 1.0 + n2 * 0.3) col = PAL.ash; }
      ground[gy * GW + gx] = col;
    }
  }
}

// ---------------- state ----------------
const P = { x: 0, y: 6, aim: -Math.PI / 2, aimT: -Math.PI / 2, vx: 0, vy: 0, stam: 1, mode: 'still', noise: 0, stepT: 0, moving: false, inBush: false, face: -Math.PI / 2 };
const bat = { c: 1, r: 1, dead: false, force: 0 };
const beam = { out: 1, hw: 0.52, R: 10.5, tr: 1, tg: 0.92, tb: 0.74, cosO: 0 };
const CR = { x: 1e6, y: 1e6, a: 0, st: 'away', t: 0, v: 0, eyes: false, prov: 0, th: 3, unlit: 0, prev: '', lx: 0, ly: 0, tx: 0, ty: 0, dur: 0, rad: 14, dir: 1, nextSnd: 0, lit: 0, lost: 0, fire: null, hunting: false };
const DEER = { on: false, x: 0, y: 0, a: 0, st: 'watch', t: 0, litT: 0, stepT: 0 };
const D = { t: 0, next: 30, bold: 0, sightings: 0, hunts: 0, heat: 0, first: true, amb: 20, mute: 0 };
let lightOn = true, narrow = false, adapt = 0, fear = 0.05, shake = 0, cam = { x: 0, y: 2 }, tNow = 0;
let mode = 'title', runSeed = 1, runTime = 0, deathT = 0, ripples = [], soundOn = true, wonT = 0, bestStats = null;
const sd = new Float32Array(1024), sr = new Float32Array(1024), NB = 1024;

// ---------------- audio ----------------
let AC = null, master, crickBus, windG, noiseBuf, crickets = [], nextBeat = 0;
function initAudio() {
  if (AC) { if (AC.state !== 'running') AC.resume(); return; }
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; return; }
  master = AC.createGain(); master.gain.value = soundOn ? 0.9 : 0;
  const comp = AC.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
  master.connect(comp); comp.connect(AC.destination);
  noiseBuf = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate);
  const ch = noiseBuf.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  // wind in the canopy
  const ws = AC.createBufferSource(); ws.buffer = noiseBuf; ws.loop = true;
  const wf = AC.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 420;
  windG = AC.createGain(); windG.gain.value = 0.05; ws.connect(wf).connect(windG).connect(master); ws.start();
  // crickets
  crickBus = AC.createGain(); crickBus.gain.value = 0; crickBus.connect(master);
  for (let i = 0; i < 7; i++) {
    const o = AC.createOscillator(); o.type = 'sine'; o.frequency.value = 4100 + Math.random() * 1300;
    const g = AC.createGain(); g.gain.value = 0;
    let dest = crickBus;
    if (AC.createStereoPanner) { const p = AC.createStereoPanner(); p.pan.value = (Math.random() * 2 - 1) * 0.85; p.connect(crickBus); dest = p; }
    o.connect(g).connect(dest); o.start();
    crickets.push({ g, next: AC.currentTime + Math.random() * 2, vol: 0.012 + Math.random() * 0.02, gap: 0.6 + Math.random() * 0.9, n: 2 + (Math.random() * 3 | 0) });
  }
}
function wakeAudio() { if (AC && AC.state !== 'running') AC.resume().catch(() => {}); }
document.addEventListener('visibilitychange', () => { if (!document.hidden) wakeAudio(); else if (mode === 'play') pause(); });
addEventListener('pageshow', wakeAudio);
function bus(x, y, vol = 1) {
  const g = AC.createGain();
  let gain = vol, pan = 0;
  if (x != null) { const dx = x - P.x, dy = y - P.y, d = Math.hypot(dx, dy); gain = vol / (1 + d * d / 70); pan = clamp(dx / 10, -0.9, 0.9); }
  g.gain.value = gain;
  if (AC.createStereoPanner) { const p = AC.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(master); } else g.connect(master);
  return g;
}
function nz(dest, t0, dur, f, q, vol, type = 'bandpass', f2 = 0, att = 0.004) {
  const s = AC.createBufferSource(); s.buffer = noiseBuf;
  const bf = AC.createBiquadFilter(); bf.type = type; bf.frequency.setValueAtTime(f, t0); if (f2) bf.frequency.exponentialRampToValueAtTime(f2, t0 + dur); bf.Q.value = q;
  const g = AC.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + att); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(bf).connect(g).connect(dest); s.start(t0, Math.random() * 1.5); s.stop(t0 + dur + 0.05);
}
function tn(dest, t0, dur, f, type, vol, f2 = 0, att = 0.005) {
  const o = AC.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  const g = AC.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + att); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(dest); o.start(t0); o.stop(t0 + dur + 0.05);
}
const snd = {
  ok: () => AC && AC.state === 'running',
  step(surface, m) { if (!snd.ok()) return; const t = AC.currentTime, v = m === 'run' ? 0.2 : m === 'walk' ? 0.1 : 0.04; const b = bus(null, null, 1); if (surface === 'dirt') nz(b, t, 0.06, 700, 0.9, v * 0.8); else nz(b, t, 0.07, 2300 + Math.random() * 900, 0.7, v); },
  rustle(x, y, v = 0.5) { if (!snd.ok()) return; const t = AC.currentTime, b = bus(x, y, 1); nz(b, t, 0.25, 2800, 0.5, v, 'bandpass', 0, 0.06); nz(b, t + 0.08 + Math.random() * 0.1, 0.18, 3600, 0.6, v * 0.6, 'bandpass', 0, 0.04); ripple(x, y, 0.5); },
  twig(x, y, v = 1) { if (!snd.ok()) return; const t = AC.currentTime, b = bus(x, y, v); nz(b, t, 0.025, 2600, 0.6, 0.9, 'highpass'); nz(b, t + 0.045, 0.02, 3000, 0.6, 0.6, 'highpass'); tn(b, t, 0.035, 900, 'square', 0.08, 260); ripple(x, y, 1); },
  breath(x, y, v = 0.35) { if (!snd.ok()) return; const t = AC.currentTime, b = bus(x, y, 1); const s = AC.createBufferSource(); s.buffer = noiseBuf; const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(800, t); f.frequency.linearRampToValueAtTime(380, t + 1.3); const g = AC.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.55); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4); s.connect(f).connect(g).connect(b); s.start(t, Math.random()); s.stop(t + 1.5); },
  stinger(big) {
    if (!snd.ok()) return; const t = AC.currentTime, b = bus(null, null, big ? 0.9 : 0.4), dur = big ? 2.4 : 1.6;
    const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(big ? 2400 : 900, t); lp.frequency.exponentialRampToValueAtTime(300, t + dur); lp.connect(b);
    tn(lp, t, dur, 98, 'sawtooth', 0.22, 92, big ? 0.02 : 0.25); tn(lp, t, dur, 104, 'sawtooth', 0.2, 97, big ? 0.02 : 0.3);
    if (big) { tn(b, t, 1.1, 1318, 'sine', 0.05, 1240, 0.01); tn(b, t, 1.1, 1396, 'sine', 0.05, 1500, 0.01); nz(b, t, 0.5, 2000, 0.4, 0.25, 'bandpass', 600, 0.01); }
  },
  shriek(x, y) { if (!snd.ok()) return; const t = AC.currentTime, b = bus(x, y, 2.2); nz(b, t, 0.7, 1300, 1.4, 0.6, 'bandpass', 3400, 0.03); tn(b, t, 0.6, 320, 'sawtooth', 0.09, 880, 0.03); tn(b, t + 0.02, 0.6, 337, 'sawtooth', 0.07, 940, 0.03); },
  thud(x, y) { if (!snd.ok()) return; const t = AC.currentTime, b = bus(x, y, 1.4); tn(b, t, 0.13, 75, 'sine', 0.5, 40); nz(b, t, 0.09, 1900, 0.6, 0.35); ripple(x, y, 0.8); },
  heart(v) { if (!snd.ok()) return; const t = AC.currentTime, b = bus(null, null, 1); const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160; lp.connect(b); tn(lp, t, 0.15, 60, 'sine', v, 38, 0.008); tn(lp, t + 0.2, 0.17, 54, 'sine', v * 0.7, 36, 0.008); },
  click(on) { if (!snd.ok()) return; const t = AC.currentTime, b = bus(null, null, 1); tn(b, t, 0.014, on ? 1900 : 1300, 'square', 0.07); nz(b, t, 0.02, 4000, 0.5, 0.08, 'highpass'); },
  fizzle() { if (!snd.ok()) return; const t = AC.currentTime, b = bus(null, null, 1); tn(b, t, 0.3, 180, 'sawtooth', 0.025, 70); for (let i = 0; i < 3; i++) nz(b, t + i * 0.07, 0.015, 3500, 0.5, 0.08, 'highpass'); },
  sputter() { if (!snd.ok()) return; const t = AC.currentTime, b = bus(null, null, 1); for (let i = 0; i < 4; i++) nz(b, t + i * 0.05 + Math.random() * 0.03, 0.012, 3500, 0.5, 0.06, 'highpass'); tn(b, t, 0.25, 120, 'square', 0.01, 120); },
  owl(x, y) { if (!snd.ok()) return; const t = AC.currentTime, b = bus(x, y, 1.6); tn(b, t, 0.3, 410, 'sine', 0.18, 370, 0.05); tn(b, t + 0.45, 0.22, 400, 'sine', 0.12, 380, 0.04); tn(b, t + 0.85, 0.6, 405, 'sine', 0.16, 350, 0.06); },
  deer(x, y) { for (let i = 0; i < 6; i++) setTimeout(() => { if (snd.ok()) { const a = DEER.on ? DEER : { x, y }; snd.rustle(a.x, a.y, 0.6); if (i % 2) snd.twig(a.x, a.y, 0.6); } }, i * 220); },
  win() { if (!snd.ok()) return; const t = AC.currentTime, b = bus(null, null, 1); [220, 277, 330, 440].forEach((f, i) => tn(b, t + i * 0.25, 2.6, f, 'triangle', 0.06, 0, 0.3)); },
  caught() { if (!snd.ok()) return; const t = AC.currentTime, b = bus(null, null, 1.2); nz(b, t, 1.2, 900, 0.5, 0.8, 'bandpass', 200, 0.005); tn(b, t, 1.4, 70, 'sawtooth', 0.4, 30, 0.005); tn(b, t, 0.9, 1480, 'square', 0.05, 600, 0.005); },
};
function ripple(x, y, s) { ripples.push({ x, y, t: 0, s }); if (ripples.length > 20) ripples.shift(); }
function audioTick(dt) {
  if (!snd.ok()) return;
  const t = AC.currentTime;
  // crickets go quiet when it is near
  const cg = (mode === 'play' || mode === 'title') ? 1 - D.mute : 0;
  crickBus.gain.setTargetAtTime(cg, t, 0.6);
  for (const c of crickets) {
    if (t + 0.25 > c.next) {
      const st = Math.max(c.next, t + 0.02);
      for (let i = 0; i < c.n; i++) { const a = st + i * 0.07; c.g.gain.setValueAtTime(0, a); c.g.gain.linearRampToValueAtTime(c.vol, a + 0.012); c.g.gain.setValueAtTime(c.vol, a + 0.035); c.g.gain.linearRampToValueAtTime(0, a + 0.05); }
      c.next = st + c.gap + Math.random() * 0.4;
    }
  }
  windG.gain.setTargetAtTime(0.035 + 0.02 * Math.sin(t * 0.2), t, 1);
  // heartbeat
  if (mode === 'play' && t > nextBeat) {
    const bpm = 64 + fear * 100; nextBeat = t + 60 / bpm;
    if (fear > 0.12) snd.heart(0.06 + fear * 0.55);
    if (fear > 0.55) { pulseVig(fear); if (fear > 0.8 && navigator.vibrate) try { navigator.vibrate(30); } catch (e) {} }
  }
}
const vig = $('vig');
function pulseVig(f) {
  vig.style.transition = 'none'; vig.style.opacity = String((f - 0.5) * 1.1);
  requestAnimationFrame(() => { vig.style.transition = 'opacity .35s'; vig.style.opacity = '0'; });
}

// ---------------- input ----------------
const keys = {};
const stick = { move: null, aim: null };
const stL = $('stL'), stR = $('stR');
const touchEl = $('touch');
let mouseAim = null, lastTap = 0;
const STICK_R = 52;
function placeStick(el, x, y) { el.style.left = x + 'px'; el.style.top = y + 'px'; }
touchEl.addEventListener('pointerdown', e => {
  if (mode !== 'play') return;
  initAudio(); wakeAudio();
  const p = ptL(e);
  if (e.pointerType === 'mouse') { if (e.button === 0) toggleLight(); else if (e.button === 2) toggleFocus(); return; }
  const left = p.x < VW() * 0.5;
  const s = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y, t0: performance.now(), moved: 0 };
  if (left && !stick.move) { stick.move = s; stL.hidden = false; placeStick(stL, p.x, p.y); stL.firstChild.style.transform = ''; }
  else if (!left && !stick.aim) { stick.aim = s; stR.hidden = false; placeStick(stR, p.x, p.y); stR.firstChild.style.transform = ''; }
  try { touchEl.setPointerCapture(e.pointerId); } catch (er) {}
});
touchEl.addEventListener('contextmenu', e => e.preventDefault());
touchEl.addEventListener('pointermove', e => {
  const p = ptL(e);
  if (e.pointerType === 'mouse') { mouseAim = p; return; }
  for (const k of ['move', 'aim']) {
    const s = stick[k]; if (!s || s.id !== e.pointerId) continue;
    s.x = p.x; s.y = p.y;
    let dx = p.x - s.ox, dy = p.y - s.oy; const L = Math.hypot(dx, dy); s.moved = Math.max(s.moved, L);
    if (L > STICK_R) { dx *= STICK_R / L; dy *= STICK_R / L; }
    (k === 'move' ? stL : stR).firstChild.style.transform = `translate(${dx}px,${dy}px)`;
  }
});
function endTouch(e) {
  for (const k of ['move', 'aim']) {
    const s = stick[k]; if (!s || s.id !== e.pointerId) continue;
    if (k === 'aim' && s.moved < 10 && performance.now() - s.t0 < 220) toggleLight();
    stick[k] = null; (k === 'move' ? stL : stR).hidden = true;
  }
}
touchEl.addEventListener('pointerup', endTouch); touchEl.addEventListener('pointercancel', endTouch);
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (mode !== 'play') { if (e.code === 'Escape' && mode === 'pause') resume(); return; }
  initAudio(); wakeAudio();
  if (e.code === 'Space' || e.code === 'KeyL') { toggleLight(); e.preventDefault(); }
  if (e.code === 'KeyF') toggleFocus();
  if (e.code === 'Escape' || e.code === 'KeyP') pause();
});
addEventListener('keyup', e => { keys[e.code] = false; });
const lightBtn = $('lightBtn'), focusBtn = $('focusBtn');
lightBtn.addEventListener('pointerdown', e => { e.stopPropagation(); initAudio(); toggleLight(); });
focusBtn.addEventListener('pointerdown', e => { e.stopPropagation(); initAudio(); toggleFocus(); });
lightBtn.addEventListener('click', e => { if (e.detail === 0) toggleLight(); });
focusBtn.addEventListener('click', e => { if (e.detail === 0) toggleFocus(); });
$('pauseBtn').addEventListener('click', () => pause());
function toggleLight() { lightOn = !lightOn; snd.click(lightOn); syncBtns(); }
function toggleFocus() { narrow = !narrow; snd.click(true); syncBtns(); }
function syncBtns() {
  lightBtn.classList.toggle('on', lightOn && !bat.dead); lightBtn.classList.toggle('dead', lightOn && bat.dead);
  lightBtn.textContent = lightOn ? (bat.dead ? '...' : 'LIGHT') : 'OFF';
  focusBtn.classList.toggle('narrow', narrow); focusBtn.textContent = narrow ? 'FAR' : 'WIDE';
}

// ---------------- simulation ----------------
function collide(e, er) {
  near(solidG, e.x, e.y, er + 1.5, o => {
    if (o.t === 'log') {
      const dx = o.x2 - o.x1, dy = o.y2 - o.y1, L2 = dx * dx + dy * dy;
      const t = clamp(((e.x - o.x1) * dx + (e.y - o.y1) * dy) / L2, 0, 1), cx = o.x1 + dx * t, cy = o.y1 + dy * t;
      const qx = e.x - cx, qy = e.y - cy, d = Math.hypot(qx, qy), md = o.r + er;
      if (d < md && d > 1e-5) { e.x = cx + qx / d * md; e.y = cy + qy / d * md; }
    } else {
      const qx = e.x - o.x, qy = e.y - o.y, d = Math.hypot(qx, qy), md = o.r * 0.95 + er;
      if (d < md && d > 1e-5) { e.x = o.x + qx / d * md; e.y = o.y + qy / d * md; }
    }
  });
  e.x = clamp(e.x, WX0 + 3, WX1 - 3); e.y = clamp(e.y, WY0 + 3, WY1 - 3);
}
function inBush(x, y) { let b = false; near(decorG, x, y, 2, o => { if (o.bush && Math.hypot(x - o.x, y - o.y) < o.r * 0.85) b = true; }); return b; }
function safeFire(x, y, pad = 0) { for (const f of fires) if (Math.hypot(x - f.x, y - f.y) < f.safe + pad) return f; if (Math.hypot(x - LAMP.x, y - LAMP.y) < 9 + pad) return { x: LAMP.x, y: LAMP.y, safe: 9 }; return null; }
function surfaceAt(x, y) { return distPath(x, y) < 0.8 ? 'dirt' : 'litter'; }

function updatePlayer(dt) {
  let mx = 0, my = 0, m = 0;
  if (stick.move) {
    let dx = stick.move.x - stick.move.ox, dy = stick.move.y - stick.move.oy; const L = Math.hypot(dx, dy);
    m = clamp(L / STICK_R, 0, 1); if (L > 0) { mx = dx / L; my = dy / L; }
  }
  const kx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0), ky = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
  if (kx || ky) { const L = Math.hypot(kx, ky); mx = kx / L; my = ky / L; m = keys.ShiftLeft || keys.ShiftRight ? 1 : keys.KeyC || keys.ControlLeft || keys.AltLeft ? 0.4 : 0.75; }
  let sp = 0, md = 'still';
  if (m > 0.1) { if (m < 0.55) { sp = 0.95; md = 'sneak'; } else if (m < 0.93 || P.stam <= 0.02) { sp = 1.85; md = 'walk'; } else { sp = 4.0; md = 'run'; } }
  P.inBush = inBush(P.x, P.y);
  if (P.inBush) sp *= 0.55;
  if (md === 'run') P.stam = Math.max(0, P.stam - dt / 7); else P.stam = Math.min(1, P.stam + dt / (md === 'still' ? 8 : 12));
  const k = 1 - Math.exp(-dt * 10);
  P.vx += (mx * sp - P.vx) * k; P.vy += (my * sp - P.vy) * k;
  P.x += P.vx * dt; P.y += P.vy * dt; collide(P, 0.26);
  const spd = Math.hypot(P.vx, P.vy);
  P.moving = spd > 0.3; P.mode = P.moving ? md : 'still';
  if (spd > 0.3) P.face = Math.atan2(P.vy, P.vx);
  P.noise = { still: 0, sneak: 0.25, walk: 0.6, run: 1 }[P.mode] + (P.inBush && P.moving ? 0.35 : 0);
  if (P.moving) {
    P.stepT -= dt * spd / 0.75;
    if (P.stepT <= 0) { P.stepT = 1; snd.step(surfaceAt(P.x, P.y), P.mode); if (P.inBush) snd.rustle(P.x + 0.3, P.y, 0.25); }
  }
  // aim: right stick, mouse, or drift toward walking direction
  let aimInput = false;
  if (stick.aim) { const dx = stick.aim.x - stick.aim.ox, dy = stick.aim.y - stick.aim.oy; if (Math.hypot(dx, dy) > 12) { P.aimT = Math.atan2(dy, dx); aimInput = true; } }
  else if (mouseAim) { const s = worldToCss(P.x, P.y); P.aimT = Math.atan2(mouseAim.y - s.y, mouseAim.x - s.x); aimInput = true; }
  const diff = wrapA(P.aimT - P.aim);
  P.aim = wrapA(P.aim + clamp(diff, -7 * dt, 7 * dt) * (aimInput ? 1 : 1));
}
function worldToCss(x, y) { const s = VW() / W; return { x: ((x - cam.x) * PPM + W / 2) * s, y: ((y - cam.y) * PPM + H / 2) * s }; }

function updateBattery(dt) {
  const on = lightOn && !bat.dead;
  if (on) { bat.c -= dt * (narrow ? 1 / 20 : 1 / 52); bat.r = Math.max(0.45, bat.r - dt * (narrow ? 0.0008 : 0.0004)); }
  else bat.c += (bat.r - bat.c) * dt * 0.24;
  if (bat.c <= 0) { bat.c = 0; if (!bat.dead) { bat.dead = true; snd.fizzle(); syncBtns(); } }
  if (bat.dead && bat.c > 0.3 * bat.r) { bat.dead = false; if (lightOn) snd.sputter(); syncBtns(); }
  const base = sstep(0, 0.5, bat.c);
  let fl = 1;
  if (bat.c < 0.3) { const th = lerp(0.97, 0.45, (0.3 - bat.c) / 0.3); fl = vnoise(tNow * 16, 7.3) > th ? 0.12 : 1; if (fl < 1 && R() < 0.02) snd.click(false); }
  if (bat.force > 0) { bat.force -= dt; fl = R() < 0.18 ? 0.5 : 0; }
  const shakeR = P.mode === 'run' ? 1 : 0;
  beam.out = on ? base * fl : 0;
  const warm = 1 - base;
  beam.tr = 1; beam.tg = 0.93 - 0.2 * warm; beam.tb = 0.76 - 0.45 * warm;
  beam.hw = narrow ? 0.24 : 0.52;
  beam.R = (narrow ? 22 : 13) * (0.6 + 0.4 * base);
  beam.cosO = Math.cos(Math.min(Math.PI, beam.hw * 1.4));
  beam.aim = P.aim + (shakeR ? Math.sin(tNow * 13) * 0.05 + (vnoise(tNow * 9, 2) - 0.5) * 0.12 : (vnoise(tNow * 0.6, 5) - 0.5) * 0.012);
  adapt = beam.out > 0.05 ? Math.max(0, adapt - dt * 2) : Math.min(1, adapt + dt / 7);
}
function beamAt(x, y, ext = 1) {
  if (beam.out <= 0.001) return 0;
  const dx = x - P.x, dy = y - P.y, d = Math.hypot(dx, dy);
  if (d < 0.4) return beam.out * 0.5;
  const ax = Math.cos(beam.aim), ay = Math.sin(beam.aim);
  if ((dx * ax + dy * ay) / d < beam.cosO) return 0;
  const a = Math.atan2(dy, dx), rel = Math.abs(wrapA(a - beam.aim));
  let I = sstep(beam.hw * 1.35, beam.hw * 0.55, rel);
  const Rr = beam.R * ext;
  I *= sstep(Rr * 1.25, Rr * 0.55, d);
  const bin = (((a + Math.PI) * NB / TAU) | 0) & (NB - 1);
  if (d > sd[bin] + sr[bin] + 0.15) return 0;
  return I * beam.out;
}
function buildShadows() {
  sd.fill(1e9); sr.fill(0);
  const Rm = beam.R * 3.2 + 2;
  near(solidG, P.x, P.y, Rm, o => {
    if (o.t === 'log' || o.low) return;
    if (o.t === 'rock' && o.r < 0.55) return;
    const dx = o.x - P.x, dy = o.y - P.y, d = Math.hypot(dx, dy);
    if (d > Rm + o.r || d < o.r + 0.05) return;
    const a = Math.atan2(dy, dx), half = Math.asin(Math.min(1, o.r / d)), dn = d - o.r;
    const b0 = Math.floor((a - half + Math.PI) * NB / TAU), b1 = Math.ceil((a + half + Math.PI) * NB / TAU);
    for (let b = b0; b <= b1; b++) { const bi = ((b % NB) + NB) % NB; if (dn < sd[bi]) { sd[bi] = dn; sr[bi] = o.r * 1.7; } }
  });
}

// ---------------- the creature ----------------
const ACTIVE = { stalk: 1, glimpse: 1, behind: 1, posing: 1, search: 1, stand: 1 };
function crDist() { return Math.hypot(CR.x - P.x, CR.y - P.y); }
function placeFree(x, y, r = 0.4) { for (let i = 0; i < 16; i++) { if (!blocked(x, y, r)) return [x, y]; x += (R() - 0.5) * 2.5; y += (R() - 0.5) * 2.5; } return null; }
function setCr(st) { if (st !== 'posing' && st !== 'frozen') CR.harmless = false; CR.st = st; CR.t = 0; }
function moveTo(e, tx, ty, sp, dt) {
  const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
  if (d < 0.05) return d;
  const s = Math.min(d, sp * dt); e.x += dx / d * s; e.y += dy / d * s; e.a = e.a + clamp(wrapA(Math.atan2(dy, dx) - e.a), -8 * dt, 8 * dt);
  collide(e, 0.3);
  for (const f of fires) { const qx = e.x - f.x, qy = e.y - f.y, q = Math.hypot(qx, qy), md = f.safe + 0.6; if (q < md && q > 1e-4) { e.x = f.x + qx / q * md; e.y = f.y + qy / q * md; } }
  const ql = Math.hypot(e.x - LAMP.x, e.y - LAMP.y); if (ql < 9.6 && ql > 1e-4) { e.x = LAMP.x + (e.x - LAMP.x) / ql * 9.6; e.y = LAMP.y + (e.y - LAMP.y) / ql * 9.6; }
  return d;
}
function faceP(dt) { CR.a += clamp(wrapA(Math.atan2(P.y - CR.y, P.x - CR.x) - CR.a), -6 * dt, 6 * dt); }
function goAway() {
  CR.st = 'away'; CR.x = 1e6; CR.y = 1e6; CR.hunting = false;
  const prog = progress();
  D.next = lerp(21, 10, prog) * (0.7 + R() * 0.6);
}
function startFreeze(d) {
  CR.prev = CR.st; setCr('frozen'); CR.prov = 0; CR.unlit = 0; D.sightings++;
  let th = lerp(2.6, 0.9, D.bold); if (D.sightings === 1) th = 3.6; if (CR.prev === 'behind') th += 0.9;
  CR.th = th; D.bold = Math.min(1, D.bold + 0.1);
  const big = d < 7;
  snd.stinger(big); fear = Math.max(fear, big ? 0.95 : 0.6); shake = big ? 1 : 0.25;
  if (CR.prev !== 'posing') CR.eyes = true;
}
function startHunt(scream = true) {
  setCr('hunt'); CR.hunting = true; CR.v = 0; CR.eyes = true; CR.lx = P.x; CR.ly = P.y; CR.lost = 0;
  if (scream) { snd.shriek(CR.x, CR.y); D.hunts++; shake = 0.6; }
  fear = 1;
}
function retreat() { setCr('retreat'); CR.eyes = false; snd.rustle(CR.x, CR.y, 0.5); }

function updateCreature(dt) {
  if (CR.st === 'away') return;
  CR.t += dt;
  const d = crDist();
  const lit = beamAt(CR.x, CR.y); CR.lit = lit;
  const isLit = lit > 0.09;
  if (isLit && ACTIVE[CR.st]) { startFreeze(d); }
  switch (CR.st) {
    case 'stalk': {
      const ang = Math.atan2(CR.y - P.y, CR.x - P.x), rel = wrapA(ang - beam.aim);
      let na = ang;
      if (beam.out > 0.05 && Math.abs(rel) < beam.hw + 0.6) na += Math.sign(rel || 1) * 1.1 * dt * 3;
      else na += CR.dir * 0.1 * dt * 3;
      moveTo(CR, P.x + Math.cos(na) * CR.rad, P.y + Math.sin(na) * CR.rad, 2.4, dt);
      if (CR.t > CR.nextSnd) { if (R() < 0.6) snd.twig(CR.x, CR.y, 0.8); else snd.rustle(CR.x, CR.y, 0.45); CR.nextSnd = CR.t + 2.5 + R() * 3; }
      if (CR.t > CR.dur) {
        if (beam.out > 0.3 && R() < 0.5) {
          // the light stutters, and when it comes back it is closer, right in the beam
          bat.force = 0.85;
          const dd = 6 + R() * 2.5, a = beam.aim + (R() - 0.5) * beam.hw;
          const p = placeFree(P.x + Math.cos(a) * dd, P.y + Math.sin(a) * dd);
          if (p) { CR.x = p[0]; CR.y = p[1]; CR.a = Math.atan2(P.y - CR.y, P.x - CR.x); CR.eyes = true; CR.wait = 0.9; setCr('stand'); }
          else goAway();
        } else goAway();
      }
      break;
    }
    case 'stand': // waits out the flicker, then is simply there
      faceP(dt);
      if (CR.t > 4) goAway();
      break;
    case 'glimpse':
      if (moveTo(CR, CR.tx, CR.ty, 3.6, dt) < 0.4 || CR.t > 7) goAway();
      break;
    case 'posing': {
      if (CR.harmless && d < 6) { retreat(); break; } // the first time, it just slips away
      if (!isLit && ((d < 2.6 && P.noise >= 0.55) || (d < 5 && P.mode === 'run'))) { startHunt(); break; }
      if (d < 5 && !isLit) { CR.eyes = true; if (CR.t > CR.nextSnd) { snd.breath(CR.x, CR.y, 0.3); CR.nextSnd = CR.t + 2.2; fear = Math.max(fear, 0.6); } }
      if (P.y < CR.y - 8 || CR.t > 50 || d > 34) goAway();
      break;
    }
    case 'behind': {
      const ax = Math.cos(P.aim), ay = Math.sin(P.aim);
      moveTo(CR, P.x - ax * 3.2, P.y - ay * 3.2, 2.2, dt); faceP(dt);
      if (CR.t > CR.nextSnd) { snd.breath(CR.x, CR.y, 0.4); CR.nextSnd = CR.t + 1.7; }
      if (CR.t > 4.2) goAway();
      break;
    }
    case 'frozen':
      faceP(dt);
      if (CR.prev === 'posing' && CR.t > 0.5 && !CR.eyes) CR.eyes = true; // it opens its eyes
      if (isLit) { CR.prov += dt * (narrow ? 1.6 : 1); CR.unlit = 0; } else CR.unlit += dt;
      if (CR.prov > CR.th && D.t > 25) startHunt();
      else if (CR.unlit > 0.3) retreat();
      break;
    case 'retreat': {
      const dx = CR.x - P.x, dy = CR.y - P.y, L = Math.hypot(dx, dy) || 1;
      const rel = wrapA(Math.atan2(dy, dx) - beam.aim), side = Math.sign(rel || 1);
      const ox = -dy / L * side, oy = dx / L * side;
      moveTo(CR, CR.x + (dx / L + ox * 0.8) * 4, CR.y + (dy / L + oy * 0.8) * 4, 5.5, dt);
      if (CR.t > CR.nextSnd) { snd.rustle(CR.x, CR.y, 0.4); CR.nextSnd = CR.t + 0.5; }
      if (d > 30 || CR.t > 5) goAway();
      break;
    }
    case 'hunt': {
      CR.v = Math.min(4.3, CR.v + dt * 6);
      const knows = beam.out > 0.05 || P.mode === 'run' || d < 4 || (P.moving && P.mode !== 'sneak' && d < 8);
      if (knows) { CR.lx = P.x; CR.ly = P.y; CR.lost = 0; } else CR.lost += dt;
      const sf = safeFire(P.x, P.y);
      if (sf) { CR.fire = sf; setCr('blocked'); break; }
      const dl = moveTo(CR, CR.lx, CR.ly, CR.v, dt);
      if (CR.t > CR.nextSnd) { snd.thud(CR.x, CR.y); CR.nextSnd = CR.t + 0.26; }
      if (crDist() < 0.75) { caught(); break; }
      if (!knows && dl < 1.0) { setCr('search'); CR.tx = CR.x; CR.ty = CR.y; }
      if (CR.t > 24) retreat();
      break;
    }
    case 'search': {
      if (CR.t > CR.nextSnd || Math.hypot(CR.tx - CR.x, CR.ty - CR.y) < 0.4) { CR.tx = CR.lx + (R() - 0.5) * 9; CR.ty = CR.ly + (R() - 0.5) * 9; CR.nextSnd = CR.t + 2 + R(); if (R() < 0.5) snd.breath(CR.x, CR.y, 0.3); }
      moveTo(CR, CR.tx, CR.ty, 1.3, dt);
      const hear = P.mode === 'still' ? 1.2 : P.mode === 'sneak' ? 2.0 : 4.5;
      const sees = (beam.out > 0.05 && d < 22) || P.mode === 'run' || d < hear;
      if (sees) { setCr('hunt'); CR.v = 2; CR.lx = P.x; CR.ly = P.y; snd.thud(CR.x, CR.y); fear = 1; }
      if (crDist() < 0.75) caught();
      else if (CR.t > 11) retreat();
      break;
    }
    case 'blocked': {
      const f = CR.fire, qa = Math.atan2(CR.y - f.y, CR.x - f.x) + dt * 0.25;
      moveTo(CR, f.x + Math.cos(qa) * (f.safe + 1.4), f.y + Math.sin(qa) * (f.safe + 1.4), 1.4, dt); faceP(dt);
      if (!safeFire(P.x, P.y, 0.5)) { setCr('hunt'); CR.v = 3; }
      else if (CR.t > 7) retreat();
      break;
    }
  }
}
function caught() {
  mode = 'dying'; deathT = 0; snd.caught(); fear = 1; shake = 1.5;
  const a = Math.atan2(CR.y - P.y, CR.x - P.x); P.aim = a; beam.aim = a; CR.x = P.x + Math.cos(a) * 0.95; CR.y = P.y + Math.sin(a) * 0.95; CR.a = a + Math.PI;
}

function spawnDeer() {
  const dd = 18 + R() * 7, a = (beam.out > 0.2 ? beam.aim : P.face) + (R() - 0.5) * 0.4;
  const p = placeFree(P.x + Math.cos(a) * dd, P.y + Math.sin(a) * dd, 0.6); if (!p) return;
  Object.assign(DEER, { on: true, x: p[0], y: p[1], a: a + Math.PI + (R() - 0.5) * 0.6, st: 'watch', t: 0, litT: 0, stepT: 0 });
}
function updateDeer(dt) {
  if (!DEER.on) return;
  DEER.t += dt;
  const d = Math.hypot(DEER.x - P.x, DEER.y - P.y);
  if (DEER.st === 'watch') {
    DEER.a += clamp(wrapA(Math.atan2(P.y - DEER.y, P.x - DEER.x) - DEER.a), -1.5 * dt, 1.5 * dt);
    if (beamAt(DEER.x, DEER.y, 1.6) > 0.05) DEER.litT += dt;
    if (d < 9 || DEER.litT > 3 || DEER.t > 30 || (P.mode === 'run' && d < 16)) { DEER.st = 'flee'; DEER.t = 0; snd.deer(DEER.x, DEER.y); fear = Math.max(fear, 0.45); }
  } else {
    const ax = DEER.x - P.x, ay = DEER.y - P.y, L = Math.hypot(ax, ay) || 1;
    moveTo(DEER, DEER.x + ax / L * 3, DEER.y + ay / L * 3, 7, dt);
    if (d > 45 || DEER.t > 7) DEER.on = false;
  }
}

function progress() { return clamp((PY0 - P.y) / (PY0 - ROADY), 0, 1); }
function director(dt) {
  D.t += dt;
  D.heat = beam.out > 0.05 ? Math.min(1, D.heat + dt / 25) : Math.max(0, D.heat - dt / 12);
  D.bold = Math.min(1, D.bold + dt / 900);
  // crickets fall silent while it is close
  const mt = (CR.st !== 'away' && CR.st !== 'retreat') ? 1 : 0;
  D.mute += (mt - D.mute) * Math.min(1, dt * (mt ? 0.8 : 0.3));
  // harmless sounds that keep you guessing
  D.amb -= dt;
  if (D.amb <= 0) {
    D.amb = 14 + R() * 22;
    const a = R() * TAU, r = 18 + R() * 14;
    if (R() < 0.4) snd.owl(P.x + Math.cos(a) * r, P.y + Math.sin(a) * r); else snd.rustle(P.x + Math.cos(a) * r, P.y + Math.sin(a) * r, 0.3);
  }
  if (CR.st !== 'away') return;
  D.next -= dt;
  if (D.next > 0) return;
  const prog = progress();
  if (D.first) { D.first = false; if (evPosing()) return; }
  const on = beam.out > 0.3;
  const opts = [
    ['stalk', 3], ['twig', 2], ['deer', DEER.on ? 0 : 1.4], ['glimpse', on ? 2.5 : 0],
    ['posing', prog > 0.12 ? 2 : 0], ['behind', on && prog > 0.22 ? 1.4 + D.heat * 2 : 0],
  ];
  let sum = 0; for (const o of opts) sum += o[1];
  let r = R() * sum, pick = 'stalk';
  for (const o of opts) { r -= o[1]; if (r <= 0) { pick = o[0]; break; } }
  const ok = { stalk: evStalk, twig: evTwig, deer: evDeer, glimpse: evGlimpse, posing: evPosing, behind: evBehind }[pick]();
  if (!ok) evStalk();
  if (CR.st === 'away') D.next = lerp(16, 8, prog) * (0.7 + R() * 0.6);
}
function evStalk() {
  const side = R() < 0.5 ? -1 : 1, a = beam.aim + Math.PI + side * (0.5 + R() * 0.9), r = 12.5 + R() * 4;
  const p = placeFree(P.x + Math.cos(a) * r, P.y + Math.sin(a) * r); if (!p) return false;
  CR.x = p[0]; CR.y = p[1]; CR.rad = r; CR.dir = side; CR.dur = 9 + R() * 7; CR.nextSnd = 1.5 + R() * 2; CR.eyes = true; CR.a = a + Math.PI;
  setCr('stalk'); return true;
}
function evGlimpse() {
  const dd = 11 + R() * 5, ax = Math.cos(beam.aim), ay = Math.sin(beam.aim), side = R() < 0.5 ? -1 : 1;
  const cx = P.x + ax * dd, cy = P.y + ay * dd, px = -ay * side, py = ax * side;
  const p = placeFree(cx - px * 8, cy - py * 8); if (!p) return false;
  CR.x = p[0]; CR.y = p[1]; CR.tx = cx + px * 9; CR.ty = cy + py * 9; CR.a = Math.atan2(py, px); CR.eyes = false;
  setCr('glimpse'); snd.rustle(CR.x, CR.y, 0.35); return true;
}
function evPosing() {
  const y = P.y - (16 + R() * 6); if (y < ROADY + 14) return false;
  const side = R() < 0.5 ? -1 : 1, x = pathX(y) + side * (3 + R() * 2);
  const p = placeFree(x, y); if (!p) return false;
  CR.x = p[0]; CR.y = p[1]; CR.a = Math.atan2(P.y - CR.y, P.x - CR.x); CR.eyes = false; CR.nextSnd = 0; CR.harmless = D.sightings === 0 && D.first === false && D.t < 60;
  setCr('posing'); return true;
}
function evBehind() {
  const ax = Math.cos(P.aim), ay = Math.sin(P.aim);
  const p = placeFree(P.x - ax * 3.3 + (R() - 0.5), P.y - ay * 3.3 + (R() - 0.5)); if (!p) return false;
  CR.x = p[0]; CR.y = p[1]; CR.a = Math.atan2(P.y - CR.y, P.x - CR.x); CR.eyes = true; CR.nextSnd = 0.4;
  setCr('behind'); return true;
}
function evTwig() { const a = beam.aim + Math.PI + (R() - 0.5) * 2.4, r = 8 + R() * 7; snd.twig(P.x + Math.cos(a) * r, P.y + Math.sin(a) * r, 0.9); fear = Math.max(fear, 0.3); return true; }
function evDeer() { spawnDeer(); return DEER.on; }

function updateFear(dt) {
  let target = 0.06 + D.mute * 0.12;
  if (CR.st !== 'away') { const d = crDist(); target = Math.max(target, sstep(18, 3, d) * 0.75); }
  if (CR.st === 'hunt' || CR.st === 'blocked') target = 1; else if (CR.st === 'search') target = 0.85;
  fear += (target - fear) * Math.min(1, dt * (target > fear ? 2 : 0.12));
}

function update(dt) {
  runTime += dt;
  updatePlayer(dt);
  updateBattery(dt);
  buildShadows();
  director(dt);
  updateCreature(dt);
  updateDeer(dt);
  updateFear(dt);
  if (mode !== 'play') return;
  if (P.y < ROADY + 1.5 && Math.abs(P.x - CAR.x) < 9) win();
}

// ---------------- drawing ----------------
let camX = 0, camY = 0;
function s2(x, y) { return [(x - camX) * PPM + W / 2, (y - camY) * PPM + H / 2]; }
let OV = null; // when set, pixels drawn are lit as if they stood at this world point
function put(i, col) { ob[i] = col; if (OV) { LF[i] = 1; LX[i] = OV[0]; LY[i] = OV[1]; } else LF[i] = 0; }
function disc(cx, cy, r, col) {
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r)), y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r)), r2 = r * r;
  for (let y = y0; y <= y1; y++) { const dy = y + 0.5 - cy; for (let x = x0; x <= x1; x++) { const dx = x + 0.5 - cx; if (dx * dx + dy * dy <= r2) put(y * W + x, col); } }
}
function discFn(cx, cy, r, fn) {
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r)), y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r)), r2 = r * r;
  for (let y = y0; y <= y1; y++) { const dy = y + 0.5 - cy; for (let x = x0; x <= x1; x++) { const dx = x + 0.5 - cx, q = dx * dx + dy * dy; if (q <= r2) { const c = fn(dx, dy, Math.sqrt(q) / r, x, y); if (c) ob[y * W + x] = c; } } }
}
function ell(cx, cy, a, ra, rb, fn) {
  const rr = Math.max(ra, rb) + 1, ca = Math.cos(a), sa = Math.sin(a);
  const x0 = Math.max(0, Math.floor(cx - rr)), x1 = Math.min(W - 1, Math.ceil(cx + rr)), y0 = Math.max(0, Math.floor(cy - rr)), y1 = Math.min(H - 1, Math.ceil(cy + rr));
  for (let y = y0; y <= y1; y++) { const dy = y + 0.5 - cy; for (let x = x0; x <= x1; x++) { const dx = x + 0.5 - cx, u = dx * ca + dy * sa, v = -dx * sa + dy * ca, q = (u * u) / (ra * ra) + (v * v) / (rb * rb); if (q <= 1) { const c = fn(u / ra, v / rb, q, x, y); if (c) ob[y * W + x] = c; } } }
}
function line(x0, y0, x1, y1, col, w = 0) {
  const L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(L * 1.5));
  for (let i = 0; i <= n; i++) { const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t; if (w > 0.6) disc(x, y, w, col); else { const xi = x | 0, yi = y | 0; if (xi >= 0 && yi >= 0 && xi < W && yi < H) put(yi * W + xi, col); } }
}
function rect(cx, cy, a, hw, hh, fn) {
  const rr = Math.hypot(hw, hh) + 1, ca = Math.cos(a), sa = Math.sin(a);
  const x0 = Math.max(0, Math.floor(cx - rr)), x1 = Math.min(W - 1, Math.ceil(cx + rr)), y0 = Math.max(0, Math.floor(cy - rr)), y1 = Math.min(H - 1, Math.ceil(cy + rr));
  for (let y = y0; y <= y1; y++) { const dy = y + 0.5 - cy; for (let x = x0; x <= x1; x++) { const dx = x + 0.5 - cx, u = dx * ca + dy * sa, v = -dx * sa + dy * ca; if (Math.abs(u) <= hw && Math.abs(v) <= hh) { const c = fn(u / hw, v / hh, x, y); if (c) ob[y * W + x] = c; } } }
}
const LEAN = 0.32;
function leanV(sx, sy, f) { return [(sx - W / 2) * LEAN * f, ((sy - H / 2) * LEAN - 9) * f]; }
const onScr = (sx, sy, r) => sx > -r - 2 && sy > -r - 2 && sx < W + r + 2 && sy < H + r + 2;

function drawTree(t) {
  const [sx, sy] = s2(t.x, t.y), r = t.r * PPM + 0.5;
  // looking down from above: trunks lean away from the middle of the view, so the woods have height
  const [lx, ly] = leanV(sx, sy, 1);
  if (!onScr(sx, sy, r * 1.6) && !onScr(sx + lx, sy + ly, r)) return;
  const b = t.k === 0 ? PAL.pine : t.k === 1 ? PAL.oak : PAL.birch, birch = t.k === 2;
  for (let i = 0; i < 3; i++) { const a = t.s * TAU + i * 2.1; disc(sx + Math.cos(a) * r * 1.0, sy + Math.sin(a) * r * 1.0, r * 0.42 + 0.5, b[birch ? 2 : 1]); }
  const L = Math.hypot(lx, ly), n = Math.max(1, Math.ceil(L * 1.2)), seed = (t.s * 997) | 0;
  for (let pass = 0; pass < 2; pass++) for (let k = 0; k <= n; k++) {
    const f = k / n, cx = sx + lx * f, cy = sy + ly * f, rr = r * (1 - 0.3 * f);
    if (pass === 0) { trunkDisc(cx, cy, rr, b[2], t.x, t.y); continue; }
    const mark = birch && hash2(k + seed, 3) > 0.7;
    trunkDisc(cx - lx / (L || 1) * 0, cy, Math.max(0.6, rr - 0.9), mark ? PAL.birchMark : (hash2(k + seed, 9) > 0.75 ? b[1] : b[0]), t.x, t.y);
  }
}
function trunkDisc(cx, cy, r, col, wx, wy) {
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r)), y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r)), r2 = r * r;
  for (let y = y0; y <= y1; y++) { const dy = y + 0.5 - cy; for (let x = x0; x <= x1; x++) { const dx = x + 0.5 - cx; if (dx * dx + dy * dy <= r2) { const i = y * W + x; ob[i] = col; LF[i] = 1; LX[i] = wx; LY[i] = wy; } } }
}
function drawFern(f) {
  const [sx, sy] = s2(f.x, f.y), r = f.r * PPM; if (!onScr(sx, sy, r)) return;
  for (let i = 0; i < 6; i++) { const a = f.s + i * TAU / 6 + Math.sin(f.s * 5 + i) * 0.3, L = r * (0.65 + 0.35 * hash2(i, f.s * 1000 | 0)); line(sx, sy, sx + Math.cos(a) * L, sy + Math.sin(a) * L, PAL.fern[i % 3]); }
}
function drawBush(b) {
  const [sx, sy] = s2(b.x, b.y), r = b.r * PPM; if (!onScr(sx, sy, r)) return;
  const sd0 = (b.s * 1e4) | 0;
  discFn(sx, sy, r, (dx, dy, q, x, y) => { const h = hash2(x + sd0, y * 7); if (q > 0.75 && h < 0.45) return 0; return PAL.bush[(h * 4) | 0]; });
}
function drawRock(o) {
  const [sx, sy] = s2(o.x, o.y), r = o.r * PPM; if (!onScr(sx, sy, r)) return;
  discFn(sx, sy, r, (dx, dy, q) => q > 0.82 ? PAL.rock[2] : (dx + dy < -r * 0.3 ? PAL.rock[0] : PAL.rock[1]));
}
function drawLog(o) {
  const [ax, ay] = s2(o.x1, o.y1), [bx, by] = s2(o.x2, o.y2), r = o.r * PPM;
  if (!onScr((ax + bx) / 2, (ay + by) / 2, Math.hypot(bx - ax, by - ay) / 2 + r)) return;
  line(ax, ay, bx, by, PAL.log[2], r);
  line(ax, ay, bx, by, PAL.log[0], Math.max(0.6, r - 1));
  disc(ax, ay, r, PAL.log[1]); disc(bx, by, r, PAL.log[1]);
}
function drawDecoy(o) {
  // a pale dead snag, about as tall as it is, with two branch arms
  const [sx, sy] = s2(o.x, o.y); if (!onScr(sx, sy, 14)) return;
  const [lx, ly] = leanV(sx, sy, 0.55), L = Math.hypot(lx, ly) || 1, px = -ly / L, py = lx / L;
  OV = [o.x, o.y];
  disc(sx, sy, 1.8, PAL.stump[2]);
  const n = Math.ceil(L * 1.3);
  for (let k = 0; k <= n; k++) { const f = k / n; disc(sx + lx * f + Math.sin(f * 5 + o.s * 9) * 0.6 * px, sy + ly * f + Math.sin(f * 5 + o.s * 9) * 0.6 * py, 1.5 - f * 0.6, f > 0.5 ? PAL.stump[0] : PAL.stump[1]); }
  for (const sg of [-1, 1]) {
    const bx = sx + lx * (0.68 + o.s * 0.1), by = sy + ly * (0.68 + o.s * 0.1);
    const ex = bx + px * sg * (3 + o.s * 2) + lx * 0.25, ey = by + py * sg * (3 + o.s * 2) + ly * 0.25;
    line(bx, by, ex, ey, PAL.stump[1]);
  }
  OV = null;
}
function drawCreature() {
  if (CR.st === 'away') return;
  const [sx, sy] = s2(CR.x, CR.y); if (!onScr(sx, sy, 22)) return;
  const dying = mode === 'dying';
  const f = dying ? 1.6 : 0.68;
  let [lx, ly] = leanV(sx, sy, f); if (dying) { lx = 0; ly = -30; }
  const L = Math.hypot(lx, ly) || 1, px = -ly / L, py = lx / L;
  const at = t => [sx + lx * t, sy + ly * t];
  const w = dying ? 3 : 1.25;
  OV = [CR.x, CR.y];
  // facing, in screen space, nudges the head and the reach of the arms
  const fx = Math.cos(CR.a), fy = Math.sin(CR.a);
  const reach = CR.st === 'hunt' || dying ? 1 : 0;
  for (const sg of [-1, 1]) { const [hx, hy] = at(0.45); line(sx + px * sg * 0.8 * w, sy + py * sg * 0.8 * w, hx + px * sg * 0.6 * w, hy + py * sg * 0.6 * w, PAL.skin2, dying ? 1.2 : 0); }
  { const [ax, ay] = at(0.42), [bx, by] = at(0.8); line(ax, ay, bx, by, PAL.skin, 1.1 * w); line(ax + px * 0.4, ay + py * 0.4, bx + px * 0.4, by + py * 0.4, PAL.skin2, dying ? 1 : 0); }
  for (const sg of [-1, 1]) {
    const [shx0, shy0] = at(0.78), shx = shx0 + px * sg * 1.9 * w, shy = shy0 + py * sg * 1.9 * w;
    let [hx, hy] = at(reach ? 0.6 : 0.18);
    hx += px * sg * (reach ? 2.6 : 3.4) * w + fx * (reach ? 5 : 0.6) * w; hy += py * sg * (reach ? 2.6 : 3.4) * w + fy * (reach ? 5 : 0.6) * w;
    line(shx, shy, hx, hy, PAL.skin2, dying ? 1 : 0);
    for (let k = -1; k <= 1; k++) line(hx, hy, hx + (px * sg * 0.6 + k * 0.5 * fx) * 1.6 * w - ly / L * 0, hy + (py * sg * 0.6 + k * 0.5 * fy) * 1.6 * w, PAL.skin);
  }
  const [hx, hy] = at(0.93), hdx = hx + fx * 0.8 * w, hdy = hy + fy * 0.8 * w;
  disc(hdx, hdy, 1.5 * w, PAL.skin);
  CR.hs = [hdx + fx * 0.6 * w, hdy + fy * 0.6 * w, px * 0.9 * w, py * 0.9 * w];
  for (const sg of [-1, 1]) { const x = (CR.hs[0] + CR.hs[2] * sg) | 0, y = (CR.hs[1] + CR.hs[3] * sg) | 0; if (x >= 0 && y >= 0 && x < W && y < H) put(y * W + x, PAL.sock); }
  OV = null;
}
function drawDeer() {
  if (!DEER.on) return;
  const [sx, sy] = s2(DEER.x, DEER.y); if (!onScr(sx, sy, 14)) return;
  const k = PPM, a = DEER.a, ca = Math.cos(a), sa = Math.sin(a);
  ell(sx, sy, a, 0.68 * k, 0.24 * k, (u, v, q) => q > 0.75 ? PAL.deer[1] : PAL.deer[0]);
  const nx = sx + ca * 0.62 * k, ny = sy + sa * 0.62 * k, hx = sx + ca * 0.88 * k, hy = sy + sa * 0.88 * k;
  line(nx, ny, hx, hy, PAL.deer[0], 1);
  disc(hx, hy, 0.11 * k, PAL.deer[0]);
  for (const sg of [-1, 1]) line(hx, hy, hx - ca * 0.12 * k - sa * sg * 0.14 * k, hy - sa * 0.12 * k + ca * sg * 0.14 * k, PAL.deer[1]);
  disc(sx - ca * 0.68 * k, sy - sa * 0.68 * k, 0.07 * k, PAL.deer[2]);
}
function drawPlayer() {
  const [sx, sy] = s2(P.x, P.y), k = PPM, a = P.aim, ca = Math.cos(a), sa = Math.sin(a);
  line(sx + ca * 0.1 * k - sa * 0.14 * k, sy + sa * 0.1 * k + ca * 0.14 * k, sx + ca * 0.42 * k, sy + sa * 0.42 * k, PAL.hand);
  const tx = (sx + ca * 0.45 * k) | 0, ty = (sy + sa * 0.45 * k) | 0; if (tx >= 0 && ty >= 0 && tx < W && ty < H) ob[ty * W + tx] = PAL.torch;
  ell(sx, sy, P.face, 0.17 * k, 0.24 * k, (u, v, q) => q > 0.7 ? C('#2e3646') : PAL.jacket);
  disc(sx, sy, 0.12 * k, PAL.hair);
}
function drawProps() {
  { const [sx, sy] = s2(TENT.x, TENT.y); if (onScr(sx, sy, 20)) rect(sx, sy, TENT.a, TENT.w / 2 * PPM, TENT.h / 2 * PPM, (u, v) => Math.abs(v) < 0.08 ? PAL.tent[2] : (v < 0 ? PAL.tent[0] : PAL.tent[1])); }
  for (const f of [CAMP, ...fires]) { const [sx, sy] = s2(f.x, f.y); if (!onScr(sx, sy, 12)) continue; for (let i = 0; i < 9; i++) { const a = i * TAU / 9; disc(sx + Math.cos(a) * 0.62 * PPM, sy + Math.sin(a) * 0.62 * PPM, 0.17 * PPM, PAL.stone[i % 2]); } }
  { const [sx, sy] = s2(CAR.x, CAR.y); if (onScr(sx, sy, 30)) rect(sx, sy, CAR.a, CAR.w / 2 * PPM, CAR.h / 2 * PPM, (u, v) => (Math.abs(u) > 0.93 ? PAL.car[1] : (u > -0.35 && u < 0.45 ? (Math.abs(v) < 0.8 ? PAL.car[2] : PAL.car[0]) : (Math.abs(v) > 0.88 ? PAL.car[1] : PAL.car[0])))); }
  { const [sx, sy] = s2(LAMP.x, LAMP.y); if (onScr(sx, sy, 6)) disc(sx, sy, 1.6, PAL.post); }
  { const [sx, sy] = s2(FALLEN.x, FALLEN.y); if (onScr(sx, sy, 4)) { ob[(sy | 0) * W + (sx | 0)] = PAL.refl; } }
}

const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
const LEV = 6;
function render(dt) {
  // camera leans toward where the light points
  const lead = lightOn ? (narrow ? 7 : 5) : 1.2;
  const tx = P.x + Math.cos(P.aim) * lead, ty = P.y + Math.sin(P.aim) * lead;
  const kk = 1 - Math.exp(-dt * 1.8);
  cam.x += (tx - cam.x) * kk; cam.y += (ty - cam.y) * kk;
  shake = Math.max(0, shake - dt * 2);
  camX = Math.round((cam.x + (shake > 0 ? (R() - 0.5) * shake * 0.5 : 0)) * PPM) / PPM; camY = Math.round((cam.y + (shake > 0 ? (R() - 0.5) * shake * 0.5 : 0)) * PPM) / PPM;
  ob.fill(0); LF.fill(0);
  const hwM = W / 2 / PPM + 3, hhM = H / 2 / PPM + 3;
  const vis = [];
  near(decorG, camX, camY, Math.max(hwM, hhM), o => vis.push(o));
  for (const o of vis) if (!o.bush && !o.decoy) drawFern(o);
  near(solidG, camX, camY, Math.max(hwM, hhM), o => { if (o.t === 'log') drawLog(o); else if (o.t === 'rock') drawRock(o); });
  for (const o of vis) if (o.decoy) drawDecoy(o);
  drawProps();
  drawDeer();
  drawCreature();
  if (mode !== 'title') drawPlayer();
  const tv = []; near(solidG, camX, camY, Math.max(hwM, hhM) + 4, o => { if (o.t === 'tree') tv.push(o); });
  tv.sort((a, b) => ((a.x - camX) ** 2 + (a.y - camY) ** 2) - ((b.x - camX) ** 2 + (b.y - camY) ** 2));
  for (const o of tv) drawTree(o);
  for (const o of vis) if (o.bush) drawBush(o);
  for (const rf of reflectors) { const [sx, sy] = s2(rf.x, rf.y); if (sx >= 0 && sy >= 0 && sx < W && sy < H) ob[(sy | 0) * W + (sx | 0)] = PAL.refl; }
  shade();
  overlays();
  ctx.putImageData(img, 0, 0);
}

function shade() {
  const on = beam.out > 0.001, ax = Math.cos(beam.aim), ay = Math.sin(beam.aim), hw = beam.hw, hwO = hw * 1.35, hwI = hw * 0.55, cosO = beam.cosO, Rr = beam.R, RO = Rr * 1.25, RI = Rr * 0.55;
  const bo = beam.out, tr = beam.tr, tg = beam.tg, tb = beam.tb, px = P.x, py = P.y;
  const amb = adapt * 0.0075; const grainF = (tNow * 8 | 0) * 7919;
  const hwM = W / 2 / PPM + 1, hhM = H / 2 / PPM + 1;
  const Ls = [];
  for (const l of lights) {
    if (Math.abs(l.x - camX) > hwM + l.r || Math.abs(l.y - camY) > hhM + l.r) continue;
    let i = l.i;
    if (!l.lamp) i *= 0.92 + 0.08 * vnoise(tNow * 2.2 + l.ph, l.ph);
    Ls.push({ x: l.x, y: l.y, r: l.r, i, c: l.c });
  }
  for (const m of moons) if (Math.abs(m.x - camX) < hwM + m.r && Math.abs(m.y - camY) < hhM + m.r) Ls.push({ x: m.x, y: m.y, r: m.r, i: m.i, c: [0.55, 0.66, 0.95], moon: true });
  const nL = Ls.length;
  let i = 0;
  for (let y = 0; y < H; y++) {
    const wy = camY + (y + 0.5 - H / 2) / PPM, gy = ((wy - WY0) * TEX) | 0;
    const bayRow = (y & 3) << 2;
    for (let x = 0; x < W; x++, i++) {
      let wx = camX + (x + 0.5 - W / 2) / PPM, wyy = wy;
      let col = ob[i];
      if (LF[i]) { wx = LX[i]; wyy = LY[i]; }
      if (!col) { const gx = ((wx - WX0) * TEX) | 0; col = (gx >= 0 && gy >= 0 && gx < GW && gy < GH) ? ground[gy * GW + gx] : BLACK; }
      let lr = amb * 0.6, lg = amb * 0.75, lb = amb;
      const dy = wyy - py, dx = wx - px, d2 = dx * dx + dy * dy;
      if (on) {
        const d = Math.sqrt(d2) + 1e-6;
        if (d < 2.8) { const s = bo * 0.16 * sstep(2.8, 0.3, d); lr += s * tr; lg += s * tg; lb += s * tb; }
        if (d < RO && (dx * ax + dy * ay) / d > cosO) {
          const a = Math.atan2(dy, dx);
          let rel = a - beam.aim; rel = rel > Math.PI ? rel - TAU : rel < -Math.PI ? rel + TAU : rel; if (rel < 0) rel = -rel;
          if (rel < hwO) {
            const bin = (((a + Math.PI) * NB / TAU) | 0) & (NB - 1);
            if (d <= sd[bin] + sr[bin]) {
              let I = sstep(hwO, hwI, rel) * (0.72 + 0.28 * sstep(hwI, 0, rel));
              I *= sstep(RO, RI, d) * (1.25 / (1 + d * d / (Rr * Rr * 0.4))) * sstep(0.15, 1.1, d);
              I *= bo; lr += I * tr; lg += I * tg; lb += I * tb;
            }
          }
        }
      } else if (d2 < 1.2) { const s = 0.05 * (1 - d2 / 1.2); lr += s * 0.6; lg += s * 0.7; lb += s; }
      for (let k = 0; k < nL; k++) {
        const l = Ls[k], qx = wx - l.x, qy = wyy - l.y, q2 = qx * qx + qy * qy, r2 = l.r * l.r;
        if (q2 < r2) {
          let f = 1 - q2 / r2; f = f * f * l.i;
          if (l.moon) f *= 0.6 + 0.8 * hash2((wx * 2) | 0, (wyy * 2) | 0) * (hash2((wx * 0.7) | 0, (wyy * 0.7) | 0) > 0.3 ? 1 : 0.3);
          lr += f * l.c[0]; lg += f * l.c[1]; lb += f * l.c[2];
        }
      }
      let m = lr > lg ? lr : lg; if (lb > m) m = lb;
      if (m <= 0.0005) { out32[i] = BLACK; continue; }
      const dth = m < 0.014 ? hash2(x + grainF, y * 3 + grainF) : BAY[bayRow | (x & 3)];
      let q = Math.floor(Math.pow(m, 0.72) * LEV + dth) / LEV;
      if (q <= 0) { out32[i] = BLACK; continue; }
      if (q > 1.3) q = 1.3;
      const s = q / m;
      let r = (col & 255) * lr * s, g = ((col >> 8) & 255) * lg * s, b = ((col >> 16) & 255) * lb * s;
      out32[i] = (0xff000000 | ((b > 255 ? 255 : b) << 16) | ((g > 255 ? 255 : g) << 8) | (r > 255 ? 255 : r)) >>> 0;
    }
  }
}
function px1(x, y, r, g, b, a) {
  x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = y * W + x, c = out32[i], or = c & 255, og = (c >> 8) & 255, obb = (c >> 16) & 255;
  const nr = or + (r - or) * a, ng = og + (g - og) * a, nb = obb + (b - obb) * a;
  out32[i] = (0xff000000 | ((nb | 0) << 16) | ((ng | 0) << 8) | (nr | 0)) >>> 0;
}
function eyes(x, y, a, sep, col, I) {
  const [sx, sy] = s2(x, y), ca = Math.cos(a), sa = Math.sin(a);
  for (const sg of [-1, 1]) px1(sx - sa * sep * sg, sy + ca * sep * sg, col[0], col[1], col[2], clamp(I, 0, 1));
}
function overlays() {
  // eyeshine: eyes catch the beam from much farther than the beam lights the ground
  if (CR.st !== 'away' && CR.eyes) {
    const hx = CR.x, hy = CR.y;
    const face = Math.cos(wrapA(Math.atan2(P.y - CR.y, P.x - CR.x) - CR.a));
    const I = beamAt(hx, hy, 3.2) * 2.6 * sstep(0.35, 0.8, face);
    const hs = CR.hs;
    if (hs && I > 0.04) for (const sg of [-1, 1]) px1(hs[0] + hs[2] * sg, hs[1] + hs[3] * sg, 255, 244, 222, clamp(I, 0, 1));
    if (hs && mode === 'dying') for (const sg of [-1, 1]) px1(hs[0] + hs[2] * sg, hs[1] + hs[3] * sg, 255, 90, 70, 1);
  }
  if (DEER.on) {
    const hx = DEER.x + Math.cos(DEER.a) * 0.92, hy = DEER.y + Math.sin(DEER.a) * 0.92;
    const face = Math.cos(wrapA(Math.atan2(P.y - DEER.y, P.x - DEER.x) - DEER.a));
    const I = beamAt(hx, hy, 3.2) * 2.6 * sstep(0.35, 0.8, face);
    if (I > 0.04) eyes(hx, hy, DEER.a, 0.07 * PPM, [232, 255, 220], I);
  }
  // trail reflectors flare in the beam
  for (const rf of reflectors) {
    const I = beamAt(rf.x, rf.y, 3.4);
    if (I <= 0.02) continue;
    const [sx, sy] = s2(rf.x, rf.y), v = clamp(I * 3, 0, 1);
    px1(sx, sy, 215, 240, 255, v); px1(sx + 1, sy, 215, 240, 255, v * 0.8); px1(sx, sy - 1, 215, 240, 255, v * 0.8); px1(sx - 1, sy, 160, 200, 230, v * 0.4); px1(sx, sy + 1, 160, 200, 230, v * 0.4);
  }
  { const I = beamAt(FALLEN.x, FALLEN.y, 3); if (I > 0.02) { const [sx, sy] = s2(FALLEN.x, FALLEN.y); px1(sx, sy, 215, 240, 255, clamp(I * 3, 0, 1)); } }
  // fire and lamp glow are always visible
  for (const f of [CAMP, ...fires]) {
    const [sx, sy] = s2(f.x, f.y); if (!onScr(sx, sy, 6)) continue;
    const big = f !== CAMP;
    for (let n = 0; n < (big ? 8 : 3); n++) {
      const rx = (R() - 0.5) * (big ? 5 : 3), ry = (R() - 0.5) * (big ? 5 : 3) - (big ? R() * 2 : 0), hot = R();
      px1(sx + rx, sy + ry, 255, hot > 0.6 ? 220 : 140, hot > 0.85 ? 120 : 40, big ? 0.9 : 0.5);
    }
  }
  { const [sx, sy] = s2(LAMP.x, LAMP.y); if (onScr(sx, sy, 3)) { px1(sx, sy, 255, 214, 150, 1); px1(sx + 1, sy, 255, 190, 110, 0.8); px1(sx, sy + 1, 255, 190, 110, 0.8); } }
  // sound marks: a faint ring where something made a noise
  for (const rp of ripples) {
    const [sx, sy] = s2(rp.x, rp.y), rr = (0.3 + rp.t * 2) * PPM, a = (1 - rp.t / 0.7) * 0.22 * rp.s;
    if (a <= 0) continue;
    const n = Math.max(8, rr * 3 | 0);
    for (let k = 0; k < n; k++) if ((k & 1) === 0) { const t = k / n * TAU; px1(sx + Math.cos(t) * rr, sy + Math.sin(t) * rr, 200, 200, 190, a); }
  }
  if (mode === 'dying' && deathT > 0.55) out32.fill(BLACK);
  if (mode === 'won') { const f = clamp(wonT / 2, 0, 1); if (f > 0) for (let i = 0; i < out32.length; i++) if (BAY[((i / W | 0) & 3) << 2 | (i % W & 3)] < f) out32[i] = BLACK; }
}

// ---------------- flow ----------------
const card = $('card'), box = card.querySelector('.box');
function showCard(html, solid) { box.innerHTML = html; card.hidden = false; card.classList.toggle('solid', !!solid); hud(false); }
function hideCard() { card.hidden = true; }
function hud(on) { $('pauseBtn').hidden = !on; $('rbtns').hidden = !on; }
function btn(label, fn, primary) { const b = document.createElement('button'); b.textContent = label; if (primary) b.className = 'primary'; b.addEventListener('click', e => { e.stopPropagation(); initAudio(); fn(); }); return b; }
function row(...bs) { const r = document.createElement('div'); r.className = 'row'; bs.forEach(b => r.appendChild(b)); box.appendChild(r); }
const HOWTO = `<ul>
<li><b>Left thumb</b> walks. A small push creeps quietly, push all the way to run.</li>
<li><b>Right thumb</b> aims the flashlight. Tap there, or press LIGHT, to switch it off and on.</li>
<li><b>The battery sags</b> the longer it runs. Switch it off for a few seconds and it comes back. FAR throws the beam farther but drains it fast.</li>
<li><b>Follow the reflectors</b> on the trees north to the trailhead. Fires along the way are safe.</li>
<li><b>Something is out there.</b> A glance is fine. Don't stare at it.</li>
<li><b>If it comes for you,</b> get to a fire, or go dark and creep away.</li>
</ul>`;
function title() {
  mode = 'title'; lightOn = true; narrow = false; syncBtns();
  showCard(`<h1>Hollow Pines</h1><p>Your fire went out. The car is at the trailhead, somewhere north. Follow the reflectors on the trees.</p><p class="dim">Headphones on. Lights down.</p>`);
  row(btn('Walk into the woods', start, true), btn('How to play', howto));
  if (bestStats) box.insertAdjacentHTML('beforeend', `<p class="dim">Last escape: ${fmtT(bestStats.t)}, saw it ${bestStats.s} times</p>`);
}
function howto() { const back = mode; showCard(`<h2>How to play</h2>${HOWTO}<p class="dim">Keyboard: WASD walk, Shift run, C creep, mouse aims, click or Space for the light, F for focus.</p>`, true); row(btn('Back', back === 'pause' ? pause : title, true)); if (back === 'pause') mode = 'pause'; }
function resetRun() {
  runSeed = (Math.random() * 1e9) | 0; buildWorld(runSeed);
  Object.assign(P, { x: 0.6, y: 6.2, aim: -Math.PI / 2, aimT: -Math.PI / 2, vx: 0, vy: 0, stam: 1, mode: 'still', face: -Math.PI / 2 });
  Object.assign(bat, { c: 1, r: 1, dead: false, force: 0 });
  Object.assign(D, { t: 0, next: 30 + R() * 8, bold: 0, sightings: 0, hunts: 0, heat: 0, first: true, amb: 12, mute: 0 });
  goAway(); D.next = 30 + R() * 8; DEER.on = false; ripples = [];
  lightOn = true; narrow = false; fear = 0.05; runTime = 0; wonT = 0; cam.x = P.x; cam.y = P.y - 3; syncBtns();
}
function start() {
  initAudio(); wakeAudio();
  resetRun();
  mode = 'play'; hideCard(); hud(true);
  try { navigator.wakeLock && navigator.wakeLock.request('screen').catch(() => {}); } catch (e) {}
  const hl = $('hintL'), hr = $('hintR'); hl.hidden = hr.hidden = false; hl.style.opacity = hr.style.opacity = '1';
  setTimeout(() => { hl.style.opacity = hr.style.opacity = '0'; }, 7000); setTimeout(() => { hl.hidden = hr.hidden = true; }, 9000);
}
function pause() { if (mode !== 'play' && mode !== 'pause') return; mode = 'pause'; stick.move = stick.aim = null; stL.hidden = stR.hidden = true; showCard(`<h2>Paused</h2><p class="dim">${Math.round(progress() * 100)}% of the way to the trailhead</p>`); row(btn('Keep going', resume, true), btn('Start over', start), btn('How to play', howto), btn(soundOn ? 'Sound on' : 'Sound off', () => { soundOn = !soundOn; if (master) master.gain.value = soundOn ? 0.9 : 0; pause(); })); }
function resume() { mode = 'play'; hideCard(); hud(true); }
const fmtT = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
function endCard(won) {
  const dist = Math.round(progress() * (PY0 - ROADY));
  const stats = `<div class="stats"><div><b>${fmtT(runTime)}</b>time</div><div><b>${won ? Math.round(PY0 - ROADY) : dist} m</b>of ${Math.round(PY0 - ROADY)} m</div><div><b>${D.sightings}</b>times you saw it</div><div><b>${D.hunts}</b>times it came for you</div></div>`;
  if (won) { bestStats = { t: runTime, s: D.sightings }; showCard(`<h2 class="good">You made it to the car</h2><p>The doors lock with a soft clunk. Something stands at the edge of the lamplight and watches you go.</p>${stats}`, true); }
  else showCard(`<h2 class="bad">It found you</h2><p>${D.hunts ? 'It doesn\'t like being looked at.' : 'You never saw it coming.'}</p>${stats}`, true);
  row(btn(won ? 'Walk new woods' : 'Try again', start, true), btn('Title', title));
}
function win() { mode = 'won'; wonT = 0; snd.win(); hud(false); fear = 0; }

let last = performance.now(); const HOLD = { on: false };
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now; tNow += dt;
  if (HOLD.on) { requestAnimationFrame(frame); return; }
  if (mode === 'play') update(dt);
  else if (mode === 'title') { P.aim = -Math.PI / 2 + Math.sin(tNow * 0.35) * 0.9; P.aimT = P.aim; lightOn = true; updateBattery(dt); bat.c = 1; buildShadows(); }
  else if (mode === 'dying') { deathT += dt; beam.out = deathT < 0.5 ? 1 : 0; beam.hw = 0.6; beam.R = 9; beam.cosO = Math.cos(0.84); beam.aim = P.aim; buildShadows(); if (deathT > 1.6 && card.hidden) endCard(false); }
  else if (mode === 'won') { wonT += dt; if (wonT > 2.2 && card.hidden) endCard(true); }
  for (const rp of ripples) rp.t += dt; ripples = ripples.filter(r => r.t < 0.7);
  audioTick(dt);
  render(dt);
  requestAnimationFrame(frame);
}

// boot
setTimeout(() => {
  buildWorld(12345);
  P.x = 0.6; P.y = 2; cam.x = 0; cam.y = -4; mode = 'title'; title();
  requestAnimationFrame(frame);
}, 30);
window.HP = { HOLD, toggleLight, get lightOn() { return lightOn; }, P, CR, D, bat, beam, DEER, get mode() { return mode; }, set mode(v) { mode = v; }, hideCard, resume, start, update, render, evPosing, evBehind, evStalk, evGlimpse, startHunt, pathX, spawnDeer, get fires() { return fires; }, get reflectors() { return reflectors; } };
