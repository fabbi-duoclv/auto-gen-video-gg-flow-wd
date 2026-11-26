# Bộ câu lệnh từng shot: làm lại hai video mẫu bằng Google Flow và Seedance

> Ngày: 2026-11-26. Bổ sung cho `phan-tich-va-quy-trinh.md` cùng thư mục. Bộ này sinh từ một nguồn dữ liệu nên các khối dùng chung (mục 2) luôn khớp với từng shot.
> Phạm vi: chỉ **câu lệnh để ra video**. Bản quyền nhạc/ảnh, giá, tích hợp vào sản phẩm: để sau.

## 0. Ba điều phải biết trước khi chạy

1. **Seedance không nhận ảnh có gương mặt người thật theo cách thông thường.** Tài liệu BytePlus ModelArk (qua kết quả tìm kiếm; tôi **không đọc được trang gốc** vì môi trường chặn tên miền) nói dòng Seedance 2.5 và 2.0 *không hỗ trợ tải trực tiếp ảnh/video tham chiếu chứa gương mặt người thật*; đường chính thức là quy trình **xác minh người thật và đăng ký tài sản chân dung** (người trong ảnh phải ủy quyền). Dreamina hiện ghi "Real human faces are not supported". Hệ quả: shot **thấy mặt** nên làm ở Flow (hoặc Kling), shot **không thấy mặt** (nhìn từ sau, bàn tay, vật chèn, người rất nhỏ) có thể đưa Seedance. Tôi **không** soạn cách lách bộ lọc này; nếu muốn Seedance làm shot thấy mặt, đi theo quy trình xác minh chính thức (chưa đọc được các bước, cần kiểm trên tài liệu BytePlus).
2. **Flow (Veo 3.1)**: có "Frames to Video" (ảnh đầu/ảnh cuối) và "Ingredients to Video" (ảnh tham chiếu). Bài hướng dẫn cũ của Google nói tối đa **3 ingredient** mỗi lần, chưa xác nhận được con số hiện tại; Google khuyên tạo ảnh ingredient bằng **Nano Banana Pro**. Thời lượng clip trong giao diện Flow tôi chưa xác nhận được (Google Vids ghi 8 giây). Tên nút và giới hạn có thể đã đổi, hãy đối chiếu giao diện thật.
3. **Cách an toàn nhất: ảnh tĩnh trước, động hóa sau.** Mọi shot đều làm 2 bước: (a) sinh **ảnh tĩnh** của cặp đôi từ ảnh tham chiếu (khóa gương mặt, kiểm bằng mắt), (b) đưa ảnh tĩnh đó làm khung đầu rồi chạy **câu lệnh chuyển động**. Như vậy video chỉ phải "làm động" chứ không phải "nhớ mặt", nên ít trôi mặt hơn và không vướng giới hạn 3 ingredient.

## 1. Thao tác theo từng công cụ

### Chuẩn bị ảnh đầu vào
- Mỗi người 2–4 ảnh: chính diện, hơi nghiêng 3/4, thấy rõ tóc, mặt chiếm ≥ 1/3 khung, ánh sáng đều, không kính râm, không filter làm mịn nặng.
- Đặt tên rõ: `co-dau-1.jpg`, `co-dau-2.jpg`, `chu-re-1.jpg`, `chu-re-2.jpg`. Ảnh chung hai người **không** dùng làm tham chiếu chính (dễ lẫn người).

### Google Flow
1. **Ảnh tĩnh:** tạo ảnh bằng Nano Banana Pro (trong Flow hoặc Gemini), tỉ lệ **16:9** (như mẫu) hoặc **9:16** nếu phát dọc. **Chỉ đính kèm ảnh của những người xuất hiện trong shot** (shot một người: một ảnh tốt nhất của người đó; shot hai người: ảnh cô dâu + ảnh chú rể) và, từ shot thứ hai của mỗi bộ/chương, **thêm ảnh gốc rộng đã duyệt của bộ đó** làm ảnh tham chiếu thứ ba. Câu lệnh nhận diện người bằng giới ("the woman", "the man") nên không phụ thuộc thứ tự ảnh. Dán câu lệnh *Ảnh tĩnh* của shot. **Làm shot rộng của mỗi bộ trước**, duyệt, rồi mới làm các shot còn lại.
2. **Động hóa:** chọn *Frames to Video*, **Start frame = ảnh tĩnh** vừa duyệt, dán câu lệnh *Chuyển động* + dòng âm thanh: `Audio: soft ambient sound only, no music, no speech.` (nhạc thêm ở khâu dựng).
3. Sinh **2–3 phương án**, chọn bản đẹp nhất, cắt đúng độ dài ở cột "dùng".

### Seedance (Dreamina / BytePlus)
1. Chỉ dùng cho shot **mặt: không** (xem mục 0.1) trừ khi đã qua xác minh chân dung.
2. Đưa ảnh tĩnh (từ Flow/Nano Banana Pro) vào làm `@Image1`. Các hướng dẫn thứ ba đều nói nên ghi rõ vai trò của ảnh trong câu lệnh, và **thứ tự tải ảnh phải khớp số @ImageN**.
3. Dán: `@Image1 as the first frame. ` + câu lệnh *Chuyển động*. Thời lượng ngắn nhất có thể (4–5 giây), tỉ lệ khớp ảnh, tắt âm thanh nếu có tùy chọn.

### Bảng chọn công cụ theo shot

| Shot | Flow (Frames to Video) | Seedance |
|---|---|---|
| Thấy mặt | **Nên dùng** | Chỉ sau khi xác minh chân dung chính thức |
| Không thấy mặt / người rất nhỏ / bàn tay / vật chèn | Dùng được | Dùng được (`@Image1 as the first frame`) |

## 2. Khối dùng chung (đã được ghép sẵn vào từng shot bên dưới)

Câu lệnh ảnh tĩnh = **LOCK** (đổi theo người xuất hiện) + **STYLE** của chương/bộ + **SCENE** + **đuôi ảnh** (đổi theo cỡ cảnh). Câu lệnh chuyển động = **MOTION** + **đuôi chuyển động** (có mốc thời gian). Mỗi shot bên dưới đã ghép sẵn, chỉ việc sao chép.

**LOCK theo trường hợp** (sinh tự động, ghi ở đây để bạn viết thêm shot mới):

| Trường hợp | LOCK |
|---|---|
| Chỉ thấy mặt cô dâu | `Cinematic wedding film still. Only the bride's face is visible: she is the woman in the reference photo; keep her face, skin tone and hair color exactly identical to it. If a master-shot image of this set is attached too, keep its outfits, location and color grade.` |
| Chỉ thấy mặt chú rể | `Cinematic wedding film still. Only the groom's face is visible: he is the man in the reference photo; keep his face, skin tone and hair color exactly identical to it. If a master-shot image of this set is attached too, keep its outfits, location and color grade.` |
| Thấy mặt cả hai | `Cinematic wedding film still. Both faces are visible: the bride is the woman and the groom is the man in the reference photos; keep both faces, skin tone and hair color exactly identical to the references. If a master-shot image of this set is attached too, keep its outfits, location and color grade.` |
| Không thấy mặt (nhìn từ sau, người rất nhỏ) | `Cinematic wedding film still. No faces are visible; the people are the bride and the groom from the reference photos: keep hair color, skin tone and body build consistent with the references. If a master-shot image of this set is attached too, keep its outfits, location and color grade.` |
| Cảnh chèn bàn tay | `Cinematic macro still, no faces visible. The hands are the bride's and the groom's, from the reference photos: keep skin tone and the outfit sleeves consistent with them. If a master-shot image of this set is attached too, keep its outfits, location and color grade.` |
| Vật chèn, không người | `Cinematic still life, no people.` |

**Đuôi ảnh:** cảnh rộng dùng `deep focus with everything sharp`, cảnh vừa/cận dùng `shallow depth of field`, cảnh chèn dùng `macro, shallow focus`.

**Đuôi chuyển động:** `The key action happens within the first N seconds, then the movement settles.` (N tính từ độ dài dùng, vì bản cắt chỉ lấy 0,4–3,5 giây đầu của clip 4–5 giây) + `Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.` Nếu giao diện có ô *negative prompt*, đưa phần `no morphing, no text, no cuts` vào đó (chưa xác nhận Flow có ô này).

**Thay đổi để ra phim dọc 9:16:** đổi tỉ lệ ở bước sinh ảnh và sinh video; thêm `vertical 9:16 framing, subject centered` vào cuối câu lệnh ảnh. Các shot rộng có người nhỏ cần kiểm lại bố cục.

---

# MẪU A · "Năm kiếp" (≈ 52 giây, 5 thẻ chương + 40 shot)

Thời điểm ghi ở mỗi shot là vị trí trong video mẫu (giây), dùng để giữ nhịp. "Dùng" là độ dài nên giữ trong bản cắt cuối. Cốt truyện: cùng một cặp đôi tái sinh qua 5 thời đại; mỗi chương kết ở khoảnh khắc gặp/ôm/trao.

## A.0 Thẻ chương (5 lần, không cần ảnh cặp đôi)

Sinh **một clip nền khói** rồi dùng lại 5 lần. Chữ nên chèn ở khâu dựng (mô hình video viết chữ hay sai).
```text
Pure black background. A dense white ink-smoke cloud swells slowly in the center of the frame, then disperses into fine floating particles, macro, soft, centered, no text, no watermark.
```

Chèn chữ: serif có chân (Cinzel / Playfair / Noto Serif), màu trắng, hiện dần khi khói tan, hòa trộn `screen` với nền khói. Dài ~1,3 giây.

| Chương | Vị trí trong mẫu | Chữ |
|---|---|---|
| 1 | 0,0–1,2 s | `1st Life: Warring-States Period` |
| 2 | 14,4–15,6 s | `2nd Life: Tang Dynasty` |
| 3 | 27,5–28,8 s | `3rd Life: Song Dynasty` |
| 4 | 35,5–36,8 s | `4th Life: Republican-Era China` |
| 5 | 43,0–44,5 s | `5th Life: Modern-Day` |

## A.1 Chương 1 · Chiến Quốc

**STYLE của chương** (đã ghép sẵn vào các shot dưới):
```text
Ancient China, Warring States era. Bride in a flowing crimson hanfu with gold hair ornaments; groom in black lacquered scale armor with gold studs. Grey brick city wall, overcast cold daylight, desaturated cool grey with vivid crimson accents, anamorphic cinematic look, fine film grain.
```

### A1.01 · dùng 1,7 s · rộng, nhìn từ sau · mặt: không
*Vị trí trong mẫu: 1,2–2,9 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. No face is visible; the person is the bride (the woman in the reference photo): keep her hair color, skin tone and body build consistent with it. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Ancient China, Warring States era. Bride in a flowing crimson hanfu with gold hair ornaments; groom in black lacquered scale armor with gold studs. Grey brick city wall, overcast cold daylight, desaturated cool grey with vivid crimson accents, anamorphic cinematic look, fine film grain. Wide low-angle back view of the bride standing on top of the city wall, long crimson ribbons and cloak streaming in the wind, small figure against a pale sky. Photorealistic, deep focus with everything sharp, natural skin texture, no text, no watermark.
```

Chuyển động:
```text
Low-angle static camera with a slow upward tilt. The long red ribbons whip and flow strongly in the wind; the bride stays still with her back to the camera. The key action happens within the first 2 seconds, then the movement settles. Outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### A1.02 · dùng 1,4 s · rộng · mặt: không
*Vị trí trong mẫu: 2,9–4,3 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. No faces are visible; the people are the bride and the groom from the reference photos: keep hair color, skin tone and body build consistent with the references. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Ancient China, Warring States era. Bride in a flowing crimson hanfu with gold hair ornaments; groom in black lacquered scale armor with gold studs. Grey brick city wall, overcast cold daylight, desaturated cool grey with vivid crimson accents, anamorphic cinematic look, fine film grain. Wide shot, the couple stand apart in a grey brick wall corridor, the bride in red and the groom in black armor, tiny figures, a few red petals drifting in the air, the wall receding in depth. Photorealistic, deep focus with everything sharp, natural skin texture, no text, no watermark.
```

Chuyển động:
```text
Slow push-in. The bride's sleeves drift in the wind, the groom stands motionless, a few petals blow past. The key action happens within the first 2 seconds, then the movement settles. Outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### A1.03 · dùng 1,4 s · vừa-cận · mặt: có
*Vị trí trong mẫu: 4,3–5,7 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Only the bride's face is visible: she is the woman in the reference photo; keep her face, skin tone and hair color exactly identical to it. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Ancient China, Warring States era. Bride in a flowing crimson hanfu with gold hair ornaments; groom in black lacquered scale armor with gold studs. Grey brick city wall, overcast cold daylight, desaturated cool grey with vivid crimson accents, anamorphic cinematic look, fine film grain. Medium close-up of the bride smiling softly, holding a branch of red plum blossoms near her face; the groom's black-armored shoulder soft-focus in the foreground. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Static camera with a slight handheld sway. She turns her gaze toward the groom and her smile widens slightly; the blossoms sway gently. The key action happens within the first 2 seconds, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### A1.04 · dùng 3,5 s · vừa-rộng, shot anh hùng · mặt: có
*Vị trí trong mẫu: 5,7–9,2 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Both faces are visible: the bride is the woman and the groom is the man in the reference photos; keep both faces, skin tone and hair color exactly identical to the references. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Ancient China, Warring States era. Bride in a flowing crimson hanfu with gold hair ornaments; groom in black lacquered scale armor with gold studs. Grey brick city wall, overcast cold daylight, desaturated cool grey with vivid crimson accents, anamorphic cinematic look, fine film grain. Medium-wide shot in a grey brick corridor: the bride in a long crimson cloak holds a plum blossom branch, the groom in black armor stands facing her. Photorealistic, deep focus with everything sharp, natural skin texture, no text, no watermark.
```

Chuyển động:
```text
Slow orbit around the couple. The bride spins slowly, her crimson cloak flaring and swirling; plum blossoms drift; the groom stays still. The key action happens within the first 4 seconds, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### A1.05 · dùng 1 s · cận · mặt: có
*Vị trí trong mẫu: 9,2–10,2 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Only the groom's face is visible: he is the man in the reference photo; keep his face, skin tone and hair color exactly identical to it. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Ancient China, Warring States era. Bride in a flowing crimson hanfu with gold hair ornaments; groom in black lacquered scale armor with gold studs. Grey brick city wall, overcast cold daylight, desaturated cool grey with vivid crimson accents, anamorphic cinematic look, fine film grain. Close-up of the groom in black armor with gold studs, serious yet tender gaze to the side, shallow depth of field. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Slow push-in. He lowers his gaze and then looks up; a faint breeze moves his hair. The key action happens within the first 2 seconds, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### A1.06 · dùng 1 s · cảnh chèn bàn tay · mặt: không
*Vị trí trong mẫu: 10,2–11,2 s*

Ảnh tĩnh:
```text
Cinematic macro still, no faces visible. The hands are the bride's and the groom's, from the reference photos: keep skin tone and the outfit sleeves consistent with them. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Ancient China, Warring States era. Bride in a flowing crimson hanfu with gold hair ornaments; groom in black lacquered scale armor with gold studs. Grey brick city wall, overcast cold daylight, desaturated cool grey with vivid crimson accents, anamorphic cinematic look, fine film grain. Macro insert: his gloved hands gently place a small jade bead bracelet onto her hand, her red embroidered sleeve in frame, shallow focus, no faces. Photorealistic macro, shallow focus, no text, no watermark.
```

Chuyển động:
```text
Static macro. His fingers slide the bead onto her wrist and settle; her fingers curl gently. The key action happens within the first 2 seconds, then the movement settles. No text, no cuts.
```

### A1.07 · dùng 0,7 s · chân dung · mặt: có
*Vị trí trong mẫu: 11,2–11,9 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Only the bride's face is visible: she is the woman in the reference photo; keep her face, skin tone and hair color exactly identical to it. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Ancient China, Warring States era. Bride in a flowing crimson hanfu with gold hair ornaments; groom in black lacquered scale armor with gold studs. Grey brick city wall, overcast cold daylight, desaturated cool grey with vivid crimson accents, anamorphic cinematic look, fine film grain. Portrait of the bride gazing up at the groom (off-frame), against a deep red palace wall, gold hair ornaments catching the light. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Slow pull-back. She blinks and a soft smile forms; the hair ornaments sway slightly. The key action happens within the first 1 second, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### A1.08 · dùng 1,3 s · rộng, cổng vòm · mặt: không
*Vị trí trong mẫu: 11,9–13,2 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. No face is visible; the person is the bride (the woman in the reference photo): keep her hair color, skin tone and body build consistent with it. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Ancient China, Warring States era. Bride in a flowing crimson hanfu with gold hair ornaments; groom in black lacquered scale armor with gold studs. Grey brick city wall, overcast cold daylight, desaturated cool grey with vivid crimson accents, anamorphic cinematic look, fine film grain. Dark stone arched gate tunnel seen from inside, a bright opening at the far end, one lone silhouette walking away. Photorealistic, deep focus with everything sharp, natural skin texture, no text, no watermark.
```

Chuyển động:
```text
Slow dolly-in toward the opening; the silhouette walks slowly away, dust floats in the light shaft. The key action happens within the first 2 seconds, then the movement settles. Outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### A1.09 · dùng 1,2 s · chân dung · mặt: có
*Vị trí trong mẫu: 13,2–14,4 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Only the bride's face is visible: she is the woman in the reference photo; keep her face, skin tone and hair color exactly identical to it. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Ancient China, Warring States era. Bride in a flowing crimson hanfu with gold hair ornaments; groom in black lacquered scale armor with gold studs. Grey brick city wall, overcast cold daylight, desaturated cool grey with vivid crimson accents, anamorphic cinematic look, fine film grain. Portrait of the bride in front of a red palace wall with gold studs, looking into the camera with quiet longing. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Slow push-in. She holds the gaze, her eyes glisten, a faint breath of wind moves loose strands of hair. The key action happens within the first 2 seconds, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

## A.2 Chương 2 · Đường

**STYLE của chương** (đã ghép sẵn vào các shot dưới):
```text
Ancient China, Tang dynasty, night by a lake. Bride in a teal-and-red embroidered Tang robe with floral hair ornaments; groom in a cream round-collar robe with a black futou hat. Glowing red-gold pavilions and lanterns, warm orange-red and teal bokeh reflecting on water, cinematic look, fine film grain.
```

### A2.01 · dùng 0,4 s · cảnh chèn bàn tay · mặt: không
*Vị trí trong mẫu: 15,6–16,0 s*

Ảnh tĩnh:
```text
Cinematic macro still, no faces visible. The hands are the bride's, from the reference photos: keep skin tone and the outfit sleeves consistent with them. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Ancient China, Tang dynasty, night by a lake. Bride in a teal-and-red embroidered Tang robe with floral hair ornaments; groom in a cream round-collar robe with a black futou hat. Glowing red-gold pavilions and lanterns, warm orange-red and teal bokeh reflecting on water, cinematic look, fine film grain. Macro: a woman's hands arranging peonies in a porcelain vase on a red lacquer table, warm lantern light, shallow focus, no faces. Photorealistic macro, shallow focus, no text, no watermark.
```

Chuyển động:
```text
Static macro with a very slow slide to the right; her fingers adjust a flower; a petal trembles. The key action happens within the first 1 second, then the movement settles. No text, no cuts.
```

### A2.02 · dùng 0,8 s · vừa, nhìn nghiêng · mặt: có
*Vị trí trong mẫu: 16,0–16,8 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Only the bride's face is visible: she is the woman in the reference photo; keep her face, skin tone and hair color exactly identical to it. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Ancient China, Tang dynasty, night by a lake. Bride in a teal-and-red embroidered Tang robe with floral hair ornaments; groom in a cream round-collar robe with a black futou hat. Glowing red-gold pavilions and lanterns, warm orange-red and teal bokeh reflecting on water, cinematic look, fine film grain. The bride in a Tang robe seated at a balcony railing at night with a vase of flowers beside her, red pillars, glowing lanterns behind, medium shot from the side. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Slow slide to the left. She tilts her head and gazes out; lantern light flickers on her face. The key action happens within the first 2 seconds, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### A2.03 · dùng 0,9 s · vừa, nhìn nghiêng · mặt: có
*Vị trí trong mẫu: 16,8–17,7 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Only the groom's face is visible: he is the man in the reference photo; keep his face, skin tone and hair color exactly identical to it. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Ancient China, Tang dynasty, night by a lake. Bride in a teal-and-red embroidered Tang robe with floral hair ornaments; groom in a cream round-collar robe with a black futou hat. Glowing red-gold pavilions and lanterns, warm orange-red and teal bokeh reflecting on water, cinematic look, fine film grain. The groom in a cream robe leans on the red balustrade in profile, fingers adjusting a small cord, dark blossoming trees behind, medium shot. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Slow push-in. He fiddles with the cord, then lifts his eyes toward her. The key action happens within the first 2 seconds, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### A2.04 · dùng 0,7 s · vừa-cận · mặt: có
*Vị trí trong mẫu: 17,7–18,4 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Only the bride's face is visible: she is the woman in the reference photo; keep her face, skin tone and hair color exactly identical to it. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Ancient China, Tang dynasty, night by a lake. Bride in a teal-and-red embroidered Tang robe with floral hair ornaments; groom in a cream round-collar robe with a black futou hat. Glowing red-gold pavilions and lanterns, warm orange-red and teal bokeh reflecting on water, cinematic look, fine film grain. The bride at the balcony looking upward, three-quarter view, warm rim light from the lanterns. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Slow tilt up. Her eyes follow something in the sky; the hair ornaments catch the light. The key action happens within the first 1 second, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### A2.05 · dùng 1,2 s · vừa-cận · mặt: có
*Vị trí trong mẫu: 18,4–19,6 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Only the bride's face is visible: she is the woman in the reference photo; keep her face, skin tone and hair color exactly identical to it. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Ancient China, Tang dynasty, night by a lake. Bride in a teal-and-red embroidered Tang robe with floral hair ornaments; groom in a cream round-collar robe with a black futou hat. Glowing red-gold pavilions and lanterns, warm orange-red and teal bokeh reflecting on water, cinematic look, fine film grain. The bride at the balustrade with a bokeh lake and lantern-lit pavilions behind, medium close-up, calm smile. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Slow dolly-in. A gentle breeze moves her sleeves; reflections shimmer in the background. The key action happens within the first 2 seconds, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### A2.06 · dùng 1,3 s · rộng, nhìn từ sau · mặt: không
*Vị trí trong mẫu: 19,6–20,9 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. No faces are visible; the people are the bride and the groom from the reference photos: keep hair color, skin tone and body build consistent with the references. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Ancient China, Tang dynasty, night by a lake. Bride in a teal-and-red embroidered Tang robe with floral hair ornaments; groom in a cream round-collar robe with a black futou hat. Glowing red-gold pavilions and lanterns, warm orange-red and teal bokeh reflecting on water, cinematic look, fine film grain. Wide night shot across the lake: a glowing red-gold pavilion with reflections, the groom in a cream robe and the bride in a teal-red robe seen from behind at the railing. Photorealistic, deep focus with everything sharp, natural skin texture, no text, no watermark.
```

Chuyển động:
```text
Static wide with a very slow push-in; water ripples shimmer, lanterns twinkle; the two figures stand still. The key action happens within the first 2 seconds, then the movement settles. Outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### A2.07 · dùng 1 s · qua vai · mặt: có
*Vị trí trong mẫu: 20,9–21,9 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Only the groom's face is visible: he is the man in the reference photo; keep his face, skin tone and hair color exactly identical to it. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Ancient China, Tang dynasty, night by a lake. Bride in a teal-and-red embroidered Tang robe with floral hair ornaments; groom in a cream round-collar robe with a black futou hat. Glowing red-gold pavilions and lanterns, warm orange-red and teal bokeh reflecting on water, cinematic look, fine film grain. Over-the-shoulder medium shot: the groom in a cream robe and black futou hat turns his head toward the bride, red lantern bokeh behind. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Slow drift of the camera around him. He turns his head slowly toward her. The key action happens within the first 2 seconds, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### A2.08 · dùng 0,9 s · cảnh chèn bàn tay · mặt: không
*Vị trí trong mẫu: 21,9–22,8 s*

Ảnh tĩnh:
```text
Cinematic macro still, no faces visible. The hands are the bride's and the groom's, from the reference photos: keep skin tone and the outfit sleeves consistent with them. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Ancient China, Tang dynasty, night by a lake. Bride in a teal-and-red embroidered Tang robe with floral hair ornaments; groom in a cream round-collar robe with a black futou hat. Glowing red-gold pavilions and lanterns, warm orange-red and teal bokeh reflecting on water, cinematic look, fine film grain. Macro insert: his hands tie a small red cord pouch to her patterned sleeve, night bokeh behind, no faces. Photorealistic macro, shallow focus, no text, no watermark.
```

Chuyển động:
```text
Static macro. His fingers finish a knot and let go; the tassel swings slightly. The key action happens within the first 2 seconds, then the movement settles. No text, no cuts.
```

### A2.09 · dùng 1,3 s · nhìn từ sau · mặt: không
*Vị trí trong mẫu: 22,8–24,1 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. No faces are visible; the people are the bride and the groom from the reference photos: keep hair color, skin tone and body build consistent with the references. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Ancient China, Tang dynasty, night by a lake. Bride in a teal-and-red embroidered Tang robe with floral hair ornaments; groom in a cream round-collar robe with a black futou hat. Glowing red-gold pavilions and lanterns, warm orange-red and teal bokeh reflecting on water, cinematic look, fine film grain. Back view of the couple standing side by side at the railing facing the lake, cream robe and teal-red robe, a few small fireworks already glowing in the distant night sky. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Static camera with a slow push-in. More fireworks burst and bloom in the night sky, colored light flickers on them; they lean slightly toward each other. The key action happens within the first 2 seconds, then the movement settles. Outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### A2.10 · dùng 1,1 s · hai người, cận · mặt: có
*Vị trí trong mẫu: 24,1–25,2 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Both faces are visible: the bride is the woman and the groom is the man in the reference photos; keep both faces, skin tone and hair color exactly identical to the references. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Ancient China, Tang dynasty, night by a lake. Bride in a teal-and-red embroidered Tang robe with floral hair ornaments; groom in a cream round-collar robe with a black futou hat. Glowing red-gold pavilions and lanterns, warm orange-red and teal bokeh reflecting on water, cinematic look, fine film grain. Close two-shot: the groom turns toward the bride, they look at each other, red-gold bokeh behind. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Slow slide to the right. They hold eye contact and she smiles softly. The key action happens within the first 2 seconds, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### A2.11 · dùng 1 s · cận, ôm · mặt: có
*Vị trí trong mẫu: 25,2–26,2 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Both faces are visible: the bride is the woman and the groom is the man in the reference photos; keep both faces, skin tone and hair color exactly identical to the references. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Ancient China, Tang dynasty, night by a lake. Bride in a teal-and-red embroidered Tang robe with floral hair ornaments; groom in a cream round-collar robe with a black futou hat. Glowing red-gold pavilions and lanterns, warm orange-red and teal bokeh reflecting on water, cinematic look, fine film grain. Close shot of an embrace: the bride rests her head on the groom's shoulder, his eyes closed, warm red bokeh behind. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Very slow push-in. She nestles her head against his shoulder; he tightens the embrace and exhales. The key action happens within the first 2 seconds, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### A2.12 · dùng 1,3 s · vừa-rộng, ôm · mặt: có
*Vị trí trong mẫu: 26,2–27,5 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Both faces are visible: the bride is the woman and the groom is the man in the reference photos; keep both faces, skin tone and hair color exactly identical to the references. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Ancient China, Tang dynasty, night by a lake. Bride in a teal-and-red embroidered Tang robe with floral hair ornaments; groom in a cream round-collar robe with a black futou hat. Glowing red-gold pavilions and lanterns, warm orange-red and teal bokeh reflecting on water, cinematic look, fine film grain. Medium-wide embrace at the railing, red bokeh of the lake behind them. Photorealistic, deep focus with everything sharp, natural skin texture, no text, no watermark.
```

Chuyển động:
```text
Slow pull-back. They sway slightly in the embrace; the lantern lights flicker. The key action happens within the first 2 seconds, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

## A.3 Chương 3 · Tống

**STYLE của chương** (đã ghép sẵn vào các shot dưới):
```text
Ancient China, Song dynasty wedding. Red-and-gold wedding hall, red drapes, hanging lanterns, double-happiness symbol. Bride in a red wedding robe with a golden phoenix crown; groom in an orange-red official robe with a black winged hat. Warm saturated red-gold light, cinematic look, fine film grain.
```

### A3.01 · dùng 1 s · vừa · mặt: có
*Vị trí trong mẫu: 28,8–29,8 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Only the groom's face is visible: he is the man in the reference photo; keep his face, skin tone and hair color exactly identical to it. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Ancient China, Song dynasty wedding. Red-and-gold wedding hall, red drapes, hanging lanterns, double-happiness symbol. Bride in a red wedding robe with a golden phoenix crown; groom in an orange-red official robe with a black winged hat. Warm saturated red-gold light, cinematic look, fine film grain. The groom in an orange-red official robe and black winged hat stands by a carved lattice window in bright diffuse light, holding a bamboo scroll, medium shot. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Slow push-in. He lowers the scroll and looks up with a soft smile; sunlight shifts across the lattice. The key action happens within the first 2 seconds, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### A3.02 · dùng 2,7 s · vừa-cận · mặt: có
*Vị trí trong mẫu: 29,8–32,5 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Only the bride's face is visible: she is the woman in the reference photo; keep her face, skin tone and hair color exactly identical to it. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Ancient China, Song dynasty wedding. Red-and-gold wedding hall, red drapes, hanging lanterns, double-happiness symbol. Bride in a red wedding robe with a golden phoenix crown; groom in an orange-red official robe with a black winged hat. Warm saturated red-gold light, cinematic look, fine film grain. The bride in a red wedding robe and golden phoenix crown sits in a red room, hands clasped at her chest, warm light, medium close-up. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Static camera with a slight handheld sway. She lifts a round red fan to half cover her shy smile; the crown tassels sway. The key action happens within the first 3 seconds, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### A3.03 · dùng 1,2 s · rộng, nhìn từ sau · mặt: không
*Vị trí trong mẫu: 32,5–33,7 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. No faces are visible; the people are the bride and the groom from the reference photos: keep hair color, skin tone and body build consistent with the references. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Ancient China, Song dynasty wedding. Red-and-gold wedding hall, red drapes, hanging lanterns, double-happiness symbol. Bride in a red wedding robe with a golden phoenix crown; groom in an orange-red official robe with a black winged hat. Warm saturated red-gold light, cinematic look, fine film grain. Red wedding hall seen from behind: the couple in red robes stand before an altar with a double-happiness symbol, red drapes, hanging lanterns, symmetric composition, wide. Photorealistic, deep focus with everything sharp, natural skin texture, no text, no watermark.
```

Chuyển động:
```text
Static camera with a slow push-in. They bow together; the drapes sway; lantern tassels swing. The key action happens within the first 2 seconds, then the movement settles. Outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### A3.04 · dùng 1,8 s · vừa · mặt: có
*Vị trí trong mẫu: 33,7–35,5 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Both faces are visible: the bride is the woman and the groom is the man in the reference photos; keep both faces, skin tone and hair color exactly identical to the references. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Ancient China, Song dynasty wedding. Red-and-gold wedding hall, red drapes, hanging lanterns, double-happiness symbol. Bride in a red wedding robe with a golden phoenix crown; groom in an orange-red official robe with a black winged hat. Warm saturated red-gold light, cinematic look, fine film grain. Medium shot from the front: the couple in red wedding robes bow to each other at the altar, he in a black winged hat, she in a phoenix crown, candlelight. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Slow dolly-in. They rise from the bow and turn to face each other; candle flames flicker. The key action happens within the first 3 seconds, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

## A.4 Chương 4 · Dân quốc

**STYLE của chương** (đã ghép sẵn vào các shot dưới):
```text
Republican-era China, 1930s. Green vintage train station platform with a green carriage. Bride in a white lace blouse and dark skirt with a hairclip; groom in a white dress military uniform with gold epaulettes and medals. Muted green-grey grade, soft overcast light, cinematic look, fine film grain.
```

### A4.01 · dùng 0,9 s · vừa · mặt: có
*Vị trí trong mẫu: 36,8–37,7 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Only the bride's face is visible: she is the woman in the reference photo; keep her face, skin tone and hair color exactly identical to it. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Republican-era China, 1930s. Green vintage train station platform with a green carriage. Bride in a white lace blouse and dark skirt with a hairclip; groom in a white dress military uniform with gold epaulettes and medals. Muted green-grey grade, soft overcast light, cinematic look, fine film grain. The bride in a white lace blouse on a station platform, a green vintage train rushing past behind her, she presses both hands over her ears, medium shot. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Static camera. The train blurs past; wind whips her hair and blouse; she winces and closes her eyes. The key action happens within the first 2 seconds, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### A4.02 · dùng 0,8 s · vừa · mặt: có
*Vị trí trong mẫu: 37,7–38,5 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Both faces are visible: the bride is the woman and the groom is the man in the reference photos; keep both faces, skin tone and hair color exactly identical to the references. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Republican-era China, 1930s. Green vintage train station platform with a green carriage. Bride in a white lace blouse and dark skirt with a hairclip; groom in a white dress military uniform with gold epaulettes and medals. Muted green-grey grade, soft overcast light, cinematic look, fine film grain. The groom in a white military dress uniform with gold epaulettes steps up behind the bride on the platform, green train behind. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
He steps in and wraps his arms around her; the train passes behind them. The key action happens within the first 2 seconds, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### A4.03 · dùng 2,5 s · cận, ôm · mặt: có
*Vị trí trong mẫu: 38,5–41,0 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Both faces are visible: the bride is the woman and the groom is the man in the reference photos; keep both faces, skin tone and hair color exactly identical to the references. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Republican-era China, 1930s. Green vintage train station platform with a green carriage. Bride in a white lace blouse and dark skirt with a hairclip; groom in a white dress military uniform with gold epaulettes and medals. Muted green-grey grade, soft overcast light, cinematic look, fine film grain. Close embrace, over-the-shoulder three-quarter view: the bride's hairclip glinting, the groom's chin resting on her head, green train blurred behind. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Slow push-in. She turns her head slightly toward him; wind moves her hair; the train rumbles past. The key action happens within the first 3 seconds, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### A4.04 · dùng 0,6 s · cận, nhìn nghiêng · mặt: có
*Vị trí trong mẫu: 41,0–41,6 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Both faces are visible: the bride is the woman and the groom is the man in the reference photos; keep both faces, skin tone and hair color exactly identical to the references. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Republican-era China, 1930s. Green vintage train station platform with a green carriage. Bride in a white lace blouse and dark skirt with a hairclip; groom in a white dress military uniform with gold epaulettes and medals. Muted green-grey grade, soft overcast light, cinematic look, fine film grain. The bride in profile beside an easel holding a framed portrait of the groom in military uniform, pale street background, medium close-up. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Slow pull-back. She gazes at the portrait and blinks slowly; her hair moves in the wind. The key action happens within the first 1 second, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### A4.05 · dùng 0,6 s · chân dung · mặt: có
*Vị trí trong mẫu: 41,6–42,2 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Only the groom's face is visible: he is the man in the reference photo; keep his face, skin tone and hair color exactly identical to it. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Republican-era China, 1930s. Green vintage train station platform with a green carriage. Bride in a white lace blouse and dark skirt with a hairclip; groom in a white dress military uniform with gold epaulettes and medals. Muted green-grey grade, soft overcast light, cinematic look, fine film grain. Portrait of the groom in the white military uniform holding a bouquet of red roses, serious tender look, soft grey background. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Slow push-in. His eyes soften into a slight smile; the roses tremble. The key action happens within the first 1 second, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### A4.06 · dùng 0,8 s · vừa · mặt: có
*Vị trí trong mẫu: 42,2–43,0 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Both faces are visible: the bride is the woman and the groom is the man in the reference photos; keep both faces, skin tone and hair color exactly identical to the references. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Republican-era China, 1930s. Green vintage train station platform with a green carriage. Bride in a white lace blouse and dark skirt with a hairclip; groom in a white dress military uniform with gold epaulettes and medals. Muted green-grey grade, soft overcast light, cinematic look, fine film grain. Formal 1930s wedding portrait: the groom in uniform and the bride in a white qipao with a red-rose bouquet stand together, white doves about to take flight. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Static camera. White doves burst upward around them; the couple smile and lean closer. The key action happens within the first 2 seconds, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

## A.5 Chương 5 · Hiện đại

**STYLE của chương** (đã ghép sẵn vào các shot dưới):
```text
Modern day. Bright minimalist art gallery, white walls, soft diffused daylight. Bride in a beige trench coat with long hair; groom in a camouflage field uniform. Clean pale cyan-grey grade, cinematic look, fine film grain.
```

### A5.01 · dùng 0,6 s · vừa-rộng, nhìn từ sau · mặt: không
*Vị trí trong mẫu: 44,8–45,4 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. No face is visible; the person is the bride (the woman in the reference photo): keep her hair color, skin tone and body build consistent with it. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Modern day. Bright minimalist art gallery, white walls, soft diffused daylight. Bride in a beige trench coat with long hair; groom in a camouflage field uniform. Clean pale cyan-grey grade, cinematic look, fine film grain. The bride in a beige trench coat seen from behind, standing before a framed painting on a white gallery wall, a red panel at the right edge, medium-wide. Photorealistic, deep focus with everything sharp, natural skin texture, no text, no watermark.
```

Chuyển động:
```text
Slow slide to the left. She tilts her head to study the painting; soft daylight. The key action happens within the first 1 second, then the movement settles. Outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### A5.02 · dùng 1 s · cận, nhìn nghiêng · mặt: có
*Vị trí trong mẫu: 46,0–47,0 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Only the bride's face is visible: she is the woman in the reference photo; keep her face, skin tone and hair color exactly identical to it. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Modern day. Bright minimalist art gallery, white walls, soft diffused daylight. Bride in a beige trench coat with long hair; groom in a camouflage field uniform. Clean pale cyan-grey grade, cinematic look, fine film grain. The bride in profile gazing at the framed painting, soft daylight, shallow depth of field. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Slow push-in; she blinks, curiosity turning into a faint smile. The key action happens within the first 2 seconds, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### A5.03 · dùng 0,4 s · cận · mặt: có
*Vị trí trong mẫu: 47,0–47,4 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Only the bride's face is visible: she is the woman in the reference photo; keep her face, skin tone and hair color exactly identical to it. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Modern day. Bright minimalist art gallery, white walls, soft diffused daylight. Bride in a beige trench coat with long hair; groom in a camouflage field uniform. Clean pale cyan-grey grade, cinematic look, fine film grain. Close-up of the bride's face, eyes wide with sudden surprise, white wall behind. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Quick subtle push-in; her eyes widen and her lips part, breath caught. The key action happens within the first 1 second, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### A5.04 · dùng 0,6 s · cận · mặt: có
*Vị trí trong mẫu: 47,9–48,5 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Only the groom's face is visible: he is the man in the reference photo; keep his face, skin tone and hair color exactly identical to it. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Modern day. Bright minimalist art gallery, white walls, soft diffused daylight. Bride in a beige trench coat with long hair; groom in a camouflage field uniform. Clean pale cyan-grey grade, cinematic look, fine film grain. Close-up of the groom in camouflage with a calm gaze, a large blurred black brush-stroke shape in the foreground. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Slow rack focus from the foreground stroke to his face; he lifts his eyes. The key action happens within the first 1 second, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### A5.05 · dùng 1 s · rộng, đối xứng · mặt: không
*Vị trí trong mẫu: 48,5–49,5 s* · Mẹo: bức tường để trống có chủ đích; chèn chữ thư pháp lớn (như "纯属偶然" trong mẫu) ở khâu dựng, vì chữ trong ảnh AI hay sai nét.

Ảnh tĩnh:
```text
Cinematic wedding film still. No faces are visible; the people are the bride and the groom from the reference photos: keep hair color, skin tone and body build consistent with the references. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Modern day. Bright minimalist art gallery, white walls, soft diffused daylight. Bride in a beige trench coat with long hair; groom in a camouflage field uniform. Clean pale cyan-grey grade, cinematic look, fine film grain. Wide gallery with a huge empty white wall and plenty of clean space; the groom in camouflage and the bride in a beige trench coat stand apart facing the wall, symmetrical composition, tiny figures. Photorealistic, deep focus with everything sharp, natural skin texture, no text, no watermark.
```

Chuyển động:
```text
Static wide with a very slow push-in; she turns slightly toward him. The key action happens within the first 2 seconds, then the movement settles. Outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### A5.06 · dùng 0,7 s · cảnh chèn bàn tay · mặt: không
*Vị trí trong mẫu: 49,5–50,2 s*

Ảnh tĩnh:
```text
Cinematic macro still, no faces visible. The hands are the bride's, from the reference photos: keep skin tone and the outfit sleeves consistent with them. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Modern day. Bright minimalist art gallery, white walls, soft diffused daylight. Bride in a beige trench coat with long hair; groom in a camouflage field uniform. Clean pale cyan-grey grade, cinematic look, fine film grain. Macro: a woman's hands holding a smartphone, soft daylight, no face. Photorealistic macro, shallow focus, no text, no watermark.
```

Chuyển động:
```text
Static macro; her thumb scrolls the screen. The key action happens within the first 1 second, then the movement settles. No text, no cuts.
```

### A5.07 · dùng 0,4 s · vừa-cận · mặt: có
*Vị trí trong mẫu: 50,2–50,6 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Only the bride's face is visible: she is the woman in the reference photo; keep her face, skin tone and hair color exactly identical to it. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Modern day. Bright minimalist art gallery, white walls, soft diffused daylight. Bride in a beige trench coat with long hair; groom in a camouflage field uniform. Clean pale cyan-grey grade, cinematic look, fine film grain. The bride looks down at her phone in a quiet courtyard, soft daylight, blurred traditional architecture behind, medium close-up. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Slow slide to the right. She looks up and smiles slightly. The key action happens within the first 1 second, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### A5.08 · dùng 0,5 s · cận · mặt: có
*Vị trí trong mẫu: 50,6–51,1 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Only the groom's face is visible: he is the man in the reference photo; keep his face, skin tone and hair color exactly identical to it. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Modern day. Bright minimalist art gallery, white walls, soft diffused daylight. Bride in a beige trench coat with long hair; groom in a camouflage field uniform. Clean pale cyan-grey grade, cinematic look, fine film grain. The groom in camouflage looking down at the phone in his hand, soft light, close-up. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Slow push-in; he looks up toward something off-frame. The key action happens within the first 1 second, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### A5.09 · dùng 0,7 s · vừa, cảnh kết · mặt: có
*Vị trí trong mẫu: 51,1–51,8 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Both faces are visible: the bride is the woman and the groom is the man in the reference photos; keep both faces, skin tone and hair color exactly identical to the references. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Modern day. Bright minimalist art gallery, white walls, soft diffused daylight. Bride in a beige trench coat with long hair; groom in a camouflage field uniform. Clean pale cyan-grey grade, cinematic look, fine film grain. Final shot: the groom and the bride stand close facing each other against a pale cyan clean background, medium shot, soft backlight. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Static camera with a slight handheld sway. She raises her eyes to his; he leans in slightly; wind moves her hair. The key action happens within the first 1 second, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

---

# MẪU B · "Album nhiều phong cách" (≈ 30 giây, 33 shot)

Không có cốt truyện: 6 "bộ ảnh" (trang phục + bối cảnh) của cùng một cặp đôi, kết bằng cưới Tây sáng. Mỗi bộ được dùng lại ở nhiều shot, nên **làm ảnh gốc rộng của từng bộ trước** rồi sinh các góc còn lại từ đó. Nhạc và phụ đề: như mẫu A.

## B.0 Sáu bộ ảnh (STYLE)

**Bộ A · Phố cổ hiện đại**
```text
Modern day in a small old Chinese town with grey brick walls and wooden doors, bright natural daylight with a soft teal-green tint. Bride in a beige trench coat with long straight hair; groom in a light-blue shirt with a navy sweater tied over his shoulders.
```

**Bộ B · Cung đình mùa đông**
```text
Imperial winter-court look: bride in a dark embroidered robe with a fur collar and golden phoenix hairpins; groom in a dark embroidered robe with a fur collar and a black hat; red lacquered pillars, carved wood, warm golden light.
```

**Bộ C · Sườn xám thập niên 30**
```text
1930s romance: bride in a green floral qipao with golden osmanthus hairpins and finger-waved dark hair; groom in a grey three-piece suit; dark wooden temple columns and stone steps, moody teal-green grade.
```

**Bộ D · Hán phục mùa xuân**
```text
Spring hanfu: bride in a pale pink hanfu with an oil-paper parasol and flower hair ornaments; groom in a pale-blue hanfu with a black hat; snow mountains, hydrangea and peony, blue sky, bright pastel grade.
```

**Bộ E · Đám cưới đỏ**
```text
Chinese red wedding: bride in a red-gold embroidered wedding gown with a phoenix crown and a round red fan; groom in a red wedding robe; red carpet and red drapes; saturated red-gold light.
```

**Bộ F · Cưới Tây sáng**
```text
Western wedding: bride in a white strapless ball gown with a veil and a pink bouquet; groom in a black tuxedo with a boutonniere; white castle-like set, hydrangea field, snow mountains, bright high-key pastel grade.
```

## B.1 Danh sách shot

### B01 · bộ A · dùng 0,8 s · vừa · mặt: có
*Vị trí trong mẫu: 0,3–1,1 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Both faces are visible: the bride is the woman and the groom is the man in the reference photos; keep both faces, skin tone and hair color exactly identical to the references. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Modern day in a small old Chinese town with grey brick walls and wooden doors, bright natural daylight with a soft teal-green tint. Bride in a beige trench coat with long straight hair; groom in a light-blue shirt with a navy sweater tied over his shoulders. Medium shot in an old-town street: the groom looks at the bride, who looks back at him. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Slow push-in. They hold each other's gaze; her hair moves in a light breeze. The key action happens within the first 2 seconds, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### B02 · bộ A · dùng 0,6 s · qua vai · mặt: có
*Vị trí trong mẫu: 1,1–1,7 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Only the groom's face is visible: he is the man in the reference photo; keep his face, skin tone and hair color exactly identical to it. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Modern day in a small old Chinese town with grey brick walls and wooden doors, bright natural daylight with a soft teal-green tint. Bride in a beige trench coat with long straight hair; groom in a light-blue shirt with a navy sweater tied over his shoulders. The bride seen from behind (hair in the soft-focus foreground) while the groom turns and looks at the camera with a gentle smile, wooden door and grey brick wall behind. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Slow rack focus from her hair to his face; he smiles slightly. The key action happens within the first 1 second, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### B03 · bộ B · dùng 0,7 s · vừa-cận · mặt: có
*Vị trí trong mẫu: 1,7–2,4 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Only the bride's face is visible: she is the woman in the reference photo; keep her face, skin tone and hair color exactly identical to it. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Imperial winter-court look: bride in a dark embroidered robe with a fur collar and golden phoenix hairpins; groom in a dark embroidered robe with a fur collar and a black hat; red lacquered pillars, carved wood, warm golden light. Medium close-up of the bride smiling toward the groom (off-frame), red lacquered pillars behind. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Static camera with a slight handheld sway. Her smile grows; the hairpin tassels sway. The key action happens within the first 1 second, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### B04 · bộ B · dùng 0,7 s · vừa-cận · mặt: có
*Vị trí trong mẫu: 2,4–3,1 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Only the groom's face is visible: he is the man in the reference photo; keep his face, skin tone and hair color exactly identical to it. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Imperial winter-court look: bride in a dark embroidered robe with a fur collar and golden phoenix hairpins; groom in a dark embroidered robe with a fur collar and a black hat; red lacquered pillars, carved wood, warm golden light. The groom looking at the bride (off-frame) with tender eyes, red pillar behind, medium close-up. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Slow push-in; he gives a small nod. The key action happens within the first 1 second, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### B05a · bộ C · dùng 1,3 s · chân dung · mặt: có
*Vị trí trong mẫu: 3,1–4,4 s* · Chuyển sang 05b bằng dissolve chéo ~0,8 giây (đúng như mẫu).

Ảnh tĩnh:
```text
Cinematic wedding film still. Only the bride's face is visible: she is the woman in the reference photo; keep her face, skin tone and hair color exactly identical to it. If a master-shot image of this set is attached too, keep its outfits, location and color grade. 1930s romance: bride in a green floral qipao with golden osmanthus hairpins and finger-waved dark hair; groom in a grey three-piece suit; dark wooden temple columns and stone steps, moody teal-green grade. Portrait of the bride looking into the camera with a soft smile and red lipstick, dark wooden temple hall behind. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Slow pull-back. She tilts her head slightly and smiles; the hair ornaments catch the light. The key action happens within the first 2 seconds, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### B05b · bộ C · dùng 1,3 s · chân dung · mặt: có
*Vị trí trong mẫu: 4,4–5,7 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Only the groom's face is visible: he is the man in the reference photo; keep his face, skin tone and hair color exactly identical to it. If a master-shot image of this set is attached too, keep its outfits, location and color grade. 1930s romance: bride in a green floral qipao with golden osmanthus hairpins and finger-waved dark hair; groom in a grey three-piece suit; dark wooden temple columns and stone steps, moody teal-green grade. Portrait of the groom looking at the camera, same temple hall behind, stone steps. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Slow push-in; he gives a calm confident smile. The key action happens within the first 2 seconds, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### B06 · bộ C · dùng 0,4 s · vừa-rộng · mặt: có
*Vị trí trong mẫu: 5,7–6,1 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Both faces are visible: the bride is the woman and the groom is the man in the reference photos; keep both faces, skin tone and hair color exactly identical to the references. If a master-shot image of this set is attached too, keep its outfits, location and color grade. 1930s romance: bride in a green floral qipao with golden osmanthus hairpins and finger-waved dark hair; groom in a grey three-piece suit; dark wooden temple columns and stone steps, moody teal-green grade. Insert on stone steps: the groom takes the bride's hand, medium-wide, faces small but visible. Photorealistic, deep focus with everything sharp, natural skin texture, no text, no watermark.
```

Chuyển động:
```text
Static camera; their hands meet and clasp. The key action happens within the first 1 second, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### B07 · bộ B · dùng 0,5 s · vừa · mặt: có
*Vị trí trong mẫu: 6,1–6,6 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Both faces are visible: the bride is the woman and the groom is the man in the reference photos; keep both faces, skin tone and hair color exactly identical to the references. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Imperial winter-court look: bride in a dark embroidered robe with a fur collar and golden phoenix hairpins; groom in a dark embroidered robe with a fur collar and a black hat; red lacquered pillars, carved wood, warm golden light. The couple side by side, her face bright with a smile, his profile, red pillars, golden light. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Slow slide to the left. She turns to him. The key action happens within the first 1 second, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### B08 · bộ A · dùng 0,7 s · rộng · mặt: không
*Vị trí trong mẫu: 6,6–7,3 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. No faces are visible; the people are the bride and the groom from the reference photos: keep hair color, skin tone and body build consistent with the references. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Modern day in a small old Chinese town with grey brick walls and wooden doors, bright natural daylight with a soft teal-green tint. Bride in a beige trench coat with long straight hair; groom in a light-blue shirt with a navy sweater tied over his shoulders. Wide shot: the groom in the light-blue shirt with the navy sweater over his shoulders and a backpack hands a pink rose bouquet to the bride in front of a glass pavilion, lush green garden, blurred foreground foliage. Photorealistic, deep focus with everything sharp, natural skin texture, no text, no watermark.
```

Chuyển động:
```text
The camera slowly tracks sideways; he extends the bouquet; she reaches to take it. The key action happens within the first 1 second, then the movement settles. Outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### B09 · bộ D · dùng 1,5 s · hai người, cận · mặt: có
*Vị trí trong mẫu: 7,3–8,8 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Both faces are visible: the bride is the woman and the groom is the man in the reference photos; keep both faces, skin tone and hair color exactly identical to the references. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Spring hanfu: bride in a pale pink hanfu with an oil-paper parasol and flower hair ornaments; groom in a pale-blue hanfu with a black hat; snow mountains, hydrangea and peony, blue sky, bright pastel grade. Close two-shot, pink roses blooming around them, a few pink petals in the air, soft pastel light. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Slow push-in; they gaze at each other; petals float. The key action happens within the first 2 seconds, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### B10 · bộ C · dùng 0,7 s · vật chèn · mặt: không
*Vị trí trong mẫu: 8,8–9,5 s* · Không cần ảnh tham chiếu (bỏ khối LOCK).

Ảnh tĩnh:
```text
Cinematic still life, no people. 1930s romance mood, dark wooden interior, moody teal-green grade. Still-life insert: an antique tea set with a thin wisp of steam rising from the cup and a small carved wooden box on a dark table, moody teal light, soft bokeh, no people. Photorealistic, soft bokeh, no text, no watermark.
```

Chuyển động:
```text
Slow slide to the right; steam rises from the tea cup. The key action happens within the first 1 second, then the movement settles. No text, no cuts.
```

### B11 · bộ C · dùng 1 s · cận · mặt: có
*Vị trí trong mẫu: 9,5–10,5 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Only the groom's face is visible: he is the man in the reference photo; keep his face, skin tone and hair color exactly identical to it. If a master-shot image of this set is attached too, keep its outfits, location and color grade. 1930s romance: bride in a green floral qipao with golden osmanthus hairpins and finger-waved dark hair; groom in a grey three-piece suit; dark wooden temple columns and stone steps, moody teal-green grade. Close-up of the groom in a dark green suit smelling a single pink rose held toward the camera, warm arched-window bokeh behind. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Slow slide to the right. He lowers the rose slightly and smiles. The key action happens within the first 2 seconds, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### B12 · bộ A · dùng 0,9 s · cảnh chèn bàn tay · mặt: không
*Vị trí trong mẫu: 10,5–11,4 s*

Ảnh tĩnh:
```text
Cinematic macro still, no faces visible. The hands are the bride's, from the reference photos: keep skin tone and the outfit sleeves consistent with them. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Modern day in a small old Chinese town with grey brick walls and wooden doors, bright natural daylight with a soft teal-green tint. Bride in a beige trench coat with long straight hair; groom in a light-blue shirt with a navy sweater tied over his shoulders. Insert: the bride's hands in a beige coat sleeve holding a small cream card, bookshelves blurred behind, no face. Photorealistic macro, shallow focus, no text, no watermark.
```

Chuyển động:
```text
Static; her fingers turn the card over. The key action happens within the first 2 seconds, then the movement settles. No text, no cuts.
```

### B13 · bộ B · dùng 0,4 s · cảnh chèn bàn tay · mặt: không
*Vị trí trong mẫu: 11,4–11,8 s*

Ảnh tĩnh:
```text
Cinematic macro still, no faces visible. The hands are the bride's, from the reference photos: keep skin tone and the outfit sleeves consistent with them. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Imperial winter-court look: bride in a dark embroidered robe with a fur collar and golden phoenix hairpins; groom in a dark embroidered robe with a fur collar and a black hat; red lacquered pillars, carved wood, warm golden light. Macro: a hand with a gold ring resting on an embroidered sleeve, shallow focus, no face. Photorealistic macro, shallow focus, no text, no watermark.
```

Chuyển động:
```text
Slight push-in; the hand turns so the ring catches the light. The key action happens within the first 1 second, then the movement settles. No text, no cuts.
```

### B14 · bộ C · dùng 0,7 s · vừa · mặt: có
*Vị trí trong mẫu: 11,8–12,5 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Both faces are visible: the bride is the woman and the groom is the man in the reference photos; keep both faces, skin tone and hair color exactly identical to the references. If a master-shot image of this set is attached too, keep its outfits, location and color grade. 1930s romance: bride in a green floral qipao with golden osmanthus hairpins and finger-waved dark hair; groom in a grey three-piece suit; dark wooden temple columns and stone steps, moody teal-green grade. Medium shot on stone steps: the groom slips a ring onto the bride's finger, soft temple hall behind. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Slow push-in; he finishes placing the ring; they look up at each other. The key action happens within the first 1 second, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### B15 · bộ B · dùng 1,2 s · rộng, qua song cửa · mặt: không
*Vị trí trong mẫu: 12,5–13,7 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. No faces are visible; the people are the bride and the groom from the reference photos: keep hair color, skin tone and body build consistent with the references. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Imperial winter-court look: bride in a dark embroidered robe with a fur collar and golden phoenix hairpins; groom in a dark embroidered robe with a fur collar and a black hat; red lacquered pillars, carved wood, warm golden light. Through a carved wooden lattice window: the couple seen from the side at a table, snow mountains in the background, bright cold light. Photorealistic, deep focus with everything sharp, natural skin texture, no text, no watermark.
```

Chuyển động:
```text
Slow dolly-in through the lattice; they lean toward each other. The key action happens within the first 2 seconds, then the movement settles. Outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### B16 · bộ D · dùng 1,2 s · chân dung · mặt: có
*Vị trí trong mẫu: 13,7–14,9 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Only the bride's face is visible: she is the woman in the reference photo; keep her face, skin tone and hair color exactly identical to it. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Spring hanfu: bride in a pale pink hanfu with an oil-paper parasol and flower hair ornaments; groom in a pale-blue hanfu with a black hat; snow mountains, hydrangea and peony, blue sky, bright pastel grade. Portrait of the bride with a pink oil-paper parasol, snow mountains and green meadow behind, bright blue sky. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Static camera with a slight handheld sway. She tilts the parasol and smiles; hair and sleeves move in the breeze. The key action happens within the first 2 seconds, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### B17 · bộ B · dùng 0,7 s · chân dung · mặt: có
*Vị trí trong mẫu: 14,9–15,6 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Only the bride's face is visible: she is the woman in the reference photo; keep her face, skin tone and hair color exactly identical to it. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Imperial winter-court look: bride in a dark embroidered robe with a fur collar and golden phoenix hairpins; groom in a dark embroidered robe with a fur collar and a black hat; red lacquered pillars, carved wood, warm golden light. The bride framed by a carved wooden lattice, warm light, looking into the camera. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Slow push-in; she smiles and blinks. The key action happens within the first 1 second, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### B18 · bộ D · dùng 0,7 s · vừa-cận · mặt: có
*Vị trí trong mẫu: 15,6–16,3 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Only the bride's face is visible: she is the woman in the reference photo; keep her face, skin tone and hair color exactly identical to it. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Spring hanfu: bride in a pale pink hanfu with an oil-paper parasol and flower hair ornaments; groom in a pale-blue hanfu with a black hat; snow mountains, hydrangea and peony, blue sky, bright pastel grade. The bride in a white hanfu with a red collar against a snow-mountain backdrop, flower hair ornaments, medium close-up. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Slow pull-back. A breeze moves her hair; soft smile. The key action happens within the first 1 second, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### B19 · bộ C · dùng 0,7 s · chân dung · mặt: có
*Vị trí trong mẫu: 16,3–17,0 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Only the bride's face is visible: she is the woman in the reference photo; keep her face, skin tone and hair color exactly identical to it. If a master-shot image of this set is attached too, keep its outfits, location and color grade. 1930s romance: bride in a green floral qipao with golden osmanthus hairpins and finger-waved dark hair; groom in a grey three-piece suit; dark wooden temple columns and stone steps, moody teal-green grade. Close portrait of the bride with golden hairpins, dark hall behind, looking at the camera. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Slow push-in; her lips curve into a gentle smile. The key action happens within the first 1 second, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### B20 · bộ A · dùng 0,7 s · cận · mặt: có
*Vị trí trong mẫu: 17,0–17,7 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Only the bride's face is visible: she is the woman in the reference photo; keep her face, skin tone and hair color exactly identical to it. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Modern day in a small old Chinese town with grey brick walls and wooden doors, bright natural daylight with a soft teal-green tint. Bride in a beige trench coat with long straight hair; groom in a light-blue shirt with a navy sweater tied over his shoulders. The bride with long black hair smiling warmly behind a bunch of pink roses held in the foreground, soft overcast sky, blurred town behind, close-up. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Slow slide to the left. Her smile widens; the roses sway slightly. The key action happens within the first 1 second, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### B21 · bộ E · dùng 0,9 s · vừa-cận · mặt: có
*Vị trí trong mẫu: 17,7–18,6 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Only the bride's face is visible: she is the woman in the reference photo; keep her face, skin tone and hair color exactly identical to it. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Chinese red wedding: bride in a red-gold embroidered wedding gown with a phoenix crown and a round red fan; groom in a red wedding robe; red carpet and red drapes; saturated red-gold light. The bride half hiding her face behind a round red fan, red drapes behind. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Slow pull-back; she lowers the fan to reveal a smile; the crown tassels swing. The key action happens within the first 2 seconds, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### B22 · bộ E · dùng 0,9 s · rộng · mặt: có
*Vị trí trong mẫu: 18,6–19,5 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Both faces are visible: the bride is the woman and the groom is the man in the reference photos; keep both faces, skin tone and hair color exactly identical to the references. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Chinese red wedding: bride in a red-gold embroidered wedding gown with a phoenix crown and a round red fan; groom in a red wedding robe; red carpet and red drapes; saturated red-gold light. Wide shot: the couple walk side by side on a red carpet, red lanterns, attendants lining both sides. Photorealistic, deep focus with everything sharp, natural skin texture, no text, no watermark.
```

Chuyển động:
```text
Slow push-in; they walk toward the camera; the lantern tassels sway. The key action happens within the first 2 seconds, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### B23 · bộ E · dùng 1 s · rộng, đoàn rước · mặt: không
*Vị trí trong mẫu: 19,5–20,5 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. No faces are visible; the people are the bride and the groom from the reference photos: keep hair color, skin tone and body build consistent with the references. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Chinese red wedding: bride in a red-gold embroidered wedding gown with a phoenix crown and a round red fan; groom in a red wedding robe; red carpet and red drapes; saturated red-gold light. Courtyard procession wide shot: attendants in blue and red robes line both sides of a red carpet leading through a wooden gate toward the camera. Photorealistic, deep focus with everything sharp, natural skin texture, no text, no watermark.
```

Chuyển động:
```text
Static camera with a slow push-in; the attendants stand still while a couple approaches in the distance. The key action happens within the first 2 seconds, then the movement settles. Outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### B24 · bộ B · dùng 1,2 s · rộng, người nhỏ · mặt: không
*Vị trí trong mẫu: 20,5–21,7 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. No faces are visible; the people are the bride and the groom from the reference photos: keep hair color, skin tone and body build consistent with the references. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Imperial winter-court look: bride in a dark embroidered robe with a fur collar and golden phoenix hairpins; groom in a dark embroidered robe with a fur collar and a black hat; red lacquered pillars, carved wood, warm golden light. Wide shot of the couple standing on a white stone balustrade bridge under a blue-tiled pagoda roof, blue sky with clouds, tiny figures. Photorealistic, deep focus with everything sharp, natural skin texture, no text, no watermark.
```

Chuyển động:
```text
Slow pull-back; they stand side by side; clouds drift. The key action happens within the first 2 seconds, then the movement settles. Outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### B25 · bộ C · dùng 1,5 s · toàn thân · mặt: có
*Vị trí trong mẫu: 21,7–23,2 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Both faces are visible: the bride is the woman and the groom is the man in the reference photos; keep both faces, skin tone and hair color exactly identical to the references. If a master-shot image of this set is attached too, keep its outfits, location and color grade. 1930s romance: bride in a green floral qipao with golden osmanthus hairpins and finger-waved dark hair; groom in a grey three-piece suit; dark wooden temple columns and stone steps, moody teal-green grade. Full-length formal portrait pose: the couple standing together before a carved wooden screen, moody teal tones. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Slow slide to the right. She leans slightly toward him; they smile. The key action happens within the first 2 seconds, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### B26 · bộ F · dùng 1,7 s · rộng · mặt: có
*Vị trí trong mẫu: 23,2–24,9 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Both faces are visible: the bride is the woman and the groom is the man in the reference photos; keep both faces, skin tone and hair color exactly identical to the references. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Western wedding: bride in a white strapless ball gown with a veil and a pink bouquet; groom in a black tuxedo with a boutonniere; white castle-like set, hydrangea field, snow mountains, bright high-key pastel grade. Wide shot: the couple walk hand in hand through a hydrangea field toward a white castle-like set, snow mountains behind, bright high-key. Photorealistic, deep focus with everything sharp, natural skin texture, no text, no watermark.
```

Chuyển động:
```text
Static camera with a slow push-in; they walk slowly toward the camera holding hands, looking at each other. The key action happens within the first 2 seconds, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### B27 · bộ D · dùng 0,6 s · qua vai · mặt: có
*Vị trí trong mẫu: 24,9–25,5 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Only the bride's face is visible: she is the woman in the reference photo; keep her face, skin tone and hair color exactly identical to it. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Spring hanfu: bride in a pale pink hanfu with an oil-paper parasol and flower hair ornaments; groom in a pale-blue hanfu with a black hat; snow mountains, hydrangea and peony, blue sky, bright pastel grade. Over-the-shoulder: the groom's back in the foreground, the bride with a hair bun smiling at him, lavender flowers blurred in front. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Slow rack focus to her; she smiles. The key action happens within the first 1 second, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### B28 · bộ C · dùng 0,5 s · cận · mặt: có
*Vị trí trong mẫu: 25,5–26,0 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Only the bride's face is visible: she is the woman in the reference photo; keep her face, skin tone and hair color exactly identical to it. If a master-shot image of this set is attached too, keep its outfits, location and color grade. 1930s romance: bride in a green floral qipao with golden osmanthus hairpins and finger-waved dark hair; groom in a grey three-piece suit; dark wooden temple columns and stone steps, moody teal-green grade. The bride smiling from behind the groom's shoulder (his grey suit dark in the foreground), warm light. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Slow push-in; she peeks out from behind him. The key action happens within the first 1 second, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### B29 · bộ D · dùng 0,7 s · vừa · mặt: có
*Vị trí trong mẫu: 26,0–26,7 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Only the bride's face is visible: she is the woman in the reference photo; keep her face, skin tone and hair color exactly identical to it. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Spring hanfu: bride in a pale pink hanfu with an oil-paper parasol and flower hair ornaments; groom in a pale-blue hanfu with a black hat; snow mountains, hydrangea and peony, blue sky, bright pastel grade. The bride with a pink parasol among purple and white flowers in the foreground, the groom's black hat at the left edge, snow mountains behind. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Slow lateral move past the flowers; she smiles; the parasol turns. The key action happens within the first 1 second, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### B30 · bộ B · dùng 0,7 s · vừa-cận · mặt: có
*Vị trí trong mẫu: 26,7–27,4 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Only the bride's face is visible: she is the woman in the reference photo; keep her face, skin tone and hair color exactly identical to it. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Imperial winter-court look: bride in a dark embroidered robe with a fur collar and golden phoenix hairpins; groom in a dark embroidered robe with a fur collar and a black hat; red lacquered pillars, carved wood, warm golden light. The bride under a red pillar, looking at the groom (off-frame), fur collar, golden hairpins. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Static camera with a slight handheld sway. She smiles. The key action happens within the first 1 second, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### B31 · bộ F · dùng 0,8 s · chân dung · mặt: có
*Vị trí trong mẫu: 27,4–28,2 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Only the groom's face is visible: he is the man in the reference photo; keep his face, skin tone and hair color exactly identical to it. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Western wedding: bride in a white strapless ball gown with a veil and a pink bouquet; groom in a black tuxedo with a boutonniere; white castle-like set, hydrangea field, snow mountains, bright high-key pastel grade. Portrait of the groom in front of the white castle set, pastel hydrangea at the bottom edge. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Slow push-in; he looks at the bride off-frame and smiles. The key action happens within the first 2 seconds, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### B32 · bộ F · dùng 1,3 s · qua vai · mặt: có
*Vị trí trong mẫu: 28,2–29,5 s*

Ảnh tĩnh:
```text
Cinematic wedding film still. Only the bride's face is visible: she is the woman in the reference photo; keep her face, skin tone and hair color exactly identical to it. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Western wedding: bride in a white strapless ball gown with a veil and a pink bouquet; groom in a black tuxedo with a boutonniere; white castle-like set, hydrangea field, snow mountains, bright high-key pastel grade. The bride in a white veil extends her hand toward the groom (his back foreground, blurred), white castle set, bright light. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Slow pull-back. She smiles and places her hand in his; the veil flutters. The key action happens within the first 2 seconds, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

### B33 · bộ F · dùng 0,8 s · cận, cảnh kết · mặt: có
*Vị trí trong mẫu: 29,5–30,3 s* · Cảnh kết: fade ra cùng nhạc.

Ảnh tĩnh:
```text
Cinematic wedding film still. Only the groom's face is visible: he is the man in the reference photo; keep his face, skin tone and hair color exactly identical to it. If a master-shot image of this set is attached too, keep its outfits, location and color grade. Western wedding: bride in a white strapless ball gown with a veil and a pink bouquet; groom in a black tuxedo with a boutonniere; white castle-like set, hydrangea field, snow mountains, bright high-key pastel grade. Close shot of the groom smiling with the bride's veiled shoulder in the right foreground, green meadow behind. Photorealistic, natural skin texture, shallow depth of field, no text, no watermark.
```

Chuyển động:
```text
Slow push-in; he leans in, their foreheads touch. The key action happens within the first 2 seconds, then the movement settles. Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.
```

---

# Phụ lục 1 · Đổi sang bản Việt (gợi ý, chưa thử)

Giữ nguyên SCENE và MOTION, chỉ thay khối STYLE. Mô hình có thể nghiêng về trang phục Trung Hoa, nên **kiểm từng ảnh tĩnh bằng mắt** trước khi động hóa.

| Chương mẫu A | Gợi ý STYLE bản Việt (tiếng Anh để dán) |
|---|---|
| 1 · Chiến Quốc → thời Lý–Trần | `Ancient Vietnam, Ly-Tran era. Bride in an ao giao linh in deep red with gold hair ornaments; groom in dark lacquered armor with gold studs. Old citadel stone wall, overcast cold light, desaturated grey with vivid crimson accents, cinematic, film grain.` |
| 2 · Đường → đêm hồ cổ | `Ancient Vietnam at night by a lake, lantern-lit pagoda, warm orange-red and teal bokeh. Bride in an ao giao linh with floral hair ornaments; groom in a cream long robe with a black cap. Cinematic, film grain.` |
| 3 · Tống → cưới triều Nguyễn | `Nguyen dynasty royal wedding hall, red-and-gold. Bride in an ao nhat binh with a gold crown; groom in an ao tac with a black cap. Warm saturated red-gold light, cinematic, film grain.` |
| 4 · Dân quốc → Hà Nội/Sài Gòn thập niên 30 | `1930s Hanoi, old railway station. Bride in a white silk ao dai with a hairclip; groom in a white colonial-era suit. Muted green-grey grade, soft overcast light, cinematic, film grain.` |
| 5 · Hiện đại | Giữ nguyên STYLE chương 5, đổi quân phục thành trang phục thường ngày nếu cặp đôi không làm trong quân đội. |

# Phụ lục 2 · Xử lý lỗi thường gặp

| Lỗi | Cách xử lý |
|---|---|
| Mặt trôi hoặc khác người ở cận cảnh | Sinh **ảnh tĩnh cận cảnh riêng** từ ảnh tham chiếu (đừng cắt từ ảnh rộng); giảm chuyển động xuống "blink + slight smile"; dùng đoạn giữa clip |
| Tay/nhẫn/ngón méo | Giữ shot ≤ 0,8 giây; chuyển động tối thiểu; thử 3 phương án |
| Chữ trong ảnh sai nét (bảng, thư pháp) | Sinh phông trống, chèn chữ khi dựng |
| Hai người lẫn mặt nhau | Ảnh tham chiếu tách riêng từng người; ghi `bride` / `groom` rõ trong SCENE; tránh dùng ảnh chung làm tham chiếu |
| Trang phục đổi giữa các shot cùng bộ | Dùng ảnh gốc rộng của bộ làm tham chiếu thêm; giữ nguyên khối STYLE từng chữ |
| Video có nhạc/giọng không mong muốn | Thêm `Audio: ambient only, no music, no speech` (Flow); thay nhạc ở khâu dựng |

# Phụ lục 3 · Kết quả rà soát bộ câu lệnh (2026-11-26)

Bản đầu có các lỗi dưới đây, đã sửa trong bản này. Số liệu lấy từ phép kiểm tự động trên toàn bộ 74 shot.

| # | Lỗi bản đầu | Số shot | Hậu quả | Cách sửa |
|---|---|---|---|---|
| 1 | LOCK luôn ghi "the bride and groom ... keep both faces" dù shot chỉ có một người | 25 | Mô hình ảnh dễ vẽ thêm người còn lại vào chân dung | LOCK đổi theo người xuất hiện (cô dâu / chú rể / cả hai) |
| 2 | Shot không thấy mặt (nhìn từ sau, bàn tay) vẫn bị bắt "keep both faces" | 18 | Mâu thuẫn, mô hình có thể xoay người ra để lộ mặt | LOCK riêng: "No faces are visible", "macro, hands" |
| 3 | "shallow depth of field" ở cảnh rộng có người nhỏ | 15 | Nền nhòe, mất cảm giác không gian | Cảnh rộng dùng "deep focus" |
| 4 | A5.05: "no text" nhưng cảnh yêu cầu chữ thư pháp | 1 | Mâu thuẫn; chữ AI hay sai nét | Sinh tường trống, chèn chữ khi dựng |
| 5 | "no extra people" ở cả shot có đoàn rước/bóng người | 3 (A1.08, B22, B23) | Mô hình xóa đoàn rước | Bỏ "no extra people" khỏi đuôi (khung đầu đã quy định ai có mặt) |
| 6 | Hiệu ứng chỉ xuất hiện ở câu lệnh chuyển động (cánh hoa, pháo hoa, hơi nước) | 4 | Ảnh→video hiếm khi tự thêm vật mới, hay bị bỏ | Đưa vật vào ảnh tĩnh, chuyển động chỉ "làm nhiều hơn" |
| 7 | 38/70 câu lệnh mở bằng "Slow push-in" | 38 | Nhịp máy đơn điệu khi cắt liên tiếp | Xen kẽ tĩnh/lùi/trượt trái/trượt phải; còn khoảng một phần tư là push-in |
| 8 | Không có mốc thời gian | 70 | Chỉ dùng 0,4–3,5 giây đầu của clip 4–5 giây; hành động có thể rơi ngoài đoạn cắt | Thêm "key action within the first N seconds" |
| 9 | Đuôi phủ định ~25 từ ở mọi câu lệnh chuyển động | 70 | Google khuyên với ảnh→video chỉ mô tả chuyển động vì ảnh đã quy định chủ thể và bối cảnh; danh sách "no X" chỉ có nguồn bên thứ ba | Rút gọn đuôi, bỏ phần lặp |
| 10 | Vài câu lệnh có 2–4 hành động trong clip ngắn | 5 (A1.04, A2.07, A2.10, A3.02, A4.02) | Nguồn hướng dẫn Seedance khuyên mỗi clip ~4 giây chỉ một chủ thể, một hành động, một chuyển động máy | Rút còn một hành động chính + một chuyển động máy |
| 11 | Không nói ảnh tham chiếu nào là ai | tất cả | Hai người dễ lẫn mặt | Nhận diện bằng giới ("the woman" / "the man") và chỉ đính kèm người có mặt trong shot |

**Chưa giải quyết được (cần thử thật):**
- Quy tắc mốc thời gian (hành động trong N giây đầu) là **kinh nghiệm suy ra**, chưa kiểm với Flow hay Seedance.
- Flow có xử lý đúng ba ảnh tham chiếu (cô dâu, chú rể, ảnh gốc bộ) hay không, và có ô negative prompt hay không, chưa xác nhận.
- Seedance có xử lý câu phủ định như "no morphing" hay không: các nguồn tìm được không nói.
- Nguồn cho phần chuyển động: [Google: Best practices for Veo](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/video/best-practice); [Luma: How to Prompt Seedance 2.0](https://lumalabs.ai/learning-center/articles/how-to-prompt-seedance-2.0).

# Nguồn
- BytePlus ModelArk: [Create portrait videos with Dreamina Seedance models](https://ai.byteplus.com/ark/region:ap-southeast-1/docs/seedance-portrait-asset-guide) (chỉ đọc được qua tóm tắt tìm kiếm)
- Google: [Veo 3.1 Ingredients to Video](https://blog.google/innovation-and-ai/technology/ai/veo-3-1-ingredients-to-video/); [Create videos in Flow](https://support.google.com/flow/answer/16353334?hl=en); [5 tips for getting started with Flow](https://blog.google/technology/ai/flow-video-tips/)
- Cú pháp `@Image1` của Seedance: [Luma: How to Prompt Seedance 2.0](https://lumalabs.ai/learning-center/articles/how-to-prompt-seedance-2.0); [Magnific: How to write prompts for Seedance 2.0](https://www.magnific.com/blog/how-to-write-prompts-for-seedance-2-0/)
