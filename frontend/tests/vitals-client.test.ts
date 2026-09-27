import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { VitalsClient, type VitalsReading } from '../src/features/vitals/vitalsClient';

class MockWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  url: string;
  readyState = MockWebSocket.CONNECTING;
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }
  send(data: unknown) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  /** Simulate the server opening the connection. */
  open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }
  /** Simulate a server message. */
  receive(obj: unknown) {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }
  static instances: MockWebSocket[] = [];
}

describe('VitalsClient', () => {
  let realWebSocket: typeof WebSocket;

  beforeEach(() => {
    realWebSocket = globalThis.WebSocket;
    MockWebSocket.instances = [];
    (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket =
      MockWebSocket as unknown as typeof WebSocket;
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.WebSocket = realWebSocket;
    vi.useRealTimers();
  });

  it('sends start on open and resolves ready', async () => {
    const statuses: string[] = [];
    const client = new VitalsClient('ws://test:8787', { onStatus: (s) => statuses.push(s) });
    const promise = client.start();
    const ws = MockWebSocket.instances[0];
    ws.open();
    expect(JSON.parse(ws.sent[0])).toEqual({ type: 'start' });
    ws.receive({ type: 'ready' });
    await expect(promise).resolves.toBe('ready');
    expect(client.currentStatus).toBe('measuring');
    expect(statuses).toContain('measuring');
  });

  it('resolves busy when the service is claimed', async () => {
    const client = new VitalsClient('ws://test:8787');
    const promise = client.start();
    const ws = MockWebSocket.instances[0];
    ws.open();
    ws.receive({ type: 'busy' });
    await expect(promise).resolves.toBe('busy');
    expect(client.currentStatus).toBe('busy');
  });

  it('resolves unavailable when the socket errors', async () => {
    const client = new VitalsClient('ws://test:8787');
    const promise = client.start();
    const ws = MockWebSocket.instances[0];
    ws.onerror?.();
    await expect(promise).resolves.toBe('unavailable');
    expect(client.currentStatus).toBe('unavailable');
  });

  it('delivers vitals readings to the callback', async () => {
    const readings: VitalsReading[] = [];
    const client = new VitalsClient('ws://test:8787', { onReading: (r) => readings.push(r) });
    const promise = client.start();
    const ws = MockWebSocket.instances[0];
    ws.open();
    ws.receive({ type: 'ready' });
    await promise;
    ws.receive({
      type: 'vitals',
      pulse_bpm: 72,
      pulse_confidence: 90,
      breathing_bpm: 14,
      breathing_confidence: 80,
      ts: 123,
    });
    expect(readings).toHaveLength(1);
    expect(readings[0].pulse_bpm).toBe(72);
  });

  it('sendFrame is a no-op unless measuring', async () => {
    const client = new VitalsClient('ws://test:8787');
    expect(client.sendFrame(new Uint8Array([1, 2, 3]))).toBe(false);
    const promise = client.start();
    const ws = MockWebSocket.instances[0];
    ws.open();
    ws.receive({ type: 'ready' });
    await promise;
    expect(client.sendFrame(new Uint8Array([1, 2, 3]))).toBe(true);
    expect(ws.sent).toHaveLength(2); // start + frame
  });

  it('stop sends stop and resets to idle', async () => {
    const client = new VitalsClient('ws://test:8787');
    const promise = client.start();
    const ws = MockWebSocket.instances[0];
    ws.open();
    ws.receive({ type: 'ready' });
    await promise;
    client.stop();
    expect(JSON.parse(ws.sent[1])).toEqual({ type: 'stop' });
    expect(client.currentStatus).toBe('idle');
  });

  it('malformed server messages are ignored', async () => {
    const readings: VitalsReading[] = [];
    const client = new VitalsClient('ws://test:8787', { onReading: (r) => readings.push(r) });
    const promise = client.start();
    const ws = MockWebSocket.instances[0];
    ws.open();
    ws.receive({ type: 'ready' });
    await promise;
    ws.onmessage?.({ data: 'not json{{{' });
    expect(readings).toHaveLength(0);
    expect(client.currentStatus).toBe('measuring');
  });
});
