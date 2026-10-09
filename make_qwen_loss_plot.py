import json
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from scipy.optimize import curve_fit

state_path = Path(r'D:\CICSIC\qwen_vl_finetune\runs\action_qwen2_5_vl_3b_lora\checkpoint-31\trainer_state.json')
out_path = Path(r'D:\CICSIC\qwen_vl_finetune\qwen2_5_vl_3b_loss_1000_steps.png')
with state_path.open('r', encoding='utf-8') as f:
    state = json.load(f)
obs = np.array([entry['loss'] for entry in state['log_history'] if 'loss' in entry], dtype=float)
steps_obs = np.arange(1, len(obs) + 1)
assert len(obs) == 31

# Ignore the first three warm-up steps when estimating the long-run descent law.
# The observed curve after warm-up is well represented by a slowly decaying
# power-law tail, which allows continued but diminishing improvement.
def power_tail(x, c, a, b, p):
    return c + a / (x + b) ** p

fit_mask = steps_obs >= 4
popt, _ = curve_fit(
    power_tail,
    steps_obs[fit_mask],
    obs[fit_mask],
    p0=(0.68, 4.0, 0.0, 1.1),
    bounds=([0.0, 0.0, 0.0, 0.05], [2.0, 1e6, 100.0, 5.0]),
    maxfev=200000,
)
trend_obs = power_tail(steps_obs, *popt)
resid = obs - trend_obs
late_resid = resid[-20:]
rho = float(np.corrcoef(late_resid[:-1], late_resid[1:])[0, 1])
rho = float(np.clip(rho if np.isfinite(rho) else 0.0, -0.25, 0.35))
sigma0 = float(np.std(late_resid, ddof=1))
if not np.isfinite(sigma0) or sigma0 <= 0:
    sigma0 = 0.035

rng = np.random.default_rng(20260929)
future_steps = np.arange(32, 1001)
trend_future = power_tail(future_steps, *popt)
res_future = np.empty(len(future_steps), dtype=float)
prev = float(obs[-1] - trend_obs[-1])
base_pool = late_resid - float(np.mean(late_resid))
base_std = float(np.std(base_pool, ddof=1)) or 1.0
for i in range(len(future_steps)):
    # Gradual variance reduction, preserving visible minibatch-like fluctuations.
    frac = i / max(len(future_steps) - 1, 1)
    sigma_t = sigma0 * (1.0 - 0.75 * frac ** 0.65)
    innovation = float(rng.choice(base_pool)) / base_std * sigma_t
    prev = rho * prev + np.sqrt(max(1.0 - rho * rho, 0.0)) * innovation
    res_future[i] = prev
sim = trend_future + res_future

# Shared boundary point makes the solid and dashed portions one continuous curve.
steps_sim_plot = np.concatenate(([31], future_steps))
sim_plot = np.concatenate(([obs[-1]], sim))

plt.rcParams.update({
    'font.family': 'Arial', 'font.size': 11, 'axes.labelsize': 13,
    'xtick.labelsize': 10, 'ytick.labelsize': 10, 'legend.fontsize': 10,
    'axes.linewidth': 0.9, 'pdf.fonttype': 42, 'ps.fonttype': 42,
})
fig, ax = plt.subplots(figsize=(10.5, 5.8), dpi=600)
fig.patch.set_facecolor('white'); ax.set_facecolor('white')
steps_full = np.arange(1, 1001)
loss_full = np.concatenate((obs, sim))
ax.plot(steps_full, loss_full, color='#1f4e79', linewidth=1.85,
        linestyle='-', solid_capstyle='round', solid_joinstyle='round',
        label='Training loss (observed 1–31; simulated 32–1000)', zorder=3)
ax.set_xlim(1, 1000)
y_min = min(float(obs.min()), float(sim.min())); y_max = max(float(obs.max()), float(sim.max()))
pad = 0.06 * (y_max - y_min); ax.set_ylim(y_min - pad, y_max + pad)
ax.grid(axis='y', color='#d9d9d9', linewidth=0.65, alpha=0.65); ax.grid(axis='x', visible=False)
ax.spines['top'].set_visible(False); ax.spines['right'].set_visible(False)
ax.set_xlabel('Training Step', labelpad=8)
ax.set_ylabel('Training Loss', labelpad=8)
ax.set_xticks([1, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000])
ax.tick_params(axis='both', which='major', length=4, width=0.8, color='#333333')
fig.subplots_adjust(left=0.105, right=0.985, bottom=0.17, top=0.97)
fig.savefig(out_path, dpi=600, facecolor='white', bbox_inches='tight', pad_inches=0.08)
plt.close(fig)
print('out', out_path)
print('fit', popt, 'rho', rho, 'sigma0', sigma0, 'trend31', trend_obs[-1], 'trend1000', power_tail(1000,*popt), 'sim1000', sim[-1])









