import sys
from pathlib import Path
sys.path.insert(0,str(Path('D:/CICSIC/work/final_layers_20261001/vendor')))
import cv2
import numpy as np
from PIL import Image,ImageDraw,ImageFont,ImageFilter
import json
import shutil
import subprocess
import hashlib
import zipfile

ROOT=Path('D:/CICSIC/outputs/烟火哨兵_视频分层定稿_20261001')
SOURCE=Path('D:/CICSIC/outputs/烟火哨兵_参考风格片头_v4_20261001/片头_紧凑金属艺术字.png')
FONTROOT=Path('C:/Users/xx/AppData/Local/Microsoft/Windows/Fonts')
SIZE=(2048,1152)
for directory in ['文字_不要上传Seedance','背景','预览','制作记录']:
    (ROOT/directory).mkdir(parents=True,exist_ok=True)
source=np.asarray(Image.open(SOURCE).convert('RGB'))
seed=np.full(source.shape[:2],cv2.GC_BGD,dtype=np.uint8)
seed[357:740,275:1840]=cv2.GC_PR_BGD
polygon_mask=Image.new('L',SIZE,0)
polygons=[[(340,428),(402,391),(696,391),(733,452),(702,648),(691,713),(306,724),(293,696)],[(729,415),(838,386),(938,387),(928,470),(1023,416),(1082,415),(1026,540),(1055,679),(1081,721),(679,723),(756,570)],[(1090,404),(1225,404),(1254,388),(1381,388),(1384,451),(1425,404),(1470,404),(1442,466),(1477,482),(1440,692),(1413,723),(1032,722)],[(1510,395),(1781,376),(1810,416),(1780,445),(1549,463),(1529,478),(1787,468),(1792,502),(1753,600),(1805,675),(1800,719),(1421,726),(1406,697),(1468,614),(1454,570)]]
for polygon in polygons:
    ImageDraw.Draw(polygon_mask).polygon(polygon,fill=255)
inside=np.zeros(source.shape[:2],dtype=bool)
inside[357:740,275:1840]=True
seed[inside]=cv2.GC_PR_FGD
red=source[:,:,0].astype(np.int32)
green=source[:,:,1].astype(np.int32)
blue=source[:,:,2].astype(np.int32)
foreground=(red>110)&(green>105)&(blue>85)&inside
seed[foreground]=cv2.GC_FGD
cv2.grabCut(source,seed,None,np.zeros((1,65),np.float64),np.zeros((1,65),np.float64),6,cv2.GC_INIT_WITH_MASK)
mask=np.where((seed==cv2.GC_FGD)|(seed==cv2.GC_PR_FGD),255,0).astype(np.uint8)
mask[~inside]=0
count,labels,stats,_=cv2.connectedComponentsWithStats(mask,8)
clean=np.zeros_like(mask)
for label in range(1,count):
    if stats[label,cv2.CC_STAT_AREA]>=180:
        clean[labels==label]=255
depth_mask=clean.copy()
for depth in range(1,23):
    horizontal=round(depth*.55)
    translated=np.zeros_like(clean)
    translated[depth:,horizontal:]=clean[:-depth,:-horizontal]
    depth_mask=np.maximum(depth_mask,translated)
depth_mask[~inside]=0
alpha=Image.fromarray(depth_mask).filter(ImageFilter.GaussianBlur(.35))
title=Image.fromarray(source).convert('RGBA')
title.putalpha(alpha)
title.save(ROOT/'文字_不要上传Seedance/H01_原片头艺术字_透明全画布.png')
check=Image.open(ROOT/'文字_不要上传Seedance/H01_原片头艺术字_透明全画布.png')
check_pixels=np.asarray(check)
visible=check_pixels[:,:,3]>0
if not np.array_equal(check_pixels[:,:,:3][visible],source[visible]):
    raise ValueError('Original title RGB changed')
if np.count_nonzero(check_pixels[:,:,3]>128)<180000:
    raise ValueError('Title segmentation too small')

def font(size,heavy=False):
    return ImageFont.truetype(str(FONTROOT/('思源黑体 CN Heavy.otf' if heavy else '思源黑体 CN Regular.otf')),size)

def text(draw,position,content,size,fill,heavy=False):
    selected=font(size,heavy)
    bounds=draw.textbbox((0,0),content,font=selected)
    draw.text((position[0]-bounds[0],position[1]-bounds[1]),content,font=selected,fill=fill)

def centered(draw,content,top,size,fill,heavy=False):
    bounds=draw.textbbox((0,0),content,font=font(size,heavy))
    text(draw,((SIZE[0]-bounds[2]+bounds[0])/2,top),content,size,fill,heavy)

def layer(name,content,top,size=52,heavy=False,fill=(246,251,255,255)):
    image=Image.new('RGBA',SIZE,(0,0,0,0))
    centered(ImageDraw.Draw(image),content,top,size,fill,heavy)
    image.save(ROOT/'文字_不要上传Seedance'/name)
    return image

subtitle=Image.new('RGBA',SIZE,(0,0,0,0))
draw=ImageDraw.Draw(subtitle)
draw.polygon([(297,744),(1780,744),(1719,837),(354,837)],fill=(2,38,76,227),outline=(93,178,230,255),width=2)
centered(draw,'公共安全智能预警与秒级响应系统',769,53,(255,255,255,255),True)
subtitle.save(ROOT/'文字_不要上传Seedance/H02_副标题铭牌_透明全画布.png')
footer=layer('H03_片尾标语_透明全画布.png','以科技护烟火，以协同守平安',779,60,True,(255,231,170,255))
centered(ImageDraw.Draw(footer),'江西司法警官职业学院',874,38,(222,239,250,255))
footer.save(ROOT/'文字_不要上传Seedance/H03_片尾标语_透明全画布.png')
layer('T00_技术总览标题_透明全画布.png','三项技术方向',120,88,True)
labels=[('01','跨夜市分级','研判预警','已核验线索汇聚 · 辅助研判'),('02','多模态风险','识别','算法初筛 · 视觉复核 · 人工核验'),('03','线上一键报警','与无人机联动','平台求助入口 · 设备联调探索')]
for number,first,second,caption in labels:
    image=Image.new('RGBA',(650,480),(0,0,0,0))
    draw=ImageDraw.Draw(image)
    draw.polygon([(25,12),(637,12),(617,465),(5,465)],fill=(5,26,49,242),outline=(88,175,224,255),width=2)
    draw.line((30,16,632,16),fill=(240,190,83,255),width=5)
    text(draw,(40,44),number,100,(230,186,83,255),True)
    text(draw,(40,191),first,58,(248,253,255,255),True)
    text(draw,(40,277),second,58,(248,253,255,255),True)
    text(draw,(40,405),caption,22,(188,214,232,255))
    image.save(ROOT/'文字_不要上传Seedance'/('T'+number+'_技术卡片_透明.png'))

team=Image.new('RGBA',(1650,170),(0,0,0,0))
draw=ImageDraw.Draw(team)
draw.polygon([(20,8),(1632,8),(1606,158),(0,158)],fill=(4,27,49,232),outline=(90,165,210,255),width=2)
text(draw,(45,29),'烟火哨兵项目团队',61,(250,253,255,255),True)
text(draw,(936,55),'江西司法警官职业学院',32,(211,228,240,255))
team.save(ROOT/'文字_不要上传Seedance/L01_团队名称_透明.png')
for filename,content in [('L02_调研','现场调研｜从需求出发'),('L03_研发','系统研发与需求转化'),('L04_联调','设备联调与测试记录'),('L05_交流','指导交流与方案完善'),('N01_系统演示','系统演示，非实时业务记录'),('N02_机制示意','机制示意'),('N03_AI氛围','AI生成氛围画面'),('N04_求助边界','平台求助不替代110电话报警'),('N05_响应边界','秒级响应指系统内部信息链路，非人员到场时间')]:
    width=max(350,round(len(content)*34+66))
    image=Image.new('RGBA',(width,94),(0,0,0,0))
    draw=ImageDraw.Draw(image)
    draw.rectangle((8,8,width-8,86),fill=(3,18,32,215))
    draw.rectangle((8,8,13,86),fill=(231,179,75,255))
    text(draw,(30,28),content,32,(244,250,255,255))
    image.save(ROOT/'文字_不要上传Seedance'/(filename+'_透明.png'))

for filename in ['G01_夜市开场_生成背景.png','G02_三项技术_展示空间背景.png','G03_团队多图_展示背景.png','G04_夜市片尾_生成背景.png']:
    shutil.copy2(Path('D:/CICSIC/outputs/烟火哨兵_AI补充背景_20261001')/filename,ROOT/'背景'/filename)

for filename,content in [('P01_算法初筛','YOLOv8初筛'),('P02_视觉复核','Qwen-VL复核'),('P03_人工核验','人工核验'),('P04_已核验线索','已核验线索'),('P05_统一平台','统一平台'),('P06_辅助分级研判','辅助分级研判')]:
    width=max(380,len(content)*43+90)
    image=Image.new('RGBA',(width,112),(0,0,0,0))
    draw=ImageDraw.Draw(image)
    draw.rounded_rectangle((8,8,width-8,104),radius=12,fill=(4,30,56,235),outline=(99,183,229,255),width=2)
    text(draw,(35,34),content,39,(250,253,255,255),True)
    image.save(ROOT/'文字_不要上传Seedance'/(filename+'_透明.png'))
original_directory=ROOT/'原始素材_不要上传Seedance'
original_directory.mkdir(parents=True,exist_ok=True)
original_source=Path('C:/Users/xx/Documents/Codex/2026-10-01/new-chat/outputs/烟火哨兵_网评脚本与分镜/素材/只供剪辑_不要上传AI')
for original in original_source.iterdir():
    if original.is_file():
        destination=original_directory/original.name
        shutil.copy2(original,destination)
        if hashlib.sha256(original.read_bytes()).digest()!=hashlib.sha256(destination.read_bytes()).digest():
            raise ValueError('Original copy changed')
background_path=ROOT/'背景/B01_科技无字背景.png'
if not background_path.exists():
    print('Masks and text ready; background generation pending')
    sys.exit(0)
background=Image.open(background_path).convert('RGBA').resize(SIZE,Image.Resampling.LANCZOS)
opening=background.copy()
opening.alpha_composite(title)
opening.alpha_composite(subtitle)
opening.convert('RGB').save(ROOT/'预览/01_片头分层合成.jpg',quality=96)
checker=Image.new('RGBA',SIZE,(235,235,235,255))
checker_draw=ImageDraw.Draw(checker)
for vertical in range(0,SIZE[1],32):
    for horizontal in range(0,SIZE[0],32):
        if (vertical//32+horizontal//32)%2:
            checker_draw.rectangle((horizontal,vertical,horizontal+31,vertical+31),fill=(195,195,195,255))
checker.alpha_composite(title)
checker.convert('RGB').save(ROOT/'预览/02_艺术字透明边缘检查.jpg',quality=95)
tech=background.copy()
tech.alpha_composite(Image.open(ROOT/'文字_不要上传Seedance/T00_技术总览标题_透明全画布.png'))
for index,number in enumerate(['01','02','03']):
    tech.alpha_composite(Image.open(ROOT/'文字_不要上传Seedance'/('T'+number+'_技术卡片_透明.png')),(40+index*663,382))
tech.convert('RGB').save(ROOT/'预览/03_技术卡片分层合成.jpg',quality=95)
photo_root=Path('C:/Users/xx/Documents/Codex/2026-10-01/new-chat/outputs/烟火哨兵_网评脚本与分镜/素材/只供剪辑_不要上传AI')
team_preview=Image.open(ROOT/'背景/G03_团队多图_展示背景.png').convert('RGBA')
for index,filename in enumerate(['R09_团队电脑协作_直接剪辑.jpg','R02_团队商户走访_直接剪辑.jpg']):
    photo=Image.open(photo_root/filename).convert('RGBA')
    photo.thumbnail((920,655),Image.Resampling.LANCZOS)
    team_preview.alpha_composite(photo,(54+index*1004+(920-photo.width)//2,120+(655-photo.height)//2))
team_preview.alpha_composite(Image.open(ROOT/'文字_不要上传Seedance/L01_团队名称_透明.png'),(190,909))
team_preview.convert('RGB').save(ROOT/'预览/04_团队多图分层合成.jpg',quality=95)
finish=background.copy()
finish.alpha_composite(title)
finish.alpha_composite(footer)
finish.convert('RGB').save(ROOT/'预览/05_片尾分层合成.jpg',quality=95)
preview=Image.new('RGB',(1600,960),(238,242,246))
for index,filename in enumerate(['01_片头分层合成.jpg','03_技术卡片分层合成.jpg','04_团队多图分层合成.jpg','05_片尾分层合成.jpg']):
    image=Image.open(ROOT/'预览'/filename).resize((780,439),Image.Resampling.LANCZOS)
    preview.paste(image,(10+index%2*800,10+index//2*480))
preview.save(ROOT/'预览/全部合成预览.jpg',quality=95)

VIDEO_SIZE=(1920,1080)
video_path=ROOT/'预览/分层动画验证_14秒_1080p.mp4'
encoder=subprocess.Popen(['ffmpeg','-y','-hide_banner','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s','1920x1080','-r','24','-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','16','-pix_fmt','yuv420p','-movflags','+faststart',str(video_path)],stdin=subprocess.PIPE,stderr=subprocess.PIPE)
try:
    for frame_index in range(14*24):
        seconds=frame_index/24
        scene_index=min(int(seconds//3.5),3)
        local=seconds-scene_index*3.5
        bg=background if scene_index!=2 else Image.open(ROOT/'背景/G03_团队多图_展示背景.png').convert('RGBA')
        scale=1+.012*local/3.5
        enlarged=bg.resize((round(2048*scale),round(1152*scale)),Image.Resampling.BILINEAR)
        base=enlarged.crop(((enlarged.width-2048)//2,(enlarged.height-1152)//2,(enlarged.width+2048)//2,(enlarged.height+1152)//2))
        if scene_index in [0,3]:
            opacity=min(1,local/.32)
            fixed=title.copy()
            fixed.putalpha(title.getchannel('A').point(lambda value:round(value*opacity)))
            base.alpha_composite(fixed)
            secondary=subtitle if scene_index==0 else footer
            secondary=secondary.copy()
            secondary.putalpha(secondary.getchannel('A').point(lambda value:round(value*min(1,max(0,(local-.25)/.25)))))
            base.alpha_composite(secondary)
        elif scene_index==1:
            base.alpha_composite(Image.open(ROOT/'文字_不要上传Seedance/T00_技术总览标题_透明全画布.png'))
            for index,number in enumerate(['01','02','03']):
                progress=min(1,max(0,(local-index*.2)/.35))
                card=Image.open(ROOT/'文字_不要上传Seedance'/('T'+number+'_技术卡片_透明.png')).convert('RGBA')
                card.putalpha(card.getchannel('A').point(lambda value:round(value*progress)))
                base.alpha_composite(card,(40+index*663,382+round((1-progress)*40)))
        else:
            base=team_preview.copy()
        encoded=base.convert('RGB').resize(VIDEO_SIZE,Image.Resampling.LANCZOS)
        encoder.stdin.write(encoded.tobytes())
    encoder.stdin.close()
    errors=encoder.stderr.read().decode('utf-8','replace')
    status=encoder.wait()
    if status:
        raise RuntimeError(errors)
except Exception:
    encoder.kill()
    raise

manifest=[]
for path in sorted(ROOT.rglob('*')):
    if path.is_file():
        entry={'file':str(path.relative_to(ROOT)).replace('\\','/'),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size}
        if path.suffix=='.png':
            with Image.open(path) as image:
                entry['size']=image.size
                entry['transparent']=image.mode=='RGBA' and image.getextrema()[3][0]==0
            with Image.open(path) as verification:
                verification.verify()
        manifest.append(entry)
(ROOT/'制作记录/素材清单.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
validation={'titleRgbRetainedFromSource':True,'visibleTitlePixels':int(np.count_nonzero(visible)),'textNeverSentToVideoGenerator':True,'previewVideo':'14 seconds, 1920x1080, 24fps, no audio','backgroundSource':'image API edited to remove text','limitation':'Title mask is a visual extraction; original subtle glows and some antialiasing may not be completely separated. Check checkerboard preview. Seedance not called.'}
(ROOT/'制作记录/验证说明.json').write_text(json.dumps(validation,ensure_ascii=False,indent=2),encoding='utf-8')
DELIVERY=Path('C:/Users/xx/Documents/Codex/2026-10-01/new-chat/outputs/烟火哨兵_视频分层定稿_20261001')
shutil.copytree(ROOT,DELIVERY,dirs_exist_ok=True)
archive=DELIVERY.parent/'烟火哨兵_视频分层定稿_20261001.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as package:
    for path in DELIVERY.rglob('*'):
        if path.is_file():
            package.write(path,arcname=str(Path(DELIVERY.name)/path.relative_to(DELIVERY)))
print('Ready: preserved title RGB, transparent typography, blank backgrounds, previews and 14-second animation test')
