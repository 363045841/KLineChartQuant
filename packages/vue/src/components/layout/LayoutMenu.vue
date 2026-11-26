<!-- 布局管理菜单：普通按钮作为锚点，保存、创建与布局列表在同一面板内，命名走弹窗。 -->
<template>
  <button v-bind="menu.buttonProps.value" type="button" class="control-button" :disabled="!controller">
    <span class="symbol-chip__code">{{ currentName }}{{ dirty ? ' *' : '' }}</span>
  </button>

  <MenuSurface
    v-bind="menu.menuProps.value"
    :label="currentName"
    :groups="groups"
    :message="message"
    empty-text="暂无布局"
    placement="bottom"
    semantics="dialog"
    keep-open-on-select
    @open="refresh"
    @select="onSelect"
  >
    <template #item="{ group, item, select }">
      <button
        type="button"
        :aria-pressed="rowPressed(item)"
        class="drop-menu__item-main"
        :disabled="item.disabled"
        @click="select"
      >
        <IconDeviceFloppy v-if="group.id === LAYOUT_MENU.group.actions" aria-hidden="true" />
        <IconPlus v-else-if="group.id === LAYOUT_MENU.group.create" aria-hidden="true" />
        <span>{{ item.label }}</span>
      </button>
    </template>
    <template #item-status="{ item }">
      <span v-if="item.id === LAYOUT_MENU.item.autosave" class="drop-menu__switch">
        <ToggleSwitchTrack size="compact" :checked="autoSave" />
      </span>
      <span v-else-if="item.id === LAYOUT_MENU.item.save && saved" class="drop-menu__status" role="status" aria-label="布局保存成功"><IconCheck aria-hidden="true" /></span>
    </template>
    <template #item-action="{ group, item }">
      <button
        v-if="group.id === LAYOUT_MENU.group.layouts"
        type="button"
        :disabled="busy"
        :aria-label="`复制 ${item.label}`"
        @click.stop="openNaming('duplicate', { id: item.id, name: item.label })"
      ><IconCopy aria-hidden="true" /></button>
      <button
        v-if="group.id === LAYOUT_MENU.group.layouts"
        type="button"
        :disabled="busy"
        :aria-label="`重命名 ${item.label}`"
        @click.stop="openNaming('rename', { id: item.id, name: item.label })"
      ><IconPencil aria-hidden="true" /></button>
      <button
        v-if="group.id === LAYOUT_MENU.group.layouts && item.deletable"
        type="button"
        class="drop-menu__action--danger"
        :disabled="busy"
        :aria-label="`删除 ${item.label}`"
        @click.stop="remove(item.id)"
      ><IconTrash aria-hidden="true" /></button>
    </template>
  </MenuSurface>

  <LayoutNameDialog
    :show="naming !== null"
    :title="namingTitle"
    :confirm-label="namingConfirmLabel"
    :initial-name="naming?.initialName ?? ''"
    :busy="busy"
    :error="namingError"
    @close="closeNaming"
    @submit="submitNaming"
  />
</template>

<script setup lang="ts">
  import '@vue-src/components/common/menu/control-button.css'

  import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
  import ToggleSwitchTrack from '@vue-src/components/common/form/ToggleSwitchTrack.vue'
  import type { DropMenuItem } from '@vue-src/components/common/menu/dropMenuTypes.js'
  import MenuSurface from '@vue-src/components/common/menu/MenuSurface.vue'
  import { useMenuButton } from '@vue-src/components/common/menu/useMenuButton.js'
  import { LAYOUT_MENU, useLayouts } from '@vue-src/composables/chart/useLayouts.js'
  import { toRef } from 'vue'
  import IconCheck from '~icons/tabler/check'
  import IconCopy from '~icons/tabler/copy'
  import IconDeviceFloppy from '~icons/tabler/device-floppy'
  import IconPencil from '~icons/tabler/pencil'
  import IconPlus from '~icons/tabler/plus'
  import IconTrash from '~icons/tabler/trash'
  import LayoutNameDialog from './LayoutNameDialog.vue'

  const props = defineProps<{ controller: ChartController | null }>()
  const menu = useMenuButton(undefined, 'dialog')
  const {
    groups,
    currentName,
    busy,
    saved,
    message,
    autoSave,
    dirty,
    naming,
    namingTitle,
    namingConfirmLabel,
    namingError,
    refresh,
    onSelect,
    openCreate,
    openNaming,
    closeNaming,
    submitNaming,
    remove,
  } = useLayouts(toRef(props, 'controller'))

  /** 开关与单选共用按钮的按下态；命令项不设置 aria-pressed。 */
  function rowPressed(item: DropMenuItem): boolean | undefined {
    return item.id === LAYOUT_MENU.item.autosave ? autoSave.value : item.checked
  }
</script>

<style scoped>
  .symbol-chip__code { display: block; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
