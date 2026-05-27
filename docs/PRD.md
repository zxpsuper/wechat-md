# Suporka MD PRD

> 版本: vCurrent
> 更新日期: 2026-05-27

## 1. 产品定位

Suporka MD 是一个面向微信公众号写作与排版的纯前端 Markdown 编辑器。

核心目标有三件事:

1. 让用户能高效完成长文写作与排版。
2. 让预览结果尽量接近最终粘贴到公众号后台后的效果。
3. 在不依赖后端和构建系统的前提下，保证本地可用、可保存、可导出。

**项目来源**：从 [huasheng_editor](https://github.com/alchaincyf/huasheng_editor)（花生）Fork 后二次开发。

## 2. 当前核心能力

### 编辑与预览

- 左侧 Markdown 编辑，右侧实时预览
- 支持桌面 / 手机预览模式切换
- 支持常用工具栏操作:
  - 标题（h1-h6）
  - 加粗 / 斜体 / 下划线
  - 链接
  - 行内代码 / 代码块
  - 引用
  - 有序 / 无序列表
  - 分割线
  - 图片（上传、粘贴、拖拽）
  - 表格
- 支持 GitHub Alerts 语法（NOTE / TIP / IMPORTANT / WARNING / CAUTION）
- 支持键盘快捷键：Ctrl+S 保存、Ctrl+B 加粗、Ctrl+I 斜体、Ctrl+K 链接、Tab 缩进
- 支持编辑器与预览区同步滚动

### 文档管理

- 多文档创建、切换、复制、删除
- 文档搜索
- 独立文档标题输入（文件名模式：`未命名文档 N`）
- 文档排序（上下移动）
- 自动保存（5 秒防抖）与保存状态显示（saving / saved / error）
- 本地持久化恢复
- 文档列表导出/导入 JSON（支持图片转 Base64）

### 主题与排版

- 多套公众号正文主题（21 套，按 4 风格分类 + 收藏置顶）
- 独立代码块主题（16 套），支持"跟随正文主题"模式
- 代码主题侧栏预览卡片
- 主题收藏功能（收藏列表持久化到 localStorage）

### 图片处理

- 支持粘贴、拖拽、上传图片
- 图片压缩后存入 IndexedDB（Canvas 压缩，最大 1920px，质量 85%）
- 编辑器内使用 `img://` 协议引用（避免 Base64 卡顿）
- 预览时转为 blob URL
- 复制到公众号时自动转为 Base64
- 导出 HTML/Markdown 时自动转为 Base64（含 blob: URL）
- GIF 图片在复制时替换为占位提示文字

### 图片显示设置

- 字体缩放（6 档：0.75x ~ 1.5x）
- 图片样式模式：跟随主题 / 自定义
- 自定义模式下可独立设置：边距（上/下）、圆角（像素 / 圆形）、阴影（X/Y 偏移、模糊、扩展、颜色、透明度）

### 导出与复制

- 导出 Markdown（本地图片自动转 Base64）
- 导出 HTML（本地图片/ blob 图片自动转 Base64 内联）
- 一键复制到公众号（含公式/代码/图片/列表转换）
- X / Twitter 复制链路（已隐藏按钮，代码保留）
- 导出文档列表为 JSON（所有文档图片转 Base64）
- 从 JSON 文件导入文档列表

### 公式渲染

- 预览阶段使用 KaTeX
- 复制到公众号时导出 MathJax SVG，避免公众号中公式失真
- 长块级公式支持横向滚动
- 纯文本剪贴板回退保留紧凑 LaTeX

### 目录（TOC）

- 自动提取 h1/h2/h3 生成目录
- 点击目录项平滑滚动到对应标题
- 目录可见状态持久化

## 3. 技术实现说明

### 技术栈

- Vue 3（CDN 引入，无需构建）
- markdown-it（Markdown 解析）
- highlight.js（代码高亮，用于 fallback；自带语法高亮引擎）
- KaTeX / MathJax SVG（公式渲染）
- IndexedDB（图片持久化）
- Canvas API（图片压缩）
- Turndown（HTML→Markdown 智能粘贴）
- 原生 CSS（CSS Variables + 模块化文件）

### 文件结构

```
suporka-md/
├── index.html                    # 主页面（编辑器）
├── about.html                    # 关于页面（导航入口已隐藏）
├── start.sh                      # 一键启动脚本
├── assets/
│   ├── images/                   # 图片资源
│   ├── scripts/
│   │   ├── main.js               # 应用入口
│   │   ├── core/                 # 核心模块
│   │   │   ├── image-compressor.js
│   │   │   ├── image-store.js
│   │   │   ├── markdown-engine.js
│   │   │   ├── paste-handler.js
│   │   │   ├── render-pipeline.js
│   │   │   ├── code-highlight.js
│   │   │   └── alerts-plugin.js
│   │   ├── export/               # 导出模块
│   │   │   ├── clipboard-exporter.js
│   │   │   ├── math-exporter.js
│   │   │   ├── file-exporter.js
│   │   │   └── x-clipboard-exporter.js
│   │   ├── storage/
│   │   │   └── preferences.js
│   │   └── ui/                   # 界面模块
│   │       ├── code-themes.js
│   │       ├── panel-manager.js
│   │       ├── theme-manager.js
│   │       └── toast.js
│   └── styles/
│       ├── base.css
│       ├── editor.css
│       ├── panel.css
│       ├── about.css
│       └── themes/               # 正文主题定义（21 套）
└── docs/
    ├── PRD.md
    ├── CLAUDE.md
    ├── AGENTS.md
    ├── DESIGN.md
    └── CONTRIBUTING.md
```

### 图片系统架构

```
用户粘贴图片
  → image-compressor.js（Canvas 压缩，最大 1920px，质量 85%，GIF/SVG 不压缩）
  → image-store.js（存入 IndexedDB，数据库名 WechatEditorImages）
  → 编辑器插入短链接 img://img-xxx（避免 Base64 卡顿）

渲染预览时：
  render-pipeline.js 从 IndexedDB 读取 → 创建 blob URL → 替换 img://

复制到公众号时：
  clipboard-exporter.js 从 IndexedDB 读取 → 转 Base64 → 替换 img src

导出 HTML 时：
  file-exporter.js 从 IndexedDB 读取 img:// / fetch blob: → 转 Base64 → 内联嵌入
```

### 复制到公众号流程

```
渲染后 HTML
  → Grid 转 Table（公众号不支持 CSS Grid）
  → 样式全部内联化（!important）
  → 图片 img:// 转 Base64（GIF 替换为占位提示）
  → 公式 KaTeX 转 MathJax SVG
  → 代码块结构转换（含语法高亮序列化）
  → 有序列表转段落（编号前缀）
  → 列表排版归一化
  → 引用背景/颜色覆盖
  → 写入剪贴板（text/html + text/plain）
```

### 代码高亮机制

```
原生语法高亮引擎（非 highlight.js）：
  基于正则表达式 + token 调色板的多语言高亮
  - 支持：JavaScript, TypeScript, Python, Java, C#, C++, Go, Rust, PHP, Bash, SQL, JSON, HTML, CSS, YAML
  - Token 类型：keyword, string, number, comment, function, type, class, property, operator, punctuation, tag, attribute, selector
  - 输出格式：<span style="color: ..." data-syntax="token"> + <font color="...">

highlight.js 仅用于非代码块代码的 fallback 高亮。
```

### 主题系统架构

- **正文主题**：`styles/themes/` 目录下独立 JS 文件（21 套），`ui/theme-manager.js` 负责加载、切换、收藏管理
- **代码块主题**：`ui/code-themes.js` 统一管理（16 套），采用"容器样式 + token 调色板"模型 + 跟随主题模式
- 两套主题独立运作，互不影响

### 文档管理机制

- 文档数据存储在 localStorage（键 `documents`）
- 自动保存：5 秒防抖，状态栏显示 saving / saved / error
- 删除保护：最后一篇文档删除后自动新建空白文档，确保 `documents.length >= 1`
- 当前激活文档 ID 存储在 localStorage（键 `activeDocumentId`）
- 文档排序字段 `sortOrder`，支持上下移动

## 4. 产品约束

- 纯前端静态项目，不引入后端
- 不依赖 Vite / Webpack / npm 构建链路
- 保持本地打开或静态服务器运行即可使用
- 保持现有本地存储与图片协议兼容:
  - `currentStyle`
  - `markdownInput`
  - `documents`
  - `activeDocumentId`
  - `codeBlockSettings`
  - `displaySettings`
  - `tocVisible`
  - `starredStyles`
  - `currentCodeTheme`
  - IndexedDB `WechatEditorImages`
  - `img://` 图片引用格式

## 5. 关键体验要求

### 公众号兼容性

- 粘贴到公众号后台后，正文结构应尽量稳定
- 公式不能出现重复文本、碎片化 TeX 或不可控的 MathML 泄漏
- 代码块不能只剩背景色，必须尽量保留语法高亮与滚动行为
- 图片、表格、引用、列表在复制链路中应保持基本可用

### 可读性优先

- 长公式优先横向滚动，不优先缩小字号
- 长代码优先横向滚动，不优先强制换行
- 浅色主题下代码 token 必须通过对比度保护保持可读

### 写作效率

- 常用 Markdown 结构要能通过工具栏快速插入
- 文档切换、重命名、复制、删除要足够轻量
- 自动保存状态要可见、可感知

## 6. 当前实现边界

本阶段不包含以下能力:

- 多人协作
- 云同步
- 历史版本 / 时间回退
- 图片资源管理面板
- AI 写作辅助
- 可视化公式编辑器

## 7. 验收标准

### 编辑与保存

- 文档创建、切换、删除、复制可正常工作
- 自动保存状态能正确显示 `saving / saved / error`
- 刷新页面后文档与当前状态能恢复

### 公式

- 复杂块级公式在预览中正常显示
- 复制到公众号后不出现重复 TeX / MathML 文本
- 长公式能横向滚动查看完整内容

### 代码块

- 切换不同代码主题时，背景和 token 颜色都发生变化
- 侧栏预览卡片能反映各主题差异
- 复制到公众号后代码块尽量保留高亮与横向滚动
- 浅色主题下不出现不可读白字

### 图片与复制

- 图片粘贴、拖拽、上传后能正常预览
- 复制到公众号时图片能正常带出
- 表格、引用、列表在复制后保持基本结构

### 导出

- 导出 HTML 含本地图片时，直接打开文件可正常显示图片
- 导出/导入 JSON 文档列表完整无丢失

## 8. 迭代记录

### 第一轮：项目重构

**目标**：将花生的单文件项目重构为模块化结构

- 从 `app.js`（3279 行）按职责拆分为 `core/`、`export/`、`storage/`、`ui/` 四个目录
- 内联样式从 `index.html` 抽离为独立 CSS 文件（base / editor / panel）
- 验证：所有功能与重构前一致，本地存储正常读取

### 第二轮：文档管理 + 协作文档

**目标**：完善编辑器核心能力，同时建立 AI 协作文档体系

文档管理功能：
- 多文档创建、切换、复制、删除
- 文档搜索、独立文档标题输入
- 自动保存（5 秒防抖）与状态显示（saving / saved / error）
- 本地持久化恢复（localStorage 键 documents / activeDocumentId）
- 删除保护：最后一篇文档删除后自动新建空白文档

协作文档体系：
- 编写 PRD.md
- 使用 Claude Code 过程中生成 CLAUDE.md
- 使用 Codex 过程中生成 AGENTS.md

### 第三轮：主题系统扩展

**目标**：丰富排版选择，满足不同写作场景

- 正文主题从 13 套扩展到 20+ 套，按风格分类（简约主义 / 技术阅读 / 传统质感 / 设计灵感）
- 代码块主题独立为 16 套，支持侧栏迷你预览
- 代码块主题采用"容器样式 + token 调色板"模型，统一管理

### 第四轮：图片处理优化

**目标**：解决图片粘贴的常见痛点

- 实现 `img://` 自定义协议（编辑器内短链接，避免 Base64 卡顿）
- Canvas 压缩（最大 1920px，质量 85%，GIF/SVG 不压缩）
- IndexedDB 持久化存储（刷新不丢失）
- 复制时自动从 IndexedDB 读取 → 转 Base64

### 第五轮：公式渲染支持

**目标**：支持数学公式在预览和公众号中正确显示

- 预览用 KaTeX（轻量快速）
- 复制到公众号时转 MathJax SVG（兼容公众号渲染环境）
- 长块级公式支持横向滚动

### 第六轮：导出能力扩展

**目标**：支持更多导出场景

- X / Twitter 复制链路（`x-clipboard-exporter.js`）
- HTML / Markdown 文件导出（`file-exporter.js`）

### 第七轮：UI/交互优化

**目标**：基于 DESIGN.md 优化界面

- About 页面独立（`about.html` + `about.css`）
- 暗色模式全局适配
- 移动端响应式优化
- Toast 提示规范化

### 第八轮：功能增强

**目标**：补充格式化支持和图像自定义配置

- GitHub Alerts 提醒语法支持（`alerts-plugin.js`）
- 文档列表导出/导入 JSON（含图片 Base64）
- 图片显示设置面板（边距 / 圆角 / 阴影）
- 字体缩放功能
- 目录（TOC）自动生成与导航
- 主题收藏功能
- 键盘快捷键（Ctrl+B/I/K/S/Tab）
- 导出 HTML 时 blob 图片转 Base64 修复
- 文档上下排序功能
- 编辑器与预览区可拖拽调整宽度

## 9. Todo 与后续规划

### P0（近期优先）

- [x] 文档备份 / 恢复能力（导出/导入 JSON）
- [ ] 更稳定的公众号复制验证与回归测试
- [ ] 移动端体验打磨（工具栏、面板交互）

### P1（中期）

- [ ] 图片管理面板（可视化管理 IndexedDB 中的图片）
- [ ] 自定义正文主题（用户可编辑主题配置）
- [ ] 自定义代码块主题
- [ ] 撤销 / 重做功能

### P2（远期）

- [ ] AI 写作辅助（接入 LLM API）
- [ ] 可视化公式编辑器
- [ ] 历史版本 / 时间回退
- [ ] 导出为长图