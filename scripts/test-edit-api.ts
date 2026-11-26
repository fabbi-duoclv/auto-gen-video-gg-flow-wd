/**
 * Kiểm tra API bước Dựng qua HTTP thật. Cần server đang chạy (npm run serve) và tạo/xóa một Flow thử.
 * Chạy: npx tsx scripts/test-edit-api.ts   (BASE=http://localhost:3001 mặc định)
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { resolveFfmpeg } from '../src/edit/ffmpeg.js';

const BASE = process.env.BASE || 'http://localhost:3001';
// Node dùng lại kết nối keep-alive mà server đã đóng sau 5 giây rảnh: thử lại một lần.
const retry = async (u: string, init?: RequestInit): Promise<Response> => { try { return await fetch(u, init); } catch { return fetch(u, init); } };
const api = (p: string, init?: RequestInit) => retry(`${BASE}/api/flows${p}`, init);
const j = async (r: Response) => (await r.json()) as any;
let n = 0;
const ok = (s: string) => { console.log('PASS ', s); n++; };

const ff = resolveFfmpeg().path;
const run = (a: string[]) => { const r = spawnSync(ff, ['-v', 'error', '-y', ...a], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };

const flow = await j(await api('', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Test Dựng API' }) }));
const id = flow.id as string;
try {
  // chưa có Excel
  let r = await api(`/${id}/edit`); assert.equal(r.status, 400); assert.match((await j(r)).error, /Excel/);
  ok('chưa import Excel → báo lỗi rõ ràng');

  assert.equal((await api(`/${id}/upload`, { method: 'POST', body: readFileSync(resolve('wedding-video/excel/ngu-kiep.xlsx')) })).status, 200);
  const out = resolve(`flows/${id}/output`); mkdirSync(out, { recursive: true });
  for (const num of ['00', '01', '02', '03', '04', '05', '06', '07']) {
    if (num === '00') run(['-f', 'lavfi', '-i', "nullsrc=s=1280x720:r=24:d=3,geq=lum='128+127*sin(X/90+T*2)*cos(Y/140)':cb=128:cr=128", '-pix_fmt', 'yuv420p', join(out, `scene_00_00p02_vid.mp4`)]);
    else run(['-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=24:duration=6', '-pix_fmt', 'yuv420p', join(out, `scene_${num}_00p0${num[1]}_vid.mp4`)]);
  }

  let st = await j(await api(`/${id}/edit`));
  assert.equal(st.project.items.filter((i: any) => i.kind === 'shot').length, 40);
  assert.equal(st.project.items.filter((i: any) => i.kind === 'title').length, 5);
  assert.equal(st.analysis.readyShots, 7); assert.equal(st.analysis.missing.length, 33);
  assert.equal(st.ffmpeg.ok, true); assert.deepEqual(st.fonts, ['Lora']); assert.ok(st.grades.length >= 6);
  assert.equal(st.clips['01'].duration > 5.9, true);
  ok(`GET edit: 40 shot + 5 thẻ chương, nhận ${st.analysis.readyShots} clip, thiếu ${st.analysis.missing.length}, ffmpeg ${st.ffmpeg.source}`);

  // lưu: chỉnh vài thứ rồi đọc lại
  const p = st.project;
  p.items.find((i: any) => i.id === 's:01').use = 2.1; p.items.find((i: any) => i.id === 's:02').out = 'dissolve'; p.items.find((i: any) => i.id === 's:03').skip = true;
  p.chapterTitles[Object.keys(p.chapterTitles)[0]] = 'Chương Một';
  r = await api(`/${id}/edit`, { method: 'PUT', body: JSON.stringify(p) }); assert.equal(r.status, 200);
  const st2 = await j(await api(`/${id}/edit`));
  assert.equal(st2.project.items.find((i: any) => i.id === 's:01').use, 2.1); assert.equal(st2.project.items.find((i: any) => i.id === 's:03').skip, true);
  assert.equal(Object.values(st2.project.chapterTitles)[0], 'Chương Một');
  r = await api(`/${id}/edit`, { method: 'PUT', body: '{không phải json' }); assert.equal(r.status, 400);
  r = await api(`/${id}/edit`, { method: 'PUT', body: JSON.stringify({ items: [{ id: 'a' }, { id: 'a' }] }) }); assert.equal(r.status, 400);
  ok('PUT edit: lưu và đọc lại, từ chối JSON hỏng và id trùng');

  // nhạc
  run(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=12', '-c:a', 'libmp3lame', '/tmp/claude-0/t-music.mp3']);
  r = await api(`/${id}/edit/music?name=${encodeURIComponent('bài hát.mp3')}`, { method: 'POST', body: readFileSync('/tmp/claude-0/t-music.mp3') });
  const mu = await j(r); assert.equal(r.status, 200, JSON.stringify(mu)); assert.equal(mu.music.file, 'music.mp3'); assert.ok(Math.abs(mu.music.duration - 12) < 0.3);
  r = await api(`/${id}/edit/music?name=x.mp3`, { method: 'POST', body: Buffer.from('không phải âm thanh') }); assert.equal(r.status, 400);
  r = await api(`/${id}/edit/music?name=x.exe`, { method: 'POST', body: Buffer.from('MZ') }); assert.equal(r.status, 400);
  r = await retry(`${BASE}/api/flows/${id}/edit/music`, { headers: { range: 'bytes=0-99' } }); assert.equal(r.status, 206); assert.equal((await r.arrayBuffer()).byteLength, 100);
  assert.equal((await j(await api(`/${id}/edit`))).project.music.name, 'bài hát.mp3');
  ok('nhạc: upload, từ chối tệp không phải âm thanh / đuôi lạ, phát lại có Range (206)');

  // LUT
  const cube = 'TITLE "t"\nLUT_3D_SIZE 2\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1\n';
  r = await api(`/${id}/edit/lut?name=${encodeURIComponent('Phim cổ.cube')}`, { method: 'POST', body: cube }); const lu = await j(r); assert.equal(r.status, 200, JSON.stringify(lu)); assert.equal(lu.name, 'Phim_co');
  r = await api(`/${id}/edit/lut?name=bad`, { method: 'POST', body: 'hello' }); assert.equal(r.status, 400);
  assert.deepEqual((await j(await api(`/${id}/edit`))).luts, ['Phim_co']);
  ok('LUT .cube: nhận tệp hợp lệ, từ chối tệp lạ');

  // lời
  r = await api(`/${id}/edit/lyrics`, { method: 'POST', body: '[00:01.00]Xin chào\n[00:03.00]Tạm biệt\n' }); const ly = await j(r);
  assert.equal(ly.lines.length, 2); assert.equal(ly.lines[0].t, 'Xin chào');
  r = await api(`/${id}/edit/lyrics`, { method: 'POST', body: 'không có mốc' }); assert.equal(r.status, 400);
  ok('lời hát: parse .lrc, báo lỗi khi không đọc được');

  // dựng xem thử
  const pr = (await j(await api(`/${id}/edit`))).project;
  pr.lyrics = ly.lines; pr.chapterGrades[Object.keys(pr.chapterGrades)[0]] = 'lut:Phim_co'; pr.resolution = 720;
  assert.equal((await api(`/${id}/edit`, { method: 'PUT', body: JSON.stringify(pr) })).status, 200);
  r = await api(`/${id}/edit/render`, { method: 'POST', body: JSON.stringify({ preview: true }) }); assert.equal(r.status, 202, JSON.stringify(await r.clone().json()));
  r = await api(`/${id}/edit/render`, { method: 'POST', body: '{}' }); assert.equal(r.status, 409, 'không cho chạy hai bản dựng cùng lúc');
  let s: any; for (let i = 0; i < 120; i++) { await new Promise((x) => setTimeout(x, 500)); s = await j(await api(`/${id}/edit/render`)); if (s.state !== 'running') break; }
  assert.equal(s.state, 'done', JSON.stringify(s)); assert.equal(s.file, '_preview.mp4'); assert.equal(s.percent, 100);
  r = await retry(`${BASE}/api/flows/${id}/edit/final/_preview.mp4`, { headers: { range: 'bytes=0-1023' } }); assert.equal(r.status, 206); assert.equal(r.headers.get('content-type'), 'video/mp4');
  r = await retry(`${BASE}/api/flows/${id}/edit/final/_preview.mp4?download=1`); assert.match(r.headers.get('content-disposition') || '', /attachment; filename="_preview.mp4"/);
  r = await retry(`${BASE}/api/flows/${id}/edit/final/..%2F..%2Fmeta.json`); assert.equal(r.status, 404);
  const fin = (await j(await api(`/${id}/edit`))).finals; assert.ok(fin.some((f: any) => f.file === '_preview.mp4' && f.preview));
  ok(`dựng xem thử ${s.seconds}s: tải về có Range, ép tải xuống, chặn đường dẫn lạ, cấm chạy song song`);

  // dựng đầy đủ rồi hủy ngay
  r = await api(`/${id}/edit/render`, { method: 'POST', body: JSON.stringify({ preview: false }) }); assert.equal(r.status, 202);
  await new Promise((x) => setTimeout(x, 300));
  assert.equal((await j(await api(`/${id}/edit/render/cancel`, { method: 'POST' }))).cancelled, true);
  await new Promise((x) => setTimeout(x, 600));
  s = await j(await api(`/${id}/edit/render`)); assert.equal(s.state, 'cancelled');
  assert.ok(!(await j(await api(`/${id}/edit`))).finals.some((f: any) => f.file.includes('ngu-kiep')), 'hủy không để lại tệp');
  r = await api(`/${id}/edit/render`, { method: 'POST', body: JSON.stringify({ preview: false }) }); assert.equal(r.status, 202);
  for (let i = 0; i < 240; i++) { await new Promise((x) => setTimeout(x, 500)); s = await j(await api(`/${id}/edit/render`)); if (s.state !== 'running') break; }
  assert.equal(s.state, 'done', JSON.stringify(s)); assert.match(s.file, /\.mp4$/);
  ok(`hủy giữa chừng rồi dựng lại đầy đủ: ${s.file} trong ${s.seconds}s`);
} finally {
  await api(`/${id}`, { method: 'DELETE' });
}
console.log(`\nTẤT CẢ ĐỀU QUA (${n} nhóm)`);
