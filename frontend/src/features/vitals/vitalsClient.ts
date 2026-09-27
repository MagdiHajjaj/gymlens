/**
 * VitalsClient — WebSocket client for the GymLens vitals-service sidecar.
 *
 * Protocol (client -> server):
 *   {"type":"start"}  claim the measurement session
 *   {"type":"stop"}   end the session
 *   <binary JPEG>     one camera frame
 *
 * Protocol (server -> client), all JSON:
 *   {"type":"ready"} | {"type":"busy"} | {"type":"vitals",...} |
 *   {"type":"validation",...} | {"type":"error",...} | {"type":"bye"}
 *
 * The client never throws on connection failure: if the sidecar is
 * unreachable, it reports `unavailable` and stays quiet. Vitals must
 * never break workout tracking.
 */

export interface VitalsReading {
  type: 'vitals';
  pulse_bpm: number | null;
  pulse_confidence: number; // 0–100; 0 means "still measuring"
  breathing_bpm: number | null;
  breathing_confidence: number; // 0–100
  ts: number;
}

export interface VitalsValidation {
  type: 'validation';
  code: string;
  hint: string;
}

export type VitalsStatus =
  | 'idle'
  | 'connecting'
  | 'measuring'
  | 'busy'
  | 'unavailable'
  | 'error';

export interface VitalsCallbacks {
  onReading?: (reading: VitalsReading) => void;
  onValidation?: (validation: VitalsValidation) => void;
  onStatus?: (status: VitalsStatus) => void;
  onError?: (message: string) => void;
}

const DEFAULT_URL =
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_VITALS_WS_URL ??
  'ws://localhost:8787';

export class VitalsClient {
  private ws: WebSocket | null = null;
  private url: string;
  private cb: VitalsCallbacks;
  private status: VitalsStatus = 'idle';
  private intentionalClose = false;

  constructor(url: string = DEFAULT_URL, callbacks: VitalsCallbacks = {}) {
    this.url = url;
    this.cb = callbacks;
  }

  get currentStatus(): VitalsStatus {
    return this.status;
  }

  private setStatus(status: VitalsStatus) {
    this.status = status;
    this.cb.onStatus?.(status);
  }

  /** Connect and claim a measurement session. Resolves when ready/busy. */
  start(): Promise<'ready' | 'busy' | 'unavailable'> {
    return new Promise((resolve) => {
      if (this.ws) {
        resolve(this.status === 'measuring' ? 'ready' : 'busy');
        return;
      }
      this.intentionalClose = false;
      this.setStatus('connecting');
      let settled = false;
      const done = (result: 'ready' | 'busy' | 'unavailable') => {
        if (!settled) {
          settled = true;
          resolve(result);
        }
      };
      let ws: WebSocket;
      try {
        ws = new WebSocket(this.url);
      } catch {
        this.setStatus('unavailable');
        done('unavailable');
        return;
      }
      const failTimer = setTimeout(() => {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        this.setStatus('unavailable');
        done('unavailable');
      }, 8000);

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'start' }));
      };
      ws.onerror = () => {
        clearTimeout(failTimer);
        this.setStatus('unavailable');
        this.cb.onError?.('Could not reach the vitals service.');
        done('unavailable');
      };
      ws.onclose = () => {
        clearTimeout(failTimer);
        if (!this.intentionalClose && this.status === 'connecting') {
          this.setStatus('unavailable');
          done('unavailable');
        } else if (!this.intentionalClose) {
          this.setStatus('idle');
          this.ws = null;
        }
      };
      ws.onmessage = (event) => {
        let msg: { type?: string; message?: unknown } & Record<string, unknown>;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        switch (msg.type) {
          case 'ready':
            clearTimeout(failTimer);
            this.ws = ws;
            this.setStatus('measuring');
            done('ready');
            break;
          case 'busy':
            clearTimeout(failTimer);
            this.intentionalClose = true;
            try {
              ws.close();
            } catch {
              /* ignore */
            }
            this.setStatus('busy');
            done('busy');
            break;
          case 'vitals':
            this.cb.onReading?.(msg as unknown as VitalsReading);
            break;
          case 'validation':
            this.cb.onValidation?.(msg as unknown as VitalsValidation);
            break;
          case 'error':
            this.cb.onError?.(String(msg.message ?? 'Vitals error'));
            break;
          case 'bye':
            this.setStatus('idle');
            this.ws = null;
            break;
        }
      };
    });
  }

  /** Send one JPEG frame (ArrayBuffer/Blob/Uint8Array). No-op unless measuring. */
  sendFrame(frame: ArrayBuffer | Blob | Uint8Array): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.status !== 'measuring') {
      return false;
    }
    try {
      this.ws.send(frame);
      return true;
    } catch {
      return false;
    }
  }

  /** End the session and close the socket. */
  stop() {
    this.intentionalClose = true;
    try {
      this.ws?.send(JSON.stringify({ type: 'stop' }));
    } catch {
      /* ignore */
    }
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
    this.setStatus('idle');
  }
}
