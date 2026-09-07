import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';

const project = fileURLToPath(new URL('../', import.meta.url));
const hookPath = path.join(project, 'apps/dashboard/src/lib/use-training-media.ts');
const requireDashboard = createRequire(path.join(project, 'apps/dashboard/package.json'));

test('training media hook regressions', { concurrency: false }, async (suite) => {
  const { JSDOM } = await import(pathToFileURL(path.join(project, '.verify/dom-runtime/node_modules/jsdom/lib/api.js')));
  const dom = new JSDOM('<main></main>', { url: 'http://test.invalid/duty-plan', pretendToBeVisual: true });
  const { window } = dom;
  const originals = new Map();
  const setGlobal = (key, value) => {
    if (!originals.has(key)) originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  };
  let networkRequests = 0;

  try {
    setGlobal('window', window);
    for (const key of ['document', 'navigator', 'HTMLElement', 'HTMLVideoElement', 'Element', 'Node', 'Event', 'DOMException', 'Blob', 'File', 'URL']) {
      setGlobal(key, window[key]);
    }
    setGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    setGlobal('fetch', () => {
      networkRequests += 1;
      throw new Error('Media hook tests must not make network requests');
    });
    window.fetch = globalThis.fetch;

    const { outputFiles } = await build({
      entryPoints: [hookPath], bundle: true, write: false, platform: 'node', format: 'cjs',
      mainFields: ['module', 'main'], logLevel: 'silent',
      plugins: [{
        name: 'dashboard-react-runtime',
        setup(builder) {
          builder.onResolve({ filter: /^react(?:-dom)?(?:\/|$)/ }, (args) => ({
            path: requireDashboard.resolve(args.path), external: true,
          }));
        },
      }],
    });
    const compiled = { exports: {} };
    new Function('require', 'module', 'exports', outputFiles[0].text)(requireDashboard, compiled, compiled.exports);
    const { useTrainingMedia } = compiled.exports;
    const React = requireDashboard('react');
    const { act } = React;
    const { createRoot } = requireDashboard('react-dom/client');

    const mount = async (context, initial = {}) => {
      const requests = [];
      const operations = [];
      const streams = [];
      const recorders = [];
      const recorderEvents = [];
      const liveUrls = new Map();
      const revokedUrls = new Set();
      let nextUrl = 0;
      let media;
      let props = { taskId: 'TRAIN-MEDIA-A', canRecord: true, ...initial };
      let unmounted = false;
      const container = document.createElement('div');
      document.querySelector('main').append(container);
      const root = createRoot(container);

      Object.defineProperty(window.navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia(constraints) {
            let resolve;
            let reject;
            const promise = new Promise((accept, decline) => { resolve = accept; reject = decline; });
            const request = {
              constraints, settled: false,
              grant(stream) { request.settled = true; resolve(stream); },
              deny() { request.settled = true; reject(new window.DOMException('Test cleanup', 'AbortError')); },
            };
            requests.push(request);
            return promise;
          },
        },
      });
      window.URL.createObjectURL = (blob) => {
        const url = `blob:http://test.invalid/media-${++nextUrl}`;
        liveUrls.set(url, blob);
        return url;
      };
      window.URL.revokeObjectURL = (url) => {
        revokedUrls.add(url);
        liveUrls.delete(url);
      };

      class Recorder {
        constructor(stream) {
          this.stream = stream;
          this.state = 'inactive';
          this.mimeType = 'video/webm';
          this.starts = 0;
          this.stops = 0;
          recorders.push(this);
        }
        start() {
          this.state = 'recording';
          this.starts += 1;
        }
        stop() {
          assert.notEqual(this.state, 'inactive', 'an inactive recorder must not be stopped twice');
          this.state = 'inactive';
          this.stops += 1;
          // MediaRecorder delivers its final data and stop event asynchronously.
          recorderEvents.push(() => {
            this.ondataavailable?.({ data: new window.Blob(['recorded frames'], { type: this.mimeType }) });
            this.onstop?.(new window.Event('stop'));
          });
        }
      }
      setGlobal('MediaRecorder', Recorder);
      window.MediaRecorder = Recorder;

      function Probe(current) {
        media = useTrainingMedia(current.taskId, current.canRecord);
        return React.createElement('video', {
          ref: media.videoRef, src: media.previewUrl || undefined,
          controls: Boolean(media.previewUrl), muted: !media.previewUrl,
        });
      }

      const flushRecorderEvents = async () => act(async () => {
        while (recorderEvents.length) recorderEvents.shift()();
      });
      const unmount = async () => {
        if (unmounted) return;
        await act(async () => root.unmount());
        unmounted = true;
      };
      context.after(async () => {
        try {
          await unmount();
          await act(async () => {
            for (const request of requests) if (!request.settled) request.deny();
            await Promise.allSettled(operations);
          });
          await flushRecorderEvents();
          assert.ok(streams.every((stream) => stream.getTracks().every((track) => track.readyState === 'ended')), 'unmount must release every granted track');
          assert.equal(liveUrls.size, 0, 'unmount must revoke every preview URL');
        } finally {
          container.remove();
        }
      });

      const render = async (next = {}) => {
        props = { ...props, ...next };
        await act(async () => root.render(React.createElement(Probe, props)));
      };
      const makeStream = () => {
        const tracks = Array.from({ length: 2 }, () => ({
          kind: 'video', readyState: 'live', stopCalls: 0,
          stop() { this.stopCalls += 1; this.readyState = 'ended'; },
        }));
        const stream = { getTracks: () => tracks };
        streams.push(stream);
        return stream;
      };
      const beginRecording = async () => {
        const before = requests.length;
        let operation;
        await act(async () => { operation = media.startRecording(); });
        operations.push(operation);
        return { operation, request: requests.length > before ? requests.at(-1) : undefined };
      };
      const grant = async (attempt, stream = makeStream()) => {
        assert.ok(attempt.request, 'recording should request camera permission');
        await act(async () => {
          attempt.request.grant(stream);
          await attempt.operation;
        });
        return stream;
      };
      const loadFile = async (file) => act(async () => media.loadFile(file));

      await render();
      return {
        get media() { return media; },
        requests, recorders, liveUrls, revokedUrls,
        render, beginRecording, grant, loadFile, flushRecorderEvents, unmount,
      };
    };

    await suite.test('canRecord=false blocks a new permission request', async (context) => {
      const fixture = await mount(context, { canRecord: false });
      await fixture.beginRecording();
      assert.equal(fixture.requests.length, 0, 'an ineligible task must not ask for camera access');
      assert.equal(fixture.media.opening, false);
      assert.equal(fixture.media.recording, false);
    });

    await suite.test('late permission after canRecord=false releases the stream without recording', async (context) => {
      const fixture = await mount(context);
      const attempt = await fixture.beginRecording();
      assert.equal(fixture.media.opening, true);
      await fixture.render({ canRecord: false });
      const stream = await fixture.grant(attempt);
      assert.ok(stream.getTracks().every((track) => track.readyState === 'ended'), 'a late permission grant must not leave camera tracks live');
      assert.equal(fixture.recorders.reduce((sum, recorder) => sum + recorder.starts, 0), 0, 'an ineligible task must never start recording');
      assert.equal(fixture.media.opening, false);
      assert.equal(fixture.media.recording, false);
      assert.equal(fixture.media.previewUrl, '');
    });

    await suite.test('loadFile cannot replace media while permission is pending', async (context) => {
      const fixture = await mount(context);
      await fixture.loadFile(new window.File(['original'], 'original.webm', { type: 'video/webm' }));
      const attempt = await fixture.beginRecording();
      assert.equal(fixture.media.opening, true);
      const before = {
        url: fixture.media.previewUrl, name: fixture.media.downloadName,
        liveUrls: [...fixture.liveUrls.keys()], revokedUrls: [...fixture.revokedUrls],
      };
      await fixture.loadFile(new window.File(['replacement'], 'replacement.mp4', { type: 'video/mp4' }));
      assert.equal(fixture.media.previewUrl, before.url, 'pending permission must block imported preview replacement');
      assert.equal(fixture.media.downloadName, before.name);
      assert.deepEqual([...fixture.liveUrls.keys()], before.liveUrls);
      assert.deepEqual([...fixture.revokedUrls], before.revokedUrls);
      await fixture.grant(attempt);
    });

    await suite.test('canRecord=false stops active recording and preserves its final preview', async (context) => {
      const fixture = await mount(context);
      const stream = await fixture.grant(await fixture.beginRecording());
      assert.equal(fixture.media.recording, true);
      assert.equal(fixture.media.videoRef.current.srcObject, stream, 'live video must receive the camera stream');
      const recorder = fixture.recorders[0];
      await fixture.render({ canRecord: false });
      await fixture.flushRecorderEvents();
      assert.equal(recorder.stops, 1, 'losing eligibility must stop the active recorder');
      assert.equal(fixture.media.recording, false);
      assert.equal(fixture.media.opening, false);
      assert.ok(stream.getTracks().every((track) => track.readyState === 'ended'));
      const preview = fixture.media.previewUrl;
      assert.ok(preview, 'automatic stop must retain the final recorded video');
      assert.ok(fixture.liveUrls.get(preview)?.size > 0);
      assert.equal(fixture.media.downloadName, 'TRAIN-MEDIA-A.webm');
      assert.equal(fixture.media.videoRef.current.srcObject, null);
      await fixture.render({ canRecord: false });
      assert.equal(fixture.media.previewUrl, preview, 'a subsequent poll must not discard the recording');
      assert.equal(recorder.stops, 1);
    });

    await suite.test('cancelOpening releases a late grant without interfering with a newer request', async (context) => {
      const fixture = await mount(context);
      const cancelled = await fixture.beginRecording();
      assert.equal(fixture.media.opening, true);
      assert.equal(typeof fixture.media.cancelOpening, 'function', 'pending camera permission needs an explicit cancel action');
      await act(async () => fixture.media.cancelOpening());
      assert.equal(fixture.media.opening, false);
      assert.equal(fixture.media.recording, false);
      const current = await fixture.beginRecording();
      assert.equal(fixture.requests.length, 2, 'cancellation must allow a fresh recording attempt');
      const staleStream = await fixture.grant(cancelled);
      assert.ok(staleStream.getTracks().every((track) => track.readyState === 'ended'), 'the cancelled grant must be released');
      assert.equal(fixture.media.opening, true, 'a stale callback must not clear the newer opening state');
      assert.equal(fixture.media.recording, false);
      assert.equal(fixture.media.previewUrl, '');
      const currentStream = await fixture.grant(current);
      assert.equal(fixture.media.opening, false);
      assert.equal(fixture.media.recording, true);
      assert.ok(currentStream.getTracks().every((track) => track.readyState === 'live'));
      assert.equal(fixture.media.videoRef.current.srcObject, currentStream);
    });

    await suite.test('imported files retain their original download names and extensions', async (context) => {
      const fixture = await mount(context);
      const files = [
        new window.File(['mp4'], '\u6c11\u8b66 \u8bad\u7ec3.final.mp4', { type: 'video/mp4' }),
        new window.File(['webm'], 'field drill.review.webm', { type: 'video/webm' }),
      ];
      for (const file of files) {
        const previous = fixture.media.previewUrl;
        await fixture.loadFile(file);
        assert.equal(fixture.media.downloadName, file.name, 'download names must preserve the source filename, including its extension');
        assert.equal(fixture.liveUrls.get(fixture.media.previewUrl), file);
        assert.equal(fixture.media.recording, false);
        if (previous) assert.ok(fixture.revokedUrls.has(previous), 'replaced previews must release their object URLs');
      }
    });

    await suite.test('changing tasks while permission is pending releases the old grant', async (context) => {
      const fixture = await mount(context);
      const old = await fixture.beginRecording();
      await fixture.render({ taskId: 'TRAIN-MEDIA-B' });
      const stream = await fixture.grant(old);
      assert.ok(stream.getTracks().every((track) => track.readyState === 'ended'));
      assert.equal(fixture.media.recording, false);
      assert.equal(fixture.media.opening, false);
      assert.equal(fixture.media.previewUrl, '');
      assert.equal(fixture.media.downloadName, '');
    });

    await suite.test('unmounting while permission is pending releases a later grant', async (context) => {
      const fixture = await mount(context);
      const old = await fixture.beginRecording();
      await fixture.unmount();
      const stream = await fixture.grant(old);
      assert.ok(stream.getTracks().every((track) => track.readyState === 'ended'));
      assert.equal(fixture.liveUrls.size, 0);
      assert.equal(fixture.recorders.reduce((sum, recorder) => sum + recorder.starts, 0), 0);
    });

    assert.equal(networkRequests, 0, 'recording and importing must remain local');
  } finally {
    window.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
