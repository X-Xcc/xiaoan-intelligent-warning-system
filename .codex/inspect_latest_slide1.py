from pathlib import Path
from zipfile import ZipFile
import re

root = Path(r"D:\xx\Desktop")
targets = [p for p in root.glob("*.pptx") if "底部重写" in p.name and not p.name.startswith("~$")]
if not targets:
    raise SystemExit("no target pptx found")
p = sorted(targets, key=lambda p: p.stat().st_mtime, reverse=True)[0]
print("FILE", p)
with ZipFile(p) as z:
    xml = z.read("ppt/slides/slide1.xml").decode("utf-8", errors="ignore")
    texts = re.findall(r"<a:t>(.*?)</a:t>", xml)
    joined = " | ".join(texts)
    print(joined.encode("unicode_escape").decode("ascii"))
    for phrase in [
        "场景痛点",
        "夜市客流密集、流动性强",
        "识别难、响应慢、协同弱",
        "产品闭环",
        "群众端求助 + 巡防端处置",
        "后台研判派单、留证复盘",
        "落地路径",
        "单点轻量试点、快速验证",
        "接入存量设备、降低成本",
    ]:
        print(phrase.encode("unicode_escape").decode("ascii"), phrase in joined)
