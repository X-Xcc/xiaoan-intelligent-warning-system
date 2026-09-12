import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const device = {
  id: 'real-camera', name: 'Real camera', online: false, status: 'stopped',
  frameCount: 0, lastFrameAt: '', webrtc: false,
};

function renderPreview(props, { failedImage = false } = {}) {
  const module = { exports: {} };
  const code = transformSync(read('../components/BridgePreview.tsx'), {
    loader: 'tsx', format: 'cjs', jsx: 'automatic',
  }).code;
  const jsx = (type, props) => ({ type, props });
  const hooks = {
    useRef: (current) => ({ current }),
    useState: (initial) => [
      failedImage && initial === false ? true : typeof initial === 'function' ? initial() : initial,
      () => {},
    ],
    useEffect() {},
  };
  const api = {
    hasFreshFrame: (value) => value.online,
    bridgeSourceKey: (value) => value.id,
    bridgeStatusLabels: { stopped: 'Stopped' },
    bridgeMediaUrl: () => '/real-camera/feed',
  };
  vm.runInNewContext(code, {
    module, exports: module.exports, Date, RTCPeerConnection: function () {},
    require: (name) => name === 'react' ? hooks
      : name === 'react/jsx-runtime' ? { jsx, jsxs: jsx }
        : name.includes('device-bridges-api') ? api : {},
  });
  const nodes = [];
  const visit = (node) => {
    if (node == null || typeof node === 'boolean') return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (typeof node !== 'object') { nodes.push(node); return; }
    if (typeof node.type === 'function') { visit(node.type(node.props)); return; }
    nodes.push(node);
    visit(node.props?.children);
  };
  visit(module.exports.BridgePreview({
    available: true, authorized: true,
    ...(props.device ? {} : { placeholderSrc: '/demo.png' }),
    ...props,
  }));
  return nodes;
}

for (const compact of [true, false]) {
  test(`confirmed empty slot has a visible demo label without claiming live video (${compact})`, () => {
    const nodes = renderPreview({ compact });
    assert.ok(nodes.some((node) => node.type === 'img' && node.props.src === '/demo.png'));
    assert.ok(nodes.some((node) => typeof node === 'string' && /示意图.*非实时/.test(node)));
    assert.ok(nodes.some((node) => node.props?.['data-preview-state'] === 'unavailable'));
    assert.ok(!nodes.some((node) => node.props?.['data-preview-state'] === 'live'));
  });

  for (const available of [true, false]) {
    test(`real offline device never receives a demo image (${compact}, service ${available})`, () => {
      const nodes = renderPreview({ compact, available, device });
      assert.ok(!nodes.some((node) => node.type === 'img' && node.props.src === '/demo.png'));
      assert.ok(nodes.some((node) => node.props?.role === 'status'));
    });
  }

  test(`unavailable service does not turn unknown slots into demonstrations (${compact})`, () => {
    const nodes = renderPreview({ compact, available: false, placeholderSrc: undefined });
    assert.ok(!nodes.some((node) => node.type === 'img' && node.props.src === '/demo.png'));
    assert.ok(nodes.some((node) => node.props?.role === 'status'));
  });
}

test('offline WebRTC cameras preserve their actual unavailable state', () => {
  const nodes = renderPreview({ device: { ...device, webrtc: true } });
  assert.ok(nodes.some((node) => node.props?.['data-preview-mode'] === 'webrtc'));
  assert.ok(nodes.some((node) => node.props?.role === 'status'));
  assert.ok(!nodes.some((node) => node.type === 'img' && node.props.src === '/demo.png'));
});

test('failed placeholder assets expose the underlying empty-state message', () => {
  const nodes = renderPreview({ compact: true }, { failedImage: true });
  assert.ok(!nodes.some((node) => node.type === 'img' && node.props.src === '/demo.png'));
  assert.ok(nodes.some((node) => node.props?.role === 'status'));
});

test('wall only supplies demo images for confirmed null bindings and preserves open access and errors', () => {
  const page = read('../pages/VideoLinkagePage.tsx');
  assert.match(page, /const placeholderSrc = id === null && bridge\.inventory/);
  assert.match(page, /bindings\[selectedChannel\] === null && bridge\.inventory/);
  assert.match(page, /monitoring-service/);
  assert.match(page, /bridge-video-alert/);
  assert.doesNotMatch(page, /BridgeLogin|bridge\.authRequired|bridge\.lock/);
});
