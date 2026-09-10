import { AlertTriangle, CheckCircle2, FileText, Fingerprint, MapPin, PhoneCall, ShieldCheck } from 'lucide-react';
import type { CommandResponse, CommandRoute, CommandStage } from '../../lib/command-workflow';
import { commandScenario } from '../../lib/command-scenario';
import { appBasePath } from '../../lib/presentation';

export function CommandStageView({ snapshot, stage, reveal = 3, route, display = false, playback = false, offline = false, materialUrls = {} }:
  { snapshot: CommandResponse; stage: CommandStage; reveal?: number; route?: CommandRoute | null;
    display?: boolean; playback?: boolean; offline?: boolean; materialUrls?: Record<string, string> }) {
  const { event, command } = snapshot;
  const visible = (index: number) => reveal >= index ? 'command-reveal' : 'command-unrevealed';
  const location = command.intake;
  const currentRoute = route ?? command.dispatch;
  const titles = { b1: '接警工单', b2: '导航派警', b3: '盘查核验', b4: '物证同步', handover: '研判移交' };
  return <article className={`command-stage ${display ? 'command-stage-display' : ''}`} data-stage={stage}>
    <header className="command-stage-heading">
      <div><span className="command-stage-code">{stage === 'handover' ? 'B4+' : stage.toUpperCase()}</span>
        <h2>小安 · {titles[stage]}</h2></div>
      <span className={`command-source ${offline ? 'command-warning' : ''}`}>
        {offline ? '离线快照' : playback ? '只读教学回放' : command.sourceMode === 'desensitized_demo' ? '脱敏联调' : '业务事件'}
      </span>
    </header>
    <div className="command-event-strip"><span>{event.id}</span><span>{event.status}</span><span>{event.bay}</span></div>
    {stage === 'b1' && <div className="command-b1">
      <section className={`command-intake ${visible(0)}`}>
        <div className="command-section-heading"><PhoneCall size={22} /><h3>报警文本登记</h3><span>{location.speakerName || '报警人未登记'}</span></div>
        <p className="command-transcript">{location.transcript}</p>
        <div className="command-caption">来源：{location.transcriptSource === 'manual' ? '人工文本 / 教学字幕' : location.transcriptSource} · 未接入实时语音识别</div>
      </section>
      <section className={`command-facts ${visible(1)}`}>
        <h3>警情要素</h3>
        <dl><dt>报警地点</dt><dd><MapPin size={17} />{location.locationText}</dd>
          <dt>定位来源</dt><dd>{location.coordinates ? location.locationSource === 'desensitized_demo' ? '教学冻结坐标' : '人工核实坐标' : '手工地址，坐标待核实'}</dd>
          <dt>警情类别</dt><dd>{command.summary.category}</dd>
          <dt>危险因素</dt><dd>{command.summary.dangerFactors.join('；')}</dd></dl>
        <div className="command-risk"><AlertTriangle size={19} /><span>{command.summary.riskTags.join(' / ') || '风险待人工核实'}</span></div>
      </section>
      <section className={`command-related ${visible(2)}`}>
        <div className="command-section-heading"><FileText size={21} /><h3>关联警情</h3><strong>{command.relatedAlerts.length} 起</strong></div>
        <div className="command-related-list">{command.relatedAlerts.length ? command.relatedAlerts.map((item) =>
          <article key={item.eventId}><b>{item.eventId}</b><span>{item.locationText} · {item.relation}</span>
            <p>{item.basis.join('；')}</p><small>{item.occurredAt}</small></article>) : <p>未检索到授权范围内的关联结果</p>}</div>
      </section>
      <footer className={visible(3)}><ShieldCheck size={18} />{command.summary.reviewStatus === 'confirmed'
        ? `摘要已人工确认 · ${command.summary.confirmedBy}` : '警情摘要待人工确认'}<span>关联结果仅供人工核查</span></footer>
    </div>}
    {stage === 'b2' && <div className="command-b2">
      {currentRoute?.routeSource === 'scenario_route'
        ? <figure className={`command-map ${visible(0)}`}><img src={`${appBasePath}${currentRoute.mapUrl}`}
          alt="教学夜市平面示意：驻点至夜市入口骑行段，入口至B区7号步行段" />
          <figcaption>教学预设路线 · 非道路导航 · 图中位置不代表实时警力</figcaption></figure>
        : <div className="command-map-empty"><MapPin size={48} /><h3>{location.coordinates ? '未接入道路导航' : '地点待核实'}</h3>
          <p>{location.locationText}</p><p>{currentRoute?.notice || '请先预览路线'}</p></div>}
      <section className={`command-route-summary ${visible(1)}`}><h3>{currentRoute?.groupLabel || currentRoute?.staffName || '待选择警力'}</h3>
        <span>{currentRoute?.staffName || '以实际派单负责人为准'}</span>
        {currentRoute?.segments.map((segment, i) => <div className={`command-route-segment ${visible(i + 1)}`} key={i}>
          <b>{i + 1}</b><div><h4>{segment.mode === 'walk' ? '入口至现场 · 步行' : '警力驻点至夜市入口 · 骑行'}</h4>
            <strong>{segment.mode === 'walk' ? `${segment.distanceMeters} 米` : `约 ${Math.round((segment.estimatedSeconds ?? 0) / 60)} 分钟`}</strong>
            <span>{segment.mode === 'walk' ? '步行耗时未核定，不提供全程ETA' : '此时间仅至夜市入口'}</span></div></div>)}
        <p>{currentRoute?.notice}</p><div className={visible(3)}><CheckCircle2 size={19} />
          {command.dispatch?.dispatchedAt ? '派单已落库，移动端可查询' : command.dispatch?.reviewStatus === 'confirmed' ? '建议已确认，尚未下达派警' : '派警建议待指挥席确认'}</div>
      </section>
    </div>}
    {stage === 'b3' && <div className="command-b3">
      <section className={`command-person ${visible(0)}`}><Fingerprint size={70} strokeWidth={1.2} />
        <small>{command.sourceMode === 'desensitized_demo' ? '教学档案查询' : '本地档案字段查询'} · 不是人脸识别</small><h3>{command.verification?.subjectName || '等待现场查询'}</h3>
        <b>{command.verification?.personKey || '尚无匹配对象'}</b>
        <span>{command.verification?.resultStatus === 'confirmed' ? '线索已人工确认' : command.verification?.resultStatus === 'fallback' ? '已转人工处理'
          : command.verification?.resultStatus === 'no_match' ? '已登记无匹配' : '待人工核验'}</span></section>
      <section className={`command-verification ${visible(1)}`}><h3>核验依据</h3>
        {command.verification ? <><ul>{command.verification.basis.map((line) => <li key={line}>{line}</li>)}</ul>
          <dl><dt>生成方式</dt><dd>{command.verification.method === 'scenario_fixture' ? '教学案例快照' : command.verification.method === 'archive_lookup' ? '本地档案字段查询' : '人工核查'}</dd>
            <dt>规则匹配分</dt><dd>{command.verification.matchScore ?? '不提供'}</dd>
            <dt>模型置信度</dt><dd>不提供</dd><dt>数据时间</dt><dd>{command.verification.dataTime}</dd>
            <dt>审计编号</dt><dd>{command.verification.auditId || '回放不生成审计'}</dd></dl></> : <p>处警人员到场后发起查询</p>}
        <div className={`command-risk ${visible(2)}`}><AlertTriangle size={20} /><p>核验结果为线索，需人工确认；不生成身份或案件结论。</p></div>
        {command.verification?.fallbackReason && <p>{command.verification.fallbackReason}</p>}
      </section>
    </div>}
    {stage === 'b4' && <div className="command-b4">
      <section className="command-material-list"><h3>现场清点</h3>{(playback ? commandScenario.materials
        : command.evidenceIndex).map((item, i) => <div key={item.name} className={visible(Math.min(i, 3))}>
        <span>{String(i + 1).padStart(2, '0')}</span><div><b>{item.name}</b><p>{item.description}</p></div>
      </div>)}{!playback && !command.evidenceIndex.length && <p>尚无已登记材料</p>}</section>
      <section className="command-material-gallery">{playback
        ? commandScenario.materials.filter((item) => item.url).map((item, index) =>
          <figure key={item.key} className={visible(index + 1)}><img src={`${appBasePath}${item.url}`} alt={`${item.name}，教学制作的示意材料`} />
            <figcaption>{item.name} · 教学素材</figcaption></figure>)
        : command.evidenceIndex.filter((item) => item.url).map((item, index) =>
          <figure key={item.evidenceId} className={visible(Math.min(index + 1, 3))}>
            {materialUrls[item.evidenceId] ? item.kind === 'video'
              ? <video src={materialUrls[item.evidenceId]} controls preload="metadata" />
              : <img src={materialUrls[item.evidenceId]} alt={item.name} />
              : <p>文件暂不可访问</p>}
            <figcaption>{item.name} · {item.evidenceId}</figcaption>
          </figure>)}</section>
    </div>}
    {stage === 'handover' && <div className="command-handover-stage">
      <ShieldCheck size={64} /><h3>{command.handover ? ({ submitted: '研判移交待接收', accepted: '研判已接收材料', rejected: '材料已退回补正' }[command.handover.status] || '移交草稿') : '研判移交'}</h3>
      <p>{command.handover?.summary || '现场材料及核验线索经人工确认后，进入研判接收流程。'}</p>
      <dl><dt>移交编号</dt><dd>{command.handover?.handoverId || '尚未提交'}</dd><dt>材料数量</dt><dd>{command.handover?.evidenceIds.length ?? command.evidenceIndex.length}</dd>
        <dt>公共事件状态</dt><dd>{event.status}</dd><dt>接收人</dt><dd>{command.handover?.acceptedBy || '待接收'}</dd></dl>
      <p>移交材料不等于案件结论，也不自动完成现场任务。</p>
    </div>}
    <div className="command-stage-footnote"><span>数据时间 {command.updatedAt}</span>
      <b>{command.sourceMode === 'desensitized_demo' ? commandScenario.watermark : '辅助线索 · 人工确认'}</b></div>
  </article>;
}
