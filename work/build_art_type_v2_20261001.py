from pathlib import Path
import json
import shutil
import zipfile
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops

ROOT = Path('D:/CICSIC/outputs/烟火哨兵_艺术字视频包装_v2_20261001')
DELIVERY = Path('C:/Users/xx/Documents/Codex/2026-10-01/new-chat/outputs/烟火哨兵_艺术字视频包装_v2_20261001')
BACK = Path('D:/CICSIC/outputs/烟火哨兵_AI补充背景_20261001')
LOCAL_FONTS = Path('C:/Users/xx/AppData/Local/Microsoft/Windows/Fonts')
ROOT.mkdir(parents=True, exist_ok=True)
ASSETS = []

def face(size, kind='regular'):
    paths = {'brush':Path('C:/Windows/Fonts/STXINGKA.TTF'), 'heavy':LOCAL_FONTS/'思源黑体 CN Heavy.otf', 'regular':LOCAL_FONTS/'思源黑体 CN Regular.otf', 'latin':Path('C:/Windows/Fonts/arialbd.ttf')}
    return ImageFont.truetype(str(paths[kind]),size)

def write(draw, point, text, size, fill, kind='regular'):
    selected = face(size,kind)
    bounds = draw.textbbox((0,0),text,font=selected)
    draw.text((point[0]-bounds[0],point[1]-bounds[1]),text,font=selected,fill=fill)

def tracking(draw, point, text, size, gap, fill, kind='regular'):
    cursor = point[0]
    selected = face(size,kind)
    for character in text:
        bounds = draw.textbbox((0,0),character,font=selected)
        draw.text((cursor-bounds[0],point[1]-bounds[1]),character,font=selected,fill=fill)
        cursor += draw.textlength(character,font=selected)+gap
    return cursor

def save(image,name,text,use):
    if image.mode!='RGBA' or image.getextrema()[3][0]!=0:
        raise ValueError('Transparency missing '+name)
    image.save(ROOT/name)
    with Image.open(ROOT/name) as verified:
        verified.verify()
    ASSETS.append({'file':name,'text':text,'size':image.size,'use':use})

def brush_word(gold=False):
    mask=Image.new('L',(1500,390),0)
    drawing=ImageDraw.Draw(mask)
    tracking(drawing,(34,30),'烟火哨兵',300,-14,255,'brush')
    bounds=mask.getbbox()
    if not bounds:
        raise ValueError('Empty title')
    mask=mask.crop((max(0,bounds[0]-15),max(0,bounds[1]-15),min(1500,bounds[2]+15),min(390,bounds[3]+15)))
    mask=mask.resize((1320,round(mask.height*1320/mask.width)),Image.Resampling.LANCZOS)
    final=Image.new('RGBA',(1440,520),(0,0,0,0))
    accent=Image.new('RGBA',final.size,(0,0,0,0))
    accent.paste((203,118,30,100),(51,48),mask)
    final.alpha_composite(accent.filter(ImageFilter.GaussianBlur(6)))
    color_layer=Image.new('RGBA',mask.size,(0,0,0,0))
    color_draw=ImageDraw.Draw(color_layer)
    for row in range(mask.height):
        fraction=row/max(mask.height-1,1)
        start=(255,234,181) if gold else (255,255,248)
        end=(219,148,62) if gold else (238,219,183)
        color=tuple(round(start[channel]+(end[channel]-start[channel])*fraction) for channel in range(3))+(255,)
        color_draw.line((0,row,mask.width,row),fill=color)
    color_layer.putalpha(mask)
    final.alpha_composite(color_layer,(42,36))
    drawing=ImageDraw.Draw(final)
    drawing.polygon([(52,mask.height+63),(990,mask.height+47),(1130,mask.height+56),(210,mask.height+70)],fill=(238,164,64,235))
    return final,mask.height

def title(name,gold=False,ending=False):
    image,height=brush_word(gold)
    draw=ImageDraw.Draw(image)
    write(draw,(61,height+111),'以科技护烟火，以协同守平安' if ending else '公共安全智能预警与秒级响应系统',42,(247,247,241,255),'regular')
    if ending:
        tracking(draw,(63,height+180),'江西司法警官职业学院',27,3,(209,220,230,255))
    else:
        tracking(draw,(65,height+188),'公共安全 · 智能预警 · 协同响应',24,3,(204,218,230,255))
    save(image,name,'烟火哨兵；'+('以科技护烟火，以协同守平安；江西司法警官职业学院' if ending else '公共安全智能预警与秒级响应系统'),'后期艺术字标题独立叠加')

title('H01_行楷主标题_暖白透明.png')
title('H01B_行楷主标题_暖金透明.png',True)
title('H02_行楷片尾_透明.png',False,True)

LABELS=[('01','跨夜市分级','研判预警','已核验线索汇聚','辅助分级研判'),('02','多模态风险','识别','算法初筛 · 视觉复核','人工核验'),('03','线上一键报警','与无人机联动','平台求助入口','设备联调探索')]
for number,first,second,caption,extra in LABELS:
    image=Image.new('RGBA',(720,540),(0,0,0,0))
    shadow=Image.new('RGBA',image.size,(0,0,0,0))
    ImageDraw.Draw(shadow).polygon([(45,29),(690,29),(657,510),(15,510)],fill=(0,10,25,100))
    image.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(8)))
    draw=ImageDraw.Draw(image)
    draw.polygon([(40,15),(690,15),(655,495),(10,495)],fill=(8,24,40,248))
    draw.polygon([(40,15),(690,15),(688,25),(39,25)],fill=(244,178,72,255))
    write(draw,(413,38),number,172,(42,61,76,230),'latin')
    write(draw,(57,44),'技术方向',24,(226,172,82,255),'heavy')
    draw.line((57,96,200,96),fill=(232,171,77,230),width=3)
    write(draw,(51,165),first,70 if number!='03' else 64,(255,253,245,255),'heavy')
    write(draw,(51,262),second,70 if number!='03' else 64,(255,253,245,255),'heavy')
    draw.line((51,377,604,377),fill=(99,133,153,180),width=1)
    write(draw,(52,409),caption,28,(193,213,225,255))
    write(draw,(52,451),extra,25,(232,177,92,255))
    save(image,'T'+number+'_冲击力技术卡片_透明.png',first+second+'；'+caption+'；'+extra,'独立滑入；不要翻转或扭曲文字')

team=Image.new('RGBA',(1580,225),(0,0,0,0))
draw=ImageDraw.Draw(team)
draw.polygon([(30,5),(1550,5),(1520,215),(0,215)],fill=(6,19,32,220))
draw.line((34,17,240,17),fill=(242,175,72,255),width=6)
write(draw,(50,36),'烟火哨兵项目团队',70,(253,253,247,255),'heavy')
tracking(draw,(54,140),'江西司法警官职业学院',30,5,(211,221,229,255))
save(team,'L01_团队主标_透明.png','烟火哨兵项目团队；江西司法警官职业学院','团队段底部独立叠加')
for filename,heading,detail in [('L02_现场调研','现场调研','从商户与管理需求出发'),('L03_系统研发','系统研发','将现场问题转化为方案'),('L04_设备联调','设备联调','适配 · 测试 · 记录'),('L05_交流打磨','交流打磨','在指导与反馈中完善')]:
    image=Image.new('RGBA',(810,225),(0,0,0,0))
    draw=ImageDraw.Draw(image)
    draw.polygon([(22,9),(796,9),(778,207),(5,207)],fill=(7,23,39,229))
    draw.polygon([(21,9),(28,9),(12,207),(5,207)],fill=(240,170,60,255))
    write(draw,(48,32),heading,70,(255,253,244,255),'heavy')
    write(draw,(52,139),detail,27,(200,216,229,255))
    save(image,filename+'_透明.png',heading+'；'+detail,'工作标题；普通滑入')

for filename,text,width in [('N01_系统演示','系统演示，非实时业务记录',850),('N02_机制示意','机制示意',360),('N03_AI氛围标识','AI生成氛围画面',520),('N04_平台求助边界','平台求助不替代110电话报警',930),('N05_响应边界','秒级响应指系统内部信息链路，非人员到场时间',1500)]:
    image=Image.new('RGBA',(width,100),(0,0,0,0))
    draw=ImageDraw.Draw(image)
    draw.rectangle((8,8,width-8,92),fill=(4,16,29,205))
    draw.rectangle((8,8,13,92),fill=(229,171,78,255))
    write(draw,(32,31),text,31,(245,247,249,255))
    save(image,filename+'_透明.png',text,'边界说明；不使用艺术字')

heading=Image.new('RGBA',(1580,245),(0,0,0,0))
draw=ImageDraw.Draw(heading)
write(draw,(10,0),'三项技术方向',114,(17,37,53,255),'heavy')
tracking(draw,(16,164),'发现线索 / 辅助研判 / 协同响应',29,4,(43,67,82,255))
save(heading,'T00_技术总览标题_透明.png','三项技术方向；发现线索 / 辅助研判 / 协同响应','技术总览页标题')

def overlay(base,name,left,top,width):
    layer=Image.open(ROOT/name).convert('RGBA')
    layer=layer.resize((width,round(layer.height*width/layer.width)),Image.Resampling.LANCZOS)
    base.alpha_composite(layer,(left,top))

def background(filename):
    return Image.open(BACK/filename).convert('RGBA').resize((1920,1080),Image.Resampling.LANCZOS)

opening=background('G01_夜市开场_生成背景.png')
overlay(opening,'H01_行楷主标题_暖白透明.png',88,243,1390)
overlay(opening,'N03_AI氛围标识_透明.png',1480,985,360)
opening.convert('RGB').save(ROOT/'预览01_艺术字开场.jpg',quality=95)
tech=background('G02_三项技术_展示空间背景.png')
overlay(tech,'T00_技术总览标题_透明.png',99,114,1120)
for index,number in enumerate(['01','02','03']):
    overlay(tech,'T'+number+'_冲击力技术卡片_透明.png',55+index*623,425,590)
overlay(tech,'N02_机制示意_透明.png',1515,970,295)
tech.convert('RGB').save(ROOT/'预览02_重排技术总览.jpg',quality=95)
team_view=background('G03_团队多图_展示背景.png')
photo_root=Path('C:/Users/xx/Documents/Codex/2026-10-01/new-chat/outputs/烟火哨兵_网评脚本与分镜/素材/只供剪辑_不要上传AI')
for index,filename in enumerate(['R09_团队电脑协作_直接剪辑.jpg','R02_团队商户走访_直接剪辑.jpg']):
    photo=Image.open(photo_root/filename).convert('RGBA')
    photo.thumbnail((870,590),Image.Resampling.LANCZOS)
    team_view.alpha_composite(photo,(58+index*936+(870-photo.width)//2,81+(590-photo.height)//2))
overlay(team_view,'L03_系统研发_透明.png',92,590,695)
overlay(team_view,'L02_现场调研_透明.png',1040,590,695)
overlay(team_view,'L01_团队主标_透明.png',130,844,1510)
team_view.convert('RGB').save(ROOT/'预览03_团队大字分屏.jpg',quality=95)
ending=background('G04_夜市片尾_生成背景.png')
overlay(ending,'H02_行楷片尾_透明.png',269,108,1390)
overlay(ending,'N03_AI氛围标识_透明.png',1480,985,360)
ending.convert('RGB').save(ROOT/'预览04_艺术字片尾.jpg',quality=95)
contact=Image.new('RGB',(1920,1160),(227,232,236))
for index,name in enumerate(['预览01_艺术字开场.jpg','预览02_重排技术总览.jpg','预览03_团队大字分屏.jpg','预览04_艺术字片尾.jpg']):
    preview=Image.open(ROOT/name).resize((940,529),Image.Resampling.LANCZOS)
    contact.paste(preview,(10+(index%2)*960,10+(index//2)*580))
contact.save(ROOT/'全部合成预览_v2.jpg',quality=95)
(ROOT/'素材清单.json').write_text(json.dumps(ASSETS,ensure_ascii=False,indent=2),encoding='utf-8')
DELIVERY.mkdir(parents=True,exist_ok=True)
for source in ROOT.iterdir():
    if source.is_file():
        shutil.copy2(source,DELIVERY/source.name)
archive=DELIVERY.parent/'烟火哨兵_艺术字视频包装_v2_20261001.zip'
if archive.exists():
    raise FileExistsError(archive)
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as package:
    for source in DELIVERY.iterdir():
        if source.is_file():
            package.write(source,arcname=DELIVERY.name+'/'+source.name)
print('Validated',len(ASSETS),'transparent assets and 4 composition previews')
