/** 菜单项与分组的共享契约；菜单、子菜单和调用方都读这一份。 */
import type { Component } from 'vue'

/** 选中语义：单选一组互斥，开关各自独立且再次点击即取消。 */
export type DropMenuSelection = 'radio' | 'checkbox'

interface DropMenuItemBase {
  id: string
  label: string
  disabled?: boolean
  active?: boolean
  /** 左侧图标；菜单内所有项都没有图标时不保留图标槽位。 */
  icon?: Component
  /** 键盘快捷键文本；右侧弱化展示，由调用方决定是否提供。 */
  shortcut?: string
  /** 禁用原因；默认按钮通过 title 展示。 */
  reason?: string
  /** 管理菜单用来决定是否展示删除操作；普通列表可省略。 */
  deletable?: boolean
  /** 二级菜单项；存在时该行只展开子菜单，不触发 select。 */
  children?: ReadonlyArray<DropMenuItem>
}

/**
 * 菜单项：有勾选态就必须声明单选还是开关，命令项两者都不提供。
 *
 * `checked` 单独出现无法区分"单选已选中"和"开关已打开"，两者点击语义相反，
 * 所以由类型强制成对出现，避免调用方各自解释。
 */
export type DropMenuItem = DropMenuItemBase &
  (
    | { checked?: undefined; selection?: undefined }
    | { checked: boolean; selection: DropMenuSelection }
  )

export interface DropMenuGroup {
  id: string
  label: string
  items: ReadonlyArray<DropMenuItem>
}
