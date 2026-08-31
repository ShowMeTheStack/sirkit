// Part 6, machines: running a machine clock by clock with its diagram, table and a strip of the clocks; the
// analysis of a clocked circuit (flip-flop input equations → state equations → state table → diagram); Mealy
// against Moore on one waveform, where the output timing differs; and converting a machine from one kind to the
// other.
(function (S) {
  'use strict';
  const K = S.Kit, P6 = S.P6, TM = K.timing;
  const F = () => S.Fsm;
  const pr = P6.pr;

  S.family({ id: 'p6-machines', part: 'machines', order: 10, title: 'Clocked state machines', blurb: 'What a state machine is and how one is read: run it clock by clock, analyse a circuit into its table and diagram, and compare the Mealy and Moore kinds.' });

  /** the diagram at the left, the table to its right; returns the items and where the bottom is */
  function sideBySide(m, d, tOpts) {
    const t = P6.table(m, Object.assign({ x: d.box.x + d.box.w + 70, y: d.box.y + 30 }, tOpts || {}));
    return { items: d.items.concat(t.items), table: t, bottom: Math.max(d.box.y + d.box.h, t.box.y + t.box.h), right: t.box.x + t.box.w };
  }

  // ---------------------------------------------------------------------------------------------------
  // Running a machine
  // ---------------------------------------------------------------------------------------------------
  const runKeys = ['edge', 'parity', 'two', 'det110', 'det1011', 'count3', 'serial'];
  S.topic({
    id: 'fsm-run', family: 'p6-machines', order: 10, title: 'Running a state machine',
    blurb: 'A machine reads one input per clock. Its state and the input pick a row and a column of the table, which give the next state and the output; the diagram says the same with arrows.',
    inputs: [
      P6.choice(runKeys, 'det110'),
      { id: 'seq', kind: 'text', label: 'Inputs, one per clock (blank: the machine\'s example)', def: '', check: P6.seqCheck('Inputs', 10, (i) => P6.machine(i.m)) },
    ],
    presets: [
      { label: 'Detector for 110', values: { m: 'det110', seq: '' } },
      { label: 'Rising edges (Moore)', values: { m: 'edge', seq: '' } },
      { label: 'Parity of the ones', values: { m: 'parity', seq: '' } },
      { label: 'Serial adder: 3 + 5', values: { m: 'serial', seq: '11 10 01 00' } },
      { label: 'Counter with enable', values: { m: 'count3', seq: '' } },
    ],
    counters: [{ id: 'clocks', label: 'clocks' }, { id: 'ones', label: 'outputs at 1' }],
    run(inp) {
      const m = P6.machine(inp.m), xs = P6.seqFor(m, inp.m, inp.seq), r = F().run(m, xs);
      const pos = P6.layout(m);
      const Fr = new S.Frames(['clocks', 'ones']);
      const mealy = m.type === 'mealy';
      let nv = null;
      const scene = (o) => {
        const d = P6.diagram(m, { pos, prefix: 'fsm', active: o.active ? [o.active] : [], taken: o.taken ? [o.taken] : [] });
        const sb = sideBySide(m, d, { hot: o.row, cell: o.cell });
        const sp = P6.strip(m, xs, r, { x: d.box.x, y: sb.bottom + 50, upto: o.upto, cur: o.cur });
        nv = P6.narrow(d.box);
        return sb.items.concat(sp.items);
      };
      Fr.add({ items: scene({ active: m.start, upto: 0 }), say: P6.LIB[inp.m].say + ' It is a ' + (mealy ? 'Mealy' : 'Moore') + ' machine with ' + m.states.length + ' states, and it starts in ' + m.start + (mealy ? '.' : ', which outputs ' + P6.outText(m, m.out[m.start]) + '.') + ' The inputs to read: ' + xs.join(' ') + '.' });
      xs.forEach((x, k) => {
        const s = r.states[k], n = r.states[k + 1], z = r.outputs[k];
        Fr.count('clocks');
        if (/1/.test(z)) Fr.count('ones');
        Fr.add({ items: scene({ active: s, row: s, cell: [s, x], upto: k + 1, cur: k }), say: 'Clock ' + (k + 1) + ': in ' + s + ' with ' + P6.inText(m, x) + '. Row ' + s + ', column ' + P6.colOf(m, x) + ' gives the next state ' + n + (mealy ? ' and the output ' + P6.outText(m, z) + ' (a Mealy output depends on the input too).' : '. The output is the state\'s own: ' + P6.outText(m, z) + '.'), meta: { ask: k % 2 === 0, next: n, z } });
        Fr.add({ items: scene({ active: n, taken: s + '>' + n, row: n, upto: k + 1, cur: k }), say: 'The clock edge moves the machine along the arrow ' + s + ' → ' + n + (s === n ? ' (a loop: it stays).' : '.') + (!mealy ? ' From now on it outputs ' + P6.outText(m, m.out[n]) + '.' : '') });
      });
      const ones = xs.map((_, k) => k).filter((k) => /1/.test(r.outputs[k]));
      Fr.add({ items: scene({ active: r.states[xs.length], upto: xs.length }), say: 'After ' + xs.length + ' clocks the machine is in ' + r.states[xs.length] + '. ' + (ones.length ? 'The output was ' + (m.outputs.length === 1 ? '1' : 'nonzero') + ' on clock' + (ones.length > 1 ? 's ' : ' ') + ones.map((k) => k + 1).join(', ') + '.' : 'The output stayed 0 throughout.') + ' The strip under the table is the whole run, one column per clock.' });
      for (const f of Fr.list) f.narrowView = nv;
      const def = { sections: [{ id: 'd', kind: 'math', title: 'One clock', text: (mealy ? ['next state = δ(state, input)', 'output     = λ(state, input)', '', 'Mealy: the output depends on', 'the state and the input.'] : ['next state = δ(state, input)', 'output     = λ(state)', '', 'Moore: the output depends on', 'the state only.']).join('\n') }] };
      return { frames: P6.views(Fr.list), def };
    },
    predict: [
      { at: (f) => f.meta && f.meta.ask, pick: 'item', ask: 'Click the state the machine goes to on this clock edge.', answer: (fr, i) => 'fsm:s:' + fr[i].meta.next, explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'A state table row is picked by…', options: ['the input', 'the present state', 'the output', 'the clock'], answer: 1, why: 'Rows are present states; the columns are the input values.' },
      { q: 'In a Mealy machine the output depends on…', options: ['the state only', 'the input only', 'the state and the input', 'the next state'], answer: 2, why: 'Mealy outputs are written on the arrows (input/output): both the state and the input decide them.' },
      { q: 'In a Moore machine the output is written…', options: ['on the arrows', 'inside the states', 'in a separate table only', 'nowhere'], answer: 1, why: 'A Moore output belongs to the state, so it is written with the state: S2/1.' },
      { q: 'When does a synchronous machine change state?', options: ['whenever the input changes', 'on the active clock edge', 'when the output changes', 'at any time'], answer: 1, why: 'The flip-flops that hold the state change only on the clock edge.' },
      { q: 'A machine with 5 states needs at least how many flip-flops?', options: ['2', '3', '5', '4'], answer: 1, why: 'Three flip-flops give 8 codes, enough for 5 states; two give only 4.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Analysis of a clocked circuit
  // ---------------------------------------------------------------------------------------------------
  const CIRCUITS = {
    dmealy: { label: 'Two D flip-flops, a Mealy output', o: { title: 'analysis-d', ff: 'D', vars: ['Q1', 'Q0'], inputs: ['X'], eqs: { D1: "Q1X' + Q0X", D0: "Q1'X", Z: "Q1Q0'X" }, outputs: ['Z'] } },
    jk: { label: 'Two JK flip-flops, a Moore output', o: { title: 'analysis-jk', ff: 'JK', vars: ['A', 'B'], inputs: ['X'], eqs: { JA: 'BX', KA: "X'", JB: 'X', KB: 'A' }, outputs: ['Y'], moore: true, extra: { Y: 'AB' } } },
    tcount: { label: 'Two T flip-flops: a counter with enable', o: { title: 'analysis-t', ff: 'T', vars: ['A', 'B'], inputs: ['E'], eqs: { TA: 'BE', TB: 'E' }, outputs: ['Y'], moore: true, extra: { Y: 'AB' } } },
    dmoore: { label: 'Two D flip-flops, a Moore output', o: { title: 'analysis-dm', ff: 'D', vars: ['Q1', 'Q0'], inputs: ['X'], eqs: { D1: "Q0X + Q1X", D0: "Q1'Q0'X + Q1X'" }, outputs: ['Z'], moore: true, extra: { Z: 'Q1Q0' } } },
  };
  const circuitOf = (key) => { const o = CIRCUITS[key].o; return P6.build(Object.assign({}, o, { eqs: Object.assign({}, o.eqs, o.extra || {}) })); };
  S.topic({
    id: 'fsm-analysis', family: 'p6-machines', order: 20, title: 'Analysing a clocked circuit',
    blurb: 'Given a circuit of flip-flops and gates, find what it does: read the flip-flop input equations off the wires, turn them into state equations, fill in the state table row by row and draw the diagram.',
    inputs: [{ id: 'c', kind: 'choice', label: 'Circuit', def: 'dmealy', options: Object.keys(CIRCUITS).map((k) => ({ value: k, label: CIRCUITS[k].label })) }],
    presets: Object.keys(CIRCUITS).map((k) => ({ label: CIRCUITS[k].label, values: { c: k } })),
    counters: [{ id: 'eqs', label: 'equations' }, { id: 'rows', label: 'table rows' }],
    camera: 'follow',
    run(inp) {
      const c = circuitOf(inp.c), a = F().analyse(c), m = a.machine, ff = CIRCUITS[inp.c].o.ff;
      const res = K.schem.layout(c), B = res.bounds;
      const Fr = new S.Frames(['eqs', 'rows']);
      const ffIds = c.parts.filter((p) => ['DFF', 'JKFF', 'TFF'].includes(p.type));
      const eqList = [];
      const circ = (hot, lit) => {
        const e = P6.eqs(eqList, B.w + 50, 30, { prefix: 'eq', title: 'equations', lit });
        return [K.schem.item('circ', res, { hot: hot || [] })].concat(e.items);
      };
      Fr.add({ items: circ(), say: 'A clocked circuit: ' + ffIds.length + ' ' + ff + ' flip-flops (' + a.vars.join(', ') + '), the input ' + a.inputs.join(', ') + ' and the output ' + a.outputs.join(', ') + '. The flip-flops hold the state; the gates decide what goes into them.' });
      a.inputEquations.forEach((e) => {
        eqList.push({ key: e.name, text: e.text });
        Fr.count('eqs');
        const p = ffIds.find((q) => e.name.endsWith(q.params.name.replace(/^[A-Za-z]+/, '') || q.params.name));
        Fr.add({ items: circ(p ? [p.id] : [], new Set([e.name])), say: 'Follow the wires back from the ' + e.name.replace(/\d+$|[AB]$/, '') + ' input of flip-flop ' + (p ? p.params.name : '') + ': ' + pr(e.text) + (e.min !== e.text.split(' = ')[1] && e.min ? ' (= ' + pr(e.min) + ')' : '') + '.' });
      });
      a.stateEquations.forEach((e) => {
        eqList.push({ key: 'n' + e.name, text: e.text, cls: 'good' });
        Fr.count('eqs');
        const how = ff === 'D' ? 'A D flip-flop takes its D on the edge' : ff === 'T' ? 'A T flip-flop toggles when T = 1: Q(t+1) = T ⊕ Q' : 'A JK flip-flop follows Q(t+1) = JQ′ + K′Q';
        Fr.add({ items: circ([], new Set(['n' + e.name])), say: how + ', so the state equation is ' + pr(e.text) + '.' });
      });
      a.outputEquations.forEach((e) => {
        eqList.push({ key: 'o' + e.name, text: e.text });
        Fr.count('eqs');
        Fr.add({ items: circ([], new Set(['o' + e.name])), say: 'The output ' + pr(e.text) + (e.dependsOnInputs ? ' uses the input, so this is a Mealy machine: outputs go on the arrows.' : ' uses only the flip-flops, so this is a Moore machine: the output goes with the state.'), meta: { kind: e.dependsOnInputs ? 'Mealy' : 'Moore' } });
      });
      // the table, row by row, beside the equations
      const eq2 = () => P6.eqs(eqList.filter((e) => e.key[0] === 'n' || e.key[0] === 'o'), 0, 30, { prefix: 'eq', title: 'equations' });
      const syms = F().symbols(m);
      for (let i = 0; i <= m.states.length; i++) {
        const e = eq2();
        const t = P6.table(m, { x: e.box.x + e.box.w + 60, y: 30, show: i, hot: i ? m.states[i - 1] : null, title: 'state table' });
        const s = m.states[i - 1];
        if (i) Fr.count('rows');
        Fr.add({ items: e.items.concat(t.items), say: i === 0 ? 'Now the state table: one row for each present state ' + m.states.join(', ') + ', worked out from the state equations.' : 'Present state ' + s + ' (' + a.vars.map((v, k) => v + ' = ' + s[k]).join(', ') + '): ' + syms.map((x) => 'with ' + P6.inText(m, x) + ' the next state is ' + m.next[s][x] + (m.type === 'mealy' ? ' and ' + P6.outText(m, m.out[s][x]) : '')).join('; ') + (m.type === 'moore' ? '; the output is ' + m.out[s] : '') + '.', meta: i < m.states.length ? { ask: true, state: m.states[i], x: syms[syms.length - 1], next: m.next[m.states[i]][syms[syms.length - 1]] } : null });
      }
      const e = eq2();
      const t = P6.table(m, { x: e.box.x + e.box.w + 60, y: 30, title: 'state table' });
      const d = P6.diagram(m, { prefix: 'fsm', x: 0, y: 0 });
      const dy = Math.max(e.box.y + e.box.h, t.box.y + t.box.h) + 60 - d.box.y;
      const d2 = P6.diagram(m, { prefix: 'fsm', y: dy, x: (t.box.x + t.box.w) / 2 - (d.box.x + d.box.w / 2) });
      Fr.add({ items: e.items.concat(t.items, d2.items), say: 'The state diagram says the same as the table: a circle per state' + (m.type === 'moore' ? ' with its output' : '') + ', an arrow per row and column labelled with ' + (m.type === 'mealy' ? 'input/output' : 'the input') + '.' + (F().reachable(m).length < m.states.length ? ' Not every state can be reached from ' + m.start + '.' : '') });
      const def = { sections: [{ id: 'd', kind: 'math', title: 'Analysis', text: ['1. flip-flop input equations', '2. state equations:', '   D:  Q(t+1) = D', '   T:  Q(t+1) = T ⊕ Q', "   JK: Q(t+1) = JQ' + K'Q", '3. state table', '4. state diagram'].join('\n') }] };
      return { frames: P6.views(Fr.list), def };
    },
    predict: [
      { at: (f) => f.meta && f.meta.ask, pick: 'option', options: (fr, i) => F().util.symbols(fr[i].meta.state.length), ask: (fr, i) => 'Next row: present state ' + fr[i].meta.state + ' with the input at ' + fr[i].meta.x + '. What is the next state?', answer: (fr, i) => fr[i].meta.next, explain: (fr, i) => fr[i + 1].say },
      { at: (f) => f.meta && f.meta.kind, pick: 'option', options: ['Mealy', 'Moore'], ask: 'Is this a Mealy or a Moore machine?', answer: (fr, i) => fr[i].meta.kind, explain: (fr, i) => fr[i].say, once: true },
    ],
    quiz: [
      { q: 'The first step in analysing a clocked circuit is…', options: ['draw the state diagram', 'write the flip-flop input equations', 'choose a state assignment', 'minimise the outputs'], answer: 1, why: 'The equations of D, T or J and K come straight off the wires; everything else follows from them.' },
      { q: 'A T flip-flop with T = BE. Its state equation is…', options: ['A(t+1) = BE', 'A(t+1) = BE ⊕ A', 'A(t+1) = A′', 'A(t+1) = B'], answer: 1, why: 'A T flip-flop toggles when T = 1: Q(t+1) = T ⊕ Q.' },
      { q: 'For a JK flip-flop the state equation is built from…', options: ['Q(t+1) = J', "Q(t+1) = JQ' + K'Q", 'Q(t+1) = J ⊕ K', 'Q(t+1) = JK'], answer: 1, why: 'The characteristic equation of the JK flip-flop.' },
      { q: 'The output Z = Q1Q0X depends on X, so the machine is…', options: ['Moore', 'Mealy', 'asynchronous', 'combinational'], answer: 1, why: 'An output that uses an input is a Mealy output.' },
      { q: 'A circuit with 2 flip-flops and 1 input has a state table of…', options: ['2 rows, 2 columns', '4 rows, 2 input columns', '4 rows, 4 columns', '8 rows'], answer: 1, why: 'Four present states (00 to 11), each with a column for X = 0 and X = 1.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Mealy against Moore: the output timing
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'mealy-moore', family: 'p6-machines', order: 30, title: 'Mealy against Moore: when the output moves',
    blurb: 'The same detector built both ways. The Mealy output answers as soon as the input arrives, in the middle of a clock; the Moore output waits for the edge that enters the detecting state, and then holds for a whole clock.',
    inputs: [
      { id: 'pattern', kind: 'text', label: 'Pattern to detect', def: '101', check: (v) => (/^[01]{2,4}$/.test(String(v).trim()) ? null : 'Pattern: 2 to 4 bits of 0s and 1s') },
      { id: 'seq', kind: 'text', label: 'Input X, one bit per clock', def: '0101101', check: (v) => (/^[01]{3,10}$/.test(String(v).replace(/\s+/g, '')) ? null : 'Input X: 3 to 10 bits') },
    ],
    presets: [
      { label: '101 in 0101101', values: { pattern: '101', seq: '0101101' } },
      { label: '11 in 0110111', values: { pattern: '11', seq: '0110111' } },
      { label: '110 in 1101100', values: { pattern: '110', seq: '1101100' } },
      { label: '1001 in 10010011', values: { pattern: '1001', seq: '10010011' } },
    ],
    counters: [{ id: 'mealy', label: 'Mealy Z = 1 clocks' }, { id: 'moore', label: 'Moore Z = 1 clocks' }],
    camera: 'fit-all',
    run(inp) {
      const pat = String(inp.pattern).trim(), xs = String(inp.seq).replace(/\s+/g, '').split('');
      const me = F().detector(pat, { type: 'mealy' }).machine, mo = F().detector(pat, { type: 'moore' }).machine;
      const wa = P6.waves(me, xs), wb = P6.waves(mo, xs);
      const d1 = P6.diagram(me, { prefix: 'me' });
      const dx = d1.box.x + d1.box.w + 90;
      const pos2 = P6.layout(mo);
      const d2probe = P6.diagram(mo, { prefix: 'mo', pos: pos2 });
      const shiftX = dx - d2probe.box.x, shiftY = d1.box.y - d2probe.box.y;
      const top = Math.min(d1.box.y, d2probe.box.y + shiftY);
      const bottom = Math.max(d1.box.y + d1.box.h, d2probe.box.y + d2probe.box.h + shiftY);
      const signals = [wa.signals[0], wa.signals[1], Object.assign({}, wa.signals[2], { name: 'Zme', label: 'Z Mealy', cls: 'mealy' }), Object.assign({}, wb.signals[2], { name: 'Zmo', label: 'Z Moore', cls: 'moore' })];
      const W = Math.max(520, dx + d2probe.box.w - d1.box.x - 90);
      const stateAt = (w, t) => { let s = w.states[0][1]; for (const [tt, v] of w.states) if (tt <= t) s = v; return s; };
      const Fr = new S.Frames(['mealy', 'moore']);
      const scene = (t, takenA, takenB) => {
        const a = P6.diagram(me, { prefix: 'me', pos: d1.pos, active: [stateAt(wa, t)], taken: takenA ? [takenA] : [] });
        const b = P6.diagram(mo, { prefix: 'mo', pos: pos2, x: shiftX, y: shiftY, active: [stateAt(wb, t)], taken: takenB ? [takenB] : [] });
        const ttl = [{ key: 'tA', kind: 'text', x: d1.box.x, y: top - 24, text: 'Mealy: ' + me.states.length + ' states', cls: 'title' }, { key: 'tB', kind: 'text', x: dx, y: top - 24, text: 'Moore: ' + mo.states.length + ' states', cls: 'title' }];
        const wv = TM.waves({ x: d1.box.x, y: bottom + 60, w: W, t0: 0, t1: wa.t1, now: t, signals, prefix: 'tw', ticks: Math.min(xs.length, 5) });
        return a.items.concat(b.items, ttl, wv.items);
      };
      const at = (w, t) => { let v = 0; for (const [tt, x] of w) if (tt <= t) v = x; return v; };
      Fr.add({ items: scene(0), say: 'Both machines detect ' + pat + ' (overlapping). The Mealy one needs ' + me.states.length + ' states; the Moore one needs ' + mo.states.length + ', because "just seen the whole pattern" must be a state of its own to output 1. X changes ' + 20 + ' ns into each clock period; the clock rises in the middle.' });
      xs.forEach((x, k) => {
        const tIn = k * 100 + (k ? 20 : 0) + 1, tEdge = k * 100 + 51;
        const zme = at(signals[2].changes, tIn), zmo = at(signals[3].changes, tIn);
        const sA = stateAt(wa, tIn), sB = stateAt(wb, tIn);
        Fr.add({ items: scene(tIn), say: 'X = ' + x + ' arrives at ' + (tIn - 1) + ' ns. The Mealy machine in ' + sA + ' answers at once: Z = ' + zme + '. The Moore machine in ' + sB + ' still shows its state\'s output, Z = ' + zmo + '.', meta: { mealyUp: zme === 1 && (k === 0 || at(signals[2].changes, tIn - 2) === 0) } });
        if (zme === 1) Fr.count('mealy');
        const nA = stateAt(wa, tEdge), nB = stateAt(wb, tEdge), zmo2 = at(signals[3].changes, tEdge);
        if (zmo2 === 1) Fr.count('moore');
        Fr.add({ items: scene(tEdge, sA + '>' + nA, sB + '>' + nB), say: 'The clock rises at ' + (tEdge - 1) + ' ns: Mealy ' + sA + ' → ' + nA + ', Moore ' + sB + ' → ' + nB + '. ' + (zmo2 === 1 ? (zmo === 1 ? 'The Moore machine enters its detecting state again, so its output stays 1 for another clock.' : 'The Moore output turns 1 now, on the edge, and stays 1 until the next edge.') : 'The Moore output is ' + zmo2 + '.') + (zme === 1 && zmo2 === 1 ? ' Both have reported the same detection; the Moore one waited for the edge.' : '') });
      });
      Fr.add({ items: scene(wa.t1), say: 'The whole run. Each detection shows up in both outputs, but the Mealy pulse starts when X arrives (inside the clock that completes the pattern) and the Moore pulse starts at the next edge and lasts exactly one clock. A Mealy output is only trustworthy just before the edge, after X has settled.', mark: 'end' });
      const def = { sections: [{ id: 'd', kind: 'math', title: 'The two kinds', text: ['Mealy:  Z = λ(state, X)', '  changes when X changes', '  fewer states', '', 'Moore:  Z = λ(state)', '  changes only at a clock edge', '  one clock later, glitch-free'].join('\n') }] };
      return { frames: P6.views(Fr.list), def };
    },
    predict: [
      { at: (f) => f.meta && f.meta.mealyUp, pick: 'option', options: ['At the same moment', 'At the next rising edge', 'Two clocks later'], ask: 'The Mealy output has just gone to 1. When will the Moore output show this detection?', answer: 'At the next rising edge', explain: (fr, i) => fr[i + 1].say, once: true },
    ],
    quiz: [
      { q: 'A Mealy output can change…', options: ['only at a clock edge', 'whenever the input or the state changes', 'only when the state changes', 'never'], answer: 1, why: 'It is a combinational function of the state and the input.' },
      { q: 'A detector for a 3-bit pattern needs how many states as a Moore machine (overlapping)?', options: ['3', '4', '5', '2'], answer: 1, why: 'Three states for 0, 1 and 2 bits matched, plus one state that means "the whole pattern was just seen" and outputs 1.' },
      { q: 'Compared with the Mealy version, the Moore output pulse comes…', options: ['earlier', 'at the same time', 'up to one clock later and lasts a full clock', 'never'], answer: 2, why: 'It waits for the edge that enters the detecting state.' },
      { q: 'Why can a Mealy output show a false pulse?', options: ['Because its flip-flops are slower', 'Because the input may change partway through a clock, and the output follows it at once', 'Because it has more states', 'It cannot'], answer: 1, why: 'Between edges the output tracks the input, so a passing input value shows up on it.' },
      { q: 'Which kind usually needs fewer states for the same job?', options: ['Mealy', 'Moore', 'They always need the same', 'It depends on the clock'], answer: 0, why: 'Mealy outputs live on the arrows, so no extra state is needed just to hold an output value.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Converting between Mealy and Moore
  // ---------------------------------------------------------------------------------------------------
  const convKeys = ['two', 'det110', 'det1011', 'edge', 'parity', 'count3'];
  S.topic({
    id: 'mealy-moore-convert', family: 'p6-machines', order: 40, title: 'Converting Mealy to Moore and back',
    blurb: 'A Mealy state entered with two different outputs splits into two Moore states, one for each output. Going the other way, each arrow takes the output of the state it enters.',
    inputs: [P6.choice(convKeys, 'det110'), { id: 'seq', kind: 'text', label: 'Check on these inputs (blank: the example)', def: '', check: P6.seqCheck('Inputs', 10, (i) => P6.machine(i.m)) }],
    presets: [
      { label: 'Detector for 110 (Mealy → Moore)', values: { m: 'det110' } },
      { label: 'Two equal bits (Mealy → Moore)', values: { m: 'two' } },
      { label: 'Detector for 1011 (Mealy → Moore)', values: { m: 'det1011' } },
      { label: 'Rising edges (Moore → Mealy)', values: { m: 'edge' } },
      { label: 'Parity (Moore → Mealy)', values: { m: 'parity' } },
    ],
    counters: [{ id: 'states', label: 'states now' }],
    camera: 'follow',
    run(inp) {
      const m = P6.machine(inp.m), xs = P6.seqFor(m, inp.m, inp.seq);
      const toMoore = m.type === 'mealy';
      const conv = toMoore ? F().toMoore(m) : F().toMealy(m), r = conv.machine;
      const pos = P6.layout(m);
      const Fr = new S.Frames(['states']);
      Fr.set('states', m.states.length);
      const tableOf = (mm, d, o) => P6.table(mm, Object.assign({ x: d.box.x + d.box.w + 70, y: d.box.y + 20 }, o || {}));
      const d0 = P6.diagram(m, { prefix: 'fsm', pos });
      Fr.add({ items: d0.items.concat(tableOf(m, d0).items), say: 'A ' + (toMoore ? 'Mealy' : 'Moore') + ' machine with ' + m.states.length + ' states. ' + P6.LIB[inp.m].say });
      if (toMoore) {
        const splits = conv.trace.filter((t) => t.kind === 'split');
        for (const sp of splits) {
          const into = m.states.flatMap((s) => F().symbols(m).filter((x) => m.next[s][x] === sp.state).map(() => s + '>' + sp.state));
          const d = P6.diagram(m, { prefix: 'fsm', pos, hot: [sp.state], taken: into });
          Fr.add({ items: d.items.concat(tableOf(m, d).items), say: 'Into ' + sp.state + '? ' + sp.say, meta: { ask: true, n: sp.outs.length } });
        }
        // the Moore machine: new states grow out of the ones they came from
        const from = {};
        for (const q of r.states) from[q] = 'fsm:s:' + q.replace(/_[01]+$/, '');
        const pos2 = P6.layout(r);
        const d = P6.diagram(r, { prefix: 'fsm', pos: pos2, from });
        Fr.set('states', r.states.length);
        Fr.add({ items: d.items.concat(tableOf(r, d).items), say: 'The Moore machine: ' + r.states.length + ' states, each with its output inside. Every arrow that entered a split state now enters the copy with the right output.' });
        const ra = F().run(m, xs), rb = F().run(r, xs);
        const st = P6.strip(m, xs, ra, { x: d.box.x, y: Math.max(d.box.y + d.box.h, 0) + 50, prefix: 'sa' });
        const st2 = P6.strip(r, xs, rb, { x: d.box.x, y: st.box.y + st.box.h + 30, prefix: 'sb' });
        Fr.add({ items: d.items.concat(tableOf(r, d).items, st.items, st2.items), say: 'Check on ' + xs.join('') + ': the Mealy outputs ' + ra.outputs.join(' ') + ' and the Moore outputs (from the start state on) ' + rb.outputs.join(' ') + '. Each Moore output appears one clock after the Mealy one, in the state the arrow entered.' });
      } else {
        const edges = conv.trace.filter((t) => t.kind === 'edge');
        const byState = new Map();
        for (const e of edges) { if (!byState.has(e.next)) byState.set(e.next, []); byState.get(e.next).push(e); }
        for (const [s, es] of byState) {
          const d = P6.diagram(m, { prefix: 'fsm', pos, hot: [s], taken: es.map((e) => e.state + '>' + s) });
          Fr.add({ items: d.items.concat(tableOf(m, d).items), say: s + ' outputs ' + m.out[s] + ', so every arrow into it (' + es.map((e) => 'from ' + e.state + ' on ' + e.input).join(', ') + ') gets the output ' + m.out[s] + ': ' + es.map((e) => e.input + '/' + m.out[s]).join(', ') + '.', meta: { askOut: true, out: m.out[s] } });
        }
        const d = P6.diagram(r, { prefix: 'fsm', pos });
        Fr.add({ items: d.items.concat(tableOf(r, d).items), say: 'The Mealy machine has the same ' + r.states.length + ' states; the outputs moved from the states onto the arrows. Its output on a clock is what the Moore machine shows one clock later.' });
        const ra = F().run(m, xs), rb = F().run(r, xs);
        const st = P6.strip(m, xs, ra, { x: d.box.x, y: d.box.y + d.box.h + 50, prefix: 'sa' });
        const st2 = P6.strip(r, xs, rb, { x: d.box.x, y: st.box.y + st.box.h + 30, prefix: 'sb' });
        Fr.add({ items: d.items.concat(tableOf(r, d).items, st.items, st2.items), say: 'Check on ' + xs.join('') + ': Moore outputs ' + ra.outputs.join(' ') + ' (the first is the start state\'s, before any input) and Mealy outputs ' + rb.outputs.join(' ') + ': the same values, one clock sooner.' });
      }
      const def = { sections: [{ id: 'd', kind: 'math', title: 'Conversion', text: ['Moore → Mealy:', '  arrow into q gets q\'s output', '', 'Mealy → Moore:', '  q entered with outputs z1, z2', '  → states q_z1, q_z2', '  (one per output on the way in)'].join('\n') }] };
      return { frames: P6.views(Fr.list), def };
    },
    predict: [
      { at: (f) => f.meta && f.meta.ask, pick: 'option', options: ['1', '2', '3'], ask: 'Look at the arrows into the lit state. How many Moore states will it become?', answer: (fr, i) => String(fr[i].meta.n), explain: (fr, i) => fr[i].say, once: false },
      { at: (f) => f.meta && f.meta.askOut, pick: 'option', options: ['0', '1'], ask: 'What output do the lit arrows carry in the Mealy machine?', answer: (fr, i) => fr[i].meta.out, explain: (fr, i) => fr[i].say, once: true },
    ],
    quiz: [
      { q: 'Moore to Mealy: the output on an arrow into state q is…', options: ['the output of the state it leaves', 'the output of q', 'always 0', 'the input'], answer: 1, why: 'The Mealy machine announces on the arrow what the Moore machine will show once it is in q.' },
      { q: 'Mealy to Moore: a state entered by arrows with outputs 0 and 1 becomes…', options: ['one Moore state', 'two Moore states', 'no state', 'four states'], answer: 1, why: 'Each Moore state has one output, so one copy per output on the way in.' },
      { q: 'Converting Mealy to Moore can…', options: ['only reduce the states', 'keep or increase the number of states', 'remove the outputs', 'change the inputs'], answer: 1, why: 'Splitting states never merges any, so the count stays the same or grows.' },
      { q: 'The Moore machine made from a Mealy machine gives its outputs…', options: ['one clock earlier', 'at the same time', 'one clock later', 'two clocks later'], answer: 2, why: 'The output appears once the machine is in the state the arrow entered.' },
    ],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
