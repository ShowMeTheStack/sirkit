// Lab experiments: S.Content.lab({...}) registers one, #lab=id opens the bench with the experiment beside it
// (aim, chips, steps, an observation table to fill from the bench, and a button that checks the board), and the
// exercise kind lab checks a bench and its observations. The checks run on the bench's own simulator, headless,
// so tools/check-content.mjs runs every lab's checks on its reference wiring.
//
//   S.Content.lab({ id, chapter, title, aim, parts: ['7486'], steps: ['text', ...],
//     observe: { inputs: ['S1', 'S0'], outputs: ['led0'] }      a truth table to fill from the bench
//            | { rows: [..], cols: [..], cells: {'row|col': value} }  any table, its values given
//     checks: [ {kind: 'power', allowOpen}                        every chip powered, no input left open (unless allowOpen)
//               {kind: 'truth', inputs: ['S0', 'S1'], outputs: {led0: "S0 ^ S1"}}   every switch setting
//               {kind: 'value', set: {S0: 1}, expect: {led0: 1}}  one setting
//               {kind: 'count', outputs: ['ch0', 'ch1', 'ch2', 'ch3'] (low bit first), sequence: [0, 1, ..., 9],
//                set: {S0: 1}, clocks: 24, reset: {S0: 0}, from: 0}  read after each rising clock edge, in a cycle;
//                reset (a power-on reset: those switches held for resetClocks periods, default 2, before set) and
//                from (the first count read, one clock after the reset is let go) make the check start from a known state
//               value and count checks both take reset
//             ],
//     reference: { chips: [{id, num, col}], jumpers: [['10a', 'Rtp10'], ...], sw, clockHz }   a board that works,
//     start: { ... }                                              the board the experiment starts from (optional) })
// Terminals: sw0–sw7 (switches S0–S7), pb0 pb1 (buttons P0 P1), clk, led0–led7, ch0–ch7 (analyser), seg-a … seg-g,
// probe. Holes: '12a' (column 12, row a); rails Rtp/Rtn (top +5 V / ground), Rbp/Rbn (bottom).
(function (S) {
  'use strict';
  const K = (S.Check = S.Check || {});
  K.kinds = K.kinds || {};
  K.tables = K.tables || {};
  const plural = (n, w, ws) => n + ' ' + (n === 1 ? w : ws || w + 's');
  const Labs = (S.Labs = S.Labs || {});

  // ---- the registry ------------------------------------------------------------------------------------------
  const C = S.Content;
  if (C && !C.lab) {
    C.labs = new Map();
    C.lab = function (l) {
      for (const k of ['id', 'chapter', 'title', 'aim']) if (!l[k]) { C.errors.push('lab ' + (l.id || '?') + ' has no ' + k); return null; }
      if (C.labs.has(l.id)) C.errors.push('two labs with id ' + l.id);
      C.labs.set(l.id, l);
      const ch = C.chapters.find((c) => c.id === l.chapter);
      if (!ch) C.errors.push('lab ' + l.id + ' names an unknown chapter ' + l.chapter);
      else { ch.labs = ch.labs || []; if (!ch.labs.includes(l.id)) ch.labs.push(l.id); }
      return l;
    };
  }

  // ---- a board, headless ------------------------------------------------------------------------------------
  const TERMS = ['sw', 'led', 'ch'].flatMap((p) => [0, 1, 2, 3, 4, 5, 6, 7].map((i) => p + i)).concat('abcdefg'.split('').map((s) => 'seg-' + s), ['probe', 'pb0', 'pb1', 'clk']);
  const baseNet = (key) => {
    let m = /^R(tp|tn|bp|bn)\d+$/.exec(key);
    if (m) return m[1][1] === 'p' ? 'VCC' : 'GND';
    m = /^(\d+)([a-j])$/.exec(key);
    if (m) return 'S' + m[1] + (m[2] <= 'e' ? 'T' : 'B');
    return key;
  };
  /** holes of a chip's pins, as the bench places them (pin 1 at column col, row f) */
  const holesOf = (ch) => {
    if (S.Lab && S.Lab.chipHoles) return S.Lab.chipHoles(ch);
    const n = S.LabChips.get(ch.num).dip, half = n / 2, out = {};
    for (let k = 1; k <= half; k++) { out[k] = (ch.col + k - 1) + 'f'; out[n + 1 - k] = (ch.col + k - 1) + 'e'; }
    return out;
  };
  /** a bench state from a content board: jumpers may be [a, b, colour] */
  Labs.state = (b) => ({ v: 1, chips: (b.chips || []).map((c, i) => Object.assign({ id: c.id || 'U' + (i + 1) }, c, { num: String(c.num) })), jumpers: (b.jumpers || []).map((j, i) => (Array.isArray(j) ? { id: 'J' + (i + 1), a: j[0], b: j[1], color: j[2] || 'blue' } : j)), sw: (b.sw || [0, 0, 0, 0, 0, 0, 0, 0]).slice(), clockHz: b.clockHz || 1, segLow: !!b.segLow, bounce: !!b.bounce, tech: b.tech || null, chs: 8 });
  /** nets and the simulator spec of a bench state, built the way the bench builds them */
  Labs.spec = function (st) {
    const parent = new Map();
    const find = (k) => { if (!parent.has(k)) parent.set(k, k); while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k))); k = parent.get(k); } return k; };
    for (const j of st.jumpers) { const a = find(baseNet(j.a)), b = find(baseNet(j.b)); if (a !== b) parent.set(a, b); }
    find('VCC'); find('GND');
    const roots = new Map();
    const idx = (k) => { const r = find(k); if (!roots.has(r)) roots.set(r, roots.size); return roots.get(r); };
    const vcc = idx('VCC'), gnd = idx('GND'), short = vcc === gnd;
    const switches = [];
    for (let i = 0; i < 8; i++) switches.push({ name: 'S' + i, net: idx('sw' + i), v: st.sw[i] ? 1 : 0, key: 'sw' + i });
    for (let i = 0; i < 2; i++) switches.push({ name: 'P' + i, net: idx('pb' + i), v: 0, key: 'pb' + i });
    const chips = st.chips.map((ch) => {
      const def = S.LabChips.get(ch.num), holes = holesOf(ch), pins = {};
      let vccNet = -1, gndNet = -1;
      for (const q of def.pins) { const n = idx(baseNet(holes[q.num])); if (q.dir === 'power') { if (q.name === 'VCC') vccNet = n; else gndNet = n; } else pins[q.name] = n; }
      return { id: ch.id, num: ch.num, pins, vccNet, gndNet, powered: !short && vccNet === vcc && gndNet === gnd };
    });
    for (const k of TERMS) idx(k);
    const names = [];
    for (const [r, i] of roots) names[i] = r;
    return { nets: names, vcc, gnd, short, switches, clock: { net: idx('clk'), period: 1e9 / (st.clockHz || 1) }, chips, idx: (k) => idx(baseNet(k)), wired: (k) => st.jumpers.some((j) => j.a === k || j.b === k) };
  };
  /** the simulator the bench page would use for this state */
  Labs.sim = function (st) {
    const spec = Labs.spec(st);
    const tech = st.tech || 'CMOS';
    let fh = /TTL/.test(tech);
    try { if (S.Eng && S.Eng.tech) fh = !!S.Eng.tech(tech).floatHigh; } catch (e) { /* the guess above */ }
    let sim = null;
    try { sim = S.LabSim.onEngine(spec, { tech, floatHigh: fh }); if (sim) { sim.run(0); if (spec.vcc >= 0 && !spec.short && sim.value(spec.vcc) !== '1') sim = null; } } catch (e) { sim = null; }
    if (!sim) sim = new S.LabSim.BenchSim(spec, { tech, floatHigh: fh });
    return { sim, spec, read: (k) => (spec.wired(k) || /^sw|^pb/.test(k) ? sim.value(spec.idx(k)) : 'z') };
  };
  /** what is wrong with the wiring: chips without power, a short, inputs nothing drives (sentences) */
  Labs.problems = function (st) {
    const spec = Labs.spec(st), out = [];
    if (spec.short) out.push('+5 V and ground are joined: a short circuit.');
    const driven = new Set([spec.vcc, spec.gnd]);
    for (const s of spec.switches) if (spec.wired(s.key)) driven.add(s.net);
    if (spec.wired('clk')) driven.add(spec.clock.net);
    for (const ch of spec.chips) { const def = S.LabChips.get(ch.num); if (ch.powered) for (const q of def.pins) if (q.dir === 'out') driven.add(ch.pins[q.name]); }
    for (const ch of spec.chips) {
      const def = S.LabChips.get(ch.num);
      if (!ch.powered) { out.push(ch.id + ' (' + ch.num + ') has no power: wire VCC to +5 V and GND to ground.'); continue; }
      const open = def.pins.filter((q) => q.dir === 'in' && !driven.has(ch.pins[q.name])).map((q) => q.num);
      if (open.length) out.push(ch.id + ' (' + ch.num + ') has ' + plural(open.length, 'input') + ' that nothing drives: pin' + (open.length > 1 ? 's ' : ' ') + open.join(', ') + '.');
    }
    return out;
  };
  const termName = (k) => (/^led/.test(k) ? 'LED ' + k.slice(3) : /^ch/.test(k) ? 'channel ' + k.slice(2) : /^seg-/.test(k) ? 'segment ' + k.slice(4) : k === 'probe' ? 'the probe' : k);
  const swKey = (name) => 'sw' + String(name).replace(/^S/i, '');
  const setSw = (b, name, v) => { const i = +String(name).replace(/^S/i, ''); b.sim.set('S' + i, v ? 1 : 0); b.sim.run(2000); };

  /**
   * a power-on reset before a check: ck.reset {S0: 0} holds those switches (a clear, a load) for a while with the
   * clock running, then the check's own settings follow; ck.resetClocks (default 2) says for how many clock periods
   */
  const startUp = (b, ck) => {
    if (!ck.reset) return;
    for (const [n, v] of Object.entries(ck.reset)) {
      if (/^P/i.test(n)) b.sim.set('P' + String(n).slice(1), v ? 1 : 0);
      else b.sim.set('S' + String(n).replace(/^S/i, ''), v ? 1 : 0);
    }
    b.sim.run(b.spec.clock.period * (ck.resetClocks === undefined ? 2 : ck.resetClocks) + 2000);
  };
  /** run one check on a bench state: {ok, say} */
  Labs.runCheck = function (st, ck) {
    const Bo = S.Bool;
    switch (ck.kind) {
      case 'power': { const p = Labs.problems(st).filter((t) => !(ck.allowOpen && /nothing drives/.test(t))); return p.length ? { ok: false, say: p[0] } : { ok: true, say: ck.allowOpen ? 'Every chip has power.' : 'Every chip has power and every input is driven.' }; }
      case 'truth': {
        const outs = ck.outputs, ins = ck.inputs;
        for (const k of Object.keys(outs)) if (!Labs.spec(st).wired(k)) return { ok: false, say: termName(k) + ' is not wired to anything.' };
        for (const n of ins) if (!Labs.spec(st).wired(swKey(n))) return { ok: false, say: 'Switch ' + n + ' is not wired to anything.' };
        const b = Labs.sim(st);
        for (let m = 0; m < 1 << ins.length; m++) {
          const env = {};
          ins.forEach((n, i) => { env[n] = (m >> (ins.length - 1 - i)) & 1; setSw(b, n, env[n]); });
          for (const [k, e] of Object.entries(outs)) {
            const want = String(typeof e === 'function' ? e(env) : Bo.evaluate(Bo.parse(e), env)), got = b.read(k);
            if (got !== want) return { ok: false, say: 'With ' + K.envText(env) + ', ' + termName(k) + ' should be ' + want + ' but reads ' + got.toUpperCase() + '.' };
          }
        }
        return { ok: true, say: 'The measured truth table matches on all ' + (1 << ins.length) + ' switch settings.' };
      }
      case 'value': {
        const b = Labs.sim(st);
        startUp(b, ck);
        for (const [n, v] of Object.entries(ck.set || {})) setSw(b, n, v);
        // with nothing to set, the board still has to run to settle
        b.sim.run(2000);
        const env = Object.keys(ck.set || {}).length ? K.envText(ck.set) : 'the switches as they start';
        for (const [k, v] of Object.entries(ck.expect)) { const got = b.read(k); if (got !== String(v)) return { ok: false, say: 'With ' + env + ', ' + termName(k) + ' should be ' + v + ' but reads ' + got.toUpperCase() + '.' }; }
        return { ok: true, say: 'With ' + env + ' the outputs are right.' };
      }
      case 'count': {
        const spec = Labs.spec(st);
        if (!spec.wired('clk')) return { ok: false, say: 'Nothing is wired to the clock.' };
        for (const k of ck.outputs) if (!spec.wired(k)) return { ok: false, say: termName(k) + ' is not wired to anything.' };
        const b = Labs.sim(st), per = spec.clock.period;
        startUp(b, ck);
        for (const [n, v] of Object.entries(ck.set || {})) setSw(b, n, v);
        // the clock starts low and rises at half a period; read each count just after its edge
        b.sim.run(per / 2 + per / 4 - (b.sim.time || 0) % per);
        const seen = [];
        for (let i = 0; i < (ck.clocks || 2 * ck.sequence.length + 2); i++) {
          const bits = ck.outputs.map((k) => b.read(k));
          seen.push(bits.some((v) => v !== '0' && v !== '1') ? null : bits.reduce((a, v, j) => a + (v === '1' ? 1 << j : 0), 0));
          b.sim.run(per);
        }
        if (seen.includes(null)) return { ok: false, say: 'The outputs read X or float on some clock: is every chip powered and every input driven?' };
        const seq = ck.sequence, at = seq.indexOf(seen[0]);
        if (ck.from !== undefined && seen[0] !== ck.from) return { ok: false, say: 'After the reset the count should start at ' + ck.from + ' but reads ' + seen[0] + '.' };
        if (at < 0) return { ok: false, say: 'The count reads ' + seen.slice(0, 6).join(', ') + ' … , and ' + seen[0] + ' is not in the sequence ' + seq.join(', ') + '.' };
        for (let i = 0; i < seen.length; i++) if (seen[i] !== seq[(at + i) % seq.length]) return { ok: false, say: 'The count reads ' + seen.slice(Math.max(0, i - 3), i + 2).join(', ') + ': after ' + seen[i - 1] + ' comes ' + seen[i] + ', not ' + seq[(at + i) % seq.length] + '.' };
        return { ok: true, say: 'The count runs ' + seq.join(', ') + ' and round again.' };
      }
    }
    return { ok: false, say: 'Unknown check ' + ck.kind + '.' };
  };
  /** every check of a lab on a bench state: {ok, results: [{ok, say}], say} */
  Labs.check = function (lab, st) {
    const results = (lab.checks || []).map((ck) => { try { return Labs.runCheck(st, ck); } catch (e) { return { ok: false, say: 'This check could not run: ' + e.message + '.' }; } });
    const bad = results.find((r) => !r.ok);
    return { ok: !bad, results, say: bad ? bad.say : 'Every check passes: ' + results.map((r) => r.say.replace(/\.$/, '')).join('; ') + '.' };
  };

  // ---- the observation table ------------------------------------------------------------------------------------
  /** the table of what the student observes; truth tables take their values from the reference board */
  K.tables.labobs = (x) => {
    const lab = typeof x.lab === 'string' ? S.Content.labs.get(x.lab) : x.lab || x;
    const o = lab.observe;
    if (o.rows) return K.tables.custom(Object.assign({ cellKind: o.cellKind || 'bit' }, o));
    const b = Labs.sim(Labs.state(lab.reference));
    const rows = [], expected = {};
    for (let m = 0; m < 1 << o.inputs.length; m++) {
      const env = {};
      o.inputs.forEach((n, i) => { env[n] = (m >> (o.inputs.length - 1 - i)) & 1; setSw(b, n, env[n]); });
      const label = o.inputs.map((n) => env[n]).join('');
      rows.push(label);
      for (const k of o.outputs) expected[label + '|' + k] = b.read(k).toUpperCase();
    }
    return { rows, cols: o.outputs, corner: o.inputs.join(' '), colNames: o.outputs.map(termName), cell: (r, c) => rows[r] + '|' + o.outputs[c], expected, kind: 'bit' };
  };

  // ---- the lab exercise kind: {bench, observe} -----------------------------------------------------------------
  K.kinds.lab = {
    check(x, a) {
      const lab = S.Content.labs && S.Content.labs.get(x.lab);
      if (!lab) return { ok: false, message: 'There is no lab ' + x.lab + '.' };
      a = a || {};
      if (!a.bench || !a.bench.chips || !a.bench.chips.length) return { ok: false, message: 'Wire the experiment on the bench first (Open the bench).' };
      const st = a.bench.jumpers && a.bench.jumpers.length && Array.isArray(a.bench.jumpers[0]) ? Labs.state(a.bench) : a.bench;
      const r = Labs.check(lab, st);
      if (!r.ok) return { ok: false, message: 'The bench: ' + r.say, detail: { results: r.results } };
      if (lab.observe) {
        const t = K.kinds.table.check({ table: 'labobs', lab }, a.observe || {});
        if (!t.ok) return Object.assign(t, { message: 'The bench works, but in the observation table ' + t.message.replace(/^./, (c) => c.toLowerCase()).replace(/ yet \(marked in red\)/, ' (marked in red)') });
      }
      return { ok: true, message: 'Right. ' + r.say };
    },
  };

  // ---- the experiment beside the bench (#lab=id) ------------------------------------------------------------------
  Labs.panel = function (lab, bench) {
    const { h, icon } = S.UI;
    const box = h('div.card.lab-card.lab-exp', { id: 'labExp', dataset: { lab: lab.id } });
    box.append(h('h3', icon('flag'), lab.title), h('p', h('b', 'Aim. '), S.UI.inline(lab.aim)));
    if (lab.parts && lab.parts.length) box.append(h('p.muted', 'Chips: ' + lab.parts.map((n) => n + ' (' + ((S.LabChips.get(n) || {}).title || '?') + ')').join(', ') + '.'));
    if (lab.steps) box.append(h('ol.ls-steps.lab-exp-steps', lab.steps.map((s) => h('li', S.UI.inline(s)))));
    const tools = h('div.lab-exp-tools');
    const startBtn = h('button.btn.small', { type: 'button', id: 'labExpStart' }, icon('restart'), 'Start the experiment');
    startBtn.addEventListener('click', () => { bench.undo.push(JSON.stringify(bench.state)); bench.state = Labs.state(lab.start || { chips: (lab.parts || []).map((n, i) => ({ id: 'U' + (i + 1), num: n, col: 8 + 12 * i })) }); bench.sel = null; bench.rebuild(); bench.fit(); });
    tools.append(startBtn);
    box.append(tools);
    let obs = null;
    if (lab.observe) {
      const SP = K.tableSpec({ table: 'labobs', lab });
      const inputs = {};
      // a truth table holds single bits; a table of the lab's own may hold numbers, hex digits or words
      const one = !lab.observe.rows;
      const tbl = h('table.fill-table.lab-obs', h('thead', h('tr', h('th', SP.corner), ...SP.cols.map((c, i) => h('th', (SP.colNames || [])[i] || c)))),
        h('tbody', SP.rows.map((r, ri) => h('tr', h('th.mono', r), ...SP.cols.map((c, ci) => { const key = SP.cell(ri, ci); const i = h('input.mono', { type: 'text', maxlength: one ? '1' : '12', placeholder: one ? '0/1' : '', 'aria-label': r + ', ' + c, dataset: { key }, autocomplete: 'off', spellcheck: 'false' }); inputs[key] = i; return h('td', i); })))));
      box.append(h('h4', 'Observations'), h('p.muted', 'Set the switches to each row and write down what you see.'), h('div.fit-table', tbl));
      obs = { get: () => Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value])), mark: (r) => { for (const [k, i] of Object.entries(inputs)) { i.classList.toggle('right', !!(r.cells && r.cells[k])); i.classList.toggle('wrong', !!(r.cells && !r.cells[k])); } } };
    }
    const res = h('div.ex-result', { id: 'labExpResult', 'aria-live': 'polite' });
    const check = h('button.btn.primary.small', { type: 'button', id: 'labExpCheck' }, icon('check'), 'Check my bench');
    check.addEventListener('click', () => {
      const r = Labs.check(lab, bench.state);
      res.innerHTML = '';
      let ok = r.ok;
      res.append(...r.results.map((x) => h('div.ex-d.' + (x.ok ? 'ok' : 'bad'), icon(x.ok ? 'check' : 'x'), ' ', x.say)));
      if (obs) { const t = K.kinds.table.check({ table: 'labobs', lab }, obs.get()); obs.mark(t); if (!t.ok) ok = false; res.append(h('div.ex-d.' + (t.ok ? 'ok' : 'bad'), icon(t.ok ? 'check' : 'x'), ' Observations: ', t.message)); }
      res.className = 'ex-result ' + (ok ? 'ok' : 'bad');
      res.prepend(h('div.ex-v', icon(ok ? 'check' : 'x'), h('b', ok ? 'The experiment works.' : 'Not yet.')));
    });
    box.append(h('div.lab-exp-tools', check), res);
    Labs.current = { lab, box, observe: obs };
    return box;
  };
  // the lab page, with the experiment beside the bench when the route names one
  if (S.Pages && S.Pages.get && S.Pages.get('lab') && !S.Pages.get('lab').withLabs) {
    const base = S.Pages.get('lab');
    S.Pages.register('lab', Object.assign({}, base, {
      withLabs: true,
      open(app, main, rest) {
        const page = base.open(app, main, rest);
        const m = /^lab[=/](.+)$/.exec(rest || '');
        const lab = m && S.Content && S.Content.labs && S.Content.labs.get(m[1]);
        if (lab && page && page.root) {
          const side = page.root.querySelector('.lab-side');
          if (side) side.prepend(Labs.panel(lab, page)); else page.root.appendChild(Labs.panel(lab, page));
          document.title = lab.title + ' · Lab · Sirkit';
        }
        return page;
      },
    }));
  }
})(globalThis.Sirkit = globalThis.Sirkit || {});
