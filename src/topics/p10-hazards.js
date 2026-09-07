// Part 10, hazards, each caught on the simulator's waveform: a static-1 hazard inside a loop that flips the
// circuit into the wrong state (and the consensus term that stops it), static-0 and dynamic hazards in
// combinational logic, and an essential hazard, where a slow input path lets the loops race ahead of the input.
(function (S) {
  'use strict';
  const P10 = S.P10, A = () => S.Async, K = () => S.Kit, TM = () => S.Kit.timing;
  const nm = (v) => String(v).replace(/'/g, '′');
  const ns = (t) => Math.round(t * 100) / 100 + ' ns';

  /** every change of the named nets after t0, in time order, with what drove it */
  function story(R, names, t0, t1) {
    const out = [];
    for (const n of names) for (const [t, v] of R.changesIn(n, t0, t1)) out.push({ t, n, v });
    return out.sort((a, b) => a.t - b.t || names.indexOf(a.n) - names.indexOf(b.n));
  }
  /** the pulses of a net after t0: [[start, end]] where it leaves and comes back */
  function pulses(R, n, t0) {
    const ch = R.changes(n).filter((q) => q[0] > t0), before = R.at(n, t0), out = [];
    for (let i = 0; i + 1 < ch.length; i++) if (ch[i][1] !== before && ch[i + 1][1] === before) out.push([ch[i][0], ch[i + 1][0]]);
    return out;
  }
  /** a gate whose delay is given, both edges */
  const setDelay = (p, d) => Object.assign(p.params, { tpLH: d, tpHL: d });

  // ---------------------------------------------------------------------------------------------------------
  // Static hazard in a loop
  // ---------------------------------------------------------------------------------------------------------
  const covers = { minimal: "x1x2 + x2'y", free: "x1x2 + x2'y + x1y" };
  S.topic({
    id: 'hz-static', family: 'p10-hazards', order: 10, title: 'A static hazard inside a loop',
    blurb: 'Y = x1x2 + x2′y holds y at 1 while x1 = 1, whatever x2 does. But when x2 falls, one AND gate lets go before the other takes over; Y dips, and in a loop a dip is enough to drop the stored 1 for good. The consensus term x1y bridges the gap.',
    inputs: [
      { id: 'cover', kind: 'choice', label: 'Excitation', def: 'minimal', options: [{ value: 'minimal', label: "Y = x1x2 + x2'y (minimal)" }, { value: 'free', label: "Y = x1x2 + x2'y + x1y (hazard-free)" }] },
      { id: 'inv', kind: 'number', label: 'Inverter delay (ns)', def: 9, min: 1, max: 30 },
    ],
    presets: [
      { label: 'Minimal cover, slow inverter: the 1 is lost', values: { cover: 'minimal', inv: 9 } },
      { label: 'Minimal cover, fast inverter: the dip is too short', values: { cover: 'minimal', inv: 1 } },
      { label: 'With the consensus term x1y: no dip', values: { cover: 'free', inv: 9 } },
    ],
    counters: [{ id: 'events', label: 'changes' }],
    run(inp) {
      const spec = { inputs: ['x1', 'x2'], vars: ['y'], Y: { y: covers[inp.cover] }, outputs: {} };
      const c = P10.circuit(spec, { title: 'Y = ' + covers[inp.cover], loopDelay: 2 });
      for (const p of c.parts) {
        if (p.type === 'NOT') { setDelay(p, inp.inv); c.name(p.pin('y'), "x2'", true); }
        else if (p.type === 'AND') setDelay(p, 3);
        else if (p.type === 'OR') { setDelay(p, 3); c.name(p.pin('y'), 'Y', true); }
      }
      const T0 = 40, end = 100;
      const ands = c.parts.filter((p) => p.type === 'AND');
      const andName = (p) => { const ins = p.pins.filter((q) => q.dir === 'in').map((q) => { const n = p.net[q.name]; return n.name || n.pins[0].part.params.name; }); return ins.join('·'); };
      ands.forEach((p) => c.name(p.pin('y'), nm(andName(p)), true));
      const names = ['x2', "x2'"].concat(ands.map((p) => nm(andName(p))), ['Y', 'y']);
      const R2 = TM().run(c, { deposit: { y: 1 }, stim: [[0, 'x1', 1], [0, 'x2', 1], [T0, 'x2', 0]], until: end });
      const ev = story(R2, names, T0 - 0.01, end);
      const pl = pulses(R2, 'Y', T0), yEnd = R2.at('y', end);
      const sig = TM().signals(R2, names.map((n) => ({ name: n, label: nm(n), cls: n === 'Y' && pl.length ? 'glitch' : n === 'y' ? (yEnd === 1 ? 'clean' : 'bad') : '' })));
      const hz = A().staticHazards(P10.cubes(S.Netlist.parse(covers[inp.cover]), ['y', 'x1', 'x2']), ['y', 'x1', 'x2']);
      const F = new S.Frames(['events']);
      const mark = (t) => (pl.length && t >= pl[0][1] ? [{ t0: pl[0][0], t1: pl[0][1], rows: ['Y'], cls: 'bad', label: 'dip', key: 'dip' }] : []);
      const V = P10.split({ R: R2, signals: sig, t0: 20, t1: Math.max(T0 + 30, ...ev.map((e) => e.t + 15)), spans: mark });
      F.add(Object.assign(V.circ(T0 - 1), { say: 'Y = ' + nm(covers[inp.cover]) + ', fed back through the loop buffer as y. With x1 = x2 = 1 the term x1x2 holds Y = 1, so y = 1. The flow table says: if x2 now falls, x2′y takes over and y stays 1.', meta: { ask: true, lost: yEnd !== 1 } }));
      const hzText = hz.length ? hz[0].say.replace('a static-1 hazard', 'a static-1 hazard in the cover') : 'Every pair of neighbouring 1s of Y lies in one term: the cover has no static-1 hazard.';
      F.add(Object.assign(V.circ(T0 + 0.2, ands.map((p) => p.id)), { say: 'At ' + T0 + ' ns x2 falls. ' + hzText + ' The two AND gates (lit) are about to hand over.' }));
      ev.forEach((e) => {
        if (e.n === 'x2') return;
        F.count('events');
        F.add(Object.assign(V.wave(e.t + 0.2), { say: 'At ' + ns(e.t) + ' ' + nm(e.n) + (e.v === 1 ? ' rises to 1' : ' falls to 0') + '.' + (e.n === 'Y' && e.v === 0 ? ' Y has dipped: for a moment neither AND gate holds it.' : e.n === 'y' && e.v === 0 ? ' The dip has gone round the loop: y is now 0, so x2′y can no longer catch it.' : e.n === "x2'" ? ' The inverter has caught up (' + inp.inv + ' ns).' : '') }));
      });
      const verdict = yEnd !== 1
        ? 'y ended at 0: the circuit dropped its stored 1 and sits in the wrong row of the flow table. In a loop a glitch is not a passing blemish; it is remembered.'
        : pl.length ? 'Y dipped for ' + ns(pl[0][1] - pl[0][0]) + ' but the dip was shorter than the loop buffer could pass, so y stayed 1. The hazard is still in the cover: slower parts would expose it.'
          : inp.cover === 'free' ? 'Y stayed at 1 throughout: while x1 = 1 and y = 1 the consensus term x1y holds Y, whatever x2 and its inverter do. A hazard-free cover covers every pair of neighbouring 1s with one term.'
            : (() => {
              // when the two AND gates hand over, from the run
              const off = ev.find((e) => e.n === 'x1·x2' && e.v === 0), on = ev.find((e) => /x2′|x2'/.test(e.n) && /y/.test(e.n) && e.v === 1);
              const gap = off && on ? on.t - off.t : null;
              return 'With an inverter this fast, ' + (gap === null || gap <= 0 ? 'x2′y comes on before x1x2 lets go, and Y never dips.' : 'x2′y comes on only ' + ns(gap) + ' after x1x2 lets go; the OR gate (3 ns) does not pass so short a gap, and Y never dips.') + ' The hazard is still in the cover; it waits for slower parts.';
            })();
      F.add(Object.assign(V.wave(end), { say: verdict, mark: 'end' }));
      return { frames: P10.scenes(F.list), def: { sections: [{ id: 'd', kind: 'math', title: 'The loop', text: ['Y = ' + nm(covers[inp.cover]), '', 'x1 = 1, y = 1: Y should stay 1', 'as x2 falls', '', 'consensus of x1x2 and x2′y: x1y'].join('\n') }] } };
    },
    predict: [{ at: (f) => f.meta && f.meta.ask, pick: 'option', options: ['y stays 1', 'y falls to 0 and stays there', 'y oscillates'], ask: 'x2 is about to fall. What will the loop do?', answer: (fr, i) => (fr[i].meta.lost ? 'y falls to 0 and stays there' : 'y stays 1'), explain: (fr) => fr[fr.length - 1].say }],
    quiz: [
      { q: 'Why is a static hazard worse inside an asynchronous circuit than in combinational logic?', options: ['It is not', 'A glitch on an excitation can travel round the loop and change the stored state for good', 'It uses more power', 'It slows the clock'], answer: 1, why: 'The loop remembers the dip as a new value of y.' },
      { q: 'What removes the static-1 hazard of Y = x1x2 + x2′y?', options: ['adding x1y', 'removing x1x2', 'a faster OR gate', 'adding x2y'], answer: 0, why: 'x1y is the consensus: it covers both cells the change moves between.' },
      { q: 'With a very fast inverter the minimal cover did not glitch. Is it hazard-free?', options: ['Yes', 'No: the hazard is in the cover; other delays can still expose it'], answer: 1, why: 'A hazard is a possibility created by the logic; the delays decide whether it shows.' },
      { q: 'A hazard-free sum of products covers…', options: ['every 1 at least twice', 'every pair of neighbouring 1s with one single term', 'only the essential primes', 'the 0s'], answer: 1, why: 'Then no single input change hands the output from one term to another.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------
  // Static-0 and dynamic hazards
  // ---------------------------------------------------------------------------------------------------------
  const combos = {
    dynamic: { label: "Dynamic: F = x·(x'z + xy)", from: { x: 0, y: 1, z: 1 }, out: 'F' },
    fixed: { label: "Dynamic, fixed: G gets the consensus yz", from: { x: 0, y: 1, z: 1 }, out: 'F' },
    static0: { label: "Static-0: F = (x + y)(x' + z)", from: { x: 0, y: 0, z: 0 }, out: 'F' },
  };
  function comboCircuit(kind) {
    const c = new S.Netlist.Circuit(combos[kind].label), G = TM().G;
    const x = c.input('x').pin('y'), y = c.input('y').pin('y'), z = c.input('z').pin('y');
    if (kind === 'static0') {
      const a = G(c, 'OR', [x, y], { id: 'g1', tpLH: 3 });
      const nx = G(c, 'NOT', [x], { id: 'inv', tpLH: 8 });
      const b = G(c, 'OR', [nx, z], { id: 'g2', tpLH: 3 });
      const f = G(c, 'AND', [a, b], { id: 'g3', tpLH: 3 });
      c.name(nx, "x'", true); c.name(a, 'x+y', true); c.name(b, "x'+z", true);
      c.connect(f, c.output('F').pin('a'));
      return { c, nets: ["x'", 'x+y', "x'+z", 'F'] };
    }
    const nx = G(c, 'NOT', [x], { id: 'inv', tpLH: 2 });
    const a = G(c, 'AND', [nx, z], { id: 'g1', tpLH: 3 });
    const b = G(c, 'AND', [x, y], { id: 'g2', tpLH: 10 });
    const terms = [a, b];
    if (kind === 'fixed') terms.push(G(c, 'AND', [y, z], { id: 'g5', tpLH: 3 }));
    const o = G(c, 'OR', terms, { id: 'g3', tpLH: 3 });
    const f = G(c, 'AND', [x, o], { id: 'g4', tpLH: 3 });
    c.name(nx, "x'", true); c.name(a, "x'z", true); c.name(b, 'xy', true); c.name(o, 'G', true);
    if (kind === 'fixed') c.name(terms[2], 'yz', true);
    c.connect(f, c.output('F').pin('a'));
    return { c, nets: ["x'", "x'z", 'xy'].concat(kind === 'fixed' ? ['yz'] : [], ['G', 'F']) };
  }
  S.topic({
    id: 'hz-dynamic', family: 'p10-hazards', order: 20, title: 'Static-0 and dynamic hazards',
    blurb: 'An output that should stay 0 can pulse to 1 (a static-0 hazard), and one that should change once can change three times (a dynamic hazard), when the same input reaches it along paths of different delay. The simulator shows both, and the term that cures the dynamic one.',
    inputs: [{ id: 'kind', kind: 'choice', label: 'Circuit', def: 'dynamic', options: Object.entries(combos).map(([value, k]) => ({ value, label: k.label })) }],
    presets: Object.entries(combos).map(([value, k]) => ({ label: k.label, values: { kind: value } })),
    counters: [{ id: 'flips', label: 'changes of F' }],
    run(inp) {
      const K0 = combos[inp.kind], { c, nets } = comboCircuit(inp.kind);
      const T0 = 30, end = 70;
      const stim = Object.entries(K0.from).map(([n, v]) => [0, n, v]).concat([[T0, 'x', 1 - K0.from.x]]);
      const R = TM().run(c, { stim, until: end });
      const fch = R.changesIn('F', T0, end), before = R.at('F', T0 - 1), after = R.at('F', end);
      const sig = TM().signals(R, ['x'].concat(nets).map((n) => ({ name: n, label: nm(n), cls: n === 'F' ? (fch.length > (before === after ? 0 : 1) ? 'glitch' : 'clean') : '' })));
      const ev = story(R, nets, T0, end);
      // the gate driving a net (an output port's net is named by the port)
      const gateOf = (n) => c.parts.find((p) => p.net.y && S.Netlist.GATES.has(p.type) && (p.net.y.name === n || p.net.y.pins.some((r) => r.part.type === 'OUT' && r.part.params.name === n)));
      P10.rails(K().schem.layout(c), c.parts.filter((p) => p.type === 'IN').map((p) => p.params.name));
      const F = new S.Frames(['flips']);
      const held = Object.entries(K0.from).filter(([n]) => n !== 'x').map(([n, v]) => n + ' = ' + v).join(', ');
      const V = P10.split({ R, signals: sig, t0: 20, t1: end });
      F.add(Object.assign(V.circ(T0 - 1), { say: 'Hold ' + held + ' and let x go from ' + K0.from.x + ' to ' + (1 - K0.from.x) + ' at ' + T0 + ' ns. F should ' + (before === after ? 'stay ' + before : 'change once, from ' + before + ' to ' + after) + '.', meta: { ask: true, n: fch.length } }));
      ev.forEach((e) => {
        if (e.n === 'F') F.count('flips');
        const gate = gateOf(e.n);
        F.add(Object.assign(V.wave(e.t + 0.2), { say: 'At ' + ns(e.t) + ' ' + nm(e.n) + (e.v === 1 ? ' rises' : ' falls') + (gate ? ' (' + gate.id + ', ' + gate.params.tpLH + ' ns)' : '') + '.' + (e.n === 'F' ? ' F has now changed ' + fch.filter((q) => q[0] <= e.t).length + ' time' + (fch.filter((q) => q[0] <= e.t).length > 1 ? 's' : '') + '.' : '') }));
      });
      const verdict = inp.kind === 'static0' ? 'F pulsed to 1 for ' + ns(fch.length > 1 ? fch[1][0] - fch[0][0] : 0) + ' though it should have stayed 0: a static-0 hazard. x + y turned on before x′ + z turned off; in the product of sums the two sums are neighbouring 0s held by different terms, and the cure is the consensus sum y + z.'
        : inp.kind === 'dynamic' ? 'F changed ' + fch.length + ' times (' + [before].concat(fch.map((q) => q[1])).join(' → ') + ') instead of once: a dynamic hazard. x reaches F three ways: directly (fast), and through G, which has a static-1 hazard of its own (xy is slow). On the simulator the gates switched in the order ' + ev.map((e) => (gateOf(e.n) || { id: e.n }).id).join(', ') + '.'
          : 'F changed once. With yz in G, G stays 1 while x′z hands over to xy, so the only path that matters is x itself: no static hazard inside, no dynamic hazard outside.';
      F.add(Object.assign(V.circ(end), { say: verdict, mark: 'end' }));
      return { frames: P10.scenes(F.list), def: { sections: [{ id: 'd', kind: 'math', title: 'Hazards', text: ['static-1: should stay 1, dips to 0', 'static-0: should stay 0, pulses to 1', 'dynamic: should change once,', '  changes three times', '', 'a dynamic hazard needs a static', 'one somewhere on a path'].join('\n') }] } };
    },
    predict: [{ at: (f) => f.meta && f.meta.ask, pick: 'option', options: ['0', '1', '2', '3'], ask: 'How many times will F change after x does?', answer: (fr, i) => String(fr[i].meta.n), explain: (fr) => fr[fr.length - 1].say }],
    quiz: [
      { q: 'A dynamic hazard is…', options: ['an output that should stay 1 but dips', 'an output that should change once but changes three or more times', 'a race between loops', 'a slow clock'], answer: 1, why: 'Paths of different delay from one input make it switch back and forth.' },
      { q: 'A circuit free of static hazards in all its sub-circuits…', options: ['can still have dynamic hazards from any path', 'has no dynamic hazards either', 'needs a clock', 'cannot be built'], answer: 1, why: 'A dynamic hazard needs a static hazard somewhere along one of the paths.' },
      { q: 'A static-0 hazard in a product of sums is cured by…', options: ['a consensus sum term', 'removing an inverter', 'a faster AND', 'an extra product term'], answer: 0, why: 'The dual of the static-1 cure.' },
      { q: 'In the dynamic example, why does F rise first?', options: ['x reaches F directly, faster than through G', 'G rises first', 'y changes', 'it does not'], answer: 0, why: 'F = x·G with G still 1: the direct path from x wins.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------
  // Essential hazard
  // ---------------------------------------------------------------------------------------------------------
  /** the catch design, with the direct x2 input of the gate that reads y1 and x2 taken through a delay */
  function essentialCircuit(late, loop) {
    const d = A().design(P10.examples.catch.table()), c = d.circuit;
    const dir = (r) => r.part.pins.find((q) => q.name === r.pin).dir;
    const drv = (p, pin) => { const n = p.net[pin]; return n && n.pins.find((r) => dir(r) === 'out').part; };
    const ins = (p) => p.pins.filter((q) => q.dir === 'in');
    const g = c.parts.find((p) => p.type === 'AND' && ins(p).some((q) => drv(p, q.name).id === 'in_x2') && ins(p).some((q) => drv(p, q.name).id === 'loop_y1'));
    const pin = ins(g).find((q) => drv(g, q.name).id === 'in_x2').name;
    const net = g.net[pin];
    net.pins = net.pins.filter((r) => !(r.part === g && r.pin === pin));
    delete g.net[pin];
    P10.blocks(c, { loopDelay: loop || 0 });
    // the slow wire, drawn as a delay of its own: x2 in, x2 late out
    const b = P10.delay(c, 'x2d', late, 'late');
    c.connect(c.byId.get('in_x2').pin('y'), b.pin('X2D'));
    c.connect(b.pin('x2d'), g.pin(pin));
    c.name(b.pin('x2d'), 'x2 late', true);
    return { d, c, gate: g.id };
  }
  S.topic({
    id: 'hz-essential', family: 'p10-hazards', order: 30, title: 'Essential hazards',
    blurb: 'Some flow tables give a different result when one input change is seen three times instead of once. If an input reaches one gate late, the loops can move on before that gate has seen the change, and the circuit ends in the wrong row. Only delay in the loops cures it.',
    inputs: [
      { id: 'late', kind: 'number', label: 'Delay of x2 to one gate (ns)', def: 80, min: 1, max: 150 },
      { id: 'loop', kind: 'number', label: 'Loop delay (ns, 0 = a normal buffer)', def: 0, min: 0, max: 200 },
    ],
    presets: [
      { label: 'Short input path: correct', values: { late: 1, loop: 0 } },
      { label: 'Input reaches one gate late: wrong row', values: { late: 80, loop: 0 } },
      { label: 'Same, with slower loops: correct again', values: { late: 80, loop: 90 } },
    ],
    run(inp) {
      const { d, c, gate } = essentialCircuit(inp.late, inp.loop);
      const eh = A().essentialHazards(d.model);
      // x1 rises only once the late copy of x2 has risen, and x2 falls once the circuit has settled, however long
      // the late path: so the circuit is sure to rest in row abd when x2 falls
      const up1 = Math.max(90, 40 + inp.late + 10), down2 = up1 + 50;
      const T = { up2: 40, up1, down2 }, end = down2 + Math.max(120, inp.late + 3 * Math.max(10, inp.loop) + 60);
      const R = TM().run(c, { deposit: { y1: 0, y2: 0, 'x2 late': 0 }, stim: [[0, 'x1', 0], [0, 'x2', 0], [T.up2, 'x2', 1], [T.up1, 'x1', 1], [T.down2, 'x2', 0]], until: end });
      const yEnd = R.at('y2', end) + '' + R.at('y1', end), zEnd = R.at('Z', end);
      const codes = d.assignment.codes, rowOf = Object.fromEntries(Object.entries(codes).map(([r, cd]) => [cd, r]));
      const sig = TM().signals(R, ['x1', 'x2', 'x2 late', 'y2', 'y1', 'Z'].map((n) => ({ name: n, cls: n === 'Z' && zEnd === 1 ? 'bad' : '' })));
      const F = new S.Frames();
      const V = P10.split({ R, signals: sig, t1: end, w: 700, marks: (t) => (t >= T.down2 ? [{ t: T.down2, label: 'x2 falls', key: 'f' }] : []) });
      const h = eh[0];
      F.add(Object.assign(V.circ(T.down2 - 1, [gate, 'late']), { say: 'The circuit of the "catch" design (Z = 1 when x2 rises while x1 is 1). The inputs went 00 → 01 → 11: x2 rose first, so nothing is caught; it rests in row ' + rowOf[R.at('y2', T.down2 - 1) + '' + R.at('y1', T.down2 - 1)] + ' (' + R.at('y2', T.down2 - 1) + R.at('y1', T.down2 - 1) + '), Z = 0. One wire, x2 into gate ' + gate + ', is drawn through a delay of ' + inp.late + ' ns: a long or slow input path.' }));
      F.add(Object.assign(V.wave(T.down2 - 1), { say: 'The flow table hides a trap. ' + (h ? 'From x = ' + h.x + ', y = ' + h.y + ', if x2 falls once the logic settles in ' + h.once + '; if it saw x2 fall, rise and fall again it would end in ' + h.thrice + '. A table with that property has an essential hazard: a gate that sees the change late can act as if it saw three.' : 'This table has no essential hazard.'), meta: { ask: true, wrong: yEnd !== (h ? h.once : yEnd) } }));
      const ev = story(R, ['x2 late', 'y2', 'y1', 'Z'], T.down2 - 0.01, end).slice(0, 8);
      ev.forEach((e) => F.add(Object.assign(V.wave(e.t + 0.2), { say: 'At ' + ns(e.t) + ' ' + e.n + (e.v === 1 ? ' rises' : ' falls') + '.' + (e.n === 'y1' && e.v === 1 ? ' The circuit moves to row ' + rowOf['01'] + ', as the flow table wants.' : e.n === 'y2' && e.v === 1 ? ' But gate ' + gate + ' still sees x2 = 1 on its late wire, together with the new y1 = 1: to the logic it looks as if x2 rose again. The circuit is pushed on towards row ' + (rowOf['10'] || '10') + ' and is now at ' + (() => { const cd = R.at('y2', e.t) + '' + R.at('y1', e.t); return cd + (rowOf[cd] ? ' (row ' + rowOf[cd] + ')' : ', the spare code'); })() + '.' : e.n === 'x2 late' && e.v === 0 ? ' Gate ' + gate + ' has finally seen x2 fall.' : '') })));
      const right = h ? h.once : null;
      F.add(Object.assign(V.wave(end), { say: (yEnd === right ? 'It settled in ' + yEnd + ' (row ' + rowOf[yEnd] + '), Z = ' + zEnd + ': correct. ' + (inp.loop ? 'The slower loops made the circuit wait until every gate had seen x2 fall: that is the cure for an essential hazard, delay in the feedback paths.' : 'The input reached every gate before the loops could move.') : 'It settled in ' + yEnd + (rowOf[yEnd] ? ' (row ' + rowOf[yEnd] + ')' : ' (the spare code, which was never meant to be a resting place)') + ', Z = ' + zEnd + ': the wrong place. Z claims a catch that never happened. No choice of cover removes this; it is in the flow table. The cure is to make the loops slower than the slowest input path.'), mark: 'end' }));
      return { frames: P10.scenes(F.list), def: { sections: [{ id: 'd', kind: 'math', title: 'Essential hazard', text: ['from a stable state, change one input:', 'once → ' + (h ? h.once : '?') + ',  three times → ' + (h ? h.thrice : '?'), '', 'a late input lets the loops', 'see the old value with the new y', '', 'cure: delay in the loops'].join('\n') }] } };
    },
    predict: [{ at: (f) => f.meta && f.meta.ask, pick: 'option', options: ['the right row (Z = 0)', 'the wrong row (Z = 1)'], ask: 'x2 falls now. Where will the circuit end up?', answer: (fr, i) => (fr[i].meta.wrong ? 'the wrong row (Z = 1)' : 'the right row (Z = 0)'), explain: (fr) => fr[fr.length - 1].say }],
    quiz: [
      { q: 'An essential hazard shows in the flow table as…', options: ['a critical race', 'one change of an input leading to a different row than three changes of it', 'a missing stable state', 'two outputs'], answer: 1, why: 'That is the test for an essential hazard.' },
      { q: 'Can a hazard-free cover remove an essential hazard?', options: ['Yes', 'No: it is in the specified behaviour, not in the logic\'s cover'], answer: 1, why: 'It comes from the table itself.' },
      { q: 'What cures an essential hazard?', options: ['a consensus term', 'delay in the feedback loops, so every gate sees the input change before the state changes', 'a faster input', 'a clock'], answer: 1, why: 'The loops must not run ahead of the inputs.' },
      { q: 'What makes it show in a real circuit?', options: ['an input that reaches some gate later than the loops react', 'a slow output', 'too many gates', 'NOR gates'], answer: 0, why: 'The gate sees the new state together with the old input.' },
    ],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
