// Part 5, flip-flops: why a latch is not enough in a loop and an edge is, the master–slave D flip-flop handing
// over, the six-gate edge-triggered D flip-flop at gate level, JK and T flip-flops with their characteristic
// tables and equations, JK and T built from a D flip-flop, and asynchronous preset and clear.
(function (S) {
  'use strict';
  const K = S.Kit, TM = K.timing, N = S.Netlist, G = TM.G;
  const ns = TM.ns;
  const nm = (n) => n.replace(/'/g, '′');
  const bitsOf = (v) => String(v).replace(/\s+/g, '').split('').map(Number);
  const bitsCheck = (label, max) => (v) => { const s = String(v).replace(/\s+/g, ''); if (!/^[01]+$/.test(s)) return label + ': write the values as 0s and 1s, like 0110'; if (s.length > (max || 10)) return label + ': at most ' + (max || 10) + ' values'; return null; };
  const sameLen = (...names) => (inp) => { const l = names.map((n) => bitsOf(inp[n]).length); return l.every((x) => x === l[0]) ? null : names.map((n) => n.toUpperCase()).join(', ') + ' need the same number of values'; };

  S.family({ id: 'p5-flipflops', part: 'storage', order: 20, title: 'Flip-flops', blurb: 'Storage that changes only at a clock edge: why it is needed, how the master–slave and six-gate designs achieve it, and the D, JK and T flip-flops with their equations.' });

  /** a characteristic table, the row in use lit */
  function charTable(x, y, kind, row) {
    const T = {
      D: { head: ['D', 'Q(t+1)', ''], rows: [['0', '0', 'reset'], ['1', '1', 'set']] },
      T: { head: ['T', 'Q(t+1)', ''], rows: [['0', 'Q', 'hold'], ['1', 'Q′', 'toggle']] },
      JK: { head: ['J', 'K', 'Q(t+1)', ''], rows: [['0', '0', 'Q', 'hold'], ['0', '1', '0', 'reset'], ['1', '0', '1', 'set'], ['1', '1', 'Q′', 'toggle']] },
    }[kind];
    const t = K.table.draw({ x, y, prefix: 'ct', colHead: T.head, rows: T.rows, size: 14, hot: row >= 0 ? T.head.map((h, c) => [row, c]) : [], title: kind + ' flip-flop' });
    return { items: t.items, box: t.box };
  }

  // ---------------------------------------------------------------------------------------------------
  // Why edge triggering
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'why-edge', family: 'p5-flipflops', order: 10, title: 'Why edge triggering',
    blurb: 'Feed a storage element\'s Q′ back to its D and clock it: it should toggle once per clock. A latch, open for the whole high half of the clock, toggles as often as the loop allows; an edge-triggered flip-flop toggles exactly once.',
    inputs: [
      { id: 'duty', kind: 'number', label: 'Clock high time (ns of each 100)', def: 50, min: 10, max: 90 },
      { id: 'tech', kind: 'choice', label: 'Technology', def: 'CMOS', options: [{ value: 'CMOS', label: 'CMOS' }, { value: 'TTL', label: 'TTL' }] },
    ],
    presets: [
      { label: 'Square clock', values: { duty: 50 } },
      { label: 'A short high pulse', values: { duty: 25 } },
      { label: 'A long high pulse', values: { duty: 85 } },
      { label: 'TTL gates', values: { duty: 50, tech: 'TTL' } },
    ],
    counters: [{ id: 'latch', label: 'latch toggles' }, { id: 'ff', label: 'flip-flop toggles' }],
    run(inp) {
      const c = TM.memo('why-edge', () => {
        const c = new N.Circuit('Latch against flip-flop');
        const clk = c.clock('CLK').pin('y');
        const l = c.add('LATCH', {}, 'lat'), f = c.add('DFF', {}, 'ff');
        c.connect(clk, l.pin('en'), f.pin('clk'));
        c.connect(l.pin('qn'), l.pin('d')); c.connect(f.pin('qn'), f.pin('d'));
        c.connect(l.pin('q'), c.output('QL')); c.connect(f.pin('q'), c.output('QF'));
        // the two one above the other, each clocked from above, each Q′ looping round underneath to its D
        return TM.manual(c, { lat: [0, 0, { sides: { en: 'top' } }], ff: [0, 14, { sides: { clock: 'top' } }], clk_CLK: [-14, -4], out_QL: [13, 2], out_QF: [13, 16] }, (sh, at, net) => {
          sh.line(net('lat', 'qn'), [[8, 5], [10, 5], [10, 9], [-2, 9], [-2, 4], [0, 4]]);
          sh.line(net('ff', 'qn'), [[6, 19], [8, 19], [8, 23], [-2, 23], [-2, 18], [0, 18]]);
          sh.line(net('lat', 'en'), [[-7, -3], [4, -3], [4, 0]]);
          sh.line(net('lat', 'en'), [[-4, -3], [-4, 12], [3, 12], [3, 14]]);
        });
      });
      c.parts.find((p) => p.type === 'CLOCK').params.duty = inp.duty / 100;
      const P = 100, hi = inp.duty, first = P - hi, end = first + 3 * P - 2;
      const R = TM.run(c, { tech: inp.tech, period: P, powerUp: 0, depositAt: 16, states: { lat: 0 }, until: end });
      const loop = [R.sim.timing('lat').tpLH];
      const signals = TM.signals(R, [{ name: 'CLK' }, { name: 'QL', label: 'latch Q' }, { name: 'QF', label: 'flip-flop Q' }]);
      const spans = [0, 1, 2].map((k) => ({ t0: first + k * P, t1: first + k * P + hi, rows: ['CLK', 'QL'], cls: 'open', key: 'p' + k, label: k ? '' : 'latch open' }));
      const F = new S.Frames(['latch', 'ff']);
      const scene = (t, hot) => TM.frame({ R, t, hot, t0: 20, t1: end, signals, spans: spans.filter((s) => s.t0 <= t), waveW: 560 }).items;
      F.add({ items: scene(first - 1), say: 'Top: a D latch, enabled by the clock, with Q′ wired back to D. Bottom: an edge-triggered D flip-flop, wired the same way. Both get the same clock, high for ' + hi + ' ns of every ' + P + '. Each should flip once per clock.', meta: {} });
      for (let k = 0; k < 3; k++) {
        const a = first + k * P, b = a + hi;
        const tl = R.changesIn('QL', a, b + 30).length, tf = R.changesIn('QF', a, a + P - 1).length;
        F.count('latch', tl); F.count('ff', tf);
        if (k === 0) F.add({ items: scene(a + 0.5), say: 'The clock rises at ' + ns(a) + '. How many times will each output change during this pulse?', meta: { ask: true, tl, tf } });
        TM.verify(R, b + 25, { QF: 1 - R.at('QF', a - 0.5) });
        F.add({ items: scene(b + 25, k === 0 ? ['lat'] : []), say: 'Pulse ' + (k + 1) + ' (' + ns(a) + ' to ' + ns(b) + '): the latch output changed ' + tl + ' time' + (tl === 1 ? '' : 's') + ', the flip-flop ' + tf + ' time' + (tf === 1 ? '' : 's') + '. ' + (tl > 1 ? 'While the latch is open its new Q′ runs straight back to D and through again, once every trip round the loop.' : tl === 1 ? 'The pulse was short enough that the loop had time for only one trip.' : 'The pulse was too short for the change to get round the loop.'), meta: { tl, tf } });
      }
      const lt = R.changes('QL').length - 1, ft = R.changes('QF').length - 1;
      F.add({ items: scene(end), mark: 'end', say: 'In three clocks the latch changed ' + F.counts.latch + ' times, how often depending on the pulse width and the gate delays (a trip round its loop, D to Q′ and back, takes ' + loop[0] + ' ns). The flip-flop changed exactly 3 times, once per rising edge, whatever the pulse width: it samples D at an instant and only then lets Q change. That is why circuits with feedback use edge-triggered flip-flops.' + (lt + ft ? '' : '') });
      const def = { sections: [{ id: 'd', kind: 'math', title: 'Latch against flip-flop', text: ['latch:      Q follows D the whole', '            time the clock is 1', 'flip-flop:  Q takes D only at the', '            clock edge', '', 'D = Q′:  toggles once per edge', '         only with a flip-flop'].join('\n') }] };
      return { frames: F.list, def };
    },
    predict: [
      { at: (f) => f.meta && f.meta.ask, pick: 'option', options: ['Both once', 'Latch once, flip-flop more', 'Latch more than once, flip-flop once', 'Neither'], ask: 'During this clock pulse, how often will each output change?', answer: (fr, i) => (fr[i].meta.tl > 1 ? 'Latch more than once, flip-flop once' : fr[i].meta.tl === 1 ? 'Both once' : 'Neither'), explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'Q′ is wired back to D of a latch. While the enable is 1, the latch…', options: ['toggles once', 'toggles repeatedly, once per trip round the loop', 'holds', 'goes to 0'], answer: 1, why: 'A transparent latch passes each new Q′ straight back to its own input.' },
      { q: 'An edge-triggered flip-flop takes its input…', options: ['for the whole time the clock is 1', 'only at the active clock edge', 'when D changes', 'on both levels'], answer: 1, why: 'It samples D at the edge, and the outputs cannot affect it until the next edge.' },
      { q: 'How many times does a D flip-flop with D = Q′ change in five clock periods?', options: ['1', '5', '10', 'it depends on the pulse width'], answer: 1, why: 'Once per active edge: five times.' },
      { q: 'Why does the number of latch toggles depend on the gate delays?', options: ['Each toggle is one trip round the loop, which takes the sum of the delays on it', 'Faster gates need more power', 'The clock waits for the gates', 'It does not'], answer: 0, why: 'The longer the pulse compared with the loop delay, the more trips fit in it.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Master–slave D flip-flop
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'master-slave', family: 'p5-flipflops', order: 20, title: 'Master–slave D flip-flop: the hand-over',
    blurb: 'Two D latches in a row, enabled on opposite halves of the clock. The master listens while the clock is 0; at the rising edge it closes and the slave opens to copy it. The output changes only at the edge.',
    inputs: [
      { id: 'd', kind: 'text', label: 'D, one value per 25 ns', def: '0110011100100', check: bitsCheck('D', 16) },
    ],
    presets: [
      { label: 'D changes in both halves', values: { d: '0110011100100' } },
      { label: 'A glitch on D while the clock is 1', values: { d: '0011010011001' } },
      { label: 'D changes only while the clock is 0', values: { d: '0110011001100' } },
    ],
    counters: [{ id: 'q', label: 'Q changes' }],
    run(inp) {
      const dv = bitsOf(inp.d), step = 25, n = dv.length, P = 100, end = n * step + 4;
      const c = TM.build.msD();
      // D changes 12 ns into each step, clear of the edges: the master closes only once the inverter on its
      // enable has answered, a few ns after the rising edge, and D must not change in that gap
      const R = TM.run(c, { period: P, phase: P / 2, powerUp: 0, stim: dv.map((v, i) => [i * step + (i ? 12 : 0), 'D', v]), until: end });
      const signals = TM.signals(R, ['CLK', 'D', { name: 'M', label: 'master' }, { name: 'Q', label: 'slave Q' }]);
      const F = new S.Frames(['q']);
      const scene = (t, hot) => TM.frame({ R, t, hot, t1: end, signals, spans: [0, 1, 2, 3].map((k) => ({ t0: k * P, t1: k * P + P / 2, rows: ['D', 'M'], cls: 'open', key: 'm' + k, label: k ? '' : 'master open' })).filter((s) => s.t0 <= t && s.t0 < end) }).items;
      const tcq = R.sim.timing('slave').tpLH;
      F.add({ items: scene(1), say: 'The master latch is enabled by CLK′, so it is open while the clock is 0; the slave is enabled by CLK, so it is open while the clock is 1. They are never open together, so D can never run straight through to Q.' });
      const times = [];
      for (let t = 0; t < end; t += P / 2) times.push(t);
      for (const t of times.slice(1)) {
        const rising = Math.round(t / (P / 2)) % 2 === 1;
        const a = t, b = Math.min(end, t + P / 2);
        const m = R.at('M', a - 0.5), q = R.at('Q', b - 0.5);
        const dCh = R.changesIn('D', a, b).length;
        if (rising) {
          const qc = R.changesIn('Q', a, a + 30).length;
          F.count('q', qc);
          F.add({ items: scene(a + 0.5, ['master', 'slave']), say: 'Rising edge at ' + ns(a) + ': the master closes, holding M = ' + m + ', the D it last saw. The slave opens. What will Q become?', meta: { ask: true, q: R.at('Q', a + 30) } });
          const qa = R.at('Q', a + tcq + 3);
          TM.verify(R, Math.min(end, a + tcq + 3), { Q: m });
          F.add({ items: scene(Math.min(end, a + tcq + 3), ['slave']), say: 'The slave copies the master: Q = ' + R.at('Q', a + tcq + 3) + ', ' + tcq + ' ns after the edge.' + (dCh ? ' D changes ' + dCh + ' time' + (dCh === 1 ? '' : 's') + ' while the clock is 1, but the master is closed, so none of it reaches Q.' : '') });
          TM.verify(R, b - 0.5, { Q: qa });
          F.add({ items: scene(b - 0.5), say: 'Clock high until ' + ns(b) + ': Q stays ' + q + '.' + (dCh ? ' The changes of D were ignored.' : '') });
        } else {
          TM.verify(R, b - 0.5, { M: R.at('D', b - 0.5 - 12), Q: R.at('Q', a - 0.5) });
          F.add({ items: scene(b - 0.5, ['master']), say: 'Clock low from ' + ns(a) + ': the master is open and follows D (M = ' + R.at('M', b - 0.5) + ' now); the slave is closed, so Q holds ' + q + '.' });
        }
      }
      F.add({ items: scene(end), mark: 'end', say: 'Q changed only just after rising edges, and each time it took the value D had at the edge. The pair behaves as one edge-triggered flip-flop.' });
      const def = { sections: [{ id: 'd', kind: 'math', title: 'Master–slave', text: ['CLK = 0: master open (M = D),', '         slave closed (Q holds)', 'CLK ↑:   master closes on D,', '         slave opens: Q = M', '', 'Q(t+1) = D at the rising edge'].join('\n') }] };
      return { frames: F.list, def };
    },
    predict: [
      { at: (f) => f.meta && f.meta.ask, pick: 'option', options: ['0', '1'], ask: 'The slave has just opened. What will Q be?', answer: (fr, i) => String(fr[i].meta.q), explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'In a master–slave D flip-flop that changes on the rising edge, the master is open when…', options: ['CLK = 1', 'CLK = 0', 'always', 'never'], answer: 1, why: 'It listens while the clock is low, then closes at the rising edge.' },
      { q: 'Why are the master and slave never open together?', options: ['So D can never pass straight through to Q', 'To save power', 'To make the clock faster', 'They are open together'], answer: 0, why: 'One is enabled by CLK, the other by CLK′.' },
      { q: 'D changes while CLK = 1. Q…', options: ['follows D', 'does not change', 'goes to X', 'toggles'], answer: 1, why: 'The master is closed while the clock is high.' },
      { q: 'Q takes the value D had…', options: ['just before the rising edge', 'just after the rising edge', 'at the falling edge', 'at any time'], answer: 0, why: 'The master holds the last D it saw as it closed.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // The six-gate edge-triggered D flip-flop
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'six-gate', family: 'p5-flipflops', order: 30, title: 'The six-NAND edge-triggered D flip-flop',
    blurb: 'Three small NAND latches: two of them watch D and the clock and steer the third, which holds Q. At the rising edge exactly one of S′ and R′ drops to 0, and afterwards D can change freely.',
    inputs: [
      { id: 'd', kind: 'text', label: 'D, one value per 25 ns', def: '01100110001', check: bitsCheck('D', 14) },
    ],
    presets: [
      { label: 'D changes at all phases', values: { d: '01100110001' } },
      { label: 'D wiggles while the clock is 1', values: { d: '00101010100' } },
      { label: 'D held at 1', values: { d: '11111111111' } },
    ],
    counters: [{ id: 'steps', label: 'gate changes shown' }],
    run(inp) {
      const dv = bitsOf(inp.d), step = 25, n = dv.length, P = 100, end = n * step + 4;
      const c = TM.build.sixGate();
      const d0 = dv[0];
      const R = TM.run(c, { period: P, phase: P / 2, deposit: { 'g4.y': 1 - d0, 'g1.y': d0, "S'": 1, "R'": 1, Q: 0, "Q'": 1 }, stim: dv.map((v, i) => [i * step + (i ? 5 : 0), 'D', v]), until: end });
      const signals = TM.signals(R, ['CLK', 'D', "S'", "R'", 'Q'].map((x) => ({ name: x, label: nm(x) })));
      const gates = [['g1', 'g1.y'], ['g2', "S'"], ['g3', "R'"], ['g4', 'g4.y'], ['g5', 'Q'], ['g6', "Q'"]];
      const F = new S.Frames(['steps']);
      const scene = (t, hot) => TM.frame({ R, t, hot, t1: end, signals }).items;
      F.add({ items: scene(2), say: 'While CLK = 0, g2 and g3 both output 1 (a NAND with a 0 input), so S′ = R′ = 1 and the output latch g5–g6 holds Q = ' + R.at('Q', 2) + '. Meanwhile g4 and g1 follow D: g4 = D′, g1 = D.' });
      const edges = [];
      for (let t = P / 2; t < end; t += P) edges.push(t);
      edges.forEach((e, k) => {
        const d = R.at('D', e - 0.5);
        F.add({ items: scene(e - 0.5, ['g1', 'g4']), say: 'Just before the edge at ' + ns(e) + ': D = ' + d + ', so g4 = ' + R.at('g4.y', e - 0.5) + ' and g1 = ' + R.at('g1.y', e - 0.5) + '. These are what g2 and g3 will see when the clock rises.', meta: { ask: true, low: d ? "S'" : "R'", q: R.at('Q', e + 40) } });
        const evs = [];
        for (const [g, net] of gates) for (const [t, v] of R.changesIn(net, e - 0.01, e + 30)) evs.push({ g, net, t, v });
        evs.sort((a, b) => a.t - b.t);
        for (const ev of evs.slice(0, 5)) {
          F.count('steps');
          const why = { g2: 'S′ = (g1 · CLK)′', g3: 'R′ = (S′ · CLK · g4)′', g5: 'Q = (S′ · Q′)′', g6: 'Q′ = (R′ · Q)′', g1: 'g1 = (g4 · S′)′', g4: 'g4 = (R′ · D)′' }[ev.g];
          TM.verify(R, ev.t + 0.2, { [ev.net]: ev.v });
          F.add({ items: scene(ev.t + 0.2, [ev.g]), say: ns(ev.t) + ': ' + ev.g + ' changes, ' + nm(ev.net === 'g1.y' || ev.net === 'g4.y' ? ev.g : ev.net) + ' = ' + ev.v + ' (' + why + ').' + (ev.g === 'g2' && ev.v === 0 ? ' S′ = 0 sets the output latch, and also holds g1 at 1 so D can no longer reach it.' : ev.g === 'g3' && ev.v === 0 ? ' R′ = 0 resets the output latch, and also holds g4 at 1 so D can no longer reach it.' : '') });
        }
        const dch = R.changesIn('D', e + 1, e + P / 2).length;
        TM.verify(R, Math.min(end, e + P / 2 - 1), { Q: d, "S'": d ? 0 : 1, "R'": d ? 1 : 0 });
        F.add({ items: scene(Math.min(end, e + P / 2 - 1)), say: 'Clock high: Q = ' + R.at('Q', e + 40) + '.' + (dch ? ' D changed ' + dch + ' time' + (dch === 1 ? '' : 's') + ' meanwhile, but the low S′ or R′ blocks it: nothing reaches the output latch.' : ' D did not change.') + (k === 0 ? ' When the clock falls, S′ and R′ both return to 1 and the output latch just holds.' : '') });
      });
      F.add({ items: scene(end), mark: 'end', say: 'Each rising edge dropped exactly one of S′ and R′ (S′ for D = 1, R′ for D = 0), and only for the time the clock was high. Q changed just after the edges and nowhere else.' });
      const def = { sections: [{ id: 'd', kind: 'math', title: 'The six NAND gates', text: ["g1 = (g4 · S′)′     g4 = (R′ · D)′", "S′ = (g1 · CLK)′", "R′ = (S′ · CLK · g4)′", "Q = (S′ · Q′)′      Q′ = (R′ · Q)′", '', 'CLK = 0:  S′ = R′ = 1 (hold)', 'CLK ↑:    D = 1 → S′ = 0, D = 0 → R′ = 0'].join('\n') }] };
      return { frames: F.list, def };
    },
    predict: [
      { at: (f) => f.meta && f.meta.ask, pick: 'option', options: ['S′', 'R′'], ask: 'The clock is about to rise. Which of S′ and R′ will drop to 0?', answer: (fr, i) => nm(fr[i].meta.low), explain: (fr, i) => fr[i + 1].say, once: true },
      { at: (f, i, fr) => f.meta && f.meta.ask && i > 3, pick: 'option', options: ['0', '1'], ask: 'After this edge, what will Q be?', answer: (fr, i) => String(fr[i].meta.q), explain: (fr, i) => fr[i + 2].say },
    ],
    quiz: [
      { q: 'While CLK = 0 in the six-NAND flip-flop, S′ and R′ are…', options: ['both 0', 'both 1', 'D and D′', 'unknown'], answer: 1, why: 'g2 and g3 each have the clock as an input, and a NAND with a 0 input gives 1.' },
      { q: 'At the rising edge with D = 1, which line drops to 0?', options: ['S′', 'R′', 'both', 'neither'], answer: 0, why: 'g1 is 1 (it equals D), so g2 = (1 · 1)′ = 0.' },
      { q: 'Why can D change while CLK = 1 without affecting Q?', options: ['The low S′ or R′ forces g1 or g4 to 1, locking out D', 'The clock is too fast', 'Q is disconnected', 'D is ignored by g4 always'], answer: 0, why: 'The 0 on S′ holds g1 at 1; the 0 on R′ holds g4 at 1. Either way D cannot get through.' },
      { q: 'How many NAND gates does this flip-flop use?', options: ['4', '6', '8', '9'], answer: 1, why: 'Two input latches of two gates each, plus the output latch.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // JK and T flip-flops, characteristic tables
  // ---------------------------------------------------------------------------------------------------
  function ffTopic(kind) {
    const jk = kind === 'JK';
    return function (inp) {
      const type = jk ? 'JKFF' : 'TFF';
      const c = TM.build.ff(type);
      const ins = jk ? { J: bitsOf(inp.j), K: bitsOf(inp.k) } : { T: bitsOf(inp.t) };
      const n = (jk ? ins.J : ins.T).length;
      const R = TM.clocked(c, { cycles: n, inputs: ins, powerUp: 0 });
      const P = R.period, end = n * P + 2;
      const signals = TM.signals(R, ['CLK'].concat(Object.keys(ins), ['Q']));
      const F = new S.Frames(['edges', 'toggles']);
      const rowOf = (k) => (jk ? ins.J[k] * 2 + ins.K[k] : ins.T[k]);
      const scene = (t, hot, row) => TM.frame({ R, t, hot, t1: end, signals, side: (x, y) => charTable(x, y + 16, kind, row === undefined ? -1 : row), ticks: n }).items;
      F.add({ items: scene(1), say: 'A ' + kind + ' flip-flop, rising-edge triggered, starting at Q = 0. Its inputs change early in each clock period, well before the next edge.' });
      for (let k = 0; k < n; k++) {
        const e = R.edgeAt(k), q = R.at('Q', e - 0.5), qn = R.at('Q', e + 20);
        const row = rowOf(k);
        const iv = jk ? 'J = ' + ins.J[k] + ', K = ' + ins.K[k] : 'T = ' + ins.T[k];
        F.add({ items: scene(e - 0.5, [], row), say: 'Before edge ' + (k + 1) + ' (at ' + ns(e) + '): ' + iv + ', Q = ' + q + '.', meta: { ask: true, q: qn } });
        F.count('edges');
        if (qn !== q) F.count('toggles');
        const what = jk ? ['holds', 'resets', 'sets', 'toggles'][row] : ['holds', 'toggles'][row];
        TM.verify(R, e + 20, { Q: jk ? (ins.J[k] ? (ins.K[k] ? 1 - q : 1) : (ins.K[k] ? 0 : q)) : ins.T[k] ^ q });
        F.add({ items: scene(e + 20, ['ff'], row), say: 'At the edge the flip-flop ' + what + ': Q(t+1) = ' + qn + (jk ? ' = J·Q′ + K′·Q = ' + ins.J[k] + '·' + (1 - q) + ' + ' + (1 - ins.K[k]) + '·' + q : ' = T ⊕ Q = ' + ins.T[k] + ' ⊕ ' + q) + '.' });
      }
      F.add({ items: scene(end), mark: 'end', say: 'Q changed ' + F.counts.toggles + ' times in ' + n + ' edges, each time exactly as the characteristic table says.' + (!jk && ins.T.every((x) => x) ? ' With T held at 1, Q is a square wave at half the clock frequency: a T flip-flop divides by two.' : '') });
      const def = { sections: [{ id: 'd', kind: 'math', title: 'Characteristic equation', text: (jk ? ['Q(t+1) = J·Q′ + K′·Q', '', 'J K = 00 hold, 01 reset,', '      10 set, 11 toggle'] : ['Q(t+1) = T ⊕ Q = T·Q′ + T′·Q', '', 'T = 0 hold, T = 1 toggle']).join('\n') }] };
      return { frames: F.list, def };
    };
  }
  const ffPredict = [{ at: (f) => f.meta && f.meta.ask, pick: 'option', options: ['0', '1'], ask: 'What will Q be after this edge?', answer: (fr, i) => String(fr[i].meta.q), explain: (fr, i) => fr[i + 1].say }];
  S.topic({
    id: 'jk-ff', family: 'p5-flipflops', order: 40, title: 'The JK flip-flop',
    blurb: 'J sets, K resets, both 0 hold, and both 1 toggle: the SR flip-flop with its forbidden input turned into something useful. Its characteristic table and equation, checked edge by edge.',
    inputs: [
      { id: 'j', kind: 'text', label: 'J at each edge', def: '1001101', check: bitsCheck('J', 10) },
      { id: 'k', kind: 'text', label: 'K at each edge', def: '0101111', check: bitsCheck('K', 10) },
    ],
    check: sameLen('j', 'k'),
    presets: [
      { label: 'Every row of the table', values: { j: '1001101', k: '0101111' } },
      { label: 'J = K = 1: toggling', values: { j: '111111', k: '111111' } },
      { label: 'Set and reset only', values: { j: '100100', k: '010010' } },
    ],
    counters: [{ id: 'edges', label: 'edges' }, { id: 'toggles', label: 'Q changes' }],
    run: ffTopic('JK'),
    predict: ffPredict,
    quiz: [
      { q: 'J = 1, K = 1 at the edge, Q = 0. After the edge Q is…', options: ['0', '1', 'unknown', 'it oscillates'], answer: 1, why: 'Both 1 toggles: Q becomes Q′ = 1.' },
      { q: 'The characteristic equation of the JK flip-flop is…', options: ['Q(t+1) = J + K′Q', 'Q(t+1) = JQ′ + K′Q', 'Q(t+1) = J ⊕ K', 'Q(t+1) = JK + Q'], answer: 1, why: 'Set when J = 1 and Q = 0; stay at 1 unless K = 1.' },
      { q: 'J = 0, K = 1 gives…', options: ['set', 'reset', 'hold', 'toggle'], answer: 1, why: 'K resets.' },
      { q: 'Which input pair of the SR flip-flop does the JK flip-flop give a use to?', options: ['00', '01', '10', '11'], answer: 3, why: 'S = R = 1 is forbidden for SR; J = K = 1 toggles.' },
    ],
  });
  S.topic({
    id: 't-ff', family: 'p5-flipflops', order: 50, title: 'The T flip-flop',
    blurb: 'One input: T = 1 toggles at the edge, T = 0 holds. Q(t+1) = T ⊕ Q. Held at 1, it divides the clock frequency by two, the start of every binary counter.',
    inputs: [{ id: 't', kind: 'text', label: 'T at each edge', def: '1101001', check: bitsCheck('T', 10) }],
    presets: [
      { label: 'Toggle and hold', values: { t: '1101001' } },
      { label: 'T = 1: divide by two', values: { t: '11111111' } },
      { label: 'T = 0: hold', values: { t: '000000' } },
    ],
    counters: [{ id: 'edges', label: 'edges' }, { id: 'toggles', label: 'Q changes' }],
    run: ffTopic('T'),
    predict: ffPredict,
    quiz: [
      { q: 'T = 1 at the edge, Q = 1. After the edge Q is…', options: ['0', '1', 'unknown', 'T'], answer: 0, why: 'T = 1 toggles.' },
      { q: 'Q(t+1) for a T flip-flop is…', options: ['T', 'T·Q', 'T ⊕ Q', 'T + Q'], answer: 2, why: 'It toggles when T = 1 and holds when T = 0: an XOR.' },
      { q: 'A T flip-flop with T = 1 and a 10 MHz clock gives a Q of…', options: ['10 MHz', '5 MHz', '20 MHz', '2.5 MHz'], answer: 1, why: 'One full Q cycle takes two clock edges.' },
      { q: 'A JK flip-flop becomes a T flip-flop when…', options: ['J = K = T', 'J = T, K = 0', 'J = 0, K = T', 'J = T′, K = T'], answer: 0, why: 'J = K = 0 holds and J = K = 1 toggles.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // JK and T from a D flip-flop
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'ff-from-d', family: 'p5-flipflops', order: 60, title: 'JK and T from a D flip-flop',
    blurb: 'A D flip-flop stores whatever D is at the edge, so any flip-flop is a D flip-flop with its characteristic equation built in gates in front of D.',
    inputs: [{ id: 'kind', kind: 'choice', label: 'Build', def: 'JK', options: [{ value: 'JK', label: 'JK: D = JQ′ + K′Q' }, { value: 'T', label: 'T: D = T ⊕ Q' }] },
      { id: 'a', kind: 'text', label: 'J (or T) at each edge', def: '110110', check: bitsCheck('J', 8) },
      { id: 'b', kind: 'text', label: 'K at each edge (JK only)', def: '011011', check: bitsCheck('K', 8) }],
    check: (inp) => (inp.kind === 'JK' && bitsOf(inp.a).length !== bitsOf(inp.b).length ? 'J and K need the same number of values' : null),
    presets: [
      { label: 'JK', values: { kind: 'JK', a: '110110', b: '011011' } },
      { label: 'T', values: { kind: 'T', a: '110101' } },
    ],
    counters: [{ id: 'edges', label: 'edges' }],
    run(inp) {
      const jk = inp.kind === 'JK';
      const c = new N.Circuit(jk ? 'JK from D' : 'T from D');
      const f = c.add('DFF', {}, 'ff');
      const q = f.pin('q'), qn = f.pin('qn');
      let d;
      if (jk) {
        const j = c.input('J').pin('y'), k = c.input('K').pin('y');
        d = G(c, 'OR', [G(c, 'AND', [j, qn], { id: 'a1' }), G(c, 'AND', [G(c, 'NOT', [k], { id: 'n1' }), q], { id: 'a2' })], { id: 'o1' });
      } else {
        const t = c.input('T').pin('y');
        d = G(c, 'OR', [G(c, 'AND', [t, qn], { id: 'a1' }), G(c, 'AND', [G(c, 'NOT', [t], { id: 'n1' }), q], { id: 'a2' })], { id: 'o1' });
      }
      c.connect(d, f.pin('d')); c.name(d, 'D', true);
      c.connect(c.clock('CLK').pin('y'), f.pin('clk'));
      c.connect(q, c.output('Q'));
      const av = bitsOf(inp.a), bv = bitsOf(inp.b), n = av.length;
      const R = TM.clocked(c, { cycles: n, inputs: jk ? { J: av, K: bv } : { T: av }, powerUp: 0 });
      const end = n * R.period + 2;
      const signals = TM.signals(R, ['CLK'].concat(jk ? ['J', 'K'] : ['T'], ['D', 'Q']));
      const F = new S.Frames(['edges']);
      const scene = (t, hot) => TM.frame({ R, t, hot, t1: end, signals, ticks: n }).items;
      F.add({ items: scene(1), say: (jk ? 'The JK characteristic equation Q(t+1) = JQ′ + K′Q, built as two ANDs and an OR,' : 'The T characteristic equation Q(t+1) = T ⊕ Q = TQ′ + T′Q, built as two ANDs and an OR (one XOR would do),') + ' feeds D. Whatever D is at the edge becomes the next Q, so the D flip-flop behaves as a ' + inp.kind + ' flip-flop.' });
      for (let k = 0; k < n; k++) {
        const e = R.edgeAt(k), q0 = R.at('Q', e - 0.5), dd = R.at('D', e - 0.5);
        F.count('edges');
        TM.verify(R, e - 0.5, Object.assign({ D: jk ? (av[k] & (1 - q0)) | ((1 - bv[k]) & q0) : av[k] ^ q0 }, jk ? { J: av[k], K: bv[k] } : { T: av[k] }));
        F.add({ items: scene(e - 0.5, ['a1', 'a2', 'o1']), say: 'Before edge ' + (k + 1) + ': ' + (jk ? 'J = ' + av[k] + ', K = ' + bv[k] + ', Q = ' + q0 + ', so D = ' + av[k] + '·' + (1 - q0) + ' + ' + (1 - bv[k]) + '·' + q0 + ' = ' + dd : 'T = ' + av[k] + ', Q = ' + q0 + ', so D = ' + av[k] + ' ⊕ ' + q0 + ' = ' + dd) + '.', meta: { ask: true, d: dd } });
        TM.verify(R, e + 25, { Q: dd });
        F.add({ items: scene(e + 25, ['ff']), say: 'At the edge Q takes D: Q = ' + R.at('Q', e + 25) + '. The new Q goes round to the gates, which now work out the next D.' });
      }
      F.add({ items: scene(end), mark: 'end', say: 'The waveform is exactly that of a ' + inp.kind + ' flip-flop with these inputs. This is how the other flip-flop types are usually made inside a chip or an FPGA, where D flip-flops are what is available.' });
      return { frames: F.list, def: { sections: [{ id: 'd', kind: 'math', title: 'The gates in front of D', text: (jk ? ['D = J·Q′ + K′·Q'] : ['D = T ⊕ Q = T·Q′ + T′·Q']).join('\n') }] } };
    },
    predict: [{ at: (f) => f.meta && f.meta.ask, pick: 'option', options: ['0', '1'], ask: 'Q after this edge?', answer: (fr, i) => String(fr[i].meta.d), explain: (fr, i) => fr[i + 1].say }],
    quiz: [
      { q: 'To make a T flip-flop from a D flip-flop, D = …', options: ['T', 'T·Q', 'T ⊕ Q', 'T + Q′'], answer: 2, why: 'D must equal the next state, which is T ⊕ Q.' },
      { q: 'To make a JK flip-flop from a D flip-flop, D = …', options: ['J + K', 'JQ′ + K′Q', 'J ⊕ K', 'JK′'], answer: 1, why: 'The JK characteristic equation.' },
      { q: 'Why is the D flip-flop the easiest to design with?', options: ['Its next state is simply its input', 'It is fastest', 'It has two inputs', 'It never needs a clock'], answer: 0, why: 'Q(t+1) = D, so the logic in front computes the next state directly.' },
      { q: 'A D flip-flop with D = Q′ behaves like…', options: ['a T flip-flop with T = 1', 'a JK with J = K = 0', 'a latch', 'nothing useful'], answer: 0, why: 'It toggles at every edge.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Asynchronous preset and clear
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'async-pc', family: 'p5-flipflops', order: 70, title: 'Asynchronous preset and clear',
    blurb: 'Two extra inputs, active low, that act at once without waiting for the clock: PRE′ = 0 forces Q = 1, CLR′ = 0 forces Q = 0. While either is active the clock is ignored.',
    inputs: [
      { id: 'd', kind: 'text', label: 'D at each clock edge (one per 100 ns)', def: '1011', check: bitsCheck('D', 5) },
      { id: 'pre', kind: 'text', label: "PRE′, one value per 25 ns", def: '1111111011111111', check: bitsCheck('PRE′', 20) },
      { id: 'clr', kind: 'text', label: "CLR′, one value per 25 ns", def: '0110111111111001', check: bitsCheck('CLR′', 20) },
    ],
    check: (inp) => { const e = sameLen('pre', 'clr')(inp); if (e) return e; return bitsOf(inp.d).length * 4 < bitsOf(inp.pre).length ? 'D needs one value for every 4 values of PRE′ and CLR′ (one per clock period)' : null; },
    presets: [
      { label: 'Clear, preset, clear held over edges', values: { d: '1011', pre: '1111111011111111', clr: '0110111111111001' } },
      { label: 'Power-up clear, then clocked', values: { d: '1101', pre: '1111111111111111', clr: '0000011111111111' } },
      { label: 'Both active at once', values: { d: '0100', pre: '1111001111111111', clr: '0110000111111111' } },
    ],
    counters: [{ id: 'async', label: 'asynchronous changes' }],
    run(inp) {
      const dv = bitsOf(inp.d), pv = bitsOf(inp.pre), cv = bitsOf(inp.clr), step = 25, n = pv.length, P = 100, end = n * step + 4;
      const c = TM.build.ff('DFF', { set: true, reset: true, asyncLow: true });
      const stim = [];
      for (let i = 0; i < n; i++) { const t = i * step + (i ? 5 : 0); stim.push([t, "PRE'", pv[i]], [t, "CLR'", cv[i]]); }
      dv.forEach((v, k) => stim.push([k * P + (k ? 15 : 0), 'D', v]));
      const R = TM.run(c, { period: P, phase: P / 2, powerUp: 0, stim, until: end });
      const signals = TM.signals(R, ['CLK', 'D', "PRE'", "CLR'", 'Q', "Q'"].map((x) => ({ name: x, label: nm(x) })));
      const edges = []; for (let t = P / 2; t < end; t += P) edges.push(t);
      const F = new S.Frames(['async']);
      const marks = (t) => edges.filter((e) => e <= t).map((e, k) => ({ t: e, key: 'e' + k, label: '↑' }));
      const scene = (t, hot) => TM.frame({ R, t, hot, t1: end, signals, marks: marks(t) }).items;
      F.add({ items: scene(1), say: 'A rising-edge D flip-flop with active-low preset and clear. With PRE′ = CLR′ = 1 it is an ordinary D flip-flop.' + (cv[0] === 0 ? ' The run starts with CLR′ = 0, a power-on clear, so Q = 0 from the start.' : '') });
      // walk the moments something happens: each async input change, and each edge
      const moments = [];
      for (let i = 1; i < n; i++) if (pv[i] !== pv[i - 1] || cv[i] !== cv[i - 1]) moments.push({ t: i * step + 5, kind: 'async', i });
      for (const e of edges) moments.push({ t: e, kind: 'edge' });
      moments.sort((a, b) => a.t - b.t);
      moments.forEach((m, mi) => {
        const nx = moments[mi + 1], after = Math.min(end, m.t + 22, nx ? nx.t - 0.5 : end);
        if (m.kind === 'async') {
          const p = pv[m.i], cl = cv[m.i];
          let say;
          if (!p && !cl) say = 'At ' + ns(m.t) + ' both PRE′ and CLR′ are 0: Q and Q′ are both forced to 1 (' + nm('Q') + ' = ' + R.at('Q', after) + ', Q′ = ' + R.at("Q'", after) + '), not complements. Like S = R = 1 on a latch, this is avoided.';
          else if (!p) say = 'At ' + ns(m.t) + ' PRE′ goes to 0. No clock edge is needed: Q goes to 1 at once (' + ns(R.changesIn('Q', m.t, m.t + 30).length ? R.changesIn('Q', m.t, m.t + 30)[0][0] - m.t : 0) + ' later), whatever D is.';
          else if (!cl) say = 'At ' + ns(m.t) + ' CLR′ goes to 0: Q goes to 0 at once, without waiting for the clock.';
          else say = 'At ' + ns(m.t) + ' the asynchronous inputs return to 1. Q keeps ' + R.at('Q', after) + ' until the next clock edge.';
          if (R.changesIn('Q', m.t, after).length) F.count('async');
          if (after - m.t > 16) TM.verify(R, after, !p && !cl ? { Q: 1, "Q'": 1 } : !p ? { Q: 1 } : !cl ? { Q: 0 } : { Q: R.at('Q', m.t - 0.5) });
          F.add({ items: scene(after, ['ff']), say, meta: { ask: true, async: true, q: R.at('Q', after) } });
        } else {
          const p = R.at("PRE'", m.t), cl = R.at("CLR'", m.t), d = R.at('D', m.t - 0.5);
          const blocked = !p || !cl;
          if (after - m.t > 16) TM.verify(R, after, { Q: !cl && p ? 0 : !p && cl ? 1 : !p && !cl ? 1 : d });
          F.add({ items: scene(after, blocked ? [] : ['ff']), say: 'Clock edge at ' + ns(m.t) + ' with D = ' + d + (blocked ? ', but ' + (!cl ? 'CLR′' : 'PRE′') + ' is still 0, so the edge is ignored: Q stays ' + R.at('Q', after) + '.' : ': Q = ' + R.at('Q', after) + '.'), meta: { ask: true, q: R.at('Q', after) } });
        }
      });
      F.add({ items: scene(end), mark: 'end', say: 'Preset and clear acted the moment they went low, between clock edges; while either was held low, the clock did nothing. A clear wired to a power-on reset is the usual way to start a circuit from a known state.' });
      return { frames: F.list, def: { sections: [{ id: 'd', kind: 'math', title: 'Priority', text: ["PRE′ = 0:  Q = 1 at once", "CLR′ = 0:  Q = 0 at once", 'both 1:    Q(t+1) = D at the edge', 'both 0:    Q = Q′ = 1 (avoid)'].join('\n') }] } };
    },
    predict: [{ at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.ask && (fr[i + 1].meta.async || /ignored/.test(fr[i + 1].say)), pick: 'option', options: ['0', '1'], ask: (fr, i) => (fr[i + 1].meta.async ? 'An asynchronous input is about to change. What will Q be just after?' : 'A clock edge is coming. What will Q be after it?'), answer: (fr, i) => String(fr[i + 1].meta.q), explain: (fr, i) => fr[i + 1].say }],
    quiz: [
      { q: 'An asynchronous clear acts…', options: ['at the next clock edge', 'at once, whatever the clock', 'only when D = 0', 'only when the clock is 1'], answer: 1, why: 'Asynchronous means not tied to the clock.' },
      { q: "CLR′ is held at 0 across a rising edge with D = 1. Q after the edge is…", options: ['1', '0', 'X', 'toggles'], answer: 1, why: 'The clear overrides the clock for as long as it is active.' },
      { q: 'Why are preset and clear often active low?', options: ['A 0 is easy to make with a switch to ground or an open-collector driver, and an unused input can be tied high', 'They are faster', 'Active-high inputs do not exist', 'To save a gate'], answer: 0, why: 'In TTL especially, an input left high is safe, and pulling a line low is what simple drivers do best.' },
      { q: 'Both PRE′ and CLR′ at 0 gives…', options: ['Q = 0', 'Q = 1', 'Q = Q′ = 1', 'a toggle'], answer: 2, why: 'Both force their outputs high; it is not a valid state.' },
    ],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
