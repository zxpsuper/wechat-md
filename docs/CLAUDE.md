# Rico MD — Claude Code 协作文档

> 本文件由 Claude Code 自动读取。目的是让 AI 快速理解代码组织方式，避免改错东西。
> 产品定义见 docs/PRD.md，设计规范见 docs/DESIGN.md。

## 这个项目是什么

面向微信公众号的纯前端 Markdown 编辑器。无构建步骤，静态文件直接运行。

## 怎么跑

```bash
python -m http.server 8080   # 或 ./start.sh
# http://localhost:8080
```

## 代码怎么组织的

入口是 `index.html`，加载 `assets/scripts/main.js` 启动 Vue 应用。

```
main.js          →  应用入口。Vue 实例、状态管理、文档生命周期、工具栏交互
core/            →  不依赖 UI 的基础能力（渲染、图片、粘贴、高亮、Alerts）
export/          →  复制/导出策略（公众号、知乎、X/Twitter、公式、文件导出各一个文件）
storage/         →  localStorage 读写（偏好设置、文档持久化）
ui/              →  界面逻辑（主题管理、面板、Toast、代码主题）
styles/          →  CSS（base、editor、panel、about、themes/）
```

改功能时先定位到对应目录，不要在 main.js 里堆逻辑。

## 改动时要注意的

### 存储兼容性（最容易出问题）

这些 localStorage 键已有用户数据，不能改名、不能改数据结构：

`currentStyle` `markdownInput` `documents` `activeDocumentId` `codeBlockSettings` `displaySettings` `tocVisible` `starredStyles` `currentCodeTheme`

IndexedDB 数据库名 `WechatEditorImages` 也不能改。

`img://` 协议用于编辑器内图片引用，渲染时替换为 blob URL，复制/导出时替换为 Base64。相关文件的替换逻辑分散在不同文件中，改图片处理时要确保所有环节都对：
- 渲染预览：`core/render-pipeline.js`（img:// → blob URL）
- 复制到公众号：`export/clipboard-exporter.js`（img:// / blob → Base64）
- 复制到知乎：`export/zhihu-clipboard-exporter.js`（img:// 直接移除）
- 导出文件/文档列表：`export/file-exporter.js`（img:// / blob → Base64）

### 图片的 blob URL 处理

预览时 `render-pipeline.js` 把 `img://` 替换成 `blob:` URL。导出 HTML 时 `file-exporter.js`（`exportHTMLWithImages` 函数）需要把 `blob:` URL fetch 回来转成 Base64，否则导出的 HTML 文件直接打开时图片会显示不出来。

### 文档删除的边界

删除操作必须保证 `documents.length >= 1`。删完最后一篇后要自动新建空白文档，`activeDocumentId` 必须指向有效文档。弹窗初始状态 `deleteConfirm.show === false`。

### 主题系统

正文主题和代码主题是独立的，分别管理：
- 正文主题：`styles/themes/` 目录下的 JS 文件，由 `ui/theme-manager.js` 加载（支持收藏）
- 代码主题：`ui/code-themes.js`，16 套主题，面板中有迷你预览卡片

新增主题时两个系统分别处理，不要混在一起。

### 知乎复制的行为

知乎复制走 `export/zhihu-clipboard-exporter.js`，策略与公众号不同：
- 复制纯 Markdown 文本（非 HTML）
- 本地 `img://` 图片引用直接移除，不转 base64
- 用 toast 告知用户已移除的图片数量，提示自行复制
- 不传入 `imageStore` 参数

### 公众号复制的兼容性

公众号不支持 CSS Grid、Flexbox（部分）、CSS Variables。复制到公众号时 `clipboard-exporter.js` 会做转换：
- Grid → Table
- 样式全部内联化
- 图片转 Base64（GIF 动图替换为占位提示）
- 公式从 KaTeX 转 MathJax SVG
- 列表项展开为段落

改复制相关逻辑后，必须实际粘贴到公众号编辑器验证，预览正常不代表复制后正常。

### 公众号 CSS 兼容性（重要经验）

以下 CSS 特性在公众号编辑器中**不支持**，复制到公众号时会丢失：
- **CSS Color Level 4 八位 hex 色**：`#388bfd10`（带 alpha 通道）公众号不识别，必须用 `rgba(56,139,253,0.04)` 代替
- **`display: flex` / `grid`**：公众号不支持 Flexbox 和 Grid，必须用 table/block 布局
- **CSS Variables**：`var(--space-4)` 在 DOMParser 中不会解析，内联样式必须用实际像素值
- **`!important` 过度使用**：某些情况下会导致公众号编辑器整条 style 被丢弃，尽量少用

公众号兼容的 HTML 策略：
- **`<blockquote>` 优于自定义 `<div>`**：blockquote 是公众号原生支持的标签，复杂样式比 div 更稳定
- **简单内联样式优先**：只使用 padding、margin、border-left、background 等基础属性
- 涉及公众号复制的新功能必须实际粘贴到公众号后台验证

### 样式文件

CSS 拆分为 base / editor / panel / about 四个文件，不要把样式写回 index.html 的 `<style>` 标签里。

### GitHub Alerts

支持 `[!NOTE]`、`[!TIP]`、`[!IMPORTANT]`、`[!WARNING]`、`[!CAUTION]` 语法，由 `core/alerts-plugin.js` 实现。样式定义在 `editor.css` 的 `/* GitHub Alerts */` 部分。

## 不要做的事

- 不要引入 npm / Vite / Webpack 等构建工具
- 不要引入后端
- 不要把分散在 core/、export/ 等目录的代码合并回单文件
- 不要改动已有的 localStorage 键名和数据结构