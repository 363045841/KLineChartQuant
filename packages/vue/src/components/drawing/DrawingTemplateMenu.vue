<!-- 图元模板菜单：普通按钮作为锚点，保存与应用模板共用同一面板。 -->
<template>
  <BaseTooltip :content="label" placement="top" trigger-display="contents" :disabled="disabled">
    <button
      v-bind="menu.buttonProps.value"
      type="button"
      class="control-button"
      :class="buttonClass"
      :aria-label="label"
      :disabled="disabled"
    >
      <slot>{{ label }}</slot>
    </button>
  </BaseTooltip>
  <MenuSurface
    v-bind="menu.menuProps.value"
    :label="label"
    :groups="groups"
    :message="message"
    empty-text="暂无模板"
    @open="emit('open')"
    @select="select"
  >
    <template #item-action="{ group, item }">
      <button
        v-if="group.id === 'apply' && canSave"
        type="button"
        :class="{ 'drop-menu__action--success': item.id === savedName }"
        :aria-label="item.id === savedName ? `已保存模板 ${item.label}` : `保存模板 ${item.label}`"
        :disabled="disabled || item.id === savedName"
        @click.stop="emit('saveExisting', item.id)"
      >
        <IconTablerCheck v-if="item.id === savedName" aria-hidden="true" />
        <IconTablerDeviceFloppy v-else aria-hidden="true" />
      </button>
      <button
        v-if="group.id === 'apply'"
        type="button"
        class="drop-menu__action--danger"
        :aria-label="`删除模板 ${item.label}`"
        :disabled="disabled"
        @click.stop="emit('remove', item.id)"
      ><IconTablerTrash aria-hidden="true" /></button>
    </template>
  </MenuSurface>
</template>

<script setup lang="ts">
  import '@vue-src/components/common/menu/control-button.css'

  import BaseTooltip from '@vue-src/components/common/overlay/BaseTooltip.vue'
  import type { DropMenuGroup } from '@vue-src/components/common/menu/DropMenu.vue'
  import MenuSurface from '@vue-src/components/common/menu/MenuSurface.vue'
  import { useMenuButton } from '@vue-src/components/common/menu/useMenuButton.js'
  import { computed } from 'vue'
  import IconTablerCheck from '~icons/tabler/check'
  import IconTablerDeviceFloppy from '~icons/tabler/device-floppy'
  import IconTablerTrash from '~icons/tabler/trash'

  const props = withDefaults(
    defineProps<{
      label: string
      names: ReadonlyArray<string>
      message?: string
      disabled?: boolean
      canSave?: boolean
      canApply?: boolean
      savedName?: string | null
      /** 锚点按钮的附加外观类；按钮外观由所在区域决定。 */
      buttonClass?: string
      showSave?: boolean
    }>(),
    { disabled: false, canSave: false, canApply: true, savedName: null, showSave: false },
  )
  const emit = defineEmits<{
    open: []
    saveNew: []
    apply: [name: string]
    saveExisting: [name: string]
    remove: [name: string]
  }>()
  const menu = useMenuButton()
  const groups = computed<DropMenuGroup[]>(() => [
    ...(props.showSave
      ? [
          {
            id: 'save',
            label: '保存',
            items: [
              { id: 'save', label: '保存为模板', disabled: props.disabled || !props.canSave },
            ],
          },
        ]
      : []),
    {
      id: 'apply',
      label: '应用模板',
      items: props.names.map((name) => ({
        id: name,
        label: name,
        disabled: props.disabled || !props.canApply,
      })),
    },
  ])
  function select(group: string, name: string) {
    if (group === 'save') emit('saveNew')
    else if (group === 'apply') emit('apply', name)
  }
</script>
