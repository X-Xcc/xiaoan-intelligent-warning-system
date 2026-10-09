from pathlib import Path
from copy import deepcopy
from collections import Counter
from difflib import SequenceMatcher
from zipfile import ZipFile
import json
import re
import runpy
from docx import Document
from lxml import etree

root = Path(__file__).parent
source = root / 'source_snapshot.docx'
output = Path(r'D:/xx/Desktop/烟火哨兵——公共安全智能预警与秒级响应系统_去AI味修订版.docx')
document = Document(source)
baseline = Document(r'D:/CICSIC/work/document_polish_20261001/verified-restored.docx')
rewrites = {}
for path in sorted(root.glob('rewrites_*.py')):
    entries = runpy.run_path(str(path))['REWRITES']
    assert not rewrites.keys() & entries.keys(), path
    rewrites.update(entries)
index_mapping = {}
for operation, old_start, old_end, new_start, new_end in SequenceMatcher(None, [paragraph.text for paragraph in baseline.paragraphs], [paragraph.text for paragraph in document.paragraphs], autojunk=False).get_opcodes():
    if operation == 'equal' or (operation == 'replace' and old_end - old_start == new_end - new_start):
        index_mapping.update({old_start + offset: new_start + offset for offset in range(old_end - old_start)})
rewrites = {index_mapping[index]: revised for index, revised in rewrites.items()}
for index, revised in list(rewrites.items()):
    if 'PPT' not in document.paragraphs[index].text:
        revised = revised.replace('修订版PPT第29页', '定价材料').replace('修订版PPT', '现有规划').replace('PPT中的', '原表中的').replace('PPT案例页', '案例材料').replace('PPT展示的', '展示的').replace('PPT展示', '材料展示').replace('修订版PPT的', '新版价格的').replace('PPT中的', '原表中的').replace('PPT中', '原表中').replace('PPT“', '“')
        revised = revised.replace('按PPT中的', '按现有方案中的')
        rewrites[index] = revised

def replace_text(paragraph, revised):
    original = paragraph.text
    runs = list(paragraph.runs)
    positions = []
    for index, run in enumerate(runs):
        positions.extend([index] * len(run.text))
    chunks = []
    for operation, old_start, old_end, new_start, new_end in SequenceMatcher(None, original, revised, autojunk=False).get_opcodes():
        if operation == 'delete':
            continue
        if operation == 'equal':
            for offset, character in enumerate(revised[new_start:new_end]):
                run_index = positions[old_start + offset]
                if chunks and chunks[-1][0] == run_index:
                    chunks[-1][1] += character
                else:
                    chunks.append([run_index, character])
        else:
            run_index = positions[min(old_start, len(positions) - 1)] if positions else 0
            chunks.append([run_index, revised[new_start:new_end]])
    templates = [deepcopy(run._r.rPr) if run._r.rPr is not None else None for run in runs]
    assert not paragraph._p.xpath('.//w:drawing | .//w:fldChar | .//w:hyperlink')
    for run in runs:
        paragraph._p.remove(run._r)
    for run_index, text in chunks:
        run = paragraph.add_run(text)
        if templates and templates[run_index] is not None:
            run._r.insert(0, deepcopy(templates[run_index]))
    assert paragraph.text == revised

changes = []
for index, revised in sorted(rewrites.items()):
    paragraph = document.paragraphs[index]
    original = paragraph.text
    assert original.strip(), index
    assert Counter(re.findall(r'\d+(?:[.,]\d+)*', original)) == Counter(re.findall(r'\d+(?:[.,]\d+)*', revised)), (index, 'numeric tokens changed')
    assert Counter(re.findall(r'\[\d+\]', original)) == Counter(re.findall(r'\[\d+\]', revised)), (index, 'citations changed')
    replace_text(paragraph, revised)
    if not paragraph.style.name.startswith('Heading'):
        paragraph.paragraph_format.widow_control = True
    if index == index_mapping[164]:
        paragraph.paragraph_format.keep_together = True
    changes.append({'paragraph': index, 'before': original, 'after': revised})

document.save(output)
with ZipFile(source) as original, ZipFile(output) as revised:
    original_media = Counter(original.read(name) for name in original.namelist() if name.startswith('word/media/') and not name.endswith('/'))
    revised_media = Counter(revised.read(name) for name in revised.namelist() if name.startswith('word/media/') and not name.endswith('/'))
    assert original_media == revised_media
    for name in original.namelist():
        if re.match(r'word/(header|footer)\d+\.xml$', name):
            assert etree.tostring(etree.fromstring(original.read(name))) == etree.tostring(etree.fromstring(revised.read(name))), name
original_document = Document(source)
assert [[cell.text for row in table.rows for cell in row.cells] for table in original_document.tables] == [[cell.text for row in table.rows for cell in row.cells] for table in document.tables]
assert len(original_document.paragraphs) == len(document.paragraphs)
def layout_signature(paragraph):
    properties = deepcopy(paragraph._p.pPr)
    if properties is None:
        return None
    for element in properties.xpath('./w:widowControl | ./w:keepLines'):
        properties.remove(element)
    return etree.tostring(properties)
assert all(layout_signature(original_document.paragraphs[index]) == layout_signature(document.paragraphs[index]) for index in range(len(document.paragraphs)))
root.joinpath('changes.json').write_text(json.dumps(changes, ensure_ascii=False, indent=2), encoding='utf-8')
root.joinpath('revised_text.txt').write_text('\n\n'.join(f'[{index}] {paragraph.text}' for index, paragraph in enumerate(document.paragraphs) if paragraph.text.strip()), encoding='utf-8')
print(f'Revised {len(changes)} paragraphs; numeric tokens, citations, tables, media, headers, footers and paragraph layout preserved')
print(output)
