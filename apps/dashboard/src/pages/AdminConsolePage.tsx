import {
  Activity,
  BrainCircuit,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Eye,
  KeyRound,
  Network,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Save,
  ServerCog,
  SlidersHorizontal,
  UsersRound,
  Workflow,
} from 'lucide-react';
import {
  Alert,
  App,
  Button,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Statistic,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

const REMOTE_API_BASE = typeof window !== 'undefined' ? `${window.location.origin}/api` : 'http://127.0.0.1:8010/api';
const DEFAULT_API_BASE = import.meta.env.DEV ? 'http://127.0.0.1:8010/api' : REMOTE_API_BASE;
const CORE_API = (import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE).replace(/\/$/, '');
const ADMIN_API = `${CORE_API}/admin`;

type Props = {
  apiOnline: boolean;
  refresh: () => void;
  navigate: (view: 'command' | 'duty-plan') => void;
};

type AgentRecord = {
  agentKey?: string;
  name: string;
  status: string;
  currentTask: string;
  latency: string;
};

type SkillRecord = {
  skillKey?: string;
  name: string;
  status: string;
  trigger: string;
  confidence: number;
};

type ConnectorRecord = {
  name: string;
  status: string;
  scope: string;
  lastSync: string;
};

type RoleRecord = {
  openid: string;
  role: string;
  displayName: string;
  permissions: string[];
};

type EventRecord = {
  id: string;
  title: string;
  bay?: string;
  level?: string;
  status?: string;
  owner?: string;
  time?: string;
};

type AlarmPush = {
  id: number;
  eventId: string;
  title: string;
  channel: string;
  status: string;
  createdAt: string;
  acknowledgedAt?: string | null;
};

type EventAudit = {
  id: number;
  eventId: string;
  action: string;
  operator: string;
  status: string;
  note: string;
  time: string;
};

type SystemAudit = {
  id: number;
  actor: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
};

type AccessKey = {
  keyId: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  status: string;
  expiresAt?: string | null;
  lastUsedAt?: string | null;
  createdAt: string;
};

type AdminOverview = {
  counts?: Record<string, number>;
  events?: EventRecord[];
  roles?: RoleRecord[];
  feeds?: Array<{ sourceKey: string; name: string; kind: string; status: string }>;
  agents?: AgentRecord[];
  skills?: SkillRecord[];
  auditLogs?: EventAudit[];
};

type PlatformSnapshot = {
  ai_copilot?: {
    agents?: AgentRecord[];
    skills?: SkillRecord[];
    mcp_connectors?: ConnectorRecord[];
  };
  dataCatalog?: {
    domainCount?: number;
    objectCount?: number;
    syncStatus?: string;
    domains?: Array<{ name?: string; objectCount?: number; status?: string }>;
  };
  security_model?: { configured?: boolean; model?: { exists?: boolean; sizeMb?: number } };
};

type PlatformSettings = {
  adminAuthEnabled?: boolean;
  sourceAuthEnabled: boolean;
  publicWriteRateLimitPerMinute: number;
  evidenceUploadLimitMb: number;
};

type RuntimeStatus = {
  status: string;
  database?: { status: string; engine: string };
  checkedAt?: string;
};

const defaultPlatformSettings: PlatformSettings = {
  adminAuthEnabled: false,
  sourceAuthEnabled: false,
  publicWriteRateLimitPerMinute: 20,
  evidenceUploadLimitMb: 20,
};

const fallbackAgents: AgentRecord[] = [
  { agentKey: 'command-copilot', name: '接处警协同 Agent', status: 'active', currentTask: '警情摘要与分级建议', latency: '240ms' },
  { agentKey: 'case-assistant', name: '执法办案助手 Agent', status: 'active', currentTask: '法条与证据规则检索', latency: '310ms' },
  { agentKey: 'training-coach', name: '勤务训练教官 Agent', status: 'active', currentTask: '训练评分与短板画像', latency: '280ms' },
  { agentKey: 'field-companion', name: '移动勤务伴随 Agent', status: 'running', currentTask: '现场指引与身份核验提示', latency: '180ms' },
];

const fallbackSkills: SkillRecord[] = [
  { skillKey: 'alarm-structure', name: '警情结构化抽取', status: 'active', trigger: '接警语音进入', confidence: 96 },
  { skillKey: 'evidence-check', name: '证据规则校验', status: 'active', trigger: '案件提交前', confidence: 92 },
  { skillKey: 'training-profile', name: '训练短板画像', status: 'active', trigger: '训练结束后', confidence: 88 },
  { skillKey: 'field-guidance', name: '现场指引生成', status: 'active', trigger: '移动警情签收', confidence: 94 },
];

const fallbackConnectors: ConnectorRecord[] = [
  { name: '公安主数据目录 MCP', status: '在线', scope: '组织 / 人员 / 地点 / 车辆', lastSync: '刚刚' },
  { name: '法律与类案知识库 MCP', status: '在线', scope: '法条 / 判例 / 制度', lastSync: '2 分钟前' },
  { name: '统一事件链 MCP', status: '在线', scope: '警情 / 案件 / 训练 / 移动', lastSync: '刚刚' },
];

const dataDomains = [
  { key: 'org', name: '组织与权限', detail: '机构、岗位、角色、数据授权', tone: 'blue' },
  { key: 'alarm', name: '警情与指令', detail: '接报、派警、处置、回传', tone: 'orange' },
  { key: 'case', name: '案件与证据', detail: '案件、卷宗、证据链', tone: 'purple' },
  { key: 'person', name: '人员与车辆', detail: '身份、车辆、轨迹、核验', tone: 'green' },
  { key: 'community', name: '社区与地址', detail: '网格、重点人地事物', tone: 'red' },
  { key: 'training', name: '训练与健康', detail: '课程、成绩、训练档案', tone: 'orange' },
];

const statusColor = (status: string) => {
  if (['已完成', '在线', '运行中', 'active', 'ready'].includes(status)) return 'green';
  if (['处理中', '已接收', 'running', '同步中'].includes(status)) return 'blue';
  if (['高风险', 'error', 'failed'].includes(status)) return 'red';
  if (['暂停', 'paused', 'idle', '待同步'].includes(status)) return 'gold';
  return 'default';
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = /^https?:\/\//.test(path) ? path : `${ADMIN_API}${path}`;
  const { headers, ...rest } = init ?? {};
  const response = await fetch(url, {
    ...rest,
    headers: { 'Content-Type': 'application/json', 'X-Operator': 'platform-governance', ...(headers ?? {}) },
  });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as T;
}

const governanceTabs = [
  { key: 'overview', label: '治理总览', icon: Database },
  { key: 'ai', label: 'AI 运行时', icon: BrainCircuit },
  { key: 'identity', label: '组织与权限', icon: UsersRound },
  { key: 'audit', label: '审计与确认', icon: ClipboardCheck },
  { key: 'settings', label: '安全策略', icon: ServerCog },
];

function GovernanceMetric({ icon, title, value, note, tone }: { icon: ReactNode; title: string; value: string | number; note: string; tone: string }) {
  return (
    <div className={`governance-metric ${tone}`}>
      <div className="governance-metric-label"><span>{icon}</span>{title}</div>
      <Statistic value={value} />
      <small>{note}</small>
    </div>
  );
}

function GovernanceSection({ icon, title, extra, children, className = '' }: { icon: ReactNode; title: string; extra?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`governance-section ${className}`}>
      <header className="governance-section-heading">
        <h2>{icon}{title}</h2>
        {extra && <div className="governance-section-extra">{extra}</div>}
      </header>
      <div className="governance-section-body">{children}</div>
    </section>
  );
}

export function AdminConsolePage({ apiOnline, refresh, navigate }: Props) {
  const { message } = App.useApp();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [platform, setPlatform] = useState<PlatformSnapshot | null>(null);
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [settings, setSettings] = useState<PlatformSettings>(defaultPlatformSettings);
  const [accessKeys, setAccessKeys] = useState<AccessKey[]>([]);
  const [systemAudits, setSystemAudits] = useState<SystemAudit[]>([]);
  const [alarmPushes, setAlarmPushes] = useState<AlarmPush[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [creatingKey, setCreatingKey] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [accessKeyForm] = Form.useForm<{ name: string; scopes: string[] }>();
  const [platformForm] = Form.useForm<PlatformSettings>();

  const load = async () => {
    setLoading(true);
    const results = await Promise.allSettled([
      request<AdminOverview>('/overview'),
      request<PlatformSnapshot>(`${CORE_API}/platform/overview`),
      request<RuntimeStatus>('/runtime-status'),
      request<{ settings: PlatformSettings }>('/platform-settings'),
      request<{ items: AccessKey[] }>('/access-keys'),
      request<{ items: SystemAudit[] }>('/system-audit-logs'),
      request<{ items: AlarmPush[] }>(`${CORE_API}/events/alarm-pushes`),
    ]);
    const value = <T,>(index: number): T | undefined => {
      const result = results[index];
      return result.status === 'fulfilled' ? (result.value as T) : undefined;
    };
    const admin = value<AdminOverview>(0);
    const platformPayload = value<PlatformSnapshot>(1);
    const runtimePayload = value<RuntimeStatus>(2);
    const settingsPayload = value<{ settings: PlatformSettings }>(3);
    const keyPayload = value<{ items: AccessKey[] }>(4);
    const auditPayload = value<{ items: SystemAudit[] }>(5);
    const alarmPayload = value<{ items: AlarmPush[] }>(6);
    if (admin) setOverview(admin);
    if (platformPayload) setPlatform(platformPayload);
    if (runtimePayload) setRuntime(runtimePayload);
    if (settingsPayload?.settings) {
      const next = { ...defaultPlatformSettings, ...settingsPayload.settings };
      setSettings(next);
      platformForm.setFieldsValue(next);
    }
    if (keyPayload) setAccessKeys(keyPayload.items ?? []);
    if (auditPayload) setSystemAudits(auditPayload.items ?? []);
    if (alarmPayload) setAlarmPushes(alarmPayload.items ?? []);
    if (!admin && !platformPayload && !runtimePayload) message.error('平台治理数据暂不可用');
    setLoading(false);
  };

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 20000);
    return () => window.clearInterval(timer);
  }, []);

  const agents = platform?.ai_copilot?.agents?.length ? platform.ai_copilot.agents : overview?.agents?.length ? overview.agents : fallbackAgents;
  const skills = platform?.ai_copilot?.skills?.length ? platform.ai_copilot.skills : overview?.skills?.length ? overview.skills : fallbackSkills;
  const connectors = platform?.ai_copilot?.mcp_connectors?.length ? platform.ai_copilot.mcp_connectors : fallbackConnectors;
  const roles = overview?.roles ?? [];
  const events = overview?.events ?? [];
  const eventAudits = overview?.auditLogs ?? [];
  const pendingEvents = events.filter((item) => item.status !== '已完成');
  const confirmationQueue = useMemo(() => [
    ...alarmPushes.filter((item) => !item.acknowledgedAt).map((item) => ({
      key: `alarm-${item.id}`,
      title: item.title,
      detail: `${item.channel} · ${item.eventId}`,
      status: '待人工确认',
      kind: 'alarm' as const,
      alarm: item,
    })),
    ...pendingEvents.slice(0, 8).map((item) => ({
      key: `event-${item.id}`,
      title: item.title,
      detail: `${item.bay ?? '未标注辖区'} · ${item.time ?? '时间待同步'}`,
      status: item.status ?? '待确认',
      kind: 'event' as const,
      event: item,
    })),
  ], [alarmPushes, pendingEvents]);
  const domainObjectCount = platform?.dataCatalog?.objectCount ?? Object.values(overview?.counts ?? {}).reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
  const domainCount = platform?.dataCatalog?.domainCount ?? dataDomains.length;
  const modelReady = Boolean(platform?.security_model?.configured || platform?.security_model?.model?.exists || apiOnline);
  const onlineAgentCount = agents.filter((agent) => ['active', 'running', '在线', '运行中'].includes(agent.status)).length;
  const onlineConnectorCount = connectors.filter((connector) => ['在线', 'active', 'ready'].includes(connector.status)).length;

  const updateAgent = async (agent: AgentRecord, enabled: boolean) => {
    if (!agent.agentKey) return;
    try {
      await request(`/agents/${agent.agentKey}`, { method: 'PATCH', body: JSON.stringify({ status: enabled ? 'active' : 'paused' }) });
      message.success(`${agent.name}状态已更新`);
      await load();
      refresh();
    } catch {
      message.error('Agent 状态更新失败');
    }
  };

  const updateSkill = async (skill: SkillRecord, enabled: boolean) => {
    if (!skill.skillKey) return;
    try {
      await request(`/skills/${skill.skillKey}`, { method: 'PATCH', body: JSON.stringify({ status: enabled ? 'active' : 'paused' }) });
      message.success(`${skill.name}状态已更新`);
      await load();
      refresh();
    } catch {
      message.error('Skill 策略更新失败');
    }
  };

  const saveSettings = async () => {
    try {
      const values = await platformForm.validateFields();
      setSavingSettings(true);
      const payload = await request<{ settings: PlatformSettings }>('/platform-settings', { method: 'PUT', body: JSON.stringify(values) });
      const next = { ...defaultPlatformSettings, ...(payload.settings ?? values) };
      setSettings(next);
      platformForm.setFieldsValue(next);
      message.success('平台安全策略已保存');
      await load();
    } catch {
      message.error('平台安全策略保存失败');
    } finally {
      setSavingSettings(false);
    }
  };

  const createAccessKey = async () => {
    try {
      const values = await accessKeyForm.validateFields();
      setCreatingKey(true);
      const payload = await request<AccessKey & { secret: string }>('/access-keys', { method: 'POST', body: JSON.stringify(values) });
      accessKeyForm.resetFields();
      setNewSecret(payload.secret);
      message.success('服务访问密钥已创建');
      await load();
    } catch {
      message.error('服务访问密钥创建失败');
    } finally {
      setCreatingKey(false);
    }
  };

  const revokeAccessKey = async (item: AccessKey) => {
    try {
      await request(`/access-keys/${item.keyId}`, { method: 'PATCH', body: JSON.stringify({ status: 'revoked' }) });
      message.success(`${item.name}已撤销`);
      await load();
      refresh();
    } catch {
      message.error('密钥状态更新失败');
    }
  };

  const acknowledge = async (item: AlarmPush) => {
    try {
      await request(`${CORE_API}/events/alarm-pushes/${item.id}/acknowledge`, { method: 'PATCH' });
      message.success('人工确认已记录');
      await load();
      refresh();
    } catch {
      message.error('人工确认记录失败');
    }
  };

  const dataDomainColumns: ColumnsType<(typeof dataDomains)[number]> = [
    { title: '主数据域', dataIndex: 'name', width: 230, render: (value: string, item) => <div className="admin-cell-title"><strong>{value}</strong><span>{item.detail}</span></div> },
    { title: '对象规模', key: 'objects', width: 120, render: (_value, item) => <span>{item.key === 'org' ? `${roles.length || 0} 类` : item.key === 'alarm' ? `${events.length || 0} 条` : '按授权查询'}</span> },
    { title: '健康度', key: 'health', width: 90, render: () => <Tag color={apiOnline ? 'green' : 'gold'}>{apiOnline ? '正常' : '待同步'}</Tag> },
    { title: '治理要求', key: 'governance', width: 110, render: (_value, item) => <span className="admin-table-note">{item.key === 'case' ? '全量留痕' : '分级授权'}</span> },
  ];

  const agentColumns: ColumnsType<AgentRecord> = [
    { title: '智能体', dataIndex: 'name', width: 240, render: (value: string, item) => <div className="admin-cell-title"><strong>{value}</strong><span>{item.currentTask}</span></div> },
    { title: '状态', dataIndex: 'status', width: 110, render: (value: string) => <Tag color={statusColor(value)}>{value === 'active' ? '运行中' : value === 'paused' ? '已暂停' : value}</Tag> },
    { title: '延迟', dataIndex: 'latency', width: 90, render: (value: string) => <code>{value}</code> },
    { title: '启用', key: 'enabled', width: 90, render: (_value, item) => <Switch aria-label={`${item.name}启用状态`} disabled={!item.agentKey} checked={['active', 'running', '在线', '运行中'].includes(item.status)} onChange={(checked: boolean) => updateAgent(item, checked)} checkedChildren={<Play size={12} />} unCheckedChildren={<Pause size={12} />} /> },
  ];

  const skillColumns: ColumnsType<SkillRecord> = [
    { title: '策略', dataIndex: 'name', width: 230, render: (value: string, item) => <div className="admin-cell-title"><strong>{value}</strong><span>触发：{item.trigger}</span></div> },
    { title: '置信度', dataIndex: 'confidence', width: 100, render: (value: number) => <span className="governance-confidence">{value}%</span> },
    { title: '状态', dataIndex: 'status', width: 110, render: (value: string) => <Tag color={statusColor(value)}>{value === 'active' ? '启用' : value === 'paused' ? '暂停' : value}</Tag> },
    { title: '启用', key: 'enabled', width: 90, render: (_value, item) => <Switch aria-label={`${item.name}启用状态`} disabled={!item.skillKey} checked={item.status === 'active'} onChange={(checked: boolean) => updateSkill(item, checked)} /> },
  ];

  const accessKeyColumns: ColumnsType<AccessKey> = [
    { title: '名称', dataIndex: 'name', width: 240, render: (value: string, item) => <div className="admin-cell-title"><strong>{value}</strong><span>{item.keyId}</span></div> },
    { title: '前缀', dataIndex: 'keyPrefix', width: 150, render: (value: string) => <code>{value}</code> },
    { title: '权限范围', dataIndex: 'scopes', width: 280, render: (value: string[]) => <div className="governance-tag-row">{value?.map((scope) => <Tag key={scope}>{scope}</Tag>)}</div> },
    { title: '状态', dataIndex: 'status', width: 90, render: (value: string) => <Tag color={statusColor(value)}>{value === 'active' ? '有效' : value === 'revoked' ? '已撤销' : value}</Tag> },
    { title: '操作', key: 'action', width: 90, render: (_value, item) => <Button type="text" danger disabled={item.status === 'revoked'} onClick={() => revokeAccessKey(item)}>撤销</Button> },
  ];

  const overviewView = (
    <div className="governance-content-stack">
      <div className="governance-kpi-row">
        <GovernanceMetric icon={<Database size={16} />} title="主数据域" value={domainCount} note={`${domainObjectCount} 个对象`} tone="blue" />
        <GovernanceMetric icon={<BrainCircuit size={16} />} title="统一模型" value={modelReady ? 2 : 0} note="DeepSeek / Qwen3" tone="blue" />
        <GovernanceMetric icon={<Workflow size={16} />} title="智能体运行" value={`${onlineAgentCount}/${agents.length}`} note="已运行 / 已注册" tone="green" />
        <GovernanceMetric icon={<ClipboardCheck size={16} />} title="待人工确认" value={confirmationQueue.length} note="高风险输出待审核" tone="orange" />
      </div>
      <div className="governance-baseline">
        <span>模型服务 <b>{modelReady ? '可调用' : '待接入'}</b></span>
        <span>人工确认 <b>强制保留</b></span>
        <span>主数据同步 <b>{platform?.dataCatalog?.syncStatus ?? (apiOnline ? '正常' : '待同步')}</b></span>
      </div>
      <div className="governance-two-column">
        <GovernanceSection icon={<Database size={17} />} title="主数据健康度" extra={<Tag color={apiOnline ? 'green' : 'gold'}>{apiOnline ? '同步正常' : '等待同步'}</Tag>}>
          <Table rowKey="key" size="small" scroll={{ x: 550 }} pagination={false} columns={dataDomainColumns} dataSource={dataDomains} />
        </GovernanceSection>
        <GovernanceSection icon={<ClipboardCheck size={17} />} title="人工确认队列" extra={<Tag color={confirmationQueue.length ? 'orange' : 'green'}>{confirmationQueue.length} 条</Tag>}>
          <div className="governance-confirmation-list">
            {confirmationQueue.slice(0, 6).map((item) => (
              <div className="governance-confirmation-row" key={item.key}>
                <span className={`governance-confirmation-dot ${item.kind}`} />
                <div className="governance-list-main"><strong>{item.title}</strong><small>{item.detail}</small></div>
                <Tag color={item.kind === 'alarm' ? 'orange' : statusColor(item.status)}>{item.status}</Tag>
                {item.kind === 'alarm'
                  ? <Button size="small" type="link" icon={<CheckCircle2 size={14} />} onClick={() => acknowledge(item.alarm!)}>确认</Button>
                  : <Button size="small" type="link" icon={<Eye size={14} />} onClick={() => navigate('command')}>查看</Button>}
              </div>
            ))}
            {!confirmationQueue.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前没有待人工确认项" />}
          </div>
        </GovernanceSection>
      </div>
    </div>
  );

  const aiRuntimeView = (
    <div className="governance-content-stack">
      <GovernanceSection icon={<BrainCircuit size={17} />} title="统一 AI 模型服务" extra={<Tag color={modelReady ? 'green' : 'gold'}>{modelReady ? '内网可调用' : '待接入'}</Tag>}>
        <div className="governance-model-service">
          <div className="governance-model-name"><strong>国产大模型推理网关</strong><div className="governance-tag-row"><Tag>Qwen3</Tag><Tag>DeepSeek</Tag><Tag>内网部署</Tag></div></div>
          <div className="governance-model-capabilities">
            <span><CheckCircle2 size={14} />文本理解与生成</span>
            <span><CheckCircle2 size={14} />语音转写与结构化</span>
            <span><CheckCircle2 size={14} />视觉与动作识别</span>
            <span><CheckCircle2 size={14} />知识库与类案检索</span>
          </div>
        </div>
        <Alert showIcon type="info" message="高风险建议默认进入人工确认队列" />
      </GovernanceSection>
      <div className="governance-two-column">
        <GovernanceSection icon={<Workflow size={17} />} title="Agent 注册表" extra={<Tag>{agents.length} 个</Tag>}>
          <Table<AgentRecord> rowKey={(item: AgentRecord) => item.agentKey ?? item.name} size="small" scroll={{ x: 530 }} pagination={false} columns={agentColumns} dataSource={agents} />
        </GovernanceSection>
        <GovernanceSection icon={<SlidersHorizontal size={17} />} title="Skill 策略" extra={<Tag>{skills.length} 条</Tag>}>
          <Table<SkillRecord> rowKey={(item: SkillRecord) => item.skillKey ?? item.name} size="small" scroll={{ x: 530 }} pagination={false} columns={skillColumns} dataSource={skills} />
        </GovernanceSection>
      </div>
      <GovernanceSection icon={<Network size={17} />} title="MCP 连接器" extra={<Tag color={onlineConnectorCount ? 'green' : 'gold'}>{onlineConnectorCount}/{connectors.length} 在线</Tag>}>
        <div className="governance-connector-list">
          {connectors.map((connector: ConnectorRecord) => (
            <div className="governance-connector-row" key={connector.name}>
              <span className={`governance-status-dot ${connector.status === '在线' ? 'online' : ''}`} />
              <div className="governance-list-main"><strong>{connector.name}</strong><small>{connector.scope}</small></div>
              <Tag color={statusColor(connector.status)}>{connector.status}</Tag>
              <time>{connector.lastSync}</time>
            </div>
          ))}
        </div>
      </GovernanceSection>
    </div>
  );

  const identityView = (
    <div className="governance-content-stack">
      <div className="governance-two-column governance-identity-grid">
        <GovernanceSection icon={<UsersRound size={17} />} title="组织与权限" extra={<Tag>{roles.length} 个成员</Tag>}>
          <Table<RoleRecord>
            rowKey="openid"
            size="small"
            scroll={{ x: 550 }}
            pagination={{ pageSize: 8 }}
            dataSource={roles}
            columns={[
              { title: '成员', dataIndex: 'displayName', width: 260, render: (value: string, item: RoleRecord) => <div className="admin-cell-title"><strong>{value}</strong><span>{item.openid}</span></div> },
              { title: '组织角色', dataIndex: 'role', width: 160, render: (value: string) => <Tag color="blue">{value}</Tag> },
              { title: '数据权限', dataIndex: 'permissions', width: 130, render: (value: string[]) => value?.length ? `${value.length} 项` : '待配置' },
            ]}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无组织权限记录" /> }}
          />
        </GovernanceSection>
        <GovernanceSection icon={<KeyRound size={17} />} title="创建服务密钥" className="governance-key-form">
          <Form form={accessKeyForm} layout="vertical" initialValues={{ scopes: ['source:ingest'] }}>
            <Form.Item name="name" label="密钥名称" rules={[{ required: true, message: '请输入密钥名称' }]}><Input placeholder="例如：案件系统只读服务" /></Form.Item>
            <Form.Item name="scopes" label="权限范围" rules={[{ required: true, message: '请选择权限范围' }]}>
              <Select mode="multiple" options={[{ value: 'source:ingest', label: '数据接入' }, { value: 'data:read', label: '主数据读取' }, { value: 'ai:invoke', label: 'AI 能力调用' }]} />
            </Form.Item>
            <Button type="primary" loading={creatingKey} icon={<Plus size={15} />} onClick={createAccessKey}>创建服务密钥</Button>
          </Form>
        </GovernanceSection>
      </div>
      <GovernanceSection icon={<KeyRound size={17} />} title="密钥生命周期" extra={<Tag>{accessKeys.length} 个</Tag>}>
        <Table rowKey="keyId" size="small" scroll={{ x: 850 }} dataSource={accessKeys} columns={accessKeyColumns} pagination={{ pageSize: 6 }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无服务访问密钥" /> }} />
      </GovernanceSection>
    </div>
  );

  const auditView = (
    <div className="governance-content-stack">
      <GovernanceSection icon={<Activity size={17} />} title="治理运行态">
        <div className="governance-runtime-list">
          <div><span>平台服务</span><Tag color={apiOnline ? 'green' : 'gold'}>{apiOnline ? '在线' : '待同步'}</Tag></div>
          <div><span>数据库</span><Tag color={runtime?.database?.status === 'ready' ? 'green' : 'gold'}>{runtime?.database?.engine ?? '未读取'}</Tag></div>
          <div><span>Agent</span><b>{onlineAgentCount}/{agents.length}</b></div>
          <div><span>MCP</span><b>{onlineConnectorCount}/{connectors.length}</b></div>
          <div><span>人工确认</span><b>{confirmationQueue.length} 条</b></div>
        </div>
        <Alert className="admin-audit-alert" type={apiOnline ? 'success' : 'warning'} showIcon message={apiOnline ? '平台治理接口已连接' : '等待平台接口'} description={`${ADMIN_API} · 每 20 秒同步一次`} />
      </GovernanceSection>
      <GovernanceSection icon={<ClipboardCheck size={17} />} title="业务操作审计" extra={<Tag>{eventAudits.length} 条</Tag>}>
        <Table<EventAudit>
          rowKey="id"
          size="small"
          scroll={{ x: 980 }}
          dataSource={eventAudits}
          pagination={{ pageSize: 8 }}
          columns={[
            { title: '时间', dataIndex: 'time', width: 170 },
            { title: '动作', dataIndex: 'action', width: 150 },
            { title: '对象', dataIndex: 'eventId', width: 180, render: (value: string) => <code>{value}</code> },
            { title: '操作人', dataIndex: 'operator', width: 120 },
            { title: '状态', dataIndex: 'status', width: 100, render: (value: string) => <Tag color={statusColor(value)}>{value}</Tag> },
            { title: '记录', dataIndex: 'note', ellipsis: true },
          ]}
        />
      </GovernanceSection>
      <GovernanceSection icon={<ServerCog size={17} />} title="系统审计日志" extra={<Tag>{systemAudits.length} 条</Tag>}>
        <Table<SystemAudit>
          rowKey="id"
          size="small"
          scroll={{ x: 980 }}
          dataSource={systemAudits}
          pagination={{ pageSize: 8 }}
          columns={[
            { title: '时间', dataIndex: 'createdAt', width: 190 },
            { title: '动作', dataIndex: 'action', width: 190 },
            { title: '对象', key: 'resource', width: 220, render: (_value: unknown, item: SystemAudit) => <code>{item.resourceType}{item.resourceId ? `/${item.resourceId}` : ''}</code> },
            { title: '操作人', dataIndex: 'actor', width: 140 },
            { title: '详情', dataIndex: 'detail', ellipsis: true, render: (value: Record<string, unknown>) => JSON.stringify(value ?? {}) },
          ]}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无系统审计记录" /> }}
        />
      </GovernanceSection>
    </div>
  );

  const settingsView = (
    <div className="governance-two-column governance-settings-grid">
      <GovernanceSection icon={<ServerCog size={17} />} title="平台安全策略">
        <Form form={platformForm} layout="vertical" initialValues={settings}>
          <div className="governance-switch-fields">
            <Form.Item name="adminAuthEnabled" label="管理接口身份校验" valuePropName="checked"><Switch checkedChildren="开启" unCheckedChildren="关闭" /></Form.Item>
            <Form.Item name="sourceAuthEnabled" label="来源服务凭据校验" valuePropName="checked"><Switch checkedChildren="开启" unCheckedChildren="关闭" /></Form.Item>
          </div>
          <div className="governance-numeric-fields">
            <Form.Item name="publicWriteRateLimitPerMinute" label="公开写入限流"><InputNumber min={1} max={120} addonAfter="次/分钟" /></Form.Item>
            <Form.Item name="evidenceUploadLimitMb" label="证据上传上限"><InputNumber min={1} max={100} addonAfter="MB" /></Form.Item>
          </div>
          <Button type="primary" loading={savingSettings} icon={<Save size={15} />} onClick={saveSettings}>保存安全策略</Button>
        </Form>
      </GovernanceSection>
      <GovernanceSection icon={<Eye size={17} />} title="模型调用约束">
        <div className="governance-policy-list">
          <div><CheckCircle2 size={16} /><span>高风险输出必须进入人工确认队列</span><Tag color="green">强制</Tag></div>
          <div><CheckCircle2 size={16} /><span>每次调用记录模型、依据和数据时间</span><Tag color="green">强制</Tag></div>
          <div><CheckCircle2 size={16} /><span>未通过权限校验的请求不可访问敏感数据</span><Tag color="green">强制</Tag></div>
          <div><CheckCircle2 size={16} /><span>模型、提示词和 Skill 变更保留版本</span><Tag color="blue">可审计</Tag></div>
        </div>
      </GovernanceSection>
    </div>
  );

  return (
    <section className="workspace-page admin-console-page governance-page">
      <header className="governance-heading">
        <div><h1>平台治理</h1><span className="governance-sync-time">{runtime?.checkedAt ? `最近同步 ${runtime.checkedAt}` : '每 20 秒同步'}</span></div>
        <div className="governance-heading-actions">
          <span className={`governance-service-status ${apiOnline ? 'online' : ''}`}><span className={`governance-status-dot ${apiOnline ? 'online' : ''}`} />{apiOnline ? '平台在线' : '等待同步'}</span>
          <Button onClick={load} loading={loading} icon={<RefreshCw size={16} />}>重新同步</Button>
        </div>
      </header>
      <div className="governance-tabs" role="tablist" aria-label="平台治理">
        {governanceTabs.map(({ key, label, icon: Icon }, index) => (
          <button
            key={key}
            id={`governance-tab-${key}`}
            type="button"
            role="tab"
            aria-selected={activeTab === key}
            aria-controls={`governance-panel-${key}`}
            tabIndex={activeTab === key ? 0 : -1}
            className={activeTab === key ? 'active' : ''}
            onClick={() => setActiveTab(key)}
            onKeyDown={(event) => {
              let nextIndex = index;
              if (event.key === 'ArrowRight') nextIndex = (index + 1) % governanceTabs.length;
              else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + governanceTabs.length) % governanceTabs.length;
              else if (event.key === 'Home') nextIndex = 0;
              else if (event.key === 'End') nextIndex = governanceTabs.length - 1;
              else return;
              event.preventDefault();
              const nextKey = governanceTabs[nextIndex].key;
              setActiveTab(nextKey);
              document.getElementById(`governance-tab-${nextKey}`)?.focus();
            }}
          >
            <Icon size={16} />{label}
          </button>
        ))}
      </div>
      <div className="governance-tab-content" id={`governance-panel-${activeTab}`} role="tabpanel" aria-labelledby={`governance-tab-${activeTab}`} tabIndex={0}>
        {activeTab === 'overview' && overviewView}
        {activeTab === 'ai' && aiRuntimeView}
        {activeTab === 'identity' && identityView}
        {activeTab === 'audit' && auditView}
        {activeTab === 'settings' && settingsView}
      </div>
      <Modal title="服务访问密钥已创建" open={Boolean(newSecret)} onCancel={() => setNewSecret(null)} footer={<Button type="primary" onClick={() => setNewSecret(null)}>完成</Button>}>
        <Typography.Paragraph>该密钥只在本次显示，请立即复制并按权限范围安全保管。</Typography.Paragraph>
        <Input.TextArea aria-label="新建服务访问密钥" rows={3} readOnly value={newSecret ?? ''} />
      </Modal>
    </section>
  );
}
