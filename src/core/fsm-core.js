// Finite state machines: the Mealy and Moore model, running a machine on an input sequence, converting
// between the two kinds, and equivalence of two machines by a search of their product (with the shortest
// input sequence that tells them apart). Also the helpers the other sequential modules share: a small
// two-level minimiser (used when the Boolean core is absent or its answer cannot be read), expression
// printing, and a zero-delay evaluator for gate circuits with flip-flops.
//
// A machine: { type: 'mealy'|'moore', inputs: ['X'], outputs: ['Z'], states: ['S0', ...], start: 'S0',
//   next: { S0: { '0': 'S0', '1': 'S1' } }, out: Mealy { S0: { '0': '0', '1': '0' } }, Moore { S0: '0' } }.
// Input symbols are bit strings over the inputs in order ('01' is X1 = 0, X2 = 1); outputs are bit strings
// over the outputs. A next state of null and an output bit of '-' are unspecified (don't care).
(function (S) {
  'use strict';
  const F = S.Fsm = S.Fsm || {};
  const U = F.util = F.util || {};

  // ---- small helpers --------------------------------------------------------------------------------------
  const bits = (v, n) => { let s = ''; for (let i = n - 1; i >= 0; i--) s += (v >> i) & 1; return s; };
  const symbols = (k) => { const out = []; for (let v = 0; v < 1 << k; v++) out.push(bits(v, k)); return out; };
  const popcount = (v) => { let c = 0; while (v) { c += v & 1; v >>>= 1; } return c; };
  const log2 = (n) => Math.max(1, Math.ceil(Math.log2(Math.max(2, n))));
  U.bits = bits; U.symbols = symbols; U.popcount = popcount; U.log2 = log2;
  /** the input symbols of a machine */
  F.symbols = (m) => symbols(m.inputs.length);
  const outOf = (m, s, x) => (m.type === 'moore' ? m.out[s] : m.out[s] && m.out[s][x]);
  F.outOf = outOf;
  /** two output strings agree where both are specified */
  const agree = (a, b) => { if (a == null || b == null) return true; for (let i = 0; i < a.length; i++) if (a[i] !== '-' && b[i] !== '-' && a[i] !== b[i]) return false; return true; };
  U.agree = agree;
  const showIn = (m, x) => (!m.inputs.length ? 'no input' : m.inputs.length === 1 ? m.inputs[0] + ' = ' + x : m.inputs.join('') + ' = ' + x);
  const showOut = (m, z) => (m.outputs.length === 1 ? m.outputs[0] + ' = ' + z : m.outputs.join('') + ' = ' + z);
  U.showIn = showIn; U.showOut = showOut;

  // ---- building a machine ---------------------------------------------------------------------------------
  /**
   * create({ type, inputs, outputs, start, table }) where table is
   *   Mealy: { S0: { '0': 'S0/0', '1': ['S1', '0'] } }   (a next state of '-' or null is unspecified)
   *   Moore: { S0: { out: '0', next: { '0': 'S0', '1': 'S1' } } }
   */
  F.create = function (spec) {
    const type = spec.type === 'moore' ? 'moore' : 'mealy';
    const inputs = spec.inputs || ['X'], outputs = spec.outputs || ['Z'];
    const states = spec.states || Object.keys(spec.table);
    const m = { type, inputs: inputs.slice(), outputs: outputs.slice(), states: states.slice(), start: spec.start || states[0], next: {}, out: {}, name: spec.name || '' };
    const syms = symbols(inputs.length);
    const ns = (v) => (v == null || v === '-' || v === '' ? null : v);
    for (const s of states) {
      const row = spec.table[s] || {};
      m.next[s] = {};
      if (type === 'moore') {
        m.out[s] = row.out == null ? '-'.repeat(outputs.length) : String(row.out);
        for (const x of syms) m.next[s][x] = ns(row.next ? row.next[x] : row[x]);
      } else {
        m.out[s] = {};
        for (const x of syms) {
          let e = row[x], n = null, z = null;
          if (Array.isArray(e)) [n, z] = e;
          else if (e && typeof e === 'object') { n = e.next; z = e.out; } else if (typeof e === 'string') [n, z] = e.split('/').map((t) => t.trim());
          m.next[s][x] = ns(n);
          m.out[s][x] = z == null || z === '' ? '-'.repeat(outputs.length) : String(z);
        }
      }
    }
    const bad = F.problems(m);
    if (bad.length) throw new Error(bad[0]);
    return m;
  };
  /** what is wrong with a machine (unknown states, outputs of the wrong width) */
  F.problems = function (m) {
    const out = [], set = new Set(m.states), syms = F.symbols(m);
    if (!set.has(m.start)) out.push('the start state ' + m.start + ' is not a state');
    for (const s of m.states) for (const x of syms) {
      const n = m.next[s][x];
      if (n != null && !set.has(n)) out.push('row ' + s + ' on input ' + x + ' goes to ' + n + ', which is not a state');
      const z = outOf(m, s, x);
      if (z != null && z.length !== m.outputs.length) out.push('row ' + s + ' has an output ' + z + ' of the wrong width');
    }
    return out;
  };
  F.clone = (m) => JSON.parse(JSON.stringify(m));
  /** completely specified: every next state and every output bit given */
  F.complete = (m) => m.states.every((s) => F.symbols(m).every((x) => m.next[s][x] != null && !/-/.test(outOf(m, s, x))));

  /**
   * A machine from text, one row per line:
   *   mealy            (or moore; optional, Mealy by default)
   *   inputs X         outputs Z          start S0     (optional lines)
   *   S0: 0 -> S0/0, 1 -> S1/0            (Mealy row)
   *   S0/1: 0 -> S0, 1 -> S1              (Moore row: the state's output after the slash)
   *   inputs none, then  S0: -> S1/0  or  S0/00: S1   (a machine with no input: a counter, a sequence maker)
   */
  F.parse = function (text) {
    const lines = text.split('\n').map((l) => l.replace(/#.*/, '').trim()).filter(Boolean);
    let type = null, inputs = null, outputs = null, start = null;
    const table = {}, states = [];
    for (const l of lines) {
      let mm;
      if (/^(mealy|moore)$/i.test(l)) { type = l.toLowerCase(); continue; }
      if (/^inputs?\s*:?\s*(none|-)?$/i.test(l)) { inputs = []; continue; }
      if ((mm = /^inputs?\s*:?\s*(.+)$/i.exec(l))) { inputs = mm[1].split(/[\s,]+/).filter(Boolean); continue; }
      if ((mm = /^outputs?\s*:?\s*(.*)$/i.exec(l))) { outputs = mm[1].split(/[\s,]+/).filter(Boolean); continue; }
      if ((mm = /^start\s*:?\s*(\S+)$/i.exec(l))) { start = mm[1]; continue; }
      mm = /^([^:/\s]+)\s*(?:\/\s*([01-]+))?\s*:(.*)$/.exec(l);
      if (!mm) throw new Error('cannot read the line "' + l + '"');
      const s = mm[1];
      if (mm[2] != null) type = type || 'moore';
      states.push(s);
      const row = {};
      for (const part of mm[3].split(',').map((p) => p.trim()).filter(Boolean)) {
        // a machine with no input has one move per state: "-> S1/0", or just "S1/0"
        const t = /^([01]*)\s*->\s*([^/\s]+)\s*(?:\/\s*([01-]+))?$/.exec(part) || /^()([A-Za-z_][^/\s]*)\s*(?:\/\s*([01-]+))?$/.exec(part);
        if (!t) throw new Error('cannot read "' + part + '" in row ' + s);
        row[t[1]] = t[3] != null ? [t[2], t[3]] : t[2];
      }
      table[s] = mm[2] != null ? { out: mm[2], next: row } : row;
    }
    type = type || 'mealy';
    const keys = Object.values(table).flatMap((r) => Object.keys(type === 'moore' && r.next ? r.next : r));
    const k = inputs ? inputs.length : keys.length && keys.every((x) => x === '') ? 0 : Math.max(1, ...keys.map((x) => x.length));
    inputs = inputs || (k === 1 ? ['X'] : Array.from({ length: k }, (_, i) => 'X' + (i + 1)));
    if (!outputs) {
      const any = Object.values(table).map((r) => (type === 'moore' ? r.out : Object.values(r).map((e) => (Array.isArray(e) ? e[1] : ''))[0]))[0] || '0';
      outputs = any.length === 1 ? ['Z'] : Array.from({ length: any.length }, (_, i) => 'Z' + (i + 1));
    }
    return F.create({ type, inputs, outputs, states, start: start || states[0], table });
  };
  /** the machine as text in the same form parse reads */
  F.format = function (m) {
    const lines = [m.type, 'inputs ' + (m.inputs.length ? m.inputs.join(' ') : 'none'), 'outputs ' + m.outputs.join(' '), 'start ' + m.start];
    for (const s of m.states) {
      const parts = F.symbols(m).map((x) => (x ? x + ' ' : '') + '-> ' + (m.next[s][x] || '-') + (m.type === 'mealy' ? '/' + m.out[s][x] : ''));
      lines.push(s + (m.type === 'moore' ? '/' + m.out[s] : '') + ': ' + parts.join(', '));
    }
    return lines.join('\n');
  };

  // ---- running ------------------------------------------------------------------------------------------
  // a machine with no input runs on a number of clocks (or a string, one character per clock)
  const seqOf = (m, seq) => (!m.inputs.length && typeof seq === 'number' ? new Array(seq).fill('') : !m.inputs.length && typeof seq === 'string' ? seq.replace(/[\s,]/g, '').split('').map(() => '') : typeof seq === 'string' ? (m.inputs.length === 1 ? seq.split('') : seq.split(/[\s,]+/).filter(Boolean)) : seq.slice());
  F.seqOf = seqOf;
  /**
   * Run from the start state (or opts.from) on an input sequence. Returns { states, outputs, trace }:
   * states has one more entry than the sequence; a Mealy machine has one output per input, a Moore machine
   * one per state visited (the first is the start state's output, before any input).
   */
  F.run = function (m, seq, opts) {
    opts = opts || {};
    const xs = seqOf(m, seq);
    let s = opts.from || m.start;
    const states = [s], outputs = [], trace = [];
    if (m.type === 'moore') { outputs.push(m.out[s]); trace.push({ kind: 'start', state: s, out: m.out[s], say: 'Start in ' + s + ', which outputs ' + showOut(m, m.out[s]) + '.' }); } else trace.push({ kind: 'start', state: s, say: 'Start in ' + s + '.' });
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i], n = m.next[s][x];
      if (m.type === 'mealy') {
        const z = m.out[s][x];
        outputs.push(z);
        if (n == null) { trace.push({ kind: 'stuck', step: i, state: s, input: x, say: 'In ' + s + ' with ' + showIn(m, x) + ' the next state is not specified; the run stops.' }); break; }
        trace.push({ kind: 'step', step: i, state: s, input: x, out: z, next: n, say: 'Clock ' + (i + 1) + ': in ' + s + ' with ' + showIn(m, x) + ' the output is ' + showOut(m, z) + ' and the machine goes to ' + n + '.' });
      } else {
        if (n == null) { trace.push({ kind: 'stuck', step: i, state: s, input: x, say: 'In ' + s + ' with ' + showIn(m, x) + ' the next state is not specified; the run stops.' }); break; }
        outputs.push(m.out[n]);
        trace.push({ kind: 'step', step: i, state: s, input: x, next: n, out: m.out[n], say: 'Clock ' + (i + 1) + ': in ' + s + ' with ' + showIn(m, x) + ' the machine goes to ' + n + ', which outputs ' + showOut(m, m.out[n]) + '.' });
      }
      s = n; states.push(s);
    }
    return { states, outputs, trace };
  };

  // ---- converting ---------------------------------------------------------------------------------------
  /** Moore → Mealy: each transition carries the output of the state it enters */
  F.toMealy = function (m) {
    if (m.type === 'mealy') return { machine: F.clone(m), trace: [{ kind: 'same', say: 'The machine is already a Mealy machine.' }] };
    const r = { type: 'mealy', inputs: m.inputs.slice(), outputs: m.outputs.slice(), states: m.states.slice(), start: m.start, next: {}, out: {}, name: m.name };
    const trace = [];
    for (const s of m.states) {
      r.next[s] = Object.assign({}, m.next[s]); r.out[s] = {};
      for (const x of F.symbols(m)) {
        const n = m.next[s][x];
        r.out[s][x] = n == null ? '-'.repeat(m.outputs.length) : m.out[n];
        if (n != null) trace.push({ kind: 'edge', state: s, input: x, next: n, out: r.out[s][x], say: 'From ' + s + ' on ' + showIn(m, x) + ' the machine enters ' + n + ', whose output ' + m.out[n] + ' becomes the output of this transition.' });
      }
    }
    trace.push({ kind: 'note', say: 'The Mealy machine gives each output one clock earlier than the Moore machine shows it in its state; the Moore output of the start state has no Mealy counterpart.' });
    return { machine: r, trace };
  };
  /**
   * Mealy → Moore: a state for each (state, output on the way in) pair that occurs, named S1 when only one
   * output enters S1, else S1_0, S1_1 ...; the start state keeps the output of the first transition into it
   * (or 0s when none).
   */
  F.toMoore = function (m) {
    if (m.type === 'moore') return { machine: F.clone(m), trace: [{ kind: 'same', say: 'The machine is already a Moore machine.' }] };
    const syms = F.symbols(m), trace = [];
    const entering = new Map(m.states.map((s) => [s, []]));
    for (const s of m.states) for (const x of syms) { const n = m.next[s][x]; if (n != null && !entering.get(n).includes(m.out[s][x])) entering.get(n).push(m.out[s][x]); }
    const zero = '0'.repeat(m.outputs.length);
    for (const s of m.states) {
      const outs = entering.get(s);
      if (!outs.length) outs.push(zero);
      outs.sort();
      trace.push({ kind: 'split', state: s, outs: outs.slice(), say: outs.length > 1 ? s + ' is entered with outputs ' + outs.join(' and ') + ', so it splits into ' + outs.length + ' Moore states.' : s + ' is entered with output ' + outs[0] + ' only, so it stays one Moore state.' });
    }
    const nameOf = (s, z) => (entering.get(s).length > 1 ? s + '_' + z : s);
    const r = { type: 'moore', inputs: m.inputs.slice(), outputs: m.outputs.slice(), states: [], start: null, next: {}, out: {}, name: m.name };
    for (const s of m.states) for (const z of entering.get(s)) {
      const q = nameOf(s, z);
      r.states.push(q); r.out[q] = z; r.next[q] = {};
      for (const x of syms) { const n = m.next[s][x]; r.next[q][x] = n == null ? null : nameOf(n, m.out[s][x]); }
    }
    r.start = nameOf(m.start, entering.get(m.start)[0]);
    trace.push({ kind: 'done', say: 'The Moore machine has ' + r.states.length + ' states against ' + m.states.length + ' Mealy states; its outputs come one clock later.' });
    return { machine: r, trace };
  };

  // ---- equivalence --------------------------------------------------------------------------------------
  /**
   * Are two machines equivalent from their start states? A breadth-first search of the product machine: each
   * pair of states reached must give agreeing outputs on every input. A Moore machine is compared through its
   * Mealy form (the output of the state entered). Returns { equal, sequence, outA, outB, pairs, trace } with
   * the shortest distinguishing input sequence when they differ.
   */
  F.equivalent = function (a, b, opts) {
    opts = opts || {};
    const both = a.type === 'moore' && b.type === 'moore';
    const A = both ? a : F.toMealy(a).machine, B = both ? b : F.toMealy(b).machine;
    if (A.inputs.length !== B.inputs.length) return { equal: false, sequence: [], trace: [{ kind: 'inputs', say: 'The machines have different numbers of inputs.' }] };
    const syms = F.symbols(A), trace = [];
    const s0 = [opts.fromA || A.start, opts.fromB || B.start];
    const key = (p) => p[0] + '|' + p[1];
    const prev = new Map([[key(s0), null]]);
    const queue = [s0];
    const path = (k) => { const seq = []; for (let e = prev.get(k); e; e = prev.get(e.from)) seq.unshift(e.x); return seq; };
    if (both && !agree(A.out[s0[0]], B.out[s0[1]])) return { equal: false, sequence: [], outA: [A.out[s0[0]]], outB: [B.out[s0[1]]], trace: [{ kind: 'differ', pair: s0, say: 'The start states already differ: ' + A.out[s0[0]] + ' against ' + B.out[s0[1]] + '.' }] };
    trace.push({ kind: 'pair', pair: s0, say: 'Start from the pair (' + s0[0] + ', ' + s0[1] + ').' });
    while (queue.length) {
      const p = queue.shift();
      for (const x of syms) {
        const na = A.next[p[0]][x], nb = B.next[p[1]][x];
        const za = both ? (na == null ? null : A.out[na]) : A.out[p[0]][x], zb = both ? (nb == null ? null : B.out[nb]) : B.out[p[1]][x];
        if (!agree(za, zb)) {
          const seq = path(key(p)).concat([x]);
          const ra = F.run(a, seq, { from: opts.fromA }), rb = F.run(b, seq, { from: opts.fromB });
          trace.push({ kind: 'differ', pair: p, input: x, outs: [za, zb], sequence: seq, say: 'From (' + p[0] + ', ' + p[1] + ') on ' + showIn(A, x) + ' the outputs are ' + za + ' and ' + zb + ', so the input sequence ' + seq.join(' ') + ' tells the machines apart.' });
          return { equal: false, sequence: seq, outA: ra.outputs, outB: rb.outputs, pairs: prev.size, trace };
        }
        if (na == null || nb == null) continue;
        const q = [na, nb], k = key(q);
        if (prev.has(k)) continue;
        prev.set(k, { from: key(p), x });
        queue.push(q);
        trace.push({ kind: 'pair', pair: q, from: p, input: x, say: 'From (' + p[0] + ', ' + p[1] + ') on ' + showIn(A, x) + ' the outputs agree (' + za + ') and the pair (' + na + ', ' + nb + ') is reached.' });
      }
    }
    trace.push({ kind: 'equal', say: 'All ' + prev.size + ' reachable pairs agree on every input, so the machines are equivalent.' });
    return { equal: true, sequence: null, pairs: prev.size, trace };
  };
  /** the states reachable from the start */
  F.reachable = function (m) {
    const seen = new Set([m.start]), q = [m.start];
    while (q.length) { const s = q.shift(); for (const x of F.symbols(m)) { const n = m.next[s][x]; if (n != null && !seen.has(n)) { seen.add(n); q.push(n); } } }
    return m.states.filter((s) => seen.has(s));
  };
  /** the state diagram: nodes and edges, parallel edges merged into one with all their labels */
  F.diagram = function (m) {
    const nodes = m.states.map((s) => ({ id: s, label: m.type === 'moore' ? s + '/' + m.out[s] : s, start: s === m.start }));
    const edges = new Map();
    for (const s of m.states) for (const x of F.symbols(m)) {
      const n = m.next[s][x];
      if (n == null) continue;
      const k = s + '>' + n;
      if (!edges.has(k)) edges.set(k, { from: s, to: n, labels: [] });
      edges.get(k).labels.push(m.type === 'mealy' ? x + '/' + m.out[s][x] : x);
    }
    return { nodes, edges: [...edges.values()].map((e) => Object.assign(e, { label: e.labels.join(', ') })) };
  };

  // ---- expressions as sums of products --------------------------------------------------------------------
  // A cube is a string over 0, 1 and - with one position per variable (the first variable first).
  const simpleNames = (vars) => vars.every((v) => /^[A-Za-z][0-9_]*$/.test(v));
  U.cubeText = (cube, vars) => {
    const lits = [];
    for (let i = 0; i < cube.length; i++) if (cube[i] !== '-') lits.push(vars[i] + (cube[i] === '0' ? "'" : ''));
    return lits.length ? lits.join(simpleNames(vars) ? '' : '·') : '1';
  };
  U.sopText = (cubes, vars) => (!cubes.length ? '0' : cubes.map((c) => U.cubeText(c, vars)).join(' + '));
  U.cubeAst = (cube, vars) => {
    const lits = [];
    for (let i = 0; i < cube.length; i++) if (cube[i] !== '-') { const v = { op: 'var', name: vars[i] }; lits.push(cube[i] === '0' ? { op: 'not', a: v } : v); }
    return !lits.length ? { op: 'const', v: 1 } : lits.length === 1 ? lits[0] : { op: 'and', args: lits };
  };
  U.sopAst = (cubes, vars) => (!cubes.length ? { op: 'const', v: 0 } : cubes.length === 1 ? U.cubeAst(cubes[0], vars) : { op: 'or', args: cubes.map((c) => U.cubeAst(c, vars)) });
  U.literals = (cubes) => cubes.reduce((a, c) => a + c.replace(/-/g, '').length, 0);
  U.covers = (cube, m, n) => { for (let i = 0; i < n; i++) { const b = (m >> (n - 1 - i)) & 1; if (cube[i] !== '-' && +cube[i] !== b) return false; } return true; };
  /** print an expression tree (the Netlist form: var, const, not, and, or, xor) */
  U.text = function text(e, vars) {
    const simple = vars ? simpleNames(vars) : true;
    const go = (e, ctx) => {
      switch (e.op) {
        case 'var': return e.name;
        case 'const': return String(e.v);
        case 'not': return e.a.op === 'var' ? e.a.name + "'" : '(' + go(e.a, 'top') + ")'";
        case 'and': { const s = e.args.map((x) => go(x, 'and')).join(simple ? '' : '·'); return s; }
        case 'or': { const s = e.args.map((x) => go(x, 'or')).join(' + '); return ctx === 'and' || ctx === 'xor' ? '(' + s + ')' : s; }
        case 'xor': { const s = e.args.map((x) => go(x, 'xor')).join(' ⊕ '); return ctx === 'and' ? '(' + s + ')' : s; }
      }
      return '?';
    };
    return go(e, 'top');
  };

  /**
   * A small exact two-level minimiser (Quine–McCluskey with a branch-and-bound cover), for n up to about 10.
   * Returns { cubes, primes, essentials } with cubes the chosen cover (fewest terms, then fewest literals).
   */
  U.qm = function (n, ones, dcs) {
    ones = [...new Set(ones)]; dcs = [...new Set(dcs || [])].filter((m) => !ones.includes(m));
    if (!ones.length) return { cubes: [], primes: [], essentials: [] };
    if (ones.length + dcs.length === 1 << n) return { cubes: ['-'.repeat(n)], primes: ['-'.repeat(n)], essentials: ['-'.repeat(n)] };
    let level = new Set(ones.concat(dcs).map((m) => bits(m, n)));
    const primes = new Set();
    while (level.size) {
      const arr = [...level], used = new Set(), nxt = new Set();
      const byShape = new Map();
      for (const c of arr) { const k = c.replace(/[01]/g, '.'); if (!byShape.has(k)) byShape.set(k, []); byShape.get(k).push(c); }
      for (const group of byShape.values()) {
        for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
          const a = group[i], b = group[j];
          let diff = -1, cnt = 0;
          for (let k = 0; k < n; k++) if (a[k] !== b[k]) { cnt++; diff = k; if (cnt > 1) break; }
          if (cnt === 1) { nxt.add(a.slice(0, diff) + '-' + a.slice(diff + 1)); used.add(a); used.add(b); }
        }
      }
      for (const c of arr) if (!used.has(c)) primes.add(c);
      level = nxt;
    }
    const P = [...primes];
    const cov = P.map((p) => ones.filter((m) => U.covers(p, m, n)));
    const essentials = [];
    for (const m of ones) { const who = P.filter((p, i) => cov[i].includes(m)); if (who.length === 1 && !essentials.includes(who[0])) essentials.push(who[0]); }
    // branch and bound over the minterms left by the essential primes
    const cost = (set) => set.length * 1000 + U.literals(set);
    let best = null;
    const left0 = ones.filter((m) => !essentials.some((p) => U.covers(p, m, n)));
    let budget = 20000;
    const search = (chosen, left) => {
      if (budget-- < 0) return;
      if (best && cost(chosen) >= cost(best)) return;
      if (!left.length) { best = chosen.slice(); return; }
      // the minterm with the fewest primes covering it
      let pick = null, opts = null;
      for (const m of left) { const o = P.filter((p) => !chosen.includes(p) && U.covers(p, m, n)); if (!opts || o.length < opts.length) { opts = o; pick = m; } }
      opts.sort((a, b) => ones.filter((m) => U.covers(b, m, n)).length - ones.filter((m) => U.covers(a, m, n)).length || U.literals([a]) - U.literals([b]));
      for (const p of opts) { chosen.push(p); search(chosen, left.filter((m) => !U.covers(p, m, n))); chosen.pop(); }
      void pick;
    };
    search(essentials.slice(), left0);
    if (!best) { // greedy, when the search ran out of budget
      best = essentials.slice(); let left = left0;
      while (left.length) { let bp = null, bc = -1; for (const p of P) { const c = left.filter((m) => U.covers(p, m, n)).length; if (c > bc) { bc = c; bp = p; } } best.push(bp); left = left.filter((m) => !U.covers(bp, m, n)); }
    }
    best.sort((a, b) => b.localeCompare(a));
    return { cubes: best, primes: P, essentials };
  };

  /**
   * Minimise one function for the design flows: { vars, ones, dc } → { cubes, ast, text, literals, bool }.
   * The Boolean core's minimiser is used when it is loaded (its result kept in .bool for the K-map pictures);
   * the cover itself comes from the exact minimiser here so the cubes are always in a known form, and the
   * two must agree on cost.
   */
  U.minimise = function (vars, ones, dc, form) {
    const n = vars.length;
    let res;
    if (form === 'pos') {
      const zeros = [];
      for (let m = 0; m < 1 << n; m++) if (!ones.includes(m) && !(dc || []).includes(m)) zeros.push(m);
      const r = U.qm(n, zeros, dc);
      // the complement's cover, each cube a sum term by De Morgan
      const sums = r.cubes.map((c) => { const lits = []; for (let i = 0; i < n; i++) if (c[i] !== '-') { const v = { op: 'var', name: vars[i] }; lits.push(c[i] === '1' ? { op: 'not', a: v } : v); } return lits.length === 1 ? lits[0] : { op: 'or', args: lits }; });
      const ast = !r.cubes.length ? { op: 'const', v: 1 } : sums.length === 1 ? sums[0] : { op: 'and', args: sums };
      res = { cubes: r.cubes, form: 'pos', ast, text: U.text(ast, vars), literals: U.literals(r.cubes) };
    } else {
      const r = U.qm(n, ones, dc);
      res = { cubes: r.cubes, primes: r.primes, essentials: r.essentials, form: 'sop', ast: U.sopAst(r.cubes, vars), text: U.sopText(r.cubes, vars), literals: U.literals(r.cubes) };
    }
    const B = S.Bool;
    if (B && B.minimise) {
      try {
        const fn = { vars: vars.slice(), ones: new Set(ones), dc: new Set(dc || []) };
        res.bool = B.minimise(fn, { form: form || 'sop', method: n <= 4 ? 'kmap' : 'qm' });
      } catch (e) { res.boolError = String(e && e.message || e); }
    }
    return res;
  };

  // ---- a zero-delay evaluator for gate circuits with flip-flops ------------------------------------------
  /**
   * sim = U.netSim(circuit): set(name, v) on inputs, settle() the logic, get(name) for an input, output or
   * flip-flop (by part id), clock() for one rising edge of every flip-flop, state() / load(state) the
   * flip-flop values. The logic settles by repeated passes, so circuits with feedback (latches, asynchronous
   * machines) work too; settle() returns false when a loop never settles.
   */
  U.netSim = function (c) {
    const pinDir = (r) => r.part.pins.find((q) => q.name === r.pin).dir;
    const val = new Map(); // net → 0|1
    const ins = new Map(), ffq = new Map();
    for (const p of c.parts) {
      if (p.type === 'IN' || p.type === 'CLOCK') ins.set(p.params.name, 0);
      if (['DFF', 'JKFF', 'TFF', 'LATCH'].includes(p.type)) ffq.set(p, 0);
    }
    const inV = (p, pin) => { const n = p.net[pin]; return n ? (val.get(n) || 0) : 0; };
    const drive = (p, pin, v) => { const n = p.net[pin]; if (!n) return false; const old = val.get(n); if (old === v) return false; val.set(n, v); return true; };
    function pass() {
      let ch = false;
      for (const p of c.parts) {
        const ip = p.pins.filter((q) => q.dir === 'in').map((q) => inV(p, q.name));
        switch (p.type) {
          case 'IN': case 'CLOCK': ch = drive(p, 'y', ins.get(p.params.name)) || ch; break;
          case 'CONST': ch = drive(p, 'y', p.params.value ? 1 : 0) || ch; break;
          case 'NOT': ch = drive(p, 'y', 1 - ip[0]) || ch; break;
          case 'BUF': ch = drive(p, 'y', ip[0]) || ch; break;
          case 'AND': ch = drive(p, 'y', ip.every(Boolean) ? 1 : 0) || ch; break;
          case 'NAND': ch = drive(p, 'y', ip.every(Boolean) ? 0 : 1) || ch; break;
          case 'OR': ch = drive(p, 'y', ip.some(Boolean) ? 1 : 0) || ch; break;
          case 'NOR': ch = drive(p, 'y', ip.some(Boolean) ? 0 : 1) || ch; break;
          case 'XOR': ch = drive(p, 'y', ip.reduce((a, b) => a ^ b, 0)) || ch; break;
          case 'XNOR': ch = drive(p, 'y', 1 ^ ip.reduce((a, b) => a ^ b, 0)) || ch; break;
          case 'DECODER': {
            const k = p.params.k || 2; let a = 0;
            for (let i = 0; i < k; i++) a |= inV(p, 'a' + i) << i;
            const en = p.params.en ? inV(p, 'en') : 1;
            for (let i = 0; i < 1 << k; i++) ch = drive(p, 'y' + i, en && i === a ? 1 : 0) || ch;
            break;
          }
          case 'MUX': {
            if ((p.params.w || 1) !== 1 || p.params.selBus) break;
            const n = p.params.n || 2, k = log2(n); let s = 0;
            for (let i = 0; i < k; i++) s |= inV(p, 's' + i) << i;
            ch = drive(p, 'y', inV(p, 'd' + s)) || ch;
            break;
          }
          case 'LATCH': if (inV(p, 'en')) ffq.set(p, inV(p, 'd'));
          // falls through: the latch's outputs
          case 'DFF': case 'JKFF': case 'TFF': {
            let q = ffq.get(p);
            if (p.params.set && inV(p, 'set')) { q = 1; ffq.set(p, 1); }
            if (p.params.reset && inV(p, 'rst')) { q = 0; ffq.set(p, 0); }
            ch = drive(p, 'q', q) || ch; ch = drive(p, 'qn', 1 - q) || ch; break;
          }
        }
      }
      return ch;
    }
    const sim = {
      circuit: c,
      set(name, v) { if (!ins.has(name)) throw new Error('no input ' + name); ins.set(name, v ? 1 : 0); },
      settle() { for (let i = 0; i < 4 * c.parts.length + 8; i++) if (!pass()) return true; return false; },
      get(name) {
        const p = c.byId.get('out_' + name) || c.byId.get('in_' + name) || c.byId.get(name);
        if (!p) throw new Error('no port ' + name);
        if (ffq.has(p)) return ffq.get(p);
        if (p.type === 'OUT') return inV(p, 'a');
        if (p.type === 'IN') return ins.get(p.params.name);
        return val.get(p.net.y) || 0;
      },
      net: (n) => val.get(n) || 0,
      clock() {
        sim.settle();
        const nx = new Map();
        for (const [p, q] of ffq) {
          if (p.type === 'LATCH') continue;
          if (p.type === 'DFF') nx.set(p, inV(p, 'd'));
          else if (p.type === 'TFF') nx.set(p, q ^ inV(p, 't'));
          else { const j = inV(p, 'j'), k = inV(p, 'k'); nx.set(p, j && k ? 1 - q : j ? 1 : k ? 0 : q); }
        }
        for (const [p, v] of nx) ffq.set(p, v);
        return sim.settle();
      },
      state: () => new Map(ffq),
      flipflops: () => [...ffq.keys()],
      load(m) { for (const [p, v] of m) ffq.set(typeof p === 'string' ? c.byId.get(p) : p, v ? 1 : 0); sim.settle(); },
    };
    return sim;
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
