import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  BrainCircuit,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Eye,
  FileCheck2,
  FileText,
  Fingerprint,
  Gauge,
  Layers3,
  MapPinned,
  MessageSquareText,
  Mic,
  Network,
  Radio,
  Route,
  ScanSearch,
  ShieldCheck,
  Smartphone,
  Target,
  UsersRound,
  Workflow,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

type DomainNavigate = (view: 'platform' | 'command' | 'case' | 'community' | 'mobile' | 'ai-center' | 'duty-plan' | 'admin') => void;
type Tone = 'blue' | 'green' | 'orange' | 'purple' | 'red';

export type DomainOverview = {
  stats?: {
    today_events?: number;
    pending_orders?: number;
    online_staff?: number;
    avg_response_minutes?: number | null;
    urgent_events?: number;
    completion_rate?: number;
    open_cases?: number;
    community_tasks?: number;
    training_records?: number;
  };
  events?: Array<{ id?: string; title?: string; area?: string; bay?: string; time?: string; status?: string; level?: string; owner?: string }>;
  ai_copilot?: {
    agents?: Array<{ name: string; status: string; currentTask: string; latency: string }>;
    mcp_connectors?: Array<{ name: string; status: string; scope: string; lastSync: string; writeAllowed?: boolean }>;
    skills?: Array<{ name: string; status: string; trigger: string; confidence: number }>;
  };
  workspaces?: Record<string, Record<string, unknown>>;
  aiCenter?: Record<string, unknown>;
};

type DomainPageProps = {
  overview: DomainOverview;
  apiOnline: boolean;
  navigate: DomainNavigate;
  refresh?: () => void | Promise<void>;
};

type AIResultContract = {
  result: string;
  confidence: number;
  evidence?: string[];
  evidenceTime?: string | null;
  explanation?: string;
  humanReviewRequired: boolean;
  reviewStatus: 'pending' | 'confirmed' | 'rejected' | 'not_required';
  fallbackAction?: string;
  auditId: string;
};

type AiRuntimeSnapshot = {
  model: { name: string; status: string; providers: string[] };
  capabilities: Array<{ name: string; scope: string; status: string }>;
  agents: Array<{ name: string; status: string; currentTask: string; latency: string }>;
  skills: Array<{ name: string; status: string; trigger: string; confidence: number }>;
  mcpConnectors: Array<{ name: string; status: string; scope: string; lastSync: string; writeAllowed: boolean }>;
  sampleResult?: AIResultContract;
};

const AI_CENTER_API = (import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:8010/api' : `${window.location.origin}/api`)).replace(/\/$/, '');

type DomainEvent = NonNullable<DomainOverview['events']>[number];

type AssistantModule = {
  id: string;
  title: string;
  description: string;
  detail: string;
  tone: Tone;
  icon: typeof Activity;
};

type ObjectDetail = {
  label: string;
  value: string | number;
};

type ProcessStep = {
  label: string;
  detail: string;
  tool?: string;
};

type FlowStep = {
  title: string;
  detail: string;
  state: 'done' | 'active' | 'pending';
};

const operationFlows: Record<string, { label: string; steps: readonly FlowStep[] }> = {
  '接处警系统 / DISPATCH OPERATIONS': {
    label: '接处警',
    steps: [
      { title: '接警输入', detail: '原始警情进入处置链', state: 'done' },
      { title: '分级派警', detail: '等待指挥席人工确认', state: 'active' },
      { title: '现场处置', detail: '待移动勤务签收', state: 'pending' },
      { title: '回传归档', detail: '待处置结果回传', state: 'pending' },
    ],
  },
  '执法办案系统 / CASE INTELLIGENCE': {
    label: '执法办案',
    steps: [
      { title: '案件受理', detail: '案件对象已建立', state: 'done' },
      { title: '证据校验', detail: '待补齐关键材料', state: 'active' },
      { title: '卷宗审核', detail: '待人工审核', state: 'pending' },
      { title: '移送归档', detail: '待确认材料', state: 'pending' },
    ],
  },
  '社区警务系统 / COMMUNITY OPERATIONS': {
    label: '社区警务',
    steps: [
      { title: '辖区建档', detail: '网格对象持续更新', state: 'done' },
      { title: '任务派发', detail: '风险提示待人工研判', state: 'active' },
      { title: '走访回传', detail: '待上传走访材料', state: 'pending' },
      { title: '闭环复核', detail: '待责任民警复核', state: 'pending' },
    ],
  },
  '勤务训练系统 / TRAINING OPERATIONS': {
    label: '勤务训练',
    steps: [
      { title: '课程编排', detail: '课程草稿已创建', state: 'done' },
      { title: '模拟训练', detail: '等待开始训练', state: 'active' },
      { title: '报告确认', detail: '待教官确认评分', state: 'pending' },
      { title: '档案沉淀', detail: '待写入一人一档', state: 'pending' },
    ],
  },
  '移动勤务系统 / FIELD COMMAND': {
    label: '移动勤务',
    steps: [
      { title: '任务签收', detail: '等待现场民警确认', state: 'active' },
      { title: '现场核验', detail: '待人工复核线索', state: 'pending' },
      { title: '伴随指引', detail: '按现场状态加载', state: 'pending' },
      { title: '结果回传', detail: '待进入审核队列', state: 'pending' },
    ],
  },
};

const commandModules: AssistantModule[] = [
  { id: 'transcribe', title: 'AI 智能语音转写', description: '报警语音实时转为结构化文本', detail: '保留原始录音、时间戳和修订记录。', tone: 'blue', icon: Mic },
  { id: 'summary', title: 'AI 警情自动摘要与警单生成', description: '自动归纳警情概要并填写警单', detail: '提取地点、人员、事由和处置要素。', tone: 'purple', icon: FileText },
  { id: 'dispatch', title: 'AI 智能分类与分级派警', description: '识别警情类型并匹配处警单位', detail: '给出分级依据、位置和推荐警力。', tone: 'orange', icon: Workflow },
  { id: 'question', title: 'AI 辅助问询指引', description: '按警情类型提示关键问询项', detail: '覆盖伤情、关系、危险源和联系信息。', tone: 'green', icon: MessageSquareText },
  { id: 'portrait', title: 'AI 警情画像与风险推送', description: '警力未到，信息先到处警端', detail: '汇聚人员、地点、车辆和关联风险。', tone: 'red', icon: Fingerprint },
  { id: 'trend', title: 'AI 警情态势分析', description: '绘制警情热力图与治安气象图', detail: '按时空、类型和趋势生成研判摘要。', tone: 'blue', icon: BarChart3 },
  { id: 'repeat-risk', title: 'AI 重复报警与风险识别', description: '发现同人同址同类重复报警', detail: '进入人工核查队列并保留依据。', tone: 'orange', icon: AlertTriangle },
];

const caseModules: AssistantModule[] = [
  { id: 'legal', title: 'AI 智能法律助手', description: '法律条文、罪责定性与量刑建议', detail: '定位法条、适用条件和出处。', tone: 'blue', icon: BookOpenCheck },
  { id: 'evidence', title: 'AI 智能取证清单', description: '按案由规划取证清单与禁忌', detail: '把关键事实拆成可执行的取证任务。', tone: 'purple', icon: ClipboardCheck },
  { id: 'rule-check', title: 'AI 证据规则校验', description: '实体、程序与证据链质量自检', detail: '标出缺项、矛盾和程序风险。', tone: 'orange', icon: ShieldCheck },
  { id: 'similar', title: 'AI 类案推送与量刑辅助', description: '关联类案判例，给出区间建议', detail: '展示差异、依据和人工复核点。', tone: 'green', icon: BarChart3 },
  { id: 'document', title: 'AI 智能文书生成与审核', description: '文书草稿、卷宗目录与程序审核', detail: '生成可编辑草稿，不替代签发。', tone: 'blue', icon: FileText },
  { id: 'linkage', title: 'AI 案件特征比对与串并', description: '特征比对、线索图谱与侦查方向', detail: '从时空、人、物、行为中发现关联。', tone: 'red', icon: Network },
  { id: 'transfer', title: 'AI 政法跨部门协同', description: '检察院、法院移送与文书共享', detail: '沿统一案件 ID 传递材料与回执。', tone: 'purple', icon: Route },
];

const communityModules: AssistantModule[] = [
  { id: 'profile', title: 'AI辖区画像', description: '网格、人地事物和重点区域画像', detail: '按时间、空间和对象聚合辖区变化。', tone: 'blue', icon: MapPinned },
  { id: 'visit', title: 'AI走访任务编排', description: '根据风险和服务对象生成走访计划', detail: '分派到网格员并记录回访结果。', tone: 'green', icon: UsersRound },
  { id: 'closure', title: 'AI隐患闭环', description: '发现、派单、整改、复核全流程', detail: '每条隐患绑定责任人、时限和证据。', tone: 'orange', icon: CheckCircle2 },
  { id: 'analysis', title: 'AI警情态势分析', description: '热力图、趋势和重复警情研判', detail: '为基层治理提供同源分析。', tone: 'purple', icon: BarChart3 },
];

const trainingModules: AssistantModule[] = [
  { id: 'course', title: 'AI 智能课程编辑器', description: '空间建模与需求快速生成 MR 课程', detail: '目标、场景、步骤和验收指标一体化编排。', tone: 'blue', icon: Layers3 },
  { id: 'simulation', title: 'AI 实战模拟训练（AI 教官）', description: '实时捕捉模拟处置全过程并评分', detail: '对法言法语、站位和风险节点精准纠错。', tone: 'purple', icon: ShieldCheck },
  { id: 'report', title: 'AI 智能评估与报告', description: '训练结束自动生成个性化报告', detail: '输出能力雷达、短板和复训建议。', tone: 'green', icon: ClipboardCheck },
  { id: 'motion', title: 'AI 体能训练与动作识别', description: '识别动作标准度、次数和时长', detail: '训练芯片数据自动形成训练记录。', tone: 'orange', icon: Activity },
  { id: 'fraud', title: '反诈劝阻 AI 实训', description: '真实案例还原全场景劝阻对话', detail: '覆盖十余个训练模块和案例脚本。', tone: 'red', icon: MessageSquareText },
  { id: 'recommend', title: '个性化训练推送', description: '短板画像并推荐课程', detail: '结合岗位和复训周期推送课程。', tone: 'blue', icon: BarChart3 },
  { id: 'archive', title: 'AI 训练档案（一人一档）', description: '训练全程可追溯并实时监测指标', detail: '汇聚课程、体能、健康和复训记录。', tone: 'green', icon: Database },
];

const mobileModules: AssistantModule[] = [
  { id: 'qa', title: 'AI 智能问答（移动智囊库）', description: '移动智囊库，按岗位提供业务解答', detail: '回答带制度出处和适用范围。', tone: 'blue', icon: MessageSquareText },
  { id: 'identity', title: 'AI 秒级身份核验', description: '拍照上传，快速完成人员身份核验', detail: '返回匹配依据、置信度和确认入口。', tone: 'green', icon: Fingerprint },
  { id: 'analysis', title: 'AI 综合研判与信息推送', description: '关联多维数据生成研判摘要', detail: '按任务与权限推送预警信息。', tone: 'purple', icon: BrainCircuit },
  { id: 'voice', title: 'AI 智能语音交互', description: '语音输入、播报与多语言转译', detail: '弱网保留本地草稿和回传状态。', tone: 'orange', icon: Mic },
  { id: 'guide', title: 'AI 警情伴随式指引', description: '按警情类别匹配处置和法制指引', detail: '随处置节点更新下一步动作。', tone: 'red', icon: Radio },
  { id: 'command', title: 'AI 移动指令处置', description: '自动签收警情并生成现场摘要', detail: '数字警察提醒关键步骤。', tone: 'blue', icon: Workflow },
  { id: 'vision', title: 'AI 视图智能识别（AI 眼镜）', description: 'AI眼镜识别人、车牌等目标', detail: '识别结果需按权限确认后写入事件链。', tone: 'green', icon: Eye },
  { id: 'office', title: 'AI 移动办公与审批', description: '公文审批、事项督办和通知公告', detail: '移动端完成待办签批并保留责任链。', tone: 'purple', icon: FileCheck2 },
];

const demoCommandEvents: DomainEvent[] = [
  { id: 'alarm-demo-001', title: '群众求助：家属失联', bay: '东湖分局 · 站前网格', time: '刚刚', status: '待分派', level: '中风险', owner: '未分派' },
  { id: 'alarm-demo-002', title: '纠纷警情：现场有人受伤', bay: '西湖分局 · 绳金塔街道', time: '3 分钟前', status: '待确认', level: '高风险', owner: '指挥席 02' },
  { id: 'alarm-demo-003', title: '反诈劝阻：疑似转账风险', bay: '青山湖分局 · 湖坊派出所', time: '8 分钟前', status: '已派警', level: '中风险', owner: '巡逻组 A' },
  { id: 'alarm-demo-004', title: '邻里求助：噪声扰民', bay: '红谷滩分局 · 凤凰洲网格', time: '12 分钟前', status: '处理中', level: '低风险', owner: '社区民警 17' },
];

function toneClass(tone: Tone) {
  return 'domain-tone-' + tone;
}

function DomainHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
  apiOnline,
  navigate,
  backLabel = '返回平台总览',
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: typeof Activity;
  apiOnline: boolean;
  navigate: DomainNavigate;
  backLabel?: string;
}) {
  const operationFlow = operationFlows[eyebrow];

  return (
    <>
      <header className="domain-header">
        <div className="domain-header-main">
          <span className="domain-kicker"><span className="domain-kicker-dot" />{eyebrow}</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className="domain-header-actions">
          <span className={'domain-live-pill ' + (apiOnline ? 'online' : 'pending')}><span />{apiOnline ? '平台数据在线' : '等待业务数据'}</span>
          <button className="domain-secondary-button" type="button" onClick={() => navigate('platform')}><ArrowRight size={15} />{backLabel}</button>
        </div>
        <div className="domain-header-icon"><Icon size={29} /></div>
      </header>
      {operationFlow && <DomainOperationFlow steps={operationFlow.steps} />}
    </>
  );
}

function DomainOperationFlow({ steps }: { steps: readonly FlowStep[] }) {
  return (
    <ol className="domain-operation-flow" aria-label="业务处置流程">
      {steps.map((step, index) => (
        <li className={step.state} key={step.title}>
          <b>{String(index + 1).padStart(2, '0')}</b>
          <strong>{step.title}</strong>
          <small>{step.detail}</small>
        </li>
      ))}
    </ol>
  );
}

function DomainMetric({ label, value, note, icon: Icon, tone }: { label: string; value: string | number; note: string; icon: typeof Activity; tone: Tone }) {
  return <div className="domain-metric"><span className={'domain-metric-icon ' + toneClass(tone)}><Icon size={17} /></span><small>{label}</small><strong>{value}</strong><em>{note}</em></div>;
}

function ContractNote({ children = 'AI输出均包含结果、置信度、数据时间、依据、人工确认和审计编号。' }: { children?: string }) {
  return <div className="domain-contract-note"><ShieldCheck size={15} /><span>{children}</span></div>;
}

function PanelHeading({ kicker, title, icon: Icon, description }: { kicker: string; title: string; icon: typeof Activity; description?: string }) {
  return (
    <div className="domain-panel-heading">
      <div>
        <span className="domain-panel-kicker">{kicker}</span>
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </div>
      <Icon size={18} />
    </div>
  );
}

function CurrentObjectCard({ label, title, status, details }: { label: string; title: string; status: string; details: ObjectDetail[] }) {
  return (
    <section className="domain-panel domain-current-object">
      <PanelHeading kicker="CURRENT BUSINESS OBJECT" title={label} icon={CircleDotIcon} />
      <div className="domain-current-object-title">
        <strong>{title}</strong>
        <span className="domain-live-pill online"><span />{status}</span>
      </div>
      <dl className="domain-object-details">
        {details.map((detail) => <div key={detail.label}><dt>{detail.label}</dt><dd>{detail.value}</dd></div>)}
      </dl>
    </section>
  );
}

function CircleDotIcon({ size }: { size?: number }) {
  return <Target size={size} />;
}

function ProcessSteps({ label, steps, active, onSelect, doneUntil = 0 }: { label: string; steps: ProcessStep[]; active: number; onSelect: (index: number) => void; doneUntil?: number }) {
  return (
    <nav className="domain-process-steps" aria-label={label + '处置链'}>
      {steps.map((step, index) => {
        const state = index < doneUntil || index < active ? 'done' : index === active ? 'active' : '';
        return (
          <button
            aria-current={index === active ? 'step' : undefined}
            className={'domain-process-step ' + state}
            key={step.label}
            onClick={() => onSelect(index)}
            type="button"
          >
            <span>{index < doneUntil || index < active ? <CheckCircle2 size={14} /> : String(index + 1).padStart(2, '0')}</span>
            <strong>{step.label}</strong>
            <small>{step.detail}</small>
          </button>
        );
      })}
    </nav>
  );
}

function AiAssistMenu({ label, modules, activeId, onSelect }: { label: string; modules: AssistantModule[]; activeId: string; onSelect: (id: string) => void }) {
  return (
    <section className="domain-panel domain-ai-assist-menu">
      <PanelHeading kicker="AI ASSISTANCE" title={label} icon={BrainCircuit} />
      <div className="domain-ai-assist-list">
        {modules.map((module) => {
          const Icon = module.icon;
          return (
            <button
              className={'domain-ai-assist-item ' + (activeId === module.id ? 'active' : '')}
              key={module.id}
              onClick={() => onSelect(module.id)}
              type="button"
            >
              <span className={'domain-rail-icon ' + toneClass(module.tone)}><Icon size={15} /></span>
              <span><strong>{module.title}</strong><small>{module.description}</small></span>
              <ArrowRight size={13} />
            </button>
          );
        })}
      </div>
    </section>
  );
}

type EventChainItem = {
  current: string;
  previous: string;
  next: string;
  nextView: Parameters<DomainNavigate>[0];
  auditId: string;
};

const workbenchEventChains: Record<string, EventChainItem> = {
  'command-intake-workbench': { current: '分类分级记录', previous: '接警事件 ALARM-20260905-001', next: '派警指令', nextView: 'mobile', auditId: 'AUDIT-COMMAND-20260905-001' },
  'case-dossier-workbench': { current: '案件/证据记录', previous: '移动签收与现场回传 MOBILE-ALARM-001', next: '社区风险与走访任务', nextView: 'community', auditId: 'AUDIT-CASE-20260905-001' },
  'community-territory-workbench': { current: '社区风险与走访任务', previous: '案件/证据记录 CASE-2026-0428', next: '训练复盘与一人一档', nextView: 'duty-plan', auditId: 'AUDIT-COMMUNITY-20260905-001' },
  'training-course-workbench': { current: '训练复盘与一人一档', previous: '社区风险与走访任务 COMMUNITY-VISIT-0001', next: '接警事件复盘', nextView: 'command', auditId: 'AUDIT-TRAINING-20260905-001' },
  'mobile-field-workbench': { current: '移动签收与现场回传', previous: '派警指令 ALARM-20260905-001', next: '案件/证据记录', nextView: 'case', auditId: 'AUDIT-MOBILE-20260905-001' },
};

function DomainEventChain({ chain, navigate }: { chain: EventChainItem; navigate: DomainNavigate }) {
  const [reviewStatus, setReviewStatus] = useState<'pending' | 'confirmed' | 'rejected'>('pending');
  const [feedback, setFeedback] = useState('高风险 AI 建议已进入人工确认队列，等待处置。');
  const review = (decision: 'confirmed' | 'rejected') => {
    setReviewStatus(decision);
    setFeedback(decision === 'confirmed'
      ? '人工确认已记录到审计链；业务状态保持不变，等待业务 API 回传。'
      : '建议已拒绝并回退人工处理；业务状态保持不变。');
  };

  return (
    <section className="domain-event-chain" aria-label="统一事件链与人工确认">
      <div className="domain-event-chain-heading"><span>UNIFIED EVENT CHAIN</span><strong>当前节点：{chain.current}</strong><b>{chain.auditId}</b></div>
      <dl>
        <div><dt>前一节点摘要</dt><dd>{chain.previous}</dd></div>
        <div><dt>下一节点动作</dt><dd><button type="button" className="domain-text-button" onClick={() => navigate(chain.nextView)}>{chain.next}<ArrowRight size={14} /></button></dd></div>
      </dl>
      <div className="domain-review-queue">
        <div><span>高风险 AI 建议</span><strong>任务队列：人工确认队列</strong><small>置信度 92% · 依据：当前业务对象与关联事件 · 数据时间：2026-09-05 09:30</small></div>
        <div className="domain-review-actions">
          <button type="button" className="domain-primary-button" onClick={() => review('confirmed')} disabled={reviewStatus !== 'pending'}>人工确认</button>
          <button type="button" className="domain-secondary-button" onClick={() => review('rejected')} disabled={reviewStatus !== 'pending'}>回退人工处理</button>
        </div>
      </div>
      <p className="domain-review-feedback" aria-live="polite">{feedback}</p>
      <small className="domain-review-safety">确认仅更新人工确认队列，不直接改变业务状态。</small>
    </section>
  );
}

function ObjectWorkbench({ className, objectPanel, processPanel, navigate }: { className: string; objectPanel: React.ReactNode; processPanel: React.ReactNode; navigate: DomainNavigate }) {
  const chain = workbenchEventChains[className];
  return (
    <div className={'domain-object-workbench ' + className}>
      <aside className="domain-object-panel">{objectPanel}</aside>
      <main className="domain-process-surface">{processPanel}{chain && <DomainEventChain chain={chain} navigate={navigate} />}</main>
    </div>
  );
}

export function CommandOperationsPage({ overview, apiOnline, navigate, refresh }: DomainPageProps) {
  const [selectedId, setSelectedId] = useState(overview.events?.[0]?.id ?? demoCommandEvents[0].id);
  const [activeTool, setActiveTool] = useState('transcribe');
  const [activeProcess, setActiveProcess] = useState(0);
  const [transcript, setTranscript] = useState('报警人称：站前路口有人争执，一名人员疑似受伤，请尽快到场。');
  const [actionState, setActionState] = useState<Record<string, boolean>>({});
  const events = overview.events?.length ? overview.events : demoCommandEvents;
  const selected = useMemo(() => events.find((event) => event.id === selectedId) ?? events[0], [events, selectedId]);
  const activeModule = commandModules.find((module) => module.id === activeTool) ?? commandModules[0];
  const completed = Boolean(actionState[activeTool]);
  const processSteps: ProcessStep[] = [
    { label: '接警转写', detail: '录音转结构化警情', tool: 'transcribe' },
    { label: '问询补录', detail: '补齐伤情与危险源', tool: 'question' },
    { label: '定位推荐警力', detail: '结合位置与警力状态', tool: 'dispatch' },
    { label: '人工派警', detail: '确认后下达处置指令', tool: 'dispatch' },
  ];
  const markAction = () => setActionState((state) => ({ ...state, [activeTool]: true }));
  const selectProcess = (index: number) => {
    setActiveProcess(index);
    setActiveTool(processSteps[index].tool ?? activeTool);
  };

  const renderCommandTool = () => {
    if (activeTool === 'transcribe') {
      return <div className="ops-capability-body"><label className="ops-field-label">原始报警语音 / 现场补录</label><textarea value={transcript} onChange={(event) => setTranscript(event.target.value)} rows={5} /><div className="ops-inline-meta"><span><Mic size={14} />普通话识别</span><span>时间戳 00:18 · 置信度 96%</span></div><button type="button" className="domain-primary-button" onClick={markAction}><CheckCircle2 size={15} />{completed ? '已生成结构化文本' : '生成结构化文本'}</button>{completed && <div className="ops-result-card"><strong>结构化警情已生成</strong><span>地点：站前路口 · 类型：纠纷求助 · 伤情：疑似轻微</span><small>依据：报警原音、转写时间戳 · 数据时间：刚刚 · 审计编号：AI-ALARM-0001</small></div>}</div>;
    }
    if (activeTool === 'summary') {
      return <div className="ops-capability-body"><div className="ops-summary-preview"><span>警情概要</span><strong>{selected?.title ?? '待选择警情'}</strong><p>{transcript}</p><div><b>地点</b><span>{selected?.bay ?? '站前路口'}</span><b>状态</b><span>{selected?.status ?? '待生成'}</span></div></div><button type="button" className="domain-primary-button" onClick={markAction}><FileText size={15} />{completed ? '警情摘要已进入确认队列' : '确认警情摘要'}</button><small className="domain-action-safety">确认只记录人工意见，不直接改变警情状态。</small></div>;
    }
    if (activeTool === 'dispatch') {
      return <div className="ops-capability-body"><div className="ops-recommendation-grid"><div><small>建议分类</small><strong>纠纷 / 人身安全</strong><b>置信度 92%</b></div><div><small>警情定位</small><strong>站前路口东南侧</strong><b>定位精度 18 m</b></div><div><small>推荐警力</small><strong>站前派出所巡逻组</strong><b>距离约 1.8 km</b></div></div><div className="ops-evidence-line"><ShieldCheck size={14} />依据：关键词“争执、受伤” · 历史同址警情 3 起 · 数据时间：刚刚</div><button type="button" className="domain-primary-button" onClick={markAction}><Workflow size={15} />{completed ? '建议已进入人工确认队列' : '确认分级派警建议'}</button><small className="domain-action-safety">高风险派警建议须由指挥席下达，未确认前不能显示为已派警。</small></div>;
    }
    if (activeTool === 'question') {
      return <div className="ops-capability-body"><div className="ops-checks">{['是否有人受伤、是否需要医疗联动', '涉事人员关系与是否有利器', '现场是否仍有冲突或危险源', '报警人联系方式与安全位置'].map((item, index) => <label key={item}><input type="checkbox" defaultChecked={index < 2} /><span>{item}</span><small>关键问询 {String(index + 1).padStart(2, '0')}</small></label>)}</div><button type="button" className="domain-primary-button" onClick={markAction}><MessageSquareText size={15} />{completed ? '问询要点已带入警单' : '生成问询指引'}</button></div>;
    }
    if (activeTool === 'portrait') {
      return <div className="ops-capability-body"><div className="ops-portrait"><div className="ops-portrait-ring"><Fingerprint size={26} /></div><div><strong>站前路口 · 纠纷警情画像</strong><p>关联人员 2 名 · 近 30 日同址警情 3 起 · 夜间风险上升</p><div className="ops-tag-row"><span>时空关联</span><span>重复警情</span><span>伤情待确认</span></div></div></div><button type="button" className="domain-primary-button" onClick={markAction}><Radio size={15} />{completed ? '画像已推送至处警端' : '推送警情画像'}</button></div>;
    }
    if (activeTool === 'trend') {
      return <div className="ops-capability-body"><div className="ops-trend-list">{['纠纷求助', '反诈劝阻', '人员走失', '噪声扰民'].map((item, index) => <div key={item}><span>{item}</span><div><i style={{ width: [82, 68, 46, 31][index] + '%' }} /></div><b>{[82, 68, 46, 31][index]}%</b></div>)}</div><button type="button" className="domain-primary-button" onClick={markAction}><BarChart3 size={15} />{completed ? '研判摘要已归档' : '生成态势研判摘要'}</button></div>;
    }
    return <div className="ops-capability-body"><div className="ops-risk-card"><span className="ops-risk-level">高关注</span><div><strong>同一人 / 同一地址重复报警</strong><p>近 7 日关联 3 起纠纷类警情，建议由社区民警复核人员关系和地址风险。</p></div><b>风险分 87</b></div><button type="button" className="domain-primary-button" onClick={markAction}><AlertTriangle size={15} />{completed ? '已加入人工核查队列' : '加入人工核查队列'}</button></div>;
  };

  return (
    <section className="domain-page command-operations-page">
      <DomainHeader eyebrow="接处警系统 / DISPATCH OPERATIONS" title="单警情接入与分级派警工作台" description="围绕一条正在办理的警情，完成接警转写、问询补录、定位推荐警力与人工派警，并把处置结果回传统一事件链。" icon={Radio} apiOnline={apiOnline} navigate={navigate} />
      <div className="domain-metrics"><DomainMetric label="今日警情" value={overview.stats?.today_events ?? events.length} note="统一事件中心" icon={Radio} tone="blue" /><DomainMetric label="待分派" value={overview.stats?.pending_orders ?? '—'} note="人工确认队列" icon={Workflow} tone="orange" /><DomainMetric label="高风险待确认" value={overview.stats?.urgent_events ?? '—'} note="不得自动派警" icon={AlertTriangle} tone="red" /><DomainMetric label="平均响应" value={overview.stats?.avg_response_minutes ? overview.stats.avg_response_minutes + ' 分钟' : '—'} note="接警到签收" icon={Gauge} tone="green" /></div>
      <ObjectWorkbench
        className="command-intake-workbench"
        navigate={navigate}
        objectPanel={<><CurrentObjectCard label="当前警情对象" title={selected?.title ?? '待同步警情'} status={selected?.status ?? '待分派'} details={[{ label: '警情编号', value: selected?.id ?? '待生成' }, { label: '报警位置', value: selected?.bay ?? '待定位' }, { label: '风险等级', value: selected?.level ?? '待研判' }, { label: '当前责任', value: selected?.owner ?? '未分派' }]} /><section className="domain-panel domain-object-queue"><PanelHeading kicker="INCIDENT QUEUE" title="待处置警情" icon={Radio} /><div className="ops-queue-list">{events.map((event, index) => <button key={event.id ?? String(index)} type="button" className={selected?.id === event.id ? 'active' : ''} onClick={() => setSelectedId(event.id ?? '')}><span className={'ops-queue-dot ' + (event.level === '高风险' ? 'danger' : event.level === '中风险' ? 'warn' : 'info')} /><span><strong>{event.title ?? '待同步警情'}</strong><small>{event.bay ?? '未上报辖区'} · {event.time ?? '刚刚'}</small></span><b>{event.status ?? '待分派'}</b></button>)}</div><div className="ops-queue-footer"><span><Radio size={13} />{apiOnline ? '实时同步' : '演示数据'}</span><button type="button" onClick={() => void refresh?.()}><ArrowRight size={14} />刷新队列</button></div></section><AiAssistMenu label="接处警 AI 助手" modules={commandModules} activeId={activeTool} onSelect={setActiveTool} /></>}
        processPanel={<><section className="domain-panel"><PanelHeading kicker="INCIDENT DISPOSITION CHAIN" title="警情接入—分级派警台" icon={Workflow} description="操作对象始终是当前选中的单条警情，所有建议保留人工确认与审计。"/><ProcessSteps label="警情" steps={processSteps} active={activeProcess} onSelect={selectProcess} doneUntil={Object.keys(actionState).length > 0 ? 1 : 0} /></section><section className="domain-panel domain-active-process"><PanelHeading kicker="CURRENT ACTION" title={activeModule.title} icon={activeModule.icon} description={activeModule.detail} />{renderCommandTool()}<ContractNote>派警建议展示位置、推荐警力和分级依据；派警指令必须由指挥席人工确认。</ContractNote></section></>}
      />
    </section>
  );
}

export function CaseHandlingPage({ overview, apiOnline, navigate }: DomainPageProps) {
  const [activeTool, setActiveTool] = useState('legal');
  const [activeProcess, setActiveProcess] = useState(0);
  const [query, setQuery] = useState('盗窃案件 · 夜间 · 多次作案');
  const [checks, setChecks] = useState([true, true, false, false]);
  const [documentReady, setDocumentReady] = useState(false);
  const activeModule = caseModules.find((module) => module.id === activeTool) ?? caseModules[0];
  const caseCount = overview.stats?.open_cases ?? 0;
  const eventCount = overview.stats?.today_events ?? 0;
  const processSteps: ProcessStep[] = [
    { label: '案件受理', detail: '建立案件卷宗与事实框架', tool: 'legal' },
    { label: '证据链', detail: '取证清单、保管链与规则校验', tool: 'evidence' },
    { label: '法条适用', detail: '法条与类案辅助比对', tool: 'legal' },
    { label: '程序节点', detail: '文书审核与移送归档', tool: 'document' },
  ];
  const selectProcess = (index: number) => {
    setActiveProcess(index);
    setActiveTool(processSteps[index].tool ?? activeTool);
  };

  const renderCaseTool = () => {
    if (activeTool === 'evidence' || activeTool === 'rule-check') {
      return <><div className="domain-check-list">{['现场勘验记录与照片', '涉案物品来源及保管链', '关键人员询问笔录', '调取手续与审批回执'].map((item, index) => <label key={item}><input type="checkbox" checked={checks[index]} onChange={() => setChecks((state) => state.map((value, cursor) => cursor === index ? !value : value))} /><span>{item}</span><small>{checks[index] ? '已具备' : '待补齐'}</small></label>)}</div><div className="domain-warning"><AlertTriangle size={15} /><span>{checks.filter(Boolean).length < checks.length ? '还有 ' + (checks.length - checks.filter(Boolean).length) + ' 项材料需要补齐，暂不建议提交审核。' : '当前清单已满足提交前自检条件。'}</span></div><button type="button" className="domain-primary-button">确认取证清单</button><small className="domain-action-safety">取证清单仅提交人工确认队列，不直接写入卷宗。</small></>;
    }
    if (activeTool === 'document' || activeTool === 'transfer') {
      return <><div className="domain-document-preview"><div className="domain-document-line long" /><div className="domain-document-line" /><div className="domain-document-line medium" /><div className="domain-document-line" /><span><CheckCircle2 size={14} />{documentReady ? '卷宗草稿已生成，待签发' : '发现 2 处待人工确认'}</span></div><div className="domain-button-row"><button type="button" className="domain-primary-button" onClick={() => setDocumentReady(true)}>确认文书草稿</button><button type="button" className="domain-secondary-button" onClick={() => setActiveTool('transfer')}>确认移送材料</button></div><small className="domain-action-safety">文书与移送材料必须由办案民警确认，法律与量刑建议附法条/判例出处。</small></>;
    }
    if (activeTool === 'similar' || activeTool === 'linkage') {
      return <><div className="domain-similar-list"><div><span>2026-0421</span><strong>同区域、同作案手段</strong><b>建议区间：待核定</b></div><div><span>2026-0318</span><strong>多次盗窃、证据链完整</strong><b>差异点：涉案金额</b></div><div><span>2025-1186</span><strong>夜间连续作案类案</strong><b>需补：主观故意材料</b></div></div><button className="domain-text-button" type="button">打开类案与线索图谱 <ArrowRight size={14} /></button></>;
    }
    return <><div className="domain-search-row"><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="案件检索内容" /><button type="button"><ScanSearch size={15} />检索</button></div><div className="domain-citation-list"><div><strong>《中华人民共和国刑法》第二百六十四条</strong><small>盗窃罪 · 需结合数额、次数、主观故意判断</small><b>依据 0.96</b></div><div><strong>最高人民法院相关指导案例</strong><small>夜间连续作案 · 同类案件量刑区间待人工确认</small><b>类案 12 条</b></div><div><strong>内部执法指引 / 2026 版</strong><small>{query} · 已关联到当前案件卷宗</small><b>已引用</b></div></div></>;
  };

  return (
    <section className="domain-page case-domain-page">
      <DomainHeader eyebrow="执法办案系统 / CASE INTELLIGENCE" title="案件卷宗—证据链工作台" description="以一份当前案件卷宗为对象，串联案件受理、证据链校验、法条与类案辅助、程序节点审核和移送归档。" icon={FileCheck2} apiOnline={apiOnline} navigate={navigate} />
      <div className="domain-metrics"><DomainMetric label="在办案件" value={caseCount} note="案件主数据目录" icon={FileCheck2} tone="purple" /><DomainMetric label="待校验证据" value={checks.filter((item) => !item).length} note="提交前质量检查" icon={ClipboardCheck} tone="orange" /><DomainMetric label="今日关联警情" value={eventCount} note="统一事件链" icon={Radio} tone="blue" /><DomainMetric label="人工责任链" value="100%" note="审批与签发留痕" icon={ShieldCheck} tone="green" /></div>
      <ObjectWorkbench
        className="case-dossier-workbench"
        navigate={navigate}
        objectPanel={<><CurrentObjectCard label="当前案件卷宗" title="盗窃案件 · 夜间多次作案" status="证据补强中" details={[{ label: '案件编号', value: 'CASE-2026-0428' }, { label: '主办民警', value: '办案民警 07' }, { label: '案件阶段', value: '证据校验' }, { label: '关联警情', value: eventCount || '待同步' }]} /><section className="domain-panel"><PanelHeading kicker="EVIDENCE CHAIN" title="证据链状态" icon={ClipboardCheck} /><div className="domain-check-list">{['现场物证', '视频资料', '询问笔录', '调取手续'].map((item, index) => <label key={item}><span>{item}</span><small>{checks[index] ? '已入卷' : '待补充'}</small></label>)}</div></section><AiAssistMenu label="办案 AI 助手" modules={caseModules} activeId={activeTool} onSelect={setActiveTool} /></>}
        processPanel={<><section className="domain-panel"><PanelHeading kicker="CASE PROCESS" title="案件卷宗—证据链台" icon={Workflow} description="卷宗、证据、法条和程序节点在同一案件对象下流转。"/><ProcessSteps label="案件" steps={processSteps} active={activeProcess} onSelect={selectProcess} doneUntil={checks.filter(Boolean).length > 1 ? 1 : 0} /></section><section className="domain-panel domain-active-process"><PanelHeading kicker="CURRENT CASE ACTION" title={activeModule.title} icon={activeModule.icon} description={activeModule.detail} />{renderCaseTool()}<ContractNote>法律检索、证据校验和文书草稿均为辅助结果，由办案民警确认后进入案件卷宗。</ContractNote></section></>}
      />
    </section>
  );
}

export function CommunityPolicingPage({ overview, apiOnline, navigate }: DomainPageProps) {
  const [activeTool, setActiveTool] = useState('profile');
  const [activeProcess, setActiveProcess] = useState(0);
  const [selectedRisk, setSelectedRisk] = useState(0);
  const [planCreated, setPlanCreated] = useState(false);
  const [visitNote, setVisitNote] = useState('');
  const [visitReturned, setVisitReturned] = useState(false);
  const activeModule = communityModules.find((module) => module.id === activeTool) ?? communityModules[0];
  const tasks = ['走访重点人员家庭', '复核校园周边治安隐患', '更新出租房屋网格档案', '跟进重复报警地址'];
  const risks = ['同一地址 24 小时内重复报警', '沿街商铺夜间噪声投诉上升', '重点人员服务事项即将到期'];
  const processSteps: ProcessStep[] = [
    { label: '辖区建档', detail: '维护人地事物与网格档案', tool: 'profile' },
    { label: '风险事件', detail: '关联重复警情与隐患', tool: 'analysis' },
    { label: '任务派发', detail: '生成走访计划并明确责任', tool: 'visit' },
    { label: '走访回传', detail: '回填结果并进入闭环复核', tool: 'closure' },
  ];
  const selectProcess = (index: number) => {
    setActiveProcess(index);
    setActiveTool(processSteps[index].tool ?? activeTool);
  };

  const renderCommunityProcess = () => {
    if (activeProcess === 0) {
      return <><div className="community-grid-map"><span className="grid-map-label label-a">东湖街道 <b>12</b></span><span className="grid-map-label label-b">青山湖片区 <b>8</b></span><span className="grid-map-label label-c">站前网格 <b>5</b></span><span className="grid-map-label label-d">重点地址 <b>3</b></span><div className="grid-map-river" /><div className="grid-map-lines" /></div><div className="community-map-legend"><span><i className="blue" />稳定网格</span><span><i className="orange" />关注网格</span><span><i className="red" />重点核查</span></div></>;
    }
    if (activeProcess === 1) {
      return <div className="community-risk-list">{risks.map((risk, index) => <button key={risk} type="button" className={selectedRisk === index ? 'active' : ''} onClick={() => setSelectedRisk(index)}><span className={'community-risk-index ' + (index === 0 ? 'high' : 'medium')}>{index === 0 ? '高' : '中'}</span><div><strong>{risk}</strong><small>{selectedRisk === index ? '当前查看：已关联警情、地址和责任网格' : '关联警情、地址和责任网格'}</small></div><ArrowRight size={14} /></button>)}</div>;
    }
    if (activeProcess === 2) {
      return <><div className="community-task-list">{tasks.map((task, index) => <div key={task}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{task}</strong><small>{index % 2 ? '社区民警 · 今日 16:00 前' : '网格员 · 今日 14:30 前'}</small></div><b>{planCreated || index < 2 ? '已派发' : '待领取'}</b></div>)}</div><button type="button" className="domain-primary-button" onClick={() => setPlanCreated(true)}>{planCreated ? '走访计划已派发' : '生成并派发走访计划'}</button></>;
    }
    return <><div className="ops-capability-body"><label className="ops-field-label">走访回传记录</label><textarea value={visitNote} onChange={(event) => { setVisitNote(event.target.value); setVisitReturned(false); }} placeholder="记录走访对象、现场情况、整改证据和下一步安排" rows={4} /><button type="button" className="domain-primary-button" onClick={() => setVisitReturned(Boolean(visitNote.trim()))}>{visitReturned ? '走访回传已进入闭环复核' : '提交走访回传'}</button></div>{visitReturned && <div className="ops-result-card"><strong>闭环复核任务已创建</strong><span>责任网格：站前网格 · 复核时限：24 小时内</span><small>审计编号：COMMUNITY-VISIT-0001</small></div>}</>;
  };

  return (
    <section className="domain-page community-domain-page">
      <DomainHeader eyebrow="社区警务系统 / COMMUNITY OPERATIONS" title="辖区对象—风险任务工作台" description="以一个辖区对象为中心，把人地事物档案、风险事件、走访任务和回传复核连成可持续更新的基层治理链。" icon={MapPinned} apiOnline={apiOnline} navigate={navigate} />
      <div className="domain-metrics"><DomainMetric label="辖区网格" value="—" note="组织与地址目录" icon={MapPinned} tone="blue" /><DomainMetric label="待办走访" value={overview.stats?.community_tasks ?? '—'} note="按风险自动排序" icon={UsersRound} tone="green" /><DomainMetric label="风险线索" value={risks.length} note="重复警情与隐患" icon={AlertTriangle} tone="orange" /><DomainMetric label="闭环率" value={(overview.stats?.completion_rate ?? 0) + '%'} note="任务回访结果" icon={CheckCircle2} tone="purple" /></div>
      <ObjectWorkbench
        className="community-territory-workbench"
        navigate={navigate}
        objectPanel={<><CurrentObjectCard label="当前辖区对象" title="站前网格 · 东湖街道" status="持续建档中" details={[{ label: '重点地址', value: 3 }, { label: '今日风险事件', value: risks.length }, { label: '待办走访', value: overview.stats?.community_tasks ?? 4 }, { label: '当前责任', value: '社区民警 17' }]} /><section className="domain-panel community-object-contract"><PanelHeading kicker="COMMUNITY OBJECTS" title="辖区对象与走访账本" icon={MapPinned} /><p>辖区、网格、地址、重点人地事物画像</p><p>走访任务和隐患清单</p><p>重复警情聚合与风险热力</p><p>走访回传、照片/文字证据和闭环复核</p><p>与接处警、移动勤务、训练复盘的关联入口</p></section><section className="domain-panel"><PanelHeading kicker="RISK EVENT" title="风险事件" icon={AlertTriangle} /><div className="community-risk-list">{risks.map((risk, index) => <button key={risk} type="button" className={selectedRisk === index ? 'active' : ''} onClick={() => { setSelectedRisk(index); setActiveProcess(1); }}><span className={'community-risk-index ' + (index === 0 ? 'high' : 'medium')}>{index === 0 ? '高' : '中'}</span><div><strong>{risk}</strong><small>进入风险研判</small></div><ArrowRight size={14} /></button>)}</div></section><AiAssistMenu label="社区 AI 助手" modules={communityModules} activeId={activeTool} onSelect={setActiveTool} /></>}
        processPanel={<><section className="domain-panel"><PanelHeading kicker="COMMUNITY CLOSED LOOP" title="辖区对象—风险任务台" icon={Workflow} description="辖区档案、风险事件、任务派发和走访回传围绕同一个网格对象闭环。"/><ProcessSteps label="社区警务" steps={processSteps} active={activeProcess} onSelect={selectProcess} doneUntil={planCreated ? 2 : 0} /></section><section className="domain-panel domain-active-process"><PanelHeading kicker="CURRENT COMMUNITY ACTION" title={processSteps[activeProcess].label} icon={activeModule.icon} description={activeModule.detail} />{renderCommunityProcess()}<ContractNote>风险研判和任务建议由社区民警确认，走访材料与复核结果完整留痕。</ContractNote></section></>}
      />
    </section>
  );
}

export function TrainingOperationsPage({ overview, apiOnline, navigate, refresh }: DomainPageProps) {
  const [activeTool, setActiveTool] = useState('course');
  const [activeProcess, setActiveProcess] = useState(0);
  const [courseName, setCourseName] = useState('纠纷警情规范处置 · MR 实战课程');
  const [courseReady, setCourseReady] = useState(false);
  const [simulationDone, setSimulationDone] = useState(false);
  const [reportConfirmed, setReportConfirmed] = useState(false);
  const [archiveReady, setArchiveReady] = useState(false);
  const activeModule = trainingModules.find((module) => module.id === activeTool) ?? trainingModules[0];
  const processSteps: ProcessStep[] = [
    { label: '课程编排', detail: '定义目标、学员和训练空间', tool: 'course' },
    { label: '学员画像', detail: '读取短板和复训需求', tool: 'report' },
    { label: '模拟训练', detail: '进入 AI 教官实战场景', tool: 'simulation' },
    { label: '训练档案', detail: '确认报告并沉淀一人一档', tool: 'archive' },
  ];
  const selectProcess = (index: number) => {
    setActiveProcess(index);
    setActiveTool(processSteps[index].tool ?? activeTool);
  };

  const renderTrainingProcess = () => {
    if (activeProcess === 0) {
      return <div className="training-ops-body"><label className="ops-field-label">课程名称</label><input value={courseName} onChange={(event) => { setCourseName(event.target.value); setCourseReady(false); }} /><div className="training-mr-preview"><strong>MR 场景编排</strong><p>空间：站前路口 · 对象：涉事双方、围观人员、执法记录仪 · 验收：站位、问询、风险控制</p></div><button type="button" className="domain-primary-button" onClick={() => setCourseReady(Boolean(courseName.trim()))}>{courseReady ? '课程草案已生成' : '生成课程草案'}</button></div>;
    }
    if (activeProcess === 1) {
      return <div className="training-ops-body"><div className="training-radar"><div className="training-radar-shape" /><span className="radar-label radar-label-a">询问</span><span className="radar-label radar-label-b">站位</span><span className="radar-label radar-label-c">取证</span><span className="radar-label radar-label-d">体能</span><strong>短板画像</strong></div><div className="training-push-copy"><strong>学员：民警 017</strong><p>建议优先补强现场站位与关键问询顺序，并在 7 日内完成一次复训。</p><button type="button" className="domain-primary-button" onClick={() => setReportConfirmed(true)}>{reportConfirmed ? '学员画像已确认' : '确认学员训练计划'}</button></div></div>;
    }
    if (activeProcess === 2) {
      return <div className="training-ops-body"><div className="training-scenario-head"><span>场景 12 / 39</span><strong>纠纷警情规范处置</strong><small>AI 教官实时捕捉法言法语、执法站位和处置顺序</small></div><div className="training-score-grid"><div><small>法言法语</small><strong>{simulationDone ? '88' : '—'}</strong><span>/ 100</span></div><div><small>执法站位</small><strong>{simulationDone ? '76' : '—'}</strong><span>/ 100</span></div><div><small>流程完整度</small><strong>{simulationDone ? '91' : '—'}</strong><span>/ 100</span></div></div><div className="training-evidence-note"><span>评分依据：处置规范、训练任务书与动作节点</span><span>动作识别数据时间：2026-09-05 09:30</span></div><div className="domain-button-row"><button type="button" className="domain-primary-button" onClick={() => setSimulationDone(true)}><BrainCircuit size={15} />{simulationDone ? '训练已结束，查看评分' : '开始 AI 实战模拟'}</button><button type="button" className="domain-secondary-button" onClick={() => setSimulationDone(false)}>重新训练</button></div>{simulationDone && <div className="training-live-feedback"><CheckCircle2 size={15} /><span>已完成一次训练 · AI 教官捕捉 14 个动作节点 · 人工复核入口已开放</span></div>}</div>;
    }
    return <div className="training-ops-body"><div className="training-archive-card"><div className="training-avatar"><UsersRound size={21} /></div><div><strong>民警 017 · 训练档案</strong><p>已汇聚课程、模拟评分、体能记录和复训建议。</p><small>更新于刚刚 · 审计编号：TRAIN-017-2026</small></div></div><button type="button" className="domain-primary-button" onClick={() => setArchiveReady(true)}>{archiveReady ? '报告确认并写入训练档案' : '确认报告并写入训练档案'}</button>{archiveReady && <ContractNote>训练报告已由教官确认，后续复训将按短板画像自动推送。</ContractNote>}</div>;
  };

  return (
    <section className="domain-page training-operations-page">
      <DomainHeader eyebrow="勤务训练系统 / TRAINING OPERATIONS" title="课程—学员—场景—档案工作台" description="以一项具体训练为对象，编排课程、关联学员短板、进入模拟场景并把报告确认后写入一人一档。" icon={BrainCircuit} apiOnline={apiOnline} navigate={navigate} />
      <div className="domain-metrics"><DomainMetric label="训练档案" value={overview.stats?.training_records ?? '—'} note="一人一档" icon={Database} tone="blue" /><DomainMetric label="本周训练任务" value="4" note="待执行 / 复训" icon={ClipboardCheck} tone="orange" /><DomainMetric label="AI教官" value="39 场景" note="模拟执法场景库" icon={BrainCircuit} tone="purple" /><DomainMetric label="动作识别" value="在线" note="训练芯片接入" icon={Activity} tone="green" /></div>
      <ObjectWorkbench
        className="training-course-workbench"
        navigate={navigate}
        objectPanel={<><CurrentObjectCard label="当前训练对象" title={courseName || '待命名课程'} status={simulationDone ? '报告待确认' : '课程执行中'} details={[{ label: '学员', value: '民警 017' }, { label: '训练场景', value: '场景 12 / 39' }, { label: '训练目标', value: '纠纷规范处置' }, { label: '档案状态', value: archiveReady ? '已沉淀' : '待确认' }]} /><section className="domain-panel"><PanelHeading kicker="TRAINING OBJECTS" title="课程 / 学员 / 场景 / 档案" icon={Layers3} /><div className="domain-object-details"><div><strong>课程</strong><small>{courseReady ? '草案已生成' : '待编排'}</small></div><div><strong>学员</strong><small>{reportConfirmed ? '计划已确认' : '短板待确认'}</small></div><div><strong>场景</strong><small>{simulationDone ? '已完成评分' : '待训练'}</small></div><div><strong>档案</strong><small>{archiveReady ? '已沉淀' : '待写入'}</small></div></div></section><AiAssistMenu label="训练 AI 助手" modules={trainingModules} activeId={activeTool} onSelect={setActiveTool} /></>}
        processPanel={<><section className="domain-panel"><PanelHeading kicker="TRAINING PROCESS" title="课程—学员—场景—档案台" icon={Workflow} description="训练对象每一步均与学员身份、场景数据和训练档案相连。"/><ProcessSteps label="训练" steps={processSteps} active={activeProcess} onSelect={selectProcess} doneUntil={archiveReady ? 4 : simulationDone ? 3 : courseReady ? 1 : 0} /></section><section className="domain-panel domain-active-process"><PanelHeading kicker="CURRENT TRAINING ACTION" title={processSteps[activeProcess].label} icon={activeModule.icon} description={activeModule.detail} />{renderTrainingProcess()}<div className="domain-button-row"><button type="button" className="domain-secondary-button" onClick={() => void refresh?.()}>同步训练档案</button></div></section></>}
      />
    </section>
  );
}

export function MobileDutyPage({ overview, apiOnline, navigate }: DomainPageProps) {
  const [activeTool, setActiveTool] = useState('command');
  const [activeProcess, setActiveProcess] = useState(0);
  const [signed, setSigned] = useState(false);
  const [identityQuery, setIdentityQuery] = useState('');
  const [verified, setVerified] = useState(false);
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [resultNote, setResultNote] = useState('');
  const [resultReturned, setResultReturned] = useState(false);
  const activeModule = mobileModules.find((module) => module.id === activeTool) ?? mobileModules[0];
  const processSteps: ProcessStep[] = [
    { label: '任务签收', detail: '确认接收现场处置任务', tool: 'command' },
    { label: '身份核验', detail: '核验人员、车辆与关联对象', tool: 'identity' },
    { label: '伴随指引', detail: '按现场状态推送处置要点', tool: 'guide' },
    { label: '结果回传', detail: '提交现场结果并生成记录', tool: 'office' },
  ];
  const selectProcess = (index: number) => {
    setActiveProcess(index);
    setActiveTool(processSteps[index].tool ?? activeTool);
  };

  const renderMobileProcess = () => {
    if (activeProcess === 0) {
      return <><div className="mobile-assistant-message"><span className="mobile-avatar"><BrainCircuit size={15} /></span><div><strong>AI数字警察</strong><p>当前任务建议先确认现场人员关系、是否有伤情，并按三级处置指引完成取证。</p><small>依据：接处警规范 · 数据时间：刚刚</small></div></div><div className="mobile-action-row"><button type="button" className="domain-primary-button" onClick={() => setSigned(true)}><Radio size={15} />{signed ? '当前任务已签收' : '签收当前任务'}</button><button type="button" className="domain-secondary-button" onClick={() => setActiveTool('qa')}><MessageSquareText size={15} />打开移动问答</button></div></>;
    }
    if (activeProcess === 1) {
      return <><p className="mobile-identity-panel-copy">输入身份证号、车牌或上传现场照片，返回匹配对象和核验依据。</p><div className="mobile-identity-form"><input value={identityQuery} onChange={(event) => { setIdentityQuery(event.target.value); setVerified(false); setIdentityConfirmed(false); }} placeholder="输入身份证号 / 车牌号" aria-label="身份核验内容" /><button type="button" onClick={() => setVerified(Boolean(identityQuery.trim()))}><ScanSearch size={15} />核验</button></div>{verified ? <><div className="mobile-identity-result"><span className="mobile-result-icon"><CheckCircle2 size={17} /></span><div><strong>核验结果已生成</strong><small>匹配对象：待人工确认 · 置信度 96% · 依据：任务关联对象 · 数据时间：2026-09-05 09:30</small></div><b>查看依据</b></div><div className="domain-button-row"><button type="button" className="domain-primary-button" onClick={() => setIdentityConfirmed(true)}>{identityConfirmed ? '核验线索已进入确认队列' : '人工确认核验线索'}</button><button type="button" className="domain-secondary-button">回退人工处理</button></div><small className="domain-action-safety">身份、车牌或目标识别仅作为核验线索，不能替代人工确认。</small></> : <div className="domain-empty-inline"><Fingerprint size={16} />等待输入核验目标</div>}</>;
    }
    if (activeProcess === 2) {
      return <><div className="mobile-workflow-list">{['确认现场人员关系与伤情', '完成身份和车辆核验', '按警情类别执行处置要点', '同步留存现场证据'].map((step, index) => <div key={step}><span className={index < 2 || signed ? 'done' : ''}>{index < 2 || signed ? <CheckCircle2 size={14} /> : String(index + 1).padStart(2, '0')}</span><div><strong>{step}</strong><small>{index < 2 || signed ? '已确认 / 可复核' : 'AI 将根据现场状态提示'}</small></div><ArrowRight size={14} /></div>)}</div><div className="mobile-voice-strip"><Mic size={15} /><span>按住说话：查询办事指南、播报处置步骤</span><b>语音在线</b></div></>;
    }
    return <div className="ops-capability-body"><label className="ops-field-label">现场结果回传</label><textarea value={resultNote} onChange={(event) => { setResultNote(event.target.value); setResultReturned(false); }} placeholder="填写现场处置结果、人员状态、证据留存和后续任务" rows={4} /><div className="mobile-network-note"><span>弱网状态：本地缓存时间 2026-09-05 09:30</span><b>待回传队列：{resultReturned ? 0 : 1}</b></div><button type="button" className="domain-primary-button" onClick={() => setResultReturned(Boolean(resultNote.trim()))}>{resultReturned ? '现场结果已回传' : '确认并回传结果'}</button>{resultReturned && <div className="ops-result-card"><strong>处置记录已生成</strong><span>当前任务已进入事件链归档，等待后续审核。</span><small>审计编号：MOBILE-DUTY-0001 · 数据时间：刚刚</small></div>}</div>;
  };

  return (
    <section className="domain-page mobile-domain-page">
      <DomainHeader eyebrow="移动勤务系统 / FIELD COMMAND" title="现场任务—核验—回传工作台" description="以民警手中的单个现场任务为对象，在移动端完成签收、身份核验、伴随指引和结果回传。" icon={Smartphone} apiOnline={apiOnline} navigate={navigate} />
      <div className="domain-metrics"><DomainMetric label="在线警力" value={overview.stats?.online_staff ?? 0} note="组织与移动端状态" icon={UsersRound} tone="green" /><DomainMetric label="现场任务" value={overview.stats?.pending_orders ?? 0} note="待签收与处置中" icon={Workflow} tone="blue" /><DomainMetric label="待核验" value={verified ? 0 : '—'} note="身份与车辆目标" icon={Fingerprint} tone="orange" /><DomainMetric label="伴随指引" value="已启用" note="按警情类别推送" icon={Target} tone="purple" /></div>
      <ObjectWorkbench
        className="mobile-field-workbench"
        navigate={navigate}
        objectPanel={<><CurrentObjectCard label="当前现场任务" title="纠纷警情 · 站前路口" status={resultReturned ? '已回传' : signed ? '现场处置中' : '待签收'} details={[{ label: '任务编号', value: 'MOBILE-ALARM-001' }, { label: '处置地点', value: '站前路口东南侧' }, { label: '任务来源', value: '接处警系统' }, { label: '当前民警', value: '巡逻组 A' }]} /><section className="domain-panel"><PanelHeading kicker="FIELD TASK CARD" title="现场任务卡" icon={Smartphone} /><div className="domain-object-details"><div><strong>风险等级</strong><small>二级关注</small></div><div><strong>身份核验</strong><small>{verified ? '已生成结果' : '待执行'}</small></div><div><strong>伴随指引</strong><small>处置要点已加载</small></div><div><strong>回传状态</strong><small>{resultReturned ? '已归档' : '待回传'}</small></div></div></section><AiAssistMenu label="移动勤务 AI 助手" modules={mobileModules} activeId={activeTool} onSelect={setActiveTool} /></>}
        processPanel={<><section className="domain-panel"><PanelHeading kicker="FIELD DISPOSITION" title="现场任务—核验—回传台" icon={Workflow} description="所有移动端输入先关联当前任务，再进入统一事件链、审计链和人工确认链。"/><ProcessSteps label="移动勤务" steps={processSteps} active={activeProcess} onSelect={selectProcess} doneUntil={resultReturned ? 4 : verified ? 2 : signed ? 1 : 0} /></section><section className="domain-panel domain-active-process"><PanelHeading kicker="CURRENT FIELD ACTION" title={processSteps[activeProcess].label} icon={activeModule.icon} description={activeModule.detail} />{renderMobileProcess()}<ContractNote>身份核验、识别和处置建议不直接作为执法结论，须由现场民警确认后回传。</ContractNote></section></>}
      />
    </section>
  );
}

export function AICenterPage({ overview, apiOnline, navigate }: DomainPageProps) {
  const [runtime, setRuntime] = useState<AiRuntimeSnapshot | null>(null);
  const [reviewedResult, setReviewedResult] = useState<AIResultContract | null>(null);
  const [reviewState, setReviewState] = useState('正在读取本地 AI 运行态…');

  useEffect(() => {
    let active = true;
    void fetch(`${AI_CENTER_API}/ai-center/runtime`)
      .then((response) => response.ok ? response.json() as Promise<AiRuntimeSnapshot> : Promise.reject(new Error('runtime unavailable')))
      .then((snapshot) => {
        if (!active) return;
        setRuntime(snapshot);
        setReviewState('运行态已同步；高风险建议等待人工确认。');
      })
      .catch(() => {
        if (active) setReviewState('运行态暂不可用，当前展示本地受控目录。');
      });
    return () => { active = false; };
  }, []);

  const fallbackAgents = [
    { name: '接处警协同 Agent', status: 'active', currentTask: '警情摘要与分级建议', latency: '240ms' },
    { name: '执法办案助手 Agent', status: 'active', currentTask: '法条与证据规则检索', latency: '310ms' },
    { name: '勤务训练教官 Agent', status: 'active', currentTask: '模拟评分、动作识别、短板画像', latency: '260ms' },
    { name: '移动勤务伴随 Agent', status: 'running', currentTask: '现场指引与核验提示', latency: '180ms' },
  ];
  const fallbackSkills = [
    { name: '警情结构化抽取', status: 'active', trigger: '接警语音进入', confidence: 96 },
    { name: '证据规则校验', status: 'active', trigger: '案件提交前', confidence: 92 },
    { name: '训练短板画像', status: 'active', trigger: '训练结束后', confidence: 88 },
    { name: '移动现场指引', status: 'active', trigger: '民警签收现场任务后', confidence: 90 },
  ];
  const fallbackConnectors = [
    { name: '公安主数据目录 MCP', status: '在线', scope: '组织 / 人员 / 地点 / 车辆（只读）', lastSync: '刚刚', writeAllowed: false },
    { name: '法律与类案知识库 MCP', status: '在线', scope: '法条 / 判例 / 内部制度（只读）', lastSync: '刚刚', writeAllowed: false },
    { name: '统一事件链 MCP', status: '在线', scope: '警情 / 案件 / 训练 / 移动（只读）', lastSync: '刚刚', writeAllowed: false },
  ];
  const model = runtime?.model ?? { name: '国产大模型（内网部署）', status: '待同步', providers: ['DeepSeek', 'Qwen3'] };
  const capabilities = runtime?.capabilities ?? [
    { name: '文本理解与生成', scope: '警单、卷宗、制度、报告', status: '待同步' },
    { name: '语音转写与结构化', scope: '接警、问询、移动勤务', status: '待接入' },
    { name: '视觉与动作识别', scope: '训练动作、目标复核', status: '按权限启用' },
    { name: '知识库与类案检索', scope: '法条、判例、内部制度', status: '待接入' },
  ];
  const agents = runtime?.agents ?? (overview.ai_copilot?.agents?.length ? overview.ai_copilot.agents : fallbackAgents);
  const skills = runtime?.skills ?? (overview.ai_copilot?.skills?.length ? overview.ai_copilot.skills : fallbackSkills);
  const connectors = runtime?.mcpConnectors ?? fallbackConnectors;
  const result = reviewedResult ?? runtime?.sampleResult;

  const submitReview = async (decision: 'confirmed' | 'rejected') => {
    if (!result || result.reviewStatus !== 'pending') return;
    setReviewState('正在提交人工决定…');
    const authToken = window.localStorage.getItem('public-security-ai-auth-token')?.trim();
    try {
      const response = await fetch(`${AI_CENTER_API}/ai-center/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ auditId: result.auditId, decision, reason: decision === 'confirmed' ? '人工核验通过' : '人工核验后不采纳该建议' }),
      });
      if (response.status === 401) {
        setReviewState('当前未登录或登录已过期，请重新登录后再提交人工决定。');
        return;
      }
      if (response.status === 403) {
        setReviewState('当前账号不具备 AI 人工审核（review）权限，请由管理员配置后重试。');
        return;
      }
      if (!response.ok) throw new Error('review unavailable');
      const next = await response.json() as AIResultContract;
      setReviewedResult(next);
      setReviewState(decision === 'confirmed' ? '已记录人工确认；业务状态仍需由业务系统另行办理。' : '已驳回建议并保留人工回退流程。');
    } catch {
      setReviewState('人工决定未写入，请在权限恢复后重试。');
    }
  };

  return (
    <section className="domain-page ai-center-page">
      <DomainHeader eyebrow="统一 AI 能力中心 / AI RUNTIME" title="把模型、Agent、Skill 和 MCP 变成可审计的业务能力" description="统一管理国产大模型、知识库、智能体、技能策略和工具连接器，为五种业务对象工作台提供同一套输出规范。" icon={BrainCircuit} apiOnline={apiOnline} navigate={navigate} backLabel="返回平台总览" />
      <div className="domain-metrics"><DomainMetric label="国产模型" value={model.providers.length} note={model.providers.join(' / ')} icon={BrainCircuit} tone="blue" /><DomainMetric label="Agent" value={agents.length} note="按业务角色编排" icon={Workflow} tone="purple" /><DomainMetric label="Skill" value={skills.length} note="可审计策略" icon={Target} tone="green" /><DomainMetric label="MCP" value={connectors.length} note="白名单只读连接器" icon={Network} tone="orange" /></div>
      <div className="ai-center-grid">
        <section className="domain-panel ai-model-panel"><PanelHeading kicker="MODEL RUNTIME" title="统一 AI 智算引擎" icon={BrainCircuit} /><div className="ai-model-hero"><div className="ai-model-orb"><BrainCircuit size={25} /></div><div><strong>{model.name}</strong><small>公安内网部署 · 统一推理网关 · 结果可追溯</small></div><b>{model.status}</b></div><div className="ai-capability-list">{capabilities.map((item, index) => <div key={item.name}><span className={'ai-capability-dot ' + (index === 0 ? 'ready' : 'pending')} /><strong>{item.name}</strong><small>{item.scope} · {item.status}</small></div>)}</div><ContractNote>所有高风险建议默认进入人工确认队列，不直接执行。</ContractNote></section>
        <section className="domain-panel ai-contract-panel"><PanelHeading kicker="AI OUTPUT CONTRACT" title="统一输出规范" icon={ShieldCheck} /><div className="ai-contract-list">{['结果：给出可执行建议', '置信度：展示模型把握程度', '依据：法条、制度、数据时间', '解释：说明关键判断要点', '人工确认：明确责任人和动作', '回退：保留人工处理入口', '审计：生成唯一审计编号'].map((item, index) => <div key={item}><span>{String(index + 1).padStart(2, '0')}</span><strong>{item}</strong><CheckCircle2 size={14} /></div>)}</div></section>
      </div>
      <div className="ai-runtime-grid">
        <section className="domain-panel"><PanelHeading kicker="AGENT REGISTRY" title="业务智能体" icon={Workflow} /><div className="ai-runtime-list">{agents.map((agent) => <div key={agent.name}><span className={'ai-status-dot ' + agent.status} /><div><strong>{agent.name}</strong><small>{agent.currentTask}</small></div><b>{agent.latency}</b></div>)}</div></section>
        <section className="domain-panel"><PanelHeading kicker="SKILL POLICY" title="技能策略" icon={Target} /><div className="ai-runtime-list">{skills.map((skill) => <div key={skill.name}><span className="ai-status-dot active" /><div><strong>{skill.name}</strong><small>{skill.trigger}</small></div><b>{skill.confidence}%</b></div>)}</div></section>
        <section className="domain-panel"><PanelHeading kicker="MCP CONNECTORS" title="工具与数据连接器" icon={Network} /><div className="ai-runtime-list">{connectors.map((connector) => <div key={connector.name}><span className="ai-status-dot active" /><div><strong>{connector.name}</strong><small>{connector.scope} · {connector.writeAllowed ? '可写入' : '只读白名单'}</small></div><b>{connector.lastSync}</b></div>)}</div></section>
      </div>
      <section className="domain-panel ai-contract-panel" aria-live="polite"><PanelHeading kicker="AI RESULT RESPONSIBILITY" title="AI 结果责任链" icon={ShieldCheck} description={reviewState} />{result ? <div className="ai-runtime-list"><div><span className="ai-status-dot active" /><div><strong>{result.result}</strong><small>置信度 {result.confidence}% · {result.evidence?.join('；') || result.evidenceTime || '暂无依据'} · 审计编号 {result.auditId}</small></div><b>{result.reviewStatus === 'pending' ? '待人工确认' : result.reviewStatus === 'confirmed' ? '已确认' : '已驳回'}</b></div><div><span className="ai-status-dot pending" /><div><strong>回退说明</strong><small>{result.fallbackAction || '转人工处理，不自动改变业务状态'}</small></div><b>{result.humanReviewRequired ? '人工确认' : '无需复核'}</b></div></div> : <ContractNote>AI 结果正在等待运行态返回；不可用时应转人工处理。</ContractNote>}<div className="domain-button-row"><button type="button" className="domain-primary-button" onClick={() => void submitReview('confirmed')} disabled={!result || result.reviewStatus !== 'pending'}><CheckCircle2 size={15} />人工确认</button><button type="button" className="domain-secondary-button" onClick={() => void submitReview('rejected')} disabled={!result || result.reviewStatus !== 'pending'}><AlertTriangle size={15} />驳回并回退</button></div><ContractNote>审核请求携带 Bearer token；审核人由 token 对应用户确定，operatorId 不由前端传入。账号需具备 review 权限；确认或驳回均不直接改变派警、案件、审批或档案状态。</ContractNote></section>
    </section>
  );
}
