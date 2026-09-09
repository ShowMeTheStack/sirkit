// Part 11, switch-level CMOS: the inverter, NAND and NOR with the conducting switches and the path that sets the
// output lit for every input; complex gates whose pull-down is read off the expression (AND in series, OR in
// parallel) and whose pull-up is its dual; networks that are not complementary, which float or short; and
// transmission gates, the transmission-gate multiplexer and the tristate inverter.
(function (S) {
  'use strict';
  // the engine writes a lone switch as "for A: A."; say it is a single transistor
  const oneSwitch = (say) => say.replace(/ for (\w+): \1\./, ' for $1: a single transistor on $1.');
  const C = () => S.Cmos, KC = () => S.Kit.cmos, K = () => S.Kit;
  const P11 = (S.P11 = S.P11 || {});

  S.family({ id: 'p11-cmos', part: 'ics', order: 30, title: 'Switch-level CMOS', blurb: 'Gates built from nMOS and pMOS switches: watch which ones conduct, which path sets the output, and what goes wrong when the networks are not complementary.' });

  /** all input assignments of a network, in counting order */
  P11.combos = (net) => Array.from({ length: 1 << net.inputs.length }, (_, m) => Object.fromEntries(net.inputs.map((x, i) => [x, (m >> (net.inputs.length - 1 - i)) & 1])));
  const bits = (inp, net) => net.inputs.map((x) => inp[x]).join('');
  /** the input badges in a row: "A = 1" cells coloured by value */
  P11.badges = function (net, inp, x, y, extra) {
    let xx = x;
    const items = [];
    for (const n of net.inputs) {
      const t = n + ' = ' + inp[n], w = S.geom.textWidth(t, 15, { mono: true }) + 22;
      items.push({ key: 'in:' + n, kind: 'cell', x: xx, y, w, h: 32, rx: 8, text: t, size: 15, cls: 'in-badge v' + inp[n] });
      xx += w + 12;
    }
    for (const e of extra || []) {
      const w = S.geom.textWidth(e.text, 15, { mono: true }) + 22;
      items.push({ key: 'in:' + e.key, kind: 'cell', x: xx + 18, y, w, h: 32, rx: 8, text: e.text, size: 15, cls: 'in-badge ' + (e.cls || '') });
      xx += w + 30;
    }
    return items;
  };
  /** the truth table of a network so far: rows of inputs and the output, values Z and X shown as such */
  P11.truth = function (net, rows, x, y, hot, outs) {
    outs = outs || net.outputs;
    const show = (v) => (v === undefined ? '' : String(v));
    return K().table.draw({
      x, y, prefix: 'tt', colHead: net.inputs.concat(outs.map((o) => KC().nodeName(o))), mono: true, size: 15, minW: 40, minH: 32, ch: 32, maxRows: net.inputs.length > 3 ? 9 : undefined, focus: hot === undefined || hot === null ? undefined : [hot, 0],
      rows: P11.combos(net).map((inp, m) => net.inputs.map((n) => String(inp[n])).concat(outs.map((o) => ({ text: rows[m] ? show(rows[m][o]) : '', cls: rows[m] && rows[m][o] === 'Z' ? 'zval' : rows[m] && rows[m][o] === 'X' ? 'xval' : '' })))),
      hot: hot === undefined || hot === null ? [] : net.inputs.concat(outs).map((_, c) => [hot, c]),
    });
  };
  /** narration of one evaluation: the conducting switches and what decides the output */
  P11.say = function (net, st, inp, outs) {
    const on = net.transistors.filter((t) => st.conducts[t.id] === true).map((t) => t.id);
    const parts = (outs || net.outputs).map((o) => {
      const nv = st.nodes[o], p = st.ev.paths[o] || {};
      if (nv.s === 'conflict') return o + ' is joined to VDD and to GND at once: a conflict (X), and a short from the supply to ground.';
      if (nv.v === 'Z') return o + ' is joined to neither VDD nor GND: it floats (Z).';
      if (nv.s === 'charged' && nv.v === 'X') return o + ' is cut off from both, and now shares its charge with an inner node that held the other value: it is left somewhere in between (X).';
      if (nv.s === 'charged') return o + ' is cut off from both; the charge on it still holds ' + nv.v + ', for now.';
      const via = st.litBy && st.litBy[o] && st.litBy[o].size ? [...st.litBy[o]] : (nv.v === 1 ? p.vdd : p.gnd) || [];
      return o + ' = ' + nv.v + (via.length ? ' through ' + via.join(', ') : '') + '.';
    });
    return net.inputs.map((n) => n + ' = ' + inp[n]).join(', ') + ': ' + (on.length ? on.join(', ') + ' conduct' + (on.length === 1 ? 's' : '') : 'nothing conducts') + '. ' + parts.join(' ');
  };

  // ---------------------------------------------------------------------------------------------------------
  // Inverter, NAND, NOR
  // ---------------------------------------------------------------------------------------------------------
  const basic = {
    inverter: { label: 'Inverter', make: () => C().cells.inverter() },
    nand2: { label: 'NAND, 2 inputs', make: () => C().cells.nand(2) },
    nor2: { label: 'NOR, 2 inputs', make: () => C().cells.nor(2) },
    nand3: { label: 'NAND, 3 inputs', make: () => C().cells.nand(3) },
    nor3: { label: 'NOR, 3 inputs', make: () => C().cells.nor(3) },
  };
  S.topic({
    id: 'cmos-gates', family: 'p11-cmos', order: 10, title: 'The CMOS inverter, NAND and NOR',
    blurb: 'An nMOS switch conducts when its gate is 1, a pMOS switch when its gate is 0. Put nMOS switches between the output and ground and pMOS between the supply and the output, and for every input exactly one side conducts. Watch the path light up for each input.',
    inputs: [{ id: 'cell', kind: 'choice', label: 'Gate', def: 'nand2', options: Object.entries(basic).map(([value, b]) => ({ value, label: b.label })) }],
    presets: Object.entries(basic).map(([value, b]) => ({ label: b.label, values: { cell: value } })),
    counters: [{ id: 'on', label: 'switches on' }],
    run(inp) {
      const cell = basic[inp.cell].make(), net = cell.net, L = KC().layout(net);
      const tx = L.w + 70, rows = [];
      const F = new S.Frames(['on']);
      const pic = (st, inpv, hot, mark) => KC().draw(L, st, { mark }).items.concat(inpv ? P11.badges(net, inpv, 0, -56) : [], P11.truth(net, rows, tx, 0, hot).items);
      const down = net.transistors.filter((t) => t.type === 'n').map((t) => t.id), up = net.transistors.filter((t) => t.type === 'p').map((t) => t.id);
      F.add({ items: pic(null, null, null), say: cell.net.name[0].toUpperCase() + cell.net.name.slice(1) + ': ' + net.transistors.length + ' transistors. ' + cell.trace.map((t) => oneSwitch(t.say)).join(' ') });
      F.add({ items: pic(null, null, null, Object.fromEntries(up.map((id) => [id, 'faded']))), say: 'The pull-down network: ' + down.join(', ') + ' (nMOS). ' + (down.length > 1 ? (inp.cell.startsWith('nand') ? 'In series: Y is pulled to GND only when every input is 1.' : 'In parallel: any input at 1 pulls Y to GND.') : 'One switch: Y is pulled down when A = 1.') });
      F.add({ items: pic(null, null, null, Object.fromEntries(down.map((id) => [id, 'faded']))), say: 'The pull-up network: ' + up.join(', ') + ' (pMOS, the bubble). ' + (up.length > 1 ? (inp.cell.startsWith('nand') ? 'In parallel, the dual of the series pull-down: any input at 0 pulls Y up to VDD.' : 'In series, the dual of the parallel pull-down: Y reaches VDD only when every input is 0.') : 'One switch: Y is pulled up when A = 0.') });
      P11.combos(net).forEach((iv, m) => {
        const st = KC().state(net, iv, {}, L);
        rows[m] = { Y: st.nodes.Y.v };
        const on = net.transistors.filter((t) => st.conducts[t.id] === true);
        F.set('on', on.length);
        const next = m + 1 < (1 << net.inputs.length) ? P11.combos(net)[m + 1] : null;
        const stN = next ? KC().state(net, next, {}, L) : null;
        F.add({ items: pic(st, iv, m), say: P11.say(net, st, iv), meta: next ? { m, ask: m === 0 || m === 2, y: String(stN.nodes.Y.v), next: bits(next, net), pick: m === 1 && net.inputs.length > 1, onKeys: net.transistors.filter((t) => stN.lit.has(t.id)).map((t) => 'cm:t:' + t.id), nextIn: net.inputs.map((n) => n + ' = ' + next[n]).join(', ') } : null });
      });
      F.add({ items: pic(null, null, null), say: 'In every row exactly one network conducted, so Y was always driven, never floating and never shorted, and no current flowed from VDD to GND once the output settled. That is why a CMOS gate uses almost no power while it is not switching.', mark: 'end' });
      return { frames: F.list, def: { sections: [{ id: 'd', kind: 'math', title: 'Switches', text: ['nMOS: on when its gate is 1 (passes 0 well)', 'pMOS: on when its gate is 0 (passes 1 well)', '', 'pull-down nMOS: series = AND', 'pull-up pMOS: the dual', 'Y = (pull-down function)′'].join('\n') }] } };
    },
    predict: [
      { at: (f) => f.meta && f.meta.ask, pick: 'option', options: ['0', '1'], ask: (fr, i) => 'Next: ' + fr[i].meta.nextIn + '. What will Y be?', answer: (fr, i) => fr[i].meta.y, explain: (fr, i) => fr[i + 1].say },
      { at: (f) => f.meta && f.meta.pick, pick: 'item', ask: (fr, i) => 'Next: ' + fr[i].meta.nextIn + '. Click a transistor on the path that will set Y.', answer: (fr, i) => fr[i].meta.onKeys, explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'An nMOS transistor conducts when its gate is…', options: ['0', '1', 'floating', 'at VDD/2'], answer: 1, why: 'A high gate voltage turns an nMOS switch on.' },
      { q: 'In a CMOS NAND gate the nMOS transistors are…', options: ['in parallel', 'in series', 'absent', 'one only'], answer: 1, why: 'The output goes low only when every input is 1: switches in series.' },
      { q: 'The pull-up of a NOR gate is…', options: ['pMOS in series', 'pMOS in parallel', 'nMOS in series', 'a resistor'], answer: 0, why: 'The dual of the parallel pull-down: Y is pulled up only when every input is 0.' },
      { q: 'Why does a static CMOS gate draw almost no current while it is not switching?', options: ['Its transistors are small', 'For every input exactly one of the two networks conducts, so there is no path from VDD to GND', 'It has a resistor', 'It runs at a low voltage'], answer: 1, why: 'Current flows only briefly, while switching.' },
      { q: 'How many transistors does a static CMOS NAND with 3 inputs need?', options: ['3', '4', '6', '8'], answer: 2, why: 'Three nMOS in series and three pMOS in parallel.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------
  // Complex gates from an expression
  // ---------------------------------------------------------------------------------------------------------
  const exprCheck = (v) => {
    let cell;
    try { cell = C().fromExpression(String(v)); } catch (e) { return 'Expression: ' + e.message; }
    if (cell.net.inputs.length > 4) return 'Expression: at most four variables';
    if (cell.net.transistors.length > 20) return 'Expression: that needs ' + cell.net.transistors.length + ' transistors; keep it to 20 so the drawing stays readable';
    if (cell.net.inputs.length === 0) return 'Expression: use at least one variable';
    return null;
  };
  S.topic({
    id: 'cmos-complex', family: 'p11-cmos', order: 20, title: 'Complex gates from an expression',
    blurb: 'Write the function as a complement, (…)′. Its inside becomes the pull-down: AND in series, OR in parallel. The pull-up is the dual, with the same inputs. One stage does AND-OR-INVERT in a single gate delay.',
    inputs: [{ id: 'f', kind: 'expr', label: 'Y =', def: "(AB + C)'", check: exprCheck }],
    presets: [
      { label: 'AOI21: (AB + C)′', values: { f: "(AB + C)'" } },
      { label: 'OAI22: ((A + B)(C + D))′', values: { f: "((A + B)(C + D))'" } },
      { label: '(A(B + C))′', values: { f: "(A(B + C))'" } },
      { label: 'Not a complement: AB + C (two stages)', values: { f: 'AB + C' } },
      { label: "A complemented input: (AB' + C)′", values: { f: "(AB' + C)'" } },
    ],
    counters: [{ id: 'tr', label: 'transistors' }],
    run(inp) {
      const cell = C().fromExpression(String(inp.f)), net = cell.net, L = KC().layout(net);
      const tx = L.w + 70, rows = [];
      const F = new S.Frames(['tr']);
      F.set('tr', net.transistors.length);
      const main = L.stages.find((s) => s.out === (cell.stages === 1 ? 'Y' : 'W'));
      const ids = (tree) => (!tree ? [] : tree.k === 'leaf' ? [tree.id] : tree.kids.flatMap(ids));
      const dn = ids(main.down), upIds = ids(main.up);
      const others = net.transistors.map((t) => t.id).filter((id) => !dn.includes(id) && !upIds.includes(id));
      const fade = (keep) => Object.fromEntries(net.transistors.filter((t) => !keep.includes(t.id)).map((t) => [t.id, 'faded']));
      const pic = (st, iv, hot, mark) => KC().draw(L, st, { mark }).items.concat(iv ? P11.badges(net, iv, 0, -56) : [], P11.truth(net, rows, tx, 0, hot).items);
      const T = C().treeText;
      F.add({ items: pic(null, null, null, fade([])), say: 'Y = ' + S.Fsm.util.text(cell.expr) + '. ' + (cell.stages === 1 ? 'It is a complement, so one stage does it: the pull-down realises ' + T(cell.pullDown) + '.' : 'It is not a complement, so build a stage for its complement on node W and follow it with an inverter.') + ' ' + net.transistors.length + ' transistors in all.', meta: { askN: true, n: net.transistors.length } });
      F.add({ items: pic(null, null, null, fade(dn)), say: oneSwitch(cell.trace.find((t) => t.kind === 'pulldown').say) + ' Each AND becomes switches in series, each OR switches in parallel.' });
      F.add({ items: pic(null, null, null, fade(upIds)), say: cell.trace.find((t) => t.kind === 'pullup').say + ' So whenever the pull-down is off, the pull-up is on, and the other way round.' });
      if (others.length) F.add({ items: pic(null, null, null, fade(others)), say: cell.trace.filter((t) => t.kind === 'inverter' || t.kind === 'output-inverter').map((t) => t.say).join(' ') });
      const all = P11.combos(net);
      const pickRows = all.length <= 8 ? all.map((_, m) => m) : [0, 3, 5, 6, 9, 12, 15];
      pickRows.forEach((m, j) => {
        const iv = all[m], st = KC().state(net, iv, {}, L);
        rows[m] = { Y: st.nodes.Y.v };
        const nx = pickRows[j + 1];
        F.add({ items: pic(st, iv, m), say: P11.say(net, st, iv), meta: nx !== undefined && j % 3 === 1 ? { ask: true, y: String(KC().state(net, all[nx], {}, L).nodes.Y.v), nextIn: net.inputs.map((n) => n + ' = ' + all[nx][n]).join(', ') } : null });
      });
      const chk = C().check(net, cell.expr);
      for (let m = 0; m < all.length; m++) if (!rows[m]) rows[m] = { Y: chk.rows[m].out.Y };
      F.add({ items: pic(null, null, null), say: chk.ok ? 'Checked on all ' + all.length + ' inputs: Y always equals the expression and is always driven by exactly one network.' : chk.problems[0].say, mark: 'end' });
      return { frames: F.list, def: { sections: [{ id: 'd', kind: 'math', title: 'From the expression', text: ['Y = (G)′:', 'pull-down realises G', '  AND → series, OR → parallel', 'pull-up is the dual', '  series ↔ parallel, pMOS', '', 'no outer complement:', '  a stage for F′, then an inverter'].join('\n') }] } };
    },
    predict: [
      { at: (f) => f.meta && f.meta.askN, pick: 'option', options: (fr, i) => [...new Set([fr[i].meta.n - 2, fr[i].meta.n, fr[i].meta.n + 2, fr[i].meta.n * 2])].map(String), ask: 'Two transistors for every literal, plus inverters where needed. How many transistors in all?', answer: (fr, i) => String(fr[i].meta.n), explain: (fr, i) => fr[i + 1].say },
      { at: (f) => f.meta && f.meta.ask, pick: 'option', options: ['0', '1'], ask: (fr, i) => 'Next: ' + fr[i].meta.nextIn + '. What will Y be?', answer: (fr, i) => fr[i].meta.y, explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'In the pull-down network of (AB + C)′, the switches for A and B are…', options: ['in parallel', 'in series, and that pair is in parallel with C', 'all in series', 'all in parallel'], answer: 1, why: 'AND → series, OR → parallel.' },
      { q: 'The pull-up network of a complementary gate is…', options: ['the same shape as the pull-down', 'the dual of the pull-down: series and parallel swapped, with pMOS', 'a single resistor', 'nMOS in series'], answer: 1, why: 'Then exactly one network conducts for every input.' },
      { q: 'Why is AB + C (without the outer complement) built in two stages?', options: ['It cannot be built', 'A single CMOS stage always inverts, so it builds (AB + C)′ and an inverter follows', 'For speed only', 'Because C is alone'], answer: 1, why: 'Static CMOS stages are inverting.' },
      { q: 'How many transistors does an AOI22, ((AB + CD)′), need?', options: ['4', '6', '8', '12'], answer: 2, why: 'Four literals, two transistors each.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------
  // Broken networks
  // ---------------------------------------------------------------------------------------------------------
  const broken = {
    series: { label: 'A NAND whose pull-up is in series', say: 'The pull-down is a NAND\'s (A and B in series), but the pull-up is in series too, not the dual.', make: () => { const n = C().network('NAND with a series pull-up', { inputs: ['A', 'B'], outputs: ['Y'] }); n.n('A', 'Y', 'n1', 'M1'); n.n('B', 'n1', 'GND', 'M2'); n.p('A', 'VDD', 'n2', 'M3'); n.p('B', 'n2', 'Y', 'M4'); return n; }, expr: "(AB)'" },
    parallel: { label: 'A NOR whose pull-up is in parallel', say: 'The pull-down is a NOR\'s (A and B in parallel), but the pull-up is in parallel too.', make: () => { const n = C().network('NOR with a parallel pull-up', { inputs: ['A', 'B'], outputs: ['Y'] }); n.n('A', 'Y', 'GND', 'M1'); n.n('B', 'Y', 'GND', 'M2'); n.p('A', 'VDD', 'Y', 'M3'); n.p('B', 'VDD', 'Y', 'M4'); return n; }, expr: "(A + B)'" },
    missing: { label: 'A NAND with one pMOS missing', say: 'A NAND with the pMOS for B left out of the pull-up.', make: () => { const n = C().network('NAND missing a pMOS', { inputs: ['A', 'B'], outputs: ['Y'] }); n.n('A', 'Y', 'n1', 'M1'); n.n('B', 'n1', 'GND', 'M2'); n.p('A', 'VDD', 'Y', 'M3'); return n; }, expr: "(AB)'" },
  };
  S.topic({
    id: 'cmos-broken', family: 'p11-cmos', order: 30, title: 'When the networks are not complementary',
    blurb: 'If the pull-up is not the dual of the pull-down, some inputs turn on neither network, and the output floats, holding whatever charge it had, or turn on both, and the supply is shorted to ground through the output.',
    inputs: [{ id: 'net', kind: 'choice', label: 'Network', def: 'series', options: Object.entries(broken).map(([value, b]) => ({ value, label: b.label })) }],
    presets: Object.entries(broken).map(([value, b]) => ({ label: b.label, values: { net: value } })),
    counters: [{ id: 'bad', label: 'bad rows' }],
    run(inp) {
      const B = broken[inp.net], net = B.make(), L = KC().layout(net);
      const tx = L.w + 70, rows = [];
      const F = new S.Frames(['bad']);
      const pic = (st, iv, hot) => KC().draw(L, st, {}).items.concat(iv ? P11.badges(net, iv, 0, -56, st ? [{ key: 'y', text: KC().outText(L, st, 'Y'), cls: KC().valCls(st.nodes.Y) }] : []) : [], P11.truth(net, rows, tx, 0, hot).items);
      F.add({ items: pic(null, null, null), say: B.say + ' Go through the inputs in turn; each run keeps the charge left on Y from the one before.' });
      let prev = {};
      // in an order that shows charge holding: 00, 01, 11, 10
      const order = [0, 1, 3, 2];
      order.forEach((m, j) => {
        const iv = P11.combos(net)[m], st = KC().state(net, iv, prev, L);
        prev = st.nodes;
        const nv = st.nodes.Y;
        rows[m] = { Y: nv.s === 'conflict' ? 'X' : nv.v === 'Z' ? 'Z' : nv.s === 'charged' ? nv.v + '?' : nv.v };
        if (nv.s === 'conflict' || nv.s === 'charged' || nv.v === 'Z') F.count('bad');
        const nx = order[j + 1];
        let meta = null;
        if (nx !== undefined) { const s2 = KC().state(net, P11.combos(net)[nx], st.nodes, L), n2 = s2.nodes.Y; meta = { ask: true, nextIn: net.inputs.map((n) => n + ' = ' + P11.combos(net)[nx][n]).join(', '), kind: n2.s === 'conflict' ? 'both networks conduct: a short' : n2.s === 'charged' || n2.v === 'Z' ? 'neither conducts: Y floats' : 'Y is driven to ' + n2.v }; }
        F.add({ items: pic(st, iv, m), say: P11.say(net, st, iv) + (nv.s === 'charged' && nv.v === 'X' ? ' An output must never be left floating like this in static logic.' : nv.s === 'charged' ? ' A later leak or a little noise and it is lost: an output must never be left like this in static logic.' : nv.s === 'conflict' ? ' The output sits somewhere between the levels, set by which transistors are stronger, and the gate draws a large current.' : ''), meta });
      });
      const chk = C().check(net, B.expr);
      F.add({ items: pic(null, null, null), say: 'Against ' + B.expr.replace(/'/g, '′') + ': ' + (chk.problems.map((p) => p.say).join(' ') || 'no problems.') + ' A correct static gate needs the pull-up to be exactly the dual of the pull-down.', mark: 'end' });
      return { frames: F.list, def: { sections: [{ id: 'd', kind: 'math', title: 'What can go wrong', text: ['neither network on: Y floats (Z)', '  it keeps its old charge, for a while', 'both networks on: VDD shorted to GND', '  Y is X, the gate runs hot', '', 'cure: pull-up = dual of pull-down'].join('\n') }] } };
    },
    predict: [{ at: (f) => f.meta && f.meta.ask, pick: 'option', options: ['Y is driven to 0', 'Y is driven to 1', 'neither conducts: Y floats', 'both networks conduct: a short'], ask: (fr, i) => 'Next: ' + fr[i].meta.nextIn + '. What happens at Y?', answer: (fr, i) => fr[i].meta.kind, explain: (fr, i) => fr[i + 1].say }],
    quiz: [
      { q: 'If neither the pull-up nor the pull-down conducts, the output…', options: ['is 0', 'is 1', 'floats, keeping its old charge for a while', 'shorts'], answer: 2, why: 'Nothing drives it; only stored charge holds a value.' },
      { q: 'If both networks conduct, …', options: ['the output is 1', 'there is a path from VDD to GND: a short, and the output is unknown', 'nothing happens', 'the gate turns off'], answer: 1, why: 'Current flows straight through, and the level depends on transistor strengths.' },
      { q: 'A NAND pull-down with a pull-up of pMOS in series fails for…', options: ['A = B = 0', 'A = B = 1', 'A ≠ B', 'no input'], answer: 2, why: 'Then one series switch of each network is off: neither conducts.' },
      { q: 'What makes a static CMOS gate correct for every input?', options: ['equal transistor sizes', 'a pull-up that is exactly the dual of the pull-down', 'a resistor at the output', 'two supplies'], answer: 1, why: 'Then exactly one network conducts for every input.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------
  // Transmission gates and the tristate inverter
  // ---------------------------------------------------------------------------------------------------------
  const passCells = {
    tgate: { label: 'Transmission gate', make: () => C().cells.tgate() },
    tgmux: { label: '2:1 multiplexer of transmission gates', make: () => C().cells.tgmux() },
    tristate: { label: 'Tristate inverter', make: () => C().cells.tristate() },
  };
  S.topic({
    id: 'cmos-tgate', family: 'p11-cmos', order: 40, title: 'Transmission gates and tristate outputs',
    blurb: 'An nMOS and a pMOS side by side, driven by a control and its complement, pass a signal both ways, 0s and 1s alike: a transmission gate. Two of them make a multiplexer; an inverter with an extra switch in each network can let go of its output entirely.',
    inputs: [{ id: 'cell', kind: 'choice', label: 'Cell', def: 'tgate', options: Object.entries(passCells).map(([value, b]) => ({ value, label: b.label })) }],
    presets: Object.entries(passCells).map(([value, b]) => ({ label: b.label, values: { cell: value } })),
    run(inp) {
      const cell = passCells[inp.cell].make(), net = cell.net, L = KC().layout(net);
      const tx = L.w + 70, rows = [];
      const F = new S.Frames();
      const pic = (st, iv, hot) => KC().draw(L, st, {}).items.concat(iv ? P11.badges(net, iv, 0, -56) : [], P11.truth(net, rows, tx, 0, hot).items);
      F.add({ items: pic(null, null, null), say: cell.trace[0].say + ' ' + net.transistors.length + ' transistors, including the inverter that makes the complement of the control.' });
      P11.combos(net).forEach((iv, m) => {
        const st = KC().state(net, iv, {}, L), nv = st.nodes.Y;
        rows[m] = { Y: nv.v === 'Z' || nv.s === 'charged' ? 'Z' : nv.s === 'conflict' ? 'X' : nv.v };
        const nx = P11.combos(net)[m + 1];
        let meta = null;
        if (nx && (m === 1 || m === 4)) { const s2 = KC().state(net, nx, {}, L).nodes.Y; meta = { ask: true, y: s2.v === 'Z' || s2.s === 'charged' ? 'Z (cut off)' : String(s2.v), nextIn: net.inputs.map((n) => n + ' = ' + nx[n]).join(', ') }; }
        const extra = inp.cell === 'tgate' ? (iv.C ? ' Both switches conduct, so Y follows A: the nMOS passes a strong 0, the pMOS a strong 1.' : ' Both switches are off: Y is cut off from A.') : inp.cell === 'tgmux' ? (iv.S ? ' S = 1: the gate from B conducts, so Y = B = ' + iv.B + '.' : ' S = 0: the gate from A conducts, so Y = A = ' + iv.A + '.') : (iv.EN ? ' Enabled: an ordinary inverter, Y = A′ = ' + (1 - iv.A) + '.' : ' EN = 0: the extra switch in each network is off, so Y is driven by nothing (Z) and another output can drive the same wire.');
        F.add({ items: pic(st, iv, m), say: P11.say(net, st, iv) + extra, meta });
      });
      const end = { tgate: 'A transmission gate is a switch for signals: closed (C = 1) it passes A either way, open it isolates. It is used in multiplexers, latches and flip-flops.', tgmux: 'Two transmission gates and an inverter: a 2:1 multiplexer in 6 transistors, against 12 or more for AND-OR logic.', tristate: 'A tristate output has three states: 0, 1, and cut off (Z). Many of them can share a bus wire as long as only one is enabled at a time.' }[inp.cell];
      F.add({ items: pic(null, null, null), say: end, mark: 'end' });
      return { frames: F.list, def: { sections: [{ id: 'd', kind: 'math', title: { tgate: 'Transmission gate', tgmux: 'Multiplexer', tristate: 'Tristate inverter' }[inp.cell], text: { tgate: ['C = 1: Y = A (both switches on)', 'C = 0: Y cut off', '', 'nMOS passes a good 0,', 'pMOS a good 1: together, both'], tgmux: ['S = 0: Y = A', 'S = 1: Y = B', '', '6 transistors'], tristate: ['EN = 1: Y = A′', 'EN = 0: Y = Z (cut off)', '', 'a bus: one driver enabled at a time'] }[inp.cell].join('\n') }] } };
    },
    predict: [{ at: (f) => f.meta && f.meta.ask, pick: 'option', options: ['0', '1', 'Z (cut off)'], ask: (fr, i) => 'Next: ' + fr[i].meta.nextIn + '. What is Y?', answer: (fr, i) => fr[i].meta.y, explain: (fr, i) => fr[i + 1].say }],
    quiz: [
      { q: 'Why does a transmission gate use both an nMOS and a pMOS?', options: ['for speed', 'an nMOS passes 0 well but 1 poorly, a pMOS the reverse; together they pass both', 'to invert the signal', 'to save power'], answer: 1, why: 'Each covers the other\'s weak level.' },
      { q: 'A transmission gate with its control at 0…', options: ['passes the input', 'inverts the input', 'isolates the output', 'shorts the output'], answer: 2, why: 'Both switches are off.' },
      { q: 'A tristate inverter with EN = 0 has its output…', options: ['at 0', 'at 1', 'cut off (Z)', 'equal to A'], answer: 2, why: 'Both networks have a switch that is off.' },
      { q: 'How many transistors in the transmission-gate 2:1 multiplexer shown (with its select inverter)?', options: ['4', '6', '8', '12'], answer: 1, why: 'Two transmission gates (4) and an inverter (2).' },
    ],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
