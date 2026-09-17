// Part 11: digital integrated circuits. Every level, margin, current, fan-out, delay, power figure and switch
// state a frame's narration quotes is read back out of the text and checked against the engine's tables and
// against a working-out done here: margin arithmetic, the square-law inverter solved by bisection, currents
// added up, delays summed along the chain (and found on the drawn waveforms), and a switch-level evaluation
// of every transistor network with its own charge bookkeeping.

const num = (s) => parseFloat(String(s).replace(/−/g, '-'));
const NUM = '(−?-?[\\d.]+)';
const near = (a, b, tol = 0.006) => Math.abs(a - b) <= tol;
const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];
const round = (v, k) => Math.round(v * 10 ** k) / 10 ** k;

// ---- the square-law inverter, worked out on its own ----
function idsN(vgs, vds, vt, k) {
  const ov = vgs - vt;
  if (ov <= 0) return 0;
  return vds < ov ? k * (ov * vds - (vds * vds) / 2) : (k * ov * ov) / 2;
}
function voutOf(vin, vdd, vt, kp) {
  // the nMOS current rises with Vout and the pMOS current falls: bisect for the crossing
  let lo = 0, hi = vdd;
  for (let i = 0; i < 80; i++) {
    const m = (lo + hi) / 2, d = idsN(vin, m, vt, 1) - idsN(vdd - vin, vdd - m, vt, kp);
    if (d > 0) hi = m; else lo = m;
  }
  return (lo + hi) / 2;
}
function vtcOwn(vdd, vt, kp) {
  const N = 2000, pts = [];
  for (let i = 0; i <= N; i++) { const v = (vdd * i) / N; pts.push([v, voutOf(v, vdd, vt, kp)]); }
  let iL = -1, iH = -1;
  for (let i = 1; i < N; i++) { const s = (pts[i + 1][1] - pts[i - 1][1]) / (pts[i + 1][0] - pts[i - 1][0]); if (s <= -1) { if (iL < 0) iL = i; iH = i; } }
  let lo = 0, hi = vdd;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (voutOf(m, vdd, vt, kp) > m) lo = m; else hi = m; }
  const r = Math.sqrt(kp);
  return { VIL: pts[iL][0], VOH: pts[iL][1], VIH: pts[iH][0], VOL: pts[iH][1], VM: (lo + hi) / 2, VMf: (vt + r * (vdd - vt)) / (1 + r), r };
}

// ---- switch-level evaluation, worked out on its own ----
// nodes: VDD and GND and the inputs are driven; a component of nodes joined by conducting switches takes the
// value of its drivers (both values: a conflict), or with none, the charge its nodes held before (mixed: X).
function evalNet(net, inp, prev) {
  const val = { VDD: 1, GND: 0 };
  for (const n of net.inputs) val[n] = inp[n];
  const all = new Set(['VDD', 'GND', ...net.inputs]);
  for (const t of net.transistors) for (const k of ['g', 'a', 'b']) all.add(t[k]);
  let res = null;
  for (let pass = 0; pass < 8; pass++) {
    const on = net.transistors.filter((t) => (t.type === 'n' ? val[t.g] === 1 : val[t.g] === 0));
    const parent = {};
    const find = (x) => (parent[x] === undefined || parent[x] === x ? x : (parent[x] = find(parent[x])));
    for (const t of on) parent[find(t.a)] = find(t.b);
    const comps = {};
    for (const n of all) (comps[find(n)] = comps[find(n)] || []).push(n);
    const nodes = {};
    for (const members of Object.values(comps)) {
      const drv = new Set(members.filter((m) => m === 'VDD' || m === 'GND' || net.inputs.includes(m)).map((m) => val[m]));
      let v, s;
      if (drv.size > 1) { v = 'X'; s = 'conflict'; }
      else if (drv.size === 1) { v = [...drv][0]; s = 'driven'; }
      else {
        const held = new Set(members.map((m) => prev[m]).filter((x) => x !== undefined && x !== 'Z'));
        if (!held.size) { v = 'Z'; s = 'float'; } else { v = held.size > 1 ? 'X' : [...held][0]; s = 'charged'; }
      }
      for (const m of members) nodes[m] = { v, s, comp: members };
    }
    let changed = false;
    for (const n of all) if (!['VDD', 'GND', ...net.inputs].includes(n) && val[n] !== (nodes[n].s === 'driven' ? nodes[n].v : undefined)) { val[n] = nodes[n].s === 'driven' ? nodes[n].v : undefined; changed = true; }
    res = { on: on.map((t) => t.id), nodes };
    if (!changed) break;
  }
  return res;
}
const heldOf = (ev) => Object.fromEntries(Object.entries(ev.nodes).map(([k, n]) => [k, n.v]));
const combos = (net) => Array.from({ length: 1 << net.inputs.length }, (_, m) => Object.fromEntries(net.inputs.map((x, i) => [x, (m >> (net.inputs.length - 1 - i)) & 1])));

/** check one "A = 0, B = 1: M2, M3 conduct. Y = 1 through M3." sentence against an evaluation */
function checkRow(say, net, iv, ev, fail, where) {
  const m = say.match(/^(.*?): (nothing conducts|(.*?) conducts?)\. (.*)$/);
  if (!m) { fail(where + ': the row is not narrated as expected: ' + say); return; }
  const said = Object.fromEntries(m[1].split(', ').map((x) => x.split(' = ')).map(([k, v]) => [k, +v]));
  for (const n of net.inputs) if (said[n] !== iv[n]) fail(where + ': the narration has ' + n + ' = ' + said[n] + ', the row is ' + n + ' = ' + iv[n]);
  const on = m[3] ? m[3].split(', ') : [];
  const want = ev.on.slice().sort().join(','), got = on.slice().sort().join(',');
  if (want !== got) fail(where + ': the narration says ' + (got || 'nothing') + ' conduct, the switches give ' + (want || 'nothing'));
  const y = ev.nodes.Y, rest = m[4];
  let k;
  if ((k = rest.match(/^Y = ([01]) through (.*?)\./))) {
    if (y.s !== 'driven' || String(y.v) !== k[1]) fail(where + ': the narration says Y = ' + k[1] + ', the switches give ' + y.v + ' (' + y.s + ')');
    for (const t of k[2].split(', ')) {
      const tr = net.transistors.find((x) => x.id === t);
      if (!tr || !ev.on.includes(t) || !y.comp.includes(tr.a)) fail(where + ': ' + t + ' is said to carry Y but is not on its conducting path');
    }
  } else if (/^Y is joined to VDD and to GND at once/.test(rest)) { if (y.s !== 'conflict') fail(where + ': a conflict is narrated, the switches give Y = ' + y.v + ' (' + y.s + ')'); }
  else if (/^Y is joined to neither VDD nor GND: it floats \(Z\)/.test(rest)) { if (y.v !== 'Z') fail(where + ': Y is said to float, the switches give ' + y.v + ' (' + y.s + ')'); }
  else if ((k = rest.match(/^Y is cut off from both; the charge on it still holds ([01X])/))) { if (y.s !== 'charged' || String(y.v) !== k[1] || k[1] === 'X') fail(where + ': Y is said to hold ' + k[1] + ', the switches and the charge give ' + y.v + ' (' + y.s + ')'); }
  else if (/^Y is cut off from both, and now shares its charge .* \(X\)/.test(rest)) { if (y.s !== 'charged' || y.v !== 'X') fail(where + ': charge sharing to X is narrated, the bookkeeping gives ' + y.v + ' (' + y.s + ')'); }
  else fail(where + ': the output is not narrated as expected: ' + rest);
}
const yWord = (y) => (y.s === 'conflict' ? 'X' : y.s === 'driven' ? String(y.v) : 'Z');

// ---- the topics ----
const checks = {
  'ic-levels'({ S, input, r, fail }) {
    const f = S.Cmos.family(input.fam), n = input.noise, says = r.frames.map((x) => x.say);
    const reads = (v) => (v >= f.VIH - 1e-9 ? '1' : v <= f.VIL + 1e-9 ? '0' : 'indeterminate');
    let m = says[0].match(new RegExp('VOH = ' + NUM + ' V or more and a 0 at VOL = ' + NUM + ' V'));
    if (!m || !near(num(m[1]), f.VOH, 6e-4) || !near(num(m[2]), f.VOL, 6e-4)) fail('frame 0: VOH/VOL quoted as ' + (m && m.slice(1)) + ', the family has ' + f.VOH + ', ' + f.VOL);
    m = says[1].match(new RegExp('read ' + NUM + ' V \\(VIH\\) or more as 1 and ' + NUM + ' V \\(VIL\\)'));
    if (!m || !near(num(m[1]), f.VIH, 6e-4) || !near(num(m[2]), f.VIL, 6e-4)) fail('frame 1: VIH/VIL quoted as ' + (m && m.slice(1)) + ', the family has ' + f.VIH + ', ' + f.VIL);
    for (const [i, name, a, b] of [[2, 'NMH', f.VOH, f.VIH], [3, 'NML', f.VIL, f.VOL]]) {
      m = says[i].match(new RegExp(name + ' = \\w+ − \\w+ = ' + NUM + ' V − \\(?' + NUM + ' V\\)? = ' + NUM + ' V'));
      if (!m) { fail('frame ' + i + ': no ' + name + ' sum in: ' + says[i]); continue; }
      const [x, y, z] = m.slice(1, 4).map(num);
      if (!near(x - y, z, 1.1e-3)) fail('frame ' + i + ': ' + x + ' − ' + y + ' is not ' + z);
      if (!near(z, a - b, 6e-4) || !near(x, a, 6e-4) || !near(y, b, 6e-4)) fail('frame ' + i + ': ' + name + ' quoted ' + z + ', the family gives ' + (a - b));
    }
    const hi = f.VOH - n, lo = f.VOL + n;
    m = says[4].match(new RegExp('level, ' + NUM + ' V, picks up ' + NUM + ' V of noise downwards: it arrives at ' + NUM + ' V, which the input reads as (1|0|indeterminate)'));
    if (!m) fail('frame 4: not narrated as expected');
    else {
      if (!near(num(m[1]), f.VOH, 6e-4) || !near(num(m[3]), hi, 6e-4) || !near(num(m[2]), n, 6e-4)) fail('frame 4: arrives at ' + m[3] + ', should be ' + hi);
      if (m[4] !== reads(hi)) fail('frame 4: read as ' + m[4] + ', the levels give ' + reads(hi));
      if (/safely/.test(says[4]) !== (reads(hi) === '1')) fail('frame 4: "safely" does not match the reading');
    }
    m = says[5].match(new RegExp('A 0 at ' + NUM + ' V pushed up by ' + NUM + ' V arrives at ' + NUM + ' V: read as (1|0|indeterminate)\\. .*smaller margin, ' + NUM + ' V'));
    if (!m) fail('frame 5: not narrated as expected');
    else {
      if (!near(num(m[1]), f.VOL, 6e-4) || !near(num(m[2]), n, 6e-4) || !near(num(m[3]), lo, 6e-4)) fail('frame 5: arrives at ' + m[3] + ', should be ' + lo);
      if (m[4] !== reads(lo)) fail('frame 5: read as ' + m[4] + ', the levels give ' + reads(lo));
      if (!near(num(m[5]), Math.min(f.VOH - f.VIH, f.VIL - f.VOL), 6e-4)) fail('frame 5: the smaller margin is quoted as ' + m[5]);
    }
    const q = r.frames.find((x) => x.predict);
    if (q && q.predict.answer !== reads(hi)) fail('the prediction answers ' + q.predict.answer + ', the levels give ' + reads(hi));
  },

  'ic-vtc'({ input, r, fail }) {
    const { vdd, vt, ratio } = input, own = vtcOwn(vdd, vt, ratio), says = r.frames.map((x) => x.say);
    if (!says[0].startsWith('An inverter at VDD = ' + vdd + ' V, transistor thresholds ' + vt + ' V, ' + (ratio === 1 ? 'the pMOS as strong as the nMOS.' : 'the pMOS ' + ratio + ' times as strong as the nMOS (kp/kn = ' + ratio + ').'))) fail('frame 0: the inputs are quoted wrongly');
    for (let i = 0; i < 9; i++) {
      const m = says[i].match(i === 0 ? /Vin = (0)(): (.*)$/ : /^Vin = ([\d.]+) V: (.*?)(?:\. Vout = ([\d.]+) V)?\.$/);
      if (!m) { fail('frame ' + i + ': not narrated as expected: ' + says[i]); continue; }
      const vin = num(m[1]), text = (i === 0 ? m[3] : m[2]).replace(/\.$/, '');
      const nOff = vin <= vt, pOff = vin >= vdd - vt;
      if (/nMOS is off/.test(text) !== nOff || /pMOS is off/.test(text) !== (pOff && !nOff) || /both conduct/.test(text) !== (!nOff && !pOff)) fail('frame ' + i + ': the regions at Vin = ' + vin + ' are narrated wrongly: ' + text);
      if (nOff && !new RegExp('Vout = VDD = ' + vdd + ' V$').test(text)) fail('frame ' + i + ': Vout should be VDD = ' + vdd);
      if (pOff && !nOff && !/Vout = 0 V$/.test(text)) fail('frame ' + i + ': Vout should be 0 V');
      if (m[3] !== undefined && i > 0) {
        const want = voutOf(vin, vdd, vt, ratio);
        if (Math.abs(vin - own.VM) > 0.03 && !near(num(m[3]), want, 0.02)) fail('frame ' + i + ': Vout at ' + vin + ' V quoted as ' + m[3] + ', the square law gives ' + round(want, 3));
      }
    }
    let m = says[9].match(new RegExp('Vin = ' + NUM + ' V \\(VIL\\), where Vout = ' + NUM + ' V \\(VOH\\)\\. It last reaches −1 at Vin = ' + NUM + ' V \\(VIH\\), where Vout = ' + NUM + ' V \\(VOL\\)'));
    if (!m) fail('frame 9: not narrated as expected');
    const [VIL, VOH, VIH, VOL] = m ? m.slice(1, 5).map(num) : [0, 0, 0, 0];
    if (m) for (const [name, got, want] of [['VIL', VIL, own.VIL], ['VOH', VOH, own.VOH], ['VIH', VIH, own.VIH], ['VOL', VOL, own.VOL]]) if (!near(got, want, 0.03)) fail('frame 9: ' + name + ' quoted ' + got + ', the square law gives ' + round(want, 3));
    m = says[10].match(new RegExp('VM = ' + NUM + ' V \\(by formula ' + NUM + ' V, with √\\(kp/kn\\) = ' + NUM + '\\)'));
    if (!m || !near(num(m[1]), own.VM, 0.01) || !near(num(m[2]), own.VMf, 0.002) || !near(num(m[3]), own.r, 0.002)) fail('frame 10: VM quoted ' + (m && m.slice(1)) + ', worked out ' + [own.VM, own.VMf, own.r].map((x) => round(x, 3)));
    if (m && !(ratio === 1 ? near(num(m[1]), vdd / 2, 0.01) : ratio > 1 ? num(m[1]) > vdd / 2 : num(m[1]) < vdd / 2)) fail('frame 10: the threshold does not move the way the narration says');
    m = says[11].match(new RegExp('NMH = VOH − VIH = ' + NUM + ' V and NML = VIL − VOL = ' + NUM + ' V'));
    if (!m || !near(num(m[1]), VOH - VIH, 0.0015) || !near(num(m[2]), VIL - VOL, 0.0015)) fail('frame 11: margins ' + (m && m.slice(1)) + ' do not follow from the quoted levels');
    if (m && /Equal margins/.test(says[11]) !== (Math.abs(num(m[1]) - num(m[2])) <= 0.1)) fail('frame 11: equal/unequal does not match the margins');
    const q = r.frames.find((x) => x.predict);
    const at = Math.round(0.45 * vdd * 100) / 100;
    if (q && q.predict.answer !== (voutOf(at, vdd, vt, ratio) > vdd / 2 ? 'still near VDD' : 'already near 0')) fail('the prediction at 45% is wrong');
  },

  'ic-fanout'({ S, input, r, fail }) {
    const f = S.Cmos.family(input.fam), iil = Math.abs(f.IIL), iih = Math.abs(f.IIH), iol = f.IOL, ioh = Math.abs(f.IOH);
    const cur = (s) => [...s.matchAll(/([\d.]+) (mA|µA)/g)].map((x) => num(x[1]) / (x[2] === 'µA' ? 1000 : 1));
    const ok = (got, want) => Math.abs(got - want) <= Math.max(0.006, want * 0.002);
    const c0 = cur(r.frames[0].say);
    if (!ok(c0[0], iil) || !ok(c0[1], iih) || !ok(c0[2], iol) || !ok(c0[3], ioh)) fail('frame 0: currents ' + c0 + ', the family has ' + [iil, iih, iol, ioh]);
    const lowFan = Math.floor(iol / iil + 1e-9), highFan = Math.floor(ioh / iih + 1e-9);
    r.frames.forEach((fr, i) => {
      const m = fr.say.match(/^(\d+) loads?: /);
      if (!m) return;
      const k = +m[1], c = cur(fr.say);
      if (fr.counters.loads !== k) fail('frame ' + i + ': the counter shows ' + fr.counters.loads + ' loads, the text ' + k);
      if (!ok(c[0], k * iil) || !ok(c[1], k * iih)) fail('frame ' + i + ': ' + k + ' loads quoted ' + c.slice(0, 2) + ', worked out ' + [k * iil, k * iih]);
      const lowOver = k * iil > iol + 1e-9, highOver = k * iih > ioh + 1e-9;
      if (/Within both limits/.test(fr.say) !== (!lowOver && !highOver)) fail('frame ' + i + ': within/over is wrong for ' + k + ' loads');
      if (/low output would rise/.test(fr.say) !== lowOver || /high output would sag/.test(fr.say) !== highOver) fail('frame ' + i + ': the limits named as broken are wrong for ' + k + ' loads');
      if (lowOver && !fr.say.includes('above VOL = ' + f.VOL + ' V') || highOver && !fr.say.includes('below VOH = ' + f.VOH + ' V')) fail('frame ' + i + ': the level quoted is not the family\'s');
    });
    const last = r.frames[r.frames.length - 1].say, m = last.match(/= (\d+) and .* = (\d+): (\d+)\./), ops = cur(last);
    if (!ok(ops[0], iol) || !ok(ops[1], iil) || !ok(ops[2], ioh) || !ok(ops[3], iih)) fail('last frame: the currents divided are ' + ops.slice(0, 4));
    if (!m || +m[1] !== lowFan || +m[2] !== highFan || +m[3] !== Math.min(lowFan, highFan)) fail('last frame: fan-out ' + (m && m.slice(1)) + ', worked out ' + [lowFan, highFan]);
    const q = r.frames.find((x) => x.predict);
    if (q && q.predict.answer !== String(Math.min(lowFan, highFan))) fail('the prediction answers ' + q.predict.answer);
  },

  'ic-delay'({ S, input, r, fail }) {
    const [tPLH, tPHL] = S.Tech.presets[input.tech].gate.NOT, n = input.n, says = r.frames.map((x) => x.say);
    let m = says[0].match(/tPHL = ([\d.]+) ns .* tPLH = ([\d.]+) ns/);
    if (!m || num(m[1]) !== tPHL || num(m[2]) !== tPLH) fail('frame 0: delays ' + (m && m.slice(1)) + ', the preset has ' + [tPHL, tPLH]);
    let t = 60;
    for (let g = 1; g <= n; g++) {
      const fr = r.frames[g], rise = g % 2 === 1, d = rise ? tPHL : tPLH;
      m = fr.say.match(/^g(\d) sees its input (rise|fall) at ([\d.]+) ns and its output (falls|rises) at ([\d.]+) ns: (tPHL|tPLH) = ([\d.]+) ns\.$/);
      if (!m) { fail('frame ' + g + ': not narrated as expected: ' + fr.say); t += d; continue; }
      const want = [String(g), rise ? 'rise' : 'fall', t, rise ? 'falls' : 'rises', t + d, rise ? 'tPHL' : 'tPLH', d];
      const got = [m[1], m[2], num(m[3]), m[4], num(m[5]), m[6], num(m[7])];
      if (JSON.stringify(got) !== JSON.stringify(want)) fail('frame ' + g + ': narrated ' + got + ', worked out ' + want);
      // the drawn waveform of the gate's output must change at that time
      const net = g === n ? 'Y' : 'n' + g, w = fr.items.find((x) => x.kind === 'wave' && x.key.endsWith(':w:' + net));
      if (!w || !w.changes.some((c) => near(c[0], t + d, 0.01) && c[1] === (rise ? 0 : 1))) fail('frame ' + g + ': the waveform of ' + net + ' has no ' + (rise ? 'fall' : 'rise') + ' at ' + (t + d) + ' ns');
      t += d;
    }
    m = says[says.length - 1].match(/took ([\d.]+) ns to get through (\d+) gates?\..* = ([\d.]+) ns for this inverter/);
    if (!m || num(m[1]) !== t - 60 || +m[2] !== n || num(m[3]) !== (tPHL + tPLH) / 2) fail('last frame: ' + (m && m.slice(1)) + ', worked out ' + [t - 60, n, (tPHL + tPLH) / 2]);
    const q = r.frames.find((x) => x.predict);
    if (q && num(q.predict.answer) !== t - 60) fail('the prediction answers ' + q.predict.answer + ', worked out ' + (t - 60));
  },

  'ic-power'({ S, input, r, fail }) {
    const keys = ['TTL', 'LSTTL', 'STTL', 'ECL', 'CMOS4000', 'HC'], fam = Object.fromEntries(keys.map((k) => [k, S.Cmos.family(k)]));
    const swing = (k) => (k === 'ECL' ? 0.8 : k.includes('TTL') ? 3.5 : 5);
    const dyn = (k) => input.c * 1e-12 * swing(k) ** 2 * input.f * 1e6 * 1e3; // mW
    const says = r.frames.map((x) => x.say);
    const list = (s, unit) => Object.fromEntries([...s.matchAll(new RegExp('(' + keys.join('|') + ') ([\\d.]+) (' + unit + ')', 'g'))].map((x) => [x[1], num(x[2]) / (x[3] === 'µW' ? 1000 : 1)]));
    const st = list(says[0], 'mW|µW');
    for (const k of keys) if (!near(st[k], fam[k].power, Math.max(1e-5, fam[k].power * 0.01))) fail('frame 0: ' + k + ' static power quoted ' + st[k] + ' mW, the family has ' + fam[k].power);
    if (!says[1].startsWith('Now each output switches at ' + input.f + ' MHz into ' + input.c + ' pF.')) fail('frame 1: the rate and load are not the input');
    const m = says[1].match(/P = C·V²·f, ([\d.]+) mW for HC/);
    if (!m || !near(num(m[1]), dyn('HC'), 0.006)) fail('frame 1: HC dynamic power quoted ' + (m && m[1]) + ', C·V²·f gives ' + dyn('HC'));
    const hcWins = fam.HC.power + dyn('HC') < fam.TTL.power + dyn('TTL');
    if (/CMOS still wins/.test(says[1]) !== hcWins) fail('frame 1: which of HC and TTL uses less is wrong');
    const sp = list(says[2], 'pJ');
    const want = Object.fromEntries(keys.map((k) => [k, fam[k].tpd * (fam[k].power + dyn(k))]));
    for (const k of keys) if (!near(sp[k], want[k], 0.006)) fail('frame 2: ' + k + ' speed-power quoted ' + sp[k] + ' pJ, worked out ' + want[k]);
    const best = keys.reduce((a, b) => (want[b] < want[a] ? b : a));
    if (!new RegExp('Best here: ' + best + '\\.').test(says[2])) fail('frame 2: the best is ' + best);
    const cross = (fam.TTL.power - fam.HC.power) / (input.c * 1e-3 * (25 - 12.25));
    const c = says[3].match(/meet near ([\d.]+) MHz/);
    if (!c || !near(num(c[1]), cross, 0.006)) fail('frame 3: the crossing quoted ' + (c && c[1]) + ', worked out ' + cross);
    const q = r.frames.find((x) => x.predict);
    if (q && q.predict.answer !== (hcWins ? 'HC' : 'TTL')) fail('the prediction answers ' + q.predict.answer);
  },

  'ic-history'({ S, r, fail }) {
    r.frames.forEach((fr, i) => {
      let m = fr.say.match(/^RTL NOR, A = (\d), B = (\d): (.*)$/);
      if (m) {
        const a = +m[1], b = +m[2], y = a || b ? 0 : 1;
        if (!new RegExp('Y = ' + y + '\\.').test(m[3])) fail('frame ' + i + ': RTL NOR of ' + a + b + ' should give ' + y);
        const who = a && b ? 'both transistors saturate and pull ' : a ? 'Q1 saturates and pulls ' : b ? 'Q2 saturates and pulls ' : 'neither transistor conducts';
        if (!m[3].startsWith(who)) fail('frame ' + i + ': the transistors that conduct are named wrongly: ' + m[3]);
      }
      m = fr.say.match(/(?:DTL NAND, )?A = (\d), B = (\d): .*P = (\d).*Y = (\d)/);
      if (m && !/^RTL NOR/.test(fr.say)) { const p = +m[1] && +m[2] ? 1 : 0; if (+m[3] !== p || +m[4] !== 1 - p) fail('frame ' + i + ': DTL NAND gives P = ' + p + ', Y = ' + (1 - p)); }
      m = fr.say.match(/(Standard TTL \(74\)|ECL \(10K\)): NMH = (\S+) V, NML = (\S+) V, fan-out (\d+), tpd ([\d.]+) ns, ([\d.]+) mW/);
      if (m) {
        const f = S.Cmos.family(/ECL/.test(m[1]) ? 'ECL' : 'TTL');
        if (!near(num(m[2]), f.VOH - f.VIH, 6e-4) || !near(num(m[3]), f.VIL - f.VOL, 6e-4) || +m[4] !== f.fanout || num(m[5]) !== f.tpd || num(m[6]) !== f.power) fail('frame ' + i + ': ' + m[1] + ' figures ' + m.slice(2) + ' do not match the family');
      }
      if (fr.predict) { const nx = r.frames[i + 1].say.match(/Y = (\d)/); if (!nx || nx[1] !== fr.predict.answer) fail('frame ' + i + ': the prediction answers ' + fr.predict.answer); }
    });
  },

  'ic-ttl-out'({ S, input, r, fail }) {
    const f = S.Cmos.family('TTL'), says = r.frames.map((x) => x.say);
    if (input.mode === 'totem') {
      if (!/A = 0: Q4 conducts and Q3 is off/.test(says[0]) || !/^A = 1: Q3 conducts and Q4 is off/.test(says[1])) fail('the totem-pole transistors are named wrongly');
      if (!new RegExp('Y = 1, about ' + f.VOH + ' V').test(says[0]) || !new RegExp('Y = 0, at most ' + f.VOL + ' V').test(says[1])) fail('the totem-pole levels do not match the TTL family');
    }
    if (input.mode === 'fight') {
      const m = says[1].match(/\(([\d.]+) − ([\d.]+) − ([\d.]+) − ([\d.]+)\) V \/ (\d+) Ω = (\d+) mA/);
      if (!m || Math.round((num(m[1]) - num(m[2]) - num(m[3]) - num(m[4])) / num(m[5]) * 1000) !== +m[6]) fail('the fight current does not add up');
    }
    if (input.mode === 'oc') r.frames.forEach((fr, i) => {
      const m = fr.say.match(/^Outputs ([01]), ([01]), ([01]): (.*)$/);
      if (!m) return;
      const v = [+m[1], +m[2], +m[3]], y = v.every((x) => x) ? 1 : 0;
      if (!new RegExp('Y = ' + y + '[.,]').test(m[4])) fail('frame ' + i + ': a wired AND of ' + v + ' gives ' + y);
      const low = v.map((x, k) => (x ? null : k + 1)).filter(Boolean);
      if (low.length && !m[4].startsWith('output ' + low.join(' and ') + ' pull')) fail('frame ' + i + ': the outputs pulling low are named wrongly');
    });
    if (input.mode === 'tri') {
      const states = [{ en: [1, 0, 0], a: [0, 1, 1] }, { en: [0, 1, 0], a: [0, 1, 1] }, { en: [0, 0, 0], a: [0, 1, 1] }, { en: [1, 1, 0], a: [1, 0, 1] }];
      states.forEach((s, i) => {
        const drv = s.en.map((e, k) => (e ? 1 - s.a[k] : null)).filter((x) => x !== null);
        const v = !drv.length ? 'Z' : drv.every((x) => x === drv[0]) ? String(drv[0]) : 'X';
        const say = says[i];
        if (v === 'Z' ? !/floats \(Z\)/.test(say) : v === 'X' ? !/Y = X/.test(say) : !new RegExp('Only output ' + (s.en.indexOf(1) + 1) + ' is enabled; it drives the bus to ' + v).test(say)) fail('frame ' + i + ': the bus should be ' + v + ': ' + say);
      });
    }
  },

  'ic-ecl'({ S, r, fail }) {
    const e = S.Cmos.family('ECL');
    if (!/VBB = −1\.29 V .* A logic 1 is about −0\.9 V, a 0 about −1\.75 V\./.test(r.frames[0].say)) fail('frame 0: the ECL levels are quoted wrongly');
    r.frames.forEach((fr, i) => {
      const m = fr.say.match(/^A = (\d) \((−?[\d.]+) V\), B = (\d) \((−?[\d.]+) V\): (.*)$/);
      if (m) {
        const a = +m[1], b = +m[3], or = a | b;
        if (num(m[2]) !== (a ? -0.9 : -1.75) || num(m[4]) !== (b ? -0.9 : -1.75)) fail('frame ' + i + ': input voltages are wrong');
        if (!new RegExp('OR = ' + or).test(m[5]) || !new RegExp('NOR = ' + (1 - or)).test(m[5])) fail('frame ' + i + ': OR/NOR should be ' + or + '/' + (1 - or));
        const via = a && b ? 'by way of QA and QB together' : a ? 'by way of QA\\.' : b ? 'by way of QB\\.' : 'QR takes the whole current';
        if (!new RegExp(via).test(m[5])) fail('frame ' + i + ': the current path is named wrongly');
        if (fr.predict) { const nx = r.frames[i + 1].say.match(/^A = (\d) .*?, B = (\d) /); if (!nx || fr.predict.answer !== (+nx[1] || +nx[2] ? 'through QA or QB (left)' : 'through QR (right)')) fail('frame ' + i + ': the prediction is wrong'); }
      }
    });
    const last = r.frames[r.frames.length - 1].say, m = last.match(/swing is only ([\d.]+) V.*margins \(([\d.]+) V, ([\d.]+) V\)/);
    if (!m || !near(num(m[1]), 0.85, 1e-9) || !near(num(m[2]), e.VOH - e.VIH, 6e-4) || !near(num(m[3]), e.VIL - e.VOL, 6e-4)) fail('last frame: ' + (m && m.slice(1)) + ' do not match the ECL family');
  },

  'ic-interface'({ S, input, r, fail }) {
    const [dk, lk] = input.pair.split('>'), d = S.Cmos.family(dk), l = S.Cmos.family(lk), says = r.frames.map((x) => x.say);
    let m = says[0].match(new RegExp('VOH ' + NUM + ' V, VOL ' + NUM + ' V\\); on the right what the load needs \\(VIH ' + NUM + ' V, VIL ' + NUM + ' V'));
    if (!m || ![d.VOH, d.VOL, l.VIH, l.VIL].every((v, k) => near(num(m[k + 1]), v, 6e-4))) fail('frame 0: levels ' + (m && m.slice(1)) + ' do not match the families');
    const hi = d.VOH - l.VIH, lo = l.VIL - d.VOL, ok = hi >= 0 && lo >= 0;
    m = says[1].match(new RegExp('VOH − VIH = ' + NUM + ' V, low margin VIL − VOL = ' + NUM + ' V'));
    if (!m || !near(num(m[1]), hi, 6e-4) || !near(num(m[2]), lo, 6e-4)) fail('frame 1: margins ' + (m && m.slice(1)) + ', worked out ' + [hi, lo]);
    if (/Both are positive/.test(says[1]) !== ok) fail('frame 1: says the pair ' + (ok ? 'fails' : 'works'));
    if (!ok && !/ECL/.test(input.pair)) {
      m = says[2].match(new RegExp('[Hh]igh margin ' + NUM + ' V, low margin ' + NUM + ' V'));
      if (!m || !near(num(m[1]), hi, 6e-4) || !near(num(m[2]), lo, 6e-4)) fail('frame 2: margins ' + (m && m.slice(1)) + ', worked out ' + [hi, lo]);
      if (hi < 0 && !new RegExp('high output \\(' + d.VOH + ' V\\) does not reach the input.s VIH \\(' + l.VIH + ' V\\)').test(says[2])) fail('frame 2: the levels that fail are quoted wrongly');
    }
    if (ok) {
      const a = d.IOL / Math.abs(l.IIL), b = Math.abs(d.IOH) / Math.abs(l.IIH), n = Math.floor(Math.min(a, b) + 1e-9);
      m = says[2].match(/IOL\/\|IIL\| = ([\d.]+)\/([\d.]+) = ([\d.]+) and \|IOH\|\/IIH = ([\d.]+)\/([\d.]+) = ([\d.]+), so (\d+) loads by current/);
      if (m && ![d.IOL, Math.abs(l.IIL), Math.abs(d.IOH), Math.abs(l.IIH)].every((v, k) => near(num(m[[1, 2, 4, 5][k]]), v, 1e-9))) fail('frame 2: the currents divided are wrong');
      if (m) m = [m[0], m[3], m[6], m[7]];
      if (!m || !near(num(m[1]), a, 0.006) || !near(num(m[2]), b, 0.006) || +m[3] !== n) fail('frame 2: fan-out ' + (m && m.slice(1)) + ', worked out ' + [a, b, n]);
      const cap = /HC/.test(lk) ? Math.min(n, 50) : n;
      if (cap < n && !new RegExp('about ' + cap + ' in practice').test(says[2])) fail('frame 2: the practical limit of ' + cap + ' is not given');
    }
    const q = r.frames.find((x) => x.predict);
    if (q && q.predict.answer !== (ok ? 'yes' : 'no')) fail('the prediction answers ' + q.predict.answer);
  },
};

// the four switch-level topics share one walk over their rows
function switchRows({ S, input, r, fail }, net, opts) {
  let prev = {};
  const order = opts.order || combos(net).map((_, m) => m);
  const rows = r.frames.map((fr, i) => [fr, i]).filter(([fr]) => new RegExp('^' + net.inputs[0] + ' = [01](, |:)').test(fr.say));
  if (rows.length !== (opts.count || order.length)) fail('narrates ' + rows.length + ' rows, expected ' + (opts.count || order.length));
  const evs = [];
  rows.forEach(([fr, i], j) => {
    const iv = Object.fromEntries(fr.say.split(':')[0].split(', ').map((x) => x.split(' = ')).map(([k, v]) => [k, +v]));
    if (!opts.count && combos(net)[order[j]] && JSON.stringify(iv) !== JSON.stringify(combos(net)[order[j]])) fail('frame ' + i + ': rows out of order');
    const ev = evalNet(net, iv, opts.carry ? prev : {});
    checkRow(fr.say, net, iv, ev, fail, 'frame ' + i);
    if (opts.extra) opts.extra(fr.say, iv, ev, i);
    if (opts.carry) prev = heldOf(ev);
    evs.push([i, ev, iv]);
  });
  // a prediction is answered by the next row
  evs.forEach(([i, , iv], j) => {
    const fr = r.frames[i];
    if (!fr.predict || !evs[j + 1]) return;
    const y = evs[j + 1][1].nodes.Y, ans = fr.predict.answer;
    if (Array.isArray(ans)) { for (const k of ans) if (!evs[j + 1][1].on.includes(k.replace('cm:t:', ''))) fail('frame ' + i + ': the transistor to click, ' + k + ', does not conduct'); return; }
    const want = opts.kind ? (y.s === 'conflict' ? 'both networks conduct: a short' : y.s === 'driven' ? 'Y is driven to ' + y.v : 'neither conducts: Y floats') : y.s === 'driven' ? String(y.v) : 'Z (cut off)';
    if (ans !== want && !(want === 'Y is driven to ' + y.v && ans === want)) fail('frame ' + i + ': the prediction answers ' + ans + ', the next row gives ' + want);
  });
  return evs;
}
const cmosChecks = {
  'cmos-gates'(ctx) {
    const { S, input, r, fail } = ctx;
    const B = { inverter: () => S.Cmos.cells.inverter(), nand2: () => S.Cmos.cells.nand(2), nor2: () => S.Cmos.cells.nor(2), nand3: () => S.Cmos.cells.nand(3), nor3: () => S.Cmos.cells.nor(3) };
    const net = B[input.cell]().net;
    const k = input.cell === 'inverter' ? 1 : +input.cell.slice(-1);
    if (!new RegExp(': ' + 2 * k + ' transistors\\.').test(r.frames[0].say)) fail('frame 0: should have ' + 2 * k + ' transistors');
    if (input.cell === 'inverter' && (!/pulled down when A = 1\./.test(r.frames[1].say) || !/pulled up when A = 0\./.test(r.frames[2].say))) fail('frames 1, 2: the switches of the inverter are described wrongly');
    if (input.cell !== 'inverter') {
      const nand = input.cell.startsWith('nand');
      if (/In series/.test(r.frames[1].say) !== nand || /In parallel/.test(r.frames[2].say) !== nand) fail('frames 1, 2: series and parallel are swapped');
    }
    const evs = switchRows(ctx, net, {});
    for (const [i, ev, iv] of evs) {
      const v = Object.values(iv), want = input.cell === 'inverter' ? 1 - v[0] : input.cell.startsWith('nand') ? +!v.every((x) => x) : +!v.some((x) => x);
      if (ev.nodes.Y.v !== want) fail('frame ' + i + ': the gate gives ' + want + ', the switches ' + ev.nodes.Y.v);
    }
  },
  'cmos-complex'(ctx) {
    const { S, input, r, fail } = ctx;
    const cell = S.Cmos.fromExpression(String(input.f)), net = cell.net, ast = S.Bool.parse(String(input.f));
    const inner = ast.op === 'not' ? ast.a : ast, stages = ast.op === 'not' ? 1 : 2;
    const lits = [], negs = new Set();
    (function walk(e) { if (e.op === 'var') lits.push(e.name); else if (e.op === 'not' && e.a.op === 'var') { lits.push(e.a.name); negs.add(e.a.name); } else (e.args || [e.a]).forEach(walk); })(inner);
    const count = 2 * lits.length + 2 * negs.size + (stages === 2 ? 2 : 0);
    if (!new RegExp(' ' + count + ' transistors in all\\.').test(r.frames[0].say)) fail('frame 0: two per literal plus inverters gives ' + count + ': ' + r.frames[0].say);
    const all = combos(net), order = all.length <= 8 ? all.map((_, m) => m) : [0, 3, 5, 6, 9, 12, 15];
    const evs = switchRows(ctx, net, { order, count: order.length });
    for (const [i, ev, iv] of evs) { const want = S.Bool.evaluate(ast, iv) ? 1 : 0; if (ev.nodes.Y.v !== want || ev.nodes.Y.s !== 'driven') fail('frame ' + i + ': the expression gives ' + want + ', the switches ' + ev.nodes.Y.v); }
    const good = all.every((iv) => { const y = evalNet(net, iv, {}).nodes.Y; return y.s === 'driven' && y.v === (S.Bool.evaluate(ast, iv) ? 1 : 0); });
    if (/^Checked on all \d+ inputs/.test(r.frames[r.frames.length - 1].say) !== good) fail('last frame: the overall check is narrated wrongly');
  },
  'cmos-broken'(ctx) {
    const { S, input, r, fail } = ctx;
    const mk = {
      series: () => { const n = S.Cmos.network('x', { inputs: ['A', 'B'], outputs: ['Y'] }); n.n('A', 'Y', 'n1', 'M1'); n.n('B', 'n1', 'GND', 'M2'); n.p('A', 'VDD', 'n2', 'M3'); n.p('B', 'n2', 'Y', 'M4'); return n; },
      parallel: () => { const n = S.Cmos.network('x', { inputs: ['A', 'B'], outputs: ['Y'] }); n.n('A', 'Y', 'GND', 'M1'); n.n('B', 'Y', 'GND', 'M2'); n.p('A', 'VDD', 'Y', 'M3'); n.p('B', 'VDD', 'Y', 'M4'); return n; },
      missing: () => { const n = S.Cmos.network('x', { inputs: ['A', 'B'], outputs: ['Y'] }); n.n('A', 'Y', 'n1', 'M1'); n.n('B', 'n1', 'GND', 'M2'); n.p('A', 'VDD', 'Y', 'M3'); return n; },
    }[input.net]();
    const evs = switchRows(ctx, mk, { order: [0, 1, 3, 2], carry: true, kind: true });
    const bad = evs.filter(([, ev]) => ev.nodes.Y.s !== 'driven').length;
    // the summary lists, for a fresh gate, the rows where the output is not driven
    const fresh = combos(mk).map((iv) => [iv, evalNet(mk, iv, {}).nodes.Y]).filter(([, y]) => y.s !== 'driven');
    const said = [...r.frames[r.frames.length - 1].say.matchAll(/With A = (\d), B = (\d) (neither|both)/g)].map((x) => x[1] + x[2] + x[3]);
    const want = fresh.map(([iv, y]) => '' + iv.A + iv.B + (y.s === 'conflict' ? 'both' : 'neither'));
    if (said.sort().join() !== want.sort().join()) fail('last frame: the failing rows are ' + want + ', the narration lists ' + said);
    if (r.frames[r.frames.length - 1].counters.bad !== bad) fail('the bad-row counter shows ' + r.frames[r.frames.length - 1].counters.bad + ', worked out ' + bad);
  },
  'cmos-tgate'(ctx) {
    const { S, input, r, fail } = ctx;
    const net = { tgate: () => S.Cmos.cells.tgate(), tgmux: () => S.Cmos.cells.tgmux(), tristate: () => S.Cmos.cells.tristate() }[input.cell]().net;
    if (!new RegExp(' ' + net.transistors.length + ' transistors, ').test(r.frames[0].say)) fail('frame 0: the transistor count is wrong');
    const intro = { tgate: /both conduct when C = 1, neither when C = 0\./, tgmux: /the one from A conducts while S = 0, the one from B while S = 1\./, tristate: /cut off while EN = 0\./ }[input.cell];
    if (!intro.test(r.frames[0].say)) fail('frame 0: the control is described wrongly');
    const end = r.frames[r.frames.length - 1].say;
    if (input.cell === 'tgmux' && !new RegExp('in ' + net.transistors.length + ' transistors').test(end)) fail('last frame: the transistor count is wrong');
    if (input.cell === 'tgate' && !/closed \(C = 1\)/.test(end)) fail('last frame: the closed state is C = 1');
    switchRows(ctx, net, {
      extra(say, iv, ev, i) {
        const y = ev.nodes.Y;
        if (input.cell === 'tgmux') { const w = iv.S ? iv.B : iv.A; if (!new RegExp('so Y = ' + (iv.S ? 'B' : 'A') + ' = ' + w + '\\.').test(say) || y.v !== w) fail('frame ' + i + ': the multiplexer should give ' + w); }
        if (input.cell === 'tristate' && iv.EN && (!new RegExp('Y = A′ = ' + (1 - iv.A) + '\\.').test(say) || y.v !== 1 - iv.A)) fail('frame ' + i + ': the enabled inverter should give ' + (1 - iv.A));
        if (input.cell === 'tgate' && iv.C && y.v !== iv.A) fail('frame ' + i + ': the closed gate should pass A = ' + iv.A);
      },
    });
  },
};
Object.assign(checks, cmosChecks);

const fams = ['TTL', 'LSTTL', 'HC', 'HCT', 'CMOS4000', 'ECL'];
const pairsOf = (rnd) => { const all = ['00', '01', '10', '11']; const k = 1 + Math.floor(rnd() * 4); return Array.from({ length: k }, () => pick(all, rnd)).join(' '); };
export default {
  family: /^p11-/,
  extra: {
    'ic-levels': fams.flatMap((fam) => [0, 0.1, 0.4, 0.5, 1.4, 1.6, 3].map((noise) => ({ fam, noise }))),
    'ic-fanout': ['TTL', 'LSTTL', 'HC', 'ALSTTL', 'STTL'].flatMap((fam) => [1, 5, 8, 9, 10, 11, 20, 21, 24].map((n) => ({ fam, n }))),
    'ic-delay': ['TTL', 'LS-TTL', 'CMOS'].flatMap((tech) => [1, 2, 3, 4, 5].map((n) => ({ tech, n }))),
    'ic-power': [[0, 1], [0.1, 1], [1, 100], [52, 15], [100, 100]].map(([f, c]) => ({ f, c })),
    'ic-ecl': ['00', '11', '01 10', '11 00 10 01'].map((ab) => ({ ab })),
    'ic-history': ['00', '11', '01', '01 10', '11 00 10 01'].map((ab) => ({ ab })),
    'cmos-complex': ["(A + B)'", "(ABC)'", "(AB + CD)'", "((A + B)C + D)'", "A'", "(A'B' + C)'", "A + B", "(A + B')(C + D)", "(A(B + C) + D)'", "(AB + A'C)'"].map((f) => ({ f })),
  },
  random: {
    'ic-levels': (rnd) => ({ fam: pick(fams, rnd), noise: round(rnd() * 3, 2) }),
    'ic-vtc': (rnd) => ({ ratio: pick([0.1, 0.25, 0.5, 1, 2, 4, 10, round(0.1 + rnd() * 9.9, 2)], rnd), vdd: round(1.5 + rnd() * 4.5, 1), vt: round(0.2 + rnd() * 0.6, 2) }),
    'ic-fanout': (rnd) => ({ fam: pick(['TTL', 'LSTTL', 'HC', 'ALSTTL', 'STTL'], rnd), n: 1 + Math.floor(rnd() * 24) }),
    'ic-power': (rnd) => ({ f: round(rnd() * 100, 1), c: 1 + Math.floor(rnd() * 100) }),
    'ic-history': (rnd) => ({ ab: pairsOf(rnd) }),
    'ic-ecl': (rnd) => ({ ab: pairsOf(rnd) }),
  },
  check(ctx) {
    const c = checks[ctx.tp.id];
    if (!c) { ctx.fail('no claim check for this topic'); return; }
    c(ctx);
    ctx.pass();
  },
};
