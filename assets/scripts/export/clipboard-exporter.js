/**
 * Clipboard exporter for WeChat-compatible HTML.
 * @module clipboard-exporter
 */

import { convertMathForWechat, stripFormulaExportMetadata } from './math-exporter.js';
import { applyCodeHighlighting, serializeHighlightedCodeHtml } from '../core/code-highlight.js';

function extractBackgroundColor(styleString) {
  if (!styleString) return null;

  const bgColorMatch = styleString.match(/background-color:\s*([^;]+)/);
  if (bgColorMatch) return bgColorMatch[1].trim();

  const bgMatch = styleString.match(/background:\s*([#rgb][^;]+)/);
  if (bgMatch) {
    const bgValue = bgMatch[1].trim();
    if (bgValue.startsWith('#') || bgValue.startsWith('rgb')) return bgValue;
  }

  return null;
}

const CLIPBOARD_IMAGE_MAX_BYTES = 1024 * 1024;
const CLIPBOARD_IMAGE_MAX_DIMENSION = 1200;
const CLIPBOARD_IMAGE_JPEG_QUALITY = 0.6;
const IMAGE_READ_TIMEOUT_MS = 8000;
const IMAGE_GIF_CHECK_TIMEOUT_MS = 3000;

function withTimeout(promise, ms, message = 'Operation timed out') {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    })
  ]);
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function ensureBlobType(blob, mimeType) {
  if (!blob || !mimeType || blob.type === mimeType) return blob;
  return new Blob([blob], { type: mimeType });
}

async function fetchImageBlob(src) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_READ_TIMEOUT_MS);

  try {
    const response = await fetch(src, {
      mode: 'cors',
      cache: 'default',
      signal: controller.signal
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const blob = await response.blob();
    const contentType = response.headers.get('content-type');
    return ensureBlobType(blob, contentType);
  } finally {
    clearTimeout(timer);
  }
}

function loadImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectURL = URL.createObjectURL(blob);

    image.onload = () => {
      URL.revokeObjectURL(objectURL);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectURL);
      reject(new Error('Image decode failed'));
    };
    image.src = objectURL;
  });
}

async function recompressForClipboard(blob) {
  if (!blob || blob.size <= CLIPBOARD_IMAGE_MAX_BYTES) return blob;
  if (!blob.type?.startsWith('image/') || blob.type === 'image/gif') return blob;

  try {
    const image = await loadImageFromBlob(blob);
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    const scale = Math.min(
      1,
      CLIPBOARD_IMAGE_MAX_DIMENSION / Math.max(sourceWidth, sourceHeight)
    );
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    canvas.width = width;
    canvas.height = height;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);

    const compressed = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', CLIPBOARD_IMAGE_JPEG_QUALITY);
    });

    return compressed && compressed.size < blob.size ? compressed : blob;
  } catch (error) {
    console.warn('Clipboard image recompress failed:', error);
    return blob;
  }
}

async function readStoredImageBlob(imgElement, imageStore) {
  const imageId = imgElement.getAttribute('data-image-id');
  if (!imageId || !imageStore) return null;

  if (typeof imageStore.getImageRecord === 'function') {
    const record = await withTimeout(
      imageStore.getImageRecord(imageId),
      IMAGE_READ_TIMEOUT_MS,
      'Read image record timed out'
    );
    if (record?.blob) {
      return ensureBlobType(record.blob, record.mimeType || record.blob.type);
    }
  }

  if (typeof imageStore.getImageBlob === 'function') {
    return withTimeout(
      imageStore.getImageBlob(imageId),
      IMAGE_READ_TIMEOUT_MS,
      'Read image blob timed out'
    );
  }

  return null;
}

async function isGifImage(imgElement, imageStore) {
  const src = imgElement.getAttribute('src') || '';
  const imageId = imgElement.getAttribute('data-image-id');

  if (src.startsWith('data:image/gif')) return true;

  if (imageId && imageStore && typeof imageStore.getImageRecord === 'function') {
    try {
      const record = await withTimeout(
        imageStore.getImageRecord(imageId),
        IMAGE_GIF_CHECK_TIMEOUT_MS,
        'Check GIF timed out'
      );
      const mimeType = record?.mimeType || record?.blob?.type || '';
      if (mimeType.toLowerCase() === 'image/gif') return true;
    } catch (_error) {
      // Fall back to src sniffing.
    }
  }

  const normalizedSrc = src.toLowerCase();
  return normalizedSrc.endsWith('.gif') || normalizedSrc.includes('.gif?');
}

function replaceGifWithPlaceholder(imgElement) {
  const doc = imgElement.ownerDocument;
  const placeholder = doc.createElement('section');

  placeholder.setAttribute(
    'style',
    'margin: 16px 0 !important; padding: 14px 16px !important; border: 1px dashed #d8a100 !important; border-radius: 8px !important; background: #fff8e1 !important; color: #7a5200 !important; font-size: 14px !important; line-height: 1.6 !important; text-align: center !important;'
  );
  placeholder.textContent = 'GIF 动图不会在复制时内嵌，请在公众号后台单独上传。';
  imgElement.replaceWith(placeholder);
}

async function convertImageToBase64(imgElement, imageStore) {
  const src = imgElement.getAttribute('src') || '';
  if (!src) throw new Error('Image src is empty');
  if (src.startsWith('data:')) return src;

  try {
    const storedBlob = await readStoredImageBlob(imgElement, imageStore);
    if (storedBlob) {
      return blobToDataURL(await recompressForClipboard(storedBlob));
    }
  } catch (error) {
    console.warn('Read stored clipboard image failed:', error);
  }

  const blob = await fetchImageBlob(src);
  return blobToDataURL(await recompressForClipboard(blob));
}

function convertGridToTable(doc) {
  const imageGrids = doc.querySelectorAll('.image-grid');
  imageGrids.forEach((grid) => {
    const columns = parseInt(grid.getAttribute('data-columns'), 10) || 2;
    convertSingleGridToTable(doc, grid, columns);
  });
}

function convertSingleGridToTable(doc, grid, columns) {
  const wrappers = Array.from(grid.children);
  const gridStyle = grid.getAttribute('style') || '';
  const gridMarginTop = cleanStyleValue(extractLastStyleValue(gridStyle, 'margin-top')) || '20px';
  const gridMarginBottom = cleanStyleValue(extractLastStyleValue(gridStyle, 'margin-bottom')) || '20px';
  const table = doc.createElement('table');
  table.setAttribute(
    'style',
    `width: 100% !important; border-collapse: separate !important; border-spacing: 0 !important; margin-top: ${gridMarginTop} !important; margin-right: auto !important; margin-bottom: ${gridMarginBottom} !important; margin-left: auto !important; table-layout: fixed !important; border: none !important; overflow: visible !important;`
  );

  const rows = Math.ceil(wrappers.length / columns);

  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    const row = doc.createElement('tr');

    for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
      const cell = doc.createElement('td');
      cell.setAttribute('style', `padding: 8px !important; vertical-align: top !important; width: ${100 / columns}% !important; border: none !important; overflow: visible !important;`);

      const item = wrappers[rowIndex * columns + columnIndex];
      if (item) {
        const image = item.querySelector('img');
        if (image) {
          const itemStyle = item.getAttribute('style') || '';
          const imageStyle = image.getAttribute('style') || '';
          const visualStyle = buildGridItemVisualStyle(itemStyle, imageStyle);
          const nextImage = image.cloneNode(true);
          nextImage.setAttribute('style', buildGridImageExportStyle(itemStyle, imageStyle));

          const wrapper = doc.createElement('div');
          wrapper.setAttribute(
            'style',
            mergeStyleText(
              'width: 100% !important; height: 360px !important; text-align: center !important; padding: 0 !important; box-sizing: border-box !important; overflow: visible !important; display: table !important;',
              visualStyle
            )
          );

          const inner = doc.createElement('div');
          inner.setAttribute('style', 'display: table-cell !important; vertical-align: middle !important; text-align: center !important;');
          inner.appendChild(nextImage);
          wrapper.appendChild(inner);
          cell.appendChild(wrapper);
        }
      }

      row.appendChild(cell);
    }

    table.appendChild(row);
  }

  grid.parentNode.replaceChild(table, grid);
}

function buildGridItemVisualStyle(itemStyle, imageStyle) {
  const declarations = [];
  const borderRadius = cleanStyleValue(extractLastStyleValue(itemStyle, 'border-radius')
    || extractLastStyleValue(imageStyle, 'border-radius'));
  const boxShadow = cleanStyleValue(extractLastStyleValue(itemStyle, 'box-shadow')
    || extractLastStyleValue(imageStyle, 'box-shadow'));
  const webkitBoxShadow = cleanStyleValue(extractLastStyleValue(itemStyle, '-webkit-box-shadow')
    || extractLastStyleValue(imageStyle, '-webkit-box-shadow'));
  const border = cleanStyleValue(extractLastStyleValue(itemStyle, 'border')
    || extractLastStyleValue(imageStyle, 'border'));
  const borderTop = cleanStyleValue(extractLastStyleValue(itemStyle, 'border-top')
    || extractLastStyleValue(imageStyle, 'border-top'));
  const borderRight = cleanStyleValue(extractLastStyleValue(itemStyle, 'border-right')
    || extractLastStyleValue(imageStyle, 'border-right'));
  const borderBottom = cleanStyleValue(extractLastStyleValue(itemStyle, 'border-bottom')
    || extractLastStyleValue(imageStyle, 'border-bottom'));
  const borderLeft = cleanStyleValue(extractLastStyleValue(itemStyle, 'border-left')
    || extractLastStyleValue(imageStyle, 'border-left'));
  const background = cleanStyleValue(extractLastStyleValue(itemStyle, 'background')
    || extractLastStyleValue(itemStyle, 'background-color')
    || extractLastStyleValue(imageStyle, 'background')
    || extractLastStyleValue(imageStyle, 'background-color'));

  if (background) declarations.push(`background: ${background} !important;`);
  if (borderRadius) declarations.push(`border-radius: ${borderRadius} !important;`);
  if (boxShadow) declarations.push(`box-shadow: ${boxShadow} !important;`);
  if (webkitBoxShadow) declarations.push(`-webkit-box-shadow: ${webkitBoxShadow} !important;`);
  if (border) declarations.push(`border: ${border} !important;`);
  if (borderTop) declarations.push(`border-top: ${borderTop} !important;`);
  if (borderRight) declarations.push(`border-right: ${borderRight} !important;`);
  if (borderBottom) declarations.push(`border-bottom: ${borderBottom} !important;`);
  if (borderLeft) declarations.push(`border-left: ${borderLeft} !important;`);

  return declarations.join(' ');
}

function buildGridImageExportStyle(itemStyle, imageStyle) {
  const maxHeight = cleanStyleValue(extractLastStyleValue(imageStyle, 'max-height')) || '340px';
  const filter = cleanStyleValue(extractLastStyleValue(imageStyle, 'filter'));
  const opacity = cleanStyleValue(extractLastStyleValue(imageStyle, 'opacity'));
  const visualStyle = buildGridItemVisualStyle(itemStyle, imageStyle);
  const declarations = [
    'max-width: 100% !important;',
    `max-height: ${maxHeight} !important;`,
    'width: auto !important;',
    'height: auto !important;',
    'display: inline-block !important;',
    'margin: 0 auto !important;',
    'object-fit: contain !important;'
  ];

  if (filter) declarations.push(`filter: ${filter} !important;`);
  if (opacity) declarations.push(`opacity: ${opacity} !important;`);
  if (visualStyle) declarations.push(visualStyle);

  return declarations.join(' ');
}

function convertCodeBlocks(doc, styleConfig, codeTheme) {
  const blocks = doc.querySelectorAll('[data-code-block="true"]');
  const resolvedStyles = resolveCodeBlockExportStyles(styleConfig, codeTheme);

  blocks.forEach((block) => {
    const code = block.querySelector('.md-code-block-code');
    if (!code) return;

    const wrapper = doc.createElement('section');
    wrapper.setAttribute('style', resolvedStyles.wrapper);

    const frame = doc.createElement('section');
    frame.setAttribute('style', resolvedStyles.frame);

    const scrollArea = doc.createElement('section');
    scrollArea.setAttribute('style', resolvedStyles.scrollArea);

    const content = doc.createElement('span');
    content.setAttribute('style', resolvedStyles.content);

    const codeNode = doc.createElement('code');
    codeNode.setAttribute('style', resolvedStyles.code);
    codeNode.innerHTML = serializeHighlightedCodeHtml(code);

    content.appendChild(codeNode);
    scrollArea.appendChild(content);
    frame.appendChild(scrollArea);
    wrapper.appendChild(frame);
    block.parentNode.replaceChild(wrapper, block);
  });
}

function resolveCodeBlockExportStyles(styleConfig, codeTheme) {
  if (codeTheme) {
    return {
      wrapper: 'margin: 24px 0 !important;',
      frame: `padding: 16px !important; background: ${codeTheme.bg} !important; color: ${codeTheme.textColor} !important; border: 1px solid ${codeTheme.borderColor} !important; border-radius: 10px !important; box-shadow: 0 2px 8px rgba(0,0,0,0.12) !important; -webkit-box-shadow: 0 2px 8px rgba(0,0,0,0.12) !important;`,
      scrollArea: 'display: block !important; overflow-x: auto !important; overflow-y: hidden !important; padding: 0 0 12px 0 !important; -webkit-overflow-scrolling: touch !important;',
      content: 'display: inline-block !important; min-width: max-content !important;',
      code: `display: block !important; background: transparent !important; color: ${codeTheme.textColor} !important; font-family: "SF Mono", Consolas, Monaco, "Courier New", monospace !important; font-size: 14px !important; line-height: 1.7 !important; white-space: pre !important; word-break: normal !important; overflow-wrap: normal !important; tab-size: 2 !important;`
    };
  }

  const preStyle = styleConfig?.styles?.pre || '';
  const cleanCodeStyle = sanitizeThemeCodeStyle(styleConfig?.styles?.code || '');
  const preTextColor = extractStyleValue(preStyle, 'color');
  const codeHasColor = Boolean(extractStyleValue(cleanCodeStyle, 'color'));
  const textColorFallback = preTextColor && !codeHasColor ? `color: ${preTextColor} !important;` : '';
  const fontFamilyFallback = extractStyleValue(cleanCodeStyle, 'font-family')
    ? ''
    : 'font-family: "SF Mono", Consolas, Monaco, "Courier New", monospace !important;';
  const fontSizeFallback = extractStyleValue(cleanCodeStyle, 'font-size') ? '' : 'font-size: 14px !important;';
  const lineHeightFallback = extractStyleValue(cleanCodeStyle, 'line-height') ? '' : 'line-height: 1.7 !important;';

  return {
    wrapper: 'margin: 24px 0 !important;',
    frame: `padding: 16px !important; ${preStyle}`,
    scrollArea: 'display: block !important; overflow-x: auto !important; overflow-y: hidden !important; padding: 0 0 12px 0 !important; -webkit-overflow-scrolling: touch !important;',
    content: 'display: inline-block !important; min-width: max-content !important;',
    code: `display: block !important; background: transparent !important; white-space: pre !important; word-break: normal !important; overflow-wrap: normal !important; tab-size: 2 !important; ${fontFamilyFallback} ${fontSizeFallback} ${lineHeightFallback} ${textColorFallback} ${cleanCodeStyle}`
  };
}

function sanitizeThemeCodeStyle(styleText) {
  if (!styleText) return '';
  return styleText.replace(
    /(^|;)\s*(padding(?:-[^:]+)?|background(?:-color)?|border(?:-[^:]+)?|border-radius|display|white-space)\s*:\s*[^;]+;?/gi,
    ';'
  );
}

function extractStyleValue(styleText, property) {
  if (!styleText || !property) return null;
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = styleText.match(new RegExp(`(?:^|;)\\s*${escapedProperty}\\s*:\\s*([^;]+)`, 'i'));
  return match ? match[1].trim() : null;
}

function extractLastStyleValue(styleText, property) {
  if (!styleText || !property) return null;
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = Array.from(styleText.matchAll(new RegExp(`(?:^|;)\\s*${escapedProperty}\\s*:\\s*([^;]+)`, 'gi')));
  if (matches.length === 0) return null;
  return matches[matches.length - 1][1].trim();
}

function cleanStyleValue(value) {
  if (!value) return null;
  return String(value).replace(/\s*!important\s*$/i, '').trim();
}

function escapeHtml(value) {
  return (value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toWechatCodeHTML(codeText) {
  const normalized = (codeText || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, '  ');

  if (!normalized) return '&nbsp;';

  return escapeHtml(normalized)
    .split('\n')
    .map((line) => (line.length ? line.replace(/ /g, '&nbsp;') : '&nbsp;'))
    .join('<br>');
}

function flattenListItems(doc) {
  doc.querySelectorAll('li').forEach((item) => {
    if (containsRenderableMath(item)) {
      return;
    }

    const clone = item.cloneNode(true);
    replaceFormulaNodesWithPlainText(clone);

    // Preserve task list checkbox state
    const checkbox = clone.querySelector('input[type="checkbox"]');
    const prefix = checkbox
      ? (checkbox.checked ? '☑️ ' : '⬜ ')
      : '';

    const text = (clone.textContent || '').replace(/\s+/g, ' ').trim();
    item.innerHTML = '';
    item.textContent = prefix + text;
  });
}

function containsRenderableMath(node) {
  if (!node?.querySelector) return false;
  return Boolean(
    node.querySelector('[data-formula-plain], [data-formula-source], .katex, .katex-display, .MathJax, mjx-container')
  );
}

function convertOrderedListsToWechatParagraphs(doc, styleConfig) {
  const orderedLists = Array.from(doc.querySelectorAll('ol'));
  orderedLists.forEach((list) => {
    const items = Array.from(list.children).filter((child) => child.tagName?.toUpperCase() === 'LI');
    if (items.length === 0) {
      list.remove();
      return;
    }

    const fragment = doc.createDocumentFragment();
    items.forEach((item, index) => {
      fragment.appendChild(buildWechatOrderedParagraph(doc, item, index + 1, styleConfig));
    });

    list.parentNode.replaceChild(fragment, list);
  });
}

function buildWechatOrderedParagraph(doc, item, order, styleConfig) {
  const paragraph = doc.createElement('p');
  const prefix = doc.createElement('span');
  const clonedItem = item.cloneNode(true);
  const containerStyle = styleConfig?.styles?.container || '';
  const paragraphStyle = styleConfig?.styles?.p || '';
  const listItemStyle = styleConfig?.styles?.li || '';

  prefix.textContent = `${order}. `;
  prefix.setAttribute(
    'style',
    'display: inline !important; white-space: nowrap !important;'
  );

  if (!containsRenderableMath(clonedItem)) {
    replaceFormulaNodesWithPlainText(clonedItem);
    const text = (clonedItem.textContent || '').replace(/\s+/g, ' ').trim();
    clonedItem.innerHTML = '';
    clonedItem.textContent = text;
  }

  paragraph.setAttribute(
    'style',
    mergeStyleText(
      buildTypographyStyle({
        fontSize: extractStyleValue(listItemStyle, 'font-size')
          || extractStyleValue(paragraphStyle, 'font-size')
          || extractStyleValue(containerStyle, 'font-size'),
        lineHeight: extractStyleValue(listItemStyle, 'line-height')
          || extractStyleValue(paragraphStyle, 'line-height')
          || extractStyleValue(containerStyle, 'line-height'),
        color: extractStyleValue(listItemStyle, 'color')
          || extractStyleValue(paragraphStyle, 'color')
          || extractStyleValue(containerStyle, 'color'),
        fontFamily: extractStyleValue(listItemStyle, 'font-family')
          || extractStyleValue(paragraphStyle, 'font-family')
          || extractStyleValue(containerStyle, 'font-family')
      }),
      'margin: 0 0 14px !important; white-space: normal !important; word-break: break-word !important; overflow-wrap: anywhere !important;'
    )
  );

  paragraph.appendChild(prefix);
  while (clonedItem.firstChild) {
    paragraph.appendChild(clonedItem.firstChild);
  }
  return paragraph;
}

function normalizeListTypographyForWechat(doc, styleConfig) {
  const containerStyle = styleConfig?.styles?.container || '';
  const paragraphStyle = styleConfig?.styles?.p || '';
  const listItemStyle = styleConfig?.styles?.li || '';
  const listStyle = [styleConfig?.styles?.ol || '', styleConfig?.styles?.ul || ''].join('; ');

  const fontSize = extractStyleValue(listItemStyle, 'font-size')
    || extractStyleValue(paragraphStyle, 'font-size')
    || extractStyleValue(containerStyle, 'font-size');
  const lineHeight = extractStyleValue(listItemStyle, 'line-height')
    || extractStyleValue(paragraphStyle, 'line-height')
    || extractStyleValue(containerStyle, 'line-height');
  const color = extractStyleValue(listItemStyle, 'color')
    || extractStyleValue(paragraphStyle, 'color')
    || extractStyleValue(containerStyle, 'color');
  const fontFamily = extractStyleValue(listItemStyle, 'font-family')
    || extractStyleValue(paragraphStyle, 'font-family')
    || extractStyleValue(containerStyle, 'font-family');

  doc.querySelectorAll('ol, ul').forEach((list) => {
    const currentStyle = list.getAttribute('style') || '';
    list.setAttribute(
      'style',
      mergeStyleText(currentStyle, buildTypographyStyle({
        fontSize,
        lineHeight,
        color,
        fontFamily
      }), listStyle)
    );
  });

  doc.querySelectorAll('li').forEach((item) => {
    const currentStyle = item.getAttribute('style') || '';
    item.setAttribute(
      'style',
      mergeStyleText(currentStyle, buildTypographyStyle({
        fontSize,
        lineHeight,
        color,
        fontFamily
      }))
    );
  });
}

function buildTypographyStyle({ fontSize, lineHeight, color, fontFamily }) {
  const declarations = [];
  if (fontSize) declarations.push(`font-size: ${fontSize} !important;`);
  if (lineHeight) declarations.push(`line-height: ${lineHeight} !important;`);
  if (color) declarations.push(`color: ${color} !important;`);
  if (fontFamily) declarations.push(`font-family: ${fontFamily} !important;`);
  return declarations.join(' ');
}

function mergeStyleText(...parts) {
  return parts
    .filter(Boolean)
    .map((part) => String(part).trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

function normalizeBlockquotes(doc) {
  doc.querySelectorAll('blockquote').forEach((blockquote) => {
    let style = blockquote.getAttribute('style') || '';
    style = style.replace(/background(?:-color)?:\s*[^;]+;?/gi, '');
    style = style.replace(/color:\s*[^;]+;?/gi, '');
    style += '; background: rgba(0, 0, 0, 0.05) !important; color: rgba(0, 0, 0, 0.8) !important;';
    blockquote.setAttribute('style', style);
  });
}

const ALERT_STYLES = {
  note: { borderColor: '#388bfd', bg: 'rgba(56,139,253,0.04)', titleColor: '#388bfd' },
  tip: { borderColor: '#3fb950', bg: 'rgba(63,185,80,0.04)', titleColor: '#3fb950' },
  important: { borderColor: '#a371f7', bg: 'rgba(163,113,247,0.04)', titleColor: '#a371f7' },
  warning: { borderColor: '#d29922', bg: 'rgba(210,153,34,0.04)', titleColor: '#d29922' },
  caution: { borderColor: '#f85149', bg: 'rgba(248,81,73,0.04)', titleColor: '#f85149' }
};

function normalizeAlertsForWechat(doc) {
  doc.querySelectorAll('.markdown-alert').forEach((alert) => {
    const classes = Array.from(alert.classList);
    let type = 'note';
    for (const cls of classes) {
      const match = cls.match(/^markdown-alert-(note|tip|important|warning|caution)$/);
      if (match) { type = match[1]; break; }
    }

    const colors = ALERT_STYLES[type] || ALERT_STYLES.note;

    // Extract title text and content
    const titleEl = alert.querySelector('.markdown-alert-title');
    const titleText = titleEl ? titleEl.textContent || '' : '';

    const blockquote = doc.createElement('blockquote');
    blockquote.setAttribute('style',
      'padding: 12px 16px; margin: 16px 0; border-left: 4px solid ' + colors.borderColor +
      '; background: ' + colors.bg + ';'
    );

    if (titleText) {
      const titleDiv = doc.createElement('div');
      titleDiv.setAttribute('style',
        'font-weight: 600; font-size: 14px; margin-bottom: 6px; color: ' + colors.titleColor + ';'
      );
      titleDiv.textContent = titleText;
      blockquote.appendChild(titleDiv);
    }

    // Move remaining child nodes (p, etc.) into blockquote
    while (alert.firstChild) {
      const child = alert.firstChild;
      if (child === titleEl || child.classList?.contains('markdown-alert-title')) {
        alert.removeChild(child);
        continue;
      }
      blockquote.appendChild(child);
    }

    alert.parentNode.replaceChild(blockquote, alert);
  });
}

function normalizeTablesForWechat(doc) {
  const wrappedTables = doc.querySelectorAll('.md-table-scroll > table');
  wrappedTables.forEach((table) => {
    const wrapper = table.parentElement;
    if (!wrapper || !wrapper.parentNode) return;
    wrapper.parentNode.insertBefore(table, wrapper);
    wrapper.remove();
  });

  doc.querySelectorAll('table').forEach((table) => {
    const tableStyle = table.getAttribute('style') || '';
    table.setAttribute(
      'style',
      `${tableStyle}; width: 100% !important; max-width: 100% !important; table-layout: fixed !important;`
    );
  });

  doc.querySelectorAll('th, td').forEach((cell) => {
    const cellStyle = cell.getAttribute('style') || '';
    cell.setAttribute(
      'style',
      `${cellStyle}; word-break: break-word; overflow-wrap: anywhere; white-space: normal;`
    );
  });
}

function wrapSectionIfNeeded(doc, styleConfig) {
  const containerBg = extractBackgroundColor(styleConfig.styles.container);
  if (!containerBg || containerBg === '#fff' || containerBg === '#ffffff') return;

  const section = doc.createElement('section');
  const containerStyle = styleConfig.styles.container;
  const paddingMatch = containerStyle.match(/padding:\s*([^;]+)/);
  const maxWidthMatch = containerStyle.match(/max-width:\s*([^;]+)/);

  section.setAttribute(
    'style',
    `background-color: ${containerBg}; padding: ${paddingMatch ? paddingMatch[1].trim() : '16px 8px'}; max-width: ${maxWidthMatch ? maxWidthMatch[1].trim() : '100%'}; margin: 0 auto; box-sizing: border-box; word-wrap: break-word;`
  );

  while (doc.body.firstChild) {
    section.appendChild(doc.body.firstChild);
  }

  doc.body.appendChild(section);
}

function buildClipboardPlainText(doc) {
  const clone = doc.body.cloneNode(true);

  replaceFormulaNodesWithPlainText(clone);

  clone.querySelectorAll('br').forEach((br) => {
    br.replaceWith('\n');
  });

  clone.querySelectorAll('p, div, section, pre, blockquote, li, h1, h2, h3, h4, h5, h6, tr').forEach((node) => {
    if (!node.textContent?.endsWith('\n')) {
      node.append('\n');
    }
  });

  return (clone.textContent || '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function replaceFormulaNodesWithPlainText(root) {
  root.querySelectorAll('[data-formula-plain]').forEach((node) => {
    const formulaText = node.getAttribute('data-formula-plain') || '';
    node.replaceWith(root.ownerDocument.createTextNode(formulaText));
  });
}

export async function copyToWechat({ renderedHTML, styleConfig, imageStore, showToast, codeTheme }) {
  if (!renderedHTML) {
    showToast('没有内容可复制', 'error');
    return false;
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(renderedHTML, 'text/html');

    convertGridToTable(doc);
    normalizeTablesForWechat(doc);

    const images = Array.from(doc.querySelectorAll('img'));
    if (images.length > 0) {
      showToast(`正在处理 ${images.length} 张图片...`, 'success');
      let successCount = 0;
      let failCount = 0;
      let gifCount = 0;

      for (const img of images) {
        try {
          if (await isGifImage(img, imageStore)) {
            replaceGifWithPlaceholder(img);
            gifCount += 1;
            continue;
          }

          const base64 = await convertImageToBase64(img, imageStore);
          img.setAttribute('src', base64);
          successCount += 1;
        } catch (_error) {
          console.warn('Clipboard image conversion failed, keeping original src:', _error);
          failCount += 1;
        }
      }

      if (gifCount > 0 || failCount > 0) {
        showToast(`图片处理完成：成功 ${successCount} 张，GIF ${gifCount} 张，失败 ${failCount} 张`, failCount > 0 ? 'error' : 'success');
      }
    }

    await convertMathForWechat(doc);
    applyCodeHighlighting(doc, { codeTheme, styleConfig });
    convertCodeBlocks(doc, styleConfig, codeTheme);
    flattenListItems(doc);
    convertOrderedListsToWechatParagraphs(doc, styleConfig);
    normalizeListTypographyForWechat(doc, styleConfig);
    normalizeBlockquotes(doc);
    normalizeAlertsForWechat(doc);
    wrapSectionIfNeeded(doc, styleConfig);

    const text = buildClipboardPlainText(doc);
    stripFormulaExportMetadata(doc.body);
    const html = doc.body.innerHTML;

    const item = new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([text], { type: 'text/plain' })
    });

    await navigator.clipboard.write([item]);
    showToast('复制成功', 'success');
    return true;
  } catch (error) {
    console.error('复制失败:', error);
    showToast('复制失败', 'error');
    return false;
  }
}
