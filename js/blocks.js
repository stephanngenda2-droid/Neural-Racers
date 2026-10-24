// Block-style rules: each block is "IF <input> <op> <value> THEN <action> <amount>". Top to bottom, the first block
// that matches a channel (steer / throttle / brake) wins. Used for the player's car; no DOM access except editor().
const INPUTS = {
  front: o => o[0] * 100, 'slight L': o => o[1] * 100, 'slight R': o => o[2] * 100, 'medium L': o => o[3] * 100,
  'medium R': o => o[4] * 100, 'far L': o => o[5] * 100, 'far R': o => o[6] * 100, speed: o => o[7] * 100,
  'room balance': o => ((o[1] + o[3] + o[5]) - (o[2] + o[4] + o[6])) * 100 / 3, always: () => 0};
const ACTS = ['steer', 'steer to open side', 'throttle', 'brake'];
const STARTER = [{in: 'always', op: '<', v: 0, act: 'steer to open side', a: 80},
  {in: 'front', op: '<', v: 30, act: 'brake', a: 50}, {in: 'always', op: '<', v: 0, act: 'throttle', a: 55}];
const cloneRules = r => r.map(x => ({...x}));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function ruleOut(rules, o) {
  const s = {};
  for (const r of rules) {
    const x = INPUTS[r.in](o);
    if (r.in !== 'always' && !(r.op === '<' ? x < r.v : x > r.v)) continue;
    const ch = r.act === 'steer' || r.act === 'steer to open side' ? 'steer' : r.act;
    if (ch in s) continue;
    s[ch] = r.act === 'steer to open side' ? clamp(-INPUTS['room balance'](o) / 100 * 3 * r.a / 100, -1, 1) : r.a / 100;
  }
  const t = s.throttle || 0, b = s.brake || 0;
  return [s.steer || 0, 2 * t - 1, b > 0 ? b * .8 + .2 : -1];
}
function mutRules(rules) {     // evolution for "auto-tune" mode: jitter the numbers, keep the structure
  const g = () => Math.sqrt(-2 * Math.log(Math.random() || 1e-9)) * Math.cos(2 * Math.PI * Math.random());
  return rules.map(r => ({...r, v: Math.round(clamp(r.v + g() * 8, r.in === 'room balance' ? -100 : 0, 100)),
    a: Math.round(clamp(r.a + g() * 10, r.act === 'steer' ? -100 : 0, 100))}));
}
const makeMine = (t, tune) => [cloneRules(t), ...(tune ? Array.from({length: 7}, () => mutRules(t)) : [])];

function editor(el, rules, change) {
  const sel = (opts, v, k, i) => `<select data-k="${k}" data-i="${i}">${opts.map(o => `<option${o === v ? ' selected' : ''}>${o}</option>`).join('')}</select>`;
  el.innerHTML = '<div class="hint">Blocks run top to bottom; the first match per steer / throttle / brake wins.</div>' +
    rules.map((r, i) => `<div class="rule"><div>IF ${sel(Object.keys(INPUTS), r.in, 'in', i)}${r.in === 'always' ? '' :
      sel(['<', '>'], r.op, 'op', i) + `<input type="range" min="${r.in === 'room balance' ? -100 : 0}" max="100" value="${r.v}" data-k="v" data-i="${i}"><b>${r.v}</b>`}</div>
      <div>THEN ${sel(ACTS, r.act, 'act', i)}<input type="range" min="${r.act === 'steer' ? -100 : 0}" max="100" value="${r.a}" data-k="a" data-i="${i}"><b>${r.a}</b>
      <button data-del="${i}">&times;</button></div></div>`).join('') + '<button data-add>+ block</button>';
  el.oninput = e => { const t = e.target; if (t.type !== 'range') return; rules[+t.dataset.i][t.dataset.k] = +t.value; t.nextElementSibling.textContent = t.value; change(); };
  el.onchange = e => { const t = e.target; if (t.tagName !== 'SELECT') return; const r = rules[+t.dataset.i]; r[t.dataset.k] = t.value;
    if (t.dataset.k === 'act') r.a = clamp(r.a, r.act === 'steer' ? -100 : 0, 100); editor(el, rules, change); change(); };
  el.onclick = e => { const t = e.target;
    if (t.dataset.add !== undefined) rules.push({in: 'front', op: '<', v: 50, act: 'throttle', a: 50});
    else if (t.dataset.del !== undefined) rules.splice(+t.dataset.del, 1); else return;
    editor(el, rules, change); change(); };
}
if (typeof module !== 'undefined') module.exports = {ruleOut, STARTER};
