#!/usr/bin/env python3
"""Sinh docs/research/2026-11-video-ai-mau/bo-cau-lenh-tung-shot.md từ dữ liệu shot. Chạy: python3 -I gen_prompts.py OUT.md"""
import sys, re

def vn(x):  # 1.7 -> "1,7"
    return ("%g" % x).replace(".", ",")

# ---------- khối dùng chung (sinh theo người xuất hiện trong shot) ----------
import math
MASTER = " If a master-shot image of this set is attached too, keep its outfits, location and color grade."
_P = {"B": ("the bride's", "she", "the woman", "her", "the bride"), "G": ("the groom's", "he", "the man", "his", "the groom")}

def lock(who, face, kind="normal"):
    if kind == "object":
        return "Cinematic still life, no people. "
    if kind == "macro":
        owner = {"B": "the bride's", "G": "the groom's", "BG": "the bride's and the groom's"}[who]
        return ("Cinematic macro still, no faces visible. The hands are %s, from the reference photos: keep skin tone and the outfit sleeves consistent with them." % owner) + MASTER + " "
    if face:
        if who == "BG":
            core = ("Both faces are visible: the bride is the woman and the groom is the man in the reference photos; "
                    "keep both faces, skin tone and hair color exactly identical to the references.")
        else:
            poss, pro, noun, pp, name = _P[who]
            core = ("Only %s face is visible: %s is %s in the reference photo; keep %s face, skin tone and hair color "
                    "exactly identical to it." % (poss, pro, noun, pp))
    else:
        if who == "BG":
            core = ("No faces are visible; the people are the bride and the groom from the reference photos: keep hair "
                    "color, skin tone and body build consistent with the references.")
        else:
            poss, pro, noun, pp, name = _P[who]
            core = ("No face is visible; the person is %s (%s in the reference photo): keep %s hair color, skin tone "
                    "and body build consistent with it." % (name, noun, pp))
    return "Cinematic wedding film still. " + core + MASTER + " "

def tail(size, kind="normal"):
    if kind == "macro":
        return " Photorealistic macro, shallow focus, no text, no watermark."
    if kind == "object":
        return " Photorealistic, soft bokeh, no text, no watermark."
    if "rộng" in size:
        return " Photorealistic, deep focus with everything sharp, natural skin texture, no text, no watermark."
    return " Photorealistic, natural skin texture, shallow depth of field, no text, no watermark."

def neg(face, kind, dur):
    n = max(1, math.ceil(dur + 0.3))
    when = " The key action happens within the first %d second%s, then the movement settles." % (n, "" if n == 1 else "s")
    if kind in ("macro", "object"):
        end = " No text, no cuts."
    elif face:
        end = " Faces and outfits stay identical to the first frame; no morphing, no text, no cuts."
    else:
        end = " Outfits stay identical to the first frame; no morphing, no text, no cuts."
    return when + end

ALT = ["Static camera with a slight handheld sway.", "Slow pull-back.", "Slow slide to the left.", "Slow slide to the right."]
def diversify(seq):
    """seq: [(key, motion)] -> {key: motion}. Cứ shot 'Slow push-in' thứ chẵn/lẻ xen kẽ đổi sang chuyển động máy khác."""
    out, i = {}, 0
    for key, m in seq:
        mm = re.match(r"^Slow push-in[.;]\s*", m)
        if mm:
            if i % 2 == 1:
                rest = m[mm.end():]
                rest = rest[:1].upper() + rest[1:]
                m = ALT[(i // 2) % len(ALT)] + " " + rest
            i += 1
        out[key] = m
    return out

WHO_A = {"1.01":"B","1.02":"BG","1.03":"B","1.04":"BG","1.05":"G","1.06":"BG","1.07":"B","1.08":"B","1.09":"B",
 "2.01":"B","2.02":"B","2.03":"G","2.04":"B","2.05":"B","2.06":"BG","2.07":"G","2.08":"BG","2.09":"BG","2.10":"BG","2.11":"BG","2.12":"BG",
 "3.01":"G","3.02":"B","3.03":"BG","3.04":"BG",
 "4.01":"B","4.02":"BG","4.03":"BG","4.04":"BG","4.05":"G","4.06":"BG",
 "5.01":"B","5.02":"B","5.03":"B","5.04":"G","5.05":"BG","5.06":"B","5.07":"B","5.08":"G","5.09":"BG"}
A_MACRO = {"1.06","2.01","2.08","5.06"}
WHO_B = {"01":"BG","02":"G","03":"B","04":"G","05a":"B","05b":"G","06":"BG","07":"BG","08":"BG","09":"BG","10":"BG","11":"G","12":"B","13":"B",
 "14":"BG","15":"BG","16":"B","17":"B","18":"B","19":"B","20":"B","21":"B","22":"BG","23":"BG","24":"BG","25":"BG","26":"BG",
 "27":"B","28":"B","29":"B","30":"B","31":"G","32":"B","33":"G"}
B_MACRO = {"12","13"}
OBJ_STYLE = "1930s romance mood, dark wooden interior, moody teal-green grade."
B_OBJECT = {"10"}

# ---------- MẪU A: Ngũ kiếp (nửa trên video 2) ----------
A_STYLE = {
 1: ("Chương 1 · Chiến Quốc", "Ancient China, Warring States era. Bride in a flowing crimson hanfu with gold hair ornaments; groom in black lacquered scale armor with gold studs. Grey brick city wall, overcast cold daylight, desaturated cool grey with vivid crimson accents, anamorphic cinematic look, fine film grain."),
 2: ("Chương 2 · Đường", "Ancient China, Tang dynasty, night by a lake. Bride in a teal-and-red embroidered Tang robe with floral hair ornaments; groom in a cream round-collar robe with a black futou hat. Glowing red-gold pavilions and lanterns, warm orange-red and teal bokeh reflecting on water, cinematic look, fine film grain."),
 3: ("Chương 3 · Tống", "Ancient China, Song dynasty wedding. Red-and-gold wedding hall, red drapes, hanging lanterns, double-happiness symbol. Bride in a red wedding robe with a golden phoenix crown; groom in an orange-red official robe with a black winged hat. Warm saturated red-gold light, cinematic look, fine film grain."),
 4: ("Chương 4 · Dân quốc", "Republican-era China, 1930s. Green vintage train station platform with a green carriage. Bride in a white lace blouse and dark skirt with a hairclip; groom in a white dress military uniform with gold epaulettes and medals. Muted green-grey grade, soft overcast light, cinematic look, fine film grain."),
 5: ("Chương 5 · Hiện đại", "Modern day. Bright minimalist art gallery, white walls, soft diffused daylight. Bride in a beige trench coat with long hair; groom in a camouflage field uniform. Clean pale cyan-grey grade, cinematic look, fine film grain."),
}
A_TITLES = [
 (1, "0,0–1,2", "1st Life: Warring-States Period"),
 (2, "14,4–15,6", "2nd Life: Tang Dynasty"),
 (3, "27,5–28,8", "3rd Life: Song Dynasty"),
 (4, "35,5–36,8", "4th Life: Republican-Era China"),
 (5, "43,0–44,5", "5th Life: Modern-Day"),
]
# (chương, mã, thời điểm trong mẫu, độ dài dùng, cỡ cảnh, thấy mặt, SCENE, MOTION)
A = [
 (1,"1.01","1,2–2,9",1.7,"rộng, nhìn từ sau",False,
  "Wide low-angle back view of the bride standing on top of the city wall, long crimson ribbons and cloak streaming in the wind, small figure against a pale sky.",
  "Low-angle static camera with a slow upward tilt. The long red ribbons whip and flow strongly in the wind; the bride stays still with her back to the camera."),
 (1,"1.02","2,9–4,3",1.4,"rộng",False,
  "Wide shot, the couple stand apart in a grey brick wall corridor, the bride in red and the groom in black armor, tiny figures, a few red petals drifting in the air, the wall receding in depth.",
  "Slow push-in. The bride's sleeves drift in the wind, the groom stands motionless, a few petals blow past."),
 (1,"1.03","4,3–5,7",1.4,"vừa-cận",True,
  "Medium close-up of the bride smiling softly, holding a branch of red plum blossoms near her face; the groom's black-armored shoulder soft-focus in the foreground.",
  "Slow push-in. She turns her gaze toward the groom and her smile widens slightly; the blossoms sway gently."),
 (1,"1.04","5,7–9,2",3.5,"vừa-rộng, shot anh hùng",True,
  "Medium-wide shot in a grey brick corridor: the bride in a long crimson cloak holds a plum blossom branch, the groom in black armor stands facing her.",
  "Slow orbit around the couple. The bride spins slowly, her crimson cloak flaring and swirling; plum blossoms drift; the groom stays still."),
 (1,"1.05","9,2–10,2",1.0,"cận",True,
  "Close-up of the groom in black armor with gold studs, serious yet tender gaze to the side, shallow depth of field.",
  "Slow push-in. He lowers his gaze and then looks up; a faint breeze moves his hair."),
 (1,"1.06","10,2–11,2",1.0,"cảnh chèn bàn tay",False,
  "Macro insert: his gloved hands gently place a small jade bead bracelet onto her hand, her red embroidered sleeve in frame, shallow focus, no faces.",
  "Static macro. His fingers slide the bead onto her wrist and settle; her fingers curl gently."),
 (1,"1.07","11,2–11,9",0.7,"chân dung",True,
  "Portrait of the bride gazing up at the groom (off-frame), against a deep red palace wall, gold hair ornaments catching the light.",
  "Slow push-in. She blinks and a soft smile forms; the hair ornaments sway slightly."),
 (1,"1.08","11,9–13,2",1.3,"rộng, cổng vòm",False,
  "Dark stone arched gate tunnel seen from inside, a bright opening at the far end, one lone silhouette walking away.",
  "Slow dolly-in toward the opening; the silhouette walks slowly away, dust floats in the light shaft."),
 (1,"1.09","13,2–14,4",1.2,"chân dung",True,
  "Portrait of the bride in front of a red palace wall with gold studs, looking into the camera with quiet longing.",
  "Slow push-in. She holds the gaze, her eyes glisten, a faint breath of wind moves loose strands of hair."),

 (2,"2.01","15,6–16,0",0.4,"cảnh chèn bàn tay",False,
  "Macro: a woman's hands arranging peonies in a porcelain vase on a red lacquer table, warm lantern light, shallow focus, no faces.",
  "Static macro with a very slow slide to the right; her fingers adjust a flower; a petal trembles."),
 (2,"2.02","16,0–16,8",0.8,"vừa, nhìn nghiêng",True,
  "The bride in a Tang robe seated at a balcony railing at night with a vase of flowers beside her, red pillars, glowing lanterns behind, medium shot from the side.",
  "Slow push-in. She tilts her head and gazes out; lantern light flickers on her face."),
 (2,"2.03","16,8–17,7",0.9,"vừa, nhìn nghiêng",True,
  "The groom in a cream robe leans on the red balustrade in profile, fingers adjusting a small cord, dark blossoming trees behind, medium shot.",
  "Slow push-in. He fiddles with the cord, then lifts his eyes toward her."),
 (2,"2.04","17,7–18,4",0.7,"vừa-cận",True,
  "The bride at the balcony looking upward, three-quarter view, warm rim light from the lanterns.",
  "Slow tilt up. Her eyes follow something in the sky; the hair ornaments catch the light."),
 (2,"2.05","18,4–19,6",1.2,"vừa-cận",True,
  "The bride at the balustrade with a bokeh lake and lantern-lit pavilions behind, medium close-up, calm smile.",
  "Slow dolly-in. A gentle breeze moves her sleeves; reflections shimmer in the background."),
 (2,"2.06","19,6–20,9",1.3,"rộng, nhìn từ sau",False,
  "Wide night shot across the lake: a glowing red-gold pavilion with reflections, the groom in a cream robe and the bride in a teal-red robe seen from behind at the railing.",
  "Static wide with a very slow push-in; water ripples shimmer, lanterns twinkle; the two figures stand still."),
 (2,"2.07","20,9–21,9",1.0,"qua vai",True,
  "Over-the-shoulder medium shot: the groom in a cream robe and black futou hat turns his head toward the bride, red lantern bokeh behind.",
  "Slow drift of the camera around him. He turns his head slowly toward her."),
 (2,"2.08","21,9–22,8",0.9,"cảnh chèn bàn tay",False,
  "Macro insert: his hands tie a small red cord pouch to her patterned sleeve, night bokeh behind, no faces.",
  "Static macro. His fingers finish a knot and let go; the tassel swings slightly."),
 (2,"2.09","22,8–24,1",1.3,"nhìn từ sau",False,
  "Back view of the couple standing side by side at the railing facing the lake, cream robe and teal-red robe, a few small fireworks already glowing in the distant night sky.",
  "Static camera with a slow push-in. More fireworks burst and bloom in the night sky, colored light flickers on them; they lean slightly toward each other."),
 (2,"2.10","24,1–25,2",1.1,"hai người, cận",True,
  "Close two-shot: the groom turns toward the bride, they look at each other, red-gold bokeh behind.",
  "Slow push-in. They hold eye contact and she smiles softly."),
 (2,"2.11","25,2–26,2",1.0,"cận, ôm",True,
  "Close shot of an embrace: the bride rests her head on the groom's shoulder, his eyes closed, warm red bokeh behind.",
  "Very slow push-in. She nestles her head against his shoulder; he tightens the embrace and exhales."),
 (2,"2.12","26,2–27,5",1.3,"vừa-rộng, ôm",True,
  "Medium-wide embrace at the railing, red bokeh of the lake behind them.",
  "Slow pull-back. They sway slightly in the embrace; the lantern lights flicker."),

 (3,"3.01","28,8–29,8",1.0,"vừa",True,
  "The groom in an orange-red official robe and black winged hat stands by a carved lattice window in bright diffuse light, holding a bamboo scroll, medium shot.",
  "Slow push-in. He lowers the scroll and looks up with a soft smile; sunlight shifts across the lattice."),
 (3,"3.02","29,8–32,5",2.7,"vừa-cận",True,
  "The bride in a red wedding robe and golden phoenix crown sits in a red room, hands clasped at her chest, warm light, medium close-up.",
  "Slow push-in. She lifts a round red fan to half cover her shy smile; the crown tassels sway."),
 (3,"3.03","32,5–33,7",1.2,"rộng, nhìn từ sau",False,
  "Red wedding hall seen from behind: the couple in red robes stand before an altar with a double-happiness symbol, red drapes, hanging lanterns, symmetric composition, wide.",
  "Static camera with a slow push-in. They bow together; the drapes sway; lantern tassels swing."),
 (3,"3.04","33,7–35,5",1.8,"vừa",True,
  "Medium shot from the front: the couple in red wedding robes bow to each other at the altar, he in a black winged hat, she in a phoenix crown, candlelight.",
  "Slow dolly-in. They rise from the bow and turn to face each other; candle flames flicker."),

 (4,"4.01","36,8–37,7",0.9,"vừa",True,
  "The bride in a white lace blouse on a station platform, a green vintage train rushing past behind her, she presses both hands over her ears, medium shot.",
  "Static camera. The train blurs past; wind whips her hair and blouse; she winces and closes her eyes."),
 (4,"4.02","37,7–38,5",0.8,"vừa",True,
  "The groom in a white military dress uniform with gold epaulettes steps up behind the bride on the platform, green train behind.",
  "He steps in and wraps his arms around her; the train passes behind them."),
 (4,"4.03","38,5–41,0",2.5,"cận, ôm",True,
  "Close embrace, over-the-shoulder three-quarter view: the bride's hairclip glinting, the groom's chin resting on her head, green train blurred behind.",
  "Slow push-in. She turns her head slightly toward him; wind moves her hair; the train rumbles past."),
 (4,"4.04","41,0–41,6",0.6,"cận, nhìn nghiêng",True,
  "The bride in profile beside an easel holding a framed portrait of the groom in military uniform, pale street background, medium close-up.",
  "Slow push-in. She gazes at the portrait and blinks slowly; her hair moves in the wind."),
 (4,"4.05","41,6–42,2",0.6,"chân dung",True,
  "Portrait of the groom in the white military uniform holding a bouquet of red roses, serious tender look, soft grey background.",
  "Slow push-in. His eyes soften into a slight smile; the roses tremble."),
 (4,"4.06","42,2–43,0",0.8,"vừa",True,
  "Formal 1930s wedding portrait: the groom in uniform and the bride in a white qipao with a red-rose bouquet stand together, white doves about to take flight.",
  "Static camera. White doves burst upward around them; the couple smile and lean closer."),

 (5,"5.01","44,8–45,4",0.6,"vừa-rộng, nhìn từ sau",False,
  "The bride in a beige trench coat seen from behind, standing before a framed painting on a white gallery wall, a red panel at the right edge, medium-wide.",
  "Slow push-in; she tilts her head to study the painting; soft daylight."),
 (5,"5.02","46,0–47,0",1.0,"cận, nhìn nghiêng",True,
  "The bride in profile gazing at the framed painting, soft daylight, shallow depth of field.",
  "Slow push-in; she blinks, curiosity turning into a faint smile."),
 (5,"5.03","47,0–47,4",0.4,"cận",True,
  "Close-up of the bride's face, eyes wide with sudden surprise, white wall behind.",
  "Quick subtle push-in; her eyes widen and her lips part, breath caught."),
 (5,"5.04","47,9–48,5",0.6,"cận",True,
  "Close-up of the groom in camouflage with a calm gaze, a large blurred black brush-stroke shape in the foreground.",
  "Slow rack focus from the foreground stroke to his face; he lifts his eyes."),
 (5,"5.05","48,5–49,5",1.0,"rộng, đối xứng",False,
  "Wide gallery with a huge empty white wall and plenty of clean space; the groom in camouflage and the bride in a beige trench coat stand apart facing the wall, symmetrical composition, tiny figures.",
  "Static wide with a very slow push-in; she turns slightly toward him."),
 (5,"5.06","49,5–50,2",0.7,"cảnh chèn bàn tay",False,
  "Macro: a woman's hands holding a smartphone, soft daylight, no face.",
  "Static macro; her thumb scrolls the screen."),
 (5,"5.07","50,2–50,6",0.4,"vừa-cận",True,
  "The bride looks down at her phone in a quiet courtyard, soft daylight, blurred traditional architecture behind, medium close-up.",
  "Slow push-in; she looks up and smiles slightly."),
 (5,"5.08","50,6–51,1",0.5,"cận",True,
  "The groom in camouflage looking down at the phone in his hand, soft light, close-up.",
  "Slow push-in; he looks up toward something off-frame."),
 (5,"5.09","51,1–51,8",0.7,"vừa, cảnh kết",True,
  "Final shot: the groom and the bride stand close facing each other against a pale cyan clean background, medium shot, soft backlight.",
  "Slow push-in; she raises her eyes to his; he leans in slightly; wind moves her hair."),
]

A_NOTES = {"5.05": "Mẹo: bức tường để trống có chủ đích; chèn chữ thư pháp lớn (như \"纯属偶然\" trong mẫu) ở khâu dựng, vì chữ trong ảnh AI hay sai nét."}

# ---------- MẪU B: Album nhiều phong cách (video 1) ----------
B_STYLE = {
 "A": ("Bộ A · Phố cổ hiện đại", "Modern day in a small old Chinese town with grey brick walls and wooden doors, bright natural daylight with a soft teal-green tint. Bride in a beige trench coat with long straight hair; groom in a light-blue shirt with a navy sweater tied over his shoulders."),
 "B": ("Bộ B · Cung đình mùa đông", "Imperial winter-court look: bride in a dark embroidered robe with a fur collar and golden phoenix hairpins; groom in a dark embroidered robe with a fur collar and a black hat; red lacquered pillars, carved wood, warm golden light."),
 "C": ("Bộ C · Sườn xám thập niên 30", "1930s romance: bride in a green floral qipao with golden osmanthus hairpins and finger-waved dark hair; groom in a grey three-piece suit; dark wooden temple columns and stone steps, moody teal-green grade."),
 "D": ("Bộ D · Hán phục mùa xuân", "Spring hanfu: bride in a pale pink hanfu with an oil-paper parasol and flower hair ornaments; groom in a pale-blue hanfu with a black hat; snow mountains, hydrangea and peony, blue sky, bright pastel grade."),
 "E": ("Bộ E · Đám cưới đỏ", "Chinese red wedding: bride in a red-gold embroidered wedding gown with a phoenix crown and a round red fan; groom in a red wedding robe; red carpet and red drapes; saturated red-gold light."),
 "F": ("Bộ F · Cưới Tây sáng", "Western wedding: bride in a white strapless ball gown with a veil and a pink bouquet; groom in a black tuxedo with a boutonniere; white castle-like set, hydrangea field, snow mountains, bright high-key pastel grade."),
}
# (set, mã, thời điểm, độ dài, cỡ cảnh, thấy mặt, SCENE, MOTION, ghi chú)
B = [
 ("A","01","0,3–1,1",0.8,"vừa",True,"Medium shot in an old-town street: the groom looks at the bride, who looks back at him.","Slow push-in. They hold each other's gaze; her hair moves in a light breeze.",""),
 ("A","02","1,1–1,7",0.6,"qua vai",True,"The bride seen from behind (hair in the soft-focus foreground) while the groom turns and looks at the camera with a gentle smile, wooden door and grey brick wall behind.","Slow rack focus from her hair to his face; he smiles slightly.",""),
 ("B","03","1,7–2,4",0.7,"vừa-cận",True,"Medium close-up of the bride smiling toward the groom (off-frame), red lacquered pillars behind.","Slow push-in; her smile grows; the hairpin tassels sway.",""),
 ("B","04","2,4–3,1",0.7,"vừa-cận",True,"The groom looking at the bride (off-frame) with tender eyes, red pillar behind, medium close-up.","Slow push-in; he gives a small nod.",""),
 ("C","05a","3,1–4,4",1.3,"chân dung",True,"Portrait of the bride looking into the camera with a soft smile and red lipstick, dark wooden temple hall behind.","Slow push-in; she tilts her head slightly and smiles; the hair ornaments catch the light.","Chuyển sang 05b bằng dissolve chéo ~0,8 giây (đúng như mẫu)."),
 ("C","05b","4,4–5,7",1.3,"chân dung",True,"Portrait of the groom looking at the camera, same temple hall behind, stone steps.","Slow push-in; he gives a calm confident smile.",""),
 ("C","06","5,7–6,1",0.4,"vừa-rộng",True,"Insert on stone steps: the groom takes the bride's hand, medium-wide, faces small but visible.","Static camera; their hands meet and clasp.",""),
 ("B","07","6,1–6,6",0.5,"vừa",True,"The couple side by side, her face bright with a smile, his profile, red pillars, golden light.","Slow push-in; she turns to him.",""),
 ("A","08","6,6–7,3",0.7,"rộng",False,"Wide shot: the groom in the light-blue shirt with the navy sweater over his shoulders and a backpack hands a pink rose bouquet to the bride in front of a glass pavilion, lush green garden, blurred foreground foliage.","The camera slowly tracks sideways; he extends the bouquet; she reaches to take it.",""),
 ("D","09","7,3–8,8",1.5,"hai người, cận",True,"Close two-shot, pink roses blooming around them, a few pink petals in the air, soft pastel light.","Slow push-in; they gaze at each other; petals float.",""),
 ("C","10","8,8–9,5",0.7,"vật chèn",False,"Still-life insert: an antique tea set with a thin wisp of steam rising from the cup and a small carved wooden box on a dark table, moody teal light, soft bokeh, no people.","Slow slide to the right; steam rises from the tea cup.","Không cần ảnh tham chiếu (bỏ khối LOCK)."),
 ("C","11","9,5–10,5",1.0,"cận",True,"Close-up of the groom in a dark green suit smelling a single pink rose held toward the camera, warm arched-window bokeh behind.","Slow push-in; he lowers the rose slightly and smiles.",""),
 ("A","12","10,5–11,4",0.9,"cảnh chèn bàn tay",False,"Insert: the bride's hands in a beige coat sleeve holding a small cream card, bookshelves blurred behind, no face.","Static; her fingers turn the card over.",""),
 ("B","13","11,4–11,8",0.4,"cảnh chèn bàn tay",False,"Macro: a hand with a gold ring resting on an embroidered sleeve, shallow focus, no face.","Slight push-in; the hand turns so the ring catches the light.",""),
 ("C","14","11,8–12,5",0.7,"vừa",True,"Medium shot on stone steps: the groom slips a ring onto the bride's finger, soft temple hall behind.","Slow push-in; he finishes placing the ring; they look up at each other.",""),
 ("B","15","12,5–13,7",1.2,"rộng, qua song cửa",False,"Through a carved wooden lattice window: the couple seen from the side at a table, snow mountains in the background, bright cold light.","Slow dolly-in through the lattice; they lean toward each other.",""),
 ("D","16","13,7–14,9",1.2,"chân dung",True,"Portrait of the bride with a pink oil-paper parasol, snow mountains and green meadow behind, bright blue sky.","Slow push-in; she tilts the parasol and smiles; hair and sleeves move in the breeze.",""),
 ("B","17","14,9–15,6",0.7,"chân dung",True,"The bride framed by a carved wooden lattice, warm light, looking into the camera.","Slow push-in; she smiles and blinks.",""),
 ("D","18","15,6–16,3",0.7,"vừa-cận",True,"The bride in a white hanfu with a red collar against a snow-mountain backdrop, flower hair ornaments, medium close-up.","Slow push-in; a breeze moves her hair; soft smile.",""),
 ("C","19","16,3–17,0",0.7,"chân dung",True,"Close portrait of the bride with golden hairpins, dark hall behind, looking at the camera.","Slow push-in; her lips curve into a gentle smile.",""),
 ("A","20","17,0–17,7",0.7,"cận",True,"The bride with long black hair smiling warmly behind a bunch of pink roses held in the foreground, soft overcast sky, blurred town behind, close-up.","Slow push-in; her smile widens; the roses sway slightly.",""),
 ("E","21","17,7–18,6",0.9,"vừa-cận",True,"The bride half hiding her face behind a round red fan, red drapes behind.","Slow pull-back; she lowers the fan to reveal a smile; the crown tassels swing.",""),
 ("E","22","18,6–19,5",0.9,"rộng",True,"Wide shot: the couple walk side by side on a red carpet, red lanterns, attendants lining both sides.","Slow push-in; they walk toward the camera; the lantern tassels sway.",""),
 ("E","23","19,5–20,5",1.0,"rộng, đoàn rước",False,"Courtyard procession wide shot: attendants in blue and red robes line both sides of a red carpet leading through a wooden gate toward the camera.","Static camera with a slow push-in; the attendants stand still while a couple approaches in the distance.",""),
 ("B","24","20,5–21,7",1.2,"rộng, người nhỏ",False,"Wide shot of the couple standing on a white stone balustrade bridge under a blue-tiled pagoda roof, blue sky with clouds, tiny figures.","Slow pull-back; they stand side by side; clouds drift.",""),
 ("C","25","21,7–23,2",1.5,"toàn thân",True,"Full-length formal portrait pose: the couple standing together before a carved wooden screen, moody teal tones.","Slow push-in; she leans slightly toward him; they smile.",""),
 ("F","26","23,2–24,9",1.7,"rộng",True,"Wide shot: the couple walk hand in hand through a hydrangea field toward a white castle-like set, snow mountains behind, bright high-key.","Static camera with a slow push-in; they walk slowly toward the camera holding hands, looking at each other.",""),
 ("D","27","24,9–25,5",0.6,"qua vai",True,"Over-the-shoulder: the groom's back in the foreground, the bride with a hair bun smiling at him, lavender flowers blurred in front.","Slow rack focus to her; she smiles.",""),
 ("C","28","25,5–26,0",0.5,"cận",True,"The bride smiling from behind the groom's shoulder (his grey suit dark in the foreground), warm light.","Slow push-in; she peeks out from behind him.",""),
 ("D","29","26,0–26,7",0.7,"vừa",True,"The bride with a pink parasol among purple and white flowers in the foreground, the groom's black hat at the left edge, snow mountains behind.","Slow lateral move past the flowers; she smiles; the parasol turns.",""),
 ("B","30","26,7–27,4",0.7,"vừa-cận",True,"The bride under a red pillar, looking at the groom (off-frame), fur collar, golden hairpins.","Slow push-in; she smiles.",""),
 ("F","31","27,4–28,2",0.8,"chân dung",True,"Portrait of the groom in front of the white castle set, pastel hydrangea at the bottom edge.","Slow push-in; he looks at the bride off-frame and smiles.",""),
 ("F","32","28,2–29,5",1.3,"qua vai",True,"The bride in a white veil extends her hand toward the groom (his back foreground, blurred), white castle set, bright light.","Slow push-in; she smiles and places her hand in his; the veil flutters.",""),
 ("F","33","29,5–30,3",0.8,"cận, cảnh kết",True,"Close shot of the groom smiling with the bride's veiled shoulder in the right foreground, green meadow behind.","Slow push-in; he leans in, their foreheads touch.","Cảnh kết: fade ra cùng nhạc."),
]

def fence(txt):
    return "```text\n" + txt + "\n```\n"

def main(out):
    L = []
    w = L.append
    A_M = diversify([(x[1], x[7]) for x in A])
    B_M = diversify([(x[1], x[7]) for x in B])
    w("# Bộ câu lệnh từng shot: làm lại hai video mẫu bằng Google Flow và Seedance")
    w("")
    w("> Ngày: 2026-11-26. Bổ sung cho `phan-tich-va-quy-trinh.md` cùng thư mục. Bộ này sinh từ một nguồn dữ liệu nên các khối dùng chung (mục 2) luôn khớp với từng shot.")
    w("> Phạm vi: chỉ **câu lệnh để ra video**. Bản quyền nhạc/ảnh, giá, tích hợp vào sản phẩm: để sau.")
    w("")
    w("## 0. Ba điều phải biết trước khi chạy")
    w("")
    w("1. **Seedance không nhận ảnh có gương mặt người thật theo cách thông thường.** Tài liệu BytePlus ModelArk (qua kết quả tìm kiếm; tôi **không đọc được trang gốc** vì môi trường chặn tên miền) nói dòng Seedance 2.5 và 2.0 *không hỗ trợ tải trực tiếp ảnh/video tham chiếu chứa gương mặt người thật*; đường chính thức là quy trình **xác minh người thật và đăng ký tài sản chân dung** (người trong ảnh phải ủy quyền). Dreamina hiện ghi \"Real human faces are not supported\". Hệ quả: shot **thấy mặt** nên làm ở Flow (hoặc Kling), shot **không thấy mặt** (nhìn từ sau, bàn tay, vật chèn, người rất nhỏ) có thể đưa Seedance. Tôi **không** soạn cách lách bộ lọc này; nếu muốn Seedance làm shot thấy mặt, đi theo quy trình xác minh chính thức (chưa đọc được các bước, cần kiểm trên tài liệu BytePlus).")
    w("2. **Flow (Veo 3.1)**: có \"Frames to Video\" (ảnh đầu/ảnh cuối) và \"Ingredients to Video\" (ảnh tham chiếu). Bài hướng dẫn cũ của Google nói tối đa **3 ingredient** mỗi lần, chưa xác nhận được con số hiện tại; Google khuyên tạo ảnh ingredient bằng **Nano Banana Pro**. Thời lượng clip trong giao diện Flow tôi chưa xác nhận được (Google Vids ghi 8 giây). Tên nút và giới hạn có thể đã đổi, hãy đối chiếu giao diện thật.")
    w("3. **Cách an toàn nhất: ảnh tĩnh trước, động hóa sau.** Mọi shot đều làm 2 bước: (a) sinh **ảnh tĩnh** của cặp đôi từ ảnh tham chiếu (khóa gương mặt, kiểm bằng mắt), (b) đưa ảnh tĩnh đó làm khung đầu rồi chạy **câu lệnh chuyển động**. Như vậy video chỉ phải \"làm động\" chứ không phải \"nhớ mặt\", nên ít trôi mặt hơn và không vướng giới hạn 3 ingredient.")
    w("")
    w("## 1. Thao tác theo từng công cụ")
    w("")
    w("### Chuẩn bị ảnh đầu vào")
    w("- Mỗi người 2–4 ảnh: chính diện, hơi nghiêng 3/4, thấy rõ tóc, mặt chiếm ≥ 1/3 khung, ánh sáng đều, không kính râm, không filter làm mịn nặng.")
    w("- Đặt tên rõ: `co-dau-1.jpg`, `co-dau-2.jpg`, `chu-re-1.jpg`, `chu-re-2.jpg`. Ảnh chung hai người **không** dùng làm tham chiếu chính (dễ lẫn người).")
    w("")
    w("### Google Flow")
    w("1. **Ảnh tĩnh:** tạo ảnh bằng Nano Banana Pro (trong Flow hoặc Gemini), tỉ lệ **16:9** (như mẫu) hoặc **9:16** nếu phát dọc. **Chỉ đính kèm ảnh của những người xuất hiện trong shot** (shot một người: một ảnh tốt nhất của người đó; shot hai người: ảnh cô dâu + ảnh chú rể) và, từ shot thứ hai của mỗi bộ/chương, **thêm ảnh gốc rộng đã duyệt của bộ đó** làm ảnh tham chiếu thứ ba. Câu lệnh nhận diện người bằng giới (\"the woman\", \"the man\") nên không phụ thuộc thứ tự ảnh. Dán câu lệnh *Ảnh tĩnh* của shot. **Làm shot rộng của mỗi bộ trước**, duyệt, rồi mới làm các shot còn lại.")
    w("2. **Động hóa:** chọn *Frames to Video*, **Start frame = ảnh tĩnh** vừa duyệt, dán câu lệnh *Chuyển động* + dòng âm thanh: `Audio: soft ambient sound only, no music, no speech.` (nhạc thêm ở khâu dựng).")
    w("3. Sinh **2–3 phương án**, chọn bản đẹp nhất, cắt đúng độ dài ở cột \"dùng\".")
    w("")
    w("### Seedance (Dreamina / BytePlus)")
    w("1. Chỉ dùng cho shot **mặt: không** (xem mục 0.1) trừ khi đã qua xác minh chân dung.")
    w("2. Đưa ảnh tĩnh (từ Flow/Nano Banana Pro) vào làm `@Image1`. Các hướng dẫn thứ ba đều nói nên ghi rõ vai trò của ảnh trong câu lệnh, và **thứ tự tải ảnh phải khớp số @ImageN**.")
    w("3. Dán: `@Image1 as the first frame. ` + câu lệnh *Chuyển động*. Thời lượng ngắn nhất có thể (4–5 giây), tỉ lệ khớp ảnh, tắt âm thanh nếu có tùy chọn.")
    w("")
    w("### Bảng chọn công cụ theo shot")
    w("")
    w("| Shot | Flow (Frames to Video) | Seedance |")
    w("|---|---|---|")
    w("| Thấy mặt | **Nên dùng** | Chỉ sau khi xác minh chân dung chính thức |")
    w("| Không thấy mặt / người rất nhỏ / bàn tay / vật chèn | Dùng được | Dùng được (`@Image1 as the first frame`) |")
    w("")
    w("## 2. Khối dùng chung (đã được ghép sẵn vào từng shot bên dưới)")
    w("")
    w("Câu lệnh ảnh tĩnh = **LOCK** (đổi theo người xuất hiện) + **STYLE** của chương/bộ + **SCENE** + **đuôi ảnh** (đổi theo cỡ cảnh). Câu lệnh chuyển động = **MOTION** + **đuôi chuyển động** (có mốc thời gian). Mỗi shot bên dưới đã ghép sẵn, chỉ việc sao chép.")
    w("")
    w("**LOCK theo trường hợp** (sinh tự động, ghi ở đây để bạn viết thêm shot mới):")
    w("")
    w("| Trường hợp | LOCK |")
    w("|---|---|")
    w("| Chỉ thấy mặt cô dâu | " + "`" + lock("B", True) .strip() + "`" + " |")
    w("| Chỉ thấy mặt chú rể | " + "`" + lock("G", True).strip() + "`" + " |")
    w("| Thấy mặt cả hai | " + "`" + lock("BG", True).strip() + "`" + " |")
    w("| Không thấy mặt (nhìn từ sau, người rất nhỏ) | " + "`" + lock("BG", False).strip() + "`" + " |")
    w("| Cảnh chèn bàn tay | " + "`" + lock("BG", False, "macro").strip() + "`" + " |")
    w("| Vật chèn, không người | `" + lock("B", False, "object").strip() + "` |")
    w("")
    w("**Đuôi ảnh:** cảnh rộng dùng `deep focus with everything sharp`, cảnh vừa/cận dùng `shallow depth of field`, cảnh chèn dùng `macro, shallow focus`.")
    w("")
    w("**Đuôi chuyển động:** `The key action happens within the first N seconds, then the movement settles.` (N tính từ độ dài dùng, vì bản cắt chỉ lấy 0,4–3,5 giây đầu của clip 4–5 giây) + `Faces and outfits stay identical to the first frame; no morphing, no text, no cuts.` Nếu giao diện có ô *negative prompt*, đưa phần `no morphing, no text, no cuts` vào đó (chưa xác nhận Flow có ô này).")
    w("")
    w("**Thay đổi để ra phim dọc 9:16:** đổi tỉ lệ ở bước sinh ảnh và sinh video; thêm `vertical 9:16 framing, subject centered` vào cuối câu lệnh ảnh. Các shot rộng có người nhỏ cần kiểm lại bố cục.")
    w("")
    w("---")
    w("")
    # ---------------- Mẫu A ----------------
    w("# MẪU A · \"Năm kiếp\" (≈ 52 giây, 5 thẻ chương + 40 shot)")
    w("")
    w("Thời điểm ghi ở mỗi shot là vị trí trong video mẫu (giây), dùng để giữ nhịp. \"Dùng\" là độ dài nên giữ trong bản cắt cuối. Cốt truyện: cùng một cặp đôi tái sinh qua 5 thời đại; mỗi chương kết ở khoảnh khắc gặp/ôm/trao.")
    w("")
    w("## A.0 Thẻ chương (5 lần, không cần ảnh cặp đôi)")
    w("")
    w("Sinh **một clip nền khói** rồi dùng lại 5 lần. Chữ nên chèn ở khâu dựng (mô hình video viết chữ hay sai).")
    w(fence("Pure black background. A dense white ink-smoke cloud swells slowly in the center of the frame, then disperses into fine floating particles, macro, soft, centered, no text, no watermark."))
    w("Chèn chữ: serif có chân (Cinzel / Playfair / Noto Serif), màu trắng, hiện dần khi khói tan, hòa trộn `screen` với nền khói. Dài ~1,3 giây.")
    w("")
    w("| Chương | Vị trí trong mẫu | Chữ |")
    w("|---|---|---|")
    for c, t, txt in A_TITLES:
        w("| %d | %s s | `%s` |" % (c, t, txt))
    w("")
    cur = None
    for c, code, t, dur, size, face, scene, motion in A:
        motion = A_M[code]
        kind = 'macro' if code in A_MACRO else 'normal'
        if c != cur:
            cur = c
            name, style = A_STYLE[c]
            w("## A.%d %s" % (c, name))
            w("")
            w("**STYLE của chương** (đã ghép sẵn vào các shot dưới):")
            w(fence(style))
        w("### A%s · dùng %s s · %s · mặt: %s" % (code, vn(dur), size, "có" if face else "không"))
        w("*Vị trí trong mẫu: %s s*%s" % (t, (" · " + A_NOTES[code]) if code in A_NOTES else ""))
        w("")
        w("Ảnh tĩnh:")
        w(fence(lock(WHO_A[code], face, kind) + A_STYLE[c][1] + " " + scene + tail(size, kind)))
        w("Chuyển động:")
        w(fence(motion + neg(face, kind, dur)))
    w("---")
    w("")
    # ---------------- Mẫu B ----------------
    w("# MẪU B · \"Album nhiều phong cách\" (≈ 30 giây, 33 shot)")
    w("")
    w("Không có cốt truyện: 6 \"bộ ảnh\" (trang phục + bối cảnh) của cùng một cặp đôi, kết bằng cưới Tây sáng. Mỗi bộ được dùng lại ở nhiều shot, nên **làm ảnh gốc rộng của từng bộ trước** rồi sinh các góc còn lại từ đó. Nhạc và phụ đề: như mẫu A.")
    w("")
    w("## B.0 Sáu bộ ảnh (STYLE)")
    w("")
    for k in "ABCDEF":
        name, style = B_STYLE[k]
        w("**%s**" % name)
        w(fence(style))
    w("## B.1 Danh sách shot")
    w("")
    for s, code, t, dur, size, face, scene, motion, note in B:
        motion = B_M[code]
        kind = 'object' if code in B_OBJECT else ('macro' if code in B_MACRO else 'normal')
        name, style = B_STYLE[s]
        w("### B%s · bộ %s · dùng %s s · %s · mặt: %s" % (code, s, vn(dur), size, "có" if face else "không"))
        w("*Vị trí trong mẫu: %s s*%s" % (t, (" · " + note) if note else ""))
        w("")
        w("Ảnh tĩnh:")
        st = OBJ_STYLE if kind == 'object' else style
        w(fence(lock(WHO_B[code], face, kind) + st + " " + scene + tail(size, kind)))
        w("Chuyển động:")
        w(fence(motion + neg(face, kind, dur)))
    w("---")
    w("")
    # ---------------- Việt hóa ----------------
    w("# Phụ lục 1 · Đổi sang bản Việt (gợi ý, chưa thử)")
    w("")
    w("Giữ nguyên SCENE và MOTION, chỉ thay khối STYLE. Mô hình có thể nghiêng về trang phục Trung Hoa, nên **kiểm từng ảnh tĩnh bằng mắt** trước khi động hóa.")
    w("")
    w("| Chương mẫu A | Gợi ý STYLE bản Việt (tiếng Anh để dán) |")
    w("|---|---|")
    w("| 1 · Chiến Quốc → thời Lý–Trần | `Ancient Vietnam, Ly-Tran era. Bride in an ao giao linh in deep red with gold hair ornaments; groom in dark lacquered armor with gold studs. Old citadel stone wall, overcast cold light, desaturated grey with vivid crimson accents, cinematic, film grain.` |")
    w("| 2 · Đường → đêm hồ cổ | `Ancient Vietnam at night by a lake, lantern-lit pagoda, warm orange-red and teal bokeh. Bride in an ao giao linh with floral hair ornaments; groom in a cream long robe with a black cap. Cinematic, film grain.` |")
    w("| 3 · Tống → cưới triều Nguyễn | `Nguyen dynasty royal wedding hall, red-and-gold. Bride in an ao nhat binh with a gold crown; groom in an ao tac with a black cap. Warm saturated red-gold light, cinematic, film grain.` |")
    w("| 4 · Dân quốc → Hà Nội/Sài Gòn thập niên 30 | `1930s Hanoi, old railway station. Bride in a white silk ao dai with a hairclip; groom in a white colonial-era suit. Muted green-grey grade, soft overcast light, cinematic, film grain.` |")
    w("| 5 · Hiện đại | Giữ nguyên STYLE chương 5, đổi quân phục thành trang phục thường ngày nếu cặp đôi không làm trong quân đội. |")
    w("")
    w("# Phụ lục 2 · Xử lý lỗi thường gặp")
    w("")
    w("| Lỗi | Cách xử lý |")
    w("|---|---|")
    w("| Mặt trôi hoặc khác người ở cận cảnh | Sinh **ảnh tĩnh cận cảnh riêng** từ ảnh tham chiếu (đừng cắt từ ảnh rộng); giảm chuyển động xuống \"blink + slight smile\"; dùng đoạn giữa clip |")
    w("| Tay/nhẫn/ngón méo | Giữ shot ≤ 0,8 giây; chuyển động tối thiểu; thử 3 phương án |")
    w("| Chữ trong ảnh sai nét (bảng, thư pháp) | Sinh phông trống, chèn chữ khi dựng |")
    w("| Hai người lẫn mặt nhau | Ảnh tham chiếu tách riêng từng người; ghi `bride` / `groom` rõ trong SCENE; tránh dùng ảnh chung làm tham chiếu |")
    w("| Trang phục đổi giữa các shot cùng bộ | Dùng ảnh gốc rộng của bộ làm tham chiếu thêm; giữ nguyên khối STYLE từng chữ |")
    w("| Video có nhạc/giọng không mong muốn | Thêm `Audio: ambient only, no music, no speech` (Flow); thay nhạc ở khâu dựng |")
    w("")
    w("# Phụ lục 3 · Kết quả rà soát bộ câu lệnh (2026-11-26)")
    w("")
    w("Bản đầu có các lỗi dưới đây, đã sửa trong bản này. Số liệu lấy từ phép kiểm tự động trên toàn bộ 74 shot.")
    w("")
    w("| # | Lỗi bản đầu | Số shot | Hậu quả | Cách sửa |")
    w("|---|---|---|---|---|")
    w("| 1 | LOCK luôn ghi \"the bride and groom ... keep both faces\" dù shot chỉ có một người | 25 | Mô hình ảnh dễ vẽ thêm người còn lại vào chân dung | LOCK đổi theo người xuất hiện (cô dâu / chú rể / cả hai) |")
    w("| 2 | Shot không thấy mặt (nhìn từ sau, bàn tay) vẫn bị bắt \"keep both faces\" | 18 | Mâu thuẫn, mô hình có thể xoay người ra để lộ mặt | LOCK riêng: \"No faces are visible\", \"macro, hands\" |")
    w("| 3 | \"shallow depth of field\" ở cảnh rộng có người nhỏ | 15 | Nền nhòe, mất cảm giác không gian | Cảnh rộng dùng \"deep focus\" |")
    w("| 4 | A5.05: \"no text\" nhưng cảnh yêu cầu chữ thư pháp | 1 | Mâu thuẫn; chữ AI hay sai nét | Sinh tường trống, chèn chữ khi dựng |")
    w("| 5 | \"no extra people\" ở cả shot có đoàn rước/bóng người | 3 (A1.08, B22, B23) | Mô hình xóa đoàn rước | Bỏ \"no extra people\" khỏi đuôi (khung đầu đã quy định ai có mặt) |")
    w("| 6 | Hiệu ứng chỉ xuất hiện ở câu lệnh chuyển động (cánh hoa, pháo hoa, hơi nước) | 4 | Ảnh→video hiếm khi tự thêm vật mới, hay bị bỏ | Đưa vật vào ảnh tĩnh, chuyển động chỉ \"làm nhiều hơn\" |")
    w("| 7 | 38/70 câu lệnh mở bằng \"Slow push-in\" | 38 | Nhịp máy đơn điệu khi cắt liên tiếp | Xen kẽ tĩnh/lùi/trượt trái/trượt phải; còn khoảng một phần tư là push-in |")
    w("| 8 | Không có mốc thời gian | 70 | Chỉ dùng 0,4–3,5 giây đầu của clip 4–5 giây; hành động có thể rơi ngoài đoạn cắt | Thêm \"key action within the first N seconds\" |")
    w("| 9 | Đuôi phủ định ~25 từ ở mọi câu lệnh chuyển động | 70 | Google khuyên với ảnh→video chỉ mô tả chuyển động vì ảnh đã quy định chủ thể và bối cảnh; danh sách \"no X\" chỉ có nguồn bên thứ ba | Rút gọn đuôi, bỏ phần lặp |")
    w("| 10 | Vài câu lệnh có 2–4 hành động trong clip ngắn | 5 (A1.04, A2.07, A2.10, A3.02, A4.02) | Nguồn hướng dẫn Seedance khuyên mỗi clip ~4 giây chỉ một chủ thể, một hành động, một chuyển động máy | Rút còn một hành động chính + một chuyển động máy |")
    w("| 11 | Không nói ảnh tham chiếu nào là ai | tất cả | Hai người dễ lẫn mặt | Nhận diện bằng giới (\"the woman\" / \"the man\") và chỉ đính kèm người có mặt trong shot |")
    w("")
    w("**Chưa giải quyết được (cần thử thật):**")
    w("- Quy tắc mốc thời gian (hành động trong N giây đầu) là **kinh nghiệm suy ra**, chưa kiểm với Flow hay Seedance.")
    w("- Flow có xử lý đúng ba ảnh tham chiếu (cô dâu, chú rể, ảnh gốc bộ) hay không, và có ô negative prompt hay không, chưa xác nhận.")
    w("- Seedance có xử lý câu phủ định như \"no morphing\" hay không: các nguồn tìm được không nói.")
    w("- Nguồn cho phần chuyển động: [Google: Best practices for Veo](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/video/best-practice); [Luma: How to Prompt Seedance 2.0](https://lumalabs.ai/learning-center/articles/how-to-prompt-seedance-2.0).")
    w("")
    w("# Nguồn")
    w("- BytePlus ModelArk: [Create portrait videos with Dreamina Seedance models](https://ai.byteplus.com/ark/region:ap-southeast-1/docs/seedance-portrait-asset-guide) (chỉ đọc được qua tóm tắt tìm kiếm)")
    w("- Google: [Veo 3.1 Ingredients to Video](https://blog.google/innovation-and-ai/technology/ai/veo-3-1-ingredients-to-video/); [Create videos in Flow](https://support.google.com/flow/answer/16353334?hl=en); [5 tips for getting started with Flow](https://blog.google/technology/ai/flow-video-tips/)")
    w("- Cú pháp `@Image1` của Seedance: [Luma: How to Prompt Seedance 2.0](https://lumalabs.ai/learning-center/articles/how-to-prompt-seedance-2.0); [Magnific: How to write prompts for Seedance 2.0](https://www.magnific.com/blog/how-to-write-prompts-for-seedance-2-0/)")
    open(out, "w", encoding="utf-8").write("\n".join(L) + "\n")
    print(out, len(A), "shot A;", len(B), "shot B;", sum(len(x) for x in L), "ký tự")

if __name__ == "__main__":
    main(sys.argv[1])
