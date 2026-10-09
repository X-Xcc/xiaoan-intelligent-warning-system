from pathlib import Path
import json
import shutil
import zipfile
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUTPUT = Path('D:/CICSIC/outputs/烟火哨兵_准确文字与卡片_20261001')
DELIVERY = Path('C:/Users/xx/Documents/Codex/2026-10-01/new-chat/outputs/烟火哨兵_准确文字与卡片_20261001')
BACKGROUNDS = Path('D:/CICSIC/outputs/烟火哨兵_AI补充背景_20261001')
OUTPUT.mkdir(parents=True, exist_ok=True)
MANIFEST = []

def font(size, bold=False):
    return ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc' if bold else 'C:/Windows/Fonts/msyh.ttc', size)

def centered(draw, text, top, size, fill, width, bold=False, stroke=0):
    selected_font = font(size, bold)
    bounds = draw.textbbox((0, 0), text, font=selected_font, stroke_width=stroke)
    if bounds[2] - bounds[0] > width - 64:
        raise ValueError('Text overflow: ' + text)
    position = ((width - bounds[2] + bounds[0]) / 2, top - bounds[1])
    draw.text(position, text, font=selected_font, fill=fill, stroke_width=stroke, stroke_fill=(8, 22, 40, 170))

def save(image, name, text, use):
    if image.mode != 'RGBA' or image.getextrema()[3][0] != 0:
        raise ValueError('Missing transparent pixels: ' + name)
    destination = OUTPUT / name
    image.save(destination)
    reopened = Image.open(destination)
    reopened.verify()
    MANIFEST.append({'file': name, 'text': text, 'size': image.size, 'use': use, 'transparent': True})

def title(name, footer=False):
    image = Image.new('RGBA', (1500, 420), (0, 0, 0, 0))
    drawing = ImageDraw.Draw(image)
    centered(drawing, '烟火哨兵', 34, 128, (255, 255, 255, 255), 1500, True, 2)
    centered(drawing, '以科技护烟火，以协同守平安' if footer else '公共安全智能预警与秒级响应系统', 211, 46, (245, 247, 250, 255), 1500, False, 1)
    if footer:
        centered(drawing, '江西司法警官职业学院', 301, 32, (226, 235, 246, 255), 1500, False, 1)
    else:
        drawing.rounded_rectangle((626, 309, 874, 315), radius=3, fill=(245, 179, 88, 255))
    save(image, name, '烟火哨兵；' + ('以科技护烟火，以协同守平安；江西司法警官职业学院' if footer else '公共安全智能预警与秒级响应系统'), '片尾独立图层' if footer else '开场独立图层')

CARD_LABELS = [
    ('01', '跨夜市分级', '研判预警', '已核验线索汇聚 · 辅助研判'),
    ('02', '多模态风险', '识别', '算法初筛 · 视觉复核 · 人工核验'),
    ('03', '线上一键报警', '与无人机联动', '平台求助入口 · 设备联调探索'),
]

def card(number, first, second, caption):
    image = Image.new('RGBA', (600, 400), (0, 0, 0, 0))
    shadow = Image.new('RGBA', image.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((28, 29, 573, 376), radius=30, fill=(6, 20, 42, 78))
    image.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(9)))
    drawing = ImageDraw.Draw(image)
    drawing.rounded_rectangle((20, 15, 570, 363), radius=28, fill=(14, 39, 68, 247), outline=(94, 183, 214, 255), width=2)
    drawing.rounded_rectangle((48, 44, 123, 97), radius=14, fill=(242, 172, 73, 255))
    drawing.text((62, 45), number, font=font(32, True), fill=(16, 37, 58, 255))
    centered(drawing, first, 132, 45, (255, 255, 255, 255), 600, True)
    centered(drawing, second, 197, 45, (255, 255, 255, 255), 600, True)
    drawing.line((68, 272, 526, 272), fill=(93, 157, 180, 220), width=2)
    centered(drawing, caption, 304, 23, (205, 225, 235, 255), 600)
    save(image, 'T' + number + '_技术卡片.png', first + second + '；' + caption, '三个卡片分别滑入，文字不得交给Seedance重绘')

def badge(name, text, width=1140, amber=False, use='后期叠加说明'):
    image = Image.new('RGBA', (width, 112), (0, 0, 0, 0))
    drawing = ImageDraw.Draw(image)
    drawing.rounded_rectangle((8, 8, width-8, 104), radius=20, fill=(12, 30, 50, 232), outline=(124, 160, 186, 160), width=1)
    drawing.rounded_rectangle((24, 27, 31, 85), radius=3, fill=(241, 174, 77, 255) if amber else (101, 200, 220, 255))
    centered(drawing, text, 37, 32, (250, 252, 255, 255), width, True)
    save(image, name, text, use)

title('H01_开场标题_透明.png')
title('H02_片尾标题_透明.png', True)
for number, first, second, caption in CARD_LABELS:
    card(number, first, second, caption)
badge('L01_团队名称_透明.png', '江西司法警官职业学院｜烟火哨兵项目团队', 1140, True, '44—56秒持续显示，不遮挡人物')
badge('L02_调研标签_透明.png', '现场调研｜从需求出发', 660)
badge('L03_研发标签_透明.png', '系统研发与需求转化', 660)
badge('L04_联调标签_透明.png', '设备联调与测试记录', 660)
badge('L05_交流标签_透明.png', '指导交流与方案完善', 660)
badge('N01_系统演示_透明.png', '系统演示，非实时业务记录', 800)
badge('N02_机制示意_透明.png', '机制示意', 280)
badge('N03_AI氛围标识_透明.png', 'AI生成氛围画面', 460)
badge('N04_平台求助边界_透明.png', '平台求助不替代110电话报警', 800)
badge('N05_响应边界_透明.png', '秒级响应指系统内部信息链路，非人员到场时间', 1200)

def scaled(image, width):
    return image.resize((width, round(image.height * width / image.width)), Image.Resampling.LANCZOS)

def paste(base, name, left, top, width):
    overlay = scaled(Image.open(OUTPUT/name).convert('RGBA'), width)
    base.alpha_composite(overlay, (left, top))

opening = Image.open(BACKGROUNDS/'G01_夜市开场_生成背景.png').convert('RGBA').resize((1920,1080))
paste(opening, 'H01_开场标题_透明.png', 65, 280, 1120)
paste(opening, 'N03_AI氛围标识_透明.png', 1500, 980, 360)
opening.convert('RGB').save(OUTPUT/'预览01_开场合成.jpg', quality=94)
tech = Image.open(BACKGROUNDS/'G02_三项技术_展示空间背景.png').convert('RGBA').resize((1920,1080))
tech_draw = ImageDraw.Draw(tech)
centered(tech_draw, '三项技术方向', 154, 66, (16, 41, 68, 255), 1920, True)
for index, number in enumerate(['01', '02', '03']):
    paste(tech, 'T'+number+'_技术卡片.png', 45+index*625, 365, 580)
paste(tech, 'N02_机制示意_透明.png', 1580, 950, 260)
tech.convert('RGB').save(OUTPUT/'预览02_技术卡片合成.jpg', quality=94)
team = Image.open(BACKGROUNDS/'G03_团队多图_展示背景.png').convert('RGBA').resize((1920,1080))
photo_root = Path('C:/Users/xx/Documents/Codex/2026-10-01/new-chat/outputs/烟火哨兵_网评脚本与分镜/素材/只供剪辑_不要上传AI')
photo_paths = [photo_root/'R09_团队电脑协作_直接剪辑.jpg', photo_root/'R02_团队商户走访_直接剪辑.jpg']
for index, photo_path in enumerate(photo_paths):
    photo = Image.open(photo_path).convert('RGBA')
    photo.thumbnail((840, 590), Image.Resampling.LANCZOS)
    team.alpha_composite(photo, (65+index*925+(840-photo.width)//2, 185+(590-photo.height)//2))
paste(team, 'L03_研发标签_透明.png', 170, 760, 600)
paste(team, 'L02_调研标签_透明.png', 1085, 760, 600)
paste(team, 'L01_团队名称_透明.png', 315, 925, 1290)
team.convert('RGB').save(OUTPUT/'预览03_真实照片多图合成.jpg', quality=94)
ending = Image.open(BACKGROUNDS/'G04_夜市片尾_生成背景.png').convert('RGBA').resize((1920,1080))
paste(ending, 'H02_片尾标题_透明.png', 310, 120, 1300)
paste(ending, 'N03_AI氛围标识_透明.png', 1500, 980, 360)
ending.convert('RGB').save(OUTPUT/'预览04_片尾合成.jpg', quality=94)
contact = Image.new('RGB', (1600, 960), (237, 241, 245))
for index, name in enumerate(['预览01_开场合成.jpg','预览02_技术卡片合成.jpg','预览03_真实照片多图合成.jpg','预览04_片尾合成.jpg']):
    preview = Image.open(OUTPUT/name).resize((780,439), Image.Resampling.LANCZOS)
    contact.paste(preview,(10+(index%2)*800,10+(index//2)*480))
contact.save(OUTPUT/'全部合成预览.jpg', quality=94)
(OUTPUT/'文字素材清单.json').write_text(json.dumps(MANIFEST, ensure_ascii=False, indent=2),encoding='utf-8')
DELIVERY.mkdir(parents=True,exist_ok=True)
for source in OUTPUT.iterdir():
    if source.is_file():
        shutil.copy2(source, DELIVERY/source.name)
archive = DELIVERY.parent/'烟火哨兵_准确文字与卡片_20261001.zip'
if archive.exists():
    raise FileExistsError(archive)
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as package:
    for source in DELIVERY.iterdir():
        if source.is_file():
            package.write(source, arcname=DELIVERY.name+'/'+source.name)
print('Verified', len(MANIFEST), 'transparent PNG overlays; 4 composed previews; ZIP saved')
