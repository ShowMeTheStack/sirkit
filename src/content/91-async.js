// Part 10, asynchronous circuits: lessons, exercises, a tour and a course. Three chapters: reading a circuit with
// feedback (loops, transition and flow tables, fundamental mode, races, the SR latch), designing one from a word
// description (primitive flow table, merging, race-free assignment, excitation), and hazards (static, dynamic and
// essential). Every model, table and circuit here is our own; the answers come from Sirkit.Async and Sirkit.Bool.
(function (S) {
  'use strict';
  const C = S.Content;
  if (!C || C.lessons.has('p10l-loops')) return;
  const K = () => S.Check, Bo = () => S.Bool;

  C.chapter({ id: 'p10-ch-analysis', part: 'async', n: 1, title: 'Reading a circuit with feedback', blurb: 'Loops cut into secondary variables, the transition and flow tables, one input change at a time, and the races that make some tables dangerous.' });
  C.chapter({ id: 'p10-ch-design', part: 'async', n: 2, title: 'Designing from a flow table', blurb: 'A word description becomes a primitive flow table; rows merge; codes are chosen so no move is a race; the excitations become gates.' });
  C.chapter({ id: 'p10-ch-hazards', part: 'async', n: 3, title: 'Hazards', blurb: 'Glitches from unequal paths: static and dynamic hazards in the logic, the consensus terms that cure them, and the essential hazard that only delay can cure.' });

  const L = (x) => C.lesson(x);
  const ex = (o) => C.exercise(o);

  // ---- our models ------------------------------------------------------------------------------------------
  const M1 = "Y = x1x2' + x1y; z = y";                                    // set by x1 alone, held while x1 = 1
  const MQ = "Y1 = x1x2 + x1y1; Y2 = x1x2 + x2y2; z = y1y2'";            // which input let go first
  const MR = "Y1 = x1x2 + x1y1 + x2'y2; Y2 = x1'x2 + x2y2 + x1y1'; z = y1y2"; // a critical race at (11, 00)
  const model = (spec) => S.Async.fromEquations(spec);
  const specQ = { inputs: ['x1', 'x2'], vars: ['y1', 'y2'], Y: { y1: 'x1x2 + x1y1', y2: 'x1x2 + x2y2' }, outputs: { z: "y1y2'" } };
  const NOR_LATCH = 'Q = NOR(R, Qn)\nQn = NOR(S, Q)';
  const NAND_LATCH = 'Q = NAND(Sn, Qn)\nQn = NAND(Rn, Q)';
  // the falling catch: Z goes to 1 when x2 falls while x1 is 1, and back to 0 when x1 falls
  const FALL = {
    name: 'falling catch', inputs: ['x1', 'x2'], outputs: ['Z'],
    rows: {
      a: { '00': 'a', '01': 'b', '11': '-', '10': 'c' },
      b: { '00': 'a', '01': 'b', '11': 'd', '10': '-' },
      c: { '00': 'a', '01': '-', '11': 'd', '10': 'c' },
      d: { '00': '-', '01': 'b', '11': 'd', '10': 'e' },
      e: { '00': 'a', '01': '-', '11': 'd', '10': 'e' },
    },
    out: { a: '0', b: '0', c: '0', d: '0', e: '1' },
  };
  const FALL_CIRCUIT = 't1 = AND(y1, x1)\nt2 = AND(y1, x2)\nt3 = AND(x1, x2)\ny1 = OR(t1, t2, t3)\nnx = NOT(x2)\nZ = AND(y1, nx)';
  const GRAY2 = ['00', '01', '11', '10'];
  /** a flow table as a lesson table block: rows, columns in Gray order, stable entries in brackets, the output */
  const flowBlock = (t, caption) => ({ table: [['row'].concat(GRAY2.map((c) => t.inputs.join('') + ' = ' + c), [t.outputs.join('')])].concat(Object.keys(t.rows).map((r) => [r].concat(GRAY2.map((c) => (t.rows[r][c] === r ? '(' + r + ')' : t.rows[r][c])), [t.out[r]]))), caption });

  // ---- a check the exercise kinds do not have: a race-free assignment ---------------------------------------------
  /** accept(text) for an assignment like "a = 00, b = 01": every move named in pairs must change one bit */
  function raceFree(rows, pairs, bits) {
    return (text) => {
      const got = {};
      for (const part of String(text).split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean)) {
        const m = /^([a-z])\s*=\s*([01]+)$/i.exec(part);
        if (!m) return 'Write each row with its code, like a = 00, separated by commas ("' + part + '" cannot be read).';
        got[m[1].toLowerCase()] = m[2];
      }
      const miss = rows.filter((r) => !(r in got));
      if (miss.length) return 'Give every row a code: ' + miss.join(', ') + (miss.length === 1 ? ' has' : ' have') + ' none.';
      if (rows.some((r) => got[r].length !== bits)) return 'Use ' + bits + ' secondary variables: every code has ' + bits + ' bits.';
      const seen = {};
      for (const r of rows) { if (seen[got[r]]) return 'Rows ' + seen[got[r]] + ' and ' + r + ' share the code ' + got[r] + ': every row needs its own.'; seen[got[r]] = r; }
      for (const [p, q] of pairs) {
        let d = 0; for (let i = 0; i < bits; i++) if (got[p][i] !== got[q][i]) d++;
        if (d !== 1) return 'The move between ' + p + ' (' + got[p] + ') and ' + q + ' (' + got[q] + ') changes ' + d + ' bits at once: a race. Rows that follow each other must be neighbours on the square of codes.';
      }
      return { ok: true, why: 'Every move between rows changes one secondary variable, so none of them is a race.' };
    };
  }

  // =========================================================================================================
  // Chapter 1: reading a circuit with feedback
  // =========================================================================================================
  L({
    id: 'p10l-loops', chapter: 'p10-ch-analysis', title: 'Memory without a clock', minutes: 7,
    summary: 'A circuit whose gate outputs come back to earlier gates remembers. Cut each loop once, call the wire a secondary variable y, and the logic in front of it the excitation Y.',
    blocks: [
      'Every memory element so far has waited for a clock edge. Take the clock away and wire two NOR gates so that each one\'s output feeds the other\'s input. Set S to 1 for a moment and let it go: Q stays 1. Nothing tells the circuit when to look; it reacts whenever an input changes, as fast as its gates allow. That is an **asynchronous** circuit, and the loop is its memory.',
      { circuit: NOR_LATCH, outputs: ['Q', 'Qn'], inputs: { R: 1 }, caption: 'Two NOR gates in a loop. R is 1, so Q = 0. Set R back to 0: Q holds. Pulse S and Q holds 1 after S returns to 0.' },
      'To analyse such a circuit, picture each loop as a wire with a small delay in it. Cut the wire. On one side is the value the loop carries now, the **secondary variable** y. On the other is the value the logic is driving it to, the **excitation** Y. While Y differs from y, the loop is about to change; when they agree, it rests.',
      { def: 'Secondary variable', text: 'the value carried by a feedback loop, once the loop is cut at one wire. Its excitation Y is the value the logic in front of the cut computes from the inputs x and the present y.' },
      { topic: 'async-loops', input: { circ: 'celem' }, frame: 1, caption: 'An AND-OR circuit with one loop. Step on to see the cut and the excitation read back from it: Y = x1x2 + x1y + x2y.' },
      { predict: { q: 'A circuit has two loops that share no gate. How many secondary variables does it need?', options: ['1', '2', '4'], answer: 1, explain: 'Each loop must be cut once, and each cut wire becomes one secondary variable. Two loops, two cuts.' } },
      'A **total state** is the inputs together with the secondary variables, written (x, y). A total state is **stable** when Y = y for every loop. Most of the time an asynchronous circuit sits in a stable total state; an input change makes it unstable, the loops move, and it settles again.',
      { tip: 'Choose the cuts so that each loop is broken exactly once. Cutting at a wire that drives an output is convenient: the output is then a secondary variable itself.' },
      { h: 'What to take away' },
      { list: ['Feedback without a clock is memory: an asynchronous circuit.', 'Cut each loop once; the cut wire is a secondary variable y, the logic before it the excitation Y.', 'A total state (x, y) is stable when Y = y.'] },
      { exercise: 'p10x-loops-count' },
      { exercise: 'p10x-nor-wave' },
    ],
  });

  L({
    id: 'p10l-tables', chapter: 'p10-ch-analysis', title: 'Transition and flow tables', minutes: 8,
    summary: 'Work out Y for every total state and you have the transition table. Circle the entries equal to their row: those are the stable states. Name the rows and it becomes a flow table.',
    blocks: [
      'The excitation equations say everything about an asynchronous circuit, but not in a form you can follow with your finger. Lay them out as a table: a row for each value of y, a column for each value of the inputs x, and in each cell the value of Y.',
      'Take the one-loop circuit Y = x1x2′ + x1y with output z = y. Its rows are y = 0 and y = 1; its columns are x1x2 = 00, 01, 11, 10, in Gray order so neighbouring columns differ in one input, the way the inputs are allowed to move.',
      { topic: 'async-tables', input: { eqs: M1 }, frame: 4, caption: 'Row 0, column 10: Y = 1, which is not the row. That total state is unstable. Step on to fill in the rest and circle the stable ones.' },
      { predict: { q: 'In row 1, column 11, Y = x1x2′ + x1y with x1 = 1, x2 = 1, y = 1. Is that total state stable?', options: ['Yes: Y = 1 = y', 'No: Y = 0', 'No: Y = 1 but the row is 0'], answer: 0, explain: 'x1y = 1, so Y = 1, equal to the row. The circle goes there: once set, the circuit holds 1 while x1 stays 1, whatever x2 does.' } },
      { def: 'Transition table', text: 'a table of the excitations Y for every row y and input column x. An entry equal to its row is a stable state and is circled.' },
      'Count the circles column by column. Here every column has at least one, so whatever the inputs are, the circuit can come to rest. A column with no circle at all is a column where the circuit can never rest: it oscillates.',
      'Finally, give the rows names (a for y = 0, b for y = 1) and write each entry as the name of the row it leads to. That is the **flow table**. It says what the circuit does without saying how the rows are coded, which is exactly what a designer writes first.',
      { table: [['row \\ x1x2', '00', '01', '11', '10'], ['a (y = 0)', '(a)', '(a)', '(a)', 'b'], ['b (y = 1)', 'a', 'a', '(b)', '(b)']], caption: 'The flow table of Y = x1x2′ + x1y, stable entries in brackets. z = 0 in row a and 1 in row b.' },
      { h: 'What to take away' },
      { list: ['Transition table: Y for every (y, x), columns in Gray order.', 'A circled entry (Y = y) is a stable total state.', 'A flow table names the rows instead of coding them.'] },
      { exercise: 'p10x-trans-table' },
      { exercise: 'p10x-stable-count' },
      { exercise: 'p10x-flow-table' },
      { exercise: 'p10x-oscillate' },
    ],
  });

  L({
    id: 'p10l-fundamental', chapter: 'p10-ch-analysis', title: 'One change at a time', minutes: 7,
    summary: 'In fundamental mode only one input changes, and only when the circuit is stable. On the flow table that is a move sideways to a new column, then down the column to a circled entry.',
    blocks: [
      'An asynchronous circuit has no clock to say when inputs may change, so the designer makes a promise instead: **fundamental mode**. Only one input changes at a time, and never before the circuit has settled from the last change.',
      'The promise turns the flow table into a map you can walk. Start on a circled entry. An input change moves you sideways to the neighbouring column, in the same row. If the entry there is circled, nothing more happens. If not, it names the row the circuit is going to: move down (or up) the column to that row, and keep going until you land on a circle.',
      { topic: 'async-fundamental', input: { eqs: MQ, seq: '00 10 11 01 11 10 00' }, frame: 2, caption: 'Two loops, Y1 = x1x2 + x1y1 and Y2 = x1x2 + x2y2. The input has just become 11 in row a: the entry says d. Step on and watch it move down the column.' },
      { predict: { q: 'From row d (both inputs 1), x1 falls so the inputs are 01. The circuit settles in row b (01), where z = y1y2′ = 0. If instead x2 had fallen first (inputs 10), which row would it settle in, and what is z?', options: ['row c (10), z = 1', 'row a (00), z = 0', 'row d (11), z = 0'], answer: 0, explain: 'In column 10 Y1 = x1y1 = 1 and Y2 = x2y2 = 0: the circuit goes from 11 to 10, row c, and z = y1y2′ = 1. The circuit remembers which input let go first.' } },
      { warn: 'Two inputs changing together break the promise. The circuit may see them in either order, and the two orders can lead to different rows.' },
      'Read this way, the circuit\'s memory is visible: in column 11 it forgets, and the column it moves to next decides which of two rows it remembers.',
      { h: 'What to take away' },
      { list: ['Fundamental mode: one input at a time, and only when stable.', 'Sideways to the new column, then along the column to a circled entry.', 'The output is read in the stable state the circuit settles in.'] },
      { exercise: 'p10x-follow' },
      { exercise: 'p10x-cycle-path' },
      { exercise: 'p10x-celem-wave' },
      { exercise: 'p10x-mq-wave' },
    ],
  });

  L({
    id: 'p10l-races', chapter: 'p10-ch-analysis', title: 'Races and cycles', minutes: 8,
    summary: 'When two secondary variables must change at once, their loops race. If every order of change ends in the same row the race is harmless; if not, it is critical and the circuit is unreliable.',
    blocks: [
      'Look at a cell where Y differs from y in two bits. Both loops are excited, and both want to change. They never change at exactly the same moment: one loop is a little faster, and the slower one sees the world after the faster one has moved. That is a **race**.',
      'To judge a race, play out every order: y1 first, y2 first, both together. Each change is an edge of the square of codes. If every order ends in the same stable state, the race is **non-critical**. If the orders end in different places, it is **critical**: which state the circuit lands in depends on delays nobody controls.',
      { topic: 'async-races', input: { eqs: MR, x: '11', y: '00' }, frame: 1, caption: 'Row 00, column 11: the excitation is 11, so y1 and y2 both race. Step on to see where each order ends.' },
      { predict: { q: 'From row 00 in column 11, if y1 changes first the circuit reaches 10. Is 10 stable in column 11?', options: ['Yes', 'No, it moves on to 11'], answer: 0, explain: 'In row 10, column 11, Y1 = x1x2 + x1y1 = 1 and Y2 = x1′x2 + x2y2 + x1y1′ = 0: Y = 10, the row itself. The y2-first order ends in 11 instead: two different endings, a critical race.' } },
      { def: 'Cycle', text: 'an unstable state that leads, one variable at a time, through other unstable states before reaching a stable one. A cycle is not a race: only one variable is excited at each step.' },
      'Not every multi-step move is a race. If the transition table sends the circuit through a chain of single changes, 00 to 01 to 11, that is a **cycle**, and it is as reliable as a single change. And if a column has no stable state at all, the circuit never settles: it **oscillates**.',
      { tip: 'A designer avoids critical races by choosing codes: if every row the circuit must move between differs from the next in one bit, no move ever excites two variables.' },
      { h: 'What to take away' },
      { list: ['Race: two or more loops excited at once.', 'Non-critical: every order ends in the same stable state. Critical: the ending depends on delays.', 'Cycle: a chain of single changes. Oscillation: no stable state in the column.'] },
      { exercise: 'p10x-race-kind' },
      { exercise: 'p10x-race-ends' },
      { exercise: 'p10x-noncritical' },
    ],
  });

  L({
    id: 'p10l-latch', chapter: 'p10-ch-analysis', title: 'The SR latch, analysed', minutes: 7,
    summary: 'The simplest asynchronous circuit, read with the new tools. One cut gives a clean table; keeping both gates as variables shows why releasing both inputs together is forbidden.',
    blocks: [
      'The NOR latch has one loop. Cut it at Q and read back through both gates: Q⁺ = (R + (S + Q)′)′, which is Q⁺ = R′(S + Q) = SR′ + R′Q (or S + R′Q, if S = R = 1 never happens). Its transition table has two rows, Q = 0 and Q = 1, and the familiar story falls out: column SR = 00 holds, 10 sets, 01 resets.',
      { topic: 'async-sr', input: { kind: 'nor' }, frame: 3, caption: 'The NOR latch\'s transition table, with one loop cut at Q. Step on to the second analysis, with both gate outputs as variables.' },
      'But the one-cut model hides something. With S = R = 1 both NOR gates output 0, so Q and Q′ are equal. Keep both gate outputs as secondary variables and look at what happens when S and R return to 0 together: both variables are excited at once.',
      { predict: { q: 'With both gates of a NOR latch as variables, both outputs are 0 and S, R fall to 0 together. What kind of transition is that?', options: ['A single change', 'A cycle', 'A critical race'], answer: 2, explain: 'Both gate outputs are excited. If one gets there first, it holds the other at 0, and the latch ends in either 10 or 01; with equal delays it can even oscillate. That is why S = R = 1 is the forbidden input.' } },
      { circuit: NAND_LATCH, outputs: ['Q', 'Qn'], inputs: { Sn: 1, Rn: 0 }, caption: 'The NAND latch, with active-low inputs S′ and R′. R′ = 0 resets it. Set R′ = 1 to hold, then S′ = 0 to set.' },
      { h: 'What to take away' },
      { list: ['NOR latch: Q⁺ = SR′ + R′Q, one secondary variable.', 'With both gates as variables, releasing S = R = 1 together is a critical race.', 'The NAND latch is the same with active-low inputs: S′ = R′ = 0 is its forbidden input.'] },
      { exercise: 'p10x-nand-wave' },
      { exercise: 'p10x-sr-both-wave' },
      { exercise: 'p10x-latch-build' },
    ],
  });

  // =========================================================================================================
  // Chapter 2: design
  // =========================================================================================================
  L({
    id: 'p10l-primitive', chapter: 'p10-ch-design', title: 'From words to a primitive flow table', minutes: 9,
    summary: 'Start with one row for every situation the circuit must tell apart, each stable in one column. Then merge rows that never disagree, using the implication table and the merger diagram.',
    blocks: [
      'Here is a specification: *Z goes to 1 when x2 falls while x1 is 1, and goes back to 0 when x1 falls.* Fundamental mode lets one input change at a time, so walk through the situations the circuit must remember, starting from both inputs at 0.',
      { list: ['a: both inputs 0 (Z = 0).', 'b: x2 alone is 1 (Z = 0).', 'c: x1 alone is 1, nothing caught (Z = 0).', 'd: both are 1 (Z = 0).', 'e: x1 alone, after x2 fell while x1 was 1: caught (Z = 1).'] },
      'Each row is stable in one column only; that is what makes the table **primitive**. From each stable state, one input change leads to a neighbouring column, and the entry there names the row that is stable in that column. The column two changes away gets a dash: fundamental mode never goes there.',
      flowBlock(FALL, 'The primitive flow table of the falling catch. Rows c and e are both stable in column 10, but they remember different histories, and their outputs differ.'),
      { predict: { q: 'Rows a and b are stable in different columns and never give conflicting entries. Can they share one row of the final table?', options: ['Yes: they are compatible', 'No: every stable state needs its own row'], answer: 0, explain: 'Two rows are compatible when, in every column where both have an entry, the entries agree (or lead to rows that are compatible in turn) and the outputs do not clash. a and b pass: merged, the row is stable in both 00 and 01.' } },
      { topic: 'async-merger', input: { ex: 'order' }, frame: 10, caption: 'Another specification (which input rose first), its implication table finished: the pairs left without a cross are compatible. Step on to the merger diagram and the closed cover.' },
      'The **merger diagram** draws every row as a dot and every compatible pair as a line. A group of rows all joined to each other can share one row. Choose the fewest groups that cover every row and stay **closed**: whatever pair of rows a group implies must also lie inside one group.',
      { h: 'What to take away' },
      { list: ['Primitive flow table: one stable state per row; a dash where two inputs would change.', 'Compatible rows agree wherever both have entries, and their outputs do not clash.', 'Merge with a closed cover of maximal compatibles.'] },
      { exercise: 'p10x-primitive-rows' },
      { exercise: 'p10x-compatible' },
      { exercise: 'p10x-maximal' },
    ],
  });

  L({
    id: 'p10l-assign', chapter: 'p10-ch-design', title: 'Race-free codes and the circuit', minutes: 9,
    summary: 'Give rows that follow each other codes one bit apart, borrowing a spare code when three rows must all be neighbours. Then each excitation is a K-map, read as a hazard-free sum of products.',
    blocks: [
      'The falling catch merges into two rows, {a, b, c} and {b, d, e}. Two rows need one secondary variable, and with one variable every move changes exactly one bit: there is nothing to race. Bigger tables need care.',
      'Draw the **transition diagram**: a dot for each row and a line for each move the flow table makes between rows. Every line must fall on an edge of the cube of codes. Four rows in a ring fit the corners of a square. Three rows that all lead to each other do not: a triangle has no place on a square, so one move must pass through the fourth, **spare** code, which relays it on.',
      { topic: 'async-assign', input: { ex: 'order' }, frame: 2, caption: 'Three rows, but only two of the three pairs need to be neighbours: ab = 00, ceg = 01, dfh = 10 puts both lines on edges of the square.' },
      { predict: { q: 'Rows a, b, c must each be adjacent to both others, and you have two variables. What does a race-free assignment need?', options: ['Nothing special: any three codes', 'A spare fourth code that relays one of the moves', 'A third variable for every row'], answer: 1, explain: 'With a = 00, b = 01, c = 10, the move between b and c would change two bits. Route it through 11 instead: 01 → 11 → 10, each step a single change.' } },
      'With the codes chosen, every entry of the flow table becomes a code, and each excitation Y is a function of the secondary variables and the inputs. Unused codes and dashes are don\'t-cares. Cover each one on a K-map, but **not** with a bare minimal cover: inside a loop a momentary glitch is remembered, so every pair of neighbouring 1s must share a term.',
      { kmap: { vars: ['y1', 'x1', 'x2'], minterms: [3, 5, 6, 7], groups: 'minimal' }, caption: 'Y1 of the falling catch: y1x1 + y1x2 + x1x2. Every pair of neighbouring 1s lies inside one group, so this minimal cover is hazard-free already.' },
      { topic: 'async-implement', input: { ex: 'order' }, frame: 4, caption: 'Here the minimal cover of Y1 leaves two neighbouring 1s in different terms, so a bridging term is added. Step on to the circuit running against its flow table.' },
      { h: 'What to take away' },
      { list: ['Rows that follow each other get codes one bit apart.', 'When the transition diagram does not fit the cube, a spare code relays a move.', 'Excitations are covered with no split pair of neighbouring 1s.'] },
      { exercise: 'p10x-assign' },
      { exercise: 'p10x-spare' },
      { exercise: 'p10x-excite-kmap' },
      { exercise: 'p10x-excite-circuit' },
      { exercise: 'p10x-z-simplify' },
      { exercise: 'p10x-fall-wave' },
    ],
  });

  // =========================================================================================================
  // Chapter 3: hazards
  // =========================================================================================================
  L({
    id: 'p10l-static', chapter: 'p10-ch-hazards', title: 'Static hazards and the consensus cure', minutes: 9,
    summary: 'When one input change hands the output from one product term to another, the output can dip for an instant. A term covering both cells, the consensus, holds it steady.',
    blocks: [
      'Take F = A′B + AC and hold B = C = 1. Whether A is 0 or 1, F is 1: with A = 0 the term A′B holds it, with A = 1 the term AC does. Now let A rise. A′B lets go as soon as the inverter’s output falls; AC takes hold when its AND gate has seen A rise. The two paths have different delays, and if A′B lets go first, there is an instant when both terms are 0 and F dips.',
      { def: 'Static-1 hazard', text: 'an output that should stay 1 through an input change but can pulse to 0, because the change moves it between two cells of the map that no single product term covers. A static-0 hazard is the same for a product of sums.' },
      { kmap: { vars: ['A', 'B', 'C'], minterms: [2, 3, 5, 7], groups: ["A'B", 'AC'] }, caption: 'F = A′B + AC. Cells 3 (011) and 7 (111) are neighbours, but they sit in different groups: that gap is the hazard.' },
      { predict: { q: 'Which term, added to F = A′B + AC, covers both cells 011 and 111?', options: ['AB', 'BC', 'A′C'], answer: 1, explain: 'BC is 1 in both cells whatever A does. It is the consensus of A′B and AC, and adding it changes nothing in the truth table, only the timing.' } },
      'Inside an asynchronous circuit a dip is worse than a blemish on a waveform. If the output feeds back into a loop, a momentary 0 can drop a stored 1, and the circuit lands in the wrong row of its flow table.',
      { topic: 'hz-static', frame: 3, caption: 'Y = x1x2 + x2′y inside a loop. x2 falls, one AND gate lets go before the other takes over, and the dip goes round the loop. Try the preset with the consensus term.' },
      'The rule for a hazard-free sum of products is simple to state: **every pair of neighbouring 1s on the map must lie inside some one group.** Start from a minimal cover and add, for each split pair, a prime implicant that covers both.',
      { tip: 'Hazard-free covers cost terms. They are worth it in feedback paths and in signals that must never glitch, such as clocks and asynchronous resets.' },
      { h: 'What to take away' },
      { list: ['A static hazard lives between two neighbouring cells covered by different terms.', 'Adding the consensus term covers both and removes it.', 'In a loop, a glitch can be remembered: excitations must be hazard-free.'] },
      { exercise: 'p10x-spot' },
      { exercise: 'p10x-hz-count' },
      { exercise: 'p10x-hz-kmap' },
      { exercise: 'p10x-hf-three' },
      { exercise: 'p10x-hf-four' },
      { exercise: 'p10x-hf-pos' },
      { exercise: 'p10x-hf-sop4' },
      { exercise: 'p10x-hf-pos4' },
      { exercise: 'p10x-glitch-wave' },
    ],
  });

  L({
    id: 'p10l-dynamic', chapter: 'p10-ch-hazards', title: 'Dynamic and essential hazards', minutes: 8,
    summary: 'An output meant to change once can change three times when one input reaches it by paths of different delay. And some flow tables carry a hazard that no cover can remove.',
    blocks: [
      'Two-level logic has only static hazards. Once a signal reaches the output by three or more paths, as it does in multi-level logic, a new kind appears: an output that should go from 1 to 0 goes 1, 0, 1, 0. That is a **dynamic hazard**, and it comes from a static hazard buried inside the circuit.',
      { circuit: 'nb = NOT(B)\ng1 = NAND(B, C)\ng2 = NAND(nb, A)\ng3 = NAND(g1, g2)\nF = NAND(g3, B)', outputs: ['F'], inputs: { A: 1, C: 1 }, caption: 'Four NAND gates and an inverter. With A = C = 1, B reaches F three ways: directly, through g1, and through the inverter and g2. Flip B and F follows; whether it glitches on the way depends on the gate delays, which the next figure draws on a waveform.' },
      { topic: 'hz-dynamic', frame: 8, caption: 'A circuit with the same shape on the simulator: x reaches F directly and through G, which has a static hazard of its own. F changes three times.' },
      { predict: { q: 'The inner signal G has a static-1 hazard. What cures the dynamic hazard at F?', options: ['A faster inverter', 'The consensus term in G', 'Nothing can'], answer: 1, explain: 'With the consensus term, G no longer glitches, so F sees only the direct path and one clean change from G.' } },
      'The last kind belongs to the flow table, not the logic. Suppose an input reaches one gate late. The loops may change before that gate has seen the input change, and to the gate it looks as if the input changed, changed back and changed again. If the flow table gives a different result for one change than for three, the circuit can end in the wrong row: an **essential hazard**.',
      { topic: 'hz-essential', frame: 6, caption: 'A slow wire into one gate lets the loops race ahead. No choice of cover fixes it; the cure is delay in the loops, so the slow input always arrives first.' },
      { h: 'What to take away' },
      { list: ['Dynamic hazard: three or more changes where one is due; it hides a static hazard inside.', 'Essential hazard: the table gives one result for one change of an input and another for three.', 'Static and dynamic hazards are cured by covers; essential hazards only by delay.'] },
      { exercise: 'p10x-dynamic' },
      { exercise: 'p10x-essential' },
    ],
  });

  // =========================================================================================================
  // Exercises
  // =========================================================================================================
  // ---- chapter 1 -----------------------------------------------------------------------------------------------
  const LOOPS2 = 'n1 = NAND(A, n2)\nn2 = NAND(B, n1, n3)\nn3 = NOR(C, n4)\nn4 = NOR(n3, D)\nQ = n2\nP = n4';
  ex({
    id: 'p10x-loops-count', chapter: 'p10-ch-analysis', title: 'How many loops?', level: 1, kind: 'number', answer: 2, higherLower: true,
    text: ['This circuit has four inputs and four gates. How many secondary variables does an analysis need? Cut each loop once.', { schematic: { circuit: () => K().circuitOf(LOOPS2, {}) }, caption: 'Follow each gate output and see where it goes back to.' }],
    hints: ['n1 and n2 feed each other: one loop.', 'n3 and n4 feed each other too, and that loop only sends a signal into n2; it never comes back from n2.', 'Two loops, two cuts: 2 secondary variables (at Q and at P).'],
    solution: 2, wrong: [1, 4, 3], why: 'One loop through the NAND gates, one through the NOR gates.',
  });
  ex({
    id: 'p10x-nor-wave', chapter: 'p10-ch-analysis', title: 'A NOR latch over time', level: 1, kind: 'waveform', circuit: NOR_LATCH, outputs: ['Q'], inputs: { S: '00100010', R: '10000100' }, given: { Q: '0???????' },
    text: ['Two NOR gates in a loop, Q = (R + Q′)′ and Q′ = (S + Q)′. Each slot holds the inputs long enough for the latch to settle. Draw Q.'],
    hints: ['S = 1 sets Q to 1, R = 1 resets it to 0, and S = R = 0 holds.', 'Slot 1 resets (Q = 0) and slots 2 holds; slot 3 sets.', 'Q: 0 0 1 1 1 0 1 1.'],
    solution: { Q: '00111011' }, wrong: [{ Q: '00100010' }, { Q: '00111001' }],
  });
  ex({
    id: 'p10x-trans-table', chapter: 'p10-ch-analysis', title: 'The transition table of one loop', level: 1, kind: 'table',
    rows: ['0', '1'], cols: GRAY2, corner: '', cellKind: 'bit',
    cells: (() => { const out = {}; const m = model({ inputs: ['x1', 'x2'], vars: ['y'], Y: { y: "x1x2' + x1y" }, outputs: {} }); for (const y of ['0', '1']) for (const x of GRAY2) out[y + '|' + x] = m.Y(x, y); return out; })(),
    text: ['Fill in the transition table of Y = x1x2′ + x1y: the value of Y for each row y (0 or 1, down the side) and each input column x1x2 (across the top).'],
    hints: ['Y needs x1 = 1 in both terms: the columns 00 and 01 give 0 in both rows.', 'Column 10 has x2′ = 1, so Y = 1 there whatever y is. Column 11 gives Y = x1y = y.', 'Row 0: 0 0 0 1. Row 1: 0 0 1 1 (columns 00, 01, 11, 10).'],
    solution: { '0|00': '0', '0|01': '0', '0|11': '0', '0|10': '1', '1|00': '0', '1|01': '0', '1|11': '1', '1|10': '1' },
    wrong: [{ '0|00': '0', '0|01': '0', '0|11': '0', '0|10': '1', '1|00': '1', '1|01': '1', '1|11': '1', '1|10': '1' }],
  });
  ex({
    id: 'p10x-stable-count', chapter: 'p10-ch-analysis', title: 'Count the stable states', level: 1, kind: 'number', answer: 6, higherLower: true,
    text: ['A circuit has two loops: Y1 = x1x2 + x1y1 and Y2 = x1x2 + x2y2. How many of its 16 total states are stable?'],
    hints: ['A total state (x, y) is stable when Y1 = y1 and Y2 = y2. Work column by column.', 'In column 00 only y = 00 is stable; in column 11 only y = 11.', 'Column 00: 00. Column 01: 00 and 01. Column 11: 11. Column 10: 00 and 10. That is 6.'],
    solution: 6, wrong: [4, 5, 8], why: 'Columns 01 and 10 each have two: the circuit remembers whether the remaining input was the one still held.',
  });
  ex({
    id: 'p10x-flow-table', chapter: 'p10-ch-analysis', title: 'Write the flow table', level: 3, kind: 'table',
    rows: ['a', 'b', 'c', 'd'], cols: GRAY2, corner: '',
    cells: (() => { const m = model(specQ), an = S.Async.analyse(m), out = {}; for (const y of ['00', '01', '10', '11']) for (const x of GRAY2) out[an.names[y] + '|' + x] = an.names[an.table[y][x]]; return out; })(),
    text: ['Name the rows of Y1 = x1x2 + x1y1, Y2 = x1x2 + x2y2 as a = 00, b = 01, c = 10, d = 11 (y1y2), and write the flow table: for each row and each input column x1x2, the name of the row that total state leads to.'],
    hints: ['Column 11 sends every row to d, since x1x2 = 1 in both excitations.', 'Column 00 sends every row to a. In column 01, Y1 = 0 and Y2 = y2; in column 10, Y1 = y1 and Y2 = 0.', 'Columns 00 01 11 10. a: a a d a. b: a b d a. c: a a d c. d: a b d c.'],
    solution: { 'a|00': 'a', 'a|01': 'a', 'a|11': 'd', 'a|10': 'a', 'b|00': 'a', 'b|01': 'b', 'b|11': 'd', 'b|10': 'a', 'c|00': 'a', 'c|01': 'a', 'c|11': 'd', 'c|10': 'c', 'd|00': 'a', 'd|01': 'b', 'd|11': 'd', 'd|10': 'c' },
    wrong: [{ 'a|00': 'a', 'a|01': 'b', 'a|11': 'd', 'a|10': 'c', 'b|00': 'a', 'b|01': 'b', 'b|11': 'd', 'b|10': 'a', 'c|00': 'a', 'c|01': 'a', 'c|11': 'd', 'c|10': 'c', 'd|00': 'a', 'd|01': 'b', 'd|11': 'd', 'd|10': 'c' }],
  });
  ex({
    id: 'p10x-oscillate', chapter: 'p10-ch-analysis', title: 'Columns with nowhere to rest', level: 2, kind: 'choice', options: ['00', '01', '11', '10'], answer: [2, 3],
    text: ['One loop: Y = x1y′ + x1′x2. In which input columns x1x2 does the circuit have no stable state at all? Choose every one.'],
    hints: ['Work out Y in each column, as a function of y.', 'Column 00: Y = 0. Column 01: Y = 1. With x1 = 1, Y = y′.', 'Y = y′ can never equal y: columns 11 and 10 have no stable state, and the loop oscillates there.'],
    solution: [2, 3], wrong: [[2], [0, 1], [1, 2, 3]], why: 'With x1 = 1 the loop is an inverter feeding itself.',
  });
  ex({
    id: 'p10x-follow', chapter: 'p10-ch-analysis', title: 'Follow the flow table', level: 2, kind: 'string', placeholder: 'four codes, like 00 01 11 10',
    accept: (t) => { const got = String(t).replace(/[^01]+/g, ' ').trim(); return got === '00 11 10 00' ? true : 'Not quite: list the stable row y1y2 after each of the four changes, in order.'; },
    text: ['The circuit Y1 = x1x2 + x1y1, Y2 = x1x2 + x2y2 rests in y1y2 = 00 with inputs 00. The inputs then go 01, 11, 10, 00, one change at a time. Write the stable row y1y2 after each change.'],
    hints: ['Column 01 from row 00: Y1 = 0, Y2 = x2y2 = 0. It stays.', 'Column 11 sends it to 11. Column 10 from row 11: Y1 = x1y1 = 1, Y2 = x2y2 = 0.', '00, 11, 10, 00.'],
    solution: '00 11 10 00', wrong: ['00 11 01 00', '01 11 10 00'],
    why: 'In row 10 the output z = y1y2′ is 1: the circuit has recorded that x2 let go before x1.',
  });
  ex({
    id: 'p10x-cycle-path', chapter: 'p10-ch-analysis', title: 'A cycle, step by step', level: 2, kind: 'string', placeholder: 'the codes in order, like 00 01 11',
    accept: (t) => { const got = String(t).replace(/[^01]+/g, ' ').trim(); return got === '00 01 11 10' ? true : got.startsWith('00 10') ? 'Not quite: in row 00, column 10, work out both excitations; only one of them is 1.' : 'Not quite: write every code y1y2 the circuit passes through, from 00 to where it rests.'; },
    text: ['Y1 = x1x2 + x1y1 + x2′y2 and Y2 = x1′x2 + x2y2 + x1y1′. The circuit rests in y1y2 = 00 with inputs 00, and x1 rises (inputs 10). Write every code it passes through, from 00 to the stable one.'],
    hints: ['In row 00, column 10: Y1 = 0 and Y2 = x1y1′ = 1. Only y2 changes.', 'Then row 01: Y1 = x2′y2 = 1, Y2 = 1. Then row 11: Y1 = 1, Y2 = 0.', '00, 01, 11, 10: a cycle, one change at a time, ending in the stable row 10.'],
    solution: '00 01 11 10', wrong: ['00 10', '00 11 10'],
  });
  ex({
    id: 'p10x-celem-wave', chapter: 'p10-ch-analysis', title: 'A loop that waits for agreement', level: 2, kind: 'waveform',
    circuit: 'a = AND(x1, x2)\nb = AND(x1, y)\nc = AND(x2, y)\ny = OR(a, b, c)', outputs: ['y'], inputs: { x1: '01110001', x2: '00111000' }, given: { y: '0???????' },
    text: ['y = x1x2 + x1y + x2y, an OR of three ANDs with its own output fed back. Draw y, slot by slot.'],
    hints: ['When both inputs are 1, x1x2 = 1 makes y = 1; when both are 0, every term is 0.', 'When the inputs disagree, y keeps its value through x1y or x2y.', 'y: 0 0 1 1 1 0 0 0.'],
    solution: { y: '00111000' }, wrong: [{ y: '01111001' }, { y: '00110000' }],
    why: 'It goes to 1 only when both inputs are 1, to 0 only when both are 0, and otherwise holds.',
  });
  ex({
    id: 'p10x-race-kind', chapter: 'p10-ch-analysis', title: 'What kind of transition?', level: 1, kind: 'choice',
    options: ['A single change', 'A cycle', 'A non-critical race', 'A critical race'], answer: 3,
    whyNot: { 0: 'Compare the excitation with the row: how many bits differ?', 1: 'A cycle moves one variable at a time; here two variables are excited at the very first step.', 2: 'Play out both orders: do they end in the same row?' },
    text: ['Y1 = x1x2 + x1y1 + x2′y2 and Y2 = x1′x2 + x2y2 + x1y1′. The circuit is in row y1y2 = 00 when the inputs become 11. What happens?'],
    hints: ['In row 00, column 11: Y1 = x1x2 = 1, and in Y2 the term x1y1′ = 1. So Y = 11, two bits away from the row.', 'Both variables are excited: a race. If y1 wins, row 10 is stable in column 11. If y2 wins, row 01 leads on to 11, also stable.', 'Two different endings, 10 and 11: a critical race.'],
    solution: 3, wrong: [2, 0, 1],
  });
  ex({
    id: 'p10x-race-ends', chapter: 'p10-ch-analysis', title: 'Where can the race end?', level: 2, kind: 'set',
    answer: (() => { const r = S.Async.explore(model({ inputs: ['x1', 'x2'], vars: ['y1', 'y2'], Y: { y1: "x1x2 + x1y1 + x2'y2", y2: "x1'x2 + x2y2 + x1y1'" }, outputs: {} }), '11', '00'); return '{' + r.outcomes.join(', ') + '}'; })(),
    text: ['For the same circuit and the same move (row 00, inputs become 11), list every stable row y1y2 it can end in, as a set like {01, 10}.'],
    hints: ['Try y1 first, y2 first, and both together.', 'y1 first: 10, stable. y2 first: 01, then 11, stable. Both: 11.', '{10, 11}.'],
    solution: '{10, 11}', wrong: ['{11}', '{10}', '{01, 10, 11}'],
  });
  ex({
    id: 'p10x-noncritical', chapter: 'p10-ch-analysis', title: 'A harmless race', level: 2, kind: 'choice',
    options: ['A critical race that can end in 10 or 01', 'A non-critical race that always ends in 11', 'A cycle through 01', 'No change: 00 is stable'], answer: 1,
    text: ['Y1 = x1x2 + x1y1 and Y2 = x1x2 + x2y2. The circuit is in row 00 and the inputs become 11. What happens?'],
    hints: ['In column 11 both excitations are 1, whatever the row.', 'Both y1 and y2 are excited: a race. Does the order matter?', 'Whichever changes first, the excitation is still 11, so the other follows: it always ends in 11. A non-critical race.'],
    solution: 1, wrong: [0, 2, 3], whyNot: { 0: 'After either variable changes, the excitation in column 11 is still 11, so the other one follows.', 2: 'In column 11 both excitations are 1 from the start: two variables change, not a chain of single ones.', 3: 'In column 11, Y = 11, not 00.' },
  });
  ex({
    id: 'p10x-nand-wave', chapter: 'p10-ch-analysis', title: 'A NAND latch over time', level: 2, kind: 'waveform', circuit: NAND_LATCH, outputs: ['Q', 'Qn'], inputs: { Sn: '11011110', Rn: '01111011' }, given: { Q: '0???????', Qn: '1???????' },
    text: ['A NAND latch: Q = (S′Q′)′ and Q′ = (R′Q)′, with active-low inputs S′ and R′ (named Sn and Rn). Draw Q and Q′.'],
    hints: ['S′ = 0 sets (Q = 1), R′ = 0 resets (Q = 0), both 1 hold.', 'Slot 1 resets, slot 3 sets, slot 6 resets, slot 7 holds.', 'Slot 8 has S′ = 0 again, so it sets. Q: 0 0 1 1 1 0 0 1, and Q′ is its complement: 1 1 0 0 0 1 1 0.'],
    solution: { Q: '00111001', Qn: '11000110' }, wrong: [{ Q: '00111000', Qn: '11000111' }, { Q: '00111001', Qn: '00111001' }],
  });

  // ---- chapter 2 -----------------------------------------------------------------------------------------------
  const fallDesign = () => S.Async.design(FALL);
  ex({
    id: 'p10x-primitive-rows', chapter: 'p10-ch-design', title: 'Rows of a primitive table', level: 1, kind: 'number', answer: Object.keys(FALL.rows).length, higherLower: true,
    text: ['*Z goes to 1 when x2 falls while x1 is 1, and back to 0 when x1 falls.* With one row for each situation the circuit must tell apart, and one stable state per row, how many rows does the primitive flow table have?'],
    hints: ['Columns 00, 01 and 11 each need one row: nothing to remember there.', 'Column 10 needs two: x1 alone with nothing caught, and x1 alone after x2 fell.', '1 + 1 + 1 + 2 = 5 rows.'],
    solution: 5, wrong: [4, 6, 8],
  });
  ex({
    id: 'p10x-compatible', chapter: 'p10-ch-design', title: 'Compatible pairs', level: 2, kind: 'set',
    answer: (() => fallDesign().stages.compatibles.pairs.map((p) => '{' + p.join(', ') + '}').join(', '))(),
    text: ['The primitive flow table of the falling catch:', flowBlock(FALL), 'List every compatible pair of rows, as sets like {a, b}, {a, c}.'],
    hints: ['Two rows clash where both give an output and the outputs differ: only e has Z = 1, and only in column 10, where c is stable with Z = 0. So c and e clash.', 'Then check what each pair implies. a and d: in column 10 a leads to c and d leads to e, a clashing pair, so a and d are not compatible. c and d: same column, same clash.', '{a, b}, {a, c}, {b, c}, {b, d}, {b, e}, {d, e}.'],
    solution: '{a, b}, {a, c}, {b, c}, {b, d}, {b, e}, {d, e}', wrong: ['{a, b}, {a, c}, {b, c}, {b, d}, {b, e}, {d, e}, {c, e}', '{a, b}, {a, c}, {b, c}', '{a, b}, {a, c}, {b, c}, {b, d}, {b, e}, {d, e}, {a, d}'],
  });
  ex({
    id: 'p10x-maximal', chapter: 'p10-ch-design', title: 'Merge the rows', level: 3, kind: 'set',
    answer: (() => '{' + fallDesign().stages.merged.blocks.map((b) => '{' + b.join(', ') + '}').join(', ') + '}')(),
    text: ['From the compatible pairs {a, b}, {a, c}, {b, c}, {b, d}, {b, e}, {d, e}, find the maximal compatibles of the falling catch: the largest groups in which every two rows are compatible. Write them as a set of sets, like {{a, b}, {c}}.'],
    hints: ['a, b and c are all joined to each other in the merger diagram.', 'b, d and e are too. b is in both groups.', '{{a, b, c}, {b, d, e}}: they cover every row and form a closed cover, so the table merges into 2 rows.'],
    solution: '{{a, b, c}, {b, d, e}}', wrong: ['{{a, b}, {c}, {d, e}}', '{{a, b, c, d, e}}', '{{a, b, c}, {d, e}}'],
  });
  const SQUARE = { a: { '00': 'a', '01': 'a', '11': 'b', '10': 'd' }, b: { '00': '-', '01': 'a', '11': 'b', '10': 'c' }, c: { '00': 'd', '01': '-', '11': 'b', '10': 'c' }, d: { '00': 'd', '01': 'a', '11': '-', '10': 'c' } };
  const pairsOf = (t) => { const out = new Map(); for (const [r, row] of Object.entries(t)) for (const n of Object.values(row)) if (n !== '-' && n !== r) out.set([r, n].sort().join(''), [r, n].sort()); return [...out.values()]; };
  ex({
    id: 'p10x-assign', chapter: 'p10-ch-design', title: 'A race-free assignment', level: 2, kind: 'string', placeholder: 'a = 00, b = .., c = .., d = ..',
    accept: raceFree(['a', 'b', 'c', 'd'], pairsOf(SQUARE), 2),
    text: ['A merged flow table with four rows (stable entries in brackets):', { table: [['row \\ x1x2', '00', '01', '11', '10'], ['a', '(a)', '(a)', 'b', 'd'], ['b', '–', 'a', '(b)', 'c'], ['c', 'd', '–', 'b', '(c)'], ['d', '(d)', 'a', '–', 'c']] }, 'Give each row a 2-bit code so that no move between rows is a race. Write it like a = 00, b = 01, c = 11, d = 10.'],
    hints: ['List the moves: a–b, a–d, b–c (c goes to b in column 11), c–d.', 'Those four lines make a ring a, b, c, d: put it round the square of codes.', 'a = 00, b = 01, c = 11, d = 10 (or any rotation or reflection of it).'],
    solution: 'a = 00, b = 01, c = 11, d = 10', wrong: ['a = 00, b = 01, c = 10, d = 11', 'a = 00, b = 01, c = 11', 'a = 00, b = 00, c = 11, d = 10'],
  });
  ex({
    id: 'p10x-spare', chapter: 'p10-ch-design', title: 'Three rows, all neighbours', level: 3, kind: 'choice',
    options: ['a = 00, b = 01, c = 11, and nothing else is needed', 'a = 00, b = 01, c = 10, with the move between b and c relayed through the spare code 11', 'Three secondary variables, one per row', 'No race-free assignment exists'], answer: 1,
    text: ['A merged flow table has three rows, a, b and c, and moves between every pair of them (a–b, a–c and b–c). With two secondary variables, which is a race-free assignment?'],
    hints: ['Three rows on the four corners of a square: two of them must be diagonal.', 'A diagonal move changes two bits: route it through the fourth corner, which no row uses.', 'a = 00, b = 01, c = 10: a–b and a–c are edges; b–c goes 01 → 11 → 10, through the spare code 11.'],
    solution: 1, wrong: [0, 2, 3], whyNot: { 0: 'With a = 00 and c = 11 the move between a and c changes two bits.', 2: 'Three rows fit in two variables; what is missing is a way round the diagonal, and the fourth code gives it.', 3: 'A spare code can relay a move one bit at a time.' },
  });
  ex({
    id: 'p10x-excite-kmap', chapter: 'p10-ch-design', title: 'The excitation on a map', level: 2, kind: 'kmap', vars: ['y1', 'x1', 'x2'],
    minterms: (() => fallDesign().equations[0].ones)(),
    text: ['The falling catch merges into rows {a, b, c} (y1 = 0) and {b, d, e} (y1 = 1). Its excitation Y1, over y1 x1 x2, is 1 at cells 3, 5, 6 and 7. Circle a minimal cover.'],
    hints: ['Cell 7 (111) has three neighbours that are 1: 3, 5 and 6.', 'Each pair with 7 makes a group of two.', 'x1x2 (3, 7), y1x2 (5, 7) and y1x1 (6, 7).'],
    solution: ['-11', '1-1', '11-'], wrong: [['-11', '1-1'], [[3, 5, 6, 7]]],
    why: 'Every pair of neighbouring 1s lies inside one group, so this minimal cover is hazard-free too.',
  });
  ex({
    id: 'p10x-excite-circuit', chapter: 'p10-ch-design', title: 'Build the excitation logic', level: 2, kind: 'circuit', ref: 'y1x1 + y1x2 + x1x2', inputs: ['y1', 'x1', 'x2'], outputs: ['Y1'], parts: ['AND', 'OR'], maxGates: 4,
    text: ['Build Y1 = y1x1 + y1x2 + x1x2 from AND and OR gates, with y1 as an input (the loop is cut). At most four gates.'],
    hints: ['Three two-input AND gates, one for each term.', 'One three-input OR collects them.', 'a = AND(y1, x1), b = AND(y1, x2), c = AND(x1, x2), Y1 = OR(a, b, c).'],
    solution: 'a = AND(y1, x1)\nb = AND(y1, x2)\nc = AND(x1, x2)\nY1 = OR(a, b, c)', wrong: ['a = AND(y1, x1)\nc = AND(x1, x2)\nY1 = OR(a, c)', 'a = OR(y1, x1)\nb = OR(y1, x2)\nc = OR(x1, x2)\nY1 = AND(a, b, c)\nY2 = OR(a, a)'],
  });
  ex({
    id: 'p10x-z-simplify', chapter: 'p10-ch-design', title: 'The output, with don\'t-cares', level: 2, kind: 'simplify', vars: ['y1', 'x1', 'x2'],
    minterms: (() => fallDesign().outputs[0].ones)(), dc: (() => fallDesign().outputs[0].dc)(), form: 'sop', minimal: true,
    text: ['The output Z of the falling catch, over y1 x1 x2, is 1 at cell 6 (row 1, inputs 10) and a don\'t-care at cells 3 and 4, where the merged rows give no output. Write Z as simply as possible.'],
    hints: ['Cell 6 is 110. Its neighbours 7 and 2 are 0; 4 (100) is a don\'t-care.', 'Group 6 with 4: y1x2′.', 'Z = y1x2′.'],
    solution: "y1x2'", wrong: ["y1x1x2'", 'y1', "x1x2'"],
  });
  ex({
    id: 'p10x-fall-wave', chapter: 'p10-ch-design', title: 'Run the falling catch', level: 2, kind: 'waveform', circuit: FALL_CIRCUIT, outputs: ['Z'], inputs: { x1: '0111001110', x2: '0010011100' },
    text: ['The finished falling catch: Y1 = y1x1 + y1x2 + x1x2 fed back as y1, and Z = y1x2′. The inputs change one at a time. Draw Z.'],
    hints: ['Z can only be 1 in column 10, after the circuit has been in row y1 = 1.', 'Slot 4 (10, just after 11) and slot 9 (10, after 11) catch; slot 2 (10 after 00) does not.', 'Z: 0 0 0 1 0 0 0 0 1 0.'],
    solution: { Z: '0001000010' }, wrong: [{ Z: '0101000010' }, { Z: '0001100011' }],
  });

  // ---- chapter 3 -----------------------------------------------------------------------------------------------
  ex({
    id: 'p10x-spot', chapter: 'p10-ch-hazards', title: 'Spot the hazard', level: 1, kind: 'choice',
    options: ['A changes while B = 1 and C = 1', 'B changes while A = 0 and C = 0', 'C changes while A = 1 and B = 0', 'A changes while B = 0 and C = 1'], answer: 0,
    text: ['F = A′B + AC, built as two AND gates into an OR. Which single input change can make F glitch while it should stay 1?'],
    hints: ['F should stay 1 only if it is 1 before and after: look for two neighbouring 1s.', 'The 1s are cells 2, 3 (A′B) and 5, 7 (AC). Cells 3 and 7 are neighbours in different terms.', 'Cells 011 and 111: A changes while B = C = 1.'],
    solution: 0, wrong: [1, 3], whyNot: { 1: 'With A = 0, C = 0, F = B: F changes, so there is nothing static to glitch.', 3: 'With B = 0, C = 1, F = A: it changes value.' },
  });
  ex({
    id: 'p10x-hz-count', chapter: 'p10-ch-hazards', title: 'How many hazards?', level: 3, kind: 'number', higherLower: true,
    answer: Bo() ? Bo().staticHazards("B'D + BC + AC'D'").hazards.length : 4,
    text: ["F = B′D + BC + AC′D′, a minimal sum of products of four variables. How many pairs of neighbouring 1s are split between different terms, each a static-1 hazard?"],
    hints: ['Draw the three groups on a K-map and look along every edge between two 1s.', 'B′D and BC meet at cells 3–7 and 11–15 (B changes, C = D = 1). AC′D′ meets the others at 8–9 and 12–14.', '4 static-1 hazards.'],
    solution: 4, wrong: [2, 3, 0],
  });
  ex({
    id: 'p10x-hz-kmap', chapter: 'p10-ch-hazards', title: 'The minimal cover first', level: 2, kind: 'kmap', vars: ['A', 'B', 'C', 'D'], minterms: [1, 3, 6, 7, 8, 9, 11, 12, 14, 15],
    text: ['F = Σm(1, 3, 6, 7, 8, 9, 11, 12, 14, 15). Circle a minimal sum of products. (The next exercise makes it hazard-free.)'],
    hints: ['BC is a column pair of four: 6, 7, 14, 15.', 'B′D covers 1, 3, 9, 11. That leaves 8 and 12.', 'BC + B′D + AC′D′ (8, 12).'],
    solution: ['-11-', '-0-1', '1-00'], wrong: [['-11-', '-0-1'], ['-11-', '-0-1', '1-00', '--11']],
  });
  ex({
    id: 'p10x-hf-three', chapter: 'p10-ch-hazards', title: 'A hazard-free cover', level: 1, kind: 'kmap', vars: ['A', 'B', 'C'], minterms: [2, 3, 5, 7], hazardFree: true,
    text: ['F = A′B + AC. Circle a cover of F as a sum of products with no static-1 hazard.'],
    hints: ['The split pair is 011 and 111.', 'A term that covers both ignores A: it is BC.', "F = A'B + AC + BC."],
    solution: ["A'B", 'AC', 'BC'], wrong: [["A'B", 'AC'], ["A'B", 'AC', 'AB'], ["A'B", 'BC'], ["A'B", 'AC', 'BC', "AB'C"]],
  });
  ex({
    id: 'p10x-hf-four', chapter: 'p10-ch-hazards', title: 'Hazard-free in four variables', level: 3, kind: 'kmap', vars: ['A', 'B', 'C', 'D'], minterms: [1, 3, 6, 7, 8, 9, 11, 12, 14, 15], hazardFree: true,
    text: ['F = Σm(1, 3, 6, 7, 8, 9, 11, 12, 14, 15). Its minimal cover BC + B′D + AC′D′ has four static-1 hazards. Circle a hazard-free sum of products with as few terms as you can (six are enough).'],
    hints: ['3–7 and 11–15 are both bridged by one term: CD.', '8–9 needs AB′C′; 12–14 needs ABD′.', "BC + B'D + AC'D' + CD + AB'C' + ABD'."],
    solution: ['BC', "B'D", "AC'D'", 'CD', "AB'C'", "ABD'"], wrong: [['BC', "B'D", "AC'D'"], ['BC', "B'D", "AC'D'", 'CD'], ['BC', "B'D", "AC'D'", 'CD', "AB'C'"]],
  });
  ex({
    id: 'p10x-hf-pos', chapter: 'p10-ch-hazards', title: 'A static-0 hazard', level: 2, kind: 'kmap', vars: ['A', 'B', 'C'], form: 'pos', hazardFree: true,
    minterms: (() => { const f = Bo().fromExpr(Bo().parse("(A + B')(B + C)"), ['A', 'B', 'C']); return [...f.ones]; })(),
    text: ['F = (A + B′)(B + C), an OR-AND circuit. When it should stay 0, it can pulse to 1. Circle the 0s as a product of sums of the same function with no static-0 hazard.'],
    hints: ['The 0s are 000, 010 (from B + C) and 010, 011 (from A + B′): cells 0, 2, 3. Look for neighbouring 0s in different sums.', 'Cells 000 and 010 differ in B and lie in different sum terms.', '(A + B′)(B + C)(A + C).'],
    solution: ["(A + B')", '(B + C)', '(A + C)'], wrong: [["(A + B')", '(B + C)'], ["(A + B')", '(B + C)', '(A + B)']],
  });
  ex({
    id: 'p10x-dynamic', chapter: 'p10-ch-hazards', title: 'Which change is dynamic?', level: 2, kind: 'choice',
    options: ['B rises with A = 1, C = 1', 'B falls with A = 1, C = 1', 'B rises with A = 1, C = 0', 'A rises with B = 1, C = 1'], answer: 0,
    text: ['The circuit: B′ from an inverter, g1 = (BC)′, g2 = (B′A)′, g3 = (g1·g2)′, F = (g3·B)′.', { circuit: 'nb = NOT(B)\ng1 = NAND(B, C)\ng2 = NAND(nb, A)\ng3 = NAND(g1, g2)\nF = NAND(g3, B)', outputs: ['F'], inputs: { A: 1, C: 1 } }, 'Exploring every order in which the gates can switch, which single input change can make F change three times instead of once?'],
    hints: ['A dynamic hazard needs F to change value, and the changing input to reach F by three paths.', 'B reaches F directly, through g1 and through the inverter and g2. With A = C = 1 F goes from 1 to 0 when B rises.', 'B rising with A = C = 1: F can go 1, 0, 1, 0. With C = 0 F should stay 1 (a static hazard instead), and B falling ends cleanly.'],
    solution: 0, wrong: [1, 2, 3], whyNot: { 2: 'With C = 0, F stays 1 before and after: that change can only cause a static hazard.', 1: 'Falling, B turns F on through the direct path, and the slower paths only agree.', 3: 'With B = 1 the inverter gives 0, so g2 = 1 whatever A is: A does not reach F at all.' },
  });
  ex({
    id: 'p10x-essential', chapter: 'p10-ch-hazards', title: 'One change or three', level: 3, kind: 'choice',
    options: ['Yes: from row a, one change of x leads to b, but three changes lead to c', 'No: every change of x is a single move', 'Only if the cover has a static hazard'], answer: 0,
    text: ['A circuit halves the frequency of x: its flow table has rows a (x = 0, Z = 0), b (x = 1, Z = 1), c (x = 0, Z = 1) and d (x = 1, Z = 0), and moves a → b → c → d → a on each change of x.', { table: [['row', 'x = 0', 'x = 1', 'Z'], ['a', '(a)', 'b', '0'], ['b', 'c', '(b)', '1'], ['c', '(c)', 'd', '1'], ['d', 'a', '(d)', '0']] }, 'Does this table have an essential hazard?'],
    hints: ['Start in a and let x change once: where does it settle?', 'Now imagine a gate sees x change three times: 0 → 1 → 0 → 1. From a: b, then c, then d.', 'One change ends in b, three end in d: the table itself has an essential hazard. A slow wire for x can push the circuit two rows too far.'],
    solution: 0, wrong: [1, 2], whyNot: { 1: 'Each change is a single move, but follow three changes of x from row a and compare where you end with where one change ends.', 2: 'An essential hazard is in the flow table itself; no cover removes it.' },
    why: S.Async ? 'The engine finds ' + S.Async.essentialHazards(S.Async.design({ name: 'halver', inputs: ['x'], outputs: ['Z'], rows: { a: { 0: 'a', 1: 'b' }, b: { 0: 'c', 1: 'b' }, c: { 0: 'c', 1: 'd' }, d: { 0: 'a', 1: 'd' } }, out: { a: '0', b: '1', c: '1', d: '0' } }).model).length + ' such states, one in every row.' : '',
  });

  // ---- design-style exercises: build, draw and cover ----------------------------------------------------------
  const SR_EXC = 'nr = NOT(R)\nt = AND(nr, y)\ny = OR(S, t)\nQ = y';
  ex({
    id: 'p10x-latch-build', chapter: 'p10-ch-analysis', title: 'Build the latch from its excitation', level: 2, kind: 'circuit', refCircuit: SR_EXC, inputs: ['S', 'R'], outputs: ['Q'], parts: ['AND', 'OR', 'NOT'], maxGates: 3,
    steps: [{ S: 1, R: 0 }, { S: 0, R: 0 }, { S: 0, R: 1 }, { S: 0, R: 0 }, { S: 1, R: 0 }, { S: 0, R: 0 }],
    text: ['Cut the loop of an SR latch and its excitation is Y = S + R′y: S sets it, and otherwise it keeps y while R = 0. Build it from AND, OR and NOT gates with its own output y fed back, and Q = y. At most three gates. It is checked by setting, holding, resetting and holding again.'],
    hints: ['The term R′y needs R complemented first.', 'One AND makes R′y and one OR adds S. The OR\'s output is y itself, which the AND reads back.', 'nr = NOT(R), t = AND(nr, y), y = OR(S, t), Q = y.'],
    solution: SR_EXC, wrong: ['t = AND(R, y)\ny = OR(S, t)\nQ = y', 'nr = NOT(R)\ny = OR(S, nr)\nQ = y', 'nr = NOT(R)\nny = NOT(y)\nt = AND(nr, ny)\ny = OR(S, t)\nQ = y'],
    why: 'Set, the loop holds 1 through R′y; reset, R′ = 0 breaks the loop and it holds 0.',
  });
  ex({
    id: 'p10x-sr-both-wave', chapter: 'p10-ch-analysis', title: 'Both inputs at 1', level: 2, kind: 'waveform', circuit: NOR_LATCH, outputs: ['Q', 'Qn'], inputs: { S: '1011001', R: '0001100' }, given: { Q: '1??????', Qn: '0??????' },
    text: ['The NOR latch again, Q = (R + Q′)′ and Q′ = (S + Q)′, but this time S and R are both 1 for one slot. Only one input changes at a time. Draw Q and Q′.'],
    hints: ['S = 1, R = 0 sets: Q = 1, Q′ = 0. S = R = 0 holds.', 'With S = R = 1 both NOR gates have an input at 1, so Q = 0 and Q′ = 0: the two outputs are no longer complements.', 'R stays 1 as S returns to 0, so the latch ends up reset. Q: 1 1 1 0 0 0 1; Q′: 0 0 0 0 1 1 0.'],
    solution: { Q: '1110001', Qn: '0000110' }, wrong: [{ Q: '1110001', Qn: '0001110' }, { Q: '1111001', Qn: '0000110' }],
  });
  ex({
    id: 'p10x-mq-wave', chapter: 'p10-ch-analysis', title: 'Which input let go first?', level: 2, kind: 'waveform', outputs: ['z'], inputs: { x1: '0111001001', x2: '0010011100' }, given: { z: '0?????????' },
    circuit: 'a = AND(x1, x2)\nb = AND(x1, y1)\ny1 = OR(a, b)\nc = AND(x2, y2)\ny2 = OR(a, c)\nn = NOT(y2)\nz = AND(y1, n)',
    text: ['The circuit that remembers which input let go first: y1 = x1x2 + x1y1, y2 = x1x2 + x2y2 and z = y1y2′, built from gates with both loops closed. The inputs change one at a time. Draw z.'],
    hints: ['Both y1 and y2 are set when x1 = x2 = 1. After that y1 holds while x1 = 1, and y2 while x2 = 1.', 'z = 1 needs y1 = 1 and y2 = 0: x2 fell while x1 stayed 1. In slots 7 and 8 it is x1 that lets go first, so y1 clears and z stays 0.', 'z: 0 0 0 1 0 0 0 0 0 0.'],
    solution: { z: '0001000000' }, wrong: [{ z: '0001000100' }, { z: '0011000000' }],
  });
  ex({
    id: 'p10x-hf-sop4', chapter: 'p10-ch-hazards', title: 'Two bridges to add', level: 2, kind: 'kmap', vars: ['A', 'B', 'C', 'D'], minterms: [0, 1, 5, 7, 10, 13, 14, 15], hazardFree: true,
    text: ['F = Σm(0, 1, 5, 7, 10, 13, 14, 15). Circle a sum of products for it with no static-1 hazard, and no more groups than that needs.'],
    hints: ['Start from a minimal cover: BD (5, 7, 13, 15), A′B′C′ (0, 1) and ACD′ (10, 14).', 'Two pairs of neighbouring 1s are split between groups: 1–5 (only B changes) and 14–15 (only D changes).', "Bridge them with A′C′D (1, 5) and ABC (14, 15): F = BD + A′B′C′ + ACD′ + A′C′D + ABC."],
    solution: ['BD', "A'B'C'", "ACD'", "A'C'D", 'ABC'], wrong: [['BD', "A'B'C'", "ACD'"], ['BD', "A'B'C'", "ACD'", "A'C'D"], ['BD', "A'B'C'", "ACD'", "A'C'D", 'ABC', "A'B'C'D"]],
  });
  ex({
    id: 'p10x-hf-pos4', chapter: 'p10-ch-hazards', title: 'One sum for two pairs', level: 3, kind: 'kmap', vars: ['A', 'B', 'C', 'D'], minterms: [0, 1, 4, 5, 6, 7, 14, 15], form: 'pos', hazardFree: true,
    text: ['F = Σm(0, 1, 4, 5, 6, 7, 14, 15), built as an OR-AND circuit. Circle its 0s as a product of sums with no static-0 hazard.'],
    hints: ['The 0s are 2, 3, 8, 9, 10, 11, 12 and 13. A minimal product of sums is (A′ + C)(B + C′).', '(A′ + C) holds 8, 9, 12, 13 and (B + C′) holds 2, 3, 10, 11. Cells 8 and 10 are neighbours (only C changes) in different sums, and so are 9 and 11.', 'One sum bridges both pairs: A′ + B (8, 9, 10, 11). F = (A′ + C)(B + C′)(A′ + B).'],
    solution: ["(A' + C)", "(B + C')", "(A' + B)"], wrong: [["(A' + C)", "(B + C')"], ["(A' + C)", "(B + C')", "(A' + B)", "(A' + B + C)"], ["(A' + C)", "(B + C')", '(A + B)']],
  });
  ex({
    id: 'p10x-glitch-wave', chapter: 'p10-ch-hazards', title: 'Watch the hazard happen', level: 3, kind: 'waveform', tech: 'CMOS', slotNs: 10,
    circuit: 'na = NOT(A)\nnb = BUF(na)\np = AND(nb, B)\nq = AND(A, C)\nF = OR(p, q)', outputs: ['F'], inputs: { A: '1110000111', B: '1111111111', C: '1111111111' }, given: { F: '1?????????' },
    text: ['F = A′B + AC with B = C = 1, so F should stay 1 whatever A does. In this build the A′ path has an inverter and a buffer, and every gate has the CMOS preset delay (NOT 8 ns, BUF 10 ns, AND and OR 10 ns). Each slot lasts 10 ns: A falls at 30 ns and rises again at 70 ns. Draw F as it is at the end of each slot.'],
    hints: ['A falls at 30 ns, so AC falls at 40 ns. A′ rises at 38 ns, gets through the buffer at 48 ns, and A′B rises at 58 ns.', 'From 40 to 58 ns neither AND gate gives 1. That gap is longer than the OR gate\'s 10 ns, so it gets through: F falls at 50 ns and rises again at 68 ns.', 'Only slot 6 (50 to 60 ns) ends with F = 0: F = 1 1 1 1 1 0 1 1 1 1. When A rises at 70 ns, AC turns on before A′B turns off, and there is no glitch.'],
    solution: { F: '1111101111' }, wrong: [{ F: '1111111111' }, { F: '1111011111' }, { F: '1111101101' }],
    why: 'Without the buffer the gap would be only 8 ns, shorter than the OR gate\'s delay, and the OR gate would swallow it. The consensus term BC would hold F at 1 either way.',
  });

  // =========================================================================================================
  // Tour and course
  // =========================================================================================================
  C.tour({
    id: 'p10-tour', title: 'Tour: asynchronous circuits', blurb: 'Where the analysis, design and hazard topics are, and how the lessons and exercises use them.',
    steps: [
      { route: 'part=async', text: 'Part 10 is about circuits with no clock: their memory is in feedback loops. The topics come in three families: analysis, design and hazards.' },
      { route: 'topic=async-loops', target: '#stageWrap', text: 'Every analysis starts here: find the loops, cut each one once, and name the cut wires secondary variables.' },
      { route: 'topic=async-tables', target: '#inputs', text: 'Type your own excitation equations, such as Y = x1x2\' + x1y, and the transition table fills in cell by cell, with the stable states circled.' },
      { route: 'topic=async-races', target: '#stageWrap', text: 'When two loops must change at once, this topic plays out every order on the square of codes and says whether the race is critical.' },
      { route: 'topic=async-primitive', target: '#stageWrap', text: 'Design runs the other way: a word description becomes a primitive flow table, then merged rows, codes and gates in the next three topics.' },
      { route: 'topic=hz-static', target: '#inputs', text: 'The hazard topics run on the simulator. Switch between the minimal cover and the one with the consensus term and watch the stored 1 survive.' },
      { route: 'lesson=p10l-static', target: '#lessonView', text: 'Each lesson embeds the topics at the right moment, asks you to predict, and ends with exercises.' },
      { route: 'learn', target: '[data-chapter="p10-ch-analysis"]', text: 'The exercises of Part 10: tables to fill, races to judge, waveforms to draw and hazard-free covers to write, all checked by the engines.' },
    ],
  });
  C.course({
    id: 'p10-course', title: 'Asynchronous circuits, from loops to hazards',
    blurb: 'Every topic of Part 10 in order, with the lessons that explain them and exercises to check yourself on the way.',
    steps: [
      { topic: 'async-loops', note: 'Find the loops and cut them.' },
      { lesson: 'p10l-loops' },
      { topic: 'async-tables', note: 'Excitations for every total state; circle the stable ones.' },
      { exercise: 'p10x-trans-table', note: 'Your turn: a transition table.' },
      { topic: 'async-fundamental', note: 'One input change at a time, on the flow table.' },
      { lesson: 'p10l-fundamental' },
      { topic: 'async-races', note: 'Every order of change, on the square of codes.' },
      { exercise: 'p10x-race-kind', note: 'A race to judge.' },
      { topic: 'async-sr', note: 'The SR latch, read the same way.' },
      { topic: 'async-primitive', note: 'From words to a primitive flow table.' },
      { topic: 'async-merger', note: 'Merging rows with the implication table.' },
      { exercise: 'p10x-maximal', note: 'Merge the falling catch.' },
      { topic: 'async-assign', note: 'Codes with no race.' },
      { topic: 'async-implement', note: 'Hazard-free excitations and the circuit.' },
      { lesson: 'p10l-assign' },
      { topic: 'hz-static', note: 'A glitch inside a loop is remembered.' },
      { exercise: 'p10x-hf-three', note: 'Circle a hazard-free cover.' },
      { topic: 'hz-dynamic', note: 'Three changes where one is due.' },
      { topic: 'hz-essential', note: 'The hazard in the table itself.' },
      { lesson: 'p10l-dynamic' },
    ],
  });

  // ---- what the diagram checker looks at -------------------------------------------------------------------
  if (S.Checks) {
    const ready = (sel) => "document.querySelector('" + sel + "')";
    for (const l of C.lessons.values()) if (/^p10l-/.test(l.id)) S.Checks.push({ group: 'learn', name: 'p10 lesson ' + l.id, hash: 'lesson=' + l.id, ready: ready('#lessonView'), sel: '#main' });
    for (const id of ['p10x-trans-table', 'p10x-nand-wave', 'p10x-assign', 'p10x-excite-kmap', 'p10x-dynamic', 'p10x-essential']) S.Checks.push({ group: 'learn', name: 'p10 exercise ' + id, hash: 'exercise=' + id, ready: ready('#exerciseView'), sel: '#main' });
    S.Checks.push({ group: 'courses', name: 'p10 course', hash: 'course=p10-course', ready: ready('#courseView'), sel: '#main' });
  }
})(globalThis.Sirkit = globalThis.Sirkit || {});
