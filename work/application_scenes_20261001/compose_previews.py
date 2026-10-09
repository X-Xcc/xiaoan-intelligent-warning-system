from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps
ROOT=Path('C:/Users/xx/Documents/Codex/2026-10-01/new-chat/outputs/烟火哨兵_AI应用场景_20261001')
SRC=Path('D:/CICSIC/outputs/烟火哨兵_视频分层定稿_20261001/原始素材_不要上传Seedance')
OUT=ROOT/'后期叠屏预览_不要上传Seedance'
OUT.mkdir(exist_ok=True)
FONT='C:/Windows/Fonts/msyh.ttc'
def plate(image,text,xy,size=34):
    draw=ImageDraw.Draw(image)
    font=ImageFont.truetype(FONT,size)
    bbox=draw.textbbox(xy,text,font=font)
    draw.rounded_rectangle((bbox[0]-16,bbox[1]-12,bbox[2]+16,bbox[3]+12),radius=9,fill=(8,18,31,235))
    draw.text(xy,text,font=font,fill='#eef4fc')

def perspective_layer(source,corners,size):
    width,height=source.size
    src=[(0,0),(width,0),(width,height),(0,height)]
    matrix=[]
    values=[]
    for (target_x,target_y),(source_x,source_y) in zip(corners,src):
        matrix.append([target_x,target_y,1,0,0,0,-source_x*target_x,-source_x*target_y])
        matrix.append([0,0,0,target_x,target_y,1,-source_y*target_x,-source_y*target_y])
        values.extend([source_x,source_y])
    coefficients=np.linalg.solve(np.array(matrix),np.array(values))
    return source.transform(size,Image.Transform.PERSPECTIVE,coefficients,Image.Resampling.BICUBIC,fillcolor=(0,0,0,0))

mobile=Image.open(ROOT/'A01_应用场景_无字.png').convert('RGBA')
page=Image.open(SRC/'R06_移动端一键报警_直接剪辑.png').convert('RGBA')
slot=Image.new('RGBA',(384,851),(14,20,28,255))
fitted=ImageOps.contain(page,slot.size,Image.Resampling.LANCZOS)
slot.alpha_composite(fitted,((384-fitted.width)//2,(851-fitted.height)//2))
mask=Image.new('L',slot.size,0)
ImageDraw.Draw(mask).rounded_rectangle((0,0,383,850),radius=32,fill=255)
slot.putalpha(mask)
mobile.alpha_composite(slot,(431,105))
plate(mobile,'群众上报',(1050,470),72)
plate(mobile,'平台求助不替代110电话报警',(1050,600),38)
plate(mobile,'AI应用场景演绎｜原页面静态叠加，非提交记录',(100,1060),34)
mobile.convert('RGB').save(OUT/'A01_真实移动端叠屏预览.jpg',quality=96)

analyst=Image.open(ROOT/'A02_应用场景_无字.png').convert('RGBA')
page=Image.open(SRC/'R04_指挥研判页面_直接剪辑.png').convert('RGBA')
canvas=Image.new('RGBA',(1920,1100),(12,18,25,255))
canvas.alpha_composite(page,(0,10))
layer=perspective_layer(canvas,[(861,230),(1821,224),(1811,786),(861,763)],analyst.size)
analyst.alpha_composite(layer)
plate(analyst,'AI应用场景演绎｜系统演示，非真实业务记录',(92,1050),34)
analyst.convert('RGB').save(OUT/'A02_真实研判页面叠屏预览.jpg',quality=96)

report=[]
for image_path in sorted(ROOT.glob('A0*_应用场景_无字.png')):
    image=Image.open(image_path)
    image.verify()
    report.append({'file':image_path.name,'size':Image.open(image_path).size,'bytes':image_path.stat().st_size})
(ROOT/'图片尺寸核对.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'generated':len(report),'composites':2,'sizes':report},ensure_ascii=False))

