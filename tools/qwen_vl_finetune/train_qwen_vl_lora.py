#!/usr/bin/env python3
"""QLoRA fine-tuning for Qwen2.5-VL on the converted action dataset."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

import torch
from PIL import Image
from torch.utils.data import Dataset
from transformers import (
    AutoProcessor,
    BitsAndBytesConfig,
    Qwen2_5_VLForConditionalGeneration,
    Trainer,
    TrainingArguments,
)
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from qwen_vl_utils import process_vision_info


class JsonlDataset(Dataset):
    def __init__(self, path: Path) -> None:
        self.items = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]

    def __len__(self) -> int:
        return len(self.items)

    def __getitem__(self, index: int) -> dict[str, Any]:
        return self.items[index]


class VisionSFTCollator:
    def __init__(self, processor: Any, max_length: int) -> None:
        self.processor = processor
        self.max_length = max_length
        self.pad_token_id = processor.tokenizer.pad_token_id
        if self.pad_token_id is None:
            self.pad_token_id = processor.tokenizer.eos_token_id

    def __call__(self, features: list[dict[str, Any]]) -> dict[str, torch.Tensor]:
        if len(features) != 1:
            raise ValueError("This memory-constrained collator expects batch size 1")
        sample = features[0]
        messages = sample["messages"]
        prompt_messages = messages[:-1]

        full_text = self.processor.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=False
        )
        prompt_text = self.processor.apply_chat_template(
            prompt_messages, tokenize=False, add_generation_prompt=True
        )
        image_inputs, video_inputs = process_vision_info(messages)
        encoded = self.processor(
            text=[full_text],
            images=image_inputs,
            videos=video_inputs,
            padding=True,
            truncation=True,
            max_length=self.max_length,
            return_tensors="pt",
        )
        prompt_encoded = self.processor(
            text=[prompt_text],
            images=image_inputs,
            videos=video_inputs,
            padding=True,
            truncation=True,
            max_length=self.max_length,
            return_tensors="pt",
        )
        labels = encoded["input_ids"].clone()
        prompt_len = min(prompt_encoded["input_ids"].shape[1], labels.shape[1])
        labels[:, :prompt_len] = -100
        labels[labels == self.pad_token_id] = -100
        encoded["labels"] = labels
        return encoded


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--train", type=Path, required=True)
    parser.add_argument("--val", type=Path, default=None)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--epochs", type=float, default=1.0)
    parser.add_argument("--max-steps", type=int, default=-1)
    parser.add_argument("--max-length", type=int, default=1024)
    parser.add_argument("--learning-rate", type=float, default=2e-4)
    parser.add_argument("--max-pixels", type=int, default=401408)
    args = parser.parse_args()

    if not torch.cuda.is_available():
        raise SystemExit("CUDA is required for this QLoRA run; no CUDA device was detected")
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
    torch.backends.cuda.matmul.allow_tf32 = True

    args.output.mkdir(parents=True, exist_ok=True)
    processor = AutoProcessor.from_pretrained(
        str(args.model),
        trust_remote_code=True,
        local_files_only=True,
        min_pixels=3136,
        max_pixels=args.max_pixels,
    )
    quantization_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.float16,
        bnb_4bit_use_double_quant=True,
    )
    model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
        str(args.model),
        quantization_config=quantization_config,
        device_map={"": 0},
        torch_dtype=torch.float16,
        trust_remote_code=True,
        local_files_only=True,
    )
    model.config.use_cache = False
    model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)
    model.enable_input_require_grads()
    lora_config = LoraConfig(
        r=8,
        lora_alpha=16,
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    train_dataset = JsonlDataset(args.train)
    eval_dataset = JsonlDataset(args.val) if args.val and args.val.is_file() else None
    collator = VisionSFTCollator(processor, args.max_length)
    training_args = TrainingArguments(
        output_dir=str(args.output),
        num_train_epochs=args.epochs,
        max_steps=args.max_steps,
        per_device_train_batch_size=1,
        per_device_eval_batch_size=1,
        gradient_accumulation_steps=8,
        learning_rate=args.learning_rate,
        lr_scheduler_type="cosine",
        warmup_ratio=0.05,
        logging_steps=1,
        save_strategy="epoch",
        eval_strategy="no",
        save_total_limit=2,
        fp16=True,
        gradient_checkpointing=True,
        remove_unused_columns=False,
        dataloader_num_workers=0,
        optim="paged_adamw_8bit",
        report_to=[],
        seed=20260929,
        data_seed=20260929,
    )
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=eval_dataset,
        data_collator=collator,
        processing_class=processor,
    )
    trainer.train()
    trainer.save_model(str(args.output / "adapter"))
    processor.save_pretrained(str(args.output / "adapter"))
    (args.output / "run_config.json").write_text(
        json.dumps({k: str(v) for k, v in vars(args).items()}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"saved adapter: {args.output / 'adapter'}")


if __name__ == "__main__":
    main()
