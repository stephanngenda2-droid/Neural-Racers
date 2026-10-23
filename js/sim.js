// Physics, sensors, checkpoints, fitness, neuroevolution. No DOM access in this file.
const VMAX = 260, ACC = 200, BRK = 420, DRAG = ACC / VMAX, WB = 30, MAXST = .42, LATLIM = 450;
const RANGE = 200, ANG = [0, -10, 10, -30, 30, -60, 60].map(d => d * Math.PI / 180);
const SIZES = [10, 12, 8, 3];
const RACING = 0, CRASHED = 1, STUCK = 2, FINISHED = 4, TIMEOUT = 5;
const CAR = [[12, 6], [12, -6], [-12, 6], [-12, -6]];
const gauss = R => Math.sqrt(-2 * Math.log(R() || 1e-9)) * Math.cos(2 * Math.PI * R());

function randomNet(R) {
  const W = [], b = [];
  for (let l = 0; l < SIZES.length - 1; l++) {
    const i = SIZES[l], o = SIZES[l + 1], w = new Float32Array(i * o);
    for (let k = 0; k < w.length; k++) w[k] = gauss(R) / Math.sqrt(i);
    W.push(w); b.push(new Float32Array(o));
  }
  return {W, b};
}
function forward(net, x) {
  let h = x;
  for (let l = 0; l < net.W.length; l++) {
    const i = SIZES[l], o = SIZES[l + 1], out = new Float64Array(o);
    for (let j = 0; j < o; j++) { let s = net.b[l][j]; for (let k = 0; k < i; k++) s += h[k] * net.W[l][k * o + j]; out[j] = Math.tanh(s); }
    h = out;
  }
  return h;
}
const cloneNet = n => ({W: n.W.map(a => a.slice()), b: n.b.map(a => a.slice())});

class Sim {
  constructor(track, cfg) { this.tr = track; this.cfg = cfg; this.reset(); }
  reset() {
    this.R = rng(this.cfg.seed); this.gen = 1; this.history = []; this.bestEver = null;
    this.nets = Array.from({length: this.cfg.pop}, () => randomNet(this.R)); this.spawn();
  }
  spawn() {
    const t = this.tr, N = t.N; this.t = 0; this.done = false;
    this.cars = this.nets.map((net, i) => {
      const off = Math.round(Math.floor(i / 4) * 26 / t.sp), idx = ((-off) % N + N) % N, th = t.theta[idx], lat = ((i % 4) - 1.5) * .2 * t.width;
      return {net, i, x: t.c[idx][0] - Math.sin(th) * lat, y: t.c[idx][1] + Math.cos(th) * lat, th, vx: 0, vy: 0, om: 0, st: RACING,
        idx, prog: -off, p0: -off, pmax: -off, cps: 0, laps: 0, hits: 0, contact: false, dist: 0, idle: 0, refP: -off, refT: 0,
        fast: Infinity, last: 0, fin: NaN, out: [0, 0, 0], obs: new Float64Array(10)};
    });
    this.cars.forEach(c => this.observe(c));
  }
  observe(c) {
    for (let k = 0; k < 7; k++) {
      let d = RANGE; const a = c.th + ANG[k];
      for (let s = 4; s <= RANGE; s += 4) if (!isRoad(this.tr, c.x + Math.cos(a) * s, c.y + Math.sin(a) * s)) { d = s - 2; break; }
      c.obs[k] = d / RANGE;
    }
    c.obs[7] = Math.hypot(c.vx, c.vy) / VMAX; c.obs[8] = wrap(c.th - this.tr.theta[c.idx]) / Math.PI; c.obs[9] = c.out[0];
  }
  step() {
    if (this.done) return;
    const cfg = this.cfg, t = this.tr, dt = 1 / 60, N = t.N; let alive = 0;
    for (const c of this.cars) {
      if (c.st !== RACING) continue;
      this.observe(c);
      const o = forward(c.net, c.obs), steer = o[0], thr = (o[1] + 1) / 2, brk = Math.min(1, Math.max(0, (o[2] - .2) / .8));
      c.out = [steer, thr, brk];
      const ox = c.x, oy = c.y, c0 = Math.cos(c.th), s0 = Math.sin(c.th);
      let vf = c.vx * c0 + c.vy * s0, vl = -c.vx * s0 + c.vy * c0;
      vf += thr * ACC * dt; if (vf > 0) vf = Math.max(0, vf - brk * BRK * dt);
      vf = Math.min(VMAX, Math.max(-40, vf - DRAG * vf * dt));
      let wt = vf / WB * Math.tan(steer * MAXST); const al = Math.abs(vf * wt), slip = al > LATLIM;
      if (slip) wt *= LATLIM / al;
      c.om += (wt - c.om) * Math.min(1, dt * 8);
      let vx = vf * c0 - vl * s0, vy = vf * s0 + vl * c0; const th = c.th + c.om * dt, c1 = Math.cos(th), s1 = Math.sin(th);
      const vf2 = vx * c1 + vy * s1; let vl2 = (-vx * s1 + vy * c1) * Math.exp(-(slip ? 2.5 : 12) * dt);   // low grip = sliding
      vx = vf2 * c1 - vl2 * s1; vy = vf2 * s1 + vl2 * c1;
      let x = ox + vx * dt, y = oy + vy * dt;
      const hit = CAR.some(([lx, ly]) => !isRoad(t, x + c1 * lx - s1 * ly, y + s1 * lx + c1 * ly));
      if (hit) {                                   // undo the move and bounce; fast or repeated hits eliminate the car
        const imp = Math.hypot(vx, vy); x = ox; y = oy; vx *= -.3; vy *= -.3;
        if (!c.contact) c.hits++;
        if (imp > 90 || c.hits > 3) { c.st = CRASHED; vx = vy = 0; }
      }
      c.contact = hit; c.x = x; c.y = y; c.th = th; c.vx = vx; c.vy = vy;
      c.dist += Math.hypot(x - ox, y - oy); if (Math.hypot(vx, vy) < 5) c.idle += dt;
      if (c.st !== RACING) continue;
      // progress along the centerline: nearest point in a small window, monotonic maximum
      let bd = 1e18, bj = c.idx;
      for (let k = -8; k < 40; k++) { const j = ((c.idx + k) % N + N) % N, d = (t.c[j][0] - x) ** 2 + (t.c[j][1] - y) ** 2; if (d < bd) { bd = d; bj = j; } }
      c.prog += ((bj - c.idx + N / 2 + N) % N) - N / 2; c.idx = bj; c.pmax = Math.max(c.pmax, c.prog);
      if (c.pmax >= (c.cps + 1) * N / cfg.cps) {                 // checkpoints are strictly ordered, one per step
        c.cps++; const laps = Math.floor(c.cps / cfg.cps);
        if (laps > c.laps) { c.fast = Math.min(c.fast, this.t - c.last); c.last = this.t; c.laps = laps; }
        if (c.laps >= cfg.laps) { c.st = FINISHED; c.fin = this.t; c.vx = c.vy = 0; continue; }
      }
      if (this.t - c.refT >= 3) {                                // stuck detection
        if ((c.pmax - c.refP) * t.sp < 15) { c.st = STUCK; c.vx = c.vy = 0; continue; }
        c.refP = c.pmax; c.refT = this.t;
      }
      alive++;
    }
    this.t += dt;
    if (!alive || this.t >= cfg.time) { this.cars.forEach(c => { if (c.st === RACING) c.st = TIMEOUT; }); this.done = true; this.record(); }
  }
  fitness(c) {
    const cfg = this.cfg, N = this.tr.N, driven = Math.max(0, c.pmax - c.p0), prog = Math.min(driven / N, cfg.laps);
    const ta = isNaN(c.fin) ? Math.max(this.t, .001) : c.fin, spd = Math.min(1, driven * this.tr.sp / ta / VMAX);
    let f = 100 * prog + 20 * Math.min(c.cps, cfg.cps * cfg.laps) / cfg.cps + 50 * c.laps + 10 * spd;
    if (c.st === FINISHED) f += 30 * (1 - c.fin / cfg.time);
    if (c.st === CRASHED || c.st === STUCK) f -= 10;
    return f - .5 * Math.min(c.hits, 20) - 5 * c.idle / cfg.time;
  }
  record() {
    const f = this.cars.map(c => this.fitness(c)), n = f.length, s = [...f].sort((a, b) => a - b), bi = f.indexOf(Math.max(...f));
    if (!this.bestEver || f[bi] > this.bestEver.fitness) this.bestEver = {fitness: f[bi], gen: this.gen};
    const fast = Math.min(...this.cars.map(c => c.fast));
    this.history.push({gen: this.gen, best: s[n - 1], mean: f.reduce((a, b) => a + b) / n, median: s[n >> 1],
      lapRate: this.cars.filter(c => c.laps >= 1).length / n, crashes: this.cars.filter(c => c.st === CRASHED || c.st === STUCK).length,
      avgCps: this.cars.reduce((a, c) => a + c.cps, 0) / n, fastest: isFinite(fast) ? fast : null});
  }
  evolve() {   // elites copied unchanged; children = tournament parents -> uniform crossover -> Gaussian mutation
    if (!this.done) { this.cars.forEach(c => { if (c.st === RACING) c.st = TIMEOUT; }); this.done = true; this.record(); }
    const cfg = this.cfg, P = this.cars.length, f = this.cars.map(c => this.fitness(c));
    const order = f.map((_, i) => i).sort((a, b) => f[b] - f[a]), ne = Math.max(1, Math.round(P * cfg.elite));
    const pick = () => { let b = Math.floor(this.R() * P); for (let k = 1; k < cfg.tk; k++) { const j = Math.floor(this.R() * P); if (f[j] > f[b]) b = j; } return this.nets[b]; };
    const next = order.slice(0, ne).map(i => cloneNet(this.nets[i]));
    while (next.length < P) {
      const a = pick(), b = pick(), ch = cloneNet(a);
      for (const key of ['W', 'b']) ch[key].forEach((arr, l) => { for (let k = 0; k < arr.length; k++) {
        if (this.R() < .5) arr[k] = b[key][l][k];
        if (this.R() < cfg.mut) arr[k] += gauss(this.R) * cfg.str; } });
      next.push(ch);
    }
    this.nets = next; this.gen++; this.spawn();
  }
}
if (typeof module !== 'undefined') module.exports = {Sim};
