<!-- 菜单项按钮：顶层与二级菜单共用一份渲染，角色、勾选和快捷键只在这里定义一次。 -->
<template>
  <button
    type="button"
    class="drop-menu__item-main klc-motion-icon-feedback"
    :role="menuItemRole"
    :aria-checked="item.checked === undefined ? undefined : item.checked"
    :aria-haspopup="item.children?.length ? 'menu' : undefined"
    :aria-expanded="item.children?.length ? expanded : undefined"
    :disabled="item.disabled"
    :title="item.disabled ? item.reason : undefined"
    @click="emit('activate')"
  >
    <span v-if="showIcon" class="drop-menu__icon">
      <component :is="item.icon" v-if="item.icon" aria-hidden="true" />
    </span>
    <span>{{ item.label }}</span>
    <span v-if="item.shortcut" class="drop-menu__shortcut">{{ item.shortcut }}</span>
    <span v-if="item.children?.length" class="drop-menu__submenu-arrow">
      <IconTablerChevronRight aria-hidden="true" />
    </span>
    <span v-if="item.checked !== undefined" class="drop-menu__check" aria-hidden="true">
      <IconTablerCheck v-if="item.checked" />
    </span>
  </button>
</template>

<script setup lang="ts">
  import IconTablerCheck from '~icons/tabler/check'
  import IconTablerChevronRight from '~icons/tabler/chevron-right'
  import { computed } from 'vue'
  import type { DropMenuItem } from './dropMenuTypes.js'

  const props = defineProps<{
    item: DropMenuItem
    /** 菜单里存在图标时保留图标槽位，避免行与行之间文案左右跳动。 */
    showIcon: boolean
    /** 含子菜单的行展开态；其它行不设置。 */
    expanded?: boolean
  }>()
  const emit = defineEmits<{ activate: [] }>()

  /** 角色由选中语义决定：单选、开关和命令在无障碍树里是三种不同控件。 */
  const menuItemRole = computed(() => {
    if (props.item.selection === 'radio') return 'menuitemradio'
    if (props.item.selection === 'checkbox') return 'menuitemcheckbox'
    return 'menuitem'
  })
</script>
