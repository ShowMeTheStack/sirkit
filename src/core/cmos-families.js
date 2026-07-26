// Logic families for the integrated-circuits chapter: a simple analytic transfer curve of a CMOS inverter
// (square-law transistors, so VIL, VIH, VOL, VOH, the switching threshold and the noise margins can be read off
// it as the sizes and thresholds are changed), and tables of typical datasheet parameters for TTL, ECL and CMOS
// families with derived noise margins, fan-out, and a check of one family driving another.
(function (S) {
  'use strict';
  const C = S.Cmos = S.Cmos || {};
  const r3 = (v) => Math.round(v * 1000) / 1000;

  /** drain currents (arbitrary units) of the two transistors of an inverter */
  function currents(p, vin, vout) {
    const vgsn = vin, vdsn = vout, vov = vgsn - p.vtn;
    let In = 0;
    if (vov > 0) In = vdsn < vov ? p.kn * (vov * vdsn - vdsn * vdsn / 2) : p.kn / 2 * vov * vov;
    const vsgp = p.vdd - vin, vsdp = p.vdd - vout, vovp = vsgp - Math.abs(p.vtp);
    let Ip = 0;
    if (vovp > 0) Ip = vsdp < vovp ? p.kp * (vovp * vsdp - vsdp * vsdp / 2) : p.kp / 2 * vovp * vovp;
    return { In, Ip };
  }
  /** the output voltage for an input voltage: the vout where the two currents balance (bisection) */
  function vout(p, vin) {
    let lo = 0, hi = p.vdd;
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2, c = currents(p, vin, mid); if (c.In > c.Ip) hi = mid; else lo = mid; }
    return (lo + hi) / 2;
  }
  /**
   * The transfer curve of a CMOS inverter. params: { vdd: 5, vtn: 0.7, vtp: -0.7, kn: 1, kp: 1 } (kp/kn is the
   * size ratio that sets the threshold). Returns { points: [[vin, vout]], VIL, VIH, VOL, VOH, VM, NMH, NML,
   * trace }.
   */
  C.vtc = function (params) {
    const p = Object.assign({ vdd: 5, vtn: 0.7, vtp: -0.7, kn: 1, kp: 1, steps: 500 }, params);
    const pts = [];
    for (let i = 0; i <= p.steps; i++) { const vin = (p.vdd * i) / p.steps; pts.push([vin, vout(p, vin)]); }
    // the unity-gain points: where the slope first and last reaches −1
    const slope = (i) => (pts[i + 1][1] - pts[i - 1][1]) / (pts[i + 1][0] - pts[i - 1][0]);
    let iL = -1, iH = -1;
    for (let i = 1; i < pts.length - 1; i++) if (slope(i) <= -1) { if (iL < 0) iL = i; iH = i; }
    const VIL = pts[iL][0], VIH = pts[iH][0], VOH = pts[iL][1], VOL = pts[iH][1];
    // the switching threshold, where vout = vin
    let lo = 0, hi = p.vdd;
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (vout(p, mid) > mid) lo = mid; else hi = mid; }
    const VM = (lo + hi) / 2, r = Math.sqrt(p.kp / p.kn);
    const VMformula = (p.vtn + r * (p.vdd + p.vtp)) / (1 + r);
    const res = { params: p, points: pts, VIL: r3(VIL), VIH: r3(VIH), VOL: r3(VOL), VOH: r3(VOH), VM: r3(VM), VMformula: r3(VMformula), NMH: r3(VOH - VIH), NML: r3(VIL - VOL) };
    res.trace = [
      { kind: 'curve', say: 'Sweep Vin from 0 to ' + p.vdd + ' V; at each point Vout is where the nMOS and pMOS currents are equal.' },
      { kind: 'vil', say: 'The slope first reaches −1 at Vin = ' + res.VIL + ' V (VIL), where Vout = ' + res.VOH + ' V (VOH).' },
      { kind: 'vih', say: 'It last reaches −1 at Vin = ' + res.VIH + ' V (VIH), where Vout = ' + res.VOL + ' V (VOL).' },
      { kind: 'vm', say: 'The switching threshold VM = ' + res.VM + ' V (by formula ' + res.VMformula + ' V, with √(kp/kn) = ' + r3(r) + ').' },
      { kind: 'margins', say: 'Noise margins: NMH = VOH − VIH = ' + res.NMH + ' V and NML = VIL − VOL = ' + res.NML + ' V.' },
    ];
    return res;
  };

  // ---- family tables (typical datasheet values; currents in mA, times in ns, power in mW per gate) ---------
  C.FAMILIES = {
    TTL: { name: 'Standard TTL (74)', supply: 'VCC = 5 V', VIH: 2.0, VIL: 0.8, VOH: 2.4, VOL: 0.4, IIH: 0.04, IIL: -1.6, IOH: -0.4, IOL: 16, tpd: 10, power: 10, output: 'totem-pole' },
    LSTTL: { name: 'Low-power Schottky TTL (74LS)', supply: 'VCC = 5 V', VIH: 2.0, VIL: 0.8, VOH: 2.7, VOL: 0.5, IIH: 0.02, IIL: -0.4, IOH: -0.4, IOL: 8, tpd: 9.5, power: 2, output: 'totem-pole' },
    STTL: { name: 'Schottky TTL (74S)', supply: 'VCC = 5 V', VIH: 2.0, VIL: 0.8, VOH: 2.7, VOL: 0.5, IIH: 0.05, IIL: -2.0, IOH: -1.0, IOL: 20, tpd: 3, power: 19, output: 'totem-pole' },
    ALSTTL: { name: 'Advanced low-power Schottky TTL (74ALS)', supply: 'VCC = 5 V', VIH: 2.0, VIL: 0.8, VOH: 2.5, VOL: 0.5, IIH: 0.02, IIL: -0.1, IOH: -0.4, IOL: 8, tpd: 4, power: 1.2, output: 'totem-pole' },
    ECL: { name: 'ECL (10K)', supply: 'VEE = −5.2 V', VIH: -1.105, VIL: -1.475, VOH: -0.98, VOL: -1.63, IIH: 0.265, IIL: 0.0005, IOH: -50, IOL: 50, tpd: 2, power: 25, output: 'emitter follower' },
    CMOS4000: { name: 'CMOS 4000B at 5 V', supply: 'VDD = 5 V', VIH: 3.5, VIL: 1.5, VOH: 4.95, VOL: 0.05, IIH: 0.0001, IIL: -0.0001, IOH: -0.51, IOL: 0.51, tpd: 60, power: 0.001, output: 'complementary' },
    HC: { name: 'High-speed CMOS (74HC) at 5 V', supply: 'VCC = 5 V', VIH: 3.5, VIL: 1.0, VOH: 4.4, VOL: 0.33, IIH: 0.001, IIL: -0.001, IOH: -4, IOL: 4, tpd: 9, power: 0.0025, output: 'complementary' },
    HCT: { name: 'TTL-compatible CMOS (74HCT) at 5 V', supply: 'VCC = 5 V', VIH: 2.0, VIL: 0.8, VOH: 4.4, VOL: 0.33, IIH: 0.001, IIL: -0.001, IOH: -4, IOL: 4, tpd: 14, power: 0.0025, output: 'complementary' },
  };
  /** which simulator technology preset stands for each family, when the simulator is loaded */
  const TECH = { TTL: 'TTL', LSTTL: 'LS-TTL', HC: 'CMOS' };
  /** a family's figures, taken from the simulator's preset when there is one so the two never disagree */
  function source(key) {
    const f = C.FAMILIES[key];
    let T = null;
    try { T = S.Tech && S.Tech.presets && S.Tech.presets[TECH[key]]; } catch (e) { T = null; }
    if (!T || !T.levels || !T.currents) return Object.assign({}, f, { source: 'table' });
    const avg = (d) => (Array.isArray(d) ? (d[0] + d[1]) / 2 : d);
    return Object.assign({}, f, {
      VIH: T.levels.vih, VIL: T.levels.vil, VOH: T.levels.voh, VOL: T.levels.vol,
      IIH: T.currents.iih, IIL: T.currents.iil, IOH: T.currents.ioh, IOL: T.currents.iol,
      tpd: T.gate && T.gate.NAND ? avg(T.gate.NAND) : f.tpd, power: T.power && T.power.staticMw != null && key !== 'HC' ? T.power.staticMw : f.power,
      source: 'simulator preset ' + T.name,
    });
  }
  const fanout = (f) => Math.max(0, Math.floor(Math.min(f.IOL / Math.abs(f.IIL), Math.abs(f.IOH) / Math.abs(f.IIH))));
  /** a family with its derived figures: noise margins, fan-out (by current), speed-power product */
  C.family = function (key) {
    if (!C.FAMILIES[key]) throw new Error('unknown family ' + key);
    const f = source(key);
    const out = Object.assign({ key }, f, { NMH: r3(f.VOH - f.VIH), NML: r3(f.VIL - f.VOL), fanout: fanout(f), speedPower: r3(f.tpd * f.power) });
    if (/CMOS|HC/.test(key)) { out.fanoutNote = 'By current alone a CMOS output could drive thousands of inputs; in practice the load capacitance limits it, at about 50 inputs before the delay grows too long.'; out.fanout = Math.min(out.fanout, 50); }
    if (key === 'ECL') { out.fanoutNote = 'The emitter-follower outputs can drive many inputs by current; in practice about 25, before the load slows the edges.'; out.fanout = Math.min(out.fanout, 25); }
    if (TECH[key]) out.simPreset = TECH[key];
    out.say = out.name + ': NMH = ' + out.NMH + ' V, NML = ' + out.NML + ' V, fan-out ' + out.fanout + ', tpd ' + f.tpd + ' ns, ' + f.power + ' mW per gate.';
    return out;
  };
  C.families = () => Object.keys(C.FAMILIES).map(C.family);
  /**
   * Can one family drive another? The driver's VOH must reach the load's VIH and its VOL stay under the
   * load's VIL; the fan-out is set by the currents. Returns { ok, highMargin, lowMargin, fanout, say }.
   */
  C.interface = function (driverKey, loadKey) {
    const d = source(driverKey), l = source(loadKey);
    const hi = r3(d.VOH - l.VIH), lo = r3(l.VIL - d.VOL);
    const n = Math.floor(Math.min(d.IOL / Math.max(1e-9, Math.abs(l.IIL)), Math.abs(d.IOH) / Math.max(1e-9, Math.abs(l.IIH))));
    const ok = hi >= 0 && lo >= 0;
    let say = d.name + ' driving ' + l.name + ': high margin ' + hi + ' V, low margin ' + lo + ' V';
    if (!ok) say += hi < 0 ? '. The high output (' + d.VOH + ' V) does not reach the input\'s VIH (' + l.VIH + ' V): a pull-up resistor or a TTL-compatible input (HCT) is needed.' : '. The low output is above the input\'s VIL.';
    else say += ', up to ' + Math.min(n, 50) + ' loads.';
    return { ok, highMargin: hi, lowMargin: lo, fanout: Math.min(n, 50), say };
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
