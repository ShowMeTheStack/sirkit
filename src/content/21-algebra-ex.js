// Part 2, Boolean algebra and gates: the exercises and the bench labs. The chapters, lessons, tour and course are in
// 20-algebra.js. Every function, circuit and number here is our own; each answer is checked by the engines.
(function (S) {
  'use strict';
  const C = S.Content;
  if (!C || C.exercises.has('alg-ex-gate-table')) return;
  const ex = (o) => C.exercise(o);

  // A canonical form typed as an expression: every term must name every variable, and the whole must equal the
  // function. The string kind's accept hook does the check, with the engine's own parser and cubes.
  const canonical = (vars, ones, form) => (text) => {
    const B = S.Bool, n = vars.length, pos = form === 'pos';
    let e;
    try { e = B.parse(text); } catch (err) { return 'This cannot be read: ' + err.message + '.'; }
    const extra = [...B.vars(e)].filter((v) => !vars.includes(v));
    if (extra.length) return 'Your expression uses ' + extra.join(', ') + ', which ' + (extra.length === 1 ? 'is' : 'are') + ' not among the variables ' + vars.join(', ') + '.';
    const f = B.compile(e, vars);
    for (let m = 0; m < 1 << n; m++) {
      const want = ones.includes(m) ? 1 : 0, got = f(m);
      if (want !== got) return 'Not quite: at row ' + m + ' (' + vars.map((v, i) => v + ' = ' + ((m >> (n - 1 - i)) & 1)).join(', ') + ') the function is ' + want + ' but your expression gives ' + got + '.';
    }
    const terms = e.op === (pos ? 'and' : 'or') ? e.args : [e];
    for (const t of terms) {
      const c = B.termCube(t, vars, form);
      if (!c || c === 'empty') return 'It has the right value everywhere, but ' + B.toString(t) + ' is not a single ' + (pos ? 'sum term' : 'product term') + ', so this is not a ' + (pos ? 'product of sums' : 'sum of products') + '.';
      if (B.cubeLits(c) !== n) return 'It has the right value everywhere, but the term ' + B.toString(t) + ' does not name all ' + n + ' variables: in canonical form every ' + (pos ? 'maxterm' : 'minterm') + ' does.';
    }
    return { ok: true, why: 'Every term is a ' + (pos ? 'maxterm' : 'minterm') + ', and there is one for each ' + (pos ? '0' : '1') + ' of the table.' };
  };
  const tableOf = (vars, ones, caption) => ({ table: [vars.concat('F')].concat(Array.from({ length: 1 << vars.length }, (_, m) => vars.map((_, i) => String((m >> (vars.length - 1 - i)) & 1)).concat(ones.includes(m) ? '1' : '0'))), caption });

  // ===========================================================================================================
  // Chapter 1: gates and logic levels
  // ===========================================================================================================
  ex({
    id: 'alg-ex-gate-table', chapter: 'alg-gates', title: 'A NOR feeding an AND', level: 1, kind: 'truthtable', expr: "(A + B)'C", vars: ['A', 'B', 'C'],
    text: ['A two-input NOR gate takes A and B; its output and C go into an AND gate. Fill in the truth table of the AND gate\'s output F.', { circuit: 'n1 = NOR(A, B)\nF = AND(n1, C)', outputs: ['F'], caption: 'Click the inputs to try a row, but fill in the table first.' }],
    hints: ['The NOR gives 1 only when A and B are both 0.', 'F is 1 only when the NOR gives 1 and C is 1 as well.', 'Only row 001 gives F = 1: down the rows 000 to 111, F = 0, 1, 0, 0, 0, 0, 0, 0.'],
    solution: { '000|F': '0', '001|F': '1', '010|F': '0', '011|F': '0', '100|F': '0', '101|F': '0', '110|F': '0', '111|F': '0' },
    wrong: [{ '000|F': '1', '001|F': '1', '010|F': '0', '011|F': '0', '100|F': '0', '101|F': '0', '110|F': '0', '111|F': '0' }, { '000|F': '0', '001|F': '1', '010|F': '0', '011|F': '1', '100|F': '0', '101|F': '1', '110|F': '0', '111|F': '0' }],
  });
  ex({
    id: 'alg-ex-gate-name', chapter: 'alg-gates', title: 'Which gate is it?', level: 1, kind: 'choice',
    text: ['A three-input gate gives 0 only when all three of its inputs are 0. Which gate is it?'],
    options: ['AND', 'OR', 'NAND', 'NOR', 'XOR'], answer: 1,
    whyNot: { 0: 'An AND gate gives 1 only when all inputs are 1; with 100 at its inputs it gives 0.', 2: 'A NAND gives 0 only when all inputs are 1.', 3: 'A NOR gives 1 only when all inputs are 0: the opposite.', 4: 'A three-input XOR gives 0 for 110 as well, where two inputs are 1.' },
    hints: ['Write the one row where the output is 0: 000.', 'Every other row, with at least one 1, gives 1.', 'At least one 1 gives 1: that is OR.'],
    solution: 1, wrong: [3, 0], why: 'OR is 0 only on the all-zero row.',
  });
  ex({
    id: 'alg-ex-poslog-nor', chapter: 'alg-gates', title: 'One device, two readings', level: 2, kind: 'choice',
    text: ['A device has this voltage table. In negative logic (L = 1, H = 0), which gate is it?', { table: [['A', 'B', 'F'], ['L', 'L', 'H'], ['L', 'H', 'L'], ['H', 'L', 'L'], ['H', 'H', 'L']] }],
    options: ['NOR', 'NAND', 'AND', 'OR'], answer: 1,
    whyNot: { 0: 'NOR is the positive-logic reading (H = 1). In negative logic every input and the output are read the other way.', 2: 'Read the last row in negative logic: H, H is 0, 0 and the output L is 1. An AND would give 0 there.', 3: 'Read the first row in negative logic: L, L is 1, 1 and the output H is 0. An OR would give 1.' },
    hints: ['Rewrite the table with L = 1 and H = 0.', 'The rows become 1 1 → 0, 1 0 → 1, 0 1 → 1, 0 0 → 1.', 'Output 0 only when both inputs are 1: NAND. (In positive logic the same device is a NOR.)'],
    solution: 1, wrong: [0, 2],
  });
  ex({
    id: 'alg-ex-poslog-xor', chapter: 'alg-gates', title: 'An XOR in negative logic', level: 3, kind: 'choice',
    text: ['A device drives its output H exactly when its two inputs are at different voltages. In positive logic it is an XOR. What is it in negative logic?'],
    options: ['XOR as well', 'XNOR', 'NOR', 'OR'], answer: 1,
    whyNot: { 0: 'Swapping both inputs leaves "they differ" unchanged, but the output is read the other way too: H, which meant 1, now means 0.', 2: 'A NOR gives 1 only on one row; this device gives the same reading on two rows.', 3: 'Look at the row L, L: the inputs are equal, so the output is L, which is 1 in negative logic. An OR of 1, 1 is 1, but at H, H it is also 1 here, and an OR of 0, 0 is 0.' },
    hints: ['In negative logic every input and the output are complemented.', 'Complementing both inputs does not change whether they differ. Complementing the output turns "1 when they differ" into "1 when they are equal".', 'Equal inputs give 1: XNOR. (The dual of XOR is XNOR.)'],
    solution: 1, wrong: [0, 3],
  });
  ex({
    id: 'alg-ex-poslog-dual', chapter: 'alg-gates', title: 'Swapping the meaning of H and L', level: 2, kind: 'choice',
    text: ['A chip is sold as a quad two-input OR in positive logic. A designer uses it in a part of the board that works in negative logic (active-low signals). What does each gate do there?'],
    options: ['OR', 'AND', 'NOR', 'NAND'], answer: 1,
    whyNot: { 0: 'Its output is H when any input is H. In negative logic, H means 0: the output is 0 when any input is 0.', 2: 'There is no extra inversion: both the inputs and the output are reinterpreted, which dualises the function.', 3: 'The dual of OR keeps the complement count the same: no bubble appears.' },
    hints: ['Negative logic complements every input and the output: the function turns into its dual.', 'The dual swaps + and ·.', 'An OR in positive logic is an AND in negative logic.'],
    solution: 1, wrong: [0, 3], why: 'One device, two gates: changing the logic convention turns a function into its dual.',
  });

  // ===========================================================================================================
  // Chapter 2: the algebra of two values
  // ===========================================================================================================
  ex({
    id: 'alg-ex-axiom-dist', chapter: 'alg-laws', title: 'The distributive law ordinary arithmetic lacks', level: 1, kind: 'choice',
    text: ['Which of these holds in Boolean algebra but not for ordinary numbers?'],
    options: ['X(Y + Z) = XY + XZ', 'X + YZ = (X + Y)(X + Z)', 'X + Y = Y + X', 'X + 0 = X'], answer: 1,
    whyNot: { 0: 'AND over OR distributes just as multiplication over addition: 2 × (3 + 4) = 2 × 3 + 2 × 4.', 2: 'Addition of numbers is commutative too.', 3: 'Zero is the identity for addition of numbers as well.' },
    hints: ['Try each with numbers, say X = 2, Y = 3, Z = 4.', '2 + 3 × 4 = 14, but (2 + 3)(2 + 4) = 30.', 'OR distributing over AND, X + YZ = (X + Y)(X + Z), is Boolean only.'],
    solution: 1, wrong: [0, 2],
  });
  ex({
    id: 'alg-ex-refute', chapter: 'alg-laws', title: 'Find the rows that refute it', level: 2, kind: 'choice',
    text: ['Someone claims A(B + C) = AB + C. Which input rows (ABC) show that it is false? Choose every one.'],
    options: ['001', '011', '101', '110', '111'], answer: [0, 1],
    whyNot: {},
    hints: ['The two sides can only differ when C = 1, since with C = 0 both are AB.', 'With C = 1 the left side is A, and the right side is AB + 1 = 1.', 'They differ when A = 0 and C = 1: rows 001 and 011.'],
    solution: [0, 1], wrong: [[0], [0, 1, 2]], why: 'One falsifying row is enough to refute a claimed identity; here there are two.',
  });
  ex({
    id: 'alg-ex-dual-write', chapter: 'alg-laws', title: 'Write the dual', level: 1, kind: 'expr', ref: "A(B' + C)", vars: ['A', 'B', 'C'],
    text: ["Write the dual of A + B′C: swap + and ·, swap 0 and 1, and leave every literal as it is."],
    hints: ['A + B′C reads A + (B′·C): the · binds tighter.', 'Swapping gives A · (B′ + C); the bracket keeps the operands together.', "The dual is A(B′ + C)."],
    solution: "A(B' + C)", wrong: ["A'(B + C')", "AB' + C", "A + B'C"],
    why: 'The dual keeps every literal; complementing them as well would give the complement instead.',
  });
  ex({
    id: 'alg-ex-dual-law', chapter: 'alg-laws', title: 'The twin of absorption', level: 1, kind: 'choice',
    text: ['Absorption says X + XY = X. Which identity is its dual?'],
    options: ['X(X + Y) = X', "X′ + X′Y′ = X′", 'X + XY = Y', 'X(XY) = X'], answer: 0,
    whyNot: { 1: 'That complements the literals: it is true, but it is the same law with X′ and Y′ written in, not the dual.', 2: 'Not an identity at all: at X = 1, Y = 0 the left side is 1.', 3: 'X(XY) = XY, which is not X; the dual changes the inner · as well as the outer +.' },
    hints: ['Swap every + with · and every · with +.', 'X + X·Y becomes X · (X + Y).', 'X(X + Y) = X.'],
    solution: 0, wrong: [1, 3],
  });
  ex({
    id: 'alg-ex-pf-uniting-pos', chapter: 'alg-laws', title: 'Two sums that share a letter', level: 1, kind: 'proof', start: "(A + B)(A + B')", goal: 'A', laws: ['distributive-or', 'complement', 'identity'], maxSteps: 4,
    text: ["Prove (A + B)(A + B′) = A with the OR-over-AND distributive law, the complement law and the identity law, one step at a time."],
    hints: ['Both sums contain A: the OR-over-AND law runs backwards, X + YZ = (X + Y)(X + Z).', "That gives A + BB′. What is BB′?", "(A + B)(A + B′) = A + BB′ (distributive, OR over AND) = A + 0 (complement) = A (identity)."],
    solution: "A + BB' ; distributive-or\nA + 0 ; complement\nA ; identity",
    wrong: ["A + BB' ; distributive-or\nA ; identity", "A + B ; complement", "A + BB' ; distributive\nA + 0 ; complement\nA ; identity"],
    why: 'This is the uniting law in its product-of-sums form.',
  });
  ex({
    id: 'alg-ex-pf-absorb', chapter: 'alg-laws', title: 'Absorption from the axioms', level: 1, kind: 'proof', start: 'C + CD', goal: 'C', laws: ['distributive', 'null', 'identity'], maxSteps: 4,
    text: ['Prove C + CD = C without using absorption: factor, then use the null element and the identity.'],
    hints: ['C on its own is C·1, so both terms share C: factor it out.', 'C(1 + D): what is 1 + D?', 'C + CD = C(1 + D) (distributive) = C·1 (null element) = C (identity).'],
    solution: 'C(1 + D) ; distributive\nC·1 ; null\nC ; identity',
    wrong: ['C(1 + D) ; distributive\nC ; null', 'C ; absorption', 'C(1 + D) ; distributive\nC·D ; null'],
  });
  ex({
    id: 'alg-ex-pf-absorb2', chapter: 'alg-laws', title: 'The second absorption law', level: 2, kind: 'proof', start: "P + P'Q", goal: 'P + Q', laws: ['distributive-or', 'complement', 'identity'], maxSteps: 4,
    text: ['Prove P + P′Q = P + Q from the OR-over-AND distributive law, the complement law and the identity law.'],
    hints: ['X + YZ = (X + Y)(X + Z) with X = P, Y = P′, Z = Q.', "(P + P′)(P + Q): P + P′ is 1.", "P + P′Q = (P + P′)(P + Q) (distributive, OR over AND) = 1·(P + Q) (complement) = P + Q (identity)."],
    solution: "(P + P')(P + Q) ; distributive-or\n1·(P + Q) ; complement\nP + Q ; identity",
    wrong: ["(P + P')(P + Q) ; distributive-or\nP + Q ; complement", 'P + Q ; absorption2', "(P + P')(P + Q) ; distributive-or\n1·(P + Q) ; complement\nP ; identity"],
  });
  ex({
    id: 'alg-ex-pf-dual-absorb2', chapter: 'alg-laws', title: 'The same law, dualised', level: 2, kind: 'proof', start: "X(X' + Y)", goal: 'XY', laws: ['distributive', 'complement', 'identity'], maxSteps: 4,
    text: ['X(X′ + Y) = XY is the dual of X + X′Y = X + Y. Prove it with the dual steps: distribute, complement, identity.'],
    hints: ['Multiply out: X·X′ + X·Y.', 'XX′ = 0.', 'X(X′ + Y) = XX′ + XY (distributive) = 0 + XY (complement) = XY (identity).'],
    solution: "XX' + XY ; distributive\n0 + XY ; complement\nXY ; identity",
    wrong: ["XX' + XY ; distributive\n1 + XY ; complement", "XX' + XY ; distributive\nXY ; complement", "XX' + Y ; distributive"],
    why: 'Every step is the dual of a step in the proof of P + P′Q = P + Q: duality hands you the second proof for free.',
  });
  ex({
    id: 'alg-ex-pf-demorgan3', chapter: 'alg-laws', title: 'De Morgan with three variables', level: 1, kind: 'proof', start: "(A'B'C')'", goal: 'A + B + C', laws: ['demorgan', 'involution'], maxSteps: 5,
    text: ["Prove (A′B′C′)′ = A + B + C: one step of De Morgan, then remove the double complements one at a time."],
    hints: ['De Morgan for three: (XYZ)′ = X′ + Y′ + Z′.', "That gives A′′ + B′′ + C′′. Involution says X′′ = X.", "A′′ + B′′ + C′′ (De Morgan), A + B′′ + C′′, A + B + C′′, A + B + C (involution three times)."],
    solution: "A'' + B'' + C'' ; demorgan\nA + B'' + C'' ; involution\nA + B + C'' ; involution\nA + B + C ; involution",
    wrong: ["A'' + B'' + C'' ; demorgan\nA + B + C ; involution", "A' + B' + C' ; demorgan", "A + B + C ; demorgan"],
    why: 'A NAND of complemented inputs is an OR: the bubble picture of the same law.',
  });
  ex({
    id: 'alg-ex-pf-demorgan-chain', chapter: 'alg-laws', title: 'A complement pushed to the inputs', level: 2, kind: 'proof', start: "(A'B + C)'", goal: "AC' + B'C'", laws: ['demorgan', 'involution', 'distributive'], maxSteps: 5,
    text: ["Push the complement of (A′B + C)′ down to the variables and multiply out, to reach AC′ + B′C′."],
    hints: ['The outer operator is +: De Morgan turns (X + Y)′ into X′Y′.', "(A′B)′C′; now De Morgan again on (A′B)′, then remove A′′.", "(A′B)′C′ (De Morgan) = (A′′ + B′)C′ (De Morgan) = (A + B′)C′ (involution) = AC′ + B′C′ (distributive)."],
    solution: "(A'B)'C' ; demorgan\n(A'' + B')C' ; demorgan\n(A + B')C' ; involution\nAC' + B'C' ; distributive",
    wrong: ["(A'B)' + C' ; demorgan", "(A + B')C' ; demorgan\nAC' + B'C' ; distributive", "(A'B)'C' ; demorgan\n(A + B')C' ; demorgan"],
  });
  ex({
    id: 'alg-ex-pf-demorgan-pos', chapter: 'alg-laws', title: 'The complement of a product of sums', level: 3, kind: 'proof', start: "((A + B')(C' + D))'", goal: "A'B + CD'", laws: ['demorgan', 'involution'], maxSteps: 6,
    text: ["Find the complement of (A + B′)(C′ + D) as a sum of products, step by step: prove ((A + B′)(C′ + D))′ = A′B + CD′."],
    hints: ['The outermost operator under the complement is ·: it becomes a + of two complements.', "(A + B′)′ + (C′ + D)′; each of those is De Morgan again.", "(A + B′)′ + (C′ + D)′, A′B′′ + (C′ + D)′, A′B + (C′ + D)′, A′B + C′′D′, A′B + CD′."],
    solution: "(A + B')' + (C' + D)' ; demorgan\nA'B'' + (C' + D)' ; demorgan\nA'B + (C' + D)' ; involution\nA'B + C''D' ; demorgan\nA'B + CD' ; involution",
    wrong: ["(A + B')'(C' + D)' ; demorgan", "A'B + CD' ; demorgan", "(A + B')' + (C' + D)' ; demorgan\nA'B + (C' + D)' ; demorgan"],
    why: 'The complement of a product of sums is a sum of products of the complemented literals.',
  });
  ex({
    id: 'alg-ex-pf-uniting-sop', chapter: 'alg-laws', title: 'Three products to two letters', level: 2, kind: 'proof', start: "A'B' + A'B + AB'", maxLiterals: 2, laws: ['uniting', 'absorption2'], maxSteps: 3,
    text: ["Simplify A′B′ + A′B + AB′ to two literals with the uniting law and the second absorption law."],
    hints: ['A′B′ and A′B differ only in B.', "Uniting gives A′ + AB′. Next to A′, the A in AB′ is redundant.", "A′B′ + A′B + AB′ = A′ + AB′ (uniting) = A′ + B′ (absorption, second form)."],
    solution: "A' + AB' ; uniting\nA' + B' ; absorption2",
    wrong: ["A' + AB' ; uniting", "A' + B' ; uniting", "A' + AB' ; absorption\nA' + B' ; absorption2"],
    why: 'A′ + B′ is (AB)′: the function is a NAND.',
  });
  ex({
    id: 'alg-ex-pf-consensus', chapter: 'alg-laws', title: 'Absorb, then drop the consensus', level: 2, kind: 'proof', start: "AB'C + AB' + BC + AC", maxLiterals: 4, laws: ['absorption', 'consensus'], maxSteps: 3,
    text: ["Simplify AB′C + AB′ + BC + AC to four literals with absorption and consensus."],
    hints: ["AB′C lies inside AB′: absorption removes it.", "Now AB′ + BC + AC. AB′ and BC disagree in B; the rest of them, A and C, make the consensus AC.", "AB′C + AB′ + BC + AC = AB′ + BC + AC (absorption) = AB′ + BC (consensus)."],
    solution: "AB' + BC + AC ; absorption\nAB' + BC ; consensus",
    wrong: ["AB' + BC + AC ; absorption", "AB' + AC ; consensus", "AB' + BC ; absorption"],
    why: 'AC is covered twice over: by AB′ where B = 0 and by BC where B = 1.',
  });
  ex({
    id: 'alg-ex-pf-consensus-pos', chapter: 'alg-laws', title: 'Consensus among sums', level: 2, kind: 'proof', start: "(A + B')(A' + C)(B' + C)", goal: "(A + B')(A' + C)", laws: ['consensus'], maxSteps: 1,
    text: ["One of the three sums in (A + B′)(A′ + C)(B′ + C) adds nothing. Remove it with a single consensus step."],
    hints: ['The dual consensus law: (X + Y)(X′ + Z)(Y + Z) = (X + Y)(X′ + Z).', 'Which two sums disagree in one variable? A + B′ and A′ + C disagree in A.', "Their consensus is B′ + C, so (A + B′)(A′ + C)(B′ + C) = (A + B′)(A′ + C)."],
    solution: "(A + B')(A' + C) ; consensus",
    wrong: ["(A + B')(B' + C) ; consensus", "(A' + C)(B' + C) ; consensus", "(A + B')(A' + C) ; absorption"],
  });
  ex({
    id: 'alg-ex-pf-expand', chapter: 'alg-laws', title: 'Multiply out, then tidy up', level: 3, kind: 'proof', start: "(A + B)(A' + C)", goal: "AC + A'B", laws: ['distributive', 'complement', 'identity', 'consensus'], maxSteps: 6,
    text: ["Prove (A + B)(A′ + C) = AC + A′B. Multiply out one product at a time, remove the term that is always 0, and finish with consensus."],
    hints: ['First distribute over the second bracket: (A + B)A′ + (A + B)C. Then distribute each of those, one at a time.', "After both are multiplied out: AA′ + BA′ + AC + BC. AA′ = 0, and 0 + X = X.", "(A + B)A′ + (A + B)C, AA′ + BA′ + (A + B)C, AA′ + BA′ + AC + BC (distributive ×3), 0 + A′B + AC + BC (complement), A′B + AC + BC (identity), A′B + AC (consensus: BC is the consensus of A′B and AC)."],
    solution: "(A + B)A' + (A + B)C ; distributive\nAA' + BA' + (A + B)C ; distributive\nAA' + BA' + AC + BC ; distributive\n0 + A'B + AC + BC ; complement\nA'B + AC + BC ; identity\nA'B + AC ; consensus",
    wrong: ["(A + B)A' + (A + B)C ; distributive\nAA' + BA' + AC + BC ; distributive", "AC + A'B ; distributive", "(A + B)A' + (A + B)C ; distributive\nAA' + BA' + (A + B)C ; distributive\nAA' + BA' + AC + BC ; distributive\n0 + A'B + AC + BC ; complement\nA'B + AC + BC ; identity"],
    why: 'A product of two sums that disagree in one variable multiplies out to just two terms.',
  });
  ex({
    id: 'alg-ex-pf-majority', chapter: 'alg-laws', title: 'Four minterms to the majority', level: 3, kind: 'proof', start: "ABC + AB'C + A'BC + ABC'", maxLiterals: 6, laws: ['uniting', 'absorption2'], maxSteps: 4,
    text: ["F = ABC + AB′C + A′BC + ABC′ is 1 when at least two of A, B, C are 1. Bring it down to six literals with the uniting law and the second absorption law."],
    hints: ['ABC and AB′C differ only in B: unite them into AC.', "Now AC + A′BC + ABC′. With C common to the first two, the A′ in A′BC is redundant next to A (absorption, second form); likewise next to AC the C′ in ABC′ is redundant.", "AC + A′BC + ABC′ (uniting), AC + BC + ABC′ (absorption, second form), AC + BC + AB (absorption, second form)."],
    solution: "AC + A'BC + ABC' ; uniting\nAC + BC + ABC' ; absorption2\nAC + BC + AB ; absorption2",
    wrong: ["AC + A'BC + ABC' ; uniting\nAC + BC + ABC' ; absorption2", "AC + BC + AB ; uniting", "AC + A'BC + ABC' ; uniting\nAC + A'B + ABC' ; absorption2"],
    why: 'AB + AC + BC is the majority of three, the carry of a full adder.',
  });
  ex({
    id: 'alg-ex-pf-tautology', chapter: 'alg-laws', title: 'Always 1', level: 2, kind: 'proof', start: "AB + A'B + B'", goal: '1', laws: ['distributive', 'complement', 'identity'], maxSteps: 4,
    text: ["Prove that AB + A′B + B′ is 1 for every input."],
    hints: ['AB and A′B share B: factor it out.', "(A + A′)B + B′; A + A′ = 1, and 1·B = B.", "(A + A′)B + B′ (distributive) = 1·B + B′ (complement) = B + B′ (identity) = 1 (complement)."],
    solution: "(A + A')B + B' ; distributive\n1·B + B' ; complement\nB + B' ; identity\n1 ; complement",
    wrong: ["(A + A')B + B' ; distributive\nB + B' ; complement", "(A + A')B + B' ; distributive\n1·B + B' ; complement\nB + B' ; identity", "1 ; complement"],
  });
  ex({
    id: 'alg-ex-pf-xnor', chapter: 'alg-laws', title: 'Spot the XNOR', level: 2, kind: 'proof', start: "A'B' + AB", goal: "(A ^ B)'", laws: ['xor-fold', 'xor-not'], maxSteps: 2,
    text: ["A′B′ + AB is 1 when A and B are equal. Prove that it is (A ⊕ B)′, using the XOR laws."],
    hints: ['XY′ + X′Y = X ⊕ Y. Here, with X = A′ and Y = B, A′B′ + AB is X·Y′ + X′·Y.', "That gives A′ ⊕ B. A complement can move out of an XOR.", "A′B′ + AB = A′ ⊕ B (recognise an XOR) = (A ⊕ B)′ (complement through XOR)."],
    solution: "A' ^ B ; xor-fold\n(A ^ B)' ; xor-not",
    wrong: ["A ^ B ; xor-fold", "A' ^ B ; xor-fold\nA ^ B' ; xor-fold", "(A ^ B)' ; demorgan"],
  });
  ex({
    id: 'alg-ex-pf-xor-cancel', chapter: 'alg-laws', title: 'XOR undoes itself', level: 1, kind: 'proof', start: '(A ^ B) ^ B', goal: 'A', laws: ['xor-self', 'xor-identity'], maxSteps: 3,
    text: ['XOR the same bit B in twice. Prove (A ⊕ B) ⊕ B = A: regroup (associativity is free), then use X ⊕ X = 0 and X ⊕ 0 = X.'],
    hints: ['Regroup: A ⊕ (B ⊕ B).', 'B ⊕ B = 0.', 'A ⊕ (B ⊕ B) (associative) = A ⊕ 0 (XOR with itself) = A (XOR with 0).'],
    solution: 'A ^ (B ^ B) ; associative\nA ^ 0 ; xor-self\nA ; xor-identity',
    wrong: ['A ^ (B ^ B) ; associative\nA ^ 1 ; xor-self', 'A ^ 0 ; xor-identity', 'A ; xor-self'],
    why: 'This is why the same XOR gate both scrambles and unscrambles a bit with a key.',
  });
  ex({
    id: 'alg-ex-pf-two-nors', chapter: 'alg-laws', title: 'Two NORs into an OR', level: 3, kind: 'proof', start: "(A + B)' + (A' + B)'", maxLiterals: 1, laws: ['demorgan', 'involution', 'uniting'], maxSteps: 4,
    text: ["Two NOR gates feed an OR gate: F = (A + B)′ + (A′ + B)′. Show, one law at a time, that F is a single literal."],
    hints: ['De Morgan on each NOR: (X + Y)′ = X′Y′.', "A′B′ + A′′B′; remove the double complement.", "A′B′ + (A′ + B)′ (De Morgan), A′B′ + A′′B′ (De Morgan), A′B′ + AB′ (involution), B′ (uniting)."],
    solution: "A'B' + (A' + B)' ; demorgan\nA'B' + A''B' ; demorgan\nA'B' + AB' ; involution\nB' ; uniting",
    wrong: ["A'B' + (A' + B)' ; demorgan\nA'B' + AB' ; demorgan", "A'B' + AB' ; demorgan", "A'B' + (A' + B)' ; demorgan\nA'B' + A''B' ; demorgan\nA'B' + AB' ; involution"],
    why: 'Three gates do the work of one inverter on B.',
  });
  ex({
    id: 'alg-ex-pf-three-maxterms', chapter: 'alg-laws', title: 'Three maxterms to a sum of products', level: 3, kind: 'proof', start: "(A + B + C)(A + B' + C)(A' + B + C)", goal: 'AB + C', laws: ['uniting', 'absorption2', 'distributive-or'], maxSteps: 4,
    text: ["F = (A + B + C)(A + B′ + C)(A′ + B + C) is a canonical product of three maxterms. Prove that F = AB + C, using the uniting law, the second absorption law and the OR-over-AND distributive law (all in their product-of-sums forms where needed)."],
    hints: ['The first two sums differ only in B: unite them.', "(A + C)(A′ + B + C): next to A + C, the A′ in the second sum is redundant (the dual of X + X′Y = X + Y).", "(A + C)(A′ + B + C) (uniting) = (A + C)(B + C) (absorption, second form) = C + AB (distributive, OR over AND)."],
    solution: "(A + C)(A' + B + C) ; uniting\n(A + C)(B + C) ; absorption2\nC + AB ; distributive-or",
    wrong: ["(A + C)(A' + B + C) ; uniting\n(A + C)(B + C) ; absorption2", "(A + C)(B + C) ; uniting", "(A + C)(A' + B + C) ; uniting\n(A + C)(B + C) ; absorption2\nC + AB ; distributive"],
    why: 'Three 0s of a three-variable function, read as a product of sums, and five 1s as a sum of products: AB + C.',
  });
  ex({
    id: 'alg-ex-simplify-b', chapter: 'alg-laws', title: 'Three terms, one letter', level: 1, kind: 'simplify', expr: "A'BC + A'BC' + AB", vars: ['A', 'B', 'C'], form: 'sop', maxLiterals: 1,
    text: ["Simplify F = A′BC + A′BC′ + AB to a single literal."],
    hints: ['A′BC and A′BC′ differ only in C.', 'They unite to A′B. Then A′B + AB.', 'A′B + AB = B(A′ + A) = B.'],
    solution: 'B', wrong: ["A'B + AB", 'A', "A'B"],
  });
  ex({
    id: 'alg-ex-simplify-xyz', chapter: 'alg-laws', title: 'Five minterms, three literals', level: 2, kind: 'simplify', expr: "X'Y'Z + X'YZ + XY'Z + XYZ' + XYZ", vars: ['X', 'Y', 'Z'], form: 'sop', maxLiterals: 3,
    text: ["Simplify F = X′Y′Z + X′YZ + XY′Z + XYZ′ + XYZ to a sum of products with three literals."],
    hints: ['Four of the terms have Z; between them they cover every setting of X and Y.', 'Those four give Z. What is left is XYZ′.', 'Z + XYZ′ = Z + XY (absorption, second form): F = Z + XY.'],
    solution: 'Z + XY', wrong: ["Z + XYZ'", 'Z + X', "XY + Z'"],
  });
  ex({
    id: 'alg-ex-simplify-pos', chapter: 'alg-laws', title: 'A product of sums, shortened', level: 3, kind: 'simplify', expr: "(A + B)(A + C)(B' + C')", vars: ['A', 'B', 'C'], form: 'pos', maxLiterals: 3,
    text: ["Simplify F = (A + B)(A + C)(B′ + C′) to a product of sums with three literals."],
    hints: ['(A + B)(A + C) = A + BC by the OR-over-AND distributive law.', "(A + BC)(B′ + C′): BC and B′ + C′ are complements of each other.", "A(B′ + C′): when A = 0 the first factor is BC and the second its complement, so F = 0; when A = 1, F = B′ + C′."],
    solution: "A(B' + C')", wrong: ["AB' + AC'", '(A + B)(A + C)', "A(B + C')"],
  });
  ex({
    id: 'alg-ex-root', chapter: 'alg-laws', title: 'Which gate drives the output?', level: 1, kind: 'choice',
    text: ["In F = A + B′C ⊕ D, which operator is applied last, so that its gate drives F? Precedence, tightest first: NOT, AND, XOR, OR."],
    options: ['NOT', 'AND', 'XOR', 'OR'], answer: 3,
    whyNot: { 0: 'The NOT binds only to B.', 1: 'The AND binds B′ and C first.', 2: 'XOR binds B′C and D, but OR is looser still.' },
    hints: ['Bracket from the tightest: B′, then B′C, then (B′C) ⊕ D.', 'What is left is A + ((B′C) ⊕ D).', 'The OR is the root: an OR gate drives F.'],
    solution: 3, wrong: [2, 1],
  });
  ex({
    id: 'alg-ex-read-circuit', chapter: 'alg-laws', title: 'From gates to an expression', level: 2, kind: 'expr', ref: "(A + B')C + D", vars: ['A', 'B', 'C', 'D'], maxLiterals: 4,
    text: ['Read this circuit back into one expression for F, with at most four literals.', { circuit: 'nb = NOT(B)\nn1 = OR(A, nb)\nn2 = AND(n1, C)\nF = OR(n2, D)', outputs: ['F'] }],
    hints: ['Name each gate: n1 = A + B′.', 'n2 = (A + B′)C, and F = n2 + D.', "F = (A + B′)C + D. The bracket matters: A + B′C + D is a different function."],
    solution: "(A + B')C + D", wrong: ["A + B'C + D", "(A + B)C + D", "AC + B'C + D"],
  });
  ex({
    id: 'alg-ex-tree-circuit', chapter: 'alg-laws', title: 'Draw the tree as gates', level: 1, kind: 'circuit', ref: "(A + B')C", inputs: ['A', 'B', 'C'], outputs: ['F'], parts: ['AND', 'OR', 'NOT'], maxGates: 3,
    text: ["Build F = (A + B′)C from AND, OR and NOT gates, at most three of them: one gate for each operator node of the expression tree."],
    hints: ['The tree has three operators: NOT over B, OR over A and B′, AND at the root.', 'The root is the AND: its gate drives F, with the OR and C as its inputs.', 'nb = NOT(B), o = OR(A, nb), F = AND(o, C).'],
    solution: 'nb = NOT(B)\no = OR(A, nb)\nF = AND(o, C)',
    wrong: ['nb = NOT(B)\na = AND(nb, C)\nF = OR(A, a)', 'o = OR(A, B)\nF = AND(o, C)', 'nb = NOT(B)\no = OR(A, nb)\nF = NAND(o, C)'],
    why: 'Moving the bracket in A + B′C would swap the roles of the AND and the OR.',
  });
  ex({
    id: 'alg-ex-xor-andor', chapter: 'alg-laws', title: 'XOR from AND, OR and NOT', level: 2, kind: 'circuit', ref: 'A ^ B', inputs: ['A', 'B'], outputs: ['F'], parts: ['AND', 'OR', 'NOT'], maxGates: 5,
    text: ["Build F = A ⊕ B from AND, OR and NOT gates, at most five, using the definition A ⊕ B = AB′ + A′B."],
    hints: ['Two inverters make A′ and B′.', 'Two ANDs make AB′ and A′B; an OR joins them.', 'na = NOT(A), nb = NOT(B), t1 = AND(A, nb), t2 = AND(na, B), F = OR(t1, t2).'],
    solution: 'na = NOT(A)\nnb = NOT(B)\nt1 = AND(A, nb)\nt2 = AND(na, B)\nF = OR(t1, t2)',
    wrong: ['na = NOT(A)\nnb = NOT(B)\nt1 = AND(A, B)\nt2 = AND(na, nb)\nF = OR(t1, t2)', 'F = XOR(A, B)', 'na = NOT(A)\nnb = NOT(B)\nt1 = AND(A, nb)\nt2 = AND(na, B)\nF = AND(t1, t2)'],
  });
  ex({
    id: 'alg-ex-bracket-table', chapter: 'alg-laws', title: 'Move the bracket, change the table', level: 2, kind: 'truthtable', expr: "(A + B')C", vars: ['A', 'B', 'C'],
    text: ["Fill in the truth table of F = (A + B′)C. Compare it in your head with A + B′C."],
    hints: ['F needs C = 1: every row with C = 0 gives 0.', 'With C = 1, F = A + B′: 0 only when A = 0 and B = 1.', 'Rows 000 to 111: F = 0, 1, 0, 0, 0, 1, 0, 1.'],
    solution: { '000|F': '0', '001|F': '1', '010|F': '0', '011|F': '0', '100|F': '0', '101|F': '1', '110|F': '0', '111|F': '1' },
    wrong: [{ '000|F': '0', '001|F': '1', '010|F': '0', '011|F': '0', '100|F': '1', '101|F': '1', '110|F': '1', '111|F': '1' }, { '000|F': '0', '001|F': '1', '010|F': '0', '011|F': '1', '100|F': '0', '101|F': '1', '110|F': '0', '111|F': '1' }],
  });

  // ===========================================================================================================
  // Chapter 3: functions and their standard forms
  // ===========================================================================================================
  ex({
    id: 'alg-ex-count', chapter: 'alg-forms', title: 'How many functions?', level: 1, kind: 'number', answer: 256,
    text: ['How many different Boolean functions of three variables are there?'],
    hints: ['Three variables give 2³ = 8 rows.', 'A function is any choice of the 8 output bits.', '2⁸ = 256.'],
    solution: 256, wrong: [8, 16, 64],
  });
  ex({
    id: 'alg-ex-sixteen', chapter: 'alg-forms', title: 'Name the column', level: 2, kind: 'choice',
    text: ['Over the rows AB = 00, 01, 10, 11, a function of two variables has the output column 1101. Which is it?'],
    options: ['A + B′', 'A′ + B', 'AB′', '(A ⊕ B)′'], answer: 1,
    whyNot: { 0: 'A + B′ is 0 only at AB = 01; this column is 0 at AB = 10.', 2: 'AB′ is 1 on a single row.', 3: 'XNOR is 1 on two rows, 00 and 11.' },
    hints: ['The column has a single 0, at row 10 (A = 1, B = 0).', 'A function with one 0 is a single maxterm: the sum that is 0 at A = 1, B = 0.', 'M2 = A′ + B, the implication "A implies B".'],
    solution: 1, wrong: [0, 3],
  });
  ex({
    id: 'alg-ex-classify', chapter: 'alg-forms', title: 'What kind of function is AB + C?', level: 2, kind: 'choice',
    text: ['Which of these describe F = AB + C? Choose every one that holds.'],
    options: ['self-dual', 'symmetric', 'monotone', 'a threshold function'], answer: [2, 3],
    hints: ['Self-dual: rows 001 and 110 are complements; do they give complementary outputs? Symmetric: do 001 and 010 give the same output?', 'Monotone: no complemented letter appears, so raising an input never lowers F.', 'Monotone and threshold (F = 1 exactly when 2A + 1B + 3C ≥ 3); not self-dual (001 and 110 both give 1), not symmetric (001 gives 1, 010 gives 0).'],
    solution: [2, 3], wrong: [[1, 2, 3], [2]],
  });
  ex({
    id: 'alg-ex-selfdual', chapter: 'alg-forms', title: 'Which ones are their own dual?', level: 3, kind: 'choice',
    text: ['Which of these functions are self-dual? Choose every one.'],
    options: ['AB + AC + BC', 'A ⊕ B', 'A ⊕ B ⊕ C', 'AB + C'], answer: [0, 2],
    hints: ['A function is self-dual when complementing every input complements the output: F(x′) = F(x)′ on every row.', 'Try rows 000 and 111 first: a self-dual function must give 0 at one and 1 at the other.', 'The majority and the three-input XOR are self-dual. A ⊕ B gives 0 at both 00 and 11; AB + C gives 1 at both 001 and 110.'],
    solution: [0, 2], wrong: [[0, 1, 2], [0]],
  });
  ex({
    id: 'alg-ex-minterms', chapter: 'alg-forms', title: 'The minterm list of an expression', level: 2, kind: 'set', answer: '{2, 4, 5, 6}',
    text: ["List the minterms of F = AB′ + BC′ over A, B, C (A the most significant bit), as a set like {1, 3}."],
    hints: ['AB′ is 1 when A = 1 and B = 0, whatever C is: rows 100 and 101.', 'BC′ is 1 when B = 1 and C = 0: rows 010 and 110.', 'F = Σm(2, 4, 5, 6).'],
    solution: '{2, 4, 5, 6}', wrong: ['{4, 5, 2}', '{4, 5, 2, 6, 7}'],
  });
  ex({
    id: 'alg-ex-canon-sop', chapter: 'alg-forms', title: 'Canonical sum of products from a table', level: 2, kind: 'string', placeholder: "e.g. A'B'C + ...",
    accept: canonical(['A', 'B', 'C'], [1, 2, 6], 'sop'),
    text: ['Write the canonical sum of products (one minterm per 1 of the table) of this function.', tableOf(['A', 'B', 'C'], [1, 2, 6])],
    hints: ['The 1s are at rows 001, 010 and 110.', 'Each row gives a minterm: a letter is complemented where its bit is 0.', "F = A′B′C + A′BC′ + ABC′."],
    solution: "A'B'C + A'BC' + ABC'", wrong: ["A'B'C + BC'", "A'B'C + A'BC' + ABC", "AB'C' + A'BC' + ABC'"],
  });
  ex({
    id: 'alg-ex-canon-pos', chapter: 'alg-forms', title: 'Canonical product of sums from a table', level: 3, kind: 'string', placeholder: "e.g. (A + B + C')(...)",
    accept: canonical(['A', 'B', 'C'], [0, 3, 4, 5, 7], 'pos'),
    text: ['Write the canonical product of sums (one maxterm per 0 of the table) of this function.', tableOf(['A', 'B', 'C'], [0, 3, 4, 5, 7])],
    hints: ['The 0s are at rows 001, 010 and 110.', 'Each 0 gives a maxterm: a letter is complemented where its bit is 1.', "F = (A + B + C′)(A + B′ + C)(A′ + B′ + C)."],
    solution: "(A + B + C')(A + B' + C)(A' + B' + C)", wrong: ["(A' + B' + C)(A' + B + C')(A + B + C')", "(A + B + C')(B' + C)", "(A + B + C')(A + B' + C)"],
  });
  ex({
    id: 'alg-ex-sigma-pi', chapter: 'alg-forms', title: 'From Σm to ΠM', level: 1, kind: 'set', answer: '{1, 4, 5}',
    text: ['F = Σm(0, 2, 3, 6, 7) over three variables. List its maxterms (the numbers of ΠM), as a set.'],
    hints: ['Every row number from 0 to 7 is either a minterm or a maxterm of F.', 'Take away 0, 2, 3, 6, 7 from 0 … 7.', 'F = ΠM(1, 4, 5).'],
    solution: '{1, 4, 5}', wrong: ['{0, 2, 3, 6, 7}', '{1, 4}', '{6, 5, 4}'],
  });
  ex({
    id: 'alg-ex-pi-sigma-dc', chapter: 'alg-forms', title: 'From ΠM back to Σm, with don\'t-cares', level: 2, kind: 'set', answer: '{2, 3, 5, 7, 8, 9, 10, 12, 14}',
    text: ['F = ΠM(1, 4, 6, 11, 13) · D(0, 15) over four variables: the D rows are don\'t-cares. List the minterms of F (not counting don\'t-cares), as a set.'],
    hints: ['16 rows: 5 maxterms, 2 don\'t-cares, and the rest are minterms.', 'Remove 0, 1, 4, 6, 11, 13 and 15 from 0 … 15.', 'Σm(2, 3, 5, 7, 8, 9, 10, 12, 14) + d(0, 15).'],
    solution: '{2, 3, 5, 7, 8, 9, 10, 12, 14}', wrong: ['{0, 2, 3, 5, 7, 8, 9, 10, 12, 14, 15}', '{2, 3, 5, 7, 8, 9, 10, 12}'],
  });
  ex({
    id: 'alg-ex-complement-list', chapter: 'alg-forms', title: 'The complement\'s minterms', level: 2, kind: 'set', answer: '{0, 2, 3, 7}',
    text: ["F = Σm(1, 4, 5, 6) over three variables. List the minterms of F′, as a set."],
    hints: ['F′ is 1 exactly where F is 0.', 'So the minterms of F′ are the maxterms of F.', "F′ = Σm(0, 2, 3, 7)."],
    solution: '{0, 2, 3, 7}', wrong: ['{1, 4, 5, 6}', '{6, 3, 2, 1}'],
    why: 'F = ΠM(0, 2, 3, 7) and F′ = Σm(0, 2, 3, 7): the same list, read the other way.',
  });
  ex({
    id: 'alg-ex-expand', chapter: 'alg-forms', title: 'Expand a short term', level: 2, kind: 'set', answer: '{1, 2, 3, 6, 7}',
    text: ["Expand F = A′C + B into minterms over A, B, C. List them as a set."],
    hints: ["A′C lacks B: A′C(B + B′) = A′BC + A′B′C, rows 011 and 001.", 'B lacks A and C: it covers every row with B = 1: 010, 011, 110, 111.', 'Together, keeping 3 once: Σm(1, 2, 3, 6, 7).'],
    solution: '{1, 2, 3, 6, 7}', wrong: ['{1, 3, 2, 3, 6, 7, 8}', '{1, 2, 6, 7}'],
  });
  ex({
    id: 'alg-ex-expand-pos', chapter: 'alg-forms', title: 'Expand a product of sums', level: 2, kind: 'set', answer: '{1, 2, 3, 6}',
    text: ["Expand F = (A + C′)(B′ + C) into maxterms over A, B, C. List the maxterm numbers as a set."],
    hints: ["A + C′ is 0 when A = 0 and C = 1, whatever B is: rows 001 and 011.", "B′ + C is 0 when B = 1 and C = 0: rows 010 and 110.", 'F = ΠM(1, 2, 3, 6).'],
    solution: '{1, 2, 3, 6}', wrong: ['{0, 4, 5, 7}', '{1, 3, 2}'],
  });
  ex({
    id: 'alg-ex-expand-4', chapter: 'alg-forms', title: 'Expand over four variables', level: 3, kind: 'set', answer: '{1, 5, 6, 8, 9, 10, 11, 13}',
    text: ["Expand F = AB′ + C′D + A′BCD′ into minterms over A, B, C, D (A the most significant bit). List them as a set."],
    hints: ["AB′ lacks C and D: it covers 1000 to 1011, rows 8, 9, 10, 11.", "C′D lacks A and B: rows 0001, 0101, 1001, 1101 = 1, 5, 9, 13. A′BCD′ is already a minterm: 0110 = 6.", 'Together, keeping 9 once: Σm(1, 5, 6, 8, 9, 10, 11, 13).'],
    solution: '{1, 5, 6, 8, 9, 10, 11, 13}', wrong: ['{1, 5, 6, 8, 9, 10, 11}', '{1, 5, 6, 8, 9, 10, 11, 13, 14}'],
  });
  ex({
    id: 'alg-ex-complement', chapter: 'alg-forms', title: 'The complement of a function', level: 1, kind: 'expr', ref: "(A' + B)C'", vars: ['A', 'B', 'C'],
    text: ["Write F′ for F = AB′ + C."],
    hints: ['De Morgan on the whole: (AB′ + C)′ = (AB′)′ · C′.', "(AB′)′ = A′ + B.", "F′ = (A′ + B)C′."],
    solution: "(A' + B)C'", wrong: ["(A + B')C", "A'B + C'", "(A' + B) + C'"],
    why: 'The dual (A + B′)C swaps the operators only; the complement also complements every literal.',
  });
  ex({
    id: 'alg-ex-complement-5', chapter: 'alg-forms', title: 'A complement with five variables', level: 3, kind: 'expr', ref: "A'(B + C') + DE'", vars: ['A', 'B', 'C', 'D', 'E'],
    text: ["Write F′ for F = (A + B′C)(D′ + E), with the complement pushed down to the variables."],
    hints: ['The outer operator is ·: (XY)′ = X′ + Y′.', "(A + B′C)′ = A′(B′C)′ = A′(B + C′), and (D′ + E)′ = DE′.", "F′ = A′(B + C′) + DE′."],
    solution: "A'(B + C') + DE'", wrong: ["A'(B + C')DE'", "A(B' + C) + D'E", "A'B + C' + DE'"],
  });
  ex({
    id: 'alg-ex-dual-fn', chapter: 'alg-forms', title: 'The dual of a function', level: 2, kind: 'expr', ref: "(A' + B)(A + C')", vars: ['A', 'B', 'C'],
    text: ["Write the dual of F = A′B + AC′."],
    hints: ['Swap every + and ·; keep the literals.', 'A′B + AC′ = (A′·B) + (A·C′): the dual is (A′ + B)·(A + C′).', "Fᵈ = (A′ + B)(A + C′)."],
    solution: "(A' + B)(A + C')", wrong: ["(A + B')(A' + C)", "A'B + AC'", "A' + BA + C'"],
    why: 'The complement would be (A + B′)(A′ + C): it complements the literals too.',
  });

  // ===========================================================================================================
  // Chapter 4: NAND, NOR and XOR
  // ===========================================================================================================
  ex({
    id: 'alg-ex-one-gate', chapter: 'alg-nandxor', title: 'One gate for three complements', level: 2, kind: 'circuit', ref: "A' + B' + C'", inputs: ['A', 'B', 'C'], outputs: ['F'], parts: ['AND', 'OR', 'NAND', 'NOR'], maxGates: 1,
    text: ["F = A′ + B′ + C′. Build it with a single gate (no inverters)."],
    hints: ['An OR of complemented inputs is an OR with bubbles on its inputs.', 'Slide the bubbles through to the output: De Morgan turns the OR into an AND.', 'F = (ABC)′: one three-input NAND, F = NAND(A, B, C).'],
    solution: 'F = NAND(A, B, C)',
    wrong: ['F = NOR(A, B, C)', 'F = NAND(A, B)', 'F = OR(A, B, C)'],
  });
  ex({
    id: 'alg-ex-nand-pos', chapter: 'alg-nandxor', title: 'A product of sums in NAND gates', level: 3, kind: 'circuit', ref: "(A + B')(C + D)", inputs: ['A', 'B', 'C', 'D'], outputs: ['F'], parts: ['NAND'], maxGates: 7,
    text: ["NAND gates suit sums of products, but they can build anything. Build F = (A + B′)(C + D) from at most seven two-input NAND gates, with only A, B, C and D available."],
    hints: ['A + B′ = (A′B)′: a NAND of A′ and B. C + D = (C′D′)′: a NAND of C′ and D′.', 'Three inverters (NANDs with tied inputs) give A′, C′ and D′. The AND of the two sums is a NAND followed by an inverter.', "na = NAND(A, A), s1 = NAND(na, B), nc = NAND(C, C), nd = NAND(D, D), s2 = NAND(nc, nd), g = NAND(s1, s2), F = NAND(g, g)."],
    solution: 'na = NAND(A, A)\ns1 = NAND(na, B)\nnc = NAND(C, C)\nnd = NAND(D, D)\ns2 = NAND(nc, nd)\ng = NAND(s1, s2)\nF = NAND(g, g)',
    wrong: ['na = NAND(A, A)\ns1 = NAND(na, B)\nnc = NAND(C, C)\nnd = NAND(D, D)\ns2 = NAND(nc, nd)\nF = NAND(s1, s2)', 's1 = NAND(A, B)\ns2 = NAND(C, D)\ng = NAND(s1, s2)\nF = NAND(g, g)'],
    why: 'Seven NANDs against four NORs for the same function: pick the gate that matches the form.',
  });
  ex({
    id: 'alg-ex-nand-or', chapter: 'alg-nandxor', title: 'OR from NAND gates', level: 1, kind: 'circuit', ref: 'A + B', inputs: ['A', 'B'], outputs: ['F'], parts: ['NAND'], maxGates: 3,
    text: ['Build F = A + B from at most three NAND gates and nothing else.'],
    hints: ['A NAND with both inputs tied together is an inverter.', 'De Morgan: A + B = (A′B′)′, a NAND of the complements.', 'na = NAND(A, A), nb = NAND(B, B), F = NAND(na, nb).'],
    solution: 'na = NAND(A, A)\nnb = NAND(B, B)\nF = NAND(na, nb)',
    wrong: ['F = NAND(A, B)', 'na = NAND(A, A)\nnb = NAND(B, B)\nF = AND(na, nb)', 'n = NAND(A, B)\nF = NAND(n, n)'],
  });
  ex({
    id: 'alg-ex-nor-and', chapter: 'alg-nandxor', title: 'AND from NOR gates', level: 1, kind: 'circuit', ref: 'AB', inputs: ['A', 'B'], outputs: ['F'], parts: ['NOR'], maxGates: 3,
    text: ['Build F = AB from at most three NOR gates and nothing else.'],
    hints: ['A NOR with tied inputs is an inverter.', 'De Morgan: AB = (A′ + B′)′, a NOR of the complements.', 'na = NOR(A, A), nb = NOR(B, B), F = NOR(na, nb).'],
    solution: 'na = NOR(A, A)\nnb = NOR(B, B)\nF = NOR(na, nb)',
    wrong: ['n = NOR(A, B)\nF = NOR(n, n)', 'F = NOR(A, B)', 'na = NOR(A, A)\nnb = NOR(B, B)\nF = OR(na, nb)'],
  });
  ex({
    id: 'alg-ex-nand-sop', chapter: 'alg-nandxor', title: 'A sum of products in NAND gates', level: 2, kind: 'circuit', ref: "AB + C'D", inputs: ['A', 'B', 'C', 'D'], outputs: ['F'], parts: ['NAND'], maxGates: 4,
    text: ["Build F = AB + C′D from at most four two-input NAND gates. Only A, B, C and D are available, not their complements."],
    hints: ['An AND feeding an OR is a NAND feeding a NAND: the two bubbles on each line cancel.', "C′ needs a gate of its own: a NAND with its inputs tied.", "n1 = NAND(A, B), nc = NAND(C, C), n2 = NAND(nc, D), F = NAND(n1, n2)."],
    solution: 'n1 = NAND(A, B)\nnc = NAND(C, C)\nn2 = NAND(nc, D)\nF = NAND(n1, n2)',
    wrong: ['n1 = NAND(A, B)\nn2 = NAND(C, D)\nF = NAND(n1, n2)', 'n1 = NAND(A, B)\nnc = NAND(C, C)\nn2 = NAND(nc, D)\nF = OR(n1, n2)', 'n1 = NAND(A, B)\nnc = NAND(C, C)\nn2 = NAND(nc, D)\nn3 = NAND(n1, n2)\nF = NAND(n3, n3)'],
  });
  ex({
    id: 'alg-ex-nor-pos', chapter: 'alg-nandxor', title: 'A product of sums in NOR gates', level: 2, kind: 'circuit', ref: "(A + B)(C + D')", inputs: ['A', 'B', 'C', 'D'], outputs: ['F'], parts: ['NOR'], maxGates: 4,
    text: ["Build F = (A + B)(C + D′) from at most four two-input NOR gates, with only A, B, C and D available."],
    hints: ['An OR feeding an AND is a NOR feeding a NOR.', "D′ is a NOR with its inputs tied.", "n1 = NOR(A, B), nd = NOR(D, D), n2 = NOR(C, nd), F = NOR(n1, n2)."],
    solution: 'n1 = NOR(A, B)\nnd = NOR(D, D)\nn2 = NOR(C, nd)\nF = NOR(n1, n2)',
    wrong: ['n1 = NOR(A, B)\nn2 = NOR(C, D)\nF = NOR(n1, n2)', 'n1 = NOR(A, B)\nnd = NOR(D, D)\nn2 = NOR(C, nd)\nF = AND(n1, n2)'],
  });
  ex({
    id: 'alg-ex-nand-majority', chapter: 'alg-nandxor', title: 'The majority in two levels of NAND', level: 2, kind: 'circuit', ref: 'AB + AC + BC', inputs: ['A', 'B', 'C'], outputs: ['F'], parts: ['NAND'], maxGates: 4, maxLevels: 2,
    text: ['Build the majority function F = AB + AC + BC from NAND gates only, in two levels and at most four gates.'],
    hints: ['Each product becomes a two-input NAND.', 'The OR of three products becomes one three-input NAND of those NANDs.', 'n1 = NAND(A, B), n2 = NAND(A, C), n3 = NAND(B, C), F = NAND(n1, n2, n3).'],
    solution: 'n1 = NAND(A, B)\nn2 = NAND(A, C)\nn3 = NAND(B, C)\nF = NAND(n1, n2, n3)',
    wrong: ['n1 = NAND(A, B)\nn2 = NAND(A, C)\nF = NAND(n1, n2)', 'n1 = NAND(A, B)\nn2 = NAND(A, C)\nn3 = NAND(B, C)\nn4 = NAND(n1, n2)\nn5 = NAND(n4, n4)\nF = NAND(n5, n3)'],
  });
  ex({
    id: 'alg-ex-nor-sop', chapter: 'alg-nandxor', title: 'A + B′C in NOR gates', level: 3, kind: 'circuit', ref: "A + B'C", inputs: ['A', 'B', 'C'], outputs: ['F'], parts: ['NOR'], maxGates: 4,
    text: ["Build F = A + B′C from at most four two-input NOR gates."],
    hints: ['NOR gates suit products of sums: write F = (A + B′)(A + C) first.', "Or think in bubbles: B′C = (B + C′)′, a NOR of B and C′.", "nc = NOR(C, C), t = NOR(B, nc) (= B′C), u = NOR(A, t) (= F′), F = NOR(u, u)."],
    solution: 'nc = NOR(C, C)\nt = NOR(B, nc)\nu = NOR(A, t)\nF = NOR(u, u)',
    wrong: ['nc = NOR(C, C)\nt = NOR(B, nc)\nF = NOR(A, t)', 'nb = NOR(B, B)\nt = NOR(nb, C)\nu = NOR(A, t)\nF = NOR(u, u)'],
    why: 'The last NOR is only an inverter: three levels of real work and one to put the bubble right.',
  });
  ex({
    id: 'alg-ex-nor-xor', chapter: 'alg-nandxor', title: 'XOR from NOR gates', level: 3, kind: 'circuit', ref: 'A ^ B', inputs: ['A', 'B'], outputs: ['F'], parts: ['NOR'], maxGates: 5,
    text: ['Build F = A ⊕ B from at most five two-input NOR gates.'],
    hints: ['Mirror the four-NAND XOR: NOR the inputs first, n1 = (A + B)′.', 'NOR each input with n1: n2 = (A + n1)′, n3 = (B + n1)′. Then (n2 + n3)′ is the XNOR.', 'n1 = NOR(A, B), n2 = NOR(A, n1), n3 = NOR(B, n1), n4 = NOR(n2, n3) (XNOR), F = NOR(n4, n4).'],
    solution: 'n1 = NOR(A, B)\nn2 = NOR(A, n1)\nn3 = NOR(B, n1)\nn4 = NOR(n2, n3)\nF = NOR(n4, n4)',
    wrong: ['n1 = NOR(A, B)\nn2 = NOR(A, n1)\nn3 = NOR(B, n1)\nF = NOR(n2, n3)', 'n1 = NOR(A, B)\nF = NOR(n1, n1)'],
  });
  ex({
    id: 'alg-ex-nand-xnor', chapter: 'alg-nandxor', title: 'XNOR from NAND gates', level: 3, kind: 'circuit', ref: "(A ^ B)'", inputs: ['A', 'B'], outputs: ['F'], parts: ['NAND'], maxGates: 5,
    text: ['Build F = (A ⊕ B)′, which is 1 when A and B are equal, from at most five two-input NAND gates.'],
    hints: ['Four NANDs make an XOR.', 'One more NAND with tied inputs inverts it.', 'n1 = NAND(A, B), n2 = NAND(A, n1), n3 = NAND(B, n1), x = NAND(n2, n3), F = NAND(x, x).'],
    solution: 'n1 = NAND(A, B)\nn2 = NAND(A, n1)\nn3 = NAND(B, n1)\nx = NAND(n2, n3)\nF = NAND(x, x)',
    wrong: ['n1 = NAND(A, B)\nn2 = NAND(A, n1)\nn3 = NAND(B, n1)\nF = NAND(n2, n3)', 'n1 = NAND(A, B)\nn2 = NAND(A, n1)\nn3 = NAND(B, n1)\nx = NAND(n2, n3)\nF = XNOR(A, B)'],
  });
  ex({
    id: 'alg-ex-parity-gen', chapter: 'alg-nandxor', title: 'An even-parity generator', level: 1, kind: 'circuit', ref: 'D3 ^ D2 ^ D1 ^ D0', inputs: ['D3', 'D2', 'D1', 'D0'], outputs: ['P'], parts: ['XOR'], maxGates: 3, maxLevels: 2,
    text: ['Four data bits D3 … D0 are sent with an even-parity bit P, chosen so that the five bits together hold an even number of 1s. Build P from at most three two-input XOR gates in two levels.'],
    hints: ['P must be 1 exactly when the data holds an odd number of 1s.', 'That is the XOR of all four bits; pair them up to keep the tree shallow.', 'a = XOR(D3, D2), b = XOR(D1, D0), P = XOR(a, b).'],
    solution: 'a = XOR(D3, D2)\nb = XOR(D1, D0)\nP = XOR(a, b)',
    wrong: ['a = XOR(D3, D2)\nb = XOR(a, D1)\nP = XOR(b, D0)', 'a = XOR(D3, D2)\nb = XOR(D1, D0)\nP = XNOR(a, b)', 'a = XOR(D3, D2)\nP = XOR(a, D1)'],
    why: 'A balanced tree of n − 1 gates has ⌈log₂ n⌉ levels: the chain also works, but its delay grows with every bit.',
  });
  ex({
    id: 'alg-ex-parity-check', chapter: 'alg-nandxor', title: 'A parity checker', level: 2, kind: 'circuit', ref: 'D3 ^ D2 ^ D1 ^ D0 ^ P', inputs: ['D3', 'D2', 'D1', 'D0', 'P'], outputs: ['E'], parts: ['XOR'], maxGates: 4,
    text: ['The receiver gets D3 … D0 and the even-parity bit P. Build E, which is 1 when the five bits hold an odd number of 1s (an error), from at most four two-input XOR gates.'],
    hints: ['A correct word has an even number of 1s, so the XOR of all five bits is 0.', 'One bit flipped makes the count odd: the XOR becomes 1.', 'a = XOR(D3, D2), b = XOR(D1, D0), c = XOR(a, b), E = XOR(c, P).'],
    solution: 'a = XOR(D3, D2)\nb = XOR(D1, D0)\nc = XOR(a, b)\nE = XOR(c, P)',
    wrong: ['a = XOR(D3, D2)\nb = XOR(D1, D0)\nE = XOR(a, b)', 'a = XOR(D3, D2)\nb = XOR(D1, D0)\nc = XOR(a, b)\nE = XNOR(c, P)'],
  });
  ex({
    id: 'alg-ex-odd-parity', chapter: 'alg-nandxor', title: 'An odd-parity bit', level: 1, kind: 'truthtable', outputs: { P: "(A ^ B ^ C)'" }, vars: ['A', 'B', 'C'],
    text: ['Three data bits A, B, C get an odd-parity bit P: the four bits together must hold an odd number of 1s. Fill in P for every row.'],
    hints: ['P is 1 when the data holds an even number of 1s (zero or two).', 'That is the complement of A ⊕ B ⊕ C.', 'Rows 000 to 111: P = 1, 0, 0, 1, 0, 1, 1, 0.'],
    solution: { '000|P': '1', '001|P': '0', '010|P': '0', '011|P': '1', '100|P': '0', '101|P': '1', '110|P': '1', '111|P': '0' },
    wrong: [{ '000|P': '0', '001|P': '1', '010|P': '1', '011|P': '0', '100|P': '1', '101|P': '0', '110|P': '0', '111|P': '1' }, { '000|P': '1', '001|P': '0', '010|P': '0', '011|P': '1', '100|P': '0', '101|P': '1', '110|P': '1', '111|P': '1' }],
  });
  ex({
    id: 'alg-ex-odd-function', chapter: 'alg-nandxor', title: 'Twelve literals, or three', level: 2, kind: 'expr', ref: "A'B'C + A'BC' + AB'C' + ABC", vars: ['A', 'B', 'C'], maxLiterals: 3,
    text: ["F = A′B′C + A′BC′ + AB′C′ + ABC has no two minterms that are neighbours, so no sum of products is shorter. Write it with three literals, using XOR (^ or ⊕)."],
    hints: ['Count the 1s in each minterm: 001, 010, 100, 111.', 'F is 1 exactly when an odd number of inputs are 1: an odd function.', 'F = A ⊕ B ⊕ C.'],
    solution: 'A ^ B ^ C', wrong: ["(A ^ B ^ C)'", 'A ^ B', 'A + B + C'],
    why: 'Odd and even functions are where XOR gates earn their keep.',
  });

  // ---- labs -------------------------------------------------------------------------------------------------
  // De Morgan on the bench: a 7400 at column 4, a 7404 at 14 and a 7402 at 24. A = S0, B = S1.
  //   LED 0 = NAND(A, B)              LED 1 = NOT(NOR(A′, B′)) = A′ + B′
  //   LED 2 = NOR(A, B)               LED 3 = NOT(NAND(A′, B′)) = A′B′
  const DM_BOARD = {
    chips: [{ id: 'U1', num: '7400', col: 4 }, { id: 'U2', num: '7404', col: 14 }, { id: 'U3', num: '7402', col: 24 }], clockHz: 1,
    jumpers: [['4a', 'Rtp4', 'red'], ['10j', 'Rbn10', 'black'], ['14a', 'Rtp14', 'red'], ['20j', 'Rbn20', 'black'], ['24a', 'Rtp24', 'red'], ['30j', 'Rbn30', 'black'],
      ['sw0', '4j', 'yellow'], ['4i', '14j', 'yellow'], ['14i', '28j', 'yellow'],
      ['sw1', '5j', 'yellow'], ['5i', '16j', 'yellow'], ['16i', '29j', 'yellow'],
      ['15j', '25j', 'green'], ['15i', '7j', 'green'], ['17j', '26j', 'green'], ['17i', '8j', 'green'],
      ['6j', 'led0', 'blue'], ['24j', '18j', 'blue'], ['19j', 'led1', 'blue'], ['27j', 'led2', 'blue'], ['9j', '19a', 'blue'], ['20a', 'led3', 'blue']],
  };
  // the observation table: a row for each law and switch setting S1 S0, with the LED of each side (narrow enough to sit beside the bench)
  const DM_ROWS = [], DM_CELLS = {};
  for (const law of [1, 2]) for (const r of ['00', '01', '10', '11']) {
    const a = +r[1], b = +r[0], v = String(law === 1 ? 1 - (a & b) : 1 - (a | b)), row = 'law ' + law + ': ' + r;
    DM_ROWS.push(row); DM_CELLS[row + '|left'] = v; DM_CELLS[row + '|right'] = v;
  }
  C.lab({
    id: 'alg-lab-demorgan', chapter: 'alg-nandxor', title: 'De Morgan on the bench',
    aim: 'Build both sides of each De Morgan law from real gates, a 7400 (NAND), a 7402 (NOR) and a 7404 (NOT), and see them agree on every switch setting: (AB)′ = A′ + B′ and (A + B)′ = A′B′.',
    parts: ['7400', '7404', '7402'],
    steps: ['Place the 7400 with pin 1 at column 4, the 7404 at column 14 and the 7402 at column 24. Power each one: pin 14 to +5 V, pin 7 to ground.', 'A is switch S0 and B is switch S1. Take A to 7400 pin 1, 7404 pin 1 and 7402 pin 5; take B to 7400 pin 2, 7404 pin 3 and 7402 pin 6.', 'The 7404 makes A′ (pin 2) and B′ (pin 4). Left side of the first law: 7400 gate 1 (pins 1, 2 → 3) gives (AB)′; take it to LED 0.', 'Right side: A′ + B′ needs an OR, which is a NOR followed by a NOT. Feed A′ and B′ to 7402 gate 1 (pins 2, 3 → 1), and its output through 7404 gate 3 (pin 5 → 6) to LED 1.', 'Second law: 7402 gate 2 (pins 5, 6 → 4) gives (A + B)′ on LED 2. For A′B′, NAND A′ and B′ in 7400 gate 2 (pins 4, 5 → 6) and invert it in 7404 gate 4 (pin 9 → 8) to LED 3.', 'Set S1 S0 to each row of the table and write down the four LEDs. LEDs 0 and 1 should always agree, and so should LEDs 2 and 3. In the table, law 1 has LED 0 on the left and LED 1 on the right; law 2 has LED 2 on the left and LED 3 on the right.'],
    observe: { rows: DM_ROWS, cols: ['left', 'right'], corner: 'law: S1 S0', cellKind: 'bit', cells: DM_CELLS },
    checks: [{ kind: 'power', allowOpen: true }, { kind: 'truth', inputs: ['S1', 'S0'], outputs: { led0: '~(S0 & S1)', led1: '~S0 | ~S1', led2: '~(S0 | S1)', led3: '~S0 & ~S1' } }],
    reference: DM_BOARD,
  });
  ex({
    id: 'alg-ex-lab-demorgan', chapter: 'alg-nandxor', title: 'De Morgan on the bench', kind: 'lab', lab: 'alg-lab-demorgan', level: 2,
    text: ['Do the experiment on the bench: wire both sides of both De Morgan laws, fill in the observation table, and check.'],
    hints: ['Power first: a chip without VCC and GND does nothing. Then wire the two switches to every input that needs A or B.', 'The 7402 has its outputs on pins 1, 4, 10 and 13, unlike the 7400: check the pinout before wiring.', 'For S1 S0 = 00, 01, 10, 11: law 1 reads 1, 1, 1, 0 on both sides (LEDs 0 and 1); law 2 reads 1, 0, 0, 0 on both sides (LEDs 2 and 3).'],
    solution: { bench: DM_BOARD, observe: DM_CELLS },
    wrong: [{ bench: { chips: DM_BOARD.chips, jumpers: DM_BOARD.jumpers.slice(1) } }, { bench: DM_BOARD, observe: Object.assign({}, DM_CELLS, { 'law 2: 01|right': '1' }) }],
  });

  // A parity generator and an independent checker, each on its own 7486 (U1 at column 6, U2 at column 20).
  //   LED 0 = P = S0 ⊕ S1 ⊕ S2 (the even-parity bit the sender adds)
  //   LED 1 = E = S0 ⊕ S1 ⊕ S2 ⊕ S3, where S3 is the parity bit as it arrives
  const PAR_BOARD = {
    chips: [{ id: 'U1', num: '7486', col: 6 }, { id: 'U2', num: '7486', col: 20 }], clockHz: 1,
    jumpers: [['6a', 'Rtp6', 'red'], ['12j', 'Rbn12', 'black'], ['20a', 'Rtp20', 'red'], ['26j', 'Rbn26', 'black'],
      ['sw0', '6j', 'yellow'], ['6i', '20j', 'yellow'], ['sw1', '7j', 'yellow'], ['7i', '21j', 'yellow'], ['sw2', '10j', 'yellow'], ['10i', '23j', 'yellow'], ['sw3', '24j', 'yellow'],
      ['8i', '9i', 'green'], ['11j', 'led0', 'blue'], ['22j', '25a', 'green'], ['25j', '24a', 'green'], ['26a', 'led1', 'blue']],
  };
  C.lab({
    id: 'alg-lab-parity', chapter: 'alg-nandxor', title: 'A parity generator and checker',
    aim: 'Wire an even-parity generator for three data bits from one 7486, and a checker for the four received bits from another, then make an error by setting the received parity bit wrong and watch the checker catch it.',
    parts: ['7486'],
    steps: ['Place two 7486 chips: U1 with pin 1 at column 6 (the generator), U2 with pin 1 at column 20 (the checker). Power both: pin 14 to +5 V, pin 7 to ground.', 'The data bits are S0, S1 and S2. Generator: XOR S0 and S1 in U1 gate 1 (pins 1, 2 → 3), then that result with S2 in gate 2 (pins 4, 5 → 6). Take pin 6, the parity bit P, to LED 0.', 'S3 stands for the parity bit as it arrives at the receiver. Checker: in U2, XOR S0 with S1 (gate 1, pins 1, 2 → 3) and S2 with S3 (gate 2, pins 4, 5 → 6), then XOR the two results (gate 3, pins 9, 10 → 8). Take pin 8, the error flag E, to LED 1.', 'Go through all sixteen settings of S3 S2 S1 S0 and write down LED 0 and LED 1. When S3 equals LED 0 the word is good; when it differs, one bit has been damaged.'],
    observe: { inputs: ['S3', 'S2', 'S1', 'S0'], outputs: ['led0', 'led1'] },
    checks: [{ kind: 'power', allowOpen: true }, { kind: 'truth', inputs: ['S3', 'S2', 'S1', 'S0'], outputs: { led0: 'S0 ^ S1 ^ S2', led1: 'S0 ^ S1 ^ S2 ^ S3' } }],
    reference: PAR_BOARD,
  });
  const parObs = {};
  for (let m = 0; m < 16; m++) { const b = m.toString(2).padStart(4, '0'), s3 = +b[0], p = (+b[1]) ^ (+b[2]) ^ (+b[3]); parObs[b + '|led0'] = String(p); parObs[b + '|led1'] = String(p ^ s3); }
  ex({
    id: 'alg-ex-lab-parity', chapter: 'alg-nandxor', title: 'Parity on the bench', kind: 'lab', lab: 'alg-lab-parity', level: 2,
    text: ['Do the parity experiment on the bench, fill in all sixteen rows, and check.'],
    hints: ['Both chips need power before anything lights.', 'The generator is two XOR gates in a chain; the checker is a tree of three, with S3 joining S2 in its second gate.', 'LED 0 is the XOR of S2, S1, S0; LED 1 is 1 exactly when S3 differs from LED 0. For example S3 S2 S1 S0 = 0111 gives LED 0 = 1 and LED 1 = 1.'],
    solution: { bench: PAR_BOARD, observe: parObs },
    wrong: [{ bench: { chips: PAR_BOARD.chips, jumpers: PAR_BOARD.jumpers.filter((j) => j[0] !== 'sw3') } }, { bench: PAR_BOARD, observe: Object.assign({}, parObs, { '0111|led1': '0' }) }],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
