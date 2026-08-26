from pathlib import Path
from zipfile import ZipFile
import xml.etree.ElementTree as ET
import re


def check(path: Path):
    required = [
        "[Content_Types].xml",
        "ppt/presentation.xml",
        "ppt/_rels/presentation.xml.rels",
    ]
    with ZipFile(path) as z:
        names = set(z.namelist())
        missing = [name for name in required if name not in names]
        print("missing_required", missing)
        xml_files = [n for n in names if n.endswith(".xml") or n.endswith(".rels")]
        bad = []
        for name in xml_files:
            try:
                ET.fromstring(z.read(name))
            except Exception as exc:
                bad.append((name, str(exc)))
        print("xml_parse_errors", len(bad))
        for name, exc in bad[:20]:
            print(name, exc)
        slides = sorted(
            [n for n in names if re.fullmatch(r"ppt/slides/slide\d+\.xml", n)],
            key=lambda s: int(Path(s).stem.replace("slide", "")),
        )
        print("slides", len(slides))
        blob = "\n".join(z.read(s).decode("utf-8", errors="ignore") for s in slides)
        print("has_xx_placeholder", bool(re.search(r"<a:t>x{2,}</a:t>", blob)))


if __name__ == "__main__":
    root = Path(r"D:\xx\Desktop")
    targets = [p for p in root.glob("*.pptx") if "底部重写" in p.name and not p.name.startswith("~$")]
    check(sorted(targets, key=lambda p: p.stat().st_mtime, reverse=True)[0] if targets else root / "新建 PPTX 演示文稿-优化版.pptx")
