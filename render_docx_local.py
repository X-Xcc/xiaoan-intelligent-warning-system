import subprocess, sys
from pathlib import Path

py = r'C:\Users\xx\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
renderer = r'C:\Users\xx\.codex\plugins\cache\openai-primary-runtime\documents\26.923.10815\skills\documents\render_docx.py'
doc = Path(r'C:\Users\xx\Desktop\烟火哨兵七分钟路演逐字稿.docx')
out = Path(r'D:\CICSIC\_docx_render')
if out.exists():
    import shutil; shutil.rmtree(out)
out.mkdir()
subprocess.run([py, renderer, str(doc), '--output_dir', str(out), '--emit_pdf'], check=True)
print('\n'.join(f'{p.name}\t{p.stat().st_size}' for p in sorted(out.iterdir())))
