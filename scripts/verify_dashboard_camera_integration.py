from pathlib import Path


SOURCE = Path(__file__).resolve().parents[1] / "apps" / "dashboard" / "src" / "pages" / "DashboardApp.tsx"
ADMIN_SOURCE = Path(__file__).resolve().parents[1] / "apps" / "dashboard" / "src" / "pages" / "AdminConsolePage.tsx"


def main() -> None:
    content = SOURCE.read_text(encoding="utf-8")
    required_fragments = (
        "navigator.mediaDevices.getUserMedia",
        "localVideoRef",
        "/security-ai/yolo-reviews",
        "runVisionReview",
        "千问视觉复核",
        "摄像头",
        "Modal",
        "fightAlertOpen",
        "event.altKey && event.key.toLowerCase() === 'z'",
        "检测到两人肢体冲突",
        "立即派单",
        "fight-alarm-modal",
    )
    missing = [fragment for fragment in required_fragments if fragment not in content]
    if missing:
        raise AssertionError(f"dashboard camera integration missing: {missing}")

    admin_content = ADMIN_SOURCE.read_text(encoding="utf-8")
    voice_fragments = (
        "voice-broadcast-settings",
        "小安语音",
        "fightAlertTemplate",
        "保存播报设置",
    )
    missing_voice = [fragment for fragment in voice_fragments if fragment not in admin_content]
    if missing_voice:
        raise AssertionError(f"dashboard voice settings missing: {missing_voice}")

    dashboard_voice_fragments = (
        "VoiceBroadcastSettings",
        "speakXiaoAn",
        "fightAlertEnabled",
        "小安提示",
    )
    missing_dashboard_voice = [fragment for fragment in dashboard_voice_fragments if fragment not in content]
    if missing_dashboard_voice:
        raise AssertionError(f"dashboard voice playback missing: {missing_dashboard_voice}")
    print("dashboard_camera_integration ok")


if __name__ == "__main__":
    main()
