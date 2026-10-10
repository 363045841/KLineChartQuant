// @vitest-environment node
/** 验证直接挂载 Core 的适配器可在无 DOM 的服务端渲染，且不触发 Core 加载。 */

import type { ChartControllerFactory } from '@363045841yyt/klinechart-core'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { KLineChart } from '../index'

describe('KLineChart SSR', () => {
  it('renders only the container on the server', () => {
    const factory = vi.fn<ChartControllerFactory>()
    const html = renderToString(createElement(KLineChart, { factory, className: 'chart' }))

    expect(typeof window).toBe('undefined')
    expect(html).toContain('class="chart"')
    expect(factory).not.toHaveBeenCalled()
  })
})
