// Part 11, digital integrated circuits: lessons, exercises, a tour and a course. Three chapters: the parameters of
// a logic family (levels and noise margins, the transfer curve, fan-out, delay and power), the families and their
// output stages with interfacing, and switch-level CMOS (gates from complementary networks, complex gates,
// transmission gates). The figures come from Sirkit.Cmos and the simulator's technology presets (Sirkit.Tech).
(function (S) {
  'use strict';
  const C = S.Content;
  if (!C || C.lessons.has('p11l-levels')) return;
  const Cm = () => S.Cmos;
  const fam = (k) => Cm().family(k);

  C.chapter({ id: 'p11-ch-params', part: 'ics', n: 1, title: 'What a family promises', blurb: 'Logic levels and noise margins, the inverter\'s transfer curve, fan-out, propagation delay and power: the numbers on a data sheet and what they mean.' });
  C.chapter({ id: 'p11-ch-families', part: 'ics', n: 2, title: 'Families and their outputs', blurb: 'From resistor-transistor logic to CMOS; totem-pole, open-collector and tristate outputs; and joining one family to another.' });
  C.chapter({ id: 'p11-ch-cmos', part: 'ics', n: 3, title: 'Gates from switches', blurb: 'nMOS and pMOS transistors as switches: complementary networks, complex gates in one stage, and transmission gates.' });

  const L = (x) => C.lesson(x);
  const ex = (o) => C.exercise(o);
  const r2 = (v) => Math.round(v * 100) / 100;
  const SHORT = { TTL: '74 (TTL)', LSTTL: '74LS', HC: '74HC', HCT: '74HCT', ECL: 'ECL 10K' };
  const famRow = (k) => { const f = fam(k); return [SHORT[k] || k, f.VOH, f.VOL, f.VIH, f.VIL, f.NMH, f.NML].map(String); };

  // =========================================================================================================
  // Chapter 1: parameters
  // =========================================================================================================
  L({
    id: 'p11l-levels', chapter: 'p11-ch-params', title: 'Logic levels and noise margins', minutes: 7,
    summary: 'An output promises to be above VOH for a 1 and below VOL for a 0; an input promises to read anything above VIH as 1 and below VIL as 0. The gaps between the promises are the noise margins.',
    blocks: [
      'A wire between two gates is never perfectly quiet. A neighbouring wire switching, a ground that bounces when many outputs fall at once, a long cable picking up interference: all of these add a few tenths of a volt. How much can a 1 lose before the next gate stops reading it as a 1?',
      'A family answers with four numbers. The output guarantees **VOH**, the lowest voltage it gives for a 1, and **VOL**, the highest it gives for a 0. The input guarantees to read anything at or above **VIH** as 1 and at or below **VIL** as 0. Between VIL and VIH it promises nothing.',
      { def: 'Noise margins', text: 'NMH = VOH − VIH, how much noise a 1 can take; NML = VIL − VOL, how much a 0 can take. A family is as robust as the smaller of the two.' },
      { topic: 'ic-levels', input: { fam: 'LSTTL', noise: 0.5 }, frame: 3, caption: 'Low-power Schottky TTL: the high margin is 0.7 V but the low one only 0.3 V. Step on to see 0.5 V of noise hit each level.' },
      { predict: { q: 'A 74LS output sends a 0 at its worst level, 0.5 V, and the wire adds 0.5 V. What does the input read?', options: ['0', '1', 'Nothing guaranteed: it is between VIL and VIH'], answer: 2, explain: '0.5 + 0.5 = 1.0 V, above VIL = 0.8 V and below VIH = 2.0 V: the indeterminate band. The noise was bigger than NML = 0.3 V.' } },
      { table: [['Family', 'VOH / VOL', 'VIH / VIL', 'NMH / NML']].concat(['TTL', 'LSTTL', 'HC', 'HCT', 'ECL'].map((k) => { const r = famRow(k); return [r[0], r[1] + ' / ' + r[2], r[3] + ' / ' + r[4], r[5] + ' / ' + r[6]]; })), caption: 'Typical figures in volts (HC and HCT at 5 V), with the margins worked out from them.' },
      'CMOS at 5 V swings almost from rail to rail and reads its inputs near the middle, so both of its margins are wide. TTL\'s outputs stop well short of the supply, and its margins are a few tenths of a volt.',
      { h: 'What to take away' },
      { list: ['VOH, VOL: what an output promises. VIH, VIL: what an input needs.', 'NMH = VOH − VIH and NML = VIL − VOL.', 'Noise larger than the margin can land in the indeterminate band.'] },
      { exercise: 'p11x-nm-ttl' },
      { exercise: 'p11x-nm-hct' },
      { exercise: 'p11x-noise' },
    ],
  });

  L({
    id: 'p11l-vtc', chapter: 'p11-ch-params', title: 'The transfer curve of an inverter', minutes: 7,
    summary: 'Sweep a CMOS inverter\'s input from 0 to VDD and plot the output: a steep fall in the middle. The points where the slope is −1 give VIL and VIH; the transistors\' relative strength sets where the fall happens.',
    blocks: [
      'Where do VIL and VIH come from? Put a slowly rising voltage on an inverter\'s input and watch its output. At first the nMOS transistor is off and the output sits at VDD. Near the middle both transistors conduct and fight, and the output falls steeply. At the end only the nMOS conducts and the output is at 0.',
      { topic: 'ic-vtc', frame: 4, caption: 'Matched transistors at 5 V. At Vin = 2.5 V both conduct and the output is already falling fast. Step on to the unity-gain points and the margins.' },
      'Where the slope of the curve is steeper than −1, a small change at the input makes a bigger one at the output: the gate amplifies noise rather than rejecting it. So VIL and VIH are taken where the slope is exactly −1, and the output there gives VOH and VOL.',
      { predict: { q: 'Make the pMOS three times as strong as the nMOS. Which way does the switching threshold VM move?', options: ['Up, towards VDD', 'Down, towards 0', 'It stays at VDD/2'], answer: 0, explain: 'A stronger pull-up needs more input voltage before the nMOS can win the fight, so the fall happens later: VM rises to about ' + (S.Cmos ? S.Cmos.vtc({ kp: 3 }).VM : 2.98) + ' V.' } },
      { tip: 'A pMOS transistor conducts less than an nMOS of the same size, so real inverters make the pMOS wider to centre VM at VDD/2. Centred, the two margins are equal.' },
      { h: 'What to take away' },
      { list: ['The transfer curve plots Vout against Vin.', 'VIL and VIH are where the slope is −1.', 'The ratio of the transistors\' strengths sets the threshold VM.'] },
      { exercise: 'p11x-vtc-vm' },
      { exercise: 'p11x-vtc-dir' },
    ],
  });

  L({
    id: 'p11l-fanout', chapter: 'p11-ch-params', title: 'Fan-out', minutes: 6,
    summary: 'Every input an output drives draws a little current. Add up the currents in each state, compare them with what the output can handle, and the smaller ratio is the fan-out.',
    blocks: [
      'An output that drives one input is easy. Drive twenty and the output must handle twenty times the current; past some number it can no longer hold its voltage inside VOL or VOH, and the noise margin goes.',
      'Count in both states. When the output is low, each TTL input pushes current IIL back into it, and the output can sink at most IOL. When it is high, each input draws IIH, and the output can source at most IOH. The fan-out is the smaller of IOL/|IIL| and |IOH|/IIH.',
      { topic: 'ic-fanout', input: { fam: 'LSTTL', n: 22 }, frame: 8, caption: 'LS-TTL with 19 loads, still within both limits. Step on to 22, where the low state runs out.' },
      { predict: { q: 'A standard TTL output sinks 16 mA when low, and each standard TTL input sends back 1.6 mA. Ignoring the high state, how many inputs can it drive?', options: ['8', '10', '16'], answer: 1, explain: '16 / 1.6 = 10. The high state allows 0.4 / 0.04 = 10 too, so the fan-out of standard TTL is 10.' } },
      'CMOS inputs draw almost no current, so by current alone a CMOS output could drive thousands. What limits it is capacitance: each input adds a few picofarads, and the output takes longer to charge them all. In practice the limit is a few dozen.',
      { h: 'What to take away' },
      { list: ['Fan-out = min(IOL/|IIL|, |IOH|/IIH), both states checked.', 'Mixing families: add up the currents of each kind of load.', 'For CMOS, load capacitance and delay set the practical limit.'] },
      { exercise: 'p11x-fanout-ls' },
      { exercise: 'p11x-fanout-mix' },
      { exercise: 'p11x-fanout-nand' },
    ],
  });

  L({
    id: 'p11l-delay-power', chapter: 'p11-ch-params', title: 'Delay and power', minutes: 8,
    summary: 'A gate takes tPHL to pull its output down and tPLH to pull it up; delays add along a path. Bipolar gates burn power standing still; CMOS burns it switching, C·V²·f. Delay times power is the energy per switch.',
    blocks: [
      'Change a gate\'s input and its output follows a few nanoseconds later. The time from input to a falling output is **tPHL**; to a rising output, **tPLH**. They are seldom equal, and a data sheet\'s single figure tpd is their average.',
      { topic: 'ic-delay', input: { tech: 'LS-TTL', n: 3 }, frame: 3, caption: 'Three LS-TTL inverters. The rising input edge goes through fall, rise, fall: 10 + 9 + 10 ns.' },
      { predict: { q: 'Now the input of the same chain falls. How long until the end of the chain responds?', options: ['27 ns', '28 ns', '29 ns', '30 ns'], answer: 1, explain: 'A falling input makes the first output rise (9 ns), the second fall (10 ns) and the third rise (9 ns): 28 ns. The edges alternate along an inverting chain.' } },
      'Power comes in two kinds. **Static** power flows whether or not anything switches: a TTL gate draws about 10 mW all the time. **Dynamic** power is spent charging and discharging the load capacitance on every switch: P = C·V²·f. A CMOS gate standing still draws microwatts; switching fast into a big load, it can draw more than TTL.',
      { topic: 'ic-power', frame: 1, caption: 'Each output switching at 10 MHz into 15 pF. HC now draws milliwatts, almost all of it dynamic.' },
      { def: 'Speed-power product', text: 'tpd × P, in picojoules: the energy one gate spends on one switching event. Smaller is better; it lets families that trade speed for power be compared on one number.' },
      { h: 'What to take away' },
      { list: ['tPHL and tPLH, averaged as tpd; delays add along a path.', 'Static power is always there; dynamic power is C·V²·f.', 'Speed-power product = tpd × P.'] },
      { exercise: 'p11x-delay-ttl' },
      { exercise: 'p11x-delay-ls' },
      { exercise: 'p11x-delay-cmos' },
      { exercise: 'p11x-chain-fall' },
      { exercise: 'p11x-arrival-ttl' },
      { exercise: 'p11x-aoi-ls' },
      { exercise: 'p11x-nand-wave-ttl' },
      { exercise: 'p11x-chain-wave-ttl' },
      { exercise: 'p11x-fmax-ls' },
      { exercise: 'p11x-dyn-power' },
      { exercise: 'p11x-speed-power' },
      { exercise: 'p11x-crossover' },
    ],
  });

  // =========================================================================================================
  // Chapter 2: families
  // =========================================================================================================
  L({
    id: 'p11l-families', chapter: 'p11-ch-families', title: 'From RTL to CMOS', minutes: 7,
    summary: 'Each family fixed the weakness of the one before: diodes for fan-out, a multi-emitter transistor and an active pull-up for speed, current steering to avoid saturation, and complementary switches to stop burning power at rest.',
    blocks: [
      'The first integrated gates were built from resistors and transistors: RTL. A NOR gate was a few transistors sharing one pull-up resistor. It worked, but every input loaded the driver through a resistor, and a saturated transistor is slow to turn off.',
      { topic: 'ic-history', frame: 1, caption: 'An RTL NOR gate with both inputs 0: the resistor pulls Y up. Step on through DTL, TTL, ECL and CMOS.' },
      'Diode-transistor logic did the AND with diodes and kept a resistor pull-up, so rising edges stayed slow. TTL replaced the diodes with one multi-emitter transistor and the pull-up resistor with an active **totem-pole** output: one transistor to pull up, one to pull down.',
      'ECL took another road: it never lets a transistor saturate. A constant current is steered to one side of a pair or the other. Very fast, but it burns that current all the time, and its logic swing is under a volt.',
      { topic: 'ic-ecl', frame: 2, caption: 'An ECL gate with A = 1: the current flows through QA, pulling the NOR output low, while the OR output stays high.' },
      { predict: { q: 'Which family draws almost no current while its outputs are not switching?', options: ['TTL', 'ECL', 'CMOS'], answer: 2, explain: 'In a CMOS gate one of the two networks is always off, so at rest no path joins the supply to ground. TTL and ECL draw current in both states.' } },
      { h: 'What to take away' },
      { list: ['RTL, DTL: resistor pull-ups, slow rising edges.', 'TTL: multi-emitter input, totem-pole output.', 'ECL: unsaturated, fast, power-hungry. CMOS: almost no static power, rail-to-rail swing.'] },
      { exercise: 'p11x-which-family' },
    ],
  });

  L({
    id: 'p11l-outputs', chapter: 'p11-ch-families', title: 'Totem pole, open collector, tristate', minutes: 7,
    summary: 'Two totem-pole outputs on one wire can fight. An open-collector output only pulls down, so several can share a wire with one resistor: a wired AND. A tristate output can let go of the wire entirely.',
    blocks: [
      'A totem-pole output always drives its wire, high or low. Tie two of them together and set one high and one low: the upper transistor of one and the lower transistor of the other form a low-resistance path from the supply to ground. The wire sits at some useless middle voltage, and the transistors heat up.',
      { topic: 'ic-ttl-out', input: { mode: 'oc' }, frame: 1, caption: 'Three open-collector outputs on one wire with a shared pull-up resistor. Output 2 pulls low, and nothing fights it.' },
      'Remove the upper transistor and you have an **open-collector** output: it can pull the wire down, or let go. Join several of them with one pull-up resistor, and the wire is 1 only when every output lets go: a **wired AND**, made with no gate at all.',
      { predict: { q: 'Three open-collector NAND gates compute (AB)′, (CD)′ and E′, and share one pulled-up wire. What is the wire?', options: ['AB + CD + E', '(AB + CD + E)′', '(AB)′ + (CD)′ + E′'], answer: 1, explain: 'The wired AND gives (AB)′(CD)′E′, which by De Morgan is (AB + CD + E)′: an AND-OR-INVERT, for free.' } },
      'A **tristate** output keeps both transistors but adds an enable. Disabled, it turns both off and the output floats, as if disconnected. Many tristate outputs can share a bus, as long as at most one is enabled at a time.',
      { h: 'What to take away' },
      { list: ['Never tie two totem-pole outputs together.', 'Open-collector outputs plus one pull-up make a wired AND.', 'Tristate outputs share a bus, one enabled at a time.'] },
      { exercise: 'p11x-wired-and' },
      { exercise: 'p11x-wired-gates' },
    ],
  });

  L({
    id: 'p11l-interface', chapter: 'p11-ch-families', title: 'Connecting one family to another', minutes: 6,
    summary: 'Compare the driver\'s output levels with the load\'s input levels: both margins must be positive. Then compare currents for the fan-out. A pull-up resistor or a TTL-compatible input fixes the commonest mismatch.',
    blocks: [
      'A system often mixes families. Before joining a driver to a load, ask two questions. Do the levels fit: is the driver\'s VOH above the load\'s VIH, and its VOL below the load\'s VIL? And do the currents fit: how many such loads can the driver serve?',
      { topic: 'ic-interface', input: { pair: 'TTL>HC' }, frame: 1, caption: 'TTL driving high-speed CMOS: the high margin is negative. A guaranteed TTL 1 at 2.4 V may never reach the 3.5 V an HC input needs.' },
      { predict: { q: 'High-speed CMOS drives standard TTL. Both margins are positive. What limits the connection?', options: ['Nothing', 'The current: each low TTL input sends 1.6 mA back into the CMOS output', 'The CMOS output cannot reach TTL\'s VIH'], answer: 1, explain: 'An HC output sinks about 4 mA while staying low, so it can drive only ' + (S.Cmos ? S.Cmos.interface('HC', 'TTL').fanout : 2) + ' standard TTL inputs.' } },
      { tip: 'The 74HCT parts are CMOS with TTL-style input levels (VIH = 2.0 V), made exactly for being driven by TTL.' },
      { h: 'What to take away' },
      { list: ['Levels first: VOH(driver) ≥ VIH(load) and VOL(driver) ≤ VIL(load).', 'Then currents, for the fan-out.', 'TTL into CMOS: a pull-up resistor, or an HCT input.'] },
      { exercise: 'p11x-interface' },
      { exercise: 'p11x-ttl-hc-margin' },
      { exercise: 'p11x-fanout-hc' },
    ],
  });

  // =========================================================================================================
  // Chapter 3: switch-level CMOS
  // =========================================================================================================
  L({
    id: 'p11l-cmos-gates', chapter: 'p11-ch-cmos', title: 'Gates from complementary switches', minutes: 8,
    summary: 'An nMOS transistor conducts when its gate is 1, a pMOS when its gate is 0. A pull-down network of nMOS switches and its dual pull-up of pMOS switches make sure exactly one of them conducts for every input.',
    blocks: [
      'At the level of switches, a CMOS gate is two networks. The **pull-down** of nMOS transistors joins the output to ground; an nMOS switch closes when its gate is 1. The **pull-up** of pMOS transistors joins the output to VDD; a pMOS switch closes when its gate is 0.',
      { topic: 'cmos-gates', input: { cell: 'nor2' }, frame: 4, caption: 'A two-input NOR with A = 0, B = 1: M2 pulls Y to ground, and the series pMOS chain is broken at M4.' },
      'In the pull-down, switches in series make an AND (both must close), switches in parallel an OR. The pull-down conducts when its function G is 1, and then Y = 0; so the gate computes Y = G′. For every input, exactly one network must conduct, so the pull-up must be the **dual**: every series group in the pull-down becomes parallel in the pull-up, and every parallel group series.',
      { predict: { q: 'A NAND\'s pull-down is A and B in series. What is its pull-up?', options: ['pMOS A and B in series', 'pMOS A and B in parallel', 'nMOS A and B in parallel'], answer: 1, explain: 'The dual of series is parallel. Y must be 1 when A = 0 or B = 0, and a pMOS closes on a 0: two pMOS in parallel.' } },
      { topic: 'cmos-broken', input: { net: 'series' }, frame: 2, caption: 'A NAND whose pull-up was wrongly put in series: with A = 0, B = 1 neither network conducts and Y floats on its stored charge.' },
      { warn: 'If both networks can conduct at once, the supply is shorted to ground through them; if neither can, the output floats. Both are design errors, not just slow gates.' },
      { h: 'What to take away' },
      { list: ['nMOS conducts on 1, pMOS on 0.', 'Pull-down for G gives Y = G′; series is AND, parallel is OR.', 'The pull-up is the dual: exactly one network conducts for every input.'] },
      { exercise: 'p11x-complementary' },
      { exercise: 'p11x-complementary-2' },
      { exercise: 'p11x-floating' },
    ],
  });

  L({
    id: 'p11l-complex', chapter: 'p11-ch-cmos', title: 'Complex gates and transmission gates', minutes: 8,
    summary: 'Any function written as a complement (…)′ is one CMOS stage: its inside becomes the pull-down. And two switches side by side make a transmission gate, which passes a signal both ways while its control is on.',
    blocks: [
      'There is no need to stop at NAND and NOR. Write a function as the complement of a sum of products, such as Y = (AB + C)′. The inside, AB + C, is the pull-down: A and B in series, the pair in parallel with C. The pull-up is its dual. Six transistors and one gate delay give what would otherwise take an AND, an OR and an inverter.',
      { topic: 'cmos-complex', input: { f: "((A + B)C + D)'" }, frame: 1, caption: 'Y = ((A + B)C + D)′: the pull-down is A ∥ B, in series with C, all in parallel with D. Eight transistors, one stage.' },
      { predict: { q: 'How many transistors does Y = AB + C need, without the complement?', options: ['6', '8', '10'], answer: 1, explain: 'One stage gives (AB + C)′ in 6 transistors; an inverter after it gives AB + C, 2 more: 8. A CMOS stage always inverts.' } },
      'A **transmission gate** is an nMOS and a pMOS side by side between two nodes, gated by C and C′. While C = 1 both conduct and the signal passes, in either direction; while C = 0 both are off and the two sides are cut apart. Two of them make a 2:1 multiplexer in six transistors.',
      { topic: 'cmos-tgate', input: { cell: 'tgmux' }, frame: 4, caption: 'A multiplexer of two transmission gates: with S = 1 the gate from B conducts, and Y = B.' },
      { h: 'What to take away' },
      { list: ['Y = (G)′ in one stage: G is the pull-down, its dual the pull-up.', 'A function that is not a complement needs an output inverter too.', 'A transmission gate passes a signal while its control is on.'] },
      { exercise: 'p11x-pulldown' },
      { exercise: 'p11x-pullup' },
      { exercise: 'p11x-transistors' },
      { exercise: 'p11x-cell-circuit' },
      { exercise: 'p11x-tgmux' },
      { exercise: 'p11x-tg-wave' },
    ],
  });

  // =========================================================================================================
  // Exercises
  // =========================================================================================================
  // ---- chapter 1 -----------------------------------------------------------------------------------------------
  ex({
    id: 'p11x-nm-ttl', chapter: 'p11-ch-params', title: 'TTL\'s high margin', level: 1, kind: 'number', answer: fam('TTL').NMH, tolerance: 0.005, higherLower: true,
    text: ['Standard TTL guarantees VOH = ' + fam('TTL').VOH + ' V and VOL = ' + fam('TTL').VOL + ' V at its outputs, and needs VIH = ' + fam('TTL').VIH + ' V and VIL = ' + fam('TTL').VIL + ' V at its inputs. What is its high noise margin NMH, in volts?'],
    hints: ['The high margin is about a 1: compare what the output guarantees with what the input needs.', 'NMH = VOH − VIH.', 'NMH = 2.4 − 2.0 = 0.4 V.'],
    solution: 0.4, wrong: [0.8, 2.0, 0.4 - 0.8],
  });
  ex({
    id: 'p11x-nm-hct', chapter: 'p11-ch-params', title: 'The weaker margin of HCT', level: 2, kind: 'number', answer: fam('HCT').NML, tolerance: 0.005, higherLower: true,
    text: ['74HCT parts give VOH = ' + fam('HCT').VOH + ' V and VOL = ' + fam('HCT').VOL + ' V, and read VIH = ' + fam('HCT').VIH + ' V and VIL = ' + fam('HCT').VIL + ' V. Work out both margins. What is the smaller one, in volts?'],
    hints: ['NMH = VOH − VIH; NML = VIL − VOL.', 'NMH = 4.4 − 2.0 = 2.4 V. NML = 0.8 − 0.33.', 'NML = 0.47 V, the smaller: HCT reads like TTL, so its low margin is TTL-sized.'],
    solution: 0.47, wrong: [2.4, 1.07, 0.4],
  });
  ex({
    id: 'p11x-noise', chapter: 'p11-ch-params', title: 'Noise on a 0', level: 1, kind: 'choice',
    options: ['0', '1', 'Indeterminate: nothing is guaranteed'], answer: 2,
    whyNot: { 0: 'Add the noise to VOL: is the result still at or below VIL?', 1: 'Is 1.0 V at or above VIH = 2.0 V?' },
    text: ['A 74LS output sends a 0 at VOL = ' + fam('LSTTL').VOL + ' V. On the way, 0.5 V of noise is added. The receiving 74LS input has VIL = ' + fam('LSTTL').VIL + ' V and VIH = ' + fam('LSTTL').VIH + ' V. What does it read?'],
    hints: ['The input sees VOL plus the noise.', '0.5 + 0.5 = 1.0 V.', 'Above VIL (0.8 V) and below VIH (2.0 V): indeterminate. The noise exceeded NML = 0.3 V.'],
    solution: 2, wrong: [0, 1],
  });
  ex({
    id: 'p11x-vtc-vm', chapter: 'p11-ch-params', title: 'A weak pull-up', level: 2, kind: 'number', answer: Cm().vtc({ kp: 0.4 }).VM, tolerance: 0.03, higherLower: true,
    text: ['A CMOS inverter at VDD = 5 V has thresholds Vtn = 0.7 V and Vtp = −0.7 V, and its pMOS is only 0.4 times as strong as its nMOS (kp/kn = 0.4). Its threshold is VM = (Vtn + r(VDD + Vtp)) / (1 + r) with r = √(kp/kn). What is VM, in volts, to two decimals?'],
    hints: ['r = √0.4 ≈ 0.632.', 'VM = (0.7 + 0.632 × 4.3) / 1.632.', 'VM ≈ 2.10 V: below VDD/2, since the weak pull-up loses the fight early.'],
    solution: 2.1, wrong: [2.5, 2.98, 1.5],
  });
  ex({
    id: 'p11x-vtc-dir', chapter: 'p11-ch-params', title: 'Which way does the curve move?', level: 1, kind: 'choice',
    options: ['VM rises and NMH shrinks', 'VM falls and NML shrinks', 'Nothing changes: the curve depends only on VDD'], answer: 0,
    whyNot: { 1: 'A stronger pull-up keeps the output high for longer as Vin rises.', 2: 'The fall happens where the two transistors\' currents balance, which depends on their strengths.' },
    text: ['An inverter\'s pMOS is made three times as strong as its nMOS (kp/kn = 3). Compared with matched transistors, what happens to the switching threshold VM and the high noise margin?'],
    hints: ['The pull-up now wins the fight until the input is higher.', 'VM rises from 2.5 V to about 2.98 V; VIH rises with it.', 'NMH = VOH − VIH falls (from 1.6 V to about ' + Cm().vtc({ kp: 3 }).NMH + ' V) while NML grows.'],
    solution: 0, wrong: [1, 2],
  });
  ex({
    id: 'p11x-fanout-ls', chapter: 'p11-ch-params', title: 'The fan-out of LS-TTL', level: 1, kind: 'number', answer: fam('LSTTL').fanout, higherLower: true,
    text: ['A 74LS output can sink IOL = ' + fam('LSTTL').IOL + ' mA and source |IOH| = ' + Math.abs(fam('LSTTL').IOH) + ' mA. Each 74LS input sends |IIL| = ' + Math.abs(fam('LSTTL').IIL) + ' mA back when low and draws IIH = ' + fam('LSTTL').IIH + ' mA when high. How many 74LS inputs can one output drive?'],
    hints: ['Work out each state on its own and take the smaller.', 'Low: 8 / 0.4 = 20. High: 0.4 / 0.02 = 20.', 'Fan-out 20.'],
    solution: 20, wrong: [10, 40, 400],
  });
  ex({
    id: 'p11x-fanout-mix', chapter: 'p11-ch-params', title: 'Mixed loads', level: 3, kind: 'number', higherLower: true,
    answer: (() => { const t = fam('TTL'), l = fam('LSTTL'); const lo = t.IOL - 6 * Math.abs(t.IIL), hi = Math.abs(t.IOH) - 6 * t.IIH; return Math.floor(Math.min(lo / Math.abs(l.IIL), hi / l.IIH) + 1e-9); })(),
    text: ['A standard TTL output (IOL = 16 mA, |IOH| = 0.4 mA) already drives 6 standard TTL inputs (|IIL| = 1.6 mA, IIH = 0.04 mA). How many 74LS inputs (|IIL| = 0.4 mA, IIH = 0.02 mA) can it drive as well?'],
    hints: ['Subtract what the 6 TTL inputs take in each state.', 'Low: 16 − 6 × 1.6 = 6.4 mA left, room for 16 LS inputs. High: 0.4 − 6 × 0.04 = 0.16 mA left, room for 8.', '8: the high state runs out first.'],
    solution: 8, wrong: [16, 4, 10],
  });
  ex({
    id: 'p11x-delay-ttl', chapter: 'p11-ch-params', title: 'Three inverters in TTL', level: 1, kind: 'timing', circuit: 'a = NOT(A)\nb = NOT(a)\nY = NOT(b)', tech: 'TTL', ask: 'critical',
    text: ['Three inverters in a chain, with the TTL preset (an inverter takes 12 ns to rise and 8 ns to fall). Counting each gate at its slower delay, as worst-case timing does, how long is the path from A to Y, in ns?'],
    hints: ['Worst-case timing takes the larger of tPLH and tPHL for every gate.', 'Each inverter: max(12, 8) = 12 ns.', '3 × 12 = 36 ns.'],
    solution: 36, wrong: [24, 28, 32],
  });
  ex({
    id: 'p11x-delay-ls', chapter: 'p11-ch-params', title: 'A NAND chain in LS-TTL', level: 2, kind: 'timing', circuit: 'n1 = NAND(A, B)\nn2 = NAND(n1, C)\nY = NAND(n2, D)', tech: 'LS-TTL', ask: 'critical',
    text: ['Three NAND gates in a chain, with the LS-TTL preset. What is the worst-case delay from A to Y, in ns?'],
    hints: ['The longest path goes through all three gates.', 'An LS-TTL NAND takes 9 ns to rise and 10 to fall; worst case 10.', '3 × 10 = 30 ns.'],
    solution: 30, wrong: [27, 20, 33],
  });
  ex({
    id: 'p11x-delay-cmos', chapter: 'p11-ch-params', title: 'NOR, NOR, NOT in CMOS', level: 2, kind: 'timing', circuit: 'n1 = NOR(A, B)\nn2 = NOR(n1, C)\nY = NOT(n2)', tech: 'CMOS', ask: 'critical',
    text: ['n1 = (A + B)′, n2 = (n1 + C)′, Y = n2′, with the CMOS preset. What is the worst-case delay from A to Y, in ns?'],
    hints: ['Find the delay of each kind of gate in the preset.', 'A CMOS NOR takes 9 ns and an inverter 8 ns.', '9 + 9 + 8 = 26 ns.'],
    solution: 26, wrong: [27, 24, 18],
  });
  ex({
    id: 'p11x-chain-fall', chapter: 'p11-ch-params', title: 'A falling edge through three gates', level: 2, kind: 'number', higherLower: true,
    answer: (() => { const g = S.Tech.presets['LS-TTL'].gate.NOT; return g[0] + g[1] + g[0]; })(),
    text: ['Three LS-TTL inverters in a chain: each takes tPLH = ' + S.Tech.presets['LS-TTL'].gate.NOT[0] + ' ns to pull its output up and tPHL = ' + S.Tech.presets['LS-TTL'].gate.NOT[1] + ' ns to pull it down. The input falls. How many ns until the last output changes?'],
    hints: ['A falling input makes the first output rise.', 'Rise, fall, rise.', '9 + 10 + 9 = 28 ns.'],
    solution: 28, wrong: [29, 30, 27],
  });
  ex({
    id: 'p11x-dyn-power', chapter: 'p11-ch-params', title: 'Dynamic power', level: 2, kind: 'number', answer: r2(20 * 5 * 5 * 8 * 1e-3), tolerance: 0.01, higherLower: true,
    text: ['A CMOS output at VDD = 5 V switches a 20 pF load at 8 MHz. Using P = C·V²·f, how much dynamic power does it draw, in mW?'],
    hints: ['Keep the units straight: pF × V² × MHz gives µW.', '20 × 25 × 8 = 4000 µW.', '4 mW.'],
    solution: 4, wrong: [0.8, 4000, 20],
  });
  ex({
    id: 'p11x-speed-power', chapter: 'p11-ch-params', title: 'The speed-power product', level: 2, kind: 'number', answer: r2(fam('LSTTL').tpd * fam('LSTTL').power), tolerance: 0.05, higherLower: true,
    text: ['A 74LS gate has tpd = ' + fam('LSTTL').tpd + ' ns and draws ' + fam('LSTTL').power + ' mW. What is its speed-power product, in pJ? (Standard TTL\'s is ' + fam('TTL').speedPower + ' pJ.)'],
    hints: ['Multiply the delay by the power.', 'ns × mW = pJ.', '9.5 × 2 = 19 pJ.'],
    solution: 19, wrong: [4.75, 11.5, 90],
  });
  ex({
    id: 'p11x-crossover', chapter: 'p11-ch-params', title: 'When CMOS stops winning', level: 3, kind: 'number', tolerance: 0.3, higherLower: true,
    answer: r2((fam('TTL').power - fam('HC').power) / (15e-3 * 25)),
    text: ['A standard TTL gate draws ' + fam('TTL').power + ' mW whatever it does. An HC gate at 5 V draws ' + fam('HC').power + ' mW standing still plus C·V²·f when switching, into 15 pF. Counting only that, at what switching rate (MHz) does the HC gate draw as much as the TTL one? Give one decimal.'],
    hints: ['Set 0.0025 + 15 pF × 25 V² × f equal to 10 mW.', '15 pF × 25 V² = 375 pF·V², which is 0.375 mW per MHz.', 'f = (10 − 0.0025) / 0.375 ≈ 26.7 MHz.'],
    solution: 26.7, wrong: [52.3, 2.7, 266.6],
  });

  // ---- design-style exercises: delays seen on a waveform, a path, a clock, and a fan-out limit ----------------------
  ex({
    id: 'p11x-nand-wave-ttl', chapter: 'p11-ch-params', title: 'A NAND gate, late', level: 2, kind: 'waveform', tech: 'TTL', slotNs: 5,
    circuit: 'Y = NAND(A, B)', outputs: ['Y'], inputs: { A: '0111100010000', B: '1111111111111' }, given: { Y: '1????????????' },
    text: ['A TTL NAND gate (the preset: 11 ns for the output to rise, 7 ns to fall) with B held at 1. Each slot lasts 5 ns. A rises at 5 ns, falls at 25 ns, and gives one more short pulse from 40 to 45 ns. Draw Y as it is at the end of each slot.'],
    hints: ['With B = 1 the gate inverts A, but late: the output falls 7 ns after A rises and rises 11 ns after A falls.', 'A rises at 5 ns: Y falls at 12 ns, so slot 3 (10 to 15 ns) is the first to end at 0. A falls at 25 ns: Y rises at 36 ns, in slot 8.', 'The 5 ns pulse at 40 ns is shorter than the gate\'s 7 ns delay, and a gate does not pass a pulse shorter than its delay: Y stays 1. Y: 1 1 0 0 0 0 0 1 1 1 1 1 1.'],
    solution: { Y: '1100000111111' }, wrong: [{ Y: '1000011101111' }, { Y: '1100001111111' }, { Y: '1100000111011' }],
  });
  ex({
    id: 'p11x-chain-wave-ttl', chapter: 'p11-ch-params', title: 'A pulse through three inverters', level: 3, kind: 'waveform', tech: 'TTL', slotNs: 6,
    circuit: 'a = NOT(A)\nb = NOT(a)\nY = NOT(b)', outputs: ['Y'], inputs: { A: '01111110000000' }, given: { Y: '1?????????????' },
    text: ['Three TTL inverters in a chain, each taking 12 ns to pull its output up and 8 ns to pull it down. Each slot lasts 6 ns; A rises at 6 ns and falls at 42 ns. Draw Y as it is at the end of each slot.'],
    hints: ['A rising edge goes through as a fall, a rise and a fall: 8 + 12 + 8 ns.', 'A rises at 6 ns, so Y falls at 34 ns, in slot 6. A falling edge goes through as rise, fall, rise: 12 + 8 + 12 = 32 ns, so Y rises at 74 ns, in slot 13.', 'Y: 1 1 1 1 1 0 0 0 0 0 0 0 1 1. The two edges are delayed by different amounts, so the 36 ns pulse on A comes out of the chain 40 ns long.'],
    solution: { Y: '11111000000011' }, wrong: [{ Y: '10000001111111' }, { Y: '11111000000111' }, { Y: '11111100000011' }],
  });
  ex({
    id: 'p11x-arrival-ttl', chapter: 'p11-ch-params', title: 'When the middle gate settles', level: 2, kind: 'timing', tech: 'TTL', ask: 'arrival', net: 'b.y',
    circuit: 'a = NAND(A, B)\nb = NOR(a, C)\nY = NOT(b)',
    text: ['a = (AB)′, b = (a + C)′ and Y = b′, in TTL (rise/fall: NAND 11/7 ns, NOR 12/8 ns, NOT 12/8 ns). The inputs change at 0 ns. Counting each gate at its slower delay, by when has the output of the NOR gate b settled, in ns?'],
    hints: ['The latest path to b starts at A or B and goes through the NAND, then the NOR.', 'Worst case: NAND max(11, 7) = 11 ns; NOR max(12, 8) = 12 ns.', '11 + 12 = 23 ns. (C reaches b in only 12 ns, and Y settles 12 ns after b, at 35 ns.)'],
    solution: 23, wrong: [12, 35, 19],
  });
  ex({
    id: 'p11x-aoi-ls', chapter: 'p11-ch-params', title: 'AND-OR-invert in LS-TTL', level: 2, kind: 'timing', tech: 'LS-TTL', ask: 'critical',
    circuit: 'a = AND(A, B)\nb = AND(C, D)\nc = OR(a, b)\nY = NOT(c)',
    text: ['Y = (AB + CD)′ from two AND gates, an OR and an inverter, in LS-TTL (rise/fall: AND 8/10 ns, OR 14/14 ns, NOT 9/10 ns). What is the worst-case delay from an input to Y, in ns?'],
    hints: ['Every path passes through one AND, the OR and the inverter.', 'Worst case: AND 10 ns, OR 14 ns, NOT 10 ns.', '10 + 14 + 10 = 34 ns. The same gates in standard TTL take 43.5 ns.'],
    solution: 34, wrong: [43.5, 32, 24],
  });
  ex({
    id: 'p11x-fmax-ls', chapter: 'p11-ch-params', title: 'How fast can an LS-TTL counter run?', level: 2, kind: 'timing', tech: 'LS-TTL', ask: 'fmax',
    circuit: 'q0 = DFF(n0)\nn0 = NOT(q0)\nq1 = DFF(d1)\nd1 = XOR(q1, q0)\nQ0 = q0\nQ1 = q1',
    text: ['A 2-bit counter in LS-TTL: q0 toggles through an inverter, and q1 through an XOR with q0. The flip-flops take up to 20 ns from clock to Q and need 20 ns of setup; the XOR takes up to 12 ns and the inverter 10. What is the maximum clock frequency, in MHz?'],
    hints: ['The period must cover clock-to-Q, the slowest logic in front of a D input, and the setup time.', 'The slowest path runs from a flip-flop through the XOR into D1: 20 + 12 + 20 ns.', 'A period of 52 ns: 1000 / 52 ≈ 19.2 MHz.'],
    solution: 19.231, wrong: [52, 20, 25],
  });
  ex({
    id: 'p11x-fanout-nand', chapter: 'p11-ch-params', title: 'Within a fan-out of two', level: 3, kind: 'circuit', ref: 'AB + AC + AD', inputs: ['A', 'B', 'C', 'D'], outputs: ['F'], parts: ['NAND'], maxFanout: 2, maxGates: 6,
    text: ['Input A comes from a weak driver that can feed only two gate inputs. Build F = AB + AC + AD from NAND gates, with no input and no gate output driving more than two gate inputs, and at most six gates.'],
    hints: ['The NAND-NAND form needs A in three gates: one too many.', 'Factor it: F = A(B + C + D). B + C + D is a NAND of B′, C′ and D′, and each of those is a NAND with its input on both pins.', 'nb = NAND(B, B), nc = NAND(C, C), nd = NAND(D, D), o = NAND(nb, nc, nd), g = NAND(A, o), F = NAND(g, g).'],
    solution: 'nb = NAND(B, B)\nnc = NAND(C, C)\nnd = NAND(D, D)\no = NAND(nb, nc, nd)\ng = NAND(A, o)\nF = NAND(g, g)',
    wrong: ['n1 = NAND(A, B)\nn2 = NAND(A, C)\nn3 = NAND(A, D)\nF = NAND(n1, n2, n3)', 'nb = NAND(B, B)\nnc = NAND(C, C)\nnd = NAND(D, D)\no = NAND(nb, nc, nd)\ng = NAND(A, o)\nF = NAND(g, A)', 'nb = NAND(B, B)\nnc = NAND(C, C)\nnd = NAND(D, D)\no = NAND(nb, nc, nd)\nF = AND(A, o)'],
    why: 'Factoring shares A among the terms, so it drives one gate instead of three.',
  });

  // ---- chapter 2 -----------------------------------------------------------------------------------------------
  ex({
    id: 'p11x-which-family', chapter: 'p11-ch-families', title: 'Match the family', level: 1, kind: 'choice',
    options: ['ECL', 'CMOS', 'Standard TTL', 'RTL'], answer: 0,
    whyNot: { 1: 'CMOS saturates nothing either, but it draws almost no current at rest.', 2: 'TTL saturates its transistors, and its logic swing is several volts.', 3: 'RTL saturates its transistors, which makes it slow.' },
    text: ['Which family steers a constant current between transistors that never saturate, switches in about ' + fam('ECL').tpd + ' ns, and draws about ' + fam('ECL').power + ' mW per gate whether it switches or not?'],
    hints: ['Saturated transistors are slow to turn off; which family avoids them?', 'Its outputs swing less than a volt, between about −0.9 V and −1.75 V.', 'Emitter-coupled logic, ECL.'],
    solution: 0, wrong: [1, 2],
  });
  ex({
    id: 'p11x-wired-and', chapter: 'p11-ch-families', title: 'A wired AND', level: 2, kind: 'expr', ref: "(AB + CD + E)'", vars: ['A', 'B', 'C', 'D', 'E'],
    text: ['Three open-collector gates share one wire with a pull-up resistor: a 2-input NAND of A and B, a 2-input NAND of C and D, and an inverter of E. Write the wire\'s value Y.'],
    hints: ['The wire is 1 only when every output lets go: a wired AND of the three outputs.', 'Y = (AB)′ · (CD)′ · E′.', 'By De Morgan, Y = (AB + CD + E)′.'],
    solution: "(AB + CD + E)'", wrong: ['AB + CD + E', "(AB)' + (CD)' + E'"],
  });
  ex({
    id: 'p11x-wired-gates', chapter: 'p11-ch-families', title: 'The wired AND, with gates', level: 2, kind: 'circuit', ref: "(AB)'(CD)'E'", inputs: ['A', 'B', 'C', 'D', 'E'], outputs: ['Y'], parts: ['NAND', 'NOT', 'AND'], maxGates: 4,
    text: ['On a board with totem-pole parts only, the wired AND of the last exercise needs real gates. Build Y = (AB)′ · (CD)′ · E′ from NAND, NOT and AND gates, at most four.'],
    hints: ['Make each of the three outputs as before: two NANDs and an inverter.', 'Then one 3-input AND does what the shared wire did.', 'p = NAND(A, B), q = NAND(C, D), r = NOT(E), Y = AND(p, q, r).'],
    solution: 'p = NAND(A, B)\nq = NAND(C, D)\nr = NOT(E)\nY = AND(p, q, r)', wrong: ['p = NAND(A, B)\nq = NAND(C, D)\nY = AND(p, q, E)', 'p = AND(A, B)\nq = AND(C, D)\nr = NOT(E)\nY = AND(p, q, r)'],
  });
  ex({
    id: 'p11x-interface', chapter: 'p11-ch-families', title: 'Which connections work?', level: 3, kind: 'choice',
    options: ['TTL driving 74HC', 'TTL driving 74HCT', '74HC driving TTL', '74LS driving 74HC'],
    answer: ['TTL>HC', 'TTL>HCT', 'HC>TTL', 'LSTTL>HC'].map((p, i) => (Cm().interface(...p.split('>')).ok ? i : -1)).filter((i) => i >= 0),
    text: ['Comparing levels only (VOH of the driver against VIH of the load, VOL against VIL), which of these connections work directly? Choose every one.', { table: [['Family', 'VOH / VOL', 'VIH / VIL']].concat(['TTL', 'LSTTL', 'HC', 'HCT'].map((k) => { const r = famRow(k); return [r[0], r[1] + ' / ' + r[2], r[3] + ' / ' + r[4]]; })), caption: 'In volts, at a 5 V supply.' }],
    hints: ['A 74HC input needs 3.5 V for a 1.', 'TTL and 74LS outputs guarantee only 2.4 and 2.7 V; HCT needs just 2.0 V; HC outputs reach 4.9 V.', 'TTL → HCT and HC → TTL work; TTL → HC and 74LS → HC do not.'],
    solution: [1, 2], wrong: [[0, 1, 2, 3], [1], [0, 3]],
  });
  ex({
    id: 'p11x-ttl-hc-margin', chapter: 'p11-ch-families', title: 'A negative margin', level: 2, kind: 'number', answer: Cm().interface('TTL', 'HC').highMargin, tolerance: 0.005, higherLower: true,
    text: ['A standard TTL output (VOH = ' + fam('TTL').VOH + ' V) drives a 74HC input (VIH = ' + fam('HC').VIH + ' V). What is the high-level margin VOH − VIH, in volts? (It can be negative.)'],
    hints: ['Subtract the load\'s VIH from the driver\'s VOH.', '2.4 − 3.5.', '−1.1 V: a guaranteed TTL 1 may not be read as a 1. A pull-up resistor or an HCT part fixes it.'],
    solution: -1.1, wrong: [1.1, 0.4, 1.4],
  });
  ex({
    id: 'p11x-fanout-hc', chapter: 'p11-ch-families', title: 'CMOS driving TTL', level: 2, kind: 'number', answer: Cm().interface('HC', 'TTL').fanout, higherLower: true,
    text: ['A 74HC output can sink ' + fam('HC').IOL + ' mA and source ' + Math.abs(fam('HC').IOH) + ' mA while keeping its levels. How many standard TTL inputs (|IIL| = 1.6 mA, IIH = 0.04 mA) can it drive?'],
    hints: ['Low: 4 / 1.6 = 2.5, so 2 whole inputs.', 'High: 4 / 0.04 = 100.', 'The smaller: 2.'],
    solution: 2, wrong: [3, 10, 100],
  });

  // ---- chapter 3 -----------------------------------------------------------------------------------------------
  ex({
    id: 'p11x-complementary', chapter: 'p11-ch-cmos', title: 'The NAND\'s pull-up', level: 1, kind: 'choice',
    options: ['Two pMOS transistors in parallel, gated by A and B', 'Two pMOS transistors in series, gated by A and B', 'Two nMOS transistors in parallel, gated by A and B'], answer: 0,
    whyNot: { 1: 'In series, with A = 0 and B = 1 neither network conducts: Y floats.', 2: 'nMOS transistors conduct on 1s; the pull-up must conduct exactly when the pull-down does not.' },
    text: ['A CMOS gate\'s pull-down network is two nMOS transistors in series, gated by A and B, from Y to ground. Which pull-up network makes the gate complementary, so that exactly one network conducts for every input?'],
    hints: ['The pull-down conducts when AB = 1, so Y = (AB)′ must be 1 when A = 0 or B = 0.', 'A pMOS conducts when its gate is 0, and "or" is parallel.', 'Two pMOS in parallel: the dual of series.'],
    solution: 0, wrong: [1, 2],
  });
  ex({
    id: 'p11x-complementary-2', chapter: 'p11-ch-cmos', title: 'The dual of a complex pull-down', level: 3, kind: 'choice',
    options: ['A and B in parallel, in series with C', 'A and B in series, in parallel with C', 'A, B and C all in parallel', 'A, B and C all in series'], answer: 1,
    whyNot: { 0: 'That is the same shape as the pull-down. With A = B = 0, C = 1 neither network conducts.', 2: 'With A = 0, B = 1, C = 1 both networks conduct: a short from VDD to GND.', 3: 'With A = 0, B = 0, C = 1 neither network conducts: Y floats.' },
    text: ['A pull-down network has nMOS A and B in parallel, and that pair in series with nMOS C. So it conducts for (A + B)C and the gate computes Y = ((A + B)C)′. Which pMOS pull-up is its dual?'],
    hints: ['Swap series and parallel at every level.', 'The parallel pair A ∥ B becomes A and B in series; the series link to C becomes parallel.', '(A series B) in parallel with C: it conducts for A′B′ + C′, exactly when the pull-down does not.'],
    solution: 1, wrong: [0, 2, 3],
  });
  ex({
    id: 'p11x-floating', chapter: 'p11-ch-cmos', title: 'A missing transistor', level: 2, kind: 'choice',
    options: ['A = 0, B = 0', 'A = 0, B = 1', 'A = 1, B = 0', 'A = 1, B = 1'],
    answer: (() => { const n = Cm().network('m', { inputs: ['A', 'B'], outputs: ['Y'] }); n.n('A', 'Y', 'n1'); n.n('B', 'n1', 'GND'); n.p('A', 'VDD', 'Y'); return Cm().check(n, "(AB)'").problems.map((p) => p.inputs.A * 2 + p.inputs.B); })(),
    text: ['A NAND gate was built with its pull-down (nMOS A and B in series) but only one pMOS in the pull-up, gated by A; the pMOS for B is missing. For which inputs does Y float? Choose every one.'],
    hints: ['Y floats when neither network conducts.', 'The pull-down conducts only for A = B = 1; the remaining pMOS conducts whenever A = 0.', 'Only A = 1, B = 0 leaves both off.'],
    solution: [2], wrong: [[1], [1, 2], [3]], whyNot: { 0: 'With A = 0 the remaining pMOS conducts: Y = 1, driven.', 1: 'With A = 0 the remaining pMOS conducts: Y = 1, driven.', 3: 'With A = B = 1 the pull-down conducts: Y = 0, driven.' },
  });
  ex({
    id: 'p11x-pulldown', chapter: 'p11-ch-cmos', title: 'What the pull-down conducts for', level: 2, kind: 'expr', ref: '(A + B)C + D', vars: ['A', 'B', 'C', 'D'],
    text: ['A one-stage CMOS gate computes Y = ((A + B)C + D)′. Write the function G for which its nMOS pull-down network conducts.'],
    hints: ['A single stage gives Y = G′, where G is what the pull-down conducts for.', 'Strip the outer complement.', 'G = (A + B)C + D: A ∥ B, in series with C, all in parallel with D.'],
    solution: '(A + B)C + D', wrong: ["((A + B)C + D)'", 'AB + C + D'],
  });
  ex({
    id: 'p11x-pullup', chapter: 'p11-ch-cmos', title: 'What the pull-up conducts for', level: 3, kind: 'expr', ref: "(A'B' + C')D'", vars: ['A', 'B', 'C', 'D'],
    text: ['For the same gate, Y = ((A + B)C + D)′, write the condition under which the pMOS pull-up conducts, in terms of complemented inputs (each pMOS conducts on a 0).'],
    hints: ['The pull-up is the dual network: series and parallel swapped, each switch closing on a 0.', 'A ∥ B becomes A series B (conducts for A′B′); in parallel with C (A′B′ + C′); all that in series with D (· D′).', '(A′B′ + C′)D′, which is exactly Y.'],
    solution: "(A'B' + C')D'", wrong: ["(A' + B')C' + D'", "A'B'C'D'"],
  });
  ex({
    id: 'p11x-transistors', chapter: 'p11-ch-cmos', title: 'Count the transistors', level: 1, kind: 'number', answer: Cm().fromExpression('AB + C').transistors, higherLower: true,
    text: ['How many transistors does a static CMOS cell for Y = AB + C (not complemented) need?'],
    hints: ['One stage gives (AB + C)′: a transistor in each network for each literal.', '3 nMOS + 3 pMOS = 6 for (AB + C)′; then an inverter.', '6 + 2 = 8.'],
    solution: 8, wrong: [6, 10, 12],
  });
  ex({
    id: 'p11x-cell-circuit', chapter: 'p11-ch-cmos', title: 'The cell as gates', level: 2, kind: 'circuit', ref: "(AB + CD)'", inputs: ['A', 'B', 'C', 'D'], outputs: ['Y'], parts: ['AND', 'NOR'], maxGates: 3,
    text: ['A CMOS cell has nMOS A and B in series, in parallel with nMOS C and D in series, from Y to ground, and the dual pull-up. Build the same function from AND and NOR gates, at most three.'],
    hints: ['The pull-down conducts for AB + CD, so Y = (AB + CD)′.', 'Two ANDs make AB and CD; a NOR of them gives the complement of their OR.', 'p = AND(A, B), q = AND(C, D), Y = NOR(p, q).'],
    solution: 'p = AND(A, B)\nq = AND(C, D)\nY = NOR(p, q)', wrong: ['p = AND(A, B)\nq = AND(C, D)\nY = NOR(p, p)', 'p = NOR(A, B)\nq = NOR(C, D)\nY = NOR(p, q)'],
  });
  ex({
    id: 'p11x-tgmux', chapter: 'p11-ch-cmos', title: 'A multiplexer of switches, as gates', level: 1, kind: 'circuit', ref: "S'A + SB", inputs: ['A', 'B', 'S'], outputs: ['Y'], parts: ['AND', 'OR', 'NOT'],
    text: ['Two transmission gates feed Y: one from A, conducting while S = 0, and one from B, conducting while S = 1. Build the same function from AND, OR and NOT gates.'],
    hints: ['While S = 0, Y = A; while S = 1, Y = B.', 'Y = S′A + SB.', 'n = NOT(S), p = AND(n, A), q = AND(S, B), Y = OR(p, q).'],
    solution: 'n = NOT(S)\np = AND(n, A)\nq = AND(S, B)\nY = OR(p, q)', wrong: ['n = NOT(S)\np = AND(S, A)\nq = AND(n, B)\nY = OR(p, q)', 'Y = OR(A, B)'],
  });

  ex({
    id: 'p11x-tg-wave', chapter: 'p11-ch-cmos', title: 'The multiplexer over time', level: 1, kind: 'waveform', circuit: 'n = NOT(S)\np = AND(n, A)\nq = AND(S, B)\nY = OR(p, q)', outputs: ['Y'], inputs: { A: '01100110', B: '00111100', S: '00001111' },
    text: ['The transmission-gate multiplexer passes A while S = 0 and B while S = 1. Draw Y for these inputs (its gate-level twin is simulated).'],
    hints: ['For the first four slots S = 0, so Y copies A.', 'For the last four S = 1, so Y copies B.', 'Y: 0 1 1 0 1 1 0 0.'],
    solution: { Y: '01101100' }, wrong: [{ Y: '00111100' }, { Y: '01100110' }],
  });

  // =========================================================================================================
  // Tour and course
  // =========================================================================================================
  C.tour({
    id: 'p11-tour', title: 'Tour: integrated circuits', blurb: 'The parameters, the families and the switch-level CMOS topics, and where the exercises are.',
    steps: [
      { route: 'part=ics', text: 'Part 11 looks inside the gates: the numbers a family promises, how the families differ, and CMOS gates built from switches.' },
      { route: 'topic=ic-levels', target: '#stageWrap', text: 'Output levels on the left, input levels on the right, and the noise margins between them. A probe shows where noise pushes a signal.' },
      { route: 'topic=ic-levels', target: '#inputs', text: 'Change the family and the amount of noise. ECL\'s levels are negative; CMOS\'s margins are the widest.' },
      { route: 'topic=ic-vtc', target: '#inputs', text: 'The inverter\'s transfer curve: change the strength ratio and the supply, and the threshold and margins move.' },
      { route: 'topic=ic-ttl-out', target: '#stageWrap', text: 'Output stages: two totem poles fighting, open-collector outputs making a wired AND, and tristate outputs sharing a bus.' },
      { route: 'topic=cmos-complex', target: '#inputs', text: 'Type any expression and see its CMOS cell: the pull-down from the expression, the pull-up its dual, every input combination tried.' },
      { route: 'lesson=p11l-cmos-gates', target: '#lessonView', text: 'The lessons embed these topics with predictions along the way.' },
      { route: 'learn', target: '[data-chapter="p11-ch-params"]', text: 'Part 11\'s exercises: margins, fan-out, delays checked by timing analysis, power, and CMOS networks.' },
    ],
  });
  C.course({
    id: 'p11-course', title: 'Integrated circuits, from data sheet to switches',
    blurb: 'Every topic of Part 11 in order, with the lessons that explain them and exercises along the way.',
    steps: [
      { topic: 'ic-levels', note: 'Levels and noise margins.' },
      { lesson: 'p11l-levels' },
      { topic: 'ic-vtc', note: 'Where VIL and VIH come from.' },
      { exercise: 'p11x-vtc-dir', note: 'Which way does the threshold move?' },
      { topic: 'ic-fanout', note: 'Currents adding up.' },
      { exercise: 'p11x-fanout-ls', note: 'Work out a fan-out.' },
      { topic: 'ic-delay', note: 'Delays along a chain.' },
      { topic: 'ic-power', note: 'Static against dynamic power.' },
      { exercise: 'p11x-dyn-power', note: 'C·V²·f.' },
      { topic: 'ic-history', note: 'RTL to CMOS.' },
      { topic: 'ic-ttl-out', note: 'Output stages.' },
      { topic: 'ic-ecl', note: 'Current steering.' },
      { topic: 'ic-interface', note: 'Joining families.' },
      { lesson: 'p11l-interface' },
      { topic: 'cmos-gates', note: 'Inverter, NAND and NOR from switches.' },
      { topic: 'cmos-complex', note: 'Any complement in one stage.' },
      { exercise: 'p11x-complementary-2', note: 'Find the dual network.' },
      { topic: 'cmos-broken', note: 'What goes wrong when it is not the dual.' },
      { topic: 'cmos-tgate', note: 'Transmission gates and tristate outputs.' },
      { lesson: 'p11l-complex' },
    ],
  });

  if (S.Checks) {
    const ready = (sel) => "document.querySelector('" + sel + "')";
    for (const l of C.lessons.values()) if (/^p11l-/.test(l.id)) S.Checks.push({ group: 'learn', name: 'p11 lesson ' + l.id, hash: 'lesson=' + l.id, ready: ready('#lessonView'), sel: '#main' });
    for (const id of ['p11x-interface', 'p11x-delay-ls', 'p11x-vtc-vm', 'p11x-pulldown', 'p11x-cell-circuit']) S.Checks.push({ group: 'learn', name: 'p11 exercise ' + id, hash: 'exercise=' + id, ready: ready('#exerciseView'), sel: '#main' });
    S.Checks.push({ group: 'courses', name: 'p11 course', hash: 'course=p11-course', ready: ready('#courseView'), sel: '#main' });
  }
})(globalThis.Sirkit = globalThis.Sirkit || {});
