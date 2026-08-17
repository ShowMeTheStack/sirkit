// The lab bench: placing chips, wiring jumpers, power, a gate lighting an LED, mistakes the bench reports,
// the logic analyser on a counter, undo, files and links, and the phone layout.
export default (t) => {
  const at = (p, key) => p.ev(`Sirkit.Lab.page.screenOf(${JSON.stringify(key)})`);
  const wire = async (p, a, b) => { const [x1, y1] = await at(p, a), [x2, y2] = await at(p, b); await p.drag(x1, y1, x2, y2); };
  const sees = (p) => p.ev("[...document.querySelectorAll('#labSees li')].map((e) => e.innerText).join('\\n')");
  const lit = (p, i) => p.ev(`document.querySelector('.lab-led[data-led="${i}"]').classList.contains('lit')`);

  t.test('the bench opens empty and says so', async (p) => {
    await p.route('lab');
    p.assert.ok(await p.exists('#labView .lab-svg'));
    p.assert.equal(await p.count('.lab-ic'), 0);
    p.assert.match(await sees(p), /empty bench/i);
    p.assert.equal(await p.ev("document.querySelector('#topNav [data-route=lab]').classList.contains('on')"), true);
  }, { fresh: true });

  t.test('a chip from the list lands on the board, and has no power yet', async (p) => {
    await p.click('.lab-chip-btn[data-chip="7408"]');
    p.assert.equal(await p.count('.lab-ic'), 1);
    p.assert.equal(await p.ev('Sirkit.Lab.page.state.chips[0].col'), 4);
    p.assert.match(await sees(p), /U1 \(7408\) has no power: pin 14 \(VCC\) is not wired to \+5 V and pin 7 \(GND\) is not wired to ground/);
    p.assert.match(await p.text('#labInfo'), /Quad 2-input AND/);
  });

  t.test('dragging between holes wires jumpers, and power reaches the chip', async (p) => {
    await wire(p, '4a', 'Rtp4');
    await wire(p, '10j', 'Rbn10');
    p.assert.equal(await p.ev('Sirkit.Lab.page.state.jumpers.length'), 2);
    p.assert.doesNotMatch(await sees(p), /no power/);
    p.assert.match(await sees(p), /inputs? that nothing drives/);
  });

  t.test('a hole takes one wire only', async (p) => {
    await wire(p, '4a', 'Rtp5');
    p.assert.equal(await p.ev('Sirkit.Lab.page.state.jumpers.length'), 2);
    await p.waitToast(/already has a wire/);
  });

  t.test('two switches through an AND gate light an LED', async (p) => {
    await wire(p, 'sw0', '4j');
    await wire(p, 'sw1', '5j');
    await wire(p, '6i', 'led0');
    await p.sleep(150);
    p.assert.equal(await lit(p, 0), false);
    await p.click('.lab-sw[data-sw="0"]');
    await p.sleep(150);
    p.assert.equal(await lit(p, 0), false, 'one switch up: AND is 0');
    await p.click('.lab-sw[data-sw="1"]');
    await p.wait("document.querySelector('.lab-led[data-led=\"0\"]').classList.contains('lit')", 3000);
    p.assert.deepEqual(await p.ev('Sirkit.Lab.page.state.sw.slice(0, 2)'), [1, 1]);
  });

  t.test('pulling out the VCC jumper leaves the chip dead and the LED dark', async (p) => {
    await p.ev("Sirkit.Lab.page.sel = { kind: 'jumper', id: 'J1' }; Sirkit.Lab.page.draw(); document.getElementById('labBoard').focus()");
    await p.key('Delete');
    p.assert.equal(await p.ev("Sirkit.Lab.page.state.jumpers.some((j) => j.id === 'J1')"), false);
    await p.sleep(200);
    p.assert.equal(await lit(p, 0), false);
    p.assert.match(await sees(p), /no power: pin 14 \(VCC\) is not wired to \+5 V/);
    p.assert.ok(await p.exists('.lab-ic.off'));
  });

  t.test('undo puts the jumper back and the LED lights again', async (p) => {
    await p.key('z', { ctrl: true });
    p.assert.equal(await p.ev("Sirkit.Lab.page.state.jumpers.some((j) => j.id === 'J1')"), true);
    await p.wait("document.querySelector('.lab-led[data-led=\"0\"]').classList.contains('lit')", 3000);
    await p.key('y', { ctrl: true });
    p.assert.equal(await p.ev("Sirkit.Lab.page.state.jumpers.some((j) => j.id === 'J1')"), false);
    await p.key('z', { ctrl: true });
  });

  t.test('two outputs on one strip are reported, and flash while they disagree', async (p) => {
    await wire(p, 'sw2', '4i');
    p.assert.match(await sees(p), /Two outputs drive column 4 \(bottom half\): switch S0 and switch S2/);
    await p.wait("!!document.querySelector('.lab-fight')", 3000);
    p.assert.match(await sees(p), /disagree, so it reads X/);
    await p.click('.lab-sw[data-sw="2"]');
    await p.wait("!document.querySelector('.lab-fight')", 3000);
  });

  t.test('a TTL input left open reads 1, a CMOS one reads X', async (p) => {
    await p.ev("Sirkit.Lab.page.loadSample(null)");
    const id = await p.ev("Sirkit.Lab.page.placeChip('7404')");
    p.assert.equal(id, 'U1');
    await p.ev("const b = Sirkit.Lab.page; b.addJumper('4a', 'Rtp4'); b.addJumper('10j', 'Rbn10'); b.addJumper('5i', 'probe')");
    await p.setValue('#labTech', 'TTL', 'change');
    await p.wait("document.querySelector('.lab-probe-v').textContent === 'LO'", 3000);
    p.assert.match(await sees(p), /On TTL an open input reads 1/);
    await p.setValue('#labTech', 'CMOS', 'change');
    await p.wait("document.querySelector('.lab-probe-v').textContent === 'X'", 3000);
    p.assert.match(await sees(p), /On CMOS an open input floats/);
  });

  t.test('the counter experiment counts on the LEDs and the analyser', async (p) => {
    await p.click('#labSamples');
    await p.click('.menu-pop .menu-item', 'A counter on the analyser');
    await p.wait('Sirkit.Lab.page.channels().length === 5');
    p.assert.match(await sees(p), /Nothing wrong/, 'a bundled experiment is wired cleanly');
    await p.sleep(600);
    p.assert.equal(await lit(p, 0), false, 'held clear by S0');
    await p.click('.lab-sw[data-sw="0"]');
    await p.wait("Sirkit.Lab.page.sim.waves(Sirkit.Lab.page.netIdx('ch0')).filter(([, v]) => v === '1').length >= 2", 12000);
    await p.wait("Sirkit.Lab.page.sim.waves(Sirkit.Lab.page.netIdx('ch1')).filter(([, v]) => v === '1').length >= 1", 6000);
    await p.ev('Sirkit.Lab.page.updateAnalyser(true)');
    p.assert.ok(await p.exists('#labAnalyser svg'));
    p.assert.match(await p.text('.lab-ana-note'), /5 channels/);
  }, { timeout: 40000 });

  t.test('the parity experiment: an odd number of switches lights LED 0', async (p) => {
    if (!(await p.ev('!!Sirkit.Lab.page'))) await p.route('lab');
    await p.ev("Sirkit.Lab.page.loadSample('parity')");
    for (const [sw, want] of [[0, true], [1, false], [2, true]]) {
      await p.click(`.lab-sw[data-sw="${sw}"]`);
      await p.wait(`document.querySelector('.lab-led[data-led="0"]').classList.contains('lit') === ${want}`, 3000);
    }
  });

  t.test('a share link brings the bench back', async (p) => {
    if (!(await p.ev('!!Sirkit.Lab.page'))) { await p.route('lab'); await p.ev("Sirkit.Lab.page.loadSample('parity')"); }
    const before = await p.ev('JSON.stringify(Sirkit.Lab.page.state.jumpers)');
    const code = await p.ev("Sirkit.Share.pack({ kind: 'lab', data: Sirkit.Lab.page.snapshot() })");
    await p.ev("Sirkit.Lab.page.loadSample(null)");
    p.assert.equal(await p.ev('Sirkit.Lab.page.state.jumpers.length'), 0);
    await p.route('share=' + code);
    await p.wait("location.hash === '#lab' && !!Sirkit.Lab.page && Sirkit.Lab.page.state.jumpers.length > 0", 8000);
    p.assert.equal(await p.ev('JSON.stringify(Sirkit.Lab.page.state.jumpers)'), before);
  });

  t.test('the bench is kept across a reload', async (p) => {
    if (!(await p.ev('!!Sirkit.Lab.page'))) { await p.route('lab'); await p.ev("Sirkit.Lab.page.loadSample('parity')"); }
    const n = await p.ev('Sirkit.Lab.page.state.jumpers.length');
    await p.reload();
    await p.wait('!!Sirkit.Lab.page');
    p.assert.equal(await p.ev('Sirkit.Lab.page.state.jumpers.length'), n);
  });

  t.test('on a phone the bench fits the width and still wires', async (p) => {
    await p.route('lab');
    await p.ev("Sirkit.Lab.page.loadSample('parity')");
    p.assert.ok(await p.noHScroll());
    p.assert.ok(await p.visible('#labBoard'));
    await p.ev("Sirkit.Lab.page.loadSample(null); Sirkit.Lab.page.placeChip('7400')");
    await wire(p, '4a', 'Rtp4');
    p.assert.equal(await p.ev('Sirkit.Lab.page.state.jumpers.length'), 1);
  }, { fresh: { width: 390, height: 844, mobile: true } });
};
