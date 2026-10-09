from pathlib import Path
import json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Rectangle

out = Path(r'D:\CICSIC\qwen_vl_finetune\paper_figure_set_cn_all_gradual_simulation.png')
state_path = Path(r'D:\CICSIC\qwen_vl_finetune\runs\action_qwen2_5_vl_3b_lora\checkpoint-31\trainer_state.json')
obs = np.array([x['loss'] for x in json.loads(state_path.read_text(encoding='utf-8'))['log_history'] if 'loss' in x], float)
steps = np.arange(1, 1001)
rng = np.random.default_rng(20260929)
# Keep the observed first 31 steps, then simulate a slower diminishing-return tail.
# The curve remains visibly in progress beyond step 200 and approaches a plateau late.
tail_steps = steps[31:]
tail_trend = 0.65 + (obs[-1] - 0.65) * np.exp(-(tail_steps - 31) / 250)
tail_noise = np.zeros(len(tail_steps), dtype=float)
for i in range(1, len(tail_steps)):
    frac = i / max(len(tail_steps) - 1, 1)
    sigma = 0.010 * (1 - 0.55 * frac)
    tail_noise[i] = 0.55 * tail_noise[i-1] + rng.normal(0, sigma)
train = np.concatenate([obs, tail_trend + tail_noise])
# Validation loss improves more slowly, then rises slightly near the end to show
# a modest overfitting risk rather than an unrealistically flat perfect plateau.
val_trend = 0.70 + 0.19 * np.exp(-steps / 230) + 0.018 / (1 + np.exp(-(steps - 780) / 45))
val_noise = rng.normal(0, .009, len(steps)) * (.75 + .25 * np.exp(-steps / 250))
val = val_trend + val_noise
labels = ['摔倒','打架','聚集','自杀']
counts = np.array([9330,24390,510,7770], int)
cm_counts = np.array([[7560,980,340,450],[1200,22900,190,100],[60,220,215,15],[260,320,60,7130]],float)
cm = cm_counts/cm_counts.sum(axis=1,keepdims=True)
metrics=np.array([[.83,.81,.82],[.94,.94,.94],[.27,.42,.33],[.88,.92,.90]])

plt.rcParams.update({'font.family':'Microsoft YaHei','font.size':9,'axes.titlesize':10.5,'axes.labelsize':9,'xtick.labelsize':8,'ytick.labelsize':8,'axes.linewidth':.75,'pdf.fonttype':42,'ps.fonttype':42})
fig, axs = plt.subplots(4,2, figsize=(14.5,18), dpi=500)
fig.patch.set_facecolor('white')
blue='#1f4e79'; blue2='#5b9bd5'; gray='#a5a5a5'; green='#70ad47'; red='#c00000'

# Distinguish the measured sample counts and initial loss log from illustrative values.
fig.text(.5,.985,'说明：类别样本数及前31步训练损失来自现有记录；后续曲线、评测、对比和案例为模拟示意。',ha='center',va='top',fontsize=9,color='#666666')

# (a) distribution
ax=axs[0,0]; y=np.arange(4); bars=ax.barh(y,counts,color=blue,height=.56); ax.set_yticks(y,labels); ax.invert_yaxis(); ax.set_xlabel('样本数量'); ax.set_title('(a) 数据集类别分布',loc='left',fontweight='bold'); ax.grid(axis='x',color='#ddd',lw=.5,alpha=.8); ax.grid(axis='y',visible=False)
for sp in ['top','right']: ax.spines[sp].set_visible(False)
for b,c in zip(bars,counts): ax.text(c+350,b.get_y()+b.get_height()/2,f'{c:,}',va='center',fontsize=8)
ax.set_xlim(0,counts.max()*1.17)

# (b) pipeline schematic
ax=axs[0,1]; ax.axis('off'); ax.set_title('(b) 模型训练与推理流程',loc='left',fontweight='bold')
boxes=[(0.03,.58,.19,.18,'监控图像\n输入'),(.285,.58,.20,.18,'Qwen2.5-VL\n视觉编码'),(.55,.58,.19,.18,'LoRA\n参数高效微调'),(.80,.58,.17,.18,'风险类别\n与目标框输出')]
for x,y0,w,h,t in boxes:
    ax.add_patch(FancyBboxPatch((x,y0),w,h,boxstyle='round,pad=.02,rounding_size=.02',facecolor='#eaf2f8',edgecolor=blue,lw=1.2))
    ax.text(x+w/2,y0+h/2,t,ha='center',va='center',fontsize=8.5)
for (x1,y1,w1,h1,_),(x2,y2,w2,h2,_) in zip(boxes[:-1],boxes[1:]):
    ax.add_patch(FancyArrowPatch((x1+w1+.01,y1+h1/2),(x2-.01,y2+h2/2),arrowstyle='-|>',mutation_scale=12,lw=1.1,color='#555'))
ax.text(.5,.27,'训练：图像–指令–JSON 标注',ha='center',va='center',fontsize=8.5,color='#555')
ax.text(.5,.17,'输出：risk 与 objects',ha='center',va='center',fontsize=8.5,color='#555')
ax.set_xlim(0,1); ax.set_ylim(0,1)

# (c) curves
ax=axs[1,0]; ax.plot(steps,train,color=blue,lw=1.25,label='训练损失'); ax.plot(steps,val,color='#c55a11',lw=1.15,label='验证损失'); ax.set_title('(c) 训练与验证损失',loc='left',fontweight='bold'); ax.set_xlabel('训练步'); ax.set_ylabel('损失'); ax.set_xlim(1,1000); ax.grid(axis='y',color='#ddd',lw=.5,alpha=.8); ax.grid(axis='x',visible=False); ax.legend(frameon=False,fontsize=7.5,loc='upper right')
for sp in ['top','right']: ax.spines[sp].set_visible(False)

# (d) confusion matrix
ax=axs[1,1]; ax.imshow(cm,cmap='Blues',vmin=0,vmax=1); ax.set_title('(d) 归一化混淆矩阵',loc='left',fontweight='bold'); ax.set_xlabel('预测类别'); ax.set_ylabel('真实类别'); ax.set_xticks(range(4),labels); ax.set_yticks(range(4),labels)
for i in range(4):
 for j in range(4):
    v=cm[i,j]; ax.text(j,i,f'{v:.2f}',ha='center',va='center',fontsize=7.5,color='white' if v>.55 else '#222')
for sp in ['top','right']: ax.spines[sp].set_visible(False)

# (e) metrics
ax=axs[2,0]; x=np.arange(4); w=.24; ax.bar(x-w,metrics[:,0],w,color=blue,label='精确率'); ax.bar(x,metrics[:,1],w,color=blue2,label='召回率'); ax.bar(x+w,metrics[:,2],w,color=gray,label='F1'); ax.set_title('(e) 类别级评价指标',loc='left',fontweight='bold'); ax.set_xticks(x,labels); ax.set_ylim(0,1.05); ax.set_ylabel('分数'); ax.grid(axis='y',color='#ddd',lw=.5,alpha=.8); ax.grid(axis='x',visible=False); ax.legend(frameon=False,fontsize=7.5,ncol=3,loc='upper right')
for sp in ['top','right']: ax.spines[sp].set_visible(False)

# (f) baseline comparison
ax=axs[2,1]; models=['基线1','基线2','本方法']; vals=np.array([.71,.78,.86]); ax.bar(models,vals,color=[gray,blue2,blue],width=.55); ax.set_title('(f) 基线模型对比',loc='left',fontweight='bold'); ax.set_ylabel('综合 F1'); ax.set_ylim(0,1); ax.grid(axis='y',color='#ddd',lw=.5,alpha=.8)
for sp in ['top','right']: ax.spines[sp].set_visible(False)
for i,v in enumerate(vals): ax.text(i,v+.025,f'{v:.2f}',ha='center',fontsize=8)

# (g) ablation
ax=axs[3,0]; ab=['去除视觉输入','去除 LoRA','完整配置']; av=np.array([.67,.74,.86]); ax.plot(ab,av,color=blue,lw=1.7,marker='o',markersize=4); ax.set_title('(g) 消融实验',loc='left',fontweight='bold'); ax.set_ylabel('综合 F1'); ax.set_ylim(.55,.95); ax.grid(axis='y',color='#ddd',lw=.5,alpha=.8); ax.tick_params(axis='x',rotation=18)
for sp in ['top','right']: ax.spines[sp].set_visible(False)
for i,v in enumerate(av): ax.text(i,v+.02,f'{v:.2f}',ha='center',fontsize=8)

# (h) qualitative cases
ax=axs[3,1]; ax.axis('off'); ax.set_title('(h) 定性结果示例',loc='left',fontweight='bold')
rows=[('样例 1','摔倒','摔倒',.91,True),('样例 2','打架','打架',.94,True),('样例 3','聚集','打架',.63,False),('样例 4','自杀','自杀',.89,True)]
ax.add_patch(Rectangle((.02,.82),.96,.10,facecolor='#eaf2f8',edgecolor='none'))
for x,t in zip([.10,.34,.57,.80],['样例','真实类别','预测类别','置信度']): ax.text(x,.87,t,ha='center',va='center',fontsize=8.5,fontweight='bold')
for i,(sid,true,pred,conf,ok) in enumerate(rows):
    yy=.70-i*.16
    ax.plot([.02,.98],[yy-.07,yy-.07],color='#ddd',lw=.6)
    ax.text(.10,yy,sid,ha='center',va='center',fontsize=8)
    ax.text(.34,yy,true,ha='center',va='center',fontsize=8)
    ax.text(.57,yy,pred,ha='center',va='center',fontsize=8,color=green if ok else red)
    ax.text(.80,yy,f'{conf:.2f}',ha='center',va='center',fontsize=8)
ax.set_xlim(0,1); ax.set_ylim(.08,1)

fig.subplots_adjust(left=.08,right=.97,bottom=.045,top=.965,wspace=.24,hspace=.42)
fig.savefig(out,dpi=600,facecolor='white',bbox_inches='tight',pad_inches=.08)
plt.close(fig); print(out)


