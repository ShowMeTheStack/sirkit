// Part 2, Boolean algebra and gates: the chapters, the lessons, a guided tour and a course. The exercises and the
// bench labs are in 21-algebra-ex.js. Each lesson opens with a question, runs the topic that animates the idea at a
// frame chosen for the point being made, asks for a prediction, gives a live circuit or function to try, sums up,
// and leads to its exercises. Every function and number here is our own and comes from the engines.
(function (S) {
  'use strict';
  const C = S.Content;
  if (!C || C.lessons.has('alg-gates-symbols')) return;
  const X = (id) => ({ exercise: id });
  const LAB = (id) => ({ lab: id });

  C.chapter({ id: 'alg-gates', part: 'algebra', n: 1, title: 'Gates and logic levels', blurb: 'The gates and their two kinds of symbol, and what changes when high voltage means 0 instead of 1.' });
  C.chapter({ id: 'alg-laws', part: 'algebra', n: 2, title: 'The algebra of two values', blurb: 'The axioms, duality, the basic theorems, the everyday reductions, proofs one law at a time, and expressions as trees.' });
  C.chapter({ id: 'alg-forms', part: 'algebra', n: 3, title: 'Functions and their standard forms', blurb: 'How many functions there are, minterms and maxterms, Σm and ΠM, expanding to canonical form, complement and dual.' });
  C.chapter({ id: 'alg-nandxor', part: 'algebra', n: 4, title: 'NAND, NOR and XOR', blurb: 'Any function from one kind of gate, De Morgan as sliding bubbles, and XOR for parity, with two bench experiments.' });

  // =========================================================================================================
  // Chapter 1: gates and logic levels
  // =========================================================================================================
  C.lesson({
    id: 'alg-gates-symbols', chapter: 'alg-gates', title: 'The gates and their two symbols', minutes: 7,
    summary: 'Eight gates cover everything: AND, OR, NOT, the buffer, NAND, NOR, XOR and XNOR. Each has a distinctive-shape symbol and a rectangular one, and a bubble always means an inversion.',
    blocks: [
      'Open the data sheet of a logic chip from one maker and you find curved shapes; open another and every gate is a rectangle with a small label inside. Are these different gates? No: they are two drawing standards for the same eight functions, and a designer has to read both.',
      { def: 'Gate', text: 'a circuit with one or more inputs and one output, each 0 or 1, whose output depends only on its present inputs according to a fixed rule.' },
      { table: [['Gate', 'Output is 1 when', 'Rectangular label'], ['AND', 'every input is 1', '&'], ['OR', 'at least one input is 1', '≥1'], ['NOT', 'the input is 0', '1 with a bubble'], ['Buffer', 'the input is 1', '1'], ['NAND', 'not every input is 1', '& with a bubble'], ['NOR', 'every input is 0', '≥1 with a bubble'], ['XOR', 'an odd number of inputs are 1', '=1'], ['XNOR', 'an even number of inputs are 1', '=1 with a bubble']], caption: 'The eight gates. A bubble on an output, in either style, inverts it.' },
      { topic: 'gate-symbols', input: { gate: 'NAND', n: 3 }, frame: 8, caption: 'A three-input NAND in both styles, at the one row where its output is 0: A = B = C = 1. Step back through the other seven rows, all 1. Try the other gates with the topic\'s own examples.' },
      { predict: { q: 'A four-input NOR gate: on how many of its 16 rows is the output 1?', options: ['1', '4', '8', '15'], answer: 0, explain: 'A NOR gives 1 only when every input is 0: a single row, 0000.' } },
      { h: 'Try a small circuit' },
      'Gates join by wiring an output to inputs. In the circuit below a NOR feeds an AND. Click the inputs and find the only setting that lights F.',
      { circuit: 'n1 = NOR(A, B)\nF = AND(n1, C)', outputs: ['F'], inputs: { C: 1 }, caption: 'F = (A + B)′C. Each wire shows its value; Try it opens the circuit in the workbench.' },
      { h: 'Gates are made of transistors' },
      'Each gate is built from a handful of transistors, and the way they are built decides how fast the gate switches, how much power it takes and how many other gates it can drive. In CMOS, the most common family, NAND and NOR are the cheapest gates: an AND is a NAND followed by an inverter. Part 11 opens the gates up and compares the families; until then a gate is simply its rule plus a small delay.',
      { tip: 'Learn the shapes by their straight and curved backs: AND has a straight back and a round front, OR a curved back and a pointed front, and XOR is an OR with a second curve behind it.' },
      { h: 'Recap' },
      { list: ['Eight gates: AND, OR, NOT, buffer, NAND, NOR, XOR, XNOR.', 'Two symbol styles, distinctive-shape and rectangular, for the same gates.', 'A bubble means an inversion, on an input or an output.', 'NAND and NOR are the cheapest gates in CMOS; part 11 shows why.'] },
      X('alg-ex-gate-table'), X('alg-ex-gate-name'),
    ],
  });

  C.lesson({
    id: 'alg-poslog', chapter: 'alg-gates', title: 'Positive and negative logic', minutes: 6,
    summary: 'A gate only knows voltages, high and low. Calling high 1 is positive logic; calling low 1 is negative logic, and it turns every gate into its dual.',
    blocks: [
      'A chip\'s data sheet does not talk about 0 and 1 at all. It gives a table of voltages: L for low, H for high. Which of those is "true" is a decision we make, and the same chip can be an AND gate or an OR gate depending on that decision.',
      { def: 'Positive logic', text: 'H stands for 1 and L for 0.' },
      { def: 'Negative logic', text: 'L stands for 1 and H for 0. Signals used this way are called active low, and their names often carry a bar or a trailing n.' },
      { topic: 'pos-neg-logic', input: { dev: 'and' }, frame: 5, caption: 'A device that drives H only when both inputs are H. Read with H = 1 it is an AND; read with L = 1 the same rows describe an OR. Step back through the four voltage rows to see each one read both ways.' },
      { predict: { q: 'A device gives L only when both inputs are H. It is a NAND in positive logic. What is it in negative logic?', options: ['NAND', 'NOR', 'AND', 'OR'], answer: 1, explain: 'Swapping the meaning of H and L complements every input and the output, and that turns a function into its dual: the dual of NAND is NOR.' } },
      { h: 'Why the dual?' },
      'Changing the convention complements every input and the output. If F(A, B) is the positive-logic function, the negative-logic one is F(A′, B′)′. Push that complement through with De Morgan and every + becomes · and every · becomes +: exactly the **dual**, which you meet properly in the next chapter. So AND ↔ OR, NAND ↔ NOR, and XOR ↔ XNOR.',
      { func: { expr: 'AB' }, caption: 'AND in positive logic. Its dual, A + B, is what the same device computes in negative logic. Type A + B into the workbench and compare the two tables row by row: one is the other turned upside down and complemented.' },
      { tip: 'Mixed logic: when a signal is active low, draw a bubble at the input it drives. Bubbles that meet bubbles cancel, and the drawing then reads like the intention.' },
      { h: 'Recap' },
      { list: ['A gate is defined by voltages; 0 and 1 are a convention.', 'Positive logic: H = 1. Negative logic: L = 1.', 'Changing the convention turns a function into its dual: AND ↔ OR, NAND ↔ NOR, XOR ↔ XNOR.'] },
      X('alg-ex-poslog-nor'), X('alg-ex-poslog-xor'), X('alg-ex-poslog-dual'),
    ],
  });

  // =========================================================================================================
  // Chapter 2: the algebra of two values
  // =========================================================================================================
  C.lesson({
    id: 'alg-axioms', chapter: 'alg-laws', title: 'The axioms of two-valued algebra', minutes: 8,
    summary: 'A short list of axioms (closure, identity, commutativity, two distributive laws and the complement) is all Boolean algebra rests on. With two values, each can be checked row by row.',
    blocks: [
      'Is X + YZ equal to (X + Y)(X + Z)? With ordinary numbers, certainly not: 2 + 3 × 4 is 14, and (2 + 3)(2 + 4) is 30. With 0 and 1 and the gate operations, it is true. The rules are different, so we need to know exactly which rules we may use.',
      { def: 'Two-valued Boolean algebra', text: 'the set {0, 1} with the operations + (OR), · (AND) and ′ (NOT), satisfying the axioms below.' },
      { table: [['Axiom', 'For +', 'For ·'], ['Closure', 'X + Y is 0 or 1', 'X·Y is 0 or 1'], ['Identity', 'X + 0 = X', 'X·1 = X'], ['Commutativity', 'X + Y = Y + X', 'XY = YX'], ['Distributivity', 'X + YZ = (X + Y)(X + Z)', 'X(Y + Z) = XY + XZ'], ['Complement', 'X + X′ = 1', 'X·X′ = 0']], caption: 'Each axiom comes in a pair. Notice that the two columns mirror each other: that is duality, the next lesson.' },
      { topic: 'axioms', frame: 6, caption: 'OR distributing over AND, checked on all eight rows. This is row 100: both sides give 1. Step on: every row agrees, so the law holds for every value.' },
      { predict: { q: 'X + YZ = (X + Y)Z looks similar. On how many of the eight rows do its two sides disagree?', options: ['0', '1', '2', '4'], answer: 2, explain: 'With X = 1 the left side is 1, but the right side is just Z. So the rows 100 and 110 disagree: two counterexamples.' } },
      { topic: 'axioms', input: { law: 'X + YZ = (X + Y)Z' }, frame: 10, caption: 'One row is enough to refute a claimed law. Here two rows differ, the first at X = 1, Y = 0, Z = 0.' },
      { h: 'Check one yourself' },
      { func: { expr: 'X + YZ' }, caption: 'X + YZ in the function workbench. Its minimal product of sums is (X + Y)(X + Z): the workbench has found the distributive law for you.' },
      { tip: 'Proof by perfect induction: with n variables there are only 2ⁿ rows, so trying every row proves an identity outright. The algebra matters because it also tells you *how* to get from one form to another.' },
      { h: 'Recap' },
      { list: ['Closure, identity, commutativity, two distributive laws and the complement: the axioms come in pairs.', 'OR distributes over AND, which ordinary arithmetic does not allow.', 'An identity holds if both sides agree on every row; one differing row refutes it.'] },
      X('alg-ex-axiom-dist'), X('alg-ex-refute'),
    ],
  });

  C.lesson({
    id: 'alg-duality', chapter: 'alg-laws', title: 'Duality: every law has a twin', minutes: 6,
    summary: 'Swap + with · and 0 with 1 in any identity, keeping the variables and their complements, and you get another identity: its dual. Every proof can be dualised step by step.',
    blocks: [
      'The axioms came in pairs: X + 0 = X and X·1 = X, the two distributive laws, X + X′ = 1 and XX′ = 0. That is not luck. Each axiom\'s twin is obtained by the same mechanical swap, and so every theorem has a twin too.',
      { def: 'Dual', text: 'of an expression: the expression with every + replaced by ·, every · by +, every 0 by 1 and every 1 by 0. Variables and their complements stay exactly as they are.' },
      { topic: 'duality', frame: 2, caption: 'The OR-over-AND distributive law and its dual, the AND-over-OR one. Notice the bracket: in the dual each operator must still act on the same operands, so (Y + Z) gets brackets.' },
      { predict: { q: 'What is the dual of X + X′Y = X + Y?', options: ['X(X′ + Y) = XY', 'X′ + XY′ = X′ + Y′', 'X·X′Y = XY', 'X(X′ + Y) = X + Y'], answer: 0, explain: 'Swap every operator, keep every literal: X·(X′ + Y) = X·Y. Both sides are dualised, not just one.' } },
      { topic: 'duality', input: { law: "X + X'Y = X + Y" }, frame: 4, caption: 'The second absorption law and its dual, each checked on all four rows.' },
      { warn: 'The dual is not the complement. The complement also complements every literal; the dual leaves them alone. (A + B′)C is the dual of AB′ + C; its complement is (A′ + B)C′.' },
      { h: 'Try it' },
      { func: { expr: "X(X' + Y)" }, caption: 'X(X′ + Y) in the workbench. Its minimal sum of products is XY, as the dual law promised.' },
      { h: 'Recap' },
      { list: ['Dual: swap + and ·, swap 0 and 1, keep the literals.', 'The dual of an identity is an identity, because every axiom\'s dual is an axiom.', 'Prove a law once and you get its twin free.'] },
      X('alg-ex-dual-write'), X('alg-ex-dual-law'), X('alg-ex-pf-dual-absorb2'),
    ],
  });

  C.lesson({
    id: 'alg-theorems', chapter: 'alg-laws', title: 'The basic theorems', minutes: 8,
    summary: 'From the axioms follow the everyday theorems: idempotence, the null element, involution, associativity, absorption, and De Morgan for any number of variables.',
    blocks: [
      'Can a gate with no inputs replace a gate with two? If the two gates compute the same function, yes. The basic theorems say exactly when that happens, and each one is a promise that a circuit can be made smaller or rearranged without changing what it does.',
      { table: [['Theorem', 'Form', 'Its dual'], ['Idempotence', 'X + X = X', 'X·X = X'], ['Null element', 'X + 1 = 1', 'X·0 = 0'], ['Involution', '(X′)′ = X', '(the same)'], ['Associativity', 'X + (Y + Z) = (X + Y) + Z', 'X(YZ) = (XY)Z'], ['Absorption', 'X + XY = X', 'X(X + Y) = X'], ['De Morgan', '(X + Y)′ = X′Y′', '(XY)′ = X′ + Y′']], caption: 'The basic theorems in their pairs.' },
      { topic: 'theorems', frame: 5, caption: 'Absorption: X + XY needs two gates and X needs none, yet the four rows agree. Wherever XY is 1, X is already 1.' },
      { h: 'De Morgan for n variables' },
      'De Morgan\'s law is not limited to two variables. The complement of a product of any number of factors is the sum of their complements, and the dual holds too: (X₁X₂…Xₙ)′ = X₁′ + X₂′ + … + Xₙ′ and (X₁ + X₂ + … + Xₙ)′ = X₁′X₂′…Xₙ′. It follows from the two-variable law and associativity, one factor at a time.',
      { topic: 'theorems', input: { law: "(XYZ)' = X' + Y' + Z'" }, frame: 8, caption: 'Three variables: the only row where (XYZ)′ is 0 is 111, and that is the only row where X′ + Y′ + Z′ is 0 as well.' },
      { predict: { q: 'Which expression equals (A + B′ + C)′?', options: ['A′BC′', 'A′ + B + C′', 'A′B′C′', 'AB′C'], answer: 0, explain: 'Complement each term and turn the sum into a product: A′ · B′′ · C′ = A′BC′.' } },
      { h: 'Both sides, side by side' },
      { circuit: 'L = NAND(X, Y, Z)\nnx = NOT(X)\nny = NOT(Y)\nnz = NOT(Z)\nR = OR(nx, ny, nz)', outputs: ['L', 'R'], inputs: { X: 1, Y: 1 }, caption: 'L = (XYZ)′ from one NAND gate; R = X′ + Y′ + Z′ from three inverters and an OR. Set all three inputs to 1: both outputs drop together.' },
      { h: 'Recap' },
      { list: ['Idempotence, null element, involution, associativity, absorption and De Morgan follow from the axioms.', 'De Morgan works for any number of variables: complement each one and swap + with ·.', 'Every theorem is a licence to replace one circuit with another.'] },
      X('alg-ex-pf-absorb'), X('alg-ex-pf-demorgan3'), X('alg-ex-pf-demorgan-chain'), X('alg-ex-pf-demorgan-pos'),
    ],
  });

  C.lesson({
    id: 'alg-reductions', chapter: 'alg-laws', title: 'Everyday reductions: absorption, uniting, consensus', minutes: 9,
    summary: 'A handful of reductions do most of the work: uniting two terms that differ in one variable, the two absorption laws, and consensus, which drops a term covered jointly by two others.',
    blocks: [
      'Hand someone an expression with a dozen terms and ask for the smallest equal one. They will not reach for the axioms. They will look for four patterns that come up again and again, each of which removes a term or a literal at a stroke.',
      { table: [['Reduction', 'Sum of products', 'Product of sums'], ['Uniting', 'XY + XY′ = X', '(X + Y)(X + Y′) = X'], ['Absorption', 'X + XY = X', 'X(X + Y) = X'], ['Absorption, second form', 'X + X′Y = X + Y', 'X(X′ + Y) = XY'], ['Consensus', 'XY + X′Z + YZ = XY + X′Z', '(X + Y)(X′ + Z)(Y + Z) = (X + Y)(X′ + Z)']], caption: 'The everyday reductions, each with its dual.' },
      { h: 'Consensus' },
      'Uniting and absorption act on a pair of terms. Consensus is subtler: a term can be redundant even though no single other term covers it, because two terms cover it between them.',
      { topic: 'absorb-consensus', frame: 4, caption: 'YZ is 1 on rows 011 and 111. On the first, X′Z covers it; on the second, XY does. Neither covers it alone, but together they do, so YZ can go.' },
      { def: 'Consensus term', text: 'of XY and X′Z: the product YZ of what is left when the variable they disagree in, X, is removed. It is always covered by the two terms and can be dropped (or added).' },
      { predict: { q: 'In AB′ + BC + AC, which term is the consensus of the other two?', options: ['AB′', 'BC', 'AC', 'None of them'], answer: 2, explain: 'AB′ and BC disagree in B; what is left, A and C, makes AC. So AC is redundant: AB′ + BC + AC = AB′ + BC.' } },
      { topic: 'absorb-consensus', input: { f: "(X + Y)(X' + Z)(Y + Z)" }, frame: 5, caption: 'The dual: among sums, Y + Z is the consensus of X + Y and X′ + Z, and the product drops from 6 literals to 4.' },
      { h: 'Try it' },
      { func: { expr: "XY + X'Z + YZ" }, caption: 'XY + X′Z + YZ in the workbench: the minimal sum of products has dropped YZ. On the K-map tab, YZ is a group lying across the other two.' },
      { tip: 'Consensus also runs the other way: adding a consensus term never changes the function. That is exactly the cure for a hazard, in part 3.' },
      { h: 'Recap' },
      { list: ['Uniting: two terms differing in one variable merge, and the variable drops.', 'Absorption: X + XY = X; second form: X + X′Y = X + Y.', 'Consensus: the term YZ is redundant next to XY and X′Z.', 'Each reduction has its dual for products of sums.'] },
      X('alg-ex-pf-uniting-pos'), X('alg-ex-pf-absorb2'), X('alg-ex-pf-uniting-sop'), X('alg-ex-pf-consensus'), X('alg-ex-pf-consensus-pos'), X('alg-ex-simplify-b'),
    ],
  });

  C.lesson({
    id: 'alg-proofs', chapter: 'alg-laws', title: 'Reduction as a proof, one law at a time', minutes: 9,
    summary: 'Simplifying is proving: each step names a law and the part it is applied to. A wrong move is refused with the reason, a hint suggests the next useful law, and a false claim is refuted by a single row.',
    blocks: [
      'You simplify XY + XY′ + X′Y to X + Y and a friend asks: are you sure? A truth table settles it, but it does not explain it. A **proof** does: a chain of expressions, each equal to the one before because one named law says so.',
      { steps: ['Choose a law from the palette: uniting, absorption, De Morgan, consensus and the rest.', 'Choose where to apply it: the subterm whose shape the law matches.', 'The rewrite gives the next line. Commutative and associative rearrangements are free: you may reorder terms without a step.', 'Stop at the goal: a target expression, or the fewest literals you can reach.'] },
      { topic: 'proof-game', frame: 3, caption: 'Move 1 unites XY and XY′ into X. Step on: the second absorption law turns X + X′Y into X + Y, and no law shortens it further.' },
      { h: 'Refused moves' },
      'A law applies only where its pattern fits. Try De Morgan on a product of two sums and nothing happens: De Morgan needs the complement of a sum or a product.',
      { topic: 'proof-game', input: { f: "(X + Y)(X + Y')", goal: 'X', wrong: 'demorgan' }, frame: 1, caption: 'A refused move, with the reason. The next frame picks a law that fits: the product-of-sums form of uniting reaches the goal X in one move.' },
      { predict: { q: 'Someone claims X + Y = X. What does the proof game do?', options: ['It finds a long proof', 'It shows a row where the two sides differ', 'It says the claim needs more laws'], answer: 1, explain: 'No chain of laws can join two different functions. At X = 0, Y = 1 the left side is 1 and the right side is 0: that row refutes the claim.' } },
      { topic: 'proof-game', input: { f: 'X + Y', goal: 'X', wrong: '' }, frame: 1, caption: 'A false goal is refuted before any move is tried: one falsifying assignment is enough.' },
      { h: 'Your turn' },
      'The function workbench runs the same game on any expression you type: choose a law, choose a subterm, ask for a hint when stuck, and export the finished proof.',
      { func: { expr: "XY + XY' + X'Y" }, caption: 'XY + XY′ + X′Y: the minimal form X + Y is what the proof must reach. Open it in the workbench to play the steps.' },
      { h: 'Recap' },
      { list: ['A proof is a chain of lines, each justified by one law applied to one subterm.', 'Reordering terms is free; everything else needs a named law.', 'A wrong application is refused with the reason.', 'A false identity is refuted by one row where the sides differ.'] },
      X('alg-ex-pf-expand'), X('alg-ex-pf-majority'), X('alg-ex-pf-tautology'), X('alg-ex-pf-two-nors'), X('alg-ex-pf-three-maxterms'), X('alg-ex-simplify-xyz'), X('alg-ex-simplify-pos'),
    ],
  });

  C.lesson({
    id: 'alg-trees', chapter: 'alg-laws', title: 'Precedence and expression trees', minutes: 6,
    summary: 'NOT binds tightest, then AND, then XOR, then OR. The operator applied last is the root of the expression\'s tree and the gate that drives the output; moving a bracket moves both.',
    blocks: [
      'A + B′C and (A + B′)C differ by one bracket. Are they the same function? Draw each as gates and the answer is obvious: the gate that drives the output is an OR in one and an AND in the other.',
      { def: 'Precedence', text: 'the order in which operators bind when there are no brackets. Tightest first: NOT, AND, XOR, OR.' },
      { topic: 'expr-tree', frame: 2, caption: 'A + B′C as a tree: the AND binds first, so the OR is the root. Step on: the circuit has the same shape, one gate per operator node.' },
      { predict: { q: 'Now move the bracket: F = (A + B′)C. Which gate drives F?', options: ['OR', 'AND', 'NOT'], answer: 1, explain: 'The bracket makes the OR bind first; the AND, applied last, is the root.' } },
      { topic: 'expr-tree', input: { f: "(A + B')C", row: 5 }, frame: 4, caption: 'The bracket moved: the AND is now the root. At row 101 the values flow up the tree to F = 1.' },
      { h: 'Edit it' },
      { circuit: { expr: "F = A + B'C" }, editable: true, caption: 'A + B′C drawn by the layout engine. Rewire it so that the OR feeds the AND, and you have built (A + B′)C.' },
      { tip: 'When in doubt, bracket. A ⊕ B + C means (A ⊕ B) + C, but nobody reading it in a hurry will be sure.' },
      { h: 'Recap' },
      { list: ['Tightest first: NOT, AND, XOR, OR. Brackets override.', 'The last operator applied is the root of the tree and the output gate.', 'An expression, its tree and its circuit have the same shape.'] },
      X('alg-ex-root'), X('alg-ex-tree-circuit'), X('alg-ex-read-circuit'), X('alg-ex-bracket-table'), X('alg-ex-xor-andor'),
    ],
  });

  // =========================================================================================================
  // Chapter 3: functions and their standard forms
  // =========================================================================================================
  C.lesson({
    id: 'alg-functions', chapter: 'alg-forms', title: 'How many functions? The sixteen of two variables', minutes: 8,
    summary: 'A function of n variables is a choice of 2ⁿ output bits, so there are 2^(2ⁿ) of them: 16 of two variables, 256 of three. Some have special properties: self-dual, symmetric, monotone, threshold.',
    blocks: [
      'Every gate you know is a function of two variables. How many such functions are there, and have we met them all? A truth table with two inputs has four rows, and a function is just a choice of the four output bits.',
      { topic: 'sixteen-functions', frame: 6, caption: 'The sixteen columns, numbered F0 to F15 by their bits. This frame shows the four less familiar ones: the inhibitions AB′ and A′B, and the implications A + B′ and A′ + B.' },
      { predict: { q: 'How many Boolean functions of four variables are there?', options: ['16', '256', '4096', '65536'], answer: 3, explain: 'Four variables give 16 rows, and each row\'s output can be chosen freely: 2¹⁶ = 65536.' } },
      { topic: 'sixteen-functions', frame: 8, caption: 'The count explodes: 4, 16, 256, 65536, then over four thousand million for five variables. That is why functions are named by formulas and minterm lists.' },
      { h: 'Functions with a character' },
      'A few properties are worth recognising because they make a function easier to build or to reason about:',
      { list: ['**Self-dual**: complementing every input complements the output, so F equals its own dual.', '**Symmetric**: only the number of 1 inputs matters, not which ones.', '**Monotone**: raising an input from 0 to 1 never lowers the output; such a function needs no inverters.', '**Threshold**: F = 1 exactly when a weighted sum of the inputs reaches a threshold, like a vote.'] },
      { topic: 'classifiers', frame: 5, caption: 'The majority AB + AC + BC passes all four tests. Try the odd-parity example on the topic\'s page: self-dual and symmetric, but neither monotone nor threshold.' },
      { func: { expr: 'AB + AC + BC' }, caption: 'The majority function in the workbench: its table, its minterms and its minimal forms. The minimal sum and the minimal product have the same shape, as a self-dual function must.' },
      { h: 'Recap' },
      { list: ['n variables: 2ⁿ rows and 2^(2ⁿ) functions.', 'Two variables give 16 functions: the constants, the transfers and complements, AND, OR, NAND, NOR, XOR, XNOR, the inhibitions and the implications.', 'Self-dual, symmetric, monotone and threshold functions are special cases worth spotting.'] },
      X('alg-ex-count'), X('alg-ex-sixteen'), X('alg-ex-classify'), X('alg-ex-selfdual'),
    ],
  });

  C.lesson({
    id: 'alg-minterms', chapter: 'alg-forms', title: 'Minterms and maxterms', minutes: 7,
    summary: 'Each row of a truth table has a minterm, a product that is 1 on that row only, and a maxterm, a sum that is 0 on that row only. Any function is the OR of the minterms of its 1s, and the AND of the maxterms of its 0s.',
    blocks: [
      'Given a truth table and no idea what the function means, can you always write an expression for it? Yes, mechanically: one term per row. The terms are the minterms and maxterms.',
      { def: 'Minterm', text: 'a product of all the variables, each complemented where the row\'s bit is 0. It is 1 on its own row and 0 everywhere else. Row 5 of A, B, C is 101, so m5 = AB′C.' },
      { def: 'Maxterm', text: 'a sum of all the variables, each complemented where the row\'s bit is 1. It is 0 on its own row only. M5 = A′ + B + C′, the complement of m5.' },
      { topic: 'minterms-maxterms', frame: 3, caption: 'F = A′B + AC, row 2 = 010: m2 = A′BC′ and M2 = A + B′ + C. Step through every row: each has its own pair.' },
      { predict: { q: 'What is the minterm m6 over A, B, C?', options: ['ABC′', 'A′B′C', 'A′ + B′ + C', 'AB′C'], answer: 0, explain: '6 = 110: A and B appear plain, C complemented: m6 = ABC′.' } },
      { topic: 'minterms-maxterms', frame: 9, caption: 'F is the OR of the minterms of its 1 rows, Σm(2, 3, 5, 7), and the AND of the maxterms of its 0 rows, ΠM(0, 1, 4, 6). The two lists share no number and together hold them all.' },
      { def: 'Canonical forms', text: 'the canonical sum of products is the OR of all the minterms of the 1s; the canonical product of sums is the AND of all the maxterms of the 0s. Each function has exactly one of each.' },
      { func: { vars: ['A', 'B', 'C'], minterms: [2, 3, 5, 7] }, caption: 'Σm(2, 3, 5, 7) in the workbench: its table, both lists, and the short forms that the canonical ones reduce to.' },
      { h: 'Recap' },
      { list: ['A minterm is 1 on one row; a maxterm is 0 on one row.', 'm_i and M_i are complements.', 'F = Σ of the minterms of its 1s = Π of the maxterms of its 0s.', 'Canonical forms are unique but long; minimisation makes them short.'] },
      X('alg-ex-minterms'), X('alg-ex-canon-sop'), X('alg-ex-canon-pos'),
    ],
  });

  C.lesson({
    id: 'alg-sigma-pi', chapter: 'alg-forms', title: 'Σm and ΠM: one list from the other', minutes: 6,
    summary: 'Σm lists the 1s of a function and ΠM its 0s. Either list gives the other: take every row number not listed and not a don\'t-care. The complement swaps the two lists.',
    blocks: [
      'A colleague gives you F = Σm(1, 3, 4, 6) and asks for its product of sums. Do you need any algebra? No: the maxterms are simply the row numbers missing from the list.',
      { topic: 'sigma-pi', frame: 2, caption: 'F = Σm(1, 3, 4, 6) + d(7). The numbers not listed and not don\'t-cares, 0, 2 and 5, are the maxterms. The don\'t-care stays a don\'t-care in both forms.' },
      { predict: { q: 'F = ΠM(0, 5, 9, 14) over four variables. How many minterms does F have?', options: ['4', '10', '12', '16'], answer: 2, explain: '16 rows in all, 4 of them maxterms, so the other 12 are minterms.' } },
      { topic: 'sigma-pi', input: { list: 'ΠM(0, 5, 9, 14)', n: 4 }, frame: 3, caption: 'From ΠM to Σm over four variables: the twelve rows not listed.' },
      { h: 'The complement' },
      'F′ is 1 exactly where F is 0. So the minterms of F′ are the maxterms of F: if F = Σm(1, 3, 4, 6) then F′ = Σm(0, 2, 5, 7), and F′ = ΠM(1, 3, 4, 6).',
      { kmap: { vars: ['A', 'B', 'C'], minterms: [1, 3, 4, 6], dc: [7], groups: 'minimal' }, caption: 'Σm(1, 3, 4, 6) + d(7) on a map: the 1s, the 0s at 0, 2, 5, and the don\'t-care at 7. Part 3 is about reading such maps.' },
      { h: 'Recap' },
      { list: ['Σm lists the rows where F = 1; ΠM the rows where F = 0; d lists the don\'t-cares.', 'Each list is the other\'s complement among all row numbers, leaving the don\'t-cares out.', 'The minterms of F′ are the maxterms of F.'] },
      X('alg-ex-sigma-pi'), X('alg-ex-pi-sigma-dc'), X('alg-ex-complement-list'),
    ],
  });

  C.lesson({
    id: 'alg-expand', chapter: 'alg-forms', title: 'Standard forms and expanding to canonical', minutes: 7,
    summary: 'A sum of products or product of sums whose terms may lack variables is a standard form. To reach the canonical form, widen each term: AND it with (X + X′) for each missing X, or OR it with XX′ for a sum.',
    blocks: [
      'AB + C′ is a sum of products, but not a canonical one: AB lacks C, and C′ lacks both A and B. Which rows does it cover? You could fill in a truth table, but there is a quicker, purely algebraic route.',
      { def: 'Standard form', text: 'a sum of products (SOP) or a product of sums (POS), with terms that need not contain every variable. A canonical form is a standard form in which every term does.' },
      'A product term missing X is unchanged when multiplied by X + X′ = 1, and that splits it into two terms, one with X and one with X′. Repeat until every variable is present. A sum term missing X is unchanged when XX′ = 0 is added to it, and the OR-over-AND distributive law then splits it into two sums.',
      { topic: 'expand-canonical', frame: 4, caption: 'C′ lacks A and B, so it is widened twice and becomes four minterms. Step on: AB contributes two, minterm 6 appears twice and is kept once, and F = Σm(0, 2, 4, 6, 7).' },
      { predict: { q: 'A product term over four variables names two of them. How many minterms does it cover?', options: ['2', '4', '8'], answer: 1, explain: 'Each missing variable doubles the count: two missing variables give 2 × 2 = 4 minterms.' } },
      { topic: 'expand-canonical', input: { f: "(A + B)(A' + C)", form: 'pos' }, frame: 6, caption: 'The same for a product of sums: each sum lacking a variable splits into two maxterms, and F = ΠM(0, 1, 4, 6).' },
      { func: { expr: "AB + C'" }, caption: 'AB + C′ in the workbench: Σm(0, 2, 4, 6, 7), as expanded. Type another short expression and read its minterms.' },
      { h: 'Recap' },
      { list: ['Standard forms may leave variables out of a term; canonical forms may not.', 'Widen a product with (X + X′); widen a sum with XX′.', 'A term missing k variables covers 2ᵏ rows; keep repeated minterms once.'] },
      X('alg-ex-expand'), X('alg-ex-expand-pos'), X('alg-ex-expand-4'),
    ],
  });

  C.lesson({
    id: 'alg-compdual', chapter: 'alg-forms', title: 'The complement and the dual of a function', minutes: 7,
    summary: 'The complement F′ swaps + and · and complements every literal; it flips every output. The dual swaps the operators only; at each row it is the complement of F at the opposite row.',
    blocks: [
      'A designer has F and needs F′, because the output must be active low. Is it enough to put an inverter after F? Yes, but often there is a cheaper circuit for F′ itself, and to find it you need F′ as an expression.',
      { topic: 'complement-dual', frame: 1, caption: 'F = AB′ + C. De Morgan, pushed all the way down to the inputs, gives F′ = (A′ + B)C′: swap + and ·, and complement every literal.' },
      { predict: { q: 'What is the dual of AB′ + C?', options: ['(A + B′)C', '(A′ + B)C′', 'A′B + C′', 'AB′ + C'], answer: 0, explain: 'The dual swaps only the operators; the literals stay: (A + B′)·C.' } },
      { topic: 'complement-dual', frame: 4, caption: 'Complement and dual compared on the table. F′ flips each row. The dual at 001 equals F at 110, complemented: Fᵈ(x) = F(x′)′.' },
      { topic: 'complement-dual', input: { f: 'AB + AC + BC' }, frame: 5, caption: 'For the majority function the dual is the function itself: it is self-dual.' },
      { func: { expr: "AB' + C" }, caption: 'F = AB′ + C in the workbench. Its minimal product of sums, (A + C)(B′ + C), is another route to F′: complement it term by term and you get a sum of products for F′.' },
      { h: 'Recap' },
      { list: ['Complement: swap + and ·, swap 0 and 1, complement every literal. F′ flips every output.', 'Dual: swap + and ·, swap 0 and 1, keep the literals. Fᵈ(x) = F(x′)′.', 'A function equal to its dual is self-dual.'] },
      X('alg-ex-complement'), X('alg-ex-complement-5'), X('alg-ex-dual-fn'),
    ],
  });

  // =========================================================================================================
  // Chapter 4: NAND, NOR and XOR
  // =========================================================================================================
  C.lesson({
    id: 'alg-universal', chapter: 'alg-nandxor', title: 'NAND and NOR are universal', minutes: 9,
    summary: 'NOT, AND and OR can each be built from NAND gates alone, or from NOR gates alone, so any function can. De Morgan, drawn as bubbles sliding through a gate, is the key.',
    blocks: [
      'A factory makes only one kind of gate, a two-input NAND, because it is the smallest and fastest gate it can build. Can every circuit be built from it? It is enough to make NOT, AND and OR, since every function has a sum-of-products form.',
      { topic: 'demorgan-bubbles', frame: 2, caption: 'The bubble on a NAND\'s output slides back through the gate: it splits into a bubble on each input, and the AND becomes an OR. (AB)′ = A′ + B′, drawn.' },
      { predict: { q: 'Slide the bubble of a NOR gate back to its inputs. What gate do you get?', options: ['An OR with bubbled inputs', 'An AND with bubbled inputs', 'A NAND'], answer: 1, explain: '(A + B)′ = A′B′: an AND gate with a bubble on each input.' } },
      { topic: 'universal', frame: 3, caption: 'OR from three NANDs: two NANDs with tied inputs make A′ and B′, and a NAND of those is (A′B′)′ = A + B. Step on to see it checked on every row.' },
      { topic: 'universal', input: { fam: 'NAND', target: 'XOR' }, frame: 4, caption: 'XOR from four NANDs. The first gate is shared: T = (AB)′ feeds both middle gates.' },
      { h: 'Try it' },
      { circuit: 'n1 = NAND(A, B)\nn2 = NAND(A, n1)\nn3 = NAND(B, n1)\nF = NAND(n2, n3)', outputs: ['F'], inputs: { A: 1 }, caption: 'The four-NAND XOR, live. Flip A and B and watch n1, n2 and n3.' },
      { h: 'The bench' },
      'Real chips make the point: a 7400 holds four NANDs, a 7402 four NORs, a 7404 six inverters. The lab below builds both sides of both De Morgan laws from them.',
      LAB('alg-lab-demorgan'),
      { tip: 'A two-level AND-OR circuit becomes NAND-NAND by changing every gate to a NAND: the bubbles meet in pairs on the wires between levels and cancel. Part 3 does this for any minimal form.' },
      { h: 'Recap' },
      { list: ['A NAND with tied inputs is NOT; NAND then NOT is AND; NOTs into a NAND is OR.', 'The same holds for NOR with AND and OR swapped.', 'De Morgan: a bubble slides through a gate, swapping AND and OR and landing on every input.'] },
      X('alg-ex-one-gate'), X('alg-ex-nand-or'), X('alg-ex-nor-and'), X('alg-ex-nand-sop'), X('alg-ex-nor-pos'), X('alg-ex-nand-pos'), X('alg-ex-nand-majority'), X('alg-ex-nor-sop'), X('alg-ex-nor-xor'), X('alg-ex-nand-xnor'), X('alg-ex-lab-demorgan'),
    ],
  });

  C.lesson({
    id: 'alg-xor', chapter: 'alg-nandxor', title: 'XOR, XNOR and parity', minutes: 9,
    summary: 'XOR is 1 when an odd number of inputs are 1. Its algebra (X ⊕ X = 0, X ⊕ 0 = X, X ⊕ 1 = X′) makes it the gate for parity: a tree of XORs generates a parity bit, and another tree checks it.',
    blocks: [
      'A byte crosses a noisy cable and one bit flips. How could the receiver know? Send one extra bit chosen so that the number of 1s is always even. A single flip makes the count odd, and counting 1s, odd or even, is exactly what XOR does.',
      { table: [['Law', 'Form'], ['Definition', 'X ⊕ Y = XY′ + X′Y'], ['With 0 and 1', 'X ⊕ 0 = X, X ⊕ 1 = X′'], ['With itself', 'X ⊕ X = 0, X ⊕ X′ = 1'], ['Order does not matter', 'X ⊕ Y = Y ⊕ X, (X ⊕ Y) ⊕ Z = X ⊕ (Y ⊕ Z)'], ['Complement through', '(X ⊕ Y)′ = X′ ⊕ Y = X ⊕ Y′ = XY + X′Y′']], caption: 'The algebra of XOR. XNOR, (X ⊕ Y)′, is 1 when its inputs are equal.' },
      { def: 'Odd function', text: 'a function that is 1 exactly when an odd number of inputs are 1: A ⊕ B ⊕ C ⊕ …. Its complement, the even function, is 1 when the count is even.' },
      'An odd function of n variables has 2ⁿ⁻¹ minterms, no two of them neighbours, so its minimal sum of products is as long as its canonical one: twelve literals for three variables. With XOR gates it is n − 1 gates.',
      { topic: 'xor-parity', frame: 3, caption: 'Data 1011 has three 1s, so the even-parity generator, a tree of three XORs, gives P = 1. Step on: bit B flips in transit and the checker\'s XOR of all five bits raises the error flag.' },
      { predict: { q: 'Two bits of the same word flip in transit. What does the even-parity checker report?', options: ['An error', 'No error', 'Which two bits flipped'], answer: 1, explain: 'Two flips change the count of 1s by an even number, so it stays even: the checker sees nothing wrong. Parity catches any odd number of errors only.' } },
      { topic: 'xor-parity', input: { data: '110', kind: 'even', flip: 4 }, frame: 5, caption: 'The parity bit itself can be the one that flips; the checker cannot tell the difference, and does not need to: something is wrong either way.' },
      { h: 'Try it' },
      { circuit: 'a = XOR(D3, D2)\nb = XOR(D1, D0)\nP = XOR(a, b)', outputs: ['P'], inputs: { D3: 1, D1: 1, D0: 1 }, caption: 'An even-parity generator for four bits, as a balanced tree of three XORs. Set any data and P makes the count even.' },
      LAB('alg-lab-parity'),
      { h: 'Recap' },
      { list: ['XOR is 1 for an odd number of 1 inputs; XNOR for an even number.', 'X ⊕ X = 0 and X ⊕ 0 = X, so XORing the same bit twice undoes it.', 'Parity generator: XOR the data bits (complement for odd parity). Checker: XOR everything; 1 means an error.', 'Parity detects any odd number of flipped bits, but not which one; Hamming codes in part 1 and part 8 go further.'] },
      X('alg-ex-pf-xor-cancel'), X('alg-ex-pf-xnor'), X('alg-ex-odd-function'), X('alg-ex-odd-parity'), X('alg-ex-parity-gen'), X('alg-ex-parity-check'), X('alg-ex-lab-parity'),
    ],
  });

  // ---- a guided tour -------------------------------------------------------------------------------------------
  C.tour({
    id: 'alg-tour', title: 'Tour: Boolean algebra and gates', blurb: 'From a gate symbol to a proof, in eight steps.',
    steps: [
      { route: 'part=algebra', target: '#main', text: 'Part 2 of the catalogue: Boolean algebra and gates. Each card is a topic that runs one idea and explains it step by step.' },
      { route: 'topic=gate-symbols', target: '#stageWrap', text: 'Each gate in both drawing styles, tried row by row. The narration gives the values on every row.' },
      { target: '#inputs', text: 'Pick another gate or the number of inputs here, or one of the examples.' },
      { route: 'topic=absorb-consensus', target: '#stageWrap', text: 'Consensus: a term covered jointly by two others, found row by row and then dropped.' },
      { route: 'topic=proof-game', target: '#stageWrap', text: 'Simplifying as a proof: each move names a law and where it applies. Wrong moves are refused with the reason.' },
      { route: 'topic=demorgan-bubbles', target: '#stageWrap', text: 'De Morgan as a bubble sliding back through a gate, and checked on every row.' },
      { route: 'func', target: '#main', text: 'The function workbench: type any expression and get its table, Σm and ΠM, minimal forms and K-map, all kept in step.' },
      { route: 'learn', target: '[data-chapter="alg-gates"]', text: 'The lessons and exercises of this part start here. Proofs are checked one step at a time, and circuits on every input row.' },
    ],
  });

  // ---- a course through every topic of the part ---------------------------------------------------------------
  C.course({
    id: 'alg-course', title: 'Boolean algebra and gates, start to finish', blurb: 'An ordered path through every topic of part 2, from gate symbols to parity, with lessons and exercises on the way.',
    steps: [
      { topic: 'gate-symbols', note: 'Eight gates, two drawing styles.' },
      { topic: 'pos-neg-logic', note: 'One device, two gates: H and L decide.' },
      { exercise: 'alg-ex-poslog-nor', note: 'Read a voltage table both ways.' },
      { topic: 'axioms', note: 'The axioms, checked row by row.' },
      { topic: 'duality', note: 'Swap + and ·: every law has a twin.' },
      { lesson: 'alg-duality', note: 'Duality, and why it is not the complement.' },
      { topic: 'theorems', note: 'Absorption, involution, De Morgan for any n.' },
      { exercise: 'alg-ex-pf-demorgan3', note: 'Your first proof: De Morgan with three variables.' },
      { topic: 'absorb-consensus', note: 'A term covered by two others together.' },
      { topic: 'proof-game', note: 'Simplify one law at a time; wrong moves refused.' },
      { lesson: 'alg-proofs', note: 'Proofs, hints, and refutation by one row.' },
      { exercise: 'alg-ex-pf-consensus', note: 'Absorb, then drop the consensus.' },
      { topic: 'expr-tree', note: 'The last operator is the root and the output gate.' },
      { topic: 'sixteen-functions', note: '16 functions of two variables; 2^(2ⁿ) of n.' },
      { topic: 'classifiers', note: 'Self-dual, symmetric, monotone, threshold.' },
      { topic: 'minterms-maxterms', note: 'One term per row.' },
      { topic: 'sigma-pi', note: 'Σm and ΠM: each list is the other\'s complement.' },
      { exercise: 'alg-ex-pi-sigma-dc', note: 'Convert a list with don\'t-cares.' },
      { topic: 'expand-canonical', note: 'Widen each term until it names every variable.' },
      { topic: 'complement-dual', note: 'F′ flips every row; the dual mirrors them.' },
      { exercise: 'alg-ex-complement', note: 'Push a complement down to the inputs.' },
      { topic: 'demorgan-bubbles', note: 'Bubbles slide through, AND becomes OR.' },
      { topic: 'universal', note: 'Everything from NAND, or from NOR.' },
      { exercise: 'alg-ex-nand-sop', note: 'A sum of products in NAND gates.' },
      { topic: 'xor-parity', note: 'A tree of XORs makes and checks parity.' },
      { lesson: 'alg-xor', note: 'XOR algebra, odd functions and parity.' },
      { exercise: 'alg-ex-parity-check', note: 'Build a checker that flags an error.' },
    ],
  });

  // ---- what the diagram checker looks at on these pages -------------------------------------------------------
  if (S.Checks && !S.Checks.some((c) => c.name === 'lesson alg-gates-symbols')) {
    const lessonReady = "document.querySelector('#lessonView')", exReady = "document.querySelector('#exerciseView')";
    for (const id of C.chapters.filter((c) => c.part === 'algebra' && /^alg-/.test(c.id)).flatMap((c) => c.lessons)) S.Checks.push({ group: 'learn', name: 'lesson ' + id, hash: 'lesson=' + id, ready: lessonReady, sel: '#main' });
    for (const id of ['alg-ex-gate-table', 'alg-ex-poslog-nor', 'alg-ex-refute', 'alg-ex-pf-demorgan-pos', 'alg-ex-pf-expand', 'alg-ex-simplify-pos', 'alg-ex-read-circuit', 'alg-ex-tree-circuit', 'alg-ex-classify', 'alg-ex-canon-sop', 'alg-ex-pi-sigma-dc', 'alg-ex-complement-5', 'alg-ex-nand-sop', 'alg-ex-nor-xor', 'alg-ex-odd-parity', 'alg-ex-lab-parity'])
      S.Checks.push({ group: 'learn', name: 'exercise ' + id, hash: 'exercise=' + id, ready: exReady, sel: '#main' });
    for (const id of ['alg-lab-demorgan', 'alg-lab-parity'])
      S.Checks.push({ group: 'learn', name: 'lab ' + id, hash: 'lab=' + id, ready: "document.querySelector('#labExp')", sel: '#main' });
    S.Checks.push({ group: 'learn', name: 'course alg-course', hash: 'course=alg-course', ready: "document.querySelector('#courseView')", sel: '#main' });
  }
})(globalThis.Sirkit = globalThis.Sirkit || {});
