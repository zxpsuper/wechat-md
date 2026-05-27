import { applyCodeHighlighting } from './code-highlight.js';

/**
 * Render pipeline.
 * @module render-pipeline
 */

export async function renderPipeline({ markdown, md, imageStore, styleConfig, codeTheme, displaySettings }) {
  if (!markdown.trim()) return '';

  const { preprocessMarkdown } = await import('./markdown-engine.js');
  const processedContent = preprocessMarkdown(markdown);

  const html = md.render(processedContent);

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  if (imageStore) {
    await processDocumentImages(doc, imageStore);
  }

  return applyInlineStyles(doc, styleConfig, codeTheme, displaySettings);
}

async function processDocumentImages(doc, imageStore) {
  const images = doc.querySelectorAll('img');

  for (const img of images) {
    const src = img.getAttribute('src');
    if (!src?.startsWith('img://')) continue;

    const imageId = src.replace('img://', '');

    try {
      const objectURL = await imageStore.getImage(imageId);
      if (objectURL) {
        img.setAttribute('src', objectURL);
        img.setAttribute('data-image-id', imageId);
      }
    } catch (_error) {
      img.setAttribute('alt', '图片加载失败');
    }
  }
}

function applyInlineStyles(doc, styleConfig, codeTheme, displaySettings) {
  const style = styleConfig.styles;
  const fontScale = Number(displaySettings?.fontScale) || 1;
  const scaledStyle = fontScale !== 1 ? scaleStyleFontSizes(style, fontScale) : style;

  annotateMathFormulaNodes(doc);
  groupConsecutiveImages(doc);
  assignHeadingIds(doc);

  Object.keys(scaledStyle).forEach((selector) => {
    if (selector === 'container' || selector === 'pre' || selector === 'code' || selector === 'pre code') return;

    const elements = doc.querySelectorAll(selector);
    elements.forEach((element) => {
      if (element.tagName === 'IMG' && element.closest('.image-grid')) return;
      appendStyleText(element, scaledStyle[selector]);
    });
  });

  applyImageGridThemeStyles(doc, scaledStyle);
  applyAlertInlineStyles(doc);
  normalizeTableOverflow(doc);
  applyInlineCodeStyles(doc, scaledStyle);
  applyStandalonePreStyles(doc, scaledStyle);
  applyCodeBlockStyles(doc, scaledStyle, codeTheme, fontScale);
  applyCodeHighlighting(doc, { codeTheme, styleConfig });
  applyImageDisplaySettings(doc, displaySettings);

  const container = doc.createElement('div');
  container.setAttribute('style', scaledStyle.container);
  container.innerHTML = doc.body.innerHTML;
  return container.outerHTML;
}

function applyImageGridThemeStyles(doc, style) {
  const imageStyle = style?.img || '';
  if (!imageStyle) return;

  const visualStyle = filterStyleDeclarations(imageStyle, [
    'border',
    'border-top',
    'border-right',
    'border-bottom',
    'border-left',
    'border-color',
    'border-style',
    'border-width',
    'border-radius',
    'box-shadow',
    '-webkit-box-shadow',
    'background',
    'background-color'
  ]);
  const imageOnlyStyle = filterStyleDeclarations(imageStyle, [
    'filter',
    'opacity'
  ]);
  const maxHeight = extractStyleValue(imageStyle, 'max-height');
  const gridSpacing = buildGridSpacingFromImageStyle(imageStyle);

  doc.querySelectorAll('.image-grid').forEach((grid) => {
    appendStyleText(grid, gridSpacing);

    Array.from(grid.children).forEach((wrapper) => {
      appendStyleText(wrapper, 'overflow: visible;');

      const img = wrapper.querySelector('img');
      if (img && maxHeight) {
        appendStyleText(img, `max-height: ${maxHeight}; object-fit: contain;`);
      }
      if (img) {
        appendStyleText(img, visualStyle);
        appendStyleText(img, imageOnlyStyle);
      }
    });
  });
}

const ALERT_STYLES = {
  note: { borderColor: '#388bfd', bg: 'rgba(56,139,253,0.04)', titleColor: '#388bfd' },
  tip: { borderColor: '#3fb950', bg: 'rgba(63,185,80,0.04)', titleColor: '#3fb950' },
  important: { borderColor: '#a371f7', bg: 'rgba(163,113,247,0.04)', titleColor: '#a371f7' },
  warning: { borderColor: '#d29922', bg: 'rgba(210,153,34,0.04)', titleColor: '#d29922' },
  caution: { borderColor: '#f85149', bg: 'rgba(248,81,73,0.04)', titleColor: '#f85149' }
};

function applyAlertInlineStyles(doc) {
  doc.querySelectorAll('.markdown-alert').forEach((alert) => {
    const classes = Array.from(alert.classList);
    let type = 'note';
    for (const cls of classes) {
      const match = cls.match(/^markdown-alert-(note|tip|important|warning|caution)$/);
      if (match) { type = match[1]; break; }
    }

    const colors = ALERT_STYLES[type] || ALERT_STYLES.note;
    appendStyleText(alert,
      'padding: 12px 16px !important; margin: 16px 0 !important; border-left: 4px solid ' + colors.borderColor +
      ' !important; border-radius: 4px !important; background: ' + colors.bg +
      ' !important;'
    );

    const title = alert.querySelector('.markdown-alert-title');
    if (title) {
      appendStyleText(title,
        'font-weight: 600 !important; font-size: 14px !important; margin-bottom: 8px !important; color: ' + colors.titleColor + ' !important;'
      );
    }
  });
}

function filterStyleDeclarations(styleText, allowedProperties) {
  if (!styleText) return '';

  const allowed = new Set(allowedProperties.map((property) => property.toLowerCase()));
  return styleText
    .split(';')
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .filter((declaration) => {
      const property = declaration.split(':')[0]?.trim().toLowerCase();
      return allowed.has(property);
    })
    .join('; ');
}

function buildGridSpacingFromImageStyle(imageStyle) {
  const top = extractStyleValue(imageStyle, 'margin-top') || extractBoxSideValue(imageStyle, 'margin', 'top');
  const bottom = extractStyleValue(imageStyle, 'margin-bottom') || extractBoxSideValue(imageStyle, 'margin', 'bottom');
  const declarations = [];

  if (top) declarations.push(`margin-top: ${top};`);
  if (bottom) declarations.push(`margin-bottom: ${bottom};`);

  return declarations.join(' ');
}

function extractBoxSideValue(styleText, property, side) {
  const value = extractStyleValue(styleText, property);
  if (!value) return null;

  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return side === 'top' || side === 'bottom' ? parts[0] : parts[1];
  if (parts.length === 3) return side === 'bottom' ? parts[2] : parts[0];
  return side === 'top' ? parts[0] : side === 'right' ? parts[1] : side === 'bottom' ? parts[2] : parts[3];
}

function scaleStyleFontSizes(style, scale) {
  const result = {};
  Object.keys(style).forEach((selector) => {
    result[selector] = scaleFontSizeInDeclaration(style[selector], scale);
  });
  return result;
}

function scaleFontSizeInDeclaration(declaration, scale) {
  if (!declaration || typeof declaration !== 'string') return declaration;
  return declaration.replace(/(font-size\s*:\s*)([\d.]+)(px|rem|em|pt)/gi, (_match, prefix, value, unit) => {
    const scaled = (parseFloat(value) * scale).toFixed(2).replace(/\.?0+$/, '');
    return `${prefix}${scaled}${unit}`;
  });
}

function applyImageDisplaySettings(doc, displaySettings) {
  if (!displaySettings || displaySettings.imageStyleMode !== 'custom') return;

  const marginTop = clampNumber(displaySettings.imageMarginTop, 0, 200, 24);
  const marginBottom = clampNumber(displaySettings.imageMarginBottom, 0, 200, 32);
  const radius = displaySettings.imageRadiusMode === 'circle'
    ? '50%'
    : `${clampNumber(displaySettings.imageRadius, 0, 360, 8)}px`;
  const shadow = buildShadowValue(displaySettings);
  const overrideDecl = `margin-top: ${marginTop}px !important; margin-bottom: ${marginBottom}px !important; border-radius: ${radius} !important; box-shadow: ${shadow} !important;`;

  doc.querySelectorAll('img').forEach((img) => {
    if (img.closest('.image-grid')) return;
    appendStyleText(img, overrideDecl);
  });

  doc.querySelectorAll('.image-grid').forEach((grid) => {
    appendStyleText(grid, `margin-top: ${marginTop}px !important; margin-bottom: ${marginBottom}px !important;`);
    Array.from(grid.children).forEach((wrapper) => {
      appendStyleText(wrapper, 'overflow: visible !important;');
      const img = wrapper.querySelector('img');
      if (img) {
        appendStyleText(img, `border-radius: ${radius} !important; box-shadow: ${shadow} !important;`);
      }
    });
  });
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function buildShadowValue(displaySettings) {
  const x = clampNumber(displaySettings.imageShadowX, -80, 80, 0);
  const y = clampNumber(displaySettings.imageShadowY, -80, 80, 12);
  const blur = clampNumber(displaySettings.imageShadowBlur, 0, 120, 28);
  const spread = clampNumber(displaySettings.imageShadowSpread, -40, 80, 0);
  const opacity = clampNumber(displaySettings.imageShadowOpacity, 0, 1, 0.18);
  const color = hexToRgba(displaySettings.imageShadowColor, opacity);
  return `${x}px ${y}px ${blur}px ${spread}px ${color}`;
}

function hexToRgba(hex, opacity) {
  const normalized = String(hex || '').trim().replace('#', '');
  const fullHex = normalized.length === 3
    ? normalized.split('').map((char) => char + char).join('')
    : normalized;

  if (!/^[0-9a-fA-F]{6}$/.test(fullHex)) {
    return `rgba(0, 0, 0, ${opacity})`;
  }

  const red = parseInt(fullHex.slice(0, 2), 16);
  const green = parseInt(fullHex.slice(2, 4), 16);
  const blue = parseInt(fullHex.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}

function assignHeadingIds(doc) {
  const headings = Array.from(doc.querySelectorAll('h1, h2, h3'));
  const idCounts = new Map();
  const usedIds = new Set();

  headings.forEach((heading) => {
    const text = (heading.textContent || '').trim();
    const preferredId = heading.getAttribute('id') || createHeadingSlug(text);
    let count = idCounts.get(preferredId) || 0;
    let id = count === 0 ? preferredId : `${preferredId}-${count + 1}`;

    while (usedIds.has(id)) {
      count += 1;
      id = `${preferredId}-${count + 1}`;
    }

    idCounts.set(preferredId, count + 1);
    usedIds.add(id);
    heading.setAttribute('id', id);
  });
}

function createHeadingSlug(text) {
  const normalized = String(text || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\u3400-\u4dbf\u4e00-\u9fff-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return normalized || 'heading';
}

function annotateMathFormulaNodes(doc) {
  const annotations = Array.from(doc.querySelectorAll('annotation[encoding="application/x-tex"]'));
  const seen = new Set();

  annotations.forEach((annotation) => {
    const formulaRoot = annotation.closest('.katex-display') || annotation.closest('.katex');
    if (!formulaRoot || seen.has(formulaRoot)) return;

    const latex = normalizeFormulaSource(annotation.textContent || '');
    if (!latex) return;

    seen.add(formulaRoot);
    formulaRoot.setAttribute('data-formula-source', latex);
    formulaRoot.setAttribute('data-math-mode', formulaRoot.classList.contains('katex-display') ? 'display' : 'inline');
  });
}

function normalizeFormulaSource(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
}

function appendStyleText(element, styleText) {
  if (!styleText) return;
  const currentStyle = element.getAttribute('style') || '';
  element.setAttribute('style', currentStyle ? `${currentStyle}; ${styleText}` : styleText);
}

function mergeStyleText(...parts) {
  return parts
    .filter(Boolean)
    .map((part) => String(part).trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

function normalizeTableOverflow(doc) {
  const tables = Array.from(doc.querySelectorAll('table'));

  tables.forEach((table) => {
    if (table.closest('.md-table-scroll')) return;

    appendStyleText(table, 'max-width: 100%; width: max-content; min-width: 100%; table-layout: auto;margin:16px 2px;');

    const parent = table.parentNode;
    if (!parent) return;

    const wrapper = doc.createElement('div');
    wrapper.className = 'md-table-scroll';
    wrapper.setAttribute(
      'style',
      'max-width: 100%; width: 100%; overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch;margin-bottom:24px;'
    );

    parent.insertBefore(wrapper, table);
    wrapper.appendChild(table);
  });
}

function applyInlineCodeStyles(doc, style) {
  if (!style.code) return;
  const inlineCodes = doc.querySelectorAll('code:not(.md-code-block-code)');
  inlineCodes.forEach((codeElement) => {
    if (codeElement.closest('pre')) return;
    appendStyleText(codeElement, style.code);
  });
}

function applyStandalonePreStyles(doc, style) {
  if (!style.pre) return;
  const standalonePre = doc.querySelectorAll('pre:not(.md-code-block-pre)');
  standalonePre.forEach((preElement) => {
    appendStyleText(preElement, style.pre);
  });
}

function applyCodeBlockStyles(doc, style, codeTheme, fontScale = 1) {
  const blocks = doc.querySelectorAll('[data-code-block="true"]');
  if (blocks.length === 0) return;

  const resolvedStyles = codeTheme
    ? buildCodeThemeStyles(codeTheme, fontScale)
    : buildThemeCodeBlockStyles(style);

  blocks.forEach((block) => {
    const pre = block.querySelector('.md-code-block-pre');
    const code = block.querySelector('.md-code-block-code');

    block.setAttribute('style', resolvedStyles.block);

    if (pre) {
      pre.setAttribute('style', resolvedStyles.pre);
    }

    if (code) {
      code.setAttribute('style', resolvedStyles.code);
    }
  });
}

function buildCodeThemeStyles(codeTheme, fontScale = 1) {
  const scaledFontSize = `${Number((14 * fontScale).toFixed(2)).toString()}px`;
  return {
    block: 'margin: 24px 0;',
    pre: `margin: 0; padding: 16px; overflow-x: auto; background: ${codeTheme.bg}; border: 1px solid ${codeTheme.borderColor}; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.12); -webkit-box-shadow: 0 2px 8px rgba(0,0,0,0.12);`,
    code: `display: block; margin: 0; background: transparent; color: ${codeTheme.textColor}; font-family: 'SF Mono', Monaco, 'Cascadia Code', Consolas, monospace; font-size: ${scaledFontSize}; line-height: 1.7; white-space: pre; tab-size: 2;`
  };
}

function buildThemeCodeBlockStyles(style) {
  const preStyle = style.pre || '';
  const cleanCodeStyle = sanitizeThemeCodeStyle(style.code || '');
  const preTextColor = extractStyleValue(preStyle, 'color');
  const codeHasColor = Boolean(extractStyleValue(cleanCodeStyle, 'color'));
  const textColorFallback = preTextColor && !codeHasColor ? `color: ${preTextColor};` : '';
  const fontFamilyFallback = extractStyleValue(cleanCodeStyle, 'font-family')
    ? ''
    : "font-family: 'SF Mono', Monaco, 'Cascadia Code', Consolas, monospace;";
  const fontSizeFallback = extractStyleValue(cleanCodeStyle, 'font-size') ? '' : 'font-size: 14px;';
  const lineHeightFallback = extractStyleValue(cleanCodeStyle, 'line-height') ? '' : 'line-height: 1.7;';

  return {
    block: 'margin: 24px 0;',
    pre: `margin: 0; padding: 16px; overflow-x: auto; ${preStyle}`,
    code: `display: block; margin: 0; background: transparent; white-space: pre; tab-size: 2; ${fontFamilyFallback} ${fontSizeFallback} ${lineHeightFallback} ${textColorFallback} ${cleanCodeStyle}`
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

function groupConsecutiveImages(doc) {
  const body = doc.body;
  const children = Array.from(body.children);
  const imagesToProcess = [];

  children.forEach((child, index) => {
    if (child.tagName === 'P') {
      const images = child.querySelectorAll('img');
      if (images.length > 0) {
        if (images.length > 1) {
          imagesToProcess.push(...Array.from(images).map((img) => ({ element: child, img, index })));
        } else {
          imagesToProcess.push({ element: child, img: images[0], index });
        }
      }
    } else if (child.tagName === 'IMG') {
      imagesToProcess.push({ element: child, img: child, index });
    }
  });

  let currentGroup = [];
  const groups = [];

  imagesToProcess.forEach((item, idx) => {
    if (idx === 0) {
      currentGroup.push(item);
      return;
    }

    const previous = imagesToProcess[idx - 1];
    const isContinuous = item.index === previous.index || item.index - previous.index === 1;

    if (isContinuous) {
      currentGroup.push(item);
    } else {
      if (currentGroup.length > 0) groups.push([...currentGroup]);
      currentGroup = [item];
    }
  });

  if (currentGroup.length > 0) groups.push(currentGroup);

  groups.forEach((group) => {
    if (group.length < 2) return;

    const firstElement = group[0].element;
    const gridContainer = doc.createElement('div');
    const count = group.length;
    const columns = count === 2 ? 2 : count === 4 ? 2 : 3;

    gridContainer.className = 'image-grid';
    gridContainer.setAttribute('data-columns', String(columns));
    gridContainer.setAttribute(
      'style',
      `display: grid; grid-template-columns: repeat(${columns}, 1fr); gap: 18px; margin: 20px auto; max-width: 100%; align-items: start; overflow: visible;`
    );

    group.forEach((item) => {
      const wrapper = doc.createElement('div');
      wrapper.setAttribute('style', 'width: 100%; height: auto; overflow: visible;');

      const image = item.img.cloneNode(true);
      const imageStyle = item.img.getAttribute('style') || '';
      image.setAttribute('style', mergeStyleText(imageStyle, 'width: 100%; height: auto; display: block;'));
      wrapper.appendChild(image);
      gridContainer.appendChild(wrapper);
    });

    firstElement.parentNode.insertBefore(gridContainer, firstElement);

    const uniqueElements = new Set(group.map((item) => item.element));
    uniqueElements.forEach((element) => {
      if (element.parentNode) element.parentNode.removeChild(element);
    });
  });
}
