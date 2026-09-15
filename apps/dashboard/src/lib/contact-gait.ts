export type ContactGaitFeature = {
  label: string;
  value: string;
};

export type ContactGaitRecognition = {
  recordId: string;
  status: '候选匹配';
  confidence: number;
  evidenceCount: number;
  conclusion: string;
  features: readonly ContactGaitFeature[];
  disclaimer: string;
};

const profiles: readonly Omit<ContactGaitRecognition, 'recordId' | 'evidenceCount'>[] = [
  {
    status: '候选匹配',
    confidence: 87,
    conclusion: '步态特征与脱敏参考对象存在可比性，建议人工复核后确认。',
    features: [
      { label: '步速', value: '1.18 m/s' },
      { label: '步幅', value: '0.63 m' },
      { label: '步态对称性', value: '92%' },
    ],
    disclaimer: '演示规则输出，不作为身份认定或真实人员追踪依据。',
  },
  {
    status: '候选匹配',
    confidence: 82,
    conclusion: '步态节奏与脱敏参考对象具有部分相似性，需补充点位复核。',
    features: [
      { label: '步速', value: '1.06 m/s' },
      { label: '步幅', value: '0.58 m' },
      { label: '步态对称性', value: '89%' },
    ],
    disclaimer: '演示规则输出，不作为身份认定或真实人员追踪依据。',
  },
  {
    status: '候选匹配',
    confidence: 79,
    conclusion: '当前样本与脱敏参考对象存在弱可比性，建议人工复核。',
    features: [
      { label: '步速', value: '1.24 m/s' },
      { label: '步幅', value: '0.67 m' },
      { label: '步态对称性', value: '86%' },
    ],
    disclaimer: '演示规则输出，不作为身份认定或真实人员追踪依据。',
  },
];

export function getContactGaitRecognition(record: { id: string }, evidenceCount: number): ContactGaitRecognition {
  const sequence = Number(record.id.replace(/\D/g, '')) || 1;
  const profile = profiles[(sequence - 1) % profiles.length];
  return {
    ...profile,
    recordId: `GT-DEMO-${String(sequence).padStart(3, '0')}-02`,
    evidenceCount,
  };
}
