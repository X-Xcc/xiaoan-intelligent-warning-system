export type AssistantPosition = { x: number; y: number };
export type AssistantPanelLayout = AssistantPosition & { width: number; height: number };
export const ASSISTANT_SIZE = { width: 128, height: 208 };
export const ASSISTANT_STORAGE_KEY = 'xiaoan-assistant:position:v1';
export const ASSISTANT_PROMPTS = ['今日概览', '今日勤务预案', '今日训练方案'] as const;

export type AssistantReply = {
  demo: true;
  topic: 'overview' | 'navigation' | 'brief' | 'dutyPlan' | 'training' | 'chat';
  title: string;
  lines: string[];
  trainingLinks?: { label: string; taskId: string }[];
};

export function assistantSize(width: number, height: number) {
  const avatarHeight = width < 534
    ? Math.min(ASSISTANT_SIZE.height, Math.max(52, height - 24 - 12 - 240))
    : ASSISTANT_SIZE.height;
  return { width: ASSISTANT_SIZE.width * avatarHeight / ASSISTANT_SIZE.height, height: avatarHeight };
}

export function clampPosition(
  position: AssistantPosition, width: number, height: number, panel?: AssistantPanelLayout | null,
): AssistantPosition {
  const size = assistantSize(width, height);
  const left = Math.min(0, panel?.x ?? 0);
  const top = Math.min(0, panel?.y ?? 0);
  const right = Math.max(size.width, panel ? panel.x + panel.width : 0);
  const bottom = Math.max(size.height, panel ? panel.y + panel.height : 0);
  const maxX = Math.max(-left, width - right - 12);
  const maxY = Math.max(-top, height - bottom - 12);
  const minX = Math.min(12 - left, maxX);
  const minY = Math.min(12 - top, maxY);
  return {
    x: Math.min(maxX, Math.max(minX, Number.isFinite(position.x) ? position.x : maxX)),
    y: Math.min(maxY, Math.max(minY, Number.isFinite(position.y) ? position.y : maxY)),
  };
}

export function assistantPanelLayout(position: AssistantPosition, width: number, height: number): AssistantPanelLayout {
  const size = assistantSize(width, height);
  const stacked = width < 368 + ASSISTANT_SIZE.width + 14 + 24;
  const panelWidth = Math.min(368, Math.max(0, width - 24));
  const panelHeight = Math.min(stacked ? 440 : 546,
    Math.max(0, height - 24 - (stacked ? size.height + 12 : 0)));
  if (stacked) {
    return {
      x: Math.max(12, Math.min(position.x + size.width / 2 - panelWidth / 2,
        width - panelWidth - 12)) - position.x,
      y: position.y + size.height / 2 > height / 2 ? -panelHeight - 12 : size.height + 12,
      width: panelWidth, height: panelHeight,
    };
  }
  return {
    x: position.x + size.width / 2 > width / 2 ? -panelWidth - 14 : size.width + 14,
    y: Math.max(12, Math.min(position.y + size.height - panelHeight,
      height - panelHeight - 12)) - position.y,
    width: panelWidth, height: panelHeight,
  };
}

export function parsePosition(raw: string | null, width: number, height: number): AssistantPosition | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || !('x' in value) || !('y' in value)
      || typeof value.x !== 'number' || typeof value.y !== 'number'
      || !Number.isFinite(value.x) || !Number.isFinite(value.y)) return null;
    return clampPosition({ x: value.x, y: value.y }, width, height);
  } catch {
    return null;
  }
}

export function demoReply(prompt: string, previous?: AssistantReply): AssistantReply {
  const text = prompt.slice(0, 200).trim();
  if (/派警|下发|删除|提交|人员查询|查身份证|实时数据|真实数据/.test(text)) return {
    demo: true, topic: 'chat', title: '先确认一下',
    lines: [
      '这一步涉及实际业务操作，需要在对应工作台中确认。',
      '我可以帮你整理操作前的核对清单，但这里不会替你提交、调度或查询人员信息。',
    ],
  };
  if (previous && /继续|展开|详细|具体|简短|精简|接着/.test(text)) {
    const short = /简短|精简/.test(text);
    const details = {
      overview: ['先看待办优先级，再核对交接信息，最后整理需要留痕的事项。', '交接时重点核对三件事：谁来跟进、何时完成、结果记在哪里。没有确认的事项单独列出。'],
      brief: ['简报可以收敛为“总体情况、重点事项、交接安排”三段。', '每项写清楚时间、事项、进展和下一步。暂未核实的信息标注“待确认”，定稿前逐项复核。'],
      navigation: ['查看全局从平台总览开始；处理接报进入接处警；查看安排进入勤务态势。', '先明确是查看信息还是处理事项，再选择对应工作台。这样可以减少来回查找。'],
      dutyPlan: ['先核对当班时段、重点区域和待跟进事项，再安排巡查与交接节点。', '预案中保留调整空间，突发事项按实际流程处置并补充留痕。'],
      training: ['按“课前准备、场景训练、复盘巩固”安排今日训练，并明确每项训练的负责人。', '训练结束后记录完成情况和待提升项，下一次训练优先覆盖薄弱环节。'],
      chat: ['我们先明确目标，再拆成两到三个可以执行的步骤。', '把最希望得到的结果放在第一位，补充时间范围和已有材料，我再帮你细化。'],
    };
    return {
      demo: true, topic: previous.topic,
      title: short ? '好，我说简短一点' : '接着刚才的话题',
      lines: short ? [details[previous.topic][0]] : details[previous.topic],
      ...(previous.topic === 'training' ? { trainingLinks: previous.trainingLinks } : {}),
    };
  }
  if (/你好|您好|嗨|在吗|早上好/.test(text)) return {
    demo: true, topic: 'chat', title: '我在。',
    lines: ['你好，我是小安。今天想先处理哪件事？', '可以从今日概览开始，也可以直接告诉我你正在整理什么。'],
  };
  if (/谢谢|辛苦|不错/.test(text)) return {
    demo: true, topic: previous?.topic ?? 'chat', title: '不客气。',
    lines: ['我们接着来。需要把刚才的内容再精简一些，还是换一件事？'],
  };
  if (/训练/.test(text)) return {
    demo: true, topic: 'training', title: '今日训练方案',
    lines: [
      '按勤务态势的推荐，今天先练下面三项。具体要求听教官安排。',
    ],
    trainingLinks: [
      { label: '单警装备快速取用', taskId: 'TRAIN-READINESS-001' },
      { label: '弱光队形转换', taskId: 'TRAIN-READINESS-002' },
      { label: '现场警戒与人员疏散', taskId: 'TRAIN-READINESS-003' },
    ],
  };
  if (/勤务预案|勤务安排/.test(text)) return {
    demo: true, topic: 'dutyPlan', title: '今日勤务预案',
    lines: [
      '先确定当班时段、重点区域和需要关注的待办事项。',
      '巡查安排：明确责任岗位、巡查节点和交接方式。',
      '应急准备：保持联络畅通，遇到突发情况按既定流程处置。',
      '交接留痕：把未完成事项、后续跟进人与时间点记录清楚。',
    ],
  };
  if (/你是谁|什么功能|能做什么/.test(text)) return {
    demo: true, topic: 'chat', title: '我是小安，你的工作助手。',
    lines: ['我可以陪你梳理工作重点、介绍工作台入口，或者搭一份简报提纲。', '你说需求，我来帮你把思路整理清楚。'],
  };
  if (/简报|总结|汇报/.test(text)) return {
    demo: true, topic: 'brief',
    title: '值守简报',
    lines: [
      '可以，先按这个结构整理，具体情况留给值班人员补充。',
      '一、总体情况\n值守时段：【待补充】\n当班概况：【待核实后填写】',
      '二、重点事项\n记录本班重点工作、处理进展及需要关注的问题。',
      '三、交接安排\n列明待跟进事项、负责人和完成时间。',
      '需要的话，我可以接着帮你精简成口头汇报的提纲。',
    ],
  };
  if (/导航|入口|在哪|怎么用|工作台/.test(text)) return {
    demo: true, topic: 'navigation',
    title: '工作台导航',
    lines: [
      '平台总览：查看当前工作台的运行概况。',
      '接处警：进入接报与协同处置工作台。',
      '勤务态势：查看态势与训练入口。',
      '你想进入哪类工作？可以继续告诉我，我帮你梳理入口。',
    ],
  };
  if (/概览|今日|今天|待办/.test(text)) return {
    demo: true, topic: 'overview',
    title: '今日工作重点',
    lines: [
      '我建议先按这三个方向梳理今天的工作。',
      '待办核对：先确认紧急事项和需要复核的内容。',
      '交接安排：明确后续跟进人，把尚未确认的事项单独列出。',
      '值守简报：归纳工作进展与需要关注的问题。',
      '要不要接着整理一份简报提纲？',
    ],
  };
  return {
    demo: true, topic: 'chat',
    title: '我们先把思路理清楚',
    lines: [
      '先明确你希望得到的结果，再补充时间范围和相关材料。',
      '如果是工作安排，我可以帮你梳理优先级；如果是汇报材料，我们可以从提纲开始。',
      '你更想先完成哪一部分？',
    ],
  };
}
