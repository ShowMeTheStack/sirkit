// Verilog values: 4-state vectors of any width, held as two BigInt masks per vector (a = value, b = unknown):
// a=0 b=0 is 0, a=1 b=0 is 1, a=0 b=1 is z, a=1 b=1 is x. Operators follow the standard's width, sign and
// x/z rules; reals are plain JS numbers. Also the formatting of $display arguments.
(function (S) {
  'use strict';
  const V = S.Verilog = S.Verilog || {};
  const B0 = 0n, B1 = 1n;
  const MASKS = [];
  const mask = (w) => (w < 256 ? (MASKS[w] || (MASKS[w] = (B1 << BigInt(w)) - B1)) : (B1 << BigInt(w)) - B1);

  class Vec {
    constructor(w, a, b, s) { this.w = w; this.a = a; this.b = b; this.s = !!s; }
    get known() { return this.b === B0; }
    bit(i) { const m = B1 << BigInt(i); return ((this.a & m) ? 1 : 0) | ((this.b & m) ? 2 : 0); } // 0,1,2=z,3=x
    /** MSB-first string of 0 1 x z */
    toBits() {
      let s = '';
      for (let i = this.w - 1; i >= 0; i--) s += '01zx'[this.bit(i)];
      return s;
    }
    /** a JS number (or BigInt for wide values) when every bit is known, else null */
    toNum() {
      if (this.b) return null;
      let v = this.a;
      if (this.s && this.w && (v >> BigInt(this.w - 1)) & B1) v -= B1 << BigInt(this.w);
      return this.w <= 53 ? Number(v) : v;
    }
    toBig() { if (this.b) return null; let v = this.a; if (this.s && this.w && (v >> BigInt(this.w - 1)) & B1) v -= B1 << BigInt(this.w); return v; }
    eq(o) { return this.w === o.w && this.a === o.a && this.b === o.b; }
    toString() { return this.w + "'b" + this.toBits(); }
  }
  V.Vec = Vec;
  V.mask = mask;

  const vec = (w, a, b, s) => { const m = mask(w); return new Vec(w, BigInt.asUintN(w, a) & m, BigInt.asUintN(w, b || B0) & m, s); };
  const fromInt = (n, w, s) => vec(w === undefined ? 32 : w, BigInt(typeof n === 'number' ? Math.trunc(n) : n), B0, s);
  const allX = (w, s) => new Vec(w, mask(w), mask(w), s);
  const allZ = (w) => new Vec(w, B0, mask(w), false);
  V.vec = vec; V.fromInt = fromInt; V.allX = allX; V.allZ = allZ;
  V.ZERO1 = new Vec(1, B0, B0); V.ONE1 = new Vec(1, B1, B0); V.X1 = new Vec(1, B1, B1); V.Z1 = new Vec(1, B0, B1);
  /** from a string of 0 1 x z (MSB first) */
  V.fromBits = (str, s) => {
    let a = B0, b = B0;
    for (const ch of str) { a <<= B1; b <<= B1; if (ch === '1') a |= B1; else if (ch === 'x' || ch === 'X') { a |= B1; b |= B1; } else if (ch === 'z' || ch === 'Z' || ch === '?') b |= B1; }
    return new Vec(str.length, a, b, s);
  };
  /** a JS value (0, 1, 'X', 'Z', number, bit string) to a vector of width w */
  V.from = (x, w) => {
    if (x instanceof Vec) return resize(x, w, x.s);
    if (x === 'X' || x === 'x') return allX(w);
    if (x === 'Z' || x === 'z') return allZ(w);
    if (typeof x === 'string') return resize(V.fromBits(x), w, false);
    return fromInt(x, w);
  };

  /** change width: sign-extends when signed (copying an x or z sign bit), else zero-extends */
  function resize(v, w, signed) {
    if (v.w === w) return v.s === !!signed ? v : new Vec(w, v.a, v.b, signed);
    if (w < v.w) return new Vec(w, v.a & mask(w), v.b & mask(w), signed);
    let a = v.a, b = v.b;
    if (signed && v.w) {
      const top = BigInt(v.w - 1), ext = mask(w) ^ mask(v.w);
      if ((a >> top) & B1) a |= ext;
      if ((b >> top) & B1) b |= ext;
    }
    return new Vec(w, a, b, signed);
  }
  V.resize = resize;
  /** fill with x or z beyond the old width (unsized x/z literals) */
  V.fillExt = (v, w) => {
    if (w <= v.w) return resize(v, w, v.s);
    const top = BigInt(v.w - 1), ext = mask(w) ^ mask(v.w);
    let a = v.a, b = v.b;
    if ((b >> top) & B1) { b |= ext; if ((a >> top) & B1) a |= ext; } else if (v.s && (a >> top) & B1) a |= ext;
    return new Vec(w, a, b, v.s);
  };

  const signedVal = (v) => (v.s && (v.a >> BigInt(v.w - 1)) & B1 ? v.a - (B1 << BigInt(v.w)) : v.a);
  V.signedVal = signedVal;
  const k1 = (v) => v.a & ~v.b, k0 = (v) => ~v.a & ~v.b & mask(v.w);
  function encode(w, r1, r0, s) { const m = mask(w), x = m & ~(r1 | r0); return new Vec(w, (r1 | x) & m, x, s); }

  // ---- operators, operands already at the result width ------------------------------------------------------
  const ops = {
    add: (x, y) => (x.b || y.b ? allX(x.w, x.s) : vec(x.w, x.a + y.a, B0, x.s)),
    sub: (x, y) => (x.b || y.b ? allX(x.w, x.s) : vec(x.w, x.a - y.a, B0, x.s)),
    mul: (x, y) => (x.b || y.b ? allX(x.w, x.s) : vec(x.w, x.a * y.a, B0, x.s)),
    div(x, y) {
      if (x.b || y.b || y.a === B0) return allX(x.w, x.s);
      return x.s ? vec(x.w, signedVal(x) / signedVal(y), B0, true) : vec(x.w, x.a / y.a, B0, false);
    },
    mod(x, y) {
      if (x.b || y.b || y.a === B0) return allX(x.w, x.s);
      return x.s ? vec(x.w, signedVal(x) % signedVal(y), B0, true) : vec(x.w, x.a % y.a, B0, false);
    },
    pow(x, y) {
      // y is self-determined; result has x's width and sign
      if (x.b || y.b) return allX(x.w, x.s);
      const base = x.s ? signedVal(x) : x.a, e = y.s ? signedVal(y) : y.a;
      if (e < B0) {
        if (base === B0) return allX(x.w, x.s);
        if (base === B1) return vec(x.w, B1, B0, x.s);
        if (base === -B1) return vec(x.w, e % 2n === B0 ? B1 : -B1, B0, x.s);
        return vec(x.w, B0, B0, x.s);
      }
      let r = B1, b = base, n = e;
      const m = mask(x.w);
      while (n > B0) { if (n & B1) r = (r * b) & m; b = (b * b) & m; n >>= B1; }
      return vec(x.w, r, B0, x.s);
    },
    and: (x, y) => encode(x.w, k1(x) & k1(y), k0(x) | k0(y), x.s),
    or: (x, y) => encode(x.w, k1(x) | k1(y), k0(x) & k0(y), x.s),
    xor: (x, y) => { const u = (x.b | y.b) & mask(x.w); return new Vec(x.w, ((x.a ^ y.a) & ~u) | u, u, x.s); },
    xnor: (x, y) => { const u = (x.b | y.b) & mask(x.w); return new Vec(x.w, (~(x.a ^ y.a) & mask(x.w) & ~u) | u, u, x.s); },
    not: (x) => encode(x.w, k0(x), k1(x), x.s),
    neg: (x) => (x.b ? allX(x.w, x.s) : vec(x.w, -x.a, B0, x.s)),
    shl(x, n) { if (n.b) return allX(x.w, x.s); const k = n.a; if (k >= BigInt(x.w)) return vec(x.w, B0, B0, x.s); return vec(x.w, x.a << k, x.b << k, x.s); },
    shr(x, n) { if (n.b) return allX(x.w, x.s); const k = n.a; if (k >= BigInt(x.w)) return vec(x.w, B0, B0, x.s); return new Vec(x.w, x.a >> k, x.b >> k, x.s); },
    ashr(x, n) {
      if (!x.s) return ops.shr(x, n);
      if (n.b) return allX(x.w, x.s);
      const k = n.a > BigInt(x.w) ? BigInt(x.w) : n.a, top = BigInt(x.w - 1), ext = mask(x.w) ^ (k >= BigInt(x.w) ? B0 : mask(x.w - Number(k)));
      let a = x.a >> k, b = x.b >> k;
      if ((x.a >> top) & B1) a |= ext;
      if ((x.b >> top) & B1) b |= ext;
      return new Vec(x.w, a, b, x.s);
    },
  };
  V.ops = ops;
  /** truth value of a vector: 0, 1 or 'x' */
  const truth = (v) => (k1(v) ? 1 : v.b ? 'x' : 0);
  V.truth = truth;
  const bool = (t) => (t === 'x' ? V.X1 : t ? V.ONE1 : V.ZERO1);
  V.bool = bool;
  V.logic = {
    land: (x, y) => { const p = truth(x), q = truth(y); return bool(p === 0 || q === 0 ? 0 : p === 1 && q === 1 ? 1 : 'x'); },
    lor: (x, y) => { const p = truth(x), q = truth(y); return bool(p === 1 || q === 1 ? 1 : p === 0 && q === 0 ? 0 : 'x'); },
    lnot: (x) => { const p = truth(x); return bool(p === 'x' ? 'x' : 1 - p); },
  };
  V.reduce = {
    and: (x) => bool(k0(x) ? 0 : x.b ? 'x' : 1),
    or: (x) => bool(k1(x) ? 1 : x.b ? 'x' : 0),
    xor: (x) => { if (x.b) return V.X1; let a = x.a, p = 0; while (a) { p ^= Number(a & B1); a >>= B1; } return bool(p); },
  };
  V.reduce.nand = (x) => V.logic.lnot(V.reduce.and(x));
  V.reduce.nor = (x) => V.logic.lnot(V.reduce.or(x));
  V.reduce.xnor = (x) => V.logic.lnot(V.reduce.xor(x));
  /** comparisons; operands at a common width and sign */
  V.cmp = {
    eq: (x, y) => { const u = x.b | y.b; if (((x.a ^ y.a) & ~u) & mask(x.w)) return V.ZERO1; return u ? V.X1 : V.ONE1; },
    ne: (x, y) => V.logic.lnot(V.cmp.eq(x, y)),
    ceq: (x, y) => bool(x.a === y.a && x.b === y.b ? 1 : 0),
    cne: (x, y) => bool(x.a === y.a && x.b === y.b ? 0 : 1),
    lt: (x, y) => (x.b || y.b ? V.X1 : bool(x.s ? signedVal(x) < signedVal(y) : x.a < y.a)),
    le: (x, y) => (x.b || y.b ? V.X1 : bool(x.s ? signedVal(x) <= signedVal(y) : x.a <= y.a)),
    gt: (x, y) => (x.b || y.b ? V.X1 : bool(x.s ? signedVal(x) > signedVal(y) : x.a > y.a)),
    ge: (x, y) => (x.b || y.b ? V.X1 : bool(x.s ? signedVal(x) >= signedVal(y) : x.a >= y.a)),
  };
  /** cond ? x : y with an unknown condition: equal known bits survive, the rest are x */
  V.merge = (x, y) => {
    const m = mask(x.w), same = ~(x.a ^ y.a) & ~(x.b ^ y.b) & m, u = m & ~same;
    return new Vec(x.w, (x.a & same) | u, (x.b & same) | u, x.s);
  };
  V.concat = (parts) => {
    let a = B0, b = B0, w = 0;
    for (const p of parts) { a = (a << BigInt(p.w)) | p.a; b = (b << BigInt(p.w)) | p.b; w += p.w; }
    return new Vec(w, a, b, false);
  };
  /** bits [lo, lo+w) of v; bits outside the vector read as x */
  V.slice = (v, lo, w) => {
    if (lo >= 0 && lo + w <= v.w) { const m = mask(w), k = BigInt(lo); return new Vec(w, (v.a >> k) & m, (v.b >> k) & m, false); }
    let a = B0, b = B0;
    for (let i = w - 1; i >= 0; i--) {
      const j = lo + i;
      a <<= B1; b <<= B1;
      if (j < 0 || j >= v.w) { a |= B1; b |= B1; } else { const k = BigInt(j); a |= (v.a >> k) & B1; b |= (v.b >> k) & B1; }
    }
    return new Vec(w, a, b, false);
  };
  /** v with bits [lo, lo+val.w) replaced by val (bits outside the vector ignored) */
  V.splice = (v, lo, val) => {
    let a = v.a, b = v.b;
    for (let i = 0; i < val.w; i++) {
      const j = lo + i;
      if (j < 0 || j >= v.w) continue;
      const m = B1 << BigInt(j), k = BigInt(i);
      a = (a & ~m) | (((val.a >> k) & B1) << BigInt(j));
      b = (b & ~m) | (((val.b >> k) & B1) << BigInt(j));
    }
    return new Vec(v.w, a, b, v.s);
  };
  /** wire resolution of two drivers, bit by bit: z yields to the other, conflicts give x */
  V.resolve = (x, y, kind) => {
    const m = mask(x.w), zx = x.b & ~x.a, zy = y.b & ~y.a;
    let a, b;
    if (kind === 'wand' || kind === 'wor') {
      // z inputs are ignored; otherwise and / or
      const xx = new Vec(x.w, (x.a & ~zx) | (y.a & zx), (x.b & ~zx) | (y.b & zx)), yy = new Vec(x.w, (y.a & ~zy) | (x.a & zy), (y.b & ~zy) | (x.b & zy));
      const r = kind === 'wand' ? ops.and(xx, yy) : ops.or(xx, yy), zz = zx & zy;
      return zz ? new Vec(x.w, r.a & ~zz, r.b | zz, x.s) : r;
    }
    const same = ~(x.a ^ y.a) & ~(x.b ^ y.b) & m;
    a = (x.a & same) | (y.a & zx & ~same) | (x.a & zy & ~same);
    b = (x.b & same) | (y.b & zx & ~same) | (x.b & zy & ~same);
    const conflict = m & ~same & ~zx & ~zy;
    a |= conflict; b |= conflict;
    return new Vec(x.w, a, b, x.s);
  };

  // ---- reals --------------------------------------------------------------------------------------------------
  /** a vector as a real (x and z bits read as 0) */
  V.toReal = (v) => (typeof v === 'number' ? v : Number(v.s ? signedVal(new Vec(v.w, v.a & ~v.b, B0, v.s)) : v.a & ~v.b));
  /** a real rounded to the nearest integer (halves away from zero), as a vector of width w */
  V.fromReal = (r, w, s) => {
    if (!isFinite(r)) return allX(w, s);
    const n = r < 0 ? -Math.round(-r) : Math.round(r);
    return vec(w, BigInt(n), B0, s);
  };

  // ---- formatting ---------------------------------------------------------------------------------------------
  const decDigits = (w, signed) => (w ? (signed ? String(B1 << BigInt(w - 1)).length + 1 : String(mask(w)).length) : 1);
  V.decWidth = decDigits;
  function fmtDec(v, width, zero) {
    let s;
    if (v.b) {
      const allx = (v.a & v.b) === mask(v.w) && v.b === mask(v.w), allz = v.b === mask(v.w) && v.a === B0;
      const anyx = v.a & v.b;
      s = allx ? 'x' : allz ? 'z' : anyx ? 'X' : 'Z';
    } else s = String(v.s ? signedVal(v) : v.a);
    if (zero) return s;
    const w = width == null ? decDigits(v.w, v.s) : width;
    return s.padStart(w, ' ');
  }
  function fmtRadix(v, bitsPer, width, zero, padTop) {
    const n = Math.ceil(v.w / bitsPer) || 1;
    let s = '';
    for (let d = n - 1; d >= 0; d--) {
      let anyx = false, allx = true, anyz = false, allz = true, val = 0;
      for (let i = bitsPer - 1; i >= 0; i--) {
        const j = d * bitsPer + i;
        if (j >= v.w) { if (padTop) { allx = false; allz = false; } continue; }
        const bt = v.bit(j);
        if (bt === 3) { anyx = true; allz = false; } else if (bt === 2) { anyz = true; allx = false; } else { allx = false; allz = false; val |= bt << i; }
      }
      s += allx ? 'x' : allz ? 'z' : anyx ? 'X' : anyz ? 'Z' : val.toString(16);
    }
    if (zero) { s = s.replace(/^0+(?=.)/, ''); }
    if (width != null && s.length < width) s = (zero ? '' : '') + s.padStart(width, s[0] === 'x' || s[0] === 'z' ? s[0] : '0');
    return s;
  }
  V.fmtDec = fmtDec;
  V.fmtRadix = fmtRadix;
  V.fmtStr = (v) => {
    let s = '';
    for (let i = Math.ceil(v.w / 8) - 1; i >= 0; i--) {
      const c = Number(V.slice(v, i * 8, 8).a);
      if (c) s += String.fromCharCode(c);
    }
    return s;
  };
  V.strToVec = (str) => {
    let a = B0;
    for (let i = 0; i < str.length; i++) a = (a << 8n) | BigInt(str.charCodeAt(i) & 255);
    return new Vec(Math.max(8, str.length * 8), a, B0, false);
  };
  // ---- C-like %f %e %g, exact (ties to even on the binary value, as C does) -------------------------------------
  function parts(x) {
    // |x| = m * 2^e with m an integer
    const dv = new DataView(new ArrayBuffer(8)); dv.setFloat64(0, Math.abs(x));
    const hi = dv.getUint32(0), lo = dv.getUint32(4);
    const ex = (hi >>> 20) & 0x7ff;
    let m = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
    let e;
    if (ex === 0) e = -1074; else { m |= 1n << 52n; e = ex - 1075; }
    return { m, e };
  }
  /** round(|x| * 10^k) as a BigInt, ties to even */
  function scaled(x, k) {
    const { m, e } = parts(x);
    let num = m, den = 1n;
    if (e >= 0) num <<= BigInt(e); else den <<= BigInt(-e);
    if (k >= 0) num *= 10n ** BigInt(k); else den *= 10n ** BigInt(-k);
    const q = num / den, r = num % den;
    if (2n * r > den || (2n * r === den && (q & 1n))) return q + 1n;
    return q;
  }
  function fixed(x, p) {
    const q = scaled(x, p).toString().padStart(p + 1, '0');
    const s = p ? q.slice(0, q.length - p) + '.' + q.slice(q.length - p) : q;
    return (x < 0 || Object.is(x, -0) ? '-' : '') + s;
  }
  function expo(x, p) {
    if (x === 0) return (Object.is(x, -0) ? '-' : '') + (p ? '0.' + '0'.repeat(p) : '0') + 'e+00';
    let e10 = Math.floor(Math.log10(Math.abs(x)));
    let q = scaled(x, p - e10);
    if (q >= 10n ** BigInt(p + 1)) { e10++; q = scaled(x, p - e10); }
    if (q < 10n ** BigInt(p)) { e10--; q = scaled(x, p - e10); }
    const d = q.toString();
    const s = d[0] + (p ? '.' + d.slice(1) : '');
    return (x < 0 ? '-' : '') + s + 'e' + (e10 < 0 ? '-' : '+') + String(Math.abs(e10)).padStart(2, '0');
  }
  function general(x, p, alt) {
    const P = p === 0 ? 1 : p;
    let s;
    if (x === 0) { s = fixed(x, P - 1); }
    else {
      const es = expo(x, P - 1);
      const e10 = parseInt(es.slice(es.indexOf('e') + 1), 10);
      s = e10 < -4 || e10 >= P ? es : fixed(x, P - 1 - e10);
    }
    if (!alt && s.includes('.')) s = s.replace(/(\.\d*?)0+(e|$)/, '$1$2').replace(/\.(e|$)/, '$1');
    return s;
  }
  /** %e %f %g of C, with width, precision, left-justify and alternate (#) flags */
  V.fmtReal = (r, conv, prec, width, left, alt, zero) => {
    let s;
    const p = prec == null ? 6 : prec;
    if (!isFinite(r)) s = isNaN(r) ? 'nan' : r < 0 ? '-inf' : 'inf';
    else if (conv === 'f') s = fixed(r, p);
    else if (conv === 'e') s = expo(r, p);
    else s = general(r, p, alt);
    if (width != null && s.length < width) s = left ? s.padEnd(width) : zero ? (s[0] === '-' ? '-' + s.slice(1).padStart(width - 1, '0') : s.padStart(width, '0')) : s.padStart(width);
    return s;
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
