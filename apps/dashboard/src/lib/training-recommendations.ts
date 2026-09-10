import type { TrainingTask } from './training-api';

type TrainingDrill = {
  id: string;
  title: string;
  minutes: number;
  goal: string;
  practice: string;
  check: string;
};

type TrainingRecommendations = { items: TrainingDrill[]; safety: string };

const baton: TrainingDrill = {
  id: 'baton-deployment', title: '伸缩警棍（甩棍）快速开棍', minutes: 5,
  goal: '熟悉训练警棍的取用、展开与收纳，减少停顿和误操作。',
  practice: '建议 3 组，每组 5 次；由教官示范后分组练习，逐次记录完成情况。',
  check: '取用、展开确认和收纳环节完整；教官确认操作规范后，再记录用时。',
};
const radio: TrainingDrill = {
  id: 'radio-report', title: '对讲机快速取用与简短报告', minutes: 4,
  goal: '完成对讲机取用、通联确认和关键信息报告。',
  practice: '建议 3 组模拟通联，分别报告位置、现场情况和协作需求。',
  check: '通联清晰，信息无遗漏；由同组人员复述并核对。',
};
const recorder: TrainingDrill = {
  id: 'recorder-start', title: '执法记录仪快速启动与佩戴检查', minutes: 3,
  goal: '完成开机、录制状态确认和佩戴检查。',
  practice: '建议 3 次独立启动练习，每次录制一段测试影像并回看。',
  check: '录制状态明确，画面无遮挡、声音可辨，测试文件可回放。',
};
const safety = '建议项目与练习量由教官结合现场条件确认，不替代本单位考核要求。确认场地、装备与个人防护；出现异常立即停止并登记。';
const batonSafety = '开棍项目仅使用经教官确认的训练用警棍，在专用训练区由教官现场指导，不对人开展击打练习。建议练习量不作为考核阈值；出现装备或身体异常立即停止并登记。';

export function getTrainingRecommendations(task: Pick<TrainingTask, 'subject'>): TrainingRecommendations {
  const subject = task.subject.trim();
  if (subject === '单警装备快速取用') return { items: [baton, radio, recorder], safety: batonSafety };
  if (/警棍|甩棍/.test(subject)) return { items: [baton], safety: batonSafety };
  if (/执法记录仪/.test(subject)) return { items: [recorder], safety };
  if (/对讲|警用通信/.test(subject)) return { items: [radio], safety };
  if (subject === '弱光队形转换') return {
    items: [
      { id: 'light-check', title: '弱光照明与反光标识检查', minutes: 3,
        goal: '确认训练区域内照明设备和人员标识可用。',
        practice: '建议 2 轮分组检查，轮换检查人与记录人。',
        check: '设备工作正常，成员标识可辨，故障项完成登记。' },
      { id: 'team-rollcall', title: '弱光环境口令复诵与联络', minutes: 4,
        goal: '减少弱光环境下的信息漏听与误解。',
        practice: '建议 3 轮口令传递，使用教官预设的集合与停止指令。',
        check: '每名成员正确复诵，人员清点完整，停止指令响应明确。' },
      { id: 'team-transition', title: '标记点位间队形转换', minutes: 5,
        goal: '在教官指定的模拟区域完成协同转换。',
        practice: '建议 3 轮点位转换，逐轮记录用时与沟通遗漏。',
        check: '到位人员齐全，无碰撞与漏位；具体队形由现场教官确认。' },
    ], safety,
  };
  if (subject === '防爆警戒圈设置' || subject === '现场警戒与人员疏散') return {
    items: [
      { id: 'cordon-layout', title: '模拟场地警戒标识布设', minutes: 5,
        goal: '在预先划定的训练边界上完成标识布设。',
        practice: '建议 3 轮警戒带、反光锥布设与回收，轮换分工。',
        check: '标识连续、清晰，通道按训练方案保留；边界由教官预设。' },
      { id: 'evacuation-announcement', title: '扩音器疏散提示与复诵', minutes: 3,
        goal: '清晰传达教官设定的模拟疏散信息。',
        practice: '建议 3 次广播练习，由同组人员复述信息。',
        check: '提示语清楚，方向与集合点信息无遗漏。' },
      { id: 'cordon-handover', title: '警戒点位清点与交接', minutes: 4,
        goal: '完成模拟点位、器材和人员的核对。',
        practice: '建议 2 轮交接，分别担任交出人与接收人。',
        check: '点位、器材与人员记录一致，发现的缺项完成登记。' },
    ],
    safety: `仅在无危险物的模拟场地练习；训练标记范围不代表真实事件的安全距离。${safety}`,
  };
  return {
    items: [
      { id: 'topic-review', title: `${subject}：要点复述`, minutes: 5,
        goal: '掌握本次课程的关键要求与易错点。',
        practice: '围绕教官指定材料，整理并复述 3 项重点。',
        check: '内容与课程材料一致，疑问由教官确认。' },
      { id: 'topic-exercise', title: `${subject}：课内练习与复盘`, minutes: 10,
        goal: '通过本课程配套练习识别待加强的内容。',
        practice: '完成 1 轮教官指定练习，记录问题并逐项复盘。',
        check: '练习记录完整，改进项明确；完成标准由教官确认。' },
    ], safety,
  };
}
