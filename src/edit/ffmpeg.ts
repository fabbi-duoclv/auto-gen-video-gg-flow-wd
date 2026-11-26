import { spawn, spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { createRequire } from 'module';

export interface FfmpegInfo { path: string; source: 'env' | 'system' | 'bundled'; version: string }

const REQUIRED = ['subtitles', 'xfade', 'loudnorm', 'lut3d', 'concat', 'colorbalance'];
let cached: FfmpegInfo | null = null;

function capable(bin: string): { ok: boolean; version: string } {
  const v = spawnSync(bin, ['-hide_banner', '-version'], { encoding: 'utf8' });
  if (v.error || v.status !== 0) return { ok: false, version: '' };
  const f = spawnSync(bin, ['-hide_banner', '-filters'], { encoding: 'utf8' });
  if (f.status !== 0) return { ok: false, version: '' };
  const names = new Set(f.stdout.split('\n').map((l) => l.trim().split(/\s+/)[1]).filter(Boolean));
  const ok = REQUIRED.every((n) => names.has(n));
  return { ok, version: (v.stdout.split('\n')[0] || '').replace(/^ffmpeg version /, '') };
}

/**
 * Chọn ffmpeg: biến FFMPEG_PATH > ffmpeg của máy (nếu đủ bộ lọc cần dùng) > bản đóng gói sẵn (ffmpeg-static).
 * Ném lỗi rõ ràng nếu không có cái nào dùng được.
 */
export function resolveFfmpeg(): FfmpegInfo {
  if (cached) return cached;
  const env = process.env.FFMPEG_PATH;
  if (env) {
    const c = capable(env);
    if (!c.ok) throw new Error(`FFMPEG_PATH="${env}" không chạy được hoặc thiếu bộ lọc (${REQUIRED.join(', ')}).`);
    return (cached = { path: env, source: 'env', version: c.version });
  }
  const sys = capable('ffmpeg');
  if (sys.ok) return (cached = { path: 'ffmpeg', source: 'system', version: sys.version });
  try {
    const req = createRequire(import.meta.url);
    const p = req('ffmpeg-static') as string | null;
    if (p && existsSync(p)) {
      const c = capable(p);
      if (c.ok) return (cached = { path: p, source: 'bundled', version: c.version });
    }
  } catch { /* chưa cài */ }
  throw new Error('Không tìm thấy ffmpeg dùng được. Chạy "npm install" (có ffmpeg-static) hoặc cài ffmpeg và/hoặc đặt FFMPEG_PATH.');
}

export interface MediaInfo { duration: number; hasAudio: boolean; hasVideo: boolean }

/** Đọc nhanh độ dài và các luồng của tệp media (dùng ffmpeg -i, không cần ffprobe). */
export function probeMedia(file: string): Promise<MediaInfo> {
  return new Promise((resolve) => {
    let bin: string;
    try { bin = resolveFfmpeg().path; } catch { return resolve({ duration: 0, hasAudio: false, hasVideo: false }); }
    const p = spawn(bin, ['-hide_banner', '-i', file], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', () => resolve({ duration: 0, hasAudio: false, hasVideo: false }));
    p.on('close', () => {
      const m = err.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      resolve({ duration: m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0, hasAudio: /Stream #.*Audio:/.test(err), hasVideo: /Stream #.*Video:/.test(err) });
    });
  });
}

export interface ClipProbe { duration: number; width: number; height: number }

const probeCache = new Map<string, ClipProbe>();

/** Độ dài (giây) và kích thước hình của clip, đọc từ stderr của `ffmpeg -i` (không cần ffprobe). Kết quả nhớ theo `mtimeKey`. */
export function probeClip(file: string, mtimeKey = ''): Promise<ClipProbe> {
  const key = file + '|' + mtimeKey;
  const hit = probeCache.get(key);
  if (hit !== undefined) return Promise.resolve(hit);
  return new Promise((resolve) => {
    const none: ClipProbe = { duration: 0, width: 0, height: 0 };
    let bin: string;
    try { bin = resolveFfmpeg().path; } catch { return resolve(none); }
    const p = spawn(bin, ['-hide_banner', '-i', file], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', () => resolve(none));
    p.on('close', () => {
      const m = err.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      const d = m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
      const v = err.match(/Stream #[^\n]*Video:[^\n]*?[ ,](\d{2,5})x(\d{2,5})[ ,\[]/);
      const out = { duration: d, width: v ? +v[1] : 0, height: v ? +v[2] : 0 };
      probeCache.set(key, out);
      resolve(out);
    });
  });
}

/** Độ dài (giây) của tệp media. */
export function probeDuration(file: string, mtimeKey = ''): Promise<number> {
  return probeClip(file, mtimeKey).then((c) => c.duration);
}
