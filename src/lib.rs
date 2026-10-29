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

            // Locate the language server script:
            // 1. If present in current worktree, use its absolute path.
            // 2. Otherwise search candidate paths where the extension repo is located.
            let server_script = if worktree.read_text_file("src/lsp/index.js").is_ok() {
                format!("{}/src/lsp/index.js", worktree.root_path())
            } else {
                let home = worktree
                    .shell_env()
                    .into_iter()
                    .find(|(k, _)| k == "HOME")
                    .map(|(_, v)| v)
                    .unwrap_or_default();

                let candidates = [
                    format!("{}/Documents/2026/project/20261029-mmd-extension/src/lsp/index.js", home),
                    format!("{}/project/20261029-mmd-extension/src/lsp/index.js", home),
                    format!("{}/20261029-mmd-extension/src/lsp/index.js", home),
                    "/home/hisyamzayd/Documents/2026/project/20261029-mmd-extension/src/lsp/index.js".to_string(),
                ];

                let mut found = candidates[0].clone();
                for c in &candidates {
                    if std::path::Path::new(c).exists() {
                        found = c.clone();
                        break;
                    }
                }
                found
            };

            return Ok(Command {
                command: node_binary,
                args: vec![server_script],
                env: worktree.shell_env(),
            });
        }

        Err(format!("Unsupported language server: {}", language_server_id.as_ref()))
    }
}

zed::register_extension!(MermaidPreviewExtension);
