// Part 8, memory and programmable logic: the exercises. The chapters, lessons, labs, tour and course are in
// 80-memory.js; this file loads first, so it registers the chapters too (a chapter registered twice is merged).
// Every word, address, code word and function here is our own, and every number was read off the engines.
(function (S) {
  'use strict';
  const C = S.Content;
  if (!C || C.exercises.has('mem-ex-address-bits')) return;
  S.MemContent = S.MemContent || {};
  const M = S.MemContent;

  M.chapters = function () {
    C.chapter({ id: 'mem-ram', part: 'memory', n: 1, title: 'Random-access memory', blurb: 'Words in rows, a decoder that picks one, read and write cycles in time, two-dimensional decoding and bigger memories built from small chips.' });
    C.chapter({ id: 'mem-ecc', part: 'memory', n: 2, title: 'Memory that corrects itself', blurb: 'Hamming codes: check bits stored beside the data, a syndrome that names the flipped bit, and SEC-DED, which also catches two.' });
    C.chapter({ id: 'mem-pld', part: 'memory', n: 3, title: 'ROM and programmable logic', blurb: 'A ROM as a truth table, the kinds of ROM, PLA and PAL arrays, and the look-up tables and routing of an FPGA.' });
  };
  M.chapters();

  const ex = (o) => C.exercise(Object.assign({ level: 2 }, o));

  // ---- the bench boards of the two labs (wired and checked on the bench's own simulator) ----------------------------
  M.SELECT_BOARD = {
    chips: [{ id: 'U1', num: '74138', col: 20 }], sw: [0, 0, 0, 1, 0, 0, 0, 0], clockHz: 1,
    jumpers: [['20a', 'Rtp20', 'red'], ['27j', 'Rbn27', 'black'], ['23j', 'Rbn23', 'black'], ['24j', 'Rbn25', 'black'], ['sw0', '20j', 'yellow'], ['sw1', '21j', 'yellow'], ['sw2', '22j', 'yellow'], ['sw3', '25j', 'yellow'],
      ['21a', 'led0', 'green'], ['22a', 'led1', 'green'], ['23a', 'led2', 'green'], ['24a', 'led3', 'green'], ['25a', 'led4', 'green'], ['26a', 'led5', 'green'], ['27a', 'led6', 'green'], ['26j', 'led7', 'green']],
  };
  M.SYNDROME_BOARD = {
    chips: [{ id: 'U1', num: '7486', col: 6 }, { id: 'U2', num: '7486', col: 16 }, { id: 'U3', num: '74138', col: 28 }], clockHz: 1,
    jumpers: [['6a', 'Rtp7', 'red'], ['16a', 'Rtp16', 'red'], ['28a', 'Rtp28', 'red'], ['33j', 'Rbp33', 'red'], ['12j', 'Rbn13', 'black'], ['22j', 'Rbn22', 'black'], ['35j', 'Rbn35', 'black'], ['31j', 'Rbn31', 'black'], ['32j', 'Rbn32', 'black'],
      ['sw0', '6j', 'yellow'], ['sw2', '7j', 'yellow'], ['7i', '17j', 'blue'], ['sw4', '9j', 'yellow'], ['9i', '20a', 'blue'], ['sw6', '10j', 'yellow'], ['10i', '7a', 'blue'], ['sw5', '8a', 'yellow'], ['sw1', '16j', 'yellow'], ['sw3', '21a', 'yellow'],
      ['8j', '11a', 'blue'], ['11j', '10a', 'blue'], ['12a', '28j', 'blue'], ['9a', '20j', 'blue'], ['20i', '17a', 'blue'], ['18j', '19j', 'blue'], ['21j', '29j', 'blue'], ['22a', '18a', 'blue'], ['19a', '30j', 'blue'],
      ['29a', 'led0', 'green'], ['30a', 'led1', 'green'], ['31a', 'led2', 'green'], ['32a', 'led3', 'green'], ['33a', 'led4', 'green'], ['34a', 'led5', 'green'], ['35a', 'led6', 'green'], ['34j', 'led7', 'green']],
  };

  // =========================================================================================================
  // Chapter 1: random-access memory
  // =========================================================================================================
  ex({
    id: 'mem-ex-address-bits', chapter: 'mem-ram', title: 'How many address lines?', level: 1, kind: 'number', answer: 12, higherLower: true,
    text: ['A memory holds 4096 words of 8 bits. How many address lines does it need?'],
    hints: ['k address lines can name 2ᵏ different words.', 'Find the power of two that equals 4096. The word width (8 bits) does not matter here.', '2¹² = 4096, so 12 address lines.'],
    solution: 12, wrong: [4096, 8, 11],
    why: 'The width of a word sets the number of data lines, not address lines.',
  });
  ex({
    id: 'mem-ex-word-decoder', chapter: 'mem-ram', title: 'Word lines from an address', level: 1, kind: 'circuit',
    ref: { W0: "E A1' A0'", W1: "E A1' A0", W2: "E A1 A0'", W3: 'E A1 A0' }, inputs: ['A1', 'A0', 'E'], outputs: ['W0', 'W1', 'W2', 'W3'], parts: ['AND', 'NOT'],
    text: ['A tiny RAM has four words. Build its word-line decoder from AND gates and inverters: exactly one of W0 to W3 is 1, the one numbered by A1 A0, and only while the enable E is 1. With E = 0 every word line is 0, so no word is touched.'],
    hints: ['Each word line is one AND gate with three inputs: E and the two address bits, each either true or complemented.', 'W2 is numbered 10: A1 true, A0 complemented. Two inverters give A1′ and A0′ for all four gates.', "na = NOT(A1), nb = NOT(A0); W0 = AND(E, na, nb), W1 = AND(E, na, A0), W2 = AND(E, A1, nb), W3 = AND(E, A1, A0)."],
    solution: 'na = NOT(A1)\nnb = NOT(A0)\nW0 = AND(E, na, nb)\nW1 = AND(E, na, A0)\nW2 = AND(E, A1, nb)\nW3 = AND(E, A1, A0)',
    wrong: ['na = NOT(A1)\nnb = NOT(A0)\nW0 = AND(na, nb)\nW1 = AND(na, A0)\nW2 = AND(A1, nb)\nW3 = AND(A1, A0)', 'na = NOT(A1)\nnb = NOT(A0)\nW0 = AND(E, na, nb)\nW1 = AND(E, A1, nb)\nW2 = AND(E, na, A0)\nW3 = AND(E, A1, A0)'],
  });
  ex({
    id: 'mem-ex-decoder-delay', chapter: 'mem-ram', title: 'How soon does a word line rise?', kind: 'timing', tech: 'CMOS', ask: 'critical',
    circuit: 'na = NOT(A1)\nnb = NOT(A0)\nW0 = AND(E, na, nb)\nW1 = AND(E, na, A0)\nW2 = AND(E, A1, nb)\nW3 = AND(E, A1, A0)',
    text: ['The four-word decoder of the previous exercise is built with the CMOS preset delays. How long (ns) does its slowest path, from an input to a word line, take? Every read and write of the RAM waits at least this long for its word line.'],
    hints: ['The paths through an inverter are the long ones: an address bit, its inverter, then a 3-input AND.', 'Add the inverter delay and the 3-input AND delay; the paths straight from E pass through the AND alone.', 'An inverter and a 3-input AND: 19 ns in all.'],
    solution: 19, wrong: [12, 38],
  });
  ex({
    id: 'mem-ex-ram-wave', chapter: 'mem-ram', title: 'Reading what was written', level: 3, kind: 'waveform', clocked: true,
    circuit: 'm = RAM[aw=1, dw=1, sync=true](a=A, din=D, we=WE)\nQ = m',
    inputs: { A: '01011001', D: '10010010', WE: '11010100' }, outputs: ['Q'], given: { Q: '0???????' },
    text: ['A two-word RAM, one bit per word, both words 0 at the start. It writes D into word A at the rising clock edge of a cycle in which WE = 1, and its output Q always shows the word that A names (read before the edge). Fill in Q for the eight cycles.'],
    hints: ['Keep a little table of the two words, and update it only at the end of a cycle with WE = 1.', 'Cycle 1 writes 1 into word 0; cycle 2 reads word 1 (still 0) and writes 0 into it; cycle 3 reads word 0, which is now 1.', 'Q = 0 0 1 0 1 1 0 1. Word 1 becomes 1 in cycle 4, word 0 goes back to 0 in cycle 6.'],
    solution: { Q: '00101101' }, wrong: [{ Q: '10010010' }, { Q: '01011010' }, { Q: '0010' }],
  });
  ex({
    id: 'mem-ex-ram-verilog', chapter: 'mem-ram', title: 'A RAM in Verilog', level: 3, kind: 'verilog', module: 'ram4x4', ports: 'input clk, we, [1:0] addr, [3:0] din; output [3:0] dout',
    start: 'module ram4x4(input clk, input we, input [1:0] addr, input [3:0] din, output [3:0] dout);\n  \nendmodule\n',
    testbench: 'module tb;\n  reg clk, we; reg [1:0] addr; reg [3:0] din, want; wire [3:0] dout; integer i;\n  ram4x4 u(.clk(clk), .we(we), .addr(addr), .din(din), .dout(dout));\n  initial begin\n    clk = 0; we = 1;\n    for (i = 0; i < 4; i = i + 1) begin\n      addr = i; din = 4\'b1001 ^ (i * 3);\n      #1 clk = 1; #1 clk = 0;\n    end\n    we = 0;\n    for (i = 0; i < 4; i = i + 1) begin\n      addr = i; din = 4\'b0000; want = 4\'b1001 ^ (i * 3);\n      #1 clk = 1; #1 clk = 0; #1;\n      if (dout !== want) $display("FAIL read with we=0 at addr=%0d: dout=%b, expected %b", i, dout, want);\n    end\n    we = 1; addr = 2; din = 4\'b0110; #1;\n    if (dout !== 4\'b1111) $display("FAIL addr=2 before the clock edge: dout=%b, expected the old word 1111 (a write waits for the edge)", dout);\n    #1 clk = 1; #1 clk = 0; #1;\n    if (dout !== 4\'b0110) $display("FAIL addr=2 after writing 0110: dout=%b", dout);\n  end\nendmodule',
    text: ['Write ram4x4: four words of four bits. At each rising edge of clk with we = 1, din is written into the word addr names. dout always shows the word at addr, with no clock needed for a read.'],
    hints: ['Declare the storage as an array of registers: reg [3:0] mem [0:3];', 'Writes belong in always @(posedge clk), guarded by if (we); the read is a continuous assignment.', 'reg [3:0] mem [0:3]; always @(posedge clk) if (we) mem[addr] <= din; assign dout = mem[addr];'],
    solution: 'module ram4x4(input clk, input we, input [1:0] addr, input [3:0] din, output [3:0] dout);\n  reg [3:0] mem [0:3];\n  always @(posedge clk)\n    if (we) mem[addr] <= din;\n  assign dout = mem[addr];\nendmodule\n',
    wrong: ['module ram4x4(input clk, input we, input [1:0] addr, input [3:0] din, output [3:0] dout);\n  reg [3:0] mem [0:3];\n  always @(posedge clk)\n    mem[addr] <= din;\n  assign dout = mem[addr];\nendmodule\n',
      'module ram4x4(input clk, input we, input [1:0] addr, input [3:0] din, output [3:0] dout);\n  reg [3:0] mem [0:3];\n  always @(posedge clk)\n    if (we) mem[addr] <= din;\n  assign dout = mem[0];\nendmodule\n'],
  });
  ex({
    id: 'mem-ex-coincident-lines', chapter: 'mem-ram', title: 'Decoder outputs in a square', level: 1, kind: 'number', answer: 64, higherLower: true,
    text: ['A memory of 1024 one-bit cells is laid out as a 32 × 32 square with a row decoder and a column decoder. How many decoder output lines are there in all? (A single decoder for all the cells would need 1024.)'],
    hints: ['32 rows need a 5-to-32 decoder; 32 columns need another.', 'Add the two decoders\' outputs.', '32 + 32 = 64 lines, against 1024 for one big decoder.'],
    solution: 64, wrong: [1024, 32, 10],
  });
  ex({
    id: 'mem-ex-coincident-row', chapter: 'mem-ram', title: 'Which row, which column?', kind: 'number', answer: 6,
    text: ['64 cells sit in an 8 × 8 square. The high three address bits pick the row and the low three the column. Cell 50 is selected: which row line does the row decoder raise?'],
    hints: ['Write 50 in six bits.', '50 = 110010: the high half is 110, the low half 010.', 'Row 110 = 6 (and column 010 = 2).'],
    solution: 6, wrong: [2, 50, 3],
  });
  ex({
    id: 'mem-ex-chips-needed', chapter: 'mem-ram', title: 'Counting chips', level: 1, kind: 'number', answer: 8, higherLower: true,
    text: ['How many 256 × 4 RAM chips does a 1K × 8 memory need (1K = 1024 words)?'],
    hints: ['Width first: two 4-bit chips side by side make one 8-bit word.', 'Depth: 1024 / 256 = 4 rows of chips.', '2 chips per row × 4 rows = 8 chips.'],
    solution: 8, wrong: [4, 2, 16],
  });
  ex({
    id: 'mem-ex-select-kmap', chapter: 'mem-ram', title: 'A chip select from a K-map', kind: 'kmap', vars: ['A', 'B', 'C', 'D'], minterms: [4, 5, 6, 7, 12, 13], form: 'sop',
    text: ['A small computer has a 16-region address map; the top four address bits are A B C D. A peripheral chip must be selected in regions 4, 5, 6, 7, 12 and 13. Circle a minimal sum of products for its chip select.'],
    hints: ['Regions 4–7 are one row of the map: A = 0, B = 1.', 'Regions 12 and 13 sit below 4 and 5: the four cells 4, 5, 12, 13 make a group with B = 1, C = 0.', "A′B (4, 5, 6, 7) and BC′ (4, 5, 12, 13): CS = A′B + BC′."],
    solution: ['01--', '-10-'], wrong: [['01--', '110-'], ['01--', '-10-', '0-1-']],
  });
  ex({
    id: 'mem-ex-chip-selects', chapter: 'mem-ram', title: 'Four chips, one decoder', kind: 'circuit',
    ref: { CS0: "E A5' A4'", CS1: "E A5' A4", CS2: "E A5 A4'", CS3: 'E A5 A4' }, inputs: ['A5', 'A4', 'E'], outputs: ['CS0', 'CS1', 'CS2', 'CS3'], parts: ['DECODER'],
    text: ['A 64-word memory is made of four 16-word chips. Address bits A3–A0 go to every chip; the top bits A5 A4 must pick one chip, and only while the memory is being used (E = 1). Build the four chip selects CS0 (words 0–15) to CS3 (words 48–63) from one decoder with an enable.'],
    hints: ['A 2-to-4 decoder has address inputs a1 (high) and a0 (low) and an enable: DECODER[k=2, en=true].', 'Words 16–31 have A5 A4 = 01, so they belong to output y1. A5 is the high address bit.', 'd = DECODER[k=2, en=true](a1=A5, a0=A4, en=E); CS0 = d.y0, CS1 = d.y1, CS2 = d.y2, CS3 = d.y3.'],
    solution: 'd = DECODER[k=2, en=true](a1=A5, a0=A4, en=E)\nCS0 = d.y0\nCS1 = d.y1\nCS2 = d.y2\nCS3 = d.y3',
    wrong: ['d = DECODER[k=2, en=true](a1=A4, a0=A5, en=E)\nCS0 = d.y0\nCS1 = d.y1\nCS2 = d.y2\nCS3 = d.y3', 'd = DECODER[k=2](a1=A5, a0=A4)\nCS0 = d.y0\nCS1 = d.y1\nCS2 = d.y2\nCS3 = d.y3'],
  });
  ex({
    id: 'mem-ex-lab-select', chapter: 'mem-ram', title: 'Chip selects on the bench', kind: 'lab', lab: 'mem-lab-select',
    text: ['Wire the chip-select decoder on the bench, find the switch setting that darkens each LED, and check.'],
    hints: ['Power first: pin 16 to +5 V, pin 8 to ground. Then tie G2A′ (pin 4) and G2B′ (pin 5) to ground, so that only G1 (pin 6) enables the chip.', 'S0, S1, S2 go to A, B, C (pins 1, 2, 3); S3 to G1. Y0′ … Y6′ are pins 15 down to 9, and Y7′ is pin 7.', 'The reference board: the 74138 at column 20; S0–S2 to pins 1–3, S3 to pin 6, pins 4, 5 and 8 to ground, pin 16 to +5 V, and the eight outputs to LEDs 0–7. With S3 up, the one dark LED is the selected chip.'],
    solution: { bench: M.SELECT_BOARD, observe: { 'LED 0|S2': '0', 'LED 0|S1': '0', 'LED 0|S0': '0', 'LED 1|S2': '0', 'LED 1|S1': '0', 'LED 1|S0': '1', 'LED 2|S2': '0', 'LED 2|S1': '1', 'LED 2|S0': '0', 'LED 3|S2': '0', 'LED 3|S1': '1', 'LED 3|S0': '1', 'LED 4|S2': '1', 'LED 4|S1': '0', 'LED 4|S0': '0', 'LED 5|S2': '1', 'LED 5|S1': '0', 'LED 5|S0': '1', 'LED 6|S2': '1', 'LED 6|S1': '1', 'LED 6|S0': '0', 'LED 7|S2': '1', 'LED 7|S1': '1', 'LED 7|S0': '1' } },
    wrong: [{ bench: { chips: M.SELECT_BOARD.chips, sw: M.SELECT_BOARD.sw, jumpers: M.SELECT_BOARD.jumpers.slice(1) } }, { bench: { chips: M.SELECT_BOARD.chips, sw: M.SELECT_BOARD.sw, jumpers: M.SELECT_BOARD.jumpers.filter((j) => j[0] !== 'sw3') } }, { bench: M.SELECT_BOARD, observe: { 'LED 1|S2': '1', 'LED 1|S1': '0', 'LED 1|S0': '0' } }],
  });

  // =========================================================================================================
  // Chapter 2: memory that corrects itself
  // =========================================================================================================
  ex({
    id: 'mem-ex-ham-encode', chapter: 'mem-ecc', title: 'Encode four data bits', level: 1, kind: 'convert', op: 'hamming-encode', value: '0110',
    text: ['Encode the data 0110 as a 7-bit Hamming code word, positions 1 to 7 from the left: parity bits at positions 1, 2 and 4, the data in positions 3, 5, 6 and 7, in order, each parity bit making its group even.'],
    hints: ['Place the data: D3 = 0, D5 = 1, D6 = 1, D7 = 0.', 'P1 covers 3, 5, 7: 0 + 1 + 0 is odd, so P1 = 1. P2 covers 3, 6, 7: P2 = 1. P4 covers 5, 6, 7: P4 = 0.', 'P1 P2 D3 P4 D5 D6 D7 = 1 1 0 0 1 1 0: the code word is 1100110.'],
    solution: '1100110', wrong: ['0110110', '1101110', '110011'],
  });
  ex({
    id: 'mem-ex-ham-position', chapter: 'mem-ecc', title: 'Which bit was flipped?', level: 1, kind: 'convert', op: 'hamming-decode', value: '1011011', ask: 'position',
    text: ['The 7-bit Hamming word 1011011 is read back from memory (position 1 on the left, parity at 1, 2 and 4). At most one bit is wrong. At which position? Answer 0 if none is.'],
    hints: ['Recompute each check: C1 over 1, 3, 5, 7; C2 over 2, 3, 6, 7; C4 over 4, 5, 6, 7.', 'Bits at 1, 3, 5, 7 are 1, 1, 0, 1: odd, C1 fails. Positions 2, 3, 6, 7: 0, 1, 1, 1: odd, C2 fails. Positions 4, 5, 6, 7: 1, 0, 1, 1: odd, C4 fails.', 'All three fail: 4 + 2 + 1 = 7. Position 7 is wrong.'],
    solution: '7', wrong: ['0', '3', '6'],
  });
  ex({
    id: 'mem-ex-ham-data', chapter: 'mem-ecc', title: 'Correct, then read the data', kind: 'convert', op: 'hamming-decode', value: '0011110', ask: 'data',
    text: ['The Hamming word 0011110 comes out of memory with at most one bit wrong. Correct it and give the four data bits (positions 3, 5, 6, 7).'],
    hints: ['First find the syndrome: C1 over 1, 3, 5, 7; C2 over 2, 3, 6, 7; C4 over 4, 5, 6, 7.', 'C1 passes (0, 1, 1, 0), C2 passes (0, 1, 1, 0), C4 fails (1, 1, 1, 0): the syndrome is 100 = 4. Position 4 is a parity bit.', 'Flipping position 4 gives 0010110; the data bits at 3, 5, 6, 7 are 1, 1, 1, 0, so the data is 1110, unchanged by the error.'],
    solution: '1110', wrong: ['1010', '0110', '0011'],
  });
  ex({
    id: 'mem-ex-check-bits', chapter: 'mem-ecc', title: 'Check bits for a wider word', level: 1, kind: 'number', answer: 5, higherLower: true,
    text: ['A memory stores 16 data bits per word and wants single-error correction with a Hamming code. How many check bits does each word need?'],
    hints: ['With k check bits the syndrome has 2ᵏ values: one for "no error" and one for each of the n + k positions.', 'Find the smallest k with 2ᵏ ≥ 16 + k + 1.', 'k = 4 gives 16 < 21; k = 5 gives 32 ≥ 22. Five check bits, 21 bits in all.'],
    solution: 5, wrong: [4, 6, 16],
  });
  ex({
    id: 'mem-ex-parity-gen', chapter: 'mem-ecc', title: 'The check-bit generator', kind: 'circuit',
    ref: { P1: 'D3 ^ D5 ^ D7', P2: 'D3 ^ D6 ^ D7', P4: 'D5 ^ D6 ^ D7' }, inputs: ['D3', 'D5', 'D6', 'D7'], outputs: ['P1', 'P2', 'P4'], parts: ['XOR'], maxGates: 5,
    text: ['Build the circuit that writes the three check bits of a 7-bit Hamming word from the data bits D3, D5, D6 and D7. Use two-input XOR gates only, at most five of them.'],
    hints: ['P1 = D3 ⊕ D5 ⊕ D7, P2 = D3 ⊕ D6 ⊕ D7, P4 = D5 ⊕ D6 ⊕ D7. Built separately, that is six gates.', 'D3 ⊕ D7 appears in both P1 and P2: make it once.', 't = XOR(D3, D7); P1 = XOR(t, D5); P2 = XOR(t, D6); u = XOR(D5, D6); P4 = XOR(u, D7).'],
    solution: 't = XOR(D3, D7)\nP1 = XOR(t, D5)\nP2 = XOR(t, D6)\nu = XOR(D5, D6)\nP4 = XOR(u, D7)',
    wrong: ['a = XOR(D3, D5)\nP1 = XOR(a, D7)\nb = XOR(D3, D6)\nP2 = XOR(b, D7)\nc = XOR(D5, D6)\nP4 = XOR(c, D7)', 't = XOR(D3, D7)\nP1 = XOR(t, D5)\nP2 = XOR(t, D6)\nP4 = XOR(D5, D6)'],
  });
  ex({
    id: 'mem-ex-syndrome', chapter: 'mem-ecc', title: 'The syndrome in eight gates', level: 3, kind: 'circuit',
    ref: { S1: 'B1 ^ B3 ^ B5 ^ B7', S2: 'B2 ^ B3 ^ B6 ^ B7', S4: 'B4 ^ B5 ^ B6 ^ B7' }, inputs: ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7'], outputs: ['S1', 'S2', 'S4'], parts: ['XOR'], maxGates: 8,
    text: ['A 7-bit Hamming word B1 … B7 is read from memory. Build the syndrome S4 S2 S1 (each bit 1 when its check fails) from two-input XOR gates, at most eight of them. Nine is easy; find the gate two checks can share.'],
    hints: ['Each syndrome bit is the XOR of four bits: three two-input gates each, nine in all.', 'S2 and S4 both contain B6 ⊕ B7.', 't = XOR(B6, B7); S1 from (B1 ⊕ B3) ⊕ (B5 ⊕ B7); S2 = (B2 ⊕ B3) ⊕ t; S4 = (B4 ⊕ B5) ⊕ t: eight gates, the same split as on the lab bench.'],
    solution: 'a = XOR(B1, B3)\nb = XOR(B5, B7)\nS1 = XOR(a, b)\nt = XOR(B6, B7)\nc = XOR(B2, B3)\nS2 = XOR(c, t)\nd = XOR(B4, B5)\nS4 = XOR(d, t)',
    wrong: ['a = XOR(B1, B3)\nb = XOR(B5, B7)\nS1 = XOR(a, b)\nt = XOR(B6, B7)\nc = XOR(B2, B3)\nS2 = XOR(c, t)\nd = XOR(B4, B6)\nS4 = XOR(d, t)', 'a = XOR(B1, B3)\nb = XOR(B5, B7)\nS1 = XOR(a, b)\nc = XOR(B2, B3)\nc2 = XOR(B6, B7)\nS2 = XOR(c, c2)\nd = XOR(B4, B5)\nd2 = XOR(B6, B7)\nS4 = XOR(d, d2)'],
  });
  ex({
    id: 'mem-ex-correct-bit', chapter: 'mem-ecc', title: 'Correcting one bit', kind: 'circuit',
    ref: { C3: "B3 ^ S4'S2S1" }, inputs: ['B3', 'S4', 'S2', 'S1'], outputs: ['C3'],
    text: ['The corrector has one small circuit per bit. Build the one for position 3: its output C3 is the bit B3 as read, flipped exactly when the syndrome S4 S2 S1 names position 3.'],
    hints: ['Position 3 is 011 in binary.', 'Detect the syndrome 011 with an AND gate (S4 complemented), then let it flip B3.', "n = NOT(S4); hit = AND(n, S2, S1); C3 = XOR(B3, hit)."],
    solution: 'n = NOT(S4)\nhit = AND(n, S2, S1)\nC3 = XOR(B3, hit)',
    wrong: ['hit = AND(S4, S2, S1)\nC3 = XOR(B3, hit)', 'n = NOT(S4)\nhit = AND(n, S2, S1)\nC3 = OR(B3, hit)'],
  });
  ex({
    id: 'mem-ex-syndrome-tree', chapter: 'mem-ecc', title: 'A tree is faster than a chain', level: 1, kind: 'timing', tech: 'CMOS', ask: 'critical',
    circuit: 't1 = XOR(B1, B3)\nt2 = XOR(B5, B7)\nS1 = XOR(t1, t2)',
    text: ['S1 = B1 ⊕ B3 ⊕ B5 ⊕ B7 is built as a balanced tree: two XOR gates side by side, then a third that combines them. With the CMOS preset delays, how long (ns) does S1 take to settle after an input changes? (A chain of three XOR gates takes 36 ns.)'],
    hints: ['Every path from an input to S1 passes through two gates.', 'Two XOR delays.', '2 × 12 ns = 24 ns.'],
    solution: 24, wrong: [36, 12],
  });
  ex({
    id: 'mem-ex-ham-verilog', chapter: 'mem-ecc', title: 'The check bits in Verilog', level: 3, kind: 'verilog', module: 'ham_parity', synth: true, ports: 'input d3, d5, d6, d7; output p1, p2, p4',
    start: 'module ham_parity(input d3, input d5, input d6, input d7, output p1, output p2, output p4);\n  \nendmodule\n',
    testbench: 'module tb;\n  reg d3, d5, d6, d7; wire p1, p2, p4; integer i;\n  ham_parity u(.d3(d3), .d5(d5), .d6(d6), .d7(d7), .p1(p1), .p2(p2), .p4(p4));\n  initial begin\n    for (i = 0; i < 16; i = i + 1) begin\n      {d3, d5, d6, d7} = i; #1;\n      if (p1 !== (d3 ^ d5 ^ d7) || p2 !== (d3 ^ d6 ^ d7) || p4 !== (d5 ^ d6 ^ d7))\n        $display("FAIL d3 d5 d6 d7 = %b%b%b%b: p1 p2 p4 = %b%b%b, expected %b%b%b", d3, d5, d6, d7, p1, p2, p4, d3 ^ d5 ^ d7, d3 ^ d6 ^ d7, d5 ^ d6 ^ d7);\n    end\n  end\nendmodule',
    text: ['Write ham_parity: from the four data bits d3, d5, d6, d7 of a 7-bit Hamming word, the three check bits p1, p2, p4, each making its group of positions even.'],
    hints: ['p1 covers positions 1, 3, 5, 7; p2 covers 2, 3, 6, 7; p4 covers 4, 5, 6, 7.', 'Each check bit is the XOR of the data bits in its group; ^ is XOR in Verilog.', 'assign p1 = d3 ^ d5 ^ d7; assign p2 = d3 ^ d6 ^ d7; assign p4 = d5 ^ d6 ^ d7;'],
    solution: 'module ham_parity(input d3, input d5, input d6, input d7, output p1, output p2, output p4);\n  assign p1 = d3 ^ d5 ^ d7;\n  assign p2 = d3 ^ d6 ^ d7;\n  assign p4 = d5 ^ d6 ^ d7;\nendmodule\n',
    wrong: ['module ham_parity(input d3, input d5, input d6, input d7, output p1, output p2, output p4);\n  assign p1 = d3 ^ d5 ^ d7;\n  assign p2 = d3 ^ d5 ^ d6;\n  assign p4 = d5 ^ d6 ^ d7;\nendmodule\n', 'module ham_parity(input d3, input d5, input d6, input d7, output p1, output p2, output p4);\n  assign p1 = d3 ^ d5 ^ d7;\n  assign p2 = d3 ^ d6 ^ d7;\n  assign p4 = d5 | d6 | d7;\nendmodule\n'],
  });
  ex({
    id: 'mem-ex-secded-single', chapter: 'mem-ecc', title: 'SEC-DED: one bit wrong', kind: 'convert', op: 'hamming-decode', secded: true, value: '10011101', ask: 'position',
    text: ['A SEC-DED word is written P0 first, then positions 1 to 7: P0 makes the whole 8-bit word even. The word 10011101 is read. Which position is wrong? (Answer 0 if it is P0 itself, or if nothing is.)'],
    hints: ['Compute the syndrome from positions 1–7 as usual, then the parity of all eight bits.', 'Positions 1–7 are 0011101: C1 (1, 3, 5, 7) fails, C2 (2, 3, 6, 7) passes, C4 (4, 5, 6, 7) fails. The syndrome is 101 = 5, and the eight bits have odd parity.', 'A non-zero syndrome with odd overall parity is a single error: position 5.'],
    solution: '5', wrong: ['0', '3'],
  });
  ex({
    id: 'mem-ex-secded-double', chapter: 'mem-ecc', title: 'SEC-DED: two bits wrong', level: 2, kind: 'convert', op: 'hamming-decode', secded: true, value: '10111101', ask: 'syndrome',
    text: ['The SEC-DED word 10111101 (P0 first) has two flipped bits. What is its syndrome, as a number? It points at a position, but the overall parity tells the decoder not to believe it.'],
    hints: ['Use positions 1–7 only: 0111101.', 'C1 over 1, 3, 5, 7 (0, 1, 1, 1) fails; C2 over 2, 3, 6, 7 (1, 1, 0, 1) fails; C4 over 4, 5, 6, 7 (1, 1, 0, 1) fails.', 'The syndrome is 111 = 7; the eight bits have even parity, so it is a double error: detected, not corrected.'],
    solution: '7', wrong: ['0', '5'],
  });
  ex({
    id: 'mem-ex-secded-cases', chapter: 'mem-ecc', title: 'What the two signs say', kind: 'choice',
    options: ['No error', 'A single error, at the position the syndrome names', 'The overall parity bit P0 itself is wrong; the data is fine', 'Two errors: report the word as bad'],
    answer: 2, whyNot: { 0: 'With no error the overall parity would be even.', 1: 'A syndrome of 0 names no position among 1 to 7.', 3: 'A double error leaves the overall parity even.' },
    text: ['A SEC-DED decoder finds a syndrome of 0, but the overall parity of the eight bits is odd. What happened?'],
    hints: ['Odd overall parity means an odd number of bits flipped: one, most likely.', 'Which single bit can flip without upsetting any of the checks on positions 1–7?', 'Only P0, which no Hamming check covers: the data is fine and P0 is simply rewritten.'],
    solution: 2, wrong: [0, 1, 3],
  });
  ex({
    id: 'mem-ex-secded-logic', chapter: 'mem-ecc', title: 'The SEC-DED verdict', kind: 'circuit',
    ref: { OK: "P'S4'S2'S1'", DBL: "P'(S4 + S2 + S1)" }, inputs: ['S4', 'S2', 'S1', 'P'], outputs: ['OK', 'DBL'],
    text: ['From the syndrome S4 S2 S1 and P (1 when the overall parity of the eight bits is odd), build two signals: OK = 1 when the word has no error at all, and DBL = 1 when two bits are wrong. (Every other case is one error, which the corrector fixes.)'],
    hints: ['No error: syndrome 000 and even overall parity.', 'Two errors: some check fails (the syndrome is not 000) but the overall parity is even.', "z = NOR(S4, S2, S1); np = NOT(P); OK = AND(z, np); nz = NOT(z); DBL = AND(nz, np)."],
    solution: 'z = NOR(S4, S2, S1)\nnp = NOT(P)\nOK = AND(z, np)\nnz = NOT(z)\nDBL = AND(nz, np)',
    wrong: ['z = NOR(S4, S2, S1)\nnp = NOT(P)\nOK = AND(z, np)\nnz = NOT(z)\nDBL = AND(nz, P)', 'z = NOR(S4, S2, S1)\nOK = z\nnz = NOT(z)\nnp = NOT(P)\nDBL = AND(nz, np)'],
  });
  ex({
    id: 'mem-ex-lab-syndrome', chapter: 'mem-ecc', title: 'A syndrome decoder on the bench', level: 3, kind: 'lab', lab: 'mem-lab-syndrome',
    text: ['Wire the Hamming checker on the bench, set the switches to each word of the table, write down the number of the dark LED in binary (S4 S2 S1), and check.'],
    hints: ['Two 7486 chips make the eight XOR gates: on the first, B1 ⊕ B3, B5 ⊕ B7, their XOR (S1), and B6 ⊕ B7; on the second, B2 ⊕ B3 and B4 ⊕ B5, each XORed with B6 ⊕ B7 (S2 and S4).', 'S1, S2, S4 go to the 74138\'s A, B, C (pins 1, 2, 3). G1 (pin 6) high, G2A′ and G2B′ (pins 4, 5) low. Its outputs go to LEDs 0–7; the dark one is the syndrome.', 'The reference board: 7486s at columns 6 and 16, the 74138 at column 28, S0–S6 for B1–B7. Dark LEDs: 0110011 → 0 (000); 0110001 → 6 (110); 1110011 → 1 (001); 0111011 → 4 (100); 0110010 → 7 (111); 0010011 → 2 (010).'],
    solution: { bench: M.SYNDROME_BOARD, observe: { '0110011|S4': '0', '0110011|S2': '0', '0110011|S1': '0', '0110001|S4': '1', '0110001|S2': '1', '0110001|S1': '0', '1110011|S4': '0', '1110011|S2': '0', '1110011|S1': '1', '0111011|S4': '1', '0111011|S2': '0', '0111011|S1': '0', '0110010|S4': '1', '0110010|S2': '1', '0110010|S1': '1', '0010011|S4': '0', '0010011|S2': '1', '0010011|S1': '0' } },
    wrong: [{ bench: { chips: M.SYNDROME_BOARD.chips, jumpers: M.SYNDROME_BOARD.jumpers.filter((j) => j[1] !== '20a') } }, { bench: M.SYNDROME_BOARD, observe: { '0110001|S4': '0', '0110001|S2': '1', '0110001|S1': '1' } }],
  });

  // =========================================================================================================
  // Chapter 3: ROM and programmable logic
  // =========================================================================================================
  ex({
    id: 'mem-ex-rom-table', chapter: 'mem-pld', title: 'What goes into the ROM', level: 1, kind: 'table', table: 'custom', cellKind: 'text',
    rows: ['0', '1', '2', '3', '4', '5', '6', '7'], cols: ['word'], corner: 'address',
    cells: { '0|word': '0001', '1|word': '0011', '2|word': '0101', '3|word': '0111', '4|word': '1001', '5|word': '1011', '6|word': '1101', '7|word': '1111' },
    text: ['An 8 × 4 ROM turns a 3-bit number n into the 4-bit number 2n + 1. Write the word stored at each address, as four bits.'],
    hints: ['Address 3 holds 2 × 3 + 1 = 7.', 'In binary, 2n + 1 is n shifted left one place with a 1 brought in at the right.', '0001, 0011, 0101, 0111, 1001, 1011, 1101, 1111.'],
    solution: { '0|word': '0001', '1|word': '0011', '2|word': '0101', '3|word': '0111', '4|word': '1001', '5|word': '1011', '6|word': '1101', '7|word': '1111' },
    wrong: [{ '0|word': '0000', '1|word': '0010', '2|word': '0100', '3|word': '0110', '4|word': '1000', '5|word': '1010', '6|word': '1100', '7|word': '1110' }, { '0|word': '1', '1|word': '3', '2|word': '5', '3|word': '7', '4|word': '9', '5|word': '11', '6|word': '13', '7|word': '15' }],
  });
  ex({
    id: 'mem-ex-rom-decoder', chapter: 'mem-pld', title: 'A ROM from a decoder and OR gates', kind: 'circuit',
    ref: { F1: "A'B'C' + A'BC + AB'C + ABC'", F2: "A'B'C + A'BC' + A'BC + ABC" }, inputs: ['A', 'B', 'C'], outputs: ['F1', 'F2'], parts: ['DECODER', 'OR'],
    text: ['Inside, a ROM is a decoder (one word line per address) and an OR gate per output bit. Build the two-output "ROM" F1 = Σm(0, 3, 5, 6), F2 = Σm(1, 2, 3, 7) from one 3-to-8 decoder and OR gates; A is the high address bit.'],
    hints: ['DECODER[k=3] has inputs a2 (high), a1, a0 and outputs y0 … y7, one per minterm.', 'Each output ORs the word lines of its minterms: F1 = y0 + y3 + y5 + y6.', 'd = DECODER[k=3](a2=A, a1=B, a0=C); F1 = OR(d.y0, d.y3, d.y5, d.y6); F2 = OR(d.y1, d.y2, d.y3, d.y7).'],
    solution: 'd = DECODER[k=3](a2=A, a1=B, a0=C)\nF1 = OR(d.y0, d.y3, d.y5, d.y6)\nF2 = OR(d.y1, d.y2, d.y3, d.y7)',
    wrong: ['d = DECODER[k=3](a2=C, a1=B, a0=A)\nF1 = OR(d.y0, d.y3, d.y5, d.y6)\nF2 = OR(d.y1, d.y2, d.y3, d.y7)', 'd = DECODER[k=3](a2=A, a1=B, a0=C)\nF1 = OR(d.y0, d.y3, d.y5, d.y6)\nF2 = OR(d.y1, d.y2, d.y7)'],
  });
  ex({
    id: 'mem-ex-rom-kinds', chapter: 'mem-pld', title: 'Which kind of ROM?', level: 1, kind: 'choice',
    options: ['Mask ROM', 'PROM (fuses)', 'EPROM (ultraviolet erase)', 'Flash'],
    answer: 3, whyNot: { 0: 'A mask ROM is fixed at the factory; changing it means a new chip.', 1: 'A blown fuse cannot be mended: a PROM is programmed once.', 2: 'An EPROM must come out of the circuit to be erased under ultraviolet light.' },
    text: ['A gadget\'s firmware must be updated in the field, over a cable, without taking any chip out. Updates are rare and rewrite large blocks at a time. Which kind of ROM fits best?'],
    hints: ['Rule out the kinds that can never be changed.', 'Of the erasable kinds, which can be erased electrically, in the circuit?', 'Flash: electrically erased a block at a time, in the circuit, and the cheapest per bit.'],
    solution: 3, wrong: [0, 2],
  });
  ex({
    id: 'mem-ex-pla-table', chapter: 'mem-pld', title: 'Fill in a PLA programming table', kind: 'table', table: 'custom', cellKind: 'text',
    rows: ["T1 = A'B'C", "T2 = A'BC'", "T3 = AB'C'", 'T4 = AB'], cols: ['A', 'B', 'C', 'F1', 'F2'], corner: 'term',
    cells: { "T1 = A'B'C|A": '0', "T1 = A'B'C|B": '0', "T1 = A'B'C|C": '1', "T1 = A'B'C|F1": '1', "T1 = A'B'C|F2": '0', "T2 = A'BC'|A": '0', "T2 = A'BC'|B": '1', "T2 = A'BC'|C": '0', "T2 = A'BC'|F1": '1', "T2 = A'BC'|F2": '1', "T3 = AB'C'|A": '1', "T3 = AB'C'|B": '0', "T3 = AB'C'|C": '0', "T3 = AB'C'|F1": '1', "T3 = AB'C'|F2": '1', 'T4 = AB|A': '1', 'T4 = AB|B': '1', 'T4 = AB|C': '-', 'T4 = AB|F1': '0', 'T4 = AB|F2': '1' },
    text: ['A PLA makes F1 = Σm(1, 2, 4) and F2 = Σm(2, 4, 6, 7) from the four product terms shown. Fill in its programming table: under each input write 1 (true literal), 0 (complemented) or - (not used); under each output, 1 if the term is ORed into it, else 0.'],
    hints: ["F1 = A′B′C + A′BC′ + AB′C′ uses T1, T2 and T3.", 'F2 = Σm(2, 4, 6, 7): T2 covers 2, T3 covers 4, T4 = AB covers 6 and 7. So T2 and T3 are shared.', "T1: 0 0 1 | 1 0. T2: 0 1 0 | 1 1. T3: 1 0 0 | 1 1. T4: 1 1 - | 0 1."],
    solution: { "T1 = A'B'C|A": '0', "T1 = A'B'C|B": '0', "T1 = A'B'C|C": '1', "T1 = A'B'C|F1": '1', "T1 = A'B'C|F2": '0', "T2 = A'BC'|A": '0', "T2 = A'BC'|B": '1', "T2 = A'BC'|C": '0', "T2 = A'BC'|F1": '1', "T2 = A'BC'|F2": '1', "T3 = AB'C'|A": '1', "T3 = AB'C'|B": '0', "T3 = AB'C'|C": '0', "T3 = AB'C'|F1": '1', "T3 = AB'C'|F2": '1', 'T4 = AB|A': '1', 'T4 = AB|B': '1', 'T4 = AB|C': '-', 'T4 = AB|F1': '0', 'T4 = AB|F2': '1' },
    wrong: [{ "T1 = A'B'C|A": '0', "T1 = A'B'C|B": '0', "T1 = A'B'C|C": '1', "T1 = A'B'C|F1": '1', "T1 = A'B'C|F2": '0', "T2 = A'BC'|A": '0', "T2 = A'BC'|B": '1', "T2 = A'BC'|C": '0', "T2 = A'BC'|F1": '1', "T2 = A'BC'|F2": '0', "T3 = AB'C'|A": '1', "T3 = AB'C'|B": '0', "T3 = AB'C'|C": '0', "T3 = AB'C'|F1": '1', "T3 = AB'C'|F2": '0', 'T4 = AB|A': '1', 'T4 = AB|B': '1', 'T4 = AB|C': '-', 'T4 = AB|F1': '0', 'T4 = AB|F2': '1' }, { 'T4 = AB|C': '0' }],
  });
  ex({
    id: 'mem-ex-pla-kmap', chapter: 'mem-pld', title: 'Before the PLA: minimise one output', kind: 'kmap', vars: ['A', 'B', 'C'], minterms: [2, 3, 5, 6], form: 'sop',
    text: ['One output of a PLA is G = Σm(2, 3, 5, 6). Circle a minimal sum of products for it.'],
    hints: ['Cells 2 and 3 are neighbours (A = 0, B = 1).', 'Cells 2 and 6 are neighbours too (B = 1, C = 0); 5 has no neighbour among the 1s.', "A′B (2, 3), BC′ (2, 6) and AB′C (5)."],
    solution: ['01-', '-10', '101'], wrong: [['01-', '101'], ['01-', '-10', '1-1']],
  });
  ex({
    id: 'mem-ex-pla-gates', chapter: 'mem-pld', title: 'Two outputs, four shared terms', level: 3, kind: 'circuit',
    ref: { F1: "A'B'C + A'BC' + AB'C'", F2: "A'BC' + AB'C' + AB" }, inputs: ['A', 'B', 'C'], outputs: ['F1', 'F2'], parts: ['AND', 'OR', 'NOT'], maxGates: 9,
    text: ['Build F1 = Σm(1, 2, 4) and F2 = Σm(2, 4, 6, 7) the way a PLA would: an AND plane of product terms shared between the outputs, then an OR gate per output. Use AND, OR and NOT gates, at most nine in all.'],
    hints: ['Minimised on its own, F2 = AB + AC′ + BC′; with F1\'s three terms that makes six AND gates, too many.', 'F2 can reuse F1\'s terms A′BC′ (cell 2) and AB′C′ (cell 4), adding only AB for cells 6 and 7.', "Three inverters; T1 = AND(na, nb, C), T2 = AND(na, B, nc), T3 = AND(A, nb, nc), T4 = AND(A, B); F1 = OR(T1, T2, T3), F2 = OR(T2, T3, T4)."],
    solution: 'na = NOT(A)\nnb = NOT(B)\nnc = NOT(C)\nT1 = AND(na, nb, C)\nT2 = AND(na, B, nc)\nT3 = AND(A, nb, nc)\nT4 = AND(A, B)\nF1 = OR(T1, T2, T3)\nF2 = OR(T2, T3, T4)',
    wrong: ['na = NOT(A)\nnb = NOT(B)\nnc = NOT(C)\nT1 = AND(na, nb, C)\nT2 = AND(na, B, nc)\nT3 = AND(A, nb, nc)\nT4 = AND(A, B)\nT5 = AND(A, nc)\nT6 = AND(B, nc)\nF1 = OR(T1, T2, T3)\nF2 = OR(T4, T5, T6)', 'na = NOT(A)\nnb = NOT(B)\nnc = NOT(C)\nT1 = AND(na, nb, C)\nT2 = AND(na, B, nc)\nT3 = AND(A, nb, nc)\nT4 = AND(A, B)\nF1 = OR(T1, T2, T3)\nF2 = OR(T2, T4)'],
  });
  ex({
    id: 'mem-ex-pal-kmap', chapter: 'mem-pld', title: 'How many PAL rows?', kind: 'kmap', vars: ['A', 'B', 'C'], minterms: [2, 4, 6, 7], form: 'sop',
    text: ['In a PAL each output owns its rows and cannot borrow another output\'s terms, so each output is minimised on its own. Circle a minimal sum of products for F2 = Σm(2, 4, 6, 7): its number of terms is the number of rows it needs.'],
    hints: ['Cell 6 is a neighbour of 2, 4 and 7.', 'Each of 2, 4 and 7 can only be covered by a pair that includes 6.', "BC′ (2, 6), AC′ (4, 6) and AB (6, 7): three rows."],
    solution: ['-10', '1-0', '11-'], wrong: [['-10', '1-0'], ['-10', '1-0', '11-', '110']],
  });
  ex({
    id: 'mem-ex-pal-proof', chapter: 'mem-pld', title: 'The spare row adds nothing', level: 1, kind: 'proof', start: "BC + AA'", goal: 'BC', laws: ['complement', 'identity'], maxSteps: 3,
    text: ['An unused PAL row keeps all its fuses, so it computes A·A′ (and more), and the output becomes BC + AA′. Prove, step by step, that BC + AA′ = BC.'],
    hints: ['What is A·A′?', "A·A′ = 0 by the complement law.", "BC + AA′ = BC + 0 (complement) = BC (identity)."],
    solution: [{ expr: 'BC + 0', law: 'complement' }, { expr: 'BC', law: 'identity' }],
    wrong: ['BC ; identity', 'BC + 0 ; identity\nBC ; identity', 'BC + 1 ; complement\nBC ; identity'],
  });
  ex({
    id: 'mem-ex-lut-bits', chapter: 'mem-pld', title: 'Loading a LUT', level: 1, kind: 'truthtable', expr: 'A ^ BC', vars: ['A', 'B', 'C'],
    text: ['A 3-input LUT is to compute F = A ⊕ BC. Its eight configuration bits are the output column of the truth table: fill it in, rows 000 to 111.'],
    hints: ['BC is 1 only in rows 011 and 111.', 'With A = 0, F = BC; with A = 1, F is BC flipped.', 'F = 0, 0, 0, 1, 1, 1, 1, 0: the LUT holds 00011110.'],
    solution: { '000|F': '0', '001|F': '0', '010|F': '0', '011|F': '1', '100|F': '1', '101|F': '1', '110|F': '1', '111|F': '0' },
    wrong: [{ '000|F': '0', '001|F': '0', '010|F': '0', '011|F': '1', '100|F': '1', '101|F': '1', '110|F': '1', '111|F': '1' }, { '000|F': '1', '001|F': '1', '010|F': '1', '011|F': '0', '100|F': '0', '101|F': '0', '110|F': '0', '111|F': '1' }],
  });
  ex({
    id: 'mem-ex-lut-mux', chapter: 'mem-pld', title: 'A LUT is a multiplexer', kind: 'circuit',
    ref: "AB + A'C", inputs: ['A', 'B', 'C'], outputs: ['F'], parts: ['MUX'], maxGates: 1,
    text: ['Build F = AB + A′C with a single 8-to-1 multiplexer and constant 0s and 1s on its data inputs: exactly what a 3-input LUT is. A is the high select bit.'],
    hints: ['With selects s2 s1 s0 = A B C, data input dk is chosen in row k of the truth table.', 'The output column of F for rows 0 to 7 is 0 1 0 1 0 0 1 1.', 'F = MUX[n=8](d0=0, d1=1, d2=0, d3=1, d4=0, d5=0, d6=1, d7=1, s2=A, s1=B, s0=C).'],
    solution: 'F = MUX[n=8](d0=0, d1=1, d2=0, d3=1, d4=0, d5=0, d6=1, d7=1, s2=A, s1=B, s0=C)',
    wrong: ['F = MUX[n=8](d0=1, d1=1, d2=0, d3=0, d4=1, d5=0, d6=1, d7=0, s2=A, s1=B, s0=C)', 'F = MUX[n=8](d0=0, d1=1, d2=0, d3=1, d4=0, d5=0, d6=1, d7=1, s2=C, s1=B, s0=A)'],
  });
  ex({
    id: 'mem-ex-lut-delay', chapter: 'mem-pld', title: 'Through the multiplexer tree', kind: 'timing', tech: 'CMOS', ask: 'critical',
    circuit: 'm0 = MUX(d0=0, d1=1, s0=C)\nm1 = MUX(d0=0, d1=1, s0=C)\nm2 = MUX(d0=0, d1=0, s0=C)\nm3 = MUX(d0=1, d1=1, s0=C)\nm4 = MUX(d0=m0, d1=m1, s0=B)\nm5 = MUX(d0=m2, d1=m3, s0=B)\nF = MUX(d0=m4, d1=m5, s0=A)',
    text: ['A 3-input LUT is a tree of seven 2-to-1 multiplexers: C picks within each pair of configuration bits, B between pairs, A at the root. With the CMOS preset delays, how long (ns) is its slowest path from an input to F?'],
    hints: ['The longest paths start at C, the select of the first rank.', 'From C the change passes three multiplexers in a row.', 'Three multiplexer delays: 54 ns.'],
    solution: 54, wrong: [18, 126],
  });
  ex({
    id: 'mem-ex-lut-verilog', chapter: 'mem-pld', title: 'A LUT in Verilog', level: 3, kind: 'verilog', module: 'lut3', synth: true, ports: 'parameter [7:0] INIT; input a, b, c; output f',
    start: "module lut3 #(parameter [7:0] INIT = 8'h00) (input a, input b, input c, output f);\n  \nendmodule\n",
    testbench: "module tb;\n  reg a, b, c; wire f1, f2; integer i;\n  lut3 #(.INIT(8'b11001010)) u1(.a(a), .b(b), .c(c), .f(f1));\n  lut3 #(.INIT(8'b00010110)) u2(.a(a), .b(b), .c(c), .f(f2));\n  initial begin\n    for (i = 0; i < 8; i = i + 1) begin\n      {a, b, c} = i; #1;\n      if (f1 !== ((8'b11001010 >> i) & 1)) $display(\"FAIL INIT=11001010 a=%b b=%b c=%b: f=%b\", a, b, c, f1);\n      if (f2 !== ((8'b00010110 >> i) & 1)) $display(\"FAIL INIT=00010110 a=%b b=%b c=%b: f=%b\", a, b, c, f2);\n    end\n  end\nendmodule",
    text: ['Write lut3: a 3-input look-up table whose eight configuration bits are the parameter INIT. The output f is bit number {a, b, c} of INIT (bit 0 for abc = 000, bit 7 for 111), so the same module makes any function of three inputs.'],
    hints: ['The three inputs, concatenated, form a 3-bit index.', 'A parameter can be indexed like a vector: INIT[k].', 'assign f = INIT[{a, b, c}];'],
    solution: "module lut3 #(parameter [7:0] INIT = 8'h00) (input a, input b, input c, output f);\n  assign f = INIT[{a, b, c}];\nendmodule\n",
    wrong: ["module lut3 #(parameter [7:0] INIT = 8'h00) (input a, input b, input c, output f);\n  assign f = INIT[{c, b, a}];\nendmodule\n", "module lut3 #(parameter [7:0] INIT = 8'h00) (input a, input b, input c, output f);\n  assign f = a & b | c;\nendmodule\n"],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
