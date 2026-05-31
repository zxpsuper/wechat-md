# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

面向微信公众号的纯前端 Markdown 编辑器。无构建步骤，静态文件直接运行。

## 运行项目

```bash
python -m http.server 8080
# 或 ./start.sh
# 访问 http://localhost:8080
```

## 代码架构

入口是 `index.html`，加载 `assets/scripts/main.js` 启动 Vue 3 应用。

```
assets/scripts/
  main.js           → 应用入口：Vue 实例、状态管理、文档生命周期
  core/             → 不依赖 UI 的基础能力（渲染、图片、粘贴、高亮）
  export/           → 复制/导出策略（公众号、X/Twitter、文件导出）
  storage/          → localStorage 读写（偏好设置、文档持久化）
  ui/               → 界面逻辑（主题管理、面板、Toast）

assets/styles/
  base.css          → CSS 变量、布局、header、sidebar、status-bar
  editor.css        → 编辑器与预览面板
  panel.css         → 右侧面板/设置面板
  themes/           → 排版主题定义（JS 文件）
```

改功能时先定位到对应目录，不要在 main.js 里堆逻辑。

## 重要约束

### localStorage 键名（不能改）

已有用户数据，键名和数据结构不能改：
`currentStyle` `markdownInput` `documents` `activeDocumentId` `codeBlockSettings` `displaySettings` `tocVisible` `starredStyles` `currentCodeTheme`

IndexedDB 数据库名 `WechatEditorImages` 不能改。

### 图片处理流程

`img://` 协议用于编辑器内图片引用：
- 渲染预览：`core/render-pipeline.js`（img:// → blob URL）
- 复制公众号：`export/clipboard-exporter.js`（img:// → Base64）
- 导出 HTML：`export/file-exporter.js`（blob → Base64）

改图片处理要确保所有环节都对。

### 公众号 CSS 兼容性

公众号编辑器不支持：
- CSS Variables（`var(--x)`）
- Flexbox/Grid
- 八位 hex 色（`#388bfd10`）

复制到公众号时 `clipboard-exporter.js` 会做转换：Grid → Table、样式内联化、图片转 Base64。改复制逻辑后必须实际粘贴到公众号验证。

### 文档删除

删除必须保证 `documents.length >= 1`。删完最后一篇后自动新建空白文档。

## CSS 设计系统

CSS 变量定义在 `base.css` 的 `:root` 中，包括：
- 颜色系统（`--color-text-*`、`--glass-bg` 等）
- 玻璃效果（`--glass-blur`、`--glass-border`）
- 阴影（`--shadow-1` 到 `--shadow-4`）
- 间距、圆角、动画时间

新增样式应使用已有变量，不要硬编码值。

## 主题系统

正文主题和代码主题是独立的：
- 正文主题：`styles/themes/*.js`，由 `ui/theme-manager.js` 加载
- 代码主题：`ui/code-themes.js`，17 套主题

新增主题时两个系统分别处理。

## 不要做的事

- 不要引入 npm/Vite/Webpack 等构建工具
- 不要引入后端
- 不要把分散在 core/、export/ 的代码合并回单文件
- 不要改动已有 localStorage 键名和数据结构