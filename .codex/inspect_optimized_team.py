from pathlib import Path
from zipfile import ZipFile
import re

root = Path(r"D:\xx\Desktop")
targets = [p for p in root.glob("*.pptx") if "优化版" in p.name and not p.name.startswith("~$")]
if not targets:
    raise SystemExit("no optimized pptx found")
p = sorted(targets, key=lambda p: p.stat().st_mtime, reverse=True)[0]
print("FILE", p)
with ZipFile(p) as z:
    slides = sorted([n for n in z.namelist() if n.startswith("ppt/slides/slide") and n.endswith(".xml")], key=lambda s: int(re.search(r"(\d+)", s).group(1)))
    for s in slides:
        idx = int(re.search(r"(\d+)", s).group(1))
        if idx != 3:
            continue
        xml = z.read(s).decode("utf-8", errors="ignore")
        texts = re.findall(r"<a:t>(.*?)</a:t>", xml)
        print(" | ".join(texts).encode("unicode_escape").decode("ascii"))
