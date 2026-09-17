// Part 10: asynchronous circuits. Every value the narration quotes is checked against what the frame draws (the
// waveform rows, which come from the simulation) and against working-out done here by hand: the excitations
// evaluated straight from the equations or the gates, the flow table followed row by row, every order of a race
// played out, the implication table and merger redone, the assigned table rebuilt, the equations checked against
// it for cover and for split neighbouring 1s, and the specifications run as plain behaviour.

const prime = (s) => String(s).replace(/′/g, "'");
const gray = (n) => { let g = ['']; for (let k = 0; k < n; k++) g = g.map((x) => '0' + x).concat(g.slice().reverse().map((x) => '1' + x)); return g; };
const ham = (a, b) => [...a].filter((c, i) => c !== b[i]).length;
const flipAll = (s, Y) => Y; // all excited variables change together: the next code is the excitation itself
function combos(names) { const out = []; for (let m = 0; m < 1 << names.length; m++) { const o = {}; names.forEach((n, i) => { o[n] = (m >> (names.length - 1 - i)) & 1; }); out.push(o); } return out; }
const lastSay = (r) => r.frames[r.frames.length - 1].say;
/** how many frames match a pattern: a check that finds none has checked nothing */
const count = (r, re) => r.frames.filter((f) => re.test(f.say)).length;

/** a model from equation text, evaluated with the netlist expression reader (not the async engine) */
function model(S, text) {
  const spec = S.P10.parse(text), Nl = S.Netlist;
  const ex = Object.fromEntries(spec.vars.map((v) => [v, Nl.parse(spec.Y[v])]));
  const outs = Object.fromEntries(Object.entries(spec.outputs).map(([k, t]) => [k, Nl.parse(t)]));
  const env = (x, y) => { const e = {}; spec.inputs.forEach((n, i) => { e[n] = +x[i]; }); spec.vars.forEach((n, i) => { e[n] = +y[i]; }); return e; };
  return {
    spec, inputs: spec.inputs, vars: spec.vars,
    Y: (x, y) => spec.vars.map((v) => Nl.evaluate(ex[v], env(x, y))).join(''),
    Yv: (v, x, y) => Nl.evaluate(ex[v], env(x, y)),
    Z: (x, y) => Object.keys(outs).map((k) => Nl.evaluate(outs[k], env(x, y))).join(''),
  };
}
/** follow a column from row y, every excited variable changing together: the rows passed, and whether it loops */
function follow(m, x, y) {
  const path = [y];
  for (let k = 0; k < 20; k++) { const Y = m.Y(x, path[path.length - 1]); if (Y === path[path.length - 1]) return { path, end: Y, loop: false }; if (path.includes(Y)) { path.push(Y); return { path, end: null, loop: true }; } path.push(Y); }
  return { path, end: null, loop: true };
}

/** the last value a frame's waveform row shows, and whether it shows a change at t */
function wave(f, name) {
  const it = f.items.find((x) => x.kind === 'wave' && (x.key.endsWith(':w:' + name) || x.key.endsWith(':w:' + prime(name)) || prime(x.key).endsWith(':w:' + prime(name))));
  if (!it) return null;
  const ch = it.changes || [];
  return { last: ch.length ? ch[ch.length - 1][1] : null, at: (t) => ch.some((c) => Math.abs(c[0] - t) < 1e-6), changes: ch };
}

// ---- gates evaluated by hand, a loop held cut ----
const GATE = { AND: (v) => v.every(Boolean), OR: (v) => v.some(Boolean), NAND: (v) => !v.every(Boolean), NOR: (v) => !v.some(Boolean), NOT: (v) => !v[0], BUF: (v) => !!v[0], XOR: (v) => v.filter(Boolean).length % 2 === 1, XNOR: (v) => v.filter(Boolean).length % 2 === 0 };
const insOf = (p) => p.pins.filter((q) => q.dir === 'in').map((q) => p.net[q.name]).filter(Boolean);
/** the excitation of each cut net: what its driver gate computes with the inputs and every cut net given */
function excite(S, c, cuts, ins, ys) {
  const val = new Map();
  for (const p of c.parts) if (p.type === 'IN') val.set(p.net.y, ins[p.params.name]);
  cuts.forEach((n, i) => val.set(n, ys[i]));
  const gates = c.parts.filter((p) => GATE[p.type]);
  for (let k = 0; k < gates.length + 2; k++) for (const g of gates) if (!cuts.includes(g.net.y) && insOf(g).every((n) => val.has(n))) val.set(g.net.y, GATE[g.type](insOf(g).map((n) => val.get(n))) ? 1 : 0);
  return cuts.map((n) => { const g = gates.find((p) => p.net.y === n); return GATE[g.type](insOf(g).map((q) => val.get(q))) ? 1 : 0; });
}
/** an expression as written in the narration (A′, Q′⁺ ...) evaluated with names that end in ′ read as complements */
function evalText(S, text, env) {
  const e = {};
  for (const [k, v] of Object.entries(env)) { if (k.endsWith("'")) e[k.slice(0, -1)] = 1 - v; else e[k] = v; }
  return S.Netlist.evaluate(S.Netlist.parse(prime(text)), e);
}

function asyncLoops(ctx) {
  const { S, input: inp, r, fail } = ctx, P10 = S.P10, TM = S.Kit.timing;
  const make = {
    nor: () => TM.build.srNor(), nand: () => TM.build.srNand(),
    celem: (b) => P10.circuit(P10.parse(P10.models.celem.eqs), { buffers: b }),
    two: (b) => P10.circuit(P10.parse("Y1 = xy2' + y1y2'; Y2 = xy1 + xy2; z = y2"), { buffers: b }),
  }[inp.circ];
  const c = make(true), drawn = make(false), fc = S.Async.fromCircuit(c);
  const cuts = fc.cuts.map((q) => q.net), names = fc.cuts.map((q) => q.name);
  const ins = c.parts.filter((p) => p.type === 'IN').map((p) => p.params.name);
  const drawnGates = drawn.parts.filter((p) => S.Netlist.GATES.has(p.type)).length;
  const m0 = /^A circuit of (\d+) gates/.exec(r.frames[0].say);
  if (!m0 || +m0[1] !== drawnGates) fail('frame 0 says ' + (m0 && m0[1]) + ' gates, the drawing has ' + drawnGates);
  if (r.frames[0].predict && String(r.frames[0].predict.answer) !== String(cuts.length)) fail('the loop count prediction answers ' + r.frames[0].predict.answer + ', there are ' + cuts.length + ' loops');
  // each loop's gates: on a cycle through its cut, the other cuts held cut
  const dir = (rr) => rr.part.pins.find((q) => q.name === rr.pin).dir;
  r.frames.forEach((f, i) => {
    const m = /^Loop (\d+) runs through (.*) and back\. Cut it at the wire (\S+):/.exec(f.say);
    if (!m) return;
    const k = names.indexOf(m[3]);
    if (k < 0) { fail('frame ' + i + ': cut at ' + m[3] + ', which is not a cut'); return; }
    const net = cuts[k], other = cuts.filter((n) => n !== net);
    const drv = net.pins.find((q) => dir(q) === 'out').part;
    const reach = (from, step) => { const seen = new Set(), q = [from]; while (q.length) { const p = q.shift(); for (const n of step(p)) if (!seen.has(n)) { seen.add(n); q.push(n); } } return seen; };
    const fwd = (p) => (p.net.y && !other.includes(p.net.y) ? p.net.y.pins.filter((q) => dir(q) === 'in' && GATE[q.part.type]).map((q) => q.part) : []);
    const back = (p) => insOf(p).filter((n) => !other.includes(n)).map((n) => n.pins.find((q) => dir(q) === 'out').part).filter((g) => GATE[g.type]);
    const F = reach(drv, fwd), B = reach(drv, back);
    const want = c.parts.filter((g) => GATE[g.type] && (g === drv || (F.has(g) && B.has(g)))).map((g) => g.id).join(', ');
    if (m[2] !== want) fail('frame ' + i + ': loop ' + m[1] + ' runs through ' + m[2] + ', its gates are ' + want);
    ctx.pass();
  });
  if (count(r, /^Loop \d+ runs through/) !== cuts.length || count(r, /^Read the logic from the cut/) !== cuts.length) fail('expected ' + cuts.length + ' loop and excitation frames');
  // each excitation as read: equal to the gates, every input and cut value
  r.frames.forEach((f, i) => {
    const m = /^Read the logic from the cut (\S+) back to the inputs and the y wires: (\S+) = (.*)\.$/.exec(f.say);
    if (!m) return;
    const k = names.indexOf(m[1]);
    for (const e of combos(ins.concat(names))) {
      const got = excite(S, c, cuts, e, names.map((n) => e[n]))[k];
      const said = evalText(S, m[3], e);
      if (got !== said) { fail('frame ' + i + ': ' + m[2] + ' = ' + m[3] + ' gives ' + said + ' at ' + JSON.stringify(e) + ', the gates give ' + got); return; }
    }
    ctx.pass();
  });
}

function asyncTables(ctx) {
  const { S, input: inp, r, fail } = ctx;
  const m = model(S, inp.eqs), rows = gray(m.vars.length), cols = gray(m.inputs.length);
  const perCell = rows.length * cols.length <= 16;
  const cells = [];
  for (const y of rows) for (const x of cols) cells.push([y, x]);
  let fi = 1;
  for (let i = 0; i < cells.length; i++) {
    const [y, x] = cells[i], Y = m.Y(x, y), st = Y === y;
    if (!perCell && i % cols.length !== cols.length - 1) continue;
    const f = r.frames[fi++];
    if (perCell) {
      const work = m.vars.map((v) => S.Async.exName(v) + ' = ' + prime(m.spec.Y[v]).replace(/\s+/g, '') + ' = ' + m.Yv(v, x, y));
      const re = new RegExp('^Row ' + y + ', column ' + x + ': (.*)\\. Y = (\\d+)(, equal to the row: a stable state, circled\\.|, not the row: unstable, the loops will move towards (\\d+)\\.)$');
      const mm = re.exec(f.say);
      if (!mm) { fail('frame ' + (fi - 1) + ' says "' + f.say + '", want row ' + y + ', column ' + x); continue; }
      const vals = mm[1].split('; ').map((p) => p.replace(/\s+/g, '').replace(/′/g, "'"));
      if (vals.length !== work.length || vals.some((v, k) => v.split('=').pop() !== work[k].split(' = ').pop() || v.split('=')[0] !== work[k].split(' = ')[0])) fail('frame ' + (fi - 1) + ': "' + mm[1] + '", the equations give ' + work.map((w) => w.split(' = ')[0] + ' = ' + w.split(' = ').pop()).join('; '));
      if (mm[2] !== Y || (mm[4] === undefined) !== st || (mm[4] !== undefined && mm[4] !== Y)) fail('frame ' + (fi - 1) + ': says Y = ' + mm[2] + (mm[4] ? ', unstable' : ', stable') + '; the equations give ' + Y + (st ? ' (stable)' : ''));
    } else {
      const want = 'Row ' + y + ': ' + cols.map((c) => c + ' → ' + m.Y(c, y) + (m.Y(c, y) === y ? ' (stable)' : '')).join(', ') + '.';
      if (f.say !== want) fail('frame ' + (fi - 1) + ' says "' + f.say + '", want "' + want + '"');
    }
    if (r.frames[fi - 2].predict) {
      const p = r.frames[fi - 2].predict;
      if (p.answer !== (st ? 'stable' : 'unstable') || !p.ask.includes('row ' + y + ', column ' + x)) fail('frame ' + (fi - 2) + ': the prediction "' + p.ask + '" answers ' + p.answer);
    }
    ctx.pass();
  }
  const stable = cells.filter(([y, x]) => m.Y(x, y) === y);
  const f = r.frames[fi];
  const ms = /^(\d+) stable states?: (.*?)\. /.exec(f.say);
  const want = stable.map(([y, x]) => '(' + x + ', ' + y + ')').sort().join(', ') || 'none';
  if (!ms || +ms[1] !== stable.length || ms[2].split(/(?<=\)), /).sort().join(', ') !== want) fail('the summary says "' + f.say + '", want ' + stable.length + ': ' + want);
  const empty = cols.filter((x) => !rows.some((y) => m.Y(x, y) === y));
  if (empty.length ? !f.say.includes('Column ' + empty.join(', ') + ' has no stable state') : !f.say.includes('Every column has at least one')) fail('the summary misjudges the columns: ' + f.say);
}

function asyncFundamental(ctx) {
  const { S, input: inp, r, fail } = ctx;
  const m = model(S, inp.eqs), xs = String(inp.seq).trim().split(/[\s,]+/).filter(Boolean);
  // the row names, as the frames give them ("row a (00)"), must be one code each
  const code = {};
  for (const f of r.frames) for (const mm of f.say.matchAll(/row (\w) \(([01]+)\)/g)) { if (code[mm[1]] && code[mm[1]] !== mm[2]) fail('row ' + mm[1] + ' is called ' + code[mm[1]] + ' and ' + mm[2]); code[mm[1]] = mm[2]; }
  const names = S.Async.analyse(S.P10.model(inp.eqs)).names;
  for (const [n, c] of Object.entries(code)) if (names[c] !== n) fail('row ' + n + ' (' + c + ') is named ' + names[c] + ' in the flow table');
  const m0 = /^Start with x = ([01]+)\. The circuit settles in row (\w) \(([01]+)\), a stable state\.$/.exec(r.frames[0].say);
  if (!m0 || m0[1] !== xs[0] || m.Y(xs[0], m0[3]) !== m0[3]) { fail('the start "' + r.frames[0].say + '" is not a stable state in column ' + xs[0]); return; }
  let at = m0[3], fi = 1;
  for (let k = 1; k < xs.length; k++) {
    const x = xs[k], f = r.frames[fi++];
    const two = ham(xs[k - 1], x) > 1;
    if (two !== /changing \d+ inputs at once/.test(f.say)) fail('frame ' + (fi - 1) + ': ' + xs[k - 1] + ' → ' + x + (two ? ' changes two inputs, unsaid' : ' is called a double change'));
    const Y = m.Y(x, at);
    const want = 'x becomes ' + x + ': move sideways to column ' + x + ' in row ' + names[at] + '. ' + (Y === at ? 'That entry is circled: stable already, nothing moves.' : 'The entry there is ' + names[Y] + ', not ' + names[at] + ': unstable.');
    if (!f.say.endsWith(want)) fail('frame ' + (fi - 1) + ' says "' + f.say + '", want "' + want + '"');
    const run = follow(m, x, at);
    if (f.predict && run.end && f.predict.answer !== names[run.end]) fail('frame ' + (fi - 1) + ': the prediction answers ' + f.predict.answer + ', the column settles in ' + names[run.end]);
    run.path.slice(1).forEach((p, j) => {
      const g = r.frames[fi++];
      const last = j === run.path.length - 2;
      const w = 'Move down the column to row ' + names[p] + ' (' + p + ').' + (last ? ' Circled: stable. Output ' + m.Z(x, p) + '.' : ' Still unstable: keep going.');
      if (!g || !g.say.startsWith(w)) fail('frame ' + (fi - 1) + ' says "' + (g && g.say) + '", want "' + w + '"');
    });
    at = run.end || run.path[run.path.length - 1];
    ctx.pass();
  }
}

function asyncRaces(ctx) {
  const { S, input: inp, r, fail } = ctx;
  const m = model(S, inp.eqs), x = inp.x, y = inp.y, Y = m.Y(x, y), n = m.vars.length;
  const exc = []; for (let i = 0; i < n; i++) if (Y[i] !== y[i]) exc.push(i);
  if (!r.frames[0].say.startsWith('The circuit is in row ' + y + ' when the input becomes ' + x + '. The entry there is ' + Y + ':')) fail('frame 0 says "' + r.frames[0].say + '", the entry is ' + Y);
  const ex2 = exc.map((i) => m.vars[i]);
  if (!r.frames[1].say.startsWith('Compare ' + Y + ' with ' + y + ': ' + (ex2.length === 1 ? 'only ' + ex2[0] + ' is excited' : ex2.join(' and ') + ' are both excited'))) fail('frame 1 says "' + r.frames[1].say + '", excited: ' + ex2.join(', '));
  // every first move (any non-empty set of the excited variables), then every excited variable together
  const ends = new Set();
  let loops = false;
  for (let s = 1; s < 1 << exc.length; s++) {
    const t = y.split(''); exc.forEach((i, k) => { if (s >> k & 1) t[i] = t[i] === '0' ? '1' : '0'; });
    const first = t.join(''), run = m.Y(x, first) === first ? { path: [first], end: first } : follow(m, x, first);
    if (run.loop) loops = true; else ends.add(run.end);
  }
  if (!count(r, /^(If .* (first|together): |The only order: )/)) fail('no order is played out');
  // the orders the frames play out: each step a single excited set, each annotation right
  r.frames.forEach((f, i) => {
    const mm = /^(?:If (.*?) changes? (?:first|together): |The only order: )(.*?)\. (It ends in (\d+)\.|It comes back to a code it has visited: it can keep changing for ever\.)$/.exec(f.say);
    if (!mm) return;
    const steps = mm[2].split(', ').map((q) => /^(\d+) → (\d+) \((stable|Y = (\d+))\)$/.exec(q));
    let prev = y;
    steps.forEach((st, k) => {
      if (!st || st[1] !== prev) { fail('frame ' + i + ': the step "' + mm[2].split(', ')[k] + '" does not follow ' + prev); return; }
      const Yh = m.Y(x, st[1]);
      if (k > 0 && st[2] !== Yh) fail('frame ' + i + ': from ' + st[1] + ' the excitation is ' + Yh + ', not ' + st[2]);
      if (k === 0) { const flipped = [...st[1]].map((c, j) => (c !== st[2][j] ? j : -1)).filter((j) => j >= 0); if (!flipped.every((j) => exc.includes(j))) fail('frame ' + i + ': the first move flips a variable that is not excited'); }
      const Y2 = m.Y(x, st[2]);
      if ((st[3] === 'stable') !== (Y2 === st[2]) || (st[4] && st[4] !== Y2)) fail('frame ' + i + ': ' + st[2] + ' is ' + (Y2 === st[2] ? 'stable' : 'unstable, Y = ' + Y2) + ', the frame says ' + st[3]);
      prev = st[2];
    });
    if (mm[4] && (m.Y(x, mm[4]) !== mm[4] || mm[4] !== prev)) fail('frame ' + i + ': it ends in ' + mm[4] + ', which is not where the steps rest');
    ctx.pass();
  });
  const kind = loops && !ends.size ? 'oscillation' : exc.length > 1 ? (ends.size > 1 || loops ? 'critical' : 'noncritical') : follow(m, x, y).path.length > 2 ? 'cycle' : 'none';
  const head = { critical: 'A critical race: depending on the order the circuit ends in ', noncritical: 'A non-critical race: every order ends in ' + [...ends][0], cycle: 'A cycle: the circuit passes through ', oscillation: 'No stable state is reachable in column ' + x, none: 'One variable changes' }[kind];
  if (!lastSay(r).startsWith(head)) fail('the verdict "' + lastSay(r) + '", want "' + head + '…"');
  if (kind === 'critical' && ![...ends].every((e) => lastSay(r).includes(e))) fail('the verdict leaves out an end: ' + [...ends].join(', '));
  const ans = { critical: 'critical race', noncritical: 'non-critical race', cycle: 'cycle', oscillation: 'oscillation' }[kind];
  if (r.frames[0].predict && ans && r.frames[0].predict.answer !== ans) fail('the prediction answers ' + r.frames[0].predict.answer + ', want ' + ans);
}

function asyncSr(ctx) {
  const { S, input: inp, r, fail } = ctx, TM = S.Kit.timing;
  const nand = inp.kind === 'nand';
  const f2 = /Q⁺ = (.*), which simplifies to Q⁺ = (.*)\.$/.exec(r.frames[2].say);
  if (!f2) { fail('frame 2 says "' + r.frames[2].say + '"'); return; }
  // the latch's gates cut at Q, with S and R written for S′ and R′ on the NAND latch
  const c = nand ? TM.build.srNand() : TM.build.srNor();
  const qNet = c.parts.find((p) => p.id === 'g1').net.y;
  const q = (s, rr, qq) => {
    const ins = nand ? { "S'": s, "R'": rr } : { S: s, R: rr };
    return excite(S, c, [qNet], ins, [qq])[0];
  };
  const simp = (s, rr, qq) => evalText(S, f2[2], { S: s, R: rr, Q: qq });
  for (const e of combos(['S', 'R', 'Q'])) {
    if (evalText(S, f2[1], e) !== q(e.S, e.R, e.Q)) { fail('Q⁺ = ' + f2[1] + ' differs from the gates at ' + JSON.stringify(e)); break; }
    if (simp(e.S, e.R, e.Q) !== q(e.S, e.R, e.Q)) { fail('Q⁺ = ' + f2[2] + ' differs from the gates at ' + JSON.stringify(e)); break; }
  }
  if (r.frames[1].predict && r.frames[1].predict.answer !== f2[2]) fail('the prediction answers ' + r.frames[1].predict.answer);
  const stable = []; for (const x of gray(2)) for (const y of ['0', '1']) if (simp(+x[0], +x[1], +y) === +y) stable.push([y, x]);
  const want = stable.map(([y, x]) => 'Q = ' + y + ' with SR = ' + x).sort().join(', ');
  const m3 = /Circled entries are stable: (.*)\.$/.exec(r.frames[3].say);
  if (!m3 || m3[1].split(', Q').map((q, i) => (i ? 'Q' + q : q)).sort().join(', ') !== want) fail('frame 3 says "' + r.frames[3].say + '", want ' + want);
  const hold = nand ? '11' : '00', set = nand ? '01' : '10', reset = nand ? '10' : '01', both = nand ? '00' : '11';
  const Q = (x, y) => simp(+x[0], +x[1], +y);
  if (!(Q(hold, 0) === 0 && Q(hold, 1) === 1)) fail('column ' + hold + ' does not hold');
  if (!(Q(set, 0) === 1 && Q(reset, 1) === 0)) fail('column ' + set + ' does not set or ' + reset + ' does not reset');
  if (!r.frames[6].say.startsWith('Column ' + both + ' looks harmless here: Q settles at ' + Q(both, 0) + '.')) fail('frame 6 says "' + r.frames[6].say + '"');
  // released together with equal 9 ns gates: a change every 9 ns from 70 to 160
  const w = wave(r.frames[r.frames.length - 1], 'Q'), wp = wave(r.frames[r.frames.length - 1], "Q'");
  const after = w.changes.filter((c2) => c2[0] > 70 && c2[0] <= 160), afterP = wp.changes.filter((c2) => c2[0] > 70 && c2[0] <= 160);
  const nWant = Math.floor((160 - 70) / 9);
  const mm = /Q and Q′ switch together (\d+) times in 90 ns, once every 9 ns\./.exec(lastSay(r));
  if (!mm || +mm[1] !== nWant || after.length !== nWant || afterP.length !== nWant || after.some((c2, i) => c2[0] !== afterP[i][0])) fail('the last frame says "' + lastSay(r) + '"; the waves show ' + after.length + ' and ' + afterP.length + ' changes, 90 / 9 gives ' + nWant);
}

// ---- the design examples: the specifications as plain behaviour ----
const SPEC = {
  // Z goes to 1 when x2 rises while x1 is already 1, and stays 1 until x1 falls
  catch: (z, a, b) => (b[0] === '0' ? 0 : z || (a[0] === '1' && a[1] === '0' && b[1] === '1') ? 1 : 0),
  // Z = 1 when x1 rose before x2 (since both were last 0), and stays 1 until both inputs are back at 0
  order: (z, a, b, mem) => { if (b === '00') { mem.first = null; return 0; } if (a === '00') mem.first = b === '10' ? 'x1' : 'x2'; return z || (b === '11' && mem.first === 'x1') ? 1 : 0; },
};
/** run a primitive flow table from row a over a sequence of single input changes: [{row, z}] or an error */
function runFlow(t, seq) {
  const cols = gray(2), stab = (r) => cols.find((c) => t.rows[r][c] === r);
  let row = Object.keys(t.rows).find((r) => stab(r) === seq[0]);
  const out = [{ row, z: +t.out[row] }];
  for (let k = 1; k < seq.length; k++) {
    let e = t.rows[row][seq[k]], n = 0;
    while (e !== row && n++ < 10) { if (e === '-') return { error: 'row ' + row + ' has a dash in column ' + seq[k] }; row = e; e = t.rows[row][seq[k]]; }
    out.push({ row, z: +t.out[row] });
  }
  return { out };
}
const walkSeq = (rnd, n) => { const s = ['00']; for (let k = 1; k < n; k++) { const p = s[k - 1], b = Math.floor(rnd() * 2); s.push(p.split('').map((c, i) => (i === b ? (c === '0' ? '1' : '0') : c)).join('')); } return s; };

function asyncPrimitive(ctx) {
  const { S, input: inp, r, fail } = ctx;
  const E = S.P10.examples[inp.ex], t = E.table(), rows = Object.keys(t.rows), cols = gray(2);
  for (const rw of rows) {
    const st = cols.filter((c) => t.rows[rw][c] === rw);
    const f = r.frames.find((x) => x.say.startsWith('Row ' + rw + ': '));
    if (st.length !== 1) fail('row ' + rw + ' has ' + st.length + ' stable states');
    if (!f || !f.say.endsWith('Its stable state is in column ' + st[0] + ', with ' + t.outputs[0] + ' = ' + t.out[rw] + '.')) fail('row ' + rw + ': "' + (f && f.say) + '"');
    const g = r.frames.find((x) => x.say.startsWith('From row ' + rw + ' ('));
    const moves = cols.filter((c) => t.rows[rw][c] !== rw && t.rows[rw][c] !== '-');
    for (const c of moves) {
      if (!g || !g.say.includes('input ' + c + ' leads to ' + t.rows[rw][c])) fail('row ' + rw + ', column ' + c + ' is not narrated as leading to ' + t.rows[rw][c]);
      if (t.rows[t.rows[rw][c]][c] !== t.rows[rw][c]) fail('row ' + rw + ', column ' + c + ' leads to ' + t.rows[rw][c] + ', which is not stable there');
      const stc = cols.find((q) => t.rows[rw][q] === rw);
      if (ham(stc, c) !== 1) fail('row ' + rw + ' moves on a two-input change to column ' + c);
    }
    for (const c of cols) if (t.rows[rw][c] === '-' && ham(cols.find((q) => t.rows[rw][q] === rw), c) !== 2) fail('row ' + rw + ' has a dash in column ' + c + ', one input change from its stable state');
    ctx.pass();
  }
  r.frames.forEach((f, i) => { if (f.predict) { const nx = r.frames[i + 1].say, m = /^From row (\w)/.exec(nx); const rw = m && m[1], c = /becomes (\d\d)/.exec(f.predict.ask)[1]; if (f.predict.answer !== t.rows[rw][c]) fail('frame ' + i + ': the prediction answers ' + f.predict.answer + ', the table has ' + t.rows[rw][c]); } });
  // the table does what the words say, over many walks of single input changes
  for (let k = 0; k < 40; k++) {
    let s = 7 + k * 13;
    const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
    const seq = walkSeq(rnd, 12), run = runFlow(t, seq);
    if (run.error) { fail(run.error); break; }
    let z = 0; const mem = {};
    for (let j = 1; j < seq.length; j++) { z = SPEC[inp.ex](z, seq[j - 1], seq[j], mem); if (run.out[j].z !== z) { fail('the table gives ' + t.outputs[0] + ' = ' + run.out[j].z + ' after ' + seq.slice(0, j + 1).join(' '), ', the description ' + z); k = 99; break; } }
  }
}

/** the implication table, rounds of crossing, compatibles, maximal compatibles, the smallest closed cover */
function merge(t) {
  const st = Object.keys(t.rows), cols = gray(2), sc = (rw) => cols.find((c) => t.rows[rw][c] === rw);
  const key = (a, b) => (st.indexOf(a) < st.indexOf(b) ? a + b : b + a);
  const cells = {};
  for (let j = 1; j < st.length; j++) for (let i = 0; i < j; i++) {
    const a = st[i], b = st[j];
    const bad = sc(a) === sc(b) && t.out[a] !== t.out[b];
    const imp = [...new Set(cols.map((c) => [t.rows[a][c], t.rows[b][c]]).filter(([p, q]) => p !== '-' && q !== '-' && p !== q && key(p, q) !== key(a, b)).map(([p, q]) => key(p, q)))];
    cells[a + b] = { a, b, bad, imp, crossed: bad ? 0 : -1 };
  }
  for (let rd = 1; rd < 20; rd++) {
    const now = Object.values(cells).filter((q) => q.crossed < 0 && q.imp.some((p) => cells[p].crossed >= 0 && cells[p].crossed < rd));
    if (!now.length) break;
    for (const q of now) q.crossed = rd;
  }
  const ok = (a, b) => a === b || cells[key(a, b)].crossed < 0;
  const pairs = Object.values(cells).filter((q) => q.crossed < 0).map((q) => [q.a, q.b]);
  const cliques = [];
  for (let mask = 1; mask < 1 << st.length; mask++) { const s = st.filter((_, i) => mask >> i & 1); if (s.every((a) => s.every((b) => ok(a, b)))) cliques.push(s); }
  const maximal = cliques.filter((s) => !cliques.some((o) => o.length > s.length && s.every((x) => o.includes(x))));
  const closed = (blocks) => st.every((x) => blocks.some((b) => b.includes(x))) && blocks.every((b) => cols.every((c) => { const e = [...new Set(b.map((x) => t.rows[x][c]).filter((v) => v !== '-'))]; return !e.length || blocks.some((o) => e.every((v) => o.includes(v))); }));
  let best = null;
  const choose = (k, from, acc) => { if (best) return; if (acc.length === k) { if (closed(acc)) best = acc.slice(); return; } for (let i = from; i < cliques.length; i++) { acc.push(cliques[i]); choose(k, i + 1, acc); acc.pop(); } };
  for (let k = 1; k <= st.length && !best; k++) choose(k, 0, []);
  return { st, cells, pairs, maximal, closed, smallest: best ? best.length : null };
}

function asyncMerger(ctx) {
  const { S, input: inp, r, fail } = ctx;
  const t = S.P10.examples[inp.ex].table(), M = merge(t);
  r.frames.forEach((f, i) => {
    const m = /^Pairs with (\w): (.*?)\.(?: A row's output|$)/.exec(f.say);
    if (!m) return;
    for (const part of m[2].split('; ')) {
      const p = /^\((\w), (\w)\) (a tick|crossed out, the outputs disagree|implies (.*))$/.exec(part);
      const cell = p && M.cells[p[1] + p[2]];
      if (!cell) { fail('frame ' + i + ': "' + part + '"'); continue; }
      const said = p[3] === 'a tick' ? 'tick' : p[3].startsWith('crossed') ? 'cross' : p[4].split(/\), \(/).map((x) => x.replace(/[()]/g, '').replace(', ', '')).sort().join(' ');
      const want = cell.bad ? 'cross' : cell.imp.length ? cell.imp.slice().sort().join(' ') : 'tick';
      if (said !== want) fail('frame ' + i + ': (' + p[1] + ', ' + p[2] + ') is "' + p[3] + '", the table gives ' + want);
    }
    ctx.pass();
  });
  r.frames.forEach((f, i) => {
    const m = /^Round (\d+): (\d+) more cross(?:es)?, each because it implies a pair already crossed out: (.*?)(, …)?\.$/.exec(f.say);
    if (!m) return;
    const rd = +m[1], list = Object.values(M.cells).filter((q) => q.crossed === rd);
    if (+m[2] !== list.length) fail('round ' + rd + ': ' + m[2] + ' crosses said, ' + list.length + ' worked out');
    for (const q of m[3].split(/(?<=\)), (?=\()/)) {
      const p = /^\((\w), (\w)\) needs \((\w), (\w)\)$/.exec(q);
      const cell = p && M.cells[p[1] + p[2]], need = p && M.cells[p[3] + p[4]];
      if (!cell || cell.crossed !== rd || !need || !(need.crossed >= 0 && need.crossed < rd) || !cell.imp.includes(p[3] + p[4])) fail('round ' + rd + ': "' + q + '" does not hold');
    }
    ctx.pass();
  });
  const said = (re) => { const f = r.frames.find((x) => re.test(x.say)); return f ? re.exec(f.say) : null; };
  if (!count(r, /^Pairs with /)) fail('no implication-table frames');
  const pc = said(/^No more crosses\. The pairs left are compatible: (.*)\.$/);
  const want = M.pairs.map((p) => '(' + p.join(', ') + ')').join(', ');
  if (!pc || pc[1].split('), (').sort().join() !== want.split('), (').sort().join()) fail('the compatible pairs are "' + (pc && pc[1]) + '", want ' + want);
  const mx = said(/maximal compatibles: (.*)\.$/);
  const sets = (s) => s.match(/\{[^}]*\}/g).map((b) => b.replace(/[{}\s,]/g, '').split('').sort().join('')).sort().join(' ');
  const wantMx = M.maximal.map((s) => s.join('')).sort().join(' ');
  if (!mx || sets(mx[1]) !== wantMx) fail('the maximal compatibles are "' + (mx && mx[1]) + '", want ' + wantMx);
  const f = r.frames.find((x) => x.predict && /maximal/.test(x.predict.ask));
  if (f && String(f.predict.answer) !== String(M.maximal.length)) fail('the prediction answers ' + f.predict.answer + ', there are ' + M.maximal.length);
  const cv = said(/^The smallest closed cover is (.*?): it covers/);
  if (!cv) { fail('no closed cover frame'); return; }
  const blocks = cv[1].match(/\{[^}]*\}/g).map((b) => b.replace(/[{}\s]/g, '').split(','));
  if (!M.closed(blocks)) fail('the cover ' + cv[1] + ' is not closed or misses a row');
  if (blocks.length !== M.smallest) fail('the cover has ' + blocks.length + ' blocks, the smallest closed cover has ' + M.smallest);
  if (!lastSay(r).endsWith(M.st.length + ' rows became ' + blocks.length + '.')) fail('the end says "' + lastSay(r) + '"');
}

/** the merged table of a cover: each block's entry per column is the block holding all its rows' entries */
function mergedOf(t, blocks) {
  const cols = gray(2), out = {};
  for (const b of blocks) {
    out[b] = {};
    for (const c of cols) {
      const e = [...new Set([...b].map((x) => t.rows[x][c]).filter((v) => v !== '-'))];
      out[b][c] = !e.length ? null : e.every((v) => b.includes(v)) ? b : blocks.find((o) => e.every((v) => o.includes(v)));
    }
  }
  return out;
}
/** the assigned transition table: codes {block: code}, a move on a diagonal relayed through a spare code */
function assigned(mt, codes) {
  const tbl = {}, cols = gray(2), all = gray(2), used = Object.values(codes);
  for (const [b, c] of Object.entries(codes)) tbl[c] = {};
  for (const [b, cd] of Object.entries(codes)) for (const c of cols) {
    const tg = mt[b][c];
    if (tg === null) { tbl[cd][c] = null; continue; }
    const to = codes[tg];
    if (ham(cd, to) < 2) { tbl[cd][c] = to; continue; }
    const sp = all.find((s) => !used.includes(s) && ham(s, cd) === 1 && ham(s, to) === 1);
    tbl[cd][c] = sp;
    tbl[sp] = tbl[sp] || {};
    tbl[sp][c] = to;
  }
  return tbl;
}
const codesFrom = (say) => Object.fromEntries([...say.matchAll(/(\w+) = ([01]{2})/g)].map((m) => [m[1], m[2]]));

function asyncAssign(ctx) {
  const { S, input: inp, r, fail } = ctx;
  const t = S.P10.examples[inp.ex].table();
  const f2 = r.frames.find((f) => /^Assign /.test(f.say));
  const codes = codesFrom(f2.say.split('.')[0]);
  const blocks = Object.keys(codes), mt = mergedOf(t, blocks);
  const pairs = new Set();
  for (const b of blocks) for (const c of gray(2)) if (mt[b][c] && mt[b][c] !== b) pairs.add([b, mt[b][c]].sort().join('–'));
  const f1 = r.frames.find((f) => /These rows must get codes one bit apart: /.test(f.say));
  const said = /one bit apart: (.*)\.$/.exec(f1.say)[1].split(', ').map((p) => p.split('–').sort().join('–')).sort().join(', ');
  if (said !== [...pairs].sort().join(', ')) fail('the adjacent pairs are "' + said + '", the merged table needs ' + [...pairs].sort().join(', '));
  const diag = [...pairs].filter((p) => { const [a, b] = p.split('–'); return ham(codes[a], codes[b]) > 1; });
  if (diag.length ? !/One move is left on a diagonal/.test(f2.say) : !/Every line falls on an edge/.test(f2.say)) fail('frame "' + f2.say + '" with ' + diag.length + ' diagonal moves');
  if (f1.predict && f1.predict.answer !== (diag.length ? 'No: a spare code is needed' : 'Yes, directly')) fail('the prediction answers ' + f1.predict.answer);
  const tbl = assigned(mt, codes);
  const sp = r.frames.find((f) => /^Spare row/.test(f.say));
  for (const m of sp ? sp.say.matchAll(/Spare row (\d+): in column (\d+) it passes on to (\d+)\./g) : []) if (!tbl[m[1]] || tbl[m[1]][m[2]] !== m[3]) fail('spare row ' + m[1] + ' in column ' + m[2] + ' should pass on to ' + (tbl[m[1]] && tbl[m[1]][m[2]]));
  for (const [rw, cs] of Object.entries(tbl)) for (const [c, v] of Object.entries(cs)) if (v && v !== rw && ham(v, rw) !== 1) fail('row ' + rw + ', column ' + c + ' moves to ' + v + ', two bits away');
  ctx.pass();
}

function asyncImplement(ctx) {
  const { S, input: inp, r, fail } = ctx;
  const E = S.P10.examples[inp.ex], t = E.table();
  const codes = codesFrom(r.frames[0].say.split(' with variables')[0]);
  const tbl = assigned(mergedOf(t, Object.keys(codes)), codes);
  const vars = ['y2', 'y1', 'x1', 'x2'], cells = combos(vars);
  const code = (e) => '' + e.y2 + e.y1, col = (e) => '' + e.x1 + e.x2;
  // what each excitation must be: 1, 0 or don't care (null)
  const want = (v, e) => { const row = tbl[code(e)]; const nx = row ? row[col(e)] : null; return nx == null ? null : +nx[v === 'Y2' ? 0 : 1]; };
  const stableOut = (e) => { const b = Object.keys(codes).find((k) => codes[k] === code(e)); if (!b || !tbl[code(e)] || tbl[code(e)][col(e)] !== code(e)) return null; const rw = [...b].find((x) => t.rows[x][col(e)] === x); return rw ? +t.out[rw] : null; };
  const evalEq = (text, e) => S.Netlist.evaluate(S.Netlist.parse(prime(text)), e);
  const terms = (text) => prime(text).split(' + ').map((p) => S.Netlist.parse(p));
  const split = (text, need) => { // a pair of neighbouring 1s that no single term holds
    const ts = terms(text);
    for (const a of cells) for (const v of vars) {
      const b = Object.assign({}, a, { [v]: 1 - a[v] });
      if (need(a) === 1 && need(b) === 1 && !ts.some((q) => S.Netlist.evaluate(q, a) && S.Netlist.evaluate(q, b))) return [a, b];
    }
    return null;
  };
  r.frames.forEach((f, i) => {
    let m = /^(\w+): a minimal cover takes (.*)\.$/.exec(f.say);
    const need = (nm) => (nm === 'Z' ? stableOut : (e) => want(nm, e));
    if (m) {
      for (const e of cells) { const w = need(m[1])(e); if (w !== null && evalEq(m[2], e) !== w) { fail('frame ' + i + ': ' + m[1] + ' = ' + m[2] + ' gives ' + (1 - w) + ' at ' + JSON.stringify(e)); break; } }
      const nx = r.frames[i + 1].say;
      if (/^Two neighbouring 1s are held by different terms/.test(nx) !== !!split(m[2], need(m[1]))) fail('frame ' + (i + 1) + ': the cover ' + m[2] + (split(m[2], need(m[1])) ? ' splits a pair of 1s, unsaid' : ' splits none, yet a term is added'));
      ctx.pass();
      return;
    }
    m = /^(\w+) = (.*?)(?:, hazard-free\.|; no neighbouring 1s are split, so it is already hazard-free\.)$/.exec(f.say);
    if (m) {
      for (const e of cells) { const w = need(m[1])(e); if (w !== null && evalEq(m[2], e) !== w) { fail('frame ' + i + ': ' + m[1] + ' = ' + m[2] + ' is wrong at ' + JSON.stringify(e)); break; } }
      const s = split(m[2], need(m[1]));
      if (s) fail('frame ' + i + ': ' + m[1] + ' = ' + m[2] + ' is called hazard-free, but no one term holds both ' + JSON.stringify(s[0]) + ' and ' + JSON.stringify(s[1]));
      ctx.pass();
    }
  });
  if (count(r, /: a minimal cover takes /) !== 3 || count(r, /hazard-free\.$/) !== 3) fail('expected three covers, each called hazard-free');
  if (count(r, /^At \d+ ns the inputs become/) !== E.seq.length - 1) fail('expected a frame per input change');
  // the run: each output agrees with the table, with the words, and with the waveform drawn
  const seq = E.seq, flow = runFlow(t, seq).out;
  let z = 0; const mem = {};
  r.frames.forEach((f, i) => {
    const m = /^At (\d+) ns the inputs become (\d+): (\w+) = (\d) \(the flow table says (\d)\)\.$/.exec(f.say);
    if (!m) return;
    const k = +m[1] / 40;
    z = SPEC[inp.ex](z, seq[k - 1], seq[k], mem);
    const w = wave(f, m[3]);
    if (m[2] !== seq[k] || +m[5] !== flow[k].z || +m[4] !== z || !w || w.last !== +m[4]) fail('frame ' + i + ': "' + f.say + '"; the table gives ' + flow[k].z + ', the description ' + z + ', the waveform ' + (w && w.last));
    if (r.frames[i - 1].predict && String(r.frames[i - 1].predict.answer) !== m[4]) fail('frame ' + (i - 1) + ': the prediction answers ' + r.frames[i - 1].predict.answer);
    ctx.pass();
  });
}

function hzStatic(ctx) {
  const { S, input: inp, r, fail } = ctx;
  const cover = { minimal: "x1x2 + x2'y", free: "x1x2 + x2'y + x1y" }[inp.cover];
  // a static-1 hazard in the cover: neighbouring 1s of Y no single term holds
  const ts = cover.split(' + ').map((p) => S.Netlist.parse(p)), vs = ['y', 'x1', 'x2'];
  let hz = false;
  for (const a of combos(vs)) for (const v of vs) { const b = Object.assign({}, a, { [v]: 1 - a[v] }); const one = (e) => ts.some((q) => S.Netlist.evaluate(q, e)); if (one(a) && one(b) && !ts.some((q) => S.Netlist.evaluate(q, a) && S.Netlist.evaluate(q, b))) hz = true; }
  if (hz !== /a static-1 hazard in the cover/.test(r.frames[1].say)) fail('frame 1 says "' + r.frames[1].say + '"; the cover ' + (hz ? 'has' : 'has no') + ' static-1 hazard');
  // every event is on the waveform it is narrated with, and one gate delay after a change on that gate's inputs
  const D = { "x2'": [inp.inv, ['x2']], 'x1·x2': [3, ['x1', 'x2']], 'y·x2′': [3, ['y', "x2'"]], 'x1·y': [3, ['x1', 'y']], Y: [3, ['x1·x2', 'y·x2′', 'x1·y']], y: [2, ['Y']] };
  const events = [{ t: 40, n: 'x2', v: 0 }];
  r.frames.forEach((f, i) => {
    const m = /^At ([\d.]+) ns (\S+) (rises to 1|falls to 0)\./.exec(f.say);
    if (!m) return;
    const t = +m[1], n = prime(m[2]) === "x2'" ? "x2'" : m[2], v = m[3] === 'rises to 1' ? 1 : 0;
    const w = wave(f, n);
    if (!w || !w.at(t) || w.last !== v) fail('frame ' + i + ': ' + n + ' at ' + t + ' ns is not on its waveform');
    const d = D[n];
    if (!d || !events.some((e) => d[1].includes(e.n) && Math.abs(e.t + d[0] - t) < 1e-6)) fail('frame ' + i + ': ' + n + ' changes at ' + t + ' ns, no input of its gate changed ' + (d && d[0]) + ' ns before');
    if (/inverter has caught up \((\d+) ns\)/.test(f.say) && (+/\((\d+) ns\)/.exec(f.say)[1] !== inp.inv || t !== 40 + inp.inv)) fail('frame ' + i + ': the inverter delay is ' + inp.inv);
    events.push({ t, n, v });
  });
  if (events.length < 3) fail('fewer than two events narrated');
  const yEnd = wave(r.frames[r.frames.length - 1], 'y').last, dips = events.filter((e) => e.n === 'Y').length;
  const v = lastSay(r);
  if ((yEnd === 0) !== v.startsWith('y ended at 0') || (dips === 0 && /Y dipped/.test(v)) || (yEnd === 1 && dips === 0 && !/never dips|stayed at 1/.test(v))) fail('the verdict "' + v + '": y ends ' + yEnd + ', Y changed ' + dips + ' times');
  if (r.frames[0].predict && r.frames[0].predict.answer !== (yEnd === 1 ? 'y stays 1' : 'y falls to 0 and stays there')) fail('the prediction answers ' + r.frames[0].predict.answer);
  const gap = /comes on only ([\d.]+) ns after x1x2 lets go/.exec(v);
  if (gap) { const off = events.find((e) => e.n === 'x1·x2' && e.v === 0), on = events.find((e) => e.n === 'y·x2′' && e.v === 1); if (!off || !on || Math.abs(on.t - off.t - +gap[1]) > 1e-6 || +gap[1] >= 3) fail('the gap of ' + gap[1] + ' ns does not match the run'); }
  if (/comes on before x1x2 lets go/.test(v)) { const off = events.find((e) => e.n === 'x1·x2' && e.v === 0), on = events.find((e) => e.n === 'y·x2′' && e.v === 1); if (!on || (off && on.t > off.t)) fail('x2′y does not come on before x1x2 lets go'); }
}

function hzDynamic(ctx) {
  const { S, input: inp, r, fail } = ctx;
  const G = {
    dynamic: { "x'": ['inv', 2, ['x']], "x'z": ['g1', 3, ["x'", 'z']], xy: ['g2', 10, ['x', 'y']], G: ['g3', 3, ["x'z", 'xy']], F: ['g4', 3, ['x', 'G']] },
    fixed: { "x'": ['inv', 2, ['x']], "x'z": ['g1', 3, ["x'", 'z']], xy: ['g2', 10, ['x', 'y']], yz: ['g5', 3, ['y', 'z']], G: ['g3', 3, ["x'z", 'xy', 'yz']], F: ['g4', 3, ['x', 'G']] },
    static0: { "x'": ['inv', 8, ['x']], 'x+y': ['g1', 3, ['x', 'y']], "x'+z": ['g2', 3, ["x'", 'z']], F: ['g3', 3, ['x+y', "x'+z"]] },
  }[inp.kind];
  const fn = { dynamic: (e) => e.x && ((!e.x && e.z) || (e.x && e.y)), fixed: (e) => e.x && ((!e.x && e.z) || (e.x && e.y) || (e.y && e.z)), static0: (e) => (e.x || e.y) && (!e.x || e.z) }[inp.kind];
  const from = inp.kind === 'static0' ? { x: 0, y: 0, z: 0 } : { x: 0, y: 1, z: 1 }, to = Object.assign({}, from, { x: 1 });
  const b = fn(from) ? 1 : 0, a = fn(to) ? 1 : 0;
  if (!r.frames[0].say.endsWith('F should ' + (a === b ? 'stay ' + b : 'change once, from ' + b + ' to ' + a) + '.')) fail('frame 0 says "' + r.frames[0].say + '"; F goes from ' + b + ' to ' + a);
  const events = [{ t: 30, n: 'x', v: 1 }], fv = [];
  r.frames.forEach((f, i) => {
    const m = /^At ([\d.]+) ns (\S+) (rises|falls)(?: \((\w+), (\d+) ns\))?\.(?: F has now changed (\d+) times?\.)?$/.exec(f.say);
    if (!m) return;
    const t = +m[1], n = prime(m[2]), v = m[3] === 'rises' ? 1 : 0, g = G[n];
    const w = wave(f, n);
    if (!w || !w.at(t) || w.last !== v) fail('frame ' + i + ': ' + n + ' at ' + t + ' ns is not on its waveform');
    if (!g || m[4] !== g[0] || +m[5] !== g[1]) fail('frame ' + i + ': ' + n + ' is driven by ' + (g && g[0]) + ' (' + (g && g[1]) + ' ns), the frame says ' + m[4] + ' (' + m[5] + ' ns)');
    else if (!events.some((e) => g[2].includes(e.n) && Math.abs(e.t + g[1] - t) < 1e-6)) fail('frame ' + i + ': ' + n + ' changes at ' + t + ' ns, no input of ' + g[0] + ' changed ' + g[1] + ' ns before');
    events.push({ t, n, v, g: g && g[0] });
    if (n === 'F') { fv.push(v); if (+m[6] !== fv.length) fail('frame ' + i + ': F has changed ' + fv.length + ' times, not ' + m[6]); }
  });
  if (!fv.length) fail('F never changes in the narration');
  if (fv.length && fv[fv.length - 1] !== a) fail('F ends at ' + fv[fv.length - 1] + ', the function gives ' + a);
  if (r.frames[0].predict && String(r.frames[0].predict.answer) !== String(fv.length)) fail('the prediction answers ' + r.frames[0].predict.answer + ', F changed ' + fv.length + ' times');
  const v = lastSay(r);
  if (inp.kind === 'dynamic') {
    const want = 'F changed ' + fv.length + ' times (' + [b].concat(fv).join(' → ') + ') instead of once';
    if (!v.startsWith(want)) fail('the verdict "' + v + '", want "' + want + '…"');
    const order = events.slice(1).map((e) => e.g).join(', ');
    if (!v.endsWith('the gates switched in the order ' + order + '.')) fail('the verdict gives the order "' + v + '", the events ' + order);
  }
  if (inp.kind === 'static0') { const f = events.filter((e) => e.n === 'F'); if (!(f.length === 2 && v.startsWith('F pulsed to 1 for ' + (f[1].t - f[0].t) + ' ns'))) fail('the verdict "' + v + '"'); }
  if (inp.kind === 'fixed' && !(fv.length === 1 && v.startsWith('F changed once'))) fail('the verdict "' + v + '" with ' + fv.length + ' changes');
}

function hzEssential(ctx) {
  const { S, input: inp, r, fail } = ctx;
  const t = S.P10.examples.catch.table(), d = S.Async.design(t), asg = d.assignment;
  const tbl = asg.table, codes = asg.codes, rowOf = Object.fromEntries(Object.entries(codes).map(([k, v]) => [v, k]));
  // follow the assigned table by hand: each variable changes one at a time where the table moves one bit
  const settle = (y, x) => { for (let k = 0; k < 8; k++) { const n = tbl[y] && tbl[y][x]; if (!n || n === y) return y; y = n; } return null; };
  const once = settle('00', '10'), thrice = settle(settle(settle('00', '10'), '11'), '10');
  const f1 = r.frames[1].say;
  if (!f1.includes('if x2 falls once the logic settles in ' + once + '; if it saw x2 fall, rise and fall again it would end in ' + thrice + '.')) fail('frame 1 says "' + f1 + '"; once ' + once + ', three times ' + thrice);
  const at = (f, n) => { const w = wave(f, n); return w ? w.last : null; };
  // frame 0 shows the circuit; frame 1 the waves up to the same moment, just before x2 falls
  const f0 = r.frames[0], w1 = r.frames[1], c0 = '' + at(w1, 'y2') + at(w1, 'y1');
  if (c0 !== '00' || at(w1, 'Z') !== 0 || !f0.say.includes('it rests in row ' + rowOf[c0] + ' (' + c0 + '), Z = ' + at(w1, 'Z'))) fail('frame 0 says "' + f0.say + '", the waves show ' + c0 + ', Z = ' + at(w1, 'Z'));
  r.frames.forEach((f, i) => {
    const m = /^At ([\d.]+) ns (x2 late|y2|y1|Z) (rises|falls)\./.exec(f.say);
    if (!m) return;
    const w = wave(f, m[2]);
    if (!w || !w.at(+m[1]) || w.last !== (m[3] === 'rises' ? 1 : 0)) fail('frame ' + i + ': ' + m[2] + ' at ' + m[1] + ' ns is not on its waveform');
    const down2 = Math.max(90, 40 + inp.late + 10) + 50;
    if (m[2] === 'x2 late' && Math.abs(+m[1] - down2 - inp.late) > 1e-6) fail('frame ' + i + ': x2 falls at ' + down2 + ' ns, so its late copy falls at ' + (down2 + inp.late));
    const p = /and is now at (\d+)(, the spare code| \(row (\w+)\))\./.exec(f.say);
    if (p) { const cd = '' + at(f, 'y2') + at(f, 'y1'); if (p[1] !== cd || (p[3] ? rowOf[cd] !== p[3] : !!rowOf[cd])) fail('frame ' + i + ': now at ' + p[1] + ', the waves show ' + cd); }
    const mv = /The circuit moves to row (\w+)/.exec(f.say);
    if (mv && rowOf['' + at(f, 'y2') + at(f, 'y1')] !== mv[1]) fail('frame ' + i + ': moves to row ' + mv[1] + ', the waves show ' + at(f, 'y2') + at(f, 'y1'));
    ctx.pass();
  });
  const fl = r.frames[r.frames.length - 1], cd = '' + at(fl, 'y2') + at(fl, 'y1'), z = at(fl, 'Z');
  const m = /^It settled in (\d+)(?: \(row (\w+)\)| \(the spare code[^)]*\))?, Z = (\d): (correct|the wrong place)/.exec(fl.say);
  if (!m || m[1] !== cd || +m[3] !== z || (m[4] === 'correct') !== (cd === once)) fail('the end says "' + fl.say + '"; the waves show ' + cd + ', Z = ' + z + ', and the right row is ' + once);
  const pr = r.frames.find((f) => f.predict);
  if (pr && pr.predict.answer !== (cd === once ? 'the right row (Z = 0)' : 'the wrong row (Z = 1)')) fail('the prediction answers ' + pr.predict.answer);
  if (pr && cd !== once && z !== 1) fail('the wrong row is promised with Z = 1, but Z = ' + z);
}

const CHECK = { 'async-loops': asyncLoops, 'async-tables': asyncTables, 'async-fundamental': asyncFundamental, 'async-races': asyncRaces, 'async-sr': asyncSr, 'async-primitive': asyncPrimitive, 'async-merger': asyncMerger, 'async-assign': asyncAssign, 'async-implement': asyncImplement, 'hz-static': hzStatic, 'hz-dynamic': hzDynamic, 'hz-essential': hzEssential };
const EQS = ["Y1 = x1x2' + x1y2'; Y2 = x2y1' + x2y2; z = y1y2", 'Y = x1x2 + x1y + x2y; z = y', "Y = S + R'y; Q = y", "Y1 = x1y1' + x2y1; z = y1", 'Y1 = xy2y3 + y1; Y2 = xy3 + y2; Y3 = x + y3; z = y1', "Y1 = x1y2 + y1x2'; Y2 = x1'y1 + x2y2'; z = y1 + y2", "Y = x1'x2 + x2y; z = y", "Y1 = x1 + y2; Y2 = x1'y1 + x2; z = y1y2"];
export default {
  family: /^p10-/,
  extra: {
    'async-tables': EQS.map((eqs) => ({ eqs })),
    'async-fundamental': EQS.flatMap((eqs) => { const m = /x1|x2/.test(eqs) && !/\bx\b|x[^12]/.test(eqs.replace(/x1|x2/g, '')); return m ? [{ eqs, seq: '00 01 11 10 00 10 11 01 00' }, { eqs, seq: '00 11 01 10 00' }] : [{ eqs, seq: '0 1 0 1' }]; }),
    'async-races': EQS.flatMap((eqs) => { const ins = (/x1|x2/.test(eqs) ? ['00', '01', '11', '10'] : ['0', '1']); const nv = (eqs.match(/Y\d*\s*=/g) || []).length; return ins.flatMap((x) => gray(nv).map((y) => ({ eqs, x, y }))); }),
    'hz-static': ['minimal', 'free'].flatMap((cover) => [1, 2, 3, 4, 5, 6, 12, 30].map((inv) => ({ cover, inv }))),
    'hz-essential': [[1, 0], [20, 0], [39, 0], [41, 0], [80, 0], [150, 0], [80, 90], [150, 200], [10, 50]].map(([late, loop]) => ({ late, loop })),
  },
  random: {},
  check(ctx) {
    const f = CHECK[ctx.tp.id];
    if (!f) { ctx.fail('no claim check for this topic'); return; }
    f(ctx);
  },
};
