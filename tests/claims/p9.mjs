// Part 9: register-transfer design. Every register value, test, output and next state a frame quotes is checked
// against small models of the designs written out here by hand (not the chart engine), and the control equations
// against a walk of the chart itself.

// ---- the designs as plain clock-by-clock models: step(state, regs, inputs) -> {tests, outputs, regs, next} ----
const M = {
  multiplier: {
    regs: { A: 0, M: 0, Q: 0, C: 0, P: 0 },
    step(st, r, x) {
      const n = Object.assign({}, r), tests = [];
      if (st === 'IDLE') {
        tests.push(['START', x.START]);
        if (x.START) { Object.assign(n, { A: 0, C: 0, P: 4, M: x.MIN, Q: x.QIN }); return { tests, outputs: ['READY'], regs: n, next: 'ADD' }; }
        return { tests, outputs: ['READY'], regs: n, next: 'IDLE' };
      }
      if (st === 'ADD') {
        tests.push(['Q0', r.Q & 1]);
        n.P = (r.P - 1) & 7;
        if (r.Q & 1) { const s = r.A + r.M; n.C = (s >> 4) & 1; n.A = s & 15; }
        return { tests, outputs: [], regs: n, next: 'SHIFT' };
      }
      tests.push(['Z', r.P === 0 ? 1 : 0]);
      const v = ((r.C << 8) | (r.A << 4) | r.Q) >> 1;
      n.C = (v >> 8) & 1; n.A = (v >> 4) & 15; n.Q = v & 15;
      return { tests, outputs: [], regs: n, next: r.P === 0 ? 'IDLE' : 'ADD' };
    },
  },
  divider: {
    regs: { A: 0, Q: 0, M: 0, P: 0, E: 0 },
    step(st, r, x) {
      const n = Object.assign({}, r), tests = [];
      if (st === 'IDLE') {
        tests.push(['START', x.START]);
        if (!x.START) return { tests, outputs: ['READY'], regs: n, next: 'IDLE' };
        const dz = x.VIN === 0 ? 1 : 0;
        tests.push(['DZ', dz]);
        if (dz) { n.E = 1; return { tests, outputs: ['READY'], regs: n, next: 'IDLE' }; }
        Object.assign(n, { A: 0, Q: x.DIN, M: x.VIN, P: 4, E: 0 });
        return { tests, outputs: ['READY'], regs: n, next: 'SHIFT' };
      }
      if (st === 'SHIFT') { const v = ((r.A << 4) | r.Q) << 1; n.A = (v >> 4) & 31; n.Q = v & 15; n.P = (r.P - 1) & 7; return { tests, outputs: [], regs: n, next: 'SUB' }; }
      if (st === 'SUB') { n.A = (r.A - r.M) & 31; return { tests, outputs: [], regs: n, next: 'TEST' }; }
      const z = r.P === 0 ? 1 : 0, neg = (r.A >> 4) & 1;
      tests.push(['Z', z], ['NEG', neg]);
      if (neg) n.A = (r.A + r.M) & 31; else n.Q = r.Q | 1;
      return { tests, outputs: [], regs: n, next: z ? 'IDLE' : 'SHIFT' };
    },
  },
  gcd: {
    regs: { X: 0, Y: 0 },
    step(st, r, x) {
      const n = Object.assign({}, r), tests = [];
      if (st === 'IDLE') {
        tests.push(['START', x.START]);
        if (x.START) { n.X = x.XIN; n.Y = x.YIN; return { tests, outputs: ['READY'], regs: n, next: 'CMP' }; }
        return { tests, outputs: ['READY'], regs: n, next: 'IDLE' };
      }
      tests.push(['EQ', r.X === r.Y ? 1 : 0]);
      if (r.X === r.Y) return { tests, outputs: [], regs: n, next: 'IDLE' };
      tests.push(['LT', r.X < r.Y ? 1 : 0]);
      if (r.X < r.Y) n.Y = (r.Y - r.X) & 255; else n.X = (r.X - r.Y) & 255;
      return { tests, outputs: [], regs: n, next: 'CMP' };
    },
  },
  traffic: {
    regs: { T: 0 }, start: 'MG',
    step(st, r, x) {
      const n = Object.assign({}, r), tests = [];
      const OUT = { MG: ['MAIN_G', 'SIDE_R'], MY: ['MAIN_Y', 'SIDE_R'], SG: ['MAIN_R', 'SIDE_G'], SY: ['MAIN_R', 'SIDE_Y'] }[st];
      const phase = { MG: ['LONG', 5, 'MY'], MY: ['SHORT', 1, 'SG'], SG: ['DONE', 3, 'SY'], SY: ['SHORT', 1, 'MG'] }[st];
      const hit = r.T === phase[1] ? 1 : 0;
      tests.push([phase[0], hit]);
      if (!hit) { n.T = (r.T + 1) & 7; return { tests, outputs: OUT, regs: n, next: st }; }
      if (st === 'MG') {
        tests.push(['SC', x.SC]);
        if (!x.SC) { tests.push(['PB', x.PB]); if (!x.PB) return { tests, outputs: OUT, regs: n, next: 'MG' }; }
      }
      n.T = 0;
      return { tests, outputs: OUT, regs: n, next: phase[2] };
    },
  },
  vending: {
    regs: { SUM: 0 }, start: 'WAIT',
    step(st, r, x) {
      const n = Object.assign({}, r), tests = [];
      if (st === 'WAIT') {
        tests.push(['C10', x.C10 || 0]);
        if (x.C10) { n.SUM = (r.SUM + 10) & 31; return { tests, outputs: [], regs: n, next: 'CHECK' }; }
        tests.push(['C5', x.C5 || 0]);
        if (x.C5) { n.SUM = (r.SUM + 5) & 31; return { tests, outputs: [], regs: n, next: 'CHECK' }; }
        return { tests, outputs: [], regs: n, next: 'WAIT' };
      }
      if (st === 'CHECK') { const e = r.SUM >= 20 ? 1 : 0; tests.push(['ENOUGH', e]); return { tests, outputs: [], regs: n, next: e ? 'VEND' : 'WAIT' }; }
      if (st === 'VEND') { n.SUM = (r.SUM - 20) & 31; return { tests, outputs: ['VEND'], regs: n, next: 'CHANGE' }; }
      const z = r.SUM === 0 ? 1 : 0;
      tests.push(['ZERO', z]);
      if (z) return { tests, outputs: [], regs: n, next: 'WAIT' };
      n.SUM = (r.SUM - 5) & 31;
      return { tests, outputs: ['CHG'], regs: n, next: 'CHANGE' };
    },
  },
};
/** run a model for n clocks: [{cycle, state, before, ...step}] */
function runModel(key, inputs, n) {
  const m = M[key];
  let st = m.start || 'IDLE', regs = Object.assign({}, m.regs);
  const out = [];
  for (let c = 0; c < n; c++) {
    const x = inputs(c, regs, st) || {};
    const s = m.step(st, regs, x);
    out.push(Object.assign({ cycle: c, state: st, before: regs, x }, s));
    regs = s.regs; st = s.next;
  }
  return out;
}
const changesOf = (a, b) => Object.keys(b).filter((k) => a[k] !== b[k]).map((k) => k + ' ' + a[k] + ' → ' + b[k]);
const bin = (v, w) => v.toString(2).padStart(w, '0');
const gcd = (a, b) => (b ? gcd(b, a % b) : a);

/** check every "Cycle n in S: ..." frame against the model's run */
function checkCycles(ctx, model, extra) {
  const { r, fail } = ctx;
  let seen = 0;
  r.frames.forEach((f, i) => {
    const m = /^Cycle (\d+) in (\w+)(?:: (.*?))?(?: \(([^()]*)\))?; next (\w+)\.(.*)$/.exec(f.say || '');
    if (!m) return;
    seen++;
    const k = +m[1] - 1, step = model[k];
    if (!step) { fail('frame ' + i + ': cycle ' + (k + 1) + ' is past the model\'s run'); return; }
    const said = m[3] || '';
    const tests = [...said.split('; ')[0].matchAll(/\b([A-Z][A-Z0-9_]*) = ([01])\b/g)].map((x) => x[1] + ' = ' + x[2]).join(', ');
    const want = step.tests.map(([a, b]) => a + ' = ' + b).join(', ');
    if (m[2] !== step.state) fail('frame ' + i + ': in ' + m[2] + ', the model is in ' + step.state);
    if (tests !== want) fail('frame ' + i + ': the decisions read "' + tests + '", the model reads "' + want + '"');
    const outs = /(?:^|; )([A-Z_, ]+) asserted/.exec(said);
    if ((outs ? outs[1].split(', ').join(',') : '') !== step.outputs.join(',')) fail('frame ' + i + ': outputs "' + (outs ? outs[1] : '') + '", the model has "' + step.outputs.join(', ') + '"');
    const ch = changesOf(step.before, step.regs).join(', ');
    if ((m[4] || '') !== ch) fail('frame ' + i + ': the changes are "' + (m[4] || '') + '", the model has "' + ch + '"');
    if (m[5] !== step.next) fail('frame ' + i + ': next ' + m[5] + ', the model goes to ' + step.next);
    if (extra) for (const e of extra(step, m[6].trim(), f, i)) fail('frame ' + i + ': ' + e);
    ctx.pass();
  });
  if (!seen) fail('no clock frames found');
}
/** a prediction must agree with what the next frame (the model) shows */
function checkPredicts(ctx, model, answer) {
  ctx.r.frames.forEach((f, i) => {
    if (!f.predict) return;
    const m = /^Cycle (\d+) in/.exec(ctx.r.frames[i + 1].say || '');
    if (!m) return;
    const want = answer(model[+m[1] - 1]);
    if (want !== undefined && String(f.predict.answer) !== String(want)) ctx.fail('frame ' + i + ': the prediction answers "' + f.predict.answer + '", the model says "' + want + '"');
  });
}
const lastSay = (r) => r.frames[r.frames.length - 1].say;

// ---- the chart walked directly (ch.boxes), independent of the engine's paths and controller ----
function walk(ch, s) {
  const by = Object.fromEntries(ch.boxes.map((b) => [b.id, b]));
  const out = [];
  const go = (id, conds, acts, first) => {
    const b = by[id];
    if (b.kind === 'state' && !first) { out.push({ conds, actions: acts, target: b.name || b.id }); return; }
    if (b.kind === 'state') return go(b.next, conds, acts.concat(b.actions || []), false);
    if (b.kind === 'cond') return go(b.next, conds, acts.concat(b.actions || []), false);
    go(b.t, conds.concat([[b.cond, 1]]), acts, false);
    go(b.f, conds.concat([[b.cond, 0]]), acts, false);
  };
  go(s, [], [], true);
  return out;
}
const statesOf = (ch) => ch.boxes.filter((b) => b.kind === 'state').map((b) => b.name || b.id);
/** the path taken from s for the signal values sig */
const pathFor = (ch, s, sig) => walk(ch, s).find((p) => p.conds.every(([c, v]) => (sig[c] ? 1 : 0) === v));
/** evaluate an SOP written as "T_S·A′·B + T_X" (or 0, 1) with the state lines and signals */
function sop(text, env) {
  const t = text.replace(/'/g, '′').trim();
  if (t === '0') return 0;
  if (t === '1') return 1;
  return t.split(' + ').some((p) => p.split('·').every((l) => { const neg = l.endsWith('′'), n = neg ? l.slice(0, -1) : l; if (!(n in env)) throw new Error('unknown literal ' + n); return (env[n] ? 1 : 0) !== (neg ? 1 : 0); })) ? 1 : 0;
}
const literals = (text) => { const t = text.trim(); return t === '0' || t === '1' ? 0 : t.split(' + ').reduce((a, p) => a + p.split('·').length, 0); };
function combos(names) { const out = []; for (let m = 0; m < 1 << names.length; m++) { const o = {}; names.forEach((n, i) => { o[n] = (m >> i) & 1; }); out.push(o); } return out; }
const signalsOf = (ch) => [...new Set(ch.boxes.filter((b) => b.kind === 'decision').map((b) => b.cond))];

// ---- the per-topic checks ----
const DESIGN = {
  'asm-multiplier': (ctx) => {
    const { input: inp, fail } = ctx;
    const model = runModel('multiplier', (k) => ({ START: k === 1 ? 1 : 0, MIN: inp.m, QIN: inp.q }), 40);
    checkCycles(ctx, model, (step, rest) => {
      const e = [];
      if (step.state === 'ADD' && rest !== (step.before.Q & 1 ? 'Q0 = 1, so M is added into A (the carry goes to C).' : 'Q0 = 0, so nothing is added.')) e.push('ADD says "' + rest + '"');
      if (step.state === 'SHIFT' && rest !== 'C, A and Q shift right as one: A Q = ' + bin(step.regs.A, 4) + ' ' + bin(step.regs.Q, 4) + '.') e.push('SHIFT says "' + rest + '"');
      return e;
    });
    checkPredicts(ctx, model, (s) => (s.state === 'ADD' ? (s.before.Q & 1 ? 'Yes: Q0 = 1' : 'No: Q0 = 0') : undefined));
    const p = inp.m * inp.q;
    if (lastSay(ctx.r) !== 'Back in IDLE. The product is A Q = ' + bin(p >> 4, 4) + ' ' + bin(p & 15, 4) + ' = ' + p + ', and ' + inp.m + ' × ' + inp.q + ' = ' + p + '. Four add-and-shift rounds, two clocks each.') fail('the end says "' + lastSay(ctx.r) + '"');
    if (!ctx.r.frames[0].say.includes('M = ' + inp.m + ' (' + bin(inp.m, 4) + ') and Q = ' + inp.q + ' (' + bin(inp.q, 4) + ')')) fail('the intro misquotes M or Q');
  },
  'asm-divider': (ctx) => {
    const { input: inp, fail } = ctx;
    const model = runModel('divider', (k) => ({ START: k === 1 ? 1 : 0, DIN: inp.d, VIN: inp.v }), 40);
    checkCycles(ctx, model, (step, rest) => {
      const e = [];
      if (step.state === 'SUB' && rest !== 'Trial subtraction: A = ' + bin(step.regs.A, 5) + (step.regs.A & 16 ? ' (negative).' : ' (not negative).')) e.push('SUB says "' + rest + '"');
      if (step.state === 'TEST' && rest !== ((step.before.A >> 4) & 1 ? 'Negative: add M back (restore); the quotient bit stays 0.' : 'Not negative: keep it, and the quotient bit Q0 becomes 1.')) e.push('TEST (A = ' + bin(step.before.A, 5) + ') says "' + rest + '"');
      if (step.state === 'IDLE' && /divisor is 0/.test(rest) !== (step.regs.E === 1)) e.push('IDLE says "' + rest + '" with E = ' + step.regs.E);
      return e;
    });
    checkPredicts(ctx, model, (s) => (s.state === 'TEST' ? ((s.before.A >> 4) & 1 ? 'Restore: A went negative' : 'Keep: quotient bit 1') : undefined));
    const want = inp.v === 0 ? 'Division by zero: E = 1, and the chart is back in IDLE.' : 'Done: quotient Q = ' + Math.floor(inp.d / inp.v) + ', remainder A = ' + (inp.d % inp.v) + '. Check: ' + inp.d + ' = ' + inp.v + ' × ' + Math.floor(inp.d / inp.v) + ' + ' + (inp.d % inp.v) + '.';
    if (lastSay(ctx.r) !== want) fail('the end says "' + lastSay(ctx.r) + '", want "' + want + '"');
  },
  'asm-gcd': (ctx) => {
    const { input: inp, fail } = ctx;
    const model = runModel('gcd', (k) => ({ START: k === 1 ? 1 : 0, XIN: inp.x, YIN: inp.y }), 120);
    checkCycles(ctx, model, (step, rest) => {
      if (step.state !== 'CMP') return [];
      const w = step.before.X === step.before.Y ? 'X = Y: finished.' : step.before.X < step.before.Y ? 'X < Y, so Y ← Y − X.' : 'X > Y, so X ← X − Y.';
      return rest === w ? [] : ['CMP says "' + rest + '", want "' + w + '"'];
    });
    checkPredicts(ctx, model, (s) => (s.state === 'CMP' ? (s.before.X === s.before.Y ? 'Stop: X = Y' : s.before.X < s.before.Y ? 'Y ← Y − X' : 'X ← X − Y') : undefined));
    const g = gcd(inp.x, inp.y);
    if (!lastSay(ctx.r).startsWith('X = Y = ' + g + ': the GCD of ' + inp.x + ' and ' + inp.y + ' is ' + g + '.')) fail('the end says "' + lastSay(ctx.r) + '"');
  },
  'asm-traffic': (ctx) => {
    const { input: inp, fail } = ctx;
    const bits = (t) => String(t).replace(/\s+/g, '').split('').map(Number);
    const sc = bits(inp.sc), pb = bits(inp.pb);
    const model = runModel('traffic', (k) => ({ SC: sc[k] || 0, PB: pb[k] || 0 }), inp.n);
    checkCycles(ctx, model, (step, rest) => {
      const w = step.next !== step.state ? 'The lights change: ' + step.state + ' → ' + step.next + '.' : '';
      return rest === w ? [] : ['says "' + rest + '", want "' + w + '"'];
    });
    checkPredicts(ctx, model, (s) => (s.state === 'MG' && s.before.T === 5 ? (s.next === 'MY' ? 'Yes: change to yellow' : 'No: stay green') : undefined));
    const end = model[model.length - 1];
    if (!lastSay(ctx.r).startsWith('After ' + inp.n + ' clocks the controller is in ' + end.next + '.')) fail('the end says "' + lastSay(ctx.r) + '", the model ends in ' + end.next);
    // the closing claim: green leaves the main road only when asked, and only after six clocks of green
    let run = 0;
    for (const s of model) {
      run = s.state === 'MG' ? run + 1 : 0;
      if (s.state === 'MG' && s.next === 'MY' && (run < 6 || !(s.x.SC || s.x.PB))) fail('cycle ' + (s.cycle + 1) + ': the main road changed after ' + run + ' clocks of green, SC = ' + s.x.SC + ', PB = ' + s.x.PB);
    }
  },
  'asm-vending': (ctx) => {
    const { input: inp, fail } = ctx;
    const q = String(inp.coins).trim().split(/[\s,]+/).filter(Boolean).map(Number);
    let i = 0;
    const model = runModel('vending', (k, regs, st) => { if (st !== 'WAIT' || i >= q.length) return {}; const c = q[i++]; return { C5: c === 5 ? 1 : 0, C10: c === 10 ? 1 : 0 }; }, 60);
    checkCycles(ctx, model, (step, rest) => {
      const w = step.state === 'CHECK' ? (step.before.SUM >= 20 ? 'SUM ≥ 20: vend.' : 'Not enough yet: wait for another coin.') : step.state === 'CHANGE' && step.outputs.includes('CHG') ? 'CHG: 5 paid back.' : '';
      return rest === w ? [] : ['says "' + rest + '", want "' + w + '"'];
    });
    checkPredicts(ctx, model, (s) => (s.state === 'CHECK' ? (s.before.SUM >= 20 ? 'Vend' : 'Wait for more') : undefined));
    // the money: what went in is what was vended (20 each) plus the change paid (5 each) plus what is left
    const cycles = ctx.r.frames.filter((f) => /^Cycle \d+ in/.test(f.say)).length;
    const used = model.slice(0, cycles), left = used.length ? used[used.length - 1].regs.SUM : 0;
    const vends = used.filter((s) => s.outputs.includes('VEND')).length, chg = used.filter((s) => s.outputs.includes('CHG')).length;
    if (q.reduce((a, b) => a + b, 0) !== vends * 20 + chg * 5 + left) fail('the money does not balance');
    if (!lastSay(ctx.r).startsWith('All coins used; SUM = ' + left + '.')) fail('the end says "' + lastSay(ctx.r) + '", SUM is ' + left);
  },
};

function rtlTransfers(ctx) {
  const { input: inp, r, fail } = ctx;
  const st = String(inp.prog).split(/[;\n]+/).map((x) => x.trim().replace(/<-/g, '←').replace(/\s+/g, ' ')).filter(Boolean);
  const R = { R0: 0, R1: 0, R2: 0, R3: 0, A: 0 };
  const OP = { '+': (a, b) => (a + b) & 255, '-': (a, b) => (a - b + 256) & 255, '&': (a, b) => a & b, '|': (a, b) => a | b, '^': (a, b) => a ^ b };
  const VERB = { '+': 'adds it to A', '-': 'subtracts it from A', '&': 'ANDs it with A', '|': 'ORs it with A', '^': 'XORs it with A' };
  let fi = 1;
  st.forEach((s, k) => {
    const m = /^(R[0-3]|A) ?← ?(?:A ?([-+&|^]) ?)?(R[0-3]|A|\d+)$/.exec(s);
    const dst = m[1], src = m[3], op = m[2] || null;
    const bus = /^\d/.test(src) ? +src : R[src];
    const res = op ? OP[op](R.A, bus) : bus;
    const pre = r.frames[fi], post = r.frames[fi + 1];
    const drive = /^\d/.test(src) ? 'The DATA switches drive ' + bus + ' onto the bus' : src + ' drives the bus (' + bus + ')';
    const alu = dst === 'A' ? '; the ALU ' + (op ? VERB[op] + ': ' + R.A + ' ' + op + ' ' + bus + ' = ' + res : 'passes it through') : '';
    const want = 'Clock ' + (k + 1) + ': ' + s + '. ' + drive + alu + '; ' + dst + '\'s load is enabled.';
    if (!pre || !pre.say.startsWith(want)) fail('frame ' + fi + ' says "' + (pre && pre.say) + '", want it to begin "' + want + '"');
    if (pre && pre.predict && String(pre.predict.answer) !== String(res)) fail('frame ' + fi + ': the prediction answers ' + pre.predict.answer + ', want ' + res);
    const want2 = 'The clock edge: ' + dst + ' takes ' + res + ' (it held ' + R[dst] + ').';
    if (!post || !post.say.startsWith(want2)) fail('frame ' + (fi + 1) + ' says "' + (post && post.say) + '", want "' + want2 + '"');
    R[dst] = res;
    fi += 2;
    ctx.pass();
  });
  const want = 'After ' + st.length + ' clocks: ' + ['R0', 'R1', 'R2', 'R3', 'A'].map((x) => x + ' = ' + R[x]).join(', ') + '.';
  if (!lastSay(r).startsWith(want)) fail('the end says "' + lastSay(r) + '", want "' + want + '"');
}

function asmTiming(ctx) {
  const { input: inp, r, fail } = ctx;
  const T = {
    multiplier: ['multiplier', (k) => ({ START: k === 1 ? 1 : 0, MIN: 6, QIN: 5 }), 2],
    gcd: ['gcd', (k) => ({ START: k === 1 ? 1 : 0, XIN: 12, YIN: 18 }), 1],
    divider: ['divider', (k) => ({ START: k === 1 ? 1 : 0, DIN: 11, VIN: 3 }), 2],
  }[inp.c];
  const model = runModel(T[0], T[1], 20);
  const k0 = T[2], k1 = k0 + inp.n - 1;
  if (r.frames[0].say !== 'Rising edges at the boundaries on the waveform; between two edges the chart is in one block. We look at clocks ' + (k0 + 1) + ' to ' + (k1 + 1) + '.') fail('the intro says "' + r.frames[0].say + '"');
  const inputs = ['START'];
  for (let k = k0; k <= k1; k++) {
    const s = model[k], pre = r.frames[1 + 2 * (k - k0)], post = r.frames[2 + 2 * (k - k0)];
    const reads = s.tests.map(([a, b]) => a + ' = ' + b).join(', ');
    const regs = Object.keys(s.before).map((n) => n + ' = ' + s.before[n]).join(', ');
    const w = 'Clock ' + (k + 1) + ', in ' + s.state + ', before the edge. ' + (reads ? 'The decisions read ' + reads + (s.tests.some(([a]) => inputs.includes(a)) ? ', from the inputs and the registers' : ' from the registers') + ' as they are now. ' : '');
    if (!pre || !pre.say.startsWith(w) || !pre.say.endsWith('are worked out from the present values: ' + regs + '.')) fail('frame ' + (1 + 2 * (k - k0)) + ' says "' + (pre && pre.say) + '"; want "' + w + '…' + regs + '."');
    const ch = changesOf(s.before, s.regs);
    const w2 = 'The edge: ' + (ch.length ? ch.join(', ') + ', all at the same instant' : 'no register changes') + ', and the state becomes ' + s.next + '.';
    if (!post || !post.say.startsWith(w2)) fail('frame ' + (2 + 2 * (k - k0)) + ' says "' + (post && post.say) + '", want "' + w2 + '"');
    if (pre && pre.predict) { const m = /What will (\w+) be/.exec(pre.predict.ask); if (m && String(pre.predict.answer) !== String(s.regs[m[1]])) fail('the prediction for ' + m[1] + ' answers ' + pre.predict.answer + ', want ' + s.regs[m[1]]); }
    ctx.pass();
  }
}

function asmElements(ctx) {
  const { S, input: inp, r, fail } = ctx;
  const ch = inp.c === 'broken' ? null : S.P9.chart(inp.c);
  const chart = ch || (() => { // the broken chart is the topic's own; rebuild it the same way
    return S.Asm.chart({ name: 'gcd-broken', inputs: ['START'], dataInputs: { XIN: 8, YIN: 8 }, registers: { X: 8, Y: 8 }, outputs: ['READY'], status: { EQ: 'X == Y', LT: 'X < Y' },
      states: { IDLE: { actions: ['READY'], next: { if: 'START', then: { do: ['X ← XIN', 'X ← YIN'], then: 'CMP' }, else: 'IDLE' } }, CMP: { actions: ['Y ← 0'], next: { if: 'EQ', then: 'IDLE', else: { if: 'LT', then: { do: ['Y ← Y - X'], then: 'CMP' }, else: { do: ['X ← X - Y'], then: 'CMP' } } } } } });
  })();
  const states = statesOf(chart);
  if (!r.frames[0].say.includes(': ' + states.length + ' states.')) fail('the intro says "' + r.frames[0].say + '", the chart has ' + states.length + ' states');
  const dsts = (a) => { const m = /^\{?([^←]*?)\}? ?←/.exec(a); return m ? m[1].split(',').map((x) => x.trim().replace(/\[.*$/, '')) : []; };
  let clash = 0;
  for (const s of states) {
    const ps = walk(chart, s);
    const f = r.frames.find((x) => x.say.startsWith('The ASM block of ' + s + ':'));
    if (!f) { fail('no frame for the block of ' + s); continue; }
    const m = /one clock\. (\d+) paths?: /.exec(f.say);
    if (!m || +m[1] !== ps.length) fail('the block of ' + s + ' says ' + (m && m[1]) + ' paths, the chart has ' + ps.length);
    for (const p of ps) {
      const txt = (p.conds.length ? p.conds.map(([c, v]) => c + ' = ' + v).join(', ') : 'always') + ' → ' + (p.actions.length ? p.actions.join(', ') : 'nothing') + ' → ' + p.target;
      if (!f.say.includes(txt)) fail('the block of ' + s + ' does not list the path "' + txt + '"');
      const all = p.actions.flatMap(dsts);
      if (new Set(all).size !== all.length) clash++;
    }
    if (f.predict === undefined) { /* predictions sit on the frame before */ }
    ctx.pass();
  }
  r.frames.forEach((f, i) => { if (f.predict && /How many different paths/.test(f.predict.ask)) { const m = /The ASM block of (\w+):/.exec(f.say); if (m && String(f.predict.answer) !== String(walk(chart, m[1]).length)) fail('frame ' + i + ': the prediction answers ' + f.predict.answer); } });
  const last = lastSay(r);
  if (clash ? !last.startsWith('This chart breaks the rules') : !last.startsWith('The chart keeps the rules')) fail('the verdict "' + last.slice(0, 60) + '" but ' + clash + ' paths write a register twice');
}

function datapathController(ctx) {
  const { S, input: inp, r, fail } = ctx;
  const ch = S.P9.chart(inp.c), states = statesOf(ch), sigs = signalsOf(ch);
  const env0 = (s, sig) => Object.assign(Object.fromEntries(states.map((x) => ['T_' + x, x === s ? 1 : 0])), sig);
  let nctl = 0;
  const transfers = new Set();
  for (const s of states) for (const p of walk(ch, s)) for (const a of p.actions) if (/←/.test(a)) transfers.add(a);
  r.frames.forEach((f, i) => {
    const m = /^(?:Control signal (\w+) \((.*)\)|The output (\w+)) is 1 (.*): (\w+) = (.*)\.$/.exec(f.say);
    if (!m) return;
    const name = m[1] || m[3], act = m[2] || m[3], eq = m[6];
    if (m[1]) nctl++;
    for (const s of states) for (const sig of combos(sigs)) {
      const p = pathFor(ch, s, sig), on = p.actions.includes(act) ? 1 : 0;
      if (sop(eq, env0(s, sig)) !== on) { fail('frame ' + i + ': ' + name + ' = ' + eq + ' is ' + (1 - on) + ' in ' + s + ' with ' + JSON.stringify(sig) + ', but that path ' + (on ? 'does' : 'does not do') + ' ' + act); return; }
    }
    // the words say the same as the equation
    const words = m[4].split(', or ').map((t) => { const w = /^in (\w+)(?: when (.*))?$/.exec(t); return 'T_' + w[1] + (w[2] ? w[2].split(' and ').map((c) => { const [a, b] = c.split(' = '); return '·' + a + (b === '0' ? '′' : ''); }).join('') : ''); }).join(' + ');
    if (words !== eq) fail('frame ' + i + ': the words give ' + words + ', the equation is ' + eq);
    ctx.pass();
  });
  if (nctl !== transfers.size) fail(nctl + ' control signals narrated, the chart has ' + transfers.size + ' distinct transfers');
  const nstat = sigs.filter((s) => ch.status[s]).length;
  if (!lastSay(r).startsWith('The whole design: ' + transfers.size + ' control signals go right, into the registers\' load and select inputs; ' + nstat + ' status signals come back;')) fail('the end says "' + lastSay(r) + '"');
}

function controlThreeWays(ctx) {
  const { S, input: inp, r, fail } = ctx;
  const ch = S.P9.chart(inp.c), states = statesOf(ch), sigs = signalsOf(ch), n = states.length;
  const ffs = { decoder: Math.ceil(Math.log2(n)) || 1, onehot: n, counter: Math.ceil(Math.log2(n)) || 1 };
  const f1 = r.frames[1].say;
  const eqText = f1.slice(f1.indexOf(': ') + 2, f1.indexOf('. The control signals'));
  const eqs = Object.fromEntries(eqText.split('; ').map((e) => { const [a, b] = e.split(' = '); return [a, b]; }));
  // the state's code under each method (the frame narrating the plan gives the decoder's codes)
  const codes = {};
  const plan = r.frames[0].say;
  if (inp.m === 'decoder') for (const m of plan.matchAll(/(\w+) = ([01]+)/g)) codes[m[1]] = m[2];
  if (inp.m === 'counter') for (const m of plan.matchAll(/(\w+) = (\d+)/g)) codes[m[1]] = +m[2];
  if (r.frames[0].predict && String(r.frames[0].predict.answer) !== String(ffs[inp.m])) fail('the flip-flop prediction answers ' + r.frames[0].predict.answer + ', want ' + ffs[inp.m]);
  for (const s of states) for (const sig of combos(sigs)) {
    const want = pathFor(ch, s, sig).target;
    let got;
    if (inp.m === 'onehot') {
      const env = Object.assign(Object.fromEntries(states.map((x) => ['Y_' + x, x === s ? 1 : 0])), sig);
      const on = states.filter((x) => sop(eqs['D_' + x], env));
      got = on.length === 1 ? on[0] : '{' + on.join(',') + '}';
    } else {
      const env = Object.assign(Object.fromEntries(states.map((x) => ['T_' + x, x === s ? 1 : 0])), sig);
      if (inp.m === 'decoder') {
        const w = codes[s].length;
        const code = Array.from({ length: w }, (_, b) => sop(eqs['D' + (w - 1 - b)], env)).join('');
        got = Object.keys(codes).find((x) => codes[x] === code) || code;
      } else {
        const w = Math.ceil(Math.log2(n)) || 1;
        const L = parseInt(Array.from({ length: w }, (_, b) => sop(eqs['L' + (w - 1 - b)] || '0', env)).join(''), 2);
        const nx = sop(eqs.CLR, env) ? 0 : sop(eqs.LD, env) ? L : sop(eqs.INC, env) ? codes[s] + 1 : codes[s];
        got = Object.keys(codes).find((x) => codes[x] === nx);
      }
    }
    if (got !== want) { fail(inp.m + ': from ' + s + ' with ' + JSON.stringify(sig) + ' the equations go to ' + got + ', the chart to ' + want); return; }
  }
  // the comparison: flip-flops and literals of each method, from its own equations
  const cmp = lastSay(r);
  for (const m of ['decoder', 'onehot', 'counter']) {
    const k = S.Asm.controller(ch, m);
    const lits = k.equations.reduce((a, e) => a + literals(e.text.split(' = ')[1]), 0);
    const label = { decoder: 'state register and decoder', onehot: 'one flip-flop per state', counter: 'sequence counter' }[m];
    const w = label + ', ' + ffs[m] + ' flip-flop' + (ffs[m] === 1 ? '' : 's') + ', ' + lits + ' literal' + (lits === 1 ? '' : 's');
    if (!cmp.includes(w)) fail('the comparison does not say "' + w + '": ' + cmp);
  }
  ctx.pass();
}

function asmVerilog(ctx) {
  const { S, input: inp, r, fail } = ctx;
  const ch = S.P9.chart(inp.c);
  for (const s of statesOf(ch)) {
    const f = r.frames.find((x) => x.say.startsWith('The block of ' + s + ' is the case arm S_' + s + ':'));
    if (!f) { fail('no frame for the arm of ' + s); continue; }
    const tg = [...new Set(walk(ch, s).map((p) => p.target))];
    if (!f.say.endsWith('(' + tg.join(', ') + ').')) fail('the arm of ' + s + ' says "' + f.say + '", the targets are ' + tg.join(', '));
    ctx.pass();
  }
  // "a simulation of this module runs exactly like the chart, clock for clock": run the module under a testbench
  // with the inputs the hand model takes, and compare every register after every clock
  const DATA = { multiplier: { MIN: 13, QIN: 11 }, divider: { DIN: 13, VIN: 3 }, gcd: { XIN: 42, YIN: 30 } };
  const N = 24;
  let model;
  if (inp.c === 'traffic') model = runModel('traffic', (k) => ({ SC: k >= 8 && k < 13 ? 1 : 0, PB: 0 }), N);
  else if (inp.c === 'vending') { const q = [10, 5, 10]; let i = 0; model = runModel('vending', (k, regs, st) => { if (st !== 'WAIT' || i >= q.length) return {}; const c = q[i++]; return { C5: c === 5 ? 1 : 0, C10: c === 10 ? 1 : 0 }; }, N); }
  else model = runModel(inp.c, (k) => Object.assign({ START: k === 1 ? 1 : 0 }, DATA[inp.c]), N);
  const regs = Object.keys(ch.registers), ins = ch.inputs.concat(Object.keys(ch.dataInputs || {}));
  const w = (n) => (ch.dataInputs || {})[n] || 1;
  let tb = S.Asm.verilog(ch) + '\nmodule tb;\n  reg clk, reset;\n' + ins.map((n) => '  reg [' + (w(n) - 1) + ':0] ' + n + ';').join('\n') + '\n' + regs.map((n) => '  wire [' + (ch.registers[n] - 1) + ':0] ' + n + ';').join('\n') + '\n  wire ' + ch.outputs.join(', ') + ';\n';
  tb += '  ' + ch.name + ' dut(.clk(clk), .reset(reset), ' + ins.concat(regs, ch.outputs).map((n) => '.' + n + '(' + n + ')').join(', ') + ');\n  initial begin\n    clk = 0; reset = 1;\n';
  model.forEach((m, k) => { tb += '    ' + ins.map((n) => n + ' = ' + (m.x[n] || 0) + ';').join(' ') + (k === 0 ? ' #2 reset = 0; #3' : ' #5') + ' clk = 1; #3 $display("' + regs.map((n) => '%0d').join(' ') + '", ' + regs.join(', ') + '); #2 clk = 0;\n'; });
  tb += '    $finish;\n  end\nendmodule\n';
  const v = S.Verilog.run(tb, { top: 'tb' });
  if (v.errors.length) { fail('the module does not compile: ' + v.errors[0].msg); return; }
  model.forEach((m, k) => {
    const got = String(v.output[k] || '').split(' ');
    regs.forEach((n, j) => { if (got[j] !== 'x' && got[j] !== String(m.regs[n])) fail('clock ' + (k + 1) + ': the Verilog has ' + n + ' = ' + got[j] + ', the chart ' + m.regs[n]); });
  });
  ctx.pass();
}

const rnd8 = (rnd, n) => Math.floor(rnd() * n);
export default {
  family: /^p9-/,
  extra: {
    'asm-multiplier': [[0, 0], [15, 1], [1, 15], [8, 8], [7, 9], [12, 10]].map(([m, q]) => ({ m, q })),
    'asm-divider': [[0, 5], [15, 1], [15, 15], [1, 2], [9, 2], [14, 3], [10, 0]].map(([d, v]) => ({ d, v })),
    'asm-gcd': [[1, 1], [99, 1], [64, 48], [81, 27], [97, 89]].map(([x, y]) => ({ x, y })),
    'asm-traffic': [{ sc: '1', pb: '0', n: 30 }, { sc: '0', pb: '000001', n: 30 }, { sc: '111111111111111111111111111111', pb: '0', n: 30 }],
    'asm-vending': ['5', '10 10 10', '10 10 5 10 5', '5 5 10 10 10', '10 5 5 10 10 10 5 5'].map((coins) => ({ coins })),
    'asm-timing': ['multiplier', 'gcd', 'divider'].flatMap((c) => [2, 3, 4, 5].map((n) => ({ c, n }))),
    'control-three-ways': ['multiplier', 'gcd', 'vending'].flatMap((c) => ['decoder', 'onehot', 'counter'].map((m) => ({ c, m }))),
  },
  random: {
    'asm-multiplier': (rnd) => ({ m: rnd8(rnd, 16), q: rnd8(rnd, 16) }),
    'asm-divider': (rnd) => ({ d: rnd8(rnd, 16), v: rnd8(rnd, 16) }),
    'asm-gcd': (rnd) => ({ x: 1 + rnd8(rnd, 99), y: 1 + rnd8(rnd, 99) }),
    'asm-traffic': (rnd) => ({ sc: Array.from({ length: 24 }, () => (rnd() < 0.25 ? 1 : 0)).join(''), pb: Array.from({ length: 24 }, () => (rnd() < 0.1 ? 1 : 0)).join(''), n: 8 + rnd8(rnd, 23) }),
    'asm-vending': (rnd) => ({ coins: Array.from({ length: 1 + rnd8(rnd, 8) }, () => (rnd() < 0.5 ? 5 : 10)).join(' ') }),
    'rtl-transfers': (rnd) => {
      const R = ['R0', 'R1', 'R2', 'R3', 'A'], ops = ['+', '-', '&', '|', '^'];
      return { prog: Array.from({ length: 1 + rnd8(rnd, 10) }, () => { const t = rnd(); const d = R[rnd8(rnd, 5)]; return t < 0.35 ? d + ' ← ' + rnd8(rnd, 256) : t < 0.65 ? d + ' ← ' + R[rnd8(rnd, 5)] : 'A ← A ' + ops[rnd8(rnd, 5)] + ' R' + rnd8(rnd, 4); }).join('; ') };
    },
  },
  check(ctx) {
    const id = ctx.tp.id;
    if (DESIGN[id]) return DESIGN[id](ctx);
    if (id === 'rtl-transfers') return rtlTransfers(ctx);
    if (id === 'asm-timing') return asmTiming(ctx);
    if (id === 'asm-elements') return asmElements(ctx);
    if (id === 'datapath-controller') return datapathController(ctx);
    if (id === 'control-three-ways') return controlThreeWays(ctx);
    if (id === 'asm-verilog') return asmVerilog(ctx);
    ctx.fail('no claim check for this topic');
  },
};
