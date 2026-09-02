export type SessionState =
  | 'CREATED'
  | 'STARTING'
  | 'RUNNING'
  | 'ERROR'
  | 'RECOVERING'
  | 'STOPPING'
  | 'STOPPED';

export interface ChromeLaunchOptions {
  profilePath: string;
  debugPort: number;
  userDataDir?: string;
  sessionId: string;
}

export interface ChromeProcessInfo {
  pid: number;
  port: number;
  profilePath: string;
  userDataDir: string;
  startedAt: Date;
}

export interface ProfileInfo {
  sessionId: string;
  profilePath: string;
  createdAt: Date;
}
