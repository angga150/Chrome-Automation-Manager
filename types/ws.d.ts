declare module 'ws' {
  import { EventEmitter } from 'events';
  export class WebSocketServer extends EventEmitter {
    constructor(opts: any);
    on(event: string, cb: (...args: any[]) => void): this;
  }
  export class WebSocket extends EventEmitter {
    send(data: any): void;
    terminate(): void;
  }
  export default WebSocket;
}
