"""Exercise only the public config router, without DB, local .env or devices."""
import importlib.util
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

from fastapi import FastAPI

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class DeploymentConfigTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.assertIsNotNone(
            importlib.util.find_spec("app.api.routes.deployment_config"),
            "The public deployment config router is missing",
        )
        from app.api.routes.deployment_config import router

        self.app = FastAPI()
        self.app.include_router(router, prefix="/api")
        self.enterContext(patch.dict(os.environ, {}, clear=True))

    async def request_config(self):
        messages = []

        async def receive():
            return {"type": "http.request", "body": b"", "more_body": False}

        async def send(message):
            messages.append(message)

        await self.app(
            {
                "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
                "method": "GET", "scheme": "http",
                "path": "/api/deployment/client-config",
                "raw_path": b"/api/deployment/client-config",
                "query_string": b"", "root_path": "", "headers": [],
                "client": ("127.0.0.1", 1), "server": ("offline.test", 80),
            },
            receive, send,
        )
        start = next(item for item in messages if item["type"] == "http.response.start")
        body = b"".join(item.get("body", b"") for item in messages if item["type"] == "http.response.body")
        self.assertEqual(start["status"], 200)
        self.assertEqual(dict(start["headers"])[b"cache-control"], b"no-store")
        return json.loads(body)

    async def test_public_endpoint_returns_only_browser_map_allowlist(self):
        os.environ.update({
            "XIAOAN_AMAP_KEY": " browser-map-key ",
            "XIAOAN_AMAP_SECURITY_JS_CODE": " browser-security-code ",
            "XIAOAN_AMAP_SERVER_KEY": "private-map-server-key",
            "XIAOAN_MODEL_API_KEY": "private-model-key",
            "SECURITY_VLM_API_KEY": "private-vlm-key",
            "OPENAI_API_KEY": "private-ai-key",
            "CICSIC_ADMIN_TOKEN": "private-admin-token",
            "DATABASE_URL": "private-database-url",
            "WECHAT_APP_SECRET": "private-wechat-secret",
        })
        self.assertEqual(await self.request_config(), {
            "amap": {"key": "browser-map-key", "securityJsCode": "browser-security-code"},
        })

    async def test_missing_map_config_is_empty_and_does_not_use_build_time_env(self):
        os.environ.update({
            "VITE_AMAP_KEY": "old-build-key",
            "VITE_AMAP_SECURITY_JS_CODE": "old-build-code",
        })
        self.assertEqual(await self.request_config(), {"amap": {"key": "", "securityJsCode": ""}})

    async def test_optional_security_code_and_blank_values(self):
        os.environ["XIAOAN_AMAP_KEY"] = "browser-map-key"
        self.assertEqual(await self.request_config(), {
            "amap": {"key": "browser-map-key", "securityJsCode": ""},
        })
        os.environ.update({"XIAOAN_AMAP_KEY": " \t ", "XIAOAN_AMAP_SECURITY_JS_CODE": "\n"})
        self.assertEqual(await self.request_config(), {"amap": {"key": "", "securityJsCode": ""}})

    async def test_configuration_is_read_at_request_time_not_import_time(self):
        await self.request_config()
        os.environ["XIAOAN_AMAP_KEY"] = "replacement-browser-key"
        self.assertEqual((await self.request_config())["amap"]["key"], "replacement-browser-key")


if __name__ == "__main__":
    unittest.main()
