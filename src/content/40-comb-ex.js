// Part 4, combinational logic: the exercises and the bench labs. The lessons, the tour and the course are in
// 40-comb.js. Every circuit, function and number here is our own; each answer is checked by the engines.
(function (S) {
  'use strict';
  const C = S.Content;
  if (!C || C.exercises.has('comb-ex-analyse-table')) return;

  // the chapters (40-comb.js registers them too; whichever file loads first makes them)
  C.chapter({ id: 'comb-procedures', part: 'combinational', n: 1, title: 'Analysis, design and code converters', blurb: 'Reading a circuit back to its table, building one from words, and the converters between codes, including a decoder that lights a display.' });
  C.chapter({ id: 'comb-arith', part: 'combinational', n: 2, title: 'Circuits that do arithmetic', blurb: 'Half and full adders, the crawling carry and the lookahead that outruns it, subtraction and overflow, decimal addition, multipliers and comparators.' });
  C.chapter({ id: 'comb-select', part: 'combinational', n: 3, title: 'Decoders, multiplexers and buses', blurb: 'One line out of many and back again, any function from a decoder or a multiplexer, and sharing a wire between drivers.' });

  const ex = (o) => C.exercise(o);
  const bits = (v, n) => v.toString(2).padStart(n, '0');

  // ===========================================================================================================
  // Chapter 1: analysis, design and code converters
  // ===========================================================================================================
  const AN1 = 'n1 = NOR(A, B)\nn2 = AND(A, C)\nF = OR(n1, n2)';
  ex({
    id: 'comb-ex-analyse-table', chapter: 'comb-procedures', title: 'Read a circuit into a table', level: 1, kind: 'truthtable', expr: "A'B' + AC", vars: ['A', 'B', 'C'],
    text: ['Analyse this circuit: label the gate outputs, write each one in terms of A, B and C, and fill in the truth table of F.', { circuit: AN1, outputs: ['F'], caption: 'Click the inputs to try a row, but fill in the table from the equations first.' }],
    hints: ['n1 is a NOR of A and B: it is 1 only when both are 0. So n1 = A′B′.', 'n2 = AC, and F = n1 + n2 = A′B′ + AC.', 'Rows 000 to 111: F = 1, 1, 0, 0, 0, 1, 0, 1. The first two come from A′B′, rows 101 and 111 from AC.'],
    solution: { '000|F': '1', '001|F': '1', '010|F': '0', '011|F': '0', '100|F': '0', '101|F': '1', '110|F': '0', '111|F': '1' },
    wrong: [{ '000|F': '0', '001|F': '0', '010|F': '1', '011|F': '1', '100|F': '0', '101|F': '1', '110|F': '0', '111|F': '1' }, { '000|F': '1', '001|F': '1', '010|F': '0', '011|F': '0', '100|F': '0', '101|F': '1', '110|F': '0', '111|F': '0' }],
  });
  const AN2 = 'nc = NOT(C)\nn1 = NAND(A, nc)\nn2 = NAND(B, C)\nn3 = NAND(A, B)\nF = NAND(n1, n2, n3)';
  ex({
    id: 'comb-ex-analyse-expr', chapter: 'comb-procedures', title: 'Three NANDs into one', level: 2, kind: 'expr', ref: "AC' + BC + AB", vars: ['A', 'B', 'C'], maxLiterals: 4, form: 'sop',
    text: ['Analyse this NAND circuit and write F as a sum of products with at most four literals.', { circuit: AN2, outputs: ['F'] }, 'The straight reading has three product terms. One of them is not needed: find out which, and why.'],
    hints: ['A NAND of NANDs is an OR of ANDs: F = AC′ + BC + AB.', 'Look at AB. When A = B = 1, either C = 0 (so AC′ = 1) or C = 1 (so BC = 1): AB never adds a 1 of its own.', "F = AC′ + BC. AB is the consensus of AC′ and BC, and drops out."],
    solution: "AC' + BC", wrong: ["AC' + BC + AB", 'AB + BC', "AC' + AB"],
    why: 'AB is the consensus term of AC′ and BC: every row it covers is covered already.',
  });
  ex({
    id: 'comb-ex-exactly-two', chapter: 'comb-procedures', title: 'Exactly two of three', level: 2, kind: 'circuit', ref: "ABC' + AB'C + A'BC", inputs: ['A', 'B', 'C'], outputs: ['F'],
    text: ['Three sensors A, B and C watch one machine. The controller trusts a reading only when exactly two of them fire: F = 1 when exactly two inputs are 1, and F = 0 otherwise, including when all three fire.', 'Write the truth table, then build F from AND, OR and NOT gates.'],
    hints: ['Exactly two out of three: the rows 011, 101 and 110.', 'None of the three minterms are neighbours on a map, so F stays as three products.', "F = ABC′ + AB′C + A′BC: three NOT gates, three 3-input ANDs and one 3-input OR."],
    solution: 'na = NOT(A)\nnb = NOT(B)\nnc = NOT(C)\nt1 = AND(A, B, nc)\nt2 = AND(A, nb, C)\nt3 = AND(na, B, C)\nF = OR(t1, t2, t3)',
    wrong: ['t1 = AND(A, B)\nt2 = AND(B, C)\nt3 = AND(A, C)\nF = OR(t1, t2, t3)', 'na = NOT(A)\nnb = NOT(B)\nnc = NOT(C)\nt1 = AND(A, B, nc)\nt2 = AND(A, nb, C)\nF = OR(t1, t2)'],
    why: 'Exactly two is the majority function with the row 111 taken out.',
  });
  ex({
    id: 'comb-ex-mult3-kmap', chapter: 'comb-procedures', title: 'A BCD digit divisible by three', level: 3, kind: 'kmap', vars: ['A', 'B', 'C', 'D'], minterms: [0, 3, 6, 9], dc: [10, 11, 12, 13, 14, 15], form: 'sop',
    text: ['ABCD carries one BCD digit (A the most significant bit). T = 1 when the digit is a multiple of three: 0, 3, 6 or 9. Codes 1010 to 1111 never occur.', 'Circle a minimal sum of products on the map, using the don\'t-cares where they help.'],
    hints: ['The 1s are cells 0, 3, 6 and 9; the don\'t-cares are 10 to 15.', 'Cell 0 has no neighbour that is 1 or a don\'t-care, so it stays alone. Cells 3, 6 and 9 each pair with a don\'t-care: 3 with 11, 6 with 14, 9 with 13.', "T = A′B′C′D′ + B′CD + BCD′ + AD."],
    solution: ['0000', '-011', '-110', '1--1'], wrong: [['0000', '0011', '0110', '1001'], ['-011', '-110', '1--1'], ['0000', '-011', '-110', '1--1', '1-1-']],
  });
  ex({
    id: 'comb-ex-2421-msb', chapter: 'comb-procedures', title: 'BCD to 2421: the top bit', level: 2, kind: 'simplify', vars: ['A', 'B', 'C', 'D'], minterms: [5, 6, 7, 8, 9], dc: [10, 11, 12, 13, 14, 15], form: 'sop', maxLiterals: 5,
    text: ['In the 2421 code the digits 0 to 4 are written as in binary, and 5 to 9 as 1011, 1100, 1101, 1110, 1111. A converter takes a BCD digit ABCD.', 'Its top output bit is 1 for the digits 5 to 9. Write it as a minimal sum of products (codes 10 to 15 are don\'t-cares).'],
    hints: ['The top bit is Σm(5, 6, 7, 8, 9) + d(10, …, 15).', 'With the don\'t-cares, the whole bottom half (A = 1) is one group of eight.', 'A + BD + BC: A covers 8 and 9, BD covers 5 and 7, BC covers 6 and 7.'],
    solution: 'A + BD + BC', wrong: ["AB'C' + A'BD + A'BC", 'A + B', 'A + BCD'],
  });
  const GRAY = 'G3 = B3\nG2 = XOR(B3, B2)\nG1 = XOR(B2, B1)\nG0 = XOR(B1, B0)';
  ex({
    id: 'comb-ex-gray-circuit', chapter: 'comb-procedures', title: 'Binary to Gray, four bits', level: 1, kind: 'circuit', ref: { G3: 'B3', G2: 'B3 ^ B2', G1: 'B2 ^ B1', G0: 'B1 ^ B0' }, inputs: ['B3', 'B2', 'B1', 'B0'], outputs: ['G3', 'G2', 'G1', 'G0'], parts: ['XOR'], maxGates: 3,
    text: ['Build a converter from a 4-bit binary number B3 B2 B1 B0 to its Gray code G3 G2 G1 G0, from at most three XOR gates.'],
    hints: ['The top bit passes straight through: G3 = B3.', 'Every other Gray bit says whether two neighbouring binary bits differ.', 'G3 = B3, G2 = B3 ⊕ B2, G1 = B2 ⊕ B1, G0 = B1 ⊕ B0.'],
    solution: GRAY, wrong: ['G3 = B3\nG2 = XOR(B3, B2)\nG1 = XOR(B3, B1)\nG0 = XOR(B3, B0)', 'G3 = B3\nG2 = B2\nG1 = XOR(B2, B1)\nG0 = XOR(B1, B0)'],
  });
  const G2B = 'B2 = G2\nB1 = XOR(G2, G1)\nB0 = XOR(B1, G0)';
  ex({
    id: 'comb-ex-gray-wave', chapter: 'comb-procedures', title: 'Decode a Gray count', level: 2, kind: 'waveform', circuit: G2B, inputs: { G2: '00001111', G1: '00111100', G0: '01100110' }, outputs: ['B2', 'B1', 'B0'], given: { B2: '0???????', B1: '0???????', B0: '0???????' },
    text: ['This circuit turns a 3-bit Gray code into binary. Each binary bit is the XOR of the bit above it (already converted) with the Gray bit:', { circuit: G2B, outputs: ['B2', 'B1', 'B0'] }, 'The inputs step through the Gray sequence 000, 001, 011, 010, 110, 111, 101, 100. Draw the three outputs.'],
    hints: ['B2 is G2 itself.', 'B1 = G2 ⊕ G1, then B0 = B1 ⊕ G0. Work slot by slot.', 'The outputs count 0, 1, …, 7: B2 = 00001111, B1 = 00110011, B0 = 01010101.'],
    solution: { B2: '00001111', B1: '00110011', B0: '01010101' }, wrong: [{ B2: '00001111', B1: '00111100', B0: '01100110' }, { B2: '00001111', B1: '00110011', B0: '01100110' }],
    why: 'The Gray sequence, decoded, is the plain count 0 to 7.',
  });
  ex({
    id: 'comb-ex-seg-four', chapter: 'comb-procedures', title: 'Which bars make a 4?', level: 1, kind: 'choice', options: ['segment a (top)', 'segment b (top right)', 'segment c (bottom right)', 'segment d (bottom)', 'segment e (bottom left)', 'segment f (top left)', 'segment g (middle)'], answer: [1, 2, 5, 6], solution: [1, 2, 5, 6], wrong: [[1, 2, 6], [0, 1, 2, 5, 6], [1, 2, 4, 6]],
    text: ['A BCD-to-seven-segment decoder receives 0100. Which segments does it light? Pick every one.'],
    hints: ['Draw a 4 with straight bars: two uprights and a crossbar.', 'The right side is b and c; the left upright of a 4 is only the top half, f.', 'b, c, f and g.'],
    whyNot: { 0: 'A 4 is open at the top.', 3: 'A 4 is open at the bottom.', 4: 'The left upright stops at the middle.' },
  });
  ex({
    id: 'comb-ex-seg-c-pos', chapter: 'comb-procedures', title: 'Segment c as one sum', level: 2, kind: 'kmap', vars: ['A', 'B', 'C', 'D'], minterms: [0, 1, 3, 4, 5, 6, 7, 8, 9], dc: [10, 11, 12, 13, 14, 15], form: 'pos',
    text: ['Segment c (bottom right) is lit for every digit except 2. Circle the 0s of its map for a minimal product of sums (codes 10 to 15 are don\'t-cares).'],
    hints: ['Only one cell holds a 0: the digit 2, 0010.', 'Its neighbour 1010 (code 10) is a don\'t-care and can join it; every other neighbour of 0010 is a 1.', 'The group of 0010 and 1010 is B′CD′, so c = (B + C′ + D): one sum term.'],
    solution: ['-010'], wrong: [['0010'], ['--10']],
  });
  ex({
    id: 'comb-ex-xs3-code', chapter: 'comb-procedures', title: 'A digit in excess-3', level: 1, kind: 'convert', op: 'code', value: 7, code: 'excess-3',
    text: ['Write the decimal digit 7 in the excess-3 code.'],
    hints: ['Excess-3 is the binary code of the digit plus three.', '7 + 3 = 10.', '10 in four bits: 1010.'],
    solution: '1010', wrong: ['0111', '0100', '1001'],
  });
  ex({
    id: 'comb-ex-gray-verilog', chapter: 'comb-procedures', title: 'Gray to binary in Verilog', level: 2, kind: 'verilog', module: 'gray2bin', ports: 'input [3:0] g; output [3:0] b', synth: true,
    start: 'module gray2bin(input [3:0] g, output [3:0] b);\n  \nendmodule\n',
    testbench: 'module tb;\n  reg [3:0] g; wire [3:0] b; integer i;\n  gray2bin u(.g(g), .b(b));\n  initial begin\n    for (i = 0; i < 16; i = i + 1) begin\n      g = i ^ (i >> 1); #1;\n      if (b !== i) $display("FAIL g=%b: b=%b, expected %b", g, b, i[3:0]);\n    end\n    $display("done");\n  end\nendmodule',
    pass: 'done',
    text: ['Write gray2bin: b is the binary number whose Gray code is g. The top bit passes through; each lower bit is the XOR of the binary bit above it with its own Gray bit.'],
    hints: ['b[3] = g[3].', 'b[2] = b[3] ^ g[2], b[1] = b[2] ^ g[1], b[0] = b[1] ^ g[0]: four continuous assignments.', 'assign b[3] = g[3]; assign b[2] = b[3] ^ g[2]; assign b[1] = b[2] ^ g[1]; assign b[0] = b[1] ^ g[0];'],
    solution: 'module gray2bin(input [3:0] g, output [3:0] b);\n  assign b[3] = g[3];\n  assign b[2] = b[3] ^ g[2];\n  assign b[1] = b[2] ^ g[1];\n  assign b[0] = b[1] ^ g[0];\nendmodule\n',
    wrong: ['module gray2bin(input [3:0] g, output [3:0] b);\n  assign b = g ^ (g >> 1);\nendmodule\n', 'module gray2bin(input [3:0] g, output [3:0] b);\n  assign b[3] = g[3];\n  assign b[2] = g[3] ^ g[2];\n  assign b[1] = g[2] ^ g[1];\n  assign b[0] = g[1] ^ g[0];\nendmodule\n'],
  });

  // ===========================================================================================================
  // Chapter 2: arithmetic
  // ===========================================================================================================
  ex({
    id: 'comb-ex-fa-table', chapter: 'comb-arith', title: 'The full adder\'s table', level: 1, kind: 'truthtable', outputs: { S: 'A ^ B ^ C', Co: 'AB + AC + BC' }, vars: ['A', 'B', 'C'],
    text: ['A full adder adds three bits A, B and C. Fill in its sum S and its carry Co for every row.'],
    hints: ['Count the 1s in the row: S is that count\'s last binary digit, Co its first.', 'One 1 gives S = 1, Co = 0; two give S = 0, Co = 1; three give S = 1, Co = 1.', 'S = 0 1 1 0 1 0 0 1 and Co = 0 0 0 1 0 1 1 1, rows 000 to 111.'],
    solution: Object.fromEntries([0, 1, 2, 3, 4, 5, 6, 7].flatMap((m) => { const n = (m & 1) + ((m >> 1) & 1) + (m >> 2); return [[bits(m, 3) + '|S', String(n & 1)], [bits(m, 3) + '|Co', String(n >> 1)]]; })),
    wrong: [Object.fromEntries([0, 1, 2, 3, 4, 5, 6, 7].flatMap((m) => { const n = (m & 1) + ((m >> 1) & 1) + (m >> 2); return [[bits(m, 3) + '|S', String(n & 1)], [bits(m, 3) + '|Co', String(n === 3 ? 0 : n >> 1)]]; }))],
  });
  const HA_NAND = 'n1 = NAND(A, B)\nn2 = NAND(A, n1)\nn3 = NAND(B, n1)\nS = NAND(n2, n3)\nC = NAND(n1, n1)';
  ex({
    id: 'comb-ex-ha-nand', chapter: 'comb-arith', title: 'A half adder from NANDs', level: 2, kind: 'circuit', ref: { S: 'A ^ B', C: 'AB' }, inputs: ['A', 'B'], outputs: ['S', 'C'], parts: ['NAND'], maxGates: 5,
    text: ['Build a half adder, S = A ⊕ B and C = AB, from at most five two-input NAND gates.'],
    hints: ['The four-NAND XOR starts with n1 = (AB)′. That gate is half of the carry already.', 'C = AB is n1 inverted, and a NAND with both inputs tied together is an inverter.', 'n1 = NAND(A, B), n2 = NAND(A, n1), n3 = NAND(B, n1), S = NAND(n2, n3), C = NAND(n1, n1).'],
    solution: HA_NAND, wrong: ['n1 = NAND(A, B)\nn2 = NAND(A, n1)\nn3 = NAND(B, n1)\nS = NAND(n2, n3)\nC = n1', 'S = XOR(A, B)\nC = AND(A, B)'],
  });
  const FA_HA = 'h1 = HA(a=A, b=B)\nh2 = HA(a=h1.s, b=C)\nS = h2.s\nCo = OR(h1.c, h2.c)';
  ex({
    id: 'comb-ex-fa-from-ha', chapter: 'comb-arith', title: 'A full adder from two half adders', level: 2, kind: 'circuit', ref: { S: 'A ^ B ^ C', Co: 'AB + AC + BC' }, inputs: ['A', 'B', 'C'], outputs: ['S', 'Co'], parts: ['HA', 'OR'], maxGates: 3,
    text: ['Build a full adder (sum S and carry Co of A, B and C) from two half adders and one OR gate. A half adder has inputs a, b and outputs s, c; write h1.s for its sum.'],
    hints: ['The first half adder adds A and B.', 'The second adds that sum to C. Its sum is S.', 'Either half adder can make the carry, never both: h1 = HA(a=A, b=B), h2 = HA(a=h1.s, b=C), S = h2.s, Co = OR(h1.c, h2.c).'],
    solution: FA_HA, wrong: ['h1 = HA(a=A, b=B)\nh2 = HA(a=h1.s, b=C)\nS = h2.s\nCo = h2.c', 'h1 = HA(a=A, b=B)\nh2 = HA(a=h1.s, b=C)\nS = h2.s\nCo = OR(h1.s, h2.c)'],
    why: 'The two carries can never both be 1: if A = B = 1, the first sum is 0 and the second half adder cannot carry.',
  });
  const RIP4 = 'f0 = FA(a=A0, b=B0, cin=C0)\nf1 = FA(a=A1, b=B1, cin=f0.cout)\nf2 = FA(a=A2, b=B2, cin=f1.cout)\nf3 = FA(a=A3, b=B3, cin=f2.cout)\nS0 = f0.s\nS1 = f1.s\nS2 = f2.s\nS3 = f3.s\nC4 = f3.cout';
  ex({
    id: 'comb-ex-ripple-time', chapter: 'comb-arith', title: 'How long does the carry crawl?', level: 2, kind: 'timing', circuit: RIP4, outputs: ['S0', 'S1', 'S2', 'S3', 'C4'], tech: 'CMOS', ask: 'critical',
    text: ['A 4-bit ripple-carry adder is four full adders in a chain. With the CMOS preset, a full adder takes 24 ns from any input to either output.', 'The carry enters at C0 and leaves at C4; the circuit is drawn below.', 'How long (ns) does the slowest path from an input to an output take?'],
    hints: ['The slowest path starts at C0 (or at A0, B0) and passes through every full adder.', 'Each full adder in the chain waits for the carry of the one before it.', 'Four full adders at 24 ns each: 96 ns.'],
    solution: 96, wrong: [24, 48, 192],
  });
  ex({
    id: 'comb-ex-cla-proof', chapter: 'comb-arith', title: 'Unroll a lookahead carry', level: 2, kind: 'proof', start: 'G2 + P2(G1 + P1(G0 + P0C0))', goal: 'G2 + P2G1 + P2P1G0 + P2P1P0C0', laws: ['distributive'], maxSteps: 4,
    text: ['The carry into bit 3 of an adder is C3 = G2 + P2C2, with C2 = G1 + P1C1 and C1 = G0 + P0C0. Substituted, that is G2 + P2(G1 + P1(G0 + P0C0)).', 'Prove that it equals the two-level lookahead form G2 + P2G1 + P2P1G0 + P2P1P0C0, one distributive step at a time.'],
    hints: ['Start inside: P1(G0 + P0C0) = P1G0 + P1P0C0.', 'Then P2 multiplies the whole bracket G1 + P1G0 + P1P0C0.', 'G2 + P2(G1 + P1G0 + P1P0C0) ; distributive, then G2 + P2G1 + P2P1G0 + P2P1P0C0 ; distributive.'],
    solution: [{ expr: 'G2 + P2(G1 + P1G0 + P1P0C0)', law: 'distributive' }, { expr: 'G2 + P2G1 + P2P1G0 + P2P1P0C0', law: 'distributive' }],
    wrong: ['G2 + P2G1 + P2P1G0 + P2P1P0C0 ; complement', 'G2 + P2G1 + P2P1G0 ; distributive', 'G2 + P2(G1 + P1G0 + P0C0) ; distributive'],
  });
  ex({
    id: 'comb-ex-cla-c4', chapter: 'comb-arith', title: 'The carry out of four bits', level: 1, kind: 'expr', ref: 'G3 + P3G2 + P3P2G1 + P3P2P1G0 + P3P2P1P0C0', vars: ['C0', 'G0', 'P0', 'G1', 'P1', 'G2', 'P2', 'G3', 'P3'],
    text: ['Write C4, the carry out of a 4-bit lookahead adder, as a sum of products of the generate signals G0 … G3, the propagate signals P0 … P3 and the carry in C0.'],
    hints: ['A carry comes out of bit 3 if bit 3 generates one, or propagates one that came into it.', 'Follow the pattern: C4 = G3 + P3C3, and C3 has four terms of its own.', 'C4 = G3 + P3G2 + P3P2G1 + P3P2P1G0 + P3P2P1P0C0.'],
    solution: 'G3 + P3G2 + P3P2G1 + P3P2P1G0 + P3P2P1P0C0', wrong: ['G3 + P3G2 + P3P2G1 + P3P2P1G0', 'G3 + G2 + G1 + G0 + P3P2P1P0C0', 'G3P3 + G2P2 + G1P1 + G0P0'],
  });
  const ADDSUB2 = 'x0 = XOR(B0, M)\nx1 = XOR(B1, M)\nf0 = FA(a=A0, b=x0, cin=M)\nf1 = FA(a=A1, b=x1, cin=f0.cout)\nS0 = f0.s\nS1 = f1.s\nCo = f1.cout';
  ex({
    id: 'comb-ex-addsub', chapter: 'comb-arith', title: 'A 2-bit adder–subtractor', level: 3, kind: 'circuit', inputs: ['A1', 'A0', 'B1', 'B0', 'M'], outputs: ['S1', 'S0', 'Co'], parts: ['FA', 'XOR'], maxGates: 4,
    ref: { S0: 'A0 ^ B0', S1: "A1 ^ B1 ^ M ^ (A0(B0 ^ M) + M(A0 + (B0 ^ M)))", Co: "A1(B1 ^ M) + (A0(B0 ^ M) + M(A0 + (B0 ^ M)))(A1 + (B1 ^ M))" },
    text: ['Build a 2-bit adder–subtractor from two full adders and two XOR gates. With M = 0 it adds: S1 S0 = A1 A0 + B1 B0, with the carry out Co. With M = 1 it subtracts by adding the two\'s complement: A1 A0 + B1′ B0′ + 1, again with Co the carry out of the top full adder.', 'A full adder has inputs a, b, cin and outputs s, cout.'],
    hints: ['XOR with M passes B through when M = 0 and inverts it when M = 1.', 'The "+ 1" of the two\'s complement goes in as the carry into the bottom full adder: M itself.', 'x0 = XOR(B0, M), x1 = XOR(B1, M), f0 = FA(a=A0, b=x0, cin=M), f1 = FA(a=A1, b=x1, cin=f0.cout); S0 = f0.s, S1 = f1.s, Co = f1.cout.'],
    solution: ADDSUB2, wrong: [ADDSUB2.replace('cin=M', 'cin=0'), 'f0 = FA(a=A0, b=B0, cin=M)\nf1 = FA(a=A1, b=B1, cin=f0.cout)\nS0 = f0.s\nS1 = f1.s\nCo = f1.cout'],
  });
  ex({
    id: 'comb-ex-overflow-pick', chapter: 'comb-arith', title: 'Which sums overflow?', level: 1, kind: 'choice', options: ['0101 + 0100', '1100 + 0011', '1011 + 1010', '0110 + 1110'], answer: [0, 2], solution: [0, 2], wrong: [[0], [0, 2, 3], [1, 3]],
    text: ['These are 4-bit two\'s complement numbers, which hold −8 to +7. Which of the additions overflow? Pick every one.'],
    hints: ['Overflow is only possible when both numbers have the same sign.', '0101 + 0100 is 5 + 4; 1011 + 1010 is −5 + (−6).', '5 + 4 = 9 and −5 − 6 = −11 are both out of range; the other two mix signs and cannot overflow.'],
    whyNot: { 1: '−4 + 3 = −1 fits.', 3: '6 + (−2) = 4 fits; adding numbers of opposite signs never overflows.' },
  });
  ex({
    id: 'comb-ex-overflow-circuit', chapter: 'comb-arith', title: 'An overflow detector', level: 2, kind: 'circuit', ref: "A3B3S3' + A3'B3'S3", inputs: ['A3', 'B3', 'S3'], outputs: ['V'],
    text: ['A 4-bit adder adds two\'s complement numbers. Build the overflow flag V from the sign bits alone: A3 and B3 (the signs of the numbers) and S3 (the sign of the sum).'],
    hints: ['Overflow happens when both numbers have the same sign and the sum has the other one.', 'Two positives giving a negative: A3′B3′S3. Two negatives giving a positive: A3B3S3′.', "V = A3B3S3′ + A3′B3′S3."],
    solution: 'n3 = NOT(S3)\nna = NOT(A3)\nnb = NOT(B3)\nt1 = AND(A3, B3, n3)\nt2 = AND(na, nb, S3)\nV = OR(t1, t2)',
    wrong: ['V = XOR(A3, S3)', 't = XOR(A3, B3)\nV = XOR(t, S3)'],
  });
  ex({
    id: 'comb-ex-bcd-detect', chapter: 'comb-arith', title: 'When does a BCD sum need +6?', level: 1, kind: 'simplify', vars: ['Z3', 'Z2', 'Z1', 'Z0'], minterms: [10, 11, 12, 13, 14, 15], form: 'sop', maxLiterals: 4,
    text: ['A BCD adder first adds two digits in binary, giving Z3 Z2 Z1 Z0 and a carry. Leaving the carry aside, the sum needs correcting when Z3 Z2 Z1 Z0 is 1010 to 1111. Write that condition with at most four literals.'],
    hints: ['The six codes 10 to 15 all have Z3 = 1.', 'Among the codes with Z3 = 1, the ones that do not need correcting are 8 and 9: 100x.', 'Z3Z2 + Z3Z1.'],
    solution: 'Z3Z2 + Z3Z1', wrong: ['Z3', 'Z3Z2Z1', 'Z2 + Z1'],
  });
  ex({
    id: 'comb-ex-bcd-sum', chapter: 'comb-arith', title: 'Correct a BCD sum', level: 1, kind: 'string', answer: ['1 0011', '10011', '1,0011'],
    text: ['Add the BCD digits 0111 and 0110. The binary sum is 1101. Correct it to BCD and write the result as the carry digit and the four-bit digit, like 1 0101.'],
    hints: ['1101 is 13, more than 9: it needs correcting.', 'Add 0110: 1101 + 0110 = 1 0011.', 'Carry 1, digit 0011: 7 + 6 = 13.'],
    solution: '1 0011', wrong: ['1101', '0 1101', '1 0111'],
    whyNot: 'A BCD digit stops at 9. A binary sum above 9 gets 0110 added, and the carry out of that addition is the tens digit.',
  });
  const MUL2 = 't0 = AND(A0, B0)\nt1 = AND(A1, B0)\nt2 = AND(A0, B1)\nt3 = AND(A1, B1)\nh1 = HA(a=t1, b=t2)\nh2 = HA(a=t3, b=h1.c)\nP0 = t0\nP1 = h1.s\nP2 = h2.s\nP3 = h2.c';
  ex({
    id: 'comb-ex-mul2', chapter: 'comb-arith', title: 'A 2 × 2 multiplier', level: 2, kind: 'circuit', ref: { P0: 'A0B0', P1: 'A1B0 ^ A0B1', P2: "A1B1(A0B0)'", P3: 'A1A0B1B0' }, inputs: ['A1', 'A0', 'B1', 'B0'], outputs: ['P3', 'P2', 'P1', 'P0'], parts: ['AND', 'HA'], maxGates: 6,
    text: ['Build a multiplier for two 2-bit numbers, P3 P2 P1 P0 = A1 A0 × B1 B0, from AND gates and half adders (inputs a, b; outputs s, c), at most six parts in all.'],
    hints: ['Each bit of B times each bit of A is an AND: four partial products.', 'P0 = A0B0. The two partial products of weight 2, A1B0 and A0B1, go into a half adder: its sum is P1.', 'A second half adder adds A1B1 to that carry: its sum is P2 and its carry P3.'],
    solution: MUL2, wrong: [MUL2.replace('P2 = h2.s', 'P2 = t3'), 't0 = AND(A0, B0)\nt1 = AND(A1, B0)\nt2 = AND(A0, B1)\nt3 = AND(A1, B1)\nP0 = t0\nP1 = OR(t1, t2)\nP2 = t3\nP3 = 0'],
  });
  ex({
    id: 'comb-ex-cmp-eq', chapter: 'comb-arith', title: 'Are two pairs of bits equal?', level: 1, kind: 'circuit', ref: "(A1 ^ B1)'(A0 ^ B0)'", inputs: ['A1', 'A0', 'B1', 'B0'], outputs: ['EQ'], parts: ['XNOR', 'AND'], maxGates: 3,
    text: ['Build EQ = 1 when the 2-bit numbers A1 A0 and B1 B0 are equal, from XNOR and AND gates (at most three).'],
    hints: ['An XNOR gives 1 when its two inputs are equal.', 'The numbers are equal when the top bits match and the bottom bits match.', 'e1 = XNOR(A1, B1), e0 = XNOR(A0, B0), EQ = AND(e1, e0).'],
    solution: 'e1 = XNOR(A1, B1)\ne0 = XNOR(A0, B0)\nEQ = AND(e1, e0)', wrong: ['e1 = XNOR(A1, B0)\ne0 = XNOR(A0, B1)\nEQ = AND(e1, e0)', 'e1 = XNOR(A1, B1)\ne0 = XNOR(A0, B0)\nEQ = XNOR(e1, e0)'],
  });
  ex({
    id: 'comb-ex-cmp-gt', chapter: 'comb-arith', title: 'Is A bigger? Two bits', level: 3, kind: 'circuit', ref: "A1B1' + (A1 ^ B1)'A0B0'", inputs: ['A1', 'A0', 'B1', 'B0'], outputs: ['GT'],
    text: ['Build GT = 1 when the 2-bit number A1 A0 is greater than B1 B0. Compare from the top, as a comparator does.'],
    hints: ['If the top bits differ, they decide: A wins when A1 = 1 and B1 = 0.', 'If the top bits are equal, the bottom bits decide in the same way.', "GT = A1B1′ + (A1 ⊙ B1)A0B0′, where ⊙ is XNOR."],
    solution: 'nb1 = NOT(B1)\nnb0 = NOT(B0)\nt1 = AND(A1, nb1)\ne1 = XNOR(A1, B1)\nt0 = AND(e1, A0, nb0)\nGT = OR(t1, t0)',
    wrong: ['nb1 = NOT(B1)\nnb0 = NOT(B0)\nt1 = AND(A1, nb1)\nt0 = AND(A0, nb0)\nGT = OR(t1, t0)', 'nb1 = NOT(B1)\nGT = AND(A1, nb1)'],
  });
  ex({
    id: 'comb-ex-cmp-verilog', chapter: 'comb-arith', title: 'A comparator in Verilog', level: 2, kind: 'verilog', module: 'cmp4', ports: 'input [3:0] a, b; output gt, eq, lt', synth: true,
    start: 'module cmp4(input [3:0] a, input [3:0] b, output gt, output eq, output lt);\n  \nendmodule\n',
    testbench: 'module tb;\n  reg [3:0] a, b; wire gt, eq, lt; integer i;\n  cmp4 u(.a(a), .b(b), .gt(gt), .eq(eq), .lt(lt));\n  initial begin\n    for (i = 0; i < 256; i = i + 1) begin\n      {a, b} = i; #1;\n      if ({gt, eq, lt} !== {a > b, a == b, a < b}) $display("FAIL a=%d b=%d: gt=%b eq=%b lt=%b", a, b, gt, eq, lt);\n    end\n    $display("done");\n  end\nendmodule',
    pass: 'done',
    text: ['Write cmp4, a 4-bit unsigned magnitude comparator: exactly one of gt (a > b), eq (a = b) and lt (a < b) is 1.'],
    hints: ['Verilog\'s relational operators compare unsigned vectors directly.', 'Three continuous assignments, one per output.', 'assign gt = a > b; assign eq = a == b; assign lt = a < b;'],
    solution: 'module cmp4(input [3:0] a, input [3:0] b, output gt, output eq, output lt);\n  assign gt = a > b;\n  assign eq = a == b;\n  assign lt = a < b;\nendmodule\n',
    wrong: ['module cmp4(input [3:0] a, input [3:0] b, output gt, output eq, output lt);\n  assign gt = a >= b;\n  assign eq = a == b;\n  assign lt = a < b;\nendmodule\n', 'module cmp4(input [3:0] a, input [3:0] b, output gt, output eq, output lt);\n  assign gt = a[3] & ~b[3];\n  assign eq = a == b;\n  assign lt = a[3] < b[3];\nendmodule\n'],
  });

  // ===========================================================================================================
  // Chapter 3: decoders, multiplexers and buses
  // ===========================================================================================================
  const DEC_FN = 'd = DECODER[k=3](a2=A, a1=B, a0=C)\nF1 = OR(d.y0, d.y3, d.y5, d.y6)\nF2 = OR(d.y1, d.y2, d.y7)';
  ex({
    id: 'comb-ex-dec-fn', chapter: 'comb-select', title: 'Two functions from one decoder', level: 2, kind: 'circuit',
    ref: { F1: "A'B'C' + A'BC + AB'C + ABC'", F2: "A'B'C + A'BC' + ABC" }, inputs: ['A', 'B', 'C'], outputs: ['F1', 'F2'], parts: ['DECODER', 'OR'], maxGates: 3,
    text: ['Build F1 = Σm(0, 3, 5, 6) and F2 = Σm(1, 2, 7) from one 3-to-8 decoder (address a2 a1 a0, outputs y0 … y7, active high) and OR gates. A is the most significant bit.', 'Write a decoder as d = DECODER[k=3](a2=A, a1=B, a0=C) and its outputs as d.y0, d.y1, …'],
    hints: ['Each decoder output is one minterm: d.y5 is 1 exactly when ABC = 101.', 'A function is the OR of the outputs of its minterms.', 'F1 = OR(d.y0, d.y3, d.y5, d.y6) and F2 = OR(d.y1, d.y2, d.y7).'],
    solution: DEC_FN, wrong: ['d = DECODER[k=3](a2=C, a1=B, a0=A)\nF1 = OR(d.y0, d.y3, d.y5, d.y6)\nF2 = OR(d.y1, d.y2, d.y7)', 'd = DECODER[k=3](a2=A, a1=B, a0=C)\nF1 = OR(d.y0, d.y3, d.y5, d.y6)\nF2 = OR(d.y1, d.y2, d.y6)'],
    why: 'F1 is 1 for the rows with an even number of 1s: it is the complement of A ⊕ B ⊕ C.',
  });
  ex({
    id: 'comb-ex-dec-active-low', chapter: 'comb-select', title: 'Active-low outputs', level: 1, kind: 'choice', options: ['an OR gate', 'an AND gate', 'a NAND gate', 'a NOR gate'], answer: 2, solution: 2, wrong: [0, 1, 3],
    text: ['A decoder with active-low outputs pulls exactly one output to 0 and leaves the others at 1. To make F = Σm(1, 4, 6), you collect Y1′, Y4′ and Y6′ in one gate. Which gate gives F?'],
    hints: ['F must be 1 when any of the three lines is 0.', 'A gate whose output is 1 when any input is 0…', 'is a NAND gate: NAND(Y1′, Y4′, Y6′) = Y1 + Y4 + Y6.'],
    whyNot: { 0: 'An OR of active-low lines is 1 almost always: it is 0 only when all three are 0, which never happens.', 1: 'An AND gives 0 when any line is low: that is F′, not F.', 3: 'A NOR is 1 only when all inputs are 0.' },
  });
  const DEC_TREE = 'na = NOT(A)\nlo = DECODER[k=2, en](a1=B, a0=C, en=na)\nhi = DECODER[k=2, en](a1=B, a0=C, en=A)\nD0 = lo.y0\nD1 = lo.y1\nD2 = lo.y2\nD3 = lo.y3\nD4 = hi.y0\nD5 = hi.y1\nD6 = hi.y2\nD7 = hi.y3';
  const minterm3 = (m) => ['A', 'B', 'C'].map((v, i) => ((m >> (2 - i)) & 1 ? v : v + "'")).join('');
  ex({
    id: 'comb-ex-dec-tree', chapter: 'comb-select', title: 'A 3-to-8 decoder from two 2-to-4s', level: 3, kind: 'circuit',
    ref: Object.fromEntries([0, 1, 2, 3, 4, 5, 6, 7].map((m) => ['D' + m, minterm3(m)])), inputs: ['A', 'B', 'C'], outputs: ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'], parts: ['DECODER', 'NOT'], maxGates: 3,
    text: ['Build a 3-to-8 decoder (outputs D0 … D7, A the most significant address bit) from two 2-to-4 decoders with an enable input and one inverter.', 'Write a 2-to-4 decoder with enable as lo = DECODER[k=2, en](a1=B, a0=C, en=…).'],
    hints: ['B and C go to both decoders; A chooses which one is enabled.', 'The decoder enabled when A = 0 makes D0 … D3; the one enabled when A = 1 makes D4 … D7.', 'na = NOT(A); lo = DECODER[k=2, en](a1=B, a0=C, en=na); hi = DECODER[k=2, en](a1=B, a0=C, en=A); D0 … D3 = lo.y0 … lo.y3, D4 … D7 = hi.y0 … hi.y3.'],
    solution: DEC_TREE, wrong: [DEC_TREE.replace('en=na)', 'en=TMP)').replace('en=A)', 'en=na)').replace('en=TMP)', 'en=A)'), 'lo = DECODER[k=2, en](a1=B, a0=C, en=A)\nhi = DECODER[k=2, en](a1=B, a0=C, en=A)\nD0 = lo.y0\nD1 = lo.y1\nD2 = lo.y2\nD3 = lo.y3\nD4 = hi.y0\nD5 = hi.y1\nD6 = hi.y2\nD7 = hi.y3'],
  });
  ex({
    id: 'comb-ex-prienc-y0', chapter: 'comb-select', title: 'A priority encoder\'s low bit', level: 2, kind: 'simplify', vars: ['D3', 'D2', 'D1', 'D0'], minterms: [2, 3, 8, 9, 10, 11, 12, 13, 14, 15], form: 'sop', maxLiterals: 3,
    text: ['A 4-input priority encoder outputs the number Y1 Y0 of the highest-numbered input that is 1 (D3 has the highest priority). Write Y0 as a minimal sum of products of D3, D2, D1 and D0.'],
    hints: ['Y0 = 1 when the winner is input 1 or input 3.', 'Input 3 wins whenever D3 = 1. Input 1 wins when D3 = D2 = 0 and D1 = 1.', "Y0 = D3 + D3′D2′D1, and the D3′ is not needed: Y0 = D3 + D2′D1."],
    solution: "D3 + D2'D1", wrong: ['D3 + D1', "D3 + D3'D2'D1 + D0", "D3D2' + D1"],
  });
  const MUX_FN = 'nc = NOT(C)\nF = MUX[n=4](d0=nc, d1=1, d2=C, d3=0, s1=A, s0=B)';
  ex({
    id: 'comb-ex-mux-fn', chapter: 'comb-select', title: 'Three variables, one 4-to-1 multiplexer', level: 2, kind: 'circuit', vars: ['A', 'B', 'C'], minterms: [0, 2, 3, 5], inputs: ['A', 'B', 'C'], outputs: ['F'], parts: ['MUX', 'NOT'], maxGates: 2,
    text: ['Build F(A, B, C) = Σm(0, 2, 3, 5) from one 4-to-1 multiplexer and at most one inverter. A and B drive the select lines (s1 = A, s0 = B); each data input gets 0, 1, C or C′.', 'Write the multiplexer as F = MUX[n=4](d0=…, d1=…, d2=…, d3=…, s1=A, s0=B).'],
    hints: ['Split the table into four pairs of rows, one per value of AB. In each pair, F is 0, 1, C or C′.', 'AB = 00: rows 0 and 1, F = 1 then 0, so C′. AB = 01: rows 2 and 3, both 1.', 'AB = 10: rows 4 and 5, F = 0 then 1, so C. AB = 11: both 0. d0 = C′, d1 = 1, d2 = C, d3 = 0.'],
    solution: MUX_FN, wrong: ['nc = NOT(C)\nF = MUX[n=4](d0=C, d1=1, d2=nc, d3=0, s1=A, s0=B)', 'nc = NOT(C)\nF = MUX[n=4](d0=nc, d1=1, d2=C, d3=0, s1=B, s0=A)'],
  });
  const MUX8_FN = 'nd = NOT(D)\nF = MUX[n=8](d0=1, d1=0, d2=D, d3=1, d4=0, d5=nd, d6=nd, d7=D, s2=A, s1=B, s0=C)';
  ex({
    id: 'comb-ex-mux-4var', chapter: 'comb-select', title: 'Four variables, one 8-to-1 multiplexer', level: 3, kind: 'circuit', vars: ['A', 'B', 'C', 'D'], minterms: [0, 1, 5, 6, 7, 10, 12, 15], inputs: ['A', 'B', 'C', 'D'], outputs: ['F'], parts: ['MUX', 'NOT'], maxGates: 2,
    text: ['Build F(A, B, C, D) = Σm(0, 1, 5, 6, 7, 10, 12, 15) from one 8-to-1 multiplexer (selects s2 = A, s1 = B, s0 = C) and at most one inverter.'],
    hints: ['Each data input covers two rows that differ only in D: d3 covers minterms 6 and 7.', 'Pairs: (0, 1) both 1; (2, 3) both 0; (4, 5) 0 then 1; (6, 7) both 1.', '(8, 9) both 0; (10, 11) 1 then 0; (12, 13) 1 then 0; (14, 15) 0 then 1. So d0 … d7 = 1, 0, D, 1, 0, D′, D′, D.'],
    solution: MUX8_FN, wrong: ['nd = NOT(D)\nF = MUX[n=8](d0=1, d1=0, d2=nd, d3=1, d4=0, d5=D, d6=D, d7=nd, s2=A, s1=B, s0=C)', 'nd = NOT(D)\nF = MUX[n=8](d0=1, d1=0, d2=D, d3=1, d4=0, d5=nd, d6=nd, d7=D, s2=C, s1=B, s0=A)'],
  });
  ex({
    id: 'comb-ex-mux-verilog', chapter: 'comb-select', title: 'A 4-to-1 multiplexer in Verilog', level: 1, kind: 'verilog', module: 'mux4', ports: 'input [3:0] d; input [1:0] s; output y', synth: true,
    start: 'module mux4(input [3:0] d, input [1:0] s, output reg y);\n  always @(*)\n    \nendmodule\n',
    testbench: 'module tb;\n  reg [3:0] d; reg [1:0] s; wire y; integer i;\n  mux4 u(.d(d), .s(s), .y(y));\n  initial begin\n    for (i = 0; i < 64; i = i + 1) begin\n      {s, d} = i; #1;\n      if (y !== d[s]) $display("FAIL d=%b s=%d: y=%b, expected %b", d, s, y, d[s]);\n    end\n    $display("done");\n  end\nendmodule',
    pass: 'done',
    text: ['Write mux4: y is the data bit d[s] chosen by the 2-bit select s. Use a case statement inside always @(*).'],
    hints: ['A case on s with four arms, one per select value.', 'Every arm assigns y, so no latch is inferred.', 'case (s) 2\'d0: y = d[0]; 2\'d1: y = d[1]; 2\'d2: y = d[2]; default: y = d[3]; endcase'],
    solution: 'module mux4(input [3:0] d, input [1:0] s, output reg y);\n  always @(*)\n    case (s)\n      2\'d0: y = d[0];\n      2\'d1: y = d[1];\n      2\'d2: y = d[2];\n      default: y = d[3];\n    endcase\nendmodule\n',
    wrong: ['module mux4(input [3:0] d, input [1:0] s, output reg y);\n  always @(*)\n    case (s)\n      2\'d0: y = d[0];\n      2\'d1: y = d[2];\n      2\'d2: y = d[1];\n      default: y = d[3];\n    endcase\nendmodule\n', 'module mux4(input [3:0] d, input [1:0] s, output reg y);\n  always @(*)\n    case (s)\n      2\'d0: y = d[0];\n      2\'d1: y = d[1];\n      2\'d2: y = d[2];\n    endcase\nendmodule\n'],
  });
  const DEMUX = 'dm = DEMUX[n=4](d=D, s1=S1, s0=S0)\nY0 = dm.y0\nY1 = dm.y1\nY2 = dm.y2\nY3 = dm.y3';
  ex({
    id: 'comb-ex-demux-wave', chapter: 'comb-select', title: 'Where does the data go?', level: 1, kind: 'waveform', circuit: DEMUX, inputs: { S1: '00001111', S0: '00110011', D: '10110110' }, outputs: ['Y0', 'Y1', 'Y2', 'Y3'], given: { Y0: '1???????' },
    text: ['A 1-to-4 demultiplexer sends its data input D to the output numbered by S1 S0; the other outputs are 0. Draw the four outputs for the eight slots.'],
    hints: ['In the first two slots S1 S0 = 00, so Y0 follows D and the rest are 0.', 'Then S1 S0 = 01 for two slots (Y1 follows D), 10 for two (Y2), 11 for two (Y3).', 'Y0 = 10000000, Y1 = 00110000, Y2 = 00000100, Y3 = 00000010.'],
    solution: { Y0: '10000000', Y1: '00110000', Y2: '00000100', Y3: '00000010' }, wrong: [{ Y0: '11000000', Y1: '00110000', Y2: '00001100', Y3: '00000011' }, { Y0: '10000000', Y1: '00110000', Y2: '00000010', Y3: '00000100' }],
  });
  ex({
    id: 'comb-ex-bus-fight', chapter: 'comb-select', title: 'Two drivers on one wire', level: 1, kind: 'choice', options: ['1, because the first driver was enabled first', '0, because 0 always wins', 'Z, because the drivers cancel', 'X: the two drivers fight, and the level is unknown'], answer: 3, solution: 3, wrong: [0, 1, 2],
    text: ['Two tristate buffers share a bus wire. Both are enabled at once: one drives 1 and the other drives 0. What does the wire carry?'],
    hints: ['An enabled tristate buffer drives its output hard, high or low.', 'Two hard drivers that disagree short the supply to ground through their output transistors.', 'The level is neither 0 nor 1: the simulator shows X (contention). Only one buffer may be enabled at a time.'],
    whyNot: { 0: 'Nothing on a wire remembers which driver came first.', 1: 'With equal drivers neither wins, and real parts may be damaged.', 2: 'Z means nobody drives the wire; here two do.' },
  });
  const MUX41 = 'n1 = NOT(S1)\nn0 = NOT(S0)\na0 = AND(I0, n1, n0)\na1 = AND(I1, n1, S0)\na2 = AND(I2, S1, n0)\na3 = AND(I3, S1, S0)\nY = OR(a0, a1, a2, a3)';
  ex({
    id: 'comb-ex-mux-time', chapter: 'comb-select', title: 'How fast is a multiplexer?', level: 2, kind: 'timing', circuit: MUX41, outputs: ['Y'], tech: 'CMOS', ask: 'critical',
    text: ['A 4-to-1 multiplexer built from gates: two inverters for the selects, four 3-input AND gates and a 4-input OR gate.', 'With the CMOS preset (inverter 8 ns, 3-input AND 11 ns, 4-input OR 12 ns), how long (ns) does the slowest path from an input to Y take?'],
    hints: ['A data input passes through one AND and the OR.', 'A select input may pass through an inverter first.', 'S1 → NOT → AND → OR: 8 + 11 + 12 = 31 ns.'],
    solution: 31, wrong: [23, 19, 43],
  });

  // ===========================================================================================================
  // The bench labs
  // ===========================================================================================================
  const LED = (k) => 'led' + k;
  // ---- a 74283 adding two 4-bit numbers set on the switches ----
  const ADDER_BOARD = {
    chips: [{ id: 'U1', num: '74283', col: 20 }], clockHz: 1,
    jumpers: [['20a', 'Rtp20', 'red'], ['27j', 'Rbn27', 'black'], ['26j', 'Rbn26', 'black'],
      ['sw0', '24j', 'yellow'], ['sw1', '22j', 'yellow'], ['sw2', '22a', 'yellow'], ['sw3', '24a', 'yellow'],
      ['sw4', '25j', 'orange'], ['sw5', '21j', 'orange'], ['sw6', '21a', 'orange'], ['sw7', '25a', 'orange'],
      ['23j', LED(0), 'green'], ['20j', LED(1), 'green'], ['23b', LED(2), 'green'], ['26a', LED(3), 'green'], ['27a', LED(4), 'blue']],
  };
  const swv = (env, ks) => ks.reduce((a, k, i) => a + (env[k] << i), 0);
  const sumOf = (env) => swv(env, ['S0', 'S1', 'S2', 'S3']) + swv(env, ['S4', 'S5', 'S6', 'S7']);
  const ADD_ROWS = [[5, 3], [9, 7], [15, 1]];
  const addRow = ([a, b]) => a + '+' + b;
  C.lab({
    id: 'comb-lab-adder', chapter: 'comb-arith', title: 'A 4-bit adder on one chip',
    aim: 'Wire a 74283 to add two 4-bit numbers set on the switches, read the sum and the carry on the LEDs, and see that its carry out is the fifth bit of the sum.',
    parts: ['74283'],
    steps: ['Place the 74283 with pin 1 at column 20. Power it: pin 16 (VCC) to +5 V, pin 8 (GND) to ground.', 'The carry in C0 (pin 7) is not used: tie it to ground.', 'Number A: S0 → A1 (pin 5), S1 → A2 (pin 3), S2 → A3 (pin 14), S3 → A4 (pin 12). Number B: S4 → B1 (pin 6), S5 → B2 (pin 2), S6 → B3 (pin 15), S7 → B4 (pin 11). S0 and S4 are the low bits.', 'Sum to the LEDs: S1 (pin 4) → LED 0, S2 (pin 1) → LED 1, S3 (pin 13) → LED 2, S4 (pin 10) → LED 3, and the carry C4 (pin 9) → LED 4.', 'Set each pair of numbers in the table (the low bits on S0 and S4) and write down C4 and the four sum bits.'],
    observe: { rows: ['C4', 'S4', 'S3', 'S2', 'S1'], cols: ADD_ROWS.map(addRow), corner: 'Bit', cellKind: 'bit', cells: Object.fromEntries(ADD_ROWS.flatMap((r) => { const s = r[0] + r[1]; return [['C4', 4], ['S4', 3], ['S3', 2], ['S2', 1], ['S1', 0]].map(([c, k]) => [c + '|' + addRow(r), String((s >> k) & 1)]); })) },
    checks: [{ kind: 'power' }, { kind: 'truth', inputs: ['S7', 'S6', 'S5', 'S4', 'S3', 'S2', 'S1', 'S0'], outputs: { led0: (e) => sumOf(e) & 1, led1: (e) => (sumOf(e) >> 1) & 1, led2: (e) => (sumOf(e) >> 2) & 1, led3: (e) => (sumOf(e) >> 3) & 1, led4: (e) => (sumOf(e) >> 4) & 1 } }],
    reference: ADDER_BOARD,
  });
  // ---- a 74138 and two gate chips making a full adder ----
  const DEC_BOARD = {
    chips: [{ id: 'U1', num: '74138', col: 8 }, { id: 'U2', num: '7408', col: 20 }, { id: 'U3', num: '7400', col: 30 }], clockHz: 1,
    jumpers: [['8a', 'Rtp8', 'red'], ['15j', 'Rbn15', 'black'], ['11j', 'Rbn11', 'black'], ['12j', 'Rbn13', 'black'], ['13j', 'Rbp13', 'red'],
      ['sw0', '8j', 'yellow'], ['sw1', '9j', 'yellow'], ['sw2', '10j', 'yellow'],
      ['10a', '20j', 'blue'], ['11a', '21j', 'blue'], ['13a', '23j', 'blue'], ['14j', '24j', 'blue'],
      ['12a', '25a', 'orange'], ['14a', '24a', 'orange'], ['15a', '22a', 'orange'], ['14i', '21a', 'orange'],
      ['20b', 'Rtp20', 'red'], ['26j', 'Rbn26', 'black'],
      ['22j', '30j', 'green'], ['25j', '31j', 'green'], ['32j', LED(0), 'green'],
      ['26a', '33j', 'white'], ['23a', '34j', 'white'], ['35j', LED(1), 'white'],
      ['30b', 'Rtp29', 'red'], ['36j', 'Rbn37', 'black'], ['31a', 'Rtn31', 'black'], ['32a', 'Rtn32', 'black'], ['34a', 'Rtn34', 'black'], ['35a', 'Rtn35', 'black']],
  };
  C.lab({
    id: 'comb-lab-decoder', chapter: 'comb-select', title: 'A full adder from a decoder',
    aim: 'Use a 74138 decoder to make every minterm of three switches, and collect them into the sum and the carry of a full adder. The decoder\'s outputs are active low, so each OR of minterms becomes a NAND of its lines.',
    parts: ['74138', '7408', '7400'],
    steps: ['Place the 74138 at column 8, the 7408 at column 20 and the 7400 at column 30, and power all three.', 'Enable the decoder: G1 (pin 6) high, G2A′ (pin 4) and G2B′ (pin 5) low.', 'Address: S0 → A (pin 1, the low bit), S1 → B (pin 2), S2 → C (pin 3).', 'Sum = Σm(1, 2, 4, 7): AND Y1′ with Y2′ and Y4′ with Y7′ in the 7408, then NAND the two results in the 7400 and take it to LED 0.', 'Carry = Σm(3, 5, 6, 7): AND Y3′ with Y5′ and Y6′ with Y7′, NAND the two results and take it to LED 1.', 'Tie the inputs of the two unused NAND gates to ground. Step through the eight switch settings and fill in the table.'],
    observe: { inputs: ['S2', 'S1', 'S0'], outputs: ['led0', 'led1'] },
    checks: [{ kind: 'power' }, { kind: 'truth', inputs: ['S2', 'S1', 'S0'], outputs: { led0: 'S0 ^ S1 ^ S2', led1: 'S0S1 + S0S2 + S1S2' } }],
    reference: DEC_BOARD,
  });
  // ---- a 74151 as a 4-bit prime detector ----
  const MUX_BOARD = {
    chips: [{ id: 'U1', num: '74151', col: 10 }], clockHz: 1,
    jumpers: [['10a', 'Rtp10', 'red'], ['17j', 'Rbn17', 'black'], ['16j', 'Rbn16', 'black'], ['13j', 'Rbn13', 'black'], ['12j', 'Rbp13', 'red'], ['11a', 'Rtn11', 'black'], ['14a', 'Rtn14', 'black'],
      ['sw0', '11j', 'yellow'], ['11i', '10j', 'yellow'], ['11h', '12b', 'yellow'], ['12c', '13c', 'yellow'],
      ['sw1', '15a', 'orange'], ['sw2', '16a', 'orange'], ['sw3', '17a', 'orange'],
      ['14j', LED(0), 'green'], ['15j', LED(1), 'blue']],
  };
  const PRIMES = [2, 3, 5, 7, 11, 13];
  const val4 = (e) => e.S3 * 8 + e.S2 * 4 + e.S1 * 2 + e.S0;
  C.lab({
    id: 'comb-lab-mux', chapter: 'comb-select', title: 'A prime detector from one multiplexer',
    aim: 'Make P = 1 for the primes 2, 3, 5, 7, 11 and 13 among the numbers 0 to 15 with a single 74151: three bits drive the select lines and each data input gets 0, 1 or the fourth bit.',
    parts: ['74151'],
    steps: ['Place the 74151 at column 10 and power it. Enable it: G′ (pin 7) to ground.', 'The number is S3 S2 S1 S0. Select lines: S3 → C (pin 9), S2 → B (pin 10), S1 → A (pin 11).', 'Work out each data input from the pairs of rows (2k, 2k + 1): D0 = 0, D1 = 1, D2 = S0, D3 = S0, D4 = 0, D5 = S0, D6 = S0, D7 = 0.', 'Wire S0 to D2 (pin 2), and from there to D3 (pin 1), D5 (pin 14) and D6 (pin 13). Tie D0, D4 and D7 to ground and D1 to +5 V.', 'Y (pin 5) → LED 0 is P; W (pin 6), its complement, → LED 1. Step through all sixteen numbers.'],
    observe: { inputs: ['S3', 'S2', 'S1', 'S0'], outputs: ['led0', 'led1'] },
    checks: [{ kind: 'power' }, { kind: 'truth', inputs: ['S3', 'S2', 'S1', 'S0'], outputs: { led0: (e) => (PRIMES.includes(val4(e)) ? 1 : 0), led1: (e) => (PRIMES.includes(val4(e)) ? 0 : 1) } }],
    reference: MUX_BOARD,
  });
  // ---- a 7485 comparing two 4-bit numbers ----
  const CMP_BOARD = {
    chips: [{ id: 'U1', num: '7485', col: 10 }], clockHz: 1,
    jumpers: [['10a', 'Rtp10', 'red'], ['17j', 'Rbn17', 'black'], ['11j', 'Rbn11', 'black'], ['12j', 'Rbp11', 'red'], ['13j', 'Rbn13', 'black'],
      ['sw0', '16a', 'yellow'], ['sw1', '14a', 'yellow'], ['sw2', '13a', 'yellow'], ['sw3', '11a', 'yellow'],
      ['sw4', '17a', 'orange'], ['sw5', '15a', 'orange'], ['sw6', '12a', 'orange'], ['sw7', '10j', 'orange'],
      ['14j', LED(0), 'green'], ['15j', LED(1), 'blue'], ['16j', LED(2), 'white']],
  };
  const aOf = (e) => swv(e, ['S0', 'S1', 'S2', 'S3']), bOf = (e) => swv(e, ['S4', 'S5', 'S6', 'S7']);
  const CMP_ROWS = [[11, 9], [6, 6], [7, 8], [12, 3], [0, 15]];
  const cmpRow = ([a, b]) => 'A = ' + bits(a, 4) + ', B = ' + bits(b, 4);
  C.lab({
    id: 'comb-lab-compare', chapter: 'comb-arith', title: 'Comparing two numbers with a 7485',
    aim: 'Wire a 7485 magnitude comparator to compare A (S3 … S0) with B (S7 … S4) and show A > B, A = B and A < B on three LEDs; see why its cascade inputs must say "equal" when it stands alone.',
    parts: ['7485'],
    steps: ['Place the 7485 at column 10 and power it (pin 16 VCC, pin 8 GND).', 'A single comparator has no lower stage, so its cascade inputs say "equal so far": A=B in (pin 3) high, A>B in (pin 4) and A<B in (pin 2) low.', 'A: S0 → A0 (pin 10), S1 → A1 (pin 12), S2 → A2 (pin 13), S3 → A3 (pin 15). B: S4 → B0 (pin 9), S5 → B1 (pin 11), S6 → B2 (pin 14), S7 → B3 (pin 1).', 'Outputs: A>B (pin 5) → LED 0, A=B (pin 6) → LED 1, A<B (pin 7) → LED 2.', 'Set the pairs in the table and record the three LEDs. Then try A = B with the A=B input pulled low instead: what happens?'],
    observe: { rows: CMP_ROWS.map(cmpRow), cols: ['A>B', 'A=B', 'A<B'], corner: 'Numbers', cellKind: 'bit', cells: Object.fromEntries(CMP_ROWS.flatMap((r) => [[cmpRow(r) + '|A>B', r[0] > r[1] ? '1' : '0'], [cmpRow(r) + '|A=B', r[0] === r[1] ? '1' : '0'], [cmpRow(r) + '|A<B', r[0] < r[1] ? '1' : '0']])) },
    checks: [{ kind: 'power' }, { kind: 'truth', inputs: ['S7', 'S6', 'S5', 'S4', 'S3', 'S2', 'S1', 'S0'], outputs: { led0: (e) => (aOf(e) > bOf(e) ? 1 : 0), led1: (e) => (aOf(e) === bOf(e) ? 1 : 0), led2: (e) => (aOf(e) < bOf(e) ? 1 : 0) } }],
    reference: CMP_BOARD,
  });
  // ---- a 7447 driving the seven-segment display ----
  const SEG_BOARD = {
    chips: [{ id: 'U1', num: '7447', col: 30 }], clockHz: 1, segLow: true,
    jumpers: [['30a', 'Rtp29', 'red'], ['37j', 'Rbn37', 'black'], ['32j', 'Rbp32', 'red'], ['33j', 'Rbp33', 'red'], ['34j', 'Rbp34', 'red'],
      ['sw0', '36j', 'yellow'], ['sw1', '30j', 'yellow'], ['sw2', '31j', 'yellow'], ['sw3', '35j', 'yellow'],
      ['33a', 'seg-a', 'green'], ['34a', 'seg-b', 'green'], ['35a', 'seg-c', 'green'], ['36a', 'seg-d', 'green'], ['37a', 'seg-e', 'green'], ['31a', 'seg-f', 'green'], ['32a', 'seg-g', 'green']],
  };
  const SEGS = 'abcdefg'.split('');
  // what the chip lights for each code, from its own table: a lit segment's output pulls low (0), a dark one floats (Z)
  const segLit = (v, s) => (S.LabChips.SEG[v] >> SEGS.indexOf(s)) & 1;
  const SHOWN = [6, 7, 9];
  C.lab({
    id: 'comb-lab-display', chapter: 'comb-procedures', title: 'A 7447 drives a seven-segment display',
    aim: 'Wire a 7447 decoder/driver between four switches and a common-anode seven-segment display, read which bars it lights for each BCD digit, and find the two digits it draws differently from a calculator.',
    parts: ['7447'],
    steps: ['Place the 7447 at column 30 and power it (pin 16 VCC, pin 8 GND).', 'Hold the three control inputs high so they do nothing: lamp test LT′ (pin 3), blanking BI′/RBO′ (pin 4) and ripple blanking RBI′ (pin 5).', 'The digit: S0 → A (pin 7, the low bit), S1 → B (pin 1), S2 → C (pin 2), S3 → D (pin 6).', 'Segments: a (pin 13), b (12), c (11), d (10), e (9), f (15), g (14), each to its bar of the display. The outputs pull low to light a bar, so tick "common anode" in the bench\'s panel.', 'Step through the digits 0 to 9 and watch the display. For the digits 6, 7 and 9, mark each lit bar with 1 in the table (one column per digit). Look closely at 6 and 9. Then try the codes 10 to 15.'],
    observe: { rows: SEGS, cols: SHOWN.map(String), corner: 'Bar', cellKind: 'bit', cells: Object.fromEntries(SHOWN.flatMap((d) => SEGS.map((s) => [s + '|' + d, String(segLit(d, s))]))) },
    checks: [{ kind: 'power' }, { kind: 'truth', inputs: ['S3', 'S2', 'S1', 'S0'], outputs: Object.fromEntries(SEGS.map((s) => ['seg-' + s, (e) => (segLit(val4(e), s) ? '0' : 'z')])) }],
    reference: SEG_BOARD,
  });

  // ---- the lab exercises ----
  const obsOf = (lab) => { const sp = S.Check.tableSpec({ table: 'labobs', lab: C.labs.get(lab) }); return Object.assign({}, sp.expected); };
  const labEx = (o) => {
    const ref = C.labs.get(o.lab).reference;
    const observe = obsOf(o.lab);
    const k0 = Object.keys(observe)[0];
    ex(Object.assign({ kind: 'lab', level: 2,
      solution: { bench: ref, observe },
      wrong: [{ bench: { chips: ref.chips, jumpers: ref.jumpers.slice(1), segLow: ref.segLow } }, { bench: ref, observe: Object.assign({}, observe, { [k0]: observe[k0] === '1' ? '0' : '1' }) }].concat(o.wrongBoards || []),
    }, o));
  };
  const cut = (board, from) => ({ chips: board.chips, segLow: board.segLow, jumpers: board.jumpers.filter((j) => j[0] !== from) });
  labEx({
    id: 'comb-ex-lab-adder', chapter: 'comb-arith', title: 'The 74283 on the bench', lab: 'comb-lab-adder',
    text: ['Do the experiment on the bench: wire the 74283, fill in the observations, and check.'],
    hints: ['Power first: pin 16 to +5 V and pin 8 to ground. An unpowered chip does nothing at all.', 'The 74283 numbers its bits 1 to 4, not 0 to 3: A1 and B1 are the low bits. Leave no input open, and that includes C0.', 'The reference board: 74283 at column 20; S0–S3 to A1–A4 (pins 5, 3, 14, 12), S4–S7 to B1–B4 (pins 6, 2, 15, 11), pin 7 to ground, sum pins 4, 1, 13, 10 to LEDs 0–3 and C4 (pin 9) to LED 4.'],
    wrongBoards: [{ bench: cut(ADDER_BOARD, '26j') }],
  });
  labEx({
    id: 'comb-ex-lab-decoder', chapter: 'comb-select', title: 'The decoder full adder on the bench', lab: 'comb-lab-decoder', level: 3,
    text: ['Build the full adder from a 74138, a 7408 and a 7400 on the bench, fill in its truth table, and check.'],
    hints: ['A 74138 with any enable wrong keeps every output high, and then both NANDs read 0.', 'Active-low lines: an AND of two of them is 0 when either line is active, and the NAND of two such ANDs is 1 when any of the four lines is active.', 'Sum = NAND(AND(Y1′, Y2′), AND(Y4′, Y7′)) on LED 0; carry = NAND(AND(Y3′, Y5′), AND(Y6′, Y7′)) on LED 1. Y7′ goes to two AND gates.'],
    wrongBoards: [{ bench: cut(DEC_BOARD, '13j') }],
  });
  labEx({
    id: 'comb-ex-lab-mux', chapter: 'comb-select', title: 'The prime detector on the bench', lab: 'comb-lab-mux',
    text: ['Build the 74151 prime detector on the bench, fill in its table for all sixteen numbers, and check.'],
    hints: ['G′ is active low: with it high the 74151 holds Y at 0 whatever the selects say.', 'The rows pair up as (0, 1), (2, 3), … (14, 15). In the pair (4, 5) only 5 is prime, so D2 = S0.', 'D0, D4, D7 to ground; D1 to +5 V; D2, D3, D5, D6 to S0. Selects C, B, A from S3, S2, S1. Y to LED 0 and W to LED 1.'],
    wrongBoards: [{ bench: cut(MUX_BOARD, '12c') }],
  });
  labEx({
    id: 'comb-ex-lab-compare', chapter: 'comb-arith', title: 'The 7485 on the bench', lab: 'comb-lab-compare',
    text: ['Wire the 7485 comparator on the bench, fill in the observations, and check.'],
    hints: ['A comparator\'s cascade inputs are inputs like any other: left open, they float.', 'Alone, the 7485 must be told that the bits below it are equal: A=B in high, the other two low.', 'Reference: 7485 at column 10, pin 3 high, pins 2 and 4 low; S0–S3 to pins 10, 12, 13, 15; S4–S7 to pins 9, 11, 14, 1; pins 5, 6, 7 to LEDs 0, 1, 2.'],
    wrongBoards: [{ bench: cut(CMP_BOARD, '12j') }],
  });
  labEx({
    id: 'comb-ex-lab-display', chapter: 'comb-procedures', title: 'The 7447 and the display on the bench', lab: 'comb-lab-display',
    text: ['Wire the 7447 to the display, record which bars light for each digit, and check.'],
    hints: ['The 7447 lights a bar by pulling it low. With the display set to common cathode nothing seems to work.', 'LT′, BI′ and RBI′ must be held high. A low lamp test lights every bar; a low blanking input darkens them all.', 'Reference: 7447 at column 30, pins 3, 4, 5 high; S0–S3 to pins 7, 1, 2, 6; pins 13, 12, 11, 10, 9, 15, 14 to bars a to g. The 7447 draws 6 without the top bar and 9 without the bottom bar.'],
    wrongBoards: [{ bench: cut(SEG_BOARD, '32j') }],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
