// Part 12, Verilog: every value a frame quotes is checked against the simulator (the run of the topic's own
// source: its changes, its waves, what it printed) and against a working-out of our own (4-valued logic, the
// arithmetic, a priority encoder, the detector's state table, gates stepped with their delays).
const T = (s) => String(s || '');
const bin = (n, w) => (n >>> 0).toString(2).padStart(w, '0').slice(-w);
const and4 = (a, b) => (a === '0' || b === '0' ? '0' : a === '1' && b === '1' ? '1' : 'x');
const or4 = (a, b) => (a === '1' || b === '1' ? '1' : a === '0' && b === '0' ? '0' : 'x');
const xor4 = (a, b) => (/[01]/.test(a) && /[01]/.test(b) && a.length === 1 && b.length === 1 ? String(+a ^ +b) : 'x');

// the whole statement starting on line n, as the narration should quote it (brackets left open carry on)
function stmtAt(src, n) {
  const ls = src.replace(/\s+$/, '').split('\n');
  let txt = '', depth = 0, k = n - 1;
  do {
    const l = (ls[k] || '').replace(/\/\/.*$/, (c) => (depth ? '' : c));
    txt += (txt ? ' ' : '') + l.trim();
    for (const ch of l.replace(/"[^"]*"/g, '').replace(/\/\/.*$/, '')) depth += ch === '(' ? 1 : ch === ')' ? -1 : 0;
    k++;
  } while (depth > 0 && k < ls.length);
  return txt.replace(/\s+/g, ' ');
}
// the text inside the brackets that open at index i of s (quotes respected)
function bracketed(s, i) {
  let depth = 0, q = false;
  for (let k = i; k < s.length; k++) {
    const c = s[k];
    if (c === '"') q = !q;
    if (q) continue;
    if (c === '(') depth++;
    if (c === ')' && --depth === 0) return s.slice(i + 1, k);
  }
  return null;
}

/** the source a topic ran, rebuilt from its input where the topic writes it itself */
function sourceOf(S, tp, input) {
  if (typeof input.src === 'string') return { src: input.src };
  return null;
}

// ---- generic checks on any topic with a source --------------------------------------------------------------
function generic(ctx, src, R, opts) {
  const { S, r, fail } = ctx;
  const K = S.Kit.code;
  const shortOf = (net) => net.replace(/^[^.]+\./, '');
  let curT = 0;
  r.frames.forEach((f, i) => {
    const say = T(f.say);
    const tm = /^At ([\d.]+) ns/.exec(say) || /moves on to ([\d.]+) ns/.exec(say);
    if (tm) curT = +tm[1];
    // "line N runs (statement)" and "line N (statement) reacts": the whole statement, as written
    for (const m of say.matchAll(/(?:line (\d+) runs \(|^At [\d.]+ ns, line (\d+) \()/g)) {
      m[1] = m[1] || m[2];
      const inner = bracketed(say, m.index + m[0].length - 1);
      const want = stmtAt(src, +m[1]);
      if (inner === null || inner.replace(/\s+/g, ' ') !== want) fail('frame ' + i + ': line ' + m[1] + ' is quoted as (' + inner + '), the source has (' + want + ')');
      else ctx.pass();
    }
    // every change quoted is one the simulator made at that time
    for (const m of say.matchAll(/(?:the testbench's )?([A-Za-z_][\w.[\]]*) (?:goes|changes) from ([01xz]+)(?: \((-?\d+)\))? to ([01xz]+)(?: \((-?\d+)\))?/g)) {
      const [, name, from, dfrom, to, dto] = m;
      for (const [b, d] of [[from, dfrom], [to, dto]]) if (d !== undefined && parseInt(b, 2) !== +d) fail('frame ' + i + ': ' + b + ' is not ' + d);
      const hit = R.steps.some((s) => s.kind === 'update' && Math.abs(s.t - curT) < 1e-9 && shortOf(s.net) === name && S.P12.show(s.from) === from && S.P12.show(s.to) === to);
      if (!hit) fail('frame ' + i + ' (' + curT + ' ns): the narration says ' + name + ' goes from ' + from + ' to ' + to + ', the simulator made no such change');
      else ctx.pass();
    }
    // every line said to be printed was printed
    if (!(opts && opts.noPrints)) for (const m of say.matchAll(/(?:prints|gets) "([^"]*)"/g)) {
      if (!R.output.includes(m[1])) fail('frame ' + i + ': the narration quotes the output "' + m[1] + '", the simulator printed ' + JSON.stringify(R.output));
      else ctx.pass();
    }
  });
}

// the closing frame's waveforms must reach as far as any earlier frame's (a panel drawn back at 0 ns is empty)
function wavesReach(ctx) {
  const { r, fail } = ctx;
  const reach = (f) => { const w = f.items.filter((x) => x.kind === 'wave'); if (!w.length) return null; return Math.max(-1, ...w.flatMap((x) => (x.changes || []).filter((c, k, a) => k === 0 || String(c[1]) !== String(a[k - 1][1])).map((c) => c[0]))); };
  let best = -1;
  r.frames.forEach((f, i) => {
    const e = reach(f);
    if (e === null) return;
    if (i === r.frames.length - 1 && e < best) fail('the last frame draws the waves only to ' + e + ' ns, an earlier frame drew them to ' + best + ' ns');
    best = Math.max(best, e);
  });
}

// ---- the topics ---------------------------------------------------------------------------------------------
const per = {};

// a module answering a testbench: the outputs quoted against the waves and against the gates synthesis builds
per['vl-module'] = per['vl-latch'] = (ctx, src, R) => {
  const { S, r, fail } = ctx;
  const K = S.Kit.code;
  const comp = S.Verilog.compile(src, {});
  const dut = comp.modules.find((m) => m.name !== 'tb').name;
  const hw = K.hardware(src, { top: dut, tb: 'tb' });
  const at = (n, t) => K.show(K.at(R.waves, 'tb.' + n, t));
  r.frames.forEach((f, i) => {
    const say = T(f.say);
    const m = /^At ([\d.]+) ns, (.*?)\. (?:The change wakes|Nothing in)/.exec(say);
    if (!m) return;
    const t = +m[1];
    // the outputs worked out, and the gates agree
    for (const q of say.matchAll(/(?:works out|so) ((?:\w+ = [01xz]+(?: \(\d+\))?(?:, )?)+)/g)) {
      for (const kv of q[1].split(', ')) {
        const [n, v] = kv.split(' = ');
        const bits = v.split(' ')[0];
        if (at(n, t) !== bits) fail('frame ' + i + ': ' + n + ' = ' + bits + ' at ' + t + ' ns, the simulation has ' + at(n, t));
        else if (hw.ok && K.show(hw.at(n, t)) !== bits) fail('frame ' + i + ': ' + n + ' = ' + bits + ' at ' + t + ' ns, the synthesised gates give ' + K.show(hw.at(n, t)));
        else ctx.pass();
      }
    }
    // "no assignment runs" must mean the output really kept its value, and "again" too
    if (/stays as it was|does not change|stay as they were|no output changes/.test(say)) for (const q of say.matchAll(/(\w+) = ([01xz]+)/g)) if (comp.modules.find((x) => x.name === dut) && at(q[1], t - 1e-6) !== at(q[1], t) && /^(y|q|s|co)$/.test(q[1])) fail('frame ' + i + ': ' + q[1] + ' is said to keep its value at ' + t + ' ns, but it changed');
    // a statement quoted as assigning nothing: its line must not have assigned this time
    if (/no assignment to (\w+) runs/.test(say)) {
      const o = /no assignment to (\w+) runs/.exec(say)[1];
      const ran = R.steps.filter((s) => s.kind === 'stmt' && s.t === t && s.scope !== 'tb');
      const ls = src.split('\n');
      const assigned = ran.some((s, k) => new RegExp('\\b' + o + '\\s*=[^=]').test(ls[s.line - 1]) && (!/^\s*(else\s+)?if\b/.test(ls[s.line - 1]) || (k > 0 && ran[k - 1].line === s.line)));
      if (assigned) fail('frame ' + i + ': says no assignment to ' + o + ' runs at ' + t + ' ns, but one did');
      else ctx.pass();
    }
  });
  // the latch topic's closing words: a stretch with en = 0 in which q held
  const last = T(r.frames[r.frames.length - 1].say);
  const h = /From ([\d.]+) ns to ([\d.]+) ns en = 0 and q held ([01x])(?: while d went to ([01]))?/.exec(last);
  if (h) {
    const t0 = +h[1], t1 = +h[2];
    if (at('en', t0) !== '0' || at('en', t1 - 1e-6) !== '0') fail('closing frame: en is not 0 from ' + t0 + ' to ' + t1 + ' ns');
    if (at('q', t0) !== h[3] || at('q', t1 - 1e-6) !== h[3]) fail('closing frame: q does not hold ' + h[3] + ' from ' + t0 + ' to ' + t1 + ' ns');
    if (h[4] !== undefined && at('d', t1 - 1e-6) !== h[4]) fail('closing frame: d did not go to ' + h[4]);
    ctx.pass();
  }
  // the instance's connections as the source writes them
  const four = r.frames.find((f) => /places a copy of/.test(T(f.say)));
  if (four) {
    const inst = (/\.(\w+)\(/.test(src.split('module tb')[1] || '') ? 'by name' : 'by position');
    if (!T(four.say).includes(inst)) fail('the instance frame says the ports are joined otherwise than ' + inst);
    for (const m of T(four.say).matchAll(/\.(\w+)\((\w+)\)/g)) if (!new RegExp('\\.' + m[1] + '\\s*\\(\\s*' + m[2] + '\\s*\\)').test(src)) fail('the instance frame quotes .' + m[1] + '(' + m[2] + '), which the source does not have');
  }
};

// gate primitives: our own event run of the gates with their delays gives the same changes of y
per['vl-gates'] = (ctx, src, R) => {
  const { S, r, fail } = ctx;
  const K = S.Kit.code;
  const gates = [...src.matchAll(/^\s*(and|or|nand|nor|xor)\s+#(\d+)\s+(\w+)\((\w+), ([\w, ]+)\);/gm)].map((m) => ({ type: m[1], d: +m[2], id: m[3], out: m[4], ins: m[5].split(/,\s*/) }));
  const fn = { and: (v) => v.reduce(and4), or: (v) => v.reduce(or4), xor: (v) => v.reduce(xor4) };
  const sig = { a: K.changes(R.waves, 'tb.a').map(([t, v]) => [t, String(v).toLowerCase()]), b: K.changes(R.waves, 'tb.b').map(([t, v]) => [t, String(v).toLowerCase()]), c: K.changes(R.waves, 'tb.c').map(([t, v]) => [t, String(v).toLowerCase()]) };
  const valAt = (w, t) => { let v = 'x'; for (const [tt, x] of w) if (tt <= t + 1e-9) v = x; return v; };
  for (const g of gates) {
    const times = [...new Set(g.ins.flatMap((n) => (sig[n] || []).map((q) => q[0])))].sort((a, b) => a - b);
    let out = [];
    for (const t of times) { const v = fn[g.type](g.ins.map((n) => valAt(sig[n], t))); if (!out.length || out[out.length - 1][1] !== v) out.push([t + g.d, v]); }
    // inertial: a pulse shorter than the gate's delay never comes out
    let changed = true;
    while (changed) { changed = false; for (let k = 1; k + 1 < out.length; k++) if (out[k + 1][0] - out[k][0] < g.d && out[k - 1][1] === out[k + 1][1]) { out.splice(k, 2); changed = true; break; } }
    out = out.filter((q, k) => k === 0 || q[1] !== out[k - 1][1]);
    sig[g.out] = out;
  }
  const mine = (sig.y || []).filter((q) => q[1] !== 'x' || q[0] > 0).map((q) => q[0] + ':' + q[1]).join(' ');
  const sim = K.changes(R.waves, 'tb.dut.y').filter((q) => String(q[1]).toLowerCase() !== 'x').map((q) => q[0] + ':' + String(q[1]).toLowerCase()).join(' ');
  if (mine !== sim) fail('y from our own run of the gates: ' + mine + '; the simulator: ' + sim);
  else ctx.pass();
  const g = /dipped to ([01]) for ([\d.]+) ns although it should have stayed ([01])/.exec(T(r.frames[r.frames.length - 1].say));
  if (g) {
    const ys = (sig.y || []), k = ys.findIndex((q, j) => j > 0 && q[1] === g[1] && ys[j - 1][1] === g[3] && ys[j + 1] && ys[j + 1][1] === g[3]);
    if (k < 0 || Math.abs(ys[k + 1][0] - ys[k][0] - +g[2]) > 1e-9) fail('the glitch is said to last ' + g[2] + ' ns at ' + g[1]);
    else ctx.pass();
  }
};

// widths and signs: our own arithmetic, and the same expression run on the simulator from code we write here
per['vl-assign'] = (ctx) => {
  const { S, r, input, fail } = ctx;
  const { k, a, b } = input;
  const sv = (v) => (v >= 8 ? v - 16 : v);
  let want;
  if (k === 'lost') want = 's = ' + bin((a + b) % 16, 4);
  if (k === 'kept') want = 's = ' + bin(a + b, 5);
  if (k === 'cat') want = 'co s = ' + ((a + b) >> 4) + ' ' + bin((a + b) % 16, 4);
  if (k === 'scmp') want = 'lt = ' + (sv(a) < sv(b) ? 1 : 0);
  if (k === 'mcmp') want = 'lt = ' + (a < b ? 1 : 0);
  if (k === 'shift') want = 'l=' + bin(a >> 1, 4) + ' r=' + bin((sv(a) >> 1) & 15, 4);
  const decl = { lost: 'reg [3:0] a, b; wire [3:0] s; assign s = a + b;', kept: 'reg [3:0] a, b; wire [4:0] s; assign s = a + b;', cat: 'reg [3:0] a, b; wire [3:0] s; wire co; assign {co, s} = a + b;', scmp: 'reg signed [3:0] a, b; wire lt; assign lt = a < b;', mcmp: 'reg signed [3:0] a; reg [3:0] b; wire lt; assign lt = a < b;', shift: 'reg signed [3:0] a; reg [3:0] b; wire [3:0] l, r; assign l = a >> 1; assign r = a >>> 1;' }[k];
  const disp = { lost: '"s = %b", s', kept: '"s = %b", s', cat: '"co s = %b %b", co, s', scmp: '"lt = %b", lt', mcmp: '"lt = %b", lt', shift: '"l=%b r=%b", l, r' }[k];
  const R = S.Kit.code.run('module tb;\n' + decl + '\ninitial begin a = ' + a + '; b = ' + b + '; #1 $display(' + disp + '); end\nendmodule', {});
  if (R.output[0] !== want) fail('the simulator prints "' + R.output[0] + '" for ' + k + ' ' + a + ', ' + b + '; our working-out gives "' + want + '"');
  const quoted = r.frames.map((f) => /The simulation prints "([^"]*)"/.exec(T(f.say))).filter(Boolean).map((m) => m[1]);
  if (quoted.length !== 1 || quoted[0] !== want) fail('the narration quotes the simulation as ' + JSON.stringify(quoted) + ', the answer is "' + want + '"');
  else ctx.pass();
  // the bits and numbers on the way
  const all = r.frames.map((f) => T(f.say)).join(' ');
  for (const m of all.matchAll(/(\d+) \+ (\d+) = (\d+), which is ([01]+) in binary/g)) if (+m[1] + +m[2] !== +m[3] || parseInt(m[4], 2) !== +m[3]) fail('the sum is quoted as ' + m[0]);
  for (const m of all.matchAll(/the (\d)-bit result is ([01]+) = (\d+)/g)) if (parseInt(m[2], 2) !== +m[3] || m[2].length !== +m[1] || +m[3] !== (a + b) % 2 ** +m[1]) fail('quoted ' + m[0]);
  for (const m of all.matchAll(/bits 1101|bits ([01]{4}) now read as (\d+)/g)) if (m[1] && (parseInt(m[1], 2) !== +m[2] || m[1] !== bin(a, 4))) fail('quoted ' + m[0]);
  for (const m of all.matchAll(/(−?\d+) < (−?\d+) is (true|false)/g)) { const x = +m[1].replace('−', '-'), y = +m[2].replace('−', '-'); if ((x < y) !== (m[3] === 'true')) fail('quoted ' + m[0]); }
  const lt = /so lt = ([01])/.exec(all);
  if (lt && 'lt = ' + lt[1] !== want) fail('lt is quoted as ' + lt[1]);
  ctx.pass();
};

// four values: assignments worked out with our own 4-valued logic, and wires with two drivers resolved
per['vl-4state'] = (ctx, src, R) => {
  const { S, fail } = ctx;
  const K = S.Kit.code;
  const at = (n, t) => K.show(K.at(R.waves, 'tb.' + n, t));
  const asg = [...src.matchAll(/^\s*assign\s+(\w+)\s*=\s*(.+?);/gm)].map((m) => ({ y: m[1], e: m[2].trim() }));
  const times = [...new Set(R.steps.filter((s) => s.kind === 'update').map((s) => s.t))];
  const ev = (e, t) => {
    let m = /^(\w+)\s*([&|^])\s*(\w+)$/.exec(e);
    if (m) return { '&': and4, '|': or4, '^': xor4 }[m[2]](at(m[1], t), at(m[3], t));
    m = /^(\w+)\s*\?\s*(\w+)\s*:\s*1'bz$/.exec(e);
    if (m) { const s = at(m[1], t); return s === '1' ? at(m[2], t) : s === '0' ? 'z' : 'x'; }
    return null;
  };
  for (const t of times) {
    for (const y of [...new Set(asg.map((a) => a.y))]) {
      const vs = asg.filter((a) => a.y === y).map((a) => ev(a.e, t));
      if (vs.includes(null)) continue;
      const on = vs.filter((v) => v !== 'z');
      const want = !on.length ? 'z' : on.every((v) => v === on[0]) ? on[0] : 'x';
      if (at(y, t) !== want) fail(y + ' at ' + t + ' ns: the simulator has ' + at(y, t) + ', 4-valued logic gives ' + want);
      else ctx.pass();
    }
  }
  if (/r === 2'bxx/.test(src) && JSON.stringify(R.output) !== JSON.stringify(['== not sure', '=== sees xx', 'r+1 = xx', 'r[1] = 1'])) fail('== and ===: the simulator printed ' + JSON.stringify(R.output));
};

// sensitivity lists: the gate is a & b & c, whatever the list says
per['vl-always'] = (ctx, src, R) => {
  const { S, r, fail } = ctx;
  const K = S.Kit.code;
  const at = (n, t) => K.show(K.at(R.waves, 'tb.' + n, t));
  const gate = (t) => and4(and4(at('a', t), at('b', t)), at('c', t));
  const bad = [];
  r.frames.forEach((f, i) => {
    const say = T(f.say);
    const m = /^At ([\d.]+) ns, .*?(?:y = ([01x])\.|y keeps ([01x])\.) The gate gives y = ([01x])/.exec(say);
    if (!m) return;
    const t = +m[1], ys = m[2] || m[3];
    if (at('y', t) !== ys) fail('frame ' + i + ': y = ' + ys + ' at ' + t + ' ns, the simulation has ' + at('y', t));
    if (gate(t) !== m[4]) fail('frame ' + i + ': the gate gives ' + gate(t) + ' at ' + t + ' ns, not ' + m[4]);
    ctx.pass();
  });
  // the stretches where they disagree, worked out from the waves
  const ts = [...new Set(R.steps.filter((s) => s.kind === 'update').map((s) => s.t))].sort((a, b) => a - b);
  ts.forEach((t, k) => { if (at('y', t) !== gate(t)) { const e = k + 1 < ts.length ? ts[k + 1] : R.time; const l = bad[bad.length - 1]; if (l && l[1] === t) l[1] = e; else bad.push([t, e]); } });
  const last = T(r.frames[r.frames.length - 1].say);
  const d = /disagreed (\d+) times? \(shaded\): (.*?)\./.exec(last);
  const said = d ? d[2] : '';
  const mine = bad.map((b) => b[0] + ' ns to ' + b[1] + ' ns').join(', ');
  if ((d ? +d[1] : 0) !== bad.length || said !== mine) fail('the closing frame says they disagreed ' + (d ? d[1] + ' times: ' + said : 'never') + '; the waves differ ' + bad.length + ' times: ' + mine);
  else ctx.pass();
};

// blocking and non-blocking: what the testbench prints is what the scheduler's rules give
per['vl-nba'] = (ctx, src, R) => {
  const { r, fail } = ctx;
  const nb = (src.match(/<=/g) || []).length;
  const disp = R.output.find((l) => /a=\d b=\d/.test(l));
  if (disp) {
    const want = nb >= 2 ? 'a=1 b=0' : 'a=1 b=1';
    if (disp !== want) fail('the swap prints ' + disp + ', the scheduler\'s rules give ' + want);
    const last = T(r.frames[r.frames.length - 1].say);
    if (/a race/.test(last) && (src.match(/\balways\b/g) || []).length < 2) fail('the closing frame calls one block a race');
    ctx.pass();
  }
  if (/\$strobe/.test(src) && JSON.stringify(R.output) !== JSON.stringify(['display: a=0', 'strobe:  a=1'])) fail('$display and $strobe printed ' + JSON.stringify(R.output));
  r.frames.forEach((f, i) => { if (/\(\$(strobe|monitor)[^)]*\);?\)\. ?$/.test(T(f.say))) fail('frame ' + i + ': a $strobe line is quoted with nothing said about it'); });
};

// the shift register: the gates are three flip-flops, a chain or three copies of d, worked out edge by edge
per['vl-race'] = (ctx, src, R) => {
  const { S, r, fail } = ctx;
  const K = S.Kit.code;
  const at = (n, t) => K.show(K.at(R.waves, 'tb.' + n, t));
  const fan = /q1 = d;\s*q2 = q1;\s*q3 = q2;\s*end/.test(src);
  const edges = K.changes(R.waves, 'tb.clk').filter((q) => q[1] === 1 && q[0] > 0).map((q) => q[0]);
  let q = ['x', 'x', 'x'];
  const gates = {};
  for (const e of edges) { const d = at('d', e - 1e-6); q = fan ? [d, d, d] : [d, q[0], q[1]]; gates[e] = q.join(''); }
  r.frames.forEach((f, i) => {
    const m = /After the edge the simulation has q1 q2 q3 = ([01x]{3}) .*? The gates give ([01x]{3})\./.exec(T(f.say));
    const e = /Edge at ([\d.]+) ns: d = ([01x]), q1 q2 q3 = ([01x]{3})/.exec(T(f.say));
    if (e) { const t = +e[1]; if (at('d', t) !== e[2] || ['q1', 'q2', 'q3'].map((n) => at(n, t - 1e-6)).join('') !== e[3]) fail('frame ' + i + ': before the edge at ' + t + ' ns the waves have d = ' + at('d', t)); else ctx.pass(); }
    if (m) {
      const t = +(r.frames.slice(0, i).reverse().map((g) => /^Edge at ([\d.]+) ns/.exec(T(g.say))).find(Boolean) || [0, -1])[1];
      if (['q1', 'q2', 'q3'].map((n) => at(n, t)).join('') !== m[1]) fail('frame ' + i + ': the simulation after ' + t + ' ns is not ' + m[1]);
      if (gates[t] !== m[2]) fail('frame ' + i + ': flip-flops give ' + gates[t] + ' after ' + t + ' ns, not ' + m[2]);
      ctx.pass();
    }
    if (/the block copy\b/.test(T(f.say))) fail('frame ' + i + ': "the block copy"');
  });
};

// if and case: y follows our own reading of the chain, the case or the nested ifs
per['vl-ifcase'] = (ctx, src, R) => {
  const { S, r, fail } = ctx;
  const K = S.Kit.code;
  const at = (n, t) => K.show(K.at(R.waves, 'tb.' + n, t));
  const body = src.split('module tb')[0];
  const kind = /\bcase\b/.test(body) ? 'case' : /if \(s1\) begin/.test(body) ? 'nest' : 'chain';
  const y = (t) => { const [a, b, c, s1, s0] = ['a', 'b', 'c', 's1', 's0'].map((n) => at(n, t)); if (kind === 'chain') return s1 === '1' ? c : s0 === '1' ? b : a; if (kind === 'nest') return s1 === '1' ? (s0 === '1' ? c : b) : a; return s1 + s0 === '00' ? a : s1 + s0 === '01' ? b : c; };
  const ts = [...new Set(R.steps.filter((s) => s.kind === 'update').map((s) => s.t))];
  for (const t of ts) { if (at('y', t) !== y(t)) fail('y at ' + t + ' ns: the simulator has ' + at('y', t) + ', the ' + kind + ' gives ' + y(t)); else ctx.pass(); }
  let curT = 0, prev = '';
  r.frames.forEach((f, i) => {
    const say = T(f.say);
    const tm = /^At ([\d.]+) ns/.exec(say);
    if (tm) curT = +tm[1];
    const c = /The condition \((\w+)\) is ([01x])/.exec(say);
    if (c && at(c[1], curT) !== c[2]) fail('frame ' + i + ': ' + c[1] + ' is ' + at(c[1], curT) + ' at ' + curT + ' ns, not ' + c[2]);
    const g = /gives ([01x]), which y already holds/.exec(say);
    if (g && (at('y', curT) !== g[1] || at('y', curT - 1e-6) !== g[1])) fail('frame ' + i + ': y does not hold ' + g[1] + ' at ' + curT + ' ns');
    if (say === prev) fail('frame ' + i + ' says the same as the frame before it: ' + say);
    prev = say;
    ctx.pass();
  });
  const last = T(r.frames[r.frames.length - 1].say);
  if (kind === 'nest' && /else if chain/.test(last)) fail('the nested ifs are summed up as an else if chain');
};

// casez, casex, case: our own matcher, label by label
per['vl-casez'] = (ctx, src, R) => {
  const { S, r, fail } = ctx;
  const K = S.Kit.code;
  const kw = (/\b(casez|casex|case)\s*\(/.exec(src) || [])[1];
  const ls = src.split('\n');
  const arms = ls.map((l, i) => { const m = /^\s*4'b([01xz?]{4})\s*:\s*n = 2'd(\d)/.exec(l); return m ? { line: i + 1, pat: m[1], n: +m[2] } : null; }).filter(Boolean);
  const match = (pat, v) => [...pat].every((p, j) => {
    const x = v[j];
    if (kw === 'case') return (p === '?' ? 'z' : p) === x;
    if (p === '?' || p === 'z' || x === 'z') return true;
    if (kw === 'casex' && (p === 'x' || x === 'x')) return true;
    return p === x;
  });
  const seenR = [];
  r.frames.forEach((f, i) => {
    const say = T(f.say);
    let m = /^At ([\d.]+) ns r becomes ([01xz]{4})/.exec(say);
    if (m) { seenR.push(m[2]); if (K.show(K.at(R.waves, 'tb.r', +m[1])) !== m[2]) fail('frame ' + i + ': r is not ' + m[2]); }
    m = /^Line (\d+): ([01xz?]{4}) against ([01xz]{4})\. (Every bit matches|Bit (\d) is (\S) in the label but (\S) in r)/.exec(say);
    if (m) {
      const arm = arms.find((a) => a.line === +m[1]);
      const ok = match(arm.pat, m[3]);
      if (ok !== (m[4] === 'Every bit matches')) fail('frame ' + i + ': ' + kw + ' label ' + arm.pat + ' against ' + m[3] + ' ' + (ok ? 'matches' : 'does not match'));
      if (m[5] !== undefined) { const j = 3 - +m[5]; if (arm.pat[j] !== m[6] || m[3][j] !== m[7]) fail('frame ' + i + ': bit ' + m[5] + ' is quoted wrongly'); }
      const w = /\((\d+) wildcard bits? in the label/.exec(say);
      if (w && +w[1] !== [...arm.pat].filter((p) => p === '?').length) fail('frame ' + i + ': ' + w[1] + ' wildcard bits in ' + arm.pat);
      ctx.pass();
    }
    m = /^(?:Line (\d+) runs|No label matched, so default runs): n = ([01x]{2}), any = ([01x])/.exec(say);
    if (m) {
      const rv = seenR[seenR.length - 1];
      const hit = arms.find((a) => match(a.pat, rv));
      const wantLine = hit ? hit.line : undefined, wantN = hit ? bin(hit.n, 2) : '00', wantAny = hit ? '1' : '0';
      if ((m[1] ? +m[1] : undefined) !== wantLine || m[2] !== wantN || m[3] !== wantAny) fail('frame ' + i + ': for r = ' + rv + ' ' + kw + ' runs ' + (hit ? 'line ' + hit.line : 'default') + ' with n = ' + wantN + ', any = ' + wantAny + '; the narration: ' + say);
      const t = (r.frames.slice(0, i).reverse().map((g) => /^At ([\d.]+) ns r becomes/.exec(T(g.say))).find(Boolean) || [0, 0])[1];
      if (K.show(K.at(R.waves, 'tb.n', +t)) !== m[2] || K.show(K.at(R.waves, 'tb.any', +t)) !== m[3]) fail('frame ' + i + ': the simulation has n = ' + K.show(K.at(R.waves, 'tb.n', +t)));
      ctx.pass();
    }
  });
  // the closing words quote only values of r this run had, and only true claims about them
  const last = T(r.frames[r.frames.length - 1].say);
  for (const m of last.matchAll(/r = ([01xz]{4})/g)) if (!seenR.includes(m[1])) fail('the closing frame quotes r = ' + m[1] + ', which this run never had (' + seenR.join(', ') + ')');
  const pr = /r = ([01xz]{4}) matches line (\d+) even though line (\d+)/.exec(last);
  if (pr) { const a1 = arms.find((a) => a.line === +pr[2]), a2 = arms.find((a) => a.line === +pr[3]); if (!match(a1.pat, pr[1]) || !match(a2.pat, pr[1])) fail('the closing frame\'s priority example is false'); }
  if (kw === 'case' && /every value fell through/.test(last) && seenR.some((v) => arms.some((a) => match(a.pat, v)))) fail('the closing frame says every value fell through to default');
  ctx.pass();
};

// loops: the turns, and the result our own loop gives
per['vl-loops'] = (ctx, src, R) => {
  const { S, r, fail } = ctx;
  const K = S.Kit.code;
  const fn = /n = n \+ v\[i\]/.test(src) ? (v) => bin([...v].filter((b) => b === '1').length, 3) : /p = p \^ v\[i\]/.test(src) ? (v) => String([...v].filter((b) => b === '1').length & 1) : (v) => [...v].reverse().join('');
  const out = /n = n/.test(src) ? 'n' : /p = p/.test(src) ? 'p' : 'w';
  r.frames.forEach((f, i) => {
    const say = T(f.say);
    const tm = /^At ([\d.]+) ns/.exec(say);
    const turn = /Turn i = (\d): v\[\d\] = ([01])/.exec(say);
    if (turn && tm) { const v = K.show(K.at(R.waves, 'tb.v', +tm[1])); if (v[3 - +turn[1]] !== turn[2]) fail('frame ' + i + ': v[' + turn[1] + '] of ' + v + ' is not ' + turn[2]); else ctx.pass(); }
    if (f.predict && /when the loop has finished/.test(f.predict.ask)) { const v = /v = ([01]{4})/.exec(f.predict.ask)[1]; if (f.predict.answer !== fn(v)) fail('frame ' + i + ': the loop gives ' + fn(v) + ' for v = ' + v + ', the prediction says ' + f.predict.answer); else ctx.pass(); }
  });
  const fin = K.show(K.at(R.waves, 'tb.' + out, R.time)), v = K.show(K.at(R.waves, 'tb.v', R.time));
  if (fin !== fn(v)) fail('the simulator ends with ' + out + ' = ' + fin + ' for v = ' + v + ', our loop gives ' + fn(v));
  const m = /went round (\d+) times/.exec(T(r.frames[r.frames.length - 1].say));
  if (!m || +m[1] !== 4) fail('the loop goes round 4 times');
  ctx.pass();
};

// generate: a ripple-carry adder worked bit by bit
per['vl-generate'] = (ctx) => {
  const { r, input, fail } = ctx;
  const { n, a, b } = input;
  let c = 0;
  const bits = [];
  for (let k = 0; k < n; k++) { const x = (a >> k) & 1, y = (b >> k) & 1, s = x ^ y ^ c, co = (x & y) | (c & (x ^ y)); bits.push({ x, y, c, s, co }); c = co; }
  const sum = (a + b) % 2 ** n, co = (a + b) >> n;
  r.frames.forEach((f, i) => {
    const say = T(f.say);
    const m = /^bit\[(\d)\]\.f: a = ([01]), b = ([01]), carry in ([01]) gives s\[\d\] = ([01]) and carry out ([01])/.exec(say);
    if (m) { const q = bits[+m[1]]; if ([q.x, q.y, q.c, q.s, q.co].join('') !== m.slice(2, 7).join('')) fail('frame ' + i + ': bit ' + m[1] + ' is ' + JSON.stringify(q)); else ctx.pass(); }
    if (/which is the carry the adder before it gives out/.test(say)) fail('frame ' + i + ': the carry out is called the carry the adder before gives out');
  });
  const last = T(r.frames[r.frames.length - 1].say);
  const p = /prints "(\d+)\+(\d+) = (\d+), co ([01])"/.exec(last);
  if (!p || +p[1] !== a || +p[2] !== b || +p[3] !== sum || +p[4] !== co) fail('the closing frame prints ' + (p ? p[0] : 'nothing') + '; ' + a + ' + ' + b + ' in ' + n + ' bits is ' + sum + ', co ' + co);
  const nb = /needs (\d+) bits/.exec(last);
  if (co && (!nb || +nb[1] !== (a + b).toString(2).length)) fail('the sum ' + (a + b) + ' needs ' + (a + b).toString(2).length + ' bits');
  if (!co && nb) fail('the closing frame says the sum needs more bits, but it fits');
  ctx.pass();
};

// functions: what each call prints, worked out here
per['vl-func'] = (ctx, src, R) => {
  const { r, fail } = ctx;
  const f = /x \^ \(x >> 1\)/.test(src) ? (v) => v ^ (v >> 1) : /\{x\[1:0\], x\[3:2\]\}/.test(src) ? (v) => ((v & 3) << 2) | (v >> 2) : /~x \+ 4'd1/.test(src) ? (v) => (16 - v) & 15 : null;
  if (!f) return;
  for (const l of R.output) { const [x, y] = l.split(' -> '); if (bin(f(parseInt(x, 2)), 4) !== y) fail('"' + l + '": the function gives ' + bin(f(parseInt(x, 2)), 4)); else ctx.pass(); }
  const calls = (src.match(/^\s*try\(/gm) || []).length;
  const last = T(r.frames[r.frames.length - 1].say);
  const w = { 1: 'One', 2: 'Two', 3: 'Three' }[calls];
  if (!new RegExp('^(' + calls + '|' + w + ') calls?', 'i').test(last)) fail('the closing frame counts the calls wrongly: ' + last.slice(0, 30));
};

// hierarchy: a full adder's answers, row by row
per['vl-hier'] = (ctx, src, R) => {
  const { r, fail } = ctx;
  let wrong = 0;
  for (const l of R.output) { const [abc, cs] = l.split(' '); const s = [...abc].filter((x) => x === '1').length; if (cs !== bin(s, 2)) wrong++; }
  r.frames.forEach((f, i) => {
    const m = /prints "([01]{3}) ([01]{2})": a b ci = \1, co s = \2\. (Right|Wrong)/.exec(T(f.say));
    if (m) { const s = [...m[1]].filter((x) => x === '1').length; if ((m[3] === 'Right') !== (m[2] === bin(s, 2))) fail('frame ' + i + ': ' + m[1] + ' -> ' + m[2] + ' is called ' + m[3]); else ctx.pass(); }
    const nm = /^Named: (.*) — /.exec(T(f.say));
    if (nm && (nm[1].match(/\(/g) || []).length !== (nm[1].match(/\)/g) || []).length) fail('frame ' + i + ': the connections are quoted cut short: ' + nm[1]);
  });
  const last = T(r.frames[r.frames.length - 1].say);
  const m = /^(\d+) of (\d+) answers are wrong/.exec(last);
  if (wrong ? !m || +m[1] !== wrong || +m[2] !== R.output.length : !/^All \d+ rows are right/.test(last)) fail('the closing frame: ' + last.slice(0, 40) + '; ' + wrong + ' of ' + R.output.length + ' are wrong');
  ctx.pass();
};

// the detector of 1, 1, 0: our own state table, edge by edge
per['vl-fsm'] = (ctx, src, R) => {
  const { S, r, fail } = ctx;
  const K = S.Kit.code;
  const NEXT = { A: ['A', 'B'], B: ['A', 'C'], C: ['D', 'C'], D: ['A', 'B'] };
  let found = 0;
  r.frames.forEach((f, i) => {
    const say = T(f.say);
    const m = /^Edge at ([\d.]+) ns: the register loads the next state the logic had ready: ([A-D]) with x = ([01]) goes to ([A-D])\. z = ([01])/.exec(say);
    if (!m) return;
    if (NEXT[m[2]][+m[3]] !== m[4]) fail('frame ' + i + ': ' + m[2] + ' with x = ' + m[3] + ' goes to ' + NEXT[m[2]][+m[3]]);
    const st = K.num(K.at(R.waves, 'tb.dut.st', +m[1]));
    if ('ABCD'[st] !== m[4]) fail('frame ' + i + ': the simulation has state ' + 'ABCD'[st]);
    const z = K.show(K.at(R.waves, 'tb.z', +m[1]));
    if (z !== m[5] || z !== (m[4] === 'D' ? '1' : '0')) fail('frame ' + i + ': z = ' + z + ' after the edge into ' + m[4]);
    if (m[5] === '1') found++;
    ctx.pass();
  });
  const n = /z went to 1 (\d+) times?/.exec(T(r.frames[r.frames.length - 1].say));
  if (!n || +n[1] !== found) fail('the closing frame counts ' + (n && n[1]) + ' detections, the edges show ' + found);
};

// synthesis: the parts counted are the parts in the circuit
const countsOf = (S, src, top) => { const hw = S.Kit.code.hardware(src, { top }); const c = {}; if (hw.ok) for (const p of hw.circuit.parts) c[p.type] = (c[p.type] || 0) + 1; return { hw, c }; };
const NAMES = { 'flip-flop': 'DFF', 'AND gate': 'AND', 'OR gate': 'OR', 'inverter': 'NOT', 'XOR gate': 'XOR', 'multiplexer': 'MUX', 'NOT gate': 'NOT', 'latch': 'LATCH' };
function checkHas(ctx, say, c, what) {
  const m = /(?:circuit|finished circuit) has ([^.]*)\./.exec(say);
  if (!m) return;
  for (const part of m[1].split(/, | and /)) {
    const q = /^(\d+|an?|one) (.+?)s?$/.exec(part.trim());
    if (!q) continue;
    const type = NAMES[q[2]] || NAMES[q[2].replace(/s$/, '')];
    if (!type) continue;
    const n = /^\d+$/.test(q[1]) ? +q[1] : 1;
    if ((c[type] || 0) !== n) ctx.fail(what + ': the narration counts ' + n + ' ' + q[2] + ', the circuit has ' + (c[type] || 0));
    else ctx.pass();
  }
}
per['vl-fsm-synth'] = (ctx) => {
  const { S, r, input } = ctx;
  const src = S.byId('vl-fsm').presets.find((p) => p.label.toLowerCase().startsWith({ two: 'two', three: 'three', one: 'one' }[input.style])).values.src.split('\n\nmodule tb')[0];
  const { c } = countsOf(S, src, 'det');
  for (const f of r.frames) checkHas(ctx, T(f.say), c, input.style);
  const q = r.frames.find((f) => f.predict);
  if (q && +q.predict.answer !== (c.DFF || 0)) ctx.fail('the flip-flop prediction says ' + q.predict.answer + ', the circuit has ' + c.DFF);
};
// the listing drawn in a frame, read back from its tokens (each keyed by line and column)
const codeOf = (f) => {
  const ls = [];
  for (const it of f.items) { const m = /^code:tk:(\d+):(\d+)$/.exec(it.key || ''); if (!m) continue; const l = +m[1] - 1, c = +m[2]; ls[l] = (ls[l] || '').padEnd(c) + it.text; }
  return [...ls].map((l) => l || '').join('\n');
};
per['vl-synth'] = (ctx) => {
  const { S, r } = ctx;
  const src = codeOf(r.frames[0]);
  const top = (/module\s+(\w+)/.exec(src) || [])[1];
  const { hw, c } = countsOf(S, src, top);
  const built = r.frames.some((f) => /^It builds it/.test(T(f.say))), refused = r.frames.some((f) => /^It refuses/.test(T(f.say)));
  if (built !== !!hw.ok || refused === !!hw.ok) ctx.fail('the narration says the tool ' + (built ? 'builds' : 'refuses') + ' it, synthesis ' + (hw.ok ? 'builds' : 'refuses') + ' it');
  for (const f of r.frames) checkHas(ctx, T(f.say), c, 'synthesis');
  const q = r.frames.find((f) => f.predict);
  if (q && (q.predict.answer === 'no') === !!hw.ok) ctx.fail('the prediction answers ' + q.predict.answer);
  ctx.pass();
};

// testbenches: times, prints, and the counts at the end
per['vl-initial'] = (ctx, src, R) => {
  const { r, fail } = ctx;
  const last = T(r.frames[r.frames.length - 1].say);
  const m = /ended at ([\d.]+) ns with (\d+) lines? printed/.exec(last);
  if (!m || +m[1] !== R.time || +m[2] !== R.output.length) fail('the closing frame: ' + last.slice(0, 60) + '; the run ended at ' + R.time + ' with ' + R.output.length + ' lines');
  r.frames.forEach((f, i) => {
    if (!f.predict || !/At what time does its statement run/.test(f.predict.ask)) return;
    const nx = /^At ([\d.]+) ns, line/.exec(T(r.frames[i + 1].say));
    if (!nx || nx[1] + ' ns' !== f.predict.answer) fail('frame ' + i + ': the prediction answers ' + f.predict.answer + ', the line runs at ' + (nx && nx[1]));
    else ctx.pass();
  });
};
per['vl-selfcheck'] = (ctx, src, R) => {
  const { r, fail } = ctx;
  const body = (/assign s = (.*);/.exec(src) || [])[1] || '';
  const mod = (a, b) => (body === 'a + b' ? a + b : body === "{1'b0, a + b}" ? (a + b) & 3 : body === 'a | b' ? a | b : null);
  let bad = 0;
  const run = [];
  for (let i = 0; i < 16; i++) { const a = i >> 2, b = i & 3, s = mod(a, b); if (s !== a + b) bad++; run.push({ a, b, s, bad }); }
  if (mod(0, 0) === null) return;
  r.frames.forEach((f, i) => {
    const m = /^Pair (\d+): (\d) \+ (\d) should be (\d); s = (\d)\. (They agree|They differ: bad goes up to (\d+))/.exec(T(f.say));
    if (!m) return;
    const q = run[+m[1] - 1];
    if (q.a !== +m[2] || q.b !== +m[3] || +m[4] !== q.a + q.b || +m[5] !== q.s || (m[6] === 'They agree') !== (q.s === q.a + q.b) || (m[7] !== undefined && +m[7] !== q.bad)) fail('frame ' + i + ': ' + m[0] + '; ours: ' + JSON.stringify(q));
    else ctx.pass();
  });
  if (!R.output.includes(bad + ' errors')) fail('the testbench should print "' + bad + ' errors": ' + JSON.stringify(R.output));
};
per['vl-readmemh'] = (ctx) => {
  const { r, input, fail } = ctx;
  const words = [];
  let addr = 0;
  for (const l of String(input.file).split('\n')) for (const w of l.replace(/\/\/.*$/, '').trim().split(/\s+/).filter(Boolean)) { if (w[0] === '@') { addr = parseInt(w.slice(1), 16); continue; } words[addr++] = w; }
  let bad = 0;
  r.frames.forEach((f, i) => {
    const m = /^Row (\d): ([0-9a-f]) \+ ([0-9a-f]) gives s = ([0-9a-f]); the file says ([0-9a-f])\. (Pass|Mismatch)/.exec(T(f.say));
    if (!m) return;
    const w = words[+m[1]].padStart(3, '0');
    const a = parseInt(w[0], 16), b = parseInt(w[1], 16), want = parseInt(w[2], 16), s = (a + b) & 15;
    if (parseInt(m[2], 16) !== a || parseInt(m[3], 16) !== b || parseInt(m[4], 16) !== s || parseInt(m[5], 16) !== want || (m[6] === 'Pass') !== (s === want)) fail('frame ' + i + ': ' + m[0]);
    if (s !== want) bad++;
    ctx.pass();
  });
  const last = T(r.frames[r.frames.length - 1].say);
  if (bad ? !new RegExp('^' + bad + ' rows? did not match').test(last) : !/^All 4 rows passed/.test(last)) fail('the closing frame: ' + last.slice(0, 40) + '; ' + bad + ' rows fail');
};
per['vl-vcd'] = (ctx, src, R) => {
  const { S, r, fail } = ctx;
  const K = S.Kit.code;
  const vcd = S.Verilog.run(src, {}).vcd() || '';
  const ls = vcd.replace(/\n+$/, '').split('\n');
  const last = T(r.frames[r.frames.length - 1].say);
  const m = /dump is (\d+) lines for ([\d.]+) ns of simulation: (\d+) value lines? under (\d+) time marks?/.exec(last);
  const vals = ls.filter((l, i) => i > ls.findIndex((x) => /\$enddefinitions/.test(x)) && /^[01xz]/.test(l)).length, marks = ls.filter((l) => /^#\d+/.test(l)).length;
  if (!m || +m[1] !== ls.length || +m[3] !== vals || +m[4] !== marks) fail('the closing frame: ' + last.slice(0, 90) + '; the dump has ' + ls.length + ' lines, ' + vals + ' values, ' + marks + ' marks');
  const off = /\$dumpoff/.test(src);
  r.frames.forEach((f, i) => {
    const t = /^#(\d+): ((?:\w+ = [01xz](?:, )?)+)\./.exec(T(f.say));
    if (!t || off) return;
    for (const kv of t[2].split(', ')) { const [n, v] = kv.split(' = '); if (K.show(K.at(R.waves, 'tb.' + n, +t[1])) !== v) fail('frame ' + i + ': ' + n + ' = ' + v + ' at #' + t[1]); else ctx.pass(); }
  });
};
per['vl-roundtrip'] = (ctx) => {
  const { S, r, input, fail } = ctx;
  const fn = S.Bool.fromExpr(S.Bool.parse(input.f));
  r.frames.forEach((f, i) => {
    const m = /^Input ([01]{3}): drawn gives ([01]), written gives ([01])/.exec(T(f.say));
    if (!m) return;
    const v = fn.ones.has(parseInt(m[1], 2)) ? '1' : '0';
    if (m[2] !== v || m[3] !== v) fail('frame ' + i + ': F(' + m[1] + ') = ' + v);
    else ctx.pass();
  });
};

export default {
  family: /^p12-/,
  extra: {
    'vl-assign': ['lost', 'kept', 'cat', 'scmp', 'mcmp', 'shift'].flatMap((k) => [[0, 0], [15, 15], [7, 9], [8, 1], [3, 12], [5, 2]].map(([a, b]) => ({ k, a, b }))),
    'vl-generate': [{ n: 2, a: 1, b: 1 }, { n: 3, a: 7, b: 1 }, { n: 4, a: 15, b: 15 }, { n: 5, a: 0, b: 0 }, { n: 5, a: 31, b: 1 }, { n: 4, a: 3, b: 4 }],
    'vl-module': [{ src: 'module agree(input a, b, c,\n             output y);\n  assign y = a&b | b&c | a&c;\nendmodule\n\nmodule tb;\n  reg a, b, c;\n  wire y;\n  agree dut(a, b, c, y);\n  initial begin\n    a = 1; b = 1; c = 0;\n    #10 c = 1;\n    #10 a = 0;\n    #10 $finish;\n  end\nendmodule' }],
  },
  random: {
    'vl-assign': (rnd) => ({ k: ['lost', 'kept', 'cat', 'scmp', 'mcmp', 'shift'][Math.floor(rnd() * 6)], a: Math.floor(rnd() * 16), b: Math.floor(rnd() * 16) }),
    'vl-generate': (rnd) => { const n = 2 + Math.floor(rnd() * 4); return { n, a: Math.floor(rnd() * 2 ** n), b: Math.floor(rnd() * 2 ** n) }; },
  },
  check(ctx) {
    const { S, tp, input } = ctx;
    wavesReach(ctx);
    const s = sourceOf(S, tp, input);
    let R = null;
    if (s) {
      R = S.Kit.code.run(s.src, {});
      if (!R.ok) return;
      generic(ctx, s.src, R, {});
    }
    // the readmemh testbench reads a file: its run and its quoted output, from the listing and the file
    if (tp.id === 'vl-readmemh') {
      const src = codeOf(ctx.r.frames[0]);
      const RR = S.Kit.code.run(src, { files: { 'vec.hex': String(input.file) } });
      if (RR.ok) generic(ctx, src, RR, {});
    }
    if (per[tp.id]) per[tp.id](ctx, s && s.src, R);
  },
};
