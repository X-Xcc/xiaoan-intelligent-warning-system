from pathlib import Path

root = Path(r"D:\xx\Desktop")
for p in sorted(root.iterdir()):
    if p.suffix.lower() in {".pptx", ".md"}:
        print(p.name)
