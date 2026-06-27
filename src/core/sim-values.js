// Four-state values. A bit is 0, 1, 'X' (unknown) or 'Z' (floating: nothing drives it).
// A bus value is an ARRAY OF BITS, LEAST SIGNIFICANT FIRST: [1, 0, 'X', 0] is the 4-bit value written
// 0X01 (most significant first). sim.get gives a bit for a 1-bit net and such an array for a bus; sim.num
// gives the bus as a number when every bit is known, else null. sim.set takes a bit, a number, an array of
// bits, or a string of bits written most significant first ('01XZ').
// Inside the simulator a w-bit value (w up to 32) is a pair of words (a, b), per bit:
// 0 = (0,0), 1 = (1,0), Z = (0,1), X = (1,1).
(function (S) {
  'use strict';
  const V = S.Values = {};
  V.MAXW = 32;
  V.mask = (w) => (w >= 32 ? 0xFFFFFFFF : ((1 << w) >>> 0) - 1);

  V.bitOf = (a, b, i) => ((b >>> i) & 1 ? ((a >>> i) & 1 ? 'X' : 'Z') : (a >>> i) & 1);
  /** the public form of (a, b): a bit when w is 1, else an array of bits, least significant first */
  V.toPub = (a, b, w) => {
    if (w === 1) return b & 1 ? (a & 1 ? 'X' : 'Z') : a & 1;
    const out = new Array(w);
    for (let i = 0; i < w; i++) out[i] = V.bitOf(a, b, i);
    return out;
  };
  /** (a, b) from a public value of width w: a bit, a number, an array of bits or a string of bits (MSB first) */
  V.fromPub = (v, w) => {
    const m = V.mask(w);
    if (v === 'X' || v === 'x' || v === null || v === undefined) return [m, m];
    if (v === 'Z' || v === 'z') return [0, m];
    if (v === true) return [1, 0];
    if (v === false) return [0, 0];
    if (typeof v === 'number') return [(v >>> 0) & m, 0].map((x) => x >>> 0);
    if (Array.isArray(v)) {
      let a = 0, b = 0;
      for (let i = 0; i < w; i++) {
        const x = i < v.length ? v[i] : 0;
        if (x === 1 || x === '1' || x === true) a |= 1 << i;
        else if (x === 'X' || x === 'x') { a |= 1 << i; b |= 1 << i; } else if (x === 'Z' || x === 'z') b |= 1 << i;
      }
      return [a >>> 0, b >>> 0];
    }
    if (typeof v === 'string') {
      const s = v.replace(/[_\s]/g, '');
      if (/^0x[0-9a-f]+$/i.test(s)) return [(parseInt(s, 16) >>> 0) & m, 0].map((x) => x >>> 0);
      if (/^[01xz]+$/i.test(s)) return V.fromPub(s.split('').reverse(), w);
      if (/^\d+$/.test(s)) return V.fromPub(+s, w);
    }
    throw new Error('not a value: ' + v);
  };
  /** the number held by a public value, or null when a bit is X or Z */
  V.toNum = (v) => {
    if (v === 0 || v === 1) return v;
    if (!Array.isArray(v)) return null;
    let n = 0;
    for (let i = v.length - 1; i >= 0; i--) { if (v[i] !== 0 && v[i] !== 1) return null; n = n * 2 + v[i]; }
    return n;
  };
  V.fromNum = (n, w) => V.toPub(n >>> 0, 0, w);
  /** text for a public value: 'bin' (MSB first, the default), 'hex' or 'dec'; unknown digits show X or Z */
  V.str = (v, radix) => {
    if (!Array.isArray(v)) return String(v);
    const bits = v.slice().reverse().map(String);
    if (radix === 'dec') { const n = V.toNum(v); return n === null ? (bits.every((x) => x === 'Z') ? 'Z' : 'X') : String(n); }
    if (radix === 'hex') {
      let out = '';
      for (let i = bits.length; i > 0; i -= 4) {
        const nib = bits.slice(Math.max(0, i - 4), i);
        if (nib.every((x) => x === 'Z')) out = 'Z' + out;
        else if (nib.some((x) => x !== '0' && x !== '1')) out = 'X' + out;
        else out = parseInt(nib.join(''), 2).toString(16).toUpperCase() + out;
      }
      return out;
    }
    return bits.join('');
  };
  V.eq = (x, y) => (Array.isArray(x) ? Array.isArray(y) && x.length === y.length && x.every((b, i) => b === y[i]) : x === y);
  V.known = (v) => (Array.isArray(v) ? v.every((b) => b === 0 || b === 1) : v === 0 || v === 1);

  // ---- gate logic on (a, b) words, bitwise ----------------------------------------------------------------
  // Z on an input reads as X. Results never contain Z.
  V.andAB = (a1, b1, a2, b2) => { const z = (~a1 & ~b1) | (~a2 & ~b2), o = (a1 & ~b1) & (a2 & ~b2); const x = ~z & ~o; return [(o | x) >>> 0, x >>> 0]; };
  V.orAB = (a1, b1, a2, b2) => { const o = (a1 & ~b1) | (a2 & ~b2), z = (~a1 & ~b1) & (~a2 & ~b2); const x = ~z & ~o; return [(o | x) >>> 0, x >>> 0]; };
  V.xorAB = (a1, b1, a2, b2) => { const x = b1 | b2; return [((a1 ^ a2) | x) >>> 0, x >>> 0]; };
  V.notAB = (a, b) => [(~a | b) >>> 0, b >>> 0];
  /** a gate on public bits: gate('NAND', [1, 'X']) */
  V.gate = (type, ins) => {
    const ab = ins.map((v) => V.fromPub(v, 1));
    const base = { AND: V.andAB, NAND: V.andAB, OR: V.orAB, NOR: V.orAB, XOR: V.xorAB, XNOR: V.xorAB }[type];
    let r = ab[0].slice();
    if (base) for (let i = 1; i < ab.length; i++) r = base(r[0], r[1], ab[i][0], ab[i][1]);
    else r = [(r[0] | r[1]) & 1, r[1] & 1];
    if (type === 'NOT' || type === 'NAND' || type === 'NOR' || type === 'XNOR') r = V.notAB(r[0], r[1]);
    return V.toPub(r[0] & 1, r[1] & 1, 1);
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
