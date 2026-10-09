#!/usr/bin/env python3
"""Run one image through the locally fine-tuned Qwen2.5-VL adapter."""

from __future__ import annotations

import argparse
from pathlib import Path

import torch
from peft import PeftModel
from transformers import AutoProcessor, BitsAndBytesConfig, Qwen2_5_VLForConditionalGeneration
from qwen_vl_utils import process_vision_info


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--adapter", type=Path, required=True)
    parser.add_argument("--image", type=Path, required=True)
    args = parser.parse_args()
    if not torch.cuda.is_available():
        raise SystemExit("CUDA is required")
    processor = AutoProcessor.from_pretrained(str(args.adapter), local_files_only=True, min_pixels=3136, max_pixels=401408)
    quantization_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.float16,
        bnb_4bit_use_double_quant=True,
    )
    base = Qwen2_5_VLForConditionalGeneration.from_pretrained(
        str(args.model), quantization_config=quantization_config, device_map={"": 0},
        torch_dtype=torch.float16, local_files_only=True,
    )
    model = PeftModel.from_pretrained(base, str(args.adapter), local_files_only=True)
    model.eval()
    messages = [{
        "role": "user",
        "content": [
            {"type": "image", "image": str(args.image.resolve())},
            {"type": "text", "text": "请分析这张监控图片，识别摔倒、打架、聚集或自杀风险，只输出 JSON，字段为 risk 和 objects。"},
        ],
    }]
    text = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    image_inputs, video_inputs = process_vision_info(messages)
    inputs = processor(text=[text], images=image_inputs, videos=video_inputs, padding=True, return_tensors="pt")
    inputs = {k: v.to("cuda") if hasattr(v, "to") else v for k, v in inputs.items()}
    with torch.inference_mode():
        generated = model.generate(**inputs, max_new_tokens=160, do_sample=False)
    trimmed = generated[:, inputs["input_ids"].shape[1]:]
    print(processor.batch_decode(trimmed, skip_special_tokens=True, clean_up_tokenization_spaces=False)[0].strip())


if __name__ == "__main__":
    main()
