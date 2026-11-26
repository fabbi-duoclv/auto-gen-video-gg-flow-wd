#!/usr/bin/env python3
"""Sinh 2 file Excel (định dạng của dự án auto-gen-video-gg-flow) từ dữ liệu shot trong gen_prompts.py.
Chạy:  python3 -I build_excel.py THƯ_MỤC_RA
"""
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_prompts as g
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill
from openpyxl.utils import get_column_letter

SCENE_HEADERS = ["Timeline từ - đến", "Cảnh", "Tên cảnh", "Loại", "Nhân vật", "Góc máy", "Chuyển động camera", "Mood",
                 "Thời lượng (giây)", "Chuyển cảnh", "Pexels keyword chính", "Pexels keyword phụ", "Prompt ảnh",
                 "Prompt first frame", "Prompt Veo", "Reference character ids"]
CHAR_HEADERS = ["ID", "Tên", "Vai trò", "Anchor text", "Negative constraints", "Prompt headshot", "Prompt portrait 3/4", "Prompt full body", "Ảnh tham chiếu (đường dẫn)"]

BRIDE, GROOM = "Cô dâu", "Chú rể"
NAMES = {"B": BRIDE, "G": GROOM, "BG": BRIDE + ", " + GROOM}
IDS = {"B": "1", "G": "2", "BG": "1, 2"}

CHARS = [
    ["1", BRIDE, "Cô dâu",
     "[ĐIỀN: mô tả ngoại hình theo ảnh thật của cô dâu: độ tuổi, kiểu tóc, màu tóc, màu da, nét đặc trưng]",
     "Giữ nguyên khuôn mặt, màu da và màu tóc như ảnh tham chiếu; không đổi mặt, không làm đẹp quá mức, không thêm người khác.",
     "", "", "", "wedding-video/photos/co-dau.jpg"],
    ["2", GROOM, "Chú rể",
     "[ĐIỀN: mô tả ngoại hình theo ảnh thật của chú rể: độ tuổi, kiểu tóc, màu tóc, màu da, nét đặc trưng]",
     "Giữ nguyên khuôn mặt, màu da và màu tóc như ảnh tham chiếu; không đổi mặt, không làm đẹp quá mức, không thêm người khác.",
     "", "", "", "wedding-video/photos/chu-re.jpg"],
]

HELP = [
    "HƯỚNG DẪN SỬ DỤNG FILE NÀY",
    "",
    "1. Sheet 'Scenes' và 'Characters' đúng định dạng của dự án auto-gen-video-gg-flow (đọc bằng src/excel-reader.ts). Sheet này bị bỏ qua khi đọc.",
    "2. Mỗi dòng Scenes là một shot, Loại = AI-VID: 'Prompt first frame' (cột N) là prompt ẢNH TĨNH, 'Prompt Veo' (cột O) là prompt CHUYỂN ĐỘNG.",
    "3. Cột 'Prompt ảnh' (M) trùng cột N, để khớp quy tắc ưu tiên của excel-reader.",
    "4. Sheet Characters, cột 9 'Ảnh tham chiếu (đường dẫn)': ẢNH THẬT của cô dâu / chú rể (đặt vào wedding-video/photos/, tên co-dau.jpg, chu-re.jpg).",
    "   Có đường dẫn ⇒ dự án upload ảnh lên Flow và gắn đúng người theo NỘI DUNG ảnh (src/ref-photos.ts). Cột 'Prompt headshot' để trống có chủ đích.",
    "5. Cột 'Nhân vật' dùng đúng tên ở sheet Characters (Cô dâu / Chú rể). Shot không có người (vật chèn) để trống.",
    "6. 'Timeline từ - đến' chỉ để đặt tên file đầu ra (scene_XX_<phút>p<giây>_vid.mp4). Độ dài giữ lại khi cắt nằm ở 'Tên cảnh' (ví dụ 'dùng 1,4 s').",
    "7. Anchor text và Negative constraints chưa được dự án mẫu ghép vào prompt khi chạy (xem REBUILD_SPEC.md mục 12).",
    "8. Prompt viết tiếng Anh có chủ đích. Cách ghép prompt và lý do: docs/bo-cau-lenh-tung-shot.md.",
]

def mmss(t):
    t = int(round(t)); return "%02d:%02d" % (t // 60, t % 60)

def write_book(path, rows, title):
    wb = Workbook()
    ws = wb.active; ws.title = "Scenes"
    ws.append(SCENE_HEADERS)
    for r in rows: ws.append(r)
    cs = wb.create_sheet("Characters")
    cs.append(CHAR_HEADERS)
    for r in CHARS: cs.append(r)
    hs = wb.create_sheet("Huong dan")
    for line in HELP: hs.append([line])
    hs["A1"].font = Font(bold=True, size=13)
    hs.column_dimensions["A"].width = 150
    # định dạng nhẹ để dễ đọc
    fill = PatternFill("solid", fgColor="DDEBF7")
    for sh in (ws, cs):
        for c in sh[1]:
            c.font = Font(bold=True); c.fill = fill
            c.alignment = Alignment(wrap_text=True, vertical="top")
        sh.freeze_panes = "A2"
    widths = {1: 16, 2: 7, 3: 44, 4: 9, 5: 18, 6: 20, 7: 38, 8: 24, 9: 10, 10: 22, 11: 6, 12: 6, 13: 70, 14: 70, 15: 70, 16: 12}
    for i, w in widths.items(): ws.column_dimensions[get_column_letter(i)].width = w
    for i, w in {1: 5, 2: 12, 3: 12, 4: 40, 5: 40, 6: 14, 7: 14, 8: 14, 9: 34}.items(): cs.column_dimensions[get_column_letter(i)].width = w
    wb.save(path)
    print(path, len(rows), "dòng Scenes")

def rows_A():
    out = []
    # scene 0: nền khói thẻ chương (sinh 1 lần, dùng lại 5 lần)
    out.append(["00:00 - 00:02", 0, "Nền khói thẻ chương (sinh 1 lần, dùng lại 5 lần; chữ chèn khi dựng)", "AI-VID", "", "macro", "slow", "Thẻ chương", 2, "—", "", "",
                "Pure black background with a small dense white ink-smoke cloud forming in the center, macro, soft, centered, no text, no watermark.",
                "Pure black background with a small dense white ink-smoke cloud forming in the center, macro, soft, centered, no text, no watermark.",
                "A dense white ink-smoke cloud swells slowly in the center of the frame, then disperses into fine floating particles, macro, soft, centered. No text, no cuts.",
                ""])
    A_M = g.diversify([(x[1], x[7]) for x in g.A])
    t = 0.0
    last_of_chapter = {}
    for x in g.A: last_of_chapter[x[0]] = x[1]
    for n, (c, code, tpos, dur, size, face, scene, motion) in enumerate(g.A, start=1):
        kind = "macro" if code in g.A_MACRO else "normal"
        who = g.WHO_A[code]
        still = g.lock(who, face, kind) + g.A_STYLE[c][1] + " " + scene + g.tail(size, kind)
        mov = A_M[code] + g.neg(face, kind, dur)
        name = "A%s · %s · %s · dùng %s s · mặt: %s" % (code, g.A_STYLE[c][0], size, g.vn(dur), "có" if face else "không")
        trans = "Cắt sang thẻ chương kế" if last_of_chapter[c] == code and c < 5 else "Cắt cứng"
        out.append(["%s - %s" % (mmss(t), mmss(t + dur)), n, name, "AI-VID", NAMES[who], size, A_M[code].split(". ")[0].rstrip("."), g.A_STYLE[c][0],
                    int(math.ceil(dur)), trans, "", "", still, still, mov, IDS[who]])
        t += dur
    return out

def rows_B():
    out = []
    B_M = g.diversify([(x[1], x[7]) for x in g.B])
    t = 0.0
    for n, (s, code, tpos, dur, size, face, scene, motion, note) in enumerate(g.B, start=1):
        kind = "object" if code in g.B_OBJECT else ("macro" if code in g.B_MACRO else "normal")
        who = g.WHO_B[code]
        st = g.OBJ_STYLE if kind == "object" else g.B_STYLE[s][1]
        still = g.lock(who, face, kind) + st + " " + scene + g.tail(size, kind)
        mov = B_M[code] + g.neg(face, kind, dur)
        name = "B%s · %s · %s · dùng %s s · mặt: %s" % (code, g.B_STYLE[s][0], size, g.vn(dur), "có" if face else "không")
        trans = "Dissolve chéo ~0,8 s sang cảnh kế" if code == "05a" else "Cắt cứng"
        chars = "" if kind == "object" else NAMES[who]
        ids = "" if kind == "object" else IDS[who]
        out.append(["%s - %s" % (mmss(t), mmss(t + dur)), n, name, "AI-VID", chars, size, B_M[code].split(". ")[0].rstrip("."), g.B_STYLE[s][0],
                    int(math.ceil(dur)), trans, "", "", still, still, mov, ids])
        t += dur
    return out

if __name__ == "__main__":
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    write_book(os.path.join(out, "ngu-kiep.xlsx"), rows_A(), "Ngũ kiếp")
    write_book(os.path.join(out, "album-phong-cach.xlsx"), rows_B(), "Album nhiều phong cách")
