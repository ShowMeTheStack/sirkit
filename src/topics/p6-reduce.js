// Part 6, state reduction: the implication table (pairs crossed out round by round, each with its reason and an
// arrow from the cell that forced it), partition refinement (blocks of states splitting until every member of a
// block agrees on where it goes), and the equivalence of two machines by walking their pairs of states, with
// the shortest input sequence that tells them apart.
(function (S) {
  'use strict';
  const K = S.Kit, P6 = S.P6, Geo = S.geom;
  const F = () => S.Fsm;
  const SUP = ['', '¹', '²', '³', '⁴', '⁵', '⁶'];

  S.family({ id: 'p6-reduce', part: 'machines', order: 20, title: 'State reduction', blurb: 'Two states that no input sequence can tell apart are one state. Find them with the implication table or by refining a partition, and check two machines for equivalence.' });

  const redKeys = ['seven', 'seven2', 'six', 'two', 'det1011'];
  /** the merged machine drawn where the old states were: merged states grow out of their class */
  function mergedDiagram(m, red, pos, prefix) {
    const r = red.machine, pos2 = {}, merged = {};
    for (const c of red.classes) {
      const keep = m.states.find((s) => c.includes(s));
      if (!pos[keep]) continue;
      pos2[keep] = { x: c.reduce((a, s) => a + pos[s].x, 0) / c.length, y: c.reduce((a, s) => a + pos[s].y, 0) / c.length };
      if (c.length > 1) merged[keep] = c;
    }
    const lay = K.fsm.layout(r, { fixed: {} }).pos;
    // keep the old picture's places when they make a good drawing; else lay out afresh
    const ok = K.fsm.score(r, pos2).total <= K.fsm.score(r, lay).total;
    return P6.diagram(r, { prefix, pos: ok ? pos2 : lay, merged });
  }

  // ---------------------------------------------------------------------------------------------------
  // The implication table
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'implication-table', family: 'p6-reduce', order: 10, title: 'The implication table',
    blurb: 'One cell for every pair of states. Cross out the pairs whose outputs differ; write in the others the pairs their next states must also be. Then keep crossing out any cell that needs a crossed-out pair, round after round, until nothing changes.',
    inputs: [P6.choice(redKeys, 'seven')],
    presets: redKeys.map((k) => ({ label: P6.LIB[k].label, values: { m: k } })),
    counters: [{ id: 'crossed', label: 'pairs crossed out' }, { id: 'left', label: 'pairs left' }],
    camera: 'follow',
    run(inp) {
      const m = P6.machine(inp.m), t = F().implication(m), st = m.states, n = st.length;
      const Fr = new S.Frames(['crossed', 'left']);
      Fr.set('left', (n * (n - 1)) / 2);
      // cell state: { a, b, text, cls }
      const cell = new Map();
      const key = (a, b) => (st.indexOf(a) < st.indexOf(b) ? a + '|' + b : b + '|' + a);
      const implText = (c) => (c.implied.length ? c.implied.map((e) => e[1] + ',' + e[2]).join('\n') : '✓');
      const pairOf = (a, b) => t.pairs.get(a + '|' + b) || t.pairs.get(b + '|' + a);
      const cellKey = (a, b) => { const i = Math.max(st.indexOf(a), st.indexOf(b)), j = Math.min(st.indexOf(a), st.indexOf(b)); return 'it:' + (i - 1) + ',' + j; };
      const stTable = P6.table(m, { x: 0, y: 30, prefix: 'st', title: 'state table' });
      const tx = stTable.box.x + stTable.box.w + 70;
      const draw = (o) => {
        o = o || {};
        const rows = [];
        for (let i = 1; i < n; i++) { const r = []; for (let j = 0; j < n - 1; j++) { if (j >= i) { r.push(''); continue; } const c = cell.get(key(st[j], st[i])); r.push(c ? c.text : ''); } rows.push(r); }
        const pos = (a, b) => { const i = Math.max(st.indexOf(a), st.indexOf(b)), j = Math.min(st.indexOf(a), st.indexOf(b)); return [i - 1, j]; };
        const hot = o.hot ? [pos(o.hot[0], o.hot[1])] : [];
        const arrows = o.arrow ? [{ from: pos(o.arrow[0][0], o.arrow[0][1]), to: pos(o.arrow[1][0], o.arrow[1][1]), cls: 'b', bend: 30 }] : [];
        const tb = K.table.draw({
          x: tx, y: 30, prefix: 'it', rows, rowHead: st.slice(1), colHead: st.slice(0, -1), corner: '', size: 14, mono: true, minW: 58, minH: 44, hot, arrows,
          skip: (r, c) => c > r, title: 'implication table',
          cls: (r, c) => { const cc = cell.get(key(st[c], st[r + 1])); return cc ? cc.cls : ''; },
        });
        const hotRows = o.rows || [];
        const sTab = P6.table(m, { x: 0, y: 30, prefix: 'st', title: 'state table', classes: Object.fromEntries(hotRows.map((s) => [s, 'src-a'])) });
        return sTab.items.concat(tb.items);
      };
      Fr.add({ items: draw(), say: t.trace[0].say + ' A pair of states can be merged only if their outputs agree on every input and their next states can be merged too.' });
      // round 0, cell by cell
      for (let i = 1; i < n; i++) for (let j = 0; j < i; j++) {
        const a = st[j], b = st[i], c = pairOf(a, b);
        if (c.crossed === 0) { cell.set(key(a, b), { text: '✗', cls: 'bad xr0' }); Fr.count('crossed'); Fr.count('left', -1); } else cell.set(key(a, b), { text: implText(c), cls: c.implied.length ? '' : 'good' });
        const tr = t.trace.find((x) => x.pair && x.pair[0] === c.a && x.pair[1] === c.b && (x.kind === 'cross' && x.round === 0 || x.kind === 'cell'));
        Fr.add({ items: draw({ hot: [a, b], rows: [a, b] }), say: tr.say.replace(/\.$/, '') + (c.crossed === 0 ? '.' : c.implied.length ? ': they can be merged only if ' + (c.implied.length === 1 ? 'that pair can' : 'those pairs can') + '.' : '.'), meta: { cell0: true } });
      }
      Fr.add({ items: draw(), say: 'Round 0 is done: ' + t.rounds[0].length + ' pairs crossed out because their outputs differ. Now look at every cell still open: if it needs a pair that is crossed out, it goes too.', meta: { classesN: t.classes ? t.classes.length : null } });
      // later rounds
      let asked = 0;
      t.trace.filter((x) => x.kind === 'cross' && x.round > 0 || x.kind === 'round').forEach((x) => {
        if (x.kind === 'round') {
          Fr.add({ items: draw(), say: x.say + (x.crossed && !x.crossed.length ? ' The cells left open are the pairs of equivalent states.' : '') });
          return;
        }
        const [a, b] = x.pair, why = x.because;
        Fr.add({ items: draw({ hot: [a, b] }), say: 'Round ' + x.round + ': (' + a + ', ' + b + ') needs ' + pairOf(a, b).implied.map((e) => '(' + e[1] + ', ' + e[2] + ')').join(' and ') + '. Is any of those crossed out?', meta: asked++ < 3 ? { ask: true, answer: cellKey(why[0], why[1]) } : null });
        cell.set(key(a, b), { text: '✗' + (SUP[x.round] || x.round), cls: 'bad xr' + Math.min(x.round, 3) });
        Fr.count('crossed'); Fr.count('left', -1);
        Fr.add({ items: draw({ hot: [a, b], arrow: [why, [a, b]] }), say: x.say });
      });
      // the result
      if (t.classes) {
        for (const [k, c] of cell) if (!/✗/.test(c.text)) cell.set(k, { text: c.text, cls: 'good' });
        const red = F().reduce(m);
        Fr.add({ items: draw(), say: (t.trace.find((x) => x.kind === 'classes') || { say: '' }).say.replace(/\.$/, '') + (t.classes.some((c) => c.length > 1) ? ' (the green cells).' : '.') });
        const pos = P6.layout(m);
        const d0 = P6.diagram(m, { prefix: 'fsm', pos, cls: Object.fromEntries(red.classes.flatMap((c, i) => (c.length > 1 ? c.map((s) => [s, 'cl' + (i % 4)]) : []))) });
        Fr.add({ items: d0.items, say: 'On the diagram: ' + (red.classes.some((c) => c.length > 1) ? '' : 'no two states behave alike.') + red.classes.filter((c) => c.length > 1).map((c) => c.join(', ')).join('; ') + (red.classes.some((c) => c.length > 1) ? ' behave alike, whatever the input.' : '') });
        const d1 = mergedDiagram(m, red, pos, 'fsm');
        const t2 = P6.table(red.machine, { x: d1.box.x + d1.box.w + 70, y: d1.box.y + 20, prefix: 'rt', title: 'reduced table' });
        Fr.add({ items: d1.items.concat(t2.items), exits: d1.exits, say: (red.trace.find((x) => x.kind === 'reduced') || {}).say });
      }
      const def = { sections: [{ id: 'd', kind: 'math', title: 'Implication table', text: ['round 0: cross (p, q) if their', '  outputs differ on some input', 'else write the pairs of next', '  states they imply', 'round k: cross (p, q) if it implies', '  a pair crossed earlier', 'stop when a round crosses nothing'].join('\n') }] };
      return { frames: P6.views(Fr.list), def };
    },
    predict: [
      { at: (f) => f.meta && f.meta.ask, pick: 'item', ask: 'Click the crossed-out cell that rules this pair out.', answer: (fr, i) => fr[i].meta.answer, explain: (fr, i) => fr[i + 1].say },
      { at: (f) => f.meta && f.meta.classesN, pick: 'option', options: ['2', '3', '4', '5', '6', '7'], ask: 'Guess: how many states will the reduced machine have?', answer: (fr, i) => String(fr[i].meta.classesN), explain: (fr) => fr[fr.length - 1].say, once: true },
    ],
    quiz: [
      { q: 'Round 0 of the implication table crosses out pairs whose…', options: ['next states differ', 'outputs differ on some input', 'names differ', 'codes differ'], answer: 1, why: 'States with different outputs can be told apart at once.' },
      { q: 'A cell for (B, E) holds the pair (C, F). If (C, F) is crossed out…', options: ['(B, E) stays', '(B, E) is crossed out too', '(C, F) is restored', 'nothing can be said'], answer: 1, why: 'B and E lead to C and F, which are distinguishable, so B and E are as well.' },
      { q: 'How many cells does the implication table of a 6-state machine have?', options: ['36', '30', '15', '6'], answer: 2, why: 'One per pair: 6 × 5 / 2 = 15.' },
      { q: 'The process stops when…', options: ['every cell is crossed out', 'a round crosses out nothing new', 'round 3 is reached', 'the first equivalent pair is found'], answer: 1, why: 'After a round with no change, no later round can change anything either.' },
      { q: 'If (A, B) and (B, C) are left uncrossed in a completely specified machine, then…', options: ['A, B and C are all one class', 'only A and B merge', 'nothing merges', 'A and C differ'], answer: 0, why: 'Equivalence is transitive, so A ≡ B and B ≡ C give A ≡ C.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Partition refinement
  // ---------------------------------------------------------------------------------------------------
  const partKeys = ['seven', 'seven2', 'six', 'det1011', 'count3'];
  S.topic({
    id: 'partition-refinement', family: 'p6-reduce', order: 20, title: 'Partition refinement',
    blurb: 'Start with the states grouped by their outputs. Then split each block by where its members go: two states stay together only if, on every input, they go to the same block. Repeat until no block splits.',
    inputs: [P6.choice(partKeys, 'seven2')],
    presets: partKeys.map((k) => ({ label: P6.LIB[k].label, values: { m: k } })),
    counters: [{ id: 'blocks', label: 'blocks' }, { id: 'round', label: 'round' }],
    camera: 'follow',
    run(inp) {
      const m = P6.machine(inp.m), syms = F().symbols(m), p = F().partition(m);
      const Fr = new S.Frames(['blocks', 'round']);
      const stT = P6.table(m, { x: 0, y: 30, prefix: 'st', title: 'state table' });
      const x0 = stT.box.x + stT.box.w + 70;
      const R = 21, STEP = 2 * R + 26, GAP = 26, ROWH = 120;
      // rows of blocks: each block a region holding its states
      const rowItems = (r, blocks, sig, o) => {
        const items = [], y = 40 + r * ROWH;
        let x = x0 + 60;
        items.push({ key: 'pl:' + r, kind: 'text', x: x0, y: y + 6, text: 'P' + r, cls: 'strong', size: 16 });
        blocks.forEach((b, i) => {
          const w = b.length * STEP + 8;
          items.push({ key: 'pb:' + r + ':' + b.join(''), kind: 'region', x, y: y - 26, w, h: 64, rx: 14, cls: 'r' + (i % 6) + (o && o.hotBlock === i ? ' hot' : ''), audit: 'group', enter: r ? 'fade' : 'grow' });
          items.push({ key: 'pn:' + r + ':' + b.join(''), kind: 'text', x: x + w / 2, y: y - 32, text: 'B' + (i + 1), anchor: 'middle', cls: 'blockname', size: 12 });
          b.forEach((s, k) => {
            const it = { key: 'ps:' + r + ':' + s, kind: 'state', x: x + 4 + STEP / 2 + k * STEP, y: y + 6, r: R, text: s, size: 15 };
            if (r) { it.enter = 'from'; it.src = 'ps:' + (r - 1) + ':' + s; }
            if (sig && sig[s] !== undefined) it.sub = sig[s];
            items.push(it);
          });
          x += w + GAP;
        });
        return { items, right: x };
      };
      const blockIdx = (blocks) => { const ix = new Map(); blocks.forEach((b, i) => b.forEach((s) => ix.set(s, i))); return ix; };
      const sigOf = (blocks) => { const ix = blockIdx(blocks); return Object.fromEntries(m.states.map((s) => [s, syms.map((x) => 'B' + (ix.get(m.next[s][x]) + 1)).join(' ')])); };
      let shown = [];
      const scene = (extra) => stT.items.concat(...shown.map((r) => r.items), extra || []);
      const p0 = p.rounds[0];
      Fr.set('blocks', p0.length);
      shown = [rowItems(0, p0)];
      Fr.add({ items: scene(), say: p.trace[0].say + ' States in different blocks can already be told apart by one input.' });
      for (let r = 0; r < p.rounds.length; r++) {
        const blocks = p.rounds[r], sig = sigOf(blocks);
        const next = p.rounds[r + 1];
        shown[r] = rowItems(r, blocks, sig);
        Fr.add({ items: scene(), say: 'Under each state of P' + r + ': the block its next state is in, for ' + syms.map((x) => P6.inText(m, x)).join(' and ') + '. Two states may stay together only if these match.', meta: { ask: true, n: (next || blocks).length, opts: [...new Set([blocks.length, blocks.length + 1, blocks.length + 2, (next || blocks).length])].sort((a, b) => a - b) } });
        if (!next) break;
        shown[r] = rowItems(r, blocks);
        shown[r + 1] = rowItems(r + 1, next);
        Fr.set('blocks', next.length); Fr.set('round', r + 1);
        const splits = p.trace.filter((x) => x.kind === 'split' && x.round === r + 1);
        Fr.add({ items: scene(), say: splits.map((x) => x.say).join(' ') + ' P' + (r + 1) + ' has ' + next.length + ' blocks.' });
      }
      const final = p.rounds[p.rounds.length - 1];
      shown[p.rounds.length - 1] = rowItems(p.rounds.length - 1, final);
      Fr.add({ items: scene(), say: (p.trace.find((x) => x.kind === 'stable') || {}).say + ' Each block is one state of the reduced machine.' });
      const red = F().reduce(m, { method: 'partition' });
      const pos = P6.layout(red.machine);
      const d = P6.diagram(red.machine, { prefix: 'fsm', pos });
      const t2 = P6.table(red.machine, { x: d.box.x + d.box.w + 70, y: d.box.y + 20, prefix: 'rt', title: 'reduced table' });
      Fr.add({ items: d.items.concat(t2.items), say: (red.trace.find((x) => x.kind === 'reduced') || {}).say });
      const def = { sections: [{ id: 'd', kind: 'math', title: 'Partition refinement', text: ['P0: group by outputs', 'P(k+1): split each block of Pk', '  so that members go to the same', '  blocks of Pk on every input', 'stop when P(k+1) = Pk'].join('\n') }] };
      return { frames: P6.views(Fr.list), def };
    },
    predict: [
      { at: (f) => f.meta && f.meta.ask, pick: 'option', options: (fr, i) => fr[i].meta.opts.map(String), ask: 'Read the signatures under the states. How many blocks will the next partition have?', answer: (fr, i) => String(fr[i].meta.n), explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'The first partition P0 groups states by…', options: ['their names', 'their outputs', 'their next states', 'their codes'], answer: 1, why: 'States with different outputs are certainly different.' },
      { q: 'Two states in one block of Pk stay together in P(k+1) when…', options: ['they have the same next states', 'on every input their next states are in the same block of Pk', 'they have the same outputs', 'they are adjacent'], answer: 1, why: 'The next states need only be indistinguishable so far, not identical.' },
      { q: 'Refinement stops when…', options: ['every block has one state', 'a round splits nothing', 'there are two blocks', 'after n rounds'], answer: 1, why: 'Once no block splits, no later round can split one either.' },
      { q: 'Partition refinement and the implication table on the same complete machine give…', options: ['different classes', 'the same classes', 'classes that differ by one state', 'nothing comparable'], answer: 1, why: 'Both find exactly the equivalent states.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Equivalent machines
  // ---------------------------------------------------------------------------------------------------
  const PAIRS = {
    reduced: { label: 'Seven states and their reduced machine', a: () => P6.machine('seven'), b: () => F().reduce(P6.machine('seven')).machine },
    overlap: { label: '1011 detector: overlapping and not', a: () => F().detector('1011').machine, b: () => F().detector('1011', { overlap: false }).machine },
    kinds: { label: 'A Moore machine and its Mealy form', a: () => P6.machine('edge'), b: () => F().toMealy(P6.machine('edge')).machine },
    near: { label: 'Two equal bits, with one arrow changed', a: () => P6.machine('two'), b: () => F().parse('mealy\ninputs X\noutputs Z\nstart P\nP: 0 -> Q/0, 1 -> R/0\nQ: 0 -> Q/1, 1 -> R/0\nR: 0 -> P/0, 1 -> R/1') },
    parity: { label: 'Parity, and a four-state copy of it', a: () => P6.machine('parity'), b: () => F().parse('moore\ninputs X\noutputs Z\nstart E1\nE1/0: 0 -> E2, 1 -> O1\nE2/0: 0 -> E1, 1 -> O2\nO1/1: 0 -> O2, 1 -> E2\nO2/1: 0 -> O1, 1 -> E1') },
  };
  S.topic({
    id: 'fsm-equivalence', family: 'p6-reduce', order: 30, title: 'Equivalent machines',
    blurb: 'Two machines are equivalent when no input sequence gives different outputs. Walk their pairs of states from the two start states: if every pair reached agrees, they are equivalent; the first pair that disagrees gives the shortest sequence that tells them apart.',
    inputs: [{ id: 'p', kind: 'choice', label: 'Machines', def: 'overlap', options: Object.keys(PAIRS).map((k) => ({ value: k, label: PAIRS[k].label })) }],
    presets: Object.keys(PAIRS).map((k) => ({ label: PAIRS[k].label, values: { p: k } })),
    counters: [{ id: 'pairs', label: 'pairs reached' }],
    camera: 'follow',
    run(inp) {
      const A = PAIRS[inp.p].a(), B = PAIRS[inp.p].b();
      const eq = F().equivalent(A, B);
      // B's states renamed apart from A's when they clash
      const da = P6.diagram(A, { prefix: 'ma' });
      const pb = P6.layout(B);
      const probe = P6.diagram(B, { prefix: 'mb', pos: pb });
      // B beside A when the two fit across the stage at a readable size, else under it; the table of pairs and
      // the runs that tell them apart go where there is room: under the machines, or beside B
      const side = da.box.w + 90 + probe.box.w <= 1150;
      const offX = side ? da.box.x + da.box.w + 90 - probe.box.x : da.box.x - probe.box.x;
      const offY = side ? da.box.y - probe.box.y : da.box.y + da.box.h + 64 - probe.box.y;
      const bx = probe.box.x + offX, by = probe.box.y + offY;
      const bottom = Math.max(da.box.y + da.box.h, by + probe.box.h);
      const below = side ? { x: da.box.x, y: bottom + 50 } : { x: bx + probe.box.w + 70, y: by - 24 };
      const Fr = new S.Frames(['pairs']);
      const pairs = [];
      const scene = (o) => {
        o = o || {};
        const a = P6.diagram(A, { prefix: 'ma', pos: da.pos, active: o.pair ? [o.pair[0]] : [], taken: o.ta || [], cls: o.bad ? { [o.pair[0]]: 'bad' } : null });
        const b = P6.diagram(B, { prefix: 'mb', pos: pb, x: offX, y: offY, active: o.pair ? [o.pair[1]] : [], taken: o.tb || [] });
        const ttl = [{ key: 'tA', kind: 'text', x: da.box.x, y: (side ? Math.min(da.box.y, by) : da.box.y) - 24, text: 'machine A (' + A.type + ')', cls: 'title' }, { key: 'tB', kind: 'text', x: bx, y: (side ? Math.min(da.box.y, by) : by) - 24, text: 'machine B (' + B.type + ')', cls: 'title' }];
        const rows = pairs.map((q) => [q.pair[0] + ', ' + q.pair[1], q.how]);
        const t = rows.length ? K.table.draw({ x: below.x, y: below.y, prefix: 'pt', rows, colHead: ['pair (A, B)', 'reached by'], size: 14, mono: true, maxRows: 6, focus: [rows.length - 1, 0], act: rows.length ? [[rows.length - 1, 0], [rows.length - 1, 1]] : [], title: 'pairs of states', cls: (r) => (pairs[r].bad ? 'bad' : '') }).items : [];
        return a.items.concat(b.items, ttl, t, o.extra || []);
      };
      Fr.add({ items: scene(), say: 'Machine A has ' + A.states.length + ' states, machine B ' + B.states.length + '. ' + (A.type !== B.type ? 'A Moore machine is compared through its Mealy form: the output on an arrow is the output of the state it enters. ' : '') + 'Run both at once: the pair of their present states is all that matters.', meta: { ask: true, eq: eq.equal } });
      for (const step of eq.trace) {
        if (step.kind === 'pair') {
          pairs.push({ pair: step.pair, how: step.from ? '(' + step.from.join(', ') + ') on ' + step.input : 'start' });
          Fr.count('pairs');
          Fr.add({ items: scene({ pair: step.pair, ta: step.from ? [step.from[0] + '>' + step.pair[0]] : [], tb: step.from ? [step.from[1] + '>' + step.pair[1]] : [] }), say: step.say });
        } else if (step.kind === 'differ') {
          const p = step.pair;
          pairs.push({ pair: p, how: 'on ' + step.input + ': ' + step.outs.join(' ≠ '), bad: true });
          Fr.add({ items: scene({ pair: p, bad: true }), say: step.say });
          const xs = step.sequence || eq.sequence;
          const ra = F().run(A, xs), rb = F().run(B, xs);
          // the two runs side by side under their machines when they fit there, else one over the other
          const sa = P6.strip(A, xs, ra, { x: below.x, y: below.y + (side ? 0 : 24), prefix: 'sa' });
          const apart = side && sa.box.w + 40 <= bx - da.box.x;
          const sb = P6.strip(B, xs, rb, apart ? { x: bx, y: sa.box.y, prefix: 'sb' } : { x: below.x, y: sa.box.y + sa.box.h + 30, prefix: 'sb' });
          pairs.length = 0;
          Fr.add({ items: scene({ extra: sa.items.concat(sb.items, [{ key: 'la', kind: 'text', x: sa.box.x + sa.box.w + 16, y: sa.box.y + 20, text: 'A', cls: 'strong' }, { key: 'lb', kind: 'text', x: sb.box.x + sb.box.w + 16, y: sb.box.y + 20, text: 'B', cls: 'strong' }]) }), say: 'The input sequence ' + xs.join(' ') + ' tells them apart: A outputs ' + ra.outputs.join(' ') + ', B outputs ' + rb.outputs.join(' ') + '. The search is breadth first, so no shorter sequence does.' });
        } else if (step.kind === 'equal') {
          Fr.add({ items: scene(), say: step.say + ' However long the input, the two outputs agree.' });
        }
      }
      const def = { sections: [{ id: 'd', kind: 'math', title: 'Equivalence', text: ['start from (start A, start B)', 'for each pair reached and each input:', '  outputs differ → not equivalent', '  else add the pair of next states', 'no pair left to try → equivalent'].join('\n') }] };
      return { frames: P6.views(Fr.list), def };
    },
    predict: [
      { at: (f) => f.meta && f.meta.ask, pick: 'option', options: ['Equivalent', 'Not equivalent'], ask: 'Before the walk: are these two machines equivalent?', answer: (fr, i) => (fr[i].meta.eq ? 'Equivalent' : 'Not equivalent'), explain: (fr) => fr[fr.length - 1].say, once: true },
    ],
    quiz: [
      { q: 'Two machines are equivalent when…', options: ['they have the same number of states', 'every input sequence gives the same output sequence from the start states', 'their tables look alike', 'they use the same flip-flops'], answer: 1, why: 'Only behaviour at the outputs counts.' },
      { q: 'The walk over pairs of states visits at most…', options: ['nA + nB pairs', 'nA × nB pairs', '2 pairs', 'nA pairs'], answer: 1, why: 'Each pair (state of A, state of B) is visited at most once.' },
      { q: 'A distinguishing sequence found breadth first is…', options: ['the longest one', 'a shortest one', 'random', 'always of length 1'], answer: 1, why: 'Pairs are reached in order of the length of the input that reaches them.' },
      { q: 'A machine and its reduced form are…', options: ['equivalent', 'never equivalent', 'equivalent only for short inputs', 'different machines with different outputs'], answer: 0, why: 'Reduction merges only states no sequence can tell apart.' },
    ],
  });
  void Geo;
})(globalThis.Sirkit = globalThis.Sirkit || {});
