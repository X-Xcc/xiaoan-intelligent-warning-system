"""Generate original, clearly labelled teaching bitmaps from the frozen scenario."""
from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "apps/dashboard/public/command"
FIXTURE = json.loads((ROOT / "server/app/data/command/night_market_b1_b4_v1.json").read_text(encoding="utf-8"))
FONT = Path("C:/Windows/Fonts/msyh.ttc")


def font(size):
    return ImageFont.truetype(str(FONT), size)


def text(draw, xy, value, size=24, fill="#283c48"):
    draw.text(xy, value, font=font(size), fill=fill)


def base(size, title):
    image = Image.new("RGB", size, "#edf2f5")
    draw = ImageDraw.Draw(image)
    text(draw, (30, 22), title, 26)
    return image, draw


def save(image, name):
    image.save(OUTPUT / name, optimize=True)


def make_map():
    image, d = base((1400, 920), "XX夜市 · 教学平面示意")
    d.rectangle((35, 80, 1365, 855), fill="#e0e9e9", outline="#b6cbd0", width=3)
    for x in range(80, 1330, 110):
        for y in range(120, 810, 80):
            d.rectangle((x, y, x + 60, y + 38), fill="#c2d5d0", outline="#a6bdb7", width=2)
    for points in [[(40, 300), (1360, 300)], [(40, 600), (1360, 600)], [(350, 80), (350, 855)], [(980, 80), (980, 855)]]:
        d.line(points, fill="#ffffff", width=72)
        d.line(points, fill="#d1dade", width=2)
    for rect, label in [((510, 160, 760, 240), "A区"), ((1020, 365, 1280, 460), "B区"), ((560, 700, 850, 795), "C区")]:
        d.rectangle(rect, fill="#d2dfed", outline="#94b1ce", width=2)
        text(d, (rect[0] + 25, rect[1] + 15), label, 35)
    bike = [(180, 730), (350, 730), (350, 600), (700, 600), (980, 600)]
    walk = [(980, 600), (980, 440), (1110, 440)]
    d.line(bike, fill="#1963a8", width=13)
    for a, b in zip(walk, walk[1:]):
        steps = 12
        for i in range(0, steps, 2):
            p = (int(a[0] + (b[0] - a[0]) * i / steps), int(a[1] + (b[1] - a[1]) * i / steps))
            q = (int(a[0] + (b[0] - a[0]) * (i + 1) / steps), int(a[1] + (b[1] - a[1]) * (i + 1) / steps))
            d.line([p, q], fill="#cc8117", width=12)
    for point, color in [(bike[0], "#1963a8"), (bike[-1], "#1c896e"), (walk[-1], "#db514e")]:
        d.ellipse((point[0] - 18, point[1] - 18, point[0] + 18, point[1] + 18), fill=color, outline="white", width=4)
    for box, label in [((65, 750, 300, 807), "135快反组驻点"), ((710, 615, 1005, 670), "夜市入口"), ((1045, 465, 1330, 522), "B区7号 · 现场"),
                       ((435, 524, 860, 580), "骑行至入口约3分钟"), ((990, 315, 1280, 368), "步行200米")]:
        d.rounded_rectangle(box, radius=4, fill="#fff", outline="#9bb8c4", width=2)
        text(d, (box[0] + 15, box[1] + 10), label, 25)
    text(d, (36, 868), "教学预设路线 / 非道路导航 / 未提供全程ETA / 位置不代表实时警力", 22, "#4d6973")
    save(image, "night-market-map.png")


def make_receipts():
    image, d = base((1440, 920), "8张交易小票 · 原创教学样张")
    for i in range(8):
        x, y = 36 + (i % 4) * 354, 92 + (i // 4) * 392
        d.rectangle((x + 5, y + 8, x + 322, y + 370), fill="#cbd3d8")
        d.rectangle((x, y, x + 316, y + 362), fill="#fff", outline="#c0cbd0", width=2)
        text(d, (x + 50, y + 15), "教学夜市", 29)
        text(d, (x + 24, y + 62), f"NO. TEACH-{i + 1:03}", 22)
        d.line((x + 22, y + 105, x + 293, y + 105), fill="#465c65", width=2)
        lines = [f"样张编号：{i + 1:02}", f"食品项目：样例{i + 1}", "数量：1", "金额：示例，不作凭证", "核查：以原件为准"]
        for j, line in enumerate(lines):
            text(d, (x + 22, y + 124 + j * 34), line, 20)
        text(d, (x + 32, y + 310), "仅供教学 / 不可报销", 20, "#ac4b42")
    text(d, (36, 878), "所有商户、编号和内容均为教学制作，不对应真实交易。", 21, "#526b78")
    save(image, "receipts.png")


def make_notebook():
    image, d = base((1000, 760), "笔记本 · 疑似交易记录（教学）")
    d.rounded_rectangle((95, 85, 902, 700), radius=8, fill="#718693")
    d.rectangle((120, 100, 880, 682), fill="#fcfcfc")
    for y in range(165, 655, 53):
        d.line((150, y, 850, y), fill="#b8cad6", width=2)
    for y in range(140, 650, 70):
        d.ellipse((91, y, 132, y + 20), fill="#d6e1e7", outline="#476774", width=3)
    text(d, (165, 108), "现场材料转录样例", 26)
    for i, line in enumerate(["日期        地点             记事", "08.30      A区             样例记录01",
                              "09.02      C区             样例记录02", "09.05      B区             待核查条目",
                              "原件、书写人、用途均待人工核实", "不得据此推定违法犯罪"]):
        text(d, (165, 180 + i * 62), line, 26, "#2c4962")
    d.rectangle((157, 357, 828, 407), outline="#bb7e22", width=3)
    text(d, (280, 615), "教学样张 / 非真实物证", 28, "#ab493e")
    save(image, "notebook.png")


def make_phone():
    image, d = base((1000, 760), "备用手机 · 标签特写（教学）")
    d.rounded_rectangle((308, 75, 707, 705), radius=42, fill="#acb8c3")
    d.rounded_rectangle((298, 65, 697, 695), radius=40, fill="#303e49", outline="#182630", width=4)
    d.rounded_rectangle((327, 94, 477, 270), radius=26, fill="#657785")
    for cx, cy in [(370, 135), (429, 198)]:
        d.ellipse((cx - 24, cy - 24, cx + 24, cy + 24), fill="#14232b", outline="#a2b2bf", width=6)
        d.ellipse((cx - 9, cy - 9, cx + 9, cy + 9), fill="#517086")
    d.rounded_rectangle((328, 345, 666, 500), radius=5, fill="#f6f7f3", outline="#cccdbb", width=2)
    text(d, (355, 372), "翠花街巷", 53, "#294c61")
    text(d, (370, 446), "教学标签", 28, "#775332")
    text(d, (325, 608), "TEACH / 备用手机", 26, "#cfdae4")
    text(d, (50, 719), "仅展示标签线索，不展示真实号码、通信内容或私人资料。", 23, "#4e6672")
    save(image, "phone.png")


if __name__ == "__main__":
    OUTPUT.mkdir(parents=True, exist_ok=True)
    make_map()
    make_receipts()
    make_notebook()
    make_phone()
    print(f"Generated 4 teaching bitmaps in {OUTPUT}")
