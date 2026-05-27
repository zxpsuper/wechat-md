/**
 * Clipboard exporter for Zhihu.
 * Copies raw Markdown to clipboard, stripping local img:// references
 * since Zhihu's editor doesn't support base64 images reliably.
 * @module zhihu-clipboard-exporter
 */

export async function copyToZhihu({ markdownContent, showToast }) {
  if (!markdownContent || !markdownContent.trim()) {
    showToast('没有内容可复制', 'error');
    return false;
  }

  try {
    let content = markdownContent;

    // Strip local img:// references — Zhihu can't handle them
    const imgRegex = /!\[([^\]]*)\]\(img:\/\/[^)]+\)/g;
    const matches = content.match(imgRegex);
    const removedCount = matches ? matches.length : 0;

    if (removedCount > 0) {
      content = content.replace(imgRegex, '');
    }

    const item = new ClipboardItem({
      'text/plain': new Blob([content], { type: 'text/plain' })
    });

    await navigator.clipboard.write([item]);

    const msg = removedCount > 0
      ? `已复制到知乎（已移除 ${removedCount} 张本地图片，请自行复制）`
      : '已复制到知乎';
    showToast(msg, 'success');
    return true;
  } catch (error) {
    console.error('复制到知乎失败:', error);
    showToast('复制失败', 'error');
    return false;
  }
}