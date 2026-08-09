// The function workbench's view of the Boolean engine: Sirkit.Bool where it has what is asked for, and here
// the pieces it does not have yet: the laws of the algebra as rewrites for the proof game (each one either
// rewrites the chosen subterm or refuses with the reason), a hint that looks one or two moves ahead, static
// hazards read from a cover with their consensus fixes, and the cost of a circuit built in a given style.
(function (S) {
  'use strict';
  const F = S.FuncEng = {};
  const B = () => S.Bool;
  F.live = () => !!(S.Bool && S.Bool.parse && S.Bool.minimise && S.Bool.kmap);

  class Refuse extends Error {}
  F.Refuse = Refuse;
  const no = (msg) => { throw new Refuse(msg); };

  // ---- small tree helpers ---------------------------------------------------------------------------------
  const K = (e) => B().key(e);
  const C = (v) => ({ op: 'const', v });
  const NOT = (a) => ({ op: 'not', a });
  const mk = (op, args) => (args.length === 0 ? C(op === 'and' ? 1 : 0) : args.length === 1 ? args[0] : { op, args });
  const factors = (e, op) => (e.op === op ? e.args : [e]);
  const isNegOf = (a, b) => (a.op === 'not' && K(a.a) === K(b)) || (b.op === 'not' && K(b.a) === K(a));
  const other = (op) => (op === 'and' ? 'or' : 'and');
  const show = (e) => B().toString(e);
  const sym = (op) => (op === 'and' ? 'AND' : 'OR');
  const need = (e, ops, what) => { if (!ops.includes(e.op)) no(what); };

  /**
   * The laws, each with its dual where it has one. apply(node) returns the rewritten node or throws Refuse with
   * the reason the law does not fit here. The left side of each form is the pattern it looks for.
   */
  const LAWS = [
    { id: 'commutative', name: 'Commutative', form: 'XY = YX,  X + Y = Y + X', apply(e) {
      need(e, ['and', 'or', 'xor'], 'Commutativity reorders the operands of an AND, OR or XOR; pick one of those, not ' + (e.op === 'not' ? 'a complement' : 'a single variable') + '.');
      return { op: e.op, args: e.args.slice(1).concat([e.args[0]]) };
    } },
    { id: 'associative', name: 'Associative', form: 'X(YZ) = XYZ,  X + (Y + Z) = X + Y + Z', apply(e) {
      need(e, ['and', 'or', 'xor'], 'Associativity regroups a chain of one operator; pick an AND, OR or XOR.');
      if (!e.args.some((a) => a.op === e.op)) no('There is no bracket of the same operator (' + sym(e.op) + ') directly inside ' + show(e) + ' to remove.');
      return { op: e.op, args: e.args.flatMap((a) => (a.op === e.op ? a.args : [a])) };
    } },
    { id: 'distributive', name: 'Distributive (expand)', form: 'X(Y + Z) = XY + XZ,  X + YZ = (X + Y)(X + Z)', apply(e) {
      need(e, ['and', 'or'], 'Distributing needs an AND with an OR inside it (or an OR with an AND inside it).');
      const inner = other(e.op), i = e.args.findIndex((a) => a.op === inner);
      if (i < 0) no(show(e) + ' has no ' + sym(inner) + ' among its operands to distribute over.');
      const rest = e.args.filter((_, j) => j !== i);
      return mk(inner, e.args[i].args.map((t) => mk(e.op, rest.concat(factors(t, e.op)))));
    } },
    { id: 'factor', name: 'Distributive (factor out)', form: 'XY + XZ = X(Y + Z),  (X + Y)(X + Z) = X + YZ', apply(e) {
      need(e, ['and', 'or'], 'Factoring needs a sum of products (or a product of sums) with something in common.');
      const inner = other(e.op), fs = e.args.map((a) => factors(a, inner));
      const count = new Map();
      fs.forEach((list) => { for (const k of new Set(list.map(K))) count.set(k, (count.get(k) || 0) + 1); });
      let best = null;
      for (const [k, n] of count) if (n >= 2 && (!best || n > best[1])) best = [k, n];
      if (!best) no('No two terms of ' + show(e) + ' share a ' + (e.op === 'or' ? 'factor' : 'term') + ', so there is nothing to factor out.');
      const f = fs.flat().find((x) => K(x) === best[0]);
      const withF = [], rest = [];
      e.args.forEach((a, i) => (fs[i].some((x) => K(x) === best[0]) ? withF : rest).push(i));
      const rems = withF.map((i) => { const left = fs[i].slice(); left.splice(left.findIndex((x) => K(x) === best[0]), 1); return mk(inner, left); });
      const merged = mk(inner, [f, mk(e.op, rems)]);
      const args = [];
      e.args.forEach((a, i) => { if (i === withF[0]) args.push(merged); else if (rest.includes(i)) args.push(a); });
      return mk(e.op, args);
    } },
    { id: 'identity', name: 'Identity', form: 'X·1 = X,  X + 0 = X', apply(e) {
      need(e, ['and', 'or'], 'The identity law removes a 1 from an AND or a 0 from an OR.');
      const unit = e.op === 'and' ? 1 : 0;
      if (!e.args.some((a) => a.op === 'const' && a.v === unit)) no(show(e) + ' has no ' + unit + ' to remove (the identity of ' + sym(e.op) + ' is ' + unit + ').');
      return mk(e.op, e.args.filter((a) => !(a.op === 'const' && a.v === unit)));
    } },
    { id: 'null', name: 'Null element', form: 'X·0 = 0,  X + 1 = 1', apply(e) {
      need(e, ['and', 'or'], 'The null law turns an AND holding a 0 into 0, or an OR holding a 1 into 1.');
      const z = e.op === 'and' ? 0 : 1;
      if (!e.args.some((a) => a.op === 'const' && a.v === z)) no(show(e) + ' holds no ' + z + ', so the null law does not apply.');
      return C(z);
    } },
    { id: 'idempotent', name: 'Idempotent', form: 'XX = X,  X + X = X', apply(e) {
      need(e, ['and', 'or'], 'Idempotence removes a repeated operand of an AND or an OR.');
      const seen = new Set(), out = [];
      for (const a of e.args) { if (seen.has(K(a))) continue; seen.add(K(a)); out.push(a); }
      if (out.length === e.args.length) no('No operand of ' + show(e) + ' appears twice.');
      return mk(e.op, out);
    } },
    { id: 'complement', name: 'Complement', form: "XX' = 0,  X + X' = 1", apply(e) {
      need(e, ['and', 'or'], 'The complement law needs an AND or an OR holding both X and X\'.');
      for (let i = 0; i < e.args.length; i++) for (let j = i + 1; j < e.args.length; j++) {
        if (!isNegOf(e.args[i], e.args[j])) continue;
        const v = C(e.op === 'and' ? 0 : 1), args = [];
        e.args.forEach((a, k) => { if (k === i) args.push(v); else if (k !== j) args.push(a); });
        return mk(e.op, args);
      }
      return no(show(e) + ' does not hold a term together with its complement.');
    } },
    { id: 'involution', name: 'Involution', form: "(X')' = X", apply(e) {
      if (e.op !== 'not' || e.a.op !== 'not') no('Involution removes two complements in a row; ' + show(e) + ' is not complemented twice.');
      return e.a.a;
    } },
    { id: 'demorgan', name: "De Morgan", form: "(XY)' = X' + Y',  (X + Y)' = X'Y'", apply(e) {
      if (e.op !== 'not' || !['and', 'or'].includes(e.a.op)) no("De Morgan's law pushes a complement through an AND or an OR: pick a complemented bracket such as (XY)'.");
      return { op: other(e.a.op), args: e.a.args.map(NOT) };
    } },
    { id: 'demorgan-gather', name: "De Morgan (gather)", form: "X' + Y' = (XY)',  X'Y' = (X + Y)'", apply(e) {
      need(e, ['and', 'or'], "Gathering complements needs an AND or OR of complemented terms, such as X' + Y'.");
      if (!e.args.every((a) => a.op === 'not')) no('Every operand of ' + show(e) + ' must be complemented to gather the complements into one.');
      return NOT({ op: other(e.op), args: e.args.map((a) => a.a) });
    } },
    { id: 'absorption', name: 'Absorption', form: 'X + XY = X,  X(X + Y) = X', apply(e) {
      need(e, ['and', 'or'], 'Absorption needs a sum (or product) where one term contains another, such as X + XY.');
      const inner = other(e.op), fs = e.args.map((a) => new Set(factors(a, inner).map(K)));
      for (let i = 0; i < e.args.length; i++) for (let j = 0; j < e.args.length; j++) {
        if (i === j || fs[j].size <= fs[i].size) continue;
        if ([...fs[i]].every((k) => fs[j].has(k))) return mk(e.op, e.args.filter((_, k) => k !== j));
      }
      return no('No term of ' + show(e) + ' contains another one whole, so nothing is absorbed.');
    } },
    { id: 'absorption2', name: 'Absorption (second form)', form: "X + X'Y = X + Y,  X(X' + Y) = XY", apply(e) {
      need(e, ['and', 'or'], "This law needs a sum like X + X'Y (or a product like X(X' + Y)).");
      const inner = other(e.op);
      for (let i = 0; i < e.args.length; i++) {
        const x = e.args[i];
        for (let j = 0; j < e.args.length; j++) {
          if (i === j) continue;
          const fj = factors(e.args[j], inner);
          if (fj.length < 2) continue;
          const xs = factors(x, inner);
          // X + X'Y: x is one factor whose complement is a factor of the other term
          if (xs.length === 1) { const k = fj.findIndex((f) => isNegOf(f, x)); if (k >= 0) { const args = e.args.slice(); args[j] = mk(inner, fj.filter((_, q) => q !== k)); return mk(e.op, args); } }
        }
      }
      return no("There is no X beside a term holding X' in " + show(e) + '.');
    } },
    { id: 'uniting', name: 'Combining (uniting)', form: "XY + XY' = X,  (X + Y)(X + Y') = X", apply(e) {
      need(e, ['and', 'or'], "Combining needs two terms that differ only in one variable, such as XY + XY'.");
      const inner = other(e.op), fs = e.args.map((a) => factors(a, inner));
      for (let i = 0; i < e.args.length; i++) for (let j = i + 1; j < e.args.length; j++) {
        const a = fs[i], b = fs[j];
        if (a.length !== b.length) continue;
        const ka = a.map(K), kb = b.map(K), onlyA = a.filter((x) => !kb.includes(K(x))), onlyB = b.filter((x) => !ka.includes(K(x)));
        if (onlyA.length === 1 && onlyB.length === 1 && isNegOf(onlyA[0], onlyB[0])) {
          const common = mk(inner, a.filter((x) => kb.includes(K(x))));
          const args = [];
          e.args.forEach((t, k) => { if (k === i) args.push(common); else if (k !== j) args.push(t); });
          return mk(e.op, args);
        }
      }
      return no('No two terms of ' + show(e) + ' differ in exactly one variable and agree on the rest.');
    } },
    { id: 'consensus', name: 'Consensus', form: "XY + X'Z + YZ = XY + X'Z", apply(e) {
      need(e, ['and', 'or'], 'The consensus law needs three terms in a sum (or product).');
      const inner = other(e.op), fs = e.args.map((a) => factors(a, inner));
      for (let i = 0; i < e.args.length; i++) for (let j = i + 1; j < e.args.length; j++) {
        const opp = [];
        for (const x of fs[i]) for (const y of fs[j]) if (isNegOf(x, y)) opp.push([x, y]);
        if (opp.length !== 1) continue;
        const cons = new Set(fs[i].concat(fs[j]).filter((x) => x !== opp[0][0] && x !== opp[0][1]).map(K));
        for (let k = 0; k < e.args.length; k++) {
          if (k === i || k === j) continue;
          const fk = new Set(fs[k].map(K));
          if (fk.size === cons.size && [...cons].every((q) => fk.has(q))) return mk(e.op, e.args.filter((_, q) => q !== k));
        }
      }
      return no('No term of ' + show(e) + ' is the consensus of two others (XY + X\'Z with YZ).');
    } },
  ];
  F.laws = LAWS;
  F.law = (id) => LAWS.find((l) => l.id === id);

  /** apply a law at a path: {expr, node, result} or throws Refuse */
  F.apply = function (expr, path, lawId) {
    const law = F.law(lawId), node = B().at(expr, path);
    if (!node) no('Pick a part of the expression first.');
    const res = law.apply(node);
    const out = B().replaceAt(expr, path, res);
    const p = B().prove(expr, out);
    if (!p.equal) no('That rewrite would change the function, so it is not allowed.');
    return { expr: out, node, result: res };
  };
  /** a useful next move: one that cuts literals now, or the first of two that do; null if none is found */
  F.hint = function (expr, goal) {
    const lits = (e) => B().literals(e);
    const moves = (e) => {
      const out = [];
      for (const { path } of B().paths(e)) for (const l of LAWS) {
        if (l.id === 'commutative' || l.id === 'demorgan-gather') continue;
        try { out.push({ law: l.id, path, expr: F.apply(e, path, l.id).expr }); } catch (x) { if (!(x instanceof Refuse)) throw x; }
      }
      return out;
    };
    const L0 = lits(expr), first = moves(expr);
    const done = (e) => goal && F.reached(e, goal);
    let best = first.filter((m) => done(m.expr))[0] || first.filter((m) => lits(m.expr) < L0).sort((a, b) => lits(a.expr) - lits(b.expr))[0];
    if (best) return best;
    for (const m of first.slice(0, 40)) {
      if (['distributive', 'associative', 'demorgan', 'involution', 'factor', 'idempotent', 'identity', 'null', 'complement'].indexOf(m.law) < 0) continue;
      const next = moves(m.expr).find((n) => lits(n.expr) < L0 || done(n.expr));
      if (next) return m;
    }
    return first.find((m) => ['demorgan', 'involution', 'associative', 'identity', 'null', 'idempotent', 'complement'].includes(m.law)) || null;
  };
  // ---- the engine's laws when it has them ----------------------------------------------------------------------
  const engineLaws = () => !!(S.Bool && S.Bool.applyLaw && S.Bool.laws && S.Bool.hint);
  F.engineLaws = engineLaws;
  /** the law palette: [{id, name, form}] */
  F.lawList = () => (engineLaws() ? S.Bool.laws.map((l) => ({ id: l.id, name: l.name, form: l.forms.join(',  ') })) : LAWS.map((l) => ({ id: l.id, name: l.name, form: l.form })));
  F.lawName = (id) => { const l = F.lawList().find((x) => x.id === id); return l ? l.name : id; };
  /** one step: {expr, node, result, say, opts}, or throws Refuse with the reason */
  F.step = function (expr, path, id, opts) {
    if (!engineLaws()) { const r = F.apply(expr, path, id); return Object.assign(r, { opts: null }); }
    const r = S.Bool.applyLaw(expr, id, path, opts || undefined);
    if (!r.ok) no(r.why);
    if (!B().prove(expr, r.expr).equal) no('That rewrite would change the function, so it is not allowed.');
    return { expr: r.expr, node: r.before, result: r.after, say: r.step.say, opts: r.step.opts };
  };
  /** the next useful step toward the goal: {law, path, opts, say} or null with a reason in say */
  F.hintStep = function (expr, goal) {
    if (!engineLaws()) { const m = F.hint(expr, goal); return m ? { law: m.law, path: m.path, opts: null } : null; }
    const r = S.Bool.hint(expr, { target: goal.kind === 'expr' ? goal.expr : null, budget: 1500 });
    return r.step ? { law: r.step.law, path: r.step.path, opts: r.step.opts, say: r.say } : { none: true, say: r.say };
  };

  /** has the proof reached its goal? goal: {kind:'expr', expr} or {kind:'lits', n} */
  F.reached = function (e, goal) {
    if (goal.kind === 'lits') return B().literals(e) <= goal.n && !hasConst(e);
    return K(B().flatten(e)) === K(B().flatten(goal.expr));
  };
  const hasConst = (e) => e.op === 'const' ? false : (function w(x) { if (x.op === 'const') return true; return B().kids(x).some(w); })(e);

  // ---- hazards --------------------------------------------------------------------------------------------
  /**
   * Static hazards of a two-level cover (static-1 for SOP, static-0 for POS): two neighbouring target cells
   * that no single term covers, so the output can glitch when the one variable between them changes.
   * -> {cover, hazards: [{a, b, var, others, ta, tb, fix}], fixes: [term], fixed: expr, say}
   */
  F.hazards = function (fn, form, cover) {
    F._form = form;
    const Bo = B(), n = fn.vars.length, pos = form === 'pos';
    const terms = cover || Bo.minimise(fn, { form }).cover;
    if (Bo.staticHazards) {
      const r = Bo.staticHazards(fn, terms, form);
      const fixes = new Map(), out = [];
      const says = r.trace.filter((t) => t.kind === 'hazard');
      r.hazards.forEach((x, i) => {
        const fix = Bo.term(x.fix.cube, fn.vars, form);
        fixes.set(fix.str, fix);
        out.push({ a: x.from, b: x.to, var: x.var, fix, say: (says[i] && says[i].say) || '' });
      });
      return finish(terms, out, fixes);
    }
    const target = new Set(pos ? Bo.zeros(fn) : Bo.minterms(fn));
    const out = [], fixes = new Map();
    for (const a of target) for (let i = 0; i < n; i++) {
      const bit = 1 << (n - 1 - i), b = a ^ bit;
      if (b < a || !target.has(b)) continue;
      if (terms.some((t) => Bo.covers(t.cube, a) && Bo.covers(t.cube, b))) continue;
      const ta = terms.find((t) => Bo.covers(t.cube, a)), tb = terms.find((t) => Bo.covers(t.cube, b));
      if (!ta || !tb) continue;
      // the consensus of the two terms across the changing variable
      const mask = (ta.cube.mask | tb.cube.mask) & ~bit;
      const conflict = (ta.cube.bits ^ tb.cube.bits) & ta.cube.mask & tb.cube.mask & ~bit;
      let fix;
      if (!conflict) fix = Bo.term(Bo.cube(n, mask, (ta.cube.bits | tb.cube.bits) & mask), fn.vars, form);
      else fix = Bo.term(Bo.spanCube([a, b], n), fn.vars, form);
      fixes.set(fix.str, fix);
      const env = Bo.env(a, fn.vars);
      const others = fn.vars.filter((_, k) => k !== i).map((v) => v + ' = ' + env[v]).join(', ');
      out.push({ a, b, var: fn.vars[i], others, ta, tb, fix,
        say: 'With ' + (others || 'nothing else') + ' held, changing ' + fn.vars[i] + ' moves from cell ' + a + ' (covered by ' + ta.text + ') to cell ' + b + ' (covered by ' + tb.text + '). No one term covers both, so for a moment both terms can be ' + (pos ? '1' : '0') + ' and F can glitch to ' + (pos ? '1' : '0') + '. The consensus term ' + fix.text + ' covers both and removes the glitch.' });
    }
    return finish(terms, out, fixes);
  };
  /** the hazards with the cover made hazard-free by adding the fixes */
  function finish(terms, out, fixes) {
    const Bo = B(), pos = F._form === 'pos';
    const all = terms.concat([...fixes.values()].filter((f) => !terms.some((t) => t.str === f.str)));
    const fixed = all.length ? (pos ? Bo.AND(all.map((t) => t.expr)) : Bo.OR(all.map((t) => t.expr))) : Bo.C(pos ? 1 : 0);
    return { cover: terms, hazards: out, fixes: [...fixes.values()], fixed, say: out.length ? out.length + ' static-' + (pos ? '0' : '1') + ' hazard' + (out.length === 1 ? '' : 's') + '.' : 'No static-' + (pos ? '0' : '1') + ' hazards: every pair of neighbouring ' + (pos ? '0' : '1') + 's shares a term.' };
  }
  /** the terms of an expression that is a two-level form over vars, as a cover; null when it is not one */
  F.coverOf = function (expr, vs, form) {
    const Bo = B(), outer = form === 'pos' ? 'and' : 'or', inner = form === 'pos' ? 'or' : 'and';
    const e = Bo.flatten(expr);
    const ts = e.op === outer ? e.args : [e];
    const out = [];
    for (const t of ts) {
      if (t.op !== inner && !Bo.isLit(t)) return null;
      const c = Bo.termCube(t, vs, form);
      if (!c || c === 'empty') return null;
      out.push(Bo.term(c, vs, form));
    }
    return out;
  };

  // ---- cost ---------------------------------------------------------------------------------------------------
  /** a gate circuit's cost: gates, gate inputs, levels (inverters count), worst-case delay at tpd per gate */
  F.circuitCost = function (c, tpd) {
    const G = S.Netlist.GATES;
    const gates = c.parts.filter((p) => G.has(p.type));
    const inputs = gates.reduce((s, p) => s + p.pins.filter((q) => q.dir === 'in').length, 0);
    const memo = new Map();
    const level = (p) => {
      if (!G.has(p.type)) return 0;
      if (memo.has(p)) return memo.get(p);
      memo.set(p, 0);
      let L = 0;
      for (const q of p.pins) if (q.dir === 'in' && p.net[q.name]) { const n = p.net[q.name], d = n.pins.find((r) => r.part.pins.find((x) => x.name === r.pin).dir === 'out'); if (d) L = Math.max(L, level(d.part)); }
      memo.set(p, L + 1);
      return L + 1;
    };
    const levels = Math.max(0, ...gates.map(level));
    return { gates: gates.length, inverters: gates.filter((p) => p.type === 'NOT').length, inputs, levels, delay: levels * tpd };
  };
  /** build a function's circuit in a style: and-or / nand-nand from minimal SOP, or-and / nor-nor from minimal POS, the rest from the expression */
  F.build = function (fn, expr, style, title) {
    const Bo = B();
    let e = expr;
    if (style === 'and-or' || style === 'nand-nand') e = Bo.minimise(fn, { form: 'sop' }).expr;
    if (style === 'or-and' || style === 'nor-nor') e = Bo.minimise(fn, { form: 'pos' }).expr;
    e = Bo.flatten(e);
    if (e.op === 'const') throw new Error('F is the constant ' + e.v + ': there is no circuit to build.');
    const vars = Bo.vars(e);
    return { circuit: S.Netlist.fromExpressions(title || 'F', { F: e }, style, { inputs: vars.length ? vars : fn.vars }), expr: e };
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
