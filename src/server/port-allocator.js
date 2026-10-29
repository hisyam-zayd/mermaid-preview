import net from 'node:net';

/**
 * Checks if a specific port is available on localhost (127.0.0.1).
 * @param {number} port
 * @returns {Promise<boolean>}
 */
export function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();

    server.once('error', () => {
      resolve(false);
    });

    server.once('listening', () => {
      server.close(() => {
        resolve(true);
      });
    });

    server.listen(port, '127.0.0.1');
  });
}

/**
 * Finds an available port on localhost, starting from preferredPort.
 * If preferredPort is in use, increments up to maxTries.
 * If all attempts fail, lets OS assign an ephemeral free port (port 0).
 *
 * @param {number} [preferredPort=8765]
 * @param {number} [maxTries=50]
 * @returns {Promise<number>}
 */
export async function findFreePort(preferredPort = 8765, maxTries = 50) {
  for (let attempt = 0; attempt < maxTries; attempt++) {
    const port = preferredPort + attempt;
    if (await isPortAvailable(port)) {
      return port;
    }
  }

  // Fallback: request port 0 (OS automatically assigns an unused port)
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();

    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const freePort = typeof address === 'object' && address ? address.port : 8765;
      server.close(() => resolve(freePort));
    });
  });
}
