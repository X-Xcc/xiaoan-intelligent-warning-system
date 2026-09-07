from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
import base64
import hashlib
import mimetypes
import shutil
import subprocess
from datetime import datetime
from typing import Any

from app.services.security_detection import ACTION_LEVELS, ACTION_TITLES, GATHERING_ACTIONS, import_security_detections_from_files, list_security_detections


DEFAULT_VLM_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
DEFAULT_VLM_MODEL = "qwen-vl-plus"
PROMPT_VERSION = "qwen-vl-crowd-judgement-v1"


class SecurityAiUnavailable(RuntimeError):
    pass


def _api_key() -> str:
    return os.getenv("SECURITY_VLM_API_KEY") or os.getenv("DASHSCOPE_API_KEY") or os.getenv("QWEN_API_KEY") or ""


def configured_vlm_base_url() -> str:
    return os.getenv("SECURITY_VLM_BASE_URL", DEFAULT_VLM_BASE_URL).rstrip("/")


def configured_vlm_model() -> str:
    return os.getenv("SECURITY_VLM_MODEL", DEFAULT_VLM_MODEL)


def vision_model_status() -> dict[str, Any]:
    return {
        "provider": os.getenv("SECURITY_VLM_PROVIDER", "qwen-compatible"),
        "configured": bool(_api_key()),
        "model": configured_vlm_model(),
        "baseUrl": configured_vlm_base_url(),
        "mode": "cloud-api",
        "promptVersion": PROMPT_VERSION,
    }


def _system_prompt() -> str:
    return (
        "你是烟火哨兵的视频画面复核服务。"
        "请看视频关键帧或截图，结合本地检测动作，判断现场是否存在人员聚集、通道拥堵、打架斗殴、人员跌倒或值守离岗等需要处置的风险。"
        "只返回 JSON，不要返回 Markdown。字段必须包含 "
        "isGathering(boolean), riskLevel(none|low|medium|high), peopleEstimate(number), "
        "sceneSummary(string), suggestion(string)。"
    )


def _media_content(payload: dict[str, Any]) -> list[dict[str, Any]]:
    content: list[dict[str, Any]] = []
    if payload.get("imageUrl"):
        content.append({"type": "image_url", "image_url": {"url": payload["imageUrl"]}})
    if payload.get("imageBase64"):
        mime_type = payload.get("imageMimeType") or "image/jpeg"
        content.append({"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{payload['imageBase64']}"}})
    if payload.get("videoUrl"):
        content.append({"type": "video_url", "video_url": {"url": payload["videoUrl"]}})
    return content


def _context_text(payload: dict[str, Any]) -> str:
    detection = payload.get("detection") or {}
    return json.dumps(
        {
            "cameraId": payload.get("cameraId"),
            "cameraName": payload.get("cameraName"),
            "detection": detection,
            "instruction": "结合画面和检测信息，判断这条聚集线索是否需要现场处理。",
        },
        ensure_ascii=False,
    )


def _extract_content(upstream: dict[str, Any]) -> str:
    choice = (upstream.get("choices") or [{}])[0]
    message = choice.get("message") or {}
    content = message.get("content", "")
    if isinstance(content, list):
        return "".join(str(item.get("text", "")) for item in content if isinstance(item, dict))
    return str(content)


def _parse_json_content(content: str) -> dict[str, Any]:
    text = content.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    match = re.search(r"\{.*\}", text, re.S)
    if match:
        text = match.group(0)
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        raise SecurityAiUnavailable(f"返回内容无法转成 JSON: {exc}") from exc
    if not isinstance(parsed, dict):
        raise SecurityAiUnavailable("返回内容不是 JSON 对象")
    return parsed


def _normalize_judgement(parsed: dict[str, Any], payload: dict[str, Any], usage: dict[str, Any] | None = None) -> dict[str, Any]:
    risk_level = str(parsed.get("riskLevel") or "none").lower()
    if risk_level not in {"none", "low", "medium", "high"}:
        risk_level = "medium" if parsed.get("isGathering") else "none"
    return {
        "provider": vision_model_status()["provider"],
        "model": configured_vlm_model(),
        "promptVersion": PROMPT_VERSION,
        "cameraId": payload.get("cameraId"),
        "cameraName": payload.get("cameraName"),
        "isGathering": bool(parsed.get("isGathering")),
        "riskLevel": risk_level,
        "peopleEstimate": int(parsed.get("peopleEstimate") or 0),
        "sceneSummary": str(parsed.get("sceneSummary") or ""),
        "suggestion": str(parsed.get("suggestion") or ""),
        "usage": usage or {},
    }


def _post_vlm_request(body: bytes) -> dict[str, Any]:
    """Call the compatible endpoint, using curl only when urllib hits a TLS transport failure."""
    url = f"{configured_vlm_base_url()}/chat/completions"
    timeout = float(os.getenv("SECURITY_VLM_TIMEOUT", "30"))
    request = urllib.request.Request(
        url,
        data=body,
        headers={"Authorization": f"Bearer {_api_key()}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except (OSError, urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError) as urllib_error:
        curl = shutil.which("curl")
        if not curl:
            raise SecurityAiUnavailable(str(urllib_error)) from urllib_error
        try:
            completed = subprocess.run(
                [
                    curl, "--silent", "--show-error", "--max-time", str(max(1, int(timeout))),
                    "--write-out", "\n__CICSIC_HTTP_STATUS__%{http_code}",
                    "-H", f"Authorization: Bearer {_api_key()}",
                    "-H", "Content-Type: application/json",
                    "--data-binary", "@-", url,
                ],
                input=body,
                capture_output=True,
                check=False,
                timeout=timeout + 5,
            )
        except (OSError, subprocess.SubprocessError) as curl_error:
            raise SecurityAiUnavailable(str(urllib_error)) from curl_error
        output = completed.stdout.decode("utf-8", errors="replace")
        marker = "\n__CICSIC_HTTP_STATUS__"
        response_text, _, status_text = output.rpartition(marker)
        try:
            status = int(status_text.strip())
        except ValueError as exc:
            detail = completed.stderr.decode("utf-8", errors="replace").strip() or str(urllib_error)
            raise SecurityAiUnavailable(detail) from exc
        if status < 200 or status >= 300:
            raise SecurityAiUnavailable(f"HTTP {status}: {response_text[:500]}")
        try:
            return json.loads(response_text)
        except json.JSONDecodeError as exc:
            raise SecurityAiUnavailable(f"返回内容无法解析: {exc}") from exc


def _local_judgement(payload: dict[str, Any]) -> dict[str, Any]:
    detection = payload.get("detection") or {}
    actions = detection.get("actions") or []
    person_count = int(detection.get("personCount") or detection.get("person_count") or 0)
    is_gathering = "人员聚集" in actions or "异常聚集" in actions or person_count >= 3
    primary_action = next((str(action) for action in actions if str(action) in ACTION_LEVELS), "")
    mapped_level = ACTION_LEVELS.get(primary_action, "中风险")
    risk_level = {"高风险": "high", "中风险": "medium", "低风险": "low"}.get(mapped_level, "none")
    return {
        "provider": vision_model_status()["provider"],
        "model": configured_vlm_model(),
        "promptVersion": PROMPT_VERSION,
        "cameraId": payload.get("cameraId"),
        "cameraName": payload.get("cameraName"),
        "primaryAction": primary_action,
        "needsDispatch": bool(primary_action),
        "isGathering": is_gathering,
        "riskLevel": risk_level if primary_action else ("medium" if is_gathering else "none"),
        "peopleEstimate": person_count,
        "sceneSummary": "已收到本地检测信息，当前还没有配置画面复核接口。",
        "suggestion": "先按本地检测结果进入人工确认；配置密钥后可自动复核画面。",
        "usage": {},
        "configured": False,
    }


def judge_scene(payload: dict[str, Any]) -> dict[str, Any]:
    if not _api_key():
        return _local_judgement(payload)

    messages = [
        {"role": "system", "content": _system_prompt()},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": _context_text(payload)},
                *_media_content(payload),
            ],
        },
    ]
    body = json.dumps({"model": configured_vlm_model(), "messages": messages, "temperature": 0.1}, ensure_ascii=False).encode("utf-8")
    upstream = _post_vlm_request(body)

    parsed = _parse_json_content(_extract_content(upstream))
    return _normalize_judgement(parsed, payload, upstream.get("usage") if isinstance(upstream, dict) else None)


def _serialize_detection(detection: dict[str, Any]) -> dict[str, Any]:
    timestamp = detection.get("timestamp")
    if hasattr(timestamp, "isoformat"):
        timestamp = timestamp.isoformat(timespec="seconds")
    return {**detection, "timestamp": timestamp}


def _attach_frame_payload(payload: dict[str, Any], detection: dict[str, Any]) -> None:
    image_filename = detection.get("imageFilename")
    detection_path = detection.get("path")
    if not image_filename or not detection_path:
        return
    image_path = os.path.join(os.path.dirname(str(detection_path)), str(image_filename))
    if not os.path.exists(image_path):
        return
    with open(image_path, "rb") as image:
        payload["imageBase64"] = base64.b64encode(image.read()).decode("ascii")
    payload["imageMimeType"] = mimetypes.guess_type(image_path)[0] or "image/jpeg"


def review_latest_yolo_detection(limit: int = 50) -> dict[str, Any]:
    imported = import_security_detections_from_files(limit=limit)
    detections = list_security_detections(limit=limit)
    if imported:
        imported_keys = {item.get("eventKey") for item in imported}
        detections = [item for item in detections if item.get("eventKey") in imported_keys]
    detection = next(
        (item for item in detections if any(action in ACTION_TITLES for action in item.get("actions", []))),
        None,
    )
    if not detection:
        raise SecurityAiUnavailable("现在没有可复核的 YOLO 行为检测")

    serialized = _serialize_detection(detection)
    payload: dict[str, Any] = {
        "cameraId": serialized.get("cameraId"),
        "cameraName": serialized.get("cameraName"),
        "detection": {
            "sourceId": serialized.get("sourceId"),
            "personCount": serialized.get("personCount"),
            "actions": serialized.get("actions"),
            "timestamp": serialized.get("timestamp"),
        },
    }
    _attach_frame_payload(payload, detection)
    judgement = judge_scene(payload)
    return {"detection": serialized, "judgement": judgement}


def normalize_yolo_detection(payload: dict[str, Any]) -> dict[str, Any]:
    actions = [str(action) for action in payload.get("actions", []) if str(action) in ACTION_TITLES]
    if not actions:
        raise SecurityAiUnavailable("YOLO 上报结果没有命中已支持的行为动作")
    source_id = str(payload.get("sourceId") or payload.get("id") or "yolo-detection")
    raw_timestamp = payload.get("timestamp")
    try:
        timestamp = datetime.fromisoformat(str(raw_timestamp)) if raw_timestamp else datetime.now()
    except ValueError:
        timestamp = datetime.now()
    event_key = str(
        payload.get("eventKey")
        or hashlib.sha1(f"posted:{source_id}:{timestamp.isoformat()}:{','.join(actions)}".encode("utf-8")).hexdigest()[:16]
    )
    return {
        "sourceId": source_id,
        "eventKey": event_key,
        "actions": actions,
        "primaryAction": actions[0],
        "timestamp": timestamp,
        "personCount": int(payload.get("personCount") or payload.get("person_count") or 0),
        "frameCount": int(payload.get("frameCount") or payload.get("frame_count") or 0),
        "fps": float(payload.get("fps") or 0),
        "imageFilename": payload.get("imageFilename") or payload.get("image_filename"),
        "cameraName": payload.get("cameraName") or payload.get("camera_name"),
        "cameraId": payload.get("cameraId") or payload.get("camera_id"),
        "path": payload.get("path"),
    }


def review_posted_yolo_detection(payload: dict[str, Any]) -> dict[str, Any]:
    detection = normalize_yolo_detection(payload)
    detection_for_model = _serialize_detection(detection)
    model_payload: dict[str, Any] = {
        "cameraId": detection_for_model.get("cameraId"),
        "cameraName": detection_for_model.get("cameraName"),
        "detection": {
            "sourceId": detection_for_model.get("sourceId"),
            "personCount": detection_for_model.get("personCount"),
            "actions": detection_for_model.get("actions"),
            "timestamp": detection_for_model.get("timestamp"),
        },
    }
    if payload.get("imageBase64"):
        model_payload["imageBase64"] = payload["imageBase64"]
        model_payload["imageMimeType"] = payload.get("imageMimeType") or "image/jpeg"
    if payload.get("imageUrl"):
        model_payload["imageUrl"] = payload["imageUrl"]
    if payload.get("videoUrl"):
        model_payload["videoUrl"] = payload["videoUrl"]
    return {"detection": detection, "judgement": judge_scene(model_payload)}
