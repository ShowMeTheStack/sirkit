// Part 9, worked designs run clock by clock on their ASM charts: a shift-and-add multiplier, a restoring divider,
// a GCD engine by repeated subtraction, a traffic-light controller with a timer register and a coin-counting
// vending controller. Every clock lights the present block and the path through it, and shows the registers
// after the edge.
(function (S) {
  'use strict';
  const P9 = S.P9;
  const A = () => S.Asm;

  S.family({ id: 'p9-designs', part: 'rtl', order: 30, title: 'Worked designs', blurb: 'Complete register-transfer designs run one clock at a time on their ASM charts: multiply, divide, find a GCD, run a crossing, sell a drink.' });

  const bin = (v, w) => v.toString(2).padStart(w, '0');
  const num = (id, label, def, min, max) => ({ id, kind: 'number', label, def, min, max });

  /** a topic that runs one example chart: cfg {id, order, title, blurb, chart, inputs, presets, inputsAt(inp) → fn, until, intro, say, ask, end, predict, quiz, def, counters, logCols, show} */
  function designTopic(cfg) {
    S.topic({
      id: cfg.id, family: 'p9-designs', order: cfg.order, title: cfg.title, blurb: cfg.blurb,
      inputs: cfg.inputs, presets: cfg.presets, check: cfg.check,
      counters: [{ id: 'clocks', label: 'clocks' }].concat(cfg.counters || []),
      run(inp) {
        const ch = P9.chart(cfg.chart);
        const r = A().run(ch, { inputs: cfg.inputsAt(inp), maxCycles: cfg.max || 60, until: cfg.until ? cfg.until(inp) : (() => { let left = false; return (st, regs, c) => { if (st !== ch.start) left = true; return left && st === ch.start && c > 0; }; })() });
        const Fr = new S.Frames(['clocks'].concat((cfg.counters || []).map((c) => c.id)));
        const regs0 = {}; for (const k of Object.keys(ch.registers)) regs0[k] = 0;
        const res = P9.clockFrames({
          ch, trace: r.trace, regs0, Frames: Fr, intro: cfg.intro(inp, ch), logCols: cfg.logCols, show: cfg.show,
          say: (step, k, before) => { Fr.count('clocks'); if (cfg.count) cfg.count(Fr, step, before); return cfg.say ? cfg.say(step, k, before, inp) : ''; },
          ask: cfg.ask ? (step, k, before) => cfg.ask(step, k, before, inp) : null,
        });
        const end = cfg.end(res.regs, inp, r);
        Fr.add({ items: Fr.last().items, narrowView: Fr.last().narrowView, say: end, mark: 'end' });
        return { frames: P9.views(Fr.list), def: cfg.def };
      },
      predict: cfg.predict, quiz: cfg.quiz,
    });
  }

  // ---------------------------------------------------------------------------------------------------
  // Shift-and-add multiplier
  // ---------------------------------------------------------------------------------------------------
  designTopic({
    id: 'asm-multiplier', order: 10, title: 'A shift-and-add multiplier', chart: 'multiplier',
    blurb: 'Multiply two 4-bit numbers the way long multiplication does: look at the multiplier\'s lowest bit, add the multiplicand to the high half if it is 1, shift everything right, four times. The product ends up in A and Q together.',
    inputs: [num('m', 'Multiplicand M', 13, 0, 15), num('q', 'Multiplier Q', 11, 0, 15)],
    presets: [
      { label: '13 × 11', values: { m: 13, q: 11 } },
      { label: '15 × 15: the largest', values: { m: 15, q: 15 } },
      { label: '6 × 5', values: { m: 6, q: 5 } },
      { label: '9 × 0', values: { m: 9, q: 0 } },
    ],
    counters: [{ id: 'adds', label: 'additions' }],
    inputsAt: (inp) => (k) => ({ START: k === 1 ? 1 : 0, MIN: inp.m, QIN: inp.q }),
    intro: (inp) => 'Registers: M holds the multiplicand, Q the multiplier, A the high half of the product with C its carry, P counts the 4 steps. In IDLE the chart waits with READY = 1 until START; START comes on clock 2 with M = ' + inp.m + ' (' + bin(inp.m, 4) + ') and Q = ' + inp.q + ' (' + bin(inp.q, 4) + ').',
    count: (Fr, step) => { if (step.state === 'ADD' && step.tests.some((t) => t.value === 1)) Fr.count('adds'); },
    say: (step) => (step.state === 'ADD' ? (step.tests[0].value ? 'Q0 = 1, so M is added into A (the carry goes to C).' : 'Q0 = 0, so nothing is added.') : step.state === 'SHIFT' ? 'C, A and Q shift right as one: A Q = ' + bin(step.regs.A, 4) + ' ' + bin(step.regs.Q, 4) + '.' : ''),
    ask: (step, k, before) => (step.state === 'ADD' ? { ask: 'add', ans: before.Q & 1 ? 'Yes: Q0 = 1' : 'No: Q0 = 0' } : null),
    end: (regs, inp) => 'Back in IDLE. The product is A Q = ' + bin(regs.A, 4) + ' ' + bin(regs.Q, 4) + ' = ' + (regs.A * 16 + regs.Q) + ', and ' + inp.m + ' × ' + inp.q + ' = ' + inp.m * inp.q + '. Four add-and-shift rounds, two clocks each.',
    predict: [{ at: (f) => f.meta && f.meta.ask === 'add', pick: 'option', options: ['Yes: Q0 = 1', 'No: Q0 = 0'], ask: 'Next clock is in ADD. Will M be added into A?', answer: (fr, i) => fr[i].meta.ans, explain: (fr, i) => fr[i + 1].say }],
    def: { sections: [{ id: 'd', kind: 'math', title: 'Shift and add', text: ['IDLE:  READY; on START load M, Q,', '       A ← 0, C ← 0, P ← 4', 'ADD:   P ← P − 1;', '       if Q0: {C, A} ← A + M', 'SHIFT: {C, A, Q} ← {C, A, Q} >> 1', '       if P = 0 go to IDLE', 'product in {A, Q}'].join('\n') }] },
    quiz: [
      { q: 'Why is the multiplier register Q shifted right each round?', options: ['To bring the next multiplier bit into Q0', 'To divide the product by 2', 'To clear it', 'To store the carry'], answer: 0, why: 'The decision looks at Q0 every round; shifting brings the next bit there, and the product\'s low bits fill Q from the left.' },
      { q: 'For 4-bit operands the product needs how many bits?', options: ['4', '5', '8', '16'], answer: 2, why: '15 × 15 = 225 needs 8 bits: A and Q together.' },
      { q: 'Why is C (the carry of A + M) shifted in too?', options: ['It is not', 'So the carry of the addition is not lost: it becomes the top bit of A', 'To count the rounds', 'To start the machine'], answer: 1, why: 'A + M can overflow 4 bits; the shift moves that carry into A\'s top bit.' },
      { q: 'How many clocks does one multiplication take here after START?', options: ['4', '8', '9', '16'], answer: 1, why: 'Four rounds of ADD and SHIFT, one clock each: 8 clocks.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Restoring divider
  // ---------------------------------------------------------------------------------------------------
  designTopic({
    id: 'asm-divider', order: 20, title: 'A restoring divider', chart: 'divider',
    blurb: 'Divide by trial subtraction: shift the next dividend bit into A, subtract the divisor, and if the result went negative add it back (restore) and write a 0 in the quotient, else write a 1. Four rounds give a 4-bit quotient and the remainder.',
    inputs: [num('d', 'Dividend', 13, 0, 15), num('v', 'Divisor', 3, 0, 15)],
    presets: [
      { label: '13 ÷ 3', values: { d: 13, v: 3 } },
      { label: '15 ÷ 4', values: { d: 15, v: 4 } },
      { label: '7 ÷ 9: quotient 0', values: { d: 7, v: 9 } },
      { label: '12 ÷ 0: error', values: { d: 12, v: 0 } },
    ],
    counters: [{ id: 'restores', label: 'restores' }],
    inputsAt: (inp) => (k) => ({ START: k === 1 ? 1 : 0, DIN: inp.d, VIN: inp.v }),
    until: () => { let left = false, n = 0; return (st, regs, c) => { n = c; if (st !== 'IDLE') left = true; return (left && st === 'IDLE') || (c > 2 && regs.E === 1) || n > 40; }; },
    intro: (inp) => 'A (5 bits, the top bit its sign) collects the partial remainder, Q starts as the dividend ' + inp.d + ' (' + bin(inp.d, 4) + ') and ends as the quotient, M holds the divisor ' + inp.v + ', P counts the rounds, E flags a division by zero.',
    count: (Fr, step) => { if (step.state === 'TEST' && step.tests.some((t) => t.cond === 'NEG' && t.value === 1)) Fr.count('restores'); },
    say: (step) => (step.state === 'SHIFT' ? 'A Q shifted left: the next dividend bit enters A.' : step.state === 'SUB' ? 'Trial subtraction: A = ' + bin(step.regs.A, 5) + (step.regs.A & 16 ? ' (negative).' : ' (not negative).') : step.state === 'TEST' ? (step.tests.some((t) => t.cond === 'NEG' && t.value === 1) ? 'Negative: add M back (restore); the quotient bit stays 0.' : 'Not negative: keep it, and the quotient bit Q0 becomes 1.') : step.state === 'IDLE' && step.regs.E ? 'The divisor is 0: E is set and nothing else happens.' : ''),
    ask: (step, k, before) => (step.state === 'TEST' ? { ask: 'neg', ans: before.A & 16 ? 'Restore: A went negative' : 'Keep: quotient bit 1' } : null),
    end: (regs, inp) => (regs.E ? 'Division by zero: E = 1, and the chart is back in IDLE.' : 'Done: quotient Q = ' + regs.Q + ', remainder A = ' + regs.A + '. Check: ' + inp.d + ' = ' + inp.v + ' × ' + regs.Q + ' + ' + regs.A + (inp.v * regs.Q + regs.A === inp.d ? '.' : ' (it does not hold!)')),
    predict: [{ at: (f) => f.meta && f.meta.ask === 'neg', pick: 'option', options: ['Restore: A went negative', 'Keep: quotient bit 1'], ask: 'The subtraction is done. Restore, or keep?', answer: (fr, i) => fr[i].meta.ans, explain: (fr, i) => fr[i + 1].say }],
    def: { sections: [{ id: 'd', kind: 'math', title: 'Restoring division', text: ['repeat 4 times:', '  {A, Q} ← {A, Q} << 1', '  A ← A − M', '  if A < 0: A ← A + M  (restore)', '  else:     Q0 ← 1', 'quotient in Q, remainder in A'].join('\n') }] },
    quiz: [
      { q: 'What does "restoring" mean in a restoring divider?', options: ['Resetting the registers', 'Adding the divisor back after a subtraction that went negative', 'Restoring the clock', 'Shifting right'], answer: 1, why: 'The trial subtraction was too much, so it is undone.' },
      { q: 'Why does A need one bit more than the operands?', options: ['For the carry of the shift', 'To hold the sign of the trial subtraction', 'For the quotient', 'It does not'], answer: 1, why: 'The top bit says whether A − M went negative.' },
      { q: 'A quotient bit is 1 when…', options: ['the trial subtraction did not go negative', 'it went negative', 'the divisor is odd', 'P = 0'], answer: 0, why: 'The divisor fitted into the partial remainder.' },
      { q: 'Dividing by zero here…', options: ['loops forever', 'sets E and stays in IDLE', 'gives quotient 15', 'gives remainder 0'], answer: 1, why: 'The chart tests DZ before starting.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // GCD
  // ---------------------------------------------------------------------------------------------------
  designTopic({
    id: 'asm-gcd', order: 30, title: 'A GCD engine', chart: 'gcd', max: 120,
    blurb: 'The greatest common divisor by repeated subtraction: while X and Y differ, take the smaller from the larger. One clock per subtraction; when they are equal, that value is the GCD.',
    inputs: [num('x', 'X', 42, 1, 99), num('y', 'Y', 30, 1, 99)],
    presets: [
      { label: '42 and 30', values: { x: 42, y: 30 } },
      { label: '35 and 14', values: { x: 35, y: 14 } },
      { label: '17 and 5: coprime', values: { x: 17, y: 5 } },
      { label: '24 and 24', values: { x: 24, y: 24 } },
    ],
    counters: [{ id: 'subs', label: 'subtractions' }],
    inputsAt: (inp) => (k) => ({ START: k === 1 ? 1 : 0, XIN: inp.x, YIN: inp.y }),
    intro: (inp) => 'Two 8-bit registers X and Y. The datapath compares them (EQ: X = Y, LT: X < Y) and subtracts. START loads X = ' + inp.x + ' and Y = ' + inp.y + '.',
    count: (Fr, step) => { if (step.state === 'CMP' && step.transfers.length) Fr.count('subs'); },
    say: (step) => (step.state === 'CMP' ? (step.tests[0].value ? 'X = Y: finished.' : step.tests[1] && step.tests[1].value ? 'X < Y, so Y ← Y − X.' : 'X > Y, so X ← X − Y.') : ''),
    ask: (step, k, before) => (step.state === 'CMP' ? { ask: 'which', ans: before.X === before.Y ? 'Stop: X = Y' : before.X < before.Y ? 'Y ← Y − X' : 'X ← X − Y' } : null),
    end: (regs, inp) => 'X = Y = ' + regs.X + ': the GCD of ' + inp.x + ' and ' + inp.y + ' is ' + regs.X + '. Each clock one subtraction; a design that needs fewer clocks would subtract several times at once (or divide).',
    predict: [{ at: (f) => f.meta && f.meta.ask === 'which', pick: 'option', options: ['X ← X − Y', 'Y ← Y − X', 'Stop: X = Y'], ask: 'What happens on the next clock?', answer: (fr, i) => fr[i].meta.ans, explain: (fr, i) => fr[i + 1].say }],
    def: { sections: [{ id: 'd', kind: 'math', title: 'GCD by subtraction', text: ['while X ≠ Y:', '  if X < Y: Y ← Y − X', '  else:     X ← X − Y', 'GCD = X', '', 'one ASM block (CMP) per step'].join('\n') }] },
    quiz: [
      { q: 'Why does the GCD stay the same when the smaller number is subtracted from the larger?', options: ['Any common divisor of X and Y also divides X − Y', 'Because subtraction is exact', 'It does not', 'Because X < Y'], answer: 0, why: 'And the other way round, so the set of common divisors is unchanged.' },
      { q: 'In the CMP block, how many register transfers happen in one clock?', options: ['none or one', 'two', 'three', 'always two'], answer: 0, why: 'One of X ← X − Y or Y ← Y − X, or none when they are equal.' },
      { q: 'Which status signals does the datapath give the controller?', options: ['EQ and LT', 'X and Y', 'START', 'READY'], answer: 0, why: 'The decisions test X = Y and X < Y.' },
      { q: 'GCD of 17 and 5 by this engine ends with…', options: ['X = Y = 5', 'X = Y = 1', 'X = 17', 'X = 0'], answer: 1, why: 'They are coprime.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Traffic lights
  // ---------------------------------------------------------------------------------------------------
  const bitsCheck = (label) => (v) => (/^[01]{1,30}$/.test(String(v).replace(/\s+/g, '')) ? null : label + ': up to 30 bits of 0s and 1s, one per clock');
  const bitsOf = (t) => String(t).replace(/\s+/g, '').split('').map(Number);
  designTopic({
    id: 'asm-traffic', order: 40, title: 'A traffic-light controller', chart: 'traffic',
    blurb: 'A main road and a side road. Green stays on the main road for at least six clocks and moves to the side road only when a side-road car (SC) or a pedestrian (PB) is waiting. A timer register T counts the clocks in each phase.',
    inputs: [{ id: 'sc', kind: 'text', label: 'Side car SC, one bit per clock', def: '000000001111100000000000', check: bitsCheck('SC') }, { id: 'pb', kind: 'text', label: 'Pedestrian PB, one bit per clock', def: '000000000000000000000000', check: bitsCheck('PB') }, num('n', 'Clocks to run', 22, 8, 30)],
    presets: [
      { label: 'A car on the side road', values: { sc: '000000001111100000000000', pb: '000000000000000000000000', n: 22 } },
      { label: 'A car arrives early: waits for the minimum', values: { sc: '011111111110000000000000', pb: '000000000000000000000000', n: 22 } },
      { label: 'A pedestrian presses the button', values: { sc: '000000000000000000000000', pb: '000000011000000000000000', n: 20 } },
      { label: 'Nobody waiting: main road stays green', values: { sc: '0', pb: '0', n: 12 } },
    ],
    counters: [{ id: 'changes', label: 'light changes' }],
    max: 30,
    inputsAt: (inp) => { const sc = bitsOf(inp.sc), pb = bitsOf(inp.pb); return (k) => ({ SC: sc[k] || 0, PB: pb[k] || 0 }); },
    until: (inp) => (st, regs, c) => c >= inp.n,
    intro: () => 'MG: main road green. MY: main yellow. SG: side road green. SY: side yellow. The timer T counts clocks in a phase; LONG (T = 5), SHORT (T = 1) and DONE (T = 3) come from the datapath. The outputs light the lamps.',
    count: (Fr, step) => { if (step.next !== step.state) Fr.count('changes'); },
    say: (step) => (step.next !== step.state ? 'The lights change: ' + step.state + ' → ' + step.next + '.' : ''),
    ask: (step, k, before) => (step.state === 'MG' && before.T === 5 ? { ask: 'mg', ans: step.next === 'MY' ? 'Yes: change to yellow' : 'No: stay green' } : null),
    end: (regs, inp, r) => 'After ' + r.cycles + ' clocks the controller is in ' + r.state + '. The side road got green only when asked, and never before the main road had had its six clocks.',
    predict: [{ at: (f) => f.meta && f.meta.ask === 'mg', pick: 'option', options: ['Yes: change to yellow', 'No: stay green'], ask: 'The main road has had its minimum green (T = 5). Does it change on this clock?', answer: (fr, i) => fr[i].meta.ans, explain: (fr, i) => fr[i + 1].say }],
    def: { sections: [{ id: 'd', kind: 'math', title: 'Phases', text: ['MG: ≥ 6 clocks, then on SC or PB', 'MY: 2 clocks', 'SG: 4 clocks', 'SY: 2 clocks', 'T counts within a phase,', 'cleared on every change'].join('\n') }] },
    quiz: [
      { q: 'Why does the controller need the register T?', options: ['To count clocks within a phase', 'To store the colour', 'To remember the cars', 'It does not'], answer: 0, why: 'Phases last a set number of clocks; T counts them, and the decisions test it.' },
      { q: 'A car waits on the side road while T = 2 in MG. What happens?', options: ['Yellow at once', 'The main road stays green until T = 5, then changes', 'Nothing ever', 'Side road green at once'], answer: 1, why: 'LONG must be true first: the main road\'s minimum green.' },
      { q: 'In the MG block, T ← T + 1 and T ← 0 are on different paths. In one clock…', options: ['both happen', 'exactly one happens', 'neither', 'it depends on the clock'], answer: 1, why: 'Each path of a block is taken alone; the decisions choose one.' },
      { q: 'The lamp outputs (MAIN_G and so on) are written in the state boxes, so they are…', options: ['Mealy outputs', 'Moore outputs: on for the whole time in the state', 'register transfers', 'conditions'], answer: 1, why: 'Outputs in a state box depend only on the state.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Vending with a sum register
  // ---------------------------------------------------------------------------------------------------
  const coinsCheck = (v) => { const t = String(v).trim().split(/[\s,]+/).filter(Boolean); if (!t.length) return 'Coins: give at least one'; if (t.length > 8) return 'Coins: at most 8'; const bad = t.find((c) => !/^(5|10)$/.test(c)); return bad ? 'Coins: "' + bad + '" is not 5 or 10' : null; };
  designTopic({
    id: 'asm-vending', order: 50, title: 'A vending controller with a register', chart: 'vending', max: 40,
    blurb: 'The same job as the state-machine vending controller, but price 20 and a SUM register instead of a state per amount: the controller adds each coin into SUM, compares SUM with the price, vends, and pays change 5 at a time.',
    inputs: [{ id: 'coins', kind: 'text', label: 'Coins (5 or 10), in order', def: '10 5 10', check: coinsCheck }],
    presets: [
      { label: '10, 5, 10: change 5', values: { coins: '10 5 10' } },
      { label: 'Exactly 20', values: { coins: '10 10' } },
      { label: 'Four fives', values: { coins: '5 5 5 5' } },
      { label: '5 then 10 10: change 5', values: { coins: '5 10 10' } },
    ],
    counters: [{ id: 'vends', label: 'vended' }],
    inputsAt: (inp) => { const q = String(inp.coins).trim().split(/[\s,]+/).filter(Boolean).map(Number); let i = 0; return (k, regs, st) => { if (st !== 'WAIT' || i >= q.length) return {}; const c = q[i++]; return { C5: c === 5 ? 1 : 0, C10: c === 10 ? 1 : 0 }; }; },
    until: (inp) => { const n = String(inp.coins).trim().split(/[\s,]+/).filter(Boolean).length; let seen = 0; return (st, regs, c) => { if (st === 'WAIT' && c > 0) seen++; return st === 'WAIT' && seen > n + 1; }; },
    intro: (inp) => 'SUM (5 bits) holds the money. WAIT adds a coin (C5 or C10 for one clock), CHECK compares SUM with 20 (ENOUGH), VEND pulses VEND and takes 20 off, CHANGE pays 5 at a time while SUM is not zero. Coins: ' + String(inp.coins).trim() + '.',
    count: (Fr, step) => { if (step.state === 'VEND') Fr.count('vends'); },
    say: (step) => (step.state === 'CHECK' ? (step.tests[0].value ? 'SUM ≥ 20: vend.' : 'Not enough yet: wait for another coin.') : step.state === 'CHANGE' && step.outputs.includes('CHG') ? 'CHG: 5 paid back.' : ''),
    ask: (step, k, before) => (step.state === 'CHECK' ? { ask: 'enough', ans: before.SUM >= 20 ? 'Vend' : 'Wait for more' } : null),
    end: (regs) => 'All coins used; SUM = ' + regs.SUM + '. One SUM register replaces a state for every amount: with a higher price only its width changes, not the chart.',
    predict: [{ at: (f) => f.meta && f.meta.ask === 'enough', pick: 'option', options: ['Vend', 'Wait for more'], ask: 'CHECK is next. Vend, or wait?', answer: (fr, i) => fr[i].meta.ans, explain: (fr, i) => fr[i + 1].say }],
    def: { sections: [{ id: 'd', kind: 'math', title: 'Vending with SUM', text: ['WAIT:   on a coin SUM ← SUM + coin', 'CHECK:  SUM ≥ 20 ? VEND : WAIT', 'VEND:   VEND, SUM ← SUM − 20', 'CHANGE: while SUM ≠ 0:', '        CHG, SUM ← SUM − 5'].join('\n') }] },
    quiz: [
      { q: 'Compared with a state per amount, the SUM register…', options: ['needs more states as the price grows', 'keeps the chart the same size whatever the price', 'cannot give change', 'needs no clock'], answer: 1, why: 'The amount lives in the datapath, not in the controller\'s states.' },
      { q: 'Which signals does the datapath send to the controller here?', options: ['ENOUGH and ZERO', 'VEND and CHG', 'SUM', 'C5 and C10'], answer: 0, why: 'Status signals computed from SUM: SUM ≥ 20 and SUM = 0.' },
      { q: 'VEND appears in a state box, CHG in a conditional box. So…', options: ['both are Moore outputs', 'VEND depends on the state only; CHG also on the condition ZERO = 0', 'both depend on inputs', 'neither is an output'], answer: 1, why: 'A conditional box\'s outputs happen only on its path.' },
      { q: 'Paying 10 cents of change takes…', options: ['one clock', 'two clocks in CHANGE, 5 cents each', 'no time', 'three coins'], answer: 1, why: 'CHANGE pays 5 per clock until SUM = 0.' },
    ],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
