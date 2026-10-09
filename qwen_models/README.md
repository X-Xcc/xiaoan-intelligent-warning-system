# Qwen 基座模型锁定

项目使用 `Qwen/Qwen2.5-VL-3B-Instruct`。配置、分词器、模型索引和许可证随仓库提交；两片官方基座权重因单文件分别约 3.98 GB 和 3.53 GB，不直接进入 GitHub。

恢复时将下列文件放入：

`qwen_models/models/Qwen--Qwen2.5-VL-3B-Instruct/snapshots/master/`

| 文件 | 字节数 | SHA-256 |
|---|---:|---|
| `model-00001-of-00002.safetensors` | 3982649232 | `41a8895c164b4d32bae6b302f4603fcbc1797f32dafa45c7e9bcda23c6755df8` |
| `model-00002-of-00002.safetensors` | 3526688744 | `365531ff8752420e89dee707b79d021fb2d6e25abafe486f080555a4fe6972e4` |

下载后必须先校验 SHA-256，再运行微调或推理。项目自有 LoRA 和检查点在 `qwen_vl_finetune/` 中通过 Git LFS 保存。
