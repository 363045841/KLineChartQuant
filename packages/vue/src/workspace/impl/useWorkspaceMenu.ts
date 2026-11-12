/** 应用菜单的操作与弹窗状态；外观交互复用 ThemeModeControl。 */
import type { DropMenuGroup } from '@vue-src/components/common/DropMenu.vue'
import { ref } from 'vue'

const APPLICATION_GROUP = 'application'
const ABOUT_ITEM = 'about'
const groups: ReadonlyArray<DropMenuGroup> = [
  { id: APPLICATION_GROUP, label: '', items: [{ id: ABOUT_ITEM, label: '关于' }] },
]

/** 关于弹窗的开关归触发它的菜单所有。 */
export function useWorkspaceMenu() {
  const aboutOpen = ref(false)

  /** 仅处理本菜单声明的操作。 */
  function select(groupId: string, itemId: string): void {
    if (groupId === APPLICATION_GROUP && itemId === ABOUT_ITEM) aboutOpen.value = true
  }
  return { groups, aboutOpen, select }
}
