// Part 5 lessons: storage. Three chapters in teaching order: latches (two gates in a loop, the forbidden input,
// switch debouncing, gated and D latches), flip-flops (why edges, master–slave and six-NAND designs, JK and T,
// characteristic equations, preset and clear, one type from another), and timing (setup, hold and clock-to-Q,
// the minimum period and skew, metastability and the synchroniser, reading a clocked circuit). Three bench labs
// use the 7400, 7474 and 7476. The exercises are in 51-storage-ex.js; a tour and a course close this file.
(function (S) {
  'use strict';
  const C = S.Content;
  if (!C || C.chapters.some((c) => c.id === 'p5-ch-latches')) return;

  // ---- chapters ---------------------------------------------------------------------------------------------
  C.chapter({ id: 'p5-ch-latches', part: 'storage', n: 1, title: 'Latches', blurb: 'Two gates feeding each other hold a bit. Set and reset, the input pair to avoid, a latch that cleans up a bouncing switch, and the gated and D latches.' });
  C.chapter({ id: 'p5-ch-flipflops', part: 'storage', n: 2, title: 'Flip-flops', blurb: 'Storage that changes only at a clock edge: why it is needed, how it is built, the D, JK and T types, their characteristic equations, and preset and clear.' });
  C.chapter({ id: 'p5-ch-timing', part: 'storage', n: 3, title: 'Timing', blurb: 'Setup, hold and clock-to-Q; how fast a clock can go; skew; metastability and the two-flip-flop synchroniser; reading a clocked circuit.' });

  const L = (x) => C.lesson(x);
  // circuits shared with the exercises (51-storage-ex.js)
  const P = (S.P5 = S.P5 || {});
  P.nor = 'q = NOR(R, qb)\nqb = NOR(S, q)\nQ = q\nQB = qb';
  P.nand = 'q = NAND(Sn, qb)\nqb = NAND(Rn, q)\nQ = q\nQB = qb';
  P.dlatch = 'n1 = NAND(D, D)\ns = NAND(D, EN)\nr = NAND(n1, EN)\nq = NAND(s, qb)\nqb = NAND(r, q)\nQ = q';
  P.analysis = 'a = DFF(da)\nb = DFF(db)\nnb = NOT(b)\nnx = NOT(X)\nt1 = AND(a, nb)\nda = OR(t1, X)\ndb = AND(a, nx)\nY = AND(a, b)';

  // =========================================================================================================
  // Chapter 1: latches
  // =========================================================================================================
  L({
    id: 'p5l-nor-latch', chapter: 'p5-ch-latches', title: 'Two gates that remember', minutes: 8,
    summary: 'Every circuit so far forgets: its output depends only on its inputs right now. Feed two NOR gates into each other and the pair holds a bit after the input that set it has gone.',
    blocks: [
      'Press a doorbell and it rings; let go and it stops. Press the button on a lift and the light stays on after your finger leaves. The doorbell is combinational: its output is a function of its input now. The lift button **remembers**. Nothing built from gates in a straight line, inputs on the left and outputs on the right, can do that. Something has to feed back.',
      'Take two NOR gates and wire each one\'s output to an input of the other. The free inputs are called S (set) and R (reset); the outputs are Q and its complement Q′.',
      { circuit: P.nor, outputs: ['Q', 'QB'], inputs: { S: 1 }, caption: 'An SR latch from two NOR gates (QB is Q′). Click S to 0: Q stays 1. Now pulse R up and down: Q drops to 0 and stays there.' },
      { h: 'Why it holds' },
      'With S = R = 0, each NOR gate has a 0 on its free input, so it simply inverts the other gate\'s output. Two inverters in a ring are happy in exactly two ways: Q = 1, Q′ = 0, or Q = 0, Q′ = 1. Whichever one the loop is in, it stays in. That is one bit of storage.',
      'Raising S forces Q′ to 0 (a NOR with a 1 input gives 0), and then the other gate sees R = 0 and Q′ = 0 and makes Q = 1. Lowering S again changes nothing: the loop now holds Q = 1 by itself. R does the same on the other side.',
      { topic: 'sr-nor', frame: 3, caption: 'S has just risen. g2 answered first (Q′ fell at 29 ns), and only then could g1 answer (Q rose at 38 ns). Step on to see the loop settle and hold.' },
      { predict: { q: 'Each NOR gate takes 9 ns. How long after S rises is the latch settled with Q = 1 and Q′ = 0?', options: ['9 ns', '18 ns', '27 ns'], answer: 1, explain: 'Two gates must answer one after the other: Q′ falls 9 ns after S, and Q rises 9 ns after that. The topic says it: settled 18 ns after the inputs moved.' } },
      { def: 'SR latch', text: 'a pair of cross-coupled gates with a set and a reset input. With NOR gates the inputs are active high: S = 1 sets Q to 1, R = 1 resets it to 0, and S = R = 0 holds.' },
      { h: 'The latch over time' },
      'A waveform shows the memory best. Each slot below sets S and R and lets the latch settle; read Q in the slots where both inputs are 0.',
      { waveform: { circuit: P.nor, inputs: { S: '1000000100', R: '0001100000' }, outputs: ['Q', 'QB'] }, caption: 'S pulses in slot 1, R in slots 4 and 5, S again in slot 8. Between the pulses Q keeps the last thing it was told.' },
      { table: [['S', 'R', 'Q next', 'meaning'], ['0', '0', 'Q', 'hold'], ['0', '1', '0', 'reset'], ['1', '0', '1', 'set'], ['1', '1', '0 (and Q′ = 0)', 'avoid']], caption: 'The NOR latch, row by row. The last row is the subject of the next lesson.' },
      { h: 'What to take away' },
      { list: ['Feedback gives memory: two cross-coupled NOR gates have two stable states.', 'S = 1 sets Q, R = 1 resets it, S = R = 0 holds.', 'The loop needs two gate delays to settle after an input changes.'] },
      { exercise: 'p5x-nor-wave' }, { exercise: 'p5x-nor-table' }, { exercise: 'p5x-settle' },
    ],
  });

  L({
    id: 'p5l-forbidden', chapter: 'p5-ch-latches', title: 'The input to avoid, and the NAND latch', minutes: 9,
    summary: 'S = R = 1 asks the latch to set and reset at once. Holding it is harmless; letting go of both together is a race nobody wins. The NAND latch has the same flaw with its inputs turned upside down.',
    blocks: [
      'What should a latch do when told to set and reset at the same time? The NOR latch does something definite while both inputs are 1: each gate has a 1 on its input, so Q = Q′ = 0. That breaks the promise that Q′ is the complement of Q, but it is steady. The trouble starts when both inputs fall.',
      { topic: 'sr-race', frame: 4, caption: 'Both inputs fell together at 80 ns. Each gate now sees two 0s and rises; then each sees the other\'s 1 and falls. With perfectly matched gates this goes on and on.' },
      { predict: { q: 'Make g1 a little slower than g2 (try the preset "g1 a little slower"). Where does the latch end up?', options: ['It still oscillates for ever', 'It settles, and which way depends on which gate is faster', 'It always settles to Q = 0'], answer: 1, explain: 'The faster gate wins the race: its output rises first and holds the other gate down. Real gates are never matched exactly, so a real latch settles, but to a value set by tiny differences nobody controls.' } },
      { warn: 'S = R = 1 followed by both inputs returning to 0 together leaves Q unknown. Design so that it cannot happen, or so that one input always returns first.' },
      { h: 'The NAND latch' },
      'Build the loop from NAND gates instead and everything turns upside down. A NAND with a 0 input gives 1, so the inputs are **active low**: S′ = 0 sets, R′ = 0 resets, and S′ = R′ = 1 holds. The pair to avoid is now S′ = R′ = 0, which drives both outputs to 1.',
      { circuit: P.nand, outputs: ['Q', 'QB'], inputs: { Sn: 1, Rn: 0 }, caption: 'A NAND latch: Sn is S′ and Rn is R′. It starts reset. Click Rn to 1 (hold), then Sn to 0 and back to 1 (a set pulse).' },
      { topic: 'sr-nand', frame: 4, caption: 'S′ fell to 0, g1 raised Q, then g2 dropped Q′. The order is the mirror of the NOR latch: in a NAND latch the gate fed by the active input answers first.' },
      { table: [['S′', 'R′', 'Q next'], ['1', '1', 'Q (hold)'], ['1', '0', '0'], ['0', '1', '1'], ['0', '0', '1 (and Q′ = 1): avoid']], caption: 'The NAND latch. Read it as the NOR table with every input inverted.' },
      { tip: 'A small circle on an input of a latch symbol means active low. A NAND latch is drawn as an SR latch with circles on both inputs, and its inputs are named S′ and R′ (or S̄ and R̄).' },
      { h: 'What to take away' },
      { list: ['Both inputs active together is steady but breaks Q′ = (Q)′; both released together is a race.', 'The NAND latch has active-low inputs: S′ = 0 sets, R′ = 0 resets, both 1 holds.', 'Which gate answers first follows from which input moved.'] },
      { exercise: 'p5x-forbidden' }, { exercise: 'p5x-nand-wave' }, { exercise: 'p5x-nand-build' },
    ],
  });

  L({
    id: 'p5l-debounce', chapter: 'p5-ch-latches', title: 'A latch that cleans up a switch', minutes: 7,
    summary: 'A mechanical switch does not close once: its contact bounces for a few milliseconds. A NAND latch on a changeover switch turns all that chatter into one clean edge.',
    blocks: [
      'Wire a push button to the clock of a counter, press it once, and the counter may jump by three or four. The button is not broken. When metal contacts meet they bounce apart and together again several times before they rest, and every bounce is an edge as far as fast logic is concerned.',
      'A changeover switch has a common lever and two contacts, A and B. The lever rests on one of them and, when thrown, leaves it, travels, and lands on the other, where it bounces. The trick is that a bouncing contact only ever touches the contact it is landing on: it never goes back to the one it left.',
      'Pull both contacts up to 1 through resistors and wire them to S′ and R′ of a NAND latch, with the lever grounded. Resting on B, R′ = 0 and the latch is reset. Throw the lever:',
      { steps: ['The lever leaves B: R′ rises to 1. Both inputs are 1, so the latch holds Q = 0.', 'The lever touches A for the first time: S′ = 0, and Q rises to 1.', 'The lever bounces off A: S′ = 1 again, both inputs 1, the latch holds Q = 1.', 'Every further bounce is another S′ = 0 that sets a latch that is already set. Q does not move.'] },
      { waveform: { circuit: P.nand, inputs: { Sn: '11110101011', Rn: '00111111111' }, outputs: ['Q', 'QB'] }, caption: 'Sn (S′) bounces four times on landing. Q rises at the first touch, in slot 5, and ignores the rest.' },
      { predict: { q: 'The lever is now thrown back from A to B, and R′ bounces as it lands. When does Q fall?', options: ['At the first touch of B', 'At the last bounce of B', 'Once for every bounce'], answer: 0, explain: 'The first touch makes R′ = 0, which resets the latch; every later bounce asks for a reset the latch has already done.' } },
      { tip: 'This only works with a changeover switch, two contacts and a lever. A simple push button with one contact needs a different cure: a delay (an RC filter with a Schmitt trigger) or sampling it slowly with a clock.' },
      'The bench pushbuttons in this app are clean, but you can play the bouncing contact yourself in the lab below: flick the switch for S′ down and up a few times quickly and watch the LED stay put.',
      { lab: 'p5lab-latch' },
      { h: 'What to take away' },
      { list: ['A bouncing contact makes several edges where you wanted one.', 'A NAND latch on a changeover switch sets at the first touch and ignores the rest, because a bounce never reaches the other contact.', 'Debouncing is a job a latch does well precisely because it holds.'] },
      { exercise: 'p5x-debounce-wave' }, { exercise: 'p5x-debounce-why' }, { exercise: 'p5x-lab-latch' },
    ],
  });

  L({
    id: 'p5l-gated', chapter: 'p5-ch-latches', title: 'Gated latches and the D latch', minutes: 9,
    summary: 'Put two gates in front of an SR latch and it listens only while an enable input is 1. Feed S and R from one input D and its complement, and the forbidden pair can no longer occur.',
    blocks: [
      'In a bigger circuit, S and R come from logic that is still working out its answer: they flicker for a while before they settle. We want the latch to ignore them until they are ready. The fix is an **enable**: two steering gates that pass S and R to the latch only while EN = 1.',
      { topic: 'gated-sr', frame: 3, caption: 'Step 2 tried to set the latch with EN = 0 and was ignored. Now EN = 1, the steering gate g3 lets S through, and Q becomes 1.' },
      'With NAND steering gates in front of a NAND latch, g3 makes S′ = (S·EN)′ and g4 makes R′ = (R·EN)′. While EN = 0 both are 1, the hold input. While EN = 1 the latch behaves as an SR latch with active-high inputs.',
      { h: 'One input instead of two' },
      'Most of the time we want to store a value, not issue set and reset commands. Feed S from a data input D and R from D′: now S and R are always opposite, so the forbidden pair cannot happen, and while EN = 1 the latch simply copies D.',
      { circuit: P.dlatch, outputs: ['Q'], inputs: { D: 1, EN: 1 }, caption: 'A D latch from five NAND gates (n1 is the inverter). With EN = 1, flip D: Q follows. Set EN to 0 and flip D: Q holds.' },
      { def: 'D latch', text: 'a latch with a data input D and an enable EN. While EN = 1 it is transparent: Q = D. While EN = 0 it holds the value D had when EN fell.' },
      { waveform: { circuit: 'q = LATCH(D, EN)\nQ = q', inputs: { D: '0110110010', EN: '0011100110' }, outputs: ['Q'] }, caption: 'A D latch over ten slots. During each enable window Q copies D, including D\'s changes; outside the windows it holds.' },
      { predict: { q: 'While EN = 1, D changes three times. How many times can Q change?', options: ['Once, at the end of the window', 'Three times, following D', 'Not at all'], answer: 1, explain: 'A latch is transparent for the whole time it is enabled: every change of D passes straight through. That is exactly why a latch is awkward as a register, as the next chapter shows.' } },
      { h: 'What to take away' },
      { list: ['A gated latch listens only while EN = 1.', 'A D latch drives S and R from D and D′, so S = R = 1 cannot occur.', 'Enabled, a D latch is transparent; disabled, it holds.'] },
      { exercise: 'p5x-dlatch-wave' }, { exercise: 'p5x-dlatch-build' }, { exercise: 'p5x-dlatch-verilog' },
    ],
  });

  // =========================================================================================================
  // Chapter 2: flip-flops
  // =========================================================================================================
  L({
    id: 'p5l-why-edge', chapter: 'p5-ch-flipflops', title: 'Why a latch is not enough', minutes: 7,
    summary: 'Connect a latch\'s output back to its own input through some logic and, while the latch is open, the new value races round and round. Storage that changes only at one instant, a clock edge, breaks the loop.',
    blocks: [
      'Suppose you want a bit that flips on every clock: wire Q′ back to D and enable the latch with the clock. While the clock is 1 the latch is transparent, so the new Q′ arrives at D and passes through again, and again, as fast as the loop allows. When the clock falls, the bit holds whatever the race left.',
      { topic: 'why-edge', frame: 2, caption: 'The same feedback, two kinds of storage. During one clock pulse the latch output changed six times; the flip-flop changed once.' },
      { predict: { q: 'Make the clock pulse shorter (try "A short high pulse"). What happens to the number of latch changes per pulse?', options: ['It stays at 6', 'It drops: the loop has less time to run round', 'It rises'], answer: 1, explain: 'The latch changes once per trip round its loop for as long as it is open. A shorter pulse means fewer trips. The flip-flop changes once per edge whatever the pulse width.' } },
      'The latch\'s behaviour depends on the pulse width and on the gate delays, which nobody wants to design around. What we need is storage that samples D at one instant and ignores it the rest of the time.',
      { def: 'Edge-triggered flip-flop', text: 'a storage element that takes the value of D only at an active clock edge (usually the rising edge, 0 to 1) and holds it until the next one, whatever D does in between.' },
      'With flip-flops, every clocked circuit can be read as a sequence of snapshots: at each edge, every flip-flop takes its next value from the logic in front of it, the logic then has a whole clock period to work out the following values, and at the next edge the cycle repeats. That simple picture is what makes large digital systems possible.',
      { waveform: { circuit: "q = DFF(d)\nd = XOR(q, EN)\nQ = q", inputs: { EN: '11111111' }, clocked: true, outputs: ['Q'] }, caption: 'A D flip-flop whose next value is its own complement (D = Q ⊕ EN with EN held at 1): exactly one change per clock, a clean divide-by-two.' },
      { h: 'What to take away' },
      { list: ['A transparent latch inside a feedback loop races for as long as it is open.', 'A flip-flop samples only at the clock edge, so feedback through it is safe.', 'Clocked design: change at the edge, compute during the period.'] },
      { exercise: 'p5x-edge-choice' },
    ],
  });

  L({
    id: 'p5l-master-slave', chapter: 'p5-ch-flipflops', title: 'Building an edge: master–slave and six NANDs', minutes: 9,
    summary: 'Two latches in a row, open on opposite halves of the clock, are never transparent together, so D cannot run straight to Q. Or six NAND gates can do the job in one piece.',
    blocks: [
      'How do you make storage that reacts to an instant? Take two D latches. The first, the **master**, is enabled while the clock is 0; the second, the **slave**, while the clock is 1. While the clock is low the master follows D and the slave holds. When the clock rises, the master closes on the value D had at that moment, and the slave opens and copies it to Q.',
      { topic: 'master-slave', frame: 2, caption: 'The clock rose at 50 ns: the master closed holding 1 and the slave passed it to Q 12 ns later. D wiggled while the clock was high, but the master was shut.' },
      { predict: { q: 'Which latch is open while the clock is 1?', options: ['The master', 'The slave', 'Both, for a moment'], answer: 1, explain: 'The slave is enabled by CLK, the master by CLK′. They are never open together, so the only value that reaches Q is the one the master caught as the clock rose.' } },
      { h: 'Six NAND gates' },
      'A master–slave pair costs two latches. A tighter design uses three small NAND latches: two of them steer S′ and R′ of the output latch, and only one of S′ and R′ can fall at a rising edge. Once one has fallen it also blocks D, so later changes of D are locked out until the clock goes low again.',
      { topic: 'six-gate', frame: 3, caption: 'At the edge with D = 1, S′ fell (59 ns) and set the output latch: Q = 1 at 68 ns. The low S′ also holds g1, so D can no longer reach the output.' },
      { tip: 'The two designs behave the same from outside: Q takes D at the rising edge. Inside a chip you will usually find something like the six-gate form, or a master–slave pair built from transmission gates.' },
      { h: 'What to take away' },
      { list: ['Master–slave: two latches enabled on opposite clock levels; Q changes just after the rising edge.', 'Six-NAND: at the edge one of S′ and R′ falls and locks out D.', 'From outside, both are a positive-edge-triggered D flip-flop.'] },
      { exercise: 'p5x-ms-choice' },
    ],
  });

  L({
    id: 'p5l-jk-t', chapter: 'p5-ch-flipflops', title: 'JK and T flip-flops', minutes: 10,
    summary: 'A D flip-flop stores what it is given. A JK flip-flop takes commands (hold, reset, set, toggle) and a T flip-flop just toggles or holds. Each is summed up by a characteristic table and an equation.',
    blocks: [
      'The SR latch had four input pairs and one of them was forbidden. The JK flip-flop puts that fourth pair to work: J acts as set, K as reset, and J = K = 1 makes the flip-flop **toggle**, change to the opposite of what it holds. Everything happens at the clock edge.',
      { topic: 'jk-ff', frame: 8, caption: 'Edge 4 with J = K = 1: Q was 0 and toggles to 1. The equation underneath is Q(t+1) = JQ′ + K′Q with the values put in.' },
      { table: [['J', 'K', 'Q(t+1)', ''], ['0', '0', 'Q(t)', 'hold'], ['0', '1', '0', 'reset'], ['1', '0', '1', 'set'], ['1', '1', 'Q′(t)', 'toggle']], caption: 'The characteristic table of the JK flip-flop.' },
      'Write the table as a function of J, K and the present Q and minimise it: Q(t+1) = 1 when J = 1 and Q = 0 (set or toggle from 0), or when K = 0 and Q = 1 (hold or set from 1). That is the **characteristic equation**:',
      { math: 'JK:   Q(t+1) = J·Q′ + K′·Q\nD:    Q(t+1) = D\nT:    Q(t+1) = T ⊕ Q = T·Q′ + T′·Q\nSR:   Q(t+1) = S + R′·Q      (S·R = 0)' },
      { kmap: { vars: ['J', 'K', 'Q'], minterms: [1, 4, 5, 6], groups: 'minimal' }, caption: 'Q(t+1) of a JK flip-flop on a K-map over J, K and Q: two groups, JQ′ and K′Q.' },
      { h: 'The T flip-flop' },
      'Tie J and K together and call the input T. T = 0 holds and T = 1 toggles. A T flip-flop with T = 1 divides the clock frequency by two, and a chain of them counts, as Part 7 shows.',
      { topic: 't-ff', frame: 2, caption: 'T = 1 at the first edge: Q toggles from 0 to 1, Q(t+1) = T ⊕ Q = 1 ⊕ 0.' },
      { waveform: { circuit: 'q = JKFF(J, K)\nQ = q', inputs: { J: '1011011', K: '0101110' }, clocked: true, outputs: ['Q'] }, caption: 'A JK flip-flop over seven clocks. Each slot shows Q before its edge, so the effect of a slot\'s J and K appears in the next slot.' },
      { predict: { q: 'Q = 1 and J = K = 1 at the edge. What is Q after it?', options: ['0', '1', 'Unknown, as in the SR latch'], answer: 0, explain: 'J = K = 1 is the toggle row: Q(t+1) = Q′ = 0. Unlike the SR latch there is no forbidden input.' } },
      { h: 'What to take away' },
      { list: ['JK: 00 hold, 01 reset, 10 set, 11 toggle; Q(t+1) = JQ′ + K′Q.', 'T: 0 hold, 1 toggle; Q(t+1) = T ⊕ Q.', 'A characteristic equation gives the next state from the inputs and the present state.'] },
      { exercise: 'p5x-jk-table' }, { exercise: 'p5x-jk-wave' }, { exercise: 'p5x-t-wave' }, { exercise: 'p5x-jk-eq' }, { exercise: 'p5x-sr-eq' },
    ],
  });

  L({
    id: 'p5l-async', chapter: 'p5-ch-flipflops', title: 'Preset and clear', minutes: 8,
    summary: 'A flip-flop powers up holding whatever it likes. Asynchronous preset and clear inputs force it to 1 or 0 at once, without waiting for the clock, so a circuit can start from a known state.',
    blocks: [
      'Switch on a circuit full of flip-flops and each one settles to 0 or 1 by chance. A counter could start anywhere; a controller could start in a state it was never meant to be in. Every real design needs a way to put its flip-flops into a known state, and it must work before the clock has done anything sensible.',
      '**Asynchronous** inputs do that. On the 7474 they are active low and called PRE′ (preset) and CLR′ (clear): PRE′ = 0 forces Q = 1 and CLR′ = 0 forces Q = 0, at once, whatever the clock and D are doing. While either is held low, clock edges are ignored.',
      { topic: 'async-pc', frame: 3, caption: 'At 80 ns CLR′ went low between clock edges, and Q went to 0 straight away. A clocked input would have waited for the next edge.' },
      { predict: { q: 'On a 7474, PRE′ and CLR′ are both held at 0. What do Q and Q′ show?', options: ['Q = 1, Q′ = 0', 'Q = 0, Q′ = 1', 'Q = 1 and Q′ = 1'], answer: 2, explain: 'Inside, both outputs are forced high, the same as the forbidden input of a NAND latch. When both are released together the state is unknown, so never release them together.' } },
      { table: [['PRE′', 'CLR′', 'CLK', 'D', 'Q'], ['0', '1', 'any', 'any', '1'], ['1', '0', 'any', 'any', '0'], ['0', '0', 'any', 'any', '1 (Q′ = 1 too)'], ['1', '1', '↑', '0', '0'], ['1', '1', '↑', '1', '1'], ['1', '1', 'no edge', 'any', 'Q (hold)']], caption: 'The function table of one flip-flop of a 7474.' },
      'The usual arrangement is a **power-on reset**: CLR′ of every flip-flop wired to a signal that is low for a moment after power comes up and high ever after. In the waveform below CLR′ is low in slot 4: Q is 0 in that slot already, without waiting for an edge.',
      { waveform: { circuit: 'q = DFF[reset, asyncLow](D, rst=CLRn)\nQ = q', inputs: { D: '11011011', CLRn: '11101101' }, clocked: true, outputs: ['Q'] }, caption: 'A D flip-flop with an active-low clear (CLRn is CLR′). Slots 4 and 7 clear it on the spot; the edge at the end of each of those slots is ignored.' },
      { lab: 'p5lab-7474' },
      { h: 'What to take away' },
      { list: ['Preset and clear act at once, without the clock, and override it while held.', 'On 74-series parts they are active low: PRE′ and CLR′.', 'Both active together makes Q = Q′ = 1; release them one at a time.'] },
      { exercise: 'p5x-async-wave' }, { exercise: 'p5x-dff-verilog' }, { exercise: 'p5x-lab-7474' },
    ],
  });

  L({
    id: 'p5l-convert', chapter: 'p5-ch-flipflops', title: 'One flip-flop from another', minutes: 8,
    summary: 'An FPGA or a cell library offers D flip-flops; a design may want JK or T behaviour. Put the characteristic equation in front of D and the D flip-flop becomes any other type.',
    blocks: [
      'A D flip-flop stores whatever arrives at D at the edge. So if logic in front of D computes the next state that a JK flip-flop would have, the pair behaves as a JK flip-flop. The logic is the characteristic equation itself: D = JQ′ + K′Q.',
      { topic: 'ff-from-d', frame: 2, caption: 'J = 1, K = 0 and Q = 0 make D = 1, and at the edge Q takes it. The new Q goes back round to the gates, ready for the next edge.' },
      { circuit: "q = DFF(d)\nd = XOR(T, q)\nQ = q", outputs: ['Q'], caption: 'A T flip-flop from a D flip-flop and one XOR gate: D = T ⊕ Q.' },
      { predict: { q: 'To make a D flip-flop out of a JK flip-flop, what goes on J and K?', options: ['J = D, K = D', 'J = D, K = D′', 'J = D′, K = D'], answer: 1, explain: 'With J = D and K = D′ the JK flip-flop sees 10 (set) when D = 1 and 01 (reset) when D = 0: Q(t+1) = D.' } },
      'The same idea works in any direction: write the characteristic equation of the flip-flop you want, then find what the flip-flop you have needs on its inputs to produce it. Part 6 does this in a table, the **excitation table**, when it designs whole state machines.',
      { lab: 'p5lab-7476' },
      { h: 'What to take away' },
      { list: ['Any flip-flop type is a D flip-flop with its characteristic equation in front.', 'T from D: D = T ⊕ Q. JK from D: D = JQ′ + K′Q.', 'D from JK: J = D, K = D′.'] },
      { exercise: 'p5x-t-from-d' }, { exercise: 'p5x-jk-from-d' }, { exercise: 'p5x-d-from-jk' }, { exercise: 'p5x-lab-7476' },
    ],
  });

  // =========================================================================================================
  // Chapter 3: timing
  // =========================================================================================================
  L({
    id: 'p5l-setup-hold', chapter: 'p5-ch-timing', title: 'Setup, hold and clock-to-Q', minutes: 9,
    summary: 'A flip-flop samples D at the edge, but "at the edge" is a small window, not an instant. D must be steady a setup time before and a hold time after; Q answers a clock-to-Q delay later.',
    blocks: [
      'Real flip-flops are made of gates, and gates take time. If D changes just as the clock rises, the inner latch catches it half-way: neither 0 nor 1. To be sure of a clean result, D has to be steady for a little while either side of the edge.',
      { def: 'Setup time (tsu)', text: 'how long D must be steady before the active clock edge.' },
      { def: 'Hold time (th)', text: 'how long D must stay steady after the edge.' },
      { def: 'Clock-to-Q (tcq)', text: 'how long after the edge the new value appears at Q.' },
      { table: [['', 'tsu', 'th', 'tcq'], ['CMOS preset', '12 ns', '3 ns', '14 ns'], ['TTL preset', '20 ns', '5 ns', '20 ns (slower edge)'], ['LS-TTL preset', '20 ns', '5 ns', '20 ns (slower edge)']], caption: 'The flip-flop timing of the technology presets used in this app.' },
      { topic: 'setup-hold', input: { off: -5 }, frame: 3, caption: 'D rose 5 ns before the edge at 150 ns, inside the 12 ns setup window. The simulator flags a setup violation.' },
      { predict: { q: 'Step on. What does Q do after this edge?', options: ['Takes the new value 1, 14 ns after the edge', 'Shows X for a while, then falls one way or the other', 'Keeps the old value for sure'], answer: 1, explain: 'A violation can leave the inner latch balanced between 0 and 1 (metastable). The simulator shows X until it resolves, and which way it falls is not under anyone\'s control.' } },
      'The same thing with D rising 30 ns before the edge (try the preset "In good time") gives a clean 1, 14 ns after the edge. Moving D to 1 ns after the edge breaks the hold time instead.',
      { tip: 'Setup and hold together form a window around each active edge, here from 12 ns before to 3 ns after. Keep every change of D out of it.' },
      { h: 'What to take away' },
      { list: ['D must be steady from tsu before the edge to th after it.', 'Q changes tcq after the edge.', 'Break the window and Q may go metastable: X, then an unpredictable value.'] },
      { exercise: 'p5x-meta-choice' },
    ],
  });

  L({
    id: 'p5l-min-period', chapter: 'p5-ch-timing', title: 'How fast can the clock go?', minutes: 10,
    summary: 'Between two flip-flops a change has to leave the first (clock-to-Q), run through the logic, and arrive a setup time before the next edge. That sum is the shortest clock period. Clock skew moves the goalposts.',
    blocks: [
      'Picture one clock edge. Every flip-flop launches its new value tcq later. The values run through the logic between the flip-flops, the slowest path last. All of them must reach the next flip-flops tsu before the next edge. So:',
      { math: 'T  ≥  tcq + t(slowest logic path) + tsu\nf(max) = 1 / T(min)' },
      { topic: 'min-period', frame: 8, caption: 'Six CMOS inverters between two flip-flops: the change reaches D2 at 14 + 6 × 8 = 62 ns, so the period must be at least 62 + 12 = 74 ns, 13.514 MHz.' },
      { predict: { q: 'The same path with the clock period set to 66 ns (preset "Too fast"). What goes wrong?', options: ['Nothing: 66 ns is more than 62 ns', 'D2 changes inside the setup window, so r2 may go metastable', 'The first flip-flop stops toggling'], answer: 1, explain: 'The change arrives at 62 ns, only 4 ns before the edge at 66 ns, and the setup time is 12 ns.' } },
      'For a whole circuit the work is the same, done for every path that starts at a flip-flop (or an input) and ends at a flip-flop. This is **static timing analysis**: it never simulates values, it just adds up delays along every path and keeps the worst. The timing exercises here are checked by exactly that analysis, with the delays of the chosen technology.',
      { schematic: { circuit: () => S.Check.circuitOf("q0 = DFF(d0)\nd0 = NOT(q0)\nd1 = XOR(q1, q0)\nq1 = DFF(d1)\nc = AND(q0, q1)\nd2 = XOR(q2, c)\nq2 = DFF(d2)\nQ0 = q0\nQ1 = q1\nQ2 = q2") }, caption: 'A 3-bit counter from D flip-flops. Its slowest path: q0, the AND, the XOR into D2.' },
      'For this counter in CMOS: tcq 14 ns, AND 10 ns, XOR 12 ns, setup 12 ns. The critical path q0 → AND → XOR → D2 arrives at 36 ns, and the minimum period is 48 ns: just under 20.8 MHz.',
      { h: 'Clock skew' },
      'The formula assumes the clock reaches every flip-flop at the same moment. When it reaches the receiving flip-flop late by a skew s, the data gets s more time (good for setup), but the receiving flip-flop is also still looking when the new data from this very edge arrives (bad for hold):',
      { math: 'setup:  T ≥ tcq + t(slowest path) + tsu − s\nhold:   tcq + t(fastest path) ≥ th + s' },
      { topic: 'clock-skew', frame: 1, caption: 'Two buffers delay r2\'s clock by 20 ns. The single inverter makes the fastest path 14 + 8 = 22 ns, but it must not arrive before 20 + 3 = 23 ns. Hold is broken.' },
      { warn: 'A hold violation does not go away with a slower clock: the data from one edge overtakes the late clock of the same edge whatever the period. The cures are less skew or more delay in the short path.' },
      { h: 'What to take away' },
      { list: ['T(min) = tcq + slowest path + tsu; f(max) = 1/T(min).', 'Static timing analysis adds delays along every flip-flop-to-flip-flop path.', 'Skew helps setup and hurts hold by the same amount.'] },
      { exercise: 'p5x-tmin-inv' }, { exercise: 'p5x-crit-pipe' }, { exercise: 'p5x-arrival' }, { exercise: 'p5x-fmax-cnt3' }, { exercise: 'p5x-fmax-ttl' }, { exercise: 'p5x-slack' }, { exercise: 'p5x-chain-par' }, { exercise: 'p5x-skew-setup' }, { exercise: 'p5x-skew-hold' },
    ],
  });

  L({
    id: 'p5l-metastable', chapter: 'p5-ch-timing', title: 'Metastability and the synchroniser', minutes: 8,
    summary: 'A signal from outside the clock\'s world, a button or another chip\'s output, will sooner or later change inside the setup window. The flip-flop that catches it may hang between 0 and 1. A second flip-flop gives it time to decide.',
    blocks: [
      'Inside a synchronous circuit you can keep every change of D out of the setup and hold window by design. An **asynchronous** input, one that is not timed by your clock, cannot be controlled like that: if it changes at random moments, it will now and then change right at an edge.',
      { topic: 'metastability', frame: 1, caption: 'D changes 4 ns before each edge, inside the 12 ns setup window. Q goes to X and resolves to 0 this time; at other edges it resolves to 1, with no pattern.' },
      'A metastable flip-flop is like a ball balanced on a hilltop: it will roll off, but how soon is a matter of chance. Usually it settles within a few nanoseconds; the longer you wait, the less likely it is still undecided. Logic that reads it while it is undecided may see 0 in one gate and 1 in another.',
      { h: 'The two-flip-flop synchroniser' },
      'So give it time. Sample the asynchronous input with one flip-flop, and let only a second flip-flop, one clock later, pass it on. The first may go metastable, but it has a whole clock period to settle before the second looks.',
      { topic: 'synchroniser', frame: 1, caption: 'A changed 3 ns before the edge: Q1 went metastable and settled. Q2 had sampled Q1 before Q1 moved, so Q2 never saw the X.' },
      { predict: { q: 'What does the synchroniser cost?', options: ['Nothing at all', 'A clock or two of delay before the rest of the circuit sees a change', 'It can lose a change that lasts many clocks'], answer: 1, explain: 'Q2 carries A one or two clocks late, but always clean. A change that lasts several clocks always gets through.' } },
      { circuit: 'q1 = DFF(A)\nq2 = DFF(q1)\nY = q2', outputs: ['Y'], caption: 'The synchroniser on its own: two flip-flops in a row on the same clock, nothing between them.' },
      { h: 'What to take away' },
      { list: ['An input not timed by the clock will sometimes break setup or hold.', 'A metastable flip-flop resolves eventually, at a random time, to a random value.', 'Two flip-flops in series give the first a clock period to settle.'] },
      { exercise: 'p5x-sync-build' },
    ],
  });

  L({
    id: 'p5l-analysis', chapter: 'p5-ch-timing', title: 'Reading a clocked circuit', minutes: 9,
    summary: 'Given a circuit of flip-flops and gates, write the equation in front of each flip-flop, turn it into a state table, and you can predict every clock of its life without simulating a single gate.',
    blocks: [
      'Part 6 is about designing state machines. Before that, it helps to read one. The method follows from the clocked picture: at each edge, every flip-flop takes the value its input logic computes from the present state and inputs.',
      { steps: ['Write the input equation of each flip-flop from the logic in front of it (here DA and DB).', 'Turn it into a next-state equation: for D flip-flops Q(t+1) = D; for JK or T use their characteristic equations.', 'Fill a state table: for each present state and input, the next state and the output.', 'Draw it as a state diagram, or just run it.'] },
      { schematic: { circuit: () => S.Check.circuitOf(P.analysis) }, caption: 'Two D flip-flops A and B, input X, output Y = AB.' },
      { topic: 'clocked-analysis', frame: 5, caption: 'The equations: A(t+1) = AB′ + X, B(t+1) = AX′, and the output Y = AB depends on the state alone.' },
      { topic: 'clocked-analysis', frame: 9, caption: 'The state table, row by row from the equations. From 11 with X = 0 the next state is 01.' },
      { predict: { q: 'From state 10 with X = 0, what is the next state AB?', options: ['00', '10', '11'], answer: 2, explain: 'A(t+1) = AB′ + X = 1·1 + 0 = 1 and B(t+1) = AX′ = 1·1 = 1.' } },
      { waveform: { circuit: P.analysis, inputs: { X: '1101001' }, clocked: true, outputs: ['Y'] }, caption: 'The same circuit run on X = 1, 1, 0, 1, 0, 0, 1, starting at 00. Y is 1 in exactly the slots where the state is 11.' },
      { h: 'What to take away' },
      { list: ['Input equations, then next-state equations, then the state table.', 'For a D flip-flop the next state is just D.', 'The table predicts the circuit for any input sequence.'] },
      { exercise: 'p5x-analysis-table' }, { exercise: 'p5x-analysis-wave' },
    ],
  });

  // =========================================================================================================
  // Labs
  // =========================================================================================================
  // pin p of an n-pin chip with pin 1 at column col: the hole k places away from the chip on that pin's strip
  // (bottom strip for pins 1..n/2, holes j, i, h, g; top strip for the rest, holes a, b, c, d)
  const pin = (col, n, p, k) => (p <= n / 2 ? (col + p - 1) + 'jihg'[k || 0] : (col + n - p) + 'abcd'[k || 0]);
  S.P5.pin = pin;

  // ---- lab 1: an SR latch from a 7400, and debouncing -------------------------------------------------------
  const N = (p, k) => pin(10, 14, p, k);
  const LATCH_BOARD = {
    chips: [{ id: 'U1', num: '7400', col: 10 }], clockHz: 1,
    jumpers: [
      [N(14), 'Rtp10', 'red'], [N(7), 'Rbn16', 'black'],
      ['sw0', N(1), 'yellow'], ['sw1', N(4), 'yellow'],
      [N(3, 2), N(5, 2), 'green'], [N(6, 1), N(2, 1), 'green'],
      [N(3), 'led0', 'blue'], [N(6), 'led1', 'blue'],
      [N(13, 1), 'Rtn11', 'black'], [N(12, 1), N(13, 2), 'black'], [N(10, 1), 'Rtn14', 'black'], [N(9, 1), N(10, 2), 'black'],
    ],
  };
  C.lab({
    id: 'p5lab-latch', chapter: 'p5-ch-latches', title: 'An SR latch from NAND gates, and a debouncer',
    aim: 'Build an SR latch from two gates of a 7400, check its set, reset, hold and both-active rows on two LEDs, then play a bouncing contact on its input and see the latch ignore it.',
    parts: ['7400'],
    steps: [
      'Place the 7400 with pin 1 at column 10. Wire VCC (pin 14) to the +5 V rail and GND (pin 7) to ground.',
      'Gate 1 makes Q: pin 1 (1A) from switch S0, which plays S′; pin 2 (1B) from Q′. Gate 2 makes Q′: pin 4 (2A) from switch S1, which plays R′; pin 5 (2B) from Q.',
      'Cross the outputs: pin 3 (1Y, Q) to pin 5, and pin 6 (2Y, Q′) to pin 2. Take Q to LED 0 and Q′ to LED 1.',
      'Tie the inputs of the two unused gates (pins 9, 10, 12, 13) to ground, as unused inputs always should be.',
      'Set S0 = 0, S1 = 1 (set), then raise S0 (hold: the row → 1 1). Then lower S1 (reset), and raise it again (hold). Then lower both. Write down LED 0 and LED 1 each time.',
      'Debounce: from the set state (S0 = 1, S1 = 1, LED 0 on), flick S0 down and up four or five times quickly, as a bouncing contact would. LED 0 never goes out.',
      'Before pressing Check, put both switches back to 0: the check works from the start and sets them itself.',
    ],
    observe: { corner: 'S′ R′', rows: ['0 1', '→ 1 1', '1 0', '→ 1 1 ', '0 0', 'bounce, 1'], cols: ['Q (LED 0)', 'Q′ (LED 1)'], cells: {} },
    checks: [
      { kind: 'power' },
      { kind: 'value', set: { S0: 0, S1: 1 }, expect: { led0: 1, led1: 0 } },
      { kind: 'value', set: { S1: 1, S0: 1 }, expect: { led0: 1, led1: 0 } },
      { kind: 'value', set: { S0: 1, S1: 0 }, expect: { led0: 0, led1: 1 } },
      { kind: 'value', set: { S0: 1, S1: 1 }, expect: { led0: 0, led1: 1 } },
      { kind: 'value', set: { S0: 0, S1: 0 }, expect: { led0: 1, led1: 1 } },
    ],
    reference: LATCH_BOARD, start: { chips: LATCH_BOARD.chips, jumpers: [], clockHz: 1 },
  });
  // the observed values, row by row
  const fill = (lab, vals) => { const o = C.labs.get(lab).observe; o.rows.forEach((r, i) => o.cols.forEach((c, j) => { o.cells[r + '|' + c] = vals[i][j]; })); };
  fill('p5lab-latch', [['1', '0'], ['1', '0'], ['0', '1'], ['0', '1'], ['1', '1'], ['1', '0']]);

  // ---- lab 2: the 7474 D flip-flop ---------------------------------------------------------------------------
  const D = (p, k) => pin(10, 14, p, k);
  const DFF_BOARD = {
    chips: [{ id: 'U1', num: '7474', col: 10 }], clockHz: 1,
    jumpers: [
      [D(14), 'Rtp10', 'red'], [D(7), 'Rbn16', 'black'],
      ['sw0', D(2), 'yellow'], ['clk', D(3), 'white'], ['sw2', D(1), 'orange'], ['sw3', D(4), 'orange'],
      [D(5), 'led0', 'blue'], [D(5, 1), 'ch0', 'blue'], [D(6), 'led1', 'blue'],
      // the second flip-flop divides the clock by two: 2D from 2Q′, sharing the clock, PRE′ and CLR′
      [D(12, 1), D(8, 1), 'green'], [D(11, 2), D(3, 2), 'white'], [D(13, 2), D(1, 2), 'orange'], [D(10, 2), D(4, 2), 'orange'], [D(9), 'ch1', 'blue'],
    ],
  };
  C.lab({
    id: 'p5lab-7474', chapter: 'p5-ch-flipflops', title: 'The 7474 D flip-flop',
    aim: 'Wire one flip-flop of a 7474 to switches, the clock and LEDs; observe its characteristic table and its preset and clear on the LEDs and the logic analyser; and turn the second flip-flop into a divide-by-two.',
    parts: ['7474'],
    steps: [
      'Place the 7474 with pin 1 at column 10. VCC (pin 14) to +5 V, GND (pin 7) to ground.',
      'Flip-flop 1: D (pin 2) from S0, CLK (pin 3) from the clock, CLR′ (pin 1) from S2, PRE′ (pin 4) from S3. Q (pin 5) to LED 0 and analyser channel 0; Q′ (pin 6) to LED 1.',
      'Flip-flop 2: 2D (pin 12) from its own 2Q′ (pin 8), 2CLK (pin 11) to the same clock, 2CLR′ (pin 13) with S2, 2PRE′ (pin 10) with S3, and 2Q (pin 9) to channel 1.',
      'With the clock at 1 Hz: lower S3 alone (preset), then S2 alone (clear), then both. Note LED 0 and LED 1.',
      'Raise S2 and S3. Set D (S0) to 0 or 1 and watch Q take it only at a rising clock edge, starting from Q = 0 and from Q = 1: this is the characteristic table.',
      'On the analyser, channel 1 changes once for every two clock edges: half the clock frequency.',
      'Before pressing Check, put every switch back to 0: the check releases clear and preset itself.',
    ],
    observe: { corner: 'what happens', rows: ['PRE′ = 0', 'CLR′ = 0', 'both 0', '↑ D=0 Q=0', '↑ D=0 Q=1', '↑ D=1 Q=0', '↑ D=1 Q=1'], cols: ['Q', 'Q′'], cells: {} },
    checks: [
      { kind: 'power' },
      { kind: 'value', set: { S2: 1 }, expect: { led0: 1, led1: 0 } },
      { kind: 'value', set: { S3: 1 }, expect: { led0: 0, led1: 1 } },
      { kind: 'value', set: { S0: 0 }, expect: { led0: 1, led1: 1 } },
      { kind: 'count', set: { S3: 1, S2: 1, S0: 1 }, outputs: ['ch0'], sequence: [1] },
      { kind: 'count', set: { S3: 1, S2: 1, S0: 0 }, outputs: ['ch0'], sequence: [0] },
      { kind: 'count', set: { S3: 1, S2: 1 }, outputs: ['ch1'], sequence: [0, 1] },
    ],
    reference: DFF_BOARD, start: { chips: DFF_BOARD.chips, jumpers: [], clockHz: 1 },
  });
  fill('p5lab-7474', [['1', '0'], ['0', '1'], ['1', '1'], ['0', '1'], ['0', '1'], ['1', '0'], ['1', '0']]);

  // ---- lab 3: the 7476 JK flip-flop --------------------------------------------------------------------------
  const J = (p, k) => pin(10, 16, p, k);
  const JK_BOARD = {
    chips: [{ id: 'U1', num: '7476', col: 10 }], clockHz: 1,
    jumpers: [
      [J(5), 'Rbp14', 'red'], [J(13), 'Rtn13', 'black'],
      ['clk', J(1), 'white'], ['sw3', J(2), 'orange'], ['sw2', J(3), 'orange'], ['sw0', J(4), 'yellow'], ['sw1', J(16), 'yellow'],
      [J(15), 'led0', 'blue'], [J(15, 1), 'ch0', 'blue'], [J(14), 'led1', 'blue'],
      // the second flip-flop, J = K = 1, clocked by 1Q: a second stage that toggles each time 1Q falls
      [J(6, 1), J(15, 2), 'green'], [J(9), 'Rtp17', 'red'], [J(12), 'Rtp14', 'red'], [J(7, 2), J(2, 2), 'orange'], [J(8, 2), J(3, 2), 'orange'], [J(11), 'ch1', 'blue'],
    ],
  };
  C.lab({
    id: 'p5lab-7476', chapter: 'p5-ch-flipflops', title: 'The 7476 JK flip-flop',
    aim: 'Observe all four rows of the JK characteristic table on a 7476 (a falling-edge part), then use J = K = 1 to toggle and clock the second flip-flop from the first: a two-bit ripple counter on the analyser.',
    parts: ['7476'],
    steps: [
      'Place the 7476 with pin 1 at column 10. Its supply pins are unusual: VCC is pin 5 and GND is pin 13.',
      'Flip-flop 1: CLK (pin 1) from the clock, PRE′ (pin 2) from S3, CLR′ (pin 3) from S2, J (pin 4) from S0, K (pin 16) from S1. Q (pin 15) to LED 0 and channel 0, Q′ (pin 14) to LED 1.',
      'Flip-flop 2: J (pin 9) and K (pin 12) to +5 V, CLK (pin 6) from 1Q, PRE′ (pin 7) with S3, CLR′ (pin 8) with S2, and 2Q (pin 11) to channel 1.',
      'Raise S2 and S3. Try each J, K pair (S0, S1) for a few clock edges, starting once from Q = 0 and once from Q = 1 (use S2 or S3 to get there). The 7476 acts on the falling edge of the clock.',
      'With J = K = 1, channel 0 toggles at every falling clock edge and channel 1 at every fall of channel 0: together they count 0, 1, 2, 3.',
      'Before pressing Check, put every switch back to 0.',
    ],
    observe: { corner: 'J K', rows: ['0 0', '0 1', '1 0', '1 1'], cols: ['Q next, from 0', 'Q next, from 1'], cells: {} },
    checks: [
      { kind: 'power' },
      { kind: 'count', set: { S2: 1, S3: 1, S0: 0, S1: 0 }, outputs: ['ch0'], sequence: [1] },
      { kind: 'count', set: { S3: 1, S2: 1, S0: 0, S1: 1 }, outputs: ['ch0'], sequence: [0] },
      { kind: 'count', set: { S2: 1, S3: 1, S0: 1, S1: 0 }, outputs: ['ch0'], sequence: [1] },
      { kind: 'count', set: { S3: 1, S2: 1, S0: 1, S1: 1 }, outputs: ['ch0', 'ch1'], sequence: [0, 1, 2, 3] },
    ],
    reference: JK_BOARD, start: { chips: JK_BOARD.chips, jumpers: [], clockHz: 1 },
  });
  fill('p5lab-7476', [['0', '1'], ['0', '0'], ['1', '1'], ['1', '0']]);

  // =========================================================================================================
  // A tour and a course
  // =========================================================================================================
  C.tour({
    id: 'p5-tour', title: 'Tour: storage', blurb: 'Where the latches, flip-flops and timing topics are, and how the lessons, waveforms and bench fit together.',
    steps: [
      { route: 'part=storage', text: 'Part 5 is about storage: latches, flip-flops, and the timing rules that keep them honest. Each card is a family of topics that run step by step.' },
      { route: 'topic=sr-nor', target: '#stageWrap', text: 'A NOR latch, settling one gate delay at a time. The waveform under the circuit grows as the run goes on, and every change is explained below it.' },
      { target: '#inputs', text: 'Type your own sequence of S and R pairs here, or pick a preset: "Both 1, then reset" shows what the forbidden input does.' },
      { target: '#btnPlay', text: 'Play steps through the run; the timeline goes back to any moment. Some steps stop to ask you to predict what happens next.' },
      { route: 'topic=setup-hold', target: '#stageWrap', text: 'The timing family puts real delays on the flip-flops. Here D changes inside the setup window and Q goes metastable: X, then a value nobody chose.' },
      { route: 'topic=min-period', target: '#inputs', text: 'Change the number of gates between two flip-flops and the clock period, and watch the setup check pass or fail at each edge.' },
      { route: 'lab=p5lab-7474', target: '#labExp', text: 'The bench: a 7474 on a breadboard with switches, a clock, LEDs and a logic analyser. The experiment lists its steps and checks your wiring and observations.' },
      { route: 'learn', target: '[data-chapter="p5-ch-latches"]', text: 'The lessons of Part 5 start here. Each ends with exercises: waveforms to complete, circuits to build, and timing to work out, all checked by simulation or timing analysis.' },
    ],
  });

  C.course({
    id: 'p5-course', title: 'Storage, from a latch to a clock period',
    blurb: 'Every topic of Part 5 in order, with the lessons that explain them and a few exercises to check yourself on the way.',
    steps: [
      { topic: 'sr-nor', note: 'Two NOR gates in a loop: watch the latch set, hold and reset.' },
      { lesson: 'p5l-nor-latch' },
      { topic: 'sr-race', note: 'Both inputs released together: a race.' },
      { topic: 'sr-nand', note: 'The same loop from NAND gates, with active-low inputs.' },
      { exercise: 'p5x-nand-wave', note: 'Complete the Q and Q′ waveforms of a NAND latch.' },
      { lesson: 'p5l-debounce' },
      { topic: 'gated-sr', note: 'Steering gates make the latch listen only while enabled.' },
      { topic: 'd-latch', note: 'One data input, and a latch that is transparent while enabled.' },
      { exercise: 'p5x-dlatch-build', note: 'Build a D latch from NAND gates.' },
      { topic: 'why-edge', note: 'A latch in a feedback loop races; a flip-flop does not.' },
      { topic: 'master-slave', note: 'Two latches make an edge.' },
      { topic: 'six-gate', note: 'Six NAND gates make one too.' },
      { topic: 'jk-ff', note: 'Hold, reset, set and toggle.' },
      { topic: 't-ff', note: 'Toggle or hold.' },
      { lesson: 'p5l-jk-t' },
      { exercise: 'p5x-jk-wave', note: 'Complete the Q waveform of a JK flip-flop.' },
      { topic: 'ff-from-d', note: 'A JK flip-flop from a D flip-flop and its characteristic equation.' },
      { topic: 'async-pc', note: 'Preset and clear act without the clock.' },
      { topic: 'setup-hold', note: 'The window around the edge.' },
      { topic: 'metastability', note: 'What breaking the window does.' },
      { topic: 'synchroniser', note: 'The cure for inputs from outside the clock.' },
      { topic: 'min-period', note: 'The shortest clock period, path by path.' },
      { topic: 'clock-skew', note: 'A late clock helps setup and hurts hold.' },
      { lesson: 'p5l-min-period' },
      { exercise: 'p5x-fmax-cnt3', note: 'The maximum clock frequency of a counter, by timing analysis.' },
      { topic: 'clocked-analysis', note: 'Reading a clocked circuit into a state table.' },
      { exercise: 'p5x-analysis-table', note: 'Your turn: the state table of that circuit.' },
    ],
  });

  // ---- what the diagram checker looks at -------------------------------------------------------------------
  if (S.Checks) {
    const ready = (sel) => "document.querySelector('" + sel + "')";
    for (const l of C.lessons.values()) if (/^p5l-/.test(l.id)) S.Checks.push({ group: 'learn', name: 'p5 lesson ' + l.id, hash: 'lesson=' + l.id, ready: ready('#lessonView'), sel: '#main' });
    for (const id of ['p5lab-latch', 'p5lab-7474', 'p5lab-7476']) S.Checks.push({ group: 'learn', name: 'p5 lab ' + id, hash: 'lab=' + id, ready: ready('#labExp'), sel: '#main' });
    S.Checks.push({ group: 'courses', name: 'p5 course', hash: 'course=p5-course', ready: ready('#courseView'), sel: '#main' });
  }
})(globalThis.Sirkit = globalThis.Sirkit || {});
