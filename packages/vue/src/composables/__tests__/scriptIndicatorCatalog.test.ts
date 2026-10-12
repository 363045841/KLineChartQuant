/** 验证运行时脚本注册、选择器分组和参数类型沿同一目录传递。 */

import { registerScriptIndicator } from '@363045841yyt/klinechart-core'
import {
  type ChartController,
  createIndicatorSelectorController,
  findIndicator,
} from '@363045841yyt/klinechart-core/controllers'
import { openCloseAverage } from '@363045841yyt/klinechart-script/indicators'
import { describe, expect, it } from 'vitest'
import { effectScope, ref } from 'vue'
import { useIndicatorCatalog } from '../useIndicatorCatalog.js'
import { INDICATOR_SELECTOR_SECTIONS, useIndicatorFavorites } from '../useIndicatorFavorites.js'
import { useIndicatorParams } from '../useIndicatorParams.js'

describe('Script selector catalog', () => {
  it('宿主注册现有平均脚本后，目录将它列为主图用户脚本', () => {
    registerScriptIndicator(openCloseAverage, { pane: 'main' })
    const indicator = findIndicator(openCloseAverage.name)
    expect(indicator).toMatchObject({ id: 'OC Average', source: 'script', pane: 'main' })
  })
  it('组件挂载后注册的脚本进入专用分组，保留输入类型和默认值', () => {
    const scope = effectScope()
    const controller = createIndicatorSelectorController()
    scope.run(() => {
      useIndicatorCatalog(controller)
    })
    registerScriptIndicator({
      name: 'SelectorScript',
      inputs: { period: { default: 5 }, text: { default: 'close' }, enabled: { default: false } },
      onBar(ctx) {
        ctx.plot(ctx.close, { id: 'close' })
      },
    })
    const definition = controller.catalog.peek().find((item) => item.id === 'SelectorScript')!
    expect(definition.source).toBe('script')
    expect(definition.params).toEqual([
      { key: 'period', label: 'period', type: 'number', default: 5 },
      { key: 'text', label: 'text', type: 'string', default: 'close' },
      { key: 'enabled', label: 'enabled', type: 'boolean', default: false },
    ])
    const available = ref(controller.catalog.peek())
    const groups = scope.run(() =>
      useIndicatorFavorites(ref<ChartController | null>(null), available),
    )!
    expect(groups.filteredIndicators.value.some((item) => item.id === definition.id)).toBe(false)
    groups.section.value = INDICATOR_SELECTOR_SECTIONS.scripts
    expect(groups.filteredIndicators.value.map((item) => item.id)).toContain(definition.id)
    expect(groups.filteredIndicators.value.every((item) => item.source === 'script')).toBe(true)
    controller.setSearchQuery('SelectorScript')
    expect(controller.filteredSub.peek().map((item) => item.id)).toEqual(['SelectorScript'])
    expect(controller.add(definition.id)).not.toBeNull()
    expect(controller.active.peek()[0]?.params).toEqual({
      period: 5,
      text: 'close',
      enabled: false,
    })
    const params = findIndicator(definition.id)!.params!
    scope.run(() => {
      const draft = useIndicatorParams({ visible: true, values: {}, params })
      draft.onReset()
      expect(draft.localValues.value).toEqual({ period: 5, text: 'close', enabled: false })
    })
    scope.stop()
  })
})
