// 编程式指标定义注册：外部宿主/插件 bundle 的注册入口（与 #272 registerToolHost
// /registerChartTool 同族）。rendererFactory 契约 = Layer<RenderContext> 工厂
//（上游 #277 退役 RendererPlugin 后的统一绘制契约），测试经共享 helper
// createIndicatorRendererLayer 组装，与内置指标渲染器（alma.ts 等）同构。

import { describe, expect, it } from 'vitest'

import {
  getRegisteredIndicatorDefinitions,
  registerIndicatorDefinition,
} from '../../engine/indicators/indicatorDefinitionRegistry.js'
import { RENDERER_PRIORITY } from '../../foundation/plugin/index.js'
import type { RenderContext } from '../../foundation/plugin/index.js'
import { allIndicators } from '../../engine/renderers/Indicator/indicatorCatalog.js'
import { createIndicatorRendererLayer } from '../../engine/renderers/Indicator/shared/indicatorRendererLayer.js'
import type { Layer } from '../../rendering/scene/types.js'

/** 组装最小 Layer 工厂：身份唯一即可，绘制体留空（注册表测试不触发绘制）。 */
function createSampleLayerFactory(layerName: string) {
  return (): Layer<RenderContext> =>
    createIndicatorRendererLayer({
      name: layerName,
      paneId: 'main',
      z: RENDERER_PRIORITY.INDICATOR,
      draw: () => {},
    })
}

describe('registerIndicatorDefinition (programmatic)', () => {
  it('registers an external definition visible via the catalog', () => {
    registerIndicatorDefinition(
      {
        name: 'sample_external_indicator',
        displayName: 'Sample External',
        kind: 'indicator',
        category: 'main',
        indicatorType: 'trend',
        defaultPaneId: 'main',
        mainPane: { rendererName: 'sample_external_renderer' },
      },
      createSampleLayerFactory('sample_external_renderer'),
    )

    const fromRegistry = getRegisteredIndicatorDefinitions().find(
      (d) => d.name === 'sample_external_indicator',
    )
    expect(fromRegistry).toBeDefined()
    expect(fromRegistry?.displayName).toBe('Sample External')
    expect(allIndicators().some((i) => i.id === 'Sample External')).toBe(true)
  })

  it('rejects duplicate registration of the same name', () => {
    const config = {
      name: 'dup_external_indicator',
      displayName: 'Dup External',
      kind: 'indicator',
      category: 'main',
      indicatorType: 'trend',
      defaultPaneId: 'main',
      mainPane: { rendererName: 'dup_renderer' },
    } as const
    registerIndicatorDefinition(config, createSampleLayerFactory('dup_renderer'))

    expect(() => registerIndicatorDefinition(config, createSampleLayerFactory('dup_renderer'))).toThrow(
      /already registered/,
    )
  })

  it('accepts params schema via definition config', () => {
    registerIndicatorDefinition(
      {
        name: 'sample_param_indicator',
        displayName: 'Sample Params',
        kind: 'indicator',
        category: 'main',
        indicatorType: 'trend',
        defaultPaneId: 'main',
        mainPane: { rendererName: 'sample_param_renderer' },
        ui: {
          params: [{ key: 'period', label: '周期', type: 'number', min: 1, max: 500, default: 14 }],
        },
      },
      createSampleLayerFactory('sample_param_renderer'),
    )

    const def = allIndicators().find((i) => i.id === 'Sample Params')
    expect(def?.params?.[0]?.key).toBe('period')
  })

  it('multiple programmatic definitions coexist in one registry', () => {
    expect(
      getRegisteredIndicatorDefinitions().some((d) => d.name === 'sample_external_indicator'),
    ).toBe(true)
    expect(
      getRegisteredIndicatorDefinitions().some((d) => d.name === 'sample_param_indicator'),
    ).toBe(true)
  })
})
