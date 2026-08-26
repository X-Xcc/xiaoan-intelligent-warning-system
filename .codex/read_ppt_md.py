from pathlib import Path


def main():
    path = Path(r"D:\浏览器下载\新建 PPTX 演示文稿.md")
    text = path.read_text(encoding="utf-8", errors="replace")
    print("exists", path.exists())
    print("chars", len(text))
    print(text[:20000].encode("unicode_escape").decode("ascii"))


if __name__ == "__main__":
    main()
