// 本文件负责将 Agent 的 Markdown 文本转换为可安全注入消息视图的 HTML。

import DOMPurify from 'dompurify'
import MarkdownIt from 'markdown-it'

// 禁用原始 HTML，避免模型输出绕过 Markdown 语法直接插入标签。
const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
})

/** 将 Agent Markdown 解析并清洗为安全 HTML。 */
export function renderAgentMarkdown(content: string): string {
  return DOMPurify.sanitize(markdown.render(content), { USE_PROFILES: { html: true } })
}
