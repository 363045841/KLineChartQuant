<!-- 菜单项按钮：顶层与二级菜单共用一份渲染；菜单语义与对话框语义的角色在这里分开。 -->
<template>
  <button
    type="button"
    class="drop-menu__item-main klc-motion-icon-feedback"
    v-bind="a11y"
    :aria-haspopup="item.children?.length ? 'menu' : undefined"
    :aria-expanded="item.children?.length ? expanded : undefined"
    :disabled="item.disabled"
    :title="item.disabled ? item.reason : undefined"
    @click="emit('activate')"
  >
    <span
      v-if="showIcon"
      class="drop-menu__icon"
      :class="{ 'drop-menu__icon--dot': item.dot !== undefined && item.icon === undefined }"
    >
      <component :is="item.icon" v-if="item.icon" aria-hidden="true" />
      <span
        v-else-if="item.dot"
        class="drop-menu__dot"
        :style="{ background: item.dot }"
        aria-hidden="true"
      />
    </span>
    <span>{{ item.label }}</span>
    <span v-if="item.shortcut" class="drop-menu__shortcut">{{ item.shortcut }}</span>
    <span v-if="item.children?.length" class="drop-menu__submenu-arrow">
      <IconTablerChevronRight aria-hidden="true" />
    </span>
    <DropMenuCheck v-if="showCheck" :checked="item.checked" />
  </button>
</template>

<script setup lang="ts">
  import './drop-menu-item.css'
  import IconTablerChevronRight from '~icons/tabler/chevron-right'
  import { computed } from 'vue'
  import DropMenuCheck from './DropMenuCheck.vue'
  import type { DropMenuItem, MenuPopupSemantics } from './dropMenuTypes.js'

  const props = withDefaults(
    defineProps<{
      item: DropMenuItem
      /** 菜单里存在图标时保留图标槽位，避免行与行之间文案左右跳动。 */
      showIcon: boolean
      /** 顶层行由行尾座位统一渲染勾选；二级菜单没有座位，仍由这里渲染。 */
      showCheck?: boolean
      /** 含子菜单的行展开态；其它行不设置。 */
      expanded?: boolean
      /** 面板语义：menu 用 menuitem 角色，dialog 用普通按钮 + aria-pressed。 */
      semantics?: MenuPopupSemantics
    }>(),
    { showCheck: true, semantics: 'menu' },
  )
  const emit = defineEmits<{ activate: [] }>()

  /** menu 用 menuitem 角色和 aria-checked；dialog 用原生按钮和 aria-pressed。 */
  const a11y = computed(() => {
    if (props.semantics === 'dialog') {
      return { role: undefined, 'aria-checked': undefined, 'aria-pressed': props.item.checked }
    }
    const role =
      props.item.selection === 'radio'
        ? 'menuitemradio'
        : props.item.selection === 'checkbox'
          ? 'menuitemcheckbox'
          : 'menuitem'
    return { role, 'aria-checked': props.item.checked, 'aria-pressed': undefined }
  })
</script>
