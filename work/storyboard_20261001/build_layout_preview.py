from pathlib import Path
import json
import subprocess
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path('D:/CICSIC/outputs/烟火哨兵_逐镜导演执行稿_20261001')
LAYERS = Path('D:/CICSIC/outputs/烟火哨兵_视频分层定稿_20261001')
WORK = Path('D:/CICSIC/work/storyboard_20261001')
SCALE = 0.5
FONT = 'C:/Windows/Fonts/msyh.ttc'
SHOTS = json.loads((ROOT / '04_时间轴.json').read_text(encoding='utf-8'))['shots']
OUT = ROOT / '布局参考_非最终成片'
OUT.mkdir(exist_ok=True)

def locate(name):
    return (ROOT if name.startswith('原始补充素材/') else LAYERS) / name

def image_for(prefix):
    for shot in SHOTS:
        for asset in shot['assets']:
            if Path(asset).name.startswith(prefix + '_'):
                source = locate(asset)
                if source.suffix == '.mp4':
                    frame = WORK / (prefix + '.jpg')
                    moment = {'R07': 6, 'R10': 37}[prefix]
                    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(moment), '-i', str(source), '-frames:v', '1', str(frame)], check=True)
                    return Image.open(frame).convert('RGBA')
                return Image.open(source).convert('RGBA')
    raise ValueError(prefix)

CACHE = {prefix: image_for(prefix) for prefix in ['R01','R02','R03','R04','R05','R06','R07','R08','R09','R10','R11','R12']}
team_frame = WORK / 'R07_team.jpg'
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', '10', '-i', str(LAYERS / '原始素材_不要上传Seedance/R07_设备联调_原视频.mp4'), '-frames:v', '1', str(team_frame)], check=True)
CACHE['R07_team'] = Image.open(team_frame).convert('RGBA')

def box(canvas, prefix, rect, crop=None):
    source = CACHE[prefix]
    if crop:
        left, top, width, height = crop
        source = source.crop((left, top, left + width, top + height))
    left, top, width, height = [round(value * SCALE) for value in rect]
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((left-2,top-2,left+width+2,top+height+2),radius=8,fill='#14263e',outline='#607998',width=1)
    fitted = ImageOps.contain(source,(width,height),Image.Resampling.LANCZOS)
    canvas.alpha_composite(fitted,(left+(width-fitted.width)//2,top+(height-fitted.height)//2))

def label(canvas, text, position, size=46, color='#eaf0fa'):
    draw = ImageDraw.Draw(canvas)
    draw.text(tuple(round(value*SCALE) for value in position),text,font=ImageFont.truetype(FONT,round(size*SCALE)),fill=color)

def overlay(canvas, prefix, rect=None):
    source = next(LAYERS.glob('文字_不要上传Seedance/'+prefix+'_*'))
    image = Image.open(source).convert('RGBA')
    if rect is None:
        canvas.alpha_composite(image.resize(canvas.size,Image.Resampling.LANCZOS))
    else:
        left,top,width,height = [round(value*SCALE) for value in rect]
        image = ImageOps.contain(image,(width,height),Image.Resampling.LANCZOS)
        canvas.alpha_composite(image,(left,top))

frames=[]
for shot in SHOTS:
    ident=shot['id']
    back='G03_团队多图_展示背景.png' if ident in ['S03','S13'] else ('G02_三项技术_展示空间背景.png' if ident=='S05' else 'B01_科技无字背景.png')
    canvas=Image.open(LAYERS/'背景'/back).convert('RGBA').resize((960,540),Image.Resampling.LANCZOS)
    if ident=='S01':
        overlay(canvas,'H01');overlay(canvas,'H02')
    elif ident=='S02':
        box(canvas,'R01',(96,90,1160,805));box(canvas,'R03',(1310,310,500,330));label(canvas,'人流密集',(1320,145));label(canvas,'现场观察与协同需求',(1320,710),30)
    elif ident=='S03':
        box(canvas,'R02',(95,95,1050,690));box(canvas,'R11',(1190,205,625,520));overlay(canvas,'L02',(115,810,700,100))
    elif ident=='S04':
        box(canvas,'R03',(120,110,1340,780));label(canvas,'现场画面',(1495,280));label(canvas,'↓',(1600,460));label(canvas,'待核线索',(1495,600));label(canvas,'场景素材',(1495,765),32)
    elif ident=='S05':
        for prefix,left in [('P01',130),('P02',740),('P03',1350)]:overlay(canvas,prefix,(left,395,440,140))
        label(canvas,'→',(620,450),46,'#18304a');label(canvas,'→',(1230,450),46,'#18304a');label(canvas,'模型结果为待核线索',(620,700),38,'#18304a');overlay(canvas,'N02',(1530,80,280,80))
    elif ident=='S06':
        box(canvas,'R04',(72,100,1200,760));box(canvas,'R04',(1300,220,550,515),(1290,475,605,355));overlay(canvas,'N01',(90,865,640,65));overlay(canvas,'P03',(1350,90,440,100))
    elif ident=='S07':
        draw=ImageDraw.Draw(canvas)
        for center in [310,530,750]:
            draw.rounded_rectangle((100,round((center-65)*SCALE),240,round((center+65)*SCALE)),radius=7,outline='#6ca7cf',width=2)
            draw.line((240,round(center*SCALE),480,240),fill='#6ca7cf',width=2)
        overlay(canvas,'P04',(160,85,520,120));overlay(canvas,'P05',(820,420,580,120));overlay(canvas,'P06',(820,630,750,120));overlay(canvas,'N02',(1530,80,280,80))
    elif ident=='S08':
        box(canvas,'R05',(85,190,1030,650));box(canvas,'R05',(1150,195,690,640),(1080,275,500,605));overlay(canvas,'N01',(90,865,640,65))
    elif ident=='S09':
        box(canvas,'R06',(130,68,620,850));label(canvas,'群众上报',(890,180),72);label(canvas,'位置与情况',(890,380));label(canvas,'进入平台待核',(890,520));overlay(canvas,'N04',(850,810,820,85))
    elif ident=='S10':
        box(canvas,'R05',(710,95,1060,750),(1080,275,500,605));label(canvas,'位置确认',(95,230),58);label(canvas,'人工核验',(95,390),58);label(canvas,'任务派单',(95,550),58);overlay(canvas,'N05',(170,850,1500,85));overlay(canvas,'N01',(1230,45,640,65))
    elif ident=='S11':
        box(canvas,'R07',(70,65,1780,850));overlay(canvas,'L04',(95,780,650,95))
    elif ident=='S12':
        box(canvas,'R08',(95,75,1100,820));label(canvas,'模块试用',(1250,245),68);label(canvas,'持续验证',(1250,425),68);label(canvas,'项目提供材料',(1250,655),36);label(canvas,'非整套系统验收',(1250,715),36)
    elif ident=='S13':
        box(canvas,'R09',(80,85,1080,650));box(canvas,'R12',(1220,160,610,490));overlay(canvas,'L03',(100,735,660,100));overlay(canvas,'L01',(170,865,1580,100))
    elif ident=='S14':
        box(canvas,'R07_team',(70,55,1780,800));overlay(canvas,'L04',(100,735,660,100));overlay(canvas,'L01',(170,865,1580,100))
    elif ident=='S15':
        box(canvas,'R10',(80,70,870,760));label(canvas,'现场交流',(1080,230),72);label(canvas,'方案完善',(1080,430),72);overlay(canvas,'L05',(1080,700,660,100));overlay(canvas,'L01',(170,865,1580,100))
    elif ident=='S16':
        overlay(canvas,'H01');overlay(canvas,'H03')
    canvas.convert('RGB').save(OUT/(ident+'_布局参考.jpg'),quality=94)
    frames.append(canvas.convert('RGB'))

sheet=Image.new('RGB',(1960,1370),'#08121f')
draw=ImageDraw.Draw(sheet)
draw.text((20,14),'烟火哨兵｜16镜头布局参考（非最终成片）',font=ImageFont.truetype(FONT,32),fill='#f2f5fa')
draw.text((20,58),'照片与页面来自原素材；文字后期独立叠加。小图只检查构图，不用于验收页面可读性。',font=ImageFont.truetype(FONT,20),fill='#a4b8d0')
for index,(shot,frame) in enumerate(zip(SHOTS,frames)):
    left=20+(index%4)*485
    top=102+(index//4)*312
    sheet.paste(frame.resize((470,264),Image.Resampling.LANCZOS),(left,top))
    draw.text((left,top+270),f"{shot['id']}  {shot['start']:02d}—{shot['end']:02d}秒  {shot['title'][:13]}",font=ImageFont.truetype(FONT,19),fill='#d9e5f6')
sheet.save(ROOT/'08_16镜头布局总览_非最终成片.jpg',quality=94)
print(json.dumps({'frames':len(frames),'sheet':str(ROOT/'08_16镜头布局总览_非最终成片.jpg')},ensure_ascii=False))
