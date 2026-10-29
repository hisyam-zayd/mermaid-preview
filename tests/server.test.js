import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocket } from 'ws';
import { PreviewServer } from '../src/server/index.js';

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
      res.on('error', reject);
    });
  });
}

test('PreviewServer integration lifecycle', async (t) => {
  const server = new PreviewServer({
    port: 19400,
    initialFile: 'master-flow.mmd',
    initialContent: 'flowchart TD\n  Start --> Finish',
  });

  const { port, url } = await server.start();
  assert.ok(port >= 19400, 'Server must start on allocated port');

  await t.test('serves index.html on root', async () => {
    const res = await httpGet(url + '/');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.match(res.body, /Mermaid Live Preview/);
  });

  await t.test('serves state via /api/state', async () => {
    const res = await httpGet(url + '/api/state');
    assert.equal(res.status, 200);
    const state = JSON.parse(res.body);
    assert.equal(state.file, 'master-flow.mmd');
    assert.match(state.content, /Start --> Finish/);
    assert.equal(state.valid, true);
  });

  await t.test('blocks directory traversal attempts', async () => {
    const statusCode = await new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1',
        port,
        path: '/../package.json',
        method: 'GET',
      }, (res) => {
        resolve(res.statusCode);
      });
      req.on('error', reject);
      req.end();
    });
    assert.equal(statusCode, 403);
  });

  await t.test('streams real-time updates via WebSocket', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);

    const messages = [];
    ws.on('message', (raw) => {
      messages.push(JSON.parse(raw.toString()));
    });

    // Wait for connection and initial message
    await new Promise((resolve) => ws.once('open', resolve));
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.equal(messages.length >= 1, true, 'Must receive initial message on connect');
    assert.equal(messages[0].type, 'init');
    assert.equal(messages[0].file, 'master-flow.mmd');

    // Trigger update on server
    const updateResult = await server.updateContent('updated.mmd', 'graph LR\n  Alpha --> Beta');
    assert.equal(updateResult.valid, true);

    await new Promise((resolve) => setTimeout(resolve, 50));

    const updateMsg = messages.find((m) => m.type === 'update' && m.file === 'updated.mmd');
    assert.ok(updateMsg, 'Client must receive update event');
    assert.match(updateMsg.content, /Alpha --> Beta/);

    // Trigger syntax error update
    const errResult = await server.updateContent('broken.mmd', 'graph LR\n  Alpha[Unclosed');
    assert.equal(errResult.valid, false);
    assert.ok(errResult.error);

    await new Promise((resolve) => setTimeout(resolve, 50));

    const errMsg = messages.find((m) => m.file === 'broken.mmd');
    assert.ok(errMsg);
    assert.equal(errMsg.valid, false);

    ws.close();
  });

  // Teardown
  await server.close();
});
