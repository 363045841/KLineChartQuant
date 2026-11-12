// 图元右键菜单：来源判定、操作范围快照与五个 Core API 的分发。
import { createCommandRegistry, type DrawingObject } from '@363045841yyt/klinechart-core'
import { createMockChartController } from '@vue-src/__tests__/_mockController'
import { describe, expect, it, vi } from 'vitest'
import { shallowRef } from 'vue'
import {
  DRAWING_CONTEXT_MENU_ITEM,
  resolveContextMenuSource,
  useDrawingContextMenu,
} from '../useDrawingContextMenu'

const COPY_COMMAND = 'drawing.copy'
const CLONE_COMMAND = 'drawing.clone'

/** 构造测试图元；只声明与默认值不同的差异项。 */
function drawing(id: string, extra: Partial<DrawingObject> = {}): DrawingObject {
  return {
    id,
    kind: 'horizontal-line',
    paneId: 'main',
    visible: true,
    anchors: [{ id: `${id}:0`, price: 10 }],
    params: {},
    style: { stroke: '#fff' },
    ...extra,
  }
}

/** 用真实命令注册表装配菜单，动作落到控制器 API。 */
function createFixture() {
  const controller = createMockChartController()
  controller._setDrawings([drawing('a'), drawing('b')])
  const copyDrawingsToClipboard = vi.fn((): boolean => true)
  controller.copyDrawingsToClipboard = copyDrawingsToClipboard
  const copyDrawings = vi.fn((): ReadonlyArray<DrawingObject> => [])
  controller.copyDrawings = copyDrawings
  const updateBatch = vi.fn((): ReadonlyArray<DrawingObject> => [])
  controller.updateBatch = updateBatch
  const removeBatch = vi.fn((): boolean => true)
  controller.removeBatch = removeBatch
  const setSelectedDrawingIds = vi.fn()
  controller.setSelectedDrawingIds = setSelectedDrawingIds

  const registry = createCommandRegistry()
  registry.register([
    {
      id: COPY_COMMAND,
      group: 'drawing',
      title: { zh: '复制图元', en: 'Copy drawings' },
      shortcut: 'Mod+C',
      run: () => {},
    },
    {
      id: CLONE_COMMAND,
      group: 'drawing',
      title: { zh: '克隆图元', en: 'Clone drawings' },
      run: () => {},
    },
  ])
  const menu = useDrawingContextMenu({ controller: shallowRef(controller), commands: registry })
  return {
    controller,
    registry,
    menu,
    copyDrawingsToClipboard,
    copyDrawings,
    updateBatch,
    removeBatch,
    setSelectedDrawingIds,
  }
}

/** 展平全部分组，避免用例依赖分组边界。 */
function items(menu: ReturnType<typeof useDrawingContextMenu>) {
  return menu.groups.value.flatMap((group) => group.items)
}

describe('绘图图元右键菜单', () => {
  it('按命中结果区分图表与图元来源', () => {
    const target = drawing('a')
    expect(resolveContextMenuSource(null, 0, 0)).toEqual({ kind: 'chart' })
    expect(resolveContextMenuSource({ hitTestAt: () => target }, 10, 20)).toEqual({
      kind: 'drawing',
      drawingId: 'a',
    })
  })

  it('按 group 拆分，并复用复制与克隆的命令快捷键文案', () => {
    const { menu, registry } = createFixture()
    menu.capture('a')

    expect(menu.groups.value.map((group) => group.id)).toEqual(['copy', 'visibility', 'remove'])
    expect(items(menu).map((item) => item.label)).toEqual(['复制', '克隆', '锁定', '隐藏', '移除'])
    expect(items(menu)[0]?.shortcut).toBe(registry.formatShortcut('Mod+C'))
    expect(items(menu)[1]?.shortcut).toBeUndefined()
  })

  it('未选中图元只操作自身，并把选中态同步到同一范围', () => {
    const { menu, setSelectedDrawingIds } = createFixture()
    menu.capture('a')

    expect(setSelectedDrawingIds).toHaveBeenCalledWith(['a'])
  })

  it('已选中图元保留整组操作范围', () => {
    const {
      controller,
      menu,
      setSelectedDrawingIds,
      copyDrawingsToClipboard,
      copyDrawings,
      updateBatch,
      removeBatch,
    } = createFixture()
    controller._setSelectedDrawingIds(['a', 'b'])
    menu.capture('a')

    expect(setSelectedDrawingIds).not.toHaveBeenCalled()
    menu.select(DRAWING_CONTEXT_MENU_ITEM.COPY)
    expect(copyDrawingsToClipboard).toHaveBeenCalledWith(['a', 'b'])
    menu.select(DRAWING_CONTEXT_MENU_ITEM.CLONE)
    expect(copyDrawings).toHaveBeenCalledWith(['a', 'b'])
    menu.select(DRAWING_CONTEXT_MENU_ITEM.LOCK)
    expect(updateBatch).toHaveBeenCalledWith(['a', 'b'], { locked: true })
    menu.select(DRAWING_CONTEXT_MENU_ITEM.HIDE)
    expect(updateBatch).toHaveBeenCalledWith(['a', 'b'], { visible: false })
    menu.select(DRAWING_CONTEXT_MENU_ITEM.REMOVE)
    expect(removeBatch).toHaveBeenCalledWith(['a', 'b'])
  })

  it('全部锁定时切换为解锁并禁用移除；混合锁定仍执行锁定', () => {
    const { controller, menu, updateBatch } = createFixture()
    controller._setDrawings([drawing('a', { locked: true })])
    menu.capture('a')

    expect(items(menu)[2]?.label).toBe('解锁')
    expect(items(menu)[4]?.disabled).toBe(true)
    menu.select(DRAWING_CONTEXT_MENU_ITEM.LOCK)
    expect(updateBatch).toHaveBeenCalledWith(['a'], { locked: false })

    controller._setDrawings([drawing('a', { locked: true }), drawing('b')])
    controller._setSelectedDrawingIds(['a', 'b'])
    menu.capture('a')
    expect(items(menu)[2]?.label).toBe('锁定')
    expect(items(menu)[4]?.disabled).toBe(false)
    menu.select(DRAWING_CONTEXT_MENU_ITEM.LOCK)
    expect(updateBatch).toHaveBeenLastCalledWith(['a', 'b'], { locked: true })
  })

  it('动作只认打开瞬间的快照，不随之后选中变化', () => {
    const { controller, menu, copyDrawings } = createFixture()
    menu.capture('a')
    controller._setSelectedDrawingIds(['b'])

    menu.select(DRAWING_CONTEXT_MENU_ITEM.CLONE)
    expect(copyDrawings).toHaveBeenCalledWith(['a'])
  })
})
