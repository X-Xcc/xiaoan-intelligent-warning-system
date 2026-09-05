import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pptxgen = require('pptxgenjs');

const pptx = new pptxgen();
pptx.layout = 'LAYOUT_WIDE';
pptx.author = 'Codex';
pptx.company = 'CICSIC';
pptx.subject = '竞品分析优化页';
pptx.title = '竞品分析优化页';
pptx.lang = 'zh-CN';
pptx.theme = {
  headFontFace: 'Microsoft YaHei',
  bodyFontFace: 'Microsoft YaHei',
  lang: 'zh-CN',
};

const C = {
  bg: '061423',
  panel: '0D2745',
  panel2: '0A203A',
  line: '58B7EA',
  lineSoft: '2B5D86',
  white: 'F4FAFF',
  muted: 'B8D1E4',
  dim: '7C96A9',
  gold: 'FFD466',
  cyan: '58D3FF',
  blue: '2F8DFF',
  blue2: '20548F',
  red: 'FF7A7A',
  green: '6AE3B8',
  shadow: '03101D',
};

const slide = pptx.addSlide();
slide.background = { color: C.bg };

function box(x, y, w, h, fill = C.panel, line = C.lineSoft, transparency = 8, radius = 0.12) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h,
    rectRadius: radius,
    fill: { color: fill, transparency },
    line: { color: line, transparency: 6, pt: 1 },
    shadow: { type: 'outer', color: C.shadow, blur: 2, angle: 45, distance: 1.2, opacity: 0.24 },
  });
}

function text(txt, x, y, w, h, opts = {}) {
  slide.addText(txt, {
    x, y, w, h,
    margin: 0,
    fontFace: 'Microsoft YaHei',
    color: C.white,
    bold: false,
    fontSize: 16,
    fit: 'shrink',
    breakLine: false,
    ...opts,
  });
}

function pill(txt, x, y, w, fill, color = C.white, fs = 11) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h: 0.28,
    rectRadius: 0.12,
    fill: { color: fill, transparency: 10 },
    line: { color: fill, transparency: 20, pt: 0.8 },
  });
  text(txt, x, y + 0.03, w, 0.16, { fontSize: fs, color, bold: true, align: 'center', valign: 'mid' });
}

function rowLine(y) {
  slide.addShape(pptx.ShapeType.line, {
    x: 0.34, y, w: 12.62, h: 0,
    line: { color: C.lineSoft, pt: 0.8, transparency: 28 },
  });
}

// Background accents
slide.addShape(pptx.ShapeType.rect, {
  x: 0, y: 0, w: 13.333, h: 7.5,
  fill: { color: C.bg },
  line: { color: C.bg, transparency: 100, pt: 0 },
});
slide.addShape(pptx.ShapeType.rect, {
  x: 0.18, y: 0.18, w: 12.98, h: 7.14,
  fill: { color: C.bg, transparency: 100 },
  line: { color: '2C4767', transparency: 62, pt: 1 },
});
for (let i = 0; i < 8; i += 1) {
  slide.addShape(pptx.ShapeType.line, {
    x: 0.35 + i * 0.78, y: 0.25, w: 0, h: 0.75,
    line: { color: '2A5278', transparency: 70, pt: 0.9 },
  });
}
slide.addShape(pptx.ShapeType.rect, {
  x: 0.42, y: 0.34, w: 3.55, h: 0.72,
  fill: { color: '102A47', transparency: 10 },
  line: { color: '356E9E', transparency: 68, pt: 1 },
});
slide.addShape(pptx.ShapeType.rect, {
  x: 9.68, y: 0.34, w: 3.18, h: 0.72,
  fill: { color: '102A47', transparency: 10 },
  line: { color: '356E9E', transparency: 68, pt: 1 },
});

text('竞品分析', 0.7, 0.5, 2.0, 0.32, {
  fontSize: 26,
  bold: true,
  color: C.white,
});
text('智慧治理新生态', 9.94, 0.48, 2.6, 0.18, {
  fontSize: 13.2,
  bold: true,
  color: C.muted,
  align: 'center',
});
text('不是比谁功能更多，而是比谁更适合夜市场景先落地', 0.74, 1.02, 5.7, 0.18, {
  fontSize: 13,
  color: C.cyan,
  bold: true,
});

pill('单点试点', 6.55, 0.95, 0.92, '163E66', C.white, 10);
pill('轻量部署', 7.57, 0.95, 0.92, '285C8D', C.white, 10);
pill('闭环快', 8.59, 0.95, 0.78, '8C6B1C', C.gold, 10);

// Main panels
box(0.34, 1.34, 8.72, 4.82, C.panel, C.line, 8);
box(9.22, 1.34, 3.79, 4.82, C.panel2, C.gold, 10);

text('竞品适配矩阵', 0.62, 1.52, 2.1, 0.22, {
  fontSize: 18,
  bold: true,
  color: C.white,
});
text('夜市场景的判断重点，不是平台规模，而是从上报到处置的闭环能力。', 2.44, 1.53, 6.1, 0.18, {
  fontSize: 11.5,
  color: C.muted,
});

// Left matrix header
const leftX = 0.56;
const rowW = 8.24;
const y0 = 1.92;
slide.addShape(pptx.ShapeType.roundRect, {
  x: leftX, y: y0, w: rowW, h: 0.42,
  rectRadius: 0.06,
  fill: { color: '123155', transparency: 12 },
  line: { color: '406D94', transparency: 68, pt: 0.8 },
});
text('产品', 0.78, 2.03, 0.7, 0.14, { fontSize: 12.5, bold: true, color: C.muted, align: 'center' });
text('适配度', 2.06, 2.03, 0.8, 0.14, { fontSize: 12.5, bold: true, color: C.muted, align: 'center' });
text('场景定位', 3.67, 2.03, 1.0, 0.14, { fontSize: 12.5, bold: true, color: C.muted, align: 'center' });
text('关键判断', 6.33, 2.03, 0.95, 0.14, { fontSize: 12.5, bold: true, color: C.muted, align: 'center' });

const rows = [
  { name: '宇视安防', pct: 55, domain: '视频监控 / AIoT', issue: '盲区补巡和处置闭环较弱', fill: '3B77B5', issueFill: '173C61' },
  { name: '海康平台', pct: 62, domain: '智慧城市 / 警务', issue: '平台完整，项目实施偏重', fill: '3B77B5', issueFill: '173C61' },
  { name: '大华物联', pct: 60, domain: '视频物联 / 安防', issue: '感知强，跨端流程较散', fill: '3B77B5', issueFill: '173C61' },
  { name: '安保巡更', pct: 42, domain: '巡逻打卡 / 派单', issue: '记录清楚，分析不足', fill: '3B77B5', issueFill: '173C61' },
  { name: '烟火哨兵', pct: 88, domain: '夜市治理 / 文旅', issue: '轻量试点，闭环最快', fill: 'FFCB55', issueFill: '8C6B1C' },
];

const rH = 0.62;
rows.forEach((r, idx) => {
  const y = 2.40 + idx * 0.74;
  slide.addShape(pptx.ShapeType.roundRect, {
    x: leftX, y, w: rowW, h: 0.58,
    rectRadius: 0.05,
    fill: { color: idx % 2 === 0 ? '0E2A4A' : '0B2340', transparency: 8 },
    line: { color: '355B7B', transparency: 75, pt: 0.8 },
  });
  text(r.name, 0.76, y + 0.17, 1.08, 0.18, {
    fontSize: r.name === '烟火哨兵' ? 13.6 : 15.2,
    bold: true,
    color: r.name === '烟火哨兵' ? C.gold : C.white,
    align: 'center',
  });
  // Bar track
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 2.08, y: y + 0.21, w: 2.1, h: 0.13,
    rectRadius: 0.06,
    fill: { color: '2A405A', transparency: 6 },
    line: { color: 'C4D7E8', transparency: 72, pt: 0.6 },
  });
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 2.08, y: y + 0.21, w: Math.max(0.18, 2.1 * (r.pct / 100)), h: 0.13,
    rectRadius: 0.06,
    fill: { color: r.fill, transparency: r.name === '烟火哨兵' ? 0 : 10 },
    line: { color: r.fill, transparency: 20, pt: 0.4 },
  });
  text(`${r.pct}%`, 4.28, y + 0.14, 0.45, 0.18, {
    fontSize: 14,
    bold: true,
    color: C.white,
  });
  text(r.domain, 5.02, y + 0.15, 1.9, 0.18, {
    fontSize: 13,
    color: C.white,
    bold: true,
    align: 'center',
  });
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 6.86, y: y + 0.12, w: 1.9, h: 0.24,
    rectRadius: 0.08,
    fill: { color: r.issueFill, transparency: r.name === '烟火哨兵' ? 0 : 18 },
    line: { color: r.name === '烟火哨兵' ? 'E1B74D' : '4C7598', transparency: 55, pt: 0.8 },
  });
  text(r.issue, 6.98, y + 0.16, 1.66, 0.12, {
    fontSize: 10.5,
    color: r.name === '烟火哨兵' ? C.gold : C.white,
    bold: true,
    align: 'center',
  });
});

// Right panel
text('真实招标区间', 9.52, 1.52, 1.8, 0.2, {
  fontSize: 17,
  bold: true,
  color: C.white,
});
text('优先看单夜市试点的启动门槛，而不是一上来做大平台。', 9.5, 1.84, 2.96, 0.18, {
  fontSize: 11,
  color: C.muted,
});

const budgetRows = [
  ['海康平台', '80-110 万元'],
  ['大华物联', '72-102 万元'],
  ['宇视安防', '52-76 万元'],
  ['安保巡更', '4-7 万元'],
  ['烟火哨兵', '15 万元'],
];
budgetRows.forEach((r, i) => {
  const y = 2.18 + i * 0.58;
  slide.addShape(pptx.ShapeType.line, {
    x: 9.48, y: y + 0.42, w: 3.04, h: 0,
    line: { color: '4F7290', transparency: 70, pt: 0.6 },
  });
  text(r[0], 9.58, y, 1.18, 0.16, {
    fontSize: 13,
    bold: true,
    color: i === 4 ? C.gold : C.white,
  });
  text(r[1], 11.12, y, 1.34, 0.16, {
    fontSize: 13,
    bold: true,
    color: i === 4 ? C.gold : C.white,
    align: 'right',
  });
});

box(9.46, 4.55, 3.08, 0.66, '132A43', 'FFD466', 8);
text('竞品强在平台和设备，我们强在夜市场景与闭环落地', 9.59, 4.77, 2.82, 0.12, {
  fontSize: 10.3,
  color: C.gold,
  bold: true,
  align: 'center',
});

text('落地打法', 9.52, 5.38, 1.4, 0.18, {
  fontSize: 15.5,
  bold: true,
  color: C.white,
});
const steps = [
  ['01', '存量接入'],
  ['02', '三端打通'],
  ['03', '先做试点'],
];
steps.forEach((s, i) => {
  const y = 5.67 + i * 0.24;
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 9.56, y, w: 0.34, h: 0.21,
    rectRadius: 0.06,
    fill: { color: i === 2 ? 'A47A18' : '1B4A78', transparency: 0 },
    line: { color: i === 2 ? 'FFD466' : '58B7EA', transparency: 40, pt: 0.5 },
  });
  text(s[0], 9.57, y + 0.04, 0.32, 0.08, {
    fontSize: 8.5,
    bold: true,
    color: i === 2 ? C.gold : C.white,
    align: 'center',
  });
  text(s[1], 9.99, y - 0.01, 1.1, 0.13, {
    fontSize: 10.4,
    bold: true,
    color: C.white,
  });
});

// Bottom cards
const cards = [
  {
    x: 0.34, title: '场景痛点', color: '1B4A78',
    bullets: ['夜间客流密集', '纠纷、扒窃、冲突高发', '响应链条偏长'],
  },
  {
    x: 4.56, title: '产品闭环', color: '163D66',
    bullets: ['群众上报', '巡防接单', '后台留痕复盘'],
  },
  {
    x: 8.78, title: '落地路径', color: '513B16',
    bullets: ['先试点一个夜市', '接入存量设备', '可对接海康 / 大华 / 宇视'],
  },
];

cards.forEach((c, i) => {
  box(c.x, 6.38, 3.95, 0.84, c.color, i === 2 ? 'FFD466' : '58B7EA', 10);
  slide.addShape(pptx.ShapeType.roundRect, {
    x: c.x + 0.18, y: 6.56, w: 0.36, h: 0.36,
    rectRadius: 0.12,
    fill: { color: i === 2 ? 'A47A18' : '1F6DAA', transparency: 0 },
    line: { color: 'FFFFFF', transparency: 78, pt: 0.6 },
  });
  text(String(i + 1).padStart(2, '0'), c.x + 0.18, 6.67, 0.36, 0.08, {
    fontSize: 8.5,
    bold: true,
    color: i === 2 ? C.gold : C.white,
    align: 'center',
  });
  text(c.title, c.x + 0.63, 6.53, 1.08, 0.12, {
    fontSize: 14.5,
    bold: true,
    color: C.white,
  });
  c.bullets.forEach((b, bi) => {
    text(`• ${b}`, c.x + 0.62, 6.74 + bi * 0.18, 3.0, 0.1, {
      fontSize: 10.4,
      color: i === 2 && bi === 2 ? C.gold : C.muted,
      bold: bi === 2 && i === 2,
    });
  });
});

// Export notes not used; this is a one-slide pasteable sheet.

await pptx.writeFile({ fileName: 'D:/CICSIC/outputs/competitor_analysis_upgrade/competitor-analysis-polished.pptx' });
