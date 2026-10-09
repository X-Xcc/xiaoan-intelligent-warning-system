# 本地数据集审计

审计日期：2026-09-28。全程只读；按图像文件计数，标签行按目标实例计数。

| 数据集 | train 图像 | val 图像 | 总文件数 | SHA-256 唯一图像 | train/val 同图哈希数 |
|---|---:|---:|---:|---:|---:|
| detection/datasets/actions | 244 | 63 | 307 | 307 | 0 |
| detection/datasets/actions_person | 3244 | 962 | 4206 | 4039 | 58 |
| detection/datasets/actions_person_full | 15676 | 4557 | 20233 | 19462 | 264 |
| detection/datasets/person_full | 15432 | 4494 | 19926 | 19155 | 264 |
| datasets/coco8 | 4 | 4 | 8 | 8 | 0 |

## actions 四类标签

| 划分 | 图像数 | fall 目标 | fight 目标 | gather 目标 | suicide 目标 |
|---|---:|---:|---:|---:|---:|
| train | 244 | 14 | 175 | 1 | 62 |
| val | 63 | 2 | 47 | 1 | 15 |

上表目标数仅统计当前有对应图像的标签。actions 的 train 有66份孤立标签、val有15份孤立标签。若把所有标签文件纳入，train目标数为 fall80/fight175/gather1/suicide62，val为 fall18/fight47/gather1/suicide15（共81目标）。当前63张验证图像对应65目标，说明文件状态与历史混淆矩阵的81目标依据不同。

## 重叠与解释

- 所有目录共有 44,680 个图像文件条目；全量 SHA-256 去重后 19,470 个字节唯一图像。
- prepare_combined_dataset.py 使用 shutil.copy2 复制 action 和 person 数据到混合目录。不能将派生目录相加后宣称四万独立训练图像。
- actions_person / actions_person_full 为五类（增加 person）；person_full 仅 person；四类任务应以 actions 单独报告。
- detection/datasets/actions 与 detection/datasets/actions_person 共享 307 个精确图像哈希。
- detection/datasets/actions 与 detection/datasets/actions_person_full 共享 307 个精确图像哈希。
- detection/datasets/actions_person 与 detection/datasets/actions_person_full 共享 4,039 个精确图像哈希。
- detection/datasets/actions_person 与 detection/datasets/person_full 共享 3,732 个精确图像哈希。
- detection/datasets/actions_person_full 与 detection/datasets/person_full 共享 19,155 个精确图像哈希。

## 重要局限

- 精确哈希只检验文件字节相同，不排除重编码、缩放复制或视频近邻帧。
- 当前文件清单不能证明历史训练实际使用的全部数据。
- 四万余张图像、1000 epoch 必须标为模拟场景设定；不以累计目录文件数充当真实独立样本量。
- 验证集目标实例数与图像数不同；不能把图像总数用于放大 TP=78、FP=4 的证据样本量。

复现脚本：audit_dataset.py；完整计数和 YAML 原文：dataset_audit.json。
