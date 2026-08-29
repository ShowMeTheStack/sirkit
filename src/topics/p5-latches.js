// Part 5, latches: the SR latch from NOR gates settling one gate delay at a time, the forbidden input and the
// oscillation when both inputs drop together, the NAND latch with active-low inputs, the gated SR latch and the
// D latch with its transparency on a waveform. Every picture is a live run of the simulator, real delays and all.
(function (S) {
  'use strict';
  const K = S.Kit, TM = K.timing;
  const techs = [{ value: 'CMOS', label: 'CMOS (74HC-like)' }, { value: 'TTL', label: 'TTL (74-like)' }, { value: 'LS-TTL', label: 'LS-TTL' }];
  const techInput = { id: 'tech', kind: 'choice', label: 'Technology', def: 'CMOS', options: techs };
  const ns = TM.ns;
  const nm = (n) => n.replace("'", '′');

  S.family({ id: 'p5-latches', part: 'storage', order: 10, title: 'Latches', blurb: 'Two gates feeding each other hold a bit. Watch them settle one gate delay at a time, misbehave on the forbidden input, and become the gated and D latches.' });

  /** pairs of bits from text like "10 00 01": [[1, 0], [0, 0], ...] */
  const pairs = (txt) => String(txt).trim().split(/[\s,;]+/).filter(Boolean).map((p) => p.split('').map(Number));
  const pairCheck = (label, max) => (v) => {
    const ps = String(v).trim().split(/[\s,;]+/).filter(Boolean);
    if (!ps.length) return label + ': give at least one pair, like 10';
    if (ps.length > (max || 8)) return label + ': at most ' + (max || 8) + ' pairs, so the waveform stays readable';
    const bad = ps.find((p) => !/^[01]{2}$/.test(p));
    return bad ? label + ': "' + bad + '" is not two bits (write pairs like 10 00 01)' : null;
  };

  /**
   * The story of a cross-coupled pair between two moments: every change of a gate output, with the gate's inputs
   * a delay before (what made it change). gates: [{id, out, ins: [net names], type}]
   */
  function story(R, gates, a, b) {
    const out = [];
    for (const g of gates) {
      for (const [t, v] of R.changesIn(g.out, a, b)) {
        const tm = R.sim.timing(g.id), d = v === 1 ? tm.tpLH : tm.tpHL;
        out.push({ t, v, g, d, ins: g.ins.map((n) => ({ n, v: R.at(n, t - d) })) });
      }
    }
    return out.sort((x, y) => x.t - y.t);
  }
  const insText = (ins) => ins.map((i) => nm(i.n) + ' = ' + TM.say(i.v)).join(' and ');
  const stepSay = (e) => e.g.id + ' (' + e.g.type + ') sees ' + insText(e.ins) + ', so ' + e.d + ' ns later, at ' + ns(e.t) + ', ' + nm(e.g.out) + (e.v === 1 ? ' rises to 1.' : e.v === 0 ? ' falls to 0.' : ' becomes ' + TM.say(e.v) + '.');

  /** the function table of an SR latch, the row of the inputs lit */
  function fnTable(x, y, kind, s, r) {
    const nand = kind === 'nand';
    const rows = nand
      ? [['1', '1', 'Q (hold)'], ['0', '1', '1 (set)'], ['1', '0', '0 (reset)'], ['0', '0', 'Q = Q′ = 1 (avoid)']]
      : [['0', '0', 'Q (hold)'], ['1', '0', '1 (set)'], ['0', '1', '0 (reset)'], ['1', '1', 'Q = Q′ = 0 (avoid)']];
    const hit = rows.findIndex((rw) => rw[0] === String(s) && rw[1] === String(r));
    const t = K.table.draw({ x, y, prefix: 'ft', colHead: nand ? ['S′', 'R′', 'Q next'] : ['S', 'R', 'Q next'], rows, size: 14, hot: hit >= 0 ? [0, 1, 2].map((c) => [hit, c]) : [], cls: (rr, c) => (rr === 3 ? 'bad-row' : ''), title: nand ? 'NAND latch' : 'NOR latch' });
    return { items: t.items, box: t.box };
  }

  // ---------------------------------------------------------------------------------------------------
  // SR latch from NOR gates, settling
  // ---------------------------------------------------------------------------------------------------
  function latchRun(inp, kind) {
    const nand = kind === 'nand';
    const seq = pairs(inp.seq), step = inp.tech === 'CMOS' ? 40 : 50, t0 = 20;
    const c = nand ? TM.build.srNand() : TM.build.srNor();
    const sN = nand ? "S'" : 'S', rN = nand ? "R'" : 'R';
    const idle = nand ? 1 : 0;
    const stim = [[0, sN, idle], [0, rN, idle]];
    seq.forEach((p, k) => { stim.push([t0 + k * step, sN, p[0]], [t0 + k * step, rN, p[1]]); });
    const q0 = +inp.start;
    const end = t0 + seq.length * step + 10;
    const R = TM.run(c, { tech: inp.tech, deposit: { Q: q0, "Q'": 1 - q0 }, stim, until: end });
    const gates = nand
      ? [{ id: 'g1', out: 'Q', ins: [sN, "Q'"], type: 'NAND' }, { id: 'g2', out: "Q'", ins: [rN, 'Q'], type: 'NAND' }]
      : [{ id: 'g1', out: 'Q', ins: [rN, "Q'"], type: 'NOR' }, { id: 'g2', out: "Q'", ins: [sN, 'Q'], type: 'NOR' }];
    const signals = TM.signals(R, [sN, rN, 'Q', "Q'"].map((n) => ({ name: n, label: nm(n) })));
    const F = new S.Frames(['changes', 'delays']);
    const scene = (t, hot, extra, claims) => TM.frame({ R, t, hot, t1: end, signals, claims, side: (x, y) => fnTable(x, y + 16, kind, R.at(sN, t), R.at(rN, t)), extra }).items;
    F.add({ items: scene(10, null, null, { Q: q0, "Q'": 1 - q0, [sN]: idle, [rN]: idle }), say: 'The latch starts holding Q = ' + q0 + ', Q′ = ' + (1 - q0) + ' with ' + nm(sN) + ' = ' + nm(rN) + ' = ' + idle + ' (gates made into a loop power up unknown, so the run puts a value on the loop first). Each ' + (nand ? 'NAND' : 'NOR') + ' gate takes ' + R.sim.timing('g1').tpLH + ' ns to answer.', meta: {} });
    let prev = [idle, idle];
    seq.forEach((p, k) => {
      const ta = t0 + k * step, tb = ta + step;
      const ev = story(R, gates, ta, tb);
      const qEnd = R.at('Q', tb - 1), qnEnd = R.at("Q'", tb - 1);
      const same = p[0] === prev[0] && p[1] === prev[1];
      const both = nand ? p[0] === 0 && p[1] === 0 : p[0] === 1 && p[1] === 1;
      F.add({ items: scene(ta + 0.5, null, null, { [sN]: p[0], [rN]: p[1] }), say: 'At ' + ns(ta) + ' the inputs become ' + nm(sN) + ' = ' + p[0] + ', ' + nm(rN) + ' = ' + p[1] + '.' + (same ? ' They were already that.' : ' Nothing at the outputs has moved yet: each gate needs its delay.'), meta: { ask: !same && ev.length > 0, q: qEnd, first: ev.length ? ev[0].g.out : null }, mark: 'inputs' });
      ev.forEach((e, i) => {
        F.count('changes');
        F.count('delays', 1);
        F.add({ items: scene(e.t + 0.2, [e.g.id], null, { [e.g.out]: e.v }), say: stepSay(e), meta: { ev: e } });
      });
      let tail;
      if (!ev.length) tail = 'Nothing changes: ' + (same ? 'the inputs are the same as before' : nand ? 'with ' + nm(sN) + ' and ' + nm(rN) + ' at 1 the NAND gates just pass the loop around' : 'with S = R = 0 each NOR gate just inverts the other\'s output') + ', so the latch holds Q = ' + TM.say(qEnd) + '.';
      else if (both) tail = 'Settled after ' + ev.length + ' change' + (ev.length === 1 ? '' : 's') + ': Q = ' + qEnd + ' and Q′ = ' + qnEnd + '. They are no longer complements, which is why this input is avoided.';
      else tail = 'Settled after ' + ev.length + ' change' + (ev.length === 1 ? '' : 's') + ', ' + ns(ev[ev.length - 1].t - ta) + ' after the inputs moved: Q = ' + qEnd + ', Q′ = ' + qnEnd + '. ' + (ev.length === 2 ? 'The second gate could only answer once the first had: the loop takes two gate delays to settle.' : '');
      F.add({ items: scene(Math.min(tb - 1, ev.length ? ev[ev.length - 1].t + 4 : ta + 6), null, null, { Q: qEnd, "Q'": qnEnd }), say: tail.trim(), meta: { settled: true, q: qEnd } });
      prev = p;
    });
    F.add({ items: scene(end), say: 'The whole run: ' + nm(sN) + ' and ' + nm(rN) + ' at the top, the outputs under them. Every output edge comes one gate delay after the edge that caused it.', mark: 'end' });
    const def = { sections: [{ id: 'd', kind: 'math', title: nand ? 'The NAND latch' : 'The NOR latch', text: (nand
      ? ['Q = (S′ · Q′)′', 'Q′ = (R′ · Q)′', '', 'S′ = 0 sets, R′ = 0 resets,', 'both 1 holds; both 0 is avoided.']
      : ['Q = (R + Q′)′', 'Q′ = (S + Q)′', '', 'S = 1 sets, R = 1 resets,', 'both 0 holds; both 1 is avoided.']).join('\n') }] };
    return { frames: F.list, def };
  }
  const latchPredict = [
    { at: (f) => f.meta && f.meta.ask, pick: 'option', options: ['0', '1'], ask: 'The inputs have just changed. Once the latch settles, what will Q be?', answer: (fr, i) => String(fr[i].meta.q), explain: (fr, i) => { const j = fr.findIndex((x, k) => k > i && x.meta && x.meta.settled); return fr[j].say; } },
    { at: (f) => f.meta && f.meta.ask && f.meta.first, pick: 'option', options: ['Q', 'Q′'], ask: 'Which output moves first?', answer: (fr, i) => nm(fr[i].meta.first), explain: (fr, i) => fr[i + 1].say, once: true },
  ];

  S.topic({
    id: 'sr-nor', family: 'p5-latches', order: 10, title: 'SR latch from NOR gates',
    blurb: 'Two NOR gates, each feeding the other. Set it and reset it, and watch the change go round the loop one gate delay at a time until it settles.',
    inputs: [
      { id: 'seq', kind: 'text', label: 'Inputs over time (S R pairs)', def: '10 00 01 00', check: pairCheck('Inputs') },
      { id: 'start', kind: 'choice', label: 'Starting Q', def: '0', options: [{ value: '0', label: 'Q = 0' }, { value: '1', label: 'Q = 1' }] },
      techInput,
    ],
    check: (inp) => { const ps = pairs(inp.seq); for (let i = 1; i < ps.length; i++) if (ps[i - 1].join('') === '11' && ps[i].join('') === '00') return 'S = R = 1 straight to S = R = 0 is the race of the next topic ("The forbidden input"); put 10 or 01 between them'; return null; },
    presets: [
      { label: 'Set, hold, reset, hold', values: { seq: '10 00 01 00', start: '0' } },
      { label: 'Set when already set', values: { seq: '10 00 10 00', start: '1' } },
      { label: 'Reset from Q = 1', values: { seq: '01 00', start: '1' } },
      { label: 'Both 1, then reset', values: { seq: '10 11 01 00', start: '0' } },
      { label: 'Slower gates (TTL)', values: { seq: '10 00 01 00', start: '0', tech: 'TTL' } },
    ],
    counters: [{ id: 'changes', label: 'output changes' }],
    run: (inp) => latchRun(inp, 'nor'),
    predict: latchPredict,
    quiz: [
      { q: 'In a NOR latch, which input pair holds the stored bit?', options: ['S = 0, R = 0', 'S = 1, R = 0', 'S = 0, R = 1', 'S = 1, R = 1'], answer: 0, why: 'With both inputs 0 each NOR just inverts the other gate\'s output, so the loop keeps whatever it has.' },
      { q: 'Q = 0 and S rises to 1. Which output changes first?', options: ['Q rises first', 'Q′ falls first', 'Both at the same instant', 'Neither'], answer: 1, why: 'S feeds the gate that makes Q′; only after Q′ falls does the other gate see two 0s and raise Q.' },
      { q: 'With gate delay d, how long after S rises is the NOR latch settled (starting from Q = 0)?', options: ['d', '2d', '3d', 'It never settles'], answer: 1, why: 'One delay for Q′ to fall, a second for Q to rise.' },
      { q: 'S = R = 1 on a NOR latch gives…', options: ['Q = 1, Q′ = 0', 'Q = 0, Q′ = 1', 'Q = Q′ = 0', 'Q = Q′ = 1'], answer: 2, why: 'A NOR with any input at 1 outputs 0, so both outputs are 0, and they are no longer complements.' },
      { q: 'Why does a latch built from gates need a value put on it when simulated from power-up?', options: ['Gates have no delay', 'Its loop has no input that fixes the value, so it starts unknown (X)', 'NOR gates start at 1', 'It does not; it always starts at 0'], answer: 1, why: 'Nothing forces the loop until S or R is used, so the simulator cannot know whether it powered up holding 0 or 1.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // The forbidden input and the race when both drop together
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'sr-race', family: 'p5-latches', order: 20, title: 'The forbidden input: S = R = 1',
    blurb: 'Hold both inputs of a NOR latch at 1, then release them. If they fall together and the gates are equally fast, the loop oscillates; a small difference in delay or timing decides the winner instead.',
    inputs: [
      { id: 'd1', kind: 'number', label: 'Delay of g1 (makes Q), ns', def: 9, min: 2, max: 30 },
      { id: 'd2', kind: 'number', label: 'Delay of g2 (makes Q′), ns', def: 9, min: 2, max: 30 },
      { id: 'gap', kind: 'number', label: 'S falls this many ns after R', def: 0, min: -30, max: 30 },
    ],
    presets: [
      { label: 'Equal gates, released together: oscillates', values: { d1: 9, d2: 9, gap: 0 } },
      { label: 'g1 a little slower', values: { d1: 11, d2: 9, gap: 0 } },
      { label: 'g2 a little slower', values: { d1: 9, d2: 12, gap: 0 } },
      { label: 'S released 15 ns after R', values: { d1: 9, d2: 9, gap: 15 } },
      { label: 'R released 15 ns after S', values: { d1: 9, d2: 9, gap: -15 } },
    ],
    counters: [{ id: 'flips', label: 'output changes' }],
    run(inp) {
      const c = TM.build.srNor({ d1: inp.d1, d2: inp.d2 });
      const tUp = 20, tR = 80, tS = tR + inp.gap, end = Math.max(tR, tS) + 120;
      const R = TM.run(c, { deposit: { Q: 0, "Q'": 1 }, stim: [[0, 'S', 0], [0, 'R', 0], [tUp, 'S', 1], [tUp, 'R', 1], [tR, 'R', 0], [tS, 'S', 0]], until: end });
      const gates = [{ id: 'g1', out: 'Q', ins: ['R', "Q'"], type: 'NOR' }, { id: 'g2', out: "Q'", ins: ['S', 'Q'], type: 'NOR' }];
      const signals = TM.signals(R, ['S', 'R', 'Q', "Q'"].map((n) => ({ name: n, label: nm(n) })));
      const tFirst = Math.min(tR, tS);
      const marks = [{ t: tR, label: 'R falls', key: 'r' }].concat(inp.gap ? [{ t: tS, label: 'S falls', key: 's' }] : []);
      const F = new S.Frames(['flips']);
      const scene = (t, hot, claims) => TM.frame({ R, t, hot, t1: end, signals, claims, marks: t >= tFirst ? marks.filter((m) => m.t <= t) : [], side: (x, y) => fnTable(x, y + 16, 'nor', R.at('S', t), R.at('R', t)) }).items;
      F.add({ items: scene(10, null, { Q: 0, "Q'": 1 }), say: 'A NOR latch holding Q = 0. Gate g1 (makes Q) takes ' + inp.d1 + ' ns, gate g2 (makes Q′) takes ' + inp.d2 + ' ns.' });
      const tB = tUp + Math.max(inp.d1, inp.d2) * 2 + 2;
      F.add({ items: scene(tB, null, { S: 1, R: 1, Q: R.at('Q', tB), "Q'": R.at("Q'", tB) }), say: 'At ' + ns(tUp) + ' both S and R go to 1. Each NOR now has a 1 on an input, so both outputs go to 0: Q = ' + R.at('Q', tB) + ', Q′ = ' + R.at("Q'", tB) + '. The latch is no longer storing a bit, and both gates are only waiting.' });
      const after = story(R, gates, tFirst - 0.01, end);
      const osc = after.length > 6;
      const final = R.at('Q', end);
      const why = osc ? 'It never settles: oscillation.' : 'Q settles at ' + final + '.';
      F.add({ items: scene(tFirst + 0.5), say: (inp.gap === 0 ? 'At ' + ns(tR) + ' both inputs fall together.' : (inp.gap > 0 ? 'R falls at ' + ns(tR) + '; S stays at 1 until ' + ns(tS) + '.' : 'S falls at ' + ns(tS) + '; R stays at 1 until ' + ns(tR) + '.')) + ' Now each gate sees two 0s…', meta: { ask: true, osc, final }, mark: 'release' });
      const shown = after.slice(0, 8);
      shown.forEach((e, i) => {
        F.count('flips');
        let extra = '';
        if (osc && i === 1 && inp.d1 === inp.d2) extra = ' Both gates moved at the same moment, so each now sees the other\'s 1, and both will fall again.';
        if (!osc && i === after.length - 1) extra = ' That breaks the tie: the loop is stable again.';
        F.add({ items: scene(e.t + 0.2, [e.g.id], { [e.g.out]: e.v }), say: stepSay(e) + extra });
      });
      if (osc) F.set('flips', after.length);
      F.add({ items: scene(end, null, osc ? {} : { Q: final, "Q'": 1 - final }), say: osc ? 'Q and Q′ rise and fall together every ' + (inp.d1 + inp.d2) / 2 + ' ns or so, for as long as the gates stay exactly matched: ' + after.length + ' changes in ' + ns(end - tFirst) + '. Real gates are never exactly matched, so in practice the latch drops out at a value nobody can predict.' : 'Settled: Q = ' + final + ', Q′ = ' + (1 - final) + '. ' + (inp.gap ? 'The input that stayed 1 longer won: it acted alone, as a plain ' + (inp.gap > 0 ? 'set' : 'reset') + '.' : 'The faster gate rose first and its 1 forced the slower one to stay at 0, so the result depends on which gate is faster, something the designer does not control.'), mark: 'end', meta: { osc } });
      const def = { sections: [{ id: 'd', kind: 'math', title: 'Why S = R = 1 is avoided', text: ['S = R = 1  →  Q = Q′ = 0', '', 'both fall together:', 'equal delays → oscillation', 'unequal delays → the faster gate wins', '', 'one falls first → the other acts alone'].join('\n') }] };
      return { frames: F.list, def };
    },
    predict: [
      { at: (f) => f.meta && f.meta.ask, pick: 'option', options: ['Q settles at 0', 'Q settles at 1', 'It oscillates'], ask: 'Both gates see two 0s. What happens?', answer: (fr, i) => (fr[i].meta.osc ? 'It oscillates' : 'Q settles at ' + fr[i].meta.final), explain: (fr) => fr[fr.length - 1].say },
    ],
    quiz: [
      { q: 'After S = R = 1, a NOR latch has both inputs dropped at the same moment, and its two gates have identical delays. In the simulation…', options: ['Q goes to 1', 'Q goes to 0', 'Q and Q′ oscillate together', 'Q goes to Z'], answer: 2, why: 'Both gates rise together, then both see a 1 and fall together, forever.' },
      { q: 'If R falls well before S, the latch ends with…', options: ['Q = 1', 'Q = 0', 'Q unknown', 'an oscillation'], answer: 0, why: 'With R gone, S = 1 acts alone as a set.' },
      { q: 'Why can the outcome of releasing S = R = 1 together not be relied on?', options: ['It depends on which gate is faster or which input falls first, which the designer does not control', 'NOR gates are unreliable', 'It always gives Q = 0', 'It depends on the clock'], answer: 0, why: 'Tiny differences in delay or timing decide the winner, so the result is unpredictable.' },
      { q: 'For a NAND latch, the corresponding forbidden input is…', options: ['S′ = R′ = 1', 'S′ = R′ = 0', 'S′ = 1, R′ = 0', 'there is none'], answer: 1, why: 'Its inputs are active low: both at 0 drive Q = Q′ = 1.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // SR latch from NAND gates
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'sr-nand', family: 'p5-latches', order: 30, title: 'SR latch from NAND gates',
    blurb: 'The same loop built from NAND gates. Its inputs work when they are 0 (active low): S′ = 0 sets, R′ = 0 resets, and both at 1 hold.',
    inputs: [
      { id: 'seq', kind: 'text', label: "Inputs over time (S′ R′ pairs)", def: '01 11 10 11', check: pairCheck('Inputs') },
      { id: 'start', kind: 'choice', label: 'Starting Q', def: '0', options: [{ value: '0', label: 'Q = 0' }, { value: '1', label: 'Q = 1' }] },
      techInput,
    ],
    check: (inp) => { const ps = pairs(inp.seq); for (let i = 1; i < ps.length; i++) if (ps[i - 1].join('') === '00' && ps[i].join('') === '11') return 'S′ = R′ = 0 straight to 11 races (see "The forbidden input"); put 01 or 10 between them'; return null; },
    presets: [
      { label: 'Set, hold, reset, hold', values: { seq: '01 11 10 11', start: '0' } },
      { label: 'Reset from Q = 1', values: { seq: '10 11', start: '1' } },
      { label: 'A short set pulse', values: { seq: '11 01 11 11', start: '0' } },
      { label: 'Both 0, then set', values: { seq: '00 01 11', start: '0' } },
    ],
    counters: [{ id: 'changes', label: 'output changes' }],
    run: (inp) => latchRun(inp, 'nand'),
    predict: latchPredict,
    quiz: [
      { q: 'In a NAND latch, which inputs hold the stored bit?', options: ["S′ = 0, R′ = 0", "S′ = 1, R′ = 1", "S′ = 0, R′ = 1", "S′ = 1, R′ = 0"], answer: 1, why: 'A NAND with one input at 1 inverts its other input, so the loop keeps its value.' },
      { q: 'S′ = 0 on a NAND latch…', options: ['resets Q to 0', 'sets Q to 1', 'holds Q', 'makes Q unknown'], answer: 1, why: 'A NAND with a 0 input outputs 1: Q goes to 1.' },
      { q: 'Why are the NAND latch inputs called active low?', options: ['They act when they are 0', 'They need a low voltage supply', 'They are slower', 'They are inverted outputs'], answer: 0, why: 'The latch does something (set or reset) only when the input is at 0.' },
      { q: 'S′ = R′ = 0 gives…', options: ['Q = Q′ = 1', 'Q = Q′ = 0', 'Q = 1, Q′ = 0', 'an oscillation at once'], answer: 0, why: 'Both NANDs have a 0 input, so both output 1.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Gated SR latch
  // ---------------------------------------------------------------------------------------------------
  /** a text of bit values over equal steps, like "0110" */
  const bitsCheck = (label, max) => (v) => (/^[01]+$/.test(String(v).replace(/\s+/g, '')) ? (String(v).replace(/\s+/g, '').length > (max || 12) ? label + ': at most ' + (max || 12) + ' values' : null) : label + ': write the values as 0s and 1s, like 0110');
  const bitsOf = (v) => String(v).replace(/\s+/g, '').split('').map(Number);
  S.topic({
    id: 'gated-sr', family: 'p5-latches', order: 40, title: 'The gated SR latch',
    blurb: 'Two NAND gates in front of the latch let S and R through only while the enable EN is 1. With EN = 0 the latch ignores its inputs completely.',
    inputs: [
      { id: 's', kind: 'text', label: 'S, one value per 30 ns', def: '01100000', check: bitsCheck('S') },
      { id: 'r', kind: 'text', label: 'R, one value per 30 ns', def: '00000110', check: bitsCheck('R') },
      { id: 'en', kind: 'text', label: 'EN, one value per 30 ns', def: '00110011', check: bitsCheck('EN') },
    ],
    check: (inp) => { const a = [inp.s, inp.r, inp.en].map(bitsOf); if (a[0].length !== a[1].length || a[1].length !== a[2].length) return 'S, R and EN need the same number of values'; for (let i = 0; i < a[0].length; i++) if (a[0][i] && a[1][i] && a[2][i]) return 'Step ' + (i + 1) + ' has S = R = EN = 1, the forbidden input; avoid it'; return null; },
    presets: [
      { label: 'Set ignored, then set and reset while enabled', values: { s: '01100000', r: '00000110', en: '00110011' } },
      { label: 'Enable closes first', values: { s: '00110000', r: '00000000', en: '01100000' } },
      { label: 'Inputs only while disabled: nothing happens', values: { s: '01001000', r: '00100100', en: '10000001' } },
    ],
    counters: [{ id: 'changes', label: 'Q changes' }],
    run(inp) {
      const sv = bitsOf(inp.s), rv = bitsOf(inp.r), ev = bitsOf(inp.en), step = 30, n = sv.length, end = n * step + 10;
      const c = TM.build.gatedSR();
      const stim = [];
      for (let i = 0; i < n; i++) stim.push([i * step, 'S', sv[i]], [i * step, 'R', rv[i]], [i * step, 'EN', ev[i]]);
      const R = TM.run(c, { deposit: { Q: 0, "Q'": 1, "S'": 1, "R'": 1 }, stim, until: end });
      const signals = TM.signals(R, ['EN', 'S', 'R', "S'", "R'", 'Q'].map((x) => ({ name: x, label: nm(x) })));
      const F = new S.Frames(['changes']);
      const scene = (t, hot, claims) => TM.frame({ R, t, hot, t1: end, signals, claims, ticks: Math.min(n, 8) }).items;
      F.add({ items: scene(1, null, { Q: 0 }), say: 'A NAND latch with two steering NANDs in front: g3 makes S′ = (S·EN)′ and g4 makes R′ = (R·EN)′. While EN = 0 both are 1, the hold input of a NAND latch. The latch starts at Q = 0.' });
      for (let i = 0; i < n; i++) {
        const ta = i * step, tb = ta + step;
        const q0 = R.at('Q', ta - 0.01 < 0 ? 0 : ta - 0.01), q1 = R.at('Q', tb - 0.5);
        const changed = R.changesIn('Q', ta, tb).length;
        F.count('changes', changed);
        let say = 'Step ' + (i + 1) + ': S = ' + sv[i] + ', R = ' + rv[i] + ', EN = ' + ev[i] + '. ';
        if (!ev[i]) say += (sv[i] || rv[i] ? 'The enable is 0, so g3 and g4 stay at 1 and the ' + (sv[i] ? 'S' : 'R') + ' is ignored: ' : 'Nothing is enabled: ') + 'Q stays ' + q1 + '.';
        else if (sv[i]) say += 'Enabled, so S′ = 0 and the latch sets: Q = ' + q1 + (q0 === q1 ? ' (it already was).' : ', ' + ns(R.changesIn('Q', ta, tb)[0][0] - ta) + ' after the step began (two gates in front plus the loop).');
        else if (rv[i]) say += 'Enabled, so R′ = 0 and the latch resets: Q = ' + q1 + (q0 === q1 ? ' (it already was).' : '.');
        else say += 'Enabled, but S = R = 0: Q holds at ' + q1 + '.';
        F.add({ items: scene(tb - 0.5, ev[i] && (sv[i] || rv[i]) ? [sv[i] ? 'g3' : 'g4'] : [], { S: sv[i], R: rv[i], EN: ev[i], Q: ev[i] && sv[i] ? 1 : ev[i] && rv[i] ? 0 : q0 === 'x' ? q1 : q0 }), say, meta: { q: q1, en: ev[i], act: sv[i] || rv[i] } });
      }
      F.add({ items: scene(end), say: 'S and R reached the latch only while EN was 1: ' + ev.filter(Boolean).length + ' of ' + n + ' steps. That window is what the clock will provide.', mark: 'end' });
      const def = { sections: [{ id: 'd', kind: 'math', title: 'Gated SR latch', text: ["S′ = (S · EN)′", "R′ = (R · EN)′", '', 'EN = 0: hold, whatever S and R', 'EN = 1: an SR latch'].join('\n') }] };
      return { frames: F.list, def };
    },
    predict: [
      { at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.act, pick: 'option', options: ['0', '1'], ask: 'Next step: what will Q be at its end?', answer: (fr, i) => String(fr[i + 1].meta.q), explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'In a gated SR latch, EN = 0 means…', options: ['the latch resets', 'the latch holds, whatever S and R are', 'Q follows S', 'Q = Q′'], answer: 1, why: 'Both steering NANDs output 1, the hold input of the NAND latch.' },
      { q: 'The steering gates of a gated SR latch built from NANDs make S′ = …', options: ['(S + EN)′', '(S · EN)′', 'S · EN', 'S ⊕ EN'], answer: 1, why: 'A NAND of S and EN: 0 only when both are 1.' },
      { q: 'S = 1 arrives while EN = 0, then EN rises with S still 1. The latch…', options: ['ignores S for good', 'sets when EN rises', 'resets', 'oscillates'], answer: 1, why: 'The latch looks at S whenever EN is 1, so it sets as soon as EN rises.' },
      { q: 'Which input combination must still be avoided while EN = 1?', options: ['S = R = 0', 'S = 1, R = 0', 'S = R = 1', 'none'], answer: 2, why: 'It drives both NAND latch inputs to 0, the forbidden input.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // D latch and transparency
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'd-latch', family: 'p5-latches', order: 50, title: 'The D latch: transparent while enabled',
    blurb: 'Make R the complement of S and call the one input D: the forbidden input can no longer happen. While EN = 1, Q follows D (the latch is transparent); when EN falls, Q keeps the last D.',
    inputs: [
      { id: 'd', kind: 'text', label: 'D, one value per 40 ns', def: '0110100110', check: bitsCheck('D', 14) },
      { id: 'en', kind: 'text', label: 'EN, one value per 40 ns', def: '0011100011', check: bitsCheck('EN', 14) },
    ],
    check: (inp) => (bitsOf(inp.d).length !== bitsOf(inp.en).length ? 'D and EN need the same number of values' : null),
    presets: [
      { label: 'Two enable windows', values: { d: '0110100110', en: '0011100011' } },
      { label: 'D wiggles while enabled: Q wiggles too', values: { d: '0101010100', en: '0111111000' } },
      { label: 'Enabled the whole time: a wire', values: { d: '0110010110', en: '1111111111' } },
      { label: 'Never enabled', values: { d: '0110010110', en: '0000000000' } },
    ],
    counters: [{ id: 'follow', label: 'Q changes' }],
    run(inp) {
      // each step is long enough for a change of D to get through the inverter, a steering gate and the loop
      const dv = bitsOf(inp.d), ev = bitsOf(inp.en), step = 40, n = dv.length, end = n * step + 12;
      const c = TM.build.dLatch();
      const stim = [];
      for (let i = 0; i < n; i++) stim.push([i * step, 'D', dv[i]], [i * step, 'EN', ev[i]]);
      const R = TM.run(c, { deposit: { Q: 0, "Q'": 1, "S'": 1, "R'": 1 }, stim, until: end });
      // the windows where the latch is transparent
      const spans = [];
      for (let i = 0; i < n; i++) if (ev[i] && (i === 0 || !ev[i - 1])) { let j = i; while (j + 1 < n && ev[j + 1]) j++; spans.push({ t0: i * step, t1: (j + 1) * step, label: 'transparent', rows: ['EN', 'D', 'Q'], cls: 'open', key: 'w' + i }); }
      const signals = TM.signals(R, ['EN', 'D', 'Q']);
      const F = new S.Frames(['follow']);
      const scene = (t, hot, claims) => TM.frame({ R, t, hot, t1: end, signals, claims, spans: spans.filter((s) => s.t0 <= t), ticks: 5 }).items;
      const inv = R.sim.timing('inv').tpLH;
      F.add({ items: scene(1), say: 'The gated latch with an inverter making R = D′: S and R can never both be 1. Q starts at 0. Shaded on the waveform: the times EN = 1, when the latch is transparent.' });
      for (let i = 0; i < n; i++) {
        const ta = i * step, tb = ta + step;
        const ch = R.changesIn('Q', ta, tb + 0.01);
        F.count('follow', ch.length);
        const q = R.at('Q', tb - 0.01);
        let say;
        if (ev[i]) say = 'EN = 1, D = ' + dv[i] + ': transparent, so Q = D = ' + q + (ch.length ? ', ' + ns(ch[0][0] - ta) + ' after the change (inverter, steering gate, then the loop).' : ' (already).');
        else if (i > 0 && ev[i - 1]) say = 'EN falls with D = ' + dv[i - 1] + ' in the latch: Q keeps ' + q + '. ' + (dv[i] !== dv[i - 1] ? 'D changes to ' + dv[i] + ' at the same moment, but the steering gates are already closed.' : '');
        else say = 'EN = 0: D = ' + dv[i] + ' is ignored; Q holds ' + q + '.';
        F.add({ items: scene(tb - 0.01, ev[i] ? ['g3', 'g4'] : [], { EN: ev[i], D: dv[i], Q: ev[i] ? dv[i] : q }), say: say.trim(), meta: { q, en: ev[i], d: dv[i], ask: !ev[i] && i > 0 && dv[i] !== q } });
      }
      F.add({ items: scene(end), say: 'While EN was 1 the output copied D, wiggles and all; while EN was 0 it held the value D had when EN fell. A latch is level-sensitive: it listens for the whole time the enable is 1.' + (inv ? '' : ''), mark: 'end' });
      const def = { sections: [{ id: 'd', kind: 'math', title: 'D latch', text: ['EN = 1:  Q = D  (transparent)', 'EN = 0:  Q holds', '', 'Q(next) = EN·D + EN′·Q'].join('\n') }] };
      return { frames: F.list, def };
    },
    predict: [
      { at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.en !== undefined && i > 0, pick: 'option', options: ['0', '1'], ask: (fr, i) => 'Next: EN = ' + fr[i + 1].meta.en + ', D = ' + fr[i + 1].meta.d + '. What will Q be?', answer: (fr, i) => String(fr[i + 1].meta.q), explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'While EN = 1, a D latch…', options: ['holds Q', 'passes D through to Q', 'toggles', 'resets'], answer: 1, why: 'It is transparent: Q follows D.' },
      { q: 'Why can a D latch never get the forbidden SR input?', options: ['Its gates are faster', 'R is made the complement of S, so they are never both 1', 'It has no enable', 'It uses NOR gates'], answer: 1, why: 'S = D and R = D′ are always different.' },
      { q: 'D changes three times while EN = 1. Q changes…', options: ['once', 'three times', 'never', 'only when EN falls'], answer: 1, why: 'A latch is level-sensitive; every change of D gets through while it is enabled.' },
      { q: 'The characteristic equation of a D latch with enable EN is…', options: ['Q(next) = D', 'Q(next) = EN·D + EN′·Q', 'Q(next) = D ⊕ Q', 'Q(next) = EN + D'], answer: 1, why: 'Q takes D when enabled and keeps Q otherwise.' },
    ],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
