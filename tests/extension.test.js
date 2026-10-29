import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

test('extension.toml meets Zed official marketplace specifications', async () => {
  const content = await fs.readFile('extension.toml', 'utf8');

  // ID validation
  const idMatch = content.match(/id\s*=\s*"([^"]+)"/);
  assert.ok(idMatch, 'Manifest must have an id');
  const id = idMatch[1];
  assert.match(id, /^[a-z0-9-]+$/, 'Extension ID must be kebab-cased');
  assert.doesNotMatch(id, /zed/i, 'Extension ID should not contain "zed" per marketplace rules');

  // Schema version
  assert.match(content, /schema_version\s*=\s*1/, 'schema_version must be 1');

  // Metadata
  assert.match(content, /name\s*=\s*"Mermaid Preview"/);
  assert.match(content, /version\s*=\s*"0\.1\.0"/);
  assert.match(content, /authors\s*=\s*\[/);
  assert.match(content, /description\s*=\s*"/);
  assert.match(content, /repository\s*=\s*"/);

  // Grammar registration
  assert.match(content, /\[grammars\.mermaid\]/);
  assert.match(content, /repository\s*=\s*"https:\/\/github\.com\/monaqa\/tree-sitter-mermaid"/);
  assert.match(content, /commit\s*=\s*"[a-f0-9]{40}"/);

  // Language server registration
  assert.match(content, /\[language_servers\.mermaid-lsp\]/);
  assert.match(content, /languages\s*=\s*\[\s*"Mermaid"\s*\]/);
});

test('languages/mermaid/config.toml associates .mmd and .mermaid suffixes', async () => {
  const config = await fs.readFile('languages/mermaid/config.toml', 'utf8');

  assert.match(config, /name\s*=\s*"Mermaid"/);
  assert.match(config, /grammar\s*=\s*"mermaid"/);
  assert.match(config, /path_suffixes\s*=\s*\[.*"mmd".*"mermaid".*\]/);
  assert.match(config, /line_comments\s*=\s*\[.*"%%".*\]/);
});

test('languages/mermaid/highlights.scm provides comprehensive syntax captures', async () => {
  const highlights = await fs.readFile('languages/mermaid/highlights.scm', 'utf8');

  assert.match(highlights, /@comment/, 'Must highlight comments');
  assert.match(highlights, /@keyword/, 'Must highlight keywords');
  assert.match(highlights, /@operator/, 'Must highlight operators and arrows');
  assert.match(highlights, /@punctuation\.bracket/, 'Must highlight node shapes');
  assert.match(highlights, /@string/, 'Must highlight strings');
});

test('LICENSE file is present and compliant with open-source requirements', async () => {
  const license = await fs.readFile('LICENSE', 'utf8');
  assert.match(license, /MIT License/);
  assert.match(license, /Copyright \(c\) 2026/);
});
