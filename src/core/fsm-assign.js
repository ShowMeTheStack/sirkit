// State assignment (binary, Gray, one-hot, and an adjacency heuristic) and the excitation tables of the D, JK,
// T and SR flip-flops. An assignment is { vars: ['Q1', 'Q0'], codes: { S0: '00', ... } }: one state variable per
// code bit, the first variable the leftmost bit.
(function (S) {
  'use strict';
  const F = S.Fsm = S.Fsm || {};
  const U = F.util = F.util || {};

  const gray = (i) => i ^ (i >> 1);
  const hamming = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++; return d; };
  U.hamming = hamming;
  const binVars = (n) => Array.from({ length: n }, (_, i) => 'Q' + (n - 1 - i));

  /**
   * The adjacency rules, as weights between pairs of states: states with the same next state on an input
   * (weight 2 each), the next states of one state (1 each), and states with the same output (1).
   */
  F.adjacency = function (m) {
    const st = m.states, w = new Map(), why = new Map(), syms = F.symbols(m);
    const add = (a, b, k, reason) => { if (a === b) return; const key = st.indexOf(a) < st.indexOf(b) ? a + '|' + b : b + '|' + a; w.set(key, (w.get(key) || 0) + k); if (!why.has(key)) why.set(key, []); why.get(key).push(reason); };
    for (let i = 0; i < st.length; i++) for (let j = i + 1; j < st.length; j++) {
      const a = st[i], b = st[j];
      for (const x of syms) if (m.next[a][x] != null && m.next[a][x] === m.next[b][x]) add(a, b, 2, 'both go to ' + m.next[a][x] + ' on ' + U.showIn(m, x));
      const oa = m.type === 'moore' ? m.out[a] : syms.map((x) => m.out[a][x]).join(), ob = m.type === 'moore' ? m.out[b] : syms.map((x) => m.out[b][x]).join();
      if (oa === ob) add(a, b, 1, 'they have the same outputs');
    }
    for (const s of st) {
      const ns = [...new Set(syms.map((x) => m.next[s][x]).filter((n) => n != null))];
      for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) add(ns[i], ns[j], 1, 'both follow ' + s);
    }
    return { weights: w, why };
  };

  /**
   * An assignment by kind: 'binary' (in the order of the states), 'gray', 'onehot' (one flip-flop per state,
   * variables Y0, Y1, ...), 'heuristic' (greedy on the adjacency weights), or a codes object of your own.
   * Returns { kind, vars, codes, trace }.
   */
  F.assign = function (m, kind) {
    const st = m.states, N = st.length, trace = [];
    if (kind && typeof kind === 'object') {
      const codes = Object.assign({}, kind.codes || kind), n = codes[st[0]].length;
      const vars = kind.vars || binVars(n);
      trace.push({ kind: 'given', codes, say: 'Use the given codes: ' + st.map((s) => s + ' = ' + codes[s]).join(', ') + '.' });
      return { kind: 'custom', vars, codes, trace };
    }
    kind = kind || 'binary';
    if (kind === 'onehot') {
      const vars = st.map((_, i) => 'Y' + i), codes = {};
      st.forEach((s, i) => { codes[s] = st.map((_, j) => (j === i ? '1' : '0')).join(''); });
      trace.push({ kind: 'onehot', codes, say: 'One-hot: ' + N + ' flip-flops, one per state; Y' + 0 + ' is 1 exactly in ' + st[0] + ', and so on. Next-state equations can be read straight off the diagram.' });
      return { kind, vars, codes, trace };
    }
    const n = U.log2(N), vars = binVars(n), codes = {};
    if (kind === 'binary' || kind === 'gray') {
      st.forEach((s, i) => { codes[s] = U.bits(kind === 'gray' ? gray(i) : i, n); });
      trace.push({ kind, codes, say: (kind === 'gray' ? 'Gray code: consecutive states differ in one bit: ' : 'Binary: the states counted in order: ') + st.map((s) => s + ' = ' + codes[s]).join(', ') + '.' });
      return { kind, vars, codes, trace };
    }
    if (kind !== 'heuristic') throw new Error('unknown assignment ' + kind);
    const { weights, why } = F.adjacency(m);
    const wt = (a, b) => weights.get(st.indexOf(a) < st.indexOf(b) ? a + '|' + b : b + '|' + a) || 0;
    for (const [k, v] of weights) trace.push({ kind: 'rule', pair: k.split('|'), weight: v, say: 'Give ' + k.replace('|', ' and ') + ' adjacent codes (weight ' + v + '): ' + why.get(k).join('; ') + '.' });
    const free = []; for (let v = 0; v < 1 << n; v++) free.push(U.bits(v, n));
    const done = [];
    const place = (s, code) => { codes[s] = code; done.push(s); free.splice(free.indexOf(code), 1); };
    place(m.start, U.bits(0, n));
    trace.push({ kind: 'place', state: m.start, code: codes[m.start], say: 'The start state ' + m.start + ' takes ' + codes[m.start] + ' (all flip-flops cleared at reset).' });
    while (done.length < N) {
      let bs = null, bw = -1;
      for (const s of st) if (!done.includes(s)) { const t = done.reduce((a, d) => a + wt(s, d), 0); if (t > bw) { bw = t; bs = s; } }
      let bc = null, bcost = Infinity;
      for (const code of free) { const cost = done.reduce((a, d) => a + wt(bs, d) * hamming(code, codes[d]), 0); if (cost < bcost) { bcost = cost; bc = code; } }
      place(bs, bc);
      const adj = done.filter((d) => d !== bs && wt(bs, d) && hamming(bc, codes[d]) === 1);
      trace.push({ kind: 'place', state: bs, code: bc, say: bs + ' takes ' + bc + (adj.length ? ', adjacent to ' + adj.map((d) => d + ' (' + codes[d] + ')').join(', ') : '') + '.' });
    }
    const met = [...weights.keys()].filter((k) => { const [a, b] = k.split('|'); return hamming(codes[a], codes[b]) === 1; });
    trace.push({ kind: 'score', say: met.length + ' of the ' + weights.size + ' wished-for adjacencies are met.' });
    return { kind, vars, codes, met: met.length, metPairs: met, wanted: weights.size, trace };
  };

  // ---- excitation tables --------------------------------------------------------------------------------
  // For each present → next value of Q, the flip-flop inputs that cause it ('X' is don't care).
  F.EXCITATION = {
    D: { inputs: ['D'], rows: { '00': ['0'], '01': ['1'], '10': ['0'], '11': ['1'] } },
    JK: { inputs: ['J', 'K'], rows: { '00': ['0', 'X'], '01': ['1', 'X'], '10': ['X', '1'], '11': ['X', '0'] } },
    T: { inputs: ['T'], rows: { '00': ['0'], '01': ['1'], '10': ['1'], '11': ['0'] } },
    SR: { inputs: ['S', 'R'], rows: { '00': ['0', 'X'], '01': ['1', '0'], '10': ['0', '1'], '11': ['X', '0'] } },
  };
  /** the inputs that take Q from q to q1 */
  F.excite = (type, q, q1) => F.EXCITATION[type].rows[String(q) + String(q1)].slice();
  /** the next Q of a flip-flop for given input values {D} {J, K} {T} {S, R}; null when S = R = 1 */
  F.characteristic = function (type, ins, q) {
    q = +q;
    switch (type) {
      case 'D': return +ins.D;
      case 'T': return q ^ +ins.T;
      case 'JK': { const j = +ins.J, k = +ins.K; return j && k ? 1 - q : j ? 1 : k ? 0 : q; }
      case 'SR': { const s = +ins.S, r = +ins.R; return s && r ? null : s ? 1 : r ? 0 : q; }
    }
    throw new Error('unknown flip-flop ' + type);
  };
  /** the characteristic equation as text */
  F.CHARACTERISTIC = { D: 'Q(t+1) = D', T: "Q(t+1) = TQ' + T'Q", JK: "Q(t+1) = JQ' + K'Q", SR: "Q(t+1) = S + R'Q (SR = 0)" };
  /** the excitation table with a sentence per row, for the lesson pictures */
  F.excitationTable = function (type) {
    const e = F.EXCITATION[type];
    return Object.entries(e.rows).map(([k, v]) => ({ q: k[0], q1: k[1], inputs: v, say: 'For Q to go from ' + k[0] + ' to ' + k[1] + ', ' + e.inputs.map((n, i) => n + ' = ' + v[i]).join(', ') + '.' }));
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
