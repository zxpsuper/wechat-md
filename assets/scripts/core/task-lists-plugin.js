/**
 * Task list (checkbox) plugin for markdown-it.
 * Converts - [ ] / - [x] syntax into checklist items.
 * @module task-lists-plugin
 */

function taskListsPlugin(md) {
  md.core.ruler.push('task-lists', function(state) {
    const tokens = state.tokens;

    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== 'list_item_open') continue;

      const listItemOpen = tokens[i];
      let inlineToken = null;

      for (let j = i + 1; j < tokens.length; j++) {
        if (tokens[j].type === 'list_item_close') break;
        if (tokens[j].type === 'inline') {
          inlineToken = tokens[j];
          break;
        }
      }

      if (!inlineToken) continue;

      const content = inlineToken.content;
      const match = content.match(/^\s*\[([ xX]?)\]\s+/);
      if (!match) continue;

      const isChecked = match[1] && match[1].toLowerCase() === 'x';
      const checkboxHtml = '<input type="checkbox" disabled' + (isChecked ? ' checked' : '') + '> ';

      listItemOpen.meta = listItemOpen.meta || {};
      listItemOpen.meta.taskItem = true;

      inlineToken.content = content.slice(match[0].length);

      // Remove [ ] / [x] prefix from children tokens
      if (inlineToken.children && inlineToken.children.length > 0) {
        const children = inlineToken.children;
        let consumed = 0;
        for (let k = 0; k < children.length; k++) {
          const child = children[k];
          if (child.type === 'text') {
            const text = child.content;
            const textMatch = text.match(/^\s*\[[ xX]?\]\s*/);
            if (textMatch) {
              child.content = text.slice(textMatch[0].length);
              consumed = 1;
            }
            break;
          }
        }
        if (consumed > 0) {
          // Replace the first text token (now empty or with remaining content)
          // with an html_inline token for the checkbox
          const textToken = children[0];
          if (textToken.content === '') {
            children[0] = new state.Token('html_inline', '', 0);
            children[0].content = checkboxHtml;
          } else {
            // Insert checkbox before the text token
            const checkboxToken = new state.Token('html_inline', '', 0);
            checkboxToken.content = checkboxHtml;
            children.unshift(checkboxToken);
          }
        }
      }
    }
  });

  const originalListItemRender = md.renderer.rules.list_item_open || function() {
    return '<li>';
  };

  md.renderer.rules.list_item_open = function(tokens, idx) {
    const token = tokens[idx];
    if (token.meta && token.meta.taskItem) {
      return '<li class="task-list-item">';
    }
    return originalListItemRender(tokens, idx);
  };
}

export default taskListsPlugin;