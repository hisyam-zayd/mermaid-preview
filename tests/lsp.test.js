import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { MermaidLanguageServer } from '../src/lsp/index.js';
import { PreviewServer } from '../src/server/index.js';
import { encodeMessage, MessageReader } from '../src/lsp/json-rpc.js';

function createTestLspHarness() {
  const clientToLsp = new PassThrough();
  const lspToClient = new PassThrough();

  const reader = new MessageReader();
  lspToClient.pipe(reader);

  const previewServer = new PreviewServer({ port: 0 });

  const server = new MermaidLanguageServer({
    inStream: clientToLsp,
    outStream: lspToClient,
    previewServer,
    watchdogTimeoutMs: 50,
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

  const close = async () => {
    if (server.watchdogTimer) {
      clearTimeout(server.watchdogTimer);
      server.watchdogTimer = null;
    }
    if (server.previewServer) {
      await server.previewServer.close();
    }
    clientToLsp.end();
    lspToClient.end();
  };

  return { server, send, waitForMessage, close };
}

test('MermaidLanguageServer initialize handshake', async () => {
  const { server, send, waitForMessage, close } = createTestLspHarness();

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

  await close();
});

test('MermaidLanguageServer codeAction provider returns preview action', async () => {
  const { server, send, waitForMessage, close } = createTestLspHarness();

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

  await close();
});

test('MermaidLanguageServer diagnostics generation and clearing', async () => {
  const { server, send, waitForMessage, close } = createTestLspHarness();

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

  await close();
});

test('MermaidLanguageServer executeCommand triggers window/showDocument', async () => {
  const { server, send, waitForMessage, close } = createTestLspHarness();

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

  await close();
});

test('MermaidLanguageServer remote watchdog does NOT alert when client connects', async () => {
  const origSsh = process.env.SSH_CLIENT;
  process.env.SSH_CLIENT = '192.168.1.100 50000 22';

  const { server, send, waitForMessage, close } = createTestLspHarness();

  const infoMessagePromise = waitForMessage(
    (m) => m.method === 'window/showMessage' && m.params.type === 3
  );

  send({
    jsonrpc: '2.0',
    id: 8,
    method: 'workspace/executeCommand',
    params: {
      command: 'mermaid.openPreview',
      arguments: ['file:///workspace/diagram.mmd'],
    },
  });

  await infoMessagePromise;

  // Simulate client connection within timeout window
  server.previewServer.lastClientConnectionTime = Date.now() + 500;

  let receivedError = false;
  const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 80));
  waitForMessage((m) => m.method === 'window/showMessage' && m.params.type === 1, 80)
    .then(() => { receivedError = true; })
    .catch(() => {});

  await timeoutPromise;
  assert.equal(receivedError, false, 'Should not send error toast when client connected');

  if (origSsh !== undefined) {
    process.env.SSH_CLIENT = origSsh;
  } else {
    delete process.env.SSH_CLIENT;
  }

  await close();
});

test('MermaidLanguageServer handles codeAction/resolve, shutdown, and unknown commands', async () => {
  const { server, send, waitForMessage, close } = createTestLspHarness();

  // 1. codeAction/resolve
  const resolvePromise = waitForMessage((m) => m.id === 20);
  send({
    jsonrpc: '2.0',
    id: 20,
    method: 'codeAction/resolve',
    params: { title: 'Resolve test' },
  });
  const resolved = await resolvePromise;
  assert.deepEqual(resolved.result, { title: 'Resolve test' });

  // 2. Unknown command in workspace/executeCommand -> Error response
  const errPromise = waitForMessage((m) => m.id === 21);
  send({
    jsonrpc: '2.0',
    id: 21,
    method: 'workspace/executeCommand',
    params: { command: 'nonexistent.command' },
  });
  const errRes = await errPromise;
  assert.ok(errRes.error);
  assert.match(errRes.error.message, /Unknown command/);

  // 3. shutdown
  const shutdownPromise = waitForMessage((m) => m.id === 22);
  send({
    jsonrpc: '2.0',
    id: 22,
    method: 'shutdown',
  });
  const shutdownRes = await shutdownPromise;
  assert.equal(shutdownRes.result, null);
  assert.equal(server.isServerRunning, false);

  await close();
});

test('MermaidLanguageServer handles didSave, didClose, and exit notifications', async () => {
  const { server, send, close } = createTestLspHarness();

  const docUri = 'file:///workspace/saved-diagram.mmd';

  // didOpen
  send({
    jsonrpc: '2.0',
    method: 'textDocument/didOpen',
    params: {
      textDocument: {
        uri: docUri,
        text: 'flowchart TD\n  A --> B',
      },
    },
  });

  // didSave
  send({
    jsonrpc: '2.0',
    method: 'textDocument/didSave',
    params: {
      textDocument: {
        uri: docUri,
        text: 'flowchart TD\n  A --> B\n  B --> C',
      },
    },
  });

  // didClose
  send({
    jsonrpc: '2.0',
    method: 'textDocument/didClose',
    params: {
      textDocument: { uri: docUri },
    },
  });

  // exit
  send({
    jsonrpc: '2.0',
    method: 'exit',
  });

  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(server.documents.has(docUri), false);
  await close();
});

test('MermaidLanguageServer executeCommand mermaid.showRemoteGuide returns setup guide', async () => {
  const { server, send, waitForMessage, close } = createTestLspHarness();

  const msgPromise = waitForMessage((m) => m.method === 'window/showMessage');
  const cmdResponsePromise = waitForMessage((m) => m.id === 30);

  send({
    jsonrpc: '2.0',
    id: 30,
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

  await close();
});
