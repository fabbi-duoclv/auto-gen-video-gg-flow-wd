import { spawn, type ChildProcess } from 'child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, dirname, join } from 'path';
import type { ClipInfo, EditProject, EditItem } from './types.js';
import { resolveFfmpeg } from './ffmpeg.js';
import { TL, type TLItem } from './timeline.js';
import { gradeFilter } from './grades.js';
import { buildAss } from './ass.js';

export interface RenderCtx {
  project: EditProject;
  clips: Map<string, ClipInfo>;
  musicPath: string | null;
  editDir: string;
  fontsDir: string;
  outPath: string;
  preview: boolean;
}

export interface Analysis {
  total: number;
  readyShots: number;
  totalShots: number;
  missing: { id: string; code: string }[];
  warnings: string[];
}

const f3 = (n: number) => n.toFixed(3);

export function canvasSize(project: EditProject): { W: number; H: number; PH: number } {
  const res = project.resolution;
  if (project.canvas === 'wide') return { W: res === 1080 ? 1920 : 1280, H: res, PH: res };
  const H = Math.round((res * 16) / 9 / 2) * 2;
  return { W: res, H, PH: Math.round((res * 9) / 16 / 2) * 2 };
}

/** Gắn thông tin clip vào từng item để tính layout (độ dài thật, thiếu clip). */
export function toTLItems(project: EditProject, clips: Map<string, ClipInfo>): (TLItem & { src: EditItem })[] {
  return project.items.map((it) => {
    const clip = it.kind === 'shot' ? clips.get(it.sceneNumber) : undefined;
    return { kind: it.kind, use: it.use, start: it.start, srcLen: clip?.duration, missing: it.kind === 'shot' && !clip, skip: it.skip, out: it.out, src: it };
  });
}

/** Kiểm tra trước khi dựng: tổng thời lượng, shot thiếu clip, cảnh báo. */
export function analyze(project: EditProject, clips: Map<string, ClipInfo>, musicDuration = 0): Analysis {
  const tl = toTLItems(project, clips);
  const { total, rows } = TL.layout(tl);
  const shots = tl.filter((x) => x.kind === 'shot' && !x.skip);
  const missing = shots.filter((x) => x.missing).map((x) => ({ id: x.src.id, code: x.src.code }));
  const warnings: string[] = [];
  tl.forEach((x, i) => {
    if (x.skip || x.kind !== 'shot' || x.missing) return;
    if (rows[i].use < x.use - 0.05) warnings.push(`${x.src.code}: clip chỉ còn ${rows[i].use.toFixed(1)} s từ điểm bắt đầu, ngắn hơn ${x.use.toFixed(1)} s đã đặt.`);
  });
  if (project.items.some((i) => i.kind === 'title' && !i.skip) && !(project.plateScene && clips.has(project.plateScene))) {
    warnings.push('Chưa có clip khói (nền thẻ chương): thẻ chương sẽ dùng nền đen.');
  }
  if (project.music.file && musicDuration > 0 && musicDuration - project.music.offset < total - 0.2) {
    warnings.push(`Nhạc ngắn hơn video ${(total - (musicDuration - project.music.offset)).toFixed(1)} s: đoạn cuối sẽ im lặng.`);
  }
  if (!project.music.file) warnings.push('Chưa có nhạc: video sẽ không có tiếng.');
  return { total, readyShots: shots.length - missing.length, totalShots: shots.length, missing, warnings };
}

export interface RenderPlan { args: string[]; total: number; width: number; height: number; workDir: string; analysis: Analysis }

/** Dựng lệnh ffmpeg từ dự án. Ghi phụ đề, phông chữ, LUT vào thư mục làm việc tạm để filter dùng đường dẫn tương đối. */
export function planRender(ctx: RenderCtx, musicDuration = 0): RenderPlan {
  const { project, clips } = ctx;
  resolveFfmpeg(); // báo lỗi sớm nếu không có ffmpeg
  const { W, H, PH } = canvasSize(project);
  const F = project.fps;
  const tl = toTLItems(project, clips);
  const { total, rows } = TL.layout(tl);
  const vis = tl.map((_, i) => i).filter((i) => !tl[i].skip);
  if (!vis.length || total <= 0) throw new Error('Không có shot nào để dựng (tất cả đang bị bỏ).');
  const analysis = analyze(project, clips, musicDuration);

  const workDir = mkdtempSync(join(tmpdir(), 'ggflow-render-'));
  mkdirSync(join(workDir, 'fonts'));
  for (const f of existsSync(ctx.fontsDir) ? readdirSync(ctx.fontsDir) : []) if (/\.(ttf|otf)$/i.test(f)) copyFileSync(join(ctx.fontsDir, f), join(workDir, 'fonts', f));
  const lutDir = join(ctx.editDir, 'luts');
  if (existsSync(lutDir)) {
    mkdirSync(join(workDir, 'luts'));
    for (const f of readdirSync(lutDir)) if (/^[A-Za-z0-9_-]{1,60}\.cube$/.test(f)) copyFileSync(join(lutDir, f), join(workDir, 'luts', f));
  }
  writeFileSync(join(workDir, 'subs.ass'), buildAss(project, project.items, rows, total, W, H));

  const inputs: string[] = [];
  const inputOf = (p: string) => { let k = inputs.indexOf(p); if (k < 0) { k = inputs.length; inputs.push(p); } return k; };
  const parts: string[] = [];
  const plate = project.plateScene ? clips.get(project.plateScene) : undefined;
  const black = (use: number) => `color=c=black:s=${W}x${H}:r=${F}:d=${f3(use)},setsar=1,format=yuv420p`;

  const fit = (): { pre: string; post: string } => {
    if (project.canvas === 'pic') return { pre: `scale=${W}:${PH}:flags=lanczos`, post: `pad=${W}:${H}:0:${(H - PH) / 2}:black` };
    if (project.canvas === 'full') return { pre: `scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H}`, post: '' };
    return { pre: `scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos`, post: `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black` };
  };

  for (const i of vis) {
    const it = tl[i];
    const use = rows[i].use;
    if (it.kind === 'title') {
      if (plate) {
        const k = inputOf(plate.path);
        parts.push(`[${k}:v]tpad=stop_mode=clone:stop_duration=6,trim=start=0:duration=${f3(use)},setpts=PTS-STARTPTS,fps=${F},scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,format=gray,format=yuv420p[v${i}]`);
      } else parts.push(`${black(use)}[v${i}]`);
    } else if (it.missing) {
      parts.push(`${black(use)}[v${i}]`);
    } else {
      const clip = clips.get(it.src.sceneNumber)!;
      const k = inputOf(clip.path);
      const start = Math.min(it.src.start, Math.max(0, clip.duration - use));
      const { pre, post } = fit();
      const grade = gradeFilter(project.chapterGrades[it.src.chapter] ?? 'neutral');
      parts.push(`[${k}:v]trim=start=${f3(start)}:duration=${f3(use)},setpts=PTS-STARTPTS,fps=${F},${pre},setsar=1${grade ? ',' + grade : ''}${post ? ',' + post : ''},format=yuv420p[v${i}]`);
    }
  }

  // Nhóm các đoạn cắt cứng vào một concat; nối các nhóm bằng xfade (dissolve).
  const groups: number[][] = [[vis[0]]];
  for (let n = 1; n < vis.length; n++) {
    if (rows[vis[n - 1]].d > 0) groups.push([vis[n]]); else groups[groups.length - 1].push(vis[n]);
  }
  groups.forEach((g, gi) => parts.push(g.map((i) => `[v${i}]`).join('') + `concat=n=${g.length}:v=1:a=0[g${gi}]`));
  const glen = groups.map((g) => g.reduce((s, i) => s + rows[i].use, 0));
  let acc = 'g0', accLen = glen[0];
  for (let gi = 1; gi < groups.length; gi++) {
    const prevLast = groups[gi - 1][groups[gi - 1].length - 1];
    const d = rows[prevLast].d;
    parts.push(`[${acc}][g${gi}]xfade=transition=fade:duration=${f3(d)}:offset=${f3(accLen - d)}[x${gi}]`);
    acc = `x${gi}`; accLen += glen[gi] - d;
  }
  const post: string[] = [];
  if (project.grain) post.push('noise=alls=7:allf=t');
  post.push('subtitles=subs.ass:fontsdir=fonts');
  if (ctx.preview) post.push('scale=trunc(iw/4)*2:trunc(ih/4)*2');
  parts.push(`[${acc}]${post.join(',')}[vout]`);

  let audio = false;
  if (ctx.musicPath) {
    const k = inputOf(ctx.musicPath);
    const m = project.music;
    const fo = Math.min(m.fadeOut, total / 2), fi = Math.min(m.fadeIn, total / 2);
    const chain = [`aresample=48000`, `atrim=start=${f3(m.offset)}`, 'asetpts=PTS-STARTPTS', `apad=whole_dur=${f3(total)}`, `atrim=end=${f3(total)}`];
    if (fi > 0) chain.push(`afade=t=in:d=${f3(fi)}`);
    if (fo > 0) chain.push(`afade=t=out:st=${f3(total - fo)}:d=${f3(fo)}`);
    if (m.loudness !== null) chain.push(`loudnorm=I=${m.loudness}:TP=-1.5:LRA=11`);
    parts.push(`[${k}:a]${chain.join(',')}[aout]`);
    audio = true;
  }

  const args = ['-hide_banner', '-y', '-nostdin'];
  for (const p of inputs) args.push('-i', p);
  args.push('-filter_complex', parts.join(';'), '-map', '[vout]');
  if (audio) args.push('-map', '[aout]');
  args.push('-c:v', 'libx264', '-preset', ctx.preview ? 'ultrafast' : 'fast', '-crf', ctx.preview ? '30' : '19', '-pix_fmt', 'yuv420p', '-r', String(F));
  if (audio) args.push('-c:a', 'aac', '-b:a', ctx.preview ? '96k' : '192k');
  args.push('-t', f3(total), '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', ctx.outPath);
  return { args, total, width: ctx.preview ? Math.trunc(W / 4) * 2 : W, height: ctx.preview ? Math.trunc(H / 4) * 2 : H, workDir, analysis };
}

export interface RenderHandle { promise: Promise<void>; cancel(): void }

/** Chạy ffmpeg, báo tiến độ 0..1 qua onProgress. Luôn dọn thư mục tạm. Hủy thì xóa tệp dở. */
export function runRender(plan: RenderPlan, outPath: string, onProgress: (p: number) => void): RenderHandle {
  const ff = resolveFfmpeg();
  mkdirSync(dirname(outPath), { recursive: true });
  let proc: ChildProcess | null = null;
  let cancelled = false;
  const promise = new Promise<void>((resolve, reject) => {
    proc = spawn(ff.path, plan.args, { cwd: plan.workDir, stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    let buf = '';
    proc.stdout!.on('data', (d) => {
      buf += d;
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        const m = /^out_time_(?:us|ms)=(\d+)/.exec(line); // cả hai đều là micro giây
        if (m) onProgress(Math.min(1, +m[1] / 1e6 / plan.total));
      }
    });
    proc.stderr!.on('data', (d) => { err = (err + d).slice(-4000); });
    proc.on('error', (e) => reject(e));
    proc.on('close', (code) => {
      rmSync(plan.workDir, { recursive: true, force: true });
      if (cancelled) { rmSync(outPath, { force: true }); return reject(new Error('Đã hủy')); }
      if (code === 0 && existsSync(outPath) && statSync(outPath).size > 0) { onProgress(1); return resolve(); }
      rmSync(outPath, { force: true });
      reject(new Error('ffmpeg lỗi (mã ' + code + '): ' + (err.trim().split('\n').slice(-6).join('\n') || 'không rõ')));
    });
  });
  return { promise, cancel() { cancelled = true; proc?.kill('SIGKILL'); } };
}

export function finalFileName(project: EditProject, preview: boolean): string {
  return preview ? '_preview.mp4' : `${basename(project.outputName)}.mp4`;
}
