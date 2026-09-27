// Part 3, gate-level minimisation: the chapters, the lessons, a guided tour and a course. The exercises and the bench
// lab are in 31-minimise-ex.js. Each lesson opens with a question, runs the topic that animates the idea at a frame
// chosen for the point being made, asks for a prediction, gives a live map or function to try, sums up, and leads to
// its exercises. Every function and number here is our own and comes from the engines.
(function (S) {
  'use strict';
  const C = S.Content;
  if (!C || C.lessons.has('min-gray')) return;
  const X = (id) => ({ exercise: id });
  const LAB = (id) => ({ lab: id });
  const V3 = ['A', 'B', 'C'], V4 = ['A', 'B', 'C', 'D'];

  C.chapter({ id: 'min-maps', part: 'minimise', n: 1, title: 'Karnaugh maps', blurb: 'The map as a torus, groups and their rules, prime and essential implicants, cyclic maps, don\'t-cares, product of sums, five and six variables, several outputs at once.' });
  C.chapter({ id: 'min-qm', part: 'minimise', n: 2, title: 'Minimising by tabulation', blurb: 'The Quine–McCluskey method: merging columns, the prime implicant chart with dominance, and Petrick\'s method for a cyclic core.' });
  C.chapter({ id: 'min-impl', part: 'minimise', n: 3, title: 'Costs, gate forms and hazards', blurb: 'What a circuit costs, NAND-NAND and NOR-NOR, AND-OR-INVERT, bubble pushing through many levels, XOR forms, and the glitches a minimal cover leaves behind.' });

  // =========================================================================================================
  // Chapter 1: Karnaugh maps
  // =========================================================================================================
  C.lesson({
    id: 'min-gray', chapter: 'min-maps', title: 'Why the map is in Gray order', minutes: 6,
    summary: 'A Karnaugh map puts the rows of a truth table in a square so that cells side by side differ in one variable. Gray order does it, and makes the map a torus with no edges.',
    blocks: [
      'The algebra lesson showed that AB′C + AB′C′ = AB′: two minterms that differ in one variable merge into one shorter term. Spotting such pairs in a column of sixteen rows is slow, because rows 3 (0011) and 11 (1011) are neighbours in this sense but are eight lines apart. A **Karnaugh map** arranges the rows so that every such pair sits side by side.',
      { def: 'Adjacent minterms', text: 'two minterms whose binary numbers differ in exactly one bit. Their sum loses that variable: XY + XY′ = X.' },
      { h: 'Counting is the wrong order' },
      'Label the columns 00, 01, 10, 11 and the step from 01 to 10 changes two bits, so cells beside each other would not merge. The Gray order 00, 01, 11, 10 changes one bit at every step, including the step from 10 back round to 00.',
      { topic: 'kmap-gray', input: { m: 10 }, frame: 5, caption: 'The columns rolled into a cylinder: column 10 now touches column 00. Step on: the rows roll too, and the flat map becomes a ring doughnut.' },
      { predict: { q: 'Cell 10 is 1010. Which cells are its four neighbours?', options: ['9, 11, 14, 6', '11, 8, 14, 2', '2, 8, 11, 12', '6, 11, 14, 15'], answer: 1, explain: 'Flip one bit at a time: D gives 11, C gives 8, B gives 14 and A gives 2. Two of them, 8 and 2, are across an edge of the flat map.' } },
      { topic: 'kmap-gray', input: { m: 10 }, frame: 11, caption: 'Flat again. Cell 10 is on the bottom row and the right-hand column, so two of its neighbours are at the far edges, joined by the dashed arcs.' },
      { h: 'Groups that wrap' },
      'On the torus a block of cells may run off one edge and come back on the other. The four corners of a 4-variable map are one block: cells 0, 2, 8 and 10 all have B = 0 and D = 0, so together they are B′D′.',
      { kmap: { vars: V4, minterms: [0, 2, 8, 10, 5, 13], groups: 'minimal' }, caption: 'F = Σm(0, 2, 5, 8, 10, 13): the corners make B′D′, and 5 with 13 makes BC′D. Open the same function in the workbench to circle groups yourself.' },
      { func: { vars: V4, minterms: [0, 2, 5, 8, 10, 13] }, caption: 'The same function in the workbench view: its table, its lists and the minimal forms the map gives.' },
      { h: 'Recap' },
      { list: ['Rows and columns run in Gray order: 00, 01, 11, 10.', 'Each cell of an n-variable map has n neighbours, one per variable.', 'The map is a torus: the left edge meets the right, the top meets the bottom, and groups may wrap.'] },
      X('min-ex-neighbours'), X('min-ex-k2'),
    ],
  });

  C.lesson({
    id: 'min-build', chapter: 'min-maps', title: 'From a truth table to a map', minutes: 6,
    summary: 'Every row of the truth table has one cell. Two, three and four variables make maps of 4, 8 and 16 cells; the row and column labels say which variables each cell has.',
    blocks: [
      'A truth table lists its rows in counting order, a map in Gray order. Moving the outputs across is mechanical, and doing it a few times by hand is the quickest way to stop putting rows 2 and 3 the wrong way round.',
      { h: 'Two variables' },
      'With A and B the map is 2 × 2: A picks the row and B the column. Here F = A′B′ + AB′ + AB has three 1s.',
      { topic: 'kmap-build', input: { n: '2', f: "A'B' + AB' + AB" }, frame: 5, caption: 'The three 1s at cells 0, 2 and 3. Cells 2 and 3 share A, cells 0 and 2 share B′: F = A + B′.' },
      { h: 'Three and four variables' },
      'Three variables give a 2 × 4 map, A for the row and BC for the column. Four give 4 × 4, with AB down the side and CD across the top. Inside the square, cells in the third column have C = 1 and D = 1, and cells in the fourth have C = 1, D = 0: that swap is the whole trick.',
      { topic: 'kmap-build', input: { n: '4', f: 'Σm(2, 3, 6, 7, 9, 13, 15)' }, frame: 4, caption: 'Row 3 of the table lands in column 3, not column 4. Step on to fill the rest; watch rows 2 and 6 go to the last column.' },
      { predict: { q: 'On a 4-variable map with AB down the side and CD across the top, where does minterm 14 (1110) go?', options: ['Row 3, column 3', 'Row 3, column 4', 'Row 4, column 3', 'Row 4, column 4'], answer: 1, explain: 'AB = 11 is the third row in Gray order (00, 01, 11, 10), and CD = 10 is the fourth column.' } },
      { kmap: { vars: V4, minterms: [2, 3, 6, 7, 9, 13, 15], groups: 'minimal' }, caption: 'The same F with a minimal cover: A′C (cells 2, 3, 6, 7), AC′D (9, 13) and ABD (13, 15). Cell 15 could equally go with 7 as BCD: two minimal covers of 8 literals.' },
      { func: { vars: V4, minterms: [2, 3, 6, 7, 9, 13, 15] }, caption: 'Its truth table side by side with the minimal forms. Open it in the workbench and fill in the map yourself.' },
      { tip: 'Write the minterm number in the corner of each cell while you are learning. Reading a map then becomes reading numbers, and Σm lists go straight in.' },
      { h: 'Recap' },
      { list: ['n variables give 2ⁿ cells: 4, 8, 16, then two or four 16-cell maps for 5 and 6.', 'Rows and columns are labelled in Gray order, so the third and fourth columns are 11 and 10.', 'Each 1 of the table is one cell of the map; nothing else changes.'] },
      X('min-ex-k3-pair'), X('min-ex-k-expr'),
    ],
  });

  C.lesson({
    id: 'min-rules', chapter: 'min-maps', title: 'Which circles are groups', minutes: 7,
    summary: 'A group is a rectangle of 1, 2, 4, 8 … cells, wrapping allowed, holding only 1s and don\'t-cares. The bigger it is, the fewer literals its term has; one that cannot grow is a prime implicant.',
    blocks: [
      'A circle on a map stands for a product term, and the term is only real if the cells inside differ in a whole set of variables, every combination of them, and agree on the rest. That gives the rules.',
      { steps: ['The number of cells is a power of two: 1, 2, 4, 8, 16.', 'The cells form a rectangle on the torus (so a group may wrap round an edge).', 'Every cell holds a 1 or a don\'t-care, never a 0 (for SOP).', 'Then ask: can it double and stay a group? If it can, it is an implicant but not a prime implicant.'] },
      'Each doubling removes one variable from the term. A single cell of a 4-variable map has 4 literals, a pair 3, a quad 2, an octet 1.',
      { topic: 'kmap-rules', input: { n: '4', f: 'Σm(1, 3, 4, 6, 9, 11, 12, 13, 14)', circles: '1, 3, 9, 11; 4, 6, 12, 14; 12, 13; 9, 13, 11; 3, 11; 13, 15; 4, 12, 13, 9; 6, 14' }, frame: 1, caption: 'Eight circles drawn on F = Σm(1, 3, 4, 6, 9, 11, 12, 13, 14), checked one at a time. The first is the wrapping quad B′D; step on to see each verdict.' },
      { predict: { q: 'Circle 5 takes cells 3 and 11. Is it a prime implicant?', options: ['Yes: a pair of adjacent 1s', 'No: 3 and 11 are not adjacent', 'No: it can double to the quad 1, 3, 9, 11'], answer: 2, explain: 'B′CD is a valid group, but cells 1 and 9 are 1s too, so it grows into B′D and drops C.' } },
      { topic: 'kmap-rules', input: { n: '4', f: 'Σm(1, 3, 4, 6, 9, 11, 12, 13, 14)', circles: '1, 3, 9, 11; 4, 6, 12, 14; 12, 13; 9, 13, 11; 3, 11; 13, 15; 4, 12, 13, 9; 6, 14' }, frame: 17, caption: 'The verdicts: three prime implicants kept, two groups that can still double, and three circles that break a rule (three cells, a cell holding 0, an L shape).' },
      { kmap: { vars: V4, minterms: [1, 3, 4, 6, 9, 11, 12, 13, 14], groups: ['-0-1', '-1-0', '110-'] }, caption: 'Three primes that cover every 1: B′D + BD′ + ABC′. The workbench\'s own check on each circle is the one you meet in the exercises.' },
      { warn: 'A group of three, or an L of four, is never a term. If three 1s sit in a row, cover them with two overlapping pairs.' },
      { h: 'Recap' },
      { list: ['Power of two, rectangle on the torus, only 1s and don\'t-cares.', 'Each doubling drops one literal.', 'A prime implicant is a group that cannot double without taking a 0.'] },
      X('min-ex-rules'), X('min-ex-k3-wrap'), X('min-ex-k4-quads'),
    ],
  });

  C.lesson({
    id: 'min-primes', chapter: 'min-maps', title: 'Prime and essential prime implicants', minutes: 8,
    summary: 'A minimal sum uses only prime implicants. A prime that is the only one covering some 1 is essential and must be in every minimal sum; the rest are chosen to cover what is left.',
    blocks: [
      'Circling the biggest groups you can see works on easy maps and fails on harder ones: the biggest group is sometimes not needed at all. A safe method separates finding the candidates from choosing among them.',
      { def: 'Prime implicant', text: 'a product term that implies F (it is 0 wherever F is 0) and loses that property if any literal is removed. On the map: a group that cannot double.' },
      { def: 'Essential prime implicant', text: 'a prime implicant that covers some 1 of F that no other prime covers. Every minimal sum contains it.' },
      { topic: 'kmap-primes', input: { n: '4', f: 'Σm(0, 1, 3, 7, 8, 9, 11, 14, 15)' }, frame: 5, caption: 'Four primes of F = Σm(0, 1, 3, 7, 8, 9, 11, 14, 15). The quad B′D is as big as any of them. Step on to see which ones are essential.' },
      { predict: { q: 'Is the quad B′D (cells 1, 3, 9, 11) needed in the minimal sum?', options: ['Yes: it is a prime of size four', 'No: its cells are covered by the essential primes', 'Only if ABC is left out'], answer: 1, explain: 'B′C′ (essential for cell 0) covers 1 and 9, and CD (essential for cell 7) covers 3 and 11. B′D adds nothing.' } },
      { topic: 'kmap-primes', input: { n: '4', f: 'Σm(0, 1, 3, 7, 8, 9, 11, 14, 15)' }, frame: 9, caption: 'F = B′C′ + CD + ABC: the three essential primes cover everything, and B′D is left out although it is a quad.' },
      { h: 'The procedure' },
      { steps: ['Find every prime implicant: every group that cannot double.', 'Mark each 1 that lies in exactly one prime. Those primes are essential; take them.', 'Cross out every 1 the essentials cover.', 'Cover what is left with as few, and as large, primes as possible (next lesson).'] },
      { kmap: { vars: V4, minterms: [0, 1, 3, 7, 8, 9, 11, 14, 15], groups: ['-00-', '-0-1', '--11', '111-'] }, caption: 'All four primes drawn at once. A cell inside one outline only marks an essential prime: 0 and 8 for B′C′, 7 for CD, 14 for ABC.' },
      { h: 'Recap' },
      { list: ['A minimal SOP is a sum of prime implicants.', 'Essential primes are forced: they hold a 1 that no other prime holds.', 'A large prime may still be redundant, when the essentials already cover its cells.'] },
      X('min-ex-ess-count'), X('min-ex-k4-ess'), X('min-ex-k4-tempt'),
    ],
  });

  C.lesson({
    id: 'min-select', chapter: 'min-maps', title: 'After the essentials: choices and cyclic maps', minutes: 8,
    summary: 'Once the essentials are in, the 1s still uncovered are covered by the fewest, largest primes. A cyclic map has no essential prime at all, so a first choice has to be made and the rest follows.',
    blocks: [
      'Sometimes the essentials leave a few 1s uncovered, and two or more primes reach each of them. Which to take?',
      { topic: 'kmap-select', input: { n: '4', f: 'Σm(0, 2, 3, 4, 5, 7, 11, 13, 15)' }, frame: 3, caption: 'F = Σm(0, 2, 3, 4, 5, 7, 11, 13, 15). The essentials CD and BD are in; cells 0, 2 and 4 are left, and four primes reach them.' },
      { predict: { q: 'Can one prime cover all of 0, 2 and 4?', options: ['Yes: A′D′', 'No: two pairs are needed', 'No: three singles are needed'], answer: 1, explain: '0, 2 and 4 are three cells, and no group of 1s contains all three. A′B′D′ takes 0 and 2, A′C′D′ takes 0 and 4.' } },
      { topic: 'kmap-select', input: { n: '4', f: 'Σm(0, 2, 3, 4, 5, 7, 11, 13, 15)' }, frame: 7, caption: 'F = BD + CD + A′B′D′ + A′C′D′. The primes A′B′C and A′BC′ are left out: each covers only cells that are already covered.' },
      { h: 'When nothing is essential' },
      'A map is **cyclic** when every 1 lies in at least two primes, so no prime is essential. Each prime overlaps the next round a ring. Pick any one prime, and the cells it leaves force the rest.',
      { topic: 'kmap-cyclic', input: { n: '4', f: 'Σm(0, 1, 5, 7, 8, 10, 14, 15)' }, frame: 10, caption: 'Eight 1s, eight primes, each 1 in exactly two of them: no essential prime. Step on to watch one choice settle the rest.' },
      { predict: { q: 'The first prime chosen is A′B′C′ (cells 0, 1). Cell 5 is now uncovered. Which prime should cover it?', options: ['A′C′D (1, 5)', 'A′BD (5, 7)', 'Either; they cost the same and lead to equal covers'], answer: 1, explain: 'Cell 1 is already covered, so A′C′D would only add cell 5; A′BD also covers 7, which needs a prime anyway.' } },
      { topic: 'kmap-cyclic', input: { n: '4', f: 'Σm(0, 1, 5, 7, 8, 10, 14, 15)' }, frame: 17, caption: 'Two minimal sums of 4 terms and 12 literals each: the ring of eight pairs can be cut in two places.' },
      { kmap: { vars: V4, minterms: [0, 1, 5, 7, 8, 10, 14, 15], groups: 'minimal' }, caption: 'One of the two answers. In the workbench, circle the other: A′C′D + ACD′ + B′C′D′ + BCD.' },
      { h: 'Recap' },
      { list: ['After the essentials, cover the remaining 1s with as few primes as possible, then prefer larger ones.', 'A prime whose 1s are all covered already is left out.', 'In a cyclic map there is no essential prime; one free choice fixes the rest, and different choices may tie.'] },
      X('min-ex-k4-select'), X('min-ex-cyc3'), X('min-ex-cyc4'),
    ],
  });

  C.lesson({
    id: 'min-dc', chapter: 'min-maps', title: 'Don\'t-care conditions', minutes: 7,
    summary: 'Input combinations that never occur, or whose output nobody reads, are don\'t-cares (×). A group may include them to grow, but no group is drawn just to cover them.',
    blocks: [
      'A circuit reads one BCD digit, 0 to 9, on four wires. The six codes 1010 to 1111 never arrive, so the output on those rows does not matter. Writing them as 0 would throw away freedom; writing them as **don\'t-cares** lets each one be 0 or 1, whichever makes the circuit smaller.',
      { def: 'Don\'t-care', text: 'a row of the truth table whose output may be chosen freely, written × or d. F = Σm(…) + d(…) lists them apart.' },
      'Take the output that says the digit is prime: 2, 3, 5 or 7.',
      { topic: 'kmap-dc', input: { n: '4', f: 'Σm(2, 3, 5, 7) + d(10, 11, 12, 13, 14, 15)' }, frame: 4, caption: 'Three primes once the don\'t-cares join in: B′C, BD and CD. The groups of don\'t-cares alone (AB, AC) are not drawn.' },
      { predict: { q: 'Without the don\'t-cares, the prime-digit output is A′B′C + A′BD (6 literals). How many literals does it need with them?', options: ['6', '5', '4', '2'], answer: 2, explain: 'B′C takes 10 and 11 as 1s, BD takes 13 and 15: F = B′C + BD, 4 literals. 12 and 14 stay 0.' } },
      { topic: 'kmap-dc', input: { n: '4', f: 'Σm(2, 3, 5, 7) + d(10, 11, 12, 13, 14, 15)' }, frame: 8, caption: 'F = B′C + BD, with 10, 11, 13 and 15 taken as 1 and 12, 14 left as 0.' },
      { kmap: { vars: V4, minterms: [2, 3, 5, 7], dc: [10, 11, 12, 13, 14, 15], groups: 'minimal' }, caption: 'The prime-digit map: × cells inside a group became 1s, the others 0s.' },
      { func: { vars: V4, minterms: [2, 3, 5, 7], dc: [10, 11, 12, 13, 14, 15] }, caption: 'In the workbench the table has × in the last six rows. Change one of them to 0 and see whether the minimal form changes.' },
      { warn: 'A don\'t-care is only a promise about the inputs. Once the circuit is built each × has a real value, and if the "impossible" input does arrive (at power-up, say), the output will be whatever the groups made it.' },
      { h: 'Recap' },
      { list: ['Don\'t-cares may be taken as 1 inside a group when that makes the group bigger.', 'Never draw a group only to cover don\'t-cares.', 'Each don\'t-care ends up 1 or 0; which one is decided by the cover.'] },
      X('min-ex-dc-bcd'), X('min-ex-dc-b'), X('min-ex-dc-c'),
    ],
  });

  C.lesson({
    id: 'min-pos', chapter: 'min-maps', title: 'Product of sums from the 0s', minutes: 8,
    summary: 'Grouping the 0s gives a minimal sum for F′; De Morgan turns it into a minimal product of sums for F. The same map read both ways can give circuits of different cost.',
    blocks: [
      'The 0s of F are the 1s of F′. Circle them with the same rules and you get a minimal SOP for F′. Complementing it with De Morgan turns each product into a sum and the sum into a product: a minimal POS for F.',
      { steps: ['Circle the 0s of F (and don\'t-cares that help) as if they were 1s.', 'Write each group as a product: that is a term of F′.', 'Complement: every literal flips and every product becomes a sum. Equivalently, read each group of 0s as a sum term directly: a variable that is 0 across the group appears plain, one that is 1 appears complemented.'] },
      { topic: 'kmap-pos', input: { n: '4', f: 'Σm(0, 1, 2, 3, 4, 6, 8, 9, 12)' }, frame: 7, caption: 'F = Σm(0, 1, 2, 3, 4, 6, 8, 9, 12). Its seven 0s make two quads. The group 10, 11, 14, 15 has A = 1 and C = 1: as a term of F′ it is AC, and as a sum term of F it is A′ + C′.' },
      { predict: { q: 'The other group of 0s is 5, 7, 13, 15, where B = 1 and D = 1. What sum term does it give?', options: ['B + D', 'B′ + D′', 'BD', 'B′D′'], answer: 1, explain: 'As a term of F′ it is BD; De Morgan makes (BD)′ = B′ + D′.' } },
      { topic: 'kmap-pos', input: { n: '4', f: 'Σm(0, 1, 2, 3, 4, 6, 8, 9, 12)' }, frame: 9, caption: 'SOP needs 8 literals and 12 gate inputs; POS (A′ + C′)(B′ + D′) needs 4 literals and 6 gate inputs.' },
      { kmap: { vars: V4, minterms: [0, 1, 2, 3, 4, 6, 8, 9, 12], form: 'pos', groups: 'minimal' }, caption: 'The two groups of 0s, read as the sums A′ + C′ and B′ + D′.' },
      { kmap: { vars: V4, minterms: [0, 1, 2, 3, 4, 6, 8, 9, 12], groups: 'minimal' }, caption: 'The same function grouped by its 1s: four quads, A′B′ + A′D′ + B′C′ + C′D′.' },
      { tip: 'Always try both. When the 0s are few or clump into large blocks, the POS is cheaper; when the 1s do, the SOP is. Equal cost is common too.' },
      { h: 'Recap' },
      { list: ['Group the 0s to get F′ as a sum of products.', 'De Morgan turns that into F as a product of sums: each group of 0s is one sum term.', 'In a sum term a variable appears plain where it is 0 across the group.', 'Compare the two forms and build the cheaper.'] },
      X('min-ex-pos-a'), X('min-ex-pos-b'), X('min-ex-pos-dc'), X('min-ex-k-maxterms'),
    ],
  });

  C.lesson({
    id: 'min-big', chapter: 'min-maps', title: 'Five and six variables', minutes: 8,
    summary: 'Five variables use two 4-variable maps side by side, six use four in a square. Cells at the same place in neighbouring maps are adjacent too, so a group can span maps.',
    blocks: [
      'A 5-variable function has 32 rows. Drawn as one flat map, some neighbours would have to be far apart, so instead it is drawn as two 16-cell maps: one for A = 0, one for A = 1. A cell has its four neighbours inside its own map, and a fifth: the cell at the same place in the other map.',
      { topic: 'kmap-5', input: { f: "B'D' + ACE + A'BC'E", layout: 'maps', m: 20 }, frame: 1, caption: 'Cell 20 (10100) and its five neighbours: four in the A = 1 map (one round the edge), and cell 4 at the same place in the A = 0 map.' },
      { predict: { q: 'A block of four cells appears at the same place in both maps. How many literals does the group of all eight have?', options: ['3', '2', '1'], answer: 1, explain: 'Four cells in one map fix A and two more variables: 3 literals. The same block in both maps frees A as well: eight cells, 2 literals. Here B′D′ is such a group.' } },
      { topic: 'kmap-5', input: { f: "B'D' + ACE + A'BC'E", layout: 'maps', m: 20 }, frame: 11, caption: 'F = B′D′ + ACE + A′BC′E. B′D′ is the same block in both maps, so A drops out of it. The fourth prime, A′C′D′E, is left out.' },
      { h: 'Six variables' },
      'Six variables use four maps arranged by AB in Gray order: 00 and 01 on top, 10 and 11 below. Maps beside each other or above each other differ in one of A, B, so a block may appear in two maps (dropping one of A, B) or in all four (dropping both).',
      { topic: 'kmap-6', input: { f: "B'E' + ACDF + A'C'DF'", m: 45 }, frame: 1, caption: 'Cell 45 (101101) has six neighbours: four in its own map and two at the same place in the maps beside and above it.' },
      { topic: 'kmap-6', input: { f: "B'E' + ACDF + A'C'DF'", m: 45 }, frame: 10, caption: 'F = B′E′ + A′C′DF′ + ACDF. B′E′ is a block of eight in each of the two maps with B = 0, sixteen cells in all; ACDF and A′C′DF′ each span two maps.' },
      { kmap: { vars: ['A', 'B', 'C', 'D', 'E'], minterms: [0, 2, 4, 6, 9, 13, 16, 18, 20, 22, 25, 29], groups: 'minimal' }, caption: 'A 5-variable function to read: B′E′ appears in both maps; BD′E is a pair in each. F = B′E′ + BD′E.' },
      { tip: 'Beyond six variables maps stop helping: the eye cannot find blocks across eight maps. That is where tabulation, the next chapter, takes over.' },
      { h: 'Recap' },
      { list: ['5 variables: two maps for A = 0 and A = 1; 6 variables: four maps in Gray order of AB.', 'Cells at the same place in neighbouring maps are adjacent.', 'A block repeated in two maps loses one variable; in all four, two.'] },
      X('min-ex-k5-a'), X('min-ex-k5-dc'), X('min-ex-k6'),
    ],
  });

  C.lesson({
    id: 'min-multi', chapter: 'min-maps', title: 'Several outputs, and variables in the cells', minutes: 9,
    summary: 'Outputs of the same inputs can share AND gates; a shared term need not be prime for each output alone. Map-entered variables fold one variable into the cells to halve the map.',
    blocks: [
      'A display decoder has seven outputs, an adder two. Minimising each output alone is not always cheapest: a product term both outputs can use costs one AND gate instead of two.',
      { topic: 'kmap-multi', input: { n: '4', f: 'Σm(2, 3, 7, 10, 11, 15)', g: 'Σm(4, 5, 7, 12, 13, 15)' }, frame: 1, caption: 'Alone: F = B′C + CD and G = BC′ + BD, four different AND gates. Where are both outputs 1?' },
      { predict: { q: 'F and G are both 1 only at cells 7 and 15. What product covers exactly those two cells?', options: ['BD', 'CD', 'BCD', 'ABCD'], answer: 2, explain: '7 = 0111 and 15 = 1111 differ only in A, so the pair is BCD.' } },
      { topic: 'kmap-multi', input: { n: '4', f: 'Σm(2, 3, 7, 10, 11, 15)', g: 'Σm(4, 5, 7, 12, 13, 15)' }, frame: 4, caption: 'Together: F = B′C + BCD and G = BC′ + BCD. BCD is smaller than CD or BD, but one gate now serves both outputs: 3 AND gates instead of 4.' },
      { warn: 'The shared term is often not a prime implicant of either output by itself. Multiple-output minimisation looks for primes of the products F·G as well as of F and G.' },
      { h: 'Map-entered variables' },
      'A 4-variable function can be drawn on a 3-variable map if each cell holds what F does with the last variable: 0, 1, D or D′. Group the 1s first, then the D cells (with the 1s as don\'t-cares) and the D′ cells, and AND each of those groups with its variable.',
      { topic: 'kmap-mev', input: { f: 'Σm(0, 3, 4, 5, 6, 7, 11, 13, 15)' }, frame: 1, caption: 'Eight cells of A, B, C, each holding 0, 1, D or D′ for its pair of rows.' },
      { topic: 'kmap-mev', input: { f: 'Σm(0, 3, 4, 5, 6, 7, 11, 13, 15)' }, frame: 5, caption: 'F = A′B + A′C′D′ + (B + C)D: the same function as the full map\'s A′B + BD + CD + A′C′D′, from a map half the size.' },
      { func: { vars: V4, minterms: [0, 3, 4, 5, 6, 7, 11, 13, 15] }, caption: 'The full function in the workbench: check its minimal SOP against the entered map\'s answer.' },
      { h: 'Recap' },
      { list: ['Each product term is an AND gate; terms shared between outputs are built once.', 'A shared term may be smaller than the primes of each output alone.', 'A map-entered variable halves the map: group the 1s, then each entered literal with the 1s as don\'t-cares.'] },
      X('min-ex-multi-circuit'), X('min-ex-multi-count'), X('min-ex-mev'),
    ],
  });

  // =========================================================================================================
  // Chapter 2: tabulation
  // =========================================================================================================
  C.lesson({
    id: 'min-qm-tab', chapter: 'min-qm', title: 'The Quine–McCluskey tabulation', minutes: 9,
    summary: 'List the minterms in binary, group them by their number of 1s, and merge every pair that differs in one bit, column after column. The terms never merged are the prime implicants.',
    blocks: [
      'A map relies on the eye. For a program, or for more than six variables, the same search is done by tabulation. It finds every prime implicant, and nothing else, by applying XY + XY′ = X systematically.',
      { steps: ['Write each minterm (and don\'t-care) in binary.', 'Group the rows by how many 1s they have. Only rows in neighbouring groups can differ in one bit.', 'Compare every row with every row of the next group. When two differ in exactly one bit, write the merged term with a dash in that place, and tick both.', 'Repeat on the new column: terms merge only if their dashes are in the same places.', 'When nothing merges any more, every unticked term is a prime implicant.'] },
      { topic: 'qm-tabulation', input: { fn: 'Σm(1, 4, 5, 6, 7, 9, 13, 14) + d(15)', n: '4', form: 'sop' }, frame: 1, caption: 'F = Σm(1, 4, 5, 6, 7, 9, 13, 14) + d(15), grouped by the number of 1s. The don\'t-care 15 joins the list: it may help terms merge.' },
      { predict: { q: '0101 (5) and 1101 (13) are in neighbouring groups. What do they merge into?', options: ['-101', '0-01', '01-1', 'They do not merge'], answer: 0, explain: 'They differ only in the first bit, A, so A becomes a dash: -101, the term BC′D.' } },
      { topic: 'qm-tabulation', input: { fn: 'Σm(1, 4, 5, 6, 7, 9, 13, 14) + d(15)', n: '4', form: 'sop' }, frame: 17, caption: 'Column 2 merging. -001 and -101 give --01, which is already in column 3: it is written once.' },
      { topic: 'qm-tabulation', input: { fn: 'Σm(1, 4, 5, 6, 7, 9, 13, 14) + d(15)', n: '4', form: 'sop' }, frame: 27, caption: 'Four prime implicants: A′B, BC, BD and C′D. The next step, the chart, picks a cover from them.' },
      { func: { vars: V4, minterms: [1, 4, 5, 6, 7, 9, 13, 14], dc: [15] }, caption: 'The same function in the workbench; its Tabulation tab shows these columns for any function you type.' },
      { tip: 'Only terms with dashes in the same places can merge, so comparing is quick: line up the dashes first, then count differing bits.' },
      { h: 'Recap' },
      { list: ['Group by number of 1s; merge neighbours that differ in one bit; tick what merged.', 'A term appears once even when two merges produce it.', 'Unticked terms are the prime implicants, don\'t-cares included in the merging.'] },
      X('min-ex-qm-primes'), X('min-ex-qm-primes-dc'), X('min-ex-qm-pos'),
    ],
  });

  C.lesson({
    id: 'min-qm-chart', chapter: 'min-qm', title: 'The chart, dominance and Petrick\'s method', minutes: 10,
    summary: 'The prime implicant chart has a row per prime and a column per minterm. Essential rows, dominated rows and dominating columns are removed in turn; if a cyclic core remains, Petrick\'s method lists every way to cover it.',
    blocks: [
      'The tabulation gives the candidates; the chart chooses among them. Each column must be covered by at least one chosen row, and we want the cheapest set of rows.',
      { steps: ['A column with a single X marks an essential row: take it, and delete every column it covers.', 'A row whose remaining Xs are all in another row that costs no more is dominated: delete it.', 'A column that has an X in every row where another column has one is covered whenever that other column is: delete the larger column.', 'Repeat. Rows that become the only cover of a column are secondary essentials.'] },
      { topic: 'qm-chart', input: { fn: 'Σm(3, 5, 7, 8, 10, 12, 13, 15)', n: '4', form: 'sop' }, frame: 3, caption: 'F = Σm(3, 5, 7, 8, 10, 12, 13, 15). Three essential rows are taken; only column 12 is left, with two rows that reach it.' },
      { predict: { q: 'P2 (ABC′) and P5 both cover minterm 12, and P5 covers nothing else that is left. Which is kept?', options: ['P5: it covers fewer cells', 'P2: it dominates P5 at no extra cost', 'Both'], answer: 1, explain: 'P5 is dominated: P2 covers everything P5 covers and has no more literals. Then P2 is the only cover of 12, a secondary essential.' } },
      { topic: 'qm-chart', input: { fn: 'Σm(3, 5, 7, 8, 10, 12, 13, 15)', n: '4', form: 'sop' }, frame: 6, caption: 'F = BD + ABC′ + AB′D′ + A′CD: three essentials and one secondary essential.' },
      { h: 'A cyclic chart' },
      'When no column has a single X and nothing dominates, the chart is **cyclic**. Petrick\'s method writes the condition "every column is covered" as a product of sums: for each column, the sum of the rows that cover it. Multiplying it out, with X + XY = X to drop supersets, lists every irredundant cover.',
      { topic: 'qm-petrick', input: { fn: 'Σm(0, 1, 4, 5, 6, 8, 9, 10, 13, 14)', n: '4' }, frame: 1, caption: 'After the essential C′D, six columns remain, each covered by two rows. P is the product of six sums.' },
      { topic: 'qm-petrick', input: { fn: 'Σm(0, 1, 4, 5, 6, 8, 9, 10, 13, 14)', n: '4' }, frame: 9, caption: 'Five ways to finish the cover survive. The cheapest add three primes to the essential C′D: F = B′C′ + C′D + A′BD′ + ACD′, and a second finish costs the same.' },
      { predict: { q: 'Petrick\'s product P = (P1 + P3)(P1 + P5). Which product of primes is a cover with the fewest rows?', options: ['P1', 'P3P5', 'P1P3P5'], answer: 0, explain: 'Multiplying out gives P1 + P1P5 + P1P3 + P3P5 = P1 + P3P5. P1 alone covers both columns.' } },
      { kmap: { vars: V4, minterms: [0, 1, 4, 5, 6, 8, 9, 10, 13, 14], groups: 'minimal' }, caption: 'The same answer on the map: the cyclic core is the ring of pairs around cells 0, 4, 6, 8, 10 and 14.' },
      { h: 'Recap' },
      { list: ['Essential rows first, then row dominance and column dominance, repeated.', 'A cyclic core has no essential and no dominance left.', 'Petrick\'s product of sums, multiplied out with absorption, lists every irredundant cover; pick the cheapest.'] },
      X('min-ex-qm-ess'), X('min-ex-qm-chart'), X('min-ex-qm-cover'), X('min-ex-petrick-count'),
    ],
  });

  // =========================================================================================================
  // Chapter 3: costs, gate forms and hazards
  // =========================================================================================================
  C.lesson({
    id: 'min-cost', chapter: 'min-impl', title: 'What a circuit costs', minutes: 7,
    summary: 'Literals, gates, gate inputs and levels measure different things. Two-level forms are fast; factored, multi-level forms are often smaller but slower.',
    blocks: [
      'Minimal means minimal by some measure. The usual ones are:',
      { table: [['Measure', 'What it counts', 'Stands for'], ['Literals', 'letters in the expression, complemented or not', 'wiring, and transistors in CMOS'], ['Gates', 'AND, OR and other gates (inverters on inputs often taken as free)', 'chip area or chip count'], ['Gate inputs', 'every input of every gate, the single-literal terms included', 'transistors: two per input in CMOS'], ['Levels', 'gates on the longest path from an input to the output', 'delay']], caption: 'Four ways to count the cost of the same function.' },
      { topic: 'cost-compare', input: { fn: 'AD + BD + CD + E', fac: '(A + B + C)D + E' }, frame: 2, caption: 'F = AD + BD + CD + E three ways. The factored form (A + B + C)D + E has the fewest gate inputs.' },
      { predict: { q: 'Which form of this F is fastest?', options: ['The SOP', 'The POS', 'The factored form'], answer: 0, explain: 'The SOP and the POS have two levels of gates; the factored form needs three, so its slowest path is longer.' } },
      { topic: 'cost-compare', input: { fn: 'AD + BD + CD + E', fac: '(A + B + C)D + E' }, frame: 3, caption: 'The cheapest circuit is not the fastest: factoring saves inputs and adds a level.' },
      { func: { expr: 'AD + BD + CD + E' }, caption: 'Its minimal SOP and POS in the workbench. The cost report there counts literals, gates, inputs and levels for every form.' },
      { tip: 'For a two-level circuit, a single-literal term needs no AND gate, but it still costs one input of the OR. Count gate inputs, not just literals, when comparing SOP with POS.' },
      { h: 'Recap' },
      { list: ['Literals, gates, gate inputs and levels are different costs.', 'SOP versus POS: build both, compare gate inputs.', 'Factoring trades levels (delay) for gates and inputs (area).'] },
      X('min-ex-cost-lits'), X('min-ex-cost-choice'), X('min-ex-cost-factor'), X('min-ex-levels'),
    ],
  });

  C.lesson({
    id: 'min-nand', chapter: 'min-impl', title: 'NAND-NAND, NOR-NOR and the inverting forms', minutes: 9,
    summary: 'An AND-OR circuit becomes NAND-NAND by putting two bubbles on every inner wire; an OR-AND circuit becomes NOR-NOR the same way. Of the sixteen two-level pairs of gates, eight give useful forms and eight collapse to a single gate.',
    blocks: [
      'In CMOS a NAND gate is smaller and faster than an AND, which is a NAND with an inverter after it. So the minimal SOP you found on the map is usually built from NANDs, and the minimal POS from NORs. The conversion is a drawing exercise.',
      { topic: 'nand-nand', input: { fn: 'Σm(0, 2, 5, 6, 7, 8, 10, 13, 14, 15)', n: '4', form: 'sop' }, frame: 2, caption: 'F = B′D′ + BD + BC, AND-OR. A bubble is put at both ends of each wire from an AND to the OR: two inversions cancel.' },
      { predict: { q: 'An OR gate with a bubble on every input computes what?', options: ['A NOR', 'A NAND', 'An AND'], answer: 1, explain: 'X′ + Y′ = (XY)′ by De Morgan: an OR with bubbled inputs is a NAND drawn another way.' } },
      { topic: 'nand-nand', input: { fn: 'Σm(0, 2, 5, 6, 7, 8, 10, 13, 14, 15)', n: '4', form: 'sop' }, frame: 3, caption: 'Every gate is now a NAND: F = ((B′D′)′(BD)′(BC)′)′. A term with a single literal would need its literal inverted, since it meets one bubble only.' },
      { circuit: 'nb = NOT(B)\nnd = NOT(D)\nt1 = NAND(nb, nd)\nt2 = NAND(B, D)\nt3 = NAND(B, C)\nF = NAND(t1, t2, t3)', outputs: ['F'], inputs: { B: 1, D: 1 }, caption: 'The NAND-NAND circuit. Click the inputs: F is 1 exactly when B and D agree, or when B and C are both 1.' },
      { h: 'NOR-NOR from the 0s' },
      'The dual holds for the POS: bubble both ends of each wire from an OR to the AND, and both levels become NORs.',
      { topic: 'nand-nand', input: { fn: 'Σm(0, 2, 5, 6, 7, 8, 10, 13, 14, 15)', n: '4', form: 'pos' }, frame: 3, caption: 'The same F from its 0s as NOR-NOR.' },
      { h: 'The sixteen two-level forms' },
      'Pick any of AND, OR, NAND, NOR for the first level and any for the second: sixteen pairs. With inputs A, B into one gate and C, D into the other, half of them collapse to one gate (they are **degenerate**); the other half implement an SOP or a complemented SOP.',
      { table: [['Form', 'Computes', 'Kind'], ['AND-OR, NAND-NAND, OR-NAND, NOR-OR', 'a sum of products (OR-NAND and NOR-OR on complemented inputs)', 'non-degenerate'], ['OR-AND, NOR-NOR', 'a product of sums', 'non-degenerate'], ['AND-NOR, NAND-AND', '(AB + CD)′: AND-OR-INVERT', 'non-degenerate'], ['AND-AND, AND-NAND, OR-OR, OR-NOR', 'one wide AND, NAND, OR or NOR', 'degenerate'], ['NAND-OR, NOR-AND, NAND-NOR, NOR-NAND', '(ABCD)′, (A + B + C + D)′, ABCD, A + B + C + D', 'degenerate']], caption: 'Checked by the prover: for example ((A + B)′)((C + D)′) = (A + B + C + D)′, a NOR-AND is just a 4-input NOR.' },
      { topic: 'aoi-oai', input: { fn: 'Σm(0, 1, 2, 4, 6)', n: '3', kind: 'aoi' }, frame: 2, caption: 'F = Σm(0, 1, 2, 4, 6) as AND-OR-INVERT: F′ = AC + BC from the 0s, then F = (AC + BC)′, one complex gate in CMOS.' },
      { topic: 'aoi-oai', input: { fn: 'Σm(0, 1, 2, 4, 6)', n: '3', kind: 'oai' }, frame: 2, caption: 'The same F as OR-AND-INVERT: F = (C(A + B))′.' },
      { h: 'Recap' },
      { list: ['SOP → NAND-NAND; POS → NOR-NOR: bubble both ends of each inner wire.', 'A single-literal term meets one bubble: feed its complement.', 'AND-NOR and NAND-AND give AND-OR-INVERT; OR-NAND and NOR-OR give OR-AND-INVERT; eight pairs collapse to one gate.'] },
      X('min-ex-nand-single'), X('min-ex-nand2'), X('min-ex-nor2'), X('min-ex-nand-min'), X('min-ex-aoi'), X('min-ex-oai'), X('min-ex-degenerate'), LAB('min-lab-nand'), X('min-ex-lab-nand'),
    ],
  });

  C.lesson({
    id: 'min-bubble', chapter: 'min-impl', title: 'Multi-level NAND and NOR by bubble pushing', minutes: 8,
    summary: 'Any circuit of AND and OR gates becomes NAND-only (or NOR-only): replace each gate, then cancel bubbles in pairs along each wire. A bubble left alone needs an inverter or a complemented input.',
    blocks: [
      'Factored forms have three or more levels, and the NAND-NAND trick of the last lesson needs a little more care: AND and OR gates alternate, but not always, and inputs enter at different levels.',
      { steps: ['Draw the circuit from AND and OR gates.', 'Turn every AND into a NAND (bubble at its output), and every OR into a NAND drawn as an OR with bubbles on its inputs.', 'Walk each wire: two bubbles on one wire cancel.', 'A bubble that meets an input variable is absorbed by complementing that input.', 'A bubble left alone anywhere else needs an inverter (a NAND with its inputs tied).'] },
      { topic: 'bubble-push', input: { expr: "(AB + C)(D' + E)", to: 'NAND' }, frame: 5, caption: '(AB + C)(D′ + E) to NAND. The bubbles on the line from AB cancel; input C meets a lone bubble, so C′ is fed instead.' },
      { predict: { q: 'The output gate is an AND, turned into a NAND. Its output bubble has nothing to cancel against. What is needed?', options: ['Nothing', 'An inverter at the output', 'Complement every input'], answer: 1, explain: 'The circuit ends on a bubble; one more NAND with its inputs tied puts the inversion right.' } },
      { topic: 'bubble-push', input: { expr: "(AB + C)(D' + E)", to: 'NAND' }, frame: 12, caption: 'Five NAND gates, one of them an inverter, and complemented inputs where single bubbles met variables.' },
      { topic: 'bubble-push', input: { expr: "(AB + C)(D' + E)", to: 'NOR' }, frame: 11, caption: 'The same expression to NOR gates. The output AND becomes a NOR drawn with bubbles on its inputs, so no bubble is left at the output and no inverter is needed there.' },
      { circuit: 'n1 = NAND(D, E)\nn2 = NAND(C, n1)\nn3 = NAND(A, B)\nF = NAND(n2, n3)', outputs: ['F'], inputs: { C: 1 }, caption: 'F = AB + C(D′ + E′) in four NANDs: D′ + E′ is exactly NAND(D, E). Try rows with C = 1 and D = E = 1.' },
      { h: 'Mixed notation' },
      'Drawing each NAND as either an AND-with-output-bubble or an OR-with-input-bubbles, so that bubbles meet bubbles, makes a NAND circuit as easy to read as the AND-OR original. This is the same De Morgan picture as in part 2, now used as a design tool.',
      { h: 'Recap' },
      { list: ['Replace every gate, then cancel bubbles in pairs.', 'Lone bubbles at inputs become complemented inputs; elsewhere, inverters.', 'Draw NANDs in the shape whose bubbles line up: the circuit then reads as AND-OR.'] },
      X('min-ex-bubble'), X('min-ex-bubble-nor'),
    ],
  });

  C.lesson({
    id: 'min-xor', chapter: 'min-impl', title: 'When XOR beats the map', minutes: 6,
    summary: 'Parity-like functions have a checkerboard map with no groups larger than one cell. Written with XOR, in the Reed–Muller (ring-sum) form, they are tiny.',
    blocks: [
      'Some maps defeat grouping entirely. In the map of A ⊕ B ⊕ C ⊕ D no two 1s are adjacent, so the minimal SOP is all eight minterms, 32 literals. The XOR form has four.',
      { kmap: { vars: V4, minterms: [1, 2, 4, 7, 8, 11, 13, 14], groups: 'minimal' }, caption: 'The checkerboard of odd parity: every 1 is a group of its own.' },
      { predict: { q: 'The 1s of a map alternate like a checkerboard in one 2 × 2 block and are 0 elsewhere. What hint does that give?', options: ['Use POS', 'An XOR of the two changing variables is involved', 'Add don\'t-cares'], answer: 1, explain: 'A checkerboard means flipping either variable flips F: that is exactly what XOR does.' } },
      { h: 'The Reed–Muller form' },
      'Every function can be written as an XOR of products of uncomplemented variables, uniquely. The transform folds the truth table one variable at a time, XORing each row into its partner.',
      { topic: 'reed-muller', input: { fn: 'Σm(3, 7, 11, 12, 13, 14)', n: '4' }, frame: 5, caption: 'F = Σm(3, 7, 11, 12, 13, 14) folds down to two products: F = AB ⊕ CD.' },
      { topic: 'reed-muller', input: { fn: 'Σm(3, 7, 11, 12, 13, 14)', n: '4' }, frame: 6, caption: 'The minimal SOP of the same function needs 12 literals: ABC′ + ABD′ + A′CD + B′CD.' },
      { func: { expr: "AB ^ CD" }, caption: 'Type the XOR form into the workbench and compare its minimal SOP and POS.' },
      { h: 'Recap' },
      { list: ['Checkerboards on the map mean XOR.', 'The Reed–Muller form is an XOR of positive products, unique for each function.', 'For parity-like functions it is far smaller than any SOP.'] },
      X('min-ex-xor-choice'), X('min-ex-rm'), X('min-ex-xor-circuit'),
    ],
  });

  C.lesson({
    id: 'min-hazards', chapter: 'min-impl', title: 'Static hazards read off the map', minutes: 9,
    summary: 'When one input changes between two adjacent 1s held by different groups, the output can dip to 0 for a moment: a static-1 hazard. The consensus term that covers both cells removes it.',
    blocks: [
      'A minimal SOP is correct on every row of the truth table, and yet on a real circuit its output can glitch when an input changes. The table assumes the inputs and gates settle at once; real gates take time.',
      { topic: 'hazard-static', input: { n: '4', f: "A'C' + BD + ACD'" }, frame: 1, caption: 'F = A′C′ + BD + ACD′, a minimal SOP. Cells 14 (1110) and 15 (1111) are both 1 and adjacent, but held by different groups.' },
      { predict: { q: 'A = B = C = 1, and D goes from 1 to 0. F should stay 1. Which gate holds F at 1 before and after?', options: ['BD before, ACD′ after', 'ACD′ before, BD after', 'A′C′ throughout'], answer: 0, explain: 'At 1111, BD = 1; at 1110, ACD′ = 1. The handover depends on the inverter on D, which is slow.' } },
      { topic: 'hazard-static', input: { n: '4', f: "A'C' + BD + ACD'" }, frame: 3, caption: 'The glitch: BD turns off at once, ACD′ waits for the inverter on D, and F dips to 0 for 9 ns.' },
      { def: 'Static-1 hazard', text: 'an input change between two rows where F = 1 during which the output can briefly go to 0. In a two-level SOP it happens exactly when the two cells are adjacent and no single term covers both.' },
      { topic: 'hazard-static', input: { n: '4', f: "A'C' + BD + ACD'" }, frame: 5, caption: 'Adding ABC, the consensus of BD and ACD′, keeps F at 1 while the others hand over. One more term buys a clean output.' },
      { kmap: { vars: V4, minterms: [0, 1, 4, 5, 7, 10, 13, 14, 15], groups: ["A'C'", 'BD', "ACD'", 'ABC'] }, caption: 'The hazard-free cover: every pair of adjacent 1s now lies inside one group. ABC is redundant for the function, needed for the timing.' },
      { h: 'Static-0 hazards in POS' },
      'The dual holds for a product of sums: two adjacent 0s held by different sum terms give a static-0 hazard, a brief 1, and the consensus sum term removes it. For F = (A + B′)(A′ + C), cells 2 and 6 are both 0 and adjacent; adding (B′ + C) fixes it.',
      { kmap: { vars: V3, minterms: [0, 1, 5, 7], form: 'pos', groups: ["(A + B')", "(A' + C)", "(B' + C)"] }, caption: 'F = (A + B′)(A′ + C)(B′ + C): the third sum term bridges the 0s at 2 and 6.' },
      { tip: 'The rule to remember: for SOP, every pair of adjacent 1s must share a group; for POS, every pair of adjacent 0s. The timing chapter shows the same glitch on a waveform.' },
      { h: 'Recap' },
      { list: ['A static-1 hazard in SOP: adjacent 1s in different groups.', 'Fix it with the consensus term covering both cells.', 'Static-0 hazards in POS are the dual, fixed by a consensus sum term.', 'Hazard-free covers are usually not minimal.'] },
      X('min-ex-haz-find'), X('min-ex-haz-map'), X('min-ex-haz-map-fix'), X('min-ex-haz-count'), X('min-ex-haz-free'), X('min-ex-haz-pos'),
    ],
  });

  // ---- a guided tour -------------------------------------------------------------------------------------------
  C.tour({
    id: 'min-tour', title: 'Tour: minimisation', blurb: 'From a K-map to a glitch-free NAND circuit, in eight steps.',
    steps: [
      { route: 'part=minimise', target: '#main', text: 'Part 3 of the catalogue: minimisation. Each card runs one method on a function you choose and explains it step by step.' },
      { route: 'topic=kmap-gray', target: '#stageWrap', text: 'Why the map is in Gray order: watch it roll into a torus, where every cell has one neighbour per variable.' },
      { target: '#btnPlay', text: 'Play steps through; the arrow keys go one step at a time, forwards or back.' },
      { route: 'topic=kmap-primes', target: '#inputs', text: 'Type your own function here, as Σm(…) or an expression, and the map finds its prime and essential implicants.' },
      { route: 'topic=qm-tabulation', target: '#stageWrap', text: 'The same search by tabulation: columns of merged terms, ticks for what merged, and the primes left over.' },
      { route: 'func', target: '#main', text: 'The function workbench: any function as a table, lists, an expression and a map. Circle groups yourself and press Check my cover.' },
      { route: 'topic=hazard-static', target: '#stageWrap', text: 'A minimal cover can glitch. Here the dip appears on the waveform, and the consensus term removes it.' },
      { route: 'learn', target: '[data-chapter="min-maps"]', text: 'The lessons and exercises of this part start here: maps you circle, tables you fill in, circuits you build, each checked at once.' },
    ],
  });

  // ---- a course through every topic of the part -----------------------------------------------------------------
  C.course({
    id: 'min-course', title: 'Minimisation, start to finish', blurb: 'An ordered path through every topic of part 3, from Gray order to hazards, with lessons and exercises on the way.',
    steps: [
      { topic: 'kmap-gray', note: 'Gray order and the torus.' },
      { topic: 'kmap-build', note: 'Rows of the table into cells of the map.' },
      { exercise: 'min-ex-neighbours', note: 'Name the neighbours of a cell.' },
      { topic: 'kmap-rules', note: 'Which circles are groups, and which are prime.' },
      { topic: 'kmap-primes', note: 'Every prime, then the essential ones.' },
      { lesson: 'min-primes', note: 'Why the biggest group may not be needed.' },
      { topic: 'kmap-select', note: 'Covering what the essentials leave.' },
      { topic: 'kmap-cyclic', note: 'No essential prime: one choice settles the rest.' },
      { exercise: 'min-ex-cyc4', note: 'A cyclic map of your own to cover.' },
      { topic: 'kmap-dc', note: 'Don\'t-cares, used only when they help.' },
      { topic: 'kmap-pos', note: 'Group the 0s, apply De Morgan.' },
      { exercise: 'min-ex-pos-b', note: 'A product of sums cheaper than the sum.' },
      { topic: 'kmap-5', note: 'Two maps for five variables.' },
      { topic: 'kmap-6', note: 'Four maps for six.' },
      { topic: 'kmap-multi', note: 'Shared terms between outputs.' },
      { topic: 'kmap-mev', note: 'Variables written into the cells.' },
      { topic: 'qm-tabulation', note: 'Merging columns by count of 1s.' },
      { topic: 'qm-chart', note: 'Essential rows, dominance, secondary essentials.' },
      { topic: 'qm-petrick', note: 'Every cover of a cyclic core.' },
      { lesson: 'min-qm-chart', note: 'The chart and Petrick\'s method together.' },
      { exercise: 'min-ex-qm-cover', note: 'A cover from a cyclic chart.' },
      { topic: 'cost-compare', note: 'Literals, gates, inputs and levels.' },
      { topic: 'nand-nand', note: 'SOP to NAND-NAND, POS to NOR-NOR.' },
      { topic: 'aoi-oai', note: 'AND-OR-INVERT and OR-AND-INVERT.' },
      { topic: 'bubble-push', note: 'Many levels to NAND or NOR.' },
      { exercise: 'min-ex-nand2', note: 'Build a minimal SOP from NANDs only.' },
      { topic: 'reed-muller', note: 'XOR forms for parity-like functions.' },
      { topic: 'hazard-static', note: 'The glitch and the consensus fix.' },
      { lesson: 'min-hazards', note: 'Static-1 and static-0 hazards on the map.' },
      { exercise: 'min-ex-haz-free', note: 'A cover with no static hazard.' },
    ],
  });

  // ---- what the diagram checker looks at on these pages -------------------------------------------------------
  if (S.Checks && !S.Checks.some((c) => c.name === 'lesson min-gray')) {
    const lessonReady = "document.querySelector('#lessonView')", exReady = "document.querySelector('#exerciseView')";
    for (const id of C.chapters.filter((c) => c.part === 'minimise').flatMap((c) => c.lessons)) S.Checks.push({ group: 'learn', name: 'lesson ' + id, hash: 'lesson=' + id, ready: lessonReady, sel: '#main' });
    for (const id of ['min-ex-k2', 'min-ex-k4-ess', 'min-ex-cyc4', 'min-ex-pos-b', 'min-ex-k5-dc', 'min-ex-k6', 'min-ex-qm-primes', 'min-ex-qm-chart', 'min-ex-multi-circuit', 'min-ex-nand2', 'min-ex-aoi', 'min-ex-rm', 'min-ex-haz-free', 'min-ex-haz-map-fix', 'min-ex-lab-nand'])
      S.Checks.push({ group: 'learn', name: 'exercise ' + id, hash: 'exercise=' + id, ready: exReady, sel: '#main' });
    S.Checks.push({ group: 'learn', name: 'lab min-lab-nand', hash: 'lab=min-lab-nand', ready: "document.querySelector('#labExp')", sel: '#main' });
    S.Checks.push({ group: 'learn', name: 'course min-course', hash: 'course=min-course', ready: "document.querySelector('#courseView')", sel: '#main' });
  }
})(globalThis.Sirkit = globalThis.Sirkit || {});
