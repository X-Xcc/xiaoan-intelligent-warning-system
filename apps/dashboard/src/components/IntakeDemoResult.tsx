import { useEffect, useState } from 'react';
import { CheckCircle2, Fingerprint, ListChecks } from 'lucide-react';
import { useXiaoanVoice } from './XiaoanVoice';

export function IntakeDemoResult({ stage }: { stage: 'B1' | 'B2' | 'B3' | 'B4' }) {
  const { speak, stop } = useXiaoanVoice();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!busy) return;
    const timer = window.setTimeout(() => {
      setBusy(false); setChecked(true);
      void speak('verification-done', `verification:${Date.now()}`);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [busy, speak]);
  useEffect(() => () => stop(), [stop]);
  const base = `${import.meta.env.BASE_URL}command/`;
  return <section className="ops-capability-body intake-demo-result" data-intake-scene={stage}>
    <small>教学训练仿真系统 · 数据已脱敏</small>
    {stage === 'B1' && <><strong>张老板 · 夜市消费纠纷</strong><p>XX夜市B区7号烧烤摊：食品索赔后威胁砸摊。</p><span>涉恶升级预警 · 近7日两起相似警情</span></>}
    {stage === 'B2' && <><img src={`${base}night-market-map.png`} alt="夜市入口至B区路线底图" /><ol><li>135快反组：车辆至夜市入口</li><li>入口至B区7号：步行200米</li><li>预计3分钟，车辆无法进入</li></ol><strong>路线已推送 · 已出动（仿真）</strong></>}
    {stage === 'B3' && <><strong>陈XX · 身份信息已脱敏</strong><progress aria-label="核验进度" value={checked ? 100 : busy ? 50 : 0} max={100} /><p>{checked ? '核验完成 · 与2起关联警情人员信息交叉' : busy ? '身份核验中' : '尚未核验'}</p><button type="button" className="domain-primary-button" aria-label="核验身份" disabled={busy} onClick={() => { stop(); setChecked(false); setBusy(true); }}><Fingerprint size={16} />{checked ? '重新核验' : '核验身份'}</button></>}
    {stage === 'B4' && <><strong>当面清点 · 物证同步</strong><ul>{['充电宝', '水杯', '笔记本', '交易小票×8', '账本：粉壳苹果，新款，待出，3500', '备用手机：翠花街巷'].slice(0, count).map(item => <li key={item}>{item}</li>)}</ul>{count >= 4 && <img src={`${base}receipts.png`} alt="脱敏交易小票物证" />}<button type="button" className="domain-primary-button" aria-label="清点下一件" disabled={count === 6} onClick={() => setCount(value => value + 1)}><ListChecks size={16} />清点下一件</button><button type="button" className="domain-secondary-button" onClick={() => setCount(0)}><CheckCircle2 size={16} />重新清点</button></>}
  </section>;
}
