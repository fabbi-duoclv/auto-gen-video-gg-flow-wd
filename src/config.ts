import { resolve, join } from 'path';

export const CONFIG = {
  FLOW_URL: 'https://labs.google/fx/vi/tools/flow',
  EXCEL_PATH: resolve('./wedding-video/excel/ngu-kiep.xlsx'),
  TEMPLATES_DIR: resolve('./wedding-video/excel'),
  OUTPUT_DIR: resolve('./output'),
  BROWSER_DATA_DIR: resolve('./browser-profile'),
  PROGRESS_FILE: resolve('./progress.json'),
  FLOWS_DIR: resolve('./flows'),
  MAX_CONCURRENT_FLOWS: 5,
  MAX_CONCURRENT_SCENES: 3,

  // Timing
  DELAY_BETWEEN_SCENES_MS: 5000,
  IMAGE_GENERATION_TIMEOUT_MS: 180_000,
  VIDEO_GENERATION_TIMEOUT_MS: 600_000,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 10_000,
  UPLOAD_TIMEOUT_MS: 60_000,
  DEBUG_DIR: resolve('./output/debug'),

  // Sheet "Scenes" columns (1-indexed)
  SCENE_COL: {
    TIMELINE: 1,
    SCENE_NUM: 2,
    SCENE_NAME: 3,
    TYPE: 4,
    CHARACTER: 5,
    CAMERA_ANGLE: 6,
    CAMERA_MOVE: 7,
    MOOD: 8,
    DURATION: 9,
    TRANSITION: 10,
    PEXELS_KEY_1: 11,
    PEXELS_KEY_2: 12,
    IMAGE_PROMPT: 13,
    FIRST_FRAME: 14,
    VIDEO_PROMPT: 15,
    REF_CHAR_IDS: 16,
  },

  // Sheet "Characters" columns (1-indexed)
  CHAR_COL: {
    ID: 1,
    NAME: 2,
    ROLE: 3,
    ANCHOR_TEXT: 4,
    NEG_CONSTRAINTS: 5,
    PROMPT_HEADSHOT: 6,
    PROMPT_PORTRAIT: 7,
    PROMPT_FULLBODY: 8,
    PHOTO: 9, // đường dẫn ảnh thật của nhân vật (tùy chọn), xem src/ref-photos.ts
  },
} as const;

export interface FlowPaths {
  flowDir: string;
  excelPath: string;
  outputDir: string;
  photosDir: string;
  progressFile: string;
  metaFile: string;
}

export function getFlowPaths(flowId: string): FlowPaths {
  const flowDir = join(CONFIG.FLOWS_DIR, flowId);
  return {
    flowDir,
    excelPath: join(flowDir, 'scene-data.xlsx'),
    outputDir: join(flowDir, 'output'),
    photosDir: join(flowDir, 'photos'),
    progressFile: join(flowDir, 'progress.json'),
    metaFile: join(flowDir, 'meta.json'),
  };
}
