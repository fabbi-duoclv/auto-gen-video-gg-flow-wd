import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import type { ClipInfo } from './types.js';
import { probeDuration } from './ffmpeg.js';

const CLIP_RE = /^scene_([^_]+)_.+_vid\.mp4$/i;

/** Dò các clip đã tải trong thư mục output của Flow: số cảnh → clip (nếu trùng lấy tệp mới nhất). */
export async function discoverClips(outputDir: string): Promise<Map<string, ClipInfo>> {
  const found = new Map<string, { file: string; path: string; mtime: number; size: number }>();
  if (existsSync(outputDir)) {
    for (const file of readdirSync(outputDir)) {
      const m = CLIP_RE.exec(file);
      if (!m) continue;
      const path = join(outputDir, file);
      const st = statSync(path);
      if (!st.isFile() || st.size === 0) continue;
      const prev = found.get(m[1]);
      if (!prev || st.mtimeMs > prev.mtime) found.set(m[1], { file, path, mtime: st.mtimeMs, size: st.size });
    }
  }
  const out = new Map<string, ClipInfo>();
  await Promise.all([...found.entries()].map(async ([num, f]) => {
    const duration = await probeDuration(f.path, `${f.mtime}:${f.size}`);
    if (duration > 0) out.set(num, { file: f.file, path: f.path, duration });
  }));
  return out;
}
