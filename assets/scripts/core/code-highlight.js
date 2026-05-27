/**
 * Code syntax highlighting helpers for preview and clipboard export.
 * Borrowed in spirit from mdeditor-main's code formatter: stable theme palette,
 * regex-based tokenization, and WeChat-safe inline color markup.
 * @module code-highlight
 */

import { getCodeHighlightTheme } from '../ui/code-themes.js';

const LANGUAGE_ALIASES = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  rb: 'ruby',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  md: 'markdown',
  htm: 'html',
  xml: 'html',
  csharp: 'csharp',
  cs: 'csharp',
  'c++': 'cpp',
  ps1: 'powershell',
  psm1: 'powershell'
};

const KEYWORD_MAP = {
  javascript: ['function', 'const', 'let', 'var', 'if', 'else', 'for', 'while', 'return', 'class', 'extends', 'import', 'export', 'from', 'default', 'async', 'await', 'try', 'catch', 'finally', 'throw', 'new', 'this', 'super', 'typeof', 'instanceof', 'switch', 'case', 'break', 'continue', 'null', 'undefined', 'true', 'false'],
  typescript: ['function', 'const', 'let', 'var', 'if', 'else', 'for', 'while', 'return', 'class', 'extends', 'implements', 'interface', 'type', 'enum', 'import', 'export', 'from', 'default', 'async', 'await', 'try', 'catch', 'finally', 'throw', 'new', 'this', 'super', 'public', 'private', 'protected', 'readonly', 'as', 'declare', 'namespace', 'module', 'null', 'undefined', 'true', 'false'],
  python: ['def', 'class', 'if', 'elif', 'else', 'for', 'while', 'return', 'import', 'from', 'as', 'try', 'except', 'finally', 'raise', 'with', 'lambda', 'yield', 'async', 'await', 'pass', 'break', 'continue', 'in', 'is', 'not', 'and', 'or', 'True', 'False', 'None'],
  java: ['class', 'interface', 'enum', 'public', 'private', 'protected', 'static', 'final', 'void', 'int', 'long', 'float', 'double', 'boolean', 'char', 'byte', 'short', 'new', 'return', 'if', 'else', 'for', 'while', 'switch', 'case', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'throws', 'extends', 'implements', 'this', 'super', 'true', 'false', 'null'],
  csharp: ['class', 'interface', 'enum', 'public', 'private', 'protected', 'internal', 'static', 'readonly', 'sealed', 'void', 'int', 'long', 'float', 'double', 'bool', 'string', 'var', 'new', 'return', 'if', 'else', 'for', 'foreach', 'while', 'switch', 'case', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'using', 'namespace', 'this', 'base', 'true', 'false', 'null'],
  cpp: ['class', 'struct', 'enum', 'public', 'private', 'protected', 'static', 'const', 'constexpr', 'void', 'int', 'long', 'float', 'double', 'bool', 'char', 'auto', 'new', 'return', 'if', 'else', 'for', 'while', 'switch', 'case', 'break', 'continue', 'try', 'catch', 'throw', 'namespace', 'template', 'typename', 'this', 'true', 'false', 'nullptr'],
  go: ['func', 'package', 'import', 'type', 'struct', 'interface', 'map', 'chan', 'const', 'var', 'if', 'else', 'for', 'range', 'return', 'switch', 'case', 'break', 'continue', 'defer', 'go', 'select', 'fallthrough', 'true', 'false', 'nil'],
  rust: ['fn', 'let', 'mut', 'struct', 'enum', 'trait', 'impl', 'pub', 'use', 'mod', 'match', 'if', 'else', 'for', 'while', 'loop', 'return', 'break', 'continue', 'async', 'await', 'move', 'where', 'Self', 'self', 'true', 'false', 'None', 'Some'],
  php: ['function', 'class', 'interface', 'trait', 'public', 'private', 'protected', 'static', 'const', 'namespace', 'use', 'new', 'return', 'if', 'else', 'elseif', 'for', 'foreach', 'while', 'switch', 'case', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'true', 'false', 'null'],
  bash: ['if', 'then', 'else', 'fi', 'for', 'do', 'done', 'while', 'case', 'esac', 'function', 'in', 'return', 'break', 'continue', 'export', 'local'],
  sql: ['select', 'from', 'where', 'join', 'left', 'right', 'inner', 'outer', 'on', 'group', 'by', 'order', 'having', 'insert', 'into', 'values', 'update', 'set', 'delete', 'create', 'table', 'alter', 'drop', 'and', 'or', 'not', 'null', 'as', 'distinct', 'limit'],
  json: ['true', 'false', 'null'],
  html: [],
  css: ['display', 'position', 'color', 'background', 'font-size', 'padding', 'margin', 'border', 'grid', 'flex'],
  yaml: ['true', 'false', 'null'],
  text: []
};

const COMMON_KEYWORDS = ['function', 'const', 'let', 'var', 'if', 'else', 'for', 'while', 'return', 'class', 'import', 'export', 'from', 'async', 'await', 'true', 'false', 'null', 'undefined'];
const TYPE_KEYWORDS = ['string', 'number', 'boolean', 'object', 'Array', 'Promise', 'Map', 'Set', 'Record', 'unknown', 'never', 'void', 'int', 'float', 'double', 'bool', 'char', 'long'];
const GENERIC_OPERATORS = /=>|===|!==|==|!=|<=|>=|\+\+|--|\+=|-=|\*=|\/=|%=|&&|\|\||\?\?|\?\.|[-+*/%=&|<>!~^]+/g;
const GENERIC_PUNCTUATION = /[()[\]{}:;,.]/g;

export function applyCodeHighlighting(root, { codeTheme, styleConfig } = {}) {
  if (!root?.querySelectorAll) return null;

  const highlightTheme = getCodeHighlightTheme(codeTheme, styleConfig);
  root.querySelectorAll('.md-code-block-code').forEach((codeElement) => {
    applyHighlightThemeToCode(codeElement, highlightTheme);
  });

  return highlightTheme;
}

export function applyHighlightThemeToCode(codeElement, highlightTheme) {
  if (!codeElement || !highlightTheme) return;

  const language = normalizeLanguage(codeElement.getAttribute('data-language') || codeElement.closest('[data-language]')?.getAttribute('data-language') || '');
  const source = codeElement.textContent || '';

  codeElement.innerHTML = highlightCode(source, language, highlightTheme);
  appendStyleText(codeElement, `color: ${highlightTheme.textColor};`);
}

export function highlightCode(code, language, highlightTheme) {
  if (!code) return '';

  const palette = highlightTheme.tokens || highlightTheme.syntaxHighlight || {};
  const escaped = escapeHtml(code)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, '  ');

  const chars = escaped.split('');
  const processed = new Array(chars.length).fill(false);
  const highlights = [];
  const rules = buildRules(language, palette);

  rules.forEach((rule) => {
    let match;
    rule.pattern.lastIndex = 0;

    while ((match = rule.pattern.exec(escaped)) !== null) {
      const start = match.index;
      const text = match[0];
      const end = start + text.length;
      if (!text || overlaps(processed, start, end)) continue;

      highlights.push({
        start,
        end,
        text,
        token: rule.token,
        color: palette[rule.token] || highlightTheme.textColor,
        fontWeight: rule.fontWeight || '',
        fontStyle: rule.fontStyle || ''
      });

      markProcessed(processed, start, end);
    }
  });

  highlights.sort((left, right) => left.start - right.start);

  let result = '';
  let cursor = 0;

  highlights.forEach((highlight) => {
    if (highlight.start > cursor) {
      result += escaped.slice(cursor, highlight.start);
    }

    result += createHighlightMarkup(highlight);
    cursor = highlight.end;
  });

  if (cursor < escaped.length) {
    result += escaped.slice(cursor);
  }

  return result;
}

export function serializeHighlightedCodeHtml(codeElement) {
  if (!codeElement) return '&nbsp;';

  const html = Array.from(codeElement.childNodes)
    .map((node) => serializeNode(node))
    .join('');

  return html || '&nbsp;';
}

function normalizeLanguage(language) {
  if (!language) return 'text';
  const normalized = String(language).trim().toLowerCase();
  return LANGUAGE_ALIASES[normalized] || normalized;
}

function buildRules(language, palette) {
  const resolvedLanguage = normalizeLanguage(language);
  const keywords = KEYWORD_MAP[resolvedLanguage] || COMMON_KEYWORDS;
  const keywordPattern = keywords.length > 0
    ? new RegExp(`\\b(${escapeRegexAlternation(keywords)})\\b`, resolvedLanguage === 'sql' ? 'gi' : 'g')
    : null;
  const typePattern = new RegExp(`\\b(${escapeRegexAlternation(TYPE_KEYWORDS)})\\b`, 'g');

  const rules = [];

  if (resolvedLanguage === 'html') {
    rules.push(
      { pattern: /&lt;!--[\s\S]*?--&gt;/g, token: 'comment', fontStyle: 'italic' },
      { pattern: /&lt;\/?[a-zA-Z][\w:-]*/g, token: 'tag', fontWeight: '600' },
      { pattern: /\b([a-zA-Z_:][-a-zA-Z0-9_:.]*)(=)(&quot;[^"]*&quot;|&#39;[^']*&#39;)/g, token: 'attribute' },
      { pattern: /&quot;[^"]*&quot;|&#39;[^']*&#39;/g, token: 'string' }
    );
  } else if (resolvedLanguage === 'css') {
    rules.push(
      { pattern: /\/\*[\s\S]*?\*\//g, token: 'comment', fontStyle: 'italic' },
      { pattern: /(^|[{};]\s*)([.#]?[a-zA-Z][\w-]*)(?=\s*\{)/gm, token: 'selector', captureIndex: 2, fontWeight: '600' },
      { pattern: /\b([a-z-]+)(?=\s*:)/g, token: 'property' },
      { pattern: /#[0-9a-fA-F]{3,8}\b|\b\d+(?:\.\d+)?(?:px|rem|em|vh|vw|%)?\b/g, token: 'number' },
      { pattern: /&quot;[^"]*&quot;|&#39;[^']*&#39;/g, token: 'string' }
    );
  } else if (resolvedLanguage === 'yaml') {
    rules.push(
      { pattern: /#.*/g, token: 'comment', fontStyle: 'italic' },
      { pattern: /^\s*[\w-]+(?=\s*:)/gm, token: 'property' },
      { pattern: /&quot;[^"]*&quot;|&#39;[^']*&#39;/g, token: 'string' },
      { pattern: /\b\d+(?:\.\d+)?\b/g, token: 'number' }
    );
  } else {
    rules.push(
      { pattern: /\/\/.*$/gm, token: 'comment', fontStyle: 'italic' },
      { pattern: /\/\*[\s\S]*?\*\//g, token: 'comment', fontStyle: 'italic' },
      { pattern: /(^|\s)#.*$/gm, token: 'comment', fontStyle: 'italic', captureIndex: 0 },
      { pattern: /--.*$/gm, token: resolvedLanguage === 'sql' ? 'comment' : 'operator', fontStyle: resolvedLanguage === 'sql' ? 'italic' : '' },
      { pattern: /&quot;(?:\\.|[^"\\])*&quot;|&#39;(?:\\.|[^'\\])*&#39;|`(?:\\.|[^`\\])*`/g, token: 'string' },
      { pattern: /\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/gi, token: 'number' }
    );

    if (keywordPattern) {
      rules.push({ pattern: keywordPattern, token: 'keyword', fontWeight: '600' });
    }

    rules.push(
      { pattern: typePattern, token: 'type' },
      { pattern: /\b[A-Z][A-Za-z0-9_]*(?=\b)/g, token: 'class' },
      { pattern: /\b[a-zA-Z_$][\w$]*(?=\s*\()/g, token: 'function', fontWeight: '600' },
      { pattern: /\b[a-zA-Z_$][\w$]*(?=\s*:)/g, token: resolvedLanguage === 'json' ? 'property' : 'attr' },
      { pattern: /&(?:amp|lt|gt|quot|#\d+|#[xX][\da-fA-F]+);/g, token: 'entity' },
      { pattern: GENERIC_OPERATORS, token: 'operator' },
      { pattern: GENERIC_PUNCTUATION, token: 'punctuation' }
    );
  }

  return expandRules(rules, palette);
}

function expandRules(rules, palette) {
  return rules.flatMap((rule) => {
    if (!rule.captureIndex) return [rule];
    return [{
      ...rule,
      pattern: convertCapturePattern(rule.pattern, rule.captureIndex),
      token: rule.token,
      fontWeight: rule.fontWeight,
      fontStyle: rule.fontStyle
    }];
  }).filter((rule) => Boolean(rule.pattern) && Boolean(palette[rule.token] || rule.token));
}

function convertCapturePattern(pattern, captureIndex) {
  const source = pattern.source;
  const flags = pattern.flags.replace(/g/g, '');
  const matches = Array.from(source.matchAll(/\((?!\?:)/g));
  if (captureIndex < 1 || captureIndex > matches.length) return new RegExp(source, `${flags}g`);

  const captureStart = matches[captureIndex - 1].index;
  let depth = 0;
  let captureEnd = captureStart;

  for (let index = captureStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '(' && source[index - 1] !== '\\') depth += 1;
    if (char === ')' && source[index - 1] !== '\\') {
      depth -= 1;
      if (depth === 0) {
        captureEnd = index;
        break;
      }
    }
  }

  const target = source.slice(captureStart + 1, captureEnd);
  return new RegExp(target, `${flags}g`);
}

function overlaps(processed, start, end) {
  for (let index = start; index < end; index += 1) {
    if (processed[index]) return true;
  }
  return false;
}

function markProcessed(processed, start, end) {
  for (let index = start; index < end; index += 1) {
    processed[index] = true;
  }
}

function createHighlightMarkup({ text, token, color, fontWeight, fontStyle }) {
  const className = `syntax-${token}`;
  const style = [
    `color: ${color} !important`,
    fontWeight ? `font-weight: ${fontWeight}` : '',
    fontStyle ? `font-style: ${fontStyle}` : '',
    'text-decoration: none'
  ].filter(Boolean).join('; ');

  return `<span style="${style}" class="${className}" data-syntax="${token}" data-color="${color}"><font color="${color}">${text}</font></span>`;
}

function serializeNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return formatTextForHtml(node.nodeValue || '');
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const tag = node.tagName.toLowerCase();
  const attributes = Array.from(node.attributes || [])
    .map((attribute) => ` ${attribute.name}="${escapeAttribute(attribute.value)}"`)
    .join('');
  const children = Array.from(node.childNodes)
    .map((child) => serializeNode(child))
    .join('');

  return `<${tag}${attributes}>${children}</${tag}>`;
}

function formatTextForHtml(value) {
  return escapeHtml(
    String(value || '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\t/g, '  ')
  )
    .replace(/ /g, '&nbsp;')
    .replace(/\n/g, '<br>');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function appendStyleText(element, styleText) {
  if (!styleText) return;
  const currentStyle = element.getAttribute('style') || '';
  element.setAttribute('style', currentStyle ? `${currentStyle}; ${styleText}` : styleText);
}

function escapeRegexAlternation(values) {
  return values
    .filter(Boolean)
    .map((value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
}
