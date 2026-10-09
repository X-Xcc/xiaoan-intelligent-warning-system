"""Verify Chinese image exports and create a PNG-only delivery archive."""
from pathlib import Path
import json
import re
import sys
import zipfile
from PIL import Image, ImageDraw, ImageFont
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
IMAGE_ROOT = ROOT / '中文图片'


def main():
    entries = json.loads((ROOT / 'audit' / 'chinese_image_texts.json').read_text(encoding='utf-8'))
    allowed = {'mAP', 'AP', 'S1', 'S2', 'S3', 'YOLOv8n', 'YOLOv8', 'Qwen', 'TP', 'FP', 'FN',
               'a', 'b', 'c', 'd', 'e'}
    unexpected = sorted({word for entry in entries for value in entry['texts']
                         for word in re.findall(r'[A-Za-z][A-Za-z0-9]*', value) if word not in allowed})
    assert not unexpected, f'Untranslated visible text: {unexpected}'
    clipped = {entry['image']: entry.get('clipped_chinese_text') for entry in entries if entry.get('clipped_chinese_text')}
    assert not clipped, f'Clipped Chinese text: {clipped}'
    paths = sorted(IMAGE_ROOT.rglob('*.png'))
    assert len(paths) == len(entries) == 20
    stats = []
    for path in paths:
        with Image.open(path) as img:
            img.verify()
        with Image.open(path) as img:
            assert all(abs(v - 300) < .1 for v in img.info.get('dpi', (0, 0)))
            rgb = np.asarray(img.convert('RGB'))
            assert (rgb[0, 0] == 255).all()
            if path.parent.name == '三线表':
                assert np.array_equal(rgb[:, :, 0], rgb[:, :, 1])
                assert np.array_equal(rgb[:, :, 1], rgb[:, :, 2])
            stats.append({'path': str(path.relative_to(IMAGE_ROOT)), 'width': img.width,
                          'height': img.height, 'dpi': img.info['dpi']})
    font = ImageFont.truetype(r'C:\Windows\Fonts\simsun.ttc', 23)
    for page, start in enumerate(range(0, len(paths), 6), 1):
        sheet = Image.new('RGB', (1600, 1740), 'white')
        draw = ImageDraw.Draw(sheet)
        for idx, path in enumerate(paths[start:start+6]):
            x, y = (idx % 2) * 800, (idx // 2) * 580
            draw.text((x + 15, y + 10), path.parent.name + ' / ' + path.stem, font=font, fill='black')
            with Image.open(path) as img:
                img = img.convert('RGB')
                img.thumbnail((780, 525))
                sheet.paste(img, (x + (800 - img.width) // 2, y + 45))
        sheet.save(ROOT / 'audit' / f'chinese_contact_{page}.png')
    report = {'status': 'PASS', 'png_count': len(paths), 'untranslated_words': unexpected,
              'technical_names_retained': sorted(allowed), 'images': stats}
    if '--package' in sys.argv:
        dest = ROOT.parent / 'YOLOv8_全中文论文图片包.zip'
        with zipfile.ZipFile(dest, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            for path in paths:
                archive.write(path, str(Path('全中文论文图片') / path.relative_to(IMAGE_ROOT)))
        with zipfile.ZipFile(dest) as archive:
            assert len(archive.namelist()) == 20
            assert all(name.endswith('.png') for name in archive.namelist())
            assert archive.testzip() is None
        report['archive'] = str(dest)
        report['archive_bytes'] = dest.stat().st_size
        report['png_only_archive'] = True
    (ROOT / 'audit' / 'chinese_export_verification.json').write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'PASS: {len(paths)} Chinese PNG images, 300 dpi; only technical names remain in Latin characters.')
    if '--package' in sys.argv:
        print(f'PNG-only archive size: {dest.stat().st_size} bytes.')


if __name__ == '__main__':
    main()
