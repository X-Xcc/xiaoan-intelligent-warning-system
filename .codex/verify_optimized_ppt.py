from pathlib import Path
from zipfile import ZipFile
import re


def main():
    p = Path(r"D:\xx\Desktop\新建 PPTX 演示文稿-优化版.pptx")
    print("exists", p.exists())
    with ZipFile(p) as z:
        slides = sorted(
            [n for n in z.namelist() if n.startswith("ppt/slides/slide") and n.endswith(".xml")],
            key=lambda s: int(Path(s).stem.replace("slide", "")),
        )
        print("slides", len(slides))
        all_text = []
        for s in slides:
            idx = int(Path(s).stem.replace("slide", ""))
            xml = z.read(s).decode("utf-8", errors="ignore")
            texts = re.findall(r"<a:t>(.*?)</a:t>", xml)
            joined = " | ".join(texts)
            all_text.append(joined)
            print(f"---SLIDE {idx}---")
            print(joined.encode("unicode_escape").decode("ascii"))
        blob = "\n".join(all_text)
        checks = [
            "夜市智防助力构建智慧治理新生态",
            "缺少夜市闭环",
            "夜市试点成本高",
            "求助-派单-到场-留证",
            "统筹项目立项、产品路线和版本迭代",
            "完整协作链",
            "技术把关",
            "基层治理专家",
            "法务证据专家",
        ]
        for check in checks:
            print(check.encode("unicode_escape").decode("ascii"), check in blob)
        print("placeholder_xx", bool(re.search(r"\bxx+\b", blob)))


if __name__ == "__main__":
    main()
