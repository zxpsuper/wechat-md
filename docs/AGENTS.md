# AGENTS.md

本文件用于约束 AI 代码代理（如 Codex / Claude）在本仓库中的行为，确保改动与当前实现一致。

## 项目定位

Suporka MD 是一个面向微信公众号排版的纯前端 Markdown 编辑器。

- 无构建流程，基于静态页面 + ES Modules
- 入口页：`index.html`
- 独立关于页：`about.html`（导航入口已隐藏，可通过 URL 直接访问）
- 主逻辑：`assets/scripts/main.js`

## 当前版本关键事实（请以此为准）

1. 自动保存为固定 `5 秒` 防抖（不是 800ms，也不是可配置项）
2. 顶部导航包含：主题 / 代码 / 设置（"关于"和"复制到 X"已隐藏）
3. 代码块显示项已归入"代码"面板：
   - 显示代码语言
   - 显示复制按钮
   - 显示 macOS 装饰
4. 删除文档走确认弹窗流程；删除最后一篇后会自动新建空白文档
5. About 页面与样式已拆分：`about.html` + `assets/styles/about.css`
6. 图片链路为：压缩 + IndexedDB + `img://` 协议 + 预览时转 blob URL + 复制/导出时转 Base64
7. 支持 GitHub Alerts 语法：`[!NOTE]` `[!TIP]` `[!IMPORTANT]` `[!WARNING]` `[!CAUTION]`
8. 导出 Markdown/HTML/文档列表时，本地图片自动转 Base64；导出 HTML 时 blob: 图片也转 Base64
9. 侧边栏支持导出/导入文档列表（JSON 格式）
10. 支持图片显示自定义：边距、圆角、阴影（颜色/偏移/模糊/透明度）
11. 支持字体缩放（0.75x ~ 1.5x，6 档）
12. 支持目录（TOC）功能，自动提取 h1/h2/h3 锚点
13. 复制到公众号时，GitHub Alerts 会被转换为 `<blockquote>` 结构（公众号对 `<div>` 的自定义样式支持有限）
14. 支持 Task List 语法 `- [x]` / `- [ ]`，由 `core/task-lists-plugin.js` 实现
15. 底部 Footer 包含不蒜子统计（累计访问量、累计人数、当日人数）和 "Ctrl+D 收藏本站" 提示
16. 复制到知乎为纯 Markdown 文本，本地图片 (`img://`) 直接移除并 toast 提醒用户自行复制

## 公众号 CSS 兼容性要点

以下特性在公众号编辑器中不支持，处理复制逻辑时必须规避：
- 八位 hex 色（`#xxx10`）→ 改用 `rgba()`
- `display: flex` / `grid` → 改用 table 或 block
- CSS Variables（`var(--space-4)`）→ 改用实际像素值
- 过度使用 `!important` → 可能导致整条 style 被丢弃

公众号复制链路中，`<blockquote>` 比自定义 `<div>` 更稳定。

## 关键不变量（必须保持）

- 删除流程结束后必须满足：
  - `documents.length >= 1`
  - `activeDocumentId` 指向有效文档
- 弹窗初始状态必须隐藏：`deleteConfirm.show === false`
- 偏好存储键保持兼容（不要随意改名）：
  - `currentStyle`
  - `markdownInput`
  - `documents`
  - `activeDocumentId`
  - `codeBlockSettings`
  - `displaySettings`
  - `tocVisible`
  - `starredStyles`
  - `currentCodeTheme`

## 代码结构速览

- `assets/scripts/main.js`：应用状态、文档管理、保存、交互入口、文档导入导出
- `assets/scripts/core/`：Markdown 渲染、粘贴处理、图片存储与压缩、Alerts 插件、代码高亮
- `assets/scripts/export/clipboard-exporter.js`：复制到公众号（Grid→Table、内联化、Base64、MathJax）
- `assets/scripts/export/file-exporter.js`：导出文件时图片转 Base64（HTML/Markdown/JSON）
- `assets/scripts/export/math-exporter.js`：KaTeX→MathJax SVG 转换
- `assets/scripts/export/x-clipboard-exporter.js`：X/Twitter 复制链路
- `assets/scripts/export/zhihu-clipboard-exporter.js`：复制到知乎（纯 Markdown，移除本地图片引用）
- `assets/scripts/core/task-lists-plugin.js`：Task List 语法支持 (`- [x]`)
- `assets/scripts/storage/preferences.js`：本地持久化与防抖保存
- `assets/scripts/ui/`：主题、代码主题、面板、Toast
- `assets/styles/themes/`：正文主题定义
- `assets/scripts/ui/code-themes.js`：代码块主题定义

## 开发约束

- 保持纯前端运行方式，不引入额外构建工具
- 尽量做最小改动，避免无关重构
- 新增配置时优先考虑向后兼容
- 涉及存储/删除逻辑时必须覆盖空列表与无 active 的边界
- 保留公众号复制兼容链路（内联样式、图片 Base64、结构转换）

## 本地验证清单（改动后至少自测）

1. 输入后约 5 秒触发自动保存，刷新后内容可恢复
2. 单文档删除后自动补出空白文档，不出现左侧空列表
3. 多文档删除时 active 切换合理，内容不丢
4. "代码"面板三项显示开关生效
5. About 页面可打开，图片资源加载正常
6. 导出 HTML 含图片时，直接打开文件图片可正常显示
7. Task List `- [x]` / `- [ ]` 渲染为带复选框的列表项
8. 复制到知乎时，本地图片被移除并有 toast 提示

## 运行方式

```bash
python -m http.server 8080
# 打开 http://localhost:8080
```