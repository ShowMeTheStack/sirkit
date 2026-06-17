// Boolean expressions: the tree, a parser for the usual notations, printing in several styles, evaluation and
// tree surgery. Nodes have the same shapes as Netlist's, so a tree can go straight to Netlist.fromExpressions:
//   {op:'var', name}  {op:'const', v}  {op:'not', a}  {op:'and'|'or'|'xor', args:[...]}
// Precedence, tightest first: NOT, AND, XOR, OR. A chain like A+B+C is one n-ary node; brackets the writer put
// in are kept, so A(BC) stays an AND inside an AND (the associative law can then remove it).
(function (S) {
  'use strict';
  const B = S.Bool = S.Bool || {};

  // ---- building nodes -----------------------------------------------------------------------------------------
  const V = (name) => ({ op: 'var', name });
  const C = (v) => ({ op: 'const', v: v ? 1 : 0 });
  const NOT = (a) => ({ op: 'not', a });
  const nary = (op, unit) => (...xs) => { const a = xs.flat(); return a.length === 0 ? C(unit) : a.length === 1 ? a[0] : { op, args: a }; };
  const AND = nary('and', 1), OR = nary('or', 0), XOR = nary('xor', 0);
  /** an n-ary node whose same-operator children are merged in: flat('and', [A, AB]) is AAB */
  const flat = (op, xs) => { const a = xs.flatMap((x) => (x.op === op ? x.args : [x])); return a.length === 0 ? C(op === 'and' ? 1 : 0) : a.length === 1 ? a[0] : { op, args: a }; };
  Object.assign(B, { V, C, NOT, AND, OR, XOR, flat });
  B.mk = (op, args) => ({ op, args });

  const isLit = (e) => e.op === 'var' || (e.op === 'not' && e.a.op === 'var');
  const isAtom = (e) => e.op === 'var' || e.op === 'const';
  B.isLit = isLit;

  // ---- keys and equality ---------------------------------------------------------------------------------------
  /** a canonical key: equal for trees that differ only in operand order or in grouping of one operator */
  function key(e) {
    switch (e.op) {
      case 'var': return e.name;
      case 'const': return String(e.v);
      case 'not': return '~' + key(e.a);
    }
    const ks = [];
    const walk = (x) => { if (x.op === e.op) x.args.forEach(walk); else ks.push(key(x)); };
    e.args.forEach(walk);
    return e.op + '(' + ks.sort().join(',') + ')';
  }
  /** an exact key: equal only for identical trees */
  function skey(e) {
    switch (e.op) {
      case 'var': return e.name;
      case 'const': return String(e.v);
      case 'not': return '~' + skey(e.a);
    }
    return e.op + '(' + e.args.map(skey).join(',') + ')';
  }
  B.key = key; B.skey = skey;
  B.same = (a, b) => key(a) === key(b);
  /** a copy without parser positions */
  function clone(e) {
    switch (e.op) {
      case 'var': return V(e.name);
      case 'const': return C(e.v);
      case 'not': return NOT(clone(e.a));
    }
    return { op: e.op, args: e.args.map(clone) };
  }
  B.clone = clone;
  /** same-operator nesting merged everywhere (what Netlist's two-level builders expect) */
  function flatten(e) {
    if (e.op === 'not') return NOT(flatten(e.a));
    if (!e.args) return clone(e);
    return flat(e.op, e.args.map(flatten));
  }
  B.flatten = flatten;

  // ---- parsing ---------------------------------------------------------------------------------------------------
  // Accepted: A'B + C(D+E)'  ~a & b | c  !a && b  A·B̄  A ⊕ B  A ^ B  A ⊙ B (XNOR)  ¬A ∧ B ∨ C  0 1, and the words
  // AND OR NOT XOR XNOR in word mode. An overbar is a combining mark (U+0305 or U+0304) after each character
  // under it; a run of barred characters is one negated group, so A̅B̅ is (AB)' and A̅·B̅ is A'B'. In letter
  // mode (the default when the text uses ' or bars) a name is one letter plus digits, so AB is A·B; in word
  // mode (the default when it uses & | ~ !) a name is a whole word. parse(text, {vars: ['EN', 'D']}) reads a
// declared name of several letters as one variable in letter mode too, so EN'D is EN'·D, not E·N'·D.
  const BAR = new Set(['̅', '̄']), DBAR = '̿';
  class BoolSyntaxError extends Error {
    constructor(msg, pos, end) { super(msg); this.name = 'BoolSyntaxError'; this.pos = pos; this.end = end == null ? pos + 1 : end; }
  }
  B.SyntaxError = BoolSyntaxError;
  const col = (i) => 'column ' + (i + 1);
  const KW = { and: '*', or: '+', not: '~', xor: '^', xnor: 'xnor' };

  function lex(src, words, names) {
    // characters with their bar depth
    const chars = [];
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (BAR.has(ch) || ch === DBAR) {
        if (!chars.length) throw new BoolSyntaxError('An overbar mark at ' + col(i) + ' has nothing under it.', i);
        chars[chars.length - 1].bars += ch === DBAR ? 2 : 1;
        continue;
      }
      chars.push({ ch, i, bars: 0 });
    }
    const raw = [];
    for (let k = 0; k < chars.length;) {
      const { ch, i } = chars[k];
      if (/\s/.test(ch)) { raw.push({ t: 'ws', at: i, end: i + 1, bars: chars[k].bars }); k++; continue; }
      const isName = words ? /[A-Za-z_]/.test(ch) : /[A-Za-z]/.test(ch);
      // a declared name of several letters (EN, QD) is one variable even in letter mode, the longest that fits
      const decl = !words && isName && names ? names.find((n) => chars.slice(k, k + n.length).map((c) => c.ch).join('') === n && !(k + n.length < chars.length && /[0-9_]/.test(chars[k + n.length].ch))) : null;
      if (decl) {
        const j = k + decl.length, end = j < chars.length ? chars[j].i : src.length;
        raw.push({ t: 'v', v: decl, at: i, end, bars: Math.min(...chars.slice(k, j).map((c) => c.bars)) });
        k = j; continue;
      }
      if (isName) {
        let j = k + 1;
        const more = words ? /[A-Za-z0-9_]/ : /[0-9_]/;
        while (j < chars.length && more.test(chars[j].ch)) j++;
        const text = chars.slice(k, j).map((c) => c.ch).join(''), bars = Math.min(...chars.slice(k, j).map((c) => c.bars));
        const end = j < chars.length ? chars[j].i : src.length;
        if (words && KW[text.toLowerCase()]) raw.push({ t: KW[text.toLowerCase()], v: text, at: i, end, bars });
        else raw.push({ t: 'v', v: text, at: i, end, bars });
        k = j; continue;
      }
      if (/[0-9]/.test(ch)) {
        let j = k + 1;
        while (j < chars.length && /[0-9]/.test(chars[j].ch)) j++;
        const text = chars.slice(k, j).map((c) => c.ch).join('');
        if (text !== '0' && text !== '1') throw new BoolSyntaxError('A constant is 0 or 1; "' + text + '" at ' + col(i) + ' is neither.', i, i + text.length);
        raw.push({ t: 'c', v: +text, at: i, end: i + 1, bars: chars[k].bars });
        k = j; continue;
      }
      const two = ch + (chars[k + 1] ? chars[k + 1].ch : '');
      if (two === '&&' || two === '||') { raw.push({ t: two === '&&' ? '*' : '+', v: two, at: i, end: i + 2, bars: chars[k].bars }); k += 2; continue; }
      const map = { "'": "'", '’': "'", '′': "'", '+': '+', '|': '+', '∨': '+', '*': '*', '·': '*', '.': '*', '&': '*', '∧': '*', '⋅': '*', '×': '*',
        '^': '^', '⊕': '^', '⊙': 'xnor', '≡': 'xnor', '~': '~', '!': '~', '¬': '~', '(': '(', ')': ')' };
      if (map[ch]) { raw.push({ t: map[ch], v: ch, at: i, end: i + 1, bars: chars[k].bars }); k++; continue; }
      throw new BoolSyntaxError('Unknown symbol "' + ch + '" at ' + col(i) + '.', i);
    }
    // bars become virtual brackets: a rise in depth opens a negated group, a fall closes it
    const toks = [];
    let depth = 0;
    for (const t of raw) {
      while (t.bars > depth) { toks.push({ t: 'bopen', v: 'overbar', at: t.at, end: t.at }); depth++; }
      while (t.bars < depth) { toks.push({ t: 'bclose', v: 'end of overbar', at: t.at, end: t.at }); depth--; }
      if (t.t !== 'ws') toks.push(t);
    }
    while (depth-- > 0) toks.push({ t: 'bclose', v: 'end of overbar', at: src.length, end: src.length });
    return toks;
  }

  /** parse text into a tree; throws B.SyntaxError with .pos (0-based) and a message naming the column */
  function parse(src, opts) {
    if (typeof src !== 'string') return src;
    opts = opts || {};
    const words = opts.words != null ? opts.words : (/[&|~!]/.test(src) || /\b(and|or|not|xor|xnor)\b/i.test(src)) && !/['’′̄̅̿·]/.test(src);
    // opts.vars: the variables an exercise declares; names of several letters among them stay whole
    const names = opts.vars ? [...opts.vars].map(String).filter((n) => n.length > 1 && /^[A-Za-z][A-Za-z0-9_]*$/.test(n)).sort((a, b) => b.length - a.length) : null;
    const toks = lex(src, words, names && names.length ? names : null);
    if (!toks.length) throw new BoolSyntaxError('The expression is empty.', 0, 0);
    let k = 0;
    const peek = () => toks[k] && toks[k].t, take = () => toks[k++];
    const show = (t) => (t ? '"' + t.v + '" at ' + col(t.at) : 'the end of the expression');
    const span = (n, a, b) => { n.at = [a, b]; return n; };
    const STARTS = ['v', 'c', '(', '~', 'bopen'];
    function orE() {
      const first = toks[k], a = [xorE()];
      while (peek() === '+') { take(); if (!STARTS.includes(peek())) expected(); a.push(xorE()); }
      return a.length === 1 ? a[0] : span({ op: 'or', args: a }, first.at, toks[k - 1].end);
    }
    function xorE() {
      const first = toks[k];
      let e = andE();
      const a = [e];
      while (peek() === '^' || peek() === 'xnor') {
        const op = take().t;
        if (!STARTS.includes(peek())) expected();
        const r = andE();
        if (op === '^') a.push(r);
        else { const left = a.length === 1 ? a[0] : { op: 'xor', args: a.slice() }; a.length = 0; a.push(span(NOT(span({ op: 'xor', args: [left, r] }, first.at, toks[k - 1].end)), first.at, toks[k - 1].end)); }
      }
      return a.length === 1 ? a[0] : span({ op: 'xor', args: a }, first.at, toks[k - 1].end);
    }
    function andE() {
      const first = toks[k], a = [notE()];
      for (;;) {
        if (peek() === '*') { take(); if (!STARTS.includes(peek())) expected(); a.push(notE()); }
        else if (STARTS.includes(peek())) a.push(notE());
        else break;
      }
      return a.length === 1 ? a[0] : span({ op: 'and', args: a }, first.at, toks[k - 1].end);
    }
    function expected() {
      const t = toks[k];
      if (!t) throw new BoolSyntaxError('The expression ends too soon: expected a variable, 0, 1, "(" or a NOT.', src.length, src.length);
      throw new BoolSyntaxError('Expected a variable, 0, 1, "(" or a NOT at ' + col(t.at) + ', but found "' + t.v + '".', t.at, t.end);
    }
    function notE() {
      const t = toks[k];
      if (!t) expected();
      if (t.t === '~') { take(); if (!STARTS.includes(peek())) expected(); const inner = notE(); return post(span(NOT(inner), t.at, toks[k - 1].end)); }
      let e;
      if (t.t === 'v') { take(); e = span(V(t.v), t.at, t.end); }
      else if (t.t === 'c') { take(); e = span(C(t.v), t.at, t.end); }
      else if (t.t === '(') {
        take();
        if (peek() === ')') throw new BoolSyntaxError('Empty brackets at ' + col(t.at) + '.', t.at, toks[k].end);
        e = orE();
        if (peek() !== ')') {
          if (!toks[k] || toks[k].t === 'bclose') throw new BoolSyntaxError('The "(" at ' + col(t.at) + ' is never closed.', t.at);
          throw new BoolSyntaxError('Expected ")" to close the "(" at ' + col(t.at) + ', but found ' + show(toks[k]) + '.', toks[k].at, toks[k].end);
        }
        take();
      } else if (t.t === 'bopen') {
        take();
        e = orE();
        if (peek() !== 'bclose') throw new BoolSyntaxError('An overbar starting at ' + col(t.at) + ' ends in the middle of a bracket.', t.at);
        const c = take();
        e = span(NOT(e), t.at, c.end);
      } else if (t.t === ')') throw new BoolSyntaxError('Unexpected ")" at ' + col(t.at) + ': no "(" is open.', t.at);
      else if (t.t === "'") throw new BoolSyntaxError('A prime at ' + col(t.at) + ' has nothing before it to complement.', t.at);
      else expected();
      return post(e);
    }
    function post(e) {
      while (peek() === "'") { const t = take(); e = span(NOT(e), e.at ? e.at[0] : t.at, t.end); }
      return e;
    }
    const e = orE();
    if (k < toks.length) {
      const t = toks[k];
      if (t.t === ')') throw new BoolSyntaxError('Unexpected ")" at ' + col(t.at) + ': no "(" is open.', t.at);
      if (t.t === 'bclose') throw new BoolSyntaxError('An overbar ends inside a bracket at ' + col(t.at) + '.', t.at);
      throw new BoolSyntaxError('Unexpected ' + show(t) + ' after a complete expression.', t.at, t.end);
    }
    return e;
  }
  B.parse = parse;
  /** parse without throwing: {ok, expr} or {ok:false, error:{pos, end, msg}} */
  B.tryParse = (src, opts) => {
    try { return { ok: true, expr: parse(src, opts) }; } catch (err) {
      if (err instanceof BoolSyntaxError) return { ok: false, error: { pos: err.pos, end: err.end, msg: err.message } };
      throw err;
    }
  };
  const P = (x) => (typeof x === 'string' ? parse(x) : x);
  B.P = P;

  // ---- printing ----------------------------------------------------------------------------------------------------
  const PREC = { or: 1, xor: 2, and: 3, not: 4, var: 5, const: 5 };
  const barAll = (s, mark) => s.replace(/[^̄̅̿][̄̅̿]*/gu, (c) => c + mark);
  const barred = (s, atStart) => (atStart ? /^.[̄̅̿]/u.test(s) : /[̄̅̿]$/u.test(s));
  /**
   * styles:
   *   'prime'   A'B + C(D + E)'    XOR as ⊕         'ascii'   the same with ^ for XOR
   *   'overbar' A̅B + C·D̅+̅E̅       bars, juxtaposition  'dot'     A̅·B + C·D̅+̅E̅
   *   'c'       ~A & B | C & ~(D | E) (also 'verilog')  'latex'   \overline{A}B + C\overline{D + E}
   * A same-operator child (a bracket the writer put in) keeps its brackets.
   */
  function toString(e, style, opts) {
    e = P(e);
    style = style || 'prime';
    if (style === 'verilog') style = 'c';
    const names = [];
    (function walk(x) { if (x.op === 'var') names.push(x.name); else if (x.op === 'not') walk(x.a); else if (x.args) x.args.forEach(walk); })(e);
    const wordy = names.some((n) => !/^[A-Za-z][0-9_]*$/.test(n));
    const bars = style === 'overbar' || style === 'dot';
    const xorSym = style === 'ascii' ? ' ^ ' : style === 'c' ? ' ^ ' : style === 'latex' ? ' \\oplus ' : ' ⊕ ';
    const orSym = style === 'c' ? ' | ' : ' + ';
    function wrap(x, parentOp) {
      const s = str(x);
      if (bars && x.op === 'not') return s;
      const need = PREC[x.op] < PREC[parentOp] || x.op === parentOp;
      return need ? (style === 'latex' ? '\\left(' + s + '\\right)' : '(' + s + ')') : s;
    }
    function str(x) {
      switch (x.op) {
        case 'var': return x.name;
        case 'const': return String(x.v);
        case 'not': {
          if (bars) return barAll(str(x.a), '̅');
          if (style === 'latex') return '\\overline{' + str(x.a) + '}';
          if (style === 'c') return '~' + (PREC[x.a.op] >= 4 ? str(x.a) : '(' + str(x.a) + ')');
          return (PREC[x.a.op] >= 4 ? str(x.a) : '(' + str(x.a) + ')') + "'";
        }
        case 'and': {
          const parts = x.args.map((a) => wrap(a, 'and'));
          if (style === 'c') return parts.join(' & ');
          if (style === 'dot') return parts.join('·');
          let out = parts[0];
          for (let i = 1; i < parts.length; i++) {
            let sep = '';
            if (style === 'latex') sep = wordy ? ' \\cdot ' : '';
            else if (wordy || /^[0-9_]/.test(parts[i]) || /[0-9]$/.test(out) && /^[0-9]/.test(parts[i])) sep = '·';
            else if (/[0-9_]$/.test(out) && /^[0-9_]/.test(parts[i])) sep = '·';
            else if (bars && barred(out, false) && barred(parts[i], true)) sep = '·';
            out += sep + parts[i];
          }
          return out;
        }
        case 'or': return x.args.map((a) => wrap(a, 'or')).join(orSym);
        case 'xor': return x.args.map((a) => wrap(a, 'xor')).join(xorSym);
      }
      throw new Error('bad node ' + JSON.stringify(x));
    }
    return str(e);
  }
  B.toString = toString;
  B.str = (e, style) => toString(e, style);

  // ---- variables, evaluation ----------------------------------------------------------------------------------------
  const byName = (a, b) => a.localeCompare(b, 'en', { numeric: true });
  /** the variables of an expression, sorted (A, B, ..., A2 before A10) */
  function vars(e) {
    const s = new Set();
    (function walk(x) { if (x.op === 'var') s.add(x.name); else if (x.op === 'not') walk(x.a); else if (x.args) x.args.forEach(walk); })(P(e));
    return [...s].sort(byName);
  }
  B.vars = vars; B.byName = byName;
  /** the value (0 or 1) for an assignment {A: 0|1, ...}; a missing variable is an error */
  function evaluate(e, env) {
    switch (e.op) {
      case 'var': { const v = env[e.name]; if (v == null) throw new Error('no value for ' + e.name); return v ? 1 : 0; }
      case 'const': return e.v;
      case 'not': return 1 - evaluate(e.a, env);
      case 'and': { let r = 1; for (const x of e.args) if (!evaluate(x, env)) r = 0; return r; }
      case 'or': { let r = 0; for (const x of e.args) if (evaluate(x, env)) r = 1; return r; }
      case 'xor': return e.args.reduce((s, x) => s ^ evaluate(x, env), 0);
    }
    throw new Error('bad node');
  }
  B.evaluate = (e, env) => evaluate(P(e), env);
  /** a fast evaluator over minterm numbers: compile(e, vars)(m), the first variable being the high bit */
  function compile(e, vs) {
    e = P(e); vs = vs || vars(e);
    const n = vs.length, idx = new Map(vs.map((v, i) => [v, n - 1 - i]));
    function c(x) {
      switch (x.op) {
        case 'var': { if (!idx.has(x.name)) throw new Error('variable ' + x.name + ' is not in the list ' + vs.join(', ')); const s = idx.get(x.name); return (m) => (m >> s) & 1; }
        case 'const': { const v = x.v; return () => v; }
        case 'not': { const f = c(x.a); return (m) => 1 - f(m); }
        case 'and': { const fs = x.args.map(c); return (m) => { for (const f of fs) if (!f(m)) return 0; return 1; }; }
        case 'or': { const fs = x.args.map(c); return (m) => { for (const f of fs) if (f(m)) return 1; return 0; }; }
        case 'xor': { const fs = x.args.map(c); return (m) => fs.reduce((s, f) => s ^ f(m), 0); }
      }
      throw new Error('bad node');
    }
    return c(e);
  }
  B.compile = compile;
  /** an assignment object for minterm m over vars */
  B.env = (m, vs) => Object.fromEntries(vs.map((v, i) => [v, (m >> (vs.length - 1 - i)) & 1]));
  B.bits = (m, n) => (n ? m.toString(2).padStart(n, '0') : '');

  // ---- tree surgery --------------------------------------------------------------------------------------------------
  // A path is a list of child indexes from the root; the child of a NOT is index 0.
  const kids = (e) => (e.op === 'not' ? [e.a] : e.args || []);
  B.kids = kids;
  function at(e, path) {
    let x = e;
    for (const i of path || []) { const k = kids(x); if (i < 0 || i >= k.length) return null; x = k[i]; }
    return x;
  }
  B.at = (e, path) => at(P(e), path);
  /** a new tree with the subterm at path replaced (the rest shared, not copied) */
  function replaceAt(e, path, sub) {
    if (!path.length) return sub;
    const [i, ...rest] = path;
    if (e.op === 'not') return NOT(replaceAt(e.a, rest, sub));
    const args = e.args.slice();
    args[i] = replaceAt(args[i], rest, sub);
    return { op: e.op, args };
  }
  B.replaceAt = replaceAt;
  /** every subterm with its path, in preorder */
  function paths(e) {
    const out = [];
    (function walk(x, p) { out.push({ path: p, node: x }); kids(x).forEach((k, i) => walk(k, p.concat(i))); })(P(e), []);
    return out;
  }
  B.paths = paths;
  /** the expression tree for drawing: {id, path, op, label, text, children} */
  B.tree = (e, style) => {
    e = P(e);
    const LBL = { and: 'AND', or: 'OR', xor: 'XOR', not: 'NOT' };
    return (function walk(x, p) {
      return { id: p.join('.') || 'root', path: p, op: x.op, label: x.op === 'var' ? x.name : x.op === 'const' ? String(x.v) : LBL[x.op], text: toString(x, style), children: kids(x).map((k, i) => walk(k, p.concat(i))) };
    })(e, []);
  };
  /** number of variable occurrences */
  B.literals = (e) => { let n = 0; (function w(x) { if (x.op === 'var') n++; else kids(x).forEach(w); })(P(e)); return n; };
  B.size = (e) => { let n = 0; (function w(x) { n++; kids(x).forEach(w); })(P(e)); return n; };
  B.depth = (e) => (function d(x) { const k = kids(x); return k.length ? 1 + Math.max(...k.map(d)) : 0; })(P(e));

  // ---- dual and complement of an expression ---------------------------------------------------------------------------
  /** the dual: AND and OR swapped, 0 and 1 swapped, variables unchanged (XOR becomes XNOR for an even count) */
  function dualExpr(e) {
    e = P(e);
    switch (e.op) {
      case 'var': return V(e.name);
      case 'const': return C(1 - e.v);
      case 'not': return NOT(dualExpr(e.a));
      case 'and': return { op: 'or', args: e.args.map(dualExpr) };
      case 'or': return { op: 'and', args: e.args.map(dualExpr) };
      case 'xor': { const x = { op: 'xor', args: e.args.map(dualExpr) }; return e.args.length % 2 ? x : NOT(x); }
    }
    throw new Error('bad node');
  }
  B.dualExpr = dualExpr;
  /**
   * the complement pushed down to the literals by De Morgan's law, traced:
   * {expr, trace:[{kind:'complement-start'|'demorgan'|'involution'|'const'|'xor', say, ...}]}
   */
  function complementExpr(e, style) {
    e = P(e);
    const trace = [{ kind: 'complement-start', expr: NOT(clone(e)), say: 'Start from the complement of the whole expression: (' + toString(e, style) + ")'." }];
    function neg(x) {
      switch (x.op) {
        case 'var': return NOT(V(x.name));
        case 'const': trace.push({ kind: 'const', from: x.v, say: 'The complement of ' + x.v + ' is ' + (1 - x.v) + '.' }); return C(1 - x.v);
        case 'not': trace.push({ kind: 'involution', expr: clone(x.a), say: 'The complement of ' + toString(x, style) + ' is ' + toString(x.a, style) + ' (involution).' }); return clone(x.a);
        case 'and': case 'or': {
          const other = x.op === 'and' ? 'or' : 'and';
          const r = { op: other, args: x.args.map(neg) };
          trace.push({ kind: 'demorgan', from: clone(x), to: r, say: "De Morgan: (" + toString(x, style) + ")' becomes " + (x.op === 'and' ? 'the OR' : 'the AND') + ' of the complements, ' + toString(r, style) + '.' });
          return r;
        }
        case 'xor': {
          const r = { op: 'xor', args: [neg(x.args[0])].concat(x.args.slice(1).map(clone)) };
          trace.push({ kind: 'xor', from: clone(x), to: r, say: 'Complementing one input of an XOR complements it: (' + toString(x, style) + ")' = " + toString(r, style) + '.' });
          return r;
        }
      }
      throw new Error('bad node');
    }
    const out = neg(e);
    trace.push({ kind: 'complement-done', expr: out, say: "So F' = " + toString(out, style) + '.' });
    return { expr: out, trace };
  }
  B.complementExpr = complementExpr;
})(globalThis.Sirkit = globalThis.Sirkit || {});
