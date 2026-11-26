# GG Flow Automation - Rebuild Specification

## 1) Muc tieu app

App tu dong hoa quy trinh tao anh va video trong Google Flow (`https://labs.google/fx/vi/tools/flow`) bang Playwright.

- Input: file Excel scene breakdown.
- Output: anh/video theo tung scene luu vao local.
- Co 2 cach chay: CLI va Web UI.

## 2) Bai toan nghiep vu

1. Doc danh sach scene tu Excel.
2. Truoc khi chay scene: tao anh reference nhan vat (headshot) cho toan bo nhan vat unique.
3. Chay tung scene theo type:
- `STOCK`: bo qua (khong gen AI).
- `AI-IMG`: gen anh scene tu image prompt + attach reference nhan vat.
- `AI-VID`: gen first-frame image truoc, sau do "Tao anh dong" thanh video + video prompt + references.
4. Download media theo naming convention.
5. Luu tien do vao `progress.json` de co the resume.

## 3) Input/Output contract

### Input chinh

- Excel mac dinh: `scene-data-new.xlsx`.
- Doc worksheet dau tien.
- Cot quan trong:
  - 1: Timeline
  - 2: Scene number
  - 3: Scene name
  - 4: Type (`STOCK` | `AI-IMG` | `AI-VID`)
  - 5: Character names (csv)
  - 13: Image prompt
  - 14: First-frame prompt
  - 15: Video prompt
  - 16..24: reference character data

### Parse rules

- `sceneNumber` pad 2 chu so (`1 -> 01`).
- `endTime` trich tu timeline cuoi:
  - `"00:00 - 03:01"` -> `"3p01"`.
- `AI-VID`:
  - prompt anh uu tien cot 14, fallback cot 13.
- `AI-IMG`:
  - prompt anh uu tien cot 13, fallback cot 14.
- Scene AI ma khong co prompt hop le thi skip.

### Output files

- Anh: `output/scene_{sceneNumber}_{endTime}_img.png`
- Video: `output/scene_{sceneNumber}_{endTime}_vid.mp4`

## 4) Luong engine (core automation)

### Giai doan chuan bi

1. Launch Chromium persistent context de giu session Google.
2. Mo Flow URL, neu chua login thi cho login tay.
3. Tao project moi.
4. Configure model ban dau (ratio/count).

### Step 0: Tao reference nhan vat

1. Doc toan bo character unique tu Excel.
2. Voi moi character co `promptHeadshot`:
  - Gen headshot trong project (khong download).
  - Luu map `characterName -> index` (0-based, theo thu tu da gen).
3. Map nay duoc dung de attach references khi gen scene.

### Step 1: Chay scene theo type

1. Loc scene theo config:
  - `--scene`
  - `--start-from`
  - `--end-at`
  - `--image-only`
  - `--video-only`
  - `--resume`
2. Neu `STOCK`: danh dau complete va skip.
3. Neu AI scene:
  - Tim ref indices theo `characterNames`.
  - Gen anh (neu can):
    - set image mode 16:9 x1
    - attach refs
    - nhap prompt
    - generate
    - wait complete
    - download image
  - Gen video (chi `AI-VID`, neu can):
    - right-click image moi nhat -> `Tao anh dong`
    - set video mode 16:9 x1
    - attach refs
    - nhap video prompt
    - generate
    - wait complete
    - download video
4. Delay giua scenes (mac dinh 5 giay).

## 5) Retry, resume, state machine

### Retry behavior

- Retry generation anh/video: 2 lan.
- Retry download: theo `RETRY_ATTEMPTS` (mac dinh 3), khong gen lai.
- Video retry: neu fail thi quay lai project URL roi thu lai.

### Resume behavior

- `progress.json` luu theo scene:
  - `imageGenerated`, `imagePath`
  - `videoGenerated`, `videoPath`
  - `error`
- `--resume`:
  - scene complete thi skip
  - image done thi skip buoc image
  - video done thi skip buoc video

### Engine states

- `idle`
- `running`
- `stopping`

Abort la soft-stop: dung sau buoc hien tai.

## 6) UI automation details (Google Flow)

### Selectors/hanh vi chinh

- Prompt input: `div[role="textbox"][data-slate-editor="true"]`
- Generate button:
  - uu tien icon `arrow_forward`
  - fallback text `Tao`
- New project button: `Du an moi`
- Attach reference:
  - click nut `add_2`
  - doi dialog open
  - click `div[tabindex="0"]` theo index
- Tao video:
  - right-click image moi nhat
  - click menu `Tao anh dong`
- Download:
  - right-click media
  - click `Tai xuong`
  - chon resolution free tot nhat (khong chon option co `Nang cap`)

### Detect generation status

- Fail signal: co text `Khong thanh cong`.
- Image done: so content images tang.
- Video done:
  - uu tien so visible videos tang
  - fallback: so content images tang.

## 7) Web app architecture

### Frontend functions (single page)

- Login Google.
- Load scenes.
- Chon/deselect scene.
- Edit image/video prompt theo scene.
- Start/Stop run.
- Xem live logs.
- Xem progress bars theo scene.
- Xem gallery output (image/video preview + modal).

### Backend API

- `GET /api/scenes`
- `POST /api/scenes/:id`
- `POST /api/start`
- `POST /api/stop`
- `GET /api/status`
- `POST /api/login`
- `GET /api/output`
- `GET /api/output/:filename`
- `GET /api/events` (SSE)

### SSE events

- `log`
- `progress`
- `state`
- `run-complete`
- `engine-error`

Co heartbeat keepalive 15s.

## 8) CLI contract

- `npm run login`
- `npm start`
- `npm start -- --scene 01`
- `npm start -- --start-from 01 --end-at 04`
- `npm start -- --image-only`
- `npm start -- --video-only`
- `npm start -- --resume`
- `npm start -- --headless`

## 9) ENV config

- `FLOW_URL`
- `EXCEL_PATH`
- `OUTPUT_DIR`
- `BROWSER_DATA_DIR`
- `DELAY_BETWEEN_SCENES_MS`
- `IMAGE_GENERATION_TIMEOUT_MS`
- `VIDEO_GENERATION_TIMEOUT_MS`
- `RETRY_ATTEMPTS`

## 10) Tech stack va module boundaries

- Runtime: Node.js + TypeScript (ESM)
- Automation: Playwright
- Excel parser: `exceljs`
- CLI args: `commander`
- Web server: Node `http` module
- Logging: custom logger + SSE bridge

### Module decomposition de rebuild

- `config`: env + constants + excel columns map
- `excel-reader`: parse scenes + parse characters
- `browser`: launch persistent playwright context
- `flow-page`: page object model cho Google Flow
- `ref-generator`: tao references va map indices
- `image-generator`: image pipeline + retry
- `video-generator`: video pipeline + retry
- `progress-tracker`: doc/ghi `progress.json`
- `engine`: orchestration + state + events
- `web/api`: REST handlers
- `web/server`: static + api + sse

## 11) Critical rebuild requirements

1. Bat buoc dung persistent profile de giu login Google.
2. Bat buoc chay ref generation truoc scene generation.
3. `AI-VID` bat buoc la 2-step: first-frame image -> animate video.
4. Download media qua context menu va pick resolution free.
5. Co progress file de resume granularity theo image/video.
6. Co SSE realtime cho log/progress/state.
7. Ten file output phai dung convention scene + endTime + media type.

## 12) As-is behavior notes (quan trong khi clone dung hien trang)

1. Prompt override tu Web UI dang luu in-memory, nhung hien tai chua apply vao luong engine thuc thi.
2. `anchorText`, `negativeConstraints`, `refCharIds` da parse tu Excel nhung chua duoc compose day du vao runtime prompts.
3. `isSceneComplete` dang yeu cau ca image + video deu done, co the khong phu hop voi scene chi anh (`AI-IMG`) neu muon resume chinh xac theo type.

