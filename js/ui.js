// Canvas rendering and controls. The simulation (sim.js) never touches the DOM.
const $ = id => document.getElementById(id), cv = $('c'), g = cv.getContext('2d');
const cfg = {seed: 1, pop: 50, laps: 2, cps: 24, time: 70, elite: .1, mut: .12, str: .25, tk: 4};
const names = Object.keys(PRESETS), SPEEDS = [1, 2, 5, 10];
let preset = 'Beginner', tr, sim, road, paused = false, si = 0, rays = 1, sel = null, scale = 1, ox = 0, oy = 0, hlen = 0;

function load(name, seed) {
  try {
    preset = name; const p = {...PRESETS[name]}; if (seed !== undefined) p.seed = seed;
    tr = genTrack(p); sim = new Sim(tr, cfg); sel = null; hlen = -1;
    road = new Path2D();
    for (const e of [tr.left, tr.right]) { e.forEach((q, i) => i ? road.lineTo(q[0], q[1]) : road.moveTo(q[0], q[1])); road.closePath(); }
  } catch (e) { alert(e.message); }
}
function resize() {
  const d = devicePixelRatio || 1; cv.width = cv.clientWidth * d; cv.height = cv.clientHeight * d;
  scale = Math.min(cv.width / tr.size[0], cv.height / tr.size[1]) * .96;
  ox = (cv.width - tr.size[0] * scale) / 2; oy = (cv.height - tr.size[1] * scale) / 2;
}
const buttons = [
  ['Pause', () => paused = !paused, () => paused ? 'Play' : 'Pause'],
  ['Step', () => { paused = true; stepOnce(); }],
  ['Speed', () => si = (si + 1) % 4, () => `Speed ${SPEEDS[si]}x`],
  ['Track', () => confirmReset(() => { load(names[(names.indexOf(preset) + 1) % names.length]); resize(); }), () => `Track: ${preset}`],
  ['New random', () => confirmReset(() => { load('Random', undefined); resize(); })],
  ['Reset gen', () => sim.spawn()],
  ['Reset all', () => confirmReset(() => { sim.reset(); hlen = -1; }, true)],
  ['Rays', () => rays = (rays + 1) % 3, () => `Rays: ${['off', 'selected', 'all'][rays]}`],
];
function confirmReset(fn, force) { if (!sim.history.length && !force || confirm('This discards the experiment history. Continue?')) fn(); }
buttons.forEach(([l, f, lab]) => { const b = document.createElement('button'); b.textContent = l; b.onclick = () => { f(); refreshButtons(); };
  b.dataset.lab = lab ? '1' : ''; b._lab = lab; $('bar').appendChild(b); });
function refreshButtons() { [...$('bar').children].forEach(b => { if (b._lab) b.textContent = b._lab(); }); }
function stepOnce() { sim.step(); if (sim.done) { if (sim.gen < 100) sim.evolve(); else paused = true; } }

function draw() {
  g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#101317'; g.fillRect(0, 0, cv.width, cv.height);
  g.setTransform(scale, 0, 0, scale, ox, oy);
  g.fillStyle = '#34393f'; g.fill(road, 'evenodd'); g.strokeStyle = '#6e7987'; g.lineWidth = 2 / scale; g.stroke(road);
  g.strokeStyle = '#ced5dc'; g.lineWidth = 3 / scale; g.beginPath(); g.moveTo(...tr.left[0]); g.lineTo(...tr.right[0]); g.stroke();
  const n = sim.cars.length;
  sim.cars.slice().sort((a, b) => (a.st === RACING) - (b.st === RACING)).forEach(c => {
    if (rays === 2 && c.st === RACING || rays === 1 && c === sel) {
      g.lineWidth = 1 / scale;
      ANG.forEach((a, k) => { const d = c.obs[k] * RANGE; g.strokeStyle = d > 120 ? '#5cd68c' : d > 50 ? '#ff9f43' : '#ee6262';
        g.beginPath(); g.moveTo(c.x, c.y); g.lineTo(c.x + Math.cos(c.th + a) * d, c.y + Math.sin(c.th + a) * d); g.stroke(); });
    }
    g.save(); g.translate(c.x, c.y); g.rotate(c.th);
    g.fillStyle = c.st === CRASHED || c.st === STUCK ? '#424850' : c.st === FINISHED ? '#cfd5db' : `hsl(${(c.i * 222) % 360},65%,62%)`;
    g.beginPath(); g.moveTo(13, 0); g.lineTo(-11, 7); g.lineTo(-6, 0); g.lineTo(-11, -7); g.closePath(); g.fill();
    if (c === sel) { g.strokeStyle = '#fff'; g.lineWidth = 1.5 / scale; g.beginPath(); g.arc(0, 0, 16, 0, 7); g.stroke(); }
    g.restore();
  });
}
function panel() {
  const f = sim.cars.map(c => [c, sim.fitness(c)]).sort((a, b) => b[1] - a[1]), alive = sim.cars.filter(c => c.st === RACING).length, h = sim.history;
  const dead = sim.cars.filter(c => c.st === CRASHED || c.st === STUCK).length, tot = h.length * cfg.pop;
  const fast = Math.min(...h.map(x => x.fastest ?? Infinity)), row = (k, v) => `<div class="row">${k}<b>${v}</b></div>`;
  $('gen').textContent = `gen ${sim.gen}/100`;
  $('stats').innerHTML = row('active / crashed', `${alive} / ${dead}`) + row('best fitness', f[0][1].toFixed(1)) +
    row('average fitness', (f.reduce((a, x) => a + x[1], 0) / f.length).toFixed(1)) + row('leader', '#' + f[0][0].i) +
    row('time', `${sim.t.toFixed(1)}s / ${cfg.time}s`) + row('fastest lap', isFinite(fast) ? fast.toFixed(2) + 's' : '-') +
    row('lap completion', tot ? Math.round(100 * h.reduce((a, x) => a + x.lapRate * cfg.pop, 0) / tot) + '%' : '-') +
    row('best agent', sim.bestEver ? `gen ${sim.bestEver.gen} · ${sim.bestEver.fitness.toFixed(1)}` : '-');
  $('lb').innerHTML = f.slice(0, 8).map(([c, v]) => `<div class="lb ${c === sel ? 'on' : ''}" data-i="${c.i}">#${c.i}<b>${v.toFixed(1)}</b></div>`).join('');
  if (h.length !== hlen) { hlen = h.length; chart(h); }
}
function chart(h) {
  const k = $('ch').getContext('2d'), w = 240, ht = 80; k.clearRect(0, 0, w, ht);
  if (h.length < 2) return;
  const hi = Math.max(...h.map(x => x.best), 1), lo = Math.min(0, ...h.map(x => x.mean));
  [['best', '#56ccf2'], ['mean', '#ff9f43']].forEach(([key, col]) => { k.strokeStyle = col; k.lineWidth = 2; k.beginPath();
    h.forEach((x, i) => { const px = 4 + (w - 8) * i / (h.length - 1), py = ht - 6 - (ht - 12) * (x[key] - lo) / (hi - lo || 1); i ? k.lineTo(px, py) : k.moveTo(px, py); }); k.stroke(); });
}
cv.onclick = e => {
  const r = cv.getBoundingClientRect(), d = devicePixelRatio || 1;
  const x = ((e.clientX - r.left) * d - ox) / scale, y = ((e.clientY - r.top) * d - oy) / scale;
  let b = null, bd = 400; sim.cars.forEach(c => { const q = (c.x - x) ** 2 + (c.y - y) ** 2; if (q < bd) { bd = q; b = c; } }); sel = b;
};
$('lb').onclick = e => { const i = e.target.closest('.lb')?.dataset.i; if (i !== undefined) sel = sim.cars[+i]; };
onkeydown = e => { if (e.code === 'Space') { paused = !paused; refreshButtons(); e.preventDefault(); } else if ('1234'.includes(e.key)) { si = +e.key - 1; refreshButtons(); } };
onresize = resize;
let fr = 0;
(function loop() { if (!paused) for (let i = 0; i < SPEEDS[si]; i++) stepOnce(); draw(); if (fr++ % 6 === 0) panel(); requestAnimationFrame(loop); })();
load('Beginner'); resize(); refreshButtons();
