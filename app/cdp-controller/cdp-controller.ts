import CDP from 'chrome-remote-interface';
import fetch from 'node-fetch';

export class CDPController {
  private client: any | null = null;
  private port: number;
  private readonly maxReconnectAttempts = 20;
  private readonly reconnectDelayMs = 500;
  private readonly reconnectDelayCapMs = 30_000;

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
        // exponential backoff before retrying endpoint readiness
        const delay = Math.min(this.reconnectDelayMs * 2 ** (attempt - 1), this.reconnectDelayCapMs);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      try {
        await this.connect();
        return;
      } catch (err) {
        // exponential backoff with cap then retry
        const delay = Math.min(this.reconnectDelayMs * 2 ** (attempt - 1), this.reconnectDelayCapMs);
        await new Promise((r) => setTimeout(r, delay));
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

  async evaluate(expression: string): Promise<any> {
    await this.ensureConnected();
    try {
      const { Runtime } = this.client;
      await Runtime.enable();
      const res = await Runtime.evaluate({ expression, returnByValue: true });
      return res?.result?.value;
    } catch (err) {
      this.client = null;
      await this.ensureConnected();
      const { Runtime } = this.client;
      await Runtime.enable();
      const res = await Runtime.evaluate({ expression, returnByValue: true });
      return res?.result?.value;
    }
  }

  async click(selector: string): Promise<void> {
    const script = `(() => {
      const targetSelector = ${JSON.stringify(selector)};
      const candidates = [];

      if (targetSelector) {
        const direct = document.querySelector(targetSelector);
        if (direct) candidates.push(direct);
      }

      const fallbackNodes = Array.from(document.querySelectorAll('button, [role="button"], [data-e2e], div'));
      for (const node of fallbackNodes) {
        const text = [
          node.getAttribute('aria-label'),
          node.getAttribute('title'),
          node.getAttribute('data-e2e'),
          node.textContent || '',
          node.className ? String(node.className) : ''
        ].join(' ').toLowerCase();

        const isLikeTarget = /like|heart|favorite/i.test(text) && /button|role="button"|data-e2e|like|heart/i.test(String(node.tagName || '') + ' ' + (node.getAttribute('aria-label') || '') + ' ' + (node.getAttribute('title') || '') + ' ' + (node.getAttribute('data-e2e') || ''));
        if (isLikeTarget) candidates.push(node);
      }

      const unique = candidates.filter((node, index, arr) => arr.indexOf(node) === index);
      const target = unique[0];
      if (!target) throw new Error('selector not found');
      target.scrollIntoView({ block: 'center', inline: 'center' });
      target.click();
      return true;
    })()`;
    await this.evaluate(script);
  }

  async type(selector: string, text: string): Promise<void> {
    const script = `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error('selector not found'); el.focus(); el.value = ${JSON.stringify(text)}; el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`;
    await this.evaluate(script);
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
