import { EventEmitter } from 'events';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { CONFIG } from './config.js';
import { readScenes, readCharacters, type SceneData } from './excel-reader.js';
import { launchBrowser } from './browser.js';
import { FlowPage } from './flow-page.js';
import { generateImage } from './image-generator.js';
import { generateVideo } from './video-generator.js';
import {
  loadProgress,
  isSceneComplete,
  isImageDone,
  isVideoDone,
  updateSceneProgress,
} from './progress-tracker.js';
import { prepareRefs, getRefIndicesForScene } from './ref-generator.js';
import { withUploadedPhotos } from './flow-photos.js';
import { log as globalLog, createFlowLogger, type FlowLogger } from './logger.js';
import type { Page } from 'playwright';

export interface RunConfig {
  scenes?: string[];       // specific scene numbers to run
  startFrom?: number;
  endAt?: number;
  imageOnly?: boolean;
  videoOnly?: boolean;
  resume?: boolean;
  headless?: boolean;
  model?: 'image' | 'video';
  ratio?: '16:9' | '9:16' | '1:1';
  genCount?: number;
}

export interface SceneStatus {
  sceneNumber: string;
  sceneName: string;
  step: 'waiting' | 'image-gen' | 'image-download' | 'video-gen' | 'video-download' | 'complete' | 'failed';
  error?: string;
  imagePath?: string;
  videoPath?: string;
}

export type EngineState = 'idle' | 'running' | 'stopping';

export interface FlowConfig {
  flowId: string;
  excelPath: string;
  outputDir: string;
  /** Thư mục ảnh cô dâu/chú rể upload qua web UI (ưu tiên hơn cột 9 của Excel). */
  photosDir?: string;
  progressFile: string;
  page: Page;
  createPage?: () => Promise<Page>;
}

export class AutomationEngine extends EventEmitter {
  private state: EngineState = 'idle';
  private abortController?: AbortController;
  private allScenes: SceneData[] = [];
  private sceneStatuses: Map<string, SceneStatus> = new Map();
  private flowConfig?: FlowConfig;
  private log: FlowLogger;

  constructor(flowConfig?: FlowConfig) {
    super();
    this.flowConfig = flowConfig;
    this.log = flowConfig ? createFlowLogger(flowConfig.flowId) : globalLog;
  }

  getState(): EngineState {
    return this.state;
  }

  getSceneStatuses(): SceneStatus[] {
    return Array.from(this.sceneStatuses.values());
  }

  async loadScenes(excelPath?: string): Promise<SceneData[]> {
    const path = excelPath || this.flowConfig?.excelPath;
    this.allScenes = await readScenes(path, ['AI-VID', 'AI-IMG', 'STOCK']);
    return this.allScenes;
  }

  async start(config: RunConfig = {}): Promise<void> {
    if (this.state === 'running') {
      throw new Error('Engine is already running');
    }

    this.state = 'running';
    this.abortController = new AbortController();
    this.sceneStatuses.clear();
    this.emit('state-change', this.state);

    try {
      await this.run(config);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.error(`Engine error: ${msg}`);
      this.emit('engine-error', msg);
    } finally {
      this.state = 'idle';
      this.emit('state-change', this.state);
    }
  }

  abort(): void {
    if (this.state !== 'running') return;
    this.state = 'stopping';
    this.abortController?.abort();
    this.log.warn('Stopping after current step...');
    this.emit('state-change', this.state);
  }

  private isAborted(): boolean {
    return !!this.abortController?.signal.aborted;
  }

  private get outputDir(): string {
    return this.flowConfig?.outputDir || CONFIG.OUTPUT_DIR;
  }

  private get excelPath(): string | undefined {
    return this.flowConfig?.excelPath;
  }

  private get progressFile(): string | undefined {
    return this.flowConfig?.progressFile;
  }

  private async run(config: RunConfig): Promise<void> {
    if (!existsSync(this.outputDir)) {
      mkdirSync(this.outputDir, { recursive: true });
    }

    // Always reload from file to pick up latest upload
    await this.loadScenes();

    // Filter scenes
    let scenes = [...this.allScenes];
    if (config.scenes && config.scenes.length > 0) {
      const targets = new Set(config.scenes.map(s => s.padStart(2, '0')));
      scenes = scenes.filter(s => targets.has(s.sceneNumber));
    }
    if (config.startFrom) {
      scenes = scenes.filter(s => parseInt(s.sceneNumber) >= config.startFrom!);
    }
    if (config.endAt) {
      scenes = scenes.filter(s => parseInt(s.sceneNumber) <= config.endAt!);
    }

    if (scenes.length === 0) {
      this.log.warn('No scenes to process');
      return;
    }

    // Init scene statuses
    for (const s of scenes) {
      this.sceneStatuses.set(s.sceneNumber, {
        sceneNumber: s.sceneNumber,
        sceneName: s.sceneName,
        step: 'waiting',
      });
    }
    this.emit('progress', this.getSceneStatuses());

    const progress = loadProgress(this.progressFile);

    // Get or create page
    let page: Page;
    let shouldClosePage = false;

    if (this.flowConfig?.page) {
      // Multi-flow mode: page provided by FlowManager
      page = this.flowConfig.page;
    } else {
      // Legacy CLI mode: launch own browser
      const context = await launchBrowser({ headless: config.headless ?? false });
      page = context.pages()[0] || await context.newPage();
      shouldClosePage = true;
    }

    const flowPage = new FlowPage(page);

    // Navigate and create project
    await flowPage.navigateToFlow();
    await flowPage.waitForAppReady();

    if (!(await flowPage.isLoggedIn())) {
      await flowPage.waitForManualLogin();
      await flowPage.navigateToFlow();
      await flowPage.waitForAppReady();
    }

    await flowPage.createNewProject();
    const ratio = config.ratio || '16:9';
    const count = config.genCount || 1;
    await flowPage.configureModel('image', ratio, count);
    const projectUrl = flowPage.getCurrentProjectUrl();
    this.log.info(`Project: ${projectUrl}`);

    // Step 0: Generate reference images for all characters
    const characters = withUploadedPhotos(await readCharacters(this.excelPath), this.flowConfig?.photosDir);
    if (this.isAborted()) { this.log.warn('Run aborted'); return; }
    const { refMap, totalRefs } = await prepareRefs(flowPage, characters, this.excelPath ?? CONFIG.EXCEL_PATH);

    // Separate scenes into skippable and processable
    let completed = 0;
    let failed = 0;
    const processableScenes: SceneData[] = [];

    for (const scene of scenes) {
      if (scene.type === 'STOCK') {
        this.log.scene(scene.sceneNumber, 'Type STOCK, skipping');
        completed++;
        continue;
      }
      if (config.resume && isSceneComplete(progress, scene.sceneNumber)) {
        this.log.scene(scene.sceneNumber, 'Already complete, skipping');
        this.updateStatus(scene.sceneNumber, 'complete');
        completed++;
        continue;
      }
      processableScenes.push(scene);
    }

    this.log.info(`Processing ${processableScenes.length} scene(s) (${completed} skipped)...`);

    // Determine worker count for parallel processing
    const pageFactory = this.flowConfig?.createPage ?? (shouldClosePage ? () => page.context().newPage() : undefined);
    const maxWorkers = CONFIG.MAX_CONCURRENT_SCENES || 1;
    const workerCount = Math.min(maxWorkers, processableScenes.length);

    // Build worker pool
    interface SceneWorker {
      flowPage: FlowPage;
      projectUrl: string;
      refMap: Map<string, number>;
      totalRefs: number;
      extraPage: Page | null; // non-null for additional tabs we created
    }

    const workers: SceneWorker[] = [{
      flowPage,
      projectUrl,
      refMap,
      totalRefs,
      extraPage: null,
    }];

    // Create additional workers (tabs) in parallel
    if (workerCount > 1 && pageFactory) {
      this.log.info(`Creating ${workerCount - 1} additional worker tab(s) for parallel processing...`);

      const createdPages: Page[] = [];
      try {
        const extraWorkers = await Promise.all(
          Array.from({ length: workerCount - 1 }, async (_, i) => {
            const p = await pageFactory();
            createdPages.push(p);
            const fp = new FlowPage(p);
            await fp.navigateToFlow();
            await fp.waitForAppReady();

            if (!(await fp.isLoggedIn())) {
              this.log.warn(`Worker ${i + 2}: waiting for login...`);
              await fp.waitForManualLogin();
              await fp.navigateToFlow();
              await fp.waitForAppReady();
            }

            await fp.createNewProject();
            const wRatio = config.ratio || '16:9';
            const wGenCount = config.genCount || 1;
            await fp.configureModel('image', wRatio, wGenCount);
            const workerProjectUrl = fp.getCurrentProjectUrl();
            this.log.info(`Worker ${i + 2} project: ${workerProjectUrl}`);

            // Generate refs for this worker's project
            const wr = await prepareRefs(fp, characters, this.excelPath ?? CONFIG.EXCEL_PATH);
            const workerRefMap = wr.refMap;
            const workerTotalRefs = wr.totalRefs;

            return {
              flowPage: fp,
              projectUrl: workerProjectUrl,
              refMap: workerRefMap,
              totalRefs: workerTotalRefs,
              extraPage: p,
            } satisfies SceneWorker;
          }),
        );

        workers.push(...extraWorkers);
        this.log.success(`All ${workers.length} workers ready`);
      } catch (err) {
        // Cleanup any tabs that were created before the failure
        for (const p of createdPages) {
          await p.close().catch(() => {});
        }
        const msg = err instanceof Error ? err.message : String(err);
        this.log.warn(`Failed to create worker tabs: ${msg}. Falling back to single worker.`);
      }
    }

    // Scene queue — workers pull from shared index
    let nextSceneIdx = 0;
    const takeNextScene = (): SceneData | undefined => {
      if (nextSceneIdx >= processableScenes.length) return undefined;
      return processableScenes[nextSceneIdx++];
    };

    // Worker loop
    const runWorker = async (worker: SceneWorker, workerIdx: number) => {
      while (true) {
        if (this.isAborted()) break;

        const scene = takeNextScene();
        if (!scene) break;

        this.log.info('═'.repeat(60));
        this.log.scene(scene.sceneNumber, `[W${workerIdx + 1}] [${scene.type}] ${scene.sceneName}`);
        this.log.info('═'.repeat(60));

        const refIndices = getRefIndicesForScene(scene.characterNames, worker.refMap);
        if (refIndices.length > 0) {
          this.log.scene(scene.sceneNumber, `Using ${refIndices.length} character ref(s): ${scene.characterNames.join(', ')}`);
        }

        try {
          // Image (for both AI-IMG and AI-VID)
          if (!config.videoOnly && !(config.resume && isImageDone(progress, scene.sceneNumber))) {
            if (scene.imagePrompt) {
              this.updateStatus(scene.sceneNumber, 'image-gen');
              const imgPath = await generateImage(worker.flowPage, scene, worker.projectUrl, refIndices, worker.totalRefs, this.outputDir, this.log);
              updateSceneProgress(progress, scene.sceneNumber, {
                imageGenerated: true,
                imagePath: imgPath,
              }, this.progressFile);
              this.updateStatus(scene.sceneNumber, 'image-download', { imagePath: imgPath });
            }
          }

          if (this.isAborted()) break;

          // Video (only for AI-VID)
          if (scene.type === 'AI-VID' && !config.imageOnly && !(config.resume && isVideoDone(progress, scene.sceneNumber))) {
            if (scene.videoPrompt) {
              this.updateStatus(scene.sceneNumber, 'video-gen');
              const vidPath = await generateVideo(worker.flowPage, scene, worker.projectUrl, refIndices, worker.totalRefs, this.outputDir, this.log);
              updateSceneProgress(progress, scene.sceneNumber, {
                videoGenerated: true,
                videoPath: vidPath,
              }, this.progressFile);
              this.updateStatus(scene.sceneNumber, 'video-download', { videoPath: vidPath });
            }
          }

          completed++;
          this.updateStatus(scene.sceneNumber, 'complete');
          this.log.success(`[W${workerIdx + 1}] Scene ${scene.sceneNumber} completed (${completed}/${scenes.length})`);

          // Delay between scenes to avoid rate limiting
          if (nextSceneIdx < processableScenes.length && !this.isAborted()) {
            await worker.flowPage.page.waitForTimeout(CONFIG.DELAY_BETWEEN_SCENES_MS);
          }
        } catch (err) {
          failed++;
          const msg = err instanceof Error ? err.message : String(err);
          this.log.error(`[W${workerIdx + 1}] Scene ${scene.sceneNumber} FAILED: ${msg}`);
          updateSceneProgress(progress, scene.sceneNumber, { error: msg }, this.progressFile);
          this.updateStatus(scene.sceneNumber, 'failed', { error: msg });
        }
      }
    };

    // Run all workers in parallel
    await Promise.all(workers.map((w, i) => runWorker(w, i)));

    // Cleanup extra tabs
    for (const w of workers) {
      if (w.extraPage) {
        await w.extraPage.close().catch(() => {});
      }
    }

    this.log.info('═'.repeat(60));
    this.log.info(`Done! Completed: ${completed}, Failed: ${failed}, Total: ${scenes.length}`);
    if (failed > 0) this.log.warn('Run with --resume to retry failed scenes');
    this.log.info(`Output: ${this.outputDir}`);

    // Generate report
    this.writeReport(scenes, progress, completed, failed);

    this.emit('run-complete', { completed, failed, total: scenes.length, aborted: this.isAborted() });

    if (shouldClosePage) {
      // Legacy CLI mode: close the entire browser context
      await page.context().close();
    }
    // Multi-flow mode: page stays open, FlowManager manages its lifecycle
  }

  private updateStatus(sceneNumber: string, step: SceneStatus['step'], extra?: Partial<SceneStatus>): void {
    const status = this.sceneStatuses.get(sceneNumber);
    if (status) {
      status.step = step;
      if (extra) Object.assign(status, extra);
      this.emit('progress', this.getSceneStatuses());
    }
  }

  private writeReport(scenes: SceneData[], progress: any, completed: number, failed: number): void {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const lines: string[] = [];

    lines.push(`# GG Flow Report — ${new Date().toLocaleString('vi-VN')}`);
    lines.push('');
    lines.push(`## Summary`);
    lines.push(`- Total scenes: ${scenes.length}`);
    lines.push(`- Completed: ${completed}`);
    lines.push(`- Failed: ${failed}`);
    lines.push(`- Skipped (STOCK): ${scenes.filter(s => s.type === 'STOCK').length}`);
    lines.push('');

    const successScenes = scenes.filter(s => {
      const p = progress.scenes?.[s.sceneNumber];
      return p?.imageGenerated || p?.videoGenerated;
    });
    if (successScenes.length > 0) {
      lines.push(`## Completed Scenes`);
      lines.push('| # | Name | Type | Image | Video |');
      lines.push('|---|------|------|-------|-------|');
      for (const s of successScenes) {
        const p = progress.scenes?.[s.sceneNumber] || {};
        const img = p.imagePath ? `✅ ${p.imagePath.split(/[\\/]/).pop()}` : '—';
        const vid = p.videoPath ? `✅ ${p.videoPath.split(/[\\/]/).pop()}` : '—';
        lines.push(`| ${s.sceneNumber} | ${s.sceneName} | ${s.type} | ${img} | ${vid} |`);
      }
      lines.push('');
    }

    const failedScenes = scenes.filter(s => {
      const p = progress.scenes?.[s.sceneNumber];
      return p?.error;
    });
    if (failedScenes.length > 0) {
      lines.push(`## Failed Scenes (need manual retry)`);
      lines.push('| # | Name | Error |');
      lines.push('|---|------|-------|');
      for (const s of failedScenes) {
        const p = progress.scenes?.[s.sceneNumber] || {};
        const err = (p.error || 'Unknown').substring(0, 80);
        lines.push(`| ${s.sceneNumber} | ${s.sceneName} | ${err} |`);
      }
      lines.push('');
      lines.push('### How to retry');
      lines.push('```bash');
      lines.push('# Retry all failed scenes');
      lines.push('npm start -- --resume');
      lines.push('');
      lines.push('# Retry specific scene');
      for (const s of failedScenes) {
        lines.push(`npm start -- --scene ${s.sceneNumber}`);
      }
      lines.push('```');
      lines.push('');
    }

    const skippedScenes = scenes.filter(s => s.type === 'STOCK');
    if (skippedScenes.length > 0) {
      lines.push(`## Skipped Scenes (STOCK)`);
      for (const s of skippedScenes) {
        lines.push(`- Scene ${s.sceneNumber}: ${s.sceneName}`);
      }
      lines.push('');
    }

    const reportPath = join(this.outputDir, `report_${timestamp}.md`);
    writeFileSync(reportPath, lines.join('\n'));
    this.log.success(`Report saved: ${reportPath}`);
  }
}

/** Open browser for Google login (standalone, not per-flow) */
export async function openLoginBrowser(): Promise<void> {
  globalLog.info('Opening browser for login...');
  const ctx = await launchBrowser({ headless: false });
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto(CONFIG.FLOW_URL, { waitUntil: 'domcontentloaded' });
  globalLog.info('Please log in to your Google account, then close the browser.');

  return new Promise<void>((resolve) => {
    ctx.on('close', () => {
      globalLog.success('Session saved!');
      resolve();
    });
  });
}
