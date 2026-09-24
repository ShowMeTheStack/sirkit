// Part 1, numbers and codes: the chapters, the lessons, a guided tour and a course. The exercises are in
// 11-numbers-ex.js. Each lesson opens with a question, runs the topic that animates the idea at a frame chosen for
// the point being made, asks for a prediction, gives something live to try where it helps, sums up, and leads to
// its exercises. Every number here is our own and comes from the engines.
(function (S) {
  'use strict';
  const C = S.Content;
  if (!C || C.lessons.has('num-positional')) return;
  const X = (id) => ({ exercise: id });

  C.chapter({ id: 'num-bases', part: 'numbers', n: 1, title: 'Numbers in any base', blurb: 'What a string of digits means, how to move a number between bases, and arithmetic when the digits stop at 1, 7 or F.' });
  C.chapter({ id: 'num-signed', part: 'numbers', n: 2, title: 'Complements and signed numbers', blurb: 'Subtraction by addition, three ways to write a negative number, and how to tell when a sum has overflowed.' });
  C.chapter({ id: 'num-codes', part: 'numbers', n: 3, title: 'Codes and registers', blurb: 'Decimal digits in binary, BCD addition, Gray code, parity, Hamming codes that correct an error, and the registers that hold it all.' });

  // circuits the lessons run (text netlists, read by the same parser as the exercises)
  const GRAY4 = 'G3 = B3\nG2 = XOR(B3, B2)\nG1 = XOR(B2, B1)\nG0 = XOR(B1, B0)';
  const PAR4 = 'p1 = XOR(D3, D2)\np2 = XOR(D1, D0)\nP = XOR(p1, p2)';
  const BCDFIX = 'a = AND(Z8, Z4)\nb = AND(Z8, Z2)\nK = OR(Cout, a, b)';
  const SHIFT3 = 'q0 = DFF(X)\nq1 = DFF(q0)\nq2 = DFF(q1)\nQ0 = q0\nQ1 = q1\nQ2 = q2';

  // =========================================================================================================
  // Chapter 1: numbers in any base
  // =========================================================================================================
  C.lesson({
    id: 'num-positional', chapter: 'num-bases', title: 'What a numeral means', minutes: 6,
    summary: 'In a positional system each place weighs a power of the base; a number\'s value is the sum of each digit times its weight, to the left of the point and to the right.',
    blocks: [
      'Write down 101. To you it is a hundred and one. Read as binary it is five, as octal sixty-five, and as hexadecimal two hundred and fifty-seven. The digits are the same; what changed is the **base**, the number each place is worth more than the place to its right.',
      { def: 'Positional number system', text: 'a way of writing numbers in which a digit\'s worth depends on its place: in base r, the places left of the point weigh r⁰, r¹, r², … and those to the right weigh r⁻¹, r⁻², …' },
      'So a numeral is a short way of writing a sum. In base r, the digits d₂d₁d₀.d₋₁ mean d₂·r² + d₁·r¹ + d₀·r⁰ + d₋₁·r⁻¹. Base 2 needs only the digits 0 and 1, base 8 the digits 0 to 7, and base 16 runs out of ordinary digits at 9 and carries on with A = 10 up to F = 15.',
      { table: [['Base', 'Name', 'Digits', 'Place weights'], ['2', 'binary', '0 1', '… 8 4 2 1 . ½ ¼'], ['8', 'octal', '0–7', '… 64 8 1 . ⅛'], ['10', 'decimal', '0–9', '… 100 10 1 . 0.1'], ['16', 'hexadecimal', '0–9, A–F', '… 256 16 1 . 1/16']], caption: 'The four bases of digital design.' },
      { topic: 'base-positional', frame: 5, caption: 'Hex 2B.8 weighed place by place: 2 sixteens, B (eleven) ones and 8 sixteenths, 43.5 in all. Step back through the frames to see each weight in turn.' },
      { predict: { q: 'What is (1101.101)₂ in decimal?', options: ['11.625', '13.5', '13.625', '15.125'], answer: 2, explain: 'Left of the point 8 + 4 + 1 = 13; right of it ½ + ⅛ = 0.625.' } },
      { h: 'Why binary' },
      'A wire in a circuit is reliably either low or high, so a digital machine stores every number as bits. People find long strings of bits hard to read, so they write them in octal or hex, where each digit stands for exactly three or four bits. That is the next lesson but one.',
      { tip: 'The weights are the whole story. When in doubt about any base, write the weights above the digits and add.' },
      { topic: 'base-positional', input: { x: '3A', base: '12' }, frame: 4, inputs: true, caption: 'Any base works the same way: here 3A in base 12 is 3 × 12 + 10 = 46. Type your own number and base.' },
      { h: 'Recap' },
      { list: ['In base r a digit is worth its value times rᵏ, where k counts places from the point (negative to the right).', 'Converting to decimal is just adding up digit × weight.', 'Hex digits A to F stand for 10 to 15.'] },
      X('num-ex-bin-dec'), X('num-ex-hex-dec'), X('num-ex-oct-frac'),
    ],
  });

  C.lesson({
    id: 'num-convert', chapter: 'num-bases', title: 'Into another base: divide, then multiply', minutes: 8,
    summary: 'The whole part of a decimal number goes into base r by dividing by r again and again, keeping the remainders; the fraction goes by multiplying by r again and again, keeping the whole parts.',
    blocks: [
      'A display wants the binary form of 156. You could hunt for the largest power of two below it, subtract and repeat, but there is a cleaner way that works for any base and never needs a table of powers.',
      { h: 'The whole part: repeated division' },
      'Divide by the new base. The remainder is the units digit, because everything else in the number is a multiple of the base. Divide the quotient again: the next remainder is the next digit. Stop when the quotient reaches 0.',
      { topic: 'base-division', frame: 9, caption: '156 into binary. The remainders came out 0, 0, 1, 1, 1, 0, 0, 1; read from the last to the first they give 10011100. The first remainder is the last digit.' },
      { topic: 'base-division', input: { n: 2024, base: '16' }, frame: 2, caption: '2024 into hex: the second remainder is 14, written as the digit E. Three divisions give 7E8.' },
      { predict: { q: 'Converting 100 to base 3, the first division gives 100 ÷ 3 = 33 remainder 1. Where does that 1 go?', options: ['It is the leading digit', 'It is the rightmost digit', 'It is thrown away'], answer: 1, explain: 'The first remainder is always the units digit. The full answer is 10201: 81 + 18 + 1 = 100.' } },
      { h: 'The fraction: repeated multiplication' },
      'For the part after the point, run the idea backwards: multiply by the base. The whole part of the product is the first digit after the point; keep the fraction and multiply again.',
      { topic: 'base-fraction', input: { f: '0.625', base: '2' }, frame: 4, caption: '0.625 is 5/8. Three multiplications by 2 give the digits 1, 0, 1 and leave nothing over: (0.625)₁₀ = (0.101)₂ exactly.' },
      { topic: 'base-fraction', frame: 6, caption: '0.3 never ends in binary: after five digits the fraction 6/10 comes round again, so the digits 1001 repeat for ever.' },
      { predict: { q: 'Does 0.75 end in binary?', options: ['Yes, it is 0.11', 'No, it repeats', 'Yes, it is 0.111'], answer: 0, explain: '0.75 = 3/4 and 4 is a power of 2: 0.75 × 2 = 1.5 gives 1, 0.5 × 2 = 1.0 gives 1, and nothing is left.' } },
      { warn: 'A fraction ends in base r only when its denominator, in lowest terms, divides a power of r. So 0.1 in decimal has no exact binary form, which is why a computer adding 0.1 ten times may not get exactly 1.' },
      { h: 'Recap' },
      { list: ['Whole part: divide by r repeatedly; the remainders, read last to first, are the digits.', 'Fraction: multiply by r repeatedly; the whole parts, read first to last, are the digits.', 'Convert the two parts separately and put the point between them.', 'A fraction may repeat for ever; stop at the number of places asked for.'] },
      X('num-ex-dec-bin'), X('num-ex-dec-hex'), X('num-ex-dec-b5'), X('num-ex-frac-bin'), X('num-ex-frac-rep'), X('num-ex-frac-oct'),
    ],
  });

  C.lesson({
    id: 'num-grouping', chapter: 'num-bases', title: 'Octal, hex, and sums in any base', minutes: 7,
    summary: 'Because 8 = 2³ and 16 = 2⁴, each octal digit is three bits and each hex digit four: convert by grouping bits outward from the point. Addition and subtraction work in any base, with a carry worth the base.',
    blocks: [
      'A memory dump shows 3D.A in hex, and the manual for an older machine wants octal. Going through decimal would take two long conversions. There is a shortcut, because both bases are powers of two.',
      { h: 'Grouping bits' },
      { steps: ['Write each digit as its bits: 3 bits per octal digit, 4 per hex digit.', 'Regroup the bits in the new size, starting at the point and working outward in both directions.', 'Pad with 0s at the far left of the whole part and the far right of the fraction to complete the end groups.', 'Read each group as one digit.'] },
      { topic: 'base-grouping', frame: 5, caption: 'Hex 3D.A as bits, then regrouped in threes outward from the point. Step on: the groups read 75.5 in octal.' },
      { predict: { q: 'What is (1011101.11)₂ in hex?', options: ['5D.C', 'BA.3', '5D.3', '135.6'], answer: 0, explain: 'Group in fours from the point: 101 1101 . 1100, that is 5 D . C. Padding the fraction on the right turns 11 into 1100, which is C, not 3.' } },
      { warn: 'Always group from the point outward. Grouping a fraction from its right end, or a whole part from its left end, shifts every digit.' },
      { tip: 'The same trick works for any pair of bases where one is a power of the other: base 9 digits are pairs of base 3 digits.' },
      { h: 'Arithmetic in another base' },
      'Adding in base r is the column sum you already know, except that a column carries when it reaches r rather than 10. Subtraction borrows r from the next column.',
      { topic: 'base-arith', input: { a: '9F3', b: '4BD', base: '16', op: '+' }, frame: 2, caption: 'Hex 9F3 + 4BD. The second column holds F + B + 1 = 27 = 1 × 16 + 11: write B and carry 1. The answer is EB0.' },
      { topic: 'base-arith', input: { a: '10010', b: '1011', base: '2', op: '−' }, frame: 4, inputs: true, caption: 'Binary 10010 − 1011, with a borrow worth 2 travelling left. Try your own numbers and bases.' },
      { h: 'Recap' },
      { list: ['Octal digit = 3 bits, hex digit = 4 bits.', 'Regroup outward from the point; pad the ends with zeros.', 'In base r a column carries at r and borrows r.'] },
      X('num-ex-hex-oct'), X('num-ex-bin-hex'), X('num-ex-b3-b9'), X('num-ex-oct-add'),
    ],
  });

  // =========================================================================================================
  // Chapter 2: complements and signed numbers
  // =========================================================================================================
  C.lesson({
    id: 'num-complements', chapter: 'num-signed', title: 'Complements: subtraction by adding', minutes: 8,
    summary: 'The (r−1)\'s complement subtracts every digit from r−1; the r\'s complement adds 1 to that. Adding the r\'s complement of N to M computes M − N, with the end carry telling the sign.',
    blocks: [
      'An adder is easy to build; a separate subtractor would double the hardware. Is there a way to subtract by adding? Old mechanical calculators already knew one.',
      { def: 'Complements', text: 'for an n-digit number N in base r, the (r−1)\'s complement is (rⁿ − 1) − N, every digit subtracted from r − 1; the r\'s complement is rⁿ − N, the (r−1)\'s complement plus 1.' },
      { topic: 'complements', input: { x: '2650', base: '10', n: 0 }, frame: 8, caption: 'In decimal: 2650 has 9\'s complement 7349 and 10\'s complement 7350. Their sum with 2650 is 9999 and 10000.' },
      { topic: 'complements', frame: 12, caption: 'In binary the 1\'s complement just inverts every bit: 0110100 becomes 1001011, and adding 1 gives the 2\'s complement 1001100. The last frame gives the shortcut.' },
      { tip: 'Shortcut for the 2\'s complement: copy the bits from the right up to and including the first 1, then invert everything to its left.' },
      { predict: { q: 'What is the 10\'s complement of 5000, kept to four digits?', options: ['4999', '5000', '6000', '0000'], answer: 1, explain: '10⁴ − 5000 = 5000: the 9\'s complement is 4999 and adding 1 gives 5000 again.' } },
      { h: 'Subtracting by adding' },
      'To find M − N, add M to the r\'s complement of N. The sum is M − N + rⁿ. If M ≥ N that is at least rⁿ, so a carry comes out of the top digit: drop it and the rest is the answer. If there is no end carry, the answer is negative, and the sum is the r\'s complement of its size.',
      { topic: 'complement-subtract', frame: 7, caption: '72532 − 3250: add 96750, the 10\'s complement of 03250. The end carry comes out; dropped, it leaves 69282.' },
      { topic: 'complement-subtract', input: { m: '3250', nn: '72532', base: '10' }, frame: 8, caption: 'The other way round: no end carry, so the sum 30718 is the complement of the answer. Complement it again and put a minus sign: −69282.' },
      { h: 'Recap' },
      { list: ['(r−1)\'s complement: subtract each digit from r − 1 (in binary, invert every bit).', 'r\'s complement: the (r−1)\'s complement plus 1.', 'M − N = M + (r\'s complement of N): an end carry means a positive result (drop the carry); none means negative (complement the sum).'] },
      X('num-ex-9s'), X('num-ex-10s'), X('num-ex-1s'), X('num-ex-2s'), X('num-ex-16s'), X('num-ex-sub-dec'), X('num-ex-sub-bin'),
    ],
  });

  C.lesson({
    id: 'num-signed', chapter: 'num-signed', title: 'Three ways to write −5', minutes: 7,
    summary: 'Signed magnitude, one\'s complement and two\'s complement all mark a negative number with a leading 1. Only two\'s complement has a single zero and lets one adder handle every sign.',
    blocks: [
      'A register has 4 bits and no minus sign. Somehow it must hold −5. There are three common answers, and they agree on every positive number.',
      { topic: 'signed-systems', frame: 8, caption: '−5 in four bits: 1101 in signed magnitude (a sign bit, then the size 101), 1010 in one\'s complement (+5 inverted), 1011 in two\'s complement (inverted, plus 1).' },
      { topic: 'signed-systems', frame: 4, caption: 'The whole range of four bits. The red rows are the second zeros: 1000 in signed magnitude and 1111 in one\'s complement. Two\'s complement has one zero and uses the spare pattern for −8.' },
      { predict: { q: 'What is the most negative number in 6-bit two\'s complement?', options: ['−31', '−32', '−63', '−64'], answer: 1, explain: 'n bits of two\'s complement hold −2ⁿ⁻¹ to 2ⁿ⁻¹ − 1: −32 to +31 for six bits.' } },
      { h: 'The leading bit weighs negative' },
      'Read a two\'s complement number like an unsigned one, except that the leftmost bit weighs −2ⁿ⁻¹ instead of +2ⁿ⁻¹. So 1011 is −8 + 2 + 1 = −5. No sign rule is needed: the adder just adds.',
      { topic: 'twos-wheel', input: { n: '4', a: -3, k: 5 }, frame: 4, caption: '−3 + 5 on the wheel of 4-bit patterns. At 1111 → 0000 the unsigned count wraps round (a carry out), but the signed value carries on correctly to 2.' },
      { tip: 'To negate in two\'s complement, invert and add 1 — whichever sign you start from. Negating twice gives the number back.' },
      { h: 'Recap' },
      { list: ['All three systems write positive numbers the same way, with a leading 0.', 'Signed magnitude: sign bit then size. One\'s complement: invert. Two\'s complement: invert and add 1.', 'Two\'s complement has one zero, a range of −2ⁿ⁻¹ to 2ⁿ⁻¹ − 1, and needs no special rules to add.'] },
      X('num-ex-s2'), X('num-ex-s1'), X('num-ex-ssm'), X('num-ex-v2'), X('num-ex-v1'), X('num-ex-range'),
    ],
  });

  C.lesson({
    id: 'num-overflow', chapter: 'num-signed', title: 'When a sum does not fit: overflow', minutes: 7,
    summary: 'A two\'s complement sum overflows when the true result lies outside the range. It shows as two operands of one sign giving a result of the other, or equally as the carries into and out of the sign bit differing.',
    blocks: [
      'An 8-bit register holds −128 to +127. Add 100 and 50 and the true answer, 150, has nowhere to go. The adder still produces eight bits. What do they say, and how does the hardware know they are wrong?',
      { topic: 'twos-wheel', frame: 4, caption: '5 + 4 on the 4-bit wheel: the third step crosses the seam between +7 and −8. The sign flips although we only added: overflow.' },
      { topic: 'signed-overflow', frame: 9, caption: '100 + 50 in eight bits. The carry into the sign bit is 1, the carry out is 0: they differ, so the result 10010110 (which would read as −106) is wrong.' },
      { predict: { q: 'In eight bits, −20 + 70. Will it overflow?', options: ['Yes: there is a carry out of the sign bit', 'No: numbers of different signs cannot overflow', 'Only in one\'s complement'], answer: 1, explain: 'The result always lies between the two operands, so it fits. The carry out happens but is simply dropped.' } },
      { topic: 'signed-overflow', input: { a: -20, b: 70, n: 8, rep: '2s' }, frame: 9, caption: 'The carries into and out of the sign bit are both 1: no overflow, and the dropped carry leaves 00110010 = 50.' },
      { h: 'Two equivalent tests' },
      { list: ['By the signs: overflow when both operands have the same sign and the result has the other.', 'By the carries: overflow when the carry into the sign bit differs from the carry out of it.'] },
      'The sign test, with A and B the operands\' sign bits and S the result\'s, is V = A′B′S + ABS′. Below it starts with two positive operands (A = B = 0) and a negative result (S = 1): overflow. Change the bits and watch V.',
      { circuit: { expr: "V = A'B'S + ABS'" }, inputs: { S: 1 }, caption: 'The overflow flag from the three sign bits. V lights only when A and B agree and S disagrees with them.' },
      { topic: 'signed-overflow', input: { a: -3, b: 5, n: 4, rep: '1s' }, frame: 5, caption: 'In one\'s complement the end carry is not dropped but added back into the lowest bit (the end-around carry): 0001 + 1 = 0010.' },
      { h: 'Recap' },
      { list: ['Overflow means the true sum is outside −2ⁿ⁻¹ … 2ⁿ⁻¹ − 1.', 'Only operands of the same sign can overflow.', 'Hardware tests carry-in ⊕ carry-out of the sign bit; a carry out by itself is not an overflow.'] },
      X('num-ex-ovf-which'), X('num-ex-ovf-4bit'),
    ],
  });

  // =========================================================================================================
  // Chapter 3: codes and registers
  // =========================================================================================================
  C.lesson({
    id: 'num-decimal-codes', chapter: 'num-codes', title: 'Decimal digits in four bits', minutes: 7,
    summary: 'BCD writes each decimal digit in plain 4-bit binary; excess-3 adds 3 first; 2421 weighs the bits 2, 4, 2, 1. Excess-3 and 2421 are self-complementing: inverting the bits gives the 9\'s complement.',
    blocks: [
      'A petrol pump shows 2093 on its display. Converting the whole number to binary would make the display circuit work hard to get the decimal digits back. Instead, many decimal devices keep each digit in its own group of four bits.',
      { def: 'Binary-coded decimal (BCD)', text: 'each decimal digit written as its 4-bit binary value, weighted 8, 4, 2, 1. The six patterns 1010 to 1111 are not used.' },
      { predict: { q: 'Excess-3 writes each digit as the binary for the digit plus three. What is 9 in excess-3?', options: ['1001', '1100', '1111', '0110'], answer: 1, explain: '9 + 3 = 12 = 1100.' } },
      { topic: 'decimal-codes', frame: 2, caption: 'The three codes side by side, one row per decimal digit: 8421 (plain binary), excess-3 (digit + 3) and 2421 (weights 2, 4, 2, 1).' },
      { topic: 'decimal-codes', frame: 9, caption: '2093 in excess-3, all bits inverted, reads 7906: the 9\'s complement of every digit at once. A 9\'s complementer is just inverters.' },
      { topic: 'decimal-codes', input: { x: '2093', code: '2421' }, frame: 8, caption: 'The same holds for 2421: 0010 0000 1111 0011 inverted is 1101 1111 0000 1100, which reads 7906.' },
      { h: 'Spotting a code that is not a digit' },
      'A circuit that receives BCD may want to flag the six unused patterns. With the bits named A B C D from 8 down to 1, the bad codes 1010 to 1111 are those with A = 1 and B or C set.',
      { func: { vars: ['A', 'B', 'C', 'D'], minterms: [10, 11, 12, 13, 14, 15] }, caption: 'The invalid-BCD detector, 1 exactly on rows 10 to 15. Its minimal form is AB + AC: D plays no part.' },
      { h: 'Recap' },
      { list: ['BCD: each digit in 8421 binary; 1010–1111 never occur.', 'Excess-3: digit + 3. 2421: weights 2, 4, 2, 1, with 5–9 starting with 1.', 'Self-complementing codes give the 9\'s complement by inverting the bits.'] },
      X('num-ex-bcd'), X('num-ex-xs3'), X('num-ex-2421'),
    ],
  });

  C.lesson({
    id: 'num-bcd-add', chapter: 'num-codes', title: 'Adding in BCD: the +6 correction', minutes: 6,
    summary: 'Add BCD digits as binary; if a digit sum is over 9, or carried out of its group, add 6 to skip the unused patterns and pass a carry to the next digit.',
    blocks: [
      'A cash register adds in BCD. Its adder is an ordinary 4-bit binary adder. When 8 + 5 gives 1101, that is not a decimal digit at all. What should the circuit do?',
      'Thirteen should be written as a carry and the digit 3. Binary counts on through the six patterns 1010–1111 that BCD skips, so the fix is to skip them on purpose: add 0110.',
      { topic: 'bcd-add', frame: 2, caption: '478 + 365, units first: 8 + 5 = 01101 is over 9, so add 0110 to get 10011, digit 3 and a carry of 1. The tens need the same fix; the hundreds do not.' },
      { predict: { q: 'In BCD, 9 + 9 gives the binary sum 10010. Is a correction needed?', options: ['No: 0010 is a valid digit', 'Yes: the group carried out, so the sum is over 9', 'Only if a carry came in'], answer: 1, explain: 'The sum is 18. The carry out of the group is the sign: add 0110 to get 11000, digit 8 and a carry.' } },
      { topic: 'bcd-add', input: { a: '9', b: '9' }, frame: 2, caption: '9 + 9: the four low bits 0010 look like a digit, but the carry out says the sum was 18. Adding 6 gives 1 1000: 18 in BCD.' },
      { h: 'The correction signal' },
      'With the binary sum Z8 Z4 Z2 Z1 and its carry Cout, the correction is needed when Cout = 1, or when the sum is 1010 to 1111: K = Cout + Z8Z4 + Z8Z2.',
      { circuit: BCDFIX, outputs: ['K'], inputs: { Z8: 1, Z2: 1 }, caption: 'K for the sum 1010 (ten): Z8 and Z2 are set, so the correction is on. Try 1001, then 1100.' },
      { h: 'Recap' },
      { list: ['Add each BCD digit pair in binary, with the carry from the digit before.', 'If the result is over 9 (K = Cout + Z8Z4 + Z8Z2), add 0110 and carry 1.', 'The correction never needs to be applied twice.'] },
      X('num-ex-bcd-add'),
    ],
  });

  C.lesson({
    id: 'num-gray', chapter: 'num-codes', title: 'Gray code: one bit at a time', minutes: 6,
    summary: 'In Gray code successive numbers differ in exactly one bit, so a reading taken mid-change is never far wrong. Binary to Gray is one XOR per bit; Gray to binary runs the XORs from the top down.',
    blocks: [
      'A shaft encoder reads the angle of a turning disc from four tracks of light and dark. Between sector 7 and sector 8, the binary pattern goes from 0111 to 1000: all four bits change. If the tracks switch a few microseconds apart, the reader could see anything from 0000 to 1111 at the boundary.',
      { topic: 'gray-encoder', frame: 3, caption: 'Sector 7 → 8: binary changes 4 bits, Gray (0100 → 1100) changes 1. A head on the boundary reads one of two true neighbours in Gray, but any of 16 patterns in binary.' },
      { topic: 'gray-encoder', input: { n: '3', from: 0, steps: 8 }, frame: 8, caption: 'A whole turn of a 3-bit disc. Even the step from 7 back to 0 changes one Gray bit.' },
      { def: 'Gray code', text: 'an ordering of the n-bit patterns in which each pattern differs from the next, and the last from the first, in exactly one bit.' },
      { h: 'Converting' },
      'The top Gray bit is the top binary bit. Every other Gray bit says whether two neighbouring binary bits differ: Gᵢ = Bᵢ₊₁ ⊕ Bᵢ. Going back, each binary bit is the XOR of the binary bit above it and its own Gray bit, so work from the top down.',
      { circuit: GRAY4, outputs: ['G3', 'G2', 'G1', 'G0'], inputs: { B2: 1, B1: 1, B0: 1 }, caption: 'Binary 0111 gives Gray 0100. Now set B3 and clear the rest: binary 1000.' },
      { predict: { q: 'What is binary 1000 in Gray code?', options: ['1000', '1100', '1111', '0100'], answer: 1, explain: 'G3 = 1, G2 = 1 ⊕ 0 = 1, G1 = 0 ⊕ 0 = 0, G0 = 0 ⊕ 0 = 0.' } },
      { tip: 'Gray order is why the rows and columns of a Karnaugh map run 00, 01, 11, 10: neighbouring cells must differ in one variable.' },
      { h: 'Recap' },
      { list: ['Neighbouring Gray codes differ in one bit, so a reading taken mid-change is never wildly wrong.', 'Binary → Gray: G = B ⊕ (B shifted right one place).', 'Gray → binary: from the top, each binary bit = the bit above ⊕ its Gray bit.'] },
      X('num-ex-gray'), X('num-ex-gray-back'),
    ],
  });

  C.lesson({
    id: 'num-parity', chapter: 'num-codes', title: 'ASCII and the parity bit', minutes: 6,
    summary: 'ASCII gives each character a 7-bit code. A parity bit makes the number of 1s even (or odd), so any single flipped bit, and any odd number of flips, shows up at the receiver.',
    blocks: [
      'A terminal sends the word "Gate" down a noisy cable, one character at a time. Each character is a 7-bit ASCII code. How can the receiver tell whether a bit was flipped on the way?',
      { topic: 'ascii-parity', frame: 6, caption: '"a" is 1100001, three 1s. For even parity the sender adds a parity bit of 1 in front, making four.' },
      { predict: { q: 'Noise flips one bit of the second character. What will the receiver see?', options: ['Nothing: it looks fine', 'Five 1s: a parity error', 'It can tell which bit flipped'], answer: 1, explain: 'One flip changes the count of 1s by one, so an even count becomes odd. Parity says something is wrong, not where.' } },
      { topic: 'ascii-parity', frame: 12, caption: 'The second character arrives as 11110001, five 1s: caught.' },
      { topic: 'ascii-parity', input: { text: 'Gate', parity: 'even', flips: ['3.2', '3.6'] }, frame: 15, caption: 'Two flips in one character leave the count even, so the damage passes unseen. Parity catches only an odd number of errors.' },
      { h: 'The parity generator' },
      'The parity of a word is the XOR of its bits: XOR is 1 exactly when an odd number of its inputs are 1. A tree of XOR gates computes it.',
      { circuit: PAR4, outputs: ['P'], inputs: { D3: 1, D1: 1, D0: 1 }, caption: 'Data 1011 has three 1s, so the even-parity bit P is 1. Flip any one input and watch P change.' },
      { tip: 'The receiver runs the same tree over the data and the parity bit together: the output is 0 for even parity and 1 when an error is caught.' },
      { h: 'Recap' },
      { list: ['ASCII: 7 bits per character; a parity bit makes 8.', 'Even parity: the parity bit makes the number of 1s even. Odd parity: odd.', 'Parity detects any odd number of flips, cannot locate them, and misses even numbers.'] },
      X('num-ex-parity-k'), X('num-ex-ascii-odd'),
    ],
  });

  C.lesson({
    id: 'num-hamming', chapter: 'num-codes', title: 'Hamming codes: finding the flipped bit', minutes: 9,
    summary: 'Parity bits at positions 1, 2, 4, 8, … each check the positions whose number has that bit set. The failing checks, added up, give the position of a single wrong bit. One more overall parity bit tells one error from two.',
    blocks: [
      'One parity bit says that something went wrong. Memory chips want more: they want to fix a single flipped bit on the fly, without asking anyone to send it again. The trick is to use several parity bits, each watching an overlapping set of positions.',
      { h: 'Building the code word' },
      { steps: ['Number the positions from 1. The powers of two (1, 2, 4, 8, …) hold parity bits; the data fills the rest in order.', 'Parity bit P1 checks every position whose binary number has a 1 in the 1s place: 1, 3, 5, 7, …', 'P2 checks positions with a 1 in the 2s place: 2, 3, 6, 7, …; P4 checks 4, 5, 6, 7, 12, …', 'Each parity bit is chosen to make its group even.'] },
      { topic: 'hamming', frame: 5, caption: 'Data 1011 goes into positions 3, 5, 6, 7; the three parity bits work out as P1 = 0, P2 = 1, P4 = 0, giving the code word 0110011.' },
      { predict: { q: 'In a 7-bit Hamming code, which positions does P2 check?', options: ['2, 4, 6', '2, 3, 6, 7', '2, 3, 4, 5', '1, 2, 3'], answer: 1, explain: 'The positions whose binary number has a 1 in the 2s place: 010, 011, 110, 111.' } },
      { h: 'Reading the syndrome' },
      'The receiver redoes each check. A check that fails contributes its weight (1, 2, 4, …) to the **syndrome**. A single wrong bit lies in exactly the failing groups, and its position number is exactly the sum of their weights.',
      { topic: 'hamming', frame: 10, caption: 'Bit 6 flipped in transit. Check 1 passes, checks 2 and 4 fail: syndrome 110 = 6, the wrong bit. In the circles, it is the bit inside both failing circles and outside the passing one.' },
      { h: 'One error or two? SEC-DED' },
      'If two bits flip, the syndrome is non-zero but points at the wrong place. Adding an overall parity bit P0 over the whole word separates the cases: one error makes the overall parity odd, two leave it even.',
      { topic: 'hamming', input: { data: '1011', secded: 'yes', flips: ['3', '6'] }, frame: 12, caption: 'Bits 3 and 6 flipped. The syndrome is 5 but the overall parity is even: two errors, detected but not corrected.' },
      { table: [['Syndrome', 'Overall parity', 'Verdict'], ['0', 'even', 'no error'], ['non-zero', 'odd', 'one error, at the syndrome: correct it'], ['0', 'odd', 'P0 itself flipped'], ['non-zero', 'even', 'two errors: detect only']], caption: 'Single error correction, double error detection.' },
      { h: 'Recap' },
      { list: ['m data bits need k parity bits with 2ᵏ ≥ m + k + 1: 3 for 4 data bits, 4 for 8.', 'Parity bit 2ʲ checks every position with bit j set.', 'Syndrome = the sum of the failing checks = the position of a single error.', 'An overall parity bit adds double-error detection.'] },
      X('num-ex-ham-enc'), X('num-ex-ham-enc8'), X('num-ex-ham-pos'), X('num-ex-ham-syn'), X('num-ex-ham-data'), X('num-ex-ham-secded'), X('num-ex-ham-sd-pos'), X('num-ex-ham-double'),
    ],
  });

  C.lesson({
    id: 'num-registers', chapter: 'num-codes', title: 'Registers: where the bits live', minutes: 6,
    summary: 'A register is a row of flip-flops that changes only on a clock edge. A parallel transfer moves a whole word in one clock over one wire per bit; a serial transfer moves one bit per clock over a single wire.',
    blocks: [
      'All the numbers and codes in this part have to be kept somewhere while the machine works on them. That place is a **register**: one flip-flop per bit, all loading together on the edge of a clock. Part 5 builds the flip-flop; here we only watch what registers do with numbers.',
      { topic: 'register-transfer', input: { r1: '10110010', op: 'copy', clocks: 1 }, frame: 1, caption: 'A parallel transfer R2 ← R1: eight wires, one clock edge, and R1 keeps its value.' },
      { topic: 'register-transfer', frame: 8, caption: 'A serial transfer: both registers shift right on each clock and one wire carries the bit that leaves R1. After 8 clocks the byte has crossed.' },
      { predict: { q: 'R1 holds 00010110 (22). After one shift left, with a 0 coming in on the right, what does it hold?', options: ['00001011 (11)', '00101100 (44)', '00010111 (23)'], answer: 1, explain: 'Every bit moves up one place, doubling each weight.' } },
      { topic: 'register-transfer', input: { r1: '00010110', op: 'shl', clocks: 2 }, frame: 2, caption: 'Two shifts left: 22 → 44 → 88. Shifting left multiplies by two, as long as no 1 falls off the end.' },
      'Here is a 3-bit shift register you can run: each clock, X enters Q0 and every bit moves one place along.',
      { waveform: { circuit: SHIFT3, inputs: { X: '10110000' }, clocked: true, outputs: ['Q0', 'Q1', 'Q2'] }, caption: 'The pattern on X reappears on Q0, then Q1, then Q2, one clock later each time.' },
      { h: 'Recap' },
      { list: ['A register holds a word and changes only on a clock edge.', 'Parallel transfer: n wires, one clock. Serial: one wire, n clocks.', 'Shifting left doubles an unsigned number; shifting right halves it.'] },
      X('num-ex-shift-clocks'), X('num-ex-shl-value'),
    ],
  });

  // ---- a guided tour -------------------------------------------------------------------------------------------
  C.tour({
    id: 'num-tour', title: 'Tour: numbers and codes', blurb: 'From a base conversion to a corrected bit, in eight steps.',
    steps: [
      { route: 'part=numbers', target: '#main', text: 'Part 1 of the catalogue: numbers and codes. Each card is a topic that works one example step by step, with the real values.' },
      { route: 'topic=base-division', target: '#stageWrap', text: 'Decimal to binary by repeated division. Each remainder drops into place as the next digit, from the right.' },
      { target: '#btnPlay', text: 'Play steps through the run; the arrow keys go one step at a time, forwards or back.' },
      { target: '#inputs', text: 'Change the number or the base here, or pick an example. Try 2024 into hex.' },
      { route: 'topic=twos-wheel', target: '#stageWrap', text: 'The two\'s complement wheel. Adding is walking clockwise; crossing the red seam between +7 and −8 is overflow.' },
      { route: 'topic=hamming', target: '#stageWrap', text: 'A Hamming code: three parity circles over seven bits. Flip a bit and the failing circles point straight at it.' },
      { route: 'lesson=num-hamming', target: '#lessonView', text: 'Lessons explain each idea with the topics running inside them, a prediction to make, and exercises at the end.' },
      { route: 'learn', target: '[data-chapter="num-bases"]', text: 'The lessons and exercises of this part start here. Conversions are checked digit by digit, with a hint that says where the answer first goes wrong.' },
    ],
  });

  // ---- a course through every topic of the part ---------------------------------------------------------------
  C.course({
    id: 'num-course', title: 'Numbers and codes, start to finish', blurb: 'An ordered path through every topic of part 1, from what a numeral means to a register shifting it, with lessons and exercises on the way.',
    steps: [
      { topic: 'base-positional', note: 'Every place weighs a power of the base.' },
      { exercise: 'num-ex-hex-dec', note: 'Hex to decimal, with a fraction.' },
      { topic: 'base-division', note: 'Divide again and again; the remainders are the digits, last one first.' },
      { topic: 'base-fraction', note: 'Multiply again and again; some fractions never end.' },
      { lesson: 'num-convert', note: 'Both halves of a conversion together.' },
      { exercise: 'num-ex-dec-hex', note: 'Your turn: decimal to hex.' },
      { topic: 'base-grouping', note: 'Three bits per octal digit, four per hex digit, grouped from the point.' },
      { topic: 'base-arith', note: 'Carries worth the base.' },
      { topic: 'complements', note: 'Subtract every digit from r − 1, then add 1.' },
      { topic: 'complement-subtract', note: 'M − N by adding, and what the end carry says.' },
      { exercise: 'num-ex-sub-dec', note: 'A subtraction with no end carry.' },
      { topic: 'signed-systems', note: 'Three ways to write a negative number.' },
      { topic: 'twos-wheel', note: 'Walk the wheel; the seam is overflow.' },
      { topic: 'signed-overflow', note: 'Carry into and out of the sign bit.' },
      { lesson: 'num-overflow', note: 'Two tests for overflow, and a circuit for one.' },
      { exercise: 'num-ex-ovf-which', note: 'Which of these sums overflow?' },
      { topic: 'decimal-codes', note: 'BCD, excess-3 and 2421, and self-complementing codes.' },
      { topic: 'bcd-add', note: 'Add in binary; over 9, add 6.' },
      { exercise: 'num-ex-bcd-add', note: 'A three-digit BCD sum.' },
      { topic: 'gray-encoder', note: 'One bit changes at a time, even round the wrap.' },
      { topic: 'ascii-parity', note: 'A parity bit catches one flip and misses two.' },
      { topic: 'hamming', note: 'Parity circles, the syndrome, and SEC-DED.' },
      { lesson: 'num-hamming', note: 'The Hamming code from start to finish.' },
      { exercise: 'num-ex-ham-pos', note: 'Find the flipped bit.' },
      { topic: 'register-transfer', note: 'Where the bits live, and how they move.' },
    ],
  });

  // ---- what the diagram checker looks at on these pages -------------------------------------------------------
  if (S.Checks && !S.Checks.some((c) => c.name === 'lesson num-positional')) {
    const lessonReady = "document.querySelector('#lessonView')", exReady = "document.querySelector('#exerciseView')";
    for (const id of C.chapters.filter((c) => c.part === 'numbers').flatMap((c) => c.lessons)) S.Checks.push({ group: 'learn', name: 'lesson ' + id, hash: 'lesson=' + id, ready: lessonReady, sel: '#main' });
    for (const id of ['num-ex-hex-dec', 'num-ex-dec-b5', 'num-ex-frac-rep', 'num-ex-b3-b9', 'num-ex-oct-add', 'num-ex-sub-dec', 'num-ex-s2', 'num-ex-ovf-which', 'num-ex-bcd-add', 'num-ex-gray-back', 'num-ex-ham-enc8', 'num-ex-ham-double', 'num-ex-shl-value'])
      S.Checks.push({ group: 'learn', name: 'exercise ' + id, hash: 'exercise=' + id, ready: exReady, sel: '#main' });
    S.Checks.push({ group: 'learn', name: 'course num-course', hash: 'course=num-course', ready: "document.querySelector('#courseView')", sel: '#main' });
  }
})(globalThis.Sirkit = globalThis.Sirkit || {});
