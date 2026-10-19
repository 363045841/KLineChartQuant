/** 足迹草稿的隔离、取消、重置与分行显示条件回归。 */
import { FOOTPRINT_ROW_MODES, FOOTPRINT_SHAPE } from '@363045841yyt/klinechart-core'
import type { ChartSettings } from '@363045841yyt/klinechart-core/config'
import { expect, it } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useFootprintSettings } from '../useFootprintSettings.js'

it('isolates footprint edits, restores cancelled drafts and resets only footprint params', async () => {
  const open = ref(true)
  const initial: ChartSettings = {
    klineShape: FOOTPRINT_SHAPE,
    footprintRowMode: FOOTPRINT_ROW_MODES.Fixed,
    footprintTicksPerRow: 500,
    displayTimeZone: 'local',
  }
  const scope = effectScope()
  try {
    const editor = scope.run(() =>
      useFootprintSettings(
        () => open.value,
        () => initial,
      ),
    )!
    expect(editor.items.value.map((item) => item.key)).toContain('footprintTicksPerRow')
    expect(editor.items.value.map((item) => item.key)).not.toContain('footprintRowPeriod')
    expect(editor.items.value.map((item) => item.key)).not.toContain('displayTimeZone')

    editor.settings.value.footprintTicksPerRow = 700
    expect(editor.snapshot().footprintTicksPerRow).toBe(700)
    expect(editor.snapshot()).not.toHaveProperty('displayTimeZone')
    expect(editor.snapshot()).not.toHaveProperty('klineShape')
    expect(initial.footprintTicksPerRow).toBe(500)

    open.value = false
    await nextTick()
    open.value = true
    await nextTick()
    expect(editor.settings.value.footprintTicksPerRow).toBe(500)

    editor.reset()
    expect(editor.settings.value.displayTimeZone).toBe('local')
    expect(editor.settings.value.klineShape).toBe(FOOTPRINT_SHAPE)
    expect(editor.items.value.map((item) => item.key)).toContain('footprintRowPeriod')
    expect(editor.items.value.map((item) => item.key)).not.toContain('footprintTicksPerRow')
  } finally {
    scope.stop()
  }
})
