/** 新窗口迁移的异常原子性：真实布局命令回收临时容器并保留原始错误。 */
import { describe, expect, it } from 'vitest'
import { createIndicatorState } from '@/engine/state/indicatorState.js'
import { createPaneState } from '@/engine/state/paneState.js'
import { PaneManager } from '../impl/paneManager.js'
import { runInNewPane } from '../impl/panePlacement.js'

describe('新窗口迁移事务', () => {
  it('迁移抛异常时布局恢复到原状，调用方收到同一个错误', () => {
    const pane = createPaneState()
    pane.actions.commitLayout([{ id: 'pane-7', ratio: 1 }])
    const manager = new PaneManager({
      pane,
      indicator: createIndicatorState(),
      getDefinition: () => undefined,
      hasPaneContent: () => false,
    })
    const error = new Error('对象轴绑定非法')
    expect(() =>
      runInNewPane(manager.actions, 'pane-7', 'below', () => {
        throw error
      }),
    ).toThrow(error)
    expect(manager.actions.getLayoutSpecs()).toEqual([{ id: 'pane-7', ratio: 1 }])
  })
})
