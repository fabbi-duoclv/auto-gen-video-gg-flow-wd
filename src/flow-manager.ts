import { randomUUID } from 'crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, rmSync, copyFileSync } from 'fs';
import { join, resolve, dirname, isAbsolute } from 'path';
import type { ServerResponse } from 'http';
import type { Page } from 'playwright';
import { CONFIG, getFlowPaths, type FlowPaths } from './config.js';
import { AutomationEngine, type RunConfig, type SceneStatus, type EngineState } from './engine.js';
import { readScenes, readCharacters, type SceneData, type CharacterData } from './excel-reader.js';
import { createFlowPage } from './browser.js';
import { getTemplate, templateAvailable, templatePath } from './templates.js';
import { isMerging, mergeClips, type MergeResult } from './merge.js';
import { copyPhotos, findPhoto, removePhoto, savePhoto, type SavedPhoto } from './flow-photos.js';
import { addLogListener, removeLogListener, type LogListener, log } from './logger.js';

// ─── Types ───────────────────────────────────────────────────

export interface FlowMeta {
  id: string;
  name: string;
  status: 'created' | 'running' | 'stopped' | 'completed' | 'error';
  createdAt: string;
  updatedAt: string;
  hasExcel: boolean;
  sceneCount: number;
}

interface FlowSession {
  meta: FlowMeta;
  engine: AutomationEngine | null;
  page: Page | null;
  sseClients: Set<ServerResponse>;
  logListener: LogListener | null;
  promptOverrides: Map<string, { imagePrompt?: string; videoPrompt?: string }>;
  /** Đang mở tab/khởi tạo engine (khoảng chờ trước khi engine chuyển sang 'running'). */
  starting?: boolean;
}

// ─── FlowManager ─────────────────────────────────────────────

export class FlowManager {
  private flows = new Map<string, FlowSession>();

  constructor() {
    // Ensure flows dir exists
    if (!existsSync(CONFIG.FLOWS_DIR)) {
      mkdirSync(CONFIG.FLOWS_DIR, { recursive: true });
    }

    // Load existing flows from disk
    this.loadFromDisk();
  }

  // ─── CRUD ────────────────────────────────────────────────

  createFlow(name: string): FlowMeta {
    const id = randomUUID();
    const paths = getFlowPaths(id);

    // Create directories
    mkdirSync(paths.flowDir, { recursive: true });
    mkdirSync(paths.outputDir, { recursive: true });

    const meta: FlowMeta = {
      id,
      name: name || `Flow ${this.flows.size + 1}`,
      status: 'created',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      hasExcel: false,
      sceneCount: 0,
    };

    this.saveMeta(id, meta);

    const session: FlowSession = {
      meta,
      engine: null,
      page: null,
      sseClients: new Set(),
      logListener: null,
      promptOverrides: new Map(),
    };

    this.flows.set(id, session);
    log.success(`Flow created: ${meta.name} (${id})`);
    return meta;
  }

  /** Tạo flow mới từ mẫu video dựng sẵn: copy Excel mẫu, không cần người dùng đụng tới Excel. */
  async createFlowFromTemplate(templateId: string, name?: string): Promise<FlowMeta> {
    const tpl = getTemplate(templateId);
    if (!tpl) throw new Error(`Mẫu video không tồn tại: ${templateId}`);
    if (!templateAvailable(tpl)) throw new Error(`Thiếu file mẫu: ${templatePath(tpl)}`);

    const meta = this.createFlow(name || tpl.name);
    try {
      await this.uploadExcel(meta.id, readFileSync(templatePath(tpl)));
    } catch (e) {
      // Không để lại flow rỗng trong danh sách khi đọc mẫu lỗi
      await this.deleteFlow(meta.id).catch(() => {});
      throw e;
    }
    return this.flows.get(meta.id)!.meta;
  }

  listFlows(): FlowMeta[] {
    return Array.from(this.flows.values())
      .map(s => s.meta)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getFlow(id: string): FlowSession | undefined {
    return this.flows.get(id);
  }

  getFlowMeta(id: string): FlowMeta | undefined {
    return this.flows.get(id)?.meta;
  }

  async deleteFlow(id: string): Promise<void> {
    const session = this.flows.get(id);
    if (!session) throw new Error(`Flow ${id} not found`);

    // Stop engine if running
    if (session.engine && session.engine.getState() === 'running') {
      session.engine.abort();
    }

    // Close page if open
    if (session.page) {
      await session.page.close().catch(() => {});
      session.page = null;
    }

    // Remove log listener
    if (session.logListener) {
      removeLogListener(session.logListener);
      session.logListener = null;
    }

    // Close SSE connections
    for (const client of session.sseClients) {
      client.end();
    }
    session.sseClients.clear();

    // Delete folder
    const paths = getFlowPaths(id);
    if (existsSync(paths.flowDir)) {
      rmSync(paths.flowDir, { recursive: true, force: true });
    }

    this.flows.delete(id);
    log.info(`Flow deleted: ${id}`);
  }

  cloneFlow(sourceId: string, newName?: string): FlowMeta {
    const source = this.flows.get(sourceId);
    if (!source) throw new Error(`Flow ${sourceId} not found`);

    const id = randomUUID();
    const sourcePaths = getFlowPaths(sourceId);
    const paths = getFlowPaths(id);

    // Create directories
    mkdirSync(paths.flowDir, { recursive: true });
    mkdirSync(paths.outputDir, { recursive: true });

    copyPhotos(sourcePaths.photosDir, paths.photosDir);

    // Copy Excel if exists
    let hasExcel = false;
    let sceneCount = 0;
    if (existsSync(sourcePaths.excelPath)) {
      copyFileSync(sourcePaths.excelPath, paths.excelPath);
      hasExcel = true;
      sceneCount = source.meta.sceneCount;
    }

    const meta: FlowMeta = {
      id,
      name: newName || `${source.meta.name} (copy)`,
      status: 'created',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      hasExcel,
      sceneCount,
    };

    this.saveMeta(id, meta);

    // Clone prompt overrides
    const promptOverrides = new Map(source.promptOverrides);

    this.flows.set(id, {
      meta,
      engine: null,
      page: null,
      sseClients: new Set(),
      logListener: null,
      promptOverrides,
    });

    log.success(`Flow cloned: ${meta.name} (${id}) from ${sourceId}`);
    return meta;
  }

  // ─── Excel ───────────────────────────────────────────────

  async uploadExcel(id: string, buffer: Buffer): Promise<void> {
    const session = this.flows.get(id);
    if (!session) throw new Error(`Flow ${id} not found`);

    const paths = getFlowPaths(id);
    writeFileSync(paths.excelPath, buffer);

    // Count scenes to update meta
    const scenes = await readScenes(paths.excelPath, ['AI-VID', 'AI-IMG', 'STOCK']);
    session.meta.hasExcel = true;
    session.meta.sceneCount = scenes.length;
    session.meta.updatedAt = new Date().toISOString();
    this.saveMeta(id, session.meta);
  }

  async getScenes(id: string): Promise<SceneData[]> {
    const session = this.flows.get(id);
    if (!session) throw new Error(`Flow ${id} not found`);

    const paths = getFlowPaths(id);
    if (!existsSync(paths.excelPath)) return [];

    const scenes = await readScenes(paths.excelPath, ['AI-VID', 'AI-IMG', 'STOCK']);

    // Apply prompt overrides
    return scenes.map(s => ({
      ...s,
      imagePrompt: session.promptOverrides.get(s.sceneNumber)?.imagePrompt ?? s.imagePrompt,
      videoPrompt: session.promptOverrides.get(s.sceneNumber)?.videoPrompt ?? s.videoPrompt,
    }));
  }

  /** Nhân vật trong Excel + trạng thái ảnh tham chiếu (upload qua UI > đường dẫn ở cột 9 > chưa có). */
  async getCharacters(id: string): Promise<(CharacterData & { photoSource: 'upload' | 'excel' | 'missing' | null; photoUrl: string | null; excelPhotoPath: string })[]> {
    const paths = getFlowPaths(id);
    if (!existsSync(paths.excelPath)) return [];
    const chars = await readCharacters(paths.excelPath);
    return chars.map((c) => {
      const up = findPhoto(paths.photosDir, c.id);
      return {
        ...c,
        excelPhotoPath: c.photoPath,
        photoPath: up ? up.path : c.photoPath,
        photoSource: up ? 'upload' : c.photoPath ? (this.excelPhotoExists(c.photoPath, paths.excelPath) ? 'excel' : 'missing') : null,
        photoUrl: up ? `/api/flows/${id}/photos/${encodeURIComponent(c.id)}?v=${Math.round(up.mtimeMs)}` : null,
      };
    });
  }

  /** Cùng quy tắc tìm tệp với resolvePhotos(): tương đối theo thư mục chạy hoặc theo thư mục Excel. */
  private excelPhotoExists(p: string, excelPath: string): boolean {
    const tried = isAbsolute(p) ? [p] : [resolve(p), resolve(dirname(excelPath), p)];
    return tried.some((t) => existsSync(t));
  }

  private async requireCharacter(id: string, charId: string): Promise<void> {
    const session = this.flows.get(id);
    if (!session) throw new Error(`Flow ${id} not found`);
    if (session.engine?.getState() === 'running') throw new Error('Flow đang chạy, dừng lại rồi mới đổi ảnh.');
    const chars = await this.getCharacters(id);
    if (!chars.some((c) => c.id === charId)) throw new Error(`Không có nhân vật id "${charId}" trong Excel của flow này`);
  }

  async uploadPhoto(id: string, charId: string, buf: Buffer): Promise<SavedPhoto> {
    await this.requireCharacter(id, charId);
    const saved = await savePhoto(getFlowPaths(id).photosDir, charId, buf);
    this.touch(id);
    log.success(`Ảnh nhân vật ${charId} đã upload cho flow ${id} (${saved.width}x${saved.height})`);
    return saved;
  }

  async deletePhoto(id: string, charId: string): Promise<boolean> {
    await this.requireCharacter(id, charId);
    const removed = removePhoto(getFlowPaths(id).photosDir, charId);
    if (removed) this.touch(id);
    return removed;
  }

  getPhotoFile(id: string, charId: string) {
    if (!this.flows.has(id)) return undefined;
    return findPhoto(getFlowPaths(id).photosDir, charId);
  }

  private touch(id: string): void {
    const s = this.flows.get(id);
    if (!s) return;
    s.meta.updatedAt = new Date().toISOString();
    this.saveMeta(id, s.meta);
  }

  updateScenePrompt(id: string, sceneId: string, update: { imagePrompt?: string; videoPrompt?: string }): void {
    const session = this.flows.get(id);
    if (!session) throw new Error(`Flow ${id} not found`);

    const existing = session.promptOverrides.get(sceneId) || {};
    if (update.imagePrompt !== undefined) existing.imagePrompt = update.imagePrompt;
    if (update.videoPrompt !== undefined) existing.videoPrompt = update.videoPrompt;
    session.promptOverrides.set(sceneId, existing);
  }

  // ─── Engine Control ──────────────────────────────────────

  getRunningCount(): number {
    let count = 0;
    for (const session of this.flows.values()) {
      if (session.engine?.getState() === 'running') count++;
    }
    return count;
  }

  async startFlow(id: string, config: RunConfig = {}): Promise<void> {
    const session = this.flows.get(id);
    if (!session) throw new Error(`Flow ${id} not found`);

    // Các kiểm tra dưới đây chạy đồng bộ (trước await đầu tiên) để không lọt giữa hai request.
    if (session.starting || (session.engine && session.engine.getState() !== 'idle')) {
      throw new Error('Flow đang chạy hoặc đang dừng, đợi xong rồi mới chạy lại.');
    }

    if (this.getRunningCount() >= CONFIG.MAX_CONCURRENT_FLOWS) {
      throw new Error(`Max concurrent flows (${CONFIG.MAX_CONCURRENT_FLOWS}) reached`);
    }

    const paths = getFlowPaths(id);
    if (!existsSync(paths.excelPath)) {
      throw new Error('No Excel file uploaded for this flow');
    }
    if (isMerging(paths.outputDir)) {
      throw new Error('Đang ghép video, đợi ghép xong rồi mới chạy tiếp.');
    }

    session.starting = true;
    try {
      await this.launchEngine(id, session, paths, config);
    } finally {
      session.starting = false;
    }
  }

  /** Ghép clip thành final.mp4. Từ chối khi flow đang chạy/khởi động; khóa ghép được giữ trước await đầu tiên. */
  mergeFlow(id: string): Promise<MergeResult> {
    const session = this.flows.get(id);
    if (!session) throw new Error(`Flow ${id} not found`);
    if (session.starting || (session.engine && session.engine.getState() !== 'idle')) {
      throw new Error('Flow đang chạy, dừng hoặc đợi chạy xong rồi mới ghép video.');
    }
    return mergeClips(getFlowPaths(id).outputDir, () => this.getScenes(id));
  }

  private async launchEngine(
    id: string,
    session: FlowSession,
    paths: FlowPaths,
    config: RunConfig,
  ): Promise<void> {
    // Tab của lần chạy trước (nếu còn) không dùng lại: đóng để không dồn tab/RAM.
    if (session.page) {
      const old = session.page;
      session.page = null;
      await old.close().catch(() => {});
    }

    // Create a new browser tab for this flow
    const page = await createFlowPage();
    session.page = page;

    // Create engine with flow-specific config
    const engine = new AutomationEngine({
      flowId: id,
      excelPath: paths.excelPath,
      outputDir: paths.outputDir,
      photosDir: paths.photosDir,
      progressFile: paths.progressFile,
      page,
      createPage: () => createFlowPage(),
    });

    session.engine = engine;

    // Wire engine events → SSE broadcast
    engine.on('state-change', (state: EngineState) => {
      if (state === 'running') session.meta.status = 'running';
      else if (state === 'idle') {
        session.meta.status = session.meta.status === 'running' ? 'completed' : session.meta.status;
      }
      session.meta.updatedAt = new Date().toISOString();
      this.saveMeta(id, session.meta);
      this.broadcast(id, 'state', { state });
    });

    engine.on('progress', (statuses: SceneStatus[]) => {
      this.broadcast(id, 'progress', statuses);
    });

    engine.on('run-complete', (result: any) => {
      session.meta.status = 'completed';
      session.meta.updatedAt = new Date().toISOString();
      this.saveMeta(id, session.meta);
      this.broadcast(id, 'run-complete', result);
    });

    engine.on('engine-error', (msg: string) => {
      session.meta.status = 'error';
      session.meta.updatedAt = new Date().toISOString();
      this.saveMeta(id, session.meta);
      this.broadcast(id, 'engine-error', msg);
    });

    // Wire flow-scoped logs → SSE
    const logListener: LogListener = (entry) => {
      if (entry.flowId === id) {
        this.broadcast(id, 'log', entry);
      }
    };
    addLogListener(logListener);
    session.logListener = logListener;

    // Update status and start (non-blocking)
    session.meta.status = 'running';
    session.meta.updatedAt = new Date().toISOString();
    this.saveMeta(id, session.meta);

    engine.start(config).catch(() => {}).finally(() => {
      // Cleanup log listener when done
      if (session.logListener) {
        removeLogListener(session.logListener);
        session.logListener = null;
      }
      // Chạy xong thì đóng tab Flow của lần này (tab phụ của worker engine đã tự đóng).
      if (session.page === page) {
        session.page = null;
        page.close().catch(() => {});
      }
    });
  }

  stopFlow(id: string): void {
    const session = this.flows.get(id);
    if (!session) throw new Error(`Flow ${id} not found`);

    if (session.engine) {
      session.engine.abort();
      session.meta.status = 'stopped';
      session.meta.updatedAt = new Date().toISOString();
      this.saveMeta(id, session.meta);
    }
  }

  getFlowStatus(id: string): { state: EngineState; scenes: SceneStatus[] } {
    const session = this.flows.get(id);
    if (!session) throw new Error(`Flow ${id} not found`);

    return {
      state: session.engine?.getState() || 'idle',
      scenes: session.engine?.getSceneStatuses() || [],
    };
  }

  // ─── SSE ─────────────────────────────────────────────────

  addSSEClient(id: string, res: ServerResponse): void {
    const session = this.flows.get(id);
    if (!session) return;

    session.sseClients.add(res);
    res.on('close', () => session.sseClients.delete(res));

    // Send current state immediately
    const state = session.engine?.getState() || 'idle';
    const statuses = session.engine?.getSceneStatuses() || [];
    res.write(`event: state\ndata: ${JSON.stringify({ state })}\n\n`);
    if (statuses.length > 0) {
      res.write(`event: progress\ndata: ${JSON.stringify(statuses)}\n\n`);
    }
  }

  broadcast(id: string, event: string, data: unknown): void {
    const session = this.flows.get(id);
    if (!session) return;

    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of session.sseClients) {
      client.write(payload);
    }
  }

  // ─── Persistence ─────────────────────────────────────────

  private saveMeta(id: string, meta: FlowMeta): void {
    const paths = getFlowPaths(id);
    if (existsSync(paths.flowDir)) {
      writeFileSync(paths.metaFile, JSON.stringify(meta, null, 2));
    }
  }

  private loadFromDisk(): void {
    if (!existsSync(CONFIG.FLOWS_DIR)) return;

    const entries = readdirSync(CONFIG.FLOWS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const id = entry.name;
      const paths = getFlowPaths(id);

      if (!existsSync(paths.metaFile)) continue;

      try {
        const meta = JSON.parse(readFileSync(paths.metaFile, 'utf-8')) as FlowMeta;

        // Reset running status on restart
        if (meta.status === 'running') {
          meta.status = 'stopped';
          this.saveMeta(id, meta);
        }

        this.flows.set(id, {
          meta,
          engine: null,
          page: null,
          sseClients: new Set(),
          logListener: null,
          promptOverrides: new Map(),
        });
      } catch {
        log.warn(`Failed to load flow ${id}, skipping`);
      }
    }

    log.info(`Loaded ${this.flows.size} flow(s) from disk`);
  }
}
