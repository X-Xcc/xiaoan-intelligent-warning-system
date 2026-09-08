import fixture from '../../../../server/app/data/command/night_market_b1_b4_v1.json';
import type { CommandContext, CommandResponse } from './command-workflow';

export const commandScenario = fixture;
export function playbackSnapshot(): CommandResponse {
  const command: CommandContext = {
    version: 0, stage: 'B1_INTAKE', updatedAt: fixture.baseTime, sourceMode: 'desensitized_demo',
    intake: { ...fixture.intake, locationVersion: 1, coordinates: {
      latitude: fixture.intake.latitude, longitude: fixture.intake.longitude,
    } },
    summary: { version: 0, text: fixture.intake.transcript, category: '消费纠纷', riskTags: ['纠纷升级风险'],
      dangerFactors: ['伤情待核实', '危险物品待核实'], reviewStatus: 'pending', basis: ['教学报警原文'],
      dataTime: fixture.baseTime, generationMethod: 'rules' },
    relatedAlerts: fixture.relatedAlerts,
    dispatch: { ...fixture.route, routeSource: 'scenario_route' },
    verification: { ...fixture.person, subjectName: fixture.person.name, verificationId: '教学线索',
      resultStatus: 'pending', basis: fixture.person.basis, dataTime: fixture.baseTime },
    evidenceIndex: fixture.materials.map((item) => ({ ...item, evidenceId: `TEACH-${item.key}` })),
  };
  return { command, event: { id: '教学回放 / 未创建业务事件', title: fixture.title,
    bay: fixture.intake.locationText, status: '未提交', owner: '教学案例',
    description: fixture.intake.transcript, meta: { command }, timeline: [] } };
}
