import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeMessage, MessageReader } from '../src/lsp/json-rpc.js';

test('encodeMessage creates valid LSP header and body', () => {
  const payload = { jsonrpc: '2.0', id: 1, result: { status: 'ok' } };
  const encoded = encodeMessage(payload);

  assert.match(encoded, /^Content-Length: \d+\r\n\r\n/);
  const body = encoded.split('\r\n\r\n')[1];
  assert.deepEqual(JSON.parse(body), payload);
});

test('MessageReader parses a single complete frame', async () => {
  const reader = new MessageReader();
  const payload = { jsonrpc: '2.0', method: 'test/notification', params: { foo: 'bar' } };
  const encoded = encodeMessage(payload);

  const received = [];
  reader.on('message', (msg) => received.push(msg));

  reader.write(Buffer.from(encoded));

  assert.equal(received.length, 1);
  assert.deepEqual(received[0], payload);
});

test('MessageReader handles fragmented chunk arrival', async () => {
  const reader = new MessageReader();
  const payload = { jsonrpc: '2.0', id: 42, method: 'initialize' };
  const encoded = encodeMessage(payload);

  const received = [];
  reader.on('message', (msg) => received.push(msg));

  // Split into 3 tiny byte chunks
  const p1 = encoded.slice(0, 10);
  const p2 = encoded.slice(10, 25);
  const p3 = encoded.slice(25);

  reader.write(p1);
  assert.equal(received.length, 0, 'Should not emit on incomplete chunk');

  reader.write(p2);
  assert.equal(received.length, 0, 'Should not emit on incomplete chunk');

  reader.write(p3);
  assert.equal(received.length, 1, 'Should emit once full body arrives');
  assert.deepEqual(received[0], payload);
});

test('MessageReader parses multiple frames in a single incoming buffer', async () => {
  const reader = new MessageReader();
  const msg1 = { jsonrpc: '2.0', id: 1, method: 'first' };
  const msg2 = { jsonrpc: '2.0', id: 2, method: 'second' };

  const combined = encodeMessage(msg1) + encodeMessage(msg2);

  const received = [];
  reader.on('message', (msg) => received.push(msg));

  reader.write(combined);

  assert.equal(received.length, 2);
  assert.deepEqual(received[0], msg1);
  assert.deepEqual(received[1], msg2);
});
