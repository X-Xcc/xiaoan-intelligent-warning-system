from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read_text(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def read_json(path: str) -> dict:
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def require_absent(text: str, tokens: list[str], label: str, failures: list[str]) -> None:
    for token in tokens:
        if token in text:
            failures.append(f"{label} still contains {token}.")


def main() -> None:
    failures: list[str] = []

    map_text = read_text("apps/dashboard/src/components/NanchangAmapMap.tsx")
    if "mapReady" in map_text:
        failures.append("NanchangAmapMap still keeps a separate mapReady state.")
    if "setMapReady" in map_text:
        failures.append("NanchangAmapMap still writes mapReady.")
    if "state !== 'ready'" not in map_text:
        failures.append("NanchangAmapMap does not use state as the single ready gate.")
    if "setState(AMAP_KEY ? 'loading' : 'missing-key')" not in map_text:
        failures.append("NanchangAmapMap cleanup does not restore its lifecycle state.")

    hook_text = read_text("apps/miniprogram/src/hooks/useSafetyEvents.ts")
    if "demoEvents" in hook_text:
        failures.append("useSafetyEvents still contains demoEvents fallback data.")
    if "setEvents(demoEvents)" in hook_text:
        failures.append("useSafetyEvents still restores demo events on fetch failure.")

    api_text = read_text("apps/miniprogram/src/utils/api.ts")
    for token in ["AUTH_USER_KEY", "getAuthUser", "clearAuthSession"]:
        if token in api_text:
            failures.append(f"api.ts still exposes {token}.")
    if "setStorageSync(AUTH_USER_KEY" in api_text:
        failures.append("api.ts still persists cached auth user data.")
    if "export type WechatAuthUser" in api_text:
        failures.append("api.ts still exports WechatAuthUser.")
    if "export function getAuthToken" in api_text:
        failures.append("api.ts still exports getAuthToken.")

    detail_text = read_text("apps/miniprogram/src/data/detail.ts")
    require_absent(
        detail_text,
        ["export type DetailMeta", "export const detailFallback"],
        "detail.ts",
        failures,
    )

    i18n_text = read_text("apps/miniprogram/src/i18n/index.ts")
    require_absent(
        i18n_text,
        ["export type LocaleOption", "export const getLocale ="],
        "i18n/index.ts",
        failures,
    )

    if (ROOT / "apps/miniprogram/src/utils/time.ts").exists():
        failures.append("apps/miniprogram/src/utils/time.ts is still present.")

    pkg = read_json("package.json")
    for section in ("dependencies", "devDependencies"):
        for dep in ("@ant-design/icons", "antd", "@babel/types", "hls.js"):
            if dep in pkg.get(section, {}):
                failures.append(f"package.json still declares {dep} in {section}.")

    dashboard_pkg = read_json("apps/dashboard/package.json")
    dashboard_unused = {
        "dependencies": (
            "@ant-design/icons",
            "@react-three/drei",
            "@react-three/fiber",
            "echarts",
            "framer-motion",
            "leaflet",
            "react-leaflet",
            "three",
            "zustand",
        ),
        "devDependencies": (
            "@types/leaflet",
            "@types/three",
            "autoprefixer",
            "postcss",
            "tailwindcss",
        ),
    }
    for section, deps in dashboard_unused.items():
        for dep in deps:
            if dep in dashboard_pkg.get(section, {}):
                failures.append(f"apps/dashboard/package.json still declares {dep} in {section}.")

    miniprogram_pkg = read_json("apps/miniprogram/package.json")
    for dep in ("@babel/plugin-transform-class-properties", "hls.js"):
        if dep in miniprogram_pkg.get("devDependencies", {}):
            failures.append(f"apps/miniprogram/package.json still declares {dep}.")

    if failures:
        raise SystemExit("Simplification checks failed:\n- " + "\n- ".join(failures))


if __name__ == "__main__":
    main()
