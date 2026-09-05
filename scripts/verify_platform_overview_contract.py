"""窗口 01：平台总览接口契约验证。"""

from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SERVER = ROOT / "server"
if str(SERVER) not in sys.path:
    sys.path.insert(0, str(SERVER))

from app.api.routes.platform import _runtime_snapshot


def main() -> None:
    snapshot = _runtime_snapshot()

    assert snapshot["project"] == "公安大数据与 AI 平台"
    assert snapshot["subtitle"] == "统一警务数据与智能应用底座"
    assert {"name", "unit", "role"} <= set(snapshot["organization"])
    assert {
        "today_events",
        "pending_orders",
        "online_staff",
        "completion_rate",
        "open_cases",
        "community_tasks",
        "training_records",
    } <= set(snapshot["stats"])

    assert [item["key"] for item in snapshot["businessSystems"]] == [
        "alarm",
        "case",
        "community",
        "training",
        "mobile",
    ]

    domains = snapshot["dataCatalog"]["domains"]
    assert snapshot["dataCatalog"]["domainCount"] == 6
    assert [item["key"] for item in domains] == [
        "org",
        "alarm",
        "case",
        "person",
        "community",
        "training",
    ]
    for domain in domains:
        assert {"key", "label", "description", "objects", "status"} <= set(domain)
    assert snapshot["dataCatalog"]["objectCount"] == sum(
        len(item["objects"]) for item in domains
    )

    assert [item["label"] for item in snapshot["eventChain"]] == [
        "接警",
        "分类分级",
        "派警",
        "移动签收",
        "案件办理",
        "社区闭环",
        "训练复盘",
    ]
    for node in snapshot["eventChain"]:
        assert {"label", "count", "status"} <= set(node)

    print("platform overview contract verification passed")


if __name__ == "__main__":
    main()
