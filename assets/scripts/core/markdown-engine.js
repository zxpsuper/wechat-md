/**
 * Markdown engine setup with CJK emphasis patching.
 * @module markdown-engine
 */

import alertsPlugin from './alerts-plugin.js';
import taskListsPlugin from './task-lists-plugin.js';

const EMPHASIS_MARKERS = new Set([0x2A, 0x5F, 0x7E]);

function isCjkLetter(charCode) {
  if (!charCode || charCode < 0) return false;

  return (
    (charCode >= 0x3400 && charCode <= 0x4DBF) ||
    (charCode >= 0x4E00 && charCode <= 0x9FFF) ||
    (charCode >= 0xF900 && charCode <= 0xFAFF) ||
    (charCode >= 0xFF01 && charCode <= 0xFF60) ||
    (charCode >= 0xFF61 && charCode <= 0xFF9F) ||
    (charCode >= 0xFFA0 && charCode <= 0xFFDC)
  );
}

function createSafeLeadingPunctuationChecker() {
  const fallbackChars = '「」『』（）【】〔〕《》〈〉"\'；：？！';
  const fallbackSet = new Set(fallbackChars.split('').map((char) => char.codePointAt(0)));

  let unicodeRegex = null;
  try {
    unicodeRegex = new RegExp('[\\p{Ps}\\p{Pi}]', 'u');
  } catch (_error) {
    unicodeRegex = null;
  }

  return (charCode, marker) => {
    if (!EMPHASIS_MARKERS.has(marker)) return false;
    if (unicodeRegex && unicodeRegex.test(String.fromCharCode(charCode))) return true;
    return fallbackSet.has(charCode);
  };
}

function patchMarkdownScanner(md) {
  if (!md?.inline?.State) return;

  const utils = md.utils;
  const StateInline = md.inline.State;
  const allowLeadingPunctuation = createSafeLeadingPunctuationChecker();
  const originalScanDelims = StateInline.prototype.scanDelims;

  StateInline.prototype.scanDelims = function scanDelims(start, canSplitWord) {
    const max = this.posMax;
    const marker = this.src.charCodeAt(start);

    if (!EMPHASIS_MARKERS.has(marker)) {
      return originalScanDelims.call(this, start, canSplitWord);
    }

    const lastChar = start > 0 ? this.src.charCodeAt(start - 1) : 0x20;
    let pos = start;
    while (pos < max && this.src.charCodeAt(pos) === marker) pos += 1;

    const count = pos - start;
    const nextChar = pos < max ? this.src.charCodeAt(pos) : 0x20;
    const isLastWhiteSpace = utils.isWhiteSpace(lastChar);
    const isNextWhiteSpace = utils.isWhiteSpace(nextChar);

    let isLastPunctChar = utils.isMdAsciiPunct(lastChar) || utils.isPunctChar(String.fromCharCode(lastChar));
    let isNextPunctChar = utils.isMdAsciiPunct(nextChar) || utils.isPunctChar(String.fromCharCode(nextChar));

    if (isNextPunctChar && allowLeadingPunctuation(nextChar, marker)) {
      isNextPunctChar = false;
    }

    if (marker === 0x5F) {
      if (!isLastWhiteSpace && !isLastPunctChar && isCjkLetter(lastChar)) isLastPunctChar = true;
      if (!isNextWhiteSpace && !isNextPunctChar && isCjkLetter(nextChar)) isNextPunctChar = true;
    }

    const leftFlanking = !isNextWhiteSpace && (!isNextPunctChar || isLastWhiteSpace || isLastPunctChar);
    const rightFlanking = !isLastWhiteSpace && (!isLastPunctChar || isNextWhiteSpace || isNextPunctChar);

    return {
      can_open: leftFlanking && (canSplitWord || !rightFlanking || isLastPunctChar),
      can_close: rightFlanking && (canSplitWord || !leftFlanking || isNextPunctChar),
      length: count
    };
  };
}

function renderCodeBlock(str, lang, md) {
  const codeContent = md.utils.escapeHtml(str);
  const language = (lang || '').trim();
  const safeLanguage = md.utils.escapeHtml(language);
  const codeClasses = ['md-code-block-code'];
  if (language) codeClasses.push(`language-${safeLanguage}`);

  return `
    <div class="md-code-block" data-code-block="true"${safeLanguage ? ` data-language="${safeLanguage}"` : ''}>
      <pre class="md-code-block-pre"><code class="${codeClasses.join(' ')}"${safeLanguage ? ` data-language="${safeLanguage}"` : ''}>${codeContent}</code></pre>
    </div>
  `;
}

export function createMarkdownEngine() {
  const md = window.markdownit({
    html: true,
    linkify: true,
    typographer: false
  });

  patchMarkdownScanner(md);
  registerMathPlugin(md);
  md.use(alertsPlugin);
  md.use(taskListsPlugin);

  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx];
    const info = token.info ? md.utils.unescapeAll(token.info).trim() : '';
    const language = info ? info.split(/\s+/g)[0] : '';
    return renderCodeBlock(token.content, language, md);
  };

  return md;
}

function registerMathPlugin(md) {
  const texmath = window.texmath;
  const katex = window.katex;

  if (typeof texmath !== 'function' || !katex) return;

  md.use(texmath, {
    engine: katex,
    delimiters: 'dollars',
    katexOptions: {
      throwOnError: false,
      strict: 'ignore',
      output: 'htmlAndMathml'
    }
  });
}

export function preprocessMarkdown(content) {
  let normalized = content;
  normalized = normalized.replace(/^(\s*(?:\d+\.|-|\*)\s+[^:\n]+)\n\s*:\s*(.+?)$/gm, '$1: $2');
  normalized = normalized.replace(/^(\s*(?:\d+\.|-|\*)\s+.+?:)\s*\n\s+(.+?)$/gm, '$1 $2');
  normalized = normalized.replace(/^(\s*(?:\d+\.|-|\*)\s+[^:\n]+)\n:\s*(.+?)$/gm, '$1: $2');
  normalized = normalized.replace(/^(\s*(?:\d+\.|-|\*)\s+.+?)\n\n\s+(.+?)$/gm, '$1 $2');
  return normalized;
}
