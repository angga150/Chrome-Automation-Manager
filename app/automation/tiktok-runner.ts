import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import AutomationEngine from './automation-engine.js';
import { buildTikTokLoginWorkflow, type TikTokSessionConfig, type TikTokWorkflowStep } from './tiktok-workflow.js';

export type TikTokCredentials = {
  username?: string;
  password?: string;
};

export type TikTokRunResult = {
  sessionId: string;
  port: number;
  status: 'success' | 'error';
  stepsCompleted: number;
  screenshotPath?: string;
  startedAt: string;
  finishedAt: string;
};

export class TikTokRunner {
  constructor(private readonly config: TikTokSessionConfig, private readonly credentialProvider?: (sessionId: string) => Promise<TikTokCredentials> | TikTokCredentials) {}

  async resolveCredentials(overrides: Partial<TikTokCredentials> = {}): Promise<TikTokCredentials> {
    const username = overrides.username ?? this.config.username ?? process.env.TIKTOK_USERNAME ?? process.env.TIKTOK_EMAIL ?? undefined;
    const password = overrides.password ?? process.env.TIKTOK_PASSWORD ?? undefined;

    return {
      username: username && username.trim() ? username.trim() : undefined,
      password: password && password.trim() && password !== '[REDACTED]' ? password.trim() : undefined,
    };
  }

  buildExecutionPlan(overrides: Partial<TikTokCredentials> = {}): TikTokWorkflowStep[] {
    const resolvedUsername = overrides.username ?? this.config.username ?? process.env.TIKTOK_USERNAME ?? process.env.TIKTOK_EMAIL ?? undefined;
    const plan = buildTikTokLoginWorkflow(this.config.sessionId, resolvedUsername);

    return plan.map((step) => {
      if (step.action === 'type' && step.text === '[REDACTED]') {
        return {
          ...step,
          text: undefined,
        };
      }
      return step;
    });
  }

  async executeWorkflow(port: number, overrides: Partial<TikTokCredentials> = {}): Promise<TikTokRunResult> {
    const startedAt = new Date().toISOString();
    const engine = await AutomationEngine.connect(port);
    const result: TikTokRunResult = {
      sessionId: this.config.sessionId,
      port,
      status: 'success',
      stepsCompleted: 0,
      startedAt,
      finishedAt: startedAt,
    };

    try {
      const creds = await this.resolveCredentials(overrides);
      const plan = this.buildExecutionPlan(overrides);

      for (const step of plan) {
        if (step.action === 'navigate' && step.url) {
          await engine.navigate(step.url);
        } else if (step.action === 'click' && step.selector) {
          await engine.click(step.selector);
        } else if (step.action === 'type' && step.selector) {
          const resolvedText = step.text ?? (step.selector.includes('password') ? creds.password : creds.username);
          if (!resolvedText || resolvedText === '[REDACTED]' || resolvedText === 'undefined') {
            continue;
          }
          await engine.type(step.selector, String(resolvedText));
        } else if (step.action === 'wait' && typeof step.timeoutMs === 'number') {
          await new Promise((resolve) => setTimeout(resolve, step.timeoutMs));
        } else if (step.action === 'screenshot') {
          const outPath = path.resolve(process.cwd(), `${this.config.sessionId}-tiktok.png`);
          const buf = await engine.screenshot({ format: 'png' });
          await writeFile(outPath, buf);
          result.screenshotPath = outPath;
        }

        result.stepsCompleted += 1;
      }
    } catch (error) {
      result.status = 'error';
      result.finishedAt = new Date().toISOString();
      throw error;
    }

    result.finishedAt = new Date().toISOString();
    await engine.close();
    return result;
  }
}

export default TikTokRunner;
