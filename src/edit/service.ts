import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import type { FlowManager } from '../flow-manager.js';
import { getFlowPaths } from '../config.js';
import { log } from '../logger.js';
import type { ClipInfo, EditProject } from './types.js';
import { buildDefaultProject, listFonts, listLuts, loadProjectFile, normalizeProject, reconcile, saveProjectFile } from './project.js';
import { discoverClips } from './clips.js';
import { analyze, finalFileName, planRender, runRender, type Analysis, type RenderHandle } from './render.js';
import { probeMedia, resolveFfmpeg } from './ffmpeg.js';
import { parseLyrics } from './lyrics.js';
import { GRADES } from './grades.js';

export const FONTS_DIR = resolve('assets/fonts');
export const MAX_MUSIC_BYTES = 100 * 1024 * 1024;
export const MAX_LUT_BYTES = 30 * 1024 * 1024;
const MUSIC_EXT = new Set(['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac']);

export class EditError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export interface RenderStatus {
  state: 'running' | 'done' | 'error' | 'cancelled';
  preview: boolean;
  percent: number;
  file?: string;
  error?: string;
  warnings: string[];
  startedAt: string;
  seconds?: number;
}
interface Job { status: RenderStatus; handle?: RenderHandle }

export interface FinalFile { file: string; size: number; modified: string; preview: boolean }

export interface EditState {
  project: EditProject;
  clips: Record<string, { file: string; duration: number }>;
  analysis: Analysis;
  grades: { key: string; name: string }[];
  luts: string[];
  fonts: string[];
  ffmpeg: { ok: true; source: string; version: string } | { ok: false; error: string };
  render: RenderStatus | null;
  finals: FinalFile[];
}

export class EditService {
  private jobs = new Map<string, Job>();
  constructor(private fm: FlowManager) {}

  private ctx(flowId: string) {
    if (!this.fm.getFlowMeta(flowId)) throw new EditError('Flow không tồn tại', 404);
    const paths = getFlowPaths(flowId);
    return { paths, luts: listLuts(paths.editDir), fonts: listFonts(FONTS_DIR) };
  }

  /** Dự án hiện tại: bản lưu (nếu có) ghép với Excel mới nhất, đã kiểm tra hợp lệ. */
  private async current(flowId: string): Promise<{ project: EditProject; clips: Map<string, ClipInfo> }> {
    const { paths, luts, fonts } = this.ctx(flowId);
    const scenes = await this.fm.getScenes(flowId);
    if (!scenes.length) throw new EditError('Flow chưa có dữ liệu Excel. Import Excel ở bước Generate trước.');
    const fresh = buildDefaultProject(scenes, this.fm.getFlowMeta(flowId)!.name);
    const saved = loadProjectFile(paths.editDir);
    let project = saved ? reconcile(saved, fresh) : fresh;
    project = normalizeProject(project, { luts, fonts });
    if (project.music.file && !existsSync(join(paths.editDir, project.music.file))) project.music = { ...project.music, file: null, name: '', duration: 0 };
    return { project, clips: await discoverClips(paths.outputDir) };
  }

  async getState(flowId: string): Promise<EditState> {
    const { paths, luts, fonts } = this.ctx(flowId);
    const { project, clips } = await this.current(flowId);
    let ffmpeg: EditState['ffmpeg'];
    try { const f = resolveFfmpeg(); ffmpeg = { ok: true, source: f.source, version: f.version.split(' ')[0] }; }
    catch (e) { ffmpeg = { ok: false, error: (e as Error).message }; }
    return {
      project,
      clips: Object.fromEntries([...clips].map(([k, c]) => [k, { file: c.file, duration: c.duration }])),
      analysis: analyze(project, clips, project.music.duration),
      grades: Object.entries(GRADES).map(([key, g]) => ({ key, name: g.name })),
      luts, fonts, ffmpeg,
      render: this.jobs.get(flowId)?.status ?? null,
      finals: this.listFinals(paths.finalDir),
    };
  }

  async save(flowId: string, raw: unknown): Promise<{ analysis: Analysis }> {
    const { paths, luts, fonts } = this.ctx(flowId);
    let project: EditProject;
    try { project = normalizeProject(raw, { luts, fonts }); } catch (e) { throw new EditError((e as Error).message); }
    if (project.music.file && !existsSync(join(paths.editDir, project.music.file))) project.music.file = null;
    saveProjectFile(paths.editDir, project);
    return { analysis: analyze(project, await discoverClips(paths.outputDir), project.music.duration) };
  }

  async uploadMusic(flowId: string, buf: Buffer, originalName: string): Promise<EditProject['music']> {
    const { paths } = this.ctx(flowId);
    const ext = (originalName.split('.').pop() || '').toLowerCase();
    if (!MUSIC_EXT.has(ext)) throw new EditError('Định dạng nhạc không hỗ trợ. Dùng mp3, wav, m4a, aac, ogg hoặc flac.');
    if (!buf.length) throw new EditError('Tệp rỗng');
    mkdirSync(paths.editDir, { recursive: true });
    const tmp = join(paths.editDir, `upload-${Date.now()}.${ext}`);
    writeFileSync(tmp, buf);
    const info = await probeMedia(tmp);
    if (!info.hasAudio || info.duration <= 0) { rmSync(tmp, { force: true }); throw new EditError('Không đọc được âm thanh trong tệp này.'); }
    for (const f of readdirSync(paths.editDir)) if (/^music\./.test(f)) rmSync(join(paths.editDir, f), { force: true });
    renameSync(tmp, join(paths.editDir, `music.${ext}`));
    const { project } = await this.current(flowId);
    project.music = { ...project.music, file: `music.${ext}`, name: originalName.slice(0, 200), duration: Math.round(info.duration * 10) / 10, offset: 0 };
    saveProjectFile(paths.editDir, project);
    return project.music;
  }

  musicPath(flowId: string): { path: string; ext: string } | null {
    const { paths } = this.ctx(flowId);
    if (!existsSync(paths.editDir)) return null;
    const f = readdirSync(paths.editDir).find((x) => /^music\.(mp3|wav|m4a|aac|ogg|flac)$/.test(x));
    return f ? { path: join(paths.editDir, f), ext: f.split('.').pop()! } : null;
  }

  uploadLut(flowId: string, buf: Buffer, rawName: string): string {
    const { paths } = this.ctx(flowId);
    const name = rawName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').replace(/\.cube$/i, '').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 60).replace(/^_+|_+$/g, '');
    if (!name) throw new EditError('Tên LUT không hợp lệ');
    const text = buf.toString('utf8');
    if (!/^\s*(?:#.*\n|TITLE.*\n|DOMAIN_.*\n|\s*\n)*\s*LUT_3D_SIZE\s+\d+/m.test(text.slice(0, 4096)) && !/LUT_3D_SIZE\s+\d+/.test(text.slice(0, 8192))) {
      throw new EditError('Không phải tệp LUT 3D .cube hợp lệ (thiếu LUT_3D_SIZE).');
    }
    mkdirSync(join(paths.editDir, 'luts'), { recursive: true });
    writeFileSync(join(paths.editDir, 'luts', `${name}.cube`), buf);
    return name;
  }

  parseLyricsText(text: string) {
    const lines = parseLyrics(text);
    if (!lines.length) throw new EditError('Không đọc được dòng lời nào. Dùng tệp .lrc ([mm:ss.xx] lời) hoặc .srt.');
    return lines;
  }

  // ─── dựng ──────────────────────────────────────────────

  private listFinals(dir: string): FinalFile[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir).filter((f) => /^[A-Za-z0-9._-]+\.mp4$/.test(f) && !f.endsWith('.part.mp4')).map((f) => {
      const st = statSync(join(dir, f));
      return { file: f, size: st.size, modified: st.mtime.toISOString(), preview: f === '_preview.mp4' };
    }).sort((a, b) => b.modified.localeCompare(a.modified));
  }

  finalPath(flowId: string, file: string): string | null {
    const { paths } = this.ctx(flowId);
    if (!/^[A-Za-z0-9._-]+\.mp4$/.test(file) || file.endsWith('.part.mp4')) return null;
    const p = join(paths.finalDir, file);
    return existsSync(p) ? p : null;
  }

  getRender(flowId: string): RenderStatus | null { return this.jobs.get(flowId)?.status ?? null; }

  async startRender(flowId: string, preview: boolean): Promise<RenderStatus> {
    const { paths } = this.ctx(flowId);
    if (this.jobs.get(flowId)?.status.state === 'running') throw new EditError('Đang có một bản dựng chạy cho flow này.', 409);
    const { project, clips } = await this.current(flowId);
    const music = project.music.file ? join(paths.editDir, project.music.file) : null;
    const name = finalFileName(project, preview);
    const finalPath = join(paths.finalDir, name);
    const part = join(paths.finalDir, name.replace(/\.mp4$/, '.part.mp4'));
    mkdirSync(paths.finalDir, { recursive: true });

    let plan;
    try {
      plan = planRender({ project, clips, musicPath: music, editDir: paths.editDir, fontsDir: FONTS_DIR, outPath: part, preview }, project.music.duration);
    } catch (e) { throw new EditError((e as Error).message); }

    const status: RenderStatus = { state: 'running', preview, percent: 0, warnings: plan.analysis.warnings, startedAt: new Date().toISOString() };
    const job: Job = { status };
    this.jobs.set(flowId, job);
    const t0 = Date.now();
    let lastEmit = 0;
    const emit = () => this.fm.broadcast(flowId, 'render', status);
    const handle = runRender(plan, part, (p) => {
      status.percent = Math.round(p * 1000) / 10;
      if (Date.now() - lastEmit > 250 || p >= 1) { lastEmit = Date.now(); emit(); }
    });
    job.handle = handle;
    log.info(`Dựng ${preview ? 'bản xem thử' : 'video'} cho flow ${flowId}: ${plan.total.toFixed(1)} s, ${plan.width}x${plan.height}`);
    handle.promise.then(() => {
      rmSync(finalPath, { force: true });
      renameSync(part, finalPath);
      Object.assign(status, { state: 'done', percent: 100, file: name, seconds: Math.round((Date.now() - t0) / 100) / 10 });
      log.success(`Dựng xong ${name} trong ${status.seconds}s`);
    }).catch((e: Error) => {
      rmSync(part, { force: true });
      if (/hủy/i.test(e.message)) Object.assign(status, { state: 'cancelled', error: undefined });
      else { Object.assign(status, { state: 'error', error: e.message }); log.error(`Dựng lỗi: ${e.message.split('\n')[0]}`); }
    }).finally(emit);
    return status;
  }

  cancelRender(flowId: string): boolean {
    const j = this.jobs.get(flowId);
    if (j?.status.state === 'running') { j.handle?.cancel(); return true; }
    return false;
  }
}
