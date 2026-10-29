import DOMPurify from 'dompurify';

// Polyfill DOMPurify hooks when running in headless Node.js environment
if (typeof DOMPurify.addHook !== 'function') {
  DOMPurify.addHook = () => {};
}
if (typeof DOMPurify.sanitize !== 'function') {
  DOMPurify.sanitize = (str) => str;
}

import mermaid from 'mermaid';

/**
 * Validates Mermaid diagram code using official mermaid.parse.
 *
 * @param {string} code - Mermaid code string
 * @returns {Promise<{ valid: boolean, diagramType?: string, error?: { message: string, line: number, column: number } }>}
 */
export async function validateMermaid(code) {
  if (!code || !code.trim()) {
    return { valid: true, diagramType: 'empty' };
  }

  try {
    const parseResult = await mermaid.parse(code);
    return {
      valid: true,
      diagramType: parseResult?.diagramType || 'unknown',
    };
  } catch (err) {
    let line = 1;
    let column = 0;

    if (err.hash?.loc?.first_line) {
      line = err.hash.loc.first_line;
      column = err.hash.loc.first_column || 0;
    } else if (err.hash?.line) {
      line = err.hash.line;
    } else {
      // Fallback regex matching "Parse error on line X"
      const match = err.message?.match(/Parse error on line (\d+)/i);
      if (match) {
        line = parseInt(match[1], 10);
      }
    }

    // Clean up error message for display
    const firstLine = err.message ? err.message.split('\n')[0] : 'Syntax error';

    return {
      valid: false,
      error: {
        message: firstLine,
        fullMessage: err.message || 'Unknown syntax error',
        line,
        column,
      },
    };
  }
}
