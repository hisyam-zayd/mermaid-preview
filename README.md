# Mermaid Preview for Zed

Zero-config, high-fidelity interactive live preview and language support for **Mermaid** diagrams (`.mmd`, `.mermaid`) in the [Zed code editor](https://zed.dev).

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

## Running in Zed as a Development Extension

Since this extension is in active development and not yet published to the official Zed Extension Registry, you can load and run it directly as a **Development Extension**.

### Option A: Running Locally (Code and Zed on macOS / Linux)
1. Clone this repository:
   ```bash
   git clone https://github.com/hisyamzayd/mermaid-preview.git
   cd mermaid-preview
   npm install
   ```
2. Open **Zed**.
3. Open the Command Palette (`Cmd + Shift + P` on macOS / `Ctrl + Shift + P` on Linux).
4. Type and select: **`Extensions: Install Development Extension`**.
5. Select this repository folder (`mermaid-preview`).
6. Zed will load the extension and activate it for all `.mmd` and `.mermaid` files.

---

### Option B: Running via Zed Remote SSH (MacBook Client $\longleftrightarrow$ Remote Ubuntu Host)
If your code lives on a remote Ubuntu machine and you connect via Zed Remote on your MacBook:

1. **Install dependencies on the remote host:**
   ```bash
   cd /path/to/mermaid-preview
   npm install
   ```
2. **Configure Zed Port Forwarding:**
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
3. **Load the Development Extension:**
   * In your remote Zed window, press `Cmd + Shift + P`.
   * Select: **`Extensions: Install Development Extension`**.
   * Select the repository path on the remote host.

---

## How to Use

1. Open or create any `.mmd` or `.mermaid` file in Zed.
2. Press **`Cmd + .`** (or click the lightbulb icon in the editor margin).
3. Select **`Open Mermaid Diagram Preview`**.
4. Zed automatically launches your default browser at `http://localhost:<port>` showing your live diagram.
5. As you type in Zed, the diagram renders live beside you.

---

## Development & Automated Tests

Run the full automated test suite (unit tests, integration tests, and end-to-end LSP workflows):

```bash
npm test
```

### Test Coverage (26 Passing Tests)
* ✅ **Port Allocator:** Verifies automatic free port binding and avoidance of port collisions.
* ✅ **Validator:** Tests syntax verification across flowcharts, sequence diagrams, and broken code.
* ✅ **Server Integration:** Verifies HTTP static serving, security path isolation, and WebSocket streaming.
* ✅ **LSP Protocol:** Validates JSON-RPC framing, initialize handshake, diagnostics reporting, and `window/showDocument` execution.
* ✅ **Full E2E Workflow:** Tests complete pipeline from document open to browser WebSocket sync and real-time edits.

---

## Built Alongside Gemini 3.8 Flash (High)

This extension was designed and developed through AI-human pair programming alongside **Gemini 3.8 Flash (High)**. 

* For the complete user prompts, architectural debate logs, and feature-slicing specifications that shaped this project, see **[DEVELOPMENT-PROMPTS.md](DEVELOPMENT-PROMPTS.md)**.
* **Contributions & Feedback:** Any bug reports, syntax edge cases, performance improvements, or additional feature requests are warmly welcomed! Please feel free to open an issue or submit a pull request.

---

## Trademark Disclaimer

Mermaid is an open-source project created by Knut Sveidqvist and contributors under the MIT License. This extension is an independent community project and is not officially affiliated with, sponsored by, or endorsed by the Mermaid.js team or Zed Industries.

---

## License

[MIT License](LICENSE) © 2026 Hisyam Zayd
