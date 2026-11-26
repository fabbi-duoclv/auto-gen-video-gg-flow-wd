import { createRequire } from 'module';
import type { EditItem } from './types.js';

/** Item đã gắn thông tin clip, dùng cho tính layout (cùng mã với trình duyệt: public/timeline.cjs). */
export interface TLItem {
  kind: 'shot' | 'title';
  use: number;
  start: number;
  srcLen?: number;
  missing?: boolean;
  skip?: boolean;
  out: 'cut' | 'dissolve';
}
export interface TLRow { t0: number; use: number; d: number }

interface Timeline {
  DISSOLVE: number;
  effUse(it: TLItem): number;
  layout(items: TLItem[]): { total: number; rows: TLRow[] };
  indexAt(items: TLItem[], rows: TLRow[], t: number): number;
  snapToLyrics<T extends TLItem>(items: T[], lyrics: { s: number }[], opts?: { windowSec?: number; minUse?: number }): { items: T[]; moved: { index: number; from: number; to: number }[] };
  shiftLyrics<T extends { s: number; e: number }>(lyrics: T[], delta: number): T[];
}

const req = createRequire(import.meta.url);
export const TL = req('../../public/timeline.cjs') as Timeline;

export type { EditItem };
