from pathlib import Path
import json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

out = Path(r'D:\CICSIC\qwen_vl_finetune\synthetic_paper_figure_set_cn.png')
state_path = Path(r'D:\CICSIC\qwen_vl_finetune\runs\action_qwen2_5_vl_3b_lora\checkpoint-31\trainer_state.json')
obs = np.array([x['loss'] for x in json.loads(state_path.read_text(encoding='utf-8'))['log_history'] if 'loss' in x], float)
steps = np.arange(1, 1001)
trend = 0.6867 + 4.3585 / np.maximum(steps, 1) ** 1.1378
rng = np.random.default_rng(20260929)
noise = rng.normal(0, 0.018, len(steps)) * (0.7 + 0.3*np.exp(-steps/250))
sim = trend + noise
loss = np.concatenate([obs, sim[31:]])
labels = ['摔倒', '打架', '聚集', '自杀']
counts = np.array([9330, 24390, 510, 7770], int)
cm_counts = np.array([[7560, 980, 340, 450], [1200, 22900, 190, 100], [60, 220, 215, 15], [260, 320, 60, 7130]], float)
cm = cm_counts / cm_counts.sum(axis=1, keepdims=True)
metrics = np.array([[0.83,0.81,0.82],[0.94,0.94,0.94],[0.27,0.42,0.33],[0.88,0.92,0.90]])

plt.rcParams.update({'font.family':'Microsoft YaHei','font.size':9.5,'axes.titlesize':11,'axes.labelsize':10,'xtick.labelsize':8.5,'ytick.labelsize':8.5,'axes.linewidth':0.8,'pdf.fonttype':42,'ps.fonttype':42})
fig, axs = plt.subplots(2,2,figsize=(11.2,7.8),dpi=600)
fig.patch.set_facecolor('white'); blue='#1f4e79'

ax=axs[0,0]; y=np.arange(4); bars=ax.barh(y,counts,color=blue,height=.58); ax.set_yticks(y,labels); ax.invert_yaxis(); ax.set_xlabel('样本数量'); ax.set_title('(a) 数据集类别分布',loc='left',fontweight='bold'); ax.grid(axis='x',color='#d9d9d9',lw=.55,alpha=.7); ax.grid(axis='y',visible=False)
for sp in ['top','right']: ax.spines[sp].set_visible(False)
for b,c in zip(bars,counts): ax.text(c+400,b.get_y()+b.get_height()/2,f'{c:,}',va='center',fontsize=8.5)
ax.set_xlim(0,counts.max()*1.16)

ax=axs[0,1]; ax.plot(steps,loss,color=blue,lw=1.35,solid_capstyle='round'); ax.set_title('(b) 训练损失曲线',loc='left',fontweight='bold'); ax.set_xlabel('训练步'); ax.set_ylabel('损失'); ax.set_xlim(1,1000); ax.grid(axis='y',color='#d9d9d9',lw=.55,alpha=.7); ax.grid(axis='x',visible=False)
for sp in ['top','right']: ax.spines[sp].set_visible(False)
ax.text(.02,.04,'第1–31步真实；第32–1000步合成',transform=ax.transAxes,fontsize=7.5,color='#555')

ax=axs[1,0]; ax.imshow(cm,cmap='Blues',vmin=0,vmax=1); ax.set_title('(c) 合成归一化混淆矩阵',loc='left',fontweight='bold'); ax.set_xlabel('预测类别'); ax.set_ylabel('真实类别'); ax.set_xticks(range(4),labels); ax.set_yticks(range(4),labels)
for i in range(4):
 for j in range(4):
  val=cm[i,j]; ax.text(j,i,f'{val:.2f}',ha='center',va='center',fontsize=8,color='white' if val>.55 else '#1f1f1f')
for sp in ['top','right']: ax.spines[sp].set_visible(False)

ax=axs[1,1]; x=np.arange(4); w=.24; ax.bar(x-w,metrics[:,0],width=w,color=blue,label='精确率'); ax.bar(x,metrics[:,1],width=w,color='#5b9bd5',label='召回率'); ax.bar(x+w,metrics[:,2],width=w,color='#a5a5a5',label='F1'); ax.set_title('(d) 合成类别级指标',loc='left',fontweight='bold'); ax.set_xticks(x,labels); ax.set_ylim(0,1.05); ax.set_ylabel('分数'); ax.grid(axis='y',color='#d9d9d9',lw=.55,alpha=.7); ax.grid(axis='x',visible=False)
for sp in ['top','right']: ax.spines[sp].set_visible(False)
ax.legend(frameon=False,fontsize=8,ncol=3,loc='upper right')
fig.text(.5,.015,'合成示意指标；正式论文前请替换为实测评估结果。',ha='center',va='bottom',fontsize=8.5,color='#666')
fig.subplots_adjust(left=.08,right=.98,bottom=.09,top=.96,wspace=.28,hspace=.32)
fig.savefig(out,dpi=600,facecolor='white',bbox_inches='tight',pad_inches=.08); plt.close(fig); print(out)
