"""Read-only inventory and exact-duplicate audit of local YOLO datasets."""
from pathlib import Path
from collections import Counter, defaultdict
import hashlib
import json

BASE = Path(r'D:\Dev\yolov8_security')
OUT = Path(r'D:\CICSIC\yolov8_paper_simulation\audit')
EXTS = {'.jpg', '.jpeg', '.png', '.bmp', '.webp', '.tif', '.tiff'}
roots = [BASE / 'detection/datasets', BASE / 'datasets']
datasets = {}
hash_sets = {}
for root in roots:
    for dataset in sorted(p for p in root.iterdir() if p.is_dir()):
        key = dataset.relative_to(BASE).as_posix()
        report = {'path': str(dataset), 'splits': {}, 'yaml': {p.name: p.read_text(encoding='utf-8-sig') for p in dataset.glob('*.yaml')}}
        hash_sets[key] = set()
        for split in ['train', 'val', 'valid', 'test']:
            images_dir = dataset / 'images' / split
            labels_dir = dataset / 'labels' / split
            if not images_dir.exists():
                continue
            images = sorted(p for p in images_dir.rglob('*') if p.suffix.lower() in EXTS)
            boxes, containing = Counter(), Counter()
            empty = missing = invalid = 0
            hashes = set()
            for image in images:
                hashes.add(hashlib.sha256(image.read_bytes()).hexdigest())
                label = labels_dir / image.relative_to(images_dir).with_suffix('.txt')
                if not label.exists():
                    missing += 1
                    continue
                present = set()
                for raw in label.read_text(encoding='utf-8-sig').splitlines():
                    if not raw.strip():
                        continue
                    parts = raw.split()
                    try:
                        cid = int(parts[0])
                        coords = list(map(float, parts[1:]))
                        if len(coords) != 4 or any(x < 0 or x > 1 for x in coords):
                            invalid += 1
                        boxes[cid] += 1
                        present.add(cid)
                    except (ValueError, IndexError):
                        invalid += 1
                empty += not present
                containing.update(present)
            hash_sets[key + '/' + split] = hashes
            hash_sets[key].update(hashes)
            all_label_boxes = Counter()
            all_label_paths = list(labels_dir.rglob('*.txt'))
            image_stems = {p.relative_to(images_dir).with_suffix('').as_posix() for p in images}
            orphan_labels = [p for p in all_label_paths if p.relative_to(labels_dir).with_suffix('').as_posix() not in image_stems]
            for label in all_label_paths:
                for line in label.read_text(encoding='utf-8-sig').splitlines():
                    if line.strip():
                        all_label_boxes[int(line.split()[0])] += 1
            report['splits'][split] = {
                'image_files': len(images), 'unique_image_sha256': len(hashes),
                'exact_duplicate_files_within_split': len(images) - len(hashes),
                'label_files': len(all_label_paths),
                'orphan_label_files_without_image': len(orphan_labels),
                'all_label_objects_by_class_id': dict(sorted(all_label_boxes.items())),
                'objects_by_class_id': dict(sorted(boxes.items())),
                'images_containing_class_id': dict(sorted(containing.items())),
                'empty_label_images': empty, 'missing_label_images': missing,
                'invalid_label_rows': invalid,
            }
        report['total_image_files'] = sum(s['image_files'] for s in report['splits'].values())
        report['unique_image_sha256'] = len(hash_sets[key])
        report['train_val_exact_hash_overlap'] = len(hash_sets.get(key+'/train',set()) & hash_sets.get(key+'/val',set()))
        datasets[key] = report
        print(key, report['total_image_files'], report['unique_image_sha256'], flush=True)

overlap = []
keys = list(datasets)
for i, a in enumerate(keys):
    for b in keys[i+1:]:
        overlap.append({'dataset_a': a, 'dataset_b': b, 'shared_unique_sha256': len(hash_sets[a] & hash_sets[b])})
all_unique = set().union(*(hash_sets[k] for k in keys))
result = {
    'audit_date': '2026-09-28',
    'method': 'Recursive image-file count; YOLO label rows are object instances; SHA-256 for byte-identical images. All datasets read only.',
    'class_names_actions': {'0': 'fall', '1': 'fight', '2': 'gather', '3': 'suicide'},
    'datasets': datasets, 'cross_dataset_overlap': overlap,
    'total_image_file_entries_all_directories': sum(d['total_image_files'] for d in datasets.values()),
    'unique_sha256_all_directories': len(all_unique),
    'limitations': [
        'Directory totals include derived copies and cannot be interpreted as independent training images.',
        'Exact SHA-256 deduplication does not detect resized/recompressed copies or adjacent video frames.',
        'actions is four-class; actions_person and actions_person_full are five-class; person_full is person-only; coco8 uses COCO labels.',
        'No claim that these current directories equal the historical data seen by a checkpoint.',
        'No real 1000-epoch training or 40000-image four-class dataset is established by this inventory.',
    ],
}
(OUT / 'dataset_audit.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
lines = ['# 本地数据集审计', '', '审计日期：2026-09-28。全程只读；按图像文件计数，标签行按目标实例计数。', '', '| 数据集 | train 图像 | val 图像 | 总文件数 | SHA-256 唯一图像 | train/val 同图哈希数 |', '|---|---:|---:|---:|---:|---:|']
for key, d in datasets.items():
    lines.append(f"| {key} | {d['splits'].get('train',{}).get('image_files',0)} | {d['splits'].get('val',{}).get('image_files',0)} | {d['total_image_files']} | {d['unique_image_sha256']} | {d['train_val_exact_hash_overlap']} |")
lines.extend(['', '## actions 四类标签', '', '| 划分 | 图像数 | fall 目标 | fight 目标 | gather 目标 | suicide 目标 |', '|---|---:|---:|---:|---:|---:|'])
for split, s in datasets['detection/datasets/actions']['splits'].items():
    c = s['objects_by_class_id']
    lines.append(f"| {split} | {s['image_files']} | {c.get(0,0)} | {c.get(1,0)} | {c.get(2,0)} | {c.get(3,0)} |")
lines.extend(['', '上表目标数仅统计当前有对应图像的标签。actions 的 train 有66份孤立标签、val有15份孤立标签。若把所有标签文件纳入，train目标数为 fall80/fight175/gather1/suicide62，val为 fall18/fight47/gather1/suicide15（共81目标）。当前63张验证图像对应65目标，说明文件状态与历史混淆矩阵的81目标依据不同。', '', '## 重叠与解释', '', f"- 所有目录共有 {result['total_image_file_entries_all_directories']:,} 个图像文件条目；全量 SHA-256 去重后 {len(all_unique):,} 个字节唯一图像。", '- prepare_combined_dataset.py 使用 shutil.copy2 复制 action 和 person 数据到混合目录。不能将派生目录相加后宣称四万独立训练图像。', '- actions_person / actions_person_full 为五类（增加 person）；person_full 仅 person；四类任务应以 actions 单独报告。'])
for row in overlap:
    if row['shared_unique_sha256']:
        lines.append(f"- {row['dataset_a']} 与 {row['dataset_b']} 共享 {row['shared_unique_sha256']:,} 个精确图像哈希。")
lines.extend(['', '## 重要局限', '', '- 精确哈希只检验文件字节相同，不排除重编码、缩放复制或视频近邻帧。', '- 当前文件清单不能证明历史训练实际使用的全部数据。', '- 四万余张图像、1000 epoch 必须标为模拟场景设定；不以累计目录文件数充当真实独立样本量。', '- 验证集目标实例数与图像数不同；不能把图像总数用于放大 TP=78、FP=4 的证据样本量。', '', '复现脚本：audit_dataset.py；完整计数和 YAML 原文：dataset_audit.json。'])
(OUT / 'dataset_audit.md').write_text('\n'.join(lines)+'\n', encoding='utf-8')
print(json.dumps({'entries':result['total_image_file_entries_all_directories'],'unique':len(all_unique),'actions':datasets['detection/datasets/actions'],'overlap':overlap}, ensure_ascii=False, indent=2))
