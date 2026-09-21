// Checking exercise answers. S.Check.answer(exercise, answer) -> {ok, message, counterexample?, details?, cells?}
// runs the checker of the exercise's kind. Each kind and the fields an exercise of that kind has:
//
//   choice    options: [..], answer: index | [indexes] (several right). Answer: index or [indexes].
//   string    answer: 'text' | ['text', ...], or accept(text) -> true | false | 'why not' | {ok, why};
//             set: true compares as sets {a, b}; caseless: true; placeholder (the empty box's hint).
//   number    answer, tolerance. Answer: a number (or its text).
//   set       answer: '{a, b}' | '(1, 2), (2, 3)' | '{{a, b}, {c}}' (or several), or accept(value, canonical).
//   expr      ref: an expression ("A'B + C"), vars (the variables allowed, in order, else those of ref; a
//             declared name of several letters such as EN is one variable), dc: [row numbers over vars, MSB
//             first] (don't-cares: either value is right there), maxLiterals, form: 'sop' | 'pos' (the answer
//             must be written that way). Answer: an expression; checked on every row of the truth table that is
//             not a don't-care, with the first row that differs as the counterexample.
//   table     table: 'truth' (expr or outputs, vars) | 'custom' (rows, cols, cells) | a kind registered in
//             S.Check.tables. Answer: {key: text}. Checked cell by cell.                         check-table.js
// Every kind, with all its fields, is listed in src/app/check-index.js (the reference for content writers).
// More kinds register as S.Check.kinds.name = { check(x, answer) -> result }.
// Every exercise also has solution (an answer that must pass), wrong: [answers that must fail] and hints.
(function (S) {
  'use strict';
  const K = (S.Check = S.Check || {});
  K.kinds = K.kinds || {};

  const show = (w) => (w === '' ? 'ε' : w);
  K.show = show;
  K.plural = (n, w, ws) => n + ' ' + (n === 1 ? w : ws || w + 's');
  /** The alphabet of an exercise as a list of symbols ('ab' or ['a', 'b']) */
  K.alphabet = (a) => (!a ? null : Array.isArray(a) ? a.slice() : [...String(a)].filter((c) => !/[\s,]/.test(c)));

  K.answer = function (x, a) {
    const kind = K.kinds[x.kind];
    if (!kind) return { ok: false, message: 'This exercise has an unknown kind, ' + x.kind + '.' };
    try { return kind.check(x, a); } catch (e) { return { ok: false, message: 'Your answer could not be checked: ' + (e.message || e) + '.' }; }
  };
  /** Is the answer empty (nothing typed or chosen)? */
  K.blank = (a) => a === undefined || a === null || (typeof a === 'string' && !a.trim()) || (Array.isArray(a) && !a.length);

  // ---- multiple choice ---------------------------------------------------------------------------------
  K.kinds.choice = {
    check(x, a) {
      const want = [].concat(x.answer).map(Number).sort();
      const got = [].concat(a === undefined || a === null ? [] : a).map(Number).sort();
      if (!got.length) return { ok: false, message: 'Choose ' + (want.length > 1 ? 'the right options' : 'an option') + ' first.' };
      if (want.length === got.length && want.every((v, i) => v === got[i])) return { ok: true, message: 'Right.' + (x.why ? ' ' + x.why : '') };
      if (want.length > 1) {
        const right = got.filter((v) => want.includes(v)).length;
        return { ok: false, message: 'Not quite: ' + right + ' of your choices ' + (right === 1 ? 'is' : 'are') + ' right, and ' + K.plural(want.length, 'option is', 'options are') + ' right in all.' };
      }
      const why = x.whyNot && x.whyNot[got[0]];
      return { ok: false, message: 'Not quite.' + (why ? ' ' + why : '') };
    },
  };

  // ---- a string or a number ------------------------------------------------------------------------------
  const norm = (s, x) => {
    let t = String(s === undefined || s === null ? '' : s).trim().replace(/\s+/g, ' ');
    if (/^(eps|epsilon|ε|λ)$/i.test(t) || t === '""') t = 'ε';
    if (x.caseless) t = t.toLowerCase();
    return t;
  };
  const asSet = (s) => String(s).replace(/^\s*\{|\}\s*$/g, '').split(/[\s,]+/).filter(Boolean).map((v) => (/^(eps|epsilon|λ)$/i.test(v) ? 'ε' : v)).filter((v) => v !== '∅').sort();
  K.asSet = asSet;
  /** What an accept hook said, as a result: true, false, a sentence saying why not, or {ok, why} */
  K.accepted = function (x, r) {
    if (r && typeof r === 'object') return r.ok ? { ok: true, message: 'Right.' + (r.why ? ' ' + r.why : x.why ? ' ' + x.why : '') } : { ok: false, message: r.why || (x.whyNot ? x.whyNot : 'Not quite.') };
    if (typeof r === 'string') return { ok: false, message: r };
    return r ? { ok: true, message: 'Right.' + (x.why ? ' ' + x.why : '') } : { ok: false, message: x.whyNot ? x.whyNot : 'Not quite.' };
  };
  K.kinds.string = {
    check(x, a) {
      if (K.blank(a)) return { ok: false, message: 'Type an answer first (ε for the empty string).' };
      let ok;
      if (x.accept) return K.accepted(x, x.accept(norm(a, x) === 'ε' ? '' : norm(a, x)));
      else if (x.set) { const g = asSet(a).join(','); ok = [].concat(x.answer).some((w) => asSet(w).join(',') === g); }
      else { const g = norm(a, x).replace(/\s/g, x.spaces ? ' ' : ''); ok = [].concat(x.answer).some((w) => norm(w, x).replace(/\s/g, x.spaces ? ' ' : '') === g); }
      return ok ? { ok: true, message: 'Right.' + (x.why ? ' ' + x.why : '') } : { ok: false, message: 'Not quite.' + (x.whyNot ? ' ' + x.whyNot : '') };
    },
  };
  K.kinds.number = {
    check(x, a) {
      if (K.blank(a)) return { ok: false, message: 'Type a number first.' };
      const v = typeof a === 'number' ? a : Number(String(a).trim().replace(/,/g, ''));
      if (!Number.isFinite(v)) return { ok: false, message: String(a).trim() + ' is not a number.' };
      const ok = Math.abs(v - x.answer) <= (x.tolerance || 0);
      return ok ? { ok: true, message: 'Right.' + (x.why ? ' ' + x.why : '') } : { ok: false, message: 'Not quite' + (x.higherLower ? (v < x.answer ? ': it is more than ' + v : ': it is less than ' + v) : '') + '.' };
    },
  };


  // ---- sets, pairs, tuples and partitions -------------------------------------------------------------------
  /**
   * Read set notation: {a, b}, (1, 2) and ⟨1, 2⟩ for tuples, a-b (or a→b) for a pair, ∅ or {} for the empty
   * set, and sets of these at any depth, so a partition is {{a, b}, {c}}. Items are separated by commas (or
   * spaces). Several items with no braces round them are read as a set: (a,b), (b,c) is a relation.
   * Returns {v} with v = {t: 'set'|'tuple', items} or {t: 'atom', v}, or {error: 'a sentence'}.
   */
  K.parseValue = function (text, opts) {
    opts = opts || {};
    const src = String(text === undefined || text === null ? '' : text).trim();
    if (!src) return { error: 'The answer is empty.' };
    const OPEN = { '{': '}', '(': ')', '[': ']', '⟨': '⟩', '<': '>' };
    const CLOSE = new Set(Object.values(OPEN));
    let i = 0;
    const atom = (raw) => {
      let a = raw.trim().replace(/^["']|["']$/g, '');
      if (/^(eps|epsilon|λ|ε|"")$/i.test(a)) a = 'ε';
      if (a === '∅') return { t: 'set', items: [] };
      const pair = opts.dash !== false && /^([^\s\-→]+)\s*(?:-|→|->)\s*([^\s\-→>]+)$/.exec(a);
      if (pair) return { t: 'tuple', items: [{ t: 'atom', v: pair[1] }, { t: 'atom', v: pair[2] }] };
      return { t: 'atom', v: a };
    };
    function list(close) {
      const items = [];
      let cur = '';
      const flush = () => { if (cur.trim()) for (const w of cur.trim().split(/\s+(?![-→]|->)(?<![-→]\s*|->\s*)/)) if (w) items.push(atom(w)); cur = ''; };
      while (i < src.length) {
        const c = src[i];
        if (OPEN[c] && !(c === '<' && src[i + 1] === '-')) {
          if (cur.trim()) throw new Error('"' + cur.trim() + c + '" needs a comma before the ' + c);
          i++;
          const inner = list(OPEN[c]);
          items.push({ t: c === '{' ? 'set' : 'tuple', items: inner });
          continue;
        }
        if (CLOSE.has(c) && !(c === '>' && (src[i - 1] === '-'))) {
          if (c !== close) throw new Error(close ? 'a ' + c + ' closes what was opened with the bracket that needs ' + close : 'there is a ' + c + ' with nothing to close');
          flush(); i++; return items;
        }
        if (c === ',' || c === ';') { flush(); i++; continue; }
        cur += c; i++;
      }
      if (close) throw new Error('a bracket is opened but never closed: add ' + close);
      flush();
      return items;
    }
    try {
      const top = list(null);
      if (!top.length) return { error: 'There is nothing between the brackets to read; write ∅ or {} for the empty set.' };
      return { v: top.length === 1 && !opts.topSet ? top[0] : { t: 'set', items: top } };
    } catch (e) { return { error: 'This cannot be read: ' + e.message + '.' }; }
  };
  /** A value in one canonical text: sets sorted with repeats dropped, tuples in their order */
  K.canonValue = function canon(v, caseless) {
    if (v.t === 'atom') return caseless ? v.v.toLowerCase() : v.v;
    const parts = v.items.map((x) => canon(x, caseless));
    if (v.t === 'tuple') return '(' + parts.join(',') + ')';
    return '{' + [...new Set(parts)].sort().join(',') + '}';
  };
  const asTop = (v) => (v.t === 'set' ? v : { t: 'set', items: [v] });
  K.kinds.set = {
    check(x, a) {
      if (K.blank(a)) return { ok: false, message: 'Type an answer first, like {a, b}, (1, 2) or {{a, b}, {c}}.' };
      const got = K.parseValue(a, x);
      if (got.error) return { ok: false, message: got.error };
      if (x.accept) return K.accepted(x, x.accept(got.v, K.canonValue(got.v)));
      const g = K.canonValue(got.v, x.caseless);
      const wants = [].concat(x.answer).map((w) => K.parseValue(w, x)).filter((w) => !w.error).map((w) => w.v);
      if (wants.some((w) => K.canonValue(w, x.caseless) === g)) return { ok: true, message: 'Right.' + (x.why ? ' ' + x.why : '') };
      // say how far off, without giving the answer away
      const w = wants[0];
      if (!w) return { ok: false, message: 'The exercise has no readable answer.' };
      if (w.t === 'tuple') {
        const same = got.v.t === 'tuple' && K.canonValue({ t: 'set', items: got.v.items }) === K.canonValue({ t: 'set', items: w.items });
        return { ok: false, message: same ? 'Not quite: the parts are right, but in a tuple their order matters.' : 'Not quite.' + (x.whyNot ? ' ' + x.whyNot : '') };
      }
      const A = new Set(asTop(w).items.map((v) => K.canonValue(v, x.caseless))), B = new Set(asTop(got.v).items.map((v) => K.canonValue(v, x.caseless)));
      const missing = [...A].filter((v) => !B.has(v)).length, extra = [...B].filter((v) => !A.has(v)).length;
      const thing = w.t === 'set' && w.items.length && w.items.every((v) => v.t === 'set') ? ['block', 'blocks'] : w.t === 'set' && w.items.length && w.items.every((v) => v.t === 'tuple') ? ['pair', 'pairs'] : ['element', 'elements'];
      const bits = [];
      if (missing) bits.push(K.plural(missing, thing[0], thing[1]) + (missing === 1 ? ' is' : ' are') + ' missing');
      if (extra) bits.push(K.plural(extra, thing[0], thing[1]) + (extra === 1 ? ' does' : ' do') + ' not belong');
      return { ok: false, message: 'Not quite' + (bits.length ? ': ' + bits.join(', and ') : '') + '.', details: x.whyNot ? [x.whyNot] : [] };
    },
  };

  // ---- a Boolean expression ---------------------------------------------------------------------------------
  /** literals in an expression: each variable occurrence counts once */
  K.literals = (e) => (e.op === 'var' ? 1 : e.op === 'const' ? 0 : e.op === 'not' ? K.literals(e.a) : e.args.reduce((n, x) => n + K.literals(x), 0));
  const isSop = (e) => { const lit = (x) => x.op === 'var' || x.op === 'const' || (x.op === 'not' && x.a.op === 'var'); const term = (x) => lit(x) || (x.op === 'and' && x.args.every(lit)); return term(e) || (e.op === 'or' && e.args.every(term)); };
  const isPos = (e) => { const lit = (x) => x.op === 'var' || x.op === 'const' || (x.op === 'not' && x.a.op === 'var'); const term = (x) => lit(x) || (x.op === 'or' && x.args.every(lit)); return term(e) || (e.op === 'and' && e.args.every(term)); };
  K.kinds.expr = {
    check(x, a) {
      if (K.blank(a)) return { ok: false, message: "Type an expression first, like A'B + C." };
      const N = S.Netlist, B = S.Bool;
      // declared variables may have several letters (EN, QD): the parser keeps them whole
      const parse = (t) => (B && B.parse ? B.parse(String(t), x.vars ? { vars: x.vars } : {}) : N.parse(String(t)));
      const varsOf = (e) => [...N.vars(e)];
      let got, ref;
      try { got = parse(a); } catch (e) { return { ok: false, message: 'This cannot be read: ' + String(e.message).replace(/\.$/, '') + '.' }; }
      ref = parse(x.ref);
      const vars = x.vars || varsOf(ref).sort();
      const dc = new Set((x.dc || []).map(Number));
      const extra = varsOf(got).filter((v) => !vars.includes(v));
      if (extra.length) return { ok: false, message: 'Your expression uses ' + extra.join(', ') + ', which ' + (extra.length === 1 ? 'is' : 'are') + ' not among the variables ' + vars.join(', ') + '.' };
      const n = vars.length;
      for (let m = 0; m < 1 << n; m++) {
        if (dc.has(m)) continue;
        const env = {};
        vars.forEach((v, i) => { env[v] = (m >> (n - 1 - i)) & 1; });
        const want = N.evaluate(ref, env), have = N.evaluate(got, env);
        if (want !== have) {
          const row = vars.map((v) => v + ' = ' + env[v]).join(', ');
          return { ok: false, message: 'Not quite: at ' + row + ' the function is ' + want + ' but your expression gives ' + have + '.', counterexample: row };
        }
      }
      if (x.form === 'sop' && !isSop(got)) return { ok: false, message: 'It has the right value everywhere, but it is not written as a sum of products.' };
      if (x.form === 'pos' && !isPos(got)) return { ok: false, message: 'It has the right value everywhere, but it is not written as a product of sums.' };
      const lits = K.literals(got);
      if (x.maxLiterals && lits > x.maxLiterals) return { ok: false, message: 'It has the right value everywhere, with ' + K.plural(lits, 'literal') + '; it can be done with ' + x.maxLiterals + '.' };
      return { ok: true, message: 'Right: it agrees with the function on all ' + ((1 << n) - dc.size) + ' rows' + (dc.size ? ' that are not don\'t-cares' : '') + (x.maxLiterals ? ', with ' + K.plural(lits, 'literal') : '') + '.' + (x.why ? ' ' + x.why : '') };
    },
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
