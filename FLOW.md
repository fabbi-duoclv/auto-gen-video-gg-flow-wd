# GG Flow Automation — Flow & Cấu trúc dự án

## Tổng quan

Tự động hóa gen ảnh và video trên Google Flow (labs.google/fx/vi/tools/flow) bằng Playwright. Đọc danh sách scene từ Excel, gen ảnh reference nhân vật, sau đó gen ảnh/video cho từng scene theo type.

---

## Flow tự động

### Bước 0: Gen ảnh reference nhân vật

Trước khi gen bất kỳ scene nào, cần gen ảnh reference cho **tất cả nhân vật** trong phim.

```
Đọc Excel → Lấy danh sách nhân vật unique
  → Với mỗi nhân vật:
     - Dùng prompt headshot (cột 22) → Gen ảnh reference
     - Lưu vào project Google Flow
```

Ảnh ref được dùng chung cho tất cả scene để giữ nhân vật nhất quán.

### Bước 1: Xử lý từng scene theo TYPE

```
Đọc Excel → Từng scene:

  TYPE = STOCK → Bỏ qua (không gen AI)

  TYPE = AI-IMG → Gen ảnh tĩnh:
    ┌─────────────────────────────────────────────────┐
    │ 1. Nhập prompt ảnh (cột 13)                     │
    │ 2. Đính kèm ảnh ref nhân vật có trong scene     │
    │ 3. Click Generate → Chờ → Download 2K           │
    │ Output: scene_XX_XpXX_img.png                   │
    └─────────────────────────────────────────────────┘

  TYPE = AI-VID → Gen ảnh first frame + video:
    ┌─────────────────────────────────────────────────┐
    │ Bước 1: Gen ảnh first frame                     │
    │   1. Nhập prompt first frame (cột 14)           │
    │   2. Đính kèm ảnh ref nhân vật có trong scene   │
    │   3. Click Generate → Chờ → Download 2K         │
    │   Output: scene_XX_XpXX_img.png                 │
    ├─────────────────────────────────────────────────┤
    │ Bước 2: Gen video                               │
    │   1. Right-click ảnh → "Tạo ảnh động"           │
    │      (ảnh first frame tự gắn vào tab "Bắt đầu")│
    │   2. Đính kèm ảnh ref nhân vật có trong scene   │
    │   3. Nhập prompt Veo (cột 15)                   │
    │   4. Click Generate → Chờ → Download 1080p      │
    │   Output: scene_XX_XpXX_vid.mp4                 │
    └─────────────────────────────────────────────────┘
```

### Xác định nhân vật nào đính kèm

Mỗi scene có cột 5 (Nhân vật) liệt kê tên nhân vật có mặt. Kết hợp với cột 16-18 (Reference character ids/id/name) để biết cần đính kèm ảnh ref nào.

---

## Cấu trúc Excel (scene-data-new.xlsx)

| Cột | Tên | Dùng cho |
|-----|-----|----------|
| 1 | Timeline từ - đến | Tên file output (lấy thời gian kết thúc) |
| 2 | Cảnh | Số thứ tự scene |
| 3 | Tên cảnh | Hiển thị log |
| 4 | **Loại** | `STOCK` / `AI-IMG` / `AI-VID` — quyết định pipeline |
| 5 | **Nhân vật** | Xác định ảnh ref nào cần đính kèm |
| 6 | Góc máy | — |
| 7 | Chuyển động camera | — |
| 8 | Mood | — |
| 9 | Thời lượng (giây) | — |
| 10 | Chuyển cảnh | — |
| 11 | Pexels keyword chính | STOCK |
| 12 | Pexels keyword phụ | STOCK |
| 13 | **Prompt ảnh** | AI-IMG: prompt gen ảnh |
| 14 | **Prompt first frame** | AI-VID: prompt gen ảnh first frame |
| 15 | **Prompt Veo** | AI-VID: prompt gen video |
| 16 | **Reference character ids** | ID nhân vật ref trong scene |
| 17 | Ref character id | ID từng nhân vật |
| 18 | Ref character name | Tên nhân vật |
| 19 | Ref character role | Vai trò |
| 20 | Ref character anchorText | Mô tả ngoại hình (prepend vào prompt Veo) |
| 21 | Ref negativeConstraints | Ràng buộc phủ định |
| 22 | **Ref prompt headshot** | Prompt gen ảnh ref nhân vật |
| 23 | Ref prompt portrait34 | Prompt gen ảnh ref 3/4 |
| 24 | Ref prompt fullBody | Prompt gen ảnh ref toàn thân |

---

## Cấu trúc dự án

```
d:\DEV\1000h\gg-flow\
├── .env                        # Config (Excel path, timeouts...)
├── package.json
├── tsconfig.json
├── scene-data-new.xlsx         # Input Excel
├── excel-export-fields.md      # Tài liệu mô tả cột Excel
├── FLOW.md                     # File này
│
├── src/
│   ├── index.ts                # CLI entry point
│   ├── engine.ts               # AutomationEngine (core logic)
│   ├── config.ts               # Config (cột Excel, timeout, URL...)
│   ├── excel-reader.ts         # Đọc Excel → SceneData[]
│   ├── browser.ts              # Playwright persistent context
│   ├── flow-page.ts            # Page Object Model cho Google Flow
│   ├── image-generator.ts      # Gen ảnh + retry
│   ├── video-generator.ts      # Gen video + retry
│   ├── progress-tracker.ts     # Resume capability (progress.json)
│   ├── retry.ts                # Retry utility
│   ├── logger.ts               # Logger + SSE listener
│   └── web/
│       ├── server.ts           # HTTP server + SSE (port 3001)
│       └── api.ts              # REST API handlers
│
├── public/
│   └── index.html              # Web UI dashboard
│
├── scripts/
│   └── login.ts                # Login Google (1 lần)
│
├── output/                     # Ảnh + video output
│   ├── scene_01_3p01_img.png
│   ├── scene_01_3p01_vid.mp4
│   └── ...
│
├── browser-profile/            # Session Google đăng nhập
└── progress.json               # Tiến độ (hỗ trợ --resume)
```

---

## Cách sử dụng

### CLI

```bash
npm run login                              # Login Google (1 lần)
npm start                                  # Chạy tất cả AI-VID scenes
npm start -- --scene 01                    # 1 scene
npm start -- --start-from 01 --end-at 04   # Range
npm start -- --image-only                  # Chỉ gen ảnh
npm start -- --resume                      # Tiếp tục scene đã fail
```

### Web UI

```bash
npm run serve                              # Mở http://localhost:3001
```

Tính năng Web UI:
- Login Google
- Chọn scene, edit prompt
- Start/Stop automation
- Live log + progress bar
- Xem ảnh/video đã download

---

## Retry & Error handling

| Lỗi | Xử lý |
|-----|-------|
| Gen ảnh/video fail | Retry 2 lần, skip nếu vẫn fail |
| Download fail | Retry 3 lần (không gen lại) |
| Session hết hạn | Pause, chờ login thủ công |
| Prompt bị chặn | Retry 2 lần, log lại, tiếp scene sau |

---

## Tên file output

Format: `scene_{số cảnh}_{phút}p{giây kết thúc}_{loại}.{ext}`

Ví dụ:
- `scene_01_3p01_img.png` — Ảnh scene 1, kết thúc lúc 3:01
- `scene_01_3p01_vid.mp4` — Video scene 1
- `scene_02_8p10_img.png` — Ảnh scene 2, kết thúc lúc 8:10
