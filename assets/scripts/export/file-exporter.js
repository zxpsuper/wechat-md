/**
 * File exporter with embedded images (Base64)
 * @module file-exporter
 */

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function getImageBase64(imageId, imageStore) {
  if (!imageStore) return null;

  try {
    const record = await imageStore.getImageRecord(imageId);
    if (record && record.blob) {
      return await blobToDataURL(record.blob);
    }
  } catch (error) {
    console.warn('Failed to read image from store:', error);
  }

  try {
    const blob = await imageStore.getImageBlob(imageId);
    if (blob) {
      return await blobToDataURL(blob);
    }
  } catch (error) {
    console.warn('Failed to read image blob:', error);
  }

  return null;
}

export async function replaceImageUrlsWithBase64(content, imageStore) {
  if (!content || !imageStore) return content;

  const imageIdPattern = /img:\/\/(img-[a-zA-Z0-9_-]+)/g;
  const imageIds = new Set();
  let match;

  while ((match = imageIdPattern.exec(content)) !== null) {
    imageIds.add(match[1]);
  }

  if (imageIds.size === 0) return content;

  let result = content;

  for (const imageId of imageIds) {
    const base64 = await getImageBase64(imageId, imageStore);
    if (base64) {
      const imgProtocol = `img://${imageId}`;
      result = result.split(imgProtocol).join(base64);
    }
  }

  return result;
}

export async function exportMarkdownWithImages({ markdownInput, imageStore, filename, showToast }) {
  if (!markdownInput) {
    showToast('没有内容可导出', 'error');
    return;
  }

  try {
    showToast('正在处理图片...', 'success');
    const content = await replaceImageUrlsWithBase64(markdownInput, imageStore);

    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    showToast('已导出 Markdown', 'success');
  } catch (error) {
    console.error('Export markdown failed:', error);
    showToast('导出失败', 'error');
  }
}

export async function exportHTMLWithImages({ renderedHTML, imageStore, filename, showToast }) {
  if (!renderedHTML) {
    showToast('没有内容可导出', 'error');
    return;
  }

  try {
    showToast('正在处理图片...', 'success');

    const parser = new DOMParser();
    const doc = parser.parseFromString(renderedHTML, 'text/html');
    const images = Array.from(doc.querySelectorAll('img'));

    let successCount = 0;
    let failCount = 0;

    for (const img of images) {
      const src = img.getAttribute('src') || '';

      if (src.startsWith('data:')) {
        continue;
      }

      if (src.startsWith('img://')) {
        const imageId = src.replace('img://', '');
        const base64 = await getImageBase64(imageId, imageStore);
        if (base64) {
          img.setAttribute('src', base64);
          successCount++;
        } else {
          failCount++;
        }
      } else if (src.startsWith('blob:')) {
        try {
          const response = await fetch(src);
          const blob = await response.blob();
          const base64 = await blobToDataURL(blob);
          if (base64) {
            img.setAttribute('src', base64);
            successCount++;
          } else {
            failCount++;
          }
        } catch (_error) {
          failCount++;
        }
      } else if (src && !src.startsWith('http') && !src.startsWith('data:')) {
        failCount++;
      }
    }

    const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${filename.replace('.html', '')}</title>
  <style>
    body {
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      line-height: 1.6;
      color: #333;
    }
    img {
      max-width: 100%;
      height: auto;
    }
  </style>
</head>
<body>
${doc.body.innerHTML}
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);

    if (failCount > 0) {
      showToast(`已导出 HTML（${failCount} 张图片处理失败）`, 'error');
    } else {
      showToast('已导出 HTML', 'success');
    }
  } catch (error) {
    console.error('Export HTML failed:', error);
    showToast('导出失败', 'error');
  }
}
