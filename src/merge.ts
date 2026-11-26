import { execFile } from 'child_process';
import { promisify } from 'util';
import { readdirSync, statSync, renameSync, rmSync } from 'fs';
import { join } from 'path';

const run = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';

export const FINAL_NAME = 'final.mp4';
/** Đuôi .part để danh sách output (lọc theo .mp4) và ZIP không thấy file đang ghép dở. */
const TMP_NAME = 'final.mp4.part';
const DEFAULT_KEEP_SEC = 2;
const FPS = 30;

export interface MergeScene {
  sceneNumber: string;
  sceneName: string;
  endTime: string;
}

export interface MergeResult {
  file: string;
  clips: number;
  seconds: number;
  skipped: string[];
}

/** Thư mục output đang được ghép (khóa để không chạy hai ffmpeg cùng ghi một file). */
const merging = new Set<string>();

export function isMerging(outputDir: string): boolean {
  return merging.has(outputDir);
}

/** "... · dùng 1,7 s · ..." → 1.7. Không có thì dùng mặc định. */
export function keepSeconds(sceneName: string): number {
  const m = sceneName.match(/dùng\s*(\d+(?:[.,]\d+)?)\s*s/i);
  if (!m) return DEFAULT_KEEP_SEC;
  const v = parseFloat(m[1].replace(',', '.'));
  return v > 0 ? v : DEFAULT_KEEP_SEC;
}

async function probeSize(file: string): Promise<{ w: number; h: number }> {
  const { stdout } = await run(FFPROBE, [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', file,
  ]);
  const [w, h] = stdout.trim().split('x').map(Number);
  if (!w || !h) throw new Error(`Không đọc được kích thước video: ${file}`);
  return { w: w - (w % 2), h: h - (h % 2) };
}

/**
 * Chọn đúng một clip cho mỗi cảnh trong danh sách hiện tại:
 * ưu tiên file khớp endTime hiện tại, không có thì lấy file mới nhất của cảnh đó.
 * File của cảnh không còn trong danh sách bị bỏ qua.
 */
function pickClips(outputDir: string, scenes: MergeScene[]) {
  const byScene = new Map<string, string[]>();
  for (const f of readdirSync(outputDir)) {
    const m = f.match(/^scene_(\d+)_.*_vid\.mp4$/);
    if (!m) continue;
    const list = byScene.get(m[1]) ?? [];
    list.push(f);
    byScene.set(m[1], list);
  }

  const skipped: string[] = [];
  const picked: { file: string; scene: MergeScene }[] = [];
  const ordered = [...scenes].sort((a, b) => Number(a.sceneNumber) - Number(b.sceneNumber));
  for (const scene of ordered) {
    const files = byScene.get(scene.sceneNumber);
    if (!files?.length) continue;
    if (Number(scene.sceneNumber) === 0) { skipped.push(`cảnh 00 (nền thẻ chương)`); continue; }

    const exact = `scene_${scene.sceneNumber}_${scene.endTime}_vid.mp4`;
    const file = files.includes(exact)
      ? exact
      : files.reduce((a, b) => (statSync(join(outputDir, a)).mtimeMs >= statSync(join(outputDir, b)).mtimeMs ? a : b));
    picked.push({ file, scene });
    for (const f of files) if (f !== file) skipped.push(`${f} (clip cũ của cảnh ${scene.sceneNumber})`);
  }
  return { picked, skipped };
}

/**
 * Ghép các clip theo thứ tự cảnh thành final.mp4.
 * Mỗi clip được cắt về độ dài "dùng X s" ghi trong tên cảnh. Cảnh 0 (nền thẻ chương) bị bỏ qua.
 */
export async function mergeClips(outputDir: string, scenes: MergeScene[]): Promise<MergeResult> {
  if (merging.has(outputDir)) throw new Error('Đang ghép video, đợi lần ghép trước xong.');
  merging.add(outputDir);
  try {
    const { picked, skipped } = pickClips(outputDir, scenes);
    if (picked.length === 0) throw new Error('Chưa có clip video nào để ghép (scene_NN_*_vid.mp4).');

    const { w, h } = await probeSize(join(outputDir, picked[0].file));

    const args: string[] = ['-y', '-v', 'error'];
    const filters: string[] = [];
    let total = 0;
    picked.forEach((c, i) => {
      const keep = keepSeconds(c.scene.sceneName);
      total += keep;
      args.push('-i', join(outputDir, c.file));
      filters.push(
        `[${i}:v]trim=duration=${keep},setpts=PTS-STARTPTS,` +
        `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,fps=${FPS}[v${i}]`,
      );
    });
    filters.push(`${picked.map((_, i) => `[v${i}]`).join('')}concat=n=${picked.length}:v=1:a=0[out]`);

    const tmpPath = join(outputDir, TMP_NAME);
    args.push(
      '-filter_complex', filters.join(';'),
      '-map', '[out]', '-an',
      '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-f', 'mp4', tmpPath,
    );

    try {
      await run(FFMPEG, args, { maxBuffer: 16 * 1024 * 1024 });
    } catch (e) {
      rmSync(tmpPath, { force: true });
      const err = e as NodeJS.ErrnoException & { stderr?: string };
      if (err.code === 'ENOENT') throw new Error('Không tìm thấy ffmpeg. Cài ffmpeg hoặc đặt biến FFMPEG_PATH.');
      throw new Error(`ffmpeg lỗi: ${(err.stderr || err.message).slice(0, 500)}`);
    }
    // Chỉ thay final.mp4 khi đã ghép xong, để không ai tải phải file dở.
    renameSync(tmpPath, join(outputDir, FINAL_NAME));

    return { file: FINAL_NAME, clips: picked.length, seconds: Math.round(total * 10) / 10, skipped };
  } finally {
    merging.delete(outputDir);
  }
}
