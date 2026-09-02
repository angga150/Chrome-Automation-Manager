import CDP from 'chrome-remote-interface';
import fetch from 'node-fetch';

export class CDPController {
  private client: any | null = null;
  private port: number;
  private readonly maxReconnectAttempts = 20;
  private readonly reconnectDelayMs = 1000;

  private constructor(port: number) {
    this.port = port;
  }

  static async create(port: number): Promise<CDPController> {
    const c = new CDPController(port);
    await c.connectWithRetry();
    return c;
  }

  private async connect(): Promise<void> {
    this.client = await CDP({ port: this.port });
  }

  private async isEndpointReady(): Promise<boolean> {
    try {
      const res = await fetch(`http://127.0.0.1:${this.port}/json/version`, { signal: AbortSignal.timeout(1500) });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async connectWithRetry(): Promise<void> {
    let attempt = 0;
    while (attempt < this.maxReconnectAttempts) {
      attempt += 1;
      if (!(await this.isEndpointReady())) {
        // wait before retrying endpoint readiness
        await new Promise((r) => setTimeout(r, this.reconnectDelayMs));
        continue;
      }

      try {
        await this.connect();
        return;
      } catch (err) {
        // wait then retry
        await new Promise((r) => setTimeout(r, this.reconnectDelayMs * attempt));
      }
    }

    throw new Error(`Failed to connect to CDP on port ${this.port} after ${this.maxReconnectAttempts} attempts`);
  }

  private async ensureConnected(): Promise<void> {
    if (this.client) return;
    await this.connectWithRetry();
  }

  async navigate(url: string): Promise<void> {
    await this.ensureConnected();
    try {
      const { Page } = this.client;
      await Page.enable();
      await Page.navigate({ url });
      await new Promise<void>((resolve) => {
        const handler = () => resolve();
        Page.loadEventFired(handler);
      });
    } catch (err) {
      // try reconnect once
      this.client = null;
      await this.ensureConnected();
      const { Page } = this.client;
      await Page.enable();
      await Page.navigate({ url });
      await new Promise<void>((resolve) => {
        const handler = () => resolve();
        Page.loadEventFired(handler);
      });
    }
  }

  async screenshot(options?: { format?: 'png' | 'jpeg'; quality?: number }): Promise<Buffer> {
    await this.ensureConnected();
    try {
      const { Page } = this.client;
      await Page.enable();
      const res = await Page.captureScreenshot({ format: options?.format ?? 'png', quality: options?.quality });
      return Buffer.from(res.data, 'base64');
    } catch (err) {
      // reconnect then retry
      this.client = null;
      await this.ensureConnected();
      const { Page } = this.client;
      await Page.enable();
      const res = await Page.captureScreenshot({ format: options?.format ?? 'png', quality: options?.quality });
      return Buffer.from(res.data, 'base64');
    }
  }

  async close(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.close();
    } catch {
      // ignore
    }
    this.client = null;
  }
}
