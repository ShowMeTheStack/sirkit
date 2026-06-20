// The rewrite engine: named laws applied at a chosen subterm, proofs as replayable lists of steps, a hint that
// searches for the next useful step (toward a target, or toward fewer literals), and simplify().
// A law that cannot apply says why. Subterms are addressed by paths (see bool-expr.js); a law acting on some
// operands of an n-ary node takes opts.args, their indexes in that node.
(function (S) {
  'use strict';
  const B = S.Bool = S.Bool || {};
  const { V, C, NOT } = B;
  const P = (x) => B.P(x);
  const k = (x) => B.key(x);
  const s = (x) => B.toString(x);
  const DUAL = { and: 'or', or: 'and' };
  const UNIT = { and: 1, or: 0 };
  const facs = (t, op) => (t.op === op ? t.args : [t]);
  const comp = (x) => (x.op === 'not' ? x.a : NOT(x));
  const compKey = (x) => (x.op === 'not' ? k(x.a) : '~' + k(x));
  const keyset = (xs) => new Set(xs.map(k));
  const subset = (a, b) => { const kb = keyset(b); return a.every((x) => kb.has(k(x))); };
  const rebuild = (op, args) => (args.length === 0 ? C(UNIT[op] != null ? UNIT[op] : 0) : args.length === 1 ? args[0] : { op, args });
  const opName = (op) => ({ and: 'product', or: 'sum', xor: 'XOR' })[op] || op;
  const opA = (op) => (op === 'xor' ? 'an ' : 'a ') + opName(op);
  /** a product (or sum) of factors, flattened; empty gives the unit */
  const prod = (op, xs) => {
    const seen = [];
    for (const x of xs) for (const y of facs(x, op)) seen.push(y);
    return rebuild(op, seen);
  };
  const without = (xs, drop) => { const out = []; const d = drop.map(k); for (const x of xs) { const i = d.indexOf(k(x)); if (i >= 0) d.splice(i, 1); else out.push(x); } return out; };
  const pairs = (n) => { const out = []; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) out.push([i, j]); return out; };
  const upairs = (n) => { const out = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) out.push([i, j]); return out; };
  const isNary = (n) => n.op === 'and' || n.op === 'or';

  const LAWS = [];
  const law = (def) => { LAWS.push(def); return def; };

  // ---- the laws ----------------------------------------------------------------------------------------------------
  law({ id: 'identity', name: 'Identity', forms: ['X + 0 = X', 'X·1 = X'],
    find: (n) => (isNary(n) ? n.args.map((a, i) => (a.op === 'const' && a.v === UNIT[n.op] ? { args: [i] } : null)).filter(Boolean) : []),
    make: (n, o) => {
      const i = o.args[0], a = n.args[i];
      if (!(a && a.op === 'const' && a.v === UNIT[n.op])) return { why: 'Identity removes a ' + UNIT[n.op] + ' from ' + opA(n.op) + '; operand ' + (i + 1) + ' is ' + (a ? s(a) : 'missing') + '.' };
      const r = rebuild(n.op, n.args.filter((_, j) => j !== i));
      return { node: r, say: (n.op === 'or' ? 'X + 0 = X' : 'X·1 = X') + ': drop the ' + UNIT[n.op] + '.' };
    },
    whyNot: (n) => (isNary(n) ? 'Identity needs a ' + UNIT[n.op] + ' in this ' + opName(n.op) + ', and ' + s(n) + ' has none.' : 'Identity applies to a sum (X + 0) or a product (X·1).') });

  law({ id: 'null', name: 'Null element', forms: ['X + 1 = 1', 'X·0 = 0'],
    find: (n) => (isNary(n) ? n.args.map((a, i) => (a.op === 'const' && a.v !== UNIT[n.op] ? { args: [i] } : null)).filter(Boolean) : []),
    make: (n, o) => {
      const a = n.args[o.args[0]];
      if (!(a && a.op === 'const' && a.v !== UNIT[n.op])) return { why: 'The null law needs a ' + (1 - UNIT[n.op]) + ' in the ' + opName(n.op) + '.' };
      return { node: C(1 - UNIT[n.op]), say: n.op === 'or' ? 'X + 1 = 1: a sum with a 1 in it is 1.' : 'X·0 = 0: a product with a 0 in it is 0.' };
    },
    whyNot: (n) => (isNary(n) ? 'The null law needs a ' + (1 - UNIT[n.op]) + ' in this ' + opName(n.op) + ', and ' + s(n) + ' has none.' : 'The null law applies to a sum (X + 1) or a product (X·0).') });

  law({ id: 'idempotent', name: 'Idempotence', forms: ['X + X = X', 'X·X = X'],
    find: (n) => (isNary(n) ? upairs(n.args.length).filter(([i, j]) => k(n.args[i]) === k(n.args[j])).map((a) => ({ args: a })) : []),
    make: (n, o) => {
      const [i, j] = o.args;
      if (!n.args[i] || !n.args[j] || i === j || k(n.args[i]) !== k(n.args[j])) return { why: 'Idempotence needs two equal operands; ' + (n.args[i] && n.args[j] ? s(n.args[i]) + ' and ' + s(n.args[j]) + ' differ.' : 'pick two operands.') };
      return { node: rebuild(n.op, n.args.filter((_, q) => q !== j)), say: (n.op === 'or' ? 'X + X = X' : 'X·X = X') + ': ' + s(n.args[i]) + ' appears twice; keep one.' };
    },
    whyNot: (n) => (isNary(n) ? 'Idempotence needs the same operand twice in ' + s(n) + '.' : 'Idempotence applies to a sum or a product.') });

  law({ id: 'involution', name: 'Involution', forms: ["(X')' = X"],
    find: (n) => (n.op === 'not' && n.a.op === 'not' ? [{ dir: 'remove' }] : []),
    make: (n, o) => {
      if (o.dir === 'introduce') return { node: NOT(NOT(n)), say: "X = (X')': write " + s(n) + ' as a double complement.' };
      if (!(n.op === 'not' && n.a.op === 'not')) return { why: 'Involution removes a double complement, and ' + s(n) + ' is not one.' };
      return { node: n.a.a, say: "(X')' = X: the two complements cancel." };
    },
    whyNot: (n) => 'Involution removes a double complement, and ' + s(n) + ' is not one.' });

  law({ id: 'constants', name: 'Complement of a constant', forms: ["0' = 1", "1' = 0"],
    find: (n) => (n.op === 'not' && n.a.op === 'const' ? [{}] : []),
    make: (n) => (n.op === 'not' && n.a.op === 'const' ? { node: C(1 - n.a.v), say: n.a.v + "' = " + (1 - n.a.v) + '.' } : { why: s(n) + ' is not the complement of a constant.' }),
    whyNot: (n) => s(n) + ' is not the complement of a constant.' });

  law({ id: 'complement', name: 'Complement', forms: ["X + X' = 1", "X·X' = 0"],
    find: (n) => (isNary(n) ? upairs(n.args.length).filter(([i, j]) => compKey(n.args[i]) === k(n.args[j])).map((a) => ({ args: a })) : []),
    make: (n, o) => {
      const [i, j] = o.args, a = n.args[i], b = n.args[j];
      if (!a || !b || i === j || compKey(a) !== k(b)) return { why: 'The complement law needs an operand and its complement; ' + (a && b ? s(a) + ' and ' + s(b) + ' are not complements.' : 'pick two operands.') };
      const v = 1 - UNIT[n.op];
      const args = []; n.args.forEach((x, q) => { if (q === i) args.push(C(v)); else if (q !== j) args.push(x); });
      return { node: rebuild(n.op, args), say: (n.op === 'or' ? "X + X' = 1" : "X·X' = 0") + ': ' + s(a) + ' and ' + s(b) + ' give ' + v + '.' };
    },
    whyNot: (n) => (isNary(n) ? 'No operand of ' + s(n) + ' appears together with its complement.' : 'The complement law applies to a sum or a product.') });

  law({ id: 'commutative', name: 'Commutative', forms: ['X + Y = Y + X', 'XY = YX'], search: false,
    find: () => [],
    make: (n, o) => {
      if (!(isNary(n) || n.op === 'xor')) return { why: 'Commutativity reorders the operands of a sum, product or XOR.' };
      let order = o.order;
      if (!order) { const [i, j] = o.args || [0, 1]; order = n.args.map((_, q) => q); if (i == null || j == null || i >= n.args.length || j >= n.args.length) return { why: 'Pick two operands to swap.' }; order[i] = j; order[j] = i; }
      if (order.length !== n.args.length || new Set(order).size !== order.length) return { why: 'The new order must use each operand once.' };
      const r = { op: n.op, args: order.map((q) => n.args[q]) };
      return { node: r, say: 'Reorder the operands: ' + s(n) + ' = ' + s(r) + '.', opts: { order } };
    },
    whyNot: () => 'Commutativity reorders the operands of a sum, product or XOR.' });

  law({ id: 'associative', name: 'Associative', forms: ['X + (Y + Z) = (X + Y) + Z', 'X(YZ) = (XY)Z'],
    find: (n) => ((isNary(n) || n.op === 'xor') ? n.args.map((a, i) => (a.op === n.op ? { dir: 'ungroup', args: [i] } : null)).filter(Boolean) : []),
    make: (n, o) => {
      if (!(isNary(n) || n.op === 'xor')) return { why: 'Associativity regroups a sum, product or XOR.' };
      if (o.dir === 'group') {
        const [i, j] = o.args || [];
        if (i == null || j == null || j <= i || j >= n.args.length || (i === 0 && j === n.args.length - 1)) return { why: 'Pick a run of at least two operands, not all of them, to bracket.' };
        const r = { op: n.op, args: n.args.slice(0, i).concat([{ op: n.op, args: n.args.slice(i, j + 1) }], n.args.slice(j + 1)) };
        return { node: r, say: 'Bracket ' + s(r.args[i]) + ' together; the value does not change.' };
      }
      const i = (o.args || [])[0], a = n.args[i];
      if (!a || a.op !== n.op) return { why: 'To remove brackets, the chosen operand must itself be ' + opA(n.op) + '.' };
      const r = { op: n.op, args: n.args.slice(0, i).concat(a.args, n.args.slice(i + 1)) };
      return { node: r, say: 'Remove the brackets around ' + s(a) + '; the value does not change.' };
    },
    whyNot: (n) => (isNary(n) || n.op === 'xor' ? 'No operand of ' + s(n) + ' is a bracketed ' + opName(n.op) + '.' : 'Associativity regroups a sum, product or XOR.') });

  // distributive: P over Q. dir 'expand' at a P node with a Q operand; dir 'factor' at a Q node
  function distributive(id, name, Pop, Qop, forms) {
    const Psay = Pop === 'and' ? 'X(Y + Z) = XY + XZ' : 'X + YZ = (X + Y)(X + Z)';
    law({ id, name, forms,
      find: (n) => {
        const out = [];
        if (n.op === Pop) n.args.forEach((a, i) => { if (a.op === Qop) out.push({ dir: 'expand', args: [i] }); });
        if (n.op === Qop) upairs(n.args.length).forEach(([i, j]) => { const fi = facs(n.args[i], Pop), fj = facs(n.args[j], Pop); if (fi.some((x) => keyset(fj).has(k(x)))) out.push({ dir: 'factor', args: [i, j] }); });
        return out;
      },
      make: (n, o) => {
        if (o.dir === 'factor') {
          if (n.op !== Qop) return { why: 'Factoring needs ' + opA(Qop) + ' of terms with a common ' + (Pop === 'and' ? 'factor' : 'sum term') + '.' };
          const idx = o.args || [];
          if (idx.length < 2 || idx.some((i) => !n.args[i]) || new Set(idx).size !== idx.length) return { why: 'Pick at least two terms to factor.' };
          const fs = idx.map((i) => facs(n.args[i], Pop));
          let common = fs[0].filter((x, q) => fs[0].findIndex((y) => k(y) === k(x)) === q);
          for (const f of fs.slice(1)) common = common.filter((x) => keyset(f).has(k(x)));
          if (o.common) common = common.filter((x) => o.common.includes(k(x)));
          if (!common.length) return { why: idx.map((i) => s(n.args[i])).join(' and ') + ' have nothing in common to take out.' };
          const rest = fs.map((f) => prod(Pop, without(f, common)));
          const inner = { op: Qop, args: rest };
          const fused = Pop === 'and' ? { op: 'and', args: common.concat([inner]) } : { op: 'or', args: common.concat([inner]) };
          const args = []; n.args.forEach((x, q) => { if (q === idx[0]) args.push(fused); else if (!idx.includes(q)) args.push(x); });
          return { node: rebuild(Qop, args), say: 'Take out the common ' + (Pop === 'and' ? 'factor ' : 'term ') + common.map(s).join(Pop === 'and' ? '' : ' + ') + ' (' + Psay.split(' = ').reverse().join(' = ') + ').', opts: { dir: 'factor', args: idx } };
        }
        if (n.op !== Pop) return { why: 'Distributing needs ' + opA(Pop) + ' with ' + opA(Qop) + ' inside it, like ' + Psay.split(' = ')[0] + '.' };
        const i = (o.args || [])[0], q = n.args[i];
        if (!q || q.op !== Qop) return { why: 'The chosen operand must be ' + opA(Qop) + ' to distribute over.' };
        const terms = q.args.map((y) => prod(Pop, n.args.slice(0, i).concat([y], n.args.slice(i + 1))));
        return { node: { op: Qop, args: terms }, say: 'Distribute (' + Psay + '): ' + s(n) + ' = ' + s({ op: Qop, args: terms }) + '.', opts: { dir: 'expand', args: [i] } };
      },
      whyNot: (n) => (n.op === Pop ? 'No operand of ' + s(n) + ' is ' + opA(Qop) + ' to distribute over.' : n.op === Qop ? 'No two terms of ' + s(n) + ' share a ' + (Pop === 'and' ? 'factor' : 'term') + '.' : 'The distributive law needs ' + opA(Pop) + ' or ' + opA(Qop) + '.') });
  }
  distributive('distributive', 'Distributive (AND over OR)', 'and', 'or', ['X(Y + Z) = XY + XZ']);
  distributive('distributive-or', 'Distributive (OR over AND)', 'or', 'and', ['X + YZ = (X + Y)(X + Z)']);

  law({ id: 'absorption', name: 'Absorption', forms: ['X + XY = X', 'X(X + Y) = X'],
    find: (n) => (isNary(n) ? pairs(n.args.length).filter(([i, j]) => { const fi = facs(n.args[i], DUAL[n.op]), fj = facs(n.args[j], DUAL[n.op]); return subset(fi, fj) && !subset(fj, fi); }).map((a) => ({ args: a })) : []),
    make: (n, o) => {
      if (!isNary(n)) return { why: 'Absorption applies to a sum (X + XY) or a product (X(X + Y)).' };
      const [i, j] = o.args || [];
      const a = n.args[i], b = n.args[j];
      if (!a || !b || i === j) return { why: 'Pick the absorbing term and the term it absorbs.' };
      const fi = facs(a, DUAL[n.op]), fj = facs(b, DUAL[n.op]);
      if (!subset(fi, fj)) return { why: s(b) + ' does not contain all of ' + s(a) + ', so ' + s(a) + ' cannot absorb it.' };
      return { node: rebuild(n.op, n.args.filter((_, q) => q !== j)), say: (n.op === 'or' ? 'X + XY = X' : 'X(X + Y) = X') + ': ' + s(a) + ' absorbs ' + s(b) + '.' };
    },
    whyNot: (n) => (isNary(n) ? 'No term of ' + s(n) + ' contains another term whole.' : 'Absorption applies to a sum or a product.') });

  // X + X'Y = X + Y, and more generally XW + X'WZ = XW + WZ
  const abs2 = (n, i, j) => {
    const a = n.args[i], b = n.args[j], inner = DUAL[n.op];
    if (!a || !b || i === j) return null;
    const fi = facs(a, inner), fj = facs(b, inner);
    for (const x of fi) {
      const ck = compKey(x);
      const hit = fj.findIndex((y) => k(y) === ck);
      if (hit < 0) continue;
      const restI = without(fi, [x]);
      const fjNo = fj.filter((_, q) => q !== hit);
      if (subset(restI, fjNo)) return { x, drop: fj[hit], node: prod(inner, fjNo) };
    }
    return null;
  };
  law({ id: 'absorption2', name: 'Absorption (second form)', forms: ["X + X'Y = X + Y", "X(X' + Y) = XY"],
    find: (n) => (isNary(n) ? pairs(n.args.length).filter(([i, j]) => abs2(n, i, j)).map((a) => ({ args: a })) : []),
    make: (n, o) => {
      if (!isNary(n)) return { why: "This law applies to a sum (X + X'Y) or a product (X(X' + Y))." };
      const [i, j] = o.args || [];
      const r = abs2(n, i, j);
      if (!r) return { why: n.args[i] && n.args[j] ? s(n.args[j]) + ' holds no complement of a literal of ' + s(n.args[i]) + ' together with the rest of it.' : 'Pick two terms.' };
      const args = n.args.slice(); args[j] = r.node;
      return { node: rebuild(n.op, args), say: (n.op === 'or' ? "X + X'Y = X + Y" : "X(X' + Y) = XY") + ': next to ' + s(n.args[i]) + ', the ' + s(r.drop) + ' in ' + s(n.args[j]) + ' is redundant.' };
    },
    whyNot: (n) => (isNary(n) ? "No pair of terms in " + s(n) + " has the shape X + X'Y." : "This law applies to a sum (X + X'Y) or a product (X(X' + Y)).") });

  law({ id: 'demorgan', name: "De Morgan's law", forms: ["(X + Y + …)' = X'Y'…", "(XY…)' = X' + Y' + …"],
    find: (n) => {
      if (n.op === 'not' && isNary(n.a)) return [{ dir: 'push' }];
      if (isNary(n)) { const idx = n.args.map((a, i) => (a.op === 'not' ? i : -1)).filter((i) => i >= 0); if (idx.length >= 2) return [{ dir: 'pull', args: idx }]; }
      return [];
    },
    make: (n, o) => {
      if (o.dir === 'pull') {
        if (!isNary(n)) return { why: 'Gathering complements needs a sum or product of complemented terms.' };
        const idx = o.args || n.args.map((_, i) => i);
        if (idx.length < 2 || idx.some((i) => !n.args[i] || n.args[i].op !== 'not')) return { why: 'Every chosen operand must be complemented, and at least two are needed.' };
        const g = NOT({ op: DUAL[n.op], args: idx.map((i) => n.args[i].a) });
        const args = []; n.args.forEach((x, q) => { if (q === idx[0]) args.push(g); else if (!idx.includes(q)) args.push(x); });
        return { node: rebuild(n.op, args), say: "De Morgan: " + idx.map((i) => s(n.args[i])).join(n.op === 'or' ? ' + ' : '·') + ' = ' + s(g) + '.', opts: { dir: 'pull', args: idx } };
      }
      if (!(n.op === 'not' && isNary(n.a))) return { why: "De Morgan's law needs the complement of a sum or a product, and " + s(n) + ' is not one.' };
      const r = { op: DUAL[n.a.op], args: n.a.args.map((x) => NOT(x)) };
      return { node: r, say: "De Morgan: the complement of a " + opName(n.a.op) + ' is the ' + opName(DUAL[n.a.op]) + ' of the complements, ' + s(n) + ' = ' + s(r) + '.', opts: { dir: 'push' } };
    },
    whyNot: (n) => "De Morgan's law needs the complement of a sum or a product (or a sum or product of complements), and " + s(n) + ' is neither.' });

  // consensus of terms i and j: exactly one opposed pair
  const consensusOf = (n, i, j) => {
    const inner = DUAL[n.op], fi = facs(n.args[i], inner), fj = facs(n.args[j], inner);
    const opp = fi.filter((x) => keyset(fj).has(compKey(x)));
    if (opp.length !== 1) return null;
    const x = opp[0];
    const rest = without(fi, [x]).concat(without(fj, [comp(x)]));
    const uniq = rest.filter((y, q) => rest.findIndex((z) => k(z) === k(y)) === q);
    if (!uniq.length) return null;
    if (uniq.some((y) => keyset(uniq).has(compKey(y)))) return null;
    return { x, factors: uniq, term: prod(inner, uniq) };
  };
  law({ id: 'consensus', name: 'Consensus', forms: ["XY + X'Z + YZ = XY + X'Z", "(X + Y)(X' + Z)(Y + Z) = (X + Y)(X' + Z)"],
    find: (n) => {
      if (!isNary(n)) return [];
      const out = [], m = n.args.length;
      for (const [i, j] of upairs(m)) {
        const c = consensusOf(n, i, j); if (!c) continue;
        for (let q = 0; q < m; q++) if (q !== i && q !== j && subset(c.factors, facs(n.args[q], DUAL[n.op]))) out.push({ dir: 'remove', args: [i, j, q] });
      }
      return out;
    },
    make: (n, o) => {
      if (!isNary(n)) return { why: 'Consensus applies to a sum of products or a product of sums.' };
      const [i, j, q] = o.args || [];
      if (!n.args[i] || !n.args[j] || i === j) return { why: 'Pick the two terms that form the consensus.' };
      const c = consensusOf(n, i, j);
      if (!c) return { why: s(n.args[i]) + ' and ' + s(n.args[j]) + ' must differ in exactly one complemented variable to have a consensus.' };
      if (o.dir === 'add') {
        return { node: { op: n.op, args: n.args.concat([c.term]) }, say: 'Add the consensus of ' + s(n.args[i]) + ' and ' + s(n.args[j]) + ' (on ' + s(c.x.op === 'not' ? c.x.a : c.x) + '): ' + s(c.term) + '; it is redundant, so the value does not change.', opts: { dir: 'add', args: [i, j] } };
      }
      if (q == null || !n.args[q] || q === i || q === j) return { why: 'Pick the redundant term to remove.' };
      if (!subset(c.factors, facs(n.args[q], DUAL[n.op]))) return { why: s(n.args[q]) + ' is not covered by the consensus ' + s(c.term) + ' of ' + s(n.args[i]) + ' and ' + s(n.args[j]) + '.' };
      return { node: rebuild(n.op, n.args.filter((_, z) => z !== q)), say: 'Consensus: ' + s(n.args[q]) + ' lies inside ' + s(c.term) + ', the consensus of ' + s(n.args[i]) + ' and ' + s(n.args[j]) + ', so it is redundant.', opts: { dir: 'remove', args: [i, j, q] } };
    },
    whyNot: (n) => (isNary(n) ? 'No term of ' + s(n) + ' is the consensus of two others.' : 'Consensus applies to a sum of products or a product of sums.') });

  law({ id: 'uniting', name: 'Uniting (combining)', forms: ["XY + XY' = X", "(X + Y)(X + Y') = X"],
    find: (n) => (isNary(n) ? upairs(n.args.length).filter(([i, j]) => uniteOf(n, i, j)).map((a) => ({ args: a })) : []),
    make: (n, o) => {
      if (!isNary(n)) return { why: "Uniting applies to a sum (XY + XY') or a product ((X + Y)(X + Y'))." };
      const [i, j] = o.args || [];
      const r = n.args[i] && n.args[j] && i !== j ? uniteOf(n, i, j) : null;
      if (!r) return { why: n.args[i] && n.args[j] ? s(n.args[i]) + ' and ' + s(n.args[j]) + ' must be the same except for one variable that is plain in one and complemented in the other.' : 'Pick two terms.' };
      const args = []; n.args.forEach((x, q) => { if (q === i) args.push(r.node); else if (q !== j) args.push(x); });
      return { node: rebuild(n.op, args), say: (n.op === 'or' ? "XY + XY' = X" : "(X + Y)(X + Y') = X") + ': ' + s(n.args[i]) + ' and ' + s(n.args[j]) + ' differ only in ' + s(r.v) + ', which drops out.' };
    },
    whyNot: (n) => (isNary(n) ? 'No two terms of ' + s(n) + ' differ in exactly one complemented variable.' : 'Uniting applies to a sum or a product.') });
  function uniteOf(n, i, j) {
    const inner = DUAL[n.op], fi = facs(n.args[i], inner), fj = facs(n.args[j], inner);
    if (fi.length !== fj.length) return null;
    const x = fi.find((y) => keyset(fj).has(compKey(y)));
    if (!x) return null;
    const ri = without(fi, [x]), rj = without(fj, [comp(x)]);
    if (ri.length !== rj.length || !subset(ri, rj) || !subset(rj, ri)) return null;
    return { v: x.op === 'not' ? x.a : x, node: prod(inner, ri) };
  }

  law({ id: 'redundancy', name: 'Redundant term', forms: ['T is dropped when the other terms already cover it'], search: false,
    find: (n) => (isNary(n) && n.args.length > 1 ? n.args.map((_, i) => i).filter((i) => redundant(n, i)).map((i) => ({ args: [i] })) : []),
    make: (n, o) => {
      if (!isNary(n) || n.args.length < 2) return { why: 'A redundant term can only be dropped from a sum or product of several terms.' };
      const i = (o.args || [])[0];
      if (!n.args[i]) return { why: 'Pick the term to drop.' };
      if (!redundant(n, i)) {
        const r = redundant(n, i, true);
        return { why: s(n.args[i]) + ' is not redundant: at ' + Object.entries(r.env).map(([v, x]) => v + ' = ' + x).join(', ') + ' it alone makes the ' + opName(n.op) + ' ' + (n.op === 'or' ? '1' : '0') + '.' };
      }
      return { node: rebuild(n.op, n.args.filter((_, q) => q !== i)), say: s(n.args[i]) + ' is redundant: wherever it is ' + (n.op === 'or' ? '1' : '0') + ', another term already is.' };
    },
    whyNot: (n) => (isNary(n) ? 'Every term of ' + s(n) + ' is needed.' : 'A redundant term can only be dropped from a sum or product.') });
  function redundant(n, i, witness) {
    const vs = B.vars(n), t = B.compile(n.args[i], vs), rest = B.compile(rebuild(n.op, n.args.filter((_, q) => q !== i)), vs);
    const hit = n.op === 'or' ? 1 : 0;
    for (let m = 0; m < 1 << vs.length; m++) if (t(m) === hit && rest(m) !== hit) return witness ? { env: B.env(m, vs) } : false;
    return true;
  }

  // ---- XOR laws ------------------------------------------------------------------------------------------------------
  const isX = (n) => n.op === 'xor';
  law({ id: 'xor-identity', name: 'XOR with 0', forms: ['X ⊕ 0 = X'],
    find: (n) => (isX(n) ? n.args.map((a, i) => (a.op === 'const' && a.v === 0 ? { args: [i] } : null)).filter(Boolean) : []),
    make: (n, o) => {
      const i = (o.args || [])[0];
      if (!isX(n) || !n.args[i] || !(n.args[i].op === 'const' && n.args[i].v === 0)) return { why: 'X ⊕ 0 = X needs an XOR with a 0 operand.' };
      return { node: rebuild('xor', n.args.filter((_, q) => q !== i)), say: 'X ⊕ 0 = X: drop the 0.' };
    },
    whyNot: (n) => (isX(n) ? s(n) + ' has no 0 operand.' : 'This law applies to an XOR.') });
  law({ id: 'xor-one', name: 'XOR with 1', forms: ["X ⊕ 1 = X'"],
    find: (n) => (isX(n) ? n.args.map((a, i) => (a.op === 'const' && a.v === 1 ? { args: [i] } : null)).filter(Boolean) : []),
    make: (n, o) => {
      const i = (o.args || [])[0];
      if (!isX(n) || !n.args[i] || !(n.args[i].op === 'const' && n.args[i].v === 1)) return { why: "X ⊕ 1 = X' needs an XOR with a 1 operand." };
      const rest = n.args.filter((_, q) => q !== i);
      return { node: NOT(rebuild('xor', rest)), say: "X ⊕ 1 = X': XOR with 1 complements." };
    },
    whyNot: (n) => (isX(n) ? s(n) + ' has no 1 operand.' : 'This law applies to an XOR.') });
  law({ id: 'xor-self', name: 'XOR with itself', forms: ['X ⊕ X = 0'],
    find: (n) => (isX(n) ? upairs(n.args.length).filter(([i, j]) => k(n.args[i]) === k(n.args[j])).map((a) => ({ args: a })) : []),
    make: (n, o) => {
      const [i, j] = o.args || [];
      if (!isX(n) || !n.args[i] || !n.args[j] || i === j || k(n.args[i]) !== k(n.args[j])) return { why: 'X ⊕ X = 0 needs the same operand twice in an XOR.' };
      const rest = n.args.filter((_, q) => q !== i && q !== j);
      return { node: rest.length ? rebuild('xor', rest) : C(0), say: 'X ⊕ X = 0: the two ' + s(n.args[i]) + ' cancel.' };
    },
    whyNot: (n) => (isX(n) ? 'No operand of ' + s(n) + ' appears twice.' : 'This law applies to an XOR.') });
  law({ id: 'xor-complement', name: 'XOR with the complement', forms: ["X ⊕ X' = 1"],
    find: (n) => (isX(n) ? upairs(n.args.length).filter(([i, j]) => compKey(n.args[i]) === k(n.args[j])).map((a) => ({ args: a })) : []),
    make: (n, o) => {
      const [i, j] = o.args || [];
      if (!isX(n) || !n.args[i] || !n.args[j] || i === j || compKey(n.args[i]) !== k(n.args[j])) return { why: "X ⊕ X' = 1 needs an operand and its complement in an XOR." };
      const args = []; n.args.forEach((x, q) => { if (q === i) args.push(C(1)); else if (q !== j) args.push(x); });
      return { node: rebuild('xor', args), say: "X ⊕ X' = 1." };
    },
    whyNot: (n) => (isX(n) ? 'No operand of ' + s(n) + ' appears with its complement.' : 'This law applies to an XOR.') });
  law({ id: 'xor-def', name: 'XOR as a sum of products', forms: ["X ⊕ Y = XY' + X'Y", "(X ⊕ Y)' = XY + X'Y'"],
    find: (n) => ((isX(n) && n.args.length === 2) || (n.op === 'not' && isX(n.a) && n.a.args.length === 2) ? [{}] : []),
    make: (n) => {
      if (isX(n)) {
        if (n.args.length !== 2) return { why: 'Write the XOR as two operands first (bracket with the associative law).' };
        const [a, b] = n.args, r = { op: 'or', args: [prod('and', [a, NOT(b)]), prod('and', [NOT(a), b])] };
        return { node: r, say: "X ⊕ Y = XY' + X'Y: " + s(n) + ' = ' + s(r) + '.' };
      }
      if (n.op === 'not' && isX(n.a)) {
        if (n.a.args.length !== 2) return { why: 'Write the XOR as two operands first.' };
        const [a, b] = n.a.args, r = { op: 'or', args: [prod('and', [a, b]), prod('and', [NOT(a), NOT(b)])] };
        return { node: r, say: "(X ⊕ Y)' = XY + X'Y': " + s(n) + ' = ' + s(r) + '.' };
      }
      return { why: s(n) + ' is not an XOR or XNOR.' };
    },
    whyNot: (n) => s(n) + ' is not a two-operand XOR or XNOR.' });
  const foldOf = (n, i, j) => {
    const a = n.args[i], b = n.args[j];
    if (!a || !b || a.op !== 'and' || b.op !== 'and' || a.args.length !== 2 || b.args.length !== 2) return null;
    const [p, q] = a.args;
    if ([compKey(p), compKey(q)].sort().join() !== b.args.map(k).sort().join()) return null;
    if (q.op === 'not') return { op: 'xor', args: [p, q.a] };
    if (p.op === 'not') return { op: 'xor', args: [p.a, q] };
    return NOT({ op: 'xor', args: [p, q] });
  };
  law({ id: 'xor-fold', name: 'Recognise an XOR', forms: ["XY' + X'Y = X ⊕ Y", "XY + X'Y' = (X ⊕ Y)'"],
    find: (n) => (n.op === 'or' ? upairs(n.args.length).filter(([i, j]) => foldOf(n, i, j)).map((a) => ({ args: a })) : []),
    make: (n, o) => {
      const [i, j] = o.args || [];
      const r = n.op === 'or' ? foldOf(n, i, j) : null;
      if (!r) return { why: "This needs two products of the shape XY' and X'Y (or XY and X'Y')." };
      const args = []; n.args.forEach((x, q) => { if (q === i) args.push(r); else if (q !== j) args.push(x); });
      return { node: rebuild('or', args), say: s(n.args[i]) + ' + ' + s(n.args[j]) + ' = ' + s(r) + '.' };
    },
    whyNot: (n) => (n.op === 'or' ? 'No two terms of ' + s(n) + " have the shape XY' + X'Y." : 'This law applies to a sum.') });
  law({ id: 'xor-not', name: 'Complement through XOR', forms: ["(X ⊕ Y)' = X' ⊕ Y = X ⊕ Y'"],
    find: (n) => (n.op === 'not' && isX(n.a) ? [{ dir: 'push' }] : isX(n) ? n.args.map((a, i) => (a.op === 'not' ? { dir: 'pull', args: [i] } : null)).filter(Boolean) : []),
    make: (n, o) => {
      if (o.dir === 'pull') {
        const i = (o.args || [])[0];
        if (!isX(n) || !n.args[i] || n.args[i].op !== 'not') return { why: 'Pick a complemented operand of an XOR.' };
        const r = NOT({ op: 'xor', args: n.args.map((x, q) => (q === i ? x.a : x)) });
        return { node: r, say: 'Move the complement of ' + s(n.args[i]) + ' outside: ' + s(n) + ' = ' + s(r) + '.' };
      }
      if (!(n.op === 'not' && isX(n.a))) return { why: s(n) + ' is not the complement of an XOR.' };
      const r = { op: 'xor', args: n.a.args.map((x, q) => (q === 0 ? NOT(x) : x)) };
      return { node: r, say: 'Complementing an XOR complements one operand: ' + s(n) + ' = ' + s(r) + '.', opts: { dir: 'push' } };
    },
    whyNot: (n) => s(n) + ' is neither the complement of an XOR nor an XOR with a complemented operand.' });

  B.laws = LAWS.map((l) => ({ id: l.id, name: l.name, forms: l.forms, search: l.search !== false }));
  const byId = new Map(LAWS.map((l) => [l.id, l]));
  B.lawById = (id) => byId.get(id);

  // ---- applying -------------------------------------------------------------------------------------------------------
  /**
   * applyLaw(expr, lawId, path, opts) -> {ok:true, expr, before, after, step} | {ok:false, why}
   * Without opts.args the law picks the first place it fits inside the chosen subterm.
   */
  function applyLaw(expr, id, path, opts) {
    expr = P(expr); path = path || []; opts = Object.assign({}, opts || {});
    const L = byId.get(id);
    if (!L) return { ok: false, why: 'There is no law called ' + id + '.' };
    const node = B.at(expr, path);
    if (!node) return { ok: false, why: 'There is no subterm at that place.' };
    const pick = opts.args || opts.order || opts.dir === 'introduce' || (opts.dir === 'group');
    if (!pick && id !== 'commutative') {
      const cands = L.find(node).filter((c) => !opts.dir || c.dir === opts.dir || (!c.dir));
      if (!cands.length) return { ok: false, why: L.whyNot(node) };
      opts = Object.assign({}, cands[0], opts.common ? { common: opts.common } : {});
    }
    const r = L.make(node, opts);
    if (r.why) return { ok: false, why: r.why };
    const out = B.replaceAt(expr, path, r.node);
    const step = { law: id, name: L.name, path: path.slice(), opts: r.opts || opts, before: node, after: r.node, say: r.say };
    return { ok: true, expr: out, before: node, after: r.node, step };
  }
  B.applyLaw = applyLaw;
  /** every law that applies at a subterm, with what it would give */
  B.lawsAt = (expr, path) => {
    expr = P(expr);
    const node = B.at(expr, path || []), out = [];
    for (const L of LAWS) for (const o of L.find(node)) { const r = L.make(node, o); if (!r.why) out.push({ law: L.id, name: L.name, opts: r.opts || o, after: r.node, say: r.say }); }
    return out;
  };
  /** every possible single step in a whole expression (laws marked search:false only when asked) */
  function moves(expr, opts) {
    opts = opts || {};
    const out = [];
    for (const { path, node } of B.paths(expr)) {
      for (const L of LAWS) {
        if (L.search === false && !(opts.laws && opts.laws.includes(L.id))) continue;
        if (opts.laws && !opts.laws.includes(L.id)) continue;
        for (const o of L.find(node)) {
          const r = L.make(node, o);
          if (r.why) continue;
          out.push({ law: L.id, path, opts: r.opts || o, expr: B.replaceAt(expr, path, r.node), say: r.say });
        }
        if (L.id === 'consensus' && opts.addConsensus && (node.op === 'or' || node.op === 'and')) {
          for (const [i, j] of upairs(node.args.length)) { const r = L.make(node, { dir: 'add', args: [i, j] }); if (!r.why) out.push({ law: L.id, path, opts: r.opts, expr: B.replaceAt(expr, path, r.node), say: r.say }); }
        }
      }
    }
    return out;
  }
  B.moves = (expr, opts) => moves(P(expr), opts);

  // ---- proofs ----------------------------------------------------------------------------------------------------------
  /** a proof starts at an expression; steps are added with B.step(proof, law, path, opts) */
  B.proof = (start, goal) => ({ start: P(start), goal: goal == null ? null : P(goal), steps: [], current: P(start) });
  B.step = (proof, id, path, opts) => {
    const r = applyLaw(proof.current, id, path, opts);
    if (!r.ok) return r;
    proof.steps.push(Object.assign({}, r.step, { expr: r.expr }));
    proof.current = r.expr;
    r.done = proof.goal ? B.key(r.expr) === B.key(proof.goal) : false;
    return r;
  };
  B.undo = (proof) => { proof.steps.pop(); proof.current = proof.steps.length ? proof.steps[proof.steps.length - 1].expr : proof.start; return proof; };
  /** re-apply every step from the start and check each one: {ok, exprs, failAt, why} */
  B.replay = (proof) => {
    let e = P(proof.start);
    const exprs = [e];
    for (let i = 0; i < proof.steps.length; i++) {
      const st = proof.steps[i];
      const r = applyLaw(e, st.law, st.path, st.opts);
      if (!r.ok) return { ok: false, exprs, failAt: i, why: r.why };
      if (!B.prove(e, r.expr).equal) return { ok: false, exprs, failAt: i, why: 'step ' + (i + 1) + ' changed the function' };
      e = r.expr; exprs.push(e);
    }
    return { ok: true, exprs, reached: proof.goal ? B.key(e) === B.key(proof.goal) : null };
  };
  /** the proof as lines of text: the start, then "= expr    law" for each step */
  B.printProof = (proof, style) => {
    const rows = [[B.toString(proof.start, style), '']];
    for (const st of proof.steps) rows.push(['= ' + B.toString(st.expr, style), st.name]);
    const w = Math.max(...rows.map((r) => [...r[0]].length)) + 4;
    return rows.map((r, i) => (i ? '' : '  ') + r[0] + (r[1] ? ' '.repeat(w - [...r[0]].length - (i ? 0 : 2)) + r[1] : '')).join('\n');
  };
  B.proofJSON = (proof) => ({ start: B.toString(proof.start), goal: proof.goal ? B.toString(proof.goal) : null, steps: proof.steps.map((st) => ({ law: st.law, path: st.path, opts: st.opts })) });
  B.proofFromJSON = (j) => {
    const pr = B.proof(j.start, j.goal);
    for (const st of j.steps) { const r = B.step(pr, st.law, st.path, st.opts); if (!r.ok) throw new Error('step ' + (pr.steps.length + 1) + ': ' + r.why); }
    return pr;
  };

  // ---- hints and search ---------------------------------------------------------------------------------------------------
  class Heap {
    constructor() { this.a = []; }
    push(x) { const a = this.a; a.push(x); let i = a.length - 1; while (i) { const p = (i - 1) >> 1; if (a[p].pri <= a[i].pri) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
    pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l].pri < a[m].pri) m = l; if (r < a.length && a[r].pri < a[m].pri) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
    get size() { return this.a.length; }
  }
  /**
   * best-first search over law applications. goal: a target expression, or null for fewest literals.
   * -> {found, best:{expr, steps}, expanded}
   */
  function search(start, goal, opts) {
    opts = opts || {};
    const budget = opts.budget || 3000;
    const lits = (e) => B.literals(e) + 0.01 * B.size(e);
    const gk = goal ? B.key(goal) : null, gl = goal ? lits(goal) : 0;
    const cap = Math.max(2 * B.size(start), B.size(start) + 14, goal ? B.size(goal) + 14 : 0);
    const ck = (e) => (e.op === 'var' ? e.name : e.op === 'const' ? String(e.v) : e.op === 'not' ? '~' + ck(e.a) : e.op + '(' + e.args.map(ck).sort().join(',') + ')');
    const seen = new Set([ck(start)]);
    const heap = new Heap();
    const h = (e) => (goal ? Math.abs(lits(e) - gl) : lits(e));
    heap.push({ e: start, steps: [], pri: h(start) });
    let best = { expr: start, steps: [], score: lits(start) }, expanded = 0, lastGain = 0;
    const stall = opts.stall || (goal ? Infinity : 250);
    if (goal && B.key(start) === gk) return { found: true, best, expanded };
    while (heap.size && expanded < budget && expanded - lastGain < stall) {
      const cur = heap.pop();
      expanded++;
      for (const mv of moves(cur.e, opts)) {
        const sk = ck(mv.expr);
        if (seen.has(sk) || B.size(mv.expr) > cap) continue;
        seen.add(sk);
        const kk = goal ? B.key(mv.expr) : null;
        const steps = cur.steps.concat([{ law: mv.law, path: mv.path, opts: mv.opts, say: mv.say, expr: mv.expr }]);
        if (goal && kk === gk) return { found: true, best: { expr: mv.expr, steps }, expanded };
        const sc = lits(mv.expr);
        if (!goal && (sc < best.score || (sc === best.score && steps.length < best.steps.length && best.steps.length))) { if (sc < best.score) lastGain = expanded; best = { expr: mv.expr, steps, score: sc }; }
        if (goal && h(mv.expr) < h(best.expr)) best = { expr: mv.expr, steps, score: sc };
        heap.push({ e: mv.expr, steps, pri: h(mv.expr) + 0.35 * steps.length });
      }
    }
    return { found: false, best, expanded };
  }
  /**
   * hint(expr, {target, budget}) -> {step:{law, name, path, opts, say} | null, plan:[...], say}
   * With a target it looks for a chain of laws that reaches it; otherwise one toward fewer literals.
   */
  B.hint = (expr, opts) => {
    opts = opts || {};
    expr = P(expr);
    const target = opts.target != null ? P(opts.target) : null;
    if (target) {
      const pr = B.prove(expr, target);
      if (!pr.equal) return { step: null, plan: [], refuted: pr, say: 'No law can get there: the two are not equal. ' + pr.say };
      if (B.key(expr) === B.key(target)) return { step: null, plan: [], say: 'You are already there.' };
    }
    const r = search(expr, target, opts);
    const plan = r.best.steps.map((st) => Object.assign({}, st, { name: byId.get(st.law).name }));
    if (target && r.found) return { step: plan[0], plan, say: 'Try ' + plan[0].name + ': ' + plan[0].say + ' (' + plan.length + ' step' + (plan.length === 1 ? '' : 's') + ' to the target from here.)' };
    if (!target && plan.length && B.literals(r.best.expr) < B.literals(expr)) return { step: plan[0], plan, say: 'Try ' + plan[0].name + ': ' + plan[0].say + ' (This leads to ' + B.toString(r.best.expr) + ', with ' + B.literals(r.best.expr) + ' literals.)' };
    if (target && plan.length) return { step: plan[0], plan, partial: true, say: 'No full chain was found within the search; ' + plan[0].name + ' moves closer: ' + plan[0].say };
    return { step: null, plan: [], say: target ? 'No chain of laws was found within the search budget.' : 'No law shortens this further within the search.' };
  };
  /** a whole proof from expr to (near) fewest literals, by repeated search */
  B.simplify = (expr, opts) => {
    opts = opts || {};
    const pr = B.proof(expr);
    for (let round = 0; round < 12; round++) {
      const r = search(pr.current, null, opts);
      if (!r.best.steps.length || B.literals(r.best.expr) + 0.01 * B.size(r.best.expr) >= B.literals(pr.current) + 0.01 * B.size(pr.current)) break;
      for (const st of r.best.steps) B.step(pr, st.law, st.path, st.opts);
    }
    return pr;
  };
  /** a proof that a equals b, searched for; {proof, found} (or the counterexample when they differ) */
  B.proveByLaws = (a, b, opts) => {
    a = P(a); b = P(b);
    const pr = B.prove(a, b);
    if (!pr.equal) return { found: false, refuted: pr };
    const r = search(a, b, opts);
    const proof = B.proof(a, b);
    if (r.found) for (const st of r.best.steps) B.step(proof, st.law, st.path, st.opts);
    return { found: r.found, proof, expanded: r.expanded };
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
