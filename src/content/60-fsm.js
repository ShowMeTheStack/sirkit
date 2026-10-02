// Part 6 lessons: clocked sequential design and state machines. Four chapters in teaching order: machines that
// remember (states, tables and diagrams, reading a circuit back, Mealy against Moore, converting between them),
// fewer states (the implication table, partition refinement, equivalent machines), from table to circuit (state
// assignment, excitation tables, the whole design flow, unused codes), and machines at work (detectors, a serial
// adder, a coin controller, and the same machines in Verilog). The exercises are in 60-fsm-ex.js; a tour and a
// course close this file. Every machine and circuit here is our own.
(function (S) {
  'use strict';
  const C = S.Content;
  if (!C || C.lessons.has('fsm-l-state')) return;

  C.chapter({ id: 'fsm-basics', part: 'machines', n: 1, title: 'Machines that remember', blurb: 'What a state is, how a clocked circuit is read back into a state table, and when the output of a Mealy or a Moore machine moves.' });
  C.chapter({ id: 'fsm-reduce', part: 'machines', n: 2, title: 'Fewer states', blurb: 'States that no input can tell apart are one state: the implication table, partition refinement, and machines compared.' });
  C.chapter({ id: 'fsm-design', part: 'machines', n: 3, title: 'From table to circuit', blurb: 'Codes for the states, excitation tables for D, JK and T flip-flops, the equations, the circuit, and what the unused codes do.' });
  C.chapter({ id: 'fsm-uses', part: 'machines', n: 4, title: 'Machines at work', blurb: 'Sequence detectors, a serial adder and a coin controller, built as circuits and written in Verilog.' });

  const L = (x) => C.lesson(x);
  const X = (id) => ({ exercise: id });

  // machines and circuits the lessons draw (the exercises have their own)
  const TURN = 'moore\ninputs X\noutputs Z\nstart A\nA/0: 0 -> A, 1 -> B\nD/1: 0 -> A, 1 -> D\nC/0: 0 -> A, 1 -> D\nB/0: 0 -> A, 1 -> C';
    const DIFF = 'mealy\ninputs X\noutputs Z\nstart N\nN: 0 -> Z0/0, 1 -> Z1/0\nZ0: 0 -> Z0/0, 1 -> Z1/1\nZ1: 0 -> Z0/1, 1 -> Z1/0';
  const DIFF_D = 'seen = DFF(1)\nlast = DFF(X)\nd = XOR(last, X)\nZ = AND(seen, d)';
  const LOCK_D = 'o1 = OR(q1, q0)\nd1 = AND(o1, X)\nnq1 = NOT(q1)\nnq0 = NOT(q0)\nd0 = AND(nq1, nq0, X)\nq1 = DFF(d1)\nq0 = DFF(d0)\nZ = q1';
  const TWO_D = 'nx = NOT(X)\nt1 = AND(q1, nx)\nt2 = AND(q0, X)\nd1 = OR(t1, t2)\nq1 = DFF(d1)\nq0 = DFF(X)\nZ = AND(q1, q0)';
  const EDGE_V = 'module rise(input clk, input rst, input x, output z);\n  reg last, pulse;\n  always @(posedge clk)\n    if (rst) begin last <= 1\'b0; pulse <= 1\'b0; end\n    else begin pulse <= x & ~last; last <= x; end\n  assign z = pulse;\nendmodule\n\nmodule tb;\n  reg clk = 0, rst = 1, x = 0; wire z; integer i; reg [9:0] pat;\n  rise u(.clk(clk), .rst(rst), .x(x), .z(z));\n  always #5 clk = ~clk;\n  initial begin\n    pat = 10\'b0111001101;\n    @(negedge clk); rst = 0;\n    for (i = 9; i >= 0; i = i - 1) begin\n      x = pat[i];\n      @(negedge clk);\n      $display("x = %b  z = %b", x, z);\n    end\n    $finish;\n  end\nendmodule';

  // =========================================================================================================
  // Chapter 1: machines that remember
  // =========================================================================================================
  L({
    id: 'fsm-l-state', chapter: 'fsm-basics', title: 'What a state remembers', minutes: 8,
    summary: 'A clocked machine keeps a small summary of the past, its state. On each clock edge the state and the input pick the next state; the output comes from the state, or from the state and the input.',
    blocks: [
      'A turnstile, a combination lock and a vending machine all react to what has happened before, not only to what is happening now. A gate cannot do that: its output depends on its inputs right now. To remember, a circuit needs flip-flops, and the pattern they store is the **state**.',
      'The question that shapes every design in this part is: *what must the machine remember about the past to react correctly to the next input?* Usually the answer is short. To spot the bits 1, 1, 0 in a stream you never need the whole stream, only how much of 110 the input currently ends with: nothing, 1, or 11. Three states.',
      { def: 'State machine', text: 'a set of states, a start state, a next-state function that maps (state, input) to a state, and an output function. All changes happen at clock edges.' },
      { topic: 'fsm-run', input: { m: 'det110', seq: '' }, frame: 5, caption: 'Clock 3: the machine is in S2 (it has just read 11) and X = 0 arrives. The lit row and column of the table give the next state S0 and the output Z = 1. Step on to see the edge move it.' },
      'The table and the diagram say the same thing. A row of the **state table** is a state; a column is an input value; each entry is the next state (and, for this machine, the output). In the **state diagram** each circle is a state and each arrow is one entry of the table, labelled input/output.',
      { predict: { q: 'The 110 detector is in S1 (it has seen one 1). The next two bits are 1 and 1. Where is it then?', options: ['S0', 'S1', 'S2'], answer: 2, explain: 'After 11 the input ends in 11, which is S2. Another 1 keeps it ending in 11, so it stays in S2.' } },
      { h: 'A machine whose output belongs to the state' },
      'This machine counts 1s in a row and saturates at three: Z = 1 once the last three bits were all 1, and any 0 starts the count again. Its output is written inside each state, because it depends on the state alone. Such a machine is called a **Moore** machine; the 110 detector, whose outputs sit on the arrows, is a **Mealy** machine.',
      { fsm: TURN, caption: 'A, B, C count the 1s in a row; D means "three or more". A 0 always goes back to A.' },
      { tip: 'Write down the meaning of each state before drawing any arrow. Every arrow then follows from the meanings: "in B (one 1 seen), a 1 means two 1s seen, which is C".' },
      { h: 'Recap' },
      { list: ['The state is all the machine remembers; it changes only at a clock edge.', 'Next state = f(state, input). Output = g(state) for Moore, g(state, input) for Mealy.', 'A state table and a state diagram hold the same information.', 'Design starts by asking what must be remembered.'] },
      X('fsm-ex-run-state'), X('fsm-ex-run-output'), X('fsm-ex-table-lock'), X('fsm-ex-table-100'),
    ],
  });

  L({
    id: 'fsm-l-analyse', chapter: 'fsm-basics', title: 'Reading a clocked circuit', minutes: 9,
    summary: 'Any circuit of flip-flops and gates is a state machine. Write the flip-flop input equations, turn them into state equations, and fill in a table with one row per code.',
    blocks: [
      'You are handed a circuit: a couple of flip-flops, some gates, an input and an output. What does it do? Simulating a few inputs gives clues, but the reliable way is to recover its state table. That is **analysis**, the reverse of design.',
      { steps: ['Name the flip-flop outputs (the state variables) and write the equation of every flip-flop input, following the wires back from it.', 'Turn each input equation into a state equation: D gives Q(t+1) = D; T gives Q(t+1) = T ⊕ Q; JK gives Q(t+1) = JQ′ + K′Q.', 'Write the output equations. If an output uses an input, the circuit is Mealy; if it uses the state variables only, Moore.', 'Fill in the state table: one row per code, one column per input value.', 'Draw the diagram, and say in words what the machine does.'] },
      { topic: 'fsm-analysis', input: { c: 'dmealy' }, frame: 8, caption: 'Row 01: with X = 1 the state equations give 11. The table fills in one row at a time; the last frame draws the diagram.' },
      { h: 'Try one by hand' },
      'Here is a small circuit with two D flip-flops: D1 = Q1X′ + Q0X, D0 = X, and Z = Q1Q0.',
      { circuit: TWO_D, outputs: ['Z'], caption: 'Two D flip-flops, q1 and q0. Try it opens it in the workbench, where it can be clocked by hand.' },
      'And here is how it runs on nine bits of X:',
      { waveform: { circuit: TWO_D, inputs: { X: '011011010' }, clocked: true, outputs: ['Z'] }, caption: 'Each column is one clock; the outputs are read just before the rising edge.' },
      { predict: { q: 'From the equations, what does Q0 hold during a clock?', options: ['the X of the clock before', 'the X of this clock', 'always 0'], answer: 0, explain: 'D0 = X, so the edge copies X into Q0: during the next clock Q0 is the previous bit.' } },
      'Q0 is the previous bit. Q1 follows a rule worth reading slowly: it keeps its value while X = 0 and copies Q0 when X = 1. Putting the codes into a table is mechanical; describing the machine in a sentence is the real goal of analysis.',
      { warn: 'A JK or T flip-flop does not take its input as the next state. Always go through the characteristic equation; writing Q(t+1) = J is a common slip.' },
      { h: 'Recap' },
      { list: ['Input equations → state equations (through the characteristic equation) → state table → diagram.', 'One row per code: n flip-flops give 2ⁿ rows, used or not.', 'An output that reads an input makes the circuit Mealy.'] },
      X('fsm-ex-analyse-d'), X('fsm-ex-analyse-jk'), X('fsm-ex-analyse-t'),
    ],
  });

  L({
    id: 'fsm-l-mealy-moore', chapter: 'fsm-basics', title: 'When does the output move?', minutes: 8,
    summary: 'A Mealy output answers inside the clock, as soon as the input arrives; a Moore output answers at the next edge and stays steady for a whole clock. Each has its uses.',
    blocks: [
      'Two detectors look for the same pattern. One raises its output during the very clock in which the last bit arrives; the other raises it one clock later. Is one of them wrong? No: they are the two kinds of machine, and the difference is *when* the output may change.',
      { topic: 'mealy-moore', input: { pattern: '110', seq: '1101100' }, frame: 5, caption: 'The third bit, 0, completes 110. The Mealy output rises as soon as X arrives, in the middle of the clock; the Moore machine will show its 1 only after the next edge.' },
      { predict: { q: 'The next frame is the rising edge that ends this clock. What does the Moore output do?', options: ['It turns 1 at the edge, and stays 1 for the whole next clock', 'It stays 0: the Moore machine missed the pattern', 'It turns 1 only when the next input arrives'], answer: 0, explain: 'The edge takes the Moore machine into S3, the state that means "just saw 110", and S3 outputs 1 for a whole clock.' } },
      { h: 'The same idea in gates' },
      'Here a Mealy machine sets Z = 1 when the bit now on X differs from the bit before it. The flip-flop "last" holds the previous bit, and "seen" turns 1 after the first clock so that the very first bit is not compared with nothing. Z is an XOR of the stored bit and X itself: it changes as soon as X does.',
      { waveform: { circuit: DIFF_D, inputs: { X: '001011101' }, clocked: true, outputs: ['Z'] }, caption: 'Z = 1 in every clock whose bit differs from the one before.' },
      { fsm: DIFF, caption: 'The same machine as a diagram: Z0 and Z1 remember the last bit, N means nothing read yet.' },
      { h: 'Choosing' },
      { table: [['', 'Mealy', 'Moore'], ['Output depends on', 'state and input', 'state only'], ['Reacts', 'in the same clock', 'one clock later'], ['States', 'usually fewer', 'often one more per output value'], ['Output glitches', 'can follow input glitches', 'clean, changes only at edges']], caption: 'Neither is better in general.' },
      { tip: 'When a Mealy output drives another clocked circuit, it is read at the next edge anyway, so its early arrival costs nothing. When it drives something outside, like a lamp or another chip, a Moore output (or a Mealy output passed through a flip-flop) is the safer choice.' },
      { h: 'Recap' },
      { list: ['Mealy: Z = λ(state, X); it can change whenever X changes.', 'Moore: Z = λ(state); it changes only just after an edge, and lasts a whole clock.', 'Both detect the same patterns; the Moore answer comes one clock later.'] },
      X('fsm-ex-mealy-when'), X('fsm-ex-moore-wave'),
    ],
  });

  L({
    id: 'fsm-l-convert', chapter: 'fsm-basics', title: 'From Mealy to Moore and back', minutes: 7,
    summary: 'A Moore machine becomes Mealy by copying each state\'s output onto the arrows into it. A Mealy machine becomes Moore by splitting each state into one copy per output on the arrows that enter it.',
    blocks: [
      'Every Mealy machine has a Moore twin and the other way round, as long as you accept the one-clock shift in the output. The conversions are short recipes.',
      { h: 'Moore to Mealy' },
      'Put the output of each state on every arrow that enters it. The number of states stays the same; the output now appears during the clock in which the arrow is taken, one clock earlier than before.',
      { h: 'Mealy to Moore' },
      'Look at the arrows entering each state. If they all carry the same output, the state keeps that output. If they carry different outputs, split the state into one copy per output; each copy has all of the original state\'s outgoing arrows.',
      { topic: 'mealy-moore-convert', input: { m: 'two' }, frame: 4, caption: 'The "two equal bits" machine: B and C are each entered with both outputs, so each splits in two. Five Moore states for three Mealy ones.' },
      { predict: { q: 'This Mealy machine outputs 1 on every second bit. How many Moore states does it need?', options: ['2', '3', '4'], answer: 1, explain: 'O is entered only from E, always with output 0, so it stays one state. E is entered from O with 0 (on X = 0) and with 1 (on X = 1), so it splits in two: 3 states.' } },
      { table: [['state', 'X = 0', 'X = 1'], ['E', 'O / 0', 'O / 0'], ['O', 'E / 0', 'E / 1']], caption: 'E: an even number of bits read so far; O: odd. Each entry is next state / Z: Z = 1 on X = 1 read in O.' },
      { warn: 'After splitting, the start state is the copy with the output the machine should show before any input: normally 0. The other copy is never the start.' },
      { h: 'Recap' },
      { list: ['Moore → Mealy: an arrow into q carries q\'s output. Same states.', 'Mealy → Moore: one copy of q per output on the arrows into q.', 'The Moore outputs come one clock later.'] },
      X('fsm-ex-to-moore'), X('fsm-ex-moore-count'),
    ],
  });

  // =========================================================================================================
  // Chapter 2: fewer states
  // =========================================================================================================
  L({
    id: 'fsm-l-equivalent', chapter: 'fsm-reduce', title: 'When two states are one', minutes: 10,
    summary: 'Two states are equivalent when no input sequence makes them give different outputs. The implication table finds every such pair by crossing out pairs that differ, round after round.',
    blocks: [
      'A first draft of a machine often has more states than it needs: the designer gave a state to every situation that came to mind, and some of them turn out to behave identically. Fewer states can mean fewer flip-flops and always means less logic. But how do you prove that two states behave the same, for *every* input sequence, forever?',
      { def: 'Equivalent states', text: 'p and q are equivalent if, started in p and in q, the machine gives the same output sequence for every input sequence. Then p and q can be merged.' },
      'Testing every sequence is impossible, but a short argument does it. Two states are equivalent exactly when, for every input, their outputs agree *and* their next states are equivalent. So pairs that differ in an output are out at once, and the "and" spreads the crossing out to pairs that lead to them.',
      { topic: 'implication-table', input: { m: 'seven' }, frame: 22, caption: 'Round 0 is done: six pairs are crossed because their outputs differ. The other cells list the pairs they depend on.' },
      { predict: { q: 'In the next round, (A, E) needs (B, D) and (B, E). (B, D) was crossed in round 0. What happens to (A, E)?', options: ['It is crossed out', 'It stays', 'It waits for another round'], answer: 0, explain: 'One crossed pair among those it needs is enough: A and E lead, on the same input, to states that can be told apart.' } },
      { topic: 'implication-table', input: { m: 'seven' }, frame: 46, caption: 'The finished table: the open cells are the equivalent pairs, and they group into classes. Seven states become four.' },
      { steps: ['Draw one cell per pair of states (a staircase: n(n − 1)/2 cells).', 'Cross every pair whose outputs differ on some input.', 'In every other cell, write the pairs of next states it implies.', 'Repeat: cross any cell that implies a crossed pair. Stop when a round crosses nothing.', 'The open cells are equivalent pairs; join them into classes and keep one state per class.'] },
      { tip: 'A cell that implies only itself, or only the same pair of states, is not a reason to cross it. Pairs that lead only to each other are equivalent.' },
      { h: 'Recap' },
      { list: ['Equivalent = indistinguishable by any input sequence.', 'Cross on different outputs, then on implied crossed pairs, until nothing changes.', 'The open pairs form classes; each class is one state of the reduced machine.'] },
      X('fsm-ex-implication'), X('fsm-ex-pairs-left'), X('fsm-ex-reduce'),
    ],
  });

  L({
    id: 'fsm-l-partition', chapter: 'fsm-reduce', title: 'Splitting blocks, and comparing machines', minutes: 9,
    summary: 'Partition refinement starts with the states grouped by output and splits every block whose members go to different blocks. The same pairing idea also tells whether two machines are equivalent.',
    blocks: [
      'The implication table works on pairs. Partition refinement works on groups, and on a large machine it is the faster method by hand.',
      { topic: 'partition-refinement', input: { m: 'seven2' }, frame: 2, caption: 'Round 1: under each state, the block its next state lies in. A and B disagree on X = 0, so their block splits.' },
      { predict: { q: 'Once a round splits nothing, can a later round split something?', options: ['Yes, sometimes', 'No: the partition is final'], answer: 1, explain: 'A round looks only at the current blocks. If it changes nothing, the next round sees exactly the same blocks and does exactly the same.' } },
      { topic: 'partition-refinement', input: { m: 'seven2' }, frame: 6, caption: 'The final partition: four blocks, four states. Both methods always find the same classes.' },
      { h: 'Are two machines the same?' },
      'Two designers each built a machine for the same job. Do they agree on every input? Run them side by side and keep track of the *pair* of states they are in. Start from the pair of start states and explore every input. If some pair reached gives different outputs, the path to it is an input sequence that tells the machines apart; if no pair ever does, they are equivalent.',
      { topic: 'fsm-equivalence', input: { p: 'near' }, frame: 6, caption: 'One arrow differs between the two machines, and the search finds the shortest input that shows it: 1 0 0.' },
      { tip: 'The search is breadth first, so the first difference it finds comes from a shortest sequence. That sequence is a test you can run on real hardware.' },
      { h: 'Recap' },
      { list: ['P0 groups states by output; each round splits blocks whose members go to different blocks.', 'Stop when a round splits nothing; each block is a state.', 'Two machines are equivalent when no pair of states reached from their starts gives different outputs.'] },
      X('fsm-ex-reduce-moore'), X('fsm-ex-reduced-table'), X('fsm-ex-distinguish'),
    ],
  });

  // =========================================================================================================
  // Chapter 3: from table to circuit
  // =========================================================================================================
  L({
    id: 'fsm-l-assign', chapter: 'fsm-design', title: 'Codes for the states', minutes: 9,
    summary: 'Each state gets a binary code held in the flip-flops. The choice does not change what the machine does, but it changes the logic a lot: binary, Gray, one-hot and codes chosen by adjacency rules all have their place.',
    blocks: [
      'A reduced state table still talks about names like S2 and WT. The flip-flops hold bits, so each state needs a code, and that choice, the **state assignment**, is free. With 4 states and 2 flip-flops there are 24 ways to hand out the codes. Which is best?',
      { list: ['**Binary**: count the states in order, 00, 01, 10, 11. The fewest flip-flops, and easy to read.', '**Gray**: neighbours in a list differ in one bit. Good when the machine mostly steps along a sequence, like a counter.', '**One-hot**: one flip-flop per state, exactly one of them 1. The most flip-flops, but every next-state equation can be read straight off the diagram.', '**Adjacency rules**: give codes one bit apart to states that share a next state, to the next states of one state, and to states with the same output. Their 1s then land next to each other on the K-maps.'] },
      { topic: 'state-assignment', input: { m: 'det1011', ff: 'D' }, frame: 6, caption: 'The 1011 detector designed four times. Compare the gate inputs: the same machine, very different circuits.' },
      { predict: { q: 'A machine has 5 states. How many flip-flops does a binary assignment need, and how many does one-hot?', options: ['3 and 5', '2 and 5', '3 and 3'], answer: 0, explain: 'Two flip-flops give only 4 codes, so binary needs 3; one-hot needs one per state, 5.' } },
      'With fewer codes than 2ⁿ, some codes are **unused**. Their entries in the transition table are don\'t cares, and the minimiser may use them. That helps the equations, but it means the designer must later check what happens if the machine ever lands on one (the last lesson of this chapter).',
      { tip: 'Give the start state the code of all zeros (00…0). Flip-flops that are cleared at power-up, or by a reset line, then put the machine where it should begin.' },
      { h: 'Recap' },
      { list: ['n flip-flops give 2ⁿ codes; one-hot uses one flip-flop per state.', 'The assignment changes the cost, not the behaviour.', 'Unused codes are don\'t cares in the equations.', 'The start state takes all zeros.'] },
      X('fsm-ex-assign-gray'), X('fsm-ex-assign-onehot'), X('fsm-ex-transition'),
    ],
  });

  L({
    id: 'fsm-l-excite', chapter: 'fsm-design', title: 'Excitation: what makes a flip-flop change', minutes: 9,
    summary: 'A characteristic table says what a flip-flop does with its inputs; an excitation table turns it round and says which inputs cause a wanted change. Its don\'t cares are what make JK designs cheap.',
    blocks: [
      'The transition table says, for each state and input, what every flip-flop should hold after the edge. With D flip-flops that is the whole story: D is the next value. With JK or T flip-flops we must work out which inputs *cause* each change, Q → Q(t+1).',
      { topic: 'excitation-tables', input: { ff: 'JK' }, frame: 3, caption: 'To go from 0 to 1, two rows of the JK characteristic table work: J = 1 with K = 0, and J = 1 with K = 1 (toggle). So J = 1 and K does not matter.' },
      { table: [['Q → Q(t+1)', 'D', 'T', 'J', 'K'], ['0 → 0', '0', '0', '0', 'X'], ['0 → 1', '1', '1', '1', 'X'], ['1 → 0', '0', '1', 'X', '1'], ['1 → 1', '1', '0', 'X', '0']], caption: 'Excitation tables for D, T and JK flip-flops. X is a don\'t care.' },
      { predict: { q: 'With T flip-flops, what is T for a bit that must change from 1 to 0?', options: ['0', '1', 'X'], answer: 1, explain: 'T = 1 toggles. Any change needs T = 1; keeping the bit needs T = 0.' } },
      'Half the JK entries are X. Each X becomes a don\'t care on the K-map of that input, which is why JK designs often need very little logic: the up/down counter of the exercises needs J0 = K0 = 1, no gates at all.',
      'For the K-map of one flip-flop input, take its column of the excitation table. Each row of the table is one cell of the map, at the address (state code, input). Unused codes add more don\'t cares.',
      { kmap: { vars: ['Q1', 'Q0', 'X'], minterms: [3, 5], dc: [6, 7], groups: 'minimal' }, caption: 'D1 of the lock (L = 00, H = 01, O = 10): 1s where the next state is O; 110 and 111 are the unused code 11. D1 = Q1X + Q0X.' },
      { h: 'Recap' },
      { list: ['D: the next value. T: 1 when the bit changes.', 'JK: 0 → 1 needs J = 1; 1 → 0 needs K = 1; the other input is X.', 'Each flip-flop input gets its own column, then its own K-map.'] },
      X('fsm-ex-excite-rows'), X('fsm-ex-excitation-jk'), X('fsm-ex-excitation-t'), X('fsm-ex-kmap-d1'),
    ],
  });

  L({
    id: 'fsm-l-flow', chapter: 'fsm-design', title: 'The whole design flow', minutes: 11,
    summary: 'From a sentence to a working circuit in nine steps: the diagram, the table, reduction, an assignment, the excitation table, the K-maps, the equations, the gates, and a simulation that checks the result against the table.',
    blocks: [
      'Here is a job: *X brings one bit per clock; set Z = 1 on the bit that completes 1101, and let the last 1 of one match start the next.* Everything in this part so far comes together to turn that sentence into a circuit.',
      { topic: 'design-flow', input: { p: 'det1101', ff: 'D', asg: 'gray' }, frame: 4, caption: 'Step 2: the diagram, one state at a time, each with its meaning. From S3 ("seen 110") a 1 completes the pattern and is itself a new start: S1.' },
      { predict: { q: 'After step 4 (reduction), how many states are left?', options: ['2', '3', '4'], answer: 2, explain: 'S0 to S3 mean different amounts of the pattern, and the implication table crosses every pair: all 4 stay.' } },
      { topic: 'design-flow', input: { p: 'det1101', ff: 'D', asg: 'gray' }, frame: 13, caption: 'Step 7: the K-map of D1 from its column of the table. Each flip-flop input and each output gets one.' },
      { topic: 'design-flow', input: { p: 'det1101', ff: 'D', asg: 'gray' }, frame: 18, caption: 'Step 9: the circuit simulated with real gate delays, clock by clock, against the state table. They agree.' },
      { steps: ['Understand the problem; choose Mealy or Moore.', 'Draw the state diagram, with the meaning of each state.', 'Write the state table.', 'Reduce it.', 'Assign codes (start state = all zeros).', 'Write the transition table and, from the flip-flop\'s excitation table, the excitation table.', 'One K-map per flip-flop input and per output.', 'Read off minimal equations and draw the circuit.', 'Simulate it against the table; check the unused codes.'] },
      { warn: 'Most mistakes happen in step 2. A wrong arrow in the diagram survives every later step untouched, and the simulation then agrees perfectly with a wrong table. Check the diagram on a few input strings by hand before going on.' },
      { h: 'Recap' },
      { list: ['Each step is mechanical except the first two.', 'The excitation table depends on the flip-flop type; everything before it does not.', 'Simulating the finished circuit against the table catches slips in the middle steps.'] },
      X('fsm-ex-equations-d'), X('fsm-ex-flow-d'), X('fsm-ex-flow-jk'), X('fsm-ex-flow-circuit'),
    ],
  });

  L({
    id: 'fsm-l-unused', chapter: 'fsm-design', title: 'Codes nobody asked for', minutes: 8,
    summary: 'Unused codes still exist in the flip-flops. Power-up or noise can put a machine in one, and the equations decide where it goes next. A circuit corrects itself if every unused code finds its way back; otherwise it can lock out.',
    blocks: [
      'Five states need three flip-flops, which have eight codes. In the design the three spare codes were don\'t cares: the minimiser was free to treat them as 0 or 1, whichever made the equations shorter. But the finished gates do something definite with every code. What?',
      { topic: 'unused-states', input: { m: 'mod5', ff: 'T', asg: 'gray', unused: 'dc' }, frame: 6, caption: 'A mod-5 counter with T flip-flops and Gray codes: from 111 it goes to 100, and from 100 back to 111. Those codes chase each other forever.' },
      { def: 'Lockout', text: 'a set of unused codes the machine can stay in forever, never reaching a used state. A circuit with no lockout is self-correcting.' },
      { predict: { q: 'The fix is to make the unused codes go to the start state. What does that cost?', options: ['Nothing', 'Some of the don\'t cares become fixed values, so the logic may grow', 'An extra flip-flop'], answer: 1, explain: 'Every don\'t care turned into a definite entry is freedom taken away from the minimiser.' } },
      { topic: 'unused-states', input: { m: 'mod5', ff: 'T', asg: 'gray', unused: 'start' }, frame: 7, caption: 'Redesigned: every unused code returns to C0 at the next clock.' },
      { steps: ['After the design, take each unused code.', 'Put it into the equations (for each input value) and find the next code.', 'Follow the arrows: if every path reaches a used state, the circuit corrects itself.', 'If some unused codes lead only to each other, send them to the start state and redesign, or add a reset.'] },
      { tip: 'A reset input that clears every flip-flop is the usual answer in practice, but a machine that might be disturbed while running should still never lock out.' },
      { h: 'Recap' },
      { list: ['Don\'t cares in the design become definite behaviour in the gates.', 'Check every unused code after designing.', 'A lockout is fixed by giving the unused codes a definite next state.'] },
      X('fsm-ex-unused'), X('fsm-ex-lockout'),
    ],
  });

  // =========================================================================================================
  // Chapter 4: machines at work
  // =========================================================================================================
  L({
    id: 'fsm-l-detectors', chapter: 'fsm-uses', title: 'Sequence detectors', minutes: 10,
    summary: 'A detector for a k-bit pattern needs k states (Mealy) or k + 1 (Moore): state Si means "the input ends with the first i bits of the pattern". The only care is in the arrows that fall back.',
    blocks: [
      'Detecting a fixed pattern in a bit stream is the classic first design. It is also useful: framing marks in serial links and start codes in remote controls are found this way.',
      'State **Si** means the last i bits read are the first i bits of the pattern. Reading the next bit either extends the match (go to Si+1) or breaks it. When it breaks, do not go back to S0 by reflex: find the longest tail of what has been read that is still a start of the pattern.',
      { topic: 'sequence-detector', input: { pattern: '1011', type: 'mealy', overlap: 'yes', seq: '1011011010' }, frame: 4, caption: 'From S3 ("seen 101") a 0 breaks the match, but 1010 ends in 10, which is S2, not S0.' },
      { predict: { q: 'Detecting 1011 with overlap, the machine has just output Z = 1. Which state is it in?', options: ['S0', 'S1', 'S3'], answer: 1, explain: 'The input ends in 1011; its longest tail that starts the pattern is the final 1. So S1.' } },
      { h: 'Overlapping or not' },
      'With overlap, the end of one match may be the start of the next: 1011011 holds two matches of 1011. Without overlap, the search starts from scratch after each match, and the same input holds only one.',
      { topic: 'sequence-detector', input: { pattern: '1011', type: 'mealy', overlap: 'no', seq: '1011011010' }, frame: 15, caption: 'The same input without overlap: one detection.' },
      { h: 'As a circuit' },
      'The lock from the exercises, built with D flip-flops: Z = Q1 opens after two 1s in a row. Change the input in the workbench and watch where Z rises.',
      { waveform: { circuit: LOCK_D, inputs: { X: '110111011' }, clocked: true, outputs: ['Z'] }, caption: 'Z rises one clock after the second 1 (a Moore output) and falls one clock after a 0.' },
      { h: 'Recap' },
      { list: ['Si = "the input ends with the first i bits of the pattern".', 'On a break, fall back to the longest useful tail.', 'Mealy: k states; Moore: k + 1, the last one outputs 1.'] },
      X('fsm-ex-det-moore'), X('fsm-ex-det-circuit'), X('fsm-ex-lock-jk'), X('fsm-ex-det-verilog'), X('fsm-ex-sat-verilog'),
    ],
  });

  L({
    id: 'fsm-l-serial', chapter: 'fsm-uses', title: 'A serial adder and a coin controller', minutes: 9,
    summary: 'A two-state machine adds numbers of any length one bit per clock; a three-state machine with two inputs runs a coin slot. Both show how little state a job may need, and both are a few lines of Verilog.',
    blocks: [
      'How much state does it take to add two 32-bit numbers? If the bits arrive one pair per clock, least significant first, just one bit: the carry. The machine has two states, C0 and C1, and its output is the sum bit. One full adder and one flip-flop do the whole job, at one bit per clock.',
      { topic: 'serial-adder', input: { a: 13, b: 9, n: 4 }, frame: 9, caption: 'After four clocks S has delivered 0110 and the machine is left in C1: a carry out of the top bit. 13 + 9 = 22 needs a fifth bit, which a fifth clock would deliver.' },
      { predict: { q: 'The serial adder is in C1 and reads A = 0, B = 1. What are S and the next state?', options: ['S = 0, C1', 'S = 1, C0', 'S = 0, C0'], answer: 0, explain: '0 + 1 + 1 = 10 in binary: sum bit 0, carry 1, so it stays in C1.' } },
      { h: 'Two inputs at once' },
      'A coin controller sells at 15 cents and takes 5- and 10-cent coins, at most one per clock. Its state is the money held so far: 0, 5 or 10. With two inputs N and D there are four columns, and one of them (both coins at once) cannot happen: those entries are don\'t cares, which the design is free to use.',
      { topic: 'vending-fsm', input: { coins: '10 10 - 5 10' }, frame: 4, caption: 'Two 10-cent coins make 20: vend, and give 5 back.' },
      { h: 'In Verilog' },
      'A clocked machine in Verilog is a register for the state, updated in an always block on the rising edge, and the outputs computed from it. This one raises z for one clock after x rises; run it and read the console.',
      { verilog: EDGE_V, run: true, caption: 'A Moore machine with two flip-flops, last and pulse. The testbench prints x and z after each edge.' },
      { h: 'Recap' },
      { list: ['A serial adder\'s state is the carry: two states for any word length.', 'Impossible input combinations are don\'t cares.', 'In Verilog: a state register updated on posedge clk, and outputs from the state (and, for Mealy, the inputs).'] },
      X('fsm-ex-serial-verilog'), X('fsm-ex-serial-wave'), X('fsm-ex-lock-fmax'), X('fsm-ex-vend-count'),
    ],
  });

  // ---- a guided tour -------------------------------------------------------------------------------------------
  C.tour({
    id: 'fsm-tour', title: 'Tour: state machines', blurb: 'From one clock of a machine to a finished circuit, in eight steps.',
    steps: [
      { route: 'part=machines', target: '#main', text: 'Part 6: clocked state machines. Each card is a family of topics that run one step at a time, with the actual states, codes and equations in the narration.' },
      { route: 'topic=fsm-run', target: '#stageWrap', text: 'One clock at a time: the lit row and column of the state table give the next state and the output, and the diagram follows the same arrow.' },
      { target: '#btnPlay', text: 'Play runs the clocks; the arrow keys step one frame at a time, forwards or back.' },
      { route: 'topic=mealy-moore', target: '#stageWrap', text: 'A Mealy and a Moore detector on one waveform: the Mealy output answers inside the clock, the Moore one at the next edge.' },
      { route: 'topic=implication-table', target: '#inputs', text: 'Choose a machine here and watch the implication table cross out pairs, round by round, until only equivalent states are left.' },
      { route: 'topic=design-flow', target: '#stageWrap', text: 'The whole design flow: diagram, table, reduction, codes, excitation, K-maps, equations, gates, and a simulation that checks them.' },
      { route: 'fsm', target: '#fsmView', text: 'The state-machine workbench: draw or type your own machine, run it, and take it through every design step.' },
      { route: 'learn', target: '[data-chapter="fsm-basics"]', text: 'The lessons of Part 6 start here. Their exercises check each stage of a design: tables, classes, codes, excitation entries, equations and circuits.' },
    ],
  });

  // ---- a course -----------------------------------------------------------------------------------------------
  C.course({
    id: 'fsm-course', title: 'State machines, start to finish', blurb: 'Every topic of Part 6 in order, from one clock of a machine to detectors and adders, with lessons and exercises along the way.',
    steps: [
      { topic: 'fsm-run', note: 'The lit state is all the machine knows.' },
      { lesson: 'fsm-l-state', note: 'States, tables and diagrams.' },
      { topic: 'fsm-analysis', note: 'Follow the wires back from each flip-flop input.' },
      { exercise: 'fsm-ex-analyse-d', note: 'A circuit read back into its table.' },
      { topic: 'mealy-moore', note: 'Watch when each output rises.' },
      { topic: 'mealy-moore-convert', note: 'A state entered with two outputs splits.' },
      { topic: 'implication-table', note: 'Cross out, round after round.' },
      { topic: 'partition-refinement', note: 'The same classes, by splitting blocks.' },
      { topic: 'fsm-equivalence', note: 'Two machines, explored as pairs of states.' },
      { exercise: 'fsm-ex-reduce', note: 'Your turn: six states, how many needed?' },
      { topic: 'state-assignment', note: 'Same machine, four sets of codes, four costs.' },
      { topic: 'excitation-tables', note: 'Which inputs cause each change.' },
      { topic: 'design-flow', note: 'Nine steps from a sentence to a circuit.' },
      { lesson: 'fsm-l-flow', note: 'The steps, and where mistakes hide.' },
      { exercise: 'fsm-ex-flow-d', note: 'A design taken stage by stage, each stage checked.' },
      { topic: 'unused-states', note: 'Where do the spare codes go?' },
      { topic: 'sequence-detector', note: 'Fall back to the longest useful tail.' },
      { exercise: 'fsm-ex-det-circuit', note: 'Build one; it is compared clock by clock with the machine.' },
      { topic: 'serial-adder', note: 'Two states add numbers of any length.' },
      { topic: 'vending-fsm', note: 'Two inputs, and a combination that never happens.' },
      { exercise: 'fsm-ex-det-verilog', note: 'The same kind of machine in Verilog.' },
    ],
  });

  // ---- what the diagram checker looks at on these pages -------------------------------------------------------
  if (S.Checks) {
    const ready = (sel) => "document.querySelector('" + sel + "')";
    for (const l of C.lessons.values()) if (/^fsm-l-/.test(l.id)) S.Checks.push({ group: 'learn', name: 'fsm lesson ' + l.id, hash: 'lesson=' + l.id, ready: ready('#lessonView'), sel: '#main' });
    S.Checks.push({ group: 'courses', name: 'fsm course', hash: 'course=fsm-course', ready: ready('#courseView'), sel: '#main' });
  }
})(globalThis.Sirkit = globalThis.Sirkit || {});
