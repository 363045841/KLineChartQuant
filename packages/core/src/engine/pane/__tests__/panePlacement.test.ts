/** 新建 Pane 组合命令：成功保留容器，任一步失败都不留下空 Pane。 */
import { describe, expect, it, vi } from 'vitest'
import { runInNewPane } from '../impl/panePlacement'

/** 构造只记录调用的 Pane 端口；createdPaneId 为 null 模拟锚点无效。 */
function createPort(createdPaneId: string | null = 'pane-1') {
  return {
    addPane: vi.fn(() => createdPaneId),
    removePane: vi.fn(() => true),
  }
}

describe('runInNewPane', () => {
  it('迁移成功时保留新 Pane', () => {
    const port = createPort()
    const run = vi.fn(() => true)

    expect(runInNewPane(port, 'main', 'below', run)).toBe(true)
    expect(port.addPane).toHaveBeenCalledWith('main', 'below')
    expect(run).toHaveBeenCalledWith('pane-1')
    expect(port.removePane).not.toHaveBeenCalled()
  })

  it('锚点无效时不执行迁移', () => {
    const port = createPort(null)
    const run = vi.fn(() => true)

    expect(runInNewPane(port, 'main', 'below', run)).toBe(false)
    expect(run).not.toHaveBeenCalled()
  })

  it('迁移失败时回收刚建的 Pane', () => {
    const port = createPort()

    expect(runInNewPane(port, 'main', 'below', () => false)).toBe(false)
    expect(port.removePane).toHaveBeenCalledWith('pane-1')
  })
})
