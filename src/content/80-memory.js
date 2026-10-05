// Part 8, memory and programmable logic: the chapters, the lessons, two bench labs, a guided tour and a course.
// The exercises are in 80-memory-ex.js. Each lesson starts from a question, embeds the topic that animates its idea
// with an input chosen for the point being made, asks for a prediction, gives a circuit, a map or a waveform to
// try, sums up, and leads to its exercises. Every memory, word and function here is our own.
(function (S) {
  'use strict';
  const C = S.Content;
  if (!C || C.lessons.has('mem-words')) return;
  const M = S.MemContent || {};
  if (M.chapters) M.chapters();
  const X = (id) => ({ exercise: id });

  const DEC24 = 'na = NOT(A1)\nnb = NOT(A0)\nW0 = AND(E, na, nb)\nW1 = AND(E, na, A0)\nW2 = AND(E, A1, nb)\nW3 = AND(E, A1, A0)';
  const SYN12 = 'a = XOR(B1, B3)\nb = XOR(B5, B7)\nS1 = XOR(a, b)\nc = XOR(B2, B3)\nc2 = XOR(B6, B7)\nS2 = XOR(c, c2)';

  // ---- labs ------------------------------------------------------------------------------------------------------
  const ONES = [0, 1, 2, 3, 4, 5, 6, 7];
  if (C.lab) {
    C.lab({
      id: 'mem-lab-select', chapter: 'mem-ram', title: 'Chip selects from a 74138',
      aim: 'Decode the high address bits of a memory built from eight chips: a 74138 turns three address bits into eight active-low chip-select lines, and an enable stops every chip while the memory is not in use.',
      parts: ['74138'],
      steps: ['Power the 74138: pin 16 to +5 V, pin 8 to ground.', 'Tie G2A′ (pin 4) and G2B′ (pin 5) to ground. G1 (pin 6) is the memory enable: wire it to switch S3.', 'Wire S0, S1, S2 (address bits A3, A4, A5 of the memory) to the select inputs A, B, C (pins 1, 2, 3).', 'Take Y0′–Y6′ (pins 15 down to 9) and Y7′ (pin 7) to LEDs 0–7. A lit LED is a chip left alone; the dark one is the chip selected.', 'With S3 up, find for each LED the setting of S2 S1 S0 that makes it the dark one, and write it in the table. Then lower S3: every LED should light, since no chip is selected.'],
      observe: { rows: ['LED 0', 'LED 1', 'LED 2', 'LED 3', 'LED 4', 'LED 5', 'LED 6', 'LED 7'], cols: ['S2', 'S1', 'S0'], corner: 'dark LED', cellKind: 'bit', cells: { 'LED 0|S2': '0', 'LED 0|S1': '0', 'LED 0|S0': '0', 'LED 1|S2': '0', 'LED 1|S1': '0', 'LED 1|S0': '1', 'LED 2|S2': '0', 'LED 2|S1': '1', 'LED 2|S0': '0', 'LED 3|S2': '0', 'LED 3|S1': '1', 'LED 3|S0': '1', 'LED 4|S2': '1', 'LED 4|S1': '0', 'LED 4|S0': '0', 'LED 5|S2': '1', 'LED 5|S1': '0', 'LED 5|S0': '1', 'LED 6|S2': '1', 'LED 6|S1': '1', 'LED 6|S0': '0', 'LED 7|S2': '1', 'LED 7|S1': '1', 'LED 7|S0': '1' } },
      checks: [{ kind: 'power' }, { kind: 'truth', inputs: ['S3', 'S2', 'S1', 'S0'], outputs: Object.fromEntries(ONES.map((k) => ['led' + k, (env) => (env.S3 && env.S2 * 4 + env.S1 * 2 + env.S0 === k ? '0' : '1')])) }],
      reference: M.SELECT_BOARD,
    });
    const syn = (env) => { const b = (i) => env['S' + (i - 1)]; return (b(1) ^ b(3) ^ b(5) ^ b(7)) | ((b(2) ^ b(3) ^ b(6) ^ b(7)) << 1) | ((b(4) ^ b(5) ^ b(6) ^ b(7)) << 2); };
    C.lab({
      id: 'mem-lab-syndrome', chapter: 'mem-ecc', title: 'A Hamming checker on the bench',
      aim: 'Read a 7-bit Hamming word from the switches, compute its syndrome with eight XOR gates, and let a 74138 point at the wrong bit: the one dark LED is the position of the error, LED 0 when the word is good.',
      parts: ['7486', '7486', '74138'],
      steps: ['Power all three chips. On the 74138 tie G1 (pin 6) to +5 V and G2A′, G2B′ (pins 4, 5) to ground.', 'Switches S0–S6 are the bits B1–B7 of the word, position 1 on S0.', 'First 7486: gate 1 makes B1 ⊕ B3, gate 2 makes B5 ⊕ B7, gate 3 XORs those two into S1, gate 4 makes B6 ⊕ B7.', 'Second 7486: gate 1 makes B2 ⊕ B3, gate 2 XORs it with B6 ⊕ B7 into S2; gate 3 makes B4 ⊕ B5, gate 4 XORs it with B6 ⊕ B7 into S4.', 'S1, S2, S4 go to the 74138\'s A, B, C (pins 1, 2, 3); its eight outputs go to LEDs 0–7.', 'Set each word of the table on S0–S6 (the leftmost bit is S0) and write down the number of the dark LED in binary, as S4 S2 S1.'],
      observe: { rows: ['0110011', '0110001', '1110011', '0111011', '0110010', '0010011'], cols: ['S4', 'S2', 'S1'], corner: 'word B1…B7', cellKind: 'bit', cells: { '0110011|S4': '0', '0110011|S2': '0', '0110011|S1': '0', '0110001|S4': '1', '0110001|S2': '1', '0110001|S1': '0', '1110011|S4': '0', '1110011|S2': '0', '1110011|S1': '1', '0111011|S4': '1', '0111011|S2': '0', '0111011|S1': '0', '0110010|S4': '1', '0110010|S2': '1', '0110010|S1': '1', '0010011|S4': '0', '0010011|S2': '1', '0010011|S1': '0' } },
      checks: [{ kind: 'power' }, { kind: 'truth', inputs: ['S6', 'S5', 'S4', 'S3', 'S2', 'S1', 'S0'], outputs: Object.fromEntries(ONES.map((k) => ['led' + k, (env) => (syn(env) === k ? '0' : '1')])) }],
      reference: M.SYNDROME_BOARD,
    });
  }

  // =========================================================================================================
  // Chapter 1: random-access memory
  // =========================================================================================================
  C.lesson({
    id: 'mem-words', chapter: 'mem-ram', title: 'Words, addresses and a decoder', minutes: 8,
    summary: 'A RAM is a stack of registers called words; an address picks one through a decoder, and only that word meets the data lines.',
    blocks: [
      'A memory chip may hold millions of bits, yet it has only a few dozen pins. How does a number on a handful of wires reach exactly one word inside, read it or change it, and leave every other word alone?',
      'Picture the memory as a table. Each row is a **word** of a fixed width; each row has a number, its **address**. With *k* address lines you can name 2ᵏ rows, so a memory of 2ᵏ words of *n* bits is called a 2ᵏ × *n* memory.',
      { def: 'Word line', text: 'the wire along one row that connects that word to the data lines. A decoder raises exactly one word line, the one the address names.' },
      { topic: 'ram-organisation', frame: 1, caption: 'An 8 × 4 RAM. The address 101 reaches the decoder and word line 5 alone goes up. Step on to watch a write of 0110 change word 5 and nothing else, then a read bring it back.' },
      { predict: { q: 'A RAM holds 16 words of 4 bits. How many address lines does it need?', options: ['2', '4', '16'], answer: 1, explain: '2⁴ = 16 words. The width of a word (4 bits) sets the data lines, not the address lines.' } },
      { h: 'The decoder inside' },
      'The decoder is nothing new: one AND gate per word, each fed by the address bits true or complemented, plus an enable that holds every word line low when the memory is not in use. Flip the address and the enable here and watch exactly one line rise.',
      { circuit: DEC24, outputs: ['W0', 'W1', 'W2', 'W3'], inputs: { A1: 1, A0: 0, E: 1 }, caption: 'A four-word decoder. With A1 A0 = 10 and E = 1, only W2 is 1. Set E to 0: every word line falls, and no word can be read or written.' },
      { math: 'words  = 2^(address lines)\nbits   = words × word width\n4096 × 8 memory: 12 address lines, 8 data lines, 32768 bits' },
      { tip: 'Address lines grow with the logarithm of the size: doubling the memory adds just one address line. That is why a chip with a billion words needs only about thirty.' },
      { h: 'Recap' },
      { list: ['A RAM is 2ᵏ words of n bits; k address lines, n data lines.', 'A decoder turns the address into one word line; only that word meets the data lines.', 'A write changes the selected word only; a read changes nothing.'] },
      X('mem-ex-address-bits'), X('mem-ex-word-decoder'), X('mem-ex-decoder-delay'),
    ],
  });
  C.lesson({
    id: 'mem-cycles', chapter: 'mem-ram', title: 'Read and write cycles in time', minutes: 8,
    summary: 'A write is a pulse on WE while the address and data hold still; a read is a wait, one access time long, before the data can be trusted.',
    blocks: [
      'A processor sets an address, asks for a word and wants it at once. But inside the chip the address must pass through a decoder, a long word line and a sense amplifier. How long must it wait, and what happens if it changes the address too soon?',
      { h: 'Writing' },
      'A write needs three things together: the chip selected (CS = 1), the address and the data steady, and then a pulse on the write enable WE. While WE is 1 the data flows into the selected word; when WE falls, the word keeps what it held at that moment.',
      { topic: 'ram-cycles', frame: 4, caption: 'A write of 1010 into word 2. Look at the order: address first, then CS, and only then the WE pulse. The word is settled when WE falls at 60 ns.' },
      { warn: 'Change the address while WE is still 1 and the data is written into every word the address passes through on its way. The address must be steady for the whole pulse.' },
      { h: 'Reading' },
      'A read needs no pulse: select the chip, enable the outputs, and wait. The time from a steady address to valid data is the **access time**, here 30 ns for the CMOS chip.',
      { predict: { q: 'The outputs are enabled at 100 ns and the access time is 30 ns. What does DOUT show at 115 ns?', options: ['The word at address 2, 1010', 'Nothing it can be trusted for yet', 'Always 0000'], answer: 1, explain: 'The data arrives one access time after the outputs are enabled, a little after 130 ns. Before that the outputs are not yet valid.' } },
      { topic: 'ram-cycles', frame: 8, caption: 'One access time after the outputs are enabled, DOUT shows 1010, the word written earlier. Try the TTL chip on the topic\'s own page: the wait grows to 45 ns.' },
      { h: 'Cycle by cycle' },
      'A synchronous RAM writes at a clock edge instead of during a pulse, which makes its timing easy to read cycle by cycle. Here a two-word, one-bit RAM: in each cycle Q shows the word that A names, and the edge at the end of a cycle with WE = 1 stores D.',
      { waveform: { circuit: 'm = RAM[aw=1, dw=1, sync=true](a=A, din=D, we=WE)\nQ = m', inputs: { A: '0011', D: '1100', WE: '1010' }, clocked: true, outputs: ['Q'] }, caption: 'Cycle 1 writes 1 into word 0; cycle 2 still reads it as 1. Cycle 3 reads word 1 (0) and writes 0 into it; cycle 4 reads that 0.' },
      { h: 'Recap' },
      { list: ['Write: address and data steady, chip selected, then a WE pulse; the word keeps the data present when WE falls.', 'Read: select, enable the outputs, and wait one access time.', 'A synchronous RAM writes at the clock edge; its read still shows the word that A names.'] },
      X('mem-ex-ram-wave'), X('mem-ex-ram-verilog'),
    ],
  });
  C.lesson({
    id: 'mem-square', chapter: 'mem-ram', title: 'Coincident decoding: memory as a square', minutes: 7,
    summary: 'Arranged as a square, a memory needs two small decoders instead of one huge one: a cell is chosen where a row line and a column line cross.',
    blocks: [
      'A memory of a million cells with one decoder would need a million AND gates of twenty inputs each. Nobody builds that. What if the cells were arranged as a square instead of a column?',
      'Split the address in two. The high half names a **row**, the low half a **column**. A row decoder raises one row line, a column decoder one column line, and the one cell where the two cross is the cell selected. The others on that row or that column are only half selected, and do nothing.',
      { topic: 'coincident-decoding', input: { n: '64', addr: 45 }, frame: 3, caption: 'Cell 45 of 64 = 101 101: row 5, column 5. Only where both lit lines meet is a cell chosen. Step back to frame 1 to see the address split.' },
      { predict: { q: 'A memory of 4096 cells is laid out as a 64 × 64 square. How many decoder output lines are there in all?', options: ['64', '128', '4096'], answer: 1, explain: 'Two 6-to-64 decoders: 64 + 64 = 128 lines, against 4096 for a single decoder.' } },
      { table: [['Cells', 'One decoder', 'Square (rows + columns)'], ['64', '64 gates, 6 inputs', '8 + 8 gates, 3 inputs'], ['1024', '1024 gates, 10 inputs', '32 + 32 gates, 5 inputs'], ['4096', '4096 gates, 12 inputs', '64 + 64 gates, 6 inputs']], caption: 'The saving grows with the square root: for n cells, about 2√n decoder lines instead of n.' },
      { tip: 'In real chips the column decoder is usually a multiplexer: the whole selected row is read out at once and the column bits choose which of its bits leaves the chip.' },
      { h: 'Recap' },
      { list: ['The high address bits pick a row, the low bits a column.', 'Only the cell at the crossing of both active lines is read or written.', 'Two decoders of √n outputs replace one of n.'] },
      X('mem-ex-coincident-lines'), X('mem-ex-coincident-row'),
    ],
  });
  C.lesson({
    id: 'mem-expand', chapter: 'mem-ram', title: 'Bigger memories from smaller chips', minutes: 9,
    summary: 'Chips side by side make wider words; chips stacked, with a decoder on the extra address bits driving their chip selects, make more words.',
    blocks: [
      'The shop sells only 8-word chips of 4 bits, and the design needs 16 words of 4 bits, or 8 words of 8 bits. Both can be built from two chips, but the wiring is different. What is shared, and what is not?',
      { h: 'Wider: width expansion' },
      'For wider words put the chips **side by side**. Every chip gets the same address and the same chip select, so they always act together; each one supplies its own slice of the data bits.',
      { topic: 'memory-expansion', input: { mode: 'width', addr: 5 }, frame: 2, caption: 'Two chips, one address: word 5 comes out as 1100 from one chip and 1010 from the other, together the 8-bit word 11001010.' },
      { h: 'Deeper: depth expansion' },
      'For more words **stack** the chips. They share the low address bits and the data lines; the new, higher address bits go to a decoder whose outputs drive the chip selects, so exactly one chip answers. The others release the shared data lines (their outputs go to Z).',
      { predict: { q: 'Two 8-word chips make a 16-word memory. Address 1011 is read. Which chip answers, and which word inside it?', options: ['The lower chip, word 11', 'The upper chip, word 3', 'Both chips, word 3'], answer: 1, explain: 'The top bit A3 = 1 selects the upper chip; the low bits 011 = 3 name the word inside it.' } },
      { topic: 'memory-expansion', input: { mode: 'depth', addr: 11 }, frame: 2, caption: 'Address 1011: A3 = 1 selects the upper chip, which drives its word 3 onto the shared bus. The lower chip has CS = 0 and its outputs float, so there is no fight on the bus.' },
      { h: 'A memory map' },
      'Larger systems decode the top address bits into regions, and each chip select is a function of those bits. It is ordinary combinational logic: here a chip that must answer in regions 4 to 7 and 12, 13 of a 16-region map.',
      { kmap: { vars: ['A', 'B', 'C', 'D'], minterms: [4, 5, 6, 7, 12, 13], groups: 'minimal' }, caption: 'The chip select A′B + BC′: one group for regions 4–7 and one for 4, 5, 12, 13.' },
      { math: 'chips = (words wanted / words per chip) × (bits wanted / bits per chip)\n1K × 8 from 256 × 4:  (1024 / 256) × (8 / 4) = 4 × 2 = 8 chips' },
      'On the bench, a 74138 does the decoding for eight chips at once. Its outputs are active low, like the chip-select pins of most memory chips.',
      { lab: 'mem-lab-select' },
      { h: 'Recap' },
      { list: ['Width: same address and chip select for all, each chip its own data bits.', 'Depth: shared low address bits and data lines; a decoder on the high bits picks one chip.', 'A deselected chip floats its outputs, so several chips can share one data bus.'] },
      X('mem-ex-chips-needed'), X('mem-ex-select-kmap'), X('mem-ex-chip-selects'), X('mem-ex-lab-select'),
    ],
  });

  // =========================================================================================================
  // Chapter 2: memory that corrects itself
  // =========================================================================================================
  C.lesson({
    id: 'mem-hamming', chapter: 'mem-ecc', title: 'Hamming codes: finding the flipped bit', minutes: 10,
    summary: 'A few check bits, each the parity of an overlapping group of positions, turn a single flipped bit into a binary number that names its position.',
    blocks: [
      'A memory of billions of cells will, now and then, lose a bit: a charged particle passes through and a 1 becomes a 0. A single parity bit can tell you that something is wrong, but not what. Could a few extra bits tell you *which* bit flipped, so that the memory can put it right?',
      'The trick is to number the positions of the word from 1 and put the check bits at the powers of two: 1, 2, 4, 8 … Check bit *k* covers every position whose binary number has the bit worth *k* set, and makes its group even.',
      { table: [['Check', 'Covers positions', 'Binary of those positions'], ['P1', '1, 3, 5, 7', '…1 (bit worth 1 set)'], ['P2', '2, 3, 6, 7', '.1. (bit worth 2 set)'], ['P4', '4, 5, 6, 7', '1.. (bit worth 4 set)']], caption: 'Every position from 1 to 7 is covered by a different set of checks: its own binary number.' },
      { topic: 'hamming-sec', frame: 4, caption: 'The data 1011 placed at positions 3, 5, 6, 7 and the three check bits computed: the stored word is 0110011.' },
      'Now flip a bit. Each check that covers it fails. Because each position is covered by its own set of checks, the pattern of failures, read as a binary number, is the position itself. This number is the **syndrome**; 0 means no check failed.',
      { predict: { q: 'Position 6 of the stored word flips. Which checks fail?', options: ['P1 and P2', 'P2 and P4', 'P1 and P4'], answer: 1, explain: '6 = 110 in binary: the bits worth 4 and 2. So P4 and P2 fail, and the syndrome 110 names position 6.' } },
      { topic: 'hamming-sec', frame: 9, caption: 'The syndrome 110 = 6 points straight at the flipped bit; flipping it back restores 0110011 and the data 1011.' },
      { h: 'How many check bits?' },
      'With *k* check bits the syndrome has 2ᵏ values: one says "no error" and each of the others must name one of the *n* + *k* positions. So 2ᵏ ≥ *n* + *k* + 1.',
      { math: 'data bits  check bits  word\n    4          3          7\n    8          4         12\n   16          5         21\n   64          7         71' },
      { h: 'The syndrome as a circuit' },
      'Each syndrome bit is the XOR of four bits. Here are two of them, S1 and S2; the third, S4, is built the same way from B4, B5, B6 and B7.',
      { circuit: SYN12, outputs: ['S1', 'S2'], inputs: { B2: 1, B3: 1, B6: 1, B7: 1 }, caption: 'Two of the three checks of the word 0110011 (B4 = 0 is not needed for these two). Both pass: S2 S1 = 00. Flip B3 and both fail, S2 S1 = 11; flip B6 and only S2 fails.' },
      { h: 'Recap' },
      { list: ['Check bits sit at positions 1, 2, 4, …; check k covers the positions whose number has the bit worth k.', 'The failed checks, read as a binary number, are the position of a single flipped bit.', 'k check bits protect n data bits when 2ᵏ ≥ n + k + 1.'] },
      X('mem-ex-ham-encode'), X('mem-ex-ham-position'), X('mem-ex-ham-data'), X('mem-ex-check-bits'),
    ],
  });
  C.lesson({
    id: 'mem-ecc-hw', chapter: 'mem-ecc', title: 'Building the checker and the corrector', minutes: 8,
    summary: 'Check bits come from XOR gates when a word is written; on a read, more XOR gates make the syndrome, a decoder turns it into one line per position, and one XOR per bit puts the error right.',
    blocks: [
      'A memory with error correction does all of this in hardware, on every single read, and must not slow the read down much. What does that hardware look like, and how fast can it be?',
      { steps: ['On a write: XOR trees make the check bits from the data, and the whole word is stored.', 'On a read: XOR trees recompute every check over the word read back; the results are the syndrome.', 'A decoder turns the syndrome into one line per position (line 0 means "no error").', 'Each bit passes through an XOR gate fed by its own decoder line: the wrong bit is flipped back, the rest pass unchanged.'] },
      { topic: 'hamming-sec', input: { data: '1011', flip: 3 }, frame: 8, caption: 'The read side at work: position 3 has flipped, and each recomputed check is one XOR tree. Checks 1 and 2 fail, check 4 passes, so the syndrome is 011.' },
      'The check bits and the syndrome are XORs of four bits each. Gates can be shared between checks that cover the same pair of positions, and the shape of each XOR tree sets the delay.',
      { predict: { q: 'S1 = B1 ⊕ B3 ⊕ B5 ⊕ B7 is built from two-input XOR gates. Which arrangement settles first?', options: ['A chain: ((B1 ⊕ B3) ⊕ B5) ⊕ B7', 'A tree: (B1 ⊕ B3) ⊕ (B5 ⊕ B7)', 'Both take the same time'], answer: 1, explain: 'Both use three gates, but in the tree every input passes through only two of them: two gate delays instead of three.' } },
      { schematic: { outputs: { C5: "B5 ^ S4S2'S1" }, style: 'multi' }, caption: 'The corrector for position 5: an AND gate recognises the syndrome 101 and flips B5 through an XOR. Every other position has one like it.' },
      'On the bench you can build the read side for a whole 7-bit word: eight XOR gates in two 7486 packages make the syndrome, and a 74138 decodes it. Its outputs are active low, so the one dark LED marks the bad position.',
      { lab: 'mem-lab-syndrome' },
      { h: 'Recap' },
      { list: ['Write: check bits from XOR trees. Read: syndrome from XOR trees.', 'A decoder on the syndrome picks the bit to flip; one XOR per bit flips it.', 'Share XOR gates between checks, and build balanced trees for speed.'] },
      X('mem-ex-parity-gen'), X('mem-ex-syndrome'), X('mem-ex-correct-bit'), X('mem-ex-syndrome-tree'), X('mem-ex-ham-verilog'), X('mem-ex-lab-syndrome'),
    ],
  });
  C.lesson({
    id: 'mem-secded', chapter: 'mem-ecc', title: 'SEC-DED: correct one, detect two', minutes: 8,
    summary: 'One more parity bit over the whole word tells a single error (odd overall parity) from a double one (even): one is corrected, two are reported.',
    blocks: [
      'Flip two bits of a Hamming word and the syndrome is still some number, so the decoder "corrects" a third bit and makes things worse, without a word of warning. Can one more bit save us from that?',
      'Add a bit P0 that makes the **whole** word even. One flipped bit makes the overall parity odd; two flipped bits leave it even. Together with the syndrome, that separates every case.',
      { table: [['Syndrome', 'Overall parity', 'Verdict'], ['0', 'even', 'no error'], ['not 0', 'odd', 'one error: correct the bit the syndrome names'], ['0', 'odd', 'P0 itself flipped: the data is fine'], ['not 0', 'even', 'two errors: detected, cannot be corrected']], caption: 'The four cases of a single-error-correcting, double-error-detecting (SEC-DED) code.' },
      { topic: 'hamming-secded', input: { data: '1011', flips: '5' }, frame: 5, caption: 'One flip, at position 5: the syndrome is 101 and the overall parity is odd, so the bit is corrected.' },
      { predict: { q: 'Two bits flip, at positions 3 and 6. The syndrome is 3 ⊕ 6 = 101 = 5. What does the overall parity say?', options: ['Odd: correct position 5', 'Even: two errors, report the word as bad', 'Odd: no error'], answer: 1, explain: 'Two flips change the parity of the whole word twice, leaving it even. A non-zero syndrome with even parity means a double error.' } },
      { topic: 'hamming-secded', input: { data: '1011', flips: '3, 6' }, frame: 5, caption: 'The same word with two flips: the syndrome points at 5, but the even overall parity tells the decoder not to believe it.' },
      { tip: 'Memory for servers commonly stores 8 check bits with every 64 data bits: 7 for the Hamming code (2⁷ ≥ 64 + 7 + 1) and one for the overall parity.' },
      { h: 'Recap' },
      { list: ['P0 makes the whole word even; it is checked along with the syndrome.', 'Odd overall parity: one error (corrected, or P0 itself). Even with a non-zero syndrome: two errors, reported.', 'SEC-DED costs one bit more than plain Hamming.'] },
      X('mem-ex-secded-single'), X('mem-ex-secded-double'), X('mem-ex-secded-cases'), X('mem-ex-secded-logic'),
    ],
  });

  // =========================================================================================================
  // Chapter 3: ROM and programmable logic
  // =========================================================================================================
  C.lesson({
    id: 'mem-rom', chapter: 'mem-pld', title: 'ROM: a truth table you can address', minutes: 8,
    summary: 'A ROM is a decoder followed by an OR gate per output bit; the connections stored in the OR array are the truth table, so any function of the address can be stored.',
    blocks: [
      'You need a circuit that turns a 3-bit number into how many of its bits are 1. You could minimise two K-maps and wire gates, or you could simply write the answer down for all eight inputs and look it up. A ROM is the hardware for looking it up.',
      'Inside, a ROM is a decoder that turns the address into one word line, and a column per output bit where each word line either connects to the output (a stored 1) or does not (a 0). Each output is an OR of the word lines it is connected to: a sum of minterms, one per stored 1.',
      { topic: 'rom-truth-table', input: { table: 'seg', reads: '7, 0, 4' }, frame: 4, caption: 'A ROM holding the number of 1s in its address: eight words of two bits. Each dot is a stored 1. Step on to read addresses 7, 0 and 4.' },
      { predict: { q: 'A ROM must add two 4-bit numbers and give a 5-bit sum. How many words does it need, and of what width?', options: ['16 words of 5 bits', '256 words of 5 bits', '256 words of 8 bits'], answer: 1, explain: 'Both numbers together form an 8-bit address: 2⁸ = 256 words, each holding the 5-bit sum. 1280 bits in all.' } },
      'The same structure is a **decoder plus OR gates**, which you can build directly. Here a two-output "ROM": F1 = Σm(1, 2, 4, 7) is the odd-parity function, F2 = Σm(3, 5, 6, 7) is the majority.',
      { circuit: 'd = DECODER[k=3](a2=A, a1=B, a0=C)\nF1 = OR(d.y1, d.y2, d.y4, d.y7)\nF2 = OR(d.y3, d.y5, d.y6, d.y7)', outputs: ['F1', 'F2'], inputs: { A: 1, B: 1, C: 0 }, caption: 'Address 110 raises word line 6; F2 is connected to it and F1 is not, so F1 F2 = 01.' },
      'In Verilog a ROM is a case statement: one line per address, exactly a truth table.',
      { verilog: "module rom8x5(input [2:0] a, output reg [4:0] d);\n  always @(*)\n    case (a)\n      0: d = 0;  1: d = 3;  2: d = 6;  3: d = 9;\n      4: d = 12; 5: d = 15; 6: d = 18; 7: d = 21;\n    endcase\nendmodule\n\nmodule tb;\n  reg [2:0] a; wire [4:0] d; integer i;\n  rom8x5 r(.a(a), .d(d));\n  initial for (i = 0; i < 8; i = i + 1) begin a = i; #1 $display(\"word %0d = %b\", a, d); end\nendmodule", run: true, caption: 'A ROM holding 3n. Run it to list every word.' },
      { h: 'Recap' },
      { list: ['A ROM is a decoder plus an OR array: a stored truth table, read by its address.', 'n address bits and m outputs: 2ⁿ words of m bits.', 'No minimisation is needed, but the size doubles with every input added.'] },
      X('mem-ex-rom-table'), X('mem-ex-rom-decoder'),
    ],
  });
  C.lesson({
    id: 'mem-rom-kinds', chapter: 'mem-pld', title: 'Kinds of ROM', minutes: 6,
    summary: 'Mask ROM and PROM are written once; EPROM, EEPROM and flash trap charge on a floating gate and can be erased, by light, by the byte or by the block.',
    blocks: [
      'A ROM stores its bits without power. But how are the bits put in, and can they ever be changed? The answer has changed from "only at the factory" to "a million times, in the circuit", and each step made a new kind of chip.',
      { topic: 'rom-types', frame: 3, caption: 'A PROM: each bit is a fuse, left whole or blown by the user. Once blown it stays blown: the word 1011 is there for good.' },
      { table: [['Kind', 'A bit is', 'Programmed', 'Erased'], ['Mask ROM', 'a transistor made or left out', 'at the factory', 'never'], ['PROM', 'a fuse', 'once, by the user', 'never'], ['EPROM', 'charge on a floating gate', 'in a programmer', 'whole chip, by ultraviolet light'], ['EEPROM', 'charge on a floating gate', 'in the circuit', 'one byte at a time'], ['Flash', 'charge on a floating gate', 'in the circuit', 'a block at a time']], caption: 'The kinds of ROM, from fixed to rewritable.' },
      { predict: { q: 'An EEPROM and a flash chip both erase electrically. Why is flash cheaper per bit?', options: ['It erases a whole block at once, which needs less circuitry per bit', 'It stores no charge', 'It cannot be rewritten'], answer: 0, explain: 'Erasing a block at a time lets the cells be packed densely with shared erase circuitry; byte-by-byte erase costs more silicon per bit.' } },
      { topic: 'rom-types', frame: 12, caption: 'Flash: erased a block at a time, every bit back to 1, ready to be programmed again.' },
      { h: 'Recap' },
      { list: ['Mask ROM and PROM: written once.', 'EPROM: erased by ultraviolet light, out of the circuit.', 'EEPROM: erased by the byte, flash by the block, both in the circuit; an erased bit reads 1.'] },
      X('mem-ex-rom-kinds'),
    ],
  });
  C.lesson({
    id: 'mem-pla', chapter: 'mem-pld', title: 'PLA: programmable AND and OR planes', minutes: 9,
    summary: 'A PLA programs both an AND plane of product terms and an OR plane that combines them, so outputs can share terms and only the terms used are paid for.',
    blocks: [
      'A ROM stores every minterm, used or not: 2ⁿ rows whatever the function. Most functions need far fewer product terms. What if only the terms actually needed were built, and the outputs could share them?',
      'A **programmable logic array** has an AND plane, where each row is a product term whose literals are chosen by fuses, and an OR plane, where fuses choose which terms each output collects. The cost is the number of distinct terms, so the outputs are minimised **together**.',
      { def: 'Programming table', text: 'one row per product term: under each input 1 (true literal), 0 (complemented) or – (not used); under each output 1 if the term is ORed into it.' },
      { topic: 'pla', input: { f1: '1, 2, 4', f2: '2, 4, 6, 7', tries: '6, 1' }, frame: 1, caption: 'F1 = Σm(1, 2, 4) and F2 = Σm(2, 4, 6, 7). Minimised apart they need 3 + 3 = 6 terms; sharing A′BC′ and AB′C′, the PLA needs only 4. Step on to watch each term programmed.' },
      { predict: { q: 'On its own, F2 is minimised as AB + AC′ + BC′. Why does the PLA build F2 from A′BC′ + AB′C′ + AB instead, which has more literals?', options: ['Because A′BC′ and AB′C′ are already built for F1, so they cost nothing more', 'Because a PLA cannot build two-literal terms', 'Because it is faster'], answer: 0, explain: 'In a PLA a term costs one row however many outputs use it. Reusing F1\'s two terms leaves just AB to add: 4 rows instead of 6.' } },
      { topic: 'pla', input: { f1: '1, 2, 4', f2: '2, 4, 6, 7', tries: '6, 1' }, frame: 6, caption: 'ABC = 110: only the row AB has a dot on every lit column, so F2 = 1 and F1 = 0.' },
      'Minimising each output alone is still the first step: it shows which terms are candidates. Here is G = Σm(2, 3, 5, 6) on its own.',
      { kmap: { vars: ['A', 'B', 'C'], minterms: [2, 3, 5, 6], groups: 'minimal' }, caption: 'A′B + BC′ + AB′C′: three terms, one of which (AB′C) stands alone.' },
      { h: 'Recap' },
      { list: ['A PLA programs both planes: product terms, then which outputs collect them.', 'Its cost is the number of distinct terms, so outputs are minimised together and share terms.', 'A shared term may have more literals than either output\'s own minimum.'] },
      X('mem-ex-pla-table'), X('mem-ex-pla-kmap'), X('mem-ex-pla-gates'),
    ],
  });
  C.lesson({
    id: 'mem-pal', chapter: 'mem-pld', title: 'PAL: a fixed OR plane', minutes: 7,
    summary: 'A PAL fixes the OR plane at the factory, giving each output a set number of its own product rows: cheaper and faster, but with no sharing and a limit per output.',
    blocks: [
      'Two programmable planes mean two sets of fuses in every signal path, which is slow and costly. If the OR plane is fixed instead, what do we lose?',
      'In a **PAL** each output owns a fixed number of product rows, wired at the factory to its OR gate. Only the AND plane is programmed. An output cannot borrow another\'s terms, so each output is minimised **on its own**, and its terms must fit its rows.',
      { topic: 'pal', input: { f1: '1, 2, 4', f2: '2, 4, 6, 7', tries: '6', per: '3' }, frame: 2, caption: 'The same F1 and F2 as in the PLA lesson. Each output fits its three rows, but A′BC′ and AB′C′ can no longer be shared, and F2 uses its own AB + AC′ + BC′.' },
      { predict: { q: 'The PAL gives each output 3 rows. How many rows do F1 and F2 use together?', options: ['4, as in the PLA', '6', '8'], answer: 1, explain: 'Each output is minimised alone: 3 terms for F1 and 3 for F2, 6 rows, against 4 in a PLA that shares.' } },
      { topic: 'pal', input: { f1: '1, 2, 4', f2: '2, 4, 6, 7', tries: '6', per: '3' }, frame: 4, caption: 'The PAL needs 6 product rows where the PLA needed 4: the price of the fixed, faster OR plane.' },
      'A row left unused keeps every fuse, so it ANDs each input with its own complement and gives 0, which the OR gate ignores.',
      { math: "spare row = A·A′·B·B′·C·C′ = 0\nF + 0 = F" },
      { warn: 'If an output needs more terms than it has rows, it does not fit, however many rows other outputs leave empty. The cure is to split the function, or to feed one output back as an input to another.' },
      { h: 'Recap' },
      { list: ['PAL: programmable AND plane, fixed OR plane, a fixed number of rows per output.', 'No sharing: minimise each output alone and check it fits its rows.', 'An unused row computes 0. CPLDs are many PAL-like blocks on one chip.'] },
      X('mem-ex-pal-kmap'), X('mem-ex-pal-proof'),
    ],
  });
  C.lesson({
    id: 'mem-fpga', chapter: 'mem-pld', title: 'FPGAs: look-up tables and routing', minutes: 10,
    summary: 'An FPGA builds logic from small look-up tables, each a tiny memory read by a multiplexer tree, joined by routing that is itself set by configuration bits.',
    blocks: [
      'A PAL has a few dozen product terms; a modern design has millions of gates. An FPGA scales up by a different idea: instead of sums of products, store small truth tables, thousands of them, and connect them with programmable wiring.',
      { h: 'The look-up table' },
      'A *k*-input **LUT** is 2ᵏ bits of configuration memory and a multiplexer that the inputs steer to one of them. Load the output column of a truth table and the LUT *is* that function. A 3-input LUT can make any of the 2⁸ = 256 functions of three inputs.',
      { topic: 'fpga-lut', input: { fn: "AB + A'C", tries: '3, 6, 1' }, frame: 6, caption: 'F = AB + A′C loaded as 01010011. ABC = 011 steers the multiplexer tree to bit 3, a 1. Step back to watch the change pass through the tree, one multiplexer at a time.' },
      { predict: { q: 'How many configuration bits does a 4-input LUT hold?', options: ['4', '8', '16'], answer: 2, explain: 'One bit per row of a 4-input truth table: 2⁴ = 16.' } },
      { circuit: 'F = MUX[n=8](d0=0, d1=1, d2=1, d3=0, d4=1, d5=0, d6=0, d7=1, s2=A, s1=B, s0=C)', outputs: ['F'], inputs: { A: 1, B: 0, C: 1 }, caption: 'A LUT is a multiplexer with constants on its data inputs. These eight bits make the odd-parity function A ⊕ B ⊕ C: try every setting of the switches.' },
      { h: 'Map, place, route' },
      'A design bigger than one LUT is cut into pieces of at most *k* inputs (**mapping**), each piece is given a logic block on the chip (**placement**), and the wiring channels and switch boxes are set to join them (**routing**). Every choice is a configuration bit, loaded when the chip powers up.',
      { topic: 'fpga-fabric', frame: 12, caption: 'F = (A ⊕ B)(C + D) + E mapped onto three 3-input LUTs and routed. With A B C D E = 10100 the lit routes carry 1 and F = 1.' },
      { tip: 'Because an FPGA\'s configuration lives in memory, the same chip becomes a different circuit every time a new bitstream is loaded.' },
      { h: 'Recap' },
      { list: ['A k-input LUT holds 2ᵏ bits and makes any function of k inputs.', 'Its delay is a multiplexer tree, the same for every function.', 'Map into LUT-sized pieces, place them, route between them: all stored as configuration bits.'] },
      X('mem-ex-lut-bits'), X('mem-ex-lut-mux'), X('mem-ex-lut-delay'), X('mem-ex-lut-verilog'),
    ],
  });

  // ---- a guided tour ---------------------------------------------------------------------------------------------
  C.tour({
    id: 'mem-tour', title: 'Tour: memory and programmable logic', blurb: 'From one word of RAM to a tiny FPGA, in eight steps.',
    steps: [
      { route: 'part=memory', target: '#main', text: 'Part 8 of the catalogue: memory and programmable logic. Every card is a topic that animates one idea.' },
      { route: 'topic=ram-organisation', target: '#stageWrap', text: 'A RAM as a stack of words. The decoder raises one word line; only that word meets the data lines.' },
      { target: '#btnPlay', text: 'Play steps through a write and a read; the arrow keys go one step at a time.' },
      { route: 'topic=ram-cycles', target: '#stageWrap', text: 'The same write and read in time: a WE pulse to write, an access time to wait for a read.' },
      { route: 'topic=hamming-sec', target: '#inputs', text: 'Hamming codes. Choose the data and the position to flip, and watch the syndrome point at it.' },
      { route: 'topic=pla', target: '#inputs', text: 'A PLA. Type the minterms of two functions and see which product terms they can share.' },
      { route: 'topic=fpga-fabric', target: '#stageWrap', text: 'A tiny FPGA: a design mapped onto look-up tables, placed and routed through switch boxes.' },
      { route: 'learn', target: '[data-chapter="mem-ram"]', text: 'Lessons, exercises and two bench labs for this part start here. Every exercise is checked at once, with hints when you are stuck.' },
    ],
  });

  // ---- a course --------------------------------------------------------------------------------------------------
  C.course({
    id: 'mem-course', title: 'Memory and programmable logic, start to finish', blurb: 'Every topic of part 8 in order, from a word of RAM to an FPGA, with lessons and exercises on the way.',
    steps: [
      { topic: 'ram-organisation', note: 'One word line at a time: the decoder keeps every other word away from the data lines.' },
      { lesson: 'mem-words', note: 'Address lines, word width, and the decoder inside.' },
      { topic: 'ram-cycles', note: 'Watch the order: address, chip select, then the write pulse; a read waits one access time.' },
      { exercise: 'mem-ex-ram-wave', note: 'Track two words cycle by cycle.' },
      { topic: 'coincident-decoding', note: 'A cell is chosen where a row line and a column line cross.' },
      { topic: 'memory-expansion', note: 'Side by side for width, stacked with a decoder for depth.' },
      { exercise: 'mem-ex-chip-selects', note: 'One decoder, four chip selects.' },
      { topic: 'hamming-sec', note: 'The failed checks, read as a number, name the flipped bit.' },
      { lesson: 'mem-hamming', note: 'Why the check bits sit at 1, 2, 4, and how many you need.' },
      { topic: 'hamming-secded', note: 'One more parity bit tells one error from two.' },
      { exercise: 'mem-ex-syndrome', note: 'The syndrome in eight XOR gates.' },
      { topic: 'rom-truth-table', note: 'A stored truth table: a decoder and an OR array.' },
      { topic: 'rom-types', note: 'From written once to rewritten in the circuit.' },
      { topic: 'pla', note: 'Shared product terms are paid for once.' },
      { topic: 'pal', note: 'A fixed OR plane: no sharing, a limit per output.' },
      { exercise: 'mem-ex-pla-gates', note: 'Build two outputs from four shared terms.' },
      { topic: 'fpga-lut', note: 'Eight bits and a multiplexer tree make any function of three inputs.' },
      { topic: 'fpga-fabric', note: 'Map, place, route, run.' },
      { exercise: 'mem-ex-lut-mux', note: 'A LUT from one multiplexer and constants.' },
    ],
  });

  // ---- what the diagram checker looks at on these pages ----------------------------------------------------------------
  if (S.Checks && !S.Checks.some((c) => c.name === 'lesson mem-words')) {
    const L = (name, hash, ready) => S.Checks.push({ group: 'learn', name, hash, ready, sel: '#main' });
    for (const id of ['mem-words', 'mem-cycles', 'mem-square', 'mem-expand', 'mem-hamming', 'mem-ecc-hw', 'mem-secded', 'mem-rom', 'mem-rom-kinds', 'mem-pla', 'mem-pal', 'mem-fpga']) L('lesson ' + id, 'lesson=' + id, "document.querySelector('#lessonView')");
    for (const id of ['mem-ex-word-decoder', 'mem-ex-ram-wave', 'mem-ex-ram-verilog', 'mem-ex-select-kmap', 'mem-ex-lab-select', 'mem-ex-ham-encode', 'mem-ex-syndrome', 'mem-ex-secded-cases', 'mem-ex-lab-syndrome', 'mem-ex-rom-table', 'mem-ex-pla-table', 'mem-ex-pal-proof', 'mem-ex-lut-bits', 'mem-ex-lut-delay']) L('exercise ' + id, 'exercise=' + id, "document.querySelector('#exerciseView')");
    for (const id of ['mem-lab-select', 'mem-lab-syndrome']) L('lab ' + id, 'lab=' + id, "document.querySelector('#labExp')");
    L('course mem-course', 'course=mem-course', "document.querySelector('#courseView')");
  }
})(globalThis.Sirkit = globalThis.Sirkit || {});
