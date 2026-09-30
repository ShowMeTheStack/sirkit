// Part 5 exercises: latches, flip-flops and timing. Waveforms are checked against the simulator slot by slot,
// circuits by exhaustive simulation, timing numbers by Sirkit.Sim.sta with the named technology's delays. Every
// hard-coded answer here was worked out by those engines.
(function (S) {
  'use strict';
  const C = S.Content;
  if (!C || C.exercises.has('p5x-nor-wave')) return;
  const P = S.P5 || {};
  const ex = (chapter) => (o) => C.exercise(Object.assign({ chapter, level: 2 }, o));

  // =========================================================================================================
  // Latches
  // =========================================================================================================
  const X1 = ex('p5-ch-latches');
  const NT_ROWS = ['S = 1, R = 0', 'then S = 0, R = 0 (after set)', 'S = 0, R = 1', 'then S = 0, R = 0 (after reset)', 'S = 1, R = 1'];
  const NT = {};
  NT_ROWS.forEach((r, i) => { NT[r + '|Q'] = ['1', '1', '0', '0', '0'][i]; NT[r + '|Q′'] = ['0', '0', '1', '1', '0'][i]; });
  X1({
    id: 'p5x-nor-wave', title: 'Complete a NOR latch\'s waveform', level: 1, kind: 'waveform', circuit: P.nor,
    inputs: { S: '1000110100', R: '0011111000' }, outputs: ['Q', 'QB'], given: { Q: '1?????????', QB: '0?????????' },
    text: ['An SR latch from two NOR gates gets these values of S and R, one pair per slot, and settles in each slot. Complete Q and QB (QB is Q′). Slot 1 is filled in.'],
    hints: ['S = R = 0 holds; S = 1 sets; R = 1 resets. In slots 5 and 6 both are 1: each NOR gate has a 1 input.', 'Both inputs 1 makes Q = 0 and Q′ = 0 together. In slot 7 only R is 1, so the latch is plainly reset; it is set again in slot 8.', 'Q: 1 1 0 0 0 0 0 1 1 1. QB: 0 0 1 1 0 0 1 0 0 0.'],
    solution: { Q: '1100000111', QB: '0011001000' },
    wrong: [{ Q: '1100000111', QB: '0011111000' }, { Q: '1000110100', QB: '0111001011' }, { Q: '1100110111', QB: '0011001000' }],
    why: 'QB is not always the complement of Q: in slots 5 and 6, with S = R = 1, both are 0.',
  });
  X1({
    id: 'p5x-nor-table', title: 'The NOR latch, row by row', level: 1, kind: 'table', table: 'custom', cellKind: 'bit',
    rows: NT_ROWS, cols: ['Q', 'Q′'], corner: 'inputs, in order', cells: NT,
    text: ['A NOR latch is given these inputs one after another, top to bottom. Fill in Q and Q′ after each.'],
    hints: ['A NOR gate gives 1 only when both its inputs are 0.', 'S = R = 0 keeps whatever the row above left. With S = R = 1, each gate has a 1 input.', 'Q, Q′: 1 0; 1 0; 0 1; 0 1; 0 0.'],
    solution: NT,
    wrong: [Object.assign({}, NT, { 'then S = 0, R = 0 (after set)|Q': '0', 'then S = 0, R = 0 (after set)|Q′': '1' }), Object.assign({}, NT, { 'S = 1, R = 1|Q': '1', 'S = 1, R = 1|Q′': '1' })],
  });
  X1({
    id: 'p5x-forbidden', title: 'Releasing both inputs', level: 1, kind: 'choice',
    text: ['A NOR latch has S = R = 1. Both inputs now fall to 0 at the same moment. What can you say about Q afterwards?'],
    options: ['Q = 0, because R was the last input to act', 'Q = 1, because S has priority', 'It may oscillate for a while and then settle to a value that cannot be predicted', 'Q keeps the value it had before S and R were both 1'],
    answer: 2, whyNot: { 0: 'Neither input acts last: they fall together, and both gates start rising at once.', 1: 'An SR latch gives neither input priority; that is exactly the problem.', 3: 'While S = R = 1 both outputs were forced to 0, so the old value is gone.' },
    hints: ['While S = R = 1, both outputs are 0.', 'When both inputs fall, each gate sees 0 and 0 and starts to rise, at the same time.', 'It is a race: with matched gates the outputs oscillate, and real gates settle whichever way the faster gate decides.'],
    solution: 2, wrong: [0, 1, 3],
  });
  X1({
    id: 'p5x-settle', title: 'How long does the loop take?', level: 1, kind: 'number', answer: 18, higherLower: true,
    text: ['In a NOR latch every gate takes 9 ns. S rises with the latch holding Q = 0. How many nanoseconds after S rises is Q = 1 and Q′ = 0, both settled?'],
    hints: ['Which gate does S feed, and which output does it change first?', 'S changes Q′ after one gate delay; only then does the other gate see Q′ = 0 and change Q.', 'Two gate delays: 2 × 9 = 18 ns.'],
    solution: 18, wrong: [9, 27], why: 'The second gate can only answer once the first has: two gate delays.',
  });
  X1({
    id: 'p5x-nand-wave', title: 'Complete a NAND latch\'s waveform', kind: 'waveform', circuit: P.nand,
    inputs: { Sn: '0111001101', Rn: '1100100110' }, outputs: ['Q', 'QB'], given: { Q: '1?????????', QB: '0?????????' },
    text: ['A NAND latch: Sn is S′ and Rn is R′, both active low. Complete Q and QB (Q′) slot by slot.'],
    hints: ['S′ = 0 sets, R′ = 0 resets, both 1 holds.', 'In slot 6 both are 0: each NAND has a 0 input, so both outputs are 1. In slot 7 only R′ is 0, a plain reset.', 'Q: 1 1 0 0 1 1 0 0 1 0. QB: 0 0 1 1 0 1 1 1 0 1.'],
    solution: { Q: '1100110010', QB: '0011011101' },
    wrong: [{ Q: '0011001101', QB: '1100110010' }, { Q: '1100110010', QB: '0011001101' }, { Q: '1100100010', QB: '0011011101' }],
  });
  X1({
    id: 'p5x-nand-build', title: 'Build a NAND latch', kind: 'circuit', refCircuit: P.nand, inputs: ['Sn', 'Rn'], outputs: ['Q', 'QB'], parts: ['NAND'], maxGates: 2,
    text: ['Build an SR latch with active-low inputs Sn (S′) and Rn (R′) and outputs Q and QB (Q′), from two NAND gates.'],
    hints: ['Each gate takes one free input and the other gate\'s output.', 'S′ = 0 must make Q = 1: so S′ goes into the gate whose output is Q.', 'q = NAND(Sn, qb); qb = NAND(Rn, q); Q = q; QB = qb.'],
    solution: P.nand,
    wrong: ['q = NAND(Rn, qb)\nqb = NAND(Sn, q)\nQ = q\nQB = qb', 'q = NOR(Sn, qb)\nqb = NOR(Rn, q)\nQ = q\nQB = qb', 'q = NAND(Sn, Rn)\nqb = NAND(q, q)\nQ = q\nQB = qb'],
  });
  X1({
    id: 'p5x-debounce-wave', title: 'A switch bouncing back', kind: 'waveform', circuit: P.nand,
    inputs: { Sn: '01111111111', Rn: '11110101000' }, outputs: ['Q', 'QB'], given: { Q: '1??????????', QB: '0??????????' },
    text: ['A changeover switch feeds a NAND latch. The lever rests on contact A (S′ = 0), then leaves it and lands on contact B, whose signal R′ bounces before it settles. Complete Q and QB.'],
    hints: ['While the lever travels, S′ = R′ = 1: the latch holds.', 'The first time R′ touches 0 the latch resets. Every bounce back to 1 is a hold, and every new 0 a reset of a latch that is already reset.', 'Q: 1 1 1 1 0 0 0 0 0 0 0. QB: 0 0 0 0 1 1 1 1 1 1 1.'],
    solution: { Q: '11110000000', QB: '00001111111' },
    wrong: [{ Q: '11110101000', QB: '00001010111' }, { Q: '11111111000', QB: '00000000111' }],
    why: 'One clean falling edge on Q, at the first touch of B.',
  });
  X1({
    id: 'p5x-debounce-why', title: 'Why the latch is not fooled', kind: 'choice',
    text: ['A NAND latch on a changeover switch removes contact bounce. Which fact about the switch makes this work?'],
    options: ['A bouncing contact touches only the contact it is landing on, never the one it left', 'The bounces are shorter than a gate delay', 'The pull-up resistors slow the edges down', 'The latch inputs are active low'],
    answer: 0, whyNot: { 1: 'Bounces last for milliseconds, a million times longer than a gate delay.', 2: 'The resistors only give the inputs a 1 when the lever is away; they do not filter anything.', 3: 'A NOR latch with the contacts pulled down would work just as well: the polarity is not the point.' },
    hints: ['Think about what each bounce asks the latch to do.', 'Every bounce on contact A is another set; what would it take to reset the latch?', 'Only a touch of contact B could reset it, and a bouncing lever never goes back to B.'],
    solution: 0, wrong: [1, 3],
  });
  X1({
    id: 'p5x-dlatch-wave', title: 'Complete a D latch\'s waveform', level: 1, kind: 'waveform', circuit: 'q = LATCH(D, EN)\nQ = q',
    inputs: { D: '1001011001', EN: '1100011100' }, outputs: ['Q'], given: { Q: '1?????????' },
    text: ['A D latch is enabled while EN = 1. Complete Q over the ten slots.'],
    hints: ['While EN = 1, Q = D.', 'While EN = 0, Q keeps the value it had when EN fell, whatever D does.', 'Q: 1 0 0 0 0 1 1 0 0 0.'],
    solution: { Q: '1000011000' },
    wrong: [{ Q: '1001011001' }, { Q: '1111111111' }, { Q: '1000011100' }],
  });
  X1({
    id: 'p5x-dlatch-build', title: 'A D latch from NAND gates', kind: 'circuit', refCircuit: P.dlatch, inputs: ['D', 'EN'], outputs: ['Q'], parts: ['NAND'], maxGates: 5,
    text: ['Build a D latch from at most five two-input NAND gates: while EN = 1, Q follows D; while EN = 0, Q holds. (Until it is first enabled, a latch built from gates holds an unknown value, X.)'],
    hints: ['Start from a NAND latch: q = NAND(s, qb), qb = NAND(r, q). It sets when s = 0 and resets when r = 0.', 'Steer it: s = NAND(D, EN) falls only when D = 1 and EN = 1; r must fall only when D = 0 and EN = 1, so it needs D′, which one more NAND makes.', 'n1 = NAND(D, D); s = NAND(D, EN); r = NAND(n1, EN); q = NAND(s, qb); qb = NAND(r, q); Q = q.'],
    solution: P.dlatch,
    wrong: ['n1 = NAND(D, D)\ns = NAND(n1, EN)\nr = NAND(D, EN)\nq = NAND(s, qb)\nqb = NAND(r, q)\nQ = q', 's = NAND(D, EN)\nr = NAND(D, EN)\nq = NAND(s, qb)\nqb = NAND(r, q)\nQ = q', 'n = NAND(D, EN)\nQ = NAND(n, n)'],
  });
  X1({
    id: 'p5x-dlatch-verilog', title: 'A D latch in Verilog', kind: 'verilog', module: 'dlatch', ports: 'input d, en; output reg q', lint: false,
    start: 'module dlatch(input d, input en, output reg q);\n  \nendmodule\n',
    testbench: 'module tb;\n  reg d, en; wire q;\n  dlatch u(.d(d), .en(en), .q(q));\n  initial begin\n    en = 1; d = 1; #1;\n    if (q !== 1) $display("FAIL en=1 d=1: q=%b, expected 1", q);\n    d = 0; #1;\n    if (q !== 0) $display("FAIL en=1, d changed to 0: q=%b, expected 0 (transparent)", q);\n    d = 1; #1; en = 0; #1; d = 0; #1;\n    if (q !== 1) $display("FAIL en fell with d=1, then d=0: q=%b, expected 1 (hold)", q);\n    d = 1; #1; d = 0; #1;\n    if (q !== 1) $display("FAIL en=0, d wiggled: q=%b, expected 1 (hold)", q);\n    en = 1; #1;\n    if (q !== 0) $display("FAIL en rose with d=0: q=%b, expected 0", q);\n    $display("DONE");\n  end\nendmodule',
    pass: 'DONE',
    text: ['Write a D latch: while en = 1, q follows d; while en = 0, q holds. The linter will tell you that a latch is inferred, which here is exactly what is wanted, so that warning is not counted.'],
    hints: ['A combinational always block (always @(*)) runs whenever d or en changes.', 'Assign q only when en = 1. With no else, q keeps its value: that is the latch.', 'always @(*) if (en) q = d;'],
    solution: 'module dlatch(input d, input en, output reg q);\n  always @(*) if (en) q = d;\nendmodule\n',
    wrong: ['module dlatch(input d, input en, output reg q);\n  always @(*) q = en & d;\nendmodule\n', 'module dlatch(input d, input en, output reg q);\n  always @(posedge en) q <= d;\nendmodule\n'],
  });
  X1({
    id: 'p5x-lab-latch', title: 'An SR latch on the bench', kind: 'lab', lab: 'p5lab-latch',
    text: ['Build the NAND latch on the bench with a 7400, fill in the observation table, and check.'],
    hints: ['Power first: pin 14 to +5 V, pin 7 to ground.', 'Gate 1 (pins 1, 2, 3) makes Q from S′ and Q′; gate 2 (pins 4, 5, 6) makes Q′ from R′ and Q. Cross pin 3 to pin 5 and pin 6 to pin 2.', 'Observations: 1 0, 1 0, 0 1, 0 1, 1 1, and 1 0 while S′ bounces.'],
    solution: { bench: C.labs.get('p5lab-latch').reference, observe: Object.assign({}, C.labs.get('p5lab-latch').observe.cells) },
    wrong: [{ bench: { chips: C.labs.get('p5lab-latch').reference.chips, jumpers: C.labs.get('p5lab-latch').reference.jumpers.slice(2) } }, { bench: C.labs.get('p5lab-latch').reference, observe: Object.assign({}, C.labs.get('p5lab-latch').observe.cells, { '0 0|Q′ (LED 1)': '0' }) }],
  });

  // =========================================================================================================
  // Flip-flops
  // =========================================================================================================
  const X2 = ex('p5-ch-flipflops');
  X2({
    id: 'p5x-edge-choice', title: 'Latch or flip-flop?', level: 1, kind: 'choice',
    text: ['D changes three times while the clock is 1. A D latch is enabled by the clock; a positive-edge D flip-flop is clocked by it. How many times can each output change during that clock pulse?'],
    options: ['Latch: up to 3; flip-flop: at most 1', 'Latch: at most 1; flip-flop: up to 3', 'Both: at most 1', 'Both: up to 3'],
    answer: 0, whyNot: { 1: 'It is the other way round: the latch is the transparent one.', 2: 'The latch is transparent for the whole time the clock is 1, so it passes every change.', 3: 'The flip-flop samples only at the rising edge.' },
    hints: ['A latch enabled by the clock is transparent while the clock is 1.', 'A flip-flop takes D only at the edge, and the edge comes once per pulse.', 'Latch: once for each change of D, so up to 3; flip-flop: once, at the rising edge.'],
    solution: 0, wrong: [1, 2],
  });
  X2({
    id: 'p5x-ms-choice', title: 'Inside a master–slave flip-flop', kind: 'choice',
    text: ['A master–slave D flip-flop: the master latch is enabled by CLK′, the slave by CLK. Which statements are true? Choose all that are.'],
    options: ['While CLK = 0 the master follows D', 'While CLK = 1 the slave copies the master to Q', 'Both latches are open just after the rising edge', 'Q changes just after the rising edge', 'Q changes just after the falling edge'],
    answer: [0, 1, 3],
    hints: ['Enabled by CLK′ means open while the clock is 0.', 'The two enables are complements, so the latches are never open together.', 'True: the master follows D while CLK = 0, the slave copies it while CLK = 1, so Q changes just after the rising edge.'],
    solution: [0, 1, 3], wrong: [[0, 1, 2, 3], [0, 4], [1, 3]],
  });
  X2({
    id: 'p5x-jk-table', title: 'The JK characteristic table', level: 1, kind: 'table', table: 'truth', outputs: { 'Q(t+1)': "JQ' + K'Q" }, vars: ['J', 'K', 'Q'],
    text: ['Fill in the next state Q(t+1) of a JK flip-flop for every J, K and present state Q.'],
    hints: ['JK = 00 holds, 01 resets, 10 sets, 11 toggles.', 'For J = K = 1, Q(t+1) is the opposite of Q.', 'Down the rows 000 to 111: 0, 1, 0, 0, 1, 1, 1, 0.'],
    solution: { '000|Q(t+1)': '0', '001|Q(t+1)': '1', '010|Q(t+1)': '0', '011|Q(t+1)': '0', '100|Q(t+1)': '1', '101|Q(t+1)': '1', '110|Q(t+1)': '1', '111|Q(t+1)': '0' },
    wrong: [{ '000|Q(t+1)': '0', '001|Q(t+1)': '1', '010|Q(t+1)': '0', '011|Q(t+1)': '0', '100|Q(t+1)': '1', '101|Q(t+1)': '1', '110|Q(t+1)': '1', '111|Q(t+1)': '1' }, { '000|Q(t+1)': '0', '001|Q(t+1)': '0', '010|Q(t+1)': '0', '011|Q(t+1)': '0', '100|Q(t+1)': '1', '101|Q(t+1)': '1', '110|Q(t+1)': '1', '111|Q(t+1)': '0' }],
  });
  X2({
    id: 'p5x-jk-wave', title: 'Complete a JK flip-flop\'s waveform', level: 1, kind: 'waveform', circuit: 'q = JKFF(J, K)\nQ = q', clocked: true,
    inputs: { J: '10110101', K: '01011100' }, outputs: ['Q'], given: { Q: '0???????' },
    text: ['A rising-edge JK flip-flop starts at Q = 0. Each slot is one clock cycle; Q is read just before the cycle\'s edge, so the J and K of a slot decide Q in the next slot. Complete Q.'],
    hints: ['Slot 1 has J = 1, K = 0: set, so slot 2 shows Q = 1.', 'Slot 4 has J = K = 1: Q toggles. So does slot 6.', 'Q: 0 1 0 1 0 0 1 1.'],
    solution: { Q: '01010011' },
    wrong: [{ Q: '10100111' }, { Q: '01011011' }, { Q: '01010111' }],
  });
  X2({
    id: 'p5x-t-wave', title: 'Complete a T flip-flop\'s waveform', level: 1, kind: 'waveform', circuit: 'q = TFF(T)\nQ = q', clocked: true,
    inputs: { T: '11011001' }, outputs: ['Q'], given: { Q: '0???????' },
    text: ['A rising-edge T flip-flop starts at Q = 0. Complete Q, read before each edge.'],
    hints: ['T = 1 toggles at the edge, T = 0 holds.', 'Slot 1 has T = 1, so slot 2 shows 1; slot 2 has T = 1, so slot 3 shows 0.', 'Q: 0 1 0 0 1 0 0 0.'],
    solution: { Q: '01001000' },
    wrong: [{ Q: '11011001' }, { Q: '10010000' }],
  });
  X2({
    id: 'p5x-jk-eq', title: 'The JK characteristic equation', kind: 'expr', ref: "JQ' + K'Q", vars: ['J', 'K', 'Q'], maxLiterals: 4, form: 'sop',
    text: ['Write the characteristic equation of the JK flip-flop, Q(t+1) as a minimal sum of products of J, K and Q.'],
    hints: ['Q(t+1) = 1 for (J, K, Q) = 001, 100, 101 and 110.', 'Group them on a K-map: 100 and 110 have J = 1, Q = 0; 001 and 101 have K = 0, Q = 1.', "Q(t+1) = JQ' + K'Q."],
    solution: "JQ' + K'Q", wrong: ["JQ' + KQ", "J + K'Q", "JQ' + K'Q + JK'"],
  });
  X2({
    id: 'p5x-sr-eq', title: 'The SR flip-flop\'s equation', kind: 'simplify', vars: ['S', 'R', 'Q'], minterms: [1, 4, 5], dc: [6, 7], form: 'sop', maxLiterals: 3,
    text: ['An SR flip-flop holds for SR = 00, resets for 01, sets for 10, and SR = 11 is never applied (a don\'t-care). Write Q(t+1) in terms of S, R and Q with at most three literals.'],
    hints: ['Q(t+1) = 1 for (S, R, Q) = 001, 100, 101; 110 and 111 are don\'t-cares.', 'With the don\'t-cares as 1s, every row with S = 1 is a 1.', "Q(t+1) = S + R'Q."],
    solution: "S + R'Q", wrong: ["SR' + R'Q", "S + Q", "SQ' + R'Q"],
  });
  X2({
    id: 'p5x-async-wave', title: 'Clear between the edges', kind: 'waveform', circuit: 'q = DFF[reset, asyncLow](D, rst=CLRn)\nQ = q', clocked: true,
    inputs: { D: '10111010', CLRn: '11011110' }, outputs: ['Q'], given: { Q: '0???????' },
    text: ['A rising-edge D flip-flop has an active-low asynchronous clear, CLRn (CLR′). Each slot sets D and CLRn, then Q is read, then the clock edge comes. Complete Q.'],
    hints: ['CLR′ = 0 makes Q = 0 within the slot, without waiting for an edge, and the edge at the end of that slot is ignored.', 'In the other slots Q shows the D of the slot before.', 'Q: 0 1 0 0 1 1 0 0.'],
    solution: { Q: '01001100' },
    wrong: [{ Q: '01011100' }, { Q: '01001101' }, { Q: '01101100' }],
  });
  X2({
    id: 'p5x-t-from-d', title: 'A T flip-flop from a D flip-flop', level: 1, kind: 'circuit', refCircuit: 'q = TFF(T)\nQ = q', inputs: ['T'], outputs: ['Q'], parts: ['DFF', 'XOR', 'XNOR', 'AND', 'OR', 'NOT'],
    text: ['Build a T flip-flop from one D flip-flop and gates: Q toggles at an edge when T = 1 and holds when T = 0.'],
    hints: ['The next state must be Q(t+1) = T ⊕ Q.', 'A D flip-flop\'s next state is whatever is on D.', 'q = DFF(d); d = XOR(T, q); Q = q.'],
    solution: 'q = DFF(d)\nd = XOR(T, q)\nQ = q',
    wrong: ['q = DFF(T)\nQ = q', "q = DFF(d)\nd = XNOR(T, q)\nQ = q", "q = DFF(q')\nQ = q"],
  });
  X2({
    id: 'p5x-jk-from-d', title: 'A JK flip-flop from a D flip-flop', level: 3, kind: 'circuit', refCircuit: 'q = JKFF(J, K)\nQ = q', inputs: ['J', 'K'], outputs: ['Q'], parts: ['DFF', 'AND', 'OR', 'NOT'], maxGates: 5,
    text: ['Build a JK flip-flop from one D flip-flop, AND, OR and NOT gates, with at most five parts in all. Remember that q\' names the flip-flop\'s Q′ output.'],
    hints: ['The D input must carry the characteristic equation Q(t+1) = JQ′ + K′Q.', 'One AND for JQ′ (use q\' for Q′), one AND for K′Q (with an inverter on K), and an OR.', "q = DFF(d); a = AND(J, q'); k = NOT(K); b = AND(k, q); d = OR(a, b); Q = q."],
    solution: "q = DFF(d)\na = AND(J, q')\nk = NOT(K)\nb = AND(k, q)\nd = OR(a, b)\nQ = q",
    wrong: ["q = DFF(d)\na = AND(J, q')\nb = AND(K, q)\nd = OR(a, b)\nQ = q", "q = DFF(d)\nk = NOT(K)\nb = AND(k, q)\nd = OR(J, b)\nQ = q", "q = DFF(d)\na = AND(J, q')\nk = NOT(K)\nb = AND(k, q)\nn = NOT(q)\nd = OR(a, b)\nQ = q"],
  });
  X2({
    id: 'p5x-d-from-jk', title: 'A D flip-flop from a JK flip-flop', kind: 'circuit', refCircuit: 'q = DFF(D)\nQ = q', inputs: ['D'], outputs: ['Q'], parts: ['JKFF', 'NOT'], maxGates: 2,
    text: ['Make a JK flip-flop behave as a D flip-flop, with at most one inverter.'],
    hints: ['For D = 1 the JK flip-flop must set; for D = 0 it must reset.', 'Set is J = 1, K = 0; reset is J = 0, K = 1.', 'n = NOT(D); q = JKFF(D, n); Q = q.'],
    solution: 'n = NOT(D)\nq = JKFF(D, n)\nQ = q',
    wrong: ['q = JKFF(D, D)\nQ = q', 'n = NOT(D)\nq = JKFF(n, D)\nQ = q', 'q = JKFF(D, 0)\nQ = q'],
  });
  X2({
    id: 'p5x-dff-verilog', title: 'A D flip-flop with clear, in Verilog', kind: 'verilog', module: 'dffc', ports: 'input clk, d, clr_n; output reg q', synth: true,
    start: 'module dffc(input clk, input d, input clr_n, output reg q);\n  \nendmodule\n',
    testbench: 'module tb;\n  reg clk, d, clr_n; wire q;\n  dffc u(.clk(clk), .d(d), .clr_n(clr_n), .q(q));\n  initial begin\n    clk = 0; d = 1; clr_n = 1; #1;\n    clr_n = 0; #1;\n    if (q !== 0) $display("FAIL clr_n fell with no clock edge: q=%b, expected 0 at once", q);\n    clr_n = 1; #1;\n    clk = 1; #1; clk = 0; #1;\n    if (q !== 1) $display("FAIL rising edge with d=1: q=%b, expected 1", q);\n    d = 0; #1;\n    if (q !== 1) $display("FAIL d changed with no edge: q=%b, expected 1 (hold)", q);\n    clk = 1; #1; clk = 0; #1;\n    if (q !== 0) $display("FAIL rising edge with d=0: q=%b, expected 0", q);\n    d = 1; clr_n = 0; #1;\n    clk = 1; #1; clk = 0; #1;\n    if (q !== 0) $display("FAIL rising edge while clr_n=0: q=%b, expected 0 (clear wins)", q);\n    clr_n = 1; #1;\n    if (q !== 0) $display("FAIL clr_n released, no edge yet: q=%b, expected 0", q);\n    $display("DONE");\n  end\nendmodule',
    pass: 'DONE',
    text: ['Write a rising-edge D flip-flop with an active-low asynchronous clear: clr_n = 0 makes q = 0 at once, whatever the clock does; otherwise q takes d at each rising edge of clk.'],
    hints: ['The clear must wake the always block by itself, so it belongs in the sensitivity list.', 'always @(posedge clk or negedge clr_n), then test the clear first.', 'always @(posedge clk or negedge clr_n) if (!clr_n) q <= 0; else q <= d;'],
    solution: 'module dffc(input clk, input d, input clr_n, output reg q);\n  always @(posedge clk or negedge clr_n)\n    if (!clr_n) q <= 0;\n    else q <= d;\nendmodule\n',
    wrong: ['module dffc(input clk, input d, input clr_n, output reg q);\n  always @(posedge clk)\n    if (!clr_n) q <= 0;\n    else q <= d;\nendmodule\n', 'module dffc(input clk, input d, input clr_n, output reg q);\n  always @(posedge clk or negedge clr_n)\n    q <= d;\nendmodule\n'],
  });
  X2({
    id: 'p5x-lab-7474', title: 'The 7474 on the bench', kind: 'lab', lab: 'p5lab-7474',
    text: ['Wire the 7474 experiment on the bench, fill in the observation table, and check.'],
    hints: ['Pin 14 is VCC and pin 7 is GND. Flip-flop 1 uses pins 1 to 6.', 'PRE′ and CLR′ are active low: a switch at 0 presets or clears. The second flip-flop divides by two when its D is fed from its own Q′.', 'Observations, Q and Q′: 1 0; 0 1; 1 1; then D = 0 gives 0 1 after the edge and D = 1 gives 1 0, whatever Q was.'],
    solution: { bench: C.labs.get('p5lab-7474').reference, observe: Object.assign({}, C.labs.get('p5lab-7474').observe.cells) },
    wrong: [{ bench: { chips: C.labs.get('p5lab-7474').reference.chips, jumpers: C.labs.get('p5lab-7474').reference.jumpers.filter((j) => j[0] !== 'clk') } }, { bench: C.labs.get('p5lab-7474').reference, observe: Object.assign({}, C.labs.get('p5lab-7474').observe.cells, { 'both 0|Q′': '0' }) }],
  });
  X2({
    id: 'p5x-lab-7476', title: 'The 7476 on the bench', level: 3, kind: 'lab', lab: 'p5lab-7476',
    text: ['Wire the 7476 experiment, observe the four rows of the JK table from both starting states, and check. Mind the supply pins: 5 and 13.'],
    hints: ['VCC is pin 5 and GND is pin 13 on this chip. Flip-flop 1: CLK pin 1, PRE′ 2, CLR′ 3, J 4, K 16, Q 15, Q′ 14.', 'The 7476 acts on the falling edge. Flip-flop 2 has J = K = 1 and takes its clock from 1Q, so it toggles whenever 1Q falls.', 'From Q = 0 and from Q = 1: JK = 00 gives 0, 1; 01 gives 0, 0; 10 gives 1, 1; 11 gives 1, 0.'],
    solution: { bench: C.labs.get('p5lab-7476').reference, observe: Object.assign({}, C.labs.get('p5lab-7476').observe.cells) },
    wrong: [{ bench: { chips: C.labs.get('p5lab-7476').reference.chips, jumpers: C.labs.get('p5lab-7476').reference.jumpers.slice(1) } }, { bench: C.labs.get('p5lab-7476').reference, observe: Object.assign({}, C.labs.get('p5lab-7476').observe.cells, { '1 1|Q next, from 1': '1' }) }],
  });

  // =========================================================================================================
  // Timing
  // =========================================================================================================
  const X3 = ex('p5-ch-timing');
  const INV3 = "r1 = DFF(r1')\nn1 = NOT(r1)\nn2 = NOT(n1)\nn3 = NOT(n2)\nr2 = DFF(n3)\nQ = r2";
  const PIPE = 'r1 = DFF(A)\nr2 = DFF(B)\ng1 = NAND(r1, r2)\ng2 = NOR(g1, C)\ng3 = XOR(g2, r1)\nr3 = DFF(g3)\nY = r3';
  const CNT3 = 'q0 = TFF(1)\nq1 = TFF(q0)\nt2 = AND(q0, q1)\nq2 = TFF(t2)\nQ0 = q0\nQ1 = q1\nQ2 = q2';
  const CNT4P = 'q0 = TFF(EN)\nt1 = AND(EN, q0)\nq1 = TFF(t1)\nt2 = AND(EN, q0, q1)\nq2 = TFF(t2)\nt3 = AND(EN, q0, q1, q2)\nq3 = TFF(t3)\nQ0 = q0\nQ1 = q1\nQ2 = q2\nQ3 = q3';
  P.inv3 = INV3; P.pipe = PIPE; P.cnt3 = CNT3;
  X3({
    id: 'p5x-tmin-inv', title: 'Three inverters between two flip-flops', level: 1, kind: 'timing', circuit: INV3, tech: 'CMOS', ask: 'tmin',
    text: ['Flip-flop r1 toggles at every edge; its output runs through three inverters to D of r2. With the CMOS preset (clock-to-Q 14 ns, inverter 8 ns, setup 12 ns), what is the minimum clock period, in ns?'],
    hints: ['T(min) = clock-to-Q + slowest path + setup.', 'The path is r1, then three inverters: 14 + 3 × 8 = 38 ns to reach D of r2.', '38 + 12 = 50 ns.'],
    solution: 50, wrong: [38, 26, 62],
  });
  X3({
    id: 'p5x-crit-pipe', title: 'The slowest path to a flip-flop', level: 1, kind: 'timing', circuit: PIPE, tech: 'CMOS', ask: 'critical',
    text: ['Registers r1 and r2 feed a NAND, a NOR and an XOR into register r3 (the input C goes straight into the NOR). With the CMOS preset, when does the slowest change arrive at D of r3, in ns after the clock edge? (Clock-to-Q 14 ns; NAND and NOR 9 ns; XOR 12 ns.)'],
    hints: ['Start from a flip-flop output at clock-to-Q.', 'r1 → NAND → NOR → XOR is the longest chain.', '14 + 9 + 9 + 12 = 44 ns.'],
    solution: 44, wrong: [30, 56],
  });
  X3({
    id: 'p5x-arrival', title: 'Arrival time at an inner gate', kind: 'timing', circuit: PIPE, tech: 'CMOS', ask: 'arrival', net: 'g1.y',
    text: ['In the same circuit (r1 and r2 into a NAND g1, then a NOR g2 with C, then an XOR g3 into r3), at what time after the clock edge is the output of g1 settled, with the CMOS preset?'],
    hints: ['g1 is fed by two flip-flops.', 'Both launch at clock-to-Q, 14 ns, and the NAND adds 9 ns.', '14 + 9 = 23 ns.'],
    solution: 23, wrong: [9, 32],
  });
  X3({
    id: 'p5x-fmax-cnt3', title: 'How fast can a counter count?', kind: 'timing', circuit: CNT3, tech: 'CMOS', ask: 'fmax',
    text: ['A 3-bit synchronous counter from T flip-flops: T0 = 1, T1 = Q0, T2 = Q0·Q1. With the CMOS preset (clock-to-Q 14 ns, AND 10 ns, setup 12 ns), what is its maximum clock frequency, in MHz?'],
    hints: ['The slowest path goes through the AND gate into T2.', 'Period: 14 + 10 + 12 = 36 ns.', '1 / 36 ns = 27.778 MHz.'],
    solution: 27.778, wrong: [41.667, 20.833],
  });
  X3({
    id: 'p5x-fmax-ttl', title: 'The same counter in TTL', kind: 'timing', circuit: CNT3, tech: 'TTL', ask: 'fmax',
    text: ['The same 3-bit counter built with the TTL preset: clock-to-Q 20 ns (its slower edge), AND 17.5 ns, setup 20 ns. What is the maximum clock frequency now, in MHz?'],
    hints: ['Use the slower of each part\'s two delays.', '20 + 17.5 + 20 = 57.5 ns.', '1 / 57.5 ns = 17.391 MHz.'],
    solution: 17.391, wrong: [27.778, 22.222],
  });
  X3({
    id: 'p5x-slack', title: 'Slack at a given clock', kind: 'timing', circuit: P.analysis, tech: 'CMOS', ask: 'slack', period: 60,
    text: ['The analysis circuit: DA = AB′ + X, DB = AX′, Y = AB, built with an inverter for B′ (and one for X′), an AND and an OR. Clocked with a 60 ns period in CMOS, how much slack (ns) does its slowest path have?'],
    hints: ['Slack = period − minimum period.', 'The slowest path: B → NOT → AND → OR into DA: 14 + 8 + 10 + 10 = 42 ns, plus 12 ns setup = 54 ns.', '60 − 54 = 6 ns.'],
    solution: 6, wrong: [18, -6],
  });
  X3({
    id: 'p5x-chain-par', title: 'Chained or parallel carry gates', level: 3, kind: 'timing', circuit: CNT4P, tech: 'CMOS', ask: 'fmax',
    text: ['A 4-bit synchronous counter with enable can form its toggle inputs as a chain (T2 = T1·Q1, T3 = T2·Q2) or in parallel (T2 = EN·Q0·Q1, T3 = EN·Q0·Q1·Q2). The chained form needs a 56 ns period in CMOS. What is the maximum frequency of the parallel form, in MHz? (A CMOS AND takes 10 ns plus 1 ns for each input beyond two.)'],
    hints: ['In the parallel form every T input is one gate away from the flip-flops.', 'The slowest gate is the 4-input AND: 12 ns. Period: 14 + 12 + 12 = 38 ns.', '1 / 38 ns = 26.316 MHz, against 17.857 MHz for the chain.'],
    solution: 26.316, wrong: [17.857, 35.714],
  });
  X3({
    id: 'p5x-skew-setup', title: 'Skew on the setup side', level: 3, kind: 'number', answer: 62, higherLower: true,
    text: ['r1 feeds r2 through seven CMOS inverters (8 ns each). Clock-to-Q is 14 ns and setup 12 ns. The clock reaches r2 20 ns later than r1. What is the minimum clock period, in ns, as far as setup at r2 is concerned?'],
    hints: ['Without skew: 14 + 7 × 8 + 12 = 82 ns.', 'A late clock at the receiving flip-flop gives the data that much more time.', '82 − 20 = 62 ns (the clock-skew topic gives the same with 7 inverters and 2 buffers).'],
    solution: 62, wrong: [82, 102],
  });
  X3({
    id: 'p5x-skew-hold', title: 'How much skew can a short path take?', level: 3, kind: 'number', answer: 19, higherLower: true,
    text: ['r1 feeds r2 through a single CMOS inverter (8 ns). Clock-to-Q is 14 ns and the hold time 3 ns. The clock reaches r2 late by a skew s. What is the largest s, in ns, for which the hold time at r2 is still met?'],
    hints: ['The new data from an edge reaches D2 at 14 + 8 = 22 ns after r1\'s edge.', 'It must not arrive before r2\'s edge (at s) plus the hold time: 22 ≥ s + 3.', 's ≤ 19 ns. Two buffers (20 ns) break it, as the clock-skew topic shows.'],
    solution: 19, wrong: [22, 25],
  });
  X3({
    id: 'p5x-meta-choice', title: 'What a setup violation does', level: 1, kind: 'choice',
    text: ['D changes 2 ns before the rising edge of a flip-flop whose setup time is 12 ns. What can happen?'],
    options: ['Q takes the new value, only later than usual', 'Q keeps the old value, always', 'Q may hang between 0 and 1 for a while and then settle to either value', 'The flip-flop is damaged'],
    answer: 2, whyNot: { 0: 'It might, but nothing guarantees it.', 1: 'It might, but nothing guarantees that either.', 3: 'Nothing is damaged: the trouble is the value and the time it takes to decide.' },
    hints: ['2 ns is inside the setup window.', 'The inner latch may be caught half-way.', 'Metastability: X for a while, then 0 or 1, unpredictably.'],
    solution: 2, wrong: [0, 1],
  });
  X3({
    id: 'p5x-sync-build', title: 'Build a synchroniser', kind: 'circuit', refCircuit: 'q1 = DFF(A)\nq2 = DFF(q1)\nY = q2', inputs: ['A'], outputs: ['Y'], parts: ['DFF'], maxGates: 2,
    text: ['An asynchronous input A must reach the output Y through a two-flip-flop synchroniser. Build it.'],
    hints: ['The first flip-flop samples A.', 'Only the second flip-flop, fed from the first, drives Y.', 'q1 = DFF(A); q2 = DFF(q1); Y = q2.'],
    solution: 'q1 = DFF(A)\nq2 = DFF(q1)\nY = q2',
    wrong: ['q1 = DFF(A)\nY = q1', 'q1 = DFF(A)\nq2 = DFF(A)\nY = q2', 'q1 = DFF(A)\nq2 = DFF(q1)\nq3 = DFF(q2)\nY = q3'],
  });
  X3({
    id: 'p5x-analysis-table', title: 'The state table of a clocked circuit', level: 3, kind: 'fsm', stage: 'table',
    machine: 'moore\ninputs X\noutputs Y\nS00/0: 0 -> S00, 1 -> S10\nS01/0: 0 -> S00, 1 -> S10\nS10/0: 0 -> S11, 1 -> S10\nS11/1: 0 -> S01, 1 -> S10',
    text: ['Two D flip-flops A and B, input X, output Y: DA = AB′ + X, DB = AX′, Y = AB. Write the state table, naming each state by its bits, S00 to S11 (A first), with the output for each state.'],
    hints: ['For D flip-flops A(t+1) = AB′ + X and B(t+1) = AX′.', 'With X = 1, A(t+1) = 1 and B(t+1) = 0 from every state.', 'S00/0: 0 → S00, 1 → S10; S01/0: 0 → S00, 1 → S10; S10/0: 0 → S11, 1 → S10; S11/1: 0 → S01, 1 → S10.'],
    solution: 'moore\ninputs X\noutputs Y\nS00/0: 0 -> S00, 1 -> S10\nS01/0: 0 -> S00, 1 -> S10\nS10/0: 0 -> S11, 1 -> S10\nS11/1: 0 -> S01, 1 -> S10',
    wrong: ['moore\ninputs X\noutputs Y\nS00/0: 0 -> S00, 1 -> S10\nS01/0: 0 -> S00, 1 -> S10\nS10/0: 0 -> S10, 1 -> S10\nS11/1: 0 -> S01, 1 -> S10', 'moore\ninputs X\noutputs Y\nS00/0: 0 -> S00, 1 -> S10\nS01/0: 0 -> S00, 1 -> S10\nS10/0: 0 -> S11, 1 -> S10\nS11/0: 0 -> S01, 1 -> S10'],
  });
  X3({
    id: 'p5x-analysis-wave', title: 'Run the clocked circuit', level: 3, kind: 'waveform', circuit: P.analysis, clocked: true,
    inputs: { X: '10100110' }, outputs: ['Y'], given: { Y: '0???????' },
    text: ['The same circuit (DA = AB′ + X, DB = AX′, Y = AB) starts in state 00. Complete Y, read before each clock edge.'],
    hints: ['Track the state AB slot by slot: Y = 1 only in state 11.', 'States before each edge: 00, 10, 11, 10, 11, 01, 10, 10.', 'Y: 0 0 1 0 1 0 0 0.'],
    solution: { Y: '00101000' },
    wrong: [{ Y: '01010000' }, { Y: '00100000' }],
  });

  // every exercise page, for the diagram checker
  if (S.Checks) for (const x of C.exercises.values()) if (/^p5x-/.test(x.id)) S.Checks.push({ group: 'learn', name: 'p5 exercise ' + x.id, hash: 'exercise=' + x.id, ready: "document.querySelector('#exerciseView')", sel: '#main' });
})(globalThis.Sirkit = globalThis.Sirkit || {});
