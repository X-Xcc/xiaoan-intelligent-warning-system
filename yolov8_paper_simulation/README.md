# 论文风格YOLOv8模拟实验图组

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

用户要求突出训练后提升，优先使用 figures/07_training_gain.png 与 figures/ppt/training_gain.png。该图明确使用估计基线，配有差值的不确定性区间；数据和来源未改变。
