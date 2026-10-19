/** 将 TypeScript 的签名、JSDoc 正文和标签渲染到同一个悬浮提示中。 */
import type { EditorView, TooltipView } from '@codemirror/view'
import type { HoverInfo } from '@valtown/codemirror-ts'
import MarkdownIt from 'markdown-it'
import type { SymbolDisplayPart } from 'typescript'
import type { ScriptCodeView } from './types.js'
import { createScriptCodeView } from './createScriptCodeView.js'

// JSDoc 使用现有 Markdown 解析器；禁用原始 HTML，表格和行内代码由解析器生成。
const documentationMarkdown = new MarkdownIt({ html: false, breaks: true })

/** 正文和标签共用 Markdown 渲染，文档格式只在声明资源中维护。 */
function appendDocumentation(
  parent: HTMLElement,
  parts: readonly SymbolDisplayPart[],
  codeViews: ScriptCodeView[],
): void {
  const content = parent.ownerDocument.createElement('div')
  content.className = 'cm-script-hover-documentation'
  content.innerHTML = documentationMarkdown.render(parts.map((part) => part.text).join(''))
  parent.append(content)
  // 仅块级代码交给只读代码视图；行内 code 保持行内流，块级编辑器会把每个标识符强制换行。
  for (const code of content.querySelectorAll<HTMLElement>('pre > code')) {
    const source = code.textContent ?? ''
    code.replaceChildren()
    codeViews.push(createScriptCodeView(code, source))
  }
}

/** 复用 hover 已返回的语义信息，不按函数名查表或重新解析源码。 */
export function renderScriptHover(info: HoverInfo, view: EditorView): TooltipView {
  // 编辑器可以挂载在独立窗口，节点必须属于该编辑器所在的文档。
  const document = view.dom.ownerDocument
  const dom = document.createElement('div')
  dom.className = 'cm-script-tooltip cm-script-hover'
  const codeViews: ScriptCodeView[] = []
  const quickInfo = info.quickInfo
  if (!quickInfo) return { dom }

  if (quickInfo.displayParts?.length) {
    const signature = document.createElement('div')
    signature.className = 'cm-script-hover-signature'
    codeViews.push(
      createScriptCodeView(signature, quickInfo.displayParts.map((part) => part.text).join('')),
    )
    dom.append(signature)
  }
  if (quickInfo.documentation?.length) {
    const description = document.createElement('div')
    description.className = 'cm-script-hover-description'
    appendDocumentation(description, quickInfo.documentation, codeViews)
    dom.append(description)
  }
  if (quickInfo.tags?.length) {
    const tags = document.createElement('dl')
    tags.className = 'cm-script-hover-tags'
    for (const tag of quickInfo.tags) {
      const label = document.createElement('dt')
      label.textContent = `@${tag.name}`
      const content = document.createElement('dd')
      if (tag.text) {
        // TypeScript 将参数名作为独立分段返回，以行内代码交给同一个高亮器。
        appendDocumentation(
          content,
          tag.text.map((part) =>
            part.kind === 'parameterName' ? { ...part, text: `\`${part.text}\`` } : part,
          ),
          codeViews,
        )
      }
      tags.append(label, content)
    }
    dom.append(tags)
  }
  return {
    dom,
    destroy() {
      for (const codeView of codeViews) codeView.destroy()
    },
  }
}
