// Tests of the simulator (Sirkit.Sim), the parts library (Sirkit.Parts), the 74-series chips, the technology
// presets, static timing analysis and VCD export: node tests/sim.mjs
// Every combinational part is checked against its truth table (exhaustively, or on a large random sample
// when there are too many rows); storage parts against reference models over random stimulus; then glitches
// and hazards, inertial delay, setup and hold, metastability, the ring oscillator, contention and floating
// inputs, rewind, critical paths, the chips' function tables, and every demo circuit. Ends with a speed run.
import { load, harness, rng } from './load.mjs';

const S = load(['core', 'schematic', 'demo']);
const { Sim, Parts: P, Values: V, Tech: T, Netlist: N, Demo: D } = S;
const t = harness('sim');
const R = rng(20261018);
const quiet = { log: false, record: [] };
const norm = (g) => {
  if (!Array.isArray(g)) return g;
  if (g.every((b) => b === 'Z')) return 'Z';
  if (g.every((b) => b === 'X')) return 'X';
  const n = V.toNum(g);
  return n === null ? V.str(g) : n;
};
const bit = (v, i) => Math.floor(v / 2 ** i) % 2;

// ---- values ---------------------------------------------------------------------------------------------------
{
  for (let w = 1; w <= 32; w += 3) for (let k = 0; k < 20; k++) {
    const n = Math.floor(R() * 2 ** w), [a, b] = V.fromPub(n, w);
    t.eq([a, b], [n, 0], 'fromPub number w=' + w);
    t.eq(V.toNum(V.toPub(a, b, w)), w === 1 ? n : n, 'toPub/toNum w=' + w);
  }
  t.eq(V.toPub(...V.fromPub('01XZ', 4), 4), ['Z', 'X', 1, 0], 'bit string is MSB first');
  t.eq(V.str(['Z', 'X', 1, 0]), '01XZ', 'str');
  t.eq(V.str(V.fromNum(0xA5, 8), 'hex'), 'A5', 'hex');
  t.eq(V.str([1, 0, 0, 0, 'X', 0, 0, 0], 'hex'), 'X1', 'hex with X');
  const four = [0, 1, 'X', 'Z'];
  const ref2 = (g, x, y) => {
    const k = (v) => (v === 0 || v === 1 ? v : 'X');
    const a = k(x), b = k(y);
    let r;
    if (g === 'AND' || g === 'NAND') r = a === 0 || b === 0 ? 0 : a === 'X' || b === 'X' ? 'X' : 1;
    if (g === 'OR' || g === 'NOR') r = a === 1 || b === 1 ? 1 : a === 'X' || b === 'X' ? 'X' : 0;
    if (g === 'XOR' || g === 'XNOR') r = a === 'X' || b === 'X' ? 'X' : a ^ b;
    return g.startsWith('N') || g === 'XNOR' ? (r === 'X' ? 'X' : 1 - r) : r;
  };
  for (const g of ['AND', 'OR', 'NAND', 'NOR', 'XOR', 'XNOR']) for (const x of four) for (const y of four) t.eq(V.gate(g, [x, y]), ref2(g, x, y), 'four-state ' + g + ' ' + x + ' ' + y);
}

// ---- combinational parts against truth tables -------------------------------------------------------------------
function comb(type, params, ref, o) {
  o = o || {};
  const c = P.testCircuit(type, params), dut = c.byId.get('dut');
  const ins = dut.pins.filter((q) => q.dir === 'in' && !q.power), outs = dut.pins.filter((q) => q.dir === 'out');
  const sim = Sim.create(c, Object.assign({ tech: o.tech || 'CMOS' }, quiet, o.sim || {}));
  const power = dut.pins.some((q) => q.power);
  if (power) { sim.set('VCC', 1); sim.set('GND', 0); }
  const total = ins.reduce((s, q) => s + q.width, 0), rows = 2 ** total, limit = o.max || 4096;
  const list = rows <= limit ? [...Array(rows).keys()] : Array.from({ length: limit }, () => Math.floor(R() * rows));
  let n = 0;
  for (const v of list) {
    const env = {};
    let sh = 0;
    for (const q of ins) { env[q.name] = Math.floor(v / 2 ** sh) % 2 ** q.width; sh += q.width; sim.set(q.name, env[q.name]); }
    sim.settle();
    const want = ref(env);
    for (const q of outs) {
      if (!(q.name in want)) continue;
      t.eq(norm(sim.get(q.name)), want[q.name], type + ' ' + JSON.stringify(params) + ' ' + JSON.stringify(env) + ' ' + q.name);
      n++;
    }
  }
  if (power) {
    // without power the outputs float
    sim.set('VCC', 'Z'); sim.settle();
    for (const q of outs) if (!q.rd) t.eq(norm(sim.get(q.name)), 'Z', type + ' unpowered ' + q.name);
    t.ok(sim.violations.some((x) => x.kind === 'power'), type + ' reports missing power');
  }
  return n;
}
const G = {
  NOT: (a) => 1 - a[0], BUF: (a) => a[0], AND: (a) => +a.every(Boolean), OR: (a) => +a.some(Boolean),
  NAND: (a) => 1 - a.every(Boolean), NOR: (a) => 1 - a.some(Boolean), XOR: (a) => a.reduce((x, y) => x ^ y, 0), XNOR: (a) => 1 - a.reduce((x, y) => x ^ y, 0),
};
for (const g of Object.keys(G)) {
  const ns = g === 'NOT' || g === 'BUF' ? [1] : [2, 3, 4, 5, 6];
  for (const n of ns) {
    const ins = (e) => [...Array(n).keys()].map((i) => e['i' + i]);
    comb(g, n > 1 ? { n } : {}, (e) => ({ y: G[g](ins(e)) }));
    if (n <= 3) {
      comb(g, Object.assign(n > 1 ? { n } : {}, { out: 'oc' }), (e) => ({ y: G[g](ins(e)) ? 'Z' : 0 }));
      for (const oeLow of [false, true]) comb(g, Object.assign(n > 1 ? { n } : {}, { out: 'tri', oeLow }), (e) => ({ y: e.oe ^ oeLow ? G[g](ins(e)) : 'Z' }));
    }
  }
}
for (const w of [1, 3]) for (const enLow of [false, true]) for (const invert of [false, true]) {
  comb('TRI', { w, enLow, invert }, (e) => ({ y: e.en ^ enLow ? (invert ? ~e.a & (2 ** w - 1) : e.a) : 'Z' }));
}
for (const n of [2, 3, 4, 5, 8]) for (const w of [1, 2]) for (const selBus of [false, true]) for (const en of [false, true]) {
  const k = Math.max(1, Math.ceil(Math.log2(n)));
  const enLows = en ? [false, true] : [false];
  for (const enLow of enLows) comb('MUX', { n, w, selBus, en, enLow }, (e) => {
    const s = selBus ? e.s : [...Array(k).keys()].reduce((v, i) => v + e['s' + i] * 2 ** i, 0);
    if (en && !(e.en ^ enLow)) return { y: 0 };
    return { y: s < n ? e['d' + s] : 0 };
  }, { max: 2048 });
}
for (const n of [2, 4, 8]) for (const w of [1, 2]) for (const en of [false, true]) {
  const k = Math.ceil(Math.log2(n));
  comb('DEMUX', { n, w, en, selBus: n === 8 }, (e) => {
    const s = n === 8 ? e.s : [...Array(k).keys()].reduce((v, i) => v + e['s' + i] * 2 ** i, 0), out = {};
    for (let i = 0; i < n; i++) out['y' + i] = (!en || e.en) && s === i ? e.d : 0;
    return out;
  });
}
for (const k of [1, 2, 3, 4]) for (const en of [false, true]) for (const enLow of [false, true]) for (const activeLow of [false, true]) {
  if (!en && enLow) continue;
  comb('DECODER', { k, en, enLow, activeLow }, (e) => {
    const a = [...Array(k).keys()].reduce((v, i) => v + e['a' + i] * 2 ** i, 0), on = !en || e.en ^ enLow, out = {};
    for (let i = 0; i < 1 << k; i++) { const y = on && a === i ? 1 : 0; out['y' + i] = activeLow ? 1 - y : y; }
    return out;
  });
}
for (const n of [2, 4, 8]) for (const valid of [false, true]) comb('ENCODER', { n, valid }, (e) => {
  let code = 0, any = 0;
  for (let i = 0; i < n; i++) if (e['d' + i]) { code |= i; any = 1; }
  const out = { v: any };
  for (let j = 0; j < Math.ceil(Math.log2(n)); j++) out['y' + j] = (code >> j) & 1;
  return out;
});
for (const n of [2, 3, 4, 6, 8, 10]) comb('PRIENC', { n }, (e) => {
  let code = -1;
  for (let i = n - 1; i >= 0; i--) if (e['d' + i]) { code = i; break; }
  const out = { v: code >= 0 ? 1 : 0 };
  for (let j = 0; j < Math.max(1, Math.ceil(Math.log2(n))); j++) out['y' + j] = code < 0 ? 0 : (code >> j) & 1;
  return out;
});
comb('HA', {}, (e) => ({ s: e.a ^ e.b, c: e.a & e.b }));
comb('FA', {}, (e) => ({ s: e.a ^ e.b ^ e.cin, cout: +(e.a + e.b + e.cin >= 2) }));
const sgn = (v, w) => (v >= 2 ** (w - 1) ? v - 2 ** w : v);
const ovf = (x, w) => +(x < -(2 ** (w - 1)) || x > 2 ** (w - 1) - 1);
for (const w of [1, 2, 3, 4, 5]) for (const cin of [false, true]) comb('ADDER', { w, cin, ov: true }, (e) => {
  const r = e.a + e.b + (cin ? e.cin : 0);
  return { s: r % 2 ** w, cout: +(r >= 2 ** w), v: ovf(sgn(e.a, w) + sgn(e.b, w) + (cin ? e.cin : 0), w) };
});
for (const w of [1, 2, 3, 4, 5]) comb('ADDSUB', { w }, (e) => {
  const m = 2 ** w, b = e.m ? m - 1 - e.b : e.b, r = e.a + b + e.m;
  return { s: r % m, cout: +(r >= m), v: e.m ? ovf(sgn(e.a, w) - sgn(e.b, w), w) : ovf(sgn(e.a, w) + sgn(e.b, w), w) };
});
for (const w of [1, 2, 3, 4]) for (const signed of [false, true]) comb('CMP', { w, signed }, (e) => {
  const a = signed ? sgn(e.a, w) : e.a, b = signed ? sgn(e.b, w) : e.b;
  return { lt: +(a < b), eq: +(a === b), gt: +(a > b) };
});
{
  const w = 3, m = 8;
  const ref = {
    ADD: (a, b) => [(a + b) % m, +(a + b >= m), ovf(sgn(a, w) + sgn(b, w), w)],
    SUB: (a, b) => [(a - b + m) % m, +(a >= b), ovf(sgn(a, w) - sgn(b, w), w)],
    AND: (a, b) => [a & b, 0, 0], OR: (a, b) => [a | b, 0, 0], XOR: (a, b) => [a ^ b, 0, 0], NOT: (a) => [7 - a, 0, 0],
    SHL: (a) => [(a * 2) % m, a >> 2, 0], SHR: (a) => [a >> 1, a & 1, 0],
    INC: (a) => [(a + 1) % m, +(a === 7), ovf(sgn(a, w) + 1, w)], DEC: (a) => [(a + 7) % m, +(a >= 1), ovf(sgn(a, w) - 1, w)],
    NEG: (a) => [(m - a) % m, +(a === 0), ovf(-sgn(a, w), w)], NOR: (a, b) => [7 - (a | b), 0, 0], NAND: (a, b) => [7 - (a & b), 0, 0], XNOR: (a, b) => [7 - (a ^ b), 0, 0],
    PASSA: (a) => [a, 0, 0], PASSB: (a, b) => [b, 0, 0], MUL: (a, b) => [(a * b) % m, 0, 0], ZERO: () => [0, 0, 0], SLT: (a, b) => [+(a < b), 0, 0], ASR: (a) => [(a >> 1) | (a & 4), a & 1, 0],
  };
  const lists = { 2: ['ADD', 'SUB', 'AND', 'OR'], 3: ['ADD', 'SUB', 'AND', 'OR', 'XOR', 'NOT', 'SHL', 'SHR'], 4: ['ADD', 'SUB', 'AND', 'OR', 'XOR', 'NOT', 'SHL', 'SHR', 'INC', 'DEC', 'NEG', 'NOR', 'NAND', 'XNOR', 'PASSA', 'PASSB'] };
  for (const opw of [2, 3, 4]) comb('ALU', { w, opw, flags: true }, (e) => {
    const [y, c, v] = ref[lists[opw][e.op]](e.a, e.b);
    return { y, z: +(y === 0), c, v, n: y >> 2 };
  });
  comb('ALU', { w, opw: 3, ops: 'mul, zero, slt, asr, passb' }, (e) => (e.op < 5 ? { y: ref[['MUL', 'ZERO', 'SLT', 'ASR', 'PASSB'][e.op]](e.a, e.b)[0] } : { y: 0 }));
}
for (const w of [1, 2, 3, 4, 5]) comb('MUL', { w }, (e) => ({ p: e.a * e.b }));
{
  const data = [0x3, 0xA, 0x5, 0xF, 0x0, 0x9, 0xC, 0x6];
  for (const cs of [false, true]) for (const oe of [false, true]) comb('ROM', { aw: 3, dw: 4, cs, oe, data: data.map((x) => x.toString(16)).join(' ') }, (e) => ({ d: (cs && !e.cs) || (oe && !e.oe) ? 'Z' : data[e.a] }));
}
comb('SPLIT', { w: 8, sizes: '3,1,4' }, (e) => ({ y0: e.a & 7, y1: (e.a >> 3) & 1, y2: e.a >> 4 }));
comb('SPLIT', { w: 4 }, (e) => ({ y0: e.a & 1, y1: (e.a >> 1) & 1, y2: (e.a >> 2) & 1, y3: e.a >> 3 }));
comb('MERGE', { w: 6, sizes: '2,4' }, (e) => ({ y: e.a0 + 4 * e.a1 }));

// ---- the 74-series chips: combinational function tables -----------------------------------------------------------
for (const [num, g] of [['7400', 'NAND'], ['7402', 'NOR'], ['7408', 'AND'], ['7432', 'OR'], ['7486', 'XOR']]) {
  comb('IC' + num, {}, (e) => { const o = {}; for (const i of [1, 2, 3, 4]) o[i + 'Y'] = G[g]([e[i + 'A'], e[i + 'B']]); return o; }, { max: 256 });
}
comb('IC7404', {}, (e) => { const o = {}; for (let i = 1; i <= 6; i++) o[i + 'Y'] = 1 - e[i + 'A']; return o; });
comb('IC74125', {}, (e) => { const o = {}; for (let i = 1; i <= 4; i++) o[i + 'Y'] = e[i + 'Gn'] ? 'Z' : e[i + 'A']; return o; });
comb('IC74138', {}, (e) => {
  const on = e.G1 && !e.G2An && !e.G2Bn, a = e.A + 2 * e.B + 4 * e.C, o = {};
  for (let i = 0; i < 8; i++) o['Y' + i + 'n'] = on && a === i ? 0 : 1;
  return o;
});
comb('IC74151', {}, (e) => { if (e.Gn) return { Y: 0, W: 1 }; const y = e['D' + (e.A + 2 * e.B + 4 * e.C)]; return { Y: y, W: 1 - y }; });
comb('IC74153', {}, (e) => { const s = e.A + 2 * e.B; return { '1Y': e['1Gn'] ? 0 : e['1C' + s], '2Y': e['2Gn'] ? 0 : e['2C' + s] }; });
comb('IC74283', {}, (e) => {
  const a = e.A1 + 2 * e.A2 + 4 * e.A3 + 8 * e.A4, b = e.B1 + 2 * e.B2 + 4 * e.B3 + 8 * e.B4, r = a + b + e.C0;
  return { S1: r & 1, S2: (r >> 1) & 1, S3: (r >> 2) & 1, S4: (r >> 3) & 1, C4: r >> 4 };
});
comb('IC7485', {}, (e) => {
  const a = e.A0 + 2 * e.A1 + 4 * e.A2 + 8 * e.A3, b = e.B0 + 2 * e.B1 + 4 * e.B2 + 8 * e.B3;
  if (a > b) return { OGT: 1, OEQ: 0, OLT: 0 };
  if (a < b) return { OGT: 0, OEQ: 0, OLT: 1 };
  if (e.IEQ) return { OGT: 0, OEQ: 1, OLT: 0 };
  return { OGT: 1 - e.ILT, OEQ: 0, OLT: 1 - e.IGT };
});
{
  // the display decoders: segments for every code, lamp test, ripple blanking
  const SEG = [0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7C, 0x07, 0x7F, 0x67, 0x58, 0x4C, 0x62, 0x69, 0x78, 0x00];
  for (const [num, low] of [['7447', true], ['7448', false]]) comb('IC' + num, {}, (e) => {
    const v = e.A + 2 * e.B + 4 * e.C + 8 * e.D, blank = !e.RBIn && e.LTn && v === 0;
    const segs = blank ? 0 : !e.LTn ? 0x7F : SEG[v], o = { BIRBOn: blank ? 0 : 1 };
    'abcdefg'.split('').forEach((s, i) => { const on = (segs >> i) & 1; o[s] = low ? (on ? 0 : 'Z') : on; });
    return o;
  });
}

// ---- storage parts against reference models -----------------------------------------------------------------------
/** a test bench for one part: clock it through cycles of (set inputs, wait, active edge, wait, back, wait) */
function bench(type, params, o) {
  o = o || {};
  const c = P.testCircuit(type, params), sim = Sim.create(c, Object.assign({ tech: 'CMOS' }, quiet, o.sim || {}));
  const clk = o.clk || 'clk', fall = params.edge === 'fall', d = o.wait || 60;
  if (c.byId.get('in_VCC')) { sim.set('VCC', 1); sim.set('GND', 0); }
  if (fall) sim.set(clk, 1);
  for (const [k, v] of Object.entries(o.init || {})) sim.set(k, v);
  sim.run(d);
  return {
    sim,
    cycle(env, noClock) {
      for (const [k, v] of Object.entries(env)) sim.set(k, v);
      sim.run(d);
      if (!noClock) { sim.set(clk, fall ? 0 : 1); sim.run(d); sim.set(clk, fall ? 1 : 0); }
      sim.run(d);
    },
    get: (k) => norm(sim.get(k)),
  };
}
const rbit = () => (R() < 0.5 ? 0 : 1);
const X = 'X';
for (const type of ['DFF', 'JKFF', 'TFF', 'SRFF']) for (const edge of ['rise', 'fall']) for (const set of [false, true]) for (const reset of [false, true]) for (const asyncLow of [false, true]) for (const en of [false, true]) {
  if (!set && !reset && asyncLow) continue;
  const p = { edge, set, reset, asyncLow, en, enLow: en && R() < 0.5 };
  const b = bench(type, p, { init: asyncLow ? Object.assign(set ? { set: 1 } : {}, reset ? { rst: 1 } : {}) : {} });
  // active-low controls read 0 for an instant at power-up, before the bench lifts them
  let q = asyncLow ? (set ? 1 : 0) : null;
  const ins = { DFF: ['d'], JKFF: ['j', 'k'], TFF: ['t'], SRFF: ['s', 'r'] }[type];
  for (let i = 0; i < 40; i++) {
    const env = {};
    for (const k of ins) env[k] = rbit();
    if (en) env.en = R() < 0.7 ? (p.enLow ? 0 : 1) : (p.enLow ? 1 : 0);
    const act = (v) => (asyncLow ? 1 - v : v);
    if (set) env.set = R() < 0.15 ? act(1) : act(0);
    if (reset) env.rst = R() < 0.15 ? act(1) : act(0);
    b.cycle(env);
    const s = set ? act(env.set) : 0, r = reset ? act(env.rst) : 0;
    let both = false;
    if (s && r) { q = 1; both = true; } else if (s) q = 1; else if (r) q = 0;
    else if (!en || env.en ^ p.enLow) {
      if (type === 'DFF') q = env.d;
      if (type === 'TFF') q = env.t ? (q === null ? null : 1 - q) : q;
      if (type === 'JKFF') q = env.j && env.k ? (q === null ? null : 1 - q) : env.j ? 1 : env.k ? 0 : q;
      if (type === 'SRFF') q = env.s && env.r ? null : env.s ? 1 : env.r ? 0 : q;
    }
    t.eq(b.get('q'), q === null ? X : q, type + ' ' + JSON.stringify(p) + ' cycle ' + i + ' ' + JSON.stringify(env) + ' q');
    t.eq(b.get('qn'), both ? 1 : q === null ? X : 1 - q, type + ' ' + JSON.stringify(p) + ' cycle ' + i + ' qn');
  }
  t.eq(b.sim.violations.filter((v) => v.kind !== 'float').map((v) => v.say), [], type + ' ' + JSON.stringify(p) + ' runs clean');
}
for (const ld of [false, true]) for (const clr of [false, true]) for (const clrSync of [false, true]) for (const clrLow of [false, true]) {
  if (!clr && (clrSync || clrLow)) continue;
  const w = 5, p = { w, ld, clr, clrSync, clrLow }, b = bench('REG', p);
  let q = null;
  for (let i = 0; i < 40; i++) {
    const env = { d: Math.floor(R() * 32) };
    if (ld) env.ld = rbit();
    if (clr) env.clr = R() < 0.15 ? 1 ^ clrLow : 0 ^ clrLow;
    b.cycle(env);
    if (clr && env.clr ^ clrLow) q = 0; else if (!ld || env.ld) q = env.d;
    t.eq(b.get('q'), q === null ? X : q, 'REG ' + JSON.stringify(p) + ' cycle ' + i);
  }
}
for (const dir of ['right', 'left']) for (const ld of [false, true]) for (const clr of [false, true]) {
  const w = 5, p = { w, dir, ld, clr }, b = bench('SHIFT', p);
  let q = [null, null, null, null, null];
  for (let i = 0; i < 40; i++) {
    const env = { si: rbit() };
    if (ld) { env.ld = R() < 0.3 ? 1 : 0; env.d = Math.floor(R() * 32); }
    if (clr) env.clr = R() < 0.1 ? 1 : 0;
    b.cycle(env);
    if (clr && env.clr) q = [0, 0, 0, 0, 0];
    else if (ld && env.ld) q = [0, 1, 2, 3, 4].map((k) => bit(env.d, k));
    else if (dir === 'right') q = [env.si].concat(q.slice(0, 4)); else q = q.slice(1).concat([env.si]);
    const want = q.every((x) => x !== null) ? q.reduce((s, x, k) => s + x * 2 ** k, 0) : V.str(q.map((x) => (x === null ? 'X' : x)));
    t.eq(b.get('q'), want, 'SHIFT ' + JSON.stringify(p) + ' cycle ' + i);
    const so = dir === 'right' ? q[4] : q[0];
    t.eq(b.get('so'), so === null ? X : so, 'SHIFT so ' + JSON.stringify(p) + ' cycle ' + i);
  }
}
{
  const w = 4, b = bench('USHIFT', { w, clr: true, clrLow: true });
  let q = null;
  for (let i = 0; i < 120; i++) {
    const env = { s: Math.floor(R() * 4), sr: rbit(), sl: rbit(), d: Math.floor(R() * 16), clr: R() < 0.08 ? 0 : 1 };
    b.cycle(env);
    if (!env.clr) q = 0;
    else if (q !== null || env.s === 3) {
      if (env.s === 1) q = ((q << 1) | env.sr) & 15;
      else if (env.s === 2) q = (q >> 1) | (env.sl << 3);
      else if (env.s === 3) q = env.d;
    }
    if (q === null && env.s !== 0 && env.s !== 3) continue;
    t.eq(b.get('q'), q === null ? X : q, 'USHIFT cycle ' + i + ' ' + JSON.stringify(env));
  }
}
for (const [w, mod] of [[3, 0], [4, 10], [4, 0], [3, 5]]) for (const dir of ['up', 'down', 'pin']) for (const clrSync of [false, true]) for (const ripple of [false, true]) {
  if (ripple && dir !== 'up') continue;
  const M = mod || 2 ** w, p = { w, mod, dir, en: true, ld: true, clr: true, clrSync, co: true, ripple }, b = bench('COUNTER', p, { wait: 80 });
  let q = null;
  for (let i = 0; i < 50; i++) {
    const env = { en: R() < 0.8 ? 1 : 0, ld: R() < 0.1 ? 1 : 0, d: Math.floor(R() * M), clr: i === 0 || R() < 0.05 ? 1 : 0 };
    if (dir === 'pin') env.up = rbit();
    b.cycle(env);
    const up = dir === 'pin' ? env.up : dir === 'up';
    if (env.clr) q = 0;
    else if (env.ld) q = env.d;
    else if (env.en && q !== null) q = up ? (q + 1) % M : (q + M - 1) % M;
    t.eq(b.get('q'), q === null ? X : q, 'COUNTER ' + JSON.stringify(p) + ' cycle ' + i);
    t.eq(b.get('co'), q === null ? X : +(env.en === 1 && q === (up ? M - 1 : 0)), 'COUNTER co ' + JSON.stringify(p) + ' cycle ' + i);
  }
}
for (const enLow of [false, true]) {
  const c = P.testCircuit('LATCH', { enLow }), sim = Sim.create(c, quiet);
  let q = null;
  for (let i = 0; i < 200; i++) {
    const en = rbit(), d = rbit();
    sim.set('en', en); sim.run(40); sim.set('d', d); sim.run(40);
    if (en ^ enLow) q = d;
    t.eq(norm(sim.get('q')), q === null ? X : q, 'LATCH enLow=' + enLow + ' step ' + i);
  }
}
for (const low of [false, true]) {
  const c = P.testCircuit('SRLATCH', { low }), sim = Sim.create(c, quiet);
  let q = null, both = false;
  for (let i = 0; i < 300; i++) {
    const s = R() < 0.3 ? 1 : 0, r = R() < 0.3 ? 1 : 0;
    sim.set('s', low ? 1 - s : s); sim.set('r', low ? 1 - r : r); sim.run(40);
    if (s && r) both = true;
    else { if (s) q = 1; else if (r) q = 0; else if (both) q = null; both = false; }
    const bq = low ? 1 : 0;
    t.eq(norm(sim.get('q')), both ? bq : q === null ? X : q, 'SRLATCH low=' + low + ' step ' + i);
    t.eq(norm(sim.get('qn')), both ? bq : q === null ? X : 1 - q, 'SRLATCH qn low=' + low + ' step ' + i);
  }
}
for (const sync of [false, true]) for (const cs of [false, true]) for (const oe of [false, true]) {
  const p = { aw: 3, dw: 5, sync, cs, oe, data: '1 2 3 4 5 6 7 8' }, c = P.testCircuit('RAM', p), sim = Sim.create(c, quiet);
  const mem = [1, 2, 3, 4, 5, 6, 7, 8];
  if (cs) sim.set('cs', 1);
  if (oe) sim.set('oe', 1);
  for (let i = 0; i < 120; i++) {
    const a = Math.floor(R() * 8), din = Math.floor(R() * 32);
    sim.set('a', a); sim.set('din', din);
    const sel = cs ? (R() < 0.85 ? 1 : 0) : 1;
    if (cs) sim.set('cs', sel);
    sim.run(20);
    if (R() < 0.4) {
      sim.set('we', 1); sim.run(30);
      if (sync) { sim.set('clk', 1); sim.run(30); sim.set('clk', 0); }
      sim.run(10); sim.set('we', 0); sim.run(30);
      if (sel) mem[a] = din;
    } else {
      const en = oe ? (R() < 0.8 ? 1 : 0) : 1;
      if (oe) sim.set('oe', en);
      sim.run(50);
      t.eq(norm(sim.get('dout')), sel && en ? mem[a] : 'Z', 'RAM ' + JSON.stringify(p) + ' read ' + a + ' step ' + i);
      if (oe) sim.set('oe', 1);
    }
  }
}

// ---- chips: storage --------------------------------------------------------------------------------------------
{
  const b = bench('IC7474', {}, { clk: null });
  const q = [null, null];
  const sim = b.sim;
  for (let i = 0; i < 300; i++) {
    const env = {};
    for (const k of [1, 2]) { env[k + 'D'] = rbit(); env[k + 'PREn'] = R() < 0.1 ? 0 : 1; env[k + 'CLRn'] = R() < 0.1 ? 0 : 1; }
    for (const [k, v] of Object.entries(env)) sim.set(k, v);
    sim.run(40); sim.set('1CLK', 1); sim.set('2CLK', 1); sim.run(40); sim.set('1CLK', 0); sim.set('2CLK', 0); sim.run(40);
    for (const k of [1, 2]) {
      const pre = !env[k + 'PREn'], clr = !env[k + 'CLRn'];
      let both = false;
      if (pre && clr) { q[k - 1] = 1; both = true; } else if (pre) q[k - 1] = 1; else if (clr) q[k - 1] = 0; else q[k - 1] = env[k + 'D'];
      t.eq(b.get(k + 'Q'), q[k - 1], '7474 ff' + k + ' step ' + i);
      t.eq(b.get(k + 'Qn'), both ? 1 : 1 - q[k - 1], '7474 ff' + k + " Q' step " + i);
    }
  }
  t.eq(sim.violations.filter((v) => v.kind !== 'power').map((v) => v.kind), [], '7474 runs clean');
}
{
  const c = P.testCircuit('IC7476', {}), sim = Sim.create(c, quiet);
  sim.set('VCC', 1); sim.set('GND', 0); sim.set('1CLK', 1); sim.set('2CLK', 1); sim.run(50);
  // preset and clear both read 0 at power-up, which drives Q high
  const q = [1, 1];
  for (let i = 0; i < 300; i++) {
    const env = {};
    for (const k of [1, 2]) { env[k + 'J'] = rbit(); env[k + 'K'] = rbit(); env[k + 'PREn'] = R() < 0.08 ? 0 : 1; env[k + 'CLRn'] = R() < 0.08 ? 0 : 1; }
    for (const [k, v] of Object.entries(env)) sim.set(k, v);
    sim.run(40); sim.set('1CLK', 0); sim.set('2CLK', 0); sim.run(40); sim.set('1CLK', 1); sim.set('2CLK', 1); sim.run(40);
    for (const k of [1, 2]) {
      const pre = !env[k + 'PREn'], clr = !env[k + 'CLRn'], j = env[k + 'J'], kk = env[k + 'K'];
      let cur = q[k - 1];
      if (pre && clr) cur = 1; else if (pre) cur = 1; else if (clr) cur = 0; else if (j && kk) cur = cur === null ? null : 1 - cur; else if (j) cur = 1; else if (kk) cur = 0;
      q[k - 1] = cur;
      if (pre && clr) { t.eq(b2(sim, k + 'Q'), 1, '7476 both'); continue; }
      t.eq(b2(sim, k + 'Q'), cur === null ? X : cur, '7476 ff' + k + ' step ' + i + ' ' + JSON.stringify(env));
    }
  }
}
function b2(sim, k) { return norm(sim.get(k)); }
for (const [num, syncClear] of [['74161', false], ['74163', true]]) {
  const c = P.testCircuit('IC' + num, {}), sim = Sim.create(c, quiet);
  sim.set('VCC', 1); sim.set('GND', 0); sim.run(50);
  let q = null;
  for (let i = 0; i < 400; i++) {
    const env = { CLRn: i === 0 || R() < 0.05 ? 0 : 1, LOADn: R() < 0.1 ? 0 : 1, ENP: R() < 0.85 ? 1 : 0, ENT: R() < 0.85 ? 1 : 0, A: rbit(), B: rbit(), C: rbit(), D: rbit() };
    for (const [k, v] of Object.entries(env)) sim.set(k, v);
    sim.run(40);
    if (!syncClear && !env.CLRn) { q = 0; t.eq(norm(sim.get('QA')), 0, num + ' clears at once'); }
    sim.set('CLK', 1); sim.run(40); sim.set('CLK', 0); sim.run(40);
    if (!env.CLRn) q = 0;
    else if (!env.LOADn) q = env.A + 2 * env.B + 4 * env.C + 8 * env.D;
    else if (env.ENP && env.ENT && q !== null) q = (q + 1) & 15;
    const got = ['QA', 'QB', 'QC', 'QD'].map((k) => sim.get(k));
    t.eq(V.toNum(got), q, num + ' step ' + i + ' ' + JSON.stringify(env));
    t.eq(sim.get('RCO'), +(env.ENT === 1 && q === 15), num + ' RCO step ' + i);
  }
}
{
  const c = P.testCircuit('IC74194', {}), sim = Sim.create(c, quiet);
  sim.set('VCC', 1); sim.set('GND', 0); sim.run(50);
  let q = null;
  for (let i = 0; i < 400; i++) {
    const env = { CLRn: i === 0 || R() < 0.05 ? 0 : 1, S0: rbit(), S1: rbit(), SR: rbit(), SL: rbit(), A: rbit(), B: rbit(), C: rbit(), D: rbit() };
    for (const [k, v] of Object.entries(env)) sim.set(k, v);
    sim.run(40); sim.set('CLK', 1); sim.run(40); sim.set('CLK', 0); sim.run(40);
    const m = env.S0 + 2 * env.S1;
    if (!env.CLRn) q = 0;
    else if (m === 1) q = ((q << 1) | env.SR) & 15;
    else if (m === 2) q = (q >> 1) | (env.SL << 3);
    else if (m === 3) q = env.A + 2 * env.B + 4 * env.C + 8 * env.D;
    t.eq(V.toNum(['QA', 'QB', 'QC', 'QD'].map((k) => sim.get(k))), q, '74194 step ' + i + ' mode ' + m);
  }
}
{
  // two 7447s blanking leading zeros: the tens digit's RBO feeds the units digit's RBI
  const c = new N.Circuit('blank');
  const vcc = c.add('VCC', {}, 'vcc'), gnd = c.add('GND', {}, 'gnd');
  const tens = c.add('IC7447', {}, 'u1'), units = c.add('IC7447', {}, 'u2');
  const ins = {};
  for (const [u, pre] of [[tens, 'T'], [units, 'U']]) for (const k of ['A', 'B', 'C', 'D']) { ins[pre + k] = c.input(pre + k); c.connect(ins[pre + k], u.pin(k)); }
  c.connect(vcc, tens.pin('VCC'), units.pin('VCC'), tens.pin('LTn'), units.pin('LTn'));
  c.connect(gnd, tens.pin('GND'), units.pin('GND'), tens.pin('RBIn'));
  c.connect(tens.pin('BIRBOn'), units.pin('RBIn'));
  const sim = Sim.create(c, quiet);
  const seg = (u) => 'abcdefg'.split('').map((s) => sim.get(u + '.' + s));
  for (let v = 0; v < 100; v++) {
    const T0 = Math.floor(v / 10), U0 = v % 10;
    for (const k of [0, 1, 2, 3]) { sim.set('T' + 'ABCD'[k], bit(T0, k)); sim.set('U' + 'ABCD'[k], bit(U0, k)); }
    sim.settle();
    t.eq(seg('u1').every((x) => x === 'Z'), T0 === 0, 'leading zero blanked: ' + v);
    t.eq(seg('u2').every((x) => x === 'Z'), v === 0, 'units digit shown unless the whole number is 0: ' + v);
  }
}
{
  // a chip with no power does nothing, and says so
  const c = new N.Circuit('nopower');
  const u = c.add('IC7400', {}, 'u1');
  c.connect(c.input('A'), u.pin('1A')); c.connect(c.input('B'), u.pin('1B')); c.connect(u.pin('1Y'), c.output('Y'));
  const sim = Sim.create(c, quiet);
  sim.set('A', 1); sim.set('B', 1); sim.run(100);
  t.eq(sim.get('Y'), 'Z', 'unpowered 7400 output floats');
  t.ok(sim.violations.some((v) => v.kind === 'power' && /pin 14/.test(v.say)), 'missing power reported with the pin numbers');
  t.eq(P.chipPin('IC7400', 14), 'VCC', 'chip pin 14 of a 7400 is VCC');
  t.eq(P.chipPin('7476', 5), 'VCC', 'chip pin 5 of a 7476 is VCC');
  t.eq(P.chipPin('IC74161', 15), 'RCO', 'chip pin 15 of a 74161 is RCO');
  for (const num of Object.keys(P.chips)) {
    const pins = P.registry[P.chips[num]].pins({});
    t.eq(pins.map((q) => q.num).sort((a, b) => a - b), [...Array(pins.length).keys()].map((i) => i + 1), num + ' has every pin numbered once');
    t.ok(pins.some((q) => q.name === 'VCC') && pins.some((q) => q.name === 'GND'), num + ' has VCC and GND');
  }
}

// ---- glitches, hazards and inertial delay -----------------------------------------------------------------------
function hazard(techName, o) {
  const c = N.fromExpression('hz', "AB + A'C", 'and-or');
  if (o && o.notDelay !== undefined) for (const p of c.parts) if (p.type === 'NOT') Object.assign(p.params, { tpLH: o.notDelay, tpHL: o.notDelay });
  const sim = Sim.create(c, Object.assign({ tech: techName }, o || {}));
  sim.set('A', 1); sim.set('B', 1); sim.set('C', 1); sim.run(100);
  sim.set('A', 0); sim.run(100);
  return { sim, gl: Sim.glitches(sim.waves, 1000).filter((g) => g.net === 'F') };
}
{
  const tc = T.presets.CMOS.gate;
  const { gl } = hazard('CMOS', { transport: true });
  t.eq(gl.length, 1, 'static-1 hazard: one glitch (transport)');
  t.eq(gl[0] && gl[0].width, tc.NOT[0], 'static-1 glitch is exactly the inverter delay (CMOS)');
  t.eq(gl[0] && gl[0].t, 100 + tc.AND[1] + tc.OR[1], 'glitch starts after the AND and OR delays');
  const fp = hazard('FPGA', { transport: true });
  t.eq(fp.gl.length && fp.gl[0].width, T.presets.FPGA.gate.NOT[0], 'static-1 glitch is the inverter delay (FPGA)');
  const tt = T.presets.TTL.gate, tl = hazard('TTL', { transport: true });
  t.eq(tl.gl.length && tl.gl[0].width, Math.round((tt.NOT[0] + tt.AND[0] + tt.OR[0] - tt.AND[1] - tt.OR[1]) * 1000) / 1000, 'TTL glitch width follows the rise and fall delays');
  const inert = hazard('CMOS');
  t.eq(inert.gl.length, 0, 'inertial OR swallows a glitch shorter than its delay');
  t.eq(inert.sim.swallowed.length, 1, 'the swallowed pulse is recorded');
  t.ok(/swallowed an 8 ns pulse/.test(inert.sim.swallowed[0].say), 'swallow explained: ' + inert.sim.swallowed[0].say);
  const slow = hazard('CMOS', { notDelay: 15 });
  t.eq(slow.gl.length && slow.gl[0].width, 15, 'inertial: an inverter slower than the OR gives a glitch as long as the inverter delay');
  const ev = inert.sim.events.find((e) => e.net === 'not1.y' && e.t === 108);
  t.eq(ev && ev.cause, 'NOT not1 saw A fall at 100 ns; its output rises at 108 ns (8 ns later).', 'event cause sentence');
  t.eq(ev && ev.by && ev.by.net, 'A', 'cause chain links back to the input');
  // static-0 hazard in a product of sums
  const c = N.fromExpression('hz0', "(A + B)(A' + C)", 'or-and');
  const sim = Sim.create(c, { transport: true });
  sim.set('A', 0); sim.set('B', 0); sim.set('C', 0); sim.run(100); sim.set('A', 1); sim.run(100);
  const g0 = Sim.glitches(sim.waves, 1000).filter((g) => g.net === 'F');
  t.eq(g0.map((g) => [g.to, g.width]), [[1, tc.NOT[1]]], 'static-0 hazard: a 1-glitch as long as the inverter delay');
}
{
  // inertial versus transport on one buffer
  for (const [mode, width, passes] of [['inertial', 4, false], ['inertial', 9.99, false], ['inertial', 10, true], ['inertial', 25, true], ['transport', 4, true], ['transport', 1, true]]) {
    const c = new N.Circuit('buf');
    const g = c.add('BUF', { tpLH: 10, tpHL: 10 });
    c.connect(c.input('A'), g.pin('i0')); c.connect(g.pin('y'), c.output('Y'));
    const sim = Sim.create(c, { transport: mode === 'transport' });
    sim.run(50); sim.set('A', 1); sim.run(width); sim.set('A', 0); sim.run(100);
    const w = sim.waves.get('Y').filter((e) => e[0] > 20);
    t.eq(w.length === 2, passes, mode + ' pulse of ' + width + ' ns ' + (passes ? 'passes' : 'is swallowed'));
    if (passes) t.eq(w.map((e) => e[0]), [60, Math.round((60 + width) * 1e6) / 1e6], mode + ' pulse edges delayed by 10 ns');
    else t.eq(sim.swallowed.length, 1, 'swallow recorded');
  }
  // different rise and fall delays
  const c = new N.Circuit('asym');
  const g = c.add('NOT', { tpLH: 7, tpHL: 3 });
  c.connect(c.input('A'), g.pin('i0')); c.connect(g.pin('y'), c.output('Y'));
  const sim = Sim.create(c);
  sim.run(50); sim.set('A', 1); sim.run(50); sim.set('A', 0); sim.run(50);
  t.eq(sim.waves.get('Y'), [[0, 'X'], [7, 1], [53, 0], [107, 1]], 'tpLH and tpHL apply to rising and falling outputs');
}

// ---- setup, hold, pulse width, metastability -----------------------------------------------------------------------
function ffBench(meta, seed) {
  const c = new N.Circuit('ff');
  const f = c.add('DFF', { qn: false }, 'ff1');
  c.connect(c.input('D'), f.pin('d')); c.connect(c.clock('CLK'), f.pin('clk')); c.connect(f.pin('q'), c.output('Q'));
  c.byId.get('clk_CLK').params.period = 100;
  const sim = Sim.create(c, { meta, seed });
  sim.at(10, 'D', 1).at(145, 'D', 0).at(253, 'D', 1).at(351, 'D', 0).at(420, 'D', 1);
  return sim;
}
{
  const sim = ffBench('resolve', 7);
  const seen = {};
  for (const tt of [70, 140, 160, 170, 180, 240, 300, 360, 370, 380, 440, 600]) { sim.stepTo(tt); seen[tt] = sim.get('Q'); }
  t.eq(sim.violations.map((v) => [v.kind, v.t]), [['setup', 150], ['hold', 351]], 'setup at the 150 ns edge, hold at 351 ns, nothing else');
  t.ok(/D of DFF ff1 changed at 145 ns, only 5 ns before/.test(sim.violations[0].say), 'setup explained: ' + sim.violations[0].say);
  t.eq([seen[70], seen[140], seen[160]], [1, 1, 1], 'clean capture at 50 ns, Q a clock-to-Q later');
  t.eq(seen[170], 'X', 'metastable: X after clock-to-Q');
  t.ok(seen[180] === 0 || seen[180] === 1, 'resolves to 0 or 1 after the resolve time');
  t.eq(seen[300], 0, 'next clean edge captures D');
  t.eq(seen[240], seen[180], 'the resolved value holds');
  t.eq(seen[370], 'X', 'hold violation also goes metastable');
  t.eq(seen[600], 1, 'clean again');
  const again = ffBench('resolve', 7);
  again.stepTo(600);
  t.eq(JSON.stringify(again.waves.get('Q')), JSON.stringify(sim.waves.get('Q')), 'metastability is deterministic for a seed');
  const outcomes = new Set();
  for (let s = 1; s <= 12; s++) { const x = ffBench('resolve', s); x.stepTo(190); outcomes.add(x.get('Q')); }
  t.ok(outcomes.has(0) && outcomes.has(1), 'different seeds resolve differently');
  const stay = ffBench('stay', 1);
  stay.stepTo(240); t.eq(stay.get('Q'), 'X', "meta 'stay' keeps X");
  stay.stepTo(270); t.eq(stay.get('Q'), 0, 'until the next clean edge');
  const off = ffBench('off', 1);
  off.stepTo(170); t.eq(off.get('Q'), 0, "meta 'off': violations reported, no X");
  off.stepTo(600);
  t.eq(off.violations.length, 2, "meta 'off' still reports");
  // minimum pulse width of a clock, and of an asynchronous clear
  const c = new N.Circuit('pw');
  const f = c.add('DFF', { reset: true }, 'ff1');
  c.connect(c.input('D'), f.pin('d')); c.connect(c.clock('CLK'), f.pin('clk')); c.connect(c.input('R'), f.pin('rst')); c.connect(f.pin('q'), c.output('Q'));
  c.byId.get('clk_CLK').params.period = 16;
  const s2 = Sim.create(c);
  s2.run(100);
  t.ok(s2.violations.filter((v) => v.kind === 'pulse').length >= 10, 'clock pulses of 8 ns (< 10 ns) flagged');
  const c3 = P.testCircuit('DFF', { reset: true }), s3 = Sim.create(c3);
  s3.run(50); s3.set('rst', 1); s3.run(4); s3.set('rst', 0); s3.run(50); s3.set('rst', 1); s3.run(20); s3.set('rst', 0); s3.run(50);
  t.eq(s3.violations.filter((v) => v.kind === 'pulse').map((v) => v.width), [4], 'a 4 ns clear pulse is too short; 20 ns is fine');
}

// a change landing exactly on the clock edge: hold when the same edge launched it (it raced a late clock), setup
// when an earlier edge's change arrives late
{
  // r1 toggles; its Q reaches r2's D through one buffer (clock-to-Q + buffer); r2's clock comes through a buffer
  // just as slow, so each change lands on r2's edge, launched by that same edge of CLK
  const c1 = new N.Circuit('edge');
  const clk = c1.clock('CLK');
  c1.byId.get('clk_CLK').params.period = 80;
  const r1 = c1.add('DFF', { qn: true }, 'r1'), r2 = c1.add('DFF', { qn: false }, 'r2');
  const d0 = c1.gate('BUF', 1, 'd0'), sk = c1.gate('BUF', 1, 'sk');
  c1.connect(clk, r1.pin('clk')); c1.connect(r1.pin('qn'), r1.pin('d'));
  c1.connect(r1.pin('q'), d0.pin('i0')); c1.connect(d0.pin('y'), r2.pin('d'));
  c1.connect(clk, sk.pin('i0')); c1.connect(sk.pin('y'), r2.pin('clk'));
  c1.connect(r2.pin('q'), c1.output('Q'));
  const probe = Sim.create(c1, { powerUp: 0 });
  const late = Math.max(probe.timing('r1').tpLH, probe.timing('r1').tpHL) + probe.timing('d0').tpLH;
  sk.params.tpLH = late; sk.params.tpHL = late;
  d0.params.tpHL = probe.timing('d0').tpLH;
  const s1 = Sim.create(c1, { powerUp: 0 });
  s1.run(400);
  const atEdge = s1.violations.filter((v) => (v.kind === 'setup' || v.kind === 'hold') && v.part === 'r2');
  t.ok(atEdge.length > 0 && atEdge.every((v) => v.kind === 'hold' && v.sameEdge), 'a change on the edge launched by the same edge is a hold violation: ' + JSON.stringify(atEdge.map((v) => v.kind + ' ' + v.t)));
  t.ok(atEdge.length > 0 && /launched by the same clock edge/.test(atEdge[0].say), 'and says so: ' + (atEdge[0] || {}).say);
  // the stimulus changes D on the clock edge: no clock launched it, so it stays a setup problem
  const c = new N.Circuit('ff');
  const f = c.add('DFF', { qn: false }, 'ff1');
  c.connect(c.input('D'), f.pin('d')); c.connect(c.clock('CLK'), f.pin('clk')); c.connect(f.pin('q'), c.output('Q'));
  c.byId.get('clk_CLK').params.period = 100;
  const s2 = Sim.create(c, {});
  s2.at(150, 'D', 1);
  s2.run(200);
  t.eq(s2.violations.filter((v) => v.kind === 'setup' || v.kind === 'hold').map((v) => v.kind + ' ' + v.t), ['setup 150'], 'a change on the edge from an input is a setup problem');
}

// ---- oscillation and loops ---------------------------------------------------------------------------------------
function ring(techName, stages) {
  const c = new N.Circuit('ring');
  const en = c.input('EN'), g0 = c.gate('NAND', 2, 'g0');
  c.connect(en, g0.pin('i0'));
  let s = g0.pin('y');
  for (let i = 0; i < stages - 1; i++) { const g = c.gate('NOT', 1, 'inv' + i); c.connect(s, g.pin('i0')); s = g.pin('y'); }
  c.connect(s, g0.pin('i1'));
  c.connect(g0.pin('y'), c.output('OSC'));
  return Sim.create(c, { tech: techName });
}
for (const [techName, stages] of [['CMOS', 5], ['CMOS', 7], ['TTL', 5], ['LS-TTL', 3], ['FPGA', 9]]) {
  const sim = ring(techName, stages), g = T.presets[techName].gate;
  sim.run(300); sim.set('EN', 1); sim.run(3000);
  const rises = sim.waves.get('OSC').filter((e) => e[1] === 1 && e[0] > 600).map((e) => e[0]);
  const per = rises.slice(1).map((x, i) => Math.round((x - rises[i]) * 1000) / 1000);
  const want = Math.round((g.NAND[0] + g.NAND[1] + (stages - 1) * (g.NOT[0] + g.NOT[1])) * 1000) / 1000;
  t.ok(per.length > 3, 'ring oscillates (' + techName + ', ' + stages + ' stages)');
  t.ok(per.every((p) => p === want), 'ring period ' + want + ' ns = sum of every stage rise and fall delay (' + techName + ', ' + stages + '): got ' + per.slice(0, 3));
}
{
  // a loop with no delay oscillates in delta cycles: cut off and reported, not hung
  const c = new N.Circuit('zero');
  const en = c.input('EN'), g = c.add('NAND', { n: 2, tpLH: 0, tpHL: 0 }, 'g');
  c.connect(en, g.pin('i0')); c.connect(g.pin('y'), g.pin('i1'), c.output('Y'));
  const sim = Sim.create(c);
  sim.run(10); sim.set('EN', 1); sim.run(10);
  t.ok(sim.violations.some((v) => v.kind === 'loop'), 'zero-delay loop reported');
  t.eq(sim.get('Y'), 'X', 'the looping net is X');
  t.eq(sim.time, 20, 'time still advances');
}

// ---- buses: tristate, contention, pull-ups, open collector, floating inputs ----------------------------------------------
{
  const c = new N.Circuit('bus');
  const t1 = c.add('TRI', { w: 4 }, 't1'), t2 = c.add('TRI', { w: 4 }, 't2');
  c.connect(c.input('A1', 4), t1.pin('a')); c.connect(c.input('A2', 4), t2.pin('a'));
  c.connect(c.input('E1'), t1.pin('en')); c.connect(c.input('E2'), t2.pin('en'));
  c.connect(t1.pin('y'), t2.pin('y'), c.output('BUS', 4));
  const sim = Sim.create(c);
  for (let k = 0; k < 200; k++) {
    const a1 = Math.floor(R() * 16), a2 = Math.floor(R() * 16), e1 = rbit(), e2 = rbit();
    sim.set('A1', a1); sim.set('A2', a2); sim.set('E1', e1); sim.set('E2', e2); sim.settle();
    const got = sim.get('BUS');
    if (e1 && e2) t.eq(V.str(got), [3, 2, 1, 0].map((i) => (bit(a1, i) === bit(a2, i) ? String(bit(a1, i)) : 'X')).join(''), 'two drivers: agreeing bits pass, others X');
    else if (e1 || e2) t.eq(V.toNum(got), e1 ? a1 : a2, 'one driver on the bus');
    else t.eq(V.str(got), 'ZZZZ', 'nobody drives: Z');
  }
  t.ok(sim.violations.some((v) => v.kind === 'contention' && /t1\.y and t2\.y/.test(v.say)), 'contention reported with both drivers');
}
{
  const c = new N.Circuit('pull');
  const t1 = c.add('TRI', {}, 't1'), pu = c.add('PULLUP', {}, 'pu');
  c.connect(c.input('A'), t1.pin('a')); c.connect(c.input('E'), t1.pin('en'));
  c.connect(t1.pin('y'), pu.pin('y'), c.output('Y'));
  const sim = Sim.create(c);
  for (const [a, e, want] of [[0, 1, 0], [1, 1, 1], [0, 0, 1], [1, 0, 1]]) { sim.set('A', a); sim.set('E', e); sim.settle(); t.eq(sim.get('Y'), want, 'pull-up: A=' + a + ' E=' + e); }
  // wired-AND of open-collector NAND outputs
  const w = new N.Circuit('wired');
  const g1 = w.add('NAND', { n: 2, out: 'oc' }, 'g1'), g2 = w.add('NAND', { n: 2, out: 'oc' }, 'g2'), p2 = w.add('PULLUP', {}, 'pu');
  for (const [g, a, b] of [[g1, 'A', 'B'], [g2, 'C', 'D']]) { w.connect(w.input(a), g.pin('i0')); w.connect(w.input(b), g.pin('i1')); }
  w.connect(g1.pin('y'), g2.pin('y'), p2.pin('y'), w.output('Y'));
  const ws = Sim.create(w, quiet);
  for (let v = 0; v < 16; v++) {
    for (const [i, k] of ['A', 'B', 'C', 'D'].entries()) ws.set(k, bit(v, i));
    ws.settle();
    t.eq(ws.get('Y'), +(!(bit(v, 0) && bit(v, 1)) && !(bit(v, 2) && bit(v, 3))), 'wired-AND of open-collector NANDs ' + v);
  }
  t.eq(ws.violations.length, 0, 'open-collector outputs never contend');
}
{
  const c = new N.Circuit('float');
  const g = c.add('AND', { n: 2 }, 'g');
  c.connect(c.input('A'), g.pin('i0')); c.connect(g.pin('y'), c.output('Y'));
  for (const floatHigh of [false, true]) {
    const sim = Sim.create(c, { floatHigh });
    sim.set('A', 0); sim.run(50); t.eq(sim.get('Y'), 0, 'floating input, A = 0: AND is 0');
    sim.set('A', 1); sim.run(50); t.eq(sim.get('Y'), floatHigh ? 1 : 'X', 'floating input, A = 1: ' + (floatHigh ? '1 (floats high)' : 'X'));
    t.ok(sim.violations.some((v) => v.kind === 'float' && /i1 is not connected/.test(v.say)), 'floating input reported');
  }
}

// ---- clocks and stimulus -----------------------------------------------------------------------------------------
{
  const c = new N.Circuit('clk');
  const k = c.clock('CK');
  Object.assign(k.params, { period: 40, duty: 0.25, phase: 10 });
  c.connect(k, c.output('Y'));
  const sim = Sim.create(c);
  sim.run(200);
  t.eq(sim.waves.get('CK').slice(1, 9), [[0, 0], [10, 1], [20, 0], [50, 1], [60, 0], [90, 1], [100, 0], [130, 1]], 'clock period, duty and phase');
  t.eq(sim.clockEdge(), 210, 'clockEdge runs to the next rising edge');
  const c2 = P.testCircuit('BUF', {}), s2 = Sim.create(c2);
  s2.pattern('i0', '0110X1', { period: 10, start: 100 });
  s2.run(200);
  t.eq(s2.waves.get('i0').filter((e) => e[0] >= 100), [[110, 1], [130, 0], [140, 'X'], [150, 1]], 'pattern stimulus');
  t.eq(s2.waves.get('y').filter((e) => e[0] >= 100), [[120, 1], [140, 0], [150, 'X'], [160, 1]], 'buffer follows 10 ns later');
  const c3 = new N.Circuit('btn');
  c3.connect(c3.add('BUTTON', { name: 'PB', bounce: 5, bounces: 3 }, 'pb'), c3.output('Y'));
  const s3 = Sim.create(c3, { seed: 3 });
  s3.run(100); s3.set('PB', 1); s3.run(100);
  const ch = s3.waves.get('PB').filter((e) => e[0] >= 100);
  t.ok(ch.length >= 3 && ch.every((e) => e[0] <= 105), 'button bounces within 5 ns: ' + JSON.stringify(ch));
  t.eq(s3.get('Y'), 1, 'button settles pressed');
}

// ---- subcircuits ---------------------------------------------------------------------------------------------------
{
  const fa = D.byId('fa').build();
  const c = new N.Circuit('rca-blocks');
  let carry = c.input('CI');
  const bp = P.blockParams(fa);
  for (let i = 0; i < 4; i++) {
    const b = c.add('BLOCK', bp, 'b' + i);
    c.connect(c.input('A' + i), b.pin('A')); c.connect(c.input('B' + i), b.pin('B')); c.connect(carry, b.pin('Cin'));
    c.connect(b.pin('S'), c.output('S' + i));
    carry = b.pin('Cout');
  }
  c.connect(carry, c.output('CO'));
  // and one level deeper: a block holding that adder
  const outer = new N.Circuit('outer');
  const blk = outer.add('BLOCK', P.blockParams(c), 'add4');
  for (const q of blk.pins) { if (q.dir === 'in') outer.connect(outer.input(q.name), blk.pin(q.name)); else outer.connect(blk.pin(q.name), outer.output(q.name)); }
  for (const circ of [c, outer]) {
    const sim = Sim.create(circ, quiet);
    for (let v = 0; v < 512; v++) {
      const a = v & 15, b = (v >> 4) & 15, ci = v >> 8;
      for (let i = 0; i < 4; i++) { sim.set('A' + i, bit(a, i)); sim.set('B' + i, bit(b, i)); }
      sim.set('CI', ci); sim.settle();
      const s = [0, 1, 2, 3, 'CO'].map((i) => sim.get(typeof i === 'number' ? 'S' + i : i));
      t.eq(V.toNum(s), a + b + ci, circ.title + ' ' + a + ' + ' + b + ' + ' + ci);
    }
  }
  t.ok(Sim.create(outer, quiet).has('add4/b2/P'), 'nets inside blocks are named by their path');
}

// ---- static timing analysis ------------------------------------------------------------------------------------------
function rippleGates(n) {
  const c = new N.Circuit('ripple' + n), gate = (type, ...ins) => { const g = c.gate(type, ins.length); ins.forEach((s, i) => c.connect(s, g.pin('i' + i))); return g.pin('y'); };
  let carry = c.input('C0').pin('y');
  for (let i = 0; i < n; i++) {
    const a = c.input('A' + i).pin('y'), b = c.input('B' + i).pin('y'), x = gate('XOR', a, b);
    c.connect(gate('XOR', x, carry), c.output('S' + i));
    carry = gate('OR', gate('AND', a, b), gate('AND', x, carry));
  }
  c.connect(carry, c.output('C' + n));
  return c;
}
function lookahead(n) {
  const c = new N.Circuit('cla' + n), gate = (type, ...ins) => { if (ins.length === 1) return ins[0]; const g = c.gate(type, ins.length); ins.forEach((s, i) => c.connect(s, g.pin('i' + i))); return g.pin('y'); };
  const c0 = c.input('C0').pin('y'), p = [], g = [];
  for (let i = 0; i < n; i++) { const a = c.input('A' + i).pin('y'), b = c.input('B' + i).pin('y'); p.push(gate('XOR', a, b)); g.push(gate('AND', a, b)); }
  const carry = [c0];
  for (let i = 1; i <= n; i++) {
    const terms = [];
    for (let j = i - 1; j >= -1; j--) { const lits = []; for (let k = i - 1; k > j; k--) lits.push(p[k]); lits.push(j >= 0 ? g[j] : c0); terms.push(gate('AND', ...lits)); }
    carry.push(gate('OR', ...terms));
  }
  for (let i = 0; i < n; i++) c.connect(gate('XOR', p[i], carry[i]), c.output('S' + i));
  c.connect(carry[n], c.output('C' + n));
  return c;
}
{
  const g = T.presets.CMOS.gate, xor = 12, and = 10, or = 10;
  t.eq([g.XOR[0], g.AND[0], g.OR[0]], [xor, and, or], 'CMOS gate delays as assumed');
  for (const n of [2, 4, 8, 16]) {
    const st = Sim.sta(rippleGates(n), { tech: 'CMOS' });
    t.eq(st.comb, xor + and + or + (n - 1) * (and + or), 'ripple-carry ' + n + ' bits: critical path through every carry');
    t.eq(st.critical.to, 'C' + n, 'ripple critical path ends at the carry out');
    t.eq(st.critical.steps[0].net, n > 1 ? 'A0' : st.critical.steps[0].net, 'ripple critical path starts at bit 0');
    // the same adder simulates correctly
    if (n <= 4) {
      const sim = Sim.create(rippleGates(n), quiet), sl = Sim.create(lookahead(n), quiet);
      for (let v = 0; v < 2 ** (2 * n + 1); v++) {
        for (const s of [sim, sl]) { for (let i = 0; i < n; i++) { s.set('A' + i, bit(v, i)); s.set('B' + i, bit(v, n + i)); } s.set('C0', bit(v, 2 * n)); s.settle(); }
        const want = (v % 2 ** n) + (Math.floor(v / 2 ** n) % 2 ** n) + bit(v, 2 * n);
        for (const s of [sim, sl]) t.eq(V.toNum([...Array(n).keys()].map((i) => s.get('S' + i)).concat([s.get('C' + n)])), want, s.circuit.title + ' adds ' + v);
      }
    }
  }
  // lookahead: XOR for P, then one AND and one OR level (wider gates are 1 ns slower per extra input), then the sum XOR
  const cla = (n) => Sim.sta(lookahead(n), { tech: 'CMOS' }).comb;
  const want = (n) => {
    let worst = 0;
    for (let i = 1; i <= n; i++) {
      const andMax = Math.max(...[...Array(i + 1).keys()].map((k) => (k === 0 ? and : xor + and + Math.max(0, k + 1 - 2))));
      const ci = andMax + or + Math.max(0, i + 1 - 2);
      worst = Math.max(worst, ci, i < n ? ci + xor : 0);
    }
    return worst;
  };
  for (const n of [2, 4, 8]) t.eq(cla(n), want(n), 'carry-lookahead ' + n + ' bits critical path');
  t.ok(cla(8) < Sim.sta(rippleGates(8), { tech: 'CMOS' }).comb / 2, 'lookahead beats ripple at 8 bits');
  t.ok(cla(16) - cla(8) < 20 && Sim.sta(rippleGates(16), { tech: 'CMOS' }).comb - Sim.sta(rippleGates(8), { tech: 'CMOS' }).comb === 8 * (and + or), 'ripple grows by a carry stage per bit, lookahead barely grows');
  const s4 = Sim.sta(D.byId('sync4').build(), { tech: 'CMOS' }), ff = T.presets.CMOS.ff;
  t.eq(s4.tmin, ff.tcq[0] + 3 * and + ff.tsu, 'sync counter: clock-to-Q + three ANDs + setup');
  t.eq(s4.fmax, Math.round(1000000 / (ff.tcq[0] + 3 * and + ff.tsu)) / 1000, 'sync counter maximum frequency');
  t.ok(s4.trace.some((x) => x.kind === 'fmax') && s4.trace.filter((x) => x.kind === 'hop').length >= 4, 'timing trace walks the paths');
  const r4 = Sim.sta(D.byId('ripple4').build(), { tech: 'CMOS' });
  t.eq(r4.comb, 4 * ff.tcq[0], 'ripple counter: the last output settles four clock-to-Q delays after the clock');
  const sh = Sim.sta(D.byId('shift4').build(), { tech: 'CMOS' });
  t.eq(sh.hold.map((h) => h.slack), [0, 1, 2].map(() => Math.min(...ff.tcq) - ff.th), 'shift register hold slack = clock-to-Q − hold time');
  t.eq(sh.hold.length, 3, 'three register-to-register hold checks');
  const sr = Sim.sta(D.byId('srnor').build(), { tech: 'CMOS' });
  t.ok(sr.loops.length > 0, 'cross-coupled latch: loop found and cut');
  const ttl = Sim.sta(rippleGates(4), { tech: 'TTL' }), tg = T.presets.TTL.gate;
  t.eq(ttl.comb, Math.max(tg.XOR[0], tg.XOR[1]) + Math.max(...tg.AND) + Math.max(...tg.OR) + 3 * (Math.max(...tg.AND) + Math.max(...tg.OR)), 'TTL ripple adder uses the slower of rise and fall');
}

// ---- technology presets ---------------------------------------------------------------------------------------------
{
  t.eq(T.presets.TTL.margins, { high: 0.4, low: 0.4 }, 'TTL noise margins');
  t.eq(T.presets['LS-TTL'].margins, { high: 0.7, low: 0.3 }, 'LS-TTL noise margins');
  t.eq(T.presets.CMOS.margins, { high: 1.4, low: 1.4 }, 'CMOS noise margins');
  t.eq(T.presets.TTL.fanoutDC, 10, 'TTL fan-out from currents');
  t.eq(T.presets['LS-TTL'].fanoutDC, 20, 'LS-TTL fan-out from currents');
  t.ok(T.presets['FPGA-like'] === T.presets.FPGA, 'FPGA-like alias');
  const kinds = new Set();
  for (const s of P.list()) if (s.gate || s.tech) kinds.add(s.gate || s.tech({ w: 4, n: 2 }));
  for (const name of T.names) {
    const tech = T.presets[name];
    for (const k of kinds) { const d = T.delay(tech, k, { w: 4, n: 4 }); t.ok(d.length === 2 && d.every((x) => x >= 0 && Number.isFinite(x)), name + ' has a delay for ' + k); }
    for (const k of ['tcq', 'tsu', 'th', 'tw', 'tres']) t.ok(tech.ff[k] !== undefined && tech.latch[k] !== undefined, name + ' has ' + k);
    t.ok(T.describe(tech).length >= 8, name + ' describes itself');
  }
  t.ok(T.delay('CMOS', 'NAND', { n: 4 })[0] > T.delay('CMOS', 'NAND', { n: 2 })[0], 'wider gates are slower');
  // every registry type has a schema, pins and a behaviour
  for (const s of P.list()) {
    t.ok(Array.isArray(s.params) && s.params.every((q) => q.name && q.type && 'default' in q && q.label), s.type + ' has a parameter schema');
    const pins = S.Netlist.pinsOf(s.type, P.defaults(s.type));
    t.ok((pins.length > 0 || s.type === 'BLOCK') && pins.every((q) => q.name && (q.dir === 'in' || q.dir === 'out')), s.type + ' has pins');
    t.ok(s.kind === 'sink' || s.kind === 'block' || s.gate || s.eval || s.edge || s.level || s.start || s.expand, s.type + ' has a behaviour');
    t.ok(s.doc && s.label && s.group, s.type + ' is described');
  }
}

// ---- rewind, snapshots, reset, VCD -------------------------------------------------------------------------------------
{
  const mk = () => { const s = Sim.create(D.byId('sync4').build(), { powerUp: 0, snapEvery: 50 }); s.set('EN', 1); return s; };
  const sim = mk();
  const rec = [];
  for (let tt = 0; tt <= 3000; tt += 37) { sim.stepTo(tt); rec.push([tt, ['Q0', 'Q1', 'Q2', 'Q3'].map((k) => sim.get(k))]); if (tt === 999) sim.set('EN', 0); if (tt === 1998) sim.set('EN', 1); }
  const full = JSON.stringify([...sim.waves]), evs = sim.events.length;
  for (const k of [5, 17, 40, 63, 80, 3, 0]) {
    const [tt, want] = rec[k];
    sim.rewind(tt);
    t.eq(sim.time, tt, 'rewind to ' + tt);
    t.eq(['Q0', 'Q1', 'Q2', 'Q3'].map((x) => sim.get(x)), want, 'state after rewind to ' + tt);
    t.ok(sim.events.every((e) => e.t <= tt), 'event log cut at ' + tt);
  }
  // replay forward with the same inputs: the same history
  const again = mk();
  for (let tt = 0; tt <= 3000; tt += 37) { again.stepTo(tt); if (tt === 999) again.set('EN', 0); if (tt === 1998) again.set('EN', 1); }
  t.eq(JSON.stringify([...again.waves]), full, 'a second run gives the same waves');
  t.eq(again.events.length, evs, 'and the same events');
  // undo events one at a time
  const s2 = mk(), states = [];
  for (let i = 0; i < 120; i++) { s2.stepEvent(); states.push([s2.count, s2.time, ['Q0', 'Q1', 'Q2', 'Q3', 'CLK'].map((x) => s2.get(x))]); }
  for (const k of [118, 100, 64, 10, 3]) {
    s2.back(s2.count - states[k][0]);
    t.eq([s2.count, s2.time, ['Q0', 'Q1', 'Q2', 'Q3', 'CLK'].map((x) => s2.get(x))], states[k], 'back to event ' + states[k][0]);
  }
  const snap = s2.snapshot(), before = s2.get('Q0');
  s2.run(500); s2.restore(snap);
  t.eq([s2.count, s2.get('Q0')], [snap.count, before], 'snapshot and restore');
  sim.reset(); sim.set('EN', 1); sim.run(500);
  const fresh = mk(); fresh.run(500);
  t.eq(JSON.stringify([...sim.waves]), JSON.stringify([...fresh.waves]), 'reset starts over');
  // VCD
  const vcd = Sim.vcd(fresh.waves);
  t.ok(/\$timescale 1ns \$end/.test(vcd) && /\$var wire 1 \S+ Q0 \$end/.test(vcd) && /\$enddefinitions/.test(vcd), 'VCD header');
  const changes = vcd.split('\n').filter((l) => /^[01xz]\S+$/.test(l)).length;
  const total = [...fresh.waves.values()].reduce((s, w) => s + w.length, 0);
  t.ok(changes > 0 && changes <= total, 'VCD has the value changes');
  const fp = Sim.create(N.fromExpression('f', 'AB', 'and-or'), { tech: 'FPGA' });
  fp.set('A', 1); fp.set('B', 1); fp.run(10);
  t.ok(/\$timescale 100ps \$end/.test(Sim.vcd(fp.waves)) && /#6\n/.test(Sim.vcd(fp.waves)), 'VCD picks a finer timescale for fractional times');
  const bw = new Map([['BUS', [[0, [1, 0, 'X', 'Z']], [5, [0, 0, 1, 1]]]]]);
  t.ok(/\$var wire 4 ! BUS \$end/.test(Sim.vcd(bw)) && /bzx01 !/.test(Sim.vcd(bw)) && /#5\nb1100 !/.test(Sim.vcd(bw)), 'VCD bus values MSB first');
}

// ---- the demo circuits ------------------------------------------------------------------------------------------------
const ex = (s) => (env) => N.evaluate(N.parse(s), env);
const combDemos = {
  sop3: { F: "AB' + A'C + BC'" }, pos3: { G: "(A + B + C')(A' + B')(B + C)" }, sop4: { H: "A'BD + AC'D' + BCD' + A'B'C" },
  pos4: { J: "(A + B' + D)(A' + C + D')(B + C' + D')(A + C)" }, sop5: { K: "AB'E + C'D'E' + A'BC + BD'E + A'C'D" },
  pos5: { M: "(A + C' + E)(B' + D + E')(A' + B + C)(C + D' + E)" }, 'same-ao': { P: "WX' + YZ" }, 'same-nn': { P: "WX' + YZ" },
  'same-oa': { P: "WX' + YZ" }, 'same-nor': { P: "WX' + YZ" }, shared: { P: "(AB + C)(D + E')", Q: "(AB + C)E + D'E'" },
  'nand-ml': { F: "(A + BC)(D + E')" }, 'nor-ml': { F: "(A + BC)(D + E')" }, par4: { P: 'D0 ^ D1 ^ D2 ^ D3' }, par8: { P: 'D0 ^ D1 ^ D2 ^ D3 ^ D4 ^ D5 ^ D6 ^ D7' },
  ha: { S: 'A ^ B', C: 'AB' }, cla4: { C1: 'G0 + P0C0', C2: 'G1 + P1G0 + P1P0C0', C3: 'G2 + P2G1 + P2P1G0 + P2P1P0C0', C4: 'G3 + P3G2 + P3P2G1 + P3P2P1G0 + P3P2P1P0C0' },
  dec24: { Y0: "EA1'A0'", Y1: "EA1'A0", Y2: "EA1A0'", Y3: 'EA1A0' }, mux41: { Y: "S1'S0'I0 + S1'S0I1 + S1S0'I2 + S1S0I3" },
  fa: { S: (e) => e.A ^ e.B ^ e.Cin, Cout: (e) => +(e.A + e.B + e.Cin >= 2) },
  rca4: { '*': (e) => { const a = e.A0 + 2 * e.A1 + 4 * e.A2 + 8 * e.A3, b = e.B0 + 2 * e.B1 + 4 * e.B2 + 8 * e.B3, s = a + b + e.C0; return { S0: s & 1, S1: (s >> 1) & 1, S2: (s >> 2) & 1, S3: (s >> 3) & 1, C4: s >> 4 }; } },
  addsub4: { '*': (e) => { const a = e.A0 + 2 * e.A1 + 4 * e.A2 + 8 * e.A3, b = e.B0 + 2 * e.B1 + 4 * e.B2 + 8 * e.B3, bb = e.M ? 15 - b : b, s = a + bb + e.M, r = s & 15; return { S0: r & 1, S1: (r >> 1) & 1, S2: (r >> 2) & 1, S3: r >> 3, C4: s >> 4, V: ovf(e.M ? sgn(a, 4) - sgn(b, 4) : sgn(a, 4) + sgn(b, 4), 4) }; } },
  cmp2: { '*': (e) => { const a = 2 * e.A1 + e.A0, b = 2 * e.B1 + e.B0; return { GT: +(a > b), EQ: +(a === b), LT: +(a < b) }; } },
  dec38: { '*': (e) => { const a = e.A0 + 2 * e.A1 + 4 * e.A2, o = {}; for (let i = 0; i < 8; i++) o['Y' + i] = +(a === i); return o; } },
  prio4: { '*': (e) => { const c = e.D3 ? 3 : e.D2 ? 2 : e.D1 ? 1 : 0; return { Y1: c >> 1, Y0: c & 1, V: +(e.D3 || e.D2 || e.D1 || e.D0) }; } },
  mux81: { Y: (e) => e['D' + (e.S0 + 2 * e.S1 + 4 * e.S2)] },
  muxfn: { F: (e) => +[1, 2, 6, 7].includes(4 * e.A + 2 * e.B + e.C) },
  bcd7: { '*': (e) => { const v = 8 * e.A + 4 * e.B + 2 * e.C + e.D; if (v > 9) return {}; const s = [0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F][v], o = {}; 'abcdefg'.split('').forEach((k, i) => { o[k] = (s >> i) & 1; }); return o; } },
};
const demoDone = new Set();
for (const [id, spec] of Object.entries(combDemos)) {
  const c = D.byId(id).build(), sim = Sim.create(c, quiet);
  const ins = c.parts.filter((p) => p.type === 'IN').map((p) => p.params.name), outs = c.parts.filter((p) => p.type === 'OUT').map((p) => p.params.name);
  for (let v = 0; v < 2 ** ins.length; v++) {
    const env = {};
    ins.forEach((k, i) => { env[k] = bit(v, i); sim.set(k, env[k]); });
    sim.settle();
    let want = {};
    if (spec['*']) want = spec['*'](env); else for (const [k, f] of Object.entries(spec)) want[k] = typeof f === 'string' ? ex(f)(env) : f(env);
    for (const o of outs) if (o in want) t.eq(sim.get(o), want[o], 'demo ' + id + ' ' + JSON.stringify(env) + ' ' + o);
  }
  t.eq(sim.violations.length, 0, 'demo ' + id + ' runs clean');
  demoDone.add(id);
}
/** a clocked demo: drive inputs before each rising edge and compare the outputs after it */
function clocked(id, steps, o) {
  const c = D.byId(id).build();
  if (o && o.period) c.parts.find((p) => p.type === 'CLOCK').params.period = o.period;
  const sim = Sim.create(c, Object.assign({}, quiet, o || {}));
  sim.clockEdge();
  steps(sim);
  t.eq(sim.violations.filter((v) => v.kind !== 'float').map((v) => v.say), [], 'demo ' + id + ' runs clean');
  demoDone.add(id);
}
const q = (sim, n) => V.toNum([...Array(n).keys()].map((i) => sim.get('Q' + i)));
clocked('ripple4', (sim) => { sim.run(60); let want = q(sim, 4); for (let i = 0; i < 40; i++) { sim.clockEdge(); sim.run(60); want = (want + 1) % 16; t.eq(q(sim, 4), want, 'ripple counter counts up: ' + i); } }, { powerUp: 0 });
clocked('sync4', (sim) => {
  sim.set('EN', 1); let want = q(sim, 4);
  for (let i = 0; i < 40; i++) { const en = i % 7 === 5 ? 0 : 1; sim.set('EN', en); sim.clockEdge(); if (en) want = (want + 1) % 16; t.eq(q(sim, 4), want, 'sync counter: ' + i); }
}, { powerUp: 0 });
clocked('mod6', (sim) => { for (let i = 0; i < 30; i++) { const before = q(sim, 3); sim.clockEdge(); t.eq(q(sim, 3), (before + 1) % 6, 'mod-6 counter from ' + before); } }, { powerUp: 0 });
clocked('ring4', (sim) => {
  sim.set('INIT', 1); sim.clockEdge(); t.eq(q(sim, 4), 1, 'ring counter INIT loads 1000 (Q0 = 1)');
  sim.set('INIT', 0); for (let i = 1; i < 20; i++) { sim.clockEdge(); t.eq(q(sim, 4), 1 << (i % 4), 'ring counter step ' + i); }
});
clocked('johnson4', (sim) => {
  sim.set('CLR', 1); sim.clockEdge(); sim.set('CLR', 0);
  const seqJ = [0, 1, 3, 7, 15, 14, 12, 8];
  for (let i = 1; i < 24; i++) { sim.clockEdge(); t.eq(q(sim, 4), seqJ[i % 8], 'Johnson counter step ' + i); }
});
clocked('shift4', (sim) => {
  let reg = [null, null, null, null];
  for (let i = 0; i < 30; i++) { const si = rbit(); sim.set('SI', si); sim.clockEdge(); reg = [si].concat(reg.slice(0, 3)); if (i >= 3) t.eq(q(sim, 4), reg.reduce((s, x, k) => s + x * 2 ** k, 0), 'shift register step ' + i); }
});
clocked('reg4', (sim) => {
  let r = null;
  for (let i = 0; i < 30; i++) { const ld = i === 0 || rbit(), d = Math.floor(R() * 16); sim.set('LD', ld); for (let k = 0; k < 4; k++) sim.set('D' + k, bit(d, k)); sim.clockEdge(); if (ld) r = d; t.eq(q(sim, 4), r, 'register with load step ' + i); }
});
clocked('univ4', (sim) => {
  let r = null;
  for (let i = 0; i < 60; i++) {
    const m = i === 0 ? 3 : Math.floor(R() * 4), ri = rbit(), li = rbit(), d = Math.floor(R() * 16);
    sim.set('S1', m >> 1); sim.set('S0', m & 1); sim.set('RI', ri); sim.set('LI', li); for (let k = 0; k < 4; k++) sim.set('I' + k, bit(d, k));
    sim.clockEdge();
    if (m === 3) r = d; else if (m === 1) r = ((r << 1) | ri) & 15; else if (m === 2) r = (r >> 1) | (li << 3);
    t.eq(q(sim, 4), r, 'universal shift register mode ' + m + ' step ' + i);
  }
});
clocked('mealy', (sim) => {
  let q1 = 0, q0 = 0;
  sim.set('X', 0); for (let i = 0; i < 3; i++) sim.clockEdge();
  for (let i = 0; i < 80; i++) {
    const x = rbit(); sim.set('X', x); sim.run(20);
    t.eq(sim.get('Z'), +(!x && q1), 'Mealy output follows X at once, step ' + i);
    sim.clockEdge();
    [q1, q0] = [+(x && (q1 || q0)), +(x && !q1 && !q0)];
    t.eq(sim.get('Z'), +(!x && q1), 'Mealy output after the edge, step ' + i);
  }
});
clocked('moore', (sim) => {
  let q1 = 0, q0 = 0;
  sim.set('A', 0); for (let i = 0; i < 3; i++) sim.clockEdge();
  for (let i = 0; i < 80; i++) {
    const a = R() < 0.7 ? 1 : 0; sim.set('A', a); sim.clockEdge();
    [q1, q0] = [+(a && (q1 || q0)), +(a && (q1 || !q0))];
    t.eq(sim.get('Y'), +(q1 && q0), 'Moore output depends only on the state, step ' + i);
  }
});
{
  // gate-level latches and flip-flops
  const sr = Sim.create(D.byId('srnor').build(), quiet);
  for (const [s, r, want] of [[1, 0, 1], [0, 0, 1], [0, 1, 0], [0, 0, 0], [1, 0, 1]]) { sr.set('S', s); sr.set('R', r); sr.settle(); t.eq([sr.get('Q'), sr.get("Q'")], [want, 1 - want], 'NOR SR latch S=' + s + ' R=' + r); }
  const sn = Sim.create(D.byId('srnand').build(), quiet);
  for (const [s, r, want] of [[0, 1, 1], [1, 1, 1], [1, 0, 0], [1, 1, 0]]) { sn.set("S'", s); sn.set("R'", r); sn.settle(); t.eq(sn.get('Q'), want, "NAND S'R' latch S'=" + s + " R'=" + r); }
  const dl = Sim.create(D.byId('dlatch').build(), quiet);
  let dq = null;
  for (let i = 0; i < 60; i++) { const en = rbit(), d = rbit(); dl.set('EN', en); dl.settle(); dl.set('D', d); dl.settle(); if (en) dq = d; if (dq !== null) t.eq(dl.get('Q'), dq, 'gated D latch step ' + i); }
  demoDone.add('srnor'); demoDone.add('srnand'); demoDone.add('dlatch');
}
clocked('msd', (sim) => { for (let i = 0; i < 40; i++) { const d = rbit(); sim.set('D', d); sim.clockEdge(); t.eq(sim.get('Q'), d, 'master-slave D flip-flop step ' + i); } });
clocked('jkms', (sim) => {
  // gates in loops power up unknown; put the master and slave latches in a known state by hand
  const h = sim.circuit.hints;
  sim.deposit(h.m.id + '.y', 0).deposit(h.mn.id + '.y', 1).deposit(h.q.id + '.y', 0).deposit(h.qn.id + '.y', 1);
  sim.run(10);
  t.eq([sim.get('Q'), sim.get("Q'")], [0, 1], 'deposited state holds');
  let qq = 0;
  for (let i = 0; i < 60; i++) {
    const j = i < 2 ? 1 - i : rbit(), k = i < 2 ? i : rbit();
    sim.set('J', j); sim.set('K', k); sim.clockEdge(); sim.run(40);
    qq = j && k ? 1 - qq : j ? 1 : k ? 0 : qq;
    t.eq(sim.get('Q'), qq, 'master-slave JK J=' + j + ' K=' + k + ' step ' + i);
  }
});
clocked('datapath', (sim) => {
  const reg = [null, null, null, null];
  let z = null;
  const alu = [(a, b) => (a + b) & 255, (a, b) => (a - b + 256) & 255, (a, b) => a & b, (a, b) => a | b];
  for (let i = 0; i < 120; i++) {
    const din = Math.floor(R() * 256), wa = Math.floor(R() * 4), we = i < 4 ? 1 : rbit(), rs = Math.floor(R() * 4), op = Math.floor(R() * 4), src = i < 4 ? 1 : rbit();
    const w = i < 4 ? i : wa;
    sim.set('DIN', din); sim.set('WA0', w & 1); sim.set('WA1', w >> 1); sim.set('WE', we); sim.set('RS', rs); sim.set('OP', op); sim.set('SRC', src);
    sim.run(30);
    const busv = src ? din : z;
    t.eq(norm(sim.get('BUS')), busv === null ? 'X' : busv, 'datapath bus before edge ' + i);
    sim.clockEdge();
    const a = reg[rs];
    z = a === null || busv === null ? null : alu[op](a, busv);
    if (we) reg[w] = busv;
    for (let k = 0; k < 4; k++) t.eq(norm(sim.get('r' + k + '.q')), reg[k] === null ? 'X' : reg[k], 'datapath R' + k + ' after edge ' + i);
    t.eq(norm(sim.get('z.q')), z === null ? 'X' : z, 'datapath Z after edge ' + i);
  }
}, { period: 400 });
t.eq(D.list().filter((d) => !demoDone.has(d.id)).map((d) => d.id), [], 'every demo circuit checked');

// ---- power-up state and setState --------------------------------------------------------------------------------
{
  // every storage part keeps the power-up state it is given, even when its controls arrive a gate delay late
  const kinds = [['COUNTER', { clr: true }], ['COUNTER', { clr: true, clrLow: true, en: true, ld: true }], ['REG', { clr: true, ld: true }], ['REG', {}], ['SHIFT', { clr: true }], ['USHIFT', {}],
    ['LATCH', {}], ['LATCH', { enLow: true }], ['DFF', { set: true, reset: true }], ['JKFF', { reset: true }], ['TFF', { set: true, asyncLow: true }], ['SRLATCH', {}], ['SRLATCH', { low: true, en: true }], ['DFF', {}]];
  for (const [ty, p] of kinds) {
    // the controls through inverters, so they are still X for a gate delay after time 0
    const c = new N.Circuit('pu'), dut = c.add(ty, p, 'dut'), w = p.w || 4;
    for (const q of dut.pins) {
      if (q.dir === 'out') { c.connect(dut.pin(q.name), c.output(q.name, q.width).pin('a')); continue; }
      const src = c.input(q.name.toUpperCase(), q.width);
      if (q.width === 1) { const g = c.gate('NOT', 1); c.connect(src.pin('y'), g.pin('i0')); c.connect(g.pin('y'), dut.pin(q.name)); } else c.connect(src.pin('y'), dut.pin(q.name));
    }
    const resting = (sim) => {
      // drive every input so that each control rests: the inverted active level
      for (const q of dut.pins.filter((x) => x.dir === 'in')) {
        const low = (q.name === 'clr' && p.clrLow) || (['set', 'rst'].includes(q.name) && p.asyncLow) || (q.name === 'en' && (p.enLow || (ty === 'LATCH' && p.enLow))) || (['s', 'r'].includes(q.name) && p.low);
        sim.set(q.name.toUpperCase(), q.width > 1 ? 0 : low ? 0 : 1);
      }
      return sim;
    };
    for (const pu of [0, 'random', 'X']) {
      const sim = Sim.create(c, { powerUp: pu, log: false });
      resting(sim).run(50);
      const v = norm(sim.get('q'));
      const name = ty + ' ' + JSON.stringify(p) + ' powerUp ' + pu;
      if (pu === 0) t.eq(v, 0, name + ' starts at 0');
      else if (pu === 'random') t.ok(typeof v === 'number', name + ' starts at a known value: ' + JSON.stringify(v));
      else t.ok(v === 'X' || (Array.isArray(sim.get('q')) && sim.get('q').includes('X')), name + ' starts unknown: ' + JSON.stringify(v));
      t.ok(!sim.violations.some((x) => x.kind === 'float'), name + ': no floating input');
    }
  }
  // a counter with a clear input it is never given counts from its power-up state
  const c2 = new N.Circuit('ctr'), u = c2.add('COUNTER', { clr: true }, 'u');
  c2.connect(c2.add('CLOCK', { name: 'CLK', period: 100 }).pin('y'), u.pin('clk'));
  c2.connect(c2.input('CLR', 1).pin('y'), u.pin('clr'));
  c2.connect(u.pin('q'), c2.output('Q', 4).pin('a'));
  const s2 = Sim.create(c2, { powerUp: 0 });
  s2.run(30);
  t.eq(norm(s2.get('Q')), 0, 'counter at power-up 0 reads 0 before any clock');
  for (let i = 1; i <= 5; i++) { s2.clockEdge(); t.eq(norm(s2.get('Q')), i, 'counter from power-up 0 counts without a clear: ' + i); }
  // setState: a starting state, kept by reset(); later, a change that rewind undoes and replays
  const s3 = Sim.create(c2, { powerUp: 'X' });
  s3.setState('u', 9);
  t.eq(norm(s3.get('Q')), 9, 'setState gives the counter 9 at once');
  s3.clockEdge();
  t.eq(norm(s3.get('Q')), 10, 'and it counts on from there');
  s3.reset(); s3.run(30);
  t.eq(norm(s3.get('Q')), 9, 'reset goes back to the state set at time 0');
  s3.clockEdge(); s3.clockEdge();
  const tMid = s3.time;
  s3.setState('u', 3);
  t.eq(norm(s3.get('Q')), 3, 'setState part-way through the run');
  t.ok(s3.events.some((e) => /set to 0011 by hand|set to 3 by hand/.test(e.cause)), 'the change says it was set by hand: ' + (s3.events.filter((e) => e.net === 'Q').slice(-1)[0] || {}).cause);
  s3.clockEdge();
  t.eq(norm(s3.get('Q')), 4, 'counts on from the state set');
  s3.rewind(tMid - 1); s3.stepTo(tMid + 1);
  t.eq(norm(s3.get('Q')), 3, 'rewinding replays the state set');
  s3.setState('u', 'X');
  t.eq(norm(s3.get('Q')), 'X', 'setState X makes it unknown');
  const s4 = Sim.create(P.testCircuit('DFF', { reset: true }), { powerUp: 'X' });
  s4.setState('dut', 1);
  t.eq([s4.get('q'), s4.get('qn')], [1, 0], 'setState on a flip-flop drives Q and Q′');
  let threw = false;
  try { s4.setState('nosuch', 1); } catch (e) { threw = true; }
  t.ok(threw, 'setState on an unknown part throws');
}

// ---- speed ---------------------------------------------------------------------------------------------------------
{
  const c = D.byId('sync4').build();
  const sim = Sim.create(c, { powerUp: 0 });
  sim.set('EN', 1);
  const per = sim.compiled.parts.find((p) => p.type === 'CLOCK').period;
  const t0 = performance.now();
  sim.run(10000 * per);
  const ms = performance.now() - t0;
  t.eq(q(sim, 4), 0, '10,000 clocks bring a 4-bit counter back to 0');
  console.log('speed: 4-bit counter, 10,000 clocks: ' + sim.count + ' events in ' + ms.toFixed(0) + ' ms = ' + Math.round(sim.count / ms * 1000).toLocaleString('en') + ' events/s (log and waves on)');
  // 200 gates of random logic over 16 inputs
  const g = new N.Circuit('random200'), sigs = [];
  for (let i = 0; i < 16; i++) sigs.push(g.input('I' + i).pin('y'));
  const types = ['AND', 'OR', 'NAND', 'NOR', 'XOR', 'XNOR', 'NOT'];
  for (let i = 0; i < 200; i++) {
    const ty = types[Math.floor(R() * types.length)], n = ty === 'NOT' ? 1 : 2 + Math.floor(R() * 2), gg = g.gate(ty, n);
    for (let k = 0; k < n; k++) g.connect(sigs[Math.max(0, sigs.length - 1 - Math.floor(R() * 40))], gg.pin('i' + k));
    sigs.push(gg.pin('y'));
  }
  for (let i = 0; i < 8; i++) g.connect(sigs[sigs.length - 1 - i], g.output('O' + i));
  for (const [label, o] of [['log and waves on', {}], ['log and waves off', quiet]]) {
    const s = Sim.create(g, o);
    const t1 = performance.now();
    for (let k = 0; k < 4000; k++) { s.set('I' + Math.floor(R() * 16), rbit()); s.run(60); }
    const ms2 = performance.now() - t1;
    console.log('speed: 200 random gates, 4,000 input changes: ' + s.count + ' events in ' + ms2.toFixed(0) + ' ms = ' + Math.round(s.count / ms2 * 1000).toLocaleString('en') + ' events/s (' + label + ')');
    t.ok(s.count > 10000, '200-gate circuit is busy');
  }
}
t.done();
