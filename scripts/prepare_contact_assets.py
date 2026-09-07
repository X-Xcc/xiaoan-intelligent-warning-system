"""Validate the generated scene set and prepare local web assets and QC sheets."""

import hashlib
import io
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFont, ImageStat, PngImagePlugin

ROOT = Path(__file__).resolve().parents[1]
CONFIG = json.loads((ROOT / "docs/contact-review-scenes.json").read_text(encoding="utf-8"))
SOURCE = ROOT / "output/imagegen/contact-review"
PUBLIC = ROOT / "apps/dashboard/public/contact-review-assets"
QC = ROOT / ".verify/contact-review"

def surveillance_frame(image, scene):
    image = ImageEnhance.Color(image).enhance(0.82)
    image = ImageEnhance.Contrast(image).enhance(0.94)
    smaller = image.resize((1024, round(image.height * 1024 / image.width)), Image.Resampling.BILINEAR)
    compressed = io.BytesIO()
    smaller.save(compressed, format="JPEG", quality=76)
    compressed.seek(0)
    with Image.open(compressed) as decoded:
        image = decoded.resize(image.size, Image.Resampling.BILINEAR).convert("RGB")
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 25)
    label = f"{scene['camera']}   {scene['occurredAt']}:00"
    # Replace model-invented camera/date overlays with deterministic demo metadata.
    draw.rectangle((0, 0, image.width, 80), fill="#1b2225")
    draw.text((24, 26), label, font=font, fill="white")
    draw.text((image.width - 100, 26), "DEMO", font=font, fill="#b5cdb4")
    draw.text((24, image.height - 48), "DEMO / SYNTHETIC FRAME", font=font, fill="#e0e7dd", stroke_width=2, stroke_fill="#182020")
    return image


def main():
    files = [SOURCE / f"contact-{scene['index']:02d}.png" for scene in CONFIG["scenes"]]
    missing = [str(file) for file in files if not file.is_file()]
    if missing:
        raise SystemExit("Missing scene assets:\n" + "\n".join(missing))
    if len(files) != 20 or sum(s["companionId"] == "P-2048" for s in CONFIG["scenes"]) != 11:
        raise SystemExit("Scene distribution must be 20 total with 11 recurring roles.")
    QC.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    hashes = set()
    records = []
    font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 18)
    for scene, file in zip(CONFIG["scenes"], files):
        with Image.open(file) as raw:
            raw.load()
            image = raw.convert("RGB")
        if image.width < 1024 or image.height < 768 or min(ImageStat.Stat(image).stddev) < 10:
            raise SystemExit(f"Blank or undersized image: {file}")
        digest = hashlib.sha256(image.tobytes()).hexdigest()
        if digest in hashes:
            raise SystemExit(f"Duplicate generated scene: {file}")
        hashes.add(digest)
        image = surveillance_frame(image, scene)
        info = PngImagePlugin.PngInfo()
        info.add_itxt("Description", "AI-generated synthetic demonstration. Not a real camera record or evidence.")
        info.add_itxt("Model", CONFIG["model"])
        info.add_itxt("DemoRecord", json.dumps(scene, ensure_ascii=False))
        image.save(PUBLIC / file.name, pnginfo=info, optimize=True)
        thumb = image.copy()
        thumb.thumbnail((640, 480))
        thumb.save(PUBLIC / f"{file.stem}.thumb.webp", quality=84)
        records.append({
            "recordId": f"CR-{scene['index']:03d}", "filename": file.name,
            "companionId": scene["companionId"], "sha256Pixels": digest,
            "width": image.width, "height": image.height,
            "synthetic": True, "model": CONFIG["model"],
        })
    for offset in range(0, 20, 5):
        sheet = Image.new("RGB", (1000, 1095), "#edf0f4")
        drawing = ImageDraw.Draw(sheet)
        for tile, file in enumerate(files[offset:offset + 5]):
            with Image.open(PUBLIC / file.name) as raw:
                preview = raw.convert("RGB")
                preview.thumbnail((480, 320))
            x, y = 10 + (tile % 2) * 500, 10 + (tile // 2) * 365
            sheet.paste(preview, (x, y))
            scene = CONFIG["scenes"][offset + tile]
            drawing.text((x, y + 325), f"{file.stem}  |  {scene['companionId']}  |  SYNTHETIC", font=font, fill="#243443")
        sheet.save(QC / f"contact-sheet-{offset // 5 + 1}.jpg", quality=92)
    manifest = {
        "synthetic": True, "source": "Generated with user-authorized reference and fictional companion roles",
        "model": CONFIG["model"], "count": len(records), "recurringCompanionCount": 11, "records": records,
    }
    (PUBLIC / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"prepared": len(records), "uniquePixels": len(hashes), "recurring": 11, "public": str(PUBLIC)}, indent=2))


if __name__ == "__main__":
    main()
