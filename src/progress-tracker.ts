import { readFileSync, writeFileSync, existsSync } from 'fs';
import { CONFIG } from './config.js';
import { log } from './logger.js';

interface SceneProgress {
  imageGenerated: boolean;
  imagePath?: string;
  videoGenerated: boolean;
  videoPath?: string;
  error?: string;
}

interface Progress {
  lastUpdated: string;
  scenes: Record<string, SceneProgress>;
}

function defaultProgress(): Progress {
  return { lastUpdated: new Date().toISOString(), scenes: {} };
}

export function loadProgress(progressFile?: string): Progress {
  const file = progressFile || CONFIG.PROGRESS_FILE;
  if (!existsSync(file)) return defaultProgress();

  try {
    const data = readFileSync(file, 'utf-8');
    return JSON.parse(data) as Progress;
  } catch {
    log.warn('Could not read progress file, starting fresh');
    return defaultProgress();
  }
}

export function saveProgress(progress: Progress, progressFile?: string): void {
  const file = progressFile || CONFIG.PROGRESS_FILE;
  progress.lastUpdated = new Date().toISOString();
  writeFileSync(file, JSON.stringify(progress, null, 2));
}

export function isSceneComplete(progress: Progress, sceneNumber: string): boolean {
  const scene = progress.scenes[sceneNumber];
  return !!scene?.imageGenerated && !!scene?.videoGenerated;
}

export function isImageDone(progress: Progress, sceneNumber: string): boolean {
  return !!progress.scenes[sceneNumber]?.imageGenerated;
}

export function isVideoDone(progress: Progress, sceneNumber: string): boolean {
  return !!progress.scenes[sceneNumber]?.videoGenerated;
}

export function updateSceneProgress(
  progress: Progress,
  sceneNumber: string,
  update: Partial<SceneProgress>,
  progressFile?: string,
): void {
  if (!progress.scenes[sceneNumber]) {
    progress.scenes[sceneNumber] = {
      imageGenerated: false,
      videoGenerated: false,
    };
  }
  Object.assign(progress.scenes[sceneNumber], update);
  saveProgress(progress, progressFile);
}
