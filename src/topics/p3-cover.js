// Part 3, covering a map: prime and essential prime implicants, the selection rule for what is left, cyclic
// maps that need a choice, don't-cares used only where they help, and the same map read as a product of
// sums from its 0s.
(function (S) {
  'use strict';
  const B = () => S.Bool;
  const K = () => S.Kit.km;
  const P3 = S.P3;

  S.family({ id: 'p3-cover', part: 'minimise', order: 20, title: 'Covering a map', blurb: 'From the 1s to a minimal expression: the prime implicants, the essential ones, a cheap choice for the rest, maps that force a choice, don\'t-cares, and the product of sums from the 0s.' });

  const fnInputs = (def, n) => [P3.nInput(n || 4, ['3', '4']), { id: 'f', kind: 'text', label: 'Function', def, check: P3.fnCheck() }];
  /** the cells of the target that exactly one useful prime covers */
  const loneCells = (sv, form) => {
    const Bo = B(), on = Bo._target(sv.g.fn, form).on;
    return on.filter((m) => sv.primes.filter((p) => Bo.covers(p.cube, m)).length === 1);
  };
  /** every cheapest cover, by trying the subsets of the primes (maps are small) */
  P3.allMinimal = function (sv, form) {
    const Bo = B(), on = Bo._target(sv.g.fn, form).on, ps = sv.primes;
    const best = sv.res.cost, k = best.terms, out = [];
    const pick = (start, chosen) => {
      if (chosen.length === k) {
        if (on.every((m) => chosen.some((p) => Bo.covers(p.cube, m))) && chosen.reduce((a, p) => a + p.lits, 0) === best.literals) out.push(chosen.slice());
        return;
      }
      for (let i = start; i < ps.length && out.length < 6; i++) { chosen.push(ps[i]); pick(i + 1, chosen); chosen.pop(); }
    };
    pick(0, []);
    return out;
  };
  const sumText = (cover, pos) => (cover.length ? cover.map((p) => (pos && cover.length > 1 && p.lits > 1 ? '(' + p.text + ')' : p.text)).join(pos ? '' : ' + ') : pos ? '1' : '0');

  // ---------------------------------------------------------------------------------------------------
  // Prime and essential prime implicants
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'kmap-primes', family: 'p3-cover', order: 10, title: 'Prime and essential prime implicants',
    blurb: 'Circle every group that cannot grow: those are the prime implicants. A 1 that only one of them covers makes that one essential, so it is in every minimal answer. Watch the primes appear, then the lone cells pick out the essentials.',
    inputs: fnInputs('Σm(0, 1, 2, 5, 6, 7, 8, 9, 10, 14)'),
    presets: [
      { label: 'Six primes, two essential', values: { n: '4', f: 'Σm(0, 1, 2, 5, 6, 7, 8, 9, 10, 14)' } },
      { label: 'Every prime essential', values: { n: '4', f: 'Σm(0, 2, 5, 7, 8, 10, 13, 15)' } },
      { label: 'A prime that is never needed', values: { n: '3', f: "AB + A'C + BC" } },
      { label: 'Overlapping primes, 4 variables', values: { n: '4', f: 'Σm(2, 3, 5, 7, 10, 11, 13, 14, 15)' } },
    ],
    run(inp) {
      const fn = P3.readFn(inp.f, +inp.n), sv = P3.solver(fn, 'sop');
      const frames = P3.solveFrames(sv);
      const lone = loneCells(sv, 'sop');
      frames.forEach((f) => { if (f.meta.kind === 'primes') f.meta.lone = lone; });
      const ess = sv.res.essentials.map((p) => p.text);
      return { frames, def: { sections: [{ id: 'f', kind: 'math', title: 'The function', text: 'F = ' + B().sigma(fn) + '\nPrimes: ' + sv.primes.map((p) => p.text).join(', ') + '\nEssential: ' + (ess.length ? ess.join(', ') : 'none') + '\nF = ' + sv.res.text }] }, counters: [] };
    },
    predict: [
      { at: (f) => f.meta && f.meta.kind === 'kmap-cells', pick: 'option', ask: 'How many prime implicants does this map have?', options: (fr) => { const n = fr.filter((f) => f.meta && f.meta.kind === 'prime').length; return [...new Set([Math.max(1, n - 2), Math.max(1, n - 1), n, n + 1, n + 2])].map(String); }, answer: (fr) => String(fr.filter((f) => f.meta && f.meta.kind === 'prime').length), explain: (fr) => fr.find((f) => f.meta && f.meta.kind === 'primes').say },
      { at: (f) => f.meta && f.meta.kind === 'primes' && f.meta.lone.length, pick: 'item', ask: 'Click a 1 that lies in only one prime group: it will make that group essential.', answer: (fr, i) => fr[i].meta.lone.map((m) => 'km:c:' + m), explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'What makes a prime implicant essential?', options: ['It is the largest group', 'It covers some 1 that no other prime covers', 'It wraps round an edge', 'It has the fewest literals'], answer: 1, why: 'That lone 1 can only be covered by this prime, so every cover must include it.' },
      { q: 'A prime implicant is a group that…', options: ['covers at least one 1', 'cannot be doubled without taking in a 0', 'is essential', 'has one literal'], answer: 1, why: 'Prime means maximal: no bigger group of 1s and don\'t-cares contains it.' },
      { q: 'In F = AB + A\'C + BC, which term is a prime implicant that no minimal cover needs?', options: ['AB', "A'C", 'BC', 'none'], answer: 2, why: 'BC is prime, but its two 1s (011 and 111) are covered by A\'C and AB, the essentials. It is the consensus term.' },
      { q: 'Must a minimal SOP use every essential prime implicant?', options: ['Yes', 'No', 'Only for 4 variables', 'Only when there are no don\'t-cares'], answer: 0, why: 'Each one is the only way to cover one of the 1s.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // The selection rule
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'kmap-select', family: 'p3-cover', order: 20, title: 'After the essentials: the selection rule',
    blurb: 'Take the essential primes first. Then look only at the 1s still uncovered and cover them with as few, as large, groups as possible; a prime whose 1s are all covered already is left out, even if it is big.',
    inputs: fnInputs('Σm(1, 3, 5, 6, 7, 10, 11, 13, 14)'),
    presets: [
      { label: 'Two left over after the essentials', values: { n: '4', f: 'Σm(1, 3, 5, 6, 7, 10, 11, 13, 14)' } },
      { label: 'One cell, three ways to cover it', values: { n: '4', f: 'Σm(0, 1, 2, 5, 6, 7, 8, 9, 10, 14)' } },
      { label: 'A big prime that is not needed', values: { n: '4', f: 'Σm(1, 5, 6, 7, 11, 12, 13, 15)' } },
      { label: '3 variables', values: { n: '3', f: 'Σm(0, 1, 3, 6, 7)' } },
    ],
    run(inp) {
      const Bo = B(), fn = P3.readFn(inp.f, +inp.n), sv = P3.solver(fn, 'sop');
      // the essentials together, then the rest in detail
      const frames = [];
      const steps = sv.steps;
      const first = steps.find((s) => s.kind === 'primes');
      const lastEss = [...steps].reverse().find((s) => s.kind === 'ess');
      frames.push({ items: sv.scene(steps[0].st), say: 'F = ' + Bo.sigma(fn) + '. First the prime implicants and the essential ones.', meta: { kind: 'start' } });
      if (first) frames.push({ items: sv.scene(first.st), say: first.say, meta: { kind: 'primes', essN: sv.res.essentials.length } });
      if (lastEss) frames.push({ items: sv.scene(lastEss.st), say: 'Essential: ' + sv.res.essentials.map((p) => p.text).join(', ') + ' (each holds a 1 that nothing else covers, marked ★). These go into F first.', meta: { kind: 'ess-all' } });
      for (const s of steps.filter((x) => ['left', 'choose', 'skip', 'result'].includes(x.kind))) {
        const f = { items: sv.scene(s.st), say: s.say, meta: Object.assign({ kind: s.kind }, s.meta || {}) };
        if (s.kind === 'left') {
          const cand = s.meta.candidates.map((l) => sv.byLabel.get(l));
          f.say += ' Prefer a group that takes all of them at once; failing that, the largest.';
          f.meta.cand = cand.map((p) => p.text);
          f.meta.chosen = steps.filter((x) => x.kind === 'choose').map((x) => sv.byLabel.get(x.meta.label).text);
        }
        if (s.kind === 'result') f.mark = 'cover';
        frames.push(f);
      }
      for (const f of frames) f.narrowView = P3.narrow(sv);
      if (!steps.some((x) => x.kind === 'left')) frames.splice(frames.length - 1, 0, { items: sv.scene(lastEss ? lastEss.st : steps[0].st), say: 'The essentials already cover every 1: nothing is left to choose, and every other prime is left out.', meta: { kind: 'none-left' } });
      return { frames, def: { sections: [{ id: 'r', kind: 'math', title: 'The order of work', text: '1. find every prime implicant\n2. take the essential ones\n3. cover the 1s still left with as few,\n   as large, groups as possible\n4. leave out every other group' }] } };
    },
    predict: [
      { at: (f) => f.meta && f.meta.kind === 'left', pick: 'option', ask: 'Which group should cover the 1s that are left?', options: (fr, i) => fr[i].meta.cand, answer: (fr, i) => fr[i].meta.chosen, explain: (fr, i) => fr[i + 1].say },
      { at: (f) => f.meta && f.meta.kind === 'primes', pick: 'option', ask: 'How many prime implicants are essential here?', options: (fr, i) => [...new Set([0, 1, 2, 3, 4, fr[i].meta.essN])].sort((a, b) => a - b).map(String), answer: (fr, i) => String(fr[i].meta.essN), explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'After the essential primes, which 1s still matter?', options: ['All of them', 'Only those no essential prime covers', 'Only the don\'t-cares', 'Only those in the largest group'], answer: 1, why: 'The essentials cover their 1s already; the choice is only about the rest.' },
      { q: 'A large prime implicant covers only 1s that are already covered. Should it be used?', options: ['Yes, it is large', 'No, it adds a term for nothing', 'Only if it wraps', 'Only in POS'], answer: 1, why: 'Every term costs a gate; one that covers nothing new is redundant.' },
      { q: 'Two primes could cover the last uncovered 1: one with 2 literals, one with 3. Which is better?', options: ['The 2-literal one', 'The 3-literal one', 'Both', 'Either, they cost the same'], answer: 0, why: 'Fewer literals means a bigger group and a smaller gate.' },
      { q: 'Is the minimal cover always unique?', options: ['Yes', 'No: some maps have several covers of the same cost', 'Only with don\'t-cares', 'Only for 3 variables'], answer: 1, why: 'Cyclic maps, for instance, have more than one cheapest cover.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Cyclic maps: no essentials, a choice to make
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'kmap-cyclic', family: 'p3-cover', order: 30, title: 'Cyclic maps: no essentials, a choice to make',
    blurb: 'Here every 1 lies in two prime groups, so no prime is essential and the map goes round in a cycle. Pick any one prime; then the rest is forced. Different first picks give different answers of the same cost.',
    inputs: fnInputs('Σm(0, 1, 2, 5, 6, 7)', 3),
    presets: [
      { label: 'The 3-variable cycle', values: { n: '3', f: 'Σm(0, 1, 2, 5, 6, 7)' } },
      { label: 'A 4-variable cycle of six', values: { n: '4', f: 'Σm(1, 4, 5, 8, 9, 12)' } },
      { label: 'A cycle of eight primes', values: { n: '4', f: 'Σm(2, 3, 5, 7, 10, 12, 13, 14)' } },
      { label: 'Not cyclic, for contrast', values: { n: '3', f: 'Σm(0, 1, 2, 5, 7)' } },
    ],
    run(inp) {
      const Bo = B(), fn = P3.readFn(inp.f, +inp.n), sv = P3.solver(fn, 'sop');
      const frames = P3.solveFrames(sv).filter((f) => f.meta.kind !== 'result');
      const covers = P3.allMinimal(sv, 'sop').slice(0, 2);
      const cyclic = !sv.res.essentials.length && sv.primes.length > 1;
      const on = Bo.minterms(fn);
      const counts = on.map((m) => sv.primes.filter((p) => Bo.covers(p.cube, m)).length);
      const pi = frames.findIndex((f) => f.meta.kind === 'primes');
      if (pi >= 0) frames.splice(pi + 1, 0, { items: frames[pi].items, say: cyclic ? 'Count the groups through each 1: ' + on.map((m, i) => m + ' is in ' + counts[i]).join(', ') + '. No 1 lies in only one group, so no prime is essential: the map is cyclic.' : 'Some 1s lie in one group only, so this map has essential primes and is not cyclic: compare it with the cyclic presets.', meta: { kind: 'count', cyclic } });
      // the alternatives side by side
      const Fm = K().frame(sv.g);
      const side = [];
      const span = Math.max(Fm.W, ...covers.map((cv) => P3.chipsWidth(cv.map((p) => p.text), 15, 'F =') - (Fm.W - Fm.x0) + Fm.W));
      covers.forEach((cv, k) => {
        const px = k * (span + 60);
        const map = K().draw({ geometry: sv.g, prefix: 'alt' + k, x: px, y: 0, groups: cv.map((p) => ({ key: p.label, cells: p.group.cells, tone: sv.tone.get(p.label), cls: 'strong' })) });
        side.push(...map.items);
        const t = cv.map((p) => ({ key: p.label, text: p.text, tone: sv.tone.get(p.label), src: map.pieces(p.label)[0] }));
        side.push(...K().chips('altf' + k, t, px + Fm.x0 + Fm.W / 2 - Fm.x0 / 2 - 10, Fm.H + 30, { lead: 'F =', size: 15 }).items);
      });
      const cost = sv.res.cost;
      frames.push({ items: side, say: covers.length > 1 ? 'Two answers, both minimal: ' + covers.map((cv) => 'F = ' + sumText(cv)).join(' and ') + '. Each has ' + P3.plural(cost.terms, 'term') + ' and ' + P3.plural(cost.literals, 'literal') + '. Which one you get depends only on the first group you pick.' : 'There is only one cheapest cover here: F = ' + sv.res.text + ' (' + P3.plural(cost.literals, 'literal') + ').', mark: 'cover', meta: { kind: 'alts' } });
      return { frames, def: { sections: [{ id: 'f', kind: 'math', title: 'The function', text: 'F = ' + Bo.sigma(fn) + '\nPrimes: ' + sv.primes.map((p) => p.text).join(', ') + '\nMinimal covers: ' + covers.map((cv) => sumText(cv)).join('\n                ') }] } };
    },
    predict: [
      { at: (f) => f.meta && f.meta.kind === 'primes', pick: 'option', ask: 'How many of these primes are essential?', options: ['0', '1', '2', '3'], answer: (fr) => String(fr.filter((f) => f.meta && f.meta.kind === 'ess').length), explain: (fr, i) => fr[i + 1].say },
      { at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.kind === 'alts', pick: 'option', ask: 'How many different minimal covers does this map have (up to 2 shown)?', options: ['1', '2'], answer: (fr) => (/^Two answers/.test(fr[fr.length - 1].say) ? '2' : '1'), explain: (fr) => fr[fr.length - 1].say },
    ],
    quiz: [
      { q: 'What makes a map cyclic?', options: ['It wraps round its edges', 'Every 1 is covered by at least two primes, so none is essential', 'It has don\'t-cares', 'It has an odd number of 1s'], answer: 1, why: 'With no essential prime the covering problem has no forced first step.' },
      { q: 'In a cyclic map, after you choose one prime…', options: ['you must start again', 'the remaining choices are usually forced', 'every other prime is needed', 'the answer is not minimal'], answer: 1, why: 'The choice breaks the cycle; the rest becomes essential relative to what is left.' },
      { q: 'F = Σm(0, 1, 2, 5, 6, 7) has two minimal SOPs. How many literals does each have?', options: ['4', '5', '6', '9'], answer: 2, why: 'Three terms of two literals each: for example A\'B\' + BC\' + AC.' },
      { q: 'Which systematic method resolves a cyclic chart?', options: ['Gray coding', 'Petrick\'s method', 'De Morgan\'s law', 'Bubble pushing'], answer: 1, why: 'Petrick\'s method lists every way to cover the remaining minterms and picks the cheapest.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Don't-cares
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'kmap-dc', family: 'p3-cover', order: 40, title: 'Don\'t-cares: used only when they help',
    blurb: 'Inputs that never happen (or whose output nobody reads) are marked X. An X may join a group as a 1 when that makes the group bigger, and is left as 0 otherwise. Compare the answer with and without them.',
    inputs: fnInputs('Σm(3, 8, 9, 11, 12) + d(10, 13, 15)'),
    presets: [
      { label: 'Three Xs, two of them used', values: { n: '4', f: 'Σm(3, 8, 9, 11, 12) + d(10, 13, 15)' } },
      { label: 'BCD digits divisible by 3 (10–15 never occur)', values: { n: '4', f: 'Σm(0, 3, 6, 9) + d(10, 11, 12, 13, 14, 15)' } },
      { label: 'BCD digits 5 or more', values: { n: '4', f: 'Σm(5, 6, 7, 8, 9) + d(10, 11, 12, 13, 14, 15)' } },
      { label: 'An X that does not help', values: { n: '3', f: 'Σm(0, 1, 5) + d(3, 6)' } },
    ],
    run(inp) {
      const Bo = B(), fn = P3.readFn(inp.f, +inp.n);
      const plainFn = Bo.fromMinterms(fn.vars, [...fn.ones]);
      const plain = Bo.minimise(plainFn), sv = P3.solver(fn, 'sop');
      const dcs = Bo.dontCares(fn);
      const used = dcs.filter((m) => sv.res.cover.some((p) => Bo.covers(p.cube, m)));
      const unused = dcs.filter((m) => !used.includes(m));
      const frames = P3.solveFrames(sv).filter((f) => f.meta.kind !== 'result');
      frames[0].say = 'F = ' + Bo.sigma(fn) + '. The X cells (' + P3.list(dcs) + ') are don\'t-cares: F may be 0 or 1 there, whichever gives the smaller circuit.';
      frames[0].meta.used = used;
      // what happens to each X
      const resultSt = sv.steps[sv.steps.length - 1].st;
      const shown = (m) => (used.includes(m) ? 1 : unused.includes(m) ? 0 : Bo.value(fn, m));
      frames.push({ narrowView: P3.narrow(sv), items: sv.scene(resultSt, { text: shown, cls: (m) => (dcs.includes(m) ? 'hot' : '') }), say: 'F = ' + sv.res.text + '. ' + (used.length ? 'The don\'t-care' + (used.length === 1 ? ' ' : 's ') + used.join(', ') + (used.length === 1 ? ' was' : ' were') + ' taken as 1 inside a group' : 'No don\'t-care was needed') + (unused.length ? '; ' + unused.join(', ') + (unused.length === 1 ? ' is' : ' are') + ' left as 0, since no group needed ' + (unused.length === 1 ? 'it' : 'them') : '') + '.', meta: { kind: 'fate' } });
      // without the don't-cares, side by side
      const g2 = Bo.kmap(plainFn), Fm = K().frame(g2);
      const tw = (t) => S.geom.textWidth(t, 15, { mono: true });
      const off = Math.max(Fm.W + 80, tw(plain.text + '  (00 literals)') / 2 + tw(sv.res.text + '  (00 literals)') / 2 + 40);
      const left = K().draw({ geometry: g2, prefix: 'pl', x: 0, y: 0, groups: plain.cover.map((p, i) => ({ key: 'p' + i, cells: p.minterms, tone: (i + 3) % 6, cls: 'strong' })) });
      const right = K().draw({ geometry: sv.g, prefix: 'km', x: off, y: 0, text: shown, groups: sv.res.cover.map((p) => ({ key: p.label, cells: p.group.cells, tone: sv.tone.get(p.label), cls: 'strong' })) });
      const items = left.items.concat(right.items);
      items.push({ key: 'cap:l', kind: 'text', x: Fm.x0 + (Fm.W - Fm.x0) / 2, y: -26, text: 'Xs taken as 0', anchor: 'middle', cls: 'title' });
      items.push({ key: 'cap:r', kind: 'text', x: off + Fm.x0 + (Fm.W - Fm.x0) / 2, y: -26, text: 'Xs used where they help', anchor: 'middle', cls: 'title' });
      items.push(P3.note('res:l', plain.text + '  (' + P3.plural(plain.cost.literals, 'literal') + ')', Fm.x0 + (Fm.W - Fm.x0) / 2, Fm.H + 34, 'mono'));
      items.push(P3.note('res:r', sv.res.text + '  (' + P3.plural(sv.res.cost.literals, 'literal') + ')', off + Fm.x0 + (Fm.W - Fm.x0) / 2, Fm.H + 34, 'mono'));
      const saved = plain.cost.literals - sv.res.cost.literals;
      frames.push({ items, say: 'Without the don\'t-cares, F = ' + plain.text + ' (' + P3.plural(plain.cost.terms, 'term') + ', ' + P3.plural(plain.cost.literals, 'literal') + '). With them, F = ' + sv.res.text + ' (' + P3.plural(sv.res.cost.terms, 'term') + ', ' + P3.plural(sv.res.cost.literals, 'literal') + ')' + (saved > 0 ? ': ' + P3.plural(saved, 'literal') + ' saved.' : ': the same cost, so here they did not help.'), mark: 'compare', meta: { kind: 'compare' } });
      return { frames, def: { sections: [{ id: 'f', kind: 'math', title: 'The function', text: 'F = ' + Bo.sigma(fn) + '\nWithout Xs: ' + plain.text + '\nWith Xs:    ' + sv.res.text }] } };
    },
    predict: [
      { at: (f) => f.meta && f.meta.kind === 'kmap-cells' && f.meta.used && f.meta.used.length, pick: 'item', ask: 'Click a don\'t-care (X) that will end up inside a chosen group.', answer: (fr, i) => fr[i].meta.used.map((m) => 'km:c:' + m), explain: (fr) => fr[fr.length - 2].say },
      { at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.kind === 'compare', pick: 'option', ask: 'Do the don\'t-cares make the answer cheaper here?', options: ['Yes', 'No, the same cost'], answer: (fr) => (/saved/.test(fr[fr.length - 1].say) ? 'Yes' : 'No, the same cost'), explain: (fr) => fr[fr.length - 1].say },
    ],
    quiz: [
      { q: 'A don\'t-care cell must be covered by some group.', options: ['True', 'False'], answer: 1, why: 'Its value does not matter, so it need not be covered; it is used only to enlarge groups.' },
      { q: 'Why are the codes 1010 to 1111 don\'t-cares for a function of a BCD digit?', options: ['They are invalid BCD codes, so they never occur', 'They are always 1', 'They are always 0', 'They are even'], answer: 0, why: 'A BCD digit runs from 0000 to 1001; the other six patterns never appear.' },
      { q: 'Can a group consist only of don\'t-cares?', options: ['Yes, and it must be used', 'It may be drawn, but it covers no 1 so it is never needed', 'No, groups cannot hold Xs', 'Only in POS'], answer: 1, why: 'A term that covers no required 1 adds cost and nothing else.' },
      { q: 'In the SOP answer, a don\'t-care inside a chosen group is effectively…', options: ['0', '1', 'unknown', 'Z'], answer: 1, why: 'The circuit outputs 1 for that input, which is allowed.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // SOP from the 1s, POS from the 0s
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'kmap-pos', family: 'p3-cover', order: 50, title: 'SOP from the 1s, POS from the 0s',
    blurb: 'Group the 0s instead of the 1s and you get F\' as a sum of products; De Morgan turns it into F as a product of sums. A variable that is 0 across a group of 0s appears plain in its sum term, a 1 appears complemented. Then compare the two costs.',
    inputs: fnInputs('Σm(0, 1, 2, 3, 5, 7, 8, 10, 12, 14)'),
    presets: [
      { label: 'POS is cheaper', values: { n: '4', f: 'Σm(0, 1, 2, 3, 5, 7, 8, 10, 12, 14)' } },
      { label: 'POS at half the cost', values: { n: '4', f: '(A + B)(C + D)' } },
      { label: 'SOP is cheaper', values: { n: '4', f: "AB + CD'" } },
      { label: '3 variables, the same cost', values: { n: '3', f: 'Σm(1, 3, 4, 6)' } },
      { label: 'Given as a product of maxterms', values: { n: '4', f: 'ΠM(1, 3, 5, 7, 13, 15)' } },
    ],
    run(inp) {
      const Bo = B(), fn = P3.readFn(inp.f, +inp.n);
      const sv = P3.solver(fn, 'pos');
      const zeros = Bo.zeros(fn);
      const zeroCls = (m) => (zeros.includes(m) ? 'zero-on' : '');
      const frames = sv.steps.filter((s) => s.kind !== 'result').map((s) => ({ narrowView: P3.narrow(sv), items: sv.scene(s.st, { cls: zeroCls }), say: s.say.replace('Mark the 0s on the map', 'This time mark the 0s of F (' + P3.list(zeros) + '): they are the 1s of F\''), meta: Object.assign({ kind: s.kind }, s.meta || {}) }));
      // each group of 0s read as a sum term
      const cover = sv.res.cover;
      const ex = cover[0];
      if (ex) {
        const free = Bo.cubeFree(ex.cube, fn.vars), fixed = fn.vars.filter((v) => !free.includes(v));
        const bitsOf = (v) => (ex.cube.bits >> (fn.vars.length - 1 - fn.vars.indexOf(v))) & 1;
        frames.push({ narrowView: P3.narrow(sv), items: sv.scene(sv.steps[sv.steps.length - 1].st, { cls: zeroCls }), say: 'Read a group of 0s: in ' + ex.label + ' (cells ' + ex.minterms.join(', ') + ') ' + fixed.map((v) => v + ' is always ' + bitsOf(v)).join(', ') + '. As a term of F\' that is ' + Bo.toString(Bo.cubeProduct(ex.cube, fn.vars)) + '; complemented by De Morgan it is the sum ' + ex.text + ': a 0 gives the plain variable, a 1 its complement.', meta: { kind: 'read' } });
      }
      frames.push({ narrowView: P3.narrow(sv), items: sv.scene(sv.steps[sv.steps.length - 1].st, { cls: zeroCls }), say: 'F\' = ' + cover.map((p) => Bo.toString(Bo.cubeProduct(p.cube, fn.vars))).join(' + ') + ', so F = (F\')\' = ' + sv.res.text + '.', meta: { kind: 'pos-done' } });
      // the two forms side by side
      const sop = P3.solver(fn, 'sop', { prefix: 'ks' });
      const Fm = K().frame(sv.g), cx = Fm.x0 + (Fm.W - Fm.x0) / 2;
      const off = Math.max(Fm.W + 80, S.geom.textWidth(sop.res.text, 15, { mono: true }) / 2 + S.geom.textWidth(sv.res.text, 15, { mono: true }) / 2 + 50);
      const ls = K().draw({ geometry: sop.g, prefix: 'ks', x: 0, y: 0, groups: sop.res.cover.map((p) => ({ key: p.label, cells: p.group.cells, tone: sop.tone.get(p.label), cls: 'strong' })) });
      const rs = K().draw({ geometry: sv.g, prefix: 'km', x: off, y: 0, cls: zeroCls, groups: cover.map((p) => ({ key: p.label, cells: p.group.cells, tone: sv.tone.get(p.label), cls: 'strong' })) });
      const sc = sop.res.cost, pc = sv.res.cost;
      const items = ls.items.concat(rs.items, [
        { key: 'cap:l', kind: 'text', x: cx, y: -26, text: 'SOP: groups of 1s', anchor: 'middle', cls: 'title' },
        { key: 'cap:r', kind: 'text', x: off + cx, y: -26, text: 'POS: groups of 0s', anchor: 'middle', cls: 'title' },
        P3.note('res:l', sop.res.text, cx, Fm.H + 30, 'mono'), P3.note('res:r', sv.res.text, off + cx, Fm.H + 30, 'mono'),
        P3.note('cost:l', sc.literals + ' literals, ' + sc.gateInputs + ' gate inputs', cx, Fm.H + 56), P3.note('cost:r', pc.literals + ' literals, ' + pc.gateInputs + ' gate inputs', off + cx, Fm.H + 56),
      ]);
      const cmp = Bo.compareForms(fn);
      frames.push({ items, say: cmp.say, mark: 'compare', meta: { kind: 'compare', winner: cmp.winner } });
      return { frames, def: { sections: [{ id: 'f', kind: 'math', title: 'Both forms', text: 'F = ' + Bo.sigma(fn) + ' = ' + Bo.pi(fn) + '\nSOP: ' + sop.res.text + '\nPOS: ' + sv.res.text }] } };
    },
    predict: [
      { at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.kind === 'compare', pick: 'option', ask: 'Which form will be cheaper, counting gate inputs?', options: ['SOP', 'POS', 'Both the same'], answer: (fr) => ({ sop: 'SOP', pos: 'POS', tie: 'Both the same' })[fr[fr.length - 1].meta.winner], explain: (fr) => fr[fr.length - 1].say },
      { at: (f) => f.meta && f.meta.kind === 'kmap-cells', pick: 'option', ask: 'A group of 0s where A = 1 and B = 0 throughout becomes which sum term?', options: ["(A + B')", "(A' + B)", '(A + B)', "(A' + B')"], answer: "(A' + B)", explain: 'A 1 in the group gives the complemented variable and a 0 the plain one: (A\' + B).' },
    ],
    quiz: [
      { q: 'When reading a group of 0s as a sum term, a variable that is 1 throughout the group appears…', options: ['plain', 'complemented', 'not at all', 'twice'], answer: 1, why: 'The group is a product term of F\' with that variable plain; complementing turns it into the complemented literal of a sum.' },
      { q: 'Grouping the 0s of F gives directly…', options: ['F as SOP', "F' as SOP", 'F as XOR', "F' as POS"], answer: 1, why: 'The 0s of F are the 1s of F\'.' },
      { q: 'Which form is cheaper is decided by…', options: ['always SOP', 'always POS', 'comparing the costs for this function', 'the number of variables'], answer: 2, why: 'Some functions have fewer 0s in big blocks, others fewer 1s.' },
      { q: 'A cell that is a don\'t-care may be used in…', options: ['only SOP groups', 'only POS groups', 'either, independently', 'neither'], answer: 2, why: 'The X can be taken as 1 for the SOP and as 0 for the POS; the two answers may treat it differently.' },
    ],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
