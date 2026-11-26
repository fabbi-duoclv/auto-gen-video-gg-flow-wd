import { FlowPage } from './flow-page.js';
import { type SceneData } from './excel-reader.js';
import { CONFIG } from './config.js';
import { withRetry } from './retry.js';
import { type FlowLogger, log as globalLog } from './logger.js';
import { join } from 'path';

// Thử tạo tối đa 3 lần; cả 3 lần lỗi thì báo cáo kèm lý do cuối cùng (vd. vi phạm chính sách).
const MAX_GEN_RETRIES = 3;

export async function generateVideo(
  flowPage: FlowPage,
  scene: SceneData,
  projectUrl: string,
  refIndices: number[] = [],
  totalRefs: number = 0,
  outputDir?: string,
  logger?: FlowLogger,
  ratio: '16:9' | '9:16' | '1:1' = '16:9',
): Promise<string> {
  const log = logger || globalLog;
  const dir = outputDir || CONFIG.OUTPUT_DIR;
  const savePath = join(dir, `scene_${scene.sceneNumber}_${scene.endTime}_vid.mp4`);

  // Step 1: Animate + generate video with up to 2 retries
  let genSuccess = false;
  let lastError = '';
  for (let attempt = 1; attempt <= MAX_GEN_RETRIES; attempt++) {
    try {
      log.scene(scene.sceneNumber, `Generating video (attempt ${attempt}/${MAX_GEN_RETRIES}): ${scene.videoPrompt.substring(0, 60)}...`);
      await flowPage.clickAnimate();
      await flowPage.configureModel('video', ratio, 1, 'fast');
      if (refIndices.length > 0) {
        await flowPage.attachReferences(refIndices, totalRefs);
      }
      await flowPage.enterVideoPrompt(scene.videoPrompt);
      await flowPage.clickGenerateVideo();
      await flowPage.waitForVideoGeneration();
      genSuccess = true;
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastError = msg;
      log.warn(`Video gen attempt ${attempt}/${MAX_GEN_RETRIES} failed: ${msg}`);
      if (attempt < MAX_GEN_RETRIES) {
        log.info(`Navigating back to project for retry...`);
        await flowPage.navigateToProject(projectUrl);
      }
    }
  }

  if (!genSuccess) {
    throw new Error(`Không tạo được video sau ${MAX_GEN_RETRIES} lần thử. Lý do cuối: ${lastError}`);
  }

  // Step 2: Download with retry
  return withRetry(
    async () => {
      return await flowPage.downloadVideo(savePath);
    },
    {
      attempts: CONFIG.RETRY_ATTEMPTS,
      delayMs: 5000,
      label: `Video download scene ${scene.sceneNumber}`,
    },
  );
}
