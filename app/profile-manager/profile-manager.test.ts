import assert from 'node:assert/strict';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ProfileManager } from './profile-manager.js';

test('ProfileManager creates and lists isolated profile directories', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'chrome-manager-profile-'));
  const manager = new ProfileManager(rootDir);

  const profilePath = manager.createProfile('session-a');

  assert.equal(existsSync(profilePath), true);
  assert.ok(manager.listProfiles().includes('session-a'));
  assert.equal(manager.getProfilePath('session-a'), profilePath);
});
