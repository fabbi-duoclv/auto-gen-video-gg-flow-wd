import sharp from 'sharp';

/**
 * "Dấu vân" ảnh 64 bit (dHash) để nhận diện ảnh tham chiếu trong popup của Flow theo NỘI DUNG,
 * không phụ thuộc thứ tự hiển thị.
 *
 * - Ảnh gốc của người dùng: tự xoay theo EXIF (ảnh chụp từ điện thoại), cắt giữa, thu về 9x8, xám.
 * - Thumbnail trong popup (ảnh chụp từ Playwright): xử lý cùng hàm này.
 * Hai ảnh giống nhau (dù nén lại / cắt vuông / đổi cỡ) có khoảng cách Hamming nhỏ (thường < 12 / 64);
 * hai ảnh khác nhau thường ~ 25-40.
 */
export async function dhash(input: Buffer | string): Promise<string> {
  const { data } = await sharp(input)
    .rotate() // áp dụng EXIF orientation
    .greyscale()
    .resize(9, 8, { fit: 'cover', position: 'centre' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let bits = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits = (bits << 1n) | (data[y * 9 + x] > data[y * 9 + x + 1] ? 1n : 0n);
    }
  }
  return bits.toString(16).padStart(16, '0');
}

/** Khoảng cách Hamming giữa hai dấu vân hex 64 bit (0 = giống hệt, 64 = đối nghịch). */
export function hamming(a: string, b: string): number {
  let x = BigInt('0x' + a) ^ BigInt('0x' + b);
  let n = 0;
  while (x) {
    n += Number(x & 1n);
    x >>= 1n;
  }
  return n;
}
