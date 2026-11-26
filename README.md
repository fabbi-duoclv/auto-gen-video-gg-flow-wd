# GG Flow Automation

Tự động hóa việc tạo ảnh & video trên **Google Flow** ([labs.google/fx/vi/tools/flow](https://labs.google/fx/vi/tools/flow)) bằng Playwright.

Đọc dữ liệu scene từ file Excel → tự nhập prompt → generate ảnh/video → download kết quả.

## Yêu cầu

- Node.js >= 18
- npm

## Cài đặt

```bash
npm install
npx playwright install chromium
```

## Cách chạy

### 1. Login Google (lần đầu)

```bash
npm run login
```

Mở browser Chromium, đăng nhập tài khoản Google có quyền truy cập Google Flow. Session được lưu vào `./browser-data/` để dùng lại.

### 2. Chạy automation (CLI)

```bash
# Chạy toàn bộ scenes
npm start

# Resume từ progress đã lưu (bỏ qua scene đã hoàn thành)
npm run start:resume

# Chạy headless (không hiện browser)
npm run start:headless
```

**CLI options:**

| Option | Mô tả |
|--------|--------|
| `--scene <N>` | Chỉ chạy scene số N |
| `--start-from <N>` | Bắt đầu từ scene số N |
| `--end-at <N>` | Dừng tại scene số N |
| `--image-only` | Chỉ generate ảnh, bỏ qua video |
| `--video-only` | Chỉ generate video, bỏ qua ảnh |
| `--resume` | Tiếp tục từ progress đã lưu |
| `--headless` | Chạy browser ẩn |

Ví dụ:

```bash
# Chạy scene 3 đến 10, chỉ tạo ảnh
npx tsx src/index.ts --start-from 3 --end-at 10 --image-only

# Chạy lại scene 5
npx tsx src/index.ts --scene 5
```

### 3. Web UI

```bash
npm run serve
```

Mở trình duyệt tại `http://localhost:3001`. Web UI cho phép:

- Upload / import file Excel
- Xem danh sách scenes & characters
- Start / Stop automation
- Theo dõi logs & progress real-time (SSE)
- Xem & download output files (ảnh, video)

## Flow xử lý

```
Excel (Scenes + Characters)
  │
  ├─ 1. Login Google (session lưu trong browser-data/)
  │
  ├─ 2. Tạo project mới trên Google Flow
  │
  ├─ 3. Generate ref images (headshot cho từng character)
  │     → Giữ lại trong project làm reference
  │
  └─ 4. Xử lý từng scene:
        │
        ├─ STOCK → Bỏ qua
        │
        ├─ AI-IMG → Nhập image prompt
        │           → Attach character refs
        │           → Generate ảnh
        │           → Download PNG
        │
        └─ AI-VID → Nhập image prompt
                    → Attach character refs
                    → Generate ảnh (first frame)
                    → "Tạo ảnh động" (animate)
                    → Nhập video prompt
                    → Generate video
                    → Download MP4
```

## Cấu trúc Excel

File Excel cần có 2 sheet:

### Sheet "Scenes"

| Cột | Nội dung |
|-----|----------|
| 1 - Timeline | Thời gian (vd: `0:00 - 0:05`) |
| 2 - Cảnh | Số scene |
| 3 - Tên cảnh | Tên scene |
| 4 - Loại | `AI-IMG`, `AI-VID`, hoặc `STOCK` |
| 5 - Character | Tên nhân vật (phân cách bởi dấu phẩy) |
| 6 - Camera Angle | Góc quay |
| 7 - Camera Move | Chuyển động camera |
| 8 - Mood | Tâm trạng / tone |
| 9 - Duration | Thời lượng (giây) |
| 10 - Transition | Hiệu ứng chuyển cảnh |
| 11 - Pexels Key 1 | Từ khóa tìm stock 1 |
| 12 - Pexels Key 2 | Từ khóa tìm stock 2 |
| 13 - Image Prompt | Prompt tạo ảnh |
| 14 - First Frame | Prompt first frame (cho video) |
| 15 - Video Prompt | Prompt tạo video |
| 16 - Ref Char IDs | ID character reference |

### Sheet "Characters"

| Cột | Nội dung |
|-----|----------|
| 1 - ID | Mã nhân vật |
| 2 - Name | Tên nhân vật |
| 3 - Role | Vai trò |
| 4 - Anchor Text | Mô tả neo |
| 5 - Neg Constraints | Ràng buộc phủ định |
| 6 - Prompt Headshot | Prompt tạo ảnh headshot (ref) |
| 7 - Prompt Portrait | Prompt tạo ảnh portrait |
| 8 - Prompt Full Body | Prompt tạo ảnh toàn thân |

## Cấu hình (.env)

Tạo file `.env` ở thư mục gốc (tùy chọn):

```env
FLOW_URL=https://labs.google/fx/vi/tools/flow
EXCEL_PATH=./scene-data-new.xlsx
OUTPUT_DIR=./output
BROWSER_DATA_DIR=./browser-data
DELAY_BETWEEN_SCENES_MS=5000
IMAGE_GENERATION_TIMEOUT_MS=180000
VIDEO_GENERATION_TIMEOUT_MS=600000
RETRY_ATTEMPTS=3
PORT=3001
```

## Cấu trúc project

```
gg-flow/
├── src/
│   ├── index.ts              # CLI entry point
│   ├── engine.ts             # Automation engine chính
│   ├── config.ts             # Cấu hình (đọc từ .env)
│   ├── excel-reader.ts       # Đọc dữ liệu từ Excel
│   ├── flow-page.ts          # Page Object Model cho Google Flow
│   ├── image-generator.ts    # Generate & download ảnh
│   ├── video-generator.ts    # Generate & download video
│   ├── ref-generator.ts      # Generate character reference images
│   ├── browser.ts            # Khởi tạo Playwright browser
│   ├── retry.ts              # Retry logic
│   ├── progress-tracker.ts   # Lưu/đọc progress (progress.json)
│   ├── logger.ts             # Logger với SSE broadcast
│   └── web/
│       ├── server.ts          # HTTP server + SSE
│       └── api.ts             # API endpoints
├── public/
│   └── index.html             # Web UI
├── scripts/                   # Utility scripts (login, inspect, test)
├── output/                    # Ảnh & video đã generate
├── browser-data/              # Chromium session data
├── progress.json              # Trạng thái tiến trình
└── scene-data-new.xlsx        # File Excel dữ liệu scene
```

## Output

Kết quả được lưu vào `./output/`:

- Ảnh: `scene_01_0p05_img.png`
- Video: `scene_01_0p05_vid.mp4`
- Report: `report_2026-03-24T10-00-00.md`

## Retry & Resume

- Mỗi bước generate có **2 lần retry**, mỗi bước download có **3 lần retry**
- Progress được lưu vào `progress.json` sau mỗi scene
- Dùng `--resume` để bỏ qua scene đã hoàn thành và chạy lại scene lỗi

## Ảnh tham chiếu thật (cô dâu / chú rể)

Thay vì sinh headshot từ prompt, dự án có thể **upload ảnh thật** lên Flow rồi gắn đúng người vào từng shot:

1. Sheet `Characters`, cột 9 **"Ảnh tham chiếu (đường dẫn)"**: đường dẫn tới ảnh (tương đối so với thư mục chạy, hoặc tuyệt đối). Có giá trị ⇒ upload ảnh; để trống ⇒ cách cũ (sinh headshot từ cột "Prompt headshot").
2. Mỗi nhân vật một ảnh `.jpg/.jpeg/.png/.webp`, chính diện, rõ mặt (xem `wedding-video/photos/README.md`).
3. Ảnh được nhận diện trong popup "+" theo **nội dung** (dấu vân dHash), không theo vị trí; không chắc chắn thì **dừng**, không gắn bừa. Chi tiết: `src/ref-photos.ts`.

```bash
npm run test:upload-mock   # kiểm tra OFFLINE logic upload/nhận diện trên trang giả lập (không cần Flow)
npm run inspect:upload     # khảo sát popup "+" trên Flow thật, lưu ảnh chụp + HTML vào output/debug/
npm run test:upload -- ./wedding-video/excel/ngu-kiep.xlsx   # upload + gắn thử trên Flow thật, không tốn credit
```

Biến môi trường (`.env`, tùy chọn): `REF_HASH_STRONG_DIST` (mặc định 8), `REF_HASH_MAX_DIST` (20), `REF_HASH_MIN_MARGIN` (6), `REF_MATCH_MODE=position` (quay về cách gắn theo vị trí cũ).
