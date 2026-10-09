"""Build offline figure index and a portable archive, excluding local runtimes."""
from pathlib import Path
from html import escape
import json
import zipfile
ROOT=Path(__file__).resolve().parents[1]


def main():
    sections=[
        ('重点：训练前后模拟对比','figures/07_training_gain'),
        ('论文五面板总图','figures/01_multipanel_paper'),
        ('训练收敛曲线','figures/02_training_convergence'),
        ('Precision–Recall曲线','figures/03_precision_recall'),
        ('混淆矩阵','figures/04_confusion_matrices'),
        ('四组模型森林图','figures/05_model_forest'),
        ('1000次模拟分布','figures/06_monte_carlo_ecdf'),
        ('参数及依据三线表','tables/table_01_parameters'),
        ('1000次汇总三线表','tables/table_02_simulation_summary'),
        ('真实目标保留率三线表','tables/table_03_retention_tradeoff'),
        ('真实来源：收敛','figures/S1_observed_convergence'),
        ('真实来源：原始PR图片','figures/S2_observed_PR_originals'),
        ('真实来源：混淆矩阵','figures/S3_observed_confusion'),
        ('假设敏感性分析','figures/S4_assumption_sensitivity')]
    body='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>YOLOv8论文风格模拟图组</title>
<style>body{max-width:1100px;margin:42px auto;padding:0 24px;color:#111;background:white;font-family:"Times New Roman","SimSun",serif;line-height:1.65}h1{font-size:26px;font-weight:normal}h2{font-size:20px;font-weight:normal;margin-top:42px}a{color:#111}img{display:block;width:100%;height:auto;margin:16px 0}section{border-top:1px solid #aaa;padding-top:16px}p{max-width:960px}table{border-collapse:collapse;border-top:1.5px solid black;border-bottom:1.5px solid black;width:100%}th{border-bottom:1px solid black}th,td{padding:7px;text-align:left}</style>
<h1>YOLOv8 四类行为检测：论文风格模拟实验</h1>
<p>42,000张图像为场景假设；1000个epoch为模拟轨迹；1000次Monte Carlo用于不确定性传播。真实校准证据为历史训练记录及TP78/FP4，未完成1000轮真实训练。</p>
<p>重点对比：估计基线与校准模型的精准度中位数为75.10%与94.39%，相差19.28个百分点。所有区间保留；基线、Qwen假设和真实记录分别标明。</p>
<p><a href="PPT实验结论.txt">PPT结论文字</a> · <a href="实验方法与数据依据.md">实验方法及数据依据</a> · <a href="论文图注_中英文.md">论文图注</a> · <a href="data/monte_carlo_1000_raw.csv">1000次原始CSV</a> · <a href="data/monte_carlo_1000_summary.csv">汇总CSV</a></p>
<p>PPT大字号版：<a href="figures/ppt/training_gain.png">提升对比</a> · <a href="figures/ppt/training_convergence.png">收敛</a> · <a href="figures/ppt/precision_recall.png">PR</a> · <a href="figures/ppt/confusion_matrices.png">矩阵</a> · <a href="figures/ppt/model_forest.png">森林图</a> · <a href="figures/ppt/monte_carlo_ecdf.png">分布</a></p>
'''
    for title,path in sections:
        body+=f'<section><h2>{escape(title)}</h2><p><a href="{path}.png">300 dpi PNG</a> · <a href="{path}.pdf">PDF</a></p><img src="{path}.png" alt="{escape(title)}" loading="lazy"></section>\n'
    body+='<p>字体、坐标与数据可通过scripts和reproduce.ps1复现。数值检查见audit/verification.json；原始文件SHA-256见provenance/source_manifest.json。</p></html>'
    (ROOT/'打开查看.html').write_text(body,encoding='utf-8')
    dest=ROOT.parent/'YOLOv8_论文风格模拟实验_完整包.zip'
    files=[]
    with zipfile.ZipFile(dest,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
        for path in sorted(ROOT.rglob('*')):
            if path.is_file() and not any(p in {'.venv','.python_deps','__pycache__'} for p in path.relative_to(ROOT).parts):
                arc=Path('yolov8_paper_simulation')/path.relative_to(ROOT)
                archive.write(path,str(arc))
                files.append(str(arc))
    with zipfile.ZipFile(dest) as archive:
        assert archive.testzip() is None
        assert len(archive.namelist())==len(files)
    print(json.dumps({'archive':str(dest),'files':len(files),'bytes':dest.stat().st_size,'crc_check':'PASS'},ensure_ascii=False))


if __name__=='__main__':
    main()
