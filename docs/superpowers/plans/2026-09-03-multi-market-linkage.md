# 多夜市联防与设备联动 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有事件、证据、派单和审计主链上增加多夜市风险关联、统一设备接入和无人机联动任务。

**Architecture:** 事件继续以 `safety_events` 为唯一工单主表，统一上下文放在事件 `meta.context`，包含夜市、区域、设备、位置、时间、风险类型、证据和可信度。新建 `markets`、`zones`、`devices`、`risk_records`、`drone_tasks` 五表分别处理配置、跨夜市聚合和空中支援回执；设备和飞控通过 API 适配器接入，不改变主链。

**Tech Stack:** FastAPI、Pydantic、SQLAlchemy、React、TypeScript、Ant Design。

**Spec:** 用户在 2026-09-03 提供的三条软件能力线和五步开发顺序。

## Global Constraints

- 仅实现软件接入，不引入实体终端依赖。
- 复用 `eventKey`、证据帧、风险回写、派单和审计。
- 设备、无人机采用可模拟的标准接口。
- 所有新行为先由独立验证脚本覆盖。

---

### Task 1: 联防数据底座与事件上下文

**Files:**
- Create: `server/app/services/security_linkage.py`
- Modify: `server/app/services/models.py`
- Modify: `server/app/services/event_store.py`
- Test: `scripts/verify_multi_market_linkage.py`

**Interfaces:**
- Produces: `ensure_linkage_defaults()`、`enrich_event_context()`、`link_event_risk()`
- Consumes: `SafetyEvent.meta` 和现有派单、审计流程。

- [ ] **Step 1: Write the failing test**

```python
assert merchant_alarm["meta"]["context"]["marketId"] == "NC-NM-001"
assert merchant_alarm["meta"]["context"]["evidence"][0]["kind"] == "image"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `server/.venv-runtime/Scripts/python.exe scripts/verify_multi_market_linkage.py`
Expected: FAIL because the linkage service and event context do not yet exist.

- [ ] **Step 3: Write minimal implementation**

```python
class Market(Base):
    __tablename__ = "markets"
    marketId: Mapped[str] = mapped_column(String(64), primary_key=True)

def enrich_event_context(event: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    event.setdefault("meta", {})["context"] = normalized_context
    return normalized_context
```

- [ ] **Step 4: Run test to verify it passes**

Run: `server/.venv-runtime/Scripts/python.exe scripts/verify_multi_market_linkage.py`
Expected: PASS for the event-context assertions.

### Task 2: 多源设备接入与跨夜市风险记录

**Files:**
- Modify: `server/app/services/security_linkage.py`
- Modify: `server/app/api/routes/security_ops.py`
- Modify: `server/app/main.py`
- Test: `scripts/verify_multi_market_linkage.py`

**Interfaces:**
- Produces: `POST /api/security-linkage/observations` and `GET /api/security-linkage/risks`
- Consumes: standardized `deviceType`、`deviceId`、`thermalScore`、`behaviorScore`、`crowdScore`、`evidence`。

- [ ] **Step 1: Write the failing test**

```python
assert observation["event"]["meta"]["context"]["deviceType"] == "robot_dog"
assert risk["marketIds"] == ["NC-NM-001", "NC-NM-002"]
assert risk["level"] == "高风险"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `server/.venv-runtime/Scripts/python.exe scripts/verify_multi_market_linkage.py`
Expected: FAIL because device observations and risk aggregation endpoints do not exist.

- [ ] **Step 3: Write minimal implementation**

```python
def ingest_device_observation(payload: dict[str, Any]) -> dict[str, Any]:
    detection = build_detection_payload(payload)
    event = event_store.ingest_security_detection(detection)
    return {"event": event, "risk": get_risk_for_event(event)}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `server/.venv-runtime/Scripts/python.exe scripts/verify_multi_market_linkage.py`
Expected: PASS for multi-device and multi-market aggregation assertions.

### Task 3: 无人机任务与闭环回执

**Files:**
- Modify: `server/app/services/security_linkage.py`
- Modify: `server/app/api/routes/security_ops.py`
- Test: `scripts/verify_multi_market_linkage.py`

**Interfaces:**
- Produces: `POST /api/security-linkage/drone-tasks` and `PATCH /api/security-linkage/drone-tasks/{task_id}/receipt`
- Consumes: event or risk id, task area, waypoints, priority, broadcast text, video URL and device status.

- [ ] **Step 1: Write the failing test**

```python
assert task["status"] == "待执行"
assert receipt["status"] == "执行中"
assert receipt["videoUrl"] == "https://example.test/drone/live.m3u8"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `server/.venv-runtime/Scripts/python.exe scripts/verify_multi_market_linkage.py`
Expected: FAIL because drone tasks do not exist.

- [ ] **Step 3: Write minimal implementation**

```python
def create_drone_task(payload: dict[str, Any]) -> dict[str, Any]:
    return persist_task(payload, status="待执行")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `server/.venv-runtime/Scripts/python.exe scripts/verify_multi_market_linkage.py`
Expected: PASS for task creation and receipt assertions.

### Task 4: 指挥端联防态势

**Files:**
- Modify: `apps/dashboard/src/pages/DashboardApp.tsx`
- Modify: `apps/dashboard/src/styles.css`
- Test: `npm run dashboard:build`

**Interfaces:**
- Consumes: `overview.linkage` with risk records, devices and drone tasks.
- Produces: risk heat information, source status and air-support task action on the command page.

- [ ] **Step 1: Write the failing build expectation**

```ts
type LinkageOverview = {
  risks: RiskRecord[]
  devices: Device[]
  droneTasks: DroneTask[]
}
```

- [ ] **Step 2: Run build to verify it fails**

Run: `npm run dashboard:build`
Expected: FAIL until the new overview contract is handled.

- [ ] **Step 3: Write minimal implementation**

```tsx
<section className="linkage-panel">
  <PanelTitle kicker="LINKAGE" title="跨夜市联防" icon={<Radio size={18} />} />
</section>
```

- [ ] **Step 4: Run build to verify it passes**

Run: `npm run dashboard:build`
Expected: PASS.

### Task 5: Full verification

**Files:**
- Modify: `README.md`
- Modify: `server/README.md`
- Modify: `package.json`

- [ ] **Step 1: Add verification command**

```json
"server:verify:multi-market-linkage": ".\\server\\.venv-runtime\\Scripts\\python.exe .\\scripts\\verify_multi_market_linkage.py"
```

- [ ] **Step 2: Run focused checks**

Run: `npm run server:verify:multi-market-linkage` and `npm run dashboard:build`
Expected: PASS.

- [ ] **Step 3: Run delivery regression**

Run: `npm run verify:delivery`
Expected: PASS.
