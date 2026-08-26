from pathlib import Path
from zipfile import ZipFile
import re

pptx = sorted([p for p in Path(r"D:\xx\Desktop").glob("*.pptx") if not p.name.startswith("~$")], key=lambda p: p.stat().st_mtime, reverse=True)[0]
with ZipFile(pptx) as z:
    pres = z.read("ppt/presentation.xml").decode("utf-8", errors="ignore")
    ids = re.findall(r"<p:sldId[^>]*r:id=\"([^\"]+)\"", pres)
    print("sldId count", len(ids))
    rels = z.read("ppt/_rels/presentation.xml.rels").decode("utf-8", errors="ignore")
    print("rels ids", re.findall(r'Id=\"([^\"]+)\"', rels))
