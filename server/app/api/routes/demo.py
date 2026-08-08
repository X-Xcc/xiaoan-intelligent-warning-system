from datetime import datetime
from fastapi import APIRouter
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

router = APIRouter(prefix="/demo", tags=["demo"])

EVENTS = [
    {"id": "E240731001", "level": "high", "title": "儿童单独涉水", "bay": "3号湾区", "source": "游客求助", "status": "待派单", "time": "15:28"},
    {"id": "E240731002", "level": "medium", "title": "救生设施损坏", "bay": "5号湾区", "source": "安全上报", "status": "待确认", "time": "15:22"},
    {"id": "E240731003", "level": "high", "title": "禁泳区闯入", "bay": "2号湾区", "source": "AI预警", "status": "已派单", "time": "15:16"},
]

class EmergencyHelpIn(BaseModel):
    bay: str = "3号湾区"
    latitude: float | None = None
    longitude: float | None = None

@router.get("", response_class=HTMLResponse)
@router.get("/", response_class=HTMLResponse)
def demo_page():
    return """
<!doctype html><html lang="zh-CN"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>江滩智防后端演示</title>
<style>
body{margin:0;background:#f4f8fb;color:#142238;font-family:-apple-system,BlinkMacSystemFont,'Microsoft YaHei',sans-serif}.shell{max-width:1040px;margin:0 auto;padding:36px 24px}.hero{padding:28px;border-radius:18px;color:#fff;background:linear-gradient(135deg,#087b8f,#13a58f 58%,#f59b42);box-shadow:0 16px 36px rgba(13,127,137,.18)}h1{margin:0;font-size:34px}.hero p{margin:10px 0 0;color:rgba(255,255,255,.86)}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:18px 0}.card,.event{background:#fff;border-radius:14px;padding:18px;box-shadow:0 10px 24px rgba(30,61,91,.08)}.card span{display:block;color:#728197;font-size:14px}.card strong{display:block;margin-top:8px;font-size:28px;color:#0b6570}.events{display:grid;gap:12px}.event{border-left:5px solid #22c7b4}.event.high{border-left-color:#f06b42}.event.medium{border-left-color:#f4ad42}.event h3{margin:0 0 8px;font-size:18px}.event p{margin:0;color:#66788f}.links{display:flex;gap:12px;margin-top:18px}.links a{color:#0b6570;background:#e6f6f4;border-radius:10px;padding:10px 14px;text-decoration:none;font-weight:700}@media(max-width:760px){.grid{grid-template-columns:repeat(2,1fr)}}
</style></head><body><main class="shell"><section class="hero"><h1>江滩智防后端演示</h1><p>FastAPI 演示接口已运行，可用于展示风险事件、统计数据和一键求助链路。</p><div class="links"><a href="/docs">Swagger 文档</a><a href="/api/demo/overview">JSON 数据</a></div></section><section id="stats" class="grid"></section><section><h2>实时险情</h2><div id="events" class="events"></div></section></main><script>
fetch('/api/demo/overview').then(r=>r.json()).then(data=>{const s=data.stats;document.getElementById('stats').innerHTML=[['今日险情',s.today_events+' 起'],['待处置任务',s.pending_orders+' 单'],['在线巡防',s.online_staff+' 人'],['平均响应',s.avg_response_minutes+' 分钟']].map(i=>`<article class="card"><span>${i[0]}</span><strong>${i[1]}</strong></article>`).join('');document.getElementById('events').innerHTML=data.events.map(e=>`<article class="event ${e.level}"><h3>${e.title}</h3><p>${e.bay} · ${e.source} · ${e.status} · ${e.time}</p></article>`).join('')})
</script></body></html>
"""

@router.get("/overview")
def overview():
    pending = len([item for item in EVENTS if item["status"] != "已完成"])
    return {
        "project": "江滩智防",
        "subtitle": "两滩七湾安全指挥舱",
        "stats": {"today_events": len(EVENTS) + 14, "pending_orders": pending, "online_staff": 12, "avg_response_minutes": 2.6, "completion_rate": 92},
        "events": EVENTS,
        "patrol_staff": ["王队", "李敏", "陈安"],
    }

@router.get("/events")
def list_events():
    return {"items": EVENTS}

@router.post("/emergency/help")
def create_emergency(payload: EmergencyHelpIn):
    event = {
        "id": f"SOS{datetime.now().strftime('%H%M%S')}",
        "level": "high",
        "title": "游客长按一键求助",
        "bay": payload.bay,
        "source": "游客求助",
        "status": "待派单",
        "time": "刚刚",
        "latitude": payload.latitude,
        "longitude": payload.longitude,
    }
    EVENTS.insert(0, event)
    return {"event": event, "message": "求助已发送，系统已生成高风险险情"}
