import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Database,
  Eye,
  FileCheck2,
  FileText,
  Fingerprint,
  Gauge,
  Layers3,
  ListTree,
  MapPinned,
  MessageSquareText,
  Mic,
  Network,
  Radio,
  RefreshCw,
  Route,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Target,
  UsersRound,
  Workflow,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CommandIntakeSheet } from '../components/CommandIntakeSheet';
import { AiCenterApiError, authenticateAiReviewer, getAiRuntime, submitAiReview, type AiReviewUser, type AiRuntimeSnapshot } from '../lib/ai-center-api';
import { demoIntakeEvents } from '../lib/intake-demo-data';
import { useAlarmIntake } from '../lib/use-alarm-intake';

type DomainNavigate = (view: 'platform' | 'command' | 'command-workbench' | 'case' | 'community' | 'ai-center' | 'duty-plan' | 'admin') => void;
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

type TrainingTaskApi = {
  taskId: string;
  subject: string;
  traineeId: string;
  teamName: string;
  equipment: string[];
  standard: { label: string; thresholdSeconds?: number; targetMeters?: number };
  basis: string[];
  status: string;
  elapsedSeconds?: number | null;
  exception?: { exceptionId: string; reason: string; reportedBy: string; auditId: string; createdAt: string } | null;
};

type TrainingReadinessApi = {
  dataMode: string;
  updatedAt: string;
  ruleVersion: string;
  riskComposition: Array<{ label: string; value: number; tone: string }>;
  heatZones: Array<{ name: string; level: string; basis: string }>;
  recommendations: Array<{ subject: string; taskId: string; basis: string[]; standard: Record<string, unknown> }>;
  notice: string;
};

type TrainingAssessmentApi = {
  assessmentId: string;
  taskId: string;
  inputMode: string;
  score: { standardization: number; completionTime: number; coordination: number; total: number };
  confidence: number;
  evidence: string[];
  evidenceTime: string;
  reviewStatus: string;
  reviewComment?: string | null;
  auditId: string;
};

type TrainingArchiveApi = {
  recordId: string;
  taskId: string;
  result: string;
  weakPoints: string[];
  retrainingRecommendation: string;
  auditId: string;
};

type TrainingShowcaseStage = 'a1' | 'a2' | 'a3' | 'handoff';

const SHOWCASE_SUBJECTS = [
  { id: 'showcase-equipment', subject: '单警装备训练', basis: '滋事纠纷警情占比与单警快速响应规则', equipment: ['伸缩警棍', '约束带', '执法记录仪'], standard: '单警装备 30 秒取用完毕' },
  { id: 'showcase-low-light', subject: '弱光执法战术训练', basis: '夜市高发时段与人流密集区域处置规则', equipment: ['强光手电', '执法记录仪', '通信耳机'], standard: '弱光队形转换不超过 10 秒' },
  { id: 'showcase-riot', subject: '防爆先期处置', basis: '可疑物品风险提示与先期处置预案', equipment: ['警戒带', '防护装备', '扩音器'], standard: '30 米警戒圈 60 秒内设定' },
] as const;

const SHOWCASE_SCORES = [
  { label: '动作规范度', value: 94, note: '装备取用、站位与动作节点符合标准' },
  { label: '完成用时', value: 91, note: '关键节点用时处于达标区间' },
  { label: '协同一致性', value: 96, note: '口令、队形与现场协同保持一致' },
] as const;

// Showcase contract markers: training-showcase-stage-a1, training-showcase-stage-a2, training-showcase-stage-a3, training-showcase-handoff, training-showcase-card-basis, training-showcase-card-equipment, training-showcase-card-standard, training-showcase-progress, training-showcase-connector.

type TrainingCatalogSubject = {
  id: string;
  label: string;
  description: string;
  audience: string;
  goal: string;
  equipment: string[];
  standard: string;
  basis: string[];
  pilotSubject?: string;
};

type TrainingCatalogModule = {
  id: string;
  label: string;
  subjects: TrainingCatalogSubject[];
};

type TrainingCatalogCategory = {
  id: string;
  label: string;
  modules: TrainingCatalogModule[];
};

const TRAINING_SUBJECT_CATALOG_SOURCE: TrainingCatalogCategory[] = [
  { id: 'fitness', label: '基础体能与警务体技能', modules: [
    { id: 'fitness-basic', label: '基础体能', subjects: [
      { id: 'run-endurance', label: '耐力跑与间歇跑', description: '围绕持续执勤与快速恢复的基础耐力训练。', audience: '全警基础训练对象', goal: '提升持续机动和心肺耐力', equipment: ['跑道', '计时器'], standard: '按单位年龄组标准执行', basis: ['年度体能训练计划', '岗位体能要求'] },
      { id: 'speed-agility', label: '短跑、折返与敏捷', description: '训练短距离加速、折返和方向变化能力。', audience: '全警基础训练对象', goal: '提升追控与快速机动能力', equipment: ['标志桶', '计时器'], standard: '按单位年龄组标准执行', basis: ['年度体能训练计划', '岗位体能要求'] },
    ] },
    { id: 'fitness-skill', label: '警务体技能', subjects: [
      { id: 'obstacle-movement', label: '障碍跨越与安全移动', description: '在复杂空间中完成越障、掩护和安全移动。', audience: '巡特警、基层处置岗位', goal: '提升复杂环境下的安全通行能力', equipment: ['障碍架', '护具'], standard: '按场地和岗位标准执行', basis: ['实战化训练安排', '场地安全规范'] },
      { id: 'load-carry', label: '负重搬运与协同救援', description: '训练警情处置中的搬运、协同和体能分配。', audience: '基层处置岗位', goal: '提升紧急救援协作能力', equipment: ['训练假人', '担架'], standard: '按协同流程完成', basis: ['应急处置训练要求', '救援协同规范'] },
    ] },
  ] },
  { id: 'single-police', label: '单警装备与警械使用', modules: [
    { id: 'single-police-equipment', label: '单警装备应用', subjects: [
      { id: 'equipment-fast-access', label: '单警装备快速取用', description: '按处置流程完成装备识别、取用与佩戴。', audience: '备勤民警', goal: '提升装备取用规范性和时效性', equipment: ['单警装备套件', '训练腰带'], standard: '20 秒内完成规范取用', basis: ['单警装备配备使用管理要求', '备勤训练计划'], pilotSubject: '单警装备快速取用' },
      { id: 'equipment-maintenance', label: '装备日常检查与维护', description: '完成装备点验、状态检查和异常登记。', audience: '全警装备使用人员', goal: '确保执勤装备处于可用状态', equipment: ['单警装备', '检查清单'], standard: '按清单无遗漏完成', basis: ['装备管理制度', '日常点验要求'] },
    ] },
    { id: 'single-police-restraint', label: '警械使用', subjects: [
      { id: 'restraint-device', label: '约束器具规范使用', description: '训练约束器具的安全取用、协同使用和交接。', audience: '执法执勤岗位', goal: '提升安全控制与程序意识', equipment: ['训练约束器具', '护具'], standard: '按安全流程完成', basis: ['警械使用管理规定', '执法安全规范'] },
      { id: 'baton-basic', label: '警棍基础控制', description: '在教官监管下训练警棍持握、防护和控制动作。', audience: '执法执勤岗位', goal: '提升警械使用安全性', equipment: ['训练警棍', '护具'], standard: '按教官动作标准执行', basis: ['警械训练规范', '执法安全规范'] },
    ] },
  ] },
  { id: 'weapons', label: '武器警械与射击训练', modules: [
    { id: 'weapons-safety', label: '武器安全与管理', subjects: [
      { id: 'weapon-safety', label: '武器安全规则与验枪', description: '训练安全检查、交接和靶场纪律。', audience: '依法配备武器岗位', goal: '强化武器安全底线', equipment: ['训练器材', '安全检查表'], standard: '安全步骤零遗漏', basis: ['枪支管理规定', '靶场安全制度'] },
      { id: 'weapon-assembly', label: '分解结合与故障识别', description: '训练规定范围内的器材检查和常见故障识别。', audience: '依法配备武器岗位', goal: '提升勤务前检查能力', equipment: ['训练器材', '维护工具'], standard: '按规程完成', basis: ['武器装备管理制度', '岗位训练计划'] },
    ] },
    { id: 'weapons-shooting', label: '射击基础与应用', subjects: [
      { id: 'shooting-basic', label: '基础射击姿势与瞄准', description: '在合规靶场进行基础射击动作训练。', audience: '依法配备武器岗位', goal: '提升基础射击稳定性', equipment: ['靶场器材', '护目护耳装备'], standard: '按靶场考核标准执行', basis: ['射击训练大纲', '靶场安全制度'] },
      { id: 'shooting-scenario', label: '情景化射击决策', description: '围绕合法性、必要性和安全背景进行模拟决策训练。', audience: '依法配备武器岗位', goal: '强化规范决策与安全意识', equipment: ['模拟靶', '防护装备'], standard: '按情景考核要求执行', basis: ['依法使用武器警械原则', '实战训练安排'] },
    ] },
  ] },
  { id: 'defense', label: '徒手防卫与控制', modules: [
    { id: 'defense-protection', label: '防卫基础', subjects: [
      { id: 'defense-distance', label: '安全距离与防护站位', description: '训练接近、观察、警戒和防护站位。', audience: '执法执勤岗位', goal: '降低近距离处置风险', equipment: ['护具', '标志线'], standard: '按安全动作规范执行', basis: ['执法安全规范', '实战训练安排'] },
      { id: 'defense-breakaway', label: '脱离与防护', description: '在安全训练条件下完成脱离、呼叫支援和防护。', audience: '执法执勤岗位', goal: '提升危险接触时的自我保护', equipment: ['护具', '训练垫'], standard: '按教官标准完成', basis: ['警务实战训练要求', '场地安全规范'] },
    ] },
    { id: 'defense-control', label: '控制与带离', subjects: [
      { id: 'control-restraint', label: '控制、约束与带离', description: '训练多人协同下的控制、约束和安全带离。', audience: '执法执勤岗位', goal: '提升控制过程规范性', equipment: ['训练垫', '约束训练器具'], standard: '按协同流程完成', basis: ['执法规范化要求', '警务实战训练要求'] },
      { id: 'control-medical', label: '控制后安全观察', description: '训练控制完成后的状态观察、医疗风险识别和移交。', audience: '执法执勤岗位', goal: '强化全流程安全意识', equipment: ['急救训练包', '记录表'], standard: '按处置清单完成', basis: ['执法安全规范', '现场急救要求'] },
    ] },
  ] },
  { id: 'tactics', label: '警务战术与现场处置', modules: [
    { id: 'tactics-team', label: '现场战术协同', subjects: [
      { id: 'low-light-formation', label: '弱光队形转换', description: '在弱光训练环境下完成队形、照明和口令协同。', audience: '巡逻处置小组', goal: '提升弱光条件下协同与安全观察', equipment: ['照明器材', '通信器材'], standard: '45 秒内完成规范转换', basis: ['战术协同训练计划', '备勤训练计划'], pilotSubject: '弱光队形转换' },
      { id: 'cover-movement', label: '掩护与交叉移动', description: '训练现场掩护、观察分工和交叉移动。', audience: '巡逻处置小组', goal: '降低战术移动风险', equipment: ['训练掩体', '通信器材'], standard: '按协同口令完成', basis: ['警务战术训练要求', '场地安全规范'] },
    ] },
    { id: 'tactics-scene', label: '常见警情处置', subjects: [
      { id: 'dispute-scene', label: '矛盾纠纷现场处置', description: '训练隔离、沟通、风险评估与规范处置。', audience: '基层接处警岗位', goal: '提升纠纷降温和程序处置能力', equipment: ['执法记录设备', '训练脚本'], standard: '按处置流程完成', basis: ['接处警工作规范', '群众工作要求'] },
      { id: 'high-risk-scene', label: '高风险现场警戒', description: '训练警戒区划设、分工和支援衔接。', audience: '巡逻处置小组', goal: '提升现场风险控制能力', equipment: ['警戒带', '通信器材'], standard: '按处置预案完成', basis: ['现场处置预案', '警务战术训练要求'] },
    ] },
  ] },
  { id: 'law', label: '执法规范与法律基础', modules: [
    { id: 'law-procedure', label: '执法程序', subjects: [
      { id: 'law-identity', label: '身份表明与告知', description: '训练执法过程中的身份表明、权利义务告知和记录。', audience: '执法执勤岗位', goal: '提升程序规范性', equipment: ['执法记录设备', '文书样表'], standard: '关键告知完整准确', basis: ['执法办案程序规定', '执法规范化要求'] },
      { id: 'law-force', label: '依法使用强制措施', description: '围绕条件、程序、比例原则和记录要求开展案例训练。', audience: '执法执勤岗位', goal: '强化依法规范履职', equipment: ['案例材料', '文书样表'], standard: '按案例要点答复', basis: ['相关法律法规', '执法规范化要求'] },
    ] },
    { id: 'law-document', label: '执法记录与文书', subjects: [
      { id: 'law-recording', label: '执法记录仪规范使用', description: '训练启停时机、音视频留存与异常说明。', audience: '执法执勤岗位', goal: '提升全过程记录质量', equipment: ['执法记录仪', '训练脚本'], standard: '按规范完成记录', basis: ['执法记录仪使用管理规定', '执法规范化要求'] },
      { id: 'law-documentation', label: '现场文书与笔录基础', description: '训练现场记录、笔录要素和材料校核。', audience: '执法办案岗位', goal: '提升证据和文书质量', equipment: ['文书样表', '案例材料'], standard: '要素齐全、逻辑一致', basis: ['执法办案程序规定', '文书制作规范'] },
    ] },
  ] },
  { id: 'dispatch', label: '接处警与群众工作', modules: [
    { id: 'dispatch-command', label: '接处警流程', subjects: [
      { id: 'dispatch-call', label: '警情接报与风险问询', description: '训练接警信息核实、风险询问和分级上报。', audience: '接警调度岗位', goal: '提升警情研判质量', equipment: ['接警终端模拟器', '训练脚本'], standard: '关键信息采集完整', basis: ['接处警工作规范', '警情分级规则'] },
      { id: 'dispatch-handover', label: '现场交接与结果回传', description: '训练任务派发、到场反馈和处置结果回传。', audience: '接处警与基层处置岗位', goal: '提升闭环协同能力', equipment: ['移动警务终端模拟器', '训练脚本'], standard: '按时限与字段要求完成', basis: ['接处警工作规范', '勤务管理要求'] },
    ] },
    { id: 'dispatch-public', label: '群众沟通', subjects: [
      { id: 'public-communication', label: '现场沟通与情绪疏导', description: '训练倾听、解释、安抚和风险沟通。', audience: '基层接处警岗位', goal: '提升群众工作能力', equipment: ['情景脚本', '训练记录表'], standard: '按沟通要点完成', basis: ['群众工作要求', '接处警工作规范'] },
      { id: 'public-complaint', label: '投诉受理与回访', description: '训练投诉登记、程序告知和回访记录。', audience: '窗口与基层岗位', goal: '提升服务规范性', equipment: ['登记表', '回访脚本'], standard: '流程和告知完整', basis: ['群众工作要求', '窗口服务规范'] },
    ] },
  ] },
  { id: 'traffic', label: '交通管理与道路执法', modules: [
    { id: 'traffic-command', label: '路面指挥', subjects: [
      { id: 'traffic-gesture', label: '交通指挥手势与站位', description: '训练路口站位、手势和风险观察。', audience: '交通管理岗位', goal: '提升现场指挥规范性', equipment: ['反光装备', '训练路口'], standard: '按手势标准执行', basis: ['道路交通管理训练要求', '勤务安全规范'] },
      { id: 'traffic-accident', label: '交通事故现场防护', description: '训练现场警戒、分流、勘查配合与信息上报。', audience: '交通管理岗位', goal: '提升事故现场安全控制', equipment: ['警戒器材', '反光装备'], standard: '按处置预案完成', basis: ['道路交通事故处理规范', '勤务安全规范'] },
    ] },
    { id: 'traffic-enforcement', label: '道路执法', subjects: [
      { id: 'traffic-stop', label: '车辆检查安全流程', description: '训练检查前观察、站位、告知和风险处置。', audience: '交通管理岗位', goal: '提升路检安全与程序规范', equipment: ['执法记录设备', '反光装备'], standard: '按安全流程完成', basis: ['道路交通执法规范', '勤务安全规范'] },
      { id: 'traffic-evidence', label: '交通违法证据采集', description: '训练现场取证、数据核验与文书衔接。', audience: '交通管理岗位', goal: '提升证据规范性', equipment: ['移动警务终端', '执法记录设备'], standard: '证据链条完整', basis: ['道路交通执法规范', '证据规范要求'] },
    ] },
  ] },
  { id: 'riot', label: '反恐防暴与应急处突', modules: [
    { id: 'riot-control', label: '防暴处突', subjects: [
      { id: 'riot-cordon', label: '防爆警戒圈设置', description: '训练警戒范围设定、分工、疏导与联络。', audience: '应急处突小组', goal: '提升现场秩序控制和安全隔离', equipment: ['警戒带', '防护装备', '通信器材'], standard: '3 分钟内完成警戒圈设置', basis: ['群体性事件处置预案', '备勤训练计划'], pilotSubject: '防爆警戒圈设置' },
      { id: 'riot-shield', label: '防暴队形与盾牌协同', description: '训练防护队形、口令和协同推进。', audience: '应急处突小组', goal: '提升集体防护协同能力', equipment: ['防暴盾牌', '护具'], standard: '按教官口令完成', basis: ['防暴处突训练要求', '场地安全规范'] },
    ] },
    { id: 'riot-terror', label: '反恐应急', subjects: [
      { id: 'terror-suspicious', label: '可疑物品初期处置', description: '训练发现、隔离、报告和专业力量衔接。', audience: '基层巡逻岗位', goal: '提升初期风险管控能力', equipment: ['警戒器材', '通信器材'], standard: '按预案完成初期处置', basis: ['反恐怖工作要求', '应急处置预案'] },
      { id: 'terror-evacuation', label: '人员疏散与区域管控', description: '训练疏散引导、通道设置和信息报送。', audience: '应急处突小组', goal: '提升人员安全转移能力', equipment: ['扩音器', '警戒器材'], standard: '按预案完成', basis: ['应急处置预案', '大型活动安保要求'] },
    ] },
  ] },
  { id: 'rescue', label: '消防、救生与灾害处置', modules: [
    { id: 'rescue-fire', label: '初期火灾处置', subjects: [
      { id: 'fire-extinguisher', label: '灭火器材使用与撤离', description: '训练初期火情报警、器材使用和安全撤离。', audience: '全警基础训练对象', goal: '提升初期应急自救互救能力', equipment: ['训练灭火器', '防护装备'], standard: '按安全流程完成', basis: ['消防安全要求', '应急处置预案'] },
      { id: 'fire-scene', label: '火灾现场外围警戒', description: '训练外围警戒、交通疏导和消防协同。', audience: '基层处置岗位', goal: '提升现场协同能力', equipment: ['警戒带', '通信器材'], standard: '按联动流程完成', basis: ['消防救援联动预案', '现场处置规范'] },
    ] },
    { id: 'rescue-water', label: '救生与灾害响应', subjects: [
      { id: 'rescue-water-safety', label: '涉水救援安全基础', description: '训练涉水风险识别、警戒和专业力量呼叫。', audience: '涉水勤务岗位', goal: '强化救援安全边界', equipment: ['救生衣', '抛投器材'], standard: '按安全清单完成', basis: ['水域救援安全要求', '应急处置预案'] },
      { id: 'rescue-disaster', label: '自然灾害现场秩序维护', description: '训练灾害现场警戒、疏散和信息传递。', audience: '基层处置岗位', goal: '提升灾害响应协同能力', equipment: ['警戒器材', '通信器材'], standard: '按预案完成', basis: ['自然灾害应急预案', '勤务协同要求'] },
    ] },
  ] },
  { id: 'digital', label: '信息化应用与数据安全', modules: [
    { id: 'digital-policing', label: '警务信息化应用', subjects: [
      { id: 'digital-terminal', label: '移动警务终端规范操作', description: '训练任务接收、信息核验和结果回传。', audience: '移动勤务岗位', goal: '提升终端应用规范性', equipment: ['移动警务终端模拟器'], standard: '按流程和字段要求完成', basis: ['移动警务应用规范', '数据使用管理要求'] },
      { id: 'digital-command', label: '指挥平台信息协同', description: '训练态势查看、任务流转和信息订正。', audience: '指挥调度与基层岗位', goal: '提升跨岗位信息协同', equipment: ['指挥平台训练环境'], standard: '按权限和流程完成', basis: ['指挥调度工作规范', '信息化应用要求'] },
    ] },
    { id: 'digital-security', label: '数据安全与保密', subjects: [
      { id: 'digital-classification', label: '数据分级分类与最小授权', description: '训练数据访问边界、最小权限和操作留痕。', audience: '全警信息系统使用人员', goal: '强化数据安全意识', equipment: ['培训环境', '案例材料'], standard: '通过场景化检查', basis: ['数据安全管理制度', '保密工作要求'] },
      { id: 'digital-incident', label: '数据异常报告与处置', description: '训练异常发现、停止扩散、报告和审计配合。', audience: '全警信息系统使用人员', goal: '提升安全事件响应能力', equipment: ['训练工单', '事件脚本'], standard: '按响应流程完成', basis: ['网络安全事件处置预案', '数据安全管理制度'] },
    ] },
  ] },
  { id: 'investigation', label: '侦查办案与证据规范', modules: [
    { id: 'investigation-evidence', label: '证据规范', subjects: [
      { id: 'evidence-scene', label: '现场证据保护与固定', description: '训练现场保护、记录、移交和链条意识。', audience: '侦查办案岗位', goal: '提升证据完整性', equipment: ['训练物证', '记录表'], standard: '按证据流程完成', basis: ['刑事办案程序规定', '证据规范要求'] },
      { id: 'evidence-digital', label: '电子数据取证基础', description: '训练电子数据保全、记录和专业协作边界。', audience: '侦查办案岗位', goal: '提升电子证据规范意识', equipment: ['训练终端', '记录表'], standard: '按规范完成记录', basis: ['电子数据取证规范', '证据规范要求'] },
    ] },
    { id: 'investigation-case', label: '办案流程', subjects: [
      { id: 'case-inquiry', label: '询问讯问规范基础', description: '训练程序告知、记录要素和合法性边界。', audience: '侦查办案岗位', goal: '提升办案程序规范性', equipment: ['笔录样表', '案例脚本'], standard: '要素完整、程序规范', basis: ['刑事办案程序规定', '执法规范化要求'] },
      { id: 'case-review', label: '案件材料审查与补正', description: '训练材料清单核验、关联性审查和补正流程。', audience: '侦查办案岗位', goal: '提升案卷质量', equipment: ['模拟案卷', '审查清单'], standard: '按清单完成审查', basis: ['执法办案管理要求', '案卷评查规范'] },
    ] },
  ] },
  { id: 'special', label: '特殊岗位与专业警种训练', modules: [
    { id: 'special-community', label: '基层专业岗位', subjects: [
      { id: 'special-community', label: '社区警务走访与风险排查', description: '训练走访沟通、隐患登记和分级流转。', audience: '社区民警', goal: '提升基层风险发现能力', equipment: ['移动终端模拟器', '走访表'], standard: '按流程完成', basis: ['社区警务工作规范', '基层基础工作要求'] },
      { id: 'special-campus', label: '校园安全联动处置', description: '训练校园警情响应、保护、通报和联动。', audience: '校园安全相关岗位', goal: '提升重点场所联动能力', equipment: ['应急预案', '通信器材'], standard: '按预案完成', basis: ['校园安全工作要求', '应急联动预案'] },
    ] },
    { id: 'special-cyber', label: '专业警种基础', subjects: [
      { id: 'special-cyber', label: '网络违法线索研判基础', description: '训练线索登记、关联研判和合规流转。', audience: '网安相关岗位', goal: '提升线索研判规范性', equipment: ['脱敏训练数据', '研判工具训练环境'], standard: '按权限和流程完成', basis: ['网络安全执法要求', '数据安全管理制度'] },
      { id: 'special-forensic', label: '现场勘查协作基础', description: '训练现场保护、专业力量呼叫和协作记录。', audience: '刑技协作岗位', goal: '提升专业协同意识', equipment: ['勘查协作清单', '通信器材'], standard: '按协作流程完成', basis: ['现场勘查工作规范', '证据规范要求'] },
    ] },
  ] },
  { id: 'wellbeing', label: '心理、体能恢复与职业健康', modules: [
    { id: 'wellbeing-mental', label: '心理调适', subjects: [
      { id: 'mental-stress', label: '高压警情后心理调适', description: '训练压力识别、同伴支持和专业转介流程。', audience: '全警基础训练对象', goal: '提升心理韧性与求助意识', equipment: ['心理训练材料', '匿名测评工具'], standard: '完成调适流程演练', basis: ['职业健康工作要求', '心理服务机制'] },
      { id: 'mental-communication', label: '危机沟通与情绪管理', description: '训练自身情绪调节和危机对象沟通。', audience: '基层接处警岗位', goal: '提升现场沟通稳定性', equipment: ['情景脚本', '训练记录表'], standard: '按沟通要点完成', basis: ['群众工作要求', '心理危机干预规范'] },
    ] },
    { id: 'wellbeing-recovery', label: '恢复与防护', subjects: [
      { id: 'recovery-warmup', label: '训练前热身与训练后恢复', description: '训练热身、拉伸、负荷观察和伤病报告。', audience: '全警基础训练对象', goal: '降低训练伤风险', equipment: ['训练垫', '恢复工具'], standard: '按动作清单完成', basis: ['训练安全规范', '职业健康工作要求'] },
      { id: 'recovery-first-aid', label: '警务急救与同伴互助', description: '训练初步止血、呼救、转运和交接。', audience: '全警基础训练对象', goal: '提升初期救护能力', equipment: ['急救训练包', '训练假人'], standard: '按急救流程完成', basis: ['现场急救要求', '训练安全规范'] },
    ] },
  ] },
  { id: 'integrated', label: '综合演练与实战拉练', modules: [
    { id: 'integrated-scenario', label: '综合情景演练', subjects: [
      { id: 'integrated-night', label: '夜间巡逻综合处置', description: '串联巡逻发现、沟通、警戒、协同和回传。', audience: '基层巡逻处置小组', goal: '检验综合处置流程', equipment: ['通信器材', '照明器材', '执法记录设备'], standard: '按情景评分表完成', basis: ['巡逻勤务规范', '实战化训练安排'] },
      { id: 'integrated-event', label: '大型活动安保综合演练', description: '训练风险排查、人员疏导、应急响应和联动指挥。', audience: '安保勤务相关岗位', goal: '检验多岗位协同能力', equipment: ['通信器材', '警戒器材', '预案脚本'], standard: '按联动预案完成', basis: ['大型活动安全保卫要求', '应急处置预案'] },
    ] },
    { id: 'integrated-field', label: '实战拉练与复盘', subjects: [
      { id: 'integrated-drill', label: '跨区域机动拉练', description: '训练集结、通信、机动、安全管理和保障。', audience: '机动力量与保障岗位', goal: '检验持续勤务组织能力', equipment: ['通信器材', '保障清单'], standard: '按拉练计划完成', basis: ['勤务组织要求', '训练安全规范'] },
      { id: 'integrated-review', label: '复盘推演与补训计划', description: '基于演练记录形成问题清单、责任项和补训任务。', audience: '全警及训练管理岗位', goal: '形成训练闭环改进', equipment: ['复盘模板', '脱敏训练记录'], standard: '问题与措施可追溯', basis: ['训练管理要求', '复盘评估机制'] },
    ] },
  ] },
];

function collectTrainingModules(...categoryIds: string[]): TrainingCatalogModule[] {
  return categoryIds.flatMap((categoryId) => TRAINING_SUBJECT_CATALOG_SOURCE.find((category) => category.id === categoryId)?.modules ?? []);
}

export const TRAINING_SUBJECT_CATALOG: TrainingCatalogCategory[] = [
  { id: 'foundation', label: '基础素养', modules: collectTrainingModules('fitness', 'law', 'wellbeing') },
  { id: 'single-skill', label: '单警技能', modules: collectTrainingModules('single-police', 'weapons', 'defense') },
  { id: 'scene-response', label: '现场处置', modules: collectTrainingModules('tactics', 'dispatch', 'traffic') },
  { id: 'emergency-response', label: '应急处突', modules: collectTrainingModules('riot', 'rescue') },
  { id: 'special-digital', label: '专业警种与数智应用', modules: collectTrainingModules('digital', 'investigation', 'special') },
  { id: 'integrated', label: '综合演练', modules: collectTrainingModules('integrated') },
];

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
  showFlow = true,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: typeof Activity;
  apiOnline: boolean;
  navigate: DomainNavigate;
  backLabel?: string;
  showFlow?: boolean;
}) {
  const operationFlow = operationFlows[eyebrow];

  return (
    <>
      <header className="domain-header" data-workspace={eyebrow}>
        <div className="domain-header-main">
          <h1><Icon size={24} />{title}</h1>
          <p>{description}</p>
        </div>
        <div className="domain-header-actions">
          <span className={'domain-live-pill ' + (apiOnline ? 'online' : 'pending')}><span />{apiOnline ? '平台数据在线' : '等待业务数据'}</span>
          <button className="domain-secondary-button" type="button" onClick={() => navigate('platform')}><ArrowLeft size={15} />{backLabel}</button>
        </div>
      </header>
      {showFlow && operationFlow && <DomainOperationFlow steps={operationFlow.steps} />}
    </>
  );
}

function DomainOperationFlow({ steps }: { steps: readonly FlowStep[] }) {
  return (
    <ol className="domain-operation-flow" aria-label="业务处置流程">
      {steps.map((step, index) => (
        <li className={step.state} key={step.title} title={step.detail}>
          <b>{String(index + 1).padStart(2, '0')}</b>
          <strong>{step.title}</strong>
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
    <div className="domain-panel-heading" data-section={kicker}>
      <div>
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
      <PanelHeading kicker="CURRENT BUSINESS OBJECT" title={label} icon={Target} />
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

function ProcessSteps({ label, steps, active, onSelect, doneUntil = 0, navigationOnly = false }: { label: string; steps: ProcessStep[]; active: number; onSelect: (index: number) => void; doneUntil?: number; navigationOnly?: boolean }) {
  return (
    <nav className="domain-process-steps" aria-label={label + '处置链'}>
      {steps.map((step, index) => {
        const complete = !navigationOnly && (index < doneUntil || index < active);
        const state = complete ? 'done' : index === active ? 'active' : '';
        return (
          <button
            aria-label={step.label}
            aria-current={index === active ? 'step' : undefined}
            className={'domain-process-step ' + state}
            key={step.label}
            onClick={() => onSelect(index)}
            type="button"
          >
            <span>{complete ? <CheckCircle2 size={14} /> : String(index + 1).padStart(2, '0')}</span>
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
  nextView?: Parameters<DomainNavigate>[0];
  auditId: string;
};

const workbenchEventChains: Record<string, EventChainItem> = {
  'command-intake-workbench': { current: '分类分级记录', previous: '接警事件 ALARM-20260905-001', next: '派警指令 · 小程序签收', auditId: 'AUDIT-COMMAND-20260905-001' },
  'case-dossier-workbench': { current: '案件/证据记录', previous: '移动签收与现场回传 MOBILE-ALARM-001', next: '社区风险与走访任务', nextView: 'community', auditId: 'AUDIT-CASE-20260905-001' },
  'community-territory-workbench': { current: '社区风险与走访任务', previous: '案件/证据记录 CASE-2026-0428', next: '训练复盘与一人一档', nextView: 'duty-plan', auditId: 'AUDIT-COMMUNITY-20260905-001' },
  'training-course-workbench': { current: '训练复盘与一人一档', previous: '社区风险与走访任务 COMMUNITY-VISIT-0001', next: '接警事件复盘', nextView: 'command', auditId: 'AUDIT-TRAINING-20260905-001' },
};

function DomainEventChain({ chain, navigate }: { chain: EventChainItem; navigate: DomainNavigate }) {
  const [reviewStatus, setReviewStatus] = useState<'pending' | 'confirmed' | 'rejected'>('pending');
  const [feedback, setFeedback] = useState('本页演示：待模拟复核，未创建业务待办。');
  const review = (decision: 'confirmed' | 'rejected') => {
    if (reviewStatus !== 'pending') return;
    setReviewStatus(decision);
    setFeedback(decision === 'confirmed'
      ? '本页已标记模拟确认；未写入审计，也未改变业务状态。'
      : '本页已标记模拟回退；未写入审计，也未创建人工任务。');
  };

  return (
    <section className="domain-event-chain" aria-label="关联记录与复核演示" data-source="demo">
      <div className="domain-event-chain-heading"><span>本页演示 · 关联记录与复核</span><strong>示例节点：{chain.current}</strong><b>示例引用：{chain.auditId}</b></div>
      <dl>
        <div><dt>前一节点摘要</dt><dd>{chain.previous}</dd></div>
        <div><dt>下一节点动作</dt><dd>{chain.nextView ? <button type="button" className="domain-text-button" onClick={() => { if (chain.nextView) navigate(chain.nextView); }}>{chain.next}<ArrowRight size={14} /></button> : <span>{chain.next}</span>}</dd></div>
      </dl>
      <div className="domain-review-queue">
        <div><span>AI 建议样例</span><strong>本页模拟复核</strong><small>固定示例，不代表实际研判结果或业务待办。</small></div>
        <div className="domain-review-actions">
          <button type="button" className="domain-primary-button" onClick={() => review('confirmed')} disabled={reviewStatus !== 'pending'}>模拟确认</button>
          <button type="button" className="domain-secondary-button" onClick={() => review('rejected')} disabled={reviewStatus !== 'pending'}>模拟回退</button>
          <button type="button" className="domain-secondary-button" onClick={() => { setReviewStatus('pending'); setFeedback('本页演示已重置；未写入审计。'); }} disabled={reviewStatus === 'pending'}>重置演示</button>
        </div>
      </div>
      <p className="domain-review-feedback" aria-live="polite">{feedback}</p>
      <small className="domain-review-safety">仅本页会话有效，离开或刷新后清空；未发送业务请求，未写入审计。</small>
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

export function CommandOperationsPage({ navigate }: DomainPageProps) {
  const playback = new URLSearchParams(window.location.search).get('mode') === 'playback';
  const intake = useAlarmIntake(!playback);
  const events = playback ? demoIntakeEvents : intake.events;

  return (
    <section className="domain-page command-operations-page" data-source={playback ? 'demo' : intake.online ? 'api' : 'offline'}>
      <DomainHeader eyebrow="接处警系统 / DISPATCH OPERATIONS" title="接处警工作台" description={playback ? '演示回放 · 警情受理、分级研判与派警确认' : '警情受理、分级研判与派警确认'} icon={Radio} apiOnline={!playback && intake.online} navigate={navigate} showFlow={false} />
      <div className="domain-button-row"><button type="button" className="domain-secondary-button" onClick={() => navigate('command-workbench')}>业务办理 <ArrowRight size={15} /></button></div>
      {!playback && <div className="intake-sync-status" role="status">
        <span>{intake.loading ? '正在连接报警接收服务' : intake.online ? `报警接收在线 · ${events.length} 条警情` : '报警接收离线'}</span>
        {intake.notice && <strong>{intake.notice}</strong>}
      </div>}
      {!playback && intake.error && <p className="intake-error" role="alert">{intake.error}</p>}
      <CommandIntakeSheet events={events} refresh={playback ? undefined : intake.refresh} />
    </section>
  );
}

export function CaseHandlingPage({ overview, apiOnline, navigate }: DomainPageProps) {
  const [activeTool, setActiveTool] = useState('legal');
  const [activeProcess, setActiveProcess] = useState(0);
  const [query, setQuery] = useState('盗窃案件 · 夜间 · 多次作案');
  const [checks, setChecks] = useState([true, true, false, false]);
  const [documentReady, setDocumentReady] = useState(false);
  const [searchedQuery, setSearchedQuery] = useState('');
  const [checksConfirmed, setChecksConfirmed] = useState(false);
  const [transferReady, setTransferReady] = useState(false);
  const [caseFeedback, setCaseFeedback] = useState('本页演示：未执行法律检索、入卷或移送。');
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
    if (!processSteps[index]) return;
    setActiveProcess(index);
    setActiveTool(processSteps[index].tool ?? activeTool);
  };
  const selectTool = (tool: string) => {
    if (!caseModules.some((module) => module.id === tool)) return;
    setActiveTool(tool);
    setActiveProcess(tool === 'document' || tool === 'transfer' ? 3 : tool === 'evidence' || tool === 'rule-check' ? 1 : 2);
  };
  const searchCase = () => {
    if (!query.trim()) return;
    setSearchedQuery(query.trim());
    setCaseFeedback('已在本页整理检索词；未查询法律数据库，以下仅为演示核对项。');
  };
  const toggleCheck = (index: number) => {
    setChecks((state) => state.map((value, cursor) => cursor === index ? !value : value));
    setChecksConfirmed(false);
    setTransferReady(false);
    setCaseFeedback('本页清单已修改，需重新模拟确认；未写入卷宗。');
  };
  const confirmEvidence = () => {
    if (!checks.every(Boolean)) return;
    setChecksConfirmed(true);
    setCaseFeedback('本页取证清单已模拟确认；未提交审核队列或写入卷宗。');
  };

  const renderCaseTool = () => {
    if (activeTool === 'evidence' || activeTool === 'rule-check') {
      return <><div className="domain-check-list">{['现场勘验记录与照片', '涉案物品来源及保管链', '关键人员询问笔录', '调取手续与审批回执'].map((item, index) => <label key={item}><input type="checkbox" checked={checks[index]} onChange={() => toggleCheck(index)} /><span>{item}</span><small>{checks[index] ? '演示勾选' : '未勾选'}</small></label>)}</div><div className="domain-warning"><AlertTriangle size={15} /><span>{checks.filter(Boolean).length < checks.length ? '还有 ' + (checks.length - checks.filter(Boolean).length) + ' 项演示材料未勾选。' : '演示清单已全部勾选，不代表证据质量审核通过。'}</span></div><button type="button" className="domain-primary-button" onClick={confirmEvidence} disabled={!checks.every(Boolean) || checksConfirmed}>{checksConfirmed ? '本页清单已确认' : '模拟确认取证清单'}</button><small className="domain-action-safety">仅本页记录，未提交业务队列。</small></>;
    }
    if (activeTool === 'document' || activeTool === 'transfer') {
      return <><div className="domain-document-preview"><div className="domain-document-line long" /><div className="domain-document-line" /><div className="domain-document-line medium" /><div className="domain-document-line" /><span><FileText size={14} />{documentReady ? '本页文书样例已标记确认' : '文书结构示意，非正式文书'}</span></div><div className="domain-button-row"><button type="button" className="domain-primary-button" disabled={documentReady} onClick={() => { setDocumentReady(true); setCaseFeedback('本页文书样例已模拟确认；未生成正式文书或签发。'); }}>模拟确认文书</button><button type="button" className="domain-secondary-button" disabled={!documentReady || !checksConfirmed || transferReady} onClick={() => { selectTool('transfer'); setTransferReady(true); setCaseFeedback('本页移送材料已模拟核对；未向其他部门发送。'); }}>{transferReady ? '本页材料已核对' : '模拟核对移送材料'}</button></div><small className="domain-action-safety">移送演示须先确认清单与文书；未入卷、未签发、未发送材料。</small></>;
    }
    if (activeTool === 'similar' || activeTool === 'linkage') {
      return <><div className="domain-similar-list"><div><span>样例 A</span><strong>示例关联：区域与时间</strong><b>未核实</b></div><div><span>样例 B</span><strong>示例差异：材料完整度</strong><b>待人工核对</b></div><div><span>样例 C</span><strong>示例关联：事件描述</strong><b>不构成串并结论</b></div></div>{activeTool === 'linkage' && <div className="ops-result-card"><strong>本页线索关联示意</strong><span>当前样例 → 区域 / 时间核对 → 样例 A、C</span><small>仅固定演示关联，未检索真实案件。</small></div>}<button className="domain-text-button" type="button" onClick={() => selectTool(activeTool === 'linkage' ? 'similar' : 'linkage')}>{activeTool === 'linkage' ? '返回类案样例' : '查看线索关联示意'} <ArrowRight size={14} /></button></>;
    }
    return <><form className="domain-search-row" onSubmit={(event) => { event.preventDefault(); searchCase(); }}><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="案件检索内容" /><button type="submit" disabled={!query.trim()}><ScanSearch size={15} />演示检索</button></form>{searchedQuery && <div className="domain-citation-list"><div><strong>本页检索词：{searchedQuery}</strong><small>未连接法律或类案数据库，无已核验引用。</small><b>演示</b></div><div><strong>待核对：事实与材料</strong><small>法条版本、适用条件、案例出处须另行核验。</small><b>未检索</b></div></div>}</>;
  };

  return (
    <section className="domain-page case-domain-page">
      <DomainHeader eyebrow="执法办案系统 / CASE INTELLIGENCE" title="执法办案工作台" description="本页演示 · 案件卷宗、证据校验与程序审核" icon={FileCheck2} apiOnline={apiOnline} navigate={navigate} showFlow={false} />
      <ContractNote>本页演示操作仅在当前页面会话中保留，离开或刷新后清空；未检索真实案件，未入卷、签发、移送或写入审计。</ContractNote>
      <div className="domain-metrics"><DomainMetric label="在办案件" value={caseCount} note="平台概览统计" icon={FileCheck2} tone="purple" /><DomainMetric label="未勾选材料" value={checks.filter((item) => !item).length} note="本页演示清单" icon={ClipboardCheck} tone="orange" /><DomainMetric label="今日警情" value={eventCount} note="平台概览统计" icon={Radio} tone="blue" /><DomainMetric label="操作模式" value="演示" note="未连接办理接口" icon={ShieldCheck} tone="green" /></div>
      <ObjectWorkbench
        className="case-dossier-workbench"
        navigate={navigate}
        objectPanel={<><CurrentObjectCard label="案件卷宗样例" title="盗窃案件 · 夜间多次作案" status="本页演示" details={[{ label: '示例编号', value: 'CASE-2026-0428' }, { label: '示例角色', value: '办案民警 07' }, { label: '示例阶段', value: '证据校验' }, { label: '业务关联', value: '未建立' }]} /><section className="domain-panel"><PanelHeading kicker="EVIDENCE CHAIN" title="演示清单状态" icon={ClipboardCheck} /><div className="domain-check-list">{['现场物证', '视频资料', '询问笔录', '调取手续'].map((item, index) => <label key={item}><span>{item}</span><small>{checks[index] ? '演示勾选' : '未勾选'}</small></label>)}</div></section><AiAssistMenu label="办案 AI 助手" modules={caseModules} activeId={activeTool} onSelect={selectTool} /></>}
        processPanel={<><section className="domain-panel"><PanelHeading kicker="CASE PROCESS" title="案件卷宗—证据链台" icon={Workflow} description="本页演示步骤，不代表业务办理进度。"/><ProcessSteps label="案件" steps={processSteps} active={activeProcess} onSelect={selectProcess} navigationOnly /></section><section className="domain-panel domain-active-process"><PanelHeading kicker="CURRENT CASE ACTION" title={activeModule.title} icon={activeModule.icon} description={activeModule.detail} />{renderCaseTool()}<p className="domain-review-feedback" role="status">{caseFeedback}</p><ContractNote>仅演示辅助流程，所有材料与关联均未写入业务系统。</ContractNote></section></>}
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
    if (!processSteps[index]) return;
    setActiveProcess(index);
    setActiveTool(processSteps[index].tool ?? activeTool);
  };
  const selectTool = (tool: string) => {
    const index = processSteps.findIndex((step) => step.tool === tool);
    if (index >= 0) selectProcess(index);
  };
  const createPlan = () => {
    setPlanCreated(true);
  };
  const saveVisit = () => {
    if (!planCreated || !visitNote.trim() || visitReturned) return;
    setVisitReturned(true);
  };
  const updateVisitNote = (value: string) => {
    setVisitNote(value);
    setVisitReturned(false);
  };

  const renderCommunityProcess = () => {
    if (activeProcess === 0) {
      return <><div className="community-grid-map"><span className="grid-map-label label-a">东湖街道 <b>12</b></span><span className="grid-map-label label-b">青山湖片区 <b>8</b></span><span className="grid-map-label label-c">站前网格 <b>5</b></span><span className="grid-map-label label-d">重点地址 <b>3</b></span><div className="grid-map-river" /><div className="grid-map-lines" /></div><div className="community-map-legend"><span><i className="blue" />稳定网格</span><span><i className="orange" />关注网格</span><span><i className="red" />重点核查</span></div></>;
    }
    if (activeProcess === 1) {
      return <div className="community-risk-list">{risks.map((risk, index) => <button key={risk} type="button" className={selectedRisk === index ? 'active' : ''} onClick={() => setSelectedRisk(index)}><span className={'community-risk-index ' + (index === 0 ? 'high' : 'medium')}>{index === 0 ? '高' : '中'}</span><div><strong>{risk}</strong><small>{selectedRisk === index ? '当前查看：已关联警情、地址和责任网格' : '关联警情、地址和责任网格'}</small></div><ArrowRight size={14} /></button>)}</div>;
    }
    if (activeProcess === 2) {
      return <><div className="community-task-list">{tasks.map((task, index) => <div key={task}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{task}</strong><small>{index % 2 ? '示例角色：社区民警' : '示例角色：网格员'}</small></div><b>{planCreated ? '本页已编排' : '计划样例'}</b></div>)}</div><div className="domain-button-row"><button type="button" className="domain-primary-button" onClick={createPlan} disabled={planCreated}>{planCreated ? '本页计划已生成' : '生成本页走访计划'}</button><button type="button" className="domain-secondary-button" onClick={() => selectProcess(3)} disabled={!planCreated}>填写演示记录 <ArrowRight size={14} /></button></div><small className="domain-action-safety">未向网格员发送任务，也未产生业务派单。</small></>;
    }
    return <><div className="ops-capability-body"><label className="ops-field-label" htmlFor="community-visit-note">本页走访演示记录</label><textarea id="community-visit-note" value={visitNote} onChange={(event) => updateVisitNote(event.target.value)} placeholder="填写虚构的走访记录" rows={4} />{!planCreated && <div className="domain-button-row"><button type="button" className="domain-secondary-button" onClick={() => selectProcess(2)}>返回计划编排 <ArrowLeft size={14} /></button></div>}<button type="button" className="domain-primary-button" disabled={!planCreated || !visitNote.trim() || visitReturned} onClick={saveVisit}>{visitReturned ? '本页记录已暂存' : '暂存本页演示记录'}</button></div><p className="domain-review-feedback" role="status">{visitReturned ? '本页记录已暂存；未上传、未创建复核任务、未写入审计。' : !planCreated ? '请先生成本页走访计划；已输入的草稿会保留。' : visitNote.trim() ? '演示草稿未暂存。' : '演示记录不能为空。'}</p>{visitReturned && <div className="ops-result-card"><strong>本页演示记录</strong><span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{visitNote}</span><small>仅当前页面会话有效，离开或刷新后清空。</small></div>}</>;
  };

  return (
    <section className="domain-page community-domain-page">
      <DomainHeader eyebrow="社区警务系统 / COMMUNITY OPERATIONS" title="社区警务工作台" description="本页演示 · 辖区档案、风险线索与走访任务" icon={MapPinned} apiOnline={apiOnline} navigate={navigate} showFlow={false} />
      <ContractNote>本页演示仅保留当前页面会话中的计划与记录，离开或刷新后清空；未派发任务、未上传材料、未写入审计。</ContractNote>
      <div className="domain-metrics"><DomainMetric label="辖区网格" value="—" note="未同步目录" icon={MapPinned} tone="blue" /><DomainMetric label="待办走访" value={overview.stats?.community_tasks ?? '—'} note="平台概览统计" icon={UsersRound} tone="green" /><DomainMetric label="风险样例" value={risks.length} note="本页固定演示" icon={AlertTriangle} tone="orange" /><DomainMetric label="平台完成率" value={overview.stats?.completion_rate == null ? '—' : overview.stats.completion_rate + '%'} note="平台概览统计" icon={CheckCircle2} tone="purple" /></div>
      <ObjectWorkbench
        className="community-territory-workbench"
        navigate={navigate}
        objectPanel={<><CurrentObjectCard label="辖区对象样例" title="站前网格 · 东湖街道" status="本页演示" details={[{ label: '示例地址', value: 3 }, { label: '风险样例', value: risks.length }, { label: '走访样例', value: tasks.length }, { label: '示例角色', value: '社区民警 17' }]} /><section className="domain-panel"><PanelHeading kicker="RISK EVENT" title="风险样例" icon={AlertTriangle} /><div className="community-risk-list">{risks.map((risk, index) => <button key={risk} type="button" className={selectedRisk === index ? 'active' : ''} onClick={() => { setSelectedRisk(index); selectProcess(1); }}><span className={'community-risk-index ' + (index === 0 ? 'high' : 'medium')}>{index === 0 ? '高' : '中'}</span><div><strong>{risk}</strong><small>查看风险样例</small></div><ArrowRight size={14} /></button>)}</div></section><AiAssistMenu label="社区 AI 助手" modules={communityModules} activeId={activeTool} onSelect={selectTool} /></>}
        processPanel={<><section className="domain-panel"><PanelHeading kicker="COMMUNITY CLOSED LOOP" title="辖区对象—风险任务台" icon={Workflow} description="本页演示步骤，不代表任务派发或闭环进度。"/><ProcessSteps label="社区警务" steps={processSteps} active={activeProcess} onSelect={selectProcess} navigationOnly /></section><section className="domain-panel domain-active-process"><PanelHeading kicker="CURRENT COMMUNITY ACTION" title={processSteps[activeProcess].label} icon={activeModule.icon} description={activeModule.detail} />{renderCommunityProcess()}<ContractNote>计划与记录均为本页演示，不构成业务派发、回传或复核。</ContractNote></section></>}
      />
    </section>
  );
}

function LegacyTrainingOperationsPage({ overview, apiOnline, navigate, refresh }: DomainPageProps) {
  const [activeTool, setActiveTool] = useState('course');
  const [activeProcess, setActiveProcess] = useState(0);
  const [courseName, setCourseName] = useState('备勤训练靶向课程 · 试点班组');
  const [courseReady, setCourseReady] = useState(false);
  const [simulationDone, setSimulationDone] = useState(false);
  const [reportConfirmed, setReportConfirmed] = useState(false);
  const [archiveReady, setArchiveReady] = useState(false);
  const [readiness, setReadiness] = useState<TrainingReadinessApi | null>(null);
  const [trainingTasks, setTrainingTasks] = useState<TrainingTaskApi[]>([]);
  const [assessment, setAssessment] = useState<TrainingAssessmentApi | null>(null);
  const [archive, setArchive] = useState<TrainingArchiveApi | null>(null);
  const [retrainingCreated, setRetrainingCreated] = useState(false);
  const [selectedTrainingTaskId, setSelectedTrainingTaskId] = useState('');
  const [trainingSyncMessage, setTrainingSyncMessage] = useState('正在同步脱敏训练样例…');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [recordedVideoUrl, setRecordedVideoUrl] = useState('');
  const [recordingElapsedSeconds, setRecordingElapsedSeconds] = useState(0);
  const [xiaoanEvaluation, setXiaoanEvaluation] = useState('');
  const [voiceState, setVoiceState] = useState('等待评分后播报');
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingUrlRef = useRef<string | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const scoringInProgressRef = useRef(false);
  const tabShortcutArmedRef = useRef(false);
  const tabShortcutTimerRef = useRef<number | null>(null);
  const trainingApi = AI_CENTER_API;
  const activeModule = trainingModules.find((module) => module.id === activeTool) ?? trainingModules[0];
  const loadTrainingPilot = async () => {
    try {
      const [readinessResponse, tasksResponse, archivesResponse] = await Promise.all([
        fetch(`${trainingApi}/training/readiness`),
        fetch(`${trainingApi}/training/tasks`),
        fetch(`${trainingApi}/training/archives`),
      ]);
      if (!readinessResponse.ok || !tasksResponse.ok || !archivesResponse.ok) throw new Error('training unavailable');
      const snapshot = await readinessResponse.json() as TrainingReadinessApi;
      const tasks = await tasksResponse.json() as { items: TrainingTaskApi[] };
      const archives = await archivesResponse.json() as { items: TrainingArchiveApi[] };
      setReadiness(snapshot);
      setTrainingTasks(tasks.items);
      setSelectedTrainingTaskId((current) => current || tasks.items[0]?.taskId || '');
      setArchive(archives.items[0] ?? null);
      setTrainingSyncMessage('训练样例已同步；数据仅用于试点演示。');
    } catch {
      setTrainingSyncMessage('训练接口暂不可用，当前保留本地工作台。');
    }
  };

  useEffect(() => { void loadTrainingPilot(); }, []);

  const stopCameraStream = () => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (cameraVideoRef.current) cameraVideoRef.current.srcObject = null;
    setCameraActive(false);
  };

  const releaseRecordedVideo = () => {
    if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
    recordingUrlRef.current = null;
    setRecordedVideoUrl('');
  };

  useEffect(() => () => {
    mediaRecorderRef.current?.state === 'recording' && mediaRecorderRef.current.stop();
    stopCameraStream();
    if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
    if (tabShortcutTimerRef.current) window.clearTimeout(tabShortcutTimerRef.current);
  }, []);

  useEffect(() => {
    if (!cameraActive) return;
    const timer = window.setInterval(() => {
      if (recordingStartedAtRef.current) setRecordingElapsedSeconds(Math.max(1, Math.floor((Date.now() - recordingStartedAtRef.current) / 1000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cameraActive]);

  const speakXiaoanEvaluation = (message: string) => {
    if (!('speechSynthesis' in window)) {
      setVoiceState('当前浏览器不支持语音播报，已保留文字评价。');
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.95;
    utterance.onend = () => setVoiceState('小安播报完成');
    utterance.onerror = () => setVoiceState('语音播报未完成，文字评价仍可查看。');
    setVoiceState('小安正在播报评价…');
    window.speechSynthesis.speak(utterance);
  };

  const startTrainingRecording = async (task: TrainingTaskApi) => {
    if (task.status === '待训练') await mutateTrainingTask(task, 'start');
    setCameraError('');
    setXiaoanEvaluation('');
    setAssessment(null);
    setSimulationDone(false);
    setRecordingElapsedSeconds(0);
    releaseRecordedVideo();
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setCameraError('当前浏览器不支持本地录像，可使用 Tab + P 触发试点评分。');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      cameraStreamRef.current = stream;
      if (cameraVideoRef.current) cameraVideoRef.current.srcObject = stream;
      recordedChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordedChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        if (recordedChunksRef.current.length) {
          const recording = new Blob(recordedChunksRef.current, { type: recorder.mimeType || 'video/webm' });
          const nextUrl = URL.createObjectURL(recording);
          if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
          recordingUrlRef.current = nextUrl;
          setRecordedVideoUrl(nextUrl);
        }
        stopCameraStream();
      };
      recorder.start(500);
      recordingStartedAtRef.current = Date.now();
      setCameraActive(true);
      setTrainingSyncMessage('本地监控录像已开始，视频不上传至训练服务。');
    } catch {
      stopCameraStream();
      setCameraError('摄像头未授权或不可用，可使用 Tab + P 触发试点评分。');
    }
  };

  const mutateTrainingTask = async (task: TrainingTaskApi, action: 'start' | 'complete', elapsedOverride?: number) => {
    const response = await fetch(`${trainingApi}/training/tasks/${task.taskId}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: action === 'complete' ? JSON.stringify({ elapsedSeconds: elapsedOverride ?? task.elapsedSeconds ?? 28 }) : undefined,
    });
    if (!response.ok) return;
    const next = (await response.json() as { task: TrainingTaskApi }).task;
    setTrainingTasks((current) => current.map((item) => item.taskId === next.taskId ? next : item));
    if (action !== 'complete') return;
    const assessmentResponse = await fetch(`${trainingApi}/training/tasks/${task.taskId}/assessment`, { method: 'POST' });
    if (assessmentResponse.ok) {
      const nextAssessment = (await assessmentResponse.json() as { assessment: TrainingAssessmentApi }).assessment;
      setAssessment(nextAssessment);
      setSelectedTrainingTaskId(task.taskId);
      setSimulationDone(true);
      const { standardization, completionTime, coordination, total } = nextAssessment.score;
      const evaluation = `小安评价：动作规范度 ${standardization} 分，完成用时 ${completionTime} 分，协同一致性 ${coordination} 分，总分 ${total} 分。当前结果仍需教官人工复核确认。`;
      setXiaoanEvaluation(evaluation);
      speakXiaoanEvaluation(evaluation);
    }
  };

  const finishTrainingAndScore = async (task: TrainingTaskApi) => {
    if (scoringInProgressRef.current || task.status !== '训练中') return;
    scoringInProgressRef.current = true;
    const elapsed = recordingStartedAtRef.current ? Math.max(1, Math.floor((Date.now() - recordingStartedAtRef.current) / 1000)) : recordingElapsedSeconds || task.elapsedSeconds || 28;
    setRecordingElapsedSeconds(elapsed);
    recordingStartedAtRef.current = null;
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
    else stopCameraStream();
    await mutateTrainingTask(task, 'complete', Math.min(3600, elapsed));
    scoringInProgressRef.current = false;
  };

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key === 'Tab') {
        tabShortcutArmedRef.current = true;
        if (tabShortcutTimerRef.current) window.clearTimeout(tabShortcutTimerRef.current);
        tabShortcutTimerRef.current = window.setTimeout(() => { tabShortcutArmedRef.current = false; }, 1200);
        return;
      }
      if (event.key.toLowerCase() !== 'p' || !tabShortcutArmedRef.current) return;
      const currentTask = trainingTasks.find((task) => task.taskId === selectedTrainingTaskId) ?? trainingTasks[0];
      if (!currentTask || currentTask.status !== '训练中') return;
      event.preventDefault();
      tabShortcutArmedRef.current = false;
      void finishTrainingAndScore(currentTask);
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [trainingTasks, selectedTrainingTaskId, recordingElapsedSeconds]);

  const reviewTrainingAssessment = async () => {
    if (!assessment) return;
    const response = await fetch(`${trainingApi}/training/assessments/${assessment.assessmentId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'confirmed', reason: '教官确认试点评分结果', reviewerId: 'INSTRUCTOR-001' }),
    });
    if (!response.ok) return;
    setAssessment((await response.json() as { assessment: TrainingAssessmentApi }).assessment);
    setReportConfirmed(true);
    await loadTrainingPilot();
    setArchiveReady(true);
  };
  const registerTrainingException = async (task: TrainingTaskApi) => {
    const response = await fetch(`${trainingApi}/training/tasks/${task.taskId}/exception`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: '现场设备异常已登记，待教官处置。', reportedBy: 'INSTRUCTOR-001' }),
    });
    if (!response.ok) return;
    const next = (await response.json() as { task: TrainingTaskApi }).task;
    setTrainingTasks((current) => current.map((item) => item.taskId === next.taskId ? next : item));
    setTrainingSyncMessage(`已登记异常：${next.exception?.reason ?? task.subject}`);
  };
  const createRetrainingTask = async () => {
    if (!archive) return;
    const response = await fetch(`${trainingApi}/training/archives/${archive.recordId}/retraining`, { method: 'POST' });
    if (!response.ok) return;
    const next = (await response.json() as { task: TrainingTaskApi }).task;
    setTrainingTasks((current) => current.some((item) => item.taskId === next.taskId) ? current.map((item) => item.taskId === next.taskId ? next : item) : [...current, next]);
    setSelectedTrainingTaskId(next.taskId);
    setRetrainingCreated(true);
    setTrainingSyncMessage(`补训任务 ${next.taskId} 已创建，可进入靶向训练执行。`);
  };
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
      return <div className="training-ops-body"><label className="ops-field-label">课程名称</label><input value={courseName} onChange={(event) => { setCourseName(event.target.value); setCourseReady(false); }} /><div className="training-mr-preview"><strong>A1 勤务态势与课程编排</strong><p>{readiness?.notice ?? trainingSyncMessage}</p></div><div className="training-readiness-strip"><strong>A1 靶向依据</strong><span>{readiness?.riskComposition.map((item) => `${item.label} ${item.value}%`).join(' · ') ?? '等待态势快照'}</span><small>{readiness ? `${readiness.ruleVersion} · ${new Date(readiness.updatedAt).toLocaleString('zh-CN')}` : trainingSyncMessage}</small></div><button type="button" className="domain-primary-button" onClick={() => setCourseReady(Boolean(courseName.trim()))}>{courseReady ? '课程草案已生成' : '生成课程草案'}</button></div>;
    }
    if (activeProcess === 1) {
        return <div className="training-ops-body"><div className="training-task-grid">{trainingTasks.map((task) => <article key={task.taskId} className={`training-task-card ${selectedTrainingTaskId === task.taskId ? 'selected' : ''}`}><small>{task.taskId}</small><strong>{task.subject}</strong><span>{task.standard.label}</span><p>装备：{task.equipment.join('、')}</p><p>依据：{task.basis[0]}</p>{task.exception && <p>异常登记：{task.exception.reason}</p>}<div className="domain-button-row"><button type="button" className="domain-secondary-button" onClick={() => setSelectedTrainingTaskId(task.taskId)}>查看考核</button><button type="button" className="domain-secondary-button" onClick={() => void registerTrainingException(task)}>登记异常</button><button type="button" className="domain-primary-button" onClick={() => void mutateTrainingTask(task, task.status === '待训练' ? 'start' : 'complete')} disabled={task.status === '待复核' || task.status === '已归档'}>{task.status === '待训练' ? '开始训练' : task.status === '训练中' ? '完成并评分' : task.status}</button></div></article>)}</div><div className="training-push-copy"><strong>A2 靶向训练清单</strong><p>训练任务来自 A1 脱敏态势规则；用时、异常与状态进入后续评分和训练档案。</p><button type="button" className="domain-primary-button" onClick={() => setReportConfirmed(true)}>{reportConfirmed ? '学员画像已确认' : '确认学员训练计划'}</button></div></div>;
    }
    if (activeProcess === 2) {
      const currentTask = trainingTasks.find((task) => task.taskId === selectedTrainingTaskId) ?? trainingTasks[0];
      const score = assessment?.score;
      return <div className="training-ops-body"><div className="training-scenario-head"><span>{currentTask?.taskId ?? '场景 12 / 39'}</span><strong>{currentTask?.subject ?? '备勤训练评分'}</strong><small>输入源：本地监控画面 + 脱敏试点评分 · AI 仅提供可复核建议</small></div><div className="training-monitor-grid"><div className="training-monitor-panel"><div className="training-monitor-viewport">{recordedVideoUrl ? <video className="training-monitor-video" src={recordedVideoUrl} controls playsInline /> : <video ref={cameraVideoRef} className="training-monitor-video" autoPlay muted playsInline />} {!cameraActive && !recordedVideoUrl && <div className="training-monitor-placeholder"><Radio size={21} /><strong>监控画面待启动</strong><small>点击开始录像后接入本地摄像头</small></div>}<span className="training-monitor-badge"><i className={cameraActive ? 'live' : ''} />{cameraActive ? 'LIVE 本地录像中' : recordedVideoUrl ? '录像回放' : '待机'}</span><span className="training-monitor-watermark">教学训练仿真系统·数据已脱敏</span></div><div className="training-monitor-meta"><span>录像时长：{recordingElapsedSeconds}s</span><span>设备：{cameraActive ? '浏览器摄像头' : '未接入'}</span><span>隐私：本地试点录像，不上传</span></div></div><div className="training-score-panel"><div className="training-score-grid"><div><small>动作规范度</small><strong>{score?.standardization ?? '—'}</strong><span>/ 100</span></div><div><small>完成用时</small><strong>{score?.completionTime ?? '—'}</strong><span>/ 100</span></div><div><small>协同一致性</small><strong>{score?.coordination ?? '—'}</strong><span>/ 100</span></div></div><div className="training-evidence-note"><span>评分依据：{currentTask?.basis?.[0] ?? '处置规范、训练任务书与动作节点'}</span><span>动作识别数据时间：{assessment?.evidenceTime ?? '待采集'}</span></div></div></div><div className="domain-button-row"><button type="button" className="domain-primary-button" disabled={!currentTask || cameraActive} onClick={() => currentTask && void startTrainingRecording(currentTask)}><Radio size={15} />{cameraActive ? '录像进行中' : '开始录像'}</button><button type="button" className="domain-primary-button" disabled={!currentTask || currentTask.status !== '训练中' || scoringInProgressRef.current} onClick={() => currentTask && void finishTrainingAndScore(currentTask)}><BrainCircuit size={15} />结束并由小安评分</button><button type="button" className="domain-secondary-button" disabled={!currentTask || currentTask.status !== '训练中'} onClick={() => currentTask && void finishTrainingAndScore(currentTask)}>快捷评分 Tab + P</button><button type="button" className="domain-secondary-button" onClick={() => { setSimulationDone(false); setAssessment(null); setXiaoanEvaluation(''); setVoiceState('等待评分后播报'); releaseRecordedVideo(); setRecordingElapsedSeconds(0); }}>重新训练</button></div>{cameraError && <div className="training-camera-error"><AlertTriangle size={15} /><span>{cameraError}</span></div>}{xiaoanEvaluation && <div className="training-xiaoan-evaluation"><div><strong>小安评价</strong><span>{xiaoanEvaluation}</span></div><button type="button" className="domain-secondary-button" onClick={() => speakXiaoanEvaluation(xiaoanEvaluation)}><Mic size={14} />再次播报</button><small>{voiceState}</small></div>}{assessment && <div className="training-live-feedback"><CheckCircle2 size={15} /><span>总分 {assessment.score.total} · 置信度 {Math.round(assessment.confidence * 100)}% · 人工复核入口已开放 · 审计编号 {assessment.auditId}</span></div>}</div>;
    }
    return <div className="training-ops-body"><div className="training-archive-card"><div className="training-avatar"><UsersRound size={21} /></div><div><strong>试点班组 · 训练档案</strong><p>{archive?.retrainingRecommendation ?? '评分确认后生成补训建议。'}</p><small>审计编号：{archive?.auditId ?? assessment?.auditId ?? '待生成'}</small></div></div><div className="domain-button-row"><button type="button" className="domain-primary-button" disabled={!assessment || assessment.reviewStatus !== 'pending'} onClick={() => void reviewTrainingAssessment()}>报告确认并写入训练档案</button><button type="button" className="domain-secondary-button" disabled={!archive || retrainingCreated} onClick={() => void createRetrainingTask()}>{retrainingCreated ? '补训任务已创建' : '创建补训任务'}</button></div>{archiveReady && <ContractNote>训练报告已由教官确认，补训任务保留来源档案引用，可进入下一轮靶向训练。</ContractNote>}</div>;
  };

  return (
    <section className="domain-page training-operations-page">
      <DomainHeader eyebrow="勤务训练系统 / TRAINING OPERATIONS" title="勤务训练工作台" description="课程编排、学员训练与档案复核" icon={BrainCircuit} apiOnline={apiOnline} navigate={navigate} />
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

export function TrainingOperationsPage({ overview, apiOnline, navigate, refresh }: DomainPageProps) {
  const [flowStep, setFlowStep] = useState(0);
  const [showcaseStage, setShowcaseStage] = useState<TrainingShowcaseStage>('a1');
  const [showcaseStarted, setShowcaseStarted] = useState(false);
  const [showcaseCompletedSubjects, setShowcaseCompletedSubjects] = useState<number[]>([]);
  const [showcaseScoresRevealed, setShowcaseScoresRevealed] = useState(0);
  const showcaseDisclosureRef = useRef<HTMLDetailsElement | null>(null);
  const [readiness, setReadiness] = useState<TrainingReadinessApi | null>(null);
  const [trainingTasks, setTrainingTasks] = useState<TrainingTaskApi[]>([]);
  const [selectedTrainingTaskId, setSelectedTrainingTaskId] = useState('');
  const [selectedCatalogSubjectId, setSelectedCatalogSubjectId] = useState('equipment-fast-access');
  const [assessment, setAssessment] = useState<TrainingAssessmentApi | null>(null);
  const [archive, setArchive] = useState<TrainingArchiveApi | null>(null);
  const [trainingSyncMessage, setTrainingSyncMessage] = useState('正在同步脱敏训练样例…');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [recordedVideoUrl, setRecordedVideoUrl] = useState('');
  const [recordingElapsedSeconds, setRecordingElapsedSeconds] = useState(0);
  const [xiaoanEvaluation, setXiaoanEvaluation] = useState('');
  const [voiceState, setVoiceState] = useState('等待评分后播报');
  const [retrainingCreated, setRetrainingCreated] = useState(false);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingUrlRef = useRef<string | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const scoringInProgressRef = useRef(false);
  const tabShortcutArmedRef = useRef(false);
  const tabShortcutTimerRef = useRef<number | null>(null);
  const trainingApi = AI_CENTER_API;

  const selectedTaskSource = trainingTasks.find((task) => task.taskId === selectedTrainingTaskId) ?? trainingTasks[0] ?? null;
  const selectedTask = selectedTaskSource && (selectedTaskSource.status === '待复核' || selectedTaskSource.status === '已归档')
    ? { ...selectedTaskSource, status: '待训练' }
    : selectedTaskSource;
  const selectedCatalogSubject = TRAINING_SUBJECT_CATALOG.flatMap((category) => category.modules).flatMap((module) => module.subjects).find((subject) => subject.id === selectedCatalogSubjectId) ?? TRAINING_SUBJECT_CATALOG[0].modules[0].subjects[0];
  const selectedCatalogCategory = TRAINING_SUBJECT_CATALOG.find((category) => category.modules.some((module) => module.subjects.some((subject) => subject.id === selectedCatalogSubject.id))) ?? TRAINING_SUBJECT_CATALOG[0];
  const selectedCatalogModule = selectedCatalogCategory.modules.find((module) => module.subjects.some((subject) => subject.id === selectedCatalogSubject.id)) ?? selectedCatalogCategory.modules[0];
  const catalogTask = selectedCatalogSubject.pilotSubject ? trainingTasks.find((task) => task.subject === selectedCatalogSubject.pilotSubject) ?? null : null;
  const recommendedSubjects = ['equipment-fast-access', 'low-light-formation', 'riot-cordon']
    .map((subjectId) => TRAINING_SUBJECT_CATALOG.flatMap((category) => category.modules).flatMap((module) => module.subjects).find((subject) => subject.id === subjectId))
    .filter((subject): subject is TrainingCatalogSubject => Boolean(subject));
  const flowSteps = [
    { label: '选择训练任务', detail: '选择本轮唯一训练对象' },
    { label: '训练准备', detail: '确认标准、装备和依据' },
    { label: '训练监控', detail: '接入本地画面并录像' },
    { label: '小安评分', detail: '生成可复核建议与播报' },
    { label: '教官复核', detail: '人工确认结果并归档' },
    { label: '归档与补训', detail: '沉淀档案并生成下一轮' },
  ];

  const stopCameraStream = () => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (cameraVideoRef.current) cameraVideoRef.current.srcObject = null;
    setCameraActive(false);
  };

  const releaseRecordedVideo = () => {
    if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
    recordingUrlRef.current = null;
    setRecordedVideoUrl('');
  };

  const loadTrainingPilot = async () => {
    try {
      const [readinessResponse, tasksResponse, archivesResponse] = await Promise.all([
        fetch(`${trainingApi}/training/readiness`),
        fetch(`${trainingApi}/training/tasks`),
        fetch(`${trainingApi}/training/archives`),
      ]);
      if (!readinessResponse.ok || !tasksResponse.ok || !archivesResponse.ok) throw new Error('training unavailable');
      const snapshot = await readinessResponse.json() as TrainingReadinessApi;
      const taskPayload = await tasksResponse.json() as { items: TrainingTaskApi[] };
      const archivePayload = await archivesResponse.json() as { items: TrainingArchiveApi[] };
      setReadiness(snapshot);
      setTrainingTasks(taskPayload.items);
      setSelectedTrainingTaskId((current) => current || taskPayload.items[0]?.taskId || '');
      setArchive(archivePayload.items[0] ?? null);
      setTrainingSyncMessage('训练样例已同步；当前链路仅使用脱敏试点数据。');
    } catch {
      setTrainingSyncMessage('训练接口暂不可用，当前保留本地执行台。');
    }
  };

  useEffect(() => { void loadTrainingPilot(); }, []);

  useEffect(() => () => {
    mediaRecorderRef.current?.state === 'recording' && mediaRecorderRef.current.stop();
    stopCameraStream();
    if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
    if (tabShortcutTimerRef.current) window.clearTimeout(tabShortcutTimerRef.current);
  }, []);

  useEffect(() => {
    if (!cameraActive) return;
    const timer = window.setInterval(() => {
      if (recordingStartedAtRef.current) setRecordingElapsedSeconds(Math.max(1, Math.floor((Date.now() - recordingStartedAtRef.current) / 1000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cameraActive]);

  const speakXiaoanEvaluation = (message: string) => {
    if (!('speechSynthesis' in window)) {
      setVoiceState('当前浏览器不支持语音播报，已保留文字评价。');
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.95;
    utterance.onend = () => setVoiceState('小安播报完成');
    utterance.onerror = () => setVoiceState('语音播报未完成，文字评价仍可查看。');
    setVoiceState('小安正在播报评价…');
    window.speechSynthesis.speak(utterance);
  };

  const startTask = async () => {
    if (!selectedTask) return;
    if (selectedTask.status === '待复核' || selectedTask.status === '已归档') {
      const retryResponse = await fetch(`${trainingApi}/training/tasks/${selectedTask.taskId}/retry`, { method: 'POST' });
      if (!retryResponse.ok) {
        setTrainingSyncMessage('复测任务创建失败，请刷新后重试。');
        return;
      }
      const retryTask = (await retryResponse.json() as { task: TrainingTaskApi }).task;
      setTrainingTasks((current) => current.some((item) => item.taskId === retryTask.taskId) ? current : [...current, retryTask]);
      setSelectedTrainingTaskId(retryTask.taskId);
      setTrainingSyncMessage(`复测任务 ${retryTask.taskId} 已进入训练准备。`);
      setFlowStep(1);
      return;
    }
    if (selectedTask.status === '待训练' || selectedTask.status === '训练中') {
      if (selectedTask.status === '训练中') {
        setFlowStep(2);
        return;
      }
      const response = await fetch(`${trainingApi}/training/tasks/${selectedTask.taskId}/start`, { method: 'POST' });
      if (!response.ok) {
        setTrainingSyncMessage('训练任务未能启动，请刷新后重试。');
        return;
      }
      const next = (await response.json() as { task: TrainingTaskApi }).task;
      setTrainingTasks((current) => current.map((item) => item.taskId === next.taskId ? next : item));
    }
    setFlowStep(2);
    setTrainingSyncMessage(`任务 ${selectedTask.taskId} 已进入训练监控。`);
  };

  const startTrainingRecording = async () => {
    if (!selectedTask || selectedTask.status !== '训练中') return;
    setCameraError('');
    setRecordingElapsedSeconds(0);
    releaseRecordedVideo();
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setCameraError('当前浏览器不支持本地录像；本轮仅提供试点评分建议，需教官复核。');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      cameraStreamRef.current = stream;
      if (cameraVideoRef.current) cameraVideoRef.current.srcObject = stream;
      recordedChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordedChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        if (recordedChunksRef.current.length) {
          const recording = new Blob(recordedChunksRef.current, { type: recorder.mimeType || 'video/webm' });
          const nextUrl = URL.createObjectURL(recording);
          if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
          recordingUrlRef.current = nextUrl;
          setRecordedVideoUrl(nextUrl);
        }
        stopCameraStream();
      };
      recorder.start(500);
      recordingStartedAtRef.current = Date.now();
      setCameraActive(true);
      setTrainingSyncMessage('本地监控录像已开始，录像不会上传至训练服务。');
    } catch {
      stopCameraStream();
      setCameraError('摄像头未授权或不可用；本轮仅提供试点评分建议，需教官复核。');
    }
  };

  const finishTrainingAndScore = async () => {
    if (!selectedTask || selectedTask.status !== '训练中' || scoringInProgressRef.current) return;
    scoringInProgressRef.current = true;
    const elapsed = recordingStartedAtRef.current ? Math.max(1, Math.floor((Date.now() - recordingStartedAtRef.current) / 1000)) : recordingElapsedSeconds || selectedTask.elapsedSeconds || 28;
    recordingStartedAtRef.current = null;
    setRecordingElapsedSeconds(elapsed);
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
    else stopCameraStream();
    try {
      const completeResponse = await fetch(`${trainingApi}/training/tasks/${selectedTask.taskId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ elapsedSeconds: Math.min(3600, elapsed) }),
      });
      if (!completeResponse.ok) throw new Error('complete unavailable');
      const completedTask = (await completeResponse.json() as { task: TrainingTaskApi }).task;
      setTrainingTasks((current) => current.map((item) => item.taskId === completedTask.taskId ? completedTask : item));
      const assessmentResponse = await fetch(`${trainingApi}/training/tasks/${selectedTask.taskId}/assessment`, { method: 'POST' });
      if (!assessmentResponse.ok) throw new Error('assessment unavailable');
      const nextAssessment = (await assessmentResponse.json() as { assessment: TrainingAssessmentApi }).assessment;
      setAssessment(nextAssessment);
      const { standardization, completionTime, coordination, total } = nextAssessment.score;
      const evaluation = `小安评价：动作规范度 ${standardization} 分，完成用时 ${completionTime} 分，协同一致性 ${coordination} 分，总分 ${total} 分。当前结果仍需教官人工复核确认。`;
      setXiaoanEvaluation(evaluation);
      speakXiaoanEvaluation(evaluation);
      setFlowStep(3);
      setTrainingSyncMessage('本轮评分建议已生成，等待教官复核。');
    } catch {
      setTrainingSyncMessage('评分服务暂不可用，请刷新后重新提交。');
    } finally {
      scoringInProgressRef.current = false;
    }
  };

  const showcaseAdvance = () => {
    if (showcaseStage === 'a1') {
      if (showcaseStarted) {
        setShowcaseStage('a2');
        return;
      }
      window.setTimeout(() => setShowcaseStarted(true), 500);
      return;
    }
    if (showcaseStage === 'a2') {
      completeShowcaseSubject();
      return;
    }
    if (showcaseStage === 'a3') {
      setShowcaseScoresRevealed((current) => {
        const next = Math.min(SHOWCASE_SCORES.length, current + 1);
        if (next === SHOWCASE_SCORES.length) window.setTimeout(() => setShowcaseStage('handoff'), 500);
        return next;
      });
    }
  };

  const completeShowcaseSubject = () => {
    if (showcaseStage !== 'a2') return;
    const nextSubject = SHOWCASE_SUBJECTS.findIndex((_, index) => !showcaseCompletedSubjects.includes(index));
    if (nextSubject < 0) return;
    setShowcaseCompletedSubjects((current) => [...current, nextSubject]);
    if (nextSubject === SHOWCASE_SUBJECTS.length - 1) window.setTimeout(() => setShowcaseStage('a3'), 500);
  };

  const createRetestTask = async () => {
    if (!selectedTask || !assessment) return;
    const response = await fetch(`${trainingApi}/training/tasks/${selectedTask.taskId}/retry`, { method: 'POST' });
    if (!response.ok) {
      setTrainingSyncMessage('复测任务创建失败，请刷新后重试。');
      return;
    }
    const next = (await response.json() as { task: TrainingTaskApi }).task;
    setTrainingTasks((current) => current.some((item) => item.taskId === next.taskId) ? current : [...current, next]);
    setSelectedTrainingTaskId(next.taskId);
    setAssessment(null);
    setArchive(null);
    setRetrainingCreated(false);
    setCameraError('');
    setXiaoanEvaluation('');
    setVoiceState('等待评分后播报');
    setRecordingElapsedSeconds(0);
    releaseRecordedVideo();
    setFlowStep(1);
    setTrainingSyncMessage('复测任务已创建，已进入训练准备。');
  };

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key === 'Tab') {
        tabShortcutArmedRef.current = true;
        if (tabShortcutTimerRef.current) window.clearTimeout(tabShortcutTimerRef.current);
        tabShortcutTimerRef.current = window.setTimeout(() => { tabShortcutArmedRef.current = false; }, 1200);
        return;
      }
      if (event.key.toLowerCase() !== 'p' || !tabShortcutArmedRef.current) return;
      if (!selectedTask || selectedTask.status !== '训练中') return;
      event.preventDefault();
      tabShortcutArmedRef.current = false;
      void finishTrainingAndScore();
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [selectedTask, recordingElapsedSeconds]);

  useEffect(() => {
    const handleShowcaseShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target instanceof HTMLVideoElement || (target instanceof HTMLElement && target.isContentEditable)) return;
      if (target?.closest('input, textarea, select, video, [contenteditable="true"]')) return;
      const isShowcaseShortcut = event.shiftKey && event.code === 'Space';
      if (!isShowcaseShortcut || event.ctrlKey || event.altKey || event.metaKey) return;
      event.preventDefault();
      if (showcaseDisclosureRef.current) showcaseDisclosureRef.current.open = true;
      showcaseAdvance();
    };
    window.addEventListener('keydown', handleShowcaseShortcut);
    return () => window.removeEventListener('keydown', handleShowcaseShortcut);
  }, [showcaseStage, showcaseStarted, showcaseCompletedSubjects]);

  const reviewTrainingAssessment = async () => {
    if (!assessment) return;
    const response = await fetch(`${trainingApi}/training/assessments/${assessment.assessmentId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'confirmed', reason: '教官确认试点评分结果', reviewerId: 'INSTRUCTOR-001' }),
    });
    if (!response.ok) {
      setTrainingSyncMessage('教官复核未能写入，请重试。');
      return;
    }
    setAssessment((await response.json() as { assessment: TrainingAssessmentApi }).assessment);
    await loadTrainingPilot();
    setFlowStep(5);
    setTrainingSyncMessage('教官复核已完成，训练档案已生成。');
  };

  const createRetrainingTask = async () => {
    if (!archive) return;
    const response = await fetch(`${trainingApi}/training/archives/${archive.recordId}/retraining`, { method: 'POST' });
    if (!response.ok) {
      setTrainingSyncMessage('补训任务创建失败，请重试。');
      return;
    }
    const next = (await response.json() as { task: TrainingTaskApi }).task;
    setTrainingTasks((current) => current.some((item) => item.taskId === next.taskId) ? current.map((item) => item.taskId === next.taskId ? next : item) : [...current, next]);
    setSelectedTrainingTaskId(next.taskId);
    setAssessment(null);
    setArchive(null);
    setRetrainingCreated(true);
    setCameraError('');
    setXiaoanEvaluation('');
    setVoiceState('等待评分后播报');
    setRecordingElapsedSeconds(0);
    releaseRecordedVideo();
    setFlowStep(1);
    setTrainingSyncMessage('补训任务已创建，已进入训练准备。');
  };

  const retryCatalogTask = async (task: TrainingTaskApi) => {
    if (task.status === '待训练' || task.status === '训练中') {
      resetForSelectedTask(task.taskId);
      setFlowStep(1);
      return;
    }
    const response = await fetch(`${trainingApi}/training/tasks/${task.taskId}/retry`, { method: 'POST' });
    if (!response.ok) {
      setTrainingSyncMessage('当前任务无法复测，请先确认评分记录已生成。');
      return;
    }
    const next = (await response.json() as { task: TrainingTaskApi }).task;
    setTrainingTasks((current) => current.some((item) => item.taskId === next.taskId) ? current : [...current, next]);
    resetForSelectedTask(next.taskId);
    setFlowStep(1);
    setTrainingSyncMessage('复测任务已创建，已进入训练准备。');
  };

  const resetForSelectedTask = (taskId: string) => {
    setSelectedTrainingTaskId(taskId);
    setAssessment(null);
    setArchive(null);
    setRetrainingCreated(false);
    setCameraError('');
    setXiaoanEvaluation('');
    setVoiceState('等待评分后播报');
    setRecordingElapsedSeconds(0);
    releaseRecordedVideo();
  };

  const selectCatalogSubject = (subject: TrainingCatalogSubject) => {
    setSelectedCatalogSubjectId(subject.id);
    const matchingTask = subject.pilotSubject ? trainingTasks.find((task) => task.subject === subject.pilotSubject) ?? null : null;
    if (matchingTask) resetForSelectedTask(matchingTask.taskId);
  };

  const selectCatalogCategory = (categoryId: string) => {
    const category = TRAINING_SUBJECT_CATALOG.find((item) => item.id === categoryId);
    if (category) selectCatalogSubject(category.modules[0].subjects[0]);
  };

  const selectCatalogModule = (moduleId: string) => {
    const module = selectedCatalogCategory.modules.find((item) => item.id === moduleId);
    if (module) selectCatalogSubject(module.subjects[0]);
  };

  const goToCompletedStep = (index: number) => {
    if (index <= flowStep) setFlowStep(index);
  };

  const renderFlowBody = () => {
    if (flowStep === 0) {
      const selectedTaskUnavailable = !catalogTask;
      const catalogActionLabel = catalogTask?.status === '待训练' || catalogTask?.status === '训练中' ? '执行本轮任务' : '开始复测';
      return (
        <div className="training-flow-body">
          <div className="training-flow-notice">
            <strong>公安民警训练科目 · 选择本轮训练对象</strong>
            <span>当前可执行：已配置的试点任务</span>
          </div>
          <section className="training-catalog-compact" aria-label="训练任务清单">
            <div className="training-task-list-heading">
              <div><span className="training-catalog-kicker"><ListTree size={14} />训练任务清单</span></div>
              <small>{TRAINING_SUBJECT_CATALOG.length} 个一级领域</small>
            </div>
            <div className="training-catalog-selectors">
              <label><span>一级领域</span><select value={selectedCatalogCategory.id} onChange={(event) => selectCatalogCategory(event.target.value)}>{TRAINING_SUBJECT_CATALOG.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}</select></label>
              <label><span>二级模块</span><select value={selectedCatalogModule.id} onChange={(event) => selectCatalogModule(event.target.value)}>{selectedCatalogCategory.modules.map((module) => <option key={module.id} value={module.id}>{module.label}</option>)}</select></label>
              <label><span>具体科目</span><select value={selectedCatalogSubject.id} onChange={(event) => { const subject = selectedCatalogModule.subjects.find((item) => item.id === event.target.value); if (subject) selectCatalogSubject(subject); }}>{selectedCatalogModule.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.label}</option>)}</select></label>
            </div>
            <section className="training-catalog-detail training-catalog-detail-compact">
              <div className="training-catalog-detail-heading">
                <div><span className="training-catalog-kicker"><BookOpenCheck size={14} />当前选择</span><h3>{selectedCatalogSubject.label}</h3><p>{selectedCatalogSubject.description}</p></div>
                <span className={`training-catalog-badge ${catalogTask ? 'available' : ''}`}>{catalogTask ? '可执行试点任务' : '目录项 / 待配置'}</span>
              </div>
              <dl className="training-catalog-facts">
                <div><dt>训练对象</dt><dd>{selectedCatalogSubject.audience}</dd></div>
                <div><dt>训练目标</dt><dd>{selectedCatalogSubject.goal}</dd></div>
                <div><dt>训练装备</dt><dd>{selectedCatalogSubject.equipment.join('、')}</dd></div>
                <div><dt>达标提示</dt><dd>{catalogTask?.standard.label ?? selectedCatalogSubject.standard}</dd></div>
                <div><dt>训练依据</dt><dd>{selectedCatalogSubject.basis.join('；')}</dd></div>
              </dl>
              {catalogTask ? (
                <div className="training-catalog-execution">
                  <div><strong>{catalogTask.taskId}</strong><span>学员：{catalogTask.traineeId} · {catalogTask.teamName}</span><small>当前状态：{catalogTask.status}</small></div>
                  <button type="button" className="domain-primary-button" disabled={selectedTaskUnavailable} onClick={() => void retryCatalogTask(catalogTask)}>{catalogActionLabel} <ArrowRight size={15} /></button>
                </div>
              ) : (
                <div className="training-catalog-pending"><BookOpenCheck size={17} /><div><strong>训练模板待配置</strong><span>此科目尚未接入评分与归档，不计入已执行训练。</span></div></div>
              )}
            </section>
          </section>
          <div className="training-flow-actions"><button type="button" className="domain-primary-button" disabled={selectedTaskUnavailable} onClick={() => setFlowStep(1)}>进入训练准备 <ArrowRight size={15} /></button></div>
        </div>
      );
    }
    if (flowStep === 1) {
      return <div className="training-flow-body"><div className="training-prep-summary"><div><small>当前任务</small><strong>{selectedTask?.subject ?? '等待选择任务'}</strong><span>{selectedTask?.taskId ?? '—'}</span></div><div><small>达标标准</small><strong>{selectedTask?.standard.label ?? '—'}</strong><span>评分规则：{readiness?.ruleVersion ?? '同步中'}</span></div><div><small>训练装备</small><strong>{selectedTask?.equipment.join('、') ?? '—'}</strong><span>依据：{selectedTask?.basis[0] ?? '等待态势依据'}</span></div></div><div className="training-readiness-strip"><strong>A1 靶向依据</strong><span>{readiness?.riskComposition.map((item) => `${item.label} ${item.value}%`).join(' · ') ?? trainingSyncMessage}</span><small>{readiness?.notice ?? '训练数据加载中'}</small></div><div className="training-flow-checklist"><span><CheckCircle2 size={15} />已核对装备与训练空间</span><span><CheckCircle2 size={15} />已知晓达标标准与评分边界</span><span><CheckCircle2 size={15} />录像仅本地留存，不上传</span></div><div className="training-flow-actions"><button type="button" className="domain-secondary-button" onClick={() => setFlowStep(0)}>返回选择</button><button type="button" className="domain-primary-button" disabled={!selectedTask || (selectedTask.status !== '待训练' && selectedTask.status !== '训练中')} onClick={() => void startTask()}>确认并开始训练 <Radio size={15} /></button></div></div>;
    }
    if (flowStep === 2) {
      return (
        <div className="training-flow-body">
          <div className="training-scenario-head">
            <span>{selectedTask?.taskId ?? '—'}</span>
            <strong>{selectedTask?.subject ?? '等待选择任务'}</strong>
            <small>评分结论为确定性试点规则建议，必须由教官复核。</small>
          </div>
          <div className="training-monitor-grid">
            <div className="training-monitor-panel">
              <div className="training-monitor-viewport">
                {recordedVideoUrl ? <video className="training-monitor-video" src={recordedVideoUrl} controls playsInline /> : <video ref={cameraVideoRef} className="training-monitor-video" autoPlay muted playsInline />}
                {!cameraActive && !recordedVideoUrl && <div className="training-monitor-placeholder"><Radio size={21} /><strong>监控画面待启动</strong><small>本地摄像头未接入</small></div>}
                <span className="training-monitor-badge"><i className={cameraActive ? 'live' : ''} />{cameraActive ? 'LIVE 本地录像中' : recordedVideoUrl ? '录像回放' : '待机'}</span>
                <span className="training-monitor-watermark">教学训练仿真系统 · 数据已脱敏</span>
              </div>
              <div className="training-monitor-meta"><span>录像时长：{recordingElapsedSeconds}s</span><span>设备：{cameraActive ? '浏览器摄像头' : '未接入'}</span><span>隐私：本地试点录像，不上传</span></div>
            </div>
            <div className="training-score-panel">
              <strong>当前训练控制</strong>
              <p>{cameraActive ? '本地录像进行中' : '等待本地录像或试点评分'}</p>
              <div className="training-score-grid">
                <div><small>达标阈值</small><strong>{selectedTask?.standard.thresholdSeconds ?? '—'}</strong><span>秒</span></div>
                <div><small>评分状态</small><strong>{assessment ? '已生成' : '待评分'}</strong><span>教官复核前不归档</span></div>
              </div>
            </div>
          </div>
          <div className="training-flow-actions">
            <button type="button" className="domain-primary-button" disabled={!selectedTask || cameraActive || selectedTask.status !== '训练中'} onClick={() => void startTrainingRecording()}><Radio size={15} />{cameraActive ? '录像进行中' : '开始录像'}</button>
            <button type="button" className="domain-primary-button" disabled={!selectedTask || selectedTask.status !== '训练中'} onClick={() => void finishTrainingAndScore()}><BrainCircuit size={15} />结束录像并提交评分</button>
            <button type="button" className="domain-secondary-button" disabled={!selectedTask || selectedTask.status !== '训练中'} onClick={() => void finishTrainingAndScore()}><ClipboardCheck size={15} />提交试点评分</button>
          </div>
          {cameraError && <div className="training-camera-error"><AlertTriangle size={15} /><span>{cameraError}</span></div>}
        </div>
      );
    }
    if (flowStep === 3) {
      const score = assessment?.score;
      const scoreDimensions = [
        { label: '动作规范度', detail: '动作与流程符合训练标准', value: score?.standardization ?? 0 },
        { label: '完成用时', detail: '在限定时间内完成训练动作', value: score?.completionTime ?? 0 },
        { label: '协同一致性', detail: '口令、站位与配合保持一致', value: score?.coordination ?? 0 },
      ];
      const weakestDimension = scoreDimensions.reduce((lowest, item) => item.value < lowest.value ? item : lowest, scoreDimensions[0]);
      const scoreConclusion = (score?.total ?? 0) >= 90 ? '整体表现良好' : (score?.total ?? 0) >= 75 ? '达到训练基本要求' : '建议安排针对性补训';
      return <div className="training-flow-body"><section className="training-assessment-overview"><div className="training-assessment-verdict"><span className="training-assessment-kicker"><BrainCircuit size={15} />小安评估建议</span><div className="training-assessment-total"><strong>{score?.total ?? '—'}</strong><span>/ 100</span></div><strong className="training-assessment-conclusion">{score ? scoreConclusion : '等待评分结果'}</strong><p>评分已生成，当前仅作为可复核建议，须由教官确认后方可归档。</p></div><div className="training-assessment-dimensions"><div className="training-assessment-section-head"><div><span>评分维度</span><strong>逐项对照训练标准</strong></div><b>待教官复核</b></div><div className="training-score-dimension-list">{scoreDimensions.map((item) => <div className="training-score-dimension" key={item.label}><div><strong>{item.label}</strong><small>{item.detail}</small></div><span className="training-score-meter" aria-label={`${item.label} ${item.value} 分`}><i style={{ width: `${item.value}%` }} /></span><b>{item.value}<small>分</small></b></div>)}</div></div></section><section className="training-assessment-workspace"><div className="training-recording-review training-assessment-evidence"><div className="training-assessment-section-head"><div><span>证据回看</span><strong>本地训练录像</strong></div><b>{recordedVideoUrl ? '可回看' : '无录像'}</b></div>{recordedVideoUrl ? <video className="training-monitor-video" src={recordedVideoUrl} controls playsInline /> : <div className="training-assessment-no-video"><Radio size={18} /><span>本次评分未生成本地录像，可由教官依据现场记录复核。</span></div>}<div className="training-evidence-note"><span>审计编号：{assessment?.auditId ?? '待生成'}</span><span>证据时间：{assessment?.evidenceTime ?? '待采集'}</span></div></div><aside className="training-xiaoan-evaluation training-assessment-comment"><div className="training-assessment-section-head"><div><span>评分结论</span><strong>小安评价</strong></div><b>可复核建议</b></div><p>{xiaoanEvaluation || '评分结果正在同步。'}</p><dl><div><dt>优先关注</dt><dd>{weakestDimension.label} {weakestDimension.value} 分</dd></div><div><dt>评分置信度</dt><dd>{assessment ? `${Math.round(assessment.confidence * 100)}%` : '待生成'}</dd></div></dl><div className="training-assessment-actions"><button type="button" className="domain-secondary-button" disabled={!assessment} onClick={() => void createRetestTask()}><Radio size={14} />重新测试</button><button type="button" className="domain-secondary-button" disabled={!xiaoanEvaluation} onClick={() => speakXiaoanEvaluation(xiaoanEvaluation)}><Mic size={14} />再次播报</button><button type="button" className="domain-primary-button" disabled={!assessment} onClick={() => setFlowStep(4)}>提交教官复核 <ArrowRight size={15} /></button></div><small className="training-voice-state">{voiceState}</small></aside></section><div className="training-evidence-note training-assessment-disclaimer"><span>结果属性：试点规则建议，不替代教官结论</span><span>训练数据仅本地留存，不上传</span></div></div>;
    }
    if (flowStep === 4) {
      return <div className="training-flow-body"><div className="training-review-card"><div className="training-avatar"><UsersRound size={21} /></div><div><strong>教官复核待办</strong><p>请对小安评分、录像回放和达标标准进行人工确认。确认后才会写入训练档案。</p><small>任务：{selectedTask?.taskId ?? '—'} · 审计：{assessment?.auditId ?? '待生成'}</small></div></div><div className="training-review-checklist"><span><CheckCircle2 size={15} />已查看训练录像或无摄像头评分说明</span><span><CheckCircle2 size={15} />已核对评分、达标标准与异常情况</span><span><CheckCircle2 size={15} />确认由教官承担最终归档责任</span></div><div className="training-flow-actions"><button type="button" className="domain-secondary-button" onClick={() => setFlowStep(3)}>返回评分结果</button><button type="button" className="domain-primary-button" disabled={!assessment || assessment.reviewStatus !== 'pending'} onClick={() => void reviewTrainingAssessment()}>确认评分并归档 <CheckCircle2 size={15} /></button></div></div>;
    }
    return <div className="training-flow-body"><div className="training-archive-card"><div className="training-avatar"><Database size={21} /></div><div><strong>训练档案已生成</strong><p>{archive?.retrainingRecommendation ?? '正在同步档案与补训建议。'}</p><small>档案：{archive?.recordId ?? '待同步'} · 审计：{archive?.auditId ?? assessment?.auditId ?? '待生成'}</small></div></div><div className="training-archive-details"><span>结果：{archive?.result ?? '已确认'}</span><span>待加强：{archive?.weakPoints?.join('、') ?? '等待建议'}</span><span>当前任务：{selectedTask?.subject ?? '—'}</span></div><div className="training-flow-actions"><button type="button" className="domain-primary-button" disabled={!archive || retrainingCreated} onClick={() => void createRetrainingTask()}>{retrainingCreated ? '补训任务已创建' : '创建补训任务'}</button><button type="button" className="domain-secondary-button" onClick={() => { setFlowStep(0); void loadTrainingPilot(); }}>返回任务选择</button></div>{retrainingCreated && <ContractNote>补训任务已绑定本次档案来源，并已自动进入训练准备环节。</ContractNote>}</div>;
  };

  const renderTrainingShowcase = () => {
    if (showcaseStage === 'a1') return <section className={`training-showcase training-showcase-a1 ${showcaseStarted ? 'is-generated' : ''}`} aria-label="A1 勤务态势大屏"><header><span>公安勤务态势 · A1</span><strong>今晚执勤画像</strong><small>{showcaseStarted ? '小安已完成态势生成' : '等待态势生成'}</small></header><div className="training-showcase-a1-grid"><article className="showcase-ring-panel"><span>警情类型占比</span><div className="showcase-ring"><i /><b>128<small>今日警情</small></b></div><dl><div><dt>滋事纠纷 41%</dt><dd>41%</dd></div><div><dt>手机扒窃 28%</dt><dd>28%</dd></div><div><dt>其他</dt><dd>27%</dd></div><div className="danger"><dt>可疑物品 4%</dt><dd>4%</dd></div></dl></article><article className="showcase-heat-panel"><span>夜市平面热力图</span><div className="showcase-night-map"><div className="showcase-map-grid" /><div className="showcase-hotspot"><b>B区烧烤摊聚集区</b></div><div className="showcase-flow-arrow arrow-one" /><div className="showcase-flow-arrow arrow-two" /><small>人流方向</small></div></article><article className="showcase-trend-panel"><span>分时段警量</span><div className="showcase-bars">{['18:00','19:00','20:00','21:00','22:00','23:00'].map((label, index) => <div key={label} className={index >= 2 ? 'peak' : ''}><i style={{ height: `${24 + index * 11}%` }} /><small>{label}</small></div>)}</div><strong>20:00–23:00 <em>高发时段</em></strong></article></div>{showcaseStarted && <button type="button" className="showcase-training-banner" onClick={() => setShowcaseStage('a2')}><span><b>今日靶向训练科目已推送</b><small>单警装备训练 · 弱光执法战术训练 · 防爆先期处置</small></span><ArrowRight size={18} /></button>}</section>;
    if (showcaseStage === 'a2') return <section className="training-showcase training-showcase-a2" aria-label="A2 靶向训练清单"><header><span>靶向训练清单 · A2</span><strong>今晚三项备勤训练</strong><small>{showcaseCompletedSubjects.length} / 3 已完成</small></header><div className="showcase-training-cards">{SHOWCASE_SUBJECTS.map((item, index) => { const done = showcaseCompletedSubjects.includes(index); return <button type="button" key={item.subject} className={`showcase-training-card ${done ? 'is-complete' : ''}`} onClick={() => completeShowcaseSubject()}><span className="showcase-card-index">0{index + 1}</span><span className="showcase-card-check">{done ? <CheckCircle2 size={22} /> : <span>{index + 1}</span>}</span><strong>{item.subject}</strong><small>依据：{item.basis}</small><small>装备：{item.equipment.join(' · ')}</small><b>达标标准：{item.standard}</b></button>; })}</div><div className="showcase-progress-track"><i style={{ width: `${(showcaseCompletedSubjects.length / 3) * 100}%` }} /></div><small className="showcase-fallback-note">当前为脱敏演示状态；真实任务状态由训练服务同步。</small></section>;
    if (showcaseStage === 'a3') { const revealed = SHOWCASE_SCORES.slice(0, showcaseScoresRevealed); return <section className="training-showcase training-showcase-a3" aria-label="A3 AI 动捕考核"><header><span>AI 动捕考核 · A3</span><strong>全体科目动作复核</strong><small>{showcaseScoresRevealed} / 3 评分项已呈现</small></header><div className="showcase-assessment-grid"><div className="showcase-motion-panel"><div className="showcase-motion-stage"><div className="showcase-scanline" /><div className="showcase-motion-skeleton"><span className="showcase-motion-joint head" /><span className="showcase-motion-joint shoulder" /><span className="showcase-motion-joint elbow" /><span className="showcase-motion-joint hand" /><span className="showcase-motion-joint hip" /><span className="showcase-motion-joint knee" /><span className="showcase-motion-joint foot" /><i className="showcase-motion-link link-one" /><i className="showcase-motion-link link-two" /><i className="showcase-motion-link link-three" /><i className="showcase-motion-link link-four" /></div><b>骨骼动捕 · 本地脱敏画面</b></div></div><div className="showcase-score-panel">{revealed.map((score) => <div className="showcase-score-row" key={score.label}><span>{score.label}</span><i><b style={{ width: `${score.value}%` }} /></i><strong>{score.value}</strong><small>{score.note}</small></div>)}{showcaseScoresRevealed === 0 && <p>等待小安逐项呈现评分依据。</p>}</div></div>{showcaseScoresRevealed >= 3 && <div className="showcase-result-stamp"><span>合格</span><strong>{SHOWCASE_SCORES.every((score) => score.value >= 80) ? '全体科目达标' : '存在补训项'}</strong><small>评分建议已生成 · 等待教官复核</small></div>}</section>; }
    return <section className="training-showcase training-showcase-handoff" aria-label="教官复核交接"><div className="showcase-handoff-mark"><CheckCircle2 size={34} /></div><span>训练演示链路完成</span><strong>评分建议已准备好</strong><small>下一步由教官复核后写入训练档案。</small><button type="button" className="domain-primary-button" onClick={() => setFlowStep(3)}>进入教官复核 <ArrowRight size={15} /></button></section>;
  };

  return (
    <section className="domain-page training-operations-page training-showcase-host">
      <details className="training-showcase-disclosure" ref={showcaseDisclosureRef}>
        <summary><BarChart3 size={18} /><span>勤务态势与训练演示</span><small>脱敏样例</small><ChevronDown size={16} /></summary>
        <div className="training-showcase-shell">{renderTrainingShowcase()}</div>
        {showcaseStage !== 'handoff' && <div className="showcase-controls"><button type="button" className="domain-secondary-button" onClick={showcaseAdvance}><ArrowRight size={15} />{showcaseStage === 'a1' ? showcaseStarted ? '查看训练清单' : '生成勤务态势' : showcaseStage === 'a2' ? '完成下一训练科目' : '查看下一项评分'}</button></div>}
      </details>
      <DomainHeader eyebrow="勤务训练系统 / TRAINING OPERATIONS" title="备勤训练执行台" description="训练任务、录像评分与教官复核" icon={BrainCircuit} apiOnline={apiOnline} navigate={navigate} />
      <section className="training-recommendations" aria-label="推荐训练科目"><div className="training-recommendations-heading"><h2>推荐训练科目</h2><small>复测保留历史记录</small></div><div className="training-recommendation-grid">{recommendedSubjects.map((subject) => { const task = subject.pilotSubject ? trainingTasks.find((item) => item.subject === subject.pilotSubject) ?? null : null; return <button type="button" className="training-recommendation-card" key={subject.id} onClick={() => { setSelectedCatalogSubjectId(subject.id); if (task) void retryCatalogTask(task); }}><span className="training-recommendation-icon"><BookOpenCheck size={18} /></span><span className="training-recommendation-content"><strong>{subject.label}</strong><small>{subject.goal}</small><em>{task ? (task.status === '待训练' || task.status === '训练中' ? '可直接开始' : '开始复测') : '目录待配置'}</em></span><ArrowRight size={16} /></button>; })}</div></section>
      <div className="training-execution-shell">
        <section className="domain-panel training-execution-panel">
          <PanelHeading kicker="TRAINING EXECUTION CHAIN" title="训练执行闭环" icon={Workflow} />
          <ol className="training-flow-steps">{flowSteps.map((step, index) => <li key={step.label} className={index === flowStep ? 'active' : index < flowStep ? 'done' : ''}><button type="button" disabled={index > flowStep} onClick={() => goToCompletedStep(index)}><span>{index < flowStep ? <CheckCircle2 size={15} /> : String(index + 1).padStart(2, '0')}</span><div><strong>{step.label}</strong><small>{step.detail}</small></div></button></li>)}</ol>
          <div className="training-flow-status" aria-live="polite"><Radio size={14} /><span>{trainingSyncMessage}</span></div>
          {renderFlowBody()}
          <div className="training-flow-footer"><button type="button" className="domain-text-button" onClick={() => void refresh?.()}>同步训练数据 <ArrowRight size={14} /></button><small>当前为脱敏训练样例与确定性评分规则演示；不进行实时身份识别，不自动写入档案。</small></div>
        </section>
      </div>
    </section>
  );
}

export function AICenterPage({ apiOnline, navigate }: DomainPageProps) {
  const [runtime, setRuntime] = useState<AiRuntimeSnapshot | null>(null);
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [reviewState, setReviewState] = useState('尚未提交人工决定。');
  const [reviewPending, setReviewPending] = useState(false);
  const [reviewReason, setReviewReason] = useState('');
  const [reviewDraftAuditId, setReviewDraftAuditId] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [reviewer, setReviewer] = useState<AiReviewUser | null>(null);
  const [authPending, setAuthPending] = useState(false);
  const [authState, setAuthState] = useState('未登录业务账号。');
  const tokenRef = useRef('');
  const runtimeController = useRef<AbortController | null>(null);
  const loginController = useRef<AbortController | null>(null);
  const reviewController = useRef<AbortController | null>(null);
  const result = runtime?.sampleResult;
  const canReview = Boolean(reviewer?.permissions.includes('review'));
  const updateReviewReason = (value: string) => {
    setReviewReason(value);
    setReviewDraftAuditId(result?.auditId ?? '');
  };

  const refreshRuntime = useCallback(async () => {
    if (reviewController.current) return;
    runtimeController.current?.abort();
    const controller = new AbortController();
    runtimeController.current = controller;
    setRuntimeLoading(true);
    setRuntimeError(null);
    try {
      const snapshot = await getAiRuntime(controller.signal);
      if (controller.signal.aborted || runtimeController.current !== controller) return;
      setRuntime(snapshot);
    } catch (error) {
      if (controller.signal.aborted || runtimeController.current !== controller) return;
      setRuntimeError(error instanceof AiCenterApiError ? error.message : '运行态同步失败，请重试。');
    } finally {
      if (runtimeController.current === controller) {
        runtimeController.current = null;
        setRuntimeLoading(false);
      }
    }
  }, []);

  const login = async () => {
    if (!tokenInput.trim() || loginController.current || reviewController.current) return;
    const token = tokenInput.trim();
    const controller = new AbortController();
    loginController.current = controller;
    tokenRef.current = '';
    setReviewer(null);
    setTokenInput('');
    setAuthPending(true);
    setAuthState('正在核验业务账号与权限…');
    try {
      const user = await authenticateAiReviewer(token, controller.signal);
      if (controller.signal.aborted || loginController.current !== controller) return;
      tokenRef.current = token;
      setReviewer(user);
      setAuthState(user.permissions.includes('review') ? '业务账号已验证，可提交 AI 审核。' : '业务账号已验证，但没有 review 权限，当前仅可查看。');
    } catch (error) {
      if (controller.signal.aborted || loginController.current !== controller) return;
      setAuthState(error instanceof AiCenterApiError ? error.message : '业务账号验证失败，请重试。');
    } finally {
      if (loginController.current === controller) {
        loginController.current = null;
        setAuthPending(false);
      }
    }
  };

  const logout = () => {
    loginController.current?.abort();
    loginController.current = null;
    if (reviewController.current) {
      reviewController.current.abort();
      reviewController.current = null;
      setRuntimeError('审核请求已取消，服务端结果待核对，请刷新运行态。');
      setReviewState('未收到审核成功回执；取消请求不代表服务端撤销。');
    }
    tokenRef.current = '';
    setTokenInput('');
    setReviewer(null);
    setAuthPending(false);
    setReviewPending(false);
    setAuthState('已退出本页业务登录，令牌已从本页内存清除。');
  };

  const submitReview = async (decision: 'confirmed' | 'rejected') => {
    if (!result || result.reviewStatus !== 'pending' || !canReview || !tokenRef.current
      || !reviewReason.trim() || reviewDraftAuditId !== result.auditId || runtimeController.current || runtimeLoading || runtimeError
      || loginController.current || reviewController.current) return;
    const controller = new AbortController();
    reviewController.current = controller;
    setReviewPending(true);
    setReviewState('正在提交人工决定…');
    try {
      const next = await submitAiReview(tokenRef.current, result.auditId, decision, reviewReason, controller.signal);
      if (controller.signal.aborted || reviewController.current !== controller) return;
      setRuntime((current) => current?.sampleResult?.auditId === next.auditId ? { ...current, sampleResult: next } : current);
      setReviewState(decision === 'confirmed' ? '服务端已返回人工确认回执；未执行后续业务办理。' : '服务端已返回驳回回执；未执行后续业务办理。');
    } catch (error) {
      if (controller.signal.aborted || reviewController.current !== controller) return;
      if (error instanceof AiCenterApiError && error.status === 401) {
        tokenRef.current = '';
        setReviewer(null);
        setAuthState('业务登录已失效，请重新登录。');
      }
      if (error instanceof AiCenterApiError && error.status === 403) {
        setReviewer((current) => current ? { ...current, permissions: [] } : null);
        setAuthState('当前账号无审核权限，请联系管理员后重新验证。');
      }
      setReviewState('未收到审核成功回执。' + (error instanceof AiCenterApiError ? error.message : '请刷新运行态核对结果。'));
      setRuntimeError('审核结果待核对，请刷新运行态后再操作；审核意见已保留。');
    } finally {
      if (reviewController.current === controller) {
        reviewController.current = null;
        setReviewPending(false);
      }
    }
  };

  useEffect(() => {
    void refreshRuntime();
    return () => {
      runtimeController.current?.abort();
      loginController.current?.abort();
      reviewController.current?.abort();
      runtimeController.current = null;
      loginController.current = null;
      reviewController.current = null;
      tokenRef.current = '';
    };
  }, [refreshRuntime]);

  const fallbackAgents = [
    { name: '接处警协同 Agent', status: 'pending', currentTask: '目录样例 · 警情摘要与分级建议', latency: '未同步' },
    { name: '执法办案助手 Agent', status: 'pending', currentTask: '目录样例 · 法条与证据规则检索', latency: '未同步' },
    { name: '勤务训练教官 Agent', status: 'pending', currentTask: '目录样例 · 训练评分建议', latency: '未同步' },
    { name: '移动勤务伴随 Agent', status: 'pending', currentTask: '目录样例 · 现场指引', latency: '未同步' },
  ];
  const fallbackSkills = [
    { name: '警情结构化抽取', status: 'active', trigger: '接警语音进入', confidence: 96 },
    { name: '证据规则校验', status: 'active', trigger: '案件提交前', confidence: 92 },
    { name: '训练短板画像', status: 'active', trigger: '训练结束后', confidence: 88 },
    { name: '移动现场指引', status: 'active', trigger: '民警签收现场任务后', confidence: 90 },
  ];
  const fallbackConnectors = [
    { name: '公安主数据目录 MCP', status: '待同步', scope: '组织 / 人员 / 地点 / 车辆（只读）', lastSync: '未同步', writeAllowed: false },
    { name: '法律与类案知识库 MCP', status: '待同步', scope: '法条 / 判例 / 内部制度（只读）', lastSync: '未同步', writeAllowed: false },
    { name: '统一事件链 MCP', status: '待同步', scope: '警情 / 案件 / 训练 / 移动（只读）', lastSync: '未同步', writeAllowed: false },
  ];
  const model = runtime?.model ?? { name: '国产大模型（内网部署）', status: '待同步', providers: ['DeepSeek', 'Qwen3'] };
  const capabilities = runtime?.capabilities ?? [
    { name: '文本理解与生成', scope: '警单、卷宗、制度、报告', status: '待同步' },
    { name: '语音转写与结构化', scope: '接警、问询、移动勤务', status: '待接入' },
    { name: '视觉与动作识别', scope: '训练动作、目标复核', status: '按权限启用' },
    { name: '知识库与类案检索', scope: '法条、判例、内部制度', status: '待接入' },
  ];
  const agents = runtime?.agents ?? fallbackAgents;
  const skills = runtime?.skills ?? fallbackSkills;
  const connectors = runtime?.mcpConnectors ?? fallbackConnectors;
  const reviewDisabled = !canReview || authPending || reviewPending || runtimeLoading || Boolean(runtimeError) || !result || result.reviewStatus !== 'pending' || !reviewReason.trim() || reviewDraftAuditId !== result.auditId;

  return (
    <section className="domain-page ai-center-page">
      <DomainHeader eyebrow="统一 AI 能力中心 / AI RUNTIME" title="AI 能力中心" description="模型运行、智能体服务与结果审核" icon={BrainCircuit} apiOnline={apiOnline} navigate={navigate} backLabel="返回平台总览" />
      <div className="domain-button-row" aria-busy={runtimeLoading}>
        <button type="button" className="domain-secondary-button" onClick={() => void refreshRuntime()} disabled={runtimeLoading || reviewPending}><RefreshCw size={15} />{runtimeLoading ? '正在刷新' : runtimeError ? '重试运行态' : '刷新运行态'}</button>
        <span role="status">{runtimeLoading ? '正在读取 AI 运行态…' : runtimeError ? `${runtimeError} ${runtime ? '当前保留上次快照。' : '当前仅展示本地目录样例。'}` : runtime ? '服务目录已同步；目录状态不代表模型或数据源已验证接通。' : '等待运行态同步。'}</span>
      </div>
      <div className="domain-metrics"><DomainMetric label="国产模型" value={model.providers.length} note={model.providers.join(' / ')} icon={BrainCircuit} tone="blue" /><DomainMetric label="Agent" value={agents.length} note="按业务角色编排" icon={Workflow} tone="purple" /><DomainMetric label="Skill" value={skills.length} note="可审计策略" icon={Target} tone="green" /><DomainMetric label="MCP" value={connectors.length} note="白名单只读连接器" icon={Network} tone="orange" /></div>
      <div className="ai-center-grid">
        <section className="domain-panel ai-model-panel"><PanelHeading kicker="MODEL RUNTIME" title="统一 AI 智算引擎" icon={BrainCircuit} /><div className="ai-model-hero"><div className="ai-model-orb"><BrainCircuit size={25} /></div><div><strong>{model.name}</strong><small>{runtime ? '服务返回目录' : '本地目录样例'}</small></div><b>{runtimeError ? '同步失败' : model.status}</b></div><div className="ai-capability-list">{capabilities.map((item) => <div key={item.name}><span className={'ai-capability-dot ' + (runtime && !runtimeError && item.status === '可用' ? 'ready' : 'pending')} /><strong>{item.name}</strong><small>{item.scope} · {item.status}</small></div>)}</div><ContractNote>当前结果为运行态样例；人工审核不会执行派警、办案或审批。</ContractNote></section>
        <section className="domain-panel ai-contract-panel"><PanelHeading kicker="AI OUTPUT CONTRACT" title="统一输出规范" icon={ShieldCheck} /><div className="ai-contract-list">{['结果：给出可执行建议', '置信度：展示模型把握程度', '依据：法条、制度、数据时间', '解释：说明关键判断要点', '人工确认：明确责任人和动作', '回退：保留人工处理入口', '审计：生成唯一审计编号'].map((item, index) => <div key={item}><span>{String(index + 1).padStart(2, '0')}</span><strong>{item}</strong><CheckCircle2 size={14} /></div>)}</div></section>
      </div>
      <div className="ai-runtime-grid">
        <section className="domain-panel"><PanelHeading kicker="AGENT REGISTRY" title="业务智能体" icon={Workflow} /><div className="ai-runtime-list">{agents.map((agent) => <div key={agent.name}><span className={'ai-status-dot ' + (runtime && !runtimeError ? agent.status : 'pending')} /><div><strong>{agent.name}</strong><small>{agent.currentTask}</small></div><b>{runtimeError ? '上次快照' : agent.latency}</b></div>)}</div></section>
        <section className="domain-panel"><PanelHeading kicker="SKILL POLICY" title="技能策略" icon={Target} /><div className="ai-runtime-list">{skills.map((skill) => <div key={skill.name}><span className={'ai-status-dot ' + (runtime && !runtimeError ? skill.status : 'pending')} /><div><strong>{skill.name}</strong><small>{skill.trigger}</small></div><b>{runtimeError ? '上次快照' : runtime ? `${skill.confidence}%` : '未同步'}</b></div>)}</div></section>
        <section className="domain-panel"><PanelHeading kicker="MCP CONNECTORS" title="工具与数据连接器" icon={Network} /><div className="ai-runtime-list">{connectors.map((connector) => <div key={connector.name}><span className={'ai-status-dot ' + (runtime && !runtimeError && connector.status === '在线' ? 'active' : 'pending')} /><div><strong>{connector.name}</strong><small>{connector.scope} · {connector.writeAllowed ? '可写入' : '只读白名单'}</small></div><b>{runtimeError ? '上次快照' : connector.lastSync}</b></div>)}</div></section>
      </div>
      <section className="domain-panel ai-contract-panel">
        <PanelHeading kicker="AI REVIEW ACCOUNT" title="业务账号登录" icon={ShieldCheck} />
        <form className="domain-button-row" onSubmit={(event) => { event.preventDefault(); void login(); }} aria-busy={authPending}>
          <label htmlFor="ai-business-token">业务访问令牌</label>
          <input id="ai-business-token" type="password" value={tokenInput} onChange={(event) => setTokenInput(event.target.value)} autoComplete="off" spellCheck={false} disabled={authPending || reviewPending} style={{ minWidth: 0, maxWidth: '100%' }} />
          <button type="submit" className="domain-primary-button" disabled={!tokenInput.trim() || authPending || reviewPending}>{authPending ? '正在验证' : '验证并登录'}</button>
          <button type="button" className="domain-secondary-button" onClick={logout} disabled={!reviewer && !authPending && !tokenInput}>退出本页登录</button>
        </form>
        <p role="status">{authState}{reviewer ? ` 当前账号：${reviewer.displayName || reviewer.role || '业务用户'}` : ''}</p>
        <ContractNote>仅接受已签发的业务 Bearer 令牌，不使用管理令牌。令牌仅保留在本页内存中，退出或离开页面后清除；权限以服务端验证为准。</ContractNote>
      </section>
      <section className="domain-panel ai-contract-panel" aria-busy={reviewPending}>
        <PanelHeading kicker="AI RESULT RESPONSIBILITY" title="AI 结果样例审核" icon={ShieldCheck} />
        <p role="status">{reviewState}</p>
        {result ? <div className="ai-runtime-list"><div><span className="ai-status-dot pending" /><div><strong>{result.result}</strong><small>置信度 {result.confidence}% · {result.evidence?.join('；') || result.evidenceTime || '暂无依据'} · 服务端审计引用 {result.auditId}</small></div><b>{{ pending: '待人工确认', confirmed: '已确认', rejected: '已驳回', not_required: '无需复核' }[result.reviewStatus]}</b></div><div><span className="ai-status-dot pending" /><div><strong>回退说明</strong><small>{result.fallbackAction || '转人工处理，不自动改变业务状态'}</small></div><b>{result.humanReviewRequired ? '人工确认' : '无需复核'}</b></div></div> : <ContractNote>{runtimeLoading ? '正在等待运行态结果。' : '暂无可审核结果。'}</ContractNote>}
        <div className="ops-capability-body">
          <label htmlFor="ai-review-reason" className="ops-field-label">审核意见</label>
          <textarea id="ai-review-reason" rows={3} value={reviewReason} onChange={(event) => updateReviewReason(event.target.value)} disabled={reviewPending} />
          {result && reviewReason.trim() && reviewDraftAuditId !== result.auditId && <p role="status">审核结果已变更，原意见仍保留但未关联当前结果。<button type="button" className="domain-text-button" disabled={runtimeLoading || reviewPending} onClick={() => updateReviewReason(reviewReason)}>将意见用于当前结果</button></p>}
        </div>
        <div className="domain-button-row"><button type="button" className="domain-primary-button" onClick={() => void submitReview('confirmed')} disabled={reviewDisabled}><CheckCircle2 size={15} />{reviewPending ? '正在提交' : '人工确认'}</button><button type="button" className="domain-secondary-button" onClick={() => void submitReview('rejected')} disabled={reviewDisabled}><AlertTriangle size={15} />驳回并回退</button></div>
        <ContractNote>账号须具备 review 权限；审核人由服务端令牌确定。确认或驳回均不直接改变派警、案件、审批或档案状态。</ContractNote>
      </section>
    </section>
  );
}
