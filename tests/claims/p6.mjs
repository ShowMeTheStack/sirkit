// Part 6: state machines. Each topic's narration is read back and checked against a working-out of our own: a
// small machine stepper over the machine's own table, Mealy/Moore detectors built from the pattern, round-by-round
// implication tables and partition refinement, pair walks for equivalence, flip-flop equations evaluated state by
// state, and the coin arithmetic of the vending machine. The drawn strips and tables are checked where the
// narration quotes them.

// ---- machines ----------------------------------------------------------------------------------------------------
/** our own reading of the machine text the topics use (mealy/moore, inputs, outputs, start, one line per state) */
export function parseMachine(text) {
  const lines = String(text).split('\n').map((l) => l.trim()).filter(Boolean);
  const m = { type: lines[0], inputs: [], outputs: [], start: null, states: [], next: {}, out: {} };
  for (const l of lines.slice(1)) {
    if (l.startsWith('inputs')) { m.inputs = l.split(/\s+/).slice(1); continue; }
    if (l.startsWith('outputs')) { m.outputs = l.split(/\s+/).slice(1); continue; }
    if (l.startsWith('start')) { m.start = l.split(/\s+/)[1]; continue; }
    const [head, rest] = l.split(':');
    const [s, so] = head.trim().split('/');
    m.states.push(s); m.next[s] = {};
    m.out[s] = m.type === 'moore' ? so : {};
    for (const part of rest.split(',')) {
      const [x, to] = part.split('->').map((q) => q.trim());
      const [n, z] = to.split('/');
      m.next[s][x] = n === '-' ? null : n;
      if (m.type === 'mealy') m.out[s][x] = z;
    }
  }
  if (!m.start) m.start = m.states[0];
  return m;
}
/** a machine object made by the engine, copied into our own plain shape */
export function plain(fm) {
  const m = { type: fm.type, inputs: fm.inputs.slice(), outputs: fm.outputs.slice(), start: fm.start, states: fm.states.slice(), next: {}, out: {} };
  for (const s of fm.states) { m.next[s] = Object.assign({}, fm.next[s]); m.out[s] = typeof fm.out[s] === 'object' ? Object.assign({}, fm.out[s]) : fm.out[s]; }
  return m;
}
export const symbolsOf = (m) => { const k = m.inputs.length; if (!k) return ['']; return [...Array(1 << k).keys()].map((i) => i.toString(2).padStart(k, '0')); };
/** one clock: [next state, the output during this clock] */
export const step = (m, s, x) => [m.next[s][x], m.type === 'mealy' ? m.out[s][x] : m.out[s]];
/** the output seen on the arrow s --x--> (a Moore machine through its Mealy form) */
const arrowOut = (m, s, x) => (m.type === 'mealy' ? m.out[s][x] : m.out[m.next[s][x]]);
export function runM(m, xs) {
  const states = [m.start], outs = [];
  let s = m.start;
  for (const x of xs) { const [n, z] = step(m, s, x); outs.push(z); s = n; states.push(s); }
  return { states, outs };
}
const outRow = (m, s) => (m.type === 'mealy' ? symbolsOf(m).map((x) => m.out[s][x]).join('|') : m.out[s]);
/** equivalence classes by partition refinement, and the rounds (each a list of blocks) */
export function refine(m) {
  const syms = symbolsOf(m);
  const group = (keyOf, order) => { const by = new Map(); for (const s of order) { const k = keyOf(s); if (!by.has(k)) by.set(k, []); by.get(k).push(s); } return [...by.values()]; };
  let P = group((s) => outRow(m, s), m.states);
  const rounds = [P];
  for (;;) {
    const ix = new Map(); P.forEach((b, i) => b.forEach((s) => ix.set(s, i)));
    const Q = P.flatMap((b) => group((s) => syms.map((x) => ix.get(m.next[s][x])).join(','), b));
    if (Q.length === P.length) break;
    P = Q; rounds.push(P);
  }
  return { classes: P, rounds };
}
/** the implication table, round by round (a pair crossed in round k needs a pair crossed before round k) */
export function implication(m) {
  const st = m.states, syms = symbolsOf(m), key = (a, b) => (st.indexOf(a) < st.indexOf(b) ? a + '|' + b : b + '|' + a);
  const cells = new Map();
  for (let i = 1; i < st.length; i++) for (let j = 0; j < i; j++) {
    const a = st[j], b = st[i];
    const diff = m.type === 'mealy' ? syms.find((x) => m.out[a][x] !== m.out[b][x]) : (m.out[a] !== m.out[b] ? '' : undefined);
    const implied = [];
    for (const x of syms) { const p = m.next[a][x], q = m.next[b][x]; if (p !== q && key(p, q) !== key(a, b) && !implied.some((e) => e.k === key(p, q))) implied.push({ k: key(p, q), x }); }
    cells.set(key(a, b), { a, b, diff, implied, round: diff !== undefined ? 0 : null });
  }
  let r = 0;
  for (;;) {
    r++;
    const now = [];
    for (const c of cells.values()) if (c.round === null && c.implied.some((e) => { const d = cells.get(e.k); return d.round !== null && d.round < r; })) now.push(c);
    if (!now.length) break;
    for (const c of now) c.round = r;
  }
  return { cells, key, rounds: r };
}
/** a shortest input sequence that tells two machines apart (null: equivalent), and the pairs reached */
export function distinguish(A, B) {
  const syms = symbolsOf(A), seen = new Map(), q = [[A.start, B.start]];
  seen.set(A.start + '|' + B.start, []);
  while (q.length) {
    const [a, b] = q.shift(), path = seen.get(a + '|' + b);
    for (const x of syms) {
      if (arrowOut(A, a, x) !== arrowOut(B, b, x)) return { seq: path.concat(x), pairs: seen.size };
      const k = A.next[a][x] + '|' + B.next[b][x];
      if (!seen.has(k)) { seen.set(k, path.concat(x)); q.push([A.next[a][x], B.next[b][x]]); }
    }
  }
  return { seq: null, pairs: seen.size };
}

// ---- detectors ----------------------------------------------------------------------------------------------------
/** the longest suffix of s that is a start of the pattern shorter than the whole pattern */
const tail = (pat, s) => { for (let k = Math.min(pat.length - 1, s.length); k > 0; k--) if (s.endsWith(pat.slice(0, k))) return k; return 0; };
/** a detector worked out from the pattern alone: {type, n states, step(i, b) -> [next, z], out(i)} */
export function detectorModel(pat, type, overlap) {
  const n = pat.length, moore = type === 'moore';
  const ctx = (i) => (i === n ? (overlap ? pat : '') : pat.slice(0, i));
  return {
    states: moore ? n + 1 : n,
    step(i, b) {
      const s = ctx(i) + b;
      if (s.endsWith(pat)) return moore ? [n, 1] : [overlap ? tail(pat, s) : 0, 1];
      return [tail(pat, s), 0];
    },
    out: (i) => (moore && i === n ? 1 : 0),
  };
}
/** how many times the pattern occurs in the input, with or without overlap */
export function matches(pat, xs, overlap) {
  let c = 0;
  for (let i = 0; i + pat.length <= xs.length;) { if (xs.slice(i, i + pat.length) === pat) { c++; i += overlap ? 1 : pat.length; } else i++; }
  return c;
}

// ---- equations ----------------------------------------------------------------------------------------------------
/** a sum of products over the given names, as a function of an environment {name: 0|1} ("1" and "0" allowed) */
export function sop(text, vars) {
  const t = String(text).replace(/\s+/g, '').replace(/′/g, "'");
  if (t === '0') { const z = () => 0; z.terms = []; return z; }
  const names = vars.slice().sort((a, b) => b.length - a.length);
  const terms = t.split('+').map((term) => {
    const lits = [];
    let i = 0;
    if (term === '1') return lits;
    while (i < term.length) {
      if (term[i] === '·') { i++; continue; }
      const v = names.find((nm) => term.startsWith(nm, i));
      if (!v) throw new Error('cannot read "' + term + '" in ' + text);
      i += v.length;
      let neg = false;
      while (term[i] === "'") { neg = !neg; i++; }
      lits.push([v, neg]);
    }
    return lits;
  });
  const f = (env) => (terms.some((ls) => ls.every(([v, neg]) => (env[v] ? 1 : 0) !== (neg ? 1 : 0))) ? 1 : 0);
  f.terms = terms;
  return f;
}
/** cost the way the course counts it: AND gates are terms of two or more literals; gate inputs are their inputs plus
 * the OR's inputs when a sum has two or more terms */
export function costOf(eqs) {
  let terms = 0, literals = 0, gateInputs = 0;
  for (const f of eqs) {
    for (const ls of f.terms) { literals += ls.length; if (ls.length > 1) { terms++; gateInputs += ls.length; } }
    if (f.terms.length > 1) gateInputs += f.terms.length;
  }
  return { terms, literals, gateInputs };
}
const CHAR = {
  D: (q, i) => i.D,
  T: (q, i) => i.T ^ q,
  JK: (q, i) => (i.J & (1 - q)) | ((1 - i.K) & q),
  SR: (q, i) => (i.S & i.R ? null : i.S | ((1 - i.R) & q)),
};
const FFIN = { D: ['D'], T: ['T'], JK: ['J', 'K'], SR: ['S', 'R'] };
/**
 * Check a set of flip-flop equations against a machine and its codes: every specified entry must go to the right
 * code and give the right output. eqs: [{name, text}] (D1 = …, J0 = …, Z = …), vars ['Q1', 'Q0'] or ['Y0', …].
 * Returns a list of problems.
 */
export function checkEquations(m, codes, ff, vars, eqTexts) {
  const bad = [];
  const ins = m.inputs.length ? m.inputs : [];
  const all = vars.concat(ins);
  const fns = {};
  for (const t of eqTexts) { const [l, r] = t.split('=').map((x) => x.trim()); fns[l] = sop(r, all); fns[l].src = r; }
  const suffix = (v) => v.replace(/^[A-Za-z]+/, '');
  for (const s of m.states) for (const x of symbolsOf(m)) {
    const n = m.next[s][x];
    const env = {};
    vars.forEach((v, i) => { env[v] = +codes[s][i]; });
    ins.forEach((nm, i) => { env[nm] = +x[i]; });
    if (n != null) {
      const got = vars.map((v, i) => { const io = {}; for (const p of FFIN[ff]) { const f = fns[p + suffix(v)]; if (!f) return '?'; io[p] = f(env); } return String(CHAR[ff](+codes[s][i], io)); }).join('');
      if (got !== codes[n]) bad.push('from ' + s + ' (' + codes[s] + ') on ' + x + ' the equations give ' + got + ', the table ' + codes[n] + ' (' + n + ')');
    }
    const z = m.type === 'mealy' ? m.out[s][x] : m.out[s];
    if (z != null && !/-/.test(z)) {
      const got = m.outputs.map((o) => (fns[o] ? String(fns[o](env)) : '?')).join('');
      if (got !== z) bad.push('in ' + s + ' on ' + x + ' the output equations give ' + got + ', the table ' + z);
    }
  }
  return { bad, fns };
}
const gray = (i) => i ^ (i >> 1);
const bin = (v, n) => v.toString(2).padStart(n, '0');

// ---- helpers over frames ------------------------------------------------------------------------------------------
const item = (f, key) => f.items.find((x) => x.key === key);
const texts = (f, re) => f.items.filter((x) => re.test(x.key)).sort((a, b) => a.key.localeCompare(b.key, 'en', { numeric: true })).map((x) => x.text);

// ---- the checks ---------------------------------------------------------------------------------------------------
export default {
  family: /^p6-/,
  extra: {
    'fsm-run': [{ m: 'two', seq: '' }, { m: 'det1011', seq: '1011011' }, { m: 'serial', seq: '11 11 00 01' }, { m: 'edge', seq: '1111' }, { m: 'parity', seq: '0000' }],
    'mealy-moore': [{ pattern: '11', seq: '1111111' }, { pattern: '00', seq: '0000100' }, { pattern: '1010', seq: '1010101010' }, { pattern: '0110', seq: '0110110' }],
    'mealy-moore-convert': [{ m: 'count3' }, { m: 'two', seq: '1100110' }, { m: 'det110', seq: '111000' }],
    'sequence-detector': [{ pattern: '11', type: 'moore', overlap: 'yes', seq: '1111011' }, { pattern: '11', type: 'moore', overlap: 'no', seq: '1111011' }, { pattern: '010', type: 'mealy', overlap: 'no', seq: '0101010' }, { pattern: '00110', type: 'moore', overlap: 'yes', seq: '001100110011' }],
    'serial-adder': [{ a: 31, b: 31, n: 5 }, { a: 0, b: 0, n: 3 }, { a: 63, b: 1, n: 6 }],
    'vending-fsm': [{ coins: '10 5 10 10 10 5 5 10 - 5' }, { coins: '-' }],
    'unused-states': [{ m: 'det110', ff: 'D', asg: 'binary', unused: 'dc' }, { m: 'edge', ff: 'JK', asg: 'gray', unused: 'dc' }, { m: 'mod6', ff: 'T', asg: 'gray', unused: 'dc' }, { m: 'mod6', ff: 'D', asg: 'heuristic', unused: 'start' }, { m: 'count3', ff: 'JK', asg: 'gray', unused: 'start' }],
    'design-flow': ['equal', 'det1101', 'count3', 'edge', 'vend'].flatMap((p) => ['D', 'JK', 'T'].flatMap((ff) => ['binary', 'gray', 'heuristic'].map((asg) => ({ p, ff, asg })))),
    'state-assignment': ['det1011', 'seven', 'six', 'count3', 'edge', 'mod5'].flatMap((m) => ['D', 'JK', 'T'].map((ff) => ({ m, ff }))),
  },
  random: {
    'fsm-run': (rnd) => { const m = ['edge', 'parity', 'two', 'det110', 'det1011', 'count3'][Math.floor(rnd() * 6)]; return { m, seq: [...Array(3 + Math.floor(rnd() * 8))].map(() => (rnd() < 0.5 ? '0' : '1')).join('') }; },
    'mealy-moore': (rnd) => ({ pattern: [...Array(2 + Math.floor(rnd() * 3))].map(() => (rnd() < 0.5 ? '0' : '1')).join(''), seq: [...Array(3 + Math.floor(rnd() * 8))].map(() => (rnd() < 0.5 ? '0' : '1')).join('') }),
    'sequence-detector': (rnd) => ({ pattern: [...Array(2 + Math.floor(rnd() * 4))].map(() => (rnd() < 0.5 ? '0' : '1')).join(''), type: rnd() < 0.5 ? 'mealy' : 'moore', overlap: rnd() < 0.5 ? 'yes' : 'no', seq: [...Array(3 + Math.floor(rnd() * 10))].map(() => (rnd() < 0.5 ? '0' : '1')).join('') }),
    'serial-adder': (rnd) => { const n = 3 + Math.floor(rnd() * 4), top = Math.min(31, (1 << n) - 1); return { n, a: Math.floor(rnd() * (top + 1)), b: Math.floor(rnd() * (top + 1)) }; },
    'vending-fsm': (rnd) => ({ coins: [...Array(1 + Math.floor(rnd() * 10))].map(() => ['5', '10', '-'][Math.floor(rnd() * 3)]).join(' ') }),
  },
  check(ctx) {
    const fn = CHECKS[ctx.tp.id];
    if (fn) fn(ctx); else ctx.fail('no claim check for ' + ctx.tp.id);
  },
};

const lib = (S, key) => (S.P6.LIB[key].make ? plain(S.P6.LIB[key].make()) : parseMachine(S.P6.LIB[key].text));
const seqOf = (m, text, key, S) => { const t = String(text || '').trim() || S.P6.LIB[key].seq; return m.inputs.length === 1 ? t.replace(/\s+/g, '').split('') : t.split(/[\s,]+/).filter(Boolean); };
const eq = (ctx, got, want, what) => { if (String(got) !== String(want)) ctx.fail(what + ': the narration says ' + got + ', it should be ' + want); else ctx.pass(); };
const must = (ctx, m, what, say) => { if (!m) ctx.fail('cannot read ' + what + ' in "' + String(say).slice(0, 120) + '"'); return m; };

const CHECKS = {
  'fsm-run'(ctx) {
    const { S, input, r } = ctx, m = lib(S, input.m), xs = seqOf(m, input.seq, input.m, S), run = runM(m, xs);
    const F = r.frames, mealy = m.type === 'mealy';
    eq(ctx, F.length, 2 + 2 * xs.length, 'frames');
    const f0 = F[0].say;
    eq(ctx, (f0.match(/with (\d+) states/) || [])[1], m.states.length, 'states');
    eq(ctx, (f0.match(/starts in (\w+)/) || [])[1], m.start, 'start');
    eq(ctx, (f0.match(/The inputs to read: ([01 ]+)\./) || [])[1], xs.join(' '), 'inputs');
    xs.forEach((x, k) => {
      const a = F[1 + 2 * k], b = F[2 + 2 * k];
      const mm = must(ctx, a.say.match(/^Clock (\d+): in (\w+) with \w+ = ([01]+)\. Row \w+, column \w+ = [01]+ gives the next state (\w+)(?: and the output \w+ = ([01-]+)|\. The output is the state's own: \w+ = ([01-]+))/), 'a clock', a.say);
      if (!mm) return;
      eq(ctx, mm[1], k + 1, 'clock number');
      eq(ctx, mm[2], run.states[k], 'clock ' + (k + 1) + ' state');
      eq(ctx, mm[3], x, 'clock ' + (k + 1) + ' input');
      eq(ctx, mm[4], run.states[k + 1], 'clock ' + (k + 1) + ' next state');
      eq(ctx, mm[5] || mm[6], run.outs[k], 'clock ' + (k + 1) + ' output');
      // the strip under the table: this clock's column
      const sc = item(a, 'sp:c:2:' + k), zc = item(a, 'sp:c:3:' + k);
      if (sc) eq(ctx, sc.text, run.states[k], 'strip state, clock ' + (k + 1));
      if (zc) eq(ctx, zc.text, run.outs[k], 'strip output, clock ' + (k + 1));
      const mb = must(ctx, b.say.match(/arrow (\w+) → (\w+)( \(a loop: it stays\))?\.(?: From now on it outputs \w+ = ([01-]+)\.)?/), 'an edge', b.say);
      if (!mb) return;
      eq(ctx, mb[1] + '>' + mb[2], run.states[k] + '>' + run.states[k + 1], 'edge ' + (k + 1));
      eq(ctx, !!mb[3], run.states[k] === run.states[k + 1], 'loop on edge ' + (k + 1));
      if (!mealy) eq(ctx, mb[4], m.out[run.states[k + 1]], 'Moore output after edge ' + (k + 1));
    });
    const last = F[F.length - 1].say;
    eq(ctx, (last.match(/the machine is in (\w+)/) || [])[1], run.states[xs.length], 'final state');
    const ones = xs.map((_, k) => k + 1).filter((k) => /1/.test(run.outs[k - 1]));
    const said = last.match(/on clocks? ([\d, ]+)\./);
    eq(ctx, said ? said[1] : '', ones.join(', '), 'clocks with output 1');
  },

  'fsm-analysis'(ctx) {
    const { r } = ctx, F = r.frames;
    const head = must(ctx, F[0].say.match(/(\d+) (D|JK|T) flip-flops \(([^)]+)\), the input (\w+) and the output (\w+)/), 'the circuit', F[0].say);
    if (!head) return;
    const ff = head[2], vars = head[3].split(', '), inp = head[4], outName = head[5], all = vars.concat([inp]);
    const ieq = {}, seq = {};
    let oeq = null, kind = null, tableAt = -1;
    F.forEach((f, i) => {
      let mm = f.say.match(/^Follow the wires back from the \w+ input of flip-flop \w+: (\w+) = ([^(.]+?)(?: \(= ([^)]+)\))?\.$/);
      if (mm) ieq[mm[1]] = sop(mm[2], all);
      mm = f.say.match(/so the state equation is (\w+)\(t\+1\) = (.+)\.$/);
      if (mm) seq[mm[1]] = sop(mm[2], all);
      mm = f.say.match(/^The output (\w+) = (.+?) (uses the input|uses only the flip-flops)/);
      if (mm) { oeq = sop(mm[2], all); kind = /input/.test(mm[3]) ? 'mealy' : 'moore'; eq(ctx, /this is a (Mealy|Moore)/.exec(f.say)[1].toLowerCase(), kind, 'the kind'); }
      if (/^Now the state table/.test(f.say)) tableAt = i;
    });
    // the state equations follow from the input equations by the flip-flop's characteristic equation
    const envs = [...Array(1 << all.length).keys()].map((n) => Object.fromEntries(all.map((v, i) => [v, (n >> (all.length - 1 - i)) & 1])));
    const sfx = (v) => (/\d$/.test(v) ? v.replace(/^[A-Za-z]+/, '') : v);
    for (const v of vars) {
      if (!seq[v]) { ctx.fail('no state equation for ' + v); continue; }
      for (const e of envs) {
        const io = {}; for (const p of FFIN[ff]) io[p] = ieq[p + sfx(v)] ? ieq[p + sfx(v)](e) : NaN;
        const want = CHAR[ff](e[v], io);
        if (want !== seq[v](e)) { ctx.fail('the state equation of ' + v + ' disagrees with its input equations at ' + JSON.stringify(e)); break; }
      }
      ctx.pass();
    }
    // the output equation: Mealy exactly when it reads the input
    if (oeq) eq(ctx, oeq.terms.some((ls) => ls.some(([v]) => v === inp)) ? 'mealy' : 'moore', kind, 'the kind from the output equation');
    // the table rows, worked out from the equations
    const codes = [...Array(1 << vars.length).keys()].map((i) => bin(i, vars.length));
    const nextOf = (c, x) => { const e = Object.fromEntries(vars.map((v, i) => [v, +c[i]]).concat([[inp, +x]])); return { n: vars.map((v) => seq[v](e)).join(''), z: oeq ? oeq(e) : null }; };
    codes.forEach((c, k) => {
      const f = F[tableAt + 1 + k];
      if (!f) return;
      const mm = must(ctx, f.say.match(/^Present state ([01]+) \(([^)]*)\): with \w+ = 0 the next state is ([01]+)(?: and \w+ = (\d))?; with \w+ = 1 the next state is ([01]+)(?: and \w+ = (\d))?(?:; the output is (\d))?\.$/), 'a table row', f.say);
      if (!mm) return;
      eq(ctx, mm[1], c, 'row order');
      eq(ctx, mm[2], vars.map((v, i) => v + ' = ' + c[i]).join(', '), 'row ' + c + ' bits');
      const a0 = nextOf(c, 0), a1 = nextOf(c, 1);
      eq(ctx, mm[3], a0.n, 'row ' + c + ' next on 0');
      eq(ctx, mm[5], a1.n, 'row ' + c + ' next on 1');
      if (kind === 'mealy') { eq(ctx, mm[4], a0.z, 'row ' + c + ' output on 0'); eq(ctx, mm[6], a1.z, 'row ' + c + ' output on 1'); } else eq(ctx, mm[7], a0.z, 'row ' + c + ' output');
      if (f.predict) eq(ctx, f.predict.answer, (F[tableAt + 2 + k] ? nextOf(codes[k + 1] || c, 1).n : ''), 'prediction before row ' + (codes[k + 1] || ''));
    });
    if (F[tableAt].predict) eq(ctx, F[tableAt].predict.answer, nextOf(codes[0], 1).n, 'prediction before row ' + codes[0]);
    // reachability claim at the end
    const seen = new Set([codes[0]]), q = [codes[0]];
    while (q.length) { const c = q.shift(); for (const x of [0, 1]) { const n = nextOf(c, x).n; if (!seen.has(n)) { seen.add(n); q.push(n); } } }
    eq(ctx, /Not every state can be reached/.test(F[F.length - 1].say), seen.size < codes.length, 'the reachability remark');
    void outName;
  },

  'mealy-moore'(ctx) {
    const { input, r } = ctx, F = r.frames;
    const pat = String(input.pattern).trim(), xs = String(input.seq).replace(/\s+/g, '').split('');
    const me = detectorModel(pat, 'mealy', true), mo = detectorModel(pat, 'moore', true);
    const f0 = F[0].say;
    eq(ctx, (f0.match(/Mealy one needs (\d+) states/) || [])[1], me.states, 'Mealy states');
    eq(ctx, (f0.match(/Moore one needs (\d+)/) || [])[1], mo.states, 'Moore states');
    let a = 0, b = 0, zmoPrev = 0;
    const waveAt = (f, name, t) => { const w = item(f, 'tw:w:' + name); if (!w) return undefined; let v; for (const [tt, x] of w.changes) if (tt <= t) v = x; return v; };
    xs.forEach((x, k) => {
      const fa = F[1 + 2 * k], fb = F[2 + 2 * k];
      const [na, za] = me.step(a, x), [nb] = mo.step(b, x);
      const zmo = mo.out(b), zmo2 = mo.out(nb);
      const tIn = k * 100 + (k ? 20 : 0), tEdge = k * 100 + 50;
      const mA = must(ctx, fa.say.match(/^X = ([01]) arrives at (\d+) ns\. The Mealy machine in S(\d+) answers at once: Z = (\d)\. The Moore machine in S(\d+) still shows its state's output, Z = (\d)\.$/), 'an input', fa.say);
      if (mA) {
        eq(ctx, mA[1], x, 'input ' + (k + 1)); eq(ctx, mA[2], tIn, 'input time ' + (k + 1));
        eq(ctx, mA[3], a, 'Mealy state, clock ' + (k + 1)); eq(ctx, mA[4], za, 'Mealy Z, clock ' + (k + 1));
        eq(ctx, mA[5], b, 'Moore state, clock ' + (k + 1)); eq(ctx, mA[6], zmo, 'Moore Z, clock ' + (k + 1));
        const wz = waveAt(fa, 'Zme', tIn + 1), wm = waveAt(fa, 'Zmo', tIn + 1);
        if (wz !== undefined) eq(ctx, wz, za, 'drawn Mealy Z at ' + tIn + ' ns');
        if (wm !== undefined) eq(ctx, wm, zmo, 'drawn Moore Z at ' + tIn + ' ns');
      }
      const mB = must(ctx, fb.say.match(/^The clock rises at (\d+) ns: Mealy S(\d+) → S(\d+), Moore S(\d+) → S(\d+)\. (.*)$/), 'an edge', fb.say);
      if (mB) {
        eq(ctx, mB[1], tEdge, 'edge time ' + (k + 1));
        eq(ctx, mB[2] + '>' + mB[3], a + '>' + na, 'Mealy edge ' + (k + 1));
        eq(ctx, mB[4] + '>' + mB[5], b + '>' + nb, 'Moore edge ' + (k + 1));
        const rest = mB[6];
        if (zmo2 === 1 && zmo === 0) eq(ctx, /turns 1 now/.test(rest), true, 'the Moore output turning 1 at ' + tEdge + ' ns');
        else if (zmo2 === 1) eq(ctx, /stays 1/.test(rest) && !/turns 1/.test(rest), true, 'the Moore output staying 1 at ' + tEdge + ' ns');
        else eq(ctx, (rest.match(/The Moore output is (\d)/) || [])[1], 0, 'the Moore output after ' + tEdge + ' ns');
        const wm = waveAt(fb, 'Zmo', tEdge + 1);
        if (wm !== undefined) eq(ctx, wm, zmo2, 'drawn Moore Z at ' + tEdge + ' ns');
      }
      zmoPrev = zmo2; a = na; b = nb;
    });
    void zmoPrev;
  },

  'mealy-moore-convert'(ctx) {
    const { S, input, r } = ctx, F = r.frames, m = lib(S, input.m), xs = seqOf(m, input.seq, input.m, S), syms = symbolsOf(m);
    eq(ctx, (F[0].say.match(/with (\d+) states/) || [])[1], m.states.length, 'states');
    const last = F[F.length - 1].say, run = runM(m, xs);
    if (m.type === 'mealy') {
      const ins = Object.fromEntries(m.states.map((s) => [s, new Set()]));
      for (const s of m.states) for (const x of syms) ins[m.next[s][x]].add(m.out[s][x]);
      let total = 0;
      for (const s of m.states) total += Math.max(1, ins[s].size);
      for (const f of F) {
        const mm = f.say.match(/^Into (\w+)\? \w+ is entered with outputs? ([01 and]+?), so it (splits into (\d) Moore states|stays one Moore state)/);
        if (!mm) continue;
        eq(ctx, [...ins[mm[1]]].sort().join(' and '), mm[2], 'outputs into ' + mm[1]);
        eq(ctx, mm[4] || 1, ins[mm[1]].size, 'Moore states for ' + mm[1]);
      }
      eq(ctx, (F.find((f) => /^The Moore machine: /.test(f.say)) || { say: '' }).say.match(/(\d+) states/)[1], total, 'Moore states');
      const mm = must(ctx, last.match(/Check on ([01]+): the Mealy outputs ([01 ]+) and the Moore outputs \(from the start state on\) ([01 ]+)\./), 'the check', last);
      if (mm) { eq(ctx, mm[1], xs.join(''), 'check input'); eq(ctx, mm[2], run.outs.join(' '), 'Mealy outputs'); eq(ctx, mm[3], ['0'].concat(run.outs).join(' '), 'Moore outputs'); }
    } else {
      for (const f of F) {
        const mm = f.say.match(/^(\w+) outputs ([01]), so every arrow into it \(([^)]*)\) gets the output ([01])/);
        if (!mm) continue;
        eq(ctx, mm[2], m.out[mm[1]], 'output of ' + mm[1]);
        eq(ctx, mm[4], m.out[mm[1]], 'arrow output into ' + mm[1]);
        const want = m.states.flatMap((s) => syms.filter((x) => m.next[s][x] === mm[1]).map((x) => 'from ' + s + ' on ' + x)).sort().join(', ');
        eq(ctx, mm[3].split(', ').sort().join(', '), want, 'arrows into ' + mm[1]);
      }
      const mm = must(ctx, last.match(/Check on ([01]+): Moore outputs ([01 ]+) \(the first is the start state's, before any input\) and Mealy outputs ([01 ]+):/), 'the check', last);
      if (mm) { eq(ctx, mm[2], [m.out[m.start]].concat(run.outs.slice(1), [m.out[run.states[xs.length]]]).join(' '), 'Moore outputs'); eq(ctx, mm[3], run.states.slice(1).map((s) => m.out[s]).join(' '), 'Mealy outputs'); }
    }
  },

  'implication-table'(ctx) {
    const { S, input, r } = ctx, F = r.frames, m = lib(S, input.m), t = implication(m), n = m.states.length;
    eq(ctx, (F[0].say.match(/each of the (\d+) pairs/) || [])[1], (n * (n - 1)) / 2, 'pairs');
    const pairText = (k) => '(' + k.replace('|', ', ') + ')';
    const crossed = new Map();
    let round0 = 0;
    F.forEach((f, i) => {
      let mm = f.say.match(/^Cross out \((\w+), (\w+)\): (?:on (\w+) = ([01]+) )?(\w+) outputs ([01]+) but (\w+) outputs ([01]+)\.$/);
      if (mm) {
        const c = t.cells.get(t.key(mm[1], mm[2]));
        eq(ctx, c.round, 0, 'round 0 cross of ' + pairText(t.key(mm[1], mm[2])));
        const x = mm[4] || '';
        const oa = m.type === 'mealy' ? m.out[mm[5]][x] : m.out[mm[5]], ob = m.type === 'mealy' ? m.out[mm[7]][x] : m.out[mm[7]];
        eq(ctx, mm[6] + '/' + mm[8], oa + '/' + ob, 'outputs of ' + mm[1] + ', ' + mm[2]);
        round0++; crossed.set(c, 0);
        return;
      }
      mm = f.say.match(/^Cell \((\w+), (\w+)\) (holds the implied pairs (.+)|has the same outputs and implies nothing else)/);
      if (mm) {
        const c = t.cells.get(t.key(mm[1], mm[2]));
        eq(ctx, c.diff, undefined, 'outputs of ' + pairText(t.key(mm[1], mm[2])));
        const said = mm[4] ? mm[4].replace(/:.*$/, '').split(/\), \(/).map((p) => p.replace(/[()]/g, '').split(', ').join('|')).map((k) => t.key(...k.split('|'))).sort() : [];
        eq(ctx, said.join(' '), c.implied.map((e) => e.k).sort().join(' '), 'implied pairs of ' + pairText(t.key(mm[1], mm[2])));
        return;
      }
      mm = f.say.match(/^Round (\d+): cross out \((\w+), (\w+)\): on (\w+) = ([01]+) it leads to \((\w+), (\w+)\), which is crossed out\.$/);
      if (mm) {
        const k = +mm[1], c = t.cells.get(t.key(mm[2], mm[3])), why = t.key(mm[6], mm[7]);
        eq(ctx, c.round, k, 'the round that crosses ' + pairText(t.key(mm[2], mm[3])));
        eq(ctx, t.key(m.next[mm[2]][mm[5]], m.next[mm[3]][mm[5]]), why, 'where ' + pairText(t.key(mm[2], mm[3])) + ' leads on ' + mm[5]);
        const d = t.cells.get(why);
        eq(ctx, d && d.round !== null && d.round < k, true, pairText(why) + ' crossed before round ' + k);
        const p = F[i - 1].predict;
        if (p) { const j = m.states.indexOf(d.b), jj = m.states.indexOf(d.a); eq(ctx, p.answer, 'it:' + (Math.max(j, jj) - 1) + ',' + Math.min(j, jj), 'the cell to click'); }
        crossed.set(c, k);
        return;
      }
      mm = f.say.match(/^Round 0 is done: (\d+) pairs crossed out/);
      if (mm) eq(ctx, mm[1], [...t.cells.values()].filter((c) => c.round === 0).length, 'round 0 crosses');
      mm = f.say.match(/^Round (\d+) crosses out nothing more/);
      if (mm) eq(ctx, mm[1], t.rounds, 'the last round');
    });
    eq(ctx, crossed.size, [...t.cells.values()].filter((c) => c.round !== null).length, 'pairs crossed out in the narration');
    const { classes } = refine(m);
    const cl = classes.map((c) => c.slice().sort((a, b) => m.states.indexOf(a) - m.states.indexOf(b))).sort((a, b) => m.states.indexOf(a[0]) - m.states.indexOf(b[0]));
    const fc = F.find((f) => /give the classes|No pair is left/.test(f.say));
    if (fc && /give the classes/.test(fc.say)) eq(ctx, fc.say.match(/the classes (.+?)( \(the green cells\))?\.$/)[1], cl.map((c) => '{' + c.join(', ') + '}').join(' '), 'classes');
    else if (fc) eq(ctx, cl.length, n, 'classes');
    const last = F[F.length - 1].say;
    if (cl.length < n) eq(ctx, (last.match(/(\d+) states instead of (\d+)/) || []).slice(1).join('/'), cl.length + '/' + n, 'reduced count');
    else eq(ctx, /already minimal/.test(last), true, 'minimal');
    const p = F.find((f) => f.predict && /how many states/.test(f.predict.ask));
    if (p) eq(ctx, p.predict.answer, cl.length, 'prediction of the reduced size');
  },

  'partition-refinement'(ctx) {
    const { S, input, r } = ctx, F = r.frames, m = lib(S, input.m), syms = symbolsOf(m), { rounds } = refine(m);
    const setOf = (txt) => txt.match(/\{[^}]*\}/g).map((b) => b.slice(1, -1).split(', ').sort().join(',')).sort().join(' ');
    const want = (P) => P.map((b) => b.slice().sort().join(',')).sort().join(' ');
    eq(ctx, setOf(F[0].say.split(':')[1]), want(rounds[0]), 'P0');
    // the narration's own block order: a split block is replaced by its pieces, in place
    let order = F[0].say.split(':')[1].match(/\{[^}]*\}/g).map((b) => b.slice(1, -1).split(', '));
    let k = 0;
    for (const f of F) {
      if (!/^Round \d+: /.test(f.say) || /splits nothing/.test(f.say)) continue;
      k++;
      const blockOf = (s) => order.findIndex((b) => b.includes(s)) + 1;
      const parts = f.say.split(/ ?Round \d+: /).filter(Boolean);
      const next = [];
      const split = new Map();
      for (const p of parts) {
        const mm = must(ctx, p.match(/^\{([^}]*)\} splits into (.+?): on (\w+) = ([01]+) (\w+) goes to (\w+) in B(\d+) but (\w+) goes to (\w+) in B(\d+)\./), 'a split', p);
        if (!mm) continue;
        const pieces = mm[2].match(/\{[^}]*\}/g).map((b) => b.slice(1, -1).split(', '));
        split.set(mm[1], pieces);
        const [x, a, na, ba, b, nb, bb] = [mm[4], mm[5], mm[6], +mm[7], mm[8], mm[9], +mm[10]];
        eq(ctx, m.next[a][x] + '/' + m.next[b][x], na + '/' + nb, 'next states in the split reason');
        eq(ctx, blockOf(na) + '/' + blockOf(nb), ba + '/' + bb, 'blocks in the split reason');
        eq(ctx, pieces.findIndex((q) => q.includes(a)) !== pieces.findIndex((q) => q.includes(b)), true, a + ' and ' + b + ' end apart');
      }
      for (const b of order) { const s = split.get(b.join(', ')); if (s) next.push(...s); else next.push(b); }
      order = next;
      eq(ctx, want(order), rounds[k] ? want(rounds[k]) : 'none', 'P' + k);
      eq(ctx, (f.say.match(/P\d+ has (\d+) blocks/) || [])[1], order.length, 'blocks in P' + k);
    }
    eq(ctx, k, rounds.length - 1, 'rounds that split');
    const fin = F.find((f) => /is final/.test(f.say));
    if (fin) eq(ctx, setOf(fin.say.split('=')[1].split('is final')[0]), want(rounds[rounds.length - 1]), 'the final partition');
    F.forEach((f, i) => {
      if (!f.predict) return;
      const after = F.slice(i + 1).find((g) => /P\d+ has \d+ blocks|is final/.test(g.say));
      const nxt = rounds[Math.min(rounds.length - 1, F.slice(0, i + 1).filter((g) => /^Under each state/.test(g.say)).length)];
      eq(ctx, f.predict.answer, nxt.length, 'prediction of the next partition');
      void after;
    });
    void syms;
  },

  'fsm-equivalence'(ctx) {
    const { S, input, r } = ctx, F = r.frames, Fs = S.Fsm;
    const PAIRS = {
      reduced: () => [lib(S, 'seven'), plain(Fs.reduce(Fs.parse(S.P6.LIB.seven.text)).machine)],
      overlap: () => [plain(Fs.detector('1011').machine), plain(Fs.detector('1011', { overlap: false }).machine)],
      kinds: () => [lib(S, 'edge'), plain(Fs.toMealy(Fs.parse(S.P6.LIB.edge.text)).machine)],
      near: () => [lib(S, 'two'), parseMachine('mealy\ninputs X\noutputs Z\nstart P\nP: 0 -> Q/0, 1 -> R/0\nQ: 0 -> Q/1, 1 -> R/0\nR: 0 -> P/0, 1 -> R/1')],
      parity: () => [lib(S, 'parity'), parseMachine('moore\ninputs X\noutputs Z\nstart E1\nE1/0: 0 -> E2, 1 -> O1\nE2/0: 0 -> E1, 1 -> O2\nO1/1: 0 -> O2, 1 -> E2\nO2/1: 0 -> O1, 1 -> E1')],
    };
    const [A, B] = PAIRS[input.p]();
    // the detectors must really behave as their names say
    if (input.p === 'overlap') { const xs = '1011011010110'.split(''); eq(ctx, runM(A, xs).outs.filter((z) => z === '1').length, matches('1011', xs.join(''), true), 'overlapping detections'); eq(ctx, runM(B, xs).outs.filter((z) => z === '1').length, matches('1011', xs.join(''), false), 'non-overlapping detections'); }
    const d = distinguish(A, B);
    eq(ctx, (F[0].say.match(/Machine A has (\d+) states, machine B (\d+)/) || []).slice(1).join('/'), A.states.length + '/' + B.states.length, 'sizes');
    if (F[0].predict) eq(ctx, F[0].predict.answer, d.seq ? 'Not equivalent' : 'Equivalent', 'the verdict asked');
    for (const f of F) {
      let mm = f.say.match(/^From \((\w+), (\w+)\) on \w+ = ([01]+) the outputs agree \(([01]+)\) and the pair \((\w+), (\w+)\) is reached\.$/);
      if (mm) {
        const [a, b, x] = [mm[1], mm[2], mm[3]];
        eq(ctx, arrowOut(A, a, x) + '/' + arrowOut(B, b, x), mm[4] + '/' + mm[4], 'outputs from (' + a + ', ' + b + ') on ' + x);
        eq(ctx, A.next[a][x] + ', ' + B.next[b][x], mm[5] + ', ' + mm[6], 'the pair from (' + a + ', ' + b + ') on ' + x);
        continue;
      }
      mm = f.say.match(/^From \((\w+), (\w+)\) on \w+ = ([01]+) the outputs are ([01]+) and ([01]+), so the input sequence ([01 ]+) tells/);
      if (mm) { eq(ctx, arrowOut(A, mm[1], mm[3]) + '/' + arrowOut(B, mm[2], mm[3]), mm[4] + '/' + mm[5], 'the outputs that differ'); eq(ctx, mm[6], d.seq ? d.seq.join(' ') : 'none', 'the distinguishing sequence'); continue; }
      mm = f.say.match(/^The input sequence ([01 ]+) tells them apart: A outputs ([01 ]+), B outputs ([01 ]+)\./);
      if (mm) {
        const xs = mm[1].split(' ');
        eq(ctx, mm[2], runM(A, xs).outs.join(' '), 'A outputs');
        eq(ctx, mm[3], runM(B, xs).outs.join(' '), 'B outputs');
        eq(ctx, xs.length, d.seq ? d.seq.length : -1, 'the shortest sequence length');
        continue;
      }
      mm = f.say.match(/^All (\d+) reachable pairs agree/);
      if (mm) { eq(ctx, d.seq, null, 'equivalence'); eq(ctx, mm[1], d.pairs, 'reachable pairs'); }
    }
  },

  'state-assignment'(ctx) {
    const { S, input, r } = ctx, F = r.frames, m0 = lib(S, input.m), { classes } = refine(m0);
    const n = classes.length, nb = Math.max(1, Math.ceil(Math.log2(n)));
    const f0 = F[0].say;
    if (n < m0.states.length) eq(ctx, (f0.match(/Reduced first to (\d+) states/) || [])[1], n, 'reduced size');
    eq(ctx, (f0.match(/need at least (\d+) flip-flops \(2\^(\d+) = (\d+) codes(?:, (\d+) left unused)?\); one-hot uses (\d+)/) || []).slice(1).map((x) => x || '0').join('/'), [nb, nb, 1 << nb, (1 << nb) - n, n].join('/'), 'flip-flop counts');
    // the reduced machine: the first state of each class stands for it
    const rep = new Map(); for (const c of classes) { const k = m0.states.find((s) => c.includes(s)); for (const s of c) rep.set(s, k); }
    const m = { type: m0.type, inputs: m0.inputs, outputs: m0.outputs, start: rep.get(m0.start), states: m0.states.filter((s) => rep.get(s) === s), next: {}, out: {} };
    for (const s of m.states) { m.next[s] = Object.fromEntries(Object.entries(m0.next[s]).map(([x, q]) => [x, q == null ? q : rep.get(q)])); m.out[s] = m0.out[s]; }
    const costs = {};
    for (const f of F) {
      const mm = f.say.match(/^(Binary|Gray|Adjacency rules|One-hot): (.+?)\. The equations cost (\d+) flip-flops?, (\d+) AND gates?, (\d+) gate inputs?, (\d+) literals?\./);
      if (!mm) continue;
      const kind = mm[1].toLowerCase();
      const codes = Object.fromEntries(mm[2].split(', ').map((p) => p.split(' = ')));
      eq(ctx, Object.keys(codes).join(','), m.states.join(','), kind + ' states');
      const k = Object.values(codes)[0].length;
      if (kind === 'binary') m.states.forEach((s, i) => eq(ctx, codes[s], bin(i, k), 'binary code of ' + s));
      if (kind === 'gray') m.states.forEach((s, i) => eq(ctx, codes[s], bin(gray(i), k), 'Gray code of ' + s));
      if (kind === 'one-hot') m.states.forEach((s, i) => eq(ctx, codes[s], bin(1 << (n - 1 - i), n), 'one-hot code of ' + s));
      eq(ctx, new Set(Object.values(codes)).size, n, kind + ' codes distinct');
      const vars = kind === 'one-hot' ? m.states.map((_, i) => 'Y' + i) : [...Array(k).keys()].map((i) => 'Q' + (k - 1 - i));
      const eqs = texts(f, /^eq:e\d+$/);
      const { bad, fns } = checkEquations(m, codes, kind === 'one-hot' ? 'D' : input.ff, vars, eqs);
      for (const b of bad.slice(0, 2)) ctx.fail(kind + ' equations: ' + b);
      if (!bad.length) ctx.pass();
      const c = costOf(Object.values(fns));
      eq(ctx, [mm[3], mm[4], mm[5], mm[6]].join('/'), [k, c.terms, c.gateInputs, c.literals].join('/'), kind + ' cost');
      costs[kind] = +mm[5];
    }
    const last = F[F.length - 1].say;
    const best = (last.match(/Fewest gate inputs here: ([\w -]+)\./) || [])[1];
    const min = Math.min(...Object.values(costs));
    eq(ctx, costs[best.toLowerCase()], min, 'the fewest gate inputs');
    for (const [kind, gi] of Object.entries(costs)) eq(ctx, new RegExp((kind === 'gray' ? 'Gray' : kind) + ': \\d+ flip-flops?, \\d+ AND gates?, ' + gi + ' gate inputs?').test(last), true, kind + ' in the comparison');
  },

  'excitation-tables'(ctx) {
    const { input, r } = ctx, F = r.frames, ff = input.ff, ins = FFIN[ff];
    const combos = [...Array(1 << ins.length).keys()].map((v) => Object.fromEntries(ins.map((p, i) => [p, (v >> (ins.length - 1 - i)) & 1])));
    for (const [q, q1] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
      const ok = combos.filter((c) => CHAR[ff](q, c) === q1);
      const f = F.find((g) => g.say.startsWith('Q must go from ' + q + ' to ' + q1 + '.'));
      if (!must(ctx, f, 'the change ' + q + ' to ' + q1, '')) continue;
      eq(ctx, f.say.split('(lit): ')[1].replace(/\.$/, ''), ok.map((c) => ins.map((p) => p + ' = ' + c[p]).join(', ')).join('; or '), 'rows for ' + q + '→' + q1);
      const ex = ins.map((p) => (ok.every((c) => c[p] === ok[0][p]) ? String(ok[0][p]) : 'X'));
      const g = F[F.indexOf(f) + 1];
      eq(ctx, (g.say.match(/^So ([^.]+)\./) || [])[1], ins.map((p, i) => p + ' = ' + ex[i]).join(', '), 'excitation for ' + q + '→' + q1);
      if (f.predict) eq(ctx, f.predict.answer, ex.join(', '), 'prediction for ' + q + '→' + q1);
    }
  },

  'design-flow'(ctx) {
    const { input, r } = ctx, F = r.frames;
    // the machine as the narration describes it, state by state
    const f0 = F[0].say.match(/Inputs ([\w, ]+), outputs ([\w, ]+);/);
    const inputs = f0[1].split(', '), outputs = f0[2].split(', '), mealy = /Mealy/.test(F[0].say);
    const m = { type: mealy ? 'mealy' : 'moore', inputs, outputs, start: null, states: [], next: {}, out: {} };
    for (const f of F) {
      const mm = f.say.match(/^Step 2: the state diagram\. (\w+) means "[^"]*"(?:, and outputs ([01]+))?\. From it: (.+?)\. Arrows/);
      if (!mm) continue;
      const s = mm[1];
      if (!m.start) m.start = s;
      m.states.push(s); m.next[s] = {}; m.out[s] = mealy ? {} : mm[2];
      for (const part of mm[3].split('; ')) {
        const pp = part.match(/^\w+ = ([01]+) → (\w+)(?: \(\w+ = ([01]+)\))?$/);
        if (!must(ctx, pp, 'an arrow', part)) continue;
        m.next[s][pp[1]] = pp[2]; if (mealy) m.out[s][pp[1]] = pp[3];
      }
    }
    eq(ctx, (F.find((f) => /^Step 3/.test(f.say)).say.match(/(\d+) states × (\d+) input/) || []).slice(1).join('/'), m.states.length + '/' + symbolsOf(m).length, 'table size');
    const { classes } = refine(m);
    const red = F.find((f) => /^Step 4: reduction\. The implication table leaves/.test(f.say));
    if (red) eq(ctx, red.say.match(/leaves (.+?):/)[1].match(/\{[^}]*\}/g).sort().join(' '), classes.filter((c) => c.length > 1).map((c) => '{' + c.join(', ') + '}').sort().join(' '), 'classes');
    else eq(ctx, classes.length, m.states.length, 'no reduction');
    const rep = new Map(); for (const c of classes) { const k = m.states.find((s) => c.includes(s)); for (const s of c) rep.set(s, k); }
    const mr = { type: m.type, inputs, outputs, start: rep.get(m.start), states: m.states.filter((s) => rep.get(s) === s), next: {}, out: {} };
    for (const s of mr.states) { mr.next[s] = Object.fromEntries(Object.entries(m.next[s]).map(([x, q]) => [x, rep.get(q)])); mr.out[s] = m.out[s]; }
    const s5 = F.find((f) => /^Step 5/.test(f.say)).say;
    const mm5 = s5.match(/\(([\w -]+)\): (.+?)\. That takes (\d+) flip-flops, ([\w, ]+)\.(?: The codes? ([\d, ]+) (?:is|are) unused)?/);
    const codes = Object.fromEntries(mm5[2].split(', ').map((p) => p.split(' = ')));
    const vars = mm5[4].split(', '), k = +mm5[3];
    eq(ctx, Object.keys(codes).join(','), mr.states.join(','), 'states coded');
    const kind = mm5[1];
    if (kind === 'binary') mr.states.forEach((s, i) => eq(ctx, codes[s], bin(i, k), 'binary code of ' + s));
    if (kind === 'Gray') mr.states.forEach((s, i) => eq(ctx, codes[s], bin(gray(i), k), 'Gray code of ' + s));
    if (kind !== 'one-hot') {
      const unused = [...Array(1 << k).keys()].map((i) => bin(i, k)).filter((c) => !Object.values(codes).includes(c));
      eq(ctx, mm5[5] || '', unused.join(', '), 'unused codes');
      eq(ctx, /The code \S+ is unused/.test(s5) || /The codes .+ are unused/.test(s5) || !unused.length, true, 'singular or plural for the unused codes');
    }
    // the lit rows: the change claimed, and the excitation read from it
    F.forEach((f, i) => {
      const mm = f.say.match(/^Flip-flop (\w+): in the lit row it goes from ([01]) to ([01])\.$/);
      if (!mm) return;
      const g = F[i + 1].say.match(/^So (.+?) in that row/);
      const ex = g[1].split(', ').map((p) => p.split(' = ')[1]);
      const ff = input.asg === 'onehot' ? 'D' : input.ff, ins = FFIN[ff];
      const combos = [...Array(1 << ins.length).keys()].map((v) => Object.fromEntries(ins.map((p, j) => [p, (v >> (ins.length - 1 - j)) & 1])));
      const ok = combos.filter((c) => CHAR[ff](+mm[2], c) === +mm[3]);
      eq(ctx, ex.join(', '), ins.map((p) => (ok.every((c) => c[p] === ok[0][p]) ? String(ok[0][p]) : 'X')).join(', '), 'excitation for ' + mm[1]);
      if (f.predict) eq(ctx, f.predict.answer, ex.join(', '), 'prediction of the excitation');
      // there is such a row
      const b = vars.indexOf(mm[1]);
      eq(ctx, mr.states.some((s) => symbolsOf(mr).some((x) => codes[s][b] === mm[2] && codes[mr.next[s][x]] && codes[mr.next[s][x]][b] === mm[3])), true, 'a row where ' + mm[1] + ' goes ' + mm[2] + '→' + mm[3]);
    });
    // the equations, each checked against the machine and the codes
    const eqs = [];
    for (const f of F) {
      const mm = f.say.match(/^The K-map of (\w+) over |^(\w+) sets flip-flop /);
      if (mm) { const nm = mm[1] || mm[2]; eqs.push(f.say.slice(f.say.lastIndexOf(nm + ' = ')).replace(/\.$/, '')); }
      const g = f.say.match(/(\d+) groups? (covers?) the 1s: \w+ = (.+)\.$/);
      if (g) { eq(ctx, g[1], g[3].split(' + ').length, 'groups'); eq(ctx, g[2], g[1] === '1' ? 'covers' : 'cover', 'agreement of "cover"'); }
    }
    const ff = input.asg === 'onehot' ? 'D' : input.ff;
    const { bad, fns } = checkEquations(mr, codes, ff, vars, eqs);
    for (const b of bad.slice(0, 2)) ctx.fail('equations: ' + b);
    if (!bad.length) ctx.pass();
    const c = costOf(Object.values(fns));
    const s8 = F.find((f) => /^Steps 8 and 9/.test(f.say)).say;
    eq(ctx, (s8.match(/(\d+) flip-flops?, (\d+) AND gates?, (\d+) gate inputs?, (\d+) literals?/) || []).slice(1).join('/'), [k, c.terms, c.gateInputs, c.literals].join('/'), 'cost');
    eq(ctx, (s8.match(/presets the machine to (\w+) \(([01]+)\)/) || []).slice(1).join('/'), mr.start + '/' + codes[mr.start], 'reset state');
    // the simulation against our own run of the narrated machine
    const sim = F[F.length - 2].say, end = F[F.length - 1].say;
    const xs = sim.match(/the inputs ([01 ]+), one per clock/)[1].split(' ');
    const want = runM(mr, xs).outs;
    const mm = end.match(/the circuit gives ([01 ]+), the state table says ([01 ]+):/);
    eq(ctx, mm[1], want.join(' '), 'the simulated outputs');
    eq(ctx, mm[2], want.join(' '), 'the table outputs');
    const sofar = sim.match(/just before each edge are ([01 ]+)\./)[1].split(' ');
    eq(ctx, sofar.join(' '), want.slice(0, sofar.length).join(' '), 'outputs so far');
    if (F[F.length - 2].predict) eq(ctx, F[F.length - 2].predict.answer, want[sofar.length], 'the next output asked');
  },

  'unused-states'(ctx) {
    const { input, r } = ctx, F = r.frames;
    const f0 = F[0].say;
    const mm = f0.match(/^(\d+) states in (\d+) flip-flops \(([\w -]+): (.+?)\)\./);
    const n = +mm[1], k = +mm[2], codes = Object.fromEntries(mm[4].split(', ').map((p) => p.split(' = ')));
    const kind = mm[3];
    const names = Object.keys(codes);
    if (kind === 'binary') names.forEach((s, i) => eq(ctx, codes[s], bin(i, k), 'binary code of ' + s));
    if (kind === 'Gray') names.forEach((s, i) => eq(ctx, codes[s], bin(gray(i), k), 'Gray code of ' + s));
    eq(ctx, names.length, n, 'states');
    const unused = [...Array(1 << k).keys()].map((i) => bin(i, k)).filter((c) => !Object.values(codes).includes(c));
    if (unused.length) eq(ctx, (f0.match(/The codes? ([\d, ]+) (?:belongs?) to no state/) || [])[1], unused.join(', '), 'unused codes');
    if (unused.length === 1) eq(ctx, /The code \d+ belongs/.test(f0), true, 'singular for one unused code');
    // the equations as drawn: evaluate them at each unused code
    const ff = input.ff, vars = [...Array(k).keys()].map((i) => 'Q' + (k - 1 - i));
    const nameOf = Object.fromEntries(Object.entries(codes).map(([s, c]) => [c, s]));
    const evalNext = (eqs, code, x, ins) => {
      const all = vars.concat(ins), fns = {};
      for (const t of eqs) { const [l, rr] = t.split('=').map((q) => q.trim()); fns[l] = sop(rr, all); }
      const env = Object.fromEntries(vars.map((v, i) => [v, +code[i]]).concat(ins.map((nm, i) => [nm, +x[i]])));
      return vars.map((v, i) => { const io = {}; for (const p of FFIN[ff]) io[p] = fns[p + v.slice(1)](env); return CHAR[ff](+code[i], io); }).join('');
    };
    const eqs1 = texts(F[0], /^eq:e\d+$/);
    const ins = (() => { const g = F.find((f) => /Unused \d+ goes on (\w+) = /.test(f.say)); return g ? [g.say.match(/goes on (\w+) = /)[1]] : []; })();
    const xsOf = ins.length ? ['0', '1'] : [''];
    const nxt = (code) => xsOf.map((x) => evalNext(eqs1, code, x, ins));
    for (const f of F) {
      const g = f.say.match(/^Unused (\d+) goes (.+?)(?:; it can stay among unused codes forever \(lockout\))?\.$/);
      if (!g) continue;
      const code = g[1], got = nxt(code);
      if (ins.length) {
        const parts = [...g[2].matchAll(/on \w+ = ([01]) to (\d+) \((\w+)\)/g)];
        parts.forEach((p) => { eq(ctx, p[2], got[+p[1]], 'unused ' + code + ' on ' + p[1]); eq(ctx, p[3], nameOf[p[2]] || 'unused', 'name of ' + p[2]); });
      } else {
        const p = g[2].match(/^to (\d+) \((\w+)\)/);
        eq(ctx, p[1], got[0], 'unused ' + code); eq(ctx, p[2], nameOf[p[1]] || 'unused', 'name of ' + p[1]);
      }
    }
    // lockout: some unused code from which an input sequence keeps the machine among unused codes for ever
    const trapped = new Set(unused);
    for (let changed = true; changed;) { changed = false; for (const c of [...trapped]) if (!nxt(c).some((q) => trapped.has(q))) { trapped.delete(c); changed = true; } }
    const verdict = F.find((f) => /corrects itself|can lock out/.test(f.say) && !/^Unused/.test(f.say));
    if (unused.length) eq(ctx, /corrects itself/.test(verdict.say), trapped.size === 0, 'self-correcting');
    if (trapped.size) eq(ctx, (verdict.say.match(/The codes? ([\d, ]+) can lock out/) || [])[1], [...trapped].sort().join(', '), 'codes that lock out');
    const fix = F.find((f) => /^Redesigned, /.test(f.say));
    if (fix) {
      const eqs2 = texts(F[F.indexOf(fix) - 1], /^eq2:f\d+$/);
      const start = Object.keys(codes)[0];
      for (const c of unused) for (const x of xsOf) eq(ctx, evalNext(eqs2, c, x, ins), codes[start], 'redesigned ' + c + ' on ' + (x || 'the clock'));
      if (unused.length === 1) eq(ctx, /goes straight/.test(fix.say), true, 'singular "goes"');
      const g = F[F.indexOf(fix) - 1].say.match(/\((\d+) → (\d+) gate inputs\)/);
      const cost = (eqs) => costOf(eqs.map((t) => sop(t.split('=')[1], vars.concat(ins)))).gateInputs;
      eq(ctx, g[1] + '/' + g[2], cost(eqs1) + '/' + cost(eqs2), 'gate inputs before and after');
    }
  },

  'sequence-detector'(ctx) {
    const { input, r } = ctx, F = r.frames;
    const pat = String(input.pattern).trim(), xs = String(input.seq).replace(/\s+/g, ''), ov = input.overlap === 'yes', moore = input.type === 'moore';
    const d = detectorModel(pat, input.type, ov);
    eq(ctx, (F[0].say.match(/(\d+) states will do/) || [])[1], d.states, 'states');
    for (const f of F) {
      const mm = f.say.match(/^S(\d+): [^.]+\. (.*)$/);
      if (!mm || /^Bit/.test(f.say)) continue;
      const i = +mm[1];
      for (const b of ['0', '1']) {
        const part = mm[2].split(/(?=From S\d+ on [01]:)/).find((p) => p.startsWith('From S' + i + ' on ' + b + ':'));
        if (!must(ctx, part, 'S' + i + ' on ' + b, mm[2])) continue;
        const [nx, z] = d.step(i, b);
        const go = part.match(/go to S(\d+)|starts again in S(\d+)/);
        eq(ctx, go ? go[1] || go[2] : '', nx, 'S' + i + ' on ' + b);
        eq(ctx, /pattern is complete/.test(part), (moore ? nx === pat.length : z === 1), 'completion from S' + i + ' on ' + b);
        const bitsSaid = part.match(/has (\d+) bits?/);
        if (bitsSaid) eq(ctx, bitsSaid[1], nx, 'tail length from S' + i + ' on ' + b);
      }
    }
    let s = 0, hits = 0;
    [...xs].forEach((x, k) => {
      const f = F.find((g) => g.say.startsWith('Bit ' + (k + 1) + ':'));
      const [n, z] = d.step(s, x);
      const hit = moore ? d.out(n) : z;
      hits += hit;
      const mm = must(ctx, f && f.say.match(/^Bit \d+: X = ([01]), S(\d+) → S(\d+)\. (.*)$/), 'bit ' + (k + 1), f ? f.say : '');
      if (mm) {
        eq(ctx, mm[1] + ' S' + mm[2] + '>S' + mm[3], x + ' S' + s + '>S' + n, 'bit ' + (k + 1));
        eq(ctx, /Z = 1|outputs 1/.test(mm[4]), hit === 1, 'detection on bit ' + (k + 1));
      }
      s = n;
    });
    const last = F[F.length - 1].say.match(/^(\d+) detections? in ([01]+)\. (?:Without|With) overlap the same input would give (\d+)\./);
    if (must(ctx, last, 'the count', F[F.length - 1].say)) {
      eq(ctx, last[1], hits, 'detections');
      eq(ctx, hits, matches(pat, xs, ov), 'detections by search');
      eq(ctx, last[3], matches(pat, xs, !ov), 'detections the other way');
    }
  },

  'serial-adder'(ctx) {
    const { input, r } = ctx, F = r.frames, { a, b, n } = input;
    let c = 0, sum = 0;
    for (let i = 0; i < n; i++) {
      const x = (a >> i) & 1, y = (b >> i) & 1, t = x + y + c, s = t & 1, c2 = t >> 1;
      const f = F.find((g) => g.say.startsWith('Bit ' + i + ':'));
      const mm = must(ctx, f && f.say.match(/^Bit \d+: A = ([01]), B = ([01]), carry in = ([01]) \(state C([01])\)\.$/), 'bit ' + i, f ? f.say : '');
      if (mm) eq(ctx, mm.slice(1).join(''), '' + x + y + c + c, 'bit ' + i + ' inputs');
      if (f && f.predict) eq(ctx, f.predict.answer, s, 'bit ' + i + ' sum asked');
      const g = F[F.indexOf(f) + 1].say.match(/^(\d) \+ (\d) \+ (\d) = (\d): sum bit S = (\d), carry (\d), so the next state is C(\d)\.$/);
      if (must(ctx, g, 'bit ' + i + ' result', F[F.indexOf(f) + 1].say)) eq(ctx, g.slice(1).join(','), [x, y, c, t, s, c2, c2].join(','), 'bit ' + i + ' sum');
      const cell = item(F[F.indexOf(f) + 1], 'r:S:' + i);
      if (cell) eq(ctx, cell.text, s, 'drawn sum bit ' + i);
      sum |= s << i; c = c2;
    }
    const end = F.find((f) => /^After \d+ clocks/.test(f.say)).say;
    eq(ctx, (end.match(/S = (\d+)/) || [])[1], sum, 'the sum');
    eq(ctx, sum, (a + b) % (1 << n), 'the sum by arithmetic');
    eq(ctx, /left in C1/.test(end), c === 1, 'the carry out');
    if (c) eq(ctx, (end.match(/= (\d+) needs one more bit/) || [])[1], a + b, 'the true sum');
    else eq(ctx, (end.match(/= (\d+) \+ (\d+)\.$/) || []).slice(1).join('+'), a + '+' + b, 'the sum written out');
    const eqf = F[F.length - 1].say.match(/\((\w+)\): (\w+) = (.+?); (\w+) = (.+?)\. D is/);
    const Q = eqf[1], all = [Q, 'A', 'B'];
    const fD = sop(eqf[3], all), fS = sop(eqf[5], all);
    eq(ctx, eqf[2], 'D' + Q.replace(/^\D+/, ''), 'the flip-flop named in the equation');
    for (let v = 0; v < 8; v++) { const e = { [Q]: v >> 2 & 1, A: v >> 1 & 1, B: v & 1 }; eq(ctx, fD(e) + '' + fS(e), ((e[Q] + e.A + e.B) >> 1) + '' + ((e[Q] + e.A + e.B) & 1), 'the full-adder equations at ' + v); }
  },

  'vending-fsm'(ctx) {
    const { input, r } = ctx, F = r.frames;
    const coins = String(input.coins).trim().split(/[\s,]+/).filter(Boolean);
    let h = 0;
    coins.forEach((c, k) => {
      const f = F.find((g) => g.say.startsWith('Clock ' + (k + 1) + ':'));
      const mm = must(ctx, f && f.say.match(/^Clock \d+: holding (\d+) cents, (no coin|a (\d+)-cent coin arrives)\.$/), 'clock ' + (k + 1), f ? f.say : '');
      if (!mm) return;
      eq(ctx, mm[1], h, 'money held at clock ' + (k + 1));
      eq(ctx, mm[3] || '-', c, 'coin at clock ' + (k + 1));
      const tot = h + (c === '-' ? 0 : +c), V = tot >= 15 ? 1 : 0, C = tot === 20 ? 1 : 0, nh = V ? 0 : tot;
      const g = F[F.indexOf(f) + 1].say.match(/^V = (\d), C = (\d): (?:(\d+) cents reached|now (\d+) cents)/);
      eq(ctx, g.slice(1, 3).join(''), '' + V + C, 'outputs at clock ' + (k + 1));
      eq(ctx, V ? g[3] : g[4], V ? tot : nh, 'money at clock ' + (k + 1));
      if (f.predict) eq(ctx, f.predict.answer, V ? (C ? 'Vend and give 5 back' : 'Vend') : 'Wait', 'the action asked');
      h = nh;
    });
    const last = F[F.length - 1];
    const ttl = item(last, 'eq:title').text;
    const codes = Object.fromEntries(ttl.split('codes ')[1].split(', ').map((p) => p.split(' = ')));
    eq(ctx, Object.values(codes).sort().join(','), '00,01,10', 'codes');
    const m = parseMachine('mealy\ninputs N D\noutputs V C\nstart S0\nS0: 00 -> S0/00, 10 -> S5/00, 01 -> S10/00, 11 -> -/--\nS5: 00 -> S5/00, 10 -> S10/00, 01 -> S0/10, 11 -> -/--\nS10: 00 -> S10/00, 10 -> S0/10, 01 -> S0/11, 11 -> -/--');
    const eqs = last.say.match(/two D flip-flops: (.+?)\. The don't cares/)[1].split('; ');
    const { bad } = checkEquations(m, codes, 'D', ['Q1', 'Q0'], eqs);
    for (const b of bad.slice(0, 2)) ctx.fail('vending equations: ' + b);
    if (!bad.length) ctx.pass();
    eq(ctx, /unused code 11/.test(last.say), !Object.values(codes).includes('11'), 'the unused code named');
  },
};
