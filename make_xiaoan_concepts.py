from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageFilter
from pathlib import Path
import math, os

BASE=Path(r'D:\xx\Desktop\烟火哨兵  材料收集表\烟火哨兵\全页替换图片_20260918\01_逐页替换图')
OUT=Path(r'D:\CICSIC\outputs\xiaoan-page-concepts')
OUT.mkdir(parents=True,exist_ok=True)
W,H=1920,1080
BG=(13,20,31); PANEL=(24,33,47); BORDER=(56,74,98); TEXT=(239,244,250); MUTED=(154,171,192); CYAN=(52,210,210); BLUE=(76,145,255); AMBER=(246,181,62); GREEN=(73,207,146); RED=(255,105,105)
font_path=r'C:\Windows\Fonts\msyh.ttc'
def F(size,bold=False):
    try: return ImageFont.truetype(font_path,size,index=1 if bold else 0)
    except: return ImageFont.truetype(r'C:\Windows\Fonts\arial.ttf',size)
FB=F(42,True); FS=F(23); FM=F(28,True); FC=F(19); FT=F(17)

def rounded(draw,box,r=18,fill=PANEL,outline=BORDER,width=2): draw.rounded_rectangle(box,radius=r,fill=fill,outline=outline,width=width)
def load(rel):
    p=BASE/rel
    return Image.open(p).convert('RGB')
def fit(im,box):
    x,y,w,h=box
    return ImageOps.fit(im,(int(w),int(h)),method=Image.Resampling.LANCZOS,centering=(0.5,0.5))
def put(im,src,box,r=14):
    x,y,w,h=map(int,box); crop=fit(src,(x,y,w,h)); mask=Image.new('L',(w,h),0); ImageDraw.Draw(mask).rounded_rectangle((0,0,w,h),r,fill=255); im.paste(crop,(x,y),mask)
def txt(d,xy,s,font=FS,fill=TEXT): d.text(xy,s,font=font,fill=fill)
def line_arrow(d,a,b,color=CYAN,width=6):
    d.line([a,b],fill=color,width=width)
    ang=math.atan2(b[1]-a[1],b[0]-a[0]); L=20
    p1=(b[0]-L*math.cos(ang-0.5),b[1]-L*math.sin(ang-0.5)); p2=(b[0]-L*math.cos(ang+0.5),b[1]-L*math.sin(ang+0.5))
    d.polygon([b,p1,p2],fill=color)
def header(im,d,num,title,sub):
    txt(d,(54,34),f'{num}  {title}',FB); txt(d,(56,88),sub,FS,MUTED); d.line((54,132,1860,132),fill=BORDER,width=2)
def chip(d,box,label,color=CYAN):
    rounded(d,box,r=14,fill=(color[0]//8,color[1]//8,color[2]//8),outline=color,width=2); txt(d,(box[0]+14,box[1]+8),label,FC,color)
def save(im,name): im.save(OUT/name,quality=95)

# 14
im=Image.new('RGB',(W,H),BG); d=ImageDraw.Draw(im); header(im,d,'01','事件线索核验与分级协作','以小安真实页面为底图：上报 → 核验 → 归档 → 任务提醒')
imgs=[load(r'第14页\\P14_01_左上用户线索上报.png'),load(r'第14页\\P14_02_左下人员研判列表.png'),load(r'第14页\\P14_03_右上全域预警画面.png')]
boxes=[(54,185,520,350),(700,185,520,350),(1346,185,520,350)]
labels=['① 线索进入','② 授权核验与归档','③ 跨夜市协作提醒']
for src,b,l in zip(imgs,boxes,labels): rounded(d,(b[0]-8,b[1]-40,b[0]+b[2]+8,b[1]+b[3]+8)); put(im,src,b); chip(d,(b[0],b[1]-36,b[2]//2+b[0],b[1]-5),l, CYAN if '提醒' not in l else AMBER)
line_arrow(d,(582,360),(690,360)); line_arrow(d,(1228,360),(1334,360))
rounded(d,(54,650,1866,980),fill=(18,28,42))
for x,t,c in [(100,'事件对象',BLUE),(520,'人工确认',GREEN),(940,'风险排序',AMBER),(1360,'任务留痕',CYAN)]:
    d.ellipse((x,735,x+56,791),fill=c); txt(d,(x+82,735),t,FM); txt(d,(x+82,780),'事件 / 地点 / 任务状态',FC,MUTED)
line_arrow(d,(395,763),(495,763),MUTED,4); line_arrow(d,(815,763),(915,763),MUTED,4); line_arrow(d,(1235,763),(1335,763),MUTED,4)
save(im,'01_事件线索核验与分级协作.png')

# 15
im=Image.new('RGB',(W,H),BG); d=ImageDraw.Draw(im); header(im,d,'02','视频初筛与视觉复核','保留小安页面的真实画面：检测结果只是候选，最终由人工确认')
imgs=[load(r'第15页\\P15_01_左侧移动感知场景.png'),load(r'第15页\\P15_02_识姿察变配图.png'),load(r'第15页\\P15_03_去伪辨险配图.png'),load(r'第15页\\P15_04_闭环报送配图.png')]
labels=['视频输入','YOLO 姿态 / 目标初筛','视觉语义复核','人工确认后报送']
xs=[54,510,966,1422]
for i,(src,x,l) in enumerate(zip(imgs,xs,labels)):
    rounded(d,(x,190,x+390,730)); put(im,src,(x+18,245,354,450)); chip(d,(x+18,205,x+340,238),l,[BLUE,CYAN,(160,110,255),GREEN][i])
    txt(d,(x+20,760),['原始视频帧','关键点 / 检测框','事件语义与证据','事件卡片 / 审核状态'][i],FM)
    if i<3: line_arrow(d,(x+394,460),(xs[i+1]-12,460),CYAN,5)
rounded(d,(54,865,1866,975),fill=(18,28,42)); txt(d,(80,900),'输入',FM,BLUE); txt(d,(185,900),'视频帧',FS); txt(d,(420,900),'→',FM,CYAN); txt(d,(500,900),'初筛候选',FS); txt(d,(760,900),'→',FM,CYAN); txt(d,(840,900),'语义复核',FS); txt(d,(1100,900),'→',FM,CYAN); txt(d,(1180,900),'人工确认',FS); txt(d,(1460,900),'→',FM,CYAN); txt(d,(1540,900),'事件留痕',FS,GREEN)
save(im,'02_视频初筛与视觉复核.png')

# 16
im=Image.new('RGB',(W,H),BG); d=ImageDraw.Draw(im); header(im,d,'03','识别结果与测试证据','使用真实检测页面，旁边补上评委最关心的测试条件、人工复核和误差分类')
src=load(r'第16页\\P16_01_右侧人群分析截图.png'); rounded(d,(54,178,1170,890)); put(im,src,(74,198,1150,670)); chip(d,(74,210,430,244),'真实画面 + 本地推理输出',GREEN)
rounded(d,(1220,178,1866,890),fill=(18,28,42)); txt(d,(1260,220),'测试证据卡',FM); 
rows=[('输入','夜市单帧 / 视频片段'),('模型输出','行人框、姿态、候选行为'),('人工标准','复核是否构成事件'),('错误分类','误报 / 漏报 / 待定'),('结论口径','阶段性测试，不外推')]
for i,(a,b) in enumerate(rows): y=300+i*92; d.line((1260,y-20,1815,y-20),fill=BORDER,width=2); txt(d,(1260,y),a,FC,MUTED); txt(d,(1450,y),b,FC,TEXT)
rounded(d,(54,930,1866,1000),fill=(18,28,42)); txt(d,(80,950),'页面证明：系统能读入真实夜市画面并输出检测结果；指标必须绑定样本、条件与人工标注。',FC,AMBER)
save(im,'03_识别结果与测试证据.png')

#17
im=Image.new('RGB',(W,H),BG); d=ImageDraw.Draw(im); header(im,d,'04','一键报警与定位派单','同一事件在报警端、地图端和现场协同端保持一致')
imgs=[load(r'第17页\\P17_01_左下报警端.png'),load(r'第17页\\P17_02_中下定位派单图.png'),load(r'第17页\\P17_03_右下无人机现场.png')]
boxes=[(54,185,500,520),(710,185,620,520),(1430,185,436,520)]
labels=['报警端','指挥端：定位与派单','现场端：设备协同']
for i,(src,b,l) in enumerate(zip(imgs,boxes,labels)):
    rounded(d,(b[0]-8,b[1]-40,b[0]+b[2]+8,b[1]+b[3]+8)); put(im,src,b); chip(d,(b[0],b[1]-36,min(b[0]+b[2]-10,b[0]+330),b[1]-5),l,[AMBER,CYAN,GREEN][i])
line_arrow(d,(570,450),(694,450)); line_arrow(d,(1340,450),(1412,450))
rounded(d,(54,800,1866,980),fill=(18,28,42));
for x,t,sub,c in [(100,'T0 提交', '报警内容 + 位置',AMBER),(560,'T1 接收','生成事件卡片',CYAN),(1000,'T2 派单','进入处置队列',BLUE),(1440,'T3 回执','状态与证据留痕',GREEN)]:
    d.ellipse((x,852,x+46,898),fill=c); txt(d,(x+68,838),t,FM); txt(d,(x+68,882),sub,FC,MUTED)
line_arrow(d,(390,875),(520,875),MUTED,4); line_arrow(d,(850,875),(960,875),MUTED,4); line_arrow(d,(1290,875),(1400,875),MUTED,4)
save(im,'04_一键报警与定位派单.png')

#18
im=Image.new('RGB',(W,H),BG); d=ImageDraw.Draw(im); header(im,d,'05','设备任务下发与现场回执','以小安页面中的定位、移动端、真机和空地联动素材，展示“任务是否真正执行”')
imgs=[load(r'第18页\\P18_01_左侧一键定位图.png'),load(r'第18页\\P18_02_中间AI风手机图.png'),load(r'第18页\\P18_04_中间真机实测图.png'),load(r'第18页\\P18_05_右侧空地联动场景.png')]
labels=['目标点位','任务下发','真机联调','现场图传 / 留证']
xs=[54,500,946,1392]
for i,(src,x,l) in enumerate(zip(imgs,xs,labels)):
    rounded(d,(x,185,x+390,720)); put(im,src,(x+18,242,354,420)); chip(d,(x+18,205,x+320,238),l,[BLUE,AMBER,CYAN,GREEN][i]); txt(d,(x+20,748),['位置和区域','移动端任务','设备状态','现场反馈'][i],FM)
    if i<3: line_arrow(d,(x+394,440),(xs[i+1]-12,440),CYAN,5)
rounded(d,(54,835,1866,975),fill=(18,28,42)); txt(d,(80,870),'必须记录的时间点',FM); chips=[('创建',BLUE),('接收',CYAN),('起飞 / 执行',AMBER),('图传 / 留证',GREEN),('完成 / 失败',MUTED)]
xx=420
for t,c in chips: chip(d,(xx,858,xx+190,910),t,c); xx+=260
save(im,'05_设备任务下发与现场回执.png')
print('\n'.join(str(p) for p in sorted(OUT.glob('*.png'))))
