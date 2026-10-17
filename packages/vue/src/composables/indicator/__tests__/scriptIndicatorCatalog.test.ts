/** 验证运行时脚本注册、选择器分组和参数类型沿同一目录传递。 */
import 'fake-indexeddb/auto'

import {
  type ChartController,
  createIndicatorSelectorController,
  findIndicator,
} from '@363045841yyt/klinechart-core/controllers'
import { createScriptService, type ScriptService } from '@363045841yyt/klinechart-script-chart'
import { useIndicatorParams } from '@vue-src/components/indicator/params/impl/useIndicatorParams.js'
import { beforeAll, describe, expect, it } from 'vitest'
import { effectScope, ref } from 'vue'
import { useIndicatorCatalog } from '../useIndicatorCatalog.js'
import { INDICATOR_SELECTOR_SECTIONS, useIndicatorFavorites } from '../useIndicatorFavorites.js'
import { useScriptRemoval } from '../useScriptRemoval.js'

describe('Script selector catalog', () => {
  let scripts: ScriptService
  beforeAll(async () => {
    scripts = await createScriptService()
  })
  it('宿主注册现有平均脚本后，目录将它列为主图用户脚本', async () => {
    const created = await scripts.create(
      `defineIndicator({ name: 'OC Average', position: 'main', inputs: {}, onBar() {} })`,
    )
    const indicator = findIndicator('OC Average')
    expect(indicator).toMatchObject({
      id: created.id,
      label: 'OC Average',
      source: 'script',
      pane: 'main',
    })
  })
  it('组件挂载后注册的脚本进入专用分组，保留输入类型和默认值', async () => {
    const scope = effectScope()
    const controller = createIndicatorSelectorController()
    scope.run(() => {
      useIndicatorCatalog(controller)
    })
    const created = await scripts.create(`defineIndicator({ name: 'SelectorScript',
      position: Position.Sub,
      onBar() { const period = input.float(5); const text = input.string('close'); const enabled = input.bool(false); plot.Line(close, 'close') } })`)
    const definition = controller.catalog.peek().find((item) => item.id === created.id)!
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
    expect(controller.filteredSub.peek().map((item) => item.id)).toEqual([created.id])
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
    await scripts.create(`defineIndicator({ name: 'TitledInputScript', position: Position.Sub,
      onBar() { const n = input.float(2, { title: '除数' }); plot.Line(close, 'close') } })`)

    expect(findIndicator('TitledInputScript')!.params).toEqual([
      { key: 'n', label: '除数', type: 'number', default: 2 },
    ])
  })
  it('更新脚本输入后目录参数随之刷新，定义数量不变也能失效缓存', async () => {
    const created = await scripts.create(
      `defineIndicator({ name: 'UpdatableScript', position: Position.Sub, onBar() { const period = input.float(3) } })`,
    )
    expect(findIndicator('UpdatableScript')!.params).toEqual([
      { key: 'period', label: 'period', type: 'number', default: 3 },
    ])

    await scripts.update(
      created.id,
      `defineIndicator({ name: 'RenamedUpdatableScript', position: Position.Sub,
        onBar() { const period = input.float(7); const label = input.string('ma', { title: '名称' }) } })`,
      created.revision,
    )
    expect(findIndicator('UpdatableScript')).toBeUndefined()
    expect(findIndicator(created.id)).toMatchObject({
      id: created.id,
      label: 'RenamedUpdatableScript',
    })
    expect(findIndicator(created.id)!.params).toEqual([
      { key: 'period', label: 'period', type: 'number', default: 7 },
      { key: 'label', label: '名称', type: 'string', default: 'ma' },
    ])
  })
  it('从选择器删除用户脚本后刷新目录，非用户脚本不提供删除入口', async () => {
    const scope = effectScope()
    const controller = createIndicatorSelectorController()
    scope.run(() => useIndicatorCatalog(controller))
    const document = await scripts.create(
      `defineIndicator({ name: 'RemovableSelectorScript', position: Position.Sub, onBar() {} })`,
    )
    const removal = useScriptRemoval(scripts)
    expect(removal.canRemove(document.id)).toBe(true)
    expect(removal.canRemove('MA')).toBe(false)
    expect(controller.catalog.peek().some((item) => item.id === document.id)).toBe(true)
    await removal.removeScript(document.id)
    expect(removal.removalError.value).toBeNull()
    expect(removal.removing.value).toBeNull()
    expect(scripts.read(document.id)).toBeUndefined()
    expect(controller.catalog.peek().some((item) => item.id === document.id)).toBe(false)
    scope.stop()
  })

  it('字符串输入声明 options 后成为下拉参数', async () => {
    await scripts.create(
      `defineIndicator({ name: 'OptionScript', position: Position.Sub, onBar() {
        const type = input.string('SMA', { title: '算法', options: ['SMA', 'EMA'] })
      } })`,
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
