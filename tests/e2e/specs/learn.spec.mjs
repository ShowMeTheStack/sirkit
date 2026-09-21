// Topics, Learn and Courses: a topic plays, steps, asks its prediction and its quiz; a lesson reads and its figures
// draw; the exercises check answers and give hints; a course leads through.
export default function (t) {
  t.test('the topics page lists the fourteen parts and their topics', async (p) => {
    await p.route('topics');
    p.assert.equal(await p.count('#topicsView .part'), 14);
    p.assert.ok(await p.exists('#topicsView a[data-topic="gate-symbols"]'));
    p.assert.ok(!(await p.text('#topicsView')).includes('being written'), 'no placeholder notice');
    p.assert.ok(await p.exists('#part-lab a[href="#lab"]'), 'the lab part leads to the bench');
    p.assert.ok(await p.noHScroll());
  });

  t.test('a topic plays, steps with the keys and draws the circuit with values', async (p) => {
    await p.route('topic=gate-symbols');
    p.assert.equal(await p.ev('Sirkit.app.page.player.frames.length'), 6);
    p.assert.ok(await p.exists('#stageWrap svg g[data-part]'), 'the schematic is on the stage');
    await p.click('#btnFwd');
    p.assert.equal(await p.ev('Sirkit.app.page.player.i'), 1);
    p.assert.ok((await p.text('#say')).includes('A = 0, B = 0 → F = 0'));
    await p.ev('document.activeElement && document.activeElement.blur()');
    await p.key('ArrowRight');
    p.assert.equal(await p.ev('Sirkit.app.page.player.i'), 2);
    await p.key('ArrowRight');
    p.assert.equal(await p.ev('Sirkit.app.page.player.i'), 3);
    // A = 1 on the third row: its wire is lit
    p.assert.ok(await p.ev("[...document.querySelectorAll('#stageWrap path[data-net].v1')].length >= 1"));
    await p.key('Home');
    p.assert.equal(await p.ev('Sirkit.app.page.player.i'), 0);
    p.assert.equal(await p.text('#counters .counter b'), '0');
  });

  t.test('the prediction stops the player and is answered', async (p) => {
    await p.route('topic=gate-symbols');
    await p.ev('Sirkit.app.page.player.go(3, true)');
    await p.click('#btnFwd');
    await p.wait("!!document.querySelector('#predict')");
    p.assert.ok((await p.text('#predict')).includes('Every input is now 1'));
    await p.click('#predict .chip', '1');
    p.assert.ok((await p.text('#predict')).includes('Right.'));
    await p.click('#predictGo');
    p.assert.equal(await p.ev('Sirkit.app.page.player.i'), 4);
    p.assert.ok((await p.text('#say')).includes('F = 1'));
  });

  t.test('a preset changes the gate and the quiz scores', async (p) => {
    await p.route('topic=gate-symbols');
    await p.click('.presets .chip', 'XOR');
    await p.ev('Sirkit.app.page.player.go(Sirkit.app.page.player.frames.length - 1, true)');
    p.assert.ok((await p.text('#say')).includes('XOR: the output is 1 when an odd number'));
    await p.click('#btnQuiz');
    await p.waitModal();
    await p.click('.quiz-q .quiz-opt', '≥1');
    p.assert.ok((await p.text('#quizScore')).includes('1 of 1'));
    await p.closeModals();
  });

  t.test('the lesson reads, its player and its circuit draw, and it can be marked done', async (p) => {
    await p.route('learn');
    p.assert.ok(await p.exists('#learnView a[href="#lesson=p5l-analysis"]'));
    await p.route('lesson=p5l-analysis');
    p.assert.ok(await p.exists('#lessonView .ls-player .stage-wrap svg'));
    p.assert.ok(await p.exists('#lessonView .ls-schem svg[data-schematic]'));
    await p.click('.ls-predict .quiz-opt', '11');
    p.assert.ok((await p.text('.ls-predict')).includes('Right.'));
    await p.click('#lessonDone');
    await p.wait("!!JSON.parse(localStorage.getItem('sirkit.learn') || '{}').read && JSON.parse(localStorage.getItem('sirkit.learn')).read['p5l-analysis'] > 0");
  });

  t.test('the truth-table exercise is checked cell by cell', async (p) => {
    await p.route('exercise=alg-ex-gate-table');
    const vals = { '000': '1', '001': '1', '010': '0', '011': '0', '100': '0', '101': '0', '110': '0', '111': '0' };
    await p.fn((v) => { for (const [k, x] of Object.entries(v)) { const i = document.querySelector('input[data-key="' + k + '|F"]'); i.value = x; i.dispatchEvent(new Event('input', { bubbles: true })); } }, vals);
    await p.click('#btnCheck');
    p.assert.ok((await p.text('#exResult')).includes('1 cell is not right'));
    p.assert.equal(await p.count('.fill-table input.wrong'), 1);
    await p.setValue('input[data-key="000|F"]', '0');
    await p.click('#btnCheck');
    p.assert.ok((await p.text('#exResult')).includes('Correct'));
  });

  t.test('the expression exercise gives a counterexample, a hint, then passes', async (p) => {
    await p.route('exercise=alg-ex-complement');
    await p.setValue('#ansText', 'A');
    await p.click('#btnCheck');
    p.assert.ok((await p.text('#exResult')).includes('A = 0, B = 0, C = 0'));
    await p.click('#btnHint');
    p.assert.equal(await p.count('#hints .hint'), 1);
    await p.setValue('#ansText', "(A' + B)C'");
    await p.click('#btnCheck');
    p.assert.ok((await p.text('#exResult')).includes('Correct'));
  });

  t.test('the course leads through its steps', async (p) => {
    await p.route('courses');
    p.assert.ok(await p.exists('#coursesView [data-course="p10-course"]'));
    await p.route('course=p10-course');
    await p.click('#courseStart');
    await p.wait("!!(Sirkit.app.page && Sirkit.app.page.player)");
    p.assert.ok(await p.exists('#courseStrip'));
    await p.click('#courseNext');
    await p.wait("!!document.querySelector('#lessonView')");
    p.assert.ok((await p.text('#courseStrip')).includes('step 2 of ' + (await p.ev("Sirkit.Content.courses.get('p10-course').steps.length"))));
  });

  t.test('on a phone the definition opens in a drawer and nothing scrolls sideways', async (p) => {
    await p.viewport(390, 844, { mobile: true });
    await p.route('topic=gate-symbols');
    p.assert.ok(await p.noHScroll());
    p.assert.ok(await p.ev("getComputedStyle(document.getElementById('btnDrawer')).display !== 'none'"));
    await p.click('#btnDrawer');
    await p.wait("document.querySelector('.topic').classList.contains('drawer-open')");
    await p.sleep(300);
    p.assert.ok(await p.visible('#defView'));
    await p.key('Escape');
    await p.wait("!document.querySelector('.topic').classList.contains('drawer-open')");
    for (const h of ['learn', 'lesson=p5l-analysis', 'exercise=alg-ex-gate-table', 'courses']) { await p.route(h); p.assert.ok(await p.noHScroll(), h + ' scrolls sideways'); }
    await p.viewport(1400, 900);
  });
}
