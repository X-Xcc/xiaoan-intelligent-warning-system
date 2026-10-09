"""Semantic and delivery checks for this statistical figure package."""
from pathlib import Path
import hashlib
import json
import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.python_deps'))
import numpy as np
import pandas as pd
from PIL import Image


def main():
    checks = []
    def check(name, condition):
        if not bool(condition):
            raise AssertionError(name)
        checks.append(name)
    raw = pd.read_csv(ROOT / 'data' / 'monte_carlo_1000_raw.csv')
    check('Exactly 1000 Monte Carlo rows with unique identifiers', len(raw)==1000 and raw.simulation.nunique()==1000)
    for mid in ['baseline', 'trained_yolo', 'original_qwen', 'trained_qwen']:
        check(f'{mid}: probability domains', raw[f'precision_{mid}'].between(0,1).all())
        check(f'{mid}: false-alarm share denominator', np.allclose(raw[f'precision_{mid}']+raw[f'false_alarm_share_{mid}'],1))
    for q in ['original', 'trained']:
        p, r, f = raw.precision_trained_yolo, raw[f'{q}_qwen_tp_retention'], raw[f'{q}_qwen_fp_filter']
        check(f'{q} Qwen propagation formula', np.allclose(raw[f'precision_{q}_qwen'], p*r/(p*r+(1-p)*(1-f))))
        check(f'{q} Qwen conditional recall tradeoff', np.allclose(raw[f'conditional_recall_{q}_qwen'], 78/81*r))
    summ = pd.read_csv(ROOT / 'data' / 'monte_carlo_1000_summary.csv')
    for row in summ.itertuples():
        values=raw[f'precision_{row.model_id}']*100
        actual=[values.mean(),values.median(),values.std(ddof=1),values.quantile(.025),values.quantile(.975)]
        expected=[row.mean_pct,row.median_pct,row.std_pct,row.p2_5_pct,row.p97_5_pct]
        check(f'{row.model_id}: CSV summary reproducible from raw draws',np.allclose(actual,expected))
    gain=pd.read_csv(ROOT/'data'/'training_gain_summary.csv')
    for row in gain.itertuples():
        a=raw[f'precision_{row.model_id}']
        b=raw.precision_baseline
        check(f'{row.model_id}: gain quantiles',np.allclose(np.quantile((a-b)*100,[.025,.5,.975]),[row.delta_p2_5_pp,row.delta_median_pp,row.delta_p97_5_pp]))
    trajectories=pd.read_csv(ROOT/'data'/'synthetic_training_1000epochs.csv')
    check('6000 simulated trajectory rows, 1000 epochs per scenario/metric',len(trajectories)==6000 and (trajectories.groupby(['scenario','metric']).size()==1000).all())
    wide=trajectories.pivot(index=['scenario','epoch'],columns='metric',values='value')
    check('mAP50:95 <= mAP50 for each simulated epoch',(wide.map50_95<=wide.map50).all())
    gt=pd.read_csv(ROOT/'data'/'synthetic_ground_truth.csv')
    pred=pd.read_csv(ROOT/'data'/'synthetic_predictions.csv')
    check('4200 distinct one-target synthetic scenes',len(gt)==4200 and gt.scene_id.nunique()==4200)
    for stage in ['initial','final']:
        sub=pred[(pred.stage==stage)&(pred.score>=.5)]
        tp=sub[(sub.matched_gt>0)&(sub.iou>=.5)]
        m=pd.read_csv(ROOT/'data'/f'synthetic_confusion_{stage}.csv',index_col=0).to_numpy()
        check(f'{stage}: confusion counts recomputed from predictions',np.trace(m[:4,:4])==len(tp) and m[:4,4].sum()==len(sub)-len(tp) and m[4,:4].sum()==4200-len(tp))
        check(f'{stage}: source GT support conserved',m[:,:4].sum()==4200)
        check(f'{stage}: unmatched background does not produce a TN',m[4,4]==0)
    manifest=json.loads((ROOT/'provenance'/'source_manifest.json').read_text(encoding='utf-8'))
    for item in manifest:
        check(f"Source snapshot hash: {item['snapshot']}",hashlib.sha256((ROOT/item['snapshot']).read_bytes()).hexdigest()==item['sha256'])
    image_records=[]
    for path in sorted(list((ROOT/'figures').rglob('*.png'))+list((ROOT/'tables').glob('*.png'))):
        with Image.open(path) as im:
            check(f'300 dpi: {path.name}', all(abs(v-300)<.1 for v in im.info.get('dpi',(0,0))))
            check(f'White background: {path.name}',im.convert('RGB').getpixel((0,0))==(255,255,255))
            if path.parent.name=='tables':
                a=np.array(im.convert('RGB'))
                check(f'Pure grayscale table: {path.name}', np.array_equal(a[:,:,0],a[:,:,1]) and np.array_equal(a[:,:,1],a[:,:,2]))
            image_records.append(dict(path=str(path.relative_to(ROOT)),width=im.width,height=im.height,dpi=im.info['dpi']))
        pdf=path.with_suffix('.pdf')
        check(f'PDF pair exists: {path.name}',pdf.exists() and pdf.read_bytes().startswith(b'%PDF-') and pdf.stat().st_size>1000)
    check('All primary figures and training-gain comparison delivered',all((ROOT/'figures'/f'{name}.png').exists() for name in ['01_multipanel_paper','02_training_convergence','03_precision_recall','04_confusion_matrices','05_model_forest','06_monte_carlo_ecdf','07_training_gain']))
    result=dict(status='PASS',checks_passed=len(checks),checks=checks,images=image_records,
                note='Numerical/source/DPI/grayscale checks. Visual layout separately inspected on exported PNGs.')
    (ROOT/'audit'/'verification.json').write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding='utf-8')
    print(f'PASS: {len(checks)} semantic and export checks; {len(image_records)} PNG/PDF pairs.')


if __name__=='__main__':
    main()
