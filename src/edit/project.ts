import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import type { SceneData } from '../excel-reader.js';
import type { Canvas, EditItem, EditProject, Lyric } from './types.js';
import { DEFAULT_CYCLE, isGradeKey } from './grades.js';

export const TITLE_DUR = 1.3;
export const DEFAULT_START = 0.3;
const PLATE_RE = /thẻ chương|nền khói|smoke|title card/i;

export interface ParsedShot { code: string; chapter: string; size: string; dur: number; face: boolean }

/** "A1.04 · Chương 1 · Chiến Quốc · vừa-rộng · dùng 3,5 s · mặt: có" → các trường. Không khớp thì null. */
export function parseShotName(name: string): ParsedShot | null {
  const p = String(name || '').split(' · ').map((x) => x.trim());
  const n = p.length;
  if (n >= 5 && /^dùng\s/i.test(p[n - 2]) && /^mặt\s*:/i.test(p[n - 1])) {
    const dur = parseFloat(p[n - 2].replace(/^dùng\s*/i, '').replace(',', '.'));
    if (!isFinite(dur) || dur <= 0) return null;
    return { code: p[0], chapter: p.slice(1, n - 3).join(' · '), size: p[n - 3], dur, face: /có/i.test(p[n - 1]) };
  }
  return null;
}

export function slugify(s: string): string {
  const base = s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return (base || 'video-cuoi').slice(0, 60);
}

export function defaultMusic(): EditProject['music'] {
  return { file: null, name: '', duration: 0, offset: 0, fadeIn: 0.5, fadeOut: 1.2, loudness: -14 };
}

/** Dựng dự án mặc định từ danh sách cảnh trong Excel (chỉ cảnh AI-VID có clip để dựng). */
export function buildDefaultProject(scenes: SceneData[], flowName = ''): EditProject {
  const vids = scenes.filter((s) => s.type === 'AI-VID');
  const parsed = vids.map((s) => ({ s, p: parseShotName(s.sceneName) }));
  const grouped = parsed.some((x) => x.p);
  const plate = grouped ? parsed.find((x) => !x.p && PLATE_RE.test(x.s.sceneName)) : undefined;

  const items: EditItem[] = [];
  const chapters: string[] = [];
  let cur = '';
  // id phải duy nhất: chương quay lại (A, B, A) hoặc số cảnh lặp trong Excel không được tạo id trùng (sẽ làm Edit không mở được)
  const usedIds = new Set<string>();
  const uid = (base: string) => { let id = base, n = 1; while (usedIds.has(id)) id = `${base}#${++n}`; usedIds.add(id); return id; };
  for (const { s, p } of parsed) {
    if (plate && s === plate.s) continue;
    if (p && p.chapter !== cur) {
      cur = p.chapter;
      if (!chapters.includes(cur)) chapters.push(cur);
      items.push({ id: uid(`t:${cur}`), kind: 'title', sceneNumber: '', chapter: cur, code: '', size: cur, face: false, who: '', start: 0, use: TITLE_DUR, sugg: TITLE_DUR, out: 'cut', skip: false });
    }
    const use = p ? p.dur : Math.max(0.5, Number(s.duration) || 3);
    items.push({
      id: uid(`s:${s.sceneNumber}`), kind: 'shot', sceneNumber: s.sceneNumber, chapter: cur,
      code: p ? p.code : `#${s.sceneNumber}`, size: p ? p.size : s.sceneName, face: p ? p.face : false,
      who: (s.characterNames || []).join(', '), start: DEFAULT_START, use, sugg: use,
      out: /dissolve/i.test(s.transition || '') ? 'dissolve' : 'cut', skip: false,
    });
  }

  const chapterGrades: Record<string, string> = {};
  const chapterTitles: Record<string, string> = {};
  chapters.forEach((c, i) => { chapterGrades[c] = DEFAULT_CYCLE[i] ?? 'neutral'; chapterTitles[c] = c; });

  return {
    version: 1, canvas: 'pic', resolution: 1080, fps: 24, grain: false, titleFont: 'Lora', titleDur: TITLE_DUR,
    plateScene: plate ? plate.s.sceneNumber : null,
    chapterGrades, chapterTitles, outputName: slugify(flowName),
    items, lyrics: [], music: defaultMusic(),
  };
}

/** Ghép dự án đã lưu với danh sách cảnh hiện tại của Excel: giữ chỉnh sửa của người dùng, theo thứ tự Excel mới. */
export function reconcile(saved: EditProject, fresh: EditProject): EditProject {
  const byId = new Map(saved.items.map((i) => [i.id, i]));
  const items = fresh.items.map((f) => {
    const s = byId.get(f.id);
    return s ? { ...f, start: s.start, use: s.use, out: s.out, skip: s.skip } : f;
  });
  const chapters = [...new Set(fresh.items.map((i) => i.chapter).filter(Boolean))];
  const chapterGrades: Record<string, string> = {};
  const chapterTitles: Record<string, string> = {};
  for (const c of chapters) {
    chapterGrades[c] = saved.chapterGrades[c] ?? fresh.chapterGrades[c] ?? 'neutral';
    chapterTitles[c] = saved.chapterTitles[c] ?? fresh.chapterTitles[c] ?? c;
  }
  return { ...saved, items, plateScene: fresh.plateScene, chapterGrades, chapterTitles };
}

// ─── kiểm tra dữ liệu từ client ───────────────────────────────

export interface NormalizeCtx { luts: string[]; fonts: string[] }

const num = (v: unknown, min: number, max: number, def: number): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const str = (v: unknown, max: number, def = ''): string => (typeof v === 'string' ? v.slice(0, max) : def);

export function normalizeProject(raw: unknown, ctx: NormalizeCtx): EditProject {
  if (!raw || typeof raw !== 'object') throw new Error('Dữ liệu dự án dựng không hợp lệ');
  const r = raw as Record<string, unknown>;

  const items: EditItem[] = [];
  const seen = new Set<string>();
  if (!Array.isArray(r.items)) throw new Error('Thiếu danh sách items');
  if (r.items.length > 500) throw new Error('Quá nhiều shot (tối đa 500)');
  for (const x of r.items as Record<string, unknown>[]) {
    if (!x || typeof x !== 'object') continue;
    const id = str(x.id, 120);
    if (!id || seen.has(id)) throw new Error(`Item trùng hoặc thiếu id: "${id}"`);
    seen.add(id);
    const kind = x.kind === 'title' ? 'title' : 'shot';
    items.push({
      id, kind, sceneNumber: str(x.sceneNumber, 40), chapter: str(x.chapter, 120), code: str(x.code, 40), size: str(x.size, 200),
      face: x.face === true, who: str(x.who, 100),
      start: num(x.start, 0, 600, 0), use: num(x.use, 0.1, 120, 1), sugg: num(x.sugg, 0, 120, 1),
      out: x.out === 'dissolve' ? 'dissolve' : 'cut', skip: x.skip === true,
    });
  }

  const lyrics: Lyric[] = [];
  if (Array.isArray(r.lyrics)) {
    for (const y of (r.lyrics as Record<string, unknown>[]).slice(0, 500)) {
      const t = str(y?.t, 300).trim();
      if (!t) continue;
      const s = num(y.s, 0, 36000, 0);
      lyrics.push({ s, e: Math.max(num(y.e, 0, 36000, s + 2), s + 0.2), t });
    }
  }

  const chapterGrades: Record<string, string> = {};
  const chapterTitles: Record<string, string> = {};
  for (const [k, v] of Object.entries((r.chapterGrades as Record<string, unknown>) ?? {}).slice(0, 60)) {
    chapterGrades[k.slice(0, 120)] = isGradeKey(String(v), ctx.luts) ? String(v) : 'neutral';
  }
  for (const [k, v] of Object.entries((r.chapterTitles as Record<string, unknown>) ?? {}).slice(0, 60)) {
    chapterTitles[k.slice(0, 120)] = str(v, 120, k);
  }

  const m = (r.music ?? {}) as Record<string, unknown>;
  const musicFile = typeof m.file === 'string' && /^music\.(mp3|wav|m4a|aac|ogg|flac)$/.test(m.file) ? m.file : null;
  const loud = m.loudness === null ? null : num(m.loudness, -23, -9, -14);

  const canvas: Canvas = r.canvas === 'full' || r.canvas === 'wide' ? r.canvas : 'pic';
  const outputName = str(r.outputName, 80).replace(/\.mp4$/i, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '') || 'video-cuoi';

  return {
    version: 1, canvas,
    resolution: r.resolution === 720 ? 720 : 1080,
    fps: r.fps === 30 ? 30 : 24,
    grain: r.grain === true,
    titleFont: ctx.fonts.includes(String(r.titleFont)) ? String(r.titleFont) : ctx.fonts[0] ?? 'Lora',
    titleDur: num(r.titleDur, 0.8, 3, 1.3),
    plateScene: typeof r.plateScene === 'string' && r.plateScene ? r.plateScene.slice(0, 40) : null,
    chapterGrades, chapterTitles, outputName, items, lyrics,
    music: {
      file: musicFile, name: str(m.name, 200), duration: num(m.duration, 0, 7200, 0), offset: num(m.offset, 0, 7200, 0),
      fadeIn: num(m.fadeIn, 0, 10, 0.5), fadeOut: num(m.fadeOut, 0, 10, 1.2), loudness: loud,
    },
  };
}

// ─── lưu / đọc ────────────────────────────────────────────────

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Đọc dự án đã lưu. Tệp hỏng hoặc sai cấu trúc (không phải JSON, thiếu items...) thì trả null để dùng dự án mặc định,
 * thay vì làm mọi yêu cầu sau đó lỗi 500. Các trường phụ thiếu được điền mặc định; việc kiểm tra giá trị chi tiết do normalizeProject làm.
 */
export function loadProjectFile(editDir: string): EditProject | null {
  const p = join(editDir, 'project.json');
  if (!existsSync(p)) return null;
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
  if (!isObj(raw) || !Array.isArray(raw.items)) return null;
  return {
    ...raw,
    items: raw.items.filter(isObj),
    chapterGrades: isObj(raw.chapterGrades) ? raw.chapterGrades : {},
    chapterTitles: isObj(raw.chapterTitles) ? raw.chapterTitles : {},
    lyrics: Array.isArray(raw.lyrics) ? raw.lyrics : [],
    music: { ...defaultMusic(), ...(isObj(raw.music) ? raw.music : {}) },
  } as unknown as EditProject;
}

export function saveProjectFile(editDir: string, project: EditProject): void {
  const p = join(editDir, 'project.json');
  mkdirSync(dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  writeFileSync(tmp, JSON.stringify(project, null, 2)); // ghi tạm rồi đổi tên để không hỏng tệp nếu tắt giữa chừng
  renameSync(tmp, p);
}

export function listLuts(editDir: string): string[] {
  const d = join(editDir, 'luts');
  return existsSync(d) ? readdirSync(d).filter((f) => /^[A-Za-z0-9_-]{1,60}\.cube$/.test(f)).map((f) => f.replace(/\.cube$/, '')) : [];
}

export function listFonts(fontsDir: string): string[] {
  if (!existsSync(fontsDir)) return [];
  const fam = new Set<string>();
  for (const f of readdirSync(fontsDir)) if (/\.(ttf|otf)$/i.test(f)) fam.add(f.replace(/\.(ttf|otf)$/i, '').split('-')[0]);
  return [...fam];
}
