import type { Lyric } from './types.js';

const MAX_LINES = 500;

function clean(t: string): string {
  return t.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

/** [mm:ss.xx] chữ  (cho phép nhiều mốc trên một dòng, bỏ thẻ [ar:...] [ti:...]). Dòng cuối kết thúc sau 3 giây. */
export function parseLrc(text: string): Lyric[] {
  const stamps: { t: number; text: string }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const tags = [...raw.matchAll(/\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)];
    if (!tags.length) continue;
    const body = clean(raw.replace(/\[[^\]]*\]/g, ''));
    for (const m of tags) {
      const frac = m[3] ? +('0.' + m[3]) : 0;
      stamps.push({ t: +m[1] * 60 + +m[2] + frac, text: body });
    }
  }
  stamps.sort((a, b) => a.t - b.t);
  const out: Lyric[] = [];
  for (let i = 0; i < stamps.length; i++) {
    if (!stamps[i].text) continue;
    const next = stamps[i + 1];
    const e = next ? Math.min(next.t, stamps[i].t + 8) : stamps[i].t + 3;
    out.push({ s: round(stamps[i].t), e: round(e), t: stamps[i].text });
  }
  return out.slice(0, MAX_LINES);
}

function srtTime(s: string): number {
  const m = /(\d+):(\d{2}):(\d{2})[,.](\d{1,3})/.exec(s);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] + +('0.' + m[4].padEnd(3, '0')) : NaN;
}

export function parseSrt(text: string): Lyric[] {
  const out: Lyric[] = [];
  for (const block of text.replace(/\r/g, '').split(/\n\s*\n/)) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    const ti = lines.findIndex((l) => l.includes('-->'));
    if (ti < 0) continue;
    const [a, b] = lines[ti].split('-->');
    const s = srtTime(a), e = srtTime(b);
    const t = clean(lines.slice(ti + 1).join(' '));
    if (isNaN(s) || isNaN(e) || !t) continue;
    out.push({ s: round(s), e: round(Math.max(e, s + 0.2)), t });
  }
  return out.slice(0, MAX_LINES);
}

/** Tự nhận dạng .srt (có "-->") hay .lrc. Trả mảng rỗng nếu không đọc được dòng nào. */
export function parseLyrics(text: string): Lyric[] {
  const t = text.replace(/^﻿/, '');
  return t.includes('-->') ? parseSrt(t) : parseLrc(t);
}

const round = (n: number) => Math.round(n * 100) / 100;
