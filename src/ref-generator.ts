import { FlowPage } from './flow-page.js';
import { type CharacterData } from './excel-reader.js';
import { log } from './logger.js';
import { resolvePhotos, uploadRefPhotos } from './ref-photos.js';

export interface RefSet {
  refMap: Map<string, number>;
  totalRefs: number;
}

/**
 * Chuẩn bị ảnh tham chiếu cho project hiện tại:
 * - Có nhân vật với cột "Ảnh tham chiếu" ⇒ upload ảnh thật (nhận diện theo nội dung khi gắn).
 * - Không ⇒ cách cũ: sinh headshot từ prompt.
 */
export async function prepareRefs(
  flowPage: FlowPage,
  characters: CharacterData[],
  excelPath?: string,
): Promise<RefSet> {
  const withPhoto = characters.filter((c) => c.photoPath);
  if (withPhoto.length > 0) {
    const specs = resolvePhotos(characters, excelPath); // lỗi đường dẫn/định dạng báo trước khi làm gì trên Flow
    for (const c of characters) {
      if (!c.photoPath) log.warn(`Nhân vật "${c.name}" không có ảnh tham chiếu: sẽ KHÔNG được gắn ảnh`);
    }
    const refMap = await uploadRefPhotos(flowPage, specs);
    return { refMap, totalRefs: specs.length };
  }

  const n = characters.filter((c) => c.promptHeadshot).length;
  if (n === 0) return { refMap: new Map(), totalRefs: 0 };
  const refMap = await generateRefImages(flowPage, characters);
  return { refMap, totalRefs: n };
}

/**
 * Generate reference headshot images for all characters.
 * Images stay in the project (not downloaded) for use as refs in scene generation.
 *
 * Returns a mapping: character name → index in project (0-based).
 */
export async function generateRefImages(
  flowPage: FlowPage,
  characters: CharacterData[],
): Promise<Map<string, number>> {
  const refMap = new Map<string, number>();

  const charsWithPrompt = characters.filter(c => c.promptHeadshot);
  if (charsWithPrompt.length === 0) {
    log.warn('No characters with headshot prompts found');
    return refMap;
  }

  log.info(`Generating ${charsWithPrompt.length} character ref images...`);

  for (let i = 0; i < charsWithPrompt.length; i++) {
    const char = charsWithPrompt[i];
    log.info(`[Ref ${i + 1}/${charsWithPrompt.length}] ${char.name}: generating headshot...`);

    await flowPage.configureModel('image', '16:9', 1);
    await flowPage.enterPrompt(char.promptHeadshot);
    await flowPage.clickGenerate();
    await flowPage.waitForImageGeneration();

    // Image stays in project — record its index
    refMap.set(char.name, i);
    log.success(`[Ref ${i + 1}/${charsWithPrompt.length}] ${char.name}: headshot generated (index ${i})`);

    // Small delay between refs
    if (i < charsWithPrompt.length - 1) {
      await flowPage.page.waitForTimeout(3000);
    }
  }

  log.success(`All ${charsWithPrompt.length} ref images generated`);
  return refMap;
}

/**
 * Get ref indices for characters in a scene.
 */
export function getRefIndicesForScene(
  characterNames: string[],
  refMap: Map<string, number>,
): number[] {
  const indices: number[] = [];
  for (const name of characterNames) {
    const idx = refMap.get(name);
    if (idx !== undefined) {
      indices.push(idx);
    } else {
      log.warn(`No ref image found for character: ${name}`);
    }
  }
  return indices;
}
