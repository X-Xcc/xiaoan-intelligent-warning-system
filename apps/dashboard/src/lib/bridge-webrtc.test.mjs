import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

function runtime() {
  const peers = [];
  const requests = [];
  const timers = new Set();
  class Peer {
    constructor() { peers.push(this); this.iceGatheringState = 'complete'; this.closed = false; this.reports = new Map(); }
    addTransceiver() { return { receiver: {}, setCodecPreferences() {} }; }
    async createOffer() { return { sdp: 'v=0\r\n', type: 'offer' }; }
    async setLocalDescription(value) { this.localDescription = value; }
    async setRemoteDescription(value) { this.remoteDescription = value; }
    async getStats() { return this.reports; }
    close() { this.closed = true; }
  }
  const module = { exports: {} };
  const source = fs.readFileSync(new URL('./bridge-webrtc.ts', import.meta.url), 'utf8');
  vm.runInNewContext(transformSync(source, { loader: 'ts', format: 'cjs' }).code, {
    exports: module.exports, module,
    require: () => ({ bridgeRequest: async (path, options) => {
      requests.push({ path, options });
      return path.endsWith('/offer') ? { id: 'session', sdp: 'v=0\r\n', type: 'answer' } : { alive: true };
    } }),
    RTCPeerConnection: Peer,
    RTCRtpReceiver: { getCapabilities: () => ({ codecs: [{ mimeType: 'video/H264' }] }) },
    MediaStream: class { constructor(tracks) { this.tracks = tracks; } },
    AbortController, DOMException, Date,
    setInterval: (callback) => { timers.add(callback); return callback; },
    clearInterval: (callback) => timers.delete(callback),
    setTimeout, clearTimeout,
  });
  return { ...module.exports, peers, requests, timers };
}
const flush = () => new Promise(setImmediate);

test('wall and focus share one peer and release it only after the last subscriber', async () => {
  const app = runtime();
  const first = [], second = [];
  const stopFirst = app.subscribeBridgeVideo('camera', 'same-source', (state) => first.push(state));
  const stopSecond = app.subscribeBridgeVideo('camera', 'same-source', (state) => second.push(state));
  await flush();
  assert.equal(app.peers.length, 1);
  assert.equal(app.requests.filter((request) => request.path.endsWith('/offer')).length, 1);
  const stream = {};
  app.peers[0].ontrack({ streams: [stream] });
  assert.equal(first.at(-1).stream, stream);
  assert.equal(second.at(-1).stream, stream);
  stopFirst();
  assert.equal(app.peers[0].closed, false);
  stopSecond();
  assert.equal(app.peers[0].closed, true);
  assert.equal(app.timers.size, 0);
  assert.ok(app.requests.some((request) => request.path.endsWith('/session/close')));
});

test('playback fps comes from decoded frame counters, not source metadata', async () => {
  const app = runtime();
  const values = [];
  const stop = app.subscribeBridgeVideo('camera', 'counter-source', (state) => values.push(state));
  await flush();
  const report = { type: 'inbound-rtp', kind: 'video', timestamp: 2000,
    framesDecoded: 50, framesDropped: 0, jitterBufferDelay: .1, jitterBufferEmittedCount: 50 };
  app.peers[0].reports.set('video', report);
  app.timers.forEach((tick) => tick());
  await flush();
  app.peers[0].reports.set('video', { ...report, timestamp: 4000, framesDecoded: 100,
    jitterBufferDelay: .2, jitterBufferEmittedCount: 100 });
  app.timers.forEach((tick) => tick());
  await flush();
  assert.equal(values.at(-1).fps, 25);
  assert.equal(values.at(-1).bufferMs, 2);
  assert.equal(values.at(-1).dropped, 0);
  stop();
});

test('unmount during negotiation cannot leak a late server-side peer', async () => {
  const app = runtime();
  const stop = app.subscribeBridgeVideo('camera', 'cancelled-source', () => {});
  stop();
  await flush();
  assert.equal(app.peers[0].closed, true);
  assert.equal(app.timers.size, 0);
  assert.ok(app.requests.some((request) => request.path.endsWith('/session/close')));
});
