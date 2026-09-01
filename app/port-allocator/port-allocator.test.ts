import assert from 'node:assert/strict';
import test from 'node:test';

import { PortAllocator } from './port-allocator.js';

test('PortAllocator.allocatePort returns a free port in the Chrome debug range', async () => {
  const port = await PortAllocator.allocatePort(9222);

  assert.ok(port >= 9222 && port <= 9400, `port should be in range 9222-9400, got ${port}`);
  assert.equal(await PortAllocator.isPortAvailable(port), true);
});
