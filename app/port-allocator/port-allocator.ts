import net from 'node:net';

export class PortAllocator {
  private static readonly MIN_PORT = 9222;
  private static readonly MAX_PORT = 9400;

  static async allocatePort(preferredPort?: number): Promise<number> {
    const candidate = preferredPort ?? this.MIN_PORT;

    if (candidate >= this.MIN_PORT && candidate <= this.MAX_PORT && (await this.isPortAvailable(candidate))) {
      return candidate;
    }

    for (let port = this.MIN_PORT; port <= this.MAX_PORT; port += 1) {
      if (await this.isPortAvailable(port)) {
        return port;
      }
    }

    throw new Error(`No available Chrome debug port found in range ${this.MIN_PORT}-${this.MAX_PORT}`);
  }

  static async isPortAvailable(port: number): Promise<boolean> {
    if (port < 1 || port > 65535) {
      return false;
    }

    return await new Promise<boolean>((resolve) => {
      const server = net.createServer();

      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close(() => resolve(true));
      });

      server.listen(port, '127.0.0.1');
    });
  }
}
