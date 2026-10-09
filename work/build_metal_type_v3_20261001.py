from pathlib import Path
import json
import math
import random
import shutil
import zipfile
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops

ROOT=Path('D:/CICSIC/outputs/烟火哨兵_金属立体字视频包装_v3_20261001')
DELIVERY=Path('C:/Users/xx/Documents/Codex/2026-10-01/new-chat/outputs/烟火哨兵_金属立体字视频包装_v3_20261001')
FONTROOT=Path('C:/Users/xx/AppData/Local/Microsoft/Windows/Fonts')
ROOT.mkdir(parents=True,exist_ok=True)
RECORDS=[]

def font(size,heavy=False):
    return ImageFont.truetype(str(FONTROOT/('思源黑体 CN Heavy.otf' if heavy else '思源黑体 CN Regular.otf')),size)

def gradient(size,stops):
    image=Image.new('RGBA',size)
    draw=ImageDraw.Draw(image)
    for row in range(size[1]):
        value=row/max(1,size[1]-1)
        for index in range(len(stops)-1):
            if stops[index][0]<=value<=stops[index+1][0]:
                start,color=stops[index]
                end,nextcolor=stops[index+1]
                fraction=(value-start)/(end-start)
                fill=tuple(round(color[channel]+(nextcolor[channel]-color[channel])*fraction) for channel in range(3))+(255,)
                draw.line((0,row,size[0],row),fill=fill)
                break
    return image

def shift(mask,left,top):
    result=Image.new('L',mask.size,0)
    result.paste(mask,(left,top))
    return result

def tint(mask,color):
    image=Image.new('RGBA',mask.size,color+(255,))
    image.putalpha(mask)
    return image

def save(image,name,text,use):
    image.save(ROOT/name)
    with Image.open(ROOT/name) as check:
        check.verify()
    RECORDS.append({'file':name,'text':text,'size':image.size,'use':use})

SILVER=[(0,(245,252,255)),(.22,(186,210,231)),(.44,(250,254,255)),(.49,(221,235,246)),(.55,(113,150,184)),(.78,(197,218,239)),(1,(119,158,193))]
GOLD=[(0,(255,248,204)),(.22,(248,207,95)),(.44,(255,239,153)),(.50,(226,177,53)),(.57,(177,118,24)),(.82,(253,211,94)),(1,(184,129,31))]

def metal_word(character,gold=False,size=440):
    glyph=Image.new('L',(560,550),0)
    drawing=ImageDraw.Draw(glyph)
    selected=font(size,True)
    bounds=drawing.textbbox((0,0),character,font=selected)
    drawing.text((62-bounds[0],43-bounds[1]),character,font=selected,fill=255)
    glyph=glyph.transform(glyph.size,Image.Transform.AFFINE,(1,-.16,46,0,1,0),resample=Image.Resampling.BICUBIC)
    result=Image.new('RGBA',glyph.size,(0,0,0,0))
    shadow=shift(glyph,19,31).filter(ImageFilter.GaussianBlur(12))
    shadow=shadow.point(lambda value:round(value*.75))
    result.alpha_composite(tint(shadow,(0,5,23)))
    glow=glyph.filter(ImageFilter.GaussianBlur(9)).point(lambda value:round(value*.5))
    result.alpha_composite(tint(glow,(231,157,35) if gold else (15,147,255)))
    for depth in range(25,0,-1):
        color=(110+depth,70+depth//2,13) if gold else (9,48+depth,113+depth*2)
        result.alpha_composite(tint(shift(glyph,round(depth*.47),depth),color))
    expanded=glyph.filter(ImageFilter.MaxFilter(5))
    result.alpha_composite(tint(expanded,(255,225,139) if gold else (121,208,255)))
    surface=gradient(glyph.size,GOLD if gold else SILVER)
    surface.putalpha(glyph)
    result.alpha_composite(surface)
    highlight=ImageChops.subtract(glyph,shift(glyph,3,4))
    result.alpha_composite(tint(highlight,(255,250,215) if gold else (245,253,255)))
    lower=ImageChops.subtract(glyph,shift(glyph,-3,-4))
    lower=lower.point(lambda value:round(value*.7))
    result.alpha_composite(tint(lower,(132,86,16) if gold else (34,78,120)))
    return result

main=Image.new('RGBA',(2100,590),(0,0,0,0))
for index,character in enumerate('烟火哨兵'):
    main.alpha_composite(metal_word(character,index==2),(index*499,0))
save(main,'M01_烟火哨兵_银蓝金立体字_透明.png','烟火哨兵','主标题独立层；哨为金色')

def centered(draw,text,top,size,color,width,heavy=False):
    selected=font(size,heavy)
    bounds=draw.textbbox((0,0),text,font=selected)
    if bounds[2]-bounds[0]>width-80:
        raise ValueError('Overflow '+text)
    draw.text(((width-bounds[2]+bounds[0])/2,top-bounds[1]),text,font=selected,fill=color)

subtitle=Image.new('RGBA',(1900,220),(0,0,0,0))
draw=ImageDraw.Draw(subtitle)
draw.polygon([(40,25),(1860,25),(1775,187),(125,187)],fill=(5,59,111,225),outline=(109,192,244,250),width=3)
draw.line((185,184,1715,184),fill=(75,192,255,220),width=4)
centered(draw,'公共安全智能预警与秒级响应系统',70,65,(249,253,255,255),1900)
save(subtitle,'M02_项目副标题_科技铭牌_透明.png','公共安全智能预警与秒级响应系统','副标题独立层')
ending=Image.new('RGBA',(1700,225),(0,0,0,0))
draw=ImageDraw.Draw(ending)
centered(draw,'以科技护烟火，以协同守平安',25,67,(255,242,206,255),1700,True)
centered(draw,'江西司法警官职业学院',135,40,(225,241,252,255),1700)
save(ending,'M03_片尾标语与学校_透明.png','以科技护烟火，以协同守平安；江西司法警官职业学院','片尾独立层')

random.seed(37)
background=gradient((1920,1080),[(0,(3,13,34)),(.5,(5,33,70)),(1,(9,55,96))])
draw=ImageDraw.Draw(background)
for center,radius in [((985,430),440),((1740,420),260)]:
    for multiplier in [.55,.75,1,1.18]:
        ring=radius*multiplier
        draw.arc((center[0]-ring,center[1]-ring,center[0]+ring,center[1]+ring),185,350,fill=(28,81,112,255),width=2)
    for angle in range(0,360,15):
        radians=math.radians(angle)
        inner=(center[0]+radius*.95*math.cos(radians),center[1]+radius*.95*math.sin(radians))
        outer=(center[0]+radius*math.cos(radians),center[1]+radius*math.sin(radians))
        draw.line((inner,outer),fill=(37,108,151,255),width=2)
for index in range(100):
    position=(random.randrange(1920),random.randrange(1080))
    draw.ellipse((position[0],position[1],position[0]+2,position[1]+2),fill=(93,151,190,190))
for index in range(12):
    start=(random.randrange(1920),random.randrange(100,1000))
    end=(start[0]+random.randrange(-400,400),start[1]+random.randrange(-120,120))
    draw.line((start,end),fill=(29,76,113,255),width=1)
save(background,'B01_无字科技轨道背景.png','','装饰背景，无坐标数值或真实数据')
light=Image.new('RGBA',(1920,1080),(0,0,0,0))
draw=ImageDraw.Draw(light)
for horizontal,vertical in [(260,358),(1060,310),(1630,614)]:
    for length in range(50,0,-1):
        alpha=round((1-length/51)*200)
        draw.line((horizontal-length,vertical,horizontal+length,vertical),fill=(255,235,176,alpha),width=2)
        draw.line((horizontal,vertical-length*.6,horizontal,vertical+length*.6),fill=(235,251,255,alpha),width=2)
    draw.ellipse((horizontal-4,vertical-4,horizontal+4,vertical+4),fill=(255,255,232,255))
save(light,'F01_独立星芒高光_透明.png','','后期淡入高光，不要多次闪烁')

tech_labels=[('01','跨夜市分级','研判预警','已核验线索汇聚 · 辅助研判'),('02','多模态风险','识别','算法初筛 · 视觉复核 · 人工核验'),('03','线上一键报警','与无人机联动','平台求助入口 · 设备联调探索')]
for number,first,second,caption in tech_labels:
    card=Image.new('RGBA',(720,510),(0,0,0,0))
    draw=ImageDraw.Draw(card)
    draw.polygon([(35,20),(690,20),(659,490),(10,490)],fill=(7,29,56,244),outline=(68,151,209,255),width=3)
    draw.line((40,24,684,24),fill=(225,184,81,255),width=7)
    draw.text((51,30),number,font=ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf',117),fill=(225,191,102,255))
    for text,top in [(first,191),(second,285)]:
        selected=font(65,True)
        bounds=draw.textbbox((0,0),text,font=selected)
        position=(45,top-bounds[1])
        draw.text((position[0]+3,position[1]+4),text,font=selected,fill=(12,81,135,255))
        draw.text(position,text,font=selected,fill=(242,251,255,255),stroke_width=1,stroke_fill=(167,208,234,255))
    centered(draw,caption,429,24,(202,224,241,255),720)
    save(card,'T'+number+'_科技技术卡片_透明.png',first+second+'；'+caption,'与主标题统一的科技色系')

team=Image.new('RGBA',(1580,210),(0,0,0,0))
draw=ImageDraw.Draw(team)
draw.polygon([(30,15),(1550,15),(1510,195),(0,195)],fill=(4,34,65,234),outline=(81,165,215,255),width=2)
centered(draw,'烟火哨兵项目团队',39,69,(245,252,255,255),1580,True)
centered(draw,'江西司法警官职业学院',131,34,(222,235,243,255),1580)
save(team,'L01_团队名称_科技铭牌_透明.png','烟火哨兵项目团队；江西司法警官职业学院','团队12秒持续层')

note=Image.new('RGBA',(500,90),(0,0,0,0))
draw=ImageDraw.Draw(note)
draw.rectangle((8,8,492,82),fill=(0,13,28,204))
centered(draw,'视觉包装示意',26,32,(228,242,252,255),500)
save(note,'N01_视觉包装示意_透明.png','视觉包装示意','预览说明，背景不是性能记录')

def overlay(base,name,left,top,width):
    layer=Image.open(ROOT/name).convert('RGBA')
    layer=layer.resize((width,round(layer.height*width/layer.width)),Image.Resampling.LANCZOS)
    base.alpha_composite(layer,(left,top))

opening=background.copy()
overlay(opening,'M01_烟火哨兵_银蓝金立体字_透明.png',105,300,1710)
overlay(opening,'M02_项目副标题_科技铭牌_透明.png',210,758,1500)
opening.alpha_composite(light)
overlay(opening,'N01_视觉包装示意_透明.png',1450,981,360)
opening.convert('RGB').save(ROOT/'预览01_参考风格开场.jpg',quality=96)
finish=background.copy()
overlay(finish,'M01_烟火哨兵_银蓝金立体字_透明.png',185,230,1550)
overlay(finish,'M03_片尾标语与学校_透明.png',320,730,1280)
overlay(finish,'N01_视觉包装示意_透明.png',1450,981,360)
finish.convert('RGB').save(ROOT/'预览02_参考风格片尾.jpg',quality=96)
tech=background.copy()
draw=ImageDraw.Draw(tech)
centered(draw,'三项技术方向',110,88,(242,251,255,255),1920,True)
for index,number in enumerate(['01','02','03']):
    overlay(tech,'T'+number+'_科技技术卡片_透明.png',55+index*623,343,590)
centered(draw,'技术辅助判断，真实素材支撑',868,35,(170,200,222,255),1920)
tech.convert('RGB').save(ROOT/'预览03_统一科技卡片.jpg',quality=96)
contact=Image.new('RGB',(1440,1335),(4,15,30))
for index,name in enumerate(['预览01_参考风格开场.jpg','预览03_统一科技卡片.jpg','预览02_参考风格片尾.jpg']):
    preview=Image.open(ROOT/name).resize((760,428),Image.Resampling.LANCZOS)
    contact.paste(preview,(15,index*440+10))
    drawing=ImageDraw.Draw(contact)
    title=['银蓝金 · 立体大标题','同色系 · 技术卡片','片尾 · 品牌收束'][index]
    drawing.text((805,index*440+100),title,font=font(37,True),fill=(238,246,253))
    drawing.text((805,index*440+185),'中文字形固定\n透明图层独立叠加\n光效与背景分开',font=font(29),fill=(170,202,226),spacing=20)
contact.save(ROOT/'全部合成预览_v3.jpg',quality=95)
(ROOT/'素材清单.json').write_text(json.dumps(RECORDS,ensure_ascii=False,indent=2),encoding='utf-8')
DELIVERY.mkdir(parents=True,exist_ok=True)
for source in ROOT.iterdir():
    if source.is_file():
        shutil.copy2(source,DELIVERY/source.name)
archive=DELIVERY.parent/'烟火哨兵_金属立体字视频包装_v3_20261001.zip'
if archive.exists():
    raise FileExistsError(archive)
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as package:
    for source in DELIVERY.iterdir():
        if source.is_file():
            package.write(source,arcname=DELIVERY.name+'/'+source.name)
print('Verified',len(RECORDS),'assets; text rendered from fonts, no image generation API used')
