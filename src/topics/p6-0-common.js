// Part 6 helpers shared by the state-machine topics: a small library of our own machines, state tables drawn on
// the stage (with codes, lit rows and cells, rows revealed one at a time), state diagrams from the fsm kit, a
// clock-by-clock strip (input, state, output per cycle), zero-delay waveforms of a machine with the inputs
// changing just after each edge, and gate circuits built from equations written as sums of products.
(function (S) {
  'use strict';
  const K = S.Kit;
  const F = () => S.Fsm;
  const Geo = S.geom;
  const P6 = (S.P6 = S.P6 || {});

  // ---- machines (all our own) ----------------------------------------------------------------------------------
  P6.LIB = {
    edge: { seq: '0110111001', label: 'Rising-edge watcher (Moore)', text: 'moore\ninputs X\noutputs Z\nstart LOW\nLOW/0: 0 -> LOW, 1 -> RISE\nRISE/1: 0 -> LOW, 1 -> HIGH\nHIGH/0: 0 -> LOW, 1 -> HIGH', say: 'Z is 1 for the one clock after X goes from 0 to 1.' },
    parity: { seq: '1101001', label: 'Odd number of ones so far (Moore)', text: 'moore\ninputs X\noutputs Z\nstart EVEN\nEVEN/0: 0 -> EVEN, 1 -> ODD\nODD/1: 0 -> ODD, 1 -> EVEN', say: 'Z is 1 while the number of 1s read so far is odd.' },
    two: { seq: '0010111', label: 'Two equal bits in a row (Mealy)', text: 'mealy\ninputs X\noutputs Z\nstart A\nA: 0 -> B/0, 1 -> C/0\nB: 0 -> B/1, 1 -> C/0\nC: 0 -> B/0, 1 -> C/1', say: 'Z is 1 on a bit equal to the one before it.' },
    det110: { seq: '1101101100', label: 'Detector for 110 (Mealy)', text: 'mealy\ninputs X\noutputs Z\nstart S0\nS0: 0 -> S0/0, 1 -> S1/0\nS1: 0 -> S0/0, 1 -> S2/0\nS2: 0 -> S0/1, 1 -> S2/0', say: 'Z is 1 on the 0 that completes 110.' },
    det1011: { seq: '1011011010', label: 'Detector for 1011, overlapping (Mealy)', text: 'mealy\ninputs X\noutputs Z\nstart S0\nS0: 0 -> S0/0, 1 -> S1/0\nS1: 0 -> S2/0, 1 -> S1/0\nS2: 0 -> S0/0, 1 -> S3/0\nS3: 0 -> S2/0, 1 -> S1/1', say: 'Z is 1 on the 1 that completes 1011; that 1 can begin the next match.' },
    count3: { seq: '1101111', label: 'Mod-3 counter with enable (Moore)', text: 'moore\ninputs E\noutputs Z\nstart C0\nC0/0: 0 -> C0, 1 -> C1\nC1/0: 0 -> C1, 1 -> C2\nC2/1: 0 -> C2, 1 -> C0', say: 'Counts the clocks with E = 1, modulo 3; Z is 1 at count 2.' },
    seven: { seq: '0110100', label: 'Seven states, four of them needed (Mealy)', text: 'mealy\ninputs X\noutputs Z\nstart A\nA: 0 -> D/0, 1 -> E/0\nB: 0 -> C/0, 1 -> G/1\nC: 0 -> C/0, 1 -> C/0\nD: 0 -> A/0, 1 -> E/0\nE: 0 -> B/0, 1 -> B/0\nF: 0 -> F/0, 1 -> C/0\nG: 0 -> F/0, 1 -> G/0', say: 'A machine with redundant states: reduction finds which ones act alike.' },
    seven2: { seq: '1001101', label: 'Seven states, another pattern (Mealy)', text: 'mealy\ninputs X\noutputs Z\nstart A\nA: 0 -> C/0, 1 -> G/0\nB: 0 -> E/0, 1 -> F/0\nC: 0 -> F/0, 1 -> F/0\nD: 0 -> D/0, 1 -> C/0\nE: 0 -> D/0, 1 -> B/1\nF: 0 -> F/0, 1 -> D/0\nG: 0 -> E/0, 1 -> C/0', say: 'Another machine with redundant states.' },
    six: { seq: '0011010', label: 'Six states, a Moore machine', text: 'moore\ninputs X\noutputs Z\nstart P\nP/0: 0 -> Q, 1 -> R\nQ/0: 0 -> S, 1 -> R\nR/0: 0 -> Q, 1 -> T\nS/1: 0 -> S, 1 -> R\nT/1: 0 -> Q, 1 -> T\nU/0: 0 -> S, 1 -> R', say: 'Z is 1 after two equal bits in a row; U cannot be reached.' },
    serial: { seq: '11 01 10 00', label: 'Serial adder (Mealy)', text: 'mealy\ninputs A B\noutputs S\nstart C0\nC0: 00 -> C0/0, 01 -> C0/1, 10 -> C0/1, 11 -> C1/0\nC1: 00 -> C0/1, 01 -> C1/0, 10 -> C1/0, 11 -> C1/1', say: 'Adds two numbers arriving least significant bit first; the state is the carry.' },
    vend: { seq: '10 00 01 10 01 00', label: 'Vending controller, price 15 (Mealy)', text: 'mealy\ninputs N D\noutputs V C\nstart S0\nS0: 00 -> S0/00, 10 -> S5/00, 01 -> S10/00, 11 -> -/--\nS5: 00 -> S5/00, 10 -> S10/00, 01 -> S0/10, 11 -> -/--\nS10: 00 -> S10/00, 10 -> S0/10, 01 -> S0/11, 11 -> -/--', say: 'N is a 5-cent coin, D a 10-cent coin (never both at once); V vends at 15 or more, C returns 5 cents.' },
  };
  /** a counter with no input: N states in a ring, Z = 1 in the last */
  const ring = (N) => () => { const st = Array.from({ length: N }, (_, i) => 'C' + i), table = {}; st.forEach((s, i) => { table[s] = { out: i === N - 1 ? '1' : '0', next: { '': st[(i + 1) % N] } }; }); return F().create({ type: 'moore', inputs: [], outputs: ['Z'], states: st, table, name: 'mod-' + N + ' counter' }); };
  P6.LIB.mod5 = { seq: '', label: 'Mod-5 counter, no input (Moore)', make: ring(5), say: 'Counts 0, 1, 2, 3, 4, 0, … on every clock; Z is 1 at count 4.' };
  P6.LIB.mod6 = { seq: '', label: 'Mod-6 counter, no input (Moore)', make: ring(6), say: 'Counts 0 to 5 and round again; Z is 1 at count 5.' };
  // a machine whose automatic layout crosses two arrows is placed by hand (a drawing with none)
  P6.LIB.six.pos = { P: { x: 0, y: 150 }, Q: { x: 170, y: 40 }, R: { x: 170, y: 260 }, T: { x: 320, y: 150 }, S: { x: 480, y: 150 }, U: { x: 640, y: 260 } };
  P6.machine = (key) => { const m = P6.LIB[key].make ? P6.LIB[key].make() : F().parse(P6.LIB[key].text); if (P6.LIB[key].pos) m.placed = P6.LIB[key].pos; return m; };
  /** the input sequence of a topic: the one typed, or the machine's own example when the field is blank */
  P6.seqFor = (m, key, text) => P6.seq(m, String(text || '').trim() ? text : P6.LIB[key].seq);
  P6.choice = (keys, def, label) => ({ id: 'm', kind: 'choice', label: label || 'Machine', def: def || keys[0], options: keys.map((k) => ({ value: k, label: P6.LIB[k].label })) });

  // ---- text ----------------------------------------------------------------------------------------------------
  /** the inputs a symbol stands for: "X = 1", "AB = 01" */
  P6.inText = (m, x) => (m.inputs.length ? F().util.showIn(m, x) : 'the clock');
  P6.outText = (m, z) => F().util.showOut(m, z);
  /** the column heading of an input symbol */
  P6.colOf = (m, x) => (!m.inputs.length ? 'next' : m.inputs.length === 1 ? m.inputs[0] + ' = ' + x : m.inputs.join('') + ' = ' + x);
  /** prime marks as the narration writes them */
  P6.pr = (t) => String(t).replace(/'/g, '′');
  /** a sequence of input symbols from text: "0110" for one input, "01 11 10" for more */
  P6.seq = (m, text) => F().seqOf(m, String(text).trim());
  /** a check for an input-sequence field; machineOf(input) gives the machine it is read for */
  P6.seqCheck = (label, max, machineOf) => (v, inp) => {
    const t = String(v).trim();
    if (!t) return null;
    const m = machineOf ? machineOf(inp) : null, k = m ? m.inputs.length : 1;
    const xs = k === 1 ? t.replace(/\s+/g, '').split('') : t.split(/[\s,]+/).filter(Boolean);
    const bad = xs.find((x) => !new RegExp('^[01]{' + k + '}$').test(x));
    if (bad !== undefined) return label + ': "' + bad + '" is not ' + (k === 1 ? 'a 0 or a 1' : k + ' bits (write groups like ' + '01'.padEnd(k, '0') + ')');
    if (xs.length > (max || 12)) return label + ': at most ' + (max || 12) + ' inputs, so the picture stays readable';
    if (m) { const r = F().run(m, xs); if (r.trace.some((s) => s.kind === 'stuck')) return label + ': ' + r.trace.find((s) => s.kind === 'stuck').say; }
    return null;
  };

  // ---- sums of products ----------------------------------------------------------------------------------------
  /** "Q1X' + Q0" over vars → cubes ['1-0', '-1-']; a term "1" is the all-dash cube, "0" no cube */
  P6.sop = function (text, vars) {
    const t = String(text).replace(/\s+/g, '');
    if (t === '0') return [];
    const names = vars.slice().sort((a, b) => b.length - a.length);
    return t.split('+').map((term) => {
      const cube = vars.map(() => '-');
      if (term === '1') return cube.join('');
      let i = 0;
      while (i < term.length) {
        if (term[i] === '·') { i++; continue; }
        const v = names.find((n) => term.startsWith(n, i));
        if (!v) throw new Error('cannot read "' + term + '"');
        i += v.length;
        let neg = false;
        while (term[i] === "'" || term[i] === '′') { neg = !neg; i++; }
        cube[vars.indexOf(v)] = neg ? '0' : '1';
      }
      return cube.join('');
    });
  };
  /**
   * A clocked circuit from equations: o = {title, ff: 'D'|'JK'|'T', vars: ['Q1', 'Q0'], inputs: ['X'],
   * eqs: {D1: "Q0X", D0: "X'", Z: "Q1Q0"}, outputs: ['Z'], moore (outputs over the state only), reset}
   */
  P6.build = function (o) {
    const Fs = F(), fvars = o.vars.concat(o.inputs);
    const functions = [];
    for (const [name, text] of Object.entries(o.eqs)) {
      const isOut = (o.outputs || []).includes(name);
      const vs = isOut && o.moore ? o.vars : fvars;
      functions.push({ name, kind: isOut ? 'out' : 'ff', vars: vs, min: { cubes: P6.sop(text, vs) } });
    }
    return Fs.buildCircuit(o.title || 'circuit', { inputs: o.inputs, vars: o.vars, ff: o.ff, functions, outputs: o.outputs || [], reset: o.reset, start: o.vars.map(() => '0').join('') });
  };

  // ---- the state table ------------------------------------------------------------------------------------------
  /**
   * A state table. opts: {x, y, prefix, codes ({state: code}), show (how many rows to show), hot (a state: its
   * row lit), cell ([state, symbol]: one entry lit), good / bad ([[state, symbol]]), title, classes ({state:
   * extra class for its row}), split (Mealy: next state and output in separate column groups)}
   */
  P6.table = function (m, opts) {
    opts = opts || {};
    const syms = F().symbols(m), mealy = m.type === 'mealy';
    const states = m.states.slice(0, opts.show === undefined ? m.states.length : opts.show);
    const colHead = [];
    const codes = opts.codes;
    if (codes) colHead.push('code');
    for (const x of syms) colHead.push(P6.colOf(m, x));
    if (!mealy) colHead.push(m.outputs.join(''));
    const rows = states.map((s) => {
      const r = [];
      if (codes) r.push(codes[s]);
      for (const x of syms) {
        const n = m.next[s][x];
        const nt = n == null ? '–' : codes && opts.nextCodes ? codes[n] : n;
        r.push(mealy ? nt + ' / ' + m.out[s][x] : nt);
      }
      if (!mealy) r.push(m.out[s]);
      return r;
    });
    const off = codes ? 1 : 0;
    const hot = [], act = [];
    if (opts.hot) { const r = states.indexOf(opts.hot); if (r >= 0) for (let c = 0; c < colHead.length; c++) act.push([r, c]); }
    if (opts.cell) { const r = states.indexOf(opts.cell[0]), c = syms.indexOf(opts.cell[1]); if (r >= 0 && c >= 0) hot.push([r, c + off]); }
    const good = new Set((opts.good || []).map((p) => states.indexOf(p[0]) + ',' + (syms.indexOf(p[1]) + off)));
    const bad = new Set((opts.bad || []).map((p) => states.indexOf(p[0]) + ',' + (syms.indexOf(p[1]) + off)));
    const t = K.table.draw({
      x: opts.x || 0, y: opts.y || 0, prefix: opts.prefix || 'st', rows, rowHead: states, colHead, corner: 'state', size: opts.size || 15, mono: true, hot, act,
      cls: (r, c) => [good.has(r + ',' + c) ? 'good' : '', bad.has(r + ',' + c) ? 'bad' : '', opts.classes && opts.classes[states[r]] ? opts.classes[states[r]] : ''].filter(Boolean).join(' '),
      title: opts.title === undefined ? (mealy ? 'next state / ' + m.outputs.join('') : 'next state, output') : opts.title,
    });
    return t;
  };

  // ---- the diagram ------------------------------------------------------------------------------------------------
  /** the state diagram (positions kept when given). opts as S.Kit.fsm.draw */
  P6.diagram = (m, opts) => K.fsm.draw(m, opts || {});
  /** positions for a machine's states, spaced for its longest edge label */
  P6.layout = (m, opts) => {
    if (m.placed && !opts && (m.states || []).every((q) => m.placed[q])) return m.placed;
    const g = K.fsm.machine(m);
    const lw = Math.max(0, ...g.trans.map((t) => Math.max(...String(t.label).split('\n').map((l) => Geo.textWidth(l, 15)))));
    const lines = Math.max(1, ...g.trans.map((t) => String(t.label).split('\n').length));
    return K.fsm.layout(m, Object.assign({ gapX: Math.max(150, 100 + lw * 1.4), gapY: Math.max(150, 100 + lines * 26) }, opts || {})).pos;
  };

  // ---- runs over clocks -------------------------------------------------------------------------------------------
  /**
   * A strip of cells, one column per clock: rows for the input, the state during the clock and the output.
   * opts: {x, y, prefix, upto (columns filled), cur (the lit column), cell (px), names}
   * run: F.run's result; xs the input symbols.
   */
  P6.strip = function (m, xs, run, opts) {
    opts = opts || {};
    const P = opts.prefix || 'sp', x0 = opts.x || 0, y0 = opts.y || 0;
    const n = xs.length, upto = opts.upto === undefined ? n : opts.upto;
    const mealy = m.type === 'mealy';
    const w = Math.max(46, ...m.states.map((s) => Geo.textWidth(s, 15, { mono: true }) + 16), ...xs.map((x) => Geo.textWidth(x, 15, { mono: true }) + 16));
    const rows = [['clock', (k) => String(k + 1)], [m.inputs.join(''), (k) => xs[k]], ['state', (k) => run.states[k]], [m.outputs.join(''), (k) => (mealy ? run.outputs[k] : run.outputs[k])]];
    const items = [];
    const headW = Math.max(...rows.map((r) => Geo.textWidth(r[0], 14, { bold: true }) + 20), 60);
    rows.forEach((r, j) => {
      items.push({ key: P + ':h:' + j, kind: 'cell', x: x0, y: y0 + j * 36, w: headW, h: 34, rx: 0, text: r[0], cls: 'head', size: 14 });
      for (let k = 0; k < n; k++) {
        const filled = k < upto && (r[1](k) !== undefined);
        items.push({ key: P + ':c:' + j + ':' + k, kind: 'cell', x: x0 + headW + k * w, y: y0 + j * 36, w, h: 34, rx: 0, text: filled ? r[1](k) : '', cls: 'mono strip' + (k === opts.cur ? ' act' : '') + (j === 0 ? ' head' : '') + (j === 3 && filled && /1/.test(r[1](k)) ? ' z1' : ''), size: 15 });
      }
    });
    return { items, box: { x: x0, y: y0, w: headW + n * w, h: rows.length * 36 } };
  };

  /**
   * Zero-delay waveforms of a machine: the clock rises at k·P + P/2, the k-th input arrives at k·P + lead.
   * Returns {signals: [{name, changes, width}], t1, edges, P}. A Mealy output follows the input at once; a
   * Moore output changes only at an edge.
   */
  P6.waves = function (m, xs, opts) {
    opts = opts || {};
    const P = opts.period || 100, lead = opts.lead === undefined ? 20 : opts.lead, n = xs.length;
    const r = F().run(m, xs);
    const clk = [], ins = m.inputs.map(() => []), outs = m.outputs.map(() => []), st = [];
    for (let k = 0; k <= n; k++) { clk.push([k * P, 0]); if (k < n) clk.push([k * P + P / 2, 1]); }
    const edges = []; for (let k = 0; k < n; k++) edges.push(k * P + P / 2);
    // the state during [edge k-1, edge k)
    const stateAt = (t) => { let i = 0; for (const e of edges) if (t >= e) i++; return r.states[Math.min(i, r.states.length - 1)]; };
    const inAt = (t) => { let k = 0; for (let j = 0; j < n; j++) if (t >= j * P + (j ? lead : 0)) k = j; return xs[k]; };
    const times = new Set([0]);
    for (let k = 0; k < n; k++) { times.add(k * P + (k ? lead : 0)); times.add(edges[k]); }
    const T = [...times].sort((a, b) => a - b);
    for (const t of T) {
      const s = stateAt(t), x = inAt(t);
      st.push([t, s]);
      m.inputs.forEach((_, i) => ins[i].push([t, +x[i]]));
      const z = m.type === 'mealy' ? m.out[s][x] : m.out[s];
      m.outputs.forEach((_, i) => outs[i].push([t, z[i] === '-' ? 'x' : +z[i]]));
    }
    const dedupe = (a) => a.filter((q, i) => i === 0 || q[1] !== a[i - 1][1]);
    const signals = [{ name: 'CLK', changes: clk }].concat(m.inputs.map((nm, i) => ({ name: nm, changes: dedupe(ins[i]) })), m.outputs.map((nm, i) => ({ name: nm, changes: dedupe(outs[i]) })));
    return { signals, states: dedupe(st), t1: n * P, edges, P, run: r };
  };
  /** the state names over time, as text items centred in each stretch, above a band (for under waveforms) */
  P6.stateRow = function (states, xOf, y, t1, prefix) {
    const items = [];
    states.forEach(([t, s], i) => {
      const t2 = i + 1 < states.length ? states[i + 1][0] : t1;
      const a = xOf(t), b = xOf(t2);
      items.push({ key: (prefix || 'sr') + ':' + i, kind: 'cell', x: a, y, w: Math.max(2, b - a), h: 26, rx: 0, text: b - a > Geo.textWidth(s, 13, { mono: true }) + 8 ? s : '', cls: 'mono srow', size: 13 });
    });
    return items;
  };

  /** a column of equations as text items, left-aligned at x; lit: set of names drawn hot */
  P6.eqs = function (list, x, y, opts) {
    opts = opts || {};
    const P = opts.prefix || 'eq', items = [];
    if (opts.title) items.push({ key: P + ':title', kind: 'text', x, y: y - 8, text: opts.title, cls: 'title' });
    list.forEach((e, i) => items.push({ key: P + ':' + (e.key || i), kind: 'text', x, y: y + 22 + i * 30, text: P6.pr(e.text), cls: 'mono eqline' + (opts.lit && opts.lit.has(e.key || i) ? ' hot' : '') + (e.cls ? ' ' + e.cls : ''), size: 16 }));
    const w = Math.max(60, opts.title ? Geo.textWidth(opts.title, 13, { bold: true, caps: true, spacing: 0.06 }) : 0, ...list.map((e) => Geo.textWidth(P6.pr(e.text), 16, { mono: true })));
    return { items, box: { x, y: y - 22, w, h: 30 + list.length * 30 } };
  };
  /**
   * A camera for each frame of a topic whose frames differ (camera 'follow'): the frame's own box, but never
   * smaller than minW × minH, so a small table is not blown up to fill the stage
   */
  P6.views = (frames, minW, minH) => { for (const f of frames) if (f && !f.view && f.items) f.view = S.stageBounds(f.items, { minW: minW || 900, minH: minH || 480 }); return frames; };
  /** a closer camera for a phone around one box: padded, never smaller than 320 × 300 */
  P6.narrow = (b, pad) => { if (!b) return null; pad = pad === undefined ? 24 : pad; const w = Math.max(320, b.w + 2 * pad), h = Math.max(300, b.h + 2 * pad); return { x: b.x + b.w / 2 - w / 2, y: b.y + b.h / 2 - h / 2, w, h }; };
  /** a box around a set of items' box with a title, for grouping a stage */
  P6.union = (boxes) => Geo.union(boxes.filter(Boolean));
})(globalThis.Sirkit = globalThis.Sirkit || {});
