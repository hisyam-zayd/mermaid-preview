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
            let server_script = worktree
                .which("src/lsp/index.js")
                .unwrap_or_else(|| "src/lsp/index.js".to_string());

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
