import type { Canvas, EditItem, EditProject } from './types.js';
import type { TLRow } from './timeline.js';

export function assTime(t: number): string {
  const cs = Math.max(0, Math.round(t * 100));
  const h = Math.floor(cs / 360000), m = Math.floor((cs % 360000) / 6000), s = Math.floor((cs % 6000) / 100), c = cs % 100;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

/** Chữ thuần vào ASS: bỏ ký tự điều khiển, vô hiệu {…} (mã ghi đè) và \. */
export function assEscape(s: string): string {
  return s.replace(/[\r\n]+/g, '\\N').replace(/\\(?!N)/g, '/').replace(/\{/g, '(').replace(/\}/g, ')');
}

const LYRIC_MARGIN: Record<Canvas, number> = { pic: 0.172, full: 0.10, wide: 0.09 };

/** Tạo phụ đề (lời hát + chữ thẻ chương) khớp với layout đã trừ chồng dissolve. */
export function buildAss(project: EditProject, items: EditItem[], rows: TLRow[], total: number, W: number, H: number): string {
  const base = Math.min(W, H);
  const lyricFs = Math.round(base * 0.054), titleFs = Math.round(base * 0.078), outline = Math.max(1, Math.round(base / 540));
  const font = project.titleFont;
  const out: string[] = [
    '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${W}`, `PlayResY: ${H}`, 'WrapStyle: 0', 'ScaledBorderAndShadow: yes', '',
    '[V4+ Styles]',
    'Format: Name,Fontname,Fontsize,PrimaryColour,OutlineColour,BackColour,Bold,Italic,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding',
    `Style: Lyric,${font},${lyricFs},&H00FFFFFF,&H99000000,&H00000000,0,0,1,${outline},1,2,${Math.round(W * 0.055)},${Math.round(W * 0.055)},${Math.round(H * LYRIC_MARGIN[project.canvas])},1`,
    `Style: Title,${font},${titleFs},&H00FFFFFF,&H00000000,&H00000000,1,0,1,0,0,5,${Math.round(W * 0.055)},${Math.round(W * 0.055)},0,1`,
    '', '[Events]', 'Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text',
  ];
  for (const y of project.lyrics) {
    if (y.s >= total) continue;
    out.push(`Dialogue: 0,${assTime(y.s)},${assTime(Math.min(y.e, total))},Lyric,,0,0,0,,{\\fad(200,200)}${assEscape(y.t)}`);
  }
  items.forEach((it, i) => {
    if (it.kind !== 'title' || it.skip) return;
    const text = project.chapterTitles[it.chapter] ?? it.chapter;
    if (!text.trim()) return;
    const s = rows[i].t0 + 0.15, e = rows[i].t0 + rows[i].use - 0.1;
    if (e > s) out.push(`Dialogue: 1,${assTime(s)},${assTime(e)},Title,,0,0,0,,{\\fad(350,250)}${assEscape(text)}`);
  });
  return out.join('\n') + '\n';
}
