/** 验证运行时脚本注册、选择器分组和参数类型沿同一目录传递。 */
import 'fake-indexeddb/auto'

import {
  type ChartController,
  createIndicatorSelectorController,
  findIndicatorDefinition,
  indicatorCatalog,
} from '@363045841yyt/klinechart-core/controllers'
import { createScriptService, type ScriptService } from '@363045841yyt/klinechart-script-chart'
import { useIndicatorParams } from '@vue-src/components/indicator/params/impl/useIndicatorParams.js'
import { coreSignalToVueRef } from '@vue-src/utils/signalBridge.js'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { NodeScriptWorker } from '../../../../../script/src/worker/__tests__/nodeWorker.js'
import { INDICATOR_SELECTOR_SECTIONS, useIndicatorFavorites } from '../useIndicatorFavorites.js'
import { useScriptRemoval } from '../useScriptRemoval.js'

vi.stubGlobal('Worker', NodeScriptWorker)

describe('Script selector catalog', () => {
  let scripts: ScriptService
  beforeAll(async () => {
    scripts = await createScriptService()
  })
  afterAll(() => scripts.dispose())

  /** 选择器目录直接读注册表投影，测试无需再手动刷新。 */
  function createSelector() {
    return createIndicatorSelectorController({ catalog: indicatorCatalog })
  }

  it('宿主注册现有平均脚本后，目录将它列为主图用户脚本', async () => {
    const created = await scripts.create(
      `defineIndicator({ name: 'OC Average', position: 'main', inputs: {}, onBar() {} })`,
    )
    expect(findIndicatorDefinition('OC Average')).toMatchObject({
      id: created.id,
      label: 'OC Average',
      source: 'script',
      role: 'main',
      documentIdentity: 'user',
    })
  })

  it('脚本 title/info 控制选择器 item-name 与说明，name 仍是身份', async () => {
    const created = await scripts.create(
      `defineIndicator({ name: 'OC Display', title: 'OC 展示名', info: 'OC 说明', position: Position.Sub, inputs: {}, onBar() {} })`,
    )
    expect(findIndicatorDefinition('OC Display')).toMatchObject({
      id: created.id,
      label: 'OC Display',
      name: 'OC 展示名',
      description: 'OC 说明',
    })
  })

  it('注册后的脚本进入专用分组，保留输入类型和默认值', async () => {
    const scope = effectScope()
    const controller = createSelector()
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
    const available = scope.run(() => coreSignalToVueRef(indicatorCatalog))!
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
    const params = findIndicatorDefinition(definition.id)!.params
    scope.run(() => {
      const draft = useIndicatorParams({ visible: true, values: {}, params })
      draft.onReset()
      expect(draft.localValues.value).toEqual({ period: 5, text: 'close', enabled: false })
    })
    scope.stop()
  })

  it.each([
    {
      label: 'input() 的 title 作为参数显示名',
      source: `defineIndicator({ name: 'TitledInputScript', position: Position.Sub,
        onBar() { const n = input.float(2, { title: '除数' }); plot.Line(close, 'close') } })`,
      params: [{ key: 'n', label: '除数', type: 'number', default: 2 }],
    },
    {
      label: 'input() 的 options 成为下拉参数',
      source: `defineIndicator({ name: 'OptionScript', position: Position.Sub, onBar() {
        const type = input.string('SMA', { title: '算法', options: ['SMA', 'EMA'] })
      } })`,
      params: [
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
      ],
    },
  ])('输入声明映射为参数：$label', async ({ source, params }) => {
    const created = await scripts.create(source)
    expect(findIndicatorDefinition(created.id)!.params).toEqual(params)
  })

  it('更新脚本输入后目录参数随之刷新，定义数量不变也能失效缓存', async () => {
    const created = await scripts.create(
      `defineIndicator({ name: 'UpdatableScript', position: Position.Sub, onBar() { const period = input.float(3) } })`,
    )
    expect(findIndicatorDefinition('UpdatableScript')!.params).toEqual([
      { key: 'period', label: 'period', type: 'number', default: 3 },
    ])

    await scripts.update(
      created.id,
      `defineIndicator({ name: 'RenamedUpdatableScript', position: Position.Sub,
        onBar() { const period = input.float(7); const label = input.string('ma', { title: '名称' }) } })`,
      created.revision,
    )
    expect(findIndicatorDefinition('UpdatableScript')).toBeUndefined()
    expect(findIndicatorDefinition(created.id)).toMatchObject({
      id: created.id,
      label: 'RenamedUpdatableScript',
    })
    expect(findIndicatorDefinition(created.id)!.params).toEqual([
      { key: 'period', label: 'period', type: 'number', default: 7 },
      { key: 'label', label: '名称', type: 'string', default: 'ma' },
    ])
  })

  it('从选择器删除用户脚本后目录同步移除，非用户脚本不提供删除入口', async () => {
    const controller = createSelector()
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
  })
})
