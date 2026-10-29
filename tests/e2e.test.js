import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { WebSocket } from 'ws';
import { MermaidLanguageServer } from '../src/lsp/index.js';
import { encodeMessage, MessageReader } from '../src/lsp/json-rpc.js';

test('Full End-to-End Workflow: LSP -> WebSocket -> Viewport -> Diagnostics', async () => {
  const clientToLsp = new PassThrough();
  const lspToClient = new PassThrough();
  const reader = new MessageReader();
  lspToClient.pipe(reader);

  const server = new MermaidLanguageServer({
    inStream: clientToLsp,
    outStream: lspToClient,
  });

  const send = (msg) => clientToLsp.write(encodeMessage(msg));

  const waitForLspMessage = (predicate, timeoutMs = 3000) => {
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

  let ws = null;

  try {
    // 1. Initialize Handshake
    const initPromise = waitForLspMessage((m) => m.id === 1);
    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { capabilities: {} },
    });
    const initRes = await initPromise;
    assert.equal(initRes.result.capabilities.textDocumentSync, 1);

    // 2. Open a real-world complex diagram (00-unified-master-flow.mmd)
    let realDiagramCode = `
flowchart TD
    subgraph UI_Layer["1. User & Terminal UI"]
        User["User Submits Prompt"]
        CLI["CLI Entrypoint"]
        REPL["Interactive Terminal"]
    end
    subgraph Engine_Layer["2. Core Engine"]
        Parser["JSONL Parser"]
        DAG["DAG Traversal"]
    end
    User --> CLI
    CLI --> Parser
    Parser --> DAG
    `;

    try {
      const candidatePath = path.resolve('ignore-this/diagrams/00-unified-master-flow.mmd');
      const existing = await fs.readFile(candidatePath, 'utf8');
      if (existing) realDiagramCode = existing;
    } catch {
      // fallback to above
    }

    const openDiagPromise = waitForLspMessage(
      (m) => m.method === 'textDocument/publishDiagnostics'
    );

    send({
      jsonrpc: '2.0',
      method: 'textDocument/didOpen',
      params: {
        textDocument: {
          uri: 'file:///workspace/diagrams/00-unified-master-flow.mmd',
          text: realDiagramCode,
        },
      },
    });

    const openDiag = await openDiagPromise;
    assert.equal(openDiag.params.diagnostics.length, 0, 'Complex diagram must parse with 0 syntax errors');

    // 3. Trigger Open Preview Command
    const showDocPromise = waitForLspMessage((m) => m.method === 'window/showDocument');
    send({
      jsonrpc: '2.0',
      id: 10,
      method: 'workspace/executeCommand',
      params: { command: 'mermaid.openPreview' },
    });

    const showDoc = await showDocPromise;
    const match = showDoc.params.uri.match(/http:\/\/localhost:(\d+)/);
    assert.ok(match, 'Must launch preview URL with allocated port');
    const port = parseInt(match[1], 10);

    // 4. Connect Webview Client via WebSocket
    ws = new WebSocket(`ws://localhost:${port}/ws`);
    const wsMessages = [];
    ws.on('message', (raw) => wsMessages.push(JSON.parse(raw.toString())));

    await new Promise((resolve) => ws.once('open', resolve));
    await new Promise((resolve) => setTimeout(resolve, 80));

    const initWs = wsMessages.find((m) => m.type === 'init');
    assert.ok(initWs, 'Browser must receive initial diagram buffer on connection');
    assert.equal(initWs.valid, true);
    assert.match(initWs.content, /flowchart|subgraph|graph/);

    // 5. Simulate user editing code in Zed with a syntax error
    const brokenDiagPromise = waitForLspMessage(
      (m) => m.method === 'textDocument/publishDiagnostics' && m.params.diagnostics.length > 0
    );

    send({
      jsonrpc: '2.0',
      method: 'textDocument/didChange',
      params: {
        textDocument: { uri: 'file:///workspace/diagrams/00-unified-master-flow.mmd' },
        contentChanges: [{ text: 'flowchart TD\n  NodeA --> NodeB[Unclosed label' }],
      },
    });

    const brokenDiag = await brokenDiagPromise;
    assert.equal(brokenDiag.params.diagnostics[0].severity, 1, 'LSP must publish error diagnostic to Zed');

    await new Promise((resolve) => setTimeout(resolve, 80));
    const brokenWs = wsMessages.find((m) => m.type === 'update' && m.valid === false);
    assert.ok(brokenWs, 'WebSocket must inform browser of syntax error to show banner without breaking canvas');

    // 6. Simulate fixing code in Zed
    const fixedDiagPromise = waitForLspMessage(
      (m) => m.method === 'textDocument/publishDiagnostics' && m.params.diagnostics.length === 0
    );

    send({
      jsonrpc: '2.0',
      method: 'textDocument/didChange',
      params: {
        textDocument: { uri: 'file:///workspace/diagrams/00-unified-master-flow.mmd' },
        contentChanges: [{ text: 'flowchart TD\n  NodeA --> NodeB[Fixed Label]' }],
      },
    });

    const fixedDiag = await fixedDiagPromise;
    assert.equal(fixedDiag.params.diagnostics.length, 0, 'LSP must clear diagnostics once fixed');

    await new Promise((resolve) => setTimeout(resolve, 80));
    const fixedWs = wsMessages[wsMessages.length - 1];
    assert.equal(fixedWs.valid, true);
    assert.match(fixedWs.content, /Fixed Label/);
  } finally {
    // 7. Clean Shutdown guaranteed
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
    if (server.previewServer) {
      await server.previewServer.close();
    }
  }
});
