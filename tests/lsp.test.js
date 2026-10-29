import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { MermaidLanguageServer } from '../src/lsp/index.js';
import { encodeMessage, MessageReader } from '../src/lsp/json-rpc.js';

function createTestLspHarness() {
  const clientToLsp = new PassThrough();
  const lspToClient = new PassThrough();

  const reader = new MessageReader();
  lspToClient.pipe(reader);

  const server = new MermaidLanguageServer({
    inStream: clientToLsp,
    outStream: lspToClient,
  });

  const send = (msg) => clientToLsp.write(encodeMessage(msg));

  const waitForMessage = (predicate, timeoutMs = 2000) => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Timeout waiting for LSP message'));
      }, timeoutMs);

      const onMsg = (msg) => {
        if (predicate(msg)) {
          cleanup();
          resolve(msg);
        }
      };

      const cleanup = () => {
        clearTimeout(timer);
        reader.off('message', onMsg);
      };

      reader.on('message', onMsg);
    });
  };

  return { server, send, waitForMessage };
}

test('MermaidLanguageServer initialize handshake', async () => {
  const { server, send, waitForMessage } = createTestLspHarness();

  const initPromise = waitForMessage((m) => m.id === 1);
  send({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { capabilities: {} },
  });

  const response = await initPromise;
  assert.equal(response.id, 1);
  assert.equal(response.result.capabilities.textDocumentSync, 1);
  assert.ok(response.result.capabilities.codeActionProvider);
  assert.deepEqual(response.result.capabilities.executeCommandProvider.commands, [
    'mermaid.openPreview',
    'mermaid.showRemoteGuide',
  ]);

  await server.previewServer.close();
});

test('MermaidLanguageServer codeAction provider returns preview action', async () => {
  const { server, send, waitForMessage } = createTestLspHarness();

  const actionPromise = waitForMessage((m) => m.id === 2);
  send({
    jsonrpc: '2.0',
    id: 2,
    method: 'textDocument/codeAction',
    params: { textDocument: { uri: 'file:///workspace/diagram.mmd' } },
  });

  const response = await actionPromise;
  assert.equal(response.id, 2);
  assert.ok(Array.isArray(response.result));
  assert.equal(response.result[0].title, 'Open Mermaid Diagram Preview');
  assert.equal(response.result[0].command.command, 'mermaid.openPreview');

  await server.previewServer.close();
});

test('MermaidLanguageServer diagnostics generation and clearing', async () => {
  const { server, send, waitForMessage } = createTestLspHarness();

  // 1. Open broken document -> Expect error diagnostic
  const errorDiagPromise = waitForMessage(
    (m) => m.method === 'textDocument/publishDiagnostics' && m.params.diagnostics.length > 0
  );

  send({
    jsonrpc: '2.0',
    method: 'textDocument/didOpen',
    params: {
      textDocument: {
        uri: 'file:///workspace/test.mmd',
        text: 'flowchart TD\n  A[Broken unclosed',
      },
    },
  });

  const errorDiag = await errorDiagPromise;
  assert.equal(errorDiag.params.uri, 'file:///workspace/test.mmd');
  assert.equal(errorDiag.params.diagnostics[0].severity, 1);
  assert.match(errorDiag.params.diagnostics[0].message, /Parse error|Expecting/);

  // 2. Fix document -> Expect empty diagnostics array (cleared)
  const clearDiagPromise = waitForMessage(
    (m) => m.method === 'textDocument/publishDiagnostics' && m.params.diagnostics.length === 0
  );

  send({
    jsonrpc: '2.0',
    method: 'textDocument/didChange',
    params: {
      textDocument: { uri: 'file:///workspace/test.mmd' },
      contentChanges: [{ text: 'flowchart TD\n  A --> B' }],
    },
  });

  const clearDiag = await clearDiagPromise;
  assert.equal(clearDiag.params.diagnostics.length, 0);

  await server.previewServer.close();
});

test('MermaidLanguageServer executeCommand triggers window/showDocument', async () => {
  const { server, send, waitForMessage } = createTestLspHarness();

  const showDocPromise = waitForMessage((m) => m.method === 'window/showDocument');
  const cmdResponsePromise = waitForMessage((m) => m.id === 5);

  send({
    jsonrpc: '2.0',
    id: 5,
    method: 'workspace/executeCommand',
    params: {
      command: 'mermaid.openPreview',
      arguments: ['file:///workspace/diagram.mmd'],
    },
  });

  const showDoc = await showDocPromise;
  assert.ok(showDoc.params.uri.startsWith('http://localhost:'));
  assert.equal(showDoc.params.external, true, 'Must specify external: true for OS default browser');
  assert.equal(showDoc.params.takeFocus, true);

  const cmdRes = await cmdResponsePromise;
  assert.equal(cmdRes.result.success, true);
  assert.ok(cmdRes.result.port > 0);

  if (server.watchdogTimer) {
    clearTimeout(server.watchdogTimer);
    server.watchdogTimer = null;
  }
  await server.previewServer.close();
});

test('MermaidLanguageServer executeCommand mermaid.showRemoteGuide returns setup guide', async () => {
  const { server, send, waitForMessage } = createTestLspHarness();

  const msgPromise = waitForMessage((m) => m.method === 'window/showMessage');
  const cmdResponsePromise = waitForMessage((m) => m.id === 6);

  send({
    jsonrpc: '2.0',
    id: 6,
    method: 'workspace/executeCommand',
    params: {
      command: 'mermaid.showRemoteGuide',
      arguments: [8765],
    },
  });

  const msg = await msgPromise;
  assert.ok(msg.params.message.includes('ssh_connections'));
  assert.ok(msg.params.message.includes('port_forwards'));

  const cmdRes = await cmdResponsePromise;
  assert.equal(cmdRes.result.success, true);
  assert.equal(cmdRes.result.port, 8765);

  await server.previewServer.close();
});

test('MermaidLanguageServer remote watchdog alerts user if no browser client connects', async () => {
  const origSsh = process.env.SSH_CLIENT;
  process.env.SSH_CLIENT = '192.168.1.100 50000 22';

  const { server, send, waitForMessage } = createTestLspHarness();
  server.watchdogTimeoutMs = 60; // fast timeout for test

  const errorAlertPromise = waitForMessage(
    (m) => m.method === 'window/showMessage' && m.params.type === 1
  );

  send({
    jsonrpc: '2.0',
    id: 7,
    method: 'workspace/executeCommand',
    params: {
      command: 'mermaid.openPreview',
      arguments: ['file:///workspace/diagram.mmd'],
    },
  });

  const errorAlert = await errorAlertPromise;
  assert.equal(errorAlert.params.type, 1, 'Type 1 is LSP Error severity');
  assert.ok(errorAlert.params.message.includes('No connection received on port'));
  assert.ok(errorAlert.params.message.includes('ssh -L'));

  if (origSsh !== undefined) {
    process.env.SSH_CLIENT = origSsh;
  } else {
    delete process.env.SSH_CLIENT;
  }

  if (server.watchdogTimer) {
    clearTimeout(server.watchdogTimer);
    server.watchdogTimer = null;
  }
  await server.previewServer.close();
});
