/** 验证运行时脚本注册、选择器分组和参数类型沿同一目录传递。 */
import 'fake-indexeddb/auto'

import {
  type ChartController,
  createIndicatorSelectorController,
  findIndicator,
} from '@363045841yyt/klinechart-core/controllers'
import { createScriptService, type ScriptService } from '@363045841yyt/klinechart-script-chart'
import { beforeAll, describe, expect, it } from 'vitest'
import { effectScope, ref } from 'vue'
import { useIndicatorParams } from '../../components/indicator-params/impl/useIndicatorParams.js'
import { useIndicatorCatalog } from '../useIndicatorCatalog.js'
import { INDICATOR_SELECTOR_SECTIONS, useIndicatorFavorites } from '../useIndicatorFavorites.js'

describe('Script selector catalog', () => {
  let scripts: ScriptService
  beforeAll(async () => {
    scripts = await createScriptService()
  })
  it('宿主注册现有平均脚本后，目录将它列为主图用户脚本', async () => {
    await scripts.create(
      `defineIndicator({ name: 'OC Average', pane: 'main', inputs: {}, onBar() {} })`,
    )
    const indicator = findIndicator('OC Average')
    expect(indicator).toMatchObject({ id: 'OC Average', source: 'script', pane: 'main' })
  })
  it('组件挂载后注册的脚本进入专用分组，保留输入类型和默认值', async () => {
    const scope = effectScope()
    const controller = createIndicatorSelectorController()
    scope.run(() => {
      useIndicatorCatalog(controller)
    })
    await scripts.create(`defineIndicator({ name: 'SelectorScript',
      inputs: { period: input(5), text: input('close'), enabled: input(false) },
      onBar() { plot(PlotKind.Line, close[0], { id: 'close' }) } })`)
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
  it('input() 声明的标题作为参数面板显示名', async () => {
    await scripts.create(`defineIndicator({ name: 'TitledInputScript', inputs: { n: input(2, { title: '除数' }) },
      onBar() { plot(PlotKind.Line, close[0], { id: 'close' }) } })`)

    expect(findIndicator('TitledInputScript')!.params).toEqual([
      { key: 'n', label: '除数', type: 'number', default: 2 },
    ])
  })
  it('更新脚本输入后目录参数随之刷新，定义数量不变也能失效缓存', async () => {
    const created = await scripts.create(
      `defineIndicator({ name: 'UpdatableScript', inputs: { period: input(3) }, onBar() {} })`,
    )
    expect(findIndicator('UpdatableScript')!.params).toEqual([
      { key: 'period', label: 'period', type: 'number', default: 3 },
    ])

    await scripts.update(
      created.id,
      `defineIndicator({ name: 'UpdatableScript',
        inputs: { period: input(7), label: input('ma', { title: '名称' }) }, onBar() {} })`,
      created.revision,
    )
    expect(findIndicator('UpdatableScript')!.params).toEqual([
      { key: 'period', label: 'period', type: 'number', default: 7 },
      { key: 'label', label: '名称', type: 'string', default: 'ma' },
    ])
  })
  it('字符串输入声明 options 后成为下拉参数', async () => {
    await scripts.create(
      `defineIndicator({ name: 'OptionScript', inputs: {
        type: input('SMA', { title: '算法', options: ['SMA', 'EMA'] }),
      }, onBar() {} })`,
    )

    expect(findIndicator('OptionScript')!.params).toEqual([
      {
        key: 'type',
        label: '算法',
        type: 'select',
        default: 'SMA',
        options: [
          { value: 'SMA', label: 'SMA' },
          { value: 'EMA', label: 'EMA' },
        ],
      },
    ])
  })
})
