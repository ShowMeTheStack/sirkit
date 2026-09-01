// Part 7, counters: ripple counters (binary and decade) with the ripple delay and the decoding glitches it
// causes, synchronous counters, an up/down counter with parallel load, counters with unused states (and one that
// locks out), ring and Johnson counters with their decoding, a sequence generator, and a counter's state diagram
// lit in step with its waveform.
(function (S) {
  'use strict';
  // the circuits sit above their waveforms, so they are shown small: their names (pin names too) drawn larger
  const NAMES = 1.3;
  const K = S.Kit, TM = K.timing, N = S.Netlist, G = TM.G;
  const ns = TM.ns, bin = TM.bin;
  const bitsOf = (v) => String(v).replace(/\s+/g, '').split('').map(Number);
  const bitsCheck = (label, max) => (v) => { const s = String(v).replace(/\s+/g, ''); if (!/^[01]+$/.test(s)) return label + ': write 0s and 1s'; if (s.length > (max || 10)) return label + ': at most ' + (max || 10) + ' values'; return null; };
  const names = (n, pre) => { const out = []; for (let i = n - 1; i >= 0; i--) out.push((pre || 'Q') + i); return out; };

  /** the self-check: a count the narration states, bit by bit against the simulation (names most significant first) */
  const claimNum = (R, t, names, v) => { if (typeof v === 'number') TM.verify(R, t, Object.fromEntries(names.map((nm, i) => [nm, (v >> (names.length - 1 - i)) & 1]))); };

  S.family({ id: 'p7-counters', part: 'registers', order: 20, title: 'Counters', blurb: 'Flip-flops that step through a sequence of states: ripple and synchronous counters, counters that skip states, ring and Johnson counters, and sequence generators.' });

  /** a state diagram of a counter, lit at the state the bits show at time t */
  const ring = (states, o) => TM.diagram(Object.assign({ R: Math.max(80, states.length * 15), r: 22, size: 12 }, o, { states: states.map((s) => (typeof s === 'object' ? s : { id: String(s), label: String(s) })) }));

  // ---------------------------------------------------------------------------------------------------
  // Ripple counters
  // ---------------------------------------------------------------------------------------------------
  /** the chain of changes after an edge: each bit's change, in order, with the value the count shows after it */
  function ripplePath(R, Q, e, span) {
    const times = [...new Set(Q.flatMap((q) => R.changesIn(q, e, e + span).map((x) => x[0])))].sort((a, b) => a - b);
    return times.map((t) => ({ t, v: TM.busAt(R, Q, t), bits: Q.filter((q) => R.changesIn(q, t - 0.001, t).length) }));
  }
  function rippleTopic(kind) {
    const bcd = kind === 'bcd';
    return function (inp) {
      const n = bcd ? 4 : +inp.n, P = 100;
      const dec = bcd ? null : inp.decode === 'none' ? null : +inp.decode;
      const c = TM.memo('ripple:' + n + ':' + kind + ':' + dec, () => TM.build.ripple(n, bcd ? { mod: 10, rst: true } : { decode: dec }));
      const cycles = bcd ? 12 : Math.min((1 << n) + 1, 17);
      // the decade counter's reset needs a while to take hold, so its first edge comes a period later
      const ph = bcd ? P * 1.5 : P / 2, end = cycles * P + ph - P / 2 + 2;
      const R = TM.run(c, { tech: inp.tech, period: P, phase: ph, powerUp: 0, stim: bcd ? [[0, "RST'", 0], [60, "RST'", 1]] : [], until: end });
      const Q = names(n), tcq = R.sim.timing('f0').tpLH;
      const sigs = [{ name: 'CLK', changes: R.changes('CLK') }].concat(Q.slice().reverse().map((q) => ({ name: q, changes: R.changes(q) })), [{ name: 'count', changes: TM.bus(R, Q), width: n }]);
      if (dec !== null) sigs.push({ name: 'DEC', label: 'DEC (= ' + dec + ')', changes: R.changes('DEC'), cls: 'hotwave' });
      if (bcd) sigs.push({ name: "CLR'", label: 'CLR′', changes: R.changes("CLR'") });
      const F = new S.Frames(['edges', 'glitches']);
      const scene = (t, o) => TM.frame(Object.assign({ R, t, textScale: NAMES, pinCap: NAMES, t1: end, signals: sigs, ticks: Math.min(cycles, 8) }, o)).items;
      const zoom = (t, e, hot) => TM.frame({ R, t, textScale: NAMES, pinCap: NAMES, t0: e - 10, t1: e + n * tcq + 30, signals: sigs, ticks: 4, hot, marks: [{ t: e, key: 'z', label: 'edge', cls: 'hot' }] }).items;
      F.add({ items: scene(1), say: (bcd ? 'A decade counter: four T flip-flops counting in binary, with a NAND watching for 1010 (Q3 and Q1 both 1). When it sees ten it clears every flip-flop at once, so the count goes 0 to 9 and back to 0. RST′ starts it at 0000.' : 'A ' + n + '-bit ripple counter: every T input is tied to 1, so each flip-flop toggles at its clock; flip-flop 0 is clocked by CLK and each of the others by the Q′ of the one before.' + (dec !== null ? ' An AND gate decodes the count ' + dec + ' (' + bin(dec, n) + ').' : '')) + ' Each flip-flop takes ' + tcq + ' ns from its clock to its output.' });
      // the edge with the longest ripple gets zoomed
      let worst = 0, wk = 0;
      const paths = [];
      for (let k = 0; k < cycles; k++) { const e = R.edgeAt(k), p = ripplePath(R, Q, e, n * tcq + 20); paths.push(p); if (bcd ? TM.busAt(R, Q, e - 0.5) === 9 && !worst : p.length > worst) { worst = p.length; wk = k; } }
      for (let k = 0; k < cycles; k++) {
        const e = R.edgeAt(k), p = paths[k];
        const from = TM.busAt(R, Q, e - 0.5), to = TM.busAt(R, Q, e + n * tcq + 25);
        F.count('edges');
        const dg = dec !== null ? R.changesIn('DEC', e, e + n * tcq + 25).length : 0;
        if (dg > 1) F.count('glitches');
        if (k === wk) {
          F.add({ items: zoom(e - 1, e), say: 'Edge ' + (k + 1) + ', zoomed in: the count is ' + from + ' (' + bin(from, n) + '). ' + (bcd ? 'The next count, 0, takes several steps to reach.' : 'Every bit will change, one after another.') + ' Which flip-flop changes first?', meta: { ask: true, first: 'Q0' } });
          p.forEach((s, j) => F.add({ items: zoom(s.t + 0.5, e, s.bits.map((b) => 'f' + b.slice(1))), say: ns(s.t - e) + ' after the edge: ' + s.bits.join(', ') + ' change' + (s.bits.length === 1 ? 's' : '') + ', so the outputs read ' + bin(s.v, n) + ' = ' + s.v + (j < p.length - 1 ? '. That is a false count: the ripple has not finished.' : bcd && s.v === 0 && from === 9 ? '. The clear has done its work.' : '. Settled.') + (bcd && s.v === 10 ? ' The NAND sees 1010 and pulls CLR′ low…' : '') + (dec !== null && s.v === dec && j < p.length - 1 ? ' The decoder sees ' + dec + ' for a moment: a glitch on DEC.' : '') }));
        } else {
          const mid = p.slice(0, -1).map((s) => s.v);
          if (typeof from === 'number') claimNum(R, Math.min(end, e + n * tcq + 25), Q, bcd ? (from + 1) % 10 : (from + 1) % (1 << n));
          F.add({ items: scene(Math.min(end, e + n * tcq + 25)), say: 'Edge ' + (k + 1) + ': ' + from + ' → ' + to + (p.length > 1 ? ', passing through ' + mid.join(', ') + ' on the way (' + ns(p[p.length - 1].t - e) + ' to settle)' : ' (' + ns(p.length ? p[0].t - e : tcq) + ')') + '.' + (dg > 1 ? ' DEC glitched.' : ''), meta: { from, to } });
        }
      }
      const g = F.counts.glitches;
      F.add({ items: scene(end), mark: 'end', say: bcd ? 'The count ran 0 to 9 and wrapped. The state 1010 did exist, but only for the moment it took the clear to act: a glitch that anything decoding the count would see.' : 'The worst edge took ' + ns(paths[wk][paths[wk].length - 1].t - R.edgeAt(wk)) + ' to settle (' + n + ' × ' + tcq + ' ns), and in between the count showed false values.' + (dec !== null ? ' The decoder for ' + dec + ' glitched on ' + g + ' edge' + (g === 1 ? '' : 's') + '. Decoding a ripple counter needs care: strobe the decoder after the ripple, or use a synchronous counter.' : ' The delay grows with every bit, which is why ripple counters are slow when wide.') });
      return { frames: F.list, def: { sections: [{ id: 'd', kind: 'math', title: bcd ? 'Decade (BCD) ripple counter' : 'Ripple counter', text: (bcd ? ['T = 1 on every flip-flop', 'CLR′ = (Q3·Q1)′ · RST′', 'counts 0 … 9, 1010 lasts a moment'] : ['T = 1 on every flip-flop', 'clock(i) = Q′(i−1)', 'settles after up to n · tcq = ' + n * tcq + ' ns']).join('\n') }] } };
    };
  }
  S.topic({
    id: 'ripple-counter', family: 'p7-counters', order: 10, title: 'The ripple counter',
    blurb: 'Each flip-flop toggles when the one before it goes from 1 to 0, so a count goes up by one; but the change ripples down the chain one clock-to-Q at a time, and for a moment the outputs show counts that never happened.',
    inputs: [
      { id: 'n', kind: 'choice', label: 'Bits', def: '3', options: [{ value: '3', label: '3 (0 to 7)' }, { value: '4', label: '4 (0 to 15)' }] },
      { id: 'decode', kind: 'choice', label: 'Decode', def: '6', options: [{ value: 'none', label: 'nothing' }].concat([1, 2, 4, 6].map((v) => ({ value: String(v), label: 'the count ' + v }))) },
      { id: 'tech', kind: 'choice', label: 'Technology', def: 'CMOS', options: [{ value: 'CMOS', label: 'CMOS' }, { value: 'TTL', label: 'TTL' }] },
    ],
    presets: [
      { label: '3 bits, decode 6', values: { n: '3', decode: '6' } },
      { label: '3 bits, decode 2', values: { n: '3', decode: '2' } },
      { label: '4 bits, no decoder', values: { n: '4', decode: 'none' } },
      { label: '4 bits, decode 4, TTL', values: { n: '4', decode: '4', tech: 'TTL' } },
    ],
    counters: [{ id: 'edges', label: 'edges' }, { id: 'glitches', label: 'decoder glitches' }],
    run: rippleTopic('binary'),
    predict: [
      { at: (f) => f.meta && f.meta.ask, pick: 'option', options: (fr) => ['Q0', 'Q1', 'Q2'].concat(fr.length > 30 ? ['Q3'] : []), ask: (fr, i) => fr[i].say.split('. ').slice(-1)[0], answer: 'Q0', explain: (fr, i) => fr[i + 1].say },
      { at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.to !== undefined && fr[i + 1].meta.to !== null && i > 1, pick: 'option', options: ['0', '1', '2', '3', '4', '5', '6', '7'], ask: 'What will the count settle at after the next edge?', answer: (fr, i) => String(fr[i + 1].meta.to % 8), explain: (fr, i) => fr[i + 1].say, once: true },
    ],
    quiz: [
      { q: 'In a ripple counter, flip-flop i is clocked by…', options: ['the main clock', 'the output of flip-flop i − 1', 'its own Q', 'an AND gate'], answer: 1, why: 'Each stage toggles when the one before falls from 1 to 0.' },
      { q: 'A 4-bit ripple counter with tcq = 10 ns goes from 0111 to 1000. It settles after…', options: ['10 ns', '20 ns', '40 ns', '80 ns'], answer: 2, why: 'All four bits change, one after another: 4 × 10 ns.' },
      { q: 'From 011 to 100 a 3-bit ripple counter passes through…', options: ['nothing', '010 then 000', '111 then 101', '001'], answer: 1, why: 'Q0 falls first (010), then Q1 (000), then Q2 rises (100).' },
      { q: 'Why can a decoder on a ripple counter glitch?', options: ['Its gates are too slow', 'The bits change at different times, so for a moment the count is a value the counter never really held', 'The clock is too fast', 'It cannot'], answer: 1, why: 'The in-between counts are real outputs for a few nanoseconds.' },
    ],
  });
  S.topic({
    id: 'bcd-ripple', family: 'p7-counters', order: 20, title: 'The decade (BCD) ripple counter',
    blurb: 'Count in binary and clear everything the moment the count reaches ten: a counter that goes 0 to 9. The state 1010 does appear, for just as long as the clear takes.',
    inputs: [{ id: 'tech', kind: 'choice', label: 'Technology', def: 'CMOS', options: [{ value: 'CMOS', label: 'CMOS' }, { value: 'TTL', label: 'TTL' }, { value: 'LS-TTL', label: 'LS-TTL' }] }],
    presets: [{ label: 'CMOS', values: { tech: 'CMOS' } }, { label: 'TTL', values: { tech: 'TTL' } }],
    counters: [{ id: 'edges', label: 'edges' }],
    run: rippleTopic('bcd'),
    predict: [
      { at: (f) => f.meta && f.meta.ask, pick: 'option', options: ['Q0', 'Q1', 'Q2', 'Q3'], ask: 'The count is 9 (1001). After the edge, which flip-flop changes first?', answer: 'Q0', explain: (fr, i) => fr[i + 1].say },
      { at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.from === 8, pick: 'option', options: ['8', '9', '10', '0'], ask: 'The count is 8. What will it be after the next edge?', answer: '9', explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'A decade counter clears when it detects…', options: ['1001', '1010', '1111', '0000'], answer: 1, why: 'Ten is 1010; the clear returns it to 0000.' },
      { q: 'Why is a NAND of Q3 and Q1 enough to detect ten?', options: ['Q3 and Q1 are both 1 only at 10 (and 11, 14, 15, which are never reached)', 'It is a full decoder', 'Q0 is always 0', 'It is not enough'], answer: 0, why: 'Among 0 to 10, only 10 has both Q3 and Q1 set.' },
      { q: 'How long does the state 1010 last?', options: ['a whole clock period', 'about the time the clear takes to act', 'never', 'half a period'], answer: 1, why: 'The NAND and the flip-flops\' clear delay set how long it is visible.' },
      { q: 'An asynchronous clear used to shorten a count is risky because…', options: ['the unwanted state still appears briefly, and a too-short clear pulse may not reset every flip-flop', 'it uses more power', 'it needs a faster clock', 'it is not risky'], answer: 0, why: 'The clear removes its own cause, so its pulse is very short.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Synchronous counter
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'sync-counter', family: 'p7-counters', order: 30, title: 'The synchronous counter',
    blurb: 'All flip-flops share one clock; a chain of AND gates decides which ones toggle: bit i toggles when every lower bit is 1. Every bit that changes, changes at the same moment.',
    inputs: [{ id: 'en', kind: 'text', label: 'EN at each edge', def: '1111111110111111111', check: bitsCheck('EN', 20) }],
    presets: [
      { label: 'Count, pause once', values: { en: '1111111110111111111' } },
      { label: 'Count every edge', values: { en: '11111111111111111' } },
      { label: 'Count every other edge', values: { en: '1010101010101010' } },
    ],
    counters: [{ id: 'edges', label: 'edges' }, { id: 'counts', label: 'counts' }],
    run(inp) {
      const ev = bitsOf(inp.en), n = ev.length;
      const c = TM.build.syncT(4);
      const R = TM.clocked(c, { cycles: n, inputs: { EN: ev }, powerUp: 0 });
      const Q = names(4), end = n * R.period + 2, tcq = R.sim.timing('f0').tpLH;
      const sigs = [{ name: 'CLK', changes: R.changes('CLK') }, { name: 'EN', changes: R.changes('EN') }].concat(Q.slice().reverse().map((q) => ({ name: q, changes: R.changes(q) })), [{ name: 'count', changes: TM.bus(R, Q), width: 4 }]);
      const F = new S.Frames(['edges', 'counts']);
      const scene = (t, hot) => TM.frame({ R, t, textScale: NAMES, pinCap: NAMES, hot, t1: end, signals: sigs, ticks: 8 }).items;
      F.add({ items: scene(1), say: 'T0 = EN, T1 = EN·Q0, T2 = EN·Q0·Q1, T3 = EN·Q0·Q1·Q2: a flip-flop toggles exactly when all the bits below it are 1, which is how binary counting carries.' });
      for (let k = 0; k < n; k++) {
        const e = R.edgeAt(k), from = TM.busAt(R, Q, e - 0.5), to = TM.busAt(R, Q, e + tcq + 5);
        const ts = [...new Set(Q.flatMap((q) => R.changesIn(q, e, e + 50).map((x) => x[0])))];
        F.count('edges'); if (ev[k]) F.count('counts');
        const tg = [0, 1, 2, 3].filter((i) => ((from ^ to) >> i) & 1);
        claimNum(R, e + tcq + 5, Q, typeof from === 'number' ? (ev[k] ? (from + 1) % 16 : from) : null);
        F.add({ items: scene(e + tcq + 5, tg.map((i) => 'f' + i)), say: 'Edge ' + (k + 1) + ', EN = ' + ev[k] + ': ' + bin(from, 4) + ' → ' + bin(to, 4) + (tg.length ? ' (' + tg.map((i) => 'Q' + i).join(', ') + ' toggle' + (tg.length === 1 ? 's' : '') + (ts.length === 1 && tg.length > 1 ? ', all at ' + ns(ts[0] - e) + ' after the edge' : '') + ').' : ', no change.'), meta: { ask: k === 6, to: bin(to, 4) } });
      }
      F.add({ items: scene(end), mark: 'end', say: 'Every change came ' + tcq + ' ns after its edge, however many bits changed: no ripple, no false counts. The price is the AND chain, which must settle within the clock period.' });
      return { frames: F.list, def: { sections: [{ id: 'd', kind: 'math', title: 'Synchronous binary counter', text: ['T0 = EN', 'Ti = EN · Q0 · Q1 ⋯ Q(i−1)', 'all bits clocked together'].join('\n') }] } };
    },
    predict: [{ at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.ask, pick: 'option', options: (fr, i) => [fr[i + 1].meta.to, '0000', '1111', '1000'].filter((x, j, a) => a.indexOf(x) === j).sort(), ask: 'The count after the next edge (Q3..Q0)?', answer: (fr, i) => fr[i + 1].meta.to, explain: (fr, i) => fr[i + 1].say }],
    quiz: [
      { q: 'In a synchronous binary counter, T2 = …', options: ['Q2', 'Q0·Q1 (times EN)', 'Q1', 'Q0 + Q1'], answer: 1, why: 'Bit 2 toggles when bits 0 and 1 are both 1.' },
      { q: 'From 0111 to 1000, a synchronous counter\'s outputs change…', options: ['one after another', 'all together, a clock-to-Q after the edge', 'over four clocks', 'only Q3 changes'], answer: 1, why: 'All flip-flops share the clock.' },
      { q: 'Compared with a ripple counter, a synchronous counter…', options: ['needs no gates', 'has no false intermediate counts', 'is slower', 'cannot be enabled'], answer: 1, why: 'The bits change together.' },
      { q: 'What limits the clock of a wide synchronous counter?', options: ['the AND chain must settle within the period', 'the number of flip-flops', 'nothing', 'the ripple'], answer: 0, why: 'The longest AND path plus setup must fit in a period (lookahead ANDs shorten it).' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Up/down counter with parallel load
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'updown-counter', family: 'p7-counters', order: 40, title: 'Up/down counter with parallel load',
    blurb: 'A 4-bit synchronous counter with a direction input UP and a load input LD that has priority: at each edge it loads D, or counts up, or counts down, wrapping at the ends.',
    inputs: [
      { id: 'up', kind: 'text', label: 'UP at each edge', def: '1111100000011', check: bitsCheck('UP', 14) },
      { id: 'ld', kind: 'text', label: 'LD at each edge', def: '1000000001000', check: bitsCheck('LD', 14) },
      { id: 'd', kind: 'number', label: 'D, the value to load', def: 13, min: 0, max: 15 },
    ],
    check: (inp) => (bitsOf(inp.up).length !== bitsOf(inp.ld).length ? 'UP and LD need one value per edge each' : null),
    presets: [
      { label: 'Load 13, up, down, reload', values: { up: '1111100000011', ld: '1000000001000', d: 13 } },
      { label: 'Down through zero', values: { up: '000000', ld: '100000', d: 2 } },
      { label: 'Up from 14: wraps to 0', values: { up: '11111', ld: '10000', d: 14 } },
    ],
    counters: [{ id: 'up', label: 'up' }, { id: 'down', label: 'down' }, { id: 'loads', label: 'loads' }],
    run(inp) {
      const uv = bitsOf(inp.up), lv = bitsOf(inp.ld), n = uv.length;
      const c = new N.Circuit('Up/down counter');
      const f = c.add('COUNTER', { w: 4, dir: 'pin', ld: true }, 'ctr');
      c.connect(c.input('LD').pin('y'), f.pin('ld')); c.connect(c.input('D', 4).pin('y'), f.pin('d')); c.connect(c.input('UP').pin('y'), f.pin('up'));
      c.connect(c.clock('CLK').pin('y'), f.pin('clk')); c.connect(f.pin('q'), c.output('Q', 4));
      const R = TM.clocked(c, { cycles: n, inputs: { UP: uv, LD: lv, D: uv.map(() => inp.d) }, powerUp: 0 });
      const end = n * R.period + 2, tcq = R.sim.timing('ctr').tpLH;
      const signals = TM.signals(R, ['CLK', 'LD', 'UP', 'Q']);
      const F = new S.Frames(['up', 'down', 'loads']);
      const scene = (t) => TM.frame({ R, t, textScale: NAMES, pinCap: NAMES, hot: ['ctr'], t1: end, signals, ticks: 8, side: (x, y) => ({ items: [TM.badge('b:d', x, y + 30, 'D', inp.d + ' = ' + bin(inp.d, 4)), TM.badge('b:q', x, y + 70, 'Q', R.at('Q', t) === 'x' ? '?' : R.at('Q', t) + ' = ' + bin(R.at('Q', t), 4), 'hot')], box: { x, y, w: 150, h: 100 } }) }).items;
      F.add({ items: scene(1), say: 'The counter powers up at 0 here. At each edge: if LD = 1 it loads D = ' + inp.d + '; otherwise it counts up when UP = 1 and down when UP = 0. From 15 up it wraps to 0; from 0 down to 15.' });
      for (let k = 0; k < n; k++) {
        const e = R.edgeAt(k), q0 = R.at('Q', e - 0.5), q1 = R.at('Q', e + tcq + 3);
        const what = lv[k] ? 'loads' : uv[k] ? 'up' : 'down';
        F.count(what);
        if (typeof q0 === 'number') TM.verify(R, e + tcq + 3, { Q: lv[k] ? inp.d : uv[k] ? (q0 + 1) % 16 : (q0 + 15) % 16 });
        F.add({ items: scene(e + tcq + 3), say: 'Edge ' + (k + 1) + ': LD = ' + lv[k] + ', UP = ' + uv[k] + ' → ' + (lv[k] ? 'load: Q = ' + q1 : (uv[k] ? 'count up: ' : 'count down: ') + q0 + ' → ' + q1 + ((uv[k] && q0 === 15) || (!uv[k] && q0 === 0) ? ' (wrapped)' : '')) + '.', meta: { q: String(q1) } });
      }
      F.add({ items: scene(end), mark: 'end', say: F.counts.up + ' counts up, ' + F.counts.down + ' down, ' + F.counts.loads + ' load' + (F.counts.loads === 1 ? '' : 's') + '. Inside, each bit\'s next value comes from a multiplexer choosing between D, Q + 1 and Q − 1, so everything still happens at one clock edge.' });
      return { frames: F.list, def: { sections: [{ id: 'd', kind: 'math', title: 'Priority', text: ['LD = 1:         Q ← D', 'LD = 0, UP = 1: Q ← Q + 1 (mod 16)', 'LD = 0, UP = 0: Q ← Q − 1 (mod 16)'].join('\n') }] } };
    },
    predict: [{ at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.q && i > 1, pick: 'option', options: (fr, i) => { const q = +fr[i + 1].meta.q; return [...new Set([q, (q + 1) % 16, (q + 15) % 16, (q + 2) % 16].map(String))].sort((a, b) => a - b); }, ask: 'Q after the next edge?', answer: (fr, i) => fr[i + 1].meta.q, explain: (fr, i) => fr[i + 1].say, once: true }],
    quiz: [
      { q: 'A 4-bit up/down counter at 0 counts down. Next it shows…', options: ['0', '1', '15', 'X'], answer: 2, why: 'It wraps: 0 − 1 = 15 (mod 16).' },
      { q: 'LD = 1 and UP = 1 at the same edge. The counter…', options: ['counts up', 'loads D', 'does both', 'holds'], answer: 1, why: 'Load has priority.' },
      { q: 'Why is a loadable counter useful?', options: ['To start a count from any value, e.g. to divide by a number other than a power of 2', 'To make it faster', 'To save flip-flops', 'It is not'], answer: 0, why: 'Reloading at the end of the count makes a programmable divider.' },
      { q: 'For a synchronous up/down counter, bit i toggles when counting down if…', options: ['all lower bits are 0', 'all lower bits are 1', 'bit i is 1', 'never'], answer: 0, why: 'Counting down borrows through bits that are 0.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Unused states and lock-out
  // ---------------------------------------------------------------------------------------------------
  /** three D flip-flops with next-state logic; INIT presets the state s (bit 2 is the left one) */
  /** the next state from the equations, worked out apart from the simulation (for the self-check) */
  const nextBits = (s, f) => { const d = f((s >> 2) & 1, (s >> 1) & 1, s & 1).map((b) => b & 1); return d[0] * 4 + d[1] * 2 + d[2]; };
  const designs = {
    mod6: { label: 'Mod-6 binary (000 to 101)', valid: [0, 1, 2, 3, 4, 5], next: (s) => nextBits(s, (q2, q1, q0) => [(q2 & ~q0) | (q1 & q0), (~q2 & ~q1 & q0) | (q1 & ~q0), ~q0]), eq: ['D2 = Q2Q0′ + Q1Q0', 'D1 = Q2′Q1′Q0 + Q1Q0′', 'D0 = Q0′'],
      logic(c, q, qn) { return [G(c, 'OR', [G(c, 'AND', [q[2], qn[0]]), G(c, 'AND', [q[1], q[0]])]), G(c, 'OR', [G(c, 'AND', [qn[2], qn[1], q[0]]), G(c, 'AND', [q[1], qn[0]])]), qn[0]]; } },
    jlock: { label: 'Johnson, 3 bits (locks out)', valid: [0, 1, 3, 7, 6, 4], next: (s) => nextBits(s, (q2, q1, q0) => [q1, q0, ~q2]), eq: ['D2 = Q1', 'D1 = Q0', 'D0 = Q2′'],
      logic(c, q, qn) { return [q[1], q[0], qn[2]]; } },
    jfix: { label: 'Johnson, 3 bits, self-correcting', valid: [0, 1, 3, 7, 6, 4], next: (s) => nextBits(s, (q2, q1, q0) => [q1, q0, ~q2 & (~q1 | q0)]), eq: ['D2 = Q1', 'D1 = Q0', 'D0 = Q2′(Q1′ + Q0)'],
      logic(c, q, qn) { return [q[1], q[0], G(c, 'AND', [G(c, 'OR', [q[0], qn[1]], { id: 'o1' }), qn[2]], { id: 'a1' })]; } },
  };
  function designCircuit(d) {
    const c = new N.Circuit(d.label);
    const clk = c.clock('CLK').pin('y');
    const fs = [0, 1, 2].map((i) => c.add('DFF', {}, 'q' + i));
    fs.forEach((f, i) => { c.connect(clk, f.pin('clk')); c.connect(f.pin('q'), c.output('Q' + i)); });
    const q = fs.map((f) => f.pin('q')), qn = fs.map((f) => f.pin('qn'));
    // the logic gives D2, D1, D0 in that order
    d.logic(c, q, qn).forEach((sig, i) => c.connect(sig, fs[2 - i].pin('d')));
    for (const f of fs) { if (!f.net.qn) c.leaveOpen(f.pin('qn')); }
    if (d === designs.mod6) return c;
    // the Johnson designs drawn as the shift register they are: Q0 → Q1 → Q2 in a row, the clock a rail below,
    // the feedback to D0 over the top (through the gates at the left, for the self-correcting one)
    const side = { sides: { clock: 'bottom', qn: 'top' } };
    const place = { clk_CLK: [-12, 8] };
    fs.forEach((f, i) => { place['q' + i] = [14 * i, 0, side]; place['out_Q' + i] = [14 * i + 7, 12, { orient: 'down' }]; });
    const fix = !!c.byId.get('a1');
    if (fix) { place.a1 = [-10, 1]; place.o1 = [-22, -4]; }
    return TM.manual(c, place, (sh, at, net) => {
      const ck = net('q0', 'clk');
      sh.line(ck, [[-5, 9], [31, 9]], true);
      for (let i = 0; i < 3; i++) sh.line(ck, [[14 * i + 3, 9], [14 * i + 3, 6]]);
      sh.line(net('q0', 'q'), [[6, 3], [14, 3]]); sh.line(net('q0', 'q'), [[9, 3], [9, 12]]);
      sh.line(net('q1', 'q'), [[20, 3], [28, 3]]); sh.line(net('q1', 'q'), [[23, 3], [23, 12]]);
      sh.line(net('q2', 'q'), [[34, 3], [37, 3], [37, 12]]);
      if (!fix) { sh.line(net('q2', 'qn'), [[31, 0], [31, -4], [-3, -4], [-3, 3], [0, 3]]); return; }
      // the rows nest: the leftmost source lowest, so no wire crosses another
      sh.line(net('q0', 'q'), [[8, 3], [8, -8], [-24, -8], [-24, -3], [-22, -3]]);
      sh.line(net('q1', 'qn'), [[17, 0], [17, -10], [-25, -10], [-25, -1], [-22, -1]]);
      sh.line(net('q2', 'qn'), [[31, 0], [31, -12], [-30, -12], [-30, 4], [-10, 4]]);
      const o = at('o1', 'y');
      sh.line(net('o1', 'y'), [[o.x, o.y], [-13, o.y], [-13, 2], [-10, 2]]);
    });
  }
  /** put the counter in state s before the first edge: its outputs are given the value (as a glitch or power-up
   *  might), after the flip-flops have first driven them */
  const startIn = (s) => { const o = {}; for (let i = 0; i < 3; i++) o['q' + i] = (s >> i) & 1; return o; };
  const runFrom = (c, s, until) => TM.run(c, { period: 100, phase: 50, powerUp: 0, depositAt: 16, states: startIn(s), until });
  /** the next state of every state, by simulating one edge from each */
  function nextOf(d, c) {
    const out = {};
    for (let s = 0; s < 8; s++) out[s] = TM.busAt(runFrom(c, s, 90), ['Q2', 'Q1', 'Q0'], 89);
    return out;
  }
  S.topic({
    id: 'counter-lockout', family: 'p7-counters', order: 50, title: 'Unused states and lock-out',
    blurb: 'Three flip-flops have eight states; a counter of six leaves two unused. If noise or power-up puts the counter in one of them, does it find its way back, or is it stuck circling outside its sequence?',
    inputs: [
      { id: 'design', kind: 'choice', label: 'Counter', def: 'jlock', options: Object.keys(designs).map((k) => ({ value: k, label: designs[k].label })) },
      { id: 'start', kind: 'number', label: 'Start in state (0 to 7)', def: 2, min: 0, max: 7 },
    ],
    presets: [
      { label: 'Johnson from 010: locked out', values: { design: 'jlock', start: 2 } },
      { label: 'Self-correcting Johnson from 010', values: { design: 'jfix', start: 2 } },
      { label: 'Self-correcting Johnson from 101', values: { design: 'jfix', start: 5 } },
      { label: 'Mod-6 from 111', values: { design: 'mod6', start: 7 } },
      { label: 'Mod-6 from 000: normal counting', values: { design: 'mod6', start: 0 } },
    ],
    counters: [{ id: 'edges', label: 'edges' }],
    run(inp) {
      const d = designs[inp.design], s0 = inp.start;
      const c = TM.memo('lockout:' + inp.design, () => designCircuit(d));
      const nx = nextOf(d, c);
      const cycles = 8, P = 100, end = cycles * P + 2;
      const R = runFrom(c, s0, end);
      const Q = ['Q2', 'Q1', 'Q0'];
      const valid = new Set(d.valid);
      const order = d.valid.concat([0, 1, 2, 3, 4, 5, 6, 7].filter((x) => !valid.has(x)));
      const lock = [0, 1, 2, 3, 4, 5, 6, 7].filter((s) => !valid.has(s) && (() => { let x = s; for (let i = 0; i < 8; i++) { x = nx[x]; if (valid.has(x)) return false; } return true; })());
      const states = order.map((s) => ({ id: String(s), label: bin(s, 3), cls: valid.has(s) ? '' : lock.includes(s) ? 'unused lock' : 'unused' }));
      const edges = order.map((s) => ({ from: String(s), to: String(nx[s]), cls: valid.has(s) ? '' : lock.includes(s) ? 'unused lock' : 'unused' }));
      const res = K.schem.layout(c);
      const sigs = [{ name: 'CLK', changes: R.changes('CLK') }].concat(['Q2', 'Q1', 'Q0'].map((q) => ({ name: q, changes: R.changes(q) })), [{ name: 'state', changes: TM.bus(R, Q), width: 3 }]);
      const stateAt = (t) => TM.busAt(R, Q, t);
      const dia = (x, y, t, hotEdge) => { const s = stateAt(t); return TM.diagram({ x, y, R: 120, r: 25, size: 13, states, edges, order: order.map(String), inner: order.filter((q) => !valid.has(q)).map(String), hot: s === null ? null : String(s), hotEdge }).items; };
      const eqs = (x, y) => d.eq.map((e, i) => ({ key: 'eq' + i, kind: 'text', x, y: y + i * 22, text: e, cls: 'mono', size: 14 }));
      // the first picture: the circuit beside its state diagram; then, edge by edge, the diagram (with the
      // equations) over the waveforms, large enough to read
      const first = (t) => TM.frame({ R, t, textScale: NAMES, pinCap: NAMES, t0: 20, t1: end, extra: dia(res.bounds.w + 190, 140, t).concat(eqs(res.bounds.w + 45, 140 + 120 + 25 + 40)) }).items;
      const scene = (t, hotEdge) => TM.frame({ R, t, noSchem: true, t0: 20, t1: end, signals: sigs, ticks: 8, extra: dia(150, 145, t, hotEdge).concat(eqs(330, 120)), waveGap: 145 + 120 + 25 + 36, waveW: 760 }).items;
      const F = new S.Frames(['edges']);
      F.add({ items: first(30), say: d.label + ': the six states of its sequence are solid; ' + [0, 1, 2, 3, 4, 5, 6, 7].filter((x) => !valid.has(x)).map((x) => bin(x, 3)).join(' and ') + ' are unused (dashed). The arrows out of the unused states come from the same equations, worked out for those states. Suppose power-up or a burst of noise has left the counter in ' + bin(s0, 3) + '.', meta: { ask: true, ok: !lock.includes(s0) } });
      for (let k = 0; k < cycles; k++) {
        const e = R.edgeAt(k), a = stateAt(e - 0.5), b = stateAt(e + 25);
        F.count('edges');
        claimNum(R, e + 25, Q, d.next(a));
        F.add({ items: scene(e + 25, a + '>' + b), say: 'Edge ' + (k + 1) + ': ' + bin(a, 3) + ' → ' + bin(b, 3) + (valid.has(b) ? (valid.has(a) ? '.' : ', back in the sequence.') : ', still outside the sequence.') });
      }
      F.add({ items: scene(end), mark: 'end', say: lock.includes(s0) ? 'Locked out: the counter circles ' + lock.map((x) => bin(x, 3)).join(' ↔ ') + ' for ever and never counts. The cure is to choose the don\'t-care entries of the unused states so they lead back into the sequence, as the self-correcting version does.' : valid.has(s0) ? 'The counter simply ran through its sequence.' : 'Self-correcting: from ' + bin(s0, 3) + ' it reached the sequence after ' + (() => { let x = s0, k = 0; while (!valid.has(x) && k < 8) { x = nx[x]; k++; } return k === 1 ? 'one edge' : k + ' edges'; })() + ' and then counted normally.' });
      return { frames: F.list, def: { sections: [{ id: 'd', kind: 'math', title: 'Next state', text: d.eq.concat(['', 'unused: ' + [0, 1, 2, 3, 4, 5, 6, 7].filter((x) => !valid.has(x)).map((x) => bin(x, 3) + ' → ' + bin(nx[x], 3)).join(', ')]).join('\n') }] } };
    },
    predict: [{ at: (f) => f.meta && f.meta.ask, pick: 'option', options: ['It returns to the sequence', 'It stays outside for ever'], ask: 'From this start, will the counter find its way back into its sequence?', answer: (fr, i) => (fr[i].meta.ok ? 'It returns to the sequence' : 'It stays outside for ever'), explain: (fr) => fr[fr.length - 1].say }],
    quiz: [
      { q: 'A counter with 3 flip-flops that counts through 6 states has how many unused states?', options: ['0', '2', '3', '6'], answer: 1, why: '2³ − 6 = 2.' },
      { q: 'Lock-out means…', options: ['the counter stops', 'from an unused state the counter cycles among unused states and never returns', 'the clock is disabled', 'the counter resets'], answer: 1, why: 'It runs, but outside its intended sequence.' },
      { q: 'How is a counter made self-correcting?', options: ['by choosing the unused states\' next states (the don\'t-cares) to lead into the sequence', 'by adding a flip-flop', 'by clocking it faster', 'by using T flip-flops'], answer: 0, why: 'The don\'t-cares are free; spend them on safety.' },
      { q: 'A 3-bit Johnson counter (D0 = Q2′, D1 = Q0, D2 = Q1) started in 010 goes to…', options: ['100', '101', '000', '011'], answer: 1, why: 'D2 = Q1 = 1, D1 = Q0 = 0, D0 = Q2′ = 1: 101, and from 101 back to 010.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Ring and Johnson counters
  // ---------------------------------------------------------------------------------------------------
  function shiftCounter(kind) {
    const johnson = kind === 'johnson';
    return function (inp) {
      const n = +inp.n, init = johnson ? 0 : inp.init === 'none' ? 0 : parseInt(inp.init, 2);
      const noInit = !johnson && inp.init === 'none';
      const c = TM.build.shiftRow(n, { feedback: johnson ? 'johnson' : 'ring', init: noInit ? undefined : (johnson ? 0 : init), title: johnson ? 'Johnson counter' : 'Ring counter' });
      const states = johnson ? 2 * n : n, cycles = states + 2, P = 100, end = cycles * P + 2;
      const R = TM.run(c, { period: P, phase: P / 2, powerUp: 0, stim: noInit ? [] : [[0, 'INIT', 1], [20, 'INIT', 0]], until: end });
      const Q = []; for (let i = 0; i < n; i++) Q.push('Q' + i);
      const word = (t) => Q.map((q) => R.at(q, t)).join('');
      // the decoding: ring, one flip-flop per state; Johnson, a 2-input AND per state
      const seq = [];
      { let w = johnson ? '0'.repeat(n) : init.toString(2).padStart(n, '0').split('').reverse().join(''); for (let k = 0; k < states; k++) { seq.push(w); w = (johnson ? (w[n - 1] === '1' ? '0' : '1') : w[n - 1]) + w.slice(0, n - 1); } }
      const decodeOf = (w) => {
        if (!johnson) return w.split('').map((b, i) => (b === '1' ? 'Q' + i : null)).filter(Boolean).join(' ') || '(none)';
        const ones = w.split('').filter((b) => b === '1').length;
        if (ones === 0) return "Q0′·Q" + (n - 1) + '′';
        if (ones === n) return 'Q0·Q' + (n - 1);
        if (w[0] === '1') return 'Q' + (ones - 1) + '·Q' + ones + '′';
        return 'Q' + (n - ones - 1) + '′·Q' + (n - ones);
      };
      const table = (x, y, hot) => { const t = K.table.draw({ x, y: y + 18, prefix: 'dec', colHead: ['state', 'Q0..Q' + (n - 1), 'decode'], rows: seq.map((w, i) => [String(i), w, decodeOf(w)]), size: 13, hot: hot >= 0 ? [0, 1, 2].map((cc) => [hot, cc]) : [], title: 'Decoding' }); return { items: t.items, box: t.box }; };
      const sigs = [{ name: 'CLK', changes: R.changes('CLK') }].concat(Q.map((q) => ({ name: q, changes: R.changes(q) })));
      const F = new S.Frames(['edges']);
      const scene = (t, hot) => { const w = word(t); return TM.frame({ R, t, textScale: NAMES, pinCap: NAMES, hot, t1: end, signals: sigs, ticks: 6, side: noInit ? null : table, sideBelow: false, extra: [] }).items.concat([]); };
      const sceneH = (t, hot) => { const w = word(t); const i = seq.indexOf(w); return TM.frame({ R, t, textScale: NAMES, pinCap: NAMES, hot, t1: end, signals: sigs, ticks: 6, side: noInit ? null : (x, y) => table(x, y, i) }).items; };
      F.add({ items: sceneH(30), say: (johnson ? 'A Johnson (twisted-ring) counter: a shift register whose last Q′ feeds the first D. From 0000…, ones fill in from the left and then zeros follow them: ' + 2 * n + ' states from ' + n + ' flip-flops.' : 'A ring counter: a shift register whose last Q feeds its first D, so the pattern goes round. ' + (noInit ? 'Nothing has loaded it: it powered up at all 0s.' : 'INIT loaded Q0..Q' + (n - 1) + ' = ' + word(30) + '.')) });
      for (let k = 0; k < cycles; k++) {
        const e = R.edgeAt(k), w0 = word(e - 0.5), w1 = word(e + 25), i = seq.indexOf(w1);
        F.count('edges');
        TM.verify(R, e + 25, Object.fromEntries(Q.map((q, j) => [q, +((johnson ? (w0[n - 1] === '1' ? '0' : '1') : w0[n - 1]) + w0.slice(0, n - 1))[j]])));
        F.add({ items: sceneH(e + 25, Q.map((q, j) => 'f' + j)), say: 'Edge ' + (k + 1) + ': Q0..Q' + (n - 1) + ' = ' + w0 + ' → ' + w1 + (i >= 0 && !noInit ? ', state ' + i + ', decoded by ' + decodeOf(w1) + '.' : '.'), meta: { w: w1, w0 } });
      }
      F.add({ items: sceneH(end), mark: 'end', say: noInit ? 'All 0s shifted round is still all 0s: a ring counter must be loaded (or made self-starting) before it can count.' : johnson ? 'A Johnson counter of ' + n + ' flip-flops has ' + 2 * n + ' states, and each is decoded by one 2-input AND gate; only one bit changes per edge, so the decoders never glitch.' : 'A ring counter of ' + n + ' flip-flops has ' + n + ' states; with a single 1 circulating, each state is decoded by one flip-flop\'s output with no gates at all.' });
      return { frames: F.list, def: { sections: [{ id: 'd', kind: 'math', title: johnson ? 'Johnson counter' : 'Ring counter', text: (johnson ? ['D0 = Q' + (n - 1) + '′', 'Di = Q(i−1)', 2 * n + ' states, 2-input decoding'] : ['D0 = Q' + (n - 1), 'Di = Q(i−1)', n + ' states, no decoding gates']).join('\n') }] } };
    };
  }
  const shiftPredict = [{ at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.w && fr[i + 1].meta.w !== fr[i + 1].meta.w0 && i > 1, pick: 'option', options: (fr, i) => { const w0 = fr[i + 1].meta.w0, w = fr[i + 1].meta.w; return [...new Set([w, w0, w0.slice(1) + w0[0], w.split('').reverse().join('')])].slice(0, 4).sort(); }, ask: 'Q0..Qn after the next edge?', answer: (fr, i) => fr[i + 1].meta.w, explain: (fr, i) => fr[i + 1].say, once: true }];
  S.topic({
    id: 'ring-counter', family: 'p7-counters', order: 60, title: 'The ring counter',
    blurb: 'A shift register closed into a loop with a single 1 in it: the 1 goes round, one place per clock. Each state is just one flip-flop being 1, so decoding needs no gates.',
    inputs: [
      { id: 'n', kind: 'choice', label: 'Flip-flops', def: '4', options: [{ value: '3', label: '3' }, { value: '4', label: '4' }, { value: '5', label: '5' }] },
      { id: 'init', kind: 'choice', label: 'Loaded with', def: '0001', options: [{ value: '0001', label: 'a single 1' }, { value: '0011', label: 'two 1s together' }, { value: '0101', label: 'two 1s apart' }, { value: 'none', label: 'nothing (all 0)' }] },
    ],
    check: (inp) => (inp.init !== 'none' && parseInt(inp.init, 2) >= 1 << +inp.n ? 'That pattern needs more flip-flops' : null),
    presets: [
      { label: '4 flip-flops, one 1', values: { n: '4', init: '0001' } },
      { label: 'Two 1s', values: { n: '4', init: '0011' } },
      { label: 'Never loaded', values: { n: '4', init: 'none' } },
      { label: '5 flip-flops', values: { n: '5', init: '0001' } },
    ],
    counters: [{ id: 'edges', label: 'edges' }],
    run: shiftCounter('ring'),
    predict: shiftPredict,
    quiz: [
      { q: 'A ring counter of 5 flip-flops has how many states?', options: ['5', '10', '25', '32'], answer: 0, why: 'The single 1 can be in 5 places.' },
      { q: 'Decoding a state of a ring counter needs…', options: ['no gates: each state is one Q', 'an AND per state', 'a full decoder', 'two flip-flops'], answer: 0, why: 'Exactly one flip-flop is 1 in each state.' },
      { q: 'A ring counter powered up at all 0s…', options: ['counts normally', 'stays at all 0s', 'goes to all 1s', 'oscillates'], answer: 1, why: 'Shifting zeros round gives zeros.' },
      { q: 'The cost of a ring counter compared with a binary counter of the same number of states is…', options: ['more flip-flops', 'more gates', 'a slower clock', 'none'], answer: 0, why: 'n states take n flip-flops instead of log2 n.' },
    ],
  });
  S.topic({
    id: 'johnson-counter', family: 'p7-counters', order: 70, title: 'The Johnson counter',
    blurb: 'Feed the last flip-flop\'s Q′ back to the first: ones fill the register, then zeros follow them out. Twice as many states as flip-flops, and each decoded by a single 2-input AND gate.',
    inputs: [{ id: 'n', kind: 'choice', label: 'Flip-flops', def: '4', options: [{ value: '3', label: '3 (6 states)' }, { value: '4', label: '4 (8 states)' }, { value: '5', label: '5 (10 states)' }] }],
    presets: [{ label: '4 flip-flops', values: { n: '4' } }, { label: '3 flip-flops', values: { n: '3' } }, { label: '5 flip-flops', values: { n: '5' } }],
    counters: [{ id: 'edges', label: 'edges' }],
    run: shiftCounter('johnson'),
    predict: shiftPredict,
    quiz: [
      { q: 'A Johnson counter of 4 flip-flops has how many states?', options: ['4', '8', '16', '15'], answer: 1, why: '2n states.' },
      { q: 'Each state of a Johnson counter is decoded by…', options: ['one flip-flop', 'a 2-input AND gate', 'an n-input AND gate', 'a multiplexer'], answer: 1, why: 'The boundary between the 1s and 0s identifies the state.' },
      { q: 'Why do Johnson counter decoders not glitch?', options: ['Only one bit changes at each edge', 'They use NAND gates', 'The clock is slow', 'They do glitch'], answer: 0, why: 'Like a Gray code, successive states differ in one bit.' },
      { q: 'A Johnson counter feeds back…', options: ['the last Q to the first D', 'the last Q′ to the first D', 'an XOR of two bits', 'nothing'], answer: 1, why: 'The twist (the complement) is what doubles the states.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Sequence generator (a linear-feedback shift register)
  // ---------------------------------------------------------------------------------------------------
  const TAPS = { '3a': { n: 3, taps: [1, 2], label: '3 bits, feedback Q1 ⊕ Q2' }, '3b': { n: 3, taps: [0, 2], label: '3 bits, feedback Q0 ⊕ Q2' }, '4a': { n: 4, taps: [2, 3], label: '4 bits, feedback Q2 ⊕ Q3' }, '4b': { n: 4, taps: [1, 3], label: '4 bits, feedback Q1 ⊕ Q3' } };
  S.topic({
    id: 'sequence-gen', family: 'p7-counters', order: 80, title: 'A sequence generator',
    blurb: 'A shift register whose input is an XOR of some of its own bits. With the right taps it steps through every state but all-zeros before repeating, and its last bit is a long, noise-like sequence.',
    inputs: [
      { id: 'taps', kind: 'choice', label: 'Register and feedback', def: '4a', options: Object.keys(TAPS).map((k) => ({ value: k, label: TAPS[k].label })) },
      { id: 'seed', kind: 'number', label: 'Starting state (not 0)', def: 1, min: 0, max: 15 },
    ],
    check: (inp) => (inp.seed >= 1 << TAPS[inp.taps].n ? 'Starting state: at most ' + ((1 << TAPS[inp.taps].n) - 1) : null),
    presets: [
      { label: '4 bits, maximal length', values: { taps: '4a', seed: 1 } },
      { label: '4 bits, poor taps: short cycles', values: { taps: '4b', seed: 1 } },
      { label: '3 bits, maximal', values: { taps: '3a', seed: 5 } },
      { label: 'Started at 0: stuck', values: { taps: '3a', seed: 0 } },
    ],
    counters: [{ id: 'edges', label: 'edges' }, { id: 'states', label: 'different states' }],
    run(inp) {
      const T = TAPS[inp.taps], n = T.n;
      const c = TM.memo('lfsr:' + inp.taps, () => TM.build.shiftRow(n, { feedback: 'lfsr', taps: T.taps, title: 'Sequence generator' }));
      // the cycle through the seed, worked out from the equations
      const step = (s) => { const fb = T.taps.reduce((a, k) => a ^ ((s >> k) & 1), 0); return ((s << 1) | fb) & ((1 << n) - 1); };
      const cyc = [inp.seed]; for (let x = step(inp.seed); x !== inp.seed && cyc.length < 20; x = step(x)) cyc.push(x);
      const cycles = Math.min(cyc.length + 2, 17), P = 100, end = cycles * P + 2;
      const dep = {}; for (let i = 0; i < n; i++) dep['f' + i] = (inp.seed >> i) & 1;
      const R = TM.run(c, { period: P, phase: P / 2, powerUp: 0, depositAt: 16, states: dep, until: end });
      const Q = names(n);
      const out = 'Q' + (n - 1);
      const res = K.schem.layout(c);
      const Rr = Math.max(80, cyc.length * 14);
      const dgX = res.bounds.w + Rr + 70, dgY = Math.max(Rr + 30, res.bounds.h / 2);
      const sigs = [{ name: 'CLK', changes: R.changes('CLK') }, { name: 'state', changes: TM.bus(R, Q), width: n }, { name: out, label: out + ' (output)', changes: R.changes(out), cls: 'hotwave' }];
      const stateAt = (t) => TM.busAt(R, Q, t);
      const seen = new Set();
      const scene = (t, hotEdge) => {
        const s = stateAt(t);
        const dia = TM.diagram({ x: dgX, y: dgY, R: Rr, r: 24, size: 13, states: cyc.map((x) => ({ id: String(x), label: bin(x, n) })), edges: cyc.map((x) => ({ from: String(x), to: String(step(x)) })), hot: s === null ? null : String(s), hotEdge });
        return TM.frame({ R, t, textScale: NAMES, pinCap: NAMES, t0: 20, t1: end, signals: sigs, ticks: 8, extra: dia.items, waveGap: Math.max(46, dgY + Rr + 40 - res.bounds.h), waveW: dgX + Rr - 100 }).items;
      };
      const F = new S.Frames(['edges', 'states']);
      F.add({ items: scene(30), say: 'A ' + n + '-bit shift register; its input is Q' + T.taps.join(' ⊕ Q') + '. It starts in ' + bin(inp.seed, n) + ' (Q' + (n - 1) + ' first; a real one would be loaded through a preset). The diagram is the cycle through that state: ' + cyc.length + ' state' + (cyc.length === 1 ? '' : 's') + ' long.', meta: { ask: true, len: cyc.length } });
      for (let k = 0; k < cycles; k++) {
        const e = R.edgeAt(k), a = stateAt(e - 0.5), b = stateAt(e + 25);
        F.count('edges');
        if (!seen.has(b)) { seen.add(b); F.count('states'); }
        claimNum(R, e + 25, Q, step(a));
        F.add({ items: scene(e + 25, a + '>' + b), say: 'Edge ' + (k + 1) + ': feedback = ' + T.taps.map((t) => (a >> t) & 1).join(' ⊕ ') + ' = ' + (b & 1) + ' enters Q0; ' + bin(a, n) + ' → ' + bin(b, n) + '. Output ' + out + ' = ' + ((b >> (n - 1)) & 1) + '.' });
      }
      const outSeq = cyc.map((x) => (x >> (n - 1)) & 1).join('');
      F.add({ items: scene(end), mark: 'end', say: inp.seed === 0 ? 'All zeros feed back a 0 for ever: the one state a sequence generator must never start in.' : 'The register repeats every ' + cyc.length + ' clocks' + (cyc.length === (1 << n) - 1 ? ', the most possible (2^' + n + ' − 1): every state except 0000… occurs once.' : ', short of the ' + ((1 << n) - 1) + ' possible: these taps split the states into separate cycles.') + ' The output repeats the pattern ' + outSeq + '.' });
      return { frames: F.list, def: { sections: [{ id: 'd', kind: 'math', title: 'Sequence generator', text: ['D0 = Q' + T.taps.join(' ⊕ Q'), 'Di = Q(i−1)', '', 'cycle length ' + cyc.length + ', output ' + outSeq].join('\n') }] } };
    },
    predict: [{ at: (f) => f.meta && f.meta.ask, pick: 'option', options: (fr, i) => [...new Set([fr[i].meta.len, 15, 7, 6, 1].map(String))].slice(0, 4).sort((a, b) => a - b), ask: 'How many clocks before the state repeats?', answer: (fr, i) => String(fr[i].meta.len), explain: (fr) => fr[fr.length - 1].say }],
    quiz: [
      { q: 'The longest sequence a 4-bit linear-feedback shift register can produce has length…', options: ['16', '15', '8', '4'], answer: 1, why: 'Every state except all zeros: 2⁴ − 1.' },
      { q: 'Why must such a register not start at all zeros?', options: ['The XOR of zeros is 0, so it stays there', 'It would count down', 'It would oscillate', 'It must; that is the start'], answer: 0, why: 'All-zeros is a cycle of length one.' },
      { q: 'The feedback in a sequence generator of this kind is…', options: ['an AND of bits', 'an XOR of chosen bits (the taps)', 'the last Q′', 'the clock'], answer: 1, why: 'XOR feedback makes the sequence linear over GF(2).' },
      { q: 'Choosing different taps can…', options: ['change the cycle length', 'change the clock rate', 'add flip-flops', 'do nothing'], answer: 0, why: 'Only some tap sets give the maximal length.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // A counter's state diagram lit in step with its waveform
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'counter-diagram', family: 'p7-counters', order: 90, title: 'A counter\'s state diagram, in step',
    blurb: 'A counter is a state machine with no inputs: each state has one way out. Watch the lit state move round the diagram as the waveform is drawn, edge by edge.',
    inputs: [
      { id: 'mod', kind: 'number', label: 'Count modulo', def: 6, min: 2, max: 8 },
      { id: 'dir', kind: 'choice', label: 'Direction', def: 'up', options: [{ value: 'up', label: 'up' }, { value: 'down', label: 'down' }] },
    ],
    presets: [
      { label: 'Mod 6, up', values: { mod: 6, dir: 'up' } },
      { label: 'Mod 8, up', values: { mod: 8, dir: 'up' } },
      { label: 'Mod 5, down', values: { mod: 5, dir: 'down' } },
    ],
    counters: [{ id: 'edges', label: 'edges' }, { id: 'laps', label: 'laps' }],
    run(inp) {
      const M = inp.mod, up = inp.dir === 'up';
      const c = new N.Circuit('Counter');
      const f = c.add('COUNTER', { w: 3, mod: M, dir: inp.dir, co: true }, 'ctr');
      c.connect(c.clock('CLK').pin('y'), f.pin('clk')); c.connect(f.pin('q'), c.output('Q', 3)); c.connect(f.pin('co'), c.output('TC'));
      const cycles = M + 3, P = 100, end = cycles * P + 2;
      const R = TM.run(c, { period: P, phase: P / 2, powerUp: 0, until: end });
      const tcq = R.sim.timing('ctr').tpLH;
      const res = K.schem.layout(c);
      const Rr = Math.max(80, M * 16);
      const dgX = res.bounds.w + Rr + 90, dgY = Rr + 30;
      const sts = []; for (let s = 0; s < M; s++) sts.push(s);
      const nxt = (s) => (up ? (s + 1) % M : (s + M - 1) % M);
      const signals = [{ name: 'CLK', changes: R.changes('CLK') }, { name: 'Q2', changes: R.changes('ctr.q').map(([t, v]) => [t, typeof v === 'number' ? (v >> 2) & 1 : 'x']) }, { name: 'Q1', changes: R.changes('ctr.q').map(([t, v]) => [t, typeof v === 'number' ? (v >> 1) & 1 : 'x']) }, { name: 'Q0', changes: R.changes('ctr.q').map(([t, v]) => [t, typeof v === 'number' ? v & 1 : 'x']) }, { name: 'Q', changes: R.changes('Q'), width: 3 }, { name: 'TC', changes: R.changes('TC') }];
      const scene = (t, hotEdge) => {
        const s = R.at('Q', t);
        const dia = TM.diagram({ x: dgX, y: dgY, R: Rr, r: 22, size: 13, states: sts.map((x) => ({ id: String(x), label: bin(x, 3) })), edges: sts.map((x) => ({ from: String(x), to: String(nxt(x)) })), hot: typeof s === 'number' ? String(s) : null, hotEdge });
        return TM.frame({ R, t, textScale: NAMES, pinCap: NAMES, t1: end, signals, ticks: 8, extra: dia.items, waveGap: Math.max(46, dgY + Rr + 40 - res.bounds.h), waveW: dgX + Rr - 60 }).items;
      };
      const F = new S.Frames(['edges', 'laps']);
      F.add({ items: scene(30), say: 'A 3-bit counter counting ' + inp.dir + ' modulo ' + M + ': ' + M + ' states, each with exactly one arrow out. TC (terminal count) is 1 in the last state, ' + bin(up ? M - 1 : 0, 3) + '.' });
      for (let k = 0; k < cycles; k++) {
        const e = R.edgeAt(k), a = R.at('Q', e - 0.5), b = R.at('Q', e + tcq + 2);
        F.count('edges');
        if ((up && b === 0) || (!up && b === M - 1)) F.count('laps');
        if (typeof a === 'number') TM.verify(R, e + tcq + 2, { Q: nxt(a) });
        F.add({ items: scene(e + tcq + 2, a + '>' + b), say: 'Edge ' + (k + 1) + ': ' + bin(a, 3) + ' → ' + bin(b, 3) + ((up && b === 0) || (!up && b === M - 1) ? ': round again.' : '.') + (R.at('TC', e + tcq + 3) === 1 ? ' TC = 1.' : ''), meta: { to: bin(b, 3), from: bin(a, 3) } });
      }
      F.add({ items: scene(end), mark: 'end', say: 'The lit state stepped round the diagram once per clock, and the waveform\'s bits are the same states written in time. TC pulsed once per lap: it is how counters are chained, or how a modulo-' + M + ' counter divides the clock frequency by ' + M + '.' });
      return { frames: F.list, def: { sections: [{ id: 'd', kind: 'math', title: 'Counting ' + inp.dir + ' mod ' + M, text: sts.map((s) => bin(s, 3) + ' → ' + bin(nxt(s), 3)).join('\n') }] } };
    },
    predict: [{ at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.to && i > 2, pick: 'option', options: (fr, i) => { const s = fr[i + 1].meta.to; return [...new Set([s, '000', '111', fr[i + 1].meta.from])].sort(); }, ask: 'Which state lights up after the next edge?', answer: (fr, i) => fr[i + 1].meta.to, explain: (fr, i) => fr[i + 1].say, once: true }],
    quiz: [
      { q: 'How many arrows leave each state of a counter with no inputs?', options: ['0', '1', '2', 'one per input'], answer: 1, why: 'With no inputs, each state has a single next state.' },
      { q: 'A mod-6 counter divides its clock frequency by…', options: ['2', '3', '6', '8'], answer: 2, why: 'Its terminal count pulses once every 6 clocks.' },
      { q: 'A mod-5 counter needs at least how many flip-flops?', options: ['2', '3', '5', '4'], answer: 1, why: '2³ = 8 ≥ 5 > 4 = 2².' },
      { q: 'Counting down mod 5 from 000, the next state is…', options: ['001', '100', '111', '101'], answer: 1, why: '0 − 1 wraps to 4 = 100.' },
    ],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
