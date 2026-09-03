import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const LOG_FILE = 'logs/automation.log';
import { appendFileSync } from 'node:fs';

async function ensureLogDir(): Promise<void> {
  try {
    await mkdir(dirname(LOG_FILE), { recursive: true });
  } catch {}
}

export async function log(level: 'info' | 'warn' | 'error', msg: string): Promise<void> {
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()}: ${msg}\n`;
  try {
    await ensureLogDir();
    await appendFile(LOG_FILE, line, 'utf8');
  } catch {
    // ignore file logging errors
  }
  // Also append a lightweight console-safe line synchronously to ensure visibility
  try { appendFileSync(LOG_FILE, line, 'utf8'); } catch {}
  if (level === 'error') console.error(line.trim());
  else console.log(line.trim());
}

export default { log };
