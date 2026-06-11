// Property tests of the schematic layout engine, in node (no browser): node tests/layout.mjs [count] [seed]
// Random gate circuits from random expressions of 2 to 6 variables (in every style the expression helper
// knows) and random small sequential circuits (flip-flops of each kind, latches, feedback through logic) are
// laid out, and every drawing must keep the geometric invariants: no part over a part, wires only horizontal
// or vertical and never through a part, no two nets along or touching each other, each net one tree that
// reaches all its pins, a junction dot at exactly the T-junctions, labels clear and inside. The expression
// circuits are also simulated, as laid out, against their expressions on every input. Prints the crossing
// counts (wires crossing wires; crossings over rails are expected and counted apart) and the styles used.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { expand } from '../tools/devpage.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const ctx = vm.createContext({ console, performance });
for (const f of [...expand(manifest.core), ...expand(manifest.schematic)]) vm.runInContext(readFileSync(join(root, f), 'utf8'), ctx, { filename: f });
const S = ctx.Sirkit, N = S.Netlist;

const COUNT = +(process.argv[2] || 120), SEED = +(process.argv[3] || 7);
let seed = SEED >>> 0;
const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const VARS = ['A', 'B', 'C', 'D', 'E', 'F'];

function randomExpr(vars, depth) {
  if (depth <= 0 || rnd() < 0.25) { const v = pick(vars); return rnd() < 0.35 ? v + "'" : v; }
  const op = pick(['and', 'and', 'or', 'or', 'xor', 'not']);
  if (op === 'not') return '(' + randomExpr(vars, depth - 1) + ")'";
  const k = 2 + Math.floor(rnd() * 2), args = [];
  for (let i = 0; i < k; i++) args.push(randomExpr(vars, depth - 1));
  return '(' + args.join(op === 'and' ? ' ' : op === 'or' ? ' + ' : ' ^ ') + ')';
}
function randomSop(vars, pos) {
  const terms = [];
  const n = 2 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const lits = vars.filter(() => rnd() < 0.6).map((v) => (rnd() < 0.5 ? v + "'" : v));
    if (!lits.length) lits.push(pick(vars));
    terms.push(pos ? '(' + lits.join(' + ') + ')' : lits.join(''));
  }
  return terms.join(pos ? '' : ' + ');
}

/** the value of every output of a gate circuit for one input assignment */
function simulate(c, env) {
  const val = new Map();
  const of = (r) => {
    const k = r.part.id + '.' + r.pin;
    if (val.has(k)) return val.get(k);
    const p = r.part, ins = p.pins.filter((q) => q.dir === 'in').map((q) => { const n = p.net[q.name]; return of(n.pins.find((x) => x.part.pins.find((y) => y.name === x.pin).dir === 'out')); });
    let v;
    switch (p.type) {
      case 'IN': v = env[p.params.name]; break;
      case 'CONST': v = p.params.value; break;
      case 'NOT': v = 1 - ins[0]; break;
      case 'BUF': v = ins[0]; break;
      case 'AND': v = ins.every(Boolean) ? 1 : 0; break;
      case 'NAND': v = ins.every(Boolean) ? 0 : 1; break;
      case 'OR': v = ins.some(Boolean) ? 1 : 0; break;
      case 'NOR': v = ins.some(Boolean) ? 0 : 1; break;
      case 'XOR': v = ins.reduce((a, b) => a ^ b, 0); break;
      case 'XNOR': v = 1 - ins.reduce((a, b) => a ^ b, 0); break;
      default: throw new Error('cannot simulate ' + p.type);
    }
    val.set(k, v);
    return v;
  };
  const out = {};
  for (const p of c.parts) if (p.type === 'OUT') { const n = p.net.a; out[p.params.name] = of(n.pins.find((x) => x.part.pins.find((y) => y.name === x.pin).dir === 'out')); }
  return out;
}

function randomSequential(i) {
  const c = new N.Circuit('seq' + i);
  const nIn = 1 + Math.floor(rnd() * 2), nFF = 1 + Math.floor(rnd() * 3);
  const ins = [];
  for (let k = 0; k < nIn; k++) ins.push(c.input('X' + k).pin('y'));
  const clk = c.clock('CLK').pin('y');
  const ffs = [];
  for (let k = 0; k < nFF; k++) {
    const type = pick(['DFF', 'DFF', 'JKFF', 'TFF']);
    ffs.push(c.add(type, { qn: rnd() < 0.5, reset: rnd() < 0.3 }));
  }
  const sigs = () => ins.concat(ffs.map((f) => f.pin('q'))).concat(ffs.filter((f) => f.pins.some((q) => q.name === 'qn')).map((f) => f.pin('qn')));
  const gate = (depth) => {
    if (depth <= 0 || rnd() < 0.3) return pick(sigs());
    const t = pick(['AND', 'OR', 'NAND', 'XOR', 'NOR']);
    const g = c.gate(t, 2 + Math.floor(rnd() * 2));
    g.pins.filter((q) => q.dir === 'in').forEach((q) => c.connect(gate(depth - 1), g.pin(q.name)));
    return g.pin('y');
  };
  const rst = rnd() < 0.5 ? c.input('RST').pin('y') : null;
  for (const f of ffs) {
    c.connect(clk, f.pin('clk'));
    for (const q of f.pins.filter((p) => p.dir === 'in' && p.name !== 'clk' && p.name !== 'rst')) c.connect(gate(2), f.pin(q.name));
    if (f.pins.some((p) => p.name === 'rst')) c.connect(rst || c.constant(0).pin('y'), f.pin('rst'));
  }
  if (rnd() < 0.4) {
    // a latch of two cross-coupled gates as well
    const t = pick(['NOR', 'NAND']), g1 = c.gate(t, 2), g2 = c.gate(t, 2);
    c.connect(pick(ins), g1.pin('i0')); c.connect(pick(sigs()), g2.pin('i1'));
    c.connect(g1.pin('y'), g2.pin('i0')); c.connect(g2.pin('y'), g1.pin('i1'), c.output('L'));
  }
  ffs.forEach((f, k) => c.connect(f.pin('q'), c.output('Q' + k)));
  if (rnd() < 0.6) c.connect(gate(2), c.output('Z'));
  // whatever is left unconnected is left open on purpose
  for (const p of c.parts) for (const q of p.pins) if (!p.net[q.name]) c.leaveOpen(p.pin(q.name));
  return c;
}

const stats = { expr: [], seq: [], styles: {} };
let problems = 0, sims = 0, simFail = 0;
const t0 = Date.now();
const fail = (what, c, list) => { problems += list.length; console.log('FAIL ' + what + ': ' + list.slice(0, 5).map((p) => p.kind + ' ' + p.msg).join('; ')); };
const STYLES = ['multi', 'multi', 'nand', 'nor', 'and-or', 'nand-nand', 'or-and', 'nor-nor'];
for (let i = 0; i < COUNT; i++) {
  const nv = 2 + (i % 5), vars = VARS.slice(0, nv), style = STYLES[i % STYLES.length];
  const outs = {};
  const nOut = 1 + (rnd() < 0.3 ? 1 : 0);
  for (let o = 0; o < nOut; o++) {
    let e = style === 'and-or' || style === 'nand-nand' ? randomSop(vars, false) : style === 'or-and' || style === 'nor-nor' ? randomSop(vars, true) : randomExpr(vars, 3);
    if (style === 'nand' || style === 'nor') e = e.replace(/\^/g, '+');
    outs['F' + o] = e;
  }
  let c;
  try { c = N.fromExpressions('expr' + i, outs, style); } catch (err) { console.log('FAIL building ' + JSON.stringify(outs) + ' as ' + style + ': ' + err.message); problems++; continue; }
  const v0 = c.validate();
  if (v0.length) { fail('netlist ' + JSON.stringify(outs), c, v0.map((m) => ({ kind: 'netlist', msg: m }))); continue; }
  const res = S.Layout.layout(c, { variants: [{}, { seed: 1 }] });
  const v = S.Verify.check(res);
  if (v.problems.length) fail(style + ' ' + JSON.stringify(outs), c, v.problems);
  stats.expr.push(res.crossingCount);
  stats.styles[res.style] = (stats.styles[res.style] || 0) + 1;
  // the circuit (as laid out: a style may swap the inputs of a commutative gate) computes its expressions
  const used = [...new Set(Object.values(outs).flatMap((e) => [...N.vars(N.parse(e))]))];
  for (let m = 0; m < 1 << used.length; m++) {
    const env = {}; used.forEach((v, k) => { env[v] = (m >> k) & 1; });
    const got = simulate(c, env);
    sims++;
    for (const [k, e] of Object.entries(outs)) if (got[k] !== N.evaluate(N.parse(e), env)) { simFail++; if (simFail < 5) console.log('FAIL ' + style + ' ' + k + ' = ' + e + ' wrong at ' + JSON.stringify(env)); }
  }

}
for (let i = 0; i < Math.round(COUNT / 2); i++) {
  const c = randomSequential(i);
  const v0 = c.validate();
  if (v0.length) { fail('sequential netlist ' + i, c, v0.map((m) => ({ kind: 'netlist', msg: m }))); continue; }
  const res = S.Layout.layout(c, { variants: [{}, { seed: 1 }] });
  const v = S.Verify.check(res);
  if (v.problems.length) fail('sequential ' + i, c, v.problems);
  stats.seq.push(res.crossingCount);
  stats.styles[res.style] = (stats.styles[res.style] || 0) + 1;
}

// ---- the drafting styles on the circuits the engines build ----------------------------------------------------
const styleFail = (what, msg) => { problems++; console.log('FAIL ' + what + ': ' + msg); };
const check = (what, c, want, maxCross) => {
  const res = S.Layout.layout(c), v = S.Verify.check(res).problems;
  if (res.style !== want) styleFail(what, 'drawn in the ' + res.style + ' style, not ' + want);
  if (v.length) styleFail(what, v.slice(0, 3).map((p) => p.msg).join('; '));
  if (res.crossingCount > (maxCross || 0)) styleFail(what, res.crossingCount + ' irregular crossings');
  return res;
};
{
  // two-level functions, degenerate ones too (constants, single literals, variables no term uses): rails
  const B = S.Bool;
  let n = 0;
  for (let i = 0; i < 80; i++) {
    const nv = 2 + Math.floor(rnd() * 4), vars = VARS.slice(0, nv), all = 1 << nv, kind = pick(['sop', 'const', 'lit', 'unused']);
    let ones = [...Array(all).keys()].filter(() => rnd() < 0.45);
    if (kind === 'const') ones = rnd() < 0.5 ? [] : [...Array(all).keys()];
    if (kind === 'lit') { const v = Math.floor(rnd() * nv), neg = rnd() < 0.5; ones = [...Array(all).keys()].filter((m) => ((m >> (nv - 1 - v)) & 1) ^ (neg ? 1 : 0)); }
    if (kind === 'unused') { const bit = 1 << (nv - 1 - Math.floor(rnd() * nv)); ones = [...Array(all).keys()].filter((m) => ones.includes(m & ~bit)); }
    const form = pick(['and-or', 'nand-nand', 'or-and', 'nor-nor']), c = B.implement(B.fromMinterms(vars, ones), form).circuit;
    check('rails ' + kind + ' ' + form + ' ' + JSON.stringify(ones), c, 'rails');
    for (let m = 0; m < all; m++) { const env = {}; vars.forEach((v, k) => { env[v] = (m >> (nv - 1 - k)) & 1; }); if (simulate(c, env).F !== (ones.includes(m) ? 1 : 0)) { simFail++; break; } }
    n++;
  }
  // designed state machines, every flip-flop kind, with and without a reset: the state machine style, clean
  const F = S.Fsm, U = F.util;
  const machine = () => {
    const k = rnd() < 0.75 ? 1 : 2, w = rnd() < 0.8 ? 1 : 2, states = Array.from({ length: 2 + Math.floor(rnd() * 6) }, (_, i) => 'S' + i), syms = U.symbols(k), table = {}, type = rnd() < 0.5 ? 'mealy' : 'moore';
    const bits = () => Array.from({ length: w }, () => (rnd() < 0.5 ? '0' : '1')).join('');
    for (const s of states) {
      if (type === 'moore') { const next = {}; for (const x of syms) next[x] = pick(states); table[s] = { out: bits(), next }; } else { const row = {}; for (const x of syms) row[x] = [pick(states), bits()]; table[s] = row; }
    }
    return F.create({ type, inputs: k === 1 ? ['X'] : ['X1', 'X2'], outputs: w === 1 ? ['Z'] : ['Z1', 'Z2'], states, start: 'S0', table });
  };
  let nf = 0;
  for (let i = 0; i < 50; i++) {
    const ff = pick(['D', 'JK', 'T', 'SR']), reset = rnd() < 0.5, d = F.design(machine(), { ff, assign: pick(['binary', 'gray', 'heuristic']), reset });
    if (check('state machine ' + i + ' (' + ff + (reset ? ', reset' : '') + ')', d.circuit, 'fsm').style === 'fsm') nf++;
  }
  // the controllers of every ASM chart, each method
  for (const [k, mk] of Object.entries(S.Asm.examples)) for (const method of ['decoder', 'onehot', 'counter']) check('controller ' + k + ' ' + method, S.Asm.circuit(mk(), method).circuit, 'fsm');
  // the Verilog page's examples, synthesised: drawn as blocks or a state machine, and the blocks behave as the gates do
  const vx = vm.createContext({ Sirkit: {} });
  vm.runInContext(readFileSync(join(root, 'app/verilog-examples.js'), 'utf8'), vx);
  for (const [id, want] of [['fsm', 'fsm'], ['counter', 'single'], ['dreg', 'single']]) {
    const src = vx.Sirkit.VerilogExamples.find((e) => e.id === id).files[0].text, top = /module\s+(\w+)/.exec(src)[1];
    const c = S.Verilog.synthesise(S.Verilog.compile(src, { top }), { top });
    check('synthesised ' + top, c, want);
    const g = c.gateLevel(), a = S.Sim.create(c, { powerUp: 0, log: false }), b = S.Sim.create(g, { powerUp: 0, log: false });
    const ins = c.parts.filter((p) => p.type === 'IN'), outs = c.parts.filter((p) => p.type === 'OUT').map((p) => p.params.name);
    const clk = ins.find((p) => /clk/.test(p.params.name));
    let same = true;
    for (let k = 0; k < 40 && same; k++) {
      for (const p of ins) if (p !== clk) { const v = Math.floor(rnd() * 2 ** (p.params.w || 1)) % 2 ** (p.params.w || 1), r = /rst/.test(p.params.name) && k > 2 ? (/_n$/.test(p.params.name) ? 1 : 0) : v; a.set(p.params.name, r); b.set(p.params.name, r); }
      for (const s of [a, b]) { s.set(clk.params.name, 0); s.run(300); s.set(clk.params.name, 1); s.run(300); }
      for (const o of outs) if (JSON.stringify(a.get(o)) !== JSON.stringify(b.get(o))) { same = false; styleFail('synthesised ' + top, o + ' is ' + JSON.stringify(a.get(o)) + ' as blocks but ' + JSON.stringify(b.get(o)) + ' as gates'); }
    }
  }
  console.log('styles: ' + n + ' two-level functions in the rails style, ' + nf + '/50 designed state machines and every ASM controller in the state machine style, the Verilog examples as blocks');
}
const sum = (a) => a.reduce((s, x) => s + x, 0);
const desc = (a) => a.length + ' circuits, crossings mean ' + (sum(a) / a.length).toFixed(1) + ', max ' + Math.max(...a) + ', none in ' + a.filter((x) => !x).length;
console.log('expressions (2-6 variables): ' + desc(stats.expr));
console.log('sequential: ' + desc(stats.seq));
console.log('styles used: ' + Object.entries(stats.styles).map(([k, n]) => k + ' ' + n).join(', ') + '; irregular crossings only (those over rails are expected)');
console.log('simulated ' + sims + ' input rows of the expression circuits: ' + (simFail ? simFail + ' wrong' : 'all right'));
console.log('tests/layout: ' + (stats.expr.length + stats.seq.length) + ' random circuits laid out in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s: ' + (problems || simFail ? problems + ' layout problems, ' + simFail + ' wrong outputs' : 'no problems'));
process.exit(problems || simFail ? 1 : 0);
