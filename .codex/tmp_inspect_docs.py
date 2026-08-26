from pathlib import Path
from zipfile import ZipFile
import re


def docx_text(path: Path) -> str:
    with ZipFile(path) as z:
        parts = []
        for name in ("word/document.xml",):
            if name in z.namelist():
                xml = z.read(name).decode("utf-8", errors="ignore")
                parts.extend(re.findall(r"<w:t[^>]*>(.*?)</w:t>", xml))
        return "\n".join(parts)


def main():
    root = Path(r"D:\CICSIC\docs")
    for p in sorted(root.glob("*.docx")):
        print(f"FILE {p.name}")
        txt = docx_text(p)
        print(txt.encode("unicode_escape").decode("ascii"))
        print("===END===")


if __name__ == "__main__":
    main()
