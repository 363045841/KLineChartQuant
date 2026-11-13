/** 通用侧边面板的对外契约：面板定义、停靠侧与持久化端口。 */

import type { Component } from 'vue'

/** 侧边菜单栏的一项；每个面板对应同名内容插槽 `panel-<id>`。 */
export interface SidePanelDefinition {
  /** 面板稳定标识，同时决定内容插槽名。 */
  readonly id: string
  /** 菜单按钮文案，同时用于工具提示与无障碍名称。 */
  readonly label: string
  /** 菜单栏图标组件。 */
  readonly icon: Component
}

/** 侧边面板的停靠侧。 */
export type SidePanelSide = 'left' | 'right'

/** 面板宽度持久化端口；桌面端可替换存储介质。 */
export interface SidePanelWidthStorage {
  load(): number | null | undefined
  save(width: number): void
}

/** 面板停靠侧持久化端口。 */
export interface SidePanelSideStorage {
  load(): SidePanelSide | null | undefined
  save(side: SidePanelSide): void
}

/** 面板内容插槽作用域：面板内容不持有壳层状态，只能通过它关闭或换边。 */
export interface SidePanelSlotProps {
  /** 当前停靠侧，供面板内部图标方向与布局使用。 */
  readonly side: SidePanelSide
  close(): void
  toggleSide(): void
}
