/**
 * GitHub Alerts plugin for markdown-it
 * Supports: NOTE, TIP, IMPORTANT, WARNING, CAUTION
 * @module alerts-plugin
 */

const ALERT_TYPES = {
  NOTE: { label: 'Note', icon: 'ℹ️' },
  TIP: { label: 'Tip', icon: '💡' },
  IMPORTANT: { label: 'Important', icon: '❗' },
  WARNING: { label: 'Warning', icon: '⚠️' },
  CAUTION: { label: 'Caution', icon: '🚨' }
};

const ALERT_PATTERN = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/;

const ALERT_STYLE_MAP = {
  note: {
    container: 'padding:12px 16px;margin:16px 0;border-left:4px solid #388bfd;border-radius:4px;background:rgba(56,139,253,0.04)',
    title: 'font-weight:600;font-size:14px;margin-bottom:8px;color:#388bfd'
  },
  tip: {
    container: 'padding:12px 16px;margin:16px 0;border-left:4px solid #3fb950;border-radius:4px;background:rgba(63,185,80,0.04)',
    title: 'font-weight:600;font-size:14px;margin-bottom:8px;color:#3fb950'
  },
  important: {
    container: 'padding:12px 16px;margin:16px 0;border-left:4px solid #a371f7;border-radius:4px;background:rgba(163,113,247,0.04)',
    title: 'font-weight:600;font-size:14px;margin-bottom:8px;color:#a371f7'
  },
  warning: {
    container: 'padding:12px 16px;margin:16px 0;border-left:4px solid #d29922;border-radius:4px;background:rgba(210,153,34,0.04)',
    title: 'font-weight:600;font-size:14px;margin-bottom:8px;color:#d29922'
  },
  caution: {
    container: 'padding:12px 16px;margin:16px 0;border-left:4px solid #f85149;border-radius:4px;background:rgba(248,81,73,0.04)',
    title: 'font-weight:600;font-size:14px;margin-bottom:8px;color:#f85149'
  }
};

function alertsPlugin(md) {
  md.core.ruler.push('alerts', function(state) {
    const tokens = state.tokens;

    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== 'blockquote_open') continue;

      const openIndex = i;
      let closeIndex = -1;
      let depth = 0;

      for (let j = openIndex; j < tokens.length; j++) {
        if (tokens[j].type === 'blockquote_open') depth++;
        if (tokens[j].type === 'blockquote_close') {
          depth--;
          if (depth === 0) {
            closeIndex = j;
            break;
          }
        }
      }

      if (closeIndex === -1) continue;

      let firstInline = null;
      let firstInlineIndex = -1;

      for (let j = openIndex + 1; j < closeIndex; j++) {
        if (tokens[j].type === 'inline') {
          firstInline = tokens[j];
          firstInlineIndex = j;
          break;
        }
      }

      if (!firstInline) continue;

      const lines = firstInline.content.split('\n');
      const firstLine = lines[0].trim();

      const match = firstLine.match(ALERT_PATTERN);
      if (!match) continue;

      const alertType = match[1];
      const alertInfo = ALERT_TYPES[alertType];

      tokens[openIndex].type = 'alert_open';
      tokens[openIndex].tag = 'div';
      tokens[openIndex].meta = { alertType, alertInfo };

      tokens[closeIndex].type = 'alert_close';
      tokens[closeIndex].tag = 'div';

      const headerTokens = [
        Object.assign(new state.Token('alert_header_open', 'div', 1), {
          meta: { alertType, alertInfo }
        }),
        Object.assign(new state.Token('inline', '', 0), {
          content: alertInfo.icon + ' ' + alertInfo.label,
          children: [
            Object.assign(new state.Token('text', '', 0), {
              content: alertInfo.icon + ' ' + alertInfo.label
            })
          ]
        }),
        new state.Token('alert_header_close', 'div', -1)
      ];

      tokens.splice(openIndex + 1, 0, ...headerTokens);

      const adjustedInlineIndex = firstInlineIndex + headerTokens.length;

      lines.shift();
      const remainingContent = lines.join('\n').trim();

      if (remainingContent) {
        tokens[adjustedInlineIndex].content = remainingContent;
        if (tokens[adjustedInlineIndex].children) {
          const children = tokens[adjustedInlineIndex].children;
          let removeCount = 0;
          for (let k = 0; k < children.length; k++) {
            if (children[k].type === 'softbreak') {
              removeCount = k + 1;
              break;
            }
          }
          if (removeCount > 0) {
            tokens[adjustedInlineIndex].children = children.slice(removeCount);
          }
        }
      } else {
        if (tokens[adjustedInlineIndex - 1] && tokens[adjustedInlineIndex - 1].type === 'paragraph_open') {
          tokens[adjustedInlineIndex - 1].hidden = true;
        }
        tokens[adjustedInlineIndex].hidden = true;
        if (tokens[adjustedInlineIndex + 1] && tokens[adjustedInlineIndex + 1].type === 'paragraph_close') {
          tokens[adjustedInlineIndex + 1].hidden = true;
        }
      }

      i = closeIndex + headerTokens.length;
    }
  });

  md.renderer.rules.alert_open = function(tokens, idx) {
    const token = tokens[idx];
    const alertType = token.meta.alertType.toLowerCase();
    const style = ALERT_STYLE_MAP[alertType] || ALERT_STYLE_MAP.note;
    return '<div class="markdown-alert markdown-alert-' + alertType + '" style="' + style.container + '">';
  };

  md.renderer.rules.alert_close = function() {
    return '</div>';
  };

  md.renderer.rules.alert_header_open = function(tokens, idx) {
    const token = tokens[idx];
    const alertType = token.meta.alertType.toLowerCase();
    const style = ALERT_STYLE_MAP[alertType] || ALERT_STYLE_MAP.note;
    return '<div class="markdown-alert-title markdown-alert-title-' + alertType + '" style="' + style.title + '">';
  };

  md.renderer.rules.alert_header_close = function() {
    return '</div>';
  };
}

export default alertsPlugin;
