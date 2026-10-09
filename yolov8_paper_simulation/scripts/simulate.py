"""Reproducible, explicitly synthetic YOLOv8 illustration. No model training."""
from pathlib import Path
import csv
import hashlib
import json
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.python_deps'))
import numpy as np
import pandas as pd
from scipy.optimize import least_squares
from scipy.special import expit, logit
from scipy.stats import beta

SOURCE = Path(r'D:\Dev\yolov8_security')
SEED = 20260928
CLASSES = ['fall', 'fight', 'gather', 'suicide']
MODEL_IDS = ['baseline', 'trained_yolo', 'original_qwen', 'trained_qwen']
MODEL_NAMES = ['YOLOv8n (estimated baseline)', 'Trained YOLOv8',
               'Trained YOLOv8 + original Qwen', 'Trained YOLOv8 + trained Qwen']


def dump_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False), encoding='utf-8')


def beta_params(mean, sd):
    k = mean * (1 - mean) / sd ** 2 - 1
    assert k > 0
    return mean * k, (1 - mean) * k


def summarize(x):
    return dict(mean=float(np.mean(x)), median=float(np.median(x)),
                std=float(np.std(x, ddof=1)), p2_5=float(np.quantile(x, .025)),
                p97_5=float(np.quantile(x, .975)))


def pr_metrics(scores, true_positive, n_true):
    order = np.argsort(-np.asarray(scores), kind='stable')
    tp = np.cumsum(np.asarray(true_positive)[order].astype(int))
    fp = np.arange(1, len(order) + 1) - tp
    recall = tp / n_true
    precision = tp / np.maximum(tp + fp, 1)
    # COCO-style 101 recall points, without claiming a full COCO evaluator.
    grid = np.linspace(0, 1, 101)
    envelope = np.maximum.accumulate(precision[::-1])[::-1]
    sampled = np.array([envelope[np.searchsorted(recall, r, side='left')]
                        if np.searchsorted(recall, r, side='left') < len(recall) else 0.
                        for r in grid])
    return grid, sampled, float(sampled.mean())


def snapshot_sources():
    manifest = []
    for run in ['action', 'action300', 'action_final_300']:
        dest = ROOT / 'provenance' / run
        dest.mkdir(parents=True, exist_ok=True)
        for name in ['results.csv', 'args.yaml', 'BoxPR_curve.png', 'confusion_matrix.png']:
            src = SOURCE / 'runs' / 'detect' / run / name
            if src.exists():
                shutil.copy2(src, dest / name)
                manifest.append(dict(original_path=str(src), snapshot=str((dest / name).relative_to(ROOT)),
                                     sha256=hashlib.sha256(src.read_bytes()).hexdigest(), bytes=src.stat().st_size))
    dump_json(ROOT / 'provenance' / 'source_manifest.json', manifest)
    matrices = {}
    for run, fp in [('action', 8), ('action_final_300', 4)]:
        m = np.zeros((5, 5), dtype=int)
        m[0, 0], m[1, 1], m[3, 3] = 16, 47, 15
        m[0, 4], m[4, 0], m[4, 2] = fp, 2, 1
        matrices[run] = m.tolist()
        pd.DataFrame(m, index=CLASSES + ['background'], columns=CLASSES + ['background']).to_csv(
            ROOT / 'provenance' / f'{run}_matrix_transcribed.csv', encoding='utf-8-sig')
    dump_json(ROOT / 'provenance' / 'manual_transcription.json', {
        'note': 'Counts visually transcribed from source PNGs; rows=predicted, columns=true. '
                'Bottom-right is a structural placeholder, NOT an observed TN.',
        'matrices': matrices,
        'source_pr_rounded_ap50': {'action': [.903, .995, 0., .995],
                                  'action_final_300': [.888, .995, 0., .995]},
        'source_operating_threshold': 'Unknown; no threshold inferred from image',
        'final_training_csv': 'Missing in inspected run directory'})


def simulate_predictions():
    """Generate scores + one-to-one matching surrogate, not images or boxes.

    4,200 synthetic one-target scenes inherit the source 81-object class mix.
    Confidence threshold 0.5 is chosen for this simulation only.
    Precision evidence remains n=82, never the expanded synthetic count.
    """
    rng = np.random.default_rng(SEED + 11)
    counts = np.floor(np.array([18, 47, 1, 15]) / 81 * 4200).astype(int)
    counts[np.argmax(counts)] += 4200 - counts.sum()
    gt = []
    for c, count in enumerate(counts):
        for i in range(int(count)):
            gt.append(dict(scene_id=len(gt) + 1, class_id=c, class_name=CLASSES[c]))
    gt = pd.DataFrame(gt)
    gt.to_csv(ROOT / 'data' / 'synthetic_ground_truth.csv', index=False)
    results, pr_rows, metric_rows, fit_rows, matrix_records = [], [], [], [], []
    latent = {c: rng.beta(4, 1.5, count) for c, count in enumerate(counts)}
    iou_latent = {c: rng.beta(10, 2, count) for c, count in enumerate(counts)}
    # A small localization failure fraction keeps near-perfect classes at ~0.995 AP50.
    for stage, fp_source, target_ap in [('initial', 8, .903), ('final', 4, .888)]:
        stage_rows = []
        for c, count in enumerate(counts):
            ids = gt.loc[gt.class_id == c, 'scene_id'].to_numpy()
            if c == 2:  # Conservative: no learned gather detections supported by source.
                continue
            n_hi = round(count * 16 / 18) if c == 0 else count
            n_low = round(count / 18) if c == 0 else 0
            if c == 0:
                scores_hi = .51 + .48 * latent[c][:n_hi]
                scores_low = .04 + .40 * latent[c][n_hi:n_hi + n_low]
                n_fp_hi = round(4200 * fp_source / 81)
                n_fp_low = round(4200 * 4 / 81)  # Declared low-score clutter assumption.
                u = np.random.default_rng(SEED + 20).uniform(.001, .999, n_fp_hi)
                tp_scores = np.r_[scores_hi, scores_low]
                fp_low = np.linspace(.01, .20, n_fp_low)
                # Calibrate FP score ranks to rounded source fall AP, not a desired improvement.
                shifts = np.linspace(-7, 7, 701)
                candidates = []
                for shift in shifts:
                    fp_hi = .501 + .498 * expit(logit(u) + shift)
                    s = np.r_[tp_scores, fp_hi, fp_low]
                    _, _, ap = pr_metrics(s, np.r_[np.ones(len(tp_scores)), np.zeros(n_fp_hi + n_fp_low)], count)
                    candidates.append(ap)
                best = int(np.argmin(np.abs(np.array(candidates) - target_ap)))
                fp_hi = .501 + .498 * expit(logit(u) + shifts[best])
                fit_rows.append(dict(stage=stage, class_name='fall', target_source_ap50=target_ap,
                                     synthetic_ap50=candidates[best], fp_logit_shift=shifts[best]))
                scores = tp_scores
                for score in np.r_[fp_hi, fp_low]:
                    stage_rows.append(dict(stage=stage, scene_id=0, predicted_class=c,
                                           score=float(score), matched_gt=0, iou=0.))
            else:
                scores = .51 + .48 * latent[c]
            for j, score in enumerate(scores):
                iou = .50 + .49 * iou_latent[c][j]
                # Exact 0.5% failure is a synthetic localization assumption, not source evidence.
                if c != 0 and j < max(1, round(count * .005)):
                    iou = .49
                stage_rows.append(dict(stage=stage, scene_id=int(ids[j]), predicted_class=c,
                                       score=float(score), matched_gt=int(ids[j]), iou=float(iou)))
        pred = pd.DataFrame(stage_rows)
        results.extend(stage_rows)
        m = np.zeros((5, 5), dtype=int)
        accepted = pred[pred.score >= .5]
        matched = set()
        for row in accepted.itertuples():
            if row.matched_gt > 0 and row.iou >= .5:
                c = int(gt.loc[gt.scene_id == row.matched_gt, 'class_id'].iloc[0])
                m[row.predicted_class, c] += 1
                matched.add(row.matched_gt)
            else:
                m[row.predicted_class, 4] += 1
        for row in gt.itertuples():
            if row.scene_id not in matched:
                m[4, row.class_id] += 1
        aps = []
        for c, count in enumerate(counts):
            sub = pred[pred.predicted_class == c]
            cls_ap = []
            for threshold in np.linspace(.5, .95, 10):
                positives = (sub.matched_gt > 0) & (sub.iou >= threshold)
                grid, precision, ap = pr_metrics(sub.score.to_numpy(), positives.to_numpy(), count)
                cls_ap.append(ap)
                if threshold == .5:
                    pr_rows.extend(dict(stage=stage, class_name=CLASSES[c], recall=float(r), precision=float(p))
                                   for r, p in zip(grid, precision))
            aps.append(cls_ap)
            metric_rows.append(dict(stage=stage, class_name=CLASSES[c], n_gt=int(count),
                                    ap50=cls_ap[0], ap50_95=float(np.mean(cls_ap))))
        tp = int(np.trace(m[:4, :4]))
        fp = int(m[:4, 4].sum() + m[:4, :4].sum() - tp)
        fn = int(m[4, :4].sum() + m[:4, :4].sum() - tp)
        metric_rows.append(dict(stage=stage, class_name='macro', n_gt=int(counts.sum()),
                                ap50=float(np.mean(np.array(aps)[:, 0])), ap50_95=float(np.mean(aps)),
                                tp=tp, fp=fp, fn=fn, precision=tp / (tp + fp), recall=tp / (tp + fn)))
        matrix_records.append(dict(stage=stage, matrix=m.tolist(), threshold=.5, iou=.5))
        pd.DataFrame(m, index=CLASSES + ['background'], columns=CLASSES + ['background']).to_csv(
            ROOT / 'data' / f'synthetic_confusion_{stage}.csv', encoding='utf-8-sig')
    pd.DataFrame(results).to_csv(ROOT / 'data' / 'synthetic_predictions.csv', index=False)
    pd.DataFrame(pr_rows).to_csv(ROOT / 'data' / 'synthetic_pr_curves.csv', index=False)
    pd.DataFrame(metric_rows).to_csv(ROOT / 'data' / 'synthetic_detection_metrics.csv', index=False)
    pd.DataFrame(fit_rows).to_csv(ROOT / 'data' / 'pr_calibration.csv', index=False)
    dump_json(ROOT / 'data' / 'synthetic_confusion_matrices.json', matrix_records)
    return pd.DataFrame(metric_rows)


def simulate_convergence():
    """AR(1) trajectories calibrated to source CSV; 1000 epochs are all simulated.

    They are a separate stochastic surrogate experiment, not evaluations of the
    synthetic prediction file. This distinction is explicit in captions/methods.
    """
    rng = np.random.default_rng(SEED + 31)
    source_frames = {r: pd.read_csv(ROOT / 'provenance' / r / 'results.csv') for r in ['action', 'action300']}
    curves, fit_info, best_rows = [], [], []
    epochs = np.arange(1, 1001)
    for metric, column in [('map50', 'metrics/mAP50(B)'), ('map50_95', 'metrics/mAP50-95(B)')]:
        fits = {}
        for run, frame in source_frames.items():
            t, y = frame.epoch.to_numpy(), frame[column].to_numpy()
            # Robust exponential trend; no claim of reliable long-horizon prediction.
            fn = lambda p, x: p[0] - p[1] * np.exp(-(x - 1) / p[2])
            fit = least_squares(lambda p: fn(p, t) - y, [.71 if metric == 'map50' else .55, .20, 4.],
                                bounds=([.1, 0, .2], [.95, .8, 200]), loss='soft_l1', f_scale=.015)
            resid = y - fn(fit.x, t)
            rho = float(np.clip(np.corrcoef(resid[:-1], resid[1:])[0, 1], 0, .9))
            sd = float(np.std(resid[10:], ddof=1))
            fits[run] = (fit.x, rho, sd)
            fit_info.append(dict(run=run, metric=metric, n_observed=len(frame), asymptote=float(fit.x[0]),
                                 amplitude=float(fit.x[1]), time_constant=float(fit.x[2]),
                                 residual_sd=sd, residual_ar1=rho))
        # Scenario labels avoid claiming a measured 1000-epoch run under these folder names.
        for scenario, run in [('S1', 'action'), ('S2', 'action300'), ('S3', 'action300')]:
            fit, rho, sd = fits[run]
            plateau = float(fit[0])
            if scenario == 'S3':
                plateau = .720 if metric == 'map50' else .720 * fits['action300'][0][0] / .723
            mean_curve = plateau - fit[1] * np.exp(-(epochs - 1) / fit[2])
            # No extra gain is invented beyond a source-calibrated stationary plateau.
            innovations = rng.normal(0, sd * np.sqrt(1 - rho ** 2), 1000)
            residual = np.zeros(1000)
            residual[0] = rng.normal(0, sd)
            for i in range(1, 1000):
                residual[i] = rho * residual[i - 1] + innovations[i]
            y = np.clip(mean_curve + residual, 0, 1)
            for epoch, value, trend in zip(epochs, y, mean_curve):
                curves.append(dict(scenario=scenario, calibration_run=run,
                                   epoch=int(epoch), metric=metric, value=float(value),
                                   generating_mean=float(trend), simulated=True))
            i = int(np.argmax(y))
            best_rows.append(dict(scenario=scenario, metric=metric, best_epoch=i + 1,
                                  best_value=float(y[i]), final_value=float(y[-1]),
                                  generating_plateau=plateau, simulated=True))
    out = pd.DataFrame(curves)
    # Keep each generated pair logically ordered (mAP50:95 <= mAP50).
    wide = out.pivot(index=['scenario', 'epoch'], columns='metric', values='value')
    assert (wide.map50_95 <= wide.map50).all()
    out.to_csv(ROOT / 'data' / 'synthetic_training_1000epochs.csv', index=False)
    pd.DataFrame(best_rows).to_csv(ROOT / 'data' / 'synthetic_best_epochs.csv', index=False)
    dump_json(ROOT / 'data' / 'convergence_calibration.json', fit_info)
    actual = []
    for run, frame in source_frames.items():
        for metric, col in [('map50', 'metrics/mAP50(B)'), ('map50_95', 'metrics/mAP50-95(B)')]:
            idx = frame[col].idxmax()
            actual.append(dict(run=run, metric=metric, recorded_epochs=len(frame),
                               best_epoch=int(frame.loc[idx, 'epoch']), best_value=float(frame.loc[idx, col]),
                               last_epoch=int(frame.epoch.iloc[-1]), last_value=float(frame[col].iloc[-1])))
    pd.DataFrame(actual).to_csv(ROOT / 'provenance' / 'observed_training_summary.csv', index=False)


def simulate_monte_carlo():
    rng = np.random.default_rng(SEED)
    n = 1000
    base = rng.beta(30, 10, n)  # mean .75, ESS=40: an explicit prior-only assumption.
    p = rng.beta(79, 5, n)      # Uniform prior + observed TP=78, FP=4.
    f0 = rng.beta(*beta_params(.50, .10), n)
    r0 = rng.beta(*beta_params(.95, .02), n)
    f1 = rng.beta(*beta_params(.75, .08), n)
    r1 = rng.beta(*beta_params(.97, .015), n)
    def propagate(p, f, r):
        return p * r / (p * r + (1 - p) * (1 - f))
    q0, q1 = propagate(p, f0, r0), propagate(p, f1, r1)
    df = pd.DataFrame(dict(simulation=np.arange(1, n + 1), precision_baseline=base,
                           precision_trained_yolo=p, original_qwen_fp_filter=f0,
                           original_qwen_tp_retention=r0, trained_qwen_fp_filter=f1,
                           trained_qwen_tp_retention=r1, precision_original_qwen=q0,
                           precision_trained_qwen=q1))
    for name in MODEL_IDS:
        df[f'false_alarm_share_{name}'] = 1 - df[f'precision_{name}']
    df['delta_original_qwen_pp'] = (q0 - p) * 100
    df['delta_trained_qwen_pp'] = (q1 - p) * 100
    df['delta_trained_vs_original_qwen_pp'] = (q1 - q0) * 100
    df['conditional_recall_original_qwen'] = (78 / 81) * r0
    df['conditional_recall_trained_qwen'] = (78 / 81) * r1
    contrast_rows = []
    for mid in ['trained_yolo', 'original_qwen', 'trained_qwen']:
        vals = df[f'precision_{mid}'].to_numpy()
        delta = (vals - base) * 100
        relative_reduction = (1 - (1 - vals) / (1 - base)) * 100
        df[f'delta_{mid}_vs_baseline_pp'] = delta
        df[f'false_alarm_share_relative_reduction_{mid}_pct'] = relative_reduction
        contrast_rows.append(dict(model_id=mid, **{f'delta_{k}_pp': v for k,v in summarize(delta).items()},
                                  difference_of_marginal_medians_pp=float((np.median(vals)-np.median(base))*100),
                                  **{f'false_alarm_share_reduction_{k}_pct': v for k,v in summarize(relative_reduction).items()},
                                  note='Independent baseline and calibrated draws; NOT paired measurements'))
    pd.DataFrame(contrast_rows).to_csv(ROOT / 'data' / 'training_gain_summary.csv', index=False)
    df.to_csv(ROOT / 'data' / 'monte_carlo_1000_raw.csv', index=False)
    rows = []
    for mid, name in zip(MODEL_IDS, MODEL_NAMES):
        summary = summarize(df[f'precision_{mid}'] * 100)
        rows.append(dict(model_id=mid, model=name, **{f'{k}_pct': v for k, v in summary.items()},
                         n_simulations=n, interval='95% simulation uncertainty interval',
                         evidence='prior-only assumption' if mid == 'baseline' else
                         'TP78/FP4 calibrated posterior' if mid == 'trained_yolo' else
                         'TP78/FP4 posterior + assumed Qwen filtering'))
    pd.DataFrame(rows).to_csv(ROOT / 'data' / 'monte_carlo_1000_summary.csv', index=False, encoding='utf-8-sig')
    retention_rows = []
    for mid, r in [('original_qwen', r0), ('trained_qwen', r1)]:
        for metric, values in [('true_target_retention', r), ('conditional_recall', (78 / 81) * r)]:
            retention_rows.append(dict(model=mid, metric=metric, **summarize(values * 100),
                                       note='Recall conditional on fixed source 78/81; no recall posterior propagated'))
    pd.DataFrame(retention_rows).to_csv(ROOT / 'data' / 'qwen_retention_summary.csv', index=False)
    params = []
    for name, m, s in [('original_qwen_fp_filter', .50, .10), ('original_qwen_tp_retention', .95, .02),
                        ('trained_qwen_fp_filter', .75, .08), ('trained_qwen_tp_retention', .97, .015)]:
        a, b = beta_params(m, s)
        params.append(dict(parameter=name, mean=m, sd=s, alpha=a, beta=b, source='user assumption; +/- interpreted as SD'))
    params += [dict(parameter='baseline_precision', alpha=30, beta=10, mean=.75,
                    sd=float(beta.std(30, 10)), source='assumed baseline; ESS40 is not sample size'),
               dict(parameter='trained_precision', alpha=79, beta=5, mean=79 / 84,
                    sd=float(beta.std(79, 5)), source='Beta(1,1) + TP78/FP4')]
    pd.DataFrame(params).to_csv(ROOT / 'data' / 'simulation_parameters.csv', index=False)
    # All sensitivity cases reuse uniforms; isolate assumptions, not RNG changes.
    u = np.random.default_rng(SEED + 40).uniform(size=(5, n))
    sens = []
    for ess in [20, 40, 80]:
        vals = beta.ppf(u[0], .75 * ess, .25 * ess)
        sens.append(dict(case=f'baseline_prior_ESS{ess}', model='baseline', **summarize(vals * 100)))
    for label, direction in [('conservative', -1), ('central', 0), ('optimistic', 1)]:
        for mid, fm, fs, rm, rs in [('original_qwen', .50, .10, .95, .02), ('trained_qwen', .75, .08, .97, .015)]:
            f = beta.ppf(u[1], *beta_params(fm + direction * fs, fs))
            r = beta.ppf(u[2], *beta_params(rm + direction * rs, rs))
            vals = propagate(beta.ppf(u[3], 79, 5), f, r)
            sens.append(dict(case=label, model=mid, **summarize(vals * 100)))
    pd.DataFrame(sens).to_csv(ROOT / 'data' / 'sensitivity_summary.csv', index=False)
    dump_json(ROOT / 'data' / 'monte_carlo_checks.json', {
        'paired_mean_delta_original_qwen_pp': float(np.mean((q0 - p) * 100)),
        'paired_mean_delta_trained_qwen_pp': float(np.mean((q1 - p) * 100)),
        'probability_trained_qwen_exceeds_original_under_assumptions': float(np.mean(q1 > q0)),
        'monte_carlo_standard_error_of_mean_pp': {mid: float(df[f'precision_{mid}'].std(ddof=1) * 100 / np.sqrt(n)) for mid in MODEL_IDS},
        'source_precision_observed': 78 / 82,
        'warning': 'Simulation probability is conditional on assumed filtering distributions; not an efficacy p-value.'})


def main():
    for folder in ['data', 'provenance', 'figures', 'tables', 'audit']:
        (ROOT / folder).mkdir(parents=True, exist_ok=True)
    if '--refresh-sources' in sys.argv or not (ROOT / 'provenance' / 'source_manifest.json').exists():
        snapshot_sources()
    simulate_predictions()
    simulate_convergence()
    simulate_monte_carlo()
    dump_json(ROOT / 'data' / 'scenario.json', {
        'status': 'ALL PRIMARY FIGURES ARE SIMULATED; NOT A 1000-EPOCH TRAINING RUN',
        'seed': SEED, 'scenario_images': 42000, 'scenario_train_images': 33600,
        'scenario_val_images': 4200, 'scenario_test_images': 4200,
        'image_count_status': 'Assumed scenario; no images generated or model trained',
        'synthetic_evaluation_scenes': 4200, 'one_target_per_scene': True,
        'simulated_epochs': 1000, 'monte_carlo_draws': 1000,
        'source_objects': 81, 'source_predictions_for_precision': 82,
        'synthetic_operating_confidence': .5, 'synthetic_matching_iou': .5,
        'experiment_separation': 'Convergence is an AR(1) metric surrogate; PR/CM share one '
                                 'synthetic prediction experiment; MC uses only original small-sample evidence.'})
    print(pd.read_csv(ROOT / 'data' / 'monte_carlo_1000_summary.csv').to_string(index=False))


if __name__ == '__main__':
    main()
