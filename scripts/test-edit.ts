/**
 * Kiểm tra bước Dựng (không cần Flow, không cần mạng): timeline dùng chung, lời hát, phụ đề ASS,
 * dự án mặc định từ Excel thật, kiểm tra dữ liệu, và DỰNG THẬT bằng ffmpeg trên clip giả.
 * Chạy: npx tsx scripts/test-edit.ts
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readScenes } from '../src/excel-reader.js';
import { TL } from '../src/edit/timeline.js';
import { parseLrc, parseSrt, parseLyrics } from '../src/edit/lyrics.js';
import { assEscape, assTime, buildAss } from '../src/edit/ass.js';
import { buildDefaultProject, normalizeProject, reconcile, parseShotName, listFonts } from '../src/edit/project.js';
import { discoverClips } from '../src/edit/clips.js';
import { analyze, planRender, runRender, canvasSize } from '../src/edit/render.js';
import { resolveFfmpeg, probeDuration } from '../src/edit/ffmpeg.js';
import type { EditProject } from '../src/edit/types.js';

let n = 0;
const ok = (name: string) => { console.log(`PASS  ${name}`); n++; };
const near = (a: number, b: number, eps: number, msg: string) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} ≉ ${b}`);

// ── 1. timeline ─────────────────────────────────────────────
{
  const mk = (use: number, out: 'cut' | 'dissolve' = 'cut', extra = {}) => ({ kind: 'shot' as const, use, start: 0.3, out, ...extra });
  let r = TL.layout([mk(2), mk(1), mk(1.5)]);
  near(r.total, 4.5, 1e-9, 'cắt cứng cộng dồn'); near(r.rows[2].t0, 3, 1e-9, 't0 item 3');
  r = TL.layout([mk(2, 'dissolve'), mk(2), mk(1.5)]);
  near(r.total, 5.5 - 0.6, 1e-9, 'dissolve trừ 0,6 s'); near(r.rows[1].t0, 1.4, 1e-9, 'item sau bắt đầu sớm 0,6 s');
  r = TL.layout([mk(2, 'dissolve'), mk(1)]);
  near(r.rows[0].d, 0.5, 1e-9, 'dissolve kẹp bằng nửa shot ngắn hơn (1 s)');
  r = TL.layout([mk(0.8, 'dissolve'), mk(0.8)]);
  near(r.rows[0].d, 0.4, 1e-9, 'dissolve bị kẹp bằng nửa shot ngắn');
  r = TL.layout([mk(2, 'dissolve')]);
  near(r.total, 2, 1e-9, 'dissolve ở shot cuối không trừ');
  r = TL.layout([mk(1), mk(5, 'cut', { skip: true }), mk(1)]);
  near(r.total, 2, 1e-9, 'shot bị bỏ không chiếm thời gian');
  r = TL.layout([mk(3, 'cut', { srcLen: 2 })]);
  near(r.total, 1.7, 1e-9, 'độ dài bị kẹp theo phần còn lại của clip (2 - 0,3)');
  assert.equal(TL.indexAt([mk(1), mk(1)], TL.layout([mk(1), mk(1)]).rows, 1.2), 1);
  ok('timeline: layout, dissolve, skip, kẹp theo clip');

  const items = [mk(2), mk(1.5), mk(1.5), mk(2)];
  const s = TL.snapToLyrics(items, [{ s: 2.3 }, { s: 3.7 }]);
  const lay = TL.layout(s.items);
  near(lay.rows[1].t0, 2.3, 0.06, 'điểm cắt 1 kéo về 2,3 s'); near(lay.rows[2].t0, 3.7, 0.06, 'điểm cắt 2 kéo về 3,7 s');
  assert.equal(items[0].use, 2, 'không sửa dữ liệu đầu vào');
  const far = TL.snapToLyrics(items, [{ s: 9 }]);
  assert.equal(far.moved.length, 0, 'lời hát xa mọi điểm cắt thì không đụng');
  const t = TL.snapToLyrics([{ kind: 'title' as const, use: 1.3, start: 0, out: 'cut' as const }, mk(2)], [{ s: 1.5 }]);
  assert.equal(t.moved.length, 0, 'không sửa thẻ chương');
  ok('timeline: canh điểm cắt theo lời hát');
}

// ── 2. lời hát ──────────────────────────────────────────────
{
  const lrc = '[ti:Bài hát]\n[ar:abc]\n[00:01.50]Ngàn năm sau vẫn nhớ\n[00:03.20]ánh mắt <i>người</i> nơi thành cao\n[00:05.00]\n[00:06:10]gió thổi áo bay\n';
  const a = parseLrc(lrc);
  assert.deepEqual(a.map((x) => [x.s, x.e, x.t]), [[1.5, 3.2, 'Ngàn năm sau vẫn nhớ'], [3.2, 5, 'ánh mắt người nơi thành cao'], [6.1, 9.1, 'gió thổi áo bay']]);
  const srt = '﻿1\n00:00:01,500 --> 00:00:03,000\nNgàn năm\nsau vẫn nhớ\n\n2\n00:00:03,200 --> 00:00:05,000\nxin chào\n';
  assert.deepEqual(parseSrt(srt).map((x) => [x.s, x.e, x.t]), [[1.5, 3, 'Ngàn năm sau vẫn nhớ'], [3.2, 5, 'xin chào']]);
  assert.equal(parseLyrics(srt).length, 2); assert.equal(parseLyrics(lrc).length, 3); assert.equal(parseLyrics('không phải lời').length, 0);
  ok('lời hát: .lrc, .srt, tự nhận dạng');
}

// ── 3. ASS ─────────────────────────────────────────────────
{
  assert.equal(assTime(75.126), '0:01:15.13'); assert.equal(assEscape('a{\\b1}b\\c\nd'), 'a(/b1)b/c\\Nd');
  ok('ASS: định dạng thời gian và thoát ký tự');
}

// ── 4. dự án mặc định từ Excel thật ────────────────────────
const XLSX_A = resolve('wedding-video/excel/ngu-kiep.xlsx');
const XLSX_B = resolve('wedding-video/excel/album-phong-cach.xlsx');
{
  const scenes = await readScenes(XLSX_A, ['AI-VID', 'AI-IMG', 'STOCK']);
  const p = buildDefaultProject(scenes, 'Ngũ kiếp · Minh & Lan');
  const shots = p.items.filter((i) => i.kind === 'shot'), titles = p.items.filter((i) => i.kind === 'title');
  assert.equal(shots.length, 40); assert.equal(titles.length, 5); assert.equal(p.plateScene, '00');
  assert.equal(p.items[0].kind, 'title'); assert.equal(p.items[1].id, 's:01');
  assert.deepEqual(Object.values(p.chapterGrades), ['cold', 'teal', 'warm', 'green', 'highkey']);
  near(shots.reduce((s, i) => s + i.use, 0), 43.9, 0.05, 'tổng độ dài shot theo Excel');
  assert.equal(p.outputName, 'ngu-kiep-minh-lan');
  const first = parseShotName(scenes[1].sceneName)!; assert.equal(first.code, 'A1.01'); assert.equal(first.face, false);
  ok('dự án mặc định "Năm kiếp": 40 shot, 5 thẻ chương, clip khói = cảnh 00');

  const b = buildDefaultProject(await readScenes(XLSX_B, ['AI-VID', 'AI-IMG', 'STOCK']), 'Album');
  assert.equal(b.items.filter((i) => i.kind === 'shot').length, 34);
  assert.ok(b.items.some((i) => i.out === 'dissolve'), 'bộ B có dissolve theo cột Chuyển cảnh');
  ok('dự án mặc định "Album": 34 shot, đọc dissolve từ Excel');

  // reconcile giữ chỉnh sửa, theo thứ tự mới
  const edited: EditProject = JSON.parse(JSON.stringify(p));
  edited.items[1].use = 2.2; edited.items[2].skip = true; edited.chapterGrades[Object.keys(edited.chapterGrades)[0]] = 'warm';
  const fresh = buildDefaultProject(scenes.filter((s) => s.sceneNumber !== '05'), 'x');
  const rec = reconcile(edited, fresh);
  assert.equal(rec.items.find((i) => i.id === 's:01')!.use, 2.2); assert.equal(rec.items.find((i) => i.id === 's:02')!.skip, true);
  assert.ok(!rec.items.some((i) => i.id === 's:05'), 'cảnh bị xóa khỏi Excel thì biến mất');
  assert.equal(Object.values(rec.chapterGrades)[0], 'warm');
  ok('reconcile: giữ chỉnh sửa khi Excel đổi');

  // kiểm tra dữ liệu từ client
  const ctx = { luts: ['ok_lut'], fonts: ['Lora'] };
  const evil = JSON.parse(JSON.stringify(p));
  evil.canvas = 'x'; evil.fps = 99; evil.outputName = '../../etc/passwd.mp4'; evil.items[1].use = 9999; evil.items[1].start = -5;
  evil.chapterGrades = { a: 'lut:../../x', b: 'lut:ok_lut', c: 'warm' }; evil.music.file = '../../x.mp3'; evil.music.loudness = 5;
  evil.lyrics = [{ s: 5, e: 1, t: 'x'.repeat(999) }, { s: 1, e: 2, t: '   ' }];
  const nz = normalizeProject(evil, ctx);
  assert.equal(nz.canvas, 'pic'); assert.equal(nz.fps, 24); assert.ok(!/[/\\]/.test(nz.outputName), nz.outputName);
  assert.equal(nz.items[1].use, 120); assert.equal(nz.items[1].start, 0);
  assert.deepEqual(nz.chapterGrades, { a: 'neutral', b: 'lut:ok_lut', c: 'warm' }); assert.equal(nz.music.file, null); assert.equal(nz.music.loudness, -9);
  assert.equal(nz.lyrics.length, 1); assert.equal(nz.lyrics[0].t.length, 300); assert.ok(nz.lyrics[0].e > nz.lyrics[0].s);
  assert.throws(() => normalizeProject({ items: [{ id: 'a' }, { id: 'a' }] }, ctx), /trùng/); assert.throws(() => normalizeProject(null, ctx));
  assert.deepEqual(listFonts(resolve('assets/fonts')), ['Lora']);
  ok('normalizeProject: chặn giá trị xấu, đường dẫn, LUT lạ, trùng id');
}

// ── 5. DỰNG THẬT bằng ffmpeg ───────────────────────────────
{
  const ff = resolveFfmpeg();
  console.log(`      ffmpeg: ${ff.source} ${ff.version.slice(0, 40)}`);
  const root = mkdtempSync(join(tmpdir(), 'edit-test-'));
  const out = join(root, 'output'); mkdirSync(out);
  const run = (a: string[]) => { const r = spawnSync(ff.path, ['-v', 'error', '-y', ...a], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
  // clip giả 8 s cho các cảnh 0 (khói), 1..6 ; cảnh 4 để THIẾU
  for (const num of ['1', '2', '3', '5', '6']) run(['-f', 'lavfi', '-i', `testsrc2=size=1280x720:rate=24:duration=8`, '-pix_fmt', 'yuv420p', join(out, `scene_${num}_00p0${num}_vid.mp4`)]);
  run(['-f', 'lavfi', '-i', 'nullsrc=s=1280x720:r=24:d=3,geq=lum=\'128+127*sin(X/90+T*2)*cos(Y/140)\':cb=128:cr=128', '-pix_fmt', 'yuv420p', join(out, 'scene_0_00p02_vid.mp4')]);
  run(['-f', 'lavfi', '-i', 'sine=frequency=330:duration=30', join(root, 'music.m4a')]);
  const clips = await discoverClips(out);
  assert.equal(clips.size, 6); near(clips.get('1')!.duration, 8, 0.1, 'đo độ dài clip');
  assert.equal(clips.get('4'), undefined);

  const mkItem = (id: string, num: string, ch: string, use: number, outk: 'cut' | 'dissolve' = 'cut') =>
    ({ id, kind: 'shot' as const, sceneNumber: num, chapter: ch, code: 'A' + num, size: 'cận', face: true, who: '', start: 0.3, use, sugg: use, out: outk, skip: false });
  const title = (ch: string) => ({ id: 't:' + ch, kind: 'title' as const, sceneNumber: '', chapter: ch, code: '', size: ch, face: false, who: '', start: 0, use: 1.3, sugg: 1.3, out: 'cut' as const, skip: false });
  const project: EditProject = {
    version: 1, canvas: 'pic', resolution: 720, fps: 24, grain: true, titleFont: 'Lora', titleDur: 1.3, plateScene: '0',
    chapterGrades: { C1: 'teal', C2: 'highkey', C3: 'cold' }, chapterTitles: { C1: 'Chương 1 · Chiến Quốc', C2: 'Chương 2 · Hiện đại', C3: 'Chương 3 · Đường' },
    outputName: 'test', lyrics: [{ s: 1.7, e: 3.2, t: 'Vạn kiếp tìm nhau' }, { s: 6, e: 7.5, t: 'đầu bạc răng long {x}' }],
    music: { file: 'music.m4a', name: 'm', duration: 30, offset: 0, fadeIn: 0.5, fadeOut: 1, loudness: -14 },
    items: [title('C1'), mkItem('s:1', '1', 'C1', 1.4), mkItem('s:2', '2', 'C1', 1.0, 'dissolve'), title('C2'), mkItem('s:3', '3', 'C2', 1.2, 'dissolve'),
      mkItem('s:4', '4', 'C2', 0.9), title('C3'), mkItem('s:5', '5', 'C3', 1.7), mkItem('s:6', '6', 'C3', 20)],
  };
  const an = analyze(project, clips, 30);
  assert.equal(an.missing.length, 1); assert.equal(an.missing[0].code, 'A4'); assert.ok(an.warnings.some((w) => /A6.*chỉ còn/.test(w)), an.warnings.join('|'));
  const expected = TL.layout(project.items.map((i) => ({ kind: i.kind, use: i.use, start: i.start, out: i.out, srcLen: clips.get(i.sceneNumber)?.duration, missing: i.kind === 'shot' && !clips.has(i.sceneNumber), skip: i.skip }))).total;
  near(an.total, expected, 1e-9, 'analyze dùng cùng layout');

  for (const canvas of ['pic', 'full', 'wide'] as const) {
    const p2 = { ...project, canvas };
    const outPath = join(root, `final-${canvas}.mp4`);
    const plan = planRender({ project: p2, clips, musicPath: join(root, 'music.m4a'), editDir: root, fontsDir: resolve('assets/fonts'), outPath, preview: false }, 30);
    let last = 0;
    await runRender(plan, outPath, (x) => (last = x)).promise;
    const d = await probeDuration(outPath, canvas + Date.now());
    near(d, plan.total, 0.15, `độ dài video ${canvas}`);
    const info = spawnSync(ff.path, ['-hide_banner', '-i', outPath], { encoding: 'utf8' }).stderr;
    const { W, H } = canvasSize(p2);
    assert.ok(info.includes(`${W}x${H}`), `kích thước ${W}x${H}: ${info.match(/Video:.*/)?.[0]}`);
    assert.ok(/Audio: aac/.test(info), 'có âm thanh AAC'); assert.equal(last, 1);
    assert.ok(!existsSync(plan.workDir), 'đã dọn thư mục tạm');
    ok(`dựng thật canvas "${canvas}": ${plan.total.toFixed(2)} s (3 nhóm xfade, 1 clip thiếu, 1 clip ngắn, grain, phụ đề, nhạc) → ${W}x${H}`);
  }

  // xem trước độ phân giải thấp + không nhạc + không clip khói
  const noPlate = { ...project, plateScene: null, music: { ...project.music, file: null } };
  const prevPath = join(root, '_preview.mp4');
  const plan = planRender({ project: noPlate, clips, musicPath: null, editDir: root, fontsDir: resolve('assets/fonts'), outPath: prevPath, preview: true });
  await runRender(plan, prevPath, () => {}).promise;
  const info = spawnSync(ff.path, ['-hide_banner', '-i', prevPath], { encoding: 'utf8' }).stderr;
  assert.ok(info.includes('360x640'), info.match(/Video:.*/)?.[0]); assert.ok(!/Audio:/.test(info));
  ok('xem trước: nhỏ gọn 360x640, không nhạc, không clip khói');

  // hủy giữa chừng không để lại tệp
  const cancelPath = join(root, 'cancel.mp4');
  const pl = planRender({ project, clips, musicPath: join(root, 'music.m4a'), editDir: root, fontsDir: resolve('assets/fonts'), outPath: cancelPath, preview: false }, 30);
  const h = runRender(pl, cancelPath, () => {}); setTimeout(() => h.cancel(), 150);
  await assert.rejects(h.promise, /hủy/); assert.ok(!existsSync(cancelPath)); assert.ok(!existsSync(pl.workDir));
  ok('hủy dựng: không để lại tệp dở và thư mục tạm');

  // nội dung ASS thật sự khớp thời gian đã trừ dissolve
  const rows = TL.layout(project.items.map((i) => ({ kind: i.kind, use: i.use, start: i.start, out: i.out, srcLen: clips.get(i.sceneNumber)?.duration, missing: i.kind === 'shot' && !clips.has(i.sceneNumber), skip: i.skip })));
  const ass = buildAss(project, project.items, rows.rows, rows.total, 720, 1280);
  const c2 = rows.rows[3].t0; // thẻ chương 2 (sau shot 2 có dissolve)
  assert.ok(ass.includes(`Dialogue: 1,${assTime(c2 + 0.15)}`), 'thẻ chương 2 bắt đầu đúng sau khi trừ dissolve');
  assert.ok(ass.includes('(x)') && !ass.includes('{x}'), 'ký tự {} trong lời hát bị vô hiệu');
  ok('ASS: thời gian thẻ chương khớp layout có dissolve');
  rmSync(root, { recursive: true, force: true });
}

console.log(`\nTẤT CẢ ĐỀU QUA (${n} nhóm)`);
