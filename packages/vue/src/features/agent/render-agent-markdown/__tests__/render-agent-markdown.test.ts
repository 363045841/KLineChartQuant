// @vitest-environment jsdom
// 本文件验证 Agent Markdown 渲染的格式支持与安全边界。
// DOMPurify 依赖 Node.prototype 上的 nodeName getter，happy-dom 该 getter 返回空串会误删合法标签，故本文件固定使用 jsdom。

import { describe, expect, it } from 'vitest'

import { renderAgentMarkdown } from '../impl/render-agent-markdown'

describe('renderAgentMarkdown', () => {
  /** 验证常用 Markdown 结构会被转换为对应 HTML。 */
  it('renders headings, lists, tables, and code blocks', () => {
    const html = renderAgentMarkdown(
      '# Trend\n\n- bullish\n\n| Price | Signal |\n| --- | --- |\n| 100 | Buy |\n\n```ts\nconst price = 100\n```',
    )

    expect(html).toContain('<h1>Trend</h1>')
    expect(html).toContain('<li>bullish</li>')
    expect(html).toContain('<table>')
    expect(html).toContain('<code class="language-ts">const price = 100')
  })

  /** 验证不可信 HTML 与危险链接不会进入消息视图。 */
  it('does not render raw HTML or dangerous links', () => {
    const html = renderAgentMarkdown('<script>alert(1)</script>\n\n[unsafe](javascript:alert(1))')

    expect(html).not.toContain('<script>')
    expect(html).not.toContain('href="javascript:')
  })

  /** 验证只有消息实际持有的来源才能生成引用按钮。 */
  it('renders verified citation markers as source buttons', () => {
    const html = renderAgentMarkdown('The market is volatile. [[cite:web:tool-1:1]]', [
      {
        id: 'web:tool-1:1',
        title: 'Market report',
        url: 'https://example.com/report',
        snippet: 'Volatility increased.',
      },
    ])

    expect(html).toContain('data-agent-citation-id="web:tool-1:1"')
    expect(html).toContain('>1</button>')
    expect(renderAgentMarkdown('[[cite:web:unknown:1]]')).toContain('[[cite:web:unknown:1]]')
  })

  /** 验证紧邻的引用按钮会标记拼接方向，被空格隔开的引用各自独立。 */
  it('marks adjacent citation markers as a joined pill', () => {
    const citations = [
      { id: 'web:tool-1:1', title: 'A', url: 'https://example.com/a', snippet: 'a' },
      { id: 'web:tool-1:2', title: 'B', url: 'https://example.com/b', snippet: 'b' },
    ]

    const joined = renderAgentMarkdown(
      'Rising. [[cite:web:tool-1:1]][[cite:web:tool-1:2]]',
      citations,
    )
    expect(joined).toContain('class="agent-citation agent-citation--joined-right"')
    expect(joined).toContain('class="agent-citation agent-citation--joined-left"')

    const separated = renderAgentMarkdown(
      'Rising. [[cite:web:tool-1:1]] [[cite:web:tool-1:2]]',
      citations,
    )
    expect(separated).toContain('class="agent-citation"')
    expect(separated).not.toContain('agent-citation--joined')
  })
})
