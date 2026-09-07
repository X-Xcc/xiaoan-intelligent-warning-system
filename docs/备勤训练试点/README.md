# 备勤训练试点交付文档

本目录是“备勤训练”首期试点的并行工作窗口。四份文档共享同一组对象、状态和接口口径，建议按以下顺序打开：

1. [00 总控与排期](./00_总控与排期.md)
2. [01 训练数据与规则](./01_训练数据与规则.md)
3. [02 AI 动捕评分与人工复核](./02_AI动捕评分与人工复核.md)
4. [03 训练工作台与验收](./03_训练工作台与验收.md)

## 当前实现状态

- 后端接口：`/api/training/readiness`、`/api/training/tasks`、`/api/training/tasks/{taskId}/start`、`/complete`、`/exception`、`/assessment`、`/api/training/assessments/{assessmentId}/review`、`/api/training/archives`、`/api/training/archives/{recordId}/retraining`
- 数据模式：`desensitized_sample`，仅用于试点演示
- 规则版本：`READINESS-RULE-2026.09-V1`
- 前端入口：`/duty-plan`
- 验证脚本：`scripts/verify_readiness_training_pilot.py`、`scripts/verify_readiness_training_frontend.mjs`
- 闭环状态：已覆盖训练开始、完训、异常登记、确定性评分、教官确认、档案沉淀与补训任务创建；动捕输入仍为预录脱敏样例。

文档中的字段名、状态名和验收条件优先于口头描述；变更按总控文档第 7 节登记。
