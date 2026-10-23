// Track generation: control points -> spline -> smoothing -> validated closed centerline + road raster.
const PRESETS = {
  Beginner: {c: 2, w: 110, len: 4200, h: 0, seed: 11}, Technical: {c: 7, w: 68, len: 4600, h: 1, seed: 5},
  Hairpin: {c: 6, w: 80, len: 4800, h: 3, seed: 21}, 'High-Speed': {c: 3, w: 90, len: 6500, h: 0, seed: 8},
  Random: {c: 5, w: 85, len: 5000, h: 1, seed: null}};
const CELL = 2, SP = 5;
const rng = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const wrap = a => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));

function spline(P, per = 20) {
  const n = P.length, o = [];
  for (let i = 0; i < n; i++) {
    const p0 = P[(i + n - 1) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      o.push([0, 1].map(d => .5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)));
    }
  }
  return o;
}
function resample(c, sp) {
  const n = c.length, s = [0];
  for (let i = 0; i < n; i++) { const b = c[(i + 1) % n]; s.push(s[i] + Math.hypot(b[0] - c[i][0], b[1] - c[i][1])); }
  const tot = s[n], m = Math.max(8, Math.round(tot / sp)), o = [];
  let j = 0;
  for (let k = 0; k < m; k++) {
    const t = tot * k / m; while (s[j + 1] < t) j++;
    const a = c[j], b = c[(j + 1) % n], f = (t - s[j]) / (s[j + 1] - s[j] || 1);
    o.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return [o, tot];
}
function smooth(c, sg) {
  const n = c.length, k = Math.floor(sg * 3), g = []; let sum = 0;
  for (let i = -k; i <= k; i++) { const v = Math.exp(-i * i / (2 * sg * sg)); g.push(v); sum += v; }
  return c.map((_, i) => [0, 1].map(d => { let a = 0; for (let j = -k; j <= k; j++) a += g[j + k] * c[((i + j) % n + n) % n][d]; return a / sum; }));
}
function build(p, seed) {
  const R = rng(seed), n = 6 + 2 * p.c, L = p.len / (2 * Math.PI), amp = .08 + .04 * p.c, ang = [], r = [];
  for (let i = 0; i < n; i++) { ang.push(2 * Math.PI * i / n + (R() * .6 - .3) * 2 * Math.PI / n); r.push(L * (1 + (R() * 2 - 1) * amp)); }
  const ids = []; while (ids.length < Math.min(p.h, Math.floor(n / 3))) { const i = Math.floor(R() * n); if (!ids.includes(i)) ids.push(i); }
  ids.forEach(i => { r[i] *= 1.5; r[(i + n - 1) % n] *= .85; r[(i + 1) % n] *= .85; });
  const sq = .6 + R() * .4, P = r.map((v, i) => [v * Math.cos(ang[i]), v * Math.sin(ang[i]) * sq]);
  const [c0, t0] = resample(spline(P), SP);
  let c = smooth(c0.map(q => [q[0] * p.len / t0, q[1] * p.len / t0]), 100 / SP);
  const [c1, t1] = resample(c, SP), f = p.len / t1; c = c1.map(q => [q[0] * f, q[1] * f]);
  const N = c.length, sp = t1 * f / N;
  // validation: simple loop, no corner tighter than the road allows, distant road never touches itself
  const h = c.map((q, i) => { const b = c[(i + 1) % N]; return Math.atan2(b[1] - q[1], b[0] - q[0]); });
  let wind = 0; const cv = h.map((a, i) => { const d = wrap(h[(i + 1) % N] - a); wind += d; return Math.abs(d) / sp; });
  const cs = cv.map((_, i) => { let s = 0; for (let j = -2; j <= 2; j++) s += cv[(i + j + N) % N]; return s / 5; });
  if (Math.abs(Math.abs(wind / (2 * Math.PI)) - 1) > .05 || 1 / Math.max(...cs) < .6 * p.w) return null;
  for (let i = 0; i < N; i += 3) for (let j = i + 3; j < N; j += 3) {
    const arc = Math.min(j - i, N - (j - i)) * sp;
    if (arc >= 2.2 * p.w && Math.hypot(c[i][0] - c[j][0], c[i][1] - c[j][1]) < 1.15 * p.w) return null;
  }
  // start on the straightest stretch, with room behind it for the grid
  let best = 1e9, bi = 0;
  for (let i = 0; i < N; i += 2) { let s = 0; for (let j = 0; j < 150; j++) s += cs[(i + j) % N]; if (s < best) { best = s; bi = i; } }
  const st = (bi + 130) % N; c = c.slice(st).concat(c.slice(0, st));
  const pad = p.w * 1.2 + 30, mn = [Math.min(...c.map(q => q[0])), Math.min(...c.map(q => q[1]))];
  c = c.map(q => [q[0] - mn[0] + pad, q[1] - mn[1] + pad]);
  const W = Math.ceil((Math.max(...c.map(q => q[0])) + pad) / CELL), H = Math.ceil((Math.max(...c.map(q => q[1])) + pad) / CELL);
  const mask = new Uint8Array(W * H), ri = Math.ceil(p.w / 2 / CELL), rr = p.w / 2 / CELL;
  for (const q of c) {
    const cx = Math.round(q[0] / CELL), cy = Math.round(q[1] / CELL);
    for (let y = -ri; y <= ri; y++) for (let x = -ri; x <= ri; x++) if (x * x + y * y <= rr * rr) mask[(cy + y) * W + cx + x] = 1;
  }
  const theta = c.map((_, i) => { const a = c[(i + 1) % N], b = c[(i + N - 1) % N]; return Math.atan2(a[1] - b[1], a[0] - b[0]); });
  const left = c.map((q, i) => [q[0] - Math.sin(theta[i]) * p.w / 2, q[1] + Math.cos(theta[i]) * p.w / 2]);
  const right = c.map((q, i) => [q[0] + Math.sin(theta[i]) * p.w / 2, q[1] - Math.cos(theta[i]) * p.w / 2]);
  return {c, theta, left, right, N, sp, width: p.w, mask, W, H, size: [W * CELL, H * CELL], seed, params: p};
}
function genTrack(p) {
  const base = p.seed == null ? Math.floor(Math.random() * 1e6) : p.seed;
  for (let k = 0; k < 400; k++) { const t = build(p, base + k); if (t) return t; }
  throw new Error('Could not build a valid track with these settings');
}
const isRoad = (t, x, y) => { const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
  return cx >= 0 && cy >= 0 && cx < t.W && cy < t.H && t.mask[cy * t.W + cx] === 1; };
if (typeof module !== 'undefined') module.exports = {PRESETS, genTrack, isRoad, wrap};
