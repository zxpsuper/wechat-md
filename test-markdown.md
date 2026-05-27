# 公众号 Markdown 编辑器

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

```javascript
const compressedBlob = await imageCompressor.compress(file);
await imageStore.saveImage(imageId, compressedBlob);

const markdown = `![图片](img://${imageId})`;
```



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

这是行内代码 `console.log('hello')`

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

```javascript
function greet(name) {
  const message = `Hello, ${name}!`;
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
```

### Python

```python
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
```

### HTML

```html
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
```

### CSS

```css
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
```

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

二次方程 $ax^2 + bx + c = 0$ 的解为 $x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$。

### 块级公式

欧拉公式：

$$e^{i\pi} + 1 = 0$$

高斯积分：

$$\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}$$

矩阵：

$$\begin{pmatrix} a & b \\ c & d \end{pmatrix} \begin{pmatrix} x \\ y \end{pmatrix} = \begin{pmatrix} ax + by \\ cx + dy \end{pmatrix}$$

求和公式：

$$\sum_{i=1}^{n} i = \frac{n(n+1)}{2}$$

极限：

$$\lim_{x \to 0} \frac{\sin x}{x} = 1$$

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
