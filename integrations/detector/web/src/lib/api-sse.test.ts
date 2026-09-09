import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const encoder = new TextEncoder();
const cleanups: Array<() => void> = [];
let subscribeSse: typeof import('./api-sse').subscribeSse;
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

function streamResponse() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(value) { controller = value; } });
  return {
    response: new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }),
    send: (text: string) => controller.enqueue(encoder.encode(text)),
    close: () => controller.close(),
    fail: () => controller.error(new Error('fixture-disconnect')),
  };
}

async function flush() {
  await vi.advanceTimersByTimeAsync(0);
}

function subscribe(event: string, callback = vi.fn()) {
  const unsubscribe = subscribeSse(event, callback);
  cleanups.push(unsubscribe);
  return { callback, unsubscribe };
}

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  localStorage.clear();
  localStorage.setItem('jwt_token', 'fixture-jwt');
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
  // Let the old implementation run offline too, so failures are assertions rather than missing APIs.
  vi.stubGlobal('EventSource', class {
    static CLOSED = 2;
    readyState = 0;
    onopen: unknown;
    onerror: unknown;
    addEventListener() {}
    close() { this.readyState = 2; }
  });
  ({ subscribeSse } = await import('./api-sse'));
});

afterEach(async () => {
  cleanups.splice(0).forEach(cleanup => cleanup());
  await flush();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('authenticated SSE', () => {
  it('sends the JWT in a header and shares one stream between subscribers', async () => {
    const stream = streamResponse();
    fetchMock.mockResolvedValue(stream.response);
    subscribe('cameras');
    subscribe('alerts');
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('http://localhost:3000/api/sse/stream');
    expect(String(url)).not.toContain('fixture-jwt');
    expect(new Headers(options?.headers).get('Authorization')).toBe('Bearer fixture-jwt');
    expect(new Headers(options?.headers).get('Accept')).toBe('text/event-stream');
  });

  it('parses fragmented multiline events and preserves existing double-encoded JSON support', async () => {
    const stream = streamResponse();
    fetchMock.mockResolvedValue(stream.response);
    const { callback } = subscribe('cameras');
    await flush();
    stream.send(': heartbeat\r\nevent: cam');
    stream.send('eras\r\ndata: [{"id":"fixture",\r\ndata: "name":"Camera"}]\r\n\r\n');
    stream.send(`event: cameras\ndata: ${JSON.stringify(JSON.stringify([{ id: 'second' }]))}\n\n`);
    await flush();
    expect(callback.mock.calls).toEqual([
      [[{ id: 'fixture', name: 'Camera' }]],
      [[{ id: 'second' }]],
    ]);
  });

  it('ignores invalid JSON and isolates a failing subscriber', async () => {
    const stream = streamResponse();
    fetchMock.mockResolvedValue(stream.response);
    subscribe('cameras', vi.fn(() => { throw new Error('fixture-callback'); }));
    const { callback } = subscribe('cameras');
    await flush();
    stream.send('event: cameras\ndata: invalid-json\n\nevent: cameras\ndata: []\n\n');
    await flush();
    expect(callback).toHaveBeenCalledExactlyOnceWith([]);
  });

  it('reconnects after EOF using the current JWT', async () => {
    const first = streamResponse();
    const second = streamResponse();
    fetchMock.mockResolvedValueOnce(first.response).mockResolvedValueOnce(second.response);
    subscribe('cameras');
    await flush();
    first.close();
    await flush();
    localStorage.setItem('jwt_token', 'replacement-jwt');
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('Authorization')).toBe('Bearer replacement-jwt');
  });

  it('backs off transient failures without opening parallel retry streams', async () => {
    fetchMock.mockRejectedValue(new Error('fixture-offline'));
    subscribe('cameras');
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    subscribe('alerts');
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('aborts only when the last subscriber leaves', async () => {
    const stream = streamResponse();
    fetchMock.mockResolvedValue(stream.response);
    const first = subscribe('cameras');
    const last = subscribe('alerts');
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const signal = fetchMock.mock.calls[0][1]?.signal;
    first.unsubscribe();
    expect(signal?.aborted).toBe(false);
    last.unsubscribe();
    expect(signal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(60000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending retry on final unsubscribe and resets retry delay', async () => {
    fetchMock.mockRejectedValue(new Error('fixture-offline'));
    const first = subscribe('cameras');
    await flush();
    first.unsubscribe();
    await vi.advanceTimersByTimeAsync(60000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    subscribe('cameras');
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('invalidates a rejected JWT and stops retrying unauthorized requests', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));
    const invalid = vi.fn();
    window.addEventListener('rtk:token-invalid', invalid);
    try {
      subscribe('cameras');
      await flush();
      expect(localStorage.getItem('jwt_token')).toBeNull();
      expect(invalid).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(60000);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('rtk:token-invalid', invalid);
    }
  });

  it('stops forbidden retries without discarding a valid JWT', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 403 }));
    subscribe('cameras');
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('jwt_token')).toBe('fixture-jwt');
  });

  it('does not open an unauthenticated SSE connection', async () => {
    localStorage.clear();
    subscribe('cameras');
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
