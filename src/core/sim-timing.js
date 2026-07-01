// Static timing analysis, glitch finding and VCD export.
//
// sta(circuit, { tech, k }) traces the combinational logic between the starting points (inputs at 0 ns,
// flip-flop outputs a clock-to-Q after the clock reaches them) and the end points (outputs, and flip-flop
// data inputs, which must arrive a setup time before the next edge). Every part counts at its worst delay,
// max(tpLH, tpHL). It returns the critical path, the minimum clock period and maximum frequency, the hold
// slack of the shortest register-to-register paths, the combinational loops it had to cut, and a trace
// that walks each path hop by hop.
(function (S) {
  'use strict';
  const Sim = S.Sim = S.Sim || {};
  const r3 = (x) => Math.round(x * 1000) / 1000;

  function sta(circuit, opts) {
    opts = opts || {};
    const C = Sim.compile(circuit, opts), tech = C.tech;
    const { nets, parts } = C;
    const drivers = nets.map((n) => n.drivers);
    const worst = (pt) => Math.max(pt.lh || 0, pt.hl || 0);
    const best = (pt) => Math.min(pt.lh || 0, pt.hl || 0);
    const clockPin = (pt) => { const sq = pt.spec.seq; if (!sq) return null; const c = sq.clock && (!sq.when || sq.when(pt.p)) ? sq.clock : sq.check; return c ? pt.ins.find((q) => q.name === c) : null; };
    const loops = [];

    /** arrival times: the latest (or earliest, with min) time each net can change, and how it got there */
    function arrivals(min) {
      const arr = new Float64Array(nets.length).fill(NaN), pred = new Array(nets.length).fill(null), state = new Uint8Array(nets.length);
      const pick = (a, b) => (min ? a < b : a > b);
      const none = min ? Infinity : -Infinity;
      function visit(n) {
        if (state[n] === 2) return arr[n];
        if (state[n] === 1) { if (!min) loops.push(n); return none; }
        state[n] = 1;
        let best1 = none, how = null;
        for (const d of drivers[n]) {
          const pt = parts[d.part];
          const cand = (t, from, delay, kind) => { if (pick(t, best1) || how === null && t === best1 && t !== none) { best1 = t; how = { part: pt, pin: d.pin, from, delay, kind }; } };
          if (pt.kind === 'source') {
            if (pt.type === 'IN' || pt.type === 'SWITCH' || pt.type === 'BUTTON') cand(0, null, 0, 'input');
            else if (pt.type === 'CLOCK') cand(0, null, 0, 'clock');
            continue;
          }
          if (pt.kind === 'sink') continue;
          if (pt.spec.seq) {
            const ck = clockPin(pt), tcq = min ? best(pt) : worst(pt);
            if (ck && pt.spec.seq.clock && (!pt.spec.seq.when || pt.spec.seq.when(pt.p))) { const t = visit(ck.net); if (t !== none) cand(t + tcq, ck.net, tcq, 'clock-to-Q'); }
            if (pt.spec.level && !pt.spec.edge) {
              // a latch: transparent from D and from its enable
              for (const q of pt.ins) { const t = visit(q.net); if (t !== none) cand(t + tcq, q.net, tcq, q.name === (ck && ck.name) ? 'enable-to-Q' : 'D-to-Q'); }
            }
            if (pt.ta) for (const q of pt.ins.filter((x) => x.name === 'a')) { const t = visit(q.net); if (t !== none) cand(t + pt.ta, q.net, pt.ta, 'access'); }
            continue;
          }
          const dl = min ? best(pt) : worst(pt);
          for (const q of pt.ins) {
            if (q.power) continue;
            const t = visit(q.net);
            if (t !== none) cand(t + dl, q.net, dl, 'logic');
          }
        }
        state[n] = 2; arr[n] = best1; pred[n] = how;
        return best1;
      }
      for (let i = 0; i < nets.length; i++) visit(i);
      return { arr, pred };
    }
    const late = arrivals(false), early = arrivals(true);

    function path(A, n) {
      const steps = [];
      let cur = n, guard = 0;
      while (cur !== null && cur !== undefined && guard++ < 10000) {
        const h = A.pred[cur];
        steps.unshift({ net: nets[cur].name, at: r3(A.arr[cur]), part: h ? h.part.id : null, label: h ? h.part.label : null, delay: h ? r3(h.delay) : 0, kind: h ? h.kind : 'start' });
        cur = h ? h.from : null;
      }
      return steps;
    }
    // end points
    const ends = [];
    for (const pt of parts) {
      if (pt.kind === 'sink') for (const q of pt.ins) { const t = late.arr[q.net]; if (t > -Infinity) ends.push({ kind: 'output', to: pt.p.name || pt.id, net: q.net, delay: r3(t), need: r3(t) }); }
      if (pt.spec.seq) {
        const ck = clockPin(pt);
        if (!ck) continue;
        const sq = pt.spec.seq, data = (sq.data ? sq.data(pt.p) : []);
        const clk = late.arr[ck.net] > -Infinity ? late.arr[ck.net] : 0, clkE = early.arr[ck.net] < Infinity ? early.arr[ck.net] : 0;
        for (const q of pt.ins.filter((x) => data.includes(x.name))) {
          const t = late.arr[q.net];
          if (!(t > -Infinity)) continue;
          const steps = path(late, q.net);
          const fromReg = steps.some((s) => s.kind === 'clock-to-Q');
          ends.push({ kind: 'setup', to: pt.label + ' ' + q.name, part: pt.id, pin: q.name, net: q.net, delay: r3(t), tsu: pt.tsu, clock: r3(clk), need: r3(t + pt.tsu - clk), fromReg, steps });
          const te = early.arr[q.net];
          if (te < Infinity && fromReg) ends.hold = (ends.hold || []).concat([{ to: pt.label + ' ' + q.name, part: pt.id, pin: q.name, arrival: r3(te), th: pt.th, slack: r3(te - clkE - pt.th), steps: path(early, q.net) }]);
        }
      }
    }
    for (const e of ends) if (!e.steps) e.steps = path(late, e.net);
    const hold = ends.hold || [];
    const outputs = ends.filter((e) => e.kind === 'output'), setups = ends.filter((e) => e.kind === 'setup');
    const comb = outputs.reduce((m, e) => (m && m.delay >= e.delay ? m : e), null);
    const regs = setups.filter((e) => e.fromReg);
    const limiting = (regs.length ? regs : setups).reduce((m, e) => (m && m.need >= e.need ? m : e), null);
    const tmin = limiting ? limiting.need : null;
    const critical = limiting && (!comb || limiting.need >= comb.delay || regs.length) ? limiting : comb;
    const sorted = ends.slice().sort((a, b) => b.need - a.need);
    const loopNames = [...new Set(loops)].map((n) => nets[n].name);

    // the trace, path by path
    const trace = [];
    trace.push({ kind: 'start', say: 'Timing with the ' + tech.label + ' preset: ' + outputs.length + ' output' + (outputs.length === 1 ? '' : 's') + ' and ' + setups.length + ' flip-flop input' + (setups.length === 1 ? '' : 's') + ' to check; each part counts at its slower delay.', tech: tech.name });
    if (loopNames.length) trace.push({ kind: 'loops', say: 'The logic has feedback loops (through ' + loopNames.slice(0, 6).join(', ') + '); each loop is cut where the trace met it.', nets: loopNames });
    for (const e of sorted.slice(0, opts.k || 8)) {
      const st = e.steps;
      trace.push({ kind: 'path', say: 'Path to ' + e.to + ': ' + st.map((s, i) => (i ? s.label + ' +' + s.delay : s.net + ' at ' + s.at + ' ns')).join(' → ') + ' = ' + e.delay + ' ns' + (e.kind === 'setup' ? '; with the ' + e.tsu + ' ns setup time' + (e.clock ? ' and the clock arriving at ' + e.clock + ' ns' : '') + ' it needs a period of ' + e.need + ' ns.' : '.'), to: e.to, delay: e.delay, need: e.need, steps: st });
      for (const s of st.slice(1)) trace.push({ kind: 'hop', say: s.label + ' (' + s.kind + ') adds ' + s.delay + ' ns: ' + s.net + ' settles by ' + s.at + ' ns.', net: s.net, part: s.part, delay: s.delay, at: s.at });
    }
    if (comb) trace.push({ kind: 'comb', say: 'The longest path to an output takes ' + comb.delay + ' ns (to ' + comb.to + ').', delay: comb.delay });
    if (tmin !== null) trace.push({ kind: 'fmax', say: 'The clock period must be at least ' + tmin + ' ns (clock-to-Q + logic + setup' + (limiting.clock ? ' − clock arrival' : '') + '), so the maximum clock frequency is ' + r3(1000 / tmin) + ' MHz.', tmin, fmax: r3(1000 / tmin) });
    for (const h of hold.filter((x) => x.slack < 0)) trace.push({ kind: 'hold', say: 'Hold problem at ' + h.to + ': the shortest path arrives ' + h.arrival + ' ns after the clock, but it must not change until ' + h.th + ' ns after (slack ' + h.slack + ' ns).', slack: h.slack });

    return {
      tech: tech.name, critical, comb: comb ? comb.delay : null, tmin, fmax: tmin ? r3(1000 / tmin) : null,
      paths: sorted, hold, loops: loopNames, trace,
      arrival: (name) => { const n = C.names.get(name); return n === undefined ? null : r3(late.arr[n]); },
    };
  }
  Sim.sta = sta;

  /** pulses narrower than minWidth ns on every recorded net: [{net, t, width, from, to}] */
  Sim.glitches = function (waves, minWidth) {
    const V = S.Values, out = [];
    for (const [net, w] of waves) {
      const ch = [];
      for (const e of w) { if (ch.length && ch[ch.length - 1][0] === e[0]) ch[ch.length - 1] = e; else ch.push(e); }
      for (let i = 1; i + 1 < ch.length; i++) {
        const width = r3(ch[i + 1][0] - ch[i][0]);
        if (width < minWidth && V.eq(ch[i - 1][1], ch[i + 1][1]) && !V.eq(ch[i][1], ch[i - 1][1])) out.push({ net, t: ch[i][0], width, from: ch[i - 1][1], to: ch[i][1] });
      }
    }
    return out.sort((a, b) => a.t - b.t);
  };

  /**
   * VCD text from waves (a Map name -> [[t ns, value], ...], as sim.waves). timescale: '1ns', '100ps',
   * '10ps' or '1ps'; by default the coarsest one that holds every time exactly.
   */
  Sim.vcd = function (waves, o) {
    o = o || {};
    const units = { '1ns': 1, '100ps': 0.1, '10ps': 0.01, '1ps': 0.001 };
    let ts = o.timescale;
    if (!ts) {
      ts = '1ps';
      for (const k of ['1ns', '100ps', '10ps', '1ps']) {
        let ok = true;
        for (const w of waves.values()) { for (const [t] of w) { const x = t / units[k]; if (Math.abs(x - Math.round(x)) > 1e-6) { ok = false; break; } } if (!ok) break; }
        if (ok) { ts = k; break; }
      }
    }
    const u = units[ts] || 1;
    const id = (i) => { let s = ''; i++; while (i > 0) { i--; s = String.fromCharCode(33 + (i % 94)) + s; i = Math.floor(i / 94); } return s; };
    const list = [...waves.entries()].map(([name, w], i) => ({ name, w, id: id(i), width: Array.isArray(w[0] && w[0][1]) ? w[0][1].length : 1 }));
    const val = (v, sig) => {
      if (sig.width === 1 && !Array.isArray(v)) return String(v).toLowerCase() + sig.id;
      const bits = (Array.isArray(v) ? v : [v]).slice().reverse().map((b) => String(b).toLowerCase()).join('');
      return 'b' + bits + ' ' + sig.id;
    };
    const clean = (s) => String(s).replace(/[^A-Za-z0-9_.$\[\]#/-]/g, '_').replace(/\//g, '.');
    const lines = [];
    lines.push('$date ' + (o.date || 'today') + ' $end', '$version Sirkit $end', '$timescale ' + ts + ' $end', '$scope module ' + clean(o.scope || 'top') + ' $end');
    for (const s of list) lines.push('$var wire ' + s.width + ' ' + s.id + ' ' + clean(s.name) + ' $end');
    lines.push('$upscope $end', '$enddefinitions $end');
    // merge every change in time order (the last value at a time wins)
    const at = new Map();
    for (const s of list) for (const [t, v] of s.w) { const k = Math.round(t / u); if (!at.has(k)) at.set(k, new Map()); at.get(k).set(s, v); }
    const times = [...at.keys()].sort((a, b) => a - b);
    let first = true;
    for (const k of times) {
      lines.push('#' + k);
      if (first) lines.push('$dumpvars');
      for (const [s, v] of at.get(k)) lines.push(val(v, s));
      if (first) { lines.push('$end'); first = false; }
    }
    return lines.join('\n') + '\n';
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
