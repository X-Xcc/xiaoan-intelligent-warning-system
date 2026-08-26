from pathlib import Path

from PIL import Image


EXPORT = Path(r"D:\CICSIC\ppt_analysis\optimized_export")
OUT = Path(r"D:\CICSIC\ppt_analysis\style_assets")


def crop(src, name, box):
    im = Image.open(src).convert("RGB")
    out = im.crop(box)
    path = OUT / name
    out.save(path, quality=95)
    print(path)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    slide32 = EXPORT / "幻灯片32.PNG"
    slide34 = EXPORT / "幻灯片34.PNG"
    slide40 = EXPORT / "幻灯片40.PNG"
    slide33 = EXPORT / "幻灯片33.PNG"

    # Top-right college mark from a finished page.
    crop(slide32, "college_mark.png", (1240, 35, 1855, 150))
    # Finished-page visual assets to make earlier technology slides feel evidence-based.
    crop(slide32, "web_command_screenshot.png", (1090, 215, 1775, 970))
    crop(slide34, "map_product_screenshot.png", (590, 215, 1305, 875))
    crop(slide40, "prototype_results_screenshot.png", (120, 255, 1840, 930))
    crop(slide33, "model_chart_screenshot.png", (1065, 165, 1815, 600))
    crop(slide33, "confidence_curve_screenshot.png", (125, 555, 875, 1005))


if __name__ == "__main__":
    main()
