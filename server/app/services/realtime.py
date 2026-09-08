from __future__ import annotations

import json

from fastapi import WebSocket


class RealtimeHub:
    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self._connections.discard(websocket)

    async def publish(self, message: dict) -> None:
        payload = json.dumps(message, ensure_ascii=False)
        stale: list[WebSocket] = []
        from app.services import command_workflow, event_store
        event_id = message.get("eventId")
        protected = bool(event_id and command_workflow.is_command(event_id))
        event = event_store.get_event(event_id, include_command=True) if protected else None
        for websocket in self._connections:
            try:
                if protected:
                    authorization = websocket.headers.get("authorization", "")
                    token = authorization[7:] if authorization.startswith("Bearer ") else websocket.query_params.get("token")
                    actor = command_workflow.actor_for_token(token, required=False)
                    if not command_workflow.can_read(actor, event):
                        continue
                await websocket.send_text(payload)
            except Exception:
                stale.append(websocket)
        for websocket in stale:
            self.disconnect(websocket)


realtime_hub = RealtimeHub()
