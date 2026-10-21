const puppeteer = require('/home/user/STRUCHORD/node_modules/puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/tmp/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 800 });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('http://127.0.0.1:8000/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('typeof partsEnsureAlphaTab === "function"');
  const out = await page.evaluate(async () => {
    const alphaTab = partsEnsureAlphaTab();
    const host = document.createElement('div');
    host.style.cssText = 'width:700px;height:300px;position:relative';
    document.body.appendChild(host);
    const settings = new alphaTab.Settings();
    settings.core.engine = 'svg';
    settings.core.enableLazyLoading = true;
    settings.core.includeNoteBounds = true;
    settings.core.useWorkers = false;
    const fontEl = document.getElementById('bravuraWoff2Data');
    if (fontEl) settings.core.smuflFontSources = new Map([[alphaTab.FontFileFormat.Woff2, 'data:font/woff2;base64,' + fontEl.textContent.trim()]]);
    settings.display.layoutMode = alphaTab.LayoutMode.Page;
    settings.display.scale = 0.9;
    settings.notation.rhythmMode = alphaTab.TabRhythmMode.ShowWithBeams;

    const M = alphaTab.model;
    const score = new M.Score();
    score.title = '';
    const track = new M.Track();
    track.name = '';
    const staff = new M.Staff();
    staff.showStandardNotation = false;
    staff.showTablature = true;
    staff.stringTuning = new M.Tuning('E4', 'B3', 'G3', 'D3', 'A2', 'E2');
    track.addStaff(staff);
    score.addTrack(track);
    const mb = new M.MasterBar();
    mb.timeSignatureNumerator = 4;
    mb.timeSignatureDenominator = 4;
    score.addMasterBar(mb);
    const bar = new M.Bar();
    const voice = new M.Voice();
    const specs = [{ pos: 0, notes: [[6, 0], [5, 2]] }, { pos: 1, notes: [[4, 0]] }, { pos: 2, notes: [[6, 3]] }];
    specs.forEach((spec) => {
      const beat = new M.Beat();
      beat.duration = M.Duration.Quarter;
      spec.notes.forEach(([string, fret]) => {
        const note = new M.Note();
        note.string = string;
        note.fret = fret;
        beat.addNote(note);
      });
      voice.addBeat(beat);
    });
    bar.addVoice(voice);
    staff.addBar(bar);
    score.finish(new alphaTab.Settings());

    const api = new alphaTab.AlphaTabApi(host, settings);
    const rendered = new Promise((resolve) => { api.renderFinished.on(resolve); setTimeout(resolve, 8000); });
    api.load(score);
    await rendered;
    await new Promise(r => setTimeout(r, 400));

    const result = { errors: [], keys: [], beatInfo: [], noteInfo: [], staffBounds: null, svg: !!host.querySelector('svg'), html: host.innerHTML.slice(0, 300) };
    const lb = api.boundsLookup;
    if (!lb) { result.errors.push('no boundsLookup'); return result; }
    result.keys = Object.keys(lb);
    result.proto = Object.getOwnPropertyNames(Object.getPrototypeOf(lb));
    const beats = [];
    result.scan = [];
    try {
      lb.staffSystems.forEach((sys) => {
        result.scan.push({ sys: Object.keys(sys), bounds: sys.visualBounds, bars: (sys.bars || []).length });
        (sys.bars || []).forEach((b) => {
          result.scan.push({ barKeys: Object.keys(b), barBounds: b.visualBounds, staffs: (b.staffs || []).length, beats: (b.beats || []).length });
          (b.beats || []).forEach((bb) => {
            result.scan.push({ beatKeys: Object.keys(bb), vb: bb.visualBounds, notes: (bb.notes || []).length, nb: (bb.notes || []).map(n => ({ keys: Object.keys(n), head: n.noteHeadBounds, id: n.note && n.note.id, string: n.note && n.note.string, fret: n.note && n.note.fret })) });
          });
        });
      });
    } catch (e) { result.errors.push('scan: ' + e.message); }
    const firstBeat = score.tracks[0].staves[0].bars[0].voices[0].beats[1];
    try {
      const fb = lb.findBeat(firstBeat);
      result.beatInfo.push({ vb: fb && fb.visualBounds, keys: fb && Object.keys(fb), staffBounds: fb && fb.staffSystemBounds && fb.staffSystemBounds.visualBounds });
    } catch (e) { result.errors.push('findBeat: ' + e.message); }
    try {
      const note = score.tracks[0].staves[0].bars[0].voices[0].beats[0].notes[0];
      const fn = lb.findNote(note);
      result.noteInfo.push({ head: fn && fn.noteHeadBounds, noteBounds: fn && fn.noteBounds, keys: fn && Object.keys(fn) });
    } catch (e) { result.errors.push('findNote: ' + e.message); }
    try {
      const b2 = score.tracks[0].staves[0].bars[0].voices[0].beats[0];
      const _b0 = lb.findBeat(b2); result.beat0 = _b0 && { vb: _b0.visualBounds, notes: (_b0.notes||[]).length };
      result.beat0Keys = result.beat0 && Object.keys(result.beat0);
      result.beat0Notes = (_b0 && _b0.notes || []).map(n => ({ keys: Object.keys(n), head: n.noteHeadBounds, note: n.note && { s: n.note.string, f: n.note.fret } }));
      const sys = lb.staffSystems[0];
      result.sysBarKeys = sys.bars[0] && Object.keys(sys.bars[0]);
      result.sysBar2 = sys.bars[0] && sys.bars[0].bars && Object.keys(sys.bars[0].bars[0] || {});
      const bar2 = sys.bars[0].bars && sys.bars[0].bars[0];
      result.bar2staffs = bar2 && bar2.staffs && bar2.staffs.map(st => ({ keys: Object.keys(st), vb: st.visualBounds, bar: st.bar && st.bar.index, beats: (st.beats || []).length }));
      result.svgCount = host.querySelectorAll('svg').length;
      const svgs = Array.from(host.querySelectorAll('svg'));
      result.svgSizes = svgs.map(sv => ({ vb: sv.getAttribute('viewBox'), w: sv.getAttribute('width'), h: sv.getAttribute('height') }));
    } catch (e) { result.errors.push('deep: ' + e.message); }
    host.style.cssText = 'width:220px;height:200px;position:relative';
    api.settings.display.layoutMode = alphaTab.LayoutMode.Page;
    api.updateSettings();
    await new Promise(r => setTimeout(r, 800));
    result.narrow = { scrollWidth: host.scrollWidth, clientWidth: host.clientWidth, svgCount: host.querySelectorAll('svg').length, lastSvg: (() => { const s = host.querySelectorAll('svg'); const last = s[s.length - 1]; return last ? { vb: last.getAttribute('viewBox'), w: last.getAttribute('width') } : null; })() };
    result.apiKeys = Object.keys(api).filter(k => /mouse|render|cursor|bound/i.test(k));
    window.__probe = { api, host, score };
    return JSON.stringify(result);
  });
  console.log(out.slice(0, 9000));
  await page.screenshot({ path: 'probe-narrow.png', fullPage: false });
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
