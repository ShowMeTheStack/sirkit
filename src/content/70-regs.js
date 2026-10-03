// Part 7 lessons: registers and counters. Four chapters in teaching order: registers (parallel load, shifting,
// serial transfer, the universal shift register), ripple counters (binary and decade, with their ripple delay),
// synchronous counters (enable, up/down and load, counting to ten on a 74161 or 74163, unused states), and
// shift-register counters (ring, Johnson, sequence generators). Two bench labs use the 74161 and the 74194.
// The exercises are in 71-regs-ex.js; a tour and a course close this file.
(function (S) {
  'use strict';
  const C = S.Content;
  if (!C || C.chapters.some((c) => c.id === 'p7-ch-registers')) return;

  C.chapter({ id: 'p7-ch-registers', part: 'registers', n: 1, title: 'Registers', blurb: 'Rows of flip-flops on one clock: loading a word, holding it, shifting it a bit at a time, and the universal shift register that does all of these.' });
  C.chapter({ id: 'p7-ch-ripple', part: 'registers', n: 2, title: 'Ripple counters', blurb: 'Each flip-flop clocked by the one before: few gates, but the count settles one bit at a time, showing false values on the way.' });
  C.chapter({ id: 'p7-ch-sync', part: 'registers', n: 3, title: 'Synchronous counters', blurb: 'Every flip-flop on the same clock: enable, up/down, parallel load, counting to ten on a 74161 or 74163, and what unused states do.' });
  C.chapter({ id: 'p7-ch-shiftcount', part: 'registers', n: 4, title: 'Ring, Johnson and sequence generators', blurb: 'Shift registers fed back on themselves: a 1 going round, a twisted ring that needs no decoder gates to speak of, and a pseudo-random sequence.' });

  // circuits shared with the exercises (71-regs-ex.js)
  const P = (S.P7 = S.P7 || {});
  P.load2 = 'm1 = MUX(d0=q1, d1=D1, s0=LD)\nq1 = DFF(m1)\nm0 = MUX(d0=q0, d1=D0, s0=LD)\nq0 = DFF(m0)\nQ1 = q1\nQ0 = q0';
  P.shift3 = 'q0 = DFF(SI)\nq1 = DFF(q0)\nq2 = DFF(q1)\nQ0 = q0\nQ1 = q1\nQ2 = q2';
  P.sync3 = 'q0 = TFF(EN)\nt1 = AND(EN, q0)\nq1 = TFF(t1)\nt2 = AND(t1, q1)\nq2 = TFF(t2)\nQ0 = q0\nQ1 = q1\nQ2 = q2';
  P.updown2 = 'q0 = TFF(1)\nt1 = XNOR(UP, q0)\nq1 = TFF(t1)\nQ0 = q0\nQ1 = q1';
  P.ring3 = 'd0 = NOR(q0, q1)\nq0 = DFF[en](d0, EN)\nq1 = DFF[en](q0, EN)\nq2 = DFF[en](q1, EN)\nQ0 = q0\nQ1 = q1\nQ2 = q2';
  P.johnson3 = "q0 = DFF[en](q2', EN)\nq1 = DFF[en](q0, EN)\nq2 = DFF[en](q1, EN)\nQ0 = q0\nQ1 = q1\nQ2 = q2";
  P.lfsr3 = 'f = XNOR(q1, q2)\nq0 = DFF[en](f, EN)\nq1 = DFF[en](q0, EN)\nq2 = DFF[en](q1, EN)\nQ2 = q2';
  const L = (x) => C.lesson(x);

  // =========================================================================================================
  // Chapter 1: registers
  // =========================================================================================================
  L({
    id: 'p7l-reg-load', chapter: 'p7-ch-registers', title: 'A register with parallel load', minutes: 8,
    summary: 'A register is a row of flip-flops sharing a clock. To make it load only when told, put a multiplexer in front of each flip-flop: load a new word, or reload the old one.',
    blocks: [
      'A processor adds two numbers and must keep the result until the next instruction needs it. Four D flip-flops on one clock keep four bits, but they take a new value at **every** edge. How do we make them keep a word for as long as we like and take a new one only when told?',
      'The tempting answer is to stop the clock: AND it with a load signal. Do not. A gate on the clock delays it (skew), and any glitch on the load signal becomes an extra clock edge. The clean answer leaves the clock alone and changes what the flip-flops take at each edge.',
      { def: 'Register with parallel load', text: 'n D flip-flops on one clock, each fed by a 2-to-1 multiplexer. With LD = 1 the multiplexer passes the input bit Di; with LD = 0 it passes the flip-flop\'s own Q, so the edge reloads the old value.' },
      { topic: 'reg-load', frame: 4, caption: 'LD = 0 at edge 2: every multiplexer passed Q back to its own flip-flop, so the edge changed nothing. The clock still reached all four flip-flops.' },
      { circuit: P.load2, outputs: ['Q1', 'Q0'], inputs: { LD: 1, D1: 1 }, caption: 'Two bits of such a register. Set D1 and D0, press Clock, and Q takes them only while LD = 1; with LD = 0 the edges change nothing.' },
      { predict: { q: 'LD = 0 for twenty clock edges while D changes at every one. What does Q do?', options: ['Follows D, one edge late', 'Holds the word last loaded', 'Goes to 0'], answer: 1, explain: 'With LD = 0 each multiplexer feeds the flip-flop its own output, so every edge stores what was already there.' } },
      { waveform: { circuit: P.load2, inputs: { LD: '10010110', D1: '11001010', D0: '00111101' }, clocked: true, outputs: ['Q1', 'Q0'] }, caption: 'Each slot shows Q before its edge. Loads happen at the edges of slots 1, 4, 6 and 7, and show one slot later.' },
      { h: 'What to take away' },
      { list: ['A register is n flip-flops on one clock.', 'Load control goes in front of D (a multiplexer), never on the clock.', 'LD = 0 reloads each flip-flop\'s own value: hold.'] },
      { exercise: 'p7x-load-wave' }, { exercise: 'p7x-load-build' }, { exercise: 'p7x-gated-clock' },
    ],
  });

  L({
    id: 'p7l-shift', chapter: 'p7-ch-registers', title: 'Shift registers and serial transfer', minutes: 9,
    summary: 'Chain flip-flops so each takes the output of the one before, and a word moves along one place per clock. Bits can go in one at a time and come out side by side, or go from one register to another over a single wire.',
    blocks: [
      'A keyboard, a USB cable or a sensor sends data one bit after another down a single wire. Inside the receiving chip the bits must end up side by side as a word. The circuit that does this is the simplest register of all: a row of D flip-flops, each fed by the one before.',
      { topic: 'shift-reg', frame: 6, caption: 'Edge 3: every flip-flop took the bit before it at the same instant, so 1, 0, 1 have marched in: Q0..Q3 = 1010.' },
      { predict: { q: 'Why does each bit move exactly one place per edge, and not run straight through all four flip-flops?', options: ['The flip-flops are slow', 'Each flip-flop takes its D at the edge, and its new Q only appears clock-to-Q later, after the edge has passed', 'The clock reaches the flip-flops one after another'], answer: 1, explain: 'This is the edge-triggered property at work: the value a flip-flop launches arrives at the next one too late for this edge. That is why a chain of latches could not be a shift register.' } },
      { circuit: P.shift3, outputs: ['Q0', 'Q1', 'Q2'], caption: 'A 3-bit shift register: SI → Q0 → Q1 → Q2. Set SI and press Clock a few times: the bit walks along.' },
      { waveform: { circuit: P.shift3, inputs: { SI: '11010000' }, clocked: true, outputs: ['Q0', 'Q1', 'Q2'] }, caption: 'Serial in 1, 1, 0, 1: the same pattern appears on Q0, then one clock later on Q1, then on Q2.' },
      { h: 'Moving a word between registers' },
      'Two shift registers can pass a word over a single wire: the output of A feeds the serial input of B, and both shift on the same edges. Feed A\'s output back to its own input as well and A ends with its word intact. A shift control SH enables both for exactly as many edges as there are bits.',
      { topic: 'serial-transfer', frame: 2, caption: 'The first shift: the bit leaving A0 enters both B3 and A3. After four shifts B holds A\'s word and A is back where it started.' },
      { tip: 'Serial transfer trades time for wires: n bits need n clock edges, but one wire. Parallel transfer needs n wires and a single edge.' },
      { h: 'What to take away' },
      { list: ['A shift register moves every bit one place per clock edge.', 'Serial in, parallel out: after n edges the last n bits sit side by side.', 'Serial transfer of n bits takes n edges over one wire.'] },
      { exercise: 'p7x-shift-wave' }, { exercise: 'p7x-shift-build' }, { exercise: 'p7x-serial-clocks' }, { exercise: 'p7x-shift-en-wave' }, { exercise: 'p7x-shift-verilog' },
    ],
  });

  L({
    id: 'p7l-universal', chapter: 'p7-ch-registers', title: 'The universal shift register', minutes: 9,
    summary: 'A four-way multiplexer in front of each flip-flop gives one register four behaviours, chosen edge by edge with two control lines: hold, shift right, shift left and load. The 74194 is that register in one chip.',
    blocks: [
      'Hold, shift one way, shift the other way, load a word: each is just a different choice of what goes into each D at the edge. Put a 4-to-1 multiplexer in front of every flip-flop, drive all the multiplexers from the same two select lines S1 S0, and one register does all four.',
      { table: [['S1', 'S0', 'mode', 'next QA QB QC QD'], ['0', '0', 'hold', 'QA QB QC QD'], ['0', '1', 'shift right', 'SR QA QB QC'], ['1', '0', 'shift left', 'QB QC QD SL'], ['1', '1', 'load', 'A B C D']], caption: 'The 74194\'s modes. Shift right moves bits from QA toward QD, with the serial input SR entering QA; shift left moves them the other way with SL entering QD.' },
      { topic: 'universal-shift', frame: 4, caption: 'Edge 2 in mode 01: shift right. RI = 1 entered Q0 and every other bit moved one place toward Q3.' },
      { predict: { q: 'QA..QD = 1011. With S1 S0 = 10 and SL = 0, what is QA..QD after the edge?', options: ['0101', '0110', '1101'], answer: 1, explain: 'Shift left takes each bit from its right-hand neighbour: QA = QB = 0, QB = QC = 1, QC = QD = 1, and QD = SL = 0: 0110.' } },
      'The 74194 adds an active-low asynchronous clear (CLR′) and takes the four parallel inputs A to D. Wire its QD back to SR and set the mode to shift right, and a pattern loaded once goes round and round: a ring counter, as the last chapter of this part shows.',
      { h: 'What to take away' },
      { list: ['A 4-to-1 multiplexer per bit gives hold, shift right, shift left and load.', 'S1 S0 choose the mode at every edge.', 'The 74194: SR enters QA on shift right, SL enters QD on shift left.'] },
      { exercise: 'p7x-usr-mode' }, { exercise: 'p7x-usr-table' }, { exercise: 'p7x-usr-verilog' },
    ],
  });

  // =========================================================================================================
  // Chapter 2: ripple counters
  // =========================================================================================================
  L({
    id: 'p7l-ripple', chapter: 'p7-ch-ripple', title: 'Ripple counters', minutes: 9,
    summary: 'A T flip-flop with T = 1 halves its clock frequency. Clock each one from the one before and the chain counts in binary, with no gates at all. The catch: the bits change one after another.',
    blocks: [
      'Count in binary and watch each column: the lowest bit flips every time, and every other bit flips exactly when the bit below it goes from 1 to 0. So clock each flip-flop by the falling of the bit below it. With rising-edge flip-flops, that means clocking from Q′ of the one below, since Q′ rises exactly when Q falls.',
      { topic: 'ripple-counter', input: { n: '3', decode: '6' }, frame: 4, caption: 'Edge 4 is about to take the count from 3 (011) to 4 (100): all three bits must change, but each flip-flop only hears of it from the one before.' },
      { predict: { q: 'Which flip-flop changes first?', options: ['Q2, the most significant', 'Q0, the one on the clock', 'All three together'], answer: 1, explain: 'Only Q0 sees the clock. Q1 changes a clock-to-Q after Q0, and Q2 a clock-to-Q after Q1.' } },
      { topic: 'ripple-counter', input: { n: '3', decode: '6' }, frame: 6, caption: '28 ns after the edge the outputs read 000: a false count. Anything that decodes the outputs, like the AND gate looking for 6, sees these passing values.' },
      'The time to settle grows with the number of bits: a 4-bit ripple counter going from 7 (0111) to 8 (1000) passes through 6, 4 and 0, and takes four clock-to-Q delays, 56 ns in CMOS. That limits how fast you may read the count, not how fast the first flip-flop can toggle.',
      { warn: 'Never use a ripple counter\'s outputs as a clock, or decode them without waiting for the ripple to finish: the false counts are real pulses.' },
      { h: 'What to take away' },
      { list: ['Each stage is clocked by the one before; no gates are needed.', 'The bits change one after another: n clock-to-Q delays in the worst case.', 'In between, the outputs show false counts that a decoder will see.'] },
      { exercise: 'p7x-ripple-settle' }, { exercise: 'p7x-ripple-false' }, { exercise: 'p7x-ripple-down' }, { exercise: 'p7x-ripple-read' },
    ],
  });

  L({
    id: 'p7l-bcd-ripple', chapter: 'p7-ch-ripple', title: 'A decade ripple counter', minutes: 7,
    summary: 'To count 0 to 9, let a 4-bit ripple counter run and clear it the moment it reaches ten. It works, but the count 10 really does exist, for a few nanoseconds.',
    blocks: [
      'Clocks, meters and displays count in tens. A 4-bit counter counts to fifteen, so cut it short: watch for 1010 (ten) and clear every flip-flop through its asynchronous clear. Of the states 0 to 9, only ten and above have both Q3 and Q1 equal to 1, so a two-input NAND of Q3 and Q1 makes CLR′.',
      { topic: 'bcd-ripple', frame: 12, caption: '28 ns after the tenth edge the outputs read 1010, and the NAND pulls CLR′ low. The count 10 lasts only until the clear has acted.' },
      { predict: { q: 'Where does this circuit\'s glitch come from?', options: ['The NAND gate is too slow', 'The state 1010 must exist for the NAND to see it, so it exists briefly every tenth clock', 'The clock is too fast'], answer: 1, explain: 'An asynchronous clear driven from the count can only act after the count it is watching for has appeared. The cure is a synchronous clear or load, which acts at the next edge instead.' } },
      { h: 'What to take away' },
      { list: ['Decade counter: detect ten (Q3·Q1) and clear asynchronously.', 'The count ten appears briefly every cycle: a glitch.', 'A synchronous counter with synchronous clear or load avoids it (chapter 3).'] },
      { exercise: 'p7x-bcd-glitch' }, { exercise: 'p7x-bcd-clear' },
    ],
  });

  // =========================================================================================================
  // Chapter 3: synchronous counters
  // =========================================================================================================
  L({
    id: 'p7l-sync', chapter: 'p7-ch-sync', title: 'Synchronous counters', minutes: 9,
    summary: 'Clock every flip-flop together and decide with gates which ones toggle: a bit toggles when every bit below it is 1. All the bits change at once, one clock-to-Q after the edge.',
    blocks: [
      'The ripple counter was cheap because each flip-flop decided when to toggle by being clocked from its neighbour. Put every flip-flop on the same clock instead, and use T inputs to decide: bit i toggles exactly when all the bits below it are 1 (and the counter is enabled).',
      { math: 'T0 = EN\nT1 = EN·Q0\nT2 = EN·Q0·Q1\nT3 = EN·Q0·Q1·Q2' },
      { topic: 'sync-counter', frame: 8, caption: 'Edge 8: 0111 → 1000. All four bits toggle together, 14 ns after the edge: no false counts.' },
      { circuit: P.sync3, outputs: ['Q0', 'Q1', 'Q2'], caption: 'A 3-bit synchronous counter with enable, T flip-flops and a chain of AND gates. Set EN to 1 and press Clock to count.' },
      { waveform: { circuit: P.sync3, inputs: { EN: '111101111' }, clocked: true, outputs: ['Q2', 'Q1', 'Q0'] }, caption: 'Counting with EN = 0 in slot 5: the count holds for one clock.' },
      { h: 'How fast?' },
      'There is no ripple, but the AND gates must settle within a clock period: T(min) = tcq + the slowest path to a T input + tsu. Chained AND gates (T2 = T1·Q1, T3 = T2·Q2) add a gate per bit; parallel ones (T3 = EN·Q0·Q1·Q2) keep it to one wider gate.',
      { predict: { q: 'The 3-bit counter above (chained ANDs) in CMOS: clock-to-Q 14 ns, AND 10 ns, setup 12 ns. Minimum period?', options: ['36 ns', '46 ns', '56 ns'], answer: 1, explain: 'The slowest path is q0 → AND t1 → AND t2 → T2: 14 + 10 + 10 = 34 ns, plus 12 ns setup, 46 ns. The timing analysis agrees.' } },
      { h: 'What to take away' },
      { list: ['Every flip-flop on the same clock; Ti = EN·Q0·…·Q(i−1).', 'All bits change together, so the outputs never show false counts.', 'The carry gates set the speed: chain them and the period grows with the width.'] },
      { exercise: 'p7x-sync-wave' }, { exercise: 'p7x-sync-build' }, { exercise: 'p7x-sync-fmax' }, { exercise: 'p7x-sync-ttl' }, { exercise: 'p7x-counter-verilog' },
    ],
  });

  L({
    id: 'p7l-updown', chapter: 'p7-ch-sync', title: 'Up, down and load', minutes: 8,
    summary: 'Counting down is counting up mirrored: a bit toggles when every bit below it is 0. One control picks the direction, and a load input sets the counter to any value at the next edge.',
    blocks: [
      'Counting down, 1000 becomes 0111: every bit flips whose lower bits are all 0. So a down counter uses Q′ where the up counter used Q, and an up/down counter chooses between them: T1 = UP·Q0 + UP′·Q0′, which is UP ⊙ Q0 (XNOR).',
      { topic: 'updown-counter', frame: 7, caption: 'Edge 7, counting down from 0: the counter wraps to 15, just as counting up from 15 wraps to 0.' },
      { waveform: { circuit: P.updown2, inputs: { UP: '11100011' }, clocked: true, outputs: ['Q1', 'Q0'] }, caption: 'A 2-bit up/down counter: three edges up, three down, then up again.' },
      { predict: { q: 'A 4-bit up/down counter holds 0000 and counts down once. What does it hold?', options: ['0000', '0001', '1111'], answer: 2, explain: 'Every bit has all-zero bits below it, so every bit toggles: 1111. Counting is modulo 16 in both directions.' } },
      { h: 'Parallel load' },
      'A load input lets the counter start anywhere: at an edge with LD = 1, each flip-flop takes the corresponding data input instead of counting. Chips like the 74161 and 74163 have this load, active low (LOAD′), and it is the key to making a counter count to any number, as the next lesson shows.',
      { topic: 'counter-diagram', input: { mod: 6 }, frame: 6, caption: 'A mod-6 counter as a state diagram: one arrow out of every state. TC (terminal count) marks the last state, which is how counters are chained.' },
      { h: 'What to take away' },
      { list: ['Down: a bit toggles when all the bits below it are 0.', 'Up/down: T1 = UP ⊙ Q0, and so on.', 'A synchronous load sets the counter to a given value at the next edge.'] },
      { exercise: 'p7x-updown-wave' }, { exercise: 'p7x-updown-build' },
    ],
  });

  L({
    id: 'p7l-modulus', chapter: 'p7-ch-sync', title: 'Counting to ten with a 74161 or 74163', minutes: 10,
    summary: 'A 4-bit counter chip counts to fifteen. To make it count 0 to 9 you can clear it or load it. On the 74161 the clear is asynchronous, so you must catch ten and the state glitches; a load (or the 74163\'s synchronous clear) acts at the next edge, so you catch nine and nothing glitches.',
    blocks: [
      'The 74161 and 74163 are the same 4-bit synchronous counter with two enables (ENP, ENT), a synchronous load (LOAD′), a ripple carry out (RCO) and a clear. The one difference is the clear: on the **74161** CLR′ acts at once, like the 7474\'s; on the **74163** it waits for the next clock edge, like the load.',
      { table: [['method', 'decode', 'acts', 'counts', 'glitch?'], ['74161, CLR′ from a NAND', '10 (QD·QB)', 'at once', '0 … 9', 'yes: 10 flashes'], ['74161, LOAD′ with DCBA = 0000', '9 (QD·QA)', 'next edge', '0 … 9', 'no'], ['74163, CLR′ from a NAND', '9 (QD·QA)', 'next edge', '0 … 9', 'no']], caption: 'Three ways to a mod-10 count. Whatever acts at the next edge must be told one count earlier.' },
      { predict: { q: 'On a 74163 (synchronous clear) someone decodes 10 into CLR′, as for the 74161. What does it count?', options: ['0 to 9', '0 to 10', '0 to 15'], answer: 1, explain: 'The clear waits for the edge after 10 appears, so 10 is a full count: 0 to 10, eleven states. Decode 9 instead.' } },
      'The asynchronous version is the decade ripple counter\'s trick again, and it has the same flaw: the count 10 must appear for the NAND to see it, so QB pulses high for a few tens of nanoseconds at every tenth edge. On the bench, the logic analyser shows it.',
      { topic: 'bcd-ripple', frame: 13, caption: 'The decade ripple counter used the asynchronous way: the clear has acted, and the count is back at 0000, but 1010 was there for a moment first.' },
      { lab: 'p7lab-mod10' },
      { tip: 'The same idea gives any modulus: to count from 0 to m − 1, decode m − 1 into a synchronous load of 0 (or a 74163 clear). Or count up to 15 and load 16 − m at the carry out, RCO, which needs no decoding gate at all.' },
      { h: 'What to take away' },
      { list: ['74161: asynchronous clear; 74163: synchronous clear; both: synchronous load.', 'Asynchronous reset: decode m, and the state m glitches.', 'Synchronous reset or load: decode m − 1, and nothing glitches.'] },
      { exercise: 'p7x-mod10-choice' }, { exercise: 'p7x-mod12-detect' }, { exercise: 'p7x-lab-mod10' },
    ],
  });

  L({
    id: 'p7l-lockout', chapter: 'p7-ch-sync', title: 'Unused states and lock-out', minutes: 8,
    summary: 'A mod-6 counter has three flip-flops and eight states, two of which it never visits. Power-up or noise can leave it in one of them. Will it find its way back?',
    blocks: [
      'When a counter is designed with K-maps, the unused states are don\'t-cares: whatever the minimiser chose for them is what the circuit will do from there. Usually it does something harmless. Sometimes the unused states form a cycle of their own, and the counter, once there, never comes back: **lock-out**.',
      { topic: 'counter-lockout', input: { design: 'jlock', start: 2 }, frame: 2, caption: 'A 3-bit Johnson counter started in 010 (one of its two unused states) goes to 101 and back again, for ever.' },
      { topic: 'counter-lockout', input: { design: 'mod6', start: 6 }, frame: 1, caption: 'A mod-6 counter started in 110 goes to 111, then to 100, back in the sequence: it is self-correcting.' },
      { predict: { q: 'How do you make sure a counter cannot lock out?', options: ['Clear it at power-up and hope', 'Work out the next state of every unused state and, if they form a cycle, choose some don\'t-cares to lead back into the sequence', 'Add a flip-flop'], answer: 1, explain: 'A power-on clear is good practice, but noise can still push a counter into an unused state. The self-correcting Johnson counter in the topic\'s examples is built that way.' } },
      { fsm: 'moore\ninputs E\noutputs Y2 Y1 Y0\nC0/000: 0 -> C0, 1 -> C1\nC1/001: 0 -> C1, 1 -> C2\nC2/010: 0 -> C2, 1 -> C3\nC3/011: 0 -> C3, 1 -> C4\nC4/100: 0 -> C4, 1 -> C5\nC5/101: 0 -> C5, 1 -> C0', caption: 'A mod-6 counter with an enable E, as a state machine: six states, so three flip-flops, with codes 110 and 111 unused.' },
      { h: 'What to take away' },
      { list: ['Unused states are don\'t-cares in the design, but real states in the circuit.', 'Check where each one leads; a cycle of unused states is lock-out.', 'Self-correcting: every unused state leads back into the sequence.'] },
      { exercise: 'p7x-lockout' }, { exercise: 'p7x-unused-next' }, { exercise: 'p7x-mod6-eq' }, { exercise: 'p7x-gray-jk' },
    ],
  });

  // =========================================================================================================
  // Chapter 4: ring, Johnson and sequence generators
  // =========================================================================================================
  L({
    id: 'p7l-ring-johnson', chapter: 'p7-ch-shiftcount', title: 'Ring and Johnson counters', minutes: 9,
    summary: 'Feed a shift register\'s last output back to its first input and a pattern goes round: a ring counter, one flip-flop per state. Feed back the complement instead and you get a Johnson counter, two states per flip-flop.',
    blocks: [
      'A traffic light, a stepper motor or a multiplexed display needs a signal for each of n steps, one at a time, in turn. A binary counter and a decoder would do; but a shift register with a single 1 in it, its last output fed back to its first input, does it with no decoder at all: each flip-flop is one step.',
      { topic: 'ring-counter', frame: 1, caption: 'The single 1 moved from Q0 to Q1. Each state is decoded by one flip-flop\'s output.' },
      { predict: { q: 'A ring counter that powers up with all flip-flops at 0. What does it do?', options: ['Counts normally', 'Stays at 0000 for ever', 'Loads a 1 by itself'], answer: 1, explain: 'Shifting zeros round gives zeros. A ring counter must be loaded with its single 1 (a preset), or be made self-starting: feed a 1 in whenever all but the last flip-flop are 0.' } },
      { waveform: { circuit: P.ring3, inputs: { EN: '11111111' }, clocked: true, outputs: ['Q0', 'Q1', 'Q2'] }, caption: 'A self-starting 3-bit ring: D0 = (Q0 + Q1)′. From 000 it puts in a 1, which then goes round: 100, 010, 001, 100 …' },
      { h: 'The Johnson counter' },
      'Feed back Q′ of the last flip-flop instead of Q. From 0000 the register fills with 1s from the left, then with 0s: 1000, 1100, 1110, 1111, 0111, 0011, 0001, 0000. That is 2n states from n flip-flops, and each one is picked out by a single 2-input AND of two neighbouring bits.',
      { topic: 'johnson-counter', frame: 4, caption: 'State 4 of a 4-bit Johnson counter, 1111, decoded by Q0·Q3. Only one bit changes per edge, so the decoders never glitch.' },
      { lab: 'p7lab-194' },
      { h: 'What to take away' },
      { list: ['Ring: last Q to first D; n states from n flip-flops, no decoder; it must start with one 1.', 'Johnson: last Q′ to first D; 2n states, each decoded by a 2-input AND.', 'Both have unused states: make them self-starting, or make sure they start right.'] },
      { exercise: 'p7x-ring-wave' }, { exercise: 'p7x-johnson-states' }, { exercise: 'p7x-johnson-build' }, { exercise: 'p7x-johnson-decode' }, { exercise: 'p7x-johnson-verilog' }, { exercise: 'p7x-lab-194' },
    ],
  });

  L({
    id: 'p7l-lfsr', chapter: 'p7-ch-shiftcount', title: 'Sequence generators', minutes: 8,
    summary: 'Feed a shift register with the XOR of two of its own bits and, with the right taps, it walks through every state but one before repeating: a long, pseudo-random sequence from a handful of gates.',
    blocks: [
      'Testing a circuit, scrambling a data stream, or adding noise to a sound all need a long sequence of bits that looks random but can be produced again exactly. A **linear-feedback shift register** (LFSR) makes one: a shift register whose input is the XOR of some of its outputs, the taps.',
      { topic: 'sequence-gen', frame: 3, caption: 'Q2 ⊕ Q3 feeds Q0. With these taps a 4-bit register visits all 15 non-zero states before it repeats.' },
      { predict: { q: 'Why can a 4-bit XOR-fed register never use all 16 states?', options: ['0000 shifts in XOR(0, 0) = 0 and stays at 0000', 'The XOR gate is too slow', 'The register has only 15 flip-flops'], answer: 0, explain: 'All-zero is a fixed point of XOR feedback, so it is a cycle of length 1 by itself, and a maximal sequence has 2^n − 1 states. With XNOR feedback the stuck state is all ones instead.' } },
      { topic: 'sequence-gen', input: { taps: '4b', seed: 1 }, frame: 9, caption: 'Poor taps: the 15 non-zero states split into shorter cycles, and this one repeats every 6 clocks.' },
      { waveform: { circuit: P.lfsr3, inputs: { EN: '111111111' }, clocked: true, outputs: ['Q2'] }, caption: 'A 3-bit register with XNOR feedback from Q1 and Q2: it starts happily from 000 and repeats every 7 clocks.' },
      { h: 'What to take away' },
      { list: ['An LFSR feeds the XOR of some taps back to its input.', 'The best taps give 2^n − 1 states; all-zero (XOR) or all-one (XNOR) is the stuck state.', 'The same register and seed always give the same sequence.'] },
      { exercise: 'p7x-lfsr-wave' }, { exercise: 'p7x-lfsr-period' },
    ],
  });

  // =========================================================================================================
  // Labs
  // =========================================================================================================
  // pin p of an n-pin chip with pin 1 at column col: the hole k places from the chip on that pin's strip
  const pin = (col, n, p, k) => (p <= n / 2 ? (col + p - 1) + 'jihg'[k || 0] : (col + n - p) + 'abcd'[k || 0]);

  // ---- lab: mod-10 two ways on 74161s -------------------------------------------------------------------------
  {
    const A = (p, k) => pin(4, 14, p, k), B = (p, k) => pin(14, 16, p, k), D = (p, k) => pin(26, 16, p, k);
    const BOARD = {
      chips: [{ id: 'U1', num: '7400', col: 4 }, { id: 'U2', num: '74161', col: 14 }, { id: 'U3', num: '74161', col: 26 }], clockHz: 2,
      jumpers: [
        [A(14), 'Rtp4', 'red'], [A(7), 'Rbn10', 'black'],
        // U1: n1 = (QD·QB)′ of U2; n2 = (n1·S7)′; CLR′ of U2 = (n2·n2)′ = n1·S7; LOAD′ of U3 = (QD·QA)′ of U3
        [A(1), B(11, 1), 'green'], [A(2), B(13, 1), 'green'], [A(4), A(3, 1), 'green'], [A(5), 'sw7', 'yellow'],
        [A(9), A(6), 'green'], [A(10), A(6, 1), 'green'], [A(8), B(1), 'orange'],
        [A(12), D(11, 1), 'green'], [A(13), D(14, 1), 'green'], [A(11), D(9), 'orange'],
        // U2: mod 10 by clearing at 10
        [B(16), 'Rtp14', 'red'], [B(8), 'Rbn21', 'black'], [B(2), 'clk', 'white'],
        [B(3), 'Rbn16', 'black'], [B(4), 'Rbn17', 'black'], [B(5), B(4, 1), 'black'], [B(6), 'Rbn19', 'black'],
        [B(7), 'Rbp20', 'red'], [B(10), 'Rtp20', 'red'], [B(9), 'Rtp21', 'red'],
        [B(14), 'ch0', 'blue'], [B(13), 'ch1', 'blue'], [B(12), 'ch2', 'blue'], [B(11), 'ch3', 'blue'],
        // U3: mod 10 by loading 0000 at 9
        [D(16), 'Rtp26', 'red'], [D(8), 'Rbn33', 'black'], [D(1), A(5, 1), 'yellow'], [D(2), B(2, 1), 'white'],
        [D(3), 'Rbn28', 'black'], [D(4), 'Rbn29', 'black'], [D(5), D(4, 1), 'black'], [D(6), 'Rbn31', 'black'],
        [D(7), 'Rbp32', 'red'], [D(10), 'Rtp32', 'red'],
        [D(14), 'ch4', 'blue'], [D(13), 'ch5', 'blue'], [D(12), 'ch6', 'blue'], [D(11), 'ch7', 'blue'],
      ],
    };
    C.lab({
      id: 'p7lab-mod10', chapter: 'p7-ch-sync', title: 'Mod-10 two ways: clear or load',
      aim: 'Make two 74161 counters count 0 to 9, one by clearing at ten through its asynchronous CLR′ and one by loading 0000 at nine through its synchronous LOAD′, and find the glitch that only the first one has on the logic analyser.',
      parts: ['7400', '74161', '74161'],
      steps: [
        'Place the 7400 with pin 1 at column 4, and two 74161s with pin 1 at columns 14 (U2) and 26 (U3). Power all three (the 74161 has VCC on pin 16 and GND on pin 8).',
        'On both counters: ENP (pin 7) and ENT (pin 10) high; data inputs A to D (pins 3 to 6) low; CLK (pin 2) from the clock. U2\'s outputs QA to QD (pins 14, 13, 12, 11) to channels 0 to 3, U3\'s to channels 4 to 7.',
        'U2, clear at ten: NAND gate 1 takes QD and QB of U2. Gate 2 NANDs that with switch S7 (the power-on reset), and gate 3, with both inputs joined, inverts it into U2\'s CLR′ (pin 1). U2\'s LOAD′ (pin 9) goes high.',
        'U3, load at nine: NAND gate 4 takes QD and QA of U3 and drives U3\'s LOAD′ (pin 9). U3\'s CLR′ (pin 1) goes to S7 as well.',
        'Set the clock to 2 Hz and raise S7. Both counters run 0 to 9. Press Hold on the analyser and zoom in on the edge where U2 goes from 9 to 0: QB (channel 1) flashes high for a few tens of nanoseconds. U3 shows nothing there.',
        'Optional: swap U2 for a 74163 (same pins) and keep its wiring. Its clear now waits for an edge, so it counts 0 to 10. Put the 74161 back before checking.',
        'Before pressing Check, set S7 to 0: the check raises it itself.',
      ],
      observe: { corner: 'yes 1, no 0', rows: ['counts 0 to 9', 'goes from 9 to 0', '10 flashes on QB'], cols: ['U2 (clear)', 'U3 (load)'], cells: { 'counts 0 to 9|U2 (clear)': '1', 'counts 0 to 9|U3 (load)': '1', 'goes from 9 to 0|U2 (clear)': '1', 'goes from 9 to 0|U3 (load)': '1', '10 flashes on QB|U2 (clear)': '1', '10 flashes on QB|U3 (load)': '0' } },
      checks: [
        { kind: 'power' },
        // S6 is not wired: setting it first only lets the power-on clear pass through U1's gates before S7 rises
        { kind: 'count', set: { S6: 0, S7: 1 }, outputs: ['ch0', 'ch1', 'ch2', 'ch3'], sequence: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
        { kind: 'count', set: { S6: 0, S7: 1 }, outputs: ['ch4', 'ch5', 'ch6', 'ch7'], sequence: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
      ],
      reference: BOARD, start: { chips: BOARD.chips, jumpers: [], clockHz: 2 },
    });
  }

  // ---- lab: ring and Johnson counters on 74194s -----------------------------------------------------------------
  {
    const A = (p, k) => pin(4, 14, p, k), B = (p, k) => pin(14, 16, p, k), D = (p, k) => pin(26, 16, p, k);
    const BOARD = {
      chips: [{ id: 'U1', num: '7402', col: 4 }, { id: 'U2', num: '74194', col: 14 }, { id: 'U3', num: '74194', col: 26 }], clockHz: 2,
      jumpers: [
        [A(14), 'Rtp4', 'red'], [A(7), 'Rbn10', 'black'],
        // U1: SR of U2 = ((QA + QB) + QC)′, the self-starting ring feed; SR of U3 = QD′ of U3, the Johnson feed
        [A(2), B(15, 1), 'green'], [A(3), B(14, 1), 'green'], [A(5), A(1), 'green'], [A(6), A(5, 1), 'green'],
        [A(8), A(4), 'green'], [A(9), B(13, 1), 'green'], [A(10), B(2), 'orange'],
        [A(11), D(12, 1), 'green'], [A(12), A(11, 1), 'green'], [A(13), D(2), 'orange'],
        // U2: ring counter, shift right
        [B(16), 'Rtp14', 'red'], [B(8), 'Rbn21', 'black'], [B(1), 'sw7', 'yellow'],
        [B(3), 'Rbn16', 'black'], [B(4), 'Rbn17', 'black'], [B(5), B(4, 1), 'black'], [B(6), 'Rbn19', 'black'], [B(7), 'Rbn20', 'black'],
        [B(11), 'clk', 'white'], [B(10), 'Rtn20', 'black'], [B(9), 'Rtp21', 'red'],
        [B(15), 'ch0', 'blue'], [B(14), 'ch1', 'blue'], [B(13), 'ch2', 'blue'], [B(12), 'ch3', 'blue'],
        // U3: Johnson counter, shift right
        [D(16), 'Rtp26', 'red'], [D(8), 'Rbn33', 'black'], [D(1), B(1, 1), 'yellow'],
        [D(3), 'Rbn28', 'black'], [D(4), 'Rbn29', 'black'], [D(5), D(4, 1), 'black'], [D(6), 'Rbn31', 'black'], [D(7), 'Rbn32', 'black'],
        [D(11), B(11, 1), 'white'], [D(10), 'Rtn32', 'black'], [D(9), 'Rtp33', 'red'],
        [D(15), 'ch4', 'blue'], [D(14), 'ch5', 'blue'], [D(13), 'ch6', 'blue'], [D(12), 'ch7', 'blue'],
      ],
    };
    const RING = ['1000', '0100', '0010', '0001', '1000', '0100', '0010', '0001'], JOHN = ['1000', '1100', '1110', '1111', '0111', '0011', '0001', '0000'];
    const rows = RING.map((_, i) => String(i + 1)), cells = {};
    rows.forEach((r, i) => { cells[r + '|R: QA'] = RING[i][0]; cells[r + '|J: QA'] = JOHN[i][0]; cells[r + '|J: QD'] = JOHN[i][3]; });
    C.lab({
      id: 'p7lab-194', chapter: 'p7-ch-shiftcount', title: 'Ring and Johnson counters from the 74194',
      aim: 'Turn two 74194 universal shift registers into a self-starting ring counter and a Johnson counter, both shifting right, and read their sequences off the logic analyser side by side.',
      parts: ['7402', '74194', '74194'],
      steps: [
        'Place the 7402 with pin 1 at column 4 and two 74194s with pin 1 at columns 14 (U2) and 26 (U3). Power all three; on the 7402 the outputs come first on each gate (pin 1 is 1Y).',
        'On both 74194s: mode shift right, S1 (pin 10) low and S0 (pin 9) high; CLK (pin 11) from the clock; CLR′ (pin 1) from S7; the unused inputs A to D and SL (pins 3 to 7) low. QA to QD (pins 15, 14, 13, 12) to channels 0 to 3 for U2 and 4 to 7 for U3.',
        'Ring feed for U2: NOR QA and QB (gate 1), invert that with gate 2 (both inputs joined), and NOR the result with QC (gate 3). Gate 3\'s output, (QA + QB + QC)′, goes to U2\'s SR (pin 2): a 1 goes in whenever the first three bits are 0.',
        'Johnson feed for U3: gate 4, both inputs from U3\'s QD, drives U3\'s SR: QD′ goes in.',
        'Set the clock to 2 Hz, raise S7, and fill in the table from the analyser: QA of the ring (R), and QA and QD of the Johnson counter (J), after each of the first eight edges.',
        'Before pressing Check, set S7 to 0.',
      ],
      observe: { corner: 'edge', rows, cols: ['R: QA', 'J: QA', 'J: QD'], cells },
      checks: [
        { kind: 'power' },
        { kind: 'count', set: { S7: 1 }, outputs: ['ch0', 'ch1', 'ch2', 'ch3'], sequence: [1, 2, 4, 8] },
        { kind: 'count', set: { S7: 1 }, outputs: ['ch4', 'ch5', 'ch6', 'ch7'], sequence: [0, 1, 3, 7, 15, 14, 12, 8] },
      ],
      reference: BOARD, start: { chips: BOARD.chips, jumpers: [], clockHz: 2 },
    });
  }

  // =========================================================================================================
  // A tour and a course
  // =========================================================================================================
  C.tour({
    id: 'p7-tour', title: 'Tour: registers and counters', blurb: 'Where the register and counter topics are, how to watch a ripple, and the 74-series counters on the bench.',
    steps: [
      { route: 'part=registers', text: 'Part 7 builds on flip-flops: registers that load and shift, and counters of every kind. Each card is a family of topics.' },
      { route: 'topic=ripple-counter', target: '#stageWrap', text: 'A ripple counter, zoomed in on one edge: the bits change one after another, and the outputs show false counts on the way.' },
      { target: '#inputs', text: 'Choose 3 or 4 bits, the count to decode, and the technology; the decoder\'s glitches are counted for you.' },
      { route: 'topic=sync-counter', target: '#stageWrap', text: 'The synchronous counter: every flip-flop on one clock, with AND gates deciding which bits toggle. All the bits change together.' },
      { route: 'topic=universal-shift', target: '#inputs', text: 'The universal shift register takes a mode per edge: 0 hold, 1 shift right, 2 shift left, 3 load.' },
      { route: 'topic=counter-lockout', target: '#stageWrap', text: 'Unused states: start a counter in one and see whether it finds its way back or locks out.' },
      { route: 'lab=p7lab-mod10', target: '#labExp', text: 'On the bench, two 74161s count to ten, one by clear and one by load. The analyser catches the glitch the clear makes.' },
      { route: 'learn', target: '[data-chapter="p7-ch-registers"]', text: 'The lessons of Part 7 start here. The exercises ask for waveforms, circuits, timing, state-machine equations and Verilog, each checked by simulation.' },
    ],
  });

  C.course({
    id: 'p7-course', title: 'Registers and counters, from a row of flip-flops to a sequence generator',
    blurb: 'Every topic of Part 7 in order, with the lessons that explain them and a few exercises on the way.',
    steps: [
      { topic: 'reg-load', note: 'Load or hold, with the clock left alone.' },
      { lesson: 'p7l-reg-load' },
      { topic: 'shift-reg', note: 'A word moving one place per clock.' },
      { topic: 'serial-transfer', note: 'One register to another over a single wire.' },
      { exercise: 'p7x-shift-wave', note: 'Complete a shift register\'s outputs.' },
      { topic: 'universal-shift', note: 'Four behaviours chosen edge by edge.' },
      { topic: 'ripple-counter', note: 'The cheapest counter, and its false counts.' },
      { topic: 'bcd-ripple', note: 'Counting to ten by clearing at ten.' },
      { lesson: 'p7l-ripple' },
      { topic: 'sync-counter', note: 'Every bit on one clock.' },
      { exercise: 'p7x-sync-fmax', note: 'How fast can it count?' },
      { topic: 'updown-counter', note: 'Up, down and load.' },
      { topic: 'counter-diagram', note: 'A counter as a state diagram.' },
      { lesson: 'p7l-modulus' },
      { topic: 'counter-lockout', note: 'Where the unused states lead.' },
      { exercise: 'p7x-unused-next', note: 'Work out where a mod-6 counter\'s unused states go.' },
      { topic: 'ring-counter', note: 'A single 1 going round.' },
      { topic: 'johnson-counter', note: 'Twice the states, one bit changing at a time.' },
      { topic: 'sequence-gen', note: 'A long sequence from a few gates.' },
      { exercise: 'p7x-lfsr-wave', note: 'Complete a sequence generator\'s output.' },
    ],
  });

  if (S.Checks) {
    const ready = (sel) => "document.querySelector('" + sel + "')";
    for (const l of C.lessons.values()) if (/^p7l-/.test(l.id)) S.Checks.push({ group: 'learn', name: 'p7 lesson ' + l.id, hash: 'lesson=' + l.id, ready: ready('#lessonView'), sel: '#main' });
    for (const id of ['p7lab-mod10', 'p7lab-194']) S.Checks.push({ group: 'learn', name: 'p7 lab ' + id, hash: 'lab=' + id, ready: ready('#labExp'), sel: '#main' });
    S.Checks.push({ group: 'courses', name: 'p7 course', hash: 'course=p7-course', ready: ready('#courseView'), sel: '#main' });
  }
})(globalThis.Sirkit = globalThis.Sirkit || {});
