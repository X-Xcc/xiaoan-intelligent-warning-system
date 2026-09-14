from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from app.services import auth_store


router = APIRouter(prefix="/auth", tags=["auth"])

WECHAT_CODE2SESSION_URL = "https://api.weixin.qq.com/sns/jscode2session"


class WechatLoginIn(BaseModel):
    code: str = Field(min_length=1)


def _wechat_code2session(code: str) -> dict:
    appid = os.getenv("WECHAT_APPID", "wxdd3f448369e6ca9f")
    secret = os.getenv("WECHAT_APP_SECRET")
    if not secret:
        if os.getenv("APP_ENV") != "development":
            raise HTTPException(status_code=503, detail="Wechat AppSecret is not configured")
        return {
            "openid": f"dev_{code[-12:]}",
            "session_key": None,
            "unionid": None,
            "dev": True,
        }

    params = urllib.parse.urlencode(
        {
            "appid": appid,
            "secret": secret,
            "js_code": code,
            "grant_type": "authorization_code",
        }
    )
    with urllib.request.urlopen(f"{WECHAT_CODE2SESSION_URL}?{params}", timeout=8) as response:
        data = json.loads(response.read().decode("utf-8"))

    if data.get("errcode"):
        raise HTTPException(status_code=401, detail=data.get("errmsg", "Wechat login failed"))
    if not data.get("openid"):
        raise HTTPException(status_code=401, detail="Wechat login did not return openid")
    return data


@router.post("/wechat-login")
def wechat_login(payload: WechatLoginIn):
    try:
        wechat_session = _wechat_code2session(payload.code)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Wechat login service unavailable") from exc

    session = auth_store.upsert_wechat_user(
        openid=wechat_session["openid"],
        session_key=wechat_session.get("session_key"),
        unionid=wechat_session.get("unionid"),
    )
    return {
        **session,
        "provider": "wechat",
        "dev": bool(wechat_session.get("dev")),
    }


@router.get("/me")
def me(authorization: str | None = Header(default=None)):
    return {"user": auth_store.open_access_user()}
