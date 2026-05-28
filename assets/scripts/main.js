/**
 * Application entrypoint.
 * @module main
 */

import { ImageStore } from './core/image-store.js';
import { ImageCompressor } from './core/image-compressor.js';
import { createMarkdownEngine } from './core/markdown-engine.js';
import { createTurndownService, createPasteHandler } from './core/paste-handler.js';
import { renderPipeline } from './core/render-pipeline.js';
import { copyToWechat } from './export/clipboard-exporter.js';
import { copyToX } from './export/x-clipboard-exporter.js';
import { exportMarkdownWithImages, exportHTMLWithImages, replaceImageUrlsWithBase64 } from './export/file-exporter.js';
import { getCategorizedThemes, getStyleName, isRecommended, getStarredStyles, toggleStarStyle } from './ui/theme-manager.js';
import {
  getCodeThemeList,
  FOLLOW_THEME_CODE_STYLE,
  isCodeThemeSelection,
  resolveCodeTheme
} from './ui/code-themes.js';
import { createToast } from './ui/toast.js';
import { createPanelManager } from './ui/panel-manager.js';
import { loadPreferences, savePreferences, debounceSaveContent, getDefaultCodeBlockSettings, getDefaultDisplaySettings } from './storage/preferences.js';
import { STYLES } from '../styles/themes/index.js';

const { createApp, ref, watch, nextTick, onMounted, computed } = window.Vue;

const UNTITLED_PREFIX = '未命名文档';

const markdownInput = ref('');
const renderedContent = ref('');
const currentStyle = ref('wechat-default');
const starredStyles = ref([]);
const currentCodeTheme = ref(FOLLOW_THEME_CODE_STYLE);
const documents = ref([]);
const activeDocumentId = ref(null);
const currentDocumentTitle = ref('');
const documentSearch = ref('');
const previewMode = ref('desktop');
const tocVisible = ref(false);
const isDraggingOver = ref(false);
const copySuccess = ref(false);

const activePanel = ref(null);
const toastState = ref({ show: false, message: '', type: 'success' });
const sidebarOpen = ref(false);
const deleteConfirm = ref({ show: false, docId: null, docTitle: '' });

const wordCount = ref(0);
const charCount = ref(0);
const readTime = ref(0);
const lastSavedTime = ref('--');
const currentSaveState = ref('saved');

const editorWidth = ref(null);
const rightPanelWidth = ref(null);
const syncScrollEnabled = ref(true);
const codeBlockSettings = ref(getDefaultCodeBlockSettings());
const displaySettings = ref(getDefaultDisplaySettings());
const editorSelection = ref({ start: 0, end: 0 });

const categorizedThemes = ref(getCategorizedThemes());
const codeThemeList = getCodeThemeList();
const fontScaleOptions = [
  { label: '更小', value: 0.75, meta: '0.75x' },
  { label: '稍小', value: 0.85, meta: '0.85x' },
  { label: '推荐', value: 1, meta: '1.0x' },
  { label: '稍大', value: 1.15, meta: '1.15x' },
  { label: '更大', value: 1.3, meta: '1.3x' },
  { label: '超大', value: 1.5, meta: '1.5x' }
];
const imageStyleModeOptions = [
  { label: '默认', value: 'theme', meta: '跟随主题' },
  { label: '自定义', value: 'custom', meta: '覆盖样式' }
];
const imageRadiusModeOptions = [
  { label: '圆角', value: 'px' },
  { label: '圆形', value: 'circle' }
];

const toast = createToast(() => { toastState.value = toast.getState(); });
const panelManager = createPanelManager(() => { activePanel.value = panelManager.getActivePanel(); });

let md = null;
let imageStore = null;
let imageCompressor = null;
let turndownService = null;
let pasteHandler = null;
let suppressEditorSync = false;
let suppressTitleSync = false;
let syncLock = false;

const filteredDocuments = computed(() => {
  const keyword = documentSearch.value.trim().toLowerCase();

  return [...documents.value]
    .filter((doc) => {
      if (!keyword) return true;
      const haystack = [
        doc.manualTitle,
        extractMarkdownTitle(doc.content),
        doc.content
      ].join('\n').toLowerCase();
      return haystack.includes(keyword);
    })
    .sort((a, b) => {
      if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.createdAt - b.createdAt;
    });
});

const isImageStyleCustom = computed(() => displaySettings.value.imageStyleMode === 'custom');

const tocItems = computed(() => {
  if (!renderedContent.value) return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(renderedContent.value, 'text/html');

  return Array.from(doc.querySelectorAll('h1, h2, h3'))
    .map((heading) => ({
      id: heading.getAttribute('id') || '',
      level: Number(heading.tagName.slice(1)),
      text: (heading.textContent || '').trim()
    }))
    .filter((item) => item.id && item.text);
});

function createDocumentId(prefix = 'doc') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function extractMarkdownTitle(content) {
  const match = (content || '').match(/^\s*#\s+(.+?)\s*$/m);
  return match ? match[1].trim() : '';
}

function getUntitledIndex(list = documents.value) {
  let maxIndex = 0;
  const pattern = new RegExp(`^${UNTITLED_PREFIX}\\s+(\\d+)$`);

  list.forEach((doc) => {
    const displayTitle = (doc.manualTitle || doc.title || '').trim();
    const match = displayTitle.match(pattern);
    if (match) {
      maxIndex = Math.max(maxIndex, Number(match[1]));
    }
  });

  return maxIndex + 1;
}

function getUntitledTitle(list = documents.value) {
  return `${UNTITLED_PREFIX} ${getUntitledIndex(list)}`;
}

function buildDocument({
  id = createDocumentId(),
  manualTitle = '',
  title = '',
  content = '',
  createdAt = Date.now(),
  updatedAt = createdAt,
  sortOrder = documents.value.length,
  dirty = false
} = {}) {
  return {
    id,
    manualTitle,
    title,
    content,
    createdAt,
    updatedAt,
    sortOrder,
    dirty
  };
}

function getActiveDocument() {
  return documents.value.find((doc) => doc.id === activeDocumentId.value) || null;
}

function resolveDocumentDisplayTitle(doc) {
  if (!doc) return UNTITLED_PREFIX;
  return doc.manualTitle?.trim() || extractMarkdownTitle(doc.content) || doc.title?.trim() || UNTITLED_PREFIX;
}

function sanitizeFilename(name) {
  return (name || 'article')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'article';
}

function formatDateTime(timestamp) {
  if (!timestamp) return '--';
  const date = new Date(timestamp);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();

  if (sameDay) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  return `${date.toLocaleDateString('zh-CN')} ${date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })}`;
}

function formatFullDateTime(timestamp) {
  if (!timestamp) return '--';
  const date = new Date(timestamp);
  return `${date.toLocaleDateString('zh-CN')} ${date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })}`;
}

function getSaveStateLabel() {
  return {
    saving: '保存中',
    saved: '已保存',
    error: '保存失败'
  }[currentSaveState.value];
}

function getSaveStateClass() {
  return `status-${currentSaveState.value}`;
}

function syncEditorFromActiveDocument() {
  const activeDoc = getActiveDocument();
  suppressEditorSync = true;
  suppressTitleSync = true;
  markdownInput.value = activeDoc ? activeDoc.content : '';
  currentDocumentTitle.value = activeDoc ? (activeDoc.manualTitle || '') : '';
  editorSelection.value = { start: 0, end: 0 };
  updateStats();
}

function markCurrentDocumentDirty() {
  const activeDoc = getActiveDocument();
  if (!activeDoc) return;
  activeDoc.updatedAt = Date.now();
  activeDoc.dirty = true;
  currentSaveState.value = 'saving';
}

function buildSavePayload() {
  const activeDoc = getActiveDocument();
  return {
    currentStyle: currentStyle.value,
    content: activeDoc ? activeDoc.content : markdownInput.value,
    documents: documents.value,
    activeDocumentId: activeDocumentId.value,
    codeBlockSettings: codeBlockSettings.value,
    tocVisible: tocVisible.value,
    displaySettings: displaySettings.value
  };
}

function handleSaveSuccess(payload = null) {
  const documentId = payload?.activeDocumentId || activeDocumentId.value;
  const savedDoc = documents.value.find((doc) => doc.id === documentId);
  if (savedDoc) savedDoc.dirty = false;
  currentSaveState.value = 'saved';
  lastSavedTime.value = formatFullDateTime(Date.now());
}

function handleSaveError() {
  currentSaveState.value = 'error';
}

function persistDocumentState() {
  const success = savePreferences(
    currentStyle.value,
    getActiveDocument()?.content || markdownInput.value,
    documents.value,
    activeDocumentId.value,
    codeBlockSettings.value,
    tocVisible.value,
    displaySettings.value
  );

  if (success) {
    handleSaveSuccess();
  } else {
    handleSaveError();
  }

  return success;
}

function schedulePersistDocumentState() {
  debounceSaveContent(buildSavePayload(), 5000, {
    onSuccess: handleSaveSuccess,
    onError: handleSaveError
  });
}

function updateStats() {
  const text = markdownInput.value;
  if (!text) {
    wordCount.value = 0;
    charCount.value = 0;
    readTime.value = 0;
    return;
  }

  charCount.value = text.length;
  const chineseChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
  const englishWords = text.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, ' ').split(/\s+/).filter(Boolean).length;
  const total = chineseChars + englishWords;
  wordCount.value = total;
  readTime.value = Math.max(1, Math.ceil(total / 300));
}

function getResolvedCodeTheme() {
  return resolveCodeTheme(currentCodeTheme.value);
}

function toggleToc() {
  tocVisible.value = !tocVisible.value;
  persistDocumentState();
}

function scrollToTocHeading(id) {
  if (!id) return;

  nextTick(() => {
    const preview = document.querySelector('.preview-content');
    const heading = document.getElementById(id);
    if (!preview || !heading) return;

    const previewRect = preview.getBoundingClientRect();
    const headingRect = heading.getBoundingClientRect();
    const offset = headingRect.top - previewRect.top + preview.scrollTop - 16;
    preview.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' });
  });
}

async function renderMarkdown() {
  if (!markdownInput.value.trim()) {
    renderedContent.value = '';
    return;
  }
  if (!md) return;

  const styleConfig = STYLES[currentStyle.value];
  if (!styleConfig) return;

  try {
    renderedContent.value = await renderPipeline({
      markdown: markdownInput.value,
      md,
      imageStore,
      styleConfig,
      codeTheme: getResolvedCodeTheme(),
      displaySettings: displaySettings.value
    });
  } catch (error) {
    console.error('渲染失败:', error);
  }
}

function sortDocumentsByCurrentOrder() {
  documents.value.forEach((doc, index) => {
    doc.sortOrder = index;
  });
}

function ensureActiveDocument() {
  if (documents.value.length === 0) {
    const doc = buildDocument({ title: getUntitledTitle([]), content: loadDefaultExample() });
    documents.value = [doc];
    activeDocumentId.value = doc.id;
  }

  if (!documents.value.some((doc) => doc.id === activeDocumentId.value)) {
    activeDocumentId.value = documents.value[0]?.id || null;
  }
}

function switchDocument(documentId) {
  if (!documentId || documentId === activeDocumentId.value) return;
  persistDocumentState();
  activeDocumentId.value = documentId;
  syncEditorFromActiveDocument();
  renderMarkdown();
}

function createNewDocument(content = '', manualTitle = '') {
  const doc = buildDocument({
    manualTitle,
    title: manualTitle || getUntitledTitle(),
    content,
    sortOrder: documents.value.length
  });

  documents.value.push(doc);
  sortDocumentsByCurrentOrder();
  activeDocumentId.value = doc.id;
  syncEditorFromActiveDocument();
  persistDocumentState();
  return doc;
}

function renameDocument(documentId) {
  if (documentId !== activeDocumentId.value) {
    switchDocument(documentId);
  }

  nextTick(() => {
    const input = document.querySelector('.document-title-input');
    input?.focus();
    input?.select();
  });
}

function duplicateDocument(documentId) {
  const source = documents.value.find((doc) => doc.id === documentId);
  if (!source) return;

  const duplicateTitle = `${resolveDocumentDisplayTitle(source)} 副本`;
  const doc = buildDocument({
    manualTitle: duplicateTitle,
    title: duplicateTitle,
    content: source.content,
    sortOrder: documents.value.length
  });

  documents.value.push(doc);
  sortDocumentsByCurrentOrder();
  activeDocumentId.value = doc.id;
  syncEditorFromActiveDocument();
  persistDocumentState();
}

function deleteDocument(documentId) {
  const target = documents.value.find((doc) => doc.id === documentId);
  if (!target) return;

  deleteConfirm.value = {
    show: true,
    docId: documentId,
    docTitle: resolveDocumentDisplayTitle(target)
  };
}

function showDeleteConfirm(doc) {
  if (!doc?.id) return;
  const target = documents.value.find((item) => item.id === doc.id);
  if (!target) return;

  deleteConfirm.value = {
    show: true,
    docId: target.id,
    docTitle: resolveDocumentDisplayTitle(target)
  };
}

function cancelDelete() {
  deleteConfirm.value = { show: false, docId: null, docTitle: '' };
}

function confirmDelete() {
  const docId = deleteConfirm.value.docId;
  if (!docId) {
    cancelDelete();
    return;
  }

  const sorted = filteredDocuments.value;
  const currentIndex = sorted.findIndex((doc) => doc.id === docId);
  const nextCandidate = sorted[currentIndex + 1] || sorted[currentIndex - 1] || documents.value.find((doc) => doc.id !== docId);

  documents.value = documents.value.filter((doc) => doc.id !== docId);

  if (documents.value.length === 0) {
    const fallbackDoc = buildDocument({
      title: getUntitledTitle([]),
      manualTitle: '',
      content: '',
      sortOrder: 0
    });
    documents.value = [fallbackDoc];
    activeDocumentId.value = fallbackDoc.id;
  } else {
    activeDocumentId.value = nextCandidate?.id || activeDocumentId.value;
    ensureActiveDocument();
  }

  sortDocumentsByCurrentOrder();
  syncEditorFromActiveDocument();
  persistDocumentState();

  cancelDelete();
}

function moveDocument(documentId, direction) {
  const ordered = filteredDocuments.value;
  const index = ordered.findIndex((doc) => doc.id === documentId);
  if (index < 0) return;

  const swapIndex = direction === 'up' ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= ordered.length) return;

  const currentDoc = ordered[index];
  const swapDoc = ordered[swapIndex];

  const currentOrder = currentDoc.sortOrder;
  currentDoc.sortOrder = swapDoc.sortOrder;
  swapDoc.sortOrder = currentOrder;

  documents.value = [...documents.value];
  persistDocumentState();
}

async function exportDocumentList() {
  toast.show('正在处理图片...', 'success');

  const docs = [];
  for (const doc of documents.value) {
    const content = await replaceImageUrlsWithBase64(doc.content, imageStore);
    docs.push({
      id: doc.id,
      manualTitle: doc.manualTitle,
      title: doc.title,
      content: content,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      sortOrder: doc.sortOrder
    });
  }

  const exportData = {
    version: 1,
    exportedAt: Date.now(),
    activeDocumentId: activeDocumentId.value,
    documents: docs
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `rico-md-documents-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  toast.show('已导出文档列表', 'success');
}

async function importDocumentList(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!data.documents || !Array.isArray(data.documents)) {
      toast.show('无效的文档文件', 'error');
      return;
    }

    const importedDocs = data.documents.map((doc, index) => buildDocument({
      id: doc.id || createDocumentId(),
      manualTitle: doc.manualTitle || '',
      title: doc.title || '',
      content: doc.content || '',
      createdAt: doc.createdAt || Date.now(),
      updatedAt: doc.updatedAt || Date.now(),
      sortOrder: doc.sortOrder ?? index,
      dirty: false
    }));

    if (importedDocs.length === 0) {
      toast.show('文档列表为空', 'error');
      return;
    }

    documents.value = importedDocs;

    const savedActiveId = data.activeDocumentId;
    if (savedActiveId && importedDocs.some(doc => doc.id === savedActiveId)) {
      activeDocumentId.value = savedActiveId;
    } else {
      activeDocumentId.value = importedDocs[0].id;
    }

    persistDocumentState();
    toast.show(`已导入 ${importedDocs.length} 篇文档`, 'success');
  } catch (error) {
    console.error('Import failed:', error);
    toast.show('导入失败：文件格式错误', 'error');
  }

  event.target.value = '';
}

async function handleImageUpload(file, textarea) {
  if (!file.type.startsWith('image/')) {
    toast.show('请上传图片文件', 'error');
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    toast.show('图片大小不能超过 10MB', 'error');
    return;
  }

  const imageName = file.name.replace(/\.[^/.]+$/, '') || '图片';
  const originalSize = file.size;

  try {
    toast.show('正在压缩图片...', 'success');
    const compressedBlob = await imageCompressor.compress(file);
    const compressedSize = compressedBlob.size;
    const compressionRatio = ((1 - compressedSize / originalSize) * 100).toFixed(0);
    const imageId = createDocumentId('img');

    await imageStore.saveImage(imageId, compressedBlob, {
      name: imageName,
      originalName: file.name,
      originalSize,
      compressedSize,
      compressionRatio,
      mimeType: compressedBlob.type || file.type
    });

    const markdownImage = `![${imageName}](img://${imageId})`;
    insertAtCursor(markdownImage, {
      textarea,
      selectionStart: markdownImage.length
    });

    if (compressionRatio > 10) {
      toast.show(`已保存 (${ImageCompressor.formatSize(originalSize)} → ${ImageCompressor.formatSize(compressedSize)})`, 'success');
    } else {
      toast.show(`已保存 (${ImageCompressor.formatSize(compressedSize)})`, 'success');
    }
  } catch (error) {
    console.error('图片处理失败:', error);
    toast.show(`图片处理失败: ${error.message}`, 'error');
  }
}

function initPasteHandler() {
  turndownService = createTurndownService();
  pasteHandler = createPasteHandler({
    turndownService,
    handleImageUpload,
    showToast: (message, type) => toast.show(message, type),
    getInput: () => markdownInput.value,
    setInput: (value) => { markdownInput.value = value; },
    nextTick
  });
}

async function onPaste(event) {
  if (pasteHandler) {
    await pasteHandler(event);
  }
}

function handleDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  isDraggingOver.value = false;

  const file = event.dataTransfer.files[0];
  if (!file) return;

  if (file.type.startsWith('image/')) {
    handleImageUpload(file, event.target);
  } else {
    toast.show('仅支持拖拽图片文件', 'error');
  }
}

function handleDragOver(event) {
  event.preventDefault();
  event.stopPropagation();
  event.dataTransfer.dropEffect = 'copy';
  isDraggingOver.value = true;
}

function handleDragEnter(event) {
  event.preventDefault();
  isDraggingOver.value = true;
}

function handleDragLeave(event) {
  event.preventDefault();
  if (event.target.classList.contains('markdown-input')) {
    isDraggingOver.value = false;
  }
}

function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (loadEvent) => {
    const content = loadEvent.target.result || '';
    const fileTitle = file.name.replace(/\.(md|markdown)$/i, '');
    createNewDocument(content, fileTitle);
  };
  reader.onerror = () => toast.show('文件读取失败', 'error');
  reader.readAsText(file);
  event.target.value = '';
}

async function exportMarkdown() {
  const activeDoc = getActiveDocument();
  const filename = `${sanitizeFilename(resolveDocumentDisplayTitle(activeDoc))}.md`;

  await exportMarkdownWithImages({
    markdownInput: markdownInput.value,
    imageStore,
    filename,
    showToast: (message, type) => toast.show(message, type)
  });
}

async function exportHTML() {
  const activeDoc = getActiveDocument();
  const filename = `${sanitizeFilename(resolveDocumentDisplayTitle(activeDoc))}.html`;

  await exportHTMLWithImages({
    renderedHTML: renderedContent.value,
    imageStore,
    filename,
    showToast: (message, type) => toast.show(message, type)
  });
}

async function doCopy() {
  const styleConfig = STYLES[currentStyle.value];
  const success = await copyToWechat({
    renderedHTML: renderedContent.value,
    styleConfig,
    imageStore,
    showToast: (message, type) => toast.show(message, type),
    codeTheme: getResolvedCodeTheme()
  });

  if (success) {
    copySuccess.value = true;
    setTimeout(() => { copySuccess.value = false; }, 2000);
  }
}

async function copyToTwitter() {
  if (!renderedContent.value) return;

  await copyToX({
    renderedHTML: renderedContent.value,
    showToast: (message, type) => toast.show(message, type)
  });
}


function selectTheme(key) {
  currentStyle.value = key;
}

function toggleStar(key) {
  toggleStarStyle(key);
  starredStyles.value = getStarredStyles();
  categorizedThemes.value = getCategorizedThemes();
}

function selectCodeTheme(key) {
  if (!isCodeThemeSelection(key)) return;
  currentCodeTheme.value = key;
  try {
    localStorage.setItem('currentCodeTheme', key);
  } catch (_error) {
    // ignore
  }
  renderMarkdown();
}

function clampNumber(value, min, max, fallback, precision = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  const clamped = Math.min(max, Math.max(min, number));
  if (precision <= 0) return Math.round(clamped);
  return Number(clamped.toFixed(precision));
}

function updateDisplaySettings(nextSettings) {
  displaySettings.value = {
    ...displaySettings.value,
    ...nextSettings
  };
}

function setFontScale(value) {
  updateDisplaySettings({ fontScale: value });
}

function setImageStyleMode(value) {
  if (!['theme', 'custom'].includes(value)) return;
  updateDisplaySettings({ imageStyleMode: value });
}

function updateImageDisplaySettings(nextSettings) {
  updateDisplaySettings({
    imageStyleMode: 'custom',
    ...nextSettings
  });
}

function updateImageMetric(field, value, min, max) {
  updateImageDisplaySettings({
    [field]: clampNumber(value, min, max, displaySettings.value[field] ?? min)
  });
}

function setImageRadiusMode(value) {
  if (!['px', 'circle'].includes(value)) return;
  updateImageDisplaySettings({ imageRadiusMode: value });
}

function updateImageShadowOpacity(value) {
  updateImageDisplaySettings({
    imageShadowOpacity: clampNumber(
      Number(value) / 100,
      0,
      1,
      displaySettings.value.imageShadowOpacity ?? 0,
      2
    )
  });
}

function updateImageShadowColor(value) {
  const normalized = String(value || '').trim();
  if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(normalized)) return;
  updateImageDisplaySettings({ imageShadowColor: normalized });
}

function getTextarea() {
  return document.querySelector('.markdown-input');
}

function syncEditorSelection(event) {
  const textarea = event?.target || getTextarea();
  if (!textarea) return;

  editorSelection.value = {
    start: textarea.selectionStart ?? 0,
    end: textarea.selectionEnd ?? 0
  };
}

function getEditorSelection(textarea = getTextarea()) {
  if (!textarea) {
    return {
      start: editorSelection.value.start ?? 0,
      end: editorSelection.value.end ?? 0
    };
  }

  if (document.activeElement === textarea) {
    syncEditorSelection({ target: textarea });
  }

  return {
    start: editorSelection.value.start ?? 0,
    end: editorSelection.value.end ?? 0
  };
}

function insertAtCursor(text, options = {}) {
  const textarea = options.textarea || getTextarea();
  const { start, end } = getEditorSelection(textarea);
  const before = markdownInput.value.slice(0, start);
  const after = markdownInput.value.slice(end);

  markdownInput.value = `${before}${text}${after}`;

  nextTick(() => {
    const target = textarea || getTextarea();
    if (!target) return;

    const position = start + (options.selectionStart ?? text.length);
    const selectionEnd = options.selectionEnd != null ? start + options.selectionEnd : position;
    target.focus();
    target.selectionStart = position;
    target.selectionEnd = selectionEnd;
    syncEditorSelection({ target });
  });
}

function wrapSelection(before, after, placeholder = '文本') {
  const textarea = getTextarea();
  const { start, end } = getEditorSelection(textarea);
  const selected = markdownInput.value.substring(start, end) || placeholder;
  const text = `${before}${selected}${after}`;

  markdownInput.value = `${markdownInput.value.substring(0, start)}${text}${markdownInput.value.substring(end)}`;

  nextTick(() => {
    if (!textarea) return;
    textarea.focus();
    textarea.selectionStart = start + before.length;
    textarea.selectionEnd = start + before.length + selected.length;
    syncEditorSelection({ target: textarea });
  });
}

function insertHeading(level) {
  insertAtCursor(`${'#'.repeat(level)} `);
}

function insertQuote() {
  insertAtCursor('> ');
}

function insertUnderline() {
  wrapSelection('<u>', '</u>', 'text');
}

function insertLink() {
  wrapSelection('[', '](https://example.com)', 'text');
}

function insertInlineCode() {
  wrapSelection('`', '`', 'code');
}

function applyListToSelection(type = 'unordered') {
  const textarea = getTextarea();
  const { start, end } = getEditorSelection(textarea);
  const source = markdownInput.value;

  if (start === end) {
    insertAtCursor(type === 'ordered' ? '1. ' : '- ');
    return;
  }

  const blockStart = source.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const blockEndIndex = source.indexOf('\n', end);
  const blockEnd = blockEndIndex === -1 ? source.length : blockEndIndex;
  const block = source.slice(blockStart, blockEnd);
  const lines = block.split('\n');

  const nextBlock = lines
    .map((line, index) => {
      if (!line.trim()) return line;
      const stripped = line.replace(/^\s*(?:[-*+]\s+|\d+\.\s+)/, '');
      return type === 'ordered' ? `${index + 1}. ${stripped}` : `- ${stripped}`;
    })
    .join('\n');

  markdownInput.value = `${source.slice(0, blockStart)}${nextBlock}${source.slice(blockEnd)}`;

  nextTick(() => {
    const target = textarea || getTextarea();
    if (!target) return;
    target.focus();
    target.selectionStart = blockStart;
    target.selectionEnd = blockStart + nextBlock.length;
    syncEditorSelection({ target });
  });
}

function insertOrderedList() {
  applyListToSelection('ordered');
}

function insertUnorderedList() {
  applyListToSelection('unordered');
}

function insertDivider() {
  insertAtCursor('\n---\n');
}

function insertCodeBlock() {
  const textarea = getTextarea();
  const { start, end } = getEditorSelection(textarea);
  const selected = markdownInput.value.substring(start, end);
  const snippet = `\`\`\`\n${selected}\n\`\`\``;

  markdownInput.value = `${markdownInput.value.substring(0, start)}${snippet}${markdownInput.value.substring(end)}`;

  nextTick(() => {
    if (!textarea) return;
    textarea.focus();
    if (selected) {
      textarea.selectionStart = start + 4;
      textarea.selectionEnd = start + 4 + selected.length;
    } else {
      textarea.selectionStart = start + 4;
      textarea.selectionEnd = start + 4;
    }
    syncEditorSelection({ target: textarea });
  });
}

function insertImageSyntax() {
  insertAtCursor('![]()', { selectionStart: 4 });
}

function insertTable() {
  const table = '\n| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |\n';
  insertAtCursor(table);
}

function handleToolbarImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  handleImageUpload(file, getTextarea());
  event.target.value = '';
}

function handleKeydown(event) {
  const isMod = event.ctrlKey || event.metaKey;

  if (isMod && event.key.toLowerCase() === 's') {
    event.preventDefault();
    persistDocumentState();
    toast.show('已保存', 'success');
    return;
  }

  if (isMod && event.key.toLowerCase() === 'b') {
    event.preventDefault();
    wrapSelection('**', '**');
    return;
  }

  if (isMod && event.key.toLowerCase() === 'i') {
    event.preventDefault();
    wrapSelection('*', '*');
    return;
  }

  if (isMod && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    wrapSelection('[', '](url)');
    return;
  }

  if (event.key === 'Tab') {
    event.preventDefault();
    insertAtCursor('  ');
  }
}

function setupSyncScroll() {
  const editor = getTextarea();
  const preview = document.querySelector('.preview-content');
  if (!editor || !preview) return;

  const sync = (source, target) => {
    if (syncLock || !syncScrollEnabled.value) return;
    syncLock = true;
    const ratio = source.scrollTop / (source.scrollHeight - source.clientHeight || 1);
    target.scrollTop = ratio * (target.scrollHeight - target.clientHeight);
    requestAnimationFrame(() => { syncLock = false; });
  };

  editor.addEventListener('scroll', () => sync(editor, preview));
  preview.addEventListener('scroll', () => sync(preview, editor));
}

function loadDefaultExample() {
  return `# 公众号 Markdown 编辑器

欢迎使用这款专为**微信公众号**设计的 Markdown 编辑器。

## 核心能力

### 1. 智能图片处理

![](https://assets.uiineed.com/public/417b95fd3e60c3fbe181dd32f99ffbec.webp)

- 支持截图、浏览器、**文件管理器等来源的图片粘贴**
- 自动压缩并本地持久化保存
- 刷新页面后图片不会丢失

### 2. 多图排版

![](https://assets.uiineed.com/public/955d2dd359b24822f6d56df4a5e5d81c.webp)

![](https://assets.uiineed.com/public/fa83e8f33ccf35e0a9186188b7fb01d6.webp)

![](https://assets.uiineed.com/public/34f30f548deb1351b0ac4fb9d681af25.webp)

### 3. 代码块示例

\`\`\`javascript
const compressedBlob = await imageCompressor.compress(file);
await imageStore.saveImage(imageId, compressedBlob);

const markdown = \`![图片](img://\${imageId})\`;
\`\`\`



### 4. 提醒样式
> [!NOTE]
> **注意**：这是 Note 类型的提示，通常用于补充说明。

> [!TIP]
> **提示**：这是 Tip，给你一些小技巧。

> [!IMPORTANT]
> **重要**：这是 Important，一定要看！

> [!WARNING]
> **警告**：这是 Warning，再乱动代码就要炸了。

> [!CAUTION]
> **危险**：这是 Caution，后果自负。

### 5. 引用实例

> 试试切换不同主题和代码块设置，观察预览变化。
>
> 引用可以有多段。

> **嵌套引用**
>
> > 这是嵌套的引用内容。

### 6. 文本样式

这是一段普通文本。

**这是加粗文本**

*这是斜体文本*

***这是加粗斜体文本***

~~这是删除线文本~~

这是行内代码 \`console.log('hello')\`

这是链接 [GitHub](https://github.com)

### 7. 列表

#### 无序列表

- 项目一
- 项目二
  - 子项目 2.1
  - 子项目 2.2
    - 子项目 2.2.1
- 项目三

#### 有序列表

1. 第一步
2. 第二步
   1. 子步骤 2.1
   2. 子步骤 2.2
3. 第三步

#### 任务列表

- [x] 已完成任务
- [ ] 未完成任务
- [ ] 另一个未完成任务

---


## 8. 代码块

### JavaScript

\`\`\`javascript
function greet(name) {
  const message = \`Hello, \${name}!\`;
  console.log(message);
  return message;
}

class Calculator {
  constructor() {
    this.result = 0;
  }

  add(x) {
    this.result += x;
    return this;
  }

  getResult() {
    return this.result;
  }
}

const calc = new Calculator();
calc.add(5).add(3);
console.log(calc.getResult()); // 8
\`\`\`

### Python

\`\`\`python
def fibonacci(n):
    """生成斐波那契数列"""
    a, b = 0, 1
    for _ in range(n):
        yield a
        a, b = b, a + b

# 列表推导式
squares = [x**2 for x in range(10)]
print(squares)

# 字典推导式
word_lengths = {word: len(word) for word in ["hello", "world", "python"]}
print(word_lengths)
\`\`\`

### HTML

\`\`\`html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>示例页面</title>
  <style>
    body {
      font-family: sans-serif;
      margin: 20px;
    }
  </style>
</head>
<body>
  <h1>Hello World</h1>
  <p class="intro">这是一个段落。</p>
</body>
</html>
\`\`\`

### CSS

\`\`\`css
.container {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  padding: 20px;
}

.card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 8px;
  padding: 24px;
  color: white;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s ease;
}

.card:hover {
  transform: translateY(-4px);
}
\`\`\`

---

## 9. 表格

| 功能 | 状态 | 备注 |
|------|:----:|------|
| Markdown 编辑 | ✅ | 支持实时预览 |
| 代码高亮 | ✅ | 多语言支持 |
| 图片粘贴 | ✅ | 自动压缩 |
| 导出 HTML | ✅ | 图片转 Base64 |
| 主题切换 | ✅ | 多套主题 |
| 数学公式 | ✅ | KaTeX 渲染 |

### 对齐方式

| 左对齐 | 居中对齐 | 右对齐 |
|:-------|:-------:|-------:|
| 左 | 中 | 右 |
| 文本内容 | 文本内容 | 文本内容 |
| 较长的内容 | 较长的内容 | 较长的内容 |

---

## 10. 数学公式

### 行内公式

质能方程 $E = mc^2$，勾股定理 $a^2 + b^2 = c^2$。

二次方程 $ax^2 + bx + c = 0$ 的解为 $x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$。

### 块级公式

欧拉公式：

$e^{i\\pi} + 1 = 0$

高斯积分：

$\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}$

矩阵：

$\\begin{pmatrix} a & b \\ c & d \\end{pmatrix} \\begin{pmatrix} x \\ y \\end{pmatrix} = \\begin{pmatrix} ax + by \\ cx + dy \\end{pmatrix}$

求和公式：

$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$

极限：

$\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1$

---

## 11. 分割线

---

***

___



## 12. HTML 内混用

<div style="background: #f0f0f0; padding: 16px; border-radius: 8px;">
  <p style="color: #333; font-weight: bold;">这是一个 HTML 块</p>
  <p>可以在 Markdown 中混用 HTML 标签。</p>
</div>


## 13. 特殊字符

&copy; &amp; &lt; &gt; &quot; &#39;

表情符号： 😀 🎉 🚀 ❤️ ⭐


## 14. 长文本测试

这是一段较长的文本，用于测试自动换行和排版效果。微信公众号编辑器需要处理各种长度的文本内容，确保在不同屏幕尺寸下都能正常显示。这段文字故意写得比较长，以便观察段落的排版效果和行间距是否合适。在实际使用中，用户可能会写出更长的段落，所以我们需要确保编辑器能够正确处理这些情况。

这是另一个段落。段落之间应该有合适的间距，既不能太大也不能太小。在微信公众号中，阅读体验非常重要，因此排版的细节需要特别注意。
`;
}

function initResizeHandles() {
  const resizeState = {
    handle: null,
    startX: 0,
    startEditorWidth: 0,
    startRightWidth: 0,
    type: null
  };

  document.addEventListener('mousedown', (event) => {
    const handle = event.target.closest('.resize-handle');
    if (!handle) return;

    resizeState.handle = handle;
    resizeState.startX = event.clientX;
    resizeState.type = handle.dataset.handle;
    handle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const editorPanel = document.querySelector('.editor-panel');
    const rightPanel = document.querySelector('.right-panel');

    if (resizeState.type === 'editor-preview') {
      resizeState.startEditorWidth = editorPanel?.offsetWidth || 0;
    } else if (resizeState.type === 'preview-right') {
      resizeState.startRightWidth = rightPanel?.offsetWidth || 0;
    }
  });

  document.addEventListener('mousemove', (event) => {
    if (!resizeState.handle) return;

    const mainArea = document.querySelector('.main-area');
    const editorPanel = document.querySelector('.editor-panel');
    const rightPanel = document.querySelector('.right-panel');
    if (!mainArea) return;

    const delta = event.clientX - resizeState.startX;
    const mainWidth = mainArea.offsetWidth;

    if (resizeState.type === 'editor-preview' && editorPanel) {
      const newWidth = resizeState.startEditorWidth + delta;
      const clampedWidth = Math.max(200, Math.min(mainWidth * 0.6, newWidth));
      editorWidth.value = (clampedWidth / mainWidth * 100).toFixed(2);
    } else if (resizeState.type === 'preview-right' && rightPanel) {
      const newWidth = resizeState.startRightWidth + delta;
      rightPanelWidth.value = Math.max(280, Math.min(500, newWidth));
    }
  });

  document.addEventListener('mouseup', () => {
    if (!resizeState.handle) return;
    resizeState.handle.classList.remove('dragging');
    resizeState.handle = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
}

const app = createApp({
  setup() {
    watch(markdownInput, (value) => {
      renderMarkdown();
      updateStats();

      if (suppressEditorSync) {
        suppressEditorSync = false;
        return;
      }

      const activeDoc = getActiveDocument();
      if (!activeDoc) return;

      activeDoc.content = value;
      markCurrentDocumentDirty();
      schedulePersistDocumentState();
    });

    watch(currentDocumentTitle, (value) => {
      if (suppressTitleSync) {
        suppressTitleSync = false;
        return;
      }

      const activeDoc = getActiveDocument();
      if (!activeDoc) return;

      activeDoc.manualTitle = value;
      activeDoc.title = value || activeDoc.title;
      markCurrentDocumentDirty();
      schedulePersistDocumentState();
    });

    watch(currentStyle, () => {
      renderMarkdown();
      persistDocumentState();
    });

    watch(codeBlockSettings, () => {
      renderMarkdown();
      persistDocumentState();
    }, { deep: true });

    watch(displaySettings, () => {
      renderMarkdown();
      persistDocumentState();
    }, { deep: true });

    onMounted(async () => {
      starredStyles.value = getStarredStyles();

      const preferences = loadPreferences();
      currentStyle.value = preferences.currentStyle;
      codeBlockSettings.value = preferences.codeBlockSettings;
      displaySettings.value = preferences.displaySettings;
      tocVisible.value = preferences.tocVisible;

      try {
        const savedCodeTheme = localStorage.getItem('currentCodeTheme');
        if (isCodeThemeSelection(savedCodeTheme)) {
          currentCodeTheme.value = savedCodeTheme;
        }
      } catch (_error) {
        // ignore
      }

      initResizeHandles();

      imageStore = new ImageStore();
      try {
        await imageStore.init();
      } catch (error) {
        console.error('ImageStore 初始化失败:', error);
      }

      imageCompressor = new ImageCompressor({ maxWidth: 1920, maxHeight: 1920, quality: 0.85 });
      md = createMarkdownEngine();
      initPasteHandler();

      if (preferences.documents.length > 0) {
        documents.value = preferences.documents.map((doc, index) => buildDocument({ ...doc, sortOrder: doc.sortOrder ?? index }));
      } else if (preferences.content) {
        documents.value = [buildDocument({ content: preferences.content, title: getUntitledTitle([]), manualTitle: '' })];
      } else {
        documents.value = [buildDocument({ content: loadDefaultExample(), title: getUntitledTitle([]), manualTitle: '' })];
      }

      activeDocumentId.value = preferences.activeDocumentId;
      ensureActiveDocument();
      syncEditorFromActiveDocument();
      renderMarkdown();
      persistDocumentState();

      nextTick(() => setupSyncScroll());
    });

    return {
      markdownInput,
      renderedContent,
      currentStyle,
      starredStyles,
      currentCodeTheme,
      documents,
      activeDocumentId,
      currentDocumentTitle,
      documentSearch,
      filteredDocuments,
      isImageStyleCustom,
      previewMode,
      tocVisible,
      tocItems,
      isDraggingOver,
      copySuccess,
      activePanel,
      toastState,
      sidebarOpen,
      deleteConfirm,
      wordCount,
      charCount,
      readTime,
      lastSavedTime,
      currentSaveState,
      syncScrollEnabled,
      editorWidth,
      rightPanelWidth,
      categorizedThemes,
      codeThemeList,
      fontScaleOptions,
      imageStyleModeOptions,
      imageRadiusModeOptions,
      codeBlockSettings,
      displaySettings,
      STYLES,
      renderMarkdown,
      toggleToc,
      scrollToTocHeading,
      doCopy,
            copyToTwitter,
      onPaste,
      handleDrop,
      handleDragOver,
      handleDragEnter,
      handleDragLeave,
      handleFileUpload,
      handleToolbarImageUpload,
      exportMarkdown,
      exportHTML,
      selectTheme,
      toggleStar,
      selectCodeTheme,
      setImageStyleMode,
      setFontScale,
      setImageRadiusMode,
      updateImageMetric,
      updateImageShadowOpacity,
      updateImageShadowColor,
      handleKeydown,
      syncEditorSelection,
      insertHeading,
      insertQuote,
      insertUnderline,
      insertLink,
      insertInlineCode,
      insertOrderedList,
      insertUnorderedList,
      insertCodeBlock,
      insertDivider,
      insertImageSyntax,
      insertTable,
      wrapSelection,
      getStyleName,
      isRecommended,
      getDocumentDisplayTitle: resolveDocumentDisplayTitle,
      formatDateTime,
      switchDocument,
      createNewDocument,
      renameDocument,
      duplicateDocument,
      deleteDocument,
      moveDocument,
      exportDocumentList,
      importDocumentList,
      showDeleteConfirm,
      cancelDelete,
      confirmDelete,
      getSaveStateLabel,
      getSaveStateClass,
      togglePanel: (name) => panelManager.toggle(name)
    };
  }
});

app.mount('#app');
