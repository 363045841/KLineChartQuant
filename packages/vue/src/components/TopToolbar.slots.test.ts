/** 验证宿主导航使用公开插槽接入工具栏，且不影响默认图表控件。 */

import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import KLineChart from './KLineChart.vue'

describe('KLineChart toolbar host slots', () => {
  it('renders host controls around the native toolbar in reading order', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(
            KLineChart,
            {},
            {
              'toolbar-start': () => h('button', { 'aria-label': 'Host account' }, 'Account'),
              'toolbar-end': () => h('a', { href: '/sign-in' }, 'Host sign-in'),
            },
          ),
      }),
    )
    expect(html).toContain('Host account')
    expect(html).toContain('Host sign-in')
    expect(html.indexOf('Host account')).toBeLessThan(html.indexOf('top-toolbar__controls'))
    expect(html.indexOf('Host sign-in')).toBeGreaterThan(html.indexOf('screenshot-actions'))
  })

  it('keeps the default toolbar free of empty host containers', async () => {
    const html = await renderToString(createSSRApp(KLineChart))
    expect(html).toContain('top-toolbar__controls')
    expect(html).not.toContain('top-toolbar__host')
  })
})
