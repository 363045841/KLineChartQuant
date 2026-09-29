import type { DrawingStyle } from '@363045841yyt/klinechart-core/controllers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'

import { createDrawingObject } from '../../__tests__/_drawingFixture.js'
import {
  loadDrawingTemplates,
  saveDrawingTemplates,
} from '../../components/drawing-settings/templates.js'
import { useCanvasDrawingTemplates } from './useCanvasDrawingTemplates.js'

vi.mock('../../components/drawing-settings/templates.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../components/drawing-settings/templates.js')>()),
  loadDrawingTemplates: vi.fn(),
  saveDrawingTemplates: vi.fn(),
}))

const load = vi.mocked(loadDrawingTemplates)
const persist = vi.mocked(saveDrawingTemplates)

function setupTemplates() {
  const selection = ref([createDrawingObject('first')])
  const editable = ref<ReadonlyArray<keyof DrawingStyle>>(['stroke'])
  const update = vi.fn<(style: Partial<DrawingStyle>) => void>()
  const scope = effectScope()
  const actions = scope.run(() => useCanvasDrawingTemplates(selection, editable, update))!
  return { selection, editable, update, actions, stop: () => scope.stop() }
}

afterEach(() => {
  vi.resetAllMocks()
})

describe('canvas drawing templates', () => {
  it('shares the existing color templates, filters unsafe fields and only saves a single selection', async () => {
    const template = { name: 'saved', style: { stroke: '#123456', fill: '#654321' } }
    load.mockResolvedValue([template])
    persist.mockResolvedValue(true)
    const fixture = setupTemplates()
    try {
      await fixture.actions.reload()
      expect(fixture.actions.names.value).toEqual(['saved'])
      await fixture.actions.apply('saved')
      expect(fixture.update).toHaveBeenCalledWith({ stroke: '#123456' })

      fixture.selection.value = [createDrawingObject('first'), createDrawingObject('second')]
      await nextTick()
      fixture.actions.openSave()
      expect(fixture.actions.showSave.value).toBe(false)
      await fixture.actions.save('new')
      expect(persist).not.toHaveBeenCalled()

      fixture.selection.value = [createDrawingObject('first')]
      fixture.selection.value[0]!.style.stroke = '#abcdef'
      await nextTick()
      fixture.actions.openSave()
      expect(fixture.actions.showSave.value).toBe(true)
      await fixture.actions.save('new')
      expect(persist).toHaveBeenCalledWith('trend-line', [
        template,
        { name: 'new', style: { stroke: '#abcdef' } },
      ])
    } finally {
      fixture.stop()
    }
  })

  it('discards a template load that finishes after the drawing selection changes', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof loadDrawingTemplates>>) => void
    load.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const fixture = setupTemplates()
    try {
      const pending = fixture.actions.reload()
      fixture.selection.value = [createDrawingObject('second')]
      await nextTick()
      resolve([{ name: 'stale', style: { stroke: '#123456' } }])
      await pending
      expect(fixture.actions.names.value).toEqual([])
    } finally {
      fixture.stop()
    }
  })
})
