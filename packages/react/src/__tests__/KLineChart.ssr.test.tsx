import { systemClock } from '@363045841yyt/klinechart-core'
// @vitest-environment node
/** 验证直接挂载 Core 的适配器可在无 DOM 的服务端渲染，且不触发 Core 加载。 */

import type { ChartControllerFactory } from '@363045841yyt/klinechart-core'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { createDefinitionRegistry, createMarketRuntime } from '@363045841yyt/klinechart-core'
import { createMarketDataHost } from '@363045841yyt/klinechart-core/market-data'
import { KLineChart } from '../index'

describe('KLineChart SSR', () => {
  it('renders only the container on the server', () => {
    const runtime = createMarketRuntime({ clock: systemClock,
      market: createMarketDataHost(),
      definitions: createDefinitionRegistry(),
    })
    const factory = vi.fn<ChartControllerFactory>()
    try {
      const html = renderToString(createElement(KLineChart, { runtime, factory, className: 'chart' }))

      expect(typeof window).toBe('undefined')
      expect(html).toContain('class="chart"')
      expect(factory).not.toHaveBeenCalled()
    } finally {
      runtime.dispose()
    }
  })
})
