// Part 10, analysis: cutting the feedback loops of a gate circuit into secondary variables, the transition and
// flow tables with their stable states, fundamental-mode operation followed on the flow table, races and cycles
// played out in every order on the cube of codes, and the SR latch analysed the same way.
(function (S) {
  'use strict';
  const P10 = S.P10, A = () => S.Async, FL = () => S.Kit.flow, K = () => S.Kit;
  const eqInput = (def) => ({ id: 'eqs', kind: 'text', label: 'Excitation equations (separated by ;)', def: P10.models[def].eqs, check: P10.check('Equations') });
  const nm = (v) => String(v).replace(/'/g, '′');

  // ---------------------------------------------------------------------------------------------------------
  // Feedback loops and secondary variables
  // ---------------------------------------------------------------------------------------------------------
  // each circuit as gates (for cutting the loops) and as drawn (the same gates; loops through delay blocks)
  const circuits = {
    nor: { label: 'SR latch of two NOR gates', make: () => K().timing.build.srNor() },
    nand: { label: 'SR latch of two NAND gates', make: () => K().timing.build.srNand() },
    celem: { label: 'C-element (AND-OR with feedback)', make: (b) => P10.circuit(P10.parse(P10.models.celem.eqs), { title: 'C-element', buffers: b }) },
    two: { label: 'Two loops', make: (b) => P10.circuit(P10.parse("Y1 = xy2' + y1y2'; Y2 = xy1 + xy2; z = y2"), { title: 'two loops', buffers: b }) },
  };
  /**
   * The gates on the loop a cut net closes: those reachable from it that also reach back to its driver, with the
   * other cut nets held cut (so a loop is not credited with the gates of another loop it feeds)
   */
  function loopGates(c, net, cuts) {
    const other = new Set((cuts || []).filter((n) => n !== net));
    const Nl = S.Netlist, gates = c.parts.filter((p) => Nl.GATES.has(p.type));
    const dir = (r) => r.part.pins.find((q) => q.name === r.pin).dir;
    const drv = net.pins.find((r) => dir(r) === 'out').part;
    const fwd = (p) => (p.net.y && !other.has(p.net.y) ? p.net.y.pins.filter((r) => dir(r) === 'in' && Nl.GATES.has(r.part.type)).map((r) => r.part) : []);
    const reachF = new Set(), q = [drv];
    while (q.length) { const p = q.shift(); for (const n of fwd(p)) if (!reachF.has(n)) { reachF.add(n); q.push(n); } }
    const back = (p) => p.pins.filter((x) => x.dir === 'in').map((x) => p.net[x.name]).filter((n) => n && !other.has(n)).map((n) => n.pins.find((r) => dir(r) === 'out').part).filter((g) => Nl.GATES.has(g.type));
    const reachB = new Set(), q2 = [drv];
    while (q2.length) { const p = q2.shift(); for (const n of back(p)) if (!reachB.has(n)) { reachB.add(n); q2.push(n); } }
    return gates.filter((g) => g === drv || (reachF.has(g) && reachB.has(g))).map((g) => g.id);
  }
  S.topic({
    id: 'async-loops', family: 'p10-analysis', order: 10, title: 'Feedback loops and secondary variables',
    blurb: 'A circuit without a clock remembers through its loops. Find every loop, cut one wire in each, and call what the wire carries a secondary variable y and what the logic drives it towards its excitation Y.',
    inputs: [{ id: 'circ', kind: 'choice', label: 'Circuit', def: 'nor', options: Object.entries(circuits).map(([value, c]) => ({ value, label: c.label })) }],
    presets: Object.entries(circuits).map(([value, c]) => ({ label: c.label, values: { circ: value } })),
    run(inp) {
      const c = circuits[inp.circ].make(true), res = K().schem.layout(circuits[inp.circ].make(false)), fc = A().fromCircuit(c);
      const loops = fc.cuts.map((x) => ({ name: x.name, gates: loopGates(c, x.net, fc.cuts.map((q) => q.net)) }));
      // the notes beside the circuit, so the picture stays as wide as the stage
      const px = 0, py = 0;
      const item = (hot) => K().schem.item('circ', res, { x: 0, y: 0, hot: hot || [] });
      const panel = (lines) => P10.lines('ln', px, py, lines);
      const inputs = c.parts.filter((p) => p.type === 'IN').map((p) => p.params.name);
      const F = new S.Frames(['loops']);
      F.add({ scene: 'circ', items: [item()], say: 'A circuit of ' + c.parts.filter((p) => S.Netlist.GATES.has(p.type) && !/^loop_/.test(p.id)).length + ' gates with inputs ' + inputs.join(', ') + (fc.cuts.length && c.parts.some((p) => /^loop_/.test(p.id)) ? ', each loop drawn through a delay block that stands for its delay' : '') + '. Some gate outputs come back to earlier gates: the circuit has feedback, so what it does depends on what it did before. There is no clock; it reacts whenever an input changes.', meta: { ask: true, n: loops.length } });
      loops.forEach((l, i) => {
        F.count('loops');
        F.add({ scene: 'circ', items: [item(l.gates)], say: 'Loop ' + (i + 1) + ' runs through ' + l.gates.join(', ') + ' and back. Cut it at the wire ' + l.name + ': the loop is now a path from that wire, around, to the same wire again.' });
      });
      const cut = fc.trace[0].say;
      const head = [{ text: 'secondary variables: ' + fc.vars.join(', '), cls: 'hot' }, { text: 'inputs: ' + inputs.join(', '), cls: 'dim' }];
      F.add({ scene: 'notes', items: panel(head), say: cut + ' Picture each loop as a delay: Y is computed at once from the inputs and the present y, and y catches up with Y a moment later.' });
      const eqs = fc.trace.filter((t) => t.kind === 'excitation');
      eqs.forEach((t, i) => {
        F.add({ scene: 'notes', items: panel(head.concat(eqs.slice(0, i + 1).map((q, k) => ({ text: nm(q.say.replace(/\.$/, '')), cls: k === i ? 'hot' : '' })))), say: 'Read the logic from the cut ' + fc.vars[i] + ' back to the inputs and the y wires: ' + nm(t.say) });
      });
      const lines = head.concat(eqs.map((q) => ({ text: nm(q.say.replace(/\.$/, '')), cls: '' })), [{ text: 'stable when ' + fc.vars.map(A().exName).join(', ') + ' = ' + fc.vars.join(', '), cls: 'good' }]);
      F.add({ scene: 'notes', items: panel(lines), say: 'A total state is the inputs together with the secondary variables, (x, y). It is stable when every excitation equals its variable (Y = y): nothing is waiting to change. Otherwise the loops are about to move. The next topic tabulates Y for every total state.', mark: 'end' });
      return { frames: P10.scenes(F.list), def: { sections: [{ id: 'd', kind: 'math', title: 'The model', text: ['y: the value a loop carries now', 'Y: the value the logic drives it to', '', 'Y = f(x, y)', 'stable when Y = y'].join('\n') }] } };
    },
    predict: [{ at: (f) => f.meta && f.meta.ask, pick: 'option', options: ['1', '2', '3'], ask: 'How many wires must be cut to break every loop?', answer: (fr, i) => String(fr[i].meta.n), explain: (fr, i) => fr[i + 1].say }],
    quiz: [
      { q: 'What does a secondary variable stand for?', options: ['A clock signal', 'The value a feedback loop carries, once the loop is cut', 'An unused input', 'The output of a flip-flop'], answer: 1, why: 'Each cut loop wire becomes a variable y; the logic computes the value Y it is driven towards.' },
      { q: 'A total state of an asynchronous circuit is…', options: ['the inputs only', 'the outputs only', 'the inputs together with the secondary variables', 'the clock phase'], answer: 2, why: 'What the circuit does next depends on both x and y.' },
      { q: 'A total state is stable when…', options: ['every input is 0', 'Y = y for every secondary variable', 'the outputs are 1', 'the inputs have just changed'], answer: 1, why: 'Then no loop is waiting to change.' },
      { q: 'An SR latch of two cross-coupled gates needs how many secondary variables?', options: ['0', '1', '2', '3'], answer: 1, why: 'One cut breaks its single loop.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------
  // Transition and flow tables
  // ---------------------------------------------------------------------------------------------------------
  const tablePresets = ['two', 'celem', 'srnor', 'fill'].map((k) => ({ label: P10.models[k].label, values: { eqs: P10.models[k].eqs } }));
  S.topic({
    id: 'async-tables', family: 'p10-analysis', order: 20, title: 'The transition table and the flow table',
    blurb: 'Work out the excitations for every total state, one cell at a time. A cell equal to its row is stable and gets a circle; naming the rows turns the transition table into a flow table.',
    inputs: [eqInput('two')],
    presets: tablePresets,
    counters: [{ id: 'stable', label: 'stable states' }],
    run(inp) {
      const m = P10.model(inp.eqs), an = A().analyse(m);
      const rows = P10.rowsOf(m), cols = P10.colsOf(m), n = rows.length * cols.length;
      const eqLines = m.text().map(nm);
      const tx = 0, ty = eqLines.length * 24 + 34;
      const eqs = P10.lines('eq', 0, 0, eqLines, '');
      const F = new S.Frames(['stable']);
      F.add({ items: eqs.concat(P10.table(m, an, { x: tx, y: ty, upto: 0 }).items), say: 'The excitations: ' + eqLines.join('; ') + '. The table has a row for each value of ' + m.vars.join('') + ' and a column for each input ' + m.inputs.join('') + ', both in Gray order so neighbours differ in one bit.' });
      const perCell = n <= 16;
      const asks = new Set([1, Math.floor(n / 2), n - 2]);
      for (let i = 0; i < n; i++) {
        const r = rows[Math.floor(i / cols.length)], c = cols[i % cols.length];
        const Y = an.table[r][c], st = Y === r;
        if (st) F.count('stable');
        if (!perCell && i % cols.length !== cols.length - 1) continue;
        const say = perCell
          ? 'Row ' + r + ', column ' + c + ': ' + nm(P10.work(m, c, r)) + '. Y = ' + Y + (st ? ', equal to the row: a stable state, circled.' : ', not the row: unstable, the loops will move towards ' + Y + '.')
          : 'Row ' + r + ': ' + cols.map((cc) => cc + ' → ' + an.table[r][cc] + (an.table[r][cc] === r ? ' (stable)' : '')).join(', ') + '.';
        const next = i + 1 < n ? { r: rows[Math.floor((i + 1) / cols.length)], c: cols[(i + 1) % cols.length] } : null;
        F.add({ items: eqs.concat(P10.table(m, an, { x: tx, y: ty, upto: i + 1, hot: perCell ? [[r, c]] : cols.map((cc) => [r, cc]) }).items), say, meta: { ask: perCell && next && asks.has(i + 1), next: next && { r: next.r, c: next.c, stable: an.table[next.r][next.c] === next.r } } });
      }
      const st = an.stable.map((s) => '(' + s.x + ', ' + s.y + ')');
      F.add({ items: eqs.concat(P10.table(m, an, { x: tx, y: ty }).items), say: P10.plural(an.stable.length, 'stable state') + ': ' + (st.join(', ') || 'none') + '. ' + (cols.some((c) => !rows.some((r) => an.table[r][c] === r)) ? 'Column ' + cols.filter((c) => !rows.some((r) => an.table[r][c] === r)).join(', ') + ' has no stable state at all: with that input the circuit can never rest.' : 'Every column has at least one: whatever the input, the circuit can come to rest.') });
      const names = an.names;
      F.add({ items: eqs.concat(P10.table(m, an, { x: tx, y: ty, names, outputs: true }).items), say: 'Name the rows ' + rows.map((r) => names[r] + ' = ' + r).join(', ') + ' and write each next row by its name: the flow table. ' + (Object.keys(m.outputs).length ? 'After each entry, the output ' + Object.keys(m.outputs).join(', ') + ' in that total state.' : '') + ' It says what the circuit does without saying how the rows are coded.', mark: 'end' });
      return { frames: P10.big(F.list), def: { sections: [{ id: 'd', kind: 'math', title: 'Reading a cell', text: ['row y, column x  →  Y = f(x, y)', 'Y = y: stable (circled)', 'Y ≠ y: unstable; y moves to Y', '', 'flow table: rows named a, b, c …'].join('\n') }] } };
    },
    predict: [{ at: (f) => f.meta && f.meta.ask, pick: 'option', options: ['stable', 'unstable'], ask: (fr, i) => 'Next cell: row ' + fr[i].meta.next.r + ', column ' + fr[i].meta.next.c + '. Stable or unstable?', answer: (fr, i) => (fr[i].meta.next.stable ? 'stable' : 'unstable'), explain: (fr, i) => fr[i + 1].say }],
    quiz: [
      { q: 'In a transition table, an entry is circled when…', options: ['it is 0', 'it equals the row it is in', 'it equals the column', 'the output is 1'], answer: 1, why: 'Then Y = y: the total state is stable.' },
      { q: 'Why are the columns of a transition table in Gray order (00, 01, 11, 10)?', options: ['To save space', 'So neighbouring columns differ in one input, the only change fundamental mode allows', 'Because the inputs are Gray coded', 'It is a convention with no reason'], answer: 1, why: 'A single input change moves one column left or right.' },
      { q: 'What does the flow table add or remove compared with the transition table?', options: ['It adds the clock', 'It replaces the row codes with names', 'It removes the stable states', 'It doubles the rows'], answer: 1, why: 'It describes behaviour only; codes come later, in the assignment.' },
      { q: 'A column with no circled entry means…', options: ['the circuit is combinational', 'with that input the circuit can never rest: it oscillates', 'there is a critical race', 'the output is undefined'], answer: 1, why: 'Every total state in that column is unstable.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------
  // Fundamental mode on the flow table
  // ---------------------------------------------------------------------------------------------------------
  const seqCheck = (v, inp) => {
    let m;
    try { m = P10.parse(inp.eqs); } catch (e) { return null; }
    const xs = String(v).trim().split(/[\s,]+/).filter(Boolean);
    if (xs.length < 2) return 'Inputs: give at least two values, like 00 10';
    if (xs.length > 8) return 'Inputs: at most 8 values';
    const bad = xs.find((x) => !new RegExp('^[01]{' + m.inputs.length + '}$').test(x));
    if (bad) return 'Inputs: "' + bad + '" is not ' + m.inputs.length + ' bit' + (m.inputs.length > 1 ? 's' : '') + ' (' + m.inputs.join('') + ')';
    return null;
  };
  S.topic({
    id: 'async-fundamental', family: 'p10-analysis', order: 30, title: 'Fundamental mode: following the flow table',
    blurb: 'One input changes, and only when the circuit is stable. Each change moves sideways to a new column; then the circuit moves down the column, row by row, until it reaches a circled entry.',
    inputs: [eqInput('two'), { id: 'seq', kind: 'text', label: 'Inputs over time', def: '00 10 11 01 00', check: seqCheck }],
    presets: [
      { label: 'Two loops: a cycle and a race', values: { eqs: P10.models.two.eqs, seq: '00 10 11 01 00' } },
      { label: 'C-element: follows when both agree', values: { eqs: P10.models.celem.eqs, seq: '00 01 11 10 00 01' } },
      { label: 'SR latch: set, hold, reset', values: { eqs: P10.models.srnor.eqs, seq: '00 10 00 01 00' } },
      { label: 'Two inputs at once (not allowed)', values: { eqs: P10.models.celem.eqs, seq: '00 11 00' } },
    ],
    counters: [{ id: 'moves', label: 'row changes' }],
    run(inp) {
      const m = P10.model(inp.eqs), an = A().analyse(m), names = an.names;
      const xs = String(inp.seq).trim().split(/[\s,]+/).filter(Boolean);
      const sim = A().simulate(m, xs);
      const start = sim.trace[0];
      const F = new S.Frames(['moves']);
      // the waveform: inputs and variables over steps
      const events = [];
      let t = 0, y = start.y, x = xs[0];
      const ch = {};
      const push = (name, v) => { (ch[name] = ch[name] || []); const c = ch[name]; if (!c.length || c[c.length - 1][1] !== v) c.push([t, v]); };
      const sample = () => { m.inputs.forEach((n, i) => push(n, +x[i])); m.vars.forEach((n, i) => push(n, +y[i])); for (const z of Object.keys(m.outputs)) push(z, +m.Z(x, y)[Object.keys(m.outputs).indexOf(z)]); };
      sample();
      const marks = [];
      sim.steps.forEach((s, k) => {
        t += 4; x = s.x; sample(); events.push({ k, t, type: 'in' });
        s.path.slice(1).forEach((p) => { t += 1.5; y = p; sample(); events.push({ k, t, type: 'move', y: p }); });
        marks.push(t);
      });
      const T1 = t + 3;
      const sigNames = m.inputs.concat(m.vars, Object.keys(m.outputs));
      const tbl = (o) => P10.table(m, an, Object.assign({ x: 0, y: 0, names, outputs: true }, o));
      const t0 = tbl({});
      const wy = t0.box.y + t0.box.h + 50;
      const wave = (now) => K().timing.waves({ x: 0, y: wy, w: Math.max(420, t0.box.w - 60), t0: 0, t1: T1, now, signals: sigNames.map((n) => ({ name: n, changes: ch[n] })), ticks: [], prefix: 'fw', rowH: 20, gap: 10 }).items;
      F.add({ items: tbl({ act: [[start.y, start.x]] }).items.concat(wave(0.5)), say: 'Start with x = ' + start.x + '. The circuit settles in row ' + names[start.y] + ' (' + start.y + '), a stable state.' });
      let at = start.y, ti = 0;
      sim.steps.forEach((s, k) => {
        const tIn = events.find((e) => e.k === k && e.type === 'in').t;
        const two = sim.trace.find((q) => q.kind === 'warning' && q.step === k + 1);
        const stable = s.path.length === 1;
        F.add({ items: tbl({ act: [[at, s.x]], hot: stable ? [] : [[at, s.x]] }).items.concat(wave(tIn + 0.5)), say: (two ? two.say + ' ' : '') + 'x becomes ' + s.x + ': move sideways to column ' + s.x + ' in row ' + names[at] + '. ' + (stable ? 'That entry is circled: stable already, nothing moves.' : 'The entry there is ' + names[an.table[at][s.x]] + ', not ' + names[at] + ': unstable.'), meta: { ask: !stable, end: names[s.to], rows: P10.rowsOf(m).map((r) => names[r]) } });
        s.path.slice(1).forEach((p, j) => {
          F.count('moves');
          ti = events.filter((e) => e.k === k && e.type === 'move')[j].t;
          const last = j === s.path.length - 2;
          F.add({ items: tbl({ act: [[p, s.x]] }).items.concat(wave(ti + 0.5)), say: 'Move down the column to row ' + names[p] + ' (' + p + ').' + (last ? ' Circled: stable. Output ' + m.Z(s.x, p) + '.' + (s.kind === 'critical' ? ' Careful: from row ' + names[s.from] + ' this column is a critical race; the ideal order (every excited variable together) was followed here.' : '') : ' Still unstable: keep going.') });
          at = p;
        });
      });
      F.add({ items: tbl({ act: [[at, xs[xs.length - 1]]] }).items.concat(wave(T1)), say: 'Every input change went sideways, then down to a circled entry, before the next change came. That discipline (one input at a time, and only once stable) is fundamental mode.', mark: 'end' });
      return { frames: P10.big(F.list), def: { sections: [{ id: 'd', kind: 'math', title: 'Fundamental mode', text: ['one input changes at a time', 'only when the circuit is stable', '', 'input change: move sideways', 'unstable: move to the row named', 'circled: stable, wait'].join('\n') }] } };
    },
    predict: [{ at: (f) => f.meta && f.meta.ask, pick: 'option', options: (fr, i) => fr[i].meta.rows, ask: 'Which row will the circuit settle in?', answer: (fr, i) => fr[i].meta.end, explain: (fr, i) => { let j = i + 1; while (fr[j + 1] && !/Circled|stable/.test(fr[j].say)) j++; return fr[j].say; } }],
    quiz: [
      { q: 'In fundamental mode, an input may change…', options: ['at any time', 'only on a clock edge', 'only when the circuit is in a stable state, one input at a time', 'only when the output is 0'], answer: 2, why: 'Otherwise the circuit could be caught between rows and behave unpredictably.' },
      { q: 'An input change moves the present total state…', options: ['down a column', 'sideways to another column in the same row', 'diagonally', 'nowhere'], answer: 1, why: 'The secondary variables have not changed yet, so the row is the same.' },
      { q: 'The circuit moves down a column when…', options: ['the entry it is on is unstable', 'the clock ticks', 'two inputs change', 'the output changes'], answer: 0, why: 'The loops catch up with their excitations, one row at a time.' },
      { q: 'Two inputs changing at once is a problem because…', options: ['the gates overheat', 'which one arrives first decides the column passed through, and so possibly the result', 'it is not a problem', 'it resets the circuit'], answer: 1, why: 'In practice they never change at exactly the same moment.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------
  // Races and cycles, every order of change
  // ---------------------------------------------------------------------------------------------------------
  const raceCheck = (inp) => {
    let m;
    try { m = P10.model(inp.eqs); } catch (e) { return null; }
    if (!new RegExp('^[01]{' + m.inputs.length + '}$').test(inp.x)) return 'Column x: ' + m.inputs.length + ' bit' + (m.inputs.length > 1 ? 's' : '') + ' (' + m.inputs.join('') + ')';
    if (!new RegExp('^[01]{' + m.vars.length + '}$').test(inp.y)) return 'Row y: ' + m.vars.length + ' bit' + (m.vars.length > 1 ? 's' : '') + ' (' + m.vars.join('') + ')';
    if (m.Y(inp.x, inp.y) === inp.y) return 'Total state x = ' + inp.x + ', y = ' + inp.y + ' is stable; pick an unstable one';
    return null;
  };
  /** the orders of change from (x, y): each first move, then every excited variable together */
  function orders(m, x, y, r) {
    const excited = (s) => { const Y = m.Y(x, s), e = []; for (let i = 0; i < s.length; i++) if (Y[i] !== s[i]) e.push(i); return e; };
    const out = [];
    for (const t of r.graph.get(y)) {
      const path = [y, t];
      const flipped = []; for (let i = 0; i < y.length; i++) if (y[i] !== t[i]) flipped.push(m.vars[i]);
      let s = t, loop = false;
      for (let k = 0; k < 12; k++) {
        const e = excited(s);
        if (!e.length) break;
        s = s.split('').map((c, i) => (e.includes(i) ? (c === '0' ? '1' : '0') : c)).join('');
        if (path.includes(s)) { path.push(s); loop = true; break; }
        path.push(s);
      }
      out.push({ path, end: loop ? null : path[path.length - 1], loop, label: flipped.length === 1 ? flipped[0] + ' changes first' : flipped.join(' and ') + ' change together' });
    }
    return out;
  }
  S.topic({
    id: 'async-races', family: 'p10-analysis', order: 40, title: 'Races and cycles: every order of change',
    blurb: 'When two secondary variables must change, nobody knows which gets there first. Play out every order on the cube of codes: if they all end in the same stable state the race is non-critical, if not it is critical. A chain of single changes is a cycle.',
    inputs: [eqInput('two'), { id: 'x', kind: 'text', label: 'Column x', def: '11' }, { id: 'y', kind: 'text', label: 'Row y', def: '00' }],
    check: raceCheck,
    presets: [
      { label: 'A critical race', values: { eqs: P10.models.two.eqs, x: '11', y: '00' } },
      { label: 'A non-critical race', values: { eqs: P10.models.two.eqs, x: '10', y: '01' } },
      { label: 'A cycle', values: { eqs: P10.models.two.eqs, x: '01', y: '10' } },
      { label: 'A longer cycle of three variables', values: { eqs: P10.models.fill.eqs, x: '1', y: '000' } },
      { label: 'No stable state: oscillation', values: { eqs: P10.models.osc.eqs, x: '10', y: '0' } },
    ],
    counters: [{ id: 'orders', label: 'orders tried' }],
    run(inp) {
      const m = P10.model(inp.eqs), an = A().analyse(m), x = inp.x, y = inp.y;
      const r = A().explore(m, x, y), list = orders(m, x, y, r);
      const n = m.vars.length;
      const t = P10.table(m, an, { x: 0, y: 0, hot: [[y, x]] });
      const cx = t.box.x + t.box.w + 70, size = n === 3 ? 120 : 140;
      const outs = new Set(r.outcomes);
      const endCls = {};
      [...outs].forEach((o, i) => { endCls[o] = outs.size > 1 ? (i === 0 ? 'end-a' : 'end-b') : 'stable'; });
      const cube = (arrows, cls, hot) => FL().cube({ x: cx, y: 10, n, size, arrows, cls: Object.assign({}, cls || {}), hot }).items;
      const cubeBox = FL().cube({ x: cx, y: 10, n, size }).box;
      const exc = []; const Y = m.Y(x, y); for (let i = 0; i < n; i++) if (Y[i] !== y[i]) exc.push(m.vars[i]);
      const F = new S.Frames(['orders']);
      const tab = (o) => P10.table(m, an, Object.assign({ x: 0, y: 0 }, o)).items;
      F.add({ items: tab({ hot: [[y, x]] }).concat(cube([], {}, y)), say: 'The circuit is in row ' + y + ' when the input becomes ' + x + '. The entry there is ' + Y + ': ' + nm(P10.work(m, x, y)) + '.', meta: { ask: true, kind: r.kind } });
      F.add({ items: tab({ hot: [[y, x]] }).concat(cube([], {}, y)), say: 'Compare ' + Y + ' with ' + y + ': ' + (exc.length === 1 ? 'only ' + exc[0] + ' is excited (it must change).' : exc.join(' and ') + ' are both excited. Their loops have different delays, so one may change first, or both at once: a race.') + ' On the cube each corner is a code and each edge a single change.' });
      const arrowsOf = (o, cls) => o.path.slice(1).map((s, i) => ({ from: o.path[i], to: s, cls }));
      const done = [];
      list.forEach((o, k) => {
        F.count('orders');
        const cls = 'p' + (k % 3);
        const steps = o.path.slice(1).map((s, i) => o.path[i] + ' → ' + s + (m.Y(x, s) === s ? ' (stable)' : ' (Y = ' + m.Y(x, s) + ')'));
        const marks = {}; if (o.end) marks[o.end] = endCls[o.end] || 'stable';
        const arrows = done.concat(arrowsOf(o, cls)).filter((a, i, all) => all.findIndex((b) => b.from === a.from && b.to === a.to) === i);
        F.add({ items: tab({ hot: [[y, x]], act: o.end ? [[o.end, x]] : [] }).concat(cube(arrows, marks, y)), say: (list.length > 1 ? 'If ' + o.label + ': ' : 'The only order: ') + steps.join(', ') + '. ' + (o.loop ? 'It comes back to a code it has visited: it can keep changing for ever.' : 'It ends in ' + o.end + '.') });
        done.push(...arrowsOf(o, 'done'));
      });
      const marks = {}; for (const o of outs) marks[o] = endCls[o];
      const verdict = { critical: 'A critical race: depending on the order the circuit ends in ' + r.outcomes.join(' or ') + (r.oscillates ? ', or never settles' : '') + '. Its behaviour depends on delays nobody controls, so a design must avoid it: give rows that must follow each other codes that differ in one bit.', noncritical: 'A non-critical race: every order ends in ' + r.outcomes[0] + ', so the race does no harm.', cycle: 'A cycle: the circuit passes through ' + r.ideal.slice(1, -1).join(', ') + ' one change at a time and settles in ' + r.outcomes[0] + '. Designers use cycles on purpose to reach a row that is not adjacent.', oscillation: 'No stable state is reachable in column ' + x + ': the circuit oscillates as long as the input stays there.', none: 'One variable changes and the circuit settles in ' + r.outcomes[0] + '.' }[r.kind];
      F.add({ items: tab({ hot: [[y, x]], act: [...outs].map((o) => [o, x]) }).concat(cube(done.filter((a, i, all) => all.findIndex((b) => b.from === a.from && b.to === a.to) === i), marks, y)), say: verdict, mark: 'end' });
      // on a phone: the table while the entry is read, the cube while the orders play out
      F.list.forEach((f, i) => P10.narrow(f, i === 0 ? t.box : cubeBox));
      return { frames: P10.big(F.list), def: { sections: [{ id: 'd', kind: 'math', title: 'Races', text: ['two or more variables excited: a race', 'every order, same end: non-critical', 'different ends: critical (avoid)', 'single changes in a chain: a cycle', 'no stable entry: oscillation'].join('\n') }] } };
    },
    predict: [{ at: (f) => f.meta && f.meta.ask, pick: 'option', options: ['critical race', 'non-critical race', 'cycle', 'oscillation'], ask: 'Play it out in your head. What will this turn out to be?', answer: (fr, i) => ({ critical: 'critical race', noncritical: 'non-critical race', cycle: 'cycle', oscillation: 'oscillation' }[fr[i].meta.kind] || null), explain: (fr) => fr[fr.length - 1].say }],
    quiz: [
      { q: 'A race occurs when…', options: ['an input changes', 'two or more secondary variables must change in one transition', 'the output glitches', 'a gate is slow'], answer: 1, why: 'Their loops have different delays, so the order of their changes is not known.' },
      { q: 'A race is critical when…', options: ['it is fast', 'different orders of change end in different stable states', 'it passes through a spare row', 'only one variable changes'], answer: 1, why: 'The result then depends on delays nobody controls.' },
      { q: 'A cycle is…', options: ['a critical race', 'a sequence of single-variable changes through unstable rows to a stable one', 'an oscillation', 'a clock'], answer: 1, why: 'It is safe and is used on purpose to reach a row that is not adjacent.' },
      { q: 'How does a designer avoid critical races?', options: ['By adding a clock', 'By assigning codes so that every needed transition changes one variable at a time', 'By making the gates faster', 'By using NOR gates only'], answer: 1, why: 'A race-free assignment, with spare rows or cycles where needed.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------
  // The SR latch analysed
  // ---------------------------------------------------------------------------------------------------------
  S.topic({
    id: 'async-sr', family: 'p10-analysis', order: 50, title: 'Analysing the SR latch',
    blurb: 'Cut the latch\'s loop at Q: one secondary variable, one excitation, a small transition table that says set, reset and hold. Keep both gates as variables instead and the forbidden input turns into a race, which the simulator shows as an oscillation.',
    inputs: [{ id: 'kind', kind: 'choice', label: 'Latch', def: 'nor', options: [{ value: 'nor', label: 'NOR latch (S, R active high)' }, { value: 'nand', label: 'NAND latch (S′, R′ active low)' }] }],
    presets: [{ label: 'NOR latch', values: { kind: 'nor' } }, { label: 'NAND latch', values: { kind: 'nand' } }],
    run(inp) {
      const nand = inp.kind === 'nand';
      const L = A().srLatch(inp.kind), one = L.oneLoop.model, oneA = L.oneLoop.analysis;
      const res = K().schem.layout(nand ? K().timing.build.srNand() : K().timing.build.srNor());
      const U = S.Fsm.util;
      // the excitation simplified: Q⁺ over S, R, Q
      const ones = [];
      for (let mm = 0; mm < 8; mm++) { const e = { S: mm >> 2 & 1, R: mm >> 1 & 1, Q: mm & 1 }; if (S.Netlist.evaluate(one.excitation.Q, e)) ones.push(mm); }
      const simp = U.qm(3, ones, []).cubes;
      const simpText = U.sopText(simp, ['S', 'R', 'Q']);
      const raw = U.text(one.excitation.Q);
      const sch = (hot) => K().schem.item('circ', res, { x: 0, y: 0, hot: hot || [] });
      const ty = res.bounds.h + 40;
      const names = { S: nand ? 'S′' : 'S', R: nand ? 'R′' : 'R' };
      const tbl = (o) => P10.table(one, oneA, Object.assign({ x: 0, y: ty + 70 }, o));
      const eqs = (lines) => P10.lines('eq', 0, ty, lines);
      const F = new S.Frames();
      F.add({ items: [sch()], say: 'The ' + (nand ? 'NAND' : 'NOR') + ' latch: two gates, each feeding the other' + (nand ? '; its inputs S′ and R′ are active low, and are written S and R in the equations below.' : '.') + ' One loop, so one cut does it.' });
      F.add({ items: [sch(['g1'])].concat(eqs([{ text: 'cut at Q: y = Q', cls: 'hot' }])), say: 'Cut the loop at Q (the output of gate g1). The secondary variable is Q itself; its excitation Q⁺ is what g1 would drive Q to.', meta: { eq: true, simp: nm(simpText) } });
      F.add({ items: [sch(['g1', 'g2'])].concat(eqs(['Q⁺ = ' + nm(raw), { text: '   = ' + nm(simpText), cls: 'hot' }])), say: 'Reading back through both gates: Q⁺ = ' + nm(raw) + ', which simplifies to Q⁺ = ' + nm(simpText) + '.', });
      F.add({ items: [sch()].concat(eqs(['Q⁺ = ' + nm(simpText)]), tbl({}).items), say: 'Its transition table, one row for Q and a column for each S R. Circled entries are stable: ' + oneA.stable.map((s) => 'Q = ' + s.y + ' with SR = ' + s.x).join(', ') + '.' });
      const hold = nand ? '11' : '00', set = nand ? '01' : '10', reset = nand ? '10' : '01', both = nand ? '00' : '11';
      F.add({ items: [sch()].concat(eqs(['Q⁺ = ' + nm(simpText)]), tbl({ hot: [['0', hold], ['1', hold]] }).items), say: 'Column ' + hold + ' (' + names.S + ' = ' + hold[0] + ', ' + names.R + ' = ' + hold[1] + '): both rows are stable, so the latch holds whichever value it has. That is its memory.' });
      F.add({ items: [sch()].concat(eqs(['Q⁺ = ' + nm(simpText)]), tbl({ hot: [['0', set], ['1', reset]] }).items), say: 'Column ' + set + ' sends row 0 to 1 (set) and column ' + reset + ' sends row 1 to 0 (reset): each a single change of Q, no race.' });
      F.add({ items: [sch()].concat(eqs(['Q⁺ = ' + nm(simpText)]), tbl({ hot: [['0', both], ['1', both]] }).items), say: 'Column ' + both + ' looks harmless here: Q settles at ' + oneA.table['0'][both] + '. But this model has hidden Q′: in that column both gate outputs are ' + (nand ? '1' : '0') + ', so Q′ is not the complement of Q. To see the trouble, keep both gate outputs as variables.' });
      // both gates as variables
      const two = L.twoGates.model, race = L.race;
      const cubeItems = (arrows, cls) => FL().cube({ x: 0, y: ty + 60, n: 2, size: 130, arrows, cls, names: { '00': '00', '01': '01', '10': '10', '11': '11' } }).items;
      const lines2 = eqs(two.text().map(nm).concat(['(Q, P) with P = Q′ when all is well']));
      const from = nand ? '11' : '00', rest = nand ? '11' : '00';
      const arr = [...race.graph.get(from)].map((t2, i) => ({ from, to: t2, cls: 'p' + i }));
      F.add({ items: [sch()].concat(lines2, cubeItems([], { [from]: 'hot' })), say: 'Now Q and P (the other gate) are both variables. With ' + names.S + names.R + ' = ' + both + ' the latch sits at QP = ' + from + '. Then both inputs return to ' + rest + ' at the same moment.' });
      F.add({ items: [sch()].concat(lines2, cubeItems(arr, { [from]: 'hot', '01': 'end-a', '10': 'end-b' })), say: 'In column ' + rest + ' both Q and P are excited: ' + race.say.replace(/^From [^(]*\([^)]*\) /, '') + (race.oscillates ? ' If both gates are equally fast, they change together to ' + (from === '00' ? '11' : '00') + ', then back, and so on.' : ''), meta: { preSim: true } });
      // the simulator: equal gates, released together
      const TM = K().timing;
      const c2 = nand ? TM.build.srNand({ d1: 9, d2: 9 }) : TM.build.srNor({ d1: 9, d2: 9 });
      const sN = nand ? "S'" : 'S', rN = nand ? "R'" : 'R', act = nand ? 0 : 1, idle = 1 - act;
      const R = TM.run(c2, { deposit: { Q: 0, "Q'": 1 }, stim: [[0, sN, idle], [0, rN, idle], [20, sN, act], [20, rN, act], [70, sN, idle], [70, rN, idle]], until: 160 });
      const flips = R.changesIn('Q', 70, 160).length, flipsP = R.changesIn("Q'", 70, 160);
      const together = flipsP.length === flips && R.changesIn('Q', 70, 160).every((q, i) => q[0] === flipsP[i][0]);
      const wv = TM.waves({ x: 0, y: ty + 60, w: 480, t0: 0, t1: 160, signals: TM.signals(R, [sN, rN, 'Q', "Q'"].map((q) => ({ name: q, label: nm(q) }))), ticks: 4, prefix: 'sw' });
      F.add({ items: [sch()].concat(eqs([{ text: 'simulated, both gates 9 ns', cls: 'hot' }]), wv.items), say: 'The simulator, both gates 9 ns, inputs released together at 70 ns: Q and Q′ ' + (together ? 'switch together' : 'switch') + ' ' + flips + ' times in 90 ns' + (together ? ', once every 9 ns' : '') + '. The analysis predicted it: a critical race that, with equal delays, never ends. That is why ' + names.S + ' = ' + names.R + ' = ' + act + ' is the forbidden input.', mark: 'end' });
      return { frames: P10.big(F.list), def: { sections: [{ id: 'd', kind: 'math', title: 'The ' + (nand ? 'NAND' : 'NOR') + ' latch', text: ['Q⁺ = ' + nm(simpText), '', 'hold: ' + hold + ', set: ' + set + ', reset: ' + reset, 'forbidden: ' + both + ', then ' + rest + ' together', '→ a race between Q and Q′'].join('\n') }] } };
    },
    predict: [{ at: (f) => f.meta && f.meta.eq, pick: 'option', options: (fr, i) => [fr[i].meta.simp, nm("S'R + RQ'"), nm("SR + Q'"), 'S + R + Q'], ask: 'Read back through both gates. Which is Q⁺ in its simplest form?', answer: (fr, i) => fr[i].meta.simp, explain: (fr, i) => fr[i + 1].say }, { at: (f) => f.meta && f.meta.preSim, pick: 'option', options: ['Q settles at 0', 'Q settles at 1', 'Q and Q′ keep changing together'], ask: 'Equal gates, both inputs released together. What does the simulator show?', answer: 'Q and Q′ keep changing together', explain: (fr, i) => fr[i + 1].say }],
    quiz: [
      { q: 'The excitation of a NOR latch with the loop cut at Q is…', options: ["Q⁺ = SR′ + R′Q", "Q⁺ = SR′", "Q⁺ = S ⊕ R", "Q⁺ = R + S′Q"], answer: 0, why: 'S sets, R resets, and with both 0 Q holds; it is often written S + R′Q, which differs only on the forbidden S = R = 1.' },
      { q: 'In the transition table of a NOR latch, the column SR = 00…', options: ['has no stable entry', 'has both rows stable: the latch holds', 'always gives Q = 1', 'is forbidden'], answer: 1, why: 'Q⁺ = Q there.' },
      { q: 'Why does the one-variable model hide the trouble with S = R = 1?', options: ['It has no outputs', 'It does not track Q′ separately, so it cannot show both outputs at 0 or their race', 'It is wrong', 'It uses NAND gates'], answer: 1, why: 'With Q and Q′ as two variables, releasing S = R = 1 together excites both: a race.' },
      { q: 'Releasing S = R = 1 together on a NOR latch with equal gate delays gives…', options: ['Q = 1', 'Q = 0', 'an oscillation', 'a hold'], answer: 2, why: 'Both gates change together, back and forth.' },
    ],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
