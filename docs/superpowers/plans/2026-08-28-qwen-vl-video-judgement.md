# 视频画面复核接入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven development where practical. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a practical video review path for 烟火哨兵: local real-time detection keeps video responsive, and a vision review service produces structured scene notes for crowd-gathering alerts.

**Architecture:** Keep YOLO as the fast local trigger and frame extractor. Add CICSIC-owned API boundaries for video proxying and vision review, so the dashboard and event center do not depend on a specific detection vendor. The first implementation uses configurable HTTP APIs and leaves keys in environment variables.

**Tech Stack:** FastAPI, urllib stdlib HTTP client, React/Vite dashboard, existing SQL event store, existing realtime hub, DashScope and a compatible vision chat format.

**Spec:** User request on 2026-08-28: use a domestic vision service if possible, local deployment is likely not cost-effective, implement using skills and agent support.

## Global Constraints

- Do not store model API keys in source code; read `SECURITY_VLM_API_KEY` or `DASHSCOPE_API_KEY`.
- Do not require local Qwen-VL deployment for the first version.
- Preserve the current YOLO detection bridge as the real-time trigger path.
- Expose CICSIC-owned endpoints under `/api/security-video` and `/api/security-ai`.
- Keep YOLO and Qwen-VL as separate services; CICSIC consumes YOLO outputs and does not forward browser camera frames into YOLO.
- Keep the dashboard operational when the upstream video source or model API is not configured.
- Use TDD for new backend behavior and run dashboard build before completion.

---

## Files

- Create: `server/app/services/security_video.py`
  - Owns video upstream configuration, camera discovery, status, and MJPEG proxy streaming.
- Create: `server/app/services/security_ai.py`
  - Owns vision review configuration, prompt construction, provider call, JSON normalization, and no-key fallback status.
- Create: `server/app/api/routes/security_video.py`
  - Publishes `/api/security-video/cameras`, `/api/security-video/status`, and `/api/security-video/feed`.
- Create: `server/app/api/routes/security_ai.py`
  - Publishes `/api/security-ai/status` and `/api/security-ai/judgements`.
- Modify: `server/app/main.py`
  - Registers the two new routers.
- Modify: `apps/dashboard/src/pages/DashboardApp.tsx`
  - Shows direct video feed and review status on the monitor page.
- Modify: `apps/dashboard/src/styles.css`
  - Adds stable layout for video feed and model judgement panel.
- Modify: `README.md` and `server/README.md`
  - Documents environment variables and runtime path.
- Create: `scripts/verify_security_video_ai_routes.py`
  - Starts fake video and fake Qwen-compatible upstreams, then verifies CICSIC endpoints end to end.

## Task 1: Backend Video Proxy

**Interfaces:**
- Produces: `camera_items() -> list[dict]`, `video_status() -> dict`, `open_video_stream(cam: str) -> tuple[BinaryIO, str]`
- Consumes: `SECURITY_VIDEO_BASE_URL`, defaulting to `http://127.0.0.1:5000`

- [x] **Step 1: Write failing test**

Run:

```powershell
.\server\.venv-runtime\Scripts\python.exe .\scripts\verify_security_video_ai_routes.py
```

Expected first failure before implementation:

```text
HTTP 404: {"detail":"Not Found"}
```

- [x] **Step 2: Implement video service and route**

`GET /api/security-video/cameras` returns normalized camera items:

```json
{
  "items": [
    {
      "id": "cam-001",
      "name": "主街烧烤区",
      "online": true,
      "feedUrl": "/api/security-video/feed?cam=cam-001"
    }
  ]
}
```

`GET /api/security-video/feed?cam=cam-001` proxies the upstream MJPEG stream.

- [x] **Step 3: Run verification**

Run:

```powershell
.\server\.venv-runtime\Scripts\python.exe .\scripts\verify_security_video_ai_routes.py
```

Expected after Task 1 and Task 2:

```text
security_video_ai_routes ok
```

## Task 2: Vision Review API

**Interfaces:**
- Produces: `vision_model_status() -> dict`, `judge_scene(payload: dict) -> dict`
- Consumes: `SECURITY_VLM_BASE_URL`, `SECURITY_VLM_API_KEY`, `DASHSCOPE_API_KEY`, `SECURITY_VLM_MODEL`

- [x] **Step 1: Implement Qwen-compatible service**

The provider request uses a system prompt that asks for strict JSON:

```json
{
  "isGathering": true,
  "riskLevel": "medium",
  "peopleEstimate": 7,
  "sceneSummary": "摊位前多人停留，通道出现拥堵趋势",
  "suggestion": "建议网格员前往现场疏导。"
}
```

- [x] **Step 2: Publish routes**

`GET /api/security-ai/status` returns provider, configured state, model, and prompt version.

`POST /api/security-ai/judgements` accepts:

```json
{
  "cameraId": "cam-001",
  "cameraName": "主街烧烤区",
  "imageBase64": "<jpeg base64>",
  "detection": {
    "personCount": 7,
    "actions": ["人员聚集"]
  }
}
```

`POST /api/security-ai/yolo-reviews` consumes either the latest YOLO gathering detection from `SECURITY_DETECTION_DATA_DIRS` or a posted standalone YOLO gathering payload with an evidence frame. It calls the same review path and writes the result back to the matching event record.

## Task 3: Dashboard Monitor Surface

**Interfaces:**
- Consumes: `/api/security-video/feed?cam=cam-001`, `/api/security-ai/status`, existing `/api/events/overview`
- Produces: monitor page view with live video, model status, and judgement-ready copy.

- [x] **Step 1: Add state and fetches**

The monitor page fetches model status without blocking the existing overview refresh.

- [x] **Step 2: Replace iframe-first monitor with direct video feed**

The video panel renders a direct MJPEG image and keeps a link to the source monitor.

- [x] **Step 3: Add model panel**

Show provider, configured state, model name, and prompt version.

## Task 4: Documentation and Verification

- [x] **Step 1: Update README files**

Document:

```powershell
$env:SECURITY_VIDEO_BASE_URL="http://127.0.0.1:5000"
$env:SECURITY_VLM_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
$env:SECURITY_VLM_API_KEY="<your key>"
$env:SECURITY_VLM_MODEL="qwen-vl-plus"
```

- [x] **Step 2: Run backend route verification**

```powershell
.\server\.venv-runtime\Scripts\python.exe .\scripts\verify_security_video_ai_routes.py
```

- [x] **Step 3: Run existing security detection verification**

```powershell
npm run server:verify:security-detection
```

- [x] **Step 4: Run dashboard build**

```powershell
npm run dashboard:build
```

## Task 5: Standalone YOLO Result Push

**Interfaces:**
- Produces: `CICSIC_REVIEW_ENABLED`, `CICSIC_REVIEW_URL`, `CicsicReviewNotifier.notify(...)`
- Consumes: `POST /api/security-ai/yolo-reviews`

- [x] **Step 1: Add source-side notifier**

`D:\Dev\yolov8_security\detection\cicsic_notifier.py` builds a payload only for gathering actions and embeds the saved frame as Base64 image evidence.

- [x] **Step 2: Wire notifier after frame save**

`DataSaver.save_frame_image(...)` returns the saved evidence path. `monitor.py` calls the notifier after the frame save step, so YOLO keeps its own camera loop and CICSIC receives only result evidence.

- [x] **Step 3: Configure default local bridge**

`D:\Dev\yolov8_security\start.bat` defaults `CICSIC_REVIEW_ENABLED=true` and `CICSIC_REVIEW_URL=http://127.0.0.1:8010/api/security-ai/yolo-reviews` for local integration.

## Current Execution Choice

Inline execution in this session. A read-only subagent is checking current integration points in parallel while the main session implements the first runnable route set.
