/** 验证 Legend 原生 DOM 的低频操作事件与选择器、Pane API 的连接。 */
import {
  LEGEND_ACTION_EVENT,
  type LegendActionDetail,
} from '@363045841yyt/klinechart-core/controllers'
import { describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, shallowRef } from 'vue'
import { useLegendActions } from '../composables/chart/useLegendActions.js'
import { createMockChartController } from './_mockController.js'

describe('Legend DOM actions', () => {
  it('主图及副图操作进入各自 API，替换选择保留来源，销毁时解除监听', async () => {
    const ctrl = createMockChartController()
    const moveMain = vi.spyOn(ctrl, 'moveMainIndicator')
    const replaceMain = vi.spyOn(ctrl, 'replaceMainIndicator')
    const removeMain = vi.spyOn(ctrl, 'removeIndicator')
    const options = {
      removePane: vi.fn(),
      movePane: vi.fn(),
      replacePane: vi.fn(),
      openSelector: vi.fn(),
    }
    const layer = document.createElement('div')
    const scope = effectScope()
    const actions = scope.run(() => useLegendActions(shallowRef(ctrl), shallowRef(layer), options))!
    await nextTick()

    /** 模拟 Core DOM renderer 发出的真实操作事件。 */
    function emit(
      action: LegendActionDetail['action'],
      paneId = 'main',
      definitionId = 'MA',
    ): void {
      layer.dispatchEvent(
        new CustomEvent(LEGEND_ACTION_EVENT, { detail: { action, paneId, definitionId } }),
      )
    }
    emit('move-up')
    emit('move-down')
    expect(moveMain.mock.calls).toEqual([
      ['MA', 'up'],
      ['MA', 'down'],
    ])
    emit('close')
    expect(removeMain).toHaveBeenCalledWith('MA')
    emit('replace')
    expect(actions.replacementRole.value).toBe('main')
    expect(actions.replacementId.value).toBe('MA')
    actions.replaceLegend('MA', 'BOLL')
    expect(replaceMain).toHaveBeenCalledWith('MA', 'BOLL')
    expect(actions.replacementId.value).toBeNull()

    emit('move-up', 'sub_RSI', 'RSI')
    emit('move-down', 'sub_RSI', 'RSI')
    expect(options.movePane.mock.calls).toEqual([
      ['sub_RSI', 'up'],
      ['sub_RSI', 'down'],
    ])
    emit('close', 'sub_RSI', 'RSI')
    expect(options.removePane).toHaveBeenCalledWith('sub_RSI')
    emit('replace', 'sub_RSI', 'RSI')
    expect(actions.replacementRole.value).toBe('sub')
    actions.replaceLegend('sub_RSI', 'MACD')
    expect(options.replacePane).toHaveBeenCalledWith('sub_RSI', 'MACD')
    expect(options.openSelector).toHaveBeenCalledTimes(2)

    scope.stop()
    emit('close')
    expect(removeMain).toHaveBeenCalledTimes(1)
  })
})
