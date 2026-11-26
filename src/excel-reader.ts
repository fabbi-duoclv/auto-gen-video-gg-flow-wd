import ExcelJS from 'exceljs';
import { CONFIG } from './config.js';
import { log } from './logger.js';

export type SceneType = 'STOCK' | 'AI-IMG' | 'AI-VID';

export interface CharacterData {
  id: string;
  name: string;
  role: string;
  anchorText: string;
  negativeConstraints: string;
  promptHeadshot: string;
  promptPortrait: string;
  promptFullBody: string;
  /** Đường dẫn ảnh thật của nhân vật. Có giá trị ⇒ upload ảnh này thay vì sinh headshot từ prompt. */
  photoPath: string;
}

export interface SceneData {
  sceneNumber: string;
  sceneName: string;
  type: SceneType;
  endTime: string;
  duration: number;
  character: string;
  cameraAngle: string;
  cameraMove: string;
  mood: string;
  transition: string;
  imagePrompt: string;
  firstFramePrompt: string;
  videoPrompt: string;
  pexelsKey1: string;
  pexelsKey2: string;
  refCharIds: string;
  characterNames: string[];
}

function cellValue(row: ExcelJS.Row, col: number): string {
  const cell = row.getCell(col);
  const val = cell.value;
  if (val === null || val === undefined) return '';
  if (typeof val === 'object' && 'richText' in val) {
    return val.richText.map((r: { text: string }) => r.text).join('');
  }
  return String(val).trim();
}

function loadWorkbook(excelPath?: string): Promise<ExcelJS.Workbook> {
  const filePath = excelPath || CONFIG.EXCEL_PATH;
  const workbook = new ExcelJS.Workbook();
  return workbook.xlsx.readFile(filePath).then(() => workbook);
}

/**
 * Read scenes from sheet "Scenes" (first sheet).
 */
export async function readScenes(excelPath?: string, typeFilter?: SceneType | SceneType[]): Promise<SceneData[]> {
  const workbook = await loadWorkbook(excelPath);
  const sheet = workbook.getWorksheet('Scenes') || workbook.worksheets[0];
  if (!sheet) throw new Error('No "Scenes" sheet found');

  const C = CONFIG.SCENE_COL;
  const validTypes = new Set<string>(
    typeFilter
      ? (Array.isArray(typeFilter) ? typeFilter : [typeFilter])
      : ['AI-VID', 'AI-IMG', 'STOCK']
  );

  const scenes: SceneData[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const type = cellValue(row, C.TYPE) as SceneType;
    if (!validTypes.has(type)) return;

    const sceneNum = cellValue(row, C.SCENE_NUM);
    const sceneName = cellValue(row, C.SCENE_NAME);
    const timeline = cellValue(row, C.TIMELINE);

    let endTime = '0p00';
    const match = timeline.match(/-\s*(\d+):(\d+)\s*$/);
    if (match) {
      endTime = `${parseInt(match[1])}p${match[2]}`;
    }

    const imagePrompt = cellValue(row, C.IMAGE_PROMPT);
    const firstFramePrompt = cellValue(row, C.FIRST_FRAME);
    const videoPrompt = cellValue(row, C.VIDEO_PROMPT);

    const effectiveImagePrompt = type === 'AI-VID'
      ? (firstFramePrompt || imagePrompt)
      : (imagePrompt || firstFramePrompt);

    if (type !== 'STOCK' && !effectiveImagePrompt && !videoPrompt) {
      log.warn(`Scene ${sceneNum} (${sceneName}): missing prompts, skipping`);
      return;
    }

    scenes.push({
      sceneNumber: sceneNum.padStart(2, '0'),
      sceneName,
      type,
      endTime,
      duration: parseInt(cellValue(row, C.DURATION)) || 0,
      character: cellValue(row, C.CHARACTER),
      cameraAngle: cellValue(row, C.CAMERA_ANGLE),
      cameraMove: cellValue(row, C.CAMERA_MOVE),
      mood: cellValue(row, C.MOOD),
      transition: cellValue(row, C.TRANSITION),
      imagePrompt: effectiveImagePrompt,
      firstFramePrompt,
      videoPrompt,
      pexelsKey1: cellValue(row, C.PEXELS_KEY_1),
      pexelsKey2: cellValue(row, C.PEXELS_KEY_2),
      refCharIds: cellValue(row, C.REF_CHAR_IDS),
      characterNames: cellValue(row, C.CHARACTER)
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),
    });
  });

  log.info(`Loaded ${scenes.length} scenes from Excel (${Array.from(validTypes).join('/')})`);
  return scenes;
}

/**
 * Read characters from sheet "Characters" (second sheet).
 * Each row = 1 character with full ref info.
 */
export async function readCharacters(excelPath?: string): Promise<CharacterData[]> {
  const workbook = await loadWorkbook(excelPath);
  const sheet = workbook.getWorksheet('Characters') || workbook.worksheets[1];
  if (!sheet) {
    log.warn('No "Characters" sheet found');
    return [];
  }

  const C = CONFIG.CHAR_COL;
  const characters: CharacterData[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const name = cellValue(row, C.NAME);
    if (!name) return;

    characters.push({
      id: cellValue(row, C.ID),
      name,
      role: cellValue(row, C.ROLE),
      anchorText: cellValue(row, C.ANCHOR_TEXT),
      negativeConstraints: cellValue(row, C.NEG_CONSTRAINTS),
      promptHeadshot: cellValue(row, C.PROMPT_HEADSHOT),
      promptPortrait: cellValue(row, C.PROMPT_PORTRAIT),
      promptFullBody: cellValue(row, C.PROMPT_FULLBODY),
      photoPath: cellValue(row, C.PHOTO),
    });
  });

  log.info(`Found ${characters.length} characters from Excel`);
  return characters;
}
