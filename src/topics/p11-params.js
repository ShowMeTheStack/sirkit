// Part 11, the parameters of a logic family: logic levels and noise margins on a voltage chart, the CMOS
// inverter's transfer curve swept point by point, fan-out as currents adding up, propagation delay measured on the
// simulator's waveform, and power with the speed-power product, static against dynamic.
(function (S) {
  'use strict';
  const C = () => S.Cmos, K = () => S.Kit, KC = () => S.Kit.cmos;
  const P11 = (S.P11 = S.P11 || {});
  const Geo = () => S.geom;
  const r2 = (v) => Math.round(v * 100) / 100;
  const r3 = (v) => Math.round(v * 1000) / 1000;
  // a voltage as the narration and the charts write it: up to three decimals, a true minus sign
  const V = (v) => (r3(v) < 0 ? '−' : '') + Math.abs(r3(v)) + ' V';
  // the second term of a subtraction, bracketed when it is negative: 2.4 V − (−1.1 V)
  const Vs = (v) => (r3(v) < 0 ? '(' + V(v) + ')' : V(v));

  S.family({ id: 'p11-params', part: 'ics', order: 10, title: 'Parameters of a family', blurb: 'Logic levels and noise margins, the transfer curve, fan-out, propagation delay, and power with the speed-power product.' });

  P11.familyKeys = ['TTL', 'LSTTL', 'HC', 'HCT', 'CMOS4000', 'ECL'];
  P11.familyOptions = (keys) => (keys || P11.familyKeys).map((k) => ({ value: k, label: C().FAMILIES[k].name }));

  /**
   * A voltage chart: the driver's output bands on the left, the receiver's input bands on the right, the noise
   * margins between them. o: {x, y, H, drv (family), rcv (family), show: {out, in, nmh, nml}, probe: {v, side,
   * cls}, hot: ['VOH', ...], prefix}
   */
  P11.levels = function (o) {
    const P = o.prefix || 'lv', X = o.x || 0, Y = o.y || 0, H = o.H || 330, d = o.drv, r = o.rcv, sh = o.show || {};
    const vals = [d.VOH, d.VOL, r.VIH, r.VIL];
    const ecl = vals.some((v) => v < 0);
    const vmin = ecl ? Math.floor(Math.min(...vals) - 0.3) : 0, vmax = ecl ? Math.ceil(Math.max(...vals) + 0.3) : Math.max(5, Math.ceil(Math.max(...vals)));
    const yOf = (v) => r2(Y + (vmax - v) * H / (vmax - vmin));
    const items = [];
    const ax = X + 34, oc = X + 160, cw = 120, mc = oc + cw + 14, mw = 56, ic = mc + mw + 14;
    items.push({ key: P + ':ax', kind: 'line', x1: ax, y1: Y, x2: ax, y2: Y + H, cls: 'axis', audit: 'ignore' });
    const step = (vmax - vmin) > 4 ? 1 : 0.5;
    for (let v = vmin; v <= vmax + 1e-9; v += step) {
      items.push({ key: P + ':tk:' + v, kind: 'line', x1: ax - 5, y1: yOf(v), x2: ax, y2: yOf(v), cls: 'axis', audit: 'ignore' });
      items.push({ key: P + ':tl:' + v, kind: 'text', x: ax - 9, y: yOf(v) + 4, text: String(r2(v)), anchor: 'end', cls: 'ax-l', size: 12 });
    }
    items.push({ key: P + ':unit', kind: 'text', x: ax, y: Y - 14, text: 'volts', anchor: 'middle', cls: 'ax-l', size: 12 });
    const band = (key, x, w, v1, v2, cls, text) => { const a = yOf(Math.max(v1, v2)), b = yOf(Math.min(v1, v2)); if (b - a < 1) return; items.push({ key: P + ':' + key, kind: 'cell', x, y: a, w, h: r2(b - a), rx: 0, text: b - a > 20 ? text : '', size: 13, cls: 'band ' + cls }); };
    const hot = new Set(o.hot || []);
    const lab = (key, x, v, text, anchor) => items.push({ key: P + ':l:' + key, kind: 'text', x, y: yOf(v) + 4, text, anchor, cls: 'lv-l' + (hot.has(key) ? ' hot' : ''), size: 12 });
    items.push({ key: P + ':h1', kind: 'text', x: oc + cw / 2, y: Y - 14, text: 'output: ' + o.drvName, anchor: 'middle', cls: 'title' });
    items.push({ key: P + ':h2', kind: 'text', x: ic + cw / 2, y: Y - 14, text: 'input: ' + o.rcvName, anchor: 'middle', cls: 'title' });
    if (sh.out) {
      band('o1', oc, cw, vmax, d.VOH, 'hi', 'a 1 is here');
      band('o0', oc, cw, d.VOL, vmin, 'lo', 'a 0 is here');
      lab('VOH', oc - 8, d.VOH, 'VOH ' + V(d.VOH), 'end');
      lab('VOL', oc - 8, d.VOL, 'VOL ' + V(d.VOL), 'end');
    }
    if (sh.in) {
      band('i1', ic, cw, vmax, r.VIH, 'hi', 'reads 1');
      band('ix', ic, cw, r.VIH, r.VIL, 'undef', 'indeterminate');
      band('i0', ic, cw, r.VIL, vmin, 'lo', 'reads 0');
      lab('VIH', ic + cw + 8, r.VIH, 'VIH ' + V(r.VIH), 'start');
      lab('VIL', ic + cw + 8, r.VIL, 'VIL ' + V(r.VIL), 'start');
    }
    const nmh = r2(d.VOH - r.VIH), nml = r2(r.VIL - d.VOL);
    // two failing margins can cover the same voltages: then each takes half the column
    const split = nmh < 0 || nml < 0, hw = split ? mw / 2 - 2 : mw;
    if (sh.nmh) band('nmh', mc, hw, d.VOH, r.VIH, nmh >= 0 ? 'margin' : 'fail', nmh >= 0 && !split ? 'NMH' : '');
    if (sh.nml) band('nml', split ? mc + mw / 2 + 2 : mc, hw, r.VIL, d.VOL, nml >= 0 ? 'margin' : 'fail', nml >= 0 && !split ? 'NML' : '');
    if (o.probe) {
      const pv = Math.max(vmin, Math.min(vmax, o.probe.v));
      items.push({ key: P + ':probe', kind: 'token', x: ic + cw / 2, y: yOf(pv), r: 8, cls: 'probe ' + (o.probe.cls || ''), text: '', audit: 'overlap-ok' });
    }
    return { items, yOf, box: { x: X, y: Y - 30, w: ic + cw + 100 - X, h: H + 40 }, nmh, nml, vmin, vmax };
  };

  /** read a voltage as an input of a family: '1', '0' or 'indeterminate' */
  P11.reads = (f, v) => (v >= f.VIH ? '1' : v <= f.VIL ? '0' : 'indeterminate');

  // ---------------------------------------------------------------------------------------------------------
  // Logic levels and noise margins
  // ---------------------------------------------------------------------------------------------------------
  S.topic({
    id: 'ic-levels', family: 'p11-params', order: 10, title: 'Logic levels and noise margins',
    blurb: 'An output promises to put a 1 above VOH and a 0 below VOL; an input promises to read anything above VIH as 1 and below VIL as 0. The gaps between the promises are the noise margins: how much noise a wire can pick up before a bit is misread.',
    inputs: [
      { id: 'fam', kind: 'choice', label: 'Family', def: 'TTL', options: P11.familyOptions() },
      { id: 'noise', kind: 'number', label: 'Noise on the wire (V)', def: 0.5, min: 0, max: 3, integer: false },
    ],
    presets: [
      { label: 'Standard TTL, 0.5 V of noise', values: { fam: 'TTL', noise: 0.5 } },
      { label: 'High-speed CMOS, 0.5 V', values: { fam: 'HC', noise: 0.5 } },
      { label: 'High-speed CMOS, 1.6 V', values: { fam: 'HC', noise: 1.6 } },
      { label: 'LS-TTL: unequal margins', values: { fam: 'LSTTL', noise: 0.5 } },
      { label: 'ECL: negative levels', values: { fam: 'ECL', noise: 0.1 } },
    ],
    run(inp) {
      const f = C().family(inp.fam), n = inp.noise;
      const chart = (show, extra) => P11.levels(Object.assign({ x: 0, y: 40, drv: f, rcv: f, drvName: inp.fam, rcvName: inp.fam, show }, extra || {})).items;
      const F = new S.Frames();
      F.add({ items: chart({ out: true }), say: f.name + ', ' + f.supply + '. A gate\'s output guarantees a 1 at VOH = ' + V(f.VOH) + ' or more and a 0 at VOL = ' + V(f.VOL) + ' or less, at its rated load.' });
      F.add({ items: chart({ out: true, in: true }), say: 'An input guarantees to read ' + V(f.VIH) + ' (VIH) or more as 1 and ' + V(f.VIL) + ' (VIL) or less as 0. Between them it promises nothing: the indeterminate band.' });
      F.add({ items: chart({ out: true, in: true, nmh: true }, { hot: ['VOH', 'VIH'] }), say: 'The high noise margin NMH = VOH − VIH = ' + V(f.VOH) + ' − ' + Vs(f.VIH) + ' = ' + V(f.NMH) + ': a 1 can lose that much on the wire and still be read as 1.' });
      const hi = f.VOH - n, lo = f.VOL + n;
      F.add({ items: chart({ out: true, in: true, nmh: true, nml: true }, { hot: ['VIL', 'VOL'] }), say: 'The low noise margin NML = VIL − VOL = ' + V(f.VIL) + ' − ' + Vs(f.VOL) + ' = ' + V(f.NML) + (Math.abs(f.NMH - f.NML) > 0.05 ? '. The margins differ: this family is weaker at one level than the other.' : '.'), meta: { ask: true, ans: P11.reads(f, hi) } });
      F.add({ items: chart({ out: true, in: true, nmh: true, nml: true }, { probe: { v: hi, from: f.VOH, cls: P11.reads(f, hi) === '1' ? 'good' : 'bad' } }), say: 'A 1 at the worst output level, ' + V(f.VOH) + ', picks up ' + V(n) + ' of noise downwards: it arrives at ' + V(hi) + ', which the input reads as ' + P11.reads(f, hi) + (P11.reads(f, hi) === '1' ? ', safely (the noise is within NMH).' : ': the noise is larger than NMH = ' + V(f.NMH) + '.') });
      F.add({ items: chart({ out: true, in: true, nmh: true, nml: true }, { probe: { v: lo, from: f.VOL, cls: P11.reads(f, lo) === '0' ? 'good' : 'bad' } }), say: 'A 0 at ' + V(f.VOL) + ' pushed up by ' + V(n) + ' arrives at ' + V(lo) + ': read as ' + P11.reads(f, lo) + '. The family is as noise-proof as its smaller margin, ' + V(Math.min(f.NMH, f.NML)) + '.', mark: 'end' });
      return { frames: F.list, def: { sections: [{ id: 'd', kind: 'math', title: f.name, text: ['VOH = ' + V(f.VOH) + '   VIH = ' + V(f.VIH), 'VIL = ' + V(f.VIL) + '   VOL = ' + V(f.VOL), '', 'NMH = VOH − VIH = ' + V(f.NMH), 'NML = VIL − VOL = ' + V(f.NML)].join('\n') }] } };
    },
    predict: [{ at: (f) => f.meta && f.meta.ask, pick: 'option', options: ['1', 'indeterminate', '0'], ask: 'A 1 at VOH loses the given noise on the way. How does the input read it?', answer: (fr, i) => fr[i].meta.ans, explain: (fr, i) => fr[i + 1].say }],
    quiz: [
      { q: 'The high noise margin is…', options: ['VIH − VIL', 'VOH − VIH', 'VOH − VOL', 'VCC − VOH'], answer: 1, why: 'How far a worst-case 1 can fall before it is no longer a guaranteed 1 at the input.' },
      { q: 'For standard TTL (VOH 2.4, VIH 2.0, VIL 0.8, VOL 0.4), the noise margins are…', options: ['0.4 V each', '2.0 V and 0.8 V', '1.6 V each', '0.8 V each'], answer: 0, why: '2.4 − 2.0 and 0.8 − 0.4.' },
      { q: 'A voltage between VIL and VIH at an input is…', options: ['read as 0', 'read as 1', 'not guaranteed to be read either way', 'a short'], answer: 2, why: 'The input makes no promise there.' },
      { q: 'Why do CMOS families have larger noise margins than TTL at 5 V?', options: ['They are slower', 'Their outputs swing almost rail to rail and their input thresholds sit near the middle', 'They use more power', 'They have open-collector outputs'], answer: 1, why: 'VOH near 5 V, VOL near 0 V, thresholds near 2.5 V.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------
  // The transfer curve of the CMOS inverter
  // ---------------------------------------------------------------------------------------------------------
  /** the voltage transfer curve as a chart: o = {x, y, W, H, res (Cmos.vtc), upto (vin), marks: {VIL, VIH, VM}} */
  P11.vtcChart = function (o) {
    const P = o.prefix || 'vc', X = o.x || 0, Y = o.y || 0, W = o.W || 360, H = o.H || 300, res = o.res, vdd = res.params.vdd;
    const xOf = (v) => r2(X + 40 + (v / vdd) * W), yOf = (v) => r2(Y + H - (v / vdd) * H);
    const items = [];
    items.push({ key: P + ':ax', kind: 'line', x1: xOf(0), y1: yOf(0), x2: xOf(vdd) + 10, y2: yOf(0), cls: 'axis', audit: 'ignore' });
    items.push({ key: P + ':ay', kind: 'line', x1: xOf(0), y1: yOf(0), x2: xOf(0), y2: yOf(vdd) - 10, cls: 'axis', audit: 'ignore' });
    items.push({ key: P + ':xl', kind: 'text', x: xOf(vdd), y: yOf(0) + 36, text: 'Vin (V)', anchor: 'end', cls: 'ax-l', size: 12 });
    items.push({ key: P + ':yl', kind: 'text', x: xOf(0) - 8, y: yOf(vdd) - 26, text: 'Vout (V)', anchor: 'start', cls: 'ax-l', size: 12 });
    for (let v = 0; v <= vdd + 1e-9; v += vdd > 3 ? 1 : 0.5) {
      items.push({ key: P + ':tx' + v, kind: 'text', x: xOf(v), y: yOf(0) + 18, text: String(r2(v)), anchor: 'middle', cls: 'ax-l', size: 12 });
      if (v > 0) items.push({ key: P + ':ty' + v, kind: 'text', x: xOf(0) - 8, y: yOf(v) + 4, text: String(r2(v)), anchor: 'end', cls: 'ax-l', size: 12 });
    }
    // the diagonal Vout = Vin, where the threshold lies
    if (o.marks && o.marks.VM) items.push({ key: P + ':diag', kind: 'line', x1: xOf(0), y1: yOf(0), x2: xOf(vdd), y2: yOf(vdd), cls: 'level', audit: 'ignore' });
    const pts = res.points.filter((p, i) => i % 10 === 0 || i === res.points.length - 1);
    const upto = o.upto === undefined ? vdd : o.upto;
    for (let i = 1; i < pts.length; i++) {
      const past = pts[i][0] <= upto + 1e-9;
      items.push({ key: P + ':c' + i, kind: 'line', x1: xOf(pts[i - 1][0]), y1: yOf(pts[i - 1][1]), x2: xOf(pts[i][0]), y2: yOf(pts[i][1]), cls: 'curve' + (past && o.upto !== undefined ? ' past' : ''), audit: 'ignore', opacity: past ? 1 : 0.25 });
    }
    const m = o.marks || {};
    const vline = (key, v, label, side) => {
      items.push({ key: P + ':v' + key, kind: 'line', x1: xOf(v), y1: yOf(0), x2: xOf(v), y2: yOf(vdd), cls: 'level hot', audit: 'ignore' });
      items.push({ key: P + ':vl' + key, kind: 'text', x: xOf(v) + (side < 0 ? -4 : 4), y: yOf(vdd) - 4 - (side < 0 ? 0 : 0), text: label, anchor: side < 0 ? 'end' : 'start', cls: 'lv-l hot', size: 12 });
    };
    if (m.VIL) vline('il', res.VIL, 'VIL ' + V(res.VIL), -1);
    if (m.VIH) vline('ih', res.VIH, 'VIH ' + V(res.VIH), 1);
    const dot = (key, vin, vout, cls) => items.push({ key: P + ':p' + key, kind: 'token', x: xOf(vin), y: yOf(vout), r: 6, cls: 'probe ' + (cls || ''), text: '', audit: 'overlap-ok' });
    if (m.VIL) dot('il', res.VIL, res.VOH, 'good');
    if (m.VIH) dot('ih', res.VIH, res.VOL, 'good');
    if (m.VM) dot('vm', res.VM, res.VM, '');
    if (o.cursor !== undefined) { const p = res.points.reduce((a, q) => (Math.abs(q[0] - o.cursor) < Math.abs(a[0] - o.cursor) ? q : a)); dot('cur', p[0], p[1], ''); }
    return { items, box: { x: X, y: Y - 40, w: W + 60, h: H + 80 }, xOf, yOf };
  };
  S.topic({
    id: 'ic-vtc', family: 'p11-params', order: 20, title: 'The transfer curve of a CMOS inverter',
    blurb: 'Sweep the input voltage of an inverter from 0 to VDD and plot the output. Where the slope reaches −1 are VIL and VIH; where Vout = Vin is the switching threshold. Change the transistor sizes and the supply, and watch the curve and the margins move.',
    inputs: [
      { id: 'ratio', kind: 'number', label: 'Strength ratio kp/kn', def: 1, min: 0.1, max: 10, integer: false },
      { id: 'vdd', kind: 'number', label: 'Supply VDD (V)', def: 5, min: 1.5, max: 6, integer: false },
      { id: 'vt', kind: 'number', label: 'Threshold |Vt| (V)', def: 0.7, min: 0.2, max: 1.5, integer: false },
    ],
    check: (inp) => (inp.vt * 2 >= inp.vdd ? 'The supply must be more than twice the threshold voltage, or the inverter never switches cleanly' : null),
    presets: [
      { label: 'Matched transistors, 5 V', values: { ratio: 1, vdd: 5, vt: 0.7 } },
      { label: 'Weak pMOS (kp/kn = 0.4)', values: { ratio: 0.4, vdd: 5, vt: 0.7 } },
      { label: 'Strong pMOS (kp/kn = 3)', values: { ratio: 3, vdd: 5, vt: 0.7 } },
      { label: 'Low supply, 3.3 V', values: { ratio: 1, vdd: 3.3, vt: 0.7 } },
    ],
    run(inp) {
      const res = C().vtc({ vdd: inp.vdd, vtn: inp.vt, vtp: -inp.vt, kn: 1, kp: inp.ratio });
      const vdd = inp.vdd;
      const inv = C().cells.inverter(), L = KC().layout(inv.net);
      const cx = 470;
      const cellAt = (vin) => {
        const n = vin > inp.vt, p = vin < vdd - inp.vt;
        return KC().draw(L, null, { x: cx, y: 30, mark: { M1: n ? 'on' : 'off', M2: p ? 'on' : 'off' }, plain: true }).items;
      };
      const F = new S.Frames();
      const chart = (o) => P11.vtcChart(Object.assign({ x: 0, y: 30, res }, o)).items;
      const region = (vin) => {
        const n = vin <= inp.vt ? 'off' : 'on', p = vin >= vdd - inp.vt ? 'off' : 'on';
        if (n === 'off') return 'the nMOS is off (Vin below its threshold ' + V(inp.vt) + '), the pMOS is on: Vout = VDD = ' + V(vdd);
        if (p === 'off') return 'the pMOS is off (VDD − Vin below its threshold), the nMOS is on: Vout = 0 V';
        return 'both conduct and fight; Vout sits where their currents are equal';
      };
      const vout = (vin) => res.points.reduce((a, q) => (Math.abs(q[0] - vin) < Math.abs(a[0] - vin) ? q : a))[1];
      F.add({ items: chart({ upto: 0, cursor: 0 }).concat(cellAt(0)), say: 'An inverter at VDD = ' + V(vdd) + ', transistor thresholds ' + V(inp.vt) + ', ' + (inp.ratio === 1 ? 'the pMOS as strong as the nMOS' : 'the pMOS ' + inp.ratio + ' times as strong as the nMOS (kp/kn = ' + inp.ratio + ')') + '. Start with Vin = 0: ' + region(0) + '.' });
      const steps = [0.15, 0.35, 0.45, 0.5, 0.55, 0.65, 0.85, 1].map((k) => r2(k * vdd));
      steps.forEach((vin, j) => F.add({ items: chart({ upto: vin, cursor: vin }).concat(cellAt(vin)), say: 'Vin = ' + V(vin) + ': ' + region(vin) + (vin > inp.vt && vin < vdd - inp.vt ? '. Vout = ' + V(vout(vin)) : '') + '.', meta: j === 1 ? { ask: true, ans: vout(steps[2]) > vdd / 2 ? 'still near VDD' : 'already near 0' } : null }));
      F.add({ items: chart({ marks: { VIL: true, VIH: true } }).concat(cellAt(vdd)), say: res.trace[1].say + ' ' + res.trace[2].say + ' Inside that band a small change at the input makes a larger one at the output: the gain is more than 1, so the input is not a clean logic level.' });
      F.add({ items: chart({ marks: { VIL: true, VIH: true, VM: true } }).concat(cellAt(vdd)), say: res.trace[3].say + (inp.ratio === 1 ? ' With matched transistors it is exactly half the supply.' : inp.ratio > 1 ? ' A stronger pMOS pulls the threshold up.' : ' A weaker pMOS lets the nMOS win sooner: the threshold moves down.') });
      F.add({ items: chart({ marks: { VIL: true, VIH: true, VM: true } }).concat(cellAt(vdd)), say: res.trace[4].say + (Math.abs(res.NMH - res.NML) > 0.1 ? ' Unequal: the threshold is off centre, so one level is better protected than the other.' : ' Equal margins: the threshold is centred.'), mark: 'end' });
      return { frames: F.list, def: { sections: [{ id: 'd', kind: 'math', title: 'Read off the curve', text: ['VIL, VIH: slope = −1', 'VOH = Vout at VIL, VOL = Vout at VIH', 'VM: Vout = Vin', '', 'VIL = ' + V(res.VIL) + ', VIH = ' + V(res.VIH), 'VM = ' + V(res.VM), 'NMH = ' + V(res.NMH) + ', NML = ' + V(res.NML)].join('\n') }] } };
    },
    predict: [{ at: (f) => f.meta && f.meta.ask, pick: 'option', options: ['still near VDD', 'already near 0'], ask: 'A little further up, at 45% of the supply: where will Vout be?', answer: (fr, i) => fr[i].meta.ans, explain: (fr, i) => fr[i + 1].say }],
    quiz: [
      { q: 'VIL and VIH are read off the transfer curve where…', options: ['Vout = Vin', 'the slope is −1', 'Vout = 0', 'the curve is flat'], answer: 1, why: 'Beyond those points the gain is below 1, so noise is reduced rather than amplified.' },
      { q: 'With matched transistors, the switching threshold of a CMOS inverter is…', options: ['VDD/2', 'VDD', 'Vt', '0'], answer: 0, why: 'Equal strengths balance at the middle.' },
      { q: 'Making the pMOS stronger moves the threshold…', options: ['down', 'up', 'nowhere', 'to 0'], answer: 1, why: 'The pull-up wins until the input is higher.' },
      { q: 'In the middle of the curve both transistors…', options: ['are off', 'conduct, so current flows from VDD to GND', 'short the input', 'store charge'], answer: 1, why: 'That is why inputs should not sit between the levels.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------
  // Fan-out
  // ---------------------------------------------------------------------------------------------------------
  /** horizontal bars: rows [{label, value, cap, cls}] on one scale; o: {x, y, max, unit, prefix, w} */
  P11.bars = function (rows, o) {
    const P = o.prefix || 'br', X = o.x || 0, Y = o.y || 0, W = o.w || 320, lw = o.labelW || Math.max(...rows.map((r) => Geo().textWidth(r.label, 15, { bold: true }))) + 16, items = [];
    const sc = (v) => (o.log ? Math.max(4, ((Math.log10(Math.max(v, o.min || 1e-3)) - Math.log10(o.min || 1e-3)) / (Math.log10(o.max) - Math.log10(o.min || 1e-3))) * W) : Math.max(2, (v / o.max) * W));
    rows.forEach((r, i) => {
      const y = Y + i * 46;
      items.push({ key: P + ':l' + i, kind: 'cell', x: X, y, w: lw, h: 32, rx: 0, text: r.label, size: 15, align: 'left', cls: 'bar-label' });
      const w = Math.min(W + 20, sc(r.value));
      const txt = r.text === undefined ? r2(r.value) + ' ' + (o.unit || '') : r.text;
      const inside = Geo().textWidth(txt, 15, { mono: true }) + 14 < w;
      items.push({ key: P + ':b' + i, kind: 'cell', x: X + lw, y, w: r2(w), h: 32, rx: 4, text: inside ? txt : '', size: 15, cls: 'bar ' + (r.cls || '') });
      if (!inside) items.push({ key: P + ':t' + i, kind: 'text', x: X + lw + w + 8, y: y + 21, text: txt, anchor: 'start', cls: 'ax-l', size: 15 });
      if (r.cap !== undefined) items.push({ key: P + ':c' + i, kind: 'line', x1: r2(X + lw + sc(r.cap)), y1: y - 6, x2: r2(X + lw + sc(r.cap)), y2: y + 38, cls: 'level hot', audit: 'ignore', layer: 'top' });
    });
    return { items, box: { x: X, y: Y, w: lw + W + 120, h: rows.length * 46 } };
  };
  S.topic({
    id: 'ic-fanout', family: 'p11-params', order: 30, title: 'Fan-out: how many inputs one output can drive',
    blurb: 'Every input a gate drives takes a little current: out of the output when it is high, back into it when it is low. Add loads one at a time until the total passes what the output is rated for, and the output can no longer promise its levels.',
    inputs: [
      { id: 'fam', kind: 'choice', label: 'Family', def: 'TTL', options: P11.familyOptions(['TTL', 'LSTTL', 'HC', 'ALSTTL', 'STTL']) },
      { id: 'n', kind: 'number', label: 'Loads', def: 12, min: 1, max: 24 },
    ],
    presets: [
      { label: 'Standard TTL, 12 loads', values: { fam: 'TTL', n: 12 } },
      { label: 'LS-TTL, 22 loads', values: { fam: 'LSTTL', n: 22 } },
      { label: 'High-speed CMOS, 10 loads', values: { fam: 'HC', n: 10 } },
    ],
    counters: [{ id: 'loads', label: 'loads' }],
    run(inp) {
      const f = C().family(inp.fam), n = inp.n;
      const iil = Math.abs(f.IIL), iih = Math.abs(f.IIH), iol = f.IOL, ioh = Math.abs(f.IOH);
      const lowFan = Math.floor(iol / iil + 1e-9), highFan = Math.floor(ioh / iih + 1e-9);
      const cmos = /CMOS|HC/.test(inp.fam);
      // a current in mA, or in µA when it is too small to show in mA
      const mA = (v) => (v > 0 && v < 0.1 ? r3(v * 1000) + ' µA' : r2(v) + ' mA');
      const shown = Math.min(n, 12);
      // the driver and its loads
      const pic = (k) => {
        const items = [{ key: 'drv', kind: 'cell', x: 0, y: 0, w: 110, h: 50, rx: 8, text: 'driver', size: 16, cls: 'blk' }];
        const bx = 160, ys = (i) => i * 34;
        const ny = Math.max(1, Math.min(k, shown));
        items.push({ key: 'w0', kind: 'line', x1: 110, y1: 25, x2: bx, y2: 25, cls: 'cw v1' });
        items.push({ key: 'bus', kind: 'line', x1: bx, y1: Math.min(25, ys(0) + 14), x2: bx, y2: Math.max(25, ys(ny - 1) + 14), cls: 'cw v1' });
        for (let i = 0; i < shown; i++) {
          if (i >= k) continue;
          items.push({ key: 'lw' + i, kind: 'line', x1: bx, y1: ys(i) + 14, x2: bx + 30, y2: ys(i) + 14, cls: 'cw v1' });
          items.push({ key: 'ld' + i, kind: 'cell', x: bx + 30, y: ys(i), w: 84, h: 28, rx: 5, text: 'load ' + (i + 1), size: 15, cls: 'blk' + (i + 1 > Math.min(lowFan, highFan) ? ' bad' : '') });
        }
        if (k > shown) items.push({ key: 'more', kind: 'text', x: bx + 30, y: ys(shown) + 18, text: '+ ' + (k - shown) + ' more', anchor: 'start', cls: 'ax-l', size: 15 });
        return items;
      };
      const bars = (k) => P11.bars([
        { label: 'low: current into the output', value: k * iil, cap: iol, cls: k * iil > iol + 1e-9 ? 'over' : '', text: mA(k * iil) + ' of ' + iol + ' mA' },
        { label: 'high: current out of the output', value: k * iih, cap: ioh, cls: k * iih > ioh + 1e-9 ? 'over' : 'alt', text: mA(k * iih) + ' of ' + ioh + ' mA' },
      ], { x: 0, y: Math.max(60, shown * 34) + 50, max: Math.max(iol, ioh, n * iil, n * iih) * 1.05, unit: 'mA', w: 340 }).items;
      const F = new S.Frames(['loads']);
      F.add({ items: pic(0).concat(bars(0)), say: f.name + ': each input sends ' + mA(iil) + ' back into the driving output when low and takes ' + mA(iih) + ' from it when high. The output can sink ' + iol + ' mA in the low state and source ' + ioh + ' mA in the high state while keeping its levels. The dashed lines mark those limits.' });
      const ks = n <= 8 ? Array.from({ length: n }, (_, i) => i + 1) : [1, 2, 4].concat(Array.from({ length: 6 }, (_, i) => Math.round(4 + ((n - 4) * (i + 1)) / 6)));
      [...new Set(ks)].forEach((k, j) => {
        F.set('loads', k);
        const over = k * iil > iol + 1e-9 || k * iih > ioh + 1e-9;
        F.add({ items: pic(k).concat(bars(k)), say: k + ' load' + (k > 1 ? 's' : '') + ': ' + mA(k * iil) + ' into the output when low, ' + mA(k * iih) + ' out of it when high.' + (over ? ' Over the limit: ' + [k * iil > iol + 1e-9 ? 'the low output would rise above VOL = ' + V(f.VOL) : null, k * iih > ioh + 1e-9 ? 'the high output would sag below VOH = ' + V(f.VOH) : null].filter(Boolean).join(', and ') + ', eating into the noise margin.' : ' Within both limits.'), meta: j === 1 ? { ask: true, n: String(Math.min(lowFan, highFan)) } : null });
      });
      F.add({ items: pic(n).concat(bars(n)), say: 'Fan-out = the smaller of IOL/|IIL| = ' + iol + ' mA / ' + mA(iil) + ' = ' + lowFan + ' and |IOH|/IIH = ' + ioh + ' mA / ' + mA(iih) + ' = ' + highFan + ': ' + Math.min(lowFan, highFan) + '.' + (cmos ? ' For CMOS that number is huge, because inputs take almost no current; in practice it is ' + (S.Tech.presets.CMOS.fanoutNote || 'limited by load capacitance') + ': each load slows the edges, so about ' + f.fanout + ' is the practical figure.' : ''), mark: 'end' });
      return { frames: F.list, def: { sections: [{ id: 'd', kind: 'math', title: 'Fan-out', text: ['low:  IOL / |IIL| = ' + lowFan, 'high: |IOH| / IIH = ' + highFan, 'fan-out = the smaller = ' + Math.min(lowFan, highFan)].join('\n') }] } };
    },
    predict: [{ at: (f) => f.meta && f.meta.ask, pick: 'option', options: ['2', '5', '10', '20', '50', '100', '200', '4000'], ask: 'How many loads can this output drive before it breaks a limit?', answer: (fr, i) => (['2', '5', '10', '20', '50', '100', '200', '4000'].includes(fr[i].meta.n) ? fr[i].meta.n : null), explain: (fr) => fr[fr.length - 1].say }],
    quiz: [
      { q: 'Standard TTL: IOL = 16 mA, IIL = −1.6 mA. The low-state fan-out is…', options: ['1.6', '10', '16', '25'], answer: 1, why: '16 / 1.6 = 10.' },
      { q: 'What happens when a TTL output drives too many loads in the low state?', options: ['nothing', 'the output voltage rises above VOL, eating into the noise margin', 'the gate gets faster', 'it oscillates'], answer: 1, why: 'More current through the output transistor raises its voltage.' },
      { q: 'Why is CMOS fan-out limited by capacitance rather than current?', options: ['CMOS inputs draw almost no steady current, but each adds capacitance that slows the edges', 'CMOS outputs are weak', 'CMOS has no inputs', 'it is not limited'], answer: 0, why: 'Steady current is tiny; charging the input capacitances takes time.' },
      { q: 'Fan-out is taken as…', options: ['the larger of the high and low figures', 'the smaller of the high and low figures', 'their sum', 'their average'], answer: 1, why: 'Both states must be within limits.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------
  // Propagation delay, measured
  // ---------------------------------------------------------------------------------------------------------
  S.topic({
    id: 'ic-delay', family: 'p11-params', order: 40, title: 'Propagation delay',
    blurb: 'A gate answers late: tPHL after its input when the output falls, tPLH when it rises, often not the same. Send a pulse down a chain of inverters on the simulator and measure both, gate by gate.',
    inputs: [
      { id: 'tech', kind: 'choice', label: 'Technology', def: 'TTL', options: [{ value: 'TTL', label: 'TTL (74)' }, { value: 'LS-TTL', label: 'LS-TTL (74LS)' }, { value: 'CMOS', label: 'CMOS (74HC-like)' }] },
      { id: 'n', kind: 'number', label: 'Inverters in the chain', def: 3, min: 1, max: 5 },
    ],
    presets: [
      { label: 'TTL, 3 inverters', values: { tech: 'TTL', n: 3 } },
      { label: 'LS-TTL, 3 inverters', values: { tech: 'LS-TTL', n: 3 } },
      { label: 'CMOS, 5 inverters', values: { tech: 'CMOS', n: 5 } },
    ],
    counters: [{ id: 'ns', label: 'ns along the chain' }],
    run(inp) {
      const TM = K().timing, c = new S.Netlist.Circuit('inverter chain');
      let s = c.input('A').pin('y');
      const ids = [];
      for (let i = 1; i <= inp.n; i++) { s = TM.G(c, 'NOT', [s], { id: 'g' + i }); ids.push('g' + i); c.name(s, i === inp.n ? 'Y' : 'n' + i, true); }
      c.connect(s, c.output('Y'));
      const t1 = 60, t2 = 130, end = t2 + inp.n * 16 + 30;
      const R = TM.run(c, { tech: inp.tech, stim: [[0, 'A', 0], [t1, 'A', 1], [t2, 'A', 0]], until: end });
      const nets = ['A'].concat(ids.map((g, i) => (i === inp.n - 1 ? 'Y' : 'n' + (i + 1))));
      const sig = TM.signals(R, nets);
      const tim = R.sim.timing('g1');
      const F = new S.Frames(['ns']);
      const scene = (t, hot, spans) => TM.frame({ R, t, hot, t0: 40, t1: end, signals: sig, spans, ticks: 5, labels: ids }).items;
      F.add({ items: scene(t1 - 1), say: 'A chain of ' + inp.n + ' inverter' + (inp.n > 1 ? 's' : '') + ' (' + inp.tech + '). Each takes tPHL = ' + tim.tpHL + ' ns to pull its output down and tPLH = ' + tim.tpLH + ' ns to pull it up.', meta: { ask: true, total: String(Math.round((inp.n % 2 ? Math.ceil(inp.n / 2) * tim.tpHL + Math.floor(inp.n / 2) * tim.tpLH : (inp.n / 2) * (tim.tpHL + tim.tpLH)) * 100) / 100) } });
      const spans = [];
      let prevT = t1;
      nets.slice(1).forEach((nn, i) => {
        const ch = R.changesIn(nn, t1, t2 - 0.01)[0];
        if (!ch) return;
        const d = ch[0] - prevT;
        spans.push({ t0: prevT, t1: ch[0], rows: [nets[i], nn], cls: ch[1] === 0 ? 'setup' : 'hold', key: 'r' + i });
        F.set('ns', r2(ch[0] - t1));
        F.add({ items: scene(ch[0] + 0.3, [ids[i]], spans.slice()), say: ids[i] + ' sees its input ' + (ch[1] === 0 ? 'rise' : 'fall') + ' at ' + r2(prevT) + ' ns and its output ' + (ch[1] === 0 ? 'falls' : 'rises') + ' at ' + r2(ch[0]) + ' ns: ' + (ch[1] === 0 ? 'tPHL' : 'tPLH') + ' = ' + r2(d) + ' ns.' });
        prevT = ch[0];
      });
      const total = r2(prevT - t1);
      F.add({ items: scene(end, [], spans), say: 'The rising edge took ' + total + ' ns to get through ' + inp.n + ' gate' + (inp.n > 1 ? 's' : '') + '. The falling edge comes back with the delays swapped. A single figure for a gate is the average of the two, tpd = (tPHL + tPLH)/2 = ' + r2((tim.tpHL + tim.tpLH) / 2) + ' ns for this inverter.', mark: 'end' });
      return { frames: F.list, def: { sections: [{ id: 'd', kind: 'math', title: 'Delays', text: ['tPHL: input to output falling', 'tPLH: input to output rising', 'tpd = (tPHL + tPLH) / 2', '', inp.tech + ': ' + tim.tpHL + ' and ' + tim.tpLH + ' ns'].join('\n') }] } };
    },
    predict: [{ at: (f) => f.meta && f.meta.ask, pick: 'option', options: (fr, i) => [...new Set([fr[i].meta.total, String(Math.round(+fr[i].meta.total * 1.5)), String(Math.round(+fr[i].meta.total / 2)), '0'])], ask: 'The input rises. How many ns until the end of the chain responds?', answer: (fr, i) => fr[i].meta.total, explain: (fr) => fr[fr.length - 1].say }],
    quiz: [
      { q: 'tPHL is measured from the input change to…', options: ['the output rising', 'the output falling', 'the next clock edge', 'the input settling'], answer: 1, why: 'High to low at the output.' },
      { q: 'A family\'s quoted propagation delay tpd is usually…', options: ['the larger of the two', 'the average of tPHL and tPLH', 'tPHL only', 'the sum'], answer: 1, why: 'An average over both edges.' },
      { q: 'A chain of 3 inverters with tPHL = 7 ns and tPLH = 11 ns passes a rising input edge in…', options: ['21 ns', '25 ns', '29 ns', '33 ns'], answer: 1, why: 'Fall, rise, fall: 7 + 11 + 7.' },
      { q: 'Delays add along a path, so the slowest path through a circuit…', options: ['sets how fast it can work', 'does not matter', 'is always 1 gate', 'is the shortest'], answer: 0, why: 'The critical path limits the speed.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------
  // Power and the speed-power product
  // ---------------------------------------------------------------------------------------------------------
  S.topic({
    id: 'ic-power', family: 'p11-params', order: 50, title: 'Power and the speed-power product',
    blurb: 'A TTL gate burns power all the time; a CMOS gate almost only when it switches, C·V²·f. Compare families at a clock rate you choose, and multiply power by delay to see what each one spends per switching event.',
    inputs: [
      { id: 'f', kind: 'number', label: 'Switching rate (MHz)', def: 10, min: 0, max: 100, integer: false },
      { id: 'c', kind: 'number', label: 'Load capacitance (pF)', def: 15, min: 1, max: 100 },
    ],
    presets: [
      { label: 'Slow: 100 kHz', values: { f: 0.1, c: 15 } },
      { label: 'Middling: 10 MHz', values: { f: 10, c: 15 } },
      { label: 'Fast: 50 MHz, 50 pF', values: { f: 50, c: 50 } },
    ],
    run(inp) {
      const keys = ['TTL', 'LSTTL', 'STTL', 'ECL', 'CMOS4000', 'HC'];
      const fams = keys.map((k) => C().family(k));
      const vOf = (f) => (f.key === 'ECL' ? 0.8 : f.key.includes('TTL') ? 3.5 : 5);
      const dyn = (f) => inp.c * vOf(f) * vOf(f) * inp.f * 1e-3;
      const rows = (mode) => fams.map((f) => {
        const st = f.power, total = mode === 'static' ? st : st + dyn(f);
        return { label: f.key, value: total, cls: f.key === 'HC' || f.key === 'CMOS4000' ? 'alt' : '', text: (total < 0.1 ? r2(total * 1000) + ' µW' : r2(total) + ' mW') };
      });
      const bars = (mode, x, y) => P11.bars(rows(mode), { x, y, max: Math.max(30, ...rows(mode).map((r) => r.value)) * 1.1, min: 0.001, log: true, w: 320, prefix: 'pw' }).items;
      const F = new S.Frames();
      F.add({ items: bars('static', 0, 0).concat([{ key: 'cap', kind: 'text', x: 0, y: -20, text: 'power per gate, standing still (log scale)', cls: 'title' }]), say: 'Power per gate with nothing switching: ' + fams.map((f) => f.key + ' ' + (f.power < 0.1 ? r2(f.power * 1000) + ' µW' : f.power + ' mW')).join(', ') + '. Bipolar gates (TTL, ECL) draw current all the time; CMOS draws almost none.' });
      const hc = fams.find((f) => f.key === 'HC'), ttl = fams[0];
      const cross = r2((ttl.power - hc.power) / (inp.c * 1e-3 * (vOf(hc) * vOf(hc) - vOf(ttl) * vOf(ttl))));
      F.add({ items: bars('dyn', 0, 0).concat([{ key: 'cap', kind: 'text', x: 0, y: -20, text: 'switching at ' + inp.f + ' MHz into ' + inp.c + ' pF', cls: 'title' }]), say: 'Now each output switches at ' + inp.f + ' MHz into ' + inp.c + ' pF. Every cycle charges and discharges the load: P = C·V²·f, ' + r2(dyn(hc)) + ' mW for HC at 5 V. ' + (hc.power + dyn(hc) < ttl.power + dyn(ttl) ? 'CMOS still wins at this rate.' : 'At this rate CMOS spends as much as TTL, or more.'), meta: { ask: true, ans: hc.power + dyn(hc) < ttl.power + dyn(ttl) ? 'HC' : 'TTL' } });
      const sp = fams.map((f) => ({ label: f.key, value: r2(f.tpd * (f.power + dyn(f))), cls: '', text: r2(f.tpd * (f.power + dyn(f))) + ' pJ' }));
      const best = sp.reduce((a, b) => (b.value < a.value ? b : a));
      best.cls = 'best';
      F.add({ items: P11.bars(sp, { x: 0, y: 0, max: Math.max(...sp.map((r) => r.value)) * 1.1, min: 0.01, log: true, w: 320, prefix: 'sp' }).items.concat([{ key: 'cap', kind: 'text', x: 0, y: -20, text: 'speed-power product, tpd × P (log scale)', cls: 'title' }]), say: 'The speed-power product, delay times power, is the energy a gate spends per switching event, a figure of merit where smaller is better: ' + sp.map((r) => r.label + ' ' + r.text).join(', ') + '. Best here: ' + best.label + '.' });
      F.add({ items: P11.bars(sp, { x: 0, y: 0, max: Math.max(...sp.map((r) => r.value)) * 1.1, min: 0.01, log: true, w: 320, prefix: 'sp' }).items.concat([{ key: 'cap', kind: 'text', x: 0, y: -20, text: 'speed-power product, tpd × P (log scale)', cls: 'title' }]), say: 'CMOS power grows in step with the switching rate; TTL\'s barely moves. With ' + inp.c + ' pF loads the two meet near ' + cross + ' MHz. That, and its margins, is why CMOS took over: most gates in a system switch far less often than the clock.', mark: 'end' });
      return { frames: F.list, def: { sections: [{ id: 'd', kind: 'math', title: 'Power', text: ['static: current that always flows', 'dynamic: P = C · V² · f', '', 'speed-power product = tpd × P', '  (pJ: energy per switching event)'].join('\n') }] } };
    },
    predict: [{ at: (f) => f.meta && f.meta.ask, pick: 'option', options: ['HC', 'TTL'], ask: 'At this rate and load, which gate uses less power: high-speed CMOS or standard TTL?', answer: (fr, i) => fr[i].meta.ans, explain: (fr, i) => fr[i].say }],
    quiz: [
      { q: 'The dynamic power of a CMOS gate is…', options: ['V·I', 'C·V²·f', 'I²R', 'constant'], answer: 1, why: 'Each cycle charges the load capacitance and lets it discharge.' },
      { q: 'Halving the supply voltage of a CMOS circuit cuts its dynamic power to…', options: ['a half', 'a quarter', 'the same', 'double'], answer: 1, why: 'Power goes with V².' },
      { q: 'The speed-power product measures…', options: ['the energy per switching event', 'the maximum clock', 'the fan-out', 'the noise margin'], answer: 0, why: 'Delay (s) times power (W) is energy (J).' },
      { q: 'Which family burns roughly the same power whether or not it switches?', options: ['CMOS', 'TTL', 'neither', 'both'], answer: 1, why: 'Its transistors draw current through resistors in both states.' },
    ],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
