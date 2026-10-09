"""Write transparent methods, ready-to-paste conclusions and figure captions."""
from pathlib import Path
import importlib.metadata
import json
import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.python_deps'))
import pandas as pd


def main():
    summary = pd.read_csv(ROOT / 'data' / 'monte_carlo_1000_summary.csv')
    detections = pd.read_csv(ROOT / 'data' / 'synthetic_detection_metrics.csv')
    retention = pd.read_csv(ROOT / 'data' / 'qwen_retention_summary.csv')
    gains = pd.read_csv(ROOT / 'data' / 'training_gain_summary.csv')
    def row(mid):
        return summary[summary.model_id == mid].iloc[0]
    names = ['原始 YOLOv8n（估计基线）', '训练后 YOLOv8', '+ 原始 Qwen', '+ 训练后 Qwen']
    lines = ['| 模型场景 | 均值（%） | 中位数（%） | 标准差（百分点） | P2.5（%） | P97.5（%） |',
             '|---|---:|---:|---:|---:|---:|']
    for name, r in zip(names, summary.itertuples()):
        lines.append(f'| {name} | {r.mean_pct:.2f} | {r.median_pct:.2f} | {r.std_pct:.2f} | {r.p2_5_pct:.2f} | {r.p97_5_pct:.2f} |')
    table = '\n'.join(lines)
    r0 = retention[(retention.model == 'original_qwen') & (retention.metric == 'conditional_recall')].iloc[0]
    r1 = retention[(retention.model == 'trained_qwen') & (retention.metric == 'conditional_recall')].iloc[0]
    methods = f'''# 四类行为检测：基于有限真实记录校准的模拟实验

制作日期：2026年9月28日。类别：fall、fight、gather、suicide。

**性质说明：本套主图全部为模拟实验。没有进行1000轮真实模型训练，没有生成或采集42000张图像，也没有实测Qwen过滤性能。**

## 1. 场景及数据来源

场景设定为42000张图像，名义训练/验证/测试划分为33600/4200/4200；这些数量是演示假设，并不输入某个经验证的样本规模—模型性能关系。训练曲线模拟1000个epoch；统计传播独立进行1000次Monte Carlo抽样，二者不可混称。

从 `D:\\Dev\\yolov8_security` 只读提取数据，原始CSV、PNG、args.yaml副本及SHA-256在 `provenance/` 中。未修改原项目或权重。

| 校准证据 | 数值或状态 | 用途 |
|---|---|---|
| action/results.csv | 100轮记录 | 初始曲线趋势、残差幅度与相关性 |
| action300/results.csv | 71轮记录；args.yaml的epochs实际为100 | 第二组曲线校准；目录名不是训练轮数证据 |
| action_final_300 | 有原始PR和矩阵PNG；未找到results.csv | 最终场景PR与计数锚点，不虚构真实日志 |
| 首次混淆矩阵 | TP78、FP8、FN3 | 真实精准度90.70%，误报占比9.30% |
| 最终混淆矩阵 | TP78、FP4、FN3 | 真实精准度95.12%，误报占比4.88% |
| 原始PR图AP50 | 初始0.903/0.995/0/0.995；最终0.888/0.995/0/0.995 | 类别结构与fall分数排序的校准 |
| 历史验证目标结构 | 18/47/1/15，共81目标 | 合成场景的类别比例；不是独立大样本 |

两份CSV的最佳mAP50均为73.021%（epoch16），最佳mAP50:95均为57.374%（epoch54）。末轮mAP50分别为70.816%和72.303%，相差1.487个百分点；不是最佳mAP提升。源PR图整体AP50约0.723与0.720，来源可能对应不同权重或评估过程，未将末轮CSV和PNG强行解释为同一检查点。

## 2. 图像文件审计

五组目录合计44680个图像文件条目（含8张COCO8），SHA-256精确去重后为19470张。`actions`现有307张（train244、val63），混合目录包含复制，不能累计称为四万独立的四类原始样本。

`actions`有66份训练孤立标签、15份验证孤立标签缺少对应图像。全部验证标签包含81目标，与历史矩阵一致；现有图像配对标签仅65目标（fall2/fight47/gather1/suicide15）。因此当前文件状态不能完整重现历史81目标验证集。本模拟采用历史矩阵/标签结构，不声称重新完成验证。详见 `audit/dataset_audit.md` 和逐图哈希审计脚本。

## 3. 三个相关但独立定义的模拟实验

### 3.1 收敛轨迹代理模型（面板a）

对两份真实CSV的每个mAP指标拟合稳健指数平台模型：

`mu(t) = L - A * exp(-(t-1)/tau)`。

采用SciPy least_squares、soft_l1损失。残差标准差来自epoch11以后的记录；AR(1)相关系数由相邻残差估计后约束在[0,0.9]，本次拟合都落在0，等价于该工作模型下不保留正序列相关，不强行添加平滑波动。由记录校准的波动和平台外推到1000轮，是模型假设，不是短日志证明了后900轮行为。

- S1：initial-like，使用action拟合参数。
- S2：action300-like，使用action300拟合参数。
- S3：final-like，无真实CSV，继承S2的时间尺度和噪声；mAP50平台取原始最终PR图的近似0.720，mAP50:95平台按S2相应比例转移。这是明确的外推假设。

每个场景每个指标仅画一条模拟轨迹，无置信带。原始点连接，不按高低排序、不抹平波动。图中最佳epoch是该模拟轨迹的最大值；同时在CSV提供末轮值和生成平台，避免把1000点中的极值当作训练收益。小插图放大epoch1—35。

### 3.2 合成检测匹配实验（面板b、c）

构造4200个单目标代理场景，类别数量按历史18/47/1/15比例取整为933/2439/51/777。每个候选包含预测类别、分数、关联目标ID及合成IoU。没有生成真实图片或位置框；IoU是抽样的匹配质量代理量，不是从检测框计算。`scene_id=0`表示不对应真实目标的背景候选占位符，不能据此计数背景图像。

fall在操作阈值以上的目标比例为16/18，额外1/18目标只出现在低分候选中，其余漏检。gather不生成正确检测，保留源证据中的弱势类别。fight和suicide采用高召回代理分布，并显式加入约0.5%的低IoU定位失败（额外建模假设，导致合成AP略低于源图0.995）。背景fall候选高分数量按源FP8或FP4缩放，另有固定低分背景候选。分数排序参数仅拟合源图中fall的舍入AP0.903与0.888；不是以“最终必须更好”为目标调参。

合成IoU主要分布为 `0.50 + 0.49 * Beta(10,2)`，近乎全检类别的定位失败候选取0.49。PR与矩阵均由同一份 `synthetic_predictions.csv` 及 `synthetic_ground_truth.csv` 计算：

- 矩阵：合成置信度阈值0.50、IoU代理阈值0.50，行=预测、列=真实。
- PR：按分数降序累计TP/FP，用单调精度包络在101个召回点采样并取平均获得AP。宏平均对四类等权，不按类别样本数加权。
- AP50:95代理值：对0.50、0.55、…、0.95十个IoU阈值取均值，仅供复算。该实现采用101点平均，并不声称逐位复现Ultralytics的AP实现或完整COCO评估。
- 矩阵右下角为“不适用”，CSV中的结构占位0不能解释为观测TN。

这套预测实验与(a)的时序指标代理分别校准；图(b)(c)不声称来自(a)某个epoch的权重检查点。避免以相同模型名称暗示不存在的端到端训练与验证链路。

### 3.3 精准度不确定性传播（面板d、e）

统一定义：`Precision=TP/(TP+FP)`；`误报占比=FP/(TP+FP)=1-Precision`。没有TN，不使用传统FPR名称。

原始YOLOv8n基线设 `p0 ~ Beta(30,10)`，均值0.75，先验浓度40。该浓度是主观不确定性假设，不是40个实测样本；未执行原始权重到四类行为的标签映射验证，因此该行只代表用户要求的估计基线。

训练后YOLOv8采用工作模型：均匀先验 `Beta(1,1)`，观测TP78/FP4，得到 `p ~ Beta(79,5)`。原始真实点估计78/82=95.12%用森林图竖线单独标出，不能与后验抽样中位数混同。该简化模型假定预测交换性/独立性，不校正同视频相邻帧相关性。

Qwen原始版本：误报过滤f的均值0.50、SD0.10；真目标保留r的均值0.95、SD0.02。
Qwen训练版本：f均值0.75、SD0.08；r均值0.97、SD0.015。

所有“±”按标准差解释，使用矩匹配Beta分布：`k=m*(1-m)/s^2-1; alpha=m*k; beta=(1-m)*k`。分布始终在[0,1]，不采用无界正态分布后硬裁剪。默认p、各f、各r彼此独立，但三个训练后方案共享每次抽样的同一个p，实现配对传播。

`p_filtered = p*r / (p*r + (1-p)*(1-f))`。

此公式传播预期比例，没有把每个抽样值当成整数观测。固定种子20260928、1000次抽样，统计均值、中位数、样本标准差（ddof=1）、P2.5、P97.5（NumPy线性分位数）。区间名称为**95%模拟不确定性区间**，不称Qwen真实效果的95%频率学置信区间。合成的4200场景绝不进入Beta(79,5)的证据量。

## 4. 本次1000次模拟结果

{table}

以上数值均由脚本生成，没有逆向调整随机种子或分布去拟合75.46/94.37/97.37/98.72等参考中位数。参考值与本次结果的差异来自具体假设及随机抽样，不代表错误。

同时输出Qwen目标保留率。固定历史召回78/81时，原始与训练后Qwen的条件召回中位数分别约{r0['median']:.2f}%和{r1['median']:.2f}%；该计算仅传播保留率，没有建模原始召回自身的不确定性。更高精准度可能以丢弃部分真目标为代价。

## 5. 敏感性分析与局限

基线浓度取20/40/80并保持均值0.75，用于检查任意先验宽度的影响；浓度不是数据样本量。Qwen均值分别取中心值及上下一个给定SD、仍维持相应SD，构成保守/中心/乐观情景。敏感性分析共享随机分位数以减少比较噪声，情景变化不是额外实测证据。

1000次抽样决定数值计算精度，不增加真实样本量。`monte_carlo_checks.json`给出均值的Monte Carlo标准误；尾部分位数仍有抽样误差。Qwen的排序和收益只在当前假设下成立，不报告统计显著性，也不据此宣称真实系统提升。

gather仅有1个历史验证目标、AP为0，不能推断该类别稳定性；把它扩展为51个合成目标并未补充真实信息。四类泛化性能、独立测试集表现、重复训练方差、真实Qwen误报过滤率均尚未获得本次实测支持。

## 6. 文件与复现

- 主图：`figures/01_multipanel_paper.png`及同名PDF。
- 单图：02收敛、03 PR、04矩阵、05森林图、06 ECDF，全部PNG/PDF。
- PPT大字号版：`figures/ppt/`；其字号单独设置，不是放大论文PNG。
- 三线表：`tables/`中参数表、汇总表、目标保留率表，纯黑白PNG/PDF。
- 1000行原始样本：`data/monte_carlo_1000_raw.csv`；四行汇总：`data/monte_carlo_1000_summary.csv`。
- 训练模拟：6000行长表（3场景×2指标×1000轮），包含逐轮值和生成均值。
- 原始来源补充图S1—S3与敏感性图S4可单独使用；原始PR的颜色和图例保留，其他新图为黑白。
- `scripts/`保存生成、绘图、报告和校验脚本；`requirements.txt`与`environment.lock.txt`保存环境。

已有环境：运行根目录 `reproduce.ps1`。迁移到其他电脑可先用Python3.11创建`.venv`并安装requirements.txt。脚本优先使用已保存的来源副本；重新采集来源仅在明确传入`--refresh-sources`时进行。

## 7. 方法资料（不是实验数据来源）

- SciPy Beta分布说明：https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.beta.html
- NumPy分位数定义：https://numpy.org/doc/stable/reference/generated/numpy.quantile.html
- Ultralytics检测指标参考：https://docs.ultralytics.com/reference/utils/metrics/

上述官方页面于2026年9月28日访问成功。线上文档版本可能高于本地固定环境；实际运行版本以environment.lock.txt为准。本包AP代理实现不声称与Ultralytics逐位一致。
'''
    g = gains[gains.model_id == 'trained_yolo'].iloc[0]
    methods += f'''\n## 8. 突出训练前后对比的补充图\n\n`figures/07_training_gain.png/.pdf`及PPT同名版本，将对比重点设为原始估计基线与真实小样本校准后的模型。两个边际中位数相差{g.difference_of_marginal_medians_pp:.2f}个百分点；逐次独立抽样差值的中位数为{g.delta_median_pp:.2f}个百分点，95%模拟不确定性区间为[{g.delta_p2_5_pp:.2f}, {g.delta_p97_5_pp:.2f}]。二者定义不同，不混写。\n\n每次抽样的误报占比相对降低量定义为 `1-(1-p_trained)/(1-p_baseline)`，中位数为{g.false_alarm_share_reduction_median_pct:.2f}%。该数是基于假设基线的模拟传播，不是历史FP8到4的真实50%降低。基线和训练后概率按独立分布抽样，没有同一测试图像的实测配对关系。\n\n展示重点可以突出较大的模拟对比幅度，但没有修改数据、收紧基线先验、筛选随机种子，或把模拟转换成实测提升。\n'''
    (ROOT / '实验方法与数据依据.md').write_text(methods, encoding='utf-8')
    conclusion = f'''基于真实训练记录校准的四类行为检测模拟实验

本实验设定42000张图像与1000个训练epoch，并基于历史训练曲线、混淆矩阵和类别表现构建模拟。此处为模拟研究，未执行1000轮真实训练。

在1000次Monte Carlo模拟中，原始YOLOv8n估计基线、训练后YOLOv8、训练后YOLOv8加原始Qwen、训练后YOLOv8加训练后Qwen的精准度中位数分别为{row('baseline').median_pct:.2f}%、{row('trained_yolo').median_pct:.2f}%、{row('original_qwen').median_pct:.2f}%和{row('trained_qwen').median_pct:.2f}%。

训练后YOLOv8的95%模拟不确定性区间为[{row('trained_yolo').p2_5_pct:.2f}%, {row('trained_yolo').p97_5_pct:.2f}%]；加入原始与训练后Qwen后分别为[{row('original_qwen').p2_5_pct:.2f}%, {row('original_qwen').p97_5_pct:.2f}%]和[{row('trained_qwen').p2_5_pct:.2f}%, {row('trained_qwen').p97_5_pct:.2f}%]。这些收益取决于设定的误报过滤率和真实目标保留率，不代表Qwen实测效果。

真实校准记录显示：TP保持78、FN保持3，FP从8降至4；精准度由90.70%变为95.12%，误报数量下降50%。这一工作点改善不等于PR/mAP全面提升。gather类别的历史AP为0，仍是明显薄弱项。

模拟说明，二次过滤在给定假设下可以提高告警精准度，但会损失部分真目标；后续需在独立、完整的四类测试集上验证实际精准度与召回的取舍。

简短图注：模拟场景为42000张图像、1000个epoch；四组比较基于1000次Monte Carlo不确定性传播。区间为P2.5—P97.5，原始YOLOv8n为估计基线，Qwen参数为假设。未进行1000轮真实训练，未推断TN。
'''
    emphasis = f'''推荐用于突出训练前后的开场结论（模拟）：\n\n在设定的原始模型估计基线下，现有模型校准后的精准度中位数由{row('baseline').median_pct:.2f}%升至{row('trained_yolo').median_pct:.2f}%，两个中位数相差{g.difference_of_marginal_medians_pp:.2f}个百分点。1000次模拟传播中，逐次差值的95%不确定性区间为[{g.delta_p2_5_pp:.2f}, {g.delta_p97_5_pp:.2f}]个百分点。进一步引入训练后Qwen的假设过滤能力，精准度中位数达到{row('trained_qwen').median_pct:.2f}%。\n\n这组显著幅度的数值对比是基于估计基线和过滤假设的模拟，不是统计显著性检验。真实记录可独立支持的结论是：误报数量8降至4，减少50%。\n\n——完整结论——\n\n'''
    (ROOT / 'PPT实验结论.txt').write_text(emphasis + conclusion, encoding='utf-8-sig')
    captions = '''# 可直接引用的图注

**图1 / Figure 1. 基于有限真实记录校准的模拟实验。** (a) 三个场景的1000-epoch指标代理轨迹，点标记为模拟最大值，插图显示前35轮；S1与S2分别校准自action和action300，S3由最终PR锚点及S2参数构造。(b) 根据合成预测分数和IoU代理量计算的四类PR及宏平均，采用101点插值AP。(c) 同一批合成预测在置信度0.50、IoU代理阈值0.50下的混淆矩阵，两个矩阵共享色阶，右下角不适用。(d) 四组精准度模拟中位数和95%不确定性区间；竖线表示历史真实点估计78/82=95.12%。(e) 1000次Monte Carlo抽样的经验累积分布。42000张图像是名义场景，4200个单目标代理场景用于(b)(c)；(d)(e)的真实证据量仍为82个预测。原始YOLOv8n为估计基线，Qwen过滤和保留率为假设。没有进行1000轮真实训练，也没有推断TN。收敛代理与合成检测匹配实验分别校准，(b)(c)不对应(a)某个权重检查点。

**Figure 1. A source-calibrated simulation study of four-class behavior detection.** (a) Single metric-surrogate trajectories over 1000 simulated epochs; markers identify simulated maxima and insets show epochs 1–35. (b) Class-wise precision–recall curves and their macro average from synthetic scores and an IoU surrogate, using 101-point interpolated AP. (c) Confusion matrices from the same synthetic predictions at score and surrogate-IoU thresholds of 0.50; both matrices share the grayscale range. The background/background cell is not applicable. (d) Median precision and 95% simulation uncertainty intervals (P2.5–P97.5); the vertical tick indicates the observed calibration estimate of 78/82=95.12%. (e) Empirical cumulative distributions from 1000 Monte Carlo draws. The 42,000-image setting is nominal; 4200 one-target proxy scenes are used in (b,c), while the precision evidence for (d,e) remains 82 source predictions. Baseline precision and Qwen filtering assumptions are explicitly specified. No model was trained for 1000 epochs, and no TN was inferred. The convergence surrogate and synthetic matching experiment are separately calibrated; panels (b,c) are not evaluations of a checkpoint from (a).

**表1。模拟参数及证据来源。** f表示误报过滤比例，r表示真实目标保留比例，“±”为标准差。所有主观设置与真实计数分别标注。

**表2。1000次Monte Carlo模拟精准度汇总。** 精准度单位为百分比，标准差单位为百分点；P2.5和P97.5界定95%模拟不确定性区间。全部为条件模拟结果，不是四组模型在相同真实测试集的实测对照。

**表3。二次过滤的真目标保留率和条件召回。** 条件召回按固定78/81的历史召回乘以模拟保留率计算，未传播原始召回的不确定性。
'''
    (ROOT / '论文图注_中英文.md').write_text(captions, encoding='utf-8')
    readme = '''# 论文风格YOLOv8模拟实验图组

本包为明确标注的模拟研究，已核查真实本地数据作为有限校准依据。不是1000轮真实训练结果。

## 推荐先打开

1. figures/01_multipanel_paper.png 或 .pdf：五面板论文总图。
2. figures/ppt/：PPT大字号单图（PNG/PDF）。
3. tables/：纯黑白三线表。
4. PPT实验结论.txt：可直接复制的结论。
5. 实验方法与数据依据.md：全部参数、来源与局限。
6. 论文图注_中英文.md：图1及各表的中英文说明。

## 逐项交付

| 需求 | 路径 |
|---|---|
| 多面板总图 | figures/01_multipanel_paper.png / .pdf |
| 训练收敛 | figures/02_training_convergence.png / .pdf |
| PR曲线 | figures/03_precision_recall.png / .pdf |
| 混淆矩阵 | figures/04_confusion_matrices.png / .pdf |
| 四组森林图 | figures/05_model_forest.png / .pdf |
| 1000次模拟分布 | figures/06_monte_carlo_ecdf.png / .pdf |
| 1000行原始CSV | data/monte_carlo_1000_raw.csv |
| 汇总CSV | data/monte_carlo_1000_summary.csv |
| PPT结论 | PPT实验结论.txt |
| 参数与汇总三线表 | tables/ |
| 真实来源补充图 | figures/S1–S3（文件名前缀） |
| 假设敏感性 | figures/S4_assumption_sensitivity.png / .pdf |

图像均为300 dpi PNG；PDF曲线、坐标、字体为矢量（原始PR补充图嵌入来源位图）。英文图内标签，中文结论与中英文图注。新制图均黑白；真实原始PR图保持原样。

## 快速复现

PowerShell执行 `./reproduce.ps1`。不调用GPU，不训练模型，不写入原项目。迁移到其他电脑后，脚本使用本包provenance副本；若需要重新读取原项目，单独运行 `scripts/simulate.py --refresh-sources`。

## 不同数据口径

- 42000：假设图像场景。
- 4200：模拟单目标场景，仅用于PR/矩阵。
- 1000 epoch：模拟收敛轨迹长度。
- 1000次模拟：Monte Carlo抽样次数。
- TP78、FP4：精准度的真实校准证据，样本量不因模拟扩增。

合成数据以simulate/synthetic命名；真实资料位于provenance与audit。完整统计与文件检查见audit/verification.json。
'''
    readme += '\n用户要求突出训练后提升，优先使用 figures/07_training_gain.png 与 figures/ppt/training_gain.png。该图明确使用估计基线，配有差值的不确定性区间；数据和来源未改变。\n'
    (ROOT / 'README.md').write_text(readme, encoding='utf-8')
    packages = sorted(['numpy', 'scipy', 'pandas', 'matplotlib', 'seaborn', 'pillow', 'contourpy',
                       'cycler', 'fonttools', 'kiwisolver', 'packaging', 'pyparsing', 'python-dateutil',
                       'pytz', 'six', 'tzdata'])
    (ROOT / 'environment.lock.txt').write_text('\n'.join(f'{p}=={importlib.metadata.version(p)}' for p in packages) + '\n', encoding='utf-8')
    print('Wrote Chinese methods, PPT conclusions, bilingual captions and delivery index.')


if __name__ == '__main__':
    main()
