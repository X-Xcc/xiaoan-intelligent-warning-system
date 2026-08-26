from pathlib import Path
import subprocess
import sys


def main():
    py = Path(r"C:\Users\xx\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe")
    validate = Path(r"C:\Users\xx\.agents\skills\pptx\scripts\office\validate.py")
    original = Path(r"D:\xx\Desktop\新建 PPTX 演示文稿.pptx")
    output = Path(r"D:\xx\Desktop\新建 PPTX 演示文稿-优化版.pptx")
    cmd = [str(py), str(validate), str(output), "--original", str(original)]
    result = subprocess.run(cmd, text=True, capture_output=True, encoding="utf-8", errors="replace")
    print("returncode", result.returncode)
    print(result.stdout)
    print(result.stderr, file=sys.stderr)
    raise SystemExit(result.returncode)


if __name__ == "__main__":
    main()
