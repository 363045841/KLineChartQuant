/** 画布浮条模板门面用例：选区字段交集、应用写入与仅单选可保存。 */

import type { DrawingStyle } from '@363045841yyt/klinechart-core/controllers'
import type { DrawingTemplate } from '@363045841yyt/klinechart-core/engine/drawing'
import { describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { createDrawingObject } from '../../__tests__/_drawingFixture.js'
import { createMemoryTemplateStore } from '../../__tests__/_templateStoreFixture.js'
import { useCanvasDrawingTemplates } from './useCanvasDrawingTemplates.js'

function setup(seed: Record<string, DrawingTemplate[]> = {}) {
  const selection = ref([createDrawingObject('first')])
  const editable = ref<ReadonlyArray<keyof DrawingStyle>>(['stroke'])
  const updateStyle = vi.fn<(style: Partial<DrawingStyle>) => void>()
  const updateLabel = vi.fn()
  const { store } = createMemoryTemplateStore(seed)
  const scope = effectScope()
  const actions = scope.run(() =>
    useCanvasDrawingTemplates(selection, editable, updateStyle, updateLabel, store),
  )!
  return { selection, editable, updateStyle, updateLabel, actions, stop: () => scope.stop() }
}

describe('canvas drawing templates', () => {
  it('按可编辑字段交集应用样式与已有文本位置', async () => {
    const template = {
      name: 'saved',
      style: { stroke: '#123456', fill: '#654321', strokeWidth: 3, strokeStyle: 'dashed' as const },
      labelPosition: 'end' as const,
    }
    const fixture = setup({ 'trend-line': [template] })
    try {
      fixture.editable.value = ['stroke', 'strokeWidth', 'strokeStyle']
      fixture.selection.value[0]!.labels = {
        line: { '0': { text: 'note', position: 'start' } },
        area: {},
      }
      await fixture.actions.reload()
      expect(fixture.actions.names.value).toEqual(['saved'])

      fixture.actions.apply('saved')
      expect(fixture.updateStyle).toHaveBeenCalledWith({
        stroke: '#123456',
        strokeWidth: 3,
        strokeStyle: 'dashed',
      })
      expect(fixture.updateLabel).toHaveBeenCalledWith('first', 'line', 0, 'note', 'end')
    } finally {
      fixture.stop()
    }
  })

  it('保存与同名更新写回列表，多选不提供保存', async () => {
    const fixture = setup()
    try {
      fixture.editable.value = ['stroke', 'strokeWidth']
      fixture.selection.value[0]!.style = { stroke: '#abcdef', strokeWidth: 2 }
      await fixture.actions.reload()
      await fixture.actions.save('新模板')
      expect(fixture.actions.names.value).toEqual(['新模板'])

      fixture.selection.value[0]!.style.stroke = '#000000'
      await fixture.actions.saveExisting('新模板')
      expect(fixture.actions.names.value).toEqual(['新模板'])
      expect(fixture.actions.savedName.value).toBe('新模板')

      fixture.selection.value = [createDrawingObject('first'), createDrawingObject('second')]
      await nextTick()
      fixture.actions.openSave()
      expect(fixture.actions.showSave.value).toBe(false)
      await fixture.actions.save('多选')
      expect(fixture.actions.names.value).toEqual(['新模板'])
    } finally {
      fixture.stop()
    }
  })

  it('删除模板后列表同步移除', async () => {
    const fixture = setup({ 'trend-line': [{ name: '一', style: { stroke: '#123456' } }] })
    try {
      await fixture.actions.reload()
      await fixture.actions.remove('一')
      expect(fixture.actions.names.value).toEqual([])
    } finally {
      fixture.stop()
    }
  })
})
