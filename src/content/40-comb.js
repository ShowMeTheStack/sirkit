// Part 4, combinational logic: the chapters, the lessons, a guided tour and a course. The exercises and the bench
// labs are in 40-comb-ex.js. Each lesson opens with a question, runs the topic that animates the idea at a frame
// chosen for the point being made, asks for a prediction, gives a live circuit to try, sums up, and leads to its
// exercises. Every circuit and number here is our own and comes from the engines.
(function (S) {
  'use strict';
  const C = S.Content;
  if (!C || C.lessons.has('comb-analysis')) return;
  const X = (id) => ({ exercise: id });
  const LAB = (id) => ({ lab: id });

  C.chapter({ id: 'comb-procedures', part: 'combinational', n: 1, title: 'Analysis, design and code converters', blurb: 'Reading a circuit back to its table, building one from words, and the converters between codes, including a decoder that lights a display.' });
  C.chapter({ id: 'comb-arith', part: 'combinational', n: 2, title: 'Circuits that do arithmetic', blurb: 'Half and full adders, the crawling carry and the lookahead that outruns it, subtraction and overflow, decimal addition, multipliers and comparators.' });
  C.chapter({ id: 'comb-select', part: 'combinational', n: 3, title: 'Decoders, multiplexers and buses', blurb: 'One line out of many and back again, any function from a decoder or a multiplexer, and sharing a wire between drivers.' });

  // circuits the lessons run (text netlists, read by the same parser as the exercises)
  const ODD = 'n1 = XOR(A, B)\nn2 = AND(n1, C)\nn3 = AND(A, B)\nF = OR(n2, n3)';
  const SQUARE = { vars: ['A', 'B', 'C', 'D'], minterms: [0, 1, 4, 9] };
  const XS3_Y = 'nc = NOT(C)\nnd = NOT(D)\nt1 = AND(nc, nd)\nt2 = AND(C, D)\nY = OR(t1, t2)';
  const FA_GATES = 'p = XOR(A, B)\nS = XOR(p, Cin)\ng = AND(A, B)\nt = AND(p, Cin)\nCout = OR(g, t)';
  const RIP2 = 'f0 = FA(a=A0, b=B0, cin=C0)\nf1 = FA(a=A1, b=B1, cin=f0.cout)\nS0 = f0.s\nS1 = f1.s\nC2 = f1.cout';
  const ADDSUB2 = 'x0 = XOR(B0, M)\nx1 = XOR(B1, M)\nf0 = FA(a=A0, b=x0, cin=M)\nf1 = FA(a=A1, b=x1, cin=f0.cout)\nS0 = f0.s\nS1 = f1.s\nCo = f1.cout';
  const MUL2 = 't0 = AND(A0, B0)\nt1 = AND(A1, B0)\nt2 = AND(A0, B1)\nt3 = AND(A1, B1)\nh1 = HA(a=t1, b=t2)\nh2 = HA(a=t3, b=h1.c)\nP0 = t0\nP1 = h1.s\nP2 = h2.s\nP3 = h2.c';
  const DEC24 = 'd = DECODER[k=2, en](a1=A1, a0=A0, en=E)\nY0 = d.y0\nY1 = d.y1\nY2 = d.y2\nY3 = d.y3';
  const DEC_FA = 'd = DECODER[k=3](a2=A, a1=B, a0=C)\nS = OR(d.y1, d.y2, d.y4, d.y7)\nCo = OR(d.y3, d.y5, d.y6, d.y7)';
  const MAJ_MUX = 'F = MUX[n=4](d0=0, d1=C, d2=C, d3=1, s1=A, s0=B)';
  const DEMUX = 'dm = DEMUX[n=4](d=D, s1=S1, s0=S0)\nY0 = dm.y0\nY1 = dm.y1\nY2 = dm.y2\nY3 = dm.y3';

  // =========================================================================================================
  // Chapter 1: analysis, design and code converters
  // =========================================================================================================
  C.lesson({
    id: 'comb-analysis', chapter: 'comb-procedures', title: 'Reading a circuit you did not design', minutes: 7,
    summary: 'The analysis procedure turns a circuit into equations and a truth table: name every gate output, write each in terms of the inputs, and fill in the table.',
    blocks: [
      'Someone hands you a board with a handful of gates and asks what it does. There is no description, only wires. A **combinational** circuit has no memory, so its outputs depend on nothing but its present inputs, and that means a truth table can say everything about it. The job is to get from the wires to that table without guessing.',
      { def: 'Combinational circuit', text: 'a circuit whose outputs, once settled, are a function of its present inputs only: no feedback loops and no storage.' },
      { h: 'The procedure' },
      { steps: ['Name the output of every gate that is fed only by circuit inputs.', 'Write each of those as an expression in the inputs.', 'Move one level towards the outputs: name the next gates and write them in terms of names already known.', 'When you reach the outputs, substitute back until each is an expression in the inputs alone.', 'Fill in the truth table from the expressions, and simplify if you want a name for what you found.'] },
      { topic: 'analysis-procedure', input: { circuit: 'mixed' }, frame: 2, caption: 'Two outputs from NOR, XOR and AND gates. T1 and T2 are named and written; F1 comes next. Step through: every gate gets a name and an expression before the table is filled in. The last frame says what the circuit turned out to be.' },
      { predict: { q: 'In this circuit F1 = (A + B)(B + C). Which simpler expression is it equal to?', options: ['B + AC', 'AB + C', 'A + BC', 'AC'], answer: 0, explain: 'Multiply out: AB + AC + B + BC. Every term with B is swallowed by B itself, leaving B + AC.' } },
      { h: 'Try one yourself' },
      'Here is a small circuit to analyse in your head. Name the gates: n1 = A ⊕ B, n2 = n1·C, n3 = AB, and F = n2 + n3. Then click the inputs to check rows of your table.',
      { circuit: ODD, outputs: ['F'], inputs: { A: 1, C: 1 }, caption: 'F = (A ⊕ B)C + AB. Set two or three of the inputs to 1 and watch F.' },
      { predict: { q: 'For how many of the eight rows is F = 1?', options: ['2', '3', '4', '5'], answer: 2, explain: 'F = (A ⊕ B)C + AB is 1 when at least two inputs are 1: rows 011, 101, 110 and 111. It is the carry of a full adder.' } },
      { func: { expr: '(A ^ B)C + AB' }, caption: 'The same F in the function workbench: its table, its minterms, and its minimal form AB + AC + BC.' },
      { tip: 'Analysis by expressions and analysis by the table give the same answer; use whichever is shorter. For a few inputs, filling the table gate by gate is often quickest. For many inputs, the expressions win.' },
      { h: 'Recap' },
      { list: ['Combinational outputs depend only on the present inputs, so a truth table describes the circuit completely.', 'Name every gate output, write each in terms of what feeds it, and substitute back to the inputs.', 'Simplify at the end to recognise the function: the majority, a parity, a sum.'] },
      X('comb-ex-analyse-table'), X('comb-ex-analyse-expr'),
    ],
  });

  C.lesson({
    id: 'comb-design', chapter: 'comb-procedures', title: 'From a word problem to gates', minutes: 8,
    summary: 'The design procedure: decide the inputs and outputs, write the truth table from the words, minimise each output, draw the circuit, and check it by running every row.',
    blocks: [
      'A customer wants a light that comes on when a 4-bit number is a perfect square: 0, 1, 4 or 9. Nobody has drawn a gate yet. Design is analysis run backwards, and it has its own short procedure.',
      { steps: ['Read the specification. Name the inputs and outputs, and say what each value means.', 'Write the truth table, one row per input combination, straight from the words.', 'Minimise each output, usually on a K-map, using the don\'t-cares the problem allows.', 'Draw the circuit from the minimal expressions.', 'Check it: run every row on the simulator and compare with the table.'] },
      { topic: 'design-procedure', input: { spec: 'prime' }, frame: 6, caption: 'A 4-bit prime detector designed step by step. This frame circles the groups on the map. Step on to see the gates, then every row run against the table.' },
      { h: 'The perfect-square light' },
      'Call the number ABCD, with A the most significant bit. The output Q is 1 for the rows 0000, 0001, 0100 and 1001. Here is that function, with its map and minimal forms.',
      { func: SQUARE, caption: 'Q = Σm(0, 1, 4, 9).' },
      { predict: { q: 'Can the four 1s of Q be covered by one group?', options: ['Yes, they make a group of four', 'No: the best cover is two groups of two', 'No: each 1 needs its own group'], answer: 1, explain: '0 pairs with 4 (A′C′D′) and 1 pairs with 9 (B′C′D). No group of four holds all of them.' } },
      { kmap: Object.assign({ groups: 'minimal' }, SQUARE), caption: 'Q = A′C′D′ + B′C′D: two AND gates, an OR gate and inverters for A′, B′, C′ and D′.' },
      { warn: 'Read the words carefully before the table. "At least two", "exactly two" and "more than two" give three different tables, and a K-map cannot rescue a wrong one.' },
      { h: 'When some rows cannot happen' },
      'If the input is a BCD digit, the codes 1010 to 1111 never arrive. Their outputs are **don\'t-cares**: the map may take each as 0 or 1, whichever makes bigger groups. That is the next lesson\'s main tool.',
      { h: 'Recap' },
      { list: ['Specification → truth table → minimal expressions → circuit → check.', 'Every output gets its own map; outputs may share gates afterwards.', 'Rows that cannot occur are don\'t-cares, free to help the groups grow.', 'Always finish by running the whole table on the circuit.'] },
      X('comb-ex-exactly-two'), X('comb-ex-mult3-kmap'), X('comb-ex-2421-msb'),
    ],
  });

  C.lesson({
    id: 'comb-converters', chapter: 'comb-procedures', title: 'Code converters', minutes: 9,
    summary: 'A code converter is a combinational circuit whose input and output are two codes for the same thing: BCD to excess-3, binary to Gray, BCD to the seven bars of a display.',
    blocks: [
      'A meter stores its reading in BCD, the display wants seven separate bars, and the position sensor on the dial speaks Gray code. Each mismatch is fixed by a **code converter**: a circuit with one output bit per bit of the new code, designed exactly as in the last lesson.',
      { h: 'BCD to excess-3' },
      'Excess-3 writes each decimal digit as the binary number for the digit plus three. The input is a BCD digit, so codes 10 to 15 are don\'t-cares on all four maps.',
      { topic: 'bcd-excess3', frame: 3, caption: 'The four maps of the converter, one per output bit. This frame shows Y = C′D′ + CD. Step on to watch digits run through the gates.' },
      { predict: { q: 'Z, the last bit of excess-3, is a function of which inputs?', options: ['D alone', 'C and D', 'all four'], answer: 0, explain: 'Adding 3, an odd number, always flips the last bit: Z = D′.' } },
      { circuit: XS3_Y, outputs: ['Y'], inputs: { C: 1, D: 1 }, caption: 'Y = C′D′ + CD: it is 1 when C and D agree. That is an XNOR, as the map\'s two corners-and-middle groups hint.' },
      { h: 'Binary and Gray' },
      'In Gray code neighbouring numbers differ in exactly one bit. Converting is one XOR per bit: each Gray bit says whether two neighbouring binary bits differ. Going back, each binary bit is the XOR of the bit above it (already converted) and its Gray bit.',
      { topic: 'gray-converter', input: { dir: 'b2g', n: '3', steps: 4 }, frame: 6, caption: 'Binary 010 becomes Gray 011. Each Gray output is one XOR away from the inputs, so all of them settle together.' },
      { h: 'BCD to seven segments' },
      'A seven-segment display has a bar a at the top, then b, c, d, e, f clockwise, and g across the middle. A decoder for it has seven outputs, one map each.',
      { topic: 'bcd-seven-segment', input: { seg: 'e', digits: '2, 3, 8, 6' }, frame: 1, caption: 'Segment e on its map: e = B′D′ + CD′. Step on to see the display light digit by digit.' },
      { tip: 'Real decoder chips such as the 7447 make their own choices: it draws 6 without the top bar and 9 without the bottom bar. The lab below lets you find this on the bench.' },
      LAB('comb-lab-display'),
      { h: 'Recap' },
      { list: ['A code converter has one output per bit of the new code, each designed on its own map.', 'Input codes that never occur (10 to 15 for BCD) are don\'t-cares.', 'Binary to Gray: Gi = Bi+1 ⊕ Bi. Gray to binary: Bi = Bi+1 ⊕ Gi, working down from the top.', 'A seven-segment decoder is seven functions of four inputs.'] },
      X('comb-ex-gray-circuit'), X('comb-ex-gray-wave'), X('comb-ex-xs3-code'), X('comb-ex-seg-four'), X('comb-ex-seg-c-pos'), X('comb-ex-gray-verilog'), X('comb-ex-lab-display'),
    ],
  });

  // =========================================================================================================
  // Chapter 2: arithmetic
  // =========================================================================================================
  C.lesson({
    id: 'comb-adders', chapter: 'comb-arith', title: 'Half and full adders', minutes: 7,
    summary: 'A half adder adds two bits; a full adder adds three, so it can take the carry from the column to its right. Sum is the XOR of the inputs, carry their majority.',
    blocks: [
      'Add 0111 and 0011 on paper. In the rightmost column you add two bits. In every other column you add two bits *and* the carry from the right: three bits. Each column gives a sum bit and a carry to pass left. Two small circuits do these two jobs.',
      { def: 'Half adder', text: 'adds two bits A and B: sum S = A ⊕ B, carry C = AB.' },
      { topic: 'half-adder', frame: 9, caption: 'At 1 + 1 the carry rises 10 ns after the input change and the sum falls 12 ns after: an AND is a little quicker than an XOR in this technology.' },
      { def: 'Full adder', text: 'adds three bits A, B and Cin: S = A ⊕ B ⊕ Cin, Cout = AB + Cin(A ⊕ B), which is the majority AB + ACin + BCin.' },
      { predict: { q: 'A full adder gets A = 1, B = 0, Cin = 1. What are Cout and S?', options: ['Cout = 0, S = 0', 'Cout = 1, S = 0', 'Cout = 0, S = 1', 'Cout = 1, S = 1'], answer: 1, explain: '1 + 0 + 1 = 2 = 10 in binary: the carry is 1 and the sum bit 0.' } },
      { topic: 'full-adder', input: { order: 'carry' }, caption: 'The carry cases only. Watch the words on each settled row: when A and B differ the carry in is propagated, when both are 1 a carry is generated, when both are 0 it is killed.' },
      { h: 'Built from gates' },
      'The circuit below names the two signals that will matter for fast adders: p = A ⊕ B (propagate) and g = AB (generate). Then S = p ⊕ Cin and Cout = g + p·Cin.',
      { circuit: FA_GATES, outputs: ['S', 'Cout'], inputs: { A: 1, Cin: 1 }, caption: 'A full adder from two XORs, two ANDs and an OR. Try every row with two or three inputs at 1.' },
      { verilog: 'module fa(input a, b, cin, output s, cout);\n  assign s = a ^ b ^ cin;\n  assign cout = a & b | cin & (a ^ b);\nendmodule\n\nmodule tb;\n  reg a, b, cin; wire s, cout; integer i;\n  fa u(.a(a), .b(b), .cin(cin), .s(s), .cout(cout));\n  initial for (i = 0; i < 8; i = i + 1) begin\n    {a, b, cin} = i; #1;\n    $display("%b + %b + %b = %b%b", a, b, cin, cout, s);\n  end\nendmodule', run: true, caption: 'The same full adder in Verilog. Run it: each line is one row of the table, written as a two-bit sum.' },
      { h: 'Recap' },
      { list: ['Half adder: S = A ⊕ B, C = AB.', 'Full adder: S = A ⊕ B ⊕ Cin, Cout = AB + Cin(A ⊕ B).', 'Two half adders and an OR gate make a full adder.', 'Generate (AB) makes a carry by itself; propagate (A ⊕ B) passes the incoming one on.'] },
      X('comb-ex-fa-table'), X('comb-ex-ha-nand'), X('comb-ex-fa-from-ha'),
    ],
  });

  C.lesson({
    id: 'comb-ripple', chapter: 'comb-arith', title: 'The ripple-carry adder and its crawling carry', minutes: 7,
    summary: 'Chain n full adders, carry out to carry in, and you can add n-bit numbers. The price is time: in the worst case the carry must pass through every stage.',
    blocks: [
      'Four full adders in a row, each carry out wired to the next carry in, add two 4-bit numbers. The circuit is simple, but it has a habit you can see only in time: a change at the right-hand end may have to travel all the way to the left before the answer is right.',
      { circuit: RIP2, outputs: ['S1', 'S0', 'C2'], inputs: { A0: 1, A1: 1, B0: 1 }, caption: 'Two full adders make a 2-bit adder: 11 + 01 = 100. Raise C0 too and the sum becomes 101.' },
      { h: 'Watching the carry crawl' },
      'The worst case is a number that is all ones plus a carry: 1111 + 0000 with C0 rising from 0 to 1. Every bit has A ⊕ B = 1, so every stage propagates, and each stage has to wait for the stage before it.',
      { topic: 'ripple-carry', frame: 7, caption: 'C2 has just risen, 40 ns after C0. Each stage adds an AND and an OR delay to the carry, about 20 ns. Step on to C4.' },
      { predict: { q: 'In this 4-bit adder each stage adds 20 ns to the carry. If it had 16 bits, roughly how long would 1111…1 + 1 take?', options: ['About 80 ns', 'About 320 ns', 'About 20 ns'], answer: 1, explain: 'The carry passes through all 16 stages, about 20 ns each: the delay grows in proportion to the width.' } },
      { tip: 'The adder\'s delay depends on the numbers. 0101 + 0010 has no carries at all and settles in one stage\'s time. A design must assume the worst case.' },
      { h: 'One chip' },
      'The 74283 holds a whole 4-bit adder in one package, with a carry in and a carry out so that chips can be chained. Its bits are numbered 1 to 4, not 0 to 3. In the lab you set two numbers on eight switches and read the sum on five LEDs.',
      LAB('comb-lab-adder'),
      { h: 'Recap' },
      { list: ['n full adders in a chain make an n-bit ripple-carry adder.', 'The carry out of the top stage is the (n + 1)th bit of the sum.', 'Worst-case delay grows linearly with n, because the carry may pass through every stage.'] },
      X('comb-ex-ripple-time'), X('comb-ex-lab-adder'),
    ],
  });

  C.lesson({
    id: 'comb-lookahead', chapter: 'comb-arith', title: 'Carry lookahead: computing every carry at once', minutes: 8,
    summary: 'Instead of waiting for each carry, a lookahead adder computes all of them from the generate and propagate signals in two gate levels.',
    blocks: [
      'The ripple adder is slow because carry i waits for carry i − 1. But every carry is a function of the inputs, so in principle each one could be computed directly, in a fixed number of gate levels. Carry lookahead does exactly that.',
      { h: 'Generate and propagate' },
      'For each bit, Gi = AiBi says "this bit makes a carry by itself" and Pi = Ai ⊕ Bi says "this bit passes an incoming carry on". Both come one gate after the inputs. The carry rule is then',
      { math: 'C(i+1) = Gi + Pi·Ci' },
      'and unrolling it gives every carry as a sum of products of G, P and C0:',
      { math: 'C1 = G0 + P0C0\nC2 = G1 + P1G0 + P1P0C0\nC3 = G2 + P2G1 + P2P1G0 + P2P1P0C0\nC4 = G3 + P3G2 + P3P2G1 + P3P2P1G0 + P3P2P1P0C0' },
      { predict: { q: 'Read C2 = G1 + P1G0 + P1P0C0 in words. Which term says "the carry from C0 makes it through both bits"?', options: ['G1', 'P1G0', 'P1P0C0'], answer: 2, explain: 'C0 must be there, and both bits must propagate it: P1P0C0.' } },
      { topic: 'carry-lookahead', input: { n: '4', a: '0111', b: '0001', tech: 'CMOS' }, frame: 1, caption: 'The carries unrolled (4 bits here): every one is an OR of ANDs, two gate levels however far the carry comes from.' },
      { h: 'The race' },
      { topic: 'carry-lookahead', frame: 18, caption: '11111111 + 00000001 on an 8-bit adder: lookahead is done in 73 ns, ripple in 160 ns.' },
      { warn: 'Lookahead is not free. C4 already needs a five-input AND and a five-input OR, and the gates grow with every bit. Real adders use groups of four, with a second level of lookahead between the groups.' },
      { h: 'Recap' },
      { list: ['Gi = AiBi, Pi = Ai ⊕ Bi, and C(i+1) = Gi + PiCi.', 'Unrolled, every carry is two gate levels from G, P and C0.', 'Each sum bit is then Si = Pi ⊕ Ci.', 'The cost grows quickly with the group size, so lookahead is done in blocks.'] },
      X('comb-ex-cla-proof'), X('comb-ex-cla-c4'),
    ],
  });

  C.lesson({
    id: 'comb-addsub', chapter: 'comb-arith', title: 'Subtraction, overflow and decimal addition', minutes: 9,
    summary: 'One adder subtracts too: invert B with XOR gates and add 1 through the carry in. Overflow is read from the sign bits. A BCD adder adds in binary and corrects with +6.',
    blocks: [
      'A processor has one adder, yet it subtracts. In two\'s complement, A − B = A + B′ + 1. So XOR each B bit with a control signal M (which inverts it when M = 1) and feed M into the carry in as the +1. With M = 0 the same circuit adds.',
      { circuit: ADDSUB2, outputs: ['S1', 'S0', 'Co'], inputs: { A1: 1, B0: 1, M: 1 }, caption: 'A 2-bit adder–subtractor working out 10 − 01 = 01. Flip M to 0 and it adds instead: 10 + 01 = 11.' },
      { topic: 'adder-subtractor', input: { a: 5, b: 3, op: 'sub' }, frame: 11, caption: '5 − 3 on four bits. C4 = 1 means no borrow (A ≥ B, read as unsigned); V = 0 means the signed answer is right.' },
      { h: 'Overflow' },
      'Four bits of two\'s complement hold −8 to +7. Adding two numbers of the same sign can leave that range, and the sign bit of the sum then comes out wrong. Two ways to detect it give the same answer:',
      { list: ['the numbers have the same sign but the sum has the other sign: V = A3B3S3′ + A3′B3′S3;', 'the carry into the sign bit differs from the carry out of it: V = C3 ⊕ C4.'] },
      { predict: { q: 'On four bits, does −3 + (−2) overflow?', options: ['Yes', 'No'], answer: 1, explain: '−5 is within −8 … +7. 1101 + 1110 = 1 1011: the carry out is 1, but so is the carry into the sign bit, and 1011 is −5.' } },
      { topic: 'adder-subtractor', input: { a: -3, b: -2, op: 'add' }, frame: 7, caption: 'Check the prediction: the carry out is 1, yet V = 0.' },
      { h: 'Decimal addition' },
      'A BCD adder adds one decimal digit per four bits. A binary adder gives the right answer when the sum is 9 or less. When it is more, the six unused codes 1010 to 1111 have been counted, so the digit is corrected by adding 6, and a decimal carry goes to the next digit. The correction is needed when K = C + Z3Z2 + Z3Z1.',
      { topic: 'bcd-adder', frame: 2, caption: '7 + 8 gives 1111 in binary. K = 1, so 0110 is added: the digit becomes 0101 and a decimal carry goes left.' },
      { h: 'Recap' },
      { list: ['A − B = A + B′ + 1: XOR B with M and carry M in.', 'Overflow: same-sign operands, other-sign sum; equivalently C3 ⊕ C4.', 'A BCD digit sum above 9 is corrected by adding 0110, which also produces the decimal carry.'] },
      X('comb-ex-addsub'), X('comb-ex-overflow-pick'), X('comb-ex-overflow-circuit'), X('comb-ex-bcd-detect'), X('comb-ex-bcd-sum'),
    ],
  });

  C.lesson({
    id: 'comb-mul-cmp', chapter: 'comb-arith', title: 'Multipliers and magnitude comparators', minutes: 8,
    summary: 'A binary multiplier is AND gates for the partial products and rows of adders to sum them. A comparator decides A > B, A = B or A < B by looking from the most significant bit down.',
    blocks: [
      'Multiplying by hand in binary is easy: each digit of the multiplier is 0 or 1, so each row is either nothing or a shifted copy of the multiplicand. In hardware a row is a set of AND gates, and the rows are summed by adders.',
      { topic: 'array-multiplier', frame: 5, caption: '101 × 111: three rows of three AND gates, then two rows of adders. The product, 100011 = 35, appears here.' },
      { predict: { q: 'How many AND gates make the partial products of a 4-bit × 4-bit multiplier?', options: ['4', '8', '16'], answer: 2, explain: 'Every bit of A meets every bit of B: 4 × 4 = 16 AND gates.' } },
      { circuit: MUL2, outputs: ['P3', 'P2', 'P1', 'P0'], inputs: { A1: 1, A0: 1, B1: 1 }, caption: 'A 2 × 2 multiplier from four ANDs and two half adders: 11 × 10 = 0110. Set B0 too for 11 × 11 = 1001.' },
      { h: 'Comparing magnitudes' },
      'To compare two numbers, look at the most significant bits first. If they differ, they decide. If they are equal, move down one bit. A = B only when every pair agrees. With xi = 1 when Ai and Bi agree (an XNOR), for four bits:',
      { math: "EQ = x3x2x1x0\nGT = A3B3' + x3A2B2' + x3x2A1B1' + x3x2x1A0B0'\nLT = A3'B3 + x3A2'B2 + x3x2A1'B1 + x3x2x1A0'B0" },
      { topic: 'magnitude-comparator', frame: 3, caption: '11 against 9: bits 3 and 2 agree, bit 1 decides. Step on to see the gates settle.' },
      { tip: 'The 7485 has three extra inputs, A>B, A=B and A<B "from below", so that a chip comparing the low four bits can hand its verdict to the chip comparing the next four. Used alone, its A=B input must be held high.' },
      LAB('comb-lab-compare'),
      { h: 'Recap' },
      { list: ['An n × m multiplier needs n·m AND gates and m − 1 rows of adders.', 'A comparator scans from the top: the first pair of bits that differ decides.', 'xi = (Ai ⊕ Bi)′ says "equal so far"; EQ is the AND of all of them.'] },
      X('comb-ex-mul2'), X('comb-ex-cmp-eq'), X('comb-ex-cmp-gt'), X('comb-ex-cmp-verilog'), X('comb-ex-lab-compare'),
    ],
  });

  // =========================================================================================================
  // Chapter 3: decoders, multiplexers and buses
  // =========================================================================================================
  C.lesson({
    id: 'comb-decoders', chapter: 'comb-select', title: 'Decoders and encoders', minutes: 8,
    summary: 'A decoder turns an n-bit address into one active line out of 2ⁿ. An encoder does the reverse, and a priority encoder copes with several lines active at once.',
    blocks: [
      'A memory has eight chips and a 3-bit number that says which one to use. Exactly one chip must hear "it is you". The circuit that turns a binary number into one line out of many is a **decoder**: each of its outputs is one minterm of the address.',
      { topic: 'decoder', frame: 5, caption: 'A 2-to-4 decoder with an enable. Address 01: only Y1 is high. The last frame shows what E = 0 does.' },
      { circuit: DEC24, outputs: ['Y0', 'Y1', 'Y2', 'Y3'], inputs: { E: 1, A1: 1 }, caption: 'Change the address and exactly one output follows. Turn E off and all four go to 0.' },
      { predict: { q: 'How many 2-to-4 decoders with enables, plus one inverter, does a 3-to-8 decoder take?', options: ['Two', 'Three', 'Four'], answer: 0, explain: 'The top address bit enables one decoder directly and the other through the inverter; the low bits go to both.' } },
      { topic: 'decoder-tree', input: { kind: '38', seq: '1, 5, 6, 3' }, frame: 5, caption: 'Address 101: the high bit enables the upper decoder, the low bits pick its output 1, which is Y5.' },
      { h: 'Encoders' },
      'An encoder goes the other way: one of 2ⁿ lines is active and the output is its number. With OR gates, Y1 = D2 + D3 and Y0 = D1 + D3. It has two blind spots: two active lines mix their numbers, and "no line" looks the same as D0.',
      { topic: 'encoder', frame: 8, caption: 'D2 and D1 both active: the ORs give 11 = 3, which is wrong for both.' },
      'A **priority encoder** fixes both: the highest-numbered active input wins, and a valid output V says whether any input is active at all.',
      { topic: 'priority-encoder', frame: 8, caption: 'D2, D1 and D0 active: D2 wins. The term D2′D1 is 0 because D2 blocks D1.' },
      { kmap: { vars: ['D3', 'D2', 'D1', 'D0'], minterms: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], groups: 'minimal' }, caption: 'Y1 of the priority encoder is 1 when input 2 or 3 wins: Y1 = D3 + D2.' },
      { h: 'Recap' },
      { list: ['A decoder\'s outputs are the minterms of its address, gated by its enable.', 'Big decoders are built from small ones, with the high address bits choosing which small one is enabled.', 'A plain encoder fails with two active inputs or none; a priority encoder picks the highest and adds a valid bit.'] },
      X('comb-ex-dec-tree'), X('comb-ex-prienc-y0'),
    ],
  });

  C.lesson({
    id: 'comb-decoder-functions', chapter: 'comb-select', title: 'Any function from a decoder', minutes: 7,
    summary: 'A decoder makes every minterm of its inputs, so any function of those inputs is an OR of some of its outputs. With active-low outputs, the OR becomes a NAND.',
    blocks: [
      'A sum of minterms needs an AND gate for each minterm and an OR to collect them. A 3-to-8 decoder already *is* the eight AND gates. So any function of three variables is a decoder and one OR gate, and a second function of the same inputs costs just one more OR.',
      { topic: 'decoder-functions', frame: 16, caption: 'F1 = Σm(1, 2, 4, 7) and F2 = Σm(3, 5, 6, 7) from one decoder: the sum and the carry of a full adder.' },
      { circuit: DEC_FA, outputs: ['S', 'Co'], inputs: { A: 1, C: 1 }, caption: 'The full adder from a decoder: try 1 + 0 + 1.' },
      { predict: { q: 'A function has 7 minterms out of 8. What is the cheapest way to make it from the decoder?', options: ['An OR of the seven outputs', 'An inverter on the one missing output', 'It cannot be done with one decoder'], answer: 1, explain: 'F is 1 except at one minterm, so F is the complement of that one output: F = (Yk)′.' } },
      { h: 'Active-low outputs' },
      'Chips such as the 74138 have **active-low** outputs: the selected line goes to 0 and the others stay at 1. Collecting minterms then needs a gate whose output is 1 when *any* input is 0, which is a NAND. With only 2-input gates, AND pairs of lines first (an AND of active-low lines is 0 when either is active), then NAND the results.',
      { warn: 'The 74138 also has three enables, G1 (active high) and G2A′, G2B′ (active low). Leave any of them wrong and every output stays high, so the functions read 0 everywhere.' },
      LAB('comb-lab-decoder'),
      { h: 'Recap' },
      { list: ['n-to-2ⁿ decoder + one OR per function = any functions of n variables.', 'No minimising is needed; the decoder is shared by every function of the same inputs.', 'Active-low outputs: use a NAND (or ANDs then a NAND) in place of the OR.'] },
      X('comb-ex-dec-fn'), X('comb-ex-dec-active-low'), X('comb-ex-lab-decoder'),
    ],
  });

  C.lesson({
    id: 'comb-mux', chapter: 'comb-select', title: 'Multiplexers, and functions from one', minutes: 9,
    summary: 'A multiplexer passes the data input chosen by its select lines. With n − 1 variables on the selects, one multiplexer makes any function of n variables.',
    blocks: [
      'Four sensors, one wire to the display, and a 2-bit number that says which sensor to show. A **multiplexer** is a switch made of gates: its output is the data input numbered by the select lines.',
      { math: "Y = S1'S0'I0 + S1'S0I1 + S1S0'I2 + S1S0I3" },
      { topic: 'multiplexer', frame: 5, caption: 'S1 S0 = 01 selects I1. Only the AND gate whose select terms are both 1 can pass its data.' },
      { predict: { q: 'An 8-to-1 multiplexer tree is built from 2-to-1 multiplexers. How many levels deep is it?', options: ['2', '3', '8'], answer: 1, explain: 'Each level halves the number of candidates: 8 → 4 → 2 → 1, three levels, one select bit each.' } },
      { topic: 'mux-tree', frame: 5, caption: 'S2 S1 S0 = 101: S0 picks within each pair, S1 between pairs, S2 between halves. The path is lit.' },
      { h: 'A function from one multiplexer' },
      'Put n − 1 of the variables on the select lines. Each data input then stands for two rows of the truth table that differ only in the last variable, say C. In those two rows F is 0, 1, C or C′, and that is what the data input gets.',
      { topic: 'mux-function', input: { n: '3', fn: '1, 2, 6, 7' }, frame: 4, caption: 'F = Σm(1, 2, 6, 7): the four pairs give I0 = C, I1 = C′, I2 = 0, I3 = 1.' },
      'Here is the majority of A, B and C done the same way. Rows 0 and 1 are both 0; rows 2, 3 give C; rows 4, 5 give C; rows 6, 7 are both 1.',
      { circuit: MAJ_MUX, outputs: ['F'], inputs: { A: 1, C: 1 }, caption: 'Majority from one 4-to-1 multiplexer and no gates at all: d0 = 0, d1 = C, d2 = C, d3 = 1.' },
      { tip: 'The 74151 is an 8-to-1 multiplexer with an active-low enable G′ and both outputs, Y and its complement W. With three variables on its selects it makes any function of four, and sometimes, as in the lab, without a single inverter.' },
      LAB('comb-lab-mux'),
      { h: 'Recap' },
      { list: ['A 2ⁿ-to-1 multiplexer is an AND-OR of every minterm of the selects with its data input.', 'Big multiplexers are trees of small ones, one select bit per level.', 'With n − 1 variables on the selects, each data input is 0, 1, x or x′: any function of n variables.'] },
      X('comb-ex-mux-fn'), X('comb-ex-mux-4var'), X('comb-ex-mux-verilog'), X('comb-ex-mux-time'), X('comb-ex-lab-mux'),
    ],
  });

  C.lesson({
    id: 'comb-buses', chapter: 'comb-select', title: 'Demultiplexers, tristate buffers and buses', minutes: 7,
    summary: 'A demultiplexer sends one input to the output chosen by its selects, and is a decoder with its enable used as data. Tristate buffers let several drivers share one wire, one at a time.',
    blocks: [
      'The opposite of a multiplexer takes one data line and steers it to one of several outputs. Look at its equations, Yi = D·(minterm i of S), and you have seen it before: it is a decoder whose enable carries the data.',
      { topic: 'demultiplexer', frame: 9, caption: 'One circuit, two readings: "which output is active" (a decoder) or "where does the data go" (a demultiplexer).' },
      { waveform: { circuit: DEMUX, inputs: { S1: '00001111', S0: '00110011', D: '10110110' }, outputs: ['Y0', 'Y1', 'Y2', 'Y3'] }, caption: 'The data D, steered to Y0, Y1, Y2 and Y3 in turn as S1 S0 counts. Each output copies D only while it is selected.' },
      { h: 'Sharing one wire' },
      'A bus is a set of wires that several units take turns to drive. An ordinary gate output always drives, high or low, so two of them on one wire would fight. A **tristate buffer** has a third state, Z (high impedance), in which it lets go of the wire entirely.',
      { def: 'Tristate buffer', text: 'passes its input to its output while enabled; while disabled its output is Z and it neither pulls the wire up nor down.' },
      { topic: 'tristate-bus', frame: 3, caption: 'Only buffer 1 is enabled: it drives D1 = 0 onto the bus; the others are Z.' },
      { predict: { q: 'Buffers 0 and 1 are enabled together, driving 1 and 0. What does the bus read?', options: ['1', '0', 'Z', 'X'], answer: 3, explain: 'Contention: two drivers disagree, the level is unknown (X), and in a real circuit a large current flows.' } },
      { topic: 'tristate-bus', frame: 7, caption: 'Contention, as predicted. The last frame shows the cure: drive the enables from a decoder, so at most one is ever on.' },
      { h: 'Recap' },
      { list: ['A demultiplexer is a decoder with its enable used as the data input.', 'Tristate outputs are 0, 1 or Z; a bus is shared by enabling one driver at a time.', 'Two enabled drivers that disagree give X (contention); a floating bus with no driver is Z.', 'A decoder on the enables guarantees at most one driver.'] },
      X('comb-ex-demux-wave'), X('comb-ex-bus-fight'),
    ],
  });

  // ---- a guided tour -------------------------------------------------------------------------------------------
  C.tour({
    id: 'comb-tour', title: 'Tour: combinational logic', blurb: 'From an adder to a bus, in eight steps.',
    steps: [
      { route: 'part=combinational', target: '#main', text: 'Part 4 of the catalogue: combinational logic. Each card is a topic that runs one circuit and explains it step by step.' },
      { route: 'topic=ripple-carry', target: '#stageWrap', text: 'A ripple-carry adder. The carry crawls from the right; the narration gives the time of every change.' },
      { target: '#btnPlay', text: 'Play steps through the run; the arrow keys go one step at a time, forwards or back.' },
      { target: '#inputs', text: 'Change the numbers, the width or the technology here, or pick an example. Try 7 + 1 with every input changing at once.' },
      { route: 'topic=carry-lookahead', target: '#stageWrap', text: 'Carry lookahead raced against ripple on the same numbers. Green bits are final, red ones still wrong.' },
      { route: 'topic=mux-function', target: '#inputs', text: 'Any function from one multiplexer. Type your own minterms and watch the data inputs worked out pair by pair.' },
      { route: 'lab=comb-lab-adder', target: '#labExp', text: 'The lab bench: a 74283 adder to wire with jumpers, switches and LEDs. The panel gives the aim, the steps and a table to fill in.' },
      { route: 'learn', target: '[data-chapter="comb-procedures"]', text: 'The lessons and exercises of this part start here. Circuits you build are checked on every input row, with the first row that differs.' },
    ],
  });

  // ---- a course through every topic of the part ---------------------------------------------------------------
  C.course({
    id: 'comb-course', title: 'Combinational logic, start to finish', blurb: 'An ordered path through every topic of part 4, from reading a circuit to sharing a bus, with lessons and exercises on the way.',
    steps: [
      { topic: 'analysis-procedure', note: 'Name every gate, substitute back, fill the table.' },
      { topic: 'design-procedure', note: 'Words → table → map → gates → run every row.' },
      { lesson: 'comb-design', note: 'The procedure with a perfect-square detector, and don\'t-cares.' },
      { exercise: 'comb-ex-exactly-two', note: 'Your first design from words.' },
      { topic: 'bcd-excess3', note: 'Four maps, six don\'t-cares each.' },
      { topic: 'gray-converter', note: 'One XOR per bit; only one Gray bit changes per step.' },
      { topic: 'bcd-seven-segment', note: 'Seven functions of one digit, and a display that lights.' },
      { topic: 'half-adder', note: 'Sum is XOR, carry is AND.' },
      { topic: 'full-adder', note: 'Generate, propagate, kill.' },
      { exercise: 'comb-ex-fa-from-ha', note: 'Two half adders and an OR.' },
      { topic: 'ripple-carry', note: 'Watch the carry crawl, about 20 ns a stage.' },
      { topic: 'carry-lookahead', note: 'Every carry in two levels, and the race it wins.' },
      { topic: 'adder-subtractor', note: 'A − B = A + B′ + 1, and the overflow flag.' },
      { topic: 'bcd-adder', note: 'Binary sum, then +6 when it is over 9.' },
      { lesson: 'comb-addsub', note: 'Subtraction, overflow and decimal addition together.' },
      { topic: 'array-multiplier', note: 'AND gates for the rows, adders to sum them.' },
      { topic: 'magnitude-comparator', note: 'The first differing bit from the top decides.' },
      { exercise: 'comb-ex-cmp-gt', note: 'A comparator for two bits, from gates.' },
      { topic: 'decoder', note: 'One output per address, held off by the enable.' },
      { topic: 'decoder-tree', note: 'High bits pick the decoder, low bits the line.' },
      { topic: 'decoder-functions', note: 'Every minterm is already made: just OR them.' },
      { topic: 'encoder', note: 'The way back, and its two blind spots.' },
      { topic: 'priority-encoder', note: 'The highest input wins; V says whether any did.' },
      { topic: 'multiplexer', note: 'A selector switch made of AND-OR.' },
      { topic: 'mux-tree', note: 'One select bit per level.' },
      { topic: 'mux-function', note: 'Each data input is 0, 1, x or x′.' },
      { exercise: 'comb-ex-mux-fn', note: 'Three variables on one 4-to-1 multiplexer.' },
      { topic: 'demultiplexer', note: 'A decoder whose enable carries data.' },
      { topic: 'tristate-bus', note: 'Z, contention, and a decoder on the enables.' },
      { lesson: 'comb-buses', note: 'Buses, and why only one driver may talk.' },
    ],
  });

  // ---- what the diagram checker looks at on these pages -------------------------------------------------------
  if (S.Checks && !S.Checks.some((c) => c.name === 'lesson comb-analysis')) {
    const lessonReady = "document.querySelector('#lessonView')", exReady = "document.querySelector('#exerciseView')";
    for (const id of C.chapters.filter((c) => c.part === 'combinational').flatMap((c) => c.lessons)) S.Checks.push({ group: 'learn', name: 'lesson ' + id, hash: 'lesson=' + id, ready: lessonReady, sel: '#main' });
    for (const id of ['comb-ex-analyse-table', 'comb-ex-mult3-kmap', 'comb-ex-gray-wave', 'comb-ex-seg-four', 'comb-ex-gray-verilog', 'comb-ex-fa-table', 'comb-ex-ripple-time', 'comb-ex-cla-proof', 'comb-ex-addsub', 'comb-ex-mul2', 'comb-ex-dec-tree', 'comb-ex-mux-time', 'comb-ex-demux-wave', 'comb-ex-lab-display'])
      S.Checks.push({ group: 'learn', name: 'exercise ' + id, hash: 'exercise=' + id, ready: exReady, sel: '#main' });
    for (const id of ['comb-lab-adder', 'comb-lab-decoder', 'comb-lab-mux', 'comb-lab-compare', 'comb-lab-display'])
      S.Checks.push({ group: 'learn', name: 'lab ' + id, hash: 'lab=' + id, ready: "document.querySelector('#labExp')", sel: '#main' });
    S.Checks.push({ group: 'learn', name: 'course comb-course', hash: 'course=comb-course', ready: "document.querySelector('#courseView')", sel: '#main' });
  }
})(globalThis.Sirkit = globalThis.Sirkit || {});
