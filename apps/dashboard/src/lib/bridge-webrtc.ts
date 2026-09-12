import { bridgeRequest } from './device-bridges-api';

export type VideoPlayback = {
  stream: MediaStream | null;
  fps: number | null;
  dropped: number;
  bufferMs: number | null;
  error: string;
};
type Listener = (value: VideoPlayback) => void;
const connections = new Map<string, SharedVideo>();

class SharedVideo {
  listeners = new Set<Listener>();
  state: VideoPlayback = { stream: null, fps: null, dropped: 0, bufferMs: null, error: '' };
  stopped = false;
  cleanup: () => void = () => {};
  retry?: ReturnType<typeof setTimeout>;
  attempts = 0;
  constructor(readonly id: string) { void this.connect(); }

  publish(value: Partial<VideoPlayback>) {
    this.state = { ...this.state, ...value };
    this.listeners.forEach((listener) => listener(this.state));
  }

  async connect() {
    if (this.stopped) return;
    let session = '';
    let closed = false;
    let renewing = false;
    let sampling = false;
    let lastFrames = 0;
    let lastTime = 0;
    let lastDelay = 0;
    let lastEmitted = 0;
    let disconnectedAt = 0;
    const pc = new RTCPeerConnection({ iceServers: [], bundlePolicy: 'max-bundle' });
    const controller = new AbortController();
    const prefix = `/${encodeURIComponent(this.id)}/webrtc`;
    const close = () => {
      if (closed) return;
      closed = true;
      controller.abort();
      clearInterval(timer);
      pc.close();
      if (session) void bridgeRequest(`${prefix}/${session}/close`, { method: 'POST' }, 3000).catch(() => {});
    };
    this.cleanup = close;
    const failed = () => {
      if (closed || this.stopped) return;
      close();
      this.publish({ stream: null, fps: null, bufferMs: null, error: '视频连接中断，正在重连' });
      this.retry = setTimeout(() => void this.connect(), Math.min(10000, 500 * 2 ** this.attempts++));
    };
    const timer = setInterval(() => {
      if (closed) return;
      if (disconnectedAt && Date.now() - disconnectedAt > 3000) { failed(); return; }
      if (session && !renewing) {
        renewing = true;
        void bridgeRequest(`${prefix}/${session}/renew`, { method: 'POST', signal: controller.signal }, 3000)
          .catch(() => failed()).finally(() => { renewing = false; });
      }
      if (sampling) return;
      sampling = true;
      void pc.getStats().then((reports) => {
        if (closed) return;
        reports.forEach((report) => {
          if (report.type !== 'inbound-rtp' || report.kind !== 'video') return;
          const frames = Number(report.framesDecoded ?? 0);
          const timestamp = Number(report.timestamp);
          const elapsed = (timestamp - lastTime) / 1000;
          const fps = lastTime && elapsed > 0 ? Math.max(0, (frames - lastFrames) / elapsed) : null;
          const delay = Number(report.jitterBufferDelay ?? 0);
          const emitted = Number(report.jitterBufferEmittedCount ?? 0);
          const bufferMs = emitted > lastEmitted ? (delay - lastDelay) * 1000 / (emitted - lastEmitted) : null;
          this.publish({ fps, bufferMs, dropped: Number(report.framesDropped ?? 0) });
          lastFrames = frames; lastTime = timestamp; lastDelay = delay; lastEmitted = emitted;
        });
      }).catch(() => {}).finally(() => { sampling = false; });
    }, 2000);
    try {
      const transceiver = pc.addTransceiver('video', { direction: 'recvonly' });
      const codecs = RTCRtpReceiver.getCapabilities('video')?.codecs.filter((codec) => codec.mimeType.toLowerCase() === 'video/h264');
      if (codecs?.length) transceiver.setCodecPreferences(codecs);
      const receiver = transceiver.receiver as RTCRtpReceiver & { jitterBufferTarget?: number; playoutDelayHint?: number };
      if ('jitterBufferTarget' in receiver) receiver.jitterBufferTarget = 0;
      if ('playoutDelayHint' in receiver) receiver.playoutDelayHint = 0;
      pc.ontrack = (event) => {
        if (!closed) this.publish({ stream: event.streams[0] ?? new MediaStream([event.track]), error: '' });
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') { this.attempts = 0; disconnectedAt = 0; }
        if (pc.connectionState === 'disconnected') disconnectedAt ||= Date.now();
        if (pc.connectionState === 'failed') failed();
      };
      await pc.setLocalDescription(await pc.createOffer());
      if (pc.iceGatheringState !== 'complete') {
        await new Promise<void>((resolve, reject) => {
          const finish = () => {
            clearTimeout(deadline);
            pc.removeEventListener('icegatheringstatechange', changed);
            controller.signal.removeEventListener('abort', aborted);
          };
          const changed = () => { if (pc.iceGatheringState === 'complete') { finish(); resolve(); } };
          const aborted = () => { finish(); reject(new DOMException('Cancelled', 'AbortError')); };
          const deadline = setTimeout(() => { finish(); reject(new Error('ICE gathering timeout')); }, 4000);
          pc.addEventListener('icegatheringstatechange', changed);
          controller.signal.addEventListener('abort', aborted, { once: true });
          if (controller.signal.aborted) aborted();
        });
      }
      const answer = await bridgeRequest<{ id: string; sdp: string; type: 'answer' }>(`${prefix}/offer`, {
        method: 'POST', signal: controller.signal,
        body: JSON.stringify({ sdp: pc.localDescription?.sdp, type: 'offer' }),
      }, 15000);
      session = answer.id;
      if (closed) {
        void bridgeRequest(`${prefix}/${session}/close`, { method: 'POST' }, 3000).catch(() => {});
        return;
      }
      await pc.setRemoteDescription({ sdp: answer.sdp, type: answer.type });
    } catch {
      failed();
    }
  }

  stop() { this.stopped = true; clearTimeout(this.retry); this.cleanup(); }
}

export function subscribeBridgeVideo(id: string, key: string, listener: Listener): () => void {
  let connection = connections.get(key);
  if (!connection) {
    connection = new SharedVideo(id);
    connections.set(key, connection);
  }
  const shared = connection;
  shared.listeners.add(listener);
  listener(shared.state);
  return () => {
    shared.listeners.delete(listener);
    if (!shared.listeners.size) {
      shared.stop();
      if (connections.get(key) === shared) connections.delete(key);
    }
  };
}
