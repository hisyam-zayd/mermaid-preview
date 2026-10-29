import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateMermaid } from '../src/server/validator.js';

test('validateMermaid validates valid flowcharts', async () => {
  const code = `
flowchart TD
    A[Start] --> B{Is it working?}
    B -- Yes --> C[Great]
    B -- No --> D[Debug]
  `;
  const result = await validateMermaid(code);
  assert.equal(result.valid, true);
  assert.ok(result.diagramType);
});

test('validateMermaid validates valid sequence diagrams', async () => {
  const code = `
sequenceDiagram
    autonumber
    Alice->>Bob: Hello Bob!
    Bob-->>Alice: Hi Alice!
  `;
  const result = await validateMermaid(code);
  assert.equal(result.valid, true);
});

test('validateMermaid handles empty or whitespace-only code', async () => {
  const emptyResult = await validateMermaid('');
  assert.equal(emptyResult.valid, true);

  const wsResult = await validateMermaid('   \n\t  ');
  assert.equal(wsResult.valid, true);
});

test('validateMermaid catches syntax errors with line numbers', async () => {
  const brokenCode = `
flowchart TD
    A[Start] --> B
    B --> C[Unclosed bracket
    C --> D
  `;
  const result = await validateMermaid(brokenCode);
  assert.equal(result.valid, false);
  assert.ok(result.error);
  assert.ok(typeof result.error.line === 'number');
  assert.ok(result.error.line >= 3);
  assert.ok(result.error.message.length > 0);
});

test('validateMermaid catches invalid diagram types', async () => {
  const invalidCode = `
invalidDiagramType
    A --> B
  `;
  const result = await validateMermaid(invalidCode);
  assert.equal(result.valid, false);
  assert.ok(result.error);
});
