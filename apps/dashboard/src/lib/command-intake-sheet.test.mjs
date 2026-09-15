import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

function load(path, dependencies = {}) {
  const module = { exports: {} };
  const compiled = transformSync(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    loader: path.endsWith('.tsx') ? 'tsx' : 'ts', format: 'cjs', jsx: 'automatic',
  }).code;
  vm.runInNewContext(compiled, {
    module, exports: module.exports,
    require: name => dependencies[name] ?? {},
  });
  return module.exports;
}

const intake = load('./intake-sheet.ts');
const demos = load('./intake-demo-data.ts');
const sample = {
  id: 'sample', description: 'Incident narrative', attention: 'Safety reminder',
};

function sheet(events = [sample]) {
  const states = [];
  let cursor = 0;
  const jsx = (type, props) => ({ type, props });
  const { CommandIntakeSheet } = load('../components/CommandIntakeSheet.tsx', {
    '../lib/intake-sheet': intake,
    './CommandScene': { CommandScene: 'CommandScene' },
    './DemoDispatchMap': { DemoDispatchMap: 'DemoDispatchMap' },
    '../assets/intake-hello.wav?url': 'placeholder.wav',
    '../assets/intake-disorder-call.wav?url': 'disorder-call.wav',
    '../assets/alarm-phone-stolen.mp3?url': 'phone-stolen.mp3',
    '../assets/alarm-disorder-1000082752.mp3?url': 'disorder-1000082752.mp3',
    react: {
      useEffect() {}, useRef: () => ({ current: null }),
      useState(initial) {
        const index = cursor++;
        if (!(index in states)) states[index] = initial;
        return [states[index], value => {
          states[index] = typeof value === 'function' ? value(states[index]) : value;
        }];
      },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
  });
  return () => {
    cursor = 0;
    return CommandIntakeSheet({ events });
  };
}

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...nodes(tree.props?.children)];
}

function content(tree) {
  if (Array.isArray(tree)) return tree.map(content).join('');
  if (!tree || typeof tree !== 'object') return tree ?? '';
  return content(tree.props?.children);
}

test('only the contents swap while original headings and attention styling stay in place', () => {
  const tree = sheet()();
  const facts = nodes(tree).find(node => node.props['aria-label'] === '警情四要素');
  const paper = nodes(tree).find(node => node.props.id === 'intake-report');
  assert.ok(content(facts).includes('注意事项Incident narrative'));
  assert.ok(!content(facts).includes('Safety reminder'));
  assert.ok(content(paper).includes('警情内容Safety reminder'));
  assert.ok(!content(paper).includes('Incident narrative'));
  assert.ok(nodes(facts).some(node => node.props.className?.includes('intake-attention')));
  assert.ok(!nodes(paper).some(node => node.props.className?.includes('intake-attention')));
});

test('both swapped fields remain editable and edits update the summary', () => {
  const render = sheet();
  nodes(render()).find(node => node.type === 'button' && content(node) === '修改').props.onClick();
  for (const name of ['details', 'attention']) {
    const textarea = nodes(render()).find(node => node.type === 'textarea' && node.props.name === name);
    assert.ok(textarea, `Missing editable ${name}`);
    textarea.props.onChange({ target: { value: `Updated ${name}` } });
  }
  nodes(render()).find(node => node.type === 'button' && content(node) === '完成修改').props.onClick();
  assert.ok(content(render()).includes('Updated details'));
  assert.ok(content(render()).includes('Updated attention'));
  nodes(render()).find(node => node.type === 'button' && content(node) === '查看完整接警单').props.onClick();
  assert.ok(content(render()).includes('Updated details'));
  assert.ok(content(render()).includes('Updated attention'));
});

test('lost property is a selectable demo with its own narrative and attention', () => {
  const event = demos.demoIntakeEvents.find(item => item.title === '财物丢失');
  assert.ok(event, 'Missing lost-property incident');
  assert.equal(event.sourceMode, 'desensitized_demo');
  assert.ok(event.description);
  assert.ok(event.attention);
  const render = sheet([sample, event]);
  nodes(render()).find(node => node.props['aria-label'] === '选择警情')
    .props.onChange({ target: { value: event.id } });
  assert.ok(content(render()).includes(event.description));
  assert.ok(content(render()).includes(event.attention));
  assert.ok(!content(render()).includes(sample.description));
});

test('lost-property sample augments only the existing demo queue and is never duplicated', () => {
  assert.equal(typeof demos.withIntakeDemoEvents, 'function');
  const real = [{ id: 'real-001', sourceMode: 'live' }];
  assert.equal(demos.withIntakeDemoEvents(real), real);
  const empty = [];
  assert.equal(demos.withIntakeDemoEvents(empty), empty);
  const queue = demos.withIntakeDemoEvents([{ id: 'YS-DEMO-001' }, ...real]);
  assert.equal(queue.length, 3);
  assert.equal(queue.at(-1).title, '财物丢失');
  assert.equal(queue.at(-1).sourceMode, 'desensitized_demo');
  assert.equal(demos.withIntakeDemoEvents(queue).length, 3);
});

test('disorder uses the supplied recording while lost property retains its existing recording', () => {
  const lostProperty = demos.demoIntakeEvents.find(event => event.title === '财物丢失');
  const render = sheet([{ id: 'YS-DEMO-001', sourceMode: 'live' }, lostProperty]);
  const disorderAudio = nodes(render()).find(node => node.type === 'audio');
  assert.ok(disorderAudio, 'Missing supplied disorder recording');
  assert.equal(disorderAudio.props.src, 'disorder-1000082752.mp3');
  assert.equal(disorderAudio.props['aria-label'], '接警录音 YS-DEMO-001');
  nodes(render()).find(node => node.props['aria-label'] === '选择警情')
    .props.onChange({ target: { value: lostProperty.id } });
  const audio = nodes(render()).find(node => node.type === 'audio');
  assert.equal(audio.props.src, 'phone-stolen.mp3');
  assert.equal(audio.props['aria-label'], `接警录音 ${lostProperty.number}`);
  nodes(render()).find(node => node.props['aria-label'] === '选择警情')
    .props.onChange({ target: { value: 'YS-DEMO-001' } });
  assert.equal(nodes(render()).find(node => node.type === 'audio').props.src, 'disorder-1000082752.mp3');
});

test('live incidents cannot inherit the lost-property demo recording', () => {
  const tree = sheet([{ id: 'alarm-demo-006', sourceMode: 'live' }])();
  assert.equal(nodes(tree).filter(node => node.type === 'audio').length, 0);
});

test('unrelated live incidents do not receive the supplied disorder recording', () => {
  const tree = sheet([{ id: 'real-001', sourceMode: 'live' }])();
  assert.equal(nodes(tree).filter(node => node.type === 'audio').length, 0);
});

test('intake proceeds to police configuration before the scene and supports returning through both steps', () => {
  for (const event of [sample, demos.demoIntakeEvents.find(item => item.title === '财物丢失')]) {
    const render = sheet([event]);
    nodes(render()).find(node => node.props.id === 'intake-report')
      .props.onSubmit({ preventDefault() {} });
    assert.ok(content(render()).includes('警力配置'));
    assert.ok(nodes(render()).some(node => node.type === 'DemoDispatchMap'));
    nodes(render()).find(node => node.type === 'button' && content(node) === '下一步').props.onClick();
    const scene = render();
    assert.equal(scene.type, 'CommandScene');
    assert.equal(scene.props.event.id, event.id);
    assert.equal(scene.props.draft.details, event.description);
    scene.props.onBack();
    assert.ok(content(render()).includes('警力配置'));
    nodes(render()).find(node => node.type === 'button' && content(node) === '返回接警单').props.onClick();
    assert.ok(nodes(render()).some(node => node.props.id === 'intake-report'));
    assert.ok(content(render()).includes(event.description));
  }
});
