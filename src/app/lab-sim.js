// The lab bench's simulator. The breadboard is turned into nets (a strip of five holes, a rail, a terminal of
// the trainer panel, joined by jumpers), and the nets are driven by the supply, the switches, the clock and the
// chips' outputs. When Sirkit.Sim is loaded the bench runs on it (each chip as the parts engine's own IC part);
// until then it runs on the small event-driven simulator here, which keeps the same rules: a chip without power
// lets its outputs float, an open input reads 1 on TTL and X on CMOS, two outputs that disagree make X.
// Time is real time: one second of the bench is 1e9 ns of the simulation.
(function (S) {
  'use strict';
  const LS = S.LabSim = {};
  const TPD = 10; // ns, every chip output

  /**
   * spec: { nets: [name...], vcc, gnd (net indexes, or -1), short (supply shorted), switches: [{name, net, v}],
   *         clock: {net, period}, chips: [{id, num, powered, pins: {name: net index or -1}}] }
   */
  class BenchSim {
    constructor(spec, opts) {
      this.spec = spec; this.floatHigh = !!(opts && opts.floatHigh); this.engine = 'bench';
      this.time = 0; this.queue = []; this.seq = 0; this.violations = [];
      const N = spec.nets.length;
      this.drv = Array.from({ length: N }, () => new Map());
      this.val = new Array(N).fill('z');
      this.wave = Array.from({ length: N }, () => [[0, 'z']]);
      this.readers = Array.from({ length: N }, () => []);
      this.chips = spec.chips.map((c) => ({ c, def: S.LabChips.get(c.num), st: {}, last: {} }));
      for (const k of this.chips) for (const [pn, n] of Object.entries(k.c.pins)) if (n >= 0 && k.def.pins.find((q) => q.name === pn).dir === 'in') this.readers[n].push(k);
      // the sources drive at once
      const sv = spec.short ? 'x' : null;
      if (spec.vcc >= 0) this.drive(spec.vcc, 'supply', sv || '1', 0);
      if (spec.gnd >= 0) this.drive(spec.gnd, 'supply-', sv || '0', 0);
      for (const s of spec.switches) if (s.net >= 0) this.drive(s.net, s.name, s.v ? '1' : '0', 0);
      if (spec.clock && spec.clock.net >= 0) { this.drive(spec.clock.net, 'clock', '0', 0); this.nextClock = spec.clock.period / 2; this.clockV = '0'; } else this.nextClock = Infinity;
      for (const k of this.chips) this.evalChip(k, true);
      this.settle();
    }
    drive(net, key, v, d) { this.queue.push({ t: this.time + d, net, key, v, seq: ++this.seq }); }
    read(n) { if (n < 0) return this.floatHigh ? '1' : 'x'; const v = this.val[n]; return v === 'z' ? (this.floatHigh ? '1' : 'x') : v; }
    evalChip(k, first) {
      const { c, def } = k;
      const outs = {};
      if (c.powered) def.fn((pn) => this.read(c.pins[pn] == null ? -1 : c.pins[pn]), (pn, v) => { outs[pn] = v; }, k.st);
      for (const q of def.pins) {
        if (q.dir !== 'out') continue;
        const n = c.pins[q.name];
        if (n == null || n < 0) continue;
        const v = c.powered ? outs[q.name] || 'x' : 'z';
        if (k.last[q.name] === v) continue;
        k.last[q.name] = v;
        this.drive(n, c.id + '.' + q.name, v, first ? 0 : TPD);
      }
    }
    resolve(n) {
      let b = 'z';
      for (const v of this.drv[n].values()) { if (v === 'z') continue; if (b === 'z') b = v; else if (b !== v) b = 'x'; }
      return b;
    }
    /** the drivers of a net that are not floating, as [name, value] */
    drivers(n) { return [...this.drv[n].entries()].filter(([, v]) => v !== 'z'); }
    apply(ev) {
      this.time = Math.max(this.time, ev.t);
      this.drv[ev.net].set(ev.key, ev.v);
      const v = this.resolve(ev.net), before = this.val[ev.net];
      if (v === before) return;
      this.val[ev.net] = v;
      const w = this.wave[ev.net];
      if (w[w.length - 1][0] === this.time) w[w.length - 1][1] = v; else w.push([this.time, v]);
      if (w.length > 4000) w.splice(1, 1000);
      if (v === 'x' && this.drivers(ev.net).filter(([, d]) => d !== 'x').length > 1) this.violations.push({ t: this.time, kind: 'contention', net: ev.net, say: 'Two outputs disagree on ' + this.spec.nets[ev.net] + ' at ' + (this.time / 1e9).toFixed(2) + ' s, so it reads X.' });
      if (this.violations.length > 200) this.violations.splice(0, 100);
      for (const k of this.readers[ev.net]) this.evalChip(k);
    }
    next() { let e = null; for (const x of this.queue) if (!e || x.t < e.t || (x.t === e.t && x.seq < e.seq)) e = x; return e; }
    settle() { for (let n = 0; this.queue.length && n < 20000; n++) { const e = this.next(); this.queue.splice(this.queue.indexOf(e), 1); this.apply(e); } }
    run(ns) {
      const end = this.time + ns;
      for (let guard = 0; guard < 200000; guard++) {
        const e = this.next(), tc = this.nextClock;
        if ((!e || e.t > end) && tc > end) break;
        if (e && e.t <= tc) { this.queue.splice(this.queue.indexOf(e), 1); this.apply(e); }
        else {
          this.time = tc; this.clockV = this.clockV === '1' ? '0' : '1';
          this.drive(this.spec.clock.net, 'clock', this.clockV, 0);
          this.nextClock = tc + this.spec.clock.period / 2;
        }
      }
      this.time = end;
    }
    set(name, v) { const s = this.spec.switches.find((x) => x.name === name); if (!s) return; s.v = v; if (s.net >= 0) { this.drive(s.net, name, v ? '1' : '0', 0); this.run(0); } }
    value(n) { return n < 0 ? 'z' : this.val[n]; }
    waves(n) { return this.wave[n]; }
  }
  LS.BenchSim = BenchSim;

  /**
   * The same bench on Sirkit.Sim: supply as constants, switches as inputs, the clock as a clock, every chip as
   * the parts engine's IC part (its VCC and GND pins wired like the rest). Returns an object with the bench
   * simulator's own methods, or null when the engine is not there or cannot take the circuit.
   */
  LS.onEngine = function (spec, opts) {
    if (!(S.Sim && S.Sim.create && S.Parts && S.Parts.registry && S.Parts.chips)) return null;
    try {
      const N = S.Netlist, c = new N.Circuit('bench');
      const nets = spec.nets.map((name, i) => ({ id: 'n' + (i + 1), name: 'N' + i, width: 1, pins: [], show: false }));
      const join = (part, pin, n) => { if (n == null || n < 0) return; nets[n].pins.push({ part, pin }); part.net[pin] = nets[n]; };
      const add = (type, params, id) => S.Doc.addPart(c, type, params, id);
      if (spec.vcc >= 0) join(add('CONST', { value: 1 }, 'vcc'), 'y', spec.vcc);
      if (spec.gnd >= 0) join(add('CONST', { value: 0 }, 'gnd'), 'y', spec.gnd);
      for (const s of spec.switches) if (s.net >= 0) join(add('IN', { name: s.name, value: s.v ? 1 : 0 }, 'in_' + s.name), 'y', s.net);
      if (spec.clock && spec.clock.net >= 0) join(add('CLOCK', { name: 'CLK', period: spec.clock.period, phase: spec.clock.period / 2 }, 'clk'), 'y', spec.clock.net);
      for (const ch of spec.chips) {
        const type = S.Parts.chips[ch.num];
        if (!type) return null;
        const part = add(type, {}, ch.id);
        for (const [pn, n] of Object.entries(ch.pins)) join(part, pn, n);
        join(part, 'VCC', ch.vccNet); join(part, 'GND', ch.gndNet);
      }
      for (const n of nets) c.nets.push(n);
      const sim = S.Sim.create(c, { tech: opts.tech, floatHigh: opts.floatHigh });
      const bit = (v) => { const s = S.Eng.bits(v, 1); return s; };
      const hist = nets.map(() => [[0, 'z']]);
      return {
        engine: 'Sirkit.Sim', spec, violations: sim.violations || [],
        get time() { return sim.time; },
        run(ns) { sim.run(ns); },
        set(name, v) { const s = spec.switches.find((x) => x.name === name); if (s) s.v = v; sim.set(name, v ? 1 : 0); },
        value(n) { if (n < 0) return 'z'; return bit(sim.get('N' + n)); },
        waves(n) { const w = sim.waves && sim.waves.get('N' + n); return w ? w.map(([t, v]) => [t, bit(v)]) : hist[n]; },
        drivers() { return []; },
      };
    } catch (e) { if (typeof console !== 'undefined') console.warn('the bench runs on its own simulator: ' + e.message); return null; }
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
