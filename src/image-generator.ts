import { FlowPage } from './flow-page.js';
import { type SceneData } from './excel-reader.js';
import { CONFIG } from './config.js';
import { withRetry } from './retry.js';
import { type FlowLogger, log as globalLog } from './logger.js';
import { join } from 'path';

// Thử tạo tối đa 3 lần; cả 3 lần lỗi thì báo cáo kèm lý do cuối cùng (vd. vi phạm chính sách).
const MAX_GEN_RETRIES = 3;

export async function generateImage(
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
  const savePath = join(dir, `scene_${scene.sceneNumber}_${scene.endTime}_img.png`);

  // Step 1: Generate image with up to 2 retries if gen fails
  let genSuccess = false;
  let lastError = '';
  for (let attempt = 1; attempt <= MAX_GEN_RETRIES; attempt++) {
    try {
      log.scene(scene.sceneNumber, `Generating image (attempt ${attempt}/${MAX_GEN_RETRIES}): ${scene.imagePrompt.substring(0, 60)}...`);
      await flowPage.configureModel('image', ratio, 1);
      if (refIndices.length > 0) {
        await flowPage.attachReferences(refIndices, totalRefs);
      }
      await flowPage.enterPrompt(scene.imagePrompt);
      await flowPage.clickGenerate();
      await flowPage.waitForImageGeneration();
      genSuccess = true;
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastError = msg;
      log.warn(`Image gen attempt ${attempt}/${MAX_GEN_RETRIES} failed: ${msg}`);
      if (attempt < MAX_GEN_RETRIES) {
        log.info('Retrying generation in 5s...');
        await flowPage.page.waitForTimeout(5000);
      }
    }
  }

  if (!genSuccess) {
    throw new Error(`Không tạo được ảnh sau ${MAX_GEN_RETRIES} lần thử. Lý do cuối: ${lastError}`);
  }

  // Step 2: Download with retry (if download fails, don't re-generate)
  return withRetry(
    async () => {
      return await flowPage.downloadImage(savePath);
    },
    {
      attempts: CONFIG.RETRY_ATTEMPTS,
      delayMs: 5000,
      label: `Image download scene ${scene.sceneNumber}`,
    },
  );
}
