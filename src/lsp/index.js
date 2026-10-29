import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PreviewServer } from '../server/index.js';
import { validateMermaid } from '../server/validator.js';
import { MessageReader, encodeMessage } from './json-rpc.js';

export class MermaidLanguageServer {
  constructor(options = {}) {
    this.inStream = options.inStream || process.stdin;
    this.outStream = options.outStream || process.stdout;
    this.previewServer = options.previewServer || new PreviewServer();
    this.reader = new MessageReader();

    this.documents = new Map(); // uri -> content
    this.activeUri = null;
    this.isServerRunning = false;
    this.nextRequestId = 1;

    this.reader.on('message', this.handleMessage.bind(this));
    this.inStream.pipe(this.reader);
  }

  /**
   * Dispatches incoming JSON-RPC requests and notifications.
   * @param {object} msg
   */
  async handleMessage(msg) {
    if (typeof msg.id !== 'undefined') {
      // It's a Request (requires a response with same ID)
      try {
        const result = await this.handleRequest(msg.method, msg.params);
        this.sendResponse(msg.id, result);
      } catch (err) {
        this.sendError(msg.id, err.code || -32603, err.message || 'Internal error');
      }
    } else if (msg.method) {
      // It's a Notification
      await this.handleNotification(msg.method, msg.params);
    }
  }

  async handleRequest(method, params) {
    switch (method) {
      case 'initialize':
        return {
          capabilities: {
            textDocumentSync: 1, // Full document sync (1)
            codeActionProvider: true,
            executeCommandProvider: {
              commands: ['mermaid.openPreview'],
            },
          },
          serverInfo: {
            name: 'mermaid-lsp',
            version: '0.1.0',
          },
        };

      case 'shutdown':
        if (this.previewServer) {
          await this.previewServer.close();
          this.isServerRunning = false;
        }
        return null;

      case 'textDocument/codeAction': {
        const uri = params?.textDocument?.uri || this.activeUri;
        return [
          {
            title: 'Open Mermaid Diagram Preview',
            command: {
              title: 'Open Mermaid Diagram Preview',
              command: 'mermaid.openPreview',
              arguments: [uri],
            },
          },
        ];
      }

      case 'workspace/executeCommand': {
        if (params?.command === 'mermaid.openPreview') {
          await this._ensureServerStarted();

          const port = this.previewServer.port;
          const previewUrl = `http://localhost:${port}`;

          // Request Zed client to open the URL in the OS default browser
          this.sendRequest('window/showDocument', {
            uri: previewUrl,
            external: true,
            takeFocus: true,
          });

          // Show in-editor toast notification
          this.sendNotification('window/showMessage', {
            type: 3, // Info
            message: `Mermaid Preview opened at ${previewUrl}`,
          });

          return { success: true, url: previewUrl, port };
        }
        throw new Error(`Unknown command: ${params?.command}`);
      }

      default:
        throw new Error(`Method not found: ${method}`);
    }
  }

  async handleNotification(method, params) {
    switch (method) {
      case 'initialized':
        await this._ensureServerStarted();
        break;

      case 'textDocument/didOpen': {
        const { uri, text } = params.textDocument;
        this.documents.set(uri, text);
        this.activeUri = uri;

        const filename = this._extractFilename(uri);
        await this._ensureServerStarted();
        await this.previewServer.updateContent(filename, text);
        await this._publishDiagnostics(uri, text);
        break;
      }

      case 'textDocument/didChange': {
        const { uri } = params.textDocument;
        const text = params.contentChanges[0]?.text ?? '';
        this.documents.set(uri, text);
        this.activeUri = uri;

        const filename = this._extractFilename(uri);
        await this._ensureServerStarted();
        await this.previewServer.updateContent(filename, text);
        await this._publishDiagnostics(uri, text);
        break;
      }

      case 'textDocument/didSave': {
        const { uri, text } = params.textDocument;
        if (text) {
          this.documents.set(uri, text);
          const filename = this._extractFilename(uri);
          await this.previewServer.updateContent(filename, text);
          await this._publishDiagnostics(uri, text);
        }
        break;
      }

      case 'textDocument/didClose': {
        this.documents.delete(params.textDocument.uri);
        break;
      }

      case 'exit':
        if (this.previewServer) {
          await this.previewServer.close();
        }
        break;
    }
  }

  async _ensureServerStarted() {
    if (!this.isServerRunning) {
      const initialFile = this.activeUri ? this._extractFilename(this.activeUri) : 'untitled.mmd';
      const initialContent = this.activeUri ? this.documents.get(this.activeUri) : '';
      if (initialFile) this.previewServer.currentFile = initialFile;
      if (initialContent) this.previewServer.currentContent = initialContent;

      await this.previewServer.start();
      this.isServerRunning = true;
    }
  }

  async _publishDiagnostics(uri, code) {
    const validation = await validateMermaid(code);
    const diagnostics = [];

    if (!validation.valid && validation.error) {
      const line = Math.max(0, (validation.error.line || 1) - 1); // 0-indexed in LSP
      const char = validation.error.column || 0;

      diagnostics.push({
        range: {
          start: { line, character: char },
          end: { line, character: char + 50 },
        },
        severity: 1, // 1 = Error in LSP
        source: 'mermaid',
        message: validation.error.message || 'Syntax error',
      });
    }

    this.sendNotification('textDocument/publishDiagnostics', {
      uri,
      diagnostics,
    });
  }

  _extractFilename(uri) {
    if (!uri) return 'untitled.mmd';
    if (uri.startsWith('file://')) {
      try {
        return path.basename(fileURLToPath(uri));
      } catch {
        return path.basename(uri);
      }
    }
    return path.basename(uri);
  }

  sendResponse(id, result) {
    this._write({ jsonrpc: '2.0', id, result });
  }

  sendError(id, code, message) {
    this._write({ jsonrpc: '2.0', id, error: { code, message } });
  }

  sendNotification(method, params) {
    this._write({ jsonrpc: '2.0', method, params });
  }

  sendRequest(method, params) {
    const id = this.nextRequestId++;
    this._write({ jsonrpc: '2.0', id, method, params });
    return id;
  }

  _write(msg) {
    const raw = encodeMessage(msg);
    this.outStream.write(raw);
  }
}

// Auto-run if executed directly as main script
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  new MermaidLanguageServer();
}
