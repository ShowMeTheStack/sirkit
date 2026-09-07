// Part 10, design: a word description turned into a primitive flow table row by row; the rows merged with the
// implication table and the merger diagram; a race-free assignment found on the cube of codes (with a spare row
// when three rows must all be neighbours); and the hazard-free excitation equations, the gate circuit, and the
// circuit run on the simulator against the description.
(function (S) {
  'use strict';
  const P10 = S.P10, A = () => S.Async, FL = () => S.Kit.flow, K = () => S.Kit, F_ = () => S.Fsm;
  const nm = (v) => String(v).replace(/'/g, '′');

  /** the design examples, each with what every row of its primitive flow table stands for */
  P10.examples = {
    catch: {
      label: 'Catch x2 rising while x1 is 1',
      desc: 'Z goes to 1 when x2 rises while x1 is already 1, and stays 1 until x1 falls.',
      table: () => A().examples.gatedCatch(),
      story: { a: 'both inputs 0', b: 'x2 alone is 1', c: 'x1 alone is 1', d: 'both 1, x2 came first', e: 'both 1, x2 rose while x1 was 1: caught', f: 'x1 alone, after d (nothing caught)', g: 'x1 alone, after e: Z stays 1 until x1 falls' },
      seq: ['00', '10', '11', '10', '00', '01', '11', '01', '00'],
    },
    order: {
      label: 'Which input rose first',
      desc: 'Z = 1 when x1 rose before x2, and stays 1 until both inputs are back at 0.',
      table: () => ({
        name: 'order', inputs: ['x1', 'x2'], outputs: ['Z'],
        rows: {
          a: { '00': 'a', '01': 'c', '11': '-', '10': 'b' }, b: { '00': 'a', '01': '-', '11': 'd', '10': 'b' }, c: { '00': 'a', '01': 'c', '11': 'e', '10': '-' },
          d: { '00': '-', '01': 'f', '11': 'd', '10': 'h' }, e: { '00': '-', '01': 'c', '11': 'e', '10': 'g' }, f: { '00': 'a', '01': 'f', '11': 'd', '10': '-' },
          g: { '00': 'a', '01': '-', '11': 'e', '10': 'g' }, h: { '00': 'a', '01': '-', '11': 'd', '10': 'h' },
        },
        out: { a: '0', b: '0', c: '0', d: '1', e: '0', f: '1', g: '0', h: '1' },
      }),
      story: { a: 'both inputs 0', b: 'x1 alone, it came first', c: 'x2 alone, it came first', d: 'both 1, x1 first: Z = 1', e: 'both 1, x2 first', f: 'x2 alone after d: still Z = 1', g: 'x1 alone after e', h: 'x1 alone after d: still Z = 1' },
      seq: ['00', '10', '11', '01', '00', '01', '11', '10', '00'],
    },
  };
  const exInput = { id: 'ex', kind: 'choice', label: 'Specification', def: 'catch', options: Object.entries(P10.examples).map(([value, e]) => ({ value, label: e.label })) };
  const exPresets = Object.entries(P10.examples).map(([value, e]) => ({ label: e.label, values: { ex: value } }));
  const cols = () => FL().gray(2);
  /** a primitive (or merged) flow table drawn: rows, entries 'a' or '-', stable circled, output column */
  function primTable(t, o) {
    o = o || {};
    const rows = o.rows || Object.keys(t.rows);
    const shown = o.shown || {};
    return FL().table({
      x: o.x || 0, y: o.y || 0, prefix: o.prefix || 'pt', rows, cols: cols(), corner: 'row \\ ' + t.inputs.join(''),
      cell: (r, c) => {
        const v = t.rows[r][c];
        if (shown[r] === undefined) return '';
        if (shown[r] === 'stable' && v !== r) return '';
        const k = r + c;
        return { text: v, stable: v === r, cls: [(o.hot || []).includes(k) ? 'hot' : '', v === '-' ? 'dc' : '', (o.fresh || []).includes(r) && v !== r ? 'fresh' : ''].join(' ').trim() };
      },
      extra: [{ head: t.outputs.join(''), cell: (r) => (shown[r] === undefined ? '' : t.out[r]) }],
      hot: (o.hotRows || []).map((r) => [rows.indexOf(r), cols().length]),
    });
  }

  // ---------------------------------------------------------------------------------------------------------
  // The primitive flow table
  // ---------------------------------------------------------------------------------------------------------
  S.topic({
    id: 'async-primitive', family: 'p10-design', order: 10, title: 'From words to a primitive flow table',
    blurb: 'Walk through every situation the description can be in, one input change at a time. Each situation is a row with one stable state and its output; then fill in where each input change leads.',
    inputs: [exInput],
    presets: exPresets,
    counters: [{ id: 'rows', label: 'rows' }],
    run(inp) {
      const E = P10.examples[inp.ex], t = E.table(), rows = Object.keys(t.rows);
      const shown = {};
      const F = new S.Frames(['rows']);
      const head = (x) => P10.lines('desc', 0, -40, [{ text: E.desc, cls: 'note' }]).concat(x || []);
      F.add({ items: head(primTable(t, { shown }).items), say: 'The specification: ' + E.desc + ' Fundamental mode: one input changes at a time. Start from both inputs at 0.' });
      for (const r of rows) {
        shown[r] = 'stable';
        F.count('rows');
        const sc = cols().find((c) => t.rows[r][c] === r);
        F.add({ items: head(primTable(t, { shown, hot: [r + sc], hotRows: [r] }).items), say: 'Row ' + r + ': ' + E.story[r] + '. Its stable state is in column ' + sc + ', with ' + t.outputs[0] + ' = ' + t.out[r] + '.', meta: { row: r } });
      }
      rows.forEach((r, i) => {
        const moves = cols().filter((c) => t.rows[r][c] !== r && t.rows[r][c] !== '-');
        const dashes = cols().filter((c) => t.rows[r][c] === '-');
        const before = Object.assign({}, shown);
        shown[r] = 'all';
        F.add({ items: head(primTable(t, { shown, hot: moves.map((c) => r + c), fresh: [r] }).items), say: 'From row ' + r + ' (' + E.story[r] + '): ' + moves.map((c) => 'input ' + c + ' leads to ' + t.rows[r][c]).join(', ') + '.' + (dashes.length ? ' Column ' + dashes.join(' and ') + ' would need two inputs to change at once: a dash, a don\'t-care.' : ''), meta: { ask: i === 1 || i === 4, r, c: moves[0], to: t.rows[r][moves[0]], rows } });
        void before;
      });
      const bad = A().checkPrimitive(t);
      F.add({ items: head(primTable(t, { shown }).items), say: 'The primitive flow table: ' + rows.length + ' rows, each with exactly one stable state, and every move landing on a row that is stable in the new column. ' + (bad.length ? bad[0] : 'It is complete and consistent.') + ' Next, rows that can share a code are merged.', mark: 'end' });
      return { frames: P10.big(F.list), def: { sections: [{ id: 'd', kind: 'math', title: 'A primitive flow table', text: ['one row per situation', 'exactly one stable entry per row', 'output given in the stable state', 'moves: one input change each', 'two-input changes: dash (don\'t care)'].join('\n') }] } };
    },
    predict: [{ at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.ask, pick: 'option', options: (fr, i) => fr[i + 1].meta.rows, ask: (fr, i) => 'In row ' + fr[i + 1].meta.r + ', the input becomes ' + fr[i + 1].meta.c + '. Which row does that lead to?', answer: (fr, i) => fr[i + 1].meta.to, explain: (fr, i) => fr[i + 1].say }],
    quiz: [
      { q: 'How many stable states does each row of a primitive flow table have?', options: ['none', 'exactly one', 'one per column', 'any number'], answer: 1, why: 'Each row stands for one situation the circuit can rest in.' },
      { q: 'Why are some entries dashes?', options: ['They are errors', 'They would need two inputs to change at once, which fundamental mode rules out', 'The output is unknown there', 'They are stable'], answer: 1, why: 'From a stable state only one input changes.' },
      { q: 'An unstable entry in a primitive flow table must name…', options: ['any row', 'a row that is stable in that same column', 'the row itself', 'row a'], answer: 1, why: 'The circuit moves down the column to where it can rest.' },
      { q: 'Where is the output written in a primitive flow table?', options: ['in every entry', 'for the stable state of each row', 'only in row a', 'nowhere'], answer: 1, why: 'Outputs are defined where the circuit rests; elsewhere they can be chosen later.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------
  // Merging rows: implication table and merger diagram
  // ---------------------------------------------------------------------------------------------------------
  S.topic({
    id: 'async-merger', family: 'p10-design', order: 20, title: 'Merging rows: the merger diagram',
    blurb: 'Two rows can share one row when they never disagree: same output where both are given, and next rows that can be merged too. The implication table finds the compatible pairs, the merger diagram joins them, and its fully joined groups become the rows of a smaller table.',
    inputs: [exInput],
    presets: exPresets,
    counters: [{ id: 'pairs', label: 'compatible pairs' }],
    run(inp) {
      const E = P10.examples[inp.ex], t = E.table();
      const prim = A().flowMachine(t), st = prim.states, Fs = F_();
      const comp = Fs.compatibles(prim), cover = Fs.closedCover(prim, comp), mg = Fs.mergeCover(prim, cover.blocks).machine;
      const pt = primTable(t, { shown: Object.fromEntries(st.map((r) => [r, 'all'])) });
      const ix = pt.box.x + pt.box.w + 60;
      const cell = {};
      const pk = (a, b) => a + ',' + b;
      const imp = (o) => K().table.draw({ x: ix, y: 0, prefix: 'im', rows: st.slice(1).map((r, i) => st.slice(0, -1).map((c, j) => (j > i ? '' : (cell[pk(c, r)] || { text: '' })))), rowHead: st.slice(1), colHead: st.slice(0, -1), skip: (r, c) => c > r, mono: true, size: 14, minW: 52, minH: 40, hot: (o && o.hot) || [], title: 'implication table' });
      const posOf = (a, b) => [st.indexOf(b) - 1, st.indexOf(a)];
      const F = new S.Frames(['pairs']);
      F.add({ items: pt.items.concat(imp().items), say: 'The primitive flow table of ' + st.length + ' rows, and an implication table with a cell for every pair of rows.' });
      // fill row by row (the trace's cells), then the rounds of crossing out
      const cells = comp.trace.filter((q) => q.kind === 'cell' || (q.kind === 'cross' && q.round === 0));
      const byRow = new Map();
      for (const q of cells) { const b = q.pair[1]; if (!byRow.has(b)) byRow.set(b, []); byRow.get(b).push(q); }
      for (const [b, list] of byRow) {
        for (const q of list) {
          if (q.kind === 'cross') cell[pk(q.pair[0], q.pair[1])] = { text: '✗', cls: 'xout' };
          else cell[pk(q.pair[0], q.pair[1])] = q.implied.length ? { text: q.implied.map((p) => p.join('')).join(' ') } : { text: '✓', cls: 'tick' };
        }
        const crosses = list.filter((q) => q.kind === 'cross');
        F.add({ items: pt.items.concat(imp({ hot: list.map((q) => posOf(q.pair[0], q.pair[1])) }).items), say: 'Pairs with ' + b + ': ' + list.map((q) => '(' + q.pair.join(', ') + ') ' + (q.kind === 'cross' ? 'crossed out, the outputs disagree' : q.implied.length ? 'implies ' + q.implied.map((p) => '(' + p.join(', ') + ')').join(', ') : 'a tick')).join('; ') + '.' + (crosses.length ? ' A row\'s output is given only in its stable column, so two rows disagree only where both give one.' : ''), meta: { b } });
      }
      const rounds = [...new Set(comp.trace.filter((q) => q.kind === 'cross' && q.round > 0).map((q) => q.round))];
      for (const rd of rounds) {
        const list = comp.trace.filter((q) => q.kind === 'cross' && q.round === rd);
        for (const q of list) cell[pk(q.pair[0], q.pair[1])] = { text: '✗', cls: 'xout' };
        F.add({ items: pt.items.concat(imp({ hot: list.map((q) => posOf(q.pair[0], q.pair[1])) }).items), say: 'Round ' + rd + ': ' + list.length + ' more cross' + (list.length === 1 ? '' : 'es') + ', each because it implies a pair already crossed out: ' + list.slice(0, 4).map((q) => '(' + q.pair.join(', ') + ') needs (' + q.because.join(', ') + ')').join(', ') + (list.length > 4 ? ', …' : '') + '.' });
      }
      F.set('pairs', comp.pairs.length);
      F.add({ items: pt.items.concat(imp().items), say: 'No more crosses. The pairs left are compatible: ' + comp.pairs.map((p) => '(' + p.join(', ') + ')').join(', ') + '.', meta: { askMax: true, n: comp.maximal.length } });
      // the merger diagram, beside the implication table
      const gx = ix + st.length * 52 + 70;
      const edges = (blocks) => comp.pairs.map((p) => { const k = blocks ? blocks.findIndex((b) => p.every((s) => b.includes(s))) : -1; return { a: p[0], b: p[1], cls: k >= 0 ? 'm' + (k % 5) : '' }; });
      const nodes = (blocks) => st.map((s) => { const k = blocks ? blocks.findIndex((b) => b.includes(s)) : -1; return { id: s, cls: k >= 0 ? 'm' + (k % 5) : '' }; });
      const graph = (blocks) => FL().graph({ x: gx, y: 30, nodes: nodes(blocks), edges: edges(blocks), r: 22 }).items;
      F.add({ items: pt.items.concat(imp().items, graph(null)), say: 'The merger diagram: every row a dot, every compatible pair a line. Rows can share one row of the final table when every two of them are joined.' });
      F.add({ items: pt.items.concat(imp().items, graph(comp.maximal)), say: 'The largest fully joined groups are the maximal compatibles: ' + Fs.showClasses(comp.maximal) + '.' });
      F.add({ items: pt.items.concat(imp().items, graph(cover.blocks)), say: cover.trace[cover.trace.length - 1].say });
      const mt = { inputs: t.inputs, outputs: t.outputs, rows: {}, out: {} };
      for (const r of mg.states) { mt.rows[r] = {}; for (const c of cols()) mt.rows[r][c] = mg.next[r][c] == null ? '-' : mg.next[r][c]; }
      const merged = FL().table({ x: ix, y: 0, prefix: 'mt', rows: mg.states, cols: cols(), corner: 'row \\ ' + t.inputs.join(''), cell: (r, c) => { const v = mt.rows[r][c]; const z = mg.out[r][c]; return { text: v + (z && z !== '-' ? ', ' + z : ''), stable: v === r, cls: v === '-' ? 'dc' : '' }; }, title: 'merged flow table' });
      F.add({ items: pt.items.concat(merged.items, graph(cover.blocks)), say: 'Each block becomes one row: ' + mg.states.join(', ') + '. Its entries combine the rows merged into it (a dash gives way to any entry), with the output after the comma where it is given: ' + st.length + ' rows became ' + mg.states.length + '.', mark: 'end' });
      // on a phone: whichever part the step is about
      const gBox = FL().graph({ x: gx, y: 30, nodes: nodes(null), edges: [], r: 22 }).box, iBox = imp().box;
      F.list.forEach((f) => P10.narrow(f, f.items.some((it) => it.key.startsWith('mt:')) ? merged.box : f.items.some((it) => it.key.startsWith('mg:')) ? gBox : iBox));
      return { frames: P10.big(F.list), def: { sections: [{ id: 'd', kind: 'math', title: 'Compatible rows', text: ['same output wherever both give one', 'implied next rows compatible too', '', 'merger diagram: a line per pair', 'maximal compatible: all joined', 'closed cover: all rows, all implied'].join('\n') }] } };
    },
    predict: [{ at: (f) => f.meta && f.meta.askMax, pick: 'option', options: ['2', '3', '4', '5'], ask: 'Draw the pairs as lines between rows. How many maximal fully joined groups will there be?', answer: (fr, i) => String(fr[i].meta.n), explain: (fr, i) => fr[i + 2].say }],
    quiz: [
      { q: 'Two rows of a flow table are compatible when…', options: ['they have the same name', 'their outputs never disagree where both are given, and the rows they lead to are compatible too', 'they are next to each other', 'they have the same stable column'], answer: 1, why: 'Then one row can play both parts.' },
      { q: 'What does a line in the merger diagram mean?', options: ['a transition', 'a compatible pair', 'a race', 'an output'], answer: 1, why: 'Every compatible pair from the implication table becomes a line.' },
      { q: 'A maximal compatible is…', options: ['the largest row', 'a group of rows in which every two are compatible, not part of a larger one', 'any pair', 'a stable state'], answer: 1, why: 'A fully joined group in the merger diagram.' },
      { q: 'Why must the chosen groups form a closed cover?', options: ['To have fewer outputs', 'Every row must be in a group, and the rows a group leads to must also lie together in a group', 'So the table is square', 'It is optional'], answer: 1, why: 'Otherwise a merged row would have to go to two different rows in one column.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------
  // Race-free assignment
  // ---------------------------------------------------------------------------------------------------------
  S.topic({
    id: 'async-assign', family: 'p10-design', order: 30, title: 'A race-free assignment',
    blurb: 'Give the rows codes so that every move changes one secondary variable. Draw which rows must be neighbours; if they cannot all be neighbours on the square of codes, a spare code relays the move as a cycle.',
    inputs: [exInput],
    presets: exPresets,
    run(inp) {
      const E = P10.examples[inp.ex], t = E.table();
      const d = A().design(t), mg = d.merged, asg = d.assignment;
      const k = asg.vars.length, codesAll = FL().gray(k);
      const pairs = asg.trace.find((q) => q.kind === 'adjacency').pairs;
      const mtab = FL().table({ x: 0, y: 0, prefix: 'mt', rows: mg.states, cols: cols(), corner: 'row \\ ' + t.inputs.join(''), cell: (r, c) => { const v = mg.next[r][c]; return { text: v == null ? '-' : v, stable: v === r, cls: v == null ? 'dc' : '' }; }, title: 'merged flow table' });
      const gx = mtab.box.x + mtab.box.w + 70;
      const F = new S.Frames();
      F.add({ items: mtab.items, say: 'The merged flow table has ' + mg.states.length + ' rows, so it needs at least ' + k + ' secondary variable' + (k > 1 ? 's' : '') + '. Every move from one row to another must change only one of them, or the move is a race.' });
      const g = FL().graph({ x: gx, y: 20, nodes: mg.states.map((s) => ({ id: s })), edges: pairs.map((p) => ({ a: p[0], b: p[1], cls: 'm0' })), r: 28, R: 80 });
      F.add({ items: mtab.items.concat(g.items), say: asg.trace[0].say.replace(/^The transition diagram needs these rows to be adjacent:/, 'Draw a line for every move between rows (the transition diagram). These rows must get codes one bit apart:'), meta: { ask: true, spare: Object.keys(asg.spare).length > 0 } });
      const names = {}; for (const [r, c] of Object.entries(asg.codes)) names[c] = r;
      const cls = {}; for (const c of codesAll) cls[c] = names[c] ? '' : asg.spare[c] ? 'spare' : 'unused';
      const disp = {}; for (const c of codesAll) disp[c] = names[c] || c;
      const sub = {}; for (const c of codesAll) sub[c] = names[c] ? c : asg.spare[c] ? 'spare' : '';
      const cube = (arrows) => FL().cube({ x: gx, y: 10, n: k, size: 170, arrows, cls, names: disp, sub, r: 30 }).items;
      const ham = (a, b) => [...a].filter((ch, i) => ch !== b[i]).length;
      const needArrows = pairs.map((p) => ({ from: asg.codes[p[0]], to: asg.codes[p[1]], cls: ham(asg.codes[p[0]], asg.codes[p[1]]) === 1 ? 'need' : 'bad' }));
      const spares = Object.keys(asg.spare);
      F.add({ items: mtab.items.concat(cube(needArrows.map((a) => Object.assign({}, a, { cls: a.cls === 'bad' ? 'bad' : 'need' })))), say: asg.trace.find((q) => q.kind === 'codes').say.replace(/; the spare.*$/, '.') + ' (' + asg.vars.join('') + ' as written.) ' + (spares.length ? 'One move is left on a diagonal (red): its two codes differ in both bits, a race.' : 'Every line falls on an edge of the square: no move is a race.') });
      if (spares.length) {
        const relay = [];
        for (const c of spares) for (const [x, nx] of Object.entries(asg.spare[c])) {
          const from = Object.keys(asg.table).find((r) => asg.table[r][x] === c && r !== c);
          if (from) relay.push({ from, to: c, cls: 'hot' });
          relay.push({ from: c, to: nx, cls: 'hot' });
        }
        F.add({ items: mtab.items.concat(cube(needArrows.filter((a) => a.cls === 'need').concat(relay))), say: asg.trace.filter((q) => q.kind === 'spare').map((q) => q.say).join(' ') + ' The diagonal move becomes a cycle: two single changes through the spare code, which is never a resting place.' });
      }
      const tt = FL().table({
        x: 0, y: mtab.box.h + 60, prefix: 'at', rows: codesAll, cols: cols(), rowHead: codesAll.map((c) => (names[c] ? c + ' (' + names[c] + ')' : asg.spare[c] ? c + ' (spare)' : c)), corner: asg.vars.join('') + ' \\ ' + t.inputs.join(''),
        cell: (r, c) => { const v = asg.table[r] ? asg.table[r][c] : null; return { text: v == null ? '-' : v, stable: v === r, cls: (v == null ? 'dc ' : '') + (asg.spare[r] ? 'spare' : '') }; },
        title: 'assigned transition table',
      });
      F.add({ items: mtab.items.concat(cube(needArrows.filter((a) => a.cls === 'need')), tt.items), say: 'Replace every row name by its code: the transition table the circuit must realise. ' + (spares.length ? 'The spare row is filled only where it relays; elsewhere it is a don\'t-care.' : 'Unused codes are don\'t-cares.') + ' Every unstable entry now differs from its row in one bit.', mark: 'end' });
      const cBox = FL().cube({ x: gx, y: 10, n: k, size: 170, r: 30 }).box;
      F.list.forEach((f) => P10.narrow(f, f.items.some((it) => it.key.startsWith('at:')) ? tt.box : f.items.some((it) => it.key.startsWith('cb:')) ? cBox : f.items.some((it) => it.key.startsWith('mg:')) ? g.box : mtab.box));
      return { frames: P10.big(F.list), def: { sections: [{ id: 'd', kind: 'math', title: 'Race-free assignment', text: ['rows that follow each other:', 'codes one bit apart', '', 'three rows all joined (a triangle)', 'cannot fit a square:', 'relay through a spare code (a cycle)'].join('\n') }] } };
    },
    predict: [{ at: (f) => f.meta && f.meta.ask, pick: 'option', options: ['Yes, directly', 'No: a spare code is needed'], ask: 'Can every pair of rows joined by a line get codes one bit apart, using the square of two-bit codes?', answer: (fr, i) => (fr[i].meta.spare ? 'No: a spare code is needed' : 'Yes, directly'), explain: (fr, i) => fr[i + 1].say }],
    quiz: [
      { q: 'A race-free assignment makes every move between rows…', options: ['change one secondary variable at a time', 'take one clock cycle', 'change all variables', 'go through row a'], answer: 0, why: 'Then there is never a race between two loops.' },
      { q: 'Three rows that must all be neighbours cannot fit on two-bit codes because…', options: ['two-bit codes are too few', 'on a square, two corners on a diagonal differ in two bits', 'they have different outputs', 'it is always possible'], answer: 1, why: 'A triangle cannot be drawn on the edges of a square.' },
      { q: 'What does a spare code do?', options: ['stores a fourth state', 'relays a move: the circuit passes through it as a cycle of single changes', 'replaces the output', 'nothing'], answer: 1, why: 'It is never stable, only a stepping stone.' },
      { q: 'Unused codes in the transition table are…', options: ['errors', 'don\'t-cares (except where a spare row relays)', 'stable', 'forbidden'], answer: 1, why: 'The circuit never rests there, so the logic may do anything.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------
  // Excitation, circuit, and the circuit run
  // ---------------------------------------------------------------------------------------------------------
  S.topic({
    id: 'async-implement', family: 'p10-design', order: 40, title: 'Excitation equations and the circuit',
    blurb: 'Each excitation is a K-map read from the assigned table, its don\'t-cares from the unused codes. Cover it, then add the terms that bridge neighbouring 1s, so no static hazard can upset the loops. Build the gates and run the description through the simulator.',
    inputs: [exInput],
    presets: exPresets,
    run(inp) {
      const E = P10.examples[inp.ex], t = E.table(), Bo = S.Bool, TM = K().timing;
      const d = A().design(t), asg = d.assignment, vars = asg.vars.concat(t.inputs);
      const U = S.Fsm.util;
      const F = new S.Frames();
      const eqsAll = d.equations.concat(d.outputs);
      const maps = eqsAll.map((e) => {
        const fn = Bo.fromMinterms(vars, e.ones, e.dc);
        return { e, fn, geometry: Bo.kmap(fn) };
      });
      const mapAt = (mi, x, y, upto) => {
        const { e, geometry } = maps[mi];
        const added = new Set(e.added || []);
        const groups = e.cubes.slice(0, upto === undefined ? e.cubes.length : upto).map((c, i) => ({ key: 'g' + c, cells: Bo.cubeMinterms(Bo.cubeFromStr(c)), tone: added.has(c) ? 5 : i % 5, cls: added.has(c) ? 'ghost' : 'strong' }));
        return K().km.draw({ geometry, prefix: 'km' + mi, x, y, groups, title: e.name + ' over ' + vars.join(' ') });
      };
      const W = K().km.frame(maps[0].geometry).W + 40;
      // the equations live in the side panel; the maps get the stage to themselves
      const eqLines = () => [];
      F.add({ scene: 'map', items: mapAt(0, 0, 0, 0).items, say: 'Codes ' + Object.entries(asg.codes).map(([r, c]) => r + ' = ' + c).join(', ') + ' with variables ' + asg.vars.join(', ') + '. Each excitation is 1 in the cells where the assigned table sends that variable to 1; cells of unused codes are don\'t-cares (X).' });
      maps.forEach((mp, i) => {
        const e = mp.e, added = e.added || [];
        const base = e.cubes.filter((c) => !added.includes(c));
        F.add({ scene: 'map', items: eqLines(i, -1).concat(mapAt(i, 0, 0, base.length).items), say: e.name + ': a minimal cover takes ' + base.map((c) => nm(U.cubeText(c, vars))).join(' + ') + '.', meta: { ask: added.length > 0 && i === maps.findIndex((q) => (q.e.added || []).length), added: added.map((c) => nm(U.cubeText(c, vars))), base: base.map((c) => nm(U.cubeText(c, vars))) } });
        if (added.length) F.add({ scene: 'map', items: eqLines(i, -1).concat(mapAt(i, 0, 0).items), say: 'Two neighbouring 1s are held by different terms; a change of the variable between them could make ' + e.name + ' dip for a moment, and a dip in a loop can flip the circuit into the wrong row. So add ' + added.map((c) => nm(U.cubeText(c, vars))).join(', ') + ' to bridge them: ' + nm(e.text) + '.' });
        F.add({ scene: 'map', items: eqLines(i + 1, i).concat(mapAt(i, 0, 0).items), say: nm(e.text) + (added.length ? ', hazard-free.' : '; no neighbouring 1s are split, so it is already hazard-free.') });
      });
      P10.blocks(d.circuit);
      const res = K().schem.layout(d.circuit);
      const cy = 0;
      F.add({ scene: 'circ', items: [K().schem.item('circ', res, { x: 0, y: cy })], say: 'The circuit, drawn as rails: the inputs, the secondary variables and their complements run down the left, an AND gate for every product, an OR gate for every excitation, and each excitation feeds back through a delay block (the loop\'s delay) to become its secondary variable, returning to its rail along a lane over the top. ' + (d.circuit.parts.filter((p) => S.Netlist.GATES.has(p.type)).length) + ' gates.' });
      // run the specification through the simulator
      const seq = E.seq, step = 40, end = seq.length * step;
      const stim = [];
      seq.forEach((x, k2) => t.inputs.forEach((n, j) => stim.push([k2 * step, n, +x[j]])));
      const dep = {}; for (const v of asg.vars) dep[v] = 0;
      const R = TM.run(d.circuit, { deposit: dep, stim, until: end });
      const sigs = TM.signals(R, t.inputs.concat(asg.vars, t.outputs));

      const ok = seq.map((x, k2) => R.at(t.outputs[0], (k2 + 1) * step - 1));
      const want = A().simulate(d.model, seq, { from: asg.codes[Object.keys(asg.codes)[0]] }).steps.map((s2) => s2.out);
      const V = P10.split({ R, signals: sigs, t1: end, w: 640 });
      seq.forEach((x, k2) => {
        if (!k2) return;
        F.add(Object.assign(V.wave((k2 + 1) * step - 1), { say: 'At ' + k2 * step + ' ns the inputs become ' + x + ': ' + t.outputs[0] + ' = ' + ok[k2] + (want[k2 - 1] !== undefined ? ' (the flow table says ' + want[k2 - 1] + ').' : '.'), meta: k2 === 2 ? { askZ: true, z: String(ok[k2]) } : null }));
      });
      const agree = seq.every((x, k2) => !k2 || String(ok[k2]) === String(want[k2 - 1]));
      F.add({ scene: 'circ', items: [TM.schem('circ', R, end, { x: 0, y: cy })], say: 'The circuit after the run, its wires coloured by their final values. ' + (agree ? 'Every step agrees with the flow table: ' : 'Not every step agrees with the flow table: ') + E.desc, mark: 'end' });
      return { frames: P10.scenes(F.list), def: { sections: [{ id: 'd', kind: 'math', title: 'Equations', text: eqsAll.map((e) => nm(e.text)).join('\n') }] } };
    },
    predict: [
      { at: (f) => f.meta && f.meta.ask, pick: 'option', options: (fr, i) => [...new Set(fr[i].meta.added.concat(fr[i].meta.base))], ask: 'Is there a pair of neighbouring 1s held by different terms? Which term would bridge it?', answer: (fr, i) => fr[i].meta.added[0], explain: (fr, i) => fr[i + 1].say },
      { at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.askZ, pick: 'option', options: ['0', '1'], ask: 'The inputs change. What will the output be once the circuit settles?', answer: (fr, i) => fr[i + 1].meta.z, explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'In the excitation maps, the cells of unused codes are…', options: ['0', '1', 'don\'t-cares', 'forbidden'], answer: 2, why: 'The circuit never rests there.' },
      { q: 'Why add terms beyond a minimal cover in an asynchronous design?', options: ['to save gates', 'to cover every pair of neighbouring 1s in one term, so no static hazard can flip a loop', 'to add outputs', 'they are never added'], answer: 1, why: 'A momentary dip in an excitation can send the circuit to the wrong row.' },
      { q: 'What does the buffer in each loop of the drawn circuit stand for?', options: ['a flip-flop', 'the delay of the loop, lumped in one place', 'an inverter', 'the clock'], answer: 1, why: 'The analysis treats each loop as a delay between Y and y.' },
      { q: 'How many excitation equations does a design with two secondary variables have?', options: ['1', '2', '4', 'one per row'], answer: 1, why: 'One per secondary variable (plus the outputs).' },
    ],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
