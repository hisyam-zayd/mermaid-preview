# Mermaid Preview for Zed

Zero-config, high-fidelity interactive live preview and language support for **Mermaid** diagrams (`.mmd`, `.mermaid`) in the [Zed code editor](https://zed.dev).

![Mermaid Preview Demo](https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/public/favicon.svg)

---

## Features

* **100% Diagram Fidelity:** Powered by the official `mermaid.js` engine (v12+). Supports flowcharts, sequence diagrams, class diagrams, state machines, ER diagrams, Gantt charts, Git graphs, mindmaps, and directives (`%%{init}%%`).
* **Zero Configuration:** Automatically finds an open local port, serves web assets, and launches your default browser via Zed's native `window/showDocument` LSP protocol.
* **Non-Disruptive Real-Time Sync:** As you edit code in Zed, the diagram updates live via WebSockets without stealing your cursor focus or resetting your scroll position.
* **State-Preserving Viewport Controls:**
  * 🔍 **Fit to Screen:** Instantly scales complex diagrams to fit your display.
  * 🎯 **Center View:** Re-centers without altering current zoom scale.
  * 🔄 **Reset 100%:** Restores natural 1:1 scale.
  * ➕ / ➖ Smooth mouse-wheel & touchpad pinch-to-zoom and click-and-drag panning.
* **Instant Exports:** One-click **Copy SVG** to clipboard or download **High-Res 2x PNG**.
* **In-Editor Syntax Diagnostics:** Pinpoints syntax errors with exact line and column numbers using real-time LSP diagnostics.
* **Remote Dev Ready:** Works seamlessly across remote SSH connections by adding a single port-forward rule in Zed.

---

## Installation

### Local Development Extension (Zed)
1. Clone this repository to your machine:
   ```bash
   git clone https://github.com/hisyamzayd/mermaid-preview.git
   cd mermaid-preview
   npm install
   ```
2. Open Zed.
3. Open the Command Palette (`Cmd + Shift + P` on macOS / `Ctrl + Shift + P` on Linux).
4. Type and select: **`Extensions: Install Development Extension`**.
5. Select the `mermaid-preview` directory.

---

## How to Use

1. Open or create any `.mmd` or `.mermaid` file in Zed.
2. Press **`Cmd + .`** (or click the lightbulb icon in the editor margin).
3. Select **`Open Mermaid Diagram Preview`**.
4. Zed automatically launches your default browser at `http://localhost:<port>` showing your live diagram.
5. As you type in Zed, the diagram renders live beside you.

---

## Remote SSH Development

When connecting to a remote machine (e.g. Linux workstation or cloud server) from your MacBook, you can automatically forward the preview port through Zed's existing SSH session:

In your Zed `settings.json` (`Cmd + Shift + P` $\rightarrow$ `zed: open settings`):

```json
{
  "ssh_connections": [
    {
      "host": "your-remote-host",
      "port_forwards": [
        {
          "local_port": 8765,
          "remote_port": 8765
        }
      ]
    }
  ]
}
```

Now, when you trigger preview on the remote host, open `http://localhost:8765` in Safari or Chrome on your MacBook.

---

## Development & Testing

Run the automated test suite (unit tests, integration tests, and end-to-end LSP workflows):

```bash
npm test
```

### Test Coverage
* ✅ **Port Allocator:** Verifies automatic free port binding and avoidance of port collisions.
* ✅ **Validator:** Tests syntax verification across flowcharts, sequence diagrams, and broken code.
* ✅ **Server Integration:** Verifies HTTP static serving, security path isolation, and WebSocket streaming.
* ✅ **LSP Protocol:** Validates JSON-RPC framing, initialize handshake, diagnostics reporting, and `window/showDocument` execution.
* ✅ **Full E2E Workflow:** Tests complete pipeline from document open to browser WebSocket sync and real-time edits.

---

## License

[MIT License](LICENSE) © 2026 Hisyam Zayd
