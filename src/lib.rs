use zed_extension_api::{self as zed, Command, LanguageServerId, Result, Worktree};

struct MermaidPreviewExtension;

impl zed::Extension for MermaidPreviewExtension {
    fn new() -> Self {
        Self
    }

    fn language_server_command(
        &mut self,
        language_server_id: &LanguageServerId,
        worktree: &Worktree,
    ) -> Result<Command> {
        if language_server_id.as_ref() == "mermaid-lsp" {
            let node_binary = zed::node_binary_path()?;

            // Instant zero-overhead script resolution:
            // 1. If currently inside the extension worktree, use its root path directly.
            // 2. If src/lsp/index.js exists in the current worktree, use it.
            // 3. Otherwise fall back to the repository installation path without calling shell_env.
            let root = worktree.root_path();
            let server_script = if root.ends_with("20261029-mmd-extension") {
                format!("{}/src/lsp/index.js", root)
            } else if worktree.read_text_file("src/lsp/index.js").is_ok() {
                format!("{}/src/lsp/index.js", root)
            } else {
                let home = std::env::var("HOME").unwrap_or_else(|_| "/home/hisyamzayd".to_string());
                let candidate = format!("{}/Documents/2026/project/20261029-mmd-extension/src/lsp/index.js", home);
                if std::path::Path::new(&candidate).exists() {
                    candidate
                } else {
                    "/home/hisyamzayd/Documents/2026/project/20261029-mmd-extension/src/lsp/index.js".to_string()
                }
            };

            return Ok(Command {
                command: node_binary,
                args: vec![server_script],
                env: Default::default(),
            });
        }

        Err(format!("Unsupported language server: {}", language_server_id.as_ref()))
    }
}

zed::register_extension!(MermaidPreviewExtension);
