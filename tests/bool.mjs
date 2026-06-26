// Property tests of Sirkit.Bool against brute force: node tests/bool.mjs [seed]
// Parser round trips and error positions; functions, canonical forms, expansion, classifiers; minimisation by
// tabulation and by map (equal to the function everywhere, equal in cost, and no smaller cover: exhaustive for
// n <= 4, sampled up to 6); group and cover checks; several outputs; map-entered variables; the prover; every law
// preserving the function on random expressions, proofs replaying; static hazards against three-valued
// simulation and path analysis against random-delay simulation; circuits of every gate style simulated; number
// conversions, complements, signed arithmetic, codes and Hamming codes.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { load, files, harness, rng } from './load.mjs';

let S;
try { S = load(['core']); if (!S || !S.Bool) throw new Error('no Bool'); } catch (err) {
  // another core file failed to load: test the Boolean core on its own
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
  const ctx = vm.createContext({ console, performance });
  for (const f of files(['core']).filter((f) => f === 'core/netlist.js' || /^core\/bool-/.test(f))) vm.runInContext(readFileSync(join(root, f), 'utf8'), ctx, { filename: f });
  S = ctx.Sirkit;
}
const B = S.Bool, N = B.Numbers;
const t = harness('bool');
const rnd = rng(+(process.argv[2] || 11));
const ri = (n) => Math.floor(rnd() * n);
const pick = (a) => a[ri(a.length)];
const VARS = ['A', 'B', 'C', 'D', 'E', 'F'];
const pop = (m) => { let c = 0; while (m) { c += m & 1; m >>>= 1; } return c; };

function randExpr(vs, depth) {
  if (depth <= 0 || rnd() < 0.22) {
    if (rnd() < 0.04) return B.C(ri(2));
    const v = B.V(pick(vs));
    return rnd() < 0.35 ? B.NOT(v) : v;
  }
  const op = pick(['and', 'and', 'or', 'or', 'xor', 'not']);
  if (op === 'not') return B.NOT(randExpr(vs, depth - 1));
  const k = 2 + (rnd() < 0.3 ? 1 : 0);
  const args = [];
  for (let i = 0; i < k; i++) args.push(randExpr(vs, depth - 1));
  return { op, args };
}
function randFn(n, pOne, pDc) {
  const ones = [], dc = [];
  for (let m = 0; m < 1 << n; m++) { const r = rnd(); if (r < pDc) dc.push(m); else if (r < pDc + pOne) ones.push(m); }
  return B.fromMinterms(n, ones, dc);
}
const table = (e, vs) => { const f = B.compile(e, vs); const out = []; for (let m = 0; m < 1 << vs.length; m++) out.push(f(m)); return out.join(''); };
const allVars = (...es) => [...new Set(es.flatMap((e) => B.vars(e)))].sort();

// ---- parser and printer ------------------------------------------------------------------------------------------
for (let i = 0; i < 600; i++) {
  const vs = VARS.slice(0, 1 + ri(5));
  const e = randExpr(vs, 1 + ri(4)), v = allVars(e);
  for (const style of ['prime', 'ascii', 'c', 'overbar', 'dot', 'latex']) {
    if (style === 'latex') { t.ok(typeof B.toString(e, style) === 'string', 'latex prints'); continue; }
    const txt = B.toString(e, style);
    const r = B.tryParse(txt);
    if (!r.ok) { t.ok(false, style + ' reparse failed for ' + txt + ': ' + r.error.msg); continue; }
    t.eq(B.key(r.expr), B.key(e), style + ' round trip of ' + B.toString(e));
    t.eq(table(r.expr, v.length ? v : ['A']), table(e, v.length ? v : ['A']), style + ' same table');
  }
}
{
  const same = [["A'B + C(D+E)'", '~A & B | C & ~(D | E)'], ['A·B̄', "AB'"], ['A̅B̅', "(AB)'"], ['A̅·B̅', "A'B'"], ['!a && b || c', "a'b + c"], ['a AND NOT b OR c', "a b' + c"],
    ['A ⊙ B', "(A ⊕ B)'"], ['A ^ B ^ C', 'A ⊕ B ⊕ C'], ['A + B ⊕ C D', 'A + (B ⊕ (CD))'], ['¬A ∧ B ∨ C', "A'B + C"], ["A''", '~~A'], ['1·A + 0', 'A·1 + 0'], ['A1 A2\'', "A1·A2'"]];
  for (const [a, b] of same) {
    const x = B.tryParse(a), y = B.tryParse(b);
    t.ok(x.ok && y.ok, 'parses ' + a + ' / ' + b + (x.ok ? '' : ': ' + x.error.msg) + (y.ok ? '' : ': ' + y.error.msg));
    if (x.ok && y.ok) t.ok(B.prove(x.expr, y.expr).equal, a + ' equals ' + b);
  }
  const bad = [['(A+B', 0], ['A++B', 2], ['A)', 1], ['', 0], ['A + 10', 4], ['A $ B', 2], ["'A", 0], ['A + ', 4], ['()', 0], ['A(B+)C', 4]];
  for (const [src, pos] of bad) {
    const r = B.tryParse(src);
    t.ok(!r.ok, 'rejects ' + JSON.stringify(src));
    if (!r.ok) { t.eq(r.error.pos, pos, 'error position for ' + JSON.stringify(src)); t.ok(/column|empty|ends/.test(r.error.msg), 'message names a place: ' + r.error.msg); }
  }
  // positions on nodes
  const e = B.parse("A'B + C");
  t.eq(e.at, [0, 7], 'span of the whole');
  t.eq(e.args[1].at, [6, 7], 'span of C');
  // tree and paths
  const tr = B.tree("A(B + C)'");
  t.eq(tr.label, 'AND', 'tree root'); t.eq(tr.children[1].label, 'NOT', 'tree child');
  t.eq(B.toString(B.at(B.parse("A(B + C)'"), [1, 0])), 'B + C', 'subterm by path');
}

// ---- functions -----------------------------------------------------------------------------------------------------
for (let i = 0; i < 400; i++) {
  const n = 1 + ri(5), vs = VARS.slice(0, n);
  const e = randExpr(vs, 1 + ri(4));
  const fn = B.fromExpr(e, vs);
  const f = B.compile(e, vs);
  for (let m = 0; m < 1 << n; m++) t.ok(B.evaluate(e, B.env(m, vs)) === f(m) && (fn.ones.has(m) ? 1 : 0) === f(m), 'evaluate agrees');
  t.ok(B.realises(B.canonicalSOP(fn), fn), 'canonical SOP');
  t.ok(B.realises(B.canonicalPOS(fn), fn), 'canonical POS');
  t.ok(B.fnEqual(B.parseList(B.sigma(fn), vs), fn), 'Σm round trip');
  t.ok(B.fnEqual(B.parseList(B.pi(fn), vs), fn), 'ΠM round trip');
  t.ok(B.fnEqual(B.fromMaxterms(vs, B.maxterms(fn)), fn), 'from maxterms');
  t.ok(B.fnEqual(B.fromTable(vs, B.truthTable(fn).rows.map((r) => r.out)), fn), 'from table');
  t.ok(B.fnEqual(B.dual(B.dual(fn)), fn), 'dual twice');
  t.ok(B.fnEqual(B.fromExpr(B.dualExpr(e), vs), B.dual(fn)), 'dual of the expression is the dual function');
  t.ok(B.fnEqual(B.fromExpr(B.complementExpr(e).expr, vs), B.complement(fn)), 'complement by De Morgan');
  const tt = B.truthTable(e, { vars: vs });
  t.ok(tt.rows.every((r) => r.out === f(r.m)), 'truth table of an expression');
  // classifiers against the definitions
  const N1 = (1 << n) - 1;
  const sd = [...Array(1 << n).keys()].every((m) => fn.ones.has(m) !== fn.ones.has(m ^ N1));
  t.eq(B.selfDual(fn).selfDual, sd, 'self-dual');
  const sym = [...Array(1 << n).keys()].every((m) => [...Array(1 << n).keys()].every((q) => pop(m) !== pop(q) || fn.ones.has(m) === fn.ones.has(q)));
  t.eq(B.symmetric(fn).symmetric, sym, 'symmetric');
  let mono = true;
  for (let m = 0; m < 1 << n; m++) for (let q = 0; q < 1 << n; q++) if ((m & q) === m && fn.ones.has(m) && !fn.ones.has(q)) mono = false;
  t.eq(B.monotone(fn).monotone, mono, 'monotone');
  const th = B.threshold(fn);
  if (th.threshold) for (let m = 0; m < 1 << n; m++) { const sum = vs.reduce((a, v, j) => a + th.weights[j] * ((m >> (n - 1 - j)) & 1), 0); t.ok((sum >= th.T) === fn.ones.has(m), 'threshold weights work'); }
  else if (n <= 3) {
    // exhaustive integer search confirms there are no weights
    let found = false;
    const W = [-3, -2, -1, 0, 1, 2, 3];
    const tryW = (ws) => { for (let T = -9; T <= 10 && !found; T++) { let ok = true; for (let m = 0; m < 1 << n && ok; m++) { const sum = ws.reduce((a, w, j) => a + w * ((m >> (n - 1 - j)) & 1), 0); if ((sum >= T) !== fn.ones.has(m)) ok = false; } if (ok) found = true; } };
    (function rec(ws) { if (found) return; if (ws.length === n) { tryW(ws); return; } for (const w of W) rec(ws.concat(w)); })([]);
    t.ok(!found, 'no threshold weights exist for ' + B.sigma(fn));
  }
}
for (const f2 of B.twoVariable) { const fn = B.fromMinterms(2, f2.ones); t.eq(B.classify2(fn).index, f2.index, 'two-variable ' + f2.name); t.ok(B.fnEqual(B.fromExpr(f2.expr, ['A', 'B']), fn), 'two-variable expression ' + f2.name); }
t.eq(B.countFunctions(3).count.toString(), '256', 'functions of 3 variables');
// expansion of random sums of products and products of sums
for (let i = 0; i < 300; i++) {
  const n = 2 + ri(4), vs = VARS.slice(0, n), form = pick(['sop', 'pos']);
  const terms = [];
  for (let k = 0; k < 1 + ri(4); k++) {
    const ls = vs.filter(() => rnd() < 0.5).map((v) => (rnd() < 0.5 ? B.NOT(B.V(v)) : B.V(v)));
    terms.push(ls.length ? (form === 'sop' ? B.AND(ls) : B.OR(ls)) : B.V(vs[0]));
  }
  const e = form === 'sop' ? B.OR(terms) : B.AND(terms);
  const r = B.expand(e, vs, form);
  t.ok(B.fnEqual(r.fn, B.fromExpr(e, vs)), 'expand ' + form + ' ' + B.toString(e));
  t.ok(r.trace.length >= 2, 'expand traced');
}

// ---- minimisation --------------------------------------------------------------------------------------------------
// brute force for n <= 4: dynamic programming over subsets of the target, using every implicant (prime or not)
function bruteMin(fn, form) {
  const n = fn.vars.length, on = B._target(fn, form).on, okSet = new Set(form === 'pos' ? B.zeros(fn).concat([...fn.dc]) : [...fn.ones, ...fn.dc]);
  if (!on.length) return { terms: 0, literals: 0 };
  const idx = new Map(on.map((m, i) => [m, i]));
  const cubes = [];
  for (let mask = 0; mask < 1 << n; mask++) for (let bits = mask; ; bits = (bits - 1) & mask) {
    let ok = true, cov = 0;
    for (let m = 0; m < 1 << n; m++) if ((m & mask) === bits) { if (!okSet.has(m)) { ok = false; break; } if (idx.has(m)) cov |= 1 << idx.get(m); }
    if (ok && cov) cubes.push({ cov, cost: 100 + pop(mask) });
    if (!bits) break;
  }
  const full = (1 << on.length) - 1, dp = new Float64Array(full + 1).fill(Infinity);
  dp[0] = 0;
  for (let s = 0; s < full; s++) {
    if (dp[s] === Infinity) continue;
    // cover the lowest uncovered cell next
    let low = 0; while ((s >> low) & 1) low++;
    for (const c of cubes) if ((c.cov >> low) & 1) { const s2 = s | c.cov; if (dp[s] + c.cost < dp[s2]) dp[s2] = dp[s] + c.cost; }
  }
  return { terms: Math.floor(dp[full] / 100), literals: dp[full] % 100 };
}
const costOf = (r) => ({ terms: r.cost.terms, literals: r.cost.literals });
for (let i = 0; i < 700; i++) {
  const n = 1 + ri(4), fn = randFn(n, 0.2 + rnd() * 0.6, rnd() < 0.5 ? 0.15 : 0);
  for (const form of ['sop', 'pos']) {
    const q = B.minimise(fn, { form, method: 'qm' }), k = B.minimise(fn, { form, method: 'kmap' });
    t.ok(B.realises(q.expr, fn), 'QM ' + form + ' realises ' + B.sigma(fn) + ': ' + q.text);
    t.ok(B.realises(k.expr, fn), 'map ' + form + ' realises ' + B.sigma(fn));
    t.eq(costOf(q), costOf(k), 'QM and map agree on cost for ' + B.sigma(fn));
    t.eq(costOf(q), bruteMin(fn, form), 'no smaller ' + form + ' cover exists for ' + B.sigma(fn));
    t.ok(q.trace.length > 0 && q.trace[q.trace.length - 1].kind === 'result', 'traced');
    for (const p of q.primes) t.ok(p.minterms.every((m) => (form === 'pos' ? B.value(fn, m) !== 1 : B.value(fn, m) !== 0)), 'prime is an implicant');
  }
}
// n = 5, 6: QM and map agree, and random irredundant covers never beat the minimum
for (let i = 0; i < 120; i++) {
  const n = 5 + ri(2), fn = randFn(n, 0.25 + rnd() * 0.5, rnd() < 0.5 ? 0.1 : 0);
  const form = pick(['sop', 'pos']);
  const q = B.minimise(fn, { form }), k = B.minimise(fn, { form, method: 'kmap' });
  t.ok(B.realises(q.expr, fn), 'QM realises (n = ' + n + ')');
  t.ok(B.realises(k.expr, fn), 'map realises (n = ' + n + ')');
  t.eq(costOf(q), costOf(k), 'QM and map agree (n = ' + n + ')');
  const on = B._target(fn, form).on, primes = q.primes.filter((p) => !p.dcOnly);
  for (let s = 0; s < 40; s++) {
    const left = new Set(on), chosen = [];
    while (left.size) {
      const m = [...left][ri(left.size)];
      const c = pick(primes.filter((p) => B.covers(p.cube, m)));
      chosen.push(c); for (const x of c.minterms) left.delete(x);
    }
    const cost = B.coverCost(chosen);
    t.ok(!B.betterCost(cost, q.cost), 'a sampled cover is not cheaper than the minimum (n = ' + n + ')');
  }
}
// worked cases
{
  const r = B.minimise(B.fromMinterms(3, [0, 1, 2, 5, 6, 7]));
  t.ok(r.trace.some((s) => s.kind === 'cyclic') && r.trace.some((s) => s.kind === 'petrick-choose'), 'cyclic chart goes to Petrick');
  t.eq(r.cost.terms, 3, 'cyclic: 3 terms');
  const z = B.minimise(B.fromMinterms(3, [])), o = B.minimise(B.fromMinterms(3, [0, 1, 2, 3, 4, 5, 6, 7]));
  t.eq(z.text, '0', 'no ones'); t.eq(o.text, '1', 'all ones');
  t.eq(B.minimise(B.fromMinterms(3, [0, 1, 2, 3, 4, 5, 6, 7]), { form: 'pos' }).text, '1', 'POS of 1');
  const cf = B.compareForms(B.fromMinterms(4, [0, 1, 2, 3, 4, 5, 6, 7, 8]));
  t.ok(['sop', 'pos', 'tie'].includes(cf.winner), 'compare forms');
}

// ---- K-map geometry and checks ----------------------------------------------------------------------------------------
for (let n = 1; n <= 6; n++) {
  for (const layout of n === 5 ? ['maps', 'mirror'] : ['maps']) {
    const g = B.kmap(B.fromMinterms(n, []), { layout });
    t.eq(g.cells.length, 1 << n, n + ' variables: one cell per minterm');
    t.eq(new Set(g.cells.map((c) => c.m)).size, 1 << n, 'cells distinct');
    t.eq(new Set(g.cells.map((c) => c.gr + ',' + c.gc)).size, 1 << n, 'positions distinct');
    for (const c of g.cells) {
      const nb = B.kmapNeighbours(g, c.m);
      t.eq(nb.length, n, 'n neighbours');
      for (const x of nb) {
        t.eq(pop(x.m ^ c.m), 1, 'neighbours differ in one bit');
        if (layout === 'maps') t.ok(x.how !== 'mirror', 'no mirror adjacency in plain maps');
        const d = g.cellOf(x.m);
        if (x.how === 'side') t.eq(Math.abs(d.r - c.r) + Math.abs(d.c - c.c), 1, 'side neighbours touch');
      }
      // Gray order: cells next to each other in a row or column are neighbours
      const right = g.cells.find((d) => d.map === c.map && d.r === c.r && d.c === (c.c + 1) % g.cols);
      if (right && right !== c) t.eq(pop(right.m ^ c.m), 1, 'Gray order across');
    }
  }
}
for (let i = 0; i < 300; i++) {
  const n = 2 + ri(5), fn = randFn(n, 0.5, 0.1);
  const r = B.minimise(fn, { method: 'kmap' });
  for (const gr of r.groups) {
    const cells = new Set();
    let area = 0;
    for (const pc of gr.pieces) { area += pc.h * pc.w; for (let a = 0; a < pc.h; a++) for (let b = 0; b < pc.w; b++) cells.add(r.geometry.cells.find((c) => c.map === pc.map && c.r === pc.r + a && c.c === pc.c + b).m); }
    t.eq([...cells].sort((a, b) => a - b), gr.cells, 'pieces cover exactly the group');
    t.eq(area, gr.cells.length, 'pieces do not overlap');
  }
  // checking groups against the definitions
  const sz = 1 << ri(Math.min(n, 4));
  const cells = [...new Set(Array.from({ length: sz }, () => ri(1 << n)))];
  const ck = B.checkGroup(fn, cells);
  const span = B.spanCube(cells, n);
  const isCube = B.cubeSize(span) === cells.length;
  const only = cells.every((m) => B.value(fn, m) !== 0);
  t.eq(ck.ok, isCube && only && (cells.length & (cells.length - 1)) === 0, 'group validity for ' + cells.join(','));
  if (ck.ok) {
    let canGrow = false;
    for (let j = 0; j < n; j++) { const b = 1 << j; if (span.mask & b && B.cubeMinterms(B.cube(n, span.mask & ~b, span.bits)).every((m) => B.value(fn, m) !== 0)) canGrow = true; }
    t.eq(ck.prime, !canGrow, 'prime or not');
    t.ok(ck.reasons.length > 0, 'a reason is given');
  } else t.ok(ck.reasons.length > 0, 'a reason is given for a bad group');
  // whole covers
  const form = pick(['sop', 'pos']);
  const best = B.minimise(fn, { form });
  if (!best.cover.length) continue;
  const groups = best.cover.map((c) => c.minterms);
  t.eq(B.checkCover(fn, groups, { form }).verdict, 'minimal', 'the minimal cover is accepted');
  const extra = best.primes.find((p) => !p.dcOnly && !best.cover.includes(p));
  if (extra) { const v = B.checkCover(fn, groups.concat([extra.minterms]), { form }); t.eq(v.verdict, 'not-minimal', 'an extra prime is not minimal'); t.ok(v.smaller && B.realises(v.smaller.expr, fn), 'a smaller cover is shown'); }
  const on = B._target(fn, form).on;
  const drop = groups.findIndex((g) => g.some((m) => on.includes(m) && groups.filter((h) => h.includes(m)).length === 1));
  if (drop >= 0) { const v = B.checkCover(fn, groups.filter((_, j) => j !== drop), { form }); t.eq(v.verdict, 'wrong', 'a missing group is wrong'); t.ok(on.includes(v.uncovered), 'the uncovered cell is named'); }
  const wrongCell = (form === 'pos' ? [...fn.ones] : B.zeros(fn))[0];
  if (wrongCell != null) { const v = B.checkCover(fn, groups.concat([[wrongCell]]), { form }); t.eq(v.verdict, 'wrong', 'a covered wrong cell'); t.eq(v.covered, wrongCell, 'the wrong cell is named'); }
}
// several outputs and map-entered variables
for (let i = 0; i < 80; i++) {
  const n = 2 + ri(3), k = 2 + ri(2), fns = {};
  for (let j = 0; j < k; j++) fns['F' + j] = randFn(n, 0.45, rnd() < 0.3 ? 0.1 : 0);
  const r = B.minimiseMulti(fns);
  for (const nm of Object.keys(fns)) t.ok(B.realises(r.outputs[nm].expr, fns[nm]), 'multi-output ' + nm + ' realises');
  t.ok(r.cost.terms <= r.separate.terms, 'sharing never needs more distinct terms');
  const km = B.kmapMulti(fns);
  t.eq(Object.keys(km.maps).length, k, 'one map per output');
}
for (let i = 0; i < 150; i++) {
  const n = 3 + ri(3), fn = randFn(n, 0.45, rnd() < 0.4 ? 0.12 : 0);
  const r = B.mevMinimise(fn, { entered: 1 + ri(Math.min(2, n - 2)) });
  t.ok(B.realises(r.expr, fn), 'map-entered variables give the function: ' + B.sigma(fn) + ' -> ' + r.text);
}

// ---- prover -----------------------------------------------------------------------------------------------------------
for (let i = 0; i < 800; i++) {
  const vs = VARS.slice(0, 1 + ri(4));
  const a = randExpr(vs, 1 + ri(3)), b = rnd() < 0.3 ? B.minimise(B.fromExpr(a, allVars(a).length ? allVars(a) : ['A'])).expr : randExpr(vs, 1 + ri(3));
  const v = allVars(a, b), w = v.length ? v : ['A'];
  const same = table(a, w) === table(b, w);
  const r = B.prove(a, b);
  t.eq(r.equal, same, 'prove agrees with the truth tables');
  if (!r.equal) t.ok(B.evaluate(a, Object.assign(Object.fromEntries(w.map((x) => [x, 0])), r.counterexample.env)) !== B.evaluate(b, Object.assign(Object.fromEntries(w.map((x) => [x, 0])), r.counterexample.env)), 'the counterexample really differs');
}

// ---- laws ----------------------------------------------------------------------------------------------------------------
for (let i = 0; i < 500; i++) {
  const vs = VARS.slice(0, 2 + ri(3));
  const e = randExpr(vs, 2 + ri(2)), w = allVars(e).length ? allVars(e) : ['A'];
  const base = table(e, w);
  for (const mv of B.moves(e, { laws: B.laws.map((l) => l.id), addConsensus: true })) {
    t.eq(table(mv.expr, w), base, 'law ' + mv.law + ' keeps ' + B.toString(e) + ' (gave ' + B.toString(mv.expr) + ')');
    const again = B.applyLaw(e, mv.law, mv.path, mv.opts);
    t.ok(again.ok && B.skey(again.expr) === B.skey(mv.expr), 'the step replays: ' + mv.law);
  }
}
{
  const cases = [
    ['identity', 'A + 0', 'A'], ['identity', 'A·1', 'A'], ['null', 'A + 1', '1'], ['null', 'A·0', '0'], ['idempotent', 'A + A', 'A'], ['involution', "A''", 'A'],
    ['complement', "A + A'", '1'], ['complement', "AA'", '0'], ['distributive', 'A(B + C)', 'AB + AC'], ['distributive-or', 'A + BC', '(A + B)(A + C)'],
    ['absorption', 'A + AB', 'A'], ['absorption', 'A(A + B)', 'A'], ['absorption2', "A + A'B", 'A + B'], ['absorption2', "A(A' + B)", 'AB'],
    ['demorgan', "(A + B + C)'", "A'B'C'"], ['demorgan', "(ABC)'", "A' + B' + C'"], ['consensus', "AB + A'C + BC", "AB + A'C"],
    ['consensus', "(A + B)(A' + C)(B + C)", "(A + B)(A' + C)"], ['uniting', "AB + AB'", 'A'], ['uniting', "(A + B)(A + B')", 'A'],
    ['xor-identity', 'A ⊕ 0', 'A'], ['xor-one', 'A ⊕ 1', "A'"], ['xor-self', 'A ⊕ A', '0'], ['xor-complement', "A ⊕ A'", '1'],
    ['xor-def', 'A ⊕ B', "AB' + A'B"], ['xor-fold', "AB' + A'B", 'A ⊕ B'], ['xor-not', "(A ⊕ B)'", "A' ⊕ B"], ['constants', "0'", '1'], ['redundancy', "AB + A'C + BC", "AB + A'C"],
  ];
  for (const [law, from, to] of cases) {
    const r = B.applyLaw(from, law, []);
    t.ok(r.ok, law + ' applies to ' + from + (r.ok ? '' : ': ' + r.why));
    if (r.ok) { t.ok(B.prove(r.expr, to).equal, law + ': ' + from + ' gives ' + to + ' (got ' + B.toString(r.expr) + ')'); t.ok(typeof r.step.say === 'string' && r.step.say.length > 5, law + ' says why'); }
  }
  const refusals = [['absorption', 'A + B'], ['demorgan', 'AB'], ['uniting', "AB + A'C"], ['consensus', 'AB + CD'], ['xor-self', 'A ⊕ B'], ['identity', 'A + B'], ['involution', "A'"], ['distributive', 'AB'], ['redundancy', "AB + A'C"]];
  for (const [law, e] of refusals) { const r = B.applyLaw(e, law, []); t.ok(!r.ok && r.why && r.why.length > 10, law + ' refuses ' + e + ' with a reason'); }
  // explicit operands that do not fit
  const r = B.applyLaw('A + AB + C', 'absorption', [], { args: [2, 1] });
  t.ok(!r.ok && /does not contain/.test(r.why), 'absorption with the wrong operands says why');
  // proofs: simplify, replay, print, JSON
  for (const e of ["AB + A'C + BC", "A'B'C + A'BC + AB'C", "(A + B)(A + B')", "AB' + A'B + AB", "A + A'B", "(A ⊕ B) ⊕ A", "((A + B)'C)'"]) {
    const pr = B.simplify(e);
    const rp = B.replay(pr);
    t.ok(rp.ok, 'proof replays for ' + e);
    t.ok(B.prove(pr.current, e).equal, 'simplify keeps the function of ' + e);
    t.ok(B.literals(pr.current) <= B.literals(e), 'simplify does not add literals');
    t.ok(B.printProof(pr).split('\n').length === pr.steps.length + 1, 'printed proof has a line per step');
    const back = B.proofFromJSON(B.proofJSON(pr));
    t.eq(B.skey(back.current), B.skey(pr.current), 'proof survives JSON');
  }
  t.eq(B.literals(B.simplify("A'B'C + A'BC + AB'C + ABC").current), 1, 'four minterms simplify to C');
  for (const [a, b] of [["A'B'C + A'BC", "A'C"], ['(A + B)(A + C)', 'A + BC'], ["A + A'B", 'A + B'], ["AB + A'C + BC", "AB + A'C"]]) {
    const h = B.hint(a, { target: b });
    t.ok(h.step && h.plan.length, 'hint toward ' + b);
    const pr = B.proof(a, b);
    for (const st of h.plan) B.step(pr, st.law, st.path, st.opts);
    t.ok(B.key(pr.current) === B.key(B.parse(b)), 'the hinted plan reaches ' + b);
    t.ok(B.proveByLaws(a, b).found, 'proveByLaws finds ' + a + ' = ' + b);
  }
  t.ok(B.hint('A + B', { target: 'A' }).refuted, 'hint refuses an unequal target');
  t.ok(B.hint("AB + AB'").step, 'hint toward fewer literals');
  // dualise
  for (const [a, b] of [["A + A'B", 'A + B'], ['A(A + B)', 'A'], ["AB + A'C + BC", "AB + A'C"], ['A + 1', '1']]) {
    const d = B.dualise(a + ' = ' + b);
    t.ok(d.holds && d.dualHolds, 'dual of ' + a + ' = ' + b + ' holds');
  }
  for (let i = 0; i < 200; i++) {
    const e = randExpr(VARS.slice(0, 3), 3), m = B.minimise(B.fromExpr(e, ['A', 'B', 'C'])).expr;
    const d = B.dualise(e, m);
    t.ok(d.holds && d.dualHolds, 'dual of a random identity holds');
  }
}

// ---- implementations ----------------------------------------------------------------------------------------------------
function simulate(c) {
  const ins = c.parts.filter((p) => p.type === 'IN').map((p) => p.params.name).sort();
  const out = c.parts.find((p) => p.type === 'OUT');
  const res = [];
  for (let m = 0; m < 1 << ins.length; m++) {
    const env = B.env(m, ins), memo = new Map();
    const val = (net) => {
      if (memo.has(net)) return memo.get(net);
      const d = net.pins.find((q) => q.part.pins.find((x) => x.name === q.pin).dir === 'out').part;
      const xs = () => d.pins.filter((q) => q.dir === 'in').map((q) => val(d.net[q.name]));
      let v;
      switch (d.type) {
        case 'IN': v = env[d.params.name]; break;
        case 'CONST': v = d.params.value; break;
        case 'NOT': v = 1 - xs()[0]; break;
        case 'BUF': v = xs()[0]; break;
        case 'AND': v = xs().every(Boolean) ? 1 : 0; break;
        case 'OR': v = xs().some(Boolean) ? 1 : 0; break;
        case 'NAND': v = xs().every(Boolean) ? 0 : 1; break;
        case 'NOR': v = xs().some(Boolean) ? 0 : 1; break;
        case 'XOR': v = xs().reduce((a, b) => a ^ b, 0); break;
        case 'XNOR': v = 1 - xs().reduce((a, b) => a ^ b, 0); break;
      }
      memo.set(net, v); return v;
    };
    res.push(val(out.net.a));
  }
  return { ins, res };
}
for (let i = 0; i < 120; i++) {
  const n = 2 + ri(3), fn = randFn(n, 0.2 + rnd() * 0.6, 0);
  for (const style of ['and-or', 'nand-nand', 'or-nand', 'nor-or', 'or-and', 'nor-nor', 'nand-and', 'and-nor', 'aoi', 'oai', 'nand', 'nor', 'multi']) {
    const r = B.implement(fn, style);
    t.ok(B.realises(r.expr, fn), style + ' expression realises the function');
    t.eq(r.circuit.validate(), [], style + ' circuit is well formed');
    const sim = simulate(r.circuit);
    const want = [];
    const vs = fn.vars;
    for (let m = 0; m < 1 << sim.ins.length; m++) { const env = B.env(m, sim.ins); let k = 0; vs.forEach((v, j) => { if (env[v]) k |= 1 << (vs.length - 1 - j); }); want.push(fn.ones.has(k) ? 1 : 0); }
    t.eq(sim.res.join(''), want.join(''), style + ' circuit computes the function');
    if (style === 'nand' || style === 'nor') t.ok(r.circuit.parts.every((p) => ['IN', 'OUT', 'CONST', style.toUpperCase()].includes(p.type)), style + ' circuit uses one gate type');
  }
}
for (let i = 0; i < 200; i++) {
  const e = randExpr(VARS.slice(0, 4), 3);
  if (B.vars(e).length === 0) continue;
  for (const T of ['NAND', 'NOR']) {
    const r = B.bubblePush(e, T);
    t.ok(B.prove(r.expr, e).equal, 'bubble pushing to ' + T + ' keeps ' + B.toString(e));
    const c = r.circuit('F', 'F');
    t.ok(c.parts.every((p) => ['IN', 'OUT', 'CONST', T].includes(p.type)), T + ' only');
    t.ok(r.trace.some((s) => s.kind === 'bp-done'), 'bubble pushing traced');
  }
  const cst = B.cost(e);
  t.ok(cst.levels >= 0 && cst.gates >= 0 && cst.gateInputs >= 2 * cst.gates - (cst.byType.NOT || 0), 'cost is sane');
}

// ---- hazards -------------------------------------------------------------------------------------------------------------
// three-valued simulation: the changing input set to X; a hazard when the output is X but both ends agree
function ternary(e, env) {
  switch (e.op) {
    case 'var': return env[e.name];
    case 'const': return e.v;
    case 'not': { const a = ternary(e.a, env); return a === 'X' ? 'X' : 1 - a; }
    case 'and': { const xs = e.args.map((a) => ternary(a, env)); return xs.includes(0) ? 0 : xs.includes('X') ? 'X' : 1; }
    case 'or': { const xs = e.args.map((a) => ternary(a, env)); return xs.includes(1) ? 1 : xs.includes('X') ? 'X' : 0; }
    case 'xor': { const xs = e.args.map((a) => ternary(a, env)); return xs.includes('X') ? 'X' : xs.reduce((a, b) => a ^ b, 0); }
  }
}
for (let i = 0; i < 400; i++) {
  const n = 2 + ri(4), vs = VARS.slice(0, n), form = pick(['sop', 'pos']);
  let e;
  if (rnd() < 0.5) e = B.minimise(randFn(n, 0.5, 0), { form }).expr;
  else {
    const terms = [];
    for (let k = 0; k < 2 + ri(3); k++) { const ls = vs.filter(() => rnd() < 0.6).map((v) => (rnd() < 0.5 ? B.NOT(B.V(v)) : B.V(v))); if (ls.length) terms.push(form === 'sop' ? B.AND(ls) : B.OR(ls)); }
    if (!terms.length) continue;
    e = form === 'sop' ? B.OR(terms) : B.AND(terms);
  }
  if (e.op === 'const') continue;
  const w = B.vars(e);
  let hz;
  try { hz = B.staticHazards(e, null, form); } catch (err) { t.ok(false, 'staticHazards threw on ' + B.toString(e) + ': ' + err.message); continue; }
  const found = new Set(hz.hazards.map((h) => Math.min(h.from, h.to) + '-' + Math.max(h.from, h.to)));
  const brute = new Set();
  const f = B.compile(e, w), nn = w.length;
  for (let m = 0; m < 1 << nn; m++) for (let j = 0; j < nn; j++) {
    const m2 = m ^ (1 << (nn - 1 - j));
    if (m2 < m || f(m) !== f(m2) || f(m) !== (form === 'sop' ? 1 : 0)) continue;
    const env = B.env(m, w); env[w[j]] = 'X';
    if (ternary(e, env) === 'X') brute.add(m + '-' + m2);
  }
  t.eq([...found].sort(), [...brute].sort(), form + ' static hazards of ' + B.toString(e));
  for (const h of hz.hazards) t.ok(B.covers(h.fix.cube, h.from) && B.covers(h.fix.cube, h.to), 'the fix bridges the pair');
  // the path analysis finds the same static hazards in a two-level form
  const ph = B.pathHazards(e, { vars: w });
  const many = new Set(ph.trace.filter((s) => s.kind === 'too-many-paths').map((s) => s.var));
  const pfound = new Set(ph.hazards.filter((h) => h.kind === (form === 'sop' ? 'static-1' : 'static-0')).map((h) => Math.min(h.from, h.to) + '-' + Math.max(h.from, h.to)));
  for (const k of brute) { const [x, y] = k.split('-').map(Number), v = w[nn - 1 - Math.log2(x ^ y)]; if (!many.has(v)) t.ok(pfound.has(k), 'path analysis also finds ' + k + ' in ' + B.toString(e)); }
}
for (let i = 0; i < 100; i++) {
  const n = 2 + ri(3), fn = randFn(n, 0.55, 0), form = pick(['sop', 'pos']);
  const r = B.hazardFree(fn, form);
  t.ok(B.realises(r.expr, fn), 'hazard-free cover realises the function');
  if (r.cover.length) t.eq(B.staticHazards(fn, r.cover, form).hazards.length, 0, 'hazard-free cover has no static hazards');
}
// random-delay transport simulation of the gate circuit; every glitch seen must be predicted
function glitchSim(c, vs, from, to, delays) {
  const nets = c.nets, val = new Map(), drv = new Map();
  for (const net of nets) drv.set(net, net.pins.find((q) => q.part.pins.find((x) => x.name === q.pin).dir === 'out').part);
  const evalPart = (p) => {
    const xs = p.pins.filter((q) => q.dir === 'in').map((q) => val.get(p.net[q.name]));
    switch (p.type) { case 'NOT': return 1 - xs[0]; case 'AND': return xs.every(Boolean) ? 1 : 0; case 'OR': return xs.some(Boolean) ? 1 : 0; case 'NAND': return xs.every(Boolean) ? 0 : 1; case 'NOR': return xs.some(Boolean) ? 0 : 1; case 'XOR': return xs.reduce((a, b) => a ^ b, 0); case 'XNOR': return 1 - xs.reduce((a, b) => a ^ b, 0); case 'BUF': return xs[0]; }
  };
  // settle at `from`
  const envF = B.env(from, vs), envT = B.env(to, vs);
  for (let k = 0; k < nets.length + 2; k++) for (const net of nets) { const p = drv.get(net); val.set(net, p.type === 'IN' ? envF[p.params.name] : p.type === 'CONST' ? p.params.value : (evalPart(p) ?? 0)); }
  const outNet = c.parts.find((p) => p.type === 'OUT').net.a;
  const seq = [val.get(outNet)];
  const q = [];
  for (const net of nets) { const p = drv.get(net); if (p.type === 'IN' && envF[p.params.name] !== envT[p.params.name]) q.push({ t: 0, net, v: envT[p.params.name] }); }
  let guard = 0;
  while (q.length && guard++ < 5000) {
    q.sort((a, b) => a.t - b.t);
    const ev = q.shift();
    if (val.get(ev.net) === ev.v) continue;
    val.set(ev.net, ev.v);
    if (ev.net === outNet) seq.push(ev.v);
    for (const r of ev.net.pins) { const p = r.part; if (r.part.pins.find((x) => x.name === r.pin).dir !== 'in' || p.type === 'OUT') continue; const y = p.pins.find((x) => x.dir === 'out'); q.push({ t: ev.t + delays.get(p), net: p.net[y.name], v: evalPart(p) }); }
  }
  return seq;
}
let dynSeen = 0;
for (let i = 0; i < 150; i++) {
  const e = randExpr(VARS.slice(0, 3), 3);
  const vs = B.vars(e);
  if (!vs.length || B.paths(e).some((p) => p.node.op === 'const')) continue;
  const c = S.Netlist.fromExpressions('F', { F: B.flatten(e) }, 'multi', { inputs: vs });
  const ce = B.circuitExpr(c);
  t.ok(B.prove(ce, e).equal, 'unfolded circuit equals its expression');
  const an = B.pathHazards(c, { vars: vs });
  const flagged = new Set(an.hazards.map((h) => h.from + '>' + h.to));
  const skipped = new Set(an.trace.filter((s) => s.kind === 'too-many-paths').map((s) => s.var));
  for (let trial = 0; trial < 12; trial++) {
    const delays = new Map(c.parts.map((p) => [p, 0.5 + rnd()]));
    for (let m = 0; m < 1 << vs.length; m++) for (let j = 0; j < vs.length; j++) {
      if (skipped.has(vs[j])) continue;
      const m2 = m ^ (1 << (vs.length - 1 - j));
      const seq = glitchSim(c, vs, m, m2, delays);
      const changes = seq.length - 1, same = seq[0] === seq[seq.length - 1];
      const bad = same ? changes >= 2 : changes >= 3;
      if (bad && !same) dynSeen++;
      if (bad) t.ok(flagged.has(m + '>' + m2), 'a simulated glitch ' + seq.join('') + ' on ' + B.toString(e) + ' from ' + m + ' to ' + m2 + ' is predicted');
      else t.ok(true, 'no glitch');
    }
  }
}
t.ok(dynSeen > 0, 'the simulation produced some dynamic hazards to check');

// ---- XOR and Reed–Muller ---------------------------------------------------------------------------------------------------
for (let i = 0; i < 300; i++) {
  const n = 1 + ri(5), fn = randFn(n, 0.5, 0);
  const pol = rnd() < 0.5 ? null : fn.vars.map(() => ri(2));
  const r = B.reedMuller(fn, pol ? { polarity: pol } : {});
  t.ok(B.realises(r.expr, fn), 'Reed–Muller form realises the function');
  t.ok(B.paths(r.expr).every((p) => p.node.op !== 'or'), 'Reed–Muller uses no OR');
}
for (let n = 1; n <= 6; n++) {
  const vs = VARS.slice(0, n), odd = B.fromExpr(B.parity(vs), vs), tree = B.fromExpr(B.parityTree(vs), vs);
  for (let m = 0; m < 1 << n; m++) { t.eq(odd.ones.has(m), pop(m) % 2 === 1, 'odd function'); t.eq(tree.ones.has(m), pop(m) % 2 === 1, 'parity tree'); }
  t.ok(B.symmetric(odd).symmetric, 'parity is symmetric');
}
for (let i = 0; i < 200; i++) {
  const bits = Array.from({ length: 1 + ri(12) }, () => ri(2)).join('');
  for (const kind of ['even', 'odd']) {
    const p = B.parityBit(bits, kind);
    t.ok(B.parityCheck(bits + p.bit, kind).ok, 'parity bit checks');
    const flipped = bits.split(''); const j = ri(flipped.length); flipped[j] = flipped[j] === '1' ? '0' : '1';
    t.ok(!B.parityCheck(flipped.join('') + p.bit, kind).ok, 'a single flip is caught');
  }
}

// ---- numbers and codes ---------------------------------------------------------------------------------------------------------
for (let i = 0; i < 600; i++) {
  const v = BigInt(ri(1e9)) * BigInt(ri(1000) + 1), a = 2 + ri(35), b = 2 + ri(35);
  const sa = N.write(v, a);
  const r = N.convert(sa, a, b);
  t.eq(N.read(r.result, b).int.toString(), v.toString(), 'integer ' + v + ' from base ' + a + ' to ' + b);
  t.eq(N.convert(r.result, b, a).result, sa, 'and back');
}
for (let i = 0; i < 400; i++) {
  // fractions that end in every base used: k / 2^j between bases 2, 4, 8, 10, 16
  const j = 1 + ri(10), k = ri(1 << j), whole = ri(5000);
  const dec = (whole + k / 2 ** j).toString();
  const to = pick([2, 4, 8, 16]);
  const r = N.convert(dec, 10, to, { fracDigits: 40 });
  t.ok(r.exact, dec + ' ends in base ' + to);
  const back = N.convert(r.result, to, 10, { fracDigits: 40 });
  t.eq(back.result, dec, 'fraction ' + dec + ' round trip through base ' + to);
  const to2 = pick([2, 4, 8, 16]), via = N.convert(r.result, to, to2, { fracDigits: 40 });
  t.eq(N.convert(via.result, to2, 10, { fracDigits: 40 }).result, dec, 'grouping from base ' + to + ' to ' + to2 + ' keeps the value');
}
t.ok(N.convert('0.1', 10, 2).repeating, '0.1 repeats in binary');
t.eq(N.convert('0.1', 10, 3, { fracDigits: 30 }).repeating.digits, '0022', '0.1 in base 3 repeats 0022');
for (let i = 0; i < 300; i++) {
  const base = 2 + ri(15), n = 1 + ri(8);
  const x = Array.from({ length: n }, () => '0123456789ABCDEFG'[ri(base)]).join('');
  const rc = N.complement(x, base, 'r', { digits: n }).result, dc = N.complement(x, base, 'r-1', { digits: n }).result;
  const X = N.read(x, base).int, R = N.read(rc, base).int, D = N.read(dc, base).int, M = BigInt(base) ** BigInt(n);
  t.eq(((X + R) % M).toString(), '0', "r's complement adds to r^n");
  t.eq((X + D).toString(), (M - 1n).toString(), "(r-1)'s complement adds to r^n - 1");
  const y = Array.from({ length: n }, () => '0123456789ABCDEFG'[ri(base)]).join('');
  const s = N.subtract(x, y, base);
  t.eq(N.read(s.result, base).neg ? (-N.read(s.result, base).int).toString() : N.read(s.result, base).int.toString(), (X - N.read(y, base).int).toString(), 'subtraction by complement');
}
for (const bits of [3, 4, 5, 6, 8]) for (const rep of ['sm', '1s', '2s']) {
  const rg = N.range(bits, rep);
  for (let v = rg.min; v <= rg.max; v++) {
    const e = N.encode(v, bits, rep);
    t.ok(e.ok && e.bits.length === bits, 'encode ' + v);
    t.eq(N.decode(e.bits, rep).value, v, rep + ' round trip ' + v);
  }
  t.ok(!N.encode(rg.max + 1, bits, rep).ok && !N.encode(rg.min - 1, bits, rep).ok, 'out of range refused');
  if (bits <= 5) for (let a = rg.min; a <= rg.max; a++) for (let b = rg.min; b <= rg.max; b++) {
    const A = N.encode(a, bits, rep).bits, Bb = N.encode(b, bits, rep).bits;
    const s = N.add(A, Bb, rep), want = a + b, ovf = want < rg.min || want > rg.max;
    t.eq(s.overflow, ovf, rep + ' overflow of ' + a + ' + ' + b);
    if (!ovf) t.eq(s.value, want, rep + ' sum ' + a + ' + ' + b);
    if (rep !== 'sm') { const d = N.sub(A, Bb, rep), wd = a - b, od = wd < rg.min || wd > rg.max; t.eq(d.overflow, od, rep + ' overflow of ' + a + ' - ' + b); if (!od) t.eq(d.value, wd, rep + ' difference ' + a + ' - ' + b); }
  }
}
for (let i = 0; i < 400; i++) {
  const v = ri(100000);
  for (const code of ['bcd', 'excess-3', '2421']) {
    const e = N.encodeDecimal(v, code);
    t.eq(N.decodeDecimal(e.text, code).value, String(v), code + ' round trip');
  }
  const a = ri(10000), b = ri(10000);
  t.eq(N.bcdAdd(a, b).value, String(a + b), 'BCD addition');
}
for (let d = 0; d < 10; d++) {
  const c = N.codes['2421'][d], c9 = N.codes['2421'][9 - d];
  t.eq([...c].map((x) => 1 - x).join(''), c9, '2421 is self-complementing');
  const e3 = N.codes['excess-3'][d], e39 = N.codes['excess-3'][9 - d];
  t.eq([...e3].map((x) => 1 - x).join(''), e39, 'excess-3 is self-complementing');
}
t.eq(N.decodeDecimal('1010', 'bcd').ok, false, 'an unused BCD pattern is refused');
for (let n = 1; n <= 10; n++) {
  const seq = N.graySequence(n);
  for (let k = 0; k < seq.length; k++) {
    const bin = k.toString(2).padStart(n, '0');
    t.eq(N.toGray(bin).gray, seq[k], 'Gray of ' + bin);
    t.eq(N.fromGray(seq[k]).binary, bin, 'binary of Gray ' + seq[k]);
    t.eq(pop(parseInt(seq[k], 2) ^ parseInt(seq[(k + 1) % seq.length], 2)), 1, 'neighbouring Gray codes differ in one bit');
  }
}
for (let c = 32; c < 127; c++) { const ch = String.fromCharCode(c), a = N.ascii(ch, 'even'); t.eq(N.fromAscii(a.bits7).char, ch, 'ASCII round trip'); t.ok(B.parityCheck(a.bits8, 'even').ok, 'ASCII with parity'); }
for (let m = 1; m <= 16; m++) {
  for (let rep = 0; rep < 6; rep++) {
    const data = Array.from({ length: m }, () => ri(2)).join('');
    for (const secded of [false, true]) {
      const e = N.hamming.encode(data, { secded });
      const ok = N.hamming.decode(e.code, { secded });
      t.ok(ok.status === 'ok' && ok.data === data, 'Hamming clean word');
      const L = e.code.length;
      for (let i = 0; i < L; i++) {
        const w = e.code.split(''); w[i] = w[i] === '1' ? '0' : '1';
        const d = N.hamming.decode(w.join(''), { secded });
        t.ok((d.status === 'corrected' || d.status === 'p0') && d.data === data && d.corrected === e.code, 'Hamming corrects bit ' + i + ' of ' + e.code + (secded ? ' (SEC-DED)' : ''));
      }
      if (secded) for (let i = 0; i < L; i++) for (let j = i + 1; j < L; j++) {
        const w = e.code.split(''); w[i] = w[i] === '1' ? '0' : '1'; w[j] = w[j] === '1' ? '0' : '1';
        const d = N.hamming.decode(w.join(''), { secded });
        t.ok(d.status === 'double' || d.status === 'detected', 'SEC-DED detects bits ' + i + ' and ' + j);
      }
    }
  }
}
// declared names of several letters stay whole in letter mode; without them, EN is E·N as before
{
  const e = B.parse("EN'D + QD", { vars: ['EN', 'D', 'QD'] });
  t.eq(B.vars(e), ['D', 'EN', 'QD'], 'declared EN and QD are single variables');
  t.eq(B.evaluate(e, { EN: 0, D: 1, QD: 0 }), 1, "EN' D with EN = 0, D = 1");
  t.eq(B.vars(B.parse("EN'D")), ['D', 'E', 'N'], 'undeclared, EN is two variables');
  t.eq(B.vars(B.parse('E N D', { vars: ['EN', 'D', 'E', 'N'] })), ['D', 'E', 'N'], 'spaces still separate letters');
  t.eq(B.vars(B.parse('END', { vars: ['EN', 'D'] })), ['D', 'EN'], 'the longest declared name that fits, then the rest');
}
t.done();
