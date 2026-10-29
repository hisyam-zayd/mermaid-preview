import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { findFreePort } from './port-allocator.js';
import { validateMermaid } from './validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEBVIEW_DIR = path.resolve(__dirname, '../webview');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.map': 'application/json',
};

export class PreviewServer {
  constructor(options = {}) {
    this.preferredPort = options.port || 8765;
    this.port = null;
    this.httpServer = null;
    this.wss = null;

    this.currentFile = options.initialFile || 'untitled.mmd';
    this.currentContent = options.initialContent || 'flowchart TD\n    Start --> End';
    this.isValid = true;
    this.lastError = null;
  }

  /**
   * Starts the preview server on a dynamically allocated free port.
   * @returns {Promise<{ port: number, url: string }>}
   */
  async start() {
    this.port = await findFreePort(this.preferredPort);

    // Initial validation
    const validation = await validateMermaid(this.currentContent);
    this.isValid = validation.valid;
    this.lastError = validation.error || null;

    let retries = 5;
    while (retries > 0) {
      this.port = await findFreePort(this.preferredPort);

      this.httpServer = http.createServer(this._handleHttpRequest.bind(this));

      this.wss = new WebSocketServer({
        server: this.httpServer,
        path: '/ws',
      });

      this.wss.on('connection', (socket) => {
        // Send current state immediately upon client connection
        socket.send(
          JSON.stringify({
            type: 'init',
            file: this.currentFile,
            content: this.currentContent,
            valid: this.isValid,
            error: this.lastError,
            port: this.port,
          })
        );

        socket.on('message', (data) => {
          try {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'ping') {
              socket.send(JSON.stringify({ type: 'pong' }));
            } else if (msg.type === 'request_sync') {
              socket.send(
                JSON.stringify({
                  type: 'update',
                  file: this.currentFile,
                  content: this.currentContent,
                  valid: this.isValid,
                  error: this.lastError,
                })
              );
            }
          } catch {
            // ignore malformed client packets
          }
        });
      });

      try {
        await new Promise((resolve, reject) => {
          this.httpServer.once('error', reject);
          this.httpServer.listen(this.port, '127.0.0.1', () => {
            resolve();
          });
        });

        return {
          port: this.port,
          url: `http://localhost:${this.port}`,
        };
      } catch (listenErr) {
        if (listenErr.code === 'EADDRINUSE' && retries > 1) {
          retries--;
          this.preferredPort = this.port + 1;
          if (this.wss) {
            this.wss.close();
          }
          continue;
        }
        throw listenErr;
      }
    }
  }

  /**
   * Updates the current diagram content and broadcasts to all connected webview clients.
   * @param {string} file
   * @param {string} content
   * @returns {Promise<{ valid: boolean, error: object | null }>}
   */
  async updateContent(file, content) {
    this.currentFile = file || this.currentFile;
    this.currentContent = content;

    const validation = await validateMermaid(content);
    this.isValid = validation.valid;
    this.lastError = validation.error || null;

    const payload = JSON.stringify({
      type: 'update',
      file: this.currentFile,
      content: this.currentContent,
      valid: this.isValid,
      error: this.lastError,
    });

    if (this.wss) {
      for (const client of this.wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(payload);
        }
      }
    }

    return {
      valid: this.isValid,
      error: this.lastError,
    };
  }

  /**
   * Serves static webview files with proper MIME types.
   */
  async _handleHttpRequest(req, res) {
    if (req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'text/plain' });
      res.end('Method Not Allowed');
      return;
    }

    const url = new URL(req.url, `http://localhost:${this.port}`);

    // API state endpoint
    if (url.pathname === '/api/state') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          file: this.currentFile,
          content: this.currentContent,
          valid: this.isValid,
          error: this.lastError,
          port: this.port,
        })
      );
      return;
    }

    // Block directory traversal attempts
    if (req.url.includes('..') || url.pathname.includes('..')) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    // Determine target file path
    let relativePath = url.pathname === '/' ? '/index.html' : url.pathname;
    const safePath = path.normalize(relativePath);
    const filePath = path.join(WEBVIEW_DIR, safePath);

    if (!filePath.startsWith(WEBVIEW_DIR)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    try {
      const stat = await fs.stat(filePath);
      if (stat.isDirectory()) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      const content = await fs.readFile(filePath);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
      res.end(content);
    } catch (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      }
    }
  }

  /**
   * Stops the server and terminates all active WebSocket connections.
   * @returns {Promise<void>}
   */
  async close() {
    return new Promise((resolve) => {
      if (this.wss) {
        for (const client of this.wss.clients) {
          client.terminate();
        }
        this.wss.close();
      }

      if (this.httpServer) {
        this.httpServer.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}
