// 对象树图元右键菜单：行来源判定、目标快照、打开位置与快捷键文案共用。
import type { CommandRegistry, DrawingObject, PaneObjectRow } from '@363045841yyt/klinechart-core'
import { drawingObjectLayerId } from '@363045841yyt/klinechart-core/engine/drawing'
import { mount } from '@vue/test-utils'
import { createMockChartController } from '@vue-src/__tests__/_mockController.js'
import { DRAWING_CONTEXT_MENU_ITEM } from '@vue-src/composables/chart/useDrawingContextMenu.js'
import { provideChartCommands } from '@vue-src/composables/commands/useCommands.js'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, shallowRef } from 'vue'
import {
  type DrawingContextMenuHandle,
  useObjectTreeContextMenu,
} from './useObjectTreeContextMenu.js'

const COPY_COMMAND = 'drawing.copy'

/** 构造对象树行；只声明判定与快照相关的字段。 */
function row(sourceId: string, kind: PaneObjectRow['kind']): PaneObjectRow {
  return {
    // 图元行按 Scene 图层身份寻址，领域身份独立透传。
    objectId: kind === 'drawing' ? drawingObjectLayerId(sourceId) : sourceId,
    sourceId,
    kind,
    label: sourceId,
    paneId: 'main',
    band: 'drawing',
    z: 0,
    visible: true,
    locked: false,
    capabilities: {
      removable: true,
      hideable: true,
      orderable: true,
      movable: false,
      lockable: true,
    },
  }
}

/** 构造测试图元；只声明与默认值不同的差异项。 */
function drawing(id: string): DrawingObject {
  return {
    id,
    kind: 'horizontal-line',
    paneId: 'main',
    visible: true,
    anchors: [{ id: `${id}:0`, price: 10 }],
    params: {},
    style: { stroke: '#fff' },
  }
}

/** 父级提供命令表，子组件使用对象树菜单，与正式运行结构一致。 */
function mountContextMenu(controller: ReturnType<typeof createMockChartController>) {
  const menu = { openAt: vi.fn() }
  let api!: ReturnType<typeof useObjectTreeContextMenu>
  let registry!: CommandRegistry
  const Child = defineComponent({
    setup() {
      api = useObjectTreeContextMenu(
        shallowRef(controller),
        shallowRef<DrawingContextMenuHandle | null>(menu),
      )
      return () => null
    },
  })
  const Host = defineComponent({
    setup() {
      registry = provideChartCommands()
      registry.register([
        {
          id: COPY_COMMAND,
          group: 'drawing',
          title: { zh: '复制图元', en: 'Copy drawings' },
          shortcut: 'Mod+C',
          run: () => {},
        },
      ])
      return () => h(Child)
    },
  })
  const wrapper = mount(Host)
  return { api, menu, registry, wrapper }
}

/** 指针右键事件；坐标用于断言菜单打开位置。 */
function contextMenuEvent(): MouseEvent {
  return new MouseEvent('contextmenu', { clientX: 12, clientY: 34, cancelable: true })
}

describe('对象树图元右键菜单', () => {
  it('图元行接管右键，快照目标并在指针处打开菜单', () => {
    const controller = createMockChartController()
    controller._setDrawings([drawing('a')])
    const setSelectedDrawingIds = vi.fn()
    controller.setSelectedDrawingIds = setSelectedDrawingIds
    const { api, menu, wrapper } = mountContextMenu(controller)
    const event = contextMenuEvent()

    expect(api.openRowContextMenu(event, row('a', 'drawing'))).toBe(true)
    expect(event.defaultPrevented).toBe(true)
    expect(setSelectedDrawingIds).toHaveBeenCalledWith(['a'])
    expect(menu.openAt).toHaveBeenCalledWith(12, 34)
    wrapper.unmount()
  })

  it('非图元行不接管，保留浏览器菜单', () => {
    const { api, menu, wrapper } = mountContextMenu(createMockChartController())
    const event = contextMenuEvent()

    expect(api.openRowContextMenu(event, row('i', 'indicator'))).toBe(false)
    expect(event.defaultPrevented).toBe(false)
    expect(menu.openAt).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('复用共同父级命令表的快捷键文案', () => {
    const controller = createMockChartController()
    controller._setDrawings([drawing('a')])
    controller.setSelectedDrawingIds = vi.fn()
    const { api, registry, wrapper } = mountContextMenu(controller)
    api.openRowContextMenu(contextMenuEvent(), row('a', 'drawing'))

    const copy = api.contextMenuGroups.value
      .flatMap((group) => group.items)
      .find((item) => item.id === DRAWING_CONTEXT_MENU_ITEM.COPY)
    expect(copy?.shortcut).toBe(registry.formatShortcut('Mod+C'))
    wrapper.unmount()
  })
})
