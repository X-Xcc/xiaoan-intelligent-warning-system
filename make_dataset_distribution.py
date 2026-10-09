from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

out = Path(r'D:\CICSIC\qwen_vl_finetune\dataset_class_distribution.png')
labels = ['fall', 'fight', 'gather', 'suicide']
counts = np.array([9330, 24390, 510, 7770], dtype=int)
total = counts.sum()
percent = counts / total * 100

plt.rcParams.update({
    'font.family': 'Arial',
    'font.size': 11,
    'axes.labelsize': 12,
    'xtick.labelsize': 10,
    'ytick.labelsize': 11,
    'axes.linewidth': 0.9,
    'pdf.fonttype': 42,
    'ps.fonttype': 42,
})
fig, ax = plt.subplots(figsize=(8.4, 4.8), dpi=600)
fig.patch.set_facecolor('white')
ax.set_facecolor('white')
y = np.arange(len(labels))
color = '#1f4e79'
bars = ax.barh(y, counts, color=color, height=0.58, edgecolor='none')
ax.set_yticks(y, labels)
ax.invert_yaxis()
ax.set_xlabel('Number of samples')
ax.set_xlim(0, counts.max() * 1.18)
ax.grid(axis='x', color='#d9d9d9', linewidth=0.65, alpha=0.7)
ax.grid(axis='y', visible=False)
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)
ax.tick_params(axis='both', which='major', length=4, width=0.8, color='#333333')
for bar, c, p in zip(bars, counts, percent):
    ax.text(c + counts.max() * 0.015, bar.get_y() + bar.get_height()/2,
            f'{c:,} ({p:.2f}%)', va='center', ha='left', fontsize=10, color='#222222')
ax.text(0.995, 1.035, f'Total = {total:,}', transform=ax.transAxes,
        ha='right', va='bottom', fontsize=10, color='#555555')
fig.subplots_adjust(left=0.18, right=0.98, bottom=0.16, top=0.88)
fig.savefig(out, dpi=600, facecolor='white', bbox_inches='tight', pad_inches=0.08)
plt.close(fig)
print(out)
print('total', total, 'percent', percent)
