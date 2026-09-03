import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const ALERT_FILE = 'logs/alerts.log';

async function ensureDir() {
  try { await mkdir(dirname(ALERT_FILE), { recursive: true }); } catch {}
}

export async function alert(message: string): Promise<void> {
  const line = `[${new Date().toISOString()}] ALERT: ${message}\n`;
  try {
    await ensureDir();
    await appendFile(ALERT_FILE, line, 'utf8');
  } catch {}
  console.error(line.trim());
}

export default { alert };
