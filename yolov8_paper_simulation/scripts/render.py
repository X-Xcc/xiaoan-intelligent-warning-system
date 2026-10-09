"""中文论文图：黑白排版、细坐标轴、明确模拟性质。"""
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.python_deps'))
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
from matplotlib.ticker import PercentFormatter, MultipleLocator
from matplotlib.backends.backend_pdf import PdfPages
from PIL import Image
import seaborn as sns

CLASSES = ['跌倒', '打架', '聚集', '自杀']
COLORS = ['0.08', '0.42', '0.65', '0.22']
LINES = ['-', '--', '-.', ':']
MARKERS = ['o', 's', '^', 'D']
SHORT_NAMES = ['原始 YOLOv8n（估计）', '训练后 YOLOv8', '+ 原始 Qwen', '+ 训练后 Qwen']
ZH_OUTPUT = ROOT / '中文图片'
FILENAMES = {
    '01_multipanel_paper': '01_论文五面板总图',
    '02_training_convergence': '02_训练收敛曲线',
    '03_precision_recall': '03_精准度与召回率曲线',
    '04_confusion_matrices': '04_混淆矩阵对比',
    '05_model_forest': '05_四组模型精准度森林图',
    '06_monte_carlo_ecdf': '06_一千次模拟分布',
    '07_training_gain': '07_训练前后提升对比',
    'S1_observed_convergence': '补图1_真实训练收敛记录',
    'S2_observed_PR_originals': '补图2_真实原始曲线中文标注',
    'S3_observed_confusion': '补图3_真实混淆矩阵',
    'S4_assumption_sensitivity': '补图4_模拟假设敏感性',
    'table_01_parameters': '表1_模拟参数及依据',
    'table_02_simulation_summary': '表2_一千次模拟汇总',
    'table_03_retention_tradeoff': '表3_目标保留率与召回率',
    'training_convergence': '02_训练收敛曲线',
    'precision_recall': '03_精准度与召回率曲线',
    'confusion_matrices': '04_混淆矩阵对比',
    'model_forest': '05_四组模型精准度森林图',
    'monte_carlo_ecdf': '06_一千次模拟分布',
    'training_gain': '07_训练前后提升对比',
}
EXPORT_AUDIT = []


def style(size=9):
    sns.set_theme(style='ticks', context='paper')
    plt.rcParams.update({'font.family': 'serif', 'font.serif': ['SimSun', 'Times New Roman', 'DejaVu Serif'],
                         'axes.unicode_minus': False,
                         'mathtext.fontset': 'stix', 'font.size': size, 'axes.labelsize': size,
                         'axes.titlesize': size, 'legend.fontsize': size - .8,
                         'xtick.labelsize': size - .5, 'ytick.labelsize': size - .5,
                         'axes.linewidth': .6, 'xtick.major.width': .6, 'ytick.major.width': .6,
                         'xtick.major.size': 3, 'ytick.major.size': 3,
                         'figure.facecolor': 'white', 'axes.facecolor': 'white',
                         'text.color': 'black', 'axes.edgecolor': 'black',
                         'axes.labelcolor': 'black', 'xtick.color': 'black', 'ytick.color': 'black',
                         'savefig.facecolor': 'white', 'savefig.dpi': 300,
                         'pdf.fonttype': 42, 'ps.fonttype': 42, 'svg.fonttype': 'none',
                         'legend.frameon': False, 'axes.grid': False})


def clean(ax):
    sns.despine(ax=ax, top=True, right=True)
    ax.tick_params(direction='out', pad=2)


def export(fig, name, directory='figures'):
    group = '演示大字版' if directory == 'figures/ppt' else '三线表' if directory == 'tables' else '论文图'
    folder = ZH_OUTPUT / group
    folder.mkdir(parents=True, exist_ok=True)
    fig.canvas.draw()
    from matplotlib.text import Text
    texts = [t.get_text() for t in fig.findobj(Text) if t.get_visible() and t.get_text()]
    renderer = fig.canvas.get_renderer()
    clipped = []
    for t in fig.findobj(Text):
        if not t.get_visible() or not t.get_text() or not any('\u4e00' <= ch <= '\u9fff' for ch in t.get_text()):
            continue
        box = t.get_window_extent(renderer)
        if box.x0 < 0 or box.y0 < 0 or box.x1 > fig.bbox.width or box.y1 > fig.bbox.height:
            clipped.append(t.get_text())
    EXPORT_AUDIT.append({'image': str((folder / (FILENAMES[name] + '.png')).relative_to(ROOT)),
                         'texts': texts, 'clipped_chinese_text': clipped})
    fig.savefig(folder / f'{FILENAMES[name]}.png', dpi=300, facecolor='white')


def heading(fig, title, note):
    fig.text(.08, .96, title, fontsize=11, va='top')
    fig.text(.08, .915, note, fontsize=8, va='top', color='0.25')


def convergence_axes(axes, compact=False):
    df = pd.read_csv(ROOT / 'data' / 'synthetic_training_1000epochs.csv')
    best = pd.read_csv(ROOT / 'data' / 'synthetic_best_epochs.csv')
    for ax, metric, ylabel in zip(axes, ['map50', 'map50_95'], ['mAP@0.5', 'mAP@0.5:0.95']):
        for i, sid in enumerate(['S1', 'S2', 'S3']):
            sub = df[(df.scenario == sid) & (df.metric == metric)]
            b = best[(best.scenario == sid) & (best.metric == metric)].iloc[0]
            sns.lineplot(data=sub, x='epoch', y='value', ax=ax, color=COLORS[i],
                         linestyle=LINES[i], linewidth=.65 if compact else .85, errorbar=None,
                         label=f'{sid}：最佳 {b.best_value:.3f}（第{int(b.best_epoch)}轮）')
            ax.plot(b.best_epoch, b.best_value, MARKERS[i], color=COLORS[i], markersize=3.5,
                    markerfacecolor='white', markeredgewidth=.65)
        ax.set(xlim=(0, 1000), ylim=(.30, .79) if metric == 'map50' else (.25, .65),
               xlabel='训练轮次（模拟）', ylabel=ylabel)
        ax.xaxis.set_major_locator(MultipleLocator(250))
        ax.legend(loc='lower right', handlelength=2.4, borderaxespad=.4,
                  fontsize=6.2 if compact else 7.5)
        inset = ax.inset_axes([.14, .34, .36, .32])
        for i, sid in enumerate(['S1', 'S2', 'S3']):
            sub = df[(df.scenario == sid) & (df.metric == metric) & (df.epoch <= 35)]
            inset.plot(sub.epoch, sub.value, color=COLORS[i], linestyle=LINES[i], linewidth=.65)
        inset.set(xlim=(1, 35), ylim=(.50, .76) if metric == 'map50' else (.30, .60))
        inset.set_title('第1–35轮', fontsize=5.8 if compact else 7, pad=2)
        inset.tick_params(labelsize=5.4 if compact else 6.5, length=2, pad=1)
        inset.xaxis.set_major_locator(MultipleLocator(15))
        clean(inset)
        clean(ax)


def pr_axes(axes, compact=False):
    df = pd.read_csv(ROOT / 'data' / 'synthetic_pr_curves.csv')
    metrics = pd.read_csv(ROOT / 'data' / 'synthetic_detection_metrics.csv')
    for ax, stage, name in zip(axes, ['initial', 'final'], ['初次训练参照', '最终模型参照']):
        for i, (source_cls, display_cls) in enumerate(zip(['fall', 'fight', 'gather', 'suicide'], CLASSES)):
            sub = df[(df.stage == stage) & (df.class_name == source_cls)]
            ap = metrics[(metrics.stage == stage) & (metrics.class_name == source_cls)].ap50.iloc[0]
            ax.step(sub.recall, sub.precision, where='post', color=COLORS[i], linestyle=LINES[i],
                    linewidth=.85, label=f'{display_cls}：{ap:.3f}')
        mean = df[df.stage == stage].groupby('recall', as_index=False).precision.mean()
        ap = metrics[(metrics.stage == stage) & (metrics.class_name == 'macro')].ap50.iloc[0]
        ax.step(mean.recall, mean.precision, where='post', color='black', linewidth=1.5,
                label=f'四类平均 AP：{ap:.3f}')
        ax.set(xlim=(0, 1.01), ylim=(-.02, 1.025), xlabel='召回率', ylabel='精准度', title=name)
        ax.xaxis.set_major_locator(MultipleLocator(.25))
        ax.yaxis.set_major_locator(MultipleLocator(.25))
        ax.legend(loc='lower left', fontsize=6.3 if compact else 8,
                  handlelength=2.8, borderaxespad=.5)
        clean(ax)


def matrix_axes(axes, fig, compact=False, source=False):
    if source:
        mats = json.loads((ROOT / 'provenance' / 'manual_transcription.json').read_text(encoding='utf-8'))['matrices']
        records = [dict(matrix=mats['action']), dict(matrix=mats['action_final_300'])]
    else:
        records = json.loads((ROOT / 'data' / 'synthetic_confusion_matrices.json').read_text(encoding='utf-8'))
    vmax = max(np.array(r['matrix']).max() for r in records)
    for ax, record, title in zip(axes, records, ['初次训练参照', '最终模型参照']):
        m = np.array(record['matrix'], dtype=float)
        mask = np.zeros_like(m, dtype=bool)
        mask[4, 4] = True
        labels = np.array([[str(int(v)) for v in row] for row in m], dtype=object)
        labels[4, 4] = ''
        sns.heatmap(m, mask=mask, annot=labels, fmt='', cmap='Greys', vmin=0, vmax=vmax,
                    cbar=False, square=True, ax=ax, linewidths=.35, linecolor='white',
                    annot_kws={'fontsize': 6.5 if compact else 9},
                    xticklabels=CLASSES + ['背景'], yticklabels=CLASSES + ['背景'])
        ax.text(4.5, 4.5, '—', ha='center', va='center', fontsize=9)
        ax.set(xlabel='真实类别', ylabel='预测类别', title=title)
        ax.tick_params(axis='x', labelrotation=35, length=0)
        plt.setp(ax.get_xticklabels(), ha='right', rotation_mode='anchor')
        ax.tick_params(axis='y', labelrotation=0, length=0)
        ax.tick_params(labelsize=6 if compact else 8)
        tp, fp, fn = int(np.trace(m[:4, :4])), int(m[:4, 4].sum()), int(m[4, :4].sum())
        if not compact:
            ax.text(.5, -.32, f'TP={tp}；FP={fp}；FN={fn}\n精准度={tp/(tp+fp):.2%}',
                    transform=ax.transAxes, ha='center', va='top', fontsize=8)


def forest(ax, compact=False):
    summary = pd.read_csv(ROOT / 'data' / 'monte_carlo_1000_summary.csv')
    for i, row in enumerate(summary.itertuples()):
        ax.errorbar(row.median_pct, i, xerr=[[row.median_pct - row.p2_5_pct], [row.p97_5_pct - row.median_pct]],
                    fmt=MARKERS[i], color=COLORS[i], markerfacecolor='white' if i in [0, 2] else COLORS[i],
                    markersize=4 if compact else 6, elinewidth=.85, capsize=2.5)
    # Observed precision and simulated posterior summaries have different markers.
    ax.plot(78 / 82 * 100, 1, '|', markersize=10, color='black', markeredgewidth=1.2)
    ax.set_yticks(range(4), SHORT_NAMES)
    ax.set(xlim=(52, 101), ylim=(3.6, -.6), xlabel='精准度（%）')
    ax.xaxis.set_major_locator(MultipleLocator(10))
    ax.tick_params(axis='y', length=0)
    if not compact:
        for i, row in enumerate(summary.itertuples()):
            ax.text(101.5, i, f'{row.median_pct:.2f} [{row.p2_5_pct:.2f}, {row.p97_5_pct:.2f}]',
                    va='center', fontsize=8, clip_on=False)
        ax.text(101.5, -.65, '中位数 [95%不确定性区间]', va='bottom', fontsize=8, clip_on=False)
    ax.text(.02, .98, '中位数及第2.5–97.5百分位', transform=ax.transAxes, ha='left', va='top',
            fontsize=6.3 if compact else 8)
    clean(ax)


def ecdf(ax, compact=False):
    raw = pd.read_csv(ROOT / 'data' / 'monte_carlo_1000_raw.csv')
    for i, (mid, label) in enumerate(zip(['baseline', 'trained_yolo', 'original_qwen', 'trained_qwen'],
                                        ['原始基线', '训练后YOLOv8', '+原始Qwen', '+训练后Qwen'])):
        sns.ecdfplot(x=raw[f'precision_{mid}'] * 100, ax=ax, color=COLORS[i],
                     linestyle=LINES[i], linewidth=1, label=label)
    ax.set(xlim=(45, 100), ylim=(0, 1.02), xlabel='精准度（%）', ylabel='累积概率')
    ax.legend(loc='upper left', fontsize=6 if compact else 8, handlelength=2.2)
    clean(ax)


def single_figures():
    style(9)
    fig, axes = plt.subplots(1, 2, figsize=(7.2, 3.5))
    fig.subplots_adjust(left=.085, right=.98, bottom=.18, top=.78, wspace=.3)
    heading(fig, '模型训练收敛曲线', '模拟实验｜1000个训练轮次｜依据历史逐轮记录校准的单条轨迹')
    convergence_axes(axes)
    fig.text(.085, .035, 'S1：初次训练参照；S2：追加训练参照；S3：最终模型参照。全部为模拟轨迹。', fontsize=7.5)
    export(fig, '02_training_convergence')
    plt.close(fig)
    fig, axes = plt.subplots(1, 2, figsize=(7.2, 4.0))
    fig.subplots_adjust(left=.08, right=.98, bottom=.20, top=.77, wspace=.3)
    heading(fig, '精准度与召回率曲线对比', '模拟实验｜4200个单目标场景｜模拟交并比≥0.5｜101点插值计算平均精度')
    pr_axes(axes)
    fig.text(.08, .045, '依据源数据校准分数排序；保留聚集类AP=0。曲线与混淆矩阵使用同一批模拟预测。', fontsize=7.4)
    export(fig, '03_precision_recall')
    plt.close(fig)
    fig, axes = plt.subplots(1, 2, figsize=(7.2, 4.5))
    fig.subplots_adjust(left=.12, right=.98, bottom=.29, top=.75, wspace=.48)
    heading(fig, '混淆矩阵对比', '模拟实验｜置信度阈值=0.50｜模拟交并比阈值=0.50｜统一灰度范围')
    matrix_axes(axes, fig)
    fig.text(.08, .025, '注：计数为模拟值，不增加真实证据量。背景与背景交叉格不适用；未推断真负例。', fontsize=7.3)
    export(fig, '04_confusion_matrices')
    plt.close(fig)
    fig, ax = plt.subplots(figsize=(7.2, 3.8))
    fig.subplots_adjust(left=.25, right=.73, bottom=.22, top=.78)
    heading(fig, '四组模型精准度比较', '模拟实验｜1000次蒙特卡洛抽样｜95%模拟不确定性区间')
    forest(ax)
    fig.text(.08, .07, '竖线：训练后模型的真实校准精准度，78/82=95.12%。Qwen过滤率为假设参数。', fontsize=7.5)
    fig.text(.08, .025, '原始基线采用先验估计；区间来自模拟传播，不代表4200个真实场景的实验置信区间。', fontsize=7.5)
    export(fig, '05_model_forest')
    plt.close(fig)
    fig, ax = plt.subplots(figsize=(7.2, 3.8))
    fig.subplots_adjust(left=.1, right=.97, bottom=.20, top=.78)
    heading(fig, '模拟精准度的累积分布', '模拟实验｜1000次蒙特卡洛抽样｜经验累积分布曲线')
    ecdf(ax)
    fig.text(.1, .045, '分布宽度反映设定的不确定性；1000次抽样不代表1000次真实模型训练。', fontsize=7.5)
    export(fig, '06_monte_carlo_ecdf')
    plt.close(fig)


def multipanel():
    style(7.5)
    fig = plt.figure(figsize=(7.2, 10.2))
    grid = fig.add_gridspec(4, 2, left=.105, right=.98, bottom=.115, top=.96,
                           height_ratios=[1, 1, 1.12, 1], hspace=.66, wspace=.38)
    axes_a = [fig.add_subplot(grid[0, i]) for i in range(2)]
    convergence_axes(axes_a, True)
    axes_b = [fig.add_subplot(grid[1, i]) for i in range(2)]
    pr_axes(axes_b, True)
    axes_c = [fig.add_subplot(grid[2, i]) for i in range(2)]
    matrix_axes(axes_c, fig, True)
    # Nested bottom layout leaves room for model row labels without squeezing ECDF.
    ax_d = fig.add_subplot(grid[3, 0])
    forest(ax_d, True)
    ax_d.tick_params(axis='y', labelsize=6.4)
    ax_d.set_yticklabels(['原始基线*', '训练后模型', '+原始Qwen', '+训练后Qwen'])
    ax_e = fig.add_subplot(grid[3, 1])
    ecdf(ax_e, True)
    for ax, label, title, dy in [(axes_a[0], '(a)', '模拟训练收敛曲线', .025),
                                  (axes_b[0], '(b)', '模拟精准度与召回率曲线', .035),
                                  (axes_c[0], '(c)', '模拟混淆矩阵', .034),
                                  (ax_d, '(d)', '精准度及不确定性区间', .025),
                                  (ax_e, '(e)', '1000次蒙特卡洛模拟', .025)]:
        pos = ax.get_position()
        fig.text(.105 if label != '(e)' else pos.x0, pos.y1 + dy,
                 f'{label}  {title}', fontsize=8, ha='left', va='bottom')
    fig.text(.075, .061,
             '模拟实验。设定42000张图像；未执行真实训练或生成图像。\n'
             '(a) 1000轮指标模拟；(b,c) 使用同一批模拟预测，包含4200个场景。\n'
             '(d,e) 以真实检出78例、误报4例及过滤假设校准；区间为第2.5–97.5百分位。\n'
             '*原始基线为估计值；(d)竖线表示真实校准值95.12%。未推断真负例。',
             fontsize=7, ha='left', va='top', linespacing=1.4)
    export(fig, '01_multipanel_paper')
    plt.close(fig)


def three_line_table(name, title, headers, rows, widths, note, height=2.9):
    style(9)
    fig, ax = plt.subplots(figsize=(7.2, height))
    ax.set_axis_off()
    fig.text(.055, .94, title, ha='left', va='top', fontsize=10)
    table = ax.table(cellText=rows, colLabels=headers, colWidths=widths,
                     loc='upper center', cellLoc='center', bbox=[0, .16, 1, .64])
    table.auto_set_font_size(False)
    table.set_fontsize(8)
    for (r, c), cell in table.get_celld().items():
        cell.set_facecolor('white')
        cell.set_edgecolor('black')
        cell.visible_edges = ''
        cell.PAD = .07
        if c == 0:
            cell.get_text().set_ha('left')
        if r == 0:
            cell.visible_edges = 'TB'
            cell.set_linewidth(.7)
        elif r == len(rows):
            cell.visible_edges = 'B'
            cell.set_linewidth(.7)
    fig.subplots_adjust(left=.055, right=.97, bottom=.13, top=.90)
    fig.text(.055, .09, note, fontsize=7.3, va='top', linespacing=1.35)
    export(fig, name, 'tables')
    plt.close(fig)


def tables():
    summary = pd.read_csv(ROOT / 'data' / 'monte_carlo_1000_summary.csv')
    rows = [[SHORT_NAMES[i]] + [f'{getattr(r, c):.2f}' for c in ['mean_pct', 'median_pct', 'std_pct', 'p2_5_pct', 'p97_5_pct']]
            for i, r in enumerate(summary.itertuples())]
    three_line_table('table_02_simulation_summary', '表2  1000次蒙特卡洛模拟精准度汇总（%）',
                     ['模型场景', '均值', '中位数', '标准差', '2.5百分位', '97.5百分位'], rows,
                     [.34, .12, .12, .12, .15, .15],
                     '注：全部数值为模拟结果；两端百分位构成95%模拟不确定性区间，不代表实测置信区间。\n'
                     '基线：贝塔分布(30,10)；训练后模型：贝塔分布(79,5)；Qwen过滤率及目标保留率为假设。')
    rows = [['场景图像数 / 训练轮次', '42000 / 1000', '场景假设；未执行真实训练'],
            ['训练 / 验证 / 测试划分', '33600 / 4200 / 4200', '假设按80% / 10% / 10%划分'],
            ['训练后模型精准度', '贝塔分布(79,5)', '均匀先验＋检出78例 / 误报4例'],
            ['原始基线精准度', '贝塔分布(30,10)', '假设均值0.75；先验浓度40'],
            ['原始Qwen：过滤 / 保留', '0.50±0.10 / 0.95±0.02', '假设均值±标准差'],
            ['训练后Qwen：过滤 / 保留', '0.75±0.08 / 0.97±0.015', '假设均值±标准差'],
            ['模拟次数 / 随机种子', '1000 / 20260928', '训练后各方案共享模型概率抽样']]
    three_line_table('table_01_parameters', '表1  模拟参数设置及校准依据',
                     ['参数', '数值或概率分布', '依据性质'], rows, [.32, .31, .37],
                     '过滤：误报过滤比例；保留：真实目标保留比例。贝塔分布按给定均值与标准差匹配。\n'
                     '模拟样本扩增不增加真实证据量；精准度的校准依据仍为82个真实预测。', height=4.0)
    ret = pd.read_csv(ROOT / 'data' / 'qwen_retention_summary.csv')
    rows = []
    for r in ret.itertuples():
        rows.append(['原始 Qwen' if r.model == 'original_qwen' else '训练后 Qwen',
                     '真实目标保留率' if r.metric == 'true_target_retention' else '条件召回率',
                     f'{r.median:.2f}', f'[{r.p2_5:.2f}, {r.p97_5:.2f}]'])
    three_line_table('table_03_retention_tradeoff', '表3  真实目标保留率及相应召回率（%）',
                     ['过滤方案', '统计指标', '中位数', '95%不确定性区间'], rows, [.25, .30, .15, .30],
                     '条件召回率=(78/81)×目标保留率，固定历史召回率；未传播原始召回率自身的不确定性。\n'
                     '过滤可能丢弃部分真实目标；精准度升高本身不等于检测能力全面提升。')


def observed_supplements():
    style(9)
    fig, axes = plt.subplots(1, 2, figsize=(7.2, 3.6))
    fig.subplots_adjust(left=.09, right=.98, top=.77, bottom=.21, wspace=.31)
    heading(fig, '补图1  真实训练收敛记录', '真实来源｜首次训练记录100轮；追加训练记录71轮｜最终模型逐轮记录缺失')
    for ax, col, label in zip(axes, ['metrics/mAP50(B)', 'metrics/mAP50-95(B)'], ['mAP@0.5', 'mAP@0.5:0.95']):
        for i, run in enumerate(['action', 'action300']):
            df = pd.read_csv(ROOT / 'provenance' / run / 'results.csv')
            sns.lineplot(data=df, x='epoch', y=col, ax=ax, color=COLORS[i], linestyle=LINES[i],
                         linewidth=1, label=['首次训练', '追加训练'][i], errorbar=None)
        ax.set(xlabel='训练轮次（真实记录）', ylabel=label, xlim=(0, 100))
        clean(ax)
    fig.text(.09, .045, '末轮数值的差异不等于最佳轮次指标的提升。原始数据已保存副本及完整性校验。', fontsize=7.2)
    export(fig, 'S1_observed_convergence')
    plt.close(fig)
    fig, axes = plt.subplots(1, 2, figsize=(7.2, 4.7))
    transcription = json.loads((ROOT / 'provenance' / 'manual_transcription.json').read_text(encoding='utf-8'))
    for i, (ax, run) in enumerate(zip(axes, ['action', 'action_final_300'])):
        original = Image.open(ROOT / 'provenance' / run / 'BoxPR_curve.png').convert('RGB')
        # Keep original curve pixels and plot borders; replace only text outside the data rectangle.
        assert original.size == (2250, 1500)
        plot_pixels = original.crop((167, 95, 1519, 1351))
        ax.imshow(plot_pixels, extent=(0, 1, 0, 1), aspect='auto', interpolation='none', zorder=1)
        ax.set(xlim=(0, 1), ylim=(0, 1), xlabel='召回率', ylabel='精准度',
               title=['首次训练', '最终模型'][i])
        ax.xaxis.set_major_locator(MultipleLocator(.25))
        ax.yaxis.set_major_locator(MultipleLocator(.25))
        ap = transcription['source_pr_rounded_ap50'][run]
        colors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#0000ff']
        labels = [f'{cls}：{value:.3f}' for cls, value in zip(CLASSES, ap)]
        labels.append(f'四类平均：{[.723, .720][i]:.3f}')
        handles = [Line2D([0], [0], color=color, linewidth=1 if j < 4 else 2)
                   for j, color in enumerate(colors)]
        ax.legend(handles, labels, loc='upper center', bbox_to_anchor=(.5, -.23),
                  ncol=2, fontsize=7.2, handlelength=2.2, columnspacing=1.1)
    fig.subplots_adjust(left=.09, right=.98, top=.77, bottom=.36, wspace=.28)
    heading(fig, '补图2  原始精准度与召回率曲线（中文标注）', '真实来源图片｜保留原始曲线像素及类别配色｜仅替换图外文字与图例')
    fig.text(.08, .045, '图例数值沿用原图的AP@0.5；这些真实记录用于校准，不是1000轮模拟训练结果。', fontsize=7.6)
    export(fig, 'S2_observed_PR_originals')
    plt.close(fig)
    fig, axes = plt.subplots(1, 2, figsize=(7.2, 4.5))
    fig.subplots_adjust(left=.12, right=.98, bottom=.29, top=.75, wspace=.48)
    heading(fig, '补图3  真实混淆矩阵对比', '真实来源计数｜依据原图逐格核对并转录｜统一灰度范围')
    matrix_axes(axes, fig, source=True)
    axes[0].set_title('首次训练')
    axes[1].set_title('最终模型')
    fig.text(.08, .025, '源图片未提供明确的操作阈值。背景与背景交叉格不适用，不能解释为真负例计数。', fontsize=7.4)
    export(fig, 'S3_observed_confusion')
    plt.close(fig)


def sensitivity_plot():
    style(9)
    df = pd.read_csv(ROOT / 'data' / 'sensitivity_summary.csv')
    fig, axes = plt.subplots(1, 2, figsize=(7.2, 3.7))
    fig.subplots_adjust(left=.16, right=.98, bottom=.22, top=.76, wspace=.5)
    heading(fig, '补图4  模拟假设的敏感性分析', '模拟实验｜每种情景抽样1000次｜不同假设采用共同随机数比较')
    base = df[df.model == 'baseline']
    for i, r in enumerate(base.itertuples()):
        axes[0].errorbar(r.median, i, xerr=[[r.median-r.p2_5], [r.p97_5-r.median]],
                         fmt='o', color='black', capsize=3)
    axes[0].set(yticks=range(3), yticklabels=['先验浓度20', '先验浓度40', '先验浓度80'], xlabel='原始基线精准度（%）',
                xlim=(45, 100), ylim=(2.7, -.7))
    for j, mid in enumerate(['original_qwen', 'trained_qwen']):
        sub = df[df.model == mid]
        for i, r in enumerate(sub.itertuples()):
            axes[1].errorbar(r.median, i + (j-.5)*.22,
                             xerr=[[r.median-r.p2_5], [r.p97_5-r.median]], fmt=['o','s'][j],
                             color=['0.6','0.05'][j], capsize=2, markersize=4)
    axes[1].set(yticks=range(3), yticklabels=['保守情景', '中心情景', '乐观情景'],
                xlabel='过滤后精准度（%）', xlim=(88,100.2), ylim=(2.7,-.7))
    for ax in axes:
        clean(ax)
    fig.text(.08, .04, '先验浓度不是实测样本量。灰色圆点：原始Qwen；黑色方点：训练后Qwen。', fontsize=7.2)
    export(fig, 'S4_assumption_sensitivity')
    plt.close(fig)


def training_gain(ppt=False):
    style(13 if ppt else 9)
    summary = pd.read_csv(ROOT / 'data' / 'monte_carlo_1000_summary.csv')
    contrasts = pd.read_csv(ROOT / 'data' / 'training_gain_summary.csv')
    fig, axes = plt.subplots(1, 2, figsize=(12.8, 7.2) if ppt else (7.2, 4.5),
                             gridspec_kw={'width_ratios': [1, 1.15]})
    fig.subplots_adjust(left=.09, right=.96, bottom=.28, top=.72, wspace=.65)
    a, b = summary.iloc[0], summary.iloc[1]
    values = [a.median_pct, b.median_pct]
    axes[0].plot([0,1], values, color='black', linewidth=1)
    for x, r, marker in [(0,a,'o'), (1,b,'s')]:
        axes[0].errorbar(x, r.median_pct, yerr=[[r.median_pct-r.p2_5_pct], [r.p97_5_pct-r.median_pct]],
                         fmt=marker, markerfacecolor='white' if x==0 else 'black', color='black',
                         markersize=6, capsize=3, linewidth=.85)
        axes[0].text(x, r.p2_5_pct-6, f'{r.median_pct:.2f}%', ha='center', va='top', fontsize=11 if ppt else 9)
    axes[0].set(xlim=(-.4,1.4), ylim=(0,104), xticks=[0,1],
                xticklabels=['原始基线\n（估计）', '训练后YOLOv8\n（真实数据校准）'], ylabel='精准度（%）',
                title='(a) 原始基线与训练后模型')
    diff = b.median_pct-a.median_pct
    axes[0].text(.5, .19, f'精准度中位数之差\n提高{diff:.2f}个百分点',
                 ha='center', transform=axes[0].transAxes, fontsize=11 if ppt else 8.5)
    for i, r in enumerate(contrasts.itertuples()):
        axes[1].errorbar(r.delta_median_pp, i,
                         xerr=[[r.delta_median_pp-r.delta_p2_5_pp], [r.delta_p97_5_pp-r.delta_median_pp]],
                         fmt=MARKERS[i+1], color=COLORS[i+1], markersize=5, capsize=3)
    axes[1].axvline(0, color='0.4', linewidth=.6, linestyle='--')
    axes[1].set(yticks=range(3), yticklabels=['训练后\nYOLOv8', '+ 原始\nQwen', '+ 训练后\nQwen'],
                xlabel='相对原始基线的精准度差\n（百分点）', xlim=(-2,48), ylim=(2.7,-.7),
                title='(b) 模拟差值及不确定性区间')
    axes[1].tick_params(axis='y', length=0)
    for ax in axes:
        clean(ax)
    fig.text(.07, .945, '模型训练前后精准度提升对比', fontsize=19 if ppt else 11)
    fig.text(.07, .89, '模拟实验｜估计基线与真实检出78例、误报4例校准后的模型比较｜1000次模拟', fontsize=12 if ppt else 8)
    fig.text(.07, .16,
             '点为中位数，误差线为第2.5–97.5百分位。(a)展示两个边际中位数之差；\n'
             '(b)汇总逐次模拟差值。基线与训练后模型采用独立抽样，并非同一批图像的配对实测。\n'
             '提升幅度取决于估计基线与Qwen过滤假设；区间表示95%模拟不确定性范围。',
             fontsize=10.5 if ppt else 7.3, va='top', linespacing=1.45)
    export(fig, 'training_gain' if ppt else '07_training_gain', 'figures/ppt' if ppt else 'figures')
    plt.close(fig)


def ppt_versions():
    # Independent large-type exports for slide placement, not upsampled paper rasters.
    folder = ROOT / 'figures' / 'ppt'
    folder.mkdir(exist_ok=True)
    style(15)
    for name, draw, kind in [('training_convergence', convergence_axes, 'pair'),
                              ('precision_recall', pr_axes, 'pair'),
                              ('confusion_matrices', matrix_axes, 'matrix'),
                              ('model_forest', forest, 'single'),
                              ('monte_carlo_ecdf', ecdf, 'single')]:
        if kind in ['pair', 'matrix']:
            fig, axes = plt.subplots(1, 2, figsize=(12.8, 7.2))
            fig.subplots_adjust(left=.10, right=.96, bottom=.25 if kind == 'matrix' else .18,
                                top=.81, wspace=.32)
            if kind == 'matrix':
                draw(axes, fig)
                for ax in axes:
                    for text in ax.texts:
                        if text.get_text().startswith('TP='):
                            text.set_position((.5, -.23))
            else:
                draw(axes)
        else:
            fig, ax = plt.subplots(figsize=(12.8, 7.2))
            fig.subplots_adjust(left=.24 if name == 'model_forest' else .11,
                                right=.77 if name == 'model_forest' else .96, bottom=.18, top=.81)
            draw(ax)
        titles = {'training_convergence': '模型训练收敛曲线', 'precision_recall': '精准度与召回率曲线对比',
                  'confusion_matrices': '混淆矩阵对比', 'model_forest': '四组模型精准度比较',
                  'monte_carlo_ecdf': '1000次模拟精准度的累积分布'}
        fig.text(.07, .94, titles[name], fontsize=19)
        fig.text(.07, .885, '模拟实验｜依据有限真实记录校准｜设定42000张图像，未执行真实训练', fontsize=13)
        notes = {
            'training_convergence': '1000个模拟轮次；S1/S2依据源记录校准，S3为假设外推。未执行1000轮真实训练。',
            'precision_recall': '4200个模拟场景；模拟交并比≥0.50；101点计算AP。曲线为模拟结果，非真实模型验证。',
            'confusion_matrices': '置信度阈值=0.50；模拟交并比阈值=0.50；统一灰度。计数为模拟值，右下格不代表真负例。',
            'model_forest': '1000次蒙特卡洛模拟；第2.5–97.5百分位构成95%不确定性区间。竖线：真实校准值95.12%。',
            'monte_carlo_ecdf': '1000次蒙特卡洛抽样，不代表真实训练次数。原始基线为估计值，Qwen过滤率为假设。'}
        fig.text(.07, .045, notes[name], fontsize=11)
        # Scale fixed annotation fonts for slide viewing.
        for ax in fig.axes:
            ax.tick_params(labelsize=12)
            leg = ax.get_legend()
            if leg:
                for text in leg.get_texts():
                    text.set_fontsize(11)
            for text in ax.texts:
                text.set_fontsize(11)
        export(fig, name, 'figures/ppt')
        plt.close(fig)


def main():
    single_figures()
    multipanel()
    tables()
    observed_supplements()
    sensitivity_plot()
    training_gain()
    ppt_versions()
    training_gain(True)
    (ROOT / 'audit' / 'chinese_image_texts.json').write_text(json.dumps(EXPORT_AUDIT, indent=2, ensure_ascii=False), encoding='utf-8')
    print(f'Exported {len(EXPORT_AUDIT)} Chinese PNGs.')


if __name__ == '__main__':
    main()
