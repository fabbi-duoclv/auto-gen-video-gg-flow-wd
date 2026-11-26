# Tài liệu: Các trường trong file Excel export (scene-data.xlsx)

## Tổng quan

File Excel export chứa 1 sheet **"Scenes"**, mỗi dòng tương ứng với 1 scene trong video. Dữ liệu phục vụ 3 pipeline chính:

1. **Tìm ảnh/video stock** (STOCK) — qua Pexels
2. **Gen ảnh AI** (AI-IMG) — gen ảnh tĩnh cho scene
3. **Gen video AI** (AI-VID) — gen first frame → gen video qua Veo

---

## Danh sách các trường

### Thông tin chung về scene

| # | Cột | Mô tả |
|---|------|-------|
| 1 | **Timeline từ - đến** | Mốc thời gian bắt đầu và kết thúc của scene trong video |
| 2 | **Cảnh** | Số thứ tự scene |
| 3 | **Tên cảnh** | Tên ngắn gọn mô tả nội dung scene |
| 4 | **Loại** | Phương thức tạo hình ảnh: `STOCK`, `AI-IMG`, hoặc `AI-VID` |
| 5 | **Nhân vật** | Danh sách tên nhân vật xuất hiện trong scene (phân cách bằng dấu phẩy) |
| 6 | **Góc máy** | Loại góc quay (close-up, wide shot, medium shot...) |
| 7 | **Chuyển động camera** | Mô tả chuyển động camera (pan, zoom, static...) |
| 8 | **Mood** | Tông màu/cảm xúc của scene |
| 9 | **Thời lượng (giây)** | Thời lượng scene tính bằng giây |
| 10 | **Chuyển cảnh** | Kiểu chuyển cảnh sang scene tiếp theo (fade, cut, dissolve...) |

### Prompt tìm stock (dùng khi Loại = STOCK)

| # | Cột | Mô tả |
|---|------|-------|
| 11 | **Pexels keyword chính** | Từ khóa chính để tìm ảnh/video stock trên Pexels |
| 12 | **Pexels keyword phụ** | Từ khóa dự phòng nếu keyword chính không tìm thấy kết quả |

### Prompt gen ảnh và video

| # | Cột | Mô tả |
|---|------|-------|
| 13 | **Prompt ảnh** | Prompt để gen ảnh tĩnh cho scene (dùng khi Loại = `AI-IMG`) |
| 14 | **Prompt first frame** | Prompt để gen ảnh khung hình đầu tiên của video (dùng khi Loại = `AI-VID`) |
| 15 | **Prompt Veo** | Prompt để gen video bằng Google Veo (dùng khi Loại = `AI-VID`) |

### Thông tin nhân vật reference

| # | Cột | Mô tả |
|---|------|-------|
| 16 | **Reference character ids** | Danh sách ID reference của nhân vật được gắn vào request gen video Veo |
| 17 | **Ref character id** | ID của từng nhân vật có mặt trong scene |
| 18 | **Ref character name** | Tên nhân vật |
| 19 | **Ref character role** | Vai trò của nhân vật (nhân vật chính, phụ...) |
| 20 | **Ref character anchorText** | Mô tả neo ngoại hình nhân vật — được prepend vào prompt Veo để Veo nhận diện nhân vật |
| 21 | **Ref negativeConstraints** | Ràng buộc phủ định — những đặc điểm KHÔNG được xuất hiện khi gen ảnh nhân vật |
| 22 | **Ref prompt headshot** | Prompt gen ảnh reference chân dung cận mặt (headshot) |
| 23 | **Ref prompt portrait34** | Prompt gen ảnh reference chân dung 3/4 |
| 24 | **Ref prompt fullBody** | Prompt gen ảnh reference toàn thân |

> Các trường "Ref ..." chứa thông tin của **tất cả nhân vật** có mặt trong scene, phân cách bằng xuống dòng.

---

## Pipeline gen hình ảnh và video

### Pipeline 1: Tìm stock (Loại = STOCK)

```
Pexels keyword chính / phụ
        │
        ▼
  Tìm trên Pexels → Ảnh/video stock
```

Không dùng AI, chỉ tìm kiếm trên Pexels bằng keyword.

---

### Pipeline 2: Gen ảnh AI (Loại = AI-IMG)

```
                    Prompt ảnh
                        │
                        ▼
              ┌─── Tối ưu prompt ◄──── Ref negativeConstraints
              │         │                (loại bỏ đặc điểm sai)
              │         ▼
              │    Gen ảnh tĩnh ◄──── Ảnh reference nhân vật
              │         │              (gen từ Ref prompt headshot/portrait34/fullBody)
              │         ▼
              └──► Ảnh scene hoàn chỉnh
```

**Các trường được sử dụng:**

| Trường | Cách dùng |
|--------|-----------|
| **Prompt ảnh** | Prompt gốc đưa vào model gen ảnh |
| **Nhân vật** | Xác định nhân vật nào có mặt → lấy reference tương ứng |
| **Ref negativeConstraints** | Thêm vào prompt để tránh gen sai đặc điểm nhân vật |
| **Ref prompt headshot/portrait34/fullBody** | Đã dùng trước đó để gen ảnh reference, ảnh ref này được đính kèm vào request gen ảnh scene để đảm bảo nhân vật nhất quán |

---

### Pipeline 3: Gen video AI (Loại = AI-VID)

Gồm 2 bước: **gen first frame** → **gen video**.

#### Bước 1: Gen ảnh first frame

```
              Prompt first frame
                      │
                      ▼
            ┌─── Tối ưu prompt ◄──── Ref negativeConstraints
            │         │
            │         ▼
            │   Gen ảnh first frame ◄──── Ảnh reference nhân vật
            │         │
            │         ▼
            └──► Ảnh first frame
```

**Các trường được sử dụng:**

| Trường | Cách dùng |
|--------|-----------|
| **Prompt first frame** | Prompt gốc để gen ảnh khung hình đầu tiên |
| **Nhân vật** | Xác định nhân vật → lấy reference |
| **Ref negativeConstraints** | Tránh gen sai đặc điểm |
| **Ảnh reference nhân vật** | Đính kèm để nhân vật nhất quán |

#### Bước 2: Gen video bằng Veo

```
    Ref character anchorText ──► Prepend vào prompt
                                       │
                                       ▼
                               Prompt Veo (đã gắn anchorText)
                                       │
                                       ▼
                                  Gen video Veo ◄──── Ảnh first frame (từ bước 1)
                                       │         ◄──── Ảnh reference nhân vật
                                       │               (qua Reference character ids)
                                       ▼
                                  Video hoàn chỉnh
```

**Các trường được sử dụng:**

| Trường | Cách dùng |
|--------|-----------|
| **Prompt Veo** | Prompt gốc mô tả hành động/chuyển động trong video |
| **Ref character anchorText** | Được gắn vào đầu prompt Veo để Veo nhận diện nhân vật qua mô tả text |
| **Reference character ids** | ID reference để Veo nhận ảnh reference nhân vật |
| **Ảnh first frame** | Ảnh khung hình đầu tiên — Veo dùng làm điểm khởi đầu cho video |
| **Ảnh reference nhân vật** | Đính kèm để nhân vật trong video nhất quán với reference |

---

## Tóm tắt: Trường nào dùng ở pipeline nào?

| Trường | STOCK | AI-IMG | AI-VID (first frame) | AI-VID (video) |
|--------|:-----:|:------:|:--------------------:|:--------------:|
| Pexels keyword chính/phụ | x | | | |
| Prompt ảnh | | x | | |
| Prompt first frame | | | x | |
| Prompt Veo | | | | x |
| Nhân vật | | x | x | x |
| Ref negativeConstraints | | x | x | |
| Ref character anchorText | | | | x |
| Reference character ids | | | | x |
| Ref prompt headshot/portrait34/fullBody | | x (*) | x (*) | x (*) |

> (*) Các ref prompt được dùng ở bước trước để **gen ảnh reference nhân vật**. Ảnh reference đó sau đó được đính kèm vào các request gen ảnh scene / first frame / video.
