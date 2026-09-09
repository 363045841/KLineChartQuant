// 本文件将网络搜索结果转换为模型可引用的文本与结构化来源。

import { formatAgentCitation, type SourceCitation } from '../contracts/ui.js'

import type { WebSearchSource } from './types.js'

/** 判断搜索来源是否可安全作为浏览器外链打开。 */
function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/** 将一次网络搜索的来源编号，并告知模型必须使用的引用标记。 */
export function formatWebSearchResult(
  sources: readonly WebSearchSource[],
  toolCallId: string,
): { readonly content: string; readonly citations: readonly SourceCitation[] } {
  const citations = sources
    .filter((source) => isHttpUrl(source.url))
    .map((source, index) => ({ ...source, id: `web:${toolCallId}:${index + 1}` }))
  return {
    content: JSON.stringify({
      sources: citations,
      citationInstruction:
        'Cite a supporting source immediately after the claim using its exact citation marker.',
      citationExamples: citations.map((source) => formatAgentCitation(source.id)),
    }),
    citations,
  }
}
