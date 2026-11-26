# Video AI từ ảnh cô dâu chú rể: phân tích hai video mẫu và quy trình làm lại

> Ngày: 2026-11-26. Phạm vi theo yêu cầu: **chỉ trả lời "làm sao ra được video như mẫu từ ảnh"**. Bản quyền, giá, kiến trúc sản phẩm, kiểm duyệt: để sau.
> Với video 2, chỉ phân tích **nửa trên** (phim AI). Nửa dưới (cảnh cặp đôi ngồi tiệc phản ứng) bỏ qua.
> Hình tham chiếu: `hinh/video1-danh-sach-shot.jpg`, `hinh/video2-danh-sach-shot-nua-tren.jpg` (mỗi ô là một shot, ghi giờ bắt đầu–kết thúc).

## 1. Kết luận ngắn

1. **Không phải một clip AI dài.** Cả hai là **phim dựng ghép từ rất nhiều clip AI ngắn**: video 1 có 33 shot trong 30 giây (trung vị 0,73 giây, dài nhất 2,6 giây); nửa trên video 2 có 47 đoạn trong 52 giây (trung vị 0,97 giây, dài nhất 3,5 giây, trong đó 5 đoạn là thẻ chương). Mỗi shot **nhiều khả năng** là một clip AI 4–5 giây được **cắt lấy 0,4–2,5 giây đẹp nhất** (suy ra từ độ dài shot và từ việc mô hình hiện nay sinh clip tối thiểu 4–5 giây; không có cách kiểm trực tiếp).
2. **Hai nhân vật giữ nguyên gương mặt qua mọi bối cảnh và trang phục** (cổ trang, Đường, Tống, dân quốc, quân phục, hiện đại, váy cưới Tây). Điều đó chỉ làm được khi mọi shot bắt đầu từ ảnh/khuôn mặt tham chiếu của cặp đôi, không phải từ prompt chữ thuần.
3. **Chuyển động trong mỗi shot rất nhỏ và chỉ có một ý**: đẩy máy chậm + mỉm cười, gió thổi vạt áo, quay đầu, nắm tay. Chỉ vài shot "anh hùng" có chuyển động lớn (dải lụa đỏ tung bay, bước về phía máy).
4. **Phần "ra dáng phim" chủ yếu đến từ khâu dựng sau**: nhịp cắt nhanh, nhạc có lời, phụ đề lời hát, thẻ chương, chỉnh màu theo từng chương. Khâu này không cần AI.
5. Quy trình tái tạo: **ảnh cặp đôi → ảnh tĩnh từng cảnh (khóa gương mặt) → ảnh động hóa 4–5 giây → cắt ngắn → dựng theo nhạc + phụ đề + thẻ chương + chỉnh màu.** Chi tiết ở mục 4.

Chưa xác định được: **mô hình nào đã sinh ra hai video mẫu** (file đã bị Facebook mã hóa lại, không còn metadata). Chất lượng (da thật, vải mô phỏng đúng vật lý, chữ Hán đọc được trong cảnh) khớp với các mô hình thế hệ hiện tại, nhưng không đủ để chỉ đích danh.

## 2. Đặc điểm kỹ thuật chung

| Hạng mục | Quan sát (đo trực tiếp trên file) |
|---|---|
| Khung hình | Cả hai file là 720×1280 (9:16) nhưng **hình thật là 16:9**: video 1 là một khung 720×404 đặt giữa nền đen; video 2 nửa trên là khung 16:9 cao khoảng 405 px. Clip gốc sinh ra ở **16:9**, bản đăng Facebook mới bọc vào khung dọc. |
| Độ phân giải | Bản mẫu chỉ ~720 px do bị nén lại. Không suy ra được độ phân giải gốc. |
| Nhịp cắt | Cắt cứng là chính; dissolve chéo dùng ít (ví dụ video 1 trong đoạn giây 3,1–5,7: chân dung sườn xám mờ chồng sang chú rể). |
| Âm thanh | Nhạc có lời liên tục, AAC stereo 44,1 kHz, độ to ~ -14 LUFS. Không thoại, không hiệu ứng âm. Nhân vật không nói nên **không dùng âm thanh sinh sẵn của mô hình**; nhạc được thêm ở khâu dựng. |
| Khớp nhạc | Chưa kết luận được: phép đo onset thô của tôi cho thấy điểm cắt **không bám sát beat** (khoảng cách tới onset gần nhất ngang mức ngẫu nhiên). Cảm giác là cắt theo **câu hát/đoạn nhạc** hơn theo nhịp trống. |
| Phụ đề | Lời hát tiếng Trung, chữ trắng có chân (kiểu Tống thể), **giữa đáy khung hình, mỗi lần một dòng**, đổi mỗi 2–5 giây theo câu hát. Lời ở video 2 khớp với bài 《美丽的神话》 (tôi suy ra từ chữ hiện trên hình, chưa nghe để xác nhận). |
| Chỉnh màu | Mỗi chương một tông riêng (xem mục 3.2). Đồng bộ màu giữa các shot khá tốt, nhiều khả năng đã chỉnh màu/LUT sau khi ghép. |

## 3. Nội dung từng video

### 3.1. Video 1: "album nhiều phong cách động lên" (30 giây, 33 shot)

Không có cốt truyện; là **chuỗi phong cách ăn ảnh của cùng một cặp đôi**, kết bằng cảnh cưới Tây sáng, rộng.

| Giờ (giây) | Nội dung | Ghi chú dựng |
|---|---|---|
| 0,3–2,4 | Cặp đôi hiện đại ở phố cổ (áo đồng phục, áo khoác dài) | Shot ~0,7 giây, nhìn nhau |
| 1,7–3,1 | Hai shot cổ trang mùa đông (cột đỏ, cổ lông, mũ phượng) | Cận mặt |
| 3,1–5,7 | Cô dâu sườn xám xanh lá, hoa cài tóc vàng → **dissolve** sang chú rể vest xám | Shot dài nhất nhóm đầu |
| 5,7–7,3 | Nắm tay/trao nhẫn trên bậc thềm; cặp cổ trang; chàng đưa bó hồng cho nàng trước nhà kính | Có một shot rộng |
| 7,3–8,8 | Hán phục hồng giữa vườn hoa | Hai người cận nhau |
| 8,8–12,5 | **Cảnh chèn**: bộ trà + hộp gỗ; chú rể ngửi hoa hồng; lá thư; bàn tay đeo nhẫn trong ống tay thêu; trao nhẫn | Mỗi cảnh chèn 0,4–1,0 giây |
| 12,5–15,6 | Song cửa gỗ chạm lộ núi tuyết; chân dung hán phục cầm ô giấy; chân dung cổ trang sau lưới gỗ | Chân dung dọc nền núi |
| 15,6–17,7 | Chân dung hán phục trắng, sườn xám, cô dâu hiện đại mỉm cười sau bó hồng hồng | Đẩy máy + cười hé |
| 17,7–20,5 | **Đám cưới đỏ**: cô dâu che quạt tròn rồi hạ xuống; kiệu/đoàn rước thảm đỏ; sân đình | Tông đỏ-vàng rực |
| 20,5–23,2 | Cặp cổ trang cạnh mái ngói xanh; cặp sườn xám–vest trước bình phong chạm | Sáng, trời xanh |
| 23,2–30,3 | **Kết**: tòa lâu đài trắng + cánh đồng cẩm tú cầu, cặp váy cưới–vest đen bước về phía máy; xen cận mặt, hán phục cầm ô trên nền hoa, chú rể chân dung, cô dâu mạng che trao tay, cận hai người trên đồng cỏ | Chuyển sáng cao-key, cắt nhanh dần |

**Nhận xét:** các bối cảnh **được tái dùng nhiều góc** (lâu đài trắng 3 shot, hán phục cầm ô 3 shot, sườn xám 6 shot). Nghĩa là mỗi "bộ ảnh" (trang phục + bối cảnh) được dựng thành một cụm ảnh tĩnh nhiều góc (rộng, vừa, cận, qua vai, cảnh chèn) rồi mới động hóa từng ảnh.

### 3.2. Video 2, nửa trên: "Năm kiếp" (52 giây, 5 chương)

Có **cốt truyện**: cùng một cặp đôi tái sinh qua 5 kiếp, mỗi chương mở bằng một thẻ chương tiếng Anh.

| Chương | Giờ (giây) | Bối cảnh – trang phục | Tông màu | Các loại shot |
|---|---|---|---|---|
| 1. Chiến Quốc | 0–14,4 | Tường thành xám, nàng áo đỏ và chàng giáp đen, cành mai đỏ | Đỏ-đen trên nền xám lạnh | Rộng nhìn từ sau lưng, **dải lụa đỏ tung bay**, nàng xoay váy, cận chàng, **cảnh chèn bàn tay trao vật/đeo nhẫn**, cổng vòm tối |
| 2. Đường | 14,4–28,8 | Đêm bên hồ, đình đài đèn lồng, nàng áo Đường đỏ-xanh, chàng áo kem | Cam-đỏ-xanh ngọc, bokeh sáng | Cảnh chèn hoa trong bình, nàng ngồi lan can, **cảnh chèn buộc dây/túi lên tay áo**, hai người nhìn ra hồ **có pháo hoa nở**, **ôm, nàng tựa vai chàng** |
| 3. Tống | 28,8–35,5 | Phòng cưới đỏ-vàng, mũ phượng, quạt tròn, chữ 囍, hai người bái đường (nhìn từ sau) | Đỏ-vàng ấm, bão hòa cao | Chàng áo đỏ cầm cuộn/bảng bên cửa sổ, nàng mũ phượng, rộng đại sảnh |
| 4. Dân quốc | 35,5–43,0 | Sân ga tàu xanh lá, nàng áo ren trắng, chàng quân phục trắng có hàng cầu vai; giá vẽ có chân dung chàng; ảnh cưới có chim bồ câu | Xanh lá ngả xám, giảm bão hòa | Nàng bịt tai vì tàu, chàng ôm an ủi, cận chân dung, ảnh cưới chim bồ câu |
| 5. Hiện đại | 43,0–51,8 | Phòng triển lãm tường trắng, nàng áo khoác dài, chàng quân phục rằn ri; **chữ thư pháp lớn trên tường "纯属偶然"** | Trắng-xám sáng, rất sạch | Nàng nhìn tranh, cận mặt ngạc nhiên, cận chàng, bàn tay cầm điện thoại, **cắt nhanh dần (0,2–0,6 giây) ở cuối**, kết cảnh hai người trên nền xanh nhạt |

**Thẻ chương (đã đo):** dài ~1,2–1,5 giây, nền đen; một **đám khói/mực trắng** bung ra rồi tan thành hạt, để lại chữ trắng có chân: "1st Life: Warring-States Period", "2nd Life: Tang Dynasty", "3rd Life: Song Dynasty", "4th Life: Republican-Era China", "5th Life: Modern-Day". Đây là **lớp hiệu ứng chữ**, không phải cảnh AI (nhiều khả năng là hiệu ứng mẫu có sẵn hoặc làm bằng công cụ dựng).

**Chi tiết đáng chú ý cho việc tái tạo:**
- Trong chương 1 có một shot dài 3,5 giây (nàng xoay váy, giây 5,7–9,2), các shot còn lại 0,4–2,5 giây. Shot dài dành cho **cảnh "anh hùng" có chuyển động**, shot ngắn dành cho chân dung và cảnh chèn.
- Chữ trong cảnh ("纯属偶然", bảng triển lãm) đọc được: ảnh tĩnh nhiều khả năng được sinh trước bằng mô hình ảnh biết viết chữ, rồi mới động hóa.
- Mỗi chương **kết ở một khoảnh khắc "gặp/ôm/trao"**, đây là khung cốt truyện có thể thành mẫu.

## 4. Quy trình tái tạo từ ảnh cô dâu chú rể

### Bước 0. Gói nhận diện (đầu vào)
- Mỗi người 2–4 ảnh: chính diện, hơi nghiêng 3/4, tóc rõ, không kính râm, không filter nặng, ánh sáng đều. Thêm 1 ảnh toàn thân nếu có.
- Kiểm tra tự động: một khuôn mặt, đủ lớn, không mờ. Ảnh xấu ⇒ mọi shot sau đều xấu.

### Bước 1. Kịch bản shot (ra danh sách như mục 3)
- Chọn chủ đề, chia thành 3–5 "bộ" (trang phục + bối cảnh) hoặc 5 chương.
- Mỗi bộ ghi 3–7 shot với **kích cỡ cảnh** (rộng / vừa / cận / qua vai / cảnh chèn bàn tay), **một hành động**, **một chuyển động máy**, dòng lời hát tương ứng.
- Tổng 25–35 shot cho video 30 giây; 40–45 shot cho video 50 giây.
- Cốt truyện mẫu dễ nhân bản: "Năm kiếp" (gợi ý bản Việt: Lý/Trần/Lê/Nguyễn/hiện đại, áo tấc, nhật bình, áo dài) hoặc "album nhiều phong cách".

### Bước 2. Ảnh tĩnh từng shot (khóa gương mặt)
Làm bằng **mô hình ảnh có tham chiếu** (Nano Banana trong Flow/Gemini, Seedream, Kling Image/Omni, Flux Kontext, GPT-image… đổi được). Quy tắc:
1. Làm **ảnh gốc rộng** của mỗi bộ trước (cặp đôi + trang phục + bối cảnh), duyệt tay.
2. Các góc còn lại sinh **từ ảnh gốc đó** ("same couple, same location, same outfits, close-up of the bride"), để trang phục và nền không trôi.
3. Cảnh chèn (bàn tay, nhẫn, hoa, dây) không cần mặt, sinh bằng prompt chữ cùng bảng màu.

Mẫu prompt ảnh (tiếng Anh cho ổn định):
```
Cinematic wedding film still, [medium close-up / wide / over-the-shoulder].
The same couple as the reference photos, keep both faces exactly the same.
Bride in [costume], groom in [costume], [location], [time of day, light],
[color grade, e.g. teal and orange / desaturated green / high-key white],
shallow depth of field, 35mm lens, photorealistic skin, no text, no watermark.
```

> Mẫu trên dành cho shot có **cả hai người**. Shot chỉ có một người phải đổi câu thứ hai thành `Only the bride's face is visible: she is the woman in the reference photo` (hoặc `the groom's ... he is the man`), nếu không mô hình dễ vẽ thêm người còn lại. Các biến thể đầy đủ nằm ở `bo-cau-lenh-tung-shot.md` mục 2.

### Bước 3. Động hóa (ảnh → clip 4–5 giây)
Mỗi ảnh một clip, **một chuyển động duy nhất**. Công thức:
```
[camera move]. [one subtle subject action]. [ambient motion]. Cinematic, natural motion,
faces stay identical to the first frame, no cut, no text, no extra people.
```
Bảy kiểu chuyển động rút ra từ hai mẫu:

| Kiểu | Ví dụ trong mẫu | Gợi ý prompt chuyển động |
|---|---|---|
| Chân dung đẩy máy | V1 cô dâu ôm hồng, V1 sườn xám | `slow push-in, she slowly breaks into a soft smile, hair moves slightly` |
| Rộng, lùi máy | V2 tường thành | `slow pull-back, tiny figures stand still, wind in the sleeves` |
| Bước về phía máy | V1 cặp váy cưới | `static camera, the couple walks slowly toward the camera holding hands` |
| Vải tung bay (shot anh hùng) | V2 dải lụa đỏ | `low-angle, long red ribbons whip in the wind, she turns her head slowly` |
| Cảnh chèn bàn tay | V1 trao nhẫn, V2 buộc dây | `macro, his fingers tie the red cord on her sleeve, shallow focus` |
| Hai người nhìn ra xa (từ sau lưng) | V2 bên hồ đêm | `static, two figures from behind look at the lake, lights flicker, fireworks bloom in the sky` |
| Ôm | V2 nàng tựa vai | `slow push-in, she rests her head on his shoulder, he closes his eyes` |

Thông số khuyến nghị: tỉ lệ **9:16** nếu video phát trên điện thoại (mẫu là 16:9 bọc khung dọc); xem thử ở độ phân giải thấp, chốt shot tốt mới tải bản cao; **2–3 phương án mỗi shot** rồi chọn.

Bắt đầu từ ảnh cũng là cách các công cụ bạn nêu hoạt động:
- **Google Flow (Veo 3.1)**: "Frames to Video" (ảnh đầu/ảnh cuối), "Ingredients to Video" (nhiều ảnh tham chiếu), "Extend". Theo trang hỗ trợ của Google, Ingredients không có ở hạng Quality và bị giới hạn 8 giây ở hạng Lite.
- **Kling 3.0**: gắn tối đa 3 "element" khi có khung đầu/khung đầu–cuối; mỗi element cần 2–4 ảnh (1 chính + tối đa 3 phụ). Bản Omni nhận nhiều ảnh tham chiếu hơn. Tên trường API chưa xác nhận được.
- **Seedance**: các nguồn thứ ba nói bản 2.0 nhận tối đa 9 ảnh tham chiếu, clip 4–15 giây. Theo các bài báo, **Seedance 2.5** (công bố 31/07/2026) tạo được clip 30 giây liền và nhận tới 50 đầu vào tham chiếu, truy cập qua Jimeng/Dreamina, API qua BytePlus ModelArk. Độ phân giải tối đa và chi tiết giới hạn còn mâu thuẫn giữa các nguồn, chưa kiểm với tài liệu chính thức.

### Bước 4. Dựng (không cần AI)
1. **Cắt shot**: lấy khoảng giây 0,3–2,5 của clip (bỏ đầu/cuối vì dễ méo mặt). Độ dài gợi ý theo mẫu: chân dung 1,0–1,7 giây; cảnh chèn 0,4–0,8 giây; shot anh hùng 2,5–3,5 giây; đoạn cao trào 0,3–0,6 giây.
2. **Ghép**: cắt cứng là chính, dissolve 0,5–0,9 giây ở vài chỗ chuyển bộ.
3. **Nhạc + lời**: một bài có lời, chia câu hát thành mốc thời gian, **đặt mỗi câu một đoạn cảnh**. Phụ đề: chữ trắng có chân, giữa đáy, hiện/tắt mờ ~0,2 giây.
4. **Thẻ chương** (nếu theo "Năm kiếp"): nền đen ~1,3 giây, khói trắng tan thành hạt, chữ hiện ra. Dùng video khói có kênh alpha/luma matte hoặc làm bằng công cụ dựng.
5. **Chỉnh màu theo chương** (LUT): đêm bên hồ cam-đỏ-xanh ngọc; dân quốc xanh lá ngả xám; hiện đại trắng-xám sáng; cưới Tây high-key. Thêm hạt phim nhẹ để các clip từ nhiều lần sinh nhìn như một phim.
6. Xuất MP4 H.264 + AAC, ~ -14 LUFS.

Phần lớn khâu 1–6 làm được bằng ffmpeg (cắt, ghép, phụ đề, LUT, lớp phủ khói), nên có thể dùng lại worker `video` đang có ở `scripts/worker/video.ts` (P6-02b) làm nền cho phần dựng.

### Bước 5. Chọn mô hình bằng thử nghiệm (nên làm trước khi xây)
Chạy **cùng 6 ảnh tĩnh** (2 chân dung, 1 rộng, 1 vải bay, 1 bàn tay, 1 ôm) qua Flow/Veo 3.1, Kling 3.0 và Seedance 2.x/2.5 với cùng prompt chuyển động, rồi chấm:

| Tiêu chí | Cách chấm |
|---|---|
| Giữ gương mặt | So khuôn mặt khung 0 và khung giữa clip, bằng mắt và (nếu cần) độ tương đồng khuôn mặt |
| Chuyển động tự nhiên | Có méo cằm/tay/ngón khi quay đầu hoặc đưa tay không |
| Tuân thủ prompt | Có làm đúng một chuyển động yêu cầu không |
| Chi phí và thời gian mỗi clip | Ghi lại để quyết định sau |
| Có API dùng được từ Việt Nam không | Kiểm tra trước khi cam kết |

## 5. Rủi ro kỹ thuật cần biết trước

- **Gương mặt trôi ở cận cảnh và khi quay đầu**: cách xử lý trong mẫu là cắt rất ngắn và dùng ảnh tĩnh cận cảnh riêng. Đừng ép mô hình tự suy ra cận cảnh từ ảnh rộng.
- **Bàn tay, nhẫn, ngón tay** hay méo: mẫu giấu bằng cảnh chèn 0,4–1,0 giây.
- **Trang phục lịch sử**: nhiều khả năng mô hình nghiêng về trang phục Trung Hoa (chưa thử); muốn bản Việt (áo tấc, nhật bình, áo dài) phải mô tả chi tiết và kiểm bằng mắt.
- **Lệch màu giữa các clip**: luôn chỉnh màu sau khi ghép.
- **Thông tin sản phẩm đổi nhanh**: giới hạn và tính năng của Flow/Kling/Seedance đổi theo tháng; các số trong tài liệu này lấy từ tìm kiếm ngày 2026-11-26, phần lớn qua nguồn thứ ba, cần kiểm lại trên tài liệu chính thức trước khi viết mã.

## 6. Nguồn
- Google: [Veo 3.1 và Flow](https://blog.google/technology/ai/veo-updates-flow/); [Flow models & supported features](https://support.google.com/flow/answer/16352836)
- Kling: [Kling VIDEO 3.0 Model Guide](https://kling.ai/quickstart/klingai-video-3-model-user-guide); [Element Library](https://kling.ai/quickstart/klingai-element-library-3-user-guide); [Kling 3.0 Omni](https://kling.ai/quickstart/klingai-video-3-omni-model-user-guide)
- Seedance: [Seedance 2.5 (Seed blog)](https://seed.bytedance.com/en/blog/one-take-creation-flexible-referencing-introducing-seedance-2-5); [BytePlus: Seedance 2.5](https://byteplus.com/en/blog/dreamina-seedance2-5); [fal: Seedance 2.0 reference-to-video](https://fal.ai/models/bytedance/seedance-2.0/fast/reference-to-video)
