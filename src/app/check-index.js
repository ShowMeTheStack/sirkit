// EXERCISE KINDS: the reference for content writers. An exercise is
//   S.Content.exercise({ id, chapter, title, level: 1..3, kind, text: ['paragraph' | lesson block, ...],
//     hints: [hint 1, hint 2, 'the worked answer'], solution: <an answer that passes>,
//     wrong: [<answers that fail>, ...], why: 'said after a right answer', ...the fields of its kind })
// tools/check-content.mjs runs the solution and every wrong answer through the checker. Write a wrong answer for
// each mistake you expect, and read its message: it is what the student sees.
//
// Every checker returns { ok, message, detail? }; message is one plain sentence with the actual values.
//
//   choice      options: ['..'], answer: index | [indexes]; whyNot: {index: 'why'}.            Answer: index(es)
//   string      answer: 'text' | [...] or accept(text); set, caseless.                            Answer: text
//   number      answer, tolerance, higherLower.                                                  Answer: number
//   set         answer: '{a, b}' | '(1, 2), (2, 3)'.                                             Answer: text
//   expr        ref: "A'B + C", vars (names of several letters, like EN, stay whole), dc: [rows], maxLiterals,
//               form: 'sop' | 'pos'.                                                          Answer: expression
//   table       table: 'truth' (expr | outputs {F: ..}, vars) | 'custom' (rows, cols, cells {'row|col': v},
//               cellKind 'text' | 'bit' | 'set') | 'qmchart' | 'labobs'.                       Answer: {'row|col': text}
//   truthtable  the same as table with table: 'truth'.
//
//   circuit     Build a circuit in the embedded editor.                       check-circuit.js
//               the reference, one of: ref: "A'B + AB'" | {F: .., G: ..}; fn: {vars, ones, dc} or "expr";
//                 minterms + vars (+ dc); refCircuit: any circuit (below); machine: a state machine (sequential).
//               inputs: ['A', 'B'] (order), outputs: ['F'], parts: ['NAND'] (the only parts allowed; ports are
//               always allowed), maxGates, maxLevels, notFree (inverters do not count as a level),
//               maxInputs (inputs per gate: 2, or by type {XOR: 2, '*': 3}), maxFanout (gate inputs one gate
//               output or input port may drive),
//               start: a circuit the editor opens with (the given ports: an editor document or text netlist),
//               depth (clocks per sequence, sequential), sequences: [[{X: 1}, ...]] tried first, extraInputs,
//               steps: [{S: 1, R: 0}, {S: 0, R: 0}, ...] (feedback without a clock, with refCircuit: both
//               circuits go through these settings in order and must agree after each).
//               Answer: an editor document, or a text netlist:
//                   n1 = NAND(A, B)          F = NAND(n1, n1)          Q = DFF(D)  (clocked by CLK; Q' is Q-bar)
//                   m = MUX(d0=A, d1=B, s0=S)     d = DECODER[k=2](a1=A1, a0=A0)     d.y3 is a pin
//                   (arguments without names fill the inputs in pin order, a0 first)
//               Exhaustive: every input row (combinational), or every input sequence up to depth clocks from all
//               flip-flops at 0, outputs compared before each clock edge. The first difference is the message,
//               and detail {inputs, want, got, step, sequence} lets the student open the run in the workbench.
//   timing      circuit (any form), tech: 'CMOS' | 'TTL' | 'LS-TTL' | 'FPGA-like', ask: 'critical' (ns) |
//               'tmin' (ns) | 'fmax' (MHz) | 'slack' (ns, with period) | 'arrival' (ns, with net),
//               tolerance (default 1 %). The answer comes from Sirkit.Sim.sta.                   Answer: number
//   waveform    circuit, inputs: {A: '00110011', B: '01010101'} (one character per slot), outputs: ['F'],
//               clocked (each slot is a clock cycle, read before its edge), or slotNs + tech (each slot lasts
//               slotNs ns of a run with that preset's delays; the level at its end), given: {F: '01??????'}.
//                                                                                      Answer: {F: '01101001'}
//
//   kmap        the function: fn | minterms + vars (+ dc) | maxterms + vars | expr + vars (+ dc);
//               form: 'sop' | 'pos'; allowNotMinimal. Checked by Bool.checkCover: minimal / correct but not
//               minimal (with a smaller cover) / wrong. hazardFree: true asks for a cover with no static hazard
//               (Bool.staticHazards: static-1 for SOP, static-0 for POS); a split pair of neighbours fails with
//               the consensus term to add, and the cover is measured against Bool.hazardFree instead.
//                                                           Answer: groups, each [cells] | '1-0-' | "A'C" | "(A + C')"
//   qm          the function as kmap; form; ask: 'primes' | 'essentials' | 'cover' | 'chart'.
//               Answer: terms ["B'C'", '-0-0'] or "B'C', B'D'"; for chart a table {'P1: B\'C\'|5': 'X'}
//   proof       start: "AB + AB'", goal: 'A' (or maxLiterals: n), laws: ['distributive', 'complement', ...]
//               (ids or names from Bool.laws; commutative and associative steps are always free), maxSteps.
//               Each step must equal the line before and follow from its law in one step.
//               Answer: [{expr, law}] or lines "A(B + B') ; distributive"
//   simplify    the function as kmap (expr, ref, fn or minterms, with dc), form, maxLiterals, maxTerms,
//               minimal (as few terms and literals as the minimiser finds).                    Answer: expression
//   convert     op: 'base' (value, from, to, fracDigits) | 'complement' (value, base, complement: 'r' | 'r-1',
//               digits) | 'signed' (value, bits, rep: '2s' | '1s' | 'sm') | 'signed-value' (value: bits, rep) |
//               'code' (value, code: 'bcd' | 'excess-3' | '2421') | 'gray' (value, to: 'gray' | 'binary') |
//               'hamming-encode' (value: data bits, secded) | 'hamming-decode' (value: code word, secded,
//               ask: 'position' | 'data' | 'corrected' | 'syndrome').
//               Answer: the result as text, or {result, working} (the working is kept, not marked)
//
//   fsm         machine: text (Fsm.parse: "S0: 0 -> S0/0, 1 -> S1/0") | a create() spec; design: {ff: 'D' |
//               'JK' | 'T' | 'SR', assign: 'binary' | 'gray' | 'onehot' | {S0: '00', ..}}; minimal (equations).
//               stage: one of 'table' | 'reduce' | 'implication' | 'assign' | 'transition' | 'excitation' |
//               'equations' | 'circuit', or stages: [...] for the flow (the answer then {stage: answer}).
//               Answers: table: machine text | {'S0|0|next': 'S1', 'S0|0|out': '0'} (Moore: 'S0|-|out');
//               reduce: '{S0, S2}, {S1}'; implication: '(S0, S1), (S1, S2)' (the pairs crossed out);
//               assign: 'S0 = 00, S1 = 01'; transition: {'S0|0|next': '01', 'S0|0|out': '0'};
//               excitation: {'S0|0|D1': '0', ...}; equations: {D1: "Q0X'", Z: 'Q1X'} or lines; circuit: a circuit.
//   verilog     module: 'name', testbench: hidden Verilog, top ('tb'), lint (default true: no warnings),
//               synth (must synthesise), pass: 'text the testbench prints at the end', ports: 'a, b, y' (said
//               when they do not fit), start: 'module …' (the editor's first text). The testbench prints a
//               line starting FAIL for every case that goes wrong, with the inputs and values.  Answer: source
//   cpu         tests: [{input: [3, 4], output: [7], mem: {total: 7}}], ref: a reference program (its outputs
//               and memory are the expected ones when a test gives none), check: 'output' | 'memory',
//               memory: ['total'] (labels or addresses compared with the reference), maxCycles, maxBytes,
//               start: the editor's first text.                                              Answer: source
//   lab         lab: 'lab-id' (see src/app/labs.js). Answer: {bench: a bench state, observe: {'row|col': v}}
//
// Hints: three, the last a worked answer. Lesson blocks: src/app/lessons.js. Labs: src/app/labs.js.
(function (S) {
  'use strict';
  const K = (S.Check = S.Check || {});
  /** the kinds this file documents, for tools that list them */
  K.kindNames = ['choice', 'string', 'number', 'set', 'expr', 'table', 'truthtable', 'circuit', 'timing', 'waveform', 'kmap', 'qm', 'proof', 'simplify', 'convert', 'fsm', 'verilog', 'cpu', 'lab'];
})(globalThis.Sirkit = globalThis.Sirkit || {});
