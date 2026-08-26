from pathlib import Path

from PIL import Image, ImageOps, ImageEnhance


SRC = Path(r"D:\CICSIC\ppt_analysis\pdf_png")
OUT = Path(r"D:\CICSIC\ppt_analysis\selected_certs")

SELECTED = {
    "01_集群调度管理": "cert-1.png",
    "02_大数据集成运维": "cert-2.png",
    "03_智能巡检集成": "cert-4.png",
    "backup_雷达定位测试": "cert-3.png",
}


def trim_whitespace(im: Image.Image) -> Image.Image:
    rgb = im.convert("RGB")
    bg = Image.new("RGB", rgb.size, "white")
    diff = ImageOps.invert(ImageOps.grayscale(ImageChopsSafe.difference(rgb, bg)))
    bbox = ImageOps.invert(diff).getbbox()
    if not bbox:
        return rgb
    left, top, right, bottom = bbox
    pad = 24
    return rgb.crop(
        (
            max(0, left - pad),
            max(0, top - pad),
            min(rgb.width, right + pad),
            min(rgb.height, bottom + pad),
        )
    )


class ImageChopsSafe:
    @staticmethod
    def difference(a, b):
        from PIL import ImageChops

        return ImageChops.difference(a, b)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for label, filename in SELECTED.items():
        im = Image.open(SRC / filename).convert("RGB")
        cropped = trim_whitespace(im)
        cropped = ImageEnhance.Contrast(cropped).enhance(1.05)
        cropped.save(OUT / f"{label}.png")
        thumb = cropped.copy()
        thumb.thumbnail((520, 720))
        thumb.save(OUT / f"{label}_thumb.png")
        print(OUT / f"{label}.png")


if __name__ == "__main__":
    main()
