#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Qwen2.5-VL-7B 视觉语言模型服务
提供 HTTP API 接口供 Java 后端调用
"""

import os
import sys
import logging

logger = logging.getLogger(__name__)

# 修复 OpenMP 库冲突问题
os.environ['KMP_DUPLICATE_LIB_OK'] = 'TRUE'
os.environ['OMP_NUM_THREADS'] = '1'

# 模型路径由下方 MODEL_PATH 统一管理（环境变量 QWEN_VL_MODEL_PATH 优先）

import json
import base64
import io
from typing import Optional, Dict, Any
from pathlib import Path

from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
import torch

# 模型路径：优先环境变量 QWEN_VL_MODEL_PATH，否则使用默认相对路径
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_DEFAULT_MODEL_PATH = os.path.join(_SCRIPT_DIR, "..", "models", "Qwen2.5-VL-7B-Instruct")
MODEL_PATH = os.environ.get("QWEN_VL_MODEL_PATH", _DEFAULT_MODEL_PATH)

app = Flask(__name__)
CORS(app, origins=["http://localhost:5000", "http://localhost:5173", "http://127.0.0.1:5000"])

# 全局模型实例
model = None
tokenizer = None
processor = None


def load_model():
    """加载 Qwen2.5-VL 模型"""
    global model, tokenizer, processor

    try:
        from transformers import Qwen2_5_VLForConditionalGeneration, AutoProcessor
        from qwen_vl_utils import process_vision_info

        print(f"正在加载模型: {MODEL_PATH}")

        # 检查是否是Ollama格式的模型
        if "blobs" in MODEL_PATH and os.path.exists(os.path.join(os.path.dirname(MODEL_PATH), "manifests")):
            print("检测到Ollama格式的模型，这不是Hugging Face格式的模型")
            print("Ollama模型格式与transformers库不兼容")
            print("请使用Hugging Face格式的Qwen2.5-VL模型")
            print("您可以从以下地址下载正确格式的模型:")
            print("https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct")
            return False

        # 检查是否是blobs目录
        processor_path = MODEL_PATH
        if "blobs" in MODEL_PATH:
            # 如果是blobs目录，尝试从父目录加载处理器配置
            processor_path = os.path.dirname(MODEL_PATH)
            print(f"检测到blobs目录，从父目录加载处理器配置: {processor_path}")

        # 加载处理器
        # WARNING: trust_remote_code=True 允许执行模型仓库中的自定义代码
        # 仅使用可信来源的模型，确保模型路径未被篡改
        processor = AutoProcessor.from_pretrained(processor_path, trust_remote_code=True, local_files_only=True)

        # 加载模型
        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"使用设备: {device}")

        # WARNING: trust_remote_code=True 允许执行模型仓库中的自定义代码
        # 仅使用可信来源的模型，确保模型路径未被篡改
        model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
            MODEL_PATH,
            torch_dtype=torch.float16 if device == "cuda" else torch.float32,
            device_map="auto" if device == "cuda" else None,
            trust_remote_code=True,
            local_files_only=True
        )

        if device == "cpu":
            model = model.to(device)

        print("模型加载成功！")
        return True

    except ImportError as e:
        print(f"缺少依赖: {e}")
        print("请安装: pip install transformers torch Pillow flask flask-cors")
        return False
    except Exception as e:
        print(f"加载模型失败: {e}")
        print("注意：模型加载失败不会影响服务启动，HTTP服务仍会正常运行")
        print("如果您需要使用AI分析功能，请确保模型文件完整且路径正确")
        print("请使用Hugging Face格式的Qwen2.5-VL模型，而不是Ollama格式")
        return False


def analyze_image(image_data: bytes, prompt: str = "描述这张图片") -> str:
    """
    分析图片内容

    Args:
        image_data: 图片二进制数据
        prompt: 分析提示词

    Returns:
        分析结果文本
    """
    try:
        from qwen_vl_utils import process_vision_info

        # 将图片转换为 base64
        image_base64 = base64.b64encode(image_data).decode('utf-8')

        # 构建消息
        messages = [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "image": f"data:image/jpeg;base64,{image_base64}"
                    },
                    {
                        "type": "text",
                        "text": prompt
                    }
                ]
            }
        ]

        # 准备输入
        text = processor.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True
        )

        image_inputs, video_inputs = process_vision_info(messages)

        inputs = processor(
            text=[text],
            images=image_inputs,
            videos=video_inputs,
            padding=True,
            return_tensors="pt"
        )

        # 移动到设备
        device = "cuda" if torch.cuda.is_available() else "cpu"
        inputs = inputs.to(device)

        # 生成回答
        with torch.no_grad():
            generated_ids = model.generate(
                **inputs,
                max_new_tokens=512,
                do_sample=True,
                temperature=0.7,
                top_p=0.9
            )

        # 解码输出
        generated_ids_trimmed = [
            out_ids[len(in_ids):] for in_ids, out_ids in zip(inputs.input_ids, generated_ids)
        ]

        output_text = processor.batch_decode(
            generated_ids_trimmed,
            skip_special_tokens=True,
            clean_up_tokenization_spaces=False
        )[0]

        return output_text.strip()

    except Exception as e:
        logger.error("分析失败: %s", str(e))
        return "图片分析失败，请稍后重试"


@app.route('/health', methods=['GET'])
def health_check():
    """健康检查接口"""
    return jsonify({
        'status': 'healthy',
        'model_loaded': model is not None,
        'device': 'cuda' if torch.cuda.is_available() else 'cpu',
        'model_path': MODEL_PATH,
        'message': '服务运行正常，模型加载状态：' + ('已加载' if model is not None else '未加载（可能是网络问题或模型路径错误）')
    })


@app.route('/analyze', methods=['POST'])
def analyze():
    """
    分析图片接口

    请求体:
    {
        "image": "base64编码的图片",
        "prompt": "分析提示词（可选，默认：描述这张图片）"
    }
    """
    try:
        if model is None:
            return jsonify({
                'status': 'error',
                'message': '模型未加载，当前使用的是Ollama格式模型，与transformers库不兼容',
                'solution': '请从Hugging Face下载正确格式的Qwen2.5-VL模型：https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct'
            }), 503

        data = request.get_json()

        if not data or 'image' not in data:
            return jsonify({
                'status': 'error',
                'message': '缺少图片数据'
            }), 400

        # 解码图片
        image_base64 = data['image']
        if len(image_base64) > 14_000_000:
            return jsonify({"error": "图片数据过大，超过 10MB 限制"}), 413
        image_data = base64.b64decode(image_base64)

        # 获取提示词
        prompt = data.get('prompt', '描述这张图片')

        # 分析图片
        result = analyze_image(image_data, prompt)

        return jsonify({
            'status': 'success',
            'result': result,
            'prompt': prompt
        })

    except Exception as e:
        logger.error("图片分析失败: %s", str(e))
        return jsonify({
            'status': 'error',
            'message': '图片分析失败，请稍后重试'
        }), 500


@app.route('/analyze_file', methods=['POST'])
def analyze_file():
    """
    分析上传的图片文件

    表单数据:
    - file: 图片文件
    - prompt: 分析提示词（可选）
    """
    try:
        if model is None:
            return jsonify({
                'status': 'error',
                'message': '模型未加载'
            }), 503

        if 'file' not in request.files:
            return jsonify({
                'status': 'error',
                'message': '没有上传文件'
            }), 400

        file = request.files['file']
        prompt = request.form.get('prompt', '描述这张图片')

        # 读取图片数据
        image_data = file.read()

        # 分析图片
        result = analyze_image(image_data, prompt)

        return jsonify({
            'status': 'success',
            'result': result,
            'prompt': prompt,
            'filename': file.filename
        })

    except Exception as e:
        logger.error("文件分析失败: %s", str(e))
        return jsonify({
            'status': 'error',
            'message': '图片分析失败，请稍后重试'
        }), 500


@app.route('/batch_analyze', methods=['POST'])
def batch_analyze():
    """
    批量分析图片

    请求体:
    {
        "images": ["base64图片1", "base64图片2", ...],
        "prompt": "分析提示词（可选）"
    }
    """
    try:
        if model is None:
            return jsonify({
                'status': 'error',
                'message': '模型未加载'
            }), 503

        data = request.get_json()

        if not data or 'images' not in data:
            return jsonify({
                'status': 'error',
                'message': '缺少图片数据'
            }), 400

        images = data['images']
        prompt = data.get('prompt', '描述这张图片')

        results = []
        for i, image_base64 in enumerate(images):
            try:
                image_data = base64.b64decode(image_base64)
                result = analyze_image(image_data, prompt)
                results.append({
                    'index': i,
                    'status': 'success',
                    'result': result
                })
            except Exception as e:
                logger.error("批量分析第 %d 张图片失败: %s", i, str(e))
                results.append({
                    'index': i,
                    'status': 'error',
                    'message': '图片分析失败'
                })

        return jsonify({
            'status': 'success',
            'results': results,
            'total': len(images),
            'success_count': sum(1 for r in results if r['status'] == 'success')
        })

    except Exception as e:
        logger.error("批量分析失败: %s", str(e))
        return jsonify({
            'status': 'error',
            'message': '图片分析失败，请稍后重试'
        }), 500


def main():
    """主函数"""
    print("=" * 60)
    print("Qwen2.5-VL-7B 视觉语言模型服务")
    print("=" * 60)

    # 加载模型
    if not load_model():
        print("模型加载失败，服务将无法处理请求")
        print("但 HTTP 服务仍会启动，您可以稍后重试加载模型")

    # 启动服务
    port = int(os.environ.get('QWEN_VL_PORT', 5002))
    host = os.environ.get('QWEN_VL_HOST', '127.0.0.1')

    print(f"\n启动 HTTP 服务: http://{host}:{port}")
    print("API 端点:")
    print(f"  - GET  /health       健康检查")
    print(f"  - POST /analyze      分析图片（base64）")
    print(f"  - POST /analyze_file 分析上传的图片文件")
    print(f"  - POST /batch_analyze 批量分析图片")
    print("=" * 60)

    app.run(host=host, port=port, debug=False)


if __name__ == '__main__':
    main()
