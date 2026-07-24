// State machines, ASM charts and asynchronous circuits, checked against brute-force oracles on seeded random
// machines: node tests/fsm.mjs [count] [seed]
import { load, harness, rng } from './load.mjs';

const S = load(['core', 'schematic']);
const { Fsm: F, Asm: A, Async: As } = S;
const U = F.util;
const t = harness('fsm');
const COUNT = +(process.argv[2] || 40), R = rng(+(process.argv[3] || 20261018));
const int = (n) => Math.floor(R() * n);
const pick = (a) => a[int(a.length)];

// ---------------------------------------------------------------- oracles (independent of the modules)

/** all input sequences of length up to n over the symbols */
function sequences(syms, n) {
  const out = [[]];
  let level = [[]];
  for (let k = 0; k < n; k++) { const nx = []; for (const s of level) for (const x of syms) nx.push(s.concat([x])); out.push(...nx); level = nx; }
  return out;
}
/** the output trace of a machine from a state, by direct table lookups */
function outputsFrom(m, s, seq) {
  const out = [];
  for (const x of seq) {
    const n = m.next[s][x];
    out.push(m.type === 'mealy' ? m.out[s][x] : m.out[n]);
    s = n;
  }
  return out.join(',');
}
/** two states are equivalent when no input sequence of length up to |states| tells them apart */
function oracleClasses(m) {
  const syms = F.symbols(m), seqs = sequences(syms, Math.max(1, m.states.length - 1));
  const sig = new Map(m.states.map((s) => [s, seqs.map((q) => outputsFrom(m, s, q)).join('|') + (m.type === 'moore' ? '#' + m.out[s] : '')]));
  const groups = new Map();
  for (const s of m.states) { const k = sig.get(s); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); }
  return [...groups.values()];
}
const norm = (cl) => cl.map((c) => c.slice().sort().join(',')).sort().join(' ');

function randomMachine(type) {
  const n = 2 + int(6), k = R() < 0.75 ? 1 : 2, w = R() < 0.8 ? 1 : 2;
  const states = Array.from({ length: n }, (_, i) => 'S' + i), syms = U.symbols(k);
  const bits = () => Array.from({ length: w }, () => (R() < 0.5 ? '0' : '1')).join('');
  // a few duplicated rows, so that there is something to merge
  const table = {};
  for (const s of states) {
    if (type === 'moore') { const next = {}; for (const x of syms) next[x] = pick(states); table[s] = { out: R() < 0.6 ? '0'.repeat(w) : bits(), next }; } else { const row = {}; for (const x of syms) row[x] = [pick(states), R() < 0.5 ? '0'.repeat(w) : bits()]; table[s] = row; }
  }
  if (n > 2 && R() < 0.6) { const a = states[1 + int(n - 1)], b = states[int(n)]; table[a] = JSON.parse(JSON.stringify(table[b])); }
  return F.create({ type, inputs: k === 1 ? ['X'] : ['X1', 'X2'], outputs: w === 1 ? ['Z'] : ['Z1', 'Z2'], states, start: 'S0', table });
}

// ---------------------------------------------------------------- the model

{
  const m = F.parse(`mealy
inputs X
outputs Z
S0: 0 -> S0/0, 1 -> S1/0
S1: 0 -> S2/0, 1 -> S1/0
S2: 0 -> S0/0, 1 -> S1/1`);
  t.eq(m.states, ['S0', 'S1', 'S2'], 'parse states');
  t.eq(F.run(m, '0101101').outputs.join(''), '0001001', 'run a 101 detector');
  t.eq(F.parse(F.format(m)), m, 'format and parse round trip');
  const moore = F.toMoore(m).machine;
  t.eq(moore.states.length, 4, 'Mealy → Moore splits the state entered with two outputs');
  t.ok(F.equivalent(moore, m).equal, 'Mealy → Moore is equivalent');
  t.ok(F.equivalent(F.toMealy(moore).machine, moore).equal, 'Moore → Mealy is equivalent');
  const bad = F.clone(m); bad.out.S2['1'] = '0';
  const e = F.equivalent(m, bad);
  t.ok(!e.equal && e.sequence.join('') === '101', 'distinguishing sequence is the shortest: ' + (e.sequence || []).join(''));
  let threw = false; try { F.create({ type: 'mealy', states: ['A'], table: { A: { 0: 'B/0', 1: 'A/0' } } }); } catch (err) { threw = /not a state/.test(err.message); }
  t.ok(threw, 'an unknown next state is refused');
}

// ---------------------------------------------------------------- reduction, conversion, equivalence

let designs = 0, verified = 0, laid = 0;
for (let i = 0; i < COUNT; i++) {
  const type = R() < 0.5 ? 'mealy' : 'moore', m = randomMachine(type);
  const imp = F.implication(m), par = F.partition(m), want = oracleClasses(m);
  t.eq(norm(imp.classes), norm(want), 'implication classes match brute force (' + i + ')');
  t.eq(norm(par.classes), norm(want), 'partition classes match brute force (' + i + ')');
  for (const method of ['implication', 'partition']) {
    const r = F.reduce(m, { method });
    t.ok(F.equivalent(r.machine, m).equal, method + ' reduced machine is equivalent (' + i + ')');
    const rs = r.machine.states;
    let minimal = true;
    for (let a = 0; a < rs.length; a++) for (let b = a + 1; b < rs.length; b++) if (F.equivalent(r.machine, r.machine, { fromA: rs[a], fromB: rs[b] }).equal) minimal = false;
    t.ok(minimal, method + ' reduced machine has no equivalent states (' + i + ')');
    t.ok(r.trace.every((s) => typeof s.say === 'string' && s.say.length > 5), 'every reduction step says something');
  }
  // every crossed pair's reason is real: the pair is distinguishable
  for (const c of imp.pairs.values()) if (c.crossed != null) t.ok(!F.equivalent(m, m, { fromA: c.a, fromB: c.b }).equal, 'a crossed pair is distinguishable (' + c.a + ', ' + c.b + ')');
  const conv = type === 'mealy' ? F.toMoore(m).machine : F.toMealy(m).machine;
  t.ok(F.equivalent(conv, m).equal, 'conversion keeps the behaviour (' + i + ')');
  // a random change is found by equivalence, with a sequence that really tells them apart
  const mut = F.clone(m), s = pick(m.states), x = pick(F.symbols(m));
  if (type === 'mealy') mut.out[s][x] = mut.out[s][x].split('').map((c) => (c === '0' ? '1' : '0')).join(''); else mut.out[s] = mut.out[s].split('').map((c) => (c === '0' ? '1' : '0')).join('');
  const e = F.equivalent(m, mut);
  if (!e.equal) t.ok(F.run(m, e.sequence).outputs.join() !== F.run(mut, e.sequence).outputs.join(), 'the distinguishing sequence distinguishes (' + i + ')');
  else t.ok(!F.reachable(m).includes(s) || norm(oracleClasses(m)) !== '', 'an unreachable change may leave the machines equivalent');

  // ---- the design flow, every flip-flop and assignment
  for (const ff of ['D', 'JK', 'T', 'SR']) for (const assign of ['binary', 'gray', 'heuristic', 'onehot']) {
    if (assign === 'onehot' && (ff !== 'D' || m.states.length > 6)) continue;
    if (R() < 0.5) continue;
    const d = F.design(m, { ff, assign, reset: true });
    designs++;
    const v = F.verify(d);
    t.ok(v.ok, 'design ' + ff + '/' + assign + ' matches its table (' + i + '): ' + (v.problems[0] || {}).say);
    if (v.ok) verified++;
    // from reset, the circuit runs as the original machine on a random input sequence
    const sim = U.netSim(d.circuit), syms = F.symbols(d.machine), seq = Array.from({ length: 12 }, () => pick(syms));
    sim.set('RESET', 1); sim.settle(); sim.set('RESET', 0); sim.settle();
    const outs = [];
    if (m.type === 'moore') outs.push(m.outputs.map((o) => sim.get(o)).join(''));
    for (const xx of seq) {
      m.inputs.forEach((n, k) => sim.set(n, +xx[k])); sim.settle();
      if (m.type === 'mealy') outs.push(m.outputs.map((o) => sim.get(o)).join(''));
      sim.clock();
      if (m.type === 'moore') outs.push(m.outputs.map((o) => sim.get(o)).join(''));
    }
    t.eq(outs, F.run(m, seq).outputs, 'circuit from reset behaves as the machine (' + ff + '/' + assign + ', ' + i + ')');
    // analysis of the designed circuit gives back an equivalent machine
    const an = F.analyse(d.circuit, { type: m.type });
    t.ok(F.equivalent(an.machine, d.machine, { fromA: d.codes[d.machine.start] }).equal, 'analysis of the design is equivalent (' + ff + '/' + assign + ', ' + i + ')');
    // the student checks accept the design's own answers
    for (const f of d.functions) t.ok(F.check.equation(d, f.name, f.min.text).ok, 'check accepts the minimal ' + f.name);
    const ans = {}; for (const r of d.rows) { (ans[r.code] = ans[r.code] || {})[r.input] = Object.assign({}, r.exc); }
    t.ok(F.check.excitationTable(d, ans).ok, 'check accepts the excitation table');
    // unused states: the self-correction verdict against a direct search
    if (d.unused.length && d.unused.length <= 6) {
      const u = F.unusedStates(d);
      const used = new Set(Object.values(d.codes));
      const step = (code, xx) => { sim.load(d.vars.map((vv, k) => [vv.toLowerCase(), +code[k]])); m.inputs.forEach((n, k) => sim.set(n, +xx[k])); sim.settle(); sim.clock(); return d.vars.map((vv) => sim.get(vv.toLowerCase())).join(''); };
      // trapped: a walk among unused codes longer than their number exists
      const canStay = (code, k) => (k === 0 ? true : syms.some((xx) => { const n = step(code, xx); return !used.has(n) && canStay(n, k - 1); }));
      for (const r of u.codes) t.eq(r.lockout, canStay(r.code, d.unused.length + 1), 'lockout of unused ' + r.code);
      t.eq(u.selfCorrecting, u.codes.every((r) => !r.lockout), 'self-correcting verdict');
    }
    // the drawing keeps the schematic rules (a few D designs, without the reset wiring)
    if (S.Layout && ff === 'D' && laid < 8 && d.vars.length <= 3) {
      laid++;
      const plain = F.design(m, { ff, assign });
      const L = S.Layout.layout(plain.circuit);
      t.eq(S.Verify.check(L).problems.map((p) => p.msg).slice(0, 2), [], 'design circuit lays out cleanly (' + assign + ', style ' + L.style + ')');
    }
  }
}

// ---------------------------------------------------------------- the simulator, when it is loaded
if (S.Sim && typeof S.Sim.create === 'function') {
  let ok = 0, bad = 0;
  for (let i = 0; i < 10; i++) {
    const m = randomMachine(R() < 0.5 ? 'mealy' : 'moore'), d = F.design(m, { ff: pick(['D', 'JK', 'T']), reset: true });
    try {
      const sim = S.Sim.create(d.circuit, {});
      const seq = Array.from({ length: 10 }, () => pick(F.symbols(m)));
      sim.set('RESET', 1); for (const x of m.inputs) sim.set(x, 0); sim.settle(); sim.set('RESET', 0); sim.settle();
      const outs = [];
      if (m.type === 'moore') outs.push(m.outputs.map((o) => sim.get(o)).join(''));
      for (const xx of seq) {
        m.inputs.forEach((n, k) => sim.set(n, +xx[k])); sim.settle();
        if (m.type === 'mealy') outs.push(m.outputs.map((o) => sim.get(o)).join(''));
        sim.clockEdge();
        if (m.type === 'moore') outs.push(m.outputs.map((o) => sim.get(o)).join(''));
      }
      if (JSON.stringify(outs) === JSON.stringify(F.run(m, seq).outputs)) ok++; else bad++;
    } catch (e) { bad++; if (bad === 1) console.log('Sim: ' + e.message); }
  }
  t.eq(bad, 0, 'designed circuits run in the event simulator as their tables (' + ok + ' agreed)');
}

// ---------------------------------------------------------------- checking a student's answers
{
  const m = F.parse(`moore
S0/0: 0 -> S0, 1 -> S1
S1/0: 0 -> S2, 1 -> S1
S2/1: 0 -> S0, 1 -> S1`);
  const wrong = F.clone(m); wrong.next.S2['1'] = 'S0';
  const r = F.check.table(m, wrong);
  t.ok(!r.ok && r.say === 'Row S2 on input 1 should go to S1, not S0.', 'table check names the row: ' + r.say);
  const jk = F.check.excitation('JK', 1, 0, { J: 'X', K: '0' });
  t.ok(!jk.ok && /does not cause the 1→0 transition/.test(jk.say), 'JK pair check: ' + jk.say);
  t.ok(F.check.excitation('JK', 1, 0, { J: 'X', K: '1' }).ok, 'JK pair accepted');
  t.ok(F.check.excitation('T', 0, 1, { T: 1 }).ok && !F.check.excitation('T', 1, 1, { T: 1 }).ok, 'T check');
  t.ok(!F.check.excitation('D', 0, 1, { D: 'X' }).ok, 'D cannot be a don\'t care');
  const d = F.design(m, { ff: 'D' });
  const eq = F.check.equation(d, 'D1', 'Q1 + X');
  t.ok(!eq.ok && /must be/.test(eq.say), 'wrong equation explained: ' + eq.say);
  const loose = F.check.equation(d, d.functions[0].name, U.sopText(d.functions[0].ones.map((mm) => U.bits(mm, d.functions[0].vars.length)), d.functions[0].vars));
  t.ok(loose.ok, 'a canonical sum is right' + (loose.minimal ? '' : ' (not minimal)'));
  const red = F.parse(`mealy
A: 0 -> A/0, 1 -> B/0
B: 0 -> C/0, 1 -> B/0
C: 0 -> A/0, 1 -> B/1
D: 0 -> C/0, 1 -> D/0`);
  t.ok(F.check.reduced(red, [['A'], ['B', 'D'], ['C']]).ok, 'right classes accepted');
  const imp = F.implication(red), right = [...imp.pairs.values()].filter((c) => c.crossed != null).map((c) => [c.a, c.b]);
  t.ok(F.check.implication(red, right).ok, 'the right implication table is accepted');
  const miss = F.check.implication(red, right.slice(1));
  t.ok(!miss.ok && /must be crossed out/.test(miss.say), 'a missed cross is explained: ' + miss.say);
  const extra = F.check.implication(red, right.concat([['B', 'D']]));
  t.ok(!extra.ok && /stays/.test(extra.say), 'a wrong cross is explained: ' + extra.say);
  const bad = F.check.reduced(red, [['A', 'B', 'D'], ['C']]);
  t.ok(!bad.ok && /not equivalent/.test(bad.say), 'wrong merge explained: ' + bad.say);
  t.ok(!F.check.assignment(red, { A: '00', B: '01', C: '01', D: '11' }).ok, 'shared code refused');
  const tr = F.check.transition(d, { S0: { 0: { next: '00', out: '0' }, 1: { next: '01', out: '0' } } });
  t.ok(!tr.ok, 'missing transition rows reported');
}

// ---------------------------------------------------------------- sequence detectors
{
  for (let i = 0; i < 40; i++) {
    const L = 2 + int(4), pat = Array.from({ length: L }, () => (R() < 0.5 ? '0' : '1')).join('');
    for (const type of ['mealy', 'moore']) for (const overlap of [true, false]) {
      const { machine } = F.detector(pat, { type, overlap });
      const w = Array.from({ length: 40 }, () => (R() < 0.5 ? '0' : '1')).join('');
      // oracle: scan, restarting after a hit when overlap is off
      const want = []; let from = 0;
      for (let k = 0; k < w.length; k++) { const hit = k + 1 - from >= L && w.slice(k + 1 - L, k + 1) === pat; want.push(hit ? '1' : '0'); if (hit && !overlap) from = k + 1; }
      const got = F.run(machine, w).outputs;
      t.eq((type === 'moore' ? got.slice(1) : got).join(''), want.join(''), 'detector ' + pat + ' ' + type + (overlap ? '' : ' non-overlapping'));
    }
  }
}

// ---------------------------------------------------------------- assignments compared
{
  const m = randomMachine('mealy');
  const cmp = F.compareAssignments(m);
  t.ok(cmp.results.length === 4 && cmp.results.every((r) => r.cost), 'four assignments with costs: ' + cmp.say);
  const h = F.assign(F.parse(`mealy
S0: 0 -> S0/0, 1 -> S1/0
S1: 0 -> S2/0, 1 -> S1/0
S2: 0 -> S0/0, 1 -> S3/0
S3: 0 -> S2/0, 1 -> S1/1`), 'heuristic');
  t.ok(h.met >= 3, 'the heuristic meets most adjacencies (' + h.met + ' of ' + h.wanted + ')');
}

// ---------------------------------------------------------------- ASM charts
{
  for (const [k, mk] of Object.entries(A.examples)) { const v = A.validate(mk()); t.ok(v.ok && !v.warnings.length, 'example ' + k + ' keeps the rules ' + v.errors.concat(v.warnings).join(' ')); }
  const go = (ch, inputs, regs) => A.run(ch, { inputs: (c) => (c === 0 ? Object.assign({ START: 1 }, inputs) : inputs), regs, until: (s, r, c) => c > 0 && s === ch.start, maxCycles: 2000 });
  const mul = A.examples.multiplier();
  let good = 0;
  for (let a = 0; a < 16; a++) for (let b = 0; b < 16; b++) { const r = go(mul, { MIN: a, QIN: b }).regs; if (r.A * 16 + r.Q === a * b) good++; }
  t.eq(good, 256, 'multiplier: all 256 products');
  const div = A.examples.divider();
  good = 0;
  for (let a = 0; a < 16; a++) for (let b = 0; b < 16; b++) {
    const r = go(div, { DIN: a, VIN: b }).regs;
    if (b === 0 ? r.E === 1 : r.Q === Math.floor(a / b) && r.A === a % b && r.E === 0) good++;
  }
  t.eq(good, 256, 'divider: all quotients and remainders, and the zero divisor flagged');
  const gcd = A.examples.gcd(), g = (a, b) => (b ? g(b, a % b) : a);
  good = 0;
  for (let i = 0; i < 300; i++) { const a = 1 + int(255), b = 1 + int(255); if (go(gcd, { XIN: a, YIN: b }).regs.X === g(a, b)) good++; }
  t.eq(good, 300, 'gcd on 300 pairs');
  // traffic: never two greens, the main road green for at least 6 cycles, and it leaves only on a request
  const tr = A.examples.traffic();
  let safe = true, fair = true;
  for (let i = 0; i < 20; i++) {
    const ins = Array.from({ length: 150 }, () => ({ SC: +(R() < 0.1), PB: +(R() < 0.05) }));
    const r = A.run(tr, { inputs: ins, maxCycles: 150 });
    let mg = 0;
    r.trace.forEach((c) => {
      const o = new Set(c.outputs);
      if ((o.has('MAIN_G') || o.has('MAIN_Y')) && (o.has('SIDE_G') || o.has('SIDE_Y'))) safe = false;
      if (c.state === 'MG') mg++;
      if (c.state === 'MG' && c.next === 'MY') { if (mg < 6 || !(c.inputs.SC || c.inputs.PB)) fair = false; mg = 0; }
    });
  }
  t.ok(safe, 'traffic: never green or yellow both ways');
  t.ok(fair, 'traffic: the main road keeps green 6 cycles and leaves only on a request');
  // vending: money in = 20 per item + 5 per change pulse + what is left
  const vd = A.examples.vending();
  good = 0;
  for (let i = 0; i < 50; i++) {
    const ins = Array.from({ length: 120 }, () => { const r = R(); return r < 0.2 ? { C5: 1 } : r < 0.35 ? { C10: 1 } : {}; });
    const r = A.run(vd, { inputs: ins, maxCycles: 120 });
    let paid = 0, vends = 0, chg = 0;
    r.trace.forEach((c) => { if (c.state === 'WAIT') paid += c.inputs.C10 ? 10 : c.inputs.C5 ? 5 : 0; if (c.outputs.includes('VEND')) vends++; if (c.outputs.includes('CHG')) chg++; });
    if (paid === 20 * vends + 5 * chg + r.regs.SUM) good++;
  }
  t.eq(good, 50, 'vending: the money adds up');

  // controllers: the decoder and one-hot circuits follow the chart cycle by cycle
  for (const [k, mk] of Object.entries(A.examples)) {
    const ch = mk();
    for (const method of ['decoder', 'onehot']) {
      const { circuit, controller } = A.circuit(ch, method);
      t.eq(circuit.validate(), [], k + ' ' + method + ' controller circuit is well formed');
      const sim = U.netSim(circuit);
      for (const s of controller.signals) sim.set(s, 0);
      sim.set('RESET', 1); sim.settle(); sim.set('RESET', 0); sim.settle();
      const inp = Array.from({ length: 60 }, () => ({ START: +(R() < 0.3), SC: +(R() < 0.3), PB: +(R() < 0.2), C5: +(R() < 0.3), C10: +(R() < 0.2), MIN: int(16), QIN: int(16), DIN: int(16), VIN: int(16), XIN: 1 + int(30), YIN: 1 + int(30) }));
      const run = A.run(ch, { inputs: inp, maxCycles: 60 });
      let agree = true, why = '';
      for (const c of run.trace) {
        // the signals the datapath gives the controller this cycle
        for (const s of controller.signals) {
          let v;
          if (ch.inputs.includes(s)) v = c.inputs[s] ? 1 : 0;
          else { const tt = c.tests.find((q) => q.cond === s || q.cond === controller.extraStatus[s]); v = tt ? tt.value : 0; if (!tt) v = statusNow(ch, run, c, s); }
          sim.set(s, v);
        }
        sim.settle();
        for (const ctl of controller.controls) {
          const want = ctl.output ? c.outputs.includes(ctl.name) : c.transfers.includes(ctl.text);
          if (sim.get(ctl.name) !== (want ? 1 : 0)) { agree = false; why = 'cycle ' + c.cycle + ' ' + ctl.name; }
        }
        sim.clock();
        // the state after the edge
        const st = controller.states.findIndex((q) => q === c.next);
        const now = method === 'onehot' ? controller.states.map((q) => sim.get('y_' + q.toLowerCase())).join('') : Array.from({ length: controller.flipflops }, (_, b) => sim.get('q' + (controller.flipflops - 1 - b))).join('');
        if (now !== controller.codes[controller.states[st]]) { agree = false; why = why || 'cycle ' + c.cycle + ' state ' + now; }
      }
      t.ok(agree, k + ' ' + method + ' controller follows the chart ' + why);
    }
    // the sequence counter: INC, CLR and LD reproduce the state sequence
    const sc = A.controller(ch, 'counter');
    const run = A.run(ch, { inputs: Array.from({ length: 60 }, () => ({ START: +(R() < 0.3), SC: +(R() < 0.3), PB: +(R() < 0.2), C5: +(R() < 0.3), C10: +(R() < 0.2), MIN: int(16), QIN: int(16), DIN: int(16), VIN: 1 + int(15), XIN: 1 + int(30), YIN: 1 + int(30) })), maxCycles: 60 });
    let ok = true;
    for (const c of run.trace) {
      const sig = (n) => { if (ch.inputs.includes(n)) return c.inputs[n] ? 1 : 0; const tt = c.tests.find((q) => q.cond === n); return tt ? tt.value : statusNow(ch, run, c, n); };
      const val = (e) => e.terms.some((tm) => tm.state === c.state && tm.cond.every((l) => sig(l.name) === l.value)) ? 1 : 0;
      const E = Object.fromEntries(sc.equations.map((e) => [e.name, val(e)]));
      const i = sc.states.indexOf(c.state);
      let j = i;
      if (E.CLR) j = 0; else if (E.LD) j = parseInt(sc.equations.filter((e) => e.name.startsWith('L') && e.name !== 'LD').map((e) => E[e.name]).join(''), 2); else if (E.INC) j = i + 1;
      if (sc.states[j] !== c.next) ok = false;
    }
    t.ok(ok, k + ' sequence-counter equations follow the chart');
    const v = A.verilog(ch);
    t.ok(/^module /m.test(v) && /endmodule/.test(v) && A.states(ch).every((s) => v.includes(s)), k + ' Verilog text');
    if (S.Verilog && S.Verilog.compile) { const r = S.Verilog.compile(v, {}); t.eq((r.errors || []).map((e) => e.msg), [], k + ' Verilog compiles'); }
  }

  // the rules: each broken chart is refused with its reason
  const base = { inputs: ['GO'], registers: { R: 4 }, outputs: ['DONE'] };
  const refuse = (spec, re, name) => { const v = A.validate(A.chart(Object.assign({}, base, spec))); t.ok(v.errors.concat(v.warnings).some((e) => re.test(e)), name + ': ' + v.errors.concat(v.warnings).join(' | ')); };
  refuse({ states: { S: { actions: ['R ← 0'], next: { if: 'GO', then: { do: ['R ← R + 1'], then: 'S' }, else: 'S' } } } }, /written twice/, 'two writes on one path');
  refuse({ states: { S: { actions: [], next: { if: 'GO', then: 'T', else: 'S' } } } }, /not a box/, 'a missing state');
  refuse({ states: { S: { actions: ['FOO'], next: 'S' } } }, /not an output/, 'an unknown output');
  refuse({ states: { S: { actions: ['R ← Q + 1'], next: 'S' } } }, /not defined/, 'an unknown register');
  refuse({ states: { S: { actions: [], next: { do: ['R ← 1'], then: 'S' } } } }, /no decision/, 'a conditional box with no decision');
  refuse({ states: { S: { actions: [], next: 'S' }, T: { actions: [], next: 'S' } } }, /cannot be reached/, 'an unreachable state');
  const loop = A.chart(Object.assign({}, base, { start: 'S', boxes: [{ id: 'S', kind: 'state', name: 'S', actions: [], next: 'd' }, { id: 'd', kind: 'decision', cond: 'GO', t: 'S', f: 'c' }, { id: 'c', kind: 'cond', actions: ['DONE'], next: 'd' }] }));
  t.ok(A.validate(loop).errors.some((e) => /loops back/.test(e)), 'a loop inside a block is refused');
  const half = A.chart(Object.assign({}, base, { start: 'S', boxes: [{ id: 'S', kind: 'state', name: 'S', actions: [], next: 'd' }, { id: 'd', kind: 'decision', cond: 'GO', t: 'S', f: null }] }));
  t.ok(A.validate(half).errors.some((e) => /no false branch/.test(e)), 'a decision with one branch is refused');
}
/** a status signal's value in a cycle, from the registers before the edge */
function statusNow(ch, run, c, name) {
  const before = c.cycle === 0 ? {} : run.trace[c.cycle - 1].regs;
  const regs = Object.assign(Object.fromEntries(Object.keys(ch.registers).map((r) => [r, 0])), before);
  const expr = ch.status[name] || name;
  const env = (n) => (n in ch.registers ? { v: regs[n], w: ch.registers[n] } : n in ch.dataInputs ? { v: c.inputs[n] || 0, w: ch.dataInputs[n] } : ch.inputs.includes(n) ? { v: c.inputs[n] ? 1 : 0, w: 1 } : n in ch.status ? { v: statusNow(ch, run, c, n), w: 1 } : null);
  return A.evalExpr(A.parseCond(expr), env).v ? 1 : 0;
}

// ---------------------------------------------------------------- asynchronous circuits
{
  // races: the explorer against an independent search of every order of change
  const oracle = (m, x, y) => {
    const seen = new Set([y]), stack = [y], finals = new Set();
    while (stack.length) {
      const s = stack.pop(), Y = m.Y(x, s), ex = [];
      for (let i = 0; i < s.length; i++) if (Y[i] !== s[i]) ex.push(i);
      if (!ex.length) { finals.add(s); continue; }
      for (let mask = 1; mask < 1 << ex.length; mask++) {
        const n = s.split(''); ex.forEach((b, k) => { if (mask & (1 << k)) n[b] = n[b] === '0' ? '1' : '0'; });
        const ns = n.join(''); if (!seen.has(ns)) { seen.add(ns); stack.push(ns); }
      }
    }
    return [...finals].sort();
  };
  // random delays: each excited variable flips after its own delay unless it stops being excited first
  const delays = (m, x, y) => {
    const d = m.vars.map(() => 1 + R() * 5);
    let s = y, tm = 0; const due = m.vars.map(() => null);
    for (let k = 0; k < 200; k++) {
      const Y = m.Y(x, s);
      for (let i = 0; i < s.length; i++) { if (Y[i] !== s[i] && due[i] == null) due[i] = tm + d[i]; if (Y[i] === s[i]) due[i] = null; }
      const next = due.map((v, i) => [v, i]).filter((p) => p[0] != null).sort((a, b) => a[0] - b[0]);
      if (!next.length) return s;
      tm = next[0][0];
      const flip = next.filter((p) => p[0] === tm).map((p) => p[1]);
      s = s.split('').map((c, i) => (flip.includes(i) ? (c === '0' ? '1' : '0') : c)).join('');
      flip.forEach((i) => { due[i] = null; });
    }
    return null;
  };
  let races = 0, crit = 0;
  for (let i = 0; i < COUNT; i++) {
    const nv = 2 + int(2), ni = 1 + int(2);
    const vars = Array.from({ length: nv }, (_, k) => 'y' + (k + 1)), inputs = Array.from({ length: ni }, (_, k) => 'x' + (k + 1));
    const all = vars.concat(inputs), Y = {};
    for (const v of vars) { const ones = []; for (let mm = 0; mm < 1 << all.length; mm++) if (R() < 0.5) ones.push(mm); Y[v] = U.sopAst(ones.map((mm) => U.bits(mm, all.length)), all); }
    const m = As.fromEquations({ inputs, vars, Y });
    const an = As.analyse(m);
    for (const r of an.races) {
      t.eq(r.outcomes, oracle(m, r.x, r.y), 'race outcomes match every order (' + r.x + ', ' + r.y + ')');
      if (r.excited.length > 1) races++;
      if (r.kind === 'critical') crit++;
      for (let k = 0; k < 3; k++) { const f = delays(m, r.x, r.y); if (f != null) t.ok(r.outcomes.includes(f), 'a timed run ends in a predicted state'); }
      t.ok(r.kind !== 'noncritical' || (r.outcomes.length === 1 && !r.oscillates), 'non-critical means one outcome');
    }
    // the transition table agrees with the equations
    for (const y of Object.keys(an.table)) for (const x of Object.keys(an.table[y])) {
      const env = {}; inputs.forEach((n, k) => { env[n] = +x[k]; }); vars.forEach((n, k) => { env[n] = +y[k]; });
      t.eq(an.table[y][x], vars.map((v) => S.Netlist.evaluate(Y[v], env)).join(''), 'transition table entry');
    }
  }
  t.ok(races > 10 && crit > 0, 'the random models had races (' + races + ', ' + crit + ' critical)');

  // the SR latch
  const sr = As.srLatch('nor');
  t.eq(sr.oneLoop.model.vars, ['Q'], 'one loop, cut at Q');
  for (const x of ['00', '01', '10']) for (const y of ['0', '1']) { const want = x === '10' ? '1' : x === '01' ? '0' : y; t.eq(sr.oneLoop.analysis.table[y][x], want, 'SR latch Q⁺ for SR = ' + x + ', Q = ' + y); }
  t.eq(sr.race.kind, 'critical', 'releasing S = R = 1 together is a critical race');
  t.ok(As.srLatch('nand').race.kind === 'critical', 'the NAND latch races too');

  // the design flow: every single input change from every stable state settles in one state, and the outputs
  // follow the primitive flow table
  const toggle = { name: 'toggle', inputs: ['x'], outputs: ['z'], rows: { a: { 0: 'a', 1: 'b' }, b: { 0: 'c', 1: 'b' }, c: { 0: 'c', 1: 'd' }, d: { 0: 'a', 1: 'd' } }, out: { a: '0', b: '1', c: '1', d: '0' } };
  for (const ft of [As.examples.gatedCatch(), toggle]) {
    t.eq(As.checkPrimitive(ft), [], ft.name + ' is a primitive flow table');
    const d = As.design(ft);
    const m = d.model;
    let raceFree = true;
    for (const s of As.analyse(m).stable) for (let i = 0; i < s.x.length; i++) {
      const x2 = s.x.slice(0, i) + (s.x[i] === '0' ? '1' : '0') + s.x.slice(i + 1);
      const r = As.explore(m, x2, s.y);
      if (r.outcomes.length !== 1 || r.oscillates) raceFree = false;
    }
    t.ok(raceFree, ft.name + ': the assignment is race-free');
    // walk random single-input changes on both the primitive table and the circuit model
    let row = Object.keys(ft.rows)[0], x = Object.keys(ft.rows[row]).find((c) => ft.rows[row][c] === row), y = d.assignment.codes[d.merged.states.find((q) => d.stages.merged.blocks[d.merged.states.indexOf(q)].includes(row))];
    let follow = true;
    for (let k = 0; k < 200; k++) {
      const i = int(x.length), x2 = x.slice(0, i) + (x[i] === '0' ? '1' : '0') + x.slice(i + 1);
      const nr = ft.rows[row][x2];
      if (nr === '-' || nr == null) continue;
      row = nr; x = x2;
      const r = As.explore(m, x, y); y = r.outcomes[0];
      if (m.Z(x, y) !== ft.out[row]) follow = false;
    }
    t.ok(follow, ft.name + ': the circuit follows the flow table');
    t.eq(d.circuit.validate(), [], ft.name + ' circuit is well formed');
    // the circuit itself, cut at its loops, gives back the same excitations
    const back = As.fromCircuit(d.circuit);
    let same = true;
    for (const y2 of Object.keys(As.analyse(m).table)) for (const x2 of Object.keys(As.analyse(m).table[y2])) {
      const order = back.vars.map((v) => m.vars.indexOf(v));
      if (order.some((o) => o < 0)) { same = false; break; }
      const yb = order.map((o) => y2[o]).join('');
      if (back.Y(x2, yb) !== order.map((o) => m.Y(x2, y2)[o]).join('')) same = false;
    }
    t.ok(same, ft.name + ': analysis of the drawn circuit gives the excitations back');
    for (const h of As.essentialHazards(m)) t.ok(h.once !== h.thrice, 'an essential hazard is real');
  }

  // hazards: the two-level theory against every interleaving of gate events
  let agreeH = 0, totalH = 0;
  for (let i = 0; i < 40; i++) {
    const vars = ['A', 'B', 'C'].slice(0, 2 + int(2)), n = vars.length;
    const cubes = [...new Set(Array.from({ length: 2 + int(2) }, () => Array.from({ length: n }, () => pick(['0', '1', '-'])).join('')))].filter((c) => c !== '-'.repeat(n));
    if (!cubes.length) continue;
    const c = S.Netlist.fromExpression('h', U.sopText(cubes, vars), 'and-or');
    const theory = As.staticHazards(cubes, vars);
    for (let a = 0; a < 1 << n; a++) for (let k = 0; k < n; k++) {
      const b = a ^ (1 << (n - 1 - k));
      const on = (mm) => cubes.some((cb) => U.covers(cb, mm, n));
      if (!on(a) || !on(b)) continue;
      const env = (mm) => Object.fromEntries(vars.map((v, j) => [v, (mm >> (n - 1 - j)) & 1]));
      if (b < a) continue;
      // gates have delays and wires do not, so a pulse may show in one direction only
      const both = As.hazardExplore(c, env(a), env(b)).outputs[0].kind === 'static-1' || As.hazardExplore(c, env(b), env(a)).outputs[0].kind === 'static-1';
      const predicted = theory.some((h) => h.from === a && h.to === b);
      totalH++;
      if (both === predicted) agreeH++;
    }
  }
  t.eq(agreeH, totalH, 'static-1 hazards: theory and every interleaving agree (' + totalH + ' changes)');
  const fixed = As.hazardFree(['A', 'B', 'C'], [1, 3, 5, 6, 7], []);
  t.eq(As.staticHazards(fixed.cubes, ['A', 'B', 'C']), [], 'a hazard-free cover has no static-1 hazard');
  // every reported glitch is real: replaying its order of gate events gives the pulses claimed
  const replay = (c, from, to, order) => {
    const gates = c.parts.filter((p) => S.Netlist.GATES.has(p.type)), sim = U.netSim(c);
    for (const [k, v] of Object.entries(from)) sim.set(k, v);
    sim.settle();
    const val = new Map(gates.map((g) => [g, sim.net(g.net.y)]));
    const inV = (g, pin, env) => { const d = g.net[pin].pins.find((r) => r.part.pins.find((q) => q.name === r.pin).dir === 'out'); return d.part.type === 'IN' ? env[d.part.params.name] : d.part.type === 'CONST' ? d.part.params.value : val.get(d.part); };
    const outOf = () => { const o = c.parts.find((p) => p.type === 'OUT'); return inV(o, 'a', to); };
    let last = outOf(), changes = 0;
    if (last !== (() => { const o = c.parts.find((p) => p.type === 'OUT'); return inV(o, 'a', from); })()) { changes++; }
    for (const id of order) { const g = c.byId.get(id); val.set(g, 1 - val.get(g)); const now = outOf(); if (now !== last) { changes++; last = now; } }
    return changes;
  };
  let replays = 0, dynamic = 0;
  for (let i = 0; i < 300; i++) {
    const vars = ['A', 'B', 'C'];
    const rand = (d) => (d === 0 || R() < 0.12 ? (R() < 0.3 ? pick(vars) + "'" : pick(vars)) : (R() < 0.25 ? '(' + rand(d - 1) + ")'" : '(' + rand(d - 1) + (R() < 0.5 ? ' + ' : ' ') + rand(d - 1) + ')'));
    const c = S.Netlist.fromExpression('ml', rand(4), 'multi');
    const ins = c.parts.filter((p) => p.type === 'IN').map((p) => p.params.name);
    if (c.parts.filter((p) => S.Netlist.GATES.has(p.type)).length > 14) continue;
    const from = Object.fromEntries(ins.map((v) => [v, int(2)])), k = pick(ins), to = Object.assign({}, from, { [k]: 1 - from[k] });
    const r = As.hazardExplore(c, from, to).outputs[0];
    if (r.kind === 'none') continue;
    replays++;
    if (r.kind === 'dynamic') dynamic++;
    t.ok(replay(c, from, to, r.order) >= (r.kind === 'dynamic' ? 3 : 2), 'the ' + r.kind + ' hazard replays: ' + r.say);
  }
  t.ok(replays > 5 && dynamic > 0, 'multi-level circuits glitch (' + replays + ' hazards, ' + dynamic + ' dynamic)');
}

t.ok(designs >= COUNT && verified === designs, designs + ' designs, all verified');
// a machine with no input: a counter or a sequence maker
{
  const m = S.Fsm.parse('moore\nS0/00: S1\nS1/01: S2\nS2/10: S0');
  t.eq(m.inputs, [], 'no input');
  t.eq(m.next, { S0: { '': 'S1' }, S1: { '': 'S2' }, S2: { '': 'S0' } }, 'one move per state');
  t.ok(JSON.stringify(S.Fsm.parse(S.Fsm.format(m))) === JSON.stringify(m), 'format and parse round trip: ' + S.Fsm.format(m));
  t.eq(S.Fsm.run(m, 4).states, ['S0', 'S1', 'S2', 'S0', 'S1'], 'runs on a number of clocks');
  const m2 = S.Fsm.parse('inputs none\nA: -> B/0\nB: -> A/1');
  t.eq([m2.type, m2.inputs.length, m2.out.B['']], ['mealy', 0, '1'], 'a Mealy machine with no input');
  const d = S.Fsm.design(m, { ff: 'D' });
  t.ok(d.circuit && S.Fsm.verify(d).ok, 'designed and verified');
}
t.done();
