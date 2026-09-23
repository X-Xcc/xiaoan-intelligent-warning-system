import { useEffect, useRef, useState } from 'react';
import { Activity, ArrowLeft, ArrowUpRight, Check, Download, Focus, Pause, Play, RotateCcw, ShieldCheck, Timer, Users } from 'lucide-react';
import { crowdDemoAt, crowdDemoBoxes, crowdDemoRegion, crowdTime } from '../lib/crowd-demo';
import { appBasePath } from '../lib/presentation';
import '../styles/crowd-demo.css';

export function CrowdAnalysisDemo({ onClose }: { onClose: () => void }) {
  const [second, setSecond] = useState(60);
  const [playing, setPlaying] = useState(false);
  const [boxesVisible, setBoxesVisible] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const image = useRef<HTMLImageElement>(null);
  const sample = crowdDemoAt(second);
  const status = sample.elevated ? '异常聚集预警' : '人群汇聚观察';

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setSecond(value => Math.min(value + 1, 60)), 1000);
    return () => window.clearInterval(timer);
  }, [playing]);
  useEffect(() => { if (second === 60) setPlaying(false); }, [second]);

  const exportImage = async () => {
    setExporting(true);
    setError('');
    try {
      const source = image.current;
      if (!source) throw new Error('画面尚未加载');
      await source.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 1600;
      canvas.height = 1120;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('浏览器不支持图片导出');
      ctx.fillStyle = '#181c22';
      ctx.fillRect(0, 0, 1600, 1120);
      ctx.fillStyle = '#f4f7fc';
      ctx.font = 'bold 34px "Microsoft YaHei", sans-serif';
      ctx.fillText('人群聚集智能分析', 34, 52);
      ctx.font = '22px "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#ffcd79';
      ctx.fillText('模拟演示 · 非实测数据', 1270, 49);
      ctx.drawImage(source, 0, 80, 1600, 900);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 80, 1600, 900);
      ctx.clip();
      ctx.fillStyle = 'rgba(245, 171, 62, .035)';
      ctx.strokeStyle = '#ffc45f';
      ctx.lineWidth = 3;
      ctx.beginPath();
      crowdDemoRegion.forEach(([x, y], index) => {
        if (index === 0) ctx.moveTo(x * 16, y * 9 + 80);
        else ctx.lineTo(x * 16, y * 9 + 80);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      if (boxesVisible) {
        ctx.strokeStyle = '#66f1b2';
        crowdDemoBoxes.forEach(([x, y, w, h]) => {
          ctx.lineWidth = h < 10 ? 1 : 2;
          ctx.strokeRect(x * 16, y * 9 + 80, w * 16, h * 9);
        });
      }
      ctx.fillStyle = '#181c22';
      ctx.fillRect(22, 99, 560, 48);
      ctx.fillStyle = '#ffcd79';
      ctx.font = '24px "Microsoft YaHei", sans-serif';
      ctx.fillText(`东门主通道 · A区   ${status}`, 38, 132);
      ctx.fillStyle = '#f4f7fc';
      ctx.font = 'bold 30px "Microsoft YaHei", sans-serif';
      ctx.fillText(`群体密度  ${sample.density} 人/㎡`, 34, 1040);
      ctx.fillText(`最长滞留  ${crowdTime(sample.dwellSeconds)}`, 570, 1040);
      ctx.fillText(`窗口净增  +${sample.netIncrease} 人`, 1120, 1040);
      ctx.font = '20px "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#b9c4d3';
      ctx.fillText(`区域人数 ${sample.count} 人 · 面积 10㎡ · 演示窗口 ${second} 秒 · 静态场景 / 模拟标注与指标`, 34, 1090);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('导出失败')), 'image/png'));
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `crowd-analysis-demo-${second}s.png`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '导出失败，请重试');
    } finally { setExporting(false); }
  };

  return <section className="crowd-demo" aria-label="人群分析模拟演示">
    <header className="crowd-demo-heading">
      <div className="crowd-demo-title">
        <button type="button" className="crowd-icon" aria-label="返回实时视频墙" title="返回实时视频墙" onClick={onClose}><ArrowLeft size={20} /></button>
        <div><span className="crowd-eyebrow">小安智能预警 / 多模态风险识别</span><h1>人群聚集智能分析</h1></div>
      </div>
      <div className="crowd-demo-actions"><button type="button" className="crowd-export" disabled={exporting} onClick={() => void exportImage()}><Download size={16} />{exporting ? '正在导出' : '导出分析图片'}</button></div>
    </header>
    <div className="crowd-demo-layout">
      <div className="crowd-demo-main">
        <div className="crowd-scene-heading"><span><i />CAM-02 · 东门主通道</span></div>
        <div className="crowd-demo-scene">
          <img ref={image} src={`${appBasePath}/night-market-cam-02.png`} alt="夜市东门主通道示例场景，画面叠加模拟人员检测框" onError={() => setError('示例画面加载失败，请刷新重试')} />
          <svg className="crowd-roi" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon points={crowdDemoRegion.map(point => point.join(',')).join(' ')} /></svg>
          {boxesVisible && crowdDemoBoxes.map(([x, y, width, height], index) => <div key={index} className={`crowd-person-box${height < 10 ? ' crowd-person-box-distant' : ''}`} aria-hidden="true" style={{ left: `${x}%`, top: `${y}%`, width: `${width}%`, height: `${height}%` }}>{height >= 14 && <span>{String(index + 1).padStart(2, '0')}</span>}</div>)}
          <div className="crowd-scene-status"><span className={sample.elevated ? 'elevated' : ''}><Activity size={15} />{status}</span><small>区域 A · {sample.count} 人</small></div>
          <div className="crowd-scene-watermark">模拟标注 / 非实时检测</div>
        </div>
        <div className="crowd-metrics">
          <article><div><Users size={18} /><span>群体密度</span><small>偏高</small></div><strong>{sample.density.toFixed(1)}<span>人/㎡</span></strong><p>区域人数 {sample.count} 人 <span>面积 10㎡</span></p></article>
          <article><div><Timer size={18} /><span>滞留时长</span><small>最长</small></div><strong>{crowdTime(sample.dwellSeconds)}<span>分:秒</span></strong><p>超过 2 分钟 <span>{sample.overdueCount} 人</span></p></article>
          <article><div><ArrowUpRight size={18} /><span>汇聚增速</span><small>净增加</small></div><strong>+{sample.netIncrease}<span>{second === 0 ? '人（窗口起点）' : `人 / ${second} 秒`}</span></strong><p>窗口起点 19 人 <span>增长 {sample.growthPercent}%</span></p></article>
        </div>
        <div className="crowd-playback">
          <button type="button" className="crowd-icon" title={playing ? '暂停演示' : '播放演示'} aria-label={playing ? '暂停演示' : '播放演示'} onClick={() => { if (second === 60) setSecond(0); setPlaying(value => !value); }}>{playing ? <Pause size={18} /> : <Play size={18} />}</button>
          <button type="button" className="crowd-icon" title="重置演示" aria-label="重置演示" onClick={() => { setPlaying(false); setSecond(0); }}><RotateCcw size={17} /></button>
          <span className="crowd-playback-time">{crowdTime(second)} / 01:00</span>
          <input type="range" min="0" max="60" value={second} aria-label="模拟分析时间轴" onChange={event => { setPlaying(false); setSecond(Number(event.target.value)); }} />
          <label className="crowd-box-toggle"><input type="checkbox" checked={boxesVisible} onChange={event => setBoxesVisible(event.target.checked)} /><Focus size={15} />检测框</label>
        </div>
      </div>
      <aside className="crowd-analysis">
        <header><Activity size={20} /><h2>风险研判</h2><span>模拟结果</span></header>
        <section className="crowd-risk-summary"><span className="crowd-eyebrow">当前风险状态</span><h3>{status}</h3><p>{sample.elevated ? '人群持续汇聚，入口通行空间缩小。' : '区域人数缓慢增长，保持通行情况观察。'}</p><div><span>关注区域</span><strong>东门主通道 · A区</strong></div><div><span>处置状态</span><strong>待人工确认</strong></div></section>
        <section className="crowd-review"><h3>双轮交叉核验</h3><article><span className="crowd-step">01</span><div><h4>本地算法初筛 <Check size={15} /></h4><p>人员聚集 · 密度变化 · 持续滞留</p><small>{sample.count} 人 / {sample.density.toFixed(1)} 人/㎡ / {crowdTime(sample.dwellSeconds)}</small></div></article><article><span className="crowd-step">02</span><div><h4>视觉模型复核 <Check size={15} /></h4><p>{sample.elevated ? '疑似通道拥堵，未见明确肢体冲突。' : '行人正常通行，未见明确肢体冲突。'}</p><small>预设演示结论 · 未调用模型</small></div></article></section>
        <section className="crowd-trend"><h3>区域人数趋势 <span>最近 60 秒 · 模拟</span></h3><div className="crowd-bars" aria-label="人数由19人增加至28人">{Array.from({ length: 21 }, (_, index) => { const value = crowdDemoAt(index * 3); return <div key={index} title={`${index * 3}秒：${value.count}人`} className={index * 3 <= second ? 'active' : ''} style={{ height: `${value.count / 32 * 100}%` }} />; })}</div><div className="crowd-trend-axis"><span>00:00 · 19人</span><span>01:00 · 28人</span></div></section>
        <section className="crowd-suggestion"><ShieldCheck size={19} /><div><h3>建议处置</h3><p>提醒附近巡查人员到场核实，疏导入口人流，保持主通道畅通。</p></div></section>
        <footer>演示事件 DEMO-CROWD-001<br />不连接真实告警，不生成处置工单。</footer>
      </aside>
    </div>
    {error && <p role="alert" className="crowd-demo-error">{error}</p>}
  </section>;
}
