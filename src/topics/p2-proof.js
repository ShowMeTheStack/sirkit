// Part 2, algebraic simplification as a game of moves: pick a law, pick the subterm it acts on, and the
// expression is rewritten; every step lands in a proof that can be replayed. A law that does not fit is refused,
// with the reason.
(function (S) {
  'use strict';
  const K = S.Kit, X = K.expr, Geo = S.geom;
  const B = () => S.Bool;
  const wrap = (t, n) => { const out = []; let cur = ''; for (const w of String(t).split(' ')) { if ((cur + ' ' + w).trim().length > n) { out.push(cur.trim()); cur = w; } else cur += ' ' + w; } if (cur.trim()) out.push(cur.trim()); return out; };
  const prime = (t) => String(t).replace(/'/g, '′');

  S.family({ id: 'p2-proof', part: 'algebra', order: 15, title: 'Algebraic simplification', blurb: 'Simplifying by hand is a sequence of moves: each one names a law and the subterm it rewrites. Done carefully, the moves are a proof.' });

  S.topic({
    id: 'proof-game', family: 'p2-proof', order: 10, title: 'Simplification as a proof game',
    blurb: 'Each move picks a law, then the subterm to apply it to, then rewrites. A law that does not fit is refused with the reason. The moves pile up into a proof that the first expression equals the last.',
    inputs: [
      { id: 'f', kind: 'expr', label: 'Start from', def: "XY + XY' + X'Y", check: X.check('Start', 4) },
      { id: 'goal', kind: 'text', label: 'Goal (empty: fewest literals)', def: '', check: (v) => (String(v).trim() ? X.check('Goal', 4)(v) : null) },
      { id: 'wrong', kind: 'choice', label: 'First try a law that does not fit', def: '', options: [{ value: '', label: 'no' }].concat(['absorption', 'demorgan', 'consensus', 'identity', 'uniting', 'complement'].map((id) => ({ value: id, label: id }))) },
    ],
    presets: [
      { label: "XY + XY' + X'Y", values: { f: "XY + XY' + X'Y", goal: '', wrong: '' } },
      { label: 'A refused move first', values: { f: "XY + XY' + X'Y", goal: '', wrong: 'absorption' } },
      { label: "Consensus: AB + A'C + BC", values: { f: "AB + A'C + BC", goal: '', wrong: '' } },
      { label: 'Four minterms to one letter', values: { f: "A'B'C + A'BC + AB'C + ABC", goal: '', wrong: '' } },
      { label: "Toward a goal: (X + Y)(X + Y') = X", values: { f: "(X + Y)(X + Y')", goal: 'X', wrong: 'demorgan' } },
      { label: "A false goal: X + Y = X", values: { f: 'X + Y', goal: 'X', wrong: '' } },
    ],
    counters: [{ id: 'steps', label: 'steps' }, { id: 'lits', label: 'literals' }],
    run(inp) {
      const start = B().parse(inp.f), goal = String(inp.goal).trim() ? B().parse(inp.goal) : null;
      const F = new S.Frames(['steps', 'lits']);
      F.set('lits', B().literals(start));
      let steps = [], refuted = null, found = true;
      if (goal) {
        const r = B().proveByLaws(start, goal);
        if (r.refuted) refuted = r.refuted; else { found = r.found; steps = r.proof.steps; }
      } else steps = B().simplify(start).steps;
      const proof = [{ text: X.text(start), law: 'start' }];
      const SZ = 26, LY = 86, PX = 460;
      const scene = (cur, o) => {
        o = o || {};
        const items = [];
        const ch = X.chips(cur, { prefix: 'E', x: 0, y: 0, size: SZ, lit: o.lit || {}, keyOf: o.keyOf, enter: o.enter, dim: o.dim });
        items.push(...ch.items);
        if (o.box) {
          const bs = o.box.map((p) => ch.span(p, 6)).filter(Boolean);
          if (bs.length) { const u = Geo.union(bs); items.push(Object.assign({ key: 'E:box', kind: 'region', rx: 12, text: '', cls: 'xbox ' + (o.boxCls || 'hot'), audit: 'overlap-ok' }, u)); }
        }
        if (o.card) items.push({ key: 'card', kind: 'cell', x: 0, y: LY, w: 400, h: 26 + 21 * o.card.lines.length, lines: o.card.lines, align: 'left', cls: 'law ' + (o.card.cls || ''), size: 15, enter: 'drop' });
        items.push({ key: 'pt', kind: 'text', x: PX, y: LY - 14, text: 'proof', cls: 'title' });
        const pw = Math.max(300, ...proof.map((p) => Geo.textWidth('= ' + p.text, 14, { mono: true }) + 24));
        proof.forEach((p, i) => {
          items.push({ key: 'pl' + i, kind: 'cell', x: PX, y: LY + i * 40, w: pw, h: 34, text: (i ? '= ' : '') + p.text, align: 'left', cls: 'mono' + (i === proof.length - 1 && i ? ' good' : ''), size: 14, enter: 'drop' });
          if (i) items.push({ key: 'pn' + i, kind: 'text', x: PX + pw + 12, y: LY + i * 40 + 22, text: p.law, cls: 'strong', size: 13, enter: 'drop' });
        });
        return items;
      };
      const say0 = goal ? 'Start from ' + X.text(start) + ' and aim for ' + X.text(goal) + '.' : 'Start from ' + X.text(start) + ' (' + B().literals(start) + ' literals) and aim for as few literals as possible.';
      F.add({ items: scene(start), say: say0 + ' Each move: choose a law, choose where, rewrite.', meta: { start: true } });
      if (inp.wrong) {
        const r = B().applyLaw(start, inp.wrong, []);
        const L = B().lawById(inp.wrong);
        if (!r.ok) {
          F.add({ items: scene(start, { box: ['r'], boxCls: 'bad', card: { lines: [L.name + ': refused'].concat(wrap(r.why.replace(/'/g, '′'), 46)), cls: 'bad' } }), say: 'Try ' + L.name + ' (' + prime(L.forms.join(', ')) + ') on the whole expression. Refused: ' + prime(r.why), mark: 'refused' });
        } else {
          F.add({ items: scene(start, { box: ['r'], card: { lines: [L.name + ' fits here'].concat(L.forms.flatMap((f) => wrap(prime(f), 46))) } }), say: L.name + ' does fit the whole expression here (' + prime(r.step.say || '') + '); the moves below take the path the search found.' });
        }
      }
      if (refuted) {
        F.add({ items: scene(start, { card: { lines: ['No proof can exist'].concat(wrap(prime(refuted.say), 46)), cls: 'bad' } }), mark: 'refuted', say: 'Before searching for moves, check the claim on every row: ' + prime(refuted.say) + ' No chain of laws can join two different functions.' });
        return { frames: F.list };
      }
      let cur = start;
      steps.forEach((st, k) => {
        const L = B().lawById(st.law);
        const path = st.path || [];
        const args = st.opts && st.opts.args;
        const box = args ? args.map((i) => X.pstr(path.concat(i))) : [X.pstr(path)];
        const card = { lines: [L.name].concat(L.forms.flatMap((f) => wrap(prime(f), 46))) };
        F.add({ items: scene(cur, { card }), say: 'Move ' + (k + 1) + ': the law ' + L.name + ', ' + prime(L.forms.join(' and ')) + '.', meta: { law: L.name, k } });
        F.add({ items: scene(cur, { card, box }), say: 'Apply it to ' + prime(B().toString(st.before)) + (args ? ' (operands ' + args.map((i) => i + 1).join(' and ') + (path.length ? ' of the subterm' : '') + ')' : '') + '.', meta: { next: X.text(st.expr), k, cur: X.text(cur) } });
        const oldKeys = new Set(X.tokens(cur).tokens.map((t) => t.path + ':' + t.role + ':' + t.t));
        const nt = X.tokens(st.expr).tokens;
        const lit = {}, enter = {};
        nt.forEach((t) => { if (!oldKeys.has(t.path + ':' + t.role + ':' + t.t)) { lit[t.path] = 'new'; enter[t.path] = 'E:box'; } });
        // the chips that changed get keys of their own, so they grow out of the box rather than morph from a stranger
        const keyOf = (t) => (oldKeys.has(t.path + ':' + t.role + ':' + t.t) ? 'E:' + t.path + ':' + t.role : 'E' + (k + 1) + ':' + t.path + ':' + t.role);
        proof.push({ text: X.text(st.expr), law: L.name });
        F.count('steps'); F.set('lits', B().literals(st.expr));
        cur = st.expr;
        const exactLit = {}; for (const t of nt) if (!oldKeys.has(t.path + ':' + t.role + ':' + t.t)) exactLit[t.path] = 'new';
        F.add({ items: scene(cur, { card, lit: exactLit, keyOf, enter: Object.fromEntries(Object.keys(enter).map((p) => [p, ['E:box']])) }), say: prime(st.say) + ' Now ' + X.text(cur) + ', ' + B().literals(cur) + ' literal' + (B().literals(cur) === 1 ? '' : 's') + '.' });
      });
      const ok = B().prove(start, cur).equal;
      F.add({ items: scene(cur), mark: 'proved', say: (goal ? (found ? 'Goal reached: ' : 'The search did not reach the goal; it got as far as ') : 'No law shortens it further: ') + X.text(start) + ' = ' + X.text(cur) + ', in ' + steps.length + ' move' + (steps.length === 1 ? '' : 's') + '. ' + (ok ? 'Every move kept the function the same, so the chain is a proof (and the truth tables agree on all rows).' : '') });
      return { frames: F.list, def: { sections: [{ id: 'l', kind: 'math', title: 'Laws', text: B().laws.filter((l) => !/^xor/.test(l.id)).map((l) => l.name + ': ' + prime(l.forms[0])).join('\n') }] } };
    },
    predict: [
      { at: (f) => f.meta && f.meta.next && f.meta.k === 0, pick: 'option', options: (fr, i) => { const m = fr[i].meta; const moves = B().moves(B().parse(m.cur.replace(/′/g, "'"))).map((x) => X.text(x.expr)).filter((t) => t !== m.next); return [...new Set([m.next].concat(moves.slice(0, 2)))].sort(); }, ask: 'What will the expression be after this move?', answer: (fr, i) => fr[i].meta.next, explain: (fr, i) => fr[i + 1].say },
      { at: (f, i, fr) => fr[i + 1] && fr[i + 1].mark === 'refuted', pick: 'option', options: ['Yes, with enough moves', 'No, never'], ask: 'Can some chain of laws prove this goal?', answer: 'No, never', explain: (fr, i) => fr[i + 1].say },
      { at: (f, i, fr) => fr[i + 1] && fr[i + 1].mark === 'refused', pick: 'option', options: ['It applies', 'It is refused'], ask: 'Does this law fit the whole expression?', answer: 'It is refused', explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: "XY + XY' simplifies by which law?", options: ['Absorption', 'Uniting', 'De Morgan', 'Consensus'], answer: 1, why: 'XY + XY′ = X(Y + Y′) = X.' },
      { q: "Which law takes X + X'Y to X + Y?", options: ['Absorption (second form)', 'Idempotence', 'Involution', 'Identity'], answer: 0, why: 'Next to X, the X′ inside X′Y is redundant.' },
      { q: 'A move is refused. What does that mean?', options: ['The expression is wrong', 'That law does not match the chosen subterm', 'The function changed', 'The proof is finished'], answer: 1, why: 'Each law needs a particular pattern; the tool says which part does not match.' },
      { q: 'If the truth tables of the start and the goal differ, a chain of laws…', options: ['can still be found', 'cannot exist', 'needs consensus', 'needs De Morgan'], answer: 1, why: 'Every law keeps the function the same, so no chain links different functions.' },
    ],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
