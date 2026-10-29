# Development Prompts, Architecture Decisions & Specification Log

This document records the exact user prompts, architectural debates, design principles, and feature-driven decisions that guided the creation of **Mermaid Preview for Zed**.

---

## 1. The Core Problem & Initial Prompt

### User Context
> *"currently antigravity is opened inside terminal of zed ide that i do open via remote. so currently im on macbook, meanwhile this repo is inside my ubuntu machine that located at home.*  
> *i just check the extension list of zed, and its not yet support for mermaid file for ui or webview that show most optimized diagram looks. and i just did research that zed not support api webview for its ide (not like vscode). but i also did research that my goal is still achieveble by showing native ui. but i am not yet know how to achieve that if i was using zed remotely so both worked remotely and local.*  
> *please do research and analyzis"*

### Architectural Findings
1. **Zed vs. VS Code:** VS Code runs inside Chromium (Electron), making webviews trivial (`vscode.window.createWebviewPanel`). Zed runs directly on native GPU shaders (Metal/Vulkan) via **GPUI** and intentionally excludes webviews to maintain 120 FPS performance and low memory.
2. **Third-Party UI Restriction:** Zed extensions run in a WebAssembly sandbox (`wasm32-wasip1/wasip2`) and currently have no API to inject custom GUI panels, tabs, or webviews into the editor workspace.
3. **Zed Remote Development Split:** 
   * **MacBook (Client):** Owns all UI rendering (Metal GPU), window management, and display.
   * **Ubuntu (Remote Host):** Runs headless `zed-remote-server` over SSH, managing files, terminals, and Language Servers (LSPs).

---

## 2. Rejecting Compromises & Choosing Localhost Webview

### User Feedback on Workarounds
> *"- for zed native markdown preview or md, the output is not that perfect. and sometimes the diagram result is not showing. so thats why i make initiative to make my own"*  
> *"- interesting to compile it into svg. but i think this is not challenging enough, beside, the result is not make user gain full control of it"*  
> *"- i prefer native webview or native display on user host machine (ide machine, so code if remote stays in remote just send rpc over ssh). what do you think?"*

### Why the User Rejected Previous Workarounds:
* **Built-in `mermaid-rs-renderer`:** Incomplete Rust reverse-engineered port; frequently chokes on subgraphs, state machines, directives (`%%{init}%%`), and complex flowcharts.
* **Pre-compiling to Static SVG:** Loses interactive controls (no pan, no pinch-to-zoom, no reset/fit, no live responsive theme matching).

---

## 3. The Transport Dilemma: No SSH Config Pollution

### User Pushback on Configuration
> *"hm do i need to add line to ~/.ssh/config? why? i dont want this. as zed connect to remote, the ssh already connected right? do not talk about the phase first, lets settle the architecture first"*

### Architectural Resolution:
* **Zero System Config Pollution:** The user firmly rejected modifying global `~/.ssh/config`.
* **Zed-Native Port Forwarding:** Zed remote provides native port forwarding inside `settings.json` (`ssh_connections` → `port_forwards`), utilizing the active Zed SSH tunnel without touching system-level SSH configuration files.
* **The Stdio vs. Localhost Analysis:** While an SSH Stdio pipe avoids ports, a native desktop wrapper would add immense platform maintenance overhead. The user opted for **Localhost + WebSocket** because it is lightweight, cross-platform, supports official `mermaid.js`, and can be pinned as a borderless macOS Web App (PWA) in one click via Safari.

---

## 4. The 8-Step Flow & Zero-Configuration Requirement

### User Flow Proposal
> *"1. user open or create .mmd files*  
> *2. there is already zed extension for formatting i believe. please check https://github.com/gabeins/zed-mermaid. also please check the zed official one. mine version is 1.26.2*  
> *3. user save the file*  
> *4. then user do right click at the tab of file then chose `Open Mermaid Diagram Preview` or can be done by go to command by typing command + shift + p if in mac os*  
> *5. then i dont know or sure about this one. how zed can open url to open os default browser? is user must click some text or can be directly done on step 4?*  
> *6. then at the background, extension of our start its own service. check if port is available. is not, show error message at the bottom right of zed ide*  
> *7. if success, browser will open with localhost showing mermaid diagram... what will page show? is it just for view and to what extend user can do direct edit or control the view directly within browser?*  
> *8. each control message will be passed on through localhost to lsp of zed. and if direct control is allowed, intended file is also changed"*

### Key Zero-Config Requirements
> *"- about syntax highlighting (color and error), also suggesstion maybe, is there any library that we can use? i am not into we build that manually"*  
> *"- i really like about part that do converting, reset, and fit. so we utilize mermaid library right for this? but make sure zero configuragtion from user. so user just click show to preview, then done. finish. no need to start stop any service and blabla. can we do that?"*

---

## 5. Engineering Implementation Rules

### Principles Established by the User:
1. **Vertical Feature Slices over Horizontal Layers:** Build end-to-end working capabilities rather than implementing layer by layer.
2. **Comprehensive Test Suite First:**
   > *"and also add test. unit test, integration test, e2e test, whatever. so i dont need to see the code directly, just the test"*
3. **Manual Exclusion Rule:**
   > *"oh and remember. please ignore the `ignore-this` folder. donot add it into gitignore. just manually ignore."*
4. **Granular Commits with Slice Prefixes:**
   > *"maybe instead of commit for each slice, u may split it more into usecase or processes or domain, etc. so more granular. but with prefix message that tell this is belong to whose slice"*
5. **Marketplace Compatibility:** Ensure compliance with the official Zed Extension Registry standards (`extension.toml`, MIT license, kebab-case id).

---

## 6. Resulting Architecture & Verification

The project implements the complete pipeline:
* **Slice 1 & 2:** Frontend canvas with `mermaid.js` + `svg-pan-zoom` + state lock, served by an auto-port allocating Node.js daemon with `mermaid.parse` validation.
* **Slice 3:** Zed Language Server Protocol (LSP) handler with in-editor diagnostics, Code Action (`Cmd + .`), and automated browser launch via `window/showDocument`.
* **Slice 4:** Zed extension packaging (`extension.toml`, `Cargo.toml`, Rust WASM bridge, `tree-sitter-mermaid` grammar queries).
* **Slice 5:** Automated test suite with **26 passing tests** spanning unit, integration, protocol, and full end-to-end workflows.
