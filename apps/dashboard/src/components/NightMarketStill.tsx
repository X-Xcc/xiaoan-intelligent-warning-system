import { Button } from 'antd';
import { ImageOff, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { appBasePath } from '../lib/presentation';

export function NightMarketStill({ assetPath, name, compact = false }: { assetPath: string; name: string; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  return <div className={`bridge-preview night-market-still${compact ? ' compact' : ''}`}
    data-preview-mode="sample" data-preview-state={failed ? 'unavailable' : 'sample'}>
    {failed ? <div className="bridge-preview-empty" role="status">
      <ImageOff size={20} /><span>示例画面加载失败</span>
      <Button size="small" aria-label="重试示例画面" icon={<RefreshCw size={14} />} onClick={() => setFailed(false)}>重试</Button>
    </div> : <img src={`${appBasePath}${assetPath}`} alt={`${name} · AI 合成夜市示例（非实时）`} onError={() => setFailed(true)} />}
    {!failed && <span className="night-market-still-label">AI 合成 · 非实时</span>}
  </div>;
}
