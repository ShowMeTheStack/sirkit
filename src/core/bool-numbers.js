// Number systems and codes: base conversion of integers and fractions (repeated division and multiplication,
// or bit grouping between power-of-two bases), r's and (r-1)'s complements, signed magnitude, one's and two's
// complement with overflow, BCD, excess-3, 2421, Gray code both ways, ASCII, parity, and Hamming SEC and SEC-DED
// codes with the syndrome. Every operation returns a trace of steps like the rest of Sirkit.Bool.
// Values are exact: integers are BigInt and fractions are kept as numerator/denominator.
(function (S) {
  'use strict';
  const B = S.Bool = S.Bool || {};
  const Num = B.Numbers = {};
  const DIG = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const big = (x) => BigInt(x);
  const digit = (d) => DIG[Number(d)];
  const gcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };
  const sub = (n) => String(n).split('').map((c) => '₀₁₂₃₄₅₆₇₈₉'[+c]).join('');

  /** read "-1A.4" in a base: {neg, int (BigInt), num, den (BigInt fraction num/den, den a power of the base)} */
  function read(text, base) {
    if (!(base >= 2 && base <= 36)) throw new Error('the base must be from 2 to 36');
    let t = String(text).trim().toUpperCase().replace(/_/g, '');
    let neg = false;
    if (t.startsWith('-')) { neg = true; t = t.slice(1); }
    if (!t.length || t === '.') throw new Error('no digits');
    const [ip, fp = ''] = t.split('.');
    if (t.split('.').length > 2) throw new Error('more than one point in ' + text);
    let int = 0n, num = 0n, den = 1n;
    for (const [i, ch] of [...(ip || '0')].entries()) { const v = DIG.indexOf(ch); if (v < 0 || v >= base) throw new Error('"' + ch + '" at position ' + (i + 1) + ' is not a digit in base ' + base); int = int * big(base) + big(v); }
    for (const [i, ch] of [...fp].entries()) { const v = DIG.indexOf(ch); if (v < 0 || v >= base) throw new Error('"' + ch + '" at position ' + (ip.length + 2 + i) + ' is not a digit in base ' + base); num = num * big(base) + big(v); den *= big(base); }
    return { neg, int, num, den, ip: ip || '0', fp };
  }
  Num.read = read;
  /** an integer (BigInt or number) written in a base */
  const write = (n, base) => { n = big(n); if (n === 0n) return '0'; let s = '', neg = n < 0n; if (neg) n = -n; while (n) { s = DIG[Number(n % big(base))] + s; n /= big(base); } return (neg ? '-' : '') + s; };
  Num.write = write;
  const isPow2 = (b) => (b & (b - 1)) === 0;

  /**
   * convert(text, from, to, {fracDigits, method}) -> {result, exact, repeating, trace}
   * method 'auto' groups bits between power-of-two bases, else goes through the value: positional expansion,
   * repeated division for the integer part, repeated multiplication for the fraction.
   */
  Num.convert = (text, from, to, opts) => {
    opts = opts || {};
    const fracDigits = opts.fracDigits == null ? 8 : opts.fracDigits;
    const v = read(text, from), trace = [];
    const sign = v.neg ? '-' : '';
    if ((opts.method || 'auto') === 'auto' && from !== to && isPow2(from) && isPow2(to)) {
      const kf = Math.log2(from), kt = Math.log2(to);
      const ib = [...v.ip].map((c) => DIG.indexOf(c).toString(2).padStart(kf, '0')), fb = [...v.fp].map((c) => DIG.indexOf(c).toString(2).padStart(kf, '0'));
      if (from !== 2) trace.push({ kind: 'expand-bits', groups: ib.concat(fb), say: 'Write each base-' + from + ' digit as ' + kf + ' bits: ' + ib.join(' ') + (fb.length ? ' . ' + fb.join(' ') : '') + '.' });
      let ibits = ib.join('').replace(/^0+(?=.)/, ''), fbits = fb.join('').replace(/0+$/, '');
      if (to === 2) {
        const result = sign + ibits + (fbits ? '.' + fbits : '');
        trace.push({ kind: 'result', say: '(' + text + ')' + sub(from) + ' = (' + result + ')' + sub(to) + '.' });
        return { result, exact: true, repeating: null, trace };
      }
      const ipad = ibits.padStart(Math.ceil(ibits.length / kt) * kt, '0'), fpad = fbits.padEnd(Math.ceil(fbits.length / kt) * kt, '0');
      const ig = ipad.match(new RegExp('.{' + kt + '}', 'g')) || ['0'], fg = fpad ? fpad.match(new RegExp('.{' + kt + '}', 'g')) : [];
      trace.push({ kind: 'group', groups: ig.concat(fg), say: 'Group the bits in ' + kt + 's outward from the point (padding with 0s at the ends): ' + ig.join(' ') + (fg.length ? ' . ' + fg.join(' ') : '') + '.' });
      const out = ig.map((g) => DIG[parseInt(g, 2)]).join('').replace(/^0+(?=.)/, '') + (fg.length ? '.' + fg.map((g) => DIG[parseInt(g, 2)]).join('') : '');
      trace.push({ kind: 'group-digits', say: 'Each group of ' + kt + ' bits is one base-' + to + ' digit: ' + sign + out + '.' });
      const result = sign + out;
      trace.push({ kind: 'result', say: '(' + text + ')' + sub(from) + ' = (' + result + ')' + sub(to) + '.' });
      return { result, exact: true, repeating: null, trace };
    }
    // through the value
    if (from !== 10) {
      const terms = [];
      [...v.ip].forEach((c, i) => terms.push(DIG.indexOf(c) + '×' + from + '^' + (v.ip.length - 1 - i)));
      [...v.fp].forEach((c, i) => terms.push(DIG.indexOf(c) + '×' + from + '^-' + (i + 1)));
      const g = gcd(v.num, v.den);
      trace.push({ kind: 'positional', terms, say: 'Weigh each digit by its place: ' + terms.join(' + ') + ' = ' + v.int.toString() + (v.num ? ' + ' + (v.num / g) + '/' + (v.den / g) : '') + ' in decimal.' });
    }
    // integer part by repeated division
    let q = v.int;
    const idigits = [];
    if (q === 0n) idigits.push('0');
    while (q > 0n) {
      const r = q % big(to), nq = q / big(to);
      trace.push({ kind: 'divide', n: q.toString(), q: nq.toString(), r: Number(r), digit: digit(r), say: q + ' ÷ ' + to + ' = ' + nq + ' remainder ' + r + (to > 10 && r > 9n ? ' (digit ' + digit(r) + ')' : '') + '.' });
      idigits.unshift(digit(r));
      q = nq;
    }
    if (v.int > 0n) trace.push({ kind: 'divide-read', say: 'Read the remainders from the last to the first: ' + idigits.join('') + '.' });
    // fraction by repeated multiplication
    let num = v.num, den = v.den;
    const g0 = gcd(num, den) || 1n; num /= g0; den /= g0;
    const fdigits = [], seen = new Map();
    let repeating = null, exact = true;
    while (num !== 0n) {
      if (seen.has(num.toString())) { repeating = { from: seen.get(num.toString()), digits: fdigits.slice(seen.get(num.toString())).join('') }; break; }
      if (fdigits.length >= fracDigits) { exact = false; break; }
      seen.set(num.toString(), fdigits.length);
      const prod = num * big(to), d = prod / den, rest = prod % den;
      trace.push({ kind: 'multiply', frac: num + '/' + den, product: prod + '/' + den, digit: digit(d), say: num + '/' + den + ' × ' + to + ' = ' + d + (rest ? ' + ' + rest + '/' + den : '') + '; the whole part ' + digit(d) + ' is the next digit.' });
      fdigits.push(digit(d));
      num = rest;
    }
    if (repeating) { exact = false; trace.push({ kind: 'repeat', say: 'The fraction ' + num + '/' + den + ' has come round again, so the digits ' + repeating.digits + ' repeat for ever.' }); }
    else if (!exact) trace.push({ kind: 'truncate', say: 'The fraction has not ended after ' + fracDigits + ' digits; stop there (the result is rounded down).' });
    const result = sign + idigits.join('') + (fdigits.length ? '.' + fdigits.join('') : '');
    trace.push({ kind: 'result', say: '(' + text + ')' + sub(from) + ' = (' + result + (repeating ? '…' : '') + ')' + sub(to) + '.' });
    return { result, exact, repeating, trace };
  };

  // ---- complements ------------------------------------------------------------------------------------------------
  /**
   * complement(text, base, kind) with kind 'r' (radix complement) or 'r-1' (diminished radix complement), for a
   * number of n digits (opts.digits pads it). Traced. -> {result, trace}
   */
  Num.complement = (text, base, kind, opts) => {
    opts = opts || {};
    const v = read(text, base);
    if (v.neg) throw new Error('complement a magnitude, without a sign');
    const n = Math.max(opts.digits || 0, v.ip.length), ip = v.ip.padStart(n, '0'), fp = v.fp;
    const all = ip + fp, trace = [];
    const dim = [...all].map((c) => DIG[base - 1 - DIG.indexOf(c)]).join('');
    trace.push({ kind: 'diminished', say: 'Subtract each digit from ' + DIG[base - 1] + ' (the largest digit): ' + all + ' → ' + dim + ' — the ' + (base - 1) + "'s complement." });
    let out = dim;
    if (kind === 'r') {
      // add one unit in the last place
      const ds = [...dim].map((c) => DIG.indexOf(c));
      let carry = 1;
      for (let i = ds.length - 1; i >= 0 && carry; i--) { const t = ds[i] + carry; ds[i] = t % base; carry = t >= base ? 1 : 0; }
      out = ds.map((d) => DIG[d]).join('');
      trace.push({ kind: 'add-one', say: 'Add 1 in the last place: ' + dim + ' + 1 = ' + out + (carry ? ' (the carry out of the top digit is dropped)' : '') + ' — the ' + base + "'s complement." });
    }
    const fmt = (s) => (fp.length ? s.slice(0, n) + '.' + s.slice(n) : s);
    const result = fmt(out);
    trace.push({ kind: 'result', say: 'The ' + (kind === 'r' ? base : base - 1) + "'s complement of " + fmt(all) + ' is ' + result + '.' });
    return { result, trace };
  };
  /** M - N by adding the r's complement of N (both n digits, unsigned), traced */
  Num.subtract = (m, nText, base) => {
    const a = read(m, base), b = read(nText, base);
    const n = Math.max(a.ip.length, b.ip.length);
    const comp = Num.complement(b.ip, base, 'r', { digits: n });
    const trace = comp.trace.slice(0, -1);
    const mod = big(base) ** big(n), sum = a.int + mod - b.int; // N = 0 has complement r^n, which carries
    const carry = sum >= mod;
    let result;
    if (carry) {
      result = write(sum - mod, base).padStart(n, '0');
      trace.push({ kind: 'add', say: a.ip.padStart(n, '0') + ' + ' + comp.result + ' = ' + write(sum, base) + '; there is an end carry, so drop it: M − N = ' + result + '.' });
    } else {
      const back = Num.complement(write(sum, base).padStart(n, '0'), base, 'r', { digits: n }).result;
      result = '-' + back.replace(/^0+(?=.)/, '');
      trace.push({ kind: 'add', say: a.ip.padStart(n, '0') + ' + ' + comp.result + ' = ' + write(sum, base).padStart(n, '0') + ' with no end carry, so the answer is negative: take the ' + base + "'s complement, " + back + ', and put a minus sign: ' + result + '.' });
    }
    return { result, trace };
  };

  // ---- signed numbers ----------------------------------------------------------------------------------------------------
  const REP = { sm: 'signed magnitude', '1s': "one's complement", '2s': "two's complement" };
  /** the range of an n-bit representation */
  Num.range = (bits, rep) => (rep === '2s' ? { min: -(2 ** (bits - 1)), max: 2 ** (bits - 1) - 1 } : { min: -(2 ** (bits - 1) - 1), max: 2 ** (bits - 1) - 1 });
  /** encode an integer in n bits: {bits, ok, trace} */
  Num.encode = (value, n, rep) => {
    rep = rep || '2s';
    const r = Num.range(n, rep), trace = [];
    if (value < r.min || value > r.max) return { bits: null, ok: false, trace: [{ kind: 'range', say: value + ' does not fit: ' + n + '-bit ' + REP[rep] + ' holds ' + r.min + ' to ' + r.max + '.' }] };
    const mag = Math.abs(value).toString(2).padStart(n - 1, '0');
    let bits;
    if (value >= 0 && !(rep === 'sm' && Object.is(value, -0))) {
      bits = '0' + mag;
      trace.push({ kind: 'positive', say: value + ' is not negative: sign bit 0, then the magnitude ' + mag + ': ' + bits + '.' });
    } else if (rep === 'sm') {
      bits = '1' + mag;
      trace.push({ kind: 'sm', say: 'Sign bit 1 for negative, then the magnitude ' + mag + ': ' + bits + '.' });
    } else {
      const pos = '0' + mag, inv = [...pos].map((b) => (b === '0' ? '1' : '0')).join('');
      trace.push({ kind: 'invert', say: '+' + Math.abs(value) + ' is ' + pos + '; invert every bit: ' + inv + (rep === '1s' ? '.' : '') });
      bits = inv;
      if (rep === '2s') {
        bits = ((parseInt(inv, 2) + 1) % 2 ** n).toString(2).padStart(n, '0');
        trace.push({ kind: 'add-one', say: 'Add 1: ' + inv + ' + 1 = ' + bits + '.' });
      }
    }
    trace.push({ kind: 'result', say: value + ' in ' + n + '-bit ' + REP[rep] + ' is ' + bits + '.' });
    return { bits, ok: true, trace };
  };
  /** decode an n-bit pattern: {value, trace} (one's complement and signed magnitude have a -0, reported as negativeZero) */
  Num.decode = (bits, rep) => {
    rep = rep || '2s';
    const n = bits.length, trace = [], u = parseInt(bits, 2);
    let value, negativeZero = false;
    if (bits[0] === '0') { value = u; trace.push({ kind: 'positive', say: 'Sign bit 0: the value is +' + value + '.' }); }
    else if (rep === 'sm') { value = -parseInt(bits.slice(1) || '0', 2); negativeZero = value === 0; trace.push({ kind: 'sm', say: 'Sign bit 1: the magnitude ' + bits.slice(1) + ' is ' + -value + ', so the value is ' + (negativeZero ? '−0' : value) + '.' }); }
    else if (rep === '1s') { const inv = [...bits].map((b) => (b === '0' ? '1' : '0')).join(''); value = -parseInt(inv, 2); negativeZero = value === 0; trace.push({ kind: 'invert', say: 'Sign bit 1: invert every bit to get the magnitude, ' + inv + ' = ' + -value + ', so the value is ' + (negativeZero ? '−0' : value) + '.' }); }
    else { value = u - 2 ** n; trace.push({ kind: 'weight', say: 'The sign bit weighs −' + 2 ** (n - 1) + ': ' + bits + ' = −' + 2 ** (n - 1) + ' + ' + (u - 2 ** (n - 1)) + ' = ' + value + '.' }); }
    return { value: negativeZero ? -0 : value, negativeZero, trace };
  };
  /**
   * add two n-bit patterns in a representation, column by column. -> {bits, carryOut, overflow, value, trace}
   * two's complement: the end carry is dropped; overflow when the carry into the sign bit differs from the carry out.
   * one's complement: the end carry is added back in (end-around carry).
   * signed magnitude: magnitudes are added or subtracted by the signs.
   */
  Num.add = (a, b, rep) => {
    rep = rep || '2s';
    const n = a.length;
    if (b.length !== n) throw new Error('both numbers need the same number of bits');
    const trace = [];
    const adder = (x, y, cin) => {
      let c = cin, out = '', carries = [];
      for (let i = n - 1; i >= 0; i--) { const t = +x[i] + +y[i] + c; out = (t & 1) + out; carries.unshift(c); c = t >> 1; }
      return { out, carry: c, carries };
    };
    if (rep === 'sm') {
      const sa = a[0], sb = b[0], ma = parseInt(a.slice(1), 2), mb = parseInt(b.slice(1), 2);
      let sign, mag;
      if (sa === sb) { sign = sa; mag = ma + mb; trace.push({ kind: 'sm-same', say: 'Same signs: add the magnitudes, ' + ma + ' + ' + mb + ' = ' + mag + ', and keep the sign.' }); }
      else { const big1 = ma >= mb; sign = big1 ? sa : sb; mag = Math.abs(ma - mb); trace.push({ kind: 'sm-diff', say: 'Different signs: subtract the smaller magnitude from the larger, ' + Math.max(ma, mb) + ' − ' + Math.min(ma, mb) + ' = ' + mag + ', and take the sign of the larger.' }); }
      const overflow = mag > 2 ** (n - 1) - 1;
      const bits = overflow ? null : sign + mag.toString(2).padStart(n - 1, '0');
      trace.push({ kind: 'result', say: overflow ? 'Overflow: the magnitude ' + mag + ' needs more than ' + (n - 1) + ' bits.' : 'Sum: ' + bits + '.' });
      return { bits, carryOut: 0, overflow, value: overflow ? null : (sign === '1' ? -mag : mag), trace };
    }
    const r = adder(a, b, 0);
    trace.push({ kind: 'columns', carries: r.carries, say: '  ' + a + '\n+ ' + b + '\n= ' + r.out + ' with carry out ' + r.carry + ' (carries ' + r.carries.join('') + ').' });
    let bits = r.out, overflow;
    if (rep === '1s') {
      if (r.carry) { const r2 = adder(bits, '1'.padStart(n, '0'), 0); trace.push({ kind: 'end-around', say: 'The end carry goes back into the lowest bit: ' + bits + ' + 1 = ' + r2.out + '.' }); bits = r2.out; }
      overflow = a[0] === b[0] && bits[0] !== a[0];
    } else {
      const cin = r.carries[0];
      overflow = cin !== r.carry;
      if (r.carry) trace.push({ kind: 'drop', say: 'The end carry is dropped.' });
      trace.push({ kind: 'overflow-check', say: 'The carry into the sign bit is ' + cin + ' and the carry out is ' + r.carry + ': ' + (overflow ? 'they differ, so the result overflowed.' : 'they match, so there is no overflow.') });
    }
    if (rep === '1s') trace.push({ kind: 'overflow-check', say: overflow ? 'Two numbers of the same sign gave a result of the other sign: overflow.' : 'No overflow.' });
    const value = overflow ? null : Num.decode(bits, rep).value;
    trace.push({ kind: 'result', say: overflow ? 'Overflow: the true sum does not fit in ' + n + ' bits.' : 'Sum: ' + bits + ' = ' + value + '.' });
    return { bits, carryOut: r.carry, overflow, value, trace };
  };
  /** a - b: complement b and add (two's or one's complement) */
  Num.sub = (a, b, rep) => {
    rep = rep || '2s';
    const n = b.length;
    const negb = Num.encode(-Num.decode(b, rep).value, n, rep);
    if (!negb.ok) {
      // -min does not fit: the subtraction overflows exactly when a is not negative
      const trace = [{ kind: 'negate', say: 'Negating ' + b + ' does not fit in ' + n + ' bits.' }];
      const r = Num.add(a, ((parseInt(b, 2) ^ (2 ** n - 1)) + (rep === '2s' ? 1 : 0)).toString(2).slice(-n).padStart(n, '0'), rep);
      const va = Num.decode(a, rep).value, vb = Num.decode(b, rep).value, true_ = va - vb, rg = Num.range(n, rep);
      return { bits: r.bits, overflow: true_ < rg.min || true_ > rg.max, value: true_ < rg.min || true_ > rg.max ? null : true_, trace: trace.concat(r.trace) };
    }
    const r = Num.add(a, negb.bits, rep);
    return Object.assign(r, { trace: [{ kind: 'negate', say: 'To subtract ' + b + ', add its negation ' + negb.bits + '.' }].concat(r.trace) });
  };

  // ---- decimal codes ---------------------------------------------------------------------------------------------------------
  const CODES = {
    '8421': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => d.toString(2).padStart(4, '0')),
    'excess-3': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (d + 3).toString(2).padStart(4, '0')),
    '2421': ['0000', '0001', '0010', '0011', '0100', '1011', '1100', '1101', '1110', '1111'],
  };
  CODES.bcd = CODES['8421'];
  Num.codes = Object.fromEntries(Object.entries(CODES).map(([k, v]) => [k, v.slice()]));
  /** a decimal number in a code: {bits:[per digit], text, trace} */
  Num.encodeDecimal = (n, code) => {
    code = code || 'bcd';
    const tbl = CODES[code]; if (!tbl) throw new Error('unknown code ' + code);
    const ds = String(n).split('');
    if (ds.some((d) => !/[0-9]/.test(d))) throw new Error(n + ' is not a whole decimal number');
    const bits = ds.map((d) => tbl[+d]);
    return { bits, text: bits.join(' '), trace: ds.map((d, i) => ({ kind: 'digit', say: d + ' → ' + bits[i] + (code === 'excess-3' ? ' (' + d + ' + 3 = ' + (+d + 3) + ')' : '') + '.' })) };
  };
  /** read groups of 4 bits in a code; an unused pattern is an error */
  Num.decodeDecimal = (text, code) => {
    code = code || 'bcd';
    const tbl = CODES[code], groups = String(text).replace(/\s+/g, '').match(/.{1,4}/g) || [];
    const out = [];
    for (const g of groups) { const d = tbl.indexOf(g.padStart(4, '0')); if (d < 0) return { ok: false, bad: g, say: g + ' is not a valid ' + code + ' digit.' }; out.push(d); }
    return { ok: true, value: out.join(''), say: groups.join(' ') + ' reads as ' + out.join('') + '.' };
  };
  /** BCD addition of two decimal numbers digit by digit, with the +6 correction, traced */
  Num.bcdAdd = (a, b) => {
    const A = String(a).split('').reverse(), Bd = String(b).split('').reverse(), n = Math.max(A.length, Bd.length), trace = [];
    let carry = 0, out = [];
    for (let i = 0; i < n; i++) {
      const x = +(A[i] || 0), y = +(Bd[i] || 0), raw = x + y + carry;
      const rawBits = raw.toString(2).padStart(5, '0');
      if (raw > 9) {
        const fixed = raw + 6;
        trace.push({ kind: 'bcd-fix', say: x.toString(2).padStart(4, '0') + ' + ' + y.toString(2).padStart(4, '0') + (carry ? ' + 1' : '') + ' = ' + rawBits + ' (' + raw + '), more than 9: add 0110 to get ' + fixed.toString(2).padStart(5, '0') + ', digit ' + (fixed & 15) + ' and carry 1.' });
        out.unshift(fixed & 15); carry = 1;
      } else {
        trace.push({ kind: 'bcd-ok', say: x.toString(2).padStart(4, '0') + ' + ' + y.toString(2).padStart(4, '0') + (carry ? ' + 1' : '') + ' = ' + raw.toString(2).padStart(4, '0') + ' (' + raw + '), a valid digit.' });
        out.unshift(raw); carry = 0;
      }
    }
    if (carry) out.unshift(1);
    const value = out.join('');
    trace.push({ kind: 'result', say: a + ' + ' + b + ' = ' + value + ' = ' + out.map((d) => d.toString(2).padStart(4, '0')).join(' ') + ' in BCD.' });
    return { value, bits: out.map((d) => d.toString(2).padStart(4, '0')), trace };
  };

  // ---- Gray code ------------------------------------------------------------------------------------------------------------
  Num.toGray = (bin) => {
    const b = String(bin), trace = [{ kind: 'gray-first', say: 'The first Gray bit is the first binary bit: ' + b[0] + '.' }];
    let g = b[0];
    for (let i = 1; i < b.length; i++) { const x = +b[i - 1] ^ +b[i]; g += x; trace.push({ kind: 'gray-bit', say: 'g' + i + ' = b' + (i - 1) + ' ⊕ b' + i + ' = ' + b[i - 1] + ' ⊕ ' + b[i] + ' = ' + x + '.' }); }
    trace.push({ kind: 'result', say: 'Binary ' + b + ' is Gray ' + g + '.' });
    return { gray: g, trace };
  };
  Num.fromGray = (gray) => {
    const g = String(gray), trace = [{ kind: 'gray-first', say: 'The first binary bit is the first Gray bit: ' + g[0] + '.' }];
    let b = g[0];
    for (let i = 1; i < g.length; i++) { const x = +b[i - 1] ^ +g[i]; b += x; trace.push({ kind: 'gray-bit', say: 'b' + i + ' = b' + (i - 1) + ' ⊕ g' + i + ' = ' + b[i - 1] + ' ⊕ ' + g[i] + ' = ' + x + '.' }); }
    trace.push({ kind: 'result', say: 'Gray ' + g + ' is binary ' + b + '.' });
    return { binary: b, trace };
  };
  /** the n-bit reflected Gray code sequence */
  Num.graySequence = (n) => B.grayCodes(n).map((x) => x.toString(2).padStart(n, '0'));

  // ---- ASCII and parity ---------------------------------------------------------------------------------------------------------
  Num.ascii = (ch, parity) => {
    const code = ch.charCodeAt(0);
    if (code > 127) throw new Error('"' + ch + '" is not an ASCII character');
    const bits7 = code.toString(2).padStart(7, '0');
    const out = { char: ch, code, hex: code.toString(16).toUpperCase().padStart(2, '0'), bits7 };
    if (parity) { const p = B.parityBit(bits7, parity); out.bits8 = p.bit + bits7; out.say = '"' + ch + '" is ' + code + ' = ' + bits7 + '; ' + p.say.replace(bits7 + p.bit, out.bits8).replace('is sent', 'is sent with the parity bit in front'); }
    else out.say = '"' + ch + '" is ' + code + ' (hex ' + out.hex + ') = ' + bits7 + '.';
    return out;
  };
  Num.fromAscii = (bits) => { const b = String(bits).replace(/\s+/g, ''); const code = parseInt(b.slice(-7), 2); return { char: String.fromCharCode(code), code }; };

  // ---- Hamming codes -------------------------------------------------------------------------------------------------------------
  // Positions are numbered from 1; parity bits sit at the powers of two and check every position whose number has
  // that bit set (even parity). SEC-DED adds an overall parity bit at position 0, written first.
  const parityCount = (m) => { let r = 0; while ((1 << r) < m + r + 1) r++; return r; };
  Num.hamming = {
    /** encode(dataBits, {secded}) -> {code, n, r, layout:[{pos, kind:'p'|'d'|'p0', bit}], trace} */
    encode(data, opts) {
      opts = opts || {};
      const d = String(data).replace(/\s+/g, '').split('').map(Number), m = d.length, r = parityCount(m), n = m + r;
      const word = new Array(n + 1).fill(0), kind = new Array(n + 1).fill('d');
      let k = 0;
      for (let p = 1; p <= n; p++) { if ((p & (p - 1)) === 0) kind[p] = 'p'; else word[p] = d[k++]; }
      const trace = [{ kind: 'ham-layout', say: m + ' data bits need ' + r + ' parity bits (2^' + r + ' ≥ ' + m + ' + ' + r + ' + 1), at positions ' + [...Array(r).keys()].map((i) => 1 << i).join(', ') + '; the data fills the other positions of 1 to ' + n + '.' }];
      for (let i = 0; i < r; i++) {
        const p = 1 << i, cover = [];
        for (let q = 1; q <= n; q++) if (q & p && q !== p) cover.push(q);
        const v = cover.reduce((acc, q) => acc ^ word[q], 0);
        word[p] = v;
        trace.push({ kind: 'ham-parity', pos: p, covers: cover, bit: v, say: 'P' + p + ' checks positions ' + [p].concat(cover).join(', ') + ': the data bits there are ' + cover.map((q) => word[q]).join('') + ', so P' + p + ' = ' + v + ' for even parity.' });
      }
      let code = word.slice(1).join('');
      const layout = word.slice(1).map((bit, i) => ({ pos: i + 1, kind: kind[i + 1], bit }));
      if (opts.secded) {
        const p0 = word.slice(1).reduce((a, b) => a ^ b, 0);
        code = p0 + code;
        layout.unshift({ pos: 0, kind: 'p0', bit: p0 });
        trace.push({ kind: 'ham-overall', bit: p0, say: 'For double-error detection, P0 makes the whole word even: P0 = ' + p0 + '.' });
      }
      trace.push({ kind: 'result', say: 'Code word: ' + code + '.' });
      return { code, n, r, m, layout, trace };
    },
    /** decode(code, {secded, m}) -> {status:'ok'|'corrected'|'double'|'p0'|'detected', syndrome, position, corrected, data, trace} */
    decode(code, opts) {
      opts = opts || {};
      const c = String(code).replace(/\s+/g, '').split('').map(Number);
      const p0 = opts.secded ? c.shift() : null;
      const n = c.length, word = [0].concat(c), trace = [];
      let syndrome = 0;
      for (let p = 1; p <= n; p <<= 1) {
        const cover = []; for (let q = 1; q <= n; q++) if (q & p) cover.push(q);
        const v = cover.reduce((acc, q) => acc ^ word[q], 0);
        if (v) syndrome |= p;
        trace.push({ kind: 'ham-check', pos: p, bit: v, say: 'Check ' + p + ' over positions ' + cover.join(', ') + ': ' + cover.map((q) => word[q]).join('') + ' has ' + (v ? 'odd' : 'even') + ' parity, so syndrome bit ' + p + ' is ' + v + '.' });
      }
      let status, position = null;
      const fixed = word.slice();
      const overall = opts.secded ? (p0 ^ c.reduce((a, b) => a ^ b, 0)) : null;
      if (opts.secded) trace.push({ kind: 'ham-overall', bit: overall, say: 'The overall parity over all ' + (n + 1) + ' bits is ' + (overall ? 'odd' : 'even') + '.' });
      if (!opts.secded) {
        if (!syndrome) status = 'ok';
        else if (syndrome <= n) { status = 'corrected'; position = syndrome; fixed[syndrome] ^= 1; }
        else status = 'detected';
      } else {
        if (!syndrome && !overall) status = 'ok';
        else if (syndrome && overall) { if (syndrome <= n) { status = 'corrected'; position = syndrome; fixed[syndrome] ^= 1; } else status = 'detected'; }
        else if (!syndrome && overall) { status = 'p0'; position = 0; }
        else status = 'double';
      }
      const say = {
        ok: 'The syndrome is 0' + (opts.secded ? ' and the overall parity is even' : '') + ': no error.',
        corrected: 'The syndrome is ' + syndrome.toString(2) + ' = ' + syndrome + ': the bit at position ' + syndrome + ' is wrong; flip it.',
        detected: 'The syndrome ' + syndrome + ' points past the end of the word: more than one bit is wrong.',
        p0: 'The syndrome is 0 but the overall parity is odd: only P0 itself is wrong.',
        double: 'The syndrome is ' + syndrome + ' but the overall parity is even: two bits are wrong. This is detected but cannot be corrected.',
      }[status];
      trace.push({ kind: 'ham-verdict', status, syndrome, say });
      const corrected = (opts.secded ? String(status === 'p0' ? 1 - p0 : p0) : '') + fixed.slice(1).join('');
      const data = [];
      for (let p = 1; p <= n; p++) if (p & (p - 1)) data.push(fixed[p]);
      return { status, syndrome, position, corrected, data: status === 'double' || status === 'detected' ? null : data.join(''), trace };
    },
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
