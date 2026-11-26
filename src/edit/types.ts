/** Mô hình dữ liệu bước Dựng. Lưu ở flows/<id>/edit/project.json. */

export type Canvas = 'pic' | 'full' | 'wide';
export type OutKind = 'cut' | 'dissolve';

export interface EditItem {
  /** Ổn định theo Excel: "s:<số cảnh>" hoặc "t:<chương>". Dùng để ghép lại khi Excel đổi. */
  id: string;
  kind: 'shot' | 'title';
  sceneNumber: string;
  chapter: string;
  code: string;
  size: string;
  face: boolean;
  who: string;
  /** Giây bắt đầu lấy trong clip gốc. */
  start: number;
  /** Độ dài dùng (giây). */
  use: number;
  /** Độ dài gợi ý từ Excel. */
  sugg: number;
  out: OutKind;
  skip: boolean;
}

export interface Lyric { s: number; e: number; t: string }

export interface MusicSettings {
  /** Tên tệp trong flows/<id>/edit/, null nếu chưa có nhạc. */
  file: string | null;
  name: string;
  duration: number;
  offset: number;
  fadeIn: number;
  fadeOut: number;
  /** LUFS đích, null = giữ nguyên. */
  loudness: number | null;
}

export interface EditProject {
  version: 1;
  canvas: Canvas;
  resolution: 1080 | 720;
  fps: 24 | 30;
  grain: boolean;
  titleFont: string;
  titleDur: number;
  /** Số cảnh chứa clip khói dùng làm nền thẻ chương. */
  plateScene: string | null;
  chapterGrades: Record<string, string>;
  chapterTitles: Record<string, string>;
  outputName: string;
  items: EditItem[];
  lyrics: Lyric[];
  music: MusicSettings;
}

export interface ClipInfo {
  file: string;
  path: string;
  duration: number;
}
