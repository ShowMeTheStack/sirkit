// Part 1, numbers and codes: the exercises. The lessons, the tour and the course are in 10-numbers.js. Every
// number here is our own; each answer is worked out by the number engine (Bool.Numbers) and checked by it.
(function (S) {
  'use strict';
  const C = S.Content;
  if (!C || C.exercises.has('num-ex-bin-dec')) return;
  const ex = (o) => C.exercise(o);

  // ===========================================================================================================
  // Chapter 1: numbers in any base
  // ===========================================================================================================
  ex({
    id: 'num-ex-bin-dec', chapter: 'num-bases', title: 'Binary to decimal', level: 1, kind: 'convert', op: 'base', value: '11010110', from: 2, to: 10,
    text: ['Convert (11010110)₂ to decimal.'],
    hints: ['Write the weights above the bits: 128, 64, 32, 16, 8, 4, 2, 1.', 'Add the weights where the bit is 1: 128, 64, 16, 4 and 2.', '128 + 64 + 16 + 4 + 2 = 214.'],
    solution: '214', wrong: ['107', '213', '428'],
    why: 'Each 1 contributes its place weight; the 0s contribute nothing.',
  });
  ex({
    id: 'num-ex-hex-dec', chapter: 'num-bases', title: 'Hex with a fraction', level: 2, kind: 'convert', op: 'base', value: 'B7.4', from: 16, to: 10,
    text: ['Convert (B7.4)₁₆ to decimal.'],
    hints: ['B stands for 11. The places weigh 16, 1 and 1/16.', '11 × 16 + 7 × 1 = 183, and 4 × 1/16 = 0.25.', '(B7.4)₁₆ = 183.25.'],
    solution: '183.25', wrong: ['183.4', '117.25', '183'],
  });
  ex({
    id: 'num-ex-oct-frac', chapter: 'num-bases', title: 'An octal fraction', level: 2, kind: 'convert', op: 'base', value: '0.34', from: 8, to: 10,
    text: ['Convert (0.34)₈ to decimal.'],
    hints: ['The places after the point weigh 1/8 and 1/64.', '3/8 + 4/64 = 24/64 + 4/64 = 28/64 = 7/16.', '7/16 = 0.4375.'],
    solution: '0.4375', wrong: ['0.34', '0.425', '0.4'],
  });
  ex({
    id: 'num-ex-dec-bin', chapter: 'num-bases', title: 'Decimal to binary', level: 1, kind: 'convert', op: 'base', value: 213, from: 10, to: 2,
    text: ['Convert 213 to binary by repeated division by 2.'],
    hints: ['213 ÷ 2 = 106 remainder 1: the units bit is 1.', 'Keep going: 106, 53, 26, 13, 6, 3, 1 leave the remainders 0, 1, 0, 1, 0, 1, 1.', 'All the remainders, first to last: 1, 0, 1, 0, 1, 0, 1, 1. Read from the last: 11010101.'],
    solution: '11010101', wrong: ['10101011', '11010111', '1101010'],
    why: 'Check: 128 + 64 + 16 + 4 + 1 = 213.',
  });
  ex({
    id: 'num-ex-dec-hex', chapter: 'num-bases', title: 'Decimal to hex', level: 1, kind: 'convert', op: 'base', value: 3054, from: 10, to: 16,
    text: ['Convert 3054 to hexadecimal.'],
    hints: ['Divide by 16: 3054 ÷ 16 = 190 remainder 14. A remainder of 14 is the digit E.', '190 ÷ 16 = 11 remainder 14; 11 ÷ 16 = 0 remainder 11, the digit B.', 'Read the remainders from the last: B, E, E. (3054)₁₀ = (BEE)₁₆.'],
    solution: 'BEE', wrong: ['EEB', '111414', 'BE'],
  });
  ex({
    id: 'num-ex-dec-b5', chapter: 'num-bases', title: 'Decimal to base 5', level: 2, kind: 'convert', op: 'base', value: 94, from: 10, to: 5,
    text: ['Convert 94 to base 5.'],
    hints: ['Divide by 5 and keep the remainders; the digits can only be 0 to 4.', '94 ÷ 5 = 18 remainder 4; 18 ÷ 5 = 3 remainder 3; 3 ÷ 5 = 0 remainder 3.', 'Read from the last remainder: 334. Check: 3 × 25 + 3 × 5 + 4 = 94.'],
    solution: '334', wrong: ['433', '184', '344'],
  });
  ex({
    id: 'num-ex-frac-bin', chapter: 'num-bases', title: 'A fraction that ends', level: 1, kind: 'convert', op: 'base', value: '0.8125', from: 10, to: 2,
    text: ['Convert 0.8125 to binary.'],
    hints: ['Multiply by 2; the whole part of each product is the next bit after the point.', '0.8125 × 2 = 1.625 → 1; 0.625 × 2 = 1.25 → 1; 0.25 × 2 = 0.5 → 0; 0.5 × 2 = 1.0 → 1.', 'Nothing is left, so the bits stop: 0.1101.'],
    solution: '0.1101', wrong: ['0.1011', '0.111', '0.11011'],
    why: '0.8125 = 13/16, and 16 is a power of 2, so the fraction ends after four bits.',
  });
  ex({
    id: 'num-ex-frac-rep', chapter: 'num-bases', title: 'A fraction that repeats', level: 2, kind: 'convert', op: 'base', value: '0.6', from: 10, to: 2, fracDigits: 4,
    text: ['Convert 0.6 to binary, to four places after the point (cut off, not rounded).'],
    hints: ['0.6 × 2 = 1.2 gives the first bit, 1.', '0.2 × 2 = 0.4 → 0; 0.4 × 2 = 0.8 → 0; 0.8 × 2 = 1.6 → 1.', 'Four places: 0.1001. The fraction 0.6 has come round again, so 1001 repeats for ever.'],
    solution: '0.1001', wrong: ['0.1010', '0.0110', '0.11'],
  });
  ex({
    id: 'num-ex-frac-oct', chapter: 'num-bases', title: 'A decimal fraction in octal', level: 3, kind: 'convert', op: 'base', value: '0.2', from: 10, to: 8, fracDigits: 4,
    text: ['Convert 0.2 to octal, to four places after the point (cut off, not rounded).'],
    hints: ['Work with the exact fraction 1/5 and multiply by 8 each time.', '1/5 × 8 = 1 + 3/5 → 1; 3/5 × 8 = 4 + 4/5 → 4; 4/5 × 8 = 6 + 2/5 → 6.', '2/5 × 8 = 3 + 1/5 → 3, and 1/5 has come back: (0.2)₁₀ = (0.1463…)₈. Four places: 0.1463.'],
    solution: '0.1463', wrong: ['0.1631', '0.2', '0.1464'],
  });
  ex({
    id: 'num-ex-hex-oct', chapter: 'num-bases', title: 'Hex to octal by grouping', level: 2, kind: 'convert', op: 'base', value: 'E5.C', from: 16, to: 8,
    text: ['Convert (E5.C)₁₆ to octal, through binary.'],
    hints: ['Each hex digit is four bits: E5.C = 1110 0101 . 1100.', 'Regroup in threes outward from the point, padding the ends: 011 100 101 . 110.', 'Each group is one octal digit: 345.6.'],
    solution: '345.6', wrong: ['345.3', '712.6', '229.75'],
  });
  ex({
    id: 'num-ex-bin-hex', chapter: 'num-bases', title: 'Binary to hex', level: 1, kind: 'convert', op: 'base', value: '1101011.0111', from: 2, to: 16,
    text: ['Convert (1101011.0111)₂ to hexadecimal.'],
    hints: ['Group the bits in fours outward from the point.', '0110 1011 . 0111: the whole part needs one 0 on the left.', '6 B . 7: the answer is 6B.7.'],
    solution: '6B.7', wrong: ['D6.7', '6B.E', '107.7'],
  });
  ex({
    id: 'num-ex-b3-b9', chapter: 'num-bases', title: 'Base 3 to base 9', level: 3, kind: 'convert', op: 'base', value: '2120', from: 3, to: 9,
    text: ['Convert (2120)₃ to base 9. There is a shortcut like the one between binary and hex.'],
    hints: ['9 = 3², so each base-9 digit stands for two base-3 digits.', 'Group the base-3 digits in pairs from the right: 21 | 20.', '(21)₃ = 7 and (20)₃ = 6, so (2120)₃ = (76)₉. Check: both are 69 in decimal.'],
    solution: '76', wrong: ['69', '67', '2120'],
  });
  ex({
    id: 'num-ex-oct-add', chapter: 'num-bases', title: 'Adding in octal', level: 2, kind: 'string', answer: '760',
    text: ['Add in octal: (475)₈ + (263)₈. Give the sum in octal.'],
    hints: ['Units: 5 + 3 = 8 = 1 × 8 + 0: write 0, carry 1.', 'Eights: 7 + 6 + 1 = 14 = 1 × 8 + 6: write 6, carry 1. Sixty-fours: 4 + 2 + 1 = 7.', 'The sum is (760)₈. Check: 317 + 179 = 496 = 7 × 64 + 6 × 8.'],
    solution: '760', wrong: ['738', '750', '1060'], whyNot: 'In octal a column carries when it reaches 8, not 10.',
  });

  // ===========================================================================================================
  // Chapter 2: complements and signed numbers
  // ===========================================================================================================
  ex({
    id: 'num-ex-9s', chapter: 'num-signed', title: 'The 9\'s complement', level: 1, kind: 'convert', op: 'complement', value: '40719', base: 10, complement: 'r-1',
    text: ['Find the 9\'s complement of 40719.'],
    hints: ['Subtract every digit from 9.', '9 − 4 = 5, 9 − 0 = 9, 9 − 7 = 2, 9 − 1 = 8, 9 − 9 = 0.', 'The 9\'s complement is 59280.'],
    solution: '59280', wrong: ['59281', '69281', '40719'],
  });
  ex({
    id: 'num-ex-10s', chapter: 'num-signed', title: 'The 10\'s complement', level: 1, kind: 'convert', op: 'complement', value: '40719', base: 10, complement: 'r',
    text: ['Find the 10\'s complement of 40719.'],
    hints: ['The 10\'s complement is the 9\'s complement plus 1.', 'The 9\'s complement is 59280.', '59280 + 1 = 59281. Check: 40719 + 59281 = 100000.'],
    solution: '59281', wrong: ['59280', '60281', '69291'],
  });
  ex({
    id: 'num-ex-1s', chapter: 'num-signed', title: 'The 1\'s complement', level: 1, kind: 'convert', op: 'complement', value: '0101101', base: 2, complement: 'r-1',
    text: ['Find the 1\'s complement of 0101101 (keep all seven bits).'],
    hints: ['Subtract every bit from 1.', 'That is the same as inverting every bit.', '0101101 → 1010010.'],
    solution: '1010010', wrong: ['1010011', '0101101', '101001'],
  });
  ex({
    id: 'num-ex-2s', chapter: 'num-signed', title: 'The 2\'s complement', level: 1, kind: 'convert', op: 'complement', value: '10110000', base: 2, complement: 'r',
    text: ['Find the 2\'s complement of 10110000 (keep all eight bits).'],
    hints: ['Invert every bit, then add 1. Or use the shortcut: copy from the right up to the first 1, then invert the rest.', 'Inverted: 01001111. Adding 1 carries all the way through the four 1s on the right.', '01001111 + 1 = 01010000. The shortcut gives the same: copy 10000, invert 101 to 010.'],
    solution: '01010000', wrong: ['01001111', '01010001', '1010000'],
  });
  ex({
    id: 'num-ex-16s', chapter: 'num-signed', title: 'A hex complement', level: 2, kind: 'convert', op: 'complement', value: '3A0', base: 16, complement: 'r',
    text: ['Find the 16\'s complement of (3A0)₁₆, kept to three digits.'],
    hints: ['First the 15\'s complement: subtract every digit from F.', 'F − 3 = C, F − A = 5, F − 0 = F: the 15\'s complement is C5F.', 'Add 1: C5F + 1 = C60. Check: 3A0 + C60 = 1000 in hex.'],
    solution: 'C60', wrong: ['C5F', 'C6F', 'D60'],
  });
  ex({
    id: 'num-ex-sub-dec', chapter: 'num-signed', title: 'Subtract by adding a complement', level: 2, kind: 'string', answer: ['-2274', '−2274'],
    text: ['Compute 6153 − 8427 by adding the 10\'s complement of 8427 to 6153. Give the result in decimal, with its sign.'],
    hints: ['The 10\'s complement of 8427 is 1573.', '6153 + 1573 = 7726, with no carry out of the fourth digit. No end carry means the result is negative.', 'Take the 10\'s complement of 7726, which is 2274, and put a minus sign: −2274.'],
    solution: '-2274', wrong: ['7726', '2274', '-7726'], whyNot: 'With no end carry, the sum is the 10\'s complement of the answer: complement it and make it negative.',
  });
  ex({
    id: 'num-ex-sub-bin', chapter: 'num-signed', title: 'A binary subtraction with no end carry', level: 3, kind: 'string', answer: ['-11011', '−11011', '-0011011', '−0011011'],
    text: ['Compute 1001010 − 1100101 by adding the 2\'s complement of 1100101 (seven bits). Give the result in binary, with its sign.'],
    hints: ['The 2\'s complement of 1100101 is 0011011.', '1001010 + 0011011 = 1100101, with no end carry: the result is negative.', 'The 2\'s complement of 1100101 is 0011011, so the result is −11011 (74 − 101 = −27).'],
    solution: '-11011', wrong: ['1100101', '11011', '-1100101'], whyNot: 'With no end carry, the sum is the 2\'s complement of the answer: complement it and make it negative.',
  });
  ex({
    id: 'num-ex-s2', chapter: 'num-signed', title: '−37 in two\'s complement', level: 1, kind: 'convert', op: 'signed', value: -37, bits: 8, rep: '2s',
    text: ['Write −37 as an 8-bit two\'s complement number.'],
    hints: ['Start from +37 in eight bits: 00100101.', 'Invert every bit: 11011010.', 'Add 1: 11011011.'],
    solution: '11011011', wrong: ['11011010', '10100101', '00100101'],
  });
  ex({
    id: 'num-ex-s1', chapter: 'num-signed', title: '−37 in one\'s complement', level: 2, kind: 'convert', op: 'signed', value: -37, bits: 8, rep: '1s',
    text: ['Write −37 as an 8-bit one\'s complement number.'],
    hints: ['+37 in eight bits is 00100101.', 'One\'s complement negates by inverting every bit; nothing is added.', '00100101 → 11011010.'],
    solution: '11011010', wrong: ['11011011', '10100101', '1011010'],
  });
  ex({
    id: 'num-ex-ssm', chapter: 'num-signed', title: '−37 in signed magnitude', level: 2, kind: 'convert', op: 'signed', value: -37, bits: 8, rep: 'sm',
    text: ['Write −37 as an 8-bit signed-magnitude number.'],
    hints: ['The first bit is the sign: 1 for negative.', 'The other seven bits hold the size, 37 = 0100101.', '1 followed by 0100101: 10100101.'],
    solution: '10100101', wrong: ['11011011', '00100101', '1100101'],
  });
  ex({
    id: 'num-ex-v2', chapter: 'num-signed', title: 'Read a two\'s complement number', level: 2, kind: 'convert', op: 'signed-value', value: '10110110', rep: '2s',
    text: ['10110110 is an 8-bit two\'s complement number. What is its value in decimal?'],
    hints: ['The leftmost bit weighs −128 instead of +128.', 'The other bits, 0110110, are worth 32 + 16 + 4 + 2 = 54.', '−128 + 54 = −74.'],
    solution: '-74', wrong: ['182', '-54', '-73'],
  });
  ex({
    id: 'num-ex-v1', chapter: 'num-signed', title: 'Read a one\'s complement number', level: 2, kind: 'convert', op: 'signed-value', value: '11100101', rep: '1s',
    text: ['11100101 is an 8-bit one\'s complement number. What is its value in decimal?'],
    hints: ['The leading 1 says it is negative.', 'Invert every bit to get its size: 00011010.', '00011010 = 16 + 8 + 2 = 26, so the value is −26.'],
    solution: '-26', wrong: ['-27', '229', '-101'],
  });
  ex({
    id: 'num-ex-range', chapter: 'num-signed', title: 'The bottom of the range', level: 1, kind: 'number', answer: -32, higherLower: true,
    text: ['What is the most negative number a 6-bit two\'s complement register can hold?'],
    hints: ['n bits of two\'s complement hold −2ⁿ⁻¹ up to 2ⁿ⁻¹ − 1.', 'With n = 6, 2ⁿ⁻¹ = 32.', 'The range is −32 to +31; the bottom is −32, written 100000.'],
    solution: -32, wrong: [-31, -64, -63],
  });
  ex({
    id: 'num-ex-ovf-which', chapter: 'num-signed', title: 'Which sums overflow?', level: 2, kind: 'choice',
    options: ['90 + 60', '−90 + 60', '100 + 27', '64 + 64', '−64 + (−64)', '−128 + (−1)'], answer: [0, 3, 5],
    text: ['Each sum is computed in 8-bit two\'s complement (range −128 to +127). Choose every one that overflows.'],
    hints: ['Only operands of the same sign can overflow.', 'Work out the true sums: 150, −30, 127, 128, −128 and −129.', 'The ones outside −128 … 127 overflow: 90 + 60, 64 + 64 and −128 + (−1). 100 + 27 = 127 and −64 + (−64) = −128 just fit.'],
    solution: [0, 3, 5], wrong: [[0, 3], [0, 3, 4, 5], [0, 1, 3, 5]],
  });
  ex({
    id: 'num-ex-ovf-4bit', chapter: 'num-signed', title: 'Four bits, two negatives', level: 2, kind: 'choice',
    options: ['0101, and no overflow', '0101, and overflow', '10101, and no overflow', '1011, and overflow'], answer: 1,
    whyNot: { 0: 'Two negative operands gave a positive-looking result: that is exactly what overflow looks like.', 2: 'The register has four bits; the carry out of the sign bit is dropped.', 3: 'Add the bits column by column: 1011 + 1010 leaves 0101 in four bits.' },
    text: ['In 4-bit two\'s complement, add 1011 and 1010. What does the register hold, and is there overflow?'],
    hints: ['1011 is −5 and 1010 is −6; the true sum, −11, is below −8.', '1011 + 1010 = 10101; the carry out of the sign bit is dropped, leaving 0101.', 'The register holds 0101 (it would read +5), and the carries into and out of the sign bit (0 and 1) differ: overflow.'],
    solution: 1, wrong: [0, 2, 3],
  });

  // ===========================================================================================================
  // Chapter 3: codes and registers
  // ===========================================================================================================
  ex({
    id: 'num-ex-bcd', chapter: 'num-codes', title: 'A number in BCD', level: 1, kind: 'convert', op: 'code', value: 739, code: 'bcd',
    text: ['Write 739 in BCD (8421 code), one 4-bit group per digit.'],
    hints: ['BCD codes each decimal digit on its own, not the whole number.', '7 = 0111, 3 = 0011, 9 = 1001.', '0111 0011 1001.'],
    solution: '0111 0011 1001', wrong: ['1011100011', '0111 0011 1000', '1001 0011 0111'],
    why: 'In binary 739 would be 1011100011: ten bits, but no digit boundaries.',
  });
  ex({
    id: 'num-ex-xs3', chapter: 'num-codes', title: 'A number in excess-3', level: 2, kind: 'convert', op: 'code', value: 507, code: 'excess-3',
    text: ['Write 507 in excess-3 code.'],
    hints: ['Add 3 to each digit, then write the result in four bits.', '5 + 3 = 8 → 1000; 0 + 3 = 3 → 0011; 7 + 3 = 10 → 1010.', '1000 0011 1010.'],
    solution: '1000 0011 1010', wrong: ['0101 0000 0111', '1000 0011 1011', '1000 0000 1010'],
  });
  ex({
    id: 'num-ex-2421', chapter: 'num-codes', title: 'A number in 2421 code', level: 2, kind: 'convert', op: 'code', value: 86, code: '2421',
    text: ['Write 86 in the 2421 code, in which the digits 5 to 9 start with a 1.'],
    hints: ['The bits weigh 2, 4, 2, 1. For digits 5 to 9 the first bit (worth 2) is 1.', '8 = 2 + 4 + 2 → 1110. 6 = 2 + 4 → 1100.', '1110 1100.'],
    solution: '1110 1100', wrong: ['1000 0110', '0110 1100', '1110 0110'],
    why: 'Inverted, 1110 1100 becomes 0001 0011, which is 13 in 2421: 99 − 86. The code is self-complementing.',
  });
  ex({
    id: 'num-ex-bcd-add', chapter: 'num-codes', title: 'A BCD sum with two corrections', level: 2, kind: 'string', answer: '1000 0110 0101',
    text: ['Add 586 and 279 in BCD. Give the sum as three 4-bit BCD groups, for example 0001 0010 0011.'],
    hints: ['Units: 0110 + 1001 = 1111 (15), more than 9: add 0110 to get 1 0101, digit 5 and carry 1.', 'Tens: 1000 + 0111 + 1 = 1 0000 (16), carried out of the group: add 0110 to get 1 0110, digit 6 and carry 1.', 'Hundreds: 0101 + 0010 + 1 = 1000 (8), no correction. The sum is 865 = 1000 0110 0101.'],
    solution: '1000 0110 0101', wrong: ['1000 0101 1111', '1000 0110 0100', '1101100001'],
    whyNot: 'Check each digit sum: when it is over 9 (or carries out of its group), add 0110 and carry 1 into the next digit.',
  });
  ex({
    id: 'num-ex-gray', chapter: 'num-codes', title: 'Binary to Gray', level: 1, kind: 'convert', op: 'gray', value: '10110110', to: 'gray',
    text: ['Convert the binary number 10110110 to Gray code.'],
    hints: ['The first Gray bit is the first binary bit. Each later Gray bit is the XOR of a binary bit and the one to its left.', 'Pairs from the left: 1|0 → 1, 0|1 → 1, 1|1 → 0, 1|0 → 1, 0|1 → 1, 1|1 → 0, 1|0 → 1.', '1 then 1101101: 11101101.'],
    solution: '11101101', wrong: ['10110110', '11011011', '01101101'],
  });
  ex({
    id: 'num-ex-gray-back', chapter: 'num-codes', title: 'Gray back to binary', level: 2, kind: 'convert', op: 'gray', value: '11011', to: 'binary',
    text: ['The Gray code 11011 was read from a shaft encoder. What binary number is it?'],
    hints: ['Work from the left. The first binary bit is the first Gray bit.', 'Each binary bit is the XOR of the binary bit just found and the next Gray bit: 1 ⊕ 1 = 0, 0 ⊕ 0 = 0, 0 ⊕ 1 = 1, 1 ⊕ 1 = 0.', 'Binary 10010.'],
    solution: '10010', wrong: ['10110', '11011', '01101'],
    whyNot: 'XOR each Gray bit with the binary bit just found, not with the Gray bit before it.',
  });
  ex({
    id: 'num-ex-parity-k', chapter: 'num-codes', title: 'An even parity bit', level: 1, kind: 'choice', options: ['0', '1'], answer: 0,
    whyNot: { 1: 'Count the 1s in 1001011 again: there are four, already an even number.' },
    text: ['The ASCII code of "K" is 75 = 1001011. With even parity, what parity bit is sent with it?'],
    hints: ['Even parity makes the total number of 1s, parity bit included, even.', '1001011 has four 1s.', 'Four is already even, so the parity bit is 0 and 01001011 is sent.'],
    solution: 0, wrong: [1],
  });
  ex({
    id: 'num-ex-ascii-odd', chapter: 'num-codes', title: 'A character with odd parity', level: 2, kind: 'string', answer: '11110010',
    text: ['"r" is ASCII 114. Write the 8 bits sent for it with odd parity, the parity bit first.'],
    hints: ['114 = 64 + 32 + 16 + 2, so the 7-bit code is 1110010.', '1110010 has four 1s. Odd parity needs an odd total.', 'The parity bit is 1: 11110010.'],
    solution: '11110010', wrong: ['01110010', '1110010', '11110011'], whyNot: 'Find the 7-bit code of 114, count its 1s, and choose the parity bit that makes the total odd.',
  });
  ex({
    id: 'num-ex-ham-enc', chapter: 'num-codes', title: 'A 7-bit Hamming code word', level: 2, kind: 'convert', op: 'hamming-encode', value: '0110',
    text: ['Encode the data bits 0110 as a 7-bit Hamming code word with even parity, parity bits at positions 1, 2 and 4.'],
    hints: ['The data goes into positions 3, 5, 6, 7: 0, 1, 1, 0.', 'P1 covers 3, 5, 7 (0, 1, 0): P1 = 1. P2 covers 3, 6, 7 (0, 1, 0): P2 = 1. P4 covers 5, 6, 7 (1, 1, 0): P4 = 0.', 'Positions 1 to 7: 1 1 0 0 1 1 0, the code word 1100110.'],
    solution: '1100110', wrong: ['0110110', '1100111', '0010110'],
  });
  ex({
    id: 'num-ex-ham-enc8', chapter: 'num-codes', title: 'Twelve bits for a byte', level: 3, kind: 'convert', op: 'hamming-encode', value: '10011010',
    text: ['Encode the byte 10011010 as a 12-bit Hamming code word with even parity, parity bits at positions 1, 2, 4 and 8.'],
    hints: ['The data fills positions 3, 5, 6, 7, 9, 10, 11, 12 in order: 1, 0, 0, 1, 1, 0, 1, 0.', 'P1 covers 3, 5, 7, 9, 11 (1, 0, 1, 1, 1): P1 = 0. P2 covers 3, 6, 7, 10, 11 (1, 0, 1, 0, 1): P2 = 1.', 'P4 covers 5, 6, 7, 12 (0, 0, 1, 0): P4 = 1. P8 covers 9–12 (1, 0, 1, 0): P8 = 0. The word is 011100101010.'],
    solution: '011100101010', wrong: ['011100111010', '001100101010', '10011010'],
  });
  ex({
    id: 'num-ex-ham-pos', chapter: 'num-codes', title: 'Find the flipped bit', level: 2, kind: 'convert', op: 'hamming-decode', value: '1100010', ask: 'position',
    text: ['The 7-bit Hamming code word 1100010 (even parity, parity bits at 1, 2, 4) arrived with one bit flipped. At which position?'],
    hints: ['Redo the three checks: P1 over 1, 3, 5, 7; P2 over 2, 3, 6, 7; P4 over 4, 5, 6, 7.', 'Check 1 sees 1000 (odd: fails), check 2 sees 1010 (even: passes), check 4 sees 0010 (odd: fails).', 'The failing checks weigh 1 and 4: the syndrome is 101 = 5, so position 5 is wrong.'],
    solution: '5', wrong: ['2', '6', '0'],
  });
  ex({
    id: 'num-ex-ham-syn', chapter: 'num-codes', title: 'The syndrome', level: 2, kind: 'convert', op: 'hamming-decode', value: '0011000', ask: 'syndrome',
    text: ['Compute the syndrome of the received 7-bit Hamming word 0011000 (even parity, parity bits at 1, 2, 4). Give it in decimal.'],
    hints: ['Positions 1 to 7 hold 0 0 1 1 0 0 0.', 'Check 1 (1, 3, 5, 7): 0100, odd. Check 2 (2, 3, 6, 7): 0100, odd. Check 4 (4, 5, 6, 7): 1000, odd.', 'All three fail: 1 + 2 + 4 = 7. The last bit is the wrong one.'],
    solution: '7', wrong: ['3', '0', '4'],
  });
  ex({
    id: 'num-ex-ham-data', chapter: 'num-codes', title: 'Recover the data', level: 3, kind: 'convert', op: 'hamming-decode', value: '0001001', ask: 'data',
    text: ['The 7-bit Hamming word 0001001 (even parity, parity bits at 1, 2, 4) has at most one error. Correct it and give the four data bits.'],
    hints: ['Check 1 sees 0001 (fails), check 2 sees 0001 (fails), check 4 sees 1001 (passes).', 'The syndrome is 1 + 2 = 3: position 3 is wrong. Corrected, the word is 0011001.', 'The data bits are at positions 3, 5, 6, 7: 1001.'],
    solution: '1001', wrong: ['0001', '0101', '1000'],
  });
  ex({
    id: 'num-ex-ham-secded', chapter: 'num-codes', title: 'A SEC-DED code word', level: 3, kind: 'convert', op: 'hamming-encode', value: '1101', secded: true,
    text: ['Encode the data bits 1101 in a SEC-DED Hamming code: the 7-bit code word with parity bits at 1, 2, 4, preceded by an overall parity bit P0 that makes all eight bits even.'],
    hints: ['Data in positions 3, 5, 6, 7: 1, 1, 0, 1. P1 covers 1, 1, 1: P1 = 1. P2 covers 1, 0, 1: P2 = 0. P4 covers 1, 0, 1: P4 = 0.', 'The 7-bit word is 1010101, with four 1s.', 'P0 = 0 keeps the total even: 01010101.'],
    solution: '01010101', wrong: ['1010101', '11010101', '01011101'],
  });
  ex({
    id: 'num-ex-ham-sd-pos', chapter: 'num-codes', title: 'SEC-DED: one error', level: 3, kind: 'convert', op: 'hamming-decode', value: '01010111', secded: true, ask: 'position',
    text: ['A SEC-DED word arrives as 01010111: P0 first, then positions 1 to 7. Is there a single error, and where? (Answer 0 if there is none to correct.)'],
    hints: ['Drop P0 and check positions 1 to 7, 1010111: check 1 sees 1111 (passes), check 2 sees 0111 (fails), check 4 sees 0111 (fails).', 'The syndrome is 2 + 4 = 6. The overall parity of all eight bits is odd.', 'A non-zero syndrome with odd overall parity means one error, at position 6.'],
    solution: '6', wrong: ['0', '7', '2'],
  });
  ex({
    id: 'num-ex-ham-double', chapter: 'num-codes', title: 'SEC-DED: one error or two?', level: 3, kind: 'choice',
    options: ['No error', 'One error, at position 4: flip it', 'Two errors: detected, not correctable', 'Only P0 is wrong'], answer: 2,
    whyNot: { 1: 'The syndrome is 4, but the overall parity is even. A single error always makes the overall parity odd.', 0: 'The syndrome is not 0.', 3: 'If only P0 were wrong, the syndrome would be 0.' },
    text: ['A SEC-DED word arrives as 01110111: P0 first, then positions 1 to 7. What should the receiver conclude?'],
    hints: ['Check positions 1 to 7, 1110111: check 1 sees 1111 (passes), check 2 sees 1111 (passes), check 4 sees 0111 (fails). Syndrome 4.', 'The overall parity of all eight bits, 01110111, is even.', 'A non-zero syndrome with even overall parity: two bits are wrong (here positions 2 and 6). It is detected, but correcting position 4 would make things worse.'],
    solution: 2, wrong: [1, 0],
  });
  ex({
    id: 'num-ex-shift-clocks', chapter: 'num-codes', title: 'A serial transfer', level: 1, kind: 'number', answer: 16, higherLower: true,
    text: ['A 16-bit register is copied into another one serially, over a single wire, one bit per clock. How many clock edges does the transfer take?'],
    hints: ['Each clock moves one bit across the wire.', 'Every one of the 16 bits has to cross.', '16 clocks. A parallel transfer would take one clock, but 16 wires.'],
    solution: 16, wrong: [1, 8, 15],
  });
  ex({
    id: 'num-ex-shl-value', chapter: 'num-codes', title: 'Three shifts left', level: 2, kind: 'number', answer: 40, higherLower: true,
    text: ['An 8-bit register holds 00000101. It is shifted left three times, with a 0 entering on the right each time. What unsigned value does it hold then?'],
    hints: ['Each shift left doubles an unsigned value, as long as no 1 falls off the left end.', '5 → 10 → 20 → 40.', 'The register holds 00101000 = 40.'],
    solution: 40, wrong: [15, 8, 160],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
