# Bàn giao: gen video cưới từ ảnh cô dâu chú rể trên Google Flow

Thư mục này **thêm vào** dự án `auto-gen-video-gg-flow`. Chưa sửa file nào của dự án gốc.
Ngày: 2026-11-26. Đây là bản nghiên cứu và dữ liệu, **chưa chạy thử trên Flow thật** (người soạn không đăng nhập được Flow).

## 1. Trong thư mục có gì

| Đường dẫn | Nội dung |
|---|---|
| `excel/ngu-kiep.xlsx` | Mẫu A "Năm kiếp": 1 dòng nền khói thẻ chương + 40 shot (≈ 52 giây) |
| `excel/album-phong-cach.xlsx` | Mẫu B "Album nhiều phong cách": 34 shot (≈ 30 giây) |
| `docs/phan-tich-va-quy-trinh.md` | Phân tích hai video mẫu (nhịp cắt, nội dung từng shot, quy trình làm từ ảnh) |
| `docs/bo-cau-lenh-tung-shot.md` | Prompt ảnh tĩnh + prompt chuyển động cho từng shot, các khối dùng chung, bảng lỗi đã rà soát |
| `docs/hinh/` | Ảnh danh sách shot của hai video mẫu |
| `prompt-source/` | Dữ liệu gốc 74 shot (`gen_prompts.py`) và script sinh lại md và Excel (`build_excel.py`) |

Tạo lại sau khi sửa prompt trong `gen_prompts.py` (cần Python 3 và `openpyxl`):

```bash
python3 prompt-source/gen_prompts.py docs/bo-cau-lenh-tung-shot.md
python3 prompt-source/build_excel.py excel
```

## 2. Excel khớp với dự án thế nào

Đã kiểm bằng chính `src/excel-reader.ts`: đọc được 41 và 34 dòng, tên nhân vật khớp sheet `Characters`, không dòng nào thiếu prompt.

| Cột / sheet | Giá trị |
|---|---|
| `Loại` | Luôn `AI-VID` (hai bước: ảnh khung đầu → "Tạo ảnh động") |
| `Prompt first frame` (cột 14) | Prompt **ảnh tĩnh** của shot (cột 13 trùng nội dung) |
| `Prompt Veo` (cột 15) | Prompt **chuyển động** của shot |
| `Nhân vật` | `Cô dâu`, `Chú rể` hoặc cả hai; để trống với cảnh vật |
| `Tên cảnh` | Mã shot, bộ/chương, cỡ cảnh, **độ dài nên giữ khi cắt** (ví dụ "dùng 1,4 s"), có thấy mặt không |
| `Timeline` | Cộng dồn theo độ dài giữ lại, chỉ để đặt tên file đầu ra |
| `Characters` | Cột 9 **"Ảnh tham chiếu (đường dẫn)"** = `wedding-video/photos/co-dau.jpg` / `chu-re.jpg`; `Prompt headshot` **để trống có chủ đích** (xem mục 3.1) |

## 3. Việc phải làm trước khi chạy thật

### 3.1. Upload ảnh cặp đôi: ĐÃ THÊM, chưa thử trên Flow thật
Đã thêm vào dự án (đã qua kiểm tra kiểu và kiểm tra offline, chưa chạy trên giao diện Flow thật):

| Tệp | Việc |
|---|---|
| `src/ref-photos.ts` (mới) | Upload ảnh qua popup "+", nhận diện ảnh trong popup theo **nội dung**, gắn đúng người vào từng shot, lưu debug khi lỗi |
| `src/image-hash.ts` (mới) | Dấu vân ảnh dHash 64 bit (dùng `sharp`, tự xoay theo EXIF) |
| `src/ref-generator.ts` | Thêm `prepareRefs()`: có cột ảnh ⇒ upload; không ⇒ sinh headshot như cũ |
| `src/engine.ts`, `src/flow-page.ts`, `src/config.ts`, `src/excel-reader.ts` | Nối `prepareRefs()` vào bước 0 (cả tab chính lẫn các tab worker); `attachReferences()` tự chuyển sang gắn theo nội dung khi đã có ảnh thật; đọc cột 9 |
| `scripts/test-upload-mock.ts` | Kiểm tra OFFLINE trên trang giả lập popup (`npm run test:upload-mock`) |
| `scripts/inspect-upload.ts`, `scripts/test-upload.ts` | Chạy trên Flow thật: khảo sát popup, upload và gắn thử, **không tốn credit** |

**Vì sao nhận diện theo nội dung, không theo vị trí:** `attachReferences()` gốc chọn ảnh bằng `count - totalRefs + idx`. Với danh sách mới nhất ở đầu, công thức này có vẻ trỏ ngược thứ tự (nhân vật 0 thành nhân vật cuối), tức có thể gắn nhầm mặt khi có từ hai nhân vật. Chưa kiểm trên Flow thật. Bản mới so ảnh gốc với thumbnail, và **dừng** khi không chắc chắn thay vì gắn bừa.

**Cách dùng (Web UI):** `npm run serve` → mở Flow → tab *Characters* → bấm hoặc kéo-thả ảnh vào ô của từng người (xem README mục "Upload ảnh trên Web UI"). Ảnh upload ưu tiên hơn cột 9 của Excel.

**Cách dùng (CLI / Excel):**
1. Bỏ `co-dau.jpg`, `chu-re.jpg` vào `wedding-video/photos/` (cột 9 của sheet `Characters` đã khai sẵn).
2. `npm run inspect:upload -- --file ./wedding-video/photos/co-dau.jpg`: xem nút tải lên nào chạy được, ảnh chụp và HTML popup lưu ở `output/debug/`.
3. `npm run test:upload -- ./wedding-video/excel/ngu-kiep.xlsx`: upload, in bảng khoảng cách ảnh gốc với mọi mục popup, gắn thử từng ảnh.
4. Nếu báo "không nhận diện chắc chắn": đọc bảng, chỉnh `REF_HASH_MAX_DIST` / `REF_HASH_MIN_MARGIN` / `REF_HASH_STRONG_DIST` trong `.env`. Mặc định 20 / 6 / 8.

**Số đo đã có (ảnh tổng hợp, chưa phải ảnh người thật):** ảnh giống nhau, dù bị nén JPEG q30, cắt vuông, thu 120px, đổi sáng +12%, cách nhau tối đa 5/64; ảnh khác nhau cách tối thiểu 25/64 (40 cặp thử). Ảnh người thật có nền giống nhau sẽ gần hơn, nên cần chạy bước 3 để xem số thật.

**Chỗ có thể gãy trên Flow thật (selector chưa kiểm):** chữ nút tải lên (`/tải.{0,12}lên|upload/i`), `input[type=file]`, popup `[role=dialog][data-state=open]`, mục ảnh `div[tabindex=0]:has(img)`, nút `add_2`. Khi gãy, `output/debug/*.png` và `*-dialog.html` cho biết sửa chỗ nào; gửi hai tệp đó là đủ để chỉnh.

**Giới hạn hiện tại:** mỗi nhân vật một ảnh; chưa có quy tắc "ảnh gốc rộng của bộ" làm tham chiếu thứ ba (xem `docs/bo-cau-lenh-tung-shot.md` mục 1).

> Chưa có ảnh trong `wedding-video/photos/` mà chạy `npm start` ⇒ dự án **báo lỗi rõ ràng và dừng** trước khi làm gì trên Flow (không còn tình trạng gen mặt ngẫu nhiên).

### 3.2. Đo lại selector trên giao diện Flow hiện tại
`flow-page.ts` ghi selector đo ngày **2026-03-21**. Cần chạy lại `scripts/inspect.ts` (và `inspect-after-gen.ts`, `inspect-download.ts`) rồi sửa. Chỗ dễ gãy:
- Class băm `button.sc-d64366c4-1`.
- Chữ tiếng Việt trên nút và menu ("Dự án mới", "Tạo ảnh động", "Tải xuống", "Không thành công").
- Icon dạng chữ (`add_2`, `arrow_forward`, `crop_`).
- Danh sách model: code chọn cứng `Veo 3.1 - Fast [Lower Priority]`. Theo nguồn bên thứ ba (chưa có bài đăng gốc của Google), **Veo 3.1 Fast/Quality bị gỡ khỏi Flow ngày 2026-12-05**, còn Omni Flash 1.2 và Veo 3.1 Lite. Kiểm tra trong giao diện thật.

### 3.3. Các chỗ code gốc cố định cần đổi
- `video-generator.ts`: `configureModel('video', '16:9', 1, 'fast')` cố định 16:9, x1, fast. Video phát dọc cần 9:16.
- `REBUILD_SPEC.md` mục 12: sửa prompt trên web chưa được áp dụng; `anchorText` và `negativeConstraints` chưa ghép vào prompt; `isSceneComplete` đòi cả ảnh lẫn video.

### 3.4. Phần dựng sau khi tải clip: ĐÃ THÊM (bước Edit trên web UI)
Cắt theo "dùng", ghép, dissolve, thẻ chương, chỉnh màu theo chương, lời hát (.lrc/.srt), nhạc, xuất 9:16 / 16:9. Xem README mục "Bước Dựng video". Đã kiểm bằng clip giả (ffmpeg thật, trình duyệt thật); **chưa dựng thử với clip thật từ Flow**, nên chất lượng màu và khuôn mặt cần xem lại sau lần chạy thật đầu tiên. Cần bài nhạc và lời bạn chọn.

## 4. Rủi ro cần biết

- **Tài khoản:** tự động hóa giao diện Flow có thể bị Google hạn chế tài khoản hoặc chặn đăng nhập. Chưa kiểm điều khoản của Flow. Dùng tài khoản riêng, tốc độ thấp. Dự án gốc dùng cờ che dấu tự động hóa trong `browser.ts`; bản bàn giao này không thêm kỹ thuật né phát hiện nào.
- **Seedance** không nhận trực tiếp ảnh gương mặt người thật nếu chưa qua xác minh chính thức (theo tóm tắt tài liệu BytePlus, chưa đọc được trang gốc). Shot thấy mặt nên làm ở Flow.
- **Chưa thử thật:** quy tắc "hành động trong N giây đầu", việc Flow xử lý đúng ba ảnh tham chiếu, và cách Omni xử lý câu phủ định đều là suy luận. Chạy thử 6 shot đầu của mẫu A rồi chỉnh prompt theo kết quả.

## 5. Thứ tự làm gợi ý

1. Chạy `scripts/inspect.ts`, cập nhật selector và danh sách model (3.2).
2. Chạy `npm run inspect:upload`, rồi `npm run test:upload` để hiệu chỉnh upload và nhận diện ảnh (3.1).
3. Chạy `--start-from 1 --end-at 6` với `ngu-kiep.xlsx`, xem kết quả, chỉnh prompt trong `gen_prompts.py` rồi sinh lại Excel.
4. Chạy cả bộ, rồi làm phần dựng (3.4).
