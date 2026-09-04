export type TikTokSessionConfig = {
  sessionId: string;
  username?: string;
  profilePath: string;
  port?: number;
  loginUrl: string;
  targetUrl?: string;
  status: 'idle' | 'running' | 'login-required' | 'error';
  createdAt: string;
};

export type TikTokWorkflowStep = {
  action: 'navigate' | 'click' | 'type' | 'wait' | 'screenshot';
  selector?: string;
  url?: string;
  text?: string;
  timeoutMs?: number;
  description?: string;
};

export type TikTokQueueItem = {
  id: string;
  sessionId: string;
  action: string;
  payload: Record<string, any>;
  createdAt: string;
};

export function createTikTokSessionConfig(sessionId: string, username?: string, port?: number): TikTokSessionConfig {
  return {
    sessionId,
    username,
    profilePath: `data/profiles/${sessionId}`,
    port,
    loginUrl: 'https://www.tiktok.com/login',
    targetUrl: 'https://www.tiktok.com',
    status: 'idle',
    createdAt: new Date().toISOString(),
  };
}

export function buildTikTokLoginWorkflow(sessionId: string, username?: string): TikTokWorkflowStep[] {
  const selectorHints = {
    loginButton: 'a[href*="/login"]',
    usernameInput: 'input[name="username"], input[type="text"]',
    passwordInput: 'input[type="password"]',
    submitButton: 'button[type="submit"], button:has-text("Log in")',
    profileButton: 'a[href*="/@"]',
  };

  return [
    {
      action: 'navigate',
      url: 'https://www.tiktok.com',
      description: `Open TikTok landing page for session ${sessionId}`,
    },
    {
      action: 'wait',
      timeoutMs: 3000,
      description: 'Allow the page to finish initial render before checking login state',
    },
    {
      action: 'click',
      selector: selectorHints.loginButton,
      description: username ? `Open login flow for ${username}` : 'Open login flow if account is not already authenticated',
    },
    {
      action: 'type',
      selector: selectorHints.usernameInput,
      text: username ?? '',
      description: 'Enter username or email used by the TikTok account',
    },
    {
      action: 'type',
      selector: selectorHints.passwordInput,
      text: '[REDACTED]',
      description: 'Password is expected to be supplied by a secure credential provider',
    },
    {
      action: 'click',
      selector: selectorHints.submitButton,
      description: 'Submit the login form',
    },
    {
      action: 'wait',
      timeoutMs: 5000,
      description: 'Wait for successful redirect to the authenticated dashboard or home feed',
    },
    {
      action: 'screenshot',
      description: `Capture final state for session ${sessionId}`,
    },
  ];
}

export class MultiAccountQueue {
  private readonly items: TikTokQueueItem[] = [];

  enqueue(sessionId: string, action: string, payload: Record<string, any> = {}): TikTokQueueItem {
    const item: TikTokQueueItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sessionId,
      action,
      payload,
      createdAt: new Date().toISOString(),
    };

    this.items.push(item);
    return item;
  }

  dequeue(): TikTokQueueItem | null {
    return this.items.shift() ?? null;
  }

  peek(): TikTokQueueItem | null {
    return this.items[0] ?? null;
  }

  pendingForSession(sessionId: string): TikTokQueueItem[] {
    return this.items.filter((item) => item.sessionId === sessionId);
  }

  size(): number {
    return this.items.length;
  }

  clear(): void {
    this.items.length = 0;
  }
}
