/* Bước Dựng video: xem trước bằng clip thật, timeline, màu theo chương, lời hát, nhạc, xuất.
   Dùng chung hàm timeline với server (public/timeline.cjs). Phụ thuộc các hàm toàn cục của index.html:
   API, currentFlowId, navigate, esc, showToast, showDialog, closeDialog, apiUrl. */
(function () {
  'use strict';
  const TL = window.GGTimeline;
  const CH_COLORS = ['#4f6c8a', '#17797a', '#a2492a', '#587a48', '#6f7890', '#8a5a83', '#7a6a2f', '#2f6f8a'];
  const SWATCH = {
    neutral: 'linear-gradient(90deg,#999,#ccc)', cold: 'linear-gradient(90deg,#6f8196,#b7c3d1)', teal: 'linear-gradient(90deg,#0f8a90,#f08a3a)',
    warm: 'linear-gradient(90deg,#b3321e,#f2b53f)', green: 'linear-gradient(90deg,#55704a,#a9b59a)', highkey: 'linear-gradient(90deg,#d5dfe5,#fff)',
  };
  // Xem trước gần đúng bằng CSS. Bản xuất dùng bộ lọc ffmpeg thật.
  const LOOK = {
    neutral: { f: 'none', o: null },
    cold: { f: 'saturate(.72) contrast(1.06) brightness(.98)', o: 'rgba(120,150,190,.28)' },
    teal: { f: 'contrast(1.12) saturate(1.18)', o: 'linear-gradient(180deg,rgba(0,150,160,.5),rgba(255,140,60,.45))' },
    warm: { f: 'sepia(.3) saturate(1.3) contrast(1.05)', o: 'rgba(255,150,50,.32)' },
    green: { f: 'saturate(.6) contrast(1.04)', o: 'rgba(90,130,80,.42)' },
    highkey: { f: 'brightness(1.12) contrast(.9) saturate(.8)', o: 'rgba(235,245,250,.4)' },
  };
  // URL luôn theo flow của editor (E.id), KHÔNG theo currentFlowId toàn cục: khi rời view, route() đã đổi currentFlowId trước khi leave() lưu dở.
  const eurl = (path) => API + '/' + E.id + '/' + path;
  const $ = (id) => document.getElementById(id);
  const fmt = (t) => { t = Math.max(0, t); const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); };

  const E = {
    id: null, meta: null, st: null, p: null, clips: {}, analysis: null, tl: [], rows: [], total: 0,
    cur: 0, sel: 0, tab: 'shot', playing: false, pps: 21, dirty: false, saving: false, saveTimer: 0, saved: '',
    chain: Promise.resolve(true), es: null, raf: 0, last: 0, tickN: 0, undo: null, peaks: null, slot: 0, job: null, poll: 0, fileAction: null, alive: false,
  };

  // ─── vào / ra khỏi view ───────────────────────────────────
  async function render() {
    leave();
    E.id = currentFlowId; E.alive = true; E.cur = 0; E.sel = 0; E.tab = 'shot'; E.undo = null; E.peaks = null; E.job = null;
    const app = $('app');
    app.innerHTML = '<div class="empty-state"><p>Đang tải…</p></div>';
    const mr = await fetch(API + '/' + E.id);
    if (!mr.ok) { navigate('/'); return; }
    E.meta = await mr.json();
    const r = await fetch(eurl('edit'));
    const data = await r.json().catch(() => ({}));
    if (!E.alive) return;
    if (!r.ok) {
      app.innerHTML = header() + '<div class="empty-state"><div class="empty-mark">' + ICON_FILM() + '</div><h2>Chưa thể dựng</h2><p>' + esc(data.error || 'Không tải được dữ liệu dựng.') + '</p><button class="btn-primary" onclick="navigate(\'/flow/' + E.id + '\')">Về bước Generate</button></div>';
      return;
    }
    apply(data);
    shell();
    relayout(); drawAll(); select(firstSelectable(), true);
    connectSSE();
    loadWave();
    if (E.st.render && E.st.render.state === 'running') { E.job = E.st.render; pollJob(); }
    window.addEventListener('beforeunload', beforeUnload);
  }

  function leave() {
    if (!E.alive) return;
    E.alive = false; stopPlay();
    clearTimeout(E.saveTimer); if (E.dirty) save(true);
    if (E.es) { E.es.close(); E.es = null; }
    clearTimeout(E.poll);
    window.removeEventListener('beforeunload', beforeUnload);
    document.removeEventListener('keydown', onKey);
  }
  function beforeUnload(e) { if (E.dirty) { e.preventDefault(); e.returnValue = ''; } }

  function apply(data) { E.st = data; E.p = data.project; E.clips = data.clips; E.analysis = data.analysis; }
  const ICON_FILM = () => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M17 9h4M3 15h4M17 15h4"/></svg>';

  function header() {
    return '<header class="app-header">' +
      '<button class="brand" onclick="navigate(\'/\')" aria-label="All flows">' + BRAND_SVG + '<span class="word">GG Flow</span></button>' +
      '<span class="crumb-sep" aria-hidden="true">/</span>' +
      '<div class="crumb-meta"><h1 class="crumb-name">' + esc(E.meta.name) + '</h1><span class="status-badge" id="hdrBadge"></span></div>' +
      '<div class="seg" role="tablist" aria-label="Giai đoạn"><button role="tab" onclick="navigate(\'/flow/' + E.id + '\')">Generate</button><button role="tab" class="on" aria-selected="true">Edit</button></div>' +
      '<div class="header-actions"><button class="btn-outline" id="btnPrev" onclick="Ed.renderPreview()">Render preview</button><button class="btn-primary" id="btnExport" onclick="Ed.openExport()">Export video</button></div>' +
      '</header>';
  }

  function shell() {
    $('app').innerHTML = header() +
      '<div class="runbar"><div class="stats"><span class="stat" id="stShots"></span><span class="stat" id="stLen"></span><span class="stat" id="stMusic"></span><span id="stMissing"></span></div>' +
      '<div class="settings">' +
        '<label class="field">Canvas <select id="selCanvas"><option value="pic">9:16 · khung hình 16:9</option><option value="full">9:16 · phủ kín</option><option value="wide">16:9</option></select></label>' +
        '<label class="field">FPS <select id="selFps"><option value="24">24</option><option value="30">30</option></select></label>' +
        '<button class="btn-outline btn-sm" id="btnSnap" onclick="Ed.snap()" title="Kéo các điểm cắt gần lời hát về đúng lúc lời bắt đầu">Canh cắt theo lời</button>' +
        '<button class="link-btn" id="btnUndo" onclick="Ed.undoSnap()" style="display:none">Hoàn tác</button>' +
      '</div></div>' +
      '<div class="workspace">' +
        '<section class="preview-col" aria-label="Xem trước"><div class="phone" id="phone" data-c="pic">' +
          '<div class="pv-pic" id="pvPic"><video id="pvV0" muted playsinline preload="auto"></video><video id="pvV1" muted playsinline preload="auto"></video><div class="grade" id="pvGrade"></div>' +
            '<div class="tagline" id="pvTag"></div><div class="big" id="pvBig"></div><div class="hatch" id="pvHatch"></div></div>' +
          '<div class="pv-title" id="pvTitle"><video id="pvPlate" muted playsinline loop preload="auto"></video><div class="smoke" id="pvSmoke"></div><span id="pvTitleText"></span></div>' +
          '<div class="pv-lyric" id="pvLyric"></div><div class="pv-grain" id="pvGrain"></div></div>' +
          '<audio id="pvAudio" preload="auto"></audio>' +
          '<div class="transport"><button class="t-btn" onclick="Ed.step(-1)" aria-label="Shot trước"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2v14H6zM20 5v14L9 12z"/></svg></button>' +
          '<button class="t-btn play" id="btnPlay" onclick="Ed.togglePlay()" aria-label="Phát"><svg viewBox="0 0 24 24" fill="currentColor" id="icPlay"><path d="M8 5v14l11-7z"/></svg></button>' +
          '<button class="t-btn" onclick="Ed.step(1)" aria-label="Shot sau"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 5h2v14h-2zM4 5l11 7L4 19z"/></svg></button>' +
          '<span class="time"><b id="tNow">0:00.0</b> / <span id="tTot">0:00.0</span></span></div>' +
          '<p class="pv-note">Xem trước gần đúng màu, dissolve hiện như cắt. Muốn xem đúng 100%, bấm <b>Render preview</b>.</p></section>' +
        '<section class="inspector" aria-label="Thuộc tính"><div class="tabs" role="tablist" id="inspTabs">' +
          [['shot', 'Shot'], ['look', 'Màu'], ['lyrics', 'Lời hát'], ['titles', 'Thẻ chương'], ['music', 'Nhạc'], ['output', 'Xuất']].map((t) => '<button class="tab' + (t[0] === 'shot' ? ' active' : '') + '" data-tab="' + t[0] + '" role="tab">' + t[1] + '</button>').join('') +
        '</div><div class="insp-body" id="inspBody"></div></section></div>' +
      '<section class="timeline" aria-label="Timeline"><div class="tl-toolbar"><div class="legend" id="legend"></div><span class="hint">Phần dissolve chồng nhau được trừ vào thời gian. ◆ = dissolve</span>' +
        '<div class="zoom"><span>Thu phóng</span><input type="range" id="zoom" min="10" max="48" value="' + E.pps + '" aria-label="Thu phóng timeline"></div></div>' +
        '<div class="tl-body"><div class="tl-labels"><div style="height:30px">Thẻ chương</div><div style="height:58px">Shot</div><div style="height:30px">Lời hát</div><div style="height:50px">Nhạc</div></div>' +
        '<div class="tl-scroll" id="tlScroll"><div class="tl-content" id="tlContent"><div class="ruler" id="ruler"></div><div class="track t-title" id="trTitle"></div><div class="track t-shot" id="trShot"></div>' +
        '<div class="track t-lyric" id="trLyric"></div><div class="track t-music" id="trMusic"><canvas id="wave" height="50"></canvas></div><div class="playhead" id="playhead"></div></div></div></div></section>' +
      '<footer class="statusbar"><span id="sbText"></span><span class="meter" id="sbMeter"></span></footer><input type="file" id="edFile" style="display:none">';

    $('selCanvas').value = E.p.canvas; $('selFps').value = String(E.p.fps);
    $('selCanvas').onchange = (e) => { E.p.canvas = e.target.value; changed(); };
    $('selFps').onchange = (e) => { E.p.fps = +e.target.value; changed(); };
    $('zoom').oninput = (e) => { E.pps = +e.target.value; drawAll(); };
    $('edFile').onchange = onFile;
    $('inspTabs').onclick = (e) => { const b = e.target.closest('.tab'); if (b) { E.tab = b.dataset.tab; setTabs(); inspector(); } };
    $('inspBody').addEventListener('click', onInspClick);
    $('inspBody').addEventListener('change', onInspChange);
    $('tlContent').addEventListener('click', onTimelineClick);
    document.addEventListener('keydown', onKey);
    $('pvAudio').onerror = () => {};
    setBadge(); statusText();
  }

  // ─── dữ liệu & layout ─────────────────────────────────────
  function tlItems() {
    return E.p.items.map((it) => {
      const c = E.clips[it.sceneNumber];
      return Object.assign({}, it, { srcLen: it.kind === 'shot' && c ? c.duration : undefined, missing: it.kind === 'shot' && !c });
    });
  }
  function relayout() { E.tl = tlItems(); const l = TL.layout(E.tl); E.rows = l.rows; E.total = l.total; }
  const chapters = () => [...new Set(E.p.items.map((i) => i.chapter).filter(Boolean))];
  const chColor = (c) => CH_COLORS[Math.max(0, chapters().indexOf(c)) % CH_COLORS.length];
  const clipUrl = (file) => eurl('output/' + encodeURIComponent(file));
  const musicUrl = () => eurl('edit/music') + '?v=' + encodeURIComponent(E.p.music.name + E.p.music.duration);
  const firstSelectable = () => { const i = E.p.items.findIndex((x) => !x.skip && x.kind === 'shot'); return i < 0 ? 0 : i; };

  function changed() { relayout(); drawAll(); markDirty(); }

  // ─── lưu ──────────────────────────────────────────────────
  function markDirty() { E.dirty = true; statusText(); clearTimeout(E.saveTimer); E.saveTimer = setTimeout(() => save(false), 700); }
  // Mọi lần lưu xếp hàng nối đuôi nhau: không bao giờ có hai PUT cùng bay, nên bản cũ không thể đến sau và ghi đè bản mới.
  function save(keepalive) {
    clearTimeout(E.saveTimer);
    const run = () => doSave(keepalive);
    return (E.chain = E.chain.then(run, run));
  }
  async function doSave(keepalive) {
    if (!E.dirty || (!E.alive && !keepalive)) return true;
    E.saving = true; statusText();
    const snapshot = JSON.stringify(E.p);
    try {
      const r = await fetch(eurl('edit'), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: snapshot, keepalive: !!keepalive && new Blob([snapshot]).size < 60000 }); // keepalive bị trình duyệt giới hạn 64 KiB
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Lưu thất bại');
      if (JSON.stringify(E.p) === snapshot) E.dirty = false;
      else if (E.alive) markDirty(); // có chỉnh sửa mới trong lúc lưu: hẹn lưu lại
      E.analysis = d.analysis; E.saved = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      E.saving = false; statusText(); stats();
      return true;
    } catch (e) { E.saving = false; statusText(); showToast(e.message, 'error'); return false; }
  }
  function statusText() {
    const el = $('sbText'); if (!el) return;
    el.textContent = E.saving ? 'Đang lưu…' : E.dirty ? 'Có thay đổi chưa lưu' : (E.saved ? 'Đã lưu lúc ' + E.saved : 'Tự động lưu vào flows/<id>/edit/project.json');
  }

  // ─── vẽ chung ─────────────────────────────────────────────
  function drawAll() { stats(); legend(); timeline(); preview(true); }

  function legend() {
    $('legend').innerHTML = chapters().map((c) => '<span><span class="dot" style="background:' + chColor(c) + '"></span>' + esc(c.replace(/^Chương \d+ · /, '')) + '</span>').join('') +
      '<span><span class="dot" style="background:#ffd9e8;box-shadow:0 0 0 1.5px #999"></span>có mặt</span>';
  }

  function stats() {
    if (!$('stShots')) return; // đã rời view Edit (lưu dở hoàn tất sau khi DOM bị thay)
    const a = E.analysis || { readyShots: 0, totalShots: 0, missing: [] };
    const shots = E.p.items.filter((i) => i.kind === 'shot' && !i.skip);
    const missing = E.tl.filter((i, k) => i.kind === 'shot' && !i.skip && i.missing).length;
    $('stShots').innerHTML = '<b>' + shots.length + '</b> shot';
    $('stLen').innerHTML = '<b>' + fmt(E.total).replace(/^0:/, '') + '</b> video';
    const m = E.p.music;
    $('stMusic').innerHTML = m.file ? '<b>' + m.duration.toFixed(1) + '</b> nhạc' + (m.duration - m.offset > E.total ? ', cắt ' + (m.duration - m.offset - E.total).toFixed(1) + ' s cuối' : '') : '<span style="color:var(--ink-3)">chưa có nhạc</span>';
    $('stMissing').innerHTML = missing ? '<span class="pill-warn">' + missing + ' shot chưa có clip</span>' : '<span class="pill-ok">Đủ clip</span>';
    $('tTot').textContent = fmt(E.total);
    const b = $('hdrBadge'); if (b) { b.className = 'status-badge ' + (missing ? 'status-stopped' : 'status-completed'); b.textContent = missing ? missing + ' clip missing' : 'Clips ready'; }
    void a;
  }
  function setBadge() { stats(); }

  // ─── timeline ─────────────────────────────────────────────
  function timeline() {
    const pps = E.pps, musicEnd = E.p.music.file ? Math.max(0, E.p.music.duration - E.p.music.offset) : 0;
    const span = Math.max(E.total, musicEnd);
    $('tlContent').style.width = Math.ceil(span * pps) + 40 + 'px';
    let r = '';
    for (let s = 0; s <= span; s += 1) { const maj = s % 5 === 0; r += '<i class="' + (maj ? 'maj' : '') + '" style="left:' + s * pps + 'px"></i>' + (maj ? '<em style="left:' + s * pps + 'px">' + s + 's</em>' : ''); }
    $('ruler').innerHTML = r;
    let ti = '', sh = '', dis = '';
    E.tl.forEach((it, i) => {
      const row = E.rows[i], sel = i === E.sel ? ' sel' : '';
      if (it.skip) { sh += '<div class="blk skipped' + sel + '" data-i="' + i + '" style="left:' + row.t0 * pps + 'px" title="Đã bỏ: ' + esc(it.code) + '"></div>'; return; }
      const l = row.t0 * pps, w = Math.max(3, row.use * pps - 1);
      if (it.kind === 'title') ti += '<div class="blk title' + sel + '" data-i="' + i + '" style="left:' + l + 'px;width:' + w + 'px" title="' + esc(E.p.chapterTitles[it.chapter] || it.chapter) + '">' + (w > 16 ? esc(String(chapters().indexOf(it.chapter) + 1)) : '') + '</div>';
      else {
        const cls = 'blk' + (it.face && w >= 24 ? ' face wide' : '') + (it.missing ? ' missing' : '') + sel;
        sh += '<div class="' + cls + '" data-i="' + i + '" style="left:' + l + 'px;width:' + w + 'px;background:' + chColor(it.chapter) + '" title="' + esc(it.code + ' · ' + it.size + ' · ' + row.use.toFixed(1) + ' s') + '">' + (w > 30 ? esc(it.code.replace(/^A/, '')) + (w > 44 ? '<span class="meta">' + row.use.toFixed(1) + ' s</span>' : '') : '') + '</div>';
        if (it.out === 'dissolve' && row.d > 0) dis += '<div class="dis" style="left:' + (row.t0 + row.use - row.d / 2) * pps + 'px"></div>';
      }
    });
    $('trTitle').innerHTML = ti; $('trShot').innerHTML = sh + dis;
    $('trLyric').innerHTML = E.p.lyrics.map((y, i) => '<div class="blk lyric" data-ly="' + i + '" style="left:' + y.s * pps + 'px;width:' + Math.max(4, (y.e - y.s) * pps) + 'px" title="' + esc(y.t) + '">' + esc(y.t) + '</div>').join('');
    drawWave(); placeHead();
  }
  function placeHead() { const h = $('playhead'); if (h) h.style.left = E.cur * E.pps + 'px'; }
  function markSel() { document.querySelectorAll('.blk[data-i]').forEach((b) => b.classList.toggle('sel', +b.dataset.i === E.sel)); }

  function drawWave() {
    const cv = $('wave'), m = E.p.music; if (!cv) return;
    const span = Math.max(E.total, m.file ? m.duration - m.offset : 0), W = Math.ceil(span * E.pps);
    cv.width = Math.max(W, 1); cv.style.width = Math.max(W, 1) + 'px';
    const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, 50);
    if (!m.file) { g.fillStyle = '#766c7e'; g.font = '12px sans-serif'; g.fillText('Chưa có nhạc. Thêm ở tab Nhạc.', 10, 29); return; }
    if (!E.peaks) { g.fillStyle = 'rgba(140,47,91,.25)'; g.fillRect(0, 24, cv.width, 2); return; }
    const rate = E.peaks.rate, pk = E.peaks.data;
    for (let x = 0; x < cv.width; x += 2) {
      const t = x / E.pps, k = Math.floor((t + m.offset) * rate);
      if (k < 0 || k >= pk.length) continue;
      const h = Math.max(2, pk[k] * 44);
      g.fillStyle = t > E.total ? 'rgba(118,108,126,.3)' : 'rgba(140,47,91,.72)';
      g.fillRect(x, 25 - h / 2, 1.4, h);
    }
  }
  async function loadWave() {
    const m = E.p.music; E.peaks = null;
    const a = $('pvAudio');
    if (!m.file) { if (a) a.removeAttribute('src'); drawWave(); return; }
    if (a) { a.src = musicUrl(); }
    try {
      const buf = await (await fetch(musicUrl())).arrayBuffer();
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const ab = await ctx.decodeAudioData(buf);
      const rate = 40, per = Math.max(1, Math.floor(ab.sampleRate / rate)), ch0 = ab.getChannelData(0);
      const n = Math.ceil(ch0.length / per), data = new Float32Array(n);
      let peak = 0.0001;
      for (let i = 0; i < n; i++) { let mx = 0; const s = i * per, e = Math.min(ch0.length, s + per); for (let j = s; j < e; j += 8) { const v = Math.abs(ch0[j]); if (v > mx) mx = v; } data[i] = mx; if (mx > peak) peak = mx; }
      for (let i = 0; i < n; i++) data[i] /= peak;
      ctx.close();
      if (E.alive) { E.peaks = { rate, data }; drawWave(); }
    } catch (e) { /* không vẽ được sóng nhạc: vẫn dựng bình thường */ }
  }

  // ─── xem trước ────────────────────────────────────────────
  const vids = () => [$('pvV0'), $('pvV1')];
  function effStart(it, row) { const c = E.clips[it.sceneNumber]; return Math.min(it.start, Math.max(0, (c ? c.duration : 0) - row.use)); }

  function preview(force) {
    const idx = TL.indexAt(E.tl, E.rows, E.cur);
    $('tNow').textContent = fmt(E.cur);
    const phone = $('phone'); phone.dataset.c = E.p.canvas;
    $('pvGrain').style.display = E.p.grain ? '' : 'none';
    const ly = E.p.lyrics.find((y) => E.cur >= y.s && E.cur < y.e);
    $('pvLyric').textContent = ly ? ly.t : '';
    document.querySelectorAll('table.ly tr[data-i]').forEach((tr) => tr.classList.toggle('live', !!ly && E.p.lyrics[+tr.dataset.i] === ly));
    placeHead();
    if (idx < 0) return;
    const it = E.tl[idx], row = E.rows[idx];
    const title = $('pvTitle'), pic = $('pvPic');
    const grade = LOOK[E.p.chapterGrades[it.chapter]] || LOOK.neutral;
    if (it.kind === 'title') {
      pic.style.display = 'none'; title.style.display = 'grid';
      $('pvTitleText').textContent = E.p.chapterTitles[it.chapter] || it.chapter;
      const plate = E.p.plateScene ? E.clips[E.p.plateScene] : null, pv = $('pvPlate');
      $('pvSmoke').style.display = plate ? 'none' : '';
      pv.style.display = plate ? '' : 'none';
      if (plate) {
        const url = clipUrl(plate.file);
        if (pv.dataset.u !== url) { pv.dataset.u = url; pv.src = url; }
        const want = (E.cur - row.t0) % Math.max(0.5, plate.duration);
        if (force || Math.abs(pv.currentTime - want) > 0.5) pv.currentTime = want;
        E.playing ? pv.play().catch(() => {}) : pv.pause();
      }
      vids().forEach((v) => v.pause());
      return;
    }
    title.style.display = 'none'; $('pvPlate').pause(); pic.style.display = '';
    $('pvGrade').style.background = grade.o || 'none';
    $('pvBig').textContent = ''; $('pvTag').textContent = it.code + ' · ' + it.size + (it.face ? ' · có mặt' : '');
    const hatch = $('pvHatch');
    const [v0, v1] = vids();
    if (it.missing) {
      hatch.style.display = 'grid'; hatch.innerHTML = 'Chưa có clip<br>cho shot này';
      v0.style.visibility = v1.style.visibility = 'hidden'; v0.pause(); v1.pause();
      return;
    }
    hatch.style.display = 'none';
    const clip = E.clips[it.sceneNumber], url = clipUrl(clip.file), start = effStart(it, row);
    let cur = vids()[E.slot], other = vids()[1 - E.slot];
    if (cur.dataset.k !== it.id + '|' + url) {
      if (other.dataset.k === it.id + '|' + url) { E.slot = 1 - E.slot; [cur, other] = [other, cur]; }
      else { load(cur, it, url, start); }
    }
    cur.style.visibility = 'visible'; other.style.visibility = 'hidden'; cur.style.filter = grade.f;
    const want = start + (E.cur - row.t0);
    if (force || Math.abs(cur.currentTime - want) > 0.35) { try { cur.currentTime = want; } catch (e) { /* chưa tải xong metadata */ } }
    E.playing ? cur.play().catch(() => {}) : cur.pause();
    other.pause();
    // nạp trước shot kế để khi chuyển không bị khựng
    for (let j = idx + 1; j < E.tl.length; j++) {
      const n = E.tl[j]; if (n.skip) continue;
      if (n.kind === 'shot' && !n.missing) { const u = clipUrl(E.clips[n.sceneNumber].file); if (other.dataset.k !== n.id + '|' + u) load(other, n, u, effStart(n, E.rows[j])); }
      break;
    }
  }
  function load(v, it, url, start) { v.dataset.k = it.id + '|' + url; v.src = url; try { v.currentTime = start; } catch (e) { /* ignore */ } v.pause(); }

  function togglePlay() { E.playing ? stopPlay() : startPlay(); }
  function startPlay() {
    if (!E.total) return;
    if (E.cur >= E.total - 0.05) E.cur = 0;
    E.playing = true; $('icPlay').innerHTML = '<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>';
    const a = $('pvAudio'); if (E.p.music.file && a.src) { a.currentTime = E.cur + E.p.music.offset; a.volume = 1; a.play().catch(() => {}); }
    E.last = performance.now(); E.tickN = 0; preview(true); E.raf = requestAnimationFrame(tick);
  }
  function stopPlay() {
    E.playing = false; cancelAnimationFrame(E.raf);
    const ic = $('icPlay'); if (ic) ic.innerHTML = '<path d="M8 5v14l11-7z"/>';
    const a = $('pvAudio'); if (a) a.pause();
    vids().forEach((v) => v && v.pause()); const pl = $('pvPlate'); if (pl) pl.pause();
  }
  function tick(now) {
    if (!E.playing) return;
    E.cur += (now - E.last) / 1000; E.last = now; E.tickN++;
    if (E.cur >= E.total) { E.cur = Math.max(0, E.total - 0.01); stopPlay(); preview(true); return; }
    const idx = TL.indexAt(E.tl, E.rows, E.cur);
    if (idx !== E.sel && idx >= 0) { E.sel = idx; markSel(); if (E.tab === 'shot' || E.tab === 'titles') { if (E.tl[idx].kind === 'title') E.tab = 'titles'; else if (E.tab === 'titles') E.tab = 'shot'; setTabs(); inspector(); } }
    const sc = $('tlScroll'), x = E.cur * E.pps;
    if (x > sc.scrollLeft + sc.clientWidth - 40 || x < sc.scrollLeft) sc.scrollLeft = Math.max(0, x - 80);
    const a = $('pvAudio');
    if (E.tickN % 30 === 0 && E.p.music.file && a.src && Math.abs(a.currentTime - (E.cur + E.p.music.offset)) > 0.3) a.currentTime = E.cur + E.p.music.offset;
    preview(false);
    E.raf = requestAnimationFrame(tick);
  }

  function select(i, seek) {
    if (!E.p.items.length) return;
    E.sel = Math.max(0, Math.min(E.p.items.length - 1, i));
    if (seek) E.cur = Math.min(Math.max(0, E.total - 0.01), E.rows[E.sel].t0 + 0.01);
    if (E.p.items[E.sel].kind === 'title') E.tab = 'titles'; else if (E.tab === 'titles') E.tab = 'shot';
    markSel(); setTabs(); inspector(); preview(true);
  }
  function step(d) {
    let i = E.sel + d; while (i >= 0 && i < E.p.items.length && E.p.items[i].skip) i += d;
    if (i >= 0 && i < E.p.items.length) select(i, true);
  }
  function setTabs() { document.querySelectorAll('#inspTabs .tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === E.tab)); }

  // ─── inspector ────────────────────────────────────────────
  function numField(id, val, min, max, stp) {
    return '<span class="num"><button data-nf="' + id + '" data-d="-' + stp + '" aria-label="Giảm">−</button><input id="' + id + '" value="' + Number(val).toFixed(1) + '" inputmode="decimal" data-min="' + min + '" data-max="' + max + '"><button data-nf="' + id + '" data-d="' + stp + '" aria-label="Tăng">+</button></span>';
  }
  function inspector() {
    const el = $('inspBody'); if (!el) return;
    const p = E.p, it = p.items[E.sel], tli = E.tl[E.sel];
    if (E.tab === 'shot') {
      if (!it || it.kind !== 'shot') { el.innerHTML = '<p class="insp-sub">Chọn một shot trên timeline.</p>'; return; }
      const clip = E.clips[it.sceneNumber], c = chColor(it.chapter), src = clip ? clip.duration : 8;
      const use = E.rows[E.sel].use || it.use;
      const head = '<div class="detail-eyebrow">' + esc(it.code) + (it.chapter ? ' · ' + esc(it.chapter) : '') + (it.face ? ' <span class="chip chip-face-yes">Face</span>' : ' <span class="chip">No face</span>') + (it.who ? ' <span class="chip">' + esc(it.who) + '</span>' : '') + '</div>' +
        '<h2 class="insp-h">' + esc(it.size) + '</h2><p class="insp-sub">' + (clip ? 'Nguồn: <b>' + esc(clip.file) + '</b> · ' + src.toFixed(1) + ' s' : 'Cảnh ' + esc(it.sceneNumber) + ': chưa có clip') + '</p>';
      if (it.skip) { el.innerHTML = head + '<div class="card"><h4>Shot này đang bị bỏ</h4><p class="hint">Không có trong video xuất.</p><div class="row" style="margin-top:10px"><button class="btn-primary btn-sm" data-act="unskip">Khôi phục shot</button></div></div>'; return; }
      if (tli.missing) { el.innerHTML = head + '<div class="warnbox"><b>Chưa có clip cho shot này.</b> Shot chưa sinh xong hoặc bị lỗi ở bước Generate. Khi xuất, khoảng này để khung đen.<div class="row"><button class="btn-primary btn-sm" data-act="gen">Sinh lại ở Generate</button><button class="btn-outline btn-sm" data-act="skip">Bỏ shot</button></div></div>' + shotCards(it, c); return; }
      const winL = it.start / src * 100, winW = Math.min(100 - winL, use / src * 100);
      el.innerHTML = head + '<div class="card" style="margin-bottom:14px"><h4>Đoạn lấy trong clip gốc</h4><div class="strip"><div class="ticks"></div><div class="win" style="left:' + winL + '%;width:' + winW + '%"></div></div>' +
        '<div class="strip-lab"><span>0 s</span><span>giữ ' + it.start.toFixed(1) + ' → ' + (it.start + use).toFixed(1) + ' s</span><span>' + src.toFixed(1) + ' s</span></div>' +
        '<div class="row" style="margin-top:12px"><div><span class="lbl">Bắt đầu từ (s)</span>' + numField('fStart', it.start, 0, Math.max(0, src - 0.2), 0.1) + '</div><div><span class="lbl">Độ dài dùng (s)</span>' + numField('fUse', use, 0.2, src, 0.1) + '</div>' +
        '<div><span class="lbl">Gợi ý từ Excel</span><button class="btn-outline btn-sm" data-act="sugg">' + it.sugg.toFixed(1) + ' s · áp dụng</button></div></div>' +
        (it.use > use + 0.05 ? '<p class="hint" style="margin-top:10px;color:var(--warn)">Clip chỉ còn ' + use.toFixed(1) + ' s từ điểm bắt đầu nên độ dài dùng bị rút ngắn.</p>' : '<p class="hint" style="margin-top:10px">Bỏ khoảng 0,3 s đầu và cuối vì khuôn mặt dễ méo ở hai đầu clip.</p>') + '</div>' + shotCards(it, c) +
        '<div class="row" style="margin-top:14px"><button class="btn-outline btn-sm" data-act="skip">Bỏ shot này</button></div>';
    } else if (E.tab === 'look') {
      const grades = E.st.grades.map((g) => ({ key: g.key, name: g.name, sw: SWATCH[g.key] || SWATCH.neutral })).concat(E.st.luts.map((l) => ({ key: 'lut:' + l, name: 'LUT ' + l, sw: 'repeating-linear-gradient(45deg,#c9bfd1,#c9bfd1 4px,#e3dcea 4px,#e3dcea 8px)' })));
      const chs = chapters();
      el.innerHTML = '<h2 class="insp-h">Màu theo chương</h2><p class="insp-sub">Mỗi chương một bảng màu. Xem thử bên cạnh chỉ gần đúng (không áp LUT); bản xuất dùng bộ lọc ffmpeg thật.</p>' +
        (chs.length ? '<div class="card">' + chs.map((c) => '<div class="look-row"><div class="look-name"><span class="dot" style="background:' + chColor(c) + '"></span>' + esc(c) + '</div><div class="swatches">' +
          grades.map((g) => '<div class="sw' + (p.chapterGrades[c] === g.key ? ' on' : '') + '" data-ch="' + esc(c) + '" data-g="' + esc(g.key) + '" tabindex="0" role="button"><i style="background:' + g.sw + '"></i><span>' + esc(g.name) + '</span></div>').join('') +
          '<div class="sw" data-lut="' + esc(c) + '" tabindex="0" role="button"><i style="background:repeating-linear-gradient(45deg,#ddd,#ddd 4px,#eee 4px,#eee 8px)"></i><span>Nhập .cube</span></div></div></div>').join('') + '</div>'
          : '<div class="card"><p class="hint">Excel này không chia chương nên không có màu theo chương. Dùng tab Xuất để bật hạt phim.</p></div>') +
        '<div class="card" style="margin-top:14px"><div class="row"><label class="toggle"><input type="checkbox" id="fGrain" ' + (p.grain ? 'checked' : '') + '><span>Hạt phim nhẹ</span></label><span class="hint">Giúp các clip trông cùng một cuộn phim, nhưng làm dựng chậm hơn khoảng 2 lần và tệp nặng hơn. Mặc định tắt.</span></div></div>';
    } else if (E.tab === 'lyrics') {
      el.innerHTML = '<h2 class="insp-h">Lời hát</h2><p class="insp-sub">Mỗi dòng hiện ở giữa đáy, mờ vào/ra 0,2 s. Thời gian tính theo video (không phải theo bài nhạc): khi nhập .lrc/.srt, thời gian được trừ đi điểm bắt đầu nhạc (hiện ' + (p.music.offset || 0).toFixed(1) + ' s). Sửa trực tiếp trong bảng.</p>' +
        '<div class="row" style="margin-bottom:12px"><button class="btn-outline btn-sm" data-act="lrc">Nhập .lrc / .srt</button><button class="btn-outline btn-sm" data-act="addly">+ Thêm dòng</button>' + (p.lyrics.length ? '<button class="btn-outline btn-sm" data-act="clrly">Xóa hết</button>' : '') + '</div>' +
        (p.lyrics.length ? '<table class="ly"><thead><tr><th>Bắt đầu</th><th>Kết thúc</th><th>Chữ</th><th></th></tr></thead><tbody>' +
          p.lyrics.map((y, i) => '<tr data-i="' + i + '"><td class="t"><input data-ly="' + i + '" data-k="s" value="' + y.s.toFixed(1) + '" aria-label="Bắt đầu"></td><td class="t"><input data-ly="' + i + '" data-k="e" value="' + y.e.toFixed(1) + '" aria-label="Kết thúc"></td><td><input data-ly="' + i + '" data-k="t" value="' + esc(y.t) + '" maxlength="300" aria-label="Chữ"></td><td class="t" style="width:34px"><button class="link-btn" data-act="dely" data-i="' + i + '" aria-label="Xóa dòng">✕</button></td></tr>').join('') + '</tbody></table>'
          : '<div class="card"><p class="hint">Chưa có lời. Nhập tệp .lrc/.srt, hoặc thêm từng dòng.</p></div>');
    } else if (E.tab === 'titles') {
      const chs = chapters();
      el.innerHTML = '<h2 class="insp-h">Thẻ chương</h2><p class="insp-sub">Nền đen, khói trắng, chữ hiện ra. Dùng clip khói của cảnh ' + esc(p.plateScene || '?') + (p.plateScene && E.clips[p.plateScene] ? '' : ' <b style="color:var(--warn)">(chưa có clip khói, đang dùng nền đen)</b>') + '.</p>' +
        (chs.length ? '<div class="card">' + chs.map((c, i) => '<div class="look-row"><div class="look-name"><span class="dot" style="background:' + chColor(c) + '"></span>Chương ' + (i + 1) + '</div><input class="txt" type="text" maxlength="120" data-ti="' + esc(c) + '" value="' + esc(p.chapterTitles[c] || c) + '" aria-label="Chữ thẻ chương ' + (i + 1) + '"></div>').join('') + '</div>' : '<div class="card"><p class="hint">Excel này không chia chương nên không có thẻ chương.</p></div>') +
        '<div class="grid2" style="margin-top:14px"><div class="card"><h4>Phông chữ (cũng dùng cho lời hát)</h4><select class="sel" id="fFont">' + E.st.fonts.map((f) => '<option' + (f === p.titleFont ? ' selected' : '') + '>' + esc(f) + '</option>').join('') + '</select><p class="hint" style="margin-top:8px">Thêm phông: bỏ tệp .ttf/.otf vào assets/fonts (tên tệp dạng Tên-Kiểu.ttf).</p></div>' +
        '<div class="card"><h4>Độ dài thẻ</h4><div class="row">' + numField('fTd', p.titleDur, 0.8, 3, 0.1) + '<span class="hint">mẫu gốc ≈ 1,3 s</span></div></div></div>';
    } else if (E.tab === 'music') {
      const m = p.music;
      el.innerHTML = '<h2 class="insp-h">Nhạc</h2><p class="insp-sub">Một bài có lời. Nhạc dài hơn video thì tự cắt; ngắn hơn thì đoạn cuối im lặng.</p><div class="grid2">' +
        '<div class="card"><h4>Tệp nhạc</h4>' + (m.file ? '<div class="row"><b style="font-size:13.5px;overflow-wrap:anywhere">' + esc(m.name || m.file) + '</b><span class="chip">' + m.duration.toFixed(1) + ' s</span></div>' : '<p class="hint">Chưa có nhạc (mp3, wav, m4a, aac, ogg, flac; tối đa 100 MB).</p>') +
        '<div class="row" style="margin-top:10px"><button class="btn-outline btn-sm" data-act="music">' + (m.file ? 'Đổi tệp' : 'Chọn tệp nhạc') + '</button>' + (m.file ? '<button class="btn-outline btn-sm" data-act="rmmusic">Bỏ nhạc</button>' : '') + '</div></div>' +
        '<div class="card"><h4>Bắt đầu nhạc từ</h4><div class="row">' + numField('fMo', m.offset, 0, Math.max(0, m.duration - 1), 0.1) + '<span class="hint">giây trong bài</span></div></div>' +
        '<div class="card"><h4>Mờ vào / mờ ra (giây)</h4><div class="row">' + numField('fFi', m.fadeIn, 0, 10, 0.1) + numField('fFo', m.fadeOut, 0, 10, 0.1) + '</div></div>' +
        '<div class="card"><h4>Âm lượng chuẩn</h4><select class="sel" id="fLoud">' + [['-14', '-14 LUFS (YouTube / TikTok)'], ['-16', '-16 LUFS'], ['null', 'Giữ nguyên']].map((o) => '<option value="' + o[0] + '"' + (String(m.loudness) === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></div></div>';
    } else {
      const fin = E.st.finals.filter((f) => !f.preview);
      el.innerHTML = '<h2 class="insp-h">Xuất video</h2><p class="insp-sub">Tệp ra ở <b>flows/&lt;id&gt;/output/final/</b>.</p><span class="lbl">Bố cục khung hình</span><div class="radio-cards" id="rcs">' +
        [['pic', '9:16, khung hình 16:9', 'Giống hai video mẫu: ảnh 16:9 nằm giữa nền đen, lời hát ở đáy.'], ['full', '9:16 phủ kín', 'Cắt ảnh 16:9 thành dọc: mất hai bên.'], ['wide', '16:9', 'Cho YouTube ngang.']].map((r) => '<div class="rc' + (p.canvas === r[0] ? ' on' : '') + '" data-c="' + r[0] + '" tabindex="0" role="button"><div class="mini">' + (r[0] === 'pic' ? '<b style="top:22px;height:15px"></b>' : r[0] === 'full' ? '<b style="top:0;bottom:0"></b>' : '') + '</div><div><strong>' + r[1] + '</strong><small>' + r[2] + '</small></div></div>').join('') + '</div>' +
        '<div class="grid2" style="margin-top:16px"><div class="card"><h4>Độ phân giải</h4><select class="sel" id="fRes"><option value="1080"' + (p.resolution === 1080 ? ' selected' : '') + '>' + (p.canvas === 'wide' ? '1920 × 1080' : '1080 × 1920') + '</option><option value="720"' + (p.resolution === 720 ? ' selected' : '') + '>' + (p.canvas === 'wide' ? '1280 × 720' : '720 × 1280') + '</option></select></div>' +
        '<div class="card"><h4>Tên tệp</h4><input class="txt" type="text" id="fName" maxlength="80" value="' + esc(p.outputName) + '"><p class="hint" style="margin-top:6px">Thêm .mp4 tự động.</p></div></div>' +
        '<div class="card" style="margin-top:14px"><h4>Bản đã xuất</h4>' + (fin.length ? fin.map((f) => '<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)"><b style="font-size:13px">' + esc(f.file) + '</b><span class="chip">' + (f.size / 1048576).toFixed(1) + ' MB</span><span class="hint">' + new Date(f.modified).toLocaleString('vi-VN') + '</span><span style="margin-left:auto" class="row"><button class="btn-outline btn-sm" data-act="play" data-f="' + esc(f.file) + '">Xem</button><a class="btn-outline btn-sm" style="text-decoration:none;display:inline-flex;align-items:center" href="' + eurl('edit/final/' + encodeURIComponent(f.file)) + '?download=1">Tải về</a></span></div>').join('') : '<p class="hint">Chưa có bản xuất nào.</p>') + '</div>';
    }
  }

  function shotCards(it, c) {
    const nx = E.p.items[E.sel + 1];
    return '<div class="grid2"><div class="card"><h4>Chuyển sang shot kế</h4><select class="sel" id="fOut"><option value="cut"' + (it.out === 'cut' ? ' selected' : '') + '>Cắt cứng</option><option value="dissolve"' + (it.out === 'dissolve' ? ' selected' : '') + '>Dissolve 0,6 s</option></select><p class="hint" style="margin-top:8px">' + (nx ? 'Mẫu gốc dùng cắt cứng là chính, dissolve chỉ ở vài chỗ chuyển bộ.' : 'Đây là shot cuối nên không có chuyển cảnh.') + '</p></div>' +
      '<div class="card"><h4>Màu của chương</h4><div class="row"><span class="dot" style="background:' + c + '"></span><b style="font-size:13.5px">' + esc(gradeName(E.p.chapterGrades[it.chapter])) + '</b><button class="link-btn" data-act="look">Đổi</button></div><p class="hint" style="margin-top:8px">Áp cho cả chương để các clip sinh ở nhiều lần trông như một phim.</p></div></div>';
  }
  const gradeName = (k) => { if (!k) return 'Gốc'; if (k.startsWith('lut:')) return 'LUT ' + k.slice(4); const g = E.st.grades.find((x) => x.key === k); return g ? g.name : 'Gốc'; };

  function onInspClick(e) {
    const nf = e.target.closest('[data-nf]');
    if (nf) { const inp = $(nf.dataset.nf); inp.value = (parseFloat(inp.value) + parseFloat(nf.dataset.d)).toFixed(1); inp.dispatchEvent(new Event('change', { bubbles: true })); return; }
    const sw = e.target.closest('.sw[data-g]'); if (sw) { E.p.chapterGrades[sw.dataset.ch] = sw.dataset.g; markDirty(); inspector(); preview(true); return; }
    const lut = e.target.closest('.sw[data-lut]'); if (lut) { pickFile('.cube', 'lut', lut.dataset.lut); return; }
    const rc = e.target.closest('.rc'); if (rc) { E.p.canvas = rc.dataset.c; $('selCanvas').value = E.p.canvas; changed(); inspector(); return; }
    const b = e.target.closest('[data-act]'); if (!b) return;
    const it = E.p.items[E.sel];
    switch (b.dataset.act) {
      case 'sugg': it.use = it.sugg; changed(); inspector(); break;
      case 'skip': it.skip = true; E.analysis = E.analysis; changed(); inspector(); toast('Đã bỏ ' + it.code + '. Bấm vào dấu gạch trên timeline để khôi phục.'); break;
      case 'unskip': it.skip = false; changed(); inspector(); break;
      case 'gen': navigate('/flow/' + E.id); break;
      case 'look': E.tab = 'look'; setTabs(); inspector(); break;
      case 'lrc': pickFile('.lrc,.srt,.txt', 'lyrics'); break;
      case 'addly': { const last = E.p.lyrics[E.p.lyrics.length - 1]; const s = last ? last.e + 0.2 : Math.max(0, E.cur); E.p.lyrics.push({ s: Math.round(s * 10) / 10, e: Math.round((s + 2) * 10) / 10, t: 'Lời mới' }); changed(); inspector(); break; }
      case 'clrly': if (confirm('Xóa hết ' + E.p.lyrics.length + ' dòng lời hát?')) { E.p.lyrics = []; changed(); inspector(); } break;
      case 'dely': E.p.lyrics.splice(+b.dataset.i, 1); changed(); inspector(); break;
      case 'music': pickFile('audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac', 'music'); break;
      case 'rmmusic': E.p.music = Object.assign({}, E.p.music, { file: null, name: '', duration: 0, offset: 0 }); loadWave(); changed(); inspector(); break;
      case 'play': playFinal(b.dataset.f); break;
    }
  }
  function onInspChange(e) {
    const t = e.target, it = E.p.items[E.sel];
    if (t.id === 'fStart' || t.id === 'fUse') {
      const clip = E.clips[it.sceneNumber], src = clip ? clip.duration : 8;
      let v = parseFloat(String(t.value).replace(',', '.')); if (isNaN(v)) v = 0;
      if (t.id === 'fStart') it.start = Math.min(Math.max(0, v), Math.max(0, src - 0.2));
      else it.use = Math.min(Math.max(0.2, v), src);
      if (it.start + it.use > src + 0.001) {
        if (t.id === 'fUse') it.use = Math.round((src - it.start) * 10) / 10; else it.start = Math.round(Math.max(0, src - it.use) * 10) / 10;
        toast('Đoạn dùng không được vượt quá ' + src.toFixed(1) + ' s của clip gốc');
      }
      changed(); inspector();
    } else if (t.id === 'fOut') { it.out = t.value; changed(); inspector(); }
    else if (t.id === 'fGrain') { E.p.grain = t.checked; markDirty(); preview(true); }
    else if (t.dataset.ly !== undefined) {
      const y = E.p.lyrics[+t.dataset.ly], k = t.dataset.k;
      if (k === 't') y.t = t.value.slice(0, 300); else { const v = parseFloat(String(t.value).replace(',', '.')); if (!isNaN(v) && v >= 0) y[k] = v; if (y.e <= y.s) y.e = Math.round((y.s + 0.2) * 10) / 10; }
      markDirty(); timeline(); preview(true);
      if (k !== 't') inspector();
    } else if (t.dataset.ti !== undefined) { E.p.chapterTitles[t.dataset.ti] = t.value.slice(0, 120); markDirty(); preview(true); timeline(); }
    else if (t.id === 'fFont') { E.p.titleFont = t.value; markDirty(); }
    else if (t.id === 'fTd') { const v = Math.min(3, Math.max(0.8, parseFloat(t.value) || 1.3)); E.p.titleDur = v; E.p.items.forEach((x) => { if (x.kind === 'title') x.use = v; }); changed(); inspector(); }
    else if (t.id === 'fMo') {
      const old = E.p.music.offset || 0;
      E.p.music.offset = Math.min(Math.max(0, parseFloat(t.value) || 0), Math.max(0, E.p.music.duration - 1));
      const delta = old - E.p.music.offset; // bắt đầu nhạc muộn hơn 10 s thì lời (tính theo bài) phải sớm hơn 10 s trong video
      if (Math.abs(delta) > 0.001 && E.p.lyrics.length) {
        const shifted = TL.shiftLyrics(E.p.lyrics, delta), lost = E.p.lyrics.length - shifted.length;
        if (confirm('Dời ' + E.p.lyrics.length + ' dòng lời ' + (delta < 0 ? 'sớm ' : 'muộn ') + Math.abs(delta).toFixed(1) + ' s để vẫn khớp với nhạc?' + (lost ? '\n(' + lost + ' dòng nằm trước đầu video sẽ bị bỏ, không hoàn lại được.)' : '') + '\n\nOK = dời theo nhạc, Hủy = giữ nguyên thời gian lời.')) E.p.lyrics = shifted;
      }
      changed(); drawWave(); inspector();
    }
    else if (t.id === 'fFi') { E.p.music.fadeIn = Math.min(10, Math.max(0, parseFloat(t.value) || 0)); markDirty(); }
    else if (t.id === 'fFo') { E.p.music.fadeOut = Math.min(10, Math.max(0, parseFloat(t.value) || 0)); markDirty(); }
    else if (t.id === 'fLoud') { E.p.music.loudness = t.value === 'null' ? null : +t.value; markDirty(); }
    else if (t.id === 'fRes') { E.p.resolution = +t.value === 720 ? 720 : 1080; markDirty(); }
    else if (t.id === 'fName') { E.p.outputName = t.value.replace(/\.mp4$/i, ''); markDirty(); }
  }

  // ─── chọn tệp (nhạc, lời, LUT) ────────────────────────────
  function pickFile(accept, kind, arg) { const f = $('edFile'); f.accept = accept; f.value = ''; E.fileAction = { kind, arg }; f.click(); }
  async function onFile(e) {
    const file = e.target.files[0], act = E.fileAction; if (!file || !act) return;
    try {
      if (act.kind === 'lyrics') {
        const r = await fetch(eurl('edit/lyrics'), { method: 'POST', body: await file.text() });
        const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Không đọc được lời');
        if (E.p.lyrics.length && !confirm('Thay ' + E.p.lyrics.length + ' dòng lời hiện tại bằng ' + d.lines.length + ' dòng từ tệp?')) return;
        // Tệp .lrc/.srt tính theo bài hát; video bắt đầu nhạc ở `offset` nên phải trừ đi để lời khớp nhạc.
        const off = E.p.music.offset || 0, lines = off > 0 ? TL.shiftLyrics(d.lines, -off) : d.lines;
        if (!lines.length) throw new Error('Mọi dòng lời nằm trước điểm bắt đầu nhạc (' + off.toFixed(1) + ' s) nên không có dòng nào hiện trong video.');
        E.p.lyrics = lines; changed(); inspector();
        toast('Đã nhập ' + lines.length + ' dòng lời' + (off > 0 ? ' (đã dời -' + off.toFixed(1) + ' s theo điểm bắt đầu nhạc' + (lines.length < d.lines.length ? ', bỏ ' + (d.lines.length - lines.length) + ' dòng nằm trước đó' : '') + ')' : ''), 'success');
      } else if (act.kind === 'lut') {
        const r = await fetch(eurl('edit/lut?name=' + encodeURIComponent(file.name)), { method: 'POST', body: file });
        const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Không nhập được LUT');
        if (!E.st.luts.includes(d.name)) E.st.luts.push(d.name);
        E.p.chapterGrades[act.arg] = 'lut:' + d.name; markDirty(); await save(false); inspector(); preview(true); toast('Đã nhập LUT ' + d.name, 'success');
      } else if (act.kind === 'music') {
        if (file.size > 100 * 1024 * 1024) throw new Error('Tệp nhạc quá lớn (tối đa 100 MB)');
        toast('Đang tải nhạc…'); await save(false);
        const r = await fetch(eurl('edit/music?name=' + encodeURIComponent(file.name)), { method: 'POST', body: file });
        const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Không tải được nhạc');
        Object.assign(E.p.music, { file: d.music.file, name: d.music.name, duration: d.music.duration, offset: 0 });
        E.dirty = true; await save(false); loadWave(); changed(); inspector(); toast('Đã thêm nhạc (' + d.music.duration.toFixed(1) + ' s)', 'success');
      }
    } catch (err) { showToast(err.message, 'error'); }
  }

  // ─── timeline tương tác ───────────────────────────────────
  function onTimelineClick(e) {
    const b = e.target.closest('.blk[data-i]'); if (b) { select(+b.dataset.i, true); return; }
    const ly = e.target.closest('.blk[data-ly]'); if (ly) { E.tab = 'lyrics'; E.cur = Math.min(E.total - 0.01, E.p.lyrics[+ly.dataset.ly].s); setTabs(); inspector(); preview(true); return; }
    if (e.target.closest('.ruler') || e.target.closest('.t-music')) {
      const r = $('tlContent').getBoundingClientRect();
      E.cur = Math.max(0, Math.min(E.total - 0.01, (e.clientX - r.left) / E.pps));
      const i = TL.indexAt(E.tl, E.rows, E.cur);
      if (i >= 0) { E.sel = i; if (E.p.items[i].kind === 'title') E.tab = 'titles'; else if (E.tab === 'titles') E.tab = 'shot'; markSel(); setTabs(); inspector(); }
      preview(true);
      if (E.playing) { const a = $('pvAudio'); if (E.p.music.file) a.currentTime = E.cur + E.p.music.offset; }
    }
  }
  function onKey(e) {
    if (!E.alive || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); } else if (e.key === 'ArrowRight') step(1); else if (e.key === 'ArrowLeft') step(-1);
  }

  // ─── canh cắt theo lời ────────────────────────────────────
  function snap() {
    if (!E.p.lyrics.length) { toast('Chưa có lời hát để canh. Nhập lời ở tab Lời hát.'); return; }
    const res = TL.snapToLyrics(E.tl, E.p.lyrics);
    if (!res.moved.length) { toast('Không có điểm cắt nào gần dòng lời (trong 0,6 s) để canh.'); return; }
    E.undo = E.p.items.map((i) => i.use);
    res.items.forEach((x, i) => { E.p.items[i].use = x.use; });
    changed(); inspector(); $('btnUndo').style.display = '';
    toast('Đã canh ' + res.moved.length + ' điểm cắt theo lời hát. Bấm Hoàn tác nếu không ưng.', 'success');
  }
  function undoSnap() {
    if (!E.undo) return;
    E.undo.forEach((u, i) => { if (E.p.items[i]) E.p.items[i].use = u; });
    E.undo = null; $('btnUndo').style.display = 'none'; changed(); inspector();
  }

  // ─── xuất / render ────────────────────────────────────────
  function connectSSE() {
    E.es = new EventSource(eurl('events'));
    E.es.addEventListener('render', (e) => onJob(JSON.parse(e.data)));
  }
  function pollJob() {
    clearTimeout(E.poll);
    E.poll = setTimeout(async () => {
      if (!E.alive || !E.job || E.job.state !== 'running') return;
      try { const r = await fetch(eurl('edit/render')); const j = await r.json(); if (j) onJob(j); } catch (e) { /* thử lại */ }
      pollJob();
    }, 1500);
  }
  function onJob(j) {
    E.job = j;
    const pct = Math.round(j.percent);
    const meter = $('sbMeter');
    if (meter) meter.innerHTML = j.state === 'running' ? (j.preview ? 'Dựng xem thử' : 'Đang dựng') + ' ' + pct + '%<i><b style="width:' + pct + '%"></b></i>' : '';
    const pb = $('pb'); if (pb) { pb.style.width = pct + '%'; $('pt').textContent = j.state === 'running' ? 'Đang dựng… ' + pct + '%' : ''; }
    const bp = $('btnPrev'), be = $('btnExport'); if (bp) bp.disabled = be.disabled = j.state === 'running';
    if (j.state === 'running') return;
    if (bp) bp.disabled = be.disabled = false;
    fetch(eurl('edit')).then((r) => r.json()).then((d) => { if (E.alive && d.finals) { E.st.finals = d.finals; if (E.tab === 'output') inspector(); } }).catch(() => {});
    if (j.state === 'error') { showToast('Dựng lỗi: ' + (j.error || '').split('\n')[0], 'error', 8000); finishDialog(j); }
    else if (j.state === 'cancelled') { toast('Đã hủy dựng'); finishDialog(j); }
    else if (j.state === 'done') { if (j.preview) { playFinal(j.file); } else finishDialog(j); }
  }
  async function startRender(preview) {
    if (!(await save(false))) return false;
    const r = await fetch(eurl('edit/render'), { method: 'POST', body: JSON.stringify({ preview }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { showToast(d.error || 'Không bắt đầu được', 'error', 6000); return false; }
    onJob(d.render); pollJob(); return true;
  }
  async function renderPreview() {
    if (E.job && E.job.state === 'running') return;
    const a = E.analysis; if (a && a.totalShots && !a.readyShots) { toast('Chưa có clip nào để dựng.'); return; }
    toast('Đang dựng bản xem thử (độ phân giải thấp)…');
    await startRender(true);
  }
  async function openExport() {
    if (E.job && E.job.state === 'running') return;
    if (!(await save(false))) return;
    const r = await fetch(eurl('edit')); const d = await r.json(); if (!r.ok) { showToast(d.error, 'error'); return; }
    E.st.finals = d.finals; E.analysis = d.analysis; stats();
    const a = d.analysis, p = d.project;
    const dims = p.canvas === 'wide' ? (p.resolution === 1080 ? '1920 × 1080' : '1280 × 720') : (p.resolution === 1080 ? '1080 × 1920' : '720 × 1280');
    const row = (cls, ic, html) => '<li><span class="ic ' + cls + '">' + ic + '</span><span>' + html + '</span></li>';
    let li = row('ok', '✓', a.readyShots + ' / ' + a.totalShots + ' shot có clip, ' + p.items.filter((i) => i.kind === 'title' && !i.skip).length + ' thẻ chương');
    if (a.missing.length) li += row('warn', '!', '<b>' + a.missing.length + ' shot chưa có clip</b> (' + esc(a.missing.slice(0, 6).map((m) => m.code).join(', ')) + (a.missing.length > 6 ? '…' : '') + '). Các khoảng này sẽ để khung đen.');
    a.warnings.forEach((w) => { li += row('warn', '!', esc(w)); });
    li += row('ok', '✓', p.lyrics.length + ' dòng lời hát, ' + esc(p.music.file ? 'nhạc ' + p.music.duration.toFixed(1) + ' s' : 'không nhạc'));
    li += row('ok', '✓', dims + ' · ' + p.fps + ' fps · H.264' + (p.music.file ? ' + AAC' : '') + ' · ' + a.total.toFixed(1) + ' s');
    li += d.ffmpeg.ok ? '' : row('warn', '!', '<b>Chưa có ffmpeg dùng được:</b> ' + esc(d.ffmpeg.error));
    showDialog('<h3>Xuất video</h3><ul class="dlg-list">' + li + '</ul><div id="dlgProg" style="display:none"><div class="prog"><b id="pb"></b></div><div class="hint" id="pt"></div></div>' +
      '<div class="dialog-actions" id="dlgAct"><button class="btn-outline" onclick="Ed.closeDlg()">Hủy</button><button class="btn-primary" id="btnGo" onclick="Ed.go()"' + (d.ffmpeg.ok ? '' : ' disabled') + '>Dựng video</button></div>');
    $('dialogBox').classList.add('wide');
  }
  async function go() {
    $('dlgProg').style.display = ''; $('dlgAct').innerHTML = '<button class="btn-outline" onclick="Ed.cancel()">Hủy dựng</button>';
    if (!(await startRender(false))) { closeDlg(); }
  }
  function finishDialog(j) {
    const act = $('dlgAct'); if (!act) return;
    if (j.state === 'done') {
      $('pt').innerHTML = '<b style="color:var(--ok)">Xong</b> trong ' + j.seconds + ' s: ' + esc(j.file);
      $('pb').style.width = '100%';
      act.innerHTML = '<button class="btn-outline" onclick="Ed.closeDlg()">Đóng</button><button class="btn-outline" onclick="Ed.play(\'' + encodeURIComponent(j.file) + '\')">Xem</button><a class="btn-primary" style="text-decoration:none;display:inline-flex;align-items:center;padding:0 15px;min-height:36px;border-radius:7px" href="' + eurl('edit/final/' + encodeURIComponent(j.file)) + '?download=1">Tải về</a>';
    } else {
      $('pt').innerHTML = j.state === 'error' ? '<span style="color:var(--bad)">' + esc((j.error || '').split('\n')[0]) + '</span>' : 'Đã hủy';
      act.innerHTML = '<button class="btn-outline" onclick="Ed.closeDlg()">Đóng</button>';
    }
  }
  async function cancel() { await fetch(eurl('edit/render/cancel'), { method: 'POST' }); }
  function closeDlg() { closeDialog(); const b = $('dialogBox'); if (b) b.classList.remove('wide'); }
  function playFinal(file) {
    file = decodeURIComponent(file);
    const m = $('modal'), c = $('modalContent');
    c.innerHTML = '<video src="' + eurl('edit/final/' + encodeURIComponent(file)) + '?t=' + Date.now() + '" controls autoplay style="max-height:85vh;max-width:90vw"></video>';
    m.classList.add('active'); closeDlg();
  }
  function toast(m, type) { showToast(m, type || 'info', 3600); }

  window.Ed = { render, leave, togglePlay, step, snap, undoSnap, renderPreview, openExport, go, cancel, closeDlg, play: playFinal };
})();
