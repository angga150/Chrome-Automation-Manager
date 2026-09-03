import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import AutomationEngine from './automation-engine.js';
import { log } from '../utils/logger.js';
import { alert } from '../utils/alerter.js';
import RecoveryManager from '../session/recovery-manager.js';
import { ChromeManager } from '../chrome-manager/chrome-manager.js';

type WorkflowStep = {
  action: string;
  [key: string]: any;
};

type Workflow = {
  session?: string;
  port?: number;
  steps: WorkflowStep[];
};

export async function runWorkflow(filePath: string, portArg?: number): Promise<void> {
  const raw = await readFile(filePath, 'utf8');
  let workflow: Workflow;

  if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
    try {
      // try dynamic import of `yaml` package
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const YAML = await import('yaml');
      workflow = YAML.parse(raw);
    } catch (e) {
      throw new Error('YAML parser not available. Install the "yaml" package or provide a JSON workflow.');
    }
  } else {
    workflow = JSON.parse(raw) as Workflow;
  }

  const port = portArg ?? workflow.port;
  if (!port) throw new Error('No port provided. Supply a port as CLI arg or in workflow file.');

  let engine;
  try {
    engine = await AutomationEngine.connect(port);
  } catch (err) {
    // Try to recover by restarting Chrome if workflow provides a session
    if (workflow.session) {
      await log('warn', `Initial connect failed; attempting restart for session ${workflow.session} on port ${port}`);

      const profilePath = new (await import('../profile-manager/profile-manager.js')).ProfileManager().getProfilePath(workflow.session);
      const can = await RecoveryManager.canRestart(profilePath);
      if (!can) {
        await alert(`Restart limit exceeded for session ${workflow.session}. Aborting workflow.`);
        throw new Error('Restart limit exceeded');
      }

      try {
        await ChromeManager.restart(workflow.session, port);
        engine = await AutomationEngine.connect(port);
        await log('info', `Reconnected to CDP on port ${port} after restart`);
      } catch (e: any) {
        await alert(`Failed to restart or reconnect for session ${workflow.session}: ${e?.message ?? e}`);
        throw e;
      }
    } else {
      throw err;
    }
  }

  try {
    for (const step of workflow.steps || []) {
      switch (step.action) {
        case 'navigate':
          if (!step.url) throw new Error('navigate step missing url');
          await engine.navigate(step.url);
          break;
        case 'click':
          if (!step.selector) throw new Error('click step missing selector');
          await engine.click(step.selector);
          break;
        case 'type':
          if (!step.selector || typeof step.text === 'undefined') throw new Error('type step missing selector or text');
          await engine.type(step.selector, String(step.text));
          break;
        case 'evaluate': {
          if (!step.expression) throw new Error('evaluate step missing expression');
          const res = await engine.evaluate(step.expression);
          console.log('evaluate result:', res);
          break;
        }
        case 'screenshot': {
          const out = step.out ?? `screenshot-${port}.png`;
          const buf = await engine.screenshot({ format: (step.format as any) ?? 'png' });
          const outPath = path.resolve(process.cwd(), out);
          await writeFile(outPath, buf);
          console.log('screenshot saved:', outPath);
          break;
        }
        default:
          throw new Error(`Unknown action: ${step.action}`);
      }
    }
  } finally {
    await engine.close();
  }
}

export default runWorkflow;
