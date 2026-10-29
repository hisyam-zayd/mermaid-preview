import { Writable } from 'node:stream';

/**
 * Encodes a JavaScript object into a JSON-RPC 2.0 message frame.
 * @param {object} payload
 * @returns {string}
 */
export function encodeMessage(payload) {
  const json = JSON.stringify(payload);
  const byteLength = Buffer.byteLength(json, 'utf8');
  return `Content-Length: ${byteLength}\r\n\r\n${json}`;
}

/**
 * Writable stream decoder for JSON-RPC 2.0 frames with Content-Length headers.
 */
export class MessageReader extends Writable {
  constructor(options = {}) {
    super(options);
    this.buffer = Buffer.alloc(0);
    this.contentLength = null;
  }

  _write(chunk, encoding, callback) {
    this.pushChunk(chunk);
    callback();
  }

  /**
   * Pushes raw incoming bytes.
   * @param {Buffer | string} chunk
   */
  pushChunk(chunk) {
    const chunkBuffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    this.buffer = Buffer.concat([this.buffer, chunkBuffer]);
    this._processBuffer();
  }

  _processBuffer() {
    while (true) {
      if (this.contentLength === null) {
        // Look for \r\n\r\n delimiter indicating end of headers
        const headerEnd = this.buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) {
          return; // Incomplete header, wait for more chunks
        }

        const headerText = this.buffer.subarray(0, headerEnd).toString('ascii');
        const match = headerText.match(/Content-Length:\s*(\d+)/i);
        if (!match) {
          // Malformed header: skip past separator to recover
          this.buffer = this.buffer.subarray(headerEnd + 4);
          continue;
        }

        this.contentLength = parseInt(match[1], 10);
        this.buffer = this.buffer.subarray(headerEnd + 4);
      }

      // Check if full JSON body has arrived
      if (this.buffer.length < this.contentLength) {
        return; // Incomplete body, wait for more chunks
      }

      const bodyBuffer = this.buffer.subarray(0, this.contentLength);
      this.buffer = this.buffer.subarray(this.contentLength);
      const expectedLength = this.contentLength;
      this.contentLength = null;

      try {
        const json = JSON.parse(bodyBuffer.toString('utf8'));
        this.emit('message', json);
      } catch (err) {
        this.emit('error', new Error(`Failed to parse JSON body of length ${expectedLength}: ${err.message}`));
      }
    }
  }
}
