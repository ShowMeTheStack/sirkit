// From minimal forms to gates: what each form costs, two-level NAND-NAND and NOR-NOR by adding bubbles in pairs,
// multi-level NAND-only and NOR-only circuits by bubble pushing, AND-OR-INVERT and OR-AND-INVERT gates, and the
// Reed–Muller (XOR of products) form built by the butterfly over the output column.
(function (S) {
  'use strict';
  const B = S.Bool, K = S.Kit, N = S.Netlist, Geo = S.geom;
  const Q = () => K.qm;

  S.family({ id: 'p3-impl', part: 'minimise', order: 70, title: 'From expressions to gates', blurb: 'The same function, built several ways: two-level and multi-level, AND-OR or all NAND, AOI gates and XOR sums, and what each one costs.' });

  const fnOf = (inp) => B.parseList(inp.fn, +inp.n);
  const listCheck = (v, inp) => {
    let f;
    try { f = B.parseList(String(v), +inp.n); } catch (e) { return 'Function: ' + e.message; }
    if (!f.ones.size) return 'Function: list at least one minterm';
    if (f.ones.size + f.dc.size === 1 << f.vars.length) return 'Function: every row is 1, so F = 1 needs no gates';
    return null;
  };
  const nInput = { id: 'n', kind: 'choice', label: 'Variables', def: '3', options: [{ value: '3', label: '3 (A, B, C)' }, { value: '4', label: '4 (A, B, C, D)' }] };
  /** a schematic item of a circuit, laid out once (forced to the rails idiom when asked) */
  const sch = (key, c, x, y, o) => {
    o = o || {};
    if (o.rails) c.style = 'rails';
    const res = K.schem.layout(c);
    const it = K.schem.item(key, res, { x, y });
    if (o.env) it.values = K.schem.values(c, o.env);
    if (o.hot) it.hot = o.hot;
    return it;
  };
  const boxOf = (it) => ({ x: it.x, y: it.y, w: it.res.bounds.w, h: it.res.bounds.h });
  const pad = (b, p) => ({ x: b.x - p, y: b.y - p, w: b.w + 2 * p, h: b.h + 2 * p });
  const envOf = (m, vs) => B.env(m, vs);
  const envText = (env) => Object.keys(env).map((k) => k + ' = ' + env[k]).join(', ');
  const title = (key, x, y, text, cls) => ({ key, kind: 'text', x, y, text, cls: cls || 'strong', size: 15 });

  // ---------------------------------------------------------------------------------------------------
  // Cost comparison
  // ---------------------------------------------------------------------------------------------------
  const exprCheck = (label) => (v) => { const r = B.tryParse(String(v)); if (!r.ok) return label + ': ' + r.error.msg; if (B.vars(r.expr).length > 5) return label + ': at most 5 variables'; if (B.size(r.expr) > 30) return label + ': a shorter expression, so the circuit fits'; return null; };
  S.topic({
    id: 'cost-compare', family: 'p3-impl', order: 10, title: 'What a form costs',
    blurb: 'A minimal SOP, a minimal POS and a factored multi-level form of one function, built as circuits and weighed: literals, gates, gate inputs and levels (each level is a gate delay).',
    inputs: [
      { id: 'fn', kind: 'text', label: 'Function (any expression)', def: 'AC + AD + BC + BD + E', check: exprCheck('Function') },
      { id: 'fac', kind: 'text', label: 'Factored form', def: '(A + B)(C + D) + E', check: exprCheck('Factored form') },
    ],
    check: (inp) => { const a = B.parse(inp.fn), b = B.parse(inp.fac); const p = B.prove(a, b); if (!p.equal) return 'The factored form is not the same function: ' + p.say; const f = B.fromExpr(a); if (!f.ones.size || f.ones.size === 1 << f.vars.length) return 'The function is constant; pick one with both 0s and 1s'; return null; },
    presets: [
      { label: 'Factoring wins', values: { fn: 'AC + AD + BC + BD + E', fac: '(A + B)(C + D) + E' } },
      { label: 'POS wins', values: { fn: "A'C + A'D + B'C + B'D", fac: "(A' + B')(C + D)" } },
      { label: 'SOP wins', values: { fn: "AB + C'D", fac: "AB + C'D" } },
      { label: 'An XOR inside', values: { fn: "AB'C + AB'D + A'BC + A'BD", fac: '(A ⊕ B)(C + D)' } },
      { label: 'Fewer gates, more levels', values: { fn: 'AC + AD + BC + BD + E', fac: '(A + B)(C + D) + E' } },
    ],
    counters: [{ id: 'built', label: 'circuits built' }],
    run(inp) {
      const e = B.parse(inp.fn), f = B.fromExpr(e);
      const sop = B.implement(f, 'and-or', { name: 'F' }), pos = B.implement(f, 'or-and', { name: 'F' }), ml = B.implement(B.parse(inp.fac), 'multi', { name: 'F' });
      const forms = [
        { id: 'sop', label: 'SOP', cls: 's0', im: sop, text: sop.minimal.text, cost: B.cost(sop.minimal.expr) },
        { id: 'pos', label: 'POS', cls: 's1', im: pos, text: pos.minimal.text, cost: B.cost(pos.minimal.expr) },
        { id: 'ml', label: 'Factored', cls: 's2', im: ml, text: B.toString(B.parse(inp.fac)), cost: B.cost(B.parse(inp.fac)) },
      ];
      const items = forms.map((fm) => sch('c:' + fm.id, fm.im.circuit, 0, 40, { rails: fm.id !== 'ml' }));
      const cw = Math.max(...items.map((it) => it.res.bounds.w)), chh = Math.max(...items.map((it) => it.res.bounds.h));
      const metrics = [{ id: 'literals', label: 'Literals' }, { id: 'gateInputs', label: 'Gate inputs' }, { id: 'gates', label: 'Gates' }, { id: 'levels', label: 'Levels (delay)' }];
      const maxV = Math.max(...forms.flatMap((fm) => metrics.map((m) => fm.cost[m.id])));
      const unit = Math.min(26, 240 / maxV);
      const bx = cw + 70;
      const series = forms.map((fm) => ({ id: fm.id, label: fm.label, cls: fm.cls, values: Object.fromEntries(metrics.map((m) => [m.id, fm.cost[m.id]])) }));
      const best = forms.slice().sort((a, b) => a.cost.gateInputs - b.cost.gateInputs || a.cost.levels - b.cost.levels)[0];
      const bars = (show, hot) => K.qm.bars({ x: bx, y: 30, metrics, series, unit, show: new Set(show), hot });
      const barBox = bars(forms.map((x) => x.id)).box;
      const F = new S.Frames(['built']);
      const say = (fm) => fm.label + ': F = ' + fm.text + '. ' + fm.cost.literals + ' literals, ' + fm.cost.gates + ' gate' + (fm.cost.gates === 1 ? '' : 's') + ' with ' + fm.cost.gateInputs + ' inputs in all, ' + fm.cost.levels + ' level' + (fm.cost.levels === 1 ? '' : 's') + ' (complemented inputs are taken as free).';
      const head = (fm) => title('h:form', 0, 18, fm.label + ':  F = ' + fm.text);
      const frame = (k, extra) => {
        const fm = forms[k];
        const it = Object.assign({}, items[k], { y: 40 });
        return { items: [head(fm), it, { key: 'frame:' + fm.id, kind: 'region', x: -10, y: 30, w: it.res.bounds.w + 20, h: it.res.bounds.h + 20, rx: 12, cls: 'form-box hot ' + fm.cls, audit: 'group' }].concat(bars(forms.slice(0, k + 1).map((x) => x.id)).items, extra || []), narrowView: pad(boxOf(it), 16) };
      };
      F.add(Object.assign(frame(0), { say: 'The function: ' + B.toString(e) + '. First its minimal sum of products, built AND-OR. ' + say(forms[0]) }));
      F.count('built');
      F.add(Object.assign(frame(1), { say: 'The minimal product of sums, built OR-AND. ' + say(forms[1]), meta: { ask: true } }));
      F.count('built');
      F.add(Object.assign(frame(2), { say: 'A factored form keeps the common parts once, at the price of more levels. ' + say(forms[2]) }));
      F.count('built');
      const ties = forms.filter((x) => x.cost.gateInputs === best.cost.gateInputs).map((x) => x.label);
      const fast = forms.slice().sort((a, b) => a.cost.levels - b.cost.levels)[0];
      const sumY = 40 + chh + 30;
      const lines = forms.map((fm, i) => ({ key: 'sum:' + fm.id, kind: 'text', x: 0, y: sumY + i * 26 - Math.max(0, chh + 30 - 0), text: fm.label + ': ' + fm.text, cls: 'mono qm-bar-name ' + fm.cls, size: 14 }));
      lines.forEach((l, i) => { l.y = 40 + i * 28; });
      F.add({ items: [title('h:form', 0, 18, 'Side by side')].concat(lines, bars(forms.map((x) => x.id), best.id).items), say: 'Fewest gate inputs: ' + ties.join(' and ') + ' (' + best.cost.gateInputs + '). Fewest levels, so the shortest delay: ' + fast.label + ' (' + fast.cost.levels + '). ' + (best.cost.levels > fast.cost.levels ? 'The cheapest circuit is not the fastest: the choice depends on what matters more.' : 'Here the cheapest circuit is also among the fastest.'), narrowView: pad({ x: bx, y: 20, w: barBox.w, h: barBox.h + 10 }, 10), meta: { best: ties }, mark: 'verdict' });
      const def = { sections: [{ id: 'f', kind: 'math', title: 'The three forms', text: forms.map((fm) => fm.label + ': ' + fm.text).concat(['', 'literals: each appearance of a variable', 'gate inputs: the wires into gates (two or more inputs)', 'levels: gates on the longest input-to-output path']).join('\n') }] };
      return { frames: F.list, def };
    },
    predict: [
      { at: (f) => f.meta && f.meta.ask, pick: 'option', ask: 'Of SOP, POS and the factored form, which needs the fewest gate inputs?', options: ['SOP', 'POS', 'Factored'], answer: (fr) => fr[fr.length - 1].meta.best, explain: (fr) => fr[fr.length - 1].say },
    ],
    quiz: [
      { q: 'A two-level AND-OR circuit has how many levels of gates (complemented inputs free)?', options: ['1', '2', '3', 'It depends on the number of terms'], answer: 1, why: 'One level of ANDs, one OR: two gate delays from any input to the output.' },
      { q: 'Factoring AC + AD + BC + BD into (A + B)(C + D) changes the literal count from…', options: ['8 to 4', '4 to 8', '8 to 8', '6 to 4'], answer: 0, why: 'Eight appearances of variables become four.' },
      { q: 'Why might a designer prefer the two-level form even when a factored one is cheaper?', options: ['It uses fewer wires', 'It has fewer levels, so less delay', 'It never has hazards', 'It needs no inverters'], answer: 1, why: 'Every extra level adds a gate delay on the longest path.' },
      { q: 'What does "gate inputs" count?', options: ['Only the circuit\'s inputs', 'Every wire entering a gate of two or more inputs', 'The number of gates', 'The number of 1s in the table'], answer: 1, why: 'It is a measure of the transistors needed: each gate input costs about the same.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // NAND-NAND and NOR-NOR
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'nand-nand', family: 'p3-impl', order: 20, title: 'NAND-NAND and NOR-NOR',
    blurb: 'Put a bubble on each AND output and another on the OR input it feeds: the pair cancels, so nothing changes, yet every gate has become a NAND. The same trick turns OR-AND into NOR-NOR.',
    inputs: [
      { id: 'fn', kind: 'text', label: 'Function', def: 'Σm(0, 2, 3, 7, 8, 10, 11, 13, 15)', check: listCheck },
      Object.assign({}, nInput, { def: '4' }),
      { id: 'form', kind: 'choice', label: 'Start from', def: 'sop', options: [{ value: 'sop', label: 'SOP → NAND-NAND' }, { value: 'pos', label: 'POS → NOR-NOR' }] },
    ],
    check: (inp) => { const f = fnOf(inp); const m = B.minimise(f, { form: inp.form }); if (m.cover.length < 2) return 'The minimal form has a single term; pick a function needing two or more'; if (m.cover.length > 4) return 'The minimal form has ' + m.cover.length + ' terms; pick one with at most 4, so the circuit stays readable'; return null; },
    presets: [
      { label: 'Three products', values: { fn: 'Σm(0, 2, 3, 7, 8, 10, 11, 13, 15)', n: '4', form: 'sop' } },
      { label: 'A single-literal term', values: { fn: 'Σm(1, 3, 5, 6, 7)', n: '3', form: 'sop' } },
      { label: 'POS to NOR-NOR', values: { fn: 'Σm(0, 2, 3, 7, 8, 10, 11, 13, 15)', n: '4', form: 'pos' } },
      { label: 'POS with a single literal', values: { fn: 'Σm(1, 3, 5, 6, 7)', n: '3', form: 'pos' } },
    ],
    counters: [{ id: 'bubbles', label: 'bubbles' }],
    run(inp) {
      const f = fnOf(inp), pos = inp.form === 'pos';
      const A = pos ? 'OR' : 'AND', O = pos ? 'AND' : 'OR', G = pos ? 'NOR' : 'NAND';
      const two = B.implement(f, pos ? 'or-and' : 'and-or'), uni = B.implement(f, pos ? 'nor-nor' : 'nand-nand');
      const c1 = two.circuit, c2 = uni.circuit;
      const it1 = sch('c1', c1, 0, 0, { rails: true }), it2 = sch('c2', c2, 0, 0, { rails: true });
      const res = it1.res;
      const firsts = c1.parts.filter((p) => p.type === A), out = c1.parts.find((p) => p.type === O);
      const outIns = out ? out.pins.filter((q) => q.dir === 'in') : [];
      const bubOut = firsts.map((p) => K.qm.bubble('b:o:' + p.id, K.qm.pin(it1, res, p, 'y')));
      const insAt = outIns.map((q) => K.qm.pin(it1, res, out, q.name)).filter(Boolean);
      const driverOf = (netId) => c1.parts.find((p) => p.net.y && p.net.y.id === netId);
      const pairs = insAt.map((at, i) => { const d = driverOf(at.net); return { at, d, paired: d && d.type === A, i }; });
      const single = pairs.filter((p) => !p.paired);
      const F = new S.Frames(['bubbles']);
      const mt = two.minimal.text;
      const head = (t) => title('h', 0, -18, t);
      F.add({ items: [head(A + '-' + O + ':  F = ' + mt), it1], say: 'The minimal ' + (pos ? 'product of sums' : 'sum of products') + ': F = ' + mt + '. Built two-level: ' + firsts.length + ' ' + A + ' gate' + (firsts.length === 1 ? '' : 's') + ' feeding one ' + O + '.' + (single.length ? ' One term is a single literal, wired straight to the ' + O + '.' : '') });
      F.count('bubbles', bubOut.length);
      F.add({ items: [head('A bubble on each ' + A + ' output'), it1].concat(bubOut.map((b) => Object.assign({}, b, { cls: 'bubble hot', enter: 'grow' }))), say: 'Put a bubble (an inversion) on the output of every ' + A + ' gate: each ' + A + ' becomes a ' + G + '. On its own that would change the function…', meta: { askG: true } });
      F.count('bubbles', pairs.length);
      const inB = pairs.map((p) => K.qm.bubble('b:i:' + p.i, p.at, { item: { cls: 'bubble ' + (p.paired ? 'pair' : 'bad'), enter: 'grow' } }));
      F.add({ items: [head('…and one on each ' + O + ' input'), it1].concat(bubOut.map((b) => Object.assign({}, b, { cls: 'bubble pair' })), inB), say: '…so put a second bubble at the other end of each line, on the ' + O + ' inputs. Two inversions on one line cancel (X\'\' = X), so the function is unchanged.' + (single.length ? ' The line from the single literal has only one bubble (red): that literal must be fed complemented, through an inverter.' : '') });
      const nots = c2.parts.filter((p) => p.type === 'NOT');
      F.add({ items: [head(G + '-' + G + ':  F = ' + uni.text), it2], say: 'An ' + A + ' with a bubbled output is a ' + G + '; an ' + O + ' with bubbled inputs is also a ' + G + ' (De Morgan). So the circuit is ' + G + '-' + G + ': F = ' + uni.text + '.' + (nots.length ? ' The inverter' + (nots.length === 1 ? '' : 's') + ' at the left make' + (nots.length === 1 ? 's' : '') + ' the complemented literals, including the single-literal term.' : ''), mark: 'converted' });
      // the two circuits agree: one row where F = 1 and one where F = 0
      const vs = f.vars;
      const m1 = B.minterms(f)[0], m0 = B.zeros(f)[0];
      const gap = 50;
      for (const m of [m1, m0].filter((x) => x !== undefined)) {
        const env = envOf(m, vs);
        const a = sch('c1', c1, 0, 0, { rails: true, env }), b = sch('c2', c2, 0, it1.res.bounds.h + gap + 20, { rails: true, env });
        const v = B.value(f, m);
        F.add({ items: [head('Both circuits at ' + envText(env)), a, b, title('l1', 0, a.res.bounds.h + 22, A + '-' + O, 'title'), title('l2', 0, b.y + b.res.bounds.h + 22, G + '-' + G, 'title')], say: 'Side by side at ' + envText(env) + ' (row ' + m + '): both give F = ' + v + '. Wires carrying 1 are lit.', narrowView: pad(boxOf(b), 14) });
      }
      const c = [two, uni].map((x) => B.cost(x.expr));
      F.add({ items: F.last().items, say: 'Same function, same shape, same number of gates (' + c[0].gates + ' against ' + c[1].gates + (nots.length ? ', counting the inverters' : '') + '). A ' + G + ' is the cheapest gate in CMOS, so this is the form usually built.', narrowView: F.last().narrowView });
      const def = { sections: [{ id: 'd', kind: 'math', title: 'Why the bubbles cancel', text: [pos ? '(X + Y)(Z + W) = ((X + Y)\' + (Z + W)\')\'' : 'XY + ZW = ((XY)\'(ZW)\')\'', 'F = ' + mt, '  = ' + uni.text].join('\n') }] };
      return { frames: F.list, def };
    },
    predict: [
      { at: (f) => f.meta && f.meta.askG, pick: 'option', ask: 'Once the bubbles are in, what gate is the second-level gate with bubbles on all its inputs?', options: ['AND', 'OR', 'NAND', 'NOR'], answer: (fr) => (/NOR-NOR/.test(fr[3].items[0].text) ? 'NOR' : 'NAND'), explain: (fr) => fr[3].say },
    ],
    quiz: [
      { q: 'An OR gate with a bubble on every input is the same as…', options: ['an AND', 'a NOR', 'a NAND', 'an XOR'], answer: 2, why: 'X\' + Y\' = (XY)\' by De Morgan: a NAND.' },
      { q: 'An AND gate with a bubble on every input is the same as…', options: ['a NOR', 'a NAND', 'an OR', 'an XNOR'], answer: 0, why: 'X\'Y\' = (X + Y)\': a NOR.' },
      { q: 'F = AB + C as NAND-NAND needs…', options: ['two NANDs only', 'two NANDs and an inverter on C', 'three NANDs and an inverter', 'a NOR'], answer: 1, why: 'C goes straight to the second level, where its input bubble has no partner: C must arrive complemented.' },
      { q: 'Which two-level form becomes NOR-NOR?', options: ['AND-OR', 'OR-AND', 'NAND-AND', 'AND-NOR'], answer: 1, why: 'Bubbles on the OR outputs and the AND inputs turn every gate into a NOR.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Bubble pushing (multi-level)
  // ---------------------------------------------------------------------------------------------------
  /** a circuit of the expression as written, one gate per AND/OR node; parts by path */
  function buildPaths(g) {
    const c = new N.Circuit('F'), gates = new Map(), srcNet = new Map();
    const ins = {}, nots = {};
    for (const v of B.vars(g)) ins[v] = c.input(v);
    const sig = (x, path) => {
      const k = path.join('.');
      if (x.op === 'var') { srcNet.set(k, ins[x.name]); return ins[x.name].pin('y'); }
      if (x.op === 'not' && x.a.op === 'var') { if (!nots[x.a.name]) { nots[x.a.name] = c.gate('NOT'); c.connect(ins[x.a.name].pin('y'), nots[x.a.name].pin('i0')); } srcNet.set(k, nots[x.a.name]); return nots[x.a.name].pin('y'); }
      if (x.op === 'const') { const p = c.constant(x.v); srcNet.set(k, p); return p.pin('y'); }
      const p = c.gate(x.op.toUpperCase(), x.args.length);
      x.args.forEach((a, i) => c.connect(sig(a, path.concat(i)), p.pin('i' + i)));
      gates.set(k, p); srcNet.set(k, p);
      return p.pin('y');
    };
    c.connect(sig(g, []), c.output('F'));
    return { c, gates, src: srcNet };
  }
  S.topic({
    id: 'bubble-push', family: 'p3-impl', order: 30, title: 'NAND-only and NOR-only by bubble pushing',
    blurb: 'Any AND-OR network, however many levels deep, becomes all NAND (or all NOR): redraw each gate in its bubbled form, let bubbles on the two ends of a line cancel, and fix the lines where they do not.',
    inputs: [
      { id: 'expr', kind: 'text', label: 'Expression', def: "(A + BC)(D + E')", check: (v) => { const r = B.tryParse(String(v)); if (!r.ok) return 'Expression: ' + r.error.msg; if (B.vars(r.expr).length > 6) return 'Expression: at most 6 variables'; if (B.cost(r.expr).gates > 7) return 'Expression: at most 7 gates, so the circuit stays readable'; if (B.cost(r.expr).gates < 1) return 'Expression: needs at least one AND or OR'; return null; } },
      { id: 'to', kind: 'choice', label: 'Gates', def: 'NAND', options: [{ value: 'NAND', label: 'NAND only' }, { value: 'NOR', label: 'NOR only' }] },
    ],
    presets: [
      { label: 'Three levels to NAND', values: { expr: "(A + BC)(D + E')", to: 'NAND' } },
      { label: 'The same to NOR', values: { expr: "(A + BC)(D + E')", to: 'NOR' } },
      { label: 'A complement pushed in first', values: { expr: "(AB + C')' + D", to: 'NAND' } },
      { label: 'A factor inside a sum', values: { expr: 'AB + C(D + E)', to: 'NAND' } },
      { label: 'AND-OR alternating: no inverters', values: { expr: 'AB + CD', to: 'NAND' } },
    ],
    counters: [{ id: 'gates', label: 'gates converted' }, { id: 'inv', label: 'inverters added' }],
    run(inp) {
      const T = inp.to, bp = B.bubblePush(B.parse(inp.expr), T);
      const start = bp.trace.find((t) => t.kind === 'bp-start').expr;
      const { c, gates, src } = buildPaths(start);
      const it = sch('c1', c, 0, 0);
      const res = it.res;
      const pk = (p) => p.join('.');
      const outNet = (k) => { const s = src.get(k); return s && s.net.y ? s.net.y.id : null; };
      const parentOf = (p) => pk(p.slice(0, -1));
      const inPin = (p) => { const par = gates.get(parentOf(p)); return K.qm.pin(it, res, par, { net: outNet(pk(p)) }); };
      const bubbles = new Map(), notes = [];
      const F = new S.Frames(['gates', 'inv']);
      const base = T === 'NAND' ? 'and' : 'or';
      const add = (k, at, cls) => { if (at) bubbles.set(k, { at, cls }); };
      const draw = (hot) => [it].concat([...bubbles].map(([k, b]) => K.qm.bubble('bb:' + k, b.at, { item: { cls: 'bubble ' + b.cls, enter: 'grow' } })), notes.map((n) => Object.assign({ kind: 'text', anchor: 'middle', cls: 'hot', size: 13 }, n)));
      const cool = () => { for (const b of bubbles.values()) if (b.cls === 'hot') b.cls = ''; };
      const hotGate = (k) => { const p = gates.get(k); const lp = p && K.qm.partOf(res, p); return lp ? [lp.id] : []; };
      for (const s of bp.trace) {
        if (s.kind === 'bp-xor' || s.kind === 'bp-demorgan') { F.add({ items: [it], say: s.say }); continue; }
        if (s.kind === 'bp-start') { F.add({ items: [it], say: s.say + ' Here is that circuit: ' + B.cost(start).gates + ' gates.' }); continue; }
        if (s.kind === 'bp-gate') {
          cool();
          const k = pk(s.path), p = gates.get(k);
          if (s.from.toLowerCase() === base) add('o:' + k, K.qm.pin(it, res, p, 'y'), 'hot');
          else p.pins.filter((q) => q.dir === 'in').forEach((q) => add('i:' + k + ':' + q.name, K.qm.pin(it, res, p, q.name), 'hot'));
          F.count('gates');
          const r = Object.assign({}, it, { hot: hotGate(k) });
          F.add({ items: [r].concat(draw().slice(1)), say: s.say, meta: { gate: s } });
          continue;
        }
        const k = s.path ? pk(s.path) : '';
        const par = s.path ? gates.get(parentOf(s.path)) : null;
        const at = s.path ? inPin(s.path) : null;
        const key = at && par ? [...bubbles.keys()].find((x) => { const b = bubbles.get(x); return Math.abs(b.at.x - at.x) < 0.5 && Math.abs(b.at.y - at.y) < 0.5; }) : null;
        cool();
        if (s.kind === 'bp-cancel') {
          if (key) bubbles.get(key).cls = 'pair';
          if (bubbles.has('o:' + k)) bubbles.get('o:' + k).cls = 'pair';
          F.add({ items: draw(), say: s.say });
        } else if (s.kind === 'bp-input') {
          if (key) bubbles.get(key).cls = 'bad';
          if (at) notes.push({ key: 'note:' + k, x: at.x - 30, y: at.y - 9, text: B.toString(s.to), anchor: 'end' });
          F.add({ items: draw(), say: s.say });
        } else if (s.kind === 'bp-inverter') {
          if (key) bubbles.get(key).cls = 'bad';
          if (bubbles.has('o:' + k)) bubbles.get('o:' + k).cls = 'bad';
          F.count('inv');
          if (at) notes.push({ key: 'note:' + k, x: at.x - 30, y: at.y - 9, text: '+ inverter', anchor: 'end' });
          F.add({ items: draw(), say: s.say });
        } else if (s.kind === 'bp-output') {
          const op = K.qm.pin(it, res, gates.get(''), 'y');
          if (bubbles.has('o:')) bubbles.get('o:').cls = 'bad';
          F.count('inv');
          if (op) notes.push({ key: 'note:out', x: op.x + 24, y: op.y - 12, text: '+ inverter' });
          F.add({ items: draw(), say: s.say });
        } else if (s.kind === 'bp-done') {
          const fin = bp.circuit('F', 'F');
          const it2 = sch('c2', fin, 0, 0);
          F.add({ items: [it2], say: s.say + ' F = ' + bp.text + '.', mark: 'done', meta: { done: true } });
          const env = envOf(B.minterms(B.fromExpr(B.parse(inp.expr)))[0] || 0, B.vars(B.parse(inp.expr)));
          const e2 = Object.assign({}, it2, { values: K.schem.values(fin, Object.assign({}, env)) });
          F.add({ items: [e2], say: 'Checked at ' + envText(env) + ': F = ' + B.evaluate(B.parse(inp.expr), env) + ', as the original expression gives. Every gate is a ' + T + '; an inverter is a ' + T + ' with its inputs tied together.' });
        }
      }
      const def = { sections: [{ id: 'e', kind: 'math', title: 'The expression', text: ['F = ' + inp.expr, 'pushed: ' + B.toString(start), T + ' only: ' + bp.text].join('\n') }] };
      return { frames: F.list, def };
    },
    predict: [
      { at: (f, i, fr) => f.meta && f.meta.gate && fr.slice(i + 1).some((x) => x.meta && x.meta.done), once: true, pick: 'option', ask: 'How many inverters will the finished circuit need?', options: ['0', '1', '2', '3', '4'], answer: (fr) => String(fr[fr.length - 1].counters.inv), explain: (fr) => fr.find((x) => x.meta && x.meta.done).say },
    ],
    quiz: [
      { q: 'In a NAND-only conversion, an OR gate is redrawn as…', options: ['an AND with an output bubble', 'an OR with bubbles on its inputs', 'two NANDs', 'an XOR'], answer: 1, why: 'A NAND equals an OR of complemented inputs (De Morgan), so the OR keeps its shape and gains input bubbles.' },
      { q: 'A line has a bubble at its source but none at its destination. What fixes it?', options: ['Nothing', 'An inverter on the line', 'Swapping the gate', 'Removing a gate'], answer: 1, why: 'One unpaired inversion changes the signal; a second one (an inverter) restores it.' },
      { q: 'An input variable meets an unpaired bubble. The cheapest fix is…', options: ['an inverter gate', 'feeding the complemented variable instead', 'a buffer', 'an extra level'], answer: 1, why: 'Complemented inputs are usually available (or one inverter serves many gates).' },
      { q: 'Why do AND and OR levels that alternate convert to NAND with no inverters?', options: ['Because NAND is universal', 'Every output bubble of an AND lands on an OR whose input bubble cancels it', 'Because there are no complements', 'They do not'], answer: 1, why: 'In NAND conversion ANDs get output bubbles and ORs get input bubbles, so an AND feeding an OR pairs up exactly.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // AOI and OAI
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'aoi-oai', family: 'p3-impl', order: 40, title: 'AND-OR-INVERT and OR-AND-INVERT',
    blurb: 'Group the 0s and you get F\' as a sum of products; build that and invert it, and the ANDs and the NOR fold into one complex gate: AND-OR-INVERT. Its mirror, OR-AND-INVERT, comes from the 1s.',
    inputs: [
      { id: 'fn', kind: 'text', label: 'Function', def: 'Σm(1, 3, 5, 6, 7)', check: listCheck },
      nInput,
      { id: 'kind', kind: 'choice', label: 'Gate', def: 'aoi', options: [{ value: 'aoi', label: 'AND-OR-INVERT (from the 0s)' }, { value: 'oai', label: 'OR-AND-INVERT (from the 1s)' }] },
    ],
    check: (inp) => { const f = fnOf(inp); const m = B.minimise(f, { form: inp.kind === 'aoi' ? 'pos' : 'sop' }); if (m.cover.length < 2) return 'The minimal form has a single term; pick a function needing two or more'; if (m.cover.length > 4) return 'Pick a function with at most 4 terms in its minimal form'; return null; },
    presets: [
      { label: 'AOI from the 0s', values: { fn: 'Σm(1, 3, 5, 6, 7)', n: '3', kind: 'aoi' } },
      { label: 'OAI from the 1s', values: { fn: 'Σm(1, 3, 5, 6, 7)', n: '3', kind: 'oai' } },
      { label: 'Four variables, AOI', values: { fn: 'Σm(0, 1, 2, 3, 4, 5, 12, 13)', n: '4', kind: 'aoi' } },
      { label: 'Four variables, OAI', values: { fn: 'Σm(0, 1, 2, 3, 4, 5, 12, 13)', n: '4', kind: 'oai' } },
    ],
    counters: [{ id: 'gates', label: 'gates' }],
    run(inp) {
      const f = fnOf(inp), aoi = inp.kind === 'aoi';
      const im = B.implement(f, aoi ? 'and-nor' : 'or-nand');
      const min = im.minimal;
      const it = sch('c1', im.circuit, 0, 0, { rails: true });
      const res = it.res;
      const inner = aoi ? 'AND' : 'OR', outer = aoi ? 'NOR' : 'NAND';
      const parts = res.parts.filter((p) => p.type === inner || p.type === outer);
      const gb = Geo.union(parts.map((p) => ({ x: it.x + p.x - res.bounds.x, y: it.y + p.y - res.bounds.y, w: p.w, h: p.h })));
      const region = { key: 'aoi', kind: 'region', x: gb.x - 12, y: gb.y - 14, w: gb.w + 24, h: gb.h + 28, rx: 14, cls: 'aoi-box', audit: 'group' };
      const lbl = { key: 'aoi:l', kind: 'text', x: gb.x + gb.w / 2, y: gb.y + gb.h + 34, text: 'one ' + (aoi ? 'AOI' : 'OAI') + ' gate', anchor: 'middle', cls: 'strong', size: 14 };
      const comp = B.complement(f);
      const fc = B.minimise(comp, { form: aoi ? 'sop' : 'pos' });
      const F = new S.Frames(['gates']);
      const head = (t) => title('h', 0, -18, t);
      F.add({ items: [head('F = ' + B.sigma(f)), it], say: (aoi ? 'Group the 0s of F: its minimal product of sums is F = ' : 'Group the 1s of F: its minimal sum of products is F = ') + min.text + '.', meta: { ask: true }, narrowView: pad(boxOf(it), 12) });
      F.add({ items: [head("F' = " + fc.text), it], say: 'Complement both sides with De Morgan, term by term: F\' = ' + fc.text + ' — a ' + (aoi ? 'sum of products' : 'product of sums') + ' of complemented literals.', narrowView: pad(boxOf(it), 12) });
      F.set('gates', B.cost(im.expr).gates);
      F.add({ items: [head('F = (' + fc.text + ")'"), it], say: 'So F = (' + fc.text + ')\': ' + (aoi ? 'AND gates for the products, then an OR, then an inversion — the OR and the inversion together are a NOR.' : 'OR gates for the sums, then an AND, then an inversion — together a NAND.') + ' ' + im.trace[1].say.replace(/F = .*$/, '').trim(), narrowView: pad(boxOf(it), 12) });
      F.add({ items: [head(aoi ? 'AND-OR-INVERT' : 'OR-AND-INVERT'), it, region, lbl], say: 'In CMOS the first level and the inverting gate are built as one complex gate, the ' + (aoi ? 'AOI' : 'OAI') + ': a single stage of transistors, so it is faster and smaller than separate gates.', mark: 'gate', narrowView: pad(Geo.union([boxOf(it), { x: lbl.x - 50, y: lbl.y, w: 100, h: 10 }]), 12) });
      const nn = B.implement(f, aoi ? 'nor-nor' : 'nand-nand');
      const it2 = sch('c2', nn.circuit, it.res.bounds.w + 60, 0, { rails: true });
      const c1 = B.cost(im.expr), c2 = B.cost(nn.expr);
      F.add({ items: [head('Against ' + (aoi ? 'NOR-NOR' : 'NAND-NAND')), it, region, lbl, it2, title('l2', it2.x, it2.res.bounds.h + 26, (aoi ? 'NOR-NOR' : 'NAND-NAND') + ': ' + c2.gates + ' gates', 'title')], say: 'The same F as ' + (aoi ? 'NOR-NOR' : 'NAND-NAND') + ' (' + nn.text + ') takes ' + c2.gates + ' gates in ' + c2.levels + ' levels; the ' + (aoi ? 'AOI' : 'OAI') + ' form is ' + c1.gates + ' gates drawn, but one complex gate built.', narrowView: pad(boxOf(it2), 12) });
      const def = { sections: [{ id: 'd', kind: 'math', title: 'The steps', text: ['F = ' + min.text, "F' = " + fc.text, "F = (" + fc.text + ")'"].join('\n') }] };
      return { frames: F.list, def };
    },
    predict: [
      { at: (f) => f.meta && f.meta.ask, pick: 'option', ask: 'Which kind of expression will F\' be?', options: ['A sum of products', 'A product of sums', 'An XOR of products', 'A single literal'], answer: (fr, i, inp) => (inp.kind === 'aoi' ? 'A sum of products' : 'A product of sums'), explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'An AOI gate computes…', options: ['(AB + CD)\'', 'AB + CD', '(A + B)(C + D)', '((A + B)(C + D))\''], answer: 0, why: 'AND, then OR, then invert.' },
      { q: 'To use an AOI gate for F, start from…', options: ['the groups of 1s of F', 'the groups of 0s of F, which give F\' as a sum of products', 'the Reed–Muller form', 'the truth table of F\'\''], answer: 1, why: 'An AOI produces the complement of a sum of products, so that sum of products must be F\'.' },
      { q: 'Why is an AOI gate attractive in CMOS?', options: ['It needs no power', 'It is one stage of transistors, smaller and faster than an AND-OR plus an inverter', 'It has no inputs', 'It removes hazards'], answer: 1, why: 'Inverting gates are the natural CMOS gates; the AOI merges two levels into one stage.' },
      { q: 'An OAI gate computes…', options: ['(A + B)(C + D)', '((A + B)(C + D))\'', 'AB + CD', '(AB)\' + (CD)\''], answer: 1, why: 'OR, then AND, then invert.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Reed–Muller
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'reed-muller', family: 'p3-impl', order: 50, title: 'The Reed–Muller form',
    blurb: 'Every function is also an XOR of AND terms with no complements. A butterfly over the output column finds them: one stage per variable, each XORing a row into its partner. The 1s left mark the products.',
    inputs: [
      { id: 'fn', kind: 'text', label: 'Function', def: 'Σm(1, 2, 4, 7)', check: listCheck },
      nInput,
      { id: 'pol', kind: 'text', label: 'Complemented variables (optional)', def: '', check: (v, inp) => { const vs = B.nameVars(+inp.n); const bad = [...String(v).replace(/[\s,]+/g, '')].find((c) => !vs.includes(c)); return bad ? 'Complemented variables: ' + bad + ' is not one of ' + vs.join(', ') : null; } },
    ],
    presets: [
      { label: 'Odd parity: pure XOR', values: { fn: 'Σm(1, 2, 4, 7)', n: '3', pol: '' } },
      { label: 'An OR becomes XORs', values: { fn: 'Σm(2, 3, 4, 5, 6, 7)', n: '3', pol: '' } },
      { label: 'Majority', values: { fn: 'Σm(3, 5, 6, 7)', n: '3', pol: '' } },
      { label: 'A complemented variable helps', values: { fn: 'Σm(0, 1, 2, 3, 4, 6)', n: '3', pol: 'C' } },
      { label: 'Four variables', values: { fn: 'Σm(3, 5, 6, 9, 10, 12, 15)', n: '4', pol: '' } },
    ],
    counters: [{ id: 'stage', label: 'stages' }, { id: 'terms', label: 'products' }],
    run(inp) {
      const f = fnOf(inp), vs = f.vars, n = vs.length, NR = 1 << n;
      const comp = [...String(inp.pol || '').replace(/[\s,]+/g, '')];
      const pol = vs.map((v) => (comp.includes(v) ? 1 : 0));
      const rm = B.reedMuller(f, { polarity: pol });
      const cols = rm.trace.filter((t) => t.values).map((t) => t.values);
      const RH = n === 4 ? 32 : 40, CW = 44, GAP = n === 4 ? 116 : 130, LW = 70;
      const xOf = (k) => LW + 20 + k * (CW + GAP), yOf = (m) => 46 + m * RH;
      const lit = (i) => vs[i] + (pol[i] ? "'" : '');
      const mono = (m) => { const ls = []; for (let i = 0; i < n; i++) if (m & (1 << (n - 1 - i))) ls.push(lit(i)); return ls.length ? ls.join('') : '1'; };
      const F = new S.Frames(['stage', 'terms']);
      const scene = (upto, active) => {
        const items = [];
        for (let m = 0; m < NR; m++) items.push({ key: 'rl:' + m, kind: 'cell', x: 0, y: yOf(m), w: LW, h: RH - 6, rx: 6, text: B.bits(m, n), sub: '', cls: 'head mono', size: 14 });
        items.push({ key: 'rh', kind: 'text', x: LW / 2, y: 26, text: vs.map((v, i) => lit(i)).join(''), anchor: 'middle', cls: 'title' });
        for (let k = 0; k <= upto; k++) {
          items.push({ key: 'ch:' + k, kind: 'text', x: xOf(k) + CW / 2, y: 26, text: k === 0 ? 'F' : 'after ' + lit(k - 1), anchor: 'middle', cls: 'title' });
          for (let m = 0; m < NR; m++) {
            const v = cols[k][m], flip = k > 0 && k === active && v !== cols[k - 1][m];
            items.push({ key: 'c:' + k + ':' + m, kind: 'cell', x: xOf(k), y: yOf(m), w: CW, h: RH - 6, rx: 6, text: String(v), cls: 'mono rm-bit v' + v + (flip ? ' flip' : ''), size: 16, enter: k ? 'from' : 'fade', src: k ? 'c:' + (k - 1) + ':' + m : undefined });
          }
          if (k === 0) continue;
          const b = 1 << (n - k);
          for (let m = 0; m < NR; m++) {
            items.push({ key: 'p:' + k + ':' + m, kind: 'line', x1: xOf(k - 1) + CW, y1: yOf(m) + (RH - 6) / 2, x2: xOf(k), y2: yOf(m) + (RH - 6) / 2, cls: 'rm-pass', audit: 'ignore', layer: 'back' });
            if (m & b) items.push({ key: 'x:' + k + ':' + m, kind: 'edge', from: 'c:' + (k - 1) + ':' + (m ^ b), to: 'c:' + k + ':' + m, cls: 'rm-link' + (k === active ? '' : ' dim'), audit: 'ignore', layer: 'lines', gapB: 1 });
          }
        }
        return items;
      };
      F.add({ items: scene(0), say: rm.trace[0].say + ' Row by row, F as a column of ' + NR + ' bits.' });
      for (let k = 1; k <= n; k++) {
        F.count('stage');
        F.add({ items: scene(k, k), say: rm.trace[k].say + ' (Each arrow carries the ' + lit(k - 1) + ' = 0 row\'s value into its partner; lit cells changed.)', meta: { stage: k }, narrowView: { x: xOf(k - 1) - 10, y: 0, w: CW * 2 + GAP + 20 + LW, h: yOf(NR) + 10 } });
      }
      const last = cols[n];
      const ones = []; for (let m = 0; m < NR; m++) if (last[m]) ones.push(m);
      F.set('terms', ones.length);
      const fx = xOf(n) + CW + 30;
      const marks = ones.map((m) => ({ key: 'mono:' + m, kind: 'cell', x: fx, y: yOf(m), w: Math.max(46, Geo.textWidth(mono(m), 15, { bold: true }) + 20), h: RH - 6, rx: (RH - 6) / 2, text: mono(m), cls: 'chip good', size: 15, enter: 'from', src: 'c:' + n + ':' + m }));
      const ey = yOf(NR) + 26;
      F.add({ items: scene(n, -1).concat(marks, [{ key: 'expr', kind: 'text', x: 0, y: ey, text: 'F = ' + rm.text, cls: 'big mono' }]), say: rm.trace[rm.trace.length - 1].say + ' Row ' + B.bits(ones[0] || 0, n) + ' stands for the product of the variables that are 1 in it' + (ones.includes(0) ? '; row 0 is the constant 1' : '') + '.', mark: 'form' });
      const ch = B.minimise(f);
      F.add({ items: F.last().items, say: 'Compare the minimal SOP, F = ' + ch.text + ' (' + ch.cost.literals + ' literals). The XOR form uses ' + rm.terms.length + ' product' + (rm.terms.length === 1 ? '' : 's') + ': good for parity-like functions, where SOP is at its worst.' });
      const def = { sections: [{ id: 'r', kind: 'math', title: 'The form', text: ['F = ' + B.sigma(f), 'F = ' + rm.text, '', 'X ⊕ X = 0 and X ⊕ 0 = X,', 'so each product appears at most once'].join('\n') }] };
      return { frames: F.list, def };
    },
    predict: [
      { at: (f, i, fr) => fr[i + 1] && fr[i + 1].counters && fr[i + 1].counters.terms && !(f.counters && f.counters.terms), pick: 'option', ask: 'Each 1 in the last column is one product. How many products will F have?', options: (fr, i) => { const k = fr[i + 1].counters.terms; return [...new Set([1, 2, 3, 4, 5, k])].sort((a, b) => a - b).map(String); }, answer: (fr, i) => String(fr[i + 1].counters.terms), explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'A + B in Reed–Muller form is…', options: ['A ⊕ B', 'A ⊕ B ⊕ AB', 'AB', '1 ⊕ A ⊕ B'], answer: 1, why: 'A ⊕ B ⊕ AB is 1 for 01, 10 and 11 (for 11: 1 ⊕ 1 ⊕ 1 = 1).' },
      { q: 'What is A ⊕ A?', options: ['A', '1', '0', 'A\''], answer: 2, why: 'A value XORed with itself always gives 0, so a product never needs to appear twice.' },
      { q: 'Which functions have the shortest Reed–Muller forms compared with SOP?', options: ['ANDs', 'Parity (odd and even) functions', 'Constants', 'ORs'], answer: 1, why: 'n-input parity is n single-literal products XORed, while its SOP needs 2^(n−1) full minterms.' },
      { q: 'In positive polarity, which literal never appears?', options: ['Uncomplemented variables', 'Complemented variables', 'The constant 1', 'Products of two variables'], answer: 1, why: 'Positive-polarity Reed–Muller uses only plain variables (and the constant 1).' },
    ],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
