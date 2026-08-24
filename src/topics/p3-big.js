// Part 3, bigger maps: five variables as two maps side by side (or one mirrored map), six variables as four
// maps in a square, several outputs minimised together so that a product term feeds more than one OR gate,
// and maps with a variable written into the cells.
(function (S) {
  'use strict';
  const B = () => S.Bool;
  const K = () => S.Kit.km;
  const P3 = S.P3;

  S.family({ id: 'p3-big', part: 'minimise', order: 30, title: 'Bigger maps and several outputs', blurb: 'Five and six variables as maps of maps, where a cell also touches the same cell in the next map; several outputs sharing product terms; and a smaller map with a variable written into its cells.' });

  const VAR5 = ['A', 'B', 'C', 'D', 'E'], VAR6 = ['A', 'B', 'C', 'D', 'E', 'F'];
  const neighbourWords = (g, m) => B().kmapNeighbours(g, m).map((x) => x.m + ' (' + x.var + (x.how === 'between-maps' ? ', in the other map' : x.how === 'wrap' ? ', round the edge' : x.how === 'mirror' ? ', across the mirror line' : '') + ')');

  // ---------------------------------------------------------------------------------------------------
  // Five variables
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'kmap-5', family: 'p3-big', order: 10, title: 'Five variables: two maps',
    blurb: 'Five variables need 32 cells: two 4-variable maps, one for A = 0 and one for A = 1. A cell also touches the cell in the same place in the other map, so a group may be the same block in both. The mirrored layout puts the two side by side as one map with a mirror line instead.',
    inputs: [
      { id: 'f', kind: 'text', label: 'Function of A, B, C, D, E', def: "C'E + A'BD' + ABDE'", check: P3.fnCheck(5) },
      { id: 'layout', kind: 'choice', label: 'Layout', def: 'maps', options: [{ value: 'maps', label: 'Two maps (A = 0, A = 1)' }, { value: 'mirror', label: 'One mirrored map' }] },
      { id: 'm', kind: 'number', label: 'Cell whose neighbours to show', def: 9, min: 0, max: 31 },
    ],
    presets: [
      { label: 'A block in both maps', values: { f: "C'E + A'BD' + ABDE'", layout: 'maps', m: 9 } },
      { label: 'Six primes, wrapping and spanning', values: { f: "B'C'E + BD + A'C'D'E'", layout: 'maps', m: 0 } },
      { label: 'The same, mirrored', values: { f: "B'C'E + BD + A'C'D'E'", layout: 'mirror', m: 0 } },
      { label: 'Given as minterms', values: { f: 'Σm(0, 2, 8, 10, 16, 18, 24, 26, 5, 7, 21, 23)', layout: 'maps', m: 18 } },
    ],
    run(inp) {
      const Bo = B(), fn = P3.readFn(inp.f, 5), sv = P3.solver(fn, 'sop', { layout: inp.layout, cell: 46 });
      const g = sv.g, m0 = inp.m;
      const nb = Bo.kmapNeighbours(g, m0);
      const frames = [];
      const start = sv.steps[0].st;
      frames.push({ narrowView: P3.narrow(sv), items: sv.scene(start), say: inp.layout === 'mirror' ? 'Five variables in one map of 4 rows (AB) by 8 columns (CDE). The columns run 000 001 011 010 | 110 111 101 100: the right half mirrors the left, with C = 1.' : 'Five variables: the left map holds the 16 cells with A = 0, the right map those with A = 1. Inside each map the rows are BC and the columns DE, in Gray order.' });
      frames.push({ narrowView: P3.narrow(sv), items: sv.scene(Object.assign({}, start, { hot: [m0], marks: Object.fromEntries(nb.map((x) => [x.m, '•'])) })), say: 'Cell ' + m0 + ' (' + Bo.bits(m0, 5) + ') has five neighbours, one per variable: ' + neighbourWords(g, m0).join(', ') + '.', meta: { kind: 'nb', nb: nb.map((x) => x.m), other: nb.filter((x) => x.how === 'between-maps' || x.how === 'mirror').map((x) => x.m) } });
      for (const f of P3.solveFrames(sv)) frames.push(f);
      const span = sv.res.cover.filter((p) => p.group.spansMaps).map((p) => p.text);
      frames[frames.length - 1].say += span.length ? ' ' + span.join(' and ') + (span.length === 1 ? ' is' : ' are') + ' the same block in both maps, so A drops out of ' + (span.length === 1 ? 'it' : 'them') + '.' : '';
      return { frames, def: { sections: [{ id: 'f', kind: 'math', title: 'The function', text: 'F = ' + Bo.sigma(fn) + '\nF = ' + sv.res.text }] } };
    },
    predict: [
      { at: (f) => f.meta && f.meta.kind === 'nb' && f.meta.other.length, pick: 'item', ask: 'Which cell outside this cell\'s own half is its neighbour? Click it.', answer: (fr, i) => fr[i].meta.other.map((m) => 'km:c:' + m), explain: (fr, i) => fr[i].say },
      { at: (f) => f.meta && f.meta.kind === 'primes', pick: 'option', ask: 'How many terms will the minimal SOP have?', options: ['1', '2', '3', '4', '5', '6'], answer: (fr) => String((/: (\d+) terms?/.exec(fr[fr.length - 1].say) || [0, '1'])[1]), explain: (fr) => fr[fr.length - 1].say },
    ],
    quiz: [
      { q: 'In the two-map layout (A = 0 left, A = 1 right), cell 6 touches which cell in the other map?', options: ['22', '7', '14', '38'], answer: 0, why: 'Flipping A adds 16: 6 + 16 = 22, in the same place of the A = 1 map.' },
      { q: 'A group that is the same 2×2 block in both maps holds how many cells?', options: ['4', '6', '8', '16'], answer: 2, why: 'Four cells in each map, two maps: a group of 8 that drops three variables.' },
      { q: 'How many neighbours does each cell of a 5-variable map have?', options: ['4', '5', '8', '10'], answer: 1, why: 'One for each variable.' },
      { q: 'In the mirrored layout, which column is the neighbour of column 001 across the mirror line?', options: ['101', '110', '011', '000'], answer: 0, why: 'Columns at the same distance from the mirror line differ only in C: 001 and 101.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Six variables
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'kmap-6', family: 'p3-big', order: 20, title: 'Six variables: four maps in a square',
    blurb: 'Sixty-four cells as four 4-variable maps, one for each value of AB, placed in Gray order so that maps side by side or one above the other differ in one variable. A group may be one block repeated in two maps or in all four.',
    inputs: [
      { id: 'f', kind: 'text', label: 'Function of A … F', def: "C'F' + BDE + A'B'C'E", check: P3.fnCheck(6) },
      { id: 'm', kind: 'number', label: 'Cell whose neighbours to show', def: 23, min: 0, max: 63 },
    ],
    presets: [
      { label: 'A block in all four maps', values: { f: "C'F' + BDE + A'B'C'E", m: 23 } },
      { label: 'Blocks in two maps', values: { f: "A'C'E + BDF' + ACE'F", m: 6 } },
      { label: 'Wrapping inside every map', values: { f: "B'D'F + CE' + AC'DF'", m: 40 } },
    ],
    run(inp) {
      const Bo = B(), fn = P3.readFn(inp.f, 6), sv = P3.solver(fn, 'sop', { cell: 40 });
      const g = sv.g, m0 = inp.m, nb = Bo.kmapNeighbours(g, m0);
      const frames = [];
      const start = sv.steps[0].st;
      frames.push({ narrowView: P3.narrow(sv), items: sv.scene(start), say: 'Six variables: four maps, AB = 00 and 01 on top, 10 and 11 below, so that maps beside or above each other differ in A or B alone. Inside each map, CD picks the row and EF the column.' });
      frames.push({ narrowView: P3.narrow(sv), items: sv.scene(Object.assign({}, start, { hot: [m0], marks: Object.fromEntries(nb.map((x) => [x.m, '•'])) })), say: 'Cell ' + m0 + ' (' + Bo.bits(m0, 6) + ') has six neighbours: ' + neighbourWords(g, m0).join(', ') + '. Two of them are in other maps, at the same place.', meta: { kind: 'nb', other: nb.filter((x) => x.how === 'between-maps').map((x) => x.m) } });
      for (const f of P3.solveFrames(sv)) frames.push(f);
      return { frames, def: { sections: [{ id: 'f', kind: 'math', title: 'The function', text: 'F = ' + sv.res.text + '\n' + P3.plural(fn.ones.size, 'minterm') + ' of 64' }] } };
    },
    predict: [
      { at: (f) => f.meta && f.meta.kind === 'nb', pick: 'item', ask: 'Click a neighbour of the lit cell that lies in another map.', answer: (fr, i) => fr[i].meta.other.map((m) => 'km:c:' + m), explain: (fr, i) => fr[i].say },
      { at: (f) => f.meta && f.meta.kind === 'primes', pick: 'option', ask: 'How many terms will the minimal SOP have?', options: ['2', '3', '4', '5'], answer: (fr) => String((/: (\d+) terms?/.exec(fr[fr.length - 1].say) || [0, '1'])[1]), explain: (fr) => fr[fr.length - 1].say },
    ],
    quiz: [
      { q: 'How many cells does a 6-variable map have?', options: ['32', '36', '64', '128'], answer: 2, why: '2⁶ = 64: four maps of 16.' },
      { q: 'Are the maps for AB = 00 and AB = 11 neighbours?', options: ['Yes', 'No: they differ in two variables'], answer: 1, why: 'Only maps whose codes differ in one bit are adjacent; 00 and 11 sit diagonally.' },
      { q: 'A 2×2 block repeated in all four maps is a term with how many literals?', options: ['2', '3', '4', '6'], answer: 0, why: '16 cells = 2⁴, so four of the six variables drop out.' },
      { q: 'Beyond six variables, K-maps are rarely used because…', options: ['they cannot be drawn', 'adjacency across many maps is hard to see; tabular methods scale better', 'Gray codes stop working', 'there are no prime implicants'], answer: 1, why: 'Quine–McCluskey and computer methods take over.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Several outputs
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'kmap-multi', family: 'p3-big', order: 30, title: 'Several outputs, shared terms',
    blurb: 'Two outputs of the same inputs can share an AND gate when both use the same product. Minimised one at a time, each output takes its own best groups; minimised together, a group that is not prime for one output can still pay for itself by serving both.',
    inputs: [
      P3.nInput(4, ['3', '4']),
      { id: 'f', kind: 'text', label: 'F', def: 'Σm(0, 2, 4, 5, 13, 15)', check: P3.fnCheck() },
      { id: 'g', kind: 'text', label: 'G', def: 'Σm(4, 5, 6, 7, 13, 15)', check: P3.fnCheck() },
    ],
    presets: [
      { label: 'One shared term saves a gate', values: { n: '4', f: 'Σm(0, 2, 4, 5, 13, 15)', g: 'Σm(4, 5, 6, 7, 13, 15)' } },
      { label: 'A shared term that is not prime for F', values: { n: '4', f: 'Σm(0, 1, 3, 8, 9, 11)', g: 'Σm(3, 6, 7, 11, 14, 15)' } },
      { label: 'Sharing a prime of both', values: { n: '4', f: 'Σm(1, 3, 5, 7, 13, 15)', g: 'Σm(5, 7, 12, 13, 14, 15)' } },
      { label: 'Nothing worth sharing', values: { n: '3', f: 'Σm(1, 3, 6, 7)', g: 'Σm(2, 5, 6, 7)' } },
    ],
    run(inp) {
      const Bo = B(), n = +inp.n, F = P3.readFn(inp.f, n), G = P3.readFn(inp.g, n);
      const r = Bo.minimiseMulti({ F, G });
      const sepF = Bo.minimise(F), sepG = Bo.minimise(G);
      const gF = Bo.kmap(F), gG = Bo.kmap(G), Fm = K().frame(gF);
      const off = Fm.W + 70;
      const keyOf = (t) => Bo.cubeKey(t.cube);
      const tones = new Map();
      const toneOf = (t) => { const k = keyOf(t); if (!tones.has(k)) tones.set(k, tones.size % 6); return tones.get(k); };
      const both = [];
      for (let m = 0; m < 1 << n; m++) if (F.ones.has(m) && G.ones.has(m)) both.push(m);
      const scene = (gf, gg, o) => {
        o = o || {};
        const a = K().draw({ geometry: gF, prefix: 'kf', x: 0, y: 0, groups: gf.map((t) => ({ key: keyOf(t), cells: t.minterms, tone: toneOf(t), cls: o.strong ? 'strong' : '' })), hot: o.hot });
        const b = K().draw({ geometry: gG, prefix: 'kg', x: off, y: 0, groups: gg.map((t) => ({ key: keyOf(t), cells: t.minterms, tone: toneOf(t), cls: o.strong ? 'strong' : '' })), hot: o.hot });
        const cx = Fm.x0 + (Fm.W - Fm.x0) / 2;
        const items = a.items.concat(b.items, [
          { key: 'cap:f', kind: 'text', x: cx, y: -30, text: 'F', anchor: 'middle', cls: 'big' },
          { key: 'cap:g', kind: 'text', x: off + cx, y: -30, text: 'G', anchor: 'middle', cls: 'big' },
        ]);
        if (o.rows) {
          const shared = new Set(o.shared || []);
          const rowF = K().chips('fxf', gf.map((t) => ({ key: keyOf(t), text: t.text, tone: toneOf(t), src: a.pieces(keyOf(t))[0], cls: shared.has(keyOf(t)) ? 'ess' : '' })), cx, Fm.H + 26, { lead: 'F =', size: 15 });
          const rowG = K().chips('fxg', gg.map((t) => ({ key: keyOf(t), text: t.text, tone: toneOf(t), src: b.pieces(keyOf(t))[0], cls: shared.has(keyOf(t)) ? 'ess' : '' })), off + cx, Fm.H + 26, { lead: 'G =', size: 15 });
          items.push(...rowF.items, ...rowG.items);
        }
        return items;
      };
      const frames = [];
      frames.push({ items: scene([], []), say: 'Two outputs of the same ' + n + ' inputs: F = ' + Bo.sigma(F) + ' and G = ' + Bo.sigma(G) + '. Each product term is an AND gate; a term both outputs use needs only one gate.' });
      frames.push({ items: scene(sepF.cover, sepG.cover, { rows: true }), say: 'Minimised one at a time: F = ' + sepF.text + ' and G = ' + sepG.text + ', ' + P3.plural(r.separate.terms, 'different product term') + ' in all.', meta: { kind: 'separate', sep: r.separate.terms } });
      frames.push({ items: scene([], [], { hot: both }), say: 'Where are both outputs 1? At ' + P3.list(both) + ' (lit in both maps): F·G. A group of those cells could serve both outputs at once.' + (both.length ? '' : ' Nowhere, so nothing can be shared.'), meta: { kind: 'both', together: r.cost.terms } });
      const sharedKeys = r.shared.map((u) => keyOf(u.term));
      frames.push({ items: scene(r.outputs.F.terms, r.outputs.G.terms, { rows: true, strong: true, shared: sharedKeys }), say: 'Minimised together: F = ' + r.outputs.F.text + ', G = ' + r.outputs.G.text + '. ' + (r.shared.length ? r.shared.map((u) => u.term.text + ' feeds ' + u.used.join(' and ')).join('; ') + '. ' : 'No term is shared. ') + P3.plural(r.cost.terms, 'distinct term') + ' instead of ' + r.separate.terms + '.', meta: { kind: 'together' } });
      const notPrime = r.shared.filter((u) => !sepF.primes.some((p) => keyOf(p) === keyOf(u.term)) || !sepG.primes.some((p) => keyOf(p) === keyOf(u.term)));
      if (notPrime.length) frames.push({ items: scene(r.outputs.F.terms, r.outputs.G.terms, { rows: true, strong: true, shared: sharedKeys }), say: notPrime[0].term.text + ' is not a prime implicant of ' + (sepF.primes.some((p) => keyOf(p) === keyOf(notPrime[0].term)) ? 'G' : 'F') + ' alone: on that map it could grow. It stays small because the same gate must also suit the other output.' });
      // the gates: one AND gate per distinct term, wired to the OR gate of every output that uses it
      const mapsH = Fm.H + 74, rank = (u) => (u.used.length > 1 ? 1 : u.used[0] === 'F' ? 0 : 2), used = r.terms.slice().sort((a, b) => rank(a) - rank(b));
      const cw = used.map((u) => K().chipWidth(u.term.text, 15)), gap = 26, rowW = cw.reduce((x, y) => x + y, 0) + gap * (used.length - 1);
      const midX = (off + Fm.W) / 2;
      let gx = midX - rowW / 2;
      const gates = [];
      used.forEach((u, i) => {
        const k = keyOf(u.term);
        gates.push(K().chip('and:' + k, u.term.text, gx, mapsH + 20, { tone: toneOf(u.term), size: 15, cls: u.used.length > 1 ? 'ess' : '' }));
        gx += cw[i] + gap;
      });
      const orY = mapsH + 150;
      const ors = ['F', 'G'].map((nm, i) => ({ key: 'or:' + nm, kind: 'state', x: midX + (i ? 1 : -1) * Math.max(90, rowW / 4), y: orY, w: 64, h: 44, rx: 22, text: nm, cls: 'gnode' }));
      // 'OR' under each gate, as free text so that it is drawn as large as the rest of the picture's labels
      ors.push(...ors.map((o) => ({ key: o.key + ':sub', kind: 'text', x: o.x, y: orY + 40, text: 'OR', anchor: 'middle', cls: 'st-subtext', size: 13 })));
      const wires = [];
      used.forEach((u) => u.used.forEach((nm) => wires.push({ key: 'w:' + keyOf(u.term) + nm, kind: 'edge', from: 'and:' + keyOf(u.term), to: 'or:' + nm, cls: u.used.length > 1 ? 'hot' : '', audit: 'edge-x' })));
      gates.unshift({ key: 'and:cap', kind: 'text', x: midX - rowW / 2 - 14, y: mapsH + 43, text: 'AND', anchor: 'end', cls: 'title' });
      const cItems = scene(r.outputs.F.terms, r.outputs.G.terms, { rows: true, strong: true, shared: sharedKeys }).concat(gates, ors, wires);
      frames.push({ items: cItems, say: 'As gates: ' + P3.plural(used.filter((u) => u.term.lits > 1).length, 'AND gate') + (used.some((u) => u.term.lits === 1) ? ' (a one-literal term is a wire, not a gate)' : '') + ' feeding the two OR gates; ' + r.cost.gateInputs + ' gate inputs in all. ' + (r.shared.length ? 'The lit wires come from a shared term: one AND gate drives both outputs.' : 'Every AND gate drives one output.'), mark: 'gates', meta: { kind: 'circuit' } });
      return { frames, def: { sections: [{ id: 'f', kind: 'math', title: 'Two outputs', text: 'F = ' + Bo.sigma(F) + '\nG = ' + Bo.sigma(G) + '\nSeparately: ' + sepF.text + ' ; ' + sepG.text + '\nTogether:   ' + r.outputs.F.text + ' ; ' + r.outputs.G.text }] } };
    },
    predict: [
      { at: (f) => f.meta && f.meta.kind === 'both', pick: 'option', ask: 'How many distinct product terms will the shared solution need?', options: (fr, i) => [...new Set([fr[i].meta.together - 1, fr[i].meta.together, fr[i].meta.together + 1, fr[i].meta.together + 2])].filter((x) => x > 0).map(String), answer: (fr, i) => String(fr[i].meta.together), explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'Why can a shared product term save hardware?', options: ['It removes an OR gate', 'One AND gate can feed several OR gates', 'It removes an input', 'It shortens the wires'], answer: 1, why: 'The same product is computed once and fanned out.' },
      { q: 'Must a shared term be a prime implicant of each output?', options: ['Yes', 'No: it may be smaller than a prime of one output', 'Only for POS', 'Only with don\'t-cares'], answer: 1, why: 'A prime of the product F·G can be cheaper overall even when it is not prime for F alone.' },
      { q: 'Where can a term shared by F and G lie on the maps?', options: ['Only where F is 1', 'Only where G is 1', 'Only where both are 1 (or don\'t-care)', 'Anywhere'], answer: 2, why: 'It must not cover a 0 of either output.' },
      { q: 'Minimising each output separately always gives the fewest total gates.', options: ['True', 'False'], answer: 1, why: 'Separate minimisation ignores sharing; together can be cheaper.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Map-entered variables
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'kmap-mev', family: 'p3-big', order: 40, title: 'Map-entered variables',
    blurb: 'Fold the last variable into the cells: each cell of a smaller map covers a pair of rows and holds 0, 1, D or D\'. Group the 1s first, then the cells holding D (with the 1s as don\'t-cares) and AND the result with D. A 4-variable function fits a 3-variable map.',
    inputs: [{ id: 'f', kind: 'text', label: 'Function of A, B, C, D', def: 'Σm(1, 3, 4, 5, 9, 10, 11, 14)', check: P3.fnCheck(4) }],
    presets: [
      { label: 'D and D\' entries', values: { f: 'Σm(1, 3, 4, 5, 9, 10, 11, 14)' } },
      { label: 'Only D entries', values: { f: 'Σm(1, 3, 6, 7, 9, 11, 13)' } },
      { label: 'With a don\'t-care', values: { f: 'Σm(0, 1, 5, 6, 12, 13) + d(7, 14)' } },
    ],
    run(inp) {
      const Bo = B(), fn = P3.readFn(inp.f, 4), r = Bo.mevMinimise(fn, { entered: 1 });
      const mp = r.map, g4 = Bo.kmap(fn), g3 = mp.geometry;
      const F4 = K().frame(g4), off = F4.W + 90;
      const full = K().draw({ geometry: g4, prefix: 'k4', x: 0, y: 0 });
      const faded = full.items.map((it) => Object.assign({}, it, { dim: true }));
      const text3 = (m) => mp.cells[m].text;
      const map3 = (o) => K().draw(Object.assign({ geometry: g3, prefix: 'k3', x: off, y: 0, text: text3, cell: 62 }, o || {}));
      const F3 = K().frame(g3, { cell: 62 });
      const cx3 = off + F3.x0 + (F3.W - F3.x0) / 2;
      const frames = [];
      frames.push({ items: full.items, say: 'F = ' + Bo.sigma(fn) + ' on a 4-variable map. Rows 2m and 2m + 1 of the table differ only in D, the last variable: fold each such pair into one cell.' });
      // fold: each 3-variable cell grows out of its two cells
      const m3 = map3();
      const fold = m3.items.map((it) => { const mm = /^k3:c:(\d+)$/.exec(it.key); return mm ? Object.assign({}, it, { enter: 'from', src: ['k4:c:' + (2 * +mm[1]), 'k4:c:' + (2 * +mm[1] + 1)] }) : it; });
      const ask = mp.cells.find((c) => typeof c.entry === 'object') || mp.cells[0];
      frames.push({ items: full.items.concat(fold), say: 'The map of A, B, C: each cell holds what F does with D. ' + mp.cells.map((c) => 'Cell ' + c.m + ' (rows ' + 2 * c.m + ', ' + (2 * c.m + 1) + '): ' + c.text).join('; ') + '.', meta: { kind: 'fold', ask: { m: ask.m, a: Bo.value(fn, 2 * ask.m), b: Bo.value(fn, 2 * ask.m + 1), text: ask.text } } });
      const tr = r.trace;
      const ones = mp.cells.filter((c) => c.entry === 1).map((c) => c.m), dcs = mp.cells.filter((c) => c.entry === 'X').map((c) => c.m);
      const terms = [];
      let tone = 0;
      const step1 = tr.find((t) => t.kind === 'mev-ones');
      const g1 = ones.length ? Bo.minimise(Bo.fromMinterms(mp.mapVars, ones, dcs)).cover.map((p) => ({ key: 'o' + p.str, cells: p.minterms, tone: tone++ % 6, cls: 'strong' })) : [];
      const m3a = map3({ groups: g1 });
      frames.push({ items: faded.concat(m3a.items, [P3.note('step', 'Step 1: the 1s (entered cells as 0)', cx3, F3.H + 30, 'title')]), say: step1.say, meta: { kind: 'ones' } });
      if (ones.length) terms.push(step1.text);
      for (const t of tr.filter((x) => x.kind === 'mev-entry')) {
        const gs = Bo.minimise(Bo.fromMinterms(mp.mapVars, t.cells, ones.concat(dcs))).cover.map((p) => ({ key: 'e' + t.entry + p.str, cells: p.minterms, tone: tone++ % 6, cls: 'strong' }));
        const mm = map3({ groups: gs, hot: t.cells });
        terms.push('(' + t.text + ')·' + t.entry);
        frames.push({ items: faded.concat(mm.items, [P3.note('step', 'Cells holding ' + t.entry + ' (1s may join)', cx3, F3.H + 30, 'title')]), say: t.say, meta: { kind: 'entry' } });
      }
      const done = tr.find((t) => t.kind === 'mev-done');
      const check = Bo.minimise(fn);
      frames.push({ items: map3().items.concat(full.items, [P3.note('res', 'F = ' + done.text, (off + F3.W) / 2, Math.max(F3.H, F4.H) + 34, 'mono')]), say: done.say + ' The full 4-variable map gives ' + check.text + ' (' + P3.plural(check.cost.literals, 'literal') + '); ' + (Bo.prove(r.expr, check.expr).equal ? 'the two are equal' : 'they differ') + ', and the entered map needed only 8 cells.', mark: 'result', meta: { kind: 'done' } });
      return { frames, def: { sections: [{ id: 'f', kind: 'math', title: 'Entries', text: 'F(A,B,C,0) F(A,B,C,1) → entry\n0 0 → 0     1 1 → 1\n0 1 → D     1 0 → D\'' }] } };
    },
    predict: [
      { at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.kind === 'fold', pick: 'option', ask: (fr, i) => { const q = fr[i + 1].meta.ask; return 'Rows ' + 2 * q.m + ' and ' + (2 * q.m + 1) + ' have F = ' + q.a + ' and F = ' + q.b + '. What goes in cell ' + q.m + ' of the folded map?'; }, options: (fr, i) => [...new Set(['0', '1', 'D', "D'", 'X', fr[i + 1].meta.ask.text])], answer: (fr, i) => fr[i + 1].meta.ask.text, explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'A pair of rows with F = 0 for D = 0 and F = 1 for D = 1 gives which entry?', options: ['0', '1', 'D', "D'"], answer: 2, why: 'F follows D in that pair.' },
      { q: 'When grouping the cells that hold D, the cells holding 1 are treated as…', options: ['0', 'don\'t-cares', 'D\'', 'not allowed'], answer: 1, why: 'A 1 cell is 1 for both values of D, so including it never hurts.' },
      { q: 'How many cells does a 4-variable function need with one map-entered variable?', options: ['4', '8', '16', '32'], answer: 1, why: 'The map is over three variables: 2³ = 8 cells.' },
      { q: 'Map-entered variables are most useful for…', options: ['functions with many variables that appear rarely', '2-variable functions', 'XOR only', 'POS only'], answer: 0, why: 'They shrink a big map by moving the rarely-used variables into the cells.' },
    ],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
