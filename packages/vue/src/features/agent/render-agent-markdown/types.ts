// Agent Markdown 渲染的契约层：MarkdownIt 环境与引用 token 形状；实现位于 impl/。

import type { SourceCitation } from '../agent-contracts.js'

/** 注入 MarkdownIt 的渲染环境：已验证来源及其展示序号。 */
export interface AgentMarkdownEnvironment {
  /** 已验证来源，按 id 索引；不在其中的标记不会被渲染。 */
  citations?: ReadonlyMap<string, SourceCitation>
  /** 来源 id 到展示序号的映射。 */
  citationNumbers?: ReadonlyMap<string, number>
}

/** 引用标记解析后写入 token.meta 的数据。 */
export interface AgentCitationToken {
  /** 对应的已验证来源。 */
  citation: SourceCitation
  /** 引用按钮展示的序号。 */
  number: number
}
