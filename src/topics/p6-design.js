// Part 6, design: state assignment (binary, Gray, one-hot and an adjacency heuristic, with the cost of each),
// the excitation tables of the D, JK, T and SR flip-flops worked out from their characteristic tables, the whole
// design flow from a word problem to a simulated circuit, and what the finished circuit does with the codes no
// state was given (self-correction or lockout).
(function (S) {
  'use strict';
  const K = S.Kit, P6 = S.P6, TM = K.timing, Geo = S.geom;
  const F = () => S.Fsm;
  const pr = P6.pr;
  const ffInput = { id: 'ff', kind: 'choice', label: 'Flip-flops', def: 'D', options: [{ value: 'D', label: 'D' }, { value: 'JK', label: 'JK' }, { value: 'T', label: 'T' }] };
  const asgInput = { id: 'asg', kind: 'choice', label: 'State assignment', def: 'binary', options: [{ value: 'binary', label: 'Binary' }, { value: 'gray', label: 'Gray' }, { value: 'heuristic', label: 'Adjacency rules' }, { value: 'onehot', label: 'One-hot (D only)' }] };
  const KIND = { binary: 'binary', gray: 'Gray', heuristic: 'adjacency rules', onehot: 'one-hot', custom: 'custom' };
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  /** a design's cost in words: flip-flops, AND gates, gate inputs, literals */
  const costSay = (c) => [plural(c.flipflops, 'flip-flop', 'flip-flops'), plural(c.terms, 'AND gate', 'AND gates'), plural(c.gateInputs, 'gate input', 'gate inputs'), plural(c.literals, 'literal', 'literals')].join(', ');
  /** codes in a list: "the code 11 is" or "the codes 100, 101 are" */
  const codesAre = (cs, verb) => (cs.length === 1 ? 'the code ' + cs[0] + ' ' + verb[0] : 'the codes ' + cs.join(', ') + ' ' + verb[1]);

  S.family({ id: 'p6-assign', part: 'machines', order: 30, title: 'State assignment', blurb: 'Which code each state gets changes the logic a lot. Compare binary, Gray, one-hot and codes chosen by adjacency rules.' });
  S.family({ id: 'p6-design', part: 'machines', order: 40, title: 'Designing a machine', blurb: 'From a word problem to a working circuit: excitation tables, the K-map of every flip-flop input, the circuit, its simulation, and what happens in the unused states.' });

  /** the minterms a cube covers, for K-map groups that match the equation exactly */
  const cellsOf = (cube) => { const n = cube.length, out = []; for (let m = 0; m < 1 << n; m++) if (F().util.covers(cube, m, n)) out.push(m); return out; };
  /** a K-map of one design function with its chosen groups */
  function kmapOf(f, x, y, prefix, opts) {
    const fn = { vars: f.vars.slice(), ones: new Set(f.ones), dc: new Set(f.dc) };
    const groups = (opts && opts.noGroups) ? [] : f.min.cubes.map((c, k) => ({ cells: cellsOf(c), tone: k % 6, key: 'g' + k }));
    return K.km.draw({ fn, prefix, x, y, cell: f.vars.length <= 3 ? 52 : 46, groups, title: f.name });
  }
  /** the diagram with each state's code under it */
  const coded = (m, codes, opts) => P6.diagram(m, Object.assign({ sub: codes }, opts || {}));

  // ---------------------------------------------------------------------------------------------------
  // State assignment compared
  // ---------------------------------------------------------------------------------------------------
  const asgKeys = ['det1011', 'seven', 'six', 'count3', 'edge', 'mod5'];
  S.topic({
    id: 'state-assignment', family: 'p6-assign', order: 10, title: 'State assignment: binary, Gray, one-hot',
    blurb: 'The same machine with four different sets of codes. Binary counts the states in order, Gray makes neighbours in the list differ in one bit, one-hot gives each state its own flip-flop, and the adjacency rules give related states codes one bit apart. Count the gates each one costs.',
    inputs: [P6.choice(asgKeys, 'det1011'), ffInput],
    presets: [
      { label: '1011 detector, D', values: { m: 'det1011', ff: 'D' } },
      { label: '1011 detector, JK', values: { m: 'det1011', ff: 'JK' } },
      { label: 'Seven states (reduced first), D', values: { m: 'seven', ff: 'D' } },
      { label: 'Mod-5 counter, T', values: { m: 'mod5', ff: 'T' } },
      { label: 'Rising edges, D', values: { m: 'edge', ff: 'D' } },
    ],
    counters: [{ id: 'ff', label: 'flip-flops' }, { id: 'gi', label: 'gate inputs' }],
    camera: 'follow',
    run(inp) {
      const m0 = P6.machine(inp.m), red = F().reduce(m0), m = red.machine;
      const cmp = F().compareAssignments(m0, { ff: inp.ff });
      const heur = F().assign(m, 'heuristic');
      const pos = P6.layout(m);
      const Fr = new S.Frames(['ff', 'gi']);
      const nb = F().util.log2(m.states.length);
      const d0 = P6.diagram(m, { prefix: 'fsm', pos });
      const t0 = P6.table(m, { x: d0.box.x + d0.box.w + 70, y: d0.box.y + 20 });
      Fr.add({ items: d0.items.concat(t0.items), say: (m.states.length < m0.states.length ? 'Reduced first to ' + m.states.length + ' states. ' : '') + m.states.length + ' states need at least ' + nb + ' flip-flops (2^' + nb + ' = ' + (1 << nb) + ' codes' + ((1 << nb) > m.states.length ? ', ' + ((1 << nb) - m.states.length) + ' left unused' : '') + '); one-hot uses ' + m.states.length + '. Each assignment below is designed in full with ' + inp.ff + ' flip-flops and costed.', meta: { askFF: true, n: m.states.length } });
      // the adjacency rules
      const rules = heur.trace.filter((t) => t.kind === 'rule').sort((a, b) => b.weight - a.weight).slice(0, 6);
      const lines = rules.map((r) => ({ key: r.pair.join('-'), text: r.pair.join(' – ') + '  (weight ' + r.weight + ')' }));
      if (lines.length) {
        const e = P6.eqs(lines, d0.box.x + d0.box.w + 70, d0.box.y + 20, { prefix: 'ru', title: 'wished-for neighbours' });
        Fr.add({ items: d0.items.concat(e.items), say: 'The adjacency rules: states that go to the same next state, the next states of one state, and states with the same output should get codes one bit apart, so that their 1s sit together on the K-maps. ' + rules.slice(0, 3).map((r) => r.say).join(' ') });
      }
      for (const res of cmp.results) {
        if (res.error) continue;
        const d = coded(m, res.codes, { prefix: 'fsm', pos });
        const e = P6.eqs(res.equations.map((t, i) => ({ key: 'e' + i, text: t })), d.box.x + d.box.w + 70, d.box.y + 20, { prefix: 'eq', title: KIND[res.kind] + ' codes' });
        Fr.set('ff', res.cost.flipflops); Fr.set('gi', res.cost.gateInputs);
        Fr.add({ items: d.items.concat(e.items), say: KIND[res.kind][0].toUpperCase() + KIND[res.kind].slice(1) + ': ' + m.states.map((s) => s + ' = ' + res.codes[s]).join(', ') + '. The equations cost ' + costSay(res.cost) + '.' + (res.kind === 'onehot' ? ' Each equation reads straight off the diagram: the arrows into a state.' : ''), meta: { kind: res.kind } });
      }
      // the comparison
      const ok = cmp.results.filter((r) => r.cost);
      const maxGi = Math.max(...ok.map((r) => r.cost.gateInputs));
      const items = [];
      ok.forEach((r, i) => {
        const y = 40 + i * 54, w = Math.max(30, (r.cost.gateInputs / maxGi) * 360);
        items.push({ key: 'bl:' + r.kind, kind: 'text', x: 0, y: y + 22, text: KIND[r.kind], cls: 'strong', size: 15 });
        items.push({ key: 'bar:' + r.kind, kind: 'cell', x: 150, y, w, h: 34, rx: 4, text: String(r.cost.gateInputs), cls: 'bar' + (r.kind === cmp.best ? ' best' : ''), size: 14 });
        items.push({ key: 'bf:' + r.kind, kind: 'text', x: 150 + w + 14, y: y + 22, text: r.cost.flipflops + ' FF, ' + r.cost.terms + ' AND', cls: 'note', size: 13 });
      });
      items.push({ key: 'bt', kind: 'text', x: 0, y: 14, text: 'gate inputs (' + inp.ff + ' flip-flops)', cls: 'title' });
      Fr.add({ items, say: 'Side by side: ' + ok.map((r) => KIND[r.kind] + ': ' + costSay(r.cost)).join('; ') + '. Fewest gate inputs here: ' + KIND[cmp.best] + '. One-hot spends flip-flops to save logic; which code wins depends on the machine.', meta: { best: KIND[cmp.best] } });
      const def = { sections: [{ id: 'd', kind: 'math', title: 'Assignments', text: ['binary:  S0 = 00, S1 = 01, S2 = 10 …', 'Gray:    S0 = 00, S1 = 01, S2 = 11 …', 'one-hot: one flip-flop per state', 'adjacency rules: related states', '  get codes one bit apart'].join('\n') }] };
      return { frames: P6.views(Fr.list), def };
    },
    predict: [
      { at: (f) => f.meta && f.meta.askFF, pick: 'option', options: ['2', '3', '4', '5', '6', '7'], ask: 'How many flip-flops does the one-hot assignment use?', answer: (fr, i) => String(fr[i].meta.n), explain: (fr, i) => fr[i].say, once: true },
      { at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.best, pick: 'option', options: ['binary', 'Gray', 'adjacency rules', 'one-hot'], ask: 'Which assignment needs the fewest gate inputs here?', answer: (fr, i) => fr[i + 1].meta.best, explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'A machine with 6 states needs how many flip-flops with binary codes, and how many one-hot?', options: ['3 and 6', '6 and 3', '3 and 3', '2 and 6'], answer: 0, why: '2³ = 8 ≥ 6 codes; one-hot uses one per state.' },
      { q: 'The adjacency rules try to give codes one bit apart to…', options: ['states with the same next state, and the next states of one state', 'states with different outputs', 'the start state only', 'unused codes'], answer: 0, why: 'Their entries then fall into neighbouring K-map cells and group together.' },
      { q: 'One-hot assignment usually…', options: ['uses the fewest flip-flops', 'uses more flip-flops but simple next-state logic', 'needs no logic at all', 'cannot be used with D flip-flops'], answer: 1, why: 'Each next-state equation just collects the arrows into its state.' },
      { q: 'In a one-hot machine, how many flip-flops are 1 in a valid state?', options: ['none', 'exactly one', 'half of them', 'all'], answer: 1, why: 'That is what one-hot means.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Excitation tables
  // ---------------------------------------------------------------------------------------------------
  const CHAR = {
    D: { ins: ['D'], rows: [['0', '0', '0'], ['0', '1', '0'], ['1', '0', '1'], ['1', '1', '1']] },
    T: { ins: ['T'], rows: [['0', '0', '0'], ['0', '1', '1'], ['1', '0', '1'], ['1', '1', '0']] },
    JK: { ins: ['J', 'K'], rows: [['0', '0', '0', '0'], ['0', '0', '1', '1'], ['0', '1', '0', '0'], ['0', '1', '1', '0'], ['1', '0', '0', '1'], ['1', '0', '1', '1'], ['1', '1', '0', '1'], ['1', '1', '1', '0']] },
    SR: { ins: ['S', 'R'], rows: [['0', '0', '0', '0'], ['0', '0', '1', '1'], ['0', '1', '0', '0'], ['0', '1', '1', '0'], ['1', '0', '0', '1'], ['1', '0', '1', '1'], ['1', '1', '0', '?'], ['1', '1', '1', '?']] },
  };
  const OPTS = { D: ['0', '1'], T: ['0', '1'], JK: ['0, X', '1, X', 'X, 1', 'X, 0', '1, 1'], SR: ['0, X', '1, 0', '0, 1', 'X, 0', '1, 1'] };
  S.topic({
    id: 'excitation-tables', family: 'p6-design', order: 10, title: 'Excitation tables',
    blurb: 'A characteristic table says what a flip-flop does with given inputs. Design needs the reverse: for a wanted change of Q, which inputs cause it? Read the rows that make each change; an input that can be either is a don\'t care.',
    inputs: [{ id: 'ff', kind: 'choice', label: 'Flip-flop', def: 'JK', options: [{ value: 'D', label: 'D' }, { value: 'JK', label: 'JK' }, { value: 'T', label: 'T' }, { value: 'SR', label: 'SR' }] }],
    presets: ['JK', 'D', 'T', 'SR'].map((f) => ({ label: f + ' flip-flop', values: { ff: f } })),
    counters: [{ id: 'rows', label: 'excitation rows' }, { id: 'dc', label: "don't cares" }],
    run(inp) {
      const ff = inp.ff, C = CHAR[ff], E = F().EXCITATION[ff];
      const Fr = new S.Frames(['rows', 'dc']);
      const order = ['00', '01', '10', '11'];
      const done = [];
      const draw = (o) => {
        o = o || {};
        const ct = K.table.draw({ x: 0, y: 30, prefix: 'ct', rows: C.rows.map((r) => r.slice()), colHead: C.ins.concat(['Q', 'Q(t+1)']), size: 16, mono: true, title: 'characteristic table', cls: (r) => [o.hit && o.hit.includes(r) ? 'src-a' : '', C.rows[r][C.rows[r].length - 1] === '?' ? 'bad' : ''].filter(Boolean).join(' ') });
        const rows = order.map((k) => (done.includes(k) ? [k[0], k[1]].concat(E.rows[k]) : [k[0], k[1]].concat(E.inputs.map(() => ''))));
        const et = K.table.draw({ x: ct.box.x + ct.box.w + 80, y: 30, prefix: 'et', rows, colHead: ['Q', 'Q(t+1)'].concat(E.inputs), size: 16, mono: true, title: 'excitation table', act: o.cur !== undefined ? rows[0].map((_, c) => [o.cur, c]) : [], cls: (r, c) => (c >= 2 && rows[r][c] === 'X' ? 'xcell' : '') });
        return ct.items.concat(et.items);
      };
      Fr.add({ items: draw(), say: 'The characteristic table of the ' + ff + ' flip-flop: for each input and present Q, the next Q. ' + F().CHARACTERISTIC[ff] + '. Now turn it round: for each change of Q, which inputs make it happen?' });
      order.forEach((k, idx) => {
        const hit = C.rows.map((r, i) => (r[r.length - 2] === k[0] && r[r.length - 1] === k[1] ? i : -1)).filter((i) => i >= 0);
        const ans = E.rows[k];
        Fr.add({ items: draw({ hit, cur: idx }), say: 'Q must go from ' + k[0] + ' to ' + k[1] + '. The rows that do this (lit): ' + hit.map((i) => C.ins.map((n, j) => n + ' = ' + C.rows[i][j]).join(', ')).join('; or ') + '.', meta: { ask: true, ans: ans.join(', ') } });
        done.push(k);
        Fr.count('rows'); Fr.count('dc', ans.filter((v) => v === 'X').length);
        const xs = ans.map((v, j) => (v === 'X' ? E.inputs[j] : null)).filter(Boolean);
        Fr.add({ items: draw({ hit, cur: idx }), say: 'So ' + E.inputs.map((n, j) => n + ' = ' + ans[j]).join(', ') + '. ' + (xs.length ? xs.join(' and ') + ' can be 0 or 1 (a don\'t care, X): both rows work.' : 'There is only one way.') });
      });
      Fr.add({ items: draw(), say: 'The excitation table of the ' + ff + ' flip-flop. ' + (ff === 'JK' ? 'Half its entries are X, which is why JK designs often have the simplest logic.' : ff === 'D' ? 'D is simply the next state: D = Q(t+1).' : ff === 'T' ? 'T is 1 exactly when Q must change: T = Q ⊕ Q(t+1).' : 'S = R = 1 never appears: it is not allowed.') + ' In a design, each flip-flop input gets a column filled from this table, one row of the state table at a time.' });
      const def = { sections: [{ id: 'd', kind: 'math', title: ff + ' flip-flop', text: [F().CHARACTERISTIC[ff], '', 'excitation: for each change', 'Q → Q(t+1), the inputs that', 'cause it; X where either works'].join('\n') }] };
      return { frames: P6.views(Fr.list), def };
    },
    predict: [
      { at: (f) => f.meta && f.meta.ask, pick: 'option', options: (fr, i, inp) => OPTS[inp.ff], ask: (fr, i, inp) => 'Which ' + F().EXCITATION[inp.ff].inputs.join(', ') + ' make this change? (X = either)', answer: (fr, i) => fr[i].meta.ans, explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'For a JK flip-flop to go from 0 to 1, J and K must be…', options: ['J = 1, K = X', 'J = 1, K = 0', 'J = X, K = 1', 'J = 0, K = X'], answer: 0, why: 'J = 1, K = 0 sets and J = K = 1 toggles; both give 1, so K is a don\'t care.' },
      { q: 'For a T flip-flop, T must be 1 when…', options: ['Q stays 1', 'Q changes', 'Q stays 0', 'never'], answer: 1, why: 'T = 1 toggles.' },
      { q: 'For a D flip-flop, D equals…', options: ['Q', 'Q(t+1)', "Q'", 'always 1'], answer: 1, why: 'A D flip-flop takes D on the edge.' },
      { q: 'Why do JK excitation tables have so many don\'t cares?', options: ['J and K are unused', 'Each change can be made by two different input pairs', 'JK flip-flops are random', 'They do not; D has more'], answer: 1, why: 'For example 1 → 0 happens with J = 0, K = 1 (reset) or J = 1, K = 1 (toggle).' },
      { q: 'An SR flip-flop holding 1 (1 → 1) needs…', options: ['S = X, R = 0', 'S = 1, R = 1', 'S = 0, R = 1', 'S = 0, R = X'], answer: 0, why: 'Hold (S = R = 0) or set (S = 1, R = 0) both keep 1, as long as R = 0.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // The whole design flow
  // ---------------------------------------------------------------------------------------------------
  const PROBLEMS = {
    equal: {
      label: 'Two equal bits in a row (Mealy, with spare states)', seq: '0011011100',
      text: 'One bit arrives on X with each clock. Make Z = 1 on any bit that equals the bit before it (Z responds during that clock). A first attempt uses a state for every situation it can think of.',
      machine: () => F().parse('mealy\ninputs X\noutputs Z\nstart A\nA: 0 -> B/0, 1 -> C/0\nB: 0 -> D/1, 1 -> C/0\nC: 0 -> B/0, 1 -> E/1\nD: 0 -> D/1, 1 -> C/0\nE: 0 -> B/0, 1 -> E/1'),
      meaning: { A: 'nothing read yet', B: 'the last bit was 0', C: 'the last bit was 1', D: 'the last two bits were 00', E: 'the last two bits were 11' },
    },
    det1101: {
      label: 'Detect 1101, overlapping (Mealy)', seq: '1101101011',
      text: 'X brings one bit per clock. Z = 1 on the bit that completes the pattern 1101; the last 1 of one match may start the next.',
      machine: () => F().detector('1101').machine,
      meaning: { S0: 'no useful bits yet', S1: 'seen 1', S2: 'seen 11', S3: 'seen 110' },
    },
    count3: {
      label: 'Counter modulo 3 with enable (Moore)', seq: '1101111',
      text: 'With E = 1 the machine counts 0, 1, 2, 0, … one step per clock; with E = 0 it holds. Z = 1 while the count is 2.',
      machine: () => P6.machine('count3'),
      meaning: { C0: 'count 0', C1: 'count 1', C2: 'count 2' },
    },
    edge: {
      label: 'Rising-edge watcher (Moore)', seq: '0110111001',
      text: 'Z = 1 for exactly one clock after X has gone from 0 to 1 (a Moore output, so it changes only on clock edges).',
      machine: () => P6.machine('edge'),
      meaning: { LOW: 'X was 0', RISE: 'X just went from 0 to 1', HIGH: 'X has stayed 1' },
    },
    vend: {
      label: 'Vending controller, price 15 (Mealy, two inputs)', seq: '10 00 01 10 01 00',
      text: 'Coins arrive one per clock at most: N = 1 for 5 cents, D = 1 for 10 cents (never both). At 15 cents or more raise V to vend; with 20 cents also raise C to give 5 back. Then start again.',
      machine: () => P6.machine('vend'),
      meaning: { S0: '0 cents so far', S5: '5 cents so far', S10: '10 cents so far' },
    },
  };
  const wrap = (text, n) => { const out = []; let line = ''; for (const w of String(text).split(' ')) { if ((line + ' ' + w).trim().length > n) { out.push(line.trim()); line = w; } else line += ' ' + w; } if (line.trim()) out.push(line.trim()); return out; };
  /** a card of text: a left-aligned cell */
  const card = (key, x, y, lines, cls) => ({ key, kind: 'cell', x, y, w: Math.max(...lines.map((l) => Geo.textWidth(l, 15))) + 26, h: lines.length * 22 + 20, rx: 10, lines, align: 'left', cls: 'word ' + (cls || ''), size: 15 });

  S.topic({
    id: 'design-flow', family: 'p6-design', order: 20, title: 'The design flow, start to finish',
    blurb: 'A word problem becomes a working circuit in nine steps: the state diagram, the state table, reduction, a state assignment, the excitation table, a K-map for every flip-flop input, the equations, the circuit, and a simulation that checks it against the table.',
    inputs: [
      { id: 'p', kind: 'choice', label: 'Problem', def: 'equal', options: Object.keys(PROBLEMS).map((k) => ({ value: k, label: PROBLEMS[k].label })) },
      ffInput, asgInput,
    ],
    check: (inp) => (inp.asg === 'onehot' && inp.ff !== 'D' ? 'One-hot designs here use D flip-flops: choose D, or another assignment' : null),
    presets: [
      { label: 'Equal bits, D, binary', values: { p: 'equal', ff: 'D', asg: 'binary' } },
      { label: 'Detect 1101, JK, binary', values: { p: 'det1101', ff: 'JK', asg: 'binary' } },
      { label: 'Counter, T, Gray', values: { p: 'count3', ff: 'T', asg: 'gray' } },
      { label: 'Rising edges, D, one-hot', values: { p: 'edge', ff: 'D', asg: 'onehot' } },
      { label: 'Vending, D, adjacency rules', values: { p: 'vend', ff: 'D', asg: 'heuristic' } },
    ],
    counters: [{ id: 'step', label: 'step of 9' }, { id: 'eqs', label: 'equations' }],
    camera: 'follow',
    run(inp) {
      const P = PROBLEMS[inp.p], m0 = P.machine();
      // a RESET input presets the flip-flops to the start state's code
      const d = F().design(m0, { ff: inp.ff, assign: inp.asg, reset: true });
      const needReset = true;
      const m = d.machine, syms = F().symbols(m0), mealy = m0.type === 'mealy';
      const Fr = new S.Frames(['step', 'eqs']);
      const step = (n) => Fr.set('step', n);
      // 1. the problem
      step(1);
      const cardLines = wrap(P.text, 58);
      Fr.add({ items: [card('card', 0, 0, cardLines), { key: 'cardT', kind: 'text', x: 0, y: -14, text: 'the problem', cls: 'title' }], say: 'Step 1: the problem. Inputs ' + m0.inputs.join(', ') + ', outputs ' + m0.outputs.join(', ') + '; ' + (mealy ? 'the outputs may respond to the inputs at once, so a Mealy machine fits.' : 'the outputs change only with the state, so a Moore machine.') });
      // 2. the diagram, a state at a time
      const full = K.fsm.machine(m0), pos0 = P6.layout(m0);
      const meaningList = (k) => P6.eqs(m0.states.slice(0, k).map((s) => ({ key: s, text: s + ': ' + P.meaning[s] })), 0, 0, { prefix: 'mn', title: 'what each state means' });
      for (let k = 1; k <= m0.states.length; k++) {
        const have = new Set(m0.states.slice(0, k));
        const part = { states: m0.states.slice(0, k), start: m0.start, trans: full.trans.filter((t) => have.has(t.from) && have.has(t.to)), labelOf: full.labelOf };
        const dd = K.fsm.draw(part, { prefix: 'fsm', pos: pos0, hot: [m0.states[k - 1]] });
        const ml = meaningList(k);
        const shift = dd.box ? dd.box.x + dd.box.w + 70 : 300;
        const ml2 = P6.eqs(m0.states.slice(0, k).map((s) => ({ key: s, text: s + ': ' + P.meaning[s] })), shift, (dd.box ? dd.box.y : 0) + 20, { prefix: 'mn', title: 'what each state means' });
        void ml;
        const s = m0.states[k - 1];
        const outs = syms.map((x) => (m0.next[s][x] == null ? null : P6.inText(m0, x) + ' → ' + m0.next[s][x] + (mealy ? ' (' + P6.outText(m0, m0.out[s][x]) + ')' : ''))).filter(Boolean);
        const back = syms.find((x) => have.has(m0.next[s][x]) && m0.next[s][x] !== s);
        Fr.add({ items: dd.items.concat(ml2.items), say: 'Step 2: the state diagram. ' + s + ' means "' + P.meaning[s] + '"' + (m0.type === 'moore' ? ', and outputs ' + m0.out[s] : '') + '. From it: ' + outs.join('; ') + '. Arrows to states not drawn yet appear when those states do.', meta: back && k > 1 ? { ask: true, s, x: back, next: m0.next[s][back] } : null });
      }
      // 3. the table
      step(3);
      const dAll = P6.diagram(m0, { prefix: 'fsm', pos: pos0 });
      const tAll = P6.table(m0, { x: dAll.box.x + dAll.box.w + 70, y: dAll.box.y + 20 });
      Fr.add({ items: dAll.items.concat(tAll.items), say: 'Step 3: the state table, the same information as the diagram in rows: ' + m0.states.length + ' states × ' + syms.length + ' input' + (syms.length > 1 ? ' values' : ' value') + '.' });
      // 4. reduction
      step(4);
      const rs = d.stages.reduced;
      if (m.states.length < m0.states.length) {
        const cls = Object.fromEntries(rs.classes.flatMap((c, i) => (c.length > 1 ? c.map((s) => [s, 'cl' + (i % 4)]) : [])));
        const dc = P6.diagram(m0, { prefix: 'fsm', pos: pos0, cls });
        Fr.add({ items: dc.items.concat(tAll.items), say: 'Step 4: reduction. The implication table leaves ' + F().showClasses(rs.classes.filter((c) => c.length > 1)) + ': states in one class give the same outputs for every input sequence.', meta: { askRed: true, n: m.states.length } });
      }
      const pos = P6.layout(m);
      const dR = P6.diagram(m, { prefix: 'fsm', pos });
      const tR = P6.table(m, { x: dR.box.x + dR.box.w + 70, y: dR.box.y + 20 });
      Fr.add({ items: dR.items.concat(tR.items), say: m.states.length < m0.states.length ? rs.say + ' ' + m.states.length + ' states to build.' : 'Step 4: reduction. The implication table crosses out every pair, so no two states are equivalent: all ' + m.states.length + ' stay.' });
      // 5. assignment
      step(5);
      const dA = coded(m, d.codes, { prefix: 'fsm', pos });
      const tA = P6.table(m, { x: dA.box.x + dA.box.w + 70, y: dA.box.y + 20, codes: d.codes });
      Fr.add({ items: dA.items.concat(tA.items), say: 'Step 5: assign codes (' + KIND[d.assignment.kind] + '): ' + m.states.map((s) => s + ' = ' + d.codes[s]).join(', ') + '. That takes ' + d.vars.length + ' flip-flops, ' + d.vars.join(', ') + '.' + (d.unused.length ? ' ' + codesAre(d.unused, ['is', 'are']).replace(/^t/, 'T') + ' unused: ' + (d.unused.length === 1 ? 'its' : 'their') + ' entries will be don\'t cares.' : '') });
      // 6. the excitation table
      step(6);
      const ffNames = d.stages.excitation.inputs, vn = d.vars, inN = m.inputs;
      const shown = new Set();
      const excTable = (o) => {
        o = o || {};
        const head = ['present', inN.length ? inN.join('') : '', 'next'].concat(ffNames, m.outputs);
        const rows = d.rows.map((r) => [r.code, r.input, r.nextCode == null ? '–' : r.nextCode].concat(ffNames.map((n) => (shown.has(n) ? r.exc[n] : '')), r.out == null ? m.outputs.map(() => '–') : r.out.split('')));
        const hi = o.row === undefined ? [] : head.map((_, c) => [o.row, c]);
        return K.table.draw({ x: 0, y: 30, prefix: 'xt', rows, colHead: head.map((h) => h || ' '), size: 14, mono: true, minW: 40, minH: 34, act: hi, maxRows: 16, title: 'transition and excitation table (' + vn.join(', ') + ')', cls: (r, c) => (c >= 3 && c < 3 + ffNames.length && rows[r][c] === 'X' ? 'xcell' : '') }).items;
      };
      Fr.add({ items: excTable(), say: 'Step 6: the transition table in codes: for each present code and input, the next code' + ' and the output. Each flip-flop input gets a column from the ' + inp.ff + ' excitation table.' });
      const E = F().EXCITATION[inp.ff];
      vn.forEach((v, b) => {
        const names = E.inputs.map((p) => p + (v.replace(/^[A-Za-z]+/, '') || v));
        // a row where this bit changes, to talk about
        let ri = d.rows.findIndex((r) => r.nextCode && r.code[b] !== r.nextCode[b]);
        if (ri < 0) ri = d.rows.findIndex((r) => r.nextCode);
        const r = d.rows[ri];
        Fr.add({ items: excTable({ row: ri }), say: 'Flip-flop ' + v + ': in the lit row it goes from ' + r.code[b] + ' to ' + r.nextCode[b] + '.', meta: { askExc: true, ans: names.map((n) => r.exc[n]).join(', '), opts: OPTS[inp.ff] } });
        names.forEach((n) => shown.add(n));
        Fr.add({ items: excTable({ row: ri }), say: 'So ' + names.map((n) => n + ' = ' + r.exc[n]).join(', ') + ' in that row; every row of the ' + names.join(' and ') + ' column' + (names.length > 1 ? 's' : '') + ' is filled the same way from the change of ' + v + '.' });
      });
      // 7. K-maps (or, one-hot, the arrows into each state)
      step(7);
      const eqDone = [];
      const onehot = d.assignment.kind === 'onehot';
      for (const f of d.functions) {
        let items;
        const eqs = () => P6.eqs(eqDone.map((t, i) => ({ key: 'e' + i, text: t })), 0, 0, { prefix: 'eq', title: 'equations' });
        if (onehot && f.kind === 'ff') {
          const i = d.vars.indexOf('Y' + f.name.replace(/^D/, ''));
          const s = m.states[i];
          const into = m.states.flatMap((q) => syms.filter((x) => m.next[q][x] === s).map(() => q + '>' + s));
          const dd = coded(m, d.codes, { prefix: 'fsm', pos, hot: [s], taken: into });
          eqDone.push(f.text);
          const e = P6.eqs(eqDone.map((t, k) => ({ key: 'e' + k, text: t })), dd.box.x + dd.box.w + 70, dd.box.y + 20, { prefix: 'eq', title: 'equations', lit: new Set(['e' + (eqDone.length - 1)]) });
          items = dd.items.concat(e.items);
          Fr.count('eqs');
          Fr.add({ items, say: f.name + ' sets flip-flop Y' + i + ' (state ' + s + ') on the next edge: it is 1 for every arrow into ' + s + ': ' + pr(f.text) + '.' });
          continue;
        }
        const km = kmapOf(f, 0, 0, 'km');
        eqDone.push(f.text);
        const e = P6.eqs(eqDone.map((t, k) => ({ key: 'e' + k, text: t })), km.box.x + km.box.w + 60, 30, { prefix: 'eq', title: 'equations', lit: new Set(['e' + (eqDone.length - 1)]) });
        void eqs;
        Fr.count('eqs');
        Fr.add({ items: km.items.concat(e.items), say: 'The K-map of ' + f.name + ' over ' + f.vars.join(', ') + ': 1s from its column of the table, X for don\'t cares (unused codes and unspecified entries). ' + (f.min.cubes.length ? f.min.cubes.length + (f.min.cubes.length > 1 ? ' groups cover' : ' group covers') + ' the 1s: ' : '') + pr(f.text) + '.' });
      }
      // 8. equations, 9. circuit and simulation
      step(8);
      const res = K.schem.layout(d.circuit), B = res.bounds;
      // the circuit on a frame of its own, the equations beside it or under it, whichever lets the stage (about
      // 1000 × 720 on a desktop) draw it larger
      const eqsAt = (x, y) => P6.eqs(d.equations.map((e, i) => ({ key: 'e' + i, text: e.text })), x, y, { prefix: 'eq', title: 'equations' });
      const fitOf = (items) => { const v = S.stageBounds(items, { margin: 14 }); return Math.min(1000 / v.w, 720 / v.h); };
      const circ = K.schem.item('circ', res, { textScale: 1.1 });
      const beside = [circ].concat(eqsAt(B.w + 50, 20).items), under = [circ].concat(eqsAt(0, B.h + 40).items);
      // (a circuit too big for either keeps the stage to itself: the equations were on the frames before)
      const best = fitOf(beside) >= fitOf(under) ? beside : under;
      const circItems = fitOf(best) >= 0.8 ? best : [circ];
      Fr.add({ items: circItems, view: S.stageBounds(circItems, { margin: 14, minW: 900, minH: 480 }), say: 'Steps 8 and 9: the equations become gates in front of the ' + d.vars.length + ' ' + inp.ff + ' flip-flops. ' + costSay(d.cost) + '. ' + (needReset ? 'RESET presets the machine to ' + m.start + ' (' + d.codes[m.start] + ').' : 'The flip-flops start cleared, which is ' + m.start + ' (' + d.codes[m.start] + ').') });
      // simulate: a reset pulse, then one input per clock
      const xs = P6.seq(m0, P.seq);
      const n = xs.length, inputs = {};
      inN.forEach((nm, i) => { inputs[nm] = xs.map((x) => +x[i]); });
      if (needReset) inputs.RESET = xs.map(() => 0);
      const R = TM.clocked(d.circuit, { period: 100, cycles: n, inputs, extra: needReset ? [[0, 'RESET', 1], [12, 'RESET', 0]] : [], until: n * 100 + 2, powerUp: needReset ? 'X' : 0 });
      const run = F().run(m, xs);
      const ffParts = d.vars.map((v) => d.circuit.byId.get(v.toLowerCase()));
      const sig = [{ name: 'CLK', label: 'CLK', changes: R.changes('CLK') }].concat(needReset ? [{ name: 'RESET', label: 'RESET', changes: R.changes('RESET') }] : [], inN.map((nm) => ({ name: nm, changes: R.changes(nm) })), ffParts.map((p, i) => ({ name: p.id + '.q', label: d.vars[i], changes: R.changes(p.id + '.q') })), m.outputs.map((o) => ({ name: o, changes: R.changes(o), cls: 'good' })));
      const sampled = xs.map((_, k) => m.outputs.map((o) => R.at(o, k * 100 + 46)).join(''));
      const want = xs.map((_, k) => run.outputs[k]);
      const agree = sampled.every((z, k) => F().util.agree(z, want[k]));
      // the circuit with its wires coloured over the waveforms, when both fit the stage at a readable size; a
      // tall circuit leaves the waveforms the whole stage
      const wavesAt = (y, t) => TM.waves({ x: 0, y, w: Math.max(560, B.w - 80), t0: 0, t1: n * 100, now: t, signals: sig, prefix: 'tw', ticks: 5 });
      const withCirc = B.h + 50 + wavesAt(0, 0).box.h <= 820;
      const scene = (t) => (withCirc ? [K.schem.item('circ', res, { values: R.values(t), textScale: 1.1 })].concat(wavesAt(B.h + 50, t).items) : wavesAt(0, t).items);
      const half = Math.floor(n / 2);
      Fr.add({ items: scene(half * 100 + 46), say: 'Simulated with real gate delays: ' + (needReset ? 'RESET, then ' : '') + 'the inputs ' + xs.join(' ') + ', one per clock. So far the outputs sampled just before each edge are ' + sampled.slice(0, half).join(' ') + '.', meta: { askSim: true, z: sampled[half] } });
      Fr.add({ items: scene(n * 100), say: 'All ' + n + ' clocks: the circuit gives ' + sampled.join(' ') + ', the state table says ' + want.join(' ') + (agree ? ': they agree, so the circuit is the machine.' : ': they differ somewhere — look for the clock where they part.'), mark: 'end' });
      const def = { sections: [{ id: 'd', kind: 'math', title: 'The design flow', text: ['1 problem', '2 state diagram', '3 state table', '4 reduce', '5 assign codes', '6 excitation table', '7 K-maps', '8 equations', '9 circuit, simulate'].join('\n') }] };
      return { frames: P6.views(Fr.list), def };
    },
    predict: [
      { at: (f) => f.meta && f.meta.ask, pick: 'item', ask: (fr, i) => 'From ' + fr[i].meta.s + ' with the input ' + fr[i].meta.x + ', which state comes next? Click it.', answer: (fr, i) => 'fsm:s:' + fr[i].meta.next, explain: (fr, i) => fr[i].say, once: true },
      { at: (f) => f.meta && f.meta.askRed, pick: 'option', options: ['2', '3', '4', '5'], ask: 'How many states will be left after merging the classes?', answer: (fr, i) => String(fr[i].meta.n), explain: (fr, i) => fr[i + 1].say, once: true },
      { at: (f) => f.meta && f.meta.askExc, pick: 'option', options: (fr, i) => fr[i].meta.opts, ask: 'Which flip-flop inputs does the lit row need? (X = either)', answer: (fr, i) => fr[i].meta.ans, explain: (fr, i) => fr[i + 1].say, once: true },
      { at: (f) => f.meta && f.meta.askSim, pick: 'option', options: (fr, i) => (fr[i].meta.z.length === 1 ? ['0', '1'] : ['00', '01', '10', '11']), ask: 'What will the output be on the next clock?', answer: (fr, i) => fr[i].meta.z, explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'In the design flow, unused codes are entered in the K-maps as…', options: ['0s', '1s', "don't cares", 'they are left off the map'], answer: 2, why: 'The machine never reaches them in normal use, so any value helps the minimisation.' },
      { q: 'Which comes first?', options: ['assigning codes', 'reducing the states', 'drawing the K-maps', 'choosing gates'], answer: 1, why: 'Reduce first: fewer states can mean fewer flip-flops and less logic.' },
      { q: 'With JK flip-flops, each flip-flop needs how many K-maps?', options: ['1', '2', '4', 'none'], answer: 1, why: 'One for J and one for K.' },
      { q: 'The simulation at the end checks…', options: ['that the circuit has no gates', 'that the circuit\'s outputs match the state table on a sequence of inputs', 'the K-maps', 'the clock speed only'], answer: 1, why: 'Comparing outputs clock by clock against the table catches a wrong equation or a wrong wire.' },
      { q: 'A Moore machine\'s output equations use…', options: ['the state variables only', 'the inputs only', 'both', 'neither'], answer: 0, why: 'A Moore output is a function of the state alone.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Unused states, self-correction and lockout
  // ---------------------------------------------------------------------------------------------------
  const unKeys = ['mod5', 'mod6', 'count3', 'det110', 'edge'];
  S.topic({
    id: 'unused-states', family: 'p6-design', order: 30, title: 'Unused states: self-correction and lockout',
    blurb: 'Codes no state was given still exist in the flip-flops; a glitch or power-up can put the machine there. Where it goes next depends on how the don\'t cares were grouped. If it always finds its way back, the circuit corrects itself; if it can stay among unused codes, it locks out.',
    inputs: [P6.choice(unKeys, 'mod5'), Object.assign({}, ffInput, { def: 'T' }), Object.assign({}, asgInput, { def: 'gray', options: asgInput.options.filter((o) => o.value !== 'onehot') }), { id: 'unused', kind: 'choice', label: 'Unused codes', def: 'dc', options: [{ value: 'dc', label: "don't cares" }, { value: 'start', label: 'go to the start state' }] }],
    presets: [
      { label: 'Mod-5, T, Gray: locks out', values: { m: 'mod5', ff: 'T', asg: 'gray', unused: 'dc' } },
      { label: 'The same, unused → start', values: { m: 'mod5', ff: 'T', asg: 'gray', unused: 'start' } },
      { label: 'Mod-5, D, binary: corrects itself', values: { m: 'mod5', ff: 'D', asg: 'binary', unused: 'dc' } },
      { label: 'Mod-6, JK, binary', values: { m: 'mod6', ff: 'JK', asg: 'binary', unused: 'dc' } },
      { label: 'Counter with enable: held by E = 0', values: { m: 'count3', ff: 'D', asg: 'binary', unused: 'dc' } },
    ],
    counters: [{ id: 'unused', label: 'unused codes' }, { id: 'lock', label: 'can lock out' }],
    camera: 'follow',
    run(inp) {
      const m0 = P6.machine(inp.m);
      const mk = (unused) => F().design(m0, { ff: inp.ff, assign: inp.asg, unused });
      const d = mk(inp.unused), m = d.machine, u = F().unusedStates(d);
      const syms = F().symbols(m), mealy = m.type === 'mealy';
      const Fr = new S.Frames(['unused', 'lock']);
      const nameOf = new Map(Object.entries(d.codes).map(([s, c]) => [c, s]));
      // the diagram with the unused codes as states of their own
      const base = K.fsm.machine(m);
      const all = (upto, uu) => {
        uu = uu || u;
        const extra = uu.codes.slice(0, upto);
        const trans = base.trans.slice();
        for (const c of extra) {
          const by = new Map();
          for (const x of syms) { const to = nameOf.get(c.next[x]) || c.next[x]; if (!by.has(to)) by.set(to, []); by.get(to).push(x + (mealy ? '/' + c.out[x] : '')); }
          for (const [to, ls] of by) trans.push({ from: c.code, to, label: m.inputs.length ? ls.join(', ') : '' });
        }
        const outOf = new Map(uu.codes.map((c) => [c.code, c.out[syms[0]]]));
        return { states: m.states.concat(u.codes.map((c) => c.code)), start: m.start, trans, labelOf: m.type === 'moore' ? (q) => (outOf.has(q) ? q + '/' + outOf.get(q) : q + '/' + m.out[q]) : null };
      };
      const full = all(u.codes.length);
      const pos = K.fsm.layout(full, { mode: 'stress' }).pos;
      const draw = (k, o) => {
        o = o || {};
        const dd0 = o.d || d, uu = o.u || u;
        const g = all(k, uu), sub = Object.assign({}, dd0.codes);
        const shownSt = m.states.concat(uu.codes.slice(0, k).map((c) => c.code)), on = new Set(shownSt);
        const dd = K.fsm.draw({ states: shownSt, start: g.start, trans: g.trans.filter((t) => on.has(t.from) && on.has(t.to)), labelOf: g.labelOf }, { prefix: 'fsm', pos, sub, cls: Object.fromEntries(u.codes.map((c) => [c.code, 'unused' + (o.lock && c.lockout ? ' bad' : '')])), hot: o.hot ? [o.hot] : [], taken: o.taken || [] });
        const e = P6.eqs(dd0.equations.map((q, i) => ({ key: 'e' + i, text: q.text })), dd.box.x + dd.box.w + 60, dd.box.y + 20, { prefix: 'eq', title: inp.ff + ' equations' + (o.d ? ', redesigned' : '') });
        return dd.items.concat(e.items);
      };
      Fr.set('unused', d.unused.length);
      Fr.add({ items: draw(0), say: m.states.length + ' states in ' + d.vars.length + ' flip-flops (' + KIND[d.assignment.kind] + ': ' + m.states.map((s) => s + ' = ' + d.codes[s]).join(', ') + ').' + (d.unused.length ? ' ' + codesAre(d.unused, ['belongs', 'belong']).replace(/^t/, 'T') + ' to no state. ' + (inp.unused === 'dc' ? (d.unused.length === 1 ? 'It was a don\'t care in the K-maps, so the equations decide, almost by accident, where it goes.' : 'They were don\'t cares in the K-maps, so the equations decide, almost by accident, where they go.') : 'This design sent ' + (d.unused.length === 1 ? 'it' : 'them') + ' to ' + m.start + ' on purpose, at the cost of fewer don\'t cares.') : ' Every code is used, so nothing can go astray.') });
      u.codes.forEach((c, k) => {
        const where = syms.map((x) => c.next[x]);
        Fr.add({ items: draw(k, { hot: null }), say: 'Suppose the flip-flops hold ' + c.code + '. Put ' + d.vars.map((v, i) => v + ' = ' + c.code[i]).join(', ') + ' into the equations' + (m.inputs.length ? ' for each input' : '') + '…', meta: { ask: true, ans: where[where.length - 1], opts: F().util.symbols(d.vars.length) } });
        Fr.add({ items: draw(k + 1, { hot: c.code, taken: syms.map((x) => c.code + '>' + (nameOf.get(c.next[x]) || c.next[x])) }), say: u.trace[k].say });
        if (c.lockout) Fr.count('lock');
      });
      const verdict = u.trace[u.trace.length - 1];
      Fr.add({ items: draw(u.codes.length, { lock: true }), say: verdict.say.replace(/^The codes (\S+) can lock out/, 'The code $1 can lock out') + (u.selfCorrecting && d.unused.length ? ' However the machine is upset, within a few clocks it is back in the proper cycle.' : ''), meta: { verdict: u.selfCorrecting ? 'Corrects itself' : 'Can lock out' } });
      if (!u.selfCorrecting && inp.unused === 'dc') {
        const d2 = mk('start'), u2 = F().unusedStates(d2);
        const e = P6.eqs(d2.equations.map((q, i) => ({ key: 'f' + i, text: q.text })), 0, 30, { prefix: 'eq2', title: 'redesigned: unused codes go to ' + m.start });
        const e1 = P6.eqs(d.equations.map((q, i) => ({ key: 'e' + i, text: q.text, cls: 'dim' })), e.box.x + e.box.w + 60, 30, { prefix: 'eq', title: 'before' });
        Fr.add({ items: e.items.concat(e1.items), say: 'The fix: make ' + (d.unused.length === 1 ? 'the unused code go' : 'the unused codes go') + ' to ' + m.start + ' (' + d2.codes[m.start] + ') instead of leaving them as don\'t cares. The logic grows (' + d.cost.gateInputs + ' → ' + d2.cost.gateInputs + ' gate inputs), but ' + (u2.selfCorrecting ? (d.unused.length === 1 ? 'now the unused code returns at the next clock.' : 'now every unused code returns at the next clock.') : 'check it again.') });
        if (u2.codes.length === u.codes.length) Fr.add({ items: draw(u2.codes.length, { d: d2, u: u2 }), say: 'Redesigned, ' + (u2.codes.length === 1 ? u2.codes[0].code + ' goes' : u2.codes.map((c) => c.code).join(', ') + ' all go') + ' straight to ' + m.start + ': there is no way to stay outside the count.' });
      }
      const def = { sections: [{ id: 'd', kind: 'math', title: 'Unused codes', text: ['self-correcting: from every unused', '  code, every input sequence', '  reaches a used state', 'lockout: some unused codes', '  lead only to each other', 'fix: send unused codes to the', '  start state (or check and redesign)'].join('\n') }] };
      return { frames: P6.views(Fr.list), def };
    },
    predict: [
      { at: (f) => f.meta && f.meta.ask, pick: 'option', options: (fr, i) => fr[i].meta.opts, ask: (fr, i, inp) => 'Where does it go on the next clock' + (P6.machine(inp.m).inputs.length ? ' (with the input at 1)' : '') + '?', answer: (fr, i) => fr[i].meta.ans, explain: (fr, i) => fr[i + 1].say, once: true },
      { at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.verdict, pick: 'option', options: ['Corrects itself', 'Can lock out'], ask: 'Does this circuit correct itself?', answer: (fr, i) => fr[i + 1].meta.verdict, explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'A circuit is self-correcting when…', options: ['it has no unused codes', 'from every unused code it reaches a used state, whatever the inputs', 'it resets on power-up', 'its outputs are 0 in unused codes'], answer: 1, why: 'Then any upset is temporary.' },
      { q: 'Lockout means…', options: ['the clock stops', 'the machine can cycle among unused codes and never return', 'the reset is stuck', 'two states share a code'], answer: 1, why: 'It is trapped outside the intended cycle.' },
      { q: 'Treating unused codes as don\'t cares…', options: ['always gives lockout', 'gives the simplest logic, but where those codes go must be checked', 'is not allowed', 'makes them go to 0'], answer: 1, why: 'The grouping decides their next states; check them afterwards.' },
      { q: 'A safe fix for lockout is to…', options: ['remove the flip-flops', 'design the unused codes to go to a known state, such as the start', 'use a faster clock', 'add more unused states'], answer: 1, why: 'At some cost in logic, every unused code then returns at once.' },
    ],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
