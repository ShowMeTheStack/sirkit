// Part 3, static hazards read from the map: two adjacent 1s held by different terms, the glitch it causes
// when the input between them changes (simulated with the gate delays of the CMOS preset, delays passed on as
// they are so the short pulse shows), and the consensus term that bridges the two groups and removes it.
(function (S) {
  'use strict';
  const B = () => S.Bool;
  const K = () => S.Kit.km;
  const P3 = S.P3;

  S.family({ id: 'p3-hazards', part: 'minimise', order: 90, title: 'Hazards from the map', blurb: 'A minimal cover can glitch: when one input changes between two 1s held by different groups, the output may dip for a moment. The map shows where, and a consensus group removes it.' });

  /** simulate a circuit: settle at env, then flip v at t0; -> {waves: name -> changes, t0, valueAt(t) -> net values} */
  function simulate(circuit, env, v, t0, span) {
    const sim = S.Sim.create(circuit, { tech: 'CMOS', transport: true });
    for (const k of Object.keys(env)) sim.set(k, env[k]);
    sim.run(t0);
    sim.set(v, 1 - env[v]);
    sim.run(span);
    const keyOf = (n) => {
      const cands = [];
      if (n.name) cands.push(n.name);
      for (const r of n.pins) if ((r.part.type === 'IN' || r.part.type === 'OUT') && r.part.params.name) cands.push(r.part.params.name);
      for (const r of n.pins) { const d = r.part.pins.find((q) => q.name === r.pin); if (d && d.dir === 'out') cands.push(r.part.id + '.' + r.pin); }
      return cands.find((k) => sim.waves.has(k));
    };
    const waveOf = (key) => (sim.waves.get(key) || []).filter((c) => c[1] !== 'X' || c[0] > 0).map((c) => [c[0], c[1] === 'X' ? 'x' : c[1]]);
    const at = (w, t) => { let val = 'x'; for (const [tt, vv] of w) if (tt <= t) val = vv; return val; };
    const valueAt = (t) => { const o = {}; for (const n of circuit.nets) { const k = keyOf(n); if (k) o[n.id] = String(at(waveOf(k), t)); } return o; };
    return { sim, waveOf, valueAt, keyOf };
  }
  /** where a wave makes a short pulse after t0: [start, end] or null */
  function pulse(w, t0) {
    const after = w.filter((c) => c[0] > t0);
    for (let i = 0; i + 1 < after.length; i++) if (after[i + 1][1] !== after[i][1]) {
      const before = (w.filter((c) => c[0] <= t0).pop() || [0, 'x'])[1];
      if (String(after[i + 1][1]) === String(before)) return [after[i][0], after[i + 1][0]];
    }
    return null;
  }

  S.topic({
    id: 'hazard-static', family: 'p3-hazards', order: 10, title: 'Static hazards: the glitch and the consensus fix',
    blurb: 'Two neighbouring 1s in different groups: when the input between them changes, one AND gate turns off before the other turns on, and the output dips to 0 for a few nanoseconds. Find the pair on the map, watch the glitch on the waveform, then add the consensus group and watch it vanish.',
    inputs: [
      P3.nInput(3, ['3', '4']),
      { id: 'f', kind: 'text', label: 'F as a sum of products', def: "AC' + BC", check: (v, inp) => { const e = P3.fnCheck()(v, inp); if (e) return e; const r = B().tryParse(v); if (!r.ok) return 'F: ' + r.error.msg; try { B().staticHazards(r.expr, null, 'sop'); } catch (x) { return 'F: write a sum of products, such as AB\' + BC'; } return null; } },
    ],
    presets: [
      { label: 'One hazard, 3 variables', values: { n: '3', f: "AC' + BC" } },
      { label: 'A 4-variable cover with two hazards', values: { n: '4', f: "A'B'D + ABC + BC'D'" } },
      { label: 'A minimal cover that is hazard-free', values: { n: '3', f: "AB + A'C + BC" } },
      { label: 'Groups that touch along a column', values: { n: '4', f: "A'C'D + BCD" } },
    ],
    run(inp) {
      const Bo = B(), n = +inp.n, vs = 'ABCD'.split('').slice(0, n);
      const expr = Bo.parse(inp.f), fn = Bo.fromExpr(expr, vs);
      const terms = (expr.op === 'or' ? expr.args : [expr]);
      const cubes = terms.map((t) => Bo.termCube(t, vs, 'sop')).filter((c) => c && c !== 'empty');
      const hz = Bo.staticHazards(fn, cubes, 'sop');
      const g = Bo.kmap(fn), Fm = K().frame(g);
      const toneOf = (i) => i % 6;
      const groupsFor = (cs, extra) => cs.map((c, i) => ({ key: 't' + Bo.cubeKey(c), cells: Bo.cubeMinterms(c), tone: toneOf(i), cls: 'strong' })).concat(extra || []);
      const mapAt = (groups, hot) => K().draw({ geometry: g, prefix: 'km', x: 0, y: 0, groups, hot, numSize: 12.5 });
      const textOf = (cs) => cs.map((c) => Bo.toString(Bo.cubeProduct(c, vs))).join(' + ');
      const frames = [];
      const ex = (cs) => Bo.toString(Bo.flatten(Bo.OR(cs.map((c) => Bo.cubeProduct(c, vs)))));
      const circOf = (cs) => S.Kit.schem.fromExpr({ F: ex(cs) }, 'and-or', { inputs: vs });
      const c1 = circOf(cubes), r1 = S.Kit.schem.layout(c1);
      const cx = Math.max(Fm.W + 50, 480);
      const waveY = Math.max(Fm.H, r1.bounds.h) + 50;
      frames.push({ items: mapAt(groupsFor(cubes)).items.concat([S.Kit.schem.item('c1', r1, { x: cx, y: 10 })]), say: 'F = ' + textOf(cubes) + ', drawn as AND gates into an OR gate. On the map each term is a group.' });
      if (!hz.hazards.length) {
        frames.push({ items: mapAt(groupsFor(cubes)).items.concat([S.Kit.schem.item('c1', r1, { x: cx, y: 10 })]), say: hz.trace[0].say + ' Whichever single input changes between two 1s, one AND gate stays on throughout, so the output never dips.', meta: { kind: 'none' } });
        frames.push({ items: frames[1].items, say: 'This is why a hazard-free design may keep a term that a minimal cover would drop: here the consensus term is already present.', mark: 'safe' });
        return { frames, def: { sections: [{ id: 'f', kind: 'math', title: 'Cover', text: 'F = ' + textOf(cubes) + '\nNo static-1 hazard' }] } };
      }
      const h = hz.hazards[0];
      const vi = vs.indexOf(h.var);
      frames.push({ items: mapAt(groupsFor(cubes), [h.from, h.to]).items.concat([S.Kit.schem.item('c1', r1, { x: cx, y: 10 }), { key: 'jump', kind: 'edge', from: 'km:c:' + h.from, to: 'km:c:' + h.to, cls: 'bad', bend: 30, audit: 'edge-x', layer: 'top' }]),
        say: 'Look for two neighbouring 1s that no single group holds: ' + h.from + ' (' + Bo.bits(h.from, n) + ') and ' + h.to + ' (' + Bo.bits(h.to, n) + ') differ only in ' + h.var + ', and ' + h.terms.join(' and ') + ' are different terms.' + (hz.hazards.length > 1 ? ' (There ' + (hz.hazards.length === 2 ? 'is one more such pair' : 'are ' + (hz.hazards.length - 1) + ' more such pairs') + '.)' : ''), meta: { kind: 'pair' } });
      // simulate in both directions and keep the one that glitches
      const T0 = 30, SPAN = 46;
      const tryDir = (from) => { const env = Bo.env(from, vs); const s = simulate(c1, env, h.var, T0, SPAN); return { from, env, s, p: pulse(s.waveOf('F'), T0) }; };
      let run1 = tryDir(h.from);
      if (!run1.p) { const r2 = tryDir(h.to); if (r2.p) run1 = r2; }
      const env = run1.env, s1 = run1.s, gl = run1.p;
      const label = (k) => k.replace(/\.y$/, '').replace(/^and/, 'AND ').replace(/^not/, 'NOT ').replace(/^or/, 'OR ');
      const moves = (w) => w.some((q) => q[0] > T0);
      const sigsFor = (c, sm, cls, keep) => {
        const inner = c.nets.map((nn) => sm.keyOf(nn)).filter((k) => k && /^(not|and)\d/.test(k) && (moves(sm.waveOf(k)) || (keep || []).includes(k))).sort((x, y) => (x[0] === 'n' ? -1 : 1) - (y[0] === 'n' ? -1 : 1) || x.localeCompare(y, 'en', { numeric: true }));
        return [{ name: h.var, changes: sm.waveOf(h.var) }].concat(inner.map((k) => ({ name: label(k), changes: sm.waveOf(k) })), [{ name: 'F', changes: sm.waveOf('F'), cls }]);
      };
      const sigs = sigsFor(c1, s1, gl ? 'glitch' : 'clean');
      const wv = (ss, cursor, prefix) => S.Kit.wave.draw({ x: 0, y: waveY, w: 440, signals: ss, t0: T0 - 8, t1: T0 + SPAN, cursor, prefix: prefix || 'wv', ticks: 6, rowH: 24, gap: 12 });
      const w1 = wv(sigs, T0);
      const steady = vs.filter((v) => v !== h.var).map((v) => v + ' = ' + env[v]).join(', ');
      frames.push({ items: mapAt(groupsFor(cubes), [h.from, h.to]).items.concat([S.Kit.schem.item('c1', r1, { x: cx, y: 10, values: s1.valueAt(T0 - 1) })], w1.items), say: 'Hold ' + steady + ' and let ' + h.var + ' go from ' + env[h.var] + ' to ' + (1 - env[h.var]) + ' at ' + T0 + ' ns. F should stay 1 throughout: both cells are 1s.', meta: { kind: 'before' } });
      const tg = gl ? (gl[0] + gl[1]) / 2 : T0 + 25;
      const mark = gl ? [{ key: 'glitch', kind: 'region', x: w1.xOf(gl[0]) - 4, y: waveY + (sigs.length - 1) * 36 - 6, w: w1.xOf(gl[1]) - w1.xOf(gl[0]) + 8, h: 36, rx: 6, cls: 'glitch-mark', audit: 'overlap-ok', layer: 'back' }] : [];
      frames.push({ items: mapAt(groupsFor(cubes), [h.from, h.to]).items.concat([S.Kit.schem.item('c1', r1, { x: cx, y: 10, values: s1.valueAt(tg) })], wv(sigs, tg).items, mark),
        say: gl ? 'The glitch: the AND gate of the old cell turns off at once, but the new one waits for the inverter on ' + h.var + ', so from ' + gl[0] + ' to ' + gl[1] + ' ns both are 0 and F dips to 0 for ' + (gl[1] - gl[0]) + ' ns. That is a static-1 hazard.' : 'With these delays the two AND gates happen to switch together and F does not dip, but with a slower inverter it would: the hazard is in the cover, not in this one simulation.', meta: { kind: 'glitch', glitch: !!gl } });
      // the fix
      const fix = Bo.hazardFree(fn, 'sop');
      const fixCubes = cubes.concat(fix.cover.map((t) => t.cube).filter((c) => !cubes.some((d) => Bo.cubeKey(d) === Bo.cubeKey(c))));
      const added = fixCubes.slice(cubes.length);
      const gAdd = added.map((c, i) => ({ key: 't' + Bo.cubeKey(c), cells: Bo.cubeMinterms(c), tone: toneOf(cubes.length + i), cls: 'ghost' }));
      frames.push({ items: mapAt(groupsFor(cubes, gAdd), [h.from, h.to]).items.concat([S.Kit.schem.item('c1', r1, { x: cx, y: 10 })]), say: 'The cure: a group that holds both cells. ' + h.fix.text + ' is the consensus of ' + h.terms.join(' and ') + ': it is 1 on both sides of the change, so F never depends on the race.' + (added.length > 1 ? ' Every hazard pair needs one: ' + added.map((c) => Bo.toString(Bo.cubeProduct(c, vs))).join(', ') + '.' : ''), meta: { kind: 'fix', fix: h.fix.text, others: cubes.map((c) => Bo.toString(Bo.cubeProduct(c, vs))) } });
      const c2 = circOf(fixCubes), r2 = S.Kit.schem.layout(c2);
      const s2 = simulate(c2, env, h.var, T0, SPAN);
      const newAnd0 = c2.parts.filter((p) => p.type === 'AND').slice(-added.length).map((p) => p.id + '.y');
      const sigs2 = sigsFor(c2, s2, 'clean', newAnd0);
      const newAnd = c2.parts.filter((p) => p.type === 'AND').slice(-added.length).map((p) => p.id);
      frames.push({ items: mapAt(groupsFor(fixCubes)).items.concat([S.Kit.schem.item('c2', r2, { x: cx, y: 10, values: s2.valueAt(tg), hot: newAnd })], wv(sigs2, tg, 'wv').items),
        say: 'F = ' + textOf(fixCubes) + '. Run the same change again: the new AND gate (lit) holds F at 1 while the others hand over, and the output stays flat. ' + (added.length === 1 ? 'One term' : P3.plural(added.length, 'term')) + ' more than the minimal cover buys a clean output.', mark: 'fixed', meta: { kind: 'fixed' } });
      // on a phone: the map when the map is the point, the waveform when the waveform is
      const phone = { x: -12, y: -12, w: 470, h: w1.box.y + w1.box.h + 60 };
      frames.forEach((f, i) => { if (i) f.narrowView = phone; });
      return { frames, def: { sections: [{ id: 'f', kind: 'math', title: 'Static-1 hazard', text: 'Cover: F = ' + textOf(cubes) + '\nPair: ' + h.from + ' ↔ ' + h.to + ' (' + h.var + ' changes)\nConsensus: ' + h.fix.text + '\nHazard-free: F = ' + textOf(fixCubes) }] } };
    },
    predict: [
      { at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.kind === 'glitch', pick: 'option', ask: 'When the input changes, what will F do?', options: ['Stay at 1', 'Dip to 0 for a moment', 'Go to 0 and stay there', 'Become X'], answer: (fr, i) => (fr[i + 1].meta.glitch ? 'Dip to 0 for a moment' : 'Stay at 1'), explain: (fr, i) => fr[i + 1].say },
      { at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.kind === 'fix', pick: 'option', ask: 'Which extra term removes the hazard?', options: (fr, i) => [...new Set([fr[i + 1].meta.fix].concat(fr[i + 1].meta.others))], answer: (fr, i) => fr[i + 1].meta.fix, explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'On a K-map, where does a static-1 hazard of an SOP circuit show?', options: ['At a cell holding 0', 'Between two adjacent 1s covered by different groups', 'Inside a group of 4', 'At a don\'t-care'], answer: 1, why: 'Changing the variable between them hands the output from one AND gate to another.' },
      { q: 'Which term removes the hazard in F = AC\' + BC?', options: ['AB', "A'B'", 'C', "AC"], answer: 0, why: 'AB is the consensus of AC\' and BC: it covers both cells 110 and 111.' },
      { q: 'Does adding the consensus term change the function?', options: ['Yes', 'No: it only covers 1s that are already 1'], answer: 1, why: 'It is redundant logically, but it keeps the output steady during the change.' },
      { q: 'A static-0 hazard in a POS circuit appears between…', options: ['two adjacent 0s in different sum groups', 'two adjacent 1s', 'a 0 and a 1', 'a don\'t-care and a 1'], answer: 0, why: 'It is the dual case: the output should stay 0 but may pulse to 1.' },
    ],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
