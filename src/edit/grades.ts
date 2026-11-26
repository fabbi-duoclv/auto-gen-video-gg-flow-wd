/** Bảng màu theo chương → chuỗi bộ lọc ffmpeg. Khóa "lut:<tên>" dùng tệp .cube người dùng nhập. */
export const GRADES: Record<string, { name: string; filter: string }> = {
  neutral: { name: 'Gốc', filter: '' },
  cold: { name: 'Lạnh, xám', filter: 'colorbalance=bs=.06:bm=.04:rh=-.04,eq=contrast=1.06:saturation=.72' },
  teal: { name: 'Xanh ngọc-cam', filter: 'colorbalance=rs=.10:gs=-.02:bs=-.12:rm=.06:bm=-.06:rh=.08:bh=-.10,eq=contrast=1.08:saturation=1.12' },
  warm: { name: 'Ấm, vàng đỏ', filter: 'colorbalance=rs=.10:gs=.03:bs=-.10:rm=.06:bm=-.06,eq=contrast=1.05:saturation=1.2' },
  green: { name: 'Xanh lá ngả xám', filter: 'colorbalance=gs=.07:bs=.02:rh=-.05,eq=contrast=1.02:saturation=.72' },
  highkey: { name: 'Sáng, trắng', filter: "eq=brightness=.05:contrast=.94:saturation=.85,curves=all='0/0.06 1/1'" },
};

export const GRADE_KEYS = Object.keys(GRADES);
/** Gợi ý mặc định cho bộ "Năm kiếp" (5 chương): lạnh, xanh ngọc-cam, ấm, xanh lá, sáng. */
export const DEFAULT_CYCLE = ['cold', 'teal', 'warm', 'green', 'highkey'];

export function isGradeKey(k: string, luts: string[]): boolean {
  if (GRADES[k]) return true;
  const m = /^lut:([A-Za-z0-9_-]{1,60})$/.exec(k);
  return !!m && luts.includes(m[1]);
}

/** Chuỗi bộ lọc cho khóa màu (đường dẫn LUT tương đối vì ffmpeg chạy trong thư mục làm việc riêng). */
export function gradeFilter(key: string): string {
  if (GRADES[key]) return GRADES[key].filter;
  const m = /^lut:([A-Za-z0-9_-]{1,60})$/.exec(key);
  return m ? `lut3d=file=luts/${m[1]}.cube` : '';
}
