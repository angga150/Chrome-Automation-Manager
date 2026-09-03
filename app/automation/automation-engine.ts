import { CDPController } from '../cdp-controller/cdp-controller.js';

export type ScreenshotOptions = { format?: 'png' | 'jpeg' | 'webp' };

export class AutomationEngine {
  private ctrl: CDPController;

  private constructor(ctrl: CDPController) {
    this.ctrl = ctrl;
  }

  static async connect(port: number): Promise<AutomationEngine> {
    const ctrl = await CDPController.create(port);
    return new AutomationEngine(ctrl);
  }

  async navigate(url: string): Promise<void> {
    await this.ctrl.navigate(url);
  }

  async evaluate(expression: string): Promise<any> {
    return this.ctrl.evaluate(expression);
  }

  async click(selector: string): Promise<void> {
    return this.ctrl.click(selector);
  }

  async type(selector: string, text: string): Promise<void> {
    return this.ctrl.type(selector, text);
  }

  async screenshot(options: ScreenshotOptions = { format: 'png' }): Promise<Buffer> {
    return this.ctrl.screenshot({ format: options.format as any });
  }

  async close(): Promise<void> {
    await this.ctrl.close();
  }
}

export default AutomationEngine;
