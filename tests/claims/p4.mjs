// Part 4: combinational logic. Every frame drawn over a live circuit has its quoted wire values checked against
// the schematic's values at that frame (the simulation), and each topic's quoted results (sums, codes, addresses,
// counts) against arithmetic worked out here, apart from the topic.
const bits = (v, n) => (v >>> 0).toString(2).padStart(n, '0').slice(-n);

// ---- reading a schematic item ----
/** name -> net id for a laid-out schematic: named nets, ports (A, S), gate outputs (and2) and gate pins (and2.i0) */
function netIndex(res) {
  const m = new Map();
  for (const n of res.nets) if (n.name) m.set(n.name, n.id);
  for (const p of res.parts) {
    for (const pin of p.pins || []) if (pin.net) m.set(p.id + '.' + pin.name, pin.net);
    const y = (p.pins || []).find((x) => x.name === 'y');
    if (y && y.net) m.set(p.id, y.net);
    const port = /^(in|out)_(.+)$/.exec(p.id);
    if (port && p.pins && p.pins[0] && p.pins[0].net && !m.has(port[2])) m.set(port[2], p.pins[0].net);
  }
  return m;
}
const schemOf = (f, key) => f.items.find((x) => x.kind === 'schem' && x.values && (!key || x.key === key));
/** the value a frame's schematic shows on a named net: '0' | '1' | 'x' | 'z' | 'bus' | undefined (not on it) */
function shown(f, name, key) {
  const it = schemOf(f, key);
  if (!it) return undefined;
  if (!it._idx) Object.defineProperty(it, '_idx', { value: netIndex(it.res) });
  const id = it._idx.get(name);
  return id === undefined ? undefined : it.values[id];
}
// "inverter not1", "AND gate and5", "XOR gate xor2 (i0)" -> the name netIndex knows
const GATE = /^(?:inverter|buffer|tristate buffer|multiplexer|decoder|[A-Z]+ gate) (\w+)(?: \((\w+)\))?$/;
const netKey = (txt) => { const g = GATE.exec(txt); return g ? g[1] + (g[2] ? '.' + g[2] : '') : txt; };

/** event clauses "<net> rises to 1 at T ns (d ns after <net> changed)" */
const EVENT = /(?:^|[:;] (?:and )?)([^:;]+?) (rises to 1|falls to 0|becomes (\S+)) at ([\d.]+) ns(?: \(([\d.]+) ns after ([^)]+?) changed\))?(?=[;.]|$)/g;

/**
 * The generic check of a live-circuit frame: each event the text reports is on the schematic at that frame, with
 * the value it names, and was caused d ns after a change of the net it names (seen between earlier frames); each
 * "NAME = 0/1" it states about a net drawn on the schematic is what the wire shows.
 */
function liveFrames(ctx, frames, o) {
  o = o || {};
  const byT = [];
  frames.forEach((f, i) => {
    const say = f.say || '';
    const it = schemOf(f, o.key);
    if (!it) return;
    const m = /^At ([\d.]+) ns/.exec(say);
    if (m) byT.push({ t: +m[1], f, i });
    if (o.skipNames && o.skipNames(f, i)) return;
    // events
    for (const e of say.matchAll(EVENT)) {
      const who = e[1].replace(/^At [\d.]+ ns the inputs change to .*?\. /, '').trim();
      if (/ in /.test(who)) continue; // a net inside a block is not on the top-level drawing
      const want = e[2] === 'rises to 1' ? '1' : e[2] === 'falls to 0' ? '0' : e[3].toLowerCase();
      const got = shown(f, netKey(who), o.key);
      if (got === undefined) { ctx.fail('frame ' + i + ': "' + who + '" is not on the drawing'); continue; }
      if (got !== want && !(want.length > 1 && got === 'bus')) ctx.fail('frame ' + i + ': the text says ' + who + ' ' + e[2] + ', the drawing has ' + got + ': ' + say);
      else ctx.pass();
      if (m && +e[4] !== +m[1]) ctx.fail('frame ' + i + ': an event at ' + e[4] + ' ns told in the frame for ' + m[1] + ' ns');
      if (e[5] !== undefined) {
        // the cause changed at t - d: its value then differs from the frame before that time
        const tc = Math.round((+e[4] - +e[5]) * 1000) / 1000, cause = netKey(e[6]);
        if (/ in /.test(e[6])) continue;
        const at = byT.filter((x) => Math.abs(x.t - tc) < 1e-6 && x.f.meta && x.f.meta.t !== undefined || Math.abs(x.t - tc) < 1e-6);
        const atF = at.length ? at[at.length - 1] : null;
        if (!atF) { ctx.fail('frame ' + i + ': no frame shows ' + e[6] + ' changing at ' + tc + ' ns: ' + say); continue; }
        const prev = frames.slice(0, atF.i).reverse().find((x) => schemOf(x, o.key));
        if (/the inputs (and M )?change/.test(atF.f.say)) { ctx.pass(); continue; } // the inputs' own change is told as such
        const v1 = shown(atF.f, cause, o.key), v0 = prev ? shown(prev, cause, o.key) : undefined;
        if (v1 === undefined) ctx.fail('frame ' + i + ': the cause "' + e[6] + '" is not on the drawing');
        else if (v0 !== undefined && v0 === v1) ctx.fail('frame ' + i + ': ' + e[6] + ' did not change at ' + tc + ' ns (' + v0 + ' before and after): ' + say);
        else ctx.pass();
      }
    }
    // NAME = v claims about drawn nets
    if (o.names === false) return;
    const txt = say.replace(EVENT, ' ');
    for (const c of txt.matchAll(/(?<!\.\.)(?<![\w'′=≠.] ?)(?<![=≠] )\b([A-Z][A-Za-z]?\d*|[A-Z]\d+|Cin|Cout|C\d+)\b = ([01])\b(?! ?[+−-]|\d| ?[×⊕·]| ns)/g)) {
      const name = c[1], got = shown(f, name, o.key);
      if (got === undefined || got === 'bus') continue;
      if (got !== c[2]) ctx.fail('frame ' + i + ': the text says ' + name + ' = ' + c[2] + ', the drawing has ' + got + ': ' + say);
      else ctx.pass();
    }
  });
}

/** "The last change came D ns after the inputs changed" must match the frame's own settled delay */
function delays(ctx, frames) {
  frames.forEach((f, i) => {
    const m = /The last change came ([\d.]+) ns after the inputs changed/.exec(f.say || '');
    if (!m) return;
    if (!f.meta || f.meta.delay === undefined) return;
    if (Math.abs(+m[1] - f.meta.delay) > 1e-6) ctx.fail('frame ' + i + ': says the last change came ' + m[1] + ' ns after, the run has ' + f.meta.delay);
    else ctx.pass();
  });
}

// ---- independent working-out ----
const B = (S) => S.Bool;
/** evaluate an expression text (single-letter variables, ′ or ', ⊕, ·) with env; null if it does not parse */
function evalExpr(S, text, env) {
  try { return B(S).evaluate(B(S).parse(String(text).replace(/·/g, '')), env) ? 1 : 0; } catch (e) { return null; }
}
const envOf = (names, m) => Object.fromEntries(names.map((nm, i) => [nm, (m >> (names.length - 1 - i)) & 1]));
const popcount = (v) => { let k = 0; while (v) { k += v & 1; v >>>= 1; } return k; };
const DIGITS = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];
const r2 = (x) => Math.round(x * 100) / 100;
const sgn = (v, n) => (v >= 1 << (n - 1) ? v - (1 << n) : v);
const num = (s) => Number(String(s).replace('−', '-'));

/** a walk's settled frames: the inputs read off the drawing, the outputs it claims (meta.out) and the drawing's */
function settled(ctx, ins, outs, want) {
  ctx.r.frames.forEach((f, i) => {
    if (!f.meta || !f.meta.settled || !f.meta.out) return;
    // the inputs from the row the run says it is on, checked against the wires wherever an input is drawn
    const env = envOf(ins, f.meta.row);
    for (const nm of ins) { const v = shown(f, nm); if (v !== undefined && v !== String(env[nm])) { ctx.fail('frame ' + i + ': input ' + nm + ' should show ' + env[nm] + ', the drawing has ' + v); return; } }
    const exp = want(env);
    for (const o of outs) {
      const e = String(exp[o]), m = String(f.meta.out[o]), d = shown(f, o);
      if (m.toLowerCase() !== e.toLowerCase()) ctx.fail('frame ' + i + ': ' + o + ' should be ' + e + ' for ' + JSON.stringify(env) + ', the run has ' + m + ': ' + f.say);
      else if (d !== undefined && d !== 'bus' && d !== e.toLowerCase()) ctx.fail('frame ' + i + ': ' + o + ' should be ' + e + ', the drawing has ' + d);
      else ctx.pass();
    }
    if (f._env === undefined) Object.defineProperty(f, '_env', { value: env });
  });
}
const sayClaims = (ctx, f, i, re, fn) => { for (const m of (f.say || '').matchAll(re)) { const why = fn(m); if (why) ctx.fail('frame ' + i + ': ' + why + ': ' + f.say); else ctx.pass(); } };
const eq = (ctx, i, what, said, want, say) => { if (String(said) !== String(want)) ctx.fail('frame ' + i + ': ' + what + ' is said to be ' + said + ', it is ' + want + (say ? ': ' + say : '')); else ctx.pass(); };

const checks = {
  'analysis-procedure'(ctx) {
    const F = ctx.r.frames, net = {}, order = [], OPS = { AND: (x) => x.every(Boolean), OR: (x) => x.some(Boolean), XOR: (x) => x.reduce((a, b) => a ^ b, 0) };
    let ins = null;
    F.forEach((f, i) => {
      const g = /^(\w+) is (?:an? (\w+) of (.+?)|the inverse of (\w+)): /.exec(f.say || '');
      if (g) {
        const name = g[1], type = g[2] || 'NOT', args = (g[3] || g[4]).split(' and ');
        if (g[2]) eq(ctx, i, 'the article before ' + type, /^an? /.exec(f.say.slice(name.length + 4))[0].trim(), /^(AND|OR|XOR|XNOR)$/.test(type) ? 'an' : 'a');
        net[name] = { type, args }; order.push(name);
        const simple = /simplif(?:ying|ied): \w+ = (.+?)\.(?: This is an output\.)?$/.exec(f.say);
        if (simple) net[name].simple = simple[1];
        if (/Putting in what/.test(f.say)) { const inner = /Putting in what (.+?) stands? for/.exec(f.say)[1].split(' and '); eq(ctx, i, 'the gate inputs that are other gates', inner.join(','), args.filter((x) => net[x]).join(',')); }
        else eq(ctx, i, 'whether every input of ' + name + ' is a circuit input', 'yes', args.every((x) => !net[x]) ? 'yes' : 'no');
      }
      const row = /^Row (\d+): (.+?) gives (.+)\.$/.exec(f.say || '');
      if (row) {
        const env = {};
        for (const m of row[2].matchAll(/(\w+) = ([01])/g)) env[m[1]] = +m[2];
        ins = Object.keys(env);
        eq(ctx, i, 'the row number', row[1], parseInt(ins.map((k) => env[k]).join(''), 2));
        const val = {};
        for (const nm of order) { const n = net[nm], x = n.args.map((a) => (a in env ? env[a] : val[a])); let v = n.type === 'NOT' ? 1 - x[0] : OPS[n.type.replace(/^N(?=AND|OR)|^X(?=NOR)/, '').replace('XNOR', 'XOR')](x) ? 1 : 0; if (/^N|^XNOR/.test(n.type)) v = 1 - v; val[nm] = v; }
        for (const m of row[3].matchAll(/(\w+) = ([01])/g)) {
          eq(ctx, i, m[1] + ' (gate by gate)', m[2], val[m[1]], f.say);
          const sv = evalExpr(ctx.S, net[m[1]].simple, env);
          if (sv !== null) eq(ctx, i, m[1] + ' (from its simplified equation ' + net[m[1]].simple + ')', m[2], sv, f.say);
        }
        // the gates inside: their simplified equations against the gate-by-gate values
        for (const nm of order) { const sv = net[nm].simple ? evalExpr(ctx.S, net[nm].simple, env) : null; if (sv !== null) eq(ctx, i, nm + ' = ' + net[nm].simple, sv, val[nm]); }
      }
    });
    // the verdict: every "OUT = expr = expr" on the last frame holds on every row
    const last = F[F.length - 1].say;
    if (ins) for (const part of last.split(/:|, and | and /)) {
      const chain = part.split(' = ').map((x) => x.trim());
      if (chain.length < 2 || !net[chain[0]]) continue;
      for (const e of chain.slice(1)) for (let m = 0; m < 1 << ins.length; m++) {
        const env = envOf(ins, m), v = evalExpr(ctx.S, e, env);
        if (v === null) continue;
        const sv = evalExpr(ctx.S, net[chain[0]].simple, env);
        if (v !== sv) { ctx.fail('last frame: ' + chain[0] + ' = ' + e + ' fails at row ' + m + ': ' + last); break; }
      }
    }
  },
  'design-procedure'(ctx) {
    const F = ctx.r.frames, spec = ctx.input.spec;
    const n = /ABCD|AB and CD/.test(F[0].say) ? 4 : 3, vars = n === 4 ? ['A', 'B', 'C', 'D'] : ['A', 'B', 'C'];
    const truth = { prime: (m) => [2, 3, 5, 7, 11, 13].includes(m), vote: (m) => popcount(m) >= 2, greater: (m) => (m >> 2) > (m & 3), middle: (m) => m >= 2 && m <= 5, seven: (m) => m % 3 === 0 }[spec];
    if (!truth) { ctx.fail('no working-out for the specification ' + spec); return; }
    const out = /\b(\w) = 1,? when/.exec(F[0].say)[1];
    const ones = [...Array(1 << n).keys()].filter(truth);
    F.forEach((f, i) => {
      const say = f.say || '';
      if (/^Rows \d+ to \d+:/.test(say)) {
        const lo = +/^Rows (\d+)/.exec(say)[1];
        say.split(': ').slice(1).join(': ').split('; ').forEach((part, k) => { const v = /→ \w = ([01])/.exec(part); eq(ctx, i, 'row ' + (lo + k), v && v[1], truth(lo + k) ? 1 : 0, say);
          const m = /^(\d+) (is|≤|>)/.exec(part); if (m) eq(ctx, i, 'the row quoted', m[1], spec === 'greater' ? (lo + k) >> 2 : lo + k); });
      }
      const at = /its 1s are at ([\d, ]+)\./.exec(say);
      if (at) eq(ctx, i, 'the 1s', at[1], ones.join(', '));
      const so = /So \w = (.+)\.$/.exec(say) || /AND gates feeding an OR: \w = (.+?)\. (\d+) gates/.exec(say);
      if (so) {
        const expr = so[1];
        for (let m = 0; m < 1 << n; m++) if (evalExpr(ctx.S, expr, envOf(vars, m)) !== (truth(m) ? 1 : 0)) { ctx.fail('frame ' + i + ': ' + expr + ' is wrong at row ' + m); break; }
        const terms = expr.split(' + ');
        if (f.predict === undefined && F[i - 1] && F[i - 1].predict) eq(ctx, i - 1, 'the number of product terms', F[i - 1].predict.answer, terms.length);
        if (so[2]) {
          const lits = terms.map((t) => t.match(/[A-D]'?/g));
          const nots = new Set(lits.flat().filter((l) => l.endsWith("'")));
          const gates = lits.filter((l) => l.length > 1).length + (terms.length > 1 ? 1 : 0) + nots.size;
          eq(ctx, i, 'the gate count', so[2], gates, say);
          eq(ctx, i, 'whether inverters are counted', / counting the inverters/.test(say), nots.size > 0);
        }
      }
      const run = /^Step 5: run the circuit\. Row (\d+) \((.+?)\): (\w) = ([01])/.exec(say);
      if (run) { const env = {}; for (const m of run[2].matchAll(/(\w) = ([01])/g)) env[m[1]] = +m[2]; eq(ctx, i, 'the row', run[1], parseInt(vars.map((v) => env[v]).join(''), 2)); eq(ctx, i, out + ' in row ' + run[1], run[4], truth(+run[1]) ? 1 : 0); eq(ctx, i, 'the output drawn', shown(f, out), run[4]); }
      const all = /^All (\d+) rows run on the simulator: the circuit agrees with the table on (\d+) of (\d+)\./.exec(say);
      if (all) { eq(ctx, i, 'the rows', all[1], 1 << n); eq(ctx, i, 'the rows that agree', all[2], 1 << n); }
    });
  },
  'bcd-excess3'(ctx) {
    const F = ctx.r.frames, vars = ['A', 'B', 'C', 'D'];
    F.forEach((f, i) => {
      const m = /(\w) = (.+?)\.$/.exec(f.say || '');
      if (f.meta && f.meta.map !== undefined && m) { const bit = 3 - 'WXYZ'.indexOf(m[1]); for (let d = 0; d < 10; d++) if (evalExpr(ctx.S, m[2], envOf(vars, d)) !== (((d + 3) >> bit) & 1)) { ctx.fail('frame ' + i + ': ' + m[1] + ' = ' + m[2] + ' is wrong for the digit ' + d); break; } }
      sayClaims(ctx, f, i, /Digit (\d+) = ([01]{4}) in BCD becomes ([01]{4}) = (\d+) in excess-3/g, (x) => (bits(+x[1], 4) !== x[2] ? 'the BCD of ' + x[1] : bits(+x[1] + 3, 4) !== x[3] || +x[4] !== +x[1] + 3 ? 'the excess-3 of ' + x[1] : null));
    });
    settled(ctx, vars, ['W', 'X', 'Y', 'Z'], (e) => { const d = e.A * 8 + e.B * 4 + e.C * 2 + e.D; return envOf(['W', 'X', 'Y', 'Z'], d + 3); });
  },
  'bcd-seven-segment'(ctx) {
    const F = ctx.r.frames, seg = ctx.input.seg, vars = ['A', 'B', 'C', 'D'];
    let expr = null;
    F.forEach((f, i) => {
      const say = f.say || '';
      const lit = /segment (\w) is lit for the digits ([\d, ]+)\./.exec(say);
      if (lit) eq(ctx, i, 'the digits lighting ' + lit[1], lit[2], DIGITS.map((d, k) => (d.includes(lit[1]) ? k : -1)).filter((k) => k >= 0).join(', '));
      const map = /^Segment (\w) on a K-map, codes 10 to 15 as don't-cares: \w = (.+?)\. /.exec(say);
      if (map) { expr = map[2]; for (let d = 0; d < 10; d++) if (evalExpr(ctx.S, expr, envOf(vars, d)) !== (DIGITS[d].includes(seg) ? 1 : 0)) { ctx.fail('frame ' + i + ': ' + expr + ' is wrong for ' + d); break; } }
      const code = /^Code ([01]{4}) \((?:digit (\d+)|not a BCD digit)\): the decoder lights (.+?)\. Segment (\w) = ([01])/.exec(say);
      if (code) {
        const d = parseInt(code[1], 2), shownLit = code[3] === 'nothing' ? '' : code[3].split(', ').join('');
        if (code[2] !== undefined) eq(ctx, i, 'the digit', code[2], d);
        if (d < 10) eq(ctx, i, 'the segments lit for ' + d, shownLit, DIGITS[d]);
        if (expr) eq(ctx, i, 'segment ' + seg, code[5], evalExpr(ctx.S, expr, envOf(vars, d)), say);
        eq(ctx, i, 'whether ' + seg + ' is among the lit', shownLit.includes(seg) ? '1' : '0', code[5]);
        eq(ctx, i, 'segment ' + seg + ' on the drawing', shown(f, seg), code[5]);
        const disp = f.items.filter((x) => /^dd:/.test(x.key) && /(^| )on( |$)/.test(x.cls || '')).length;
        if (f.items.some((x) => /^dd:/.test(x.key))) eq(ctx, i, 'the bars lit on the display', disp, shownLit.length);
      }
    });
  },
  'gray-converter'(ctx) {
    const F = ctx.r.frames, n = +ctx.input.n, toGray = ctx.input.dir === 'b2g';
    const gray = (v) => v ^ (v >> 1);
    const codes = [];
    F.forEach((f, i) => {
      sayClaims(ctx, f, i, /Binary ([01]+) \((\d+)\) is Gray ([01]+)/g, (x) => (parseInt(x[1], 2) !== +x[2] || bits(gray(+x[2]), n) !== x[3] ? 'binary ' + x[1] + ' is Gray ' + bits(gray(+x[2]), n) : null));
      sayClaims(ctx, f, i, /Gray ([01]+) is binary ([01]+) \((\d+)\)/g, (x) => (parseInt(x[2], 2) !== +x[3] || bits(gray(+x[3]), n) !== x[1] ? 'Gray ' + x[1] + ' is binary ' + bits(+x[3], n) : null));
      if (f.meta && f.meta.settled && !f.meta.end) codes.push(f.meta.row);
    });
    const ham = (seq) => seq.slice(1).reduce((s, v, k) => s + popcount(v ^ seq[k]), 0);
    const ins = codes, other = codes.map((v) => (toGray ? gray(v) : (() => { let b = 0; for (let x = v; x; x >>= 1) b ^= x; return b; })()));
    const g = toGray ? other : ins, b = toGray ? ins : other;
    const end = /the Gray bits changed (\d+) times in all, the binary bits (\d+) times/.exec(F[F.length - 1].say);
    if (!end) ctx.fail('the last frame does not count the changes');
    else { eq(ctx, F.length - 1, 'the Gray bit changes', end[1], ham(g), F[F.length - 1].say); eq(ctx, F.length - 1, 'the binary bit changes', end[2], ham(b)); eq(ctx, F.length - 1, 'one Gray bit per step', ham(g), codes.length - 1); }
    F.forEach((f, i) => { if (f.predict && /How many output bits/.test(f.predict.ask)) { const k = F.slice(0, i + 1).filter((x) => x.meta && x.meta.settled).length; eq(ctx, i, 'the output bits that change next', f.predict.answer, popcount(other[k] ^ other[k - 1])); } });
    const ins2 = [...Array(n).keys()].reverse().map((k) => (toGray ? 'B' : 'G') + k), outs = [...Array(n).keys()].reverse().map((k) => (toGray ? 'G' : 'B') + k);
    settled(ctx, ins2, outs, (e) => { const v = parseInt(ins2.map((k) => e[k]).join(''), 2); return envOf(outs, toGray ? gray(v) : other[codes.indexOf(v)] !== undefined ? other[codes.indexOf(v)] : 0); });
  },
  'half-adder'(ctx) {
    ctx.r.frames.forEach((f, i) => sayClaims(ctx, f, i, /(\d) \+ (\d) = (\d), written as carry C = (\d) and sum S = (\d)/g, (x) => (+x[1] + +x[2] !== +x[3] || +x[4] !== (+x[3] >> 1) || +x[5] !== (+x[3] & 1) ? 'the sum is wrong' : null)));
    settled(ctx, ['A', 'B'], ['S', 'C'], (e) => ({ S: e.A ^ e.B, C: e.A & e.B }));
  },
  'full-adder'(ctx) {
    ctx.r.frames.forEach((f, i) => {
      sayClaims(ctx, f, i, /(\d) \+ (\d) \+ (\d) = (\d): Cout = (\d), S = (\d)\. (A = B = 0|A and B differ|A = B = 1)/g, (x) => {
        const a = +x[1], b = +x[2], c = +x[3], t = a + b + c;
        if (t !== +x[4] || +x[5] !== t >> 1 || +x[6] !== (t & 1)) return 'the sum is wrong';
        const kind = a === b ? (a ? 'A = B = 1' : 'A = B = 0') : 'A and B differ';
        return kind !== x[7] ? 'the case is ' + kind : null;
      });
    });
    settled(ctx, ['A', 'B', 'Cin'], ['S', 'Cout'], (e) => ({ S: e.A ^ e.B ^ e.Cin, Cout: (e.A + e.B + e.Cin) >> 1 }));
  },
  'ripple-carry'(ctx) {
    const F = ctx.r.frames, n = +ctx.input.n, a = ctx.input.a, b = ctx.input.b, cin = ctx.input.start === 'cin' ? 1 : 0;
    const s0 = /S = ([01]+)\. Now the carry/.exec(F[0].say);
    if (s0) eq(ctx, 0, 'S before the carry in', s0[1], bits(a + b, n));
    const end = /^Settled: (\d+) \+ (\d+)( \+ 1)? = (\d+) = (1 )?([01]+)(?: \(the carry out C(\d+) is the extra bit\))?\. The last change came ([\d.]+) ns after the input changed\. The worst case for this adder, over every input change, is ([\d.]+) ns: a carry rippling through all (\d+) bits\./.exec(F[F.length - 1].say);
    if (!end) { ctx.fail('the last frame is not read: ' + F[F.length - 1].say); return; }
    const t = a + b + cin;
    eq(ctx, F.length - 1, 'the total', end[4], t); eq(ctx, F.length - 1, 'the sum bits', end[6], bits(t, n)); eq(ctx, F.length - 1, 'the carry out', end[5] ? 1 : 0, t >> n);
    if (end[7]) eq(ctx, F.length - 1, 'the carry out name', end[7], n);
    const lastAt = F.slice(0, -1).reverse().map((f) => /^At ([\d.]+) ns/.exec(f.say)).find(Boolean);
    eq(ctx, F.length - 1, 'the last change', end[8], lastAt ? lastAt[1] : 0);
    if (+end[9] < +end[8]) ctx.fail('the worst case ' + end[9] + ' is shorter than this run, ' + end[8]);
    eq(ctx, F.length - 1, 'the bits', end[10], n);
    // the carry the prediction names as the last to change is the last carry the frames report
    F.forEach((f, i) => { if (f.predict && /Which carry/.test(f.predict.ask)) { const told = F.slice(i + 1).flatMap((g) => [...(g.say || '').matchAll(/\b(C\d+) (?:rises|falls)/g)].map((m) => m[1])); eq(ctx, i, 'the last carry to change', f.predict.answer, told[told.length - 1] || 'none of them'); } });
    // the sum bits drawn at the end
    for (let k = 0; k < n; k++) eq(ctx, F.length - 1, 'S' + k + ' drawn', shown(F[F.length - 1], 'S' + k), (t >> k) & 1);
  },
  'carry-lookahead'(ctx) {
    const F = ctx.r.frames, n = +ctx.input.n, a = parseInt(ctx.input.a, 2), b = parseInt(ctx.input.b, 2);
    const G = popcount(a & b), P = popcount((a ^ b) & ((1 << n) - 1));
    const C = [0]; for (let i = 0; i < n; i++) C.push(((a >> i) & (b >> i) & 1) | (((a ^ b) >> i) & 1 & C[i]));
    const s0 = /\((\d+) of them here\); P = A ⊕ B says "this bit passes a carry on" \((\d+) here\)/.exec(F[0].say);
    eq(ctx, 0, 'the generating bits', s0 && s0[1], G); eq(ctx, 0, 'the propagating bits', s0 && s0[2], P);
    const cs = /Here C1\.\.C\d = ([\d, ]+)\./.exec(F[1].say);
    eq(ctx, 1, 'C1..C4', cs && cs[1], C.slice(1, Math.min(n, 4) + 1).join(', '));
    const ans = /The answer: ([01]+) \+ ([01]+) = (1 )?([01]+)\./.exec(F[2].say);
    const sum = a + b;
    eq(ctx, 2, 'the answer', ans && (ans[3] ? '1' : '') + ans[4], (sum >> n ? '1' : '') + bits(sum, n));
    const groups = /so (\d+) lookahead groups of 4 bits/.exec(F[2].say);
    if (n > 4) eq(ctx, 2, 'the groups', groups && groups[1], n / 4);
    let lDone = null, rDone = null;
    F.forEach((f, i) => {
      const m = /^At ([\d.]+) ns: (\d+) of (\d+) ripple sum bits and (\d+) of (\d+) lookahead sum bits are final\./.exec(f.say || '');
      if (!m) return;
      const good = (p) => f.items.filter((x) => new RegExp('^' + p + ':\\d+$').test(x.key) && /(^| )good( |$)/.test(x.cls)).length;
      eq(ctx, i, 'the ripple bits final (drawn)', m[2], good('rr')); eq(ctx, i, 'the lookahead bits final (drawn)', m[4], good('ll'));
      if (/lookahead adder is done/.test(f.say)) lDone = +m[1];
      if (/ripple adder is done/.test(f.say)) rDone = +m[1];
    });
    const last = F[F.length - 1];
    const v = /^Lookahead finished in ([\d.]+) ns, ripple in ([\d.]+) ns(?: \(([\d.]+) times as long\))?/.exec(last.say);
    if (!v) { ctx.fail('the verdict is not read: ' + last.say); return; }
    if (lDone !== null) eq(ctx, F.length - 1, 'the lookahead finish', v[1], lDone);
    if (rDone !== null) eq(ctx, F.length - 1, 'the ripple finish', v[2], rDone);
    if (v[3]) eq(ctx, F.length - 1, 'the ratio', v[3], r2(+v[2] / +v[1]));
    // the race's sum cells at the end are the true sum
    const cells = (p) => [...Array(n).keys()].map((k) => (last.items.find((x) => x.key === p + ':' + k) || {}).text).join('');
    eq(ctx, F.length - 1, 'the ripple sum drawn', cells('rr'), bits(sum, n)); eq(ctx, F.length - 1, 'the lookahead sum drawn', cells('ll'), bits(sum, n));
  },
  'adder-subtractor'(ctx) {
    const F = ctx.r.frames, n = 4, a = ctx.input.a & 15, b = ctx.input.b & 15, m = ctx.input.op === 'sub' ? 1 : 0;
    const be = m ? ~b & 15 : b, raw = a + be + m, s = raw & 15, c4 = raw >> 4, c3 = ((a & 7) + (be & 7) + m) >> 3, v = c3 ^ c4;
    const last = F[F.length - 1].say;
    const x = /^Result S = ([01]{4}), C4 = (\d), V = (\d)\. Unsigned: (\d+) ([+−]) (\d+) = (−?\d+)/.exec(last);
    if (!x) { ctx.fail('the result is not read: ' + last); return; }
    eq(ctx, F.length - 1, 'S', x[1], bits(s, 4)); eq(ctx, F.length - 1, 'C4', x[2], c4); eq(ctx, F.length - 1, 'V', x[3], v);
    eq(ctx, F.length - 1, 'the unsigned sum', num(x[7]), m ? a - b : a + b);
    eq(ctx, F.length - 1, 'a hyphen for a minus sign', /\d -\d|[ (]-\d/.test(last), false);
    eq(ctx, F.length - 1, 'brackets round a number that is not negative', /\((\d+)\)/.test(last), false);
    const sg = /Signed: (−?-?\d+) [+−] \(?(−?-?\d+)\)? = (−?-?\d+)/.exec(last);
    if (sg) { eq(ctx, F.length - 1, 'the signed A', num(sg[1]), sgn(a, n)); eq(ctx, F.length - 1, 'the signed B', num(sg[2]), sgn(b, n)); eq(ctx, F.length - 1, 'the signed result', num(sg[3]), m ? sgn(a, n) - sgn(b, n) : sgn(a, n) + sgn(b, n)); }
    const vv = /V = C3 ⊕ C4 = (\d) ⊕ (\d) = (\d)/.exec(last);
    eq(ctx, F.length - 1, 'C3 ⊕ C4', vv && vv.slice(1).join(' '), c3 + ' ' + c4 + ' ' + v);
    const reads = /S reads as (−?-?\d+)|and S = (−?-?\d+) is right/.exec(last);
    eq(ctx, F.length - 1, 'S as a signed number', reads && num(reads[1] || reads[2]), sgn(s, n));
    eq(ctx, F.length - 1, 'whether it overflows', /overflow/.test(last) ? 1 : 0, v);
    if (m) eq(ctx, F.length - 1, 'the borrow', /no borrow/.test(last) ? 1 : 0, a >= b ? 1 : 0);
    for (let k = 0; k < 4; k++) eq(ctx, F.length - 1, 'S' + k + ' drawn', shown(F[F.length - 1], 'S' + k), (s >> k) & 1);
    eq(ctx, F.length - 1, 'V drawn', shown(F[F.length - 1], 'V'), v);
  },
  'bcd-adder'(ctx) {
    const F = ctx.r.frames, X = ctx.input.x, Y = ctx.input.y;
    const xd = String(X).split('').reverse().map(Number), yd = String(Y).split('').reverse().map(Number);
    let carry = 0, k = -1, corr = 0;
    F.forEach((f, i) => {
      const say = f.say || '';
      let m;
      if ((m = /^Digit (\d+) \(from the right\): (\d) \+ (\d)( \+ carry 1)?\. In BCD each digit is 4 bits: ([01]{4}) and ([01]{4})\./.exec(say))) {
        k = +m[1] - 1;
        eq(ctx, i, 'digit ' + m[1] + ' of x', m[2], xd[k] || 0); eq(ctx, i, 'digit ' + m[1] + ' of y', m[3], yd[k] || 0); eq(ctx, i, 'the carry in', m[4] ? 1 : 0, carry);
        eq(ctx, i, 'the BCD codes', m[5] + ' ' + m[6], bits(xd[k] || 0, 4) + ' ' + bits(yd[k] || 0, 4));
      }
      if ((m = /^A 4-bit binary adder gives Z = (\d+) = (carry 1, )?([01]{4})\. The detector checks for a sum over 9: K = C \+ Z3Z2 \+ Z3Z1 = (\d) \+ (\d)·(\d) \+ (\d)·(\d) = (\d)\./.exec(say))) {
        const z = (xd[k] || 0) + (yd[k] || 0) + carry, zz = z & 15, c = z >> 4, K = c | ((zz >> 3) & ((zz >> 2) & 1)) | ((zz >> 3) & ((zz >> 1) & 1));
        eq(ctx, i, 'Z', m[1], z); eq(ctx, i, 'its bits', (m[2] ? 'c' : '') + m[3], (c ? 'c' : '') + bits(zz, 4));
        eq(ctx, i, 'the detector', m.slice(4, 10).join(' '), [c, (zz >> 3) & 1, (zz >> 2) & 1, (zz >> 3) & 1, (zz >> 1) & 1, K].join(' '));
        eq(ctx, i, 'K = 1 exactly when the sum is over 9', K, z > 9 ? 1 : 0);
      }
      if ((m = /^K = 1: (\d+) is not a BCD digit.*adds 0110: ([01]{4}) \+ 0110 = ([01]{4})/.exec(say))) { corr++; const z = +m[1]; eq(ctx, i, 'the corrected digit', m[3], bits((z & 15) + 6, 4)); eq(ctx, i, 'the binary sum', m[2], bits(z, 4)); }
      if ((m = /^Digit (\d)(, and K = 1 is the decimal carry|, with no decimal carry)/.exec(say))) {
        const z = (xd[k] || 0) + (yd[k] || 0) + carry;
        eq(ctx, i, 'the digit', m[1], z % 10); eq(ctx, i, 'the decimal carry', /K = 1/.test(m[2]) ? 1 : 0, z > 9 ? 1 : 0);
        carry = z > 9 ? 1 : 0;
      }
      if ((m = /^(\d+) \+ (\d+) = (\d+), every digit in BCD, with (\d+) corrections? of \+6/.exec(say))) { eq(ctx, i, 'the sum', m[3], X + Y); eq(ctx, i, 'the corrections', m[4], corr); }
    });
  },
  'array-multiplier'(ctx) {
    const F = ctx.r.frames, n = +ctx.input.n, a = ctx.input.a, b = ctx.input.b;
    let acc = null, seen = [];
    F.forEach((f, i) => {
      const say = f.say || '';
      let m;
      if ((m = /^Multiply A = ([01]+) by B = ([01]+)\./.exec(say))) eq(ctx, i, 'A and B', m[1] + ' ' + m[2], bits(a, n) + ' ' + bits(b, n));
      if ((m = /^Row (\d+): each bit of A ANDed with b\d+ = (\d) gives (A itself, ([01]+)|all zeros), shifted (\d+) places? left\. (\d+) AND gates/.exec(say))) {
        const k = +m[1], bk = (b >> k) & 1;
        eq(ctx, i, 'b' + k, m[2], bk); eq(ctx, i, 'the row', m[4] || '0', bk ? bits(a, n) : '0'); eq(ctx, i, 'the shift', m[5], k); eq(ctx, i, 'the AND gates per row', m[6], n);
        eq(ctx, i, '"place"/"places"', / place left/.test(say) ? 1 : 0, k === 1 ? 1 : 0);
      }
      if ((m = /^Adder row (\d+) adds .* give (\d+) = ([01]+)\./.exec(say))) {
        const k = +m[1];
        let s = 0; for (let j = 0; j <= k; j++) if ((b >> j) & 1) s += a << j;
        eq(ctx, i, 'the running sum', m[2], s); eq(ctx, i, 'its bits', m[3], bits(s, 2 * n));
        if (/That is the product/.test(say)) eq(ctx, i, 'the product', m[2], a * b);
        if (f.meta) acc = s;
      }
      if ((m = /^At ([\d.]+) ns the outputs read (\d+|unknown)\./.exec(say))) {
        const drawn = parseInt([...Array(2 * n).keys()].reverse().map((j) => (f.items.find((x) => x.key === 't' + j) || {}).text).join(''), 2);
        if (m[2] !== 'unknown') eq(ctx, i, 'the product drawn at ' + m[1] + ' ns', drawn, m[2]);
        const w = f.items.find((x) => x.kind === 'wave');
        if (w) { const at = w.changes.filter((c) => c[0] <= +m[1]).pop(); eq(ctx, i, 'the product on the wave at ' + m[1] + ' ns', at && at[1], m[2]); seen = w.changes; }
        const p = /The product settles at ([\d.]+) ns(?:, after passing through ([\d, ]+) on the way)?\. The worst case for any inputs is ([\d.]+) ns/.exec(say);
        if (p) {
          eq(ctx, i, 'the final product', m[2], a * b); eq(ctx, i, 'the settling time', p[1], m[1]);
          const all = f.items.find((x) => x.kind === 'wave').changes;
          eq(ctx, i, 'the last change on the wave', all[all.length - 1][0], +p[1]);
          if (p[2]) eq(ctx, i, 'the values on the way', p[2], all.slice(1, -1).map((c) => c[1]).join(', '));
          if (+p[3] < +p[1]) ctx.fail('frame ' + i + ': the worst case ' + p[3] + ' is shorter than this run');
          const gates = /real circuit: (\d+) gates/.exec(F.map((g) => g.say).join(' '));
          eq(ctx, i, 'the gate count n² + 5n(n − 1) - ...', gates ? 'counted' : 'missing', 'counted');
        }
      }
    });
  },
  'magnitude-comparator'(ctx) {
    const F = ctx.r.frames, n = +ctx.input.n, a = ctx.input.a, b = ctx.input.b;
    const word = a > b ? 'A > B' : a < b ? 'A < B' : 'A = B';
    F.forEach((f, i) => {
      const say = f.say || '';
      let m;
      if ((m = /^Compare A = (\d+) with B = (\d+)/.exec(say))) eq(ctx, i, 'A and B', m[1] + ' ' + m[2], a + ' ' + b);
      if ((m = /^Bit (\d): A\d = B\d = (\d), so x\d = 1/.exec(say))) { const k = +m[1]; eq(ctx, i, 'bit ' + k, ((a >> k) & 1) + '' + ((b >> k) & 1), m[2] + m[2]); }
      if ((m = /^Bit (\d): A\d = (\d) and B\d = (\d), so x\d = 0\. Every bit above agreed, so this bit decides: (A [<>] B)\. The term (GT|LT) = (\w*?)(A\d′?B\d′?) is 1\./.exec(say))) {
        const k = +m[1];
        eq(ctx, i, 'bit ' + k, m[2] + m[3], ((a >> k) & 1) + '' + ((b >> k) & 1)); eq(ctx, i, 'the verdict', m[4], word); eq(ctx, i, 'the output', m[5], a > b ? 'GT' : 'LT');
        eq(ctx, i, 'the x terms', m[6], [...Array(n).keys()].reverse().filter((j) => j > k).map((j) => 'x' + j).join(''));
        eq(ctx, i, 'the bits above agree', ((a ^ b) >> (k + 1)), 0);
      }
      if ((m = /GT = (\d), EQ = (\d), LT = (\d), settled ([\d.]+) ns after A and B changed\. So (A [<>=] B)\./.exec(say))) {
        eq(ctx, i, 'GT EQ LT', m.slice(1, 4).join(''), [+(a > b), +(a === b), +(a < b)].join('')); eq(ctx, i, 'the verdict', m[5], word);
        eq(ctx, i, 'the terms lit', f.items.filter((x) => /^(gt|lt|eq):\d+$/.test(x.key) && /good/.test(x.cls)).length, 1);
      }
      if ((m = /Here (A [<>=] B)\.$/.exec(say))) eq(ctx, i, 'the verdict', m[1], word);
      sayClaims(ctx, f, i, /A = (\d), B = (\d): GT = (\d), EQ = (\d), LT = (\d)/g, (x) => ([+(+x[1] > +x[2]), +(x[1] === x[2]), +(+x[1] < +x[2])].join('') !== x[3] + x[4] + x[5] ? 'the comparison is wrong' : null));
    });
    if (n === 2) settled(ctx, ['A1', 'B1', 'A0', 'B0'], ['GT', 'EQ', 'LT'], (e) => { const x = e.A1 * 2 + e.A0, y = e.B1 * 2 + e.B0; return { GT: +(x > y), EQ: +(x === y), LT: +(x < y) }; });
  },
  decoder(ctx) {
    const k = +ctx.input.k, low = ctx.input.low === 'low', A = [...Array(k).keys()].reverse().map((i) => 'A' + i), outs = [...Array(1 << k).keys()].map((m) => 'Y' + m);
    const fn = (e) => { const m = parseInt(A.map((v) => e[v]).join(''), 2); return Object.fromEntries(outs.map((y, j) => [y, (e.E && j === m ? 1 : 0) ^ (low ? 1 : 0)])); };
    settled(ctx, ['E'].concat(A), outs, fn);
    ctx.r.frames.forEach((f, i) => sayClaims(ctx, f, i, /Address ([01]+) = (\d+): only (Y\d+) is active \(([01])\); its gate is the one matching (E[A-Z0-9']+)\./g, (x) => {
      const m = parseInt(x[1], 2);
      if (m !== +x[2] || x[3] !== 'Y' + m || +x[4] !== (low ? 0 : 1)) return 'the active output is wrong';
      const term = 'E' + A.map((v, j) => v + ((m >> (k - 1 - j)) & 1 ? '' : "'")).join('');
      return term !== x[5] ? 'the gate is ' + term : null;
    }));
  },
  'decoder-functions'(ctx) {
    const f1 = String(ctx.input.f1).split(/[\s,]+/).filter(Boolean).map(Number), f2 = String(ctx.input.f2).split(/[\s,]+/).filter(Boolean).map(Number);
    settled(ctx, ['A', 'B', 'C'], ['F1', 'F2'], (e) => { const m = e.A * 4 + e.B * 2 + e.C; return { F1: +f1.includes(m), F2: +f2.includes(m) }; });
    ctx.r.frames.forEach((f, i) => sayClaims(ctx, f, i, /ABC = ([01]{3}): only the decoder gate for minterm (\d) \(([A-C']+)\) can be 1/g, (x) => { const m = parseInt(x[1], 2); return m !== +x[2] || ['A', 'B', 'C'].map((v, j) => v + ((m >> (2 - j)) & 1 ? '' : "'")).join('') !== x[3] ? 'the minterm is wrong' : null; }));
  },
  'decoder-tree'(ctx) {
    const big = ctx.input.kind === '416', n = big ? 4 : 3, ins = [...Array(n).keys()].reverse().map((i) => 'A' + i);
    const rows = String(ctx.input.seq).split(/[\s,]+/).filter(Boolean).map(Number), outs = [...new Set(rows)].map((m) => 'Y' + m);
    settled(ctx, ins, outs, (e) => { const m = parseInt(ins.map((v) => e[v]).join(''), 2); return Object.fromEntries(outs.map((y) => [y, +(y === 'Y' + m)])); });
    ctx.r.frames.forEach((f, i) => sayClaims(ctx, f, i, /Address ([01]+) = (\d+): the high (?:bit A2 = (\d) enables the (upper|lower)|bits ([01]{2}) go to the first decoder, whose output (\d) enables decoder d(\d)).*?; the low bits ([01]{2}) pick its output (\d), which is (Y\d+)\./g, (x) => {
      const m = parseInt(x[1], 2), hi = m >> 2, lo = m & 3;
      if (m !== +x[2] || x[10] !== 'Y' + m || x[8] !== bits(lo, 2) || +x[9] !== lo) return 'the address split is wrong';
      if (x[3] !== undefined && (+x[3] !== hi || (x[4] === 'upper') !== !!hi)) return 'the decoder enabled is wrong';
      if (x[5] !== undefined && (x[5] !== bits(hi, 2) || +x[6] !== hi || +x[7] !== hi)) return 'the decoder enabled is wrong';
      return null;
    }));
  },
  encoder(ctx) {
    const ins = ['D3', 'D2', 'D1', 'D0'];
    settled(ctx, ins, ['Y1', 'Y0'], (e) => ({ Y1: e.D2 | e.D3, Y0: e.D1 | e.D3 }));
    ctx.r.frames.forEach((f, i) => {
      const e = f._env; if (!e) return;
      const on = ins.filter((d) => e[d]), say = f.say;
      if (on.length === 1) { const m = /(D\d) alone is active, and Y1 Y0 = ([01]{2}) = (\d), its number/.exec(say); eq(ctx, i, 'the one input and its code', m && m.slice(1).join(' '), on[0] + ' ' + bits(+on[0][1], 2) + ' ' + on[0][1]); }
      else if (!on.length) eq(ctx, i, 'the empty case', /No input is active/.test(say), true);
      else { const m = /^(?:.*?: )?([D\d, and]+) are (both|all) active: the ORs mix their numbers and give ([01]{2}) = (\d)/.exec(say); const or = on.reduce((s, d) => s | +d[1], 0); eq(ctx, i, 'the mixed code', m && [m[1], m[3], m[4]].join(' '), on.slice(0, -1).join(', ') + ' and ' + on[on.length - 1] + ' ' + bits(or, 2) + ' ' + or); eq(ctx, i, '"both" or "all"', m && m[2], on.length === 2 ? 'both' : 'all');
        const lucky = on.find((d) => +d[1] === or), luck = /That is (D\d)'s number, but only by luck: nothing shows that (.+?) (?:is|are) active too\./.exec(say);
        if (lucky) eq(ctx, i, 'the input whose number it is', luck && luck[1] + ' / ' + luck[2], lucky + ' / ' + on.filter((d) => d !== lucky).join(' and '));
        else eq(ctx, i, 'the code is wrong for all of them', /which is wrong for (both|all of them)\./.exec(say) && /which is wrong for (both|all of them)\./.exec(say)[1], on.length === 2 ? 'both' : 'all of them'); }
    });
  },
  'priority-encoder'(ctx) {
    const ins = ['D3', 'D2', 'D1', 'D0'];
    const fn = (e) => { const hi = ins.find((d) => e[d]); const v = hi ? +hi[1] : 0; return { Y1: hi ? v >> 1 : 0, Y0: hi ? v & 1 : 0, V: hi ? 1 : 0 }; };
    settled(ctx, ins, ['Y1', 'Y0', 'V'], fn);
    ctx.r.frames.forEach((f, i) => {
      const e = f._env; if (!e) return;
      const on = ins.filter((d) => e[d]), say = f.say;
      if (!on.length) { eq(ctx, i, 'nothing active, V = 0', /Nothing is active: V = 0/.test(say), true); return; }
      const m = /(?:([D\d, ]+) are active; the highest, (D\d), wins|(D\d) is active): Y1 Y0 = ([01]{2}) = (\d), V = (\d)\./.exec(say);
      if (!m) { ctx.fail('frame ' + i + ': not read: ' + say); return; }
      if (m[1]) { eq(ctx, i, 'the active inputs', m[1].trim(), on.join(', ')); eq(ctx, i, 'the winner', m[2], on[0]); } else eq(ctx, i, 'the one active input', m[3], on.join(', '));
      eq(ctx, i, 'the code', m[4] + ' ' + m[5] + ' ' + m[6], bits(+on[0][1], 2) + ' ' + on[0][1] + ' 1');
      eq(ctx, i, 'the D2 blocks D1 remark', /D2 blocks D1/.test(say), !!(e.D2 && e.D1));
    });
  },
  multiplexer(ctx) {
    const ins = ['I3', 'I2', 'I1', 'I0', 'S1', 'S0'];
    settled(ctx, ins, ['Y'], (e) => ({ Y: e['I' + (e.S1 * 2 + e.S0)] }));
    ctx.r.frames.forEach((f, i) => { const e = f._env; if (!e) return; const s = e.S1 * 2 + e.S0; sayClaims(ctx, f, i, /S1 S0 = ([01]{2}) selects I(\d) = (\d): .* so Y = I(\d) = (\d)\./g, (x) => (x[1] !== '' + e.S1 + e.S0 || +x[2] !== s || +x[4] !== s || +x[3] !== e['I' + s] || +x[5] !== e['I' + s] ? 'the selection is wrong' : null)); });
  },
  'mux-tree'(ctx) {
    const ins = ['D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'D1', 'D0', 'S2', 'S1', 'S0'];
    settled(ctx, ins, ['Y'], (e) => ({ Y: e['D' + (e.S2 * 4 + e.S1 * 2 + e.S0)] }));
    ctx.r.frames.forEach((f, i) => { const e = f._env; if (!e) return; const s = e.S2 * 4 + e.S1 * 2 + e.S0; sayClaims(ctx, f, i, /S2 S1 S0 = ([01]{3}) = (\d): S0 = (\d) picks D(\d) from its pair, S1 = (\d) passes that pair on, S2 = (\d) chooses the (upper|lower) half at the root\. Y = D(\d) = (\d)\./g, (x) => (x[1] !== bits(s, 3) || +x[2] !== s || +x[3] !== e.S0 || +x[4] !== s || +x[5] !== e.S1 || +x[6] !== e.S2 || (x[7] === 'upper') !== !!e.S2 || +x[8] !== s || +x[9] !== e['D' + s] ? 'the path is wrong' : null)); });
  },
  'mux-function'(ctx) {
    const n = +ctx.input.n, vars = ['A', 'B', 'C', 'D'].slice(0, n), sel = vars.slice(0, -1), last = vars[n - 1];
    const ones = new Set(String(ctx.input.fn).split(/[\s,]+/).filter(Boolean).map(Number));
    const entry = (s) => { const z = ones.has(2 * s), o = ones.has(2 * s + 1); return z && o ? '1' : !z && !o ? '0' : o ? last : last + '′'; };
    settled(ctx, vars, ['F'], (e) => ({ F: +ones.has(parseInt(vars.map((v) => e[v]).join(''), 2)) }));
    ctx.r.frames.forEach((f, i) => {
      const say = f.say || '';
      let m;
      if ((m = /^Rows (\d+) and (\d+) \((.+?)\): F = (?:(\d) when \w = 0 and (\d) when \w = 1|(\d) in both rows), so I(\d) = (.+?)\.$/.exec(say))) {
        const s = +m[1] >> 1;
        eq(ctx, i, 'the pair', m[1] + ' ' + m[2], 2 * s + ' ' + (2 * s + 1)); eq(ctx, i, 'the data input', m[7], s); eq(ctx, i, 'I' + s, m[8], entry(s));
        if (m[4] !== undefined) eq(ctx, i, 'the two rows', m[4] + m[5], +ones.has(2 * s) + '' + +ones.has(2 * s + 1)); else eq(ctx, i, 'the two rows', m[6] + m[6], +ones.has(2 * s) + '' + +ones.has(2 * s + 1));
        eq(ctx, i, 'the select values', m[3], sel.map((v, j) => v + ' = ' + ((s >> (sel.length - 1 - j)) & 1)).join(', '));
        if (i > 0 && F(i - 1)) eq(ctx, i - 1, 'the predicted entry', F(i - 1).answer.replace("'", '′'), entry(s));
      }
      const e = f._env;
      if (e && (m = /(\w+) = ([01]+) selects I(\d) = (\S+?)(?:, which is (\d) here)?: F = (\d)/.exec(say))) {
        const s = parseInt(sel.map((v) => e[v]).join(''), 2), fv = +ones.has(parseInt(vars.map((v) => e[v]).join(''), 2));
        eq(ctx, i, 'the selects', m[1] + ' ' + m[2] + ' ' + m[3], sel.join('') + ' ' + bits(s, n - 1) + ' ' + s); eq(ctx, i, 'the entry', m[4].replace("'", '′'), entry(s)); eq(ctx, i, 'F', m[6], fv);
        if (m[5] !== undefined) eq(ctx, i, 'the entry\'s value', m[5], fv);
        eq(ctx, i, 'the prime mark', /'/.test(m[4]), false);
      }
    });
    function F(i) { return ctx.r.frames[i] && ctx.r.frames[i].predict; }
  },
  demultiplexer(ctx) {
    settled(ctx, ['S1', 'S0', 'D'], ['Y0', 'Y1', 'Y2', 'Y3'], (e) => { const s = e.S1 * 2 + e.S0; return Object.fromEntries([0, 1, 2, 3].map((k) => ['Y' + k, k === s ? e.D : 0])); });
    ctx.r.frames.forEach((f, i) => { const e = f._env; if (!e) return; const s = e.S1 * 2 + e.S0; sayClaims(ctx, f, i, /S1 S0 = ([01]{2}) routes D to Y(\d): Y(\d) = D = (\d)/g, (x) => (x[1] !== '' + e.S1 + e.S0 || +x[2] !== s || +x[3] !== s || +x[4] !== e.D ? 'the routing is wrong' : null)); });
  },
  'tristate-bus'(ctx) {
    const ins = ['E2', 'E1', 'E0', 'D2', 'D1', 'D0'];
    const fn = (e) => { const on = [0, 1, 2].filter((k) => e['E' + k]); const vs = new Set(on.map((k) => e['D' + k])); return { BUS: !on.length ? 'Z' : vs.size > 1 ? 'X' : [...vs][0] }; };
    settled(ctx, ins, ['BUS'], fn);
    ctx.r.frames.forEach((f, i) => {
      const e = f._env; if (!e) return;
      const on = [0, 1, 2].filter((k) => e['E' + k]), say = f.say, bus = fn(e).BUS;
      if (!on.length) eq(ctx, i, 'the floating bus', /bus floats \(Z\)/.test(say), true);
      else if (on.length === 1) { const m = /Only buffer (\d) is enabled, so it drives the bus with D(\d) = (\d).*BUS = (\d)\./.exec(say); eq(ctx, i, 'the one driver', m && m.slice(1).join(' '), on[0] + ' ' + on[0] + ' ' + e['D' + on[0]] + ' ' + bus); }
      else {
        const m = /Buffers ([\d, and]+) are (all|both) enabled(?: and happen to agree, so the bus reads (\d))?/.exec(say);
        eq(ctx, i, 'the drivers', m && m[1] + ' / ' + m[2], on.slice(0, -1).join(', ') + ' and ' + on[on.length - 1] + ' / ' + (on.length === 2 ? 'both' : 'all'));
        eq(ctx, i, 'contention', /: contention\. The bus is X/.test(say), bus === 'X');
        if (bus !== 'X') eq(ctx, i, 'the agreed value', m && m[3], bus);
        if (bus === 'X') eq(ctx, i, 'how the drivers split', /(one driving 1 and the other 0|some driving 1 and some 0)/.exec(say) && /(one driving 1 and the other 0|some driving 1 and some 0)/.exec(say)[1], on.length === 2 ? 'one driving 1 and the other 0' : 'some driving 1 and some 0');
      }
    });
  },
};

const all = (ctx) => { liveFrames(ctx, ctx.r.frames); delays(ctx, ctx.r.frames); };

// random valid inputs (rnd() in [0, 1))
const pick = (rnd, xs) => xs[Math.floor(rnd() * xs.length)];
const int = (rnd, lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const list = (rnd, k, f) => [...Array(k)].map(() => f()).join(', ');
const bin = (rnd, k) => [...Array(k)].map(() => int(rnd, 0, 1)).join('');
const TECH = ['CMOS', 'TTL', 'LS-TTL'];
const random = {
  'bcd-excess3': (rnd) => ({ digits: list(rnd, int(rnd, 1, 5), () => int(rnd, 0, 9)) }),
  'bcd-seven-segment': (rnd) => ({ seg: pick(rnd, [...'abcdefg']), digits: list(rnd, int(rnd, 1, 6), () => int(rnd, 0, 15)) }),
  'gray-converter': (rnd) => { const n = pick(rnd, ['3', '4']); return { dir: pick(rnd, ['b2g', 'g2b']), n, steps: int(rnd, 2, (1 << +n) - 1) }; },
  'half-adder': (rnd) => ({ tech: pick(rnd, TECH), order: pick(rnd, ['binary', 'gray']) }),
  'full-adder': (rnd) => ({ tech: pick(rnd, TECH), order: pick(rnd, ['binary', 'gray', 'carry']) }),
  'ripple-carry': (rnd) => { const n = int(rnd, 2, 6); return { n: String(n), a: int(rnd, 0, (1 << n) - 1), b: int(rnd, 0, (1 << n) - 1), start: pick(rnd, ['cin', 'all']), tech: pick(rnd, TECH) }; },
  'carry-lookahead': (rnd) => { const n = pick(rnd, [4, 8, 8, 16]); return { n: String(n), a: bin(rnd, n), b: bin(rnd, n), tech: pick(rnd, TECH) }; },
  'adder-subtractor': (rnd) => ({ a: int(rnd, -8, 15), b: int(rnd, -8, 15), op: pick(rnd, ['add', 'sub']), tech: pick(rnd, TECH) }),
  'bcd-adder': (rnd) => ({ x: int(rnd, 0, pick(rnd, [9, 99, 999, 9999])), y: int(rnd, 0, pick(rnd, [9, 99, 999, 9999])) }),
  'array-multiplier': (rnd) => { const n = int(rnd, 2, 4); return { n: String(n), a: int(rnd, 0, (1 << n) - 1), b: int(rnd, 0, (1 << n) - 1) }; },
  'magnitude-comparator': (rnd) => { const n = pick(rnd, [2, 4]); return { n: String(n), a: int(rnd, 0, (1 << n) - 1), b: int(rnd, 0, (1 << n) - 1) }; },
  decoder: (rnd) => { const k = int(rnd, 2, 3); return { k: String(k), low: pick(rnd, ['high', 'low']), seq: list(rnd, int(rnd, 2, 6), () => bin(rnd, k + 1)) }; },
  'decoder-functions': (rnd) => ({ f1: list(rnd, int(rnd, 1, 5), () => int(rnd, 0, 7)), f2: list(rnd, int(rnd, 1, 5), () => int(rnd, 0, 7)) }),
  'decoder-tree': (rnd) => { const k = pick(rnd, ['38', '416']); return { kind: k, seq: list(rnd, int(rnd, 2, 6), () => int(rnd, 0, k === '38' ? 7 : 15)) }; },
  encoder: (rnd) => ({ seq: list(rnd, int(rnd, 2, 6), () => bin(rnd, 4)) }),
  'priority-encoder': (rnd) => ({ seq: list(rnd, int(rnd, 2, 6), () => bin(rnd, 4)) }),
  multiplexer: (rnd) => ({ data: bin(rnd, 4), sel: list(rnd, int(rnd, 2, 5), () => bin(rnd, 2)) }),
  'mux-tree': (rnd) => ({ data: bin(rnd, 8), sel: list(rnd, int(rnd, 2, 5), () => bin(rnd, 3)) }),
  'mux-function': (rnd) => { const n = pick(rnd, ['3', '4']); return { n, fn: list(rnd, int(rnd, 1, 8), () => int(rnd, 0, (1 << +n) - 1)) }; },
  demultiplexer: (rnd) => ({ seq: list(rnd, int(rnd, 2, 6), () => bin(rnd, 3)) }),
  'tristate-bus': (rnd) => ({ seq: list(rnd, int(rnd, 2, 6), () => bin(rnd, 3) + ' ' + bin(rnd, 3)) }),
};

export default {
  family: /^p4-/,
  extra: {},
  random,
  check(ctx) {
    all(ctx);
    if (checks[ctx.tp.id]) checks[ctx.tp.id](ctx);
  },
};
export { netIndex, shown, bits };
