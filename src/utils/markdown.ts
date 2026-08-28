import { Marked } from 'marked'
import { markedHighlight } from 'marked-highlight'
import hljs from 'highlight.js'
import katex from 'katex'
import DOMPurify from 'dompurify'
import mermaid from 'mermaid'

mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  flowchart: { htmlLabels: true, curve: 'basis' },
})

const marked = new Marked(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value
      }
      return hljs.highlightAuto(code).value
    },
  }),
)

function katexHtml(formula: string, displayMode: boolean): string {
  try {
    return katex.renderToString(formula.trim(), {
      displayMode,
      throwOnError: false,
      strict: 'ignore',
      output: 'html',
    })
  } catch {
    return `<code class="math-error">${formula}</code>`
  }
}

function protectMath(text: string): { text: string; slots: string[] } {
  const slots: string[] = []
  const push = (html: string) => {
    const i = slots.length
    slots.push(html)
    return `%%MATH${i}%%`
  }

  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, f) => push(katexHtml(f, true)))
  text = text.replace(/\\\[([\s\S]+?)\\\]/g, (_, f) => push(katexHtml(f, true)))
  text = text.replace(/\\\(([\s\S]+?)\\\)/g, (_, f) => push(katexHtml(f, false)))
  text = text.replace(/(?<!\$)\$(?!\$)([^$\n]+?)\$(?!\$)/g, (_, f) => push(katexHtml(f, false)))

  return { text, slots }
}

function restoreSlots(html: string, prefix: string, slots: string[]): string {
  const re = new RegExp(`%%${prefix}(\\d+)%%`, 'g')
  return html.replace(re, (_, i) => slots[Number(i)] ?? '')
}

/** 抽出完整 ```mermaid 代码块，流式未闭合时保留原文 */
function extractMermaidBlocks(text: string): { text: string; codes: string[] } {
  const codes: string[] = []
  const out = text.replace(/```mermaid\s*([\s\S]*?)```/gi, (_, code: string) => {
    const i = codes.length
    codes.push(code.trim())
    return `\n\n%%MERMAID${i}%%\n\n`
  })
  return { text: out, codes }
}

const mermaidCache = new Map<string, string>()

async function renderMermaidSvg(code: string, index: number): Promise<string> {
  const cached = mermaidCache.get(code)
  if (cached) return cached

  try {
    const id = `mmd-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`
    const { svg } = await mermaid.render(id, code)
    const html = `<div class="mermaid-wrap">${svg}</div>`
    mermaidCache.set(code, html)
    // mermaid 可能在 body 留下临时节点，清理一下
    document.getElementById(id)?.remove()
    document.getElementById(`d${id}`)?.remove()
    return html
  } catch (e) {
    document.querySelectorAll('[id^="dmermaid-"], [id^="dmmd-"]').forEach((el) => el.remove())
    const msg = e instanceof Error ? e.message : String(e)
    return `<pre class="mermaid-error">Mermaid 渲染失败：${msg}\n\n${code}</pre>`
  }
}

function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
    ADD_TAGS: [
      'span', 'math', 'semantics', 'mrow', 'mi', 'mo', 'mn', 'msup', 'msub',
      'mfrac', 'msqrt', 'mroot', 'mspace', 'annotation', 'mtable', 'mtr', 'mtd',
      'mover', 'munder', 'munderover',
      // Mermaid SVG
      'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
      'text', 'tspan', 'defs', 'marker', 'use', 'foreignObject', 'style', 'title', 'desc',
    ],
    ADD_ATTR: [
      'class', 'style', 'aria-hidden', 'xmlns', 'encoding', 'display',
      'linebreak', 'width', 'height', 'mathvariant',
      'viewBox', 'preserveAspectRatio', 'd', 'fill', 'stroke', 'stroke-width',
      'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'transform',
      'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
      'dx', 'dy', 'text-anchor', 'dominant-baseline', 'font-size', 'font-family',
      'font-weight', 'marker-end', 'marker-start', 'refX', 'refY', 'orient',
      'markerWidth', 'markerHeight', 'id', 'href', 'xlink:href', 'opacity',
      'rx', 'ry', 'points', 'clip-path', 'data-id',
    ],
  })
}

export async function renderMarkdown(raw: string): Promise<string> {
  const { text: withoutMermaid, codes } = extractMermaidBlocks(raw)
  const { text: withMathPlaceholders, slots: mathSlots } = protectMath(withoutMermaid)

  let html = await marked.parse(withMathPlaceholders)
  html = restoreSlots(html as string, 'MATH', mathSlots)

  // 异步渲染完整 mermaid 块
  if (codes.length) {
    const svgs = await Promise.all(codes.map((c, i) => renderMermaidSvg(c, i)))
    html = restoreSlots(html, 'MERMAID', svgs)
  }

  return sanitizeHtml(html)
}

/** 本地数学公式 mock */
export const MATH_DEMO_MARKDOWN = `# 数学公式演示（KaTeX）

二次方程求根公式：

$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$

欧拉公式：

$$e^{i\\pi} + 1 = 0$$

行内公式：勾股定理 $a^2 + b^2 = c^2$，以及 $E = mc^2$。

积分：

$$\\int_0^1 x^2 \\, dx = \\frac{1}{3}$$
`

/** 本地 Mermaid 流程图 mock */
export const MERMAID_DEMO_MARKDOWN = `# Mermaid 流程图演示

下面是一个 SSE 流式对话处理流程：

\`\`\`mermaid
flowchart TD
  A[用户发送消息] --> B[服务端 SSE 推送]
  B --> C{文本类型?}
  C -->|Markdown| D[marked 解析]
  C -->|数学公式| E[KaTeX 渲染]
  C -->|流程图| F[Mermaid 渲染]
  D --> G[DOMPurify 清洗]
  E --> G
  F --> G
  G --> H[v-html 展示]
\`\`\`

也可以画时序图：

\`\`\`mermaid
sequenceDiagram
  participant U as 用户
  participant F as 前端
  participant S as 服务端
  U->>F: 点击发送
  F->>S: EventSource 连接
  S-->>F: data chunk...
  F->>F: renderMarkdown
  F-->>U: 实时更新 UI
\`\`\`
`
