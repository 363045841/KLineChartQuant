/**
 * 脚本右键菜单的视图逻辑：把 ScriptMenuModel 映射成受控菜单面板。
 * 打开状态与坐标直接来自模型，面板只按 open 与 anchor 渲染。
 */
import type { DropMenuGroup } from '@vue-src/components/common/DropMenu.vue'
import type { MenuAnchor } from '@vue-src/components/common/dropMenuTypes.js'
import { computed, useTemplateRef } from 'vue'
import type { ScriptMenuModel, ScriptMenuState } from './scriptMenuModel.js'

/** 只声明本组件用到的 DropMenu 实例能力，避免绑定具体组件类型。 */
interface ScriptMenuPanelInstance {
  readonly element: HTMLElement | null
}

export function useScriptMenuPanel(model: ScriptMenuModel) {
  const menu = useTemplateRef<ScriptMenuPanelInstance>('menu')
  const state = model.state
  const content = computed(() => state.value?.content ?? null)
  const groups = computed<ReadonlyArray<DropMenuGroup>>(() => buildGroups(state.value))
  const bodyMode = computed(() => content.value !== null && content.value.kind !== 'menu')
  const label = computed(() => state.value?.label ?? '脚本菜单')
  const focusTarget = computed(() => state.value?.returnFocus ?? null)
  const open = computed(() => state.value !== null)
  const anchor = computed<MenuAnchor | null>(() =>
    state.value === null ? null : { kind: 'point', x: state.value.x, y: state.value.y },
  )

  /** 面板打开后登记自身元素，快捷键据此忽略菜单内部按键。 */
  function onOpen(): void {
    model.panelElement.value = menu.value?.element ?? null
  }

  /** 面板自行关闭（外部点击 / Escape）时同步模型，焦点由 DropMenu 归还。 */
  function onUpdateOpen(next: boolean): void {
    if (next || !model.isOpen) return
    model.panelElement.value = null
    model.handleUiClose()
  }

  function onSelect(_groupId: string, itemId: string): void {
    void model.run(itemId)
  }

  return {
    menu,
    content,
    groups,
    bodyMode,
    label,
    focusTarget,
    open,
    anchor,
    onOpen,
    onUpdateOpen,
    onSelect,
  }
}

/** 按 separatorBefore 把条目切成 DropMenu 分组，组间由面板画分隔线。 */
function buildGroups(state: ScriptMenuState | null): ReadonlyArray<DropMenuGroup> {
  const items = state?.content.kind === 'menu' ? state.content.items : []
  const groups: Array<{ id: string; label: string; items: DropMenuGroup['items'][number][] }> = []
  for (const item of items) {
    let group = groups.at(-1)
    if (!group || item.separatorBefore) {
      group = { id: `group-${groups.length}`, label: '', items: [] }
      groups.push(group)
    }
    group.items.push({
      id: item.id,
      label: item.label,
      shortcut: item.shortcut,
      disabled: item.disabled,
      reason: item.reason,
    })
  }
  return groups
}
