import { join } from 'path';
import { existsSync } from 'fs';
import { CONFIG } from './config.js';

export interface VideoTemplate {
  id: string;
  name: string;
  description: string;
  file: string;
}

/** Các mẫu video dựng sẵn (prompt từng shot nằm trong file Excel của mẫu). */
export const TEMPLATES: VideoTemplate[] = [
  {
    id: 'album-phong-cach',
    name: 'Album nhiều phong cách',
    description: '~30 giây, 34 shot ngắn 1–2 giây: hiện đại, cổ trang, Dân quốc, áo đỏ, áo trắng. Cùng một cặp đôi.',
    file: 'album-phong-cach.xlsx',
  },
  {
    id: 'ngu-kiep',
    name: 'Nhiều kiếp nhân duyên',
    description: '~52 giây, 40 shot chia chương theo từng thời đại (Chiến Quốc, Đường, Dân quốc…), cùng một cặp đôi.',
    file: 'ngu-kiep.xlsx',
  },
];

export function getTemplate(id: string): VideoTemplate | undefined {
  return TEMPLATES.find(t => t.id === id);
}

export function templatePath(t: VideoTemplate): string {
  return join(CONFIG.TEMPLATES_DIR, t.file);
}

export function templateAvailable(t: VideoTemplate): boolean {
  return existsSync(templatePath(t));
}
