// Part 5, timing: setup, hold and clock-to-Q with violations made to happen, metastability (X, then a value
// nobody chose), the two-flip-flop synchroniser, the minimum clock period from the critical path, clock skew,
// and the analysis of a clocked circuit into equations, a state table and a state diagram that then lights up
// in step with a run.
(function (S) {
  'use strict';
  const K = S.Kit, TM = K.timing, N = S.Netlist, G = TM.G;
  const ns = TM.ns;
  const nm = (n) => n.replace(/'/g, '′');
  const techs = [{ value: 'CMOS', label: 'CMOS (74HC-like)' }, { value: 'TTL', label: 'TTL (74-like)' }, { value: 'LS-TTL', label: 'LS-TTL' }, { value: 'FPGA', label: 'FPGA-like' }];

  S.family({ id: 'p5-timing', part: 'storage', order: 30, title: 'Timing', blurb: 'Setup, hold and clock-to-Q; what happens when they are broken; how fast a clock can go; skew; and reading a clocked circuit back into its state diagram.' });

  // ---------------------------------------------------------------------------------------------------
  // Setup, hold and clock-to-Q
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'setup-hold', family: 'p5-timing', order: 10, title: 'Setup, hold and clock-to-Q',
    blurb: 'D must be steady for a setup time before the clock edge and a hold time after it; Q answers a clock-to-Q delay later. Move the change of D into that window and the flip-flop cannot decide.',
    inputs: [
      { id: 'off', kind: 'number', label: 'D rises this many ns after the edge at 150 ns (negative: before)', def: -5, min: -40, max: 40, integer: false },
      { id: 'tech', kind: 'choice', label: 'Technology', def: 'CMOS', options: techs.slice(0, 3) },
      { id: 'seed', kind: 'number', label: 'Seed (how a metastable output resolves)', def: 1, min: 1, max: 99 },
    ],
    presets: [
      { label: 'In good time: 30 ns before', values: { off: -30 } },
      { label: 'Setup broken: 5 ns before', values: { off: -5 } },
      { label: 'At the edge itself', values: { off: 0 } },
      { label: 'Hold broken: 1 ns after', values: { off: 1 } },
      { label: 'Just after the hold time', values: { off: 6 } },
      { label: 'TTL: wider window', values: { off: -15, tech: 'TTL' } },
    ],
    counters: [{ id: 'viol', label: 'violations' }],
    run(inp) {
      const c = TM.build.ff('DFF');
      const E = 150, tD = E + inp.off, end = 300;
      const R = TM.run(c, { tech: inp.tech, period: 100, phase: 50, powerUp: 0, seed: inp.seed, stim: [[0, 'D', 0], [tD, 'D', 1]], until: end });
      const tm = R.sim.timing('ff'), tsu = tm.tsu, th = tm.th, tcq = tm.tpLH;
      const signals = TM.signals(R, ['CLK', 'D', 'Q']);
      const v = R.violations.filter((x) => x.kind === 'setup' || x.kind === 'hold');
      const kind = v.length ? v[0].kind : null;
      const qx = R.changes('Q').find((q) => q[1] === 'x' && q[0] > 20);
      const qAfter = R.at('Q', E + tcq + tm.tres + 5);
      const F = new S.Frames(['viol']);
      const win = (k) => [{ t0: E - tsu, t1: E, rows: ['D'], cls: 'setup', label: 'setup ' + tsu, key: 'su' }, { t0: E, t1: E + th, rows: ['D'], cls: 'hold', key: 'h' }].slice(0, k);
      const marks = (t) => [50, 150].filter((e) => e <= t).map((e) => ({ t: e, key: 'e' + e, cls: e === E ? 'hot' : '' }));
      const scene = (t, sp, hot) => TM.frame({ R, t, hot, t0: 20, t1: 230, signals, spans: sp, waveW: 600, marks: marks(t), side: (x, y) => ({ items: [TM.badge('b:su', x, y + 4, 'tsu', tsu + ' ns'), TM.badge('b:h', x, y + 42, 'th', th + ' ns'), TM.badge('b:cq', x, y + 80, 'tcq', tcq + ' ns')], box: { x, y, w: 120, h: 110 } }) }).items;
      F.add({ items: scene(30), say: 'A rising-edge D flip-flop (' + inp.tech + '): setup time ' + tsu + ' ns, hold time ' + th + ' ns, clock-to-Q ' + tcq + ' ns. The clock rises at 50, 150 and 250 ns.' });
      TM.verify(R, 50 + tcq + 4, { Q: 0, D: 0 });
      F.add({ items: scene(50 + tcq + 4, [], ['ff']), say: 'Edge at 50 ns, D = 0 and steady: Q = 0 (from the unknown power-up value), ' + tcq + ' ns after the edge. That is the clock-to-Q delay.' });
      F.add({ items: scene(E - tsu - 1, win(2)), say: 'Before the edge at ' + ns(E) + ', D must not change between ' + ns(E - tsu) + ' and ' + ns(E + th) + ': the setup window (' + tsu + ' ns before) and the hold window (' + th + ' ns after). D will rise at ' + ns(tD) + '.', meta: { ask: true, kind } });
      F.count('viol', v.length);
      F.add({ items: scene(Math.max(tD, E) + 0.5, win(2).map((s) => Object.assign({}, s, { cls: s.cls + (kind === (s.cls === 'setup' ? 'setup' : 'hold') ? ' bad' : '') }))), say: kind ? v[0].say : 'D rose at ' + ns(tD) + ', ' + (tD < E ? (E - tD) + ' ns before the edge: outside the setup window, so the flip-flop sees a clean 1.' : (tD - E) + ' ns after the edge: past the hold time, so this edge saw a clean 0 and the next edge will take the 1.'), meta: { kind } });
      if (qx) F.add({ items: scene(qx[0] + 2, win(2).map((s) => Object.assign({}, s, { cls: s.cls + (kind === s.cls ? ' bad' : '') })).concat([{ t0: qx[0], t1: qx[0] + tm.tres, rows: ['Q'], cls: 'meta', key: 'mx', label: 'X' }]), ['ff']), say: 'At ' + ns(qx[0]) + ' Q goes to X: the flip-flop caught D in the middle of changing and its internal latch is balanced between 0 and 1 (metastable). The simulator shows that as X for the ' + tm.tres + ' ns it takes to fall one way.', meta: { ask2: true, q: qAfter } });
      if (!qx) TM.verify(R, E + tcq + tm.tres + 6, { Q: tD < E ? 1 : 0 });
      F.add({ items: scene(E + tcq + tm.tres + 6, win(2)), say: qx ? 'It resolved to ' + qAfter + ' at ' + ns(qx[0] + tm.tres) + '. ' + (qAfter === 1 ? 'This time it took the new value.' : 'This time it kept the old value.') + ' Which way it falls is not under anyone\'s control: try another seed.' : 'Q = ' + qAfter + ' at ' + ns(E + tcq) + ', a clean clock-to-Q after the edge. ' + (qAfter === 1 ? 'The edge took the new value.' : 'The edge took the old value; the 1 waits for the next edge.') });
      F.add({ items: scene(230), mark: 'end', say: 'By the next edge, at 250 ns, D will have been steady at 1 for a long time, so Q will be ' + R.at('Q', end) + ' whatever happened at 150 ns. A violation spoils one edge, but the damage can spread: logic fed by an X or by the wrong value acts on it.' });
      return { frames: F.list, def: { sections: [{ id: 'd', kind: 'math', title: 'The window around the edge', text: ['D steady from  t_edge − tsu', '          to    t_edge + th', 'Q valid at     t_edge + tcq', '', inp.tech + ': tsu = ' + tsu + ', th = ' + th + ', tcq = ' + tcq + ' ns'].join('\n') }] } };
    },
    predict: [
      { at: (f) => f.meta && f.meta.ask, pick: 'option', options: ['No violation', 'Setup violation', 'Hold violation'], ask: 'D will change at the time shown. Is that a problem for the edge at 150 ns?', answer: (fr, i) => (fr[i].meta.kind === 'setup' ? 'Setup violation' : fr[i].meta.kind === 'hold' ? 'Hold violation' : 'No violation'), explain: (fr, i) => fr[i + 1].say },
      { at: (f) => f.meta && f.meta.ask2, pick: 'option', options: ['0', '1', 'Cannot be predicted'], ask: 'Q is metastable. What value will it settle at?', answer: 'Cannot be predicted', explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'Setup time is…', options: ['how long D must be steady before the clock edge', 'how long after the edge Q changes', 'how long D must be steady after the edge', 'the clock period'], answer: 0, why: 'The flip-flop needs D settled for tsu before it samples.' },
      { q: 'tsu = 12 ns, th = 3 ns, edge at 100 ns. D changes at 90 ns. This is…', options: ['fine', 'a setup violation', 'a hold violation', 'a clock-to-Q violation'], answer: 1, why: '90 ns is inside the 88–100 ns setup window.' },
      { q: 'Clock-to-Q is…', options: ['the delay from the active edge to the new Q', 'the clock period', 'the setup time plus the hold time', 'the time D takes to reach the flip-flop'], answer: 0, why: 'It is the flip-flop\'s own propagation delay.' },
      { q: 'A setup violation may cause…', options: ['nothing', 'a metastable output that settles to 0 or 1 unpredictably', 'the clock to stop', 'Q to stay at Z'], answer: 1, why: 'Sampling a changing input can leave the storage loop balanced for a while.' },
      { q: 'D changes 1 ns after the edge, th = 3 ns. This is…', options: ['fine', 'a setup violation', 'a hold violation', 'a pulse-width violation'], answer: 2, why: 'D must stay steady for th after the edge.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Metastability
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'metastability', family: 'p5-timing', order: 20, title: 'Metastability',
    blurb: 'An input that knows nothing of the clock will sooner or later change inside the setup and hold window. Each time, the flip-flop output hangs between 0 and 1 for a while and then falls, at random, one way or the other.',
    inputs: [
      { id: 'off', kind: 'number', label: 'D changes this many ns before each edge', def: 4, min: 0, max: 30 },
      { id: 'n', kind: 'number', label: 'Clock edges', def: 8, min: 4, max: 10 },
      { id: 'seed', kind: 'number', label: 'Seed', def: 3, min: 1, max: 99 },
    ],
    presets: [
      { label: 'Inside the window every time', values: { off: 4, seed: 3 } },
      { label: 'Another seed', values: { off: 4, seed: 11 } },
      { label: 'Right at the edge', values: { off: 0, seed: 5 } },
      { label: 'Outside the window', values: { off: 20, seed: 3 } },
    ],
    counters: [{ id: 'meta', label: 'metastable edges' }, { id: 'new', label: 'resolved to the new D' }],
    run(inp) {
      const c = TM.build.ff('DFF');
      const P = 100, n = inp.n, end = n * P + 4;
      const stim = [[0, 'D', 0]];
      for (let k = 0; k < n; k++) stim.push([k * P + 50 - inp.off, 'D', (k + 1) % 2]);
      const R = TM.run(c, { period: P, phase: 50, powerUp: 0, seed: inp.seed, stim, until: end });
      const tm = R.sim.timing('ff');
      const signals = TM.signals(R, ['CLK', 'D', 'Q']);
      const F = new S.Frames(['meta', 'new']);
      const xs = R.changes('Q').filter((q) => q[1] === 'x' && q[0] > 20);
      const spans = (t) => xs.filter((q) => q[0] <= t).map((q, i) => ({ t0: q[0], t1: q[0] + tm.tres, rows: ['Q'], cls: 'meta', key: 'x' + i }));
      const scene = (t) => TM.frame({ R, t, t1: end, signals, spans: spans(t), ticks: n }).items;
      F.add({ items: scene(20), say: 'D toggles once per clock period, each time ' + inp.off + ' ns before the rising edge. The setup time is ' + tm.tsu + ' ns, so ' + (inp.off < tm.tsu ? 'every change lands inside the window.' : 'every change is in good time.'), meta: {} });
      for (let k = 0; k < n; k++) {
        const e = k * P + 50, newD = (k + 1) % 2, after = e + tm.tpLH + tm.tres + 3;
        const x = xs.find((q) => q[0] > e && q[0] < e + 40);
        const q = R.at('Q', after);
        if (x) { F.count('meta'); if (q === newD) F.count('new'); }
        if (!x) TM.verify(R, Math.min(end, after), { Q: newD });
        F.add({ items: scene(Math.min(end, after)), say: 'Edge ' + (k + 1) + ' at ' + ns(e) + ': D has just changed to ' + newD + '. ' + (x ? 'Q goes to X at ' + ns(x[0]) + ' and resolves to ' + q + (q === newD ? ' (the new value).' : ' (the old value).') : 'Q = ' + q + ', cleanly.'), meta: { ask: k === 1, meta: !!x } });
      }
      const m = F.counts.meta;
      F.add({ items: scene(end), mark: 'end', say: m ? m + ' of ' + n + ' edges went metastable; ' + F.counts.new + ' resolved to the new D and ' + (m - F.counts.new) + ' to the old one, with no pattern to it. A real flip-flop also usually resolves fast, but the time it may take has no fixed bound: the longer one waits, the less likely it is still undecided.' : 'No edge went metastable: D was always steady through the window.' });
      return { frames: F.list, def: { sections: [{ id: 'd', kind: 'math', title: 'Metastability', text: ['a change inside [edge − tsu, edge + th]', '→ Q may hang between 0 and 1,', '  then fall either way', '', 'the chance it is still undecided', 'after waiting t falls off', 'exponentially with t'].join('\n') }] } };
    },
    predict: [
      { at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.ask, pick: 'option', options: ['A clean new value', 'X, then 0 or 1 at random', 'Z'], ask: 'What will Q do after the next edge?', answer: (fr, i) => (fr[i + 1].meta.meta ? 'X, then 0 or 1 at random' : 'A clean new value'), explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'A metastable flip-flop output…', options: ['is stuck forever', 'hangs between 0 and 1 for a while, then settles to either', 'always settles to the new value', 'always settles to the old value'], answer: 1, why: 'Which way it falls, and when, is not determined by the logic.' },
      { q: 'Metastability can only happen when…', options: ['the clock is too slow', 'an input changes inside the setup/hold window', 'there is no clock', 'the flip-flop has a reset'], answer: 1, why: 'Inputs steady through the window are sampled cleanly.' },
      { q: 'Can metastability be eliminated completely for an input that is not synchronised to the clock?', options: ['Yes, with a faster flip-flop', 'No, only made very unlikely', 'Yes, with a reset', 'Yes, by slowing the input'], answer: 1, why: 'Such an input will sometimes change in the window; the remedy is to give the output time to settle.' },
      { q: 'Waiting longer before using a possibly metastable output…', options: ['makes failure exponentially less likely', 'makes no difference', 'makes it worse', 'guarantees a 1'], answer: 0, why: 'The chance of still being undecided falls off exponentially with time.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // The two-flip-flop synchroniser
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'synchroniser', family: 'p5-timing', order: 30, title: 'The two-flip-flop synchroniser',
    blurb: 'An asynchronous input goes through two flip-flops in a row. The first may go metastable; the second samples it a whole clock later, by when it has almost surely settled. The rest of the circuit sees only clean values.',
    inputs: [
      { id: 'times', kind: 'text', label: 'Times the input changes (ns)', def: '47, 162, 249, 395, 548', check: (v) => { const t = String(v).split(/[\s,]+/).filter(Boolean).map(Number); if (!t.length || t.some((x) => !(x > 0 && x < 690))) return 'Times: numbers between 0 and 690'; if (t.length > 8) return 'Times: at most 8'; return null; } },
      { id: 'seed', kind: 'number', label: 'Seed', def: 2, min: 1, max: 99 },
    ],
    presets: [
      { label: 'Three changes near edges', values: { times: '47, 162, 249, 395, 548' } },
      { label: 'Every change near an edge', values: { times: '48, 151, 249, 349, 452, 551' } },
      { label: 'Changes far from the edges', values: { times: '90, 210, 300, 520' } },
    ],
    counters: [{ id: 'x1', label: 'X on the first' }, { id: 'x2', label: 'X on the second' }],
    run(inp) {
      const ts = String(inp.times).split(/[\s,]+/).filter(Boolean).map(Number).sort((a, b) => a - b);
      const c = new N.Circuit('Synchroniser');
      const a = c.input('A').pin('y'), clk = c.clock('CLK').pin('y');
      const f1 = c.add('DFF', { qn: false }, 'ff1'), f2 = c.add('DFF', { qn: false }, 'ff2');
      c.connect(a, f1.pin('d')); c.connect(clk, f1.pin('clk'), f2.pin('clk'));
      c.connect(f1.pin('q'), f2.pin('d')); c.name(f1.pin('q'), 'Q1', true);
      c.connect(f2.pin('q'), c.output('Q2'));
      const P = 100, end = 702;
      const R = TM.run(c, { period: P, phase: 50, powerUp: 0, seed: inp.seed, stim: [[0, 'A', 0]].concat(ts.map((t, i) => [t, 'A', (i + 1) % 2])), until: end });
      const tm = R.sim.timing('ff1');
      const x1 = R.changes('Q1').filter((q) => q[1] === 'x' && q[0] > 20), x2 = R.changes('Q2').filter((q) => q[1] === 'x' && q[0] > 30);
      const signals = TM.signals(R, [{ name: 'CLK' }, { name: 'A', label: 'A (async)' }, { name: 'Q1' }, { name: 'Q2', cls: 'good' }]);
      const spans = (t) => x1.filter((q) => q[0] <= t).map((q, i) => ({ t0: q[0], t1: q[0] + tm.tres, rows: ['Q1'], cls: 'meta', key: 'x' + i }));
      const F = new S.Frames(['x1', 'x2']);
      const scene = (t, hot) => TM.frame({ R, t, hot, t1: end, signals, spans: spans(t), ticks: 7 }).items;
      F.add({ items: scene(20), say: 'A changes whenever it likes. The first flip-flop samples it; the second samples the first one clock later. Only Q2 goes on to the rest of the circuit.' });
      for (let k = 0; k < 7; k++) {
        const e = k * P + 50;
        const near = ts.find((t) => t > e - tm.tsu - 0.01 && t < e + tm.th + 0.01);
        const xa = x1.find((q) => q[0] > e && q[0] < e + 40);
        if (xa) F.count('x1');
        const t = Math.min(end, e + tm.tpLH + tm.tres + 4);
        let say = 'Edge at ' + ns(e) + ': ';
        if (xa) say += 'A changed at ' + ns(near) + ', inside the window, so Q1 goes metastable (X) and settles to ' + R.at('Q1', t) + '. Q2 is untouched by it: it sampled Q1 before Q1 moved.';
        else say += 'A is ' + R.at('A', e - 0.5) + ' and steady: Q1 = ' + R.at('Q1', t) + '. Q2 takes the old Q1: Q2 = ' + R.at('Q2', t) + '.';
        const q1before = R.at('Q1', e - 0.5);
        TM.verify(R, t, Object.assign(q1before === 'x' ? {} : { Q2: q1before }, xa ? {} : { Q1: R.at('A', e - 0.5) }));
        F.add({ items: scene(t, xa ? ['ff1'] : ['ff1', 'ff2']), say, meta: { xa: !!xa, q2: R.at('Q2', t + P) } });
      }
      F.set('x2', x2.length);
      F.add({ items: scene(end), mark: 'end', say: 'Q1 was metastable ' + x1.length + ' time' + (x1.length === 1 ? '' : 's') + ', each for ' + tm.tres + ' ns, far less than the ' + P + ' ns until the second flip-flop looked. Q2 went X ' + x2.length + ' times: it carries A, one or two clocks late, but always clean. The price of the synchroniser is that delay.' });
      return { frames: F.list, def: { sections: [{ id: 'd', kind: 'math', title: 'Synchroniser', text: ['A → [FF1] → Q1 → [FF2] → Q2', '', 'FF1 may go metastable;', 'it has a whole period to settle', 'before FF2 samples it.', 'Delay: one to two clocks.'].join('\n') }] } };
    },
    predict: [
      { at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.xa, pick: 'option', options: ['Only Q1 goes X', 'Both go X', 'Neither goes X'], ask: 'A changes right at the next edge. Which outputs go X?', answer: 'Only Q1 goes X', explain: (fr, i) => fr[i + 1].say, once: true },
    ],
    quiz: [
      { q: 'Why does a synchroniser use two flip-flops instead of one?', options: ['To double the clock rate', 'So a metastable first stage has a full period to settle before the second samples it', 'To store two bits', 'To invert the signal twice'], answer: 1, why: 'The second flip-flop gives the first time to resolve.' },
      { q: 'The cost of a two-flip-flop synchroniser is…', options: ['one to two clock periods of delay', 'a hold violation', 'more metastability', 'nothing'], answer: 0, why: 'The input reaches the circuit one or two edges late.' },
      { q: 'Should the logic use Q1 directly?', options: ['Yes, it is faster', 'No, it may be metastable', 'Only on the falling edge', 'Only when A is 1'], answer: 1, why: 'Only the second stage\'s output is (almost surely) clean.' },
      { q: 'A synchroniser makes failure…', options: ['impossible', 'much less likely', 'more likely', 'periodic'], answer: 1, why: 'It cannot remove metastability, only give it time to resolve.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // The minimum clock period, and clock skew
  // ---------------------------------------------------------------------------------------------------
  /** two flip-flops with a chain of inverters between them; the second's clock delayed by a chain of buffers */
  function pipe(depth, skew) {
    const c = new N.Circuit('Register to register');
    const clk = c.clock('CLK').pin('y');
    const r1 = c.add('DFF', {}, 'r1'), r2 = c.add('DFF', { qn: false }, 'r2');
    c.connect(r1.pin('qn'), r1.pin('d'));
    let s = r1.pin('q');
    c.name(s, 'Q1', true);
    for (let i = 0; i < depth; i++) s = G(c, 'NOT', [s], { id: 'n' + (i + 1) });
    c.connect(s, r2.pin('d')); c.name(s, 'D2', true);
    let k = clk;
    for (let i = 0; i < skew; i++) k = G(c, 'BUF', [k], { id: 'b' + (i + 1) });
    c.connect(clk, r1.pin('clk')); c.connect(k, r2.pin('clk'));
    if (skew) c.name(k, 'CLK2', true);
    c.connect(r2.pin('q'), c.output('Q2'));
    // r1 at the left with its Q′ looping round underneath, the inverters in a row, r2 at the right; the clock a
    // rail above, through the buffers (if any) just before r2
    const top = { sides: { clock: 'top' } };
    const xr2 = Math.max(11 + 6 * depth + 2, 6 * skew + 9);
    const place = { r1: [0, 0, top], r2: [xr2, -1, top], clk_CLK: [-14, -5], out_Q2: [xr2 + 10, 1] };
    for (let i = 0; i < depth; i++) place['n' + (i + 1)] = [11 + 6 * i, 2];
    const xb0 = xr2 + 3 - 6 * skew - 2;
    for (let i = 0; i < skew; i++) place['b' + (i + 1)] = [xb0 + 6 * i, -5];
    return TM.manual(c, place, (sh, at, net) => {
      sh.line(net('r1', 'qn'), [[6, 5], [8, 5], [8, 9], [-2, 9], [-2, 4], [0, 4]]);
      sh.line(net('r1', 'clk'), [[-7, -4], [skew ? xb0 : xr2 + 3, -4]].concat(skew ? [] : [[xr2 + 3, -1]]));
      sh.line(net('r1', 'clk'), [[3, -4], [3, 0]]);
      if (skew) sh.line(net('r2', 'clk'), [[xb0 + 6 * (skew - 1) + 3, -4], [xr2 + 3, -4], [xr2 + 3, -1]]);
    });
  }
  S.topic({
    id: 'min-period', family: 'p5-timing', order: 40, title: 'The minimum clock period',
    blurb: 'Between two flip-flops a change must leave the first (clock-to-Q), cross the logic, and arrive a setup time before the next edge. The longest such path, the critical path, sets how fast the clock can go.',
    inputs: [
      { id: 'depth', kind: 'number', label: 'Inverters between the flip-flops', def: 6, min: 1, max: 9 },
      { id: 'period', kind: 'number', label: 'Clock period to try (ns)', def: 90, min: 10, max: 300 },
      { id: 'tech', kind: 'choice', label: 'Technology', def: 'CMOS', options: techs.slice(0, 3) },
    ],
    presets: [
      { label: 'Fast enough', values: { depth: 6, period: 90 } },
      { label: 'Exactly the minimum', values: { depth: 6, period: 74 } },
      { label: 'Too fast: inside the setup window', values: { depth: 6, period: 66 } },
      { label: 'Much too fast: a clock late', values: { depth: 6, period: 50 } },
      { label: 'Short path', values: { depth: 2, period: 60 } },
      { label: 'TTL', values: { depth: 4, period: 90, tech: 'TTL' } },
    ],
    counters: [{ id: 'hops', label: 'path steps' }, { id: 'viol', label: 'violations' }],
    run(inp) {
      const c = pipe(inp.depth, 0);
      const st = S.Sim.sta(c, { tech: inp.tech });
      const path = st.critical;
      const P = inp.period, cycles = 5, end = cycles * P + 2;
      const R = TM.run(c, { tech: inp.tech, period: P, phase: P / 2, powerUp: 0, seed: 4, until: end });
      const tm = R.sim.timing('r2');
      const viol = R.violations.filter((v) => v.kind === 'setup' || v.kind === 'hold');
      const signals = TM.signals(R, ['CLK', 'Q1', 'D2', 'Q2']);
      const F = new S.Frames(['hops', 'viol']);
      const hops = path.steps;
      // the path drawn as a bar: clock-to-Q, each gate, setup
      const barSide = (upto) => (x, y) => {
        const items = [], scale = Math.min(6, 460 / Math.max(st.tmin, P));
        let cx = x;
        const segs = hops.slice(1).map((h) => ({ label: h.kind === 'clock-to-Q' ? 'tcq' : h.part, d: h.delay, cls: h.kind === 'clock-to-Q' ? 'r1' : 'r0' })).concat([{ label: 'tsu', d: path.tsu, cls: 'r3' }]);
        items.push(TM.title('bar:t', x, y + 10, 'Critical path: ' + st.tmin + ' ns', 'title'));
        segs.slice(0, upto).forEach((sg, i) => { const w = sg.d * scale; items.push({ key: 'bar:' + i, kind: 'region', x: cx, y: y + 24, w: Math.max(4, w), h: 26, rx: 2, cls: sg.cls, audit: 'overlap-ok' }); if (w > 24) items.push({ key: 'bar:l' + i, kind: 'text', x: cx + w / 2, y: y + 41, text: sg.label, anchor: 'middle', size: 11, audit: 'ignore', layer: 'top' }); cx += w; });
        items.push({ key: 'bar:P', kind: 'line', x1: x + P * scale, y1: y + 18, x2: x + P * scale, y2: y + 56, cls: 'tw-mark ' + (P < st.tmin ? 'bad' : 'hot'), audit: 'ignore' });
        items.push({ key: 'bar:Pl', kind: 'text', x: x + P * scale, y: y + 72, text: 'period ' + P, anchor: 'middle', size: 12, cls: P < st.tmin ? 'bad' : '' });
        return { items, box: { x, y, w: Math.max(st.tmin, P) * scale + 30, h: 80 } };
      };
      const scene = (t, upto, hot) => TM.frame({ R, t, hot, t1: end, signals, side: barSide(upto), sideBelow: true, ticks: cycles }).items;
      F.add({ items: scene(1, 0), say: 'Flip-flop r1 toggles at every edge (its Q′ feeds its D). Its output runs through ' + inp.depth + ' inverters to D of r2. ' + inp.tech + ' delays: clock-to-Q ' + tm.tpLH + ' ns, an inverter ' + R.sim.timing('n1').tpLH + ' ns, setup ' + tm.tsu + ' ns.' });
      hops.slice(1).forEach((h, i) => {
        F.count('hops');
        F.add({ items: scene(1, i + 1, [h.part]), say: h.kind === 'clock-to-Q' ? 'From the clock edge, r1 needs ' + h.delay + ' ns (clock-to-Q): Q1 changes at ' + h.at + ' ns.' : 'Inverter ' + h.part + ' adds ' + h.delay + ' ns: the change reaches ' + (/\.y$/.test(h.net) ? 'its output' : nm(h.net)) + ' at ' + h.at + ' ns.' });
      });
      const ok = P >= st.tmin;
      F.add({ items: scene(1, hops.length), say: 'It reaches D of r2 at ' + path.delay + ' ns and must be there ' + path.tsu + ' ns before the next edge: the period must be at least ' + path.delay + ' + ' + path.tsu + ' = ' + st.tmin + ' ns, a maximum clock frequency of ' + st.fmax + ' MHz. The period tried here is ' + P + ' ns.', meta: { ask: true, ok } });
      F.count('viol', viol.length);
      for (let k = 1; k < cycles; k++) {
        const e = k * P + P / 2, arrive = e - P + path.delay;
        const bad = viol.find((v) => v.t > e - 0.5 && v.t < e + tm.th + 0.5);
        let say;
        if (bad) say = bad.say + (bad.kind === 'hold' ? ' The change is the one r1 launched at the previous edge, arriving ' + Math.round((path.delay - P) * 100) / 100 + ' ns after this one: a path longer than the period can show up as a hold report.' : '');
        else if (arrive > e) say = 'The change launched at the previous edge has not even arrived (it reaches D2 at ' + ns(arrive) + '), so r2 takes the value from the edge before that: Q2 = ' + R.at('Q2', e + tm.tpLH + tm.tres + 1) + ', one clock late. No violation is flagged here, yet the result is wrong.';
        else say = 'D2 has been steady since ' + ns(arrive) + ', ' + Math.round((e - arrive) * 100) / 100 + ' ns before the edge (at least ' + tm.tsu + ' needed): r2 takes it cleanly, Q2 = ' + R.at('Q2', e + tm.tpLH + tm.tres + 1) + '.';
        if (!bad) TM.verify(R, Math.min(end, e + tm.tpLH + tm.tres + 2), { Q2: R.at('D2', e - 0.5) });
        F.add({ items: scene(Math.min(end, e + tm.tpLH + tm.tres + 2), hops.length, ['r2']), say: bad ? say : 'Edge at ' + ns(e) + ': ' + say });
      }
      F.add({ items: scene(end, hops.length), mark: 'end', say: ok ? 'With a ' + P + ' ns period (slack ' + Math.round((P - st.tmin) * 100) / 100 + ' ns) every edge was clean.' : 'With a ' + P + ' ns period the data never had time to settle' + (viol.length ? ' (' + viol.length + ' violation' + (viol.length === 1 ? '' : 's') + ' flagged)' : '') + ', and r2 stored wrong or unknown values. The clock must be slowed to at least ' + st.tmin + ' ns, or the logic shortened.' });
      return { frames: F.list, def: { sections: [{ id: 'd', kind: 'math', title: 'Minimum period', text: ['T ≥ tcq + t_logic + tsu', '  = ' + tm.tpLH + ' + ' + Math.round((path.delay - tm.tpLH) * 100) / 100 + ' + ' + tm.tsu + ' = ' + st.tmin + ' ns', 'f_max = 1 / T = ' + st.fmax + ' MHz'].join('\n') }] } };
    },
    predict: [
      { at: (f) => f.meta && f.meta.ask, pick: 'option', options: ['Yes, every edge is clean', 'No, the period is too short'], ask: 'Will r2 capture D2 correctly at the period chosen?', answer: (fr, i) => (fr[i].meta.ok ? 'Yes, every edge is clean' : 'No, the period is too short'), explain: (fr) => fr[fr.length - 1].say },
    ],
    quiz: [
      { q: 'tcq = 10 ns, logic 25 ns, tsu = 5 ns. The minimum clock period is…', options: ['25 ns', '35 ns', '40 ns', '30 ns'], answer: 2, why: '10 + 25 + 5 = 40 ns.' },
      { q: 'A minimum period of 40 ns means a maximum clock frequency of…', options: ['40 MHz', '25 MHz', '4 MHz', '250 MHz'], answer: 1, why: '1 / 40 ns = 25 MHz.' },
      { q: 'The critical path is…', options: ['the shortest path', 'the longest register-to-register (or input-to-output) delay', 'the clock wire', 'the path with the most flip-flops'], answer: 1, why: 'It is the path that limits the clock.' },
      { q: 'Too short a period causes…', options: ['hold violations', 'setup violations', 'nothing', 'a faster circuit'], answer: 1, why: 'The data does not arrive a setup time before the next edge.' },
    ],
  });

  S.topic({
    id: 'clock-skew', family: 'p5-timing', order: 50, title: 'Clock skew',
    blurb: 'Delay the clock to the second flip-flop and it samples later: more time for slow logic (setup gets easier) but less margin against fast logic racing through (hold gets harder).',
    inputs: [
      { id: 'skew', kind: 'number', label: 'Buffers delaying the second clock', def: 2, min: 0, max: 6 },
      { id: 'depth', kind: 'number', label: 'Inverters between the flip-flops', def: 1, min: 1, max: 8 },
      { id: 'period', kind: 'number', label: 'Clock period (ns)', def: 100, min: 20, max: 300 },
    ],
    presets: [
      { label: 'No skew', values: { skew: 0, depth: 1 } },
      { label: 'Skew beats a short path: hold broken', values: { skew: 2, depth: 1 } },
      { label: 'Same skew, longer path: safe', values: { skew: 2, depth: 3 } },
      { label: 'Skew helps setup', values: { skew: 2, depth: 7, period: 70 } },
      { label: 'Same, without skew: too slow', values: { skew: 0, depth: 7, period: 70 } },
    ],
    counters: [{ id: 'viol', label: 'violations' }],
    run(inp) {
      const c = pipe(inp.depth, inp.skew);
      const st = S.Sim.sta(c, { tech: 'CMOS' });
      const P = inp.period, cycles = 4, end = cycles * P + 2;
      const R = TM.run(c, { period: P, phase: P / 2, powerUp: 0, seed: 6, until: end });
      const tm = R.sim.timing('r2'), skew = st.arrival(inp.skew ? 'CLK2' : 'CLK') || 0;
      const short = R.sim.timing('r1').tpHL + inp.depth * R.sim.timing('n1').tpLH;
      const h = st.hold.find((x) => x.part === 'r2'), slack = h ? h.slack : short - skew - tm.th;
      const viol = R.violations.filter((v) => v.kind === 'setup' || v.kind === 'hold');
      const sigs = ['CLK'].concat(inp.skew ? ['CLK2'] : [], ['Q1', 'D2', 'Q2']);
      const signals = TM.signals(R, sigs);
      const F = new S.Frames(['viol']);
      const e1 = P / 2 + P;
      const spans = (t) => (t >= e1 ? [{ t0: e1 + skew - tm.tsu, t1: e1 + skew, rows: ['D2'], cls: 'setup', key: 'su' }, { t0: e1 + skew, t1: e1 + skew + Math.max(tm.th, 1), rows: ['D2'], cls: 'hold', key: 'ho' }] : []);
      const marks = (t) => (t >= e1 ? [{ t: e1, key: 'a', label: 'r1' }].concat(skew ? [{ t: e1 + skew, key: 'b', label: 'r2', cls: 'hot' }] : []) : []);
      const scene = (t, hot) => TM.frame({ R, t, hot, t1: end, signals, spans: spans(t), marks: marks(t), ticks: cycles }).items;
      F.add({ items: scene(1), say: 'r1 toggles every edge; its Q1 goes through ' + inp.depth + ' inverter' + (inp.depth === 1 ? '' : 's') + ' to r2. ' + (inp.skew ? 'The clock reaches r2 through ' + inp.skew + ' buffer' + (inp.skew === 1 ? '' : 's') + ', ' + skew + ' ns late: that lateness is the skew.' : 'Both flip-flops get the clock at the same moment: no skew.') });
      const r2s = st.paths.find((x) => x.kind === 'setup' && x.part === 'r2');
      F.add({ items: scene(e1 - 1), say: 'The two checks at r2. Setup: the slowest change reaches D2 ' + r2s.delay + ' ns after r1\'s edge and must arrive tsu = ' + tm.tsu + ' ns before r2\'s edge at +' + skew + ' ns, so T ≥ ' + r2s.delay + ' + ' + tm.tsu + ' − ' + skew + ' = ' + r2s.need + ' ns (the period is ' + P + '). Hold: the fastest change (' + short + ' ns after r1\'s edge) must come at least th = ' + tm.th + ' ns after r2\'s edge at +' + skew + ' ns: slack ' + slack + ' ns.', meta: { ask: true, hold: slack < 0, setup: P < st.tmin } });
      F.count('viol', viol.length);
      if (!viol.length) TM.verify(R, e1 + skew + tm.tpLH + tm.tres + 3, { Q2: R.at('D2', e1 + skew - 0.5) });
      F.add({ items: scene(e1 + skew + tm.tpLH + tm.tres + 3, ['r2']), say: viol.length ? viol[0].say : 'Edge at ' + ns(e1) + ' (r2 at ' + ns(e1 + skew) + '): D2 is steady through r2\'s window, Q2 = ' + R.at('Q2', e1 + skew + tm.tpLH + 2) + ' cleanly.' });
      F.add({ items: scene(end), mark: 'end', say: viol.length ? viol.length + ' violation' + (viol.length === 1 ? '' : 's') + ' (' + [...new Set(viol.map((v) => v.kind))].join(' and ') + '). ' + (viol.some((v) => v.kind === 'hold') ? 'A hold problem does not go away with a slower clock: the new data overtakes the late clock however long the period is. The cure is less skew, or more delay in the short path.' : 'A slower clock, less logic, or a little skew in the right place would fix it.') : 'Every edge clean. ' + (inp.skew ? 'The skew gave the logic ' + skew + ' ns more for setup and took ' + skew + ' ns of hold margin.' : 'With no skew the hold check is easy: a flip-flop\'s own clock-to-Q is longer than its hold time.') });
      return { frames: F.list, def: { sections: [{ id: 'd', kind: 'math', title: 'With skew s (second clock late)', text: ['setup:  T + s ≥ tcq + t_max + tsu', 'hold:   tcq + t_min ≥ s + th', '', 'here s = ' + skew + ' ns, tcq + t_min = ' + short + ' ns'].join('\n') }] } };
    },
    predict: [
      { at: (f) => f.meta && f.meta.ask, pick: 'option', options: ['Clean', 'Setup violation', 'Hold violation'], ask: 'At the next edge, what happens at r2?', answer: (fr, i) => (fr[i].meta.hold ? 'Hold violation' : fr[i].meta.setup ? 'Setup violation' : 'Clean'), explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'Skew that delays the receiving flip-flop\'s clock…', options: ['helps setup and hurts hold', 'hurts setup and helps hold', 'helps both', 'hurts both'], answer: 0, why: 'The receiver samples later: more time for slow data, but fast data may already have changed.' },
      { q: 'Can a hold violation be fixed by slowing the clock?', options: ['Yes', 'No', 'Only with TTL', 'Only with a reset'], answer: 1, why: 'Hold compares the fastest path with the skew at the same edge; the period does not enter it.' },
      { q: 'tcq = 14 ns, shortest logic 8 ns, th = 3 ns. The largest skew without a hold violation is…', options: ['19 ns', '22 ns', '25 ns', '11 ns'], answer: 0, why: '14 + 8 ≥ s + 3 gives s ≤ 19 ns.' },
      { q: 'A common fix for a hold violation is…', options: ['adding delay to the short path', 'removing logic from the long path', 'a faster clock', 'a slower clock'], answer: 0, why: 'The fast data must arrive later than the skewed clock plus the hold time.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Analysis of a clocked circuit
  // ---------------------------------------------------------------------------------------------------
  /** circuits to analyse: our own, two flip-flops (A, B), one input X */
  const circuits = {
    d: { label: 'D flip-flops, Moore output', build() {
      const c = new N.Circuit('D flip-flops');
      const x = c.input('X').pin('y'), clk = c.clock('CLK').pin('y');
      const a = c.add('DFF', {}, 'a'), b = c.add('DFF', {}, 'b');
      c.connect(clk, a.pin('clk'), b.pin('clk'));
      c.connect(G(c, 'OR', [G(c, 'AND', [a.pin('q'), b.pin('qn')]), x]), a.pin('d'));
      c.connect(G(c, 'AND', [a.pin('q'), G(c, 'NOT', [x])]), b.pin('d'));
      c.connect(G(c, 'AND', [a.pin('q'), b.pin('q')]), c.output('Y'));
      c.leaveOpen(a.pin('qn'));
      return c;
    } },
    jk: { label: 'JK flip-flops, Moore output', build() {
      const c = new N.Circuit('JK flip-flops');
      const x = c.input('X').pin('y'), clk = c.clock('CLK').pin('y');
      const a = c.add('JKFF', {}, 'a'), b = c.add('JKFF', {}, 'b');
      c.connect(clk, a.pin('clk'), b.pin('clk'));
      c.connect(b.pin('q'), a.pin('j')); c.connect(x, a.pin('k'));
      c.connect(G(c, 'NOT', [x], { id: 'nx' }), b.pin('j')); c.connect(a.pin('q'), b.pin('k'));
      c.connect(G(c, 'AND', [a.pin('qn'), b.pin('q')], { id: 'z' }), c.output('Z'));
      c.leaveOpen(b.pin('qn'));
      // drawn as a drafter draws a state machine: a vertical rail for each literal (X, X′, A, A′, B), rows from
      // the rails into the flip-flops and the gate, each output returning over the top to its rail
      const rail = { X: 0, Xn: 5, A: 8, An: 10, B: 12 }, xF = 31, xc = 28;
      return TM.manual(c, { in_X: [-8, -13], nx: [2, -11], a: [xF, 0], b: [xF, 12], z: [16, 30], out_Z: [24, 31], clk_CLK: [-12, 27] }, (sh, at, net) => {
        const nX = net('in_X', 'y'), nXn = net('nx', 'y'), nA = net('a', 'q'), nAn = net('a', 'qn'), nB = net('b', 'q'), nC = net('clk_CLK', 'y');
        sh.line(nX, [[-4, -12], [0, -12]]); sh.line(nX, [[0, -12], [0, 6]], true); sh.line(nX, [[0, -10], [2, -10]]); sh.line(nX, [[0, 6], [xF, 6]]);
        sh.line(nXn, [[5, -10], [5, 14]], true); sh.line(nXn, [[5, 14], [xF, 14]]);
        // the returns: the lowest output takes the outermost column and the highest lane
        const ret = (n, from, xr, yl, rx) => sh.line(n, [[from.x, from.y], [xr, from.y], [xr, yl], [rx, yl]]);
        ret(nA, at('a', 'q'), 40, -14, rail.A); ret(nAn, at('a', 'qn'), 42, -16, rail.An); ret(nB, at('b', 'q'), 44, -18, rail.B);
        sh.line(nA, [[rail.A, -14], [rail.A, 18]], true); sh.line(nA, [[rail.A, 18], [xF, 18]]);
        sh.line(nAn, [[rail.An, -16], [rail.An, 31]], true); sh.line(nAn, [[rail.An, 31], [16, 31]]);
        sh.line(nB, [[rail.B, -18], [rail.B, 33]], true); sh.line(nB, [[rail.B, 2], [xF, 2]]); sh.line(nB, [[rail.B, 33], [16, 33]]);
        sh.line(nC, [[-5, 28], [xc, 28]], true); sh.line(nC, [[xc, 28], [xc, 4]], true); sh.line(nC, [[xc, 4], [xF, 4]]); sh.line(nC, [[xc, 16], [xF, 16]]);
      });
    } },
    t: { label: 'T flip-flops, Mealy output', build() {
      const c = new N.Circuit('T flip-flops');
      const x = c.input('X').pin('y'), clk = c.clock('CLK').pin('y');
      const a = c.add('TFF', {}, 'a'), b = c.add('TFF', {}, 'b');
      c.connect(clk, a.pin('clk'), b.pin('clk'));
      c.connect(G(c, 'AND', [b.pin('q'), x]), a.pin('t'));
      c.connect(x, b.pin('t'));
      c.connect(G(c, 'AND', [a.pin('q'), x]), c.output('Y'));
      c.leaveOpen(a.pin('qn')); c.leaveOpen(b.pin('qn'));
      return c;
    } },
  };
  S.topic({
    id: 'clocked-analysis', family: 'p5-timing', order: 60, title: 'Analysing a clocked circuit',
    blurb: 'From a circuit of flip-flops and gates back to what it does: the flip-flop input equations, the state equations, the state table, the state diagram, and then a run with the diagram lit in step with the waveform.',
    inputs: [
      { id: 'circ', kind: 'choice', label: 'Circuit', def: 'd', options: Object.keys(circuits).map((k) => ({ value: k, label: circuits[k].label })) },
      { id: 'x', kind: 'text', label: 'X at each clock edge', def: '1101001', check: (v) => (/^[01]{2,10}$/.test(String(v).replace(/\s+/g, '')) ? null : 'X: 2 to 10 bits') },
    ],
    presets: [
      { label: 'D flip-flops', values: { circ: 'd', x: '1101001' } },
      { label: 'JK flip-flops', values: { circ: 'jk', x: '0110100' } },
      { label: 'T flip-flops', values: { circ: 't', x: '1011010' } },
    ],
    counters: [{ id: 'rows', label: 'table rows' }, { id: 'edges', label: 'clock edges run' }],
    run(inp) {
      const c = circuits[inp.circ].build();
      const A = S.Fsm.analyse(c);
      const m = A.machine, mealy = m.type === 'mealy', out = A.outputs[0];
      const xs = String(inp.x).replace(/\s+/g, '').split('').map(Number);
      const res = K.schem.layout(c), sw = res.bounds.w;
      const F = new S.Frames(['rows', 'edges']);
      const Geo = S.geom;
      const eqLines = [];
      // three pictures, each framed on its own: circuit and equations; equations, table and diagram; the run
      const eqItems = (lit, x, y) => eqLines.map((l, i) => ({ key: 'eq:' + i, kind: 'text', x, y: y + 14 + i * 24, text: l, cls: 'mono' + (lit === i ? ' hot' : ''), size: 15 }));
      const add = (f) => { f.view = S.stageBounds(f.items, { margin: 24 }); return F.add(f); };
      const syms = S.Fsm.symbols(m);
      const rowsOf = (n) => m.states.slice(0, n).map((s) => [s].concat(syms.map((x) => m.next[s][x] + (mealy ? ' / ' + m.out[s][x] : '')), mealy ? [] : [m.out[s]]));
      const head = ['AB'].concat(syms.map((x) => 'X = ' + x), mealy ? [] : [out]);
      const allEq = A.inputEquations.concat(A.stateEquations, A.outputEquations).map((e) => e.text.replace(/'/g, '′'));
      const eqW = Math.max(...allEq.map((t) => Geo.textWidth(t, 15, { mono: true })));
      const tX = eqW + 50;
      const tableAt = (n, hot) => K.table.draw({ x: tX, y: 22, prefix: 'st', colHead: head, rows: rowsOf(n).concat(Array(m.states.length - n).fill(head.map(() => ''))), size: 15, hot: hot !== undefined ? head.map((h, k) => [hot, k]) : [], title: 'State table' + (mealy ? ' (next / ' + out + ')' : '') });
      const tb = tableAt(4);
      const DR = 100, dgX = tb.box.x + tb.box.w + DR + 80, dgY = Math.max(130, tb.box.y + tb.box.h / 2);
      const dia = (hot, hotEdge) => TM.diagram({ x: dgX, y: dgY, R: DR, r: 27, states: m.states.map((s) => ({ id: s, label: mealy ? s : s + '/' + m.out[s] })), edges: A.diagram.edges.map((e) => ({ from: e.from, to: e.to, label: e.label })), hot, hotEdge, size: 13 }).items;
      const circ = (hot, values) => K.schem.item('circ', res, { x: 0, y: 0, hot: hot || [], values });
      const eqX = sw + 40;
      add({ items: [circ()], say: 'A clocked circuit: ' + A.vars.length + ' flip-flops (' + A.vars.join(', ') + '), input ' + A.inputs.join(', ') + ', output ' + A.outputs.join(', ') + '. To analyse it, read the logic in front of each flip-flop input.' });
      for (const e of A.inputEquations) { eqLines.push(e.text.replace(/'/g, '′')); add({ items: [circ(['a', 'b'])].concat(eqItems(eqLines.length - 1, eqX, 0)), say: A.trace.find((t) => t.kind === 'input-eq' && t.name === e.name).say.replace(/'/g, '′') }); }
      for (const e of A.stateEquations) { eqLines.push(e.text.replace(/'/g, '′')); add({ items: [circ()].concat(eqItems(eqLines.length - 1, eqX, 0)), say: A.trace.find((t) => t.kind === 'state-eq' && t.name === e.name).say.replace(/'/g, '′') }); }
      for (const e of A.outputEquations) { eqLines.push(e.text.replace(/'/g, '′')); add({ items: [circ()].concat(eqItems(eqLines.length - 1, eqX, 0)), say: A.trace.find((t) => t.kind === 'output-eq').say.replace(/'/g, '′'), meta: { mealyAsk: true, mealy } }); }
      const eqL = (lit) => eqItems(lit, 0, 10);
      m.states.forEach((s, i) => {
        F.count('rows');
        add({ items: eqL(A.inputEquations.length + 0).map((x, k) => (k >= A.inputEquations.length && k < A.inputEquations.length + A.stateEquations.length ? Object.assign(x, { cls: 'mono hot' }) : Object.assign(x, { cls: 'mono' }))).concat(tableAt(i + 1, i).items), say: A.trace.find((t) => t.kind === 'row' && t.state === s).say.replace(/\.$/, '') + ' (from the state equations with A = ' + s[0] + ', B = ' + s[1] + ').', meta: i === 1 ? { rowAsk: true, s, next: m.next[s]['1'] } : {} });
      });
      add({ items: eqL().concat(tableAt(4).items, dia()), say: 'The same table as a state diagram: a circle for each state' + (mealy ? '' : ' (with its output after the slash)') + ', an arrow for each row entry, labelled with the input' + (mealy ? ' and the output' : '') + '.' });
      // a run: the diagram lit in step with the waveform
      const R = TM.clocked(c, { cycles: xs.length, inputs: { X: xs }, powerUp: 0 });
      const end = xs.length * R.period + 2;
      const signals = TM.signals(R, ['CLK', 'X', 'a.q', 'b.q', out].map((n) => ({ name: n, label: n === 'a.q' ? 'A' : n === 'b.q' ? 'B' : n })));
      const yW = Math.max(tb.box.y + tb.box.h, dgY + DR + 50, 14 + eqLines.length * 24) + 50;
      const runScene = (t, hot, hotEdge) => {
        const wv = TM.waves({ x: 0, y: yW, w: dgX + DR + 40 - 50, t0: 0, t1: end, now: t, signals, prefix: 'tw', ticks: xs.length });
        return eqL().concat(tableAt(4).items, dia(hot, hotEdge), wv.items);
      };
      const stateAt = (t) => { t = Math.max(t, R.edgeAt(0) - 1); return '' + R.at('a.q', t) + R.at('b.q', t); };
      add({ items: runScene(1, stateAt(1)), say: 'Now run it from state 00 with X = ' + xs.join(', ') + ' at successive edges. The lit state is the one the flip-flops hold.' });
      for (let k = 0; k < xs.length; k++) {
        const e = R.edgeAt(k), s0 = stateAt(e - 0.5), s1 = stateAt(e + 20);
        F.count('edges');
        const want = m.next[s0] && m.next[s0][String(xs[k])];
        if (want) TM.verify(R, e + 20, { 'a.q': +want[0], 'b.q': +want[1] });
        add({ items: runScene(e + 20, s1, s0 + '>' + s1), say: 'Edge ' + (k + 1) + ': in state ' + s0 + ' with X = ' + xs[k] + (mealy ? ' (output ' + out + ' = ' + m.out[s0][String(xs[k])] + ' just before the edge)' : '') + ', the table says go to ' + m.next[s0][String(xs[k])] + '; the flip-flops now hold ' + s1 + '.' + (mealy ? '' : ' Output ' + out + ' = ' + m.out[s1] + '.'), meta: { edge: true, next: s1 } });
      }
      add({ items: runScene(end, stateAt(end)), mark: 'end', say: 'The circuit visited ' + [...new Set([stateAt(1)].concat(xs.map((x, k) => stateAt(R.edgeAt(k) + 20))))].join(', ') + ', exactly as the diagram predicts: the analysis says everything the circuit does.' });
      return { frames: F.list, def: { sections: [{ id: 'd', kind: 'math', title: 'Equations', text: A.inputEquations.map((e) => e.text).concat([''], A.stateEquations.map((e) => e.text), [''], A.outputEquations.map((e) => e.text)).join('\n').replace(/'/g, '′') }] } };
    },
    predict: [
      { at: (f) => f.meta && f.meta.mealyAsk, pick: 'option', options: ['Moore (state only)', 'Mealy (state and input)'], ask: 'Does the output depend on the input too?', answer: (fr, i) => (fr[i].meta.mealy ? 'Mealy (state and input)' : 'Moore (state only)'), explain: (fr, i) => fr[i].say },
      { at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.rowAsk, pick: 'option', options: ['00', '01', '10', '11'], ask: (fr, i) => 'Next row: from state ' + fr[i + 1].meta.s + ' with X = 1, which state comes next?', answer: (fr, i) => fr[i + 1].meta.next, explain: (fr, i) => fr[i + 1].say },
      { at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.edge && i > 0 && fr[i].meta && fr[i].meta.edge, pick: 'option', options: ['00', '01', '10', '11'], ask: 'Which state after the next edge?', answer: (fr, i) => fr[i + 1].meta.next, explain: (fr, i) => fr[i + 1].say, once: true },
    ],
    quiz: [
      { q: 'The first step in analysing a clocked circuit is to write…', options: ['the state diagram', 'the flip-flop input equations', 'the Verilog', 'the timing diagram'], answer: 1, why: 'Read off the logic feeding each flip-flop input.' },
      { q: 'With D flip-flops, the state equation A(t+1) equals…', options: ['the D input equation DA', 'DA ⊕ A', 'DA · A', 'A′'], answer: 0, why: 'A D flip-flop stores D.' },
      { q: 'With a T flip-flop, A(t+1) = …', options: ['TA', 'TA ⊕ A', 'TA · A′', 'TA + A'], answer: 1, why: 'Substitute TA into the characteristic equation Q(t+1) = T ⊕ Q.' },
      { q: 'An output that depends on the input as well as the state makes the circuit…', options: ['a Moore machine', 'a Mealy machine', 'combinational', 'asynchronous'], answer: 1, why: 'Mealy outputs are functions of state and input.' },
      { q: 'Two flip-flops give at most how many states?', options: ['2', '3', '4', '8'], answer: 2, why: '2² = 4.' },
    ],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
