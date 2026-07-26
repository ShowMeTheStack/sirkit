// The switch-level CMOS simulator and cells: node tests/cmos.mjs [count] [seed]
import { load, harness, rng } from './load.mjs';

const S = load(['core']);
const C = S.Cmos, Nl = S.Netlist;
const t = harness('cmos');
const COUNT = +(process.argv[2] || 300), R = rng(+(process.argv[3] || 4242));
const int = (n) => Math.floor(R() * n);
const pick = (a) => a[int(a.length)];

function randomExpr(vars, depth) {
  if (depth <= 0 || R() < 0.25) { const v = pick(vars); return R() < 0.3 ? v + "'" : v; }
  const op = pick(['and', 'and', 'or', 'or', 'xor', 'not']);
  if (op === 'not') return '(' + randomExpr(vars, depth - 1) + ")'";
  const k = 2 + int(2), args = [];
  for (let i = 0; i < k; i++) args.push(randomExpr(vars, depth - 1));
  return '(' + args.join(op === 'and' ? ' ' : op === 'or' ? ' + ' : ' ^ ') + ')';
}
const assignments = (vars) => Array.from({ length: 1 << vars.length }, (_, m) => Object.fromEntries(vars.map((v, i) => [v, (m >> (vars.length - 1 - i)) & 1])));

// ---------------------------------------------------------------- cells from random expressions
let stages2 = 0;
for (let i = 0; i < COUNT; i++) {
  const vars = ['A', 'B', 'C', 'D'].slice(0, 2 + int(3));
  const text = randomExpr(vars, 3);
  const cell = C.fromExpression(text);
  if (cell.stages === 2) stages2++;
  const chk = C.check(cell.net, text);
  t.ok(chk.ok, 'cell for ' + text + ': ' + (chk.problems[0] || {}).say);
  // complementary: at the stage output exactly one network conducts, for every input
  const node = cell.stages === 1 ? 'Y' : 'W';
  for (const env of assignments(cell.net.inputs)) {
    const r = C.evaluate(cell.net, env);
    const net = Object.assign({}, cell.net, { outputs: [node] });
    const p = C.evaluate(net, env).paths[node];
    t.ok(!!p.vdd !== !!p.gnd, 'exactly one network conducts for ' + text + ' at ' + JSON.stringify(env));
    t.ok(r.conflict.length === 0, 'no node of ' + text + ' is in conflict');
    // every switch's state matches its gate
    for (const tr of cell.net.transistors) { const g = r.nodes[tr.g].v; t.ok(r.conducts[tr.id] === (tr.type === 'n' ? g === 1 : g === 0), 'switch ' + tr.id + ' follows its gate'); }
  }
  // the pull-down and pull-up are duals: as many switches each
  const n = cell.net.transistors.filter((x) => /^M/.test(x.id) && x.type === 'n').length, p = cell.net.transistors.filter((x) => /^M/.test(x.id) && x.type === 'p').length;
  t.eq(n, p, 'pull-down and pull-up have as many switches (' + text + ')');
}
t.ok(stages2 > 10 && stages2 < COUNT, 'both one-stage and two-stage cells were built');

// ---------------------------------------------------------------- the usual cells
const want = {
  inverter: (e) => 1 - e.A, nand: (e) => 1 - (e.A & e.B), nor: (e) => 1 - (e.A | e.B),
  aoi21: (e) => 1 - ((e.A & e.B) | e.C), aoi22: (e) => 1 - ((e.A & e.B) | (e.C & e.D)),
  oai21: (e) => 1 - ((e.A | e.B) & e.C), oai22: (e) => 1 - ((e.A | e.B) & (e.C | e.D)),
};
for (const [k, f] of Object.entries(want)) {
  const cell = C.cells[k]();
  for (const r of C.table(cell.net)) t.eq([r.out.Y, r.strength.Y], [f(r.inputs), 'driven'], k + ' at ' + JSON.stringify(r.inputs));
}
t.eq(C.cells.nand().net.transistors.length, 4, 'a 2-input NAND has 4 transistors');
t.eq(C.cells.nand(3).net.transistors.length, 6, 'a 3-input NAND has 6 transistors');
t.eq(C.cells.aoi22().net.transistors.length, 8, 'AOI22 has 8 transistors');
{
  const tg = C.cells.tgate().net;
  const rows = C.table(tg);
  for (const r of rows) {
    if (r.inputs.C) t.eq([r.out.Y, r.strength.Y], [r.inputs.A, 'driven'], 'transmission gate passes A while C = 1');
    else t.eq(r.strength.Y, 'floating', 'transmission gate cuts Y off while C = 0');
  }
  // charge kept on the cut-off output
  const on = C.evaluate(tg, { A: 1, C: 1 }), off = C.evaluate(tg, { A: 0, C: 0 }, on.nodes);
  t.eq([off.nodes.Y.v, off.nodes.Y.s], [1, 'charged'], 'the cut-off output keeps its charge');
  const ts = C.cells.tristate().net;
  for (const r of C.table(ts)) t.eq(r.inputs.EN ? [r.out.Y, r.strength.Y] : [r.strength.Y], r.inputs.EN ? [1 - r.inputs.A, 'driven'] : ['floating'], 'tristate inverter ' + JSON.stringify(r.inputs));
  const mx = C.cells.tgmux().net;
  for (const r of C.table(mx)) t.eq([r.out.Y, r.strength.Y], [r.inputs.S ? r.inputs.B : r.inputs.A, 'driven'], 'transmission-gate multiplexer ' + JSON.stringify(r.inputs));
}

// ---------------------------------------------------------------- wrongly built networks
{
  // a NAND whose pull-up is in series (as the pull-down): floats for 01 and 10
  const bad = C.network('bad NAND', { inputs: ['A', 'B'], outputs: ['Y'] });
  bad.n('A', 'Y', 'n1'); bad.n('B', 'n1', 'GND');
  bad.p('A', 'VDD', 'n2'); bad.p('B', 'n2', 'Y');
  const chk = C.check(bad, "(AB)'");
  t.ok(!chk.ok && chk.problems.every((p) => /floats/.test(p.say)) && chk.problems.length === 2, 'a series pull-up leaves Y floating: ' + chk.problems.map((p) => p.say).join(' '));
  // pull-up and pull-down with the same gates: a short for some inputs
  const short = C.network('short', { inputs: ['A', 'B'], outputs: ['Y'] });
  short.n('A', 'Y', 'GND'); short.p('B', 'VDD', 'Y');
  const r = C.evaluate(short, { A: 1, B: 0 });
  t.ok(r.conflict.includes('Y') && /conflict/.test(r.trace.find((s) => s.kind === 'output').say), 'both networks on is a conflict');
  t.eq(C.evaluate(short, { A: 'X', B: 1 }).nodes.Y.v, 'X', 'an unknown gate gives an unknown output when it matters');
  t.eq(C.evaluate(C.cells.nand().net, { A: 0, B: 'X' }).nodes.Y.v, 1, 'an unknown gate does not matter when another switch decides');
  const cell = C.fromExpression("(AB + C)'");
  const res = C.evaluate(cell.net, { A: 1, B: 1, C: 0 });
  t.ok(res.paths.Y.gnd && res.paths.Y.gnd.length === 2 && !res.paths.Y.vdd, 'AOI path to GND through the two series switches');
  t.ok(/connects to GND through/.test(res.trace.find((s) => s.kind === 'output').say), 'the trace names the path');
}

// ---------------------------------------------------------------- transfer curve and families
{
  const v = C.vtc({ vdd: 5, vtn: 0.7, vtp: -0.7, kn: 1, kp: 1 });
  t.ok(Math.abs(v.VM - 2.5) < 0.01, 'a symmetric inverter switches at VDD/2 (' + v.VM + ')');
  t.ok(Math.abs(v.NMH - v.NML) < 0.05, 'and has equal noise margins (' + v.NMH + ', ' + v.NML + ')');
  t.ok(v.VOL < v.VIL && v.VIL < v.VM && v.VM < v.VIH && v.VIH < v.VOH, 'VOL < VIL < VM < VIH < VOH');
  t.ok(v.points.every((p, i) => i === 0 || p[1] <= v.points[i - 1][1] + 1e-9), 'the curve never rises');
  for (let i = 0; i < 20; i++) {
    const p = { vdd: 3 + R() * 2, vtn: 0.4 + R() * 0.4, vtp: -(0.4 + R() * 0.4), kn: 0.5 + R() * 2, kp: 0.5 + R() * 2 };
    const c = C.vtc(p);
    t.ok(Math.abs(c.VM - c.VMformula) < 0.01, 'switching threshold matches the formula');
    t.ok(c.NMH > 0 && c.NML > 0, 'positive noise margins');
  }
  t.ok(C.vtc({ kp: 4 }).VM > C.vtc({ kp: 1 }).VM, 'a stronger pull-up raises the threshold');
  for (const f of C.families()) t.ok(f.NMH > 0 && f.NML > 0 && f.fanout >= 1, f.key + ': ' + f.say);
  t.eq(C.family('LSTTL').fanout, 20, 'LS-TTL drives 20 LS-TTL inputs');
  t.eq(C.family('TTL').fanout, 10, 'standard TTL drives 10 inputs');
  t.ok(!C.interface('TTL', 'HC').ok, 'TTL cannot drive HC inputs: ' + C.interface('TTL', 'HC').say);
  t.ok(C.interface('TTL', 'HCT').ok, 'TTL drives HCT');
  t.ok(C.interface('HC', 'LSTTL').ok, 'HC drives LS-TTL');
}

t.done();
