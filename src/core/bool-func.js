// Boolean functions: truth tables, minterm and maxterm lists, Σm and ΠM notation, don't-cares, canonical forms,
// complement and dual, expanding non-standard terms into minterms, the 16 functions of two variables, the
// classifiers (self-dual, symmetric, monotone, threshold), cubes (the implicants every minimiser works with),
// and the prover.
// A function is Fn = {vars:[...], ones:Set<number>, dc:Set<number>}; minterm m has the first variable as its
// high bit, so over A, B, C the minterm 5 = 101 is AB'C.
(function (S) {
  'use strict';
  const B = S.Bool = S.Bool || {};
  const { V, C, NOT } = B;
  const P = (x) => B.P(x);
  const NAMES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const nameVars = (vs) => (typeof vs === 'number' ? NAMES.slice(0, vs) : vs.slice());
  B.nameVars = nameVars;
  const sorted = (s) => [...s].sort((a, b) => a - b);
  const listStr = (a) => a.join(', ');

  // ---- function objects ----------------------------------------------------------------------------------------
  function make(vs, ones, dc) {
    vs = nameVars(vs);
    const N = 1 << vs.length, o = new Set(), d = new Set();
    for (const m of dc || []) { if (m < 0 || m >= N || m !== Math.floor(m)) throw new Error('minterm ' + m + ' is out of range for ' + vs.length + ' variables'); d.add(m); }
    for (const m of ones || []) { if (m < 0 || m >= N || m !== Math.floor(m)) throw new Error('minterm ' + m + ' is out of range for ' + vs.length + ' variables'); if (d.has(m)) throw new Error('minterm ' + m + ' is listed both as a 1 and as a don\'t-care'); o.add(m); }
    return { vars: vs, ones: o, dc: d };
  }
  B.fromMinterms = (vs, ones, dc) => make(vs, ones, dc);
  B.fromMaxterms = (vs, zeros, dc) => {
    vs = nameVars(vs);
    const z = new Set(zeros), d = new Set(dc || []), ones = [];
    for (let m = 0; m < 1 << vs.length; m++) if (!z.has(m) && !d.has(m)) ones.push(m);
    for (const m of z) if (d.has(m)) throw new Error('maxterm ' + m + ' is listed both as a 0 and as a don\'t-care');
    return make(vs, ones, d);
  };
  /** outs[m] is 0, 1, or 'X' / '-' / 'd' for a don't-care */
  B.fromTable = (vs, outs) => {
    vs = nameVars(vs);
    if (outs.length !== 1 << vs.length) throw new Error('a table over ' + vs.length + ' variables has ' + (1 << vs.length) + ' rows, not ' + outs.length);
    const ones = [], dc = [];
    outs.forEach((v, m) => { if (v === 1 || v === '1' || v === true) ones.push(m); else if (v === 'X' || v === 'x' || v === '-' || v === 'd') dc.push(m); });
    return make(vs, ones, dc);
  };
  /** the function of an expression; vars defaults to the expression's own, sorted */
  B.fromExpr = (e, vs) => {
    e = P(e);
    vs = vs ? nameVars(vs) : B.vars(e);
    const f = B.compile(e, vs), ones = [];
    for (let m = 0; m < 1 << vs.length; m++) if (f(m)) ones.push(m);
    return make(vs, ones, []);
  };
  const asFn = (x, vs) => (x && x.ones ? x : B.fromExpr(x, vs));
  B.asFn = asFn;
  B.value = (fn, m) => (fn.dc.has(m) ? 'X' : fn.ones.has(m) ? 1 : 0);
  B.zeros = (fn) => { const z = []; for (let m = 0; m < 1 << fn.vars.length; m++) if (!fn.ones.has(m) && !fn.dc.has(m)) z.push(m); return z; };
  B.minterms = (fn) => sorted(fn.ones);
  B.maxterms = (fn) => B.zeros(fn);
  B.dontCares = (fn) => sorted(fn.dc);
  /** the same function over a longer variable list (the new variables do not matter) */
  B.widen = (fn, vs) => {
    vs = nameVars(vs);
    const pos = fn.vars.map((v) => { const i = vs.indexOf(v); if (i < 0) throw new Error(v + ' is not in ' + vs.join(', ')); return vs.length - 1 - i; });
    const n = fn.vars.length, ones = [], dc = [];
    for (let m = 0; m < 1 << vs.length; m++) {
      let k = 0;
      for (let i = 0; i < n; i++) k |= ((m >> pos[i]) & 1) << (n - 1 - i);
      if (fn.ones.has(k)) ones.push(m); else if (fn.dc.has(k)) dc.push(m);
    }
    return make(vs, ones, dc);
  };
  B.fnEqual = (a, b) => a.vars.join() === b.vars.join() && a.ones.size === b.ones.size && a.dc.size === b.dc.size && [...a.ones].every((m) => b.ones.has(m)) && [...a.dc].every((m) => b.dc.has(m));
  /** true when expression e gives f's value on every cared-for input */
  B.realises = (e, fn) => { const f = B.compile(P(e), fn.vars); for (let m = 0; m < 1 << fn.vars.length; m++) { if (fn.dc.has(m)) continue; if (f(m) !== (fn.ones.has(m) ? 1 : 0)) return false; } return true; };

  // ---- truth tables ------------------------------------------------------------------------------------------------
  /**
   * truthTable(fn | expression | text, {vars}) -> {vars, rows:[{m, bits:[..], out}], cols?}
   * For an expression each row also has vals: the value of every compound subterm, listed in cols
   * (innermost first), so the table can be filled column by column.
   */
  B.truthTable = (x, opts) => {
    opts = opts || {};
    if (x && x.ones) {
      const n = x.vars.length, rows = [];
      for (let m = 0; m < 1 << n; m++) rows.push({ m, bits: B.bits(m, n).split('').map(Number), out: B.value(x, m) });
      return { vars: x.vars.slice(), rows };
    }
    const e = P(x), vs = opts.vars ? nameVars(opts.vars) : B.vars(e), n = vs.length;
    const cols = [];
    (function post(t, p) { B.kids(t).forEach((k, i) => post(k, p.concat(i))); if (t.op !== 'var' && t.op !== 'const' && !(t.op === 'not' && t.a.op === 'var')) cols.push({ path: p, text: B.toString(t, opts.style), node: t }); })(e, []);
    const fs = cols.map((c) => B.compile(c.node, vs)), top = B.compile(e, vs), rows = [];
    for (let m = 0; m < 1 << n; m++) rows.push({ m, bits: B.bits(m, n).split('').map(Number), vals: fs.map((f) => f(m)), out: top(m) });
    return { vars: vs, rows, cols: cols.map((c) => ({ path: c.path, text: c.text })) };
  };

  // ---- notation ------------------------------------------------------------------------------------------------------
  B.sigma = (fn) => 'Σm(' + listStr(B.minterms(fn)) + ')' + (fn.dc.size ? ' + d(' + listStr(B.dontCares(fn)) + ')' : '');
  B.pi = (fn) => 'ΠM(' + listStr(B.maxterms(fn)) + ')' + (fn.dc.size ? ' · D(' + listStr(B.dontCares(fn)) + ')' : '');
  /**
   * read Σ/Π notation: "Σm(1,3,5) + d(2)", "m(1,3)", "sum(1,3) + dc(2)", "ΠM(0,2)·D(5)", "M(0, 2)", "prod(0,2)"
   */
  B.parseList = (text, vs) => {
    const t = text.replace(/\s+/g, '');
    const re = /(Σm|Σ|sum|m|ΠM|Π|prod|M|Σd|d|dc|D|X)\(([0-9,]*)\)/g;
    let kind = null, list = [], dc = [], k, seen = 0;
    while ((k = re.exec(t))) {
      seen += k[0].length;
      const nums = k[2] ? k[2].split(',').filter((s) => s !== '').map(Number) : [];
      const tag = k[1];
      if (['Σd', 'd', 'dc', 'D', 'X'].includes(tag)) dc = dc.concat(nums);
      else { const kk = ['ΠM', 'Π', 'prod', 'M'].includes(tag) ? 'pi' : 'sigma'; if (kind && kind !== kk) throw new Error('mixes a minterm list with a maxterm list'); kind = kk; list = list.concat(nums); }
    }
    if (!kind) throw new Error('expected a list such as Σm(1, 3) or ΠM(0, 2)');
    const rest = t.replace(re, '').replace(/[+·*.]/g, '');
    if (rest.length) throw new Error('could not read "' + rest + '"');
    if (vs == null) { const mx = Math.max(0, ...list, ...dc); vs = Math.max(1, Math.ceil(Math.log2(mx + 1))); }
    return kind === 'pi' ? B.fromMaxterms(vs, list, dc) : B.fromMinterms(vs, list, dc);
  };
  /** Σm to ΠM and back, traced */
  B.convertList = (fn, to) => {
    const all = 1 << fn.vars.length, trace = [];
    const ones = B.minterms(fn), zeros = B.maxterms(fn), dcs = B.dontCares(fn);
    trace.push({ kind: 'list-start', say: (to === 'pi' ? 'F = ' + B.sigma(fn) : 'F = ' + B.pi(fn)) + ' over ' + fn.vars.length + ' variables, so the numbers run from 0 to ' + (all - 1) + '.' });
    if (to === 'pi') trace.push({ kind: 'list-missing', list: zeros, say: 'The maxterms are the numbers not listed as minterms' + (dcs.length ? ' or don\'t-cares' : '') + ': ' + (zeros.length ? listStr(zeros) : 'none') + '.' });
    else trace.push({ kind: 'list-missing', list: ones, say: 'The minterms are the numbers not listed as maxterms' + (dcs.length ? ' or don\'t-cares' : '') + ': ' + (ones.length ? listStr(ones) : 'none') + '.' });
    if (dcs.length) trace.push({ kind: 'list-dc', list: dcs, say: 'The don\'t-cares ' + listStr(dcs) + ' stay don\'t-cares in both forms.' });
    const text = to === 'pi' ? B.pi(fn) : B.sigma(fn);
    trace.push({ kind: 'list-done', text, say: 'F = ' + text + '.' });
    return { text, trace };
  };

  // ---- canonical forms -------------------------------------------------------------------------------------------------
  const lit = (v, pos) => (pos ? V(v) : NOT(V(v)));
  B.minterm = (m, vs) => { vs = nameVars(vs); const n = vs.length; return B.AND(vs.map((v, i) => lit(v, (m >> (n - 1 - i)) & 1))); };
  B.maxterm = (m, vs) => { vs = nameVars(vs); const n = vs.length; return B.OR(vs.map((v, i) => lit(v, !((m >> (n - 1 - i)) & 1)))); };
  B.canonicalSOP = (fn) => { const t = B.minterms(fn).map((m) => B.minterm(m, fn.vars)); return t.length ? B.OR(t) : C(0); };
  B.canonicalPOS = (fn) => { const t = B.maxterms(fn).map((m) => B.maxterm(m, fn.vars)); return t.length ? B.AND(t) : C(1); };
  /** the complement: 1s and 0s swapped, don't-cares kept */
  B.complement = (fn) => make(fn.vars, B.maxterms(fn), fn.dc);
  /** the dual: F^d(x) = F(x')', so m is a 1 of the dual when the complement of m is a 0 of F */
  B.dual = (fn) => {
    const mask = (1 << fn.vars.length) - 1;
    return make(fn.vars, B.maxterms(fn).map((m) => m ^ mask), [...fn.dc].map((m) => m ^ mask));
  };

  // ---- expanding non-standard terms ----------------------------------------------------------------------------------------
  const factorsOf = (t, op) => (t.op === op ? t.args : [t]);
  function litOf(x) {
    if (x.op === 'var') return { name: x.name, pos: 1 };
    if (x.op === 'not' && x.a.op === 'var') return { name: x.a.name, pos: 0 };
    return null;
  }
  /**
   * Expand a sum of products into minterms (form 'sop') or a product of sums into maxterms (form 'pos'), filling
   * in each missing variable as X(Y + Y') or X + YY'. Traced step by step.
   * -> {fn, list, trace}
   */
  B.expand = (e, vs, form) => {
    e = P(e); form = form || 'sop';
    vs = vs ? nameVars(vs) : B.vars(e);
    const n = vs.length, sop = form === 'sop';
    const outer = sop ? 'or' : 'and', inner = sop ? 'and' : 'or';
    const trace = [], hit = new Map();
    const terms = factorsOf(e, outer);
    const show = (x) => B.toString(x);
    trace.push({ kind: 'expand-start', terms: terms.map(show), say: (sop ? 'Each product term is widened until it has every variable: ' : 'Each sum term is widened until it has every variable: ') + vs.join(', ') + '.' });
    terms.forEach((t, ti) => {
      if (t.op === 'const') {
        if (t.v === (sop ? 1 : 0)) { trace.push({ kind: 'expand-const', term: show(t), say: 'The term ' + t.v + ' covers every row.' }); for (let m = 0; m < 1 << n; m++) { if (!hit.has(m)) hit.set(m, []); hit.get(m).push(ti); } }
        else trace.push({ kind: 'expand-const', term: show(t), say: 'The term ' + t.v + ' adds nothing.' });
        return;
      }
      const lits = factorsOf(t, inner).map(litOf);
      if (lits.some((l) => !l)) throw new Error((sop ? 'not a sum of products: ' : 'not a product of sums: ') + show(t) + ' is not a ' + (sop ? 'product' : 'sum') + ' of literals');
      const fixed = new Map();
      for (const l of lits) {
        if (!vs.includes(l.name)) throw new Error(l.name + ' is not in the variable list');
        if (fixed.has(l.name) && fixed.get(l.name) !== l.pos) { trace.push({ kind: 'expand-empty', term: show(t), say: show(t) + ' holds both ' + l.name + ' and ' + l.name + "' so it is always " + (sop ? '0' : '1') + ' and adds nothing.' }); return; }
        fixed.set(l.name, l.pos);
      }
      const missing = vs.filter((v) => !fixed.has(v));
      let parts = [new Map(fixed)];
      const pretty = (mp) => { const ls = vs.filter((v) => mp.has(v)).map((v) => lit(v, mp.get(v))); return show(sop ? B.AND(ls) : B.OR(ls)); };
      if (!missing.length) trace.push({ kind: 'expand-full', term: show(t), say: show(t) + ' already has every variable.' });
      for (const v of missing) {
        const before = parts.map(pretty);
        parts = parts.flatMap((mp) => [new Map(mp).set(v, 1), new Map(mp).set(v, 0)]);
        trace.push({ kind: 'expand-var', term: show(t), var: v, before, after: parts.map(pretty),
          say: sop ? before.join(' + ') + ' lacks ' + v + ': multiply by (' + v + ' + ' + v + "') = 1 to get " + parts.map(pretty).join(' + ') + '.'
            : before.join(' · ') + ' lacks ' + v + ': add ' + v + v + "' = 0 to get " + parts.map((p) => '(' + pretty(p) + ')').join('') + '.' });
      }
      const ms = parts.map((mp) => vs.reduce((acc, v, i) => acc | ((sop ? mp.get(v) : 1 - mp.get(v)) << (n - 1 - i)), 0)).sort((a, b) => a - b);
      for (const m of ms) { if (!hit.has(m)) hit.set(m, []); hit.get(m).push(ti); }
      trace.push({ kind: 'expand-term', term: show(t), list: ms, say: show(t) + ' = ' + ms.map((m) => (sop ? 'm' : 'M') + m).join(sop ? ' + ' : ' · ') + '.' });
    });
    const dup = [...hit].filter(([, ts]) => ts.length > 1).map(([m]) => m).sort((a, b) => a - b);
    if (dup.length) trace.push({ kind: 'expand-dup', list: dup, say: (sop ? 'Minterm' : 'Maxterm') + (dup.length > 1 ? 's ' : ' ') + dup.join(', ') + (dup.length > 1 ? ' come' : ' comes') + ' from more than one term; keep ' + (dup.length > 1 ? 'each' : 'it') + ' once (idempotence).' });
    const list = sorted(hit.keys());
    const fn = sop ? make(vs, list, []) : B.fromMaxterms(vs, list, []);
    trace.push({ kind: 'expand-done', list, say: 'F = ' + (sop ? B.sigma(fn) : B.pi(fn)) + '.' });
    return { fn, list, trace };
  };

  // ---- the 16 functions of two variables -----------------------------------------------------------------------------
  // index = the output column for AB = 00, 01, 10, 11 read as a binary number, 00 first
  const TWO = [
    ['0', 'Null', '0'], ['AB', 'AND', 'A·B'], ["AB'", 'Inhibition (A but not B)', 'A/B'], ['A', 'Transfer A', 'A'],
    ["A'B", 'Inhibition (B but not A)', 'B/A'], ['B', 'Transfer B', 'B'], ['A ⊕ B', 'XOR', 'A ⊕ B'], ['A + B', 'OR', 'A + B'],
    ["(A + B)'", 'NOR', 'A ↓ B'], ["(A ⊕ B)'", 'XNOR (equivalence)', 'A ⊙ B'], ["B'", 'Complement B', "B'"], ["A + B'", 'Implication (B implies A)', 'A ⊂ B'],
    ["A'", 'Complement A', "A'"], ["A' + B", 'Implication (A implies B)', 'A ⊃ B'], ["(AB)'", 'NAND', 'A ↑ B'], ['1', 'Identity', '1'],
  ];
  B.twoVariable = TWO.map(([expr, name, op], index) => ({ index, name, expr, op, column: index.toString(2).padStart(4, '0'), ones: [0, 1, 2, 3].filter((m) => (index >> (3 - m)) & 1) }));
  /** which of the 16 a two-variable function is */
  B.classify2 = (fn) => {
    fn = asFn(fn);
    if (fn.vars.length !== 2) throw new Error('needs a function of exactly two variables');
    const idx = [0, 1, 2, 3].reduce((s, m) => s | ((fn.ones.has(m) ? 1 : 0) << (3 - m)), 0);
    return Object.assign({}, B.twoVariable[idx], { vars: fn.vars.slice() });
  };
  /** the number of Boolean functions of n variables, 2^(2^n), as a BigInt */
  B.countFunctions = (n) => ({ count: 1n << (1n << BigInt(n)), say: 'A truth table over ' + n + ' variables has ' + (1 << n) + ' rows, and each row can be 0 or 1, so there are 2^' + (1 << n) + ' = ' + (1n << (1n << BigInt(n))).toString() + ' functions.' });

  // ---- classifiers ------------------------------------------------------------------------------------------------------
  /** self-dual: F(x') = F(x)' for every input; with don't-cares, whether they can be chosen to make it so */
  B.selfDual = (fn) => {
    fn = asFn(fn);
    const mask = (1 << fn.vars.length) - 1;
    for (let m = 0; m <= mask; m++) {
      const a = B.value(fn, m), b = B.value(fn, m ^ mask);
      if (a !== 'X' && b !== 'X' && a === b) return { selfDual: false, witness: [m, m ^ mask], say: 'Not self-dual: rows ' + B.bits(m, fn.vars.length) + ' and ' + B.bits(m ^ mask, fn.vars.length) + ' are complements of each other but both give ' + a + '.' };
    }
    return { selfDual: true, say: 'Self-dual: complementing every input always complements the output' + (fn.dc.size ? ' (choosing the don\'t-cares to fit).' : '.') };
  };
  const pop = (m) => { let c = 0; while (m) { c += m & 1; m >>>= 1; } return c; };
  B.popcount = pop;
  /** totally symmetric: the output depends only on how many inputs are 1; also the symmetric pairs of variables */
  B.symmetric = (fn) => {
    fn = asFn(fn);
    const n = fn.vars.length, byW = new Map();
    let witness = null;
    for (let m = 0; m < 1 << n; m++) {
      const v = B.value(fn, m); if (v === 'X') continue;
      const w = pop(m);
      if (byW.has(w) && byW.get(w).v !== v) { if (!witness) witness = [byW.get(w).m, m]; } else if (!byW.has(w)) byW.set(w, { v, m });
    }
    const pairs = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const bi = 1 << (n - 1 - i), bj = 1 << (n - 1 - j);
      let ok = true;
      for (let m = 0; m < 1 << n && ok; m++) {
        const sw = (m & ~(bi | bj)) | ((m & bi) ? bj : 0) | ((m & bj) ? bi : 0);
        const a = B.value(fn, m), b = B.value(fn, sw);
        if (a !== 'X' && b !== 'X' && a !== b) ok = false;
      }
      if (ok) pairs.push([fn.vars[i], fn.vars[j]]);
    }
    if (witness) return { symmetric: false, witness, pairs, say: 'Not symmetric: ' + B.bits(witness[0], n) + ' and ' + B.bits(witness[1], n) + ' have the same number of 1s but different outputs.' };
    const weights = [...byW].filter(([, x]) => x.v === 1).map(([w]) => w).sort((a, b) => a - b);
    return { symmetric: true, weights, pairs, say: 'Symmetric: F is 1 exactly when the number of 1 inputs is in {' + listStr(weights) + '}.' };
  };
  /** unateness per variable and monotonicity (positive unate in every variable) */
  B.monotone = (fn) => {
    fn = asFn(fn);
    const n = fn.vars.length, unate = {};
    let witness = null;
    for (let i = 0; i < n; i++) {
      const b = 1 << (n - 1 - i);
      let up = false, down = false, wu = null, wd = null;
      for (let m = 0; m < 1 << n; m++) {
        if (m & b) continue;
        const lo = B.value(fn, m), hi = B.value(fn, m | b);
        if (lo === 'X' || hi === 'X') continue;
        if (lo < hi) { up = true; wu = wu || [m, m | b]; }
        if (lo > hi) { down = true; wd = wd || [m, m | b]; }
      }
      unate[fn.vars[i]] = up && down ? 'binate' : up ? 'positive' : down ? 'negative' : 'independent';
      if (down && !witness) witness = { var: fn.vars[i], rows: wd };
    }
    const monotone = !witness;
    return { monotone, unate, witness, say: monotone ? 'Monotone: turning any input from 0 to 1 never turns the output from 1 to 0.' : 'Not monotone: raising ' + witness.var + ' from row ' + B.bits(witness.rows[0], n) + ' to ' + B.bits(witness.rows[1], n) + ' drops the output from 1 to 0.' };
  };
  /**
   * threshold: weights w and a threshold T with F = 1 exactly when Σ w_i x_i >= T (a negative weight means the
   * variable acts complemented). Unate is necessary; two 1-rows and two 0-rows with the same column sums prove
   * it impossible; otherwise integer weights are found by perceptron training.
   */
  B.threshold = (fn) => {
    fn = asFn(fn);
    const n = fn.vars.length, N = 1 << n;
    const mono = B.monotone(fn);
    const binate = Object.entries(mono.unate).find(([, u]) => u === 'binate');
    if (binate) return { threshold: false, reason: 'binate', say: 'Not a threshold function: ' + binate[0] + ' raises the output in some rows and lowers it in others, and a single weight cannot do both.' };
    const flip = fn.vars.map((v) => mono.unate[v] === 'negative');
    const xs = (m) => fn.vars.map((v, i) => { const b = (m >> (n - 1 - i)) & 1; return flip[i] ? 1 - b : b; });
    const ones = [], zeros = [];
    for (let m = 0; m < N; m++) { const v = B.value(fn, m); if (v === 1) ones.push(m); else if (v === 0) zeros.push(m); }
    // 2-summability: a + b = c + d as vectors with a, b ones and c, d zeros
    const sums = new Map();
    for (let i = 0; i < ones.length; i++) for (let j = i; j < ones.length; j++) {
      const a = xs(ones[i]), b = xs(ones[j]); sums.set(a.map((x, k) => x + b[k]).join(), [ones[i], ones[j]]);
    }
    for (let i = 0; i < zeros.length; i++) for (let j = i; j < zeros.length; j++) {
      const a = xs(zeros[i]), b = xs(zeros[j]), k = a.map((x, q) => x + b[q]).join();
      if (sums.has(k)) {
        const [p, q] = sums.get(k);
        return { threshold: false, reason: 'summable', witness: { ones: [p, q], zeros: [zeros[i], zeros[j]] }, say: 'Not a threshold function: rows ' + B.bits(p, n) + ' and ' + B.bits(q, n) + ' (both 1) have the same column sums as rows ' + B.bits(zeros[i], n) + ' and ' + B.bits(zeros[j], n) + ' (both 0), so no weights can separate them.' };
      }
    }
    // perceptron on the (flipped) positive function, integer steps
    const w = new Array(n).fill(0);
    let T = 0, ok = false;
    for (let epoch = 0; epoch < 20000 && !ok; epoch++) {
      ok = true;
      for (const m of ones) { const x = xs(m), s = x.reduce((a, b, i) => a + b * w[i], 0); if (s < T) { ok = false; x.forEach((b, i) => { w[i] += b; }); T--; } }
      for (const m of zeros) { const x = xs(m), s = x.reduce((a, b, i) => a + b * w[i], 0); if (s >= T) { ok = false; x.forEach((b, i) => { w[i] -= b; }); T++; } }
    }
    if (!ok) return { threshold: false, reason: 'search', say: 'No weights were found: F is very likely not a threshold function.' };
    // back to the original variables: a flipped variable gets a negative weight and moves the threshold
    const weights = w.map((x, i) => (flip[i] ? -x : x));
    const thr = T - w.reduce((a, x, i) => a + (flip[i] ? x : 0), 0);
    const terms = fn.vars.map((v, i) => weights[i] + v).join(' + ').replace(/\+ -/g, '- ');
    return { threshold: true, weights, T: thr, say: 'A threshold function: F = 1 exactly when ' + terms + ' ≥ ' + thr + '.' };
  };

  // ---- cubes ------------------------------------------------------------------------------------------------------------
  // A cube (implicant) over n variables: mask has a 1 for each variable present, bits gives their values.
  // Variable i (0 = first) is bit n-1-i. A cube covers m when (m & mask) === bits.
  const cube = (n, mask, bits) => ({ n, mask, bits: bits & mask });
  B.cube = cube;
  B.covers = (c, m) => (m & c.mask) === c.bits;
  B.cubeLits = (c) => pop(c.mask);
  B.cubeSize = (c) => 1 << (c.n - pop(c.mask));
  B.cubeKey = (c) => c.mask + ':' + c.bits;
  B.cubeMinterms = (c) => { const out = []; for (let m = 0; m < 1 << c.n; m++) if ((m & c.mask) === c.bits) out.push(m); return out; };
  /** '1-0-' style, the first variable on the left */
  B.cubeStr = (c) => { let s = ''; for (let i = c.n - 1; i >= 0; i--) s += (c.mask >> i) & 1 ? String((c.bits >> i) & 1) : '-'; return s; };
  B.cubeFromStr = (s) => { const n = s.length; let mask = 0, bits = 0; for (let i = 0; i < n; i++) { const b = 1 << (n - 1 - i); if (s[i] === '0') mask |= b; else if (s[i] === '1') { mask |= b; bits |= b; } else if (s[i] !== '-' && s[i] !== 'x' && s[i] !== 'X') throw new Error('bad cube ' + s); } return cube(n, mask, bits); };
  B.minCube = (m, n) => cube(n, (1 << n) - 1, m);
  /** the smallest cube containing all the cells */
  B.spanCube = (cells, n) => { const full = (1 << n) - 1; let and = full, or = 0; for (const m of cells) { and &= m; or |= m; } const mask = full & ~(and ^ or); return cube(n, mask, and & mask); };
  /** product term of a cube (constant 1 for the empty cube) */
  B.cubeProduct = (c, vs) => { const ls = []; for (let i = 0; i < c.n; i++) { const b = 1 << (c.n - 1 - i); if (c.mask & b) ls.push(lit(vs[i], c.bits & b)); } return B.AND(ls); };
  /** sum term of a cube of 0s: the variable is complemented where the cube has a 1 (constant 0 for the empty cube) */
  B.cubeSum = (c, vs) => { const ls = []; for (let i = 0; i < c.n; i++) { const b = 1 << (c.n - 1 - i); if (c.mask & b) ls.push(lit(vs[i], !(c.bits & b))); } return B.OR(ls); };
  /** read a product of literals (or a sum, for form 'pos') back as a cube; null if it is not one */
  B.termCube = (t, vs, form) => {
    t = P(t);
    const n = vs.length, inner = form === 'pos' ? 'or' : 'and';
    if (t.op === 'const') return t.v === (form === 'pos' ? 0 : 1) ? cube(n, 0, 0) : null;
    let mask = 0, bits = 0;
    for (const f of factorsOf(t, inner)) {
      const l = litOf(f); if (!l) return null;
      const i = vs.indexOf(l.name); if (i < 0) return null;
      const b = 1 << (n - 1 - i), v = form === 'pos' ? 1 - l.pos : l.pos;
      if (mask & b) { if (((bits & b) ? 1 : 0) !== v) return 'empty'; continue; }
      mask |= b; if (v) bits |= b;
    }
    return cube(n, mask, bits);
  };
  /** the names of the variables a cube leaves out */
  B.cubeFree = (c, vs) => vs.filter((v, i) => !((c.mask >> (c.n - 1 - i)) & 1));

  // ---- the prover ---------------------------------------------------------------------------------------------------------
  /**
   * prove(a, b): {equal, counterexample: {m, env, a, b} | null, vars, rows}. Compares on every assignment of the
   * union of the variables.
   */
  B.prove = (a, b) => {
    a = P(a); b = P(b);
    const vs = [...new Set(B.vars(a).concat(B.vars(b)))].sort(B.byName);
    const fa = B.compile(a, vs), fb = B.compile(b, vs);
    for (let m = 0; m < 1 << vs.length; m++) {
      const x = fa(m), y = fb(m);
      if (x !== y) {
        const env = B.env(m, vs);
        return { equal: false, vars: vs, rows: m + 1, counterexample: { m, env, a: x, b: y }, say: 'Not equal: at ' + vs.map((v) => v + ' = ' + env[v]).join(', ') + ' the left side is ' + x + ' and the right side is ' + y + '.' };
      }
    }
    return { equal: true, vars: vs, rows: 1 << vs.length, counterexample: null, say: 'Equal: both sides agree on all ' + (1 << vs.length) + ' rows.' };
  };
  /** dualise an identity "lhs = rhs" (or two expressions): the dual identity, and whether each one holds */
  B.dualise = (lhs, rhs) => {
    if (rhs == null && typeof lhs === 'string') { const parts = lhs.split('='); if (parts.length !== 2) throw new Error('write the identity as left = right'); [lhs, rhs] = parts; }
    const a = P(lhs), b = P(rhs), da = B.dualExpr(a), db = B.dualExpr(b);
    const p = B.prove(a, b), q = B.prove(da, db);
    return { lhs: a, rhs: b, dualLhs: da, dualRhs: db, holds: p.equal, dualHolds: q.equal, proof: p, dualProof: q,
      say: 'The dual of ' + B.toString(a) + ' = ' + B.toString(b) + ' is ' + B.toString(da) + ' = ' + B.toString(db) + '. ' + (p.equal ? 'Both hold, as duality promises.' : 'The original does not hold, so its dual need not either.') };
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
