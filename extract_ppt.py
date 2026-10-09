import sys, zipfile, re
from pathlib import Path
from xml.etree import ElementTree as ET

NS = {'a': 'http://schemas.openxmlformats.org/drawingml/2006/main'}

def slide_num(p):
    m = re.search(r'slide(\d+)\.xml$', p.name)
    return int(m.group(1)) if m else 0

def main():
    ppt = Path(sys.argv[1])
    with zipfile.ZipFile(ppt) as z:
        names = [n for n in z.namelist() if re.match(r'ppt/slides/slide\d+\.xml$', n)]
        names.sort(key=lambda n: int(re.search(r'(\d+)', n).group(1)))
        print(f"slides={len(names)}")
        for name in names:
            root = ET.fromstring(z.read(name))
            texts = [t.text or '' for t in root.findall('.//a:t', NS)]
            print(f"--- {name} ---")
            print(' | '.join(texts))
        notes = [n for n in z.namelist() if re.match(r'ppt/notesSlides/notesSlide\d+\.xml$', n)]
        notes.sort(key=lambda n: int(re.search(r'(\d+)', n).group(1)))
        print(f"notes={len(notes)}")
        for name in notes:
            root = ET.fromstring(z.read(name))
            texts = [t.text or '' for t in root.findall('.//a:t', NS)]
            if texts:
                print(f"--- {name} ---")
                print(' | '.join(texts))

if __name__ == '__main__':
    main()
