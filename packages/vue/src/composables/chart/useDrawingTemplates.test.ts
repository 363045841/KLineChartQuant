/** 共享模板门面用例：列表共享、保存与删除。 */

import type { DrawingKind, DrawingTemplate } from '@363045841yyt/klinechart-core/engine/drawing'
import { describe, expect, it } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { createMemoryTemplateStore } from '../../__tests__/_templateStoreFixture.js'
import { useDrawingTemplates } from './useDrawingTemplates.js'

function setup(seed: Record<string, DrawingTemplate[]> = {}) {
  const kind = ref<DrawingKind | undefined>('trend-line')
  const { store } = createMemoryTemplateStore(seed)
  const scope = effectScope()
  const actions = scope.run(() => useDrawingTemplates(kind, store))!
  return { kind, actions, stop: () => scope.stop() }
}

describe('useDrawingTemplates', () => {
  it('同一仓库与图元类型的多个使用方共享模板列表', async () => {
    const kind = ref<DrawingKind | undefined>('trend-line')
    const { store } = createMemoryTemplateStore()
    const scope = effectScope()
    const actions = scope.run(() => ({
      first: useDrawingTemplates(kind, store),
      second: useDrawingTemplates(kind, store),
    }))!
    try {
      await actions.first.save({ name: '共享', style: { stroke: '#123456' } })
      expect(actions.second.templates.value).toEqual([
        { name: '共享', style: { stroke: '#123456' } },
      ])
    } finally {
      scope.stop()
    }
  })

  it('加载模板并在类型切换时清空列表', async () => {
    const fixture = setup({ 'trend-line': [{ name: '一', style: { stroke: '#123456' } }] })
    try {
      await fixture.actions.reload()
      expect(fixture.actions.templates.value).toHaveLength(1)

      fixture.kind.value = 'rectangle'
      await nextTick()
      expect(fixture.actions.templates.value).toEqual([])
    } finally {
      fixture.stop()
    }
  })

  it('保存、同名更新、删除都写回列表', async () => {
    const fixture = setup()
    try {
      await fixture.actions.save({ name: '新', style: { stroke: '#abcdef' } })
      expect(fixture.actions.templates.value.map((item) => item.name)).toEqual(['新'])

      await fixture.actions.save({ name: '新', style: { stroke: '#000000' } })
      expect(fixture.actions.templates.value).toEqual([
        { name: '新', style: { stroke: '#000000' } },
      ])
      expect(fixture.actions.savedName.value).toBeNull()

      await fixture.actions.save({ name: '新', style: { stroke: '#111111' } }, true)
      expect(fixture.actions.savedName.value).toBe('新')

      await fixture.actions.reload()
      expect(fixture.actions.savedName.value).toBeNull()

      await fixture.actions.remove('新')
      expect(fixture.actions.error.value).toBe('')
      expect(fixture.actions.templates.value).toEqual([])
    } finally {
      fixture.stop()
    }
  })

  it('写操作进行中不重复提交，完成后清除忙状态', async () => {
    const fixture = setup()
    try {
      const first = fixture.actions.save({ name: '新', style: { stroke: '#abcdef' } })
      const second = fixture.actions.save({ name: '另一个', style: { stroke: '#654321' } })
      expect(fixture.actions.busy.value).toBe(true)
      expect(await second).toBe(false)
      expect(await first).toBe(true)
      expect(fixture.actions.busy.value).toBe(false)
    } finally {
      fixture.stop()
    }
  })
})
