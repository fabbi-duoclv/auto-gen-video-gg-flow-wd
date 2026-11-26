import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync, copyFileSync } from 'fs';
import { join } from 'path';
import sharp, { type Metadata } from 'sharp';
import type { CharacterData } from './excel-reader.js';

/**
 * Ảnh cô dâu / chú rể do người dùng upload qua web UI, lưu theo từng Flow:
 *   flows/<flowId>/photos/char-<id>.<jpg|png|webp>
 * Ảnh upload được ƯU TIÊN hơn đường dẫn ở cột 9 của sheet Characters.
 */

export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
export const MIN_PHOTO_SIDE = 400; // dưới mức này chỉ cảnh báo, không chặn

export type PhotoExt = 'jpg' | 'png' | 'webp';

export interface PhotoInfo {
  file: string;
  path: string;
  ext: PhotoExt;
  mtimeMs: number;
}

export interface SavedPhoto {
  ext: PhotoExt;
  width: number;
  height: number;
  bytes: number;
  warnings: string[];
}

/** id nhân vật → chuỗi an toàn làm tên tệp (chặn ký tự đường dẫn). */
export function safeCharKey(id: string): string {
  const k = String(id).trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  return k || '_';
}

const EXTS: PhotoExt[] = ['jpg', 'png', 'webp'];

export function findPhoto(photosDir: string, charId: string): PhotoInfo | undefined {
  const key = safeCharKey(charId);
  for (const ext of EXTS) {
    const file = `char-${key}.${ext}`;
    const path = join(photosDir, file);
    if (existsSync(path)) return { file, path, ext, mtimeMs: statSync(path).mtimeMs };
  }
  return undefined;
}

/** Nhận diện định dạng theo byte đầu (không tin Content-Type / đuôi tệp client gửi). */
export function sniffExt(buf: Buffer): PhotoExt | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

export async function savePhoto(photosDir: string, charId: string, buf: Buffer): Promise<SavedPhoto> {
  if (buf.length === 0) throw new PhotoError('Tệp rỗng');
  if (buf.length > MAX_PHOTO_BYTES) throw new PhotoError(`Ảnh quá lớn (${(buf.length / 1048576).toFixed(1)} MB). Tối đa ${MAX_PHOTO_BYTES / 1048576} MB.`);
  const ext = sniffExt(buf);
  if (!ext) throw new PhotoError('Định dạng không hỗ trợ. Dùng .jpg, .jpeg, .png hoặc .webp (ảnh HEIC của iPhone cần đổi sang JPG trước).');

  let meta: Metadata;
  try {
    meta = await sharp(buf).metadata();
    await sharp(buf).resize(8, 8, { fit: 'cover' }).raw().toBuffer(); // thử giải mã thật, bắt ảnh hỏng
  } catch {
    throw new PhotoError('Không đọc được ảnh (tệp hỏng hoặc không phải ảnh hợp lệ).');
  }
  // Metadata width/height chưa tính xoay EXIF: orientation 5-8 thì đảo
  const swap = (meta.orientation ?? 1) >= 5;
  const width = (swap ? meta.height : meta.width) ?? 0;
  const height = (swap ? meta.width : meta.height) ?? 0;

  const warnings: string[] = [];
  if (Math.min(width, height) < MIN_PHOTO_SIDE) {
    warnings.push(`Ảnh nhỏ (${width}×${height}). Nên dùng cạnh ngắn ≥ ${MIN_PHOTO_SIDE}px để Flow giữ được nét mặt.`);
  }
  if (height < width * 0.6 && width > 0) {
    warnings.push('Ảnh khá ngang. Ảnh chân dung (mặt rõ, nhìn thẳng) thường cho khuôn mặt giữ tốt hơn.');
  }

  mkdirSync(photosDir, { recursive: true });
  removePhoto(photosDir, charId); // xóa bản cũ (có thể khác đuôi)
  writeFileSync(join(photosDir, `char-${safeCharKey(charId)}.${ext}`), buf);
  return { ext, width, height, bytes: buf.length, warnings };
}

export function removePhoto(photosDir: string, charId: string): boolean {
  let removed = false;
  const key = safeCharKey(charId);
  for (const ext of EXTS) {
    const p = join(photosDir, `char-${key}.${ext}`);
    if (existsSync(p)) {
      rmSync(p, { force: true });
      removed = true;
    }
  }
  return removed;
}

export function copyPhotos(fromDir: string, toDir: string): void {
  if (!existsSync(fromDir)) return;
  mkdirSync(toDir, { recursive: true });
  for (const f of readdirSync(fromDir)) {
    if (/^char-[A-Za-z0-9_-]+\.(jpg|png|webp)$/.test(f)) copyFileSync(join(fromDir, f), join(toDir, f));
  }
}

/** Ghi đè photoPath bằng ảnh đã upload qua UI (nếu có). Dùng cho cả UI và engine để hai nơi luôn khớp. */
export function withUploadedPhotos(characters: CharacterData[], photosDir?: string): CharacterData[] {
  if (!photosDir) return characters;
  return characters.map((c) => {
    const p = findPhoto(photosDir, c.id);
    return p ? { ...c, photoPath: p.path } : c;
  });
}

export class PhotoError extends Error {}
