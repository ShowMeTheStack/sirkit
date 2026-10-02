// Part 6, clocked sequential design and state machines: the exercises. The lessons, the tour and the course are in
// 60-fsm.js. Every machine and circuit here is our own. Answers that come from a run (a state after some inputs, an
// output sequence, a count) are worked out by the engines when this file loads, so the text and the check agree.
(function (S) {
  'use strict';
  const C = S.Content;
  if (!C || C.exercises.has('fsm-ex-run-state')) return;
  const F = S.Fsm;

  // the chapters (60-fsm.js registers them too; whichever file loads first makes them)
  C.chapter({ id: 'fsm-basics', part: 'machines', n: 1, title: 'Machines that remember', blurb: 'What a state is, how a clocked circuit is read back into a state table, and when the output of a Mealy or a Moore machine moves.' });
  C.chapter({ id: 'fsm-reduce', part: 'machines', n: 2, title: 'Fewer states', blurb: 'States that no input can tell apart are one state: the implication table, partition refinement, and machines compared.' });
  C.chapter({ id: 'fsm-design', part: 'machines', n: 3, title: 'From table to circuit', blurb: 'Codes for the states, excitation tables for D, JK and T flip-flops, the equations, the circuit, and what the unused codes do.' });
  C.chapter({ id: 'fsm-uses', part: 'machines', n: 4, title: 'Machines at work', blurb: 'Sequence detectors, a serial adder and a coin controller, built as circuits and written in Verilog.' });

  const ex = (o) => C.exercise(o);
  const sp = (a) => a.join(' ');

  // ---- the machines (all our own) ------------------------------------------------------------------------------
  // a lock that opens after two 1s in a row and closes on any 0 (Moore)
  const LOCK = 'moore\ninputs X\noutputs Z\nstart L\nL/0: 0 -> L, 1 -> H\nO/1: 0 -> L, 1 -> O\nH/0: 0 -> L, 1 -> O';
  const LOCK_CODES = { L: '00', H: '01', O: '10' };
  // Z = 1 on the 0 that completes 100 (Mealy, overlapping)
  const DET100 = 'mealy\ninputs X\noutputs Z\nstart S0\nS0: 0 -> S0/0, 1 -> S1/0\nS1: 0 -> S2/0, 1 -> S1/0\nS2: 0 -> S0/1, 1 -> S1/0';
  // Z = 1 on the 1 that completes 011 (Mealy, overlapping)
  const DET011 = 'mealy\ninputs X\noutputs Z\nstart S0\nS0: 0 -> S1/0, 1 -> S0/0\nS1: 0 -> S1/0, 1 -> S2/0\nS2: 0 -> S1/0, 1 -> S0/1';
  // a 2-bit up/down counter: X = 1 counts up, X = 0 down; Z = 1 at count 3 (Moore)
  const UPDN = 'moore\ninputs X\noutputs Z\nstart C0\nC0/0: 0 -> C3, 1 -> C1\nC1/0: 0 -> C0, 1 -> C2\nC2/0: 0 -> C1, 1 -> C3\nC3/1: 0 -> C2, 1 -> C0';
  // a saturating 2-bit counter that guesses the next bit: up on 1, down on 0, stuck at the ends; Z = guess (Moore)
  const SAT = 'moore\ninputs X\noutputs Z\nstart SN\nSN/0: 0 -> SN, 1 -> WN\nWN/0: 0 -> SN, 1 -> WT\nWT/1: 0 -> WN, 1 -> ST\nST/1: 0 -> WT, 1 -> ST';
  // six states, four of them needed (Mealy)
  const R6 = 'mealy\ninputs X\noutputs Z\nstart A\nA: 0 -> F/0, 1 -> F/0\nB: 0 -> B/0, 1 -> C/0\nC: 0 -> E/1, 1 -> D/0\nD: 0 -> E/0, 1 -> E/0\nE: 0 -> E/0, 1 -> B/0\nF: 0 -> F/0, 1 -> B/0';
  // five states, three of them needed (Moore)
  const RM = 'moore\ninputs X\noutputs Z\nstart P\nP/0: 0 -> P, 1 -> T\nQ/0: 0 -> T, 1 -> R\nR/0: 0 -> S, 1 -> R\nS/1: 0 -> S, 1 -> Q\nT/1: 0 -> T, 1 -> Q';
  const RM_RED = 'moore\ninputs X\noutputs Z\nstart P\nP/0: 0 -> P, 1 -> S\nQ/0: 0 -> S, 1 -> Q\nS/1: 0 -> S, 1 -> Q';
  // a coin controller, price 15: N is 5 cents, D is 10 cents, V vends, C gives 5 back (Mealy)
  const VEND = 'mealy\ninputs N D\noutputs V C\nstart S0\nS0: 00 -> S0/00, 10 -> S5/00, 01 -> S10/00, 11 -> -/--\nS5: 00 -> S5/00, 10 -> S10/00, 01 -> S0/10, 11 -> -/--\nS10: 00 -> S10/00, 10 -> S0/10, 01 -> S0/11, 11 -> -/--';
  const M = (t) => F.parse(t);
  /** a machine's state table as a table block (for machines whose diagram would be cluttered) */
  const tableOf = (t, caption) => { const m = M(t), syms = F.symbols(m), mealy = m.type === 'mealy', col = (x) => (m.inputs.length === 1 ? m.inputs[0] : m.inputs.join('')) + ' = ' + x; return { table: [['state'].concat(syms.map(col), mealy ? [] : [m.outputs.join('')])].concat(m.states.map((st) => [st].concat(syms.map((x) => (m.next[st][x] == null ? '–' : m.next[st][x] + (mealy ? ' / ' + m.out[st][x] : ''))), mealy ? [] : [m.out[st]]))), caption: caption || (mealy ? 'Each entry: next state / output.' : 'Next state for each input, and the output of each state.') }; };

  // circuits (text netlists; flip-flops are clocked by CLK and start at 0)
  const LOCK_D = 'o1 = OR(q1, q0)\nd1 = AND(o1, X)\nnq1 = NOT(q1)\nnq0 = NOT(q0)\nd0 = AND(nq1, nq0, X)\nq1 = DFF(d1)\nq0 = DFF(d0)\nZ = q1';
  const AN_D = 'nx = NOT(X)\nn1 = AND(q0, X)\nn2 = AND(q1, nx)\nd1 = OR(n1, n2)\nq1 = DFF(d1)\nnq1 = NOT(q1)\nd0 = AND(nq1, nx)\nq0 = DFF(d0)\nZ = AND(q1, q0)';
  const AN_JK = 'nx = NOT(X)\nja = AND(b, X)\na = JKFF(ja, nx)\nb = JKFF(X, a)\nnb = NOT(b)\nY = AND(a, nb)';
  const AN_T = 'na = NOT(a)\ntb = OR(X, na)\na = TFF(b)\nb = TFF(tb)\nY = AND(a, b)';
  const SERIAL = 'p = XOR(A, B)\nS = XOR(p, c)\ng = AND(A, B)\nt = AND(p, c)\ncn = OR(g, t)\nc = DFF(cn)';

  // ===========================================================================================================
  // Chapter 1: machines that remember
  // ===========================================================================================================
  {
    const xs = '1101101', r = F.run(M(LOCK), xs), end = r.states[r.states.length - 1];
    const opts = ['L', 'H', 'O'];
    ex({
      id: 'fsm-ex-run-state', chapter: 'fsm-basics', title: 'Where does the lock end up?', level: 1, kind: 'choice',
      text: ['A lock reads one bit X per clock. It opens (Z = 1) once it has seen two 1s in a row, and any 0 locks it again. Its states: L (locked, no 1 waiting), H (locked, one 1 seen), O (open).', { fsm: LOCK, caption: 'The lock as a Moore machine: the output is written in each state.' }, 'It starts in L and reads X = ' + sp(xs.split('')) + '. Which state is it in after the last clock?'],
      options: opts, answer: opts.indexOf(end),
      whyNot: Object.fromEntries(opts.map((o, i) => [i, o === 'L' ? 'L follows a 0; the last bit read is a 1.' : o === 'H' ? 'H means exactly one 1 since the last 0. Count the 1s at the end of the input.' : 'O needs at least two 1s since the last 0.'])),
      hints: ['Only the end of the input matters here: a 0 sends the lock to L whatever came before.', 'Find the last 0, then count the 1s after it.', 'The states clock by clock: ' + r.states.join(' → ') + '. It ends in ' + end + '.'],
      solution: opts.indexOf(end), wrong: [0, 1, 2].filter((i) => i !== opts.indexOf(end)),
      why: 'The run: ' + r.states.join(' → ') + '.',
    });
  }
  {
    const xs = '1001001000', r = F.run(M(DET100), xs), want = r.outputs.join('');
    const bad1 = want.replace(/1/g, '0').split(''); bad1[want.indexOf('1') + 1] = '1';
    ex({
      id: 'fsm-ex-run-output', chapter: 'fsm-basics', title: 'The outputs of a detector', level: 1, kind: 'string',
      text: ['This Mealy machine sets Z = 1 on the 0 that completes the pattern 100. Matches may overlap.', { fsm: DET100 }, 'It starts in S0 and reads X = ' + sp(xs.split('')) + ', one bit per clock. Write Z for each clock, as ' + xs.length + ' bits with no spaces.'],
      accept: (t) => {
        const g = String(t).replace(/\s+/g, '');
        if (!/^[01]+$/.test(g)) return 'Write only 0s and 1s, one per clock.';
        if (g.length !== want.length) return 'There are ' + want.length + ' clocks, so ' + want.length + ' output bits; you wrote ' + g.length + '.';
        const k = [...g].findIndex((c, i) => c !== want[i]);
        return k < 0 ? true : 'Clock ' + (k + 1) + ' is not right: the machine is in ' + r.states[k] + ' and reads X = ' + xs[k] + ', so Z = ' + want[k] + '.';
      },
      hints: ['A Mealy output belongs to the arrow taken: read it off the arrow for the present state and the bit.', 'Z = 1 only on a 0 read in S2 (after 1 then 0).', 'The states are ' + r.states.join(' ') + ' and Z = ' + want + '.'],
      solution: want, wrong: [bad1.join(''), want.slice(1) + '0', want.slice(0, 8)],
    });
  }
  ex({
    id: 'fsm-ex-table-lock', chapter: 'fsm-basics', title: 'The lock as a table', level: 1, kind: 'fsm', machine: LOCK, stage: 'table',
    text: ['A lock reads one bit X per clock. It opens (Z = 1) after two 1s in a row and stays open while 1s keep coming; any 0 locks it. Use three states: L (locked, the last bit was 0, or nothing yet), O (open) and H (locked, one 1 seen). Z belongs to the state: it is a Moore machine.', 'Write its state table: for each state, its output and the next state for X = 0 and X = 1.'],
    hints: ['A 0 always leads to L, from every state.', 'A 1 moves L to H and H to O; from O another 1 keeps it open.', 'L/0: 0 → L, 1 → H; O/1: 0 → L, 1 → O; H/0: 0 → L, 1 → O.'],
    solution: LOCK,
    wrong: [LOCK.replace('O/1: 0 -> L, 1 -> O', 'O/1: 0 -> L, 1 -> H'), LOCK.replace('H/0: 0 -> L', 'H/0: 0 -> H'), LOCK.replace('H/0', 'H/1')],
  });
  ex({
    id: 'fsm-ex-table-100', chapter: 'fsm-basics', title: 'A detector for 100', level: 2, kind: 'fsm', machine: DET100, stage: 'table',
    text: ['A Mealy machine reads X one bit per clock and sets Z = 1 on the 0 that completes the pattern 1, 0, 0. Matches may overlap (here no match can share bits with the next one, but a 1 can always start a new attempt).', 'Use S0 (no useful bits), S1 (the last bit was 1), S2 (the last two bits were 10). Write the state table: next state and Z for each state and input.'],
    hints: ['From any state a 1 is the start of a new attempt, so X = 1 always leads to S1.', 'From S2 a 0 completes 100: Z = 1, and the bits 00 start nothing, so go to S0.', 'S0: 0 → S0/0, 1 → S1/0; S1: 0 → S2/0, 1 → S1/0; S2: 0 → S0/1, 1 → S1/0.'],
    solution: DET100,
    wrong: [DET100.replace('S2: 0 -> S0/1', 'S2: 0 -> S0/0'), DET100.replace('S1: 0 -> S2/0, 1 -> S1/0', 'S1: 0 -> S2/0, 1 -> S0/0'), DET100.replace('S2: 0 -> S0/1, 1 -> S1/0', 'S2: 0 -> S0/1, 1 -> S0/0')],
  });
  {
    const a = F.analyse(S.Check.circuitOf(AN_D, { outputs: ['Z'] })).machine, txt = F.format(a);
    ex({
      id: 'fsm-ex-analyse-d', chapter: 'fsm-basics', title: 'Read a D flip-flop circuit', level: 2, kind: 'fsm', machine: txt, stage: 'table',
      text: ['Analyse this circuit. Write the input equations D1 and D0, then the state table with the states named by their codes Q1Q0 (00, 01, 10, 11). Z depends on the flip-flops only, so the circuit is a Moore machine.', { circuit: AN_D, outputs: ['Z'], caption: 'Two D flip-flops, q1 and q0, clocked together.' }],
      hints: ['D1 = Q0X + Q1X′ and D0 = Q1′X′; a D flip-flop takes D at the edge, so these are the next values.', 'Row 01 with X = 1: D1 = 1·1 + 0 = 1 and D0 = 0, so the next state is 10. Z = Q1Q0 is 1 only in 11.', txt.split('\n').slice(4).map((l) => l.replace(/->/g, '→')).join('; ') + '.'],
      solution: txt,
      wrong: [txt.replace('01/0: 0 -> 01, 1 -> 10', '01/0: 0 -> 01, 1 -> 11'), txt.replace('11/1', '11/0'), txt.replace('00/0: 0 -> 01, 1 -> 00', '00/0: 0 -> 00, 1 -> 01')],
    });
  }
  {
    const a = F.analyse(S.Check.circuitOf(AN_JK, { outputs: ['Y'] })), txt = F.format(a.machine);
    ex({
      id: 'fsm-ex-analyse-jk', chapter: 'fsm-basics', title: 'Read a JK flip-flop circuit', level: 2, kind: 'fsm', machine: txt, stage: 'table',
      text: ['Analyse this circuit with two JK flip-flops, a and b: JA = BX, KA = X′, JB = X, KB = A, and Y = AB′. Name the states by their codes AB (00, 01, 10, 11) and write the state table.', { circuit: AN_JK, outputs: ['Y'] }],
      hints: ['A JK flip-flop gives Q(t+1) = JQ′ + K′Q. Put each J and K in.', 'A(t+1) = BXA′ + XA = AX + BX; B(t+1) = XB′ + A′B.', txt.split('\n').slice(4).map((l) => l.replace(/->/g, '→')).join('; ') + '.'],
      solution: txt,
      wrong: [txt.replace('10/1: 0 -> 00, 1 -> 11', '10/1: 0 -> 10, 1 -> 11'), txt.replace('10/1', '10/0'), txt.replace('01/0: 0 -> 01, 1 -> 11', '01/0: 0 -> 00, 1 -> 11')],
    });
  }
  {
    const m = F.analyse(S.Check.circuitOf(AN_T, { outputs: ['Y'] })).machine;
    const r = F.run(m, '11111111'), back = r.states.indexOf('00', 1);
    ex({
      id: 'fsm-ex-analyse-t', chapter: 'fsm-basics', title: 'Round and round with T flip-flops', level: 2, kind: 'number',
      text: ['Two T flip-flops a and b: TA = B, TB = X + A′, and Y = AB.', { circuit: AN_T, outputs: ['Y'] }, 'The circuit starts at AB = 00 and X is held at 1. After how many clocks is it back at 00 for the first time?'],
      answer: back, higherLower: true,
      hints: ['A T flip-flop toggles when T = 1: Q(t+1) = T ⊕ Q.', 'With X = 1, TB = 1 always, so B toggles every clock; A toggles when B = 1.', 'The codes go ' + r.states.slice(0, back + 1).join(' → ') + ': ' + back + ' clocks.'],
      solution: back, wrong: [back - 1, back * 2], why: 'With X = 1 the circuit counts ' + r.states.slice(0, back + 1).join(', ') + '.',
    });
  }
  {
    const X = '011011101', want = S.Check.waveExpected({ circuit: LOCK_D, inputs: { X }, clocked: true, outputs: ['Z'] }).Z;
    ex({
      id: 'fsm-ex-moore-wave', chapter: 'fsm-basics', title: 'When does the lock open?', level: 2, kind: 'waveform', circuit: LOCK_D, inputs: { X }, clocked: true, outputs: ['Z'], given: { Z: '0????????' },
      text: ['This is the lock (L = 00, H = 01, O = 10) built with D flip-flops. Z is the output of flip-flop q1, so it changes only at a clock edge.', { circuit: LOCK_D, outputs: ['Z'] }, 'Draw Z for the nine clock cycles. Each slot is the value just before that cycle\'s rising edge.'],
      hints: ['Z belongs to the state, and the state during a cycle was decided by the bits of the cycles before it.', 'The lock is open in a cycle when the two cycles before it both had X = 1.', 'Z = ' + sp(want.split('')) + '.'],
      solution: { Z: want }, wrong: [{ Z: '001001100' }, { Z: '000100100' }],
    });
  }
  ex({
    id: 'fsm-ex-mealy-when', chapter: 'fsm-basics', title: 'Which output moves between edges?', level: 1, kind: 'choice',
    text: ['A Mealy and a Moore detector watch the same input X, which changes a little after each rising clock edge. Which statement is true?'],
    options: ['The Moore output can change only just after a clock edge; the Mealy output can also change when X changes.', 'Both outputs change only at clock edges.', 'The Mealy output changes only at clock edges; the Moore output follows X at once.', 'Neither depends on the state.'],
    answer: 0,
    whyNot: { 1: 'A Mealy output is a function of the state and the input, so it moves when the input moves.', 2: 'That is the wrong way round: Moore outputs depend on the state only.', 3: 'Both depend on the state; the Mealy one on the input as well.' },
    hints: ['Ask what each output is a function of.', 'Moore: Z = λ(state). Mealy: Z = λ(state, X).', 'The state changes only at edges, so a Moore output does too; a Mealy output also follows X between edges.'],
    solution: 0, wrong: [1, 2],
  });
  {
    const moore = 'moore\ninputs X\noutputs Z\nstart S0_0\nS0_0/0: 0 -> S1, 1 -> S0_0\nS0_1/1: 0 -> S1, 1 -> S0_0\nS1/0: 0 -> S1, 1 -> S0_1';
    ex({
      id: 'fsm-ex-to-moore', chapter: 'fsm-basics', title: 'From Mealy to Moore', level: 3, kind: 'fsm', machine: moore, stage: 'table',
      text: ['This Mealy machine sets Z = 1 on a 1 that follows a 0 (the pattern 01).', tableOf('mealy\ninputs X\noutputs Z\nstart S0\nS0: 0 -> S1/0, 1 -> S0/0\nS1: 0 -> S1/0, 1 -> S0/1'), 'Turn it into a Moore machine. A state entered with two different outputs splits in two: call the copies S0_0 (entered with Z = 0, the start) and S0_1 (entered with Z = 1). Keep S1 as it is. Write the Moore state table.'],
      hints: ['S0 is entered on 1 from S0 (Z = 0) and on 1 from S1 (Z = 1): it splits. S1 is entered only with Z = 0.', 'Both copies of S0 have the arrows S0 had: 0 → S1, 1 → the copy of S0 with the output of that arrow.', 'S0_0/0: 0 → S1, 1 → S0_0; S0_1/1: 0 → S1, 1 → S0_0; S1/0: 0 → S1, 1 → S0_1.'],
      solution: moore,
      wrong: [moore.replace('S1/0: 0 -> S1, 1 -> S0_1', 'S1/0: 0 -> S1, 1 -> S0_0'), moore.replace('S0_1/1: 0 -> S1, 1 -> S0_0', 'S0_1/1: 0 -> S1, 1 -> S0_1'), moore.replace('S0_1/1', 'S0_1/0')],
    });
  }
  {
    const n = F.toMoore(M(DET100)).machine.states.length;
    ex({
      id: 'fsm-ex-moore-count', chapter: 'fsm-basics', title: 'How many Moore states?', level: 2, kind: 'number',
      text: ['The 100 detector has three Mealy states: S0, S1 and S2, with Z = 1 only on the arrow from S2 on X = 0.', { fsm: DET100 }, 'How many states does the equivalent Moore machine need?'],
      answer: n, higherLower: true,
      hints: ['A Mealy state splits once for each different output on the arrows into it.', 'Only S0 is entered with both Z = 0 (from S0 on 0) and Z = 1 (from S2 on 0).', 'S0 splits in two, S1 and S2 stay: ' + n + ' states.'],
      solution: n, wrong: [3, 6], why: 'One extra state, "just saw 100", outputs the 1.',
    });
  }

  // ===========================================================================================================
  // Chapter 2: fewer states
  // ===========================================================================================================
  const pairList = (cs) => cs.map((c) => '(' + c.a + ', ' + c.b + ')').join(', ');
  {
    const t = F.implication(M(R6)), cells = [...t.pairs.values()];
    const crossed = cells.filter((c) => c.crossed != null), left = cells.filter((c) => c.crossed == null);
    const round = (k) => cells.filter((c) => c.crossed === k);
    ex({
      id: 'fsm-ex-implication', chapter: 'fsm-reduce', title: 'Fill in an implication table', level: 2, kind: 'fsm', machine: R6, stage: 'implication',
      text: ['Six states, a Mealy machine (its diagram is above). List every pair of states that the implication table crosses out, in any order: first the pairs whose outputs differ, then, round after round, the pairs that imply a crossed pair.'],
      hints: ['Round 0: only C outputs 1 (on X = 0), so C differs from every other state: ' + pairList(round(0)) + '.', 'Round 1 crosses the pairs that lead to a crossed pair: ' + pairList(round(1)) + '. Then round 2: ' + pairList(round(2)) + '.', 'Crossed out: ' + pairList(crossed) + '. Left open: ' + pairList(left) + '.'],
      solution: pairList(crossed),
      wrong: [pairList(round(0)), pairList(crossed.concat(left.slice(0, 1))), pairList(round(0).concat(round(1)))],
    });
  }
  {
    const red = F.reduce(M(R6)), cls = F.showClasses(red.classes);
    ex({
      id: 'fsm-ex-reduce', chapter: 'fsm-reduce', title: 'The classes of equivalent states', level: 2, kind: 'fsm', machine: R6, stage: 'reduce',
      text: ['The same six-state machine. Group its states into classes of equivalent states (every state in exactly one class), like {A, B}, {C}, ….'],
      hints: ['Start from the implication table: a pair left open at the end is a pair of equivalent states.', 'E and F each loop to themselves on 0 and go to B on 1, with output 0 always. A and D go, on every input, to E or F, with output 0.', 'The classes: ' + cls + '.'],
      solution: cls,
      wrong: ['{A, D, E, F}, {B}, {C}', '{A, D}, {B}, {C}, {E}, {F}', '{A, B}, {C}, {D}, {E, F}'],
    });
  }
  {
    const red = F.reduce(M(RM)), cls = F.showClasses(red.classes);
    ex({
      id: 'fsm-ex-reduce-moore', chapter: 'fsm-reduce', title: 'Reduce a Moore machine', level: 2, kind: 'fsm', machine: RM, stage: 'reduce',
      text: ['A Moore machine with five states (its diagram is above). Find its classes of equivalent states. In a Moore machine the first split is by the output of each state.'],
      hints: ['Partition by output: {P, Q, R} with Z = 0 and {S, T} with Z = 1.', 'On X = 1, P goes to T (in the Z = 1 block) but Q and R go to R (in the Z = 0 block): P splits off. Check again until nothing splits.', 'The classes: ' + cls + '.'],
      solution: cls,
      wrong: ['{P, Q, R}, {S, T}', '{P}, {Q, R}, {S}, {T}', '{P, Q}, {R}, {S, T}'],
    });
  }
  ex({
    id: 'fsm-ex-reduced-table', chapter: 'fsm-reduce', title: 'Write the reduced table', level: 2, kind: 'fsm', machine: RM_RED, stage: 'table',
    text: ['The five-state Moore machine below reduces to the classes {P}, {Q, R}, {S, T}.', { fsm: RM }, 'Write the reduced state table. Keep the first state of each class as its name (P, Q for {Q, R}, S for {S, T}), and send every arrow into a merged state to the state kept.'],
    hints: ['Wherever R appears it becomes Q, and wherever T appears it becomes S.', 'P: 0 → P, 1 → T becomes 1 → S. Q: 0 → T, 1 → R becomes 0 → S, 1 → Q.', 'P/0: 0 → P, 1 → S; Q/0: 0 → S, 1 → Q; S/1: 0 → S, 1 → Q.'],
    solution: RM_RED,
    wrong: [RM_RED.replace('P/0: 0 -> P, 1 -> S', 'P/0: 0 -> P, 1 -> T'), RM_RED.replace('Q/0: 0 -> S, 1 -> Q', 'Q/0: 0 -> S, 1 -> P'), RM],
  });
  {
    const A = M(DET100), B = M(DET100.replace('S2: 0 -> S0/1, 1 -> S1/0', 'S2: 0 -> S0/1, 1 -> S0/0'));
    const eq = F.equivalent(A, B), n = eq.sequence.length, best = eq.sequence.join('');
    const outs = (m, w) => F.run(m, w).outputs.join('');
    ex({
      id: 'fsm-ex-distinguish', chapter: 'fsm-reduce', title: 'Tell two machines apart', level: 3, kind: 'string',
      text: ['Machine A is the 100 detector. Machine B is a copy with one arrow changed: from S2 on X = 1 it goes to S0 instead of S1.', { fsm: DET100, caption: 'Machine A. In B the arrow S2 → S1 on 1 goes to S0 instead.' }, 'Both start in S0. Give a shortest input sequence after which their outputs differ (as bits with no spaces).'],
      accept: (t) => {
        const w = String(t).replace(/\s+/g, '');
        if (!/^[01]+$/.test(w)) return 'Write a sequence of 0s and 1s.';
        const a = outs(A, w), b = outs(B, w), k = [...a].findIndex((c, i) => c !== b[i]);
        if (k < 0) return 'On ' + w + ' both machines give ' + a + ': this sequence does not tell them apart.';
        if (k + 1 > n) return 'That works (the outputs differ at clock ' + (k + 1) + '), but ' + n + ' bits are enough.';
        if (w.length > n) return 'The outputs differ at clock ' + (k + 1) + ' already; drop the bits after it.';
        return { ok: true, why: 'A gives ' + a + ', B gives ' + b + '.' };
      },
      hints: ['To see a difference, B must take the changed arrow (be in S2 and read a 1), and then an output must differ.', 'After the changed arrow A is in S1 and B in S0. Which input makes S1 and S0 output differently soon? S1 needs 00 to reach the 1.', 'For example ' + best + ': A gives ' + outs(A, best) + ' and B gives ' + outs(B, best) + '.'],
      solution: best, wrong: ['101', best + '0', '1010'],
    });
  }
  {
    const t = F.implication(M(R6)), cells = [...t.pairs.values()], open = cells.filter((c) => c.crossed == null), left = open.length;
    const r0 = cells.filter((c) => c.crossed === 0).length;
    ex({
      id: 'fsm-ex-pairs-left', chapter: 'fsm-reduce', title: 'How many cells stay open?', level: 2, kind: 'number',
      text: ['The implication table of the six-state machine below has 15 cells, one per pair of states. When the table is finished, how many cells are still open (not crossed out)?', { fsm: R6 }],
      answer: left, higherLower: true,
      hints: ['Round 0 crosses ' + r0 + ' cells: C against each of the other five states.', 'The later rounds cross every open pair that implies a crossed pair. Keep going until a round crosses nothing.', 'Only ' + pairList(open) + ' survive: ' + left + ' cells.'],
      solution: left, wrong: [15 - r0, 0], why: 'Each open cell is a pair of equivalent states: ' + pairList(open) + '.',
    });
  }

  // ===========================================================================================================
  // Chapter 3: from table to circuit
  // ===========================================================================================================
  ex({
    id: 'fsm-ex-excite-rows', chapter: 'fsm-design', title: 'Excitation tables from memory', level: 1, kind: 'table', table: 'custom',
    rows: ['0 → 0', '0 → 1', '1 → 0', '1 → 1'], cols: ['J', 'K', 'T', 'D'], corner: 'Q → Q(t+1)',
    cells: { '0 → 0|J': '0', '0 → 0|K': 'X', '0 → 0|T': '0', '0 → 0|D': '0', '0 → 1|J': '1', '0 → 1|K': 'X', '0 → 1|T': '1', '0 → 1|D': '1', '1 → 0|J': 'X', '1 → 0|K': '1', '1 → 0|T': '1', '1 → 0|D': '0', '1 → 1|J': 'X', '1 → 1|K': '0', '1 → 1|T': '0', '1 → 1|D': '1' },
    text: ['For each change of a flip-flop\'s output, Q now → Q after the edge, write the inputs that cause it: J and K of a JK flip-flop, T of a T flip-flop, D of a D flip-flop. Write X where either value works.'],
    hints: ['D is just the value wanted next. T is 1 exactly when Q must change.', 'For JK: to go 0 → 1, J must be 1, and K does not matter (J = K = 1 toggles, which also gives 1).', 'J K: 0X, 1X, X1, X0. T: 0, 1, 1, 0. D: 0, 1, 0, 1.'],
    solution: { '0 → 0|J': '0', '0 → 0|K': 'X', '0 → 0|T': '0', '0 → 0|D': '0', '0 → 1|J': '1', '0 → 1|K': 'X', '0 → 1|T': '1', '0 → 1|D': '1', '1 → 0|J': 'X', '1 → 0|K': '1', '1 → 0|T': '1', '1 → 0|D': '0', '1 → 1|J': 'X', '1 → 1|K': '0', '1 → 1|T': '0', '1 → 1|D': '1' },
    wrong: [{ '0 → 0|J': '0', '0 → 0|K': '0', '0 → 0|T': '0', '0 → 0|D': '0', '0 → 1|J': '1', '0 → 1|K': '0', '0 → 1|T': '1', '0 → 1|D': '1', '1 → 0|J': '0', '1 → 0|K': '1', '1 → 0|T': '1', '1 → 0|D': '0', '1 → 1|J': '0', '1 → 1|K': '0', '1 → 1|T': '0', '1 → 1|D': '1' }],
  });
  {
    const codes = F.assign(M(UPDN), 'gray').codes, txt = Object.entries(codes).map(([s, c]) => s + ' = ' + c).join(', ');
    ex({
      id: 'fsm-ex-assign-gray', chapter: 'fsm-design', title: 'A Gray assignment', level: 1, kind: 'fsm', machine: UPDN, stage: 'assign', design: { ff: 'D', assign: 'gray' },
      text: ['A 2-bit up/down counter: X = 1 counts up, X = 0 counts down, round in a ring C0, C1, C2, C3; Z = 1 at C3.', 'Give the states Gray codes in the order C0, C1, C2, C3, so that neighbours on the ring differ in one bit.'],
      hints: ['The 2-bit Gray sequence is 00, 01, 11, 10.', 'C0 takes 00 so that cleared flip-flops are the start state.', txt + '.'],
      solution: txt,
      wrong: ['C0 = 00, C1 = 01, C2 = 10, C3 = 11', 'C0 = 00, C1 = 01, C2 = 11, C3 = 11'],
      why: 'Every arrow of the ring now changes exactly one flip-flop.',
    });
  }
  ex({
    id: 'fsm-ex-assign-onehot', chapter: 'fsm-design', title: 'One flip-flop per state', level: 1, kind: 'fsm', machine: DET100, stage: 'assign', design: { ff: 'D', assign: 'onehot' },
    text: ['Give the 100 detector\'s three states S0, S1, S2 one-hot codes, in that order: the first flip-flop is 1 in S0 only, the second in S1 only, the third in S2 only.'],
    hints: ['One-hot: as many flip-flops as states, exactly one of them 1.', 'S0 is the first state, so its code has the 1 on the left.', 'S0 = 100, S1 = 010, S2 = 001.'],
    solution: 'S0 = 100, S1 = 010, S2 = 001',
    wrong: ['S0 = 00, S1 = 01, S2 = 10', 'S0 = 100, S1 = 010, S2 = 010', 'S0 = 001, S1 = 010, S2 = 100'],
    why: 'Three flip-flops instead of two, but each next-state equation can be read straight off the diagram.',
  });
  ex({
    id: 'fsm-ex-transition', chapter: 'fsm-design', title: 'The transition table of the lock', level: 2, kind: 'fsm', machine: LOCK, stage: 'transition', design: { ff: 'D', assign: LOCK_CODES },
    text: ['The lock with the codes L = 00, H = 01, O = 10. For each state and input write the next state as its code, and the output Z (a Moore output: the present state\'s).'],
    hints: ['Replace every state name in the state table by its code.', 'From H (01) on X = 1 the lock opens: next 10. Every X = 0 leads to 00.', 'L: 00/0, 01/0; H: 00/0, 10/0; O: 00/1, 10/1 (next for X = 0, X = 1, with Z).'],
    solution: { 'L|0|next': '00', 'L|0|out': '0', 'L|1|next': '01', 'L|1|out': '0', 'H|0|next': '00', 'H|0|out': '0', 'H|1|next': '10', 'H|1|out': '0', 'O|0|next': '00', 'O|0|out': '1', 'O|1|next': '10', 'O|1|out': '1' },
    wrong: [{ 'L|0|next': '00', 'L|0|out': '0', 'L|1|next': '01', 'L|1|out': '0', 'H|0|next': '00', 'H|0|out': '0', 'H|1|next': '11', 'H|1|out': '0', 'O|0|next': '00', 'O|0|out': '1', 'O|1|next': '10', 'O|1|out': '1' }, { 'L|0|next': '00', 'L|0|out': '0', 'L|1|next': '01', 'L|1|out': '0', 'H|0|next': '00', 'H|0|out': '0', 'H|1|next': '10', 'H|1|out': '1', 'O|0|next': '00', 'O|0|out': '1', 'O|1|next': '10', 'O|1|out': '1' }],
  });
  // excitation answers are built from the engine's own rows
  const excAnswer = (text, o, tweak) => { const d = F.design(M(text), o), a = {}; for (const r of d.rows) for (const n of d.stages.excitation.inputs) a[r.state + '|' + r.input + '|' + n] = r.exc[n]; if (tweak) tweak(a); return a; };
  {
    const sol = excAnswer(SAT, { ff: 'JK', assign: 'binary' });
    ex({
      id: 'fsm-ex-excitation-jk', chapter: 'fsm-design', title: 'JK inputs for a saturating counter', level: 2, kind: 'fsm', machine: SAT, stage: 'excitation', design: { ff: 'JK', assign: 'binary' },
      text: ['A saturating 2-bit counter guesses the next bit: SN (strongly 0), WN (weakly 0), WT (weakly 1), ST (strongly 1). A 1 moves it one step towards ST, a 0 one step towards SN, and it stays put at the ends. Z = 1 in WT and ST.', 'With binary codes SN = 00, WN = 01, WT = 10, ST = 11 and JK flip-flops Q1, Q0, fill in J1, K1, J0, K0 for every state and input. Write X for a don\'t-care.'],
      hints: ['Work bit by bit: compare each present bit with the next one and look up the JK excitation table (0→0: 0X, 0→1: 1X, 1→0: X1, 1→1: X0).', 'WN (01) on X = 1 goes to WT (10): Q1 0→1 gives J1 = 1, K1 = X; Q0 1→0 gives J0 = X, K0 = 1.', 'Row by row (J1 K1 J0 K0), X = 0 then X = 1: SN: 0X0X, 0X1X; WN: 0XX1, 1XX1; WT: X01X, X01X; ST: X0X1, X0X0.'],
      solution: sol,
      wrong: [Object.assign({}, sol, { 'WN|1|K0': '0' }), Object.assign({}, sol, { 'SN|1|J0': '0' })],
    });
  }
  {
    const sol = excAnswer(UPDN, { ff: 'T', assign: 'binary' });
    ex({
      id: 'fsm-ex-excitation-t', chapter: 'fsm-design', title: 'T inputs for an up/down counter', level: 2, kind: 'fsm', machine: UPDN, stage: 'excitation', design: { ff: 'T', assign: 'binary' },
      text: ['The up/down counter with binary codes C0 = 00, C1 = 01, C2 = 10, C3 = 11 and T flip-flops Q1, Q0. Fill in T1 and T0 for every state and input.'],
      hints: ['T = 1 exactly when that bit must change.', 'Counting either way, the low bit always changes: T0 = 1 in every row.', 'T1 = 1 where Q1 flips: up from 01 and 11, down from 00 and 10. Every T0 is 1.'],
      solution: sol,
      wrong: [Object.assign({}, sol, { 'C1|1|T1': '0' }), Object.assign({}, sol, { 'C0|0|T0': '0' })],
    });
  }
  ex({
    id: 'fsm-ex-equations-d', chapter: 'fsm-design', title: 'Equations for the 100 detector', level: 2, kind: 'fsm', machine: DET100, stage: 'equations', design: { ff: 'D', assign: 'binary' }, minimal: true,
    text: ['The 100 detector with binary codes S0 = 00, S1 = 01, S2 = 10 and D flip-flops Q1, Q0. Code 11 is unused, so its entries are don\'t cares. Write minimal sums of products for D1, D0 and Z over Q1, Q0 and X.'],
    hints: ['D1 is 1 when the next state is S2: only from S1 on X = 0.', 'D0 is 1 when the next state is S1: on every X = 1. Z is 1 only from S2 on X = 0.', "D1 = Q0X′, D0 = X, Z = Q1X′ (the unused 11 lets Q1′ and Q0′ drop)."],
    solution: "D1 = Q0X'\nD0 = X\nZ = Q1X'",
    wrong: ["D1 = Q1'Q0X'\nD0 = X\nZ = Q1X'", "D1 = Q0X'\nD0 = X'\nZ = Q1X'", "D1 = Q0X'\nD0 = X\nZ = Q1"],
  });
  {
    const d = F.design(M(LOCK), { ff: 'D', assign: LOCK_CODES }), f = d.functions.find((g) => g.name === 'D1');
    ex({
      id: 'fsm-ex-kmap-d1', chapter: 'fsm-design', title: 'The K-map of D1', level: 2, kind: 'kmap', vars: ['Q1', 'Q0', 'X'], minterms: f.ones.slice(), dc: f.dc.slice(),
      text: ['The lock with L = 00, H = 01, O = 10 and D flip-flops. D1 is 1 when the next state is O: from H or O on X = 1. The code 11 is unused, so its cells are don\'t cares.', 'Circle a minimal cover of D1 over Q1, Q0, X.'],
      hints: ['The 1s are the cells 011 (H, X = 1) and 101 (O, X = 1); 110 and 111 are don\'t cares.', 'Each 1 can pair with the don\'t care 111.', 'D1 = Q0X + Q1X: the groups 0-11 → -11 and 1-1.'],
      solution: ['-11', '1-1'], wrong: [['011', '101'], ['--1']],
    });
  }
  ex({
    id: 'fsm-ex-flow-d', chapter: 'fsm-design', title: 'Design the saturating counter with D flip-flops', level: 3, kind: 'fsm', machine: SAT, stages: ['assign', 'transition', 'excitation', 'equations'], design: { ff: 'D', assign: 'gray' },
    text: ['Take the saturating counter all the way to equations. Use the Gray codes SN = 00, WN = 01, WT = 11, ST = 10 (each step changes one bit), D flip-flops Q1 and Q0, and write minimal equations for D1, D0 and Z.'],
    hints: ['With D flip-flops the excitation columns are just the next-state bits.', 'Read D0 off the transition table: it is 1 for WN and WT on X = 1 … and for ST on X = 0. Look for an XOR.', "SN = 00, WN = 01, WT = 11, ST = 10; D1 = Q1Q0′ + Q0X, D0 = Q1X′ + Q1′X, Z = Q1."],
    solution: { assign: 'SN = 00, WN = 01, WT = 11, ST = 10', transition: { 'SN|0|next': '00', 'SN|0|out': '0', 'SN|1|next': '01', 'SN|1|out': '0', 'WN|0|next': '00', 'WN|0|out': '0', 'WN|1|next': '11', 'WN|1|out': '0', 'WT|0|next': '01', 'WT|0|out': '1', 'WT|1|next': '10', 'WT|1|out': '1', 'ST|0|next': '11', 'ST|0|out': '1', 'ST|1|next': '10', 'ST|1|out': '1' }, excitation: excAnswer(SAT, { ff: 'D', assign: 'gray' }), equations: "D1 = Q1Q0' + Q0X\nD0 = Q1X' + Q1'X\nZ = Q1" },
    wrong: [{ assign: 'SN = 00, WN = 01, WT = 10, ST = 11' }, { assign: 'SN = 00, WN = 01, WT = 11, ST = 10', transition: { 'SN|0|next': '00', 'SN|0|out': '0', 'SN|1|next': '01', 'SN|1|out': '0', 'WN|0|next': '00', 'WN|0|out': '0', 'WN|1|next': '11', 'WN|1|out': '0', 'WT|0|next': '01', 'WT|0|out': '1', 'WT|1|next': '10', 'WT|1|out': '1', 'ST|0|next': '11', 'ST|0|out': '1', 'ST|1|next': '10', 'ST|1|out': '1' }, excitation: excAnswer(SAT, { ff: 'D', assign: 'gray' }), equations: "D1 = Q1Q0' + Q0X\nD0 = Q1'X\nZ = Q1" }],
  });
  ex({
    id: 'fsm-ex-flow-jk', chapter: 'fsm-design', title: 'The up/down counter with JK flip-flops', level: 3, kind: 'fsm', machine: UPDN, stages: ['excitation', 'equations'], design: { ff: 'JK', assign: 'binary' },
    text: ['The up/down counter with binary codes C0 = 00, C1 = 01, C2 = 10, C3 = 11 and JK flip-flops. Fill in the excitation table, then write minimal equations for J1, K1, J0, K0 and Z.'],
    hints: ['Q0 changes on every clock, up or down: J0 = K0 = 1 (a JK flip-flop with both inputs at 1 toggles).', 'Q1 changes when counting up from Q0 = 1, or down from Q0 = 0: J1 = K1 = Q0X + Q0′X′ (an XNOR).', "J1 = Q0X + Q0′X′, K1 = Q0X + Q0′X′, J0 = 1, K0 = 1, Z = Q1Q0."],
    solution: { excitation: excAnswer(UPDN, { ff: 'JK', assign: 'binary' }), equations: "J1 = Q0X + Q0'X'\nK1 = Q0X + Q0'X'\nJ0 = 1\nK0 = 1\nZ = Q1Q0" },
    wrong: [{ excitation: excAnswer(UPDN, { ff: 'JK', assign: 'binary' }, (a) => { a['C0|0|J1'] = '0'; }) }, { excitation: excAnswer(UPDN, { ff: 'JK', assign: 'binary' }), equations: "J1 = Q0X\nK1 = Q0X + Q0'X'\nJ0 = 1\nK0 = 1\nZ = Q1Q0" }],
  });
  {
    const d = F.design(M(LOCK), { ff: 'D', assign: LOCK_CODES }), u = F.unusedStates(d).codes[0];
    const name = (code) => (Object.entries(d.codes).find(([, c]) => c === code) || ['the unused code ' + code])[0];
    const opts = ['L (00)', 'H (01)', 'O (10)', 'It stays at 11'];
    const ans = ['00', '01', '10', '11'].indexOf(u.next['1']);
    ex({
      id: 'fsm-ex-unused', chapter: 'fsm-design', title: 'Where does the unused code go?', level: 2, kind: 'choice',
      text: ['The lock built with D flip-flops: D1 = Q1X + Q0X, D0 = Q1′Q0′X, Z = Q1 (L = 00, H = 01, O = 10). A glitch leaves the flip-flops at the unused code 11 while X = 1. Where is the machine after the next clock edge?', { circuit: LOCK_D, outputs: ['Z'] }],
      options: opts, answer: ans,
      whyNot: { 0: 'Put Q1 = 1, Q0 = 1, X = 1 into D1: it is 1, so Q1 stays 1.', 1: 'D1 = Q1X + Q0X = 1 here, so the next code starts with 1.', 3: 'D0 = Q1′Q0′X is 0 when Q1 = 1, so Q0 is cleared.' },
      hints: ['An unused code is not special to the gates: just evaluate the equations.', 'With Q1 = Q0 = X = 1: D1 = 1 + 1 = 1 and D0 = 0·0·1 = 0.', 'The next code is ' + u.next['1'] + ', which is ' + name(u.next['1']) + '. (With X = 0 it would go to ' + u.next['0'] + '.)'],
      solution: ans, wrong: [0, 3],
      why: 'Both ways out of 11 lead to used states, so this lock corrects itself.',
    });
  }
  {
    // a 3-bit Johnson counter: D2 = Q1, D1 = Q0, D0 = Q2'; six codes in its ring, two outside it
    const step = (c) => c[1] + c[2] + (c[0] === '1' ? '0' : '1');
    const ring = ['000']; while (ring.length < 8 && step(ring[ring.length - 1]) !== '000') ring.push(step(ring[ring.length - 1]));
    const outside = ['000', '001', '010', '011', '100', '101', '110', '111'].filter((c) => !ring.includes(c));
    const opts = ['000', '010', '101', '111'];
    const ans = opts.map((c, i) => (outside.includes(c) ? i : -1)).filter((i) => i >= 0);
    ex({
      id: 'fsm-ex-lockout', chapter: 'fsm-design', title: 'Codes that never come back', level: 3, kind: 'choice',
      text: ['A six-state counter uses three D flip-flops wired as D2 = Q1, D1 = Q0, D0 = Q2′. From 000 it counts ' + ring.concat('000').join(' → ') + '.', 'Two of the eight codes are never used by the count. Which codes can the counter be stuck in forever if a glitch puts it there? Choose all that apply.'],
      options: opts, answer: ans,
      hints: ['Find the two codes missing from the ring.', 'Start from one of them and apply the wiring: shift left and bring in the complement of the old Q2.', outside[0] + ' → ' + step(outside[0]) + ' → ' + step(step(outside[0])) + ': the two unused codes lead only to each other, a lockout.'],
      solution: ans, wrong: [[ans[0]], [0, 3]],
      why: 'The fix is to send one of them back into the ring, for example by changing D0 for that code.',
    });
  }
  {
    const SAT_C = 'nq0 = NOT(q0)\na1 = AND(q1, nq0)\na2 = AND(q0, X)\nd1 = OR(a1, a2)\nd0 = XOR(q1, X)\nq1 = DFF(d1)\nq0 = DFF(d0)\nZ = q1';
    ex({
      id: 'fsm-ex-flow-circuit', chapter: 'fsm-design', title: 'Build the saturating counter', level: 3, kind: 'fsm', machine: SAT, stage: 'circuit', design: { ff: 'D', assign: 'gray' },
      text: ['Build the saturating counter as a circuit with D flip-flops and gates. Inputs X, output Z. The flip-flops start cleared, and that must be SN. Use any codes you like; the Gray codes SN = 00, WN = 01, WT = 11, ST = 10 give short equations.'],
      hints: ['With the Gray codes: D1 = Q1Q0′ + Q0X, D0 = Q1X′ + Q1′X = Q1 ⊕ X, Z = Q1.', 'D0 is a single XOR gate. D1 needs two AND gates and an OR.', 'q1 = DFF(d1), q0 = DFF(d0), d1 = OR(AND(q1, NOT q0), AND(q0, X)), d0 = XOR(q1, X), Z = q1.'],
      solution: SAT_C,
      wrong: [SAT_C.replace('d0 = XOR(q1, X)', 'd0 = AND(q1, X)'), SAT_C.replace('Z = q1', 'Z = q0'), SAT_C.replace('a2 = AND(q0, X)', 'a2 = AND(q1, X)')],
    });
  }

  // ===========================================================================================================
  // Chapter 4: machines at work
  // ===========================================================================================================
  {
    const m = F.detector('101', { type: 'moore', overlap: false }).machine, txt = F.format(m);
    ex({
      id: 'fsm-ex-det-moore', chapter: 'fsm-uses', title: 'A Moore detector, no overlap', level: 2, kind: 'fsm', machine: txt, stage: 'table',
      text: ['A Moore machine raises Z for one clock after it has read 1, 0, 1. Matches must not overlap: after a match the search starts from scratch, so in 10101 only the first 101 counts.', 'Use S0 (nothing), S1 (seen 1), S2 (seen 10) and S3 (just matched, Z = 1). Write the state table.'],
      hints: ['S3 outputs 1 and the others 0.', 'From S3 nothing of the match may be reused: on 1 go to S1 (a fresh start), on 0 go to S0.', 'S0/0: 0 → S0, 1 → S1; S1/0: 0 → S2, 1 → S1; S2/0: 0 → S0, 1 → S3; S3/1: 0 → S0, 1 → S1.'],
      solution: txt,
      wrong: [txt.replace('S3/1: 0 -> S0', 'S3/1: 0 -> S2'), txt.replace('S2/0: 0 -> S0', 'S2/0: 0 -> S1'), txt.replace('S3/1', 'S3/0')],
    });
  }
  const DET011_C = 'nx = NOT(X)\nd1 = AND(q0, X)\nq1 = DFF(d1)\nq0 = DFF(nx)\nZ = AND(q1, X)';
  ex({
    id: 'fsm-ex-det-circuit', chapter: 'fsm-uses', title: 'Build a detector for 011', level: 2, kind: 'circuit', machine: DET011, inputs: ['X'], outputs: ['Z'], depth: 7,
    text: ['Build a circuit with input X and output Z that sets Z = 1 on the 1 that completes 0, 1, 1 (a Mealy output; matches may overlap). Use D flip-flops and gates; the flip-flops start at 0, which must be the state "nothing yet".', { fsm: DET011, caption: 'The machine your circuit is compared with, clock by clock, on every input sequence of 7 bits.' }],
    hints: ['Binary codes S0 = 00, S1 = 01, S2 = 10. S1 means the last bit was 0, which is reached from anywhere on X = 0.', 'D0 = X′ (any 0 leads to S1), D1 = Q0X (S1 on a 1), Z = Q1X.', 'nx = NOT(X), q0 = DFF(nx), q1 = DFF(AND(q0, X)), Z = AND(q1, X).'],
    solution: DET011_C,
    wrong: [DET011_C.replace('Z = AND(q1, X)', 'Z = q1'), DET011_C.replace('q0 = DFF(nx)', 'q0 = DFF(X)'), 'nx = NOT(X)\nd1 = AND(q0, X)\nq1 = DFF(d1)\nd0 = AND(nx, nx)\nq0 = DFF(d0)\nZ = AND(q1, q0)'],
  });
  const LOCK_JK = 'nx = NOT(X)\nj1 = AND(q0, X)\nq1 = JKFF(j1, nx)\nnq1 = NOT(q1)\nj0 = AND(nq1, X)\nq0 = JKFF(j0, 1)\nZ = q1';
  ex({
    id: 'fsm-ex-lock-jk', chapter: 'fsm-uses', title: 'The lock with JK flip-flops', level: 3, kind: 'circuit', machine: LOCK, inputs: ['X'], outputs: ['Z'], depth: 7,
    text: ['Build the lock (open after two 1s in a row, closed by any 0) with JK flip-flops and gates. Z is a Moore output. The flip-flops start at 0, which must be L.', { fsm: LOCK }],
    hints: ['Codes L = 00, H = 01, O = 10. Write the excitation table for J1, K1, J0, K0; code 11 is a don\'t care.', 'J1 = Q0X (H on a 1 opens), K1 = X′ (a 0 closes), J0 = Q1′X, K0 = 1, Z = Q1.', 'q1 = JKFF(AND(q0, X), NOT X); q0 = JKFF(AND(NOT q1, X), 1); Z = q1.'],
    solution: LOCK_JK,
    wrong: [LOCK_JK.replace('q0 = JKFF(j0, 1)', 'q0 = JKFF(j0, 0)'), LOCK_JK.replace('q1 = JKFF(j1, nx)', 'q1 = JKFF(j1, X)')],
  });
  // Verilog: hidden testbenches print FAIL lines with the inputs and the values
  const TB_DET = 'module tb;\n  reg clk = 0, rst = 1, x = 0; wire z; integer i; reg [23:0] pat; reg [1:0] h; reg want;\n  det011 u(.clk(clk), .rst(rst), .x(x), .z(z));\n  always #5 clk = ~clk;\n  initial begin\n    pat = 24\'b011011100110101101110011; h = 2\'b11;\n    @(negedge clk); rst = 0;\n    for (i = 23; i >= 0; i = i - 1) begin\n      x = pat[i]; #1;\n      want = (h == 2\'b01) && x;\n      if (z !== want) $display("FAIL bit %0d (x = %b after %b%b): z = %b, expected %b", 24 - i, x, h[1], h[0], z, want);\n      @(negedge clk); h = {h[0], x};\n    end\n    $display("DONE");\n    $finish;\n  end\nendmodule';
  const DET_V = 'module det011(input clk, input rst, input x, output z);\n  localparam S0 = 2\'d0, S1 = 2\'d1, S2 = 2\'d2;\n  reg [1:0] state;\n  always @(posedge clk)\n    if (rst) state <= S0;\n    else case (state)\n      S0: state <= x ? S0 : S1;\n      S1: state <= x ? S2 : S1;\n      S2: state <= x ? S0 : S1;\n      default: state <= S0;\n    endcase\n  assign z = (state == S2) && x;\nendmodule\n';
  ex({
    id: 'fsm-ex-det-verilog', chapter: 'fsm-uses', title: 'The 011 detector in Verilog', level: 2, kind: 'verilog', module: 'det011', ports: 'input clk, rst, x; output z', synth: true, pass: 'DONE',
    start: 'module det011(input clk, input rst, input x, output z);\n  // states, a state register, the next state on each rising edge, and z\n\nendmodule\n',
    testbench: TB_DET,
    text: ['Write module det011: on each rising edge of clk it reads x; z = 1 while x = 1 completes the pattern 0, 1, 1 (a Mealy output: z depends on the state and on x). Matches may overlap. rst = 1 at a rising edge puts it back in the start state (a synchronous reset).', 'A hidden testbench holds rst for the first edge, then sends 24 bits and checks z before every edge.'],
    hints: ['Three states: S0 (nothing), S1 (last bit 0), S2 (last bits 01). A 0 from anywhere goes to S1.', 'Use a case on the state inside always @(posedge clk), and a continuous assignment for z.', 'S0: x ? S0 : S1; S1: x ? S2 : S1; S2: x ? S0 : S1; assign z = (state == S2) && x.'],
    solution: DET_V,
    wrong: [DET_V.replace('assign z = (state == S2) && x;', 'assign z = (state == S2);'), DET_V.replace('S2: state <= x ? S0 : S1;', 'S2: state <= x ? S0 : S0;'), DET_V.replace('module det011', 'module det')],
  });
  const TB_SAT = 'module tb;\n  reg clk = 0, rst = 1, x = 0; wire z; integer i, cnt; reg [19:0] pat;\n  sat2 u(.clk(clk), .rst(rst), .x(x), .z(z));\n  always #5 clk = ~clk;\n  initial begin\n    pat = 20\'b11100010111100001101; cnt = 0;\n    @(negedge clk); rst = 0;\n    if (z !== 0) $display("FAIL after reset: z = %b, expected 0", z);\n    for (i = 19; i >= 0; i = i - 1) begin\n      x = pat[i];\n      @(negedge clk);\n      if (x && cnt < 3) cnt = cnt + 1; else if (!x && cnt > 0) cnt = cnt - 1;\n      if (z !== (cnt >= 2)) $display("FAIL bit %0d (x = %b, count now %0d): z = %b, expected %b", 20 - i, x, cnt, z, cnt >= 2);\n    end\n    $display("DONE");\n    $finish;\n  end\nendmodule';
  const SAT_V = 'module sat2(input clk, input rst, input x, output z);\n  reg [1:0] c;\n  always @(posedge clk)\n    if (rst) c <= 2\'d0;\n    else if (x && c != 2\'d3) c <= c + 1;\n    else if (!x && c != 2\'d0) c <= c - 1;\n  assign z = c[1];\nendmodule\n';
  ex({
    id: 'fsm-ex-sat-verilog', chapter: 'fsm-uses', title: 'The saturating counter in Verilog', level: 3, kind: 'verilog', module: 'sat2', ports: 'input clk, rst, x; output z', synth: true, pass: 'DONE',
    start: 'module sat2(input clk, input rst, input x, output z);\n\nendmodule\n',
    testbench: TB_SAT,
    text: ['Write module sat2, the saturating counter as a Moore machine: four states from "strongly 0" to "strongly 1"; on each rising edge x = 1 moves one step up and x = 0 one step down, never past the ends. z = 1 in the two upper states. rst = 1 at an edge puts it in the lowest state.', 'The testbench checks z after every edge, so z must depend on the state only.'],
    hints: ['A 2-bit register c can hold the state directly: 0, 1, 2, 3.', 'Count up when x = 1 and c is not 3; count down when x = 0 and c is not 0. z is the top bit of c.', 'always @(posedge clk) if (rst) c <= 0; else if (x && c != 3) c <= c + 1; else if (!x && c != 0) c <= c - 1; assign z = c[1];'],
    solution: SAT_V,
    wrong: [SAT_V.replace("else if (x && c != 2'd3) c <= c + 1;", 'else if (x) c <= c + 1;'), SAT_V.replace('assign z = c[1];', 'assign z = x;'), SAT_V.replace('assign z = c[1];', 'assign z = c[0];')],
  });
  const TB_SER = 'module tb;\n  reg clk = 0, rst = 1, a = 0, b = 0; wire s; integer i, k; reg c; reg [7:0] A, B;\n  sadd u(.clk(clk), .rst(rst), .a(a), .b(b), .s(s));\n  always #5 clk = ~clk;\n  initial begin\n    for (k = 0; k < 4; k = k + 1) begin\n      A = 8\'d45 + k * 8\'d61; B = 8\'d200 - k * 8\'d37; c = 0;\n      rst = 1; @(negedge clk); rst = 0;\n      for (i = 0; i < 8; i = i + 1) begin\n        a = A[i]; b = B[i]; #1;\n        if (s !== (a ^ b ^ c)) $display("FAIL %0d + %0d, bit %0d: s = %b, expected %b", A, B, i, s, a ^ b ^ c);\n        c = (a & b) | (a & c) | (b & c);\n        @(negedge clk);\n      end\n    end\n    $display("DONE");\n    $finish;\n  end\nendmodule';
  const SER_V = 'module sadd(input clk, input rst, input a, input b, output s);\n  reg c;\n  always @(posedge clk)\n    if (rst) c <= 1\'b0;\n    else c <= (a & b) | (a & c) | (b & c);\n  assign s = a ^ b ^ c;\nendmodule\n';
  ex({
    id: 'fsm-ex-serial-verilog', chapter: 'fsm-uses', title: 'A serial adder in Verilog', level: 2, kind: 'verilog', module: 'sadd', ports: 'input clk, rst, a, b; output s', synth: true, pass: 'DONE',
    start: 'module sadd(input clk, input rst, input a, input b, output s);\n\nendmodule\n',
    testbench: TB_SER,
    text: ['Write module sadd, a serial adder: two numbers arrive on a and b one bit per clock, least significant bit first, and s is their sum bit in the same clock (a Mealy output). The state is the carry. rst = 1 at an edge clears the carry.', 'The testbench adds four pairs of 8-bit numbers and checks s on every bit.'],
    hints: ['One flip-flop for the carry; s and the next carry are a full adder\'s outputs.', 's = a ⊕ b ⊕ c; the next carry is the majority ab + ac + bc.', 'reg c; always @(posedge clk) if (rst) c <= 0; else c <= (a & b) | (a & c) | (b & c); assign s = a ^ b ^ c;'],
    solution: SER_V,
    wrong: [SER_V.replace('assign s = a ^ b ^ c;', 'assign s = a ^ b;'), SER_V.replace('else c <= (a & b) | (a & c) | (b & c);', 'else c <= a & b;')],
  });
  {
    const want = S.Check.waveExpected({ circuit: SERIAL, inputs: { A: '10110', B: '11100' }, clocked: true, outputs: ['S'] }).S;
    ex({
      id: 'fsm-ex-serial-wave', chapter: 'fsm-uses', title: 'Draw the serial sum', level: 2, kind: 'waveform', circuit: SERIAL, inputs: { A: '10110', B: '11100' }, clocked: true, outputs: ['S'], given: { S: '?????' },
      text: ['A serial adder: one full adder and a D flip-flop c for the carry, cleared at the start. A = 13 and B = 7 arrive least significant bit first (A: 1, 0, 1, 1, 0; B: 1, 1, 1, 0, 0).', { circuit: SERIAL, outputs: ['S'] }, 'Draw S for the five clocks.'],
      hints: ['Each clock adds a bit of A, a bit of B and the carry from the clock before.', 'Clock 1: 1 + 1 + 0 = 10, so S = 0 and the carry is 1.', 'S = ' + sp(want.split('')) + ': least significant bit first, 20 = 10100.'],
      solution: { S: want }, wrong: [{ S: '01011' }, { S: '01110' }],
    });
  }
  ex({
    id: 'fsm-ex-lock-fmax', chapter: 'fsm-uses', title: 'How fast can the lock run?', level: 2, kind: 'timing', circuit: LOCK_D, tech: 'CMOS', ask: 'fmax',
    text: ['The lock built with D flip-flops, with the CMOS preset timing. What is its maximum clock frequency, in MHz?', { circuit: LOCK_D, outputs: ['Z'] }],
    hints: ['One clock period must cover clock-to-Q, the slowest logic path to a D input, and the setup time.', 'The slowest path starts at q1, goes through the OR and the AND into D1: 14 + 10 + 10 = 34 ns; add 12 ns setup.', 'A period of 46 ns: 1000 / 46 ≈ 21.7 MHz.'],
    solution: 21.739, wrong: [29.4, 50],
  });
  {
    const m = M(VEND), coins = ['10', '00', '01', '10', '01', '10', '10', '10'];
    const r = F.run(m, coins), vends = r.outputs.filter((z) => z[0] === '1').length, change = r.outputs.filter((z) => z[1] === '1').length;
    const say = (c) => (c === '10' ? '5' : c === '01' ? '10' : '–');
    ex({
      id: 'fsm-ex-vend-count', chapter: 'fsm-uses', title: 'Count the drinks', level: 1, kind: 'number',
      text: ['The coin controller: price 15; N = 1 is a 5-cent coin, D = 1 a 10-cent coin (never both); V = 1 vends, and C = 1 also gives 5 cents back when 20 was paid. After a vend it starts again from 0.', tableOf(VEND, 'Each entry: next state / V C. N = D = 1 never happens.'), 'Coins arrive one per clock: ' + coins.map(say).join(', ') + ' (– is no coin). How many times does it vend?'],
      answer: vends, higherLower: true,
      hints: ['Keep a running total and reset it to 0 after each vend.', '5, –, 10: that is 15, one vend. Then 5 and 10: another.', 'The states: ' + r.states.join(' → ') + '. It vends ' + vends + ' times and gives change ' + change + ' time' + (change === 1 ? '' : 's') + '.'],
      solution: vends, wrong: [vends - 1, vends + 1],
    });
  }

  // ---- what the diagram checker looks at: a sample of these exercises ------------------------------------------
  if (S.Checks) {
    for (const id of ['fsm-ex-run-output', 'fsm-ex-analyse-d', 'fsm-ex-flow-d', 'fsm-ex-excitation-jk', 'fsm-ex-det-circuit', 'fsm-ex-moore-wave', 'fsm-ex-det-verilog', 'fsm-ex-lockout']) S.Checks.push({ group: 'learn', name: 'exercise ' + id, hash: 'exercise=' + id, ready: "document.querySelector('#exerciseView')", sel: '#main' });
  }
})(globalThis.Sirkit = globalThis.Sirkit || {});
