// Boolean-function exercises: K-map covers, Quine–McCluskey tables, algebra proofs, simplification, number
// conversions and codes, and truth tables. The engines (Sirkit.Bool and Bool.Numbers) decide; these turn their
// answers into a verdict with the reason. Fields of each kind: src/app/check-index.js.
(function (S) {
  'use strict';
  const K = (S.Check = S.Check || {});
  K.kinds = K.kinds || {};
  K.tables = K.tables || {};
  const B = () => S.Bool;
  const plural = (n, w, ws) => n + ' ' + (n === 1 ? w : ws || w + 's');

  /** the function of an exercise: fn {vars, ones, dc}, or minterms / maxterms (+ dc) over vars, or expr over vars */
  K.fnOf = function (x) {
    const Bo = B();
    const vo = x.vars ? { vars: x.vars } : {};
    if (x.fn) return Bo.asFn(typeof x.fn === 'string' ? Bo.fromExpr(Bo.parse(x.fn, vo), x.vars) : x.fn);
    if (x.minterms) return Bo.fromMinterms(x.vars, x.minterms, x.dc || []);
    if (x.maxterms) return Bo.fromMaxterms(x.vars, x.maxterms, x.dc || []);
    const e = Bo.parse(x.expr || x.ref, vo);
    const fn = Bo.fromExpr(e, x.vars || [...Bo.vars(e)].sort());
    if (x.dc) for (const m of x.dc) { fn.ones.delete(m); fn.dc.add(m); }
    return fn;
  };
  /** one group or term as a cube: '1-0-', a list of cells [0, 2], or a term (A'C for SOP, (A + C') for POS) */
  K.cubeOf = function (t, vars, form) {
    const Bo = B(), n = vars.length;
    if (Array.isArray(t)) { const c = Bo.spanCube(t, n); return Bo.cubeSize(c) === t.length ? c : { cells: t }; }
    const s = String(t).trim();
    if (new RegExp('^[01-]{' + n + '}$').test(s)) return Bo.cubeFromStr(s);
    if (/^[\d\s,]+$/.test(s)) return K.cubeOf(s.split(/[\s,]+/).filter(Boolean).map(Number), vars, form);
    let e;
    try { e = Bo.parse(s, { vars }); } catch (err) { throw new Error('"' + s + '" cannot be read: ' + err.message); }
    const c = Bo.termCube(e, vars, form || 'sop');
    if (!c || c === 'empty') throw new Error('"' + s + '" is not a single ' + (form === 'pos' ? 'sum term' : 'product term') + ' over ' + vars.join(', '));
    return c;
  };
  const listOf = (a) => (Array.isArray(a) ? a : String(a || '').split(/[\n;]+|,(?![^()]*\))/).map((t) => t.trim()).filter(Boolean));

  // ---- K-map covers -----------------------------------------------------------------------------------------------
  K.kinds.kmap = {
    check(x, a) {
      const Bo = B(), fn = K.fnOf(x), form = x.form || 'sop';
      const groups = listOf(a);
      if (!groups.length) return { ok: false, message: 'Circle at least one group first.' };
      let cells;
      try { cells = groups.map((g) => { const c = K.cubeOf(g, fn.vars, form); return c.cells || Bo.cubeMinterms(c); }); } catch (e) { return { ok: false, message: e.message + '.' }; }
      const r = Bo.checkCover(fn, cells, { form });
      if (x.hazardFree && (r.verdict === 'minimal' || r.verdict === 'not-minimal')) return hazardVerdict(x, fn, form, r);
      if (r.verdict === 'minimal') return { ok: true, message: 'Right. ' + r.say + (x.why ? ' ' + x.why : ''), detail: r };
      if (r.verdict === 'not-minimal') {
        if (x.allowNotMinimal) return { ok: true, message: 'Right: the cover is correct. ' + r.say, detail: r };
        return { ok: false, message: r.say.replace(/^Correct, but/, 'The cover is correct, but'), detail: r };
      }
      return { ok: false, message: 'Not quite. ' + r.say.replace(/^Wrong: /, '').replace(/^./, (c) => c.toUpperCase()), detail: r };
    },
  };

  /** a correct cover under hazardFree: every pair of neighbouring 1s (0s for POS) in one group, and no bigger than
   *  the cheapest such cover (Bool.hazardFree) unless allowNotMinimal */
  function hazardVerdict(x, fn, form, r) {
    const Bo = B(), pos = form === 'pos', val = pos ? '0' : '1', n = fn.vars.length;
    const hz = Bo.staticHazards(fn, r.checks.map((c) => c.cube), form).hazards;
    if (hz.length) {
      const h = hz[0];
      return { ok: false, detail: r, hazards: hz,
        message: 'The cover is correct, but it has a static-' + val + ' hazard: cells ' + h.from + ' (' + Bo.bits(h.from, n) + ') and ' + h.to + ' (' + Bo.bits(h.to, n) + ') are neighbouring ' + val + 's, only ' + h.var + ' changes between them, and no single group holds both' + (hz.length > 1 ? ' (one of ' + hz.length + ' such pairs)' : '') + '. Add the consensus term ' + h.fix.text + ' to bridge them.' };
    }
    const best = Bo.hazardFree(fn, form);
    const say = 'F = ' + Bo.toString(r.expr) + ' (' + plural(r.cost.terms, 'term') + ', ' + plural(r.cost.literals, 'literal') + ')';
    if (Bo.betterCost(best.cost, r.cost) && !x.allowNotMinimal) {
      return { ok: false, detail: r, message: 'It is hazard-free, but bigger than it needs to be: your cover has ' + plural(r.cost.terms, 'term') + ' and ' + plural(r.cost.literals, 'literal') + '; ' + best.text + ' is hazard-free with ' + best.cost.terms + ' and ' + best.cost.literals + '.' };
    }
    return { ok: true, detail: r, message: 'Right: hazard-free, ' + say + '. Every pair of neighbouring ' + val + 's lies inside one group, so no single input change can make the output glitch.' + (x.why ? ' ' + x.why : '') };
  }

  // ---- Quine–McCluskey ------------------------------------------------------------------------------------------
  const termText = (c, fn, form) => B().term(c, fn.vars, form).text;
  K.kinds.qm = {
    check(x, a) {
      const Bo = B(), fn = K.fnOf(x), form = x.form || 'sop', ask = x.ask || 'primes';
      if (ask === 'chart') return K.kinds.table.check(Object.assign({}, x, { table: 'qmchart' }), a);
      const items = listOf(a);
      if (!items.length) return { ok: false, message: 'List the ' + (ask === 'primes' ? 'prime implicants' : ask === 'essentials' ? 'essential prime implicants' : 'terms of a minimal cover') + ' first.' };
      let got;
      try { got = items.map((t) => K.cubeOf(t, fn.vars, form)); } catch (e) { return { ok: false, message: e.message + '.' }; }
      if (got.some((c) => c.cells)) return { ok: false, message: 'Each entry must be one term: a set of cells that is not a cube cannot be a term.' };
      const tab = Bo.tabulate(fn, form);
      const primes = tab.primes;
      const pk = new Set(primes.map((p) => Bo.cubeKey(p.cube)));
      const gk = got.map((c) => Bo.cubeKey(c));
      if (new Set(gk).size !== gk.length) return { ok: false, message: 'A term appears twice in your list.' };
      const target = new Set(form === 'pos' ? Bo.zeros(fn).concat([...fn.dc]) : [...fn.ones, ...fn.dc]);
      for (const c of got) {
        if (!pk.has(Bo.cubeKey(c))) {
          const t = termText(c, fn, form);
          const bad = Bo.cubeMinterms(c).filter((m) => !target.has(m));
          if (bad.length) return { ok: false, message: t + ' is not an implicant: it covers ' + (form === 'pos' ? 'maxterm' : 'minterm') + ' ' + bad[0] + ', where the function is ' + (form === 'pos' ? '1' : '0') + '.' };
          const big = primes.find((p) => Bo.cubeMinterms(c).every((m) => p.minterms.includes(m)));
          return { ok: false, message: t + ' is an implicant but not prime: it merges into ' + (big ? big.text + ' (' + big.str + ')' : 'a bigger term') + '.' };
        }
      }
      if (ask === 'primes') {
        const need = primes.filter((p) => !(x.dcOnly === false && p.dcOnly));
        const missing = need.filter((p) => !gk.includes(Bo.cubeKey(p.cube)) && !p.dcOnly);
        if (missing.length) return { ok: false, message: 'Not quite: ' + plural(missing.length, 'prime implicant is', 'prime implicants are') + ' missing. Every term left without a check mark in the last column of its merging is prime.' };
        return { ok: true, message: 'Right: the ' + plural(need.filter((p) => !p.dcOnly).length, 'prime implicant') + ' are ' + need.filter((p) => !p.dcOnly).map((p) => p.text).join(', ') + '.' };
      }
      const best = Bo.minimise(fn, { form, method: 'qm' });
      if (ask === 'essentials') {
        const ek = (best.essentials || []).map((p) => Bo.cubeKey(p.cube || p));
        const extra = gk.filter((k) => !ek.includes(k)), miss = ek.filter((k) => !gk.includes(k));
        if (extra.length) { const p = primes.find((q) => Bo.cubeKey(q.cube) === extra[0]); return { ok: false, message: 'Not quite: ' + p.text + ' is prime but not essential: every ' + (form === 'pos' ? 'maxterm' : 'minterm') + ' it covers is covered by another prime too.' }; }
        if (miss.length) return { ok: false, message: 'Not quite: ' + plural(miss.length, 'essential prime implicant is', 'essential prime implicants are') + ' missing. Look for a column of the chart with a single mark.' };
        return { ok: true, message: 'Right: the essential prime implicants are ' + (ek.length ? got.map((c) => termText(c, fn, form)).join(', ') : 'none') + '.' };
      }
      // a minimal cover
      const r = Bo.checkCover(fn, got.map((c) => Bo.cubeMinterms(c)), { form });
      if (r.verdict === 'minimal') return { ok: true, message: 'Right. ' + r.say };
      return { ok: false, message: 'Not quite. ' + r.say.replace(/^Wrong: /, '').replace(/^Correct, but/, 'The terms cover the function, but') };
    },
  };
  /** the prime implicant chart: a row per prime (P1: A'C), a column per minterm; an X where the prime covers it */
  K.tables.qmchart = (x) => {
    const Bo = B(), fn = K.fnOf(x), form = x.form || 'sop';
    const primes = Bo.tabulate(fn, form).primes.filter((p) => !p.dcOnly);
    const cols = (form === 'pos' ? Bo.zeros(fn) : Bo.minterms(fn)).map(String);
    const rows = primes.map((p) => p.label + ': ' + p.text);
    const expected = {};
    primes.forEach((p, r) => cols.forEach((m) => { expected[rows[r] + '|' + m] = p.minterms.includes(+m) ? 'X' : ''; }));
    return { rows, cols, corner: 'prime \\ ' + (form === 'pos' ? 'M' : 'm'), cell: (r, c) => rows[r] + '|' + cols[c], expected, kind: 'text' };
  };

  // ---- algebra proofs -------------------------------------------------------------------------------------------------
  /** a key that ignores the order of operands and the bracketing of a chain (commutative and associative laws) */
  const acKey = (e) => {
    if (e.op === 'var') return e.name;
    if (e.op === 'const') return String(e.v);
    if (e.op === 'not') return '~' + acKey(e.a);
    const flat = [];
    const walk = (y) => { if (y.op === e.op && y.args) y.args.forEach(walk); else flat.push(acKey(y)); };
    e.args.forEach(walk);
    return e.op + '(' + flat.sort().join(',') + ')';
  };
  K.acKey = (e) => acKey(B().parse(typeof e === 'string' ? e : B().toString(e)));
  const lawOf = (name) => {
    if (!name) return null;
    const n = String(name).trim().toLowerCase().replace(/[’']/g, "'");
    const L = B().laws;
    return L.find((l) => l.id === n) || L.find((l) => l.name.toLowerCase() === n) || L.find((l) => l.name.toLowerCase().startsWith(n)) || L.find((l) => l.id.startsWith(n.replace(/\s+/g, '-'))) || 'unknown';
  };
  /** the steps of a proof: [{expr, law}] or lines "expr ; law" (the law may be left out) */
  K.proofSteps = (a) => (Array.isArray(a) ? a.map((s) => (typeof s === 'string' ? { expr: s } : s)) : String(a || '').split('\n').map((l) => l.trim().replace(/^=\s*/, '')).filter(Boolean).map((l) => { const m = /^(.*?)\s*(?:;|\[)\s*([^\]]*)\]?\s*$/.exec(l); return m ? { expr: m[1], law: m[2] } : { expr: l }; }));
  K.kinds.proof = {
    check(x, a) {
      const Bo = B();
      const steps = K.proofSteps(a).filter((s) => s.expr && String(s.expr).trim());
      if (!steps.length) return { ok: false, message: 'Add a step first: the expression after it, and the law that gives it.' };
      let prev = Bo.parse(x.start);
      const allowed = x.laws ? x.laws.map((l) => lawOf(l)).filter((l) => l && l !== 'unknown').map((l) => l.id) : null;
      if (x.maxSteps && steps.length > x.maxSteps) return { ok: false, message: 'The proof has ' + plural(steps.length, 'step') + '; this exercise allows ' + x.maxSteps + '.' };
      for (let i = 0; i < steps.length; i++) {
        const st = steps[i], at = 'Step ' + (i + 1) + ': ';
        let cur;
        try { cur = Bo.parse(String(st.expr)); } catch (e) { return { ok: false, message: at + '"' + st.expr + '" cannot be read: ' + e.message + '.', detail: { step: i } }; }
        const pr = Bo.prove(prev, cur);
        if (!pr.equal) return { ok: false, message: at + Bo.toString(cur) + ' is not equal to ' + Bo.toString(prev) + (pr.counterexample ? ': they differ at ' + Object.entries(pr.counterexample.env || pr.counterexample).filter(([k]) => /^[A-Za-z]\w*$/.test(k)).map(([k, v]) => k + ' = ' + v).join(', ') : '') + '.', detail: { step: i } };
        const law = lawOf(st.law);
        if (law === 'unknown') return { ok: false, message: at + 'there is no law called "' + st.law + '". The laws: ' + Bo.laws.map((l) => l.name).join(', ') + '.', detail: { step: i } };
        if (law && allowed && !allowed.includes(law.id) && !['commutative', 'associative'].includes(law.id)) return { ok: false, message: at + 'this exercise does not allow ' + law.name + '; use ' + allowed.map((id) => Bo.lawById(id).name).join(', ') + '.', detail: { step: i } };
        const want = acKey(cur);
        if (acKey(prev) !== want) {
          const laws = law ? [law.id] : allowed || undefined;
          const mv = Bo.moves(prev, laws ? { laws } : {});
          if (!mv.some((m) => acKey(m.expr) === want)) {
            const any = law ? Bo.moves(prev, allowed ? { laws: allowed } : {}).find((m) => acKey(m.expr) === want) : null;
            return { ok: false, message: at + Bo.toString(cur) + ' is equal to the line before, but ' + (law ? law.name + ' does not give it in one step' + (any ? ' (' + Bo.lawById(any.law).name + ' does)' : '') : 'no single law gives it') + '. Take smaller steps.', detail: { step: i } };
          }
        }
        prev = cur;
      }
      if (x.goal && acKey(prev) !== acKey(Bo.parse(x.goal))) return { ok: false, message: 'Every step is right, but the proof stops at ' + Bo.toString(prev) + ' and has not reached ' + x.goal + ' yet.' };
      const lits = Bo.literals(prev);
      if (x.maxLiterals && lits > x.maxLiterals) return { ok: false, message: 'Every step is right, but ' + Bo.toString(prev) + ' still has ' + plural(lits, 'literal') + '; keep going until it has ' + x.maxLiterals + '.' };
      return { ok: true, message: 'Right: every one of the ' + plural(steps.length, 'step') + ' follows by its law' + (x.goal ? ', reaching ' + x.goal : ', ending with ' + plural(lits, 'literal')) + '.' + (x.why ? ' ' + x.why : '') };
    },
  };

  // ---- simplify ------------------------------------------------------------------------------------------------
  const isSop = (e) => { const lit = (y) => y.op === 'var' || y.op === 'const' || (y.op === 'not' && y.a.op === 'var'); const term = (y) => lit(y) || (y.op === 'and' && y.args.every(lit)); return term(e) || (e.op === 'or' && e.args.every(term)); };
  const isPos = (e) => { const lit = (y) => y.op === 'var' || y.op === 'const' || (y.op === 'not' && y.a.op === 'var'); const term = (y) => lit(y) || (y.op === 'or' && y.args.every(lit)); return term(e) || (e.op === 'and' && e.args.every(term)); };
  const termsOf = (e, form) => (e.op === (form === 'pos' ? 'and' : 'or') ? e.args.length : 1);
  K.kinds.simplify = {
    check(x, a) {
      const Bo = B();
      if (K.blank(a)) return { ok: false, message: "Type an expression first, like A'B + C." };
      let e;
      try { e = Bo.parse(String(a), x.vars ? { vars: x.vars } : {}); } catch (err) { return { ok: false, message: 'This cannot be read: ' + err.message + '.' }; }
      const fn = K.fnOf(x);
      const extra = [...Bo.vars(e)].filter((v) => !fn.vars.includes(v));
      if (extra.length) return { ok: false, message: 'Your expression uses ' + extra.join(', ') + ', which ' + (extra.length === 1 ? 'is' : 'are') + ' not among the variables ' + fn.vars.join(', ') + '.' };
      const f = Bo.compile(e, fn.vars), n = fn.vars.length;
      for (let m = 0; m < 1 << n; m++) {
        if (fn.dc.has(m)) continue;
        const want = fn.ones.has(m) ? 1 : 0, got = f(m);
        if (want !== got) { const row = fn.vars.map((v, i) => v + ' = ' + ((m >> (n - 1 - i)) & 1)).join(', '); return { ok: false, message: 'Not quite: at ' + row + ' the function is ' + want + ' but your expression gives ' + got + '.', counterexample: row }; }
      }
      const form = x.form;
      if (form === 'sop' && !isSop(e)) return { ok: false, message: 'It has the right value everywhere, but it is not written as a sum of products.' };
      if (form === 'pos' && !isPos(e)) return { ok: false, message: 'It has the right value everywhere, but it is not written as a product of sums.' };
      const lits = Bo.literals(e), terms = termsOf(e, form);
      let maxL = x.maxLiterals, maxT = x.maxTerms;
      if (x.minimal) { const best = Bo.minimise(fn, { form: form || 'sop' }); maxL = Math.min(maxL || Infinity, best.cost.literals); maxT = Math.min(maxT || Infinity, best.cost.terms); }
      if (maxT && terms > maxT) return { ok: false, message: 'It has the right value everywhere, with ' + plural(terms, 'term') + '; it can be done with ' + maxT + '.' };
      if (maxL && lits > maxL) return { ok: false, message: 'It has the right value everywhere, with ' + plural(lits, 'literal') + '; it can be done with ' + maxL + '.' };
      return { ok: true, message: 'Right: it agrees with the function on every row' + (fn.dc.size ? ' that is not a don\'t-care' : '') + ', with ' + plural(lits, 'literal') + '.' + (x.why ? ' ' + x.why : '') };
    },
  };

  // ---- conversions and codes ------------------------------------------------------------------------------------
  const SUB = (n) => String(n).split('').map((d) => '₀₁₂₃₄₅₆₇₈₉'[+d]).join('');
  /** what a convert exercise expects: {result, say} */
  K.convertAnswer = function (x) {
    const Nm = B().Numbers, op = x.op || 'base';
    switch (op) {
      case 'base': { const r = Nm.convert(String(x.value), x.from, x.to, { fracDigits: x.fracDigits }); return { result: r.result, say: '(' + x.value + ')' + SUB(x.from) + ' = (' + r.result + ')' + SUB(x.to), trace: r.trace, digits: true }; }
      case 'complement': { const r = Nm.complement(String(x.value), x.base || 2, x.complement || 'r', { digits: x.digits }); return { result: r.result, say: 'the ' + (x.complement === 'r-1' ? (x.base || 2) - 1 : x.base || 2) + "'s complement of " + x.value + ' is ' + r.result, trace: r.trace, exact: true }; }
      case 'signed': { const r = Nm.encode(Number(x.value), x.bits, x.rep || '2s'); if (!r.ok) throw new Error(r.say || x.value + ' does not fit'); return { result: r.bits, say: x.value + ' in ' + x.bits + '-bit ' + ({ '2s': "two's complement", '1s': "one's complement", sm: 'signed magnitude' })[x.rep || '2s'] + ' is ' + r.bits, trace: r.trace, exact: true }; }
      case 'unsigned-value': case 'signed-value': { const r = Nm.decode(String(x.value), x.rep || '2s'); return { result: String(r.value), say: x.value + ' is ' + r.value, trace: r.trace, number: true }; }
      case 'code': { const r = Nm.encodeDecimal(x.value, x.code || 'bcd'); return { result: r.bits.join(''), say: x.value + ' in ' + (x.code || 'bcd').toUpperCase() + ' is ' + r.text, trace: r.trace, exact: true }; }
      case 'gray': { const r = x.to === 'binary' ? Nm.fromGray(String(x.value)) : Nm.toGray(String(x.value)); return { result: r.gray || r.binary, say: (x.to === 'binary' ? 'Gray ' + x.value + ' is binary ' + r.binary : 'binary ' + x.value + ' is Gray ' + r.gray), trace: r.trace, exact: true }; }
      case 'hamming-encode': { const r = Nm.hamming.encode(String(x.value), { secded: x.secded }); return { result: r.code, say: 'the code word is ' + r.code, trace: r.trace, exact: true }; }
      case 'hamming-decode': {
        const r = Nm.hamming.decode(String(x.value), { secded: x.secded });
        const ask = x.ask || 'position';
        const res = ask === 'position' ? String(r.position || 0) : ask === 'data' ? r.data : ask === 'syndrome' ? String(r.syndrome) : r.corrected;
        return { result: res, say: ask === 'position' ? (r.position ? 'the error is at position ' + r.position : 'there is no single error (answer 0)') : 'the ' + ask + ' is ' + res, trace: r.trace, exact: ask !== 'position' && ask !== 'syndrome', number: ask === 'position' || ask === 'syndrome' };
      }
    }
    throw new Error('unknown conversion ' + op);
  };
  const normNum = (s, keepZeros) => { let t = String(s).replace(/[\s_]/g, '').toUpperCase().replace(/^\((.*)\)\D*\d*$/, '$1'); if (!keepZeros) t = t.replace(/^(-?)0+(?=[0-9A-Z])/, '$1').replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''); return t; };
  K.kinds.convert = {
    check(x, a) {
      const text = a && typeof a === 'object' ? a.result : a;
      if (K.blank(text)) return { ok: false, message: 'Type the result first.' };
      const want = K.convertAnswer(x);
      const g = normNum(text, want.exact), w = normNum(want.result, want.exact);
      if (g === w || (want.number && Number(g) === Number(w))) return { ok: true, message: 'Right: ' + want.say + '.' + (x.why ? ' ' + x.why : '') };
      if (want.exact && g.length !== w.length) return { ok: false, message: 'Not quite: the result has ' + plural(w.length, 'digit') + ' here, and yours has ' + g.length + '.' + (x.op === 'signed' ? ' Write all ' + x.bits + ' bits.' : '') };
      // where it first goes wrong, from the right for whole numbers
      const gi = g.split('.')[0], wi = w.split('.')[0];
      if (!want.number && gi.length === wi.length) {
        let k = 0; while (k < gi.length && gi[gi.length - 1 - k] === wi[wi.length - 1 - k]) k++;
        if (k < gi.length) return { ok: false, message: 'Not quite: ' + (k ? 'the last ' + (k === 1 ? 'digit is' : k + ' digits are') + ' right, but the digit ' + (k + 1) + ' places from the right is not.' : 'the last digit is already wrong.') + (x.op === 'base' ? ' Each remainder of the repeated division is one digit, the first remainder the last digit.' : '') };
        if (g !== w) return { ok: false, message: 'Not quite: the whole part is right, but the fraction is not. Each multiplication by ' + x.to + ' gives the next digit after the point.' };
      }
      if (!want.number && gi.length !== wi.length) return { ok: false, message: 'Not quite: the result has ' + plural(wi.length, 'digit') + ' before the point, and yours has ' + gi.length + '.' };
      const HOW = { 'hamming-decode': 'Recompute each parity check over the positions it covers; the checks that fail add up to the position of the wrong bit (0 when none fails).', 'signed-value': 'In two\'s complement the leftmost bit weighs minus its place value.', 'unsigned-value': 'Add the place value of every 1.' };
      return { ok: false, message: 'Not quite.' + (x.whyNot ? ' ' + x.whyNot : HOW[x.op] ? ' ' + HOW[x.op] : '') };
    },
  };

  // ---- truth tables ---------------------------------------------------------------------------------------------
  K.kinds.truthtable = { check: (x, a) => K.kinds.table.check(Object.assign({}, x, { table: x.table || 'truth' }), a) };
})(globalThis.Sirkit = globalThis.Sirkit || {});
