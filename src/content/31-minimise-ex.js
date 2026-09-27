// Part 3, gate-level minimisation: the exercises and the bench lab. The chapters, lessons, tour and course are in
// 30-minimise.js. Every function and number here is our own; each answer is checked by the engines.
(function (S) {
  'use strict';
  const C = S.Content;
  if (!C || C.exercises.has('min-ex-k2')) return;
  const ex = (o) => C.exercise(o);
  const V2 = ['A', 'B'], V3 = ['A', 'B', 'C'], V4 = ['A', 'B', 'C', 'D'], V5 = ['A', 'B', 'C', 'D', 'E'], V6 = ['A', 'B', 'C', 'D', 'E', 'F'];
  const MAPS = 'min-maps', QM = 'min-qm', IMPL = 'min-impl';

  /**
   * An answer check for "a cover with no static hazard": the expression must give F on every row (don't-cares
   * free), be written as a sum of products (or a product of sums), leave no pair of adjacent 1s (0s) without a
   * term that covers both, and use no more literals than the cheapest hazard-free cover.
   */
  const hazardFree = (spec, form) => (text) => {
    const B = S.Bool, K = S.Check;
    const val = K.kinds.simplify.check(Object.assign({}, spec, { form }), text);
    if (!val.ok) return val.message;
    const fn = K.fnOf(spec), e = B.parse(text), pos = form === 'pos';
    const terms = e.op === (pos ? 'and' : 'or') ? e.args : [e];
    const cubes = terms.map((t) => B.termCube(t, fn.vars, form)).filter((c) => c && c !== 'empty');
    const hz = B.staticHazards(fn, cubes, form).hazards;
    if (hz.length) {
      const h = hz[0], n = fn.vars.length;
      return 'It gives F on every row, but it still has ' + (hz.length === 1 ? 'a static-' : hz.length + ' static-') + (pos ? '0' : '1') + ' hazard' + (hz.length === 1 ? '' : 's') + ': between ' + B.bits(h.from, n) + ' and ' + B.bits(h.to, n) + ' (' + h.var + ' changes) F stays ' + (pos ? '0' : '1') + ', but no single term holds both cells. Add ' + h.fix.text + '.';
    }
    const best = B.hazardFree(fn, form).cost.literals, lits = B.literals(e);
    if (lits > best) return 'It has no static hazard, but it uses ' + lits + ' literals; a hazard-free cover needs only ' + best + '.';
    return { ok: true };
  };

  // ===========================================================================================================
  // Chapter 1: Karnaugh maps
  // ===========================================================================================================
  ex({
    id: 'min-ex-neighbours', chapter: MAPS, title: 'The neighbours of a cell', level: 1, kind: 'set', answer: '{5, 9, 12, 15}',
    text: ['On a 4-variable map (AB down the side, CD across the top), which cells are adjacent to cell 13? Give them as a set, like {1, 2, 3, 4}.'],
    hints: ['13 is 1101 in binary. Adjacent cells differ from it in exactly one bit.', 'Flip each of the four bits in turn: one neighbour for each variable.', 'D: 1100 = 12; C: 1111 = 15; B: 1001 = 9; A: 0101 = 5. So {5, 9, 12, 15}.'],
    solution: '{5, 9, 12, 15}', wrong: ['{12, 14, 9, 5}', '{5, 9, 12}', '{12, 14, 15, 9}'],
    why: 'Cell 14 sits beside 13 when the columns are counted in binary, but 1101 and 1110 differ in two bits: in Gray order 14 is two columns away.',
  });
  ex({
    id: 'min-ex-k2', chapter: MAPS, title: 'A two-variable map', level: 1, kind: 'kmap', vars: V2, minterms: [0, 2, 3], form: 'sop',
    text: ['Circle a minimal sum of products for F = Σm(0, 2, 3) on the 2-variable map.'],
    hints: ['The only 0 is cell 1 (A = 0, B = 1).', 'Cells 2 and 3 share A = 1; cells 0 and 2 share B = 0. Overlapping is allowed.', 'Two pairs: A (cells 2, 3) and B′ (cells 0, 2). F = A + B′.'],
    solution: ['A', "B'"], wrong: [['A'], ['A', "A'B'"], ['AB', "B'"]],
  });
  ex({
    id: 'min-ex-k3-pair', chapter: MAPS, title: 'A quad and a pair', level: 1, kind: 'kmap', vars: V3, minterms: [1, 3, 4, 5, 7], form: 'sop',
    text: ['Circle a minimal sum of products for F = Σm(1, 3, 4, 5, 7).'],
    hints: ['Cells 1, 3, 5 and 7 all have C = 1: a quad.', 'Cell 4 (100) is left. Its neighbours that are 1: cell 5.', 'F = C + AB′: the quad C and the pair 4, 5.'],
    solution: ['C', "AB'"], wrong: [["A'C", 'AC', "AB'"], ['C'], ['C', 'AB']],
  });
  ex({
    id: 'min-ex-k3-wrap', chapter: MAPS, title: 'Round the edge', level: 1, kind: 'kmap', vars: V3, minterms: [0, 2, 4, 5, 6], form: 'sop',
    text: ['Circle a minimal sum of products for F = Σm(0, 2, 4, 5, 6). Some groups wrap round the edges of the map.'],
    hints: ['Cells 0, 2, 4 and 6 have C = 0. On the map they are the first and last columns.', 'The first and last columns are neighbours: together they are one quad. Cell 5 is left.', 'F = C′ + AB′: the wrapping quad and the pair 4, 5.'],
    solution: ["C'", "AB'"], wrong: [["A'C'", "AC'", "AB'"], ["C'", 'AB'], ["C'"]],
  });
  ex({
    id: 'min-ex-k4-quads', chapter: MAPS, title: 'Corners and a column', level: 1, kind: 'kmap', vars: V4, minterms: [0, 2, 3, 7, 8, 10, 11, 15], form: 'sop',
    text: ['Circle a minimal sum of products for F = Σm(0, 2, 3, 7, 8, 10, 11, 15).'],
    hints: ['Look at the four corners: 0, 2, 8 and 10.', 'Cells 3, 7, 11 and 15 make the column CD = 11.', 'F = B′D′ + CD. The quad B′C (2, 3, 10, 11) is a prime too, but not needed.'],
    solution: ["B'D'", 'CD'], wrong: [["B'D'", 'CD', "B'C"], ["A'B'D'", "AB'D'", 'CD'], ["B'D'", 'C']],
  });
  ex({
    id: 'min-ex-k-expr', chapter: MAPS, title: 'Map an expression', level: 1, kind: 'kmap', vars: V4, expr: "A'BC + ABC + A'B'C'D + AB'C'D + BCD'", form: 'sop',
    text: ['Put F = A′BC + ABC + A′B′C′D + AB′C′D + BCD′ on a map and circle a minimal sum of products.'],
    hints: ['A′BC and ABC differ only in A; so do A′B′C′D and AB′C′D.', 'Mark the cells: 6, 7, 14, 15 from the first two terms, 1 and 9 from the next two, and 6, 14 again from BCD′.', 'F = BC + B′C′D.'],
    solution: ['BC', "B'C'D"], wrong: [['BC', "A'B'C'D", "AB'C'D"], ['BC'], ['C', "B'C'D"]],
  });
  ex({
    id: 'min-ex-rules', chapter: MAPS, title: 'Which circles are groups?', level: 1, kind: 'choice', options: ['0, 2, 8, 10 (the four corners)', '5, 7, 13, 15', '0, 1, 2', '1, 5', '2, 7', '8, 10, 12, 14'], answer: [0, 1, 3],
    text: ['F = Σm(0, 1, 2, 5, 7, 8, 10, 13, 15) on a 4-variable map. Which of these circles are valid groups? Choose all that are.', { kmap: { vars: V4, minterms: [0, 1, 2, 5, 7, 8, 10, 13, 15] }, caption: 'The map of F, without groups.' }],
    hints: ['A group needs a power of two cells, a rectangle on the torus, and only 1s.', '0, 1, 2 is three cells; 2 and 7 differ in two bits; 12 and 14 are 0s.', 'Valid: the corners (B′D′), the quad BD (5, 7, 13, 15), and the pair 1, 5 (A′C′D).'],
    solution: [0, 1, 3], wrong: [[0, 1], [0, 1, 2, 3], [5]],
  });
  ex({
    id: 'min-ex-ess-count', chapter: MAPS, title: 'Count the essential primes', level: 2, kind: 'number', answer: 1, higherLower: true, why: 'Cell 7 has only one prime through it; every other 1 has a choice.',
    text: ['F = Σm(0, 4, 5, 7, 8, 9, 13, 15). It has six prime implicants. How many of them are essential?'],
    hints: ['The primes are BD, A′BC′, AB′C′, A′C′D′, AC′D and B′C′D′.', 'Look for a 1 that lies in only one prime. Cell 7 (0111): only BD reaches it.', 'Every other 1 lies in two primes, so only BD is essential: 1.'],
    solution: 1, wrong: [6, 3],
  });
  ex({
    id: 'min-ex-k4-ess', chapter: MAPS, title: 'Three essentials', level: 2, kind: 'kmap', vars: V4, minterms: [0, 4, 5, 8, 12, 13, 15], form: 'sop',
    text: ['Circle a minimal sum of products for F = Σm(0, 4, 5, 8, 12, 13, 15).'],
    hints: ['Cells 4, 5, 12, 13 make a quad; so do 0, 4, 8, 12 (the first column).', 'Cell 15 has only one neighbour that is 1: cell 13.', 'F = BC′ + C′D′ + ABD: every prime is essential.'],
    solution: ["BC'", "C'D'", 'ABD'], wrong: [["BC'", "C'D'", 'BD'], ["BC'", "C'D'"], ["A'C'D'", "BC'", "AC'D'", 'ABD']],
  });
  ex({
    id: 'min-ex-k4-tempt', chapter: MAPS, title: 'The tempting quad', level: 2, kind: 'kmap', vars: V4, minterms: [2, 4, 5, 6, 10, 12, 13, 14], form: 'sop',
    text: ['Circle a minimal sum of products for F = Σm(2, 4, 5, 6, 10, 12, 13, 14). Beware of a large group that is not needed.'],
    hints: ['There are three quads: BC′ (4, 5, 12, 13), BD′ (4, 6, 12, 14) and CD′ (2, 6, 10, 14).', 'Cell 5 lies only in BC′, cell 2 only in CD′: both are essential.', 'Together they cover every 1, so BD′ is redundant: F = BC′ + CD′.'],
    solution: ["BC'", "CD'"], wrong: [["BD'", "BC'", "CD'"], ["BD'", "CD'"], ["BD'", "BC'"]],
  });
  ex({
    id: 'min-ex-k4-select', chapter: MAPS, title: 'One essential, then a choice', level: 2, kind: 'kmap', vars: V4, minterms: [0, 4, 5, 7, 8, 9, 13, 15], form: 'sop',
    text: ['Circle a minimal sum of products for F = Σm(0, 4, 5, 7, 8, 9, 13, 15).'],
    hints: ['BD (5, 7, 13, 15) is the only prime reaching cell 7: essential.', 'Left: 0, 4, 8 and 9. Each pair choice covers two of them; find two pairs that cover all four.', 'A′C′D′ (0, 4) and AB′C′ (8, 9): F = BD + AB′C′ + A′C′D′.'],
    solution: ['BD', "AB'C'", "A'C'D'"], wrong: [['BD', "B'C'D'", "A'BC'", "AC'D"], ['BD', "C'"], ['BD', "AB'C'"]],
  });
  ex({
    id: 'min-ex-cyc3', chapter: MAPS, title: 'A ring of six', level: 2, kind: 'kmap', vars: V3, minterms: [1, 2, 3, 4, 5, 6], form: 'sop',
    text: ['F = Σm(1, 2, 3, 4, 5, 6) is 1 unless all three inputs are equal. Circle a minimal sum of products.'],
    hints: ['Every 1 lies in exactly two pairs, and no quad fits: the map is cyclic.', 'Pick one pair, say AB′ (4, 5); the cells it leaves force the next choices.', 'F = AB′ + A′C + BC′ (or the other ring: A′B + AC′ + B′C). Both have 6 literals.'],
    solution: ["AB'", "A'C", "BC'"], wrong: [["A'B", "AB'", "A'C", "AC'", "B'C", "BC'"], ["A'B", "AB'"], ["B'C", "BC'", 'A']],
    why: 'Starting from any other pair gives the other ring, which costs the same.',
  });
  ex({
    id: 'min-ex-cyc4', chapter: MAPS, title: 'A cyclic 4-variable map', level: 3, kind: 'kmap', vars: V4, minterms: [0, 1, 5, 7, 8, 10, 14, 15], form: 'sop',
    text: ['Circle a minimal sum of products for F = Σm(0, 1, 5, 7, 8, 10, 14, 15). No prime implicant is essential.'],
    hints: ['Every 1 has exactly two neighbours that are 1, and no quad fits: eight pairs in a ring.', 'Choose one pair, then keep choosing pairs that cover two new cells each.', 'F = A′B′C′ + A′BD + ABC + AB′D′ (or the other half of the ring: A′C′D + BCD + ACD′ + B′C′D′).'],
    solution: ["A'B'C'", 'ABC', "A'BD", "AB'D'"], wrong: [["A'B'C'", 'ABC', "A'BD", "AB'D'", "A'C'D", "ACD'", "B'C'D'", 'BCD'], ["A'B'C'", 'ABC', "A'BD"], ["A'B'C'", "A'C'D", "A'BD", "AB'D'", 'ABC']],
  });
  ex({
    id: 'min-ex-dc-bcd', chapter: MAPS, title: 'Perfect squares among the digits', level: 2, kind: 'kmap', vars: V4, minterms: [1, 4, 9], dc: [10, 11, 12, 13, 14, 15], form: 'sop',
    text: ['ABCD holds one BCD digit (A the most significant bit). Q = 1 when the digit is 1, 4 or 9, the non-zero perfect squares. Codes 1010 to 1111 never occur. Circle a minimal sum of products.'],
    hints: ['The 1s are cells 1, 4 and 9; cells 10 to 15 are don\'t-cares.', 'Cell 4 pairs with the don\'t-care 12; cells 1 and 9 are neighbours.', 'Q = B′C′D (1, 9) + BC′D′ (4, 12). AD is a prime too, but cells 1 and 9 are already covered.'],
    solution: ["B'C'D", "BC'D'"], wrong: [["A'B'C'D", "A'BC'D'", "AB'C'D"], ["B'C'D", "BC'D'", 'AD'], ["C'"]],
  });
  ex({
    id: 'min-ex-dc-b', chapter: MAPS, title: 'Two don\'t-cares', level: 2, kind: 'kmap', vars: V4, minterms: [2, 6, 7, 8, 9, 13, 15], dc: [3, 10], form: 'sop',
    text: ['Circle a minimal sum of products for F = Σm(2, 6, 7, 8, 9, 13, 15) + d(3, 10).'],
    hints: ['With 3 taken as 1, cells 2, 3, 6 and 7 make the quad A′C.', 'Cells 8, 9 make a pair, and 13, 15 another.', 'F = A′C + AB′C′ + ABD. The don\'t-care 10 is left as 0.'],
    solution: ["A'C", "AB'C'", 'ABD'], wrong: [["A'C", "AB'C'", 'ABD', 'BCD'], ["A'C", "AB'C'"], ["A'C", 'AD']],
  });
  ex({
    id: 'min-ex-dc-c', chapter: MAPS, title: 'Don\'t-cares fill the gaps', level: 1, kind: 'kmap', vars: V4, minterms: [1, 4, 6, 9, 14], dc: [0, 3, 11, 12], form: 'sop',
    text: ['Circle a minimal sum of products for F = Σm(1, 4, 6, 9, 14) + d(0, 3, 11, 12).'],
    hints: ['Cells 1, 9 and the don\'t-cares 3, 11 make a quad.', 'Cells 4, 6, 14 and the don\'t-care 12 make another.', 'F = B′D + BD′. The don\'t-care 0 is not needed.'],
    solution: ["B'D", "BD'"], wrong: [["B'D", "BD'", "A'B'C'"], ["B'D"], ['D', "BD'"]],
  });
  ex({
    id: 'min-ex-pos-a', chapter: MAPS, title: 'Group the 0s', level: 1, kind: 'kmap', vars: V4, minterms: [1, 5, 6, 7, 9, 13, 14, 15], form: 'pos',
    text: ['F = Σm(1, 5, 6, 7, 9, 13, 14, 15). Circle the 0s and give a minimal product of sums.'],
    hints: ['The 0s are 0, 2, 3, 4, 8, 10, 11, 12.', 'Cells 2, 3, 10, 11 have B = 0 and C = 1; cells 0, 4, 8, 12 have C = 0 and D = 0.', 'F = (B + C′)(C + D).'],
    solution: ["(B + C')", '(C + D)'], wrong: [["(B + C')"], ['(B + C)', '(C + D)'], ["(B + C')", '(C + D)', '(B + D)']],
  });
  ex({
    id: 'min-ex-pos-b', chapter: MAPS, title: 'When POS is cheaper', level: 2, kind: 'kmap', vars: V4, minterms: [0, 1, 2, 3, 4, 5, 8, 10, 12, 13], form: 'pos',
    text: ['F = Σm(0, 1, 2, 3, 4, 5, 8, 10, 12, 13). Its minimal SOP has three terms and 6 literals. Circle the 0s and find a minimal product of sums.'],
    hints: ['The 0s are 6, 7, 9, 11, 14, 15: only six of them.', 'Cells 6, 7, 14, 15 have B = 1, C = 1: the sum B′ + C′. Cells 9 and 11 are left.', 'F = (B′ + C′)(A′ + B + D′): 5 literals.'],
    solution: ["(B' + C')", "(A' + B + D')"], wrong: [["(B' + C')"], ["(B' + C')", "(A' + D')"], ["(B' + C')", "(A' + B + D')", "(A' + C' + D')"]],
  });
  ex({
    id: 'min-ex-pos-dc', chapter: MAPS, title: 'Product of sums with don\'t-cares', level: 3, kind: 'kmap', vars: V4, minterms: [0, 1, 2, 8, 9], dc: [5, 10, 13], form: 'pos',
    text: ['F = Σm(0, 1, 2, 8, 9) + d(5, 10, 13). Circle the 0s (with don\'t-cares that help) and give a minimal product of sums. Write each group as a sum term or as a cube like -1--.'],
    hints: ['The 0s are 3, 4, 6, 7, 11, 12, 14, 15.', 'With the don\'t-cares 5 and 13, every cell with B = 1 is a 0 or a don\'t-care: one group of eight.', 'The octet B = 1 gives the sum term B′; cells 3, 7, 11, 15 give C′ + D′. F = B′(C′ + D′).'],
    solution: ['-1--', '--11'], wrong: [['-1--'], ['01--', '11--', '--11'], ['-1--', '--1-']],
  });
  ex({
    id: 'min-ex-k-maxterms', chapter: MAPS, title: 'From a list of maxterms', level: 2, kind: 'kmap', vars: V4, maxterms: [0, 1, 4, 5, 10, 14], form: 'sop',
    text: ['F = ΠM(0, 1, 4, 5, 10, 14). Circle a minimal sum of products (group the 1s, the cells not listed).'],
    hints: ['The 1s are 2, 3, 6, 7, 8, 9, 11, 12, 13, 15.', 'Two quads are essential: A′C (2, 3, 6, 7) and AC′ (8, 9, 12, 13). Cells 11 and 15 are left.', 'One more quad covers both: AD (9, 11, 13, 15), or CD (3, 7, 11, 15). F = A′C + AC′ + AD.'],
    solution: ["A'C", "AC'", 'AD'], wrong: [["A'C", "AC'"], ["A'C", "AC'", 'AD', 'CD'], ["A'C", "AC'", 'D']],
  });
  ex({
    id: 'min-ex-k5-a', chapter: MAPS, title: 'Five variables', level: 2, kind: 'kmap', vars: V5, minterms: [0, 2, 4, 6, 9, 13, 16, 18, 20, 22, 25, 29], form: 'sop',
    text: ['F = Σm(0, 2, 4, 6, 9, 13, 16, 18, 20, 22, 25, 29) over A, B, C, D, E. Circle a minimal sum of products on the two maps. Write groups as terms or cubes like -0--0.'],
    hints: ['Cells 0, 2, 4, 6 and 16, 18, 20, 22 are the same quad in both maps.', 'Cells 9, 13 and 25, 29 are the same pair in both maps.', 'F = B′E′ (-0--0) + BD′E (-1-01).'],
    solution: ['-0--0', '-1-01'], wrong: [['00--0', '10--0', '-1-01'], ['-0--0'], ['-0---', '-1-01']],
  });
  ex({
    id: 'min-ex-k5-dc', chapter: MAPS, title: 'Five variables with don\'t-cares', level: 3, kind: 'kmap', vars: V5, minterms: [1, 3, 5, 7, 12, 14, 17, 19, 28, 30], dc: [13, 29], form: 'sop',
    text: ['F = Σm(1, 3, 5, 7, 12, 14, 17, 19, 28, 30) + d(13, 29) over A, B, C, D, E. Circle a minimal sum of products. Write groups as terms or cubes.'],
    hints: ['In the A = 0 map, cells 1, 3, 5, 7 make a quad. Cells 1, 3 and 17, 19 repeat across the maps.', 'Cells 12, 14 and 28, 30 are the same pair in both maps.', 'F = A′B′E (00--1) + B′C′E (-00-1) + BCE′ (-11-0). The don\'t-cares are not needed.'],
    solution: ['00--1', '-00-1', '-11-0'], wrong: [['00--1', '-00-1', '-11-0', '0-101'], ['00--1', '-11-0'], ['00--1', '-00-1', '-11--']],
  });
  ex({
    id: 'min-ex-k6', chapter: MAPS, title: 'Six variables', level: 3, kind: 'kmap', vars: V6, expr: "A'D'F' + B'DF + ABCE", form: 'sop',
    text: ['F = A′D′F′ + B′DF + ABCE over A to F, already a sum of three products. Put it on the four maps and circle a minimal sum of products. Is any group missing or extra?'],
    hints: ['A′D′F′ is a block of four in each of the two maps with A = 0.', 'B′DF lies in the two maps with B = 0; ABCE is a block of four in the AB = 11 map.', 'The three terms are exactly the essential primes: 0--0-0, -0-1-1 and 111-1-.'],
    solution: ['0--0-0', '-0-1-1', '111-1-'], wrong: [['0--0-0', '-0-1-1'], ['0--0-0', '-0-1-1', '111-1-', '1-1111'], ['---0-0', '-0-1-1', '111-1-']],
  });
  ex({
    id: 'min-ex-mev', chapter: MAPS, title: 'Read an entered map', level: 2, kind: 'simplify', vars: V4, minterms: [1, 2, 3, 6, 9, 10, 11, 14], form: 'sop', minimal: true,
    text: ['A 3-variable map of A, B, C holds what F does with D. Cells 0 and 4 hold D; cells 1 and 5 hold 1; cells 3 and 7 hold D′; cells 2 and 6 hold 0. Write the minimal sum of products of F(A, B, C, D).'],
    hints: ['Group the 1s first: cells 1 and 5 (B′C). Then the D cells with the 1 cells as don\'t-cares, and the D′ cells the same way.', 'The D cells 0, 4 with 1, 5 give B′, so B′D. The D′ cells 3, 7 with 1, 5 give C, so CD′. B′C is then covered by the other two.', "F = B′D + CD′."],
    solution: "B'D + CD'", wrong: ["B'C + B'D + CD'", "B'D + C", "D + CD'"],
  });

  // ===========================================================================================================
  // Chapter 2: tabulation
  // ===========================================================================================================
  ex({
    id: 'min-ex-qm-primes', chapter: QM, title: 'Every prime implicant', level: 2, kind: 'qm', vars: V4, minterms: [1, 3, 6, 7, 8, 9, 12, 13, 14], ask: 'primes',
    text: ['List every prime implicant of F = Σm(1, 3, 6, 7, 8, 9, 12, 13, 14), as terms or cubes like 1-0-.'],
    hints: ['Group the minterms by their number of 1s: {1, 8}, {3, 6, 9, 12}, {7, 13, 14}.', 'Merge pairs, then quads. Only 8, 9, 12, 13 make a quad: 1-0-.', "Seven primes: AC′, A′BC, A′B′D, ABD′, A′CD, B′C′D, BCD′."],
    solution: "AC', A'BC, A'B'D, ABD', A'CD, B'C'D, BCD'", wrong: ["AC', A'BC, A'B'D, ABD'", "AC', A'BC, A'B'D, ABD', A'CD, B'C'D, BCD', AB'C'", "AC', A'B"],
  });
  ex({
    id: 'min-ex-qm-primes-dc', chapter: QM, title: 'Primes with a don\'t-care', level: 2, kind: 'qm', vars: V4, minterms: [0, 2, 3, 4, 8, 11, 12, 15], dc: [7], ask: 'primes',
    text: ['List every prime implicant of F = Σm(0, 2, 3, 4, 8, 11, 12, 15) + d(7). The don\'t-care takes part in the merging.'],
    hints: ['Write 7 = 0111 in the table with the minterms.', 'With 7, cells 3, 7, 11, 15 merge to --11 (CD). Cells 0, 4, 8, 12 merge to --00 (C′D′).', "C′D′, CD, A′B′C (001-) and A′B′D′ (00-0)."],
    solution: "C'D', CD, A'B'C, A'B'D'", wrong: ["C'D', CD", "C'D', CD, A'B'C, A'B'D', A'BC'", "C'D', A'B'C, A'B'D', BCD"],
  });
  ex({
    id: 'min-ex-qm-pos', chapter: QM, title: 'Prime implicates for a product of sums', level: 3, kind: 'qm', vars: V4, minterms: [0, 2, 3, 4, 5, 7, 8, 10, 12, 13], form: 'pos', ask: 'primes',
    text: ['F = Σm(0, 2, 3, 4, 5, 7, 8, 10, 12, 13). Tabulate its 0s and list every prime sum term (prime implicate), like (A′ + B + D′).'],
    hints: ['The 0s are 1, 6, 9, 11, 14, 15. Tabulate them like minterms.', 'They merge only into pairs: 1, 9 → -001; 9, 11 → 10-1; 11, 15 → 1-11; 14, 15 → 111-; 6, 14 → -110.', "Read each cube of 0s as a sum: (B + C + D′), (A′ + B + D′), (A′ + C′ + D′), (A′ + B′ + C′), (B′ + C′ + D)."],
    solution: "(A' + B' + C'), (A' + B + D'), (A' + C' + D'), (B + C + D'), (B' + C' + D)", wrong: ["(A' + C' + D'), (B + C + D'), (B' + C' + D)", "(A' + B' + C' + D), (A' + B + D'), (A' + C' + D'), (B + C + D'), (B' + C' + D)", "(A + B + C + D')"],
  });
  ex({
    id: 'min-ex-qm-ess', chapter: QM, title: 'The essential rows', level: 2, kind: 'qm', vars: V4, minterms: [0, 4, 6, 7, 9, 11, 13, 15], ask: 'essentials',
    text: ['F = Σm(0, 4, 6, 7, 9, 11, 13, 15) has five prime implicants: AD, A′BC, A′BD′, A′C′D′ and BCD. Which are essential?'],
    hints: ['Draw the chart: a column per minterm, an X where a prime covers it.', 'Column 0 has one X (A′C′D′); columns 9, 11 and 13 have one X each (AD).', 'The essential primes are A′C′D′ and AD.'],
    solution: "A'C'D', AD", wrong: ["A'C'D', AD, A'BC", 'AD', "A'C'D', AD, A'BD'"],
  });
  ex({
    id: 'min-ex-qm-chart', chapter: QM, title: 'Fill in the chart', level: 2, kind: 'qm', vars: V4, minterms: [2, 5, 6, 7, 10, 13, 14], ask: 'chart',
    text: ['F = Σm(2, 5, 6, 7, 10, 13, 14) has the prime implicants P1 = CD′, P2 = A′BC, P3 = A′BD and P4 = BC′D. Mark with X each minterm each prime covers.'],
    hints: ['CD′ covers every minterm with C = 1 and D = 0.', 'A′BC is 6 and 7; A′BD is 5 and 7; BC′D is 5 and 13.', "P1: 2, 6, 10, 14. P2: 6, 7. P3: 5, 7. P4: 5, 13."],
    solution: { "P1: CD'|2": 'X', "P1: CD'|6": 'X', "P1: CD'|10": 'X', "P1: CD'|14": 'X', "P2: A'BC|6": 'X', "P2: A'BC|7": 'X', "P3: A'BD|5": 'X', "P3: A'BD|7": 'X', "P4: BC'D|5": 'X', "P4: BC'D|13": 'X' },
    wrong: [{ "P1: CD'|2": 'X', "P1: CD'|6": 'X', "P1: CD'|10": 'X', "P1: CD'|14": 'X' }, { "P1: CD'|2": 'X', "P1: CD'|6": 'X', "P1: CD'|10": 'X', "P1: CD'|14": 'X', "P2: A'BC|6": 'X', "P2: A'BC|7": 'X', "P3: A'BD|5": 'X', "P3: A'BD|7": 'X', "P4: BC'D|5": 'X', "P4: BC'D|12": 'X' }],
  });
  ex({
    id: 'min-ex-qm-cover', chapter: QM, title: 'A cover from a cyclic chart', level: 3, kind: 'qm', vars: V4, minterms: [0, 1, 5, 7, 8, 10, 14, 15], ask: 'cover',
    text: ['F = Σm(0, 1, 5, 7, 8, 10, 14, 15) has eight prime implicants, each covering two minterms, and its chart has no essential row. Give a minimal cover.'],
    hints: ['Petrick: each minterm gives a sum of the two primes covering it; there are eight such sums.', 'Four primes are needed, chosen so that each covers two minterms the others do not.', "A′B′C′, A′BD, ABC and AB′D′; the other half of the ring, A′C′D, BCD, ACD′ and B′C′D′, costs the same."],
    solution: "A'B'C', A'BD, ABC, AB'D'", wrong: ["A'B'C', ABC, A'BD", "A'B'C', A'BD, ABC, AB'D', BCD", "A'B'C', A'C'D, A'BD, AB'D', ABC"],
  });
  ex({
    id: 'min-ex-petrick-count', chapter: QM, title: 'How many minimal covers?', level: 3, kind: 'number', answer: 2, higherLower: true, why: 'Five products survive Petrick\'s multiplication, but only two of them reach the lowest cost.',
    text: ['F = Σm(0, 2, 3, 4, 7, 9, 10, 12, 13, 14) has ten prime implicants; A′CD and AC′D are essential. After them, the chart is cyclic. Using Petrick\'s method, how many different minimal sums of products does F have (fewest terms, then fewest literals)?'],
    hints: ['The minimal SOP has 5 terms and 15 literals; the two essentials are two of them.', 'Multiply out the product of sums for the remaining columns and keep the cheapest products: three primes each.', 'Two products tie at three primes and 9 literals, so F has 2 minimal sums.'],
    solution: 2, wrong: [1, 5],
  });

  // ===========================================================================================================
  // Chapter 1 (several outputs) and chapter 3: costs, gate forms and hazards
  // ===========================================================================================================
  ex({
    id: 'min-ex-multi-circuit', chapter: MAPS, title: 'Two outputs, one shared gate', level: 3, kind: 'circuit', ref: { F: "AB + A'C", G: "AB + BC'" }, inputs: V3, outputs: ['F', 'G'], parts: ['AND', 'OR', 'NOT'], maxGates: 7,
    text: ['Build F = Σm(1, 3, 6, 7) and G = Σm(2, 6, 7) together from AND, OR and NOT gates, with at most seven gates in all (inverters count).'],
    hints: ['Alone: F = AB + A′C and G = AB + BC′.', 'AB appears in both: build it once and feed both OR gates.', 'NOT A, NOT C, three ANDs (AB, A′C, BC′) and two ORs: seven gates.'],
    solution: 'na = NOT(A)\nnc = NOT(C)\nt1 = AND(A, B)\nt2 = AND(na, C)\nt3 = AND(B, nc)\nF = OR(t1, t2)\nG = OR(t1, t3)',
    wrong: ['na = NOT(A)\nnc = NOT(C)\nt1 = AND(A, B)\nt2 = AND(na, C)\nt3 = AND(B, nc)\nt4 = AND(A, B)\nF = OR(t1, t2)\nG = OR(t4, t3)', 'na = NOT(A)\nnc = NOT(C)\nt1 = AND(A, B)\nt2 = AND(na, C)\nt3 = AND(B, nc)\nF = OR(t1, t2)\nG = OR(t1, t2)'],
  });
  ex({
    id: 'min-ex-multi-count', chapter: MAPS, title: 'Count the AND gates', level: 2, kind: 'number', answer: 5, higherLower: true, why: 'Minimised one at a time the two outputs would need six AND gates; sharing BC′D saves one.',
    text: ['F = Σm(0, 1, 5, 13, 14, 15) and G = Σm(5, 7, 13, 14) share the inputs A, B, C, D. Minimised together, as sums of products with shared terms built once, how many AND gates are needed?'],
    hints: ['Alone: F = A′B′C′ + BC′D + ABC and G = A′BD + BC′D + ABCD′.', 'BC′D (cells 5, 13) is in both.', 'Distinct products: A′B′C′, ABC, BC′D, A′BD, ABCD′: 5 AND gates.'],
    solution: 5, wrong: [6, 4],
  });
  ex({
    id: 'min-ex-cost-lits', chapter: IMPL, title: 'Count the literals', level: 1, kind: 'number', answer: 7, higherLower: true, why: 'The minimal POS of the same function, (A + C′)(B + D′)(C′ + D), has only 6.',
    text: ['How many literals does the minimal sum of products of F = Σm(0, 4, 5, 8, 12, 13, 15) have?'],
    hints: ['Find the minimal SOP on a map first.', 'F = BC′ + C′D′ + ABD.', '2 + 2 + 3 = 7 literals.'],
    solution: 7, wrong: [6, 9],
  });
  ex({
    id: 'min-ex-cost-choice', chapter: IMPL, title: 'SOP or POS?', level: 2, kind: 'choice', options: ['The SOP', 'The POS', 'They cost the same'], answer: 1,
    whyNot: { 0: 'Count the OR gate\'s inputs too: three products of 2 literals each cost 6 + 3 = 9 gate inputs.', 2: 'Count both: 9 gate inputs against 7.' },
    text: ['F = Σm(0, 1, 2, 3, 4, 5, 8, 10, 12, 13) has the minimal SOP A′B′ + BC′ + B′D′ and the minimal POS (B′ + C′)(A′ + B + D′). Counting gate inputs, which two-level circuit is cheaper?'],
    hints: ['Gate inputs: every input of every first-level gate, plus one input of the second-level gate per term.', 'SOP: 2 + 2 + 2 + 3 = 9.', 'POS: 2 + 3 + 2 = 7. The POS is cheaper.'],
    solution: 1, wrong: [0, 2],
  });
  ex({
    id: 'min-ex-cost-factor', chapter: IMPL, title: 'Factor it', level: 3, kind: 'expr', ref: 'AC + AD + BC + BD + E', vars: V5, maxLiterals: 5,
    text: ['F = AC + AD + BC + BD + E is a minimal sum of products with 9 literals. Write F with at most 5 literals, using as many levels as you like.'],
    hints: ['AC + AD = A(C + D), and BC + BD = B(C + D).', 'Both share (C + D).', 'F = (A + B)(C + D) + E: 5 literals, three levels.'],
    solution: '(A + B)(C + D) + E', wrong: ['AC + AD + BC + BD + E', '(A + B)(C + D)', '(A + B + E)(C + D + E)'],
  });
  ex({
    id: 'min-ex-levels', chapter: IMPL, title: 'How many levels?', level: 1, kind: 'choice', options: ['2', '3', '4'], answer: 1, whyNot: { 0: 'Two levels would be a sum of products or a product of sums; this form nests a product inside a sum.', 2: 'Count the gates on one path only: OR, AND, OR.' }, why: 'The SOP of the same function has two levels but 13 gate inputs; this form has 8 and three levels.',
    text: ['F = (A + B)(C + D) + E is built exactly as written, from OR and AND gates. How many gates lie on the longest path from an input to F?'],
    hints: ['Work from the inside: A + B and C + D are OR gates.', 'Their product is an AND gate, and E is ORed in last.', 'OR, then AND, then OR: 3 levels.'],
    solution: 1, wrong: [0, 2],
  });
  ex({
    id: 'min-ex-nand-single', chapter: IMPL, title: 'A single-literal term', level: 1, kind: 'choice', options: ['C', 'C′', 'NAND(C, C) fed with C′'], answer: 0,
    whyNot: { 1: 'The second-level NAND complements each input: feeding C′ would contribute (C′)′ = C to the sum.', 2: 'NAND(C, C) is C′ again, the same mistake.' },
    text: ['F = AB + C′ is built NAND-NAND: n1 = NAND(A, B), F = NAND(n1, x). What must x be?'],
    hints: ['NAND(n1, x) = n1′ + x′.', 'n1′ = AB, so x′ must be C′.', 'x = C: the single literal goes in complemented, which here means plain C.'],
    solution: 0, wrong: [1, 2],
  });
  ex({
    id: 'min-ex-nand2', chapter: IMPL, title: 'NAND-NAND', level: 2, kind: 'circuit', ref: "AB' + CD", inputs: V4, outputs: ['F'], parts: ['NAND'], maxGates: 4,
    text: ['Build F = AB′ + CD from NAND gates only, with at most four gates. (An inverter is a NAND with its inputs tied.)'],
    hints: ['NAND-NAND: one NAND per product, one NAND to combine them.', 'B′ comes from NAND(B, B).', 'nb = NAND(B, B), t1 = NAND(A, nb), t2 = NAND(C, D), F = NAND(t1, t2).'],
    solution: 'nb = NAND(B, B)\nt1 = NAND(A, nb)\nt2 = NAND(C, D)\nF = NAND(t1, t2)',
    wrong: ['t1 = NAND(A, B)\nt2 = NAND(C, D)\nF = NAND(t1, t2)', 'nb = NOT(B)\nt1 = NAND(A, nb)\nt2 = NAND(C, D)\nF = NAND(t1, t2)', 'nb = NAND(B, B)\nt1 = NAND(A, nb)\nt2 = NAND(C, D)\nu = NAND(t1, t2)\nF = NAND(u, u)'],
  });
  ex({
    id: 'min-ex-nor2', chapter: IMPL, title: 'NOR-NOR', level: 2, kind: 'circuit', ref: "(A + B')(C + D)", inputs: V4, outputs: ['F'], parts: ['NOR'], maxGates: 4,
    text: ['Build F = (A + B′)(C + D) from NOR gates only, with at most four gates.'],
    hints: ['NOR-NOR: one NOR per sum term, one NOR to combine them.', 'B′ comes from NOR(B, B).', 'nb = NOR(B, B), s1 = NOR(A, nb), s2 = NOR(C, D), F = NOR(s1, s2).'],
    solution: 'nb = NOR(B, B)\ns1 = NOR(A, nb)\ns2 = NOR(C, D)\nF = NOR(s1, s2)',
    wrong: ['s1 = NOR(A, B)\ns2 = NOR(C, D)\nF = NOR(s1, s2)', 'nb = NOR(B, B)\ns1 = NOR(A, nb)\ns2 = NOR(C, D)\nF = NAND(s1, s2)'],
  });
  ex({
    id: 'min-ex-nand-min', chapter: IMPL, title: 'Minimise, then NAND', level: 2, kind: 'circuit', minterms: [1, 5, 9, 12, 13, 14, 15], vars: V4, inputs: V4, outputs: ['F'], parts: ['NAND'], maxGates: 4,
    text: ['F = Σm(1, 5, 9, 12, 13, 14, 15). Minimise it, then build it from NAND gates only, with at most four gates.'],
    hints: ['On the map: the quad AB (12, 13, 14, 15) and the quad C′D (1, 5, 9, 13).', 'F = AB + C′D. Only C′ needs an inverter.', 'nc = NAND(C, C), t1 = NAND(A, B), t2 = NAND(nc, D), F = NAND(t1, t2).'],
    solution: 'nc = NAND(C, C)\nt1 = NAND(A, B)\nt2 = NAND(nc, D)\nF = NAND(t1, t2)',
    wrong: ['nc = NAND(C, C)\nt1 = NAND(A, B)\nt2 = NAND(C, D)\nF = NAND(t1, t2)', 'nc = NAND(C, C)\nt1 = NAND(A, B)\nt2 = NAND(nc, D)\nt3 = NAND(A, C)\nF = NAND(t1, t2, t3)'],
  });
  ex({
    id: 'min-ex-aoi', chapter: IMPL, title: 'AND-OR-INVERT from the 0s', level: 2, kind: 'circuit', minterms: [0, 1, 2, 4, 6], vars: V3, inputs: V3, outputs: ['F'], parts: ['AND', 'NOR'], maxGates: 3, maxLevels: 2,
    text: ['F = Σm(0, 1, 2, 4, 6). Build it as AND-NOR (an AND-OR-INVERT): AND gates feeding one NOR, at most three gates, two levels.'],
    hints: ['AND-NOR computes the complement of a sum of products, so minimise F′ first.', 'The 0s of F are 3, 5, 7: F′ = AC + BC.', 't1 = AND(A, C), t2 = AND(B, C), F = NOR(t1, t2).'],
    solution: 't1 = AND(A, C)\nt2 = AND(B, C)\nF = NOR(t1, t2)',
    wrong: ['F = NOR(A, B, C)', 't1 = AND(A, C)\nt2 = AND(B, C)\ns = OR(t1, t2)\nF = NOR(s, s)', 't1 = AND(A, B)\nt2 = AND(B, C)\nF = NOR(t1, t2)'],
  });
  ex({
    id: 'min-ex-oai', chapter: IMPL, title: 'OR-AND-INVERT', level: 2, kind: 'circuit', minterms: [0, 1, 2, 4, 6], vars: V3, inputs: V3, outputs: ['F'], parts: ['OR', 'NAND'], maxGates: 2, maxLevels: 2,
    text: ['The same F = Σm(0, 1, 2, 4, 6), now as OR-NAND (an OR-AND-INVERT), with at most two gates.'],
    hints: ['OR-NAND computes the complement of a product of sums: find F′ as a POS.', 'F′ = AC + BC = C(A + B).', 's = OR(A, B), F = NAND(s, C).'],
    solution: 's = OR(A, B)\nF = NAND(s, C)',
    wrong: ['F = NAND(A, B, C)', 's = OR(A, C)\nF = NAND(s, B)', 's = OR(A, B)\nt = AND(s, C)\nF = NOT(t)'],
  });
  ex({
    id: 'min-ex-degenerate', chapter: IMPL, title: 'A form that collapses', level: 2, kind: 'choice', options: ['a 4-input NOR', 'a 4-input AND', 'an AND-OR-INVERT', 'a 4-input NAND'], answer: 0,
    whyNot: { 2: 'That is AND-NOR or NAND-AND. Here the first level is NOR.', 1: 'An AND of four inputs is 1 when all are 1, but (A + B)′(C + D)′ is 1 only when all four inputs are 0.', 3: 'A NAND is 0 only when every input is 1; this circuit is 1 only when every input is 0.' },
    text: ['Two NOR gates take (A, B) and (C, D), and an AND gate combines their outputs. What single gate does this two-level circuit equal?'],
    hints: ['Write it out: (A + B)′(C + D)′.', 'De Morgan: (A + B)′(C + D)′ = A′B′C′D′.', 'A′B′C′D′ = (A + B + C + D)′, a 4-input NOR: NOR-AND is a degenerate form.'],
    solution: 0, wrong: [1, 2, 3],
  });
  ex({
    id: 'min-ex-bubble', chapter: IMPL, title: 'Three levels of NAND', level: 3, kind: 'circuit', ref: "AB + C(D' + E')", inputs: V5, outputs: ['F'], parts: ['NAND'], maxGates: 4,
    text: ['Build F = AB + C(D′ + E′) from NAND gates only, with at most four gates. Push the bubbles: no inverter is needed.'],
    hints: ['D′ + E′ = (DE)′ is one NAND of D and E.', 'C(D′ + E′) is an AND inside an OR: NAND(C, n1) gives its complement, which the final NAND turns back.', 'n1 = NAND(D, E), n2 = NAND(C, n1), n3 = NAND(A, B), F = NAND(n2, n3).'],
    solution: 'n1 = NAND(D, E)\nn2 = NAND(C, n1)\nn3 = NAND(A, B)\nF = NAND(n2, n3)',
    wrong: ['n1 = NAND(D, E)\nn2 = NAND(C, n1)\nn3 = NAND(A, B)\nF = NAND(n2, n3, n1)', 'nd = NAND(D, D)\nne = NAND(E, E)\nn1 = NAND(nd, ne)\nn2 = NAND(C, n1)\nn3 = NAND(A, B)\nF = NAND(n2, n3)'],
  });
  ex({
    id: 'min-ex-bubble-nor', chapter: IMPL, title: 'Three levels of NOR', level: 3, kind: 'circuit', ref: "(A + B)(C + D'E')", inputs: V5, outputs: ['F'], parts: ['NOR'], maxGates: 4,
    text: ['Build F = (A + B)(C + D′E′) from NOR gates only, with at most four gates.'],
    hints: ['D′E′ = (D + E)′ is one NOR of D and E.', 'NOR(C, n1) is (C + D′E′)′; NOR(A, B) is (A + B)′; a NOR of the two complements gives the product.', 'n1 = NOR(D, E), n2 = NOR(C, n1), n3 = NOR(A, B), F = NOR(n2, n3).'],
    solution: 'n1 = NOR(D, E)\nn2 = NOR(C, n1)\nn3 = NOR(A, B)\nF = NOR(n2, n3)',
    wrong: ['n1 = NOR(D, E)\nn2 = NOR(C, n1)\nF = NOR(n2, A, B)', 'n1 = NOR(D, E)\nn2 = NOR(C, n1)\nn3 = NOR(A, B)\nF = NAND(n2, n3)'],
  });
  ex({
    id: 'min-ex-xor-choice', chapter: IMPL, title: 'Spot the checkerboard', level: 1, kind: 'choice', options: ['Σm(1, 2, 4, 7)', 'Σm(0, 1, 2, 3)', 'Σm(3, 5, 6, 7)', 'Σm(0, 7)'], answer: 0,
    whyNot: { 1: 'That is A′, one group of four.', 2: 'That is the majority, AB + AC + BC: three pairs.', 3: 'Its two 1s are far apart, but the map is not a checkerboard: most cells are 0.' },
    text: ['Which 3-variable function has a map on which no two 1s are adjacent, while every 0 has only 1s as neighbours: a checkerboard that only XOR gates handle well?'],
    hints: ['A checkerboard means flipping any one input flips F.', 'Neighbours differ in one bit, so they have different numbers of 1s, odd against even.', 'Σm(1, 2, 4, 7) is 1 for an odd number of 1s: F = A ⊕ B ⊕ C.'],
    solution: 0, wrong: [1, 2, 3],
  });
  ex({
    id: 'min-ex-rm', chapter: IMPL, title: 'Three literals with XOR', level: 2, kind: 'simplify', vars: V3, minterms: [3, 4, 5, 6], maxLiterals: 3,
    text: ['F = Σm(3, 4, 5, 6). Its minimal SOP, AB′ + AC′ + A′BC, has 7 literals. Write F with 3 literals, using XOR (^).'],
    hints: ['When A = 0, F is 1 only for BC = 11; when A = 1, F is 1 except for BC = 11.', 'So with A = 1 the output is the complement of BC, with A = 0 it is BC itself.', 'F = A ⊕ BC, written A ^ BC.'],
    solution: 'A ^ BC', wrong: ["AB' + AC' + A'BC", 'A ^ B ^ C', 'A + BC'],
  });
  ex({
    id: 'min-ex-xor-circuit', chapter: IMPL, title: 'Twelve literals or three gates', level: 2, kind: 'circuit', minterms: [3, 7, 11, 12, 13, 14], vars: V4, inputs: V4, outputs: ['F'], parts: ['AND', 'XOR'], maxGates: 3,
    text: ['F = Σm(3, 7, 11, 12, 13, 14). Its minimal SOP has 12 literals. Build it from AND and XOR gates, with at most three gates.'],
    hints: ['F is 1 when AB = 1 or CD = 1, but not both.', 'That is AB ⊕ CD.', 't1 = AND(A, B), t2 = AND(C, D), F = XOR(t1, t2).'],
    solution: 't1 = AND(A, B)\nt2 = AND(C, D)\nF = XOR(t1, t2)',
    wrong: ['t1 = AND(A, B)\nt2 = AND(C, D)\nF = AND(t1, t2)', 't1 = XOR(A, B)\nt2 = XOR(C, D)\nF = XOR(t1, t2)'],
  });

  // ---- hazards ----------------------------------------------------------------------------------------------------
  ex({
    id: 'min-ex-haz-find', chapter: IMPL, title: 'Where can it glitch?', level: 1, kind: 'choice',
    options: ['C changes while A = 1, B = 1', 'A changes while B = 1, C = 0', 'B changes while A = 1, C = 1', 'A changes while B = 0, C = 1'], answer: 0,
    whyNot: { 1: 'Cells 2 and 6 are both inside BC′: that term holds F at 1 throughout.', 2: 'Cells 5 and 7 are both inside AC.', 3: 'Cell 1 is a 0, so F changes anyway: that is not a static hazard.' },
    text: ['F = BC′ + AC is built as two AND gates into an OR gate, with an inverter making C′. Which single input change can make F glitch to 0 although it should stay 1?'],
    hints: ['BC′ covers cells 2 and 6; AC covers 5 and 7.', 'Look for two adjacent 1s in different groups.', 'Cells 6 (110) and 7 (111) differ in C and lie in different groups: C changing with A = B = 1.'],
    solution: 0, wrong: [1, 2, 3],
  });
  ex({
    id: 'min-ex-haz-map', chapter: IMPL, title: 'A minimal cover first', level: 2, kind: 'kmap', vars: V4, minterms: [0, 5, 7, 8, 10, 11, 14, 15], form: 'sop',
    text: ['F = Σm(0, 5, 7, 8, 10, 11, 14, 15). Circle a minimal sum of products. The next exercise asks where this cover can glitch.'],
    hints: ['Cells 10, 11, 14, 15 make the quad AC.', 'Cells 5, 7 make A′BD; cells 0, 8 make B′C′D′.', 'F = AC + A′BD + B′C′D′.'],
    solution: ['AC', "A'BD", "B'C'D'"], wrong: [['AC', "A'BD", "B'C'D'", 'BCD'], ['AC', "A'BD"], ['C', "A'BD", "B'C'D'"]],
  });
  ex({
    id: 'min-ex-haz-map-fix', chapter: IMPL, title: 'Cover the gaps', level: 2, kind: 'choice',
    options: ['BCD and AB′D′', 'BCD only', 'AB′D′ only', 'ABD', 'None: a minimal cover has no hazards'], answer: 0,
    whyNot: { 1: 'BCD bridges 7 and 15, but 8 (1000) and 10 (1010) are adjacent 1s in different groups too.', 2: 'AB′D′ bridges 8 and 10, but 7 and 15 are still in different groups.', 4: 'Minimal and hazard-free are different goals: two pairs of adjacent 1s are split between groups.' },
    text: ['The minimal cover of F = Σm(0, 5, 7, 8, 10, 11, 14, 15) is AC + A′BD + B′C′D′. Which terms must be added so that every pair of adjacent 1s lies inside one group?', { kmap: { vars: V4, minterms: [0, 5, 7, 8, 10, 11, 14, 15], groups: ['AC', "A'BD", "B'C'D'"] }, caption: 'The minimal cover.' }],
    hints: ['Check each pair of adjacent 1s: is there one group holding both?', 'Cells 7 and 15 (A changes) and cells 8 and 10 (C changes) are split.', 'Add BCD for 7–15 and AB′D′ for 8–10.'],
    solution: 0, wrong: [1, 2, 4],
  });
  ex({
    id: 'min-ex-haz-count', chapter: IMPL, title: 'Count the static-0 hazards', level: 2, kind: 'number', answer: 2, higherLower: true, why: 'Both pairs change B with A = 0, and the one consensus term (A + D) covers both.',
    text: ['F = (A + B′)(B + D)(B′ + D′), a minimal product of sums of Σm(1, 3, 9, 11, 12, 14). How many pairs of adjacent 0s are not held by a single sum term (static-0 hazards)?'],
    hints: ['The 0s are 0, 2, 4, 5, 6, 7, 8, 10, 13, 15. A + B′ holds 4, 5, 6, 7; B + D holds 0, 2, 8, 10; B′ + D′ holds 5, 7, 13, 15.', 'Check the pairs that cross groups: 0–4 and 2–6 (B changes, A = 0).', 'Two: 0–4 and 2–6. One sum term, A + D, fixes both.'],
    solution: 2, wrong: [1, 0, 4],
  });
  ex({
    id: 'min-ex-haz-free', chapter: IMPL, title: 'A cover with no static hazard', level: 3, kind: 'string', vars: V4, minterms: [1, 3, 5, 6, 7, 14],
    placeholder: "A'B + CD'", accept: hazardFree({ vars: V4, minterms: [1, 3, 5, 6, 7, 14] }, 'sop'),
    text: ['F = Σm(1, 3, 5, 6, 7, 14). Its minimal SOP is A′D + BCD′. Write a sum of products for F that has no static-1 hazard, with as few literals as possible.'],
    hints: ['Find two adjacent 1s held by different terms of A′D + BCD′.', 'Cells 6 (0110) and 7 (0111) differ in D: A′D holds 7, BCD′ holds 6.', 'Add the consensus A′BC: F = A′D + BCD′ + A′BC, 8 literals.'],
    solution: "A'D + BCD' + A'BC", wrong: ["A'D + BCD'", "A'D + BCD' + A'BC + A'B'D", "A'D + BC"],
    why: 'A′BC is the consensus of A′D and BCD′: redundant for the function, needed for the timing.',
  });
  ex({
    id: 'min-ex-haz-pos', chapter: IMPL, title: 'A product of sums with no static hazard', level: 3, kind: 'string', vars: V4, minterms: [4, 5, 6, 7, 9, 11, 13, 15],
    placeholder: '(A + B)(C + D)', accept: hazardFree({ vars: V4, minterms: [4, 5, 6, 7, 9, 11, 13, 15] }, 'pos'),
    text: ['F = Σm(4, 5, 6, 7, 9, 11, 13, 15). Its minimal POS is (A + B)(A′ + D). Write a product of sums for F with no static-0 hazard, with as few literals as possible.'],
    hints: ['The 0s are 0, 1, 2, 3 (inside A + B) and 8, 10, 12, 14 (inside A′ + D).', 'Cells 0 and 8 differ in A, and so do 2 and 10: each pair is split between the two sums.', 'The consensus of (A + B) and (A′ + D) is (B + D): F = (A + B)(A′ + D)(B + D).'],
    solution: '(A + B)(A\' + D)(B + D)', wrong: ["(A + B)(A' + D)", "(A + B)(A' + D)(B + D)(A + B + D)", "AD + A'B"],
    why: 'B + D is the consensus of A + B and A′ + D: it holds F at 0 while A changes.',
  });

  // ===========================================================================================================
  // The bench: a minimal SOP on one 7400
  // ===========================================================================================================
  // F = A′B + AC on four NAND gates: g1 = NAND(A, A) = A′; g2 = NAND(A′, B); g3 = NAND(A, C); g4 = NAND(g2, g3).
  // 7400 at column 10: pins 1–7 on row f of columns 10–16, pins 14–8 on row e. A = S2, B = S1, C = S0.
  const NAND_BOARD = {
    chips: [{ id: 'U1', num: '7400', col: 10 }],
    jumpers: [['10a', 'Rtp10', 'red'], ['16j', 'Rbn16', 'black'],
      ['sw2', '10j', 'yellow'], ['10i', '11i', 'green'],
      ['12h', '13h', 'green'], ['sw1', '14j', 'yellow'],
      ['10g', '15a', 'yellow'], ['sw0', '14a', 'yellow'],
      ['15h', '12b', 'blue'], ['16b', '11b', 'blue'], ['13a', 'led0', 'blue']],
  };
  C.lab({
    id: 'min-lab-nand', chapter: IMPL, title: 'A minimal SOP on one NAND chip',
    aim: 'Minimise F = Σm(2, 3, 5, 7) to A′B + AC, convert it to NAND-NAND, and build it from the four gates of a single 7400. Read its truth table off the LED.',
    parts: ['7400'],
    steps: ['Find the minimal SOP: F = A′B + AC. As NAND-NAND it needs A′, which one more NAND with its inputs tied provides: four NANDs, exactly one 7400.', 'Power the 7400: pin 14 (VCC) to the +5 V rail, pin 7 (GND) to ground.', 'Gate 1 (pins 1, 2 → 3): both inputs from S2 (A), so pin 3 is A′.', 'Gate 2 (pins 4, 5 → 6): pin 3 and S1 (B). Gate 3 (pins 9, 10 → 8): S2 (A) and S0 (C).', 'Gate 4 (pins 12, 13 → 11): the outputs of gates 2 and 3. Take pin 11 to LED 0.', 'Set the switches to each row of the table (S2 S1 S0 = A B C) and write down LED 0.'],
    observe: { inputs: ['S2', 'S1', 'S0'], outputs: ['led0'] },
    checks: [{ kind: 'power' }, { kind: 'truth', inputs: ['S2', 'S1', 'S0'], outputs: { led0: "S2'S1 + S2S0" } }],
    reference: NAND_BOARD,
  });
  ex({
    id: 'min-ex-lab-nand', chapter: IMPL, title: 'NAND-NAND on the bench', kind: 'lab', lab: 'min-lab-nand', level: 2,
    text: ['Build F = A′B + AC from one 7400 on the bench, fill in the observation table, and check.'],
    hints: ['Start with power: pin 14 to +5 V and pin 7 to ground.', 'The inverter for A is gate 1 with pins 1 and 2 tied together; gates 2 and 3 make (A′B)′ and (AC)′, and gate 4 combines them.', 'LED 0 is 1 for A B C = 010, 011, 101, 111 and 0 for the other four rows.'],
    solution: { bench: NAND_BOARD, observe: { '000|led0': '0', '001|led0': '0', '010|led0': '1', '011|led0': '1', '100|led0': '0', '101|led0': '1', '110|led0': '0', '111|led0': '1' } },
    wrong: [{ bench: { chips: NAND_BOARD.chips, jumpers: NAND_BOARD.jumpers.slice(1) } }, { bench: NAND_BOARD, observe: { '000|led0': '0', '001|led0': '0', '010|led0': '1', '011|led0': '1', '100|led0': '1', '101|led0': '1', '110|led0': '0', '111|led0': '1' } }],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
