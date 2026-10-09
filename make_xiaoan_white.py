from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageFilter
from pathlib import Path
import math
BASE=Path(r'D:\xx\Desktop\烟火哨兵  材料收集表\烟火哨兵\全页替换图片_20260918\01_逐页替换图')
OUT=Path(r'D:\CICSIC\outputs\xiaoan-page-concepts-white'); OUT.mkdir(parents=True,exist_ok=True)
W,H=1920,1080
BG=(247,249,252); PANEL=(255,255,255); BORDER=(220,227,236); TEXT=(28,42,61); MUTED=(104,120,140); NAVY=(31,65,104); BLUE=(44,125,226); CYAN=(25,177,188); AMBER=(224,157,36); GREEN=(39,170,118); RED=(226,79,86); SHADOW=(232,237,244)
font_path=r'C:\Windows\Fonts\msyh.ttc'
def F(size,bold=False):
    try:return ImageFont.truetype(font_path,size,index=1 if bold else 0)
    except:return ImageFont.truetype(r'C:\Windows\Fonts\arial.ttf',size)
FB=F(42,True); FS=F(23); FM=F(28,True); FC=F(19); FT=F(17)
def rounded(d,b,r=18,fill=PANEL,outline=BORDER,width=2):d.rounded_rectangle(b,radius=r,fill=fill,outline=outline,width=width)
def load(rel):return Image.open(BASE/rel).convert('RGB')
def fit(im,box):
 x,y,w,h=box; return ImageOps.fit(im,(int(w),int(h)),method=Image.Resampling.LANCZOS,centering=(.5,.5))
def put(im,src,box,r=14):
 x,y,w,h=map(int,box); crop=fit(src,(x,y,w,h)); mask=Image.new('L',(w,h),0);ImageDraw.Draw(mask).rounded_rectangle((0,0,w,h),r,fill=255);im.paste(crop,(x,y),mask)
def txt(d,xy,s,font=FS,fill=TEXT):d.text(xy,s,font=font,fill=fill)
def arrow(d,a,b,color=CYAN,width=6):
 d.line([a,b],fill=color,width=width);ang=math.atan2(b[1]-a[1],b[0]-a[0]);L=20;p1=(b[0]-L*math.cos(ang-.5),b[1]-L*math.sin(ang-.5));p2=(b[0]-L*math.cos(ang+.5),b[1]-L*math.sin(ang+.5));d.polygon([b,p1,p2],fill=color)
def header(im,d,num,title,sub):
 txt(d,(54,34),f'{num}  {title}',FB,NAVY);txt(d,(56,88),sub,FS,MUTED);d.line((54,132,1860,132),fill=BORDER,width=2)
def chip(d,b,label,color=BLUE):
 rounded(d,b,r=13,fill=(245,250,255),outline=color,width=2);txt(d,(b[0]+14,b[1]+7),label,FC,color)
def card(d,b):
 rounded(d,(b[0]+5,b[1]+7,b[2]+5,b[3]+7),r=18,fill=SHADOW,outline=SHADOW,width=1);rounded(d,b,r=18,fill=PANEL,outline=BORDER,width=2)
def save(im,n):im.save(OUT/n,quality=95)

# 1
im=Image.new('RGB',(W,H),BG);d=ImageDraw.Draw(im);header(im,d,'01','事件线索核验与分级协作','小安页面风格：白色工作台、浅灰卡片、蓝绿色操作状态')
imgs=[load(r'第14页\\P14_01_左上用户线索上报.png'),load(r'第14页\\P14_02_左下人员研判列表.png'),load(r'第14页\\P14_03_右上全域预警画面.png')];boxes=[(54,185,520,350),(700,185,520,350),(1346,185,520,350)];labels=['① 线索进入','② 授权核验与归档','③ 跨夜市协作提醒'];cols=[BLUE,CYAN,AMBER]
for src,b,l,c in zip(imgs,boxes,labels,cols):card(d,(b[0]-8,b[1]-40,b[0]+b[2]+8,b[1]+b[3]+8));put(im,src,b);chip(d,(b[0],b[1]-36,b[0]+min(b[2]-10,330),b[1]-5),l,c)
arrow(d,(582,360),(690,360));arrow(d,(1228,360),(1334,360));card(d,(54,650,1866,980));
for x,t,c in [(100,'事件对象',BLUE),(520,'人工确认',GREEN),(940,'风险排序',AMBER),(1360,'任务留痕',CYAN)]:d.ellipse((x,735,x+56,791),fill=c);txt(d,(x+82,735),t,FM);txt(d,(x+82,780),'事件 / 地点 / 任务状态',FC,MUTED)
arrow(d,(395,763),(495,763),MUTED,4);arrow(d,(815,763),(915,763),MUTED,4);arrow(d,(1235,763),(1335,763),MUTED,4);save(im,'01_事件线索核验与分级协作.png')

# 2
im=Image.new('RGB',(W,H),BG);d=ImageDraw.Draw(im);header(im,d,'02','视频初筛与视觉复核','以小安真实页面为证据：检测结果是候选，最终由人工确认')
imgs=[load(r'第15页\\P15_01_左侧移动感知场景.png'),load(r'第15页\\P15_02_识姿察变配图.png'),load(r'第15页\\P15_03_去伪辨险配图.png'),load(r'第15页\\P15_04_闭环报送配图.png')];labels=['视频输入','YOLO 姿态 / 目标初筛','视觉语义复核','人工确认后报送'];xs=[54,510,966,1422]
for i,(src,x,l) in enumerate(zip(imgs,xs,labels)):
 b=(x,190,x+390,730);card(d,b);put(im,src,(x+18,245,354,450));chip(d,(x+18,205,x+340,238),l,[BLUE,CYAN,(130,91,220),GREEN][i]);txt(d,(x+20,760),['原始视频帧','关键点 / 检测框','事件语义与证据','事件卡片 / 审核状态'][i],FM)
 if i<3:arrow(d,(x+394,460),(xs[i+1]-12,460))
card(d,(54,865,1866,975));txt(d,(80,900),'输入',FM,BLUE);txt(d,(185,900),'视频帧',FS);txt(d,(420,900),'→',FM,CYAN);txt(d,(500,900),'初筛候选',FS);txt(d,(760,900),'→',FM,CYAN);txt(d,(840,900),'语义复核',FS);txt(d,(1100,900),'→',FM,CYAN);txt(d,(1180,900),'人工确认',FS);txt(d,(1460,900),'→',FM,CYAN);txt(d,(1540,900),'事件留痕',FS,GREEN);save(im,'02_视频初筛与视觉复核.png')

# 3
im=Image.new('RGB',(W,H),BG);d=ImageDraw.Draw(im);header(im,d,'03','识别结果与测试证据','真实检测画面 + 小安式测试证据卡，避免只放模型名称和大数字')
src=load(r'第16页\\P16_01_右侧人群分析截图.png');card(d,(54,178,1170,890));put(im,src,(74,198,1150,670));chip(d,(74,210,430,244),'真实画面 + 本地推理输出',GREEN);card(d,(1220,178,1866,890));txt(d,(1260,220),'测试证据卡',FM,NAVY)
rows=[('输入','夜市单帧 / 视频片段'),('模型输出','行人框、姿态、候选行为'),('人工标准','复核是否构成事件'),('错误分类','误报 / 漏报 / 待定'),('结论口径','阶段性测试，不外推')]
for i,(a,b) in enumerate(rows):y=300+i*92;d.line((1260,y-20,1815,y-20),fill=BORDER,width=2);txt(d,(1260,y),a,FC,MUTED);txt(d,(1450,y),b,FC,TEXT)
card(d,(54,930,1866,1000));txt(d,(80,950),'页面证明：系统能读入真实夜市画面并输出检测结果；指标必须绑定样本、条件与人工标注。',FC,AMBER);save(im,'03_识别结果与测试证据.png')

# 4
im=Image.new('RGB',(W,H),BG);d=ImageDraw.Draw(im);header(im,d,'04','一键报警与定位派单','同一事件在报警端、地图端和现场协同端保持一致')
imgs=[load(r'第17页\\P17_01_左下报警端.png'),load(r'第17页\\P17_02_中下定位派单图.png'),load(r'第17页\\P17_03_右下无人机现场.png')];boxes=[(54,185,500,520),(710,185,620,520),(1430,185,436,520)];labels=['报警端','指挥端：定位与派单','现场端：设备协同'];cols=[AMBER,CYAN,GREEN]
for src,b,l,c in zip(imgs,boxes,labels,cols):card(d,(b[0]-8,b[1]-40,b[0]+b[2]+8,b[1]+b[3]+8));put(im,src,b);chip(d,(b[0],b[1]-36,min(b[0]+b[2]-10,b[0]+330),b[1]-5),l,c)
arrow(d,(570,450),(694,450));arrow(d,(1340,450),(1412,450));card(d,(54,800,1866,980));
for x,t,sub,c in [(100,'T0 提交','报警内容 + 位置',AMBER),(560,'T1 接收','生成事件卡片',CYAN),(1000,'T2 派单','进入处置队列',BLUE),(1440,'T3 回执','状态与证据留痕',GREEN)]:d.ellipse((x,852,x+46,898),fill=c);txt(d,(x+68,838),t,FM);txt(d,(x+68,882),sub,FC,MUTED)
arrow(d,(390,875),(520,875),MUTED,4);arrow(d,(850,875),(960,875),MUTED,4);arrow(d,(1290,875),(1400,875),MUTED,4);save(im,'04_一键报警与定位派单.png')

# 5
im=Image.new('RGB',(W,H),BG);d=ImageDraw.Draw(im);header(im,d,'05','设备任务下发与现场回执','使用小安页面中的定位、移动端、真机和空地联动素材')
imgs=[load(r'第18页\\P18_01_左侧一键定位图.png'),load(r'第18页\\P18_02_中间AI风手机图.png'),load(r'第18页\\P18_04_中间真机实测图.png'),load(r'第18页\\P18_05_右侧空地联动场景.png')];labels=['目标点位','任务下发','真机联调','现场图传 / 留证'];xs=[54,500,946,1392]
for i,(src,x,l) in enumerate(zip(imgs,xs,labels)):
 b=(x,185,x+390,720);card(d,b);put(im,src,(x+18,242,354,420));chip(d,(x+18,205,x+320,238),l,[BLUE,AMBER,CYAN,GREEN][i]);txt(d,(x+20,748),['位置和区域','移动端任务','设备状态','现场反馈'][i],FM)
 if i<3:arrow(d,(x+394,440),(xs[i+1]-12,440))
card(d,(54,835,1866,975));txt(d,(80,870),'必须记录的时间点',FM,NAVY);xx=420
for t,c in [('创建',BLUE),('接收',CYAN),('起飞 / 执行',AMBER),('图传 / 留证',GREEN),('完成 / 失败',MUTED)]:chip(d,(xx,858,xx+190,910),t,c);xx+=260
save(im,'05_设备任务下发与现场回执.png')
print('\n'.join(str(p) for p in OUT.glob('*.png')))
