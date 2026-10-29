import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { isPortAvailable, findFreePort } from '../src/server/port-allocator.js';

test('isPortAvailable correctly detects free vs bound port', async () => {
  // Test a known ephemeral port
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const boundPort = server.address().port;

  const isAvailableWhenBound = await isPortAvailable(boundPort);
  assert.equal(isAvailableWhenBound, false, 'Bound port should NOT be available');

  // Close server
  await new Promise((resolve) => server.close(resolve));

  const isAvailableAfterClose = await isPortAvailable(boundPort);
  assert.equal(isAvailableAfterClose, true, 'Closed port should be available');
});

test('findFreePort returns an available port on localhost', async () => {
  const port = await findFreePort(19200);
  assert.ok(typeof port === 'number' && port > 1024, 'Port must be a valid integer > 1024');

  const available = await isPortAvailable(port);
  assert.equal(available, true, 'Returned port must be immediately bindable');
});

test('findFreePort skips already occupied ports', async () => {
  // Occupy port 19300
  const server = net.createServer();
  await new Promise((resolve) => server.listen(19300, '127.0.0.1', resolve));

  const freePort = await findFreePort(19300);
  assert.notEqual(freePort, 19300, 'Must not return the occupied port');
  assert.ok(freePort > 19300, 'Should increment to next free port');

  await new Promise((resolve) => server.close(resolve));
});
